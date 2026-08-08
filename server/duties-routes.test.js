const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dp-droutes-'));
process.env.RATE_LIMIT_IP = '1000';
delete process.env.SMTP_HOST;
const app = require('./index');
const { db } = require('./db');
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
const mit = (cookie, extra = {}) => ({
  ...extra,
  headers: { ...(extra.headers || {}), Cookie: cookie },
});

test('POST /api/duties: ohne Anmeldung 401, angemeldet 201', async () => {
  const uid = seedUser('r1@x.de', 0, 'Alsholi');
  await withServer(async (port) => {
    let r = await req(port, '/api/duties', { method: 'POST', ...json({ date: '2027-01-05', share: 1 }) });
    assert.strictEqual(r.status, 401);

    const c = await anmelden(port, uid);
    r = await req(port, '/api/duties', mit(c, { method: 'POST', ...json({ date: '2027-01-05', share: 1 }) }));
    assert.strictEqual(r.status, 201);
    const body = await r.json();
    assert.ok(body.id, 'id fehlt in der Antwort');
  });
});

test('POST /api/duties: user_id aus dem Body wird ignoriert (Anti-IDOR)', async () => {
  const ich = seedUser('r2@x.de', 0, 'Cabrera');
  const fremd = seedUser('r3@x.de', 0, 'Fremd');
  await withServer(async (port) => {
    const c = await anmelden(port, ich);
    const r = await req(port, '/api/duties',
      mit(c, { method: 'POST', ...json({ date: '2027-01-06', share: 1, user_id: fremd, userId: fremd }) }));
    assert.strictEqual(r.status, 201);
    const row = db.prepare('SELECT user_id FROM duties WHERE date=?').get('2027-01-06');
    assert.strictEqual(row.user_id, ich, 'Der Dienst wurde dem falschen Konto zugeordnet');
  });
});

test('POST /api/duties: doppelter Tag -> 409, ungueltige Werte -> 400', async () => {
  const uid = seedUser('r4@x.de', 0, 'Gaxhja');
  await withServer(async (port) => {
    const c = await anmelden(port, uid);
    await req(port, '/api/duties', mit(c, { method: 'POST', ...json({ date: '2027-01-07', share: 1 }) }));
    let r = await req(port, '/api/duties', mit(c, { method: 'POST', ...json({ date: '2027-01-07', share: 0.5 }) }));
    assert.strictEqual(r.status, 409);
    r = await req(port, '/api/duties', mit(c, { method: 'POST', ...json({ date: '2027-02-30', share: 1 }) }));
    assert.strictEqual(r.status, 400);
  });
});

test('GET /api/roster: Monatspflicht, Namen sichtbar, keine Betraege', async () => {
  const a = seedUser('r5@x.de', 0, 'Giurgiu');
  const b = seedUser('r6@x.de', 0, 'Jizdan');
  await withServer(async (port) => {
    const ca = await anmelden(port, a);
    const cb = await anmelden(port, b);
    await req(port, '/api/duties', mit(ca, { method: 'POST', ...json({ date: '2027-03-01', share: 1 }) }));
    await req(port, '/api/duties', mit(cb, { method: 'POST', ...json({ date: '2027-03-02', share: 1 }) }));

    let r = await req(port, '/api/roster', mit(ca));
    assert.strictEqual(r.status, 400, 'ohne month muss 400 kommen');

    r = await req(port, '/api/roster?month=2027-03', mit(ca));
    assert.strictEqual(r.status, 200);
    const { duties } = await r.json();
    assert.strictEqual(duties.length, 2, 'jeder sieht den ganzen Monat des Teams');
    assert.ok(duties.some((d) => d.name === 'Jizdan'), 'fremder Name fehlt im Aushang');
    assert.ok(!/bonus|betrag|amount|euro/i.test(JSON.stringify(duties)), 'Betrag im Aushang');
  });
});

test('DELETE /api/duties/:id: eigener pending 200, fremder 404, entschiedener 409', async () => {
  const ich = seedUser('r7@x.de', 0, 'Guenes');
  const admin = seedUser('r8@x.de', 1, 'Admin');
  await withServer(async (port) => {
    const c = await anmelden(port, ich);
    const ca = await anmelden(port, admin);

    let r = await req(port, '/api/duties', mit(c, { method: 'POST', ...json({ date: '2027-04-01', share: 1 }) }));
    const { id } = await r.json();
    r = await req(port, `/api/duties/${id}`, mit(ca, { method: 'DELETE' }));
    assert.strictEqual(r.status, 404, 'fremde ID darf nicht loeschbar sein');
    r = await req(port, `/api/duties/${id}`, mit(c, { method: 'DELETE' }));
    assert.strictEqual(r.status, 200);

    r = await req(port, '/api/duties', mit(c, { method: 'POST', ...json({ date: '2027-04-02', share: 1 }) }));
    const zweite = (await r.json()).id;
    await req(port, `/api/duties/${zweite}/decision`, mit(ca, { method: 'POST', ...json({ status: 'approved' }) }));
    r = await req(port, `/api/duties/${zweite}`, mit(c, { method: 'DELETE' }));
    assert.strictEqual(r.status, 409);
  });
});

test('decision: Nicht-Admin 403, Admin 200 + Audit; pending-Liste nur fuer Admin', async () => {
  const ich = seedUser('r9@x.de', 0, 'Elsharawy');
  const admin = seedUser('r10@x.de', 1, 'Admin2');
  await withServer(async (port) => {
    const c = await anmelden(port, ich);
    const ca = await anmelden(port, admin);
    const r0 = await req(port, '/api/duties', mit(c, { method: 'POST', ...json({ date: '2027-05-01', share: 1 }) }));
    const { id } = await r0.json();

    let r = await req(port, `/api/duties/${id}/decision`, mit(c, { method: 'POST', ...json({ status: 'approved' }) }));
    assert.strictEqual(r.status, 403);
    r = await req(port, '/api/duties/pending', mit(c));
    assert.strictEqual(r.status, 403);

    const vorher = db.prepare("SELECT COUNT(*) c FROM audit_log WHERE event='duty_decision'").get().c;
    r = await req(port, `/api/duties/${id}/decision`, mit(ca, { method: 'POST', ...json({ status: 'approved' }) }));
    assert.strictEqual(r.status, 200);
    assert.strictEqual(db.prepare("SELECT COUNT(*) c FROM audit_log WHERE event='duty_decision'").get().c, vorher + 1);

    r = await req(port, '/api/duties/pending', mit(ca));
    assert.strictEqual(r.status, 200);
    assert.ok(Array.isArray((await r.json()).duties));
  });
});

test('decision ueber eigenen Dienst wird als self_decision geloggt', async () => {
  const admin = seedUser('r11@x.de', 1, 'AdminSelbst');
  await withServer(async (port) => {
    const ca = await anmelden(port, admin);
    const r0 = await req(port, '/api/duties', mit(ca, { method: 'POST', ...json({ date: '2027-06-01', share: 1 }) }));
    const { id } = await r0.json();
    await req(port, `/api/duties/${id}/decision`, mit(ca, { method: 'POST', ...json({ status: 'approved' }) }));
    assert.strictEqual(db.prepare("SELECT COUNT(*) c FROM audit_log WHERE event='self_decision'").get().c, 1);
  });
});

// ── Task 4: Ausscheiden statt Loeschen ───────────────────────────────

test('Konto mit Diensten laesst sich nicht loeschen, nur deaktivieren', async () => {
  const admin = seedUser('r12@x.de', 1, 'Chef');
  const geht = seedUser('r13@x.de', 0, 'Scheidet');
  await withServer(async (port) => {
    const ca = await anmelden(port, admin);
    const cg = await anmelden(port, geht);
    const r0 = await req(port, '/api/duties', mit(cg, { method: 'POST', ...json({ date: '2027-07-01', share: 1 }) }));
    const { id } = await r0.json();
    await req(port, `/api/duties/${id}/decision`, mit(ca, { method: 'POST', ...json({ status: 'approved' }) }));

    // Loeschen wuerde die Grundlage gezahlter Verguetung vernichten
    let r = await req(port, `/api/admin/users/${geht}`, mit(ca, { method: 'DELETE' }));
    assert.strictEqual(r.status, 409);
    assert.strictEqual(db.prepare('SELECT COUNT(*) c FROM duties WHERE user_id=?').get(geht).c, 1,
      'Dienste duerfen nicht verschwunden sein');

    r = await req(port, `/api/admin/users/${geht}/deactivate`, mit(ca, { method: 'POST' }));
    assert.strictEqual(r.status, 200);
    assert.strictEqual(db.prepare('SELECT active FROM users WHERE id=?').get(geht).active, 0);
    assert.strictEqual(db.prepare('SELECT COUNT(*) c FROM duties WHERE user_id=?').get(geht).c, 1);
  });
});

test('deaktiviertes Konto kann sich nicht mehr anmelden', async () => {
  const uid = seedUser('r14@x.de', 0, 'Weg');
  db.prepare('UPDATE users SET active=0 WHERE id=?').run(uid);
  await withServer(async (port) => {
    const raw = createLoginToken(uid);
    const r = await req(port, '/auth/confirm', { method: 'POST', ...form(`token=${raw}`) });
    assert.strictEqual(r.status, 400);
  });
});
