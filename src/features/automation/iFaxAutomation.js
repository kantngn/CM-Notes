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
                // Auto-run after 500ms to allow page to settle
                setTimeout(() => {
                    this.run();
                    this._showNotificationBar();
                }, 500);
            }
        },

        /**
         * Shows a dismissible notification bar at the bottom of the iFax page
         * with client name, fax type, and target + fax number.
         */
        _showNotificationBar() {
            const clientName = GM_getValue('sn_temp_fax_client_name', '');
            const faxLabel   = GM_getValue('sn_temp_fax_label', 'Fax');
            const target     = GM_getValue('sn_temp_fax_target', 'SSA/DDS');
            const faxNum     = GM_getValue('sn_temp_fax_number', '');

            if (!clientName && !faxNum) return;

            const bar = document.createElement('div');
            bar.id = 'sn-ifax-notification';
            bar.style.cssText = `
                position: fixed;
                bottom: 0;
                left: 0;
                right: 0;
                z-index: 999999;
                background: #1a1a2e;
                color: #fff;
                font-size: 14px;
                font-family: 'Segoe UI', Arial, sans-serif;
                padding: 12px 20px;
                text-align: center;
                cursor: pointer;
                box-shadow: 0 -4px 12px rgba(0,0,0,0.3);
                letter-spacing: 0.3px;
                transition: opacity 0.3s ease;
            `;
            bar.textContent = `${clientName} - ${faxLabel} - To ${target}: ${faxNum}`;
            bar.title = 'Click to dismiss';
            bar.onclick = () => {
                bar.style.opacity = '0';
                setTimeout(() => bar.remove(), 300);
            };
            document.body.appendChild(bar);
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
            script.onerror = function() {
                console.error("[CM-Notes] Failed to inject script. Ensure 'src/features/automation/iFaxinjection.js' is in manifest.json web_accessible_resources.");
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
