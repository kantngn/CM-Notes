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

        // ── Match against unified fax log (status: awaiting_report) ────
        const faxLog = GM_getValue('sn_fax_log', []);
        const matchedIndex = faxLog.findIndex(entry =>
            entry.status === 'awaiting_report' &&
            (entry.faxNumber || entry.receiverFax || '').replace(/\D/g, '') === receiverFax
        );

        let clientName, faxLabel, fileNameBase, clientId, entryId;
        if (matchedIndex !== -1) {
            const matched = faxLog[matchedIndex];
            clientName   = matched.clientName;
            faxLabel     = matched.faxLabel;
            fileNameBase = matched.fileName || '';
            clientId     = matched.clientId;
            entryId      = matched.id;
            console.log(`[iFax Observer] Matched fax log entry: ${clientName} - ${faxLabel}`);
        } else {
            clientName   = GM_getValue('sn_temp_fax_client_name', 'Unknown');
            faxLabel     = GM_getValue('sn_temp_fax_label', 'Fax');
            clientId     = GM_getValue('sn_temp_fax_client_id', '');
            entryId      = Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
            const today = new Date().toLocaleDateString('en-US', {
                month: 'short', day: '2-digit', year: 'numeric'
            });
            fileNameBase = `${faxLabel} - ${clientName} - ${today.replace(/\//g, '-')}`;
            console.log("[iFax Observer] No matching fax log entry, using fallback.");
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

        // ── SUCCESS: generate the report text and PDF ──────────────────
        const senderStr   = formatFaxNum(senderFax);
        const receiverStr = formatFaxNum(receiverFax);

        const reportContent =
`Fax from ${senderStr} to ${receiverStr} was sent successfully.
Dear customer.

Your fax message from ${senderStr} to ${receiverStr} was sent successfully at ${emailDate}..
Best regards,
iFax.PRO.`;

        // Generate and download a PDF receipt that looks like the Outlook email
        generateReceiptPdf(emailHTML, reportContent, senderFax, receiverFax, emailDate, clientName, faxLabel, fileNameBase);

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
     * Generates a PDF receipt by rendering the email HTML as an Outlook-style
     * print view, capturing it with html2canvas, and embedding into a PDF.
     *
     * @param {string} emailHTML    — The raw HTML from the email body
     * @param {string} reportContent — Fallback plain-text report content
     * @param {string} senderFax     — Raw sender fax digits
     * @param {string} receiverFax   — Raw receiver fax digits
     * @param {string} emailDate     — Formatted fax completion datetime
     * @param {string} clientName    — Client name
     * @param {string} faxLabel      — Label (e.g. "Letter 25")
     * @param {string} fileNameBase  — Base filename without extension
     */
    async function generateReceiptPdf(emailHTML, reportContent, senderFax, receiverFax, emailDate, clientName, faxLabel, fileNameBase) {
        try {
            const PDFLib = window.PDFLib;
            if (!PDFLib || typeof html2canvas === 'undefined') {
                console.error("[iFax Observer] PDFLib or html2canvas not available.");
                return;
            }

            // ── Build an HTML page that looks like Outlook's print view ──
            const senderStr   = formatFaxNum(senderFax);
            const receiverStr = formatFaxNum(receiverFax);

            const printHTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    .email-wrapper {
        font-family: 'Segoe UI', 'Segoe UI Web', 'Helvetica Neue', Helvetica, Arial, sans-serif;
        font-size: 14px;
        color: #1a1a1a;
        padding: 36px 48px;
        background: #fff;
        max-width: 800px;
        margin: 0 auto;
    }
    .print-header {
        border-bottom: 2px solid #e0e0e0;
        padding-bottom: 16px;
        margin-bottom: 20px;
    }
    .print-header h2 {
        font-size: 18px;
        font-weight: 600;
        color: #0078d4;
        margin-bottom: 8px;
    }
    .print-header .meta {
        font-size: 12px;
        color: #666;
        line-height: 1.6;
    }
    .print-header .meta strong {
        color: #333;
    }
    .print-body {
        line-height: 1.6;
        color: #1a1a1a;
    }
    .print-body table {
        max-width: 100% !important;
        height: auto !important;
    }
    .print-body table,
    .print-body td,
    .print-body th {
        border-color: #ccc !important;
    }
    .print-body img {
        max-width: 100% !important;
        height: auto !important;
    }
    .print-footer {
        border-top: 1px solid #e0e0e0;
        margin-top: 24px;
        padding-top: 12px;
        font-size: 11px;
        color: #999;
    }
</style>
</head>
<body>
    <div class="email-wrapper">
        <div class="print-header">
            <h2>iFax Receipt &mdash; ${faxLabel}</h2>
            <div class="meta">
                <strong>Client:</strong> ${clientName}<br>
                <strong>Date:</strong> ${emailDate}<br>
                <strong>From:</strong> ${senderStr}<br>
                <strong>To:</strong> ${receiverStr}
            </div>
        </div>
        <div class="print-body">
            ${emailHTML}
        </div>
        <div class="print-footer">
            Generated by KD CM Notes &mdash; ${new Date().toLocaleString()}
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
                width: 800px !important;
                overflow: visible !important;
                background: #fff !important;
                z-index: -1 !important;
            `;
            document.body.appendChild(container);

            // ── Render with html2canvas ──
            const wrapper = container.querySelector('.email-wrapper');
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

            // ── Embed canvas into PDF ──
            const imgData = canvas.toDataURL('image/png');
            const pdfDoc = await PDFLib.PDFDocument.create();
            const imgEmbed = await pdfDoc.embedPng(imgData);
            const imgDims = imgEmbed.scaleToFit(600, 780);

            const page = pdfDoc.addPage([612, 792]); // US Letter
            page.drawImage(imgEmbed, {
                x: 6,
                y: page.getHeight() - imgDims.height - 6,
                width: imgDims.width,
                height: imgDims.height,
            });

            // Save & Download
            const pdfBase64 = await pdfDoc.saveAsBase64({ dataUri: true });
            const receiptFilename = `To Be Faxed/${fileNameBase} - ifax receipt.pdf`;

            console.log(`[iFax Observer] Downloading receipt: ${receiptFilename}`);

            // Store receipt PDF in unified fax log entry
            const faxLog = GM_getValue('sn_fax_log', []);
            const logEntry = faxLog.find(e =>
                e.status === 'pending_la' &&
                (e.receiverFax || '').replace(/\D/g, '') === receiverFax &&
                e.clientName === clientName
            );
            if (logEntry) {
                logEntry.pdfBase64 = pdfBase64;
                logEntry.fileName = receiptFilename;
                GM_setValue('sn_fax_log', faxLog);
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
