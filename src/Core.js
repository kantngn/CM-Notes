import { Themes, NoteThemes, applyTheme } from './config/Themes.js';
import './config/Styles.css';
import { Utils } from './core/Utils.js';
import { Scraper } from './core/Scraper.js';
import { WindowManager } from './core/WindowManager.js';
import { SSADataManager } from './core/SSADataManager.js';
import { PdfManager } from './core/PdfManager.js';
import { Taskbar } from './ui/Taskbar.js';

window.CM_App = window.CM_App || {};
window.CM_App.Core = {
    Themes,
    NoteThemes,
    Styles: {
        init: () => {
            applyTheme('Teal');
            console.warn('[Core.js] Styles.css injection warning: Styles should be handled externally by bundler pending ES6 refactoring.');
        },
        applyTheme
    },
    Scraper,
    Windows: WindowManager,
    SSADataManager,
    Taskbar,
    Utils,
    loadPdfLib: PdfManager.loadPdfLib,
    fetchPdfBytes: PdfManager.fetchPdfBytes
};

// ==========================================
// AUTO-TRIGGER SSD FORM SCRAPING
// ==========================================
const initSSDScraping = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const clientId = urlParams.get('clientId');
    const formUUID = urlParams.get('uuid');

    // Check if this is an SSD form page (look for the UUID and formUUID combo or specific page indicators)
    if (formUUID === 'a0UfL000002vlqfUAA' && clientId) {
        if (document.readyState === 'loading') return;
        console.log("[SSD Auto-Scraper] SSD Form detected. Starting automatic scrape...");

        (async () => {
            try {
                const scrapedData = await Scraper.getFullSSDData();

                if (scrapedData.ssn || scrapedData.dob) {
                    GM_setValue(`cn_form_data_${clientId}`, scrapedData);
                    console.log("[SSD Auto-Scraper] Data scraped and saved:", scrapedData);

                    if (GM_getValue('sn_ssd_autoclose', false)) {
                        window.close();
                    }
                }
            } catch (e) {
                console.error("[SSD Auto-Scraper] Error during scraping:", e);
            }
        })();
    }
};

// Trigger on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSSDScraping);
} else {
    initSSDScraping();
}