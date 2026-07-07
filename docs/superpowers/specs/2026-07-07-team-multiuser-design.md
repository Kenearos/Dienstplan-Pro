# Design: Mehrbenutzer mit Magic-Link (Team-Release v1.0)

**Status:** Entwurf zur Freigabe
**Datum:** 2026-07-07
**Branch:** `release/v1.0-team`

## 1. Ziel & Kontext

Dienstplan-Pro ist eine deutschsprachige PWA zur Bonus-Berechnung für Wochenend-/Feiertagsdienste (NRW). Bisher: Single-User, eine globale Datenbasis, öffentlich ohne Login. Ziel dieses Release: **das Team nutzt es**, jeder Kollege loggt sich ein und hat eine **eigene, getrennte** Datenbasis.

**Kern-Entscheidungen (aus dem Brainstorm festgezurrt):**

- **Login:** Magic-Link per E-Mail (passwortlos). Keine Passwörter, kein Passwort-Reset.
- **E-Mail-Versand:** `nodemailer` + SMTP eines eigenen Postfachs (Zugangsdaten als Env-Variablen).
- **Zugang:** Nur **freigeschaltete** E-Mails. Der Admin pflegt die Liste.
- **Rollen:** 1 **Admin** (verwaltet die Liste, hat eigene Daten) + n **Nutzer** (je eigene Daten).
- **Datentrennung:** pro Nutzer (`user_id`), serverseitig erzwungen.
- **Sessions:** serverseitige Session-Tabelle + httpOnly/Secure-Cookie, 30 Tage.

## 2. Nicht-Ziele (bewusst außen vor)

- Keine Passwort-Logins, kein SSO, keine 2FA.
- Keine Teilung/Zusammenarbeit an *derselben* Datenbasis (jeder ist isoliert; kein gleichzeitiges Editieren desselben Datensatzes → das bisherige „last-write-wins pro Nutzer" bleibt korrekt, weil jeder Nutzer allein auf seinen Daten arbeitet).
- Keine Mandanten-/Firmen-Ebene über den Nutzern.

## 3. Datenmodell (SQLite, Erweiterung von `server/db.js`)

Neue Tabellen:

```sql
CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT NOT NULL UNIQUE,      -- normalisiert: lowercase, getrimmt
  is_admin   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS login_tokens (
  token      TEXT PRIMARY KEY,          -- crypto.randomBytes(32).hex
  user_id    INTEGER NOT NULL,
  expires_at TEXT NOT NULL,             -- ISO, +15 Min
  used_at    TEXT                       -- NULL bis eingelöst (einmalig)
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,          -- crypto.randomBytes(32).hex
  user_id    INTEGER NOT NULL,
  expires_at TEXT NOT NULL,             -- ISO, +30 Tage
  created_at TEXT NOT NULL
);
```

Bestehende Tabellen bekommen `user_id`:

```sql
-- documents: PK wird (user_id, key)
ALTER TABLE documents ADD COLUMN user_id INTEGER;   -- Migration: siehe §7
ALTER TABLE history   ADD COLUMN user_id INTEGER;
```

`getDoc`/`putDoc` bekommen einen `userId`-Parameter und filtern strikt danach. Kein Codepfad liest je Daten ohne `user_id`-Filter.

> **SQLite-Hinweis:** Der neue zusammengesetzte Primärschlüssel `(user_id, key)` lässt sich nicht per `ALTER TABLE` setzen — SQLite kann keinen PK in-place ändern. Der Umbau erfolgt per **Table-Rebuild** in einer Transaktion: neue `documents_v2` mit `PRIMARY KEY (user_id, key)` anlegen, Daten kopieren (dabei `user_id` = Admin für Alt-Zeilen, siehe §7), alte Tabelle droppen, umbenennen. `history` braucht nur die zusätzliche Spalte (kein PK-Zwang), dort genügt `ADD COLUMN`. Migration einmalig und idempotent (Guard: nur ausführen, wenn `documents` noch keine `user_id`-Spalte hat).

## 4. Auth-Ablauf

```
1. Kollege öffnet App → GET /api/auth/me → 401 (keine Session)
2. Frontend zeigt Login-Screen: "E-Mail eingeben"
3. POST /api/auth/request { email }
   - E-Mail in users? → login_token anlegen, Magic-Link mailen
   - E-Mail NICHT in users? → nichts mailen
   - IMMER dieselbe neutrale Antwort 200 (keine Preisgabe, wer freigeschaltet ist)
   - Rate-Limit pro E-Mail + pro IP
4. Kollege klickt Link: GET /auth?token=…
   - Token gültig (existiert, nicht used, nicht abgelaufen)? → used_at setzen,
     Session anlegen, httpOnly-Cookie setzen, redirect auf /
   - sonst: Fehlerseite "Link ungültig/abgelaufen — neuen anfordern"
5. App lädt mit den Daten dieses Nutzers.
6. Logout: POST /api/auth/logout → Session löschen, Cookie leeren.
```

## 5. Backend-Endpunkte (`server/`)

Neue Dateien: `server/auth.js` (Token/Session-Logik), `server/mailer.js` (nodemailer-Wrapper). `server/index.js` bekommt die Routen + Auth-Middleware.

| Methode | Pfad | Zweck | Zugang |
|---|---|---|---|
| POST | `/api/auth/request` | Login-Link anfordern (neutral, rate-limited) | offen |
| GET | `/auth?token=…` | Token einlösen → Session + Cookie | offen |
| POST | `/api/auth/logout` | Session beenden | eingeloggt |
| GET | `/api/auth/me` | `{ email, isAdmin }` oder 401 | eingeloggt |
| GET | `/api/state` | eigene Daten lesen | eingeloggt |
| PUT | `/api/state` | eigene Daten schreiben | eingeloggt |
| GET | `/api/admin/users` | Nutzerliste | Admin |
| POST | `/api/admin/users` | E-Mail freischalten `{ email }` | Admin |
| DELETE | `/api/admin/users/:id` | Nutzer entfernen | Admin |

**Auth-Middleware:** liest Session-Cookie → `sessions` → `user_id`; hängt `req.user = { id, email, isAdmin }` an. Ohne gültige Session → 401. `/api/admin/*` zusätzlich `isAdmin` prüfen (403 sonst).

## 6. Frontend

- **Login-Screen** (neues, schlankes Overlay in `index.html`): E-Mail-Feld → „Link anfordern" → Bestätigung „Prüfe dein Postfach". Gate-t die gesamte App.
- **Bootstrap** (`app.js`): vor App-Start `GET /api/auth/me`. 401 → Login-Screen zeigen, App nicht instanziieren. OK → App + `DataSync.boot()` wie bisher.
- **`sync.js`:** alle `fetch` mit `credentials: 'include'`; bei 401 → Login-Screen + Sync stoppen.
- **Nutzer-Bindung von LocalStorage:** Der aktuell eingeloggte Nutzer wird in `localStorage['dienstplan_current_user']` gehalten. Weicht `auth/me.email` davon ab (Nutzerwechsel/geteilter Rechner) → LocalStorage-Datenschlüssel leeren, dann frisch vom Server laden. **Kein Vermischen zweier Nutzer.**
- **Logout-Button** (in Einstellungen): `POST /api/auth/logout` → LocalStorage leeren → Login-Screen.
- **Admin-Seite „Nutzer verwalten"** (in Einstellungen, nur wenn `isAdmin`): Liste der E-Mails, Feld zum Freischalten, Entfernen-Button.

## 7. Migration & Seed

Beim Serverstart:

1. **Admin-Seed:** `ADMIN_EMAIL` (Env) → falls kein User mit der E-Mail existiert, anlegen mit `is_admin=1`.
2. **Alt-Daten übernehmen:** `documents`/`history`-Zeilen mit `user_id IS NULL` → auf die Admin-`user_id` setzen. So werden die bisherigen (globalen) Daten dem Admin zugeordnet, nichts geht verloren.
3. Migration ist idempotent (mehrfacher Start unschädlich).

## 8. Konfiguration (Env-Variablen)

```
ADMIN_EMAIL       = deine Admin-Adresse (Seed + Alt-Daten-Zuordnung)
APP_BASE_URL      = https://bonus.pixel-by-design.de   (für Magic-Link-URLs)
SESSION_TTL_DAYS  = 30
SMTP_HOST         = smtp.dein-postfach.de
SMTP_PORT         = 587
SMTP_USER         = dienstplan@…
SMTP_PASS         = ****   (Secret, nie im Code/Repo)
SMTP_FROM         = "Dienstplan-Pro <dienstplan@…>"
```

Secrets ausschließlich als Env-Variablen (nie in DB, nie im Repo). Passt zu den vorhandenen CI-Policy-Gates (`secrets_in_env.rego`).

## 9. Sicherheit

- **Tokens:** kryptografisch zufällig (`crypto.randomBytes(32)`), einmalig (`used_at`), 15 Min gültig.
- **Sessions:** zufällige ID; Cookie `httpOnly; Secure; SameSite=Lax`; 30 Tage; Logout löscht serverseitig.
- **Neutralität:** `/api/auth/request` verrät nie, ob eine E-Mail freigeschaltet ist.
- **Rate-Limit:** `/api/auth/request` pro E-Mail und pro IP (gegen Mail-Spam/Enumeration).
- **Autorisierung:** jede Datenschnittstelle hinter Session; Admin-Routen zusätzlich `isAdmin`. Damit ist die bisher offene Schreib-Schnittstelle geschlossen.
- HTTPS liegt bereits an (Caddy).

## 10. Deployment

**Offen — vom Nutzer nachzuliefern:** Ziel-Umgebung und Orchestrierungs-Setup (Tool noch zu klären, evtl. Portainer o.ä.). Aktueller Stand: Docker-Container hinter Caddy auf Hetzner, Daten auf Volume `dienstplan-data`. Neue Env-Variablen (§8) müssen in die Container-Konfiguration. SMTP-Postfach vom Nutzer bereitzustellen. Dieser Abschnitt wird vor dem Deploy-Task konkretisiert.

## 11. Separate Release-Politur (nicht Teil dieses Specs)

Kleine, unabhängige Aufgaben, danach als eigene kurze Tasks:

- `CLAUDE.md`-Regel-Doku aktualisieren (beschreibt noch das alte Ein-Algorithmus-System statt der 3 Varianten).
- Alte Browser-Test-Artefakte (`test.html`, `test-suite.js`, `TEST_GUIDE.md`) aufräumen oder gegen die aktuelle Varianten-Logik prüfen.
- Version taggen (`v1.0.0`) nach dem Merge.
- Bericht-Text-Splice-Bug beheben (Bemerkungs-Zeilen zweier Mitarbeiter rutschen im Textbericht ineinander).

## 12. Offene Punkte

- Deployment-Ziel + Orchestrierungs-Tool (Nutzer liefert nach).
- SMTP-Postfach-Zugangsdaten (Nutzer richtet ein).
- Session-Länge 30 Tage ok? (Annahme; leicht änderbar via `SESSION_TTL_DAYS`.)
