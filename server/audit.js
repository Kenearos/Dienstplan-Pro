const { db } = require('./db');

// Append-only Audit-Log. Keine PII (kein E-Mail/Name) — nur event, user_id, ip_hash.
function audit(event, userId = null, ipHash = null) {
  db.prepare('INSERT INTO audit_log (ts, event, user_id, ip_hash) VALUES (?, ?, ?, ?)')
    .run(new Date().toISOString(), event, userId, ipHash);
}

module.exports = { audit };
