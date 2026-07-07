const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dp-admin-'));
const app = require('./index');
const { db } = require('./db');
const { createSession, validateSession } = require('./auth');

function seedUser(email, isAdmin = 0) {
  return Number(db.prepare('INSERT INTO users (email,is_admin,created_at) VALUES (?,?,?)')
    .run(email, isAdmin, new Date().toISOString()).lastInsertRowid);
}
async function withServer(fn) { const s = app.listen(0); try { return await fn(s.address().port); } finally { s.close(); } }
function api(port, method, p, cookie, body) {
  const opts = { method, headers: {} };
  if (cookie) opts.headers.Cookie = cookie;
  if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  return fetch(`http://127.0.0.1:${port}${p}`, opts);
}

test('Nicht-Admin → 403; ohne Session → 401', async () => {
  const cookie = 'session=' + createSession(seedUser('plain@x.de', 0));
  await withServer(async (port) => {
    assert.strictEqual((await api(port, 'GET', '/api/admin/users', cookie)).status, 403);
    assert.strictEqual((await api(port, 'GET', '/api/admin/users', null)).status, 401);
  });
});

test('Admin: freischalten (normalisiert, idempotent) + auflisten', async () => {
  const cookie = 'session=' + createSession(seedUser('boss@x.de', 1));
  await withServer(async (port) => {
    assert.strictEqual((await api(port, 'POST', '/api/admin/users', cookie, { email: ' New@X.DE ' })).status, 200);
    assert.strictEqual((await api(port, 'POST', '/api/admin/users', cookie, { email: 'new@x.de' })).status, 200); // idempotent
    assert.strictEqual(db.prepare("SELECT COUNT(*) c FROM users WHERE email='new@x.de'").get().c, 1);
    const list = await (await api(port, 'GET', '/api/admin/users', cookie)).json();
    assert.ok(list.users.some(u => u.email === 'new@x.de' && u.isAdmin === false));
  });
});

test('Admin: Nutzer entfernen räumt dessen Sessions (CASCADE)', async () => {
  const adminCookie = 'session=' + createSession(seedUser('boss2@x.de', 1));
  const victimId = seedUser('victim@x.de', 0);
  const victimRaw = createSession(victimId);
  await withServer(async (port) => {
    assert.ok(validateSession(victimRaw), 'Opfer hat gültige Session vor Löschung');
    assert.strictEqual((await api(port, 'DELETE', `/api/admin/users/${victimId}`, adminCookie)).status, 200);
    assert.strictEqual(db.prepare('SELECT COUNT(*) c FROM users WHERE id=?').get(victimId).c, 0);
    assert.strictEqual(validateSession(victimRaw), null, 'Session per CASCADE weg');
  });
});

test('Last-Admin-Schutz: sich selbst / letzten Admin entfernen → 400', async () => {
  const adminId = seedUser('solo@x.de', 1);
  const adminCookie = 'session=' + createSession(adminId);
  await withServer(async (port) => {
    // sich selbst (zugleich letzter Admin)
    assert.strictEqual((await api(port, 'DELETE', `/api/admin/users/${adminId}`, adminCookie)).status, 400);
    // ein zweiter Admin, dann Löschen des zweiten ist ok, aber der letzte bleibt geschützt
    const second = seedUser('second-admin@x.de', 1);
    assert.strictEqual((await api(port, 'DELETE', `/api/admin/users/${second}`, adminCookie)).status, 200);
    assert.strictEqual((await api(port, 'DELETE', `/api/admin/users/${adminId}`, adminCookie)).status, 400);
  });
});
