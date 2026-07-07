const { test } = require('node:test');
const assert = require('node:assert');
const DataSync = require('./sync');

const empty = { employees: [], duties: {}, vacation: {} };
const full = { employees: ['Max'], duties: { Max: {} }, vacation: {} };

test('Server unerreichbar → offline', () => {
  assert.strictEqual(DataSync.decideSync(full, null, false), 'offline');
});

test('pending gesetzt → push-local (Offline-Aenderungen gewinnen)', () => {
  assert.strictEqual(DataSync.decideSync(full, full, true), 'push-local');
});

test('Server leer, lokal voll → push-local (Erstmigration)', () => {
  assert.strictEqual(DataSync.decideSync(full, empty, false), 'push-local');
});

test('Server hat Daten → adopt-server', () => {
  assert.strictEqual(DataSync.decideSync(empty, full, false), 'adopt-server');
});

test('beide leer → adopt-server (nichts zu tun)', () => {
  assert.strictEqual(DataSync.decideSync(empty, empty, false), 'adopt-server');
});
