# Architektur — Dienstplan-Pro Team-Release v1.0

*BMAD Phase 3 (Solutioning). Die „lean spine": Invarianten, aus denen alles Konsistente folgt. Leitet sich aus `prd-dienstplan-pro-2026-07-07/prd.md` + `addendum.md` ab. Brownfield — baut auf `project-context.md`.*

## 1. Architektur-Invarianten (nicht verhandelbar)

1. **Datentrennung ist server-erzwungen.** Jede Datenoperation ist auf `req.user.id` gefiltert. `user_id` stammt **ausschließlich** aus dem Session-Kontext, **nie** aus dem Client. Auch der Admin liest nur seine eigene Datenbasis.
2. **Kein Klartext-Geheimnis in der DB.** Login-Tokens und Session-IDs liegen nur als SHA-256-Hash vor; der Rohwert existiert nur im Link (einmalig) bzw. im httpOnly-Cookie.
3. **`foreign_keys = ON`** — sonst wirkt kein CASCADE. Löschen eines Nutzers räumt Tokens+Sessions atomar.
4. **Seed vor Migration.** `seedAdmin(ADMIN_EMAIL)` liefert `adminUserId`, **dann** `migrateToMultiUser(adminUserId)`. Fehlt/ungültig `ADMIN_EMAIL` → Fail-Fast, keine Migration.
5. **Migration ist eine einzige SQLite-Transaktion** (documents-Rebuild + history), idempotent (Guard: `documents.user_id` existiert schon?). Kein halb-migrierter Zustand.
6. **Auth ist additiv, nie im kritischen Offline-Pfad.** `401` (ungültige Session) → Login-Overlay; Netzwerkfehler (offline) → App läuft lokal weiter. Die beiden werden nie verwechselt.
7. **Same-origin.** Ein Node/Express-Prozess serviert Frontend + API. Kein CORS.
8. **better-sqlite3 ist synchron.** Niemals `db.run()`; immer `db.prepare().run()`/`db.exec()`. Keine `async` DB-Funktionen.

## 2. Komponenten

### Backend (`server/`)
| Datei | Verantwortung | Status |
|---|---|---|
| `db.js` | Verbindung, Pragmas (WAL, `foreign_keys=ON`), Schema, `getDoc(userId,key)`/`putDoc(userId,key,…)` | ändern |
| `auth.js` | `normalizeEmail`, `hashToken`, `createLoginToken`/`consumeLoginToken`, `createSession`/`validateSession`/`deleteSession`/`deleteUserSessions`, `seedAdmin`, `migrateToMultiUser`, `authMiddleware`, `adminMiddleware`, `listUsers`/`addUser`/`removeUser` (Last-Admin-Guard) | **neu** |
| `mailer.js` | `sendMagicLink(email,url)` via nodemailer; ohne SMTP → `console.log` (Dev) | **neu** |
| `ratelimit.js` | In-Memory `hit(key,limit,windowMin)`; E-Mail primär, IP großzügig | **neu** |
| `audit.js` | append-only Log (`ts,event,user_id,ip_hash`), keine PII | **neu** |
| `index.js` | Routen + Middleware + Cookie-Helfer; Startup-Sequenz (seed→migrate→listen) | ändern |
| `backup.js` | unverändert (tägliches Online-Backup) | — |

### Frontend
| Datei | Verantwortung | Status |
|---|---|---|
| `index.html` | Login-Overlay (Vollbild, initial sichtbar) + Bestätigungsseite-Route + Admin-Sektion/Logout in `#tab-settings` | ändern |
| `app.js` | Bootstrap: `GET /api/auth/me` vor App-Start; Offline≠401; Nutzerwechsel; Admin-UI-Logik | ändern |
| `sync.js` | `credentials:'include'`; 401→Overlay, Netzfehler→lokal; pending-Schutz | ändern |
| `storage.js` | `clearUserData()` (Daten-Keys + OpenRouter-Key), `dienstplan_current_user` | ändern |
| `auth-ui.js` | schlanke Login-/Bestätigungs-/Admin-Interaktion (neu, hält `app.js` fokussiert) | **neu** |
| `sw.js` | Cache-Version bump | ändern |

## 3. Datenmodell

```
users(id PK, email UNIQUE [normalisiert], is_admin, created_at)
login_tokens(token_hash PK, user_id FK→users ON DELETE CASCADE, expires_at, used_at)
sessions(id_hash PK, user_id FK→users ON DELETE CASCADE, expires_at, created_at, last_seen_at)
documents(user_id, key, value, updated_at, PRIMARY KEY(user_id,key))   -- Rebuild
history(…, user_id)                                                     -- ADD COLUMN
audit_log(id PK, ts, event, user_id, ip_hash)                           -- neu, keine PII
```
`last_seen_at` trägt den Idle-Timeout (FR-3): bei jeder Auth-geschützten Anfrage aktualisiert; `validateSession` prüft `now-last_seen_at < SESSION_IDLE_HOURS` **und** `now < expires_at`.

## 4. Kern-Flows

- **Login-Request:** `POST /api/auth/request` → `ratelimit(email)` → `normalizeEmail` → user in Allowlist? → alte offene Tokens invalidieren → `createLoginToken` → `sendMagicLink` → **immer** neutrale 200.
- **Einlösung (scanner-sicher):** `GET /auth?token=` → Bestätigungsseite (kein Verbrauch). `POST /auth/confirm` → `consumeLoginToken` (Hash-Vergleich, unused, <30min, `used_at` setzen) → `createSession` → Cookie → 302 `/`.
- **Session-Check:** `authMiddleware` liest Cookie → `validateSession` (Hash→sessions JOIN users, expires + idle) → `req.user`; sonst 401 + Cookie clear. `last_seen_at` bump.
- **Migration (Startup):** Fail-Fast `ADMIN_EMAIL` → `seedAdmin` → `migrateToMultiUser(adminId)` (eine Transaktion) → `listen`.
- **Nutzerwechsel (Frontend):** `me.email` ≠ `dienstplan_current_user` (oder keiner) → `clearUserData()` → `DataSync.boot()`.
- **Admin entfernt Nutzer:** `DELETE /api/admin/users/:id` → Last-Admin-Guard → delete user → CASCADE räumt tokens/sessions → audit.

## 5. Sicherheits-Architektur

Hashing (Token+Session) · httpOnly/Secure/SameSite=Lax · Einmal-Token 30min + neutrale Antwort + Rate-Limit (E-Mail primär) · scanner-sichere POST-Einlösung · Idle-Timeout · Token in Access-Logs maskieren (Caddy) · Audit-Log ohne PII · `user_id` nur aus Session (Anti-IDOR).

## 6. Technologie-Entscheidungen

- **nodemailer** (einzige neue Dependency) für SMTP; Konsolen-Fallback.
- **Kein cookie-parser** — `res.cookie()` nativ, Lesen via Mini-Helfer.
- **Server-Sessions** (widerrufbar) statt JWT.
- **Rate-Limit in-memory** (per-Prozess; für einen Container ok — Ceiling dokumentiert).

## 7. Test-Architektur

Node-`--test`: `auth.test.js` (hash/consume/session/migration/last-admin/normalizeEmail/anti-IDOR), `ratelimit.test.js`, `state.test.js` (2-Nutzer-Trennung + 401/403). Browser-E2E (wie Stufe 1): kompletter Login/Trennung/Logout/Nutzerwechsel-Durchlauf mit Konsolen-Magic-Link.

## 8. Deployment-Architektur

Docker `node:20-slim` hinter Caddy, Volume `dienstplan-data:/data`. Neue Env: `ADMIN_EMAIL, APP_BASE_URL, SESSION_TTL_DAYS=30, SESSION_IDLE_HOURS=8, RATE_LIMIT_EMAIL=5, RATE_LIMIT_WINDOW_MIN=15, RATE_LIMIT_IP=…, SMTP_*`. SPF/DKIM Voraussetzung. Deploy-Guard prüft `ADMIN_EMAIL` vor Live.

## 9. Verfeinerungen (qwen-Architektur-Gate)

**Übernommen:**
- **`cookie-parser`** statt handgerolltem Parsing (2. Dependency neben `nodemailer`) — vermeidet Encoding-/Flag-Fehler. Setzen weiterhin via `res.cookie()`.
- **Gedrosselter `last_seen_at`-Write:** nur aktualisieren, wenn älter als ~5 Min → kein Write pro Request, keine Lock-Contention.
- **FK-Indizes:** `CREATE INDEX` auf `login_tokens.user_id` und `sessions.user_id` (schnelles CASCADE/Cleanup).
- **CSRF + Fixierungsschutz:** Die Bestätigungs-POST (`/auth/confirm`) trägt den Token aus der Seite (CSRF-Angreifer hat ihn nicht) + ein Form-CSRF-Token; die Session wird **neu** erst bei erfolgreichem Consume erzeugt (kein Cookie vor Confirm → keine Session-Fixation).

**Bewusst akzeptiert (Team-Skala, Ceiling dokumentiert):**
- better-sqlite3 synchron blockiert den Event-Loop minimal — bei einstelliger Nutzerzahl irrelevant; kein Web-Scale-Locking-Thema.
- Rate-Limit in-memory (resettet bei Restart) — bei Magic-Link ohne Passwort kaum Brute-Force-Fläche; Persistenz = YAGNI.
- Migration auf kleinem Datenbestand (hunderte Dienste) — kein OOM/Tx-Log-Thema.
- Login-Token-Race bei Parallel-Klick: neuster Link gewinnt, tolerierbar.
