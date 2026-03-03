/**
 * Content Script Entry Point – KD CM Notes Chrome Extension
 * 
 * This replaces the Tampermonkey index.js. It runs after all modules
 * are loaded (gm-compat.js loads first and provides GM_* shims).
 * 
 * CSS is injected via the manifest's content_scripts.css array.
 */
(function () {
    'use strict';

    // Exit early if running inside any iframe
    if (window.self !== window.top) return;

    // Wait for the GM_* shim cache to be ready, then initialize
    GM_ready().then(() => {
        if (window.CM_App && window.CM_App.AppObserver) {
            window.CM_App.AppObserver.init();
        } else {
            console.error("[CM Notes] CM_App or its modules not found. Check content_scripts loading order.");
        }
    });

    /**
     * @typedef {Object} ChromeCommandMessage
     * @property {'chrome_command'} type - Message type string indicating a command forwarded from the background script.
     * @property {'toggle-client-note'|'open-fo-form'|'open-dds-form'|'toggle-dashboard'} command - The specific command identifier.
     */

    /**
     * Listens for `chrome_command` messages forwarded from `background.js`.
     * Interacts with `AppObserver`, `ClientNote`, `WindowManager`, `ContactForms`, and `Dashboard` to trigger UI actions.
     * 
     * @param {ChromeCommandMessage|Object} message - The message object.
     * @param {chrome.runtime.MessageSender} sender - Details about the sender of the message.
     * @param {function} sendResponse - Callback function to send a response.
     */
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type !== 'chrome_command') return;
        const app = window.CM_App;
        if (!app) return;

        switch (message.command) {
            case 'toggle-client-note':
                if (app.AppObserver) {
                    const clientId = app.AppObserver.getClientId();
                    if (clientId) {
                        if (!document.getElementById('sn-client-note')) {
                            app.Features.ClientNote.create(clientId);
                        } else {
                            app.Core.Windows.toggle('sn-client-note');
                        }
                    }
                }
                break;
            case 'open-fo-form':
                if (app.Tools && app.Tools.ContactForms) app.Tools.ContactForms.create('FO');
                break;
            case 'open-dds-form':
                if (app.Tools && app.Tools.ContactForms) app.Tools.ContactForms.create('DDS');
                break;
            case 'toggle-dashboard':
                if (app.Tools && app.Tools.Dashboard) app.Tools.Dashboard.toggle();
                break;
        }
    });
})();
