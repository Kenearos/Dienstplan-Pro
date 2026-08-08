# Fortschritts-Ledger — dienstplan

Stories, Gate-Ergebnisse (inklusive der geschickten Dateien) und Finding-Urteile.
Eine Verwerfung braucht Evidenz — Code-Zitat, Testlauf oder Repro-Versuch.

Laufende Arbeit mit eigenem Ledger: [UI-Redesign „Kamigawa"](docs/REDESIGN-KAMIGAWA-LEDGER.md)
(Branch `redesign/kamigawa-ui`).

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
