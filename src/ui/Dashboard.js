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

            // Listen for fax log updates from other tabs — unified Fax Log view
            GM_addValueChangeListener('sn_fax_log_broadcast', (name, oldVal, newVal, remote) => {
                if (remote && this.activeTab === 'faxlog') {
                    this.renderFaxLog();
                }
            });

            // Listen for pending auto-LAs — try to create them when user is on matching SF page
            GM_addValueChangeListener('sn_pending_auto_las', (name, oldVal, newVal, remote) => {
                if (remote) {
                    this._tryAutoCreatePendingLAs();
                } else {
                    // Local change — still update the banner
                    this._updatePendingLABanner();
                }
            });

            this._listenerAttached = true;

            // Try to auto-create any pending LAs on the current page
            this._tryAutoCreatePendingLAs();
            // Show banner immediately if there are pending LAs that can't be auto-created yet
            this._updatePendingLABanner();

            // Poll for URL changes to auto-create LAs when user navigates
            // to a client page that has a pending fax receipt
            if (!this._urlPollInterval) {
                let lastUrl = window.location.href;
                this._urlPollInterval = setInterval(() => {
                    if (document.hidden) return;
                    const currentUrl = window.location.href;
                    if (currentUrl !== lastUrl) {
                        lastUrl = currentUrl;
                        this._tryAutoCreatePendingLAs();
                    }
                }, 2000);
            }

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

            // Also close on Escape key
            if (!this._escapeKeydownHandler) {
                this._escapeKeydownHandler = (event) => {
                    if (event.key === 'Escape') {
                        const dash = document.getElementById('sn-dashboard');
                        if (dash && dash.style.display !== 'none') {
                            this.toggle();
                        }
                    }
                };
                document.addEventListener('keydown', this._escapeKeydownHandler);
            }
        },

        _removeOutsideClickListener() {
            if (this._outsideClickListener) {
                document.removeEventListener('mousedown', this._outsideClickListener);
                this._outsideClickListener = null;
            }
            if (this._escapeKeydownHandler) {
                document.removeEventListener('keydown', this._escapeKeydownHandler);
                this._escapeKeydownHandler = null;
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
                        <div id="tab-faxlog" class="sn-dash-tab">Fax Log</div>
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
            w.querySelector('#tab-faxlog').onclick = () => {
                this.activeTab = 'faxlog';
                this.currentView = 'faxlog';
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
            } else if (this.currentView === 'faxlog') {
                search.style.display = 'none';
                content.innerHTML = `<div id="dash-faxlog-content" style="flex:1; display:flex; flex-direction:column; overflow:hidden;"></div>`;
                this.renderFaxLog();
                footer.innerHTML = `<span style="font-weight:bold; color:var(--sn-primary-text);">Fax Log</span>`;
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
                    <div style="display: flex; align-items: center; margin-top: 4px;">
                        <input type="checkbox" id="sn-setting-cm-warning" ${GM_getValue('sn_cm_warning_enabled', true) ? 'checked' : ''} style="margin-right: 6px;">
                        <label for="sn-setting-cm-warning" style="font-size: 11px; cursor: pointer; user-select: none;">Show CM Warning when case is not assigned to you.</label>
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

                    <div id="auto-backup-section" style="border:1px solid var(--sn-bg-light); border-radius:4px; padding:8px; margin-top:4px; background:white;">
                        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
                            <label style="font-weight:bold; font-size:12px; color:var(--sn-primary-text);">⚙️ Auto-Backup</label>
                            <span id="auto-backup-indicator" style="font-size:10px; padding:2px 6px; border-radius:3px;"></span>
                        </div>
                        <div id="auto-backup-status" style="font-size:11px; color:#666; margin-bottom:6px;"></div>

                        <div id="auto-backup-schedule-controls" style="display:flex; flex-direction:column; gap:4px; margin-bottom:6px; padding:4px; background:#fafafa; border-radius:3px;">
                            <div style="display:flex; gap:4px; align-items:center; flex-wrap:wrap;">
                                <label style="font-size:10px; color:#555;">Time:</label>
                                <input type="time" id="auto-backup-time" value="16:45" style="padding:2px 4px; border:1px solid #ccc; border-radius:3px; font-size:11px;">
                                <label style="font-size:10px; color:#555; margin-left:4px;">Frequency:</label>
                                <select id="auto-backup-frequency" style="padding:2px 4px; border:1px solid #ccc; border-radius:3px; font-size:11px; background:white;">
                                    <option value="weekdays">Weekdays</option>
                                    <option value="daily">Daily</option>
                                    <option value="weekly">Weekly</option>
                                </select>
                            </div>
                            <div id="auto-backup-weekly-day-wrapper" style="display:none; flex-wrap:wrap; gap:4px; align-items:center;">
                                <label style="font-size:10px; color:#555;">On:</label>
                                <select id="auto-backup-weekly-day" style="padding:2px 4px; border:1px solid #ccc; border-radius:3px; font-size:11px; background:white;">
                                    <option value="1">Monday</option>
                                    <option value="2">Tuesday</option>
                                    <option value="3">Wednesday</option>
                                    <option value="4">Thursday</option>
                                    <option value="5">Friday</option>
                                    <option value="6">Saturday</option>
                                    <option value="0">Sunday</option>
                                </select>
                            </div>
                        </div>

                        <div id="auto-backup-actions" style="display:flex; gap:4px; flex-wrap:wrap;">
                            <button id="set-auto-backup" style="padding:5px 8px; cursor:pointer; background:#e8f5e9; border:1px solid #66bb6a; color:#2e7d32; border-radius:3px; font-size:11px;">📂 Set Folder</button>
                            <button id="set-auto-backup-now" style="padding:5px 8px; cursor:pointer; background:#fff; border:1px solid var(--sn-border); color:var(--sn-primary-text); border-radius:3px; font-size:11px;">▶️ Backup Now</button>
                            <button id="set-auto-backup-disable" style="padding:5px 8px; cursor:pointer; background:#fff; border:1px solid #ef9a9a; color:#c62828; border-radius:3px; font-size:11px; display:none;">⏹ Disable</button>
                        </div>
                    </div>

                    <div id="gdrive-section" style="border:1px solid var(--sn-bg-light); border-radius:4px; padding:8px; margin-top:4px; background:white;">
                        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
                            <label style="font-weight:bold; font-size:12px; color:var(--sn-primary-text);">☁️ Google Drive Sync</label>
                            <span id="gdrive-indicator" style="font-size:10px; padding:2px 6px; border-radius:3px;"></span>
                        </div>
                        <div id="gdrive-status" style="font-size:11px; color:#666; margin-bottom:6px;"></div>

                        <div id="gdrive-sync-controls" style="display:none; flex-direction:column; gap:4px; margin-bottom:6px; padding:4px; background:#fafafa; border-radius:3px;">
                            <div style="display:flex; gap:4px; align-items:center; flex-wrap:wrap;">
                                <label style="font-size:10px; color:#555;">Sync:</label>
                                <select id="gdrive-sync-frequency" style="padding:2px 4px; border:1px solid #ccc; border-radius:3px; font-size:11px; background:white;">
                                    <option value="after_local_backup">After local backup</option>
                                    <option value="daily">Daily</option>
                                    <option value="weekly">Weekly</option>
                                </select>
                            </div>
                            <div id="gdrive-sync-time-wrapper" style="display:none; flex-wrap:wrap; gap:4px; align-items:center;">
                                <label style="font-size:10px; color:#555;">Time:</label>
                                <input type="time" id="gdrive-sync-time" value="16:45" style="padding:2px 4px; border:1px solid #ccc; border-radius:3px; font-size:11px;">
                            </div>
                            <div id="gdrive-sync-weekly-day-wrapper" style="display:none; flex-wrap:wrap; gap:4px; align-items:center;">
                                <label style="font-size:10px; color:#555;">On:</label>
                                <select id="gdrive-sync-weekly-day" style="padding:2px 4px; border:1px solid #ccc; border-radius:3px; font-size:11px; background:white;">
                                    <option value="1">Monday</option>
                                    <option value="2">Tuesday</option>
                                    <option value="3">Wednesday</option>
                                    <option value="4">Thursday</option>
                                    <option value="5">Friday</option>
                                    <option value="6">Saturday</option>
                                    <option value="0">Sunday</option>
                                </select>
                            </div>
                            <label id="gdrive-sync-toggle-wrapper" style="display:none; align-items:center; gap:4px; font-size:11px; color:#555; cursor:pointer;">
                                <input type="checkbox" id="gdrive-sync-toggle"> Auto-sync enabled
                            </label>
                        </div>

                        <div id="gdrive-actions" style="display:flex; gap:4px; flex-wrap:wrap;">
                            <button id="gdrive-connect" style="padding:5px 8px; cursor:pointer; background:#e3f2fd; border:1px solid #42a5f5; color:#1565c0; border-radius:3px; font-size:11px;">🔗 Connect</button>
                            <button id="gdrive-disconnect" style="padding:5px 8px; cursor:pointer; background:#fff; border:1px solid #ef9a9a; color:#c62828; border-radius:3px; font-size:11px; display:none;">🔌 Disconnect</button>
                        </div>
                    </div>
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

            container.querySelector('#sn-setting-cm-warning').onchange = (e) => GM_setValue('sn_cm_warning_enabled', e.target.checked);
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


            // Data Management: Delegate to BackupManager
            container.querySelector('#set-manual-backup').onclick = () => {
                if (app.Tools.BackupManager) app.Tools.BackupManager.createManualBackup();
            };
            container.querySelector('#set-restore').onclick = () => {
                if (app.Tools.BackupManager) app.Tools.BackupManager.showRestoreUI();
            };

            // Auto-backup: dynamic status + controls
            this._renderAutoBackupStatus(container);

            container.querySelector('#set-auto-backup').onclick = async () => {
                if (app.Tools.BackupManager) {
                    await app.Tools.BackupManager.configureAutoBackup();
                    this._renderAutoBackupStatus(container);
                }
            };

            container.querySelector('#set-auto-backup-now').onclick = async () => {
                const btn = container.querySelector('#set-auto-backup-now');
                btn.textContent = '⏳ Backing up...';
                btn.disabled = true;
                if (app.Tools.BackupManager) {
                    await app.Tools.BackupManager.backupNow();
                }
                btn.textContent = '▶️ Backup Now';
                btn.disabled = false;
                this._renderAutoBackupStatus(container);
            };

            const disableBtn = container.querySelector('#set-auto-backup-disable');
            if (disableBtn) {
                disableBtn.onclick = () => {
                    if (app.Tools.BackupManager) {
                        app.Tools.BackupManager.disableAutoBackup();
                        this._renderAutoBackupStatus(container);
                    }
                };
            }

            // ── Auto-backup schedule controls ──────────────────
            const abTime = container.querySelector('#auto-backup-time');
            const abFreq = container.querySelector('#auto-backup-frequency');
            const abWeeklyWrapper = container.querySelector('#auto-backup-weekly-day-wrapper');
            const abWeeklyDay = container.querySelector('#auto-backup-weekly-day');

            if (abFreq) {
                abFreq.onchange = () => {
                    if (app.Tools.BackupManager) {
                        app.Tools.BackupManager.updateConfig({ frequency: abFreq.value });
                        if (abWeeklyWrapper) {
                            abWeeklyWrapper.style.display = abFreq.value === 'weekly' ? 'flex' : 'none';
                        }
                        this._renderAutoBackupStatus(container);
                    }
                };
            }
            if (abTime) {
                abTime.onchange = () => {
                    if (app.Tools.BackupManager) {
                        app.Tools.BackupManager.updateConfig({ time: abTime.value });
                        this._renderAutoBackupStatus(container);
                    }
                };
            }
            if (abWeeklyDay) {
                abWeeklyDay.onchange = () => {
                    if (app.Tools.BackupManager) {
                        app.Tools.BackupManager.updateConfig({ weeklyDay: parseInt(abWeeklyDay.value, 10) });
                        this._renderAutoBackupStatus(container);
                    }
                };
            }

            // Google Drive: dynamic status + controls
            this._renderGDriveStatus(container);

            container.querySelector('#gdrive-connect').onclick = async () => {
                if (!app.Tools.BackupManager) return;
                const btn = container.querySelector('#gdrive-connect');
                btn.textContent = '⏳ Connecting...';
                btn.disabled = true;
                await app.Tools.BackupManager.gdriveConnect();
                btn.textContent = '🔗 Connect';
                btn.disabled = false;
                this._renderGDriveStatus(container);
            };

            container.querySelector('#gdrive-disconnect').onclick = async () => {
                if (app.Tools.BackupManager) {
                    await app.Tools.BackupManager.gdriveDisconnect();
                    this._renderGDriveStatus(container);
                }
            };

            const syncToggle = container.querySelector('#gdrive-sync-toggle');
            if (syncToggle) {
                syncToggle.onchange = () => {
                    if (app.Tools.BackupManager) {
                        app.Tools.BackupManager.setGDriveSyncEnabled(syncToggle.checked);
                    }
                };
            }

            // ── GDrive sync schedule controls ──────────────────
            const gdFreq = container.querySelector('#gdrive-sync-frequency');
            const gdTime = container.querySelector('#gdrive-sync-time');
            const gdTimeWrapper = container.querySelector('#gdrive-sync-time-wrapper');
            const gdWeeklyWrapper = container.querySelector('#gdrive-sync-weekly-day-wrapper');
            const gdWeeklyDay = container.querySelector('#gdrive-sync-weekly-day');

            if (gdFreq) {
                gdFreq.onchange = () => {
                    if (app.Tools.BackupManager) {
                        app.Tools.BackupManager.updateGDriveConfig({ syncFrequency: gdFreq.value });
                        const isScheduled = gdFreq.value === 'daily' || gdFreq.value === 'weekly';
                        if (gdTimeWrapper) gdTimeWrapper.style.display = isScheduled ? 'flex' : 'none';
                        if (gdWeeklyWrapper) gdWeeklyWrapper.style.display = gdFreq.value === 'weekly' ? 'flex' : 'none';
                        this._renderGDriveStatus(container);
                    }
                };
            }
            if (gdTime) {
                gdTime.onchange = () => {
                    if (app.Tools.BackupManager) {
                        app.Tools.BackupManager.updateGDriveConfig({ syncTime: gdTime.value });
                        this._renderGDriveStatus(container);
                    }
                };
            }
            if (gdWeeklyDay) {
                gdWeeklyDay.onchange = () => {
                    if (app.Tools.BackupManager) {
                        app.Tools.BackupManager.updateGDriveConfig({ syncWeeklyDay: parseInt(gdWeeklyDay.value, 10) });
                        this._renderGDriveStatus(container);
                    }
                };
            }
        },

        _renderAutoBackupStatus(container) {
            if (!app.Tools.BackupManager) return;
            const status = app.Tools.BackupManager.getStatus();
            const indicator = container.querySelector('#auto-backup-indicator');
            const statusEl = container.querySelector('#auto-backup-status');
            const disableBtn = container.querySelector('#set-auto-backup-disable');
            const timeInput = container.querySelector('#auto-backup-time');
            const freqSelect = container.querySelector('#auto-backup-frequency');
            const weeklyDayWrapper = container.querySelector('#auto-backup-weekly-day-wrapper');
            const weeklyDaySelect = container.querySelector('#auto-backup-weekly-day');

            // Populate controls from current config
            if (timeInput) timeInput.value = status.time || '16:45';
            if (freqSelect) freqSelect.value = status.frequency || 'weekdays';
            if (weeklyDaySelect) weeklyDaySelect.value = String(status.weeklyDay ?? 1);
            if (weeklyDayWrapper) weeklyDayWrapper.style.display = (status.frequency === 'weekly') ? 'flex' : 'none';

            if (status.configured && status.enabled) {
                indicator.textContent = '● Active';
                indicator.style.color = '#2e7d32';
                indicator.style.background = '#e8f5e9';
                let info = `Schedule: ${status.scheduleDesc}`;
                if (status.lastBackup) {
                    info += ` | Last: ${status.lastBackup}`;
                } else {
                    info += ` | No backup yet`;
                }
                if (status.isDue) {
                    info += ` | ⏳ Pending today...`;
                }
                statusEl.textContent = info;
                if (disableBtn) disableBtn.style.display = 'inline-block';
            } else if (status.configured && !status.enabled) {
                indicator.textContent = '● Paused';
                indicator.style.color = '#e65100';
                indicator.style.background = '#fff3e0';
                statusEl.textContent = `Folder set, but auto-backup is disabled. Enable by reconfiguring. Last: ${status.lastBackup || 'never'}`;
                if (disableBtn) disableBtn.style.display = 'none';
            } else {
                indicator.textContent = '● Not Set Up';
                indicator.style.color = '#888';
                indicator.style.background = '#f5f5f5';
                statusEl.textContent = 'Click "Set Folder" to choose a backup directory.';
                if (disableBtn) disableBtn.style.display = 'none';
            }
        },

        _renderGDriveStatus(container) {
            if (!app.Tools.BackupManager) return;
            const gstatus = app.Tools.BackupManager.getGDriveStatus();
            const indicator = container.querySelector('#gdrive-indicator');
            const statusEl = container.querySelector('#gdrive-status');
            const connectBtn = container.querySelector('#gdrive-connect');
            const disconnectBtn = container.querySelector('#gdrive-disconnect');
            const syncControls = container.querySelector('#gdrive-sync-controls');
            const syncToggleWrapper = container.querySelector('#gdrive-sync-toggle-wrapper');
            const syncToggle = container.querySelector('#gdrive-sync-toggle');
            const syncFreq = container.querySelector('#gdrive-sync-frequency');
            const syncTimeWrapper = container.querySelector('#gdrive-sync-time-wrapper');
            const syncTime = container.querySelector('#gdrive-sync-time');
            const syncWeeklyWrapper = container.querySelector('#gdrive-sync-weekly-day-wrapper');
            const syncWeeklyDay = container.querySelector('#gdrive-sync-weekly-day');

            if (gstatus.connected) {
                indicator.textContent = '● Connected';
                indicator.style.color = '#1565c0';
                indicator.style.background = '#e3f2fd';
                let statusText = gstatus.userEmail || 'Connected';
                if (gstatus.syncEnabled) {
                    const syncLabel = gstatus.syncDesc || 'After local backup';
                    statusText += ` | Sync: ${syncLabel}`;
                } else {
                    statusText += ' | Sync disabled';
                }
                if (gstatus.lastSync) {
                    statusText += ` | Last: ${gstatus.lastSync}`;
                }
                statusEl.textContent = statusText;
                if (connectBtn) connectBtn.style.display = 'none';
                if (disconnectBtn) disconnectBtn.style.display = 'inline-block';

                // Show sync controls
                if (syncControls) syncControls.style.display = 'flex';
                if (syncToggleWrapper) syncToggleWrapper.style.display = 'flex';
                if (syncToggle) syncToggle.checked = gstatus.syncEnabled;
                if (syncFreq) syncFreq.value = gstatus.syncFrequency || 'after_local_backup';
                if (syncTime) syncTime.value = gstatus.syncTime || '16:45';

                const isScheduled = gstatus.syncFrequency === 'daily' || gstatus.syncFrequency === 'weekly';
                if (syncTimeWrapper) syncTimeWrapper.style.display = isScheduled ? 'flex' : 'none';
                if (syncWeeklyWrapper) syncWeeklyWrapper.style.display = gstatus.syncFrequency === 'weekly' ? 'flex' : 'none';
                if (syncWeeklyDay) syncWeeklyDay.value = String(gstatus.syncWeeklyDay ?? 1);
            } else {
                indicator.textContent = '● Not Connected';
                indicator.style.color = '#888';
                indicator.style.background = '#f5f5f5';
                statusEl.textContent = 'Connect to automatically upload backups to Google Drive.';
                if (connectBtn) connectBtn.style.display = 'inline-block';
                if (disconnectBtn) disconnectBtn.style.display = 'none';
                if (syncControls) syncControls.style.display = 'none';
                if (syncToggleWrapper) syncToggleWrapper.style.display = 'none';
            }
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
                // If query starts with "1" (US country code), also search without it
                const phoneQueryStripped = cleanQuery.length > 10 && cleanQuery.startsWith('1') ? cleanQuery.slice(1) : '';
                const phoneMatch = cleanQuery.length > 0 && i.phone && (
                    i.phone.replace(/\D/g, '').includes(cleanQuery) ||
                    (phoneQueryStripped && i.phone.replace(/\D/g, '').includes(phoneQueryStripped))
                );

                const filterMatch = this.selectedStatuses.has('All') || this.selectedStatuses.has(i.status);
                return (nameMatch || statusMatch || phoneMatch) && filterMatch;
            });
            if (items.length === 0) container.innerHTML = '<div style="text-align:center; color:#888; margin-top:20px;">No matches found.</div>';
            items.forEach(item => this.createRow(container, item));
            this.updateFocus(container.querySelectorAll('.sn-list-item'), 0);
        },

        createRow(container, item) {
            const status = item.status || ((item.level && item.type) ? `${item.level} - ${item.type}` : (item.level || item.type || "No Status"));

            // Extract todo preview from the new JSON format (item.todos) or fall back to notes parsing
            let todoPreview = "No tasks";
            const extractTodoPreview = (tasks) => {
                if (tasks.length > 0) {
                    todoPreview = tasks.slice(0, 2).map(t => {
                        const text = t.text || t;
                        const checked = t.checked || false;
                        const style = checked ? 'text-decoration:line-through; color:#888;' : '';
                        return `<div class="sn-todo-line" style="${style}">• ${text}</div>`;
                    }).join('');
                }
            };

            // 1. New JSON format from dedicated todo area
            if (item.todos) {
                try {
                    const parsed = typeof item.todos === 'string' ? JSON.parse(item.todos) : item.todos;
                    if (Array.isArray(parsed)) {
                        const tasks = parsed.filter(t => (t.text || '').trim());
                        extractTodoPreview(tasks);
                    }
                } catch (e) { /* fall through to legacy formats */ }
            }

            // 2. Fallback: notes with embedded todo items (rich text)
            if (todoPreview === "No tasks" && item.notes) {
                if (item.notes.includes('sn-todo-item')) {
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(item.notes, 'text/html');
                    const tasks = Array.from(doc.querySelectorAll('.sn-todo-item span')).map(span => span.textContent.trim()).filter(t => t);
                    extractTodoPreview(tasks.map(t => ({ text: t, checked: false })));
                } else { // Legacy plain text format for checklists
                    const lines = item.notes.split('\n');
                    const tasks = lines.filter(line => line.startsWith('> ') || line.startsWith('>x ')).map(line => ({
                        text: line.replace(/^>x? /, '').trim(),
                        checked: line.startsWith('>x ')
                    })).filter(t => t.text);
                    extractTodoPreview(tasks);
                }
            }

            // 3. Fallback: legacy item.todoHTML
            if (todoPreview === "No tasks" && item.todoHTML) {
                const parser = new DOMParser();
                const doc = parser.parseFromString(item.todoHTML, 'text/html');
                const tasks = Array.from(doc.body.querySelectorAll('div')).map(d => d.innerText.trim()).filter(t => t);
                extractTodoPreview(tasks.map(t => ({ text: t, checked: false })));
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
                dateInfoStr = lastUpdate ? `<span style="font-size: 10px; color: #888; ${!item.revisitActive ? 'margin-left: 8px;' : ''}">Last visited: ${lastUpdate}</span>` : '';
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
        },
        // ── Fax Log (Unified) ──────────────────────────────────────────
        //
        // Single unified view of all fax activity from sn_fax_log.
        // Entries grouped by client + date, newest first.
        // Each entry: fax type | destination | status | download | actions
        // ───────────────────────────────────────────────────────────────────

        renderFaxLog() {
            const w = document.getElementById('sn-dashboard');
            if (!w) return;
            const container = w.querySelector('#dash-faxlog-content');
            if (!container) return;

            // Auto-create any pending LAs for the current SF page
            this._tryAutoCreatePendingLAs();

            // One-time migration of old-format filenames in the cache
            if (!GM_getValue('sn_fax_pdf_cache_migrated', false)) {
                this._migrateGeneratedPdfsCache();
                GM_setValue('sn_fax_pdf_cache_migrated', true);
            }

            const faxLog = GM_getValue('sn_fax_log', []);
            const generatedPdfs = GM_getValue('sn_fax_generated_pdfs', []);

            if (faxLog.length === 0) {
                container.innerHTML = '<div style="text-align:center; color:#888; margin-top:40px; padding:20px;">No fax entries yet.</div>';
                return;
            }

            let html = '<div style="display:flex; flex-direction:column; gap:6px; overflow-y:auto; flex:1; padding:6px; font-size:12px;">';

            html += '<div style="font-weight:bold; color:var(--sn-primary-dark); padding:6px 0 4px; border-bottom:2px solid #888; margin-top:4px;">';
            html += `<span>📋 Recent Fax History (${faxLog.length})</span>`;
            html += '</div>';

            // Group by client + date, sorted newest first
            const sorted = [...faxLog].sort((a, b) => new Date(b.dateTime) - new Date(a.dateTime));
            const groups = new Map();
            sorted.forEach(entry => {
                const date = new Date(entry.dateTime);
                const dateStr = date.toLocaleDateString();
                const groupKey = `${entry.clientId || entry.clientName || 'unknown'}||${dateStr}`;
                if (!groups.has(groupKey)) {
                    groups.set(groupKey, {
                        clientId: entry.clientId,
                        clientName: entry.clientName || 'Unknown',
                        dateStr,
                        latestTime: date.getTime(),
                        entries: []
                    });
                }
                groups.get(groupKey).entries.push(entry);
            });
            const sortedGroups = Array.from(groups.values()).sort((a, b) => b.latestTime - a.latestTime);

            sortedGroups.forEach(group => {
                const matterId = group.clientId;
                const count = group.entries.length;
                html += `
                    <div class="sn-fax-group" style="margin-bottom:4px;">
                        <div class="sn-fax-group-header" data-matterid="${matterId || ''}" style="display:flex; align-items:center; justify-content:space-between; padding:6px 8px; background:var(--sn-bg-light); border-radius:3px; cursor:${matterId ? 'pointer' : 'default'}; font-weight:bold; font-size:12px; color:var(--sn-primary-dark);">
                            <span>${this._escHtml(group.clientName)}</span>
                            <span style="font-size:10px; color:#888; font-weight:normal;">${group.dateStr}${count > 1 ? ` (${count})` : ''}</span>
                        </div>
                        <div style="margin-left:12px;">
                `;
                group.entries.forEach(entry => {
                    const timeStr = new Date(entry.dateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    const faxLabel = entry.faxLabel || entry.faxType || 'Fax';
                    const destination = this._getFaxDestination(entry);
                    const statusBadge = this._getFaxStatusBadge(entry);
                    const downloadBtnsHtml = this._buildFaxDownloadButtons(entry, generatedPdfs);
                    html += `
                        <div class="sn-fax-entry" data-matterid="${matterId || ''}" data-entry-id="${this._escHtml(entry.id || '')}" style="display:flex; align-items:center; padding:4px 8px; border-bottom:1px solid var(--sn-bg-light); cursor:${matterId ? 'pointer' : 'default'}; gap:6px; flex-wrap:wrap;">
                            <span style="font-size:11px; color:#555; flex-shrink:0;">${this._escHtml(faxLabel)}</span>
                            <span style="display:flex; align-items:center; gap:4px; flex-shrink:0;">${downloadBtnsHtml}${statusBadge}</span>
                            <span style="font-size:10px; color:#888; flex-shrink:0;">${timeStr}</span>
                            <span style="display:flex; gap:3px; margin-left:auto; flex-shrink:0;">
                                <button class="sn-fax-create-la" data-entry-id="${this._escHtml(entry.id || '')}" title="Create Last Activity" style="padding:1px 5px; font-size:9px; cursor:pointer; border:1px solid #ff9800; border-radius:3px; background:#fff3e0; white-space:nowrap;">✓ LA</button>
                                <button class="sn-fax-mark-complete" data-entry-id="${this._escHtml(entry.id || '')}" title="Mark as Complete" style="padding:1px 5px; font-size:9px; cursor:pointer; border:1px solid #4caf50; border-radius:3px; background:#e8f5e9; white-space:nowrap;">✅</button>
                                <button class="sn-fax-delete" data-entry-id="${this._escHtml(entry.id || '')}" title="Click once to arm, again to delete" style="padding:1px 5px; font-size:9px; cursor:pointer; border:1px solid #ef5350; border-radius:3px; background:#ffebee; color:#c62828; white-space:nowrap; transition:all 0.15s;">🗑</button>
                            </span>
                        </div>
                    `;
                });
                html += `</div></div>`;
            });

            html += '</div>';

            // ── Build undo bar from trash bin ─────────────────────────
            if (this._trashBin.length > 0) {
                let undoHtml = '<div class="sn-fax-undo-bar" style="padding:6px 10px; background:#fff3e0; border-bottom:1px solid #ffcc80; font-size:11px; color:#e65100; flex-shrink:0;">';
                undoHtml += '<div style="font-weight:bold; margin-bottom:3px; font-size:10px; opacity:0.7;">🗑 Recently Deleted (' + this._trashBin.length + ') — click to restore</div>';
                const items = [...this._trashBin].reverse();
                items.forEach(t => {
                    const name = this._escHtml(t.entry.clientName || 'Unknown') + ' — ' + this._escHtml(t.entry.faxLabel || 'Fax');
                    undoHtml += '<div style="display:flex; align-items:center; justify-content:space-between; padding:2px 0; gap:6px;">';
                    undoHtml += '<span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' + name + '</span>';
                    undoHtml += '<button class="sn-undo-delete-btn" data-undo-id="' + this._escHtml(t.entry.id || '') + '" style="padding:2px 8px; cursor:pointer; background:#e65100; color:#fff; border:none; border-radius:3px; font-size:10px; font-weight:bold; flex-shrink:0;">↩ Undo</button>';
                    undoHtml += '</div>';
                });
                undoHtml += '</div>';
                html = undoHtml + html;
            }

            container.innerHTML = html;

            // ── Attach event handlers ────────────────────────────────
            const self = this;

            // Download buttons — click to download PDF
            container.querySelectorAll('.sn-fax-download-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    self._downloadFaxPdf(btn.dataset);
                });
            });

            // Click group headers / entries to open client record
            container.querySelectorAll('.sn-fax-group-header, .sn-fax-entry').forEach(el => {
                const matterId = el.dataset.matterid;
                if (matterId) {
                    el.addEventListener('click', (e) => {
                        // Don't navigate if a button was clicked
                        if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
                        GM_openInTab(`${window.location.origin}/lightning/r/kdlaw__Matter__c/${matterId}/view`, { active: false });
                    });
                }
            });

            // Delete button — double-click to delete (click once to arm, click again after 300ms to confirm)
            container.querySelectorAll('.sn-fax-delete').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const entryId = btn.dataset.entryId;
                    const isArmed = btn.dataset.snDeleteArmed === 'true';
                    if (isArmed) {
                        // Second click — actually delete
                        delete btn.dataset.snDeleteArmed;
                        btn.style.background = '#ffebee';
                        btn.style.border = '1px solid #ef5350';
                        self._deleteFaxEntry(entryId);
                    } else {
                        // First click — arm the button
                        btn.dataset.snDeleteArmed = 'true';
                        btn.style.background = '#c62828';
                        btn.style.border = '1px solid #c62828';
                        btn.style.color = '#fff';
                        // Auto-disarm after 3 seconds
                        setTimeout(() => {
                            if (btn.dataset.snDeleteArmed === 'true') {
                                delete btn.dataset.snDeleteArmed;
                                btn.style.background = '#ffebee';
                                btn.style.border = '1px solid #ef5350';
                                btn.style.color = '#c62828';
                            }
                        }, 3000);
                    }
                });
            });

            // Create LA button
            container.querySelectorAll('.sn-fax-create-la').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    self._createLAForEntry(btn.dataset.entryId);
                });
            });

            // Undo delete buttons
            container.querySelectorAll('.sn-undo-delete-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const entry = self._trashBin.find(t => t.entry.id === btn.dataset.undoId);
                    if (entry) self._undoDelete(entry.entry);
                });
            });

            // Mark Complete button
            container.querySelectorAll('.sn-fax-mark-complete').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    self._completeFaxEntry(btn.dataset.entryId);
                });
            });
        },

        /**
         * Derives DDS/FO from the entry.
         * Uses sentTo field if present, otherwise parses faxLabel.
         */
        _getFaxDestination(entry) {
            if (entry.sentTo) return entry.sentTo;
            const label = (entry.faxLabel || '').toLowerCase();
            if (label.includes('dds')) return 'DDS';
            if (label.includes('fo')) return 'FO';
            // Fallback: parse subject
            const subj = (entry.subject || '').toLowerCase();
            if (subj.includes('dds')) return 'DDS';
            if (subj.includes('ssa')) return 'FO';
            return 'FO';
        },

        _getFaxStatusBadge(entry) {
            const status = entry.status || '';
            switch (status) {
                case 'awaiting_report':
                    return '<span style="font-size:9px; padding:1px 5px; border-radius:3px; background:#e3f2fd; color:#1565c0; white-space:nowrap;">📤 Awaiting</span>';
                case 'pending_la':
                    return '<span style="font-size:9px; padding:1px 5px; border-radius:3px; background:#fff3e0; color:#e65100; white-space:nowrap;">⏳ Confirmed</span>';
                case 'failed':
                    return '<span style="font-size:9px; padding:1px 5px; border-radius:3px; background:#ffebee; color:#c62828; white-space:nowrap;">❌ Failed</span>';
                case 'completed':
                    return '<span style="font-size:9px; padding:1px 5px; border-radius:3px; background:#e8f5e9; color:#2e7d32; white-space:nowrap;">✅ Done</span>';
                default:
                    return '<span style="font-size:9px; padding:1px 5px; border-radius:3px; background:#f5f5f5; color:#888; white-space:nowrap;">' + (status || 'Sent') + '</span>';
            }
        },

        _buildFaxDownloadButtons(entry, generatedPdfs) {
            // Don't show download buttons until the iFax report is available —
            // standalone fax PDF without a receipt is useless.
            // Also allow entries that have receiptContent text — the PDF may have
            // failed to generate (html2canvas/PDFLib error) but the text was saved,
            // and the download handler can regenerate a simple PDF from it.
            const hasReceipt = entry.receiptMerged || entry.hasReceipt;
            if (!hasReceipt && !entry.receiptContent) return '';

            let buttons = '';
            const clientName = entry.clientName || '';
            const entryId = entry.id || '';
            const is1696 = entry.faxType === '1696';

            // ── 1696: Show original form download + iFax Report button ──
            if (is1696) {
                // Look for the original 1696 form (type: 'fax', faxType: '1696')
                const formPdfs = generatedPdfs.filter(p =>
                    p.clientName === clientName && p.type === 'fax' && p.faxType === '1696'
                );
                if (formPdfs.length > 0) {
                    const formPdf = formPdfs.reduce((a, b) => (a.timestamp || 0) > (b.timestamp || 0) ? a : b);
                    const formFn = this._migrateFaxFilename(formPdf.fileName || '1696 Agreement.pdf');
                    buttons += `<button class="sn-fax-download-btn"
                        data-filename="${this._escHtml(formFn)}"
                        data-entry-id="${this._escHtml(entryId)}"
                        title="Download: ${this._escHtml(formFn)}"
                        style="padding:2px 6px; cursor:pointer; border:1px solid #1976d2; border-radius:3px; background:#e3f2fd; color:#1565c0; font-size:10px; font-weight:bold; white-space:nowrap;"
                    >📄 1696 Form</button>`;
                }

                // Look for the receipt PDF (type: 'receipt', faxType: '1696')
                const receiptPdfs = generatedPdfs.filter(p =>
                    p.clientName === clientName && p.type === 'receipt' && p.faxType === '1696'
                );
                if (receiptPdfs.length > 0) {
                    const receiptPdf = receiptPdfs.reduce((a, b) => (a.timestamp || 0) > (b.timestamp || 0) ? a : b);
                    const reportFn = receiptPdf.fileName || `iFax Report.pdf`;
                    buttons += `<button class="sn-fax-download-btn"
                        data-filename="${this._escHtml(reportFn)}"
                        data-entry-id="${this._escHtml(entryId)}"
                        data-dl-type="receipt"
                        title="${this._escHtml(reportFn)}"
                        style="padding:2px 6px; cursor:pointer; border:1px solid #ff9800; border-radius:3px; background:#fff3e0; color:#e65100; font-size:10px; font-weight:bold; white-space:nowrap;"
                    >📋 iFax Report</button>`;
                }

                // ── 1696 fallback: receipt has text but no PDF (html2canvas failed) ──
                // Show a signpost button that tells user to print from Outlook.
                // NEVER generate a text-based PDF — html2canvas or nothing.
                if (receiptPdfs.length === 0 && entry.receiptContent) {
                    buttons += `<button class="sn-fax-download-btn"
                        data-filename=""
                        data-entry-id="${this._escHtml(entryId)}"
                        data-dl-type="receipt"
                        title="No PDF — print from Outlook"
                        style="padding:2px 6px; cursor:pointer; border:1px solid #ff9800; border-radius:3px; background:#fff8e1; color:#e65100; font-size:10px; font-weight:bold; white-space:nowrap;"
                    >📋 iFax Report</button>`;
                }
                return buttons;
            }

            // ── Non-1696: show merged fax PDF (receipt already merged in) ──
            const faxPdfs = generatedPdfs.filter(p =>
                p.clientName === clientName && p.type === 'fax'
            );
            const faxPdf = faxPdfs.length > 0
                ? faxPdfs.reduce((a, b) => (a.timestamp || 0) > (b.timestamp || 0) ? a : b)
                : null;

            if (faxPdf) {
                const fn = this._migrateFaxFilename(faxPdf.fileName || 'Fax.pdf');
                buttons += `<button class="sn-fax-download-btn"
                    data-filename="${this._escHtml(fn)}"
                    data-entry-id="${this._escHtml(entryId)}"
                    title="Download: ${this._escHtml(fn)}"
                    style="padding:2px 6px; cursor:pointer; border:1px solid #1976d2; border-radius:3px; background:#e3f2fd; color:#1565c0; font-size:10px; font-weight:bold; white-space:nowrap;"
                >📥 Fax + iFax Report</button>`;
                return buttons;
            }

            // ── Non-1696 fallback: check fax log entry's own pdfBase64 ──
            // generateReceiptPdf saves the merged PDF directly on the log entry
            // (entry.pdfBase64) as well as in generatedPdfs. If the cache entry
            // was evicted (50-cap) or clientName didn't match exactly, use the
            // log entry's own copy. The download handler already supports this fallback.
            if (entry.pdfBase64) {
                const fn = this._migrateFaxFilename(entry.fileName || 'Fax.pdf');
                buttons += `<button class="sn-fax-download-btn"
                    data-filename="${this._escHtml(fn)}"
                    data-entry-id="${this._escHtml(entryId)}"
                    title="Download: ${this._escHtml(fn)}"
                    style="padding:2px 6px; cursor:pointer; border:1px solid #1976d2; border-radius:3px; background:#e3f2fd; color:#1565c0; font-size:10px; font-weight:bold; white-space:nowrap;"
                >📥 Fax + iFax Report</button>`;
            }
            return buttons;
        },

        /**
         * Downloads a fax PDF via the extension's background service worker.
         * Uses ID-based lookup: finds the PDF by matching the fax log entry's
         * clientName + faxType in generatedPdfs, falls back to logEntry.pdfBase64.
         * Supports separate download types via dataset.dlType:
         *   - 'receipt': downloads just the iFax report (from entry.receiptContent or entry.pdfBase64)
         *   - 'fax' / default: downloads the fax PDF from generatedPdfs
         * Shows an error notification if the PDF blob is no longer available.
         * @param {DOMStringMap} dataset - The button's data-* attributes (filename, entryId, dlType)
         */
        async _downloadFaxPdf(dataset) {
            const filename = dataset.filename || 'Fax.pdf';
            const entryId  = dataset.entryId;
            const dlType   = dataset.dlType || 'fax';
            const faxLog = GM_getValue('sn_fax_log', []);
            const generatedPdfs = GM_getValue('sn_fax_generated_pdfs', []);
            let pdfBase64 = null;

            if (entryId) {
                const entry = faxLog.find(e => e.id === entryId);
                if (entry) {
                    if (dlType === 'receipt') {
                        // For receipt downloads: prefer separate receipt entries in generatedPdfs
                        const receiptMatches = generatedPdfs.filter(p =>
                            p.clientName === entry.clientName &&
                            p.type === 'receipt' &&
                            p.faxType === '1696'
                        );
                        if (receiptMatches.length > 0) {
                            const newest = receiptMatches.reduce((a, b) => (a.timestamp || 0) > (b.timestamp || 0) ? a : b);
                            pdfBase64 = newest.pdfBase64;
                        }

                        // Fall back to entry's own pdfBase64 (legacy merged PDFs)
                        if (!pdfBase64) {
                            pdfBase64 = entry.pdfBase64 || null;
                        }

                        // ── ⚠️  NEVER generate a text-based PDF here  ⚠️ ─────
                        // The iFax Report PDF must be rendered via html2canvas
                        // (see generateReceiptPdf in iFaxReceiptObserver.js).
                        // If html2canvas failed at receipt time, do NOT fall back
                        // to text-based generation. Instead, tell the user to
                        // print the iFax confirmation from Outlook manually.
                        if (!pdfBase64 && entry.receiptContent) {
                            if (typeof app !== 'undefined' && app.Core && app.Core.Utils) {
                                app.Core.Utils.showNotification(
                                    '📋 iFax Report PDF was not generated. Open Outlook, find the iFax confirmation email, and print it manually.',
                                    { type: 'info', duration: 10000 }
                                );
                            }
                            return;
                        }
                    } else {
                        // Default (fax): search generatedPdfs by clientName + faxType
                        const matches = generatedPdfs.filter(p =>
                            p.clientName === entry.clientName &&
                            p.type === 'fax' &&
                            (!entry.faxType || !p.faxType || p.faxType === entry.faxType)
                        );
                        if (matches.length > 0) {
                            const newest = matches.reduce((a, b) => (a.timestamp || 0) > (b.timestamp || 0) ? a : b);
                            pdfBase64 = newest.pdfBase64;
                        }
                        // Fall back to the log entry's own pdfBase64
                        if (!pdfBase64 && entry.pdfBase64) {
                            pdfBase64 = entry.pdfBase64;
                        }
                    }
                }
            }

            if (!pdfBase64) {
                if (typeof app !== 'undefined' && app.Core && app.Core.Utils) {
                    app.Core.Utils.showNotification(
                        '❌ PDF blob no longer available. Regenerate the document and fax again.',
                        { type: 'error', duration: 5000 }
                    );
                }
                return;
            }

            this._doDownload(pdfBase64, filename);
        },

        /**
         * Shared download helper — sends a base64 data URI to the background
         * service worker or falls back to an anchor click.
         * @param {string} pdfBase64 - Data URI of the PDF
         * @param {string} filename - Destination filename
         */
        _doDownload(pdfBase64, filename) {
            if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
                chrome.runtime.sendMessage({
                    action: 'DOWNLOAD_FILE',
                    url: pdfBase64,
                    filename: filename
                });
            } else {
                const a = document.createElement('a');
                a.href = pdfBase64;
                a.download = filename;
                a.click();
            }
        },

        /** @type {Array<{entry: Object, timestamp: number}>} Recently deleted entries for undo */
        _trashBin: [],

        _deleteFaxEntry(entryId) {
            const faxLog = GM_getValue('sn_fax_log', []);
            const idx = faxLog.findIndex(e => e.id === entryId);
            if (idx === -1) return;
            const deleted = faxLog.splice(idx, 1)[0];
            GM_setValue('sn_fax_log', faxLog);
            GM_setValue('sn_fax_log_broadcast', Date.now());

            // Also clean up any matching pending auto-LA so the banner disappears
            this._removePendingLA(entryId);

            // ── Store in trash bin for undo (keep last 10) ─────────────
            this._trashBin.push({ entry: deleted, timestamp: Date.now() });
            if (this._trashBin.length > 10) {
                this._trashBin = this._trashBin.slice(-10);
            }

            this.renderFaxLog();
        },

        _undoDelete(deletedEntry) {
            const faxLog = GM_getValue('sn_fax_log', []);
            // Avoid duplicates — check if it was somehow re-created
            if (!faxLog.some(e => e.id === deletedEntry.id)) {
                faxLog.push(deletedEntry);
                // Re-sort by timestamp descending
                faxLog.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                GM_setValue('sn_fax_log', faxLog);
                GM_setValue('sn_fax_log_broadcast', Date.now());
            }
            // Clean from trash bin
            this._trashBin = this._trashBin.filter(t => t.entry.id !== deletedEntry.id);
            this.renderFaxLog();
            if (typeof app !== 'undefined' && app.Core && app.Core.Utils) {
                app.Core.Utils.showNotification('↩ Entry restored.', { type: 'info', duration: 2000 });
            }
        },

        _completeFaxEntry(entryId) {
            const faxLog = GM_getValue('sn_fax_log', []);
            const idx = faxLog.findIndex(e => e.id === entryId);
            if (idx === -1) return;
            faxLog[idx].status = 'completed';
            GM_setValue('sn_fax_log', faxLog);
            GM_setValue('sn_fax_log_broadcast', Date.now());

            // Also clean up any matching pending auto-LA so the banner disappears
            this._removePendingLA(entryId);

            this.renderFaxLog();
        },

        /**
         * Removes any pending auto-LA entry matching the given fax log entryId.
         * Updates GM storage and the pending-LA banner so it disappears immediately.
         * @param {string} entryId - The fax log entry ID to remove from pending list.
         */
        _removePendingLA(entryId) {
            if (!entryId) return;
            const pendingLAs = GM_getValue('sn_pending_auto_las', []);
            const before = pendingLAs.length;
            const remaining = pendingLAs.filter(p => p.entryId !== entryId);
            if (remaining.length === before) return; // nothing changed
            GM_setValue('sn_pending_auto_las', remaining);
            this._updatePendingLABanner();
        },

        /**
         * Checks if the current SF page matches any pending auto-LAs and
         * creates them automatically using TaskAutomation. Called when:
         *  - A remote tab pushes new pending LAs (via GM listener)
         *  - The fax log tab is rendered
         *  - The user navigates to a client page
         *
         * Only fires once per entry — removes from pending list after creation.
         */
        async _tryAutoCreatePendingLAs() {
            // Guard: prevent concurrent runs (e.g., URL poll + GM listener firing together)
            if (this._isCreatingLA) return;
            this._isCreatingLA = true;
            try {
                const pendingLAs = GM_getValue('sn_pending_auto_las', []);
                if (!pendingLAs.length) return;

                // Extract current SF matter ID from URL
                const href = window.location.href;
                const sfMatch = href.match(/kdlaw__Matter__c\/([a-zA-Z0-9]{15,18})/);
                const currentClientId = sfMatch ? sfMatch[1] : null;
                if (!currentClientId) return; // Not on a matter page

                const TA = app.Automation && app.Automation.TaskAutomation;
                if (!TA) return; // TaskAutomation not available

                const remaining = [];
                let changed = false;

                for (const pending of pendingLAs) {
                    // Normalize: pending.clientId might be 15 or 18 chars
                    if (pending.clientId !== currentClientId &&
                        pending.clientId.slice(0, 15) !== currentClientId.slice(0, 15)) {
                        remaining.push(pending);
                        continue;
                    }

                    // ── Max retry guard: drop after 3 failed attempts ─────────
                    const retryCount = pending._retryCount || 0;
                    if (retryCount >= 3) {
                        console.warn("[Dashboard] Dropping pending LA — max retries reached:", pending.clientName, pending.faxLabel);
                        changed = true;
                        continue;
                    }

                    // ── LA SUBJECT/CONTENT CONVENTION (DO NOT CHANGE) ──────────
                    // Subject: "Submitted to {destination}"   e.g. "Submitted to SSA"
                    // Content: "Faxed {doc type} to {destination}" + receipt text
                    // See FaxPanel._buildDraftLA() for the canonical template.
                    // ─────────────────────────────────────────────────────────────
                    console.log("[Dashboard] 🤖 Auto-creating LA for:", pending.clientName, pending.faxLabel);
                    try {
                        // Skip if already completed (prevents duplicate LA creation)
                        const currentLog = GM_getValue('sn_fax_log', []);
                        const existingEntry = currentLog.find(e => e.id === pending.entryId);
                        if (existingEntry && existingEntry.status === 'completed') {
                            console.log("[Dashboard] Skipping — already completed:", pending.clientName, pending.faxLabel);
                            changed = true;
                            continue;
                        }

                        // If logActivity is false, clear the pending entry without creating an LA
                        if (pending.logActivity === false) {
                            console.log("[Dashboard] Skipping LA creation — log toggle was off:", pending.clientName, pending.faxLabel);
                            changed = true;
                            continue;
                        }

                        const panel = await TA.clickLastActivity();
                        await TA.fillSubject(pending.subject || 'Fax Submitted', panel);
                        await TA.fillComment(pending.content || 'Fax sent successfully.', panel);
                        await TA.clickSaveButton(500, panel);

                        // Update fax log entry status
                        const faxLog = GM_getValue('sn_fax_log', []);
                        const entry = faxLog.find(e => e.id === pending.entryId);
                        if (entry) {
                            entry.status = 'completed';
                            GM_setValue('sn_fax_log', faxLog);
                        }
                        changed = true;

                        app.Core.Utils.showNotification(
                            `✅ Auto-created LA: ${pending.faxLabel} — ${pending.clientName}`,
                            { type: 'info' }
                        );
                    } catch (err) {
                        const retries = (pending._retryCount || 0) + 1;
                        console.warn(`[Dashboard] Auto-LA creation failed (attempt ${retries}/3):`, err.message);
                        pending._retryCount = retries;
                        remaining.push(pending); // Keep for retry
                    }

                    // Small delay between multiple LAs
                    await app.Core.Utils.delay(800);
                }

                if (changed) {
                    GM_setValue('sn_fax_log_broadcast', Date.now());
                    // Refresh fax log if visible
                    if (this.activeTab === 'faxlog') {
                        this.renderFaxLog();
                    }
                }
                GM_setValue('sn_pending_auto_las', remaining);
            } finally {
                this._isCreatingLA = false;
                // Update the persistent banner based on remaining pending entries
                this._updatePendingLABanner();
            }
        },

        async _createLAForEntry(entryId) {
            const faxLog = GM_getValue('sn_fax_log', []);
            const entry = faxLog.find(e => e.id === entryId);
            if (!entry) return;

            // ── Allow re-creating LA even if 'completed' ───────────────
            // The ✅ Mark Complete button sets status to 'completed' but does
            // NOT create an LA. The user clicking ✓ LA means they want to log
            // it now regardless of current status. Allow it.
            if (entry.status === 'completed') {
                console.log("[Dashboard] Entry marked complete but no LA logged yet — allowing LA creation.");
            }

            // ── Tab guard: verify we're on the correct client page ──────
            const href = window.location.href;
            const sfMatch = href.match(/kdlaw__Matter__c\/([a-zA-Z0-9]{15,18})/);
            const currentClientId = sfMatch ? sfMatch[1] : null;
            if (!currentClientId || (
                entry.clientId !== currentClientId &&
                entry.clientId.slice(0, 15) !== currentClientId.slice(0, 15)
            )) {
                app.Core.Utils.showNotification(
                    '⚠️ Navigate to this client\'s matter page first to create LA.',
                    { type: 'error', duration: 4000 }
                );
                return;
            }

            const TA = app.Automation && app.Automation.TaskAutomation;
            if (!TA) {
                app.Core.Utils.showNotification('TaskAutomation not available. Open the client page first.', { type: 'error' });
                return;
            }

            try {
                // LA SUBJECT/CONTENT CONVENTION (DO NOT CHANGE):
                // Subject: "Submitted to {destination}"   e.g. "Submitted to SSA"
                // Content: "Faxed {doc type} to {destination}" + receipt text
                const subject = entry.subject || 'Fax Submitted';
                const content = entry.content && entry.receiptContent
                    ? `${entry.content}\n\n${entry.receiptContent}`
                    : (entry.content || 'Fax sent');
                const panel = await TA.clickLastActivity();
                await TA.fillSubject(subject, panel);
                await TA.fillComment(content, panel);
                await TA.clickSaveButton(500, panel);

                entry.status = 'completed';
                GM_setValue('sn_fax_log', faxLog);
                GM_setValue('sn_fax_log_broadcast', Date.now());
                this.renderFaxLog();
                app.Core.Utils.showNotification('✅ Last Activity created', { type: 'info' });
            } catch (err) {
                console.error('[FaxLog] LA error:', err);
                app.Core.Utils.showNotification('Error: ' + err.message, { type: 'error' });
            }
        },

        /**
         * Migrates old-format fax filenames to the new format.
         * Handles legacy entries in sn_fax_generated_pdfs that still have
         * "To Be Faxed/" prefix. Strips the prefix so the download name is clean.
         * @param {string} filename
         * @returns {string}
         */
        _migrateFaxFilename(filename) {
            if (!filename) return filename;
            // Strip "To Be Faxed/" prefix from legacy cached entries
            return filename.replace(/^To Be Faxed\//i, '');
        },

        /**
         * One-time migration: rewrites all old-format filenames in the
         * sn_fax_generated_pdfs cache to the new "{Reversed Name} - ..." format.
         * Called once from renderFaxLog.
         */
        _migrateGeneratedPdfsCache() {
            const generatedPdfs = GM_getValue('sn_fax_generated_pdfs', []);
            const FaxPanel = app.Tools && app.Tools.FaxPanel;
            if (!FaxPanel || !FaxPanel._buildFaxFileName || !FaxPanel._formatClientName) return;

            let changed = false;
            for (const entry of generatedPdfs) {
                if (!entry.clientName || !entry.faxType) continue;
                const reversedName = FaxPanel._formatClientName(entry.clientName);
                // Already follows new format — skip
                if (entry.fileName && entry.fileName.startsWith(reversedName)) continue;

                const date = new Date(entry.timestamp || Date.now());
                const dateStr = date.toLocaleDateString('en-US', {
                    month: 'short', day: '2-digit', year: 'numeric'
                }).replace(/\//g, '-');
                const sentTo = FaxPanel._getDefaultSentTo(entry.faxType);
                const hasReceipt = entry.hasReceipt || false;
                entry.fileName = FaxPanel._buildFaxFileName(
                    entry.clientName,
                    entry.faxType,
                    sentTo,
                    dateStr,
                    hasReceipt
                );
                changed = true;
            }

            if (changed) {
                GM_setValue('sn_fax_generated_pdfs', generatedPdfs);
                console.log('[Dashboard] ✅ Migrated old fax PDF filenames to new format.');
            }
        },

        // ── Pending LA Banner ─────────────────────────────────────────────

        /**
         * Shows or hides a persistent top-right banner indicating pending fax
         * Last Activity entries that need user attention. The banner stays visible
         * until the user clicks the × close button. Clicking the banner body
         * switches to the fax log tab in the Dashboard.
         *
         * Called after _tryAutoCreatePendingLAs() and on GM storage changes.
         */
        _updatePendingLABanner() {
            const BANNER_ID = 'sn-fax-la-pending-banner';
            const pendingLAs = GM_getValue('sn_pending_auto_las', []);

            // ── Auto-clean: cross-check against fax log ────────────────
            // If a pending LA entry has a matching fax log entry with status
            // 'completed', remove it from pending — the user marked it done
            // via ✅ or the LA was already auto-created in another tab.
            const faxLog = GM_getValue('sn_fax_log', []);
            let staleRemoved = false;
            const cleaned = pendingLAs.filter(p => {
                const faxEntry = faxLog.find(e => e.id === p.entryId);
                if (faxEntry && faxEntry.status === 'completed') {
                    staleRemoved = true;
                    return false; // remove from pending
                }
                return true;
            });
            if (staleRemoved) {
                console.log("[Dashboard] Auto-cleaned " + (pendingLAs.length - cleaned.length) + " stale pending LA(s).");
                GM_setValue('sn_pending_auto_las', cleaned);
            }

            // Filter to only actionable pending entries
            const actionable = cleaned.filter(p => {
                if (p._retryCount >= 3) return false;
                if (p.logActivity === false) return false;
                return true;
            });

            const existing = document.getElementById(BANNER_ID);

            if (!actionable.length) {
                if (existing) existing.remove();
                return;
            }

            // Build banner content
            const count = actionable.length;
            const itemsHtml = actionable.map(p =>
                `<div style="font-size:11px; margin:2px 0; display:flex; align-items:center; gap:4px;">
                    <span>📋</span>
                    <span><strong>${this._escHtml(p.clientName || 'Unknown')}</strong> — ${this._escHtml(p.faxLabel || 'Fax')}</span>
                </div>`
            ).join('');

            // Inject animation keyframes once
            if (!document.getElementById('sn-fadein-keyframes')) {
                const style = document.createElement('style');
                style.id = 'sn-fadein-keyframes';
                style.textContent = `@keyframes snFadeIn { from { opacity:0; transform:translateY(-10px); } to { opacity:1; transform:translateY(0); } }`;
                document.head.appendChild(style);
            }

            const bannerHtml = `
                <div style="display:flex; align-items:flex-start; gap:8px;">
                    <div style="flex:1; min-width:0;">
                        <div style="font-weight:bold; font-size:12px; margin-bottom:2px;">⏳ Fax LA Pending (${count})</div>
                        ${itemsHtml}
                        <div style="font-size:10px; color:#ffcc80; margin-top:4px;">Open this client's matter page to auto-log</div>
                    </div>
                    <button id="${BANNER_ID}-close" style="background:none; border:none; color:#fff; cursor:pointer; font-size:18px; padding:0 2px; line-height:1; opacity:0.8; flex-shrink:0;">×</button>
                </div>
            `;

            if (existing) {
                existing.innerHTML = bannerHtml;
            } else {
                const banner = document.createElement('div');
                banner.id = BANNER_ID;
                banner.innerHTML = bannerHtml;
                banner.style.cssText = `
                    position: fixed;
                    top: 12px;
                    right: 12px;
                    z-index: 2147483646;
                    background: #e65100;
                    color: #fff;
                    border-radius: 8px;
                    padding: 10px 14px;
                    font-family: 'Segoe UI', Arial, sans-serif;
                    font-size: 12px;
                    box-shadow: 0 4px 16px rgba(0,0,0,0.35);
                    max-width: 360px;
                    min-width: 240px;
                    cursor: pointer;
                    animation: snFadeIn 0.3s ease-out;
                    border: 1px solid rgba(255,255,255,0.15);
                `;
                document.body.appendChild(banner);
            }

            // Bind events
            const bannerEl = document.getElementById(BANNER_ID);
            if (!bannerEl) return;

            const closeBtn = document.getElementById(BANNER_ID + '-close');
            if (closeBtn) {
                closeBtn.onclick = (e) => {
                    e.stopPropagation();
                    bannerEl.remove();
                };
            }

            bannerEl.onclick = (e) => {
                if (e.target === closeBtn || (closeBtn && closeBtn.contains(e.target))) return;
                // Switch to fax log tab in Dashboard
                this.activeTab = 'faxlog';
                const dashEl = document.getElementById('sn-dashboard');
                if (dashEl) {
                    this.renderFaxLog();
                    const tabBtns = dashEl.querySelectorAll('.sn-tab-btn');
                    tabBtns.forEach(b => b.classList.remove('active'));
                    const faxLogBtn = dashEl.querySelector('[data-tab="faxlog"]');
                    if (faxLogBtn) faxLogBtn.classList.add('active');
                }
            };
        },

        // ── Utility ───────────────────────────────────────────────────────

        _timeAgo(timestamp) {
            if (!timestamp) return '';
            const diff = Date.now() - timestamp;
            const mins = Math.floor(diff / 60000);
            if (mins < 1) return 'just now';
            if (mins < 60) return mins + 'm ago';
            const hours = Math.floor(mins / 60);
            if (hours < 24) return hours + 'h ago';
            const days = Math.floor(hours / 24);
            return days + 'd ago';
        },

        _formatFax(num) {
            const digits = (num || '').replace(/\D/g, '');
            if (digits.length === 10) return digits.slice(0, 3) + '-' + digits.slice(3, 6) + '-' + digits.slice(6);
            if (digits.length === 7) return digits.slice(0, 3) + '-' + digits.slice(3);
            return num || '';
        },

        _escHtml(str) {
            if (!str) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }
    };

    app.Tools.Dashboard = Dashboard;
})();
