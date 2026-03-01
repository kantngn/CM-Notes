(function () {
    const app = window.CM_App = window.CM_App || {};
    app.Features = app.Features || {};

    const InfoPanel = {
        setupAutoResize(container) {
            container.querySelectorAll('.sn-side-textarea').forEach(inp => {
                const adjustHeight = () => {
                    inp.style.height = '1px'; // Reset to calculate exact shrink/grow
                    inp.style.height = (inp.scrollHeight) + 'px';
                };
                setTimeout(adjustHeight, 10);
                inp.oninput = adjustHeight;
            });
        },

        render(container, context) {
            const { clientId, w, ClientNote, saveState, app } = context;

            const sidebarData = app.Core.Scraper.getAllPageData();
            const freshData = GM_getValue('cn_' + clientId, {}); // Get latest data
            const formData = GM_getValue('cn_form_data_' + clientId, {}); // Get latest form data
            const isPopulated = formData && Object.keys(formData).length > 0;

            const fields = [
                { id: 'ssn', label: 'SSN', val: formData.ssn || freshData.ssn || sidebarData.ssn },
                { id: 'dob', label: 'DOB', val: formData.dob || freshData.dob || sidebarData.dob },
                { id: 'phone', label: 'Phone', val: formData['Phone'] || freshData.phone || '' },
                { id: 'addr', label: 'Address', val: formData['Address'] || freshData.address || '' },
                { id: 'email', label: 'Email', val: formData['Email'] || freshData.email || '' },
                { id: 'pob', label: 'POB', val: formData['POB'] || freshData.pob || '' },
                { id: 'parents', label: 'Parents', val: formData['Parents'] || freshData.parents || '' },
                { id: 'wit', label: 'Witness', val: formData['Witness'] || freshData.witness || '' }
            ];

            let html = `<div id="sn-info-container" style="padding:10px; background:#f9f9f9; min-height:100%; display:flex; flex-direction:column; box-sizing:border-box;">
                <div style="display:flex; gap:10px; margin-bottom:12px;">
                    <button id="sn-open-ssd-btn" style="flex:1; padding:5px; cursor:pointer; font-weight:bold; background:var(--sn-bg-lighter); border:1px solid var(--sn-border); border-radius:4px; color:var(--sn-primary-dark); white-space:nowrap; display:${isPopulated ? 'none' : 'block'};">Fetch Data</button>
                </div>
                <div style="flex-grow:1;">
            `;

            fields.forEach(f => {
                html += `
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px; border-bottom:1px dashed #ccc; padding-bottom:2px;">
                    <div style="font-weight:bold; color:#555; white-space:nowrap; margin-right:8px; margin-top:2px;">${f.label}</div>
                    <textarea class="sn-side-textarea" data-id="${f.id}" readonly rows="1"
                        style="width:100%; text-align:right; border:1px solid transparent; background:transparent; font-family:inherit; padding:2px 4px; color:#333; outline:none; resize:none; overflow:hidden; transition:background 0.2s, border 0.2s;">${f.val || ''}</textarea>
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
                        'phone': 'Phone', 'addr': 'Address', 'email': 'Email',
                        'pob': 'POB', 'parents': 'Parents', 'wit': 'Witness'
                    };
                    const dataToSave = {};
                    Object.keys(fieldMap).forEach(domId => {
                        const el = container.querySelector(`.sn-side-textarea[data-id="${domId}"]`);
                        if (el) {
                            let valueToSave = el.value;
                            if (domId === 'phone') {
                                valueToSave = el.value.split(/\|\|| - |,|;/).map(p => app.Core.Utils.formatPhoneNumber(p.trim())).filter(Boolean).join(' || ');
                                el.value = valueToSave; // update UI with formatted value
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

                GM_openInTab(targetURL, { active: false, insert: true });

                // Set up a ONE-TIME listener for when the SSD background tab finishes scraping
                const tempListenerId = GM_addValueChangeListener(`cn_form_data_${clientId}`, (name, old_value, new_value, remote) => {
                    if (remote && new_value && Object.keys(new_value).length > 0) {
                        // Reset button state (though it will be hidden by updateUI)
                        ssaBtn.disabled = false;
                        ssaBtn.innerText = 'Fetch Data';
                        ssaBtn.style.cursor = 'pointer';
                        ssaBtn.style.opacity = '1';

                        // Update the Client Note with the scraped data
                        ClientNote.updateUI(new_value);

                        // Hide the button
                        const btn = document.getElementById('sn-open-ssd-btn');
                        if (btn) btn.style.display = 'none';

                        // Clean up this temporary listener after receiving data (only happens once)
                        GM_removeValueChangeListener(tempListenerId);
                    }
                });

                // Safety reset: If no data after 15s, reset button and turn red
                setTimeout(() => {
                    if (ssaBtn.disabled) {
                        ssaBtn.disabled = false;
                        ssaBtn.innerText = 'Fetch Failed (Retry?)';
                        ssaBtn.style.cursor = 'pointer';
                        ssaBtn.style.opacity = '1';
                        ssaBtn.style.background = '#ffebee'; // Light red background
                        ssaBtn.style.color = '#c62828'; // Dark red text
                        ssaBtn.style.borderColor = '#ef9a9a';
                    }
                }, 15000);
            };

            this.setupAutoResize(container);
        }
    };

    app.Features.InfoPanel = InfoPanel;
})();
