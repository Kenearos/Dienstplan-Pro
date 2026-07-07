const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dp-db-'));
const { getDoc, putDoc, db } = require('./db');

const UID = 1;

test('putDoc/getDoc Roundtrip (pro Nutzer)', () => {
  putDoc(UID, 'employees', ['Max', 'Anna'], '2026-07-07T10:00:00.000Z');
  const doc = getDoc(UID, 'employees');
  assert.deepStrictEqual(doc.value, ['Max', 'Anna']);
  assert.strictEqual(doc.updatedAt, '2026-07-07T10:00:00.000Z');
});

test('getDoc für unbekannten Key liefert null', () => {
  assert.strictEqual(getDoc(UID, 'gibtsnicht'), null);
});

test('putDoc snapshottet den alten Wert in history (mit user_id)', () => {
  putDoc(UID, 'duties', { v: 1 }, '2026-07-07T10:00:00.000Z');
  putDoc(UID, 'duties', { v: 2 }, '2026-07-07T11:00:00.000Z');
  const rows = db.prepare("SELECT value, user_id FROM history WHERE key='duties' AND user_id=? ORDER BY id").all(UID);
  assert.strictEqual(rows.length, 1);
  assert.deepStrictEqual(JSON.parse(rows[0].value), { v: 1 });
  assert.strictEqual(rows[0].user_id, UID);
});

test('Datentrennung: verschiedene user_id → disjunkte Daten', () => {
  putDoc(10, 'employees', ['A'], '2026-07-07T10:00:00.000Z');
  putDoc(20, 'employees', ['B'], '2026-07-07T10:00:00.000Z');
  assert.deepStrictEqual(getDoc(10, 'employees').value, ['A']);
  assert.deepStrictEqual(getDoc(20, 'employees').value, ['B']);
});
