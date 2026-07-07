# Project Context — Dienstplan-Pro

*Lean, LLM-optimized brownfield context. Loaded as a persistent fact by BMAD workflows.*

## What it is

Deutschsprachige Progressive Web App (PWA) zur Berechnung von **Bonuszahlungen für Wochenend- und Feiertagsdienste** nach NRW-Regelung (Psychiatrie 2011). Live unter `https://bonus.pixel-by-design.de`. Sprache durchgehend Deutsch (UI, Doku, Kommentare); Variablen-/Funktionsnamen Englisch.

## Tech-Stack

- **Frontend:** Vanilla JS (ES6-Klassen an `window`), HTML5, CSS3, LocalStorage. Kein Build-Step, kein Framework.
- **Backend (seit „Stufe 1"):** Node 20 (CommonJS) + Express 4 + `better-sqlite3` 11 (synchron, WAL). Ein Prozess serviert statisches Frontend **und** `/api/*`.
- **Tests:** `node --test` (kein Framework). Alt-Artefakte `test.html`/`test-suite.js` (Browser) noch vorhanden, teils veraltet.
- **Deployment:** Docker (`node:20-slim`) hinter Caddy (Let's Encrypt TLS) auf Hetzner; SQLite-DB + Backups auf Docker-Volume `dienstplan-data` (`/data`). Server zieht Code von **GitHub** (`Kenearos/Dienstplan-Pro`), nicht vom lokalen Forgejo-Origin. Deploy-Key: `~/.ssh/id_ed25519_hetzner`. Service-Worker mit `skipWaiting`+`clients.claim` (self-updating).

## Kernmodule (Frontend)

| Datei | Klasse/Rolle |
|---|---|
| `app.js` | `DienstplanApp` — UI-Orchestrierung, Event-Handling, Bootstrap (`DOMContentLoaded` → `DataSync.boot()` → `new DienstplanApp()` → `imageImporter`) |
| `calculator.js` | `BonusCalculator` — orchestriert Tag-Klassifizierung + 3 Varianten, wählt Gewinner |
| `variants.js` | reine Funktionen: `classify` (Slot fr/sa/so/weekday inkl. Feiertags-Verschiebung), `variant1/2/3` |
| `holidays.js` | `HolidayProvider` — NRW-Feiertage 2025–2030 (handgepflegt) |
| `storage.js` | `DataStorage` — synchron, LocalStorage; Keys `dienstplan_employees|_duties|_vacation`, plus gerätelokaler OpenRouter-Key/Modell |
| `sync.js` | `DataSync` — hält LocalStorage (Working-Copy) und Server-DB synchron; `pending`-Flag schützt Offline-Änderungen; last-write-wins auf ganzen Dokumenten |
| `image-import.js` | `ImageImporter` — Foto→Dienste via OpenRouter Vision-LLM; Namens-Matching, Monat aus Live-Dropdown |

## Backend (`server/`)

- `db.js` — better-sqlite3, WAL + `synchronous=NORMAL`; Tabellen `documents(key PK, value, updated_at)` + `history`; `getDoc(key)`/`putDoc(key,value,now)` (putDoc snapshottet Alt-Wert in history).
- `index.js` — Express; `GET /api/health`, `GET/PUT /api/state` (liest/schreibt die 3 Dokumente employees/duties/vacation), statisches Frontend.
- `backup.js` — tägliches SQLite-Online-Backup (`db.backup()`), letzte 14.

## Geschäftslogik (verifiziert korrekt)

- **Sätze:** Wochenend-Slot (fr/sa/so) = 450 €, Werktag = 250 €. Dienst-Anteil 1,0 oder 0,5.
- **Tag-Klassifizierung:** echte Fr/Sa/So gewinnen immer; Mo–Do: Feiertag→so, Tag-vor-Feiertag→fr, Sandwich→sa.
- **3 Varianten** (V1 fr+so-Pool+Werktage, V2 sa+Werktage, V3 Wochenend-Pool) mit eigenen Schwellen/Abzügen (Freitag-Priorität); Rechner nimmt die mit dem höchsten Bonus. Urlaubsmodus halbiert Schwellen+Abzüge.

## Datenmodell (aktuell, Single-User)

LocalStorage-Working-Copy ↔ Server-Dokumente. `documents` global (kein Nutzerbezug). Datum als ISO-String, intern `T12:00:00` gegen Zeitzonen-Kanten.

## Constraints / Gotchas

- `better-sqlite3` ist **synchron** — kein `db.run()` (das ist node-sqlite3), immer `db.prepare().run()`/`db.exec()`.
- SQLite `foreign_keys` ist **standardmäßig AUS** — für CASCADE explizit `PRAGMA foreign_keys=ON`.
- SQLite kann **PK nicht per ALTER ändern** → Table-Rebuild.
- Deploy ohne Volume `dienstplan-data` = Datenverlust.
- CI-Pipeline (`.github/workflows/ci.yml`) mit OPA/Rego-Policy-Gates (`secrets_in_env`, `deploy_rules`, `image_provenance` …) aus einem Org-Standard.

## Reifegrad

„Stufe 1" (Server-Persistenz + Backup + Sync) ist gebaut, getestet, live. Bild-Import funktioniert (Juni-Erkennung + Berechnung gegen Handrechnung verifiziert). Aktuell **öffentlich ohne Login** — das ist der zentrale Punkt des v1.0-Team-Release.
