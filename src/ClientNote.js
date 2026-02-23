(function(app) {
    'use strict';

    // ==========================================
    // 4. CLIENT NOTE MODULE
    // ==========================================
    const ClientNote = {
        presets: [
            '#ffcdd2', '#ffe0b2', '#fff9c4', '#c8e6c9', '#b2dfdb',
            '#bbdefb', '#d1c4e9', '#f8bbd0', '#d7ccc8', '#cfd8dc'
        ],
        ianaTZ: {
            'EST': 'America/New_York', 'CST': 'America/Chicago', 'MST': 'America/Denver',
            'PST': 'America/Los_Angeles', 'AKST': 'America/Anchorage', 'HST': 'Pacific/Honolulu'
        },
        listeners: {},
        clockInterval: null,

        getNoteColors(tzKey, savedData = {}) {
            // Priority 1: Manually set custom color for this specific note
            if (savedData.customColor) {
                let headerTheme = Object.values(app.Core.Themes).find(t => t.lighter === savedData.customColor);
                const headerColor = headerTheme ? headerTheme.light : app.Core.Themes['Yellow'].light;
                return [savedData.customColor, headerColor];
            }

            // Priority 2 & 3: Global settings (Timezone > UI Theme > Default)
            const useTzColor = GM_getValue('sn_tz_note_color', true);
            const followTheme = GM_getValue('sn_note_follow_theme', true);
            const currentThemeName = GM_getValue('sn_ui_theme', 'Teal');
            const defaultNoteColor = GM_getValue('sn_note_default_color', app.Core.Themes['Yellow'].lighter);
            let bodyColor, headerColor;

            if (useTzColor && tzKey && app.Core.NoteThemes.colors[tzKey]) {
                [bodyColor, headerColor] = app.Core.NoteThemes.colors[tzKey];
            } else {
                if (followTheme) {
                    const theme = app.Core.Themes[currentThemeName];
                    bodyColor = theme.lighter;
                    headerColor = theme.light;
                } else {
                    bodyColor = defaultNoteColor;
                    // Find which theme this color belongs to for the header
                    let headerTheme = Object.values(app.Core.Themes).find(t => t.lighter === bodyColor);
                    headerColor = headerTheme ? headerTheme.light : app.Core.Themes['Yellow'].light;
                }
            }
            return [bodyColor, headerColor];
        },

        updateNoteColor(clientId) {
            const w = document.getElementById('sn-client-note');
            if (!w) return;

            const savedData = GM_getValue('cn_' + clientId, {});
            const tzKey = w.querySelector('#sn-tz-select').value;
            const [newBodyColor, newHeaderColor] = this.getNoteColors(tzKey, savedData);

            w.style.backgroundColor = newBodyColor;
            w.querySelector('#sn-cn-header').style.background = newHeaderColor;
        },

        detectTimezone(state, city) {
            if (!state) return null;
            const s = state.toUpperCase();
            const c = city ? city.toUpperCase().trim() : '';
            if (app.Core.NoteThemes.specialTZ[s] && app.Core.NoteThemes.specialTZ[s][c]) return app.Core.NoteThemes.specialTZ[s][c];
            return app.Core.NoteThemes.stateTZ[s] || null;
        },

        create(clientId) {
            const id = 'sn-client-note';
            if (document.getElementById(id)) { app.Core.Windows.toggle(id); return; }

            const savedData = GM_getValue('cn_' + clientId, {});
            const savedFontSize = GM_getValue('cn_font_' + clientId, '12px');
            const detectedTZ = this.detectTimezone(savedData.state, savedData.city);
            const initialTZ = savedData.tz || detectedTZ || null;

            const [bodyColor, headerColor] = this.getNoteColors(initialTZ, savedData);
            const autoCloseSSD = GM_getValue('sn_ssd_autoclose', false); // Default to unchecked
            const defPos = GM_getValue('def_pos_CN', { width: '500px', height: '400px', top: '100px', left: '100px' });

            let finalHeaderColor = headerColor;
            if (savedData.customColor) {
                 let headerTheme = Object.values(app.Core.Themes).find(t => t.lighter === savedData.customColor);
                 if (headerTheme) finalHeaderColor = headerTheme.light;
            }

            // NEW: Register Cross-Tab Listener
            if (!this.listeners[clientId]) {
                console.log(`[ClientNote] 🎧 Listening for updates on cn_form_data_${clientId}`);
                this.listeners[clientId] = GM_addValueChangeListener('cn_form_data_' + clientId, (name, oldVal, newVal, remote) => {
                    console.log(`[ClientNote] 📨 Update received! Remote: ${remote}`, newVal);
                    if (remote) {
                        this.updateUI(newVal);
                    }
                });
            }

            // Listen for dashboard setting changes
            const settingsToWatch = ['sn_ui_theme', 'sn_tz_note_color', 'sn_note_follow_theme', 'sn_note_default_color'];
            settingsToWatch.forEach(key => {
                if (!this.listeners[key]) { // Prevent adding multiple listeners for the same key
                     this.listeners[key] = GM_addValueChangeListener(key, (name, oldVal, newVal, remote) => {
                        this.updateNoteColor(clientId);
                    });
                }
            });

            const w = document.createElement('div');
            w.id = id; w.className = 'sn-window';

            const pageWidth = window.innerWidth;
            const pageHeight = window.innerHeight;
            const defaultWidth = 380;
            const defaultHeight = 320;
            w.style.width = savedData.width || '380px'; w.style.height = savedData.height || '320px';
            w.style.backgroundColor = bodyColor; // Color is set based on getNoteColors hierarchy
            w.style.top = savedData.top || ((pageHeight - defaultHeight) / 2) + 'px'; w.style.left = savedData.left || ((pageWidth - defaultWidth) / 2) + 'px';
            w.style.fontSize = savedFontSize;

            const paletteHTML = this.presets.map(c => `<div class="sn-swatch" style="background:${c}" data-col="${c}"></div>`).join('');

            w.innerHTML = `
                    <div id="sn-wrapper" style="position:relative; width:100%; height:100%; display:flex; flex-direction:row;">

                        <div id="sn-spine-strip" style="width:28px; background:var(--sn-primary-text); display:flex; flex-direction:column; align-items:center; padding-top:10px; border-right:1px solid rgba(0,0,0,0.2); z-index:20; flex-shrink:0;">
                            <div class="sn-spine-btn" data-panel="info" title="Client Info" style="writing-mode:vertical-rl; text-orientation:mixed; transform:rotate(180deg); padding:15px 5px; color:var(--sn-bg-light); cursor:pointer; font-weight:bold; font-size:12px; margin-bottom:5px; transition:background 0.2s;">CL Info</div>
                            <div class="sn-spine-btn" data-panel="ssa" title="SSA Contacts" style="writing-mode:vertical-rl; text-orientation:mixed; transform:rotate(180deg); padding:15px 5px; color:var(--sn-bg-light); cursor:pointer; font-weight:bold; font-size:12px; margin-bottom:5px; transition:background 0.2s;">SSA</div>
                        </div>

                        <div id="sn-side-panel" style="position:absolute; right:100%; top:0; bottom:0; width:0px; display:none; flex-direction:column; background:rgba(255,255,255,0.95); border:1px solid #999; border-right:none; box-shadow:-2px 0 5px rgba(0,0,0,0.1); font-size:12px;">
                             <div id="sn-panel-header" style="padding:5px; font-weight:bold; background:var(--sn-bg-light); border-bottom:1px solid #999; display:flex; align-items:center; color:#333;">
                                <span id="sn-panel-title" style="margin-right:auto;">Info</span>
                                <label style="font-size:10px; margin-right:5px; display:flex; align-items:center; cursor:pointer; font-weight:normal;">
                                    <input type="checkbox" id="sn-ssd-autoclose" ${autoCloseSSD ? 'checked' : ''} style="margin-right:2px;"> AC
                                </label>
                                <button id="sn-side-font-dec" style="cursor:pointer; border:1px solid #999; background:#eee; width:18px; border-radius:3px; margin-right:2px;">-</button>
                                <button id="sn-side-font-inc" style="cursor:pointer; border:1px solid #999; background:#eee; width:18px; border-radius:3px; margin-right:5px;">+</button>
                                <button id="sn-panel-close" style="border:none; background:none; cursor:pointer; font-weight:bold;">×</button>
                             </div>
                             <div id="sn-panel-body" style="padding:0px; overflow-y:auto; flex-grow:1;"></div>
                             <div class="sn-panel-resizer-left" style="width:5px; cursor:col-resize; height:100%; position:absolute; left:0; top:0; z-index:10;"></div>
                        </div>

                        <div style="flex-grow:1; display:flex; flex-direction:column; min-width:200px; height:100%; overflow:hidden;">
                            
                            <div class="sn-header" id="sn-cn-header" style="background:${finalHeaderColor}; border-bottom:1px solid rgba(0,0,0,0.1); padding:4px; display:flex; align-items:center;">
                                
                                <button id="sn-refresh-btn" title="Refresh Scraped Data" style="border:none; background:transparent; cursor:pointer; font-size:14px; margin-right:4px; transition:transform 0.2s;">🔄</button>
                                
                                <span id="sn-cl-name" style="font-weight:bold; margin-left:4px; color:#333;">${savedData.name || 'Client Note'}</span>
                                <span id="sn-city" style="font-weight:bold; margin-left:8px; color:var(--sn-primary-dark); font-size:0.9em;">${savedData.city || ''}</span>
                                <span id="sn-state" style="font-weight:bold; margin-left:4px; color:var(--sn-primary-dark); font-size:0.9em;">${savedData.state || ''}</span>
                                <span id="sn-time" style="font-weight:bold; margin-left:8px; font-size:1em; color:#333; min-width:60px;"></span>
                                <div style="display:flex; align-items:center; margin-left:auto;">
                                    <select id="sn-tz-select" style="display:none;">
                                        <option value="EST">EST</option><option value="CST">CST</option><option value="MST">MST</option>
                                        <option value="PST">PST</option><option value="AKST">AKST</option><option value="HST">HST</option>
                                    </select>
                                    <button id="sn-min-btn" style="cursor:pointer; background:none; border:none; font-weight:bold; padding:0 5px;">_</button>
                                </div>
                            </div>

                            <div style="padding: 5px; border-bottom:1px solid #ccc; background:rgba(255,255,255,0.3); display:flex; gap:5px; align-items:center;">
                                <div style="display:flex; gap:2px;">
                                    <select id="sn-level" style="width:70px; background:rgba(255,255,255,0.7); border:1px solid #999; font-size:inherit;">
                                        <option value="Level">Level</option><option value="IA">IA</option><option value="Recon">Recon</option><option value="Hearing">Hearing</option>
                                    </select>
                                    <select id="sn-type" style="width:70px; background:rgba(255,255,255,0.7); border:1px solid #999; font-size:inherit;">
                                        <option value="Type">Type</option><option value="Concurrent">Concurrent</option><option value="T2">T2</option><option value="T16">T16</option>
                                    </select>
                                    
                                    <input id="sn-substatus" type="text" placeholder="Sub-status" readonly style="width:140px; background:rgba(255,255,255,0.5); border:1px solid #999; font-size:inherit; padding:1px 4px; color:#333; cursor:default; overflow:hidden; text-overflow:ellipsis;" title="Sub-status" value="${savedData.substatus || ''}">
                                </div>
                            </div>

                            <div style="display:flex; flex-direction:column; flex-grow:1; height:100%; overflow:hidden;">
                                <div id="sn-note-wrapper" style="position:relative; flex-grow:1; height:${savedData.notesHeight || '50%'}; min-height:50px;">
                                    <textarea id="sn-notes" style="width:100%; height:100%; resize:none; border:none; padding:8px; background:transparent; font-family:sans-serif; font-size:inherit; box-sizing:border-box;" placeholder="Case notes...">${savedData.notes || ''}</textarea>
                                    <button id="sn-ncl-btn" title="Task NCL" style="position:absolute; bottom:5px; right:15px; font-size:10px; padding:2px 6px; cursor:pointer; background:rgba(255,255,255,0.6); border:1px solid #999; border-radius:3px; color:var(--sn-primary-text); font-weight:bold;">NCL</button>
                                </div>
                                <div id="sn-partition" style="height:5px; background:rgba(0,0,0,0.1); cursor:ns-resize; border-top:1px solid rgba(0,0,0,0.1); border-bottom:1px solid rgba(0,0,0,0.1);"></div>
                                <div id="sn-todo-container" style="flex-grow:1; background:rgba(255,255,255,0.4); display:flex; flex-direction:column; overflow:hidden;">
                                    <div style="padding:2px; background:rgba(0,0,0,0.05); font-size:0.8em; font-weight:bold; padding-left:5px; color:#555;">TO-DO LIST</div>
                                    <div id="sn-todo-list" style="flex-grow:1; overflow-y:auto; padding:5px; outline:none; font-size:inherit;"></div>
                                </div>
                            </div>

                            <div style="padding:4px 8px; border-top:1px solid #ccc; background:rgba(255,255,255,0.5); display:flex; align-items:center;">
                                <label style="font-size:0.9em; font-weight:bold; margin-right:8px; cursor:pointer;">
                                    <input type="checkbox" id="sn-revisit-check" ${savedData.revisitActive ? 'checked' : ''}> Revisit
                                </label>
                                <input type="date" id="sn-revisit-date" value="${savedData.revisit || ''}" style="border:1px solid #999; border-radius:3px; font-size:0.9em; padding:1px;">

                                <div style="margin-left:auto; margin-right:auto; display:flex; align-items:center; gap:5px;">
                                    <button id="sn-font-dec" style="cursor:pointer; border:1px solid #999; background:#eee; width:20px; border-radius:3px; font-size:0.8em;">-</button>
                                    <span style="font-size:0.8em; color:#555;">Aa</span>
                                    <button id="sn-font-inc" style="cursor:pointer; border:1px solid #999; background:#eee; width:20px; border-radius:3px; font-size:0.8em;">+</button>
                                </div>

                                <div class="sn-cp-dropdown" style="margin-right:5px;">
                                    <button class="sn-cp-btn" title="Change Color">🎨</button>
                                    <div class="sn-cp-content" style="bottom:100%; top:auto; margin-bottom:5px;">${paletteHTML}</div>
                                </div>
                                <button id="sn-del-btn" style="cursor:pointer; background:none; border:none; font-size:12px;" title="Delete Data & Close">🗑️</button>
                            </div>
                        </div>
                    </div>

                    <div class="sn-resizer rs-n"></div><div class="sn-resizer rs-s"></div>
                    <div class="sn-resizer rs-e"></div><div class="sn-resizer rs-w"></div>
                    <div class="sn-resizer rs-ne"></div><div class="sn-resizer rs-nw"></div>
                    <div class="sn-resizer rs-se"></div><div class="sn-resizer rs-sw"></div>
                `;
            document.body.appendChild(w);
            app.Core.Windows.setup(w, w.querySelector('#sn-min-btn'), w.querySelector('#sn-cn-header'), 'CN');

            // --- SIDEBAR (Info & Fax) ---
            const sidePanel = w.querySelector('#sn-side-panel');
            const sideBody = w.querySelector('#sn-panel-body');
            const sideTitle = w.querySelector('#sn-panel-title');

            const updateSideFont = (d) => { let cur = parseInt(sidePanel.style.fontSize) || 12; sidePanel.style.fontSize = Math.max(9, Math.min(16, cur + d)) + 'px'; };
            w.querySelector('#sn-side-font-dec').onclick = (e) => { e.stopPropagation(); updateSideFont(-1); };
            w.querySelector('#sn-side-font-inc').onclick = (e) => { e.stopPropagation(); updateSideFont(1); };

            w.querySelector('#sn-ssd-autoclose').onchange = (e) => {
                GM_setValue('sn_ssd_autoclose', e.target.checked);
            };

            const setupAutoResize = (container) => {
                container.querySelectorAll('.sn-side-textarea').forEach(inp => {
                    const adjustHeight = () => {
                        inp.style.height = '1px'; // Reset to calculate exact shrink/grow
                        inp.style.height = (inp.scrollHeight) + 'px';
                    };

                    setTimeout(adjustHeight, 10);

                    inp.ondblclick = () => {
                        inp.removeAttribute('readonly');
                        inp.style.background = '#fff9c4';
                        inp.style.border = '1px solid #b0bec5';
                        inp.style.borderRadius = '3px';
                        inp.focus();
                    };

                    inp.oninput = adjustHeight;

                    inp.onblur = () => {
                        inp.setAttribute('readonly', true);
                        inp.style.background = 'transparent';
                        inp.style.border = '1px solid transparent';
                        window.getSelection().removeAllRanges();
                        saveState(); // Trigger save when editing is finished
                    };
                });
            };

            const renderInfoPanel = (container) => {
                const sidebarData = app.Core.Scraper.getSidebarData();
                const freshData = GM_getValue('cn_' + clientId, {}); // Get latest data
                const formData = GM_getValue('cn_form_data_' + clientId, {}); // Get latest form data
                
                const fields = [
                    { id: 'ssn', label: 'SSN', val: freshData.ssn || sidebarData.ssn },
                    { id: 'dob', label: 'DOB', val: freshData.dob || sidebarData.dob },
                    { id: 'phone', label: 'Phone', val: formData['Phone'] || freshData.phone || '' },
                    { id: 'addr', label: 'Address', val: formData['Address'] || freshData.address || '' },
                    { id: 'email', label: 'Email', val: formData['Email'] || freshData.email || '' },
                    { id: 'pob', label: 'POB', val: formData['POB'] || freshData.pob || '' },
                    { id: 'parents', label: 'Parents', val: formData['Parents'] || freshData.parents || '' },
                    { id: 'wit', label: 'Witness', val: formData['Witness'] || freshData.witness || '' }
                ];

                let html = `<div id="sn-info-container" style="padding:10px; background:#f9f9f9; min-height:100%; display:flex; flex-direction:column; box-sizing:border-box;">
                    <div style="display:flex; gap:10px; margin-bottom:12px;">
                        <button id="sn-open-ssd-btn" style="flex:1; padding:5px; cursor:pointer; font-weight:bold; background:var(--sn-bg-lighter); border:1px solid var(--sn-border); border-radius:4px; color:var(--sn-primary-dark); white-space:nowrap;">Open SSD App</button>
                        <button id="sn-go-med-btn" style="flex:1; padding:5px; cursor:pointer; font-weight:bold; background:var(--sn-bg-light); border:1px solid var(--sn-border); border-radius:4px; color:var(--sn-primary-dark); white-space:nowrap;">Med Prov ➔</button>
                    </div>
                    <div style="flex-grow:1;">
                `;

                fields.forEach(f => {
                    html += `
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px; border-bottom:1px dashed #ccc; padding-bottom:2px;">
                        <div style="font-weight:bold; color:#555; white-space:nowrap; margin-right:8px; margin-top:2px;">${f.label}</div>
                        <textarea class="sn-side-textarea" data-id="${f.id}" readonly rows="1"
                            style="width:100%; text-align:right; border:1px solid transparent; background:transparent; font-family:inherit; padding:2px 4px; color:#333; outline:none; resize:none; overflow:hidden; transition:background 0.2s, border 0.2s;">${f.val || ''}</textarea>
                    </div>`;
                });
                
                html += `
                    </div>
                </div>`;
                container.innerHTML = html;

                // Wire up the SSD App Button
                const ssdBtn = container.querySelector('#sn-open-ssd-btn');
                ssdBtn.onmouseover = () => ssdBtn.style.background = 'var(--sn-bg-light)';
                ssdBtn.onmouseout = () => ssdBtn.style.background = 'var(--sn-bg-lighter)';
                ssdBtn.onclick = () => {
                    // Generate URL directly using the 15-char ID and constant UUID
                    const id15 = clientId.substring(0, 15);
                    window.open(`https://kdcv1.my.site.com/forms/s/?uuid=a0UfL000002vlqfUAA&recordid=${id15}`, '_blank');
                };

                // Wire up the Med Provider Button
                const medBtn = container.querySelector('#sn-go-med-btn');
                medBtn.onmouseover = () => medBtn.style.background = 'var(--sn-primary)';
                medBtn.onmouseout = () => medBtn.style.background = 'var(--sn-bg-light)';
                medBtn.onclick = () => this.toggleMedWindow();

                setupAutoResize(container);

                // Save changes to Form Data on blur
                const fieldMap = {
                    'phone': 'Phone', 'addr': 'Address', 'email': 'Email',
                    'pob': 'POB', 'parents': 'Parents', 'wit': 'Witness'
                };
                Object.keys(fieldMap).forEach(domId => {
                    const el = container.querySelector(`.sn-side-textarea[data-id="${domId}"]`);
                    if (el) {
                        el.addEventListener('blur', () => {
                            let valueToSave = el.value;
                            if (domId === 'phone') {
                                valueToSave = el.value.split(/\|\|| - |,|;/).map(p => app.Core.Utils.formatPhoneNumber(p.trim())).filter(Boolean).join(' || ');
                                el.value = valueToSave; // update UI with formatted value
                            }
                            this.updateAndSaveData(clientId, { [fieldMap[domId]]: valueToSave });
                        });
                    }
                });
            };

            const togglePanel = (type) => {
                const titleMap = { 'info': 'Client Info', 'ssa': 'SSA Contacts' };
                const isSame = sideTitle.innerText === titleMap[type];

                w.querySelectorAll('.sn-spine-btn').forEach(b => {
                    b.style.color = 'var(--sn-bg-light)';
                    b.style.background = 'transparent';
                });

                if (sidePanel.style.display === 'flex' && isSame) {
                    sidePanel.style.display = 'none'; sidePanel.style.width = '0px';
                } else {
                    sidePanel.style.display = 'flex'; sidePanel.style.width = '250px';
                    sideTitle.innerText = titleMap[type];

                    const activeBtn = w.querySelector(`.sn-spine-btn[data-panel="${type}"]`);
                    if (activeBtn) {
                        activeBtn.style.color = 'white';
                        activeBtn.style.background = 'rgba(255,255,255,0.1)';
                    }

                    sideBody.innerHTML = '';
                    if (type === 'ssa') renderSSAPanel(sideBody);
                    else if (type === 'info') renderInfoPanel(sideBody);
                }
            };

            w.querySelector('#sn-panel-close').onclick = () => { sidePanel.style.display = 'none'; sidePanel.style.width = '0'; };
            w.querySelectorAll('.sn-spine-btn').forEach(btn => btn.onclick = () => togglePanel(btn.getAttribute('data-panel')));

            const sideResizer = w.querySelector('.sn-panel-resizer-left');
            sideResizer.onmousedown = (e) => {
                e.preventDefault(); const startX = e.clientX, startW = parseInt(window.getComputedStyle(sidePanel).width);
                const onMove = (mv) => { sidePanel.style.width = (startW + (startX - mv.clientX)) + 'px'; };
                const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
                document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
            };

            const renderSSAPanel = (container) => {
                const formData = GM_getValue('cn_form_data_' + clientId, {});
                const state = w.querySelector('#sn-state').innerText || '';

                container.innerHTML = `
                    <div style="padding:10px; display:flex; flex-direction:column; gap:15px;">
                        <!-- FO Section -->
                        <div class="sn-ssa-section" data-type="FO">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2px; border-bottom:1px solid #ccc; padding-bottom:2px;">
                                <span style="font-weight:bold; color:var(--sn-primary-text);">Field Office (FO)</span>
                                <div style="display:flex; gap:2px;">
                                    <button class="sn-ssa-search-btn" style="cursor:pointer; background:var(--sn-bg-lighter); border:1px solid var(--sn-border); border-radius:3px; font-size:10px; padding:1px 5px;">Search</button>
                                    <button class="sn-ssa-clear-btn" style="cursor:pointer; background:#ffebee; border:1px solid #ef5350; border-radius:3px; font-size:10px; padding:1px 5px;">✕</button>
                                </div>
                            </div>
                            <div class="sn-ssa-display" style="background:#fff; border:1px solid #ccc; padding:5px; font-size:11px; min-height:40px; white-space:pre-wrap; color:#333;">${formData.FO_Text || ''}</div>
                            <div class="sn-ssa-search-box" style="display:none;">
                                <input type="text" class="sn-ssa-input" style="width:100%; border:1px solid var(--sn-border); padding:4px; font-size:11px; box-sizing:border-box; margin-bottom:5px;" placeholder="Enter State...">
                                <div class="sn-ssa-results" style="border:1px solid var(--sn-bg-light); max-height:150px; overflow-y:auto; background:white; display:none;"></div>
                            </div>
                        </div>

                        <!-- DDS Section -->
                        <div class="sn-ssa-section" data-type="DDS">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2px; border-bottom:1px solid #ccc; padding-bottom:2px;">
                                <span style="font-weight:bold; color:var(--sn-primary-text);">DDS Office</span>
                                <div style="display:flex; gap:2px;">
                                    <button class="sn-ssa-search-btn" style="cursor:pointer; background:var(--sn-bg-lighter); border:1px solid var(--sn-border); border-radius:3px; font-size:10px; padding:1px 5px;">Search</button>
                                    <button class="sn-ssa-clear-btn" style="cursor:pointer; background:#ffebee; border:1px solid #ef5350; border-radius:3px; font-size:10px; padding:1px 5px;">✕</button>
                                </div>
                            </div>
                            <div class="sn-ssa-display" style="background:#fff; border:1px solid #ccc; padding:5px; font-size:11px; min-height:40px; white-space:pre-wrap; color:#333;">${formData.DDS_Text || ''}</div>
                            <div class="sn-ssa-search-box" style="display:none;">
                                <input type="text" class="sn-ssa-input" style="width:100%; border:1px solid var(--sn-border); padding:4px; font-size:11px; box-sizing:border-box; margin-bottom:5px;" placeholder="Enter State...">
                                <div class="sn-ssa-results" style="border:1px solid var(--sn-bg-light); max-height:150px; overflow-y:auto; background:white; display:none;"></div>
                            </div>
                            <textarea id="sn-dds-note" placeholder="DDS Notes..." style="width:100%; height:40px; border:1px solid #ccc; font-family:inherit; font-size:11px; margin-top:5px; resize:vertical; box-sizing: border-box;">${formData.DDS_Note || ''}</textarea>
                        </div>
                    </div>
                `;

                // Add listener for DDS Note
                const ddsNote = container.querySelector('#sn-dds-note');
                ddsNote.oninput = () => {
                    this.updateAndSaveData(clientId, { DDS_Note: ddsNote.value });
                };

                container.querySelectorAll('.sn-ssa-section').forEach(section => {
                    const type = section.getAttribute('data-type');
                    const searchBtn = section.querySelector('.sn-ssa-search-btn');
                    const clearBtn = section.querySelector('.sn-ssa-clear-btn');
                    const displayDiv = section.querySelector('.sn-ssa-display');
                    const searchBox = section.querySelector('.sn-ssa-search-box');
                    const input = section.querySelector('.sn-ssa-input');
                    const resultsDiv = section.querySelector('.sn-ssa-results');

                    const performSearch = () => {
                        const query = input.value.trim();
                        if (!query) return;
                        
                        searchBtn.innerText = "...";
                        app.Core.SSADataManager.search(type, query, (results) => {
                            searchBtn.innerText = "Go";
                            resultsDiv.style.display = 'block';
                            resultsDiv.innerHTML = '';
                            
                            if (results.length === 0) {
                                resultsDiv.innerHTML = '<div style="padding:5px; color:#888;">No results found.</div>';
                                return;
                            }

                            results.forEach(item => {
                                const row = document.createElement('div');
                                row.style.cssText = "padding:5px; border-bottom:1px solid #eee; cursor:pointer; transition:background 0.2s;";
                                row.onmouseover = () => row.style.background = "var(--sn-bg-lighter)";
                                row.onmouseout = () => row.style.background = "white";
                                
                                const formattedPhone = app.Core.Utils.formatPhoneNumber(item.phone);
                                const formattedFax = app.Core.Utils.formatPhoneNumber(item.fax);

                                const label = type === 'FO' ? `<b>${item.location}</b><br>PN: ${formattedPhone} | Fax: ${formattedFax}` : `<b>${item.name}</b><br>PN: ${formattedPhone}` + (item.fax ? ` | Fax (??): ${formattedFax}` : '');
                                row.innerHTML = label;
                                row.onclick = () => {
                                    const saveVal = type === 'FO' ? item.id : item.name;
                                    const displayText = type === 'FO' ? `${item.location}\n${item.fullAddress}\nPN: ${formattedPhone}\nFax: ${formattedFax}` : `${item.name}\nPN: ${formattedPhone}` + (item.fax ? `\nFax (??): ${formattedFax}` : '');
                                    
                                    this.updateAndSaveData(clientId, { [`${type}_Selection`]: saveVal, [`${type}_Text`]: displayText });
                                    displayDiv.innerText = displayText;
                                    
                                    // Close search
                                    searchBox.style.display = 'none';
                                    displayDiv.style.display = 'block';
                                    searchBtn.innerText = "Search";
                                };
                                resultsDiv.appendChild(row);
                            });
                        });
                    };

                    searchBtn.onclick = () => {
                        if (searchBox.style.display === 'none') {
                            searchBox.style.display = 'block';
                            displayDiv.style.display = 'none';
                            input.value = state; 
                            input.select();
                            searchBtn.innerText = "Go";
                            if (state) performSearch();
                        } else {
                            performSearch();
                        }
                    };

                    input.onkeydown = (e) => {
                        if (e.key === 'Enter') performSearch();
                        if (e.key === 'Escape') {
                            searchBox.style.display = 'none';
                            displayDiv.style.display = 'block';
                            searchBtn.innerText = "Search";
                        }
                    };

                    clearBtn.onclick = () => {
                        if (confirm(`Clear ${type}?`)) {
                            displayDiv.innerText = "";
                            this.updateAndSaveData(clientId, { [`${type}_Selection`]: "", [`${type}_Text`]: "" });
                            searchBox.style.display = 'none';
                            displayDiv.style.display = 'block';
                            searchBtn.innerText = "Search";
                        }
                    };
                });
            };

            // --- UTILS (Main Font, Save, Resizers) ---
            const updateFont = (delta) => {
                let current = parseInt(w.style.fontSize) || 12;
                let newSize = Math.max(10, Math.min(16, current + delta));
                w.style.fontSize = newSize + 'px';
                GM_setValue('cn_font_' + clientId, newSize + 'px');
            };
            w.querySelector('#sn-font-inc').onclick = () => updateFont(1);
            w.querySelector('#sn-font-dec').onclick = () => updateFont(-1);

            // Check initial data state for buttons
            this.checkStoredData(clientId);

            w.querySelectorAll('.sn-swatch').forEach(sw => {
                sw.onclick = () => {
                    const newColor = sw.getAttribute('data-col');
                    const currentData = GM_getValue('cn_' + clientId, {});
                    currentData.customColor = newColor;
                    GM_setValue('cn_' + clientId, currentData);
                    this.updateNoteColor(clientId);
                };
            });

            const todoList = w.querySelector('#sn-todo-list');
            const rowTpl = `<div style="display:flex; align-items:center; margin-bottom:4px; cursor:text;"><input type="checkbox" style="margin-right:6px; cursor:pointer;"><span contenteditable="true" placeholder="New Task..." style="flex-grow:1; outline:none; min-height:1em;"></span></div>`;

            // Safe HTML Injection logic (Fallback for legacy saved HTML)
            if (savedData.todoHTML && savedData.todoHTML.trim()) {
                const parser = new DOMParser();
                const doc = parser.parseFromString(savedData.todoHTML, 'text/html');
                Array.from(doc.body.childNodes).forEach(node => todoList.appendChild(node));
            } else {
                todoList.insertAdjacentHTML('beforeend', rowTpl);
            }

            todoList.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault(); todoList.insertAdjacentHTML('beforeend', rowTpl);
                    const spans = todoList.querySelectorAll('span'); spans[spans.length - 1].focus(); saveState();
                }
            });
            todoList.addEventListener('click', (e) => { if(e.target.tagName === 'DIV' && e.target.closest('#sn-todo-list')) { const span = e.target.querySelector('span'); if(span) span.focus(); } });

            const saveState = () => {
                if(!document.body.contains(w)) return;
                try {
                    const rows = todoList.querySelectorAll('div');
                    rows.forEach(row => {
                        const cb = row.querySelector('input[type="checkbox"]');
                        if (cb) { if (cb.checked) cb.setAttribute('checked', 'checked'); else cb.removeAttribute('checked'); }
                    });

                    // Retrieve previous data to preserve fields if UI elements are missing (e.g. closed sidebar)
                    const previous = GM_getValue('cn_' + clientId, {});
                    const ssnEl = w.querySelector('.sn-side-textarea[data-id="ssn"]');
                    const dobEl = w.querySelector('.sn-side-textarea[data-id="dob"]');

                    const data = {
                        name: w.querySelector('#sn-cl-name').innerText, notes: w.querySelector('#sn-notes').value,
                        city: w.querySelector('#sn-city').innerText,
                        state: w.querySelector('#sn-state').innerText,
                        substatus: w.querySelector('#sn-substatus').value,
                        ssn: ssnEl ? ssnEl.value : previous.ssn,
                        tz: w.querySelector('#sn-tz-select').value,
                        dob: dobEl ? dobEl.value : previous.dob,
                        revisitActive: w.querySelector('#sn-revisit-check').checked, revisit: w.querySelector('#sn-revisit-date').value,
                        level: w.querySelector('#sn-level').value, type: w.querySelector('#sn-type').value,
                        todoHTML: todoList.innerHTML, notesHeight: w.querySelector('#sn-note-wrapper').style.height,
                        width: w.style.width, height: w.style.height, top: w.style.top, left: w.style.left, timestamp: Date.now(),
                        // We do NOT save form data (med/wit/etc) here to prevent overwriting.
                        // It is managed by cn_form_data_{id}
                        // customColor is saved separately by the swatch click handler.
                    };
                    
                    GM_setValue('cn_' + clientId, data);
                    this.checkStoredData(clientId);
                } catch (err) {}
            };
            w.addEventListener('input', saveState); w.addEventListener('change', saveState);

            const tzSelect = w.querySelector('#sn-tz-select');
            if (initialTZ) { tzSelect.value = initialTZ; }
            tzSelect.onchange = () => {
                this.startClock(tzSelect.value);
                this.updateNoteColor(clientId);
                saveState();
            };
            if(savedData.level) w.querySelector('#sn-level').value = savedData.level;
            if(savedData.type) w.querySelector('#sn-type').value = savedData.type;

            // Helper to update Info Panel inputs from data
            const updateInfoPanelUI = (data) => {
                const keyMap = {
                    'ssn': 'ssn', 'dob': 'dob', 'phone': 'Phone', 'addr': 'Address',
                    'email': 'Email', 'pob': 'POB', 'parents': 'Parents', 'wit': 'Witness'
                };
                Object.entries(keyMap).forEach(([domId, dataKey]) => {
                    const el = w.querySelector(`.sn-side-textarea[data-id="${domId}"]`);
                    if (el && data[dataKey] !== undefined) el.value = data[dataKey];
                });
            };
            
            // Load separate form data
            const formData = GM_getValue('cn_form_data_' + clientId, {});
            this.medProvider = formData['Medical Provider'] || '';
            this.assistiveDevice = formData['Assistive Devices'] || '';
            this.condition = formData['Condition'] || '';

            const fillForm = (force = false) => {
                 // 1. Load the single source of truth: the data from storage.
                 const freshData = GM_getValue('cn_' + clientId, {});
                 // Always load the latest form data
                 const freshFormData = GM_getValue('cn_form_data_' + clientId, {}); 

                 // 2. Scrape the current page for supplementary data.
                 const headerData = app.Core.Scraper.getHeaderData();
                 const sidebarData = app.Core.Scraper.getSidebarData();

                 // 3. FORCE Populate UI from the separate form storage (freshFormData).
                 // This ensures the latest scraped data always wins on refresh.
                 updateInfoPanelUI(freshFormData);
                 this.medProvider = freshFormData['Medical Provider'] || freshData.medProvider || '';
                 this.assistiveDevice = freshFormData['Assistive Devices'] || freshData.assistiveDevice || '';
                 this.condition = freshFormData['Condition'] || freshData.condition || '';

                 // 4. Merge supplementary data from the current page scrape.
                 // Only update if the stored value is empty/default, or if it's a forced refresh.
                 const nameEl = w.querySelector('#sn-cl-name');
                 if (force || nameEl.innerText === 'Client Note') {
                     nameEl.innerText = sidebarData.name || freshData.name || 'Client Note';
                 }

                 // Populate City
                 const cityEl = w.querySelector('#sn-city');
                 const cityVal = headerData['City'] || headerData['Mailing City'] || freshData.city || freshFormData['City'] || '';
                 if (cityEl) cityEl.innerText = cityVal;

                 // Populate State
                 const stateEl = w.querySelector('#sn-state');
                 const stateVal = headerData['State'] || headerData['Mailing State'] || freshData.state || freshFormData['State'] || '';
                 if (stateEl) {
                     stateEl.innerText = stateVal;
                     // Auto-detect Timezone and Color
                     const detectedTZ = this.detectTimezone(stateVal, cityVal);
                     if (detectedTZ) {
                         const tzDropdown = w.querySelector('#sn-tz-select');
                         if (tzDropdown.value !== detectedTZ) {
                             tzDropdown.value = detectedTZ;
                             tzDropdown.dispatchEvent(new Event('change')); // Trigger color change and clock
                         }
                     }
                 }

                 const lvlSelect = w.querySelector('#sn-level');
                 if (force || lvlSelect.value === 'Level') {
                     const statusMap = { 'Initial Application': 'IA', 'Reconsideration': 'Recon', 'Hearing': 'Hearing' };
                     const val = statusMap[headerData['Status']] || headerData['Status'] || freshData.level;
                     if (val) for(let i=0; i<lvlSelect.options.length; i++) { if(lvlSelect.options[i].text === val || lvlSelect.options[i].value === val) lvlSelect.selectedIndex = i; }
                 }

                 const typSelect = w.querySelector('#sn-type');
                 if (force || typSelect.value === 'Type') {
                     const map = { 'SSI': 'T16', 'SSDIB': 'T2', 'SSI/SSDIB': 'Concurrent' };
                     const val = map[headerData['SS Classification']] || headerData['SS Classification'] || freshData.type;
                     if (val) for(let i=0; i<typSelect.options.length; i++) { if(typSelect.options[i].text === val || typSelect.options[i].value === val) typSelect.selectedIndex = i; }
                 }

                 if (headerData['Sub-status']) {
                     w.querySelector('#sn-substatus').value = headerData['Sub-status'];
                 } else if (freshData.substatus) {
                     w.querySelector('#sn-substatus').value = freshData.substatus;
                 }

                 // 5. Update any dependent UI
                 this.updateMedWindowUI();

                 // 6. Save the newly merged state back to storage.
                 saveState();
            };

            // Force fillForm to run if the dropdowns are currently stuck on their default values
            // This prevents old, empty saves from locking the script out.
            if (!savedData.timestamp || w.querySelector('#sn-level').value === 'Level' || w.querySelector('#sn-type').value === 'Type') {
                fillForm();
            }

            // REFRESH BUTTON: Only scrape and update Header + Status Bar
            w.querySelector('#sn-refresh-btn').onclick = () => {
                const headerData = app.Core.Scraper.getHeaderData();
                const sidebarData = app.Core.Scraper.getSidebarData();
                
                // Load existing data for fallback
                const freshData = GM_getValue('cn_' + clientId, {});
                const freshFormData = GM_getValue('cn_form_data_' + clientId, {});

                // Update Header
                w.querySelector('#sn-cl-name').innerText = sidebarData.name || headerData['Client Name'] || freshData.name || 'Client Note';
                const newCity = headerData['City'] || headerData['Mailing City'] || freshData.city || freshFormData['City'] || '';
                w.querySelector('#sn-city').innerText = newCity;

                const newState = headerData['State'] || headerData['Mailing State'] || freshData.state || freshFormData['State'] || '';
                w.querySelector('#sn-state').innerText = newState;
                
                const detectedTZ = this.detectTimezone(newState, newCity);
                if (detectedTZ) {
                     const tzDropdown = w.querySelector('#sn-tz-select');
                     if (tzDropdown.value !== detectedTZ) {
                         tzDropdown.value = detectedTZ;
                         tzDropdown.dispatchEvent(new Event('change'));
                     }
                }

                // Update Status Bar
                const lvlSelect = w.querySelector('#sn-level');
                const statusMap = { 'Initial Application': 'IA', 'Reconsideration': 'Recon', 'Hearing': 'Hearing' };
                const val = statusMap[headerData['Status']] || headerData['Status'];
                if (val) for(let i=0; i<lvlSelect.options.length; i++) { if(lvlSelect.options[i].text === val || lvlSelect.options[i].value === val) lvlSelect.selectedIndex = i; }

                const typSelect = w.querySelector('#sn-type');
                const map = { 'SSI': 'T16', 'SSDIB': 'T2', 'SSI/SSDIB': 'Concurrent' };
                const val2 = map[headerData['SS Classification']] || headerData['SS Classification'];
                if (val2) for(let i=0; i<typSelect.options.length; i++) { if(typSelect.options[i].text === val2 || typSelect.options[i].value === val2) typSelect.selectedIndex = i; }

                if (headerData['Sub-status']) {
                    w.querySelector('#sn-substatus').value = headerData['Sub-status'];
                }
                saveState();
            };

            const partition = w.querySelector('#sn-partition'), noteArea = w.querySelector('#sn-note-wrapper');
            partition.onmousedown = (e) => {
                e.preventDefault(); const startY = e.clientY, startH = noteArea.offsetHeight;
                const onMove = (mv) => { noteArea.style.height = (startH + (mv.clientY - startY)) + 'px'; noteArea.style.flexGrow = 0; };
                const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); saveState(); };
                document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
            };
            
            w.querySelector('#sn-del-btn').onclick = () => { 
                if(confirm("Delete notes?")) { 
                    try { 
                        GM_deleteValue('cn_' + clientId); 
                        GM_deleteValue('cn_form_data_' + clientId); 
                        
                        // Reset internal memory
                        this.medProvider = ''; this.assistiveDevice = ''; this.condition = '';
                        
                        // Close windows immediately
                        this.destroy(clientId);
                        
                        // Update taskbar state (ghost the buttons)
                        this.checkStoredData(clientId);
                    } catch(e) {} 
                } 
            };

            // Bind NCL Button
            const nclBtn = w.querySelector('#sn-ncl-btn');
            if (app.Automation && app.Automation.TaskAutomation) {
                nclBtn.onclick = () => app.Automation.TaskAutomation.runNCL(clientId);
            } else {
                nclBtn.style.display = 'none';
                console.warn('[ClientNote] TaskAutomation module not found.');
            }

            if (!savedData.timestamp) fillForm();

            // Start clock on init
            this.startClock(initialTZ);
        },

        updateAndSaveData(clientId, newData) {
            // SAVE TO DEDICATED STORAGE KEY
            const key = 'cn_form_data_' + clientId;
            const existingData = GM_getValue(key, {});
            const mergedData = { ...existingData, ...newData };
            
            mergedData.timestamp = Date.now(); // Mark as updated
            GM_setValue(key, mergedData);
            this.checkStoredData(clientId);
            console.log(`Saved scraped data for client ${clientId}.`);

            // LIVE UPDATE: Update local UI immediately
            this.updateUI(mergedData);
        },

        startClock(tzKey) {
            if (this.clockInterval) clearInterval(this.clockInterval);
            const el = document.getElementById('sn-time');
            if (!el) return;
            
            const iana = this.ianaTZ[tzKey];
            if (!iana) { el.innerText = ''; return; }

            const update = () => {
                try {
                    const now = new Date();
                    el.innerText = now.toLocaleTimeString('en-US', { timeZone: iana, hour: '2-digit', minute: '2-digit', hour12: false }) + ' ' + tzKey;
                } catch(e) { el.innerText = ''; }
            };
            update();
            this.clockInterval = setInterval(update, 1000);
        },

        // NEW: Centralized UI Update (used by both local save and remote listener)
        updateUI(data) {
            if (!data) return;
            const cnWindow = document.getElementById('sn-client-note');
            if (!cnWindow) return;

            // Update internal memory for medical fields
            if (data['Medical Provider']) this.medProvider = data['Medical Provider'];
            if (data['Assistive Devices']) this.assistiveDevice = data['Assistive Devices'];
            if (data['Condition']) this.condition = data['Condition'];
            
            // Update Info Panel Textareas
            const keyMap = {
                'Address': 'addr', 'Phone': 'phone', 'Email': 'email', 
                'POB': 'pob', 'Parents': 'parents', 'Witness': 'wit'
            };
            Object.entries(keyMap).forEach(([scrapedKey, domId]) => {
                if (data[scrapedKey] !== undefined) {
                    const el = cnWindow.querySelector(`.sn-side-textarea[data-id="${domId}"]`);
                    if (el) {
                        el.value = data[scrapedKey];
                        // Trigger resize
                        el.style.height = '1px';
                        el.style.height = (el.scrollHeight) + 'px';
                    }
                }
            });
            
            // Update City if present
            if (data['City']) {
                const cityEl = cnWindow.querySelector('#sn-city');
                if (cityEl) cityEl.innerText = data['City'];
            }

            // Update State if present in remote data
            if (data['State']) {
                const stateEl = cnWindow.querySelector('#sn-state');
                if (stateEl && stateEl.innerText !== data['State']) {
                    stateEl.innerText = data['State'];
                    // Trigger logic to update color/time if needed
                    const currentCity = data['City'] || cnWindow.querySelector('#sn-city').innerText;
                    const detectedTZ = this.detectTimezone(data['State'], currentCity);
                    if (detectedTZ) {
                         const tzDropdown = cnWindow.querySelector('#sn-tz-select');
                         if (tzDropdown && tzDropdown.value !== detectedTZ) {
                             tzDropdown.value = detectedTZ;
                             tzDropdown.dispatchEvent(new Event('change'));
                         }
                    }
                }
            }

            // Update MedWindow UI if open
            this.updateMedWindowUI();
        },

        checkStoredData(clientId) {
            if (!clientId) return;
            const cnBtn = document.getElementById('tab-sn-client-note');
            const medBtn = document.getElementById('tab-sn-med-popout');
            
            // Check Client Note Data
            const cnData = GM_getValue('cn_' + clientId);
            if (cnData && cnData.timestamp) {
                if (cnBtn) cnBtn.classList.add('sn-has-data');
            } else {
                if (cnBtn) cnBtn.classList.remove('sn-has-data');
            }

            // Check Med Data
            const formData = GM_getValue('cn_form_data_' + clientId, {});
            const hasMed = formData['Medical Provider'] || formData['Assistive Devices'] || formData['Condition'];
            if (hasMed && medBtn) medBtn.classList.add('sn-has-data');
            else if (medBtn) medBtn.classList.remove('sn-has-data');
        },

        destroy(clientId) {
            const w = document.getElementById('sn-client-note');
            if (w) w.remove();
            
            const mw = document.getElementById('sn-med-popout');
            if (mw) { mw.remove(); app.Core.Windows.updateTabState('sn-med-popout'); }

            if (this.listeners[clientId]) {
                GM_removeValueChangeListener(this.listeners[clientId]);
                delete this.listeners[clientId];
            }
            const settingsToWatch = ['sn_ui_theme', 'sn_tz_note_color', 'sn_note_follow_theme', 'sn_note_default_color'];
            settingsToWatch.forEach(key => {
                if (this.listeners[key]) {
                    GM_removeValueChangeListener(this.listeners[key]);
                    delete this.listeners[key];
                }
            });

            if (this.clockInterval) { clearInterval(this.clockInterval); this.clockInterval = null; }
        },

        updateMedWindowUI() {
            const medWindow = document.getElementById('sn-med-popout');
            if (medWindow) {
                const setVal = (field, val) => { const el = medWindow.querySelector(`textarea[data-field="${field}"]`); if(el) el.value = val || ''; };
                setVal('Medical Provider', this.medProvider);
                setVal('Assistive Device', this.assistiveDevice);
                setVal('Condition', this.condition);
            }
        },

        toggleMedWindow() {
            const mid = 'sn-med-popout';
            const medWindow = document.getElementById(mid);

            if (medWindow) {
                if (medWindow.style.display === 'none') {
                    medWindow.style.display = 'flex';
                    app.Core.Windows.bringToFront(medWindow);
                } else {
                    medWindow.style.display = 'none';
                }
                app.Core.Windows.updateTabState(mid);
                return;
            }

            const w = document.getElementById('sn-client-note');
            if (!w || w.style.display === 'none') {
                alert('Client Note must be open to create the Medical Providers window.');
                return;
            }

            // --- MED PROVIDER POP-OUT ---
            const rect = w.getBoundingClientRect();
            const mwW = window.innerWidth * 0.55;
            const mwH = 265;
            const mwLeft = rect.left + (rect.width / 2) - (mwW / 2);
            const medWindowWidth = 1050;
             const medWindowHeight = 265;
            const mwTop =  window.innerHeight - medWindowHeight - 45;
            

            const mw = document.createElement('div');
            mw.id = mid; mw.className = 'sn-window';
            mw.style.cssText = `width:${mwW}px; height:${mwH}px; top:${mwTop}px; left:${mwLeft}px; background:#f9f9f9; display:flex; flex-direction:column; box-shadow:0 4px 15px rgba(0,0,0,0.4); font-size:12px; z-index:10005;`;

            const style = document.createElement('style');
            style.innerHTML = `
                td[contenteditable]:empty::before { content: attr(placeholder); color: #aaa; font-style: italic; }
                #sn-med-table { table-layout: fixed; width: 100%; border-collapse: collapse; }
                #sn-med-table td, #sn-med-table th { word-wrap: break-word; overflow-wrap: break-word; }
            `;
            mw.appendChild(style);

            const scrapedSSN = app.Core.Scraper.getSidebarData().ssn || '--';
            const clientName = w.querySelector('#sn-cl-name').innerText || 'Client';


            const headerData = app.Core.Scraper.getHeaderData();
            // Use data from ClientNote memory (which might be saved or scraped)
            const medProviderText = this.medProvider || headerData['Medical Provider'] || '';
            const assistiveDeviceText = this.assistiveDevice || headerData['Assistive Device'] || '';
            const conditionText = this.condition || headerData['Condition'] || '';
            const newPos = GM_getValue('def_pos_MED', { width: '1050px', height: '265px', bottom: '45px', left: '160px' });
            mw.innerHTML += `
                <div class="sn-header" style="background:var(--sn-bg-light); padding:5px; display:flex; align-items:center; cursor:move; border-bottom:1px solid var(--sn-border);">
                    <button id="sn-med-parse-btn" title="Parse medical text" style="margin-right:10px; padding:4px 8px; cursor:pointer; border:1px solid #999; background:var(--sn-bg-lighter); border-radius:4px; font-size:12px;">Parse Medical Data</button>
                    <span style="font-weight:bold; margin-right:auto;">Medical Providers Table</span>
                    <button id="sn-med-close-btn" style="border:none; background:none; cursor:pointer; font-size:14px; font-weight:bold;">×</button>
                </div>
                <div style="display:flex; flex-grow:1; overflow:hidden;">
                    <div id="sn-med-left" style="width:30%; display:flex; flex-direction:column; border-right:1px solid #ccc; background:#fff; flex-shrink:0; font-size:inherit;">
                        <div style="padding:10px; overflow-y:auto; flex-grow:1; display:flex; flex-direction:column; gap:8px;">
                            <div style="display:flex; justify-content:space-between; align-items:center; font-weight:bold; border-bottom:1px solid #eee; padding-bottom:5px; margin-bottom: 5px;">
                                <span>Medical Information</span>
                                <div style="display:flex; align-items:center;">
                                    <button id="sn-med-font-dec" style="cursor:pointer; border:1px solid #999; background:#eee; width:20px; border-radius:3px; margin-right:2px; font-weight:normal;">-</button>
                                    <button id="sn-med-font-inc" style="cursor:pointer; border:1px solid #999; background:#eee; width:20px; border-radius:3px; font-weight:normal;">+</button>
                                </div>
                            </div>
                            <div><label style="font-weight:bold; font-size:11px; color:#555; display:block; margin-bottom:2px;">Medical Provider</label><textarea class="sn-med-textarea" data-field="Medical Provider" readonly style="width:100%; height: 80px; resize:vertical; border:1px solid #ccc; padding:4px; background:#f9f9f9; font-family:inherit; font-size:inherit;">${medProviderText}</textarea></div>
                            <div><label style="font-weight:bold; font-size:11px; color:#555; display:block; margin-bottom:2px;">Assistive Device</label><textarea class="sn-med-textarea" data-field="Assistive Device" readonly style="width:100%; height: 40px; resize:vertical; border:1px solid #ccc; padding:4px; background:#f9f9f9; font-family:inherit; font-size:inherit;">${assistiveDeviceText}</textarea></div>
                            <div><label style="font-weight:bold; font-size:11px; color:#555; display:block; margin-bottom:2px;">Condition</label><textarea class="sn-med-textarea" data-field="Condition" readonly style="width:100%; height: 40px; resize:vertical; border:1px solid #ccc; padding:4px; background:#f9f9f9; font-family:inherit; font-size:inherit;">${conditionText}</textarea></div>
                        </div>
                    </div>
                    <div id="sn-med-partition" style="width:5px; cursor:col-resize; background:#f0f0f0; border-left:1px solid #ddd; border-right:1px solid #ddd; flex-shrink:0;"></div>
                    <div style="flex-grow:1; display:flex; flex-direction:column; background:#fff; min-width:200px; overflow:hidden;">
                        <div style="padding:8px; border-bottom:1px solid #eee; text-align:center; flex-shrink:0;">
                            <span style="font-size:14px; font-weight:bold; color:#333;">Client: ${clientName}</span>
                            <span style="margin:0 10px; color:#ccc;">|</span>
                            <span style="font-size:14px; font-weight:bold; color:#333;">SSN: ${scrapedSSN}</span>
                        </div>
                        <div style="flex-grow:1; padding:10px; overflow-y:auto;">
                            <table id="sn-med-table" style="font-size:inherit;"><colgroup><col style="width:auto;"><col style="width:auto;"><col style="width:100px;"><col style="width:90px;"><col style="width:90px;"><col style="width:90px;"></colgroup><thead><tr style="background:#eee; text-align:left;"><th style="border:1px solid #ccc; padding:4px;">Dr/Facilities</th><th style="border:1px solid #ccc; padding:4px;">Address</th><th style="border:1px solid #ccc; padding:4px;">Phone</th><th style="border:1px solid #ccc; padding:4px;">First Visit</th><th style="border:1px solid #ccc; padding:4px;">Last Visit</th><th style="border:1px solid #ccc; padding:4px;">Next Appt</th></tr></thead><tbody>${[1,2,3].map(() => `<tr><td contenteditable="true" placeholder="Facilities / Doctor" style="border:1px solid #ccc; padding:4px;"></td><td contenteditable="true" style="border:1px solid #ccc; padding:4px;"></td><td contenteditable="true" style="border:1px solid #ccc; padding:4px;"></td><td contenteditable="true" style="border:1px solid #ccc; padding:4px;"></td><td contenteditable="true" style="border:1px solid #ccc; padding:4px;"></td><td contenteditable="true" style="border:1px solid #ccc; padding:4px;"></td></tr>`).join('')}</tbody></table>
                            <div style="padding-top:10px; text-align:center;"><button style="padding:5px 15px; cursor:pointer; font-weight:bold;">📄 Generate PDF</button></div>
                        </div>
                    </div>
                </div>
                <div class="sn-resizer rs-n"></div><div class="sn-resizer rs-s"></div><div class="sn-resizer rs-e"></div><div class="sn-resizer rs-w"></div><div class="sn-resizer rs-ne"></div><div class="sn-resizer rs-nw"></div><div class="sn-resizer rs-se"></div><div class="sn-resizer rs-sw"></div>
            `;
            document.body.appendChild(mw);
            app.Core.Windows.setup(mw, null, mw.querySelector('.sn-header'), 'MED');
            
            app.Core.Windows.bringToFront(mw);

            mw.querySelector('#sn-med-close-btn').onclick = () => mw.remove();

            const runMedicalParse = () => {
                // 1. Grab the text from the Medical Provider textarea
                const medTextarea = mw.querySelector('textarea[data-field="Medical Provider"]');
                if (!medTextarea.value.trim()) return;
    
                // 2. Parse the text using your existing function
                const parsedData = this.parseMedicalProviders(medTextarea.value);
                const tbody = mw.querySelector('#sn-med-table tbody');
    
                // 3. Clear out the default empty rows
                tbody.innerHTML = '';
    
                // 4. Loop through the parsed data and build the new rows
                parsedData.forEach(provider => {
                    if (provider.doctorFacility || provider.address || provider.phone) {
                        tbody.insertAdjacentHTML('beforeend', `
                            <tr>
                                <td contenteditable="true" style="border:1px solid #ccc; padding:4px;">${provider.doctorFacility || ''}</td>
                                <td contenteditable="true" style="border:1px solid #ccc; padding:4px;">${provider.address || ''}</td>
                                <td contenteditable="true" style="border:1px solid #ccc; padding:4px;">${provider.phone || ''}</td>
                                <td contenteditable="true" style="border:1px solid #ccc; padding:4px;">${provider.firstVisit || ''}</td>
                                <td contenteditable="true" style="border:1px solid #ccc; padding:4px;">${provider.lastVisit || ''}</td>
                                <td contenteditable="true" style="border:1px solid #ccc; padding:4px;">${provider.nextVisit || ''}</td>
                            </tr>
                        `);
                    }
                });
    
                // 5. Always leave one empty row at the bottom for manual entry
                tbody.insertAdjacentHTML('beforeend', `
                    <tr>
                        <td contenteditable="true" placeholder="Facilities / Doctor" style="border:1px solid #ccc; padding:4px;"></td>
                        <td contenteditable="true" style="border:1px solid #ccc; padding:4px;"></td>
                        <td contenteditable="true" style="border:1px solid #ccc; padding:4px;"></td>
                        <td contenteditable="true" style="border:1px solid #ccc; padding:4px;"></td>
                        <td contenteditable="true" style="border:1px solid #ccc; padding:4px;"></td>
                        <td contenteditable="true" style="border:1px solid #ccc; padding:4px;"></td>
                    </tr>
                `);
            };
            mw.querySelector('#sn-med-parse-btn').onclick = runMedicalParse;

            // Automatically parse on open if the table is empty (i.e., has default content)
            runMedicalParse();

            mw.querySelectorAll('.sn-med-textarea').forEach(inp => {
                inp.ondblclick = () => { inp.removeAttribute('readonly'); inp.style.background = '#fff'; inp.style.border = '1px solid var(--sn-border)'; inp.focus(); };
                inp.onblur = () => { inp.setAttribute('readonly', true); inp.style.background = '#f9f9f9'; inp.style.border = '1px solid #ccc'; };
                inp.oninput = () => {
                    const field = inp.getAttribute('data-field');
                    if (field === 'Medical Provider') this.medProvider = inp.value;
                    if (field === 'Assistive Device') this.assistiveDevice = inp.value;
                    if (field === 'Condition') this.condition = inp.value;
                    // Trigger save in ClientNote (which listens for inputs on 'w', but this is a separate window, so we might need to manually trigger save or rely on close)
                    // Ideally, we update the main state. For now, we update the memory vars which get saved when ClientNote saves.
                    // To be safe, let's trigger a save on the main window if possible, or just wait.
                    // Better: Update the variables, and if the main window is open, trigger its save.
                    const cn = document.getElementById('sn-client-note');
                    if(cn) cn.dispatchEvent(new Event('input')); 
                };
            });

            const medPart = mw.querySelector('#sn-med-partition');
            const leftPanel = mw.querySelector('#sn-med-left');
            medPart.onmousedown = (e) => {
                e.preventDefault(); const startX = e.clientX, startW = leftPanel.offsetWidth;
                const onMove = (mv) => { leftPanel.style.width = Math.max(100, (startW + (mv.clientX - startX))) + 'px'; };
                const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
                document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
            };

            const updateMedFont = (d) => { let cur = parseInt(mw.style.fontSize) || 12; mw.style.fontSize = Math.max(9, Math.min(18, cur + d)) + 'px'; };
            mw.querySelector('#sn-med-font-dec').onclick = (e) => { e.stopPropagation(); updateMedFont(-1); };
            mw.querySelector('#sn-med-font-inc').onclick = (e) => { e.stopPropagation(); updateMedFont(1); };

            const table = mw.querySelector('#sn-med-table');
            table.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    const row = e.target.closest('tr');
                    if (row && row === table.querySelector('tbody tr:last-child')) {
                        e.preventDefault();
                        const newRow = row.cloneNode(true);
                        newRow.querySelectorAll('td').forEach(td => td.innerText = '');
                        table.querySelector('tbody').appendChild(newRow);
                        newRow.querySelector('td').focus();
                    }
                }
            });
        },

        parseMedicalProviders(text) {
            // 1. Split into blocks by one or more empty lines.
            const providerBlocks = text.split(/\n\s*\n/).filter(block => block.trim() !== '');

            const providers = [];

            // 2. Strict Date Formatter
            const formatMedDate = (dStr) => {
                if (!dStr || dStr.toLowerCase() === 'n/a') return "";
                
                // Clean up ordinals (e.g., "26th" -> "26")
                let cleanStr = dStr.trim().replace(/\b(\d+)(st|nd|rd|th)\b/gi, '$1');
                
                // Rule: Only year (e.g., "2016") -> 01/01/yyyy
                if (/^\d{4}$/.test(cleanStr)) {
                    return `01/01/${cleanStr}`;
                }
                
                // Rule: Month Year (e.g., "June 2022") -> mm/01/yyyy
                const monthYearMatch = cleanStr.match(/^([a-zA-Z]+)\s+(\d{4})$/);
                if (monthYearMatch) {
                    const d = new Date(`${monthYearMatch[1]} 1, 2000`);
                    if (!isNaN(d.getTime())) {
                        const m = (d.getMonth() + 1).toString().padStart(2, '0');
                        return `${m}/01/${monthYearMatch[2]}`;
                    }
                }
                
                // Normal full dates -> mm/dd/yyyy
                const d = new Date(cleanStr);
                if (!isNaN(d.getTime())) {
                    const m = (d.getMonth() + 1).toString().padStart(2, '0');
                    const day = d.getDate().toString().padStart(2, '0');
                    return `${m}/${day}/${d.getFullYear()}`;
                }
                
                // If it isn't a recognized date, return the original string (e.g., "does not remember")
                return dStr;
            };

            for (const block of providerBlocks) {
                // 3. More flexible regexes. Using /m for multiline to anchor with ^, and /i for case-insensitivity.
                let doctorName = (block.match(/(?:Dr\.?\sName:|Dr information:)\s*([^\n\r]+)/i) || [])[1] || "";
                let clinicName = (block.match(/(?:Name of clinic\/ ?hospital:|Doctor\/Facility:)\s*([^\n\r]+)/i) || [])[1] || "";
                let doctorFacility = "";

                if (clinicName && doctorName) {
                    doctorFacility = `${clinicName} (${doctorName})`;
                } else {
                    doctorFacility = clinicName || doctorName;
                }

                // If still no name, assume the first line is the name, as long as it doesn't look like another field.
                if (!doctorFacility) {
                    const firstLine = block.trim().split('\n')[0].trim();
                    if (!/:\s*$/.test(firstLine) && !/^\s*$/.test(firstLine)) {
                        doctorFacility = firstLine;
                    }
                }

                // Capture address allowing for multiple lines (stop at next keyword or end of block)
                let addressMatch = block.match(/^Address:\s*([\s\S]+?)(?=\n\s*(?:Phone|number|1st|First|FV|Last|Next|Appt|Condition)|$)/im);
                let address = "";
                if (addressMatch) {
                    address = addressMatch[1].replace(/\r?\n/g, ', ').trim().replace(/,\s*,/g, ', ').replace(/,\s*$/, '');
                }

                let phone = (block.match(/^(?:Phone(?: Number)?|number):?\s*([^\n\r]+)/im) || [])[1] || "";
                let firstVisit = (block.match(/^(?:1st V|First Visit|FV):?\s*([^\n\r]+)/im) || [])[1] || "";
                let lastVisit = (block.match(/^(?:Last V|Last Visit):?\s*([^\n\r]+)/im) || [])[1] || "";
                let nextVisit = (block.match(/^(?:Next App(?:ointmen)?t|Next Visit|Appt):?\s*([^\n\r]+)/im) || [])[1] || "";

                const firstLastVisitMatch = block.match(/(?:First and last visit:)\s*([^\n\r]+)/i);
                if (firstLastVisitMatch) {
                    const dates = firstLastVisitMatch[1].split(',').map(d => d.trim());
                    if (dates.length === 2) {
                        [firstVisit, lastVisit] = dates;
                    }
                }

                // Only add if we found a name.
                if (doctorFacility) {
                    providers.push({
                        doctorFacility: doctorFacility.trim(),
                        address: address.trim(),
                        phone: app.Core.Utils.formatPhoneNumber(phone.trim()),
                        firstVisit: formatMedDate(firstVisit),
                        lastVisit: formatMedDate(lastVisit),
                        nextVisit: formatMedDate(nextVisit)
                    });
                }
            }

            return providers;
        }

    };

    // Assign to the namespace
    app.Features.ClientNote = ClientNote;



})(window.CM_App = window.CM_App || {});