# Feature A: Bild → Dienste Import

- **Datum:** 2026-05-11
- **Status:** Draft
- **Autor:** Design-Phase, Dienstplan-Pro
- **Scope:** Optionaler Bulk-Import von Diensten aus einem Foto/Screenshot einer Dienstplan-Tabelle via OpenRouter Vision-LLM.

---

## 1. Ziel / Problemstellung

Aktuell werden Dienste in Dienstplan-Pro im Tab **"Dienste eintragen"** ausschließlich manuell – ein Dienst pro Klick – erfasst. Für eine Assistenzärztin mit 6–10 Diensten pro Monat ist das knapp 30 Klicks pro Person pro Monat. In der Praxis bekommen Assistenzärzte ihren Dienstplan typischerweise als PDF, Foto oder Screenshot einer Tabelle. Die manuelle Übernahme ist fehleranfällig und reibungsbehaftet.

**Ziel:** Ein optionaler Import-Pfad, bei dem der Benutzer ein einzelnes Bild (Foto vom Aushang, Screenshot vom Plan, exportierter Tabellen-Snip) hochlädt. Ein OpenRouter Vision-LLM extrahiert die Einträge als strukturiertes JSON, der Benutzer prüft das Ergebnis in einer Vorschau und bestätigt. Die bestehende Persistenz über `DataStorage` bleibt unangetastet.

**Pflichtmerkmale:**

- 100 % browserseitig, kein Backend. Der OpenRouter-API-Key wird vom Benutzer selbst in `localStorage` gehalten.
- Der Import ist **rein additiv**: bestehende manuelle Eingabe wird nicht ersetzt.
- Robuste Namensauflösung gegen den existierenden `dienstplan_employees`-Bestand (exakt, normalisiert, fuzzy).
- Konfliktverhalten mit existierenden Diensten ist deterministisch (Replace, siehe Abschnitt 11).

---

## 2. Out of Scope

- **Feature B (Bonus-Varianten):** siehe `2026-05-11-bonus-varianten-design.md`. Beide Features sind unabhängig und teilen sich keinen Code.
- **Kein Backend, kein Server-Proxy.** Alle API-Calls gehen direkt aus dem Browser an OpenRouter. Eine zukünftige Hetzner-Proxy-Variante ist denkbar, aber nicht Teil dieses Specs (siehe Abschnitt 16).
- **Kein Multi-Image-Batch.** Genau ein Bild pro Importvorgang. Mehrseitige Pläne werden seitenweise importiert. (Siehe Abschnitt 16, Future Work.)
- **Kein PDF-Import.** Nur Bildformate (PNG, JPG, JPEG, WebP). PDF-Konvertierung ist Future Work.
- **Keine OCR-Heuristik im Browser.** Die Erkennung läuft vollständig über das LLM; es gibt keine Fallback-Tesseract-Schiene.
- **Keine automatische Monatsrollover-Logik** bei Einträgen, die zwei Monate überspannen. Falls erkannt, wird gewarnt; der Import nutzt den im Tab gewählten Monat als Ziel (siehe Abschnitt 9.4).
- **Keine Speicherung des Bildes** über die Importsession hinaus. Das Bild lebt nur im RAM des Modals.

---

## 3. User Flow (4 Stages)

Der Import läuft als modaler Dialog mit vier Stufen. Der Modal-Lifecycle ist:

1. Benutzer ist im Tab **"Dienste eintragen"**, hat Monat und Jahr eingestellt.
2. Benutzer klickt **`📷 Bild importieren`** oben rechts in der Card.
3. Falls noch kein OpenRouter-API-Key in `localStorage`: `prompt()` mit Erklärtext (siehe Abschnitt 6.1). Bei leerer/abgebrochener Eingabe: Modal öffnet **nicht**, Toast `Kein API-Key gespeichert – Import abgebrochen`.
4. Falls Key vorhanden: Modal öffnet auf Stage 1.

### 3.1 Stage 1 — Upload

Was der Benutzer sieht:

- Drag & Drop-Zone mit Hinweistext `Bild hier ablegen oder Datei auswählen`.
- Button **`Datei auswählen`** → öffnet nativen File Picker, akzeptiert `image/png, image/jpeg, image/webp`.
- Auf Mobilgeräten zusätzlich Button **`Mit Kamera aufnehmen`** → `<input type="file" accept="image/*" capture="environment">`.
- Datenschutz-Hinweis (klein, grau): `Das Bild wird zur Erkennung an OpenRouter gesendet.`
- Bei einem ausgewählten Bild: Thumbnail-Vorschau (max. 240 px Kantenlänge), Dateiname, Größe in KB.
- Buttons unten: **`Abbrechen`** (schließt Modal), **`Erkennen`** (deaktiviert solange kein Bild ausgewählt; aktiv sobald Bild da ist → führt zu Stage 2).

Validierung in Stage 1:

- MIME muss mit `image/` beginnen, sonst Toast `Nur Bildformate werden unterstützt`.
- Dateigröße > 20 MB: Toast `Bild zu groß (max. 20 MB)`. (Praxisrelevant, da viele Handyfotos > 5 MB.)

### 3.2 Stage 2 — Processing

Was der Benutzer sieht:

- Großer Spinner, Text `Analysiere Bild...`.
- Untertext (klein): `Das kann 5–15 Sekunden dauern.`
- Optionaler Button **`Abbrechen`** → bricht den `fetch` via `AbortController` ab, schließt Modal.

Was im Hintergrund passiert:

1. Bild-Preprocessing (Abschnitt 12): Resize auf ≤ 2048 px Längste Kante, Re-Encode JPEG q=0.85, Base64-Kodierung.
2. POST an OpenRouter (Abschnitt 7).
3. Response-Parsing (Abschnitt 8) und Validierung.
4. Namensauflösung (Abschnitt 10) gegen `storage.getEmployees()`.
5. Stage-Wechsel zu Stage 3 (Erfolg) oder Toast + Modal-Schließung (Fehler, Abschnitt 13).

### 3.3 Stage 3 — Preview & Confirm

Was der Benutzer sieht:

**Block A — "Unbekannte Namen"** (nur sichtbar, wenn es welche gibt):

Eine Box am oberen Rand mit dem Titel `Unbekannte Namen`. Pro unbekanntem Namen eine Zeile mit:

- Erkannter Name (fett, links).
- Dropdown rechts mit den Optionen:
  - `Neuer Mitarbeiter anlegen` (Default)
  - `Zuordnen zu [<bestehender Mitarbeiter 1>]`
  - `Zuordnen zu [<bestehender Mitarbeiter 2>]`
  - … (eine Option pro existierendem Mitarbeiter, alphabetisch sortiert)
  - `Ignorieren`
- Wenn ein Fuzzy-Match (Levenshtein ≤ 2) existiert, ist die entsprechende `Zuordnen zu …`-Option vorausgewählt **und** ein dezenter Hinweis `möglicher Match: X` daneben angezeigt.

**Block B — Tabelle der Importeinträge**, gruppiert nach Mitarbeiter (nach Anwendung der Dropdown-Auswahl aus Block A). Pro Mitarbeiter eine Sub-Tabelle:

| Datum | Wochentag | Slot | Anteil | Aktion |
|---|---|---|---|---|
| 2025-11-22 | Sa | `sa` | 1.0 | 🗑️ |
| 2025-11-28 | Fr | `fr` | 0.5 | 🗑️ |

- **Slot** wird nach Feature B's `classify(date)`-Regel (`fr`/`sa`/`so`/`weekday`) berechnet. Falls Feature B noch nicht implementiert ist: Fallback auf `getDay()`-basierte Mapping ohne Feiertagsberücksichtigung (siehe Abschnitt 5.4).
- **Aktion** 🗑️ entfernt diese eine Zeile aus dem Import-Set (nur lokal im Modal, nicht persistent).
- Mitarbeiter mit Status `Ignorieren` werden in Block B nicht gerendert.

**Block C — Buttons:**

- **`Abbrechen`** → Modal schließt, nichts wird gespeichert.
- **`Bestätigen & Importieren`** → führt aus:
  1. Für jeden mit `Neuer Mitarbeiter anlegen` markierten Namen: `storage.addEmployee(name)`.
  2. Für jeden verbleibenden Eintrag: `storage.addDuty(employeeName, year, month, date, share)` (Signatur siehe Abschnitt 11).
  3. Stage-Wechsel zu Stage 4.

### 3.4 Stage 4 — Done

Was der Benutzer sieht:

- Toast (3 s, type `success`): `X Dienste für Y Mitarbeiter importiert`.
- Modal schließt sich automatisch.
- `loadDutiesForSelectedEmployee()` und ggf. `loadEmployeeSelects()` werden aufgerufen, sodass die Tab-Anzeige aktualisiert wird.

---

## 4. Architecture & File Layout

### 4.1 Übersicht

| Datei | Änderung |
|---|---|
| `image-import.js` | **NEU** – enthält `class ImageImporter` und eine kleine Levenshtein-Implementierung. |
| `index.html` | Markup-Ergänzungen: Button im Duties-Tab, Settings-Sektion, Modal-Skelett. Script-Tag für `image-import.js` **nach** `app.js`. |
| `app.js` | Verdrahtung: Klick-Handler für `📷 Bild importieren`, Settings-Sektion-Handler. Kein Berechnungs-Code. |
| `storage.js` | **+** `setApiKey`, `getApiKey`, `clearApiKey`, `setApiModel`, `getApiModel`. Neue Storage-Keys siehe Abschnitt 11. |
| `styles.css` | Modal-Layout, Drag-&-Drop-Zone, Stage-Übergänge, Unbekannte-Namen-Box. |
| `test-suite.js` | Neue Test-Kategorien (siehe Abschnitt 15). |

### 4.2 Script-Load-Reihenfolge in `index.html`

```
holidays.js → calculator.js → storage.js → app.js → image-import.js
```

`image-import.js` wird **nach** `app.js` geladen, damit `window.app` (Instanz von `DienstplanApp`) bereits existiert und für `app.showToast(...)`, `app.loadDutiesForSelectedEmployee()` und Zugriff auf `app.holidayProvider` verfügbar ist.

Initialisierung am Ende von `image-import.js`:

```javascript
window.imageImporter = new ImageImporter(window.app);
```

`ImageImporter` hält intern eine Referenz auf die `DienstplanApp`-Instanz (für Storage, Toast, Refresh) und auf den `HolidayProvider` (für die `classify`-Regel der Vorschau).

### 4.3 `image-import.js` – Public API (Skizze)

```javascript
class ImageImporter {
  constructor(app) {
    this.app = app;
    this.storage = app.storage;
    this.holidayProvider = app.holidayProvider;
    this.session = null;            // siehe Abschnitt 14.2
    this.abortController = null;    // für Cancel in Stage 2
  }

  open()                  { /* Stage 1 anzeigen, Key-Prompt-Logik */ }
  close()                 { /* Modal zumachen, session leeren */ }

  // Stage-Übergänge
  showStage(stageId)      { /* 1 | 2 | 3 | 4 */ }

  // Stage 1
  onFileSelected(file)    { /* Validierung, Thumbnail, session.file setzen */ }

  // Stage 2
  async runRecognition()  { /* preprocess → call → parse → resolveNames → Stage 3 */ }

  // Stage 3
  renderPreview()         { /* Block A, B aufbauen */ }
  onUnknownChoiceChange(name, choice) { /* Block B neu rendern */ }
  onRemoveEntry(idx)      { /* aus session.entries entfernen */ }
  async commitImport()    { /* addEmployee + addDuty, dann Stage 4 */ }

  // Helpers
  preprocessImage(file)   { /* canvas resize + JPEG re-encode → base64 */ }
  callOpenRouter(b64)     { /* fetch → JSON */ }
  parseResponse(text)     { /* strip fences, JSON.parse, validate schema */ }
  resolveNames(entries)   { /* exact, normalized, levenshtein → session.unknowns */ }
  normalizeName(name)     { /* lowercase, trim, collapse whitespace */ }
  levenshtein(a, b)       { /* siehe Abschnitt 10.3 */ }
  classify(date)          { /* fr|sa|so|weekday, identisch zu Feature B */ }
}
```

---

## 5. UI Specification

### 5.1 Button im Tab "Dienste eintragen"

In `index.html`, innerhalb des `card`-Containers des Tabs `tab-duties`, oben rechts:

```html
<div class="card-header">
  <h2>Dienste eintragen</h2>
  <button id="open-image-import-btn" class="btn btn-secondary">
    📷 Bild importieren
  </button>
</div>
```

Der Header bekommt Flex-Layout (`justify-content: space-between`). Button ist immer sichtbar (auch ohne gespeicherten Key – Key-Prompt erscheint beim Klick).

### 5.2 Modal-Skelett

Ein einziger Modal-Container im HTML, mit vier Stage-Divs, von denen jeweils nur einer `.active` ist:

```html
<div id="image-import-modal" class="modal" hidden>
  <div class="modal-backdrop"></div>
  <div class="modal-content">
    <button class="modal-close" aria-label="Schließen">×</button>

    <div class="modal-stage" data-stage="1">
      <!-- Drag&Drop, File Picker, Camera Button, Thumbnail, Erkennen -->
    </div>
    <div class="modal-stage" data-stage="2" hidden>
      <!-- Spinner + Cancel -->
    </div>
    <div class="modal-stage" data-stage="3" hidden>
      <!-- Unknown Names Box + Preview Table + Confirm/Abbrechen -->
    </div>
    <div class="modal-stage" data-stage="4" hidden>
      <!-- Done (kurz sichtbar, dann auto-close) -->
    </div>
  </div>
</div>
```

### 5.3 Settings-Sektion "Bild-Import (KI)"

Neue `<div class="settings-section">` im Tab `tab-settings`, **vor** der Sektion `Alle Daten löschen`:

```html
<div class="settings-section">
  <h3>Bild-Import (KI)</h3>
  <p id="api-key-status" class="text-muted">Kein Key hinterlegt</p>
  <button id="set-api-key-btn" class="btn btn-secondary">Key ändern</button>
  <button id="clear-api-key-btn" class="btn btn-danger">Key löschen</button>

  <div class="form-group" style="margin-top: 12px;">
    <label for="api-model-select">Modell:</label>
    <select id="api-model-select">
      <option value="anthropic/claude-sonnet-4.6" selected>Claude Sonnet 4.6</option>
      <option value="google/gemini-2.5-pro">Gemini 2.5 Pro</option>
      <option value="openai/gpt-4.1">GPT-4.1</option>
    </select>
  </div>

  <p class="text-muted" style="margin-top: 10px;">
    💡 <strong>Hinweis:</strong> Der API-Key wird ausschließlich lokal in Ihrem Browser gespeichert
    und nur an OpenRouter (openrouter.ai) gesendet.
  </p>
</div>
```

Verhalten:

- Status-Zeile zeigt beim Tab-Aufruf entweder `API-Key gespeichert ✓` (grün) oder `Kein Key hinterlegt` (grau).
- **`Key ändern`** öffnet `prompt('OpenRouter API-Key eingeben:', '')`. Leerer/abgebrochener Wert → keine Änderung. Sonst: `storage.setApiKey(value)` + Status-Zeile aktualisieren.
- **`Key löschen`** öffnet `confirm('API-Key wirklich löschen?')`. Bei OK: `storage.clearApiKey()` + Status-Zeile aktualisieren.
- **Modell-Dropdown:** initial-Wert ist `storage.getApiModel()` (Default `anthropic/claude-sonnet-4.6`). On `change`: `storage.setApiModel(value)`.

---

## 6. API Key Flow

### 6.1 Erstgebrauch

Beim ersten Klick auf **`📷 Bild importieren`**:

1. `storage.getApiKey()` liefert `null`/leer.
2. `prompt(text)` mit folgendem Text:

   ```
   Für die Bilderkennung wird ein OpenRouter-API-Key benötigt.
   Der Key wird ausschließlich lokal in Ihrem Browser gespeichert
   und nur an openrouter.ai gesendet.

   Key auf https://openrouter.ai/keys anlegen und hier eintragen:
   ```

3. Leer oder Cancel → kein Modal, Toast `Kein API-Key gespeichert – Import abgebrochen` (type `info`).
4. Bei nicht-leerem Wert → `storage.setApiKey(value.trim())`, Modal öffnet.

### 6.2 Folgenutzungen

Kein Prompt mehr. Direkt Modal in Stage 1.

### 6.3 Übertragung

- Der Key wird **ausschließlich** im `Authorization`-Header an `https://openrouter.ai/api/v1/chat/completions` gesendet.
- Kein Logging, kein Anhängen an Toasts, kein Schreiben in das Bild-Preprocessing-Modul außer für den Request.
- Bei Fehlerlogs in der Konsole wird der Key **nicht** mitausgegeben.

---

## 7. API Integration (OpenRouter)

### 7.1 Endpoint & Headers

```
POST https://openrouter.ai/api/v1/chat/completions

Authorization: Bearer <key>
Content-Type: application/json
HTTP-Referer: <window.location.origin>     // optional, von OpenRouter empfohlen
X-Title: Dienstplan-Pro                    // optional, von OpenRouter empfohlen
```

### 7.2 Request-Body

```json
{
  "model": "<storage.getApiModel()>",
  "temperature": 0,
  "response_format": { "type": "json_object" },
  "messages": [
    {
      "role": "system",
      "content": "<system prompt – siehe 7.3>"
    },
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "Extrahiere alle Assistenzarzt-Dienste aus dieser Dienstplan-Tabelle."
        },
        {
          "type": "image_url",
          "image_url": {
            "url": "data:image/jpeg;base64,<base64-payload>"
          }
        }
      ]
    }
  ]
}
```

`temperature: 0` zur Maximierung der Determinismus. `response_format: json_object` zwingt das Modell zur JSON-Ausgabe (wird von Claude- und GPT-Modellen respektiert; Gemini ignoriert es teilweise – daher der zusätzliche Strip-Fences-Schritt in 8.1).

### 7.3 System Prompt (vollständig)

```
Du extrahierst Dienstpläne aus Tabellenbildern für eine deutsche Klinik.

Regeln:
- Die Tabelle listet pro Datum die diensthabenden Ärzte.
- Es gibt Assistenzärzte und Oberärzte. Extrahiere NUR Assistenzärzte. Oberärzte werden ignoriert.
- Wenn du nicht sicher bist, ob ein Name zu einem Assistenzarzt oder Oberarzt gehört, vermerke dies in `notes`.
- Wenn in einer Zelle NUR EIN Name steht: share = 1.0 für diesen Arzt.
- Wenn in einer Zelle ZWEI Namen stehen: share = 0.5 für jeden der beiden.
- Datum stets im ISO-Format YYYY-MM-DD.
- Wenn das Bild einen Monatstitel zeigt (z.B. „November 2025"), gib `month` (1–12) und `year` (vierstellig) in der Antwort an. Sonst null.
- Wenn ein Name unklar zu lesen ist, übernimm deinen besten Ratevorschlag und vermerke es in `notes`.

Antworte STRIKT in diesem JSON-Schema und sonst nichts:
{
  "month": number | null,
  "year": number | null,
  "entries": [
    { "name": "string", "date": "YYYY-MM-DD", "share": 1.0 | 0.5 }
  ],
  "notes": ["string", ...]
}
```

### 7.4 Timeouts

- Kein expliziter Client-Timeout über `fetch` direkt. Stattdessen `AbortController`, der vom Cancel-Button in Stage 2 ausgelöst wird.
- Praktischer Bereich für die Response: 5–30 Sekunden. Bei > 60 s zeigt die UI weiterhin den Spinner; der Benutzer kann via Cancel abbrechen.

---

## 8. Response Parsing & Validation

### 8.1 Parsing

Das `response_format`-Flag wird nicht von allen Modellen zuverlässig befolgt. Daher robust:

1. `text = response.choices[0].message.content` extrahieren.
2. Markdown-Fences strippen (regex `^```(?:json)?\s*` am Anfang und `\s*```$` am Ende).
3. Falls vor/nach dem JSON noch Text steht: ersten `{` und letzten `}` finden, dazwischen slicen.
4. `JSON.parse(stripped)` im try/catch.
5. Bei `SyntaxError`: Toast `Erkennung fehlgeschlagen — anderes Modell probieren oder Bild prüfen` (type `error`), Modal auf Stage 1 zurück.

### 8.2 Schema-Validierung

Nach erfolgreichem `JSON.parse(parsed)`:

| Feld | Erwartung | Fehlerbehandlung |
|---|---|---|
| `parsed.entries` | Array, nicht-null | Fehler → Toast `Erkennung fehlgeschlagen – Antwort hat kein gültiges Format` |
| `parsed.entries.length` | > 0 | Wenn 0: Toast `Keine Dienste erkannt` (type `info`), Modal auf Stage 1 |
| `entries[i].name` | String, nicht leer nach `trim()` | Eintrag wird verworfen, Warnung im Log |
| `entries[i].date` | String, parst zu valider `Date` via `new Date(date + 'T12:00:00')` | Eintrag wird verworfen, Warnung im Log |
| `entries[i].share` | Number, ∈ `{0.5, 1.0}` | Eintrag wird verworfen, Warnung im Log |
| `parsed.month` | `null` oder Integer 1..12 | bei Inkonsistenz → Warnung (siehe 8.3) |
| `parsed.year` | `null` oder Integer ≥ 2000 | bei Inkonsistenz → Warnung (siehe 8.3) |
| `parsed.notes` | Array von Strings, optional | bei `notes.length > 0` Hinweis in Stage 3 anzeigen |

### 8.3 Konsistenz von `month`/`year`

- Wenn `parsed.month` und `parsed.year` gesetzt sind:
  - Vergleich mit dem aktuell im Tab gewählten Monat (`app.currentMonth`, `app.currentYear`).
  - Bei Abweichung: Hinweis in Stage 3 oben: `Erkannter Monat: <Mon> <YYYY>, aktuell ausgewählt: <Mon> <YYYY>. Import läuft auf den ausgewählten Monat.` (kein Blocker.)
  - Einträge, deren Datum nicht in den **ausgewählten** Monat fällt, werden in Stage 3 mit visuellem Marker `(außerhalb Monat)` angezeigt, aber **nicht automatisch entfernt** – der Benutzer kann sie via 🗑️ entfernen.
- Wenn `month`/`year` null sind: kein Hinweis, Ziel-Monat = ausgewählter Monat im Tab.

### 8.4 Deduplizierung

Vor dem Übergang zu Stage 3:

- Innerhalb der `entries`: doppelte `(name, date)`-Paare werden auf das erste Vorkommen reduziert. Bei Konflikt der `share`-Werte (eines 1.0, eines 0.5) wird der höhere genommen und eine Notiz in Stage 3 generiert: `Doppelter Eintrag für <name> am <date> – höherer Anteil verwendet`.

---

## 9. Slot-Klassifikation in der Vorschau

### 9.1 Zweck

In der Preview-Tabelle (Stage 3, Block B) wird pro Zeile der Slot (`fr`/`sa`/`so`/`weekday`) angezeigt, damit der Benutzer auf einen Blick sieht, wie sich der Import in die Bonus-Logik einsortiert.

### 9.2 Algorithmus

Identisch zur `classify(date)`-Regel aus Feature B (siehe `2026-05-11-bonus-varianten-design.md`, Abschnitt 3.1):

```
classify(date):
  wd = date.getDay()
  if wd === 5: return "fr"
  if wd === 6: return "sa"
  if wd === 0: return "so"
  isFeiertag       = holidayProvider.isHoliday(date)
  isTagVorFeiertag = holidayProvider.isDayBeforeHoliday(date)
  if isFeiertag && isTagVorFeiertag: return "sa"
  if isTagVorFeiertag:               return "fr"
  if isFeiertag:                     return "so"
  return "weekday"
```

### 9.3 Fallback wenn Feature B nicht vorhanden

Falls Feature B noch nicht implementiert ist und `window.classifyDuties` o. ä. nicht existiert: `ImageImporter.classify` kapselt die Logik in einer **eigenen Kopie**. Da `HolidayProvider` ohnehin vorhanden ist (Pflicht für die App), funktioniert der Algorithmus identisch. Es gibt also keine harte Abhängigkeit von Feature B; die Spezifikationen sind unabhängig implementierbar.

### 9.4 Anzeige

Slot-Wert wird als kleines Badge angezeigt: `fr` (orange), `sa` (rot), `so` (rot), `weekday` (grau). Diese Stilangaben sind in `styles.css` konsistent mit Feature B zu halten, falls beide Features gemeinsam ausgeliefert werden.

---

## 10. Name Matching Algorithm

### 10.1 Normalisierung

```javascript
normalizeName(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');     // collapse multiple spaces
}
```

Beispiele:

| Input | Output |
|---|---|
| `"Max Mustermann"` | `"max mustermann"` |
| `"  Max   Mustermann  "` | `"max mustermann"` |
| `"max mustermann"` | `"max mustermann"` |

Umlaute werden **nicht** normalisiert: `"Müller"` ≠ `"Mueller"`. Begründung: die App geht heute davon aus, dass Mitarbeiternamen exakt wie vom Benutzer angelegt verwendet werden. Eine Umlaut-Normalisierung würde unerwartete Cross-Matches erzeugen.

### 10.2 Matching-Reihenfolge

Pro Kandidatenname aus `entries[i].name`:

1. **Exakter normalisierter Match:** Wenn `normalizeName(candidate)` exakt gleich `normalizeName(employee)` für ein `employee ∈ storage.getEmployees()` → automatisch zugeordnet, kein UI-Prompt.
2. **Fuzzy-Match (Levenshtein ≤ 2):** Wenn nicht-exakter Match, aber `levenshtein(normalize(candidate), normalize(employee)) ≤ 2` für mindestens einen Mitarbeiter → der **nächstgelegene** Kandidat wird als "möglicher Match" markiert. In Block A (Stage 3) erscheint der Name mit Default-Auswahl `Zuordnen zu <nearest>` und Hinweis `möglicher Match: <nearest>`.
3. **Unbekannt:** Sonst → erscheint in Block A mit Default-Auswahl `Neuer Mitarbeiter anlegen`.

Bei mehreren Fuzzy-Treffern mit identischer Distanz: der alphabetisch erste gewinnt für den Default. Dem Benutzer stehen alle anderen weiterhin im Dropdown zur Auswahl.

### 10.3 Levenshtein (inline)

`image-import.js` enthält eine kleine Implementation (DP-Matrix, O(m·n)), keine externe Abhängigkeit:

```javascript
levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}
```

Eingaben sind immer schon `normalize`d. Für übliche Namenslängen (5–25 Zeichen) ist die Performance unkritisch.

---

## 11. Conflict Handling with Existing Duties

### 11.1 Bestehende Storage-Semantik

`DataStorage.addDuty(employeeName, year, month, date, share)` ersetzt einen existierenden Dienst am selben Datum (vgl. `storage.js` Zeilen 217–219):

```javascript
if (existingIndex >= 0) {
  duties[existingIndex].share = share;     // Replace
} else {
  duties.push({ date, share });            // Append
}
```

Diese Replace-Semantik wird vom Import **übernommen**, **nicht umgangen**. Konsequenz:

- Wenn im Bild ein Dienst für Max Mustermann am 22.11.2025 mit `share=1.0` erkannt wird und Max am 22.11.2025 bereits einen Dienst mit `share=0.5` hat, wird er nach Import auf `share=1.0` stehen.
- Es gibt **kein** UI-Diff oder Bestätigungs-Prompt für Replaces. Begründung: Konsistenz mit dem heutigen manuellen Eingabepfad, der ebenfalls ohne Warnung ersetzt.

### 11.2 Iteration beim Commit

In `commitImport()`:

```
for each name marked "Neuer Mitarbeiter anlegen":
  storage.addEmployee(name)
for each entry in session.entries (after user filtering):
  storage.addDuty(
    resolvedEmployeeName,
    targetYear,     // = app.currentYear
    targetMonth,    // = app.currentMonth
    entryDate,      // Date-Objekt aus 'YYYY-MM-DD' + 'T12:00:00'
    entry.share
  )
```

Anschließend:

- `app.loadDutiesForSelectedEmployee()` falls der aktuell im Dropdown gewählte Mitarbeiter durch den Import betroffen ist.
- `app.loadEmployeeSelects()` falls neue Mitarbeiter angelegt wurden.
- Stage 4 anzeigen, Toast, Modal nach ~1.5 s schließen.

### 11.3 Zielmonat ist immer der im Tab gewählte Monat

Auch wenn `parsed.month/year` einen anderen Monat indiziert: der Import läuft technisch immer in `app.currentMonth/Year`. Ein Datum, das nicht in diesen Monat fällt, würde von `DataStorage.addDuty` zwar gespeichert, aber unter dem **Tab-Monatsschlüssel** abgelegt – das wäre datentechnisch inkonsistent. Konsequenz:

- Vor dem Commit filtert `commitImport()` Einträge, deren Monat/Jahr nicht zum Ziel passen, **heraus** und vermerkt das per Toast: `Z Einträge außerhalb des gewählten Monats übersprungen`. Der Benutzer wurde in Stage 3 darauf hingewiesen (Marker `(außerhalb Monat)`).

---

## 12. Image Preprocessing

### 12.1 Ziel

- Reduktion des Payloads auf < ~1.5 MB Base64, um schnelle Übertragung und ausreichende Erkennungsqualität zu balancieren.
- Vermeidung von „Image too large"-Fehlern einiger Modelle.

### 12.2 Algorithmus

```
preprocessImage(file):
  1. img = await loadImage(file)          // via URL.createObjectURL + new Image()
  2. longest = max(img.width, img.height)
  3. if longest > 2048:
       scale = 2048 / longest
       newW = round(img.width * scale)
       newH = round(img.height * scale)
     else:
       newW = img.width
       newH = img.height
  4. canvas = new OffscreenCanvas(newW, newH)  // Fallback: HTMLCanvasElement
  5. ctx = canvas.getContext('2d')
  6. ctx.drawImage(img, 0, 0, newW, newH)
  7. blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 })
  8. base64 = await blobToBase64(blob)     // FileReader.readAsDataURL
  9. URL.revokeObjectURL(...)              // cleanup
 10. return base64   // 'data:image/jpeg;base64,...'
```

### 12.3 Notizen

- `OffscreenCanvas` ist in modernen Browsern unterstützt. Fallback: normales `<canvas>`-Element mit `toBlob`.
- `quality: 0.85` ist empirisch der Sweet-Spot für Text-Erkennung in JPEG.
- Das Originalformat wird verworfen (PNG/WebP/JPEG → einheitlich JPEG). Das ist akzeptabel, da Vision-LLMs JPEG genauso gut lesen wie PNG.
- Maximaler Payload nach Resize: empirisch < 1.5 MB Base64 für eine A4-Tabelle.

---

## 13. Error Handling

### 13.1 HTTP-Fehler von OpenRouter

| Status | Toast (type `error`) | Aktion |
|---|---|---|
| 401 | `API-Key ungültig` | Modal auf Stage 1; Settings-Sektion zeigt weiterhin `API-Key gespeichert ✓` (Benutzer muss aktiv korrigieren). |
| 402 | `Limit erreicht oder Guthaben aufgebraucht` | Modal auf Stage 1. |
| 429 | `Limit erreicht oder Guthaben aufgebraucht` | Modal auf Stage 1. |
| 4xx (sonstige) | `Anfrage abgelehnt (HTTP <status>)` | Modal auf Stage 1. |
| 5xx | `Server-Fehler, später nochmal (HTTP <status>)` | Modal auf Stage 1. |

### 13.2 Netzwerkfehler

- `TypeError` (z. B. Offline) → Toast `Keine Verbindung zu OpenRouter – Internet prüfen` (type `error`), Modal auf Stage 1.
- `AbortError` (Benutzer hat Cancel gedrückt) → kein Toast, Modal schließt.

### 13.3 Parsing-/Validierungs-Fehler

Siehe Abschnitt 8.

### 13.4 Storage-Fehler beim Commit

Falls `storage.addDuty(...)` für einen Eintrag wirft (z. B. `QuotaExceededError`):

- Iteration wird **abgebrochen**.
- Toast `Speicherfehler – Import unvollständig (N von M erfolgreich)`.
- Modal schließt trotzdem.

### 13.5 Empty Entries

Wenn `entries.length === 0` nach Validierung: Toast `Keine Dienste erkannt` (type `info`), Modal auf Stage 1.

---

## 14. Data Model

### 14.1 Persistenz (localStorage)

| Key | Verwendung | Status |
|---|---|---|
| `dienstplan_employees` | Mitarbeiterliste | **unverändert** (wird ggf. via `addEmployee` ergänzt) |
| `dienstplan_duties` | Dienste pro MA pro Monat | **unverändert** (wird via `addDuty` ergänzt/ersetzt) |
| `dienstplan_openrouter_key` | OpenRouter API-Key (Plaintext) | **NEU** |
| `dienstplan_openrouter_model` | Modell-ID (Default `anthropic/claude-sonnet-4.6`) | **NEU** |

`storage.js`-Erweiterungen:

```javascript
class DataStorage {
  constructor() {
    this.STORAGE_KEY_EMPLOYEES        = 'dienstplan_employees';
    this.STORAGE_KEY_DUTIES           = 'dienstplan_duties';
    this.STORAGE_KEY_OPENROUTER_KEY   = 'dienstplan_openrouter_key';   // NEU
    this.STORAGE_KEY_OPENROUTER_MODEL = 'dienstplan_openrouter_model'; // NEU
    this.DEFAULT_MODEL = 'anthropic/claude-sonnet-4.6';
  }

  // ---- API-Key ----
  getApiKey() {
    try { return localStorage.getItem(this.STORAGE_KEY_OPENROUTER_KEY) || null; }
    catch (e) { console.error('Fehler beim Laden des API-Keys:', e); return null; }
  }
  setApiKey(key) {
    try { localStorage.setItem(this.STORAGE_KEY_OPENROUTER_KEY, String(key)); }
    catch (e) { console.error('Fehler beim Speichern des API-Keys:', e); throw e; }
  }
  clearApiKey() {
    try { localStorage.removeItem(this.STORAGE_KEY_OPENROUTER_KEY); }
    catch (e) { console.error('Fehler beim Löschen des API-Keys:', e); }
  }

  // ---- Model ----
  getApiModel() {
    try { return localStorage.getItem(this.STORAGE_KEY_OPENROUTER_MODEL) || this.DEFAULT_MODEL; }
    catch (e) { console.error('Fehler beim Laden des Modells:', e); return this.DEFAULT_MODEL; }
  }
  setApiModel(modelId) {
    try { localStorage.setItem(this.STORAGE_KEY_OPENROUTER_MODEL, String(modelId)); }
    catch (e) { console.error('Fehler beim Speichern des Modells:', e); throw e; }
  }
}
```

`clearAll()` wird **bewusst nicht** erweitert, um den API-Key zu löschen – ein "Alle Daten löschen" soll Mitarbeiter und Dienste leeren, aber den API-Key (Benutzer-Setup) erhalten. Falls Feature B's `dienstplan_vacation` aufgenommen wird, betrifft diese Entscheidung nur Daten, nicht Konfiguration. (Falls hier später Konsens auf "auch Key löschen" entsteht, ist das ein Folge-Spec.)

`exportData()` und `importData()` werden **nicht** um Key/Model erweitert – diese sind benutzer-/gerätespezifisch und gehören nicht in einen Backup-Datenexport.

### 14.2 In-Memory während Import (Session-Objekt)

`ImageImporter.session` ist ein flaches Objekt, das nur zwischen Modal-Open und Modal-Close lebt:

```javascript
this.session = {
  file: File,                    // Original-Bild
  thumbnailUrl: string,          // ObjectURL für Stage 1
  base64: string | null,         // nach Preprocessing
  raw: object | null,            // geparste JSON-Antwort
  entries: [                     // validierte, deduplizierte Einträge
    {
      name: string,              // wie aus dem Bild
      date: Date,                // Date-Objekt, T12:00:00
      share: number              // 0.5 oder 1.0
    }
  ],
  unknowns: [                    // Namen, die in Block A erscheinen
    {
      candidate: string,         // wie aus dem Bild
      suggested: string | null,  // Fuzzy-Match, falls vorhanden
      choice: 'new' | 'assign:<employeeName>' | 'ignore'
    }
  ],
  resolvedNames: Map<string, string | null>,   // candidate → finalName | null (ignore)
  targetYear: number,            // = app.currentYear bei Modal-Open
  targetMonth: number,           // = app.currentMonth bei Modal-Open
  detectedMonth: number | null,  // parsed.month
  detectedYear: number | null,   // parsed.year
  notes: string[]                // parsed.notes ∪ interne Warnungen
};
```

Bei Modal-Close: `URL.revokeObjectURL(thumbnailUrl)`, `this.session = null`. Damit ist das Bild garantiert nicht mehr referenziert.

---

## 15. Test Plan (Kategorien, keine Implementierung)

Neue Tests in `test-suite.js`. Pro Kategorie sind die typischen Fälle aufgeführt; eine erschöpfende Test-Aufzählung ist nicht Ziel dieses Specs.

### 15.1 API Key Persistenz

- `setApiKey(...)` → `getApiKey()` Round-trip liefert denselben Wert.
- `clearApiKey()` → `getApiKey()` liefert `null`.
- Defekter Storage (Mock `localStorage.getItem` wirft) → `getApiKey()` liefert `null`, kein Throw nach außen.
- `getApiModel()` ohne gespeicherten Wert liefert Default `anthropic/claude-sonnet-4.6`.
- `setApiModel('google/gemini-2.5-pro')` → `getApiModel()` liefert den gesetzten Wert.

### 15.2 Image Preprocessing

- Bild 4000×3000 → nach Resize: längste Kante = 2048 px, Seitenverhältnis bleibt.
- Bild 800×600 → unverändert (kein Upscale).
- Output-String beginnt mit `data:image/jpeg;base64,`.
- Output-Länge ist > 0 und plausibel (z. B. > 1 KB für non-trivialen Input).

### 15.3 Response Parsing

- **Valid JSON** ohne Wrapper → erfolgreich geparst.
- **JSON in Markdown-Fence** (` ```json … ``` `) → Fence wird gestrippt, geparst.
- **JSON mit Vortext** (`"Hier das Ergebnis:\n{...}"`) → Vortext wird gestrippt, geparst.
- **Malformed JSON** → `SyntaxError` gefangen, Toast.
- **Schema-Fehler:** `entries` fehlt → Toast `Erkennung fehlgeschlagen`.
- **Schema-Fehler:** `share = 0.75` → Eintrag verworfen, Warnung im Log.
- **Schema-Fehler:** `date = "31.11.2025"` → Eintrag verworfen.
- **`entries: []`** → Toast `Keine Dienste erkannt`.

### 15.4 Name Matching

- Exakter Match: candidate `"Max Mustermann"`, employees `["Max Mustermann"]` → automatisch zugeordnet, nicht in `unknowns`.
- Normalisierter Match: candidate `"  max   mustermann "`, employees `["Max Mustermann"]` → automatisch zugeordnet.
- Fuzzy: candidate `"Max Mustermannn"` (Distance 1), employees `["Max Mustermann"]` → in `unknowns` mit Default-Choice `assign:Max Mustermann`.
- Distance > 2: candidate `"Egon Olsen"`, employees `["Max Mustermann"]` → in `unknowns` mit Default-Choice `new`.
- Mehrere Fuzzy-Treffer gleicher Distanz: alphabetisch erster gewinnt für Default.
- Leere Employee-Liste: alle Kandidaten landen in `unknowns` mit `new`.

### 15.5 Conflict Handling

Mit gemocktem Storage:

- Import-Eintrag (Max, 2025-11-22, 1.0); Storage hat bereits (Max, 2025-11-22, 0.5) → nach Commit: (Max, 2025-11-22, 1.0). Kein Duplikat.
- Import-Eintrag (Anna, 2025-11-23, 0.5); Storage hat keinen Eintrag → nach Commit: (Anna, 2025-11-23, 0.5).
- Import erzeugt neuen Mitarbeiter `addEmployee` + erstes `addDuty` → beide werden persistiert.

### 15.6 Edge Cases

- `month`/`year`-Mismatch: parsed.month = 12, aber tab.month = 11 → Hinweis in Stage 3 sichtbar, Einträge mit Datum im Dezember bekommen `(außerhalb Monat)`-Marker und werden beim Commit übersprungen.
- Empty `entries`: Toast, kein Stage 3.
- Duplikat (Max, 2025-11-22) zweimal in `entries`: nach Dedup nur einmal, höherer Share gewinnt, Note erscheint in Stage 3.
- Modal Cancel in Stage 2: `AbortController.abort()` wird aufgerufen, kein Toast, Modal schließt.

### 15.7 Storage-Erweiterung

- `exportData()` / `importData()` ignorieren API-Key/Modell (Round-trip-Test: vor/nach Export+Import sind Key/Modell unverändert, weil sie nicht im Export-JSON sind).
- `clearAll()` lässt Key/Modell unangetastet.

---

## 16. Future Work (außerhalb v1)

- **Multi-Image-Batch:** Mehrere Bilder gleichzeitig hochladen, Ergebnisse mergen. Erfordert UI-Änderung in Stage 1 (Mehrfachauswahl) und Stage 3 (Provenance-Marker pro Eintrag).
- **PDF-Import:** PDFs via `pdf.js` clientseitig in Bilder pro Seite konvertieren, danach pro Seite den bestehenden Flow durchlaufen.
- **Server-Side Proxy:** Hetzner-Backend, das den API-Key zentral hält und Requests gegen Rate-Limits puffert. Würde den Key aus dem Browser entfernen. Eigenständiges Architektur-Spec.
- **Automatischer Monatsrollover:** Wenn `entries` zwei Monate überspannen, automatisch in beide Monats-Buckets schreiben statt zu verwerfen.
- **Lokale Bild-Vorverarbeitung:** Kantenbasierte Tabellen-Erkennung im Browser (OpenCV.js) zur Reduktion der API-Tokens. Aktuell nicht nötig.
- **Modell-Auto-Retry:** Bei Parse-Fehler automatisch ein zweites Modell probieren. Aktuell muss der Benutzer manuell wechseln.
- **Caching der Erkennung:** Hash des Bildes → letzte Erkennung. Würde Wiederholungs-Erkennungen sparen.

---

## 17. Open Questions

Keine blockierenden Punkte. Minor, zur Klärung in der Implementierungsphase:

- Soll der Datenschutz-Hinweis in Stage 1 prominenter sein (eigene checkbox `Ich verstehe, dass das Bild an OpenRouter gesendet wird`)? Vorschlag: nein, der Text genügt für v1.
- Soll der Tab-Wechsel während Stage 2 das Modal schließen? Vorschlag: nein, Modal blockiert den Hintergrund visuell, aber technisch bleibt es offen, bis Erkennung fertig ist oder Cancel.
- PWA-Cache-Version: bei Release dieses Features `dienstplan-pro-v1` inkrementieren, damit `image-import.js` und HTML-Änderungen ausgeliefert werden.
