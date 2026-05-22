(function () {
    const app = window.CM_App = window.CM_App || {};
    app.Features = app.Features || {};

    /**
     * Manages the Medical Providers popout window: compact card layout with
     * expandable details (Address, Phone, First Visit, Doctors), hover tooltips,
     * delete mode, inline editing, date normalization, font controls,
     * expand/restore, and persistence of provider data.
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
         * Removes "United States", "USA", etc. from the end of an address string.
         * @param {string} addr
         * @returns {string}
         */
        _cleanAddress(addr) {
            if (!addr) return '';
            return addr.replace(/\s*,\s*United\s*States(?:\s*of\s*America)?\s*$/i, '')
                       .replace(/\s*,\s*U\.?S\.?A\.?\s*$/i, '')
                       .replace(/\s*,\s*U\.?S\.?\s*$/i, '')
                       .trim();
        },

        /**
         * Migrates any format to the current shape.
         * Accepts old [{ doctorFacility, address, phone, firstVisit, lastVisit, nextVisit }]
         * or newer formats and normalises.
         * @param {Array|null} data
         * @returns {Array}
         */
        _migrateTableData(data) {
            if (!data || !Array.isArray(data) || data.length === 0) return [];
            return data.map(p => ({
                facility: p.facility || p.doctorFacility || '',
                address: this._cleanAddress(p.address || ''),
                phone: p.phone || '',
                firstVisit: this.normalizeDate(p.firstVisit || ''),
                lastVisit: this.normalizeDate(p.lastVisit || ''),
                nextVisit: this.normalizeDate(p.nextVisit || ''),
                doctors: p.doctors || [],
                isPCP: p.isPCP || false,
                isOld: p.isOld || false,
                hasDevices: p.hasDevices || false,
                devicesText: p.devicesText || '',
                cardNotes: p.cardNotes || ''
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

            // ── Sort: PCP (non-old) first, then regular, then Old at bottom ──
            const sortByPriority = (arr) => {
                return [...arr].sort((a, b) => {
                    const aPCP = a.isPCP && !a.isOld;
                    const bPCP = b.isPCP && !b.isOld;
                    if (aPCP && !bPCP) return -1;
                    if (!aPCP && bPCP) return 1;
                    if (a.isOld && !b.isOld) return 1;
                    if (!a.isOld && b.isOld) return -1;
                    return 0;
                });
            };

            // Load & migrate saved table data
            const savedTableData = GM_getValue('cn_med_table_' + clientId, null);
            let migratedData = this._migrateTableData(savedTableData);
            migratedData = sortByPriority(migratedData);
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

            const style = document.createElement('style');
            style.innerHTML = `
                .sn-med-grid { display:flex; flex-wrap:wrap; align-items:stretch; padding:4px 0; gap:6px; }
                .sn-med-grid.cols-1 .sn-med-card { flex:1 1 100%; min-width:0; }
                .sn-med-grid.cols-2 .sn-med-card { flex:1 1 calc(50% - 6px); min-width:260px; }
                .sn-med-card { border:1px solid var(--sn-border); border-radius:6px; background:var(--sn-bg-card); box-shadow:0 1px 3px rgba(0,0,0,0.08); font-size:inherit; overflow:hidden; position:relative; transition:box-shadow 0.15s, border-color 0.15s; }
                .sn-med-card:hover { box-shadow:0 2px 6px rgba(0,0,0,0.12); }
                .sn-med-card.expanded { box-shadow:0 3px 12px rgba(0,0,0,0.13); border-color:var(--sn-primary); }
                .sn-med-card.is-pcp:not(.is-old) { border-left:3px solid var(--sn-primary); background:linear-gradient(135deg, var(--sn-bg-lighter) 0%, var(--sn-bg-card) 100%); }
                .sn-med-card.is-old { background:#e8e8e8 !important; border-color:#ccc !important; opacity:1; }
                .sn-med-card.is-old .sn-med-card-header { background:#ddd !important; border-color:#ccc !important; }
                .sn-med-card.is-old .sn-med-card-title { color:#888; }
                .sn-med-card.is-old .sn-med-card-dates .val { color:#999; }
                .sn-med-card.is-old .sn-med-badge.badge-old { background:#bbb; color:#fff; }
                .sn-med-card.is-old .sn-med-badge.badge-old-pcp { background:#aaa; color:#fff; }
                .sn-med-card.is-old .sn-med-dr-type-select { background:#e8e8e8; }
                .sn-med-card-header { display:flex; align-items:center; padding:7px 10px 5px; cursor:pointer; user-select:none; gap:6px; background:var(--sn-bg-lighter); border-bottom:1px solid var(--sn-border); }
                .sn-med-card.editing .sn-med-card-header { background:var(--sn-bg-light); }
                .sn-med-card-edit-btn { cursor:pointer; background:none; border:1px solid transparent; border-radius:3px; font-size:12px; padding:0 3px; color:var(--sn-primary-text); flex-shrink:0; line-height:1.4; opacity:0.5; transition:opacity 0.15s; }
                .sn-med-card-edit-btn:hover { opacity:1; background:var(--sn-bg-light); border-color:var(--sn-border); }
                .sn-med-card-edit-btn.editing { opacity:1; background:var(--sn-primary); color:#fff; border-color:var(--sn-primary-dark); }
                .sn-med-card-title-wrap { flex:1; min-width:0; display:flex; align-items:center; gap:4px; flex-wrap:wrap; }
                .sn-med-card-title { font-weight:bold; font-size:13px; color:var(--sn-text-main); min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; cursor:help; }
                .sn-med-card-title[contenteditable="true"] { background:#fffbe6; border:1px dashed #bbb; padding:1px 4px; border-radius:3px; outline:none; white-space:normal; cursor:text; }
                .sn-med-card-title[contenteditable="true"]:focus { border-color:var(--sn-primary); background:#fff8d6; }
                .sn-med-badge { display:inline-block; font-size:9px; font-weight:700; padding:1px 5px; border-radius:3px; line-height:1.4; flex-shrink:0; }
                .sn-med-badge.badge-pcp { background:var(--sn-primary); color:var(--sn-bg-card); }
                .sn-med-badge.badge-old { background:#bbb; color:#fff; }
                .sn-med-badge.badge-old-pcp { background:#999; color:#fff; }
                .sn-med-card-dates { display:flex; align-items:center; gap:3px; flex-shrink:0; font-size:10px; color:#888; }
                .sn-med-card-dates .val { color:var(--sn-text-main); font-weight:600; padding:1px 2px; border-radius:3px; transition:background 0.3s, box-shadow 0.3s; }
                .sn-med-card-dates .val[contenteditable="true"] { background:#fffbe6; border:1px dashed #bbb; padding:1px 4px; cursor:text; }
                .sn-med-card-dates .val[contenteditable="true"]:focus { border-color:var(--sn-primary); background:#fff8d6; outline:none; }
                .sn-med-card-dates .sep { color:#ddd; }
                .sn-date-soon { box-shadow:0 0 6px rgba(33,150,243,0.5); background:rgba(33,150,243,0.08); }
                .sn-date-overdue { box-shadow:0 0 6px rgba(244,67,54,0.5); background:rgba(244,67,54,0.08); }
                .sn-med-header-flags { display:flex; align-items:center; gap:4px; flex-shrink:0; font-size:10px; color:#666; }
                .sn-med-header-flags label { display:flex; align-items:center; gap:2px; cursor:pointer; user-select:none; white-space:nowrap; }
                .sn-med-header-flags input[type="checkbox"] { margin:0; cursor:pointer; width:11px; height:11px; }
                .sn-med-devices-input { display:none; width:70px; border:1px solid #ddd; border-radius:3px; padding:1px 4px; font-size:10px; background:#fff; }
                .sn-med-devices-input.visible { display:inline-block; }
                .sn-med-devices-input:focus { border-color:var(--sn-primary); outline:none; }
                .sn-med-devices-input.visible { display:inline-block; }
                .sn-med-card-body { padding:6px 10px 6px; display:none; background:var(--sn-bg-card); }
                .sn-med-card.expanded .sn-med-card-body { display:block; }
                .sn-med-detail-row { display:flex; margin:4px 0; gap:8px; align-items:flex-start; }
                .sn-med-detail-label { font-weight:600; color:#888; min-width:58px; font-size:11px; flex-shrink:0; padding-top:2px; }
                .sn-med-detail-value { flex:1; font-size:12px; color:var(--sn-text-main); white-space:pre-wrap; word-break:break-word; min-height:20px; line-height:1.4; padding:1px 2px; }
                .sn-med-detail-value[contenteditable="true"] { background:#fffbe6; border:1px dashed #bbb; padding:2px 5px; border-radius:3px; outline:none; min-height:22px; }
                .sn-med-detail-value[contenteditable="true"]:focus { border-color:var(--sn-primary); background:#fff8d6; }
                .sn-med-dr-type-label { font-weight:600; color:#888; min-width:58px; font-size:11px; flex-shrink:0; padding-top:2px; }
                .sn-med-dr-type-select { border:1px solid #ddd; border-radius:3px; padding:2px 4px; font-size:11px; background:#fff; cursor:pointer; max-width:160px; }
                .sn-med-dr-type-select:focus { border-color:var(--sn-primary); outline:none; }
                .sn-med-dr-type-select:disabled { background:#f5f5f5; color:#999; cursor:default; }
                .sn-med-doctors-section { margin:4px 0; flex:1; }
                .sn-med-doctor-row { display:flex; gap:4px; align-items:center; margin:3px 0; }
                .sn-med-dr-name { flex:1; min-width:0; border:1px solid #ddd; border-radius:3px; padding:2px 5px; font-size:11px; background:#fff; }
                .sn-med-dr-name:focus { border-color:var(--sn-primary); outline:none; }
                .sn-med-dr-notes { flex:1; min-width:0; border:1px solid #ddd; border-radius:3px; padding:2px 5px; font-size:11px; background:#fff; }
                .sn-med-dr-notes:focus { border-color:var(--sn-primary); outline:none; }
                .sn-med-dr-name:disabled, .sn-med-dr-notes:disabled { background:#f5f5f5; color:#999; }
                .sn-med-dr-remove { cursor:pointer; background:none; border:none; color:#c00; font-size:14px; padding:0 2px; line-height:1; flex-shrink:0; }
                .sn-med-dr-remove:hover { color:#900; }
                .sn-med-dr-add { cursor:pointer; background:none; border:1px dashed #ccc; border-radius:3px; font-size:10px; padding:2px 8px; color:#888; margin-top:2px; }
                .sn-med-dr-add:hover { border-color:var(--sn-primary); color:var(--sn-primary-text); }
                .sn-med-card-notes { width:100%; border:1px solid #ddd; border-radius:3px; padding:4px 6px; font-size:11px; background:#fff; resize:vertical; min-height:36px; font-family:inherit; box-sizing:border-box; }
                .sn-med-card-notes:focus { border-color:var(--sn-primary); outline:none; }
                .sn-med-card-notes:read-only { background:#f9f9f9; color:#999; cursor:default; }
                .sn-med-card-del-overlay { display:none; position:absolute; top:2px; right:2px; cursor:pointer; background:rgba(204,0,0,0.85); color:#fff; border:none; border-radius:50%; width:18px; height:18px; font-size:11px; line-height:18px; text-align:center; font-weight:bold; z-index:2; }
                .sn-med-card.delete-mode .sn-med-card-del-overlay { display:block; }
                .sn-med-card-del-overlay:hover { background:rgba(204,0,0,1); }
                .sn-delete-mode-active .sn-med-add-provider-wrap { pointer-events:none; opacity:0.4; }
                .sn-med-empty-state { text-align:center; color:#aaa; padding:40px 20px; font-size:13px; }

            `;
            mw.appendChild(style);

            // ── Specialist options for doctor type combobox ──
            const SPECIALISTS = ['Dr.','Cardiologist','Orthopedist','Pulmonologist','Neurologist','Psychiatrist','Podiatrist','Ophthalmologist','Gastroenterologist','Rheumatologist','Nephrologist','Endocrinologist','Dermatologist','Oncologist','Urologist','Gynecologist','Physical Therapist','Chiropractor','Other'];

            // ── Determine date glow class ──
            const getDateGlow = (dateStr) => {
                if (!dateStr || !dateStr.trim()) return '';
                const d = new Date(dateStr);
                if (isNaN(d.getTime())) return '';
                const now = new Date();
                now.setHours(0,0,0,0);
                const diffDays = (d - now) / 86400000;
                if (diffDays < 0) return 'sn-date-overdue';
                if (diffDays <= 7) return 'sn-date-soon';
                return '';
            };

            // ── Helper: render one card ──
            const renderCardHTML = (p, idx) => {
                // Build hover tooltip: "address | Dr. Name, Dr. Name"
                const tipParts = [];
                if (p.address) tipParts.push(p.address);
                if (p.doctors && p.doctors.length > 0) {
                    const drNames = p.doctors.map(d => d.name).filter(Boolean);
                    if (drNames.length > 0) tipParts.push(drNames.join(', '));
                }
                const hoverTip = tipParts.join(' | ');

                const esc = (s) => (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

                // Determine PCP/Old status and badge
                const isPCP = !!(p.isPCP);
                const isOld = !!(p.isOld);
                let badgeClass = '', badgeText = '';
                if (isPCP && isOld) { badgeClass = 'badge-old-pcp'; badgeText = 'Old PCP'; }
                else if (isPCP) { badgeClass = 'badge-pcp'; badgeText = 'PCP'; }
                else if (isOld) { badgeClass = 'badge-old'; badgeText = 'Old'; }

                let cardClasses = 'sn-med-card';
                if (isPCP) cardClasses += ' is-pcp';
                if (isOld) cardClasses += ' is-old';

                // Date glow for next visit
                const nextGlow = getDateGlow(p.nextVisit);

                // Build doctor type combobox (replaces "Doctors" label)
                const primaryType = (p.doctors && p.doctors.length > 0) ? (p.doctors[0].type || 'Dr.') : 'Dr.';
                const typeOpts = SPECIALISTS.map(s =>
                    `<option value="${esc(s)}"${primaryType === s ? ' selected' : ''}>${esc(s)}</option>`
                ).join('');

                // Build doctor rows (name + notes only, type is from the label combobox)
                const doctors = (p.doctors && Array.isArray(p.doctors)) ? p.doctors : [];
                let doctorsHTML = '';
                if (doctors.length > 0) {
                    doctorsHTML = doctors.map((d, di) =>
                        `<div class="sn-med-doctor-row" data-index="${di}">
                            <input class="sn-med-dr-name" type="text" placeholder="Dr. Name" value="${esc(d.name || '')}">
                            <input class="sn-med-dr-notes" type="text" placeholder="Notes" value="${esc(d.notes || '')}">
                            <button class="sn-med-dr-remove" title="Remove doctor">&#10005;</button>
                        </div>`
                    ).join('');
                }

                return `<div class="${cardClasses}" data-index="${idx}">
                    <button class="sn-med-card-del-overlay" title="Delete this provider">&#10005;</button>
                    <div class="sn-med-card-header">
                        <button class="sn-med-card-edit-btn" title="Toggle editing">&#9998;</button>
                        <div class="sn-med-card-title-wrap">
                            <span class="sn-med-card-title" title="${esc(hoverTip)}" data-field="facility">${esc(p.facility || 'Unknown Provider')}</span>
                            ${badgeText ? `<span class="sn-med-badge ${badgeClass}">${badgeText}</span>` : ''}
                        </div>
                        <div class="sn-med-header-flags">
                            <label><input type="checkbox" class="sn-med-chk-pcp"${isPCP ? ' checked' : ''}> PCP</label>
                            <label><input type="checkbox" class="sn-med-chk-old"${isOld ? ' checked' : ''}> Old</label>
                            <label><input type="checkbox" class="sn-med-chk-devices"${p.hasDevices ? ' checked' : ''}> Dev</label>
                            <input class="sn-med-devices-input${p.hasDevices ? ' visible' : ''}" type="text" placeholder="e.g. Walker..." value="${esc(p.devicesText || '')}">
                        </div>
                        <div class="sn-med-card-dates">
                            <span class="val" data-field="lastVisit">${esc(p.lastVisit || '\u2014')}</span>
                            <span class="sep">|</span>
                            <span class="val ${nextGlow}" data-field="nextVisit">${esc(p.nextVisit || '\u2014')}</span>
                        </div>
                    <div class="sn-med-card-body">
                        <div class="sn-med-detail-row">
                            <span class="sn-med-detail-label">Address:</span>
                            <span class="sn-med-detail-value" data-field="address">${esc(p.address || '')}</span>
                        </div>
                        <div class="sn-med-detail-row" style="display:flex; gap:8px;">
                            <span class="sn-med-detail-label">Phone:</span>
                            <span class="sn-med-detail-value" data-field="phone" style="flex:1;">${esc(p.phone || '')}</span>
                            <span class="sn-med-detail-label" style="min-width:40px;">First:</span>
                            <span class="sn-med-detail-value" data-field="firstVisit" style="flex:1;">${esc(p.firstVisit || '')}</span>
                        </div>
                        <div class="sn-med-detail-row">
                            <span class="sn-med-dr-type-label"><select class="sn-med-dr-type-select" data-field="doctorType">${typeOpts}</select></span>
                            <div class="sn-med-doctors-section" data-field="doctors">
                                ${doctorsHTML || ''}
                                <button class="sn-med-dr-add">+ Add Doctor</button>
                            </div>
                        </div>
                        <div class="sn-med-detail-row">
                            <span class="sn-med-detail-label">Notes:</span>
                            <textarea class="sn-med-card-notes" data-field="cardNotes" placeholder="Notes about this provider...">${esc(p.cardNotes || '')}</textarea>
                        </div>
                    </div>
                </div>`;
            };

            mw.innerHTML += `
                <div class="sn-header" style="background:var(--sn-bg-light); padding:5px; display:flex; justify-content:space-between; align-items:center; cursor:move; border-bottom:1px solid var(--sn-border); position: relative;">
                    <span style="font-weight:bold;">Medical Providers</span>
                    <button id="sn-med-expand-btn" style="position: absolute; left: 50%; transform: translateX(-50%); cursor:pointer; background:var(--sn-bg-lighter); border:1px solid var(--sn-border); border-radius:3px; font-size:10px; padding:2px 6px; color:var(--sn-primary-dark); font-weight:bold;">Expand</button>
                    <div style="display:flex; gap:4px; align-items:center;">
                        <button id="sn-med-cols-btn" title="Toggle 1/2 columns" style="cursor:pointer; background:var(--sn-bg-lighter); border:1px solid var(--sn-border); border-radius:3px; font-size:10px; padding:2px 6px; color:var(--sn-primary-dark); font-weight:bold;">1 Col</button>
                        <button id="sn-med-delete-mode-btn" title="Toggle delete mode" style="cursor:pointer; background:none; border:1px solid transparent; border-radius:3px; font-size:13px; padding:0 5px; line-height:1.4;">&#128465;</button>
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
                        <div id="sn-med-cards-container" style="flex-grow:1; overflow-y:auto; display:flex; flex-direction:column;">
                            <div class="sn-med-grid">
                                ${migratedData.length > 0 ? migratedData.map((p, i) => renderCardHTML(p, i)).join('') : ''}
                            </div>
                            ${migratedData.length === 0 ? '<div class="sn-med-empty-state">No providers yet. Type medical text in the left panel and click <b>Parse Medical Data</b>, or click <b>New Provider</b> below.</div>' : ''}
                            <div style="text-align:center; padding:6px 0; flex-shrink:0;" class="sn-med-add-provider-wrap">
                                <button id="sn-med-add-provider" style="padding:4px 16px; cursor:pointer; border:2px dashed #4a90d9; background:var(--sn-bg-lighter); border-radius:4px; font-size:12px; font-weight:bold; color:var(--sn-primary-dark);">＋ New Provider</button>
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
                    const titleEl = card.querySelector('.sn-med-card-title');
                    const dateVals = card.querySelectorAll('.sn-med-card-dates .val');
                    const lastEl = dateVals[0];
                    const nextEl = dateVals[1];
                    const getVal = (field) => {
                        const el = card.querySelector(`.sn-med-detail-value[data-field="${field}"]`);
                        return (el && (el.innerText || '').trim()) || '';
                    };

                    // Read primary doctor type from the label combobox
                    const typeSelect = card.querySelector('.sn-med-dr-type-select');
                    const primaryType = typeSelect ? typeSelect.value : 'Dr.';

                    // Read doctors from structured rows (name + notes only, type from label)
                    const docRows = card.querySelectorAll('.sn-med-doctor-row');
                    const doctors = Array.from(docRows).map(row => ({
                        name: (row.querySelector('.sn-med-dr-name')?.value || '').trim(),
                        type: primaryType,
                        notes: (row.querySelector('.sn-med-dr-notes')?.value || '').trim()
                    })).filter(d => d.name);

                    // Read card notes
                    const notesEl = card.querySelector('.sn-med-card-notes');
                    const cardNotes = notesEl ? notesEl.value : '';

                    return {
                        facility: (titleEl && titleEl.innerText.trim()) || '',
                        address: this._cleanAddress(getVal('address')),
                        phone: getVal('phone'),
                        firstVisit: getVal('firstVisit'),
                        lastVisit: (lastEl && lastEl.innerText.trim()) || '',
                        nextVisit: (nextEl && nextEl.innerText.trim()) || '',
                        doctors,
                        isPCP: card.querySelector('.sn-med-chk-pcp')?.checked || false,
                        isOld: card.querySelector('.sn-med-chk-old')?.checked || false,
                        hasDevices: card.querySelector('.sn-med-chk-devices')?.checked || false,
                        devicesText: (card.querySelector('.sn-med-devices-input')?.value || '').trim(),
                        cardNotes
                    };
                });
            };

            // ── Save to GM storage ──
            const saveTableData = () => {
                const data = getTableData();
                GM_setValue('cn_med_table_' + clientId, data);
            };

            // ── Re-render cards from data ──
            const renderCards = (data) => {
                const items = data && data.length > 0 ? sortByPriority(data) : [];
                if (items.length === 0) {
                    container.innerHTML = `<div class="sn-med-empty-state">No providers yet. Type medical text in the left panel and click <b>Parse Medical Data</b>, or click <b>New Provider</b> below.</div>
                        <div style="text-align:center; padding:6px 0;" class="sn-med-add-provider-wrap">
                            <button id="sn-med-add-provider" style="padding:4px 16px; cursor:pointer; border:2px dashed var(--sn-primary); background:var(--sn-bg-lighter); border-radius:4px; font-size:12px; font-weight:bold; color:var(--sn-primary-dark);">＋ New Provider</button>
                        </div>`;
                    return;
                }
                container.innerHTML = `<div class="sn-med-grid">
                    ${items.map((p, i) => renderCardHTML(p, i)).join('')}
                </div>
                <div style="text-align:center; padding:6px 0; flex-shrink:0;" class="sn-med-add-provider-wrap">
                    <button id="sn-med-add-provider" style="padding:4px 16px; cursor:pointer; border:2px dashed var(--sn-primary); background:var(--sn-bg-lighter); border-radius:4px; font-size:12px; font-weight:bold; color:var(--sn-primary-dark);">＋ New Provider</button>
                </div>`;
                // Re-apply column state after DOM replacement
                applyCols(isTwoCol);
            };

            // ── Parse text and populate cards ──
            const runMedicalParse = () => {
                const medTextarea = mw.querySelector('textarea[data-field="Medical Provider"]');
                if (!medTextarea.value.trim()) return;

                undoStack = getTableData();
                mw.querySelector('#sn-med-undo-btn').style.display = 'inline-block';

                let parsedData = this.parseMedicalProviders(medTextarea.value);
                // Normalize dates & clean addresses
                parsedData = parsedData.map(p => ({
                    ...p,
                    address: this._cleanAddress(p.address),
                    firstVisit: this.normalizeDate(p.firstVisit),
                    lastVisit: this.normalizeDate(p.lastVisit),
                    nextVisit: this.normalizeDate(p.nextVisit),
                    doctors: p.doctors || [],
                    isPCP: false,
                    isOld: false,
                    hasDevices: false,
                    devicesText: '',
                    cardNotes: ''
                }));

                renderCards(parsedData);
                saveTableData();
            };

            // ── Delegated event listener on container ──
            const handleContainerEvent = (e) => {
                const target = e.target;

                // New Provider button
                if (target.id === 'sn-med-add-provider' || target.closest('#sn-med-add-provider')) {
                    const data = getTableData();
                    data.push({ facility: '', address: '', phone: '', firstVisit: '', lastVisit: '', nextVisit: '', doctors: [], isPCP: false, isOld: false, hasDevices: false, devicesText: '', cardNotes: '' });
                    renderCards(data);
                    saveTableData();
                    container.scrollTop = container.scrollHeight;
                    return;
                }

                // Delete overlay (in delete mode)
                if (target.classList.contains('sn-med-card-del-overlay')) {
                    const card = target.closest('.sn-med-card');
                    if (!card) return;
                    const idx = parseInt(card.dataset.index);
                    const data = getTableData();
                    data.splice(idx, 1);
                    renderCards(data);
                    saveTableData();
                    return;
                }

                // Card header click → toggle expand (except edit button + dates in header)
                const header = target.closest('.sn-med-card-header');
                if (header && !target.closest('.sn-med-card-edit-btn') && !target.closest('.sn-med-card-dates')) {
                    const card = header.closest('.sn-med-card');
                    if (card) {
                        card.classList.toggle('expanded');
                    }
                    return;
                }

                // Edit button
                if (target.classList.contains('sn-med-card-edit-btn')) {
                    const card = target.closest('.sn-med-card');
                    if (!card) return;
                    const isEditing = target.classList.toggle('editing');
                    card.classList.toggle('editing', isEditing);
                    target.textContent = isEditing ? '\u2713' : '\u270E';
                    // Always expand card when entering edit mode
                    if (isEditing) card.classList.add('expanded');
                    // Toggle contenteditable on detail values, title, notes, and dates
                    card.querySelectorAll('.sn-med-detail-value[data-field], .sn-med-card-title[data-field], .sn-med-card-dates .val[data-field]').forEach(el => {
                        el.contentEditable = isEditing ? 'true' : 'false';
                    });
                    // Toggle notes disabled
                    const notesEl = card.querySelector('.sn-med-card-notes');
                    if (notesEl) notesEl.readOnly = !isEditing;
                    // Toggle doctor inputs + type select
                    card.querySelectorAll('.sn-med-dr-name, .sn-med-dr-notes, .sn-med-dr-type-select').forEach(el => {
                        el.disabled = !isEditing;
                    });
                    container.classList.toggle('editing-active', container.querySelectorAll('.sn-med-card-edit-btn.editing').length > 0);
                    if (!isEditing) {
                        saveTableData();
                    }
                    return;
                }

                // Add doctor
                if (target.classList.contains('sn-med-dr-add')) {
                    const section = target.closest('.sn-med-doctors-section');
                    if (!section) return;
                    const row = document.createElement('div');
                    row.className = 'sn-med-doctor-row';
                    row.innerHTML = `<input class="sn-med-dr-name" type="text" placeholder="Dr. Name">
                        <input class="sn-med-dr-notes" type="text" placeholder="Notes">
                        <button class="sn-med-dr-remove" title="Remove doctor">&#10005;</button>`;
                    row.querySelectorAll('.sn-med-dr-name, .sn-med-dr-notes').forEach(el => {
                        el.disabled = !container.classList.contains('editing-active');
                    });
                    target.parentNode.insertBefore(row, target);
                    saveTableData();
                    return;
                }

                // Remove doctor
                if (target.classList.contains('sn-med-dr-remove')) {
                    const row = target.closest('.sn-med-doctor-row');
                    if (!row) return;
                    row.remove();
                    saveTableData();
                    return;
                }

                // Devices checkbox → show/hide text input
                if (target.classList.contains('sn-med-chk-devices')) {
                    const card = target.closest('.sn-med-card');
                    if (!card) return;
                    const input = card.querySelector('.sn-med-devices-input');
                    if (input) input.classList.toggle('visible', target.checked);
                    saveTableData();
                    return;
                }

                // PCP checkbox → update card styling + badge
                if (target.classList.contains('sn-med-chk-pcp')) {
                    const card = target.closest('.sn-med-card');
                    if (!card) return;
                    card.classList.toggle('is-pcp', target.checked);
                    updateCardBadge(card);
                    saveTableData();
                    return;
                }

                // Old checkbox → update card styling + badge
                if (target.classList.contains('sn-med-chk-old')) {
                    const card = target.closest('.sn-med-card');
                    if (!card) return;
                    card.classList.toggle('is-old', target.checked);
                    updateCardBadge(card);
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

            // Delegate change events for checkboxes to trigger save
            container.addEventListener('change', (e) => {
                const target = e.target;
                if (target.classList.contains('sn-med-chk-pcp') || target.classList.contains('sn-med-chk-old')) {
                    clearTimeout(container._saveTimer);
                    container._saveTimer = setTimeout(saveTableData, 300);
                }
            });

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
                    renderCards(undoStack);
                    saveTableData();
                    mw.querySelector('#sn-med-undo-btn').style.display = 'none';
                    undoStack = null;
                }
            };

            // ── Init ──
            if (migratedData.length > 0) {
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

            // ── Helper: update PCP/Old badge on a card ──
            const updateCardBadge = (card) => {
                const isPCP = card.querySelector('.sn-med-chk-pcp')?.checked || false;
                const isOld = card.querySelector('.sn-med-chk-old')?.checked || false;
                const existingBadge = card.querySelector('.sn-med-badge');
                const titleWrap = card.querySelector('.sn-med-card-title-wrap');
                let cls = '', txt = '';
                if (isPCP && isOld) { cls = 'badge-old-pcp'; txt = 'Old PCP'; }
                else if (isPCP) { cls = 'badge-pcp'; txt = 'PCP'; }
                else if (isOld) { cls = 'badge-old'; txt = 'Old'; }
                if (existingBadge) {
                    if (txt) {
                        existingBadge.className = 'sn-med-badge ' + cls;
                        existingBadge.textContent = txt;
                    } else {
                        existingBadge.remove();
                    }
                } else if (txt && titleWrap) {
                    const b = document.createElement('span');
                    b.className = 'sn-med-badge ' + cls;
                    b.textContent = txt;
                    titleWrap.appendChild(b);
                }
            };

            // ── Column toggle ──
            const colBtn = mw.querySelector('#sn-med-cols-btn');
            let isTwoCol = GM_getValue('sn_med_two_col', false);
            const applyCols = (twoCol) => {
                const gridEl = container.querySelector('.sn-med-grid');
                if (!gridEl) return;
                gridEl.classList.toggle('cols-2', twoCol);
                gridEl.classList.toggle('cols-1', !twoCol);
                colBtn.textContent = twoCol ? '2 Col' : '1 Col';
                colBtn.style.background = twoCol ? 'var(--sn-primary)' : 'var(--sn-bg-lighter)';
                colBtn.style.color = twoCol ? '#fff' : 'var(--sn-primary-dark)';
            };
            applyCols(isTwoCol);
            colBtn.onclick = () => { isTwoCol = !isTwoCol; applyCols(isTwoCol); GM_setValue('sn_med_two_col', isTwoCol); };

            // ── Delete mode toggle ──
            const deleteModeBtn = mw.querySelector('#sn-med-delete-mode-btn');
            if (deleteModeBtn) {
                deleteModeBtn.onclick = () => {
                    const isActive = container.classList.toggle('sn-delete-mode-active');
                    deleteModeBtn.style.borderColor = isActive ? '#c00' : 'transparent';
                    deleteModeBtn.style.color = isActive ? '#c00' : '';
                    container.querySelectorAll('.sn-med-card').forEach(card => {
                        card.classList.toggle('delete-mode', isActive);
                    });
                };
            }
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
         * @returns {Array<Object>} Array of { facility, address, phone, firstVisit, lastVisit, nextVisit, doctors, isPCP, isOld, cardNotes }
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
                        address: this._cleanAddress(address.trim()),
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
