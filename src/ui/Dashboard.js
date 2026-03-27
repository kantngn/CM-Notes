(function () {
    const app = window.CM_App = window.CM_App || {};
    app.Tools = app.Tools || {};

    /**
     * Central command interface for searching client records, managing application settings, 
     * and performing data maintenance (backups/restores).
     * Interacts with Themes, WindowManager, BackupManager, AppObserver, content.js, and ClientNote.
     * @namespace app.Tools.Dashboard
     */
    const Dashboard = {
        activeTab: 'recent',
        _dataCache: [],
        currentView: 'list',
        _outsideClickListener: null,
        _listenerAttached: false,
        selectedStatuses: new Set(['All']),

        _loadData() {
            const keys = GM_listValues().filter(k => k.startsWith('cn_') && !k.startsWith('cn_color') && !k.startsWith('cn_form') && !k.startsWith('cn_med') && !k.startsWith('cn_font'));
            this._dataCache = keys.map(k => {
                const d = GM_getValue(k);
                if (d && typeof d === 'object') {
                    const id = k.replace('cn_', '');
                    const formData = GM_getValue('cn_form_data_' + id, {});
                    return { id: id, ...d, phone: formData.Phone || '' };
                }
                return null;
            }).filter(Boolean);
        },

        init() {
            if (this._listenerAttached) return;
            GM_addValueChangeListener('sn_dashboard_ui_state', (name, oldVal, newVal, remote) => {
                if (remote) this._syncState(newVal);
            });

            // Listen for data change broadcasts from other tabs
            GM_addValueChangeListener('sn_dashboard_broadcast', (name, oldVal, newVal, remote) => {
                if (remote) {
                    const el = document.getElementById('sn-dashboard');
                    if (el && el.style.display !== 'none' && this.currentView === 'list') {
                        this._loadData();
                        this.renderList();
                    }
                }
            });
            this._listenerAttached = true;

            // Sync to initial state on load
            const initialState = GM_getValue('sn_dashboard_ui_state', { isOpen: false });
            if (initialState.isOpen) {
                this._syncState(initialState);
            }
        },

        _addOutsideClickListener() {
            if (this._outsideClickListener) return;
            const w = document.getElementById('sn-dashboard');
            const dashBtn = document.getElementById('sn-dash-btn');
            this._outsideClickListener = (event) => {
                if (w && !w.contains(event.target) && event.target !== dashBtn && !dashBtn.contains(event.target) && w.style.display !== 'none') {
                    w.style.display = 'none';
                    this._removeOutsideClickListener();
                }
            };
            setTimeout(() => document.addEventListener('mousedown', this._outsideClickListener), 0);
        },

        _removeOutsideClickListener() {
            if (this._outsideClickListener) {
                document.removeEventListener('mousedown', this._outsideClickListener);
                this._outsideClickListener = null;
            }
        },

        /**
         * Toggles the visibility of the Dashboard window. 
         * Instantiates the UI and loads data if it doesn't already exist.
         */
        toggle() {
            const currentState = GM_getValue('sn_dashboard_ui_state', { isOpen: false });
            const newState = { isOpen: !currentState.isOpen };
            GM_setValue('sn_dashboard_ui_state', newState);
            this._syncState(newState); // Update this tab immediately
        },

        _syncState(state) {
            if (!state) return;
            const el = document.getElementById('sn-dashboard');

            if (state.isOpen) {
                if (!el) {
                    this._buildAndShow();
                } else {
                    const wasHidden = el.style.display === 'none';
                    el.style.display = 'flex';
                    this._addOutsideClickListener();

                    // If the dashboard was hidden, refresh its content upon showing it
                    // to ensure data from other tabs is synced.
                    if (wasHidden) {
                        this._loadData();
                        this.render();
                    }
                }
            } else {
                if (el) {
                    el.style.display = 'none';
                    this._removeOutsideClickListener();
                }
            }
        },

        _buildAndShow() {
            const w = document.createElement('div');
            w.id = 'sn-dashboard';
            w.className = 'sn-window';
            w.style.display = 'flex';

            w.style.width = '450px'; w.style.height = '600px';
            w.style.bottom = '42px'; w.style.right = '0px';
            w.style.backgroundColor = 'var(--sn-bg-lighter)'; w.style.border = '1px solid var(--sn-border)';

            w.innerHTML = `
                <div class="sn-header" style="background:var(--sn-bg-light); border-bottom:1px solid var(--sn-border); color:var(--sn-primary-dark);">
                    <span style="font-weight:bold;">KD CM1 Universal Note & Utility</span>
                    <button id="dash-close" style="background:none; border:none; color:var(--sn-primary-dark); cursor:pointer; font-weight:bold;">X</button>
                </div>
                <div id="dash-search-container" style="padding:10px; border-bottom:1px solid var(--sn-bg-light); background:var(--sn-bg-lighter); display:flex; align-items:center; gap:5px;">
                    <input type="text" id="dash-search" placeholder="Search Name/Phone..." style="flex:1; width:100%; min-width:0; padding:8px; box-sizing:border-box; background:white; border:1px solid var(--sn-bg-light); color:#333;">
                    <div style="position:relative; flex:0 0 32px; height:32px;">
                        <button id="dash-filter-btn" title="Filter Status" style="width:100%; height:100%; padding:0; border:1px solid var(--sn-bg-light); border-radius:3px; background:white; color:#555; cursor:pointer; display:flex; align-items:center; justify-content:center;"><svg style="width:16px;height:16px;" viewBox="0 0 24 24"><path fill="currentColor" d="M10,18.1V12L3.4,5.3C2.8,4.7 3.3,3.7 4.2,3.7H19.8C20.7,3.7 21.2,4.7 20.6,5.3L14,12V18.1C14,18.5 13.7,18.9 13.3,19L11,20.2C10.5,20.4 10,20.1 10,19.6V18.1Z" /></svg></button>
                        <div id="dash-filter-menu" style="display:none; position:absolute; top:calc(100% + 2px); right:0; width:200px; max-height:300px; overflow-y:auto; background:white; border:1px solid #ccc; border-radius:4px; box-shadow:0 4px 10px rgba(0,0,0,0.15); z-index:10000; padding:5px;"></div>
                    </div>
                </div>
                <div id="dash-body-wrapper" class="sn-dash-body">
                    <div class="sn-dash-sidebar">
                        <div id="tab-revisit" class="sn-dash-tab">Revisit</div>
                        <div id="tab-recent" class="sn-dash-tab">Recent</div>
                        <div style="flex-grow: 1;"></div>
                        <div id="tab-settings" class="sn-dash-tab" title="Settings" style="writing-mode: horizontal-tb; transform: none; padding: 10px 5px; font-size: 20px;">⚙️</div>
                    </div>
                    <div id="dash-main-content" style="flex: 1; display: flex; flex-direction: column; overflow: hidden;"></div>
                </div>
                <div id="dash-footer" style="padding:8px 10px; border-top:1px solid var(--sn-bg-light); display:flex; justify-content:space-between; align-items:center; font-size:11px; background:var(--sn-bg-lighter); flex-shrink:0;"></div>
                <div class="sn-resizer rs-n"></div>
                <div class="sn-resizer rs-nw"></div>
                <div class="sn-resizer rs-w"></div>
            `;
            document.body.appendChild(w);
            app.Core.Windows.makeResizable(w);
            w.querySelector('#dash-close').onclick = () => {
                this.toggle(); // Use the new state-based toggle
            };

            // Sidebar navigation
            w.querySelector('#tab-revisit').onclick = () => { 
                this.activeTab = 'revisit'; 
                this.currentView = 'list';
                this.updateSidebar(); 
                this.render(); 
            };
            w.querySelector('#tab-recent').onclick = () => { 
                this.activeTab = 'recent'; 
                this.currentView = 'list';
                this.updateSidebar(); 
                this.render(); 
            };
            w.querySelector('#tab-settings').onclick = () => {
                this.currentView = 'settings';
                this.updateSidebar();
                this.render();
            };

            const searchInput = w.querySelector('#dash-search');
            const filterBtn = w.querySelector('#dash-filter-btn');
            const filterMenu = w.querySelector('#dash-filter-menu');
            filterBtn.onclick = (e) => {
                e.stopPropagation();
                filterMenu.style.display = filterMenu.style.display === 'block' ? 'none' : 'block';
            };
            w.addEventListener('click', (e) => {
                if (!filterBtn.contains(e.target) && !filterMenu.contains(e.target)) {
                    filterMenu.style.display = 'none';
                }
            });
            searchInput.focus();
            searchInput.oninput = () => {
                this.renderSearchResults();
            };
            searchInput.onkeydown = (e) => {
                const list = w.querySelector('#dash-content');
                const items = list.querySelectorAll('.sn-list-item');
                if (items.length === 0) return;

                const currentFocused = list.querySelector('.sn-list-item.focused');
                let currentIndex = -1;
                if (currentFocused) {
                    currentIndex = Array.from(items).indexOf(currentFocused);
                }

                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    const nextIndex = Math.min(currentIndex + 1, items.length - 1);
                    if (nextIndex !== currentIndex) this.updateFocus(items, nextIndex);
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    const prevIndex = Math.max(currentIndex - 1, 0);
                    if (prevIndex !== currentIndex && currentIndex !== -1) this.updateFocus(items, prevIndex);
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    if (currentFocused) currentFocused.click();
                }
            };

            this._loadData();
            this.render();
        },

        render() {
            const w = document.getElementById('sn-dashboard');
            if (!w) return;
            const content = w.querySelector('#dash-main-content');
            const footer = w.querySelector('#dash-footer');
            const search = w.querySelector('#dash-search-container');

            this.updateSidebar();

            if (this.currentView === 'list') {
                search.style.display = 'flex';
                content.innerHTML = `<div id="dash-content" class="sn-dash-list"></div>`;
                this.renderList();

                footer.innerHTML = `<span style="font-weight:bold; color:var(--sn-primary-text);">Total Matters: ${this._dataCache.length}</span>`;
                
                const searchInput = w.querySelector('#dash-search');
                if (searchInput) searchInput.focus();
            } else {
                search.style.display = 'none';
                content.innerHTML = `<div class="sn-dash-settings" style="padding:10px; display:flex; flex-direction:column; gap:10px; overflow-y:auto; width:100%; box-sizing:border-box; flex:1; min-height:0;"></div>`;
                this.renderSettings(content.querySelector('.sn-dash-settings'));

                footer.innerHTML = `<span style="font-weight:bold; color:var(--sn-primary-text);">Application Settings</span>`;
            }
        },

        _generateEmail(cmName) {
            return cmName ? cmName.toLowerCase().replace(/\s+/g, '') + '@kirkendalldwyer.com' : '';
        },

        renderSettings(container) {
            const cm1 = GM_getValue('sn_global_cm1', '');
            const ext = GM_getValue('sn_global_ext', '');
            const email = GM_getValue('sn_global_email', this._generateEmail(cm1));
            const uiTheme = GM_getValue('sn_ui_theme', 'Teal');
            const useTzColor = GM_getValue('sn_tz_note_color', true);
            const followTheme = GM_getValue('sn_note_follow_theme', true);
            const defaultNoteColor = GM_getValue('sn_note_default_color', app.Core.Themes['Yellow'].lighter);
            const uiThemes = Object.keys(app.Core.Themes);

            let tzExamples = '';
            for (const tz in app.Core.NoteThemes.colors) {
                const colors = app.Core.NoteThemes.colors[tz];
                tzExamples += `
                    <div style="display: flex; align-items: center;">
                        <div style="width: 14px; height: 14px; background: linear-gradient(45deg, ${colors[0]}, ${colors[1]}); border: 1px solid #ccc; margin-right: 4px; border-radius: 2px;"></div>
                        <span style="font-size: 10px; font-weight: bold;">${tz}</span>
                    </div>
                `;
            }

            let defaultColorSwatches = '';
            for (const themeName in app.Core.Themes) {
                const color = app.Core.Themes[themeName].lighter;
                const isSelected = !followTheme && color === defaultNoteColor;
                defaultColorSwatches += `<div class="sn-note-color-swatch" data-color="${color}" style="width: 22px; height: 22px; cursor: pointer; background-color: ${color}; ${isSelected ? 'border: 2px solid var(--sn-primary-dark);' : 'border: 1px solid #ccc;'} border-radius: 3px;"></div>`;
            }

            container.innerHTML = `
                <div style="display:flex; flex-direction:column; gap:2px; margin-bottom: 8px;">
                    <label style="font-weight:bold; color:var(--sn-primary-text);">Default CM & Ext</label>
                    <div style="display:flex; gap:5px;">
                        <input id="set-cm" type="text" placeholder="CM Name" value="${cm1}" style="flex:2; padding:5px; border:1px solid #ccc; border-radius:3px;">
                        <input id="set-ext" type="text" placeholder="Ext" value="${ext}" style="flex:1; padding:5px; border:1px solid #ccc; border-radius:3px;">
                    </div>
                    <div style="margin-top:4px;">
                        <input id="set-email" type="text" placeholder="Email" value="${email}" style="width:100%; padding:5px; border:1px solid #ccc; border-radius:3px; font-size:12px; box-sizing:border-box;">
                    </div>
                </div>

                <div style="display:flex; flex-direction:column; gap:2px; margin-bottom: 8px;">
                    <label style="font-weight:bold; color:var(--sn-primary-text);">Theme & Colors</label>
                    
                    <div style="margin-bottom: 8px;">
                        <label style="font-size: 11px; color: #555;">UI Theme:</label>
                        <select id="set-ui-theme" style="padding:3px; border:1px solid #ccc; border-radius:3px; background:white; width: 100%;">
                            ${uiThemes.map(t => `<option value="${t}" ${t === uiTheme ? 'selected' : ''}>${t}</option>`).join('')}
                        </select>
                    </div>

                    <div style="display: flex; align-items: center; margin-bottom: 2px;">
                        <input type="checkbox" id="sn-setting-tz-color" ${useTzColor ? 'checked' : ''} style="margin-right: 6px;">
                        <label for="sn-setting-tz-color" style="font-size: 11px; cursor: pointer; user-select: none;">Use Timezone-based colors for notes.</label>
                    </div>
                    <div id="sn-tz-color-preview" style="margin-top: 2px; margin-bottom: 8px;">
                        <div style="display: flex; flex-wrap: nowrap; gap: 5px; align-items: center; overflow-x: auto;">
                            ${tzExamples}
                        </div>
                    </div>

                    <div id="sn-default-note-color-settings" style="display: block; border-top: 1px dashed var(--sn-bg-light); padding-top: 5px;">
                        <label style="font-size: 11px; color: #555; display:block; margin-bottom:4px;">Default Note Color (if TZ disabled/unavailable):</label>
                        <div style="display: flex; align-items: center; margin-bottom: 10px;">
                            <input type="checkbox" id="sn-setting-follow-theme" ${followTheme ? 'checked' : ''} style="margin-right: 8px;">
                            <label for="sn-setting-follow-theme" style="font-size: 12px; cursor: pointer; user-select: none;">Follow UI Theme</label>
                        </div>
                        <div id="sn-default-note-color-picker" style="display: flex; flex-wrap: wrap; gap: 6px; ${followTheme ? 'opacity: 0.5; pointer-events: none;' : ''}">
                            ${defaultColorSwatches}
                        </div>
                    </div>
                </div>

                <div style="display:flex; flex-direction:column; gap:4px; margin-bottom: 8px;">
                    <label style="font-weight:bold; color:var(--sn-primary-text);">Data Management</label>
                    <button id="set-manual-backup" style="padding:6px; cursor:pointer; background:#fff; border:1px solid var(--sn-border); color:var(--sn-primary-text); border-radius:3px;">📤 Manual Backup</button>
                    <button id="set-restore" style="padding:6px; cursor:pointer; background:#fff; border:1px solid var(--sn-border); color:var(--sn-primary-text); border-radius:3px;">📥 Restore from Backup</button>
                    <button id="set-auto-backup" style="padding:6px; cursor:pointer; background:#e8f5e9; border:1px solid #66bb6a; color:#2e7d32; border-radius:3px;">⚙️ Configure Auto-Backup</button>
                </div>
            `;

            container.querySelector('#set-cm').onchange = (e) => {
                const newName = e.target.value;
                const oldName = GM_getValue('sn_global_cm1', '');
                GM_setValue('sn_global_cm1', newName);
                // Auto-update email if it still matches the old auto-generated pattern
                const emailInput = container.querySelector('#set-email');
                const currentEmail = emailInput.value;
                const oldGenerated = this._generateEmail(oldName);
                if (!currentEmail || currentEmail === oldGenerated) {
                    const newEmail = this._generateEmail(newName);
                    emailInput.value = newEmail;
                    GM_setValue('sn_global_email', newEmail);
                }
            };
            container.querySelector('#set-ext').onchange = (e) => GM_setValue('sn_global_ext', e.target.value);
            container.querySelector('#set-email').onchange = (e) => GM_setValue('sn_global_email', e.target.value);

            container.querySelector('#set-ui-theme').onchange = (e) => {
                GM_setValue('sn_ui_theme', e.target.value);
                app.Core.Styles.applyTheme(e.target.value);
            };

            const tzCheckbox = container.querySelector('#sn-setting-tz-color');
            tzCheckbox.onchange = (e) => {
                const isChecked = e.target.checked;
                GM_setValue('sn_tz_note_color', isChecked);
            };

            const followThemeCheckbox = container.querySelector('#sn-setting-follow-theme');
            const colorPickerDiv = container.querySelector('#sn-default-note-color-picker');
            followThemeCheckbox.onchange = (e) => {
                const isChecked = e.target.checked;
                GM_setValue('sn_note_follow_theme', isChecked);
                colorPickerDiv.style.opacity = isChecked ? '0.5' : '1';
                colorPickerDiv.style.pointerEvents = isChecked ? 'none' : 'auto';
            };

            const swatches = container.querySelectorAll('.sn-note-color-swatch');
            swatches.forEach(swatch => {
                swatch.onclick = () => {
                    if (followThemeCheckbox.checked) return;
                    const newColor = swatch.dataset.color;
                    GM_setValue('sn_note_default_color', newColor);
                    swatches.forEach(s => { s.style.border = '1px solid #ccc'; });
                    swatch.style.border = '2px solid var(--sn-primary-dark)';
                };
            });


            // NEW: Delegate to BackupManager
            container.querySelector('#set-manual-backup').onclick = () => {
                if (app.Tools.BackupManager) app.Tools.BackupManager.createManualBackup();
            };
            container.querySelector('#set-restore').onclick = () => {
                if (app.Tools.BackupManager) app.Tools.BackupManager.showRestoreUI();
            };
            container.querySelector('#set-auto-backup').onclick = () => {
                if (app.Tools.BackupManager) app.Tools.BackupManager.configureAutoBackup();
            };
        },

        updateSidebar() {
            const w = document.getElementById('sn-dashboard');
            if (!w) return;
            w.querySelectorAll('.sn-dash-tab').forEach(t => t.classList.remove('active'));
            if (this.currentView === 'settings') {
                w.querySelector('#tab-settings').classList.add('active');
            } else {
                w.querySelector(`#tab-${this.activeTab}`).classList.add('active');
            }
        },
        
        updateStatusFilterOptions() {
            const menu = document.getElementById('dash-filter-menu');
            if (!menu) return;
            
            const scrollTop = menu.scrollTop;
            const statuses = new Set(this._dataCache.map(i => i.status).filter(s => s && s.trim() !== ''));
            const sorted = Array.from(statuses).sort();
            
            menu.innerHTML = '';

            const createRow = (val, label, checked, isAll) => {
                const row = document.createElement('div');
                row.style.cssText = 'display:flex; align-items:center; padding:4px 8px; cursor:pointer; font-size:12px; color:#333; user-select:none;';
                row.onmouseover = () => row.style.backgroundColor = '#f5f5f5';
                row.onmouseout = () => row.style.backgroundColor = 'transparent';
                
                const box = document.createElement('input');
                box.type = 'checkbox';
                box.checked = checked;
                box.style.marginRight = '8px';
                box.style.pointerEvents = 'none';
                
                row.appendChild(box);
                row.appendChild(document.createTextNode(label));
                row.onclick = (e) => {
                    e.stopPropagation();
                    if (isAll) { this.selectedStatuses.clear(); this.selectedStatuses.add('All'); }
                    else {
                        if (this.selectedStatuses.has('All')) this.selectedStatuses.clear();
                        if (this.selectedStatuses.has(val)) { this.selectedStatuses.delete(val); if (this.selectedStatuses.size === 0) this.selectedStatuses.add('All'); }
                        else { this.selectedStatuses.add(val); }
                    }
                    const searchInput = document.getElementById('dash-search');
                    if (searchInput && searchInput.value.trim() !== '') this.renderSearchResults(); else this.renderList();
                };
                return row;
            };

            const isAll = this.selectedStatuses.has('All');
            menu.appendChild(createRow('All', 'All Statuses', isAll, true));
            menu.appendChild(document.createElement('hr')); // Simple separator
            sorted.forEach(s => {
                menu.appendChild(createRow(s, s, !isAll && this.selectedStatuses.has(s), false));
            });
            menu.scrollTop = scrollTop;
        },

        updateFocus(items, newIndex) {
            items.forEach(item => item.classList.remove('focused'));
            if (items[newIndex]) {
                items[newIndex].classList.add('focused');
                items[newIndex].scrollIntoView({ block: 'nearest' });
            }
        },

        renderList() {
            const w = document.getElementById('sn-dashboard');
            if (!w) return;
            const container = w.querySelector('#dash-content');
            if (!container) return;
            container.innerHTML = '';

            this.updateStatusFilterOptions();
            let items = [...this._dataCache];

            if (!this.selectedStatuses.has('All')) {
                items = items.filter(i => this.selectedStatuses.has(i.status));
            }

            if (this.activeTab === 'revisit') {
                items = items.filter(i => i.revisitActive && i.revisit).sort((a, b) => {
                    if (a.revisit && b.revisit) {
                        // Replace hyphens with slashes to ensure parsing in local time, not UTC
                        const aDate = new Date(a.revisit.replace(/-/g, '/'));
                        const bDate = new Date(b.revisit.replace(/-/g, '/'));
                        return aDate - bDate;
                    }
                    return (b.timestamp || 0) - (a.timestamp || 0);
                });
            } else {
                items = items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            }

            if (items.length === 0) {
                const msg = this.activeTab === 'revisit' ? 'No Revisit cases.' : 'No Recent history.';
                container.innerHTML = `<div style="text-align:center; color:#888; margin-top:20px;">${msg}</div>`;
            } else {
                items.slice(0, 50).forEach(item => this.createRow(container, item));
                this.updateFocus(container.querySelectorAll('.sn-list-item'), 0);
            }
        },

        renderSearchResults() {
            const w = document.getElementById('sn-dashboard');
            if (!w) return;
            const container = w.querySelector('#dash-content');
            if (!container) return;
            const query = w.querySelector('#dash-search').value.toLowerCase();
            const cleanQuery = query.replace(/\D/g, '');
            container.innerHTML = '';
            const items = this._dataCache.filter(i => {
                const nameMatch = i.name && i.name.toLowerCase().includes(query);
                const statusString = i.status || ((i.level && i.type) ? `${i.level} - ${i.type}` : (i.level || i.type || ""));
                const statusMatch = statusString.toLowerCase().includes(query);
                const phoneMatch = cleanQuery.length > 0 && i.phone && i.phone.replace(/\D/g, '').includes(cleanQuery);
                
                const filterMatch = this.selectedStatuses.has('All') || this.selectedStatuses.has(i.status);
                return (nameMatch || statusMatch || phoneMatch) && filterMatch;
            });
            if (items.length === 0) container.innerHTML = '<div style="text-align:center; color:#888; margin-top:20px;">No matches found.</div>';
            items.forEach(item => this.createRow(container, item));
            this.updateFocus(container.querySelectorAll('.sn-list-item'), 0);
        },

        createRow(container, item) {
            const status = item.status || ((item.level && item.type) ? `${item.level} - ${item.type}` : (item.level || item.type || "No Status"));

            let todoPreview = "No tasks";
            if (item.notes) {
                // New rich text format check for checklists
                if (item.notes.includes('sn-todo-item')) {
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(item.notes, 'text/html');
                    const tasks = Array.from(doc.querySelectorAll('.sn-todo-item span')).map(span => span.textContent.trim()).filter(t => t);
                    if (tasks.length > 0) {
                        todoPreview = tasks.slice(0, 2).map(t => `<div class="sn-todo-line">• ${t}</div>`).join('');
                    }
                } else { // Legacy plain text format for checklists
                    const lines = item.notes.split('\n');
                    const tasks = lines.filter(line => line.startsWith('> ') || line.startsWith('>x ')).map(line => line.replace(/^>x? /, '').trim()).filter(t => t);
                    if (tasks.length > 0) {
                        todoPreview = tasks.slice(0, 2).map(t => `<div class="sn-todo-line">• ${t}</div>`).join('');
                    }
                }
            } else if (item.todoHTML) {
                // Fallback for legacy saved data
                const parser = new DOMParser();
                const doc = parser.parseFromString(item.todoHTML, 'text/html');
                const tasks = Array.from(doc.body.querySelectorAll('div')).map(d => d.innerText.trim()).filter(t => t);
                if (tasks.length > 0) todoPreview = tasks.slice(0, 2).map(t => `<div class="sn-todo-line">• ${t}</div>`).join('');
            }

            // Replace hyphens with slashes to ensure parsing in local time, not UTC
            const revisitDate = item.revisit ? new Date(item.revisit.replace(/-/g, '/')) : null;
            const revisitDateStr = revisitDate ? `Due: ${revisitDate.toLocaleDateString()}` : '';

            const revisitMarker = item.revisitActive ? `<span style="color:red; font-size:14px; line-height:0; margin-left: 8px; margin-right: 4px; vertical-align: middle;">•</span>` : '';

            let dateInfoStr = '';
            if (item.revisitActive && item.revisit) {
                dateInfoStr = `<span style="font-size: 10px; color: red; font-weight: bold;">${revisitDateStr}</span>`;
            } else {
                const lastUpdate = item.timestamp ? new Date(item.timestamp).toLocaleDateString() : '';
                dateInfoStr = lastUpdate ? `<span style="font-size: 10px; color: #888; ${!item.revisitActive ? 'margin-left: 8px;' : ''}">Updated: ${lastUpdate}</span>` : '';
            }

            const div = document.createElement('div');
            div.className = 'sn-list-item';
            div.innerHTML = `
                <div class="sn-item-left">
                    <div class="sn-item-name">${item.name}</div>
                    <div class="sn-item-status">${status}${revisitMarker}${dateInfoStr}</div>
                </div>
                <div class="sn-item-right">
                    ${todoPreview}
                </div>
            `;
            div.onclick = () => { GM_openInTab(`${window.location.origin}/lightning/r/kdlaw__Matter__c/${item.id}/view`, { active: false }); };
            container.appendChild(div);
        }
    };

    app.Tools.Dashboard = Dashboard;
})();
