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
