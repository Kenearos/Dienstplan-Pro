const { test } = require('node:test');
const assert = require('node:assert');
const { hit, _reset } = require('./ratelimit');

test('erlaubt bis zum Limit, blockt danach', () => {
  _reset();
  assert.strictEqual(hit('a@x.de', 3, 15), true);
  assert.strictEqual(hit('a@x.de', 3, 15), true);
  assert.strictEqual(hit('a@x.de', 3, 15), true);
  assert.strictEqual(hit('a@x.de', 3, 15), false, '4. Anfrage geblockt');
});

test('verschiedene Keys sind unabhängig (E-Mail vs IP)', () => {
  _reset();
  assert.strictEqual(hit('email:a@x.de', 1, 15), true);
  assert.strictEqual(hit('email:a@x.de', 1, 15), false);
  assert.strictEqual(hit('ip:1.2.3.4', 100, 15), true, 'anderer Key unberührt');
});
