/**
 * @file gm-compat.js
 * @description Provides a compatibility layer that shims Tampermonkey / Greasemonkey
 *   GM_* APIs using `chrome.storage.local` with an in-memory write-through cache.
 *   The cache is loaded once at startup; all subsequent reads are synchronous.
 *   Writes go to both cache and chrome.storage.local (fire-and-forget).
 *
 * @requires background.js — [Message: "GM_openInTab"] for tab opening
 *
 * @consumed-by content.js, AppObserver.js, Themes.js, WindowManager.js,
 *   SSADataManager.js, PdfManager.js, Dashboard.js, BackupManager.js,
 *   GlobalNotes.js, Scheduler.js, ContactForms.js, SSDFormViewer.js,
 *   MedicationPanel.js, FeaturePanels.js, Taskbar.js, TaskAutomation.js,
 *   ClientNote.js, InfoPanel.js, SSAPanel.js
 */
(function () {
    'use strict';

    // ── In-memory cache ────────────────────────────────────────────
    const _cache = {};
    let _cacheReady = false;
    const _readyCallbacks = [];

    // Load entire storage into cache on startup
    chrome.storage.local.get(null, (items) => {
        Object.assign(_cache, items || {});
        _cacheReady = true;
        _readyCallbacks.forEach(cb => cb());
        _readyCallbacks.length = 0;
    });

    /**
     * Returns a promise that resolves when the in-memory cache has been
     * fully populated from `chrome.storage.local`.
     * `content.js` must await this before initializing any modules.
     *
     * @returns {Promise<void>}
     */
    window.GM_ready = function () {
        return new Promise(resolve => {
            if (_cacheReady) return resolve();
            _readyCallbacks.push(resolve);
        });
    };

    // ── Storage: Get / Set / Delete / List ─────────────────────────

    /**
     * Synchronously retrieves a value from the in-memory cache.
     *
     * @param {string} key          - Storage key to look up.
     * @param {*}      defaultValue - Value returned when the key is absent.
     * @returns {*} The cached value, or `defaultValue` if not found.
     */
    window.GM_getValue = function (key, defaultValue) {
        if (key in _cache) {
            return _cache[key];
        }
        return defaultValue;
    };

    /**
     * Writes a value to both the in-memory cache and `chrome.storage.local`.
     * The storage write is fire-and-forget; errors (e.g. invalidated
     * extension context) are silently caught.
     *
     * @param {string} key   - Storage key.
     * @param {*}      value - Value to store (must be JSON-serialisable).
     */
    window.GM_setValue = function (key, value) {
        _cache[key] = value;
        try {
            chrome.storage.local.set({ [key]: value });
        } catch (e) {
            // Ignore "Extension context invalidated" errors
        }
    };

    /**
     * Removes a key from both the in-memory cache and `chrome.storage.local`.
     *
     * @param {string} key - Storage key to delete.
     */
    window.GM_deleteValue = function (key) {
        delete _cache[key];
        chrome.storage.local.remove(key);
    };

    /**
     * Returns an array of all keys currently held in the in-memory cache.
     *
     * @returns {string[]} Array of storage key names.
     */
    window.GM_listValues = function () {
        return Object.keys(_cache);
    };

    // ── Style injection ────────────────────────────────────────────

    /**
     * Injects a `<style>` element with the given CSS text into the document head.
     *
     * @param {string} css - CSS string to inject.
     * @returns {HTMLStyleElement} The created style element.
     */
    window.GM_addStyle = function (css) {
        const style = document.createElement('style');
        style.textContent = css;
        (document.head || document.documentElement).appendChild(style);
        return style;
    };

    /**
     * Stub provided for Tampermonkey API compatibility.
     * Not used in Chrome Extension context (CSS is injected via manifest).
     *
     * @param {string} _name - Resource name (ignored).
     * @returns {string} Always returns an empty string.
     */
    window.GM_getResourceText = function (_name) {
        return '';
    };

    // ── Clipboard ──────────────────────────────────────────────────

    /**
     * Copies text to the system clipboard using the Clipboard API,
     * falling back to a hidden `<textarea>` + `execCommand('copy')`.
     *
     * @param {string} text - The text to copy to the clipboard.
     */
    window.GM_setClipboard = function (text) {
        navigator.clipboard.writeText(text).catch(err => {
            console.warn('[GM_compat] Clipboard write failed:', err);
            // Fallback: textarea copy
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.cssText = 'position:fixed;left:-9999px;';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            ta.remove();
        });
    };

    // ── Tab opening (via background service worker) ────────────────

    /**
     * Opens a URL in a new browser tab by sending a message to the
     * background service worker (`background.js`).
     *
     * @param {string} url                  - URL to open.
     * @param {Object|boolean} [options]    - Options object or legacy boolean.
     * @param {boolean}        [options.active=true] - Whether the new tab should be active.
     */
    window.GM_openInTab = function (url, options) {
        const active = (!options || typeof options !== 'object') ? true : options.active !== false;
        chrome.runtime.sendMessage({
            type: 'GM_openInTab',
            url: url,
            active: active
        });
    };

    // ── Cross-origin HTTP (via fetch) ──────────────────────────────

    /**
     * @typedef {Object} GMXmlHttpRequestDetails
     * @property {string}   [method='GET']      - HTTP method.
     * @property {string}   url                 - Request URL.
     * @property {Object}   [headers]           - Request headers.
     * @property {*}        [data]              - Request body.
     * @property {string}   [responseType]      - Expected response type ('arraybuffer' | text).
     * @property {function} [onload]            - Success callback receiving a response object.
     * @property {function} [onerror]           - Error callback.
     */

    /**
     * @typedef {Object} GMXmlHttpResponse
     * @property {number} status          - HTTP status code.
     * @property {string} statusText      - HTTP status text.
     * @property {string} responseText    - Response body as text (empty for arraybuffer).
     * @property {string|ArrayBuffer} response - Raw response data.
     * @property {string} responseHeaders - Response headers as CRLF-delimited string.
     * @property {string} finalUrl        - Final URL after redirects.
     */

    /**
     * Cross-origin HTTP request shim using the Fetch API.
     * Emulates the Tampermonkey `GM_xmlhttpRequest` interface.
     *
     * @param {GMXmlHttpRequestDetails} details - Request configuration.
     */
    window.GM_xmlhttpRequest = function (details) {
        const fetchOptions = {
            method: details.method || 'GET',
            headers: details.headers || {}
        };

        if (details.data) {
            fetchOptions.body = details.data;
        }

        fetch(details.url, fetchOptions)
            .then(async (response) => {
                let responseData;
                if (details.responseType === 'arraybuffer') {
                    responseData = await response.arrayBuffer();
                } else {
                    responseData = await response.text();
                }

                const result = {
                    status: response.status,
                    statusText: response.statusText,
                    responseText: typeof responseData === 'string' ? responseData : '',
                    response: responseData,
                    responseHeaders: [...response.headers.entries()]
                        .map(([k, v]) => `${k}: ${v}`).join('\r\n'),
                    finalUrl: response.url
                };

                if (details.onload) details.onload(result);
            })
            .catch((error) => {
                if (details.onerror) details.onerror(error);
            });
    };

    // ── Value Change Listeners ─────────────────────────────────────
    // Emulates GM_addValueChangeListener / GM_removeValueChangeListener
    // using chrome.storage.onChanged events.

    let _listenerIdCounter = 0;
    const _valueListeners = {};

    /**
     * Registers a callback that fires whenever the specified storage key
     * changes (via `chrome.storage.onChanged`).
     *
     * @param {string}   key      - Storage key to observe.
     * @param {function(string, *, *, boolean): void} callback -
     *   Called with `(key, oldValue, newValue, remote)`. `remote` is
     *   always `true` because changes are dispatched from the storage event.
     * @returns {number} A unique listener ID for use with {@link GM_removeValueChangeListener}.
     */
    window.GM_addValueChangeListener = function (key, callback) {
        const id = ++_listenerIdCounter;
        _valueListeners[id] = { key, callback };
        return id;
    };

    /**
     * Unregisters a previously registered value-change listener.
     *
     * @param {number} listenerId - ID returned by {@link GM_addValueChangeListener}.
     */
    window.GM_removeValueChangeListener = function (listenerId) {
        delete _valueListeners[listenerId];
    };

    // Single chrome.storage.onChanged handler dispatches to registered listeners
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local') return;

        for (const key in changes) {
            const oldValue = changes[key].oldValue;
            const newValue = changes[key].newValue;

            // Update cache
            if (newValue === undefined) {
                delete _cache[key];
            } else {
                _cache[key] = newValue;
            }

            // Dispatch to listeners
            for (const id in _valueListeners) {
                const listener = _valueListeners[id];
                if (listener.key === key) {
                    // remote=true since chrome.storage.onChanged fires for changes from other contexts
                    listener.callback(key, oldValue, newValue, true);
                }
            }
        }
    });

})();
