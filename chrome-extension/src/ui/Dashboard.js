(function () {
    const app = window.CM_App = window.CM_App || {};
    app.Tools = app.Tools || {};

    const Dashboard = {
        activeTab: 'recent',
        _dataCache: [],
        currentView: 'list',
        _outsideClickListener: null,

        _loadData() {
            const keys = GM_listValues().filter(k => k.startsWith('cn_') && !k.startsWith('cn_color') && !k.startsWith('cn_form'));
            this._dataCache = keys.map(k => {
                const d = GM_getValue(k);
                if (d && typeof d === 'object') {
                    return { id: k.replace('cn_', ''), ...d };
                }
                return null;
            }).filter(Boolean);
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

        toggle() {
            const el = document.getElementById('sn-dashboard');
            if (app.Core.Windows.toggle('sn-dashboard')) {
                if (el && el.style.display !== 'none') {
                    this.currentView = 'list';
                    this._loadData(); this.render();
                    this._addOutsideClickListener();
                } else {
                    this._removeOutsideClickListener();
                }
                return;
            }

            const w = document.createElement('div');
            w.id = 'sn-dashboard'; w.className = 'sn-window';
            const isCompact = GM_getValue('sn_dash_compact_mode', false);
            if (isCompact) w.classList.add('sn-compact-mode');
            w.style.width = '450px'; w.style.height = '600px';
            w.style.bottom = '90px'; w.style.right = '20px';
            w.style.backgroundColor = 'var(--sn-bg-lighter)'; w.style.border = '1px solid var(--sn-border)';

            w.innerHTML = `
                <div class="sn-header" style="background:var(--sn-bg-light); border-bottom:1px solid var(--sn-border); color:var(--sn-primary-dark);">
                    <span style="font-weight:bold;">KD CM1 Universal Note & Utility</span>
                    <button id="dash-close" style="background:none; border:none; color:var(--sn-primary-dark); cursor:pointer; font-weight:bold;">X</button>
                </div>
                <div id="dash-search-container" style="padding:10px; border-bottom:1px solid var(--sn-bg-light); background:var(--sn-bg-lighter);">
                    <input type="text" id="dash-search" placeholder="Search Clients..." style="width:100%; padding:8px; box-sizing:border-box; background:white; border:1px solid var(--sn-bg-light); color:#333;">
                </div>
                <div id="dash-body-wrapper" class="sn-dash-body"></div>
                <div id="dash-footer" style="padding:8px 10px; border-top:1px solid var(--sn-bg-light); display:flex; justify-content:space-between; align-items:center; font-size:11px; background:var(--sn-bg-lighter);"></div>
            `;
            document.body.appendChild(w);
            app.Core.Windows.makeDraggable(w, w.querySelector('.sn-header'));
            w.querySelector('#dash-close').onclick = () => {
                w.style.display = 'none';
                this._removeOutsideClickListener();
            };

            const searchInput = w.querySelector('#dash-search');
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
            this._addOutsideClickListener();
        },

        render() {
            const w = document.getElementById('sn-dashboard');
            const body = w.querySelector('#dash-body-wrapper');
            const footer = w.querySelector('#dash-footer');
            const search = w.querySelector('#dash-search-container');

            if (this.currentView === 'list') {
                search.style.display = 'block';
                body.innerHTML = `
                    <div class="sn-dash-sidebar">
                        <div id="tab-revisit" class="sn-dash-tab">Revisit</div>
                        <div id="tab-recent" class="sn-dash-tab">Recent</div>
                    </div>
                    <div id="dash-content" class="sn-dash-list"></div>
                `;

                w.querySelector('#tab-revisit').onclick = () => { this.activeTab = 'revisit'; this.updateSidebar(); this.renderList(); };
                w.querySelector('#tab-recent').onclick = () => { this.activeTab = 'recent'; this.updateSidebar(); this.renderList(); };

                this.updateSidebar();
                this.renderList();

                footer.innerHTML = `<span style="font-weight:bold; color:var(--sn-primary-text);">All Matters: ${this._dataCache.length}</span><button id="dash-settings-btn" style="cursor:pointer; background:var(--sn-bg-card); border:1px solid var(--sn-border); border-radius:4px; font-size:14px; color:var(--sn-primary-text); padding: 2px 6px;" title="Settings">⚙️</button>`;
                w.querySelector('#dash-settings-btn').onclick = () => { this.currentView = 'settings'; this.render(); };

                w.querySelector('#dash-search').focus();
            } else {
                search.style.display = 'none';
                body.innerHTML = `<div class="sn-dash-settings" style="padding:10px; display:flex; flex-direction:column; gap:10px; overflow-y:auto; width:100%; box-sizing:border-box;"></div>`;
                this.renderSettings(body.querySelector('.sn-dash-settings'));

                footer.innerHTML = `<button id="dash-back-btn" style="cursor:pointer; background:var(--sn-bg-lighter); border:1px solid var(--sn-border); border-radius:4px; padding:5px 15px; color:var(--sn-primary-text); font-weight:bold;">⬅ Back to List</button>`;
                w.querySelector('#dash-back-btn').onclick = () => { this.currentView = 'list'; this.render(); };
            }
        },

        renderSettings(container) {
            const cm1 = GM_getValue('sn_global_cm1', '');
            const ext = GM_getValue('sn_global_ext', '');
            const uiTheme = GM_getValue('sn_ui_theme', 'Teal');
            const useTzColor = GM_getValue('sn_tz_note_color', true);
            const followTheme = GM_getValue('sn_note_follow_theme', true);
            const defaultNoteColor = GM_getValue('sn_note_default_color', app.Core.Themes['Yellow'].lighter);
            const isCompact = GM_getValue('sn_dash_compact_mode', false);
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
                </div>

                <div style="border-top:1px solid var(--sn-bg-light); margin:5px 0;"></div>

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

                <div style="border-top:1px solid var(--sn-bg-light); margin:5px 0;"></div>

                <div style="display:flex; flex-direction:column; gap:2px; margin-bottom: 8px;">
                    <label style="font-weight:bold; color:var(--sn-primary-text);">Display Options</label>
                    <div style="display: flex; align-items: center;">
                        <input type="checkbox" id="sn-setting-compact-mode" ${isCompact ? 'checked' : ''} style="margin-right: 6px;">
                        <label for="sn-setting-compact-mode" style="font-size: 11px; cursor: pointer; user-select: none;">Compact List Mode</label>
                    </div>
                </div>

                <div style="border-top:1px solid var(--sn-bg-light); margin:5px 0;"></div>

                <div style="display:flex; flex-direction:column; gap:4px; margin-bottom: 8px;">
                    <label style="font-weight:bold; color:var(--sn-primary-text);">Data Management</label>
                    <button id="set-export" style="padding:6px; cursor:pointer; background:#fff; border:1px solid var(--sn-border); color:var(--sn-primary-text); border-radius:3px;">📤 Export / Backup Data</button>
                    <button id="set-import" style="padding:6px; cursor:pointer; background:#fff; border:1px solid var(--sn-border); color:var(--sn-primary-text); border-radius:3px;">📥 Import Data</button>
                </div>

                <div style="border-top:1px solid #ccc; margin:5px 0;"></div>

                <button id="set-reset-colors" style="padding:8px; cursor:pointer; background:#fff3e0; border:1px solid #ffb74d; color:#e65100; border-radius:3px; font-weight:bold; margin-bottom:5px;">Reset Color Preferences</button>
                <button id="set-reset" style="padding:8px; cursor:pointer; background:#ffebee; border:1px solid #ef5350; color:#c62828; border-radius:3px; font-weight:bold;">Reset Window Positions</button>
            `;

            container.querySelector('#set-cm').onchange = (e) => GM_setValue('sn_global_cm1', e.target.value);
            container.querySelector('#set-ext').onchange = (e) => GM_setValue('sn_global_ext', e.target.value);

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

            const compactCheck = container.querySelector('#sn-setting-compact-mode');
            compactCheck.onchange = (e) => {
                const isChecked = e.target.checked;
                GM_setValue('sn_dash_compact_mode', isChecked);
                const dash = document.getElementById('sn-dashboard');
                if (dash) {
                    dash.classList.toggle('sn-compact-mode', isChecked);
                }
            };

            container.querySelector('#set-export').onclick = () => {
                const data = {}; GM_listValues().forEach(k => data[k] = GM_getValue(k));
                GM_setClipboard(JSON.stringify(data)); alert("Data copied to clipboard!");
            };
            container.querySelector('#set-import').onclick = () => {
                const i = prompt("Paste JSON Data:");
                if (i) {
                    try {
                        const d = JSON.parse(i);
                        const keys = Object.keys(d);
                        const existing = GM_listValues();
                        const overwrite = keys.filter(k => existing.includes(k)).length;

                        if (confirm(`Importing ${keys.length} records.\n\nNew: ${keys.length - overwrite}\nOverwrite: ${overwrite}\n\nProceed?`)) {
                            keys.forEach(k => GM_setValue(k, d[k]));
                            alert("Import successful. Reload page.");
                        }
                    } catch (e) { alert("Invalid JSON."); }
                }
            };
            container.querySelector('#set-reset-colors').onclick = () => {
                if (confirm("Reset all color preferences to default?")) {
                    GM_deleteValue('sn_ui_theme');
                    GM_deleteValue('sn_tz_note_color');
                    GM_deleteValue('sn_note_follow_theme');
                    GM_deleteValue('sn_note_default_color');
                    app.Core.Styles.applyTheme('Teal');
                    this.renderSettings(container);
                }
            };
            container.querySelector('#set-reset').onclick = () => {
                if (confirm("Move all windows to top-left and reset defaults?")) {
                    ['sn-client-note', 'sn-fo-form', 'sn-dds-form', 'sn-med-popout', 'sn-ssd-viewer', 'sn-fax-panel', 'sn-ir-panel'].forEach(id => {
                        const el = document.getElementById(id);
                        if (el) { el.style.top = '10px'; el.style.left = '10px'; }
                    });
                    // Reset dashboard separately
                    const dash = document.getElementById('sn-dashboard');
                    if (dash) {
                        dash.style.top = ''; dash.style.left = '';
                        dash.style.bottom = '90px'; dash.style.right = '20px';
                    }
                    ['CN', 'FO', 'DDS', 'MED', 'FAX', 'IR'].forEach(k => GM_deleteValue('def_pos_' + k));
                }
            };
        },

        updateSidebar() {
            const w = document.getElementById('sn-dashboard');
            if (!w) return;
            w.querySelectorAll('.sn-dash-tab').forEach(t => t.classList.remove('active'));
            w.querySelector(`#tab-${this.activeTab}`).classList.add('active');
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
            container.innerHTML = '';

            let items = [...this._dataCache];

            if (this.activeTab === 'revisit') {
                items = items.filter(i => i.revisitActive).sort((a, b) => {
                    if (a.revisit && b.revisit) return new Date(a.revisit) - new Date(b.revisit);
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
            const query = w.querySelector('#dash-search').value.toLowerCase();
            container.innerHTML = '';
            const items = this._dataCache.filter(i => i.name && i.name.toLowerCase().includes(query));

            if (items.length === 0) container.innerHTML = '<div style="text-align:center; color:#888; margin-top:20px;">No matches found.</div>';
            items.forEach(item => this.createRow(container, item));
            this.updateFocus(container.querySelectorAll('.sn-list-item'), 0);
        },

        createRow(container, item) {
            const status = (item.level && item.type) ? `${item.level} - ${item.type}` : (item.level || item.type || "No Status");

            let todoPreview = "No tasks";
            if (item.todoHTML) {
                const parser = new DOMParser();
                const doc = parser.parseFromString(item.todoHTML, 'text/html');
                const tasks = Array.from(doc.body.querySelectorAll('div')).map(d => d.innerText.trim()).filter(t => t);
                if (tasks.length > 0) todoPreview = tasks.slice(0, 2).map(t => `<div class="sn-todo-line">• ${t}</div>`).join('');
            }

            const revisitMarker = item.revisitActive && item.revisit ? `<span style="color:red; font-size:14px; line-height:0;">•</span> <span style="color:red; font-size:10px; font-weight:bold;">Due: ${new Date(item.revisit).toLocaleDateString()}</span>` : (item.revisitActive ? '<span style="color:red; font-size:14px; line-height:0;">•</span>' : '');
            const div = document.createElement('div');
            div.className = 'sn-list-item';
            div.innerHTML = `
                <div class="sn-item-left">
                    <div class="sn-item-name">${item.name} ${revisitMarker}</div>
                    <div class="sn-item-status">${status}</div>
                </div>
                <div class="sn-item-right">
                    ${todoPreview}
                </div>
            `;
            div.onclick = () => { window.open(`${window.location.origin}/lightning/r/kdlaw__Matter__c/${item.id}/view`, '_blank'); };
            container.appendChild(div);
        }
    };

    app.Tools.Dashboard = Dashboard;
})();
