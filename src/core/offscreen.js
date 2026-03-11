/**
 * @file offscreen.js
 * @description Headless document to host the SSD App form for background scraping.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'START_SCRAPE') {
        const iframe = document.getElementById('scraper-iframe');
        if (iframe) {
            iframe.src = message.url;
            sendResponse({ success: true });
        }
    }
});
