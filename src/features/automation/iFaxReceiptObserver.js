/**
 * @file iFaxReceiptObserver.js
 * @description Observes the Outlook Web App for iFax confirmation/failure emails,
 *   extracts fax details, matches against pending faxes, generates a simple
 *   text-based PDF receipt, and stores a pending Last Activity log entry.
 *
 *   Runs as a content script on `https://outlook.live.com/*` and
 *   `https://outlook.office.com/*` / `https://outlook.office365.com/*`.
 *
 * @requires gm-compat.js          — GM_getValue / GM_setValue
 * @requires pdf-lib.min.js        — window.PDFLib
 * @requires background.js         — chrome.runtime.onMessage OPEN_PRINT_PAGE handler
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
    let _autoCheckRunning = false;
    // Track already-processed email subjects to avoid duplicate processing
    const _processedSubjects = new Set();

    // ── Auto-Process Mode ────────────────────────────────────────────
    // When enabled, iFax receipt emails are processed automatically as soon
    // as they're detected (no manual button click needed).
    // Toggle: right-click the 📠 button. State persists in GM storage.
    let _autoModeEnabled = GM_getValue('sn_ifax_auto_mode', false);
    let _autoProcessTimer = null;
    let _lastAutoProcessedKey = ''; // prevents re-processing the same email

    /** Re-reads auto-mode from GM storage and syncs the local variable. */
    function _syncAutoMode() {
        _autoModeEnabled = GM_getValue('sn_ifax_auto_mode', false);
    }

    // ── Smart Polling State ──────────────────────────────────────────
    // Starts when a new fax entry is logged. Scans for new unread iFax
    // emails in the list, clicks them, processes them automatically.
    // Timing: every 3 min for first 15 min, then every 5 min up to 30 min.
    // Stops after 30 min. Restarts from scratch if a new fax is logged.
    // Smart polling is driven by the background alarm — no local timer needed.
    let _smartPollStart = 0;
    let _smartPollPhase = 'idle'; // 'idle' | 'fast' | 'slow' | 'done'
    const FAST_POLL_MS = 3 * 60 * 1000;   // 3 min fast phase
    const FAST_PHASE_MS = 15 * 60 * 1000; // 15 min fast phase duration
    const SLOW_POLL_MS = 5 * 60 * 1000;   // 5 min slow phase
    const MAX_POLL_MS = 30 * 60 * 1000;   // 30 min total max

    console.log("[iFax Observer] Script loaded. readyState:", document.readyState);

    /**
     * Create the iFax processing button on the right edge of the screen.
     * Two clickable zones:
     *   Main area "📠 Process" — processes the current email immediately
     *   Badge "≡ N" — shows all matching fax log entries for manual selection
     *
     * After processing, a popup appears from the button showing the result,
     * then auto-hides after 5 seconds.
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

        // ── Main container ──
        const t = document.createElement('div');
        t.id = id;
        t.title = 'iFax Receipt Processor';
        t.style.cssText = `
            position: fixed;
            right: 8px; left: auto;
            top: ${savedY};
            background: #1a1a2e;
            color: white;
            display: flex;
            flex-direction: column;
            z-index: 2147483647;
            border-radius: 8px;
            box-shadow: 0 2px 12px rgba(0,0,0,0.3);
            font-family: 'Segoe UI', system-ui, sans-serif;
            user-select: none;
            border: 1px solid rgba(255,255,255,0.15);
            opacity: 0.8;
            transition: opacity 0.2s;
            overflow: hidden;
            min-width: 52px;
        `;

        t.onmouseenter = () => { t.style.opacity = '1'; };
        t.onmouseleave = () => { t.style.opacity = '0.8'; };

        // ── Make draggable vertically ──
        let dragStartY, dragOrigTop;
        t.onmousedown = (e) => {
            if (e.button !== 0) return;
            // Only drag when clicking the outer border area, not button children
            if (e.target !== t && e.target !== mainBtn && e.target !== matchBadge) return;
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
            const newPx = Math.max(10, Math.min(window.innerHeight - 100, currentPx + dy));
            t.style.top = newPx + 'px';
        }
        function onDragEnd() {
            document.removeEventListener('mousemove', onDrag);
            document.removeEventListener('mouseup', onDragEnd);
            GM_setValue('sn_ifax_observer_trigger_y', t.style.top);
        }

        // ════════════════════════════════════════════════════
        // MAIN AREA: Click to process the current email
        // ════════════════════════════════════════════════════
        const mainBtn = document.createElement('div');
        mainBtn.className = 'sn-ifax-main-btn';
        mainBtn.innerHTML = '📠';
        mainBtn.title = 'Process this iFax email — match receipt, update log, queue LA';
        mainBtn.style.cssText = `
            padding: 8px 10px;
            text-align: center;
            font-size: 18px;
            cursor: pointer;
            border-bottom: 1px solid rgba(255,255,255,0.08);
            transition: background 0.15s;
        `;
        mainBtn.onmouseenter = () => { mainBtn.style.background = 'rgba(74,108,247,0.25)'; };
        mainBtn.onmouseleave = () => { mainBtn.style.background = 'transparent'; };
        mainBtn.onclick = (e) => {
            e.stopPropagation();
            handleProcessClick(t);
        };
        // Right-click toggles auto-process mode
        mainBtn.oncontextmenu = (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleAutoMode();
        };
        t.appendChild(mainBtn);

        // ════════════════════════════════════════════════════
        // BADGE: Shows count of matching entries for today
        // ════════════════════════════════════════════════════
        const matchBadge = document.createElement('div');
        matchBadge.className = 'sn-ifax-match-badge';
        matchBadge.innerHTML = '≡ 0';
        matchBadge.title = 'Show all matching fax log entries for manual selection';
        matchBadge.style.cssText = `
            padding: 4px 6px;
            text-align: center;
            font-size: 10px;
            cursor: pointer;
            color: #888;
            transition: background 0.15s, color 0.2s;
            letter-spacing: 0.5px;
        `;
        matchBadge.onmouseenter = () => { matchBadge.style.background = 'rgba(255,255,255,0.08)'; matchBadge.style.color = '#ccc'; };
        matchBadge.onmouseleave = () => { matchBadge.style.background = 'transparent'; matchBadge.style.color = '#888'; };
        matchBadge.onclick = (e) => {
            e.stopPropagation();
            handleShowAllMatchesClick(t);
        };
        t.appendChild(matchBadge);

        document.body.appendChild(t);
        console.log("[iFax Observer] ✅ iFax button added to DOM.");

        // ── Initial state update ──
        _syncAutoMode();
        setTimeout(updateButtonState, 2000);
    }

    /**
     * Main action: Click the 📠 button → process the current email immediately.
     * Reads the open email, extracts fax details, matches against fax log (FIFO),
     * generates receipt PDF, updates log, queues LA. Shows result popup.
     */
    async function handleProcessClick(triggerEl) {
        if (isProcessing) return;

        // Remove any existing result popup
        const existing = document.getElementById('sn-ifax-result-popup');
        if (existing) existing.remove();

        const bodyNode = document.querySelector(BODY_SELECTOR);
        if (!bodyNode) {
            showResultPopup(triggerEl, '⚠️ No email open', '#ff9800');
            return;
        }

        const emailText = bodyNode.innerText.trim();
        if (!emailText.includes(TRIGGER_PHRASE)) {
            showResultPopup(triggerEl, '📧 Not an iFax confirmation', '#888');
            return;
        }

        // Parse to quickly verify this is a valid iFax email
        const numRegex = /Your fax message from\s+(\d+)\s+to\s+(\d+)\s+/i;
        const numMatch = emailText.match(numRegex);
        if (!numMatch) {
            showResultPopup(triggerEl, '⚠️ Could not parse fax numbers', '#ff9800');
            return;
        }

        isProcessing = true;
        const mainBtn = triggerEl.querySelector('.sn-ifax-main-btn');
        if (mainBtn) mainBtn.innerHTML = '⏳';

        try {
            // Process the email (autoMode=true so it auto-matches or creates basic entry)
            // extractAndProcess will call _extractAndProcessImpl which handles:
            //   - FIFO matching (oldest awaiting_report first)
            //   - PDF receipt generation
            //   - Fax log update
            //   - Pending LA queue
            //   - Mark email as read
            //   - releaseLock() in finally
            await extractAndProcess(true);

            // After processing, determine result
            const faxLogAfter = GM_getValue('sn_fax_log', []);
            const emailTextAfter = bodyNode.innerText.trim();
            const numMatchAfter = emailTextAfter.match(numRegex);
            const receiverFaxAfter = numMatchAfter ? numMatchAfter[2] : '';
            const rxClean = (receiverFaxAfter || '').replace(/\D/g, '');

            // Check for failure first
            const isFailure = emailTextAfter.includes('fail') || emailTextAfter.includes('error') || emailTextAfter.includes('not sent');
            if (isFailure) {
                // Find the entry that was marked as failed
                const failedEntry = faxLogAfter.find(e =>
                    e.status === 'failed' &&
                    (e.receiverFax || e.faxNumber || '').replace(/\D/g, '') === rxClean
                );
                showResultPopup(triggerEl,
                    `❌ Fax FAILED to ${formatFaxNum(rxClean)}`,
                    '#ef5350',
                    failedEntry ? `${failedEntry.faxLabel || 'Fax'} — ${failedEntry.clientName || 'Unknown'}` : '');
            } else {
                // Find the entry we just modified (status changed to pending_la)
                const matchedEntry = faxLogAfter.find(e =>
                    e.status === 'pending_la' &&
                    (e.receiverFax || e.faxNumber || '').replace(/\D/g, '') === rxClean
                );
                if (matchedEntry) {
                    showResultPopup(triggerEl,
                        `✅ ${matchedEntry.faxLabel || 'Fax'} — ${matchedEntry.clientName || 'Unknown'}`,
                        '#4ade80',
                        'Receipt saved + LA queued');
                } else {
                    // No freshly-matched entry — check if it was already processed earlier
                    const alreadyDone = faxLogAfter.find(e =>
                        (e.status === 'completed' || e.status === 'pending_la') &&
                        (e.receiverFax || e.faxNumber || '').replace(/\D/g, '') === rxClean
                    );
                    if (alreadyDone) {
                        showResultPopup(triggerEl,
                            `⏺️ ${alreadyDone.faxLabel || 'Fax'} — ${alreadyDone.clientName || 'Unknown'}`,
                            '#60a5fa',
                            'Already processed — receipt on file');
                    } else {
                        showResultPopup(triggerEl,
                            '⚠️ No matching entry for this fax number',
                            '#ff9800',
                            'Click ≡ N to assign manually');
                    }
                }
            }
        } catch (e) {
            console.warn("[iFax Observer] Process error:", e);
            showResultPopup(triggerEl, '❌ Processing failed', '#ef5350');
        } finally {
            if (mainBtn) mainBtn.innerHTML = '📠';
            // NOTE: extractAndProcess() handles isProcessing reset via releaseLock()
        }

        // Update the match count badge
        updateButtonState();
    }

    /**
     * Shows a result popup next to the trigger button, auto-hides after 5 seconds.
     * @param {HTMLElement} triggerEl — The trigger container
     * @param {string} message — Main line text
     * @param {string} color — CSS color for accent
     * @param {string} subtitle — Optional second line
     */
    function showResultPopup(triggerEl, message, color, subtitle) {
        // Remove existing
        const existing = document.getElementById('sn-ifax-result-popup');
        if (existing) existing.remove();

        const popup = document.createElement('div');
        popup.id = 'sn-ifax-result-popup';
        popup.style.cssText = `
            position: fixed;
            right: 62px;
            top: ${triggerEl.style.top || '50%'};
            background: #1e1e2e;
            color: #e0e0e0;
            border-radius: 10px;
            box-shadow: 0 6px 24px rgba(0,0,0,0.5);
            padding: 12px 16px;
            z-index: 2147483647;
            border: 1px solid rgba(255,255,255,0.1);
            font-family: 'Segoe UI', system-ui, sans-serif;
            font-size: 13px;
            max-width: 280px;
            pointer-events: none;
            transition: opacity 0.3s;
        `;

        const colorBar = document.createElement('div');
        colorBar.style.cssText = `
            position: absolute;
            left: 0; top: 0; bottom: 0;
            width: 4px;
            background: ${color || '#888'};
            border-radius: 10px 0 0 10px;
        `;
        popup.appendChild(colorBar);

        const msgDiv = document.createElement('div');
        msgDiv.style.cssText = 'font-weight:500; margin-left:4px;';
        msgDiv.textContent = message;
        popup.appendChild(msgDiv);

        if (subtitle) {
            const subDiv = document.createElement('div');
            subDiv.style.cssText = 'font-size:11px; color:#888; margin-top:4px; margin-left:4px;';
            subDiv.textContent = subtitle;
            popup.appendChild(subDiv);
        }

        document.body.appendChild(popup);

        // Auto-hide after 5 seconds
        setTimeout(() => {
            popup.style.opacity = '0';
            setTimeout(() => popup.remove(), 300);
        }, 5000);
    }

    /**
     * Shows all matching fax log entries (same fax number, today) so the user
     * can manually pick one if the auto-match picked wrong.
     */
    async function handleShowAllMatchesClick(triggerEl) {
        const bodyNode = document.querySelector(BODY_SELECTOR);
        if (!bodyNode) return;

        const emailText = bodyNode.innerText.trim();
        if (!emailText.includes(TRIGGER_PHRASE)) return;

        const numRegex = /Your fax message from\s+(\d+)\s+to\s+(\d+)\s+/i;
        const numMatch = emailText.match(numRegex);
        if (!numMatch) return;

        const receiverFax = numMatch[2];
        const faxLog = GM_getValue('sn_fax_log', []);

        // Filter: awaiting_report entries matching this fax number, today only
        const todayStr = new Date().toDateString();
        const matching = faxLog.filter(e => {
            if (e.status !== 'awaiting_report') return false;
            const entryFax = (e.faxNumber || e.receiverFax || '').replace(/\D/g, '');
            if (entryFax !== receiverFax) return false;
            // Check same day
            const entryDate = e.dateTime ? new Date(e.dateTime).toDateString() : '';
            return entryDate === todayStr;
        });

        if (matching.length === 0) {
            showResultPopup(triggerEl, '📭 No awaiting entries for this fax number today', '#888');
            return;
        }

        // Show picker (reuse showFaxPickerModal with just the filtered entries)
        const picked = await showFaxPickerModal(matching, receiverFax);
        if (!picked) return;

        // Re-read fax log and find this specific entry by ID
        const freshLog = GM_getValue('sn_fax_log', []);
        const pickIndex = freshLog.findIndex(e => e.id === picked.id);
        if (pickIndex === -1) {
            showResultPopup(triggerEl, '⚠️ Selected entry no longer exists', '#ff9800');
            return;
        }

        // Process the email using this specific entry
        isProcessing = true;
        const mainBtn = triggerEl.querySelector('.sn-ifax-main-btn');
        if (mainBtn) mainBtn.innerHTML = '⏳';

        try {
            await _extractAndProcessWithOverride(pickIndex);
            showResultPopup(triggerEl,
                `✅ ${picked.faxLabel || 'Fax'} — ${picked.clientName || 'Unknown'}`,
                '#4ade80',
                'Manually assigned — receipt saved');
        } catch (e) {
            console.warn("[iFax Observer] Manual match process error:", e);
            showResultPopup(triggerEl, '❌ Processing failed', '#ef5350');
        } finally {
            isProcessing = false;
            if (mainBtn) mainBtn.innerHTML = '📠';
            updateButtonState();
        }
    }

    /**
     * Processes the current email but forces the match to a specific fax log entry.
     * Used when user manually picks an entry from the "Show all matches" list.
     * Similar to _extractAndProcessImpl but skips auto-matching and uses the given index.
     */
    async function _extractAndProcessWithOverride(forcedIndex) {
        const bodyNode = document.querySelector(BODY_SELECTOR);
        if (!bodyNode) return;

        const emailText = bodyNode.innerText.trim();
        const emailHTML = bodyNode.innerHTML;

        if (!emailText.includes(TRIGGER_PHRASE)) return;

        const numRegex = /Your fax message from\s+(\d+)\s+to\s+(\d+)\s+/i;
        const numMatch = emailText.match(numRegex);
        if (!numMatch) return;

        const senderFax = numMatch[1];
        const receiverFax = numMatch[2];
        const isSuccess = emailText.includes('successfully');
        const isFailure = emailText.includes('fail') || emailText.includes('error') || emailText.includes('not sent');

        const dateRegex = /at\s+([\s\S]*?)\.\.?\s+Best regards/i;
        const dateMatch = emailText.match(dateRegex);
        const emailDate = dateMatch ? dateMatch[1].replace(/\n/g, ' ').trim().replace(/\s+/g, ' ') : '';

        const faxLog = GM_getValue('sn_fax_log', []);
        const matched = faxLog[forcedIndex];
        if (!matched) return;

        const clientName = matched.clientName || 'Unknown';
        const faxLabel   = matched.faxLabel || 'Fax';
        const fileNameBase = matched.fileName || '';
        const clientId   = matched.clientId || '';
        const entryId    = matched.id;

        // Handle failure
        if (isFailure || (!isSuccess && emailText.includes('Fax'))) {
            console.warn("[iFax Observer] ❌ Fax FAILED (manual match).");
            matched.status = 'failed';
            matched.emailDate = emailDate;
            matched.emailDateISO = new Date().toISOString();
            matched.senderFax = senderFax;
            if (faxLog.length > 500) faxLog.splice(0, faxLog.length - 500);
            GM_setValue('sn_fax_log', faxLog);
            GM_setValue('sn_fax_log_broadcast', Date.now());
            return;
        }

        // Generate receipt PDF
        const emailHeaders = extractOutlookHeaders();
        const reportContent =
`Fax from ${senderFax} to ${receiverFax} was sent successfully.
Dear customer.

Your fax message from ${senderFax} to ${receiverFax} was sent successfully at ${emailDate}..
Best regards,
iFax.PRO.`;

        await generateReceiptPdf(emailHTML, reportContent, senderFax, receiverFax, emailDate, clientName, faxLabel, fileNameBase, emailHeaders);

        // Update fax log
        const updatedLog = GM_getValue('sn_fax_log', []);
        const idx = updatedLog.findIndex(e => e.id === entryId);
        if (idx !== -1) {
            updatedLog[idx].status = 'pending_la';
            updatedLog[idx].senderFax = senderFax;
            updatedLog[idx].receiverFax = receiverFax;
            updatedLog[idx].receiptContent = reportContent;
            updatedLog[idx].emailDate = emailDate;
            updatedLog[idx].emailDateISO = new Date().toISOString();
            updatedLog[idx].hasReceipt = true;

            // Queue pending LA if logging enabled
            if (clientId && matched.logActivity !== false) {
                const pendingLAs = GM_getValue('sn_pending_auto_las', []);
                if (!pendingLAs.some(p => p.entryId === entryId)) {
                    pendingLAs.push({
                        entryId, clientId, clientName, faxLabel,
                        subject: matched.subject || `Fax Submitted - ${faxLabel}`,
                        content: matched.content ? `${matched.content}\n\n${reportContent}` : reportContent,
                        receiverFax, logActivity: matched.logActivity, timestamp: Date.now()
                    });
                    if (pendingLAs.length > 50) pendingLAs.splice(0, pendingLAs.length - 50);
                    GM_setValue('sn_pending_auto_las', pendingLAs);
                }
            }

            if (updatedLog.length > 500) updatedLog.splice(0, updatedLog.length - 500);
            GM_setValue('sn_fax_log', updatedLog);
            GM_setValue('sn_fax_log_broadcast', Date.now());
        }

        // Broadcast toast
        GM_setValue('sn_ifax_report_toast', {
            id: entryId, clientId, clientName, faxLabel, status: 'success', timestamp: Date.now()
        });

        // Copy to clipboard
        try { navigator.clipboard.writeText(emailText).catch(() => {}); } catch (_) {}

        // Mark as read
        markCurrentEmailAsRead();
    }

    /**
     * Updates the button appearance based on current email and mode.
     * In auto-mode, the main icon changes to ⚡ and auto-processing triggers.
     */
    function updateButtonState() {
        _syncAutoMode(); // Ensure fresh value from storage
        const badge = document.querySelector('.sn-ifax-match-badge');
        const mainBtn = document.querySelector('.sn-ifax-main-btn');
        if (!badge || !mainBtn) return;

        const bodyNode = document.querySelector(BODY_SELECTOR);
        if (!bodyNode) {
            mainBtn.innerHTML = _autoModeEnabled ? '⚡' : '📠';
            mainBtn.title = 'No email open';
            badge.innerHTML = `${_autoModeEnabled ? '⚡' : '≡'} 0`;
            badge.title = _autoModeEnabled ? 'Auto-mode ON — right-click 📠 to toggle' : 'Right-click 📠 for auto-mode';
            return;
        }

        const emailText = bodyNode.innerText.trim();
        if (!emailText.includes(TRIGGER_PHRASE)) {
            mainBtn.innerHTML = _autoModeEnabled ? '⚡' : '📠';
            mainBtn.title = _autoModeEnabled ? '⚡ Auto-mode — waiting for iFax emails' : 'Click 📠 to process iFax email';
            badge.innerHTML = `${_autoModeEnabled ? '⚡' : '≡'} 0`;
            badge.title = _autoModeEnabled ? 'Auto-mode ON — right-click to toggle' : 'Right-click 📠 for auto-mode';
            return;
        }

        const numRegex = /Your fax message from\s+(\d+)\s+to\s+(\d+)\s+/i;
        const numMatch = emailText.match(numRegex);
        if (!numMatch) {
            mainBtn.innerHTML = _autoModeEnabled ? '⚡' : '📠';
            badge.innerHTML = `${_autoModeEnabled ? '⚡' : '≡'} 0`;
            return;
        }

        const receiverFax = numMatch[2];
        const isFailure = emailText.includes('fail') || emailText.includes('error') || emailText.includes('not sent');
        const receiverStr = formatFaxNum(receiverFax);

        // Count awaiting_report entries matching this fax number today
        const faxLog = GM_getValue('sn_fax_log', []);
        const todayStr = new Date().toDateString();
        const matching = faxLog.filter(e => {
            if (e.status !== 'awaiting_report') return false;
            const entryFax = (e.faxNumber || e.receiverFax || '').replace(/\D/g, '');
            if (entryFax !== receiverFax) return false;
            const entryDate = e.dateTime ? new Date(e.dateTime).toDateString() : '';
            return entryDate === todayStr;
        });

        // Check if already processed (any entry has status pending_la for this fax)
        const alreadyProcessed = faxLog.some(e =>
            e.status === 'pending_la' &&
            (e.receiverFax || '').replace(/\D/g, '') === receiverFax
        );

        const modeIcon = _autoModeEnabled ? '⚡' : '📠';
        const modeHint = _autoModeEnabled ? 'Auto' : 'Manual';
        const mainTitleSuffix = _autoModeEnabled
            ? ' (auto-mode — right-click to toggle)'
            : ' (right-click for auto-mode)';

        if (isFailure) {
            mainBtn.title = `❌ Fax FAILED to ${receiverStr}${mainTitleSuffix}`;
            mainBtn.innerHTML = '❌';
            badge.innerHTML = `${_autoModeEnabled ? '⚡' : '≡'} ${matching.length}`;
            badge.title = matching.length > 0 ? `${matching.length} awaiting entries — click to assign` : 'No awaiting entries';
        } else if (alreadyProcessed) {
            mainBtn.title = `✅ Done — ${receiverStr}${mainTitleSuffix}`;
            mainBtn.innerHTML = '✅';
            badge.innerHTML = `${_autoModeEnabled ? '⚡' : '≡'} ${matching.length}`;
            badge.title = matching.length > 0 ? `${matching.length} other entries — click to assign` : 'All processed';
        } else {
            mainBtn.title = `${modeIcon} ${modeHint} — fax to ${receiverStr}${mainTitleSuffix}`;
            mainBtn.innerHTML = modeIcon;
            badge.innerHTML = `${_autoModeEnabled ? '⚡' : '≡'} ${matching.length}`;
            badge.title = matching.length > 0
                ? `${matching.length} matching entries — click to see all (${modeHint.toLowerCase()} mode)`
                : `No awaiting entries for this fax number (${modeHint.toLowerCase()} mode)`;
        }
    }

    // ── Auto Mode ──────────────────────────────────────────────────────

    /**
     * Toggles the auto-process mode on/off.
     * When ON, iFax receipt emails are processed automatically as soon as
     * they're detected in the reading pane (no manual click needed).
     * State is persisted in GM storage.
     */
    function toggleAutoMode() {
        _autoModeEnabled = !_autoModeEnabled;
        GM_setValue('sn_ifax_auto_mode', _autoModeEnabled);
        console.log(`[iFax Observer] Auto-mode: ${_autoModeEnabled ? 'ON ✅' : 'OFF ❌'}`);

        // Refresh the button appearance
        updateButtonState();

        // Show brief confirmation
        const triggerEl = document.getElementById('sn-ifax-observer-trigger');
        if (triggerEl) {
            const msg = _autoModeEnabled ? '⚡ Auto-mode ON' : '📠 Manual mode';
            showResultPopup(triggerEl, msg, _autoModeEnabled ? '#4ade80' : '#888',
                _autoModeEnabled ? 'Faxes process automatically' : 'Click 📠 to process');
        }

        // When enabling auto-mode, immediately scan the email list for unread iFax emails.
        // Without this, the user has to wait for the next alarm cycle (up to 2 min) or
        // the first smart-poll tick (3 min) before any scanning happens.
        if (_autoModeEnabled) {
            setTimeout(() => autoCheckForIFaxEmails(), 1000);
        }
    }

    /**
     * Attempts to auto-process the currently open iFax email.
     * Only fires in auto-mode, with debounce, and only if the email hasn't
     * already been processed.
     */
    function tryAutoProcess() {
        if (!_autoModeEnabled) return;
        if (isProcessing) return;

        const bodyNode = document.querySelector(BODY_SELECTOR);
        if (!bodyNode) return;

        const emailText = bodyNode.innerText.trim();
        if (!emailText.includes(TRIGGER_PHRASE)) return;

        // Build a unique key for this email to avoid re-processing
        const numMatch = emailText.match(/Your fax message from\s+(\d+)\s+to\s+(\d+)\s+/i);
        if (!numMatch) return;
        const uniqueKey = `ifax_${numMatch[1]}_${numMatch[2]}`;

        // Already processed this exact email?
        if (uniqueKey === _lastAutoProcessedKey) return;
        if (_processedSubjects.has(uniqueKey)) return;

        // Check if any entry already has pending_la status for this fax number
        const faxLog = GM_getValue('sn_fax_log', []);
        const alreadyProcessed = faxLog.some(e =>
            e.status === 'pending_la' &&
            (e.receiverFax || '').replace(/\D/g, '') === numMatch[2]
        );
        if (alreadyProcessed) return;

        // Also skip failures
        const isFailure = emailText.includes('fail') || emailText.includes('error') || emailText.includes('not sent');
        if (isFailure) return;

        // Debounce: clear any pending timer
        if (_autoProcessTimer) {
            clearTimeout(_autoProcessTimer);
            _autoProcessTimer = null;
        }

        _autoProcessTimer = setTimeout(() => {
            _autoProcessTimer = null;
            _lastAutoProcessedKey = uniqueKey;
            _processedSubjects.add(uniqueKey);
            console.log(`[iFax Observer] ⚡ Auto-processing fax to ${formatFaxNum(numMatch[2])}`);
            const triggerEl = document.getElementById('sn-ifax-observer-trigger');
            if (triggerEl) handleProcessClick(triggerEl);
        }, 1500); // 1.5s delay to let the email render fully
    }

    /**
     * Checks if the current Outlook folder is the iFax folder.
     * Reads the active/nav-selected folder element from the folder pane.
     * @returns {boolean}
     */
    function isInIFaxFolder() {
        try {
            // Strategy 1: Find the folder navigation area, then check its selected item.
            // In Outlook Web, the folder list is typically a tree within a navigation region.
            const folderNav = document.querySelector(
                '[role="tree"], ' +
                '[role="navigation"], ' +
                '[aria-label*="folder" i]'
            );

            if (folderNav) {
                const selected = folderNav.querySelector(
                    '[aria-current="true"], ' +
                    '[aria-selected="true"], ' +
                    '[class*="selected"]'
                );
                if (selected) {
                    const name = (selected.getAttribute('title') || selected.getAttribute('aria-label') || selected.textContent || '').toLowerCase();
                    return name.includes('ifax');
                }
            }

            // Strategy 2: Broader search — find a selected treeitem/nav element containing "ifax".
            // Avoids matching the selected email row (which is not in the folder nav).
            const broadSelected = document.querySelector(
                '[aria-current="page"], ' +
                '[role="treeitem"][aria-selected="true"]'
            );
            if (broadSelected) {
                const name = (broadSelected.getAttribute('title') || broadSelected.getAttribute('aria-label') || broadSelected.textContent || '').toLowerCase();
                return name.includes('ifax');
            }

            return false;
        } catch (_) {
            return false;
        }
    }

    // ── Smart Polling (driven by background alarm) ──────────────────────
    // The background alarm IS the polling timer. The content script just
    // tells the background what interval to use and processes each tick.
    // No local setTimeout chain needed — this avoids timer throttling in
    // backgrounded tabs entirely.

    function startSmartPolling() {
        // Always restart from fast phase — new fax entry resets the clock
        _smartPollStart = Date.now();
        _smartPollPhase = 'fast';
        _folderWarningShownThisCycle = false; // allow fresh warning for new cycle
        console.log(`[iFax Observer] 📡 Smart polling: every 3 min for next 15 min`);
        chrome.runtime.sendMessage({ action: 'sn_ifax_start_polling', intervalMinutes: 3 })
            .catch(() => {});
    }

    /**
     * Called on each alarm tick to advance the polling phase.
     * Returns true if polling should continue, false if it should stop.
     */
    function _advancePollingPhase() {
        const elapsed = Date.now() - _smartPollStart;

        // ── Max duration reached? Stop permanently. ──
        if (elapsed >= MAX_POLL_MS) {
            console.log("[iFax Observer] 📡 Smart polling ended — 30 min max reached.");
            _smartPollPhase = 'done';
            chrome.runtime.sendMessage({ action: 'sn_ifax_stop_polling' }).catch(() => {});
            return false;
        }

        // ── Not in iFax folder? Pause unless auto-mode is on. ──
        if (!isInIFaxFolder() && !_autoModeEnabled) {
            console.log("[iFax Observer] 📡 Smart polling paused — not in iFax folder.");
            _smartPollPhase = 'idle';
            chrome.runtime.sendMessage({ action: 'sn_ifax_stop_polling' }).catch(() => {});
            return false;
        }

        // ── Transition from fast → slow after 15 min ──
        if (_smartPollPhase === 'fast' && elapsed >= FAST_PHASE_MS) {
            _smartPollPhase = 'slow';
            const remaining = Math.round((MAX_POLL_MS - elapsed) / 60000);
            console.log(`[iFax Observer] 📡 Smart polling: every 5 min for remaining ${remaining} min`);
            chrome.runtime.sendMessage({ action: 'sn_ifax_start_polling', intervalMinutes: 5 })
                .catch(() => {});
        }

        return true;
    }

    function stopSmartPolling() {
        _smartPollPhase = 'idle';
        chrome.runtime.sendMessage({ action: 'sn_ifax_stop_polling' }).catch(() => {});
        console.log("[iFax Observer] 📡 Smart polling stopped.");
    }

    /**
     * Initialize the observer. Creates the trigger button.
     * Listens for new fax entries via GM storage — starts smart polling when
     * a fax is sent. Watches the email body to update button state.
     */
    function init() {
        createTrigger();

        // ── Sync auto-mode across tabs ──
        GM_addValueChangeListener('sn_ifax_auto_mode', (name, oldVal, newVal, remote) => {
            _syncAutoMode();
            updateButtonState();
        });

        // ── Listen for new fax entries → start smart polling ──
        GM_addValueChangeListener('sn_fax_log', (name, oldVal, newVal, remote) => {
            if (!remote) return;
            // Only trigger if brand new 'awaiting_report' entries appeared
            const oldEntries = Array.isArray(oldVal) ? oldVal : [];
            const newEntries = Array.isArray(newVal) ? newVal : [];
            const hasNewFax = newEntries.some(e =>
                e.status === 'awaiting_report' &&
                !oldEntries.some(o => o.id === e.id)
            );
            if (hasNewFax) {
                console.log("[iFax Observer] 📡 New fax entry detected — starting smart polling.");
                startSmartPolling();
                // Auto-process any open iFax email if auto-mode is on
                tryAutoProcess();
            }
            // Also update button state when fax log changes (e.g. from Dashboard)
            updateButtonState();
        });

        // ── Watch body content to update button state & auto-process ──
        setTimeout(() => {
            const bodyNode = document.querySelector(BODY_SELECTOR);
            if (bodyNode) {
                const bodyObserver = new MutationObserver(() => {
                    updateButtonState();
                    // In auto-mode, try to process the email automatically
                    tryAutoProcess();
                });
                bodyObserver.observe(bodyNode, {
                    childList: true,
                    subtree: true,
                    characterData: true
                });
                updateButtonState();
                // Initial auto-process check on the current email
                tryAutoProcess();
            }
            // If auto-mode is already on, also scan the email list for unread iFax emails.
            // The body MutationObserver only reacts to changes — it won't fire for emails
            // that are already in the list waiting to be read.
            if (_autoModeEnabled) {
                setTimeout(() => autoCheckForIFaxEmails(), 1500);
            }
        }, 4000);
    }

    /**
     * Polls for the email body element to appear and have content.
     * Uses progressive setTimeout to work around Chrome's background tab
     * timer throttling (setTimeout is clamped to ≥1s in hidden tabs).
     *
     * @param {number} maxWaitMs - Maximum wall-clock time to wait (ms)
     * @returns {Promise<Element|null>} The body element, or null if timeout
     */
    function waitForBodyContent(maxWaitMs) {
        return new Promise((resolve) => {
            const start = Date.now();
            const el = document.querySelector(BODY_SELECTOR);
            if (el && el.innerText && el.innerText.trim().length > 0) {
                resolve(el);
                return;
            }
            function poll() {
                const e = document.querySelector(BODY_SELECTOR);
                if (e && e.innerText && e.innerText.trim().length > 0) {
                    resolve(e);
                    return;
                }
                if (Date.now() - start >= maxWaitMs) {
                    resolve(null);
                    return;
                }
                setTimeout(poll, 200);
            }
            setTimeout(poll, 200);
        });
    }

    /**
     * Scans the email list for unread iFax confirmation emails and
     * auto-processes the first match found. Skips if already processing
     * or if the subject was previously processed.
     *
     * IMPORTANT: Does NOT mark the email as processed until AFTER the body
     * has been confirmed to contain the iFax trigger phrase. This ensures
     * that if the tab is backgrounded and the body doesn't render, the next
     * alarm cycle or MutationObserver trigger will retry the same email.
     */
    async function autoCheckForIFaxEmails() {
        if (isProcessing || _autoCheckRunning) return;
        _autoCheckRunning = true;

        try {
            const targetNode = document.querySelector(LIST_SELECTOR);
            if (!targetNode) return;

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
                    // Still mark in DOM so selector skips it on future scans
                    item.setAttribute('data-sn-ifax-processed', 'true');
                    continue;
                }

                console.log("[iFax Observer] 🔍 Auto-detected unread iFax email, clicking to process...");
                const clickable = item.closest('[role="option"], [role="row"]') || item;
                clickable.click();
                isProcessing = true;

                // ── Wait for body to render ───────────────────────────
                // Uses polling (not a single setTimeout) so that if the tab
                // is backgrounded and Chrome throttles timers, we still
                // eventually detect when the body becomes available (e.g.
                // when the user activates the tab and Outlook renders it).
                //
                // CRITICAL: Do NOT mark data-sn-ifax-processed or add to
                // _processedSubjects until the body is confirmed. Otherwise
                // the email is lost permanently if rendering fails in a
                // background tab.
                const bodyNode = await waitForBodyContent(5000);
                if (!bodyNode) {
                    console.warn("[iFax Observer] Email body did not render within timeout (tab may be backgrounded). Will retry on next cycle.");
                    isProcessing = false;
                    // Do NOT mark as processed — next alarm cycle or
                    // MutationObserver trigger will retry this email.
                    return;
                }

                // Confirm this is really an iFax email before committing
                const emailText = bodyNode.innerText.trim();
                if (!emailText.includes(TRIGGER_PHRASE)) {
                    console.log("[iFax Observer] Skipped — not an iFax confirmation.");
                    isProcessing = false;
                    return;
                }

                try {
                    await extractAndProcess(true); // true = autoMode
                } catch (e) {
                    console.warn("[iFax Observer] extractAndProcess error:", e);
                }
                // NOTE: isProcessing is reset inside extractAndProcess → releaseLock()

                // Only mark email as processed if it was actually matched.
                // If extractAndProcess silently skipped (no awaiting_report entry),
                // don't blacklist — the fax log may not have synced yet, and a
                // future alarm cycle or manual click should retry it.
                const faxLogAfter = GM_getValue('sn_fax_log', []);
                const wasProcessed = faxLogAfter.some(e =>
                    e.status === 'pending_la' &&
                    (e.receiverFax || '').replace(/\D/g, '') === faxMatchDedup[2]
                );
                if (wasProcessed) {
                    item.setAttribute('data-sn-ifax-processed', 'true');
                    _processedSubjects.add(uniqueKey);
                } else {
                    console.log("[iFax Observer] Auto-mode did not match — will retry on next cycle.");
                }

                // Schedule another check in case more unread iFax emails arrived during processing
                setTimeout(() => autoCheckForIFaxEmails(), 5000);
                return;
            }

            // ── Guard rail: no unread iFax emails found ───────────────
            // If there are pending fax entries but we found nothing, the
            // user might be in the wrong folder. Show a one-time warning.
            // Only check TODAY's entries to avoid stale previous-day noise.
            if (!isInIFaxFolder()) {
                const faxLog = GM_getValue('sn_fax_log', []);
                const todayStart = new Date();
                todayStart.setHours(0, 0, 0, 0);
                const hasPending = faxLog.some(e =>
                    e.status === 'awaiting_report' &&
                    (e.timestamp || 0) >= todayStart.getTime()
                );
                if (hasPending) {
                    _warnNotInIFaxFolder();
                }
            }
        } catch (e) {
            console.warn("[iFax Observer] Auto-check error:", e);
        } finally {
            _autoCheckRunning = false;
        }
    }

    // ── Folder Warning (one-time ping per polling cycle) ────────────
    let _folderWarningShownThisCycle = false;

    /**
     * Shows a one-time notification on the Outlook page when faxes are
     * pending but the page isn't focused on the iFax folder.
     * Automatically disappears after 5 seconds.
     * Resets on each new polling cycle.
     */
    function _warnNotInIFaxFolder() {
        // Only ping once per polling cycle
        if (_folderWarningShownThisCycle) return;
        _folderWarningShownThisCycle = true;
        // Reset on next cycle start
        setTimeout(() => { _folderWarningShownThisCycle = false; }, MAX_POLL_MS);

        console.log("[iFax Observer] ⚠️ Not in iFax folder — showing warning.");

        // Build a floating toast on the Outlook page
        const toast = document.createElement('div');
        toast.id = 'sn-ifax-folder-warning';
        toast.style.cssText = `
            position: fixed;
            top: 24px;
            right: 24px;
            background: #1a1a2e;
            color: #e0e0e0;
            border-radius: 10px;
            padding: 14px 20px;
            z-index: 2147483647;
            font-family: 'Segoe UI', system-ui, sans-serif;
            font-size: 13px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.4);
            border: 1px solid rgba(255,255,255,0.1);
            border-left: 4px solid #ff9800;
            max-width: 340px;
            pointer-events: none;
            transition: opacity 0.3s;
        `;
        toast.innerHTML = `
            <div style="font-weight:600; margin-bottom:4px;">⚠️ Not in iFax folder</div>
            <div style="font-size:11px; color:#aaa;">Pending fax receipts detected — but Outlook doesn't seem to be showing the iFax folder. Navigate to your iFax folder so receipts can be processed.</div>
        `;

        document.body.appendChild(toast);

        // Auto-remove after 5 seconds
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
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

        // ── Match against fax log: FIFO (oldest awaiting_report first) ──
        // This ensures that when multiple faxes were sent to the same number
        // on the same day, the first receipt email matches the first fax entry,
        // the second receipt matches the second entry, etc.
        const faxLog = GM_getValue('sn_fax_log', []);
        let matchedIndex = -1;
        let earliestTs = Infinity;
        faxLog.forEach((entry, idx) => {
            if (entry.status !== 'awaiting_report') return;
            const entryFax = (entry.faxNumber || entry.receiverFax || '').replace(/\D/g, '');
            if (entryFax === receiverFax && (entry.timestamp || 0) < earliestTs) {
                earliestTs = entry.timestamp || 0;
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
            // Auto-mode: no match found — skip silently. The user can click
            // "Show all matches" (≡ N) on the button to manually pick.
            console.log("[iFax Observer] Auto-mode: no awaiting_report entry matches this fax number. Skipping.");
            return;
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

        // Generate receipt PDF by capturing the print-template page as a screenshot,
        // embedding it via PDFLib, and merging with the original fax PDF.
        // Returns true if the receipt was generated and saved to sn_fax_generated_pdfs.
        // NOTE: generateReceiptPdf modifies sn_fax_generated_pdfs and sn_fax_log
        // directly — the code below re-reads from storage to get the latest state.
        const receiptGenerated = await generateReceiptPdf(emailHTML, reportContent, senderFax, receiverFax, emailDate, clientName, faxLabel, fileNameBase, emailHeaders);

        // ── Update unified fax log with receipt metadata ───────────────────
        // Re-read fax log — generateReceiptPdf may have modified it (hasReceipt,
        // receiptMerged, pdfBase64, fileName were potentially updated).
        const updatedFaxLog = GM_getValue('sn_fax_log', []);
        let updatedMatchedIndex = updatedFaxLog.findIndex(e => e.id === entryId);
        if (updatedMatchedIndex === -1 && fileNameBase) {
            updatedMatchedIndex = updatedFaxLog.findIndex(e => e.fileName === fileNameBase);
        }
        console.log("[iFax Observer] 🔍 Second lookup:", {
            entryId,
            fileNameBase,
            receiverFax,
            updatedMatchedIndex,
            faxLogLength: updatedFaxLog.length,
            receiptGenerated,
            matchedEntry_at_start: updatedFaxLog.find(e => e.id === entryId)
                ? { subject: updatedFaxLog.find(e => e.id === entryId).subject,
                    content: (updatedFaxLog.find(e => e.id === entryId).content || '').slice(0, 60),
                    status: updatedFaxLog.find(e => e.id === entryId).status,
                    id: updatedFaxLog.find(e => e.id === entryId).id }
                : 'NOT FOUND'
        });
        if (updatedMatchedIndex !== -1) {
            // Set metadata fields — generateReceiptPdf already handled hasReceipt/
            // receiptMerged/pdfBase64/fileName, so don't override those.
            updatedFaxLog[updatedMatchedIndex].status = 'pending_la';
            updatedFaxLog[updatedMatchedIndex].senderFax = senderFax;
            updatedFaxLog[updatedMatchedIndex].receiverFax = receiverFax;
            updatedFaxLog[updatedMatchedIndex].receiptContent = reportContent;
            updatedFaxLog[updatedMatchedIndex].emailDate = emailDate;
            updatedFaxLog[updatedMatchedIndex].emailDateISO = new Date().toISOString();
            // If generateReceiptPdf failed, ensure hasReceipt reflects reality
            if (!receiptGenerated) {
                updatedFaxLog[updatedMatchedIndex].hasReceipt = false;
            }
        } else {
            updatedFaxLog.push({
                id: entryId,
                clientId, clientName, faxLabel,
                faxType: '', faxNumber: receiverFax, receiverFax, senderFax,
                status: 'pending_la',
                subject: '', content: '',
                receiptContent: reportContent,
                emailDate, emailDateISO: new Date().toISOString(),
                pdfBase64: '', fileName: fileNameBase,
                timestamp: Date.now(), resolvedAt: null,
                dateTime: new Date().toISOString(),
                hasReceipt: true
            });
        }
        if (updatedFaxLog.length > 500) updatedFaxLog.splice(0, updatedFaxLog.length - 500);
        GM_setValue('sn_fax_log', updatedFaxLog);
        GM_setValue('sn_fax_log_broadcast', Date.now());

        // ── Store pending auto-LA data for SF tab to auto-create ───────
        // Only when logging is enabled (per-entry flag), in autoMode, with a real client match.
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
        if (clientId && autoMode && updatedMatchedIndex !== -1) {
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

    function releaseLock() {
        isProcessing = false;
    }

    /**
     * Captures a screenshot of the rendered Outlook email via the background
     * service worker, embeds it into a PDF using PDFLib, and merges with the
     * original fax PDF.
     *
     * Flow:
     *   1. Build clean HTML from the Outlook reading pane via buildPrintHtml()
     *   2. Send HTML to background service worker
     *   3. Background opens print-template.html (with ?capture=1, toolbar hidden)
     *   4. Background waits for render, calls captureVisibleTab, returns PNG dataUrl
     *   5. Use PDFLib to embed the PNG into a PDF
     *   6. Merge with original fax PDF from sn_fax_generated_pdfs (if available)
     *   7. Save merged PDF to sn_fax_generated_pdfs
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
     * @returns {Promise<boolean>} true if receipt PDF was generated and saved
     */
    async function generateReceiptPdf(emailHTML, reportContent, senderFax, receiverFax, emailDate, clientName, faxLabel, fileNameBase, headers) {
        try {
            const PDFLib = window.PDFLib;
            if (!PDFLib) {
                console.error("[iFax Observer] PDFLib not available.");
                return false;
            }

            // ── Locate the reading pane ──
            const readingPane = document.querySelector('#ReadingPaneContainerId')
                || document.querySelector('[role="main"]')
                || document.querySelector(BODY_SELECTOR);
            if (!readingPane) {
                console.error("[iFax Observer] Reading pane not found.");
                return false;
            }

            // ── Build clean print HTML ──
            const { html, title } = buildPrintHtml(readingPane);

            // ── Ask background to capture the rendered page ──
            const response = await chrome.runtime.sendMessage({
                type: 'CAPTURE_PRINT_PAGE',
                html: html,
                title: title
            });

            if (!response || !response.success || !response.dataUrl) {
                console.error("[iFax Observer] Background capture failed:", response?.error || 'No data URL');
                return false;
            }

            const screenshotDataUrl = response.dataUrl;
            console.log("[iFax Observer] ✅ Screenshot captured, generating receipt PDF...");
            const pngImageBytes = await fetch(screenshotDataUrl).then(r => r.arrayBuffer());

            // ── Create a PDF from the screenshot ──
            const receiptPdfDoc = await PDFLib.PDFDocument.create();
            const pngImage = await receiptPdfDoc.embedPng(new Uint8Array(pngImageBytes));
            const pngDims = pngImage.scaleToFit(600, 780);

            const page = receiptPdfDoc.addPage([612, 792]);
            page.drawImage(pngImage, {
                x: 6,
                y: page.getHeight() - pngDims.height - 6,
                width: pngDims.width,
                height: pngDims.height,
            });

            const receiptPdfBase64 = await receiptPdfDoc.saveAsBase64({ dataUri: true });

            // ── Find the original fax PDF to merge with ──
            const generatedPdfs = GM_getValue('sn_fax_generated_pdfs', []);
            const faxLog = GM_getValue('sn_fax_log', []);
            const logEntry = faxLog.find(e =>
                (e.status === 'pending_la' || e.status === 'awaiting_report') &&
                (e.receiverFax || '').replace(/\D/g, '') === receiverFax &&
                e.clientName === clientName
            );
            const faxType = logEntry ? logEntry.faxType : '';
            const clientId = logEntry ? logEntry.clientId : '';

            const faxPdfEntry = generatedPdfs.find(p =>
                p.clientName === clientName &&
                p.type === 'fax' &&
                (!faxType || p.faxType === faxType)
            );

            if (faxType === '1696') {
                // ── 1696: Store receipt separately, do NOT merge ──
                const receiptFileName = `${fileNameBase} - iFax report.pdf`;

                if (logEntry) {
                    logEntry.hasReceipt = true;
                    logEntry.receiptMerged = false;
                    GM_setValue('sn_fax_log', faxLog);
                }

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

                console.log(`[iFax Observer] ✅ 1696 receipt saved separately: ${receiptFileName}`);
            } else {
                // ── Non-1696: Merge receipt into the original fax PDF ──
                let mergedPdfDoc;
                if (faxPdfEntry) {
                    const faxBytes = await fetch(faxPdfEntry.pdfBase64).then(r => r.arrayBuffer());
                    mergedPdfDoc = await PDFLib.PDFDocument.load(faxBytes);
                } else {
                    console.warn("[iFax Observer] No original fax PDF found, creating receipt-only document.");
                    mergedPdfDoc = await PDFLib.PDFDocument.create();
                }

                const imgEmbed = await mergedPdfDoc.embedPng(new Uint8Array(pngImageBytes));
                const imgDims = imgEmbed.scaleToFit(600, 780);

                const receiptPage = mergedPdfDoc.addPage([612, 792]);
                receiptPage.drawImage(imgEmbed, {
                    x: 6,
                    y: receiptPage.getHeight() - imgDims.height - 6,
                    width: imgDims.width,
                    height: imgDims.height,
                });

                const mergedPdfBase64 = await mergedPdfDoc.saveAsBase64({ dataUri: true });
                const mergedFileName = faxPdfEntry
                    ? faxPdfEntry.fileName.replace(/\.pdf$/i, ' + iFax report.pdf')
                    : `${fileNameBase} + iFax report.pdf`;

                if (logEntry) {
                    logEntry.pdfBase64 = mergedPdfBase64;
                    logEntry.fileName = mergedFileName;
                    logEntry.receiptMerged = true;
                    logEntry.hasReceipt = true;
                    GM_setValue('sn_fax_log', faxLog);
                }

                if (faxPdfEntry) {
                    faxPdfEntry.pdfBase64 = mergedPdfBase64;
                    faxPdfEntry.fileName = mergedFileName;
                    faxPdfEntry.type = 'fax';
                    faxPdfEntry.hasReceipt = true;
                    faxPdfEntry.timestamp = Date.now();
                } else {
                    generatedPdfs.push({
                        pdfBase64: mergedPdfBase64,
                        fileName: mergedFileName,
                        clientId: clientId || '',
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

                console.log(`[iFax Observer] ✅ Receipt merged into: ${mergedFileName}`);
            }

            return true;
        } catch (err) {
            console.error("[iFax Observer] generateReceiptPdf error:", err);
            try {
                if (typeof app !== 'undefined' && app.Core && app.Core.Utils) {
                    app.Core.Utils.showNotification(
                        '⚠️ Receipt PDF generation failed. The iFax confirmation email can be printed from Outlook manually.',
                        { type: 'error', duration: 5000 }
                    );
                }
            } catch (_) {}
            return false;
        }
    }

    // updateFaxLabelFromBody() removed — replaced by updateButtonState()

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

    // ── Build a clean print-ready HTML document ────────────────────────
    // Returns { html, title } for the print template page.
    function buildPrintHtml(readingPane) {
        const cmName = GM_getValue('sn_global_cm1', '') || 'CM';
        const cmEmail = GM_getValue('sn_global_email', '') || '';

        // ── Subject ──
        let subject = '';
        const subjectEl = readingPane.querySelector('span.Xz4k3');
        if (subjectEl) {
            subject = subjectEl.getAttribute('title') || subjectEl.textContent || '';
        }

        // ── Date ──
        let dateText = '';
        const dateEl = readingPane.querySelector('div[data-testid="SentReceivedSavedTime"]');
        if (dateEl) {
            dateText = dateEl.textContent || '';
        }

        // ── From (full text with email + brackets) ──
        let fromText = '';
        const fromSpan = readingPane.querySelector('span.OZZZK.AtwsJ');
        if (fromSpan) {
            fromText = fromSpan.textContent || '';
        }

        // ── Email body ──
        const bodyEl = readingPane.querySelector('[aria-label="Message body"]');
        let bodyHTML = '';
        if (bodyEl) {
            bodyHTML = bodyEl.innerHTML;
            bodyHTML = bodyHTML.replace(/<div[^>]*visibility:\s*hidden[^>]*>/gi, '');
            bodyHTML = bodyHTML.replace(/<\/div>\s*$/g, '');
        }

        const outlookLogoUrl = chrome.runtime.getURL('icon/outlook.svg');

        const html = `
<div style="font-family:'Segoe UI',Arial,sans-serif;font-size:13pt;color:#000;max-width:780px;padding:36px 40px 28px 40px;background:#fff;">

    <div style="display:flex;align-items:center;gap:8px;margin-bottom:22px;font-size:10pt;color:#666;">
        <img src="${outlookLogoUrl}" alt="" style="width:24px;height:24px;">
        <span style="font-weight:600;">Outlook</span>
    </div>

    <hr style="border:none;border-top:1px solid #c8c8c8;margin:0 0 16px 0;">

    <div style="font-size:12pt;font-weight:600;margin-bottom:14px;line-height:1.3;">${escapeHtml(subject)}</div>

    <hr style="border:none;border-top:1px solid #c8c8c8;margin:0 0 16px 0;">

    <table style="width:100%;border-collapse:collapse;margin-bottom:14px;font-size:11pt;">
        <tr><td style="width:56px;color:#666;padding:2px 8px 2px 0;vertical-align:top;white-space:nowrap;"><b>From</b></td>
            <td style="color:#000;padding:2px 0;vertical-align:top;">${escapeHtml(fromText)}</td></tr>
        <tr><td style="width:56px;color:#666;padding:2px 8px 2px 0;vertical-align:top;white-space:nowrap;"><b>Date</b></td>
            <td style="color:#000;padding:2px 0;vertical-align:top;">${escapeHtml(dateText)}</td></tr>
        <tr><td style="width:56px;color:#666;padding:2px 8px 2px 0;vertical-align:top;white-space:nowrap;"><b>To</b></td>
            <td style="color:#000;padding:2px 0;vertical-align:top;">${escapeHtml(cmName + (cmEmail ? ' ' + cmEmail : ''))}</td></tr>
    </table>

    <br>

    <div style="font-size:11pt;line-height:1.5;">
        ${bodyHTML}
    </div>

    <style>
        a { color: #0078D4; text-decoration: underline; }
        a:hover { color: #004578; }
    </style>

</div>`;

        return {
            html,
            title: `iFax Report - ${cmName} - Outlook`
        };
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    // ── Debug test button ──────────────────────────────────────────────
    // Tests the full background capture → PDF generation flow:
    //   1. Builds clean HTML from the reading pane (buildPrintHtml)
    //   2. Sends CAPTURE_PRINT_PAGE to background (opens print-template,
    //      captures screenshot, returns PNG data URL)
    //   3. Uses PDFLib to embed the PNG into a PDF
    //   4. Stores in chrome.storage.local & opens preview.html
    (function addTestButton() {
        const btn = document.createElement('button');
        btn.textContent = '📸 Test PDF';
        btn.id = 'sn-test-pdf-btn';
        Object.assign(btn.style, {
            position: 'fixed', bottom: '20px', right: '20px', zIndex: 99999,
            padding: '10px 18px', fontSize: '14px', fontWeight: 'bold',
            background: '#0078D4', color: 'white', border: 'none',
            borderRadius: '6px', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
        });
        document.body.appendChild(btn);

        btn.onclick = async function () {
            const readingPane =
                document.querySelector('#ReadingPaneContainerId') ||
                document.querySelector('[role="main"]');
            if (!readingPane) {
                alert('❌ Open an iFax confirmation email in the reading pane first.');
                return;
            }

            btn.textContent = '⏳ 1/3 Building HTML...';
            btn.disabled = true;

            try {
                // Step 1: Build the clean print HTML
                const { html, title } = buildPrintHtml(readingPane);
                btn.textContent = '⏳ 2/3 Capturing screenshot...';

                // Step 2: Send to background for captureViaVisibleTab
                const response = await chrome.runtime.sendMessage({
                    type: 'CAPTURE_PRINT_PAGE',
                    html: html,
                    title: title
                });

                if (!response || !response.success || !response.dataUrl) {
                    alert('❌ Capture failed: ' + (response?.error || 'No data URL'));
                    btn.textContent = '📸 Test PDF';
                    btn.disabled = false;
                    return;
                }

                btn.textContent = '⏳ 3/3 Generating PDF...';

                // Step 3: Create a PDF from the screenshot using PDFLib
                const PDFLib = window.PDFLib;
                if (!PDFLib) {
                    alert('❌ PDFLib not available');
                    btn.textContent = '📸 Test PDF';
                    btn.disabled = false;
                    return;
                }

                const pdfDoc = await PDFLib.PDFDocument.create();
                const pngBytes = await fetch(response.dataUrl).then(r => r.arrayBuffer());
                const pngImage = await pdfDoc.embedPng(new Uint8Array(pngBytes));
                const pngDims = pngImage.scaleToFit(600, 780);

                const page = pdfDoc.addPage([612, 792]);
                page.drawImage(pngImage, {
                    x: 6,
                    y: page.getHeight() - pngDims.height - 6,
                    width: pngDims.width,
                    height: pngDims.height,
                });

                const pdfBase64 = await pdfDoc.saveAsBase64({ dataUri: true });
                const fileName = `iFax Report Test - ${new Date().toLocaleDateString().replace(/\//g, '-')}.pdf`;

                // Step 4: Store for preview.html to read
                await new Promise(r => chrome.storage.local.set({
                    'sn_temp_preview_pdf': { pdfBase64, fileName }
                }, r));

                // Open preview.html
                chrome.runtime.sendMessage({
                    type: 'GM_openInTab',
                    url: chrome.runtime.getURL('src/preview.html'),
                    active: true
                });

                btn.textContent = '✅ Done';
                setTimeout(() => {
                    btn.textContent = '📸 Test PDF';
                    btn.disabled = false;
                }, 3000);

                console.log('[Test] ✅ PDF generated:', fileName, `(${(pdfBase64.length * 0.75 / 1024).toFixed(0)} KB)`);
            } catch (e) {
                console.error('[Test] Error:', e);
                alert('❌ Error: ' + e.message);
                btn.textContent = '📸 Test PDF';
                btn.disabled = false;
            }
        };
    })();

    // ── Message listener ───────────────────────────────────────────────
    // The background alarm IS the polling timer. Each tick fires this handler,
    // which advances the phase and runs the scan. No independent setTimeout.
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'sn_ifax_check') {
            console.log('[iFax Observer] Received sn_ifax_check from service worker');

            // ── Not currently polling? Check if there are pending faxes to start. ──
            if (_smartPollPhase === 'idle' || _smartPollPhase === 'done') {
                const faxLog = GM_getValue('sn_fax_log', []);
                const todayStart = new Date();
                todayStart.setHours(0, 0, 0, 0);
                const hasRecentPending = faxLog.some(e =>
                    e.status === 'awaiting_report' &&
                    (e.timestamp || 0) >= todayStart.getTime()
                );
                if (hasRecentPending) {
                    console.log('[iFax Observer] Pending faxes found — starting smart polling.');
                    startSmartPolling();
                    // Scan immediately this tick (first tick is instant, not 3 min later)
                    autoCheckForIFaxEmails();
                    return;
                }
                // No pending faxes — nothing to do
                return;
            }

            // ── Polling is active — advance the phase (fast→slow→stop) and scan ──
            const shouldContinue = _advancePollingPhase();
            if (shouldContinue) {
                autoCheckForIFaxEmails();
            }
        }
    });

    // ── Start ──────────────────────────────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
