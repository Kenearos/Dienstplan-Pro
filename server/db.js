const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, 'dienstplan.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS documents (
    user_id    INTEGER NOT NULL,
    key        TEXT NOT NULL,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, key)
  );
  CREATE TABLE IF NOT EXISTS history (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    key         TEXT NOT NULL,
    value       TEXT NOT NULL,
    replaced_at TEXT NOT NULL,
    user_id     INTEGER
  );
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS login_tokens (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    used_at TEXT
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL,
    event TEXT NOT NULL,
    user_id INTEGER,
    ip_hash TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_login_tokens_user ON login_tokens(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
`);

function getDoc(userId, key) {
  const row = db.prepare('SELECT value, updated_at FROM documents WHERE user_id = ? AND key = ?').get(userId, key);
  if (!row) return null;
  return { value: JSON.parse(row.value), updatedAt: row.updated_at };
}

// ponytail: history wächst unbegrenzt. Bei kleinen Docs jahrelang egal.
// Pruning (z.B. > 500 Einträge pro user/key löschen) nachrüsten, falls es je wächst.
function putDoc(userId, key, value, now) {
  const json = JSON.stringify(value);
  const tx = db.transaction(() => {
    const existing = db.prepare('SELECT value FROM documents WHERE user_id = ? AND key = ?').get(userId, key);
    if (existing) {
      db.prepare('INSERT INTO history (key, value, replaced_at, user_id) VALUES (?, ?, ?, ?)')
        .run(key, existing.value, now, userId);
    }
    db.prepare(`
      INSERT INTO documents (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(userId, key, json, now);
  });
  tx();
}

module.exports = { db, getDoc, putDoc, DB_PATH, DATA_DIR };
