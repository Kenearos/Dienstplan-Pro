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
}

// Verbatim system prompt — German with Umlaute (per spec §7.3).
ImageImporter.SYSTEM_PROMPT = `Du extrahierst Dienstpläne aus Tabellenbildern für eine deutsche Klinik.

Regeln:
- Die Tabelle listet pro Datum die diensthabenden Ärzte.
- Es gibt Assistenzärzte und Oberärzte. Extrahiere NUR Assistenzärzte. Oberärzte werden ignoriert.
- Wenn du nicht sicher bist, ob ein Name zu einem Assistenzarzt oder Oberarzt gehört, vermerke dies in \`notes\`.
- Wenn in einer Zelle NUR EIN Name steht: share = 1.0 für diesen Arzt.
- Wenn in einer Zelle ZWEI Namen stehen: share = 0.5 für jeden der beiden.
- Datum stets im ISO-Format YYYY-MM-DD.
- Wenn das Bild einen Monatstitel zeigt (z.B. „November 2025"), gib \`month\` (1–12) und \`year\` (vierstellig) in der Antwort an. Sonst null.
- Wenn ein Name unklar zu lesen ist, übernimm deinen besten Ratevorschlag und vermerke es in \`notes\`.

Antworte STRIKT in diesem JSON-Schema und sonst nichts:
{
  "month": number | null,
  "year": number | null,
  "entries": [
    { "name": "string", "date": "YYYY-MM-DD", "share": 1.0 | 0.5 }
  ],
  "notes": ["string", ...]
}`;

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
