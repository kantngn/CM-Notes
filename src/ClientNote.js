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
            
            const headerData = app.Core.Scraper.getHeaderData();
            const livePageData = app.Core.Scraper.getAllPageData();
            const savedData = GM_getValue('cn_' + clientId, {});
            const savedFontSize = GM_getValue('cn_font_' + clientId, '12px');
            const detectedTZ = this.detectTimezone(savedData.state, savedData.city);
            const initialTZ = savedData.tz || detectedTZ || null;

            const [bodyColor, headerColor] = this.getNoteColors(initialTZ, savedData);
            const defPos = GM_getValue('def_pos_CN', { width: '500px', height: '400px', top: '100px', left: '100px' });

            let finalHeaderColor = headerColor;
            if (savedData.customColor) {
                 let headerTheme = Object.values(app.Core.Themes).find(t => t.lighter === savedData.customColor);
                 if (headerTheme) finalHeaderColor = headerTheme.light;
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

            // Saved data takes priority, if not exist > take live data. 
            const statusDisplay = savedData.status || livePageData.level || 'Status';
            const ssClassDisplay = savedData.ssClassification || livePageData.cType || 'Classification';
            const substatusDisplay = savedData.substatus || livePageData.status || 'Sub-status';
            w.innerHTML = `
                    <style>
                        #sn-notes:empty::before { content: attr(placeholder); color: #999; pointer-events: none; }
                        .sn-todo-item { display: flex; align-items: center; margin-bottom: 2px; }
                        .sn-todo-item input[type="checkbox"] { margin-right: 8px; flex-shrink: 0; cursor: pointer; }
                        .sn-todo-item span { flex-grow: 1; outline: none; }
                        .sn-todo-item[data-checked="true"] > span { text-decoration: line-through; color: #888; }
                        .sn-todo-item .sn-todo-del { margin-left: auto; border: none; background: transparent; color: #aaa; cursor: pointer; display: inline-block; font-size: 1.2em; padding: 0 5px; opacity: 0; visibility: hidden; transition: opacity 0.2s, visibility 0.2s; }
                        .sn-todo-item[data-checked="true"] .sn-todo-del { visibility: visible; opacity: 0.2; }
                        .sn-todo-item[data-checked="true"]:hover .sn-todo-del { opacity: 1; }
                        .sn-todo-item.dragging { opacity: 0.5; background: #e0e0e0; }
                    </style>
                    <div id="sn-wrapper" style="position:relative; width:100%; height:100%; display:flex; flex-direction:row;">

                        <div id="sn-spine-strip" style="width:28px; background:var(--sn-primary-text); display:flex; flex-direction:column; align-items:center; padding-top:10px; border-right:1px solid rgba(0,0,0,0.2); z-index:20; flex-shrink:0;">
                            <button id="sn-refresh-btn" title="Refresh Scraped Data" style="border:none; background:transparent; cursor:pointer; font-size:14px; margin-bottom:5px; color:var(--sn-bg-light); transition:transform 0.2s;">🔄</button>
                            <div class="sn-spine-btn" data-panel="info" title="Client Info" style="writing-mode:vertical-rl; text-orientation:mixed; transform:rotate(180deg); padding:15px 5px; color:var(--sn-bg-light); cursor:pointer; font-weight:bold; font-size:12px; margin-bottom:5px; transition:background 0.2s;">CL Info</div>
                            <div class="sn-spine-btn" data-panel="ssa" title="SSA Contacts" style="writing-mode:vertical-rl; text-orientation:mixed; transform:rotate(180deg); padding:15px 5px; color:var(--sn-bg-light); cursor:pointer; font-weight:bold; font-size:12px; margin-bottom:5px; transition:background 0.2s;">SSA</div>
                            <div class="sn-spine-btn" data-panel="matter" title="Matter Details" style="writing-mode:vertical-rl; text-orientation:mixed; transform:rotate(180deg); padding:15px 5px; color:var(--sn-bg-light); cursor:pointer; font-weight:bold; font-size:12px; margin-bottom:5px; transition:background 0.2s;">Matter</div>
                        </div>

                        <div id="sn-side-panel" style="position:absolute; right:100%; top:0; bottom:0; width:0px; display:none; flex-direction:column; background:rgba(255,255,255,0.95); border:1px solid #999; border-right:none; box-shadow:-2px 0 5px rgba(0,0,0,0.1); font-size:12px;">
                             <div id="sn-panel-header" style="padding:5px; font-weight:bold; background:var(--sn-bg-light); border-bottom:1px solid #999; display:flex; align-items:center; color:#333;">
                                <span id="sn-panel-title" style="margin-right:auto;">Info</span>
                                <button id="sn-side-font-dec" style="cursor:pointer; border:1px solid #999; background:#eee; width:18px; border-radius:3px; margin-right:2px;">-</button>
                                <button id="sn-side-font-inc" style="cursor:pointer; border:1px solid #999; background:#eee; width:18px; border-radius:3px; margin-right:5px;">+</button>
                                <button id="sn-panel-close" style="border:none; background:none; cursor:pointer; font-weight:bold;">×</button>
                             </div>
                             <div id="sn-panel-body" style="padding:0px; overflow-y:auto; flex-grow:1;"></div>
                             <div class="sn-panel-resizer-left" style="width:5px; cursor:col-resize; height:100%; position:absolute; left:0; top:0; z-index:10;"></div>
                        </div>

                        <div style="flex-grow:1; display:flex; flex-direction:column; min-width:200px; height:100%; overflow:hidden;">
                            
                            <div class="sn-header" id="sn-cn-header" style="background:${finalHeaderColor}; border-bottom:1px solid rgba(0,0,0,0.1); padding:4px; display:flex; align-items:center;">
                                
                                <span id="sn-cl-name" style="font-weight:bold; margin-left:4px; color:#333;">${savedData.name || headerData.clientName || 'Client Note'}</span>
                                <div style="flex-grow:1;"></div>
                                <span id="sn-city" style="font-weight:bold; color:var(--sn-primary-dark);">${savedData.city || ''}</span>
                                <span style="margin:0 4px; font-weight:bold; color:#555;">-</span>
                                <span id="sn-state" style="font-weight:bold; color:var(--sn-primary-dark);">${savedData.state || ''}</span>
                                <span style="margin:0 4px; font-weight:bold; color:#555;">-</span>
                                <span id="sn-time" style="font-weight:bold; font-size:1em; color:#333; min-width:60px;"></span>
                                <div style="display:flex; align-items:center; margin-left:8px;">
                                    <select id="sn-tz-select" style="display:none;">
                                        <option value="EST">EST</option><option value="CST">CST</option><option value="MST">MST</option>
                                        <option value="PST">PST</option><option value="AKST">AKST</option><option value="HST">HST</option>
                                    </select>
                                    <button id="sn-min-btn" style="cursor:pointer; background:none; border:none; font-weight:bold; padding:0 5px;">_</button>
                                </div>
                            </div>

                            <div style="padding: 5px; border-bottom:1px solid #ccc; background:rgba(255,255,255,0.3); display:flex; align-items:center; text-align:center; font-size: 0.9em;">
                                <div id="sn-status" title="Status" style="flex:1; padding:2px 4px; color:#333; cursor:default; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:bold;">${statusDisplay}</div>
                                <span style="color: #aaa; padding: 0 4px;">||</span>
                                <div id="sn-ss-classification" title="SS Classification" style="flex:1; padding:2px 4px; color:#333; cursor:default; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${ssClassDisplay}</div>
                                <span style="color: #aaa; padding: 0 4px;">||</span>
                                <div id="sn-substatus" title="Sub-status" style="flex:1.5; padding:2px 4px; color:#333; cursor:default; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${substatusDisplay}</div>
                            </div>

                            <div style="display:flex; flex-direction:column; flex-grow:1; height:100%; overflow:hidden;">
                                <div id="sn-note-wrapper" style="position:relative; flex-grow:1; min-height:50px;">
                                    <div id="sn-notes" contenteditable="true" style="width:100%; height:100%; resize:none; border:none; padding:8px; background:transparent; font-family:sans-serif; font-size:inherit; box-sizing:border-box; overflow-y:auto;" placeholder="Case notes..."></div>
                                    <button id="sn-ncl-btn" title="Task NCL" style="position:absolute; bottom:5px; right:15px; font-size:10px; padding:2px 6px; cursor:pointer; background:rgba(255,255,255,0.6); border:1px solid #999; border-radius:3px; color:var(--sn-primary-text); font-weight:bold;">NCL</button>
                                </div>
                            </div>

                            <div id="sn-indicators" style="display:none; justify-content:space-around; align-items:center; padding:4px; background:rgba(255,255,255,0.4); border-top:1px solid rgba(0,0,0,0.1);">
                                <div class="sn-ind-item" title="CM1 Update Status" style="display:flex; align-items:center;">
                                    <div id="sn-ind-cm1" style="width:10px; height:10px; border-radius:50%; background:#ccc; border:1px solid rgba(0,0,0,0.2); margin-right:4px;"></div>
                                    <span style="font-size:0.8em; font-weight:bold; color:#555;">CM1Up</span>
                                </div>
                                <div class="sn-ind-item" title="Status Update Status" style="display:flex; align-items:center;">
                                    <div id="sn-ind-status" style="width:10px; height:10px; border-radius:50%; background:#ccc; border:1px solid rgba(0,0,0,0.2); margin-right:4px;"></div>
                                    <span style="font-size:0.8em; font-weight:bold; color:#555;">Status</span>
                                </div>
                                <div class="sn-ind-item" id="sn-ind-mail-btn" style="cursor:pointer; display:flex; align-items:center;" title="Check Mail Log">
                                    <div id="sn-ind-mail" style="width:10px; height:10px; border-radius:50%; background:#ff5252; border:1px solid rgba(0,0,0,0.2); margin-right:4px;"></div>
                                    <span style="font-size:0.8em; font-weight:bold; color:#555;">Mail Log</span>
                                </div>
                                <div class="sn-ind-item" id="sn-ind-task-btn" style="cursor:pointer; display:flex; align-items:center;" title="Clear Tasks">
                                    <div id="sn-ind-task" style="width:10px; height:10px; border-radius:50%; background:#ff5252; border:1px solid rgba(0,0,0,0.2); margin-right:4px;"></div>
                                    <span style="font-size:0.8em; font-weight:bold; color:#555;">Task Clear</span>
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

                                <div class="sn-cp-dropdown" style="position: relative; margin-right:5px;">
                                    <button class="sn-cp-btn" title="Change Color">🎨</button>
                                    <div class="sn-cp-content" style="display:none; position:absolute; bottom:100%; right:0; background:white; border:1px solid #999; padding:5px; border-radius:4px; box-shadow:0 2px 5px rgba(0,0,0,0.2); margin-bottom:5px; z-index: 25;">${paletteHTML}</div>
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

            // --- INDICATORS LOGIC ---
            const updateIndicators = (data = {}) => {
                const now = new Date();
                const firstDayCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);

                const checkDate = (d1, d2) => {
                    const t1 = d1 ? Date.parse(d1) : 0;
                    const t2 = d2 ? Date.parse(d2) : 0;
                    const lastTime = Math.max(isNaN(t1) ? 0 : t1, isNaN(t2) ? 0 : t2);
                    
                    if (lastTime === 0) return '#ff5252'; // Red (No date)

                    const lastDate = new Date(lastTime);
                    const diffTime = now - lastDate;
                    const diffDays = diffTime / (1000 * 60 * 60 * 24);

                    if (diffDays > 30) return '#ff5252'; // Red
                    // Yellow if > 20 days AND was in the previous month (strictly before current month)
                    if (diffDays > 20 && lastDate < firstDayCurrentMonth) return '#ffeb3b'; 
                    
                    return '#69f0ae'; // Green
                };

                const getValue = (selector, key) => { if(data[key]) return data[key]; const el = w.querySelector(selector); return el ? el.value : null; };

                const cm1Upd = getValue('#sn-last-cm1-upd', 'LastCU') || GM_getValue('cn_' + clientId, {}).LastCU;
                const cm1Att = getValue('#sn-last-cm1-att', 'LastCA') || GM_getValue('cn_' + clientId, {}).LastCA;
                w.querySelector('#sn-ind-cm1').style.background = checkDate(cm1Upd, cm1Att);

                const statUpd = getValue('#sn-last-status-upd', 'LastSU') || GM_getValue('cn_' + clientId, {}).LastSU;
                const statAtt = getValue('#sn-last-status-att', 'lastStatusAtt') || GM_getValue('cn_' + clientId, {}).lastStatusAtt;
                w.querySelector('#sn-ind-status').style.background = checkDate(statUpd, statAtt);
            };

            // Toggle logic for Mail Log and Task Clear
            const toggleInd = (id) => {
                const el = w.querySelector(id);
                el.style.background = el.style.background === 'rgb(105, 240, 174)' ? '#ff5252' : '#69f0ae'; // Toggle Red/Green
            };
            w.querySelector('#sn-ind-mail-btn').onclick = () => toggleInd('#sn-ind-mail');
            w.querySelector('#sn-ind-task-btn').onclick = () => toggleInd('#sn-ind-task');

            // --- REVISIT DATE PICKER ---
            const revisitCheck = w.querySelector('#sn-revisit-check');
            const revisitDate = w.querySelector('#sn-revisit-date');
            revisitCheck.addEventListener('change', (e) => {
                if (e.target.checked) {
                    try {
                        revisitDate.showPicker();
                    } catch (err) {
                        // showPicker might not be supported or fail in some contexts.
                        console.warn('[ClientNote] Could not programmatically open date picker.', err);
                    }
                }
            });

            // --- SIDEBAR (Info & Fax) ---
            const sidePanel = w.querySelector('#sn-side-panel');
            const sideBody = w.querySelector('#sn-panel-body');
            const sideTitle = w.querySelector('#sn-panel-title');

            const updateSideFont = (d) => { let cur = parseInt(sidePanel.style.fontSize) || 12; sidePanel.style.fontSize = Math.max(9, Math.min(16, cur + d)) + 'px'; };
            w.querySelector('#sn-side-font-dec').onclick = (e) => { e.stopPropagation(); updateSideFont(-1); };
            w.querySelector('#sn-side-font-inc').onclick = (e) => { e.stopPropagation(); updateSideFont(1); };

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
                const sidebarData = app.Core.Scraper.getAllPageData();
                const freshData = GM_getValue('cn_' + clientId, {}); // Get latest data
                const formData = GM_getValue('cn_form_data_' + clientId, {}); // Get latest form data
                const isPopulated = formData && Object.keys(formData).length > 0;
                
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
                        <button id="sn-open-ssd-btn" style="flex:1; padding:5px; cursor:pointer; font-weight:bold; background:var(--sn-bg-lighter); border:1px solid var(--sn-border); border-radius:4px; color:var(--sn-primary-dark); white-space:nowrap; display:${isPopulated ? 'none' : 'block'};">Open SSD App</button>
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
                                
                container.querySelector('#sn-open-ssd-btn').onclick = () => {
                    // clientId is already available in the closure scope from create(clientId)
                    const id15 = clientId.substring(0, 15);
                    const targetURL = `https://kdcv1.my.site.com/forms/s/?uuid=a0UfL000002vlqfUAA&recordid=${id15}&clientId=${clientId}`;
                    
                    GM_openInTab(targetURL, { active: false, insert: true });

                    // Set up a ONE-TIME listener for when the SSD background tab finishes scraping
                    const tempListenerId = GM_addValueChangeListener(`cn_form_data_${clientId}`, (name, old_value, new_value, remote) => {
                        if (remote && new_value && Object.keys(new_value).length > 0) {
                            console.log("[ClientNote] 📨 SSD data received from background tab:", new_value);

                            // Update the Client Note with the scraped data
                            this.updateUI(new_value);
                            
                            // Hide the button
                            const btn = document.getElementById('sn-open-ssd-btn');
                            if(btn) btn.style.display = 'none';

                            // Clean up this temporary listener after receiving data (only happens once)
                            GM_removeValueChangeListener(tempListenerId);
                        }
                    });
                };

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

            const renderMatterPanel = (container) => {
                // Per user request: data is scraped every time panel is opened and is not saved.
                const scrapedData = app.Core.Scraper.getAllPageData();
                const displayStyle = "width:100%; box-sizing:border-box; border:none; padding:2px 4px; background:#f0f0f0; font-family:inherit; font-size:inherit; cursor:default; border-radius: 3px;";

                const createField = (label, value = '', id = '') => {
                    return `<div style="flex:1; min-width:0;"><div style="font-size:0.85em; color:#555; font-weight:bold; margin-bottom:2px;">${label}</div><input id="${id}" value="${value || ''}" readonly style="${displayStyle}"></div>`;
                };

                const createCheckbox = (label, id = '', checked = false) => {
                    return `<label style="display:flex; align-items:center; font-size:0.9em; color:#333; padding-bottom: 3px;"><input type="checkbox" id="${id}" ${checked ? 'checked' : ''} disabled style="margin-right:4px; transform: scale(1.2);">${label}</label>`;
                };

                const createInlineField = (label, value = '', id = '') => {
                    return `<div style="display:flex; align-items:center; gap:8px; flex:1; min-width:0;">
                            <div style="font-size:0.85em; color:#555; font-weight:bold; white-space:nowrap;">${label}</div>
                            <input id="${id}" value="${value || ''}" readonly style="${displayStyle} flex:1;">
                            </div>`;
};

                container.innerHTML = `
                    <style>
                        .sn-mp-area { padding-bottom: 6px; margin-bottom: 6px; border-bottom: 1px solid #ddd; }
                        .sn-mp-area:last-child { border-bottom: none; margin-bottom: 0; }
                        .sn-mp-title { font-weight: bold; color: var(--sn-primary-dark); padding-bottom: 4px; margin-bottom: 6px; font-size: 1em; }
                        .sn-mp-sub-area { border-top: 1px dashed #bbb; padding-top: 6px; margin-top: 6px; }
                        .sn-mp-sub-title { font-weight: bold; color: #333; margin-bottom: 4px; font-size: 0.95em; }
                        .sn-mp-row { display: flex; gap: 8px; margin-bottom: 6px; align-items: flex-end; }
                    </style>
                    <div style="padding:10px; font-size:0.9em; overflow-y:auto; height:100%; background:#f9f9f9; box-sizing:border-box;">
                        <!-- Area 1: App Filing -->
                        <div class="sn-mp-area">
                            <div class="sn-mp-title">App Filing</div>
                            <div class="sn-mp-row" title="sn-mp-row App Filing">
                                ${createField('Qual. Date', scrapedData.qualDate)}
                                ${createField('Date Filed: App', scrapedData.ifd)}
                                ${createCheckbox('PTR', 'sn-ptr-check')}
                            </div> 
                            <div class="sn-mp-row">
                                ${createField('SSI Qual.', '')}
                                ${createField('DIB Qual.', '')}
                            </div>
                        </div>

                        <!-- Area 2: Claim Detail -->
                        <div class="sn-mp-area">
                            <div class="sn-mp-title">Claim Detail</div>
                            <div class="sn-mp-row" title = "sn-mp-row Claim Detail">
                                ${createField('AOD', scrapedData.aod)}
                                ${createField('DLI', scrapedData.dli)}
                                ${createField('Blind DLI', scrapedData.blindDli)}
                            </div> 
                            <div class="sn-mp-row">
                                ${createField('IR Status Date', scrapedData.irStatusDate)}
                                ${createField('Days from App', '...')}
                            </div>
                            <div class="sn-mp-row" style="justify-content: space-around; margin-top: 15px;">
                                ${createCheckbox('1696 Confirmed', 'sn-1696-check')}
                                ${createCheckbox('ERE Access', 'sn-ere-check', scrapedData.ereStatus)}
                            </div>
                        </div>

                        <!-- Area 3: Claim Status -->
                        <div class="sn-mp-area" title="sn-mp-area Claim Status">
                            <div class="sn-mp-title">Claim Status</div>
                            <div class="sn-mp-sub-area">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                                    <div class="sn-mp-sub-title" style="margin-bottom: 0;">Initial Application</div>
                                    ${createCheckbox('SSA Confirmed', 'sn-ia-ssa-check')}
                                </div> 
                                
                                <div class="sn-mp-row">
                                    ${createInlineField('Dec. Date: App', scrapedData.decDateApp)}
                                </div> 
                                
                                <div class="sn-mp-row">${createField('T2 Decision', scrapedData.t2Dec)} ${createField('Reason', scrapedData.t2Reason)} ${createField('Date', scrapedData.t2Date)}</div>
                                <div class="sn-mp-row">${createField('T16 Decision', scrapedData.t16Dec)} ${createField('Reason', scrapedData.t16Reason)} ${createField('Date', scrapedData.t16Date)}</div>
                                
                                <div class="sn-mp-row">
                                    ${createInlineField('IA Appeal SOL', scrapedData.iaSol)}
                                </div>
                            </div>
                            <div class="sn-mp-sub-area">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                                    <div class="sn-mp-sub-title" style="margin-bottom: 0;">Reconsideration</div>
                                    ${createCheckbox('SSA Confirmed', 'sn-recon-ssa-check')}
                                </div>
                                <div class="sn-mp-row" title = "sn-mp-row Reconsideration">
                                    ${createInlineField('Date File: Recon', scrapedData.dateFileRecon)}
                                </div>
                                <div class="sn-mp-row">
                                    ${createField('Reentry #', '')}
                                    ${createField('Days since Recon', '...')}
                                </div>
                            </div>
                        </div>

                        <!-- Area 4: CM Status -->
                        <div class="sn-mp-area" title = "sn-mp-area CM Status">
                            <div class="sn-mp-title">CM Status</div> 
                            <div class="sn-mp-row">${createField('Last CM1 Upd', scrapedData.lastCU)} ${createField('Last CM1 Att', scrapedData.lastCA)}</div>
                            <div class="sn-mp-row">${createField('Last ISU', scrapedData.lastStatusUpd)} ${createField('Last ISU Att', scrapedData.lastStatusAtt)}</div>
                        </div>
                    </div>
                `;
                // After rendering, update indicators which rely on these new DOM elements.
                updateIndicators();
            };

            const togglePanel = (type) => {
                const titleMap = { 'info': 'Client Info', 'ssa': 'SSA Contacts', 'matter': 'Matter Details' };
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
                    else if (type === 'matter') renderMatterPanel(sideBody);
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
                                <div style="display:flex; gap:2px; align-items:center;">
                                    <button class="sn-ssa-search-btn" style="cursor:pointer; background:var(--sn-bg-lighter); border:1px solid var(--sn-border); border-radius:3px; font-size:10px; padding:1px 5px;">🔍</button>
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
                                <div style="display:flex; gap:2px; align-items:center;">
                                    <div class="sn-ssa-extra-btn-container"></div>
                                    <button class="sn-ssa-search-btn" style="cursor:pointer; background:var(--sn-bg-lighter); border:1px solid var(--sn-border); border-radius:3px; font-size:10px; padding:1px 5px;">🔍</button>
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

                const updateDDSUI = (text, sectionElement) => {
                    if (sectionElement.getAttribute('data-type') !== 'DDS') return;

                    const btnContainer = sectionElement.querySelector('.sn-ssa-extra-btn-container');
                    const displayDiv = sectionElement.querySelector('.sn-ssa-display');
                    if (!btnContainer || !displayDiv) return;

                    btnContainer.innerHTML = '';
                    displayDiv.style.backgroundColor = '#fff';

                    if (!text) return;
                    const upperText = text.toUpperCase();

                    if (upperText.includes(' MI ') || upperText.endsWith(' MI') || upperText.includes(' TX ') || upperText.endsWith(' TX')) {
                        displayDiv.style.backgroundColor = '#f3e5f5';
                        const btn = document.createElement('button');
                        btn.innerText = 'Fax Status Sheet';
                        btn.style.cssText = 'cursor:pointer; background:#ba68c8; border:1px solid #8e24aa; border-radius:3px; font-size:10px; padding:1px 5px; color:white; margin-right:2px;';
                        btn.onclick = () => { if (app.Tools && app.Tools.FeaturePanels) app.Tools.FeaturePanels.create('FAX'); };
                        btnContainer.appendChild(btn);
                    } else if (upperText.includes(' SC ') || upperText.endsWith(' SC') || upperText.includes(' VA ') || upperText.endsWith(' VA')) {
                        displayDiv.style.backgroundColor = '#e1f5fe';
                        const btn = document.createElement('button');
                        btn.innerText = 'SC/VA Report';
                        btn.style.cssText = 'cursor:pointer; background:#4fc3f7; border:1px solid #039be5; border-radius:3px; font-size:10px; padding:1px 5px; color:black; margin-right:2px;';
                        btn.onclick = () => {
                            window.open('https://teams.microsoft.com/l/channel/19%3Af720720b0d734b8295e22448445de18d%40thread.tacv2/SC%20and%20VA%20Claim%20Status?groupId=afab1e10-a500-4a52-97a1-8c538d031cb4&tenantId=a35aab2a-f545-4a6d-b620-ec156ae6869f', '_blank');
                        };
                        btnContainer.appendChild(btn);
                    }
                };

                container.querySelectorAll('.sn-ssa-section').forEach(section => {
                    const type = section.getAttribute('data-type');
                    const searchBtn = section.querySelector('.sn-ssa-search-btn');
                    const clearBtn = section.querySelector('.sn-ssa-clear-btn');
                    const displayDiv = section.querySelector('.sn-ssa-display');
                    const searchBox = section.querySelector('.sn-ssa-search-box');
                    const input = section.querySelector('.sn-ssa-input');
                    const resultsDiv = section.querySelector('.sn-ssa-results');

                    if (type === 'DDS') updateDDSUI(formData.DDS_Text, section);

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
                                
                                const phone = item.phone || '';
                                const fax = item.fax || '';

                                const label = type === 'FO' ? `<b>${item.location}</b><br>PN: ${phone} | Fax: ${fax}` : `<b>${item.name}</b><br>PN: ${phone}` + (fax ? ` | Fax (??): ${fax}` : '');
                                row.innerHTML = label;
                                row.onclick = () => {
                                    const saveVal = type === 'FO' ? item.id : item.name;
                                    const displayText = type === 'FO' ? `${item.location}\n${item.fullAddress}\nPN: ${phone}\nFax: ${fax}` : `${item.name}\nPN: ${phone}` + (fax ? `\nFax (??): ${fax}` : '');
                                    
                                    this.updateAndSaveData(clientId, { [`${type}_Selection`]: saveVal, [`${type}_Text`]: displayText });
                                    displayDiv.innerText = displayText;
                                    if (type === 'DDS') updateDDSUI(displayText, section);
                                    
                                    // Close search
                                    searchBox.style.display = 'none';
                                    displayDiv.style.display = 'block';
                                    searchBtn.innerText = "🔍";
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
                            searchBtn.innerText = "🔍";
                        }
                    };

                    clearBtn.onclick = () => {
                        if (confirm(`Clear ${type}?`)) {
                            displayDiv.innerText = "";
                            this.updateAndSaveData(clientId, { [`${type}_Selection`]: "", [`${type}_Text`]: "" });
                            if (type === 'DDS') updateDDSUI("", section);
                            searchBox.style.display = 'none';
                            displayDiv.style.display = 'block';
                            searchBtn.innerText = "🔍";
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

            // --- COLOR PICKER DROPDOWN ---
            const cpDropdown = w.querySelector('.sn-cp-dropdown');
            const cpContent = cpDropdown.querySelector('.sn-cp-content');
            const cpBtn = cpDropdown.querySelector('.sn-cp-btn');

            // Move panel to be a direct child of the window, escaping any overflow:hidden containers
            w.appendChild(cpContent);

            cpBtn.onclick = (e) => {
                e.stopPropagation();
                if (cpContent.style.display === 'block') {
                    cpContent.style.display = 'none';
                } else {
                    const btnRect = cpBtn.getBoundingClientRect();
                    // Set fixed position before showing to avoid flicker
                    cpContent.style.position = 'fixed';
                    cpContent.style.bottom = 'auto';
                    cpContent.style.right = 'auto';
                    cpContent.style.display = 'block'; // Now display to measure
                    
                    // Position panel above the button, aligning right edges
                    cpContent.style.top = (btnRect.top - cpContent.offsetHeight - 5) + 'px'; // 5px is original margin
                    cpContent.style.left = (btnRect.right - cpContent.offsetWidth) + 'px';
                }
            };

            const outsideClickListener = (event) => {
                if (!document.body.contains(w)) {
                    document.removeEventListener('click', outsideClickListener);
                    return;
                }
                // Hide if clicking outside of the button AND the now-independent panel
                if (!cpBtn.contains(event.target) && !cpContent.contains(event.target) && cpContent.style.display === 'block') {
                    cpContent.style.display = 'none';
                }
            };
            document.addEventListener('click', outsideClickListener);
            
            // Store reference for cleanup in destroy()
            this.listeners[`cpClickListener_${clientId}`] = outsideClickListener;

            w.querySelectorAll('.sn-swatch').forEach(sw => {
                sw.onclick = () => {
                    const newColor = sw.getAttribute('data-col');
                    const currentData = GM_getValue('cn_' + clientId, {});
                    currentData.customColor = newColor;
                    GM_setValue('cn_' + clientId, currentData);
                    this.updateNoteColor(clientId);
                    cpContent.style.display = 'none'; // Hide after selection
                };
            });

            // --- TODO LIST LOGIC ---
            const notesContainer = w.querySelector('#sn-notes');

            const renderNotesContent = (notesString) => {
                if (!notesString) return '';
                const lines = notesString.split('\n');
                const escapeHTML = (str) => str.replace(/[&<>"']/g, (match) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[match]);

                return lines.map(line => {
                    if (line.startsWith('>x ')) {
                        const text = escapeHTML(line.substring(3));
                        return `<div class="sn-todo-item" draggable="true" data-checked="true"><input type="checkbox" checked><span>${text}</span><button class="sn-todo-del">×</button></div>`;
                    } else if (line.startsWith('> ')) {
                        const text = escapeHTML(line.substring(2));
                        return `<div class="sn-todo-item" draggable="true" data-checked="false"><input type="checkbox"><span>${text}</span><button class="sn-todo-del">×</button></div>`;
                    } else {
                        const text = escapeHTML(line);
                        return `<div>${text}</div>`;
                    }
                }).join('');
            };

            notesContainer.innerHTML = renderNotesContent(savedData.notes || '');

            notesContainer.addEventListener('input', () => {
                const sel = window.getSelection();
                if (!sel.rangeCount) return;

                const range = sel.getRangeAt(0);
                const node = range.startContainer;

                const parentNode = (node.nodeType === Node.TEXT_NODE) ? node.parentNode : node;
                if (parentNode && (parentNode === notesContainer || parentNode.parentNode === notesContainer) && parentNode.textContent.startsWith('> ')) {
                    const textContent = parentNode.textContent.substring(2);
                    
                    const todoDiv = document.createElement('div');
                    todoDiv.className = 'sn-todo-item';
                    todoDiv.setAttribute('data-checked', 'false'); todoDiv.setAttribute('draggable', 'true');
                    todoDiv.innerHTML = `<input type="checkbox"><span></span><button class="sn-todo-del">×</button>`;
                    todoDiv.querySelector('span').textContent = textContent;

                    const nodeToReplace = (parentNode === notesContainer) ? node : parentNode;
                    notesContainer.replaceChild(todoDiv, nodeToReplace);

                    const span = todoDiv.querySelector('span');
                    const textNodeInSpan = span.firstChild || span;
                    const newOffset = Math.max(0, range.startOffset - 2);
                    
                    const newRange = document.createRange();
                    newRange.setStart(textNodeInSpan, Math.min(newOffset, (textNodeInSpan.length || 0)));
                    newRange.collapse(true);
                    sel.removeAllRanges();
                    sel.addRange(newRange);
                }
            });

            notesContainer.addEventListener('click', (e) => {
                if (e.target.matches('.sn-todo-item input[type="checkbox"]')) {
                    const item = e.target.closest('.sn-todo-item');
                    item.setAttribute('data-checked', e.target.checked);
                    saveState();
                }
                if (e.target.matches('.sn-todo-item .sn-todo-del')) {
                    e.target.closest('.sn-todo-item').remove();
                    saveState();
                }
            });

            notesContainer.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    const sel = window.getSelection();
                    if (!sel.rangeCount) return;
                    const node = sel.getRangeAt(0).startContainer;
                    const parentTodoItem = node.closest('.sn-todo-item');

                    if (parentTodoItem) {
                        e.preventDefault();
                        const newDiv = document.createElement('div');
                        newDiv.innerHTML = '<br>'; // Create an empty line
                        parentTodoItem.after(newDiv);

                        // Move cursor to the new line
                        const range = document.createRange();
                        range.setStart(newDiv, 0);
                        range.collapse(true);
                        sel.removeAllRanges();
                        sel.addRange(range);
                    }
                }
            });

            const getDragAfterElement = (container, y) => {
                const draggableElements = [...container.querySelectorAll('.sn-todo-item:not(.dragging)')];
                return draggableElements.reduce((closest, child) => {
                    const box = child.getBoundingClientRect();
                    const offset = y - box.top - box.height / 2;
                    if (offset < 0 && offset > closest.offset) {
                        return { offset: offset, element: child };
                    } else {
                        return closest;
                    }
                }, { offset: Number.NEGATIVE_INFINITY }).element;
            };

            notesContainer.addEventListener('dragstart', e => {
                if (e.target.matches('.sn-todo-item')) {
                    e.target.classList.add('dragging');
                }
            });

            notesContainer.addEventListener('dragend', e => {
                if (e.target.matches('.sn-todo-item')) {
                    e.target.classList.remove('dragging');
                    saveState(); // Save new order
                }
            });

            notesContainer.addEventListener('dragover', e => {
                e.preventDefault();
                const draggingItem = notesContainer.querySelector('.dragging');
                if (!draggingItem) return;
                const afterElement = getDragAfterElement(notesContainer, e.clientY);
                if (afterElement == null) { notesContainer.appendChild(draggingItem); } else { notesContainer.insertBefore(draggingItem, afterElement); }
            });

            const saveState = () => {
                if(!document.body.contains(w)) return;
                try {
                    // Retrieve previous data to preserve fields if UI elements are missing (e.g. closed sidebar)
                    const previous = GM_getValue('cn_' + clientId, {});
                    const ssnEl = w.querySelector('.sn-side-textarea[data-id="ssn"]');
                    const dobEl = w.querySelector('.sn-side-textarea[data-id="dob"]');

                    const notesLines = [];
                    for (const child of notesContainer.children) {
                        if (child.classList.contains('sn-todo-item')) {
                            const isChecked = child.getAttribute('data-checked') === 'true';
                            const text = child.querySelector('span').textContent;
                            notesLines.push((isChecked ? '>x ' : '> ') + text);
                        } else {
                            notesLines.push(child.textContent);
                        }
                    }
                    const notesToSave = notesLines.join('\n');

                    const data = {
                        name: w.querySelector('#sn-cl-name').innerText, notes: notesToSave,
                        city: w.querySelector('#sn-city').innerText,
                        state: w.querySelector('#sn-state').innerText,
                        level: w.querySelector('#sn-status').innerText,
                        ssClassification: w.querySelector('#sn-ss-classification').innerText,
                        substatus: w.querySelector('#sn-substatus').innerText,
                        ssn: ssnEl ? ssnEl.value : previous.ssn, // from info panel
                        tz: w.querySelector('#sn-tz-select').value,
                        dob: dobEl ? dobEl.value : previous.dob,
                        revisitActive: w.querySelector('#sn-revisit-check').checked, revisit: w.querySelector('#sn-revisit-date').value,
                        // Matter panel data is no longer saved. It is scraped fresh when the panel opens.
                        // Window state
                        width: w.style.width, height: w.style.height, top: w.style.top, left: w.style.left, timestamp: Date.now(),
                        // We do NOT save form data (med/wit/etc) here to prevent overwriting.
                        // It is managed by cn_form_data_{id}
                        // customColor is saved separately by the swatch click handler.
                    };
                    
                    GM_setValue('cn_' + clientId, data);
                    this.checkStoredData(clientId);
                    updateIndicators(); // Update lights on save/change
                    app.Core.Taskbar.update();

                    const revisitStatusChanged = data.revisitActive !== previous.revisitActive || data.revisit !== previous.revisit;
                    if (revisitStatusChanged) {
                        // If dashboard is open, refresh its list view
                        const dashEl = document.getElementById('sn-dashboard');
                        if (dashEl && dashEl.style.display !== 'none' && app.Tools.Dashboard && app.Tools.Dashboard.currentView === 'list') {
                            app.Tools.Dashboard._loadData();
                            app.Tools.Dashboard.renderList();
                        }
                    }
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
                // Defer heavy scraping to prevent UI blocking on creation
                setTimeout(() => {
                    // 1. Load the single source of truth: the data from storage.
                    const freshData = GM_getValue('cn_' + clientId, {});
                    // Always load the latest form data
                    const freshFormData = GM_getValue('cn_form_data_' + clientId, {});

                    // 2. Scrape the current page for supplementary data.
                    const headerData = app.Core.Scraper.getHeaderData();
                    const pageData = app.Core.Scraper.getAllPageData();
                    const allScrapedData = { ...headerData, ...pageData };

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
                        nameEl.innerText = allScrapedData.clientName || freshData.name || 'Client Note';
                    }

                    // Populate City
                    const cityEl = w.querySelector('#sn-city');
                    const cityVal = allScrapedData['City'] || allScrapedData['Mailing City'] || freshData.city || freshFormData['City'] || '';
                    if (cityEl) cityEl.innerText = cityVal;

                    // Populate State
                    const stateEl = w.querySelector('#sn-state');
                    const stateVal = allScrapedData['State'] || allScrapedData['Mailing State'] || freshData.state || freshFormData['State'] || '';
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

                   const statusEl = w.querySelector('#sn-status');
                   if (force || statusEl.innerText === 'level') {
                       statusEl.innerText = allScrapedData['Status'] || freshData.status || 'Status';
                   }
                   const classificationEl = w.querySelector('#sn-ss-classification');
                   if (force || classificationEl.innerText === 'Classification') {
                       classificationEl.innerText = allScrapedData['SS Classification'] || freshData.ssClassification || 'Classification';
                   }
                   const substatusEl = w.querySelector('#sn-substatus');
                   if (force || substatusEl.innerText === 'Sub-status') {
                       substatusEl.innerText = allScrapedData['Sub-status'] || freshData.substatus || 'Sub-status';
                   }

                    // 5. Update any dependent UI
                    this.updateMedWindowUI();

                    // 6. Save the newly merged state back to storage.
                    saveState();
                }, 0);
            };

            // Force fillForm to run if the dropdowns are currently stuck on their default values
            // This prevents old, empty saves from locking the script out.
            if (!savedData.timestamp || w.querySelector('#sn-status').innerText === 'Status') {
                fillForm();
            }

            // REFRESH BUTTON: Only scrape and update Header + Status Bar
            w.querySelector('#sn-refresh-btn').onclick = () => {
                function getStatus(selector, root = document) {
                    const el = root.querySelector(selector);
                    if (el) return el;

                    const allElements = root.querySelectorAll('*');
                    for (const node of allElements) {
                        if (node.shadowRoot) {
                            const found = findDeep(selector, node.shadowRoot);
                            if (found) return found;
                        }
                    }
                    return null;
                }

                function findDeep(selector, root = document) {
                        let el = root.querySelector(selector);
                        if (el) return el;
                        const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null, false);
                        let node = walker.nextNode();
                        while (node) {
                            if (node.shadowRoot) {
                                const found = findDeep(selector, node.shadowRoot);
                                if (found) return found;
                            }
                            node = walker.nextNode();
                        }
                        return null;
                    };

                const topPanelTargets = [
                    { label: "Status", api: "kdlaw__Status__c" },
                    { label: "Sub-status", api: "kdlaw__Sub_status__c" },
                    { label: "SS Classification", api: "kdlaw__SS_Classification__c" },
                    { label: "Qualification Date", api: "kdlaw__Qualification_Date__c" },
                    { label: "Date Filed: App", api: "kdlaw__Date_Filed_App__c" }
                ];

                const topPanelData = {};

                topPanelTargets.forEach(field => {
                    const selector = `records-highlights-details-item [data-target-selection-name*="${field.api}"] lightning-formatted-text, 
                                      records-highlights-details-item [data-target-selection-name*="${field.api}"] lightning-formatted-date-time,
                                      [data-target-selection-name*="${field.api}"] slot`;

                    const element = getStatus(selector);
                    const value = element ? element.innerText.trim() : "NOT FOUND";
                    topPanelData[field.label] = value;
                    console.log(`%c${field.label}:`, "font-weight: bold; color: #333;", value);
                });


                const headerData = app.Core.Scraper.getHeaderData();
                const pageData = app.Core.Scraper.getAllPageData();
                const allScrapedData = { ...headerData, ...pageData };
                
                // Load existing data for fallback
                const freshData = GM_getValue('cn_' + clientId, {});
                const freshFormData = GM_getValue('cn_form_data_' + clientId, {});

                // Update Header
                w.querySelector('#sn-cl-name').innerText = allScrapedData.clientName || freshData.name || 'Client Note';
                const newCity = allScrapedData['City'] || allScrapedData['Mailing City'] || freshData.city || freshFormData['City'] || '';
                w.querySelector('#sn-city').innerText = newCity;

                const newState = allScrapedData['State'] || allScrapedData['Mailing State'] || freshData.state || freshFormData['State'] || '';
                w.querySelector('#sn-state').innerText = newState;
                
                const detectedTZ = this.detectTimezone(newState, newCity);
                if (detectedTZ) {
                     const tzDropdown = w.querySelector('#sn-tz-select');
                     if (tzDropdown.value !== detectedTZ) {
                         tzDropdown.value = detectedTZ;
                         tzDropdown.dispatchEvent(new Event('change'));
                     }
                }

                // Update Status Bar with correct field names from getAllPageData()
                w.querySelector('#sn-status').innerText = topPanelData["Status"] !== "NOT FOUND" ? topPanelData["Status"] : freshData.status || 'Status';
                w.querySelector('#sn-ss-classification').innerText = topPanelData["SS Classification"] !== "NOT FOUND" ? topPanelData["SS Classification"] : freshData.ssClassification || 'Classification';
                w.querySelector('#sn-substatus').innerText = topPanelData["Sub-status"] !== "NOT FOUND" ? topPanelData["Sub-status"] : freshData.substatus || 'Sub-status';

                console.log("------------------------------");
                console.log("Final Scraped Object:", topPanelData);

                // Re-render Matter Panel if it's open to reflect new data
                const sidePanel = w.querySelector('#sn-side-panel');
                const sideTitle = w.querySelector('#sn-panel-title');
                if (sidePanel.style.display === 'flex' && sideTitle.innerText === 'Matter Details') {
                    renderMatterPanel(w.querySelector('#sn-panel-body'));
                }

                // Update Indicators with fresh data
                updateIndicators(allScrapedData);

                saveState();
            };

            w.querySelector('#sn-del-btn').onclick = () => { 
                if(confirm("Delete notes?")) { 
                    try { 
                        GM_deleteValue('cn_' + clientId); 
                        GM_deleteValue('cn_form_data_' + clientId); 
                        GM_deleteValue('cn_med_table_' + clientId);
                        
                        // Reset internal memory
                        this.medProvider = ''; this.assistiveDevice = ''; this.condition = '';
                        
                        // Close windows immediately
                        this.destroy(clientId);
                        
                        // Update taskbar state (ghost the buttons)
                        this.checkStoredData(clientId);
                    } catch(e) {} 
                    app.Core.Taskbar.update();
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
            
            // Note: SSD data is only scraped ONCE and never changes.
            // A one-time listener is set up dynamically when "Open SSD App" is clicked (see button handler above).
            // The listener removes itself automatically after data is received.


            if (!savedData.timestamp) fillForm();

            // Initial Indicator Check
            updateIndicators();

            // Start clock on init
            this.startClock(initialTZ);
            app.Core.Taskbar.update();
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
            app.Core.Taskbar.update();
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
                    
                    const h = parseInt(now.toLocaleTimeString('en-US', { timeZone: iana, hour: 'numeric', hour12: false }));
                    if (h >= 8 && h < 9) el.style.color = '#F57F17'; // Dark Yellow
                    else if (h >= 9 && h < 16) el.style.color = '#333333'; // Black
                    else el.style.color = '#C62828'; // Dark Red
                } catch(e) { el.innerText = ''; el.style.color = '#333'; }
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

            // Remove GM value listeners
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

            // Remove click event listener for color picker
            const cpClickKey = `cpClickListener_${clientId}`;
            if (this.listeners[cpClickKey]) {
                document.removeEventListener('click', this.listeners[cpClickKey]);
                delete this.listeners[cpClickKey];
            }

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

            const clientId = this.getClientId();
            if (!clientId) {
                alert("Cannot open Medical Window without a client record loaded.");
                return;
            }

            const cnWindow = document.getElementById('sn-client-note');
            let clientName, scrapedSSN;

            if (cnWindow && cnWindow.style.display !== 'none') {
                clientName = cnWindow.querySelector('#sn-cl-name').innerText || 'Client';
                scrapedSSN = app.Core.Scraper.getAllPageData().ssn || '--';
            } else {
                const headerData = app.Core.Scraper.getHeaderData();
                const pageData = app.Core.Scraper.getAllPageData();
                clientName = headerData.clientName || 'Client';
                scrapedSSN = pageData.ssn || '--';
            }

            // Load medical data from storage regardless
            const formData = GM_getValue('cn_form_data_' + clientId, {});
            this.medProvider = formData['Medical Provider'] || '';
            this.assistiveDevice = formData['Assistive Devices'] || '';
            this.condition = formData['Condition'] || '';
            const medProviderText = this.medProvider;
            const assistiveDeviceText = this.assistiveDevice;
            const conditionText = this.condition;

            // --- MED PROVIDER POP-OUT ---
            // NEW: Load saved table data
            const savedTableData = GM_getValue('cn_med_table_' + clientId, null);
            // NEW LOGIC: Determine if left panel should be shown initially
            const showLeftPanel = !savedTableData || savedTableData.length === 0;

            // CHANGED: Default position logic (700x300, center bottom)
            const savedSize = GM_getValue('def_pos_MED', { width: '700px', height: '300px' });
            const mwW = parseInt(savedSize.width);
            const mwH = parseInt(savedSize.height);
            const mwLeft = (window.innerWidth / 2) - (mwW / 2);

            const mw = document.createElement('div');
            mw.id = mid; mw.className = 'sn-window';
            mw.style.width = mwW + 'px';
            mw.style.height = mwH + 'px';
            mw.style.left = mwLeft + 'px';
            mw.style.bottom = '40px'; // Docked above taskbar
            mw.style.background = '#f9f9f9';
            mw.style.display = 'flex';
            mw.style.flexDirection = 'column';
            mw.style.boxShadow = '0 4px 15px rgba(0,0,0,0.4)';
            mw.style.fontSize = '12px';
            mw.style.zIndex = '10005';

            const style = document.createElement('style');
            style.innerHTML = `
                td[contenteditable]:empty::before { content: attr(placeholder); color: #aaa; font-style: italic; }
                #sn-med-table { width: 100%; border-collapse: collapse; }
                #sn-med-table td, #sn-med-table th { word-wrap: break-word; overflow-wrap: break-word; }
                #sn-med-table th:nth-child(n+3), #sn-med-table td:nth-child(n+3) { width: 1%; white-space: nowrap; }
            `;
            mw.appendChild(style);

            mw.innerHTML += `
                <div class="sn-header" style="background:var(--sn-bg-light); padding:5px; display:flex; justify-content:space-between; align-items:center; cursor:move; border-bottom:1px solid var(--sn-border); position: relative;">
                    <span style="font-weight:bold;">Medical Providers Table</span>
                    <button id="sn-med-expand-btn" style="position: absolute; left: 50%; transform: translateX(-50%); cursor:pointer; background:var(--sn-bg-lighter); border:1px solid var(--sn-border); border-radius:3px; font-size:10px; padding:2px 6px; color:var(--sn-primary-dark); font-weight:bold;">Expand</button>
                    <button id="sn-med-min-btn" style="cursor:pointer; background:none; border:none; font-weight:bold; padding:0 5px;">_</button>
                </div>
                <div style="display:flex; flex-grow:1; overflow:hidden;">
                    <div id="sn-med-left" style="width:30%; display:${showLeftPanel ? 'flex' : 'none'}; flex-direction:column; border-right:1px solid #ccc; background:#fff; flex-shrink:0; font-size:inherit;">
                        <div style="padding:10px; overflow-y:auto; flex-grow:1; display:flex; flex-direction:column; gap:8px;">
                            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #eee; padding-bottom:5px; margin-bottom: 5px;">
                                <div style="display:flex; gap:5px;">
                                    <button id="sn-med-parse-btn" title="Parse medical text" style="padding:4px 8px; cursor:pointer; border:1px solid #999; background:var(--sn-bg-lighter); border-radius:4px; font-size:11px; font-weight:bold;">Parse Medical Data</button>
                                    <button id="sn-med-undo-btn" title="Undo last parse" style="display:none; padding:4px 8px; cursor:pointer; border:1px solid #ef5350; background:#ffebee; color:#c62828; border-radius:4px; font-size:11px; font-weight:bold;">Undo</button>
                                </div>
                                <button id="sn-med-hide-btn" style="cursor:pointer; background:var(--sn-bg-lighter); border:1px solid var(--sn-border); border-radius:3px; font-size:10px; padding:2px 6px; color:var(--sn-primary-dark); font-weight:bold;">Hide</button>
                            </div>
                            <div style="flex-grow:1; display:flex; flex-direction:column;"><label style="font-weight:bold; font-size:11px; color:#555; display:block; margin-bottom:2px;">Medical Provider</label><textarea class="sn-med-textarea" data-field="Medical Provider" readonly style="width:100%; flex-grow:1; resize:none; border:1px solid #ccc; padding:4px; background:#f9f9f9; font-family:inherit; font-size:inherit;">${medProviderText}</textarea></div>
                        </div>
                    </div>
                    <div id="sn-med-partition" style="width:5px; cursor:col-resize; background:#f0f0f0; border-left:1px solid #ddd; border-right:1px solid #ddd; flex-shrink:0;"></div>
                    <div style="flex-grow:1; display:flex; flex-direction:column; background:#fff; min-width:200px; overflow:hidden;">
                        <div style="padding:8px; border-bottom:1px solid #eee; display:flex; align-items:center; gap:10px; flex-shrink:0;">
                            <button id="sn-med-raw-btn" title="Show Raw Medical Text" style="padding:4px 8px; cursor:pointer; border:1px solid #999; background:var(--sn-bg-lighter); border-radius:4px; font-size:11px; font-weight:bold;">Raw</button>
                            <span style="margin-left:auto; font-size:14px; font-weight:bold; color:#333;">Client: ${clientName}</span>
                            <span style="color:#ccc;">|</span>
                            <span style="font-size:14px; font-weight:bold; color:#333;">SSN: ${scrapedSSN}</span>
                        </div>
                        <div style="flex-grow:1; padding:10px; overflow-y:auto; display:flex; flex-direction:column;">
                            <div style="flex-grow:1; overflow:auto; margin-bottom:10px; border:1px solid #eee;">
                                <table id="sn-med-table" style="font-size:inherit;"><thead><tr style="background:#eee; text-align:left;"><th style="border:1px solid #ccc; padding:4px;">Dr/Facilities</th><th style="border:1px solid #ccc; padding:4px;">Address</th><th style="border:1px solid #ccc; padding:4px;">Phone</th><th style="border:1px solid #ccc; padding:4px;">First Visit</th><th style="border:1px solid #ccc; padding:4px;">Last Visit</th><th style="border:1px solid #ccc; padding:4px;">Next Appt</th></tr></thead><tbody></tbody></table>
                            </div>
                            <div style="display:flex; gap:10px; border-top:1px solid #eee; padding-top:10px; flex-shrink:0;">
                                <div style="flex:1; display:flex; flex-direction:column;">
                                    <label style="font-weight:bold; font-size:11px; color:#555; margin-bottom:2px;">Medical Conditions</label>
                                    <textarea class="sn-med-textarea" data-field="Condition" readonly style="width:100%; flex-grow:1; min-height:80px; resize:vertical; border:1px solid #ccc; padding:4px; background:#f9f9f9; font-family:inherit; font-size:inherit;">${conditionText}</textarea>
                                </div>
                                <div style="flex:1; display:flex; flex-direction:column;">
                                    <label style="font-weight:bold; font-size:11px; color:#555; margin-bottom:2px;">Assistive Devices</label>
                                    <textarea class="sn-med-textarea" data-field="Assistive Device" readonly style="width:100%; height:4.5em; resize:vertical; border:1px solid #ccc; padding:4px; background:#f9f9f9; font-family:inherit; font-size:inherit;">${assistiveDeviceText}</textarea>
                                    <div style="display:flex; justify-content:flex-end; align-items:center; gap:10px; margin-top:5px;">
                                        <button id="sn-med-font-dec" style="cursor:pointer; border:1px solid #999; background:#eee; width:20px; border-radius:3px; font-weight:normal;">-</button>
                                        <button id="sn-med-font-inc" style="cursor:pointer; border:1px solid #999; background:#eee; width:20px; border-radius:3px; font-weight:normal;">+</button>
                                        <button style="padding:5px 15px; cursor:pointer; font-weight:bold;">📄 Generate PDF</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="sn-resizer rs-n"></div><div class="sn-resizer rs-s"></div><div class="sn-resizer rs-e"></div><div class="sn-resizer rs-w"></div><div class="sn-resizer rs-ne"></div><div class="sn-resizer rs-nw"></div><div class="sn-resizer rs-se"></div><div class="sn-resizer rs-sw"></div>
            `;
            document.body.appendChild(mw);
            app.Core.Windows.setup(mw, mw.querySelector('#sn-med-min-btn'), mw.querySelector('.sn-header'), 'MED');
            
            app.Core.Windows.bringToFront(mw);

            const expandBtn = mw.querySelector('#sn-med-expand-btn');
            expandBtn.onclick = () => {
                if (expandBtn.innerText === "Restore") {
                    mw.style.width = mwW + 'px'; mw.style.height = mwH + 'px';
                    mw.style.top = ''; mw.style.bottom = '40px'; mw.style.left = mwLeft + 'px';
                    expandBtn.innerText = "Expand";
                } else {
                    mw.style.height = '50vh';
                    mw.style.top = '5vh';
                    mw.style.bottom = '';
                    expandBtn.innerText = "Restore";
                }
                // Trigger resize event for any listeners
                mw.dispatchEvent(new Event('resize'));
            };

            // NEW LOGIC: Raw/Hide buttons for dynamic window resizing
            const leftPanel = mw.querySelector('#sn-med-left');
            mw.querySelector('#sn-med-hide-btn').onclick = () => {
                if (leftPanel.style.display === 'none') return;
                const panelWidth = leftPanel.offsetWidth;
                mw.dataset.leftPanelWidth = panelWidth;
                const currentLeft = mw.offsetLeft;
                const currentWidth = mw.offsetWidth;
                leftPanel.style.display = 'none';
                mw.style.width = (currentWidth - panelWidth) + 'px';
                mw.style.left = (currentLeft + panelWidth) + 'px';
            };
            mw.querySelector('#sn-med-raw-btn').onclick = () => {
                if (leftPanel.style.display !== 'none') return;
                const panelWidth = parseInt(mw.dataset.leftPanelWidth || 255); // Default width ~30% of 850
                const currentLeft = mw.offsetLeft;
                const currentWidth = mw.offsetWidth;
                leftPanel.style.display = 'flex';
                leftPanel.style.width = panelWidth + 'px';
                mw.style.width = (currentWidth + panelWidth) + 'px';
                mw.style.left = (currentLeft - panelWidth) + 'px';
            };

            const tableBody = mw.querySelector('#sn-med-table tbody');
            let undoStack = null;

            const getTableData = () => {
                return Array.from(tableBody.querySelectorAll('tr')).map(row => {
                    const cells = row.querySelectorAll('td');
                    return {
                        doctorFacility: cells[0].innerText,
                        address: cells[1].innerText,
                        phone: cells[2].innerText,
                        firstVisit: cells[3].innerText,
                        lastVisit: cells[4].innerText,
                        nextVisit: cells[5].innerText
                    };
                });
            };

            const saveTableData = () => {
                const data = getTableData();
                GM_setValue('cn_med_table_' + clientId, data);
            };

            const renderTable = (data) => {
                tableBody.innerHTML = '';
                const rowsToRender = data && data.length > 0 ? data : [{}, {}, {}]; // Default 3 empty rows if null
                
                rowsToRender.forEach(provider => {
                    tableBody.insertAdjacentHTML('beforeend', `
                        <tr>
                            <td contenteditable="true" placeholder="Facilities / Doctor" style="border:1px solid #ccc; padding:4px;">${provider.doctorFacility || ''}</td>
                            <td contenteditable="true" style="border:1px solid #ccc; padding:4px;">${provider.address || ''}</td>
                            <td contenteditable="true" style="border:1px solid #ccc; padding:4px;">${provider.phone || ''}</td>
                            <td contenteditable="true" style="border:1px solid #ccc; padding:4px;">${provider.firstVisit || ''}</td>
                            <td contenteditable="true" style="border:1px solid #ccc; padding:4px;">${provider.lastVisit || ''}</td>
                            <td contenteditable="true" style="border:1px solid #ccc; padding:4px;">${provider.nextVisit || ''}</td>
                        </tr>
                    `);
                });
            };

            const runMedicalParse = () => {
                // 1. Grab the text from the Medical Provider textarea
                const medTextarea = mw.querySelector('textarea[data-field="Medical Provider"]');
                if (!medTextarea.value.trim()) return;
    
                // Save current state for Undo
                undoStack = getTableData();
                mw.querySelector('#sn-med-undo-btn').style.display = 'inline-block';

                // 2. Parse the text using your existing function
                const parsedData = this.parseMedicalProviders(medTextarea.value);
                
                // Add one empty row at the bottom for manual entry
                parsedData.push({});
                
                renderTable(parsedData);
                saveTableData();
            };

            mw.querySelector('#sn-med-parse-btn').onclick = runMedicalParse;
            mw.querySelector('#sn-med-undo-btn').onclick = () => {
                if (undoStack) {
                    renderTable(undoStack);
                    saveTableData();
                    mw.querySelector('#sn-med-undo-btn').style.display = 'none';
                    undoStack = null;
                }
            };
            
            // Save on any edit
            mw.querySelector('#sn-med-table').addEventListener('input', saveTableData);

            // Initialize: Load saved data OR parse if empty
            if (savedTableData && savedTableData.length > 0) {
                renderTable(savedTableData);
            } else {
                runMedicalParse();
                // Hide undo for initial auto-parse
                mw.querySelector('#sn-med-undo-btn').style.display = 'none';
            }

            mw.querySelectorAll('.sn-med-textarea').forEach(inp => {
                inp.ondblclick = () => { inp.removeAttribute('readonly'); inp.style.background = '#fff'; inp.style.border = '1px solid var(--sn-border)'; inp.focus(); };
                inp.onblur = () => { inp.setAttribute('readonly', true); inp.style.background = '#f9f9f9'; inp.style.border = '1px solid #ccc'; };
                inp.oninput = () => {
                    const field = inp.getAttribute('data-field');
                    const value = inp.value;

                    // Update internal state for immediate UI feedback if needed
                    if (field === 'Medical Provider') this.medProvider = value;
                    if (field === 'Assistive Device') this.assistiveDevice = value;
                    if (field === 'Condition') this.condition = value;

                    // Directly save the change to persistent storage
                    this.updateAndSaveData(clientId, { [field]: value });
                };
            });

            const medPart = mw.querySelector('#sn-med-partition');
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
            // Normalize separators: convert dash lines (2+ dashes) into empty lines
            let normalizedText = text.replace(/(?:^|\n)\s*-{2,}\s*(?:\n|$)/g, '\n\n');

            // Check for exploded text (all lines separated by empty lines)
            const tempBlocks = normalizedText.split(/\n\s*\n/).filter(b => b.trim());
            if (tempBlocks.length > 1 && tempBlocks.every(b => !b.trim().includes('\n'))) {
                normalizedText = normalizedText.replace(/\n\s*\n/g, '\n');
            }

            // 1. Split into blocks by one or more empty lines.
            const providerBlocks = normalizedText.split(/\n\s*\n/).filter(block => block.trim() !== '');
            const providers = [];

            for (const block of providerBlocks) {
                // 3. More flexible regexes. Using /m for multiline to anchor with ^, and /i for case-insensitivity.
                let doctorName = (block.match(/^(?:Dr\.?\s?Name|Dr information):?\s*(.*)/im) || [])[1] || "";
                let clinicName = (block.match(/^(?:Hospital Name|Health Facility|Office Name|Name of clinic\/ ?hospital|Doctor\/Facility):?\s*(.*)/im) || [])[1] || "";
                let doctorFacility = "";

                if (clinicName && doctorName) {
                    doctorFacility = `${doctorName.trim()} || ${clinicName.trim()}`;
                } else {
                    doctorFacility = (doctorName || clinicName).trim();
                }

                // If still no name, assume the first line is the name, as long as it doesn't look like another field.
                if (!doctorFacility) {
                    const firstLine = block.trim().split('\n')[0].trim();
                    if (!/:\s*$/.test(firstLine) && !/^\s*$/.test(firstLine) && !/^(address|phone|visit|appt|telephone)/i.test(firstLine)) {
                        doctorFacility = firstLine;
                    }
                }

                // Capture address allowing for multiple lines (stop at next keyword or end of block)
                let addressMatch = block.match(/^Address:\s*([\s\S]+?)(?=\n\s*(?:Phone|Telephone|number|1st|First|FV|Last|Next|Appt)|$)/im);
                let address = "";
                if (addressMatch) {
                    address = addressMatch[1].replace(/\r?\n/g, ', ').trim().replace(/,\s*,/g, ', ').replace(/,\s*$/, '');
                }

                let phone = (block.match(/^(?:Phone(?: Number)?|Telephone Number|number):?\s*(.*)/im) || [])[1] || "";
                let firstVisit = (block.match(/^(?:1st Visit|First Visit|FV):?\s*(.*)/im) || [])[1] || "";
                let lastVisit = (block.match(/^(?:Last Visit):?\s*(.*)/im) || [])[1] || "";
                let nextVisit = (block.match(/^(?:Next Appointment|Next appt|Next Visit):?\s*(.*)/im) || [])[1] || "";

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
                        firstVisit: firstVisit.trim(),
                        lastVisit: lastVisit.trim(),
                        nextVisit: nextVisit.trim()
                    });
                }
            }

            return providers;
        }

    };

    ClientNote.getClientId = () => app.AppObserver.getClientId();

    // Assign to the namespace
    app.Features.ClientNote = ClientNote;



})(window.CM_App = window.CM_App || {});
