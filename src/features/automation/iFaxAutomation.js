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
        _blobListenerRegistered: false,
        _uploadAttempted: false,
        _faxLogSubmitted: false,

        init() {
            const url = window.location.href;

            // Preview page: show uploaded notification with auto-submit countdown
            if (url.includes('ifax.pro/sent/preview/')) {
                setTimeout(() => this._handlePreviewPage(), 500);
                return;
            }

            // Safety check for correct domain/path
            if (url.includes('ifax.pro/sent/create')) {
                // Auto-run after 500ms to allow page to settle
                setTimeout(() => {
                    this.run();
                    this._showNotificationBar();
                    this._watchFormSubmit();
                    this._listenForBlob();
                }, 500);
                return;
            }

            // Successfully sent page (sent list view — no "create" or "preview" in path)
            if (/ifax\.pro\/sent\/?$/.test(url)) {
                setTimeout(() => this._handleSentPage(), 500);
                return;
            }
        },

        /**
         * Listens for sn_temp_fax_blob arriving after the page has loaded.
         * Since PDF generation now runs in background (non-blocking), the blob
         * may arrive seconds after the iFax window opens.
         */
        _listenForBlob() {
            if (this._blobListenerRegistered) return;
            this._blobListenerRegistered = true;

            // Check immediately (blob might have arrived before listener was set up)
            const existingBlob = GM_getValue('sn_temp_fax_blob', '');
            if (existingBlob) {
                console.log("[CM-Notes] Blob already present, checking upload...");
                setTimeout(() => {
                    if (!this._uploadAttempted) this._checkPendingUpload();
                }, 1500);
            }

            // Listen for future blob arrivals
            GM_addValueChangeListener('sn_temp_fax_blob', (name, oldVal, newVal, remote) => {
                if (newVal && !this._uploadAttempted) {
                    console.log("[CM-Notes] Blob arrived via listener, attempting upload...");
                    // Small delay to let the page settle
                    setTimeout(() => {
                        if (!this._uploadAttempted) this._checkPendingUpload();
                    }, 1000);
                }
            });
        },

        /**
         * Listens for the main page form submission (manual "Send" button click).
         * Verifies the fax number destination matches what was expected.
         * Logs to local fax history when user sends manually (not via auto-upload).
         */
        _watchFormSubmit() {
            const form = document.querySelector('form[action*="create"]');
            if (!form) return;
            form.addEventListener('submit', (e) => {
                if (!this._verifyFaxNumber()) {
                    e.preventDefault();
                    this._showMismatchWarning({
                        onSendAnyway: () => { form.submit(); },
                        onFixNumber: () => {}
                    });
                    return;
                }
                // Small delay to let the form data be captured first
                setTimeout(() => this._logFaxOnSubmit(), 100);
            });
        },

        /**
         * Shows a dismissible notification bar at the bottom of the iFax page
         * with client name, fax type, and target + fax number.
         */
        /**
         * Passes through name unchanged — used for display only.
         */
        _formatName(name) {
            return name || '';
        },

        /**
         * Capture temp values on first read so they can't be altered mid-load
         * by other tabs (e.g., Outlook iFaxReceiptObserver clearing them via GM).
         */
        _captureTempValues() {
            if (this._capturedDone) return;
            this._capturedClientName = GM_getValue('sn_temp_fax_client_name', '');
            this._capturedFaxLabel   = GM_getValue('sn_temp_fax_label', 'Fax');
            this._capturedTarget     = GM_getValue('sn_temp_fax_target', 'SSA/DDS');
            this._capturedFaxNum     = GM_getValue('sn_temp_fax_number', '');
            this._capturedClientId   = GM_getValue('sn_temp_fax_client_id', '');
            this._capturedFaxType    = GM_getValue('sn_temp_fax_type', '');
            this._capturedLogActivity = GM_getValue('sn_temp_fax_log_activity', true);
            this._capturedDone = true;
        },

        _showNotificationBar() {
            this._captureTempValues();
            const rawName  = this._capturedClientName;
            const clientName = this._formatName(rawName);
            const faxLabel   = this._capturedFaxLabel;
            const target     = this._capturedTarget;
            const faxNum     = this._capturedFaxNum;

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
                box-shadow: 0 -4px 12px rgba(0,0,0,0.3);
                letter-spacing: 0.3px;
            `;
            bar.textContent = `${clientName} - ${faxLabel} - To ${target}: ${faxNum}`;
            bar.title = 'Verify client and fax details before sending';
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
         * Checks for a pending PDF blob (stored as a single temp value by FaxPanel)
         * and auto-uploads it via the two-step upload + native form submission sequence.
         * The blob is generated fresh each time "Open iFax" is clicked — no persistent storage.
         */
        async _checkPendingUpload() {
            if (this._uploadAttempted) return;

            const pdfBase64 = GM_getValue('sn_temp_fax_blob', '');
            if (!pdfBase64) {
                console.log("[CM-Notes] No pending PDF blob found (sn_temp_fax_blob is empty).");
                return;
            }

            this._uploadAttempted = true;

            // Verify fax number before auto-uploading
            if (!this._verifyFaxNumber()) {
                this._showMismatchWarning({
                    onSendAnyway: () => this._doUpload(pdfBase64),
                    onFixNumber: () => {
                        this._uploadAttempted = false; // allow retry after fix
                        GM_setValue('sn_temp_fax_blob', '');
                        GM_setValue('sn_temp_fax_filename', '');
                    }
                });
                return;
            }

            try {
                await this._doUpload(pdfBase64);
            } catch (e) {
                // Upload failed — reset flag so user can retry manually
                this._uploadAttempted = false;
            }
        },

        /**
         * Extracted upload logic so it can be reused after mismatch override.
         */
        async _doUpload(pdfBase64) {
            console.log("[CM-Notes] Found pending PDF blob, starting auto-upload...");

            // Show uploading notification above the info bar
            this._showUploadingNotification();

            try {
                // Convert base64 data URI back to Blob
                const response = await fetch(pdfBase64);
                const blob = await response.blob();

                // Run the two-step upload + form submission
                // Keep blob in storage so preview page can render the PDF
                await this._automateIfaxUpload(blob);
            } catch (err) {
                console.error("[CM-Notes] Auto-upload failed:", err);
                this._hideUploadingNotification();
                // Don't clean up — let user retry manually by refreshing the iFax page
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
        },

        /**
         * Verifies the destination fax number on the iFax page matches
         * the expected number stored from FaxPanel (sn_temp_fax_number).
         * @returns {boolean} true if match (or can't check), false if mismatch
         */
        _verifyFaxNumber() {
            const expected = GM_getValue('sn_temp_fax_number', '');
            const destInput = document.querySelector('[name="destination"]');
            if (!destInput) return true; // can't verify, let it through

            const actual = destInput.value;
            const expectedDigits = expected.replace(/\D/g, '');
            const actualDigits = actual.replace(/\D/g, '');

            // Allow if either is empty (no context to compare against)
            if (!expectedDigits || !actualDigits) return true;

            return expectedDigits === actualDigits;
        },

        /**
         * Shows a modal warning overlay when the fax number doesn't match.
         * User can either fix the number or send anyway.
         * @param {{ onSendAnyway: Function, onFixNumber: Function }} callbacks
         */
        _showMismatchWarning({ onSendAnyway, onFixNumber }) {
            if (document.getElementById('sn-fax-mismatch-warning')) return;

            const expected = GM_getValue('sn_temp_fax_number', '');
            const destInput = document.querySelector('[name="destination"]');
            const actual = destInput ? destInput.value : 'unknown';

            const overlay = document.createElement('div');
            overlay.id = 'sn-fax-mismatch-warning';
            overlay.style.cssText = `
                position: fixed; inset: 0; z-index: 9999999;
                background: rgba(0,0,0,0.6);
                display: flex; align-items: center; justify-content: center;
                font-family: 'Segoe UI', Arial, sans-serif;
            `;
            overlay.innerHTML = `
                <div style="background:#fff; border-radius:8px; padding:24px; max-width:440px; box-shadow:0 8px 32px rgba(0,0,0,0.3); text-align:center;">
                    <div style="font-size:48px; margin-bottom:8px;">⚠️</div>
                    <h2 style="margin:0 0 6px; color:#d32f2f; font-size:18px;">Fax Number Mismatch</h2>
                    <p style="margin:0 0 16px; color:#666; font-size:13px; line-height:1.5;">
                        The outgoing fax number doesn't match what CM Notes expected.
                    </p>
                    <table style="margin:0 auto 16px; text-align:left; font-size:13px; border-collapse:collapse;">
                        <tr><td style="padding:3px 12px; color:#888;">Expected:</td>
                            <td style="padding:3px 12px; font-weight:bold; color:#1a1a2e;">${this._escHtml(expected)}</td></tr>
                        <tr><td style="padding:3px 12px; color:#888;">Current:</td>
                            <td style="padding:3px 12px; font-weight:bold; color:#d32f2f;">${this._escHtml(actual)}</td></tr>
                    </table>
                    <div style="display:flex; gap:8px; justify-content:center;">
                        <button id="sn-fax-warn-fix" style="padding:8px 20px; border:1px solid #999; border-radius:4px; background:#f5f5f5; cursor:pointer; font-size:13px;">✏️ Fix Number</button>
                        <button id="sn-fax-warn-send" style="padding:8px 20px; border:none; border-radius:4px; background:#d32f2f; color:#fff; cursor:pointer; font-size:13px; font-weight:bold;">Send Anyway</button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);

            overlay.querySelector('#sn-fax-warn-fix').onclick = () => {
                overlay.remove();
                if (onFixNumber) onFixNumber();
            };
            overlay.querySelector('#sn-fax-warn-send').onclick = () => {
                overlay.remove();
                if (onSendAnyway) onSendAnyway();
            };
        },

        /**
         * Updates the existing fax log entry (created by FaxPanel "Open iFax") when
         * the fax is actually submitted.  Finds the matching awaiting_report entry
         * by client name + receiver fax number (within last 30 min) and updates it.
         * If no match is found, pushes a new entry.
         * Called both by auto-upload path and via form submit event listener.
         */
        _logFaxOnSubmit() {
            if (this._faxLogSubmitted) return;
            this._faxLogSubmitted = true;

            this._captureTempValues();
            const clientId   = this._capturedClientId;
            const clientName = this._capturedClientName;
            const faxType    = this._capturedFaxType;
            const faxNumber  = this._capturedFaxNum;

            if (!clientName && !faxNumber) return;

            const receiverDigits = faxNumber.replace(/\D/g, '');
            const faxLog = GM_getValue('sn_fax_log', []);

            // Find existing awaiting_report entry for the same fax (within last 30 min)
            const thirtyMinAgo = Date.now() - 30 * 60 * 1000;
            const existingIdx = faxLog.findIndex(entry =>
                entry.status === 'awaiting_report' &&
                entry.clientName === clientName &&
                (entry.receiverFax || entry.faxNumber || '').replace(/\D/g, '') === receiverDigits &&
                (entry.timestamp || 0) > thirtyMinAgo
            );

            if (existingIdx !== -1) {
                // Update existing entry — fax was sent, now awaiting receipt
                faxLog[existingIdx].status = 'awaiting_report';  // still awaiting receipt confirmation
                faxLog[existingIdx].timestamp = Date.now();
                faxLog[existingIdx].dateTime = new Date().toISOString();
                faxLog[existingIdx].logActivity = this._capturedLogActivity;
                console.log("[iFaxAutomation] Updated existing fax log entry for:", clientName);
            } else {
                // No existing entry found — push new (unlikely path; FaxPanel should have created one)
                faxLog.push({
                    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 6),
                    clientId,
                    clientName,
                    faxLabel: GM_getValue('sn_temp_fax_label', 'Fax'),
                    faxType,
                    faxNumber: receiverDigits,
                    receiverFax: receiverDigits,
                    senderFax: '',
                    status: 'awaiting_report',
                    subject: '',
                    content: '',
                    receiptContent: '',
                    emailDate: '',
                    emailDateISO: '',
                    pdfBase64: '',
                    fileName: '',
                    timestamp: Date.now(),
                    resolvedAt: null,
                    dateTime: new Date().toISOString(),
                    logActivity: this._capturedLogActivity
                });
                console.log("[iFaxAutomation] Pushed new fax log entry for:", clientName);
            }

            if (faxLog.length > 500) faxLog.splice(0, faxLog.length - 500);
            GM_setValue('sn_fax_log', faxLog);
            GM_setValue('sn_fax_log_broadcast', Date.now());
        },

        /**
         * Shows an animated "Uploading PDF" notification bar above the info bar
         * at the bottom of the create page.
         */
        _showUploadingNotification() {
            if (document.getElementById('sn-ifax-uploading')) return;

            this._ensureAnimStyles();

            const bar = document.createElement('div');
            bar.id = 'sn-ifax-uploading';
            bar.style.cssText = `
                position: fixed;
                bottom: 44px;
                left: 0;
                right: 0;
                z-index: 999998;
                background: #0d47a1;
                color: #fff;
                font-size: 14px;
                font-family: 'Segoe UI', Arial, sans-serif;
                padding: 10px 20px;
                text-align: center;
                box-shadow: 0 -4px 12px rgba(0,0,0,0.3);
                letter-spacing: 0.3px;
                animation: snSlideUp 0.3s ease-out;
            `;
            bar.textContent = '⏫ Uploading PDF, do not touch anything';
            document.body.appendChild(bar);
        },

        /**
         * Removes the uploading notification bar.
         */
        _hideUploadingNotification() {
            const bar = document.getElementById('sn-ifax-uploading');
            if (bar) bar.remove();
        },

        /**
         * Handles the sent page after a fax is successfully submitted.
         * Shows a green notification bar with a 5-second countdown, then closes the window.
         * Clicking the notification cancels the auto-close.
         */
        _handleSentPage() {
            this._ensureAnimStyles();

            let seconds = 5;
            let cancelled = false;

            const bar = document.createElement('div');
            bar.id = 'sn-ifax-sent';
            bar.style.cssText = `
                position: fixed;
                bottom: 0;
                left: 0;
                right: 0;
                z-index: 999999;
                background: #2e7d32;
                color: #fff;
                font-size: 14px;
                font-family: 'Segoe UI', Arial, sans-serif;
                padding: 12px 20px;
                text-align: center;
                box-shadow: 0 -4px 12px rgba(0,0,0,0.3);
                letter-spacing: 0.3px;
                animation: snSlideUp 0.3s ease-out;
                cursor: pointer;
            `;
            bar.title = 'Click to cancel auto-close';
            document.body.appendChild(bar);

            const updateText = () => {
                bar.innerHTML = `✅ Successfully submitted, closing in ${seconds} second${seconds !== 1 ? 's' : ''} &nbsp; <span style="text-decoration:underline;opacity:0.7;">(click to cancel)</span>`;
            };
            updateText();

            bar.onclick = () => {
                cancelled = true;
                bar.style.background = '#555';
                bar.innerHTML = '✋ Auto-close cancelled';
                setTimeout(() => bar.remove(), 2000);
            };

            const interval = setInterval(() => {
                if (cancelled) {
                    clearInterval(interval);
                    return;
                }
                seconds--;
                if (seconds <= 0) {
                    clearInterval(interval);
                    bar.remove();
                    window.close();
                } else {
                    updateText();
                }
            }, 1000);
        },

        /**
         * Handles the preview page after a successful upload.
         * Shows "File uploaded" info, a mini PDF preview, and starts an auto-submit countdown.
         */
        _handlePreviewPage() {
            const fileName = GM_getValue('sn_temp_fax_filename', '') || 'document.pdf';
            const pdfBase64 = GM_getValue('sn_temp_fax_blob', '');

            this._ensureAnimStyles();

            // Intercept manual clicks on the send button to log fax entry before navigation
            this._interceptPreviewSubmit();

            const bar = document.createElement('div');
            bar.id = 'sn-ifax-uploaded';
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
                box-shadow: 0 -4px 12px rgba(0,0,0,0.3);
                letter-spacing: 0.3px;
                cursor: pointer;
                animation: snSlideUp 0.3s ease-out;
            `;
            bar.title = 'Click to cancel auto-submit';
            document.body.appendChild(bar);

            this._startAutoSubmitCountdown(bar, fileName);
        },

        /**
         * Cleans up the temporary PDF blob from GM storage.
         * Called after auto-submit or manual cancel on the preview page.
         */
        _cleanupTempBlob() {
            GM_setValue('sn_temp_fax_blob', '');
            GM_setValue('sn_temp_fax_filename', '');
        },

        /**
         * Intercepts manual clicks on the preview page's send/submit button/link.
         * Calls _logFaxOnSubmit() first, then navigates after a brief delay
         * to ensure GM_setValue async writes complete before navigation.
         */
        _interceptPreviewSubmit() {
            // Look for the send/resend link (primary submit action on preview page)
            const sendLink = document.querySelector('a.btn-primary[href*="/sent/resend/"]');
            if (sendLink) {
                sendLink.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this._logFaxOnSubmit();
                    this._cleanupTempBlob();
                    // Delay to ensure GM_setValue async write completes before navigation
                    setTimeout(() => {
                        window.location.href = sendLink.href;
                    }, 500);
                });
                return;
            }

            // Fallback: try standard submit buttons
            const selectors = [
                'button[type="submit"]',
                'input[type="submit"]',
                'button.btn-primary',
                'form button[type="submit"]'
            ];
            for (const sel of selectors) {
                const btn = document.querySelector(sel);
                if (btn) {
                    btn.addEventListener('click', (e) => {
                        this._logFaxOnSubmit();
                        this._cleanupTempBlob();
                    });
                    return;
                }
            }
            // Last fallback: try to find any element with submit-like text
            const buttons = document.querySelectorAll('button, input[type="button"], a');
            for (const btn of buttons) {
                const text = (btn.textContent || btn.value || '').toLowerCase().trim();
                if (text.includes('submit') || text.includes('send') || text.includes('confirm')) {
                    if (btn.tagName === 'A' && btn.href) {
                        btn.addEventListener('click', (e) => {
                            e.preventDefault();
                            this._logFaxOnSubmit();
                            this._cleanupTempBlob();
                            setTimeout(() => {
                                window.location.href = btn.href;
                            }, 500);
                        });
                    } else {
                        btn.addEventListener('click', () => {
                            this._logFaxOnSubmit();
                            this._cleanupTempBlob();
                        });
                    }
                    return;
                }
            }
        },

        /**
         * Starts a 5-second countdown on the preview page notification.
         * Auto-clicks the submit button when time runs out.
         * Clicking the notification cancels the auto-submit.
         * @param {HTMLElement} bar - The notification bar element
         * @param {string} fileName - Name of the uploaded file
         */
        _startAutoSubmitCountdown(bar, fileName) {
            let seconds = 5;
            let cancelled = false;

            const updateText = () => {
                bar.innerHTML = `📄 File uploaded: ${this._escHtml(fileName)} &nbsp;|&nbsp; ⏳ Auto Submitting in ${seconds} second${seconds !== 1 ? 's' : ''} &nbsp; <span style="text-decoration:underline;opacity:0.7;">(click to cancel)</span>`;
            };
            updateText();

            bar.onclick = () => {
                cancelled = true;
                this._cleanupTempBlob();
                bar.style.background = '#555';
                bar.innerHTML = '✋ Auto-submit cancelled';
                setTimeout(() => bar.remove(), 2000);
            };

            const interval = setInterval(() => {
                if (cancelled) {
                    clearInterval(interval);
                    return;
                }
                seconds--;
                if (seconds <= 0) {
                    clearInterval(interval);
                    // Log fax entry before actual submission
                    this._logFaxOnSubmit();
                    this._cleanupTempBlob();
                    bar.innerHTML = '📤 Submitting fax...';
                    // Delay 500ms to ensure GM_setValue async write completes before navigation
                    setTimeout(() => {
                        this._clickSubmitButton();
                    }, 500);
                    setTimeout(() => bar.remove(), 2000);
                } else {
                    updateText();
                }
            }, 1000);
        },

        /**
         * Finds and clicks the submit button on the preview page.
         * Falls back to submitting the form if no button is found.
         */
        _clickSubmitButton() {
            // Look for the send/resend link (anchor tag with btn-primary)
            const sendLink = document.querySelector('a.btn-primary[href*="/sent/resend/"]');
            if (sendLink && sendLink.href) {
                console.log("[CM-Notes] Navigating to send link:", sendLink.href);
                window.location.href = sendLink.href;
                return;
            }

            // Fallback: try standard submit buttons
            const selectors = [
                'button[type="submit"]',
                'input[type="submit"]',
                'button.btn-primary',
                '.btn-primary',
                'form button[type="submit"]'
            ];
            for (const sel of selectors) {
                const btn = document.querySelector(sel);
                if (btn) {
                    console.log("[CM-Notes] Clicking submit button:", sel);
                    btn.click();
                    return;
                }
            }
            // Fallback: try to find any element with submit-like text
            const buttons = document.querySelectorAll('button, input[type="button"], a');
            for (const btn of buttons) {
                const text = (btn.textContent || btn.value || '').toLowerCase().trim();
                if (text.includes('submit') || text.includes('send') || text.includes('confirm')) {
                    if (btn.tagName === 'A' && btn.href) {
                        console.log("[CM-Notes] Navigating to send link by text:", btn.href);
                        window.location.href = btn.href;
                    } else {
                        console.log("[CM-Notes] Clicking submit element by text:", text);
                        btn.click();
                    }
                    return;
                }
            }
            // Last resort: submit the form
            const form = document.querySelector('form');
            if (form) {
                console.log("[CM-Notes] Submitting form as fallback");
                if (form.requestSubmit) form.requestSubmit();
                else form.submit();
            }
        },

        /**
         * Ensures the slide-up animation keyframes are injected into the page.
         */
        _ensureAnimStyles() {
            if (document.getElementById('sn-ifax-anim-style')) return;
            const style = document.createElement('style');
            style.id = 'sn-ifax-anim-style';
            style.textContent = `
                @keyframes snSlideUp {
                    from { transform: translateY(100%); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
                @keyframes snFadeIn {
                    from { opacity: 0; transform: scale(0.95); }
                    to { opacity: 1; transform: scale(1); }
                }
            `;
            document.head.appendChild(style);
        },



        _escHtml(str) {
            const div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
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
