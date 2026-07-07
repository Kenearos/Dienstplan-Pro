const crypto = require('crypto');
const { db } = require('./db');

// Einmal-Token-Lebensdauer (Minuten). Scanner-sicher lang genug, aber kurz.
const TOKEN_TTL_MIN = parseInt(process.env.TOKEN_TTL_MIN, 10) || 30;

/** Identische Normalisierung für Speicherung UND Abgleich (case-insensitive). */
function normalizeEmail(email) {
  return String(email).toLowerCase().trim();
}

/** SHA-256-Hex. Nur der Hash landet in der DB; der Rohwert lebt im Link/Cookie. */
function hashToken(raw) {
  return crypto.createHash('sha256').update(String(raw)).digest('hex');
}

/**
 * Erzeugt einen Einmal-Login-Token für userId, speichert nur den Hash + Ablauf,
 * gibt den ROHWERT zurück (kommt in den Magic-Link).
 */
function createLoginToken(userId) {
  const raw = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MIN * 60 * 1000).toISOString();
  db.prepare('INSERT INTO login_tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .run(hashToken(raw), userId, expiresAt);
  return raw;
}

/**
 * Löst einen Roh-Token einmalig ein: prüft Hash + nicht abgelaufen + nicht verbraucht,
 * markiert ihn als verbraucht und liefert { userId, email, isAdmin } — sonst null.
 */
function consumeLoginToken(raw) {
  const now = new Date().toISOString();
  const row = db.prepare(`
    SELECT t.token_hash AS tokenHash, t.user_id AS userId, u.email, u.is_admin AS isAdmin
    FROM login_tokens t JOIN users u ON t.user_id = u.id
    WHERE t.token_hash = ? AND t.used_at IS NULL AND t.expires_at > ?
  `).get(hashToken(raw), now);
  if (!row) return null;
  db.prepare('UPDATE login_tokens SET used_at = ? WHERE token_hash = ?').run(now, row.tokenHash);
  return { userId: row.userId, email: row.email, isAdmin: !!row.isAdmin };
}

module.exports = { normalizeEmail, hashToken, createLoginToken, consumeLoginToken, TOKEN_TTL_MIN };
