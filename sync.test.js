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

// --- localStorage/fetch Stubs fuer _flush()-Race-Tests ---
function makeLocalStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

test('einzelner push() + erfolgreicher flush → pending wird geleert', async () => {
  global.localStorage = makeLocalStorage();
  global.fetch = async () => ({ ok: true, json: async () => ({}) });
  DataSync._dirty = 0;
  DataSync._applying = false;

  DataSync.push();
  clearTimeout(DataSync._timer); // manueller Flush statt Debounce
  assert.strictEqual(localStorage.getItem(DataSync.KEY_PENDING), '1');

  await DataSync._flush();

  assert.strictEqual(localStorage.getItem(DataSync.KEY_PENDING), null);

  delete global.localStorage;
  delete global.fetch;
});

test('push() waehrend laufendem flush() → pending bleibt gesetzt (Verlust-Race verhindert)', async () => {
  global.localStorage = makeLocalStorage();
  DataSync._dirty = 0;
  DataSync._applying = false;

  let resolveFetch;
  global.fetch = () => new Promise((resolve) => { resolveFetch = resolve; });

  DataSync.push(); // dirty=1, pending='1'
  clearTimeout(DataSync._timer);

  const flushPromise = DataSync._flush(); // gen erfasst als 1, fetch haengt in flight

  DataSync.push(); // B: dirty=2, pending erneut '1' waehrend flush#1 noch laeuft
  clearTimeout(DataSync._timer);

  resolveFetch({ ok: true, json: async () => ({}) }); // flush#1 kommt zurueck
  await flushPromise;

  assert.strictEqual(localStorage.getItem(DataSync.KEY_PENDING), '1');

  delete global.localStorage;
  delete global.fetch;
});
