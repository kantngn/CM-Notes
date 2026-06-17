(function () {
    const app = window.CM_App = window.CM_App || {};
    app.Tools = app.Tools || {};

    let searchCache = {}; // In-memory cache for search results

    /**
     * Manages the Medication tracking UI, allowing users to search the NIH RxTerms API
     * and organize a client's medications into prescriptions with Prescribed by, Date,
     * and editable medication names + dosage/frequency fields.
     * @namespace app.Tools.MedicationPanel
     */
    const MedicationPanel = {

        /**
         * Initializes and displays the Medication Manager window.
         * Sets up the search interface, category rendering, and drag-and-drop listeners.
         */
        create() {
            const id = 'sn-meds-panel';
            if (document.getElementById(id)) { app.Core.Windows.toggle(id); return; }

            let clientId = app.AppObserver.getClientId();
            if (!clientId) {
                const cn = document.getElementById('sn-client-note');
                if (cn && cn.dataset.clientId) {
                    clientId = cn.dataset.clientId;
                } else {
                    app.Core.Utils.showNotification("No client loaded.", { type: 'error' });
                    return;
                }
            }

            // Default Position
            const defPos = GM_getValue('def_pos_MEDS', { width: '750px', height: '500px', top: '100px', left: '100px' });

            const w = document.createElement('div');
            w.id = id;
            w.className = 'sn-window';
            Object.assign(w.style, {
                width: defPos.width, height: defPos.height, top: defPos.top, left: defPos.left,
                display: 'flex', flexDirection: 'column', background: '#fff', zIndex: '10006'
            });

            w.innerHTML = `
                <div class="sn-header" style="background:var(--sn-bg-light); padding:5px; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #ccc;">
                    <span style="font-weight:bold;">Medication Manager</span>
                    <button id="sn-meds-min" style="cursor:pointer; background:none; border:none; font-weight:bold;">_</button>
                </div>
                <div style="display:flex; flex-grow:1; overflow:hidden;">
                    <!-- Middle Panel: Drug List -->
                    <div style="width:35%; display:flex; flex-direction:column; border-right:1px solid #ccc; padding:5px;">
                        <div style="display:flex; gap:4px; margin-bottom:5px;">
                            <input type="text" id="sn-meds-search" placeholder="Search Drugs..." style="flex:1; padding:4px; border:1px solid #ccc;">
                            <button id="sn-meds-google-btn" title="Search drug name on Google" style="cursor:pointer; padding:4px 6px; white-space:nowrap; border:1px solid #ccc; background:#f0f0f0; font-size:11px;">🔍 Google</button>
                        </div>
                        <div id="sn-meds-list" style="flex-grow:1; overflow-y:auto; border:1px solid #eee;"></div>
                    </div>

                    <!-- Right Panel: Selected Meds -->
                    <div style="flex-grow:1; display:flex; flex-direction:column; background:#fff;">
                        <div style="font-weight:bold; margin-bottom:5px; color:#555;">Patient Medications</div>
                        <div id="sn-meds-selected" style="flex-grow:1; overflow-y:auto; padding:5px;"></div>
                    </div>
                </div>
                <div style="border-top: 1px solid #ccc; padding: 5px; background: #f9f9f9; display:flex; justify-content:space-between;">
                    <div>
                        <button id="sn-meds-copy-btn" style="padding: 4px 8px; cursor:pointer;">📋 Copy Text</button>
                        <button id="sn-meds-parse-btn" style="padding: 4px 8px; cursor:pointer;">📋 Parse Text</button>
                    </div>
                    <button id="sn-meds-add-rx" style="padding: 4px 8px;">+ Add Prescription</button>
                </div>
                <!-- Resizers -->
                <div class="sn-resizer rs-n"></div><div class="sn-resizer rs-s"></div>
                <div class="sn-resizer rs-e"></div><div class="sn-resizer rs-w"></div>
                <div class="sn-resizer rs-ne"></div><div class="sn-resizer rs-nw"></div>
                <div class="sn-resizer rs-se"></div><div class="sn-resizer rs-sw"></div>
            `;

            document.body.appendChild(w);
            // Inject drag-drop style
            if (!document.getElementById('sn-meds-drag-style')) {
                const style = document.createElement('style');
                style.id = 'sn-meds-drag-style';
                style.textContent = `.sn-med-drag-over{background:#e3f2fd!important;border-left:3px solid #4a90d9!important}`;
                document.head.appendChild(style);
            }
            app.Core.Windows.setup(w, w.querySelector('#sn-meds-min'), w.querySelector('.sn-header'), 'MEDS');

            w.querySelector('#sn-meds-add-rx').onclick = () => this.addPrescription(w, clientId);
            w.querySelector('#sn-meds-parse-btn').onclick = () => this.showParseDialog(w, clientId);
            w.querySelector('#sn-meds-copy-btn').onclick = () => this.copyPrescriptionsAsText(clientId);

            this.initLogic(w, clientId);
        },

        initLogic(w, clientId) {
            // 2. Middle Panel Search & List
            const searchInput = w.querySelector('#sn-meds-search');
            const listContainer = w.querySelector('#sn-meds-list');
            let searchTimeout;

            const renderList = (drugNames) => {
                listContainer.innerHTML = '';
                if (!drugNames || drugNames.length === 0) {
                    listContainer.innerHTML = '<div style="padding:5px; color:#888; font-style:italic;">No results.</div>';
                    return;
                }
                drugNames.forEach(name => {
                    const item = document.createElement('div');
                    item.innerText = name;
                    item.style.cssText = 'padding:4px; cursor:pointer; border-bottom:1px solid #f0f0f0; font-size:12px;';
                    item.onmouseover = () => item.style.background = '#e3f2fd';
                    item.onmouseout = () => item.style.background = 'transparent';

                    // Add on double click
                    item.ondblclick = () => this.addMedication(w, clientId, name);

                    listContainer.appendChild(item);
                });
            };

            const searchDrugsAPI = (query) => {
                if (!query) {
                    listContainer.innerHTML = '';
                    return;
                }

                if (searchCache[query]) {
                    renderList(searchCache[query]);
                    return;
                }

                listContainer.innerHTML = '<div style="padding:5px; color:#888; font-style:italic;">Searching...</div>';
                const url = `https://clinicaltables.nlm.nih.gov/api/rxterms/v3/search?terms=${encodeURIComponent(query)}&ef=STRENGTHS_AND_FORMS`;
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: url,
                    onload: (res) => {
                        try {
                            const data = JSON.parse(res.responseText);
                            const candidates = data[1] || [];
                            searchCache[query] = candidates;
                            renderList(candidates);
                        } catch (e) {
                            listContainer.innerHTML = '<div style="padding:5px; color:red;">Error parsing results.</div>';
                        }
                    },
                    onerror: () => {
                        listContainer.innerHTML = '<div style="padding:5px; color:red;">API request failed.</div>';
                    }
                });
            };

            searchInput.oninput = () => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    searchDrugsAPI(searchInput.value);
                }, 300); // 300ms debounce
            };

            searchInput.onkeydown = (e) => {
                if (e.key === 'Enter') {
                    const first = listContainer.firstElementChild;
                    const name = (first && first.innerText !== 'No results.') ? first.innerText : searchInput.value.trim();
                    if (name) this.addMedication(w, clientId, name);
                }
            };

            // Google search button
            const googleBtn = w.querySelector('#sn-meds-google-btn');
            googleBtn.onclick = () => {
                const query = searchInput.value.trim();
                if (query) {
                    window.open(`https://www.google.com/search?q=${encodeURIComponent(query)}+drug`, '_blank');
                }
            };

            // 3. Right Panel Rendering
            this.refreshRightPanel(w, clientId);
        },

        addMedication(w, clientId, drugName) {
            const data = this.getMedData(clientId);

            // Don't add if it already exists anywhere
            const alreadyExists = data.prescriptions.some(p => p.meds.some(m => m.name === drugName));
            if (alreadyExists) return;

            let targetPrescription = data.prescriptions[0];
            if (!targetPrescription) {
                data.prescriptions.push({ name: '1st Prescription', prescribedBy: '', date: '', meds: [] });
                targetPrescription = data.prescriptions[0];
            }

            targetPrescription.meds.push({ name: drugName, dosageFreq: '' });
            this.saveMedData(clientId, data);
            this.refreshRightPanel(w, clientId);
        },

        removeMedication(w, clientId, drugName, prescriptionName) {
            const data = this.getMedData(clientId);
            const prescription = data.prescriptions.find(p => p.name === prescriptionName);
            if (prescription) {
                prescription.meds = prescription.meds.filter(m => m.name !== drugName);
                this.saveMedData(clientId, data);
                this.refreshRightPanel(w, clientId);
            }
        },

        updateMedication(w, clientId, oldName, prescriptionName, newName, newDosageFreq) {
            const data = this.getMedData(clientId);
            const prescription = data.prescriptions.find(p => p.name === prescriptionName);
            if (prescription) {
                const med = prescription.meds.find(m => m.name === oldName);
                if (med) {
                    med.name = newName;
                    med.dosageFreq = newDosageFreq;
                    this.saveMedData(clientId, data);
                }
            }
        },

        getMedData(clientId) {
            const key = 'cn_meds_data_' + clientId;
            let data = GM_getValue(key);

            // Migration from oldest format (flat array)
            if (!data) {
                const oldMeds = GM_getValue('cn_meds_' + clientId);
                if (oldMeds && oldMeds.length > 0) {
                    data = {
                        prescriptions: [{
                            name: '1st Prescription',
                            prescribedBy: '',
                            date: '',
                            meds: oldMeds.map(m => ({ name: m.name, dosageFreq: `${m.dosage || ''} ${m.freq || ''}`.trim() }))
                        }]
                    };
                    this.saveMedData(clientId, data);
                    GM_deleteValue('cn_meds_' + clientId);
                }
            }

            // Migration from categories format (previous version)
            if (data && data.categories && !data.prescriptions) {
                const rxList = data.categories.length > 0
                    ? data.categories.map((cat, i) => ({
                        name: `${i + 1}${i === 0 ? 'st' : i === 1 ? 'nd' : i === 2 ? 'rd' : 'th'} Prescription`,
                        prescribedBy: '',
                        date: '',
                        meds: cat.meds.map(m => ({ name: m.name, dosageFreq: m.details || '' }))
                      }))
                    : [{ name: '1st Prescription', prescribedBy: '', date: '', meds: [] }];
                data = { prescriptions: rxList };
                this.saveMedData(clientId, data);
            }

            // Ensure data structure is valid
            if (!data || !data.prescriptions || data.prescriptions.length === 0) {
                return { prescriptions: [{ name: '1st Prescription', prescribedBy: '', date: '', meds: [] }] };
            }
            return data;
        },

        saveMedData(clientId, data) {
            const key = 'cn_meds_data_' + clientId;
            GM_setValue(key, data);
        },

        addPrescription(w, clientId) {
            const data = this.getMedData(clientId);
            const count = data.prescriptions.length + 1;
            const suffix = count === 1 ? 'st' : count === 2 ? 'nd' : count === 3 ? 'rd' : 'th';
            data.prescriptions.push({ name: `${count}${suffix} Prescription`, prescribedBy: '', date: '', meds: [] });
            this.saveMedData(clientId, data);
            this.refreshRightPanel(w, clientId);
        },

        /**
         * Shows a modal overlay with a textarea for pasting structured prescription text,
         * then parses it via regex and adds a new prescription.
         */
        showParseDialog(w, clientId) {
            const existing = w.querySelector('.sn-parse-overlay');
            if (existing) { existing.remove(); return; }

            const overlay = document.createElement('div');
            overlay.className = 'sn-parse-overlay';
            overlay.style.cssText = 'position:absolute; inset:0; background:rgba(0,0,0,0.3); display:flex; align-items:center; justify-content:center; z-index:10;';

            const dialog = document.createElement('div');
            dialog.style.cssText = 'background:#fff; border:1px solid #ccc; border-radius:6px; padding:12px; width:90%; max-width:500px; max-height:80%; display:flex; flex-direction:column; box-shadow:0 4px 12px rgba(0,0,0,0.2);';

            dialog.innerHTML = `
                <div style="font-weight:bold; margin-bottom:6px;">Paste Prescription Text</div>
                <div style="font-size:11px; color:#666; margin-bottom:6px;">
                    Format: <code>Prescription by [name], Date [date]</code> then numbered meds like <code>1. name - dosage - frequency</code>
                </div>
                <textarea id="sn-parse-textarea" style="flex:1; min-height:180px; border:1px solid #ccc; padding:4px; font-size:12px; font-family:monospace; resize:vertical;" placeholder="Prescription by Dr. Smith, Date 06/15/2026
        1. abc - xxx mg - 2 times/day
        2. def - yyy ml - 1 tab morning & night"></textarea>
                <div style="display:flex; gap:4px; justify-content:flex-end; margin-top:6px;">
                    <button id="sn-parse-cancel" style="padding:4px 10px; border:1px solid #ccc; background:#f0f0f0; cursor:pointer;">Cancel</button>
                    <button id="sn-parse-execute" style="padding:4px 10px; border:1px solid #4a90d9; background:#4a90d9; color:#fff; cursor:pointer;">Parse &amp; Add</button>
                </div>
            `;

            overlay.appendChild(dialog);
            w.appendChild(overlay);

            const textarea = dialog.querySelector('#sn-parse-textarea');
            const closeOverlay = () => overlay.remove();

            dialog.querySelector('#sn-parse-cancel').onclick = closeOverlay;

            dialog.querySelector('#sn-parse-execute').onclick = () => {
                const result = this.parsePrescriptionText(textarea.value);
                if (!result) return;

                const data = this.getMedData(clientId);
                const count = data.prescriptions.length + 1;
                const suffix = count === 1 ? 'st' : count === 2 ? 'nd' : count === 3 ? 'rd' : 'th';
                result.name = `${count}${suffix} Prescription`;
                data.prescriptions.push(result);
                this.saveMedData(clientId, data);
                this.refreshRightPanel(w, clientId);
                closeOverlay();
                app.Core.Utils.showNotification(`Added "${result.name}" with ${result.meds.length} medication(s).`, { type: 'success' });
            };

            // Allow Enter in textarea without triggering dialog buttons
            textarea.addEventListener('keydown', (e) => e.stopPropagation());
            setTimeout(() => textarea.focus(), 100);
        },

        /**
         * Parses structured prescription text using regex.
         * Expected format:
         *   Prescription by Dr. Smith, Date 06/15/2026
         *   1. abc - xxx mg - 2 times/day
         *   2. def - yyy ml - 1 tab morning & night
         * @returns {Object|null} { prescribedBy, date, meds: [{ name, dosageFreq }] }
         */
        parsePrescriptionText(text) {
            if (!text || !text.trim()) {
                app.Core.Utils.showNotification('No text to parse.', { type: 'error' });
                return null;
            }

            const lines = text.split('\n').map(l => l.trim()).filter(l => l);
            if (lines.length === 0) return null;

            // Parse header: "Prescription by [name], Date [date]"
            let prescribedBy = '';
            let date = '';
            let medStartIndex = 0;

            const headerMatch = lines[0].match(/^Prescription\s+by\s+(.+?),\s*Date\s+(.+)$/i);
            if (headerMatch) {
                prescribedBy = headerMatch[1].trim();
                date = headerMatch[2].trim();
                medStartIndex = 1;
            }

            // Parse medication lines
            const meds = [];

            for (let i = medStartIndex; i < lines.length; i++) {
                const line = lines[i];

                // Format: "1. name - dosage - frequency" (two dashes = three parts)
                const tripleMatch = line.match(/^\d+[\.\)]\s*(.+?)\s*-\s*(.+?)\s*-\s*(.+)$/);
                if (tripleMatch) {
                    meds.push({
                        name: tripleMatch[1].trim(),
                        dosageFreq: `${tripleMatch[2].trim()} - ${tripleMatch[3].trim()}`
                    });
                    continue;
                }

                // Format: "1. name - dosage/freq" (single dash = two parts)
                const doubleMatch = line.match(/^\d+[\.\)]\s*(.+?)\s*-\s*(.+)$/);
                if (doubleMatch) {
                    meds.push({
                        name: doubleMatch[1].trim(),
                        dosageFreq: doubleMatch[2].trim()
                    });
                    continue;
                }

                // Fallback: just the text after the number
                const fallback = line.replace(/^\d+[\.\)]\s*/, '').trim();
                if (fallback) {
                    meds.push({ name: fallback, dosageFreq: '' });
                }
            }

            if (meds.length === 0) {
                app.Core.Utils.showNotification('No medications could be parsed. Check the format.', { type: 'error' });
                return null;
            }

            return { name: '', prescribedBy, date, meds };
        },

        /**
         * Generates structured text from all current prescriptions and copies to clipboard.
         * Reverse of parsePrescriptionText — useful for exporting or pasting into notes.
         */
        copyPrescriptionsAsText(clientId) {
            const data = this.getMedData(clientId);
            if (!data.prescriptions || data.prescriptions.length === 0) {
                app.Core.Utils.showNotification('Nothing to copy — no prescriptions added.', { type: 'error' });
                return;
            }

            const lines = [];
            data.prescriptions.forEach((rx) => {
                // Header
                if (rx.prescribedBy || rx.date) {
                    lines.push(`Prescription by ${rx.prescribedBy || '[name]'}, Date ${rx.date || '[date]'}`);
                } else {
                    lines.push(rx.name);
                }

                // Medications
                rx.meds.forEach((med, i) => {
                    const num = i + 1;
                    if (med.dosageFreq) {
                        lines.push(`${num}. ${med.name} - ${med.dosageFreq}`);
                    } else {
                        lines.push(`${num}. ${med.name}`);
                    }
                });

                lines.push(''); // blank line between prescriptions
            });

            const text = lines.join('\n').trim();

            // Copy to clipboard
            try {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                app.Core.Utils.showNotification(`Copied ${data.prescriptions.length} prescription(s) to clipboard.`, { type: 'success' });
            } catch (e) {
                app.Core.Utils.showNotification('Failed to copy text.', { type: 'error' });
            }
        },

        refreshRightPanel(w, clientId) {
            const container = w.querySelector('#sn-meds-selected');
            container.innerHTML = '';

            const data = this.getMedData(clientId);

            if (!data.prescriptions || data.prescriptions.length === 0) {
                container.innerHTML = `<div style="padding:10px; color:#888; text-align:center; font-style:italic;">No medications added. Use the search to find and add drugs.</div>`;
                return;
            }

            data.prescriptions.forEach((prescription) => {
                const groupDiv = document.createElement('div');
                groupDiv.className = 'sn-med-group';
                groupDiv.dataset.prescriptionName = prescription.name;
                groupDiv.style.marginBottom = '12px';
                groupDiv.style.border = '1px solid #ddd';
                groupDiv.style.borderRadius = '4px';
                groupDiv.style.padding = '6px';

                // --- Header: Prescription name ---
                const header = document.createElement('div');
                header.innerText = prescription.name;
                header.style.cssText = 'background:#e8e8e8; padding:4px 6px; font-weight:bold; border-bottom:1px solid #ccc; font-size:12px; cursor:pointer; border-radius:3px 3px 0 0;';
                header.title = 'Double-click to rename';
                groupDiv.appendChild(header);

                header.ondblclick = () => {
                    const oldName = header.innerText;
                    header.innerHTML = `<input type="text" value="${oldName}" style="width:90%;"/>`;
                    const input = header.firstElementChild;
                    input.focus();
                    input.select();

                    const saveName = () => {
                        const newName = input.value.trim();
                        if (newName && newName !== oldName) {
                            const currentData = this.getMedData(clientId);
                            const rx = currentData.prescriptions.find(p => p.name === oldName);
                            if (rx) {
                                rx.name = newName;
                                this.saveMedData(clientId, currentData);
                                this.refreshRightPanel(w, clientId);
                            }
                        } else {
                            header.innerText = oldName;
                        }
                    };

                    input.onblur = saveName;
                    input.onkeydown = (e) => {
                        if (e.key === 'Enter') input.blur();
                        if (e.key === 'Escape') {
                            input.value = oldName;
                            input.blur();
                        }
                    };
                };

                // --- Prescribed By & Date fields ---
                const metaDiv = document.createElement('div');
                metaDiv.style.cssText = 'display:flex; gap:8px; padding:4px 0; font-size:11px; border-bottom:1px solid #eee; margin-bottom:4px;';
                metaDiv.innerHTML = `
                    <label style="display:flex; align-items:center; gap:2px; white-space:nowrap;">
                        <span style="color:#555;">Prescribed by:</span>
                        <input type="text" value="${prescription.prescribedBy || ''}" style="border:1px solid #ddd; padding:2px; width:140px; font-size:11px;" class="sn-rx-prescriber">
                    </label>
                    <label style="display:flex; align-items:center; gap:2px; white-space:nowrap;">
                        <span style="color:#555;">Date:</span>
                        <input type="text" value="${prescription.date || ''}" style="border:1px solid #ddd; padding:2px; width:100px; font-size:11px;" class="sn-rx-date">
                    </label>
                `;
                groupDiv.appendChild(metaDiv);

                const prescriberInput = metaDiv.querySelector('.sn-rx-prescriber');
                const dateInput = metaDiv.querySelector('.sn-rx-date');

                const saveMeta = () => {
                    const currentData = this.getMedData(clientId);
                    const rx = currentData.prescriptions.find(p => p.name === prescription.name);
                    if (rx) {
                        rx.prescribedBy = prescriberInput.value;
                        rx.date = dateInput.value;
                        this.saveMedData(clientId, currentData);
                    }
                };
                prescriberInput.onchange = saveMeta;
                dateInput.onchange = saveMeta;

                // --- Medications list ---
                if (prescription.meds.length === 0) {
                    const emptyRow = document.createElement('div');
                    emptyRow.innerText = 'Search and add medications from the left panel';
                    emptyRow.style.cssText = 'padding:8px; color:#aaa; text-align:center; font-style:italic; font-size:11px;';
                    groupDiv.appendChild(emptyRow);
                } else {
                    prescription.meds.forEach(med => {
                        const row = document.createElement('div');
                        row.className = 'sn-med-row';
                        row.draggable = true;
                        row.style.cssText = 'display:flex; align-items:center; gap:4px; padding:3px 0; border-bottom:1px solid #f0f0f0; font-size:12px;';

                        row.innerHTML = `
                            <span class="sn-med-drag" style="cursor:grab; font-size:13px; user-select:none; color:#999; padding:0 4px;" title="Drag to reorder or move to another prescription">⠿</span>
                            <input type="text" class="sn-med-name" value="${med.name}" style="flex:2; min-width:80px; border:1px solid #ddd; padding:2px; font-size:12px;">
                            <input type="text" class="sn-med-dose" placeholder="Dosage / Freq (e.g. 20mg — 1 tab 3x daily)" value="${med.dosageFreq || ''}" style="flex:3; min-width:120px; border:1px solid #ddd; padding:2px; font-size:12px;">
                            <button class="sn-med-del" style="cursor:pointer; color:red; border:none; background:none; font-weight:bold; font-size:14px;">×</button>
                        `;

                        const nameInput = row.querySelector('.sn-med-name');
                        const doseInput = row.querySelector('.sn-med-dose');

                        const saveMed = () => {
                            const currentData = this.getMedData(clientId);
                            const rx = currentData.prescriptions.find(p => p.name === prescription.name);
                            if (rx) {
                                const m = rx.meds.find(m => m.name === med.name);
                                if (m) {
                                    m.name = nameInput.value;
                                    m.dosageFreq = doseInput.value;
                                    this.saveMedData(clientId, currentData);
                                }
                            }
                        };

                        // Save med name/dose on change and blur (to capture edits before drag)
                        nameInput.onchange = saveMed;
                        nameInput.onblur = saveMed;
                        doseInput.onchange = saveMed;
                        doseInput.onblur = saveMed;

                        row.querySelector('.sn-med-del').onclick = () => {
                            const drugName = nameInput.value;
                            const currentData = this.getMedData(clientId);
                            const rx = currentData.prescriptions.find(p => p.name === prescription.name);
                            if (rx) {
                                rx.meds = rx.meds.filter(m => m.name !== drugName);
                                this.saveMedData(clientId, currentData);
                                this.refreshRightPanel(w, clientId);
                            }
                        };

                        // --- Drag & Drop Handlers ---
                        row.addEventListener('dragstart', (e) => {
                            // Save current field values so drag uses latest data
                            saveMed();
                            e.dataTransfer.setData('text/plain', JSON.stringify({
                                srcPrescription: prescription.name,
                                medName: med.name
                            }));
                            e.dataTransfer.effectAllowed = 'move';
                            row.style.opacity = '0.4';
                        });

                        row.addEventListener('dragend', () => {
                            row.style.opacity = '1';
                            container.querySelectorAll('.sn-med-drag-over').forEach(el => el.classList.remove('sn-med-drag-over'));
                        });

                        row.addEventListener('dragover', (e) => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = 'move';
                            row.classList.add('sn-med-drag-over');
                        });

                        row.addEventListener('dragleave', () => {
                            row.classList.remove('sn-med-drag-over');
                        });

                        row.addEventListener('drop', (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            row.classList.remove('sn-med-drag-over');

                            this._handleMedDrop(e, clientId, prescription.name, med.name, container, w);
                        });

                        groupDiv.appendChild(row);
                    });

                    // Make the prescription group itself a drop target (for appending to end)
                    groupDiv.addEventListener('dragover', (e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        groupDiv.style.outline = '2px dashed #4a90d9';
                    });

                    groupDiv.addEventListener('dragleave', (e) => {
                        // Only remove highlight if leaving the groupDiv, not entering a child
                        if (!groupDiv.contains(e.relatedTarget)) {
                            groupDiv.style.outline = '';
                        }
                    });

                    groupDiv.addEventListener('drop', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        groupDiv.style.outline = '';

                        // Only handle drop directly on the group div (not on a child row)
                        if (e.target === groupDiv || e.target.closest('.sn-med-group') === groupDiv && !e.target.closest('.sn-med-row')) {
                            this._handleMedDrop(e, clientId, prescription.name, null, container, w);
                        }
                    });
                }

                container.appendChild(groupDiv);
            });
        },

        /**
         * Handles the drop event for drag-and-drop medication reordering.
         * Moves a medication from its source prescription to a target position.
         * @param {DragEvent} e - The drop event
         * @param {string} clientId
         * @param {string} targetPrescriptionName - Name of the target prescription
         * @param {string|null} targetMedName - Name of the med to insert before, or null to append
         * @param {HTMLElement} container - The selected-meds container (to remove drag-over styles)
         * @param {HTMLElement} w - The panel window (for refreshRightPanel)
         */
        _handleMedDrop(e, clientId, targetPrescriptionName, targetMedName, container, w) {
            try {
                const data = JSON.parse(e.dataTransfer.getData('text/plain'));
                const { srcPrescription: srcName, medName } = data;

                const currentData = this.getMedData(clientId);
                const srcRx = currentData.prescriptions.find(p => p.name === srcName);
                const targetRx = currentData.prescriptions.find(p => p.name === targetPrescriptionName);
                if (!srcRx || !targetRx) return;

                // Find the dragged medication object
                const draggedMedIdx = srcRx.meds.findIndex(m => m.name === medName);
                if (draggedMedIdx === -1) return;
                const [draggedMed] = srcRx.meds.splice(draggedMedIdx, 1);

                if (srcName === targetPrescriptionName) {
                    // Same prescription: reorder
                    if (targetMedName) {
                        const insertIdx = targetRx.meds.findIndex(m => m.name === targetMedName);
                        if (insertIdx >= 0) {
                            targetRx.meds.splice(insertIdx, 0, draggedMed);
                        } else {
                            targetRx.meds.push(draggedMed);
                        }
                    } else {
                        targetRx.meds.push(draggedMed);
                    }
                } else {
                    // Different prescription: move
                    if (targetMedName) {
                        const insertIdx = targetRx.meds.findIndex(m => m.name === targetMedName);
                        if (insertIdx >= 0) {
                            targetRx.meds.splice(insertIdx, 0, draggedMed);
                        } else {
                            targetRx.meds.push(draggedMed);
                        }
                    } else {
                        targetRx.meds.push(draggedMed);
                    }
                }

                this.saveMedData(clientId, currentData);
                this.refreshRightPanel(w, clientId);
            } catch (err) {
                // Ignore parse errors from invalid drag data
            }
        }
    };

    app.Tools.MedicationPanel = MedicationPanel;
})();