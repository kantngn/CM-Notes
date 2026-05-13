(function () {
    const app = window.CM_App = window.CM_App || {};
    app.Automation = app.Automation || {};

    /**
     * Generic batch processing tool for Salesforce lightning-datatable pages.
     * Triggered by Alt+Shift+B. Parses the visible table, lets the user select
     * entries with filters, then opens them in background windows for MailResolve.
     * @namespace app.Automation.BatchResolve
     */
    const BatchResolve = {
        entries: [],
        columns: [],
        selected: new Set(),
        filters: [],
        _panel: null,
        _queue: null,

        // ── Activation (called from AppObserver hotkey) ──
        async activate() {
            const U = app.Core.Utils;
            const existing = document.getElementById('sn-batch-panel');
            if (existing) { app.Core.Windows.toggle('sn-batch-panel'); return; }

            const table = U.queryDeep('table.slds-table[role="grid"]');
            if (!table) {
                U.showNotification('No datatable found on this page.', { type: 'error' });
                return;
            }

            this.columns = this._discoverColumns(table);
            this.entries = this._parseRows(table);
            this.selected = new Set();
            this.filters = [];

            if (this.entries.length === 0) {
                U.showNotification('Table is empty.', { type: 'error' });
                return;
            }

            U.showNotification(`Found ${this.entries.length} entries.`, { type: 'success', duration: 2000 });
            this._createPanel();
        },

        // ── Deep text extraction (pierces shadow DOM) ──
        _getDeepText(el) {
            if (!el) return '';
            let text = '';
            // If this element has a shadow root, collect text from it
            if (el.shadowRoot) {
                for (const child of el.shadowRoot.childNodes) {
                    if (child.nodeType === Node.TEXT_NODE) text += child.textContent;
                    else if (child.nodeType === Node.ELEMENT_NODE) text += this._getDeepText(child);
                }
            }
            // Collect text from light DOM children
            for (const child of el.childNodes) {
                if (child.nodeType === Node.TEXT_NODE) text += child.textContent;
                else if (child.nodeType === Node.ELEMENT_NODE) text += this._getDeepText(child);
            }
            return text.trim();
        },

        // ── Table Parsing ──
        _discoverColumns(table) {
            // data-label is on <td>/<th> in tbody, NOT in thead
            const firstRow = table.querySelector('tbody[data-rowgroup-body] tr[data-row-key-value]');
            if (!firstRow) return [];
            const cells = firstRow.querySelectorAll('td[data-label], th[data-label]');
            return Array.from(cells).map(c => c.getAttribute('data-label')).filter(Boolean);
        },

        _parseRows(table) {
            const rows = table.querySelectorAll('tbody[data-rowgroup-body] tr[data-row-key-value]');
            return Array.from(rows).map((tr, idx) => {
                const recordId = tr.getAttribute('data-row-key-value');
                const data = {};
                for (const col of this.columns) {
                    const cell = tr.querySelector(`td[data-label="${col}"], th[data-label="${col}"]`);
                    if (!cell) { data[col] = ''; continue; }
                    // Try innerText first (fast), fall back to deep extraction
                    let text = cell.innerText.trim();
                    if (!text) text = this._getDeepText(cell);
                    // Strip Salesforce's injected "Open X Preview" tooltip text
                    text = text.replace(/Open\s+.+?\s+Preview/gi, '').trim();
                    data[col] = text;
                }
                return {
                    id: recordId,
                    url: `https://kdcv1.lightning.force.com/lightning/r/${recordId}/view`,
                    data: data,
                    index: idx,
                    status: 'pending',
                    error: null
                };
            });
        },

        // ── Filtering ──
        _getFilteredEntries() {
            if (this.filters.length === 0) return this.entries;
            return this.entries.filter(entry => {
                return this.filters.every(f => {
                    const val = (entry.data[f.column] || '').toLowerCase();
                    const fv = (f.value || '').toLowerCase();
                    switch (f.operator) {
                        case 'equals': return val === fv;
                        case 'not equals': return val !== fv;
                        case 'contains': return val.includes(fv);
                        case 'not contains': return !val.includes(fv);
                        case 'empty': return !val;
                        case 'not empty': return !!val;
                        default: return true;
                    }
                });
            });
        },

        // ── Panel UI ──
        _createPanel() {
            const id = 'sn-batch-panel';
            if (document.getElementById(id)) { this._renderPanel(); return; }

            const w = document.createElement('div');
            w.id = id;
            w.className = 'sn-window';
            w.style.cssText = `
                position: fixed; top: 60px; right: 60px;
                width: 720px; height: 600px; min-width: 500px; min-height: 400px;
                background: #fff; border: 1px solid var(--sn-border, #ddd);
                z-index: 100020; display: flex; flex-direction: column;
                border-radius: 12px; box-shadow: 0 12px 48px rgba(0,0,0,0.18);
                overflow: hidden;
            `;
            this._panel = w;
            this._renderPanel();
            document.body.appendChild(w);
            app.Core.Windows.setup(w, w.querySelector('#sn-batch-close'), w.querySelector('.sn-header'), 'BATCH');
        },

        _renderPanel() {
            const w = this._panel || document.getElementById('sn-batch-panel');
            if (!w) return;
            const filtered = this._getFilteredEntries();
            const concurrency = GM_getValue('sn_batch_concurrency', 3);
            const selectedCount = this.selected.size;
            const stats = this._getStats();
            const isRunning = this._queue && (this._queue.activeSlots.size > 0 || this._queue.queue.length > 0);
            const isPaused = this._queue?.paused || false;

            // Display columns (first 5 to fit width)
            const displayCols = this.columns.slice(0, 5);

            // Column label abbreviations by index position (0-based)
            const colAbbrev = { 1: 'A.R.', 2: 'CAT' };
            const colLabel = (col, idx) => colAbbrev[idx] || col;

            // Build rows HTML
            let rowsHtml = '';
            for (const entry of filtered) {
                const isSelected = this.selected.has(entry.id);
                const badge = this._statusBadge(entry.status, entry.error);
                const cells = displayCols.map((col, idx) => {
                    const val = entry.data[col] || '';
                    const maxW = colAbbrev[idx] ? '55px' : '140px';
                    const short = val.length > 20 ? val.substring(0, 18) + '…' : val;
                    return `<td style="padding:4px 6px;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:${maxW};" title="${val.replace(/"/g, '&quot;')}">${short}</td>`;
                }).join('');
                rowsHtml += `
                    <tr data-entry-id="${entry.id}" style="border-bottom:1px solid #f0f0f0;${isSelected ? 'background:#e8f5e9;' : ''}" class="sn-batch-row">
                        <td style="padding:4px 6px;text-align:center;">
                            <input type="checkbox" class="sn-batch-chk" data-id="${entry.id}" ${isSelected ? 'checked' : ''} ${isRunning ? 'disabled' : ''}>
                        </td>
                        ${cells}
                        <td style="padding:4px 6px;text-align:center;font-size:14px;" title="${entry.error || entry.status}">${badge}</td>
                    </tr>`;
            }


            // Column headers (use abbreviations for display)
            const headerCells = displayCols.map((col, idx) =>
                `<th style="padding:6px;font-size:10px;font-weight:700;color:#666;text-transform:uppercase;letter-spacing:0.3px;white-space:nowrap;border-bottom:2px solid #e0e0e0;text-align:left;" title="${col}">${colLabel(col, idx)}</th>`
            ).join('');

            // Filter pills
            const filterPills = this.filters.map((f, i) =>
                `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;background:#e3f2fd;border-radius:12px;font-size:10px;color:#1565c0;">
                    ${f.column} ${f.operator} "${f.value}"
                    <button class="sn-batch-remove-filter" data-idx="${i}" style="background:none;border:none;cursor:pointer;font-size:12px;color:#1565c0;padding:0 2px;">✕</button>
                </span>`
            ).join(' ');

            // Column options for filter dropdown
            const colOptions = this.columns.map(c => `<option value="${c}">${c}</option>`).join('');

            // Progress bar
            const total = selectedCount || this.entries.length;
            const done = stats.resolved + stats.skipped;
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;

            w.innerHTML = `
                <div class="sn-header" style="background:linear-gradient(135deg,#1a237e,#283593);color:white;padding:10px 14px;display:flex;align-items:center;justify-content:space-between;cursor:move;">
                    <span style="font-weight:700;font-size:13px;letter-spacing:0.5px;">📋 Batch Resolve</span>
                    <div style="display:flex;align-items:center;gap:10px;">
                        <label style="display:flex;align-items:center;gap:4px;font-size:11px;">
                            <span>⚡</span>
                            <input type="range" id="sn-batch-concurrency" min="1" max="5" value="${concurrency}" step="1" style="width:60px;cursor:pointer;" ${isRunning ? 'disabled' : ''}>
                            <span id="sn-batch-conc-val" style="min-width:14px;text-align:center;">${concurrency}</span>
                        </label>
                        <button id="sn-batch-close" style="background:rgba(255,255,255,0.15);border:none;color:white;font-weight:bold;cursor:pointer;font-size:16px;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;">×</button>
                    </div>
                </div>
                <div style="padding:8px 12px;background:#fafafa;border-bottom:1px solid #e0e0e0;">
                    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                        <select id="sn-batch-filter-col" style="padding:4px;border:1px solid #ccc;border-radius:4px;font-size:11px;">
                            ${colOptions}
                        </select>
                        <select id="sn-batch-filter-op" style="padding:4px;border:1px solid #ccc;border-radius:4px;font-size:11px;">
                            <option value="equals">equals</option>
                            <option value="not equals">not equals</option>
                            <option value="contains">contains</option>
                            <option value="not contains">not contains</option>
                            <option value="empty">is empty</option>
                            <option value="not empty">is not empty</option>
                        </select>
                        <input id="sn-batch-filter-val" type="text" placeholder="value" style="padding:4px 8px;border:1px solid #ccc;border-radius:4px;font-size:11px;width:100px;">
                        <button id="sn-batch-add-filter" style="padding:4px 10px;background:#1565c0;color:white;border:none;border-radius:4px;font-size:11px;cursor:pointer;font-weight:600;">+ Filter</button>
                    </div>
                    ${filterPills ? `<div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:4px;">${filterPills}</div>` : ''}
                    <div style="display:flex;align-items:center;gap:6px;margin-top:8px;">
                        <button id="sn-batch-sel-all" class="sn-batch-sel-btn" ${isRunning ? 'disabled' : ''}>☑ All</button>
                        <button id="sn-batch-sel-none" class="sn-batch-sel-btn" ${isRunning ? 'disabled' : ''}>☐ None</button>
                        <button id="sn-batch-sel-invert" class="sn-batch-sel-btn" ${isRunning ? 'disabled' : ''}>↕ Invert</button>
                        <button id="sn-batch-sel-filtered" class="sn-batch-sel-btn" ${isRunning ? 'disabled' : ''}>📋 Select Matching</button>
                        <span style="margin-left:auto;font-size:11px;color:#666;">
                            Showing ${filtered.length}/${this.entries.length} │ Selected: <b>${selectedCount}</b>
                        </span>
                    </div>
                </div>
                <div style="flex:1;overflow-y:auto;overflow-x:hidden;">
                    <table style="width:100%;border-collapse:collapse;">
                        <thead style="position:sticky;top:0;background:#fff;z-index:1;">
                            <tr>
                                <th style="padding:6px;width:30px;border-bottom:2px solid #e0e0e0;"></th>
                                ${headerCells}
                                <th style="padding:6px;width:36px;font-size:10px;font-weight:700;color:#666;border-bottom:2px solid #e0e0e0;text-align:center;">Status</th>
                            </tr>
                        </thead>
                        <tbody id="sn-batch-tbody">
                            ${rowsHtml}
                        </tbody>
                    </table>
                </div>
                <div style="padding:8px 12px;background:#fafafa;border-top:1px solid #e0e0e0;">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                        <div style="flex:1;height:6px;background:#e0e0e0;border-radius:3px;overflow:hidden;">
                            <div id="sn-batch-progress-bar" style="height:100%;background:linear-gradient(90deg,#43a047,#66bb6a);border-radius:3px;transition:width 0.3s;width:${pct}%;"></div>
                        </div>
                        <span style="font-size:11px;color:#555;font-weight:600;min-width:36px;">${pct}%</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:12px;font-size:11px;color:#666;">
                        <span>✅ ${stats.resolved}</span>
                        <span>🔄 ${stats.processing}</span>
                        <span>⏳ ${stats.queued}</span>
                        <span>⏭️ ${stats.skipped}</span>
                        <span>❌ ${stats.error}</span>
                    </div>
                </div>
                <div style="padding:10px 12px;background:#f5f5f5;border-top:1px solid #e0e0e0;display:flex;align-items:center;gap:8px;">
                    ${!isRunning ? `
                        <button id="sn-batch-start" class="sn-auto-action-btn primary" style="flex:1;" ${selectedCount === 0 ? 'disabled' : ''}>
                            ▶ Confirm & Resolve (${selectedCount})
                        </button>
                    ` : `
                        <button id="sn-batch-pause" class="sn-auto-action-btn" style="flex:0 0 auto;padding:8px 16px;">
                            ${isPaused ? '▶ Resume' : '⏸ Pause'}
                        </button>
                        <button id="sn-batch-stop" class="sn-auto-action-btn" style="flex:0 0 auto;padding:8px 16px;color:#d32f2f;border-color:#d32f2f;">
                            ⏹ Stop
                        </button>
                        <span style="flex:1;text-align:right;font-size:11px;color:#666;">
                            Processing ${stats.processing} / ${stats.processing + stats.queued} remaining
                        </span>
                    `}
                </div>
                <div class="sn-resizer rs-n"></div><div class="sn-resizer rs-s"></div>
                <div class="sn-resizer rs-e"></div><div class="sn-resizer rs-w"></div>
                <div class="sn-resizer rs-ne"></div><div class="sn-resizer rs-nw"></div>
                <div class="sn-resizer rs-se"></div><div class="sn-resizer rs-sw"></div>
            `;

            this._injectStyles();
            this._bindEvents(w);
        },

        _injectStyles() {
            if (document.getElementById('sn-batch-styles')) return;
            const s = document.createElement('style');
            s.id = 'sn-batch-styles';
            s.textContent = `
                .sn-batch-sel-btn {
                    padding: 4px 10px; background: white; border: 1px solid #ccc;
                    border-radius: 4px; font-size: 11px; cursor: pointer;
                    font-weight: 600; color: #444; transition: all 0.15s;
                }
                .sn-batch-sel-btn:hover:not(:disabled) {
                    background: #e3f2fd; border-color: #1565c0; color: #1565c0;
                }
                .sn-batch-sel-btn:disabled { opacity: 0.5; cursor: not-allowed; }
                .sn-batch-row:hover { background: #f5f5f5 !important; }
                .sn-batch-chk { cursor: pointer; width: 14px; height: 14px; }
            `;
            document.head.appendChild(s);
        },

        _statusBadge(status, error) {
            switch (status) {
                case 'pending': return '—';
                case 'queued': return '⏳';
                case 'processing': return '🔄';
                case 'resolved': return '✅';
                case 'skipped': return '⏭️';
                case 'error': return '❌';
                default: return '—';
            }
        },

        _getStats() {
            const s = { pending: 0, queued: 0, processing: 0, resolved: 0, skipped: 0, error: 0 };
            for (const e of this.entries) { s[e.status] = (s[e.status] || 0) + 1; }
            return s;
        },

        _bindEvents(w) {
            // Close
            const closeBtn = w.querySelector('#sn-batch-close');
            if (closeBtn) closeBtn.onclick = () => {
                if (this._queue) this._queue.stop();
                w.remove();
            };

            // Concurrency slider
            const slider = w.querySelector('#sn-batch-concurrency');
            const concLabel = w.querySelector('#sn-batch-conc-val');
            if (slider) slider.oninput = () => {
                concLabel.textContent = slider.value;
                GM_setValue('sn_batch_concurrency', parseInt(slider.value));
                if (this._queue) this._queue.maxConcurrent = parseInt(slider.value);
            };

            // Checkboxes
            w.querySelectorAll('.sn-batch-chk').forEach(chk => {
                chk.onchange = () => {
                    if (chk.checked) this.selected.add(chk.dataset.id);
                    else this.selected.delete(chk.dataset.id);
                    this._renderPanel();
                };
            });

            // Selection buttons
            const filtered = this._getFilteredEntries();
            // Select All — selects ALL entries regardless of filters
            w.querySelector('#sn-batch-sel-all')?.addEventListener('click', () => {
                this.entries.forEach(e => this.selected.add(e.id));
                this._renderPanel();
            });
            w.querySelector('#sn-batch-sel-none')?.addEventListener('click', () => {
                this.selected.clear();
                this._renderPanel();
            });
            w.querySelector('#sn-batch-sel-invert')?.addEventListener('click', () => {
                this.entries.forEach(e => {
                    if (this.selected.has(e.id)) this.selected.delete(e.id);
                    else this.selected.add(e.id);
                });
                this._renderPanel();
            });
            // Select Matching — selects ONLY entries matching current filter
            w.querySelector('#sn-batch-sel-filtered')?.addEventListener('click', () => {
                filtered.forEach(e => this.selected.add(e.id));
                this._renderPanel();
            });

            // Filter controls
            w.querySelector('#sn-batch-add-filter')?.addEventListener('click', () => {
                const col = w.querySelector('#sn-batch-filter-col')?.value;
                const op = w.querySelector('#sn-batch-filter-op')?.value;
                const val = w.querySelector('#sn-batch-filter-val')?.value || '';
                if (col && op) {
                    this.filters.push({ column: col, operator: op, value: val });
                    this._renderPanel();
                }
            });
            w.querySelectorAll('.sn-batch-remove-filter').forEach(btn => {
                btn.onclick = () => {
                    this.filters.splice(parseInt(btn.dataset.idx), 1);
                    this._renderPanel();
                };
            });

            // Start
            w.querySelector('#sn-batch-start')?.addEventListener('click', () => {
                const selectedEntries = this.entries.filter(e => this.selected.has(e.id));
                if (selectedEntries.length === 0) return;
                this._startQueue(selectedEntries);
            });

            // Pause / Resume
            w.querySelector('#sn-batch-pause')?.addEventListener('click', () => {
                if (!this._queue) return;
                if (this._queue.paused) this._queue.resume();
                else this._queue.pause();
                this._renderPanel();
            });

            // Stop
            w.querySelector('#sn-batch-stop')?.addEventListener('click', () => {
                if (this._queue) this._queue.stop();
                this._renderPanel();
            });
        },

        // ── Queue Management ──
        _startQueue(selectedEntries) {
            const concurrency = GM_getValue('sn_batch_concurrency', 3);
            this._queue = {
                maxConcurrent: concurrency,
                activeSlots: new Map(),
                queue: [...selectedEntries],
                paused: false,
                _listeners: [],
                _timeouts: [],

                stop: () => {
                    this._queue.paused = true;
                    this._queue.queue.forEach(e => { e.status = 'pending'; });
                    this._queue.queue = [];
                    for (const [id, slot] of this._queue.activeSlots) {
                        chrome.runtime.sendMessage({ type: 'CLOSE_WINDOW', windowId: slot.windowId });
                    }
                    this._queue.activeSlots.clear();
                    this._queue._listeners.forEach(id => GM_removeValueChangeListener(id));
                    this._queue._listeners = [];
                    this._queue._timeouts.forEach(id => clearTimeout(id));
                    this._queue._timeouts = [];
                    BatchResolve._renderPanel();
                },

                pause: () => { this._queue.paused = true; },
                resume: () => { this._queue.paused = false; this._queue._fillSlots(); }
            };

            // Mark all selected as queued
            selectedEntries.forEach(e => { e.status = 'queued'; });
            this._renderPanel();

            // Fill slots method
            this._queue._fillSlots = () => {
                const q = this._queue;
                while (!q.paused && q.activeSlots.size < q.maxConcurrent && q.queue.length > 0) {
                    const entry = q.queue.shift();
                    this._processEntry(entry);
                }
                // Check if all done
                if (q.activeSlots.size === 0 && q.queue.length === 0) {
                    const stats = this._getStats();
                    app.Core.Utils.showNotification(
                        `Batch complete: ✅${stats.resolved} ⏭️${stats.skipped} ❌${stats.error}`,
                        { type: 'success', duration: 5000 }
                    );
                }
            };

            this._queue._fillSlots();
        },

        _processEntry(entry) {
            const q = this._queue;
            entry.status = 'processing';
            this._renderPanel();

            // Set trigger for child window's content script
            GM_setValue('sn_batch_trigger_' + entry.id, {
                entryId: entry.id,
                recordId: entry.id,
                url: entry.url,
                timestamp: Date.now()
            });

            // Listen for result
            const listenerId = GM_addValueChangeListener(
                'sn_batch_result_' + entry.id,
                (name, old, newVal, remote) => {
                    if (!newVal) return;
                    GM_removeValueChangeListener(listenerId);
                    GM_deleteValue('sn_batch_result_' + entry.id);

                    entry.status = newVal.success ? (newVal.skipped ? 'skipped' : 'resolved') : 'error';
                    if (!newVal.success) entry.error = newVal.error || 'Unknown error';

                    const slot = q.activeSlots.get(entry.id);
                    if (slot) {
                        chrome.runtime.sendMessage({ type: 'CLOSE_WINDOW', windowId: slot.windowId });
                    }
                    q.activeSlots.delete(entry.id);
                    this._renderPanel();
                    q._fillSlots();
                }
            );
            q._listeners.push(listenerId);

            // Open background window
            chrome.runtime.sendMessage({
                type: 'OPEN_SCRAPER_WINDOW',
                url: entry.url
            }, (response) => {
                if (response?.success) {
                    q.activeSlots.set(entry.id, {
                        windowId: response.windowId,
                        startTime: Date.now()
                    });
                } else {
                    entry.status = 'error';
                    entry.error = 'Failed to open window';
                    this._renderPanel();
                    q._fillSlots();
                }
            });

            // Timeout safety (45s)
            const timeoutId = setTimeout(() => {
                if (q.activeSlots.has(entry.id)) {
                    entry.status = 'error';
                    entry.error = 'Timeout (45s)';
                    const slot = q.activeSlots.get(entry.id);
                    if (slot) chrome.runtime.sendMessage({ type: 'CLOSE_WINDOW', windowId: slot.windowId });
                    q.activeSlots.delete(entry.id);
                    this._renderPanel();
                    q._fillSlots();
                }
            }, 45000);
            q._timeouts.push(timeoutId);
        },

        // ── Cleanup ──
        cleanupStaleTriggers() {
            const cutoff = Date.now() - (5 * 60 * 1000);
            GM_listValues().forEach(k => {
                if (k.startsWith('sn_batch_trigger_') || k.startsWith('sn_batch_result_')) {
                    const data = GM_getValue(k);
                    if (data?.timestamp && data.timestamp < cutoff) {
                        GM_deleteValue(k);
                    }
                }
            });
        }
    };

    // Cleanup stale keys on load
    BatchResolve.cleanupStaleTriggers();

    app.Automation.BatchResolve = BatchResolve;
})();
