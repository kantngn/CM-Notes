/**
 * @file DDSEditor.js
 * @description Standalone panel to view and edit ALL DDS entries from the master database.
 *   Shows only Site Code (id), Name, Phone, and Fax — no address.
 *   Supports inline editing and direct push to GitHub for authorized admins.
 *
 * @requires gm-compat.js — GM_xmlhttpRequest, GM_getValue, GM_setValue
 * @requires core/WindowManager.js — app.Core.Windows
 * @requires core/Utils.js — app.Core.Utils.showNotification
 * @requires core/SSADataManager.js — app.Core.SSADataManager
 *
 * @namespace app.Tools.DDSEditor
 */
(function () {
    const app = window.CM_App = window.CM_App || {};
    app.Tools = app.Tools || {};

    const PANEL_ID = 'sn-dds-editor';

    const DDSEditor = {
        /** @type {Array|null} Cached full DDS list */
        _ddsCache: null,
        /** @type {HTMLElement|null} Reference to the table container element */
        _tableContainer: null,
        /** @type {boolean} Whether the panel is currently open */
        _isOpen: false,
        /** @type {string|null} Panel Y position */
        panelY: null,
        /** @type {boolean} Flag to prevent double init */
        _initDone: false,

        // ══════════════════════════════════════════════
        //  INIT
        // ══════════════════════════════════════════════

        init() {
            if (this._initDone) return;
            this._initDone = true;
            this.panelY = GM_getValue('sn_dds_editor_panel_y', null);
        },

        toggle() {
            const existing = document.getElementById(PANEL_ID);
            if (existing) {
                existing.remove();
                this._isOpen = false;
                return;
            }
            this._loadDataAndCreate();
        },

        // ══════════════════════════════════════════════
        //  DATA LOADING
        // ══════════════════════════════════════════════

        _loadDataAndCreate() {
            app.Core.SSADataManager.fetch((db) => {
                if (!db || !db.DDS) {
                    app.Core.Utils.showNotification('Failed to load DDS database.', { type: 'error' });
                    return;
                }
                this._ddsCache = db.DDS;
                this._create();
            });
        },

        // ══════════════════════════════════════════════
        //  PANEL CREATION & RENDERING
        // ══════════════════════════════════════════════

        _create() {
            const existing = document.getElementById(PANEL_ID);
            if (existing) existing.remove();

            const w = document.createElement('div');
            w.id = PANEL_ID;
            w.className = 'sn-window';
            w.style.cssText = `
                width: 650px;
                height: 500px;
                top: ${this.panelY || '60'}px;
                left: 200px;
                background: #fff;
                box-shadow: 0 8px 32px rgba(0,0,0,0.3);
                z-index: 10001;
                font-family: "Segoe UI", sans-serif;
                font-size: 12px;
                display: flex;
                flex-direction: column;
                border-radius: 6px;
                overflow: hidden;
            `;

            // Header
            const header = document.createElement('div');
            header.style.cssText = `
                background: #1565c0;
                color: white;
                padding: 6px 12px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                cursor: move;
                user-select: none;
                flex-shrink: 0;
            `;
            header.innerHTML = `
                <span style="font-weight: bold; font-size: 13px;">📋 DDS Master Editor</span>
                <div style="display:flex; gap:4px; align-items:center;">
                    <span id="sn-dds-editor-count" style="font-size:11px; opacity:0.8;"></span>
                    <button id="sn-dds-editor-close" style="background:none; border:none; color:white; cursor:pointer; font-size:16px; padding:0 4px;">✕</button>
                </div>
            `;
            w.appendChild(header);

            // Toolbar
            const toolbar = document.createElement('div');
            toolbar.style.cssText = `
                padding: 6px 10px;
                background: #f5f5f5;
                border-bottom: 1px solid #ddd;
                display: flex;
                gap: 6px;
                align-items: center;
                flex-shrink: 0;
                flex-wrap: wrap;
            `;
            const isAuthorized = app.Core.SSADataManager.isAuthorized();

            toolbar.innerHTML = `
                <input id="sn-dds-editor-search" type="text" placeholder="Search site code, name, phone..." 
                    style="flex:1; min-width:120px; padding:4px 8px; border:1px solid #ccc; border-radius:3px; font-size:11px;">
                <button id="sn-dds-editor-sync" style="padding:4px 10px; cursor:pointer; background:#f44336; color:white; border:none; border-radius:3px; font-size:11px; font-weight:bold; ${isAuthorized ? '' : 'display:none;'}" title="Push all local edits to the master GitHub database">⬆ Push to GitHub</button>
                <button id="sn-dds-editor-reload" style="padding:4px 8px; cursor:pointer; background:#e0e0e0; border:1px solid #ccc; border-radius:3px; font-size:11px;">⟳ Reload</button>
                ${!isAuthorized ? '<span style="font-size:10px; color:#888;">(Read-only — login as admin to edit)</span>' : ''}
            `;
            w.appendChild(toolbar);

            // Table container
            const tableContainer = document.createElement('div');
            tableContainer.style.cssText = `
                flex: 1;
                overflow-y: auto;
                overflow-x: auto;
                background: #fff;
            `;
            w.appendChild(tableContainer);

            document.body.appendChild(w);

            this._tableContainer = tableContainer;

            // Setup window dragging via header
            app.Core.Windows.setup(w, null, header, 'dds-editor');

            // Bind events
            this._bindEvents(w, tableContainer);

            // Render table
            this._renderTable(tableContainer, this._ddsCache);

            // Update count
            const countEl = w.querySelector('#sn-dds-editor-count');
            if (countEl) countEl.textContent = `${this._ddsCache.length} offices`;

            this._isOpen = true;
        },

        // ══════════════════════════════════════════════
        //  TABLE RENDERING
        // ══════════════════════════════════════════════

        _renderTable(container, data) {
            const isAuthorized = app.Core.SSADataManager.isAuthorized();

            let html = `
                <table style="width:100%; border-collapse:collapse; font-size:11px;">
                    <thead>
                        <tr style="background:#e3f2fd; position:sticky; top:0; z-index:1;">
                            <th style="padding:6px 8px; text-align:left; border-bottom:2px solid #90caf9; white-space:nowrap; width:70px;">Site Code</th>
                            <th style="padding:6px 8px; text-align:left; border-bottom:2px solid #90caf9;">Office Name</th>
                            <th style="padding:6px 8px; text-align:left; border-bottom:2px solid #90caf9; width:140px;">Phone</th>
                            <th style="padding:6px 8px; text-align:left; border-bottom:2px solid #90caf9; width:140px;">Fax</th>
                            ${isAuthorized ? '<th style="padding:6px 8px; text-align:center; border-bottom:2px solid #90caf9; width:60px;">Save</th>' : ''}
                        </tr>
                    </thead>
                    <tbody>
            `;

            data.forEach((item, index) => {
                const hasOverride = item.hasOverride;
                const bgColor = hasOverride ? '#fff8e1' : (index % 2 === 0 ? '#fff' : '#fafafa');
                const isEditing = this._editingIndex === index;

                if (isEditing && isAuthorized) {
                    // Editing row — only phone & fax are editable
                    html += `
                        <tr style="background:#e8f5e9;" data-index="${index}">
                            <td style="padding:4px 8px; border-bottom:1px solid #eee; font-weight:bold; color:#1565c0; vertical-align:top;">${this._escapeHtml(item.id)}</td>
                            <td style="padding:4px 8px; border-bottom:1px solid #eee; vertical-align:top; color:#333;">${this._escapeHtml(item.office_name || '')}</td>
                            <td style="padding:4px 8px; border-bottom:1px solid #eee; vertical-align:top;">
                                <input class="sn-dds-edit-phone" value="${this._escapeHtml(item.phone || '')}" style="width:100%; padding:3px 4px; border:1px solid #90caf9; border-radius:2px; font-size:11px; box-sizing:border-box;">
                            </td>
                            <td style="padding:4px 8px; border-bottom:1px solid #eee; vertical-align:top;">
                                <input class="sn-dds-edit-fax" value="${this._escapeHtml(item.fax || '')}" style="width:100%; padding:3px 4px; border:1px solid #90caf9; border-radius:2px; font-size:11px; box-sizing:border-box;">
                            </td>
                            <td style="padding:4px 8px; border-bottom:1px solid #eee; text-align:center; vertical-align:top;">
                                <button class="sn-dds-edit-save-btn" data-index="${index}" style="padding:3px 8px; cursor:pointer; background:#43a047; color:white; border:none; border-radius:3px; font-size:10px;">✓</button>
                                <button class="sn-dds-edit-cancel-btn" data-index="${index}" style="padding:3px 6px; cursor:pointer; background:#e0e0e0; border:1px solid #ccc; border-radius:3px; font-size:10px; margin-top:2px;">✕</button>
                            </td>
                        </tr>
                    `;
                } else {
                    // Display row
                    const phoneDisplay = item.phone || '';
                    const faxDisplay = item.fax || '';
                    const editBtn = isAuthorized
                        ? `<button class="sn-dds-edit-start-btn" data-index="${index}" style="padding:2px 6px; cursor:pointer; background:#e3f2fd; border:1px solid #90caf9; border-radius:3px; font-size:9px; color:#1565c0;" title="Edit this entry">✎</button>`
                        : '';

                    html += `
                        <tr style="background:${bgColor};" data-index="${index}">
                            <td style="padding:5px 8px; border-bottom:1px solid #eee; font-weight:bold; color:#1565c0; white-space:nowrap;">${this._escapeHtml(item.id)}${hasOverride ? '<span style="color:#f57f17; margin-left:3px;" title="Has local override">⚠</span>' : ''}</td>
                            <td style="padding:5px 8px; border-bottom:1px solid #eee;">${this._escapeHtml(item.office_name || '')}</td>
                            <td style="padding:5px 8px; border-bottom:1px solid #eee; white-space:nowrap;">${this._escapeHtml(phoneDisplay)}</td>
                            <td style="padding:5px 8px; border-bottom:1px solid #eee; white-space:nowrap;">${this._escapeHtml(faxDisplay)}</td>
                            ${isAuthorized ? `<td style="padding:5px 8px; border-bottom:1px solid #eee; text-align:center;">${editBtn}</td>` : ''}
                        </tr>
                    `;
                }
            });

            html += `</tbody></table>`;

            container.innerHTML = html;

            // If no results
            if (data.length === 0) {
                container.innerHTML = '<div style="padding:20px; text-align:center; color:#888;">No DDS entries found.</div>';
            }

            // Bind edit events (only if authorized)
            if (isAuthorized) {
                this._bindEditEvents(container);
            }
        },

        // ══════════════════════════════════════════════
        //  EDITING
        // ══════════════════════════════════════════════

        /** @type {number|null} Index of the currently editing row */
        _editingIndex: null,

        _startEdit(index) {
            this._editingIndex = index;
            if (this._tableContainer) this._renderTable(this._tableContainer, this._getFilteredData());
        },

        _cancelEdit() {
            this._editingIndex = null;
            if (this._tableContainer) this._renderTable(this._tableContainer, this._getFilteredData());
        },

        _saveEdit(index) {
            const row = document.querySelector(`#${PANEL_ID} tr[data-index="${index}"]`);
            if (!row) return;

            const phoneInput = row.querySelector('.sn-dds-edit-phone');
            const faxInput = row.querySelector('.sn-dds-edit-fax');

            const item = this._getFilteredData()[index];

            // Preserve the original item reference in the cache
            const originalItem = this._ddsCache.find(i => String(i.id) === String(item.id) && String(i.office_name) === String(item.office_name));
            if (!originalItem) return;

            const newPhone = phoneInput ? phoneInput.value.trim() : '';
            const newFax = faxInput ? faxInput.value.trim() : '';

            // Update the item (name/site code are read-only)
            originalItem.phone = newPhone;
            originalItem.fax = newFax;

            // Save to local overrides (keyed by site code only)
            const overrides = GM_getValue('sn_ssa_overrides', {});
            const overrideKey = originalItem.id;
            overrides[overrideKey] = { phone: newPhone, fax: newFax, timestamp: Date.now() };
            GM_setValue('sn_ssa_overrides', overrides);
            originalItem.hasOverride = true;

            this._editingIndex = null;
            if (this._tableContainer) this._renderTable(this._tableContainer, this._getFilteredData());

            app.Core.Utils.showNotification(`DDS "${originalItem.id}" updated locally.`, { type: 'success' });
        },

        // ══════════════════════════════════════════════
        //  SYNC TO GITHUB
        // ══════════════════════════════════════════════

        _pushToGitHub() {
            // Collect all changes from overrides
            const overrides = GM_getValue('sn_ssa_overrides', {});
            const overrideKeys = Object.keys(overrides);
            if (overrideKeys.length === 0) {
                app.Core.Utils.showNotification('No local changes to push.', { type: 'info' });
                return;
            }

            const syncBtn = document.getElementById('sn-dds-editor-sync');
            if (syncBtn) {
                syncBtn.disabled = true;
                syncBtn.textContent = '⬆ Pushing...';
                syncBtn.style.opacity = '0.7';
            }

            let changesProcessed = 0;
            let errors = [];

            const processNext = (keys) => {
                if (keys.length === 0) {
                    // ── All done ──
                    if (syncBtn) {
                        syncBtn.disabled = false;
                        syncBtn.textContent = errors.length > 0 ? '⬆ Partial Fail' : '⬆ Pushed! ✓';
                        syncBtn.style.opacity = '1';
                    }

                    // Clear successfully-synced overrides from local storage
                    if (errors.length === 0) {
                        GM_setValue('sn_ssa_overrides', {});
                        setTimeout(() => this._loadDataAndCreate(), 1500);
                    } else {
                        // Only keep overrides that failed
                        const failedOverrides = {};
                        overrideKeys.forEach(k => {
                            if (errors.some(e => e.key === k)) {
                                failedOverrides[k] = overrides[k];
                            }
                        });
                        GM_setValue('sn_ssa_overrides', failedOverrides);
                    }

                    if (errors.length > 0) {
                        app.Core.Utils.showNotification(`Pushed ${changesProcessed} change(s). ${errors.length} failed.`, { type: 'error' });
                    } else {
                        app.Core.Utils.showNotification(`All ${changesProcessed} change(s) pushed to master database!`, { type: 'success' });
                    }
                    return;
                }

                const key = keys[0];
                const data = overrides[key];
                if (!data) {
                    console.warn(`[DDSEditor] No override data for key "${key}", skipping.`);
                    processNext(keys.slice(1));
                    return;
                }

                const phone = data.phone || '';
                const fax = data.fax || '';

                app.Core.SSADataManager.syncToGlobal(key, phone, fax, (success, msg) => {
                    if (success) {
                        changesProcessed++;
                    } else {
                        errors.push({ key, msg });
                        console.error(`[DDSEditor] Sync failed for ${key}:`, msg);
                    }
                    processNext(keys.slice(1));
                });
            };

            processNext(overrideKeys);
        },

        // ══════════════════════════════════════════════
        //  EVENT BINDING
        // ══════════════════════════════════════════════

        _bindEvents(w, tableContainer) {
            // Close button
            const closeBtn = w.querySelector('#sn-dds-editor-close');
            if (closeBtn) closeBtn.onclick = () => { w.remove(); this._isOpen = false; };

            // Search filter
            const searchInput = w.querySelector('#sn-dds-editor-search');
            if (searchInput) {
                let searchTimer;
                searchInput.oninput = () => {
                    clearTimeout(searchTimer);
                    searchTimer = setTimeout(() => {
                        this._renderTable(tableContainer, this._getFilteredData());
                    }, 200);
                };
                // Focus search on open
                setTimeout(() => searchInput.focus(), 100);
            }

            // Reload
            const reloadBtn = w.querySelector('#sn-dds-editor-reload');
            if (reloadBtn) {
                reloadBtn.onclick = () => {
                    // Clear cache to force fresh fetch
                    app.Core.SSADataManager._cache = null;
                    this._ddsCache = null;
                    this._loadDataAndCreate();
                };
            }

            // Sync/Push button
            const syncBtn = w.querySelector('#sn-dds-editor-sync');
            if (syncBtn) {
                syncBtn.onclick = () => this._pushToGitHub();
            }
        },

        _bindEditEvents(container) {
            // Start edit buttons
            container.querySelectorAll('.sn-dds-edit-start-btn').forEach(btn => {
                btn.onclick = (e) => {
                    const index = parseInt(e.target.dataset.index, 10);
                    this._startEdit(index);
                };
            });

            // Cancel edit buttons
            container.querySelectorAll('.sn-dds-edit-cancel-btn').forEach(btn => {
                btn.onclick = (e) => {
                    this._cancelEdit();
                };
            });

            // Save edit buttons
            container.querySelectorAll('.sn-dds-edit-save-btn').forEach(btn => {
                btn.onclick = (e) => {
                    const index = parseInt(e.target.dataset.index, 10);
                    this._saveEdit(index);
                };
            });

            // Enter key to save / Escape to cancel in edit inputs
            container.querySelectorAll('.sn-dds-edit-phone, .sn-dds-edit-fax').forEach(input => {
                input.onkeydown = (e) => {
                    if (e.key === 'Enter') {
                        const row = input.closest('tr');
                        if (row) {
                            const index = parseInt(row.dataset.index, 10);
                            this._saveEdit(index);
                        }
                    }
                    if (e.key === 'Escape') {
                        this._cancelEdit();
                    }
                };
            });
        },

        // ══════════════════════════════════════════════
        //  HELPERS
        // ══════════════════════════════════════════════

        _getFilteredData() {
            const searchInput = document.getElementById('sn-dds-editor-search');
            const query = searchInput ? searchInput.value.trim().toUpperCase() : '';
            if (!query) return this._ddsCache || [];

            return (this._ddsCache || []).filter(item => {
                const id = (item.id || '').toUpperCase();
                const name = (item.office_name || '').toUpperCase();
                const phone = (item.phone || '').replace(/\D/g, '');
                const fax = (item.fax || '').replace(/\D/g, '');
                const queryDigits = query.replace(/\D/g, '');
                return id.includes(query) ||
                    name.includes(query) ||
                    (queryDigits && phone.includes(queryDigits)) ||
                    (queryDigits && fax.includes(queryDigits));
            });
        },

        _escapeHtml(str) {
            if (!str) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }
    };

    app.Tools.DDSEditor = DDSEditor;
})();
