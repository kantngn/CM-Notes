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
        colors: {
            "EST": ["#ffe0b2", "#ffcc80"], "CST": ["#fff9c4", "#fff59d"], "MST": ["#c8e6c9", "#a5d6a7"],
            "PST": ["#b2dfdb", "#80cbc4"], "AKST": ["#bbdefb", "#90caf9"], "HST": ["#e1bee7", "#ce93d8"], "Default": ["#fff9c4", "#fff59d"]
        },
        stateTZ: {
            'AL': 'CST', 'AK': 'AKST', 'AZ': 'MST', 'AR': 'CST', 'CA': 'PST', 'CO': 'MST', 'CT': 'EST', 'DE': 'EST', 'FL': 'EST', 'GA': 'EST',
            'HI': 'HST', 'ID': 'MST', 'IL': 'CST', 'IN': 'EST', 'IA': 'CST', 'KS': 'CST', 'KY': 'EST', 'LA': 'CST', 'ME': 'EST', 'MD': 'EST',
            'MA': 'EST', 'MI': 'EST', 'MN': 'CST', 'MS': 'CST', 'MO': 'CST', 'MT': 'MST', 'NE': 'CST', 'NV': 'PST', 'NH': 'EST', 'NJ': 'EST',
            'NM': 'MST', 'NY': 'EST', 'NC': 'EST', 'ND': 'CST', 'OH': 'EST', 'OK': 'CST', 'OR': 'PST', 'PA': 'EST', 'RI': 'EST', 'SC': 'EST',
            'SD': 'CST', 'TN': 'CST', 'TX': 'CST', 'UT': 'MST', 'VT': 'EST', 'VA': 'EST', 'WA': 'PST', 'WV': 'EST', 'WI': 'CST', 'WY': 'MST',
            'DC': 'EST'
        },
        specialTZ: {
            'FL': { 'PENSACOLA': 'CST', 'PANAMA CITY': 'CST', 'DESTIN': 'CST', 'FORT WALTON BEACH': 'CST' },
            'TX': { 'EL PASO': 'MST', 'HUDSPETH': 'MST' },
            'TN': { 'KNOXVILLE': 'EST', 'CHATTANOOGA': 'EST', 'JOHNSON CITY': 'EST', 'KINGSPORT': 'EST' },
            'IN': { 'GARY': 'CST', 'EVANSVILLE': 'CST' },
            'KY': { 'BOWLING GREEN': 'CST', 'OWENSBORO': 'CST', 'PADUCAH': 'CST' },
            'MI': { 'IRON MOUNTAIN': 'CST', 'MENOMINEE': 'CST' }
        },
        ianaTZ: {
            'EST': 'America/New_York', 'CST': 'America/Chicago', 'MST': 'America/Denver',
            'PST': 'America/Los_Angeles', 'AKST': 'America/Anchorage', 'HST': 'Pacific/Honolulu'
        },
        listeners: {},
        clockInterval: null,

        detectTimezone(state, city) {
            if (!state) return null;
            const s = state.toUpperCase();
            const c = city ? city.toUpperCase().trim() : '';
            if (this.specialTZ[s] && this.specialTZ[s][c]) return this.specialTZ[s][c];
            return this.stateTZ[s] || null;
        },

        create(clientId) {
            const id = 'sn-client-note';
            if (document.getElementById(id)) { app.Core.Windows.toggle(id); return; }

            const savedData = GM_getValue('cn_' + clientId, {});
            const savedColorKey = GM_getValue('cn_color_' + clientId, 'CST');
            const savedFontSize = GM_getValue('cn_font_' + clientId, '12px');
            const [bodyColor, headerColor] = this.colors[savedColorKey] || this.colors.Default;
            const defPos = GM_getValue('def_pos_CN', { width: '500px', height: '400px', top: '100px', left: '100px' });

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

            const w = document.createElement('div');
            w.id = id; w.className = 'sn-window';
            w.style.width = savedData.width || defPos.width; w.style.height = savedData.height || defPos.height;
            w.style.top = savedData.top || defPos.top; w.style.left = savedData.left || defPos.left;
            w.style.backgroundColor = savedData.customColor || bodyColor;
            w.style.fontSize = savedFontSize;

            const paletteHTML = this.presets.map(c => `<div class="sn-swatch" style="background:${c}" data-col="${c}"></div>`).join('');

            w.innerHTML = `
                    <div id="sn-wrapper" style="position:relative; width:100%; height:100%; display:flex; flex-direction:row;">

                        <div id="sn-spine-strip" style="width:28px; background:#00695c; display:flex; flex-direction:column; align-items:center; padding-top:10px; border-right:1px solid rgba(0,0,0,0.2); z-index:20; flex-shrink:0;">
                            <div class="sn-spine-btn" data-panel="info" title="Client Info" style="writing-mode:vertical-rl; text-orientation:mixed; transform:rotate(180deg); padding:15px 5px; color:#b2dfdb; cursor:pointer; font-weight:bold; font-size:12px; margin-bottom:5px; transition:background 0.2s;">CL Info</div>
                            <div class="sn-spine-btn" data-panel="ssa" title="SSA Contacts" style="writing-mode:vertical-rl; text-orientation:mixed; transform:rotate(180deg); padding:15px 5px; color:#b2dfdb; cursor:pointer; font-weight:bold; font-size:12px; margin-bottom:5px; transition:background 0.2s;">SSA</div>
                            <div class="sn-spine-btn" data-panel="fax" title="PDF Forms" style="writing-mode:vertical-rl; text-orientation:mixed; transform:rotate(180deg); padding:15px 5px; color:#b2dfdb; cursor:pointer; font-weight:bold; font-size:12px; margin-bottom:5px; transition:background 0.2s;">Fax</div>
                            <div class="sn-spine-btn" data-panel="ir" title="IR Tool" style="writing-mode:vertical-rl; text-orientation:mixed; transform:rotate(180deg); padding:15px 5px; color:#b2dfdb; cursor:pointer; font-weight:bold; font-size:12px; margin-bottom:5px; transition:background 0.2s;">IR</div>
                        </div>

                        <div id="sn-side-panel" style="position:absolute; right:100%; top:0; bottom:0; width:0px; display:none; flex-direction:column; background:rgba(255,255,255,0.95); border:1px solid #999; border-right:none; box-shadow:-2px 0 5px rgba(0,0,0,0.1); font-size:12px;">
                             <div id="sn-panel-header" style="padding:5px; font-weight:bold; background:#d0d0d0; border-bottom:1px solid #999; display:flex; align-items:center; color:#333;">
                                <span id="sn-panel-title" style="margin-right:auto;">Info</span>
                                <button id="sn-side-font-dec" style="cursor:pointer; border:1px solid #999; background:#eee; width:18px; border-radius:3px; margin-right:2px;">-</button>
                                <button id="sn-side-font-inc" style="cursor:pointer; border:1px solid #999; background:#eee; width:18px; border-radius:3px; margin-right:5px;">+</button>
                                <button id="sn-panel-close" style="border:none; background:none; cursor:pointer; font-weight:bold;">×</button>
                             </div>
                             <div id="sn-panel-body" style="padding:0px; overflow-y:auto; flex-grow:1;"></div>
                             <div class="sn-panel-resizer-left" style="width:5px; cursor:col-resize; height:100%; position:absolute; left:0; top:0; z-index:10;"></div>
                        </div>

                        <div style="flex-grow:1; display:flex; flex-direction:column; min-width:200px; height:100%; overflow:hidden;">
                            
                            <div class="sn-header" id="sn-cn-header" style="background:${headerColor}; border-bottom:1px solid rgba(0,0,0,0.1); padding:4px; display:flex; align-items:center;">
                                
                                <button id="sn-refresh-btn" title="Refresh Scraped Data" style="border:none; background:transparent; cursor:pointer; font-size:14px; margin-right:4px; transition:transform 0.2s;">🔄</button>
                                
                                <span id="sn-cl-name" style="font-weight:bold; margin-left:4px;">${savedData.name || 'Client Note'}</span>
                                <span id="sn-city" style="font-weight:bold; margin-left:8px; color:#004d40; font-size:0.9em;">${savedData.city || ''}</span>
                                <span id="sn-state" style="font-weight:bold; margin-left:4px; color:#004d40; font-size:0.9em;">${savedData.state || ''}</span>
                                <span id="sn-time" style="font-weight:normal; margin-left:8px; font-size:0.85em; color:#333; min-width:60px;"></span>
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
                                    <button id="sn-ncl-btn" title="Task NCL" style="position:absolute; bottom:5px; right:15px; font-size:10px; padding:2px 6px; cursor:pointer; background:rgba(255,255,255,0.6); border:1px solid #999; border-radius:3px; color:#00695c; font-weight:bold;">NCL</button>
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

                                <button id="sn-pop-btn" title="Copy to Clipboard" style="cursor:pointer; background:none; border:none; margin-right:5px;">📋</button>
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
                        <button id="sn-open-ssd-btn" style="flex:1; padding:5px; cursor:pointer; font-weight:bold; background:#e0f2f1; border:1px solid #009688; border-radius:4px; color:#004d40; white-space:nowrap;">Open SSD App</button>
                        <button id="sn-go-med-btn" style="flex:1; padding:5px; cursor:pointer; font-weight:bold; background:#b2dfdb; border:1px solid #009688; border-radius:4px; color:#004d40; white-space:nowrap;">Med Prov ➔</button>
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
                ssdBtn.onmouseover = () => ssdBtn.style.background = '#b2dfdb';
                ssdBtn.onmouseout = () => ssdBtn.style.background = '#e0f2f1';
                ssdBtn.onclick = () => {
                    // Generate URL directly using the 15-char ID and constant UUID
                    const id15 = clientId.substring(0, 15);
                    window.open(`https://kdcv1.my.site.com/forms/s/?uuid=a0UfL000002vlqfUAA&recordid=${id15}`, '_blank');
                };

                // Wire up the Med Provider Button
                const medBtn = container.querySelector('#sn-go-med-btn');
                medBtn.onmouseover = () => medBtn.style.background = '#80cbc4';
                medBtn.onmouseout = () => medBtn.style.background = '#b2dfdb';
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
                            this.updateAndSaveData(clientId, { [fieldMap[domId]]: el.value });
                        });
                    }
                });
            };

            const togglePanel = (type) => {
                const titleMap = { 'info': 'Client Info', 'fax': 'PDF Forms', 'ssa': 'SSA Contacts', 'ir': 'IR Tool' };
                const isSame = sideTitle.innerText === titleMap[type];

                w.querySelectorAll('.sn-spine-btn').forEach(b => {
                    b.style.color = '#b2dfdb';
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
                    if (type === 'fax') renderFaxForm(sideBody);
                    else if (type === 'ssa') renderSSAPanel(sideBody);
                    else if (type === 'ir') renderIRPanel(sideBody);
                    else renderInfoPanel(sideBody);
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

            const renderFaxForm = (container) => {
                const data = app.Core.Scraper.getSidebarData();
                const formData = GM_getValue('cn_form_data_' + clientId, {});
                const ddsName = formData.DDS_Selection || '';
                const globalCM1 = GM_getValue('sn_global_cm1', '');
                const globalExt = GM_getValue('sn_global_ext', '');

                const styles = `border:none; border-bottom:1px dashed #999; background:transparent; font-family:inherit; width:100%;`;
                // Removed inline inline event listeners
                const createField = (lbl, val, hasCheck = false, extraClass = '') => `
                    <div style="display:flex; align-items:center; margin-bottom:4px; font-size:0.9em;">
                        ${hasCheck ? '<input type="checkbox" style="margin-right:4px;">' : ''}
                        <span style="color:#555; margin-right:4px; font-weight:bold; white-space:nowrap;">${lbl}:</span>
                        <input type="text" class="sn-fax-input ${extraClass}" value="${val || ''}" readonly style="${styles}">
                    </div>`;

                const sections = [
                    { title: "Letter 25", content: `${createField('Name', data.name)}${createField('SSN', data.ssn)}${createField('Phone', formData['Phone'] || '', true)}${createField('Address', formData['Address'] || '', true)}<button style="margin-top:5px; width:100%;">📄 Generate PDF</button>` },
                    { title: "Status to DDS", content: `${createField('DDS', ddsName)}${createField('Fax #', '')}${createField('Name', data.name)}${createField('SSN', data.ssn)}${createField('DOB', data.dob)}${createField('Last update', 'N/A')}${createField('CM1', globalCM1, false, 'sn-global-cm1')}${createField('Ext.', globalExt, false, 'sn-global-ext')}<button style="margin-top:5px; width:100%;">📄 Generate PDF</button>` },
                    { title: "Status to FO", content: `${createField('Name', data.name)}${createField('SSN', data.ssn)}<button style="margin-top:5px; width:100%;">📄 Generate PDF</button>` }
                ];

                sections.forEach(sec => {
                    const wrap = document.createElement('div');
                    wrap.innerHTML = `
                        <button class="sn-fax-btn">${sec.title}</button>
                        <div class="sn-fax-content" style="display:none; padding:8px; border:1px solid #ccc; background:#f9f9f9; margin-bottom:5px;">${sec.content}</div>
                    `;
                    wrap.querySelector('.sn-fax-btn').onclick = function() {
                        const c = this.nextElementSibling;
                        c.style.display = c.style.display === 'none' ? 'block' : 'none';
                    };
                    container.appendChild(wrap);
                });

                // Attach events dynamically for security
                container.querySelectorAll('.sn-fax-input').forEach(inp => {
                    inp.ondblclick = () => { inp.removeAttribute('readonly'); inp.focus(); };
                    inp.onblur = () => inp.setAttribute('readonly', true);
                    inp.onkeydown = (e) => { if (e.key === 'Enter') inp.blur(); };
                });

                // Global savers
                container.querySelectorAll('.sn-global-cm1').forEach(el => el.oninput = () => GM_setValue('sn_global_cm1', el.value));
                container.querySelectorAll('.sn-global-ext').forEach(el => el.oninput = () => GM_setValue('sn_global_ext', el.value));
            };

            const renderSSAPanel = (container) => {
                const formData = GM_getValue('cn_form_data_' + clientId, {});
                const state = w.querySelector('#sn-state').innerText || '';

                container.innerHTML = `
                    <div style="padding:10px; display:flex; flex-direction:column; gap:15px;">
                        <!-- FO Section -->
                        <div class="sn-ssa-section" data-type="FO">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2px; border-bottom:1px solid #ccc; padding-bottom:2px;">
                                <span style="font-weight:bold; color:#00695c;">Field Office (FO)</span>
                                <div style="display:flex; gap:2px;">
                                    <button class="sn-ssa-search-btn" style="cursor:pointer; background:#e0f2f1; border:1px solid #009688; border-radius:3px; font-size:10px; padding:1px 5px;">Search</button>
                                    <button class="sn-ssa-clear-btn" style="cursor:pointer; background:#ffebee; border:1px solid #ef5350; border-radius:3px; font-size:10px; padding:1px 5px;">✕</button>
                                </div>
                            </div>
                            <div class="sn-ssa-display" style="background:#fff; border:1px solid #ccc; padding:5px; font-size:11px; min-height:40px; white-space:pre-wrap; color:#333;">${formData.FO_Text || ''}</div>
                            <div class="sn-ssa-search-box" style="display:none;">
                                <input type="text" class="sn-ssa-input" style="width:100%; border:1px solid #009688; padding:4px; font-size:11px; box-sizing:border-box; margin-bottom:5px;" placeholder="Enter State...">
                                <div class="sn-ssa-results" style="border:1px solid #b2dfdb; max-height:150px; overflow-y:auto; background:white; display:none;"></div>
                            </div>
                        </div>

                        <!-- DDS Section -->
                        <div class="sn-ssa-section" data-type="DDS">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2px; border-bottom:1px solid #ccc; padding-bottom:2px;">
                                <span style="font-weight:bold; color:#00695c;">DDS Office</span>
                                <div style="display:flex; gap:2px;">
                                    <button class="sn-ssa-search-btn" style="cursor:pointer; background:#e0f2f1; border:1px solid #009688; border-radius:3px; font-size:10px; padding:1px 5px;">Search</button>
                                    <button class="sn-ssa-clear-btn" style="cursor:pointer; background:#ffebee; border:1px solid #ef5350; border-radius:3px; font-size:10px; padding:1px 5px;">✕</button>
                                </div>
                            </div>
                            <div class="sn-ssa-display" style="background:#fff; border:1px solid #ccc; padding:5px; font-size:11px; min-height:40px; white-space:pre-wrap; color:#333;">${formData.DDS_Text || ''}</div>
                            <div class="sn-ssa-search-box" style="display:none;">
                                <input type="text" class="sn-ssa-input" style="width:100%; border:1px solid #009688; padding:4px; font-size:11px; box-sizing:border-box; margin-bottom:5px;" placeholder="Enter State...">
                                <div class="sn-ssa-results" style="border:1px solid #b2dfdb; max-height:150px; overflow-y:auto; background:white; display:none;"></div>
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
                                row.onmouseover = () => row.style.background = "#e0f2f1";
                                row.onmouseout = () => row.style.background = "white";
                                
                                const label = type === 'FO' ? `<b>${item.location}</b><br>PN: ${item.phone} | Fax: ${item.fax}` : `<b>${item.name}</b><br>PN: ${item.phone}` + (item.fax ? ` | Fax (??): ${item.fax}` : '');
                                row.innerHTML = label;
                                row.onclick = () => {
                                    const saveVal = type === 'FO' ? item.id : item.name;
                                    const displayText = type === 'FO' ? `${item.location}\n${item.fullAddress}\nPN: ${item.phone}\nFax: ${item.fax}` : `${item.name}\nPN: ${item.phone}` + (item.fax ? `\nFax (??): ${item.fax}` : '');
                                    
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

            const renderIRPanel = (container) => {
                container.innerHTML = `
                    <div style="padding:10px; display:flex; flex-direction:column; height:100%; box-sizing:border-box; gap:10px;">
                        <div style="display:flex; flex-direction:column; height:auto; flex-shrink:0;">
                            <button id="sn-ir-select-btn" style="width:100%; padding:10px; cursor:pointer; background:#e0f2f1; border:1px solid #009688; border-radius:4px; color:#004d40; font-weight:bold; display:flex; align-items:center; justify-content:center; gap:5px;">
                                <span>🎯</span> Select IR Report from Page
                            </button>
                            <div id="sn-ir-status" style="font-size:10px; color:#666; text-align:center; margin-top:4px; min-height:14px;"></div>
                        </div>
                        <div style="display:flex; flex-direction:column; flex-grow:1; overflow:hidden;">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2px;">
                                <label style="font-weight:bold; color:#00695c; font-size:11px;">Output</label>
                                <button id="sn-ir-copy" style="cursor:pointer; background:#e0f2f1; border:1px solid #009688; border-radius:3px; font-size:10px; padding:1px 5px; color:#004d40;">Copy</button>
                            </div>
                            <div id="sn-ir-output" contenteditable="true" style="flex-grow:1; width:100%; border:1px solid #ccc; font-family:inherit; padding:5px; box-sizing:border-box; background:#fff; font-size:11px; overflow-y:auto; white-space:pre-wrap;"></div>
                        </div>
                    </div>
                `;

                const summarizeIR = (text, reportDate) => {
                    if (!text) return "";
                    const getVal = (regex) => (text.match(regex) || [])[1] || "";
                    const fmtDate = (d) => {
                        if (!d) return "";
                        const date = new Date(d);
                        return isNaN(date) ? d : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                    };

                    let caseLevel = getVal(/Case Level:\s*(.*)/i).trim();
                    caseLevel = caseLevel.includes("Reconsideration") ? "Recon" : (caseLevel.includes("Initial") ? "IA" : caseLevel);
                    const receiptDate = getVal(/Receipt Date:\s*(\d{2}\/\d{2}\/\d{4})/);
                    const assignedDate = getVal(/First Date Assigned:\s*(\d{2}\/\d{2}\/\d{4})/);

                    const claimBlocks = text.split(/Claim # \d+:/).slice(1);
                    let types = new Set(), statuses = new Set(), office = "", closedDate = "";
                    claimBlocks.forEach(block => {
                        const type = (block.match(/Claim Type:\s*(.*)/i) || [])[1] || "";
                        if (type.includes("Title 16")) types.add("T16");
                        if (type.includes("Title 2")) types.add("T2");
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
                    summary += (assignedDate === receiptDate) ? `, assigned on same date.` : `, assigned on ${fmtDate(assignedDate)}.`;
                    if (isStaging) summary += ` and still on staging.`;

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
                        const date = fmtDate(ceMatch[1]);
                        const time = ceMatch[2].trim();
                        const status = ceMatch[3].trim();
                        const facilityRaw = ceMatch[4];
                        const address = ceMatch[5].trim();

                        let indName = (facilityRaw.match(/Individual Name:\s*([^,]+)/) || [])[1] || "";
                        let orgName = (facilityRaw.match(/Organization Name:\s*([^,]+)/) || [])[1] || "";
                        
                        let facilityStr = "";
                        if (indName) facilityStr += " with " + indName.trim();
                        if (orgName) facilityStr += " at " + orgName.trim();

                        let line = `\n\nA CE appointment was scheduled for CL at ${time} ${date}${facilityStr}, ${address}`;
                        
                        if (status.toLowerCase().includes("cancelled")) {
                            line += " - but it was cancelled.";
                        } else if (status.toLowerCase().includes("kept")) {
                            line += " - CL attendance was confirmed.";
                        } else {
                            line += " - CL attendance was not confirmed.";
                        }
                        summary += line;
                    }

                    return summary;
                };

                const output = container.querySelector('#sn-ir-output');
                const copyBtn = container.querySelector('#sn-ir-copy');
                const selectBtn = container.querySelector('#sn-ir-select-btn');
                const statusDiv = container.querySelector('#sn-ir-status');

                let isCapturing = false;
                let highlightEl = null;
                let mouseOverHandler = null;
                let clickHandler = null;

                const cleanup = () => {
                    if (highlightEl) highlightEl.remove();
                    if (mouseOverHandler) document.removeEventListener('mouseover', mouseOverHandler);
                    if (clickHandler) document.removeEventListener('click', clickHandler, true);
                    isCapturing = false;
                    selectBtn.style.background = '#e0f2f1';
                    selectBtn.innerHTML = '<span>🎯</span> Select IR Report from Page';
                    statusDiv.innerText = "";
                };

                selectBtn.onclick = (e) => {
                    e.stopPropagation();
                    if (isCapturing) {
                        cleanup();
                        return;
                    }

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
                        const rect = target.getBoundingClientRect();
                        highlightEl.style.width = rect.width + 'px';
                        highlightEl.style.height = rect.height + 'px';
                        highlightEl.style.top = (rect.top + window.scrollY) + 'px';
                        highlightEl.style.left = (rect.left + window.scrollX) + 'px';
                    };

                    clickHandler = (ev) => {
                        ev.preventDefault();
                        ev.stopPropagation();
                        
                        if (ev.target === selectBtn || selectBtn.contains(ev.target)) return;

                        const container = ev.target.closest('.slds-timeline__item_expandable, .slds-card, .task-card');
                        const target = container || ev.target;
                        const text = target.innerText || target.value || "";
                        
                        if (text) {
                            let dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                            // Attempt to find a date in the captured text (e.g., "Jan 3" or "Jan 3, 2025")
                            const dateMatch = text.match(/(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}(?:,?\s+\d{4})?/i);
                            if (dateMatch) {
                                dateStr = dateMatch[0];
                                if (!/\d{4}/.test(dateStr)) {
                                    dateStr += `, ${new Date().getFullYear()}`;
                                }
                            }

                            output.innerHTML = summarizeIR(text, dateStr);
                            statusDiv.innerText = "Captured!";
                            setTimeout(() => statusDiv.innerText = "", 2000);
                        } else {
                            statusDiv.innerText = "No text found.";
                        }
                        cleanup();
                    };

                    document.addEventListener('mouseover', mouseOverHandler);
                    document.addEventListener('click', clickHandler, true);
                };

                copyBtn.onclick = () => {
                    GM_setClipboard(output.innerText);
                    copyBtn.innerText = "Copied!";
                    setTimeout(() => copyBtn.innerText = "Copy", 1000);
                };
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

            w.querySelectorAll('.sn-swatch').forEach(sw => { sw.onclick = () => { w.style.backgroundColor = sw.getAttribute('data-col'); saveState(); }; });

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
                        dob: dobEl ? dobEl.value : previous.dob,
                        revisitActive: w.querySelector('#sn-revisit-check').checked, revisit: w.querySelector('#sn-revisit-date').value,
                        level: w.querySelector('#sn-level').value, type: w.querySelector('#sn-type').value,
                        todoHTML: todoList.innerHTML, notesHeight: w.querySelector('#sn-note-wrapper').style.height,
                        width: w.style.width, height: w.style.height, top: w.style.top, left: w.style.left,
                        customColor: w.style.backgroundColor, timestamp: Date.now(),
                        // We do NOT save form data (med/wit/etc) here to prevent overwriting.
                        // It is managed by cn_form_data_{id}
                    };
                    
                    GM_setValue('cn_' + clientId, data);
                    this.checkStoredData(clientId);
                } catch (err) {}
            };
            w.addEventListener('input', saveState); w.addEventListener('change', saveState); w.addEventListener('mouseup', saveState);

            const tzSelect = w.querySelector('#sn-tz-select');
            tzSelect.value = savedColorKey;
            tzSelect.onchange = () => {
                const [bg, head] = this.colors[tzSelect.value] || this.colors.Default;
                w.style.backgroundColor = bg; w.querySelector('#sn-cn-header').style.background = head;
                GM_setValue('cn_color_' + clientId, tzSelect.value);
                this.startClock(tzSelect.value);
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

            w.querySelector('#sn-pop-btn').onclick = () => { const d = app.Core.Scraper.getSidebarData(); if(d.combined) GM_setClipboard(d.combined); };
            this.startClock(savedColorKey); // Start clock on init
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
            w.querySelector('#sn-ncl-btn').onclick = () => app.Automation.TaskAutomation.runNCL(clientId);

            if (!savedData.timestamp) fillForm();
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
            const mwH = window.innerHeight / 5;
            const mwLeft = rect.left + (rect.width / 2) - (mwW / 2);
            const mwTop = rect.bottom;

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

            mw.innerHTML += `
                <div class="sn-header" style="background:#ddd; padding:5px; display:flex; align-items:center; cursor:move; border-bottom:1px solid #ccc;">
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

            mw.querySelectorAll('.sn-med-textarea').forEach(inp => {
                inp.ondblclick = () => { inp.removeAttribute('readonly'); inp.style.background = '#fff'; inp.style.border = '1px solid #009688'; inp.focus(); };
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
        }
    };

    // Assign to the namespace
    app.Features.ClientNote = ClientNote;

})(window.CM_App = window.CM_App || {});