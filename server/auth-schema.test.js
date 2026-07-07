const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// DATA_DIR auf Temp umbiegen, BEVOR db.js geladen wird
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dp-auth-schema-'));
const { db } = require('./db');
const { audit } = require('./audit');

function tableNames() {
  return db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
}

function indexNames() {
  return db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all().map((r) => r.name);
}

test('Auth-Tabellen existieren', () => {
  const names = tableNames();
  assert.ok(names.includes('users'), 'users fehlt');
  assert.ok(names.includes('login_tokens'), 'login_tokens fehlt');
  assert.ok(names.includes('sessions'), 'sessions fehlt');
  assert.ok(names.includes('audit_log'), 'audit_log fehlt');
});

test('foreign_keys ist aktiv', () => {
  assert.strictEqual(db.pragma('foreign_keys', { simple: true }), 1);
});

test('Indizes auf login_tokens.user_id und sessions.user_id existieren', () => {
  const names = indexNames();
  assert.ok(names.includes('idx_login_tokens_user'), 'idx_login_tokens_user fehlt');
  assert.ok(names.includes('idx_sessions_user'), 'idx_sessions_user fehlt');
});

test('foreign_keys CASCADE: Nutzer löschen räumt tokens+sessions', () => {
  const now = '2026-07-07T10:00:00.000Z';
  const userId = db.prepare('INSERT INTO users (email, is_admin, created_at) VALUES (?, 0, ?)')
    .run('cascade-test@example.com', now).lastInsertRowid;
  db.prepare('INSERT INTO login_tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .run('hash-cascade', userId, now);
  db.prepare('INSERT INTO sessions (id_hash, user_id, expires_at, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)')
    .run('sess-cascade', userId, now, now, now);

  db.prepare('DELETE FROM users WHERE id = ?').run(userId);

  assert.strictEqual(db.prepare('SELECT * FROM login_tokens WHERE user_id = ?').get(userId), undefined);
  assert.strictEqual(db.prepare('SELECT * FROM sessions WHERE user_id = ?').get(userId), undefined);
});

test('audit() schreibt append-only Zeile ohne PII', () => {
  const before = db.prepare('SELECT COUNT(*) AS n FROM audit_log').get().n;
  audit('login_ok', 1, 'abc');
  const after = db.prepare('SELECT COUNT(*) AS n FROM audit_log').get().n;
  assert.strictEqual(after, before + 1);

  const row = db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT 1').get();
  assert.strictEqual(row.event, 'login_ok');
  assert.strictEqual(row.user_id, 1);
  assert.strictEqual(row.ip_hash, 'abc');
  assert.ok(row.ts, 'ts fehlt');
  // keine PII-Spalten (email/name) vorhanden
  assert.deepStrictEqual(
    Object.keys(row).sort(),
    ['event', 'id', 'ip_hash', 'ts', 'user_id'].sort()
  );
});

test('audit() ohne userId/ipHash (defaults null)', () => {
  audit('server_start');
  const row = db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT 1').get();
  assert.strictEqual(row.event, 'server_start');
  assert.strictEqual(row.user_id, null);
  assert.strictEqual(row.ip_hash, null);
});
