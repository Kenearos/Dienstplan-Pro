# PRD Addendum — Technical Depth (Team-Release v1.0)

*Technical-how that does not belong in the PRD but feeds Architecture / Epics / Dev. Authoritative source: `docs/superpowers/specs/2026-07-07-team-multiuser-design.md` + approved plan.*

## Decision rationale (options considered)

- **Passwortlos statt Passwort-Login:** kein Passwort-Speicher/-Reset, geringere Angriffsfläche, weniger Support. Trade-off: E-Mail-Zustellung wird kritischer Pfad (→ SPF/DKIM).
- **Server-Sessions statt JWT:** widerrufbar (Logout, Nutzer-Löschung), kein Secret-Rotation-Aufwand. Trade-off: DB-Lookup pro Request (vernachlässigbar bei better-sqlite3 synchron).
- **Token- UND Session-Hashing (SHA-256):** aus externem Review übernommen — bei DB-Leak wertlos. (Rohwert nur im Link/Cookie.)
- **Kein `cookie-parser`:** `res.cookie()` ist nativ in Express; Lesen via kleiner Helfer → keine Dependency.
- **Verworfen:** `db.run()`-Stil (node-sqlite3-API, existiert nicht in better-sqlite3); CORS (same-origin).

## Schema-Deltas (`server/db.js`)

- Pragma: `db.pragma('foreign_keys = ON')` (sonst wirkt CASCADE nicht).
- `users(id PK, email UNIQUE lowercase, is_admin, created_at)`.
- `login_tokens(token_hash PK, user_id → users ON DELETE CASCADE, expires_at, used_at)`.
- `sessions(id_hash PK, user_id → users ON DELETE CASCADE, expires_at, created_at)`.
- `documents`: neuer zusammengesetzter PK `(user_id, key)` → **Table-Rebuild** (SQLite kann PK nicht per ALTER ändern): `documents_v2` anlegen → `INSERT … SELECT <adminId>, …` → `DROP` → `RENAME`. Guard: nur wenn `documents` noch keine `user_id`-Spalte hat.
- `history`: `ADD COLUMN user_id` + `UPDATE … WHERE user_id IS NULL`.
- `getDoc(userId,key)` / `putDoc(userId,key,value,now)` — strikt nach `user_id` gefiltert.

## Startup-Reihenfolge (kritisch)

`seedAdmin(ADMIN_EMAIL)` **zuerst** (liefert `adminUserId`) → **dann** `migrateToMultiUser(adminUserId)`. Sonst kann die Migration Alt-Zeilen keinem Admin zuordnen. Beides idempotent, läuft vor `listen`.

## Neue Backend-Dateien

- `server/auth.js` — `hashToken`, `createLoginToken`/`consumeLoginToken`, `createSession`/`validateSession`/`deleteSession`/`deleteUserSessions`, `seedAdmin`, `migrateToMultiUser`, `authMiddleware`, `adminMiddleware`. better-sqlite3-synchron, kein `async`.
- `server/mailer.js` — `sendMagicLink(email,url)` via `nodemailer`; ohne SMTP-Config → `console.log(link)` (Dev/Test), kein Wurf.
- `server/ratelimit.js` — In-Memory `Map<key,{count,resetAt}>`; per-Prozess (resettet bei Neustart — für einen Container ok).

## Endpunkte

`POST /api/auth/request` (neutral, rate-limited) · `GET /auth?token=` (einlösen → Cookie → 302) · `POST /api/auth/logout` · `GET /api/auth/me` · `GET/PUT /api/state` (hinter `authMiddleware`, nutzen `req.user.id`) · `GET/POST/DELETE /api/admin/users` (hinter `authMiddleware`+`adminMiddleware`).

Cookie setzen: `res.cookie('session', raw, {httpOnly:true, secure:true, sameSite:'lax', maxAge})`. Lesen: Helfer `readCookie(req,'session')`.

## Frontend-Integrationspunkte

- `index.html`: Login-Overlay am Anfang `<body>` (initial sichtbar); App-Container initial versteckt; in `#tab-settings` Logout-Button + Admin-Sektion (versteckt).
- `app.js` Bootstrap: `GET /api/auth/me` **vor** App-Start; 401 → Overlay; sonst Nutzerwechsel-Check → `DataSync.boot()` → Admin-Sektion bei `isAdmin`.
- `sync.js`: beide `fetch` mit `credentials:'include'`; 401 → Overlay + Sync stopp.
- `storage.js`: `clearUserData()` — nur Datenschlüssel + `pending` leeren (OpenRouter-Key/Modell bleiben). `dienstplan_current_user` hält den eingeloggten Nutzer.
- `sw.js`: Cache-Version bumpen.

## Env-Variablen

`ADMIN_EMAIL`, `APP_BASE_URL`, `SESSION_TTL_DAYS=30`, `RATE_LIMIT_EMAIL=5`, `RATE_LIMIT_WINDOW_MIN=15`, `SMTP_HOST/PORT/SECURE/USER/PASS/FROM`. Secrets nur als Env.

## Deployment-Notizen

- Neue Dependency `nodemailer`. Docker `node:20-slim`, Volume `dienstplan-data:/data`, hinter Caddy.
- SPF + DKIM beim Mail-Provider einrichten (sonst Magic-Links im Spam).
- Server zieht von GitHub `Kenearos/Dienstplan-Pro`; Deploy per SSH-Key `id_ed25519_hetzner`; Container-Env um obige Variablen erweitern.

## Verifikation (Kurz)

Node-Unit-Tests (Token-Hash/Consume, Session validate/delete, Migration idempotent, Rate-Limit, Datentrennung 2 Nutzer, 401/403). Browser-E2E: Server ohne SMTP → Magic-Link in Konsole → kompletter Login-/Trennungs-/Logout-/Nutzerwechsel-Durchlauf. Migration gegen Prod-DB-Kopie.

## Review-Nachträge (Opus-4-Linsen + qwen)

- **Migrations-Atomarität** ist bei **SQLite** real gegeben (echte Transaktion inkl. DDL) — kein Datei-Rollback nötig; Guard über `documents.user_id`-Existenz. Migration + history-Update in **einer** Transaktion, sonst Teilabbruch-Risiko (verwaiste history).
- **Session-Invalidierung bei Nutzer-Löschung** funktioniert per `sessions.user_id`-FK + CASCADE (kein Reverse-Lookup vom Hash nötig — user_id ist indiziert). Logout löscht per Hash des präsentierten Cookies.
- **`user_id` nur aus Session:** In `authMiddleware` gesetzt; `/api/state` liest `req.user.id`, ignoriert jeden client-seitigen `user_id`. Eigener Test: manipulierte `user_id` im Body/Query hat keinen Effekt.
- **E-Mail-Normalisierung** = eine Funktion `normalizeEmail(lowercase+trim)`, identisch bei `seedAdmin`, Allowlist-Insert (FR-9) und Login-Request-Abgleich (FR-1).
- **Audit-Log:** append-only, Felder `ts, event, user_id (pseudonym), ip_hash?` — **keine E-Mail/Namen**. Events: login_ok, logout, admin_add/remove, emergency_link, auth_fail. Macht SM-1 (distinct user_id) und SM-3 (auth_fail-Häufung) auswertbar.
- **Deploy-Guard:** Pipeline/Startup prüft `ADMIN_EMAIL` gesetzt+valide **vor** Live (Fail-Fast in `seedAdmin`, zusätzlich Deploy-Checkliste).
- **OpenRouter-Key beim Nutzerwechsel:** wird geleert (Kosten-/Secret-Schutz auf geteiltem PC). Bewusste Abwägung gegen Komfort; auf Einzelgeräten neu einzugeben.
- **Foto-Import-Ambiguität** (zwei ähnliche Namen): bestehende Levenshtein-≤2-Heuristik; bei Mehrdeutigkeit besser als „unbekannt" behandeln (Nutzer entscheidet in der Vorschau) — bestehende Funktion, keine v1-Änderung erzwungen.
