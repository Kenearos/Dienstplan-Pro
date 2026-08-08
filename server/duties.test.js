const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dp-duties-'));
const { db } = require('./db');

function spalten(tabelle) {
  return db.prepare(`PRAGMA table_info(${tabelle})`).all().map(c => c.name);
}

test('Schema: duties, vacation_months und die neuen users-Spalten existieren', () => {
  assert.deepStrictEqual(
    spalten('duties'),
    ['id', 'user_id', 'date', 'share', 'status', 'note', 'created_at', 'decided_by', 'decided_at'],
  );
  assert.deepStrictEqual(spalten('vacation_months'), ['user_id', 'month']);
  const u = spalten('users');
  assert.ok(u.includes('display_name'), 'users.display_name fehlt');
  assert.ok(u.includes('active'), 'users.active fehlt');
});

test('Schema: aktive Konten sind per Default aktiv', () => {
  const id = db.prepare('INSERT INTO users (email,is_admin,created_at) VALUES (?,0,?)')
    .run('default@x.de', new Date().toISOString()).lastInsertRowid;
  assert.strictEqual(db.prepare('SELECT active FROM users WHERE id=?').get(id).active, 1);
});

test('Schema: ein gueltiger Dienst pro Person und Tag, abgelehnte zaehlen nicht', () => {
  const uid = db.prepare('INSERT INTO users (email,is_admin,created_at) VALUES (?,0,?)')
    .run('unique@x.de', new Date().toISOString()).lastInsertRowid;
  const ins = (status) => db.prepare(
    'INSERT INTO duties (user_id,date,share,status,created_at) VALUES (?,?,?,?,?)',
  ).run(uid, '2026-09-01', 1.0, status, new Date().toISOString());

  ins('pending');
  assert.throws(() => ins('pending'), /UNIQUE/, 'zweiter gueltiger Dienst muss scheitern');

  // Ablehnen und erneut eintragen muss gehen — sonst ist der Tag fuer immer blockiert
  db.prepare("UPDATE duties SET status='rejected' WHERE user_id=? AND date=?").run(uid, '2026-09-01');
  assert.doesNotThrow(() => ins('pending'), 'nach Ablehnung muss der Tag wieder frei sein');
  assert.strictEqual(
    db.prepare('SELECT COUNT(*) c FROM duties WHERE user_id=? AND date=?').get(uid, '2026-09-01').c, 2,
  );
});
