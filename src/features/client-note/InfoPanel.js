(function () {
    const app = window.CM_App = window.CM_App || {};
    app.Features = app.Features || {};

    /**
     * Renders and manages the "Info" tab within the Client Note interface.
     * Displays core client demographic data (SSN, DOB, Phone, Address) and provides inline editing.
     * Includes integration with the Scraper to pull fresh data from the SSD App page.
     * @namespace app.Features.InfoPanel
     */
    const InfoPanel = {
        /**
         * Attaches event listeners to textareas within the container to dynamically
         * adjust their height as the user types.
         * @param {HTMLElement} container - The DOM element containing the textareas.
         */
        setupAutoResize(container) {
            container.querySelectorAll('.sn-side-textarea').forEach(inp => {
                const adjustHeight = () => {
                    inp.style.height = '1px'; // Reset to calculate exact shrink/grow.
                    inp.style.height = (inp.scrollHeight) + 'px';
                };
                // Run immediately and again after a short delay to handle various rendering timings.
                adjustHeight();
                setTimeout(adjustHeight, 100);
                inp.oninput = adjustHeight;
            });
        },

        /**
         * Generates the HTML for the Info panel and binds edit/save and scraping events.
         * @param {HTMLElement} container - The DOM element where the panel will be rendered.
         * @param {Object} context - An object containing dependencies (clientId, ClientNote, app, etc.).
         */
        render(container, context) {
            const { clientId, w, ClientNote, saveState, app } = context;

            const sidebarData = app.Core.Scraper.getAllPageData();
            const headerData = app.Core.Scraper.getHeaderData();
            const allScrapedData = { ...headerData, ...sidebarData }; // Merge for maximum coverage
            
            const freshData = GM_getValue('cn_' + clientId, {}); // Get latest data
            const formData = GM_getValue('cn_form_data_' + clientId, {}); // Get latest form data
            
            // Check for actual data fields while ignoring metadata
            const isPopulated = formData && Object.keys(formData).some(k => k !== 'timestamp' && k !== 'prefix');

            // Gender/Prefix Toggle in Sidebar Header
            const titleEl = w.querySelector('#sn-panel-title');
            const updateHeaderIcon = (prefix) => {
                if (!titleEl || !titleEl.innerText.includes('Info')) return;
                let icon = '👤';
                let color = '#777';
                if (prefix === 'Mr.') { icon = '♂️'; color = '#1976d2'; }
                else if (prefix === 'Mrs.') { icon = '♀️'; color = '#e91e63'; }
                
                titleEl.innerHTML = `Info <span id="sn-prefix-toggle" style="cursor:pointer; margin-left:8px; font-size:14px; color:${color};" title="Toggle Mr./Mrs.">${icon}</span>`;
                
                const toggleBtn = titleEl.querySelector('#sn-prefix-toggle');
                if (toggleBtn) {
                    toggleBtn.onclick = (e) => {
                        e.stopPropagation();
                        const nextPrefix = (prefix === 'Mr.') ? 'Mrs.' : (prefix === 'Mrs.' ? '' : 'Mr.');
                        ClientNote.updateAndSaveData(clientId, { prefix: nextPrefix });
                    };
                }
            };

            const updateFields = (data) => {
                if (!data) return;
                const fieldMap = {
                    'ssn': 'ssn', 'dob': 'dob', 'Phone': 'phone', 'Address': 'addr',
                    'Email': 'email', 'POB': 'pob', 'Parents': 'parents', 'Witness': 'wit'
                };
                Object.entries(fieldMap).forEach(([dataKey, domId]) => {
                    const el = container.querySelector(`.sn-side-textarea[data-id="${domId}"]`);
                    if (el && data[dataKey] !== undefined) {
                        let finalVal = data[dataKey];
                        if (domId === 'ssn') finalVal = app.Core.Utils.formatSSN(finalVal);
                        el.value = finalVal;
                    }
                });
                this.setupAutoResize(container);
            };

            updateHeaderIcon(formData.prefix || '');

            // Cleanup old listener on this specific window if exists to prevent stacking
            if (w._infoListener) {
                GM_removeValueChangeListener(w._infoListener);
                delete w._infoListener;
            }

            w._infoListener = GM_addValueChangeListener('cn_form_data_' + clientId, (name, old, newVal, remote) => {
                if (newVal) {
                    updateHeaderIcon(newVal.prefix || '');
                    updateFields(newVal);
                }
            });

            const fields = [
                { id: 'ssn', label: 'SSN', val: app.Core.Utils.formatSSN(formData.ssn || freshData.ssn || sidebarData.ssn) },
                { id: 'dob', label: 'DOB', val: formData.dob || freshData.dob || sidebarData.dob },
                { id: 'phone', label: 'Phone', val: formData['Phone'] || freshData.phone || allScrapedData['Phone'] || '' },
                { id: 'addr', label: 'Address', val: formData['Address'] || freshData.address || allScrapedData['Address'] || '' },
                { id: 'email', label: 'Email', val: formData['Email'] || freshData.email || allScrapedData['Email'] || '' },
                { id: 'pob', label: 'POB', val: formData['POB'] || freshData.pob || allScrapedData['POB'] || '' },
                { id: 'parents', label: 'Parents', val: formData['Parents'] || freshData.parents || allScrapedData['Parents'] || '' },
                { id: 'wit', label: 'Witness', val: formData['Witness'] || freshData.witness || allScrapedData['Witness'] || '' }
            ];

            let html = `<div id="sn-info-container" style="padding:10px; background:#f9f9f9; min-height:100%; display:flex; flex-direction:column; box-sizing:border-box;">
                <div style="display:flex; gap:10px; margin-bottom:12px;">
                    <button id="sn-open-ssd-btn" style="flex:1; padding:5px; cursor:pointer; font-weight:bold; background:var(--sn-bg-lighter); border:1px solid var(--sn-border); border-radius:4px; color:var(--sn-primary-dark); white-space:nowrap; display:${isPopulated ? 'none' : 'block'};">Fetch Data</button>
                </div>
                <div style="flex-grow:1;">
            `;

            fields.forEach(f => {
                html += `
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px; border-bottom:1px dashed #ccc; padding-bottom:2px; gap:10px;">
                    <div style="font-weight:bold; color:#555; flex-shrink:0; margin-top:2px; max-width:40%;">${f.label}</div>
                    <textarea class="sn-side-textarea" data-id="${f.id}" readonly rows="1"
                        style="flex-grow:1; text-align:right; border:1px solid transparent; background:transparent; font-family:inherit; padding:2px 4px; color:#333; outline:none; resize:none; overflow:hidden; transition:background 0.2s, border 0.2s;">${f.val || ''}</textarea>
                </div>`;
            });

            html += `
                </div>
            </div>`;
            container.innerHTML = html;

            // Wire up the SSD App Button
            const editBtn = w.querySelector('#sn-info-edit-btn');
            const textareas = container.querySelectorAll('.sn-side-textarea');

            editBtn.onclick = () => {
                const isEditing = editBtn.innerHTML === '💾'; // Using a floppy disk for save

                if (isEditing) {
                    // Save mode -> Readonly mode
                    textareas.forEach(inp => {
                        inp.setAttribute('readonly', true);
                        inp.style.background = 'transparent';
                        inp.style.border = '1px solid transparent';
                    });
                    editBtn.innerHTML = '✏️';
                    editBtn.title = 'Edit Info';

                    // Manually save the form data fields
                    const fieldMap = {
                        'ssn': 'ssn', 'dob': 'dob',
                        'phone': 'Phone', 'addr': 'Address', 'email': 'Email',
                        'pob': 'POB', 'parents': 'Parents', 'wit': 'Witness'
                    };
                    const dataToSave = {};
                    Object.keys(fieldMap).forEach(domId => {
                        const el = container.querySelector(`.sn-side-textarea[data-id="${domId}"]`);
                        if (el) {
                            let valueToSave = el.value;
                            if (domId === 'phone') {
                                valueToSave = el.value.split(/\|\|| - |,|;|\n/).map(p => app.Core.Utils.formatPhoneNumber(p.trim())).filter(Boolean).join('\n');
                                el.value = valueToSave; // update UI with formatted value
                            } else if (domId === 'ssn') {
                                valueToSave = app.Core.Utils.formatSSN(valueToSave);
                                el.value = valueToSave;
                            }
                            dataToSave[fieldMap[domId]] = valueToSave;
                        }
                    });
                    ClientNote.updateAndSaveData(clientId, dataToSave);

                    saveState();
                } else {
                    // Readonly mode -> Edit mode
                    textareas.forEach(inp => {
                        inp.removeAttribute('readonly');
                        inp.style.background = '#fff9c4';
                        inp.style.border = '1px solid #b0bec5';
                        inp.style.borderRadius = '3px';
                    });
                    editBtn.innerHTML = '💾';
                    editBtn.title = 'Save Info';
                    if (textareas.length > 0) textareas[0].focus();
                }
            };

            const ssaBtn = container.querySelector('#sn-open-ssd-btn');
            ssaBtn.onmouseover = () => ssaBtn.style.background = 'var(--sn-bg-light)';
            ssaBtn.onmouseout = () => ssaBtn.style.background = 'var(--sn-bg-lighter)';

            ssaBtn.onclick = () => {
                ssaBtn.disabled = true;
                ssaBtn.innerHTML = 'Fetching<span class="sn-dot-ani"></span>';
                ssaBtn.style.cursor = 'wait';
                ssaBtn.style.opacity = '0.7';
                ssaBtn.style.background = 'var(--sn-bg-lighter)';
                ssaBtn.style.color = 'var(--sn-primary-dark)';
                ssaBtn.style.borderColor = 'var(--sn-border)';

                // clientId is already available in the closure scope from create(clientId)
                const id15 = clientId.substring(0, 15);
                const targetURL = `https://kdcv1.my.site.com/forms/s/?uuid=a0UfL000002vlqfUAA&recordid=${id15}&clientId=${clientId}`;

                // Define a unique key for this scrape event to avoid race conditions and data loss.
                const scrapeListenKey = `cn_scrape_result_${clientId}`;

                // Pre-delete the key so chrome.storage.onChanged ALWAYS fires when the scraper writes.
                // If the key already has data from a prior scrape, the 'set' won't trigger onChanged.
                chrome.storage.local.remove(scrapeListenKey);

                // Set up a one-time listener for when the scraper window finishes.
                // This listener waits for a temporary key to be set.
                const tempListenerId = GM_addValueChangeListener(scrapeListenKey, (name, old_value, new_value, remote) => {
                    if (remote && new_value && Object.keys(new_value).length > 0) {
                        // Reset button state
                        ssaBtn.disabled = false;
                        ssaBtn.innerText = 'Fetch Data';
                        ssaBtn.style.cursor = 'pointer';
                        ssaBtn.style.opacity = '1';

                        // Safely merge and save the new data, then update the UI.
                        ClientNote.updateAndSaveData(clientId, new_value);
                        ClientNote.updateUI(new_value); // Ensure UI reflects the absolute latest data

                        // Close the visible scraper window
                        if (openedWindowId && chrome.runtime?.id) {
                            chrome.runtime.sendMessage({ type: 'CLOSE_WINDOW', windowId: openedWindowId });
                        }

                        // Hide the button
                        const btn = document.getElementById('sn-open-ssd-btn');
                        if (btn) btn.style.display = 'none';

                        // Clean up the temporary listener and the data key.
                        GM_removeValueChangeListener(tempListenerId);
                        GM_deleteValue(scrapeListenKey);
                    }
                });

                // Open a visible popup window (minimized) to handle the scraping process
                let openedWindowId = null;
                // Before attempting to open the scraper window, we verify the extension context is still valid.
                // The 'chrome.runtime.id' property will be undefined if the context (e.g., service worker) has been invalidated.
                if (chrome.runtime?.id) {
                    chrome.runtime.sendMessage({ type: 'OPEN_SCRAPER_WINDOW', url: targetURL }, (response) => {
                        if (response && response.success && response.windowId) {
                            openedWindowId = response.windowId;
                        } else if (response && response.error) {
                            console.error("[Scraper] Window failed to open:", response.error);
                            // If window fails to open, clean up the listener to prevent memory leaks.
                            GM_removeValueChangeListener(tempListenerId);
                            ssaBtn.disabled = false;
                            ssaBtn.innerText = 'Fetch Failed (Retry?)';
                            ssaBtn.style.cursor = 'pointer';
                            ssaBtn.style.opacity = '1';
                            ssaBtn.style.background = '#ffebee';
                        }
                    });
                } else {
                    console.error("[Scraper] Extension context invalidated. Please refresh the page.");
                }

                // Safety reset: If no data after 6s, reset button
                setTimeout(() => {
                    if (ssaBtn.disabled) {
                        ssaBtn.disabled = false;
                        ssaBtn.innerText = 'Fetch Failed (Retry?)';
                        if (openedWindowId && chrome.runtime?.id) {
                            chrome.runtime.sendMessage({ type: 'CLOSE_WINDOW', windowId: openedWindowId });
                        }
                        // Clean up listener on timeout as well.
                        GM_removeValueChangeListener(tempListenerId);
                        ssaBtn.style.cursor = 'pointer';
                        ssaBtn.style.opacity = '1';
                        ssaBtn.style.background = '#ffebee'; 
                        ssaBtn.style.color = '#c62828'; 
                        ssaBtn.style.borderColor = '#ef9a9a';
                    }
                }, 6000);
            };

            this.setupAutoResize(container);
        }
    };

    app.Features.InfoPanel = InfoPanel;
})();
