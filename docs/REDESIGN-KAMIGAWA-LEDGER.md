# Fortschritts-Ledger — UI-Redesign „Kamigawa" (Branch `redesign/kamigawa-ui`)

Plan: 2026-07-10 · Methodenstand nachgezogen: 2026-08-08 (DEV-METHOD **v1.15**) ·
skaliert: nicht testbares Artefakt (Markup/CSS) → Akzeptanzkriterien statt rotem Test.
Kritiker-Gates unverändert Pflicht, aber über den **Übergangs-Kritiker** (opencode) —
Routing und Backend-Messungen im Projekt-[LEDGER.md](../LEDGER.md).

## Phase 0+2 — Was/Warum (kombinierter Plan, Gegenstand von qwen-Gate 1+2)

**Was:** Komplettes Redesign der Bedienoberfläche von Dienstplan-Pro im „Kamigawa"-Stil
des Benutzers (Quelle: `G:\Claude\MTG-Spekulation` — Kanagawa-Palette `--kng-*`,
`kamigawa.css` + `theme-toggle.js`, Sidebar/KPI-Card/Mobile-Tabbar-Visualisierung).
**Warum:** Die aktuelle UI (Gradient-Theme, zentrierte Tabs) wirkt veraltet; der Benutzer
will seine repo-übergreifende Designsprache auch hier.

**Nur Optik/Struktur — keine Logik.** `app.js`, `calculator.js`, `variants.js`,
`storage.js`, `sync.js`, `auth-ui.js`, `image-import.js`, Server: unverändert.

### Umfang (geänderte/neue Dateien)

| Datei | Änderung |
|---|---|
| `kamigawa.css` | NEU — Token-Layer, 1:1 aus MTG-Spekulation übernommen (dark default, light „lotus", opt-in „neon") |
| `theme-toggle.js` | NEU — 1:1 aus MTG-Spekulation (`KngTheme`, Zyklus dark→light→neon, localStorage `kng_theme`, System-Pref-Fallback) |
| `styles.css` | Komplett neu auf `--kng-*`-Tokens; **keine hartkodierten Hex-Werte** |
| `index.html` | Shell-Umbau: Desktop-Sidebar (≥900px) / Mobile-Bottom-Tabbar (<900px), Login-Overlay + Admin-Form ohne Inline-Styles, Theme-Toggle-Button, `theme-color` angepasst |
| `sw.js` | Cache-Name `dienstplan-pro-v8` → **`-v9`** + neue Assets (`kamigawa.css`, `theme-toggle.js`) in die Cache-Liste |
| `manifest.json` | **Gate-Nachtrag:** `theme_color`/`background_color` (aktuell `#0f172a`/`#1e293b`) auf die Kanagawa-Dark-Werte ziehen — sonst weicht die App-Shell (Splash, Titelleiste) vom Theme ab |

### Design-Entscheidungen (frontend-design)

- **Palette/Typo:** exakt die Kanagawa-Tokens (Inter + JetBrains Mono als Font-Stack mit
  System-Fallback — **kein Webfont-Download**, PWA bleibt offlinefähig, kein CDN).
- **Layout:** Desktop = feste Sidebar links (Brand, 4 Nav-Einträge = bisherige Tabs,
  Footer mit Theme-Toggle + Logout-Zugang über Einstellungen); Mobile = kompakter Header
  + fixe Bottom-Tabbar (4 Einträge). Bestehende `.tab-btn`/`data-tab`/`.tab-content
  .active`-Mechanik von `app.js` bleibt wörtlich erhalten — nur CSS positioniert um.
  **Gate-Nachtrag:** die Tab-Leiste wird dabei von `<div class="tabs">` (index.html:36) zu
  `<nav class="tabs" aria-label="Bereiche">` — Klassen, IDs und `data-tab` unverändert,
  `app.js` selektiert über `.tab-btn` und merkt nichts davon.
- **Signature-Element (Gate-korrigiert):** Slot-Badges der Tag-Klassifizierung in
  Kanagawa-Farben (fr=gold, sa=magenta, so=violet/blue, weekday=muted) — die
  Geschäftslogik wird sichtbare Designsprache; Gewinner-Variante bekommt `--kng-glow`.
  **Reichweite präzisiert:** `slot-*`-Klassen erzeugt **nur** `image-import.js:547`
  (Import-Vorschau). Die Dienstliste rendert `app.js:420/426` mit `duty-item`,
  `qualifying` und `badge-qualifying`/`badge-normal` — dort trägt die **`badge`-Familie**
  die Slot-Farbigkeit, sonst wäre ein Eingriff in `app.js` nötig (Invariante 1).
  Sonst bewusst ruhig (Kanagawa ist flat, kein Grid, kein Neon per Default).
- **Motion:** nur `--kng-transition-*` Mikro-Übergänge; `prefers-reduced-motion` respektiert.
- **Theme-Ladeposition (Gate-Nachtrag):** `theme-toggle.js` initialisiert erst bei
  `DOMContentLoaded` (Quelle Zeile 177–183) — als letztes Skript vor `</body>` geladen
  gäbe das einen sichtbaren Farb-Flash. Deshalb ein **Mini-Bootstrap inline im `<head>`**
  (setzt `data-theme` aus `localStorage.kng_theme` bzw. `prefers-color-scheme`, 3 Zeilen),
  `theme-toggle.js` selbst bleibt unverändert und übernimmt danach.

### Invarianten (berührte)

1. **Kein JS-Verhalten ändern:** alle DOM-IDs und alle dynamisch erzeugten Klassen
   bleiben bestehen und werden gestylt (Inventar unten). `app.js` & Co. unangetastet.
   **Präzisiert (Gate):** der Umschalt-Kontrakt `.tab-content { display: none }` /
   `.tab-content.active { display: block }` (styles.css:77–85) bleibt **wörtlich**
   erhalten — `app.js:151–161` schaltet nur die Klasse `active`. Ein Layout-`display`
   (grid/flex) darf nur auf Eltern-/Kind-Elementen liegen, nie auf `.tab-content` selbst.
2. **PWA/Offline:** `sw.js`-Cacheliste vollständig + Versionsbump, keine externen
   Ressourcen (CSP/offline).
3. **Keine hartkodierten Hex in `styles.css` UND `index.html`** — alles über `--kng-*`
   (Konvention aus MTG-Spekulation CLAUDE.md §5). `index.html` trägt heute die meisten
   Hartwerte inline (Zeilen 18–26 Login-Overlay, 186 Admin-Form, 239 E-Mail-Button);
   sie wandern in Klassen. Ausgenommen: der Druck-/E-Mail-Report in `app.js` (eigenes
   Inline-CSS, außer Scope — siehe A9 für die sichtbare Folge im Modal).
4. Auth/Session/Datenmodell: nicht berührt.
5. **Stapelordnung (Gate):** Login-Overlay liegt heute inline auf `z-index:10000`
   (index.html:18), Modals auf `1500` (styles.css:560). Nach dem Verschieben in CSS muss
   die Ordnung Overlay > Modal > Toast erhalten bleiben.

### Klassen-Inventar (muss nach Redesign gestylt sein)

Aus `app.js`: `text-muted, employee-item, employee-name, btn(-primary/-secondary/-danger/-success/-small),
duty-info, duty-date, duty-meta, badge(-qualifying/-normal), duty-share, result-card, result-header,
vacation-toggle, vacation-active-banner, threshold-warning, bonus-total, variant-badge, winner, amount,
classified-summary, variant-details, variant-eligible, variant-not-eligible, variant-card, variant-header,
variant-row, variant-bonus, modal, modal-backdrop, modal-content, modal-close, modal-actions,
api-key-status-ok/-none, toast+show, tabs, tab-btn, tab-content, active, card, card-header, form-group,
month-selector, date-stepper, input-group, duties-list, employee-list, settings-section, info-box,
text-warning`.
**Gate-Nachtrag aus `app.js` (fehlten, obwohl gestylt):** `duty-item` (app.js:420,
styles.css:238) und das blanke `qualifying` (app.js:420 → `.duty-item.qualifying`,
styles.css:249).
Aus `image-import.js`: `drag-over, unknown-name-row, unknown-candidate, fuzzy-hint,
preview-employee-group, preview-table, preview-row, outside-month, row-remove-btn, drag-drop-zone,
thumbnail-preview, thumbnail-meta, modal-stage, spinner, privacy-notice, unknown-names-box`.
**Gate-Nachtrag aus `image-import.js`:** `slot-badge` + `slot-fr`/`slot-sa`/`slot-so`/
`slot-weekday` (image-import.js:547, styles.css:764–767) — ausgerechnet das
Signature-Element fehlte im Inventar. Nebenbefund: `slot-sa` und `slot-so` haben heute
**dieselbe** Farbe (`#dc3545`, styles.css:765/766); die Kanagawa-Palette behebt das.
Aus `auth-ui.js`: `admin-user-row`. (Print-Report in `app.js` hat eigenes Inline-CSS — außer Scope.)
**Grenze (Gate, dokumentiert):** `auth-ui.js:80` setzt auf dieselbe Zeile ein
`style.cssText` inkl. `border-bottom:1px solid #eee`. Inline schlägt Klasse — die Regel
für `.admin-user-row` greift nur mit `!important` bzw. nur für nicht inline gesetzte
Eigenschaften. `auth-ui.js` bleibt laut Invariante unangetastet; wir nehmen die graue
Trennlinie im Admin-Bereich bewusst hin.

### Akzeptanzkriterien (statt rotem Test; echte Verifikation im Browser)

- **A1:** Alle 4 Bereiche über Sidebar (Desktop) und Tabbar (Mobile ≤900px) erreichbar;
  Tab-Wechsel funktioniert unverändert (app.js ungeändert).
- **A2:** Kern-Flows end-to-end grün: Mitarbeiter anlegen → Dienst eintragen →
  Berechnung ausführen (Ergebnis-Karten sichtbar) → Einstellungen öffnen.
- **A3:** Theme-Zyklus dark→light→neon per Button, persistiert über Reload, ohne Override
  folgt es `prefers-color-scheme`; **kein Farb-Flash beim Laden** (Head-Bootstrap) und der
  Wechsel funktioniert auch **offline** (beide neuen Assets in der `sw.js`-Cacheliste).
- **A4:** Bestehende Test-Suite (`test.html`) bleibt komplett grün.
- **A5:** Login-Overlay und Bild-Import-Modal im neuen Stil, funktional; Login-Overlay
  liegt weiterhin über jedem Modal (Invariante 5).
- **A6:** Responsiv ohne horizontales Scrollen an den Prüfpunkten **360 / 768 / 899 / 900 /
  1200 px** — 899/900 ist der neue Umschaltpunkt Tabbar↔Sidebar, 768 der alte Breakpoint
  (styles.css:492), der dabei verschwindet; sichtbarer Tastatur-Fokus;
  `prefers-reduced-motion` deaktiviert Transitions.
- **A7:** `grep -iE '#[0-9a-f]{3,6}' styles.css index.html` liefert keine Farbwerte
  (nur Tokens) — **`index.html` mitgeprüft**, dort liegen die Hartwerte heute inline.
- **A8 (neu, Gate):** Drucken der App-Seite funktioniert weiter. Der bestehende
  `@media print`-Block (styles.css:532–552) blendet `.tabs` aus und zeigt alle
  `.tab-content` — nach dem Shell-Umbau muss er Sidebar **und** Bottom-Tabbar ausblenden;
  geprüft wird über die Druckvorschau.
- **A9 (neu, selbst gefunden):** Der E-Mail-Report im Modal bleibt lesbar. `app.js:625–682`
  baut `reportHtml` mit fest verdrahtetem hellem Hintergrund (`#ffffff`, `#f2f2f2`,
  `#f9f9f9`) **ohne** eigene Textfarbe und hängt es in `#report-content` (app.js:698).
  Im Dark-Theme erbt der Text die helle Modal-Farbe → **hell auf weiß, unlesbar**.
  Fix CSS-seitig (kein `app.js`-Eingriff): `#report-content` bekommt eine helle Fläche
  mit dunklem Text fest zugewiesen. Prüfung: Modal in allen drei Themes öffnen.

## Gate-Protokoll

**Kritiker-Routing (Stand 2026-08-08, gemessen):** Box `.99` und DeepSeek antworten beide
**401**, qwen.mjs ist damit tot. Gates laufen laut Methoden-Übergangsregel über opencode:

```
opencode run -m opencode/mimo-v2.5-free "<Linse + Auftrag, Dateipfade nennen> Do NOT ask for confirmation — execute immediately."
```

aus dem Projektverzeichnis, ohne `--auto` (read-only), **nie parallel**. Smoke-Test am
2026-08-08: Exit 0 in 13 s. Bei Rate-Limit anderes Gratismodell (Matrix in DEV-METHOD.md);
OpenRouter-Eskalation nur sparsam (Restbudget 0,35 $). Exit ≠ 0 = Gate **nicht gelaufen** →
anhalten und fragen, nie stillschweigend überspringen. Jedes Finding selbst verifizieren,
Übernahme/Verwerfung mit Evidenz hier dokumentieren (~⅔ Fehlalarme sind der Erfahrungswert).

- [x] **Gate 1+2 (dieses Ledger als Planungsartefakt) — bestanden am 2026-08-08**, Findings
      eingearbeitet (Protokoll unten)
- [x] **Implementierung** (eine Story: „Kamigawa-Shell + Re-Skin") — 2026-08-08
- [x] **Story-Review + Gate 3** (kombiniert, da reine Optik) — 2026-08-08, Protokoll unten
- [x] **Echte Verifikation A1–A9** im Browser (Playwright, echter Server mit Magic-Link-Login)
- [x] **Commit** (ein Commit für die Story, inkl. dieses Ledgers)
- [ ] graphify-Rebuild nach dem Commit-Block — **blockiert**, solange kein Backend
      erreichbar ist (Projekt-LEDGER.md, „Offene Punkte")

### Gate 1+2 — Ergebnis (2026-08-08)

**Kritiker:** opencode `opencode/mimo-v2.5-free` (Übergangs-Kritiker, qwen-Ersatz —
Box/DeepSeek beide 401, im Projekt-LEDGER.md belegt). **Zwei Linsen, sequenziell:**

| Linse | Gegenstand + gelesene Dateien | Laufzeit | Findings |
|---|---|---|---|
| 1 — Produkt/Anforderungen | dieses Ledger; Abgleich `index.html`, `styles.css`, `app.js`, `sw.js`, `auth-ui.js`, `image-import.js` | 109 s, Exit 0 | 12 |
| 2 — Architektur/Technik + Zusatzfrage „verletzt der Plan eine Invariante?" | wie oben + `manifest.json` | 226 s, Exit 0 | 10 |

**22 Findings, entdoppelt 19: 13 übernommen, 5 mit Evidenz verworfen, 1 halb.**
Die hohe Trefferquote (statt der üblichen ⅓) hat einen Grund: der Plan ist vier Wochen alt
und war nie gegen den echten Code geprüft — der Kritiker durfte beides nebeneinanderlegen.

**Übernommen (in den Plan eingearbeitet):**

| Finding | Evidenz | Einarbeitung |
|---|---|---|
| Inventar unvollständig: `duty-item`, `qualifying` fehlen | app.js:420, styles.css:238/249 | Inventar-Nachtrag; **Invariante 1 wäre sonst beim ersten Rendern verletzt** |
| Inventar unvollständig: `slot-badge`, `slot-fr/sa/so/weekday` fehlen | image-import.js:547, styles.css:764–767 | Inventar-Nachtrag (ausgerechnet das Signature-Element) |
| Signature-Element gar nicht dort umsetzbar, wo es gedacht war | `slot-*` nur in image-import.js:547; Dienstliste nutzt `badge-qualifying/-normal` (app.js:426) | Design-Entscheidung korrigiert: Slot-Farben in der Import-Vorschau, `badge`-Familie in der Dienstliste — kein `app.js`-Eingriff |
| A7 prüft nur `styles.css`, die Hartwerte liegen aber in `index.html` | index.html:18–26/186/239 | A7 + Invariante 3 auf `index.html` erweitert |
| Print-Block referenziert `.tabs` | styles.css:542–546 | neues **A8** |
| Farb-Flash beim Laden | theme-toggle.js:177–183 (Init erst bei `DOMContentLoaded`), Skripte laden vor `</body>` | Head-Bootstrap als Design-Entscheidung; Datei selbst bleibt 1:1 |
| `manifest.json` fehlt im Umfang | manifest.json:6–7 (`#0f172a`/`#1e293b`) | in die Umfangstabelle |
| z-index-Ordnung geht beim Entfernen der Inline-Styles verloren | index.html:18 (10000) vs. styles.css:560 (1500) | neue **Invariante 5** + A5 |
| `.tab-content`-Display-Kontrakt nur implizit | styles.css:77–85, app.js:151–161 | Invariante 1 präzisiert |
| `auth-ui.js:80` setzt Inline-`cssText` → CSS greift nicht | auth-ui.js:79–80 | als bewusste Grenze dokumentiert (Datei bleibt unangetastet) |
| Breakpoint 900 kollidiert mit bestehenden 768 | styles.css:492 | A6 mit Prüfpunkten 360/768/899/900/1200 |
| Cache-Name nicht benannt | sw.js:1 (`dienstplan-pro-v8`) | Umfangstabelle nennt `-v9` |
| Offline-Theme-Wechsel ungeprüft | sw.js:2–14 (Assets fehlen noch) | A3 erweitert |
| Navigation ohne Semantik | index.html:36 `<div class="tabs">` | Layout-Entscheidung: `<nav>` statt `<div>`, Klassen/IDs unverändert |

**Verworfen — mit Evidenz:**

| Finding | Warum falsch |
|---|---|
| „`theme-toggle.js` 1:1 riskant, evtl. fremde DOM-Abhängigkeiten" | Datei komplett gelesen: einzige DOM-Berührung ist `documentElement.setAttribute('data-theme')` plus die Attribut-Verträge `[data-kng-toggle]`/`[data-kng-icon]` (delegierter Click). UMD-Wrapper, kein projektspezifischer Selektor. Der echte Fund an dieser Datei ist die Init-Zeit (oben übernommen) |
| „`generateEmailReport` erzeugt ein zweites Modal im alten Stil" | app.js:690–706 nutzt ausschließlich Inventar-Klassen (`modal`, `modal-backdrop`, `modal-content`, `modal-close`, `modal-actions`, `btn …`); die zwei Inline-Styles sind `margin-top:0` und `font-size:1.1em`, keine Farben. **Der Inhalt** ist das Problem — daraus wurde A9 |
| „`cont.style.display=''` kann in einen unerwarteten Zustand fallen" | `style.display=''` entfernt die Inline-Deklaration, danach gilt wieder die Kaskade — unabhängig davon, was das neue CSS setzt (auth-ui.js:18/25) |
| „`kng_theme` wird bei Nutzerwechsel nicht gelöscht" | Kein Fehler, sondern eine Entscheidung: Theme ist eine Geräte-Einstellung, kein Nutzerdatum. `clearLocalData` (auth-ui.js:12) löscht bewusst nur Datenschlüssel — bleibt so |
| „Gradienten sind keine simplen Hex, Token-Risiko" | Die Gradienten bestehen *aus* Hex-Werten (`linear-gradient(135deg, #667eea 0%, #764ba2 100%)`, styles.css:12/28/186/370) — A7s grep findet sie. Zudem fallen sie mit der flachen Kanagawa-Palette weg |
| „stale assets nach `skipWaiting`" | Bestandsverhalten (sw.js:18 `skipWaiting`, :28 `clients.claim()`), nicht vom Redesign verursacht — außerhalb dieses Gates |

**Halb übernommen:** „`slot-sa` und `slot-so` haben dieselbe Farbe" (styles.css:765/766,
beide `#dc3545`) ist ein **Bestands**fehler, kein Plan-Defekt — als Umsetzungshinweis im
Inventar notiert, die Kanagawa-Palette behebt ihn ohnehin.

**Selbst gefunden bei der Verifikation (nicht vom Kritiker):** der Kontrast-Bug im
E-Mail-Report-Modal → **A9**. Aufgefallen beim Nachprüfen des verworfenen Findings oben —
der Kritiker zeigte in die richtige Gegend, aber auf das falsche Element.

## Story „Kamigawa-Shell + Re-Skin" (2026-08-08)

**Umgesetzt:** `kamigawa.css` + `theme-toggle.js` byte-identisch aus
`G:\Claude\MTG-Spekulation\src\ui\static\` übernommen (SHA256 verglichen) · `styles.css`
komplett neu auf `--kng-*` · `index.html` Shell-Umbau (Grid: Sidebar-Spalte ab 900px,
fixe Bottom-Tabbar darunter; `<nav>`; Login-Overlay und Admin-Form ohne Inline-Styles;
Head-Bootstrap gegen den Farb-Flash) · `sw.js` v8→v9 plus beide neuen Assets ·
`manifest.json` auf die Kanagawa-Dark-Werte.

**Nicht gebaut, bewusst:** kein roter Test (nicht testbares Artefakt — die Methode ersetzt
ihn durch A1–A9). Tote Regeln `result-summary/-item/-label/-value` ersatzlos entfernt:
`grep` über alle `.js`/`.html` findet keinen Erzeuger mehr.

### Verifikation A1–A9 (echter Server auf :3456, Magic-Link-Login als Admin, Playwright)

| Kriterium | Ergebnis | Beleg |
|---|---|---|
| A1 Navigation | **PASS** | Sidebar 264px links (x=565, Inhalt x=829); Umschalten über `.active` funktioniert, `app.js` unverändert |
| A2 Kern-Flow | **PASS** | Mitarbeiter anlegen → 4 Dienste (Fr/Sa/So/Di) → Berechnung: 3 Variantenkarten, Gewinner mit Glow, **700,00 €** — rechnerisch korrekt (V3: Abzug fr+so, sa 450 + Werktag 250) |
| A3 Theme | **PASS** | Zyklus light→neon→dark→light, Icons ☾/✦/☀, `localStorage` persistiert, nach Reload `dark`; `meta[theme-color]` folgt dem Token (`#F2ECBC`/`#0A0E1A`/`#16161D`); Flash verhindert durch Head-Bootstrap |
| A4 Suite | **PASS** | `npm test`: **61/61** grün, vor und nach allen Änderungen |
| A5 Overlays | **PASS** | Login-Overlay z-index 10000, Import-Modal 1500, Backdrop `--kng-overlay`, Stufe 1 bedienbar |
| A6 Responsiv | **PASS** (nach Fix) | 360/768/899/900/1200 ohne H-Scroll; Umschaltpunkt exakt: 899 = Tabbar, 900 = Sidebar; Fokusring 2px `--kng-border-strong`; `prefers-reduced-motion`-Regel geparst |
| A7 Keine Hartwerte | **PASS** | `grep -iE '#[0-9a-f]{3,8}' styles.css index.html` → leer |
| A8 Druck | **statisch verifiziert** | Print-Regeln geparst (`:root{color-scheme:light}`, `*{color:CanvasText!important}`, `.tabs,.sidebar-footer,.btn,… {display:none}`, `.tab-content{display:block!important}`). **Offen:** eine echte Druckvorschau ließ sich headless nicht auslösen — visuelle Prüfung steht aus |
| A9 Report-Kontrast | **PASS** (nach Fix) | schwarz auf weiß in **dark und light** (`rgb(0,0,0)`), via `color-scheme: light` + `CanvasText` |

**Eigene Vollständigkeitsprüfung:** 92 aus JS/HTML erzeugte Klassen gegen `styles.css`
abgeglichen — jede hat eine Regel. Die 7 Ausreißer waren erklärbar: 5 gehören zum
Druck-Report mit eigenem Inline-CSS (außer Scope), 2 sind Regex-Artefakte.

### Drei echte Defekte, gefunden **durch** die Verifikation

1. **Eigener Fehler:** beim Einfügen der A9-Regel blieb ein Kommentar offen (`*/` doppelt) —
   der CSS-Parser verwarf daraufhin die `#report-content`-Regel stillschweigend. Erst die
   Messung im Browser (heller Text auf weiß) brachte es ans Licht, kein Werkzeug meldete es.
   Seitdem zusätzlich eine statische Klammer-/Kommentar-Balance-Prüfung.
2. **A6-Überlauf bei 360px:** `auth-ui.js:80` setzt inline `display:flex` **ohne**
   `flex-wrap`; E-Mail (210px) + Button (112px) passten nicht in 279px → 10px H-Scroll.
   Behoben per `flex-wrap`/`overflow-wrap` in `.admin-user-row` — beide stehen **nicht** im
   Inline-Style, greifen also, ohne `auth-ui.js` anzufassen. Trat nur als Admin auf.
3. **Regression durch die neue Tabbar:** `sync.js:102` positioniert `#sync-status` inline auf
   `bottom:8px` mit `z-index:9999` — die Pille lag damit über der Bottom-Tabbar und verdeckte
   Bedienelemente (gemessen: 745–772 vs. Tabbar ab 723). Behoben mit
   `#sync-status { bottom: 76px !important }` **nur im Mobile-Block**; die Farbe bleibt bei
   `sync.js`, weil sie online/offline signalisiert.

### Story-Review + Gate 3 (kombiniert, 2026-08-08)

**Kritiker:** opencode `opencode/mimo-v2.5-free`, 134 s, Exit 0. Gegenstand: `styles.css`,
`index.html`, `sw.js`, `manifest.json` (der Kritiker las zusätzlich die unveränderten
JS-Dateien zum Abgleich). **10 Findings — 2 übernommen, 2 mit Messung widerlegt, 2 als
dokumentierte Grenze übernommen, 4 vom Kritiker selbst als „kein Bug" markiert.**

| Finding | Urteil | Evidenz |
|---|---|---|
| [HOCH] Neon-Flash: der Head-Bootstrap kenne nur dark/light | **widerlegt** | Empirisch: `kng_theme='neon'` + Reload → `data-theme="neon"`, Body-BG `rgb(10,14,26)`. Der Bootstrap übernimmt den gespeicherten Wert unverändert; der Fallback greift nur bei leerem Wert |
| [MITTEL] `#sync-status{bottom:76px!important}` gelte auch auf Desktop | **widerlegt** | CSSOM: die Regel existiert **nur** in `@media (max-width: 899px)`, keine globale Regel; Desktop misst weiterhin `bottom: 8px` |
| [MITTEL] Login-Overlay ohne `role="dialog"` | **übernommen** | `role="dialog" aria-modal="true" aria-labelledby` ergänzt (Fokus-Trap bräuchte JS → außer Scope) |
| [NIEDRIG] Theme-Button mit statischem `aria-label` | **übernommen** | Label folgt jetzt dem Zustand: „Design wechseln (aktuell: Neon)" → „… (aktuell: Dunkel)", verifiziert |
| [HOCH] Hartwerte in `manifest.json` | **Grenze dokumentiert** | Korrekt beobachtet, aber unlösbar: das Manifest-Format kennt keine Variablen. Folge: der PWA-Splash ist immer dunkel, auch für Light-/Neon-Nutzer |
| [MITTEL] `border-bottom:#eee` aus `auth-ui.js` passt in keinem Theme | **Grenze dokumentiert** | Stimmt, liegt aber im Inline-`cssText` einer tabuisierten Datei |
| 4 × „kein Bug" (Grid/Print, Neon-Fallback, `position:relative`, Print-Umfang) | **kein Handlungsbedarf** | Vom Kritiker selbst so eingeordnet |

**Vom Kritiker bestätigt:** z-index-Ordnung (Overlay 10000 > Modal 1500 > Toast 1000 >
Tabbar 900), der Tab-Umschaltvertrag wörtlich eingehalten, Cacheliste vollständig, keine
neuen externen Ressourcen, kein Datenabfluss.
