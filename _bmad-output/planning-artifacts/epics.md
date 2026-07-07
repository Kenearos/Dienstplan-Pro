---
stepsCompleted: ["step-01-validate-prerequisites", "step-02-design-epics", "step-03-create-stories"]
inputDocuments:
  - "_bmad-output/planning-artifacts/prds/prd-dienstplan-pro-2026-07-07/prd.md"
  - "_bmad-output/planning-artifacts/prds/prd-dienstplan-pro-2026-07-07/addendum.md"
  - "_bmad-output/planning-artifacts/architecture-dienstplan-pro.md"
---

# Dienstplan-Pro Team-Release v1.0 - Epic Breakdown

## Overview

Dieses Dokument zerlegt die Anforderungen aus PRD + Architektur in umsetzbare, einzeln durch einen Dev-Agent abschließbare Stories (TDD, keine Vorwärts-Abhängigkeiten innerhalb einer Epic).

## Requirements Inventory

### Functional Requirements
- **FR-1** Login-Link anfordern (neutral, rate-limited, alte Tokens invalidieren)
- **FR-2** Magic-Link scanner-sicher einlösen (Bestätigungsseite + POST) → Sitzung
- **FR-3** Sitzungsdauer (absolut) + Idle-Timeout + Logout
- **FR-4** Zugangs-Gate auf allen Daten, offline-bewusst (401 ≠ Netzfehler)
- **FR-5** Notzugang: Admin-generierter Login-Link (audit-geloggt)
- **FR-6** Strikte Datentrennung pro Nutzer (user_id nur aus Session, Anti-IDOR)
- **FR-7** Sichere, atomare, verifizierte Migration der Alt-Daten + Fail-Fast auf ADMIN_EMAIL
- **FR-8** Nutzer-Isolation im Browser (Erstlogin/Wechsel: Daten+OpenRouter-Key leeren, pending-Schutz)
- **FR-9** E-Mail freischalten (identische Normalisierung)
- **FR-10** Nutzerliste einsehen
- **FR-11** Nutzer entfernen (CASCADE) mit Last-Admin-Schutz
- **FR-12** Admin-Gating (403/401)
- **FR-13** Varianten-Bonus-Berechnung *(bestehend, unverändert)*
- **FR-14** Foto-Import auf gewählten Monat *(bestehend)*
- **FR-15** Auth-bewusster Sync (credentials, 401→Login, Netzfehler→lokal, pending)

### NonFunctional Requirements
- **NFR-1** Token- & Session-Hashing (SHA-256)
- **NFR-2** Cookie httpOnly/Secure/SameSite=Lax, serverseitig widerrufbar
- **NFR-3** Tokens zufällig, einmalig, 30 Min
- **NFR-4** Neutralität + Rate-Limit (E-Mail primär, IP großzügig)
- **NFR-5** `foreign_keys=ON` + CASCADE
- **NFR-6** Backup/Volume unverändert
- **NFR-7** Vanilla-JS, better-sqlite3 synchron, same-origin; neue Deps: nodemailer, cookie-parser
- **NFR-8** Offline-Betrieb der Kernapp bleibt

### Additional Requirements
- Minimales Audit-Log (ohne PII, mit pseudonymer user_id) → Metriken messbar
- Release-Hygiene: `.env.example`, README, CHANGELOG, Version-Tag `v1.0.0`, `CLAUDE.md`-Regeln aktualisieren, alte Test-Artefakte prüfen, Bericht-Text-Splice-Bug fixen, Deploy-Guard `ADMIN_EMAIL`.

### UX Design Requirements
Keine separate UX-Spec — Login-Overlay + Bestätigungsseite + Admin-Sektion folgen dem bestehenden Tab-/Toast-Muster.

### FR Coverage Map
| FR | Epic |
|---|---|
| FR-6, FR-7, NFR-1/3/5 | Epic 1 (Auth-Fundament) |
| FR-1, FR-2, FR-3, FR-5, FR-15(server), NFR-2/4 | Epic 2 (Login-Endpunkte & Mail) |
| FR-6(route), FR-9, FR-10, FR-11, FR-12 | Epic 3 (Datentrennung & Admin-API) |
| FR-4, FR-8, FR-15(client) | Epic 4 (Frontend Login & Isolation) |
| Additional (Audit/Release) | Epic 5 (Betrieb & Release) |
| FR-13, FR-14 | bestehend, nicht Teil dieses Release (Regressionstest in Epic 5) |

## Epic List
1. **Auth-Fundament (Backend-Kern):** Schema, Hashing, Token-/Session-Logik, Admin-Seed + Migration.
2. **Login-Endpunkte & Mail:** Request/Confirm/Logout/Me-Routen, Rate-Limit, Mailer, Notzugang.
3. **Datentrennung & Admin-API:** `/api/state` pro Nutzer (Anti-IDOR) + Admin-Nutzerverwaltung.
4. **Frontend Login & Isolation:** Login-Overlay, Bootstrap-Gate (offline-bewusst), Sync-Auth, Nutzerwechsel, Admin-UI.
5. **Betrieb & Release:** Audit-Log, Env/Docs/Deploy-Guard, Alt-Test-Sichtung, Bericht-Bug, Version-Tag.

---

## Epic 1: Auth-Fundament (Backend-Kern)

Legt Datenmodell und reine Auth-Logik (Hashing, Tokens, Sessions, Seed, Migration) — die sichere Basis, auf der alle Login-Funktionen aufsetzen.

### Story 1.1: Datenmodell & Pragmas

As a Betreiber,
I want ein sicheres, referenziell integres Auth-Schema,
So that Nutzer-, Token- und Session-Daten sauber getrennt und beim Löschen automatisch aufgeräumt werden.

**Acceptance Criteria:**

**Given** eine frische DB
**When** der Server startet
**Then** existieren Tabellen `users`, `login_tokens(token_hash)`, `sessions(id_hash, last_seen_at)`, `audit_log` und Indizes auf `login_tokens.user_id` + `sessions.user_id`
**And** `PRAGMA foreign_keys` liefert 1 (CASCADE aktiv)
**And** ein `audit(event, userId, ipHash)`-Helper (append-only, keine PII) existiert bereits hier, damit spätere Auth-Routen (Epic 2/3) ihn nutzen können (keine Forward-Dependency)

### Story 1.2: E-Mail-Normalisierung & Login-Token (Hash)

As a Nutzer,
I want einen sicheren Einmal-Login-Token,
So that mein Login-Link auch bei DB-Leak wertlos und nicht wiederverwendbar ist.

**Acceptance Criteria:**

**Given** eine E-Mail in unterschiedlicher Schreibweise
**When** `normalizeEmail` angewandt wird
**Then** ist das Ergebnis lowercase+getrimmt und für Speicherung wie Abgleich identisch

**Given** ein erzeugter Login-Token
**When** er gespeichert wird
**Then** liegt nur der SHA-256-Hash in `login_tokens`, der Rohwert wird zurückgegeben (für den Link)
**And** `consumeLoginToken` akzeptiert ihn genau einmal, nicht nach 30 Min, nicht nach `used_at`

### Story 1.3: Sitzungen mit Idle- & Absolut-Frist

As a Nutzer,
I want eine widerrufbare Sitzung mit Inaktivitäts- und Absolutgrenze,
So that ich angemeldet bleibe, aber ein vergessenes Terminal nicht ewig offen ist.

**Acceptance Criteria:**

**Given** eine erzeugte Sitzung (Rohwert im Cookie, Hash in DB)
**When** `validateSession` mit dem Rohwert aufgerufen wird
**Then** liefert es Nutzer nur, wenn `now < expires_at` UND `now - last_seen_at < SESSION_IDLE_HOURS`
**And** `last_seen_at` wird nur aktualisiert, wenn es älter als ~5 Min ist (kein Write pro Request)

**Given** eine gültige Sitzung
**When** `deleteSession` bzw. `deleteUserSessions` läuft
**Then** ist sie/danach sind alle Sitzungen des Nutzers ungültig

### Story 1.4: Admin-Seed & Fail-Fast

As a Betreiber,
I want dass ein fehlkonfigurierter Start sofort auffällt und ein Admin sicher existiert,
So that kein verwaister/admin-loser Zustand entsteht.

**Acceptance Criteria:**

**Given** fehlende/leere/ungültige `ADMIN_EMAIL`
**When** der Server startet
**Then** bricht er laut und ohne weitere Schritte ab (Fail-Fast)
**Given** gültige `ADMIN_EMAIL`
**When** `seedAdmin` läuft
**Then** existiert genau ein Admin mit dieser (normalisierten) E-Mail (is_admin=1), idempotent; die `adminUserId` wird zurückgegeben

### Story 1.5: Sichere Migration der Alt-Daten

As a Betreiber,
I want meine bestehenden globalen Daten atomar dem Admin zugeordnet,
So that beim Umstieg auf Mehrbenutzer nichts verloren geht.

**Acceptance Criteria:**

**Given** Alt-Daten in `documents`/`history` und eine `adminUserId` (aus Story 1.4)
**When** die Migration läuft
**Then** wird in **einer** Transaktion `documents` auf PK `(user_id,key)` rebuilt und `history.user_id` gesetzt — alle Alt-Zeilen gehören dem Admin
**And** ein zweiter Start ist ein No-Op (Guard über `documents.user_id`); ein Abbruch hinterlässt keinen halb-migrierten Zustand

---

## Epic 2: Login-Endpunkte & Mail

Macht Login real: Anfordern, scanner-sicheres Einlösen, Session-Cookie, Logout, Notzugang, mit Rate-Limit und Mailversand.

### Story 2.1: Rate-Limiter

As a Betreiber,
I want begrenzte Login-Anfragen,
So that niemand mein Postfach/System mit Anfragen flutet — ohne Kollegen hinter einer Klinik-IP auszusperren.

**Acceptance Criteria:**

**Given** `RATE_LIMIT_EMAIL=5` im 15-Min-Fenster
**When** die 6. Anfrage für dieselbe E-Mail kommt
**Then** wird sie geblockt
**And** das IP-Limit ist getrennt und großzügig konfigurierbar (mehrere Kollegen aus einer NAT-IP werden nicht gegenseitig gesperrt)

### Story 2.2: Mailer mit Konsolen-Fallback

As a Entwickler,
I want Magic-Links per SMTP versenden, im Dev ohne SMTP,
So that der Login end-to-end testbar ist, ohne Postfach.

**Acceptance Criteria:**

**Given** keine SMTP-Env
**When** `sendMagicLink` aufgerufen wird
**Then** wird der Link nach `console.log` geschrieben (kein Wurf), zurückgegeben
**Given** SMTP-Env gesetzt
**When** `sendMagicLink` aufgerufen wird
**Then** wird via nodemailer versendet

### Story 2.3: Login-Link anfordern (neutral)

As a Kollege,
I want per E-Mail einen Login-Link anfordern,
So that ich mich ohne Passwort anmelden kann — ohne dass Fremde erfahren, wer freigeschaltet ist.

**Acceptance Criteria:**

**Given** eine freigeschaltete E-Mail
**When** `POST /api/auth/request`
**Then** wird ein Token erzeugt, der Link gemailt, vorherige offene Tokens des Nutzers invalidiert, Antwort neutral `200`
**Given** eine nicht freigeschaltete E-Mail
**When** `POST /api/auth/request`
**Then** wird nichts gemailt, Antwort identisch neutral `200`
**And** über dem Rate-Limit → `429`

### Story 2.4: Scanner-sichere Einlösung + Session-Cookie

As a Nutzer,
I want den Link auch mit Klinik-Mailscannern nutzen können,
So that ein automatischer Vorab-Aufruf meinen Login nicht verbrennt.

**Acceptance Criteria:**

**Given** ein gültiger Token im Link
**When** `GET /auth?token=` aufgerufen wird (auch durch einen Scanner)
**Then** erscheint nur eine Bestätigungsseite; der Token wird NICHT verbraucht
**When** der Nutzer bestätigt (`POST /auth/confirm` mit Token)
**Then** wird der Token verbraucht, eine neue Sitzung erzeugt, httpOnly/Secure/SameSite=Lax-Cookie gesetzt, Weiterleitung zur App
**And** ein verbrauchter/abgelaufener Token → Fehlerseite

### Story 2.5: Logout, Me, Notzugang

As a Nutzer/Admin,
I want mich abmelden, meinen Status abfragen und im Notfall einen Link erhalten,
So that ich Kontrolle über meine Sitzung habe und auch ohne Mail reinkomme.

**Acceptance Criteria:**

**Given** eine Sitzung
**When** `POST /api/auth/logout`
**Then** Sitzung serverseitig gelöscht, Cookie geleert
**When** `GET /api/auth/me`
**Then** `{email, isAdmin}` bei gültiger Sitzung, sonst `401`
**Given** ein Admin
**When** er für eine freigeschaltete E-Mail einen Notzugangs-Link erzeugt
**Then** erhält er einen gültigen Link (Regeln wie 2.4), und die Aktion steht im Audit-Log

---

## Epic 3: Datentrennung & Admin-API

Sichert die Daten pro Nutzer und gibt dem Admin die Allowlist-Verwaltung.

### Story 3.1: `/api/state` pro Nutzer (Anti-IDOR)

As a Nutzer,
I want dass nur ich meine Daten sehe/schreibe,
So that Kollegen und Fremde meine Dienste nicht einsehen können.

**Acceptance Criteria:**

**Given** zwei eingeloggte Nutzer A und B
**When** beide `GET/PUT /api/state` nutzen
**Then** sieht/schreibt jeder ausschließlich seine eigenen Dokumente (disjunkt)
**And** die `user_id` stammt nur aus der Session; eine im Body/Query mitgeschickte `user_id` hat keinen Effekt
**And** ohne Sitzung → `401`

### Story 3.2: Admin — freischalten & auflisten

As a Admin,
I want E-Mails freischalten und die Liste sehen,
So that ich steuere, wer teilnimmt.

**Acceptance Criteria:**

**Given** ein Admin
**When** `POST /api/admin/users {email}`
**Then** wird die (normalisierte) E-Mail aufgenommen; Duplikate erzeugen keinen zweiten Nutzer
**When** `GET /api/admin/users`
**Then** Liste aller Nutzer inkl. Admin-Kennzeichnung
**And** Nicht-Admin → `403`, ohne Sitzung → `401`

### Story 3.3: Admin — entfernen mit Last-Admin-Schutz

As a Admin,
I want Nutzer entfernen können, aber mich nicht selbst aussperren,
So that der Zugang entzogen wird, ohne die Verwaltung lahmzulegen.

**Acceptance Criteria:**

**Given** ein regulärer Nutzer
**When** `DELETE /api/admin/users/:id`
**Then** ist er entfernt, seine Sitzungen/Tokens per CASCADE weg (sofortiger Serverzugang-Entzug), Aktion im Audit-Log
**Given** der letzte/einzige Admin oder der eigene Account
**When** Entfernen versucht wird
**Then** wird es mit definierter Fehlermeldung verweigert (Invariante „mind. ein Admin")

---

## Epic 4: Frontend Login & Isolation

Das sichtbare Login-Erlebnis + saubere Trennung im Browser.

### Story 4.1: Login-Overlay & Bestätigungsseite

As a Kollege,
I want einen einfachen Login-Screen,
So that ich meine E-Mail eingebe und per Link reinkomme.

**Acceptance Criteria:**

**Given** keine gültige Sitzung
**When** die App lädt
**Then** zeigt ein Vollbild-Overlay das E-Mail-Feld; die App bleibt verdeckt
**When** ich absende
**Then** „Prüfe dein Postfach"; der Bestätigungslink führt auf die POST-Bestätigungsseite (Story 2.4)

### Story 4.2: Bootstrap-Gate (offline-bewusst) & Sync-Auth

As a Nutzer,
I want dass die App mich einlässt, wenn ich angemeldet bin, und offline weiterläuft,
So that ich nie ausgesperrt werde, nur weil kein Netz da ist.

**Acceptance Criteria:**

**Given** App-Start
**When** `GET /api/auth/me` `401` liefert
**Then** Login-Overlay, App/Sync starten nicht
**When** der Aufruf mit Netzwerkfehler scheitert (offline)
**Then** läuft die App mit letzter bekannter Sitzung + lokalen Daten weiter (kein Overlay)
**And** `DataSync` sendet `credentials:'include'`; bei `401` im Sync → Overlay + Stopp

### Story 4.3: Nutzerwechsel-Isolation

As a Nutzer eines geteilten Rechners,
I want dass beim Wechsel keine fremden Daten/Keys übrig bleiben,
So that niemand meine Daten sieht oder meinen API-Key nutzt.

**Acceptance Criteria:**

**Given** ein anderer (oder kein) gemerkter Nutzer als `me.email`
**When** ich mich einlogge
**Then** werden Daten-Keys + gerätelokaler OpenRouter-Key geleert, dann frisch vom Server geladen
**Given** ungeflushte `pending`-Änderungen und Re-Login desselben Nutzers
**Then** bleiben sie erhalten und werden geflusht (kein Überschreiben); bei anderem Nutzer wird gewarnt statt still verworfen

### Story 4.4: Admin-UI & Logout

As a Admin,
I want die Nutzerverwaltung + einen Logout im UI,
So that ich Kollegen ohne Terminal freischalten/entfernen und mich abmelden kann.

**Acceptance Criteria:**

**Given** ich bin Admin
**When** ich „Einstellungen" öffne
**Then** sehe ich die Admin-Sektion (Liste, Freischalten, Entfernen) — bei Nicht-Admin unsichtbar
**And** ein prominenter Logout-Button meldet mich ab (→ Overlay); der Service-Worker-Cache ist neu versioniert

---

## Epic 5: Betrieb & Release

Beobachtbarkeit, Doku, Deploy-Sicherheit, Altlasten.

### Story 5.1: Audit-Log (ohne PII)

As a Betreiber,
I want ein datensparsames Audit-Log,
So that ich Logins/Admin-Aktionen/Fehlversuche nachvollziehen und die Erfolgs-Metriken messen kann.

**Acceptance Criteria:**

**Given** Auth-Ereignisse
**When** sie passieren (login_ok, logout, admin_add/remove, emergency_link, auth_fail)
**Then** landet je eine Zeile mit `ts, event, user_id (pseudonym), ip_hash` — keine E-Mail/Namen
**And** SM-1 (distinct user_id) ist daraus zählbar

### Story 5.2: Konfiguration & Doku

As a Betreiber,
I want vollständige Env-Vorlage und aktuelle Doku,
So that Deploy reproduzierbar ist und die Regeln stimmen.

**Acceptance Criteria:**

**Given** das Repo
**Then** existiert `.env.example` mit allen Variablen, `README` beschreibt Team-Login, `CHANGELOG` hat einen v1.0.0-Eintrag
**And** die `CLAUDE.md`-Bonusregeln sind auf das 3-Varianten-System aktualisiert

### Story 5.3: Deploy-Guard & Regressions-Sichtung

As a Betreiber,
I want dass ein fehlkonfigurierter Deploy nicht live geht und Bestehendes weiter funktioniert,
So that der Release sicher ist.

**Acceptance Criteria:**

**Given** ein Deploy ohne gültige `ADMIN_EMAIL`
**Then** startet der Container nicht (Fail-Fast greift; Deploy-Checkliste dokumentiert)
**And** die bestehenden Berechnungs-/Import-Node-Tests laufen weiter grün; alte `test.html`/`test-suite.js` sind gesichtet (aktualisiert oder entfernt)

### Story 5.4: Bericht-Text-Splice-Bug

As a Nutzer,
I want einen korrekten Textbericht,
So that Bemerkungen dem richtigen Mitarbeiter zugeordnet sind.

**Acceptance Criteria:**

**Given** ein Monat mit Bemerkungen bei mehreren Mitarbeitern
**When** der Textbericht erzeugt wird
**Then** rutscht keine Bemerkungs-Zeile in einen anderen Mitarbeiter (jede Bemerkung korrekt zugeordnet)
**And** ein Regressionstest deckt den Fall ab

### Story 5.5: Version-Tag v1.0.0

As a Betreiber,
I want einen sauberen Release-Marker,
So that der Team-Release nachvollziehbar getaggt ist.

**Acceptance Criteria:**

**Given** alle Stories abgeschlossen und gemergt
**When** der Release geschnitten wird
**Then** existiert Tag `v1.0.0` und ist gepusht
