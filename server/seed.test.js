const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dp-seed-'));
const { db } = require('./db');
const { seedAdmin } = require('./auth');

test('Fail-Fast: fehlende/leere/ungültige ADMIN_EMAIL wirft', () => {
  assert.throws(() => seedAdmin(''), /Fail-Fast|ADMIN_EMAIL/);
  assert.throws(() => seedAdmin('   '), /Fail-Fast|ADMIN_EMAIL/);
  assert.throws(() => seedAdmin(undefined), /Fail-Fast|ADMIN_EMAIL/);
  assert.throws(() => seedAdmin('keinklammeraffe'), /Fail-Fast|ADMIN_EMAIL/);
});

test('seedAdmin legt Admin an (normalisiert), idempotent, liefert id', () => {
  const id1 = seedAdmin(' Admin@Klinik.DE ');
  const row = db.prepare('SELECT email, is_admin FROM users WHERE id = ?').get(id1);
  assert.strictEqual(row.email, 'admin@klinik.de');
  assert.strictEqual(row.is_admin, 1);
  const id2 = seedAdmin('admin@klinik.de');
  assert.strictEqual(id2, id1, 'idempotent — kein zweiter Nutzer');
});

test('bestehender Nicht-Admin wird zum Admin befördert', () => {
  db.prepare('INSERT INTO users (email, is_admin, created_at) VALUES (?,0,?)')
    .run('later@klinik.de', new Date().toISOString());
  const id = seedAdmin('later@klinik.de');
  assert.strictEqual(db.prepare('SELECT is_admin FROM users WHERE id=?').get(id).is_admin, 1);
});
