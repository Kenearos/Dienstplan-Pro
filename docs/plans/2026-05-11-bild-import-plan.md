# Feature A: Bild → Dienste Import (OpenRouter Vision) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user upload a photo/screenshot of a shift roster table; an OpenRouter Vision-LLM extracts duty entries; the user reviews and confirms in a preview dialog; entries are persisted via `DataStorage.addDuty`. 100% browser-side, no backend.

**Architecture:** New `image-import.js` with class `ImageImporter` owns the entire workflow: API key prompt, image preprocessing (canvas resize → JPEG base64), OpenRouter `chat/completions` call, JSON schema validation, name matching against existing employees (incl. Levenshtein fuzzy), preview modal, commit to storage. `storage.js` is extended with API-key/model accessors. UI additions in the "Dienste eintragen" tab and a settings section.

**Tech Stack:** Vanilla ES6+ classes, browser `fetch()`, Canvas2D, localStorage. Inline Levenshtein implementation (no external deps). No build step. DOM is constructed via `document.createElement` + `textContent` for any user-controlled data (XSS-safe).

---

## File Structure

| File | Status | Responsibility post-change |
|---|---|---|
| `image-import.js` | **CREATE** | New module. Exports `class ImageImporter` to `window.ImageImporter` and instantiates `window.imageImporter`. Owns: API-key prompt, image preprocessing, OpenRouter call, response parsing & schema validation, name matching (incl. inline `levenshtein`), `classify(date)` slot helper, modal lifecycle and rendering across Stages 1 to 4, commit-to-storage. |
| `index.html` | **MODIFY** | Add `<button id="open-image-import-btn">` inside the `tab-duties` card header, add `<div id="image-import-modal">` skeleton with four stage divs, add `<div class="settings-section">` for "Bild-Import (KI)" in `tab-settings` before the "Alle Daten löschen" section, add `<script src="image-import.js"></script>` after `<script src="app.js"></script>`. |
| `app.js` | **MODIFY** | Wire `open-image-import-btn` click to `window.imageImporter.openImportDialog()`. Wire settings buttons `set-api-key-btn`, `clear-api-key-btn`, `api-model-select` to `DataStorage` accessors. Update settings status line. No business logic. |
| `storage.js` | **MODIFY** | Extend `DataStorage` with `STORAGE_KEY_OPENROUTER_KEY`, `STORAGE_KEY_OPENROUTER_MODEL`, `DEFAULT_MODEL`, and methods `getApiKey`, `setApiKey`, `clearApiKey`, `getApiModel`, `setApiModel`. `clearAll()`, `exportData()`, `importData()` remain unchanged (device-local config). |
| `styles.css` | **MODIFY** | Add `.modal`, `.modal-backdrop`, `.modal-content`, `.modal-close`, `.modal-stage`, `.drag-drop-zone`, `.thumbnail-preview`, `.unknown-names-box`, `.unknown-name-row`, `.preview-table`, `.slot-badge` (fr / sa / so / weekday), `.privacy-notice`, `.spinner`, `.card-header` (flex). |
| `test-suite.js` | **MODIFY** | Add new tests across categories: API Key Persistenz, Image Preprocessing, Response Parsing, Name Matching, Conflict Handling, Levenshtein, Resolve Imports. Extend `categories` object in `runAllTests()` to bucket the new tests. |
| `test.html` | **MODIFY** | Add `<script src="image-import.js"></script>` after `storage.js` (and before `test-suite.js`) so tests can reference `window.ImageImporter` methods. NOTE: `image-import.js` instantiates `new ImageImporter(window.app)` at the bottom; test.html does not load `app.js`, so the instantiation must be guarded by `if (window.app)`. |
| `sw.js` | **MODIFY** | Bump `CACHE_NAME` from `dienstplan-pro-v1` to `dienstplan-pro-v3` (v2 is reserved for Feature B). Add `'./image-import.js'` to the `ASSETS` precache list. |

---

## Sequential Tasks

### Task 1: Skeleton `image-import.js` and load it in `index.html`

**Files:**
- Create: `G:\Claude\Claude_tmp_dienstplan\image-import.js`
- Modify: `G:\Claude\Claude_tmp_dienstplan\index.html`

Steps:

- [ ] **Step 1: Create `image-import.js` with empty class skeleton.**

  Write file `G:\Claude\Claude_tmp_dienstplan\image-import.js` with this content:

  ```javascript
  /**
   * Image Importer
   * Owns the Bild → Dienste import workflow via OpenRouter Vision-LLM.
   * Loaded AFTER app.js so window.app is available.
   */
  class ImageImporter {
      constructor(app) {
          this.app = app || null;
          this.storage = app ? app.storage : null;
          this.holidayProvider = app ? app.holidayProvider : null;
          this.session = null;
          this.abortController = null;
      }
  }

  // Make available globally
  window.ImageImporter = ImageImporter;

  // Auto-instantiate when DOM + app are ready
  if (typeof document !== 'undefined') {
      document.addEventListener('DOMContentLoaded', () => {
          if (window.app) {
              window.imageImporter = new ImageImporter(window.app);
          }
      });
  }
  ```

- [ ] **Step 2: Inject `<script src="image-import.js">` into `index.html` after `app.js`.**

  In `G:\Claude\Claude_tmp_dienstplan\index.html`, replace the block:

  ```html
      <!-- Scripts -->
      <script src="holidays.js"></script>
      <script src="calculator.js"></script>
      <script src="storage.js"></script>
      <script src="app.js"></script>
  ```

  with:

  ```html
      <!-- Scripts -->
      <script src="holidays.js"></script>
      <script src="calculator.js"></script>
      <script src="storage.js"></script>
      <script src="app.js"></script>
      <script src="image-import.js"></script>
  ```

- [ ] **Step 3: Manual verification — page still loads.**

  Run `python3 -m http.server 8000` (or `npx http-server -p 8000`) in `G:\Claude\Claude_tmp_dienstplan\`. Open `http://localhost:8000/`. Open DevTools Console. Expect:
  - No JavaScript errors.
  - `window.imageImporter` evaluates to an `ImageImporter` instance.
  - `window.imageImporter.app` is the `DienstplanApp` instance.
  - `window.imageImporter.storage` is the `DataStorage` instance.

- [ ] **Step 4: Commit.**

  Run:
  ```
  git add image-import.js index.html
  git commit -m "feat: add empty ImageImporter skeleton wired into index.html"
  ```

---

### Task 2: Extend `storage.js` with API-key + model accessors (TDD)

**Files:**
- Modify: `G:\Claude\Claude_tmp_dienstplan\storage.js`
- Test: `G:\Claude\Claude_tmp_dienstplan\test-suite.js`

Steps:

- [ ] **Step 1: Add failing tests for API-key/model accessors.**

  Append to `G:\Claude\Claude_tmp_dienstplan\test-suite.js` BEFORE the `// Display Functions` section:

  ```javascript
  // ============================================================================
  // Storage Tests - API Key / Model (Feature A)
  // ============================================================================

  runner.test('Storage API Key: setApiKey/getApiKey round-trip', (t) => {
      const storage = new DataStorage();
      storage.clearApiKey();
      storage.setApiKey('sk-or-test-12345');
      t.assertEqual(storage.getApiKey(), 'sk-or-test-12345', 'Key sollte gespeichert sein');
      storage.clearApiKey();
  });

  runner.test('Storage API Key: getApiKey ohne gesetzten Wert liefert null', (t) => {
      const storage = new DataStorage();
      storage.clearApiKey();
      t.assertEqual(storage.getApiKey(), null, 'Sollte null sein');
  });

  runner.test('Storage API Key: clearApiKey entfernt den Key', (t) => {
      const storage = new DataStorage();
      storage.setApiKey('sk-or-test');
      storage.clearApiKey();
      t.assertEqual(storage.getApiKey(), null, 'Key sollte gelöscht sein');
  });

  runner.test('Storage API Model: Default ist anthropic/claude-sonnet-4.6', (t) => {
      const storage = new DataStorage();
      localStorage.removeItem('dienstplan_openrouter_model');
      t.assertEqual(storage.getApiModel(), 'anthropic/claude-sonnet-4.6', 'Default-Modell');
  });

  runner.test('Storage API Model: setApiModel/getApiModel round-trip', (t) => {
      const storage = new DataStorage();
      storage.setApiModel('google/gemini-2.5-pro');
      t.assertEqual(storage.getApiModel(), 'google/gemini-2.5-pro', 'Modell sollte gespeichert sein');
      localStorage.removeItem('dienstplan_openrouter_model');
  });

  runner.test('Storage API Key: exportData enthält keinen API-Key', (t) => {
      const storage = new DataStorage();
      storage.setApiKey('sk-or-secret');
      const exported = storage.exportData();
      t.assertFalse(exported.includes('sk-or-secret'), 'Key darf nicht im Export sein');
      storage.clearApiKey();
  });

  runner.test('Storage API Key: clearAll laesst API-Key unberuehrt', (t) => {
      const storage = new DataStorage();
      storage.setApiKey('sk-or-keep');
      storage.clearAll();
      t.assertEqual(storage.getApiKey(), 'sk-or-keep', 'Key sollte clearAll ueberleben');
      storage.clearApiKey();
  });
  ```

  Also add a new bucket to the `categories` object inside `runAllTests()`. In the same file, locate:

  ```javascript
      const categories = {
          'Holiday Provider': [],
          'Calculator - Tag-Klassifizierung': [],
          'Calculator - Bonusberechnung': [],
          'Storage': [],
          'Edge Cases': []
      };
  ```

  Replace with:

  ```javascript
      const categories = {
          'Holiday Provider': [],
          'Calculator - Tag-Klassifizierung': [],
          'Calculator - Bonusberechnung': [],
          'Storage': [],
          'Storage API Key': [],
          'Image Importer': [],
          'Edge Cases': []
      };
  ```

  And in the same function, locate the categorization block:

  ```javascript
      results.forEach(result => {
          if (result.name.includes('HolidayProvider')) {
              categories['Holiday Provider'].push(result);
          } else if (result.name.includes('qualifizierender Tag') || result.name.includes('Feiertag ist')) {
              categories['Calculator - Tag-Klassifizierung'].push(result);
          } else if (result.name.includes('Berechnung:')) {
              categories['Calculator - Bonusberechnung'].push(result);
          } else if (result.name.includes('Storage:')) {
              categories['Storage'].push(result);
          } else if (result.name.includes('Edge Case:')) {
              categories['Edge Cases'].push(result);
          }
      });
  ```

  Replace with:

  ```javascript
      results.forEach(result => {
          if (result.name.includes('HolidayProvider')) {
              categories['Holiday Provider'].push(result);
          } else if (result.name.includes('qualifizierender Tag') || result.name.includes('Feiertag ist')) {
              categories['Calculator - Tag-Klassifizierung'].push(result);
          } else if (result.name.includes('Berechnung:')) {
              categories['Calculator - Bonusberechnung'].push(result);
          } else if (result.name.startsWith('Storage API')) {
              categories['Storage API Key'].push(result);
          } else if (result.name.includes('Storage:')) {
              categories['Storage'].push(result);
          } else if (result.name.startsWith('ImageImporter') || result.name.startsWith('Levenshtein') || result.name.startsWith('Parse') || result.name.startsWith('Match') || result.name.startsWith('Preprocess') || result.name.startsWith('Resolve') || result.name.startsWith('CallVision') || result.name.startsWith('Classify')) {
              categories['Image Importer'].push(result);
          } else if (result.name.includes('Edge Case:')) {
              categories['Edge Cases'].push(result);
          }
      });
  ```

- [ ] **Step 2: Run tests, confirm the new tests are RED.**

  Open `http://localhost:8000/test.html`. Click "Alle Tests ausfuehren". In the rendered output find the new category **Storage API Key (0/7)**. All seven tests should show red. (Reason: methods don't exist yet.)

- [ ] **Step 3: Implement the accessors in `storage.js` to make tests GREEN.**

  In `G:\Claude\Claude_tmp_dienstplan\storage.js`, replace the constructor:

  ```javascript
      constructor() {
          this.STORAGE_KEY_EMPLOYEES = 'dienstplan_employees';
          this.STORAGE_KEY_DUTIES = 'dienstplan_duties';
      }
  ```

  with:

  ```javascript
      constructor() {
          this.STORAGE_KEY_EMPLOYEES = 'dienstplan_employees';
          this.STORAGE_KEY_DUTIES = 'dienstplan_duties';
          this.STORAGE_KEY_OPENROUTER_KEY = 'dienstplan_openrouter_key';
          this.STORAGE_KEY_OPENROUTER_MODEL = 'dienstplan_openrouter_model';
          this.DEFAULT_MODEL = 'anthropic/claude-sonnet-4.6';
      }
  ```

  Then, immediately before the closing `}` of the `DataStorage` class (before `// Make it available globally`), insert:

  ```javascript
      // ============================================================
      // API Key / Model (Feature A: Bild-Import)
      // Device-local config — NOT included in exportData/clearAll.
      // ============================================================

      /**
       * @returns {string|null}
       */
      getApiKey() {
          try {
              return localStorage.getItem(this.STORAGE_KEY_OPENROUTER_KEY) || null;
          } catch (e) {
              console.error('Fehler beim Laden des API-Keys:', e);
              return null;
          }
      }

      /**
       * @param {string} key
       */
      setApiKey(key) {
          try {
              localStorage.setItem(this.STORAGE_KEY_OPENROUTER_KEY, String(key));
          } catch (e) {
              console.error('Fehler beim Speichern des API-Keys:', e);
              throw e;
          }
      }

      clearApiKey() {
          try {
              localStorage.removeItem(this.STORAGE_KEY_OPENROUTER_KEY);
          } catch (e) {
              console.error('Fehler beim Loeschen des API-Keys:', e);
          }
      }

      /**
       * @returns {string}
       */
      getApiModel() {
          try {
              return localStorage.getItem(this.STORAGE_KEY_OPENROUTER_MODEL) || this.DEFAULT_MODEL;
          } catch (e) {
              console.error('Fehler beim Laden des Modells:', e);
              return this.DEFAULT_MODEL;
          }
      }

      /**
       * @param {string} modelId
       */
      setApiModel(modelId) {
          try {
              localStorage.setItem(this.STORAGE_KEY_OPENROUTER_MODEL, String(modelId));
          } catch (e) {
              console.error('Fehler beim Speichern des Modells:', e);
              throw e;
          }
      }
  ```

- [ ] **Step 4: Re-run tests in browser; confirm GREEN.**

  Reload `http://localhost:8000/test.html` and click "Alle Tests ausfuehren". Expect **Storage API Key (7/7)** green. Pre-existing tests must remain green.

- [ ] **Step 5: Commit.**

  ```
  git add storage.js test-suite.js
  git commit -m "feat(storage): add getApiKey/setApiKey/clearApiKey/getApiModel/setApiModel for OpenRouter integration"
  ```

---

### Task 3: Image preprocessing (`compressImage`) (TDD)

**Files:**
- Modify: `G:\Claude\Claude_tmp_dienstplan\image-import.js`
- Modify: `G:\Claude\Claude_tmp_dienstplan\test-suite.js`
- Modify: `G:\Claude\Claude_tmp_dienstplan\test.html`

Steps:

- [ ] **Step 1: Load `image-import.js` into the test harness.**

  In `G:\Claude\Claude_tmp_dienstplan\test.html`, replace:

  ```html
      <script src="holidays.js"></script>
      <script src="calculator.js"></script>
      <script src="storage.js"></script>
      <script src="test-suite.js"></script>
  ```

  with:

  ```html
      <script src="holidays.js"></script>
      <script src="calculator.js"></script>
      <script src="storage.js"></script>
      <script src="image-import.js"></script>
      <script src="test-suite.js"></script>
  ```

- [ ] **Step 2: Add failing tests for `compressImage`.**

  Append to `test-suite.js` (in the section started in Task 2):

  ```javascript
  // ============================================================================
  // ImageImporter Tests - Preprocessing (Feature A)
  // ============================================================================

  /**
   * Helper: build a synthetic image File from a canvas.
   */
  async function makeTestImageFile(width, height, mime = 'image/png') {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#3366cc';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#ffffff';
      ctx.font = '32px sans-serif';
      ctx.fillText('TEST', 20, 50);
      const blob = await new Promise(res => canvas.toBlob(res, mime));
      return new File([blob], 'test.png', { type: mime });
  }

  runner.test('Preprocess: 4000x3000 wird auf laengste Kante 2048 skaliert', async (t) => {
      const importer = new ImageImporter(null);
      const file = await makeTestImageFile(4000, 3000);
      const result = await importer.compressImage(file);
      t.assertEqual(result.width, 2048, 'Breite sollte 2048 sein');
      t.assertEqual(result.height, 1536, 'Hoehe sollte 1536 sein (Seitenverhaeltnis erhalten)');
      t.assertTrue(result.dataUrl.startsWith('data:image/jpeg;base64,'), 'dataUrl-Prefix korrekt');
  });

  runner.test('Preprocess: 800x600 bleibt unveraendert (kein Upscale)', async (t) => {
      const importer = new ImageImporter(null);
      const file = await makeTestImageFile(800, 600);
      const result = await importer.compressImage(file);
      t.assertEqual(result.width, 800, 'Breite unveraendert');
      t.assertEqual(result.height, 600, 'Hoehe unveraendert');
  });

  runner.test('Preprocess: Output ist immer JPEG', async (t) => {
      const importer = new ImageImporter(null);
      const file = await makeTestImageFile(500, 500, 'image/png');
      const result = await importer.compressImage(file);
      t.assertTrue(result.dataUrl.startsWith('data:image/jpeg;base64,'), 'Output ist JPEG');
      t.assertTrue(result.dataUrl.length > 1000, 'Output-Laenge > 1KB');
  });
  ```

- [ ] **Step 3: Run tests in browser — confirm RED.**

  Reload `http://localhost:8000/test.html`, click "Alle Tests ausfuehren". Find **Image Importer** category — the three Preprocess tests should fail because `compressImage` does not exist yet.

- [ ] **Step 4: Implement `compressImage` in `image-import.js`.**

  Open `G:\Claude\Claude_tmp_dienstplan\image-import.js`. Inside the `ImageImporter` class (after the constructor, before the closing `}`), add:

  ```javascript
      /**
       * Resize image so the longest edge is <= 2048 px, re-encode as JPEG q=0.85.
       * @param {File|Blob} file
       * @returns {Promise<{blob: Blob, dataUrl: string, width: number, height: number}>}
       */
      async compressImage(file) {
          const objUrl = URL.createObjectURL(file);
          try {
              const img = await new Promise((resolve, reject) => {
                  const i = new Image();
                  i.onload = () => resolve(i);
                  i.onerror = () => reject(new Error('Bild konnte nicht geladen werden'));
                  i.src = objUrl;
              });

              const longest = Math.max(img.width, img.height);
              let newW = img.width;
              let newH = img.height;
              if (longest > 2048) {
                  const scale = 2048 / longest;
                  newW = Math.round(img.width * scale);
                  newH = Math.round(img.height * scale);
              }

              const canvas = document.createElement('canvas');
              canvas.width = newW;
              canvas.height = newH;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0, newW, newH);

              const blob = await new Promise((resolve, reject) => {
                  canvas.toBlob(
                      (b) => b ? resolve(b) : reject(new Error('toBlob fehlgeschlagen')),
                      'image/jpeg',
                      0.85
                  );
              });

              const dataUrl = await new Promise((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onload = () => resolve(reader.result);
                  reader.onerror = () => reject(new Error('FileReader fehlgeschlagen'));
                  reader.readAsDataURL(blob);
              });

              return { blob, dataUrl, width: newW, height: newH };
          } finally {
              URL.revokeObjectURL(objUrl);
          }
      }
  ```

- [ ] **Step 5: Re-run tests; confirm GREEN.**

  Reload `test.html`, click "Alle Tests ausfuehren". **Image Importer** category should show the three Preprocess tests green.

- [ ] **Step 6: Commit.**

  ```
  git add image-import.js test-suite.js test.html
  git commit -m "feat(image-import): add compressImage with canvas resize + JPEG re-encode"
  ```

---

### Task 4: OpenRouter Vision API call (`callVisionAPI`) (TDD with mocked fetch)

**Files:**
- Modify: `G:\Claude\Claude_tmp_dienstplan\image-import.js`
- Modify: `G:\Claude\Claude_tmp_dienstplan\test-suite.js`

Steps:

- [ ] **Step 1: Add failing tests with mocked `fetch`.**

  Append to `test-suite.js`:

  ```javascript
  // ============================================================================
  // ImageImporter Tests - callVisionAPI (Feature A)
  // ============================================================================

  /**
   * Helper to mock fetch and restore it.
   */
  function withMockedFetch(mockFn, fn) {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mockFn;
      const restore = () => { globalThis.fetch = originalFetch; };
      return Promise.resolve(fn()).finally(restore);
  }

  runner.test('CallVisionAPI: erfolgreicher 200-Response', async (t) => {
      const importer = new ImageImporter(null);
      let capturedUrl = null;
      let capturedInit = null;
      const mockFetch = async (url, init) => {
          capturedUrl = url;
          capturedInit = init;
          return new Response(JSON.stringify({
              choices: [{ message: { content: '{"entries":[]}' } }]
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      };
      await withMockedFetch(mockFetch, async () => {
          const content = await importer.callVisionAPI('data:image/jpeg;base64,AAA', 'sk-test', 'anthropic/claude-sonnet-4.6');
          t.assertEqual(content, '{"entries":[]}', 'Content extrahiert');
          t.assertEqual(capturedUrl, 'https://openrouter.ai/api/v1/chat/completions', 'Endpoint korrekt');
          t.assertTrue(capturedInit.headers['Authorization'] === 'Bearer sk-test', 'Auth-Header korrekt');
      });
  });

  runner.test('CallVisionAPI: 401 wirft mit Status', async (t) => {
      const importer = new ImageImporter(null);
      const mockFetch = async () => new Response('', { status: 401 });
      await withMockedFetch(mockFetch, async () => {
          try {
              await importer.callVisionAPI('data:image/jpeg;base64,AAA', 'bad', 'anthropic/claude-sonnet-4.6');
              t.assertTrue(false, 'Sollte werfen');
          } catch (e) {
              t.assertEqual(e.status, 401, 'Status auf Error');
              t.assertEqual(e.name, 'OpenRouterError', 'Typisierter Fehler');
          }
      });
  });

  runner.test('CallVisionAPI: 429 wirft mit Status', async (t) => {
      const importer = new ImageImporter(null);
      const mockFetch = async () => new Response('', { status: 429 });
      await withMockedFetch(mockFetch, async () => {
          try {
              await importer.callVisionAPI('data:image/jpeg;base64,AAA', 'k', 'm');
              t.assertTrue(false, 'Sollte werfen');
          } catch (e) {
              t.assertEqual(e.status, 429, '429 wird durchgereicht');
          }
      });
  });

  runner.test('CallVisionAPI: 503 wirft mit Status', async (t) => {
      const importer = new ImageImporter(null);
      const mockFetch = async () => new Response('', { status: 503 });
      await withMockedFetch(mockFetch, async () => {
          try {
              await importer.callVisionAPI('data:image/jpeg;base64,AAA', 'k', 'm');
              t.assertTrue(false, 'Sollte werfen');
          } catch (e) {
              t.assertEqual(e.status, 503, '503 wird durchgereicht');
          }
      });
  });
  ```

- [ ] **Step 2: Run tests; confirm RED.**

  Reload `test.html`, click run. The four `CallVisionAPI` tests should fail (method missing).

- [ ] **Step 3: Implement `callVisionAPI` in `image-import.js`.**

  Add inside the `ImageImporter` class (after `compressImage`):

  ```javascript
      /**
       * POST to OpenRouter chat/completions and return the assistant message content (raw string).
       * @param {string} dataUrl - 'data:image/jpeg;base64,...'
       * @param {string} apiKey
       * @param {string} modelId
       * @param {AbortSignal} [signal]
       * @returns {Promise<string>} raw assistant content (still markdown-fenced/JSON; parse later)
       */
      async callVisionAPI(dataUrl, apiKey, modelId, signal) {
          const body = {
              model: modelId,
              temperature: 0,
              response_format: { type: 'json_object' },
              messages: [
                  {
                      role: 'system',
                      content: ImageImporter.SYSTEM_PROMPT
                  },
                  {
                      role: 'user',
                      content: [
                          { type: 'text', text: 'Extrahiere alle Assistenzarzt-Dienste aus dieser Dienstplan-Tabelle.' },
                          { type: 'image_url', image_url: { url: dataUrl } }
                      ]
                  }
              ]
          };

          const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
              method: 'POST',
              headers: {
                  'Authorization': `Bearer ${apiKey}`,
                  'Content-Type': 'application/json',
                  'HTTP-Referer': (typeof window !== 'undefined' && window.location) ? window.location.origin : '',
                  'X-Title': 'Dienstplan-Pro'
              },
              body: JSON.stringify(body),
              signal: signal
          });

          if (!response.ok) {
              const err = new Error(`OpenRouter HTTP ${response.status}`);
              err.name = 'OpenRouterError';
              err.status = response.status;
              throw err;
          }

          const json = await response.json();
          const content = json && json.choices && json.choices[0] && json.choices[0].message
              ? json.choices[0].message.content
              : '';
          return typeof content === 'string' ? content : JSON.stringify(content);
      }
  ```

  Also add the static system prompt — at the END of the file (after `window.ImageImporter = ImageImporter;`), insert before the `if (typeof document` block:

  ```javascript
  ImageImporter.SYSTEM_PROMPT = `Du extrahierst Dienstplaene aus Tabellenbildern fuer eine deutsche Klinik.

  Regeln:
  - Die Tabelle listet pro Datum die diensthabenden Aerzte.
  - Es gibt Assistenzaerzte und Oberaerzte. Extrahiere NUR Assistenzaerzte. Oberaerzte werden ignoriert.
  - Wenn du nicht sicher bist, ob ein Name zu einem Assistenzarzt oder Oberarzt gehoert, vermerke dies in \`notes\`.
  - Wenn in einer Zelle NUR EIN Name steht: share = 1.0 fuer diesen Arzt.
  - Wenn in einer Zelle ZWEI Namen stehen: share = 0.5 fuer jeden der beiden.
  - Datum stets im ISO-Format YYYY-MM-DD.
  - Wenn das Bild einen Monatstitel zeigt (z.B. November 2025), gib month (1-12) und year (vierstellig) in der Antwort an. Sonst null.
  - Wenn ein Name unklar zu lesen ist, uebernimm deinen besten Ratevorschlag und vermerke es in notes.

  Antworte STRIKT in diesem JSON-Schema und sonst nichts:
  {
    "month": number | null,
    "year": number | null,
    "entries": [
      { "name": "string", "date": "YYYY-MM-DD", "share": 1.0 | 0.5 }
    ],
    "notes": ["string", ...]
  }`;
  ```

  Note: the implementer should preserve the German umlauts in the actual prompt when typing it (the plan uses ASCII for portability). The literal characters to use in `SYSTEM_PROMPT` should match the spec text in §7.3 verbatim — copy from `docs\specs\2026-05-11-bild-import-design.md` lines 355-377.

- [ ] **Step 4: Re-run tests; confirm GREEN.**

  Reload `test.html`, click run. The four `CallVisionAPI` tests should pass.

- [ ] **Step 5: Commit.**

  ```
  git add image-import.js test-suite.js
  git commit -m "feat(image-import): add callVisionAPI with OpenRouter fetch + typed HTTP errors"
  ```

---

### Task 5: Response parsing & schema validation (`parseResponse`) (TDD)

**Files:**
- Modify: `G:\Claude\Claude_tmp_dienstplan\image-import.js`
- Modify: `G:\Claude\Claude_tmp_dienstplan\test-suite.js`

Steps:

- [ ] **Step 1: Add failing tests.**

  Append to `test-suite.js`:

  ```javascript
  // ============================================================================
  // ImageImporter Tests - parseResponse (Feature A)
  // ============================================================================

  runner.test('Parse: cleanes JSON wird geparst', (t) => {
      const importer = new ImageImporter(null);
      const raw = '{"month":11,"year":2025,"entries":[{"name":"Max","date":"2025-11-22","share":1.0}],"notes":[]}';
      const result = importer.parseResponse(raw);
      t.assertEqual(result.entries.length, 1, '1 Eintrag');
      t.assertEqual(result.entries[0].name, 'Max', 'Name korrekt');
      t.assertEqual(result.month, 11, 'Monat korrekt');
  });

  runner.test('Parse: JSON in Markdown-Fence wird gestrippt', (t) => {
      const importer = new ImageImporter(null);
      const raw = '```json\n{"entries":[{"name":"A","date":"2025-11-22","share":0.5}],"notes":[]}\n```';
      const result = importer.parseResponse(raw);
      t.assertEqual(result.entries.length, 1, 'Fence wurde entfernt');
  });

  runner.test('Parse: JSON mit Vortext wird per Brace-Slicing extrahiert', (t) => {
      const importer = new ImageImporter(null);
      const raw = 'Hier das Ergebnis:\n{"entries":[{"name":"A","date":"2025-11-22","share":1.0}],"notes":[]}';
      const result = importer.parseResponse(raw);
      t.assertEqual(result.entries.length, 1, 'Vortext ignoriert');
  });

  runner.test('Parse: Malformed JSON wirft SyntaxError', (t) => {
      const importer = new ImageImporter(null);
      try {
          importer.parseResponse('das ist kein JSON');
          t.assertTrue(false, 'Sollte werfen');
      } catch (e) {
          t.assertTrue(e instanceof SyntaxError || e.name === 'SyntaxError' || /JSON|Parse/i.test(e.message), 'SyntaxError erwartet');
      }
  });

  runner.test('Parse: fehlendes entries-Feld wirft', (t) => {
      const importer = new ImageImporter(null);
      try {
          importer.parseResponse('{"month":11,"year":2025,"notes":[]}');
          t.assertTrue(false, 'Sollte werfen');
      } catch (e) {
          t.assertTrue(/entries/i.test(e.message), 'Fehlermeldung erwaehnt entries');
      }
  });

  runner.test('Parse: share=0.75 verwirft den Eintrag', (t) => {
      const importer = new ImageImporter(null);
      const raw = '{"entries":[{"name":"A","date":"2025-11-22","share":0.75},{"name":"B","date":"2025-11-23","share":1.0}],"notes":[]}';
      const result = importer.parseResponse(raw);
      t.assertEqual(result.entries.length, 1, 'Nur gueltiger Eintrag bleibt');
      t.assertEqual(result.entries[0].name, 'B', 'B uebrig');
  });

  runner.test('Parse: invalides Datum verwirft den Eintrag', (t) => {
      const importer = new ImageImporter(null);
      const raw = '{"entries":[{"name":"A","date":"31.11.2025","share":1.0},{"name":"B","date":"2025-11-22","share":1.0}],"notes":[]}';
      const result = importer.parseResponse(raw);
      t.assertEqual(result.entries.length, 1, 'Nur ISO-Datum bleibt');
      t.assertEqual(result.entries[0].name, 'B', 'B uebrig');
  });

  runner.test('Parse: leerer Name wird verworfen', (t) => {
      const importer = new ImageImporter(null);
      const raw = '{"entries":[{"name":"   ","date":"2025-11-22","share":1.0},{"name":"B","date":"2025-11-22","share":1.0}],"notes":[]}';
      const result = importer.parseResponse(raw);
      t.assertEqual(result.entries.length, 1, 'Nur gueltiger Name bleibt');
  });
  ```

- [ ] **Step 2: Run tests; confirm RED.**

  Reload `test.html`, run. The eight Parse tests should fail.

- [ ] **Step 3: Implement `parseResponse` in `image-import.js`.**

  Add inside the `ImageImporter` class:

  ```javascript
      /**
       * Strip markdown fences, brace-slice, JSON.parse, schema-validate.
       * Invalid entries are dropped with console warnings.
       * @param {string} rawContent
       * @returns {{ month: number|null, year: number|null, entries: Array<{name:string,date:string,share:number}>, notes: string[] }}
       */
      parseResponse(rawContent) {
          if (typeof rawContent !== 'string') {
              throw new SyntaxError('Antwort ist kein String');
          }

          let text = rawContent.trim();

          // Strip ```json ... ``` or ``` ... ``` fences
          text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');

          // Brace-slice: find first { and last }
          const firstBrace = text.indexOf('{');
          const lastBrace = text.lastIndexOf('}');
          if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
              throw new SyntaxError('Kein JSON-Objekt in der Antwort gefunden');
          }
          text = text.slice(firstBrace, lastBrace + 1);

          const parsed = JSON.parse(text); // may throw SyntaxError

          if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.entries)) {
              throw new Error('Schema-Fehler: entries fehlt oder ist kein Array');
          }

          const validEntries = [];
          for (const entry of parsed.entries) {
              if (!entry || typeof entry.name !== 'string' || entry.name.trim().length === 0) {
                  console.warn('parseResponse: Eintrag mit leerem Namen verworfen', entry);
                  continue;
              }
              if (typeof entry.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) {
                  console.warn('parseResponse: Eintrag mit ungueltigem Datum verworfen', entry);
                  continue;
              }
              const d = new Date(entry.date + 'T12:00:00');
              if (isNaN(d.getTime())) {
                  console.warn('parseResponse: Datum nicht parsebar', entry);
                  continue;
              }
              if (entry.share !== 0.5 && entry.share !== 1.0) {
                  console.warn('parseResponse: Eintrag mit ungueltigem share verworfen', entry);
                  continue;
              }
              validEntries.push({ name: entry.name.trim(), date: entry.date, share: entry.share });
          }

          const month = (typeof parsed.month === 'number' && parsed.month >= 1 && parsed.month <= 12) ? parsed.month : null;
          const year = (typeof parsed.year === 'number' && parsed.year >= 2000) ? parsed.year : null;
          const notes = Array.isArray(parsed.notes) ? parsed.notes.filter(n => typeof n === 'string') : [];

          return { month, year, entries: validEntries, notes };
      }
  ```

- [ ] **Step 4: Re-run tests; confirm GREEN.**

  Reload `test.html`, run. All eight Parse tests should be green.

- [ ] **Step 5: Commit.**

  ```
  git add image-import.js test-suite.js
  git commit -m "feat(image-import): add parseResponse with fence-stripping and schema validation"
  ```

---

### Task 6: Levenshtein distance (inline) (TDD)

**Files:**
- Modify: `G:\Claude\Claude_tmp_dienstplan\image-import.js`
- Modify: `G:\Claude\Claude_tmp_dienstplan\test-suite.js`

Steps:

- [ ] **Step 1: Add failing tests.**

  Append to `test-suite.js`:

  ```javascript
  // ============================================================================
  // ImageImporter Tests - Levenshtein (Feature A)
  // ============================================================================

  runner.test('Levenshtein: identische Strings = 0', (t) => {
      const importer = new ImageImporter(null);
      t.assertEqual(importer.levenshtein('max mustermann', 'max mustermann'), 0, 'Identisch');
  });

  runner.test('Levenshtein: leerer String', (t) => {
      const importer = new ImageImporter(null);
      t.assertEqual(importer.levenshtein('', 'abc'), 3, '0 vs 3 Zeichen');
      t.assertEqual(importer.levenshtein('abc', ''), 3, '3 vs 0 Zeichen');
      t.assertEqual(importer.levenshtein('', ''), 0, 'Beide leer');
  });

  runner.test('Levenshtein: 1 Substitution', (t) => {
      const importer = new ImageImporter(null);
      t.assertEqual(importer.levenshtein('abc', 'abd'), 1, '1 Subst');
  });

  runner.test('Levenshtein: 1 Insertion', (t) => {
      const importer = new ImageImporter(null);
      t.assertEqual(importer.levenshtein('max mustermann', 'max mustermannn'), 1, '1 zusaetzliches n');
  });

  runner.test('Levenshtein: 2 Distanz', (t) => {
      const importer = new ImageImporter(null);
      t.assertEqual(importer.levenshtein('mueller', 'mueler'), 1, 'ein l weniger');
  });
  ```

- [ ] **Step 2: Run tests; confirm RED.**

- [ ] **Step 3: Implement `levenshtein` in `image-import.js`.**

  Add inside the `ImageImporter` class:

  ```javascript
      /**
       * Levenshtein distance (O(m*n) DP, inline).
       * Inputs are expected to already be normalized.
       * @param {string} a
       * @param {string} b
       * @returns {number}
       */
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

- [ ] **Step 4: Re-run tests; confirm GREEN.**

- [ ] **Step 5: Commit.**

  ```
  git add image-import.js test-suite.js
  git commit -m "feat(image-import): add inline levenshtein distance helper"
  ```

---

### Task 7: Name matching + `classify(date)` slot helper (TDD)

**Files:**
- Modify: `G:\Claude\Claude_tmp_dienstplan\image-import.js`
- Modify: `G:\Claude\Claude_tmp_dienstplan\test-suite.js`

Steps:

- [ ] **Step 1: Add failing tests for `normalizeName`, `matchNames`, `classify`.**

  Append to `test-suite.js`:

  ```javascript
  // ============================================================================
  // ImageImporter Tests - normalizeName, matchNames, classify (Feature A)
  // ============================================================================

  runner.test('Match: exakter Match (case + whitespace identisch)', (t) => {
      const importer = new ImageImporter(null);
      const r = importer.matchNames(
          [{ name: 'Max Mustermann', date: '2025-11-22', share: 1.0 }],
          ['Max Mustermann']
      );
      t.assertEqual(r.matched.length, 1, '1 zugeordnet');
      t.assertEqual(r.matched[0].resolvedName, 'Max Mustermann', 'Direkt aufgeloest');
      t.assertEqual(r.unknowns.length, 0, 'Keine Unknowns');
  });

  runner.test('Match: normalisierter Match (Whitespace + Case)', (t) => {
      const importer = new ImageImporter(null);
      const r = importer.matchNames(
          [{ name: '  MAX   mustermann  ', date: '2025-11-22', share: 1.0 }],
          ['Max Mustermann']
      );
      t.assertEqual(r.matched.length, 1, '1 zugeordnet');
      t.assertEqual(r.matched[0].resolvedName, 'Max Mustermann', 'Normalisiert aufgeloest');
  });

  runner.test('Match: Fuzzy mit Distance 1', (t) => {
      const importer = new ImageImporter(null);
      const r = importer.matchNames(
          [{ name: 'Max Mustermannn', date: '2025-11-22', share: 1.0 }],
          ['Max Mustermann']
      );
      t.assertEqual(r.matched.length, 0, 'Nicht automatisch gematcht');
      t.assertEqual(r.unknowns.length, 1, '1 Unknown');
      t.assertEqual(r.unknowns[0].suggested, 'Max Mustermann', 'Vorschlag = naechster');
      t.assertEqual(r.unknowns[0].candidate, 'Max Mustermannn', 'Original-Kandidat');
  });

  runner.test('Match: Distance > 2 ohne Vorschlag', (t) => {
      const importer = new ImageImporter(null);
      const r = importer.matchNames(
          [{ name: 'Egon Olsen', date: '2025-11-22', share: 1.0 }],
          ['Max Mustermann']
      );
      t.assertEqual(r.unknowns.length, 1, '1 Unknown');
      t.assertEqual(r.unknowns[0].suggested, null, 'Kein Vorschlag');
  });

  runner.test('Match: leere Employee-Liste alle Unknowns', (t) => {
      const importer = new ImageImporter(null);
      const r = importer.matchNames(
          [{ name: 'Max', date: '2025-11-22', share: 1.0 }],
          []
      );
      t.assertEqual(r.unknowns.length, 1, 'Unknown');
      t.assertEqual(r.unknowns[0].suggested, null, 'Kein Vorschlag moeglich');
  });

  runner.test('Match: mehrere Fuzzy-Treffer gleiche Distanz alphabetisch erster', (t) => {
      const importer = new ImageImporter(null);
      const r = importer.matchNames(
          [{ name: 'Anne', date: '2025-11-22', share: 1.0 }],
          ['Anna', 'Anni']
      );
      t.assertEqual(r.unknowns[0].suggested, 'Anna', 'Alphabetisch erster');
  });

  runner.test('Classify: Freitag = fr', (t) => {
      const importer = new ImageImporter(null);
      importer.holidayProvider = new HolidayProvider();
      const fri = new Date('2025-11-21T12:00:00');
      t.assertEqual(importer.classify(fri), 'fr', 'Freitag');
  });

  runner.test('Classify: Samstag = sa', (t) => {
      const importer = new ImageImporter(null);
      importer.holidayProvider = new HolidayProvider();
      const sat = new Date('2025-11-22T12:00:00');
      t.assertEqual(importer.classify(sat), 'sa', 'Samstag');
  });

  runner.test('Classify: Feiertag (Werktag) = so', (t) => {
      const importer = new ImageImporter(null);
      importer.holidayProvider = new HolidayProvider();
      const may1 = new Date('2025-05-01T12:00:00');
      t.assertEqual(importer.classify(may1), 'so', 'Feiertag = so');
  });

  runner.test('Classify: Tag vor Feiertag (Werktag) = fr', (t) => {
      const importer = new ImageImporter(null);
      importer.holidayProvider = new HolidayProvider();
      const apr30 = new Date('2025-04-30T12:00:00');
      t.assertEqual(importer.classify(apr30), 'fr', 'Tag vor Feiertag');
  });

  runner.test('Classify: Werktag = weekday', (t) => {
      const importer = new ImageImporter(null);
      importer.holidayProvider = new HolidayProvider();
      const mon = new Date('2025-11-24T12:00:00');
      t.assertEqual(importer.classify(mon), 'weekday', 'Werktag');
  });
  ```

- [ ] **Step 2: Run tests; confirm RED.**

- [ ] **Step 3: Implement `normalizeName`, `matchNames`, `classify` in `image-import.js`.**

  Add inside the `ImageImporter` class:

  ```javascript
      /**
       * Normalize: lowercase, trim, collapse internal whitespace.
       * No umlaut folding (per spec section 10.1).
       * @param {string} name
       * @returns {string}
       */
      normalizeName(name) {
          return String(name).toLowerCase().trim().replace(/\s+/g, ' ');
      }

      /**
       * For each extracted entry, try exact-normalized match against existing employees;
       * else compute Levenshtein nearest with distance <= 2.
       * @param {Array<{name:string,date:string,share:number}>} extractedEntries
       * @param {string[]} existingEmployees
       * @returns {{ matched: Array<{entry:object, resolvedName:string}>, unknowns: Array<{candidate:string, suggested:string|null}> }}
       */
      matchNames(extractedEntries, existingEmployees) {
          const normalizedMap = new Map();
          for (const emp of existingEmployees) {
              normalizedMap.set(this.normalizeName(emp), emp);
          }
          const sortedEmployees = [...existingEmployees].sort();

          const matched = [];
          const unknownsByCandidate = new Map();

          for (const entry of extractedEntries) {
              const normCandidate = this.normalizeName(entry.name);
              if (normalizedMap.has(normCandidate)) {
                  matched.push({ entry, resolvedName: normalizedMap.get(normCandidate) });
                  continue;
              }

              let best = null;
              let bestDist = Infinity;
              for (const emp of sortedEmployees) {
                  const d = this.levenshtein(normCandidate, this.normalizeName(emp));
                  if (d < bestDist) {
                      bestDist = d;
                      best = emp;
                  }
              }
              const suggested = (best !== null && bestDist <= 2) ? best : null;

              if (!unknownsByCandidate.has(entry.name)) {
                  unknownsByCandidate.set(entry.name, { candidate: entry.name, suggested });
              }
          }

          return { matched, unknowns: Array.from(unknownsByCandidate.values()) };
      }

      /**
       * Slot classification, duplicated from Feature B per spec section 9.3 (independent feature).
       * @param {Date} date
       * @returns {'fr'|'sa'|'so'|'weekday'}
       */
      classify(date) {
          const wd = date.getDay();
          if (wd === 5) return 'fr';
          if (wd === 6) return 'sa';
          if (wd === 0) return 'so';
          const isFeiertag = this.holidayProvider && this.holidayProvider.isHoliday(date);
          const isTagVorFeiertag = this.holidayProvider && this.holidayProvider.isDayBeforeHoliday(date);
          if (isFeiertag && isTagVorFeiertag) return 'sa';
          if (isTagVorFeiertag) return 'fr';
          if (isFeiertag) return 'so';
          return 'weekday';
      }
  ```

- [ ] **Step 4: Re-run tests; confirm GREEN.**

- [ ] **Step 5: Commit.**

  ```
  git add image-import.js test-suite.js
  git commit -m "feat(image-import): add normalizeName, matchNames (exact+fuzzy), classify slot helper"
  ```

---

### Task 8: API-Key prompt + `openImportDialog` entry point

**Files:**
- Modify: `G:\Claude\Claude_tmp_dienstplan\image-import.js`
- Modify: `G:\Claude\Claude_tmp_dienstplan\index.html`
- Modify: `G:\Claude\Claude_tmp_dienstplan\styles.css`
- Modify: `G:\Claude\Claude_tmp_dienstplan\app.js`

Steps:

- [ ] **Step 1: Add the Bild-Import button + card-header flex wrapper in `index.html`.**

  In `G:\Claude\Claude_tmp_dienstplan\index.html`, replace the `<div id="tab-duties">` opening block:

  ```html
          <!-- Tab: Dienste eintragen -->
          <div id="tab-duties" class="tab-content active">
              <div class="card">
                  <h2>Dienste eintragen</h2>
  ```

  with:

  ```html
          <!-- Tab: Dienste eintragen -->
          <div id="tab-duties" class="tab-content active">
              <div class="card">
                  <div class="card-header">
                      <h2>Dienste eintragen</h2>
                      <button id="open-image-import-btn" class="btn btn-secondary">Bild importieren</button>
                  </div>
  ```

  (The Camera/Bild emoji in the button label is per spec 5.1. The implementer should include the camera emoji in the actual button text — the plan uses ASCII for safety.)

- [ ] **Step 2: Add `.card-header` flex CSS to `styles.css`.**

  In `G:\Claude\Claude_tmp_dienstplan\styles.css`, before the `/* Form Elements */` section, insert:

  ```css
  /* Card header (used by Bild-Import button) */
  .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      gap: 10px;
      flex-wrap: wrap;
  }

  .card-header h2 {
      margin-bottom: 0;
  }
  ```

- [ ] **Step 3: Wire the button in `app.js` `setupEventListeners()`.**

  In `G:\Claude\Claude_tmp_dienstplan\app.js`, locate the duty management block:

  ```javascript
          // Duty management
          document.getElementById('add-duty-btn').addEventListener('click', () => this.addDuty());
          document.getElementById('employee-select-duty').addEventListener('change', () => this.loadDutiesForSelectedEmployee());
          document.getElementById('month-select').addEventListener('change', () => this.loadDutiesForSelectedEmployee());
          document.getElementById('year-select').addEventListener('change', () => this.loadDutiesForSelectedEmployee());
  ```

  Append immediately after, inside the same `setupEventListeners` method:

  ```javascript
          // Bild-Import (Feature A)
          const imageImportBtn = document.getElementById('open-image-import-btn');
          if (imageImportBtn) {
              imageImportBtn.addEventListener('click', () => {
                  if (window.imageImporter) {
                      window.imageImporter.openImportDialog();
                  } else {
                      this.showToast('Bild-Import nicht verfuegbar.', 'error');
                  }
              });
          }
  ```

- [ ] **Step 4: Implement `openImportDialog`, `close`, `showModal`, `showStage` in `image-import.js`.**

  Add inside the `ImageImporter` class:

  ```javascript
      /**
       * Entry point. Ensure API key, then open the modal on Stage 1.
       */
      openImportDialog() {
          let key = this.storage.getApiKey();
          if (!key) {
              const promptText =
                  'Fuer die Bilderkennung wird ein OpenRouter-API-Key benoetigt.\n' +
                  'Der Key wird ausschliesslich lokal in Ihrem Browser gespeichert\n' +
                  'und nur an openrouter.ai gesendet.\n\n' +
                  'Key auf https://openrouter.ai/keys anlegen und hier eintragen:';
              const input = window.prompt(promptText, '');
              if (!input || !input.trim()) {
                  if (this.app) this.app.showToast('Kein API-Key gespeichert - Import abgebrochen', 'info');
                  return;
              }
              this.storage.setApiKey(input.trim());
              key = input.trim();
          }

          this.session = {
              file: null,
              thumbnailUrl: null,
              dataUrl: null,
              raw: null,
              entries: [],
              unknowns: [],
              resolvedNames: new Map(),
              targetYear: this.app ? this.app.currentYear : new Date().getFullYear(),
              targetMonth: this.app ? this.app.currentMonth : (new Date().getMonth() + 1),
              detectedMonth: null,
              detectedYear: null,
              notes: []
          };

          this.wireEventsOnce();
          this.showModal();
          this.showStage(1);
      }

      close() {
          if (this.session && this.session.thumbnailUrl) {
              URL.revokeObjectURL(this.session.thumbnailUrl);
          }
          this.session = null;
          if (this.abortController) {
              try { this.abortController.abort(); } catch (e) { /* ignore */ }
              this.abortController = null;
          }
          const modal = document.getElementById('image-import-modal');
          if (modal) modal.hidden = true;

          const recognizeBtn = document.getElementById('image-import-recognize-btn');
          if (recognizeBtn) recognizeBtn.disabled = true;
          const thumbWrap = document.getElementById('image-import-thumb-wrap');
          if (thumbWrap) thumbWrap.hidden = true;
          const fileInput = document.getElementById('image-import-file-input');
          if (fileInput) fileInput.value = '';
      }

      showModal() {
          const modal = document.getElementById('image-import-modal');
          if (modal) modal.hidden = false;
      }

      showStage(stageId) {
          const modal = document.getElementById('image-import-modal');
          if (!modal) return;
          modal.querySelectorAll('.modal-stage').forEach(s => {
              s.hidden = (parseInt(s.dataset.stage, 10) !== stageId);
          });
      }

      /**
       * Placeholder until Task 9 implements full wiring. Idempotent.
       */
      wireEventsOnce() {
          if (this._wired) return;
          this._wired = true;
          // Real handlers added in Task 9.
      }
  ```

- [ ] **Step 5: Manual verification — key prompt fires.**

  Note: The modal markup is added in Task 9, so this step only verifies the key prompt and that `openImportDialog` runs without throwing.

  1. Open DevTools Console at `http://localhost:8000/`.
  2. Run `localStorage.removeItem('dienstplan_openrouter_key')`.
  3. Reload the page.
  4. In the "Dienste eintragen" tab, click the Bild-Import button.
  5. Expect: `prompt()` dialog appears with the OpenRouter explainer text.
  6. Cancel → toast "Kein API-Key gespeichert - Import abgebrochen" appears.
  7. Click button again → prompt again. Enter `sk-dummy-test`. Confirm. The modal is not yet visible (Task 9 adds markup), but `window.imageImporter.session` is populated. Console: `window.imageImporter.session.file === null` should be `true`; `window.imageImporter.storage.getApiKey()` returns `'sk-dummy-test'`.

- [ ] **Step 6: Commit.**

  ```
  git add image-import.js index.html styles.css app.js
  git commit -m "feat(image-import): add openImportDialog entry point with API-key prompt and Bild-Import button"
  ```

---

### Task 9: Modal Stage 1 (Upload) HTML + CSS + wiring

**Files:**
- Modify: `G:\Claude\Claude_tmp_dienstplan\index.html`
- Modify: `G:\Claude\Claude_tmp_dienstplan\styles.css`
- Modify: `G:\Claude\Claude_tmp_dienstplan\image-import.js`

Steps:

- [ ] **Step 1: Add modal skeleton to `index.html`.**

  In `G:\Claude\Claude_tmp_dienstplan\index.html`, locate:

  ```html
      <!-- Toast Notification -->
      <div id="toast" class="toast"></div>
  ```

  Insert immediately BEFORE that line:

  ```html
      <!-- Bild-Import Modal (Feature A) -->
      <div id="image-import-modal" class="modal" hidden>
          <div class="modal-backdrop"></div>
          <div class="modal-content">
              <button class="modal-close" id="image-import-close-btn" aria-label="Schliessen">&times;</button>

              <!-- Stage 1: Upload -->
              <div class="modal-stage" data-stage="1">
                  <h2>Bild importieren - Schritt 1: Bild auswaehlen</h2>
                  <p class="privacy-notice">Das Bild wird zur Erkennung an OpenRouter gesendet.</p>

                  <div class="drag-drop-zone" id="image-import-dropzone">
                      <p>Bild hier ablegen oder Datei auswaehlen</p>
                      <input type="file" id="image-import-file-input" accept="image/png,image/jpeg,image/webp" hidden>
                      <button class="btn btn-secondary" id="image-import-pick-btn">Datei auswaehlen</button>
                      <input type="file" id="image-import-camera-input" accept="image/*" capture="environment" hidden>
                      <button class="btn btn-secondary" id="image-import-camera-btn">Mit Kamera aufnehmen</button>
                  </div>

                  <div class="thumbnail-preview" id="image-import-thumb-wrap" hidden>
                      <img id="image-import-thumb" alt="Vorschau">
                      <div class="thumbnail-meta">
                          <span id="image-import-thumb-name"></span>
                          <span id="image-import-thumb-size"></span>
                      </div>
                  </div>

                  <div class="modal-actions">
                      <button class="btn btn-secondary" id="image-import-cancel-1-btn">Abbrechen</button>
                      <button class="btn btn-primary" id="image-import-recognize-btn" disabled>Erkennen</button>
                  </div>
              </div>

              <!-- Stage 2: Processing -->
              <div class="modal-stage" data-stage="2" hidden>
                  <h2>Analysiere Bild...</h2>
                  <div class="spinner"></div>
                  <p class="text-muted">Das kann 5-15 Sekunden dauern.</p>
                  <div class="modal-actions">
                      <button class="btn btn-secondary" id="image-import-cancel-2-btn">Abbrechen</button>
                  </div>
              </div>

              <!-- Stage 3: Preview & Confirm -->
              <div class="modal-stage" data-stage="3" hidden>
                  <h2>Vorschau und Bestaetigen</h2>
                  <div id="image-import-notes-box"></div>
                  <div class="unknown-names-box" id="image-import-unknowns-box" hidden>
                      <h3>Unbekannte Namen</h3>
                      <div id="image-import-unknowns-list"></div>
                  </div>
                  <div id="image-import-preview-table"></div>
                  <div class="modal-actions">
                      <button class="btn btn-secondary" id="image-import-cancel-3-btn">Abbrechen</button>
                      <button class="btn btn-primary" id="image-import-confirm-btn">Bestaetigen und Importieren</button>
                  </div>
              </div>

              <!-- Stage 4: Done -->
              <div class="modal-stage" data-stage="4" hidden>
                  <h2>Import abgeschlossen</h2>
                  <p id="image-import-done-summary"></p>
              </div>
          </div>
      </div>
  ```

- [ ] **Step 2: Add modal CSS to `styles.css`.**

  Append to `G:\Claude\Claude_tmp_dienstplan\styles.css` at the very end:

  ```css
  /* ============================================================
     Bild-Import Modal (Feature A)
     ============================================================ */
  .modal {
      position: fixed;
      inset: 0;
      z-index: 1500;
      display: flex;
      align-items: center;
      justify-content: center;
  }

  .modal[hidden] { display: none; }

  .modal-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
  }

  .modal-content {
      position: relative;
      background: white;
      border-radius: 12px;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
      padding: 30px;
      max-width: 800px;
      width: 90%;
      max-height: 90vh;
      overflow-y: auto;
  }

  .modal-close {
      position: absolute;
      top: 10px;
      right: 10px;
      width: 32px;
      height: 32px;
      border: none;
      background: transparent;
      font-size: 24px;
      cursor: pointer;
      color: #666;
  }

  .modal-stage {
      animation: fadeIn 0.2s ease;
  }

  .modal-stage[hidden] { display: none; }

  .modal-actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 20px;
      flex-wrap: wrap;
  }

  .privacy-notice {
      font-size: 0.875rem;
      color: #6c757d;
      margin-bottom: 15px;
      font-style: italic;
  }

  .drag-drop-zone {
      border: 2px dashed #c0c0c8;
      border-radius: 8px;
      padding: 30px;
      text-align: center;
      transition: all 0.2s ease;
      margin-bottom: 15px;
  }

  .drag-drop-zone.drag-over {
      border-color: #667eea;
      background: rgba(102, 126, 234, 0.05);
  }

  .drag-drop-zone p {
      margin-bottom: 15px;
      color: #555;
  }

  .thumbnail-preview {
      display: flex;
      gap: 15px;
      align-items: center;
      padding: 15px;
      background: #f8f9fa;
      border-radius: 6px;
      margin-bottom: 15px;
  }

  .thumbnail-preview img {
      max-width: 240px;
      max-height: 240px;
      border-radius: 4px;
      border: 1px solid #e0e0e0;
  }

  .thumbnail-meta {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 0.875rem;
      color: #555;
  }

  .spinner {
      width: 48px;
      height: 48px;
      margin: 30px auto;
      border: 4px solid #e0e0e0;
      border-top-color: #667eea;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
      to { transform: rotate(360deg); }
  }

  .unknown-names-box {
      background: #fff3cd;
      border-left: 4px solid #ffc107;
      border-radius: 6px;
      padding: 15px;
      margin-bottom: 20px;
  }

  .unknown-name-row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 0;
      border-bottom: 1px solid rgba(0, 0, 0, 0.05);
      flex-wrap: wrap;
  }

  .unknown-name-row:last-child { border-bottom: none; }

  .unknown-name-row .unknown-candidate {
      font-weight: 600;
      flex: 1;
      min-width: 140px;
  }

  .unknown-name-row select {
      flex: 2;
      min-width: 180px;
      padding: 6px 10px;
      border: 2px solid #e0e0e0;
      border-radius: 4px;
  }

  .unknown-name-row .fuzzy-hint {
      flex-basis: 100%;
      font-size: 0.8rem;
      color: #856404;
      padding-left: 4px;
  }

  .preview-employee-group {
      margin-bottom: 20px;
      background: #f8f9fa;
      border-radius: 6px;
      padding: 15px;
  }

  .preview-employee-group h3 {
      color: #667eea;
      margin-bottom: 10px;
      font-size: 1.1rem;
  }

  .preview-table {
      width: 100%;
      border-collapse: collapse;
  }

  .preview-table th,
  .preview-table td {
      padding: 6px 8px;
      border-bottom: 1px solid #e0e0e0;
      text-align: left;
      font-size: 0.9rem;
  }

  .preview-table th { background: #ececf3; }

  .preview-row.outside-month { background: #fff0f0; }

  .preview-row .row-remove-btn {
      background: transparent;
      border: none;
      cursor: pointer;
      font-size: 1rem;
  }

  .slot-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
      color: white;
  }

  .slot-badge.slot-fr { background: #fd7e14; }
  .slot-badge.slot-sa { background: #dc3545; }
  .slot-badge.slot-so { background: #dc3545; }
  .slot-badge.slot-weekday { background: #6c757d; }

  .api-key-status-ok { color: #28a745; font-weight: 500; }
  .api-key-status-none { color: #6c757d; font-style: italic; }
  ```

- [ ] **Step 3: Replace the `wireEventsOnce()` placeholder and add `onFileSelected` in `image-import.js`.**

  Replace the placeholder `wireEventsOnce` method (from Task 8 Step 4) with the full version, and add `onFileSelected`:

  ```javascript
      /**
       * Attach DOM event listeners. Called lazily on first openImportDialog.
       * Safe to call multiple times (idempotent via this._wired flag).
       */
      wireEventsOnce() {
          if (this._wired) return;
          this._wired = true;

          const closeBtn = document.getElementById('image-import-close-btn');
          const cancel1 = document.getElementById('image-import-cancel-1-btn');
          const cancel3 = document.getElementById('image-import-cancel-3-btn');
          [closeBtn, cancel1, cancel3].forEach(b => {
              if (b) b.addEventListener('click', () => this.close());
          });

          const cancel2 = document.getElementById('image-import-cancel-2-btn');
          if (cancel2) cancel2.addEventListener('click', () => {
              if (this.abortController) {
                  try { this.abortController.abort(); } catch (e) { /* ignore */ }
              }
              this.close();
          });

          const fileInput = document.getElementById('image-import-file-input');
          const pickBtn = document.getElementById('image-import-pick-btn');
          if (pickBtn) pickBtn.addEventListener('click', () => fileInput && fileInput.click());
          if (fileInput) fileInput.addEventListener('change', (e) => {
              const f = e.target.files && e.target.files[0];
              if (f) this.onFileSelected(f);
          });

          const cameraInput = document.getElementById('image-import-camera-input');
          const cameraBtn = document.getElementById('image-import-camera-btn');
          if (cameraBtn) cameraBtn.addEventListener('click', () => cameraInput && cameraInput.click());
          if (cameraInput) cameraInput.addEventListener('change', (e) => {
              const f = e.target.files && e.target.files[0];
              if (f) this.onFileSelected(f);
          });

          const dz = document.getElementById('image-import-dropzone');
          if (dz) {
              dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drag-over'); });
              dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
              dz.addEventListener('drop', (e) => {
                  e.preventDefault();
                  dz.classList.remove('drag-over');
                  const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
                  if (f) this.onFileSelected(f);
              });
          }

          const recognizeBtn = document.getElementById('image-import-recognize-btn');
          if (recognizeBtn) recognizeBtn.addEventListener('click', () => this.runRecognition());

          const confirmBtn = document.getElementById('image-import-confirm-btn');
          if (confirmBtn) confirmBtn.addEventListener('click', () => this.commitImport());
      }

      /**
       * Validate file (type + size), set into session, render thumbnail, enable Erkennen.
       * @param {File} file
       */
      onFileSelected(file) {
          if (!file.type || !file.type.startsWith('image/')) {
              if (this.app) this.app.showToast('Nur Bildformate werden unterstuetzt', 'error');
              return;
          }
          const MAX = 20 * 1024 * 1024;
          if (file.size > MAX) {
              if (this.app) this.app.showToast('Bild zu gross (max. 20 MB)', 'error');
              return;
          }

          if (this.session.thumbnailUrl) URL.revokeObjectURL(this.session.thumbnailUrl);
          this.session.file = file;
          this.session.thumbnailUrl = URL.createObjectURL(file);

          const wrap = document.getElementById('image-import-thumb-wrap');
          const img = document.getElementById('image-import-thumb');
          const nameEl = document.getElementById('image-import-thumb-name');
          const sizeEl = document.getElementById('image-import-thumb-size');
          if (img) img.src = this.session.thumbnailUrl;
          if (nameEl) nameEl.textContent = file.name;
          if (sizeEl) sizeEl.textContent = `${Math.round(file.size / 1024)} KB`;
          if (wrap) wrap.hidden = false;

          const recognizeBtn = document.getElementById('image-import-recognize-btn');
          if (recognizeBtn) recognizeBtn.disabled = false;
      }
  ```

- [ ] **Step 4: Manual verification — Stage 1 works end-to-end (without recognition yet).**

  1. Open `http://localhost:8000/`. Reload. Click Bild-Import button. Modal opens on Stage 1.
  2. Click "Datei auswaehlen", choose any PNG/JPEG (e.g. a screenshot). Thumbnail appears with filename + KB. "Erkennen" button becomes enabled.
  3. Try selecting a `.txt` file → toast "Nur Bildformate werden unterstuetzt".
  4. Drag any image file onto the drop zone → same effect as picking via dialog.
  5. Click "Abbrechen" → modal closes; `window.imageImporter.session === null`.
  6. Click the close (x) button → modal closes.
  7. Re-open modal → no stale thumbnail (Stage 1 is fresh because session is rebuilt and Erkennen disabled).

- [ ] **Step 5: Commit.**

  ```
  git add index.html styles.css image-import.js
  git commit -m "feat(image-import): add modal markup, CSS, and Stage 1 file/drop/camera wiring"
  ```

---

### Task 10: Modal Stage 2 (Processing) — wire `runRecognition`

**Files:**
- Modify: `G:\Claude\Claude_tmp_dienstplan\image-import.js`

Steps:

- [ ] **Step 1: Implement `runRecognition` and `handleRecognitionError` in `image-import.js`.**

  Add inside the `ImageImporter` class:

  ```javascript
      /**
       * Stage 1 to Stage 2 to (Stage 3 | back-to-1 on error).
       * Compress, call API, parse, dedupe, match names, then showStage(3).
       */
      async runRecognition() {
          if (!this.session || !this.session.file) {
              if (this.app) this.app.showToast('Kein Bild ausgewaehlt', 'error');
              return;
          }

          this.showStage(2);
          this.abortController = new AbortController();

          try {
              const compressed = await this.compressImage(this.session.file);
              this.session.dataUrl = compressed.dataUrl;

              const apiKey = this.storage.getApiKey();
              const modelId = this.storage.getApiModel();
              const rawContent = await this.callVisionAPI(
                  compressed.dataUrl,
                  apiKey,
                  modelId,
                  this.abortController.signal
              );

              const parsed = this.parseResponse(rawContent);
              if (parsed.entries.length === 0) {
                  if (this.app) this.app.showToast('Keine Dienste erkannt', 'info');
                  this.showStage(1);
                  return;
              }

              // Dedupe (name, date) — keep higher share on conflict
              const dedup = new Map();
              const dupeNotes = [];
              for (const e of parsed.entries) {
                  const key = `${e.name}|${e.date}`;
                  const prev = dedup.get(key);
                  if (prev) {
                      if (e.share > prev.share) {
                          dedup.set(key, e);
                          dupeNotes.push(`Doppelter Eintrag fuer ${e.name} am ${e.date} - hoeherer Anteil verwendet`);
                      }
                  } else {
                      dedup.set(key, e);
                  }
              }
              const dedupedEntries = Array.from(dedup.values());

              const employees = this.storage.getEmployees();
              const matchResult = this.matchNames(dedupedEntries, employees);

              this.session.detectedMonth = parsed.month;
              this.session.detectedYear = parsed.year;
              this.session.notes = [...(parsed.notes || []), ...dupeNotes];
              this.session.entries = dedupedEntries.map(e => ({
                  name: e.name,
                  date: new Date(e.date + 'T12:00:00'),
                  dateStr: e.date,
                  share: e.share
              }));
              this.session.unknowns = matchResult.unknowns.map(u => ({
                  candidate: u.candidate,
                  suggested: u.suggested,
                  choice: u.suggested ? `assign:${u.suggested}` : 'new'
              }));
              this.session.resolvedNames = new Map();
              matchResult.matched.forEach(m => {
                  this.session.resolvedNames.set(m.entry.name, m.resolvedName);
              });

              this.renderPreview();
              this.showStage(3);
          } catch (err) {
              this.handleRecognitionError(err);
          } finally {
              this.abortController = null;
          }
      }

      /**
       * Toast appropriate message and return to Stage 1 (or close on AbortError).
       * @param {Error} err
       */
      handleRecognitionError(err) {
          if (err && err.name === 'AbortError') {
              this.close();
              return;
          }
          let msg;
          if (err && err.name === 'OpenRouterError') {
              switch (err.status) {
                  case 401: msg = 'API-Key ungueltig'; break;
                  case 402:
                  case 429: msg = 'Limit erreicht oder Guthaben aufgebraucht'; break;
                  default:
                      if (err.status >= 500) msg = `Server-Fehler, spaeter nochmal (HTTP ${err.status})`;
                      else msg = `Anfrage abgelehnt (HTTP ${err.status})`;
              }
          } else if (err instanceof TypeError) {
              msg = 'Keine Verbindung zu OpenRouter - Internet pruefen';
          } else if (err instanceof SyntaxError || (err && /JSON|Schema|entries/i.test(err.message))) {
              msg = 'Erkennung fehlgeschlagen - anderes Modell probieren oder Bild pruefen';
          } else {
              msg = 'Erkennung fehlgeschlagen';
          }
          if (this.app) this.app.showToast(msg, 'error');
          this.showStage(1);
      }
  ```

- [ ] **Step 2: Manual verification — Stage 2 transition with monkey-patched API.**

  1. Open `http://localhost:8000/`. In DevTools Console, run:
     ```javascript
     window.imageImporter.callVisionAPI = async () => {
         await new Promise(r => setTimeout(r, 2000));
         return JSON.stringify({
             month: 11, year: 2025,
             entries: [
                 { name: 'Max Mustermann', date: '2025-11-22', share: 1.0 },
                 { name: 'Anna Schmidt', date: '2025-11-23', share: 0.5 }
             ],
             notes: []
         });
     };
     ```
  2. Click Bild-Import, pick any image, click "Erkennen".
  3. Stage 2 shows for ~2 s with spinner.
  4. The Console should log no errors. (Stage 3 rendering happens in next task; for now expect a no-op when `renderPreview` is called — that's the Task 11 boundary. Optionally guard with `if (typeof this.renderPreview === 'function')`.)

  To confirm Stage 2 cancel: replace `setTimeout 2000` with `30000`; click "Abbrechen" during processing → modal closes silently, no error toast.

- [ ] **Step 3: Commit.**

  ```
  git add image-import.js
  git commit -m "feat(image-import): add runRecognition pipeline (compress, call, parse, dedupe, match) + Stage 2 cancel"
  ```

---

### Task 11: Modal Stage 3 (Preview & Confirm) — `renderPreview`

**Files:**
- Modify: `G:\Claude\Claude_tmp_dienstplan\image-import.js`

Steps:

- [ ] **Step 1: Implement `renderPreview`, `groupEntriesByResolvedEmployee`, `onUnknownChoiceChange`, `onRemoveEntry`.**

  All DOM construction uses `document.createElement` + `textContent` (XSS-safe) — no `innerHTML` with user data.

  Add inside the `ImageImporter` class:

  ```javascript
      /**
       * Render Stage 3 from this.session. Idempotent (clears and rebuilds DOM).
       * Uses createElement + textContent only — never innerHTML with user data.
       */
      renderPreview() {
          const monthNames = ['Januar', 'Februar', 'Maerz', 'April', 'Mai', 'Juni',
                              'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
          const weekdayFmt = new Intl.DateTimeFormat('de-DE', { weekday: 'long' });

          // ---- Notes box ----
          const notesBox = document.getElementById('image-import-notes-box');
          if (notesBox) {
              while (notesBox.firstChild) notesBox.removeChild(notesBox.firstChild);
              const detected = (this.session.detectedMonth && this.session.detectedYear)
                  ? `${monthNames[this.session.detectedMonth - 1]} ${this.session.detectedYear}`
                  : null;
              const target = `${monthNames[this.session.targetMonth - 1]} ${this.session.targetYear}`;
              if (detected && (this.session.detectedMonth !== this.session.targetMonth
                               || this.session.detectedYear !== this.session.targetYear)) {
                  const p = document.createElement('p');
                  p.className = 'text-warning';
                  p.textContent = `Erkannter Monat: ${detected}, aktuell ausgewaehlt: ${target}. Import laeuft auf den ausgewaehlten Monat.`;
                  notesBox.appendChild(p);
              }
              for (const note of this.session.notes) {
                  const p = document.createElement('p');
                  p.className = 'text-muted';
                  p.textContent = note;
                  notesBox.appendChild(p);
              }
          }

          // ---- Unknown names box ----
          const unknownsBox = document.getElementById('image-import-unknowns-box');
          const unknownsList = document.getElementById('image-import-unknowns-list');
          if (unknownsBox && unknownsList) {
              while (unknownsList.firstChild) unknownsList.removeChild(unknownsList.firstChild);
              if (this.session.unknowns.length === 0) {
                  unknownsBox.hidden = true;
              } else {
                  unknownsBox.hidden = false;
                  const employees = [...this.storage.getEmployees()].sort();
                  for (const unk of this.session.unknowns) {
                      const row = document.createElement('div');
                      row.className = 'unknown-name-row';

                      const nameSpan = document.createElement('span');
                      nameSpan.className = 'unknown-candidate';
                      nameSpan.textContent = unk.candidate;
                      row.appendChild(nameSpan);

                      const select = document.createElement('select');
                      const optNew = document.createElement('option');
                      optNew.value = 'new';
                      optNew.textContent = 'Neuer Mitarbeiter anlegen';
                      select.appendChild(optNew);
                      for (const emp of employees) {
                          const o = document.createElement('option');
                          o.value = `assign:${emp}`;
                          o.textContent = `Zuordnen zu ${emp}`;
                          select.appendChild(o);
                      }
                      const optIgnore = document.createElement('option');
                      optIgnore.value = 'ignore';
                      optIgnore.textContent = 'Ignorieren';
                      select.appendChild(optIgnore);

                      select.value = unk.choice;
                      select.addEventListener('change', (e) => {
                          this.onUnknownChoiceChange(unk.candidate, e.target.value);
                      });
                      row.appendChild(select);

                      if (unk.suggested) {
                          const hint = document.createElement('div');
                          hint.className = 'fuzzy-hint';
                          hint.textContent = `moeglicher Match: ${unk.suggested}`;
                          row.appendChild(hint);
                      }
                      unknownsList.appendChild(row);
                  }
              }
          }

          // ---- Preview table grouped by resolved employee ----
          const tableHost = document.getElementById('image-import-preview-table');
          if (tableHost) {
              while (tableHost.firstChild) tableHost.removeChild(tableHost.firstChild);
              const grouped = this.groupEntriesByResolvedEmployee();

              for (const [employeeName, rows] of grouped.entries()) {
                  if (employeeName === null) continue;
                  const group = document.createElement('div');
                  group.className = 'preview-employee-group';
                  const h3 = document.createElement('h3');
                  h3.textContent = employeeName;
                  group.appendChild(h3);

                  const table = document.createElement('table');
                  table.className = 'preview-table';
                  const thead = document.createElement('thead');
                  const headRow = document.createElement('tr');
                  for (const headText of ['Datum', 'Wochentag', 'Slot', 'Anteil', 'Aktion']) {
                      const th = document.createElement('th');
                      th.textContent = headText;
                      headRow.appendChild(th);
                  }
                  thead.appendChild(headRow);
                  table.appendChild(thead);

                  const tbody = document.createElement('tbody');
                  for (const r of rows) {
                      const tr = document.createElement('tr');
                      tr.className = 'preview-row';
                      const m = r.entry.date.getMonth() + 1;
                      const y = r.entry.date.getFullYear();
                      const outside = (m !== this.session.targetMonth || y !== this.session.targetYear);
                      if (outside) tr.classList.add('outside-month');

                      const tdDate = document.createElement('td');
                      tdDate.textContent = r.entry.dateStr + (outside ? ' (ausserhalb Monat)' : '');
                      tr.appendChild(tdDate);

                      const tdWeekday = document.createElement('td');
                      tdWeekday.textContent = weekdayFmt.format(r.entry.date);
                      tr.appendChild(tdWeekday);

                      const tdSlot = document.createElement('td');
                      const slot = this.classify(r.entry.date);
                      const slotBadge = document.createElement('span');
                      slotBadge.className = `slot-badge slot-${slot}`;
                      slotBadge.textContent = slot;
                      tdSlot.appendChild(slotBadge);
                      tr.appendChild(tdSlot);

                      const tdShare = document.createElement('td');
                      tdShare.textContent = r.entry.share.toFixed(1);
                      tr.appendChild(tdShare);

                      const tdAction = document.createElement('td');
                      const removeBtn = document.createElement('button');
                      removeBtn.className = 'row-remove-btn';
                      removeBtn.title = 'Entfernen';
                      removeBtn.textContent = 'Entfernen';
                      removeBtn.addEventListener('click', () => this.onRemoveEntry(r.index));
                      tdAction.appendChild(removeBtn);
                      tr.appendChild(tdAction);

                      tbody.appendChild(tr);
                  }
                  table.appendChild(tbody);
                  group.appendChild(table);
                  tableHost.appendChild(group);
              }
          }
      }

      /**
       * Build Map<resolvedEmployeeName|null, [{ entry, index }]> based on session.entries
       * and unknowns choices.
       */
      groupEntriesByResolvedEmployee() {
          const choiceByCandidate = new Map();
          for (const u of this.session.unknowns) {
              choiceByCandidate.set(u.candidate, u.choice);
          }

          const grouped = new Map();
          for (let i = 0; i < this.session.entries.length; i++) {
              const e = this.session.entries[i];
              let resolved;
              if (this.session.resolvedNames.has(e.name)) {
                  resolved = this.session.resolvedNames.get(e.name);
              } else {
                  const choice = choiceByCandidate.get(e.name) || 'new';
                  if (choice === 'ignore') resolved = null;
                  else if (choice === 'new') resolved = e.name;
                  else if (choice.startsWith('assign:')) resolved = choice.slice('assign:'.length);
                  else resolved = e.name;
              }
              if (!grouped.has(resolved)) grouped.set(resolved, []);
              grouped.get(resolved).push({ entry: e, index: i });
          }
          return grouped;
      }

      onUnknownChoiceChange(candidate, choice) {
          const unk = this.session.unknowns.find(u => u.candidate === candidate);
          if (unk) unk.choice = choice;
          this.renderPreview();
      }

      onRemoveEntry(index) {
          this.session.entries.splice(index, 1);
          this.renderPreview();
      }
  ```

- [ ] **Step 2: Manual verification — Stage 3 renders.**

  1. Open `http://localhost:8000/`. Reload. In Console:
     ```javascript
     app.storage.clearAll();
     app.storage.addEmployee('Max Mustermann');
     app.storage.addEmployee('Anna Schmidt');
     app.loadEmployeeSelects();

     window.imageImporter.callVisionAPI = async () => JSON.stringify({
         month: 11, year: 2025,
         entries: [
             { name: 'Max Mustermann', date: '2025-11-22', share: 1.0 },
             { name: 'Max Mustermannn', date: '2025-11-23', share: 0.5 },
             { name: 'Egon Olsen', date: '2025-11-28', share: 1.0 }
         ],
         notes: ['Testlauf']
     });
     ```
  2. Click Bild-Import, pick any image, click "Erkennen".
  3. Stage 3 appears with:
     - Notes box: "Testlauf".
     - Unknowns box visible with two rows: `Max Mustermannn` (default `Zuordnen zu Max Mustermann`, hint `moeglicher Match: Max Mustermann`) and `Egon Olsen` (default `Neuer Mitarbeiter anlegen`).
     - Preview table grouped: one group for `Max Mustermann` containing rows 2025-11-22 (Samstag, slot=sa), 2025-11-23 (Sonntag, slot=so).
     - One group for `Egon Olsen` containing 2025-11-28 (Freitag, slot=fr).
  4. Change the `Egon Olsen` dropdown to `Zuordnen zu Anna Schmidt` → table regroups (Egon's row moves under Anna Schmidt).
  5. Click `Entfernen` on one row → that row disappears, table re-renders.
  6. Click `Abbrechen` → modal closes.

- [ ] **Step 3: Commit.**

  ```
  git add image-import.js
  git commit -m "feat(image-import): add renderPreview + Stage 3 grouping, unknowns, slot badges, remove-row"
  ```

---

### Task 12: Commit-to-storage logic (`resolveImports` + `commitImport`) (TDD where pure)

**Files:**
- Modify: `G:\Claude\Claude_tmp_dienstplan\image-import.js`
- Modify: `G:\Claude\Claude_tmp_dienstplan\test-suite.js`

Steps:

- [ ] **Step 1: Add failing pure-function tests for `resolveImports`.**

  Append to `test-suite.js`:

  ```javascript
  // ============================================================================
  // ImageImporter Tests - resolveImports (pure) (Feature A)
  // ============================================================================

  runner.test('Resolve: gemischte unknowns (new + assign + ignore)', (t) => {
      const importer = new ImageImporter(null);
      const session = {
          entries: [
              { name: 'Max Mustermann', date: new Date('2025-11-22T12:00:00'), dateStr: '2025-11-22', share: 1.0 },
              { name: 'Max Mustermannn', date: new Date('2025-11-23T12:00:00'), dateStr: '2025-11-23', share: 0.5 },
              { name: 'Egon Olsen', date: new Date('2025-11-28T12:00:00'), dateStr: '2025-11-28', share: 1.0 },
              { name: 'Hugo Ignored', date: new Date('2025-11-29T12:00:00'), dateStr: '2025-11-29', share: 1.0 }
          ],
          unknowns: [
              { candidate: 'Max Mustermannn', suggested: 'Max Mustermann', choice: 'assign:Max Mustermann' },
              { candidate: 'Egon Olsen', suggested: null, choice: 'new' },
              { candidate: 'Hugo Ignored', suggested: null, choice: 'ignore' }
          ],
          resolvedNames: new Map([['Max Mustermann', 'Max Mustermann']]),
          targetYear: 2025,
          targetMonth: 11
      };
      const plan = importer.resolveImports(session);
      t.assertEqual(plan.newEmployees.length, 1, '1 neuer MA');
      t.assertEqual(plan.newEmployees[0], 'Egon Olsen', 'Egon ist neu');
      t.assertEqual(plan.commits.length, 3, '3 Commits (Hugo ignoriert)');
      t.assertEqual(plan.skippedOutsideMonth, 0, 'Keine ausserhalb Monat');

      const max22 = plan.commits.find(c => c.employeeName === 'Max Mustermann' && c.dateStr === '2025-11-22');
      t.assertTrue(!!max22, 'Max am 22.11 vorhanden');
      t.assertEqual(max22.share, 1.0, 'Share 1.0');

      const maxFromFuzzy = plan.commits.find(c => c.employeeName === 'Max Mustermann' && c.dateStr === '2025-11-23');
      t.assertTrue(!!maxFromFuzzy, 'Fuzzy-Match wurde aufgeloest');
      t.assertEqual(maxFromFuzzy.share, 0.5, 'Share 0.5');

      const egon = plan.commits.find(c => c.employeeName === 'Egon Olsen');
      t.assertTrue(!!egon, 'Egon committed');
  });

  runner.test('Resolve: ausserhalb Monat wird uebersprungen', (t) => {
      const importer = new ImageImporter(null);
      const session = {
          entries: [
              { name: 'A', date: new Date('2025-11-22T12:00:00'), dateStr: '2025-11-22', share: 1.0 },
              { name: 'A', date: new Date('2025-12-01T12:00:00'), dateStr: '2025-12-01', share: 1.0 }
          ],
          unknowns: [{ candidate: 'A', suggested: null, choice: 'new' }],
          resolvedNames: new Map(),
          targetYear: 2025,
          targetMonth: 11
      };
      const plan = importer.resolveImports(session);
      t.assertEqual(plan.commits.length, 1, 'Nur November-Eintrag bleibt');
      t.assertEqual(plan.skippedOutsideMonth, 1, '1 uebersprungen');
  });
  ```

- [ ] **Step 2: Run tests; confirm RED.**

- [ ] **Step 3: Implement `resolveImports` + `commitImport` in `image-import.js`.**

  Add inside the `ImageImporter` class:

  ```javascript
      /**
       * Pure: turn session state into a commit plan.
       * @param {object} session
       * @returns {{ newEmployees: string[], commits: Array<{employeeName:string,year:number,month:number,date:Date,dateStr:string,share:number}>, skippedOutsideMonth: number }}
       */
      resolveImports(session) {
          const choiceByCandidate = new Map();
          for (const u of session.unknowns) {
              choiceByCandidate.set(u.candidate, u.choice);
          }

          const newEmployees = new Set();
          const commits = [];
          let skippedOutsideMonth = 0;

          for (const e of session.entries) {
              let resolved;
              if (session.resolvedNames.has(e.name)) {
                  resolved = session.resolvedNames.get(e.name);
              } else {
                  const choice = choiceByCandidate.get(e.name) || 'new';
                  if (choice === 'ignore') continue;
                  if (choice === 'new') {
                      resolved = e.name;
                      newEmployees.add(e.name);
                  } else if (choice.startsWith('assign:')) {
                      resolved = choice.slice('assign:'.length);
                  } else {
                      resolved = e.name;
                  }
              }

              const y = e.date.getFullYear();
              const m = e.date.getMonth() + 1;
              if (y !== session.targetYear || m !== session.targetMonth) {
                  skippedOutsideMonth++;
                  continue;
              }

              commits.push({
                  employeeName: resolved,
                  year: session.targetYear,
                  month: session.targetMonth,
                  date: e.date,
                  dateStr: e.dateStr,
                  share: e.share
              });
          }

          return { newEmployees: Array.from(newEmployees), commits, skippedOutsideMonth };
      }

      /**
       * Stage 3 to Stage 4. Resolve plan, persist via DataStorage, refresh UI.
       */
      async commitImport() {
          if (!this.session) return;
          const plan = this.resolveImports(this.session);

          for (const name of plan.newEmployees) {
              this.storage.addEmployee(name);
          }

          let okCount = 0;
          let errCount = 0;
          const affectedEmployees = new Set();
          for (const c of plan.commits) {
              try {
                  this.storage.addDuty(c.employeeName, c.year, c.month, c.date, c.share);
                  affectedEmployees.add(c.employeeName);
                  okCount++;
              } catch (e) {
                  console.error('commitImport: addDuty failed', e);
                  errCount++;
                  break; // per spec 13.4
              }
          }

          if (this.app) {
              if (plan.newEmployees.length > 0) {
                  this.app.loadEmployeeSelects();
                  this.app.loadEmployeeList();
              }
              this.app.loadDutiesForSelectedEmployee();

              if (errCount > 0) {
                  this.app.showToast(`Speicherfehler - Import unvollstaendig (${okCount} von ${plan.commits.length} erfolgreich)`, 'error');
              } else {
                  const msg = `${okCount} Dienste fuer ${affectedEmployees.size} Mitarbeiter importiert`;
                  this.app.showToast(msg, 'success');
                  if (plan.skippedOutsideMonth > 0) {
                      setTimeout(() => {
                          this.app.showToast(`${plan.skippedOutsideMonth} Eintraege ausserhalb des gewaehlten Monats uebersprungen`, 'info');
                      }, 1600);
                  }
              }
          }

          const doneSummary = document.getElementById('image-import-done-summary');
          if (doneSummary) {
              doneSummary.textContent = `${okCount} Dienste fuer ${affectedEmployees.size} Mitarbeiter importiert.`;
          }
          this.showStage(4);
          setTimeout(() => this.close(), 1500);
      }
  ```

- [ ] **Step 4: Re-run tests; confirm GREEN.**

  Reload `test.html`, run. Both `Resolve:` tests should be green.

- [ ] **Step 5: Manual verification — full commit path.**

  1. Open `http://localhost:8000/`, reload. In Console: same mock as Task 11 (two employees + monkey-patched `callVisionAPI`).
  2. Open Bild-Import, pick image, Erkennen. In Stage 3, click "Bestaetigen und Importieren".
  3. Modal switches to Stage 4 for ~1.5 s, then closes. Toast: "X Dienste fuer Y Mitarbeiter importiert".
  4. In Console verify: `app.storage.getEmployees()` includes Egon Olsen (because default for unknown was `new`). `app.storage.getDutiesForMonth('Max Mustermann', 2025, 11)` returns 2 duties.
  5. Switch to "Mitarbeiter verwalten" tab → Egon Olsen visible.

- [ ] **Step 6: Commit.**

  ```
  git add image-import.js test-suite.js
  git commit -m "feat(image-import): add resolveImports (pure) and commitImport persisting duties via DataStorage"
  ```

---

### Task 13: Settings-tab section "Bild-Import (KI)"

**Files:**
- Modify: `G:\Claude\Claude_tmp_dienstplan\index.html`
- Modify: `G:\Claude\Claude_tmp_dienstplan\app.js`

Steps:

- [ ] **Step 1: Add the settings section to `index.html`.**

  In `G:\Claude\Claude_tmp_dienstplan\index.html`, locate the start of the "Alle Daten löschen" section:

  ```html
                  <div class="settings-section">
                      <h3>Alle Daten löschen</h3>
                      <p class="text-warning">Achtung: Diese Aktion kann nicht rückgängig gemacht werden!</p>
                      <button id="clear-all-btn" class="btn btn-danger">Alle Daten löschen</button>
                  </div>
  ```

  Insert immediately BEFORE that block:

  ```html
                  <div class="settings-section">
                      <h3>Bild-Import (KI)</h3>
                      <p id="api-key-status" class="api-key-status-none">Kein Key hinterlegt</p>
                      <button id="set-api-key-btn" class="btn btn-secondary">Key aendern</button>
                      <button id="clear-api-key-btn" class="btn btn-danger">Key loeschen</button>

                      <div class="form-group" style="margin-top: 12px;">
                          <label for="api-model-select">Modell:</label>
                          <select id="api-model-select">
                              <option value="anthropic/claude-sonnet-4.6">Claude Sonnet 4.6</option>
                              <option value="google/gemini-2.5-pro">Gemini 2.5 Pro</option>
                              <option value="openai/gpt-4.1">GPT-4.1</option>
                          </select>
                      </div>

                      <p class="text-muted" style="margin-top: 10px;">
                          Hinweis: Der API-Key wird ausschliesslich lokal in Ihrem Browser gespeichert
                          und nur an OpenRouter (openrouter.ai) gesendet.
                      </p>
                  </div>
  ```

- [ ] **Step 2: Wire settings handlers in `app.js`.**

  In `G:\Claude\Claude_tmp_dienstplan\app.js`, locate the end of `setupEventListeners()`:

  ```javascript
          document.getElementById('clear-all-btn').addEventListener('click', () => this.clearAllData());
      }
  ```

  Replace with:

  ```javascript
          document.getElementById('clear-all-btn').addEventListener('click', () => this.clearAllData());

          // Bild-Import (KI) settings
          const setKeyBtn = document.getElementById('set-api-key-btn');
          if (setKeyBtn) setKeyBtn.addEventListener('click', () => this.setApiKeyFromPrompt());
          const clearKeyBtn = document.getElementById('clear-api-key-btn');
          if (clearKeyBtn) clearKeyBtn.addEventListener('click', () => this.clearApiKey());
          const modelSelect = document.getElementById('api-model-select');
          if (modelSelect) {
              modelSelect.value = this.storage.getApiModel();
              modelSelect.addEventListener('change', () => {
                  this.storage.setApiModel(modelSelect.value);
                  this.showToast(`Modell geaendert: ${modelSelect.options[modelSelect.selectedIndex].text}`, 'success');
              });
          }
          this.refreshApiKeyStatus();
      }
  ```

  Add the three helper methods immediately above `showToast(...)`:

  ```javascript
      /**
       * Update the API-key status line in Settings.
       */
      refreshApiKeyStatus() {
          const el = document.getElementById('api-key-status');
          if (!el) return;
          if (this.storage.getApiKey()) {
              el.textContent = 'API-Key gespeichert';
              el.className = 'api-key-status-ok';
          } else {
              el.textContent = 'Kein Key hinterlegt';
              el.className = 'api-key-status-none';
          }
      }

      setApiKeyFromPrompt() {
          const input = window.prompt('OpenRouter API-Key eingeben:', '');
          if (input === null) return;
          const trimmed = input.trim();
          if (!trimmed) return;
          this.storage.setApiKey(trimmed);
          this.refreshApiKeyStatus();
          this.showToast('API-Key gespeichert.', 'success');
      }

      clearApiKey() {
          if (!window.confirm('API-Key wirklich loeschen?')) return;
          this.storage.clearApiKey();
          this.refreshApiKeyStatus();
          this.showToast('API-Key geloescht.', 'info');
      }
  ```

  Also call `refreshApiKeyStatus()` when switching into the settings tab. In `switchTab(tabName)`, replace:

  ```javascript
          // Refresh data when switching to certain tabs
          if (tabName === 'employees') {
              this.loadEmployeeList();
          } else if (tabName === 'duties') {
              this.loadDutiesForSelectedEmployee();
          }
      }
  ```

  with:

  ```javascript
          // Refresh data when switching to certain tabs
          if (tabName === 'employees') {
              this.loadEmployeeList();
          } else if (tabName === 'duties') {
              this.loadDutiesForSelectedEmployee();
          } else if (tabName === 'settings') {
              this.refreshApiKeyStatus();
          }
      }
  ```

- [ ] **Step 3: Manual verification — Settings section works.**

  1. Open `http://localhost:8000/`. In Console: `localStorage.removeItem('dienstplan_openrouter_key')`. Reload.
  2. Click "Einstellungen" tab. Status line reads "Kein Key hinterlegt" (grey/italic).
  3. Click "Key aendern" → prompt. Type `sk-or-xyz` → submit. Toast "API-Key gespeichert.". Status line flips to "API-Key gespeichert" (green).
  4. Change model to "Gemini 2.5 Pro" → toast confirms. In Console: `app.storage.getApiModel() === 'google/gemini-2.5-pro'`.
  5. Reload page → model dropdown still shows "Gemini 2.5 Pro" (persisted).
  6. Click "Key loeschen" → confirm prompt. After OK: toast "API-Key geloescht.", status returns to "Kein Key hinterlegt".

- [ ] **Step 4: Commit.**

  ```
  git add index.html app.js
  git commit -m "feat(settings): add Bild-Import (KI) section with key management and model picker"
  ```

---

### Task 14: Error-handling polish (consolidate + verify via tests)

**Files:**
- Modify: `G:\Claude\Claude_tmp_dienstplan\test-suite.js`

Steps:

- [ ] **Step 1: Lock error strings via dedicated unit tests on `handleRecognitionError`.**

  All HTTP-error toasts and the parse-error toast were implemented in Task 10's `handleRecognitionError`. This task adds dedicated assertions to pin the strings.

  Append to `test-suite.js`:

  ```javascript
  // ============================================================================
  // ImageImporter Tests - Error toasts (Feature A)
  // ============================================================================

  runner.test('ImageImporter Error: 401 = "API-Key ungueltig"', (t) => {
      let capturedMsg = null;
      let capturedType = null;
      const fakeApp = {
          showToast: (m, type) => { capturedMsg = m; capturedType = type; },
          currentYear: 2025, currentMonth: 11,
          storage: { getEmployees: () => [] },
          holidayProvider: new HolidayProvider()
      };
      const importer = new ImageImporter(fakeApp);
      const err = Object.assign(new Error('x'), { name: 'OpenRouterError', status: 401 });
      importer.showStage = () => {};
      importer.handleRecognitionError(err);
      t.assertEqual(capturedMsg, 'API-Key ungueltig', 'Exakte Meldung');
      t.assertEqual(capturedType, 'error', 'Typ error');
  });

  runner.test('ImageImporter Error: 402 = "Limit erreicht oder Guthaben aufgebraucht"', (t) => {
      let capturedMsg = null;
      const fakeApp = { showToast: (m) => { capturedMsg = m; }, holidayProvider: new HolidayProvider() };
      const importer = new ImageImporter(fakeApp);
      importer.showStage = () => {};
      importer.handleRecognitionError(Object.assign(new Error('x'), { name: 'OpenRouterError', status: 402 }));
      t.assertEqual(capturedMsg, 'Limit erreicht oder Guthaben aufgebraucht', 'Exakte Meldung');
  });

  runner.test('ImageImporter Error: 429 = "Limit erreicht oder Guthaben aufgebraucht"', (t) => {
      let capturedMsg = null;
      const fakeApp = { showToast: (m) => { capturedMsg = m; }, holidayProvider: new HolidayProvider() };
      const importer = new ImageImporter(fakeApp);
      importer.showStage = () => {};
      importer.handleRecognitionError(Object.assign(new Error('x'), { name: 'OpenRouterError', status: 429 }));
      t.assertEqual(capturedMsg, 'Limit erreicht oder Guthaben aufgebraucht', 'Exakte Meldung');
  });

  runner.test('ImageImporter Error: 503 = Server-Fehler', (t) => {
      let capturedMsg = null;
      const fakeApp = { showToast: (m) => { capturedMsg = m; }, holidayProvider: new HolidayProvider() };
      const importer = new ImageImporter(fakeApp);
      importer.showStage = () => {};
      importer.handleRecognitionError(Object.assign(new Error('x'), { name: 'OpenRouterError', status: 503 }));
      t.assertTrue(capturedMsg.includes('Server-Fehler'), 'Enthaelt Server-Fehler');
      t.assertTrue(capturedMsg.includes('503'), 'Enthaelt Status');
  });

  runner.test('ImageImporter Error: TypeError (Offline) = "Keine Verbindung"', (t) => {
      let capturedMsg = null;
      const fakeApp = { showToast: (m) => { capturedMsg = m; }, holidayProvider: new HolidayProvider() };
      const importer = new ImageImporter(fakeApp);
      importer.showStage = () => {};
      importer.handleRecognitionError(new TypeError('Failed to fetch'));
      t.assertTrue(capturedMsg.includes('Keine Verbindung'), 'Offline-Meldung');
  });

  runner.test('ImageImporter Error: SyntaxError = "Erkennung fehlgeschlagen"', (t) => {
      let capturedMsg = null;
      const fakeApp = { showToast: (m) => { capturedMsg = m; }, holidayProvider: new HolidayProvider() };
      const importer = new ImageImporter(fakeApp);
      importer.showStage = () => {};
      importer.handleRecognitionError(new SyntaxError('Unexpected token'));
      t.assertTrue(capturedMsg.includes('Erkennung fehlgeschlagen'), 'Parse-Fehlermeldung');
  });
  ```

- [ ] **Step 2: Run tests; expect GREEN.**

  Reload `test.html`, click run. Six new "ImageImporter Error" tests should pass on first execution (the error-handling code already exists from Task 10).

- [ ] **Step 3: Commit.**

  ```
  git add test-suite.js
  git commit -m "test(image-import): pin error-toast strings for HTTP/parse/network errors"
  ```

---

### Task 15: Privacy notice in Stage 1 — verify wording

**Files:** (no code changes — the notice was added in Task 9)

Steps:

- [ ] **Step 1: Manual verification — privacy notice is visible.**

  1. Open `http://localhost:8000/`. Reload. Click Bild-Import button.
  2. In Stage 1, immediately under the heading, the text reads exactly:
     `Das Bild wird zur Erkennung an OpenRouter gesendet.`
  3. The text is grey, italic, font-size ~0.875rem (per `.privacy-notice` CSS in Task 9).
  4. If the wording differs, edit `index.html` and the `.privacy-notice` element. Otherwise no change needed.

- [ ] **Step 2: No commit required if no change.** If wording was wrong and needed an edit:

  ```
  git add index.html
  git commit -m "fix(image-import): correct privacy-notice wording in Stage 1"
  ```

---

### Task 16: PWA cache version bump

**Files:**
- Modify: `G:\Claude\Claude_tmp_dienstplan\sw.js`

Steps:

- [ ] **Step 1: Bump cache name and add `image-import.js`.**

  In `G:\Claude\Claude_tmp_dienstplan\sw.js`, replace the entire file content:

  ```javascript
  const CACHE_NAME = 'dienstplan-pro-v1';
  const ASSETS = [
    './',
    './index.html',
    './styles.css',
    './app.js',
    './calculator.js',
    './holidays.js',
    './storage.js'
  ];

  self.addEventListener('install', (e) => {
    e.waitUntil(
      caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
  });

  self.addEventListener('fetch', (e) => {
    e.respondWith(
      caches.match(e.request).then((response) => response || fetch(e.request))
    );
  });
  ```

  with:

  ```javascript
  const CACHE_NAME = 'dienstplan-pro-v3';
  const ASSETS = [
    './',
    './index.html',
    './styles.css',
    './app.js',
    './calculator.js',
    './holidays.js',
    './storage.js',
    './image-import.js'
  ];

  self.addEventListener('install', (e) => {
    e.waitUntil(
      caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
  });

  self.addEventListener('activate', (e) => {
    e.waitUntil(
      caches.keys().then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
    );
  });

  self.addEventListener('fetch', (e) => {
    e.respondWith(
      caches.match(e.request).then((response) => response || fetch(e.request))
    );
  });
  ```

  (The `activate` listener is added so old caches are evicted on version bump — without it, `dienstplan-pro-v1` would linger in the user's browser and the user could still serve stale assets.)

- [ ] **Step 2: Manual verification — old cache evicted.**

  1. Open `http://localhost:8000/`. In DevTools → Application → Service Workers → confirm a registered worker.
  2. Application → Cache Storage. Confirm only `dienstplan-pro-v3` exists (old `dienstplan-pro-v1` should be gone after the new worker activates).
  3. If both exist, click "Update on reload" + hard reload (Ctrl+Shift+R).
  4. Open Network panel → reload → confirm `image-import.js` is served (status 200 from SW after first load, from cache on subsequent loads).

- [ ] **Step 3: Commit.**

  ```
  git add sw.js
  git commit -m "chore(pwa): bump cache to v3, precache image-import.js, evict old caches on activate"
  ```

---

### Task 17: Final manual smoke test (real OpenRouter key, real image)

**Files:** none

> **REQUIRES USER INPUT AT EXECUTION TIME:**
> - A valid OpenRouter API key (`sk-or-v1-...`).
> - A real sample image: photo or screenshot of an Assistenzarzt-Dienstplan table for a known month (e.g. November 2025), with at least 3 employees and a mix of weekend / weekday duties.

Steps:

- [ ] **Step 1: Clean slate.**

  1. Open `http://localhost:8000/`. DevTools Console:
     ```javascript
     localStorage.clear();
     location.reload();
     ```
  2. After reload, add 2-3 employees in "Mitarbeiter verwalten" matching the names you expect in the image (deliberately misspell one to test fuzzy matching, e.g. add `Mueller` even though the image says `Müller`).
  3. In "Dienste eintragen", select the month/year matching the image.

- [ ] **Step 2: Trigger import.**

  1. Click Bild-Import button. Paste your real OpenRouter API key into the prompt.
  2. Modal opens on Stage 1. Pick the sample image. Thumbnail appears. Click "Erkennen".
  3. Stage 2 spinner. Wait 5-15 s.

- [ ] **Step 3: Verify Stage 3 contents.**

  - Expected employees from the image are grouped correctly under their resolved names.
  - The misspelled name appears in the unknowns box with "moeglicher Match: <existing>" hint.
  - Slot badges show correct colors: fr=orange, sa/so=red, weekday=grey.
  - Notes (if any) appear above.
  - Rows with dates outside the selected month are highlighted in pink with `(ausserhalb Monat)`.

- [ ] **Step 4: Confirm and verify persistence.**

  1. Click "Bestaetigen und Importieren". Toast confirms count.
  2. Modal closes after Stage 4.
  3. The duty list under each affected employee reflects the new entries.
  4. Switch to "Berechnung" tab → click "Berechnung durchfuehren" → numbers reflect the imported duties.

- [ ] **Step 5: Error path probes.**

  1. Settings → "Key loeschen". Trigger import → expect API-key prompt.
  2. Type a clearly invalid key (e.g. `sk-or-broken`). Pick image, Erkennen → expect Toast "API-Key ungueltig", modal returns to Stage 1.

- [ ] **Step 6: No commit (this is a verification task).**

---

## Self-review pass

### Spec coverage matrix

| Spec section | Implemented in task(s) |
|---|---|
| 1 Ziel / Problemstellung | Whole plan |
| 2 Out of Scope | N/A (boundaries respected by design) |
| 3 User Flow (4 Stages) | 8 (entry), 9 (Stage 1), 10 (Stage 2), 11 (Stage 3), 12 (Stage 4 + commit) |
| 3.1 Stage 1 — Upload, validation, privacy | 9, 15 |
| 3.2 Stage 2 — Processing, Cancel | 10 |
| 3.3 Stage 3 — Block A / B / C | 11 |
| 3.4 Stage 4 — Done + auto-close | 12 |
| 4 Architecture & file layout | 1 (skeleton + load order) |
| 4.3 Public API of `ImageImporter` | 1, 3-7, 9-12 |
| 5.1 Button in Duties tab | 8 |
| 5.2 Modal skeleton | 9 |
| 5.3 Settings section "Bild-Import (KI)" | 13 |
| 6.1 API-Key first-use prompt | 8 |
| 6.2 Subsequent usage (no re-prompt) | 8 |
| 6.3 Key only in Authorization header | 4 |
| 7 OpenRouter request shape, system prompt | 4 |
| 7.4 AbortController for Cancel | 10 |
| 8.1 Parsing (fence strip, brace slice) | 5 |
| 8.2 Schema validation (per-field rules) | 5 |
| 8.3 Month/Year consistency note | 11 (rendered in `renderPreview` notes box) |
| 8.4 Dedup of (name, date) | 10 |
| 9 Slot classification (`classify`) | 7 |
| 9.3 Independent duplication of classify | 7 |
| 9.4 Slot badges in preview | 9 (CSS), 11 (rendering) |
| 10 Name matching (normalize / fuzzy <= 2) | 7 |
| 10.3 Levenshtein inline | 6 |
| 11.1 Replace semantics (kept) | 12 (uses `addDuty` as-is) |
| 11.2 Iteration order: addEmployee then addDuty | 12 |
| 11.3 Target month = tab month | 12 (`skippedOutsideMonth`) |
| 12 Image preprocessing | 3 |
| 13 Error handling (HTTP, network, parse, storage) | 10 (`handleRecognitionError`), 12 (storage), 14 (tests) |
| 13.5 Empty entries handling | 10 |
| 14.1 New localStorage keys | 2 |
| 14.1 exportData/clearAll not extended | 2 (tests assert this) |
| 14.2 In-memory session shape | 8 (init), 10 (populate) |
| 15.1 API Key persistence tests | 2 |
| 15.2 Preprocessing tests | 3 |
| 15.3 Response Parsing tests | 5 |
| 15.4 Name Matching tests | 7 |
| 15.5 Conflict Handling (replace via `addDuty`) | 12 (existing storage test in repo + manual smoke) |
| 15.6 Edge cases (month mismatch, empty, dup) | 10, 11, 12 |
| 15.7 Storage round-trip (no key/model in export) | 2 |
| 16 Future work | Out of scope |
| 17 Open questions | Resolved or deferred |

### Placeholder scan

Searched the plan for `TBD`, `TODO`, `implement appropriate`, `similar to above`, `etc.` — none present.

### Type / name consistency

- `compressImage(file)` returns `{ blob, dataUrl, width, height }` (Task 3); consumed in `runRecognition` (Task 10) via `.dataUrl`. OK.
- `callVisionAPI(dataUrl, apiKey, modelId, signal)` returns a string (Task 4); consumed in `runRecognition` (Task 10). OK.
- `parseResponse(rawContent)` returns `{ month, year, entries, notes }` (Task 5); consumed in `runRecognition` (Task 10). OK.
- `levenshtein(a, b)` (Task 6) used by `matchNames` (Task 7). OK.
- `matchNames(extractedEntries, existingEmployees)` returns `{ matched, unknowns }` (Task 7); consumed in `runRecognition` (Task 10). OK.
- `classify(date)` (Task 7) used by `renderPreview` (Task 11). OK.
- `resolveImports(session)` returns `{ newEmployees, commits, skippedOutsideMonth }` (Task 12); consumed by `commitImport` (Task 12). OK.
- `DataStorage.addDuty(employeeName, year, month, date, share)` — verified against `storage.js` line 209. Used in `commitImport` (Task 12) as `addDuty(c.employeeName, c.year, c.month, c.date, c.share)`. OK.
- `DataStorage.addEmployee(name)` — verified against `storage.js` line 55. Used in `commitImport` (Task 12). OK.
- `app.showToast(message, type)`, `app.loadDutiesForSelectedEmployee()`, `app.loadEmployeeSelects()`, `app.loadEmployeeList()`, `app.currentMonth`, `app.currentYear` — all verified against `app.js`. OK.
- `HolidayProvider.isHoliday(date)` and `isDayBeforeHoliday(date)` — used in `classify` (Task 7); existing methods (referenced in `test-suite.js` HolidayProvider tests). OK.
- DOM IDs introduced and consistently referenced across HTML + JS edits: `open-image-import-btn` (Task 8), `image-import-modal`, `image-import-close-btn`, `image-import-dropzone`, `image-import-file-input`, `image-import-pick-btn`, `image-import-camera-input`, `image-import-camera-btn`, `image-import-thumb-wrap`, `image-import-thumb`, `image-import-thumb-name`, `image-import-thumb-size`, `image-import-cancel-1-btn`, `image-import-cancel-2-btn`, `image-import-cancel-3-btn`, `image-import-recognize-btn`, `image-import-confirm-btn`, `image-import-notes-box`, `image-import-unknowns-box`, `image-import-unknowns-list`, `image-import-preview-table`, `image-import-done-summary` (all added in Task 9); `set-api-key-btn`, `clear-api-key-btn`, `api-key-status`, `api-model-select` (Task 13). All IDs referenced in JS exist in the HTML edits of the same plan.
