(function () {
    const app = window.CM_App = window.CM_App || {};
    app.Features = app.Features || {};

    /**
     * Manages the Medical Providers popout window: table editing, parsing,
     * font controls, expand/restore, and persistence of provider data.
     * Extracted from ClientNote.js for better modularity.
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

            // CHANGED: Default position logic (1080x450, center bottom)
            let savedSize = GM_getValue('def_pos_MED', { width: '1080px', height: '450px' });
            // Migration: Upgrade old defaults to new ones
            if (savedSize.height === '300px') savedSize.height = '450px';
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
                mw.style.bottom = '40px'; // Docked above taskbar
            }
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
                        <div style="flex-grow:1; padding:10px; overflow-y:auto; display:flex; flex-direction:column;">
                            <div style="flex-grow:1; overflow:auto; margin-bottom:10px; border:1px solid #eee;">
                                <table id="sn-med-table" style="font-size:inherit;"><thead><tr style="background:#eee; text-align:left;"><th style="border:1px solid #ccc; padding:4px;">Dr/Facilities</th><th style="border:1px solid #ccc; padding:4px;">Address</th><th style="border:1px solid #ccc; padding:4px;">Phone</th><th style="border:1px solid #ccc; padding:4px;">First Visit</th><th style="border:1px solid #ccc; padding:4px;">Last Visit</th><th style="border:1px solid #ccc; padding:4px;">Next Appt</th></tr></thead><tbody></tbody></table>
                            </div>
                            <div style="display:flex; gap:10px; border-top:1px solid #eee; padding-top:10px; flex-shrink:0;">
                                <div style="flex:1; display:flex; flex-direction:column;">
                                    <label style="font-weight:bold; font-size:11px; color:#555; margin-bottom:2px;">Medical Conditions</label>
                                    <textarea class="sn-med-textarea" data-field="Condition" style="width:100%; flex-grow:1; min-height:80px; resize:vertical; border:1px solid #ccc; padding:4px; background:#fff; font-family:inherit; font-size:inherit;">${conditionText}</textarea>
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
                </div>
                <div class="sn-resizer rs-n"></div><div class="sn-resizer rs-s"></div><div class="sn-resizer rs-e"></div><div class="sn-resizer rs-w"></div><div class="sn-resizer rs-ne"></div><div class="sn-resizer rs-nw"></div><div class="sn-resizer rs-se"></div><div class="sn-resizer rs-sw"></div>
            `;
            document.body.appendChild(mw);
            app.Core.Windows.setup(mw, mw.querySelector('#sn-med-min-btn'), mw.querySelector('.sn-header'), 'MED');

            app.Core.Windows.bringToFront(mw);

            const medPanelBtn = mw.querySelector('#sn-medication-panel-trigger');
            if (medPanelBtn) {
                medPanelBtn.onclick = () => {
                    // This module is loaded from a separate file. Check if it exists.
                    if (app.Tools && app.Tools.MedicationPanel) {
                        app.Tools.MedicationPanel.create();
                    }
                };
            }

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
                    mw.style.top = ''; // Allow bottom anchoring to take effect
                    mw.style.bottom = '40px';
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
                const field = inp.getAttribute('data-field');
                if (field === 'Medical Provider') {
                    inp.ondblclick = () => { inp.removeAttribute('readonly'); inp.style.background = '#fff'; inp.style.border = '1px solid var(--sn-border)'; inp.focus(); };
                    inp.onblur = () => { inp.setAttribute('readonly', true); inp.style.background = '#f9f9f9'; inp.style.border = '1px solid #ccc'; };
                }
                inp.oninput = () => {
                    const value = inp.value;

                    // Update internal state for immediate UI feedback if needed
                    if (field === 'Medical Provider') this.medProvider = value;
                    if (field === 'Assistive Devices') this.assistiveDevice = value;
                    if (field === 'Condition') this.condition = value;

                    // Directly save the change to persistent storage
                    app.Features.ClientNote.updateAndSaveData(clientId, { [field]: value });
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
            const hasMed = formData['Medical Provider'] || formData['Assistive Devices'] || formData['Condition'];
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
         * @returns {Array<Object>} An array of parsed provider data objects.
         */
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
                    const lines = block.split('\n').map(l => l.trim()).filter(l => l);
                    if (lines.length > 0) {
                        let candidate = lines[0];
                        candidate = candidate.replace(/^[\d]+[.)]\s*/, ''); // Remove numbering

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

                // Capture address allowing for multiple lines (stop at next keyword or end of block)
                let addressMatch = block.match(/^Address:\s*([\s\S]+?)(?=\n\s*(?:Phone|Telephone|number|1st|First|FV|Last|Next|Appt)|$)/im);
                let address = "";
                if (addressMatch) {
                    address = addressMatch[1].replace(/\r?\n/g, ', ').trim().replace(/,\s*,/g, ', ').replace(/,\s*$/, '');
                }

                // Address Fallback
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

    app.Features.MedProvider = MedProvider;
})();
