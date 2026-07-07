const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dp-state-'));
const app = require('./index');
const { db } = require('./db');
const { createSession } = require('./auth');

function seedUser(email) {
  return Number(db.prepare('INSERT INTO users (email,is_admin,created_at) VALUES (?,0,?)')
    .run(email, new Date().toISOString()).lastInsertRowid);
}
async function withServer(fn) {
  const s = app.listen(0);
  try { return await fn(s.address().port); } finally { s.close(); }
}
async function state(port, method, cookie, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (cookie) opts.headers.Cookie = cookie;
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`http://127.0.0.1:${port}/api/state`, opts);
  let b = null; try { b = await res.json(); } catch { /* leer */ }
  return { status: res.status, body: b };
}

test('ohne Session → 401', async () => {
  await withServer(async (port) => {
    assert.strictEqual((await state(port, 'GET', null)).status, 401);
  });
});

test('eigener leerer State; PUT→GET Roundtrip', async () => {
  const cookie = 'session=' + createSession(seedUser('a@x.de'));
  await withServer(async (port) => {
    let r = await state(port, 'GET', cookie);
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.body.employees, []);
    r = await state(port, 'PUT', cookie, { employees: ['Max'], duties: { Max: { '2026-07': [] } } });
    assert.strictEqual(r.status, 200);
    r = await state(port, 'GET', cookie);
    assert.deepStrictEqual(r.body.employees, ['Max']);
    assert.deepStrictEqual(r.body.duties, { Max: { '2026-07': [] } });
  });
});

test('Datentrennung + Anti-IDOR: zwei Nutzer disjunkt, Client-user_id wird ignoriert', async () => {
  const a = seedUser('user-a@x.de');
  const b = seedUser('user-b@x.de');
  const ca = 'session=' + createSession(a);
  const cb = 'session=' + createSession(b);
  await withServer(async (port) => {
    // A schreibt und schmuggelt fremde user_id in den Body → muss wirkungslos sein
    await state(port, 'PUT', ca, { employees: ['A'], user_id: b });
    await state(port, 'PUT', cb, { employees: ['B'] });
    assert.deepStrictEqual((await state(port, 'GET', ca)).body.employees, ['A']);
    assert.deepStrictEqual((await state(port, 'GET', cb)).body.employees, ['B'], 'B unberührt vom user_id-Schmuggel');
  });
});
