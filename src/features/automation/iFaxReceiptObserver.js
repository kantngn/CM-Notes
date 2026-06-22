/**
 * @file iFaxReceiptObserver.js
 * @description PURELY MANUAL iFax receipt processor. No polling, no MutationObservers.
 *   User clicks the 📠 trigger button to process the currently open email.
 *   Extracts fax details, matches against pending faxes, generates a PDF receipt,
 *   and stores a pending Last Activity log entry.
 *
 *   Runs as a content script on `https://outlook.live.com/*` and
 *   `https://outlook.office.com/*` / `https://outlook.office365.com/*`.
 *
 * @requires gm-compat.js          — GM_getValue / GM_setValue
 * @requires pdf-lib.min.js        — window.PDFLib
 * @requires html2canvas.min.js    — window.html2canvas (renders email HTML to canvas for PDF)
 *
 * @consumed-by FaxPanel.js — stores pending receipt info via GM storage
 */
(function () {
    'use strict';

    const TRIGGER_PHRASE = "Your fax message from";
    const BODY_SELECTOR   = '[aria-label="Message body"]';

    let isProcessing = false;

    console.log("[iFax Observer] Script loaded (MANUAL MODE). readyState:", document.readyState);

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
        t.title = 'iFax Observer — Click to process current email';
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

        t.onmouseenter = () => { t.style.opacity = '1'; t.style.background = '#16213e'; };
        t.onmouseleave = () => { t.style.opacity = '0.7'; t.style.background = '#1a1a2e'; };

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
            console.log("[iFax Observer] Trigger clicked — processing current email.");
            handleButtonClick();
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
     * Initialize the observer. Purely manual — creates the trigger button,
     * registers keyboard shortcut, and does a one-time label check.
     * NO MutationObservers, NO auto-scanning, NO polling.
     */
    function init() {
        createTrigger();

        // ── Keyboard shortcut: Alt+Shift+F to process current email ──
        document.addEventListener('keydown', (e) => {
            if (e.altKey && e.shiftKey && (e.key === 'f' || e.key === 'F')) {
                e.preventDefault();
                e.stopPropagation();
                console.log("[iFax Observer] Shortcut Alt+Shift+F pressed — processing current email.");
                handleButtonClick();
            }
        });

        // One-time label check after page settles
        setTimeout(() => {
            updateFaxLabelFromBody();
        }, 5000);
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
     * Internal implementation of extractAndProcess. Does NOT call releaseLock()
     * — the parent extractAndProcess() wraps this in a try-finally that always
     * calls releaseLock(), even if this function throws.
     */
    async function _extractAndProcessImpl(autoMode) {
        const bodyNode = document.querySelector(BODY_SELECTOR);
        if (!bodyNode) {
            console.warn("[iFax Observer] Email body not found.");
            return;
        }

        const emailText = bodyNode.innerText.trim();
        const emailHTML = bodyNode.innerHTML;

        if (!emailText.includes(TRIGGER_PHRASE)) {
            console.log("[iFax Observer] Skipped — not an iFax confirmation.");
            return;
        }

        console.log("[iFax Observer] ✅ iFax email detected!");

        // Parse fax numbers (always present in trigger phrase)
        const numRegex = /Your fax message from\s+(\d+)\s+to\s+(\d+)\s+/i;
        const numMatch = emailText.match(numRegex);
        if (!numMatch) {
            console.warn("[iFax Observer] Could not parse fax numbers from email.");
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

        // ── Match against unified fax log by receiver fax + time window ──
        // Only match entries faxed within 1 hour BEFORE the email receipt.
        // Excludes entries that already received a receipt (receiptReceived=true).
        // If 1+ match → auto-process. If 0 → show picker (filtered to unmatched entries).
        const faxLog = GM_getValue('sn_fax_log', []);
        const emailTs = (parseEmailDate(emailDate) || new Date()).getTime();
        const WINDOW_MS = 60 * 60 * 1000; // 1 hour
        const windowedEntries = faxLog.filter((entry) => {
            // Skip entries that already got a receipt or are terminal
            if (entry.receiptReceived || entry.status === 'failed' || entry.status === 'completed') return false;
            const entryFax = (entry.faxNumber || entry.receiverFax || '').replace(/\D/g, '');
            const entryDID = (entry.senderDID || '').replace(/\D/g, '');
            // Dual matching: receiver fax MUST match, sender DID SHOULD match
            const faxMatch = entryFax === receiverFax;
            const didMatch = entryDID && senderFax && entryDID === senderFax;
            if (!faxMatch) return false;
            // If senderDID is stored and doesn't match, deprioritize but still consider
            const entryTs = entry.timestamp || 0;
            // Only match if faxed within 1 hour before the email
            return entryTs > (emailTs - WINDOW_MS) && entryTs <= emailTs;
        });

        // Sort: prefer entries where BOTH DID + fax match over fax-only matches
        if (windowedEntries.length > 1) {
            windowedEntries.sort((a, b) => {
                const aDid = (a.senderDID || '').replace(/\D/g, '') === senderFax ? 1 : 0;
                const bDid = (b.senderDID || '').replace(/\D/g, '') === senderFax ? 1 : 0;
                return (bDid - aDid) || ((a.timestamp || 0) - (b.timestamp || 0));
            });
        }

        let clientName, faxLabel, fileNameBase, clientId, entryId;
        let matchedIndex = -1;

        if (windowedEntries.length >= 1) {
            // One or more matches in window — pick oldest (first come, first served)
            const sorted = windowedEntries.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
            const matched = sorted[0];
            matchedIndex = faxLog.findIndex(e => e.id === matched.id);
            clientName   = matched.clientName;
            faxLabel     = matched.faxLabel;
            fileNameBase = matched.fileName || '';
            clientId     = matched.clientId;
            entryId      = matched.id;
            console.log(`[iFax Observer] Matched (1hr, oldest): ${clientName} - ${faxLabel}`);
        } else {
            // 0 matches in window — user must pick manually
            console.log("[iFax Observer] No match in 1hr window, showing picker...");
            const picked = await showFaxPickerModal(faxLog, receiverFax);
            if (picked) {
                clientName   = picked.clientName || 'Unknown';
                faxLabel     = picked.faxLabel || 'Fax';
                clientId     = picked.clientId || '';
                entryId      = picked.id || (Date.now().toString(36) + Math.random().toString(36).substr(2, 6));
                const reversedName = formatClientName(picked.clientName || '');
                const pickDate = new Date().toLocaleDateString('en-US', {month:'short', day:'2-digit', year:'numeric'}).replace(/\//g, '-');
                fileNameBase = picked.fileName || `${reversedName} - ${faxLabel} - ${pickDate}`;
                if (clientId && entryId) {
                    matchedIndex = faxLog.findIndex(e => e.id === entryId);
                }
                console.log(`[iFax Observer] User picked: ${clientName} - ${faxLabel}`);
            } else {
                // ── GUARDRAIL: Never create an 'Unknown' entry ──────────────
                // If the user cancels the picker (or autoMode can't show one),
                // the email came from a manual fax or a fax we don't track.
                // Dropping silently is correct — no 'Unknown' entries in the log.
                console.log("[iFax Observer] Picker cancelled — dropping silently. Email left unread for reference.");
                return; // ⛔️ NO 'Unknown' entry created
            }
        }

        // ── Handle FAILURE ─────────────────────────────────────────────
        if (isFailure || (!isSuccess && emailText.includes('Fax'))) {
            console.warn("[iFax Observer] ❌ Fax FAILED.");
            if (matchedIndex !== -1) {
                faxLog[matchedIndex].status = 'failed';
                faxLog[matchedIndex].receiptReceived = true; // Mark so it won't be offered again
                faxLog[matchedIndex].emailDate = emailDate;
                faxLog[matchedIndex].emailDateISO = new Date().toISOString();
                faxLog[matchedIndex].senderFax = senderFax;
            } else {
                // ── GUARDRAIL: Never create an entry without a real client name ──
                if (!clientName || clientName === 'Unknown' || !clientName.trim()) {
                    console.log("[iFax Observer] ⛔ No valid client name — dropping failure silently.");
                    return;
                }
                faxLog.push({
                    id: entryId,
                    clientId, clientName, faxLabel,
                    faxType: '', faxNumber: receiverFax, receiverFax, senderFax,
                    senderDID: senderFax,
                    status: 'failed', subject: '', content: '',
                    receiptContent: '', emailDate, emailDateISO: new Date().toISOString(),
                    pdfBase64: '', fileName: fileNameBase,
                    timestamp: Date.now(), resolvedAt: null,
                    dateTime: new Date().toISOString(),
                    receiptReceived: true
                });
            }
            if (faxLog.length > 500) faxLog.splice(0, faxLog.length - 500);
            GM_setValue('sn_fax_log', faxLog);
            GM_setValue('sn_fax_log_broadcast', Date.now());
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

        // ── No PDF generation ────────────────────────────────────────
        // Per SOP, the user prints the iFax confirmation from Outlook directly.
        // We only save the receipt text content to the fax log entry.
        // The receipt content is built from the email body text.
        // ──────────────────────────────────────────────────────────────

        // ── Update unified fax log with receipt data ───────────────────
        const updatedFaxLog = GM_getValue('sn_fax_log', []);

        // Match by ID
        let updatedMatchedIndex = updatedFaxLog.findIndex(e => e.id === entryId);
        if (updatedMatchedIndex === -1 && fileNameBase) {
            updatedMatchedIndex = updatedFaxLog.findIndex(e => e.fileName === fileNameBase);
        }
        if (updatedMatchedIndex !== -1) {
            const updatedEntry = updatedFaxLog[updatedMatchedIndex];

            // ── Mark as receiptReceived to prevent double-matching ─────────
            updatedFaxLog[updatedMatchedIndex].receiptReceived = true;

            // Set status to pending_la (or preserve completed if autoMode)
            if (!autoMode || updatedEntry.status !== 'completed') {
                updatedFaxLog[updatedMatchedIndex].status = 'pending_la';
            }
            updatedFaxLog[updatedMatchedIndex].senderFax = senderFax;
            updatedFaxLog[updatedMatchedIndex].receiverFax = receiverFax;
            updatedFaxLog[updatedMatchedIndex].receiptContent = reportContent;
            updatedFaxLog[updatedMatchedIndex].emailDate = emailDate;
            updatedFaxLog[updatedMatchedIndex].emailDateISO = new Date().toISOString();
            // No PDF was generated — mark hasReceipt=true (text receipt only)
            updatedFaxLog[updatedMatchedIndex].hasReceipt = true;
        } else {
            // ── GUARDRAIL: Never create an entry without a real client name ──
            if (!clientName || clientName === 'Unknown' || !clientName.trim()) {
                console.log("[iFax Observer] ⛔ No valid client name — not creating new fax log entry.");
                // Save current fax log state (generateReceiptPdf may have modified it)
                GM_setValue('sn_fax_log', updatedFaxLog);
                GM_setValue('sn_fax_log_broadcast', Date.now());
                return;
            }
            updatedFaxLog.push({
                id: entryId,
                clientId, clientName, faxLabel,
                faxType: '', faxNumber: receiverFax, receiverFax, senderFax,
                senderDID: senderFax, // Store sender DID for dual matching
                status: 'pending_la',
                subject: '', content: '',
                receiptContent: reportContent,
                emailDate, emailDateISO: new Date().toISOString(),
                pdfBase64: '', fileName: fileNameBase,
                timestamp: Date.now(), resolvedAt: null,
                dateTime: new Date().toISOString(),
                hasReceipt: true,
                receiptReceived: true // New entry got its receipt
            });
        }
        if (updatedFaxLog.length > 500) updatedFaxLog.splice(0, updatedFaxLog.length - 500);
        GM_setValue('sn_fax_log', updatedFaxLog);
        GM_setValue('sn_fax_log_broadcast', Date.now());

        // ── Store pending auto-LA data for SF tab to auto-create ───────
        // Stored for ANY match (auto or manual). The Dashboard will create the LA
        // when the user navigates to the matching client's matter page.
        // Respects the 📝 Log toggle on the FaxPanel at time of submission.
        //
        // ── LA SUBJECT/CONTENT CONVENTION (DO NOT CHANGE) ──────────────
        // Subject: "Submitted to {destination}"     e.g. "Submitted to SSA"
        // Content: "Faxed {doc type} to {destination}"  then append receipt text
        //
        // See FaxPanel._buildDraftLA() for the canonical template.
        // The destination is derived from sentTo/faxType:
        //   FO/SSA → "Submitted to SSA" / "Faxed {doc} to SSA"
        //   DDS    → "Submitted to DDS" / "Faxed {doc} to DDS"
        // ─────────────────────────────────────────────────────────────────
        if (clientId && updatedMatchedIndex !== -1) {
            const matched = updatedFaxLog[updatedMatchedIndex];
            // Check the entry's stored logActivity flag (snapshot at fax submission time)
            // rather than the live GM value — the user may have toggled the checkbox
            // between sending the fax and the receipt arriving.
            if (matched && matched.logActivity !== false) {
                const pendingLAs = GM_getValue('sn_pending_auto_las', []);
                console.log("[iFax Observer] 📝 Creating pending LA:", {
                    clientName,
                    faxLabel,
                    matchedSubject: matched.subject,
                    matchedContent: (matched.content || '').slice(0, 60),
                    willUseSubject: matched.subject || `Fax Submitted - ${faxLabel}`,
                    hasContent: !!matched.content,
                    entryId,
                    matchedIndex: updatedMatchedIndex
                });
                // Avoid duplicates
                if (!pendingLAs.some(p => p.entryId === entryId)) {
                    // Build content: fax description + receipt confirmation text.
                    // matched.content may be empty for manual faxes, but reportContent
                    // always has the receipt details.
                    const pendingContent = [matched.content, reportContent].filter(Boolean).join('\n\n');
                    pendingLAs.push({
                        entryId,
                        clientId,
                        clientName,
                        faxLabel,
                        subject: matched.subject || `Fax Submitted - ${faxLabel}`,
                        content: pendingContent,
                        receiverFax: receiverFax,
                        logActivity: matched.logActivity,
                        timestamp: Date.now()
                    });
                    if (pendingLAs.length > 50) pendingLAs.splice(0, pendingLAs.length - 50);
                    GM_setValue('sn_pending_auto_las', pendingLAs);
                    console.log("[iFax Observer] 📝 Stored pending auto-LA for:", clientName, faxLabel);
                }
            }
        }

        // Broadcast toast to SF tab
        GM_setValue('sn_ifax_report_toast', {
            id: entryId,
            clientId,
            clientName,
            faxLabel,
            status: 'success',
            receiptReceived: true,
            timestamp: Date.now()
        });

        // ── Store email key so button click won't re-process ─────────
        try {
            const emailKey = `processed_email_${senderFax}_${receiverFax}_${emailDate}`;
            const keys = GM_getValue('sn_processed_email_keys', []);
            if (!keys.includes(emailKey)) {
                keys.push(emailKey);
                if (keys.length > 100) keys.splice(0, keys.length - 50);
                GM_setValue('sn_processed_email_keys', keys);
            }
        } catch (_) { /* non-critical */ }

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
     * Shows a non-modal popup (no background overlay, no focus steal) listing
     * fax log entries near the 📠 trigger button. User clicks an entry or clicks
     * outside to dismiss.
     *
     * @param {Array} faxLog        — The full fax log array from GM storage
     * @param {string} receiverFax  — The receiver fax from the email (pre-filled in filter)
     * @param {Array} [preFiltered] — Optional pre-filtered list (skips filtering faxLog)
     * @returns {Promise<Object|null>} — The selected fax log entry, or null if cancelled
     */
    function showFaxPickerModal(faxLog, receiverFax, preFiltered) {
        return new Promise((resolve) => {
            // Use pre-filtered list if provided, otherwise filter + sort
            // CRITICAL: Exclude entries that already received a receipt (receiptReceived=true).
            // This prevents double-matching and ensures the user only sees actionable records.
            const entries = preFiltered
                ? preFiltered.slice().sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
                    .filter(e => !e.receiptReceived && e.status !== 'failed')
                : (faxLog || [])
                    .filter(e => !e.receiptReceived && e.status !== 'failed')
                    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

            if (entries.length === 0) {
                console.warn("[iFax Observer] No fax log entries available to pick from.");
                showToast('📭 No unmatched fax records found. All receipts accounted for.', 'info');
                resolve(null);
                return;
            }

            // Remove any existing popup first
            const existing = document.getElementById('sn-ifax-picker-popup');
            if (existing) existing.remove();

            // ── Position near the trigger button ──
            const trigger = document.getElementById('sn-ifax-observer-trigger');
            let top = '50%', left = 'auto', right = '68px';
            if (trigger) {
                const rect = trigger.getBoundingClientRect();
                top = rect.top + 'px';
                right = (window.innerWidth - rect.left + 12) + 'px';
            }

            // ── Build popup card (NO overlay) ──
            const popup = document.createElement('div');
            popup.id = 'sn-ifax-picker-popup';
            popup.style.cssText = `
                position: fixed;
                top: ${top};
                right: ${right};
                background: #1e1e2e;
                color: #e0e0e0;
                border-radius: 10px;
                box-shadow: 0 6px 24px rgba(0,0,0,0.5);
                width: 420px;
                max-height: 70vh;
                display: flex;
                flex-direction: column;
                overflow: hidden;
                border: 1px solid rgba(255,255,255,0.12);
                z-index: 2147483647;
                font-family: 'Segoe UI', system-ui, sans-serif;
            `;

            // ── Header ──
            const header = document.createElement('div');
            header.style.cssText = `
                padding: 12px 16px 10px 16px;
                border-bottom: 1px solid rgba(255,255,255,0.08);
                display: flex;
                justify-content: space-between;
                align-items: center;
            `;
            header.innerHTML = `<span style="font-size:13px;font-weight:600;">Select a fax record</span>`;

            const closeBtn = document.createElement('button');
            closeBtn.textContent = '✕';
            closeBtn.style.cssText = `
                background: none; border: none; color: #888;
                font-size: 16px; cursor: pointer; padding: 2px 6px;
                border-radius: 4px;
            `;
            closeBtn.onmouseenter = () => closeBtn.style.color = '#fff';
            closeBtn.onmouseleave = () => closeBtn.style.color = '#888';
            closeBtn.onclick = (e) => { e.stopPropagation(); popup.remove(); resolve(null); };
            header.appendChild(closeBtn);
            popup.appendChild(header);

            // ── Search filter (no auto-focus) ──
            const filterRow = document.createElement('div');
            filterRow.style.cssText = 'padding: 8px 16px; border-bottom: 1px solid rgba(255,255,255,0.06);';
            const filterInput = document.createElement('input');
            filterInput.type = 'text';
            filterInput.placeholder = '🔍  Filter by client name or fax number...';
            filterInput.value = receiverFax ? receiverFax.replace(/\D/g, '') : '';
            filterInput.style.cssText = `
                width: 100%; padding: 6px 10px; border-radius: 6px;
                border: 1px solid rgba(255,255,255,0.12);
                background: #2a2a3e; color: #e0e0e0;
                font-size: 12px; outline: none;
                box-sizing: border-box;
            `;
            filterInput.onfocus = () => { filterInput.style.borderColor = '#4a6cf7'; };
            filterInput.onblur = () => { filterInput.style.borderColor = 'rgba(255,255,255,0.12)'; };
            filterRow.appendChild(filterInput);
            popup.appendChild(filterRow);

            // ── List container ──
            const list = document.createElement('div');
            list.style.cssText = `
                flex: 1; overflow-y: auto; padding: 4px 0;
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
                    empty.style.cssText = 'padding: 24px 16px; text-align: center; color: #888; font-size: 12px;';
                    empty.textContent = 'No matching fax records found.';
                    list.appendChild(empty);
                    return;
                }

                filtered.forEach((entry) => {
                    const row = document.createElement('div');
                    row.style.cssText = `
                        display: flex; align-items: center; gap: 10px;
                        padding: 8px 16px; cursor: pointer;
                        border-bottom: 1px solid rgba(255,255,255,0.03);
                        transition: background 0.12s;
                    `;
                    row.onmouseenter = () => { row.style.background = 'rgba(74,108,247,0.12)'; };
                    row.onmouseleave = () => { row.style.background = 'transparent'; };
                    row.onclick = () => {
                        popup.remove();
                        resolve(entry);
                    };

                    const statusDot = document.createElement('span');
                    const dotColor = entry.status === 'completed' ? '#4ade80' : '#facc15';
                    statusDot.textContent = '●';
                    statusDot.style.cssText = `color:${dotColor}; font-size:9px; flex-shrink:0;`;

                    const info = document.createElement('div');
                    info.style.cssText = 'flex:1; min-width:0;';
                    const nameLine = document.createElement('div');
                    nameLine.style.cssText = 'font-size:12px; font-weight:500; color:#e0e0e0;';
                    nameLine.textContent = `${entry.clientName || 'Unknown'} — ${entry.faxLabel || 'Fax'}`;
                    const subLine = document.createElement('div');
                    subLine.style.cssText = 'font-size:11px; color:#888; margin-top:1px;';
                    const faxNum = entry.faxNumber || entry.receiverFax || '';
                    const ts = entry.timestamp || (entry.dateTime ? new Date(entry.dateTime).getTime() : 0);
                    const timeStr = ts ? new Date(ts).toLocaleString('en-US', {
                        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
                    }) : '';
                    subLine.textContent = [faxNum, timeStr].filter(Boolean).join(' · ');

                    info.appendChild(nameLine);
                    info.appendChild(subLine);
                    row.appendChild(statusDot);
                    row.appendChild(info);
                    list.appendChild(row);
                });
            }

            filterInput.oninput = () => renderList(filterInput.value);
            popup.appendChild(list);

            // ── Footer ──
            const footer = document.createElement('div');
            footer.style.cssText = `
                padding: 8px 16px; border-top: 1px solid rgba(255,255,255,0.08);
                display: flex; justify-content: flex-end;
            `;
            const cancelBtn = document.createElement('button');
            cancelBtn.textContent = 'Cancel';
            cancelBtn.style.cssText = `
                padding: 5px 14px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.15);
                background: transparent; color: #ccc; font-size: 12px; cursor: pointer;
            `;
            cancelBtn.onmouseenter = () => { cancelBtn.style.background = 'rgba(255,255,255,0.08)'; };
            cancelBtn.onmouseleave = () => { cancelBtn.style.background = 'transparent'; };
            cancelBtn.onclick = () => { popup.remove(); resolve(null); };
            footer.appendChild(cancelBtn);
            popup.appendChild(footer);

            document.body.appendChild(popup);

            // Close popup when clicking outside (no focus steal)
            let resolved = false;
            const origResolve = resolve;
            const safeResolve = (val) => { if (!resolved) { resolved = true; origResolve(val); } };
            // Override row.onclick and cancel to use safeResolve
            const closeHandler = (ev) => {
                if (!popup.contains(ev.target) && ev.target !== trigger) {
                    popup.remove();
                    document.removeEventListener('click', closeHandler);
                    safeResolve(null);
                }
            };
            setTimeout(() => document.addEventListener('click', closeHandler), 10);

            // Initial render (no auto-focus)
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
     * Releases the processing lock.
     */
    function releaseLock() {
        isProcessing = false;
    }

    /**
     * Button click handler: reads the CURRENTLY OPEN email, checks if it's an
     * iFax report, extracts fax number, auto-matches against the fax log.
     *
     * - Exactly 1 match by receiver fax → auto-process silently + toast
     * - 0 matches or 2+ matches with same fax → show picker
     * - Not an iFax email → toast notification
     */
    async function handleButtonClick() {
        if (isProcessing) {
            showToast('⏳ Already processing...', 'info');
            return;
        }

        const bodyNode = document.querySelector(BODY_SELECTOR);
        if (!bodyNode) {
            showToast('📧 No email body found. Open an email first.', 'warn');
            return;
        }

        const emailText = bodyNode.innerText.trim();
        if (!emailText.includes(TRIGGER_PHRASE)) {
            showToast('📧 Open an iFax confirmation email first', 'warn');
            return;
        }

        // Extract fax numbers
        const numRegex = /Your fax message from\s+(\d+)\s+to\s+(\d+)\s+/i;
        const numMatch = emailText.match(numRegex);
        if (!numMatch) {
            showToast('❌ Could not parse fax numbers from email', 'error');
            return;
        }
        const senderFax   = numMatch[1];
        const receiverFax = numMatch[2];

        // ── Already processed check ───────────────────────────────
        // Use the email's own date as unique key — no re-scanning needed.
        const dateRegex = /at\s+([\s\S]*?)\.\.?\s+Best regards/i;
        const dateMatch = emailText.match(dateRegex);
        const rawDate   = dateMatch ? dateMatch[1].replace(/\n/g, ' ').trim() : '';
        const emailDate = rawDate.replace(/\s+/g, ' ');
        const emailKey = `processed_email_${senderFax}_${receiverFax}_${emailDate}`;
        const processedEmails = GM_getValue('sn_processed_email_keys', []);
        if (processedEmails.includes(emailKey)) {
            showToast('✅ This email was already processed', 'success');
            return;
        }

        const existingLog = GM_getValue('sn_fax_log', []);
        const emailTs = (parseEmailDate(emailDate) || new Date()).getTime();
        const WINDOW_MS = 60 * 60 * 1000; // 1 hour

        // Look up fax log: only match entries WITHOUT receipt, faxed within 1 hour before email
        const windowedEntries = existingLog.filter(e => {
            if (e.receiptReceived || e.status === 'failed' || e.status === 'completed') return false;
            const entryFax = (e.faxNumber || e.receiverFax || '').replace(/\D/g, '');
            if (entryFax !== receiverFax) return false;
            const entryTs = e.timestamp || 0;
            return entryTs > (emailTs - WINDOW_MS) && entryTs <= emailTs;
        });

        // Sort: prefer entries where sender DID matches too
        if (windowedEntries.length > 1) {
            windowedEntries.sort((a, b) => {
                const aDid = (a.senderDID || '').replace(/\D/g, '') === senderFax ? 1 : 0;
                const bDid = (b.senderDID || '').replace(/\D/g, '') === senderFax ? 1 : 0;
                return (bDid - aDid) || ((a.timestamp || 0) - (b.timestamp || 0));
            });
        }

        if (windowedEntries.length >= 1) {
            showToast(`✅ Auto-matched: ${windowedEntries[0].clientName} — ${windowedEntries[0].faxLabel}`, 'success');
            await extractAndProcess(false);
        } else {
            // 0 matches in window — show picker (filtered to unmatched entries only)
            showToast('📋 No auto-match — select a fax record', 'info');
            const picked = await showFaxPickerModal(existingLog, receiverFax);
            if (picked) {
                // Mark as receipt received immediately to prevent double-matching
                const freshLog = GM_getValue('sn_fax_log', []);
                const pIdx = freshLog.findIndex(e => e.id === picked.id);
                if (pIdx !== -1) {
                    freshLog[pIdx].receiptReceived = true;
                    GM_setValue('sn_fax_log', freshLog);
                }
                showToast(`✅ Selected: ${picked.clientName} — ${picked.faxLabel}`, 'success');
                await extractAndProcess(false);
            } else {
                showToast('❌ Cancelled', 'info');
            }
        }
    }

    /**
     * Shows a floating toast notification on the page.
     * Auto-dismisses after 4 seconds.
     * @param {string} msg    — Toast text
     * @param {string} type   — 'success' (green), 'error' (red), 'warn' (yellow), 'info' (blue)
     */
    function showToast(msg, type) {
        const colors = {
            success: '#4ade80',
            error:   '#ef4444',
            warn:    '#facc15',
            info:    '#60a5fa'
        };
        const bg = colors[type] || '#60a5fa';

        const toast = document.createElement('div');
        toast.textContent = msg;
        toast.style.cssText = `
            position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
            background: #1e1e2e; color: #e0e0e0; padding: 10px 20px;
            border-radius: 8px; font: 13px/1.4 'Segoe UI', sans-serif;
            z-index: 2147483647; box-shadow: 0 4px 16px rgba(0,0,0,0.4);
            border-left: 4px solid ${bg};
            max-width: 500px; white-space: nowrap; overflow: hidden;
            text-overflow: ellipsis; user-select: none;
            animation: snToastIn 0.25s ease-out;
        `;
        // Add keyframes if not already present
        if (!document.getElementById('sn-toast-keyframes')) {
            const style = document.createElement('style');
            style.id = 'sn-toast-keyframes';
            style.textContent = `@keyframes snToastIn { from { opacity:0; transform:translateX(-50%) translateY(12px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }`;
            document.head.appendChild(style);
        }
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.transition = 'opacity 0.3s';
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 350);
        }, 4000);
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

        // Try to match in fax log (skip entries that already received a receipt)
        // Dual matching: prefer entries where both sender DID + receiver fax match.
        const faxLog = GM_getValue('sn_fax_log', []);
        let matchedIndex = -1;
        let latestTs = 0;
        let bestDIDScore = -1;
        faxLog.forEach((entry, idx) => {
            if (entry.receiptReceived || entry.status === 'failed' || entry.status === 'completed') return;
            const entryFax = (entry.faxNumber || entry.receiverFax || '').replace(/\D/g, '');
            const entryDID = (entry.senderDID || '').replace(/\D/g, '');
            if (entryFax !== receiverFax) return;
            const didScore = (entryDID && senderFax && entryDID === senderFax) ? 1 : 0;
            if (didScore > bestDIDScore || (didScore === bestDIDScore && (entry.timestamp || 0) > latestTs)) {
                bestDIDScore = didScore;
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
            // Mark as receipt received immediately
            faxLog[matchedIndex].receiptReceived = true;
            GM_setValue('sn_fax_log', faxLog);
            console.log(`[iFax Observer] Matched fax log entry: ${clientName} - ${faxLabel}`);
        } else {
            // No match — show picker (filtered to unmatched entries only)
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
                // Mark as receipt received to prevent double-matching
                if (matchedIndex !== -1) {
                    const freshLog = GM_getValue('sn_fax_log', []);
                    freshLog[matchedIndex].receiptReceived = true;
                    GM_setValue('sn_fax_log', freshLog);
                }
                console.log(`[iFax Observer] User picked: ${clientName} - ${faxLabel}`);
            } else {
                console.log("[iFax Observer] User cancelled — skipping download.");
                return;
            }
        }

        // No PDF generation — user prints from Outlook per SOP.
        // Just update fax log entry with receipt text content.

        // Update fax log entry with receipt data
        if (matchedIndex !== -1) {
            const freshLog = GM_getValue('sn_fax_log', []);
            if (freshLog[matchedIndex]) {
                freshLog[matchedIndex].status = 'pending_la';
                freshLog[matchedIndex].senderFax = senderFax;
                freshLog[matchedIndex].receiverFax = receiverFax;
                freshLog[matchedIndex].emailDate = emailDate;
                freshLog[matchedIndex].emailDateISO = new Date().toISOString();
                freshLog[matchedIndex].receiptContent = emailText;
                freshLog[matchedIndex].receiptReceived = true;
                GM_setValue('sn_fax_log', freshLog);
                GM_setValue('sn_fax_log_broadcast', Date.now());
            }
            // NOTE: Manual download does NOT store pending LA — user creates LA manually.
        }

        console.log("[iFax Observer] ✅ Manual receipt download complete.");
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

        // Look up fax log by receiver number (latest matching entry, excludes failed/completed)
        const faxLog = GM_getValue('sn_fax_log', []);
        let matched = null;
        let latestTs = 0;
        faxLog.forEach(entry => {
            if (entry.status === 'failed' || entry.status === 'completed') return;
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
     * Formats a client name for filenames as "LastName FirstName".
     * Handles suffixes (Jr., Sr., III, etc.) so they are excluded.
     * First name uses only the first block (no middle name).
     * @param {string} name - e.g. "Nichoel Ann Wilkerson III"
     * @returns {string} e.g. "Wilkerson Nichoel"
     */
    function formatClientName(name) {
        if (!name) return name || '';
        const parts = name.trim().split(/\s+/);
        if (parts.length === 1) return name.trim();

        const suffixes = ['sr', 'jr', 'sr.', 'jr.', 'i', 'ii', 'iii', 'iv', 'v'];
        const lastWord = parts[parts.length - 1].toLowerCase();
        let lastName;

        if (suffixes.includes(lastWord) && parts.length > 2) {
            lastName = parts[parts.length - 2];
        } else {
            lastName = parts[parts.length - 1];
        }

        return `${lastName} ${parts[0]}`;
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

    // ── Start ──────────────────────────────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
