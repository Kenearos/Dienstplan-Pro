const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dp-auth-'));
const { db } = require('./db');
const { normalizeEmail, hashToken, createLoginToken, consumeLoginToken } = require('./auth');

function makeUser(email = 'a@b.de', isAdmin = 0) {
  const info = db.prepare('INSERT INTO users (email,is_admin,created_at) VALUES (?,?,?)')
    .run(email, isAdmin, new Date().toISOString());
  return Number(info.lastInsertRowid);
}

test('normalizeEmail: lowercase + trim', () => {
  assert.strictEqual(normalizeEmail(' Foo@Bar.DE '), 'foo@bar.de');
});

test('createLoginToken speichert nur Hash; consume liefert Nutzer genau einmal', () => {
  const uid = makeUser('roundtrip@x.de', 1);
  const raw = createLoginToken(uid);

  // Rohwert darf NICHT als token_hash in der DB liegen
  assert.strictEqual(
    db.prepare('SELECT 1 FROM login_tokens WHERE token_hash = ?').get(raw),
    undefined,
    'Rohtoken darf nicht als token_hash gespeichert sein'
  );
  assert.ok(
    db.prepare('SELECT 1 FROM login_tokens WHERE token_hash = ?').get(hashToken(raw)),
    'Hash muss gespeichert sein'
  );

  assert.deepStrictEqual(consumeLoginToken(raw), { userId: uid, email: 'roundtrip@x.de', isAdmin: true });
  assert.strictEqual(consumeLoginToken(raw), null, 'zweite Einlösung → null');
});

test('abgelaufener Token → null', () => {
  const uid = makeUser('expired@x.de');
  const raw = 'deadbeef'.repeat(8);
  db.prepare('INSERT INTO login_tokens (token_hash, user_id, expires_at) VALUES (?,?,?)')
    .run(hashToken(raw), uid, '2000-01-01T00:00:00.000Z');
  assert.strictEqual(consumeLoginToken(raw), null);
});

test('nicht-Admin: isAdmin === false', () => {
  const uid = makeUser('plain@x.de', 0);
  const raw = createLoginToken(uid);
  assert.strictEqual(consumeLoginToken(raw).isAdmin, false);
});
