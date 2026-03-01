/**
 * Background Service Worker for KD CM Notes Chrome Extension
 * 
 * Handles:
 * 1. GM_openInTab requests from content scripts
 * 2. chrome.commands forwarding to content scripts
 */

// ── Tab opening (GM_openInTab shim) ────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GM_openInTab') {
        chrome.tabs.create({
            url: message.url,
            active: message.active !== false,
            index: sender.tab ? sender.tab.index + 1 : undefined
        });
        sendResponse({ success: true });
    }
});

// ── chrome.commands → content script forwarding ────────────────
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
