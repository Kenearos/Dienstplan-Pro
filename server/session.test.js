const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.SESSION_IDLE_HOURS = '8';
process.env.SESSION_TTL_DAYS = '30';
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dp-sess-'));
const { db } = require('./db');
const { createSession, validateSession, deleteSession, deleteUserSessions, hashToken } = require('./auth');

let n = 0;
function makeUser(isAdmin = 0) {
  const info = db.prepare('INSERT INTO users (email,is_admin,created_at) VALUES (?,?,?)')
    .run(`u${n++}@x.de`, isAdmin, new Date().toISOString());
  return Number(info.lastInsertRowid);
}

test('valide Session → Nutzer; last_seen wird gebumpt wenn > Throttle alt', () => {
  const uid = makeUser(1);
  const raw = createSession(uid);
  const idh = hashToken(raw);
  const old = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 Min (innerhalb 8h Idle)
  db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id_hash = ?').run(old, idh);
  const res = validateSession(raw);
  assert.deepStrictEqual(res, { userId: uid, email: db.prepare('SELECT email FROM users WHERE id=?').get(uid).email, isAdmin: true });
  const after = db.prepare('SELECT last_seen_at FROM sessions WHERE id_hash=?').get(idh).last_seen_at;
  assert.ok(after > old, 'last_seen gebumpt (war > 5min alt)');
});

test('frische Session: kein Bump innerhalb Throttle', () => {
  const uid = makeUser();
  const raw = createSession(uid);
  const idh = hashToken(raw);
  const ls1 = db.prepare('SELECT last_seen_at FROM sessions WHERE id_hash=?').get(idh).last_seen_at;
  validateSession(raw);
  const ls2 = db.prepare('SELECT last_seen_at FROM sessions WHERE id_hash=?').get(idh).last_seen_at;
  assert.strictEqual(ls1, ls2, 'kein Write innerhalb Throttle');
});

test('absolut abgelaufen → null', () => {
  const uid = makeUser();
  const raw = createSession(uid);
  db.prepare('UPDATE sessions SET expires_at=? WHERE id_hash=?').run('2000-01-01T00:00:00.000Z', hashToken(raw));
  assert.strictEqual(validateSession(raw), null);
});

test('idle abgelaufen → null', () => {
  const uid = makeUser();
  const raw = createSession(uid);
  const old = new Date(Date.now() - 9 * 60 * 60 * 1000).toISOString(); // 9h > 8h Idle
  db.prepare('UPDATE sessions SET last_seen_at=? WHERE id_hash=?').run(old, hashToken(raw));
  assert.strictEqual(validateSession(raw), null);
});

test('deleteSession und deleteUserSessions', () => {
  const uid = makeUser();
  const raw = createSession(uid);
  deleteSession(raw);
  assert.strictEqual(validateSession(raw), null);
  const r2 = createSession(uid);
  const r3 = createSession(uid);
  deleteUserSessions(uid);
  assert.strictEqual(validateSession(r2), null);
  assert.strictEqual(validateSession(r3), null);
});

test('unbekannte Session → null', () => {
  assert.strictEqual(validateSession('nichtexistent'), null);
});
