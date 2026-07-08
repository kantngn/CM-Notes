/**
 * Background Service Worker for KD CM Notes Chrome Extension
 * 
 * Handles:
 * 1. GM_openInTab requests from content scripts
 * 2. chrome.commands forwarding to content scripts
 */

/**
 * @typedef {Object} GMOpenInTabMessage
 * @property {'GM_openInTab'} type - Message type originating from `gm-compat.js`
 * @property {string} url - The URL to open in a new tab
 * @property {boolean} [active] - Whether the new tab should become the active tab
 */

/**
 * @typedef {Object} CloseTabMessage
 * @property {'CLOSE_TAB'} type - Message type to close a specific tab
 * @property {number} tabId - The ID of the tab to close
 */

/**
 * @typedef {Object} DownloadFileMessage
 * @property {'DOWNLOAD_FILE'} action - Action to download a file
 * @property {string} url - The URL of the file to download
 * @property {string} filename - The suggested filename for the download
 */

/**
 * Combined message listener for all actions from content scripts.
 * Interacts with `gm-compat.js`, `FeaturePanels.js`, `InfoPanel.js`, and `content.js`.
 * 
 * @param {GMOpenInTabMessage|CloseTabMessage|DownloadFileMessage|Object} message - The message object received from a content script.
 * @param {chrome.runtime.MessageSender} sender - Details about the sender of the message.
 * @param {function(Object): void} sendResponse - Callback function to send a response back to the sender.
 * @returns {boolean|void} Returns `true` to keep the message channel open for asynchronous responses.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Handler for GM_openInTab shim
    if (message.type === 'GM_openInTab') {
        chrome.tabs.create({
            url: message.url,
            active: message.active !== false,
            index: sender.tab ? sender.tab.index + 1 : undefined
        }, (tab) => {
            sendResponse({ success: true, tabId: tab.id });
        });
        return true; // Return true to indicate you will send a response asynchronously.
    }

    if (message.type === 'CLOSE_TAB') {
        if (message.tabId) {
            chrome.tabs.remove(message.tabId);
        }
        sendResponse({ success: true });
        return;
    }

    // Handler for file downloads
    if (message.action === 'DOWNLOAD_FILE') {
        chrome.downloads.download({
            url: message.url,
            filename: message.filename,
            saveAs: false // Set to true if you want the "Save As" dialog to appear
        }, (downloadId) => {
            // The download is asynchronous, sendResponse is called in the callback.
            if (chrome.runtime.lastError) {
                console.error("Download error:", chrome.runtime.lastError);
                sendResponse({ error: chrome.runtime.lastError.message });
            } else {
                sendResponse({ downloadId });
            }
        });
        return true; // Return true to indicate you will send a response asynchronously.
    }

    if (message.type === 'OPEN_SCRAPER_WINDOW') {
        chrome.windows.create({
            url: message.url,
            type: 'popup',
            width: 1,
            height: 1,
            left: 0,
            top: 0,
            focused: false
        }, (win) => {
            if (chrome.runtime.lastError || !win) {
                console.error("[Background] Window create error:", chrome.runtime.lastError ? chrome.runtime.lastError.message : "Unknown error");
                sendResponse({ success: false, error: chrome.runtime.lastError ? chrome.runtime.lastError.message : "Window creation failed" });
            } else {
                sendResponse({ success: true, windowId: win.id });
            }
        });
        return true;
    }

    if (message.type === 'CLOSE_WINDOW') {
        if (message.windowId) {
            chrome.windows.remove(message.windowId).catch((err) => {
                // Window was already closed by the other racing handler.
                // This is expected — no need to propagate.
                console.debug("[Background] CLOSE_WINDOW: window already closed", err.message);
            });
        }
        sendResponse({ success: true });
        return;
    }

    // ── Google Drive OAuth ────────────────────────────────────
    if (message.type === 'GET_AUTH_TOKEN') {
        const interactive = message.interactive !== false;
        try {
            chrome.identity.getAuthToken({ interactive: interactive }, (token) => {
                if (chrome.runtime.lastError) {
                    console.error("[Background] getAuthToken error:", chrome.runtime.lastError.message);
                    sendResponse({ success: false, error: chrome.runtime.lastError.message });
                } else {
                    sendResponse({ success: true, token: token });
                }
            });
        } catch (err) {
            sendResponse({ success: false, error: err.message });
        }
        return true; // Async response
    }

    if (message.type === 'REMOVE_CACHED_AUTH') {
        try {
            chrome.identity.getAuthToken({ interactive: false }, (token) => {
                if (token) {
                    chrome.identity.removeCachedAuthToken({ token: token }, () => {
                        // Also try to revoke it
                        fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`)
                            .catch(() => {});
                        sendResponse({ success: true });
                    });
                } else {
                    sendResponse({ success: true }); // Nothing to revoke
                }
            });
        } catch (err) {
            sendResponse({ success: false, error: err.message });
        }
        return true; // Async response
    }

    // If no action matches, the port will close, which is fine if no response is expected.
});

// ── chrome.commands → content script forwarding ────────────────
if (chrome.commands) {
    /**
     * Listens for keyboard commands registered in `manifest.json` and forwards them 
     * as `chrome_command` messages to the active tab's `content.js` script.
     * 
     * @param {string} command - The name of the triggered command.
     */
    chrome.commands.onCommand.addListener((command) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    type: 'chrome_command',
                    command: command
                });
            }
        });
    });
}

// ── iFax alarm: background IS the smart polling timer ────────────────
// The content script controls the alarm interval dynamically:
//   sn_ifax_start_polling  → creates/updates the alarm at the requested interval
//   sn_ifax_stop_polling   → clears the alarm
// Each alarm tick sends sn_ifax_check to all Outlook tabs — the content
// script handles phase transitions (fast→slow→stop) from the tick handler.
const IFAX_ALARM_NAME = 'sn_ifax_check_alarm';

chrome.runtime.onInstalled.addListener(() => {
    // ── Context menu: Call selected number ──
    chrome.contextMenus.create({
        id: 'sn-call-number',
        title: 'Call %s',
        contexts: ['selection']
    });

    // ── Broadcast reload signal to all open tabs ──
    const manifest = chrome.runtime.getManifest();
    chrome.tabs.query({
        url: ["https://*.lightning.force.com/*", "https://*.my.site.com/*"]
    }, (tabs) => {
        for (const tab of tabs) {
            chrome.tabs.sendMessage(tab.id, {
                type: 'EXTENSION_RELOADED',
                version: manifest.version,
                time: Date.now()
            }).catch(() => { /* tab doesn't have content script */ });
        }
    });
});

/**
 * Listen for content script commands to start/stop the polling alarm.
 * The alarm period is managed entirely by the content script's smart
 * polling phase logic — no fixed 2-min default alarm.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'sn_ifax_start_polling') {
        const interval = message.intervalMinutes || 3;
        chrome.alarms.create(IFAX_ALARM_NAME, { periodInMinutes: interval });
        console.log(`[Background] iFax polling started: every ${interval} min`);
        sendResponse({ success: true });
    } else if (message.action === 'sn_ifax_stop_polling') {
        chrome.alarms.clear(IFAX_ALARM_NAME, () => {
            console.log('[Background] iFax polling stopped.');
        });
        sendResponse({ success: true });
    }
});

/**
 * On each alarm tick, find the Outlook tab and tell it to check for iFax emails.
 */
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== IFAX_ALARM_NAME) return;

    chrome.tabs.query(
        { url: ['https://outlook.cloud.microsoft/mail/*', 'https://outlook.live.com/*', 'https://outlook.office.com/*', 'https://outlook.office365.com/*'] },
        (tabs) => {
            if (!tabs || tabs.length === 0) {
                console.debug('[Background] No Outlook tab found for iFax alarm.');
                return;
            }
            // Send to ALL matching Outlook tabs
            for (const tab of tabs) {
                chrome.tabs.sendMessage(tab.id, { action: 'sn_ifax_check' })
                    .catch(() => {
                        // Tab may not have content script loaded yet — this is expected
                    });
            }
        }
    );
});

// ── Context menu: Call selected number ─────────────────────────
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== 'sn-call-number') return;
    if (!info.selectionText) return;

    const digits = info.selectionText.replace(/\D/g, '');
    if (digits.length < 7) {
        console.debug('[Background] Selected text is not a valid phone number:', info.selectionText);
        return;
    }

    // Tell the content script to simulate a click on a tel: link.
    // This avoids Chrome's external-protocol permission prompt.
    if (tab && tab.id) {
        chrome.tabs.sendMessage(tab.id, { type: 'CALL_NUMBER', number: digits })
            .catch(() => {
                // Fallback if content script isn't reachable
                chrome.tabs.create({ url: 'tel:' + digits, active: false });
            });
    }
});

// ── Capture the print-template page for receipt PDF generation ────
// Opens the print template in a popup window at a controlled size
// (850×900) so the screenshot captures the content at the right scale
// for embedding into a US Letter PDF (612×792).
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'CAPTURE_PRINT_PAGE') {
        (async () => {
            try {
                await chrome.storage.local.set({ 'sn_print_html': { html: message.html, title: message.title } });

                // Open a popup window in the far corner so the content renders
                // at the right scale for capture, without disturbing the user.
                const win = await chrome.windows.create({
                    url: chrome.runtime.getURL('src/print-template.html?capture=1'),
                    type: 'popup',
                    width: 820,
                    height: 900,
                    left: -2000,
                    top: -2000,
                    focused: false
                });
                const tabId = win.tabs[0].id;

                await new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => reject(new Error('Timeout waiting for print tab to load')), 15000);
                    chrome.tabs.onUpdated.addListener(function listener(id, info) {
                        if (id === tabId && info.status === 'complete') {
                            chrome.tabs.onUpdated.removeListener(listener);
                            clearTimeout(timeout);
                            setTimeout(resolve, 1500);
                        }
                    });
                });

                const dataUrl = await chrome.tabs.captureVisibleTab(win.id, { format: 'png' });
                await chrome.windows.remove(win.id);
                chrome.storage.local.remove('sn_print_html');

                console.log("[Background] ✅ Print page captured successfully.");
                sendResponse({ success: true, dataUrl });
            } catch (err) {
                console.error("[Background] Print capture error:", err);
                sendResponse({ success: false, error: err.message });
            }
        })();
        return true;
    }
});
