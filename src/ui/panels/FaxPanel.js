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
            const harvested = app.Core.Scraper.harvestFields();

            const sidebarData = {
                name: savedData.name || harvested['matter name'] || "Client",
                ssn: savedData.ssn || harvested['ssn'] || "",
                dob: savedData.dob || harvested['dob'] || ""
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

                const addrParts = addrVal.split(',').map(s => s.trim()).filter(s => s);
                updateFields('sn-l25-addr1', addrParts[0] || '');
                updateFields('sn-l25-addr2', addrParts.length > 1 ? addrParts.slice(1).join(', ') : '');

                // Use separate phone keys: cellPhone, homePhone, altPhone
                const phones = this._getPhones(formData, harvested);
                this._updatePhoneFields(phones, updateFields);

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
                this._renderFaxForm(bodyContainer, currentId, sidebarData, harvested);
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

        /**
         * Reads phone numbers from separate formData keys (cellPhone, homePhone, altPhone)
         * and returns them for use in fax forms.
         * Falls back to harvested sidebar data for cell phone when formData is empty.
         * @param {Object} formData - The form data object (cn_form_data_)
         * @param {Object} [harvested] - Freshly harvested sidebar data from harvestFields()
         * @returns {{ cellPhone: string, homePhone: string, altPhone: string }}
         */
        _getPhones(formData, harvested) {
            const cell = (formData && formData.cellPhone) || (harvested && (harvested.cellPhone || harvested['cell phone'])) || '';
            const home = (formData && formData.homePhone) || '';
            const alt = (formData && formData.altPhone) || '';
            return { cellPhone: cell, homePhone: home, altPhone: alt };
        },

        /**
         * Updates L25 phone fields from separate phone keys.
         * Primary Number → cellPhone (or homePhone if no cell)
         * Alt/Home number → altPhone
         * @param {Object} phones - { cellPhone, homePhone, altPhone }
         * @param {Function} updateFields - Callback (className, value)
         */
        _updatePhoneFields(phones, updateFields) {
            const primary = phones.cellPhone || phones.homePhone || '';
            const alt = phones.altPhone || '';
            updateFields('sn-l25-primary-phone', primary);
            updateFields('sn-l25-alt-phone', alt);
        },

        /**
         * Determines the company ('TDA' or 'KD') from the harvested 'business entity' field.
         * If the business entity contains "Titan Disability Advocates", returns 'TDA'.
         * Otherwise returns 'KD'.
         * @param {Object} [harvested] - The field map from Scraper.harvestFields().
         * @returns {string} 'TDA' or 'KD'.
         */
        _detectCompany(harvested) {
            if (harvested && harvested['business entity']) {
                const be = harvested['business entity'].toLowerCase();
                if (be.includes('titan disability advocates')) {
                    return 'TDA';
                }
            }
            return 'KD';
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

        _renderFaxForm(container, clientId, data, harvested) {
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
            // Phone from separate keys: cellPhone > homePhone > altPhone
            const phones = this._getPhones(formData, harvested);
            const phone1696 = phones.cellPhone || phones.homePhone || phones.altPhone || '';
            const formattedFoFax = this._formatFax(foFax);
            const company = this._detectCompany(harvested);

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
                        <button id="sn-pdf-l25" class="sn-fax-action-btn" style="flex:1;">� Preview</button>
                        <button class="sn-fax-action-btn sn-open-ifax" style="flex:1;">Open iFax</button>
                    </div>
                ` },
                { title: "Status DDS", content: `${cf('DDS', ddsName, false, 'sn-field-dds')}${cf('Fax #', '', false, 'sn-field-fax sn-fax-dds')}${cf('Name', data.name, false, 'sn-field-name')}${cf('SSN', data.ssn, false, 'sn-field-ssn')}${cf('DOB', data.dob, false, 'sn-field-dob')}${cf('Last update', 'N/A', false, 'sn-last-update')}${cf('CM1', globalCM1, false, 'sn-global-cm1')}${cf('Ext.', globalExt, false, 'sn-global-ext')}<div style="display:flex; gap:5px; margin-top:5px;"><button id="sn-pdf-s2dds" class="sn-fax-action-btn" style="flex:1;">� Preview</button><button class="sn-fax-action-btn sn-open-ifax" style="flex:1;">Open iFax</button></div>` },
                { title: "Status FO", content: `${cf('Name', data.name, false, 'sn-field-name')}${cf('SSN', data.ssn, false, 'sn-field-ssn')}${cf('DOB', data.dob, false, 'sn-field-dob')}${cf('Fax #', formattedFoFax, false, 'sn-field-fax sn-fax-fo')}<div style="display:flex; gap:5px; margin-top:5px;"><button id="sn-pdf-s2fo" class="sn-fax-action-btn" style="flex:1;">� Preview</button><button class="sn-fax-action-btn sn-open-ifax" style="flex:1;">Open iFax</button></div>` },
                { title: "1696", content: `
                    <div id="sn-1696-company-notice" style="display:none;"></div>
                    ${cf('Name', data.name, false, 'sn-field-name sn-1696-name')}
                    ${cf('SSN', data.ssn, false, 'sn-field-ssn sn-1696-ssn')}
                    ${cf('DOB', data.dob, false, 'sn-field-dob sn-1696-dob')}
                    ${cf('Address', addr1696, false, 'sn-1696-address')}
                    ${cf('Phone', phone1696, false, 'sn-1696-phone')}
                    ${cf('Fax #', formattedFoFax, false, 'sn-field-fax sn-fax-fo')}
                    <div class="sn-1696-page-options" style="display:flex; gap:6px; align-items:center; font-size:0.9em; flex-wrap:wrap; margin:6px 0 4px 0; padding:4px 0; border-top:1px solid #ddd; border-bottom:1px solid #ddd;">
                        <label style="display:flex; align-items:center; gap:3px; opacity:0.4; cursor:not-allowed;" title="Coming soon">
                            <input type="checkbox" id="sn-1696-pg-cover" disabled> Cover
                        </label>
                        <label style="display:flex; align-items:center; gap:3px; cursor:pointer;">
                            <input type="checkbox" id="sn-1696-pg-fa" checked> FA+1696
                        </label>
                        <label style="display:flex; align-items:center; gap:3px; cursor:pointer;">
                            <input type="checkbox" id="sn-1696-pg-sup1"> SUP-1
                        </label>
                        <label style="display:flex; align-items:center; gap:3px; cursor:pointer;">
                            <input type="checkbox" id="sn-1696-pg-827"> 827
                        </label>
                        <label style="display:flex; align-items:center; gap:3px; opacity:0.8; cursor:not-allowed;" title="Always included">
                            <input type="checkbox" id="sn-1696-pg-8" checked disabled> CPAS
                        </label>
                        <button id="sn-1696-save-default" style="padding:2px 8px; font-size:0.85em; cursor:pointer; border:1px solid #999; border-radius:3px; background:#e0e0e0;">💾 Save Default</button>
                    </div>
                    <input type="file" id="sn-1696-file-input" accept=".pdf" style="display:none;">
                    <div id="sn-1696-file-label" style="font-size:0.8em; color:#888; margin:4px 0 6px 0; min-height:16px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">No file selected</div>
                    <div class="sn-1696-actions" style="display:flex; gap:5px; margin-top:5px;">
                        <button id="sn-1696-select-btn" class="sn-fax-action-btn" style="flex:1;">📂 Select IP Contract</button>
                        <button id="sn-1696-process-btn" class="sn-fax-action-btn" style="flex:1;">👁 Preview</button>
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

                    // ── Auto-refresh: re-read fresh data on each tab click ──
                    const freshFormData = GM_getValue('cn_form_data_' + clientId, {});
                    const freshHarvested = (app.Core.Scraper && typeof app.Core.Scraper.harvestFields === 'function')
                        ? app.Core.Scraper.harvestFields() : null;
                    const freshDDSName = freshFormData.DDS_Selection || '';
                    const freshGlobalCM1 = GM_getValue('sn_global_cm1', '');
                    const freshGlobalExt = GM_getValue('sn_global_ext', '');

                    // Build fresh content with current data
                    const freshContent = sec.content;
                    contentContainer.innerHTML = `<div style="padding:8px; border:1px solid #ccc; background:#f9f9f9;">${freshContent}</div>`;
                    this._attachFaxEvents(contentContainer, clientId, data, freshFormData, freshDDSName, freshGlobalCM1, freshGlobalExt);

                    // Refresh DDS fax number if applicable
                    if (sec.title === "Status DDS" && freshDDSName && app.Core.SSADataManager) {
                        const faxInput = contentContainer.querySelector('.sn-fax-dds');
                        if (faxInput && !faxInput.value) {
                            app.Core.SSADataManager.search('DDS', freshDDSName, (results) => {
                                if (results && results.length > 0) {
                                    const ddsFax = results[0].fax || '';
                                    if (ddsFax) faxInput.value = FaxPanel._formatFax(ddsFax);
                                }
                            });
                        }
                    }

                    // ── Update phone/fax fields from fresh data ──
                    // L25: Update phone fields from separate keys
                    if (sec.title === "Letter 25") {
                        const phones = FaxPanel._getPhones(freshFormData, freshHarvested);
                        FaxPanel._updatePhoneFields(phones, (cls, val) => {
                            contentContainer.querySelectorAll('.' + cls).forEach(el => el.value = val || '');
                        });
                        // Update fax # from fresh formData
                        let foFax = '';
                        if (freshFormData.FO_Text) {
                            const match = freshFormData.FO_Text.match(/Fax:\s*([\d-]+)/i);
                            if (match) foFax = match[1].replace(/\D/g, '');
                        }
                        const faxInput = contentContainer.querySelector('.sn-fax-fo');
                        if (faxInput) faxInput.value = FaxPanel._formatFax(foFax);
                    }

                    // Status DDS/FO/1696/Medical: update fax numbers and DDS from fresh data
                    if (sec.title === "Status DDS" || sec.title === "Status FO" || sec.title === "1696") {
                        let foFax = '';
                        if (freshFormData.FO_Text) {
                            const match = freshFormData.FO_Text.match(/Fax:\s*([\d-]+)/i);
                            if (match) foFax = match[1].replace(/\D/g, '');
                        }
                        const faxInput = contentContainer.querySelector('.sn-fax-fo');
                        if (faxInput) faxInput.value = FaxPanel._formatFax(foFax);

                        // Update DDS fax
                        if (sec.title === "Status DDS" && freshDDSName && app.Core.SSADataManager) {
                            const ddsFaxInput = contentContainer.querySelector('.sn-fax-dds');
                            if (ddsFaxInput) {
                                app.Core.SSADataManager.search('DDS', freshDDSName, (results) => {
                                    if (results && results.length > 0) {
                                        const ddsFax = results[0].fax || '';
                                        if (ddsFax) ddsFaxInput.value = FaxPanel._formatFax(ddsFax);
                                    }
                                });
                            }
                        }

                        // Update DDS name
                        const ddsInput = contentContainer.querySelector('.sn-field-dds');
                        if (ddsInput) ddsInput.value = freshDDSName;

                        // Update CM1 and Ext
                        const cm1Input = contentContainer.querySelector('.sn-global-cm1');
                        if (cm1Input) cm1Input.value = freshGlobalCM1;
                        const extInput = contentContainer.querySelector('.sn-global-ext');
                        if (extInput) extInput.value = freshGlobalExt;
                    }

                    // 1696: Update phone from separate keys + company-aware styling
                    if (sec.title === "1696") {
                        const phones = FaxPanel._getPhones(freshFormData, freshHarvested);
                        const phoneField = contentContainer.querySelector('.sn-1696-phone');
                        if (phoneField) {
                            phoneField.value = phones.cellPhone || phones.homePhone || phones.altPhone || '';
                        }

                        // ── Company-aware background and TDA restriction ──
                        const panelCompany = FaxPanel._detectCompany(freshHarvested);
                        const innerDiv = contentContainer.querySelector('div[style*="padding:8px"]');
                        if (innerDiv) {
                            if (panelCompany === 'TDA') {
                                innerDiv.style.background = '#c8e6c9'; // light green for TDA
                                innerDiv.style.borderLeft = '4px solid #388e3c';
                            } else {
                                innerDiv.style.background = '#bbdefb'; // light blue for KD
                                innerDiv.style.borderLeft = '4px solid #1976d2';
                            }
                        }

                        // If TDA — show notice and disable 1696 processing/faxing
                        const notice = contentContainer.querySelector('#sn-1696-company-notice');
                        if (panelCompany === 'TDA') {
                            if (notice) {
                                notice.style.cssText = 'display:block; background:#fff3e0; border:1px solid #ff9800; border-radius:4px; padding:8px; margin-bottom:8px; font-size:0.85em; color:#e65100;';
                                notice.innerHTML = '⚠️ <b>TDA record:</b> 1696 processing and faxing not yet available for TDA.';
                            }
                            // Disable page option checkboxes
                            contentContainer.querySelectorAll('.sn-1696-page-options input[type="checkbox"]').forEach(cb => {
                                cb.disabled = true;
                            });
                            // Disable file input
                            const fileInput = contentContainer.querySelector('#sn-1696-file-input');
                            if (fileInput) fileInput.disabled = true;
                            // Disable action buttons and remove event handlers
                            const selectBtn = contentContainer.querySelector('#sn-1696-select-btn');
                            const processBtn = contentContainer.querySelector('#sn-1696-process-btn');
                            const openIfaxBtns = contentContainer.querySelectorAll('.sn-1696-actions .sn-open-ifax');
                            [selectBtn, processBtn].forEach(btn => {
                                if (btn) {
                                    btn.style.opacity = '0.5';
                                    btn.style.cursor = 'not-allowed';
                                    btn.title = 'Not available for TDA records';
                                    btn.disabled = true;
                                }
                            });
                            openIfaxBtns.forEach(btn => {
                                if (btn) {
                                    btn.style.opacity = '0.5';
                                    btn.style.cursor = 'not-allowed';
                                    btn.title = 'Not available for TDA records';
                                    btn.disabled = true;
                                }
                            });
                            // Hide the Save Default button
                            const saveDef = contentContainer.querySelector('#sn-1696-save-default');
                            if (saveDef) saveDef.style.display = 'none';
                        } else {
                            if (notice) notice.style.display = 'none';
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
                    // Re-harvest live data to get fresh phone numbers
                    const liveHarvest = app.Core.Scraper ? app.Core.Scraper.harvestFields() : null;
                    const phones = FaxPanel._getPhones(formData, liveHarvest);
                    FaxPanel._updatePhoneFields(phones, (cls, val) => setVal(cls, val));
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
                    url: app.Core.PdfManager.getPdfUrl('L25.pdf'),
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
                    url: app.Core.PdfManager.getPdfUrl('S2FO.pdf'),
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
                    url: app.Core.PdfManager.getPdfUrl('S2DDS.pdf'),
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

                    // Store Letter 25 phone/address inclusion details for LA content
                    if (faxType === 'letter25') {
                        const phoneChk = container.querySelector('#sn-l25-phone-chk');
                        const addrChk = container.querySelector('#sn-l25-addr-chk');
                        const hasPhone = phoneChk && phoneChk.checked;
                        const hasAddr = addrChk && addrChk.checked;
                        let details = '';
                        if (hasPhone && hasAddr) details = 'PN and Address';
                        else if (hasPhone) details = 'PN';
                        else if (hasAddr) details = 'Address';
                        GM_setValue('sn_temp_fax_l25_details', details);
                    } else {
                        GM_setValue('sn_temp_fax_l25_details', '');
                    }

                    // Clear any previous blob — will be replaced when PDF generation completes
                    GM_setValue('sn_temp_fax_blob', '');
                    GM_setValue('sn_temp_fax_filename', '');

                    // ── Open iFax window IMMEDIATELY (non-blocking) ──
                    window.open('https://ifax.pro/sent/create/', '_blank', 'width=1000,height=800,menubar=no,toolbar=no,location=no,status=no,scrollbars=yes');

                    // ── Generate PDF in background (non-blocking) ──
                    // NOTE: Fax log entry is created by iFaxAutomation._logFaxOnSubmit()
                    // when the fax is actually submitted — NOT at "Open iFax" time.
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

                        // Preview PDF (now has <all_urls> permission)
                        await FaxPanel._previewPdf(result.pdfBase64, result.fileName);
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

            // ── 1696 Page selection checkboxes ──────────────────────────────
            const pgFa    = container.querySelector('#sn-1696-pg-fa');
            const pgSup1  = container.querySelector('#sn-1696-pg-sup1');
            const pg827   = container.querySelector('#sn-1696-pg-827');
            const saveDef = container.querySelector('#sn-1696-save-default');

            // Load saved defaults and apply to checkboxes
            const pageDefaults = FaxPanel._load1696PageDefaults();
            if (pgFa) pgFa.checked = pageDefaults.fa;
            if (pgSup1) pgSup1.checked = pageDefaults.sup1;
            if (pg827) pg827.checked = pageDefaults.p827;

            // Build includePages array from checkbox states
            const getIncludePages = () => {
                const pages = [];
                // FA + 1696 (Pages 1-5)
                if (pgFa && pgFa.checked) pages.push(1, 2, 3, 4, 5);
                // SUP-1 (Page 6)
                if (pgSup1 && pgSup1.checked) pages.push(6);
                // 827 (Page 7)
                if (pg827 && pg827.checked) pages.push(7);
                // Page 8 is ALWAYS included
                pages.push(8);
                return pages;
            };

            // Save as default button
            if (saveDef) {
                saveDef.onclick = () => {
                    FaxPanel._save1696PageDefaults({
                        fa: pgFa ? pgFa.checked : true,
                        sup1: pgSup1 ? pgSup1.checked : false,
                        p827: pg827 ? pg827.checked : false
                    });
                    app.Core.Utils.showNotification('✅ 1696 page defaults saved', { type: 'info', duration: 2000 });
                };
            }

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

                        const includePages = getIncludePages();

                        const result = await app.Tools.Stamp1696.process(file, {
                            name: nameVal,
                            ssn: ssnVal,
                            dob: dobVal,
                            address: addrVal,
                            phone: phoneVal
                        }, { includePages });

                        // Preview the stamped PDF instead of downloading
                        const uint8 = new Uint8Array(result.bytes);
                        let binary = '';
                        for (let i = 0; i < uint8.length; i++) {
                            binary += String.fromCharCode(uint8[i]);
                        }
                        const pdfBase64 = 'data:application/pdf;base64,' + btoa(binary);
                        await FaxPanel._previewPdf(pdfBase64, result.filename);

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
                        reader.readAsDataURL(new Blob([result.bytes], { type: 'application/pdf' }));

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
         *
         * ── LA SUBJECT/CONTENT CONVENTION (DO NOT CHANGE) ──────────────
         * Subject: "Submitted to {destination}"     e.g. "Submitted to SSA"
         * Content: "Faxed {doc type} to {destination}"  then append receipt text
         *
         * This convention is used throughout the fax flow:
         *   - _buildDraftLA()          — template source (this function)
         *   - iFaxReceiptObserver.js   — pending LA construction
         *   - Dashboard.js             — auto + manual LA creation
         *
         * Destination mappings:
         *   FO/SSA → "Submitted to SSA" / "Faxed {doc} to SSA"
         *   DDS    → "Submitted to DDS" / "Faxed {doc} to DDS"
         *
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
                    let l25Details = '';
                    if (hasPhone && hasAddr) l25Details = 'PN and Address';
                    else if (hasPhone) l25Details = 'PN';
                    else if (hasAddr) l25Details = 'Address';
                    content = l25Details
                        ? `Faxed letter 25 updating CL's current ${l25Details} to ${subject === 'Submitted to DDS' ? 'DDS' : 'SSA'}`
                        : `Faxed letter 25 to ${subject === 'Submitted to DDS' ? 'DDS' : 'SSA'}`;
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
         *
         * ── LA SUBJECT/CONTENT CONVENTION (DO NOT CHANGE) ──────────────
         * Subject: "Submitted to {destination}"     e.g. "Submitted to SSA"
         * Content: "Faxed {doc type} to {destination}"  then append receipt text
         * See _buildDraftLA() for the canonical template.
         * ─────────────────────────────────────────────────────────────────
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

        // ── 1696 Page Selection Defaults ───────────────────────────────────

        /** Storage key for 1696 page selection defaults. */
        _1696_PAGE_DEFAULTS_KEY: 'sn_1696_page_defaults',

        /** Default page selections: FA+1696 ON, SUP-1 OFF, 827 OFF, Pg8 always on. */
        _1696_DEFAULT_PAGES: { fa: true, sup1: false, p827: false },

        /**
         * Loads saved 1696 page selection defaults (global, not per-client).
         * @returns {{ fa: boolean, sup1: boolean, p827: boolean }}
         */
        _load1696PageDefaults() {
            return GM_getValue(this._1696_PAGE_DEFAULTS_KEY, { ...this._1696_DEFAULT_PAGES });
        },

        /**
         * Saves 1696 page selection defaults globally.
         * @param {{ fa?: boolean, sup1?: boolean, p827?: boolean }} prefs
         */
        _save1696PageDefaults(prefs) {
            const current = this._load1696PageDefaults();
            GM_setValue(this._1696_PAGE_DEFAULTS_KEY, { ...current, ...prefs });
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
         * Formats a client name for filenames as "LastName FirstName".
         * Handles suffixes (Jr., Sr., III, etc.) so they are excluded.
         * First name uses only the first block (no middle name).
         * @param {string} name - e.g. "Nichoel Ann Wilkerson III"
         * @returns {string} e.g. "Wilkerson Nichoel"
         */
        _formatClientName(name) {
            if (!name) return name || '';
            const parts = name.trim().split(/\s+/);
            if (parts.length === 1) return name.trim();

            const suffixes = ['sr', 'jr', 'sr.', 'jr.', 'i', 'ii', 'iii', 'iv', 'v'];
            const lastWord = parts[parts.length - 1].toLowerCase();
            let lastName;

            if (suffixes.includes(lastWord) && parts.length > 2) {
                lastName = parts[parts.length - 2];
            } else {
                lastName = parts[parts.length - 1];
            }

            return `${lastName} ${parts[0]}`;
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
            // Keep last 20 — PDFs are auto-saved to Downloads folder via iFaxReceiptObserver
            if (pdfs.length > 20) pdfs.splice(0, pdfs.length - 20);
            GM_setValue('sn_fax_generated_pdfs', pdfs);
        },

        /**
         * Converts a base64 data URI to a Blob URL for embedding.
         * @param {string} dataUri - e.g. "data:application/pdf;base64,JVBERi0..."
         * @returns {string} A blob: URL
         */
        _dataUriToBlobUrl(dataUri) {
            const parts = dataUri.split(',');
            const mime = parts[0].match(/:(.*?);/)[1];
            const bytes = atob(parts[1]);
            const arr = new Uint8Array(bytes.length);
            for (let i = 0; i < bytes.length; i++) {
                arr[i] = bytes.charCodeAt(i);
            }
            return URL.createObjectURL(new Blob([arr], { type: mime }));
        },

        /**
         * Shows the generated PDF in a floating popup panel (instead of a new tab).
         * Requires <all_urls> host permission (now granted).
         * @param {string} pdfBase64 - Base64 data URI of the PDF
         * @param {string} fileName - Display name for the PDF
         */
        async _previewPdf(pdfBase64, fileName) {
            const id = 'sn-pdf-preview';
            let panel = document.getElementById(id);

            if (panel) {
                // Update existing panel with new PDF
                panel.dataset.fileName = fileName;
                const iframe = panel.querySelector('iframe');
                if (iframe && iframe.src) URL.revokeObjectURL(iframe.src);
                if (iframe) iframe.src = this._dataUriToBlobUrl(pdfBase64);
                const titleEl = panel.querySelector('.sn-pdf-preview-title');
                if (titleEl) titleEl.textContent = '📄 ' + (fileName || 'fax.pdf').split('/').pop();
                app.Core.Windows.toggle(id);
                return;
            }

            const blobUrl = this._dataUriToBlobUrl(pdfBase64);
            const displayName = (fileName || 'fax.pdf').split('/').pop();

            panel = document.createElement('div');
            panel.id = id;
            panel.className = 'sn-window';
            panel.style.cssText = 'width:750px; height:600px; top:60px; left:calc(50% - 375px); background:var(--sn-bg-lighter); border:1px solid var(--sn-border); flex-direction:column; display:none;';
            panel.dataset.fileName = fileName;

            panel.innerHTML = `
                <div class="sn-header" style="background:var(--sn-bg-light); border-bottom:1px solid var(--sn-border); display:flex; align-items:center; justify-content:space-between; padding:4px 8px; flex-shrink:0;">
                    <div style="display:flex; align-items:center; gap:6px; overflow:hidden;">
                        <button id="sn-pdf-preview-min" style="cursor:pointer; background:none; border:none; font-weight:bold;">_</button>
                        <span class="sn-pdf-preview-title" style="font-weight:bold; font-size:13px; color:var(--sn-primary-dark); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">📄 ${displayName}</span>
                    </div>
                    <div style="display:flex; align-items:center; gap:4px; flex-shrink:0;">
                        <a id="sn-pdf-preview-dl" class="sn-fax-action-btn" style="padding:2px 10px; font-size:11px; text-decoration:none; color:inherit;" href="${blobUrl}" download="${displayName}">⬇ Download</a>
                        <button id="sn-pdf-preview-close" style="background:none; border:none; font-weight:bold; cursor:pointer; font-size:14px;">X</button>
                    </div>
                </div>
                <div style="flex:1; overflow:hidden; background:#525659;">
                    <iframe src="${blobUrl}" style="width:100%; height:100%; border:none;"></iframe>
                </div>
                <div class="sn-resizer rs-n"></div><div class="sn-resizer rs-s"></div>
                <div class="sn-resizer rs-e"></div><div class="sn-resizer rs-w"></div>
                <div class="sn-resizer rs-ne"></div><div class="sn-resizer rs-nw"></div>
                <div class="sn-resizer rs-se"></div><div class="sn-resizer rs-sw"></div>
            `;

            document.body.appendChild(panel);

            const header = panel.querySelector('.sn-header');
            const minBtn = panel.querySelector('#sn-pdf-preview-min');
            app.Core.Windows.setup(panel, minBtn, header, 'PDF_PREVIEW');

            panel.querySelector('#sn-pdf-preview-close').onclick = () => {
                panel.style.display = 'none';
                app.Core.Windows.updateTabState(panel.id);
                // Revoke blob URL after a short delay to let the iframe unload
                setTimeout(() => URL.revokeObjectURL(blobUrl), 3000);
            };

            // Show panel — DON'T call toggle() here, toggle would hide it
            // since it was just created (display was 'none' initially).
            panel.style.display = 'flex';
            app.Core.Windows.bringToFront(panel);
            app.Core.Windows.updateTabState(panel.id);
        }
    };

    app.Tools.FaxPanel = FaxPanel;
})();
