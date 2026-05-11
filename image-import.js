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
