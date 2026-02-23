(function(app) {
    'use strict';

    // ==========================================
    // 5. CONTACT FORMS MODULE
    // ==========================================
    const ContactForms = {
        formConfigs: {
            'FO': {
                title: 'FO Contact',
                body: `
                    <div style="padding:10px; display:flex; flex-direction:column; gap:8px;">
                        <div style="display:flex; gap:10px; align-items:center;">
                            <input type="text" id="fo-rep" placeholder="Rep Name" style="width:120px; border:1px solid #ccc; padding:3px;">
                            <label><input type="checkbox" id="fo-proc"> Processed</label>
                            <label><input type="checkbox" id="fo-1696"> 1696</label>
                            <label><input type="checkbox" id="fo-other"> Other Rep</label>
                            <label><input type="checkbox" id="fo-wet"> Wet Sig</label>
                        </div>
                        <div style="display:flex; gap:5px; align-items:center;">
                            <select id="fo-claim-lvl" style="background:white; border:1px solid #ccc;"><option>Claim Level</option><option>IA</option><option>Recon</option></select>
                            <select id="fo-claim-typ" style="background:white; border:1px solid #ccc;"><option>Claim Type</option><option>T2</option><option>T16</option><option>Concurrent</option></select>
                            <label><input type="checkbox" id="fo-ptr"> PTR</label>
                        </div>
                        <textarea id="fo-details" placeholder="Details..." style="width:100%; border:1px solid #ccc; padding:3px; resize:vertical; height:40px;"></textarea>
                        <div style="display:flex; gap:10px; align-items:center;">
                            <label><input type="checkbox" id="fo-attest"> Attested</label>
                            <label><input type="checkbox" id="fo-dds"> Transferred to DDS</label>
                            <input type="text" id="fo-trans-txt" placeholder="Date Transferred" style="flex-grow:1; border:1px solid #ccc; padding:3px;">
                        </div>
                        <div style="display:flex; gap:5px;">
                            <input type="text" id="fo-ifd" placeholder="IFD" style="flex-grow:1; border:1px solid #ccc; padding:3px; text-align:center;">
                            <input type="text" id="fo-aod" placeholder="AOD" style="flex-grow:1; border:1px solid #ccc; padding:3px; text-align:center;">
                            <input type="text" id="fo-dli" placeholder="DLI" style="flex-grow:1; border:1px solid #ccc; padding:3px; text-align:center;">
                        </div>
                        <div style="margin-top:5px; border:2px solid var(--sn-primary); background:rgba(255,255,255,0.6);">
                            <div style="background:var(--sn-primary); color:white; font-weight:bold; text-align:center; padding:2px; font-size:11px;">DECISION</div>
                            <div style="padding:5px; display:flex; flex-direction:column; gap:5px;">
                                <div style="display:flex; align-items:center; gap:5px;">
                                    <strong style="width:30px;">T2:</strong>
                                    <label><input type="checkbox" id="fo-t2-app"> Appr</label>
                                    <label><input type="checkbox" id="fo-t2-den"> Den</label>
                                    <input type="text" id="fo-t2-date" placeholder="Date" style="width:100px; border:1px solid #ccc;">
                                    <input type="text" id="fo-t2-reason" placeholder="Reason" style="flex-grow:1; border:1px solid #ccc;">
                                </div>
                                <div style="display:flex; align-items:center; gap:5px;">
                                    <strong style="width:30px;">T16:</strong>
                                    <label><input type="checkbox" id="fo-t16-app"> Appr</label>
                                    <label><input type="checkbox" id="fo-t16-den"> Den</label>
                                    <input type="text" id="fo-t16-date" placeholder="Date" style="width:100px; border:1px solid #ccc;">
                                    <input type="text" id="fo-t16-reason" placeholder="Reason" style="flex-grow:1; border:1px solid #ccc;">
                                </div>
                            </div>
                        </div>
                    </div>`
            },
            'DDS': {
                title: 'DDS Contact',
                body: `
                    <div style="padding:10px; display:flex; flex-direction:column; gap:8px;">
                        <div style="display:flex; gap:10px; align-items:center;">
                            <input type="text" id="dds-rep" placeholder="Rep Name" style="width:110px; border:1px solid #ccc; padding:3px;">
                            <label><input type="checkbox" id="dds-1696"> 1696</label>
                            <label><input type="checkbox" id="dds-other"> Other Rep</label>
                            <div style="flex-grow:1;"></div>
                            <input type="text" id="dds-trans" placeholder="Date Transferred" style="width:120px; border:1px solid #ccc; padding:3px; text-align:right;">
                        </div>
                        <textarea id="dds-details" placeholder="Details..." style="width:100%; border:1px solid #ccc; padding:3px; resize:vertical; height:40px;"></textarea>
                        <div style="display:flex; gap:5px; align-items:center;">
                            <label><input type="checkbox" id="dds-assign"> Assigned</label>
                            <input type="text" id="dds-assign-txt" style="flex-grow:1; border:1px solid #ccc; padding:3px;">
                            <label><input type="checkbox" id="dds-predev"> Pre-Dev Unit</label>
                        </div>
                        <div style="display:flex; gap:10px; align-items:center;">
                            <label><input type="checkbox" id="dds-wh"> WH</label>
                            <label><input type="checkbox" id="dds-fr"> FR</label>
                            <label><input type="checkbox" id="dds-rec"> Received</label>
                            <label><input type="checkbox" id="dds-prov"> Med Provider</label>
                            <label><input type="checkbox" id="dds-ce"> CE Scheduled</label>
                        </div>
                        <textarea id="dds-ce-box" style="display:none; height:50px; width:100%; border:1px solid red; background:white;" placeholder="CE Details..."></textarea>
                        <div style="display:flex; gap:5px; align-items:center;">
                            <strong>Outstanding:</strong>
                            <input type="text" id="dds-out-txt" style="flex-grow:1; border:1px solid #ccc; padding:3px;">
                        </div>
                    </div>`
            }
        },

        create(type) {
            const id = type === 'FO' ? 'sn-fo-form' : 'sn-dds-form';
            if (document.getElementById(id)) { app.Core.Windows.toggle(id); return; }

            const config = this.formConfigs[type];
            if (!config) return;

            const sidebarData = app.Core.Scraper.getSidebarData();
            const clientName = sidebarData.name || "Unknown";
            const defPos = GM_getValue('def_pos_' + type, { width: '500px', height: 'auto', top: '350px', left: '20px' });

            const w = document.createElement('div');
            w.id = id; w.className = 'sn-window';
            w.style.width = defPos.width; w.style.height = defPos.height;
            w.style.top = defPos.top; w.style.left = defPos.left;
            w.style.backgroundColor = 'var(--sn-bg-lighter)'; w.style.border = '1px solid var(--sn-border)';

            w.innerHTML = `
                <div class="sn-header" id="sn-${type.toLowerCase()}-header" style="background:var(--sn-bg-light); border-bottom:1px solid var(--sn-border);">
                    <div style="display:flex; align-items:center; gap:5px;">
                         <button id="sn-${type.toLowerCase()}-min" style="cursor:pointer; background:none; border:none; font-weight:bold;">_</button>
                         <span style="font-weight:bold; color:var(--sn-primary-dark);">${config.title} - ${clientName}</span>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span id="${type.toLowerCase()}-undo" style="display:none; cursor:pointer; font-size:11px; font-weight:bold; color:#444;">UNDO</span>
                        <span id="${type.toLowerCase()}-clear" style="cursor:pointer; font-size:11px; font-weight:bold; color:var(--sn-primary-dark);">CLEAR</span>
                        <button id="sn-${type.toLowerCase()}-close" style="background:none; border:none; font-weight:bold; cursor:pointer; font-size:14px; margin-left:5px;">X</button>
                    </div>
                </div>
                ${config.body}
                <div style="padding:10px; border-top:1px solid var(--sn-border); display:flex; flex-direction:column; flex-grow:1;">
                    <textarea id="${type.toLowerCase()}-notes" style="flex-grow:1; min-height:60px; border:1px solid #ccc; background:rgba(255,255,255,0.8); resize:vertical;" placeholder="Additional Notes..."></textarea>
                    <div id="${type.toLowerCase()}-msg" style="height:15px; font-size:10px; color:red; text-align:right;"></div>
                </div>
                <div class="sn-resizer rs-n"></div><div class="sn-resizer rs-s"></div>
                <div class="sn-resizer rs-e"></div><div class="sn-resizer rs-w"></div>
                <div class="sn-resizer rs-ne"></div><div class="sn-resizer rs-nw"></div>
                <div class="sn-resizer rs-se"></div><div class="sn-resizer rs-sw"></div>
            `;
            document.body.appendChild(w);
            app.Core.Windows.setup(w, w.querySelector(`#sn-${type.toLowerCase()}-min`), w.querySelector('.sn-header'), type);

            if (type === 'DDS') {
                const ceCheck = w.querySelector('#dds-ce'), ceBox = w.querySelector('#dds-ce-box');
                ceCheck.onchange = () => { ceBox.style.display = ceCheck.checked ? 'block' : 'none'; };
            }

            const clearBtn = w.querySelector(`#${type.toLowerCase()}-clear`);
            const undoBtn = w.querySelector(`#${type.toLowerCase()}-undo`);
            const msgSpan = w.querySelector(`#${type.toLowerCase()}-msg`);

            let holdTimer; let undoBuffer = null;

            clearBtn.onmousedown = () => {
                clearBtn.style.color = "red"; clearBtn.innerText = "HOLD...";
                holdTimer = setTimeout(() => {
                    const inputs = w.querySelectorAll('input, select, textarea');
                    undoBuffer = {};
                    inputs.forEach(el => undoBuffer[el.id] = (el.type === 'checkbox' ? el.checked : el.value));
                    inputs.forEach(el => { if (el.type === 'checkbox') el.checked = false; else el.value = ''; });
                    clearBtn.innerText = "CLEAR"; clearBtn.style.color = "var(--sn-primary-dark)";
                    undoBtn.style.display = "inline"; msgSpan.innerText = "Form Cleared";
                    setTimeout(() => msgSpan.innerText = "", 2000);
                }, 2000);
            };

            const resetClearBtn = () => { clearTimeout(holdTimer); if(clearBtn.innerText === "HOLD...") { clearBtn.innerText = "CLEAR"; clearBtn.style.color = "var(--sn-primary-dark)"; }};
            clearBtn.onmouseup = resetClearBtn; clearBtn.onmouseleave = resetClearBtn;

            undoBtn.onclick = () => {
                if (undoBuffer) {
                    const inputs = w.querySelectorAll('input, select, textarea');
                    inputs.forEach(el => { if (undoBuffer[el.id] !== undefined) { if (el.type === 'checkbox') el.checked = undoBuffer[el.id]; else el.value = undoBuffer[el.id]; } });
                    undoBtn.style.display = "none"; msgSpan.innerText = "Restored"; setTimeout(() => msgSpan.innerText = "", 2000);
                }
            };

            w.querySelector(`#sn-${type.toLowerCase()}-close`).onclick = () => { w.style.display = 'none'; app.Core.Windows.updateTabState(w.id); };
        }
    };

    // ==========================================
    // 6. SSD FORM VIEWER
    // ==========================================
    const SSDFormViewer = {
        async toggle() {
            const id = 'sn-ssd-viewer';
            const existing = document.getElementById(id);
            const clientId = app.AppObserver.getClientId();

            const scrapeAndSave = async () => {
                if (!clientId) return;

                const contentDiv = document.getElementById('ssd-content');
                if (contentDiv) contentDiv.innerHTML = '<div style="padding:20px; text-align:center; color:#e65100;">⏳ Switching tabs & scraping...</div>';

                const data = await app.Core.Scraper.getFullSSDData();

                const hasContent = Object.values(data).some(val => val && val.trim().length > 0);
                if (!hasContent) {
                    console.warn("[SSDFormViewer] ⚠️ Scraper found no data. Skipping save to prevent overwrite.");
                    return;
                }

                this.renderContent(existing || document.getElementById(id), data);
                app.Features.ClientNote.updateAndSaveData(clientId, data);
            };

            if (existing) {
                if (existing.style.display === 'none') app.Core.Windows.toggle(id);
                await scrapeAndSave();
                return;
            }

            const w = document.createElement('div');
            w.id = id; w.className = 'sn-window';
            w.style.width = '400px'; w.style.height = 'auto'; w.style.maxHeight = '600px';
            w.style.top = '100px'; w.style.left = '100px';
            w.style.backgroundColor = 'var(--sn-bg-lighter)'; w.style.border = '1px solid var(--sn-border)';

            w.innerHTML = `
                <div class="sn-header" style="background:var(--sn-bg-light); border-bottom:1px solid var(--sn-border); color:var(--sn-primary-text);">
                    <span style="font-weight:bold;">SSD App Form Data</span>
                    <button id="ssd-close" style="background:none; border:none; color:var(--sn-primary-text); cursor:pointer; font-weight:bold;">X</button>
                </div>
                <div id="ssd-content" style="padding:10px; overflow-y:auto; flex-grow:1; background:#fff; min-height:200px;">
                </div>
                <div style="padding:8px; border-top:1px solid var(--sn-bg-light); display:flex; justify-content:center; align-items:center; gap:20px; background:var(--sn-bg-lighter);">
                    <label style="cursor:pointer; font-size:12px; color:var(--sn-text-main); display:flex; align-items:center;">
                        <input type="checkbox" id="ssd-autoclose-next" style="margin-right:5px;">
                        auto close next time?
                    </label>
                    <button id="ssd-close-app" style="padding:5px 10px; cursor:pointer; font-weight:bold; color:var(--sn-primary-text); border:1px solid var(--sn-border); background:white;">Close SSD App</button>
                </div>
            `;

            document.body.appendChild(w);
            app.Core.Windows.makeDraggable(w, w.querySelector('.sn-header'));

            const autoCloseCheck = w.querySelector('#ssd-autoclose-next');
            autoCloseCheck.checked = GM_getValue('sn_ssd_autoclose', false);
            autoCloseCheck.onchange = () => {
                GM_setValue('sn_ssd_autoclose', autoCloseCheck.checked);
            };

            await scrapeAndSave();

            w.querySelector('#ssd-close').onclick = () => w.remove();
            w.querySelector('#ssd-close-app').onclick = () => {
                window.close();
            };
        },

        renderContent(w, data) {
            if (!w) return;
            const container = w.querySelector('#ssd-content');
            let rows = '';

            const order = ['Address', 'Phone', 'Email', 'POB', 'Parents', 'Witness', 'Condition', 'Assistive Devices', 'Medical Provider'];

            const sortedKeys = Object.keys(data).sort((a, b) => {
                const idxA = order.indexOf(a);
                const idxB = order.indexOf(b);
                if (idxA !== -1 && idxB !== -1) return idxA - idxB;
                if (idxA !== -1) return -1;
                if (idxB !== -1) return 1;
                return a.localeCompare(b);
            });

            for (const key of sortedKeys) {
                const val = data[key];
                if (!val) continue;
                rows += `<div style="display:flex; border-bottom:1px solid var(--sn-bg-light); padding:4px;">
                    <strong style="width:120px; color:var(--sn-primary-text); font-size:11px; flex-shrink:0;">${key}:</strong>
                    <span style="flex-grow:1; font-size:11px; word-break:break-word; white-space:pre-wrap;">${val}</span>
                </div>`;
            }

            container.innerHTML = rows || '<div style="padding:10px; text-align:center; color:#999;">No relevant data found on this page.</div>';
        }
    };

    // ==========================================
    // 6. DASHBOARD MODULE
    // ==========================================
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
                <div id="dash-footer" style="padding:10px; border-top:1px solid var(--sn-bg-light); display:flex; justify-content:center; align-items:center; font-size:11px; background:var(--sn-bg-lighter);"></div>
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

                footer.innerHTML = `<button id="dash-settings-btn" style="cursor:pointer; background:none; border:none; font-size:18px; color:var(--sn-primary-text);" title="Settings">⚙️</button>`;
                w.querySelector('#dash-settings-btn').onclick = () => { this.currentView = 'settings'; this.render(); };
                
                w.querySelector('#dash-search').focus();
            } else {
                search.style.display = 'none';
                body.innerHTML = `<div class="sn-dash-settings" style="padding:15px; display:flex; flex-direction:column; gap:15px; overflow-y:auto; width:100%; box-sizing:border-box;"></div>`;
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
                <div style="display:flex; flex-direction:column; gap:3px; margin-bottom: 10px;">
                    <label style="font-weight:bold; color:var(--sn-primary-text);">Default CM & Ext</label>
                    <div style="display:flex; gap:5px;">
                        <input id="set-cm" type="text" placeholder="CM Name" value="${cm1}" style="flex:2; padding:5px; border:1px solid #ccc; border-radius:3px;">
                        <input id="set-ext" type="text" placeholder="Ext" value="${ext}" style="flex:1; padding:5px; border:1px solid #ccc; border-radius:3px;">
                    </div>
                </div>

                <div style="border-top:1px solid var(--sn-bg-light); margin:5px 0;"></div>

                <div style="display:flex; flex-direction:column; gap:3px; margin-bottom: 10px;">
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

                    <div id="sn-default-note-color-settings" style="display: block; border-top: 1px dashed var(--sn-bg-light); padding-top: 8px;">
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

                <div style="display:flex; flex-direction:column; gap:3px; margin-bottom: 10px;">
                    <label style="font-weight:bold; color:var(--sn-primary-text);">Display Options</label>
                    <div style="display: flex; align-items: center;">
                        <input type="checkbox" id="sn-setting-compact-mode" ${isCompact ? 'checked' : ''} style="margin-right: 6px;">
                        <label for="sn-setting-compact-mode" style="font-size: 11px; cursor: pointer; user-select: none;">Compact List Mode</label>
                    </div>
                </div>

                <div style="border-top:1px solid var(--sn-bg-light); margin:5px 0;"></div>

                <div style="display:flex; flex-direction:column; gap:5px; margin-bottom: 10px;">
                    <label style="font-weight:bold; color:var(--sn-primary-text);">Data Management</label>
                    <button id="set-export" style="padding:8px; cursor:pointer; background:#fff; border:1px solid var(--sn-border); color:var(--sn-primary-text); border-radius:3px;">📤 Export / Backup Data</button>
                    <button id="set-import" style="padding:8px; cursor:pointer; background:#fff; border:1px solid var(--sn-border); color:var(--sn-primary-text); border-radius:3px;">📥 Import Data</button>
                </div>

                <div style="border-top:1px solid #ccc; margin:5px 0;"></div>

                <button id="set-reset-colors" style="padding:10px; cursor:pointer; background:#fff3e0; border:1px solid #ffb74d; color:#e65100; border-radius:3px; font-weight:bold; margin-bottom:5px;">Reset Color Preferences</button>
                <button id="set-reset" style="padding:10px; cursor:pointer; background:#ffebee; border:1px solid #ef5350; color:#c62828; border-radius:3px; font-weight:bold;">Reset Window Positions</button>
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
                const data={}; GM_listValues().forEach(k => data[k] = GM_getValue(k));
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
                if(confirm("Reset all color preferences to default?")) {
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
                 items = items.filter(i => i.revisitActive).sort((a,b) => {
                     if (a.revisit && b.revisit) return new Date(a.revisit) - new Date(b.revisit);
                     return (b.timestamp || 0) - (a.timestamp || 0);
                 });
            } else {
                 items = items.sort((a,b) => (b.timestamp || 0) - (a.timestamp || 0));
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
                if (tasks.length > 0) todoPreview = tasks.slice(0,2).map(t => `<div class="sn-todo-line">• ${t}</div>`).join('');
            }

            const div = document.createElement('div');
            div.className = 'sn-list-item';
            div.innerHTML = `
                <div class="sn-item-left">
                    <div class="sn-item-name">${item.name} ${item.revisitActive ? '<span style="color:red; font-size:14px; line-height:0;">•</span>' : ''}</div>
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

    const FeaturePanels = {
        create(type) {
            const id = type === 'FAX' ? 'sn-fax-panel' : 'sn-ir-panel';
            if (document.getElementById(id)) { app.Core.Windows.toggle(id); return; }

            const clientId = app.AppObserver.getClientId();
            if (!clientId) { alert("Client context not found."); return; }

            const sidebarData = app.Core.Scraper.getSidebarData();
            const clientName = sidebarData.name || "Unknown";

            const config = {
                'FAX': { title: 'PDF Forms' },
                'IR': { title: 'IR Tool' }
            };
            const currentConfig = config[type];

            const defPos = GM_getValue('def_pos_' + type, { width: '350px', height: 'auto', bottom: '50px', left: 'calc(50% - 175px)' });

            const w = document.createElement('div');
            w.id = id;
            w.className = 'sn-window';
            w.style.width = defPos.width;
            w.style.height = defPos.height;
            if (defPos.top) w.style.top = defPos.top;
            if (defPos.bottom) w.style.bottom = defPos.bottom;
            w.style.left = defPos.left;
            w.style.backgroundColor = 'var(--sn-bg-lighter)';
            w.style.border = '1px solid var(--sn-border)';
            w.style.flexDirection = 'column';
            w.style.display = 'flex';

            w.innerHTML = `
                <div class="sn-header" style="background:var(--sn-bg-light); border-bottom:1px solid var(--sn-border);">
                    <div style="display:flex; align-items:center; gap:5px;">
                         <button id="sn-${type.toLowerCase()}-min" style="cursor:pointer; background:none; border:none; font-weight:bold;">_</button>
                         <span style="font-weight:bold; color:var(--sn-primary-dark);">${currentConfig.title} - ${clientName}</span>
                    </div>
                    <button id="sn-${type.toLowerCase()}-close" style="background:none; border:none; font-weight:bold; cursor:pointer; font-size:14px; margin-left:5px;">X</button>
                </div>
                <div id="${type.toLowerCase()}-body" style="overflow-y:auto; flex-grow:1;">
                    <!-- Content will be rendered here -->
                </div>
                <div class="sn-resizer rs-n"></div><div class="sn-resizer rs-s"></div>
                <div class="sn-resizer rs-e"></div><div class="sn-resizer rs-w"></div>
                <div class="sn-resizer rs-ne"></div><div class="sn-resizer rs-nw"></div>
                <div class="sn-resizer rs-se"></div><div class="sn-resizer rs-sw"></div>
            `;
            document.body.appendChild(w);
            app.Core.Windows.setup(w, w.querySelector(`#sn-${type.toLowerCase()}-min`), w.querySelector('.sn-header'), type);
            w.querySelector(`#sn-${type.toLowerCase()}-close`).onclick = () => { w.style.display = 'none'; app.Core.Windows.updateTabState(w.id); };

            const bodyContainer = w.querySelector(`#${type.toLowerCase()}-body`);

            if (type === 'FAX') {
                this.renderFaxForm(bodyContainer, clientId, sidebarData);
            } else if (type === 'IR') {
                this.renderIRPanel(bodyContainer);
            }
        },

        renderFaxForm(container, clientId, data) {
            const formData = GM_getValue('cn_form_data_' + clientId, {});
            const ddsName = formData.DDS_Selection || '';
            const globalCM1 = GM_getValue('sn_global_cm1', '');
            const globalExt = GM_getValue('sn_global_ext', '');

            const styles = `border:none; border-bottom:1px dashed #999; background:transparent; font-family:inherit; width:100%;`;
            const createField = (lbl, val, hasCheck = false, extraClass = '', checkId = '') => `
                <div style="display:flex; align-items:center; margin-bottom:4px; font-size:0.9em;">
                    ${hasCheck ? `<input type="checkbox" ${checkId ? `id="${checkId}"` : ''} style="margin-right:4px;">` : ''}
                    <span style="color:#555; margin-right:4px; font-weight:bold; white-space:nowrap;">${lbl}:</span>
                    <input type="text" class="sn-fax-input ${extraClass}" value="${val || ''}" readonly style="${styles}">
                </div>`;

            const sections = [
                { title: "Letter 25", content: `${createField('Name', data.name)}${createField('SSN', data.ssn)}${createField('Phone', formData['Phone'] || '', true, '', 'sn-l25-phone-chk')}${createField('Address', formData['Address'] || '', true, '', 'sn-l25-addr-chk')}<button id="sn-pdf-l25" style="margin-top:5px; width:100%;">📄 Generate PDF</button>` },
                { title: "Status to DDS", content: `${createField('DDS', ddsName)}${createField('Fax #', '')}${createField('Name', data.name)}${createField('SSN', data.ssn)}${createField('DOB', data.dob)}${createField('Last update', 'N/A', false, 'sn-last-update')}${createField('CM1', globalCM1, false, 'sn-global-cm1')}${createField('Ext.', globalExt, false, 'sn-global-ext')}<button id="sn-pdf-s2dds" style="margin-top:5px; width:100%;">📄 Generate PDF</button>` },
                { title: "Status to FO", content: `${createField('Name', data.name)}${createField('SSN', data.ssn)}<button id="sn-pdf-s2fo" style="margin-top:5px; width:100%;">📄 Generate PDF</button>` }
            ];

            container.style.padding = '10px';
            
            // Create Button Container
            const btnContainer = document.createElement('div');
            btnContainer.style.display = 'flex';
            btnContainer.style.gap = '5px';
            btnContainer.style.marginBottom = '10px';
            container.appendChild(btnContainer);

            // Create Content Container
            const contentContainer = document.createElement('div');
            container.appendChild(contentContainer);

            sections.forEach(sec => {
                const btn = document.createElement('button');
                btn.className = 'sn-fax-btn';
                btn.innerText = sec.title;
                btn.style.flex = '1';
                btn.onclick = () => {
                    contentContainer.innerHTML = `<div style="padding:8px; border:1px solid #ccc; background:#f9f9f9;">${sec.content}</div>`;
                    this.attachFaxEvents(contentContainer, clientId, data, formData, ddsName, globalCM1, globalExt);
                };
                btnContainer.appendChild(btn);
            });
        },

        attachFaxEvents(container, clientId, data, formData, ddsName, globalCM1, globalExt) {
            container.querySelectorAll('.sn-fax-input').forEach(inp => {
                inp.ondblclick = () => { inp.removeAttribute('readonly'); inp.focus(); };
                inp.onblur = () => inp.setAttribute('readonly', true);
                inp.onkeydown = (e) => { if (e.key === 'Enter') inp.blur(); };
            });

            const setupPdfBtn = (btnId, url, fileName, fillFn) => {
                const btn = container.querySelector(btnId);
                if (!btn) return;

                btn.onclick = async () => {
                    const originalText = btn.innerText;
                    btn.innerText = "⏳ Processing...";
                    try {
                        const PDFLib = await app.Core.loadPdfLib();
                        const formBytes = await app.Core.fetchPdfBytes('https://raw.githubusercontent.com/kantngn/CM-Notes/refs/heads/main/db/L25.pdf');
                        const pdfDoc = await PDFLib.PDFDocument.load(formBytes);
                        const form = pdfDoc.getForm();
                        const today = new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
                        
                        fillFn(form, today);

                        form.flatten();
                        const pdfBytes = await pdfDoc.save();
                        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
                        const link = document.createElement('a');
                        link.href = URL.createObjectURL(blob);
                        link.download = `${fileName} - ${data.name} - ${today.replace(/\//g, '-')}.pdf`;
                        document.body.appendChild(link); link.click(); document.body.removeChild(link);
                        btn.innerText = "✅ Done";
                    } catch (e) { console.error(e); btn.innerText = "❌ Error"; alert(e.message); }
                    setTimeout(() => btn.innerText = originalText, 2000);
                };
            };

            setupPdfBtn('#sn-pdf-l25', 'https://raw.githubusercontent.com/kantngn/CM-Notes/refs/heads/main/db/L25.pdf', 'Letter 25', (form, today) => {
                const phoneChk = container.querySelector('#sn-l25-phone-chk').checked;
                const addrChk = container.querySelector('#sn-l25-addr-chk').checked;
                const phoneVal = container.querySelector('#sn-l25-phone-chk').parentNode.querySelector('input[type=text]').value;
                const addrVal = container.querySelector('#sn-l25-addr-chk').parentNode.querySelector('input[type=text]').value;
                try { form.getTextField('Date').setText(today); } catch(e) {}
                try { form.getTextField('Name').setText(data.name); } catch(e) {}
                try { form.getTextField('SSN').setText(data.ssn); } catch(e) {}
                let header = "", info1 = "", info2 = "", info3 = "";
                if (phoneChk && !addrChk) { header = "Current Phone Number"; info1 = phoneVal; }
                else if (!phoneChk && addrChk) { header = "Current Address"; const parts = addrVal.split(','); info1 = parts[0] ? parts[0].trim() : ""; info2 = parts.slice(1).join(',').trim(); }
                else if (phoneChk && addrChk) { header = "Current Phone Number and Address"; info1 = phoneVal; const parts = addrVal.split(','); info2 = parts[0] ? parts[0].trim() : ""; info3 = parts.slice(1).join(',').trim(); }
                try { form.getTextField('Header').setText(header); } catch(e) {}
                try { form.getTextField('Info1').setText(info1); } catch(e) {}
                try { form.getTextField('Info2').setText(info2); } catch(e) {}
                try { form.getTextField('Info3').setText(info3); } catch(e) {}
            });

            setupPdfBtn('#sn-pdf-s2fo', 'https://raw.githubusercontent.com/kantngn/CM-Notes/refs/heads/main/db/S2FO.pdf', 'Fax Status Sheet to FO', (form, today) => {
                try { form.getTextField('Date').setText(today); } catch(e) {}
                try { form.getTextField('ID').setText(`${data.name}, SSN: ${data.ssn}`); } catch(e) {}
                try { form.getTextField('DOB').setText(data.dob || ''); } catch(e) {}
            });

            setupPdfBtn('#sn-pdf-s2dds', 'https://raw.githubusercontent.com/kantngn/CM-Notes/refs/heads/main/db/S2DDS.pdf', 'Fax Status Sheet to DDS', (form, today) => {
                const lastUpdateVal = container.querySelector('.sn-last-update').value;
                try { form.getTextField('Date').setText(today); } catch(e) {}
                try { form.getTextField('DDS').setText(ddsName); } catch(e) {}
                try { form.getTextField('ID').setText(`${data.name}, SSN: ${data.ssn}`); } catch(e) {}
                try { form.getTextField('Name').setText(data.name); } catch(e) {}
                try { form.getTextField('SSN').setText(data.ssn); } catch(e) {}
                try { form.getTextField('Last update').setText(lastUpdateVal); } catch(e) {}
                try { form.getTextField('CM1').setText(globalCM1); } catch(e) {}
                try { form.getTextField('DOB').setText(data.dob || ''); } catch(e) {}
                try { form.getTextField('Ext').setText(globalExt); } catch(e) {}
            });
        },

        renderIRPanel(container) {
            container.innerHTML = `
                <div style="padding:10px; display:flex; flex-direction:column; height:100%; box-sizing:border-box; gap:10px;">
                    <div style="display:flex; flex-direction:column; height:auto; flex-shrink:0;">
                        <button id="sn-ir-select-btn" style="width:100%; padding:10px; cursor:pointer; background:var(--sn-bg-lighter); border:1px solid var(--sn-border); border-radius:4px; color:var(--sn-primary-dark); font-weight:bold; display:flex; align-items:center; justify-content:center; gap:5px;">
                            <span>🎯</span> Select IR Report from Page
                        </button>
                        <div id="sn-ir-status" style="font-size:10px; color:#666; text-align:center; margin-top:4px; min-height:14px;"></div>
                    </div>
                    <div style="display:flex; flex-direction:column; flex-grow:1; overflow:hidden;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2px;">
                            <label style="font-weight:bold; color:var(--sn-primary-text); font-size:11px;">Output</label>
                            <button id="sn-ir-copy" style="cursor:pointer; background:var(--sn-bg-lighter); border:1px solid var(--sn-border); border-radius:3px; font-size:10px; padding:1px 5px; color:var(--sn-primary-dark);">Copy</button>
                        </div>
                        <div id="sn-ir-output" contenteditable="true" style="flex-grow:1; width:100%; border:1px solid #ccc; font-family:inherit; padding:5px; box-sizing:border-box; background:#fff; font-size:11px; overflow-y:auto; white-space:pre-wrap;"></div>
                    </div>
                </div>
            `;

            const isIRReport = (text) => {
                if (!text) return false;
                const lowerText = text.toLowerCase();
                return lowerText.includes('case level:') && 
                       lowerText.includes('receipt date:') && 
                       (lowerText.includes('claim #') || lowerText.includes('claim status:'));
            };

            const summarizeIR = (text, reportDate) => {
                if (!text) return "";
                const getVal = (regex) => (text.match(regex) || [])[1] || "";
                const fmtDate = (d) => { if (!d) return ""; const date = new Date(d); return isNaN(date) ? d : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };
                let caseLevel = getVal(/Case Level:\s*(.*)/i).trim();
                caseLevel = caseLevel.includes("Reconsideration") ? "Recon" : (caseLevel.includes("Initial") ? "IA" : caseLevel);
                const receiptDate = getVal(/Receipt Date:\s*(\d{2}\/\d{2}\/\d{4})/);
                const assignedDate = getVal(/First Date Assigned:\s*(\d{2}\/\d{2}\/\d{4})/);
                const claimBlocks = text.split(/Claim # \d+:/).slice(1);
                let types = new Set(), statuses = new Set(), office = "", closedDate = "";

                claimBlocks.forEach(block => {
                    const type = (block.match(/Claim Type:\s*(.*)/i) || [])[1] || "";
                    if (type.includes("Title 16")) types.add("T16"); if (type.includes("Title 2")) types.add("T2");
                    const stat = (block.match(/Claim Status:\s*(.*)/i) || [])[1] || "";
                    statuses.add(stat.trim());
                    if (stat.includes("Closed")) closedDate = (block.match(/Status Date:\s*(\d{2}\/\d{2}\/\d{4})/) || [])[1];
                    const off = (block.match(/Office\s+with\s+Jurisdiction:\s*(.*)/i) || [])[1];
                    if (off) office = off.trim();
                });

                const claimType = (types.has("T2") && types.has("T16")) ? "Concurrent" : (types.has("T2") ? "T2" : "T16");
                const isClosed = [...statuses].some(s => s.includes("Closed"));
                const isStaging = [...statuses].some(s => s.includes("Staging"));
                const article = /^[aeiou]/i.test(caseLevel) ? "an" : "a";
                let summary = `IR report received on ${reportDate} indicates ${article} ${caseLevel} ${claimType} claim`;

                if (isClosed) return `${summary} and was closed at DDS ${office} on ${fmtDate(closedDate)}.`;
                
                summary += `, received at DDS ${office} on ${fmtDate(receiptDate)}`;
                if (isStaging) {
                    summary += ` and the status was Staging.`;
                } else {
                    summary += (assignedDate === receiptDate) ? `, assigned on same date.` : `, assigned on ${fmtDate(assignedDate)}.`;
                }

                // Claimant Info
                const clRegex = /Letter Name:\s*([^,]+),[\s\S]*?Date Sent:\s*(\d{2}\/\d{2}\/\d{4}),[\s\S]*?Address 1:\s*\[.*?Address:\s*([^\]]+)\s*\]/g;
                const clRequests = [];
                let match;
                while ((match = clRegex.exec(text)) !== null) {
                    let name = match[1].trim();
                    if (name.includes("Work History")) name = "WH";
                    else if (name.includes("Activities of Daily Living")) name = "ADL";
                    clRequests.push({ name, date: fmtDate(match[2]), address: match[3].trim() });
                }
                if (clRequests.length > 0) {
                    const byAddr = {};
                    clRequests.forEach(r => { if (!byAddr[r.address]) byAddr[r.address] = []; byAddr[r.address].push(r); });
                    Object.entries(byAddr).forEach(([addr, reqs]) => {
                        const verb = reqs.length > 1 ? "were" : "was";
                        summary += `\n\n${reqs.map(r => r.name).join(" and ")} ${verb} sent to CL on ${reqs.map(r => r.date).join(" and ")} to ${addr}.`;
                    });
                }

                // Medical Evidence
                const medRegex = /Letter Name:\s*([^,]+),[\s\S]*?Date Sent:\s*(\d{2}\/\d{2}\/\d{4}),(?:[\s\S]*?Date Received:\s*(\d{2}\/\d{2}\/\d{4}),)?[\s\S]*?Organization Name:\s*([^,\]]+)[\s\S]*?Facility Address:\s*(.*)/g;
                const facilities = {};
                let medMatch;
                while ((medMatch = medRegex.exec(text)) !== null) {
                    const org = medMatch[4].trim();
                    if (!facilities[org]) facilities[org] = { address: medMatch[5].trim(), reqs: [] };
                    facilities[org].reqs.push({ sent: fmtDate(medMatch[2]), received: medMatch[3] ? fmtDate(medMatch[3]) : null });
                }
                Object.entries(facilities).forEach(([org, data]) => {
                    const count = data.reqs.length === 1 ? "One" : (data.reqs.length === 2 ? "Two" : data.reqs.length);
                    const noun = data.reqs.length === 1 ? "Request" : "Requests";
                    const verb = data.reqs.length === 1 ? "was" : "were";
                    let line = `\n\n${count} Medical Evidence ${noun} ${verb} sent to ${org}, Address: ${data.address}`;
                    line += " " + data.reqs.map(r => `on ${r.sent}` + (r.received ? ` and received reply on ${r.received}` : ` with no confirmation on receipt`)).join(". Also ") + ".";
                    summary += line;
                });

                // CE Appointments
                const ceRegex = /CE Appointment # \d+:[\s\S]*?Appointment Date:\s*(\d{2}\/\d{2}\/\d{4}),[\s\S]*?Appointment(?: Start)? Time:\s*([^,]+),[\s\S]*?Status:\s*([^,]+),[\s\S]*?Facility:\s*\[([\s\S]*?)\][\s\S]*?Facility Address:\s*(.*)/g;
                let ceMatch;
                while ((ceMatch = ceRegex.exec(text)) !== null) {
                    const date = fmtDate(ceMatch[1]), time = ceMatch[2].trim(), status = ceMatch[3].trim();
                    const facilityRaw = ceMatch[4], address = ceMatch[5].trim();
                    let indName = (facilityRaw.match(/Individual Name:\s*([^,]+)/) || [])[1] || "";
                    let orgName = (facilityRaw.match(/Organization Name:\s*([^,]+)/) || [])[1] || "";
                    let facilityStr = "";
                    if (indName) facilityStr += " with " + indName.trim();
                    if (orgName) facilityStr += " at " + orgName.trim();
                    let line = `\n\nA CE appointment was scheduled for CL at ${time} ${date}${facilityStr}, ${address}`;
                    if (status.toLowerCase().includes("cancelled")) line += " - but it was cancelled.";
                    else if (status.toLowerCase().includes("kept")) line += " - CL attendance was confirmed.";
                    else line += " - CL attendance was not confirmed.";
                    summary += line;
                }

                return summary;
            };

            const output = container.querySelector('#sn-ir-output');
            const copyBtn = container.querySelector('#sn-ir-copy');
            const selectBtn = container.querySelector('#sn-ir-select-btn');
            const statusDiv = container.querySelector('#sn-ir-status');
            let isCapturing = false, highlightEl = null, mouseOverHandler = null, clickHandler = null;

            const cleanup = () => {
                if (highlightEl) highlightEl.remove();
                if (mouseOverHandler) document.removeEventListener('mouseover', mouseOverHandler);
                if (clickHandler) document.removeEventListener('click', clickHandler, true);
                isCapturing = false;
                selectBtn.style.background = 'var(--sn-bg-lighter)';
                selectBtn.innerHTML = '<span>🎯</span> Select IR Report from Page';
                statusDiv.innerText = "";
            };

            selectBtn.onclick = (e) => {
                e.stopPropagation();
                if (isCapturing) { cleanup(); return; }
                isCapturing = true;
                selectBtn.style.background = '#ffccbc';
                selectBtn.innerHTML = '<span>❌</span> Cancel Selection';
                statusDiv.innerText = "Hover over text block & click to capture...";
                highlightEl = document.createElement('div');
                highlightEl.style.cssText = 'position:absolute; border:2px dashed #f44336; pointer-events:none; z-index:999999; background:rgba(244, 67, 54, 0.1); transition: all 0.1s ease;';
                document.body.appendChild(highlightEl);

                mouseOverHandler = (ev) => {
                    const container = ev.target.closest('.slds-timeline__item_expandable, .slds-card, .task-card');
                    const target = container || ev.target;
                    const text = target.innerText || "";

                    if (isIRReport(text)) {
                        highlightEl.style.borderColor = '#4CAF50'; // Green
                        highlightEl.style.background = 'rgba(76, 175, 80, 0.1)';
                    } else {
                        highlightEl.style.borderColor = '#f44336'; // Red
                        highlightEl.style.background = 'rgba(244, 67, 54, 0.1)';
                    }

                    const rect = target.getBoundingClientRect();
                    highlightEl.style.width = rect.width + 'px'; highlightEl.style.height = rect.height + 'px';
                    highlightEl.style.top = (rect.top + window.scrollY) + 'px'; highlightEl.style.left = (rect.left + window.scrollX) + 'px';
                };

                clickHandler = (ev) => {
                    if (ev.target === selectBtn || selectBtn.contains(ev.target)) return;
                    const container = ev.target.closest('.slds-timeline__item_expandable, .slds-card, .task-card');
                    const target = container || ev.target;
                    const text = target.innerText || target.value || "";
                    
                    if (isIRReport(text)) {
                        ev.preventDefault(); ev.stopPropagation();
                        let dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                        const dateMatch = text.match(/(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}(?:,?\s+\d{4})?/i);
                        if (dateMatch) { dateStr = dateMatch[0]; if (!/\d{4}/.test(dateStr)) { dateStr += `, ${new Date().getFullYear()}`; } }
                        output.innerHTML = summarizeIR(text, dateStr);
                        statusDiv.innerText = "Captured!";
                        setTimeout(() => statusDiv.innerText = "", 2000);
                        cleanup();
                    }
                };
                document.addEventListener('mouseover', mouseOverHandler);
                document.addEventListener('click', clickHandler, true);
            };

            copyBtn.onclick = () => {
                GM_setClipboard(output.innerText);
                copyBtn.innerText = "Copied!";
                setTimeout(() => copyBtn.innerText = "Copy", 1000);
            };
        }
    };
    
    Object.assign(app.Tools, { ContactForms, SSDFormViewer, Dashboard, FeaturePanels });
})(window.CM_App = window.CM_App || {});