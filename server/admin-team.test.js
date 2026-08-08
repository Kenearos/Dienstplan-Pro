const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dp-adminteam-'));
process.env.RATE_LIMIT_IP = '1000';
delete process.env.SMTP_HOST;
const app = require('./index');
const { db, putDoc } = require('./db');
const { createLoginToken } = require('./auth');

function seedUser(email, isAdmin = 0, name = null) {
  return Number(db.prepare('INSERT INTO users (email,is_admin,created_at,display_name) VALUES (?,?,?,?)')
    .run(email, isAdmin, new Date().toISOString(), name).lastInsertRowid);
}
async function withServer(fn) {
  const server = app.listen(0);
  try { return await fn(server.address().port); } finally { server.close(); }
}
function req(port, p, opts = {}) {
  return fetch(`http://127.0.0.1:${port}${p}`, { redirect: 'manual', ...opts });
}
const json = (o) => ({ headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(o) });
const form = (s) => ({ headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: s });
async function anmelden(port, userId) {
  const raw = createLoginToken(userId);
  const r = await req(port, '/auth/confirm', { method: 'POST', ...form(`token=${raw}`) });
  return r.headers.get('set-cookie').split(';')[0];
}
const mit = (cookie, extra = {}) => ({ ...extra, headers: { ...(extra.headers || {}), Cookie: cookie } });

test('Admin legt Konto mit Namen an; Liste zeigt Name und Zustand', async () => {
  const admin = seedUser('at1@x.de', 1, 'Chef');
  await withServer(async (port) => {
    const c = await anmelden(port, admin);
    let r = await req(port, '/api/admin/users',
      mit(c, { method: 'POST', ...json({ email: 'Neu@Klinik.de', name: 'Alsholi' }) }));
    assert.strictEqual(r.status, 200);

    r = await req(port, '/api/admin/users', mit(c));
    const { users } = await r.json();
    const neu = users.find((u) => u.email === 'neu@klinik.de');
    assert.ok(neu, 'Konto fehlt in der Liste');
    assert.strictEqual(neu.name, 'Alsholi');
    assert.strictEqual(neu.active, true);
  });
});

test('Admin aendert den Anzeigenamen nachtraeglich', async () => {
  const admin = seedUser('at2@x.de', 1, 'Chef2');
  const ziel = seedUser('tippfehler@k.de', 0, 'Alsholy');
  await withServer(async (port) => {
    const c = await anmelden(port, admin);
    const r = await req(port, `/api/admin/users/${ziel}/name`,
      mit(c, { method: 'PUT', ...json({ name: 'Alsholi' }) }));
    assert.strictEqual(r.status, 200);
    assert.strictEqual(db.prepare('SELECT display_name FROM users WHERE id=?').get(ziel).display_name, 'Alsholi');
  });
});

test('Deaktivieren und wieder aktivieren', async () => {
  const admin = seedUser('at3@x.de', 1, 'Chef3');
  const ziel = seedUser('kommtwieder@k.de', 0, 'Rueckkehr');
  await withServer(async (port) => {
    const c = await anmelden(port, admin);
    let r = await req(port, `/api/admin/users/${ziel}/deactivate`, mit(c, { method: 'POST' }));
    assert.strictEqual(r.status, 200);
    assert.strictEqual(db.prepare('SELECT active FROM users WHERE id=?').get(ziel).active, 0);

    r = await req(port, `/api/admin/users/${ziel}/activate`, mit(c, { method: 'POST' }));
    assert.strictEqual(r.status, 200);
    assert.strictEqual(db.prepare('SELECT active FROM users WHERE id=?').get(ziel).active, 1);
  });
});

test('Alt-Namen: der Admin sieht, welche Namen noch keinem Konto gehoeren', async () => {
  const admin = seedUser('at4@x.de', 1, 'Chef4');
  putDoc(admin, 'duties', {
    Giurgiu: { '2026-06': [{ date: '2026-06-09T10:00:00.000Z', share: 1 }] },
    Jizdan: { '2026-06': [{ date: '2026-06-16T10:00:00.000Z', share: 1 }] },
  }, new Date().toISOString());
  seedUser('giurgiu@k.de', 0, 'Giurgiu');

  await withServer(async (port) => {
    const c = await anmelden(port, admin);
    const r = await req(port, '/api/admin/legacy-names', mit(c));
    assert.strictEqual(r.status, 200);
    const { offen, zugeordnet } = await r.json();
    assert.deepStrictEqual(offen, ['Jizdan']);
    assert.deepStrictEqual(zugeordnet, ['Giurgiu']);
  });
});

test('Alt-Dienste uebernehmen: erst wenn alle Namen ein Konto haben', async () => {
  const admin = seedUser('at5@x.de', 1, 'Chef5');
  putDoc(admin, 'duties', {
    Cabrera: { '2026-06': [{ date: '2026-06-11T10:00:00.000Z', share: 1 }] },
    Fehlt: { '2026-06': [{ date: '2026-06-12T10:00:00.000Z', share: 1 }] },
  }, new Date().toISOString());
  const cab = seedUser('cabrera@k.de', 0, 'Cabrera');

  await withServer(async (port) => {
    const c = await anmelden(port, admin);
    let r = await req(port, '/api/admin/migrate-legacy', mit(c, { method: 'POST' }));
    assert.strictEqual(r.status, 409, 'unzugeordneter Name muss blockieren');
    assert.match((await r.json()).error, /Fehlt/);
    assert.strictEqual(db.prepare('SELECT COUNT(*) c FROM duties WHERE user_id=?').get(cab).c, 0);

    seedUser('fehlt@k.de', 0, 'Fehlt');
    r = await req(port, '/api/admin/migrate-legacy', mit(c, { method: 'POST' }));
    assert.strictEqual(r.status, 200);
    const erg = await r.json();
    assert.strictEqual(erg.dienste, 2);
    assert.strictEqual(erg.zeilen.length, 2);
    assert.strictEqual(db.prepare('SELECT COUNT(*) c FROM duties WHERE user_id=?').get(cab).c, 1);
  });
});

test('Nicht-Admin darf nichts davon', async () => {
  const normal = seedUser('at6@x.de', 0, 'Normal');
  await withServer(async (port) => {
    const c = await anmelden(port, normal);
    for (const [p, o] of [
      ['/api/admin/legacy-names', {}],
      ['/api/admin/migrate-legacy', { method: 'POST' }],
      [`/api/admin/users/${normal}/activate`, { method: 'POST' }],
      [`/api/admin/users/${normal}/name`, { method: 'PUT', ...json({ name: 'X' }) }],
    ]) {
      const r = await req(port, p, mit(c, o));
      assert.strictEqual(r.status, 403, `${p} war nicht geschuetzt`);
    }
  });
});
