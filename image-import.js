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
