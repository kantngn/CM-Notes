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
                                <button class="sn-ssa-search-btn" style="cursor:pointer; background:var(--sn-bg-lighter); border:1px solid var(--sn-border); border-radius:3px; font-size:10px; padding:1px 5px;">🔍</button>
                                <button class="sn-ssa-clear-btn" style="cursor:pointer; background:#ffebee; border:1px solid #ef5350; border-radius:3px; font-size:10px; padding:1px 5px;">✕</button>
                            </div>
                        </div>
                        <div class="sn-ssa-display" style="background:#fff; border:1px solid #ccc; padding:5px; font-size:inherit; min-height:1.2em; white-space:pre-wrap; color:#333;">${formData.FO_Text || ''}</div>
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
                        <div class="sn-ssa-display" style="background:#fff; border:1px solid #ccc; padding:5px; font-size:inherit; min-height:1.2em; white-space:pre-wrap; color:#333;">${formData.DDS_Text || ''}</div>
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

                if (type === 'DDS') updateDDSUI(formData.DDS_Text, section);

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
                                const displayText = type === 'FO' ? `${item.location}\n${item.fullAddress}\nPN: ${phone}\nFax: ${fax}` : `${item.name}\nPN: ${phone}` + (fax ? `\nFax (??): ${fax}` : '');

                                ClientNote.updateAndSaveData(clientId, { [`${type}_Selection`]: saveVal, [`${type}_Text`]: displayText });
                                displayDiv.innerText = displayText;
                                if (type === 'DDS') updateDDSUI(displayText, section);

                                // Close search
                                searchBox.style.display = 'none';
                                displayDiv.style.display = 'block';
                                searchBtn.innerText = "🔍";
                            };
                            resultsDiv.appendChild(row);
                        });
                    });
                };

                searchBtn.onclick = () => {
                    if (searchBox.style.display === 'none') {
                        searchBox.style.display = 'block';
                        displayDiv.style.display = 'none';
                        input.value = state;
                        input.select();
                        searchBtn.innerText = "Go";
                        if (state) performSearch();
                    } else {
                        performSearch();
                    }
                };

                input.onkeydown = (e) => {
                    if (e.key === 'Enter') performSearch();
                    if (e.key === 'Escape') {
                        searchBox.style.display = 'none';
                        displayDiv.style.display = 'block';
                        searchBtn.innerText = "🔍";
                    }
                };

                clearBtn.onclick = () => {
                    if (confirm(`Clear ${type}?`)) {
                        displayDiv.innerText = "";
                        ClientNote.updateAndSaveData(clientId, { [`${type}_Selection`]: "", [`${type}_Text`]: "" });
                        if (type === 'DDS') updateDDSUI("", section);
                        searchBox.style.display = 'none';
                        displayDiv.style.display = 'block';
                        searchBtn.innerText = "🔍";
                    }
                };
            });
        }
    };

    app.Features.SSAPanel = SSAPanel;
})();
