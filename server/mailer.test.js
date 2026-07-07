const { test } = require('node:test');
const assert = require('node:assert');

delete process.env.SMTP_HOST;
const { sendMagicLink, getTransport } = require('./mailer');

test('ohne SMTP: getTransport null', () => {
  assert.strictEqual(getTransport(), null);
});

test('ohne SMTP: Konsolen-Fallback, kein Wurf, url zurück', async () => {
  const r = await sendMagicLink('a@x.de', 'https://bonus.example/auth?token=abc');
  assert.strictEqual(r.sent, false);
  assert.strictEqual(r.url, 'https://bonus.example/auth?token=abc');
});
