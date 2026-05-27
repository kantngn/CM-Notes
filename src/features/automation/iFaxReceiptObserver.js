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
        }
        function onDragEnd() {
            document.removeEventListener('mousemove', onDrag);
            document.removeEventListener('mouseup', onDragEnd);
            GM_setValue('sn_ifax_observer_trigger_y', t.style.top);
        }

        t.onclick = () => {
            console.log("[iFax Observer] Manual trigger clicked.");
            processLatestUnread();
            // Flash feedback
            t.style.background = '#0f3460';
            setTimeout(() => { t.style.background = '#1a1a2e'; }, 300);
        };

        document.body.appendChild(t);
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

        console.log("[iFax Observer] Initialized. Watching for iFax confirmation emails...");

        const observer = new MutationObserver((mutations) => {
            if (isProcessing) return;
            for (const mutation of mutations) {
                if (mutation.addedNodes.length > 0 || mutation.type === 'attributes') {
                    processLatestUnread();
                    break;
                }
            }
        });

        observer.observe(targetNode, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['aria-label', 'data-is-unread']
        });

        // Also check immediately in case there's already an unread email
        setTimeout(() => { if (!isProcessing) processLatestUnread(); }, 3000);
    }

    /**
     * Finds the first unread email in the list, clicks it to load its body,
     * then delegates to `extractAndProcess`.
     */
    function processLatestUnread() {
        if (isProcessing) return;

        const targetNode = document.querySelector(LIST_SELECTOR);
        if (!targetNode) return;

        const firstUnread = targetNode.querySelector(UNREAD_SELECTOR);
        if (!firstUnread) return;

        isProcessing = true;
        firstUnread.setAttribute('data-sn-ifax-processed', 'true');

        const clickable = firstUnread.closest('[role="option"], [role="row"]') || firstUnread;
        clickable.click();

        // Give Outlook time to render the email body
        setTimeout(extractAndProcess, 2000);
    }

    /**
     * Reads the email body, checks for iFax trigger phrase,
     * detects success vs failure, extracts fax metadata,
     * generates a simple text PDF receipt, and stores a pending LA entry.
     */
    function extractAndProcess() {
        const bodyNode = document.querySelector(BODY_SELECTOR);
        if (!bodyNode) {
            console.warn("[iFax Observer] Email body not found. Releasing lock.");
            releaseLock();
            return;
        }

        const emailText = bodyNode.innerText.trim();

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

        // ── Match against pending receipts ─────────────────────────────
        const pendingReceipts = GM_getValue('sn_ifax_pending_receipts', []);
        const matchedIndex = pendingReceipts.findIndex(entry =>
            entry.faxNumber.replace(/\D/g, '') === receiverFax
        );

        let clientName, faxLabel, fileNameBase, clientId;
        if (matchedIndex !== -1) {
            const matched = pendingReceipts[matchedIndex];
            clientName   = matched.clientName;
            faxLabel     = matched.faxLabel;
            fileNameBase = matched.fileName;
            clientId     = matched.clientId;
            // Remove matched entry from pending receipts
            pendingReceipts.splice(matchedIndex, 1);
            GM_setValue('sn_ifax_pending_receipts', pendingReceipts);
            console.log(`[iFax Observer] Matched pending receipt: ${clientName} - ${faxLabel}`);
        } else {
            clientName   = GM_getValue('sn_temp_fax_client_name', 'Unknown');
            faxLabel     = GM_getValue('sn_temp_fax_label', 'Fax');
            clientId     = GM_getValue('sn_temp_fax_client_id', '');
            const today = new Date().toLocaleDateString('en-US', {
                month: 'short', day: '2-digit', year: 'numeric'
            });
            fileNameBase = `${faxLabel} - ${clientName} - ${today.replace(/\//g, '-')}`;
            console.log("[iFax Observer] Using fallback client info.");
        }

        // ── Handle FAILURE ─────────────────────────────────────────────
        if (isFailure || (!isSuccess && emailText.includes('Fax'))) {
            console.warn("[iFax Observer] ❌ Fax FAILED — not generating receipt.");
            const pendingLog = GM_getValue('sn_ifax_pending_log', []);
            pendingLog.push({
                id: Date.now().toString(36) + Math.random().toString(36).substr(2, 6),
                receiverFax,
                senderFax,
                emailDate,
                emailDateISO: new Date().toISOString(),
                clientId,
                clientName,
                faxLabel,
                fileNameBase,
                timestamp: Date.now(),
                status: 'failed'
            });
            if (pendingLog.length > 100) pendingLog.splice(0, pendingLog.length - 100);
            GM_setValue('sn_ifax_pending_log', pendingLog);
            GM_setValue('sn_ifax_pending_log_broadcast', Date.now());
            releaseLock();
            return;
        }

        // ── SUCCESS: generate the report text and PDF ──────────────────
        const senderStr   = formatFaxNum(senderFax);
        const receiverStr = formatFaxNum(receiverFax);

        // Generate the report content programmatically (per user's template)
        const reportContent =
`Fax from ${senderStr} to ${receiverStr} was sent successfully.
Dear customer.

Your fax message from ${senderStr} to ${receiverStr} was sent successfully at ${emailDate}..
Best regards,
iFax.PRO.`;

        // Generate and download the simple text PDF receipt
        generateSimpleReceiptPdf(reportContent, senderFax, receiverFax, emailDate, clientName, faxLabel, fileNameBase);

        // ── Store pending Last Activity log entry for auto-creation ────
        const pendingLog = GM_getValue('sn_ifax_pending_log', []);
        const entryId = Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
        pendingLog.push({
            id: entryId,
            receiverFax,
            senderFax,
            emailDate,
            emailDateISO: new Date().toISOString(),
            clientId,
            clientName,
            faxLabel,
            fileNameBase,
            reportContent: reportContent,
            timestamp: Date.now(),
            status: 'pending_la' // pending_la → la_logged → completed
        });
        if (pendingLog.length > 100) pendingLog.splice(0, pendingLog.length - 100);
        GM_setValue('sn_ifax_pending_log', pendingLog);
        GM_setValue('sn_ifax_pending_log_broadcast', Date.now());

        // Broadcast toast to SF tab
        GM_setValue('sn_ifax_report_toast', {
            id: entryId,
            clientId,
            clientName,
            faxLabel,
            status: 'success',
            timestamp: Date.now()
        });

        releaseLock();
    }

    /**
     * Releases the processing lock and clears the processed marker
     * on the currently selected email row.
     */
    function releaseLock() {
        const targetNode = document.querySelector(LIST_SELECTOR);
        if (targetNode) {
            const activeRow = targetNode.querySelector('[data-sn-ifax-processed="true"]');
            if (activeRow) {
                activeRow.removeAttribute('data-sn-ifax-processed');
                // Optionally mark as read
                const readBtn = activeRow.querySelector('[title="Mark as read"], [aria-label="Mark as read"]');
                if (readBtn) readBtn.click();
            }
        }
        isProcessing = false;
    }

    /**
     * Generates a simple text-based PDF receipt using PDFLib (no html2canvas).
     * The report content is generated programmatically from the known template.
     *
     * @param {string} reportContent — The plain-text report to embed in the PDF
     * @param {string} senderFax     — Raw sender fax digits
     * @param {string} receiverFax   — Raw receiver fax digits
     * @param {string} emailDate     — Formatted fax completion datetime
     * @param {string} clientName    — Client name
     * @param {string} faxLabel      — Label (e.g. "Letter 25")
     * @param {string} fileNameBase  — Base filename without extension
     */
    async function generateSimpleReceiptPdf(reportContent, senderFax, receiverFax, emailDate, clientName, faxLabel, fileNameBase) {
        try {
            const PDFLib = window.PDFLib;
            if (!PDFLib) {
                console.error("[iFax Observer] PDFLib not available.");
                return;
            }
            const { PDFDocument, StandardFonts } = PDFLib;

            const pdfDoc = await PDFDocument.create();
            const font = await pdfDoc.embedFont(StandardFonts.Courier);

            const page = pdfDoc.addPage([612, 792]); // US Letter
            const { width, height } = page.getSize();

            // Draw a simple header
            const headerLines = [
                `iFax Receipt - ${faxLabel}`,
                `Client: ${clientName}`,
                `Date: ${emailDate}`,
                `From: ${formatFaxNum(senderFax)}`,
                `To:   ${formatFaxNum(receiverFax)}`,
                '─'.repeat(60),
                '',
            ];

            const reportLines = reportContent.split('\n');

            const allLines = [...headerLines, ...reportLines, '', '', `Generated: ${new Date().toLocaleString()}`];

            let y = height - 50;
            const lineHeight = 14;

            allLines.forEach(line => {
                if (y < 40) return; // bottom margin
                page.drawText(line, {
                    x: 50,
                    y: y,
                    size: 10,
                    font: font,
                    color: PDFLib.rgb(0, 0, 0),
                });
                y -= lineHeight;
            });

            // Save & Download
            const pdfBase64 = await pdfDoc.saveAsBase64({ dataUri: true });
            const receiptFilename = `To Be Faxed/${fileNameBase} - ifax receipt.pdf`;

            console.log(`[iFax Observer] Downloading receipt: ${receiptFilename}`);

            // Store receipt PDF in pending log entry for drag-to-upload
            const pendingLog = GM_getValue('sn_ifax_pending_log', []);
            const logEntry = pendingLog.find(e =>
                e.receiverFax === receiverFax &&
                e.status === 'pending_la' &&
                e.clientName === clientName
            );
            if (logEntry) {
                logEntry.pdfBase64 = pdfBase64;
                logEntry.receiptFilename = receiptFilename;
                GM_setValue('sn_ifax_pending_log', pendingLog);
            }

            // Push to shared generated PDFs cache for Dashboard drag support
            const generatedPdfs = GM_getValue('sn_fax_generated_pdfs', []);
            generatedPdfs.push({
                pdfBase64: pdfBase64,
                fileName: receiptFilename,
                clientId: '',
                clientName: clientName,
                type: 'receipt',
                faxType: faxLabel || '',
                timestamp: Date.now()
            });
            if (generatedPdfs.length > 20) generatedPdfs.splice(0, generatedPdfs.length - 20);
            GM_setValue('sn_fax_generated_pdfs', generatedPdfs);

            if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
                chrome.runtime.sendMessage({
                    action: 'DOWNLOAD_FILE',
                    url: pdfBase64,
                    filename: receiptFilename
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.error("[iFax Observer] Download failed:", chrome.runtime.lastError);
                    }
                });
            } else {
                const a = document.createElement('a');
                a.href = pdfBase64;
                a.download = receiptFilename;
                a.click();
            }
        } catch (err) {
            console.error("[iFax Observer] PDF generation failed:", err);
        }
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

    // ── Start ──────────────────────────────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
