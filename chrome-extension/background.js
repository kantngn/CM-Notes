/**
 * Background Service Worker for KD CM Notes Chrome Extension
 * 
 * Handles:
 * 1. GM_openInTab requests from content scripts
 * 2. chrome.commands forwarding to content scripts
 */

// Combined message listener for all actions from content scripts.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Handler for GM_openInTab shim
    if (message.type === 'GM_openInTab') {
        chrome.tabs.create({
            url: message.url,
            active: message.active !== false,
            index: sender.tab ? sender.tab.index + 1 : undefined
        });
        sendResponse({ success: true }); // Synchronous response
        return; // Exit after handling
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

    // If no action matches, the port will close, which is fine if no response is expected.
});

// ── chrome.commands → content script forwarding ────────────────
if (chrome.commands) {
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
