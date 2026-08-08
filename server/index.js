const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const { db, getDoc, putDoc } = require('./db');
const duties = require('./duties');
const { migriere } = require('./migrate-duties');
const { hashPasswort, pruefePasswort, PASSWORT_MIN } = require('./passwords');
const { scheduleBackups } = require('./backup');
const { audit } = require('./audit');
const { hit } = require('./ratelimit');
const { sendMagicLink } = require('./mailer');
const {
  normalizeEmail, hashToken, createLoginToken, consumeLoginToken,
  createSession, validateSession, deleteSession, deleteUserSessions, SESSION_TTL_DAYS,
  seedAdmin, migrateToMultiUser,
} = require('./auth');

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

const KEYS = ['employees', 'duties', 'vacation'];
const EMPTY = { employees: [], duties: {}, vacation: {} };

const RATE_LIMIT_EMAIL = parseInt(process.env.RATE_LIMIT_EMAIL, 10) || 5;
const RATE_LIMIT_IP = parseInt(process.env.RATE_LIMIT_IP, 10) || 50;
const RATE_LIMIT_WINDOW_MIN = parseInt(process.env.RATE_LIMIT_WINDOW_MIN, 10) || 15;

const SESSION_COOKIE = 'session';
// Secure-by-default; nur für lokalen HTTP-Dev per COOKIE_INSECURE=true abschaltbar.
const cookieSecure = process.env.COOKIE_INSECURE !== 'true';

function setSessionCookie(res, raw) {
  res.cookie(SESSION_COOKIE, raw, {
    httpOnly: true, secure: cookieSecure, sameSite: 'lax',
    maxAge: SESSION_TTL_DAYS * 86400 * 1000, path: '/',
  });
}
function clearSessionCookie(res) { res.clearCookie(SESSION_COOKIE, { path: '/' }); }
function ipHashOf(req) { return hashToken(req.ip || ''); }
function baseUrl(req) { return process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`; }
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function authMiddleware(req, res, next) {
  const raw = req.cookies && req.cookies[SESSION_COOKIE];
  const u = raw ? validateSession(raw) : null;
  if (!u) { clearSessionCookie(res); return res.status(401).json({ error: 'nicht angemeldet' }); }
  req.user = { id: u.userId, email: u.email, isAdmin: u.isAdmin };
  next();
}
function adminMiddleware(req, res, next) {
  if (!req.user || !req.user.isAdmin) return res.status(403).json({ error: 'Admin-Rechte erforderlich' });
  next();
}

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// ── Auth ──────────────────────────────────────────────────────────────
// Login-Link anfordern: neutral (verrät keine Allowlist-Mitgliedschaft), rate-limited.
app.post('/api/auth/request', async (req, res) => {
  const email = normalizeEmail((req.body && req.body.email) || '');
  const ipH = ipHashOf(req);
  const okEmail = hit('email:' + email, RATE_LIMIT_EMAIL, RATE_LIMIT_WINDOW_MIN);
  const okIp = hit('ip:' + ipH, RATE_LIMIT_IP, RATE_LIMIT_WINDOW_MIN);
  if (!okEmail || !okIp) { audit('auth_fail', null, ipH); return res.status(429).json({ error: 'Zu viele Anfragen.' }); }
  const user = email ? db.prepare('SELECT id FROM users WHERE email = ?').get(email) : null;
  if (user) {
    db.prepare('UPDATE login_tokens SET used_at = ? WHERE user_id = ? AND used_at IS NULL')
      .run(new Date().toISOString(), user.id);
    const raw = createLoginToken(user.id);
    try { await sendMagicLink(email, `${baseUrl(req)}/auth?token=${raw}`); }
    catch (e) { console.error('sendMagicLink fehlgeschlagen:', e.message); } // neutral bleiben, nie hängen
  }
  res.json({ ok: true }); // immer identisch
});

// Scanner-sichere Einlösung: GET zeigt nur die Bestätigungsseite (verbraucht NICHT).
app.get('/auth', (req, res) => {
  const token = String(req.query.token || '');
  res.set('Content-Type', 'text/html; charset=utf-8').send(`<!doctype html><html lang="de"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Anmelden – Dienstplan-Pro</title><style>body{font-family:system-ui,sans-serif;background:linear-gradient(135deg,#667eea,#764ba2);min-height:100vh;display:flex;align-items:center;justify-content:center;margin:0}.card{background:#fff;padding:2rem;border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,.2);max-width:360px;text-align:center}h1{font-size:1.2rem;margin:0 0 .5rem}p{color:#555;font-size:.9rem}button{margin-top:1rem;background:#667eea;color:#fff;border:0;padding:.75rem 1.5rem;border-radius:8px;font-size:1rem;cursor:pointer}</style></head>
<body><div class="card"><h1>Bei Dienstplan-Pro anmelden</h1><p>Klicke auf „Jetzt anmelden", um deine Sitzung zu starten.</p>
<form method="POST" action="/auth/confirm"><input type="hidden" name="token" value="${escapeHtml(token)}"><button type="submit">Jetzt anmelden</button></form></div></body></html>`);
});

// Bestätigung (menschlicher POST) verbraucht den Token und erzeugt die Sitzung.
app.post('/auth/confirm', (req, res) => {
  const token = String((req.body && req.body.token) || '');
  const user = consumeLoginToken(token);
  if (!user) {
    return res.status(400).set('Content-Type', 'text/html; charset=utf-8').send(`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Link ungültig</title><style>body{font-family:system-ui,sans-serif;background:linear-gradient(135deg,#667eea,#764ba2);min-height:100vh;display:flex;align-items:center;justify-content:center;margin:0}.card{background:#fff;padding:2rem;border-radius:12px;max-width:360px;text-align:center}a{color:#667eea}</style></head><body><div class="card"><h1>Link ungültig oder abgelaufen</h1><p>Bitte fordere einen neuen Login-Link an.</p><a href="/">Zur Startseite</a></div></body></html>`);
  }
  const raw = createSession(user.userId); // neue Sitzung erst bei erfolgreichem Consume (keine Fixation)
  setSessionCookie(res, raw);
  audit('login_ok', user.userId, ipHashOf(req));
  res.redirect(302, '/');
});

app.post('/api/auth/logout', (req, res) => {
  const raw = req.cookies && req.cookies[SESSION_COOKIE];
  if (raw) { const u = validateSession(raw); deleteSession(raw); if (u) audit('logout', u.userId); }
  clearSessionCookie(res);
  res.json({ ok: true });
});

// ── Passwoerter ──────────────────────────────────────────────────────
// Bewusste Entscheidung des Betreibers (2026-08-08): wer eine freigeschaltete
// Adresse kennt, darf ihr Passwort setzen, SOLANGE noch keines gesetzt ist.
// Danach ist das Konto zu. Jede Einrichtung geht ins Audit-Log, damit
// nachvollziehbar bleibt, wann ein Konto beansprucht wurde.
app.post('/api/auth/set-password', (req, res) => {
  const email = normalizeEmail((req.body && req.body.email) || '');
  const passwort = (req.body && req.body.password) || '';
  if (typeof passwort !== 'string' || passwort.length < PASSWORT_MIN) {
    return res.status(400).json({ error: `Das Passwort muss mindestens ${PASSWORT_MIN} Zeichen haben.` });
  }
  if (!hit(`pwset:${req.ip}`, RATE_LIMIT_IP, RATE_LIMIT_WINDOW_MIN)) {
    return res.status(429).json({ error: 'Zu viele Versuche. Bitte später erneut.' });
  }
  const user = email ? db.prepare('SELECT id, password_hash, active FROM users WHERE email = ?').get(email) : null;
  // Neutral bleiben: die Antwort verraet nicht, ob die Adresse freigeschaltet ist.
  if (!user || !user.active) return res.json({ ok: true });
  if (user.password_hash) {
    return res.status(409).json({ error: 'Für dieses Konto ist bereits ein Passwort gesetzt.' });
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPasswort(passwort), user.id);
  audit('password_claimed', user.id, ipHashOf(req));
  res.json({ ok: true });
});

app.post('/api/auth/login', (req, res) => {
  const email = normalizeEmail((req.body && req.body.email) || '');
  const passwort = (req.body && req.body.password) || '';
  if (!hit(`pwlogin:${req.ip}`, RATE_LIMIT_IP, RATE_LIMIT_WINDOW_MIN)
      || !hit(`pwlogin:${email}`, RATE_LIMIT_EMAIL, RATE_LIMIT_WINDOW_MIN)) {
    return res.status(429).json({ error: 'Zu viele Versuche. Bitte später erneut.' });
  }
  const user = email ? db.prepare('SELECT id, password_hash, active FROM users WHERE email = ?').get(email) : null;
  // Eine einzige Meldung fuer alle Fehlerfaelle — sonst verraet sie, welche
  // Adressen es gibt und welche ein Passwort haben.
  const abweisen = () => res.status(401).json({ error: 'E-Mail oder Passwort stimmt nicht.' });
  if (!user || !user.active || !user.password_hash) return abweisen();
  if (!pruefePasswort(passwort, user.password_hash)) {
    audit('login_failed', user.id, ipHashOf(req));
    return abweisen();
  }
  setSessionCookie(res, createSession(user.id));
  audit('login_ok', user.id, ipHashOf(req));
  res.json({ ok: true });
});

// Eigenes Passwort aendern (angemeldet) — auch der Weg nach einem Notfall-Link.
app.post('/api/auth/change-password', authMiddleware, (req, res) => {
  const passwort = (req.body && req.body.password) || '';
  if (typeof passwort !== 'string' || passwort.length < PASSWORT_MIN) {
    return res.status(400).json({ error: `Das Passwort muss mindestens ${PASSWORT_MIN} Zeichen haben.` });
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPasswort(passwort), req.user.id);
  audit('password_changed', req.user.id, ipHashOf(req));
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  const raw = req.cookies && req.cookies[SESSION_COOKIE];
  const u = raw ? validateSession(raw) : null;
  if (!u) return res.status(401).json({ error: 'nicht angemeldet' });
  // id: die Oberflaeche muss eigene von fremden Eintraegen unterscheiden koennen.
  res.json({ id: u.userId, email: u.email, isAdmin: u.isAdmin });
});

// Notzugang: Admin erzeugt einen Login-Link out-of-band (audit-geloggt).
app.post('/api/admin/login-link', authMiddleware, adminMiddleware, (req, res) => {
  const email = normalizeEmail((req.body && req.body.email) || '');
  const user = email ? db.prepare('SELECT id FROM users WHERE email = ?').get(email) : null;
  if (!user) return res.status(404).json({ error: 'E-Mail nicht freigeschaltet' });
  const raw = createLoginToken(user.id);
  audit('emergency_link', user.id, ipHashOf(req));
  res.json({ url: `${baseUrl(req)}/auth?token=${raw}` });
});

// ── Admin: Nutzerverwaltung (Allowlist) ──────────────────────────────
app.get('/api/admin/users', authMiddleware, adminMiddleware, (req, res) => {
  const rows = db.prepare('SELECT id, email, is_admin, display_name, active FROM users ORDER BY email').all();
  res.json({
    users: rows.map(u => ({
      id: u.id, email: u.email, isAdmin: !!u.is_admin,
      name: u.display_name || null, active: !!u.active,
    })),
  });
});

app.post('/api/admin/users', authMiddleware, adminMiddleware, (req, res) => {
  const email = normalizeEmail((req.body && req.body.email) || '');
  // Der Anzeigename ist optional, aber ohne ihn steht im Aushang nur der
  // E-Mail-Anfang — und der Alt-Datenabgleich braucht ihn.
  const name = ((req.body && req.body.name) || '').trim() || null;
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Ungültige E-Mail' });
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (!existing) {
    db.prepare('INSERT INTO users (email, is_admin, created_at, display_name) VALUES (?, 0, ?, ?)')
      .run(email, new Date().toISOString(), name);
    audit('admin_add', req.user.id, ipHashOf(req));
  } else if (name && name !== existing.display_name) {
    db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(name, existing.id);
  }
  res.json({ ok: true });
});

app.put('/api/admin/users/:id/name', authMiddleware, adminMiddleware, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const name = ((req.body && req.body.name) || '').trim();
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Ungültige ID' });
  if (!name) return res.status(400).json({ error: 'Name darf nicht leer sein' });
  const info = db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(name, id);
  if (!info.changes) return res.status(404).json({ error: 'Nutzer nicht gefunden' });
  res.json({ ok: true });
});

app.post('/api/admin/users/:id/activate', authMiddleware, adminMiddleware, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Ungültige ID' });
  const info = db.prepare('UPDATE users SET active = 1 WHERE id = ?').run(id);
  if (!info.changes) return res.status(404).json({ error: 'Nutzer nicht gefunden' });
  audit('admin_activate', req.user.id, ipHashOf(req));
  res.json({ ok: true });
});

// Welche Namen aus den Altdaten haben schon ein Konto, welche nicht?
app.get('/api/admin/legacy-names', authMiddleware, adminMiddleware, (req, res) => {
  const doc = getDoc(req.user.id, 'duties');
  const namen = Object.keys((doc && doc.value) || {});
  const bekannt = new Set(
    db.prepare('SELECT display_name FROM users WHERE display_name IS NOT NULL').all().map(r => r.display_name),
  );
  res.json({
    offen: namen.filter(n => !bekannt.has(n)),
    zugeordnet: namen.filter(n => bekannt.has(n)),
  });
});

// Alt-Dienste uebernehmen — zugeordnet ueber die Anzeigenamen.
app.post('/api/admin/migrate-legacy', authMiddleware, adminMiddleware, (req, res) => {
  const idsNachName = {};
  for (const r of db.prepare('SELECT id, display_name FROM users WHERE display_name IS NOT NULL').all()) {
    idsNachName[r.display_name] = r.id;
  }
  try {
    const erg = migriere({ adminUserId: req.user.id, zuordnung: idsNachName });
    audit('legacy_migration', req.user.id, ipHashOf(req));
    res.json(erg);
  } catch (e) {
    // Unzugeordnete Namen sind kein Serverfehler, sondern eine Aufgabe fuer den Admin.
    res.status(409).json({ error: e.message });
  }
});

app.delete('/api/admin/users/:id', authMiddleware, adminMiddleware, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Ungültige ID' });
  const target = db.prepare('SELECT id, is_admin FROM users WHERE id = ?').get(id);
  if (!target) return res.status(404).json({ error: 'Nutzer nicht gefunden' });
  if (target.id === req.user.id) return res.status(400).json({ error: 'Du kannst dich nicht selbst entfernen.' });
  if (target.is_admin && db.prepare('SELECT COUNT(*) c FROM users WHERE is_admin = 1').get().c <= 1) {
    return res.status(400).json({ error: 'Der letzte Admin kann nicht entfernt werden.' });
  }
  // Dienste sind die Grundlage gezahlter Verguetung. Ein Konto, an dem welche
  // haengen, darf nicht per Klick verschwinden — dafuer gibt es deactivate.
  const anzahl = db.prepare('SELECT COUNT(*) c FROM duties WHERE user_id = ?').get(id).c;
  if (anzahl > 0) {
    return res.status(409).json({
      error: 'Dieses Konto hat Dienste und darf nicht gelöscht werden — bitte deaktivieren.',
    });
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(id); // CASCADE räumt Sessions/Tokens
  audit('admin_remove', req.user.id, ipHashOf(req));
  res.json({ ok: true });
});

// Ausscheiden heisst deaktivieren: Anmeldung gesperrt, Historie bleibt.
app.post('/api/admin/users/:id/deactivate', authMiddleware, adminMiddleware, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Ungültige ID' });
  const target = db.prepare('SELECT id, is_admin FROM users WHERE id = ?').get(id);
  if (!target) return res.status(404).json({ error: 'Nutzer nicht gefunden' });
  if (target.is_admin && db.prepare('SELECT COUNT(*) c FROM users WHERE is_admin = 1 AND active = 1').get().c <= 1) {
    return res.status(400).json({ error: 'Der letzte aktive Admin kann nicht deaktiviert werden.' });
  }
  db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(id);
  deleteUserSessions(id);
  audit('admin_deactivate', req.user.id, ipHashOf(req));
  res.json({ ok: true });
});

// ── Daten pro Nutzer (hinter Auth; user_id NUR aus der Session, nie aus dem Client) ──
app.get('/api/state', authMiddleware, (req, res) => {
  const state = { ...EMPTY, updatedAt: null };
  for (const key of KEYS) {
    const doc = getDoc(req.user.id, key);
    if (doc) { state[key] = doc.value; if (!state.updatedAt || doc.updatedAt > state.updatedAt) state.updatedAt = doc.updatedAt; }
  }
  res.json(state);
});
app.put('/api/state', authMiddleware, (req, res) => {
  const body = req.body || {};
  const now = new Date().toISOString();
  for (const key of KEYS) { if (body[key] !== undefined) putDoc(req.user.id, key, body[key], now); }
  res.json({ status: 'ok', updatedAt: now });
});

// ── Dienste als Datensaetze ──────────────────────────────────────────
// user_id kommt ausschliesslich aus der Session (req.user.id) — die
// v1.0-Invariante gilt unveraendert fuer jeden Schreibzugriff.
function fachFehlerAntwort(res, e) {
  const codes = { UNGUELTIG: 400, NICHT_GEFUNDEN: 404, DOPPELT: 409, ENTSCHIEDEN: 409 };
  if (e instanceof duties.FachFehler) return res.status(codes[e.code] || 400).json({ error: e.nachricht });
  throw e;
}

app.post('/api/duties', authMiddleware, (req, res) => {
  const { date, share } = req.body || {};
  try {
    const { id } = duties.anlegen({ userId: req.user.id, date, share });
    res.status(201).json({ id });
  } catch (e) { fachFehlerAntwort(res, e); }
});

app.delete('/api/duties/:id', authMiddleware, (req, res) => {
  try {
    duties.loeschen({ userId: req.user.id, id: parseInt(req.params.id, 10) });
    res.json({ ok: true });
  } catch (e) { fachFehlerAntwort(res, e); }
});

// Aushang: bewusst kontouebergreifend lesbar, aber ohne jeden Betrag.
app.get('/api/roster', authMiddleware, (req, res) => {
  try {
    res.json({ duties: duties.monat(req.query.month) });
  } catch (e) { fachFehlerAntwort(res, e); }
});

app.get('/api/duties/pending', authMiddleware, adminMiddleware, (req, res) => {
  res.json({ duties: duties.offene() });
});

app.post('/api/duties/:id/decision', authMiddleware, adminMiddleware, (req, res) => {
  const { status, note } = req.body || {};
  try {
    const { selbst } = duties.entscheiden({
      adminId: req.user.id, id: parseInt(req.params.id, 10), status, note,
    });
    audit('duty_decision', req.user.id, ipHashOf(req));
    // Entscheidung ueber eigene Dienste ist erlaubt (kein zweiter Freigeber bei
    // acht Personen), muss aber in der Historie auffallen.
    if (selbst) audit('self_decision', req.user.id, ipHashOf(req));
    res.json({ ok: true });
  } catch (e) { fachFehlerAntwort(res, e); }
});

app.use(express.static(path.join(__dirname, '..')));

if (require.main === module) {
  // Startup-Reihenfolge: Fail-Fast auf ADMIN_EMAIL → Seed → Migration → listen.
  const adminId = seedAdmin(process.env.ADMIN_EMAIL);
  migrateToMultiUser(adminId);
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, '0.0.0.0', () => { console.log(`Dienstplan-Pro auf :${PORT}`); scheduleBackups(); });
}

module.exports = app;
module.exports.authMiddleware = authMiddleware;
module.exports.adminMiddleware = adminMiddleware;
