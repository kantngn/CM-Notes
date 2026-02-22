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
                        <div style="margin-top:5px; border:2px solid #009688; background:rgba(255,255,255,0.6);">
                            <div style="background:#009688; color:white; font-weight:bold; text-align:center; padding:2px; font-size:11px;">DECISION</div>
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
            w.style.backgroundColor = '#e0f2f1'; w.style.border = '1px solid #009688';

            w.innerHTML = `
                <div class="sn-header" id="sn-${type.toLowerCase()}-header" style="background:#b2dfdb; border-bottom:1px solid #80cbc4;">
                    <div style="display:flex; align-items:center; gap:5px;">
                         <button id="sn-${type.toLowerCase()}-min" style="cursor:pointer; background:none; border:none; font-weight:bold;">_</button>
                         <span style="font-weight:bold; color:#004d40;">${config.title} - ${clientName}</span>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span id="${type.toLowerCase()}-undo" style="display:none; cursor:pointer; font-size:11px; font-weight:bold; color:#444;">UNDO</span>
                        <span id="${type.toLowerCase()}-clear" style="cursor:pointer; font-size:11px; font-weight:bold; color:#004d40;">CLEAR</span>
                        <button id="sn-${type.toLowerCase()}-close" style="background:none; border:none; font-weight:bold; cursor:pointer; font-size:14px; margin-left:5px;">X</button>
                    </div>
                </div>
                ${config.body}
                <div style="padding:10px; border-top:1px solid #80cbc4; display:flex; flex-direction:column; flex-grow:1;">
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
                    clearBtn.innerText = "CLEAR"; clearBtn.style.color = "#004d40";
                    undoBtn.style.display = "inline"; msgSpan.innerText = "Form Cleared";
                    setTimeout(() => msgSpan.innerText = "", 2000);
                }, 2000);
            };

            const resetClearBtn = () => { clearTimeout(holdTimer); if(clearBtn.innerText === "HOLD...") { clearBtn.innerText = "CLEAR"; clearBtn.style.color = "#004d40"; }};
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
            w.style.backgroundColor = '#fff3e0'; w.style.border = '1px solid #ef6c00';

            w.innerHTML = `
                <div class="sn-header" style="background:#ffe0b2; border-bottom:1px solid #ef6c00; color:#e65100;">
                    <span style="font-weight:bold;">SSD App Form Data</span>
                    <button id="ssd-close" style="background:none; border:none; color:#e65100; cursor:pointer; font-weight:bold;">X</button>
                </div>
                <div id="ssd-content" style="padding:10px; overflow-y:auto; flex-grow:1; background:#fff; min-height:200px;">
                </div>
                <div style="padding:8px; border-top:1px solid #ffe0b2; text-align:center; background:#fff3e0;">
                    <button id="ssd-copy" style="padding:5px 10px; cursor:pointer; font-weight:bold; color:#e65100; border:1px solid #ef6c00; background:white;">Copy All JSON</button>
                </div>
            `;

            document.body.appendChild(w);
            app.Core.Windows.makeDraggable(w, w.querySelector('.sn-header'));

            await scrapeAndSave();

            w.querySelector('#ssd-close').onclick = () => w.remove();
            w.querySelector('#ssd-copy').onclick = () => {
                const saved = GM_getValue('cn_form_data_' + clientId, {});
                GM_setClipboard(JSON.stringify(saved, null, 2));
                alert('Copied to clipboard!');
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
                rows += `<div style="display:flex; border-bottom:1px solid #ffe0b2; padding:4px;">
                    <strong style="width:120px; color:#e65100; font-size:11px; flex-shrink:0;">${key}:</strong>
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

        toggle() {
            if (app.Core.Windows.toggle('sn-dashboard')) {
                const el = document.getElementById('sn-dashboard');
                if (el.style.display !== 'none') { this._loadData(); this.renderList(); el.querySelector('#dash-search').focus(); }
                return;
            }

            const w = document.createElement('div');
            w.id = 'sn-dashboard'; w.className = 'sn-window';
            w.style.width = '450px'; w.style.height = '600px';
            w.style.bottom = '90px'; w.style.right = '20px';
            w.style.backgroundColor = '#e0f2f1'; w.style.border = '1px solid #009688';

            w.innerHTML = `
                <div class="sn-header" style="background:#b2dfdb; border-bottom:1px solid #009688; color:#004d40;">
                    <span style="font-weight:bold;">Sticky Notes Dashboard</span>
                    <button id="dash-close" style="background:none; border:none; color:#004d40; cursor:pointer; font-weight:bold;">X</button>
                </div>
                <div style="padding:10px; border-bottom:1px solid #b2dfdb; background:#e0f2f1;">
                    <input type="text" id="dash-search" placeholder="Search Clients..." style="width:100%; padding:8px; box-sizing:border-box; background:white; border:1px solid #b2dfdb; color:#333;">
                </div>
                <div class="sn-dash-body">
                    <div class="sn-dash-sidebar">
                        <div id="tab-revisit" class="sn-dash-tab">Revisit</div>
                        <div id="tab-recent" class="sn-dash-tab">Recent</div>
                    </div>
                    <div id="dash-content" class="sn-dash-list"></div>
                </div>
                <div style="padding:10px; border-top:1px solid #b2dfdb; display:flex; gap:10px; justify-content:space-between; font-size:11px; background:#e0f2f1;">
                    <button id="dash-export">Export Data</button>
                    <button id="dash-import">Import</button>
                    <button id="dash-reset">Reset Pos</button>
                </div>
            `;
            document.body.appendChild(w);
            app.Core.Windows.makeDraggable(w, w.querySelector('.sn-header'));
            w.querySelector('#dash-close').onclick = () => w.style.display = 'none';

            const searchInput = w.querySelector('#dash-search');
            searchInput.focus();
            searchInput.oninput = () => {
                this.renderSearchResults();
            };

            w.querySelector('#tab-revisit').onclick = () => { this.activeTab = 'revisit'; this.updateSidebar(); this.renderList(); };
            w.querySelector('#tab-recent').onclick = () => { this.activeTab = 'recent'; this.updateSidebar(); this.renderList(); };

            w.querySelector('#dash-export').onclick = () => { const data={}; GM_listValues().forEach(k => data[k] = GM_getValue(k)); GM_setClipboard(JSON.stringify(data)); alert("Data copied!"); };
            w.querySelector('#dash-import').onclick = () => { const i = prompt("Paste JSON:"); if(i) { try { const d = JSON.parse(i); Object.keys(d).forEach(k => GM_setValue(k, d[k])); alert("Done. Reload."); } catch(e) { alert("Invalid."); } } };
            w.querySelector('#dash-reset').onclick = () => { if(confirm("Reset defaults?")) { GM_setValue('def_pos_CN', null); GM_setValue('def_pos_FO', null); GM_setValue('def_pos_DDS', null); alert("Reset."); } };

            this._loadData();
            this.updateSidebar();
            this.renderList();
        },

        updateSidebar() {
            const w = document.getElementById('sn-dashboard');
            if (!w) return;
            w.querySelectorAll('.sn-dash-tab').forEach(t => t.classList.remove('active'));
            w.querySelector(`#tab-${this.activeTab}`).classList.add('active');
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
                    <div class="sn-item-name">${item.name}</div>
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

    app.Tools = {
        ContactForms,
        SSDFormViewer,
        Dashboard
    };

})(window.CM_App = window.CM_App || {});