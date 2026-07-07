/**
 * @file PdfManager.js
 * @description Helper module for cross-origin fetching of PDF binaries and
 *   asymmetric loading of the PDFLib library.
 *   Exports on the {@link app.Core.PdfManager} namespace.
 *
 * @requires pdf-lib.min.js — window.PDFLib (loaded via manifest)
 * @requires gm-compat.js  — GM_xmlhttpRequest (cross-origin fetch)
 *
 * @consumed-by FeaturePanels.js — template-based PDF generation
 */
(function () {
    const app = window.CM_App = window.CM_App || {};
    app.Core = app.Core || {};

    const PdfManager = {
        /**
         * Returns a reference to the globally loaded `PDFLib` library object.
         * Provided as an async accessor for consistent API usage even though
         * the library is synchronously available via the manifest script order.
         *
         * @async
         * @returns {Promise<Object>} The `window.PDFLib` namespace object.
         */
        async loadPdfLib() {
            return window.PDFLib;
        },

        /**
         * Returns a `chrome-extension://` URL for a bundled PDF template.
         * PDFs in `db/` are declared in `web_accessible_resources` so content
         * scripts can load them without network dependency or rate limiting.
         *
         * @param {string} filename - e.g. "L25.pdf", "S2FO.pdf", "S2DDS.pdf"
         * @returns {string} The extension-local absolute URL.
         */
        getPdfUrl(filename) {
            return chrome.runtime.getURL(`db/${filename}`);
        },

        /**
         * Fetches a PDF file as an `ArrayBuffer` from the given URL using
         * {@link GM_xmlhttpRequest} for cross-origin support.
         * Works with both remote URLs and local `chrome-extension://` URLs.
         *
         * @param {string} url - Absolute URL to the PDF resource.
         * @returns {Promise<ArrayBuffer>} Resolves with the raw PDF bytes.
         * @throws {Error} Rejects if the HTTP status is outside the 2xx–3xx range.
         */
        fetchPdfBytes(url) {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: "GET",
                    url: url,
                    responseType: 'arraybuffer',
                    onload: function (response) {
                        if (response.status >= 200 && response.status < 400) {
                            resolve(response.response);
                        } else {
                            reject(new Error(`PDF fetch failed: ${response.status} ${response.statusText}`));
                        }
                    },
                    onerror: reject
                });
            });
        }
    };

    app.Core.PdfManager = PdfManager;
})();
