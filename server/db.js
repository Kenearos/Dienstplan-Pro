const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, 'dienstplan.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS documents (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS history (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    key         TEXT NOT NULL,
    value       TEXT NOT NULL,
    replaced_at TEXT NOT NULL
  );
`);

function getDoc(key) {
  const row = db.prepare('SELECT value, updated_at FROM documents WHERE key = ?').get(key);
  if (!row) return null;
  return { value: JSON.parse(row.value), updatedAt: row.updated_at };
}

// ponytail: history wächst unbegrenzt. Bei Single-User/kleinen Docs jahrelang egal.
// Pruning (z.B. > 500 Einträge pro key löschen) nachrüsten, falls es je wächst.
function putDoc(key, value, now) {
  const json = JSON.stringify(value);
  const tx = db.transaction(() => {
    const existing = db.prepare('SELECT value FROM documents WHERE key = ?').get(key);
    if (existing) {
      db.prepare('INSERT INTO history (key, value, replaced_at) VALUES (?, ?, ?)')
        .run(key, existing.value, now);
    }
    db.prepare(`
      INSERT INTO documents (key, value, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(key, json, now);
  });
  tx();
}

module.exports = { db, getDoc, putDoc, DB_PATH, DATA_DIR };
