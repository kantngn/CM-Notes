(function () {
    const app = window.CM_App = window.CM_App || {};
    app.Tools = app.Tools || {};

    /**
     * FAX Panel module — 'PDF Forms' panel for generating and faxing SSA forms.
     * Handles UI generation, PDF form filling (via PDFLib), data refresh,
     * and Last Activity logging for fax actions.
     *
     * @namespace app.Tools.FaxPanel
     */
    const FaxPanel = {
        /**
         * Creates (or toggles) the FAX panel window.
         */
        create() {
            const id = 'sn-fax-panel';
            const existing = document.getElementById(id);
            if (existing) {
                if (existing._updateFaxClient) {
                    const currentPageClientId = app.AppObserver.getClientId();
                    if (currentPageClientId && existing.dataset.clientId !== currentPageClientId) {
                        existing._updateFaxClient(currentPageClientId);
                    }
                }
                app.Core.Windows.toggle(id);
                return;
            }

            let clientId = app.AppObserver.getClientId();
            if (!clientId) {
                const cn = document.getElementById('sn-client-note');
                if (cn && cn.dataset.clientId) {
                    clientId = cn.dataset.clientId;
                } else {
                    app.Core.Utils.showNotification("Client context not found.", { type: 'error' });
                    return;
                }
            }

            const defPos = GM_getValue('def_pos_FAX', { width: '480px', height: 'auto', bottom: '50px', left: 'calc(50% - 240px)' });

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
            w.dataset.clientId = clientId;

            w.innerHTML = `
                <div class="sn-header" style="background:var(--sn-bg-light); border-bottom:1px solid var(--sn-border);">
                    <div style="display:flex; align-items:center; gap:5px;">
                         <button id="sn-fax-min" style="cursor:pointer; background:none; border:none; font-weight:bold;">_</button>
                         <span style="font-weight:bold; color:var(--sn-primary-dark);">PDF Forms - Client</span>
                         <label style="font-size:0.75em; display:flex; align-items:center; gap:2px; cursor:pointer; white-space:nowrap; color:#888;" title="Log Last Activity when faxing">
                             <input type="checkbox" id="sn-fax-log-toggle"> 📝 Log
                         </label>
                         <button id="sn-fax-refresh" style="cursor:pointer; background:none; border:none; font-size:14px;" title="Refresh Data">🔄</button>
                    </div>
                    <button id="sn-fax-close" style="background:none; border:none; font-weight:bold; cursor:pointer; font-size:14px; margin-left:5px;">X</button>
                </div>
                <div id="fax-body" style="overflow-y:auto; flex-grow:1;">
                    <!-- Content will be rendered here -->
                </div>
                <div class="sn-resizer rs-n"></div><div class="sn-resizer rs-s"></div>
                <div class="sn-resizer rs-e"></div><div class="sn-resizer rs-w"></div>
                <div class="sn-resizer rs-ne"></div><div class="sn-resizer rs-nw"></div>
                <div class="sn-resizer rs-se"></div><div class="sn-resizer rs-sw"></div>
            `;
            document.body.appendChild(w);
            app.Core.Windows.setup(w, w.querySelector('#sn-fax-min'), w.querySelector('.sn-header'), 'FAX');

            // Initialize Log Activity toggle from stored state
            const logToggle = w.querySelector('#sn-fax-log-toggle');
            if (logToggle) {
                logToggle.checked = GM_getValue('sn_fax_log_activity', true);
                logToggle.onchange = () => GM_setValue('sn_fax_log_activity', logToggle.checked);
            }

            w.querySelector('#sn-fax-close').onclick = () => { w.style.display = 'none'; app.Core.Windows.updateTabState(w.id); };

            const bodyContainer = w.querySelector('#fax-body');
            this._loadFaxData(bodyContainer, w);

            // Expose method so AppObserver can update the panel when client changes
            w._updateFaxClient = (newClientId) => {
                w.dataset.clientId = newClientId;
                this._loadFaxData(bodyContainer, w, false);
            };

            w.querySelector('#sn-fax-refresh').onclick = (e) => {
                e.target.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], { duration: 500 });
                const currentPageId = app.AppObserver.getClientId();
                if (currentPageId) w.dataset.clientId = currentPageId;
                this._loadFaxData(bodyContainer, w, true);
            };
        },

        /**
         * Load (or refresh) fax data into the panel body.
         * @param {HTMLElement} bodyContainer
         * @param {HTMLElement} w - Panel window element
         * @param {boolean} [refreshOnly=false] - true = just update field values
         */
        _loadFaxData(bodyContainer, w, refreshOnly = false) {
            const currentId = w.dataset.clientId;
            const savedData = GM_getValue('cn_' + currentId, {});
            const headerData = app.Core.Scraper.getHeaderData();
            const pageData = app.Core.Scraper.getAllPageData();

            const sidebarData = {
                name: savedData.name || headerData.clientName || "Client",
                ssn: savedData.ssn || pageData.ssn || "",
                dob: savedData.dob || pageData.dob || ""
            };

            if (refreshOnly) {
                const formData = GM_getValue('cn_form_data_' + currentId, {});

                const updateFields = (cls, val) => {
                    bodyContainer.querySelectorAll('.' + cls).forEach(el => el.value = val || '');
                };

                let foFax = '';
                if (formData.FO_Text) {
                    const match = formData.FO_Text.match(/Fax:\s*([\d-]+)/i);
                    if (match) foFax = match[1].replace(/\D/g, '');
                }

                updateFields('sn-field-name', sidebarData.name);
                updateFields('sn-field-ssn', sidebarData.ssn);
                updateFields('sn-field-dob', sidebarData.dob);

                const addrVal = formData['Address'] || '';
                const phoneVal = formData['Phone'] || '';

                const addrParts = addrVal.split(',').map(s => s.trim()).filter(s => s);
                updateFields('sn-l25-addr1', addrParts[0] || '');
                updateFields('sn-l25-addr2', addrParts.length > 1 ? addrParts.slice(1).join(', ') : '');

                const phones = phoneVal.split(/[\n,;|]+/).map(s => s.trim()).filter(p => p.length > 0);
                updateFields('sn-l25-primary-phone', phones[0] || '');
                updateFields('sn-l25-alt-phone', phones.length > 1 ? phones.slice(1).join(" || ") : '');

                updateFields('sn-field-dds', formData.DDS_Selection);
                const formattedFoFax = this._formatFax(foFax);
                updateFields('sn-fax-fo', formattedFoFax);

                const ddsName = formData.DDS_Selection || '';
                if (ddsName && app.Core.SSADataManager) {
                    app.Core.SSADataManager.search('DDS', ddsName, (results) => {
                        if (results && results.length > 0) {
                            const ddsFax = results[0].fax || '';
                            if (ddsFax) updateFields('sn-fax-dds', this._formatFax(ddsFax));
                        }
                    });
                }

                updateFields('sn-global-cm1', GM_getValue('sn_global_cm1', ''));
                updateFields('sn-global-ext', GM_getValue('sn_global_ext', ''));
            } else {
                bodyContainer.innerHTML = '';
                this._renderFaxForm(bodyContainer, currentId, sidebarData);
            }
        },

        // ── Helpers ──────────────────────────────────────────────────────────

        /**
         * Formats a phone/fax number string as xxx-xxx-xxxx.
         * Strips non-digits first, then applies dashes for easy visual comparison.
         * @param {string} num - Raw fax number (with or without formatting)
         * @returns {string} Formatted fax number
         */
        _formatFax(num) {
            const digits = (num || '').replace(/\D/g, '');
            if (digits.length === 10) {
                return digits.slice(0, 3) + '-' + digits.slice(3, 6) + '-' + digits.slice(6);
            }
            if (digits.length === 7) {
                return digits.slice(0, 3) + '-' + digits.slice(3);
            }
            return num || '';
        },

        // ── Render methods ────────────────────────────────────────────────────

        _createField(lbl, val, hasCheck = false, extraClass = '', checkId = '') {
            const styles = `border:none; border-bottom:1px dashed #999; background:transparent; font-family:inherit; width:100%;`;
            return `
                <div style="display:flex; align-items:center; margin-bottom:4px; font-size:0.9em;">
                    ${hasCheck ? `<input type="checkbox" ${checkId ? `id="${checkId}"` : ''} style="margin-right:4px;">` : ''}
                    <span style="color:#555; margin-right:4px; font-weight:bold; white-space:nowrap;">${lbl ? lbl + ':' : ''}</span>
                    <input type="text" class="sn-fax-input ${extraClass}" value="${val || ''}" readonly style="${styles}">
                </div>`;
        },

        _renderFaxForm(container, clientId, data) {
            const formData = GM_getValue('cn_form_data_' + clientId, {});
            const ddsName = formData.DDS_Selection || '';
            const globalCM1 = GM_getValue('sn_global_cm1', '');
            const globalExt = GM_getValue('sn_global_ext', '');

            let foFax = '';
            if (formData.FO_Text) {
                const match = formData.FO_Text.match(/Fax:\s*([\d-]+)/i);
                if (match) foFax = match[1].replace(/\D/g, '');
            }

            const cf = (lbl, val, hasCheck, extraClass, checkId) =>
                this._createField(lbl, val, hasCheck, extraClass, checkId);

            const addr1696  = formData['Address'] || '';
            const phone1696 = (formData['Phone'] || '').split(/[\n,;|]+/)[0].trim();
            const formattedFoFax = this._formatFax(foFax);

            const sections = [
                { title: "Letter 25", content: `
                    ${cf('Name', data.name, false, 'sn-field-name')}
                    ${cf('SSN', data.ssn, false, 'sn-field-ssn')}
                    <div style="margin:5px 0; border-bottom:1px solid #ccc; padding-bottom:5px; display:flex; gap:10px;">
                        <label><input type="checkbox" id="sn-l25-phone-chk" checked> Include Phone</label>
                        <label><input type="checkbox" id="sn-l25-addr-chk" checked> Include Address</label>
                    </div>
                    <div id="sn-l25-dynamic-header" style="font-weight: bold; margin: 8px 0 4px 0; color: var(--sn-primary-dark); font-size: 0.95em;"></div>
                    <input type="hidden" class="sn-l25-header" value="">
                    <div id="sn-l25-phone-fields-container">
                        ${cf('Primary Number', '', false, 'sn-l25-primary-phone')}
                        ${cf('Alt /Home number', '', false, 'sn-l25-alt-phone')}
                    </div>
                    <div id="sn-l25-addr-fields-container">
                        ${cf('New address', '', false, 'sn-l25-addr1')}
                        ${cf('', '', false, 'sn-l25-addr2')}
                    </div>
                    <div style="display:flex; align-items:center; margin-bottom:4px; font-size:0.9em;">
                        <span style="color:#555; margin-right:4px; font-weight:bold; white-space:nowrap;">Fax #:</span>
                        <input type="text" class="sn-fax-input sn-field-fax sn-fax-fo" value="${formattedFoFax}" readonly style="border:none; border-bottom:1px dashed #999; background:transparent; font-family:inherit; width:100%;">
                        <button id="sn-l25-fax-toggle" class="sn-fax-toggle-btn" data-target="FO" style="margin-left:4px; padding:1px 6px; font-size:0.7em; cursor:pointer; border:1px solid #999; border-radius:3px; background:#e0e0e0; white-space:nowrap; flex-shrink:0;">FO</button>
                    </div>
                    <div style="display:flex; gap:5px; margin-top:5px;">
                        <button id="sn-pdf-l25" class="sn-fax-action-btn" style="flex:1;">📄 Generate PDF</button>
                        <button class="sn-fax-action-btn sn-open-ifax" style="flex:1;">Open iFax</button>
                    </div>
                ` },
                { title: "Status DDS", content: `${cf('DDS', ddsName, false, 'sn-field-dds')}${cf('Fax #', '', false, 'sn-field-fax sn-fax-dds')}${cf('Name', data.name, false, 'sn-field-name')}${cf('SSN', data.ssn, false, 'sn-field-ssn')}${cf('DOB', data.dob, false, 'sn-field-dob')}${cf('Last update', 'N/A', false, 'sn-last-update')}${cf('CM1', globalCM1, false, 'sn-global-cm1')}${cf('Ext.', globalExt, false, 'sn-global-ext')}<div style="display:flex; gap:5px; margin-top:5px;"><button id="sn-pdf-s2dds" class="sn-fax-action-btn" style="flex:1;">📄 Generate PDF</button><button class="sn-fax-action-btn sn-open-ifax" style="flex:1;">Open iFax</button></div>` },
                { title: "Status FO", content: `${cf('Name', data.name, false, 'sn-field-name')}${cf('SSN', data.ssn, false, 'sn-field-ssn')}${cf('DOB', data.dob, false, 'sn-field-dob')}${cf('Fax #', formattedFoFax, false, 'sn-field-fax sn-fax-fo')}<div style="display:flex; gap:5px; margin-top:5px;"><button id="sn-pdf-s2fo" class="sn-fax-action-btn" style="flex:1;">📄 Generate PDF</button><button class="sn-fax-action-btn sn-open-ifax" style="flex:1;">Open iFax</button></div>` },
                { title: "1696", content: `
                    ${cf('Name', data.name, false, 'sn-field-name sn-1696-name')}
                    ${cf('SSN', data.ssn, false, 'sn-field-ssn sn-1696-ssn')}
                    ${cf('DOB', data.dob, false, 'sn-field-dob sn-1696-dob')}
                    ${cf('Address', addr1696, false, 'sn-1696-address')}
                    ${cf('Phone', phone1696, false, 'sn-1696-phone')}
                    ${cf('Fax #', formattedFoFax, false, 'sn-field-fax sn-fax-fo')}
                    <input type="file" id="sn-1696-file-input" accept=".pdf" style="display:none;">
                    <div id="sn-1696-file-label" style="font-size:0.8em; color:#888; margin:4px 0 6px 0; min-height:16px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">No file selected</div>
                    <div style="display:flex; gap:5px; margin-top:5px;">
                        <button id="sn-1696-select-btn" class="sn-fax-action-btn" style="flex:1;">📂 Select IP Contract</button>
                        <button id="sn-1696-process-btn" class="sn-fax-action-btn" style="flex:1;">⚙️ Process</button>
                        <button class="sn-fax-action-btn sn-open-ifax" style="flex:1;">Open iFax</button>
                    </div>
                ` },
                { title: "Medical", content: `
                    ${cf('Name', data.name, false, 'sn-field-name')}
                    ${cf('SSN', data.ssn, false, 'sn-field-ssn')}
                    ${cf('DOB', data.dob, false, 'sn-field-dob')}
                    ${cf('Fax #', '', false, 'sn-field-fax sn-fax-dds')}
                    ${cf('Notes', '', false, 'sn-medical-notes')}
                    <div style="display:flex; gap:5px; margin-top:5px;">
                        <button class="sn-fax-action-btn sn-open-ifax" style="flex:1;">Open iFax</button>
                    </div>
                ` }
            ];

            container.style.padding = '10px';

            const btnContainer = document.createElement('div');
            btnContainer.style.display = 'flex';
            btnContainer.style.gap = '5px';
            btnContainer.style.marginBottom = '10px';
            container.appendChild(btnContainer);

            const contentContainer = document.createElement('div');
            container.appendChild(contentContainer);

            sections.forEach(sec => {
                const btn = document.createElement('button');
                btn.className = 'sn-fax-btn';
                btn.innerText = sec.title;
                btn.style.flex = '1';
                btn.onclick = () => {
                    btnContainer.querySelectorAll('.sn-fax-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    contentContainer.innerHTML = `<div style="padding:8px; border:1px solid #ccc; background:#f9f9f9;">${sec.content}</div>`;
                    this._attachFaxEvents(contentContainer, clientId, data, formData, ddsName, globalCM1, globalExt);

                    if (sec.title === "Status DDS" && ddsName && app.Core.SSADataManager) {
                        const faxInput = contentContainer.querySelector('.sn-fax-dds');
                        if (faxInput && !faxInput.value) {
                            app.Core.SSADataManager.search('DDS', ddsName, (results) => {
                                if (results && results.length > 0) {
                                    const ddsFax = results[0].fax || '';
                                    if (ddsFax) faxInput.value = this._formatFax(ddsFax);
                                }
                            });
                        }
                    }
                };
                btnContainer.appendChild(btn);
            });
        },

        // ── Event binding ────────────────────────────────────────────────────

        _attachFaxEvents(container, clientId, data, formData, ddsName, globalCM1, globalExt) {
            container.querySelectorAll('.sn-fax-input').forEach(inp => {
                inp.ondblclick = () => { inp.removeAttribute('readonly'); inp.focus(); };
                inp.onblur = () => inp.setAttribute('readonly', true);
                inp.onkeydown = (e) => { if (e.key === 'Enter') inp.blur(); };
            });

            const getVal = (cls) => { const el = container.querySelector('.' + cls); return el ? el.value : ''; };

            // ── L25 Dynamic Update ─────────────────────────────────────────────
            const updateL25 = () => {
                const phoneChk = container.querySelector('#sn-l25-phone-chk');
                if (!phoneChk) return;

                const includePhone = phoneChk.checked;
                const includeAddr = container.querySelector('#sn-l25-addr-chk').checked;
                const phoneVal = formData['Phone'] || '';
                const addrVal = formData['Address'] || '';

                const setVal = (cls, v) => { const el = container.querySelector('.' + cls); if (el) el.value = v; };
                const setVisibility = (id, visible) => { const el = container.querySelector(id); if (el) el.style.display = visible ? 'block' : 'none'; };

                let header = '';
                if (includePhone && !includeAddr) header = "Updated Phone Number";
                else if (!includePhone && includeAddr) header = "Updated Address";
                else if (includePhone && includeAddr) header = "Updated Phone Number and Address";

                const headerDisplayEl = container.querySelector('#sn-l25-dynamic-header');
                if (headerDisplayEl) headerDisplayEl.innerText = header;
                setVal('sn-l25-header', header);

                setVisibility('#sn-l25-phone-fields-container', includePhone);
                if (includePhone) {
                    const phones = phoneVal.split(/[\n,;|]+/).map(s => s.trim()).filter(p => p.length > 0);
                    setVal('sn-l25-primary-phone', phones[0] || '');
                    setVal('sn-l25-alt-phone', phones.length > 1 ? phones.slice(1).join(" || ") : '');
                } else {
                    setVal('sn-l25-primary-phone', '');
                    setVal('sn-l25-alt-phone', '');
                }

                setVisibility('#sn-l25-addr-fields-container', includeAddr);
                if (includeAddr) {
                    const parts = addrVal.split(',').map(s => s.trim()).filter(s => s);
                    setVal('sn-l25-addr1', parts[0] || '');
                    setVal('sn-l25-addr2', parts.length > 1 ? parts.slice(1).join(', ') : '');
                } else {
                    setVal('sn-l25-addr1', '');
                    setVal('sn-l25-addr2', '');
                }
            };
            container.querySelector('#sn-l25-phone-chk')?.addEventListener('change', updateL25);
            container.querySelector('#sn-l25-addr-chk')?.addEventListener('change', updateL25);
            updateL25();

            // ── Letter 25 DDS/FO fax toggle ─────────────────────────────────
            const faxToggle = container.querySelector('#sn-l25-fax-toggle');
            if (faxToggle) {
                faxToggle.onclick = () => {
                    const isDds = faxToggle.dataset.target === 'DDS';
                    const faxInput = container.querySelector('.sn-field-fax');

                    // Compute FO fax from formData
                    const foText = formData.FO_Text || '';
                    const foMatch = foText.match(/Fax:\s*([\d-]+)/i);
                    const foFaxNum = foMatch ? this._formatFax(foMatch[1].replace(/\D/g, '')) : '';

                    if (isDds) {
                        // Switch to FO
                        faxToggle.dataset.target = 'FO';
                        faxToggle.textContent = 'FO';
                        faxToggle.style.background = '#e0e0e0';
                        if (faxInput) faxInput.value = foFaxNum;
                    } else {
                        // Switch to DDS
                        faxToggle.dataset.target = 'DDS';
                        faxToggle.textContent = 'DDS';
                        faxToggle.style.background = '#d4e8ff';
                        const ddsNameVal = formData.DDS_Selection || '';
                        if (ddsNameVal && app.Core.SSADataManager) {
                            app.Core.SSADataManager.search('DDS', ddsNameVal, (results) => {
                                if (results && results.length > 0) {
                                    const ddsFaxNum = results[0].fax || '';
                                    if (ddsFaxNum && faxInput) faxInput.value = this._formatFax(ddsFaxNum);
                                }
                            });
                        }
                    }
                };
            }

            // ── Shared PDF configs (used by both "Generate PDF" and "Open iFax") ──
            const pdfConfigs = {
                letter25: {
                    url: 'https://raw.githubusercontent.com/kantngn/CM-Notes/refs/heads/main/db/L25.pdf',
                    fillFn: (form, today) => {
                        try { form.getTextField('Date').setText(today); } catch (e) { }
                        try { form.getTextField('Name').setText(getVal('sn-field-name')); } catch (e) { }
                        try { form.getTextField('SSN').setText(getVal('sn-field-ssn')); } catch (e) { }
                        try { form.getTextField('Header').setText(getVal('sn-l25-header')); } catch (e) { }

                        const includePhone = container.querySelector('#sn-l25-phone-chk').checked;
                        const includeAddr = container.querySelector('#sn-l25-addr-chk').checked;
                        const lines = [];

                        if (includePhone) {
                            const primary = getVal('sn-l25-primary-phone');
                            const alt = getVal('sn-l25-alt-phone');
                            if (primary) lines.push(`Primary Number: ${primary}`);
                            if (alt) lines.push(`Alt /Home number: ${alt}`);
                        }
                        if (includeAddr) {
                            const addr1 = getVal('sn-l25-addr1');
                            const addr2 = getVal('sn-l25-addr2');
                            if (addr1) lines.push(`New address: ${addr1}`);
                            if (addr2) lines.push(addr2);
                        }

                        for (let i = 0; i < 5; i++) {
                            try { form.getTextField(`Info${i + 1}`).setText(lines[i] || ""); } catch (e) { }
                        }
                    }
                },
                statusfo: {
                    url: 'https://raw.githubusercontent.com/kantngn/CM-Notes/refs/heads/main/db/S2FO.pdf',
                    fillFn: (form, today) => {
                        const nameVal = getVal('sn-field-name');
                        const ssnVal = getVal('sn-field-ssn');
                        const dobVal = getVal('sn-field-dob');
                        try { form.getTextField('Date').setText(today); } catch (e) { }
                        try { form.getTextField('ID').setText(`${nameVal}, SSN: ${ssnVal}`); } catch (e) { }
                        try { form.getTextField('DOB').setText(dobVal); } catch (e) { }
                    }
                },
                statusdds: {
                    url: 'https://raw.githubusercontent.com/kantngn/CM-Notes/refs/heads/main/db/S2DDS.pdf',
                    fillFn: (form, today) => {
                        const ddsVal = getVal('sn-field-dds');
                        const nameVal = getVal('sn-field-name');
                        const ssnVal = getVal('sn-field-ssn');
                        const dobVal = getVal('sn-field-dob');
                        const lastUpdateVal = getVal('sn-last-update');
                        const cm1Val = getVal('sn-global-cm1');
                        const extVal = getVal('sn-global-ext');

                        try { form.getTextField('Date').setText(today); } catch (e) { }
                        try { form.getTextField('DDS').setText(ddsVal); } catch (e) { }
                        try { form.getTextField('ID').setText(`${nameVal}, SSN: ${ssnVal}`); } catch (e) { }
                        try { form.getTextField('Name').setText(nameVal); } catch (e) { }
                        try { form.getTextField('SSN').setText(ssnVal); } catch (e) { }
                        try { form.getTextField('Last update').setText(lastUpdateVal); } catch (e) { }
                        try { form.getTextField('CM1').setText(cm1Val); } catch (e) { }
                        try { form.getTextField('DOB').setText(dobVal); } catch (e) { }
                        try { form.getTextField('Ext').setText(extVal); } catch (e) { }
                    }
                }
            };

            // ── Open iFax buttons ──────────────────────────────────────────────
            container.querySelectorAll('.sn-open-ifax').forEach(btn => {
                btn.onclick = async () => {
                    const faxNum = getVal('sn-field-fax');

                    // Guard: no recipient number
                    if (!faxNum || !faxNum.replace(/\D/g, '')) {
                        app.Core.Utils.showNotification(
                            '⚠️ No recipient fax number. Fill in a fax number first.',
                            { type: 'error', duration: 4000 }
                        );
                        return;
                    }

                    let faxType = 'unknown';
                    let sentTo = 'SSA/DDS';
                    if (container.querySelector('#sn-l25-phone-chk')) {
                        faxType = 'letter25';
                        const l25Toggle = container.querySelector('#sn-l25-fax-toggle');
                        sentTo = l25Toggle ? l25Toggle.dataset.target : 'FO';
                    } else if (container.querySelector('#sn-1696-file-input')) {
                        faxType = '1696'; sentTo = 'FO';
                    } else if (container.querySelector('.sn-medical-notes')) {
                        faxType = 'medical'; sentTo = 'DDS';
                    } else if (container.querySelector('.sn-field-dds')) {
                        faxType = 'statusdds'; sentTo = 'DDS';
                    } else {
                        faxType = 'statusfo'; sentTo = 'FO';
                    }

                    const rawName = data.name || 'Unknown';
                    const clientName = rawName;

                    // ── Determine fax type metadata ──
                    const faxLabels = {
                        letter25: 'Letter 25',
                        '1696': '1696 Fee Agreement',
                        medical: 'Medical Update',
                        statusdds: 'Status to DDS',
                        statusfo: 'Status to FO'
                    };
                    const faxLabelName = faxLabels[faxType] || 'Fax';

                    // ── Store metadata FIRST (before window.open) ──
                    GM_setValue('sn_temp_fax_number', faxNum);
                    GM_setValue('sn_temp_fax_client_name', clientName);
                    GM_setValue('sn_temp_fax_label', faxLabelName);
                    GM_setValue('sn_temp_fax_target', sentTo);
                    GM_setValue('sn_temp_fax_client_id', clientId);
                    GM_setValue('sn_temp_fax_type', faxType);
                    GM_setValue('sn_temp_fax_log_activity', this._getLogActivityState());

                    // Clear any previous blob — will be replaced when PDF generation completes
                    GM_setValue('sn_temp_fax_blob', '');
                    GM_setValue('sn_temp_fax_filename', '');

                    // ── Open iFax window IMMEDIATELY (non-blocking) ──
                    window.open('https://ifax.pro/sent/create/', '_blank', 'width=1000,height=800,menubar=no,toolbar=no,location=no,status=no,scrollbars=yes');

                    // ── Push to pending receipt queue ──
                    const todayForFile = new Date().toLocaleDateString('en-US', {
                        month: 'short', day: '2-digit', year: 'numeric'
                    });
                    const dateStr = todayForFile.replace(/\//g, '-');
                    const fileNameBase = this._buildFaxFileName(clientName, faxType, sentTo, dateStr, false).replace(/\.pdf$/i, '');

                    // ── Compute draft LA subject + content ──
                    const draftLA = this._buildDraftLA(faxType, sentTo, container);

                    // ── Push to unified fax log (status: awaiting_report) ──
                    const entryId = Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
                    const faxLog = GM_getValue('sn_fax_log', []);
                    faxLog.push({
                        id: entryId,
                        clientId: clientId,
                        clientName: clientName,
                        faxLabel: faxLabelName,
                        faxType: faxType,
                        sentTo: sentTo,
                        faxNumber: faxNum.replace(/\D/g, ''),
                        receiverFax: faxNum.replace(/\D/g, ''),
                        senderFax: '',
                        status: 'awaiting_report',
                        subject: draftLA.subject,
                        content: draftLA.content,
                        receiptContent: '',
                        emailDate: '',
                        emailDateISO: '',
                        pdfBase64: '',
                        fileName: fileNameBase,
                        timestamp: Date.now(),
                        resolvedAt: null,
                        dateTime: new Date().toISOString()
                    });
                    if (faxLog.length > 500) faxLog.splice(0, faxLog.length - 500);
                    GM_setValue('sn_fax_log', faxLog);
                    GM_setValue('sn_fax_log_broadcast', Date.now());

                    // ── Generate PDF in background (non-blocking) ──
                    const config = pdfConfigs[faxType];
                    if (config) {
                        FaxPanel._generateFaxPdfBase64(
                            config.url, config.fillFn,
                            clientId, clientName, faxType, sentTo
                        ).then(result => {
                            // Set blob when ready — iFaxAutomation listens for this change
                            GM_setValue('sn_temp_fax_blob', result.pdfBase64);
                            GM_setValue('sn_temp_fax_filename', result.fileName);
                        }).catch(e => {
                            console.error("[FaxPanel] Background PDF gen error", e);
                        });
                    } else if (faxType === '1696') {
                        // 1696 uses a pre-processed (stamped) IP Contract PDF
                        const generatedPdfs = GM_getValue('sn_fax_generated_pdfs', []);
                        // Find the most recent 1696 PDF for this client
                        const matching = generatedPdfs.filter(
                            p => p.faxType === '1696' && p.clientId === clientId
                        );
                        const last1696 = matching[matching.length - 1];
                        if (last1696 && last1696.pdfBase64) {
                            GM_setValue('sn_temp_fax_blob', last1696.pdfBase64);
                            GM_setValue('sn_temp_fax_filename', last1696.fileName);
                        } else {
                            app.Core.Utils.showNotification(
                                '⚠️ No processed IP Contract found. Click "Process" to stamp the PDF first.',
                                { type: 'error', duration: 5000 }
                            );
                        }
                    }

                    // Show notification
                    app.Core.Utils.showNotification(
                        `⏳ Fax queued — ${faxLabelName} for ${clientName}`,
                        { type: 'info', duration: 5000 }
                    );
                };
            });

            // ── PDF generation buttons (shared logic via _generateFaxPdfBase64) ──
            const btnToFaxType = {
                '#sn-pdf-l25': 'letter25',
                '#sn-pdf-s2fo': 'statusfo',
                '#sn-pdf-s2dds': 'statusdds'
            };

            Object.entries(btnToFaxType).forEach(([btnId, faxType]) => {
                const btn = container.querySelector(btnId);
                const config = pdfConfigs[faxType];
                if (!btn || !config) return;

                btn.onclick = async () => {
                    const originalText = btn.innerText;
                    btn.innerText = "⏳ Processing...";
                    try {
                        // Determine destination from UI state (for Letter 25, check toggle)
                        let sentTo = FaxPanel._getDefaultSentTo(faxType);
                        if (faxType === 'letter25') {
                            const l25Toggle = container.querySelector('#sn-l25-fax-toggle');
                            sentTo = l25Toggle ? l25Toggle.dataset.target : 'FO';
                        }
                        const result = await FaxPanel._generateFaxPdfBase64(
                            config.url, config.fillFn,
                            clientId, data.name || '', faxType, sentTo
                        );

                        // Download PDF directly
                        await FaxPanel._downloadPdf(result.pdfBase64, result.fileName);
                        btn.innerText = "✅ Done";
                    } catch (e) {
                        console.error(e);
                        btn.innerText = "❌ Error";
                        alert(e.message);
                    }
                    setTimeout(() => btn.innerText = originalText, 2000);
                };
            });

            // ── 1696 IP Contract Processing (delegates to Stamp1696 module) ──────
            const fileInput1696 = container.querySelector('#sn-1696-file-input');
            const fileLabel1696 = container.querySelector('#sn-1696-file-label');
            const selectBtn1696 = container.querySelector('#sn-1696-select-btn');
            const processBtn1696 = container.querySelector('#sn-1696-process-btn');

            if (selectBtn1696 && fileInput1696) {
                selectBtn1696.onclick = () => fileInput1696.click();

                fileInput1696.onchange = () => {
                    const file = fileInput1696.files[0];
                    if (file) fileLabel1696.textContent = file.name;
                };

                processBtn1696.onclick = async () => {
                    const file = fileInput1696.files[0];
                    if (!file) { alert('Please select an IP Contract PDF first.'); return; }

                    const originalText = processBtn1696.innerText;
                    processBtn1696.innerText = '⏳ Processing...';
                    processBtn1696.disabled = true;

                    try {
                        const nameVal = getVal('sn-1696-name') || getVal('sn-field-name') || '';
                        const ssnVal  = getVal('sn-1696-ssn')  || getVal('sn-field-ssn')  || '';
                        const dobVal  = getVal('sn-1696-dob')  || getVal('sn-field-dob')  || '';
                        const addrVal = getVal('sn-1696-address') || '';
                        const phoneVal = getVal('sn-1696-phone') || '';

                        const result = await app.Tools.Stamp1696.process(file, {
                            name: nameVal,
                            ssn: ssnVal,
                            dob: dobVal,
                            address: addrVal,
                            phone: phoneVal
                        });

                        // Download the stamped PDF
                        const blob = new Blob([result.bytes], { type: 'application/pdf' });
                        const url  = URL.createObjectURL(blob);
                        const a    = document.createElement('a');
                        a.href     = url;
                        a.download = result.filename;
                        a.click();
                        URL.revokeObjectURL(url);

                        // Store generated PDF for Dashboard drag-and-drop
                        const reader = new FileReader();
                        reader.onload = () => {
                            const todayForFile = new Date().toLocaleDateString('en-US', {
                                month: 'short', day: '2-digit', year: 'numeric'
                            });
                            const dateStr = todayForFile.replace(/\//g, '-');
                            const pdfEntry = {
                                pdfBase64: reader.result,
                                fileName: FaxPanel._buildFaxFileName(data.name || '', '1696', 'FO', dateStr, false),
                                clientId: clientId,
                                clientName: data.name || '',
                                type: 'fax',
                                faxType: '1696',
                                timestamp: Date.now()
                            };
                            FaxPanel._pushGeneratedPdf(pdfEntry);
                        };
                        reader.readAsDataURL(blob);

                        processBtn1696.innerText = '✅ Done';
                    } catch (err) {
                        console.error('[1696 Process]', err);
                        alert('Error processing PDF: ' + err.message);
                        processBtn1696.innerText = '❌ Error';
                    } finally {
                        processBtn1696.disabled = false;
                        setTimeout(() => processBtn1696.innerText = originalText, 2500);
                    }
                };
            }
        },

        // ── Logging ──────────────────────────────────────────────────────────

        _getLogActivityState() {
            return GM_getValue('sn_fax_log_activity', true);
        },

        /**
         * Builds a draft Last Activity subject + content based on fax type.
         * Called when "Open iFax" is clicked — stores preliminary info that
         * will be merged with receipt confirmation later.
         * @param {string} faxType
         * @param {string} sentTo - "FO" or "DDS"
         * @param {HTMLElement} container - the active fax tab container
         * @returns {{subject: string, content: string}}
         */
        _buildDraftLA(faxType, sentTo, container) {
            let subject, content;

            switch (faxType) {
                case '1696':
                    subject = 'Submitted to SSA';
                    content = 'Faxed Fee Agreement 1696 to SSA';
                    break;
                case 'statusfo':
                    subject = 'Submitted to SSA';
                    content = 'Faxed Status Sheet to SSA';
                    break;
                case 'statusdds':
                    subject = 'Submitted to DDS';
                    content = 'Faxed Status Sheet to DDS';
                    break;
                case 'letter25': {
                    const l25Toggle = container.querySelector('#sn-l25-fax-toggle');
                    const l25Target = l25Toggle ? l25Toggle.dataset.target : 'FO';
                    subject = l25Target === 'DDS' ? 'Submitted to DDS' : 'Submitted to SSA';
                    const phoneChk = container.querySelector('#sn-l25-phone-chk');
                    const addrChk = container.querySelector('#sn-l25-addr-chk');
                    const hasPhone = phoneChk && phoneChk.checked;
                    const hasAddr = addrChk && addrChk.checked;
                    let details = '';
                    if (hasPhone && hasAddr) details = 'PN and Address';
                    else if (hasPhone) details = 'PN';
                    else if (hasAddr) details = 'Address';
                    else details = 'contact info';
                    content = `Faxed letter 25 updating CL's current ${details}`;
                    break;
                }
                case 'medical':
                    subject = 'Submitted to DDS';
                    content = 'Faxed Medical update to DDS';
                    break;
                default:
                    subject = `Submitted to ${sentTo}`;
                    content = `Faxed ${faxType} to ${sentTo}`;
            }

            return { subject, content };
        },

        /**
         * Best-effort: opens the Last Activity panel on the current SF page,
         * fills subject + comment, but does NOT save. Fails silently if
         * TaskAutomation is not available (e.g., wrong page context).
         * @param {string} subject
         * @param {string} content
         */
        async _tryOpenDraftLA(subject, content) {
            try {
                const TA = app.Automation && app.Automation.TaskAutomation;
                if (!TA) return;
                await TA.clickLastActivity();
                await TA.fillSubject(subject);
                await TA.fillComment(content);
                // Intentionally do NOT call clickSaveButton — leave panel open
            } catch (e) {
                // Silently ignore — LA panel opening is best-effort
                console.log("[FaxPanel] Draft LA panel skipped:", e.message);
            }
        },

        /**
         * Shared PDF generation — fetches template, fills fields, flattens, returns base64.
         * Does NOT download. Used by both "Generate PDF" buttons and "Open iFax".
         * @param {string} url - PDF template URL
         * @param {Function} fillFn - (form, today) => void
         * @param {string} clientId
         * @param {string} clientName
         * @param {string} faxType
         * @returns {Promise<{pdfBase64: string, fileName: string}>}
         */
        async _generateFaxPdfBase64(url, fillFn, clientId, clientName, faxType, sentTo) {
            const PDFLib = window.PDFLib;
            if (!PDFLib) throw new Error("PDFLib not found. Add 'pdf-lib.min.js' to manifest.");

            const formBytes = (app.Core.PdfManager && typeof app.Core.PdfManager.fetchPdfBytes === 'function')
                ? await app.Core.PdfManager.fetchPdfBytes(url)
                : await fetch(url).then(res => res.arrayBuffer());

            const pdfDoc = await PDFLib.PDFDocument.load(formBytes);
            const form = pdfDoc.getForm();
            const today = new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });

            fillFn(form, today);

            form.flatten();

            const pdfBase64 = await pdfDoc.saveAsBase64({ dataUri: true });
            const dateStr = today.replace(/\//g, '-');
            // Derive sentTo from faxType if not provided
            const dest = sentTo || this._getDefaultSentTo(faxType);
            const fileName = this._buildFaxFileName(clientName, faxType, dest, dateStr, false);

            // Store generated PDF for Dashboard drag-and-drop
            this._pushGeneratedPdf({
                pdfBase64,
                fileName,
                clientId,
                clientName: clientName || '',
                type: 'fax',
                faxType,
                timestamp: Date.now()
            });

            return { pdfBase64, fileName };
        },

        /**
         * Returns the default destination for a fax type when no toggle state is available.
         * @param {string} faxType
         * @returns {string}
         */
        _getDefaultSentTo(faxType) {
            const map = {
                letter25: 'FO',
                statusfo: 'FO',
                statusdds: 'DDS',
                '1696': 'FO',
                medical: 'DDS'
            };
            return map[faxType] || 'FO';
        },

        /**
         * Swaps "First Last" → "Last First" by splitting on the last space.
         * Single-word names pass through unchanged.
         * @param {string} name
         * @returns {string}
         */
        _formatClientName(name) {
            if (!name) return name || '';
            const m = name.trim().match(/^(.+)\s+(\S+)$/);
            return m ? `${m[2]} ${m[1]}` : name.trim();
        },

        /**
         * Builds a standardized fax PDF filename.
         * Format: "{Last First} - Faxed {DocType} to {Dest} - {Date}[ + iFax report].pdf"
         * @param {string} clientName
         * @param {string} faxType - Internal fax type key
         * @param {string} sentTo - "FO" or "DDS"
         * @param {string} dateStr - Formatted date string (e.g. "May-28-2026")
         * @param {boolean} [withReceipt=false] - Whether to append " + iFax report"
         * @returns {string}
         */
        _buildFaxFileName(clientName, faxType, sentTo, dateStr, withReceipt) {
            const docTypes = {
                letter25: 'Letter 25',
                statusfo: 'Status Sheet',
                statusdds: 'Status Sheet',
                '1696': '1696 Fee Agreement',
                medical: 'Medical Update'
            };
            const destinations = {
                FO: 'SSA',
                DDS: 'DDS'
            };
            const docType = docTypes[faxType] || 'Fax';
            const dest = destinations[sentTo] || sentTo || 'SSA/DDS';
            const formattedName = this._formatClientName(clientName);
            const receiptSuffix = withReceipt ? ' + iFax report' : '';

            // 1696 uses a special naming scheme: no "to {dest}", "Faxed" before date
            if (faxType === '1696') {
                return `${formattedName} - ${docType} - Faxed ${dateStr}${receiptSuffix}.pdf`;
            }

            return `${formattedName} - Faxed ${docType} to ${dest} - ${dateStr}${receiptSuffix}.pdf`;
        },

        /**
         * Stores a generated PDF entry in the shared array so the Dashboard's
         * drag-and-drop feature can serve the file to Salesforce upload areas.
         * Keeps the last 20 entries to limit GM storage usage.
         * @param {Object} pdfEntry - { pdfBase64, fileName, clientId, timestamp }
         */
        _pushGeneratedPdf(pdfEntry) {
            const pdfs = GM_getValue('sn_fax_generated_pdfs', []);
            pdfs.push(pdfEntry);
            // Keep last 50 — enough for back-to-back faxes, GM storage is unlimited locally
            if (pdfs.length > 50) pdfs.splice(0, pdfs.length - 50);
            GM_setValue('sn_fax_generated_pdfs', pdfs);
        },

        /**
         * Downloads the generated PDF file via the background service worker.
         * @param {string} pdfBase64 - Base64 data URI of the PDF
         * @param {string} fileName - Full path/name for the download file
         */
        async _downloadPdf(pdfBase64, fileName) {
            await chrome.runtime.sendMessage({
                action: 'DOWNLOAD_FILE',
                url: pdfBase64,
                filename: fileName
            });
        }
    };

    app.Tools.FaxPanel = FaxPanel;
})();
