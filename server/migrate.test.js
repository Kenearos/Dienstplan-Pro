const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dp-migrate-'));
const { db } = require('./db');
const { migrateToMultiUser, seedAdmin } = require('./auth');

test('Migration ordnet Alt-Daten dem Admin zu, setzt neues PK-Schema, ist idempotent', () => {
  // Alt-Schema (Single-User) erzwingen — unabhängig von der aktuellen db.js-Definition
  db.exec("DROP TABLE IF EXISTS documents; CREATE TABLE documents (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)");
  db.exec("DROP TABLE IF EXISTS history; CREATE TABLE history (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, value TEXT NOT NULL, replaced_at TEXT NOT NULL)");
  const now = new Date().toISOString();
  db.prepare('INSERT INTO documents (key,value,updated_at) VALUES (?,?,?)').run('employees', '["Max"]', now);
  db.prepare('INSERT INTO documents (key,value,updated_at) VALUES (?,?,?)').run('duties', '{}', now);
  db.prepare('INSERT INTO history (key,value,replaced_at) VALUES (?,?,?)').run('employees', '[]', now);

  const adminId = seedAdmin('admin@x.de');
  assert.strictEqual(migrateToMultiUser(adminId), true);

  const cols = db.prepare("PRAGMA table_info('documents')").all().map(c => c.name);
  assert.ok(cols.includes('user_id'), 'documents hat user_id');

  const rows = db.prepare('SELECT user_id, key FROM documents ORDER BY key').all();
  assert.deepStrictEqual(rows, [
    { user_id: adminId, key: 'duties' },
    { user_id: adminId, key: 'employees' },
  ]);
  assert.strictEqual(db.prepare('SELECT user_id FROM history').get().user_id, adminId);

  // PK ist (user_id,key): dieselbe Kombi doppelt schlägt fehl
  assert.throws(() => db.prepare('INSERT INTO documents (user_id,key,value,updated_at) VALUES (?,?,?,?)')
    .run(adminId, 'duties', '{}', now));

  // Idempotent
  assert.strictEqual(migrateToMultiUser(adminId), false);
});
