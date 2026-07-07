const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dp-audit-'));
process.env.RATE_LIMIT_IP = '1000';
delete process.env.SMTP_HOST;
const app = require('./index');
const { db } = require('./db');
const { createLoginToken } = require('./auth');

async function withServer(fn) { const s = app.listen(0); try { return await fn(s.address().port); } finally { s.close(); } }

test('Login schreibt eine PII-freie audit_log-Zeile (login_ok, user_id, ip_hash)', async () => {
  const uid = Number(db.prepare('INSERT INTO users (email,is_admin,created_at) VALUES (?,1,?)')
    .run('audit@x.de', new Date().toISOString()).lastInsertRowid);
  const raw = createLoginToken(uid);
  await withServer(async (port) => {
    const r = await fetch(`http://127.0.0.1:${port}/auth/confirm`, {
      method: 'POST', redirect: 'manual',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `token=${raw}`,
    });
    assert.strictEqual(r.status, 302);
  });
  const row = db.prepare("SELECT event, user_id, ip_hash FROM audit_log WHERE event='login_ok' AND user_id=?").get(uid);
  assert.ok(row, 'login_ok-Zeile vorhanden');
  assert.strictEqual(row.user_id, uid);
  assert.ok(row.ip_hash && row.ip_hash.length === 64, 'ip_hash ist ein SHA-256-Hash, keine rohe IP');
  // Strukturell keine PII: audit_log hat keine email/name-Spalte
  const cols = db.prepare("PRAGMA table_info('audit_log')").all().map(c => c.name);
  assert.deepStrictEqual(cols.filter(c => /email|name/i.test(c)), []);
});
