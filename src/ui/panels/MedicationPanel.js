(function () {
    const app = window.CM_App = window.CM_App || {};
    app.Tools = app.Tools || {};

    let searchCache = {}; // In-memory cache for search results

    /**
     * Manages the Medication tracking UI, allowing users to search the NIH RxTerms API
     * and organize a client's medications into custom categories with drag-and-drop support.
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

            const clientId = app.AppObserver.getClientId();
            if (!clientId) {
                app.Core.Utils.showNotification("No client loaded.", { type: 'error' });
                return;
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
                    <div>
                        <button id="sn-meds-min" style="cursor:pointer; background:none; border:none; font-weight:bold;">_</button>
                        <button id="sn-meds-close" style="cursor:pointer; background:none; border:none; margin-left:5px; font-weight:bold;">X</button>
                    </div>
                </div>
                <div style="display:flex; flex-grow:1; overflow:hidden;">
                    <!-- Middle Panel: Drug List -->
                    <div style="width:35%; display:flex; flex-direction:column; border-right:1px solid #ccc; padding:5px;">
                        <input type="text" id="sn-meds-search" placeholder="Search Drugs..." style="width:100%; padding:4px; margin-bottom:5px; border:1px solid #ccc;">
                        <div id="sn-meds-list" style="flex-grow:1; overflow-y:auto; border:1px solid #eee;"></div>
                    </div>

                    <!-- Right Panel: Selected Meds -->
                    <div style="flex-grow:1; display:flex; flex-direction:column; background:#fff;">
                        <div style="font-weight:bold; margin-bottom:5px; color:#555;">Patient Medications</div>
                        <div id="sn-meds-selected" style="flex-grow:1; overflow-y:auto; padding:5px;"></div>
                    </div>
                </div>
                <div style="border-top: 1px solid #ccc; padding: 5px; background: #f9f9f9; text-align: right;">
                    <button id="sn-meds-add-cat" style="padding: 4px 8px;">+ Add Category</button>
                </div>
                <!-- Resizers -->
                <div class="sn-resizer rs-n"></div><div class="sn-resizer rs-s"></div>
                <div class="sn-resizer rs-e"></div><div class="sn-resizer rs-w"></div>
                <div class="sn-resizer rs-ne"></div><div class="sn-resizer rs-nw"></div>
                <div class="sn-resizer rs-se"></div><div class="sn-resizer rs-sw"></div>
            `;

            document.body.appendChild(w);
            app.Core.Windows.setup(w, w.querySelector('#sn-meds-min'), w.querySelector('.sn-header'), 'MEDS');

            w.querySelector('#sn-meds-close').onclick = () => { w.style.display = 'none'; app.Core.Windows.updateTabState(id); };

            w.querySelector('#sn-meds-add-cat').onclick = () => this.addCategory(w, clientId);

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
                    if (first) this.addMedication(w, clientId, first.innerText);
                }
            };

            // 3. Right Panel Rendering
            this.refreshRightPanel(w, clientId);
        },

        addMedication(w, clientId, drugName) {
            const data = this.getMedData(clientId);

            // Don't add if it already exists anywhere
            const alreadyExists = data.categories.some(c => c.meds.some(m => m.name === drugName));
            if (alreadyExists) return;

            let targetCategory = data.categories.find(c => c.name === 'Uncategorized');
            if (!targetCategory) {
                if (data.categories.length === 0) {
                    data.categories.push({ name: 'Uncategorized', meds: [] });
                }
                targetCategory = data.categories[0];
            }

            targetCategory.meds.push({ name: drugName, details: '' });
            this.saveMedData(clientId, data);
            this.refreshRightPanel(w, clientId);
        },

        removeMedication(w, clientId, drugName, categoryName) {
            const data = this.getMedData(clientId);
            const category = data.categories.find(c => c.name === categoryName);
            if (category) {
                category.meds = category.meds.filter(m => m.name !== drugName);
                this.saveMedData(clientId, data);
                this.refreshRightPanel(w, clientId);
            }
        },

        updateMedication(w, clientId, drugName, categoryName, newDetails) {
            const data = this.getMedData(clientId);
            const category = data.categories.find(c => c.name === categoryName);
            if (category) {
                const med = category.meds.find(m => m.name === drugName);
                if (med) {
                    med.details = newDetails;
                    this.saveMedData(clientId, data);
                    // No need to refresh, it's an input change.
                }
            }
        },

        getMedData(clientId) {
            const key = 'cn_meds_data_' + clientId;
            let data = GM_getValue(key);

            // Migration from old format
            if (!data) {
                const oldMeds = GM_getValue('cn_meds_' + clientId);
                if (oldMeds && oldMeds.length > 0) {
                    data = {
                        categories: [{
                            name: 'Uncategorized',
                            meds: oldMeds.map(m => ({ name: m.name, details: `${m.dosage || ''} ${m.freq || ''}`.trim() }))
                        }]
                    };
                    this.saveMedData(clientId, data);
                    GM_deleteValue('cn_meds_' + clientId); // Clean up old key
                }
            }

            // Ensure data structure is valid
            if (!data || !data.categories) {
                return { categories: [{ name: 'Uncategorized', meds: [] }] };
            }
            return data;
        },

        saveMedData(clientId, data) {
            const key = 'cn_meds_data_' + clientId;
            GM_setValue(key, data);
        },

        addCategory(w, clientId) {
            const data = this.getMedData(clientId);
            const newCategoryName = "Condition / Prescriber / Date";
            data.categories.push({ name: newCategoryName, meds: [] });
            this.saveMedData(clientId, data);
            this.refreshRightPanel(w, clientId);
        },

        refreshRightPanel(w, clientId) {
            const container = w.querySelector('#sn-meds-selected');
            container.innerHTML = '';

            const data = this.getMedData(clientId);

            if (!data.categories || data.categories.length === 0) {
                container.innerHTML = `<div style="padding:10px; color:#888; text-align:center; font-style:italic;">No medications added. Use the search to find and add drugs.</div>`;
                return;
            }

            // Drag and Drop state
            let draggedItem = null;

            data.categories.forEach((category, categoryIndex) => {
                const groupDiv = document.createElement('div');
                groupDiv.className = 'sn-med-group';
                groupDiv.dataset.categoryName = category.name;
                groupDiv.style.marginBottom = '10px';

                const header = document.createElement('div');
                header.innerText = category.name;
                header.style.cssText = 'background:#eee; padding:4px; font-weight:bold; border-bottom:1px solid #ccc; font-size:12px; cursor:pointer;';
                header.title = "Double-click to rename";
                groupDiv.appendChild(header);

                // Dbl-click to edit category name
                header.ondblclick = () => {
                    const oldName = header.innerText;
                    header.innerHTML = `<input type="text" value="${oldName}" style="width: 90%;"/>`;
                    const input = header.firstElementChild;
                    input.focus();
                    input.select();

                    const saveName = () => {
                        const newName = input.value.trim();
                        if (newName && newName !== oldName) {
                            const currentData = this.getMedData(clientId);
                            const cat = currentData.categories.find(c => c.name === oldName);
                            if (cat) {
                                cat.name = newName;
                                this.saveMedData(clientId, currentData);
                                this.refreshRightPanel(w, clientId); // Full refresh to update all data attributes
                            }
                        } else {
                            header.innerText = oldName; // revert
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

                // Drag and Drop listeners for category
                groupDiv.ondragover = (e) => {
                    e.preventDefault();
                    groupDiv.style.backgroundColor = '#e3f2fd'; // Highlight drop target
                };
                groupDiv.ondragleave = () => {
                    groupDiv.style.backgroundColor = '';
                };
                groupDiv.ondrop = (e) => {
                    e.preventDefault();
                    groupDiv.style.backgroundColor = '';
                    if (draggedItem) {
                        const targetCategoryName = groupDiv.dataset.categoryName;
                        const { drugName, sourceCategoryName } = draggedItem;

                        if (targetCategoryName !== sourceCategoryName) {
                            const d = this.getMedData(clientId);
                            const sourceCat = d.categories.find(c => c.name === sourceCategoryName);
                            const targetCat = d.categories.find(c => c.name === targetCategoryName);
                            if (sourceCat && targetCat) {
                                const medIndex = sourceCat.meds.findIndex(m => m.name === drugName);
                                if (medIndex > -1) {
                                    const [medToMove] = sourceCat.meds.splice(medIndex, 1);
                                    targetCat.meds.push(medToMove);
                                    this.saveMedData(clientId, d);
                                    this.refreshRightPanel(w, clientId);
                                }
                            }
                        }
                    }
                    draggedItem = null;
                };

                if (category.meds.length === 0) {
                    const emptyRow = document.createElement('div');
                    emptyRow.innerText = 'Drag medications here';
                    emptyRow.style.cssText = 'padding:10px; color:#aaa; text-align:center; font-style:italic;';
                    groupDiv.appendChild(emptyRow);
                } else {
                    category.meds.forEach(med => {
                        const row = document.createElement('div');
                        row.className = 'sn-med-row';
                        row.draggable = true;
                        row.style.cssText = 'display:flex; align-items:center; padding:4px; border-bottom:1px solid #f0f0f0; font-size:12px;';

                        row.ondragstart = (e) => {
                            draggedItem = { drugName: med.name, sourceCategoryName: category.name };
                            e.dataTransfer.effectAllowed = 'move';
                            setTimeout(() => { row.style.opacity = '0.5'; }, 0);
                        };
                        row.ondragend = () => {
                            row.style.opacity = '1';
                            draggedItem = null;
                        };

                        row.innerHTML = `
                            <div style="width:120px; font-weight:bold; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; cursor:move;">${med.name}</div>
                            <input type="text" placeholder="Dosage / Freq" class="sn-med-details" value="${med.details || ''}" style="flex:1; margin:0 5px; border:1px solid #ddd; padding:2px;">
                            <button class="sn-med-del" style="cursor:pointer; color:red; border:none; background:none; font-weight:bold;">×</button>
                        `;

                        // Events
                        row.querySelector('.sn-med-details').onchange = (e) => this.updateMedication(w, clientId, med.name, category.name, e.target.value);
                        row.querySelector('.sn-med-del').onclick = () => this.removeMedication(w, clientId, med.name, category.name);

                        groupDiv.appendChild(row);
                    });
                }
                container.appendChild(groupDiv);
            });
        }
    };

    app.Tools.MedicationPanel = MedicationPanel;
})();