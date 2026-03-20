/**
 * @file iFaxAutomation.js
 * @description Handles form automation for iFax.pro.
 *   Injects a control button to autofill Selectize.js fields using provided logic.
 *   Designed to run in a standalone popup window initiated by the main extension.
 */
(function () {
    const app = window.CM_App = window.CM_App || {};
    app.Automation = app.Automation || {};

    const iFaxAutomation = {
        init() {
            // Safety check for correct domain/path
            if (window.location.href.includes('ifax.pro/sent/create')) {
                // Auto-run after 3 seconds to allow page to settle
                setTimeout(() => {
                    this.run();
                }, 500);
            }
        },

        /**
         * Executes the verified automation logic for Selectize.js fields.
         */
        run() {
            console.log("[CM-Notes] Starting fax form automation...");

            // Retrieve data in the isolated content script context
            const faxNum = GM_getValue('sn_temp_fax_number', '');
            const email = GM_getValue('sn_global_email', '');

            // Inject the web-accessible script resource to bypass CSP inline-script restrictions
            const script = document.createElement('script');
            script.src = chrome.runtime.getURL('src/features/automation/iFaxinjection.js');
            script.setAttribute('data-fax-num', faxNum);
            script.setAttribute('data-email', email);
            
            script.onload = function() {
                this.remove();
            };
            (document.head || document.documentElement).appendChild(script);
        }
    };

    app.Automation.iFaxAutomation = iFaxAutomation;

    // Initialize immediately
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => iFaxAutomation.init());
    } else {
        iFaxAutomation.init();
    }
})();
