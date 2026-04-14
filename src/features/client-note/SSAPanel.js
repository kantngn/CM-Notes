(function () {
    const app = window.CM_App = window.CM_App || {};
    app.Features = app.Features || {};

    /**
     * Renders and manages the "SSA" tab within the Client Note interface.
     * Provides search functionality for Field Offices (FO) and Disability Determination Services (DDS).
     * Integrates with `SSADataManager` to query the static database.
     * @namespace app.Features.SSAPanel
     */
    const SSAPanel = {
        /**
         * Generates the HTML for the SSA panel and binds search, clear, and note-saving events.
         * Dynamically updates the UI based on specific DDS selections (e.g., showing external links for TX/MI/SC/VA).
         * @param {HTMLElement} container - The DOM element where the panel will be rendered.
         * @param {Object} context - An object containing dependencies (clientId, w, ClientNote, app).
         */
        render(container, context) {
            const { clientId, w, ClientNote, app } = context;

            const formData = GM_getValue('cn_form_data_' + clientId, {});
            const state = w.querySelector('#sn-state').innerText || '';

            container.innerHTML = `
                <div style="padding:10px; display:flex; flex-direction:column; gap:15px;">
                    <!-- FO Section -->
                    <div class="sn-ssa-section" data-type="FO">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2px; border-bottom:1px solid #ccc; padding-bottom:2px;">
                            <span style="font-weight:bold; color:var(--sn-primary-text);">Field Office (FO)</span>
                            <div style="display:flex; gap:2px; align-items:center;">
                                <button class="sn-ssa-nearest-btn" style="cursor:pointer; background:#e8f5e9; border:1px solid #4CAF50; border-radius:3px; font-size:10px; padding:1px 5px; color:#2E7D32;" title="Find nearest FO offices to client">📍</button>
                                <button class="sn-ssa-search-btn" style="cursor:pointer; background:var(--sn-bg-lighter); border:1px solid var(--sn-border); border-radius:3px; font-size:10px; padding:1px 5px;">🔍</button>
                                <button class="sn-ssa-clear-btn" style="cursor:pointer; background:#ffebee; border:1px solid #ef5350; border-radius:3px; font-size:10px; padding:1px 5px;">✕</button>
                            </div>
                        </div>
                        <div class="sn-ssa-edit-container" style="position:relative; display:${formData.FO_Text ? 'block' : 'none'};">
                            <div class="sn-ssa-display" style="background:#fff; border:1px solid #ccc; padding:5px; font-size:inherit; min-height:1.2em; white-space:pre-wrap; color:#333; margin-bottom:0;">${formData.FO_Text || ''}</div>
                            <div class="sn-ssa-edit-active" style="position:absolute; bottom:2px; right:5px; font-size:9px; cursor:pointer; color:var(--sn-primary-text); opacity:0.6;" title="Edit this office's contact info">
                                <span class="sn-ssa-mismatch" style="color:#f44336; font-weight:bold; margin-right:2px; display:none;">!</span>(edit)
                            </div>
                        </div>
                        <div class="sn-ssa-search-box" style="display:none;">
                            <input type="text" class="sn-ssa-input" style="width:100%; border:1px solid var(--sn-border); padding:4px; font-size:11px; box-sizing:border-box; margin-bottom:5px;" placeholder="Enter State...">
                            <div class="sn-ssa-results" style="border:1px solid var(--sn-bg-light); max-height:150px; overflow-y:auto; background:white; display:none;"></div>
                        </div>
                        <textarea id="sn-fo-note" placeholder="FO Notes..." style="width:100%; height:40px; border:1px solid #ccc; font-family:inherit; font-size:inherit; margin-top:5px; resize:vertical; box-sizing: border-box;">${formData.FO_Note || ''}</textarea>
                    </div>

                    <!-- DDS Section -->
                    <div class="sn-ssa-section" data-type="DDS">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2px; border-bottom:1px solid #ccc; padding-bottom:2px;">
                            <span style="font-weight:bold; color:var(--sn-primary-text);">DDS Office</span>
                            <div style="display:flex; gap:2px; align-items:center;">
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
                            <input type="text" class="sn-ssa-input" style="width:100%; border:1px solid var(--sn-border); padding:4px; font-size:11px; box-sizing:border-box; margin-bottom:5px;" placeholder="Enter State...">
                            <div class="sn-ssa-results" style="border:1px solid var(--sn-bg-light); max-height:150px; overflow-y:auto; background:white; display:none;"></div>
                        </div>
                        <textarea id="sn-dds-note" placeholder="DDS Notes..." style="width:100%; height:40px; border:1px solid #ccc; font-family:inherit; font-size:inherit; margin-top:5px; resize:vertical; box-sizing: border-box;">${formData.DDS_Note || ''}</textarea>
                    </div>
                </div>
            `;

            // Add listener for FO Note
            const foNote = container.querySelector('#sn-fo-note');
            if (foNote) {
                let _foTimer;
                foNote.oninput = () => {
                    clearTimeout(_foTimer);
                    _foTimer = setTimeout(() => {
                        ClientNote.updateAndSaveData(clientId, { FO_Note: foNote.value });
                    }, 300);
                };
            }

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

            const updateDDSUI = (text, sectionElement) => {
                if (sectionElement.getAttribute('data-type') !== 'DDS') return;

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

            container.querySelectorAll('.sn-ssa-section').forEach(section => {
                const type = section.getAttribute('data-type');
                const searchBtn = section.querySelector('.sn-ssa-search-btn');
                const clearBtn = section.querySelector('.sn-ssa-clear-btn');
                const displayDiv = section.querySelector('.sn-ssa-display');
                const searchBox = section.querySelector('.sn-ssa-search-box');
                const input = section.querySelector('.sn-ssa-input');
                const resultsDiv = section.querySelector('.sn-ssa-results');
                const editContainer = section.querySelector('.sn-ssa-edit-container');
                const editTrigger = section.querySelector('.sn-ssa-edit-active');

                if (type === 'DDS') updateDDSUI(formData.DDS_Text, section);

                if (editTrigger) {
                    editTrigger.onclick = () => this._openEditForCurrentSelection(type, clientId, section);
                    // Initial mismatch check
                    this._checkMismatch(type, clientId, section);
                }

                // Wire up the "Find Nearest" button (FO section only)
                const nearestBtn = section.querySelector('.sn-ssa-nearest-btn');
                if (nearestBtn && type === 'FO') {
                    nearestBtn.onclick = () => {
                        // Read address from saved form data, then fall back to fresh scraped data
                        const savedData = GM_getValue('cn_form_data_' + clientId, {});
                        const freshData = GM_getValue('cn_' + clientId, {});
                        const clientAddr = (savedData['Address'] || freshData.address || '').trim();

                        if (!clientAddr) {
                            nearestBtn.style.background = '#ffebee';
                            nearestBtn.title = 'No client address found — populate Info tab first';
                            setTimeout(() => { nearestBtn.style.background = '#e8f5e9'; nearestBtn.title = 'Find nearest FO offices to client'; }, 2000);
                            return;
                        }

                        if (app.Features.NearestOffice) {
                            app.Features.NearestOffice.create(clientAddr, state, clientId);
                        }
                    };
                }

                let deleteConfirm = false;

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

                            const label = type === 'FO' ? `<b>${item.location}</b><br>PN: ${phone} | Fax: ${fax}` : `<b>${item.name}</b><br>PN: ${phone}` + (fax ? ` | Fax (??): ${fax}` : '');
                            row.innerHTML = label;

                            row.onclick = () => {
                                const saveVal = type === 'FO' ? item.id : item.name;
                                const displayText = type === 'FO' ? `${item.location}\n${item.fullAddress}\nPN: ${this._formatPhone(phone)}\nFax: ${this._formatPhone(fax)}` : `${item.name}\nPN: ${this._formatPhone(phone)}` + (fax ? `\nFax (??): ${this._formatPhone(fax)}` : '');

                                ClientNote.updateAndSaveData(clientId, { [`${type}_Selection`]: saveVal, [`${type}_Text`]: displayText });
                                displayDiv.innerText = displayText;
                                if (editContainer) editContainer.style.display = 'block';
                                this._checkMismatch(type, clientId, section);
                                if (type === 'DDS') updateDDSUI(displayText, section);

                                // Close search
                                searchBox.style.display = 'none';
                                if (editContainer) editContainer.style.display = 'block';
                                searchBtn.innerText = "🔍";

                                deleteConfirm = false;
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
                        deleteConfirm = false;
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

                        // FO: Show nearest 5 as default results
                        if (type === 'FO') {
                            this._showNearestDefaults(clientId, state, resultsDiv, displayDiv, searchBox, searchBtn, clearBtn, section, ClientNote);
                        } else if (state) {
                            performSearch();
                        }
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

                        deleteConfirm = false;
                        clearBtn.style.backgroundColor = '#ffebee';
                        clearBtn.style.color = '';
                        clearBtn.innerText = "✕";
                        return;
                    }

                    if (!deleteConfirm) {
                        deleteConfirm = true;
                        clearBtn.style.backgroundColor = '#ef5350';
                        clearBtn.style.color = 'white';
                        clearBtn.innerText = "Delete?";
                    } else {
                        displayDiv.innerText = "";
                        if (editContainer) editContainer.style.display = 'none';
                        ClientNote.updateAndSaveData(clientId, { [`${type}_Selection`]: "", [`${type}_Text`]: "" });
                        if (type === 'DDS') updateDDSUI("", section);

                        deleteConfirm = false;
                        clearBtn.style.backgroundColor = '#ffebee';
                        clearBtn.style.color = '';
                        clearBtn.innerText = "✕";
                    }
                };
            });
        },

        /**
         * Shows the nearest 5 FO offices as default search results when
         * the FO search box is opened, with distances from client address.
         * @private
         */
        async _showNearestDefaults(clientId, state, resultsDiv, displayDiv, searchBox, searchBtn, clearBtn, section, ClientNote) {
            const calc = app.Core.DistanceCalculator;
            if (!calc) return;

            // Read client address from saved data
            const savedData = GM_getValue('cn_form_data_' + clientId, {});
            const freshData = GM_getValue('cn_' + clientId, {});
            const clientAddr = (savedData['Address'] || freshData.address || '').trim();

            if (!clientAddr) {
                // No address — fall back to regular state search
                resultsDiv.style.display = 'block';
                resultsDiv.innerHTML = '<div style="padding:5px; color:#888; font-size:11px;">📍 No client address for distance sort.<br>Type a state or city to search.</div>';
                return;
            }

            // Show loading state
            resultsDiv.style.display = 'block';
            resultsDiv.innerHTML = '<div style="padding:8px; color:#888; font-size:11px;"><span class="sn-dot-ani">Finding nearest offices</span></div>';

            try {
                // Geocode client location using ZIP code only
                const zipMatch = clientAddr.match(/\b(\d{5})(?:-\d{4})?\b/);
                const zip = zipMatch ? zipMatch[1] : null;

                let clientCoords = null;
                if (zip) {
                    clientCoords = await calc.geocodeAddress(zip);
                }

                if (!clientCoords) {
                    resultsDiv.innerHTML = '<div style="padding:5px; color:#888; font-size:11px;">Could not geocode ZIP code. Type a state to search.</div>';
                    return;
                }

                // Fetch geocoded database
                const geoDb = await new Promise(resolve => app.Core.SSADataManager.fetchGeo(resolve));
                if (!geoDb || !geoDb.FO) {
                    resultsDiv.innerHTML = '<div style="padding:5px; color:#888;">Database unavailable. Type to search.</div>';
                    return;
                }

                // Find nearest
                const nearest = calc.findNearest(clientCoords.lat, clientCoords.lng, state, geoDb.FO, 5);
                if (nearest.length === 0) {
                    resultsDiv.innerHTML = '<div style="padding:5px; color:#888;">No offices found nearby.</div>';
                    return;
                }

                // Render results with distance
                resultsDiv.innerHTML = '<div style="padding:3px 5px; font-size:9px; color:var(--sn-primary-text); font-weight:bold; border-bottom:1px solid #eee;">📍 NEAREST TO CLIENT</div>';
                nearest.forEach(result => {
                    const office = result.office;
                    const row = document.createElement('div');
                    row.style.cssText = 'padding:5px; border-bottom:1px solid #eee; cursor:pointer; transition:background 0.2s;';
                    row.onmouseover = () => row.style.background = 'var(--sn-bg-lighter)';
                    row.onmouseout = () => row.style.background = 'white';

                    const dist = result.distanceMiles.toFixed(1);
                    const phone = office.phone || '';
                    const fax = office.fax || '';

                    row.innerHTML = `<b>${office.office_name}</b> <span style="color:var(--sn-primary-text); font-size:10px; float:right;">${dist} mi</span><br><span style="font-size:10px;">PN: ${phone} | Fax: ${fax}</span>`;
                    row.onclick = () => {
                        const displayText = `${office.office_name}\n${office.address}, ${office.zip}\nPN: ${phone}\nFax: ${fax}`;
                        ClientNote.updateAndSaveData(clientId, { FO_Selection: office.id, FO_Text: displayText });
                        displayDiv.innerText = displayText;

                        const editContainer = section.querySelector('.sn-ssa-edit-container');
                        if (editContainer) editContainer.style.display = 'block';
                        this._checkMismatch(FO_Selection, clientId, section);

                        // Close search
                        searchBox.style.display = 'none';
                        if (editContainer) editContainer.style.display = 'block';
                        searchBtn.innerText = '🔍';
                        clearBtn.style.backgroundColor = '#ffebee';
                        clearBtn.style.color = '';
                        clearBtn.innerText = '✕';
                    };
                    resultsDiv.appendChild(row);
                });
            } catch (err) {
                console.error('[SSAPanel] Nearest defaults error:', err);
                resultsDiv.innerHTML = '<div style="padding:5px; color:#888;">Type a state or city to search.</div>';
            }
        },

        /**
         * Opens a floating modal to edit an office's phone/fax locally.
         * Generates a sync command for the master database.
         * @private
         */
        _openEditModal(item, type, app) {
            const modalId = 'sn-ssa-edit-modal';
            const existing = document.getElementById(modalId);
            if (existing) existing.remove();

            const m = document.createElement('div');
            m.id = modalId;
            m.className = 'sn-window';
            m.style.cssText = 'width:320px; padding:15px; top:150px; left:300px; background:#fff; box-shadow:0 10px 30px rgba(0,0,0,0.5); z-index:11000; font-family:"Segoe UI",sans-serif;';

            const name = item.location || item.name;
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
                    code.innerText = `node scripts/db_manager.js ${item.id} ${phone.replace(/\D/g, '')} ${fax.replace(/\D/g, '')}`;
                }
            };
            
            // Initial CLI command
            updateCodeDisplay(String(item.phone || ''), String(item.fax || ''));

            const handleSave = () => {
                const phone = m.querySelector('#sn-ssa-edit-phone').value.trim();
                const fax = m.querySelector('#sn-ssa-edit-fax').value.trim();

                // Save to local overrides
                const overrides = GM_getValue('sn_ssa_overrides', {});
                overrides[item.id] = { phone, fax, timestamp: Date.now() };
                GM_setValue('sn_ssa_overrides', overrides);

                // Update in-memory cache directly
                item.phone = phone;
                item.fax = fax;

                updateCodeDisplay(phone, fax);

                app.Core.Utils.showNotification(`Office updated locally.`, { type: 'success' });
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

                    app.Core.SSADataManager.syncToGlobal(item.id, phone, fax, (success, msg) => {
                        push.disabled = false;
                        if (success) {
                            push.innerText = 'Pushed to Master!';
                            push.style.background = '#4CAF50';
                            app.Core.Utils.showNotification("Master database updated successfully for everyone!", { type: 'success' });
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
        _openEditForCurrentSelection(type, clientId, section) {
            const formData = GM_getValue('cn_form_data_' + clientId, {});
            const selectionId = formData[`${type}_Selection`];
            if (!selectionId) return;

            app.Core.SSADataManager.fetch((db) => {
                const list = db[type];
                if (!list) return;
                const item = list.find(i => (type === 'FO' ? String(i.id) === String(selectionId) : i.name === selectionId));
                if (item) {
                    this._openEditModal(item, type, app, () => {
                        // Callback after close/sync
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

    app.Features.SSAPanel = SSAPanel;
})();
