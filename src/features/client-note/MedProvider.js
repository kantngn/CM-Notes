(function () {
    const app = window.CM_App = window.CM_App || {};
    app.Features = app.Features || {};

    /**
     * Manages the Medical Providers popout window: card-style table editing,
     * hierarchical doctor sub-entries, font controls, expand/restore, and
     * persistence of provider data.
     * @namespace app.Features.MedProvider
     */
    const MedProvider = {
        medProvider: '',
        assistiveDevice: '',
        condition: '',

        /**
         * @returns {string|null} The current active 18-character Client ID.
         */
        getClientId() {
            return window.CM_App.AppObserver.getClientId();
        },

        /**
         * Normalizes partial date strings.
         * "2026" → "1/1/2026", "05/2026" → "5/1/2026"
         * @param {string} s
         * @returns {string}
         */
        normalizeDate(s) {
            if (!s || !s.trim()) return '';
            const d = s.trim();
            if (/^\d{4}$/.test(d)) return `1/1/${d}`;
            const m = d.match(/^(\d{1,2})\/(\d{4})$/);
            if (m) return `${parseInt(m[1])}/1/${m[2]}`;
            return d;
        },

        /**
         * Migrates old flat table data to the new nested format.
         * Old: [{ doctorFacility, address, phone, firstVisit, lastVisit, nextVisit }]
         * New: [{ facility, address, phone, firstVisit, lastVisit, nextVisit, doctors: [] }]
         * @param {Array|null} data
         * @returns {Array}
         */
        _migrateTableData(data) {
            if (!data || !Array.isArray(data) || data.length === 0) return [];
            const first = data[0];
            // Already new format (has doctors array)
            if (first.doctors !== undefined) return data;
            // Migrate old flat format
            return data.map(p => ({
                facility: p.doctorFacility || p.facility || '',
                address: p.address || '',
                phone: p.phone || '',
                firstVisit: this.normalizeDate(p.firstVisit || ''),
                lastVisit: this.normalizeDate(p.lastVisit || ''),
                nextVisit: this.normalizeDate(p.nextVisit || ''),
                doctors: []
            }));
        },

        /**
         * Toggles the visibility of the supplementary Medical Provider window.
         * Instantiates the window and its parsing logic if it doesn't exist.
         */
        toggle() {
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

            let clientId = this.getClientId();
            if (!clientId) {
                const cn = document.getElementById('sn-client-note');
                if (cn && cn.dataset.clientId) {
                    clientId = cn.dataset.clientId;
                } else {
                    app.Core.Utils.showNotification("Cannot open Medical Window without a client record loaded.", { type: 'error' });
                    return;
                }
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

            const formData = GM_getValue('cn_form_data_' + clientId, {});
            this.medProvider = formData['Medical Provider'] || '';
            this.assistiveDevice = formData['Assistive Devices'] || '';
            this.condition = formData['Condition'] || '';
            const medProviderText = this.medProvider;
            const assistiveDeviceText = this.assistiveDevice;
            const conditionText = this.condition;

            // Load & migrate saved table data
            const savedTableData = GM_getValue('cn_med_table_' + clientId, null);
            const migratedData = this._migrateTableData(savedTableData);
            const showLeftPanel = !migratedData || migratedData.length === 0;

            // Default position (taller default for card layout)
            let savedSize = GM_getValue('def_pos_MED', { width: '1080px', height: '500px' });
            if (savedSize.height === '300px') savedSize.height = '500px';
            if (savedSize.height === '450px') savedSize.height = '500px';
            if (savedSize.width === '700px') savedSize.width = '1080px';

            const mwW = parseInt(savedSize.width);
            const mwH = parseInt(savedSize.height);
            const mwLeft = (window.innerWidth / 2) - (mwW / 2);

            const mw = document.createElement('div');
            mw.id = mid; mw.className = 'sn-window';
            mw.style.width = mwW + 'px';
            mw.style.height = mwH + 'px';
            if (savedSize.top && savedSize.left) {
                mw.style.top = savedSize.top;
                mw.style.left = savedSize.left;
            } else {
                mw.style.left = mwLeft + 'px';
                mw.style.bottom = '40px';
            }
            mw.style.background = '#f9f9f9';
            mw.style.display = 'flex';
            mw.style.flexDirection = 'column';
            mw.style.boxShadow = '0 4px 15px rgba(0,0,0,0.4)';
            mw.style.fontSize = '12px';
            mw.style.zIndex = '10005';

            const SPECIALIST_TYPES = [
                'PCP', 'Cardiologist', 'Neurologist', 'Orthopedic', 'Psychiatrist',
                'Surgeon', 'Dermatologist', 'ENT', 'Ophthalmologist',
                'Gastroenterologist', 'Pulmonologist', 'Rheumatologist', 'Other'
            ];

            const style = document.createElement('style');
            style.innerHTML = `
                .sn-med-card { border:1px solid #ddd; border-radius:6px; margin-bottom:14px; background:#fafafa; }
                .sn-med-card .sn-card-main { display:grid; grid-template-columns:2fr 1.5fr 1fr 1fr 1fr; gap:4px 8px; padding:8px; background:#eef3ff; border-bottom:1px solid #ddd; border-radius:6px 6px 0 0; }
                .sn-med-card .sn-card-main .sn-field-label { font-size:10px; color:#666; font-weight:bold; margin-bottom:1px; }
                .sn-med-card .sn-card-main .sn-editable { border:1px solid #ccc; padding:4px; border-radius:3px; min-height:20px; background:#fff; cursor:text; word-break:break-word; }
                .sn-med-card .sn-card-main .sn-editable:empty::before { content:attr(data-ph); color:#aaa; font-style:italic; }
                .sn-med-card .sn-card-toolbar { display:flex; align-items:center; gap:4px; padding:3px 8px; background:#f5f5f5; border-bottom:1px solid #eee; }
                .sn-med-card .sn-card-toolbar button { cursor:pointer; background:none; border:1px solid #ccc; border-radius:3px; padding:0 6px; font-size:11px; }
                .sn-med-card .sn-card-toolbar .sn-btn-del { border-color:#e0c0c0; color:#c00; }
                .sn-med-card .sn-card-toolbar .sn-btn-add-dr { background:#fff; border-color:#4a90d9; color:#4a90d9; font-weight:bold; }
                .sn-med-card .sn-card-doctors { padding:4px 8px 8px 8px; }
                .sn-med-card .sn-card-doctors table { width:100%; border-collapse:collapse; font-size:inherit; }
                .sn-med-card .sn-card-doctors th { border:1px solid #ddd; padding:3px 6px; text-align:left; font-size:11px; background:#f0f0f0; }
                .sn-med-card .sn-card-doctors td { border:1px solid #ddd; padding:2px; }
                .sn-med-card .sn-card-doctors input, .sn-med-card .sn-card-doctors select, .sn-med-card .sn-card-doctors textarea { width:100%; border:1px solid #ccc; padding:3px; border-radius:2px; font-size:inherit; box-sizing:border-box; font-family:inherit; }
                .sn-med-card .sn-card-doctors textarea { resize:vertical; }
                .sn-med-card .sn-card-doctors .sn-sub-del { cursor:pointer; background:none; border:none; color:#c00; font-size:14px; padding:0 4px; }
            `;
            mw.appendChild(style);

            // ── Helper: build one provider card HTML ──
            const renderCardHTML = (p, idx) => {
                const addrPhone = [p.address, p.phone].filter(Boolean).join('\n');
                const drRows = (p.doctors || []).map((d, di) => {
                    const typeOpts = SPECIALIST_TYPES.map(t =>
                        `<option value="${t}"${d.type === t ? ' selected' : ''}>${t}</option>`
                    ).join('');
                    return `<tr>
                        <td><input type="text" class="sn-sub-name" value="${d.name || ''}" placeholder="Dr Name"></td>
                        <td><select class="sn-sub-type">${typeOpts}</select></td>
                        <td><textarea class="sn-sub-notes" rows="2" placeholder="Notes...">${d.notes || ''}</textarea></td>
                        <td style="text-align:center; width:30px;"><button class="sn-sub-del" title="Remove doctor">&#10005;</button></td>
                    </tr>`;
                }).join('');

                return `<div class="sn-med-card" data-index="${idx}">
                    <div class="sn-card-main">
                        <div><div class="sn-field-label">Facility / Dr</div><div class="sn-editable" data-field="facility" data-ph="Facility / Dr Name" contenteditable>${p.facility || ''}</div></div>
                        <div><div class="sn-field-label">Address &amp; Phone</div><div class="sn-editable" data-field="addrPhone" data-ph="Address / Phone" contenteditable>${addrPhone}</div></div>
                        <div><div class="sn-field-label">1st Visit</div><div class="sn-editable" data-field="firstVisit" data-ph="mm/dd/yyyy" contenteditable>${p.firstVisit || ''}</div></div>
                        <div><div class="sn-field-label">Last Visit</div><div class="sn-editable" data-field="lastVisit" data-ph="mm/dd/yyyy" contenteditable>${p.lastVisit || ''}</div></div>
                        <div><div class="sn-field-label">Next Appt</div><div class="sn-editable" data-field="nextVisit" data-ph="mm/dd/yyyy" contenteditable>${p.nextVisit || ''}</div></div>
                    </div>
                    <div class="sn-card-toolbar">
                        <button class="sn-btn-collapse" title="Collapse / Expand">&#9650;</button>
                        <button class="sn-btn-del" title="Remove this provider">&#10005;</button>
                        <span style="flex:1;"></span>
                        <button class="sn-btn-add-dr">&#43; Dr</button>
                    </div>
                    <div class="sn-card-doctors">
                        <table><thead><tr>
                            <th style="width:30%;">Doctor Name</th>
                            <th style="width:18%;">Type</th>
                            <th>Notes</th>
                            <th style="width:30px;"></th>
                        </tr></thead><tbody>${drRows || `<tr><td colspan="4" style="text-align:center; color:#aaa; padding:6px; font-size:11px;">No doctors listed — click + Dr to add one</td></tr>`}</tbody></table>
                    </div>
                </div>`;
            };

            mw.innerHTML += `
                <div class="sn-header" style="background:var(--sn-bg-light); padding:5px; display:flex; justify-content:space-between; align-items:center; cursor:move; border-bottom:1px solid var(--sn-border); position: relative;">
                    <span style="font-weight:bold;">Medical Providers</span>
                    <button id="sn-med-expand-btn" style="position: absolute; left: 50%; transform: translateX(-50%); cursor:pointer; background:var(--sn-bg-lighter); border:1px solid var(--sn-border); border-radius:3px; font-size:10px; padding:2px 6px; color:var(--sn-primary-dark); font-weight:bold;">Expand</button>
                    <div>
                        <button id="sn-med-min-btn" style="cursor:pointer; background:none; border:none; font-weight:bold; padding:0 5px;">_</button>
                    </div>
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
                        <div id="sn-med-cards-container" style="flex-grow:1; padding:10px 10px 6px 10px; overflow-y:auto;">
                            ${migratedData.length > 0 ? migratedData.map((p, i) => renderCardHTML(p, i)).join('') : '<div style="text-align:center; color:#aaa; padding:40px 20px; font-size:13px;">No providers yet. Type medical text in the left panel and click <b>Parse Medical Data</b>, or click <b>New Provider</b> below.</div>'}
                            <div style="text-align:center; padding:8px 0;">
                                <button id="sn-med-add-provider" style="padding:6px 20px; cursor:pointer; border:2px dashed #4a90d9; background:#f0f7ff; border-radius:6px; font-size:12px; font-weight:bold; color:#4a90d9;">＋ New Provider</button>
                            </div>
                        </div>
                        <div style="display:flex; gap:10px; border-top:1px solid #eee; padding:10px; flex-shrink:0;">
                            <div style="flex:1; display:flex; flex-direction:column;">
                                <label style="font-weight:bold; font-size:11px; color:#555; margin-bottom:2px;">Medical Conditions</label>
                                <textarea class="sn-med-textarea" data-field="Condition" style="width:100%; flex-grow:1; min-height:70px; resize:vertical; border:1px solid #ccc; padding:4px; background:#fff; font-family:inherit; font-size:inherit;">${conditionText}</textarea>
                            </div>
                            <div style="flex:1; display:flex; flex-direction:column;">
                                <label style="font-weight:bold; font-size:11px; color:#555; margin-bottom:2px;">Assistive Devices</label>
                                <textarea class="sn-med-textarea" data-field="Assistive Devices" style="width:100%; height:4.5em; resize:vertical; border:1px solid #ccc; padding:4px; background:#fff; font-family:inherit; font-size:inherit;">${assistiveDeviceText}</textarea>
                                <div style="display:flex; justify-content:flex-end; align-items:center; gap:10px; margin-top:5px;">
                                    <button id="sn-med-font-dec" style="cursor:pointer; border:1px solid #999; background:#eee; width:20px; border-radius:3px; font-weight:normal;">-</button>
                                    <button id="sn-med-font-inc" style="cursor:pointer; border:1px solid #999; background:#eee; width:20px; border-radius:3px; font-weight:normal;">+</button>
                                    <button id="sn-medication-panel-trigger" style="padding:4px 8px; cursor:pointer; font-weight:bold; font-size:11px;">Medications</button>
                                    <button id="sn-med-gen-pdf" style="padding:5px 15px; cursor:pointer; font-weight:bold;">📄 Generate PDF</button>
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

            // ── Button references ──
            const container = mw.querySelector('#sn-med-cards-container');
            const leftPanel = mw.querySelector('#sn-med-left');
            let undoStack = null;

            // ── Read all provider data from DOM ──
            const getTableData = () => {
                const cards = container.querySelectorAll('.sn-med-card');
                return Array.from(cards).map(card => {
                    const editables = card.querySelectorAll('.sn-editable');
                    const getText = (el) => (el.innerText || '').trim();

                    const facility = getText(editables[0]);
                    const addrPhoneRaw = getText(editables[1]);
                    // Split address & phone by newline
                    const addrParts = addrPhoneRaw.split('\n').filter(Boolean);
                    const address = addrParts[0] || '';
                    const phone = addrParts.length > 1 ? addrParts.slice(1).join(', ') : '';
                    const firstVisit = getText(editables[2]);
                    const lastVisit = getText(editables[3]);
                    const nextVisit = getText(editables[4]);

                    const drRows = card.querySelectorAll('.sn-card-doctors tbody tr');
                    const doctors = Array.from(drRows).map(tr => {
                        const tds = tr.querySelectorAll('td');
                        if (tds.length < 4) return null;
                        return {
                            name: (tds[0].querySelector('input')?.value || '').trim(),
                            type: (tds[1].querySelector('select')?.value || 'PCP').trim(),
                            notes: (tds[2].querySelector('textarea')?.value || '').trim()
                        };
                    }).filter(Boolean);

                    return { facility, address, phone, firstVisit, lastVisit, nextVisit, doctors };
                });
            };

            // ── Save to GM storage ──
            const saveTableData = () => {
                const data = getTableData();
                GM_setValue('cn_med_table_' + clientId, data);
            };

            // ── Re-render all cards from data ──
            const renderTable = (data) => {
                const items = data && data.length > 0 ? data : [];
                if (items.length === 0) {
                    container.innerHTML = `<div style="text-align:center; color:#aaa; padding:40px 20px; font-size:13px;">No providers yet. Type medical text in the left panel and click <b>Parse Medical Data</b>, or click <b>New Provider</b> below.</div>
                        <div style="text-align:center; padding:8px 0;">
                            <button id="sn-med-add-provider" style="padding:6px 20px; cursor:pointer; border:2px dashed #4a90d9; background:#f0f7ff; border-radius:6px; font-size:12px; font-weight:bold; color:#4a90d9;">＋ New Provider</button>
                        </div>`;
                    return;
                }
                container.innerHTML = items.map((p, i) => renderCardHTML(p, i)).join('') +
                    `<div style="text-align:center; padding:8px 0;">
                        <button id="sn-med-add-provider" style="padding:6px 20px; cursor:pointer; border:2px dashed #4a90d9; background:#f0f7ff; border-radius:6px; font-size:12px; font-weight:bold; color:#4a90d9;">＋ New Provider</button>
                    </div>`;
            };

            // ── Parse text and populate cards ──
            const runMedicalParse = () => {
                const medTextarea = mw.querySelector('textarea[data-field="Medical Provider"]');
                if (!medTextarea.value.trim()) return;

                undoStack = getTableData();
                mw.querySelector('#sn-med-undo-btn').style.display = 'inline-block';

                let parsedData = this.parseMedicalProviders(medTextarea.value);
                // Normalize dates
                parsedData = parsedData.map(p => ({
                    ...p,
                    firstVisit: this.normalizeDate(p.firstVisit),
                    lastVisit: this.normalizeDate(p.lastVisit),
                    nextVisit: this.normalizeDate(p.nextVisit),
                    doctors: p.doctors || []
                }));

                renderTable(parsedData);
                saveTableData();
            };

            // ── Delegated event listener on container ──
            const handleContainerEvent = (e) => {
                const target = e.target;

                // New Provider button
                if (target.id === 'sn-med-add-provider' || target.closest('#sn-med-add-provider')) {
                    const data = getTableData();
                    data.push({ facility: '', address: '', phone: '', firstVisit: '', lastVisit: '', nextVisit: '', doctors: [] });
                    renderTable(data);
                    saveTableData();
                    // Scroll to bottom
                    container.scrollTop = container.scrollHeight;
                    return;
                }

                const card = target.closest('.sn-med-card');
                if (!card) return;

                // Collapse / Expand toggle
                if (target.classList.contains('sn-btn-collapse')) {
                    const doctorsDiv = card.querySelector('.sn-card-doctors');
                    const isHidden = doctorsDiv.style.display === 'none';
                    doctorsDiv.style.display = isHidden ? '' : 'none';
                    target.innerHTML = isHidden ? '&#9650;' : '&#9660;';
                    return;
                }

                // Delete provider card
                if (target.classList.contains('sn-btn-del')) {
                    const idx = parseInt(card.dataset.index);
                    const data = getTableData();
                    data.splice(idx, 1);
                    renderTable(data);
                    saveTableData();
                    return;
                }

                // Add doctor row
                if (target.classList.contains('sn-btn-add-dr')) {
                    const tbody = card.querySelector('.sn-card-doctors tbody');
                    // Remove "no doctors" placeholder row
                    const placeholder = tbody.querySelector('tr td[colspan]');
                    if (placeholder) tbody.innerHTML = '';
                    const typeOpts = SPECIALIST_TYPES.map(t => `<option value="${t}">${t}</option>`).join('');
                    tbody.insertAdjacentHTML('beforeend', `<tr>
                        <td><input type="text" class="sn-sub-name" placeholder="Dr Name"></td>
                        <td><select class="sn-sub-type">${typeOpts}</select></td>
                        <td><textarea class="sn-sub-notes" rows="2" placeholder="Notes..."></textarea></td>
                        <td style="text-align:center; width:30px;"><button class="sn-sub-del" title="Remove doctor">&#10005;</button></td>
                    </tr>`);
                    saveTableData();
                    return;
                }

                // Remove doctor sub-row
                if (target.classList.contains('sn-sub-del')) {
                    const tr = target.closest('tr');
                    const tbody = tr.closest('tbody');
                    tr.remove();
                    // If no rows left, show placeholder
                    if (tbody.querySelectorAll('tr').length === 0) {
                        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#aaa; padding:6px; font-size:11px;">No doctors listed — click + Dr to add one</td></tr>`;
                    }
                    saveTableData();
                    return;
                }
            };

            container.addEventListener('input', (e) => {
                // Debounce save on input/change
                clearTimeout(container._saveTimer);
                container._saveTimer = setTimeout(saveTableData, 300);
            });

            container.addEventListener('change', (e) => {
                clearTimeout(container._saveTimer);
                container._saveTimer = setTimeout(saveTableData, 300);
            });

            // Delegate clicks for structural changes
            container.addEventListener('click', handleContainerEvent);

            // ── Medication panel trigger ──
            const medPanelBtn = mw.querySelector('#sn-medication-panel-trigger');
            if (medPanelBtn) {
                medPanelBtn.onclick = () => {
                    if (app.Tools && app.Tools.MedicationPanel) {
                        app.Tools.MedicationPanel.create();
                    }
                };
            }

            // ── Expand / Restore ──
            const expandBtn = mw.querySelector('#sn-med-expand-btn');
            expandBtn.onclick = () => {
                if (expandBtn.innerText === "Restore") {
                    mw.style.width = mwW + 'px'; mw.style.height = mwH + 'px';
                    if (savedSize.top && savedSize.left) {
                        mw.style.top = savedSize.top; mw.style.bottom = ''; mw.style.left = savedSize.left;
                    } else {
                        mw.style.top = ''; mw.style.bottom = '40px'; mw.style.left = mwLeft + 'px';
                    }
                    expandBtn.innerText = "Expand";
                } else {
                    mw.style.height = '55vh';
                    mw.style.top = ''; mw.style.bottom = '40px';
                    expandBtn.innerText = "Restore";
                }
                mw.dispatchEvent(new Event('resize'));
            };

            // ── Raw / Hide panel ──
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
                const panelWidth = parseInt(mw.dataset.leftPanelWidth || 255);
                const currentLeft = mw.offsetLeft;
                const currentWidth = mw.offsetWidth;
                leftPanel.style.display = 'flex';
                leftPanel.style.width = panelWidth + 'px';
                mw.style.width = (currentWidth + panelWidth) + 'px';
                mw.style.left = (currentLeft - panelWidth) + 'px';
            };

            // ── Parse / Undo ──
            mw.querySelector('#sn-med-parse-btn').onclick = runMedicalParse;
            mw.querySelector('#sn-med-undo-btn').onclick = () => {
                if (undoStack) {
                    renderTable(undoStack);
                    saveTableData();
                    mw.querySelector('#sn-med-undo-btn').style.display = 'none';
                    undoStack = null;
                }
            };

            // ── Init ──
            if (migratedData.length > 0) {
                // Data already rendered via innerHTML; just bind events
                // Events are bound via delegated listener
                // Fix index attributes after DOM insertion
                container.querySelectorAll('.sn-med-card').forEach((card, i) => card.dataset.index = i);
            } else {
                // Auto-parse if text exists and no saved data
                const medTextarea = mw.querySelector('textarea[data-field="Medical Provider"]');
                if (medTextarea.value.trim()) {
                    runMedicalParse();
                    mw.querySelector('#sn-med-undo-btn').style.display = 'none';
                }
            }

            // ── Textarea save handlers ──
            mw.querySelectorAll('.sn-med-textarea').forEach(inp => {
                const field = inp.getAttribute('data-field');
                if (field === 'Medical Provider') {
                    inp.ondblclick = () => { inp.removeAttribute('readonly'); inp.style.background = '#fff'; inp.style.border = '1px solid var(--sn-border)'; inp.focus(); };
                    inp.onblur = () => { inp.setAttribute('readonly', true); inp.style.background = '#f9f9f9'; inp.style.border = '1px solid #ccc'; };
                }
                inp.oninput = () => {
                    const value = inp.value;
                    if (field === 'Medical Provider') this.medProvider = value;
                    if (field === 'Assistive Devices') this.assistiveDevice = value;
                    if (field === 'Condition') this.condition = value;
                    app.Features.ClientNote.updateAndSaveData(clientId, { [field]: value });
                };
            });

            // ── Partition resize ──
            const medPart = mw.querySelector('#sn-med-partition');
            medPart.onmousedown = (e) => {
                e.preventDefault(); const startX = e.clientX, startW = leftPanel.offsetWidth;
                const onMove = (mv) => { leftPanel.style.width = Math.max(100, (startW + (mv.clientX - startX))) + 'px'; };
                const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
                document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
            };

            // ── Font size ──
            const updateMedFont = (d) => { let cur = parseInt(mw.style.fontSize) || 12; mw.style.fontSize = Math.max(9, Math.min(18, cur + d)) + 'px'; };
            mw.querySelector('#sn-med-font-dec').onclick = (e) => { e.stopPropagation(); updateMedFont(-1); };
            mw.querySelector('#sn-med-font-inc').onclick = (e) => { e.stopPropagation(); updateMedFont(1); };

            // ── Keep card indices in sync when cards change ──
            // (handled in renderTable and container event)
        },

        /**
         * Refreshes the textareas within the Medical Provider popout window with current memory values.
         */
        updateMedWindowUI() {
            const medWindow = document.getElementById('sn-med-popout');
            if (medWindow) {
                const setVal = (field, val) => { const el = medWindow.querySelector(`textarea[data-field="${field}"]`); if (el) el.value = val || ''; };
                setVal('Medical Provider', this.medProvider);
                setVal('Assistive Devices', this.assistiveDevice);
                setVal('Condition', this.condition);
            }
        },

        /**
         * Synchronizes local UI elements (Medical fields) with incoming data state.
         * Called from ClientNote.updateUI().
         * @param {Object} data - The client data object containing extracted fields.
         */
        updateUI(data) {
            if (!data) return;
            if (data['Medical Provider']) this.medProvider = data['Medical Provider'];
            if (data['Assistive Devices']) this.assistiveDevice = data['Assistive Devices'];
            if (data['Condition']) this.condition = data['Condition'];
            this.updateMedWindowUI();
        },

        /**
         * Evaluates stored medical data for a client to toggle visibility indicators on taskbar tabs.
         * @param {string} clientId - The 18-character Salesforce Client ID.
         */
        checkStoredData(clientId) {
            if (!clientId) return;
            const medBtn = document.getElementById('tab-sn-med-popout');
            const formData = GM_getValue('cn_form_data_' + clientId, {});
            const tableData = GM_getValue('cn_med_table_' + clientId, []);
            const hasMed = formData['Medical Provider'] || formData['Assistive Devices'] || formData['Condition'] || (Array.isArray(tableData) && tableData.length > 0);
            if (hasMed && medBtn) medBtn.classList.add('sn-has-data');
            else if (medBtn) medBtn.classList.remove('sn-has-data');
        },

        /**
         * Safely dismantles the Medical Provider window and clears properties.
         * @param {string} clientId - The 18-character Salesforce Client ID.
         * @param {boolean} [force=false] - Force cleanup regardless of pin state.
         */
        destroy(clientId, force = false) {
            const mw = document.getElementById('sn-med-popout');
            if (mw) {
                mw.remove();
                app.Core.Windows.updateTabState('sn-med-popout');
            }
            this.medProvider = '';
            this.assistiveDevice = '';
            this.condition = '';
        },

        /**
         * Parses unstructured medical text blocks into structured provider objects.
         * @param {string} text - The raw text block containing medical provider notes.
         * @returns {Array<Object>} Array of { facility, address, phone, firstVisit, lastVisit, nextVisit, doctors[] }
         */
        parseMedicalProviders(text) {
            let normalizedText = text.replace(/(?:^|\n)\s*-{2,}\s*(?:\n|$)/g, '\n\n');

            const tempBlocks = normalizedText.split(/\n\s*\n/).filter(b => b.trim());
            if (tempBlocks.length > 1 && tempBlocks.every(b => !b.trim().includes('\n'))) {
                normalizedText = normalizedText.replace(/\n\s*\n/g, '\n');
            }

            const providerBlocks = normalizedText.split(/\n\s*\n/).filter(block => block.trim() !== '');
            const providers = [];

            for (const block of providerBlocks) {
                let doctorName = (block.match(/^(?:Dr\.?\s?Name|Dr information):?\s*(.*)/im) || [])[1] || "";
                let clinicName = (block.match(/^(?:Hospital Name|Health Facility|Office Name|Name of clinic\/ ?hospital|Doctor\/Facility):?\s*(.*)/im) || [])[1] || "";
                let doctorFacility = "";

                if (clinicName && doctorName) {
                    doctorFacility = `${doctorName.trim()} || ${clinicName.trim()}`;
                } else {
                    doctorFacility = (doctorName || clinicName).trim();
                }

                if (!doctorFacility) {
                    const lines = block.split('\n').map(l => l.trim()).filter(l => l);
                    if (lines.length > 0) {
                        let candidate = lines[0];
                        candidate = candidate.replace(/^[\d]+[.)]\s*/, '');

                        const skipRegex = /^(address|phone|visit|appt|telephone|1st|last|next|fv|lv|condition|treatment|diagnosis|medication|meds|rx|history|comment|note|date)/i;
                        const isDateOrNum = (s) => /^[\d\/\-\.\s]+$/.test(s);

                        if (/unsure|unknown|don't know/i.test(candidate) && lines.length > 1) {
                            const nextLine = lines[1];
                            if (!skipRegex.test(nextLine) && !isDateOrNum(nextLine)) candidate = nextLine;
                        }

                        if (!/:\s*$/.test(candidate) && !skipRegex.test(candidate) && !isDateOrNum(candidate)) {
                            doctorFacility = candidate;
                        }
                    }
                }

                let addressMatch = block.match(/^Address:\s*([\s\S]+?)(?=\n\s*(?:Phone|Telephone|number|1st|First|FV|Last|Next|Appt)|$)/im);
                let address = "";
                if (addressMatch) {
                    address = addressMatch[1].replace(/\r?\n/g, ', ').trim().replace(/,\s*,/g, ', ').replace(/,\s*$/, '');
                }

                if (!address) {
                    const lines = block.split('\n').map(l => l.trim());
                    for (let i = 0; i < lines.length; i++) {
                        const line = lines[i];
                        if (/[A-Z]{2}[,.]?\s+\d{5}/.test(line) && !/\d{1,2}\/\d{1,2}\/\d{4}/.test(line)) {
                            let addrParts = [line];
                            if (i > 0) {
                                const prev = lines[i - 1];
                                if (/^\d+/.test(prev) && !/phone|telephone/i.test(prev)) addrParts.unshift(prev);
                            }
                            address = addrParts.join(', ');
                            break;
                        }
                    }
                }

                let phone = (block.match(/^(?:Phone(?: Number)?|Telephone Number|number):?\s*(.*)/im) || [])[1] || "";
                if (!phone) { const pm = block.match(/(?:\+?1[-.\s]?)?\(?(\d{3})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})/); if (pm) phone = pm[0]; }

                let firstVisit = (block.match(/^(?:1st Visit|First Visit|1st V|First V|FV):?\s*(.*)/im) || [])[1] || "";
                let lastVisit = (block.match(/^(?:Last Visit|Last V|Last|LV):?\s*(.*)/im) || [])[1] || "";
                let nextVisit = (block.match(/^(?:Next Appointment|Next appt|Next Visit|Appointment|Appt.):?\s*(.*)/im) || [])[1] || "";

                const firstLastVisitMatch = block.match(/(?:First and last visit:)\s*([^\n\r]+)/i);
                if (firstLastVisitMatch) {
                    const dates = firstLastVisitMatch[1].split(',').map(d => d.trim());
                    if (dates.length === 2) {
                        [firstVisit, lastVisit] = dates;
                    }
                }

                if (doctorFacility) {
                    providers.push({
                        facility: doctorFacility.trim(),
                        address: address.trim(),
                        phone: app.Core.Utils.formatPhoneNumber(phone.trim()),
                        firstVisit: firstVisit.trim(),
                        lastVisit: lastVisit.trim(),
                        nextVisit: nextVisit.trim(),
                        doctors: []
                    });
                }
            }

            return providers;
        }
    };

    app.Features.MedProvider = MedProvider;
})();
