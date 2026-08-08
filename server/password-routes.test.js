const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dp-pw-'));
process.env.RATE_LIMIT_IP = '1000';
delete process.env.SMTP_HOST;
const app = require('./index');
const { db } = require('./db');

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

test('Passwort setzen: freigeschaltetes Konto ohne Passwort -> geht, danach Login', async () => {
  seedUser('pw1@k.de', 0, 'Erst');
  await withServer(async (port) => {
    let r = await req(port, '/api/auth/set-password',
      { method: 'POST', ...json({ email: 'pw1@k.de', password: 'Zaunkoenig-Blau-7' }) });
    assert.strictEqual(r.status, 200);

    r = await req(port, '/api/auth/login',
      { method: 'POST', ...json({ email: 'pw1@k.de', password: 'Zaunkoenig-Blau-7' }) });
    assert.strictEqual(r.status, 200);
    const cookie = r.headers.get('set-cookie');
    assert.ok(cookie && cookie.startsWith('session='), 'kein Session-Cookie');

    r = await req(port, '/api/auth/me', { headers: { Cookie: cookie.split(';')[0] } });
    assert.strictEqual((await r.json()).email, 'pw1@k.de');
  });
});

test('Passwort setzen: nur solange keines gesetzt ist', async () => {
  seedUser('pw2@k.de', 0, 'Zweit');
  await withServer(async (port) => {
    await req(port, '/api/auth/set-password',
      { method: 'POST', ...json({ email: 'pw2@k.de', password: 'Erstes-Passwort-1' }) });
    const r = await req(port, '/api/auth/set-password',
      { method: 'POST', ...json({ email: 'pw2@k.de', password: 'Fremdes-Passwort-2' }) });
    assert.strictEqual(r.status, 409, 'ein gesetztes Passwort darf nicht ueberschrieben werden');

    const alt = await req(port, '/api/auth/login',
      { method: 'POST', ...json({ email: 'pw2@k.de', password: 'Erstes-Passwort-1' }) });
    assert.strictEqual(alt.status, 200, 'das erste Passwort muss weiter gelten');
  });
});

test('Passwort setzen: unbekannte E-Mail bleibt neutral, legt nichts an', async () => {
  await withServer(async (port) => {
    const r = await req(port, '/api/auth/set-password',
      { method: 'POST', ...json({ email: 'niemand@k.de', password: 'Irgendwas-Langes-9' }) });
    assert.strictEqual(r.status, 200, 'keine Auskunft, ob die Adresse freigeschaltet ist');
    assert.strictEqual(db.prepare('SELECT COUNT(*) c FROM users WHERE email=?').get('niemand@k.de').c, 0);

    const l = await req(port, '/api/auth/login',
      { method: 'POST', ...json({ email: 'niemand@k.de', password: 'Irgendwas-Langes-9' }) });
    assert.strictEqual(l.status, 401);
  });
});

test('Passwort setzen: zu kurz -> 400', async () => {
  seedUser('pw3@k.de', 0, 'Kurz');
  await withServer(async (port) => {
    const r = await req(port, '/api/auth/set-password',
      { method: 'POST', ...json({ email: 'pw3@k.de', password: 'kurz' }) });
    assert.strictEqual(r.status, 400);
  });
});

test('Login: falsches Passwort und unbekannte Adresse melden dasselbe', async () => {
  seedUser('pw4@k.de', 0, 'Vier');
  await withServer(async (port) => {
    await req(port, '/api/auth/set-password',
      { method: 'POST', ...json({ email: 'pw4@k.de', password: 'Richtig-Richtig-4' }) });
    const falsch = await req(port, '/api/auth/login',
      { method: 'POST', ...json({ email: 'pw4@k.de', password: 'Falsch-Falsch-44' }) });
    const unbekannt = await req(port, '/api/auth/login',
      { method: 'POST', ...json({ email: 'gibtsnicht@k.de', password: 'Falsch-Falsch-44' }) });
    assert.strictEqual(falsch.status, 401);
    assert.strictEqual(unbekannt.status, 401);
    assert.deepStrictEqual(await falsch.json(), await unbekannt.json(),
      'unterschiedliche Meldungen verraten, welche Adressen es gibt');
  });
});

test('Login: deaktiviertes Konto kommt nicht rein', async () => {
  const id = seedUser('pw5@k.de', 0, 'Weg');
  await withServer(async (port) => {
    await req(port, '/api/auth/set-password',
      { method: 'POST', ...json({ email: 'pw5@k.de', password: 'Noch-Aktiv-555' }) });
    db.prepare('UPDATE users SET active=0 WHERE id=?').run(id);
    const r = await req(port, '/api/auth/login',
      { method: 'POST', ...json({ email: 'pw5@k.de', password: 'Noch-Aktiv-555' }) });
    assert.strictEqual(r.status, 401);
  });
});

test('Passwort-Einrichtung landet im Audit-Log', async () => {
  seedUser('pw6@k.de', 0, 'Audit');
  await withServer(async (port) => {
    const vorher = db.prepare("SELECT COUNT(*) c FROM audit_log WHERE event='password_claimed'").get().c;
    await req(port, '/api/auth/set-password',
      { method: 'POST', ...json({ email: 'pw6@k.de', password: 'Protokoll-Bitte-6' }) });
    assert.strictEqual(
      db.prepare("SELECT COUNT(*) c FROM audit_log WHERE event='password_claimed'").get().c, vorher + 1,
    );
  });
});
