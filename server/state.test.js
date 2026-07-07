const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dp-state-'));
const app = require('./index');

async function req(port, method, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`http://127.0.0.1:${port}/api/state`, opts);
  return { status: res.status, body: await res.json() };
}

test('leerer Server liefert leeren State', async () => {
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const { status, body } = await req(port, 'GET');
    assert.strictEqual(status, 200);
    assert.deepStrictEqual(body.employees, []);
    assert.deepStrictEqual(body.duties, {});
    assert.deepStrictEqual(body.vacation, {});
    assert.strictEqual(body.updatedAt, null);
  } finally { server.close(); }
});

test('PUT dann GET Roundtrip', async () => {
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const put = await req(port, 'PUT', { employees: ['Max'], duties: { Max: { '2026-07': [] } } });
    assert.strictEqual(put.status, 200);
    assert.strictEqual(put.body.status, 'ok');
    const get = await req(port, 'GET');
    assert.deepStrictEqual(get.body.employees, ['Max']);
    assert.deepStrictEqual(get.body.duties, { Max: { '2026-07': [] } });
    assert.strictEqual(typeof get.body.updatedAt, 'string');
  } finally { server.close(); }
});
