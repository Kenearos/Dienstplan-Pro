const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// DATA_DIR auf Temp umbiegen, BEVOR db.js geladen wird
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dp-db-'));
const { getDoc, putDoc } = require('./db');

test('putDoc/getDoc Roundtrip', () => {
  putDoc('employees', ['Max', 'Anna'], '2026-07-07T10:00:00.000Z');
  const doc = getDoc('employees');
  assert.deepStrictEqual(doc.value, ['Max', 'Anna']);
  assert.strictEqual(doc.updatedAt, '2026-07-07T10:00:00.000Z');
});

test('getDoc für unbekannten Key liefert null', () => {
  assert.strictEqual(getDoc('gibtsnicht'), null);
});

test('putDoc snapshottet den alten Wert in history', () => {
  const { db } = require('./db');
  putDoc('duties', { v: 1 }, '2026-07-07T10:00:00.000Z');
  putDoc('duties', { v: 2 }, '2026-07-07T11:00:00.000Z');
  const rows = db.prepare("SELECT value FROM history WHERE key = 'duties' ORDER BY id").all();
  assert.strictEqual(rows.length, 1);
  assert.deepStrictEqual(JSON.parse(rows[0].value), { v: 1 });
});
