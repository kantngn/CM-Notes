/**
 * GM_* Compatibility Shim for Chrome Extension
 * 
 * Provides drop-in replacements for Tampermonkey GM_* APIs using
 * chrome.storage.local with an in-memory write-through cache.
 * 
 * The cache is loaded once at init, then all reads are synchronous.
 * Writes go to both cache and chrome.storage.local (fire-and-forget).
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
     * Returns a promise that resolves when the cache is loaded.
     * Content.js must await this before initializing modules.
     */
    window.GM_ready = function () {
        return new Promise(resolve => {
            if (_cacheReady) return resolve();
            _readyCallbacks.push(resolve);
        });
    };

    // ── Storage: Get / Set / Delete / List ─────────────────────────

    window.GM_getValue = function (key, defaultValue) {
        if (key in _cache) {
            return _cache[key];
        }
        return defaultValue;
    };

    window.GM_setValue = function (key, value) {
        _cache[key] = value;
        try {
            chrome.storage.local.set({ [key]: value });
        } catch (e) {
            // Ignore "Extension context invalidated" errors
        }
    };

    window.GM_deleteValue = function (key) {
        delete _cache[key];
        chrome.storage.local.remove(key);
    };

    window.GM_listValues = function () {
        return Object.keys(_cache);
    };

    // ── Style injection ────────────────────────────────────────────

    window.GM_addStyle = function (css) {
        const style = document.createElement('style');
        style.textContent = css;
        (document.head || document.documentElement).appendChild(style);
        return style;
    };

    /**
     * Not used in Chrome Extension context (CSS is injected via manifest),
     * but provided for compatibility if called.
     */
    window.GM_getResourceText = function (_name) {
        return '';
    };

    // ── Clipboard ──────────────────────────────────────────────────

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

    window.GM_openInTab = function (url, options) {
        const active = (!options || typeof options !== 'object') ? true : options.active !== false;
        chrome.runtime.sendMessage({
            type: 'GM_openInTab',
            url: url,
            active: active
        });
    };

    // ── Cross-origin HTTP (via fetch) ──────────────────────────────

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

    window.GM_addValueChangeListener = function (key, callback) {
        const id = ++_listenerIdCounter;
        _valueListeners[id] = { key, callback };
        return id;
    };

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
