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
            
            script.onload = () => {
                script.remove();
                // After injection script fills fields, check for pending blob to auto-upload
                setTimeout(() => this._checkPendingUpload(), 1000);
            };
            script.onerror = function() {
                console.error("[CM-Notes] Failed to inject script. Ensure 'src/features/automation/iFaxinjection.js' is in manifest.json web_accessible_resources.");
                this.remove();
            };
            (document.head || document.documentElement).appendChild(script);
        },

        /**
         * Checks for a pending PDF blob stored by FaxPanel and auto-uploads it.
         * Runs the two-step upload + native form submission sequence.
         */
        async _checkPendingUpload() {
            const pendingUpload = GM_getValue('sn_fax_pending_upload', null);
            if (!pendingUpload || !pendingUpload.pdfBase64) return;

            console.log("[CM-Notes] Found pending PDF upload, starting auto-upload...");

            try {
                // Convert base64 data URI back to Blob
                const response = await fetch(pendingUpload.pdfBase64);
                const blob = await response.blob();

                // Run the two-step upload + form submission
                await this._automateIfaxUpload(blob);

                // Clean up pending upload (only reached if form submit somehow doesn't navigate)
                GM_setValue('sn_fax_pending_upload', null);
            } catch (err) {
                console.error("[CM-Notes] Auto-upload failed:", err);
                // Don't clean up — let user retry manually
            }
        },

        /**
         * Two-step iFax upload: (1) XHR upload blob → get uid, (2) native form submit to create job.
         * @param {Blob} generatedPdfBlob - The PDF blob to upload
         */
        async _automateIfaxUpload(generatedPdfBlob) {
            // 1. Scrape DOM for tokens and routing data
            const csrfToken = document.querySelector('[name="csrfmiddlewaretoken"]')?.value;
            const destination = document.querySelector('[name="destination"]')?.value;
            const did = document.querySelector('[name="did"]')?.value || "";
            const notification = document.querySelector('[name="notification"]')?.value || "off";

            if (!csrfToken || !destination) {
                throw new Error("Missing CSRF token or destination number.");
            }

            // 2. Upload Blob via Fetch
            const uploadForm = new FormData();
            uploadForm.append('csrfmiddlewaretoken', csrfToken);
            uploadForm.append('orig_file', generatedPdfBlob, 'generated_document.pdf');

            const upRes = await fetch('/sent/upload/', {
                method: 'POST',
                headers: {
                    'X-CSRFToken': csrfToken,
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: uploadForm
            });

            if (!upRes.ok) throw new Error(`Upload failed with status: ${upRes.status}`);
            const upData = await upRes.json();

            // 3. Trigger Native Form Submission for Redirect
            // Use hidden form + .submit() instead of fetch to avoid 500 from XHR header on 302 redirect
            const form = document.createElement('form');
            form.method = 'POST';
            form.action = '/sent/create/';
            form.style.display = 'none';

            const fields = {
                csrfmiddlewaretoken: csrfToken,
                did: did,
                destination: destination,
                notification: notification,
                cover: '0',
                cover_text: '',
                orig_files: `${upData.uid},` // Trailing comma required by backend
            };

            for (const [key, value] of Object.entries(fields)) {
                const input = document.createElement('input');
                input.type = 'hidden';
                input.name = key;
                input.value = value;
                form.appendChild(input);
            }

            document.body.appendChild(form);
            form.submit();
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
