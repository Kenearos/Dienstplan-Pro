# Fortschritts-Ledger — dienstplan

Stories, Gate-Ergebnisse (inklusive der geschickten Dateien) und Finding-Urteile.
Eine Verwerfung braucht Evidenz — Code-Zitat, Testlauf oder Repro-Versuch.

Laufende Arbeit mit eigenem Ledger: [UI-Redesign „Kamigawa"](docs/REDESIGN-KAMIGAWA-LEDGER.md)
(Branch `redesign/kamigawa-ui`).

## Epic: Team-Dienstplan — Dienste als Datensätze, Aushang, Passwörter (2026-08-08)

**Auslöser (Benutzer):** „am besten eine Art Tabelle, wo man nur reinklickt und den Namen
von sich reinklickt, und der Admin macht die Kontrolle." Aus der Klärung wurde ein
Release: eigene Logins für die acht, Team-Aushang für alle sichtbar, **Freigabe pro
Dienst**, Beträge privat. Architektur: Server ist die Wahrheit, Eintragen braucht Netz.

**Artefakte:** Spec `docs/superpowers/specs/2026-08-08-team-dienstplan-design.md`
(zwei Gate-Linsen), Plan `docs/superpowers/plans/2026-08-08-team-dienstplan-tp1.md`.

### Gates auf das Planungsartefakt

| Linse | Kritiker | Findings | Urteile |
|---|---|---|---|
| Architektur/Technik | opencode `mimo-v2.5-free`, 94 s | 12 | 7 übernommen, 3 halb, 2 verworfen |
| Sicherheit/DSGVO | opencode `mimo-v2.5-free`, 74 s | 8 | 3 übernommen, 3 halb, 2 verworfen |

**Die zwei Funde, die das Design gerettet haben:**

1. **`UNIQUE (user_id, date)` hätte eine Sackgasse gebaut.** Ein abgelehnter Dienst bleibt
   als Zeile stehen, Löschen ist nur bei `pending` erlaubt — der Kollege hätte für diesen
   Tag nie wieder etwas eintragen können. Jetzt partieller Index über
   `status <> 'rejected'`, mit eigenem Wächter-Test.
2. **`ON DELETE CASCADE` hätte beim ersten Personalwechsel die Vergütungsgrundlage
   vernichtet.** `DELETE /api/admin/users/:id` existierte bereits; ein ausscheidender
   Kollege hätte still alle freigegebenen Dienste mitgenommen. Jetzt `ON DELETE RESTRICT`
   plus `users.active`: Ausscheiden heißt deaktivieren.

Beides hätte kein Test gefangen — es wäre die spezifikationsgemäße Wirkung gewesen.

### Umsetzung (Suite 61 → 108, ein Commit pro Story)

| Commit | Inhalt | Suite |
|---|---|---|
| `7e4d016` | Schema: `duties`, partieller Index, `vacation_months`, `users.display_name`/`active` | 64 |
| `3c27c8e` | Regel-Schicht `duties.js` ohne Express | 72 |
| `0bbdb0f` | Endpunkte: eintragen, Aushang, Freigabe | 79 |
| `830d68f` | Ausscheiden statt Löschen | 81 |
| `b751166` | Migrationslauf Blob → Tabelle | 85 |
| `49c6720` | **Team-Plan**: die anklickbare Monatstabelle | 85 |
| `9ab33c9` + `5b5116a` | Onboarding als ein Befehl; Nutzerverwaltung mit Namen, Deaktivieren, Alt-Datenübernahme | 97 |
| `e502c7f` | Anmeldung mit E-Mail und Passwort | 108 |

**Zwei eigene Fehler, ehrlich vermerkt:**

- Bei Task 4 ließ mein `active = 1`-Filter `consumeLoginToken` auf `undefined` zugreifen —
  die Anmeldung wäre mit einem Absturz gescheitert statt mit einer sauberen Abweisung.
  Der Test hat es gefangen, weil er auf `400` bestand.
- Bei Task 5 lief der Test **nicht zuerst rot** — Test und Code entstanden zusammen. Statt
  das durchgehen zu lassen: Implementierung mutiert (`kalendertag` auf naives
  `iso.slice(0,10)`), Test fiel um. Er hat Zähne.

### Benutzer-Entscheidungen, die vom Vorschlag abweichen

- **Freigabe pro Dienst** statt pro Monat oder nur bei Auffälligkeiten — die teuerste
  Variante, nach Nennung des Preises (40–50 Entscheidungen/Monat) bewusst gewählt.
- **Passwort setzen ohne Link-Übergabe:** Wer eine freigeschaltete Adresse kennt, darf ihr
  Passwort setzen, solange keines gesetzt ist. Ich habe davon abgeraten (ein Konto lässt
  sich so von Dritten besetzen, bevor die Person sich meldet); der Betreiber hat es nach
  Nennung des Risikos so entschieden. Gegenmaßnahmen im Rahmen dieser Wahl: nach dem
  ersten Passwort ist das Konto zu (`409`), jede Einrichtung wird als `password_claimed`
  auditiert, Rate-Limit pro IP **und** pro Adresse, eine einzige neutrale Fehlermeldung.

### Echte Verifikation (Browser, laufender Server)

Team-Plan: eingetragen → gestrichelt „vorgemerkt" → freigegeben → durchgezogen; halber
Dienst markiert den Tag golden (Regel aus den 26 Bestandsdiensten: ein Tag ergibt 1,0).
Nutzerverwaltung: zwei Konten mit Namen angelegt, Hinweis schlug auf „alle zugeordnet" um,
Übernahme lieferte 3 Dienste und 1 Urlaubsmonat mit Protokoll, Dienste erschienen im Plan.
Passwörter: Kollege setzt sein Passwort selbst und ist drin; zweite Beanspruchung `409`,
Fremdpasswort `401`, echtes `200`.

### Deploys (drei am selben Tag, je mit Rollback-Anker und Backup aller drei DB-Dateien)

`49c6720` (TP1 + Team-Plan) · `5b5116a` (Nutzerverwaltung) · `e502c7f` (Passwörter, sw v12).
Nach jedem Deploy von außen geprüft: neue Endpunkte antworten ohne Anmeldung mit `401`,
der alte Blob blieb unangetastet (1398 Bytes), die neue Tabelle leer — die Übergangsregel
aus der Spec hält.

**Kontenstand:** `kenearos@mastersofdungeons.de` und `o.alsholi@st-augustinus.de`, beide
Admin, beide aktiv, beide **ohne Anzeigenamen** — der fehlt noch und blockiert die
Übernahme der Juni-Dienste (zugeordnet wird über den Namen, nicht die Adresse).

### Offen

1. **Anzeigenamen setzen**: `Benadjemia` und `Alsholi`, exakt wie in den Altdaten.
2. **Sechs weitere Konten** — Adressen stehen noch aus.
3. **A8 (Druckvorschau)** aus dem Kamigawa-Release weiterhin nur statisch geprüft.
4. **graphify: erledigt — und die bisherige Begründung war falsch.** Siehe eigenen
   Abschnitt unten.

## Befund: der graphify-Blocker existierte nie (2026-08-08)

**Was ich den ganzen Tag geschrieben habe:** „graphify-Erstbuild blockiert, kein
LLM-Backend erreichbar." Das stimmte nicht. Nach der Deinstallation des `gsd`-Plugins
habe ich das CLI direkt angesehen — und `graphify --help` kennt gar kein `extract`:

```
update <path>   re-extract code files and update the graph (no LLM needed)
```

Die Code-Extraktion läuft **per AST, ohne Modell**. Ein Backend braucht nur das *Benennen*
der Communities (`label`, `cluster-only --backend`), und das lässt sich überspringen.
Der Aufruf `graphify extract . --backend openai` stammt aus `graphify-rollout.sh` des
gsd-Plugins — dort war der Key nötig, nicht im Werkzeug selbst. Ich habe die Fehlermeldung
des Skripts für eine Eigenschaft von graphify gehalten und das drei Mal ungeprüft
weitergeschrieben, statt einmal `--help` aufzurufen.

**Ergebnis ohne gsd und ohne Key:** `graphify update .` → **3448 Knoten, 3660 Kanten,
272 Communities in 14 s**. Artefakte nach `.planning/graphs/` kopiert. Der SessionStart-Hook
funktioniert: `built_at_commit` steht im Graphen (`e977936`) — der Snapshot von
`gsd-tools.cjs` war dafür nicht nötig.

**Einschränkung, gemessen:** Der Graph ist dokumentenlastig. Treffer je Quelle in
`graph.json`: `_bmad` **7588**, `.claude/skills` **4693**, `server/` **722**, `docs/` 375
— bei 235 Dateien unter `.claude` gegenüber 32 unter `server/`. Code-Fragen liefern
deshalb Doku-Knoten: die Frage nach dem Freigabe-Endpunkt fand `adr/0000-template.md` und
eine BMAD-Schrittanleitung. Für brauchbare Code-Antworten müssen `.claude/` und `_bmad/`
von der Extraktion ausgenommen werden; die god-nodes stimmen dagegen schon jetzt
(`DienstplanApp` 32 Kanten, `DataStorage` 26, `ImageImporter` 24, `db` 24).

**Offen:** Ausschlussregel für `.claude/`+`_bmad/` finden, danach neu bauen; Communities
tragen ohne LLM-Lauf nur Platzhalternamen (`graphify label` mit Backend, wenn wieder eins
da ist).

## Release: v1.0 + Kamigawa-UI auf Hetzner deployt (2026-08-08)

**Ausgangslage — vorher gemessen, nicht angenommen:** Der Live-Container lief auf Commit
`fc8d6dd`, also dem Stand **vor** dem Team-Release; sein `server/`-Verzeichnis enthielt
weder `auth.js` noch `mailer.js`. Gleichzeitig stand im Caddyfile für
`bonus.pixel-by-design.de` **kein `basic_auth` mehr**, nur `reverse_proxy`. Folge, live
belegt: `GET https://bonus.pixel-by-design.de/api/state` lieferte **HTTP 200** mit allen
acht Klarnamen und ihren Dienstplänen — ohne jede Anmeldung. Der Riegel war offenbar in
Erwartung des Magic-Link-Releases entfernt worden, das nie ausgerollt wurde.

**Benutzer-Entscheide (vorgelegt, nicht geraten):** sofort deployen und den Mailversand
nachziehen (statt erst SMTP oder erst einen Caddy-Notriegel); `ADMIN_EMAIL` =
`kenearos@mastersofdungeons.de`.

**Ablauf:** Prozedur aus CLAUDE.md, in zwei Etappen gefahren — erst alles ohne Ausfall
(Rollback-Anker, Backup, `git pull`, `docker build`), dann der Umschaltmoment.

| Schritt | Ergebnis |
|---|---|
| Rollback-Anker | altes Image als `dienstplan-pro:pre-v1.0` getaggt (`a5048e6058f9`) — **Ergänzung zur dokumentierten Prozedur**: `docker build -t …:latest` überschreibt den Tag, ohne diesen Schritt gäbe es keinen Weg zurück |
| DB-Backup | alle **drei** Dateien nach `/data/backups/vor-v1.0-2026-08-08-110238.*`. Die `.db` allein hätte den Großteil verfehlt: 4096 B gegenüber **86552 B im WAL**. Tägliche Backups liefen unabhängig bis 10:40 |
| Pull + Build | `fc8d6dd..393a5a2`, neues Image `3c29db8156c0` |
| Umschalten | `docker stop/rm`, neuer Container mit `ADMIN_EMAIL`, `APP_BASE_URL`, Volume `dienstplan-data`, Netz `matrix_default`, `--restart unless-stopped`. Automatischer Rückfall auf `pre-v1.0` war eingebaut, wurde **nicht** gebraucht — Start im ersten Versuch, Log `Dienstplan-Pro auf :3000` ohne Fail-Fast |

**Einmalige, unumkehrbare Migration — Ergebnis verifiziert:** `documents` auf `(user_id,key)`
umgestellt, Altdaten dem Admin zugeordnet. Nachgesehen statt geglaubt: `users` = genau eine
Zeile (`id 1`, `kenearos@mastersofdungeons.de`, `is_admin 1`); `documents` = `employees`
(82 B), `duties` (**1398 B**), `vacation` (2 B), alle auf `user_id 1`. Nichts verloren.

**Verifikation nach dem Deploy (von außen, echte Domain):**

| Prüfung | Ergebnis |
|---|---|
| `GET /api/state` | **HTTP 401** `{"error":"nicht angemeldet"}` — die Lücke ist zu |
| Ausgeliefertes HTML | `login-overlay`, `kamigawa.css`, `theme-toggle.js`, `<nav class="tabs">` alle vorhanden |
| Service Worker | `dienstplan-pro-v9`; zusammen mit `skipWaiting` ziehen offene Clients sofort nach |
| Neue Assets | `kamigawa.css`, `theme-toggle.js`, `styles.css` → je HTTP 200 |
| Login-Flow | `POST /api/auth/request` → `{"ok":true}`, Magic-Link erscheint im Container-Log |

**Offen (blockiert das Team):** kein SMTP hinterlegt — weder `.env` noch Env-Variablen am
Container. Magic-Links landen nur in `docker logs`, der Admin kommt darüber rein, das Team
nicht. Nachrüsten ist ein reiner Container-Neustart mit fünf zusätzlichen `-e`-Variablen:
**kein Rebuild, keine weitere Migration**.

**Empfehlung für CLAUDE.md:** das Wegtaggen des alten Images vor dem Build in die
Deploy-Prozedur aufnehmen — es fehlt dort und ist der einzige Rollback-Pfad.

## Methoden-Setup auf ai-dev-method v1.15 gezogen (2026-08-08)

**Was/Warum:** Der Redesign-Plan stammt vom 2026-07-10 und lief noch nach dem damaligen
Vorgehen; das Projekt hatte die Projekt-Ebene der Methode überhaupt nicht (kein Ledger,
kein Wissensgraph, kein Frische-Hook). Vor dem Abschluss des Redesigns nachgezogen —
reiner Setup-/Doku-Vorgang, laut Methode **keine Entwicklungsaufgabe** (Claude-eigene
Konfig + Text), daher ohne Gates.

**Lauf:** `node G:\Claude\ai-dev-method\tools\install.mjs` aus dem Projektverzeichnis
(Quelle: `G:\Claude\ai-dev-method` @ `1b6d241`, sauberer Baum).

| Ebene | Ergebnis |
|---|---|
| Rechner (Teil A) | alles `unveraendert` — DEV-METHOD.md, FRETISH-CHEATSHEET, `qwen.mjs`, `fret.mjs`, `bmad-fix-output-folder.sh`, `qwen.config.json`, `opencode.json`, `opencode-delegate`-Skill, `settings.json`-Hook. Globale `CLAUDE.md`: Block auf Marker-Form migriert (Inhalt unverändert, v1.15) |
| Projekt (Teil B) | `LEDGER.md` angelegt · `.planning/config.json` (graphify aktiviert) · `.claude/settings.json` mit SessionStart-STALE-Hook · CLAUDE.md-Verweis auf den graphify-Abschnitt · `.gitignore` um `graphify-out/`, `.planning/graphs/`, `.planning/HANDOFF.json` ergänzt |
| Nicht gelaufen | graphify-**Erstbuild** (bewusst mit `GRAPHIFY_SKIP_BUILD=1` übersprungen — kein Backend, s. u.) · BMAD (kein TTY; ist hier ohnehin installiert) |

Nichts committet (Baum war vorher schon geändert) — die Änderungen liegen für `git status` bereit.

### Kritiker-/Backend-Lage, real gemessen am 2026-08-08

| Backend | Messung | Folge |
|---|---|---|
| Lokale KI-Box `192.168.188.99:8088` | `/v1/models` → **200** (Modell `deepseek-v4-flash-0731-ud-iq3-xxs`), `/v1/chat/completions` → **401 „Invalid API Key"** | für Gates **und** graphify unbrauchbar, bis der Box-Key bekannt ist |
| DeepSeek-API | Key `****3336` → **401 „Authentication Fails"** | unverändert der offene Punkt aus dem ai-dev-method-Ledger vom 2026-08-06 |
| OpenRouter | `/api/v1/key` → 200, **Restbudget 0,35 $ von 30 $** (monatlich) | nur noch für einzelne Kleinstläufe, nicht für einen Graph-Erstbuild |
| opencode `opencode/mimo-v2.5-free` | Smoke-Test **Exit 0 in 13 s** | **funktioniert** — bleibt der Übergangs-Kritiker für die Gates |

**Achtung, Fallstrick belegt:** `graphify-rollout.sh` wählt die Box, sobald `/v1/models`
mit 200 antwortet — geprüft wird also ein anderer Endpunkt als der benutzte. Mit dem
aktuellen 401 auf `/chat/completions` liefe der Erstbuild ins Leere, **nachdem**
`.planning/config.json` bereits geschrieben ist. Deshalb hier bewusst übersprungen.

### Befund: opencode Zen ist ein OpenAI-kompatibler Endpunkt (2026-08-08)

Gemessen: `https://opencode.ai/zen/v1/models` → **200**, 61 Modelle, davon 8 mit Suffix
`-free` (`deepseek-v4-flash-free`, `mimo-v2.5-free`, `north-mini-code-free`, …).
`POST /zen/v1/chat/completions` **ohne** Key → HTTP 500 (auch mit exakter Modell-ID
geprüft, es liegt nicht am Namen) — die Gratismodelle sind über die HTTP-API also nur
mit Zen-Key erreichbar, während sie über die opencode-CLI ohne Key laufen
(`opencode auth list`: nur GitHub-Copilot-oauth + DeepSeek-/OpenRouter-Env).
`opencode serve` ist **keine** Alternative: eigene API, kein `/v1/chat/completions`.

**Konsequenz, wenn ein Zen-Key vorliegt:** derselbe Endpunkt bedient beide Werkzeuge
kostenlos — graphify per `OPENAI_BASE_URL=https://opencode.ai/zen/v1` +
`OPENAI_MODEL=deepseek-v4-flash-free`, und `qwen.mjs` per gleicher URL in
`qwen.config.json`. Damit entfiele der opencode-CLI-Umweg für die Gates komplett.

### Offene Punkte (Benutzer-Entscheid nötig)

1. **Ein Backend-Key** — Box-Key, erneuerter DeepSeek-Key **oder** (neu, siehe Befund oben)
   ein **opencode-Zen-Key**. Danach Erstbuild nachholen:
   `bash G:\Claude\ai-dev-method\tools\graphify-rollout.sh .` ohne `GRAPHIFY_SKIP_BUILD`
   (bei Zen/DeepSeek zusätzlich `GRAPHIFY_BOX` auf eine tote Adresse setzen — die
   Backend-Wahl im Skript prüft `/v1/models` und würde sonst wieder die 401-Box ziehen).
   OpenRouter geht technisch, 0,35 $ Restbudget reichen für den Build aber vermutlich nicht.
2. **FRET/Tier B** ist auf diesem Rechner nicht verfügbar (`fret.config.json` fehlt, kein
   Klon). Für das UI-Redesign irrelevant (keine temporale Story); Nachrüsten einmalig per
   `FRET_SETUP=1` beim nächsten Installer-Lauf (Netz nötig).

## Feature: Team-Plan wird Berechnungsquelle + Admin trägt für alle ein (2026-08-11)

**Auslöser (Benutzer):** „das neue Team-Plan wird nicht für die Berechnung herangezogen.
das ist falsch. es soll quasi neuerdings dienste eintragen ersetzen weil es leichter ist.
und der admin hat da eine art dropdownmenü oben wo er den mitarbeiter auswählen kann und
dann durchklickt wann der dienste hatte."

**Root Cause (belegt):** Zwei getrennte Speicher. Die Berechnung (und alle Reports/Exporte)
liest `storage.getAllEmployeeDutiesForMonth` (Dokument-Store `duties`, alter Tab „Dienste
eintragen", `app.js:453/615/805/868`, Einzelabruf `:401/:777`). Der Team-Plan schreibt in
die SQL-Tabelle `duties` (`/api/duties`, `server/duties.js`) mit Freigabe-Workflow. Kein
Pfad verbindet beide.

**Was gebaut wird (2 Stories):**

1. **Server — Admin-Dienste:** `POST /api/admin/duties` `{userId, date, share}` legt einen
   Dienst **direkt `approved`** an (`decided_by` = Admin); `DELETE /api/admin/duties/:id`
   löscht jeden Dienst unabhängig vom Status (Admin räumt Fehleinträge). Fachlogik in
   `server/duties.js` (`anlegenDurchAdmin`, `loeschenDurchAdmin`), Routen mit
   `adminMiddleware`, Audit-Ereignisse. userId wird gegen die users-Tabelle geprüft.
2. **Frontend — Quelle umstellen + Dropdown:** `roster.js` bekommt für Admins ein Dropdown
   „Eintragen für: Ich | <aktive Nutzer mit Namen>" (Quelle `GET /api/admin/users`); bei
   Fremdauswahl legen „ganz/halb" über die Admin-Route an (sofort freigegeben), Einträge
   der gewählten Person bekommen einen Entfernen-Knopf. Die Berechnung und alle
   Monats-Reports holen die Dienste per `GET /api/roster?month=` (**nur `status
   approved`**, Anteile/Name wie geliefert) statt aus dem Dokument-Store; zentraler
   async-Helper, Datum als `T12:00:00`-Date. Der Tab „Dienste eintragen" wird ausgeblendet
   (Code bleibt) — der Team-Plan ersetzt ihn.

**Entscheidungen:** Nur `approved` zählt für Geld (pending ist Absicht, keine Zusage).
Urlaubsmodus bleibt unverändert im Dokument-Store (per Name, Admin pflegt ihn in der
Berechnungsansicht). Namen kommen aus `display_name` — dieselbe Quelle wie die
Legacy-Migration, damit die Urlaubs-Map weiter greift.

**Berührte Invarianten:** „user_id nur aus der Session" bleibt — die neue Admin-Route
nimmt eine Ziel-userId als *Payload*, aber nur hinter `adminMiddleware` und mit
Existenz-Check; der Handelnde bleibt `req.user.id` (Audit). Keine Schema-Änderung.

**Akzeptanzkriterien:** (a) Admin wählt Mitarbeiter im Dropdown, klickt Tage an → Einträge
erscheinen sofort als freigegeben im Plan; (b) Berechnung des Monats zeigt exakt die
freigegebenen Team-Plan-Dienste (pending/rejected zählen nicht); (c) Nicht-Admins sehen
kein Dropdown und können die Admin-Routen nicht aufrufen (403); (d) volle Suite grün.

### Gate (Plan): opencode `mimo-v2.5-free`, 10 Findings — Urteile

Geschickt: LEDGER.md (dieser Abschnitt), server/duties.js, server/index.js, roster.js, app.js.

| # | Finding | Urteil |
|---|---|---|
| 1 | async-Umstellung ist Architekturänderung, nicht Einzeiler | **übernommen als Klarstellung** — genau dafür steht der zentrale async-Helper im Plan; alle 4 Aufrufer werden async |
| 2 | Namens-Quellen (LocalStorage-Keys vs. display_name vs. E-Mail-Präfix) → Urlaubs-Lookup kann danebengreifen | **übernommen** — Berechnung und Urlaubs-Toggle nutzen künftig denselben Server-Namen (COALESCE); neue Invariante dokumentiert (s. #10) |
| 3 | Admin-DELETE ohne Audit-Trail | **übernommen** — Audit-Ereignis mit betroffener user_id in der Route |
| 4 | UNIQUE-Konflikt: Ziel-Nutzer hat pending-Dienst am Tag → 409 | **teilweise** — UI zeigt für die gewählte Person ihren bestehenden Eintrag (statt ganz/halb), 409-Meldung nennt den Grund; kein Auto-Reject (stiller Datenverlust) |
| 5 | Dropdown zeigt E-Mails, solange display_name fehlt | **übernommen als Fallback** — Anzeige fällt auf E-Mail-Präfix zurück (wie der Aushang selbst) |
| 6 | `loeschenDurchAdmin` existiert nicht | **verworfen** — der Ledger-Absatz listet die Funktion unter „Was gebaut wird", nicht als Bestand (Zitat: „Fachlogik in server/duties.js (anlegenDurchAdmin, loeschenDurchAdmin)") |
| 7 | Transformation Roster-Array → calculateAllEmployees-Format verschwiegen | **übernommen implizit** — ist der Kern des Helpers |
| 8 | Eintragen braucht Netz, kein Offline-Puffer | **übernommen als Doku** — bewusster Trade-off seit dem Team-Release („Server ist die Wahrheit") |
| 9 | Doppelklick → mehrere 409-Toasts | **verworfen (ponytail)** — UNIQUE-Index fängt es serverseitig, ein Fehler-Toast ist akzeptabel; Spinner bei Bedarf nachrüsten |
| 10 | Neue implizite Invariante „Berechnung korrekt nur mit gepflegtem display_name" | **übernommen** — Invariante: *Anzeigename ist der Berechnungs-Schlüssel; Quelle ist immer der Server-Name (COALESCE display_name, E-Mail-Präfix), nie eine lokale Liste* |

### Story 1 (Server: Admin-Dienste) — umgesetzt, Suite 113/113 grün

`anlegenDurchAdmin` (sofort approved, decided_by=Admin, Existenz-Check der Ziel-userId),
`loeschenDurchAdmin` (jeder Status, liefert betroffene user_id), Routen
`POST/DELETE /api/admin/duties` hinter `adminMiddleware` mit Audit
(`admin_duty_create`/`admin_duty_delete`). TDD: 3 Logik- + 2 Routen-Tests zuerst rot.

**Story-Review** opencode `mimo-v2.5-free` (geschickt: duties.js, index.js, beide Tests) — 6 Findings, alle verworfen mit Evidenz:

| Finding | Urteil |
|---|---|
| Test-Lücke „anlegen nach anlegenDurchAdmin" | verworfen — UNIQUE-Index ist symmetrisch über (user_id,date), Richtung egal; Kritiker nannte es selbst „falsch-positiv, kein Bug" |
| Guard gegen Löschen eigener approved-Dienste | verworfen — Löschen von Fehleinträgen IST das Feature; Audit-Trail existiert; der users-DELETE-Guard schützt Konten, nicht Einzeleinträge |
| NaN-Validierung DELETE-Route | verworfen — `parseInt('abc')→NaN`, `get(NaN)→undefined→404`: gleiche, korrekte Semantik wie die bestehende `DELETE /api/duties/:id` seit v1.0; kein Exploit (Kritiker: „Glückstreffer… kein Bug") |
| Test-Lücke „entscheiden auf Admin-Eintrag" | verworfen — identischer Codepfad (`status !== 'pending'` → ENTSCHEIDEN) bereits getestet in „entscheiden: … nicht zweimal" |
| DOPPELT-Meldung irreführend | verworfen — „für diesen Tag ist bereits ein Dienst eingetragen" ist statusunabhängig korrekt |
| share-Variation im UNIQUE-Test | verworfen — Index liegt auf (user_id,date), share ist dafür irrelevant; das testete SQLite, nicht unseren Code |

### Story 2 (Frontend: Team-Plan wird Quelle + Admin-Dropdown) — umgesetzt

- `roster.js`: `zuBerechnung(rows)` (pur, node-getestet: nur approved, T12-Dates),
  Admin-Dropdown „Eintragen für" (aktive Nutzer aus `/api/admin/users`, Fallback
  E-Mail-Präfix), `fremdSpalte` (bestehender Eintrag → Entfernen-Knopf, frei → ganz/halb
  über die Admin-Route), Node-Export-Guards.
- `app.js`: zentraler async-Helper `holeTeamDienste(year, month)`; `calculateBonuses`,
  `generateEmailReport`, `exportCSV`, `exportBonusReport` lesen den Team-Plan; Start-Tab
  ist `roster`.
- `index.html`: Tab-Knopf „Dienste eintragen" entfernt (Markup bleibt), Dropdown-Markup.
- `sw.js`: Cache-Bump v14 (ohne Bump serviert der SW die alte App — real getroffen im E2E).
- **Fix aus dem Review:** `storage.getVacationMapForMonth` baut die Map jetzt aus den
  Urlaubs-Daten selbst statt aus der Legacy-Mitarbeiterliste — sonst hätte der
  Urlaubsmodus für Team-Plan-Namen nie gegriffen (Geldbezug). Browser-Test rot→grün.

**Verifikation:** Suite node 115/115 + Browser 121/121 grün. E2E real (Playwright gegen
lokalen Server, Magic-Link-Login): Admin wählt „Alsholi" im Dropdown, klickt Sa 1./So 2./
Mo 3./Di 4. an → sofort approved im Plan; Berechnung August 2026 zeigt exakt diese
Dienste (Sa 1,0 / So 1,0 / WT 2,0 → Variante 3, 500 €); Entfernen räumt den Eintrag.
403-Verhalten für Nicht-Admins durch Routen-Tests belegt.

**Story-Review + Gate 3 (Security-Linse)** opencode `mimo-v2.5-free` (geschickt: roster.js,
app.js, index.html, sw.js, roster.test.js) — 8 Findings:

| Finding | Urteil |
|---|---|
| Urlaubs-Map aus Legacy-Liste → greift für Server-Namen nicht | **übernommen und gefixt** (s. o., Test rot→grün) |
| XSS: Namen unescaped in innerHTML (`loadEmployeeList` onclick, `createResultCard`, E-Mail-Report) | **teilweise / vertagt** — vorbestehende Muster, nicht von dieser Story eingeführt; Namen setzt ausschließlich der Admin (auth-geschützt). Als offener Punkt notiert, Fix = `escapeHtml` an den Render-Stellen |
| `onVacationToggle` ohne await | verworfen — `setVacationMode` ist synchron (try/catch greift), `calculateBonuses` behandelt Fehler intern per Toast |
| `fremdSpalte` ohne eigenen Admin-Check | verworfen — Aufruf nur hinter `this.fuer && this.ich.isAdmin` (roster.js, zeichnen); `fuer` kann ohne Admin-Dropdown nie gesetzt sein; Server erzwingt 403 |
| Race bei schnellem Urlaubs-Toggle | verworfen (ponytail) — Ein-Admin-Nutzung, letzter Lauf gewinnt, kein Datenverlust (Flag liegt im Storage) |
| Versteckter `tab-duties`-Codepfad | verworfen — bewusst („Code bleibt für den Notfall", HTML-Kommentar) |
| SW-Cache-Semantik | kein Finding — `skipWaiting` vorhanden, Bump gemacht |
| innerHTML-Header mit Ternary | verworfen — nur String-Literale, kein Nutzerinput |

**Offene Punkte:** (1) XSS-Härtung der Namens-Render-Stellen (`escapeHtml` in
`createResultCard`, `loadEmployeeList`, E-Mail-Report) — separater kleiner Fix.
(2) graphify-Rebuild steht weiter aus (kein funktionierendes Backend, s. Eintrag
2026-08-08). (3) Deploy: Vor dem Rollout `display_name` für alle Konten prüfen und
Alt-Dienste ggf. per `/api/admin/migrate-legacy` übernehmen — die Berechnung sieht nur
noch die duties-Tabelle.
