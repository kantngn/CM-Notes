/**
 * @file OutlookObserver.js
 * @description Monitors Outlook Web Access for iFax report emails.
 *   Polls a target folder for new emails, extracts fax numbers from email content,
 *   matches them against tracked fax records (sn_fax_records), and triggers
 *   notifications on success/failure. Also generates PDF reports from email bodies.
 *
 * @requires gm-compat.js — GM_getValue, GM_setValue, GM_addValueChangeListener
 *
 * @consumed-by Manifest content_scripts on outlook.office.com / outlook.live.com
 */
(function () {
    const app = window.CM_App = window.CM_App || {};
    app.Automation = app.Automation || {};

    const OutlookObserver = {
        /** @type {number|null} Interval ID for email polling */
        _pollInterval: null,

        /** @type {Set<string>} IDs of already-processed emails to avoid duplicates */
        _seenEmails: null,

        /** @type {string} Target folder name to monitor (e.g., "Inbox", "iFax Reports") */
        _targetFolder: 'Inbox',

        /** @type {boolean} Whether the observer is active */
        _active: false,

        /** @type {string|null} Identity token for stale callback prevention */
        _identity: null,

        /** @type {boolean} Initial scan done flag */
        _initialScanDone: false,

        // ── Constants ────────────────────────────────────────────────
        POLL_INTERVAL_MS: 15000,       // Poll every 15 seconds
        FOLDER_CHECK_DELAY: 2000,      // Wait after clicking folder
        EMAIL_READ_DELAY: 1500,        // Wait after clicking email
        MAX_RETRY_ATTEMPTS: 3,
        STORAGE_KEY_RECORDS: 'sn_fax_records',
        STORAGE_KEY_FOLDER: 'sn_outlook_folder',
        STORAGE_KEY_SEEN: 'sn_outlook_seen_emails',

        /**
         * Initializes the Outlook Observer. Should only run on Outlook Web pages.
         */
        init() {
            // Only run on Outlook Web
            const host = window.location.hostname;
            if (!host.includes('outlook.')) return;

            // Prevent double init
            if (this._active) return;
            this._active = true;

            this._identity = 'outlook-' + Math.random().toString(36).substr(2, 9);
            this._seenEmails = new Set();

            console.log('[CM-Notes] OutlookObserver initialized');

            // Load saved folder preference
            const savedFolder = GM_getValue(this.STORAGE_KEY_FOLDER, 'Inbox');
            if (savedFolder) this._targetFolder = savedFolder;

            // Load previously seen emails from storage
            this._loadSeenEmails();

            // Start polling after page settles
            setTimeout(() => {
                this._startPolling();
            }, 5000);

            // Cleanup on page unload
            window.addEventListener('beforeunload', () => {
                this._stopPolling();
                this._saveSeenEmails();
            });

            window.addEventListener('pagehide', () => {
                this._stopPolling();
            });
        },

        // ── Storage Helpers ──────────────────────────────────────────

        /**
         * Loads previously seen email IDs from GM storage.
         */
        _loadSeenEmails() {
            try {
                const stored = GM_getValue(this.STORAGE_KEY_SEEN, []);
                if (Array.isArray(stored)) {
                    this._seenEmails = new Set(stored);
                }
            } catch (e) {
                console.warn('[CM-Notes] Failed to load seen emails:', e);
            }
        },

        /**
         * Saves seen email IDs to GM storage (limited to last 200).
         */
        _saveSeenEmails() {
            try {
                const arr = Array.from(this._seenEmails).slice(-200);
                GM_setValue(this.STORAGE_KEY_SEEN, arr);
            } catch (e) {
                console.warn('[CM-Notes] Failed to save seen emails:', e);
            }
        },

        /**
         * Reads fax records from GM storage.
         * @returns {Array<{letterType:string, faxNumber:string, timestamp:number, clientId?:string}>}
         */
        _getFaxRecords() {
            try {
                return GM_getValue(this.STORAGE_KEY_RECORDS, []);
            } catch (e) {
                return [];
            }
        },

        // ── Polling ──────────────────────────────────────────────────

        /**
         * Starts periodic polling for new emails.
         */
        _startPolling() {
            if (this._pollInterval) return;
            console.log('[CM-Notes] Starting Outlook email poll (folder: ' + this._targetFolder + ')');

            // Small initial delay to let page render
            setTimeout(() => this._checkFolder(), 1000);

            this._pollInterval = setInterval(() => {
                this._checkFolder();
            }, this.POLL_INTERVAL_MS);
        },

        /**
         * Stops the polling interval.
         */
        _stopPolling() {
            if (this._pollInterval) {
                clearInterval(this._pollInterval);
                this._pollInterval = null;
            }
        },

        // ── Folder & Email Detection ─────────────────────────────────

        /**
         * Checks the target folder for new unread emails.
         */
        async _checkFolder() {
            try {
                const identity = this._identity;

                // Step 1: Locate and click on the target folder in the navigation pane
                const folderClicked = await this._navigateToFolder(this._targetFolder);
                if (!folderClicked) return;

                await this._delay(this.FOLDER_CHECK_DELAY);

                // Step 2: Find unread/email items in the list
                const emailItems = this._getEmailItems();
                if (!emailItems || emailItems.length === 0) return;

                // Step 3: Process each unread email (newest first)
                for (const item of emailItems) {
                    if (this._identity !== identity) return; // Stale check

                    const emailId = this._getEmailId(item);
                    if (!emailId || this._seenEmails.has(emailId)) continue;

                    // Mark as seen immediately to avoid re-processing
                    this._seenEmails.add(emailId);

                    // Read the email content
                    await this._openAndReadEmail(item);

                    // Small delay between emails
                    await this._delay(500);
                }

                // Save seen email IDs periodically
                this._saveSeenEmails();

            } catch (e) {
                console.warn('[CM-Notes] Outlook check error:', e);
            }
        },

        /**
         * Attempts to navigate to the target folder by finding and clicking it.
         * Uses multiple selector strategies for Outlook's dynamic DOM.
         * @param {string} folderName - The folder name to find.
         * @returns {Promise<boolean>} Whether the folder was found and clicked.
         */
        async _navigateToFolder(folderName) {
            // Strategy 1: Try finding folder by [title] attribute (Outlook typically uses this)
            let folderEl = document.querySelector(
                `[title="${folderName}"], [title*="${folderName}"], [aria-label="${folderName}"]`
            );

            // Strategy 2: Look for folder in the left nav pane
            if (!folderEl) {
                // Try various standard CSS selectors that Outlook uses for folder navigation
                const selectors = [
                    `span[title="${folderName}"]`,
                    `span[title*="${folderName}"]`,
                    `div[role="treeitem"] span[title="${folderName}"]`,
                    `div[role="treeitem"] span[title*="${folderName}"]`,
                    `.ms-FocusZone span[title="${folderName}"]`,
                    `.ms-FocusZone span[title*="${folderName}"]`,
                    `[data-automationid="Folder"] span[title="${folderName}"]`,
                    `[data-automationid="Folder"] span[title*="${folderName}"]`,
                    `[data-automationid="Folder"] [title="${folderName}"]`,
                    `[data-automationid="Folder"] [title*="${folderName}"]`
                ];

                for (const sel of selectors) {
                    try {
                        folderEl = document.querySelector(sel);
                        if (folderEl) break;
                    } catch (e) { /* ignore invalid selectors */ }
                }
            }

            // Strategy 3: Search all elements for the folder name text
            if (!folderEl) {
                const allSpans = document.querySelectorAll('span[title], div[role="treeitem"] span');
                for (const span of allSpans) {
                    const text = (span.textContent || span.title || '').trim();
                    if (text.toLowerCase() === folderName.toLowerCase()) {
                        folderEl = span;
                        break;
                    }
                }
            }

            if (!folderEl) {
                // Folder not found yet — might still be loading
                return false;
            }

            // Click the folder if not already active
            const parentItem = folderEl.closest('[role="treeitem"]') || folderEl;
            const isSelected = parentItem.getAttribute('aria-selected') === 'true' ||
                parentItem.classList.contains('ms-FocusZone--selected');

            if (!isSelected) {
                parentItem.click();
                await this._delay(this.FOLDER_CHECK_DELAY);
            }

            return true;
        },

        /**
         * Gets the email list items from the current folder view.
         * @returns {Element[]} Array of email row elements.
         */
        _getEmailItems() {
            // Outlook Web email list selectors
            const selectors = [
                '[role="listitem"][data-automationid="messageListItem"]',
                '[role="listitem"][data-item-index]',
                '.ms-List-cell [role="listitem"]',
                '[data-automationid="messageList"] [role="listitem"]',
                '.ms-FocusZone [role="listitem"]'
            ];

            for (const sel of selectors) {
                try {
                    const items = document.querySelectorAll(sel);
                    if (items && items.length > 0) {
                        return Array.from(items);
                    }
                } catch (e) { /* ignore */ }
            }

            // Fallback: look for any unread indicator parent
            const unreadEls = document.querySelectorAll('[aria-label*="unread"], [class*="unread"]');
            if (unreadEls.length > 0) {
                return Array.from(unreadEls).map(el => el.closest('[role="listitem"]') || el).filter(Boolean);
            }

            return [];
        },

        /**
         * Extracts a unique identifier for an email item.
         * @param {Element} item - The email row element.
         * @returns {string|null} Unique email ID.
         */
        _getEmailId(item) {
            // Try data attributes first
            const id = item.getAttribute('data-automationid') ||
                item.getAttribute('data-item-index') ||
                item.getAttribute('id');

            // If no explicit ID, create one from content hash
            if (!id) {
                const subject = this._getEmailSubject(item);
                const sender = this._getEmailSender(item);
                if (subject && sender) {
                    return subject + '|' + sender;
                }
                return null;
            }
            return id;
        },

        /**
         * Extracts the subject from an email item.
         * @param {Element} item - The email row element.
         * @returns {string} The email subject.
         */
        _getEmailSubject(item) {
            const selectors = [
                'span[data-automationid="subject"]',
                'span[class*="subject"]',
                '[data-automationid="messageListSubject"]',
                'span[role="heading"]'
            ];
            for (const sel of selectors) {
                try {
                    const el = item.querySelector(sel);
                    if (el) return el.textContent.trim();
                } catch (e) { /* ignore */ }
            }
            // Fallback: any span with text
            const spans = item.querySelectorAll('span');
            for (const span of spans) {
                if (span.textContent.trim() && span.textContent.trim().length > 5) {
                    return span.textContent.trim();
                }
            }
            return item.textContent.trim().substring(0, 100);
        },

        /**
         * Extracts the sender from an email item.
         * @param {Element} item - The email row element.
         * @returns {string} The sender name/email.
         */
        _getEmailSender(item) {
            const selectors = [
                '[data-automationid="messageListSender"]',
                'span[class*="sender"]',
                '[data-automationid="sender"]'
            ];
            for (const sel of selectors) {
                try {
                    const el = item.querySelector(sel);
                    if (el) return el.textContent.trim();
                } catch (e) { /* ignore */ }
            }
            return '';
        },

        /**
         * Reads an email's content without disrupting the user's current view.
         * First tries to extract from list item metadata (subject, preview),
         * then checks if reading pane is already showing this email.
         * Only clicks on the email as a last resort if content is insufficient.
         * @param {Element} item - The email row element.
         */
        async _openAndReadEmail(item) {
            try {
                // Step 1: Extract available info from the list item itself
                const subject = this._getEmailSubject(item);
                const preview = this._getEmailPreview(item);
                const sender = this._getEmailSender(item);
                let bodyText = preview || '';
                let bodyHtml = '';

                console.log('[CM-Notes] New email detected:', subject);

                // Step 2: Try to read the reading pane without clicking
                // The reading pane may already be showing this email if user just clicked it
                const readingPane = await this._tryGetReadingPaneContent();
                if (readingPane) {
                    const paneSubject = this._getReadingPaneSubject();
                    // Only use reading pane content if it matches the current email subject
                    if (!paneSubject || paneSubject === subject || subject.includes(paneSubject) || paneSubject.includes(subject)) {
                        bodyText = readingPane.textContent || readingPane.innerText || bodyText;
                        bodyHtml = readingPane.innerHTML || '';
                    }
                }

                // Step 3: If we still don't have enough content, briefly probe
                if (!bodyText || bodyText.length < 50) {
                    // Try expanded preview in the list
                    bodyText = this._getExpandedPreview(item) || bodyText;
                }

                // Process the email with whatever content we have
                await this._processEmail(subject, bodyText, bodyHtml);

            } catch (e) {
                console.warn('[CM-Notes] Error reading email:', e);
            }
        },

        /**
         * Gets the email preview/snippet text from the list item.
         * @param {Element} item - The email row element.
         * @returns {string} Preview text.
         */
        _getEmailPreview(item) {
            const selectors = [
                '[data-automationid="messageListPreview"]',
                'span[class*="preview"]',
                'span[class*="snippet"]',
                'div[class*="preview"]'
            ];
            for (const sel of selectors) {
                try {
                    const el = item.querySelector(sel);
                    if (el && el.textContent.trim()) return el.textContent.trim();
                } catch (e) { /* ignore */ }
            }
            return '';
        },

        /**
         * Attempts to get expanded preview by reading the item's aria-label or title.
         * @param {Element} item - The email row element.
         * @returns {string} Expanded text.
         */
        _getExpandedPreview(item) {
            const ariaLabel = item.getAttribute('aria-label') || '';
            const title = item.getAttribute('title') || '';
            return ariaLabel || title;
        },

        /**
         * Tries to get content from the reading pane without clicking.
         * @returns {Promise<Element|null>} The reading pane body element.
         */
        async _tryGetReadingPaneContent() {
            const selectors = [
                '[data-automationid="readingPane"]',
                '[data-automationid="messageBody"]',
                '[role="main"] [data-automationid="messageBody"]',
                'div[class*="messageBody"]',
                'div[class*="readingPane"]'
            ];
            for (const sel of selectors) {
                try {
                    const el = document.querySelector(sel);
                    if (el) {
                        // Check if it's an iframe with content
                        if (el.tagName === 'IFRAME') {
                            try {
                                const iframeDoc = el.contentDocument || el.contentWindow.document;
                                if (iframeDoc && iframeDoc.body) return iframeDoc.body;
                            } catch (e) { /* cross-origin iframe */ }
                        }
                        return el;
                    }
                } catch (e) { /* ignore */ }
            }
            return null;
        },

        /**
         * Waits for the reading pane body to appear.
         * @param {number} [maxWait=8000] - Maximum wait time in ms.
         * @returns {Promise<Element|null>} The email body element.
         */
        async _waitForEmailBody(maxWait = 8000) {
            const start = Date.now();
            while (Date.now() - start < maxWait) {
                // Try various reading pane selectors
                const selectors = [
                    '[data-automationid="readingPane"]',
                    '[role="main"] [data-automationid="messageBody"]',
                    '[data-automationid="messageBody"]',
                    '.ms-FocusZone[role="main"] iframe',
                    'iframe[title*="Message body"]',
                    '[aria-label*="Message body"]',
                    'div[class*="messageBody"]',
                    'div[class*="readingPane"]'
                ];

                for (const sel of selectors) {
                    try {
                        const el = document.querySelector(sel);
                        if (el) {
                            // Check if it's an iframe with content
                            if (el.tagName === 'IFRAME') {
                                try {
                                    const iframeDoc = el.contentDocument || el.contentWindow.document;
                                    if (iframeDoc && iframeDoc.body) return iframeDoc.body;
                                } catch (e) { /* cross-origin iframe */ }
                            }
                            return el;
                        }
                    } catch (e) { /* ignore */ }
                }
                await this._delay(500);
            }
            return null;
        },

        /**
         * Gets the subject from the reading pane.
         * @returns {string} The email subject.
         */
        _getReadingPaneSubject() {
            const selectors = [
                '[data-automationid="readingPane"] [role="heading"]',
                '[data-automationid="subject"]',
                'h1[class*="subject"]',
                'h2[class*="subject"]'
            ];
            for (const sel of selectors) {
                try {
                    const el = document.querySelector(sel);
                    if (el) return el.textContent.trim();
                } catch (e) { /* ignore */ }
            }
            return '';
        },

        // ── Email Processing ─────────────────────────────────────────

        /**
         * Processes an email: extracts fax number, matches records, checks status, notifies.
         * @param {string} subject - Email subject.
         * @param {string} bodyText - Email body as plain text.
         * @param {string} bodyHtml - Email body as HTML.
         */
        async _processEmail(subject, bodyText, bodyHtml) {
            // Skip non iFax-related emails
            const lowerSubject = (subject || '').toLowerCase();
            const lowerBody = (bodyText || '').toLowerCase();
            const isFaxRelated = lowerSubject.includes('fax') ||
                lowerSubject.includes('ifax') ||
                lowerBody.includes('fax') ||
                lowerBody.includes('ifax');

            if (!isFaxRelated) return;

            // Parse the iFax email format: "Fax from 2142926581 to 8339401983 was sent successfully."
            const parsed = this._parseFaxEmailLine(bodyText);
            if (!parsed) {
                console.log('[CM-Notes] Email processed — not a recognized iFax report format');
                return;
            }

            console.log('[CM-Notes] iFax email: from', parsed.fromNumber, '→ to', parsed.toNumber);

            // Determine status: if numbers present but no "successfully", it failed
            const status = this._determineStatus(bodyText, parsed);
            if (!status) {
                console.log('[CM-Notes] Could not determine fax status, skipping');
                return;
            }

            // Match the "to" number (destination we faxed to) against our records
            const records = this._getFaxRecords();
            const matchedRecord = this._findMatchingRecord(records, parsed.toNumber);

            if (matchedRecord) {
                console.log('[CM-Notes] Matched fax record:', matchedRecord);
                this._showFaxNotification(matchedRecord, status);

                // Only generate PDF on successful faxes
                if (status.success) {
                    await this._generatePdfFromEmail(subject, bodyText, matchedRecord, status);
                }

                // Clean up: remove matched record (it's been processed)
                this._removeFaxRecord(matchedRecord);
            } else {
                // No matching record found — generic notification
                this._showGenericFaxNotification(parsed.toNumber, status);

                // Still generate PDF for success even without match
                if (status.success) {
                    await this._generatePdfFromEmail(subject, bodyText, null, status);
                }
            }
        },

        /**
         * Parses the iFax notification email format.
         * Expected first line: "Fax from 2142926581 to 8339401983 was sent successfully."
         * @param {string} text - Email body text.
         * @returns {{fromNumber: string|null, toNumber: string|null}|null} Parsed numbers or null.
         */
        _parseFaxEmailLine(text) {
            if (!text) return null;

            // Primary format: "Fax from XXXXXXXXXX to XXXXXXXXXX was sent ..."
            const faxLineMatch = text.match(/fax\s+from\s+(\d{3}[-.\s]?\d{3}[-.\s]?\d{4})\s+to\s+(\d{3}[-.\s]?\d{3}[-.\s]?\d{4})/i);
            if (faxLineMatch) {
                return {
                    fromNumber: faxLineMatch[1].replace(/\D/g, ''),
                    toNumber: faxLineMatch[2].replace(/\D/g, '')
                };
            }

            // Fallback: just extract any two 10-digit numbers
            const numbers = text.match(/\b(\d{3}[-.\s]?\d{3}[-.\s]?\d{4})\b/g);
            if (numbers && numbers.length >= 2) {
                return {
                    fromNumber: numbers[0].replace(/\D/g, ''),
                    toNumber: numbers[1].replace(/\D/g, '')
                };
            }

            return null;
        },

        /**
         * Extracts a fax/phone number from email text content (legacy fallback).
         * Looks for US phone/fax number patterns.
         * @param {string} text - Email body text.
         * @returns {string|null} Extracted fax number (10 digits) or null.
         */
        _extractFaxNumber(text) {
            if (!text) return null;

            // Pattern 1: "Fax: 214-292-6581" or "Fax Number: 2142926581"
            const faxLabelMatch = text.match(/fax\s*(?:number|#|:)?\s*:?\s*(\d{3}[-.\s]?\d{3}[-.\s]?\d{4})/i);
            if (faxLabelMatch) {
                return faxLabelMatch[1].replace(/\D/g, '');
            }

            // Pattern 2: "To: 2142926581" or similar destination labels
            const toMatch = text.match(/(?:to|destination|sent\s*to)\s*:?\s*(\d{3}[-.\s]?\d{3}[-.\s]?\d{4})/i);
            if (toMatch) {
                return toMatch[1].replace(/\D/g, '');
            }

            // Pattern 3: Any 10-digit number in the text (as fallback)
            const digitsMatch = text.match(/\b(\d{3}[-.\s]?\d{3}[-.\s]?\d{4})\b/);
            if (digitsMatch) {
                return digitsMatch[1].replace(/\D/g, '');
            }

            return null;
        },

        /**
         * Finds a fax record matching the extracted number.
         * @param {Array} records - Array of fax records.
         * @param {string} number - The fax number to match.
         * @returns {Object|null} The matched record or null.
         */
        _findMatchingRecord(records, number) {
            if (!records || !number) return null;

            // Extract last 10 digits for comparison
            const cleanNumber = number.replace(/\D/g, '');
            const last10 = cleanNumber.slice(-10);

            for (const record of records) {
                const recordClean = (record.faxNumber || '').replace(/\D/g, '');
                const recordLast10 = recordClean.slice(-10);

                if (recordLast10 === last10) {
                    return record;
                }
            }
            return null;
        },

        /**
         * Determines if the email indicates success or failure.
         * If the email has fax numbers but does NOT contain "successfully", it's a failure.
         * @param {string} bodyText - Email body text.
         * @param {{fromNumber: string, toNumber: string}} parsed - Parsed fax email info.
         * @returns {{success: boolean, text: string}|null} Status object or null.
         */
        _determineStatus(bodyText, parsed) {
            if (!bodyText || !parsed) return null;

            const lower = bodyText.toLowerCase();

            // Has fax numbers but no "successfully" = failed
            if (parsed.fromNumber && parsed.toNumber) {
                if (lower.includes('successfully')) {
                    return { success: true, text: 'Successfully' };
                } else {
                    return { success: false, text: 'Failed' };
                }
            }

            return null;
        },

        /**
         * Shows a global notification about the fax status.
         * @param {Object} record - The matched fax record.
         * @param {{success: boolean, text: string}} status - The fax status.
         */
        _showFaxNotification(record, status) {
            const letterType = record.letterType || 'Fax';
            const faxNum = record.faxNumber || 'Unknown';
            const clientInfo = record.clientName ? ` for ${record.clientName}` : '';

            const message = `${letterType}${clientInfo} → ${faxNum}: ${status.text}`;
            const type = status.success ? 'success' : 'error';
            const duration = status.success ? 5000 : 10000;

            // Use the global notification system
            this._showNotification(message, { type, duration });
        },

        /**
         * Shows a notification for a fax without a matching record.
         * @param {string} faxNumber - The fax number.
         * @param {{success: boolean, text: string}} status - The fax status.
         */
        _showGenericFaxNotification(faxNumber, status) {
            const formatted = this._formatPhone(faxNumber);
            const message = `iFax to ${formatted}: ${status.text}`;
            const type = status.success ? 'success' : 'error';

            this._showNotification(message, { type, duration: 5000 });
        },

        /**
         * Displays a notification on the page.
         * @param {string} message - The notification message.
         * @param {Object} [options] - Notification options.
         */
        _showNotification(message, { type = 'info', duration = 3000 } = {}) {
            const notification = document.createElement('div');
            const colors = {
                info: { bg: '#e3f2fd', border: '#90caf9', color: '#1976d2' },
                error: { bg: '#ffebee', border: '#ef9a9a', color: '#c62828' },
                success: { bg: '#e8f5e9', border: '#a5d6a7', color: '#2e7d32' }
            };
            const theme = colors[type] || colors.info;

            Object.assign(notification.style, {
                position: 'fixed',
                bottom: '0px',
                left: '50%',
                transform: 'translateX(-50%)',
                padding: '18px 30px',
                background: theme.bg,
                border: `1px solid ${theme.border}`,
                color: theme.color,
                borderRadius: '8px',
                boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
                zIndex: '100000',
                fontSize: '21px',
                fontWeight: 'bold',
                transition: 'opacity 0.3s, bottom 0.3s',
                opacity: '0'
            });
            notification.textContent = message;
            document.body.appendChild(notification);

            requestAnimationFrame(() => {
                notification.style.opacity = '1';
                notification.style.bottom = '200px';
            });

            setTimeout(() => {
                notification.style.opacity = '0';
                notification.style.bottom = '0px';
                setTimeout(() => notification.remove(), 300);
            }, duration);
        },

        // ── PDF Generation from Email ────────────────────────────────

        /**
         * Generates a PDF from the email report content.
         * Named with "ifax report" suffix, following the existing PDF naming pattern.
         * @param {string} subject - Email subject.
         * @param {string} bodyText - Email body text.
         * @param {Object|null} record - Matched fax record (may be null).
         * @param {{success: boolean, text: string}|null} status - Fax status (may be null).
         */
        async _generatePdfFromEmail(subject, bodyText, record, status) {
            try {
                // Load PDFLib
                const PDFLib = window.PDFLib;
                if (!PDFLib) {
                    console.warn('[CM-Notes] PDFLib not available for email PDF generation');
                    return;
                }

                const { PDFDocument, rgb, StandardFonts } = PDFLib;
                const pdfDoc = await PDFDocument.create();
                const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
                const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
                const page = pdfDoc.addPage([612, 792]); // US Letter
                const black = rgb(0, 0, 0);
                const gray = rgb(0.4, 0.4, 0.4);
                const red = rgb(0.8, 0, 0);
                const green = rgb(0, 0.5, 0);

                let y = 750;
                const margin = 50;
                const fontSize = 10;
                const lineHeight = 14;

                // Helper: draw a line of text with word wrap
                const drawLine = (text, size = fontSize, font = helvetica, color = black) => {
                    if (y < 40) {
                        // Add new page
                        const newPage = pdfDoc.addPage([612, 792]);
                        y = 750;
                    }
                    page.drawText(text, {
                        x: margin,
                        y: y,
                        size: size,
                        font: font,
                        color: color,
                        maxWidth: 512
                    });
                    y -= (size + 4);
                };

                // ── Title ──
                drawLine('iFax Report', 18, helveticaBold, rgb(0.2, 0.2, 0.2));
                y -= 4;

                // ── Date ──
                const now = new Date();
                const dateStr = now.toLocaleDateString('en-US', {
                    month: 'short', day: '2-digit', year: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                });
                drawLine('Generated: ' + dateStr, 9, helvetica, gray);
                y -= 6;

                // ── Separator ──
                page.drawLine({
                    start: { x: margin, y: y + 4 },
                    end: { x: 562, y: y + 4 },
                    thickness: 1,
                    color: rgb(0.8, 0.8, 0.8)
                });
                y -= 8;

                // ── Status ──
                if (status) {
                    const statusColor = status.success ? green : red;
                    drawLine('Status: ' + status.text.toUpperCase(), 14, helveticaBold, statusColor);
                    y -= 4;
                }

                // ── Client / Record Info ──
                if (record) {
                    drawLine('Letter Type: ' + (record.letterType || 'N/A'), 11, helveticaBold);
                    drawLine('Fax Number: ' + (record.faxNumber || 'N/A'), 11, helveticaBold);
                    if (record.clientName) {
                        drawLine('Client: ' + record.clientName, 11, helveticaBold);
                    }
                    if (record.timestamp) {
                        const faxDate = new Date(record.timestamp);
                        drawLine('Faxed At: ' + faxDate.toLocaleString(), 10, helvetica, gray);
                    }
                } else {
                    drawLine('Fax Number: ' + this._extractFaxNumber(bodyText) || 'Unknown', 11, helveticaBold);
                }
                y -= 6;

                // ── Separator ──
                page.drawLine({
                    start: { x: margin, y: y + 4 },
                    end: { x: 562, y: y + 4 },
                    thickness: 1,
                    color: rgb(0.8, 0.8, 0.8)
                });
                y -= 8;

                // ── Subject ──
                drawLine('Subject: ' + (subject || 'No Subject'), 11, helveticaBold);
                y -= 4;

                // ── Email Body ──
                drawLine('Email Content:', 11, helveticaBold);
                y -= 2;

                if (bodyText) {
                    // Split body into lines and draw
                    const lines = bodyText.split('\n');
                    for (const line of lines) {
                        if (line.trim()) {
                            drawLine(line.trim(), fontSize, helvetica, gray);
                        } else {
                            y -= 6; // Empty line spacing
                        }
                    }
                }

                // ── Footer ──
                y = 30;
                page.drawText('KD CM Notes - iFax Report Monitor', {
                    x: margin, y: y, size: 8, font: helvetica, color: gray
                });

                // ── Build filename ──
                const today = now.toLocaleDateString('en-US', {
                    month: 'short', day: '2-digit', year: 'numeric'
                }).replace(/\//g, '-');

                let namePart = '';
                if (record && record.clientName) {
                    namePart = ' - ' + record.clientName;
                } else {
                    // Try to extract the "to" number from body
                    const parsed = this._parseFaxEmailLine(bodyText);
                    const faxNum = (parsed && parsed.toNumber) || 'Unknown';
                    namePart = ' - Fax ' + faxNum;
                }

                const filename = `To Be Faxed/iFax Report${namePart} - ${today}.pdf`;

                // ── Save & Download ──
                const pdfBytes = await pdfDoc.save();
                const blob = new Blob([pdfBytes], { type: 'application/pdf' });
                const url = URL.createObjectURL(blob);

                // Use the background script to download (same pattern as FeaturePanels.js)
                if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
                    const pdfBase64 = await pdfDoc.saveAsBase64({ dataUri: true });
                    chrome.runtime.sendMessage({
                        action: 'DOWNLOAD_FILE',
                        url: pdfBase64,
                        filename: filename
                    }, (response) => {
                        if (chrome.runtime.lastError) {
                            console.error('[CM-Notes] Email PDF download failed:', chrome.runtime.lastError);
                        } else {
                            console.log('[CM-Notes] Email PDF saved:', filename);
                        }
                    });
                } else {
                    // Fallback: direct download
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = filename;
                    a.click();
                    URL.revokeObjectURL(url);
                }

                console.log('[CM-Notes] Generated iFax report PDF:', filename);

            } catch (e) {
                console.error('[CM-Notes] Failed to generate email PDF:', e);
            }
        },

        /**
         * Removes a processed fax record from storage.
         * @param {Object} recordToRemove - The record to remove.
         */
        _removeFaxRecord(recordToRemove) {
            try {
                const records = this._getFaxRecords();
                // Remove by matching faxNumber + timestamp (reference is unreliable for deserialized objects)
                const filtered = records.filter(r =>
                    !(r.faxNumber === recordToRemove.faxNumber &&
                        r.timestamp === recordToRemove.timestamp)
                );
                GM_setValue(this.STORAGE_KEY_RECORDS, filtered);
            } catch (e) {
                console.warn('[CM-Notes] Failed to remove fax record:', e);
            }
        },

        /**
         * Formats a phone number for display.
         * @param {string} num - Raw phone number.
         * @returns {string} Formatted number.
         */
        _formatPhone(num) {
            if (!num) return '';
            const digits = num.replace(/\D/g, '');
            if (digits.length === 10) {
                return digits.substring(0, 3) + '-' + digits.substring(3, 6) + '-' + digits.substring(6);
            }
            if (digits.length === 11 && digits.startsWith('1')) {
                return digits.substring(1, 4) + '-' + digits.substring(4, 7) + '-' + digits.substring(7);
            }
            return num;
        },

        /**
         * Promise-based delay.
         * @param {number} ms - Milliseconds to wait.
         * @returns {Promise<void>}
         */
        _delay(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        },

        /**
         * Adds a fax record to storage (called from outside, e.g., FeaturePanels.js).
         * @param {{letterType: string, faxNumber: string, timestamp?: number, clientId?: string, clientName?: string}} record
         */
        staticAddFaxRecord(record) {
            try {
                const records = GM_getValue('sn_fax_records', []);
                records.push({
                    letterType: record.letterType || 'Unknown',
                    faxNumber: record.faxNumber || '',
                    timestamp: record.timestamp || Date.now(),
                    clientId: record.clientId || '',
                    clientName: record.clientName || ''
                });
                // Keep only last 100 records
                if (records.length > 100) {
                    records.splice(0, records.length - 100);
                }
                GM_setValue('sn_fax_records', records);
                console.log('[CM-Notes] Fax record saved:', record.letterType, record.faxNumber);
            } catch (e) {
                console.warn('[CM-Notes] Failed to save fax record:', e);
            }
        }
    };

    app.Automation.OutlookObserver = OutlookObserver;

    // Auto-initialize
    (function autoInit() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => OutlookObserver.init());
        } else {
            // Small delay to ensure GM_* shim is ready
            if (typeof GM_ready === 'function') {
                GM_ready().then(() => OutlookObserver.init());
            } else {
                setTimeout(() => OutlookObserver.init(), 1000);
            }
        }
    })();
})();
