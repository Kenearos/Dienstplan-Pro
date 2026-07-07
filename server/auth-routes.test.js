const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dp-routes-'));
process.env.RATE_LIMIT_IP = '1000';
delete process.env.SMTP_HOST;
const app = require('./index');
const { db } = require('./db');
const { createLoginToken, hashToken } = require('./auth');

function seedUser(email, isAdmin = 0) {
  return Number(db.prepare('INSERT INTO users (email,is_admin,created_at) VALUES (?,?,?)')
    .run(email, isAdmin, new Date().toISOString()).lastInsertRowid);
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

test('request: freigeschaltet → 200 + Token; unbekannt → 200 ohne Token (neutral)', async () => {
  const uid = seedUser('known@x.de');
  await withServer(async (port) => {
    let r = await req(port, '/api/auth/request', { method: 'POST', ...json({ email: 'Known@X.de' }) });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(db.prepare('SELECT COUNT(*) c FROM login_tokens WHERE user_id=?').get(uid).c, 1);
    r = await req(port, '/api/auth/request', { method: 'POST', ...json({ email: 'stranger@x.de' }) });
    assert.strictEqual(r.status, 200);
  });
});

test('request: über E-Mail-Limit (5) → 429', async () => {
  seedUser('rl@x.de');
  await withServer(async (port) => {
    let last;
    for (let i = 0; i < 6; i++) last = await req(port, '/api/auth/request', { method: 'POST', ...json({ email: 'rl@x.de' }) });
    assert.strictEqual(last.status, 429);
  });
});

test('scanner-sicher: GET /auth verbraucht nicht; POST /auth/confirm → Session-Cookie; me/logout', async () => {
  const uid = seedUser('login@x.de', 1);
  const raw = createLoginToken(uid);
  await withServer(async (port) => {
    let r = await req(port, `/auth?token=${raw}`);
    assert.strictEqual(r.status, 200);
    assert.match(await r.text(), /Jetzt anmelden/);
    assert.strictEqual(db.prepare('SELECT used_at FROM login_tokens WHERE token_hash=?').get(hashToken(raw)).used_at, null);

    r = await req(port, '/auth/confirm', { method: 'POST', ...form(`token=${raw}`) });
    assert.strictEqual(r.status, 302);
    const cookie = r.headers.get('set-cookie').split(';')[0];
    assert.match(cookie, /^session=/);

    r = await req(port, '/api/auth/me', { headers: { Cookie: cookie } });
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(await r.json(), { email: 'login@x.de', isAdmin: true });

    r = await req(port, '/api/auth/logout', { method: 'POST', headers: { Cookie: cookie } });
    assert.strictEqual(r.status, 200);
    r = await req(port, '/api/auth/me', { headers: { Cookie: cookie } });
    assert.strictEqual(r.status, 401);

    // verbrauchter Token → 400
    r = await req(port, '/auth/confirm', { method: 'POST', ...form(`token=${raw}`) });
    assert.strictEqual(r.status, 400);
  });
});

test('me ohne Cookie → 401', async () => {
  await withServer(async (port) => {
    assert.strictEqual((await req(port, '/api/auth/me')).status, 401);
  });
});

test('Notzugang: Admin erzeugt Login-Link (200); Nicht-Admin → 403', async () => {
  const adminId = seedUser('adm@x.de', 1);
  const targetId = seedUser('target@x.de', 0);
  const araw = createLoginToken(adminId);
  await withServer(async (port) => {
    let r = await req(port, '/auth/confirm', { method: 'POST', ...form(`token=${araw}`) });
    const acookie = r.headers.get('set-cookie').split(';')[0];
    r = await req(port, '/api/admin/login-link', { method: 'POST', headers: { Cookie: acookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'target@x.de' }) });
    assert.strictEqual(r.status, 200);
    assert.match((await r.json()).url, /\/auth\?token=/);

    const traw = createLoginToken(targetId);
    r = await req(port, '/auth/confirm', { method: 'POST', ...form(`token=${traw}`) });
    const tcookie = r.headers.get('set-cookie').split(';')[0];
    r = await req(port, '/api/admin/login-link', { method: 'POST', headers: { Cookie: tcookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'target@x.de' }) });
    assert.strictEqual(r.status, 403);
  });
});
