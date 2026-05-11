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
