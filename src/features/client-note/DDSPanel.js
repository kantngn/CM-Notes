(function () {
    const app = window.CM_App = window.CM_App || {};
    app.Features = app.Features || {};

    /**
     * Renders and manages the "DDS" tab within the Client Note interface.
     * Provides search functionality for Disability Determination Services (DDS) offices.
     * Integrates with `SSADataManager` to query the static database.
     * Dynamically updates the UI based on specific DDS selections (e.g., showing external links for TX/MI/SC/VA).
     * @namespace app.Features.DDSPanel
     */
    const DDSPanel = {
        /**
         * Generates the HTML for the DDS panel and binds search, clear, and note-saving events.
         * @param {HTMLElement} container - The DOM element where the panel will be rendered.
         * @param {Object} context - An object containing dependencies (clientId, w, ClientNote, app).
         */
        render(container, context) {
            const { clientId, w, ClientNote, app } = context;

            const formData = GM_getValue('cn_form_data_' + clientId, {});
            const state = w.querySelector('#sn-state').innerText || '';

            container.innerHTML = `
                <div style="padding:10px; display:flex; flex-direction:column; gap:15px;">
                    <!-- DDS Section -->
                    <div class="sn-ssa-section" data-type="DDS">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2px; border-bottom:1px solid #ccc; padding-bottom:2px;">
                            <span style="font-weight:bold; color:var(--sn-primary-text);">DDS Office</span>
                            <div style="display:flex; gap:2px; align-items:center;">
                                <button class="sn-ssa-nearest-btn" style="cursor:pointer; background:#e8f5e9; border:1px solid #4CAF50; border-radius:3px; font-size:10px; padding:1px 5px; color:#2E7D32;" title="Find nearest DDS offices to client">📍</button>
                                <div class="sn-ssa-extra-btn-container"></div>
                                <button class="sn-ssa-search-btn" style="cursor:pointer; background:var(--sn-bg-lighter); border:1px solid var(--sn-border); border-radius:3px; font-size:10px; padding:1px 5px;">🔍</button>
                                <button class="sn-ssa-clear-btn" style="cursor:pointer; background:#ffebee; border:1px solid #ef5350; border-radius:3px; font-size:10px; padding:1px 5px;">✕</button>
                            </div>
                        </div>
                        <div class="sn-ssa-edit-container" style="position:relative; display:${formData.DDS_Text ? 'block' : 'none'};">
                            <div class="sn-ssa-display" style="background:#fff; border:1px solid #ccc; padding:5px; font-size:inherit; min-height:1.2em; white-space:pre-wrap; color:#333; margin-bottom:0;">${formData.DDS_Text || ''}</div>
                            <div class="sn-ssa-edit-active" style="position:absolute; bottom:2px; right:5px; font-size:9px; cursor:pointer; color:var(--sn-primary-text); opacity:0.6;" title="Edit this office's contact info">
                                <span class="sn-ssa-mismatch" style="color:#f44336; font-weight:bold; margin-right:2px; display:none;">!</span>(edit)
                            </div>
                        </div>
                        <div class="sn-ssa-search-box" style="display:none;">
                            <input type="text" class="sn-ssa-input" style="width:100%; border:1px solid var(--sn-border); padding:4px; font-size:11px; box-sizing:border-box; margin-bottom:5px;" placeholder="Search sitecode, name, or phone...">
                            <div class="sn-ssa-results" style="border:1px solid var(--sn-bg-light); max-height:150px; overflow-y:auto; background:white; display:none;"></div>
                        </div>
                        <textarea id="sn-dds-note" placeholder="DDS Notes..." style="width:100%; height:40px; border:1px solid #ccc; font-family:inherit; font-size:inherit; margin-top:5px; resize:vertical; box-sizing: border-box;">${formData.DDS_Note || ''}</textarea>
                    </div>
                </div>
            `;

            // Add listener for DDS Note
            const ddsNote = container.querySelector('#sn-dds-note');
            if (ddsNote) {
                let _ddsTimer;
                ddsNote.oninput = () => {
                    clearTimeout(_ddsTimer);
                    _ddsTimer = setTimeout(() => {
                        ClientNote.updateAndSaveData(clientId, { DDS_Note: ddsNote.value });
                    }, 300);
                };
            }

            /**
             * Updates the extra buttons and background based on the selected state.
             * Exposed as DDSPanel._updateDDSUI for external callers (e.g., NearestOffice map).
             * @param {string} text - The DDS display text.
             * @param {HTMLElement} sectionElement - The DDS section DOM element.
             */
            const updateDDSUI = (text, sectionElement) => {
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
            // Expose for external callers (map sidebar)
            this._updateDDSUI = updateDDSUI;

            const type = 'DDS';
            const searchBtn = container.querySelector('.sn-ssa-search-btn');
            const clearBtn = container.querySelector('.sn-ssa-clear-btn');
            const displayDiv = container.querySelector('.sn-ssa-display');
            const searchBox = container.querySelector('.sn-ssa-search-box');
            const input = container.querySelector('.sn-ssa-input');
            const resultsDiv = container.querySelector('.sn-ssa-results');
            const editContainer = container.querySelector('.sn-ssa-edit-container');
            const editTrigger = container.querySelector('.sn-ssa-edit-active');

            if (editTrigger) {
                editTrigger.onclick = () => this._openEditForCurrentSelection(type, clientId, container, ClientNote);
                this._checkMismatch(type, clientId, container);
            }

            // Initial DDS UI update
            updateDDSUI(formData.DDS_Text, container);

            // Wire up the "Find Nearest" button
            const nearestBtn = container.querySelector('.sn-ssa-nearest-btn');
            if (nearestBtn) {
                nearestBtn.onclick = () => {
                    const savedData = GM_getValue('cn_form_data_' + clientId, {});
                    const freshData = GM_getValue('cn_' + clientId, {});
                    const clientAddr = (savedData['Address'] || freshData.address || '').trim();

                    if (!clientAddr) {
                        nearestBtn.style.background = '#ffebee';
                        nearestBtn.title = 'No client address found — populate Info tab first';
                        setTimeout(() => { nearestBtn.style.background = '#e8f5e9'; nearestBtn.title = 'Find nearest DDS offices to client'; }, 2000);
                        return;
                    }

                    if (app.Features.NearestOffice) {
                        app.Features.NearestOffice.create(clientAddr, state, clientId, 'DDS');
                    }
                };
            }

            let deleteConfirm = 0;

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

                        row.innerHTML = `<b>[${item.id}] ${item.office_name}</b><br>PN: ${phone}${fax ? ` | Fax: ${fax}` : ''}`;

                        row.onclick = () => {
                            const saveVal = item.office_name;
                            const displayText = `[${item.id}] ${item.office_name}\n${item.address || ''}\nPN: ${this._formatPhone(phone)}${fax ? `\nFax: ${this._formatPhone(fax)}` : ''}`;

                            ClientNote.updateAndSaveData(clientId, { DDS_Selection: saveVal, DDS_Text: displayText });
                            displayDiv.innerText = displayText;
                            if (editContainer) editContainer.style.display = 'block';
                            this._checkMismatch(type, clientId, container);
                            updateDDSUI(displayText, container);

                            searchBox.style.display = 'none';
                            if (editContainer) editContainer.style.display = 'block';
                            searchBtn.innerText = "🔍";

                            deleteConfirm = 0;
                            clearBtn.style.backgroundColor = '#ffebee';
                            clearBtn.style.color = '';
                            clearBtn.innerText = "✕";
                        };
                        resultsDiv.appendChild(row);
                    });
                });
            };

            searchBtn.onclick = () => {
                if (deleteConfirm) {
                    deleteConfirm = 0;
                    clearBtn.style.backgroundColor = '#ffebee';
                    clearBtn.style.color = '';
                    clearBtn.innerText = "✕";
                }

                if (searchBox.style.display === 'none') {
                    searchBox.style.display = 'block';
                    if (editContainer) editContainer.style.display = 'none';
                    input.value = state;
                    input.select();
                    searchBtn.innerText = "Go";

                    this._showStateDefaults(clientId, state, resultsDiv, displayDiv, searchBox, searchBtn, clearBtn, container, ClientNote);
                } else {
                    performSearch();
                }
            };

            input.onkeydown = (e) => {
                if (e.key === 'Enter') performSearch();
                if (e.key === 'Escape') {
                    searchBox.style.display = 'none';
                    if (editContainer) editContainer.style.display = 'block';
                    searchBtn.innerText = "🔍";
                }
            };

            clearBtn.onclick = () => {
                if (searchBox.style.display === 'block') {
                    searchBox.style.display = 'none';
                    if (editContainer) editContainer.style.display = 'block';
                    searchBtn.innerText = "🔍";
                    deleteConfirm = 0;
                    clearBtn.style.backgroundColor = '#ffebee';
                    clearBtn.style.color = '';
                    clearBtn.innerText = "✕";
                    return;
                }

                if (!deleteConfirm) {
                    deleteConfirm = Date.now();
                    clearBtn.style.backgroundColor = '#ef5350';
                    clearBtn.style.color = 'white';
                } else {
                    if (Date.now() - deleteConfirm < 300) return;
                    displayDiv.innerText = "";
                    if (editContainer) editContainer.style.display = 'none';
                    ClientNote.updateAndSaveData(clientId, { DDS_Selection: "", DDS_Text: "" });
                    updateDDSUI("", container);

                    deleteConfirm = 0;
                    clearBtn.style.backgroundColor = '#ffebee';
                    clearBtn.style.color = '';
                    clearBtn.innerText = "✕";
                }
            };
        },

        /**
         * Shows DDS offices in the same state as the client as default results
         * when the search box is opened. When multiple results exist, geocodes
         * the client's address and sorts results by distance (closest first).
         * @private
         */
        _showStateDefaults(clientId, state, resultsDiv, displayDiv, searchBox, searchBtn, clearBtn, section, ClientNote) {
            if (!state || state.length !== 2) {
                resultsDiv.style.display = 'block';
                resultsDiv.innerHTML = '<div style="padding:5px; color:#888; font-size:11px;">No state detected for this client.<br>Type a sitecode, name, or phone to search.</div>';
                return;
            }

            resultsDiv.style.display = 'block';
            resultsDiv.innerHTML = '<div style="padding:8px; color:#888; font-size:11px;"><span class="sn-dot-ani">Loading DDS offices for ' + state + '</span></div>';

            app.Core.SSADataManager.search('DDS', state, (results) => {
                resultsDiv.innerHTML = '';

                if (results.length === 0) {
                    resultsDiv.innerHTML = '<div style="padding:5px; color:#888; font-size:11px;">No DDS offices found for ' + state + '.</div>';
                    return;
                }

                // Single result — display immediately
                if (results.length === 1) {
                    this._renderResults(clientId, results, null, resultsDiv, displayDiv, searchBox, searchBtn, clearBtn, section, ClientNote, state);
                    return;
                }

                // Multiple results — try geocoding for distance sort
                const savedData = GM_getValue('cn_form_data_' + clientId, {});
                const freshData = GM_getValue('cn_' + clientId, {});
                const clientAddr = (savedData['Address'] || freshData.address || '').trim();

                if (!clientAddr) {
                    // No address — render alphabetically with a note
                    results.sort((a, b) => (a.office_name || '').localeCompare(b.office_name || ''));
                    this._renderResults(clientId, results, null, resultsDiv, displayDiv, searchBox, searchBtn, clearBtn, section, ClientNote, state);
                    return;
                }

                // Geocode and sort by distance
                const calc = app.Core.DistanceCalculator;
                if (!calc) {
                    this._renderResults(clientId, results, null, resultsDiv, displayDiv, searchBox, searchBtn, clearBtn, section, ClientNote, state);
                    return;
                }

                const zip = calc.extractZip(clientAddr);
                (async () => {
                    try {
                        const coords = zip ? await calc.geocodeAddress(zip) : null;
                        if (!coords) {
                            this._renderResults(clientId, results, null, resultsDiv, displayDiv, searchBox, searchBtn, clearBtn, section, ClientNote, state);
                            return;
                        }

                        // Calculate distances for offices with lat/lng; sort closest first
                        const withDistances = results
                            .filter(o => o.lat != null && o.lng != null)
                            .map(o => ({
                                office: o,
                                distanceMiles: calc.haversine(coords.lat, coords.lng, o.lat, o.lng)
                            }))
                            .sort((a, b) => a.distanceMiles - b.distanceMiles);

                        // Filter out any without coordinates, append at end
                        const withoutCoords = results.filter(o => o.lat == null || o.lng == null);

                        this._renderResults(clientId, withDistances.map(r => r.office), withoutCoords, resultsDiv, displayDiv, searchBox, searchBtn, clearBtn, section, ClientNote, state, withDistances);
                    } catch (err) {
                        console.error('[DDSPanel] Geocode error:', err);
                        this._renderResults(clientId, results, null, resultsDiv, displayDiv, searchBox, searchBtn, clearBtn, section, ClientNote, state);
                    }
                })();
            });
        },

        /**
         * Renders DDS search results into the results div. If distanceData is provided,
         * shows distance badges and sorts by proximity.
         * @private
         */
        _renderResults(clientId, sortedResults, withoutCoords, resultsDiv, displayDiv, searchBox, searchBtn, clearBtn, section, ClientNote, state, distanceData) {
            const count = sortedResults.length + (withoutCoords ? withoutCoords.length : 0);

            const header = document.createElement('div');
            header.style.cssText = 'padding:3px 5px; font-size:9px; color:var(--sn-primary-text); font-weight:bold; border-bottom:1px solid #eee;';
            header.innerText = '📍 DDS — ' + state + ' (' + count + ' offices)';
            resultsDiv.appendChild(header);

            // Build a quick distance lookup if available
            const distMap = {};
            if (distanceData) {
                distanceData.forEach(d => { distMap[d.office.id || d.office.office_name] = d.distanceMiles; });
                const distHint = document.createElement('div');
                distHint.style.cssText = 'padding:2px 5px; font-size:8px; color:#999; border-bottom:1px solid #eee;';
                distHint.innerText = '📍 Sorted by distance — closest first';
                resultsDiv.appendChild(distHint);
            } else {
                const mapHint = document.createElement('div');
                mapHint.style.cssText = 'padding:2px 5px; font-size:8px; color:#999; border-bottom:1px solid #eee;';
                mapHint.innerText = '📍 Click nearest button for map view with distances';
                resultsDiv.appendChild(mapHint);
            }

            // Render offices with coordinates (sorted by distance)
            sortedResults.forEach(item => {
                this._appendResultRow(item, distMap, resultsDiv, clientId, displayDiv, searchBox, searchBtn, clearBtn, section, ClientNote);
            });

            // Render offices without coordinates (appended at end, no distance)
            if (withoutCoords && withoutCoords.length > 0) {
                const sep = document.createElement('div');
                sep.style.cssText = 'padding:3px 5px; font-size:8px; color:#999; font-style:italic; border-bottom:1px solid #eee;';
                sep.innerText = '— ' + withoutCoords.length + ' office(s) without location data —';
                resultsDiv.appendChild(sep);
                withoutCoords.forEach(item => {
                    this._appendResultRow(item, null, resultsDiv, clientId, displayDiv, searchBox, searchBtn, clearBtn, section, ClientNote);
                });
            }
        },

        /**
         * Appends a single result row to the results div.
         * @private
         */
        _appendResultRow(item, distMap, resultsDiv, clientId, displayDiv, searchBox, searchBtn, clearBtn, section, ClientNote) {
            const row = document.createElement('div');
            row.style.cssText = 'padding:5px; border-bottom:1px solid #eee; cursor:pointer; transition:background 0.2s;';
            row.onmouseover = () => row.style.background = 'var(--sn-bg-lighter)';
            row.onmouseout = () => row.style.background = 'white';

            const phone = item.phone || '';
            const fax = item.fax || '';

            // Show distance badge if available
            const distBadge = distMap ? distMap[item.id || item.office_name] : null;
            const distHtml = distBadge != null
                ? '<span style="color:var(--sn-primary-text); font-size:10px; float:right;">' + distBadge.toFixed(1) + ' mi</span>'
                : '';

            row.innerHTML = (distHtml ? distHtml : '') + '<b>[' + item.id + '] ' + item.office_name + '</b><br><span style="font-size:10px;">PN: ' + phone + (fax ? ' | Fax: ' + fax : '') + '</span>';
            row.onclick = () => {
                const displayText = '[' + item.id + '] ' + item.office_name + '\n' + (item.address || '') + '\nPN: ' + this._formatPhone(phone) + (fax ? '\nFax: ' + this._formatPhone(fax) : '');

                ClientNote.updateAndSaveData(clientId, { DDS_Selection: item.office_name, DDS_Text: displayText });
                displayDiv.innerText = displayText;

                const editContainer = section.querySelector('.sn-ssa-edit-container');
                if (editContainer) editContainer.style.display = 'block';
                this._checkMismatch('DDS', clientId, section);
                this._updateDDSUI(displayText, section);

                searchBox.style.display = 'none';
                if (editContainer) editContainer.style.display = 'block';
                searchBtn.innerText = '🔍';
                clearBtn.style.backgroundColor = '#ffebee';
                clearBtn.style.color = '';
                clearBtn.innerText = '✕';
            };
            resultsDiv.appendChild(row);
        },

        // ── Shared methods (mirrored from SSAPanel for standalone panel) ──

        /**
         * Opens a floating modal to edit an office's phone/fax locally.
         * Generates a sync command for the master database.
         * @private
         */
        _openEditModal(item, type, app, onSaveCallback) {
            const modalId = 'sn-ssa-edit-modal';
            const existing = document.getElementById(modalId);
            if (existing) existing.remove();

            const m = document.createElement('div');
            m.id = modalId;
            m.className = 'sn-window';
            m.style.cssText = 'width:320px; padding:15px; top:150px; left:300px; background:#fff; box-shadow:0 10px 30px rgba(0,0,0,0.5); z-index:11000; font-family:"Segoe UI",sans-serif;';

            const name = item.office_name || item.location || item.name;
            const isAuthorized = app.Core.SSADataManager.isAuthorized();

            m.innerHTML = `
                <div style="font-weight:bold; color:var(--sn-primary-dark); margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
                    <span>🔧 Edit Office Contact ${isAuthorized ? '<small style="color:#4CAF50; margin-left:5px;">(Admin)</small>' : ''}</span>
                    <button id="sn-ssa-edit-close" style="background:none; border:none; cursor:pointer; font-size:16px;">✕</button>
                </div>
                <div style="padding: 5px 0 10px 0; border-bottom: 1px solid #eee; margin-bottom: 10px;">
                    <div style="font-size: 14px; font-weight: bold; color: #333;">${name}</div>
                    <div style="font-size: 10px; color: #888;">ID: ${item.id}</div>
                </div>
                <div style="display:flex; flex-direction:column; gap:10px;">
                    <div>
                        <label style="display:block; font-size:11px; color:#666; margin-bottom:2px;">Phone Number</label>
                        <input type="text" id="sn-ssa-edit-phone" value="${item.phone || ''}" style="width:100%; border:1px solid #ccc; padding:6px; border-radius:3px;">
                    </div>
                    <div>
                        <label style="display:block; font-size:11px; color:#666; margin-bottom:2px;">Fax Number</label>
                        <input type="text" id="sn-ssa-edit-fax" value="${item.fax || ''}" style="width:100%; border:1px solid #ccc; padding:6px; border-radius:3px;">
                    </div>
                    
                    <div style="display:flex; flex-direction:column; gap:8px; margin-top:5px;">
                        <button id="sn-ssa-edit-save" style="width:100%; padding:8px; cursor:pointer; background:var(--sn-primary); color:white; border:none; border-radius:4px; font-weight:bold;">Save Locally</button>
                        ${isAuthorized ? '<button id="sn-ssa-edit-push" style="width:100%; padding:8px; cursor:pointer; background:#f44336; color:white; border:none; border-radius:4px; font-weight:bold;">Push to Master (GitHub)</button>' : ''}
                    </div>

                    ${!isAuthorized ? `
                    <div id="sn-ssa-edit-patch" style="margin-top:10px; padding:8px; background:#f0f7ff; border:1px solid #c2e0ff; border-radius:4px; font-size:10px;">
                        <div style="color:#0052cc; font-weight:bold; margin-bottom:4px;">CLI Sync Command (Optional):</div>
                        <code id="sn-ssa-edit-code" style="word-break:break-all; font-family:monospace; color:#333;"></code>
                        <button id="sn-ssa-edit-copy-btn" style="margin-top:5px; width:100%; padding:4px; cursor:pointer; background:var(--sn-primary); color:white; border:none; border-radius:3px;">Copy Command</button>
                    </div>` : ''}

                    <div style="font-size:9px; color:#888; text-align:center; font-style:italic; margin-top:5px;">
                        ${isAuthorized ? 'Changes apply to your session immediately.' : 'Updates only apply to YOUR browser unless synced with CLI.'}
                    </div>
                </div>
            `;

            document.body.appendChild(m);
            app.Core.Windows.setup(m, null, m.children[0], 'ssa-editor');

            const close = m.querySelector('#sn-ssa-edit-close');
            close.onclick = () => m.remove();

            const save = m.querySelector('#sn-ssa-edit-save');
            const push = m.querySelector('#sn-ssa-edit-push');
            const code = m.querySelector('#sn-ssa-edit-code');
            const copyBtn = m.querySelector('#sn-ssa-edit-copy-btn');

            const updateCodeDisplay = (phone, fax) => {
                if (code) {
                    const key = item.id || item.office_name;
                    code.innerText = `node scripts/db_manager.js "${key}" ${phone.replace(/\D/g, '')} ${fax.replace(/\D/g, '')}`;
                }
            };
            
            updateCodeDisplay(String(item.phone || ''), String(item.fax || ''));

            const handleSave = () => {
                const phone = m.querySelector('#sn-ssa-edit-phone').value.trim();
                const fax = m.querySelector('#sn-ssa-edit-fax').value.trim();

                const key = item.id || item.office_name;

                const overrides = GM_getValue('sn_ssa_overrides', {});
                overrides[key] = { phone, fax, timestamp: Date.now() };
                GM_setValue('sn_ssa_overrides', overrides);

                item.phone = phone;
                item.fax = fax;

                updateCodeDisplay(phone, fax);

                app.Core.Utils.showNotification(`Office updated locally.`, { type: 'success' });
                if (onSaveCallback) onSaveCallback(item);
                return { phone, fax };
            };

            save.onclick = () => {
                handleSave();
                save.innerText = 'Saved Locally!';
                save.style.background = '#4CAF50';
                setTimeout(() => { 
                    save.innerText = 'Save Locally';
                    save.style.background = '';
                }, 2000);
            };

            if (push) {
                push.onclick = async () => {
                    const { phone, fax } = handleSave();
                    push.disabled = true;
                    push.innerText = 'Pushing to GitHub...';
                    push.style.opacity = '0.7';

                    const syncKey = item.id || item.office_name;
                    app.Core.SSADataManager.syncToGlobal(syncKey, phone, fax, (success, msg) => {
                        push.disabled = false;
                        if (success) {
                            push.innerText = 'Pushed to Master!';
                            push.style.background = '#4CAF50';
                            app.Core.Utils.showNotification("Master database updated successfully for everyone!", { type: 'success' });

                            const overrides = GM_getValue('sn_ssa_overrides', {});
                            const overrideKey = item.id || item.office_name;
                            if (overrides[overrideKey]) {
                                delete overrides[overrideKey];
                                GM_setValue('sn_ssa_overrides', overrides);
                                const mismatchEl = container.querySelector('.sn-ssa-mismatch');
                                if (mismatchEl) mismatchEl.style.display = 'none';
                                if (item.hasOverride) item.hasOverride = false;
                            }
                        } else {
                            push.innerText = 'Push Failed';
                            push.style.background = '#f44336';
                            alert("Sync Error: " + msg);
                        }
                    });
                };
            }

            if (copyBtn) {
                copyBtn.onclick = () => {
                    navigator.clipboard.writeText(code.innerText);
                    copyBtn.innerText = 'Copied!';
                    setTimeout(() => { copyBtn.innerText = 'Copy Command'; }, 2000);
                };
            }
        },

        /**
         * Resolves the current office selection and opens the editor.
         * @private
         */
        _openEditForCurrentSelection(type, clientId, section, ClientNote) {
            const formData = GM_getValue('cn_form_data_' + clientId, {});
            const selectionId = formData[`${type}_Selection`];
            if (!selectionId) return;

            app.Core.SSADataManager.fetch((db) => {
                const list = db[type];
                if (!list) return;
                const item = list.find(i => String(i.id) === String(selectionId) || i.office_name === selectionId);
                if (item) {
                    this._openEditModal(item, type, app, (updatedItem) => {
                        const phone = updatedItem.phone || '';
                        const fax = updatedItem.fax || '';
                        const codePrefix = updatedItem.id ? `[${updatedItem.id}] ` : '';
                        const displayText = `${codePrefix}${updatedItem.office_name}\n${updatedItem.address || ''}\nPN: ${this._formatPhone(phone)}${fax ? `\nFax: ${this._formatPhone(fax)}` : ''}`;

                        const displayDiv = section.querySelector('.sn-ssa-display');
                        if (displayDiv) displayDiv.innerText = displayText;

                        if (ClientNote) {
                            ClientNote.updateAndSaveData(clientId, { [`${type}_Text`]: displayText });
                        }
                        this._checkMismatch(type, clientId, section);
                    });
                } else {
                    app.Core.Utils.showNotification("Could not load original record for editing.", { type: 'error' });
                }
            });
        },

        /**
         * Checks if the currently selected item has a local override.
         * @private
         */
        _checkMismatch(type, clientId, section) {
            const formData = GM_getValue('cn_form_data_' + clientId, {});
            const selectionId = formData[`${type}_Selection`];
            const mismatchEl = section.querySelector('.sn-ssa-mismatch');
            if (!mismatchEl) return;

            if (!selectionId) {
                mismatchEl.style.display = 'none';
                return;
            }

            const overrides = GM_getValue('sn_ssa_overrides', {});
            const hasOverride = overrides[selectionId] != null;
            mismatchEl.style.display = hasOverride ? 'inline' : 'none';
        },

        /** @private */
        _formatPhone(num) {
            if (!num) return '';
            return app.Core.Utils.formatPhoneNumber(num);
        }
    };

    app.Features.DDSPanel = DDSPanel;
})();
