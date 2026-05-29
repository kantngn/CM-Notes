/**
 * @file iFaxReceiptObserver.js
 * @description Observes the Outlook Web App for iFax confirmation/failure emails,
 *   extracts fax details, matches against pending faxes, generates a simple
 *   text-based PDF receipt, and stores a pending Last Activity log entry.
 *
 *   Runs as a content script on `https://outlook.live.com/*` and
 *   `https://outlook.office.com/*` / `https://outlook.office365.com/*`.
 *
 * @requires gm-compat.js       — GM_getValue / GM_setValue
 * @requires pdf-lib.min.js     — window.PDFLib
 *
 * @consumed-by FaxPanel.js — stores pending receipt info via GM storage
 */
(function () {
    'use strict';

    const TRIGGER_PHRASE = "Your fax message from";
    const LIST_SELECTOR   = '[role="main"], [aria-label="Message list"]';
    const BODY_SELECTOR   = '[aria-label="Message body"]';
    const UNREAD_SELECTOR = '[aria-label*="Unread"]:not([data-sn-ifax-processed]), [data-is-unread="true"]:not([data-sn-ifax-processed])';

    let isProcessing = false;
    let autoCheckTimeout = null;
    let _autoCheckRunning = false;
    // Track already-processed email subjects to avoid duplicate processing
    const _processedSubjects = new Set();

    console.log("[iFax Observer] Script loaded. readyState:", document.readyState);

    /**
     * Create a floating trigger button on the right edge of the screen.
     * Fully visible on creation, no peeking — so it's always findable.
     */
    function createTrigger() {
        const id = 'sn-ifax-observer-trigger';
        if (document.getElementById(id)) return;

        if (!document.body) {
            console.warn("[iFax Observer] Body not ready, retrying trigger in 500ms...");
            setTimeout(createTrigger, 500);
            return;
        }

        const savedY = GM_getValue('sn_ifax_observer_trigger_y', '50%');

        const t = document.createElement('div');
        t.id = id;
        t.title = 'iFax Observer — Click to manually check for unread confirmations';
        t.innerHTML = '📠';

        t.style.cssText = `
            position: fixed;
            right: 8px; left: auto;
            top: ${savedY};
            width: 42px;
            height: 44px;
            background: #1a1a2e;
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            z-index: 2147483647;
            border-radius: 8px;
            box-shadow: 0 2px 12px rgba(0,0,0,0.3);
            font-size: 22px;
            user-select: none;
            border: 1px solid rgba(255,255,255,0.15);
            opacity: 0.7;
            transition: opacity 0.2s, background 0.2s;
        `;

        t.onmouseenter = () => {
            t.style.opacity = '1';
            t.style.background = '#16213e';
        };
        t.onmouseleave = () => {
            t.style.opacity = '0.7';
            t.style.background = '#1a1a2e';
        };

        // ── Make draggable vertically ──
        let dragStartY, dragOrigTop;
        t.onmousedown = (e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            dragStartY = e.clientY;
            dragOrigTop = t.style.top;
            document.addEventListener('mousemove', onDrag);
            document.addEventListener('mouseup', onDragEnd);
        };
        function onDrag(e) {
            const dy = e.clientY - dragStartY;
            const currentPx = dragOrigTop.endsWith('%')
                ? window.innerHeight * (parseFloat(dragOrigTop) / 100)
                : parseFloat(dragOrigTop) || 0;
            const newPx = Math.max(10, Math.min(window.innerHeight - 60, currentPx + dy));
            t.style.top = newPx + 'px';
            // Move the label along with the trigger
            const lbl = document.getElementById('sn-ifax-observer-label');
            if (lbl) lbl.style.top = newPx + 'px';
        }
        function onDragEnd() {
            document.removeEventListener('mousemove', onDrag);
            document.removeEventListener('mouseup', onDragEnd);
            GM_setValue('sn_ifax_observer_trigger_y', t.style.top);
        }

        t.onclick = (e) => {
            e.stopPropagation();
            console.log("[iFax Observer] Trigger clicked — showing popup.");
            showTriggerPopup(t);
        };

        document.body.appendChild(t);

        // ── Fax info label next to trigger (hidden by default) ──
        const label = document.createElement('div');
        label.id = 'sn-ifax-observer-label';
        label.title = 'Click to hide';
        label.style.cssText = `
            position: fixed;
            right: 58px;
            top: ${savedY};
            height: 44px;
            background: #1a1a2e;
            color: #ccc;
            display: none;
            align-items: center;
            padding: 0 14px;
            border-radius: 8px;
            font: 12px/1.4 'Segoe UI', sans-serif;
            z-index: 2147483646;
            white-space: nowrap;
            box-shadow: 0 2px 12px rgba(0,0,0,0.3);
            border: 1px solid rgba(255,255,255,0.15);
            cursor: pointer;
            user-select: none;
            transition: opacity 0.2s;
        `;
        // Click label to dismiss it (stored in GM so it stays hidden per session)
        label.onclick = (e) => {
            e.stopPropagation();
            label.style.display = 'none';
            GM_setValue('sn_ifax_label_dismissed', Date.now());
        };
        document.body.appendChild(label);

        console.log("[iFax Observer] ✅ Trigger button added to DOM.");
    }

    /**
     * Initialize the observer. Retries if the message list container
     * hasn't rendered yet (Outlook SPA lazy-loads the pane).
     */
    function init() {
        createTrigger();

        const targetNode = document.querySelector(LIST_SELECTOR);
        if (!targetNode) {
            setTimeout(init, 2000);
            return;
        }

        console.log("[iFax Observer] Initialized. Observing for iFax confirmation emails...");

        // ── AUTO-PROCESSING: Observe email list for new unread iFax emails ──
        const listObserver = new MutationObserver(() => {
            scheduleAutoCheck();
        });
        listObserver.observe(targetNode, {
            childList: true,
            subtree: true
        });
        // Initial scan after Outlook finishes loading
        scheduleAutoCheck();

        // ── Watch body content changes (user clicks different emails) ──
        // Notification label updates automatically via body observer below.
        setTimeout(() => {
            const bodyNode = document.querySelector(BODY_SELECTOR);
            if (bodyNode) {
                const bodyObserver = new MutationObserver(() => {
                    updateFaxLabelFromBody();
                });
                bodyObserver.observe(bodyNode, {
                    childList: true,
                    subtree: true,
                    characterData: true
                });
                updateFaxLabelFromBody();
            }
        }, 4000);
    }

    /**
     * Debounced scheduler for auto-checking the email list.
     * Prevents flooding when Outlook rapidly re-renders the list.
     */
    function scheduleAutoCheck() {
        if (autoCheckTimeout) clearTimeout(autoCheckTimeout);
        // 3-second debounce — Outlook can fire many mutations during folder switches
        autoCheckTimeout = setTimeout(() => autoCheckForIFaxEmails(), 3000);
    }

    /**
     * Scans the email list for unread iFax confirmation emails and
     * auto-processes the first match found. Skips if already processing
     * or if the subject was previously processed.
     */
    async function autoCheckForIFaxEmails() {
        if (isProcessing || _autoCheckRunning) return;
        _autoCheckRunning = true;

        try {
            const targetNode = document.querySelector(LIST_SELECTOR);
            if (!targetNode) { _autoCheckRunning = false; return; }

            // Find all unread items that haven't been processed
            const unreadItems = targetNode.querySelectorAll(UNREAD_SELECTOR);
            for (const item of unreadItems) {
                // Quick text check to avoid clicking non-iFax emails
                const text = (item.innerText || item.textContent || '').trim();
                if (!text.includes(TRIGGER_PHRASE) && !text.toLowerCase().includes('ifax')) {
                    continue; // Skip non-iFax emails silently
                }

                // Extract unique key for dedup using fax numbers
                const faxMatchDedup = text.match(/Your fax message from\s+(\d+)\s+to\s+(\d+)\s+/i);
                const uniqueKey = faxMatchDedup
                    ? `ifax_${faxMatchDedup[1]}_${faxMatchDedup[2]}`
                    : text.slice(0, 80);
                if (_processedSubjects.has(uniqueKey)) {
                    item.setAttribute('data-sn-ifax-processed', 'true');
                    continue;
                }

                console.log("[iFax Observer] 🔍 Auto-detected unread iFax email, clicking to process...");
                const clickable = item.closest('[role="option"], [role="row"]') || item;
                clickable.click();
                isProcessing = true;
                item.setAttribute('data-sn-ifax-processed', 'true');
                _processedSubjects.add(uniqueKey);

                // Wait for Outlook to render the email body
                await new Promise(r => setTimeout(r, 2500));
                try {
                    await extractAndProcess(true); // true = autoMode
                } catch (e) {
                    console.warn("[iFax Observer] extractAndProcess error:", e);
                } finally {
                    // CRITICAL: Always release processing lock so future emails can be detected,
                    // even if extractAndProcess throws before reaching its own releaseLock call.
                    isProcessing = false;
                }
                _autoCheckRunning = false;
                // Schedule another check in case more unread iFax emails arrived during processing
                scheduleAutoCheck();
                return;
            }
        } catch (e) {
            console.warn("[iFax Observer] Auto-check error:", e);
        }
        _autoCheckRunning = false;
        // Safety: also release processing lock if it got stuck
        isProcessing = false;
    }

    /**
     * Finds the first unread email in the list, clicks it to load its body,
     * then delegates to `extractAndProcess`.
     */
    async function processLatestUnread() {
        if (isProcessing) return;

        const targetNode = document.querySelector(LIST_SELECTOR);
        if (!targetNode) return;

        const firstUnread = targetNode.querySelector(UNREAD_SELECTOR);
        if (!firstUnread) return;

        isProcessing = true;
        firstUnread.setAttribute('data-sn-ifax-processed', 'true');

        const clickable = firstUnread.closest('[role="option"], [role="row"]') || firstUnread;
        clickable.click();

        try {
            // Give Outlook time to render the email body
            await new Promise(r => setTimeout(r, 2000));
            await extractAndProcess();
        } finally {
            isProcessing = false;
        }
    }

    /**
     * Reads the email body, checks for iFax trigger phrase,
     * detects success vs failure, extracts fax metadata,
     * generates a simple text PDF receipt, and stores a pending LA entry.
     *
     * @param {boolean} [autoMode=false] - If true, skips the picker modal when
     *   no auto-match is found. Instead, logs the fax with basic info so the
     *   user can manually match later.
     */
    async function extractAndProcess(autoMode) {
        autoMode = autoMode === true;
        try {
            await _extractAndProcessImpl(autoMode);
        } finally {
            // Always release lock, even if _extractAndProcessImpl throws
            releaseLock();
        }
    }

    /**
     * Internal implementation of extractAndProcess. Always wrapped by try-finally
     * in extractAndProcess() to guarantee releaseLock() is called.
     */
    async function _extractAndProcessImpl(autoMode) {
        const bodyNode = document.querySelector(BODY_SELECTOR);
        if (!bodyNode) {
            console.warn("[iFax Observer] Email body not found. Releasing lock.");
            releaseLock();
            return;
        }

        const emailText = bodyNode.innerText.trim();
        const emailHTML = bodyNode.innerHTML;

        if (!emailText.includes(TRIGGER_PHRASE)) {
            console.log("[iFax Observer] Skipped — not an iFax confirmation.");
            releaseLock();
            return;
        }

        console.log("[iFax Observer] ✅ iFax email detected!");

        // Parse fax numbers (always present in trigger phrase)
        const numRegex = /Your fax message from\s+(\d+)\s+to\s+(\d+)\s+/i;
        const numMatch = emailText.match(numRegex);
        if (!numMatch) {
            console.warn("[iFax Observer] Could not parse fax numbers from email.");
            releaseLock();
            return;
        }
        const senderFax   = numMatch[1];
        const receiverFax = numMatch[2];

        // Determine if it's a SUCCESS or FAILURE
        const isSuccess = emailText.includes('successfully');
        const isFailure = emailText.includes('fail') || emailText.includes('error') || emailText.includes('not sent');

        // Parse date/time
        const dateRegex = /at\s+([\s\S]*?)\.\.?\s+Best regards/i;
        const dateMatch = emailText.match(dateRegex);
        const rawDate   = dateMatch ? dateMatch[1].replace(/\n/g, ' ').trim() : '';
        const emailDate = rawDate.replace(/\s+/g, ' ');

        console.table({ senderFax, receiverFax, isSuccess, emailDate });

        // ── Match against unified fax log (any non-failed status) ────
        const faxLog = GM_getValue('sn_fax_log', []);
        // Find the LATEST matching entry by receiver fax, excluding failures
        let matchedIndex = -1;
        let latestTs = 0;
        faxLog.forEach((entry, idx) => {
            if (entry.status === 'failed') return;
            const entryFax = (entry.faxNumber || entry.receiverFax || '').replace(/\D/g, '');
            if (entryFax === receiverFax && (entry.timestamp || 0) > latestTs) {
                latestTs = entry.timestamp || 0;
                matchedIndex = idx;
            }
        });

        let clientName, faxLabel, fileNameBase, clientId, entryId;
        if (matchedIndex !== -1) {
            const matched = faxLog[matchedIndex];
            clientName   = matched.clientName;
            faxLabel     = matched.faxLabel;
            fileNameBase = matched.fileName || '';
            clientId     = matched.clientId;
            entryId      = matched.id;
            console.log(`[iFax Observer] Matched fax log entry: ${clientName} - ${faxLabel}`);
            // NOTE: Do NOT clear sn_temp_fax_* values here — the iFaxAutomation
            // on the iFax tab depends on them for the notification bar and auto-upload.
            // The "Open iFax" handler in FaxPanel always sets fresh values before
            // opening the window, so stale values are not a concern.
        } else if (autoMode) {
            // Auto-mode: no picker — create a basic entry that the user can match later
            console.log("[iFax Observer] Auto-mode: no match found, creating basic entry for manual matching.");
            clientName   = 'Unknown';
            faxLabel     = 'Fax';
            clientId     = '';
            entryId      = Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
            const today = new Date().toLocaleDateString('en-US', {
                month: 'short', day: '2-digit', year: 'numeric'
            });
            fileNameBase = `Fax to ${formatFaxNum(receiverFax)} - ${today.replace(/\//g, '-')}`;
        } else {
            // No auto-match — show picker so user can choose the right fax log entry
            console.log("[iFax Observer] No matching fax log entry, prompting user to pick...");
            const picked = await showFaxPickerModal(faxLog, receiverFax);
            if (picked) {
                clientName   = picked.clientName || 'Unknown';
                faxLabel     = picked.faxLabel || 'Fax';
                clientId     = picked.clientId || '';
                entryId      = picked.id || (Date.now().toString(36) + Math.random().toString(36).substr(2, 6));
                // Use reversed name in fallback filename
                const reversedName = formatClientName(picked.clientName || '');
                const pickDate = new Date().toLocaleDateString('en-US', {month:'short', day:'2-digit', year:'numeric'}).replace(/\//g, '-');
                fileNameBase = picked.fileName || `${reversedName} - ${faxLabel} - ${pickDate}`;
                console.log(`[iFax Observer] User picked: ${clientName} - ${faxLabel}`);
            } else {
                // User cancelled — fall back to receiver fax number + date
                clientName   = 'Unknown';
                faxLabel     = 'Fax';
                clientId     = '';
                entryId      = Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
                const today = new Date().toLocaleDateString('en-US', {
                    month: 'short', day: '2-digit', year: 'numeric'
                });
                fileNameBase = `Fax to ${formatFaxNum(receiverFax)} - ${today.replace(/\//g, '-')}`;
                console.log("[iFax Observer] User cancelled picker, using fallback.");
            }
        }

        // ── Handle FAILURE ─────────────────────────────────────────────
        if (isFailure || (!isSuccess && emailText.includes('Fax'))) {
            console.warn("[iFax Observer] ❌ Fax FAILED.");
            if (matchedIndex !== -1) {
                faxLog[matchedIndex].status = 'failed';
                faxLog[matchedIndex].emailDate = emailDate;
                faxLog[matchedIndex].emailDateISO = new Date().toISOString();
                faxLog[matchedIndex].senderFax = senderFax;
            } else {
                faxLog.push({
                    id: entryId,
                    clientId, clientName, faxLabel,
                    faxType: '', faxNumber: receiverFax, receiverFax, senderFax,
                    status: 'failed', subject: '', content: '',
                    receiptContent: '', emailDate, emailDateISO: new Date().toISOString(),
                    pdfBase64: '', fileName: fileNameBase,
                    timestamp: Date.now(), resolvedAt: null,
                    dateTime: new Date().toISOString()
                });
            }
            if (faxLog.length > 500) faxLog.splice(0, faxLog.length - 500);
            GM_setValue('sn_fax_log', faxLog);
            GM_setValue('sn_fax_log_broadcast', Date.now());
            releaseLock();
            return;
        }

        // ── SUCCESS: extract Outlook email headers, then generate PDF ───
        // Use raw 10-digit fax numbers (as scraped from email content)
        const senderRaw   = senderFax;
        const receiverRaw = receiverFax;

        // Extract Outlook email header fields (From, Sent, To, Subject)
        const emailHeaders = extractOutlookHeaders();

        const reportContent =
`Fax from ${senderRaw} to ${receiverRaw} was sent successfully.
Dear customer.

Your fax message from ${senderRaw} to ${receiverRaw} was sent successfully at ${emailDate}..
Best regards,
iFax.PRO.`;

        // Generate and download a PDF receipt that looks like the Outlook email
        generateReceiptPdf(emailHTML, reportContent, senderFax, receiverFax, emailDate, clientName, faxLabel, fileNameBase, emailHeaders);

        // ── Update unified fax log with receipt data ───────────────────
        if (matchedIndex !== -1) {
            faxLog[matchedIndex].status = 'pending_la';
            faxLog[matchedIndex].senderFax = senderFax;
            faxLog[matchedIndex].receiverFax = receiverFax;
            faxLog[matchedIndex].receiptContent = reportContent;
            faxLog[matchedIndex].emailDate = emailDate;
            faxLog[matchedIndex].emailDateISO = new Date().toISOString();
        } else {
            faxLog.push({
                id: entryId,
                clientId, clientName, faxLabel,
                faxType: '', faxNumber: receiverFax, receiverFax, senderFax,
                status: 'pending_la',
                subject: '', content: '',
                receiptContent: reportContent,
                emailDate, emailDateISO: new Date().toISOString(),
                pdfBase64: '', fileName: fileNameBase,
                timestamp: Date.now(), resolvedAt: null,
                dateTime: new Date().toISOString()
            });
        }
        if (faxLog.length > 500) faxLog.splice(0, faxLog.length - 500);
        GM_setValue('sn_fax_log', faxLog);
        GM_setValue('sn_fax_log_broadcast', Date.now());

        // ── Store pending auto-LA data for SF tab to auto-create ───────
        // Only in autoMode with a real client match. Appends the iFax report
        // content after the pre-built LA content (from _buildDraftLA).
        if (clientId && autoMode && matchedIndex !== -1) {
            const matched = faxLog[matchedIndex];
            const pendingLAs = GM_getValue('sn_pending_auto_las', []);
            // Avoid duplicates
            if (!pendingLAs.some(p => p.entryId === entryId)) {
                pendingLAs.push({
                    entryId,
                    clientId,
                    clientName,
                    faxLabel,
                    subject: matched.subject || `Fax Submitted - ${faxLabel}`,
                    content: matched.content
                        ? `${matched.content}\n\n${reportContent}`
                        : reportContent,
                    receiverFax: receiverFax,
                    timestamp: Date.now()
                });
                if (pendingLAs.length > 50) pendingLAs.splice(0, pendingLAs.length - 50);
                GM_setValue('sn_pending_auto_las', pendingLAs);
                console.log("[iFax Observer] 📝 Stored pending auto-LA for:", clientName, faxLabel);
            }
        }

        // Broadcast toast to SF tab
        GM_setValue('sn_ifax_report_toast', {
            id: entryId,
            clientId,
            clientName,
            faxLabel,
            status: 'success',
            timestamp: Date.now()
        });

        // ── Copy email body to clipboard ──────────────────────────────
        try {
            navigator.clipboard.writeText(emailText).catch(() => {
                const ta = document.createElement('textarea');
                ta.value = emailText;
                ta.style.position = 'fixed';
                ta.style.left = '-9999px';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                ta.remove();
            });
        } catch (_) {
            // Clipboard failure is non-critical
        }

        // ── Mark email as read after successful processing ───────────
        markCurrentEmailAsRead();

        releaseLock();
    }

    /**
     * Extracts Outlook email header fields (From, Sent, To, Subject)
     * from the reading pane DOM. Returns an object with these fields.
     *
     * IMPORTANT: Outlook Web's DOM is complex and changes frequently.
     * We use multiple fallback strategies.  If a field cannot be reliably
     * scraped, it is left empty so the caller can use a sensible fallback.
     *
     * @returns {{ from: string, sent: string, to: string, subject: string }}
     */
    function extractOutlookHeaders() {
        const result = { from: '', sent: '', to: '', subject: '' };

        try {
            // ── Subject ──
            // Outlook Web: the conversation subject is often in an h1 or a heading element
            const subjectEl =
                document.querySelector('[role="heading"][aria-level="1"]') ||
                document.querySelector('h1[aria-label]') ||
                document.querySelector('[data-content="subject"]') ||
                document.querySelector('.ms-ConversationHeader-title') ||
                document.querySelector('[class*="subject"]');
            if (subjectEl) {
                result.subject = (subjectEl.getAttribute('aria-label') || subjectEl.textContent || '').trim();
            }

            // ── From ──
            // Prefer the sender-persona element (Outlook's styled sender pill)
            const fromEl =
                document.querySelector('[class*="sender"] [class*="name"]') ||       // Outlook sender persona name
                document.querySelector('[class*="Persona"] [class*="primary"]') ||    // Persona card primary text
                document.querySelector('[class*="from"] [class*="name"]') ||
                document.querySelector('[aria-label^="From"]') ||                     // Exact prefix "From" (not substring)
                document.querySelector('[data-content="from"]') ||
                document.querySelector('.ms-MessageHeader-from') ||
                document.querySelector('[class*="from"] span');
            if (fromEl) {
                result.from = (fromEl.getAttribute('aria-label') || fromEl.textContent || '').trim();
                // aria-label may be "From, Kant Nguyen" — strip the "From, " prefix
                if (result.from.toLowerCase().startsWith('from')) {
                    result.from = result.from.replace(/^from[,\s]+/i, '').trim();
                }
            }

            // ── To ──
            // Outlook Web: the "To" line is often in an expandable section.
            // We use EXACT prefix matching (^=) to avoid matching "Today", "To do", etc.
            // Also try the recipient-well / addressing-well containers.
            const toEl =
                document.querySelector('[class*="recipient"] [class*="name"]') ||     // Recipient well name
                document.querySelector('[class*="addressing"] [class*="name"]') ||    // Addressing well
                document.querySelector('[class*="to"] [class*="recipient"]') ||
                document.querySelector('[aria-label^="To "], [aria-label="To"]') ||   // Exact "To" or starts with "To "
                document.querySelector('[data-content="to"]') ||
                document.querySelector('.ms-MessageHeader-to');
            if (toEl) {
                let rawTo = (toEl.getAttribute('aria-label') || toEl.textContent || '').trim();
                if (rawTo.toLowerCase().startsWith('to')) {
                    rawTo = rawTo.replace(/^to[,\s]+/i, '').trim();
                }
                // Sanity check: if we got garbage (single short word that looks like a UI fragment), discard
                if (rawTo && rawTo.length > 2 && !/^(do|to|cc|bcc|send|save|new|open|view|edit|delete)$/i.test(rawTo)) {
                    result.to = rawTo;
                }
            }
            // If still empty, try the CM's known email as a fallback for the To line
            if (!result.to) {
                const cmEmail = GM_getValue('sn_global_email', '');
                if (cmEmail) {
                    result.to = cmEmail;
                    console.log("[iFax Observer] Using stored CM email for To field:", cmEmail);
                }
            }
            // If STILL empty, try scraping from the email body (iFax puts recipient email in the body)
            if (!result.to) {
                const bodyNode = document.querySelector(BODY_SELECTOR);
                if (bodyNode) {
                    const bodyText = bodyNode.innerText || '';
                    const toMatch = bodyText.match(/to\s+([\w.+-]+@[\w-]+\.[\w.-]+)/i);
                    if (toMatch) {
                        result.to = toMatch[1];
                        console.log("[iFax Observer] Scraped To email from body:", result.to);
                    }
                }
            }

            // ── Sent / Date ──
            const sentEl =
                document.querySelector('[aria-label^="Sent"]') ||                   // Exact prefix "Sent"
                document.querySelector('[data-content="sent"]') ||
                document.querySelector('.ms-MessageHeader-sent') ||
                document.querySelector('[class*="date"] span') ||
                document.querySelector('[class*="sent"] span');
            if (sentEl) {
                result.sent = (sentEl.getAttribute('aria-label') || sentEl.textContent || '').trim();
                if (result.sent.toLowerCase().startsWith('sent')) {
                    result.sent = result.sent.replace(/^sent[,\s]+/i, '').trim();
                }
            }

            // ── DIAGNOSTIC: dump ALL elements that might contain "To" info ──
            console.log("[iFax Observer] === DIAGNOSTIC: To-field candidates ===");
            // Dump all elements with aria-label containing "To" (for debugging)
            const allToAria = document.querySelectorAll('[aria-label*="To"], [aria-label*="to"]');
            allToAria.forEach((el, i) => {
                console.log(`  [${i}] tag=${el.tagName} aria-label="${el.getAttribute('aria-label')}" text="${(el.textContent||'').trim().slice(0,60)}"`);
            });
            // Dump recipient/addressing well elements
            const recipEls = document.querySelectorAll('[class*="recipient"], [class*="addressing"], [class*="to"]');
            recipEls.forEach((el, i) => {
                const txt = (el.textContent || '').trim();
                if (txt.length > 1 && txt.length < 80) {
                    console.log(`  RECIP[${i}] class="${el.className}" text="${txt}"`);
                }
            });
            console.log("[iFax Observer] === END DIAGNOSTIC ===");

            console.log("[iFax Observer] Extracted Outlook headers:", result);
        } catch (e) {
            console.warn("[iFax Observer] Failed to extract Outlook headers:", e);
        }

        return result;
    }

    /**
     * Shows a modal dialog listing recent fax log entries so the user can pick one.
     * Filters to entries with status 'completed' or 'awaiting_report', sorted newest first.
     * Includes a text input filter to search by client name or fax number.
     *
     * @param {Array} faxLog      — The full fax log array from GM storage
     * @param {string} receiverFax — The receiver fax from the email (pre-filled in filter)
     * @returns {Promise<Object|null>} — The selected fax log entry, or null if cancelled
     */
    function showFaxPickerModal(faxLog, receiverFax) {
        return new Promise((resolve) => {
            // Filter to relevant entries (any non-failed status) and sort newest first
            const entries = (faxLog || [])
                .filter(e => e.status !== 'failed')
                .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

            if (entries.length === 0) {
                console.warn("[iFax Observer] No fax log entries available to pick from.");
                resolve(null);
                return;
            }

            // ── Build modal overlay ──
            const overlay = document.createElement('div');
            overlay.id = 'sn-ifax-picker-overlay';
            overlay.style.cssText = `
                position: fixed;
                top: 0; left: 0; right: 0; bottom: 0;
                background: rgba(0,0,0,0.55);
                z-index: 2147483647;
                display: flex;
                align-items: center;
                justify-content: center;
                font-family: 'Segoe UI', system-ui, sans-serif;
            `;

            // ── Build modal card ──
            const card = document.createElement('div');
            card.style.cssText = `
                background: #1e1e2e;
                color: #e0e0e0;
                border-radius: 12px;
                box-shadow: 0 8px 32px rgba(0,0,0,0.5);
                width: 520px;
                max-height: 80vh;
                display: flex;
                flex-direction: column;
                overflow: hidden;
                border: 1px solid rgba(255,255,255,0.1);
            `;

            // ── Header ──
            const header = document.createElement('div');
            header.style.cssText = `
                padding: 16px 20px 12px 20px;
                border-bottom: 1px solid rgba(255,255,255,0.08);
                display: flex;
                justify-content: space-between;
                align-items: center;
            `;
            header.innerHTML = `<span style="font-size:14px;font-weight:600;">Select a fax record</span>`;

            const closeBtn = document.createElement('button');
            closeBtn.textContent = '✕';
            closeBtn.style.cssText = `
                background: none; border: none; color: #888;
                font-size: 18px; cursor: pointer; padding: 4px 8px;
                border-radius: 4px;
            `;
            closeBtn.onmouseenter = () => closeBtn.style.color = '#fff';
            closeBtn.onmouseleave = () => closeBtn.style.color = '#888';
            closeBtn.onclick = () => { overlay.remove(); resolve(null); };
            header.appendChild(closeBtn);
            card.appendChild(header);

            // ── Search filter ──
            const filterRow = document.createElement('div');
            filterRow.style.cssText = 'padding: 10px 20px; border-bottom: 1px solid rgba(255,255,255,0.06);';
            const filterInput = document.createElement('input');
            filterInput.type = 'text';
            filterInput.placeholder = '🔍  Filter by client name or fax number...';
            filterInput.value = receiverFax ? receiverFax.replace(/\D/g, '') : '';
            filterInput.style.cssText = `
                width: 100%; padding: 8px 12px; border-radius: 6px;
                border: 1px solid rgba(255,255,255,0.12);
                background: #2a2a3e; color: #e0e0e0;
                font-size: 13px; outline: none;
                box-sizing: border-box;
            `;
            filterInput.onfocus = () => { filterInput.style.borderColor = '#4a6cf7'; };
            filterInput.onblur = () => { filterInput.style.borderColor = 'rgba(255,255,255,0.12)'; };
            filterRow.appendChild(filterInput);
            card.appendChild(filterRow);

            // ── List container ──
            const list = document.createElement('div');
            list.style.cssText = `
                flex: 1; overflow-y: auto; padding: 8px 0;
            `;

            function renderList(filterText) {
                const q = (filterText || '').toLowerCase().replace(/\D/g, '');
                const filtered = !q ? entries : entries.filter(e => {
                    const name = (e.clientName || '').toLowerCase();
                    const num  = (e.faxNumber || e.receiverFax || '').replace(/\D/g, '');
                    return name.includes(q) || num.includes(q);
                });

                list.innerHTML = '';
                if (filtered.length === 0) {
                    const empty = document.createElement('div');
                    empty.style.cssText = 'padding: 32px 20px; text-align: center; color: #888; font-size: 13px;';
                    empty.textContent = 'No matching fax records found.';
                    list.appendChild(empty);
                    return;
                }

                filtered.forEach((entry) => {
                    const row = document.createElement('div');
                    row.style.cssText = `
                        display: flex; align-items: center; gap: 12px;
                        padding: 10px 20px; cursor: pointer;
                        border-bottom: 1px solid rgba(255,255,255,0.04);
                        transition: background 0.15s;
                    `;
                    row.onmouseenter = () => { row.style.background = 'rgba(74,108,247,0.12)'; };
                    row.onmouseleave = () => { row.style.background = 'transparent'; };
                    row.onclick = () => {
                        overlay.remove();
                        resolve(entry);
                    };

                    const statusDot = document.createElement('span');
                    const dotColor = entry.status === 'completed' ? '#4ade80' : '#facc15';
                    statusDot.textContent = '●';
                    statusDot.style.cssText = `color:${dotColor}; font-size:10px; flex-shrink:0;`;

                    const info = document.createElement('div');
                    info.style.cssText = 'flex:1; min-width:0;';
                    const nameLine = document.createElement('div');
                    nameLine.style.cssText = 'font-size:13px; font-weight:500; color:#e0e0e0;';
                    nameLine.textContent = `${entry.clientName || 'Unknown'} — ${entry.faxLabel || 'Fax'}`;
                    const subLine = document.createElement('div');
                    subLine.style.cssText = 'font-size:11px; color:#888; margin-top:2px;';
                    const faxNum = entry.faxNumber || entry.receiverFax || '';
                    const dateStr = entry.dateTime
                        ? new Date(entry.dateTime).toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'})
                        : '';
                    subLine.textContent = [faxNum, dateStr].filter(Boolean).join(' · ');

                    info.appendChild(nameLine);
                    info.appendChild(subLine);
                    row.appendChild(statusDot);
                    row.appendChild(info);
                    list.appendChild(row);
                });
            }

            filterInput.oninput = () => renderList(filterInput.value);
            card.appendChild(list);

            // ── Footer ──
            const footer = document.createElement('div');
            footer.style.cssText = `
                padding: 10px 20px; border-top: 1px solid rgba(255,255,255,0.08);
                display: flex; justify-content: flex-end; gap: 8px;
            `;
            const cancelBtn = document.createElement('button');
            cancelBtn.textContent = 'Cancel';
            cancelBtn.style.cssText = `
                padding: 6px 16px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.15);
                background: transparent; color: #ccc; font-size: 12px; cursor: pointer;
            `;
            cancelBtn.onmouseenter = () => { cancelBtn.style.background = 'rgba(255,255,255,0.08)'; };
            cancelBtn.onmouseleave = () => { cancelBtn.style.background = 'transparent'; };
            cancelBtn.onclick = () => { overlay.remove(); resolve(null); };
            footer.appendChild(cancelBtn);
            card.appendChild(footer);

            overlay.appendChild(card);
            document.body.appendChild(overlay);

            // Focus the filter input
            setTimeout(() => filterInput.focus(), 100);

            // Initial render
            renderList(filterInput.value);
        });
    }

    /**
     * Marks the currently open email as read in Outlook Web.
     * Uses multiple strategies to find the "Mark as read" button/toggle.
     */
    function markCurrentEmailAsRead() {
        try {
            // Strategy 1: Find "Mark as read" button in the command bar / toolbar
            const markReadBtn = document.querySelector(
                'button[aria-label="Mark as read"], ' +
                'button[title="Mark as read"], ' +
                '[data-automationid="MarkAsReadButton"], ' +
                '[data-automationid="markAsRead"], ' +
                '[icon-name="Read"], ' +
                'button[aria-label*="mark as read" i]'
            );
            if (markReadBtn) {
                markReadBtn.click();
                console.log("[iFax Observer] ✅ Email marked as read via toolbar button.");
                return true;
            }

            // Strategy 2: Find selected row in message list and toggle its read indicator
            // Outlook often has an unread indicator (blue dot/bar) on the row
            const selectedRow = document.querySelector(
                '[role="option"][aria-selected="true"], ' +
                '[role="row"][aria-selected="true"], ' +
                '.ms-List-cell[aria-selected="true"]'
            );
            if (selectedRow) {
                // Try clicking the "Mark as read" context menu action
                const ctxBtn = selectedRow.querySelector(
                    '[class*="markAsRead"], ' +
                    '[data-icon-name*="Read"], ' +
                    'button[title*="Mark as read"]'
                );
                if (ctxBtn) {
                    ctxBtn.click();
                    console.log("[iFax Observer] ✅ Email marked as read via row action.");
                    return true;
                }
            }

            // Strategy 3: Try to remove the unread attribute directly on the selected row
            // This is a visual-only approach, but helps with the selector matching
            const anyUnread = document.querySelector('[aria-selected="true"] [data-is-unread="true"]');
            if (anyUnread) {
                anyUnread.setAttribute('data-is-unread', 'false');
                console.log("[iFax Observer] ✅ Email marked as read via data attribute.");
                return true;
            }

            console.warn("[iFax Observer] Could not find Mark as read button.");
            return false;
        } catch (e) {
            console.warn("[iFax Observer] markCurrentEmailAsRead error:", e);
            return false;
        }
    }

    /**
     * Releases the processing lock and clears the processed marker
     * on the currently selected email row.
     */
    function releaseLock() {
        const targetNode = document.querySelector(LIST_SELECTOR);
        if (targetNode) {
            const activeRow = targetNode.querySelector('[data-sn-ifax-processed="true"]');
            // Keep data-sn-ifax-processed attribute so the email is not re-processed
            // on subsequent autoCheckForIFaxEmails runs or page re-scans.
            // Outlook marks the email as read after clicking, but the processed marker
            // is an extra safeguard against duplicates.
        }
        isProcessing = false;
    }

    /**
     * Shows a popup menu next to the trigger button with actions for the current email.
     * @param {HTMLElement} triggerBtn — The trigger button element
     */
    function showTriggerPopup(triggerBtn) {
        // Remove any existing popup
        const existing = document.getElementById('sn-ifax-popup');
        if (existing) { existing.remove(); return; }

        const popup = document.createElement('div');
        popup.id = 'sn-ifax-popup';
        popup.style.cssText = `
            position: fixed;
            right: 58px;
            top: ${triggerBtn.style.top || '50%'};
            background: #1e1e2e;
            color: #e0e0e0;
            border-radius: 10px;
            box-shadow: 0 6px 24px rgba(0,0,0,0.5);
            width: 240px;
            z-index: 2147483647;
            border: 1px solid rgba(255,255,255,0.1);
            font-family: 'Segoe UI', system-ui, sans-serif;
            overflow: hidden;
        `;

        // ── Current fax info line ──
        const label = document.getElementById('sn-ifax-observer-label');
        const infoLine = document.createElement('div');
        infoLine.style.cssText = `
            padding: 10px 14px; font-size: 11px; color: #aaa;
            border-bottom: 1px solid rgba(255,255,255,0.06);
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        `;
        infoLine.textContent = label && label.style.display !== 'none'
            ? label.textContent
            : 'No iFax email detected';
        popup.appendChild(infoLine);

        // ── Match / Refresh button ──
        const matchBtn = document.createElement('div');
        matchBtn.textContent = '🔄  Match with fax entry';
        matchBtn.style.cssText = `
            padding: 10px 14px; font-size: 13px; cursor: pointer;
            border-bottom: 1px solid rgba(255,255,255,0.04);
            transition: background 0.15s;
        `;
        matchBtn.onmouseenter = () => { matchBtn.style.background = 'rgba(74,108,247,0.15)'; };
        matchBtn.onmouseleave = () => { matchBtn.style.background = 'transparent'; };
        matchBtn.onclick = (e) => {
            e.stopPropagation();
            popup.remove();
            // Re-scan body and update label, clearing any dismissed state
            GM_setValue('sn_ifax_label_dismissed', 0);
            updateFaxLabelFromBody();
        };
        popup.appendChild(matchBtn);

        // ── Close popup when clicking outside ──
        const closeHandler = (ev) => {
            if (!popup.contains(ev.target) && ev.target !== triggerBtn) {
                popup.remove();
                document.removeEventListener('click', closeHandler);
            }
        };
        setTimeout(() => document.addEventListener('click', closeHandler), 10);

        document.body.appendChild(popup);
    }

    /**
     * Reads the currently open email body, parses fax details, matches/prompts
     * for a fax log entry, generates the PDF receipt, and downloads it.
     * Does NOT mark the email as read or auto-process.
     */
    async function downloadReceiptFromCurrentEmail() {
        const bodyNode = document.querySelector(BODY_SELECTOR);
        if (!bodyNode) {
            console.warn("[iFax Observer] No email body found.");
            return;
        }

        const emailText = bodyNode.innerText.trim();
        const emailHTML = bodyNode.innerHTML;

        if (!emailText.includes(TRIGGER_PHRASE)) {
            console.log("[iFax Observer] Not an iFax confirmation — nothing to download.");
            return;
        }

        console.log("[iFax Observer] Manual download — parsing fax email...");

        // Parse fax numbers
        const numRegex = /Your fax message from\s+(\d+)\s+to\s+(\d+)\s+/i;
        const numMatch = emailText.match(numRegex);
        if (!numMatch) {
            console.warn("[iFax Observer] Could not parse fax numbers.");
            return;
        }
        const senderFax   = numMatch[1];
        const receiverFax = numMatch[2];

        // Parse date
        const dateRegex = /at\s+([\s\S]*?)\.\.?\s+Best regards/i;
        const dateMatch = emailText.match(dateRegex);
        const rawDate   = dateMatch ? dateMatch[1].replace(/\n/g, ' ').trim() : '';
        const emailDate = rawDate.replace(/\s+/g, ' ');

        // Determine success/failure
        const isFailure = emailText.includes('fail') || emailText.includes('error') || emailText.includes('not sent');
        if (isFailure) {
            console.warn("[iFax Observer] Email indicates failure — nothing to download.");
            return;
        }

        // Try to match in fax log (any non-failed status, newest first)
        const faxLog = GM_getValue('sn_fax_log', []);
        let matchedIndex = -1;
        let latestTs = 0;
        faxLog.forEach((entry, idx) => {
            if (entry.status === 'failed') return;
            const entryFax = (entry.faxNumber || entry.receiverFax || '').replace(/\D/g, '');
            if (entryFax === receiverFax && (entry.timestamp || 0) > latestTs) {
                latestTs = entry.timestamp || 0;
                matchedIndex = idx;
            }
        });

        let clientName, faxLabel, fileNameBase, clientId, entryId;
        if (matchedIndex !== -1) {
            const matched = faxLog[matchedIndex];
            clientName   = matched.clientName || 'Unknown';
            faxLabel     = matched.faxLabel || 'Fax';
            fileNameBase = matched.fileName || '';
            clientId     = matched.clientId || '';
            entryId      = matched.id || (Date.now().toString(36) + Math.random().toString(36).substr(2, 6));
            console.log(`[iFax Observer] Matched fax log entry: ${clientName} - ${faxLabel}`);
        } else {
            // No match — show picker
            const picked = await showFaxPickerModal(faxLog, receiverFax);
            if (picked) {
                clientName   = picked.clientName || 'Unknown';
                faxLabel     = picked.faxLabel || 'Fax';
                clientId     = picked.clientId || '';
                entryId      = picked.id || (Date.now().toString(36) + Math.random().toString(36).substr(2, 6));
                // Use reversed name in fallback filename
                const reversedName = formatClientName(picked.clientName || '');
                const pickDate = new Date().toLocaleDateString('en-US', {month:'short', day:'2-digit', year:'numeric'}).replace(/\//g, '-');
                fileNameBase = picked.fileName || `${reversedName} - ${faxLabel} - ${pickDate}`;
                matchedIndex = faxLog.findIndex(e => e.id === entryId);
                console.log(`[iFax Observer] User picked: ${clientName} - ${faxLabel}`);
            } else {
                console.log("[iFax Observer] User cancelled — skipping download.");
                return;
            }
        }

        // Extract Outlook headers
        const emailHeaders = extractOutlookHeaders();

        // Generate and download
        await generateReceiptPdf(
            emailHTML,
            '',
            senderFax, receiverFax, emailDate,
            clientName, faxLabel, fileNameBase, emailHeaders
        );

        // Update fax log entry with receipt data
        if (matchedIndex !== -1) {
            faxLog[matchedIndex].status = 'pending_la';
            faxLog[matchedIndex].senderFax = senderFax;
            faxLog[matchedIndex].receiverFax = receiverFax;
            faxLog[matchedIndex].emailDate = emailDate;
            faxLog[matchedIndex].emailDateISO = new Date().toISOString();
            faxLog[matchedIndex].receiptContent = emailText;
            GM_setValue('sn_fax_log', faxLog);
            GM_setValue('sn_fax_log_broadcast', Date.now());
            // NOTE: Manual download does NOT store pending LA — user creates LA manually.
        }

        console.log("[iFax Observer] ✅ Manual receipt download complete.");
    }

    /**
     * Generates a PDF receipt that is a carbon copy of Outlook's print view.
     *
     * Outlook's print layout (top → bottom):
     *   [timestamp left]  [folder - account - Outlook center]
     *   Subject line (bold, standalone — NO "Subject:" label)
     *   From:  value
     *   Date:  value
     *   To:    value
     *   ───── divider ─────
     *   [email body verbatim]
     *
     * @param {string} emailHTML      — The raw HTML from the email body
     * @param {string} reportContent  — Fallback plain-text report content
     * @param {string} senderFax      — Raw sender fax digits
     * @param {string} receiverFax    — Raw receiver fax digits
     * @param {string} emailDate      — Formatted fax completion datetime
     * @param {string} clientName     — Client name
     * @param {string} faxLabel       — Label (e.g. "Letter 25")
     * @param {string} fileNameBase   — Base filename without extension
     * @param {{ from: string, sent: string, to: string, subject: string }} headers — Outlook email headers
     */
    async function generateReceiptPdf(emailHTML, reportContent, senderFax, receiverFax, emailDate, clientName, faxLabel, fileNameBase, headers) {
        try {
            const PDFLib = window.PDFLib;
            if (!PDFLib || typeof html2canvas === 'undefined') {
                console.error("[iFax Observer] PDFLib or html2canvas not available.");
                return;
            }

            // Use raw 10-digit fax numbers (as scraped from email content)
            const senderRaw   = senderFax;
            const receiverRaw = receiverFax;
            const h = headers || {};

            // Use extracted Outlook headers; fall back to what we parsed from the body
            const fromLine    = h.from    || `Fax to ${receiverRaw} <newfax2@ifax.pro>`;
            const sentLine    = h.sent    || emailDate;
            const toLine      = h.to      || '';
            const subjectLine = h.subject || `Notification. Fax from ${senderRaw} to ${receiverRaw} was sent successfully.`;

            // Print timestamp — use the EMAIL's sent time, NOT generation time
            // Prefer the Outlook "Sent" header, fall back to date parsed from body
            // Format: "5/27/26, 3:56PM" (2-digit year, comma, no space before AM/PM)
            const printTimestamp = formatPrintTimestamp(sentLine || emailDate);

            // Format Sent line for the meta table: "5/27/2026 3:53 PM" (4-digit year, space before AM/PM)
            const sentDisplay = formatSentDisplay(sentLine || emailDate);

            // Center header: "iFax Report - {CM name} - Outlook"
            const cmName = GM_getValue('sn_global_cm1', '') || 'CM';
            const cmEmail = GM_getValue('sn_global_email', '') || '';
            const centerHeader = `iFax Report - ${cmName} - Outlook`;

            // Build the To line: "{CM Name} {CM email}"
            const toDisplay = (cmName && cmEmail) ? `${cmName} ${cmEmail}` : (cmEmail || cmName || toLine);

            // ── DIAGNOSTIC: dump all PDF template values ──
            console.log("[iFax Observer] === PDF GENERATION VALUES ===");
            console.log("  centerHeader:", centerHeader);
            console.log("  printTimestamp:", printTimestamp);
            console.log("  fromLine:", fromLine);
            console.log("  sentLine:", sentLine);
            console.log("  sentDisplay:", sentDisplay);
            console.log("  toLine:", toLine);
            console.log("  toDisplay:", toDisplay);
            console.log("  subjectLine:", subjectLine);
            console.log("  cmName from GM:", GM_getValue('sn_global_cm1', '(not set)'));
            console.log("  cmEmail from GM:", GM_getValue('sn_global_email', '(not set)'));
            console.log("[iFax Observer] === END PDF VALUES ===");

            // Add empty lines around "Dear Customer." in email body
            const processedEmailHTML = emailHTML.replace(/(Dear\s+[Cc]ustomer\.)/g, '<br><br>$1<br><br>');

            // ── Build HTML page: EXACT carbon copy of Outlook's print view ──
            const printHTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    .outlook-print-page {
        font-family: "Segoe UI", "Segoe UI Web", "Helvetica Neue", Helvetica, Arial, sans-serif;
        font-size: 8.5pt;
        color: #000;
        background: #fff;
        max-width: 720px;
        margin: 0 auto;
        padding: 36px 40px 28px 40px;
    }

    /* ── Outlook print header bar: timestamp left, folder title center ── */
    .outlook-print-hdr {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        margin-bottom: 22px;
        font-size: 7.5pt;
        color: #666;
    }
    .outlook-print-hdr .oph-left {
        flex: 0 0 auto;
    }
    .outlook-print-hdr .oph-center {
        flex: 1;
        text-align: center;
    }
    .outlook-print-hdr .oph-spacer {
        flex: 0 0 auto;
        visibility: hidden;
    }

    /* ── Subject: bold, standalone, NO label ── */
    .outlook-subject {
        font-size: 9.5pt;
        font-weight: 600;
        color: #000;
        margin-bottom: 14px;
        line-height: 1.3;
    }

    /* ── From / Sent / To table ── */
    .outlook-meta-table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 14px;
    }
    .outlook-meta-table td {
        vertical-align: top;
        padding: 2px 0;
        font-size: 8.5pt;
    }
    .outlook-meta-table .om-label {
        width: 52px;
        color: #666;
        font-weight: 400;
        text-align: left;
        padding-right: 8px;
        white-space: nowrap;
    }
    .outlook-meta-table .om-value {
        color: #000;
        font-weight: 400;
    }
    /* Outlook-style clickable link blue for email addresses */
    .outlook-meta-table .om-value a,
    .outlook-meta-table a {
        color: #0078D4;
        text-decoration: none;
    }

    /* ── Divider ── */
    .outlook-divider {
        border: none;
        border-top: 1px solid #c8c8c8;
        margin: 0 0 16px 0;
        padding: 0;
    }

    /* ── Email body ── */
    .outlook-body {
        font-size: 8.5pt;
        line-height: 1.5;
        color: #000;
    }
    .outlook-body table {
        max-width: 100% !important;
        height: auto !important;
    }
    .outlook-body table,
    .outlook-body td,
    .outlook-body th {
        border-color: #ccc !important;
    }
    .outlook-body img {
        max-width: 100% !important;
        height: auto !important;
    }
    /* Make iFax.PRO link look like Outlook blue */
    .outlook-body a {
        color: #0078D4;
        text-decoration: none;
    }
</style>
</head>
<body>
    <div class="outlook-print-page">

        <!-- Outlook print header: timestamp left, folder title center -->
        <div class="outlook-print-hdr">
            <span class="oph-left">${escapeHTML(printTimestamp)}</span>
            <span class="oph-center">${escapeHTML(centerHeader)}</span>
            <span class="oph-spacer">${escapeHTML(printTimestamp)}</span>
        </div>

        <!-- Divider above subject -->
        <hr class="outlook-divider">

        <!-- Subject: bold, standalone (NO "Subject:" label!) -->
        <div class="outlook-subject">${escapeHTML(subjectLine)}</div>

        <!-- Divider below subject -->
        <hr class="outlook-divider">

        <!-- From / Date / To: labels bold, no colons -->
        <table class="outlook-meta-table">
            <tr>
                <td class="om-label"><b>From</b></td>
                <td class="om-value">Fax to ${escapeHTML(receiverRaw)} &lt;newfax2@ifax.pro&gt;</td>
            </tr>
            <tr>
                <td class="om-label"><b>Date</b></td>
                <td class="om-value">${escapeHTML(sentDisplay)}</td>
            </tr>
            <tr>
                <td class="om-label"><b>To</b></td>
                <td class="om-value">${escapeHTML(toDisplay)}</td>
            </tr>
        </table>

        <br><br><br>

        <!-- Email body: verbatim from Outlook -->
        <div class="outlook-body">
            ${processedEmailHTML}
        </div>

    </div>
</body>
</html>`;

            // ── Inject offscreen container ──
            const container = document.createElement('div');
            container.innerHTML = printHTML;
            container.style.cssText = `
                position: fixed !important;
                left: -9999px !important;
                top: 0 !important;
                width: 780px !important;
                overflow: visible !important;
                background: #fff !important;
                z-index: -1 !important;
            `;
            document.body.appendChild(container);

            // ── Render with html2canvas ──
            const wrapper = container.querySelector('.outlook-print-page');
            const canvas = await html2canvas(wrapper, {
                scale: 2,
                useCORS: true,
                allowTaint: false,
                backgroundColor: '#ffffff',
                logging: false,
                // No explicit width/height — let html2canvas auto-detect bounds
            });

            // Clean up DOM
            container.remove();

            // ── Merge receipt INTO the original fax PDF ──
            const imgData = canvas.toDataURL('image/png');
            const faxLog = GM_getValue('sn_fax_log', []);
            const logEntry = faxLog.find(e =>
                (e.status === 'pending_la' || e.status === 'awaiting_report') &&
                (e.receiverFax || '').replace(/\D/g, '') === receiverFax &&
                e.clientName === clientName
            );
            const faxType = logEntry ? logEntry.faxType : '';

            // Find the matching original fax PDF from generated PDFs cache
            const generatedPdfs = GM_getValue('sn_fax_generated_pdfs', []);
            const faxPdfEntry = generatedPdfs.find(p =>
                p.clientName === clientName &&
                p.type === 'fax' &&
                (!faxType || p.faxType === faxType)
            );

            // ── 1696: Store receipt separately, do NOT merge ───────────────
            if (faxType === '1696') {
                // Create a standalone receipt PDF with just the receipt image
                const receiptPdfDoc = await PDFLib.PDFDocument.create();
                const rImgEmbed = await receiptPdfDoc.embedPng(imgData);
                const rImgDims = rImgEmbed.scaleToFit(600, 780);
                const rPage = receiptPdfDoc.addPage([612, 792]); // US Letter
                rPage.drawImage(rImgEmbed, {
                    x: 6,
                    y: rPage.getHeight() - rImgDims.height - 6,
                    width: rImgDims.width,
                    height: rImgDims.height,
                });
                const receiptPdfBase64 = await receiptPdfDoc.saveAsBase64({ dataUri: true });
                const receiptFileName = `${fileNameBase} - iFax report.pdf`;

                console.log(`[iFax Observer] 1696: Saving receipt separately: ${receiptFileName}`);

                // Update fax log entry — receipt captured, NOT merged
                if (logEntry) {
                    logEntry.hasReceipt = true;
                    logEntry.receiptMerged = false;
                    GM_setValue('sn_fax_log', faxLog);
                }

                // Store receipt as a separate entry in generatedPdfs
                generatedPdfs.push({
                    pdfBase64: receiptPdfBase64,
                    fileName: receiptFileName,
                    clientId: clientId || '',
                    clientName: clientName,
                    type: 'receipt',
                    faxType: '1696',
                    hasReceipt: true,
                    timestamp: Date.now()
                });
                if (generatedPdfs.length > 50) generatedPdfs.splice(0, generatedPdfs.length - 50);
                GM_setValue('sn_fax_generated_pdfs', generatedPdfs);
                GM_setValue('sn_fax_log_broadcast', Date.now());

                // Do NOT auto-download — let the Dashboard show separate download buttons
                console.log(`[iFax Observer] ✅ 1696 receipt saved separately — original PDF preserved.`);
            } else {
                // ── Non-1696: existing merge behavior ──────────────────────
                let mergedPdfDoc;
                if (faxPdfEntry) {
                    const faxBytes = await fetch(faxPdfEntry.pdfBase64).then(r => r.arrayBuffer());
                    mergedPdfDoc = await PDFLib.PDFDocument.load(faxBytes);
                    console.log(`[iFax Observer] Merging receipt into fax PDF: ${faxPdfEntry.fileName}`);
                } else {
                    console.warn("[iFax Observer] No original fax PDF found, creating receipt-only document.");
                    mergedPdfDoc = await PDFLib.PDFDocument.create();
                }

                const imgEmbed = await mergedPdfDoc.embedPng(imgData);
                const imgDims = imgEmbed.scaleToFit(600, 780);

                const receiptPage = mergedPdfDoc.addPage([612, 792]);
                receiptPage.drawImage(imgEmbed, {
                    x: 6,
                    y: receiptPage.getHeight() - imgDims.height - 6,
                    width: imgDims.width,
                    height: imgDims.height,
                });

                const pdfBase64 = await mergedPdfDoc.saveAsBase64({ dataUri: true });
                const mergedFileName = faxPdfEntry
                    ? faxPdfEntry.fileName.replace(/\.pdf$/i, ' + iFax report.pdf')
                    : `${fileNameBase} + iFax report.pdf`;

                console.log(`[iFax Observer] Merged receipt into: ${mergedFileName}`);

                if (logEntry) {
                    logEntry.pdfBase64 = pdfBase64;
                    logEntry.fileName = mergedFileName;
                    logEntry.receiptMerged = true;
                    GM_setValue('sn_fax_log', faxLog);
                }

                if (faxPdfEntry) {
                    faxPdfEntry.pdfBase64 = pdfBase64;
                    faxPdfEntry.fileName = mergedFileName;
                    faxPdfEntry.type = 'fax';
                    faxPdfEntry.hasReceipt = true;
                    faxPdfEntry.timestamp = Date.now();
                } else {
                    generatedPdfs.push({
                        pdfBase64: pdfBase64,
                        fileName: mergedFileName,
                        clientId: '',
                        clientName: clientName,
                        type: 'fax',
                        faxType: faxType || faxLabel || '',
                        hasReceipt: true,
                        timestamp: Date.now()
                    });
                }
                if (generatedPdfs.length > 50) generatedPdfs.splice(0, generatedPdfs.length - 50);
                GM_setValue('sn_fax_generated_pdfs', generatedPdfs);
                GM_setValue('sn_fax_log_broadcast', Date.now());

                console.log(`[iFax Observer] ✅ Receipt merged — no separate download.`);
            }
        } catch (err) {
            console.error("[iFax Observer] PDF merge failed:", err);
        }
    }

    /**
     * Reads the current email body and updates the fax info label
     * next to the trigger button. Looks up the fax log by receiver
     * number to show client name and label.
     */
    function updateFaxLabelFromBody() {
        const label = document.getElementById('sn-ifax-observer-label');
        if (!label) return;

        const bodyNode = document.querySelector(BODY_SELECTOR);
        if (!bodyNode) {
            label.style.display = 'none';
            return;
        }

        const emailText = bodyNode.innerText.trim();
        if (!emailText.includes(TRIGGER_PHRASE)) {
            label.style.display = 'none';
            return;
        }

        const numRegex = /Your fax message from\s+(\d+)\s+to\s+(\d+)\s+/i;
        const numMatch = emailText.match(numRegex);
        if (!numMatch) {
            label.style.display = 'none';
            return;
        }
        const receiverFax = numMatch[2];
        const receiverStr = formatFaxNum(receiverFax);

        // Detect success vs failure
        const isSuccess = emailText.includes('successfully');
        const isFailure = emailText.includes('fail') || emailText.includes('error') || emailText.includes('not sent');
        let statusIcon = isFailure ? '❌' : '✅';
        // If it's not clearly either, still show success icon since we got a receipt
        if (!isSuccess && !isFailure) statusIcon = '📄';

        // Look up fax log by receiver number (latest matching entry, any non-failed status)
        const faxLog = GM_getValue('sn_fax_log', []);
        let matched = null;
        let latestTs = 0;
        faxLog.forEach(entry => {
            if (entry.status === 'failed') return;
            const entryFax = (entry.faxNumber || entry.receiverFax || '').replace(/\D/g, '');
            if (entryFax === receiverFax && (entry.timestamp || 0) > latestTs) {
                latestTs = entry.timestamp || 0;
                matched = entry;
            }
        });

        let labelText;
        if (matched && matched.clientName) {
            labelText = `${statusIcon} ${matched.faxLabel || 'Fax'} — ${matched.clientName} (${receiverStr})`;
            // NOTE: Do NOT clear sn_temp_fax_* values here — the iFaxAutomation
            // depends on them. The "Open iFax" handler sets fresh values every time.
        } else {
            // Fallback: show fax number only (avoid stale temp values)
            labelText = `${statusIcon} Fax to ${receiverStr}`;
        }

        // Don't show if user has dismissed the label
        const dismissed = GM_getValue('sn_ifax_label_dismissed', 0);
        if (dismissed && (Date.now() - dismissed) < 86400000) {
            label.style.display = 'none';
            return;
        }

        label.textContent = labelText;
        label.style.display = 'flex';
    }

    /**
     * Swaps "First Last" → "Last First" by splitting on the last space.
     * Single-word names pass through unchanged.
     * @param {string} name
     * @returns {string}
     */
    function formatClientName(name) {
        if (!name) return name || '';
        const m = name.trim().match(/^(.+)\s+(\S+)$/);
        return m ? `${m[2]} ${m[1]}` : name.trim();
    }

    /**
     * Formats a raw digit string as xxx-xxx-xxxx for display.
     * @param {string} num
     * @returns {string}
     */
    function formatFaxNum(num) {
        const digits = (num || '').replace(/\D/g, '');
        if (digits.length === 10) {
            return digits.slice(0, 3) + '-' + digits.slice(3, 6) + '-' + digits.slice(6);
        }
        if (digits.length === 7) {
            return digits.slice(0, 3) + '-' + digits.slice(3);
        }
        return num || '';
    }

    /**
     * Parses an email date string like "May 27, 2026, 4:43 p.m." into a Date object.
     * Handles "a.m./p.m." with periods, "AM/PM", month names (full or abbreviated).
     * @param {string} dateStr
     * @returns {Date|null}
     */
    function parseEmailDate(dateStr) {
        if (!dateStr) return null;
        const months = {
            january:0, february:1, march:2, april:3, may:4, june:5,
            july:6, august:7, september:8, october:9, november:10, december:11,
            jan:0, feb:1, mar:2, apr:3, may:4, jun:5,
            jul:6, aug:7, sep:8, oct:9, nov:10, dec:11
        };
        const m = dateStr.match(/(\w+)\s+(\d{1,2}),?\s*(\d{4}),?\s*(\d{1,2}):(\d{2})\s*(a\.?m\.?|p\.?m\.?)/i);
        if (!m) return null;
        const monthIdx = months[m[1].toLowerCase()];
        if (monthIdx === undefined) return null;
        const day = parseInt(m[2], 10);
        const year = parseInt(m[3], 10);
        let h = parseInt(m[4], 10);
        const min = parseInt(m[5], 10);
        const ampm = m[6].toLowerCase();
        if (ampm.startsWith('p') && h < 12) h += 12;
        if (ampm.startsWith('a') && h === 12) h = 0;
        return new Date(year, monthIdx, day, h, min);
    }

    /**
     * Formats a date string into the top-left print timestamp format.
     * Example output: "5/27/26, 3:56PM"
     * @param {string} dateStr — raw date string from email
     * @returns {string}
     */
    function formatPrintTimestamp(dateStr) {
        try {
            const d = parseEmailDate(dateStr) || new Date(dateStr);
            if (isNaN(d.getTime())) return dateStr;
            const month = d.getMonth() + 1;
            const day = d.getDate();
            const year = d.getFullYear().toString().slice(-2);
            let hours = d.getHours();
            const minutes = d.getMinutes().toString().padStart(2, '0');
            const ampm = hours >= 12 ? 'PM' : 'AM';
            hours = hours % 12 || 12;
            return `${month}/${day}/${year}, ${hours}:${minutes}${ampm}`;
        } catch (_) {
            return dateStr;
        }
    }

    /**
     * Formats a date string for the Sent meta line.
     * Example output: "5/27/2026 3:53 PM"
     * @param {string} dateStr — raw date string from email
     * @returns {string}
     */
    function formatSentDisplay(dateStr) {
        try {
            const d = parseEmailDate(dateStr) || new Date(dateStr);
            if (isNaN(d.getTime())) return dateStr;
            const month = d.getMonth() + 1;
            const day = d.getDate();
            const year = d.getFullYear();
            let hours = d.getHours();
            const minutes = d.getMinutes().toString().padStart(2, '0');
            const ampm = hours >= 12 ? 'PM' : 'AM';
            hours = hours % 12 || 12;
            return `${month}/${day}/${year} ${hours}:${minutes} ${ampm}`;
        } catch (_) {
            return dateStr;
        }
    }

    /**
     * Escapes HTML special characters so user-controlled strings don't break
     * the inline HTML template.
     * @param {string} str
     * @returns {string}
     */
    function escapeHTML(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /**
     * Attempts to read the current Outlook folder name from the navigation
     * pane so the print header matches what Outlook would show. Falls back
     * to "iFax Reports" if the DOM lookup fails.
     * @returns {string}
     */
    function getOutlookFolderName() {
        try {
            // Outlook Web: the active folder is often marked with aria-current or a selected class
            const sel =
                document.querySelector('[aria-current="true"]') ||
                document.querySelector('.ms-Nav-navLink--selected') ||
                document.querySelector('[class*="selected"] [class*="folder"]') ||
                document.querySelector('[aria-selected="true"]') ||
                document.querySelector('[title*="iFax"]');
            if (sel) {
                const name = (sel.getAttribute('title') || sel.getAttribute('aria-label') || sel.textContent || '').trim();
                if (name && name.length < 40) return name;
            }
        } catch (_) { /* fall through */ }
        return 'iFax Reports';
    }

    // ── Chrome runtime message listener (bypasses tab timer throttling) ──
    // The service worker fires a 2-minute alarm and sends sn_ifax_check here.
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'sn_ifax_check') {
            console.log('[iFax Observer] Received sn_ifax_check from service worker');
            autoCheckForIFaxEmails();
            // No async response needed
        }
    });

    // ── Start ──────────────────────────────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
