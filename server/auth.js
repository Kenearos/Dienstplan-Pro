const crypto = require('crypto');
const { db } = require('./db');

// Einmal-Token-Lebensdauer (Minuten). Scanner-sicher lang genug, aber kurz.
const TOKEN_TTL_MIN = parseInt(process.env.TOKEN_TTL_MIN, 10) || 30;

// Sitzung: absolute Frist + Inaktivitäts-Frist. last_seen wird gedrosselt geschrieben.
const SESSION_TTL_DAYS = parseInt(process.env.SESSION_TTL_DAYS, 10) || 30;
const SESSION_IDLE_HOURS = parseInt(process.env.SESSION_IDLE_HOURS, 10) || 8;
const LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000;

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

/**
 * Erzeugt eine Sitzung, speichert nur den Hash der ID; gibt den Rohwert zurück
 * (kommt ins httpOnly-Cookie).
 */
function createSession(userId) {
  const raw = crypto.randomBytes(32).toString('hex');
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86400 * 1000).toISOString();
  db.prepare('INSERT INTO sessions (id_hash, user_id, expires_at, created_at, last_seen_at) VALUES (?,?,?,?,?)')
    .run(hashToken(raw), userId, expiresAt, now, now);
  return raw;
}

/**
 * Prüft eine Roh-Session-ID: existiert, nicht absolut abgelaufen, nicht idle abgelaufen.
 * Bumpt last_seen nur, wenn älter als der Throttle (kein Write pro Request).
 * @returns {{userId:number,email:string,isAdmin:boolean}|null}
 */
function validateSession(raw) {
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const idh = hashToken(raw);
  const row = db.prepare(`
    SELECT s.id_hash AS idHash, s.user_id AS userId, s.expires_at AS expiresAt,
           s.last_seen_at AS lastSeenAt, u.email, u.is_admin AS isAdmin
    FROM sessions s JOIN users u ON s.user_id = u.id
    WHERE s.id_hash = ?
  `).get(idh);
  if (!row) return null;
  if (nowIso >= row.expiresAt) return null;                       // absolut abgelaufen
  const idleMs = nowMs - Date.parse(row.lastSeenAt);
  if (idleMs >= SESSION_IDLE_HOURS * 3600 * 1000) return null;    // idle abgelaufen
  if (idleMs >= LAST_SEEN_THROTTLE_MS) {                          // gedrosselter Bump
    db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id_hash = ?').run(nowIso, idh);
  }
  return { userId: row.userId, email: row.email, isAdmin: !!row.isAdmin };
}

/** Beendet eine Sitzung (Logout) per Roh-ID. */
function deleteSession(raw) {
  db.prepare('DELETE FROM sessions WHERE id_hash = ?').run(hashToken(raw));
}

/** Löscht alle Sitzungen eines Nutzers (z.B. bei Nutzer-Löschung; CASCADE deckt es ohnehin ab). */
function deleteUserSessions(userId) {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

/**
 * Legt den Admin aus ADMIN_EMAIL an (is_admin=1) bzw. befördert ihn; idempotent.
 * Fail-Fast: leere/fehlende/ungültige E-Mail wirft — der Server darf dann nicht starten.
 * @returns {number} adminUserId
 */
function seedAdmin(adminEmail) {
  const email = normalizeEmail(adminEmail || '');
  if (!email || !email.includes('@')) {
    throw new Error('ADMIN_EMAIL fehlt oder ist ungültig — Server-Start abgebrochen (Fail-Fast).');
  }
  const now = new Date().toISOString();
  const existing = db.prepare('SELECT id, is_admin FROM users WHERE email = ?').get(email);
  if (!existing) {
    const info = db.prepare('INSERT INTO users (email, is_admin, created_at) VALUES (?, 1, ?)').run(email, now);
    return Number(info.lastInsertRowid);
  }
  if (!existing.is_admin) {
    db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(existing.id);
  }
  return Number(existing.id);
}

module.exports = {
  normalizeEmail, hashToken, createLoginToken, consumeLoginToken,
  createSession, validateSession, deleteSession, deleteUserSessions,
  seedAdmin,
  TOKEN_TTL_MIN, SESSION_TTL_DAYS, SESSION_IDLE_HOURS,
};
