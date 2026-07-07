const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const { db, getDoc, putDoc } = require('./db');
const { scheduleBackups } = require('./backup');
const { audit } = require('./audit');
const { hit } = require('./ratelimit');
const { sendMagicLink } = require('./mailer');
const {
  normalizeEmail, hashToken, createLoginToken, consumeLoginToken,
  createSession, validateSession, deleteSession, SESSION_TTL_DAYS,
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
const cookieSecure = (process.env.APP_BASE_URL || '').startsWith('https') || process.env.NODE_ENV === 'production';

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
    await sendMagicLink(email, `${baseUrl(req)}/auth?token=${raw}`);
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

app.get('/api/auth/me', (req, res) => {
  const raw = req.cookies && req.cookies[SESSION_COOKIE];
  const u = raw ? validateSession(raw) : null;
  if (!u) return res.status(401).json({ error: 'nicht angemeldet' });
  res.json({ email: u.email, isAdmin: u.isAdmin });
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
