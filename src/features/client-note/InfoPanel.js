(function () {
    const app = window.CM_App = window.CM_App || {};
    app.Features = app.Features || {};

    /**
     * Renders and manages the "Info" tab within the Client Note interface.
     * Displays core client demographic data (SSN, DOB, Phone, Address, and record-page fields)
     * and provides inline editing. Record-page sidebar fields (firstName, lastName, cellPhone,
     * pobCity, motherName, fatherName) are scraped via getAllPageData() on note creation/refresh.
     * The Alt+E fetch button only fills Phone, Address, Witness, and ProviderPanel from the SSD form.
     * @namespace app.Features.InfoPanel
     */
    const InfoPanel = {
        /**
         * Checks if a value should be treated as empty/blank.
         * Returns true for null, undefined, empty string, or strings consisting only of zeros.
         * @param {*} val - The value to check.
         * @returns {boolean} True if the value is effectively blank.
         */
        _isBlank(val) {
            if (val === null || val === undefined) return true;
            const s = String(val).trim();
            return s === '' || /^0+$/.test(s);
        },

        /**
         * Calculates the client's current age from their DOB string.
         * Supports MM/DD/YYYY, M/D/YYYY, YYYY-MM-DD, and natural date formats.
         * @param {string} dobStr - The date of birth string.
         * @returns {number|null} The age in years, or null if unparseable.
         */
        _calcAge(dobStr) {
            if (this._isBlank(dobStr)) return null;
            const s = String(dobStr).trim();
            if (!s) return null;

            let dobDate = null;

            // Try MM/DD/YYYY or M/D/YYYY
            const slashMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
            if (slashMatch) {
                dobDate = new Date(+slashMatch[3], +slashMatch[1] - 1, +slashMatch[2]);
            }

            // Try YYYY-MM-DD
            if (!dobDate) {
                const dashMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
                if (dashMatch) {
                    dobDate = new Date(+dashMatch[1], +dashMatch[2] - 1, +dashMatch[3]);
                }
            }

            // Fallback: let Date.parse() try natural formats ("Jan 15, 1980", etc.)
            if (!dobDate) {
                dobDate = new Date(s);
            }

            if (!dobDate || isNaN(dobDate.getTime())) return null;

            const today = new Date();
            let age = today.getFullYear() - dobDate.getFullYear();
            const monthDiff = today.getMonth() - dobDate.getMonth();
            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dobDate.getDate())) {
                age--;
            }
            return age;
        },

        /**
         * Determines if the client's birthday is today or upcoming (within 7 days).
         * Parses DOB using the same formats as _calcAge.
         * @param {string} dobStr - The date of birth string.
         * @returns {string|null} 'today', 'upcoming', or null.
         */
        _getBirthdayStatus(dobStr) {
            if (this._isBlank(dobStr)) return null;
            const s = String(dobStr).trim();
            if (!s) return null;

            let dobDate = null;
            const slashMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
            if (slashMatch) {
                dobDate = new Date(+slashMatch[3], +slashMatch[1] - 1, +slashMatch[2]);
            }
            if (!dobDate) {
                const dashMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
                if (dashMatch) {
                    dobDate = new Date(+dashMatch[1], +dashMatch[2] - 1, +dashMatch[3]);
                }
            }
            if (!dobDate) {
                dobDate = new Date(s);
            }
            if (!dobDate || isNaN(dobDate.getTime())) return null;

            const today = new Date();
            const thisYear = today.getFullYear();

            // Normalise today to midnight for accurate day comparison
            const todayMidnight = new Date(thisYear, today.getMonth(), today.getDate());

            // This year's birthday at midnight
            const thisBday = new Date(thisYear, dobDate.getMonth(), dobDate.getDate());
            // Next year's birthday (for year-end wrap)
            const nextBday = new Date(thisYear + 1, dobDate.getMonth(), dobDate.getDate());

            const msPerDay = 86400000;
            let daysUntil = Math.ceil((thisBday - todayMidnight) / msPerDay);
            if (daysUntil < 0) {
                daysUntil = Math.ceil((nextBday - todayMidnight) / msPerDay);
            }

            if (daysUntil === 0) return 'today';
            if (daysUntil <= 7) return 'upcoming';
            return null;
        },

        /**
         * Attaches event listeners to textareas within the container to dynamically
         * adjust their height as the user types.
         * @param {HTMLElement} container - The DOM element containing the textareas.
         */
        setupAutoResize(container) {
            container.querySelectorAll('.sn-side-textarea').forEach(inp => {
                const adjustHeight = () => {
                    inp.style.height = '1px'; // Reset to calculate exact shrink/grow.
                    // scrollHeight includes content + padding but NOT border.
                    // With box-sizing:border-box (the textarea default), the border
                    // takes space from the content area — so we must add border height
                    // to scrollHeight to prevent clipping the bottom row.
                    const borderTop = parseFloat(getComputedStyle(inp).borderTopWidth) || 0;
                    const borderBottom = parseFloat(getComputedStyle(inp).borderBottomWidth) || 0;
                    inp.style.height = (inp.scrollHeight + borderTop + borderBottom) + 'px';
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
                    'Email': 'email', 'POB': 'pob', 'Parents': 'parents', 'Witness': 'wit',
                    'firstName': 'firstName', 'lastName': 'lastName',
                    'cellPhone': 'cellPhone',
                    'pobCity': 'pobCity',
                    'motherName': 'motherName', 'fatherName': 'fatherName'
                };
                Object.entries(fieldMap).forEach(([dataKey, domId]) => {
                    const el = container.querySelector(`.sn-side-textarea[data-id="${domId}"]`);
                    if (el) {
                        let finalVal = data[dataKey];

                        // If Witness is locked, skip DOM update to preserve user's manually
                        // entered or previously saved value from being overwritten by
                        // SSD form scrape or raw data refreshes.
                        if (domId === 'wit' && GM_getValue('cn_wit_lock_' + clientId, false)) {
                            return;
                        }

                        // Skip zero-only values
                        if (InfoPanel._isBlank(finalVal)) {
                            el.value = '';
                        } else {
                            if (domId === 'ssn') finalVal = app.Core.Utils.formatSSN(finalVal);
                            el.value = finalVal;
                        }
                    }
                    // Update age display and birthday effects when dob changes
                    if (domId === 'dob') {
                        const ageSpan = container.querySelector('#sn-dob-age');
                        const newAge = InfoPanel._calcAge(data[dataKey]);
                        const newStatus = InfoPanel._getBirthdayStatus(data[dataKey]);
                        if (ageSpan) {
                            ageSpan.textContent = newAge !== null ? newAge + ' YO' : '';
                            // Update birthday effect classes
                            ageSpan.classList.remove('sn-dob-age-upcoming', 'sn-dob-age-today');
                            if (newStatus === 'today') {
                                ageSpan.classList.add('sn-dob-age-today');
                            } else if (newStatus === 'upcoming') {
                                ageSpan.classList.add('sn-dob-age-upcoming');
                            }
                        }
                    }
                });
                requestAnimationFrame(() => this.setupAutoResize(container));
            };

            updateHeaderIcon(formData.prefix || '');

            // Cleanup old listeners on this specific window if exists to prevent stacking
            if (w._infoListener) {
                GM_removeValueChangeListener(w._infoListener);
                delete w._infoListener;
            }
            if (w._infoRawListener) {
                GM_removeValueChangeListener(w._infoRawListener);
                delete w._infoRawListener;
            }

            w._infoListener = GM_addValueChangeListener('cn_form_data_' + clientId, (name, old, newVal, remote) => {
                if (newVal) {
                    updateHeaderIcon(newVal.prefix || '');
                    // Always prioritize fresh data, especially SSN & DOB
                    const mergedData = { ...old, ...newVal };
                    updateFields(mergedData);
                }
            });

            // Watch for refreshes from scraper - when 'cn_' + clientId changes (raw data), also update
            w._infoRawListener = GM_addValueChangeListener('cn_' + clientId, (name, old, newVal, remote) => {
                if (newVal) {
                    // Merge with form data so fields not present in raw scraped data
                    // (Phone, Address, Email, POB, Parents, Witness, etc.) are not cleared.
                    // Raw data from getAllPageData() only has ssn, dob, firstName, lastName,
                    // cellPhone, pobCity, motherName, fatherName — merging preserves the rest.
                    const currentFormData = GM_getValue('cn_form_data_' + clientId, {});
                    const merged = { ...currentFormData, ...newVal };
                    updateFields(merged);
                }
            });

            // Helper: returns the first non-blank value from the given sources
            const firstVal = (...sources) => {
                for (const src of sources) {
                    if (!InfoPanel._isBlank(src)) return src;
                }
                return '';
            };

            // Dedup phone numbers: remove Phone numbers that also appear in Witness field
            const rawPhone = firstVal(formData['Phone'], freshData.phone, allScrapedData['Phone']);
            const rawWitness = firstVal(formData['Witness'], freshData.witness, allScrapedData['Witness']);
            const _normPhone = p => p.replace(/\D/g, '');
            const witnessPhoneDigits = (rawWitness.match(/(?:\d{3}[-.\s]?\d{3}[-.\s]?\d{4})|(?:\(\d{3}\)\s?\d{3}[-.\s]?\d{4})/g) || [])
                .map(m => _normPhone(m.trim()));
            const dedupedPhone = rawPhone.split(/\n|,| - /)
                .map(p => p.trim())
                .filter(p => p && /\d/.test(p) && !InfoPanel._isBlank(p) && !witnessPhoneDigits.includes(_normPhone(p)))
                .join('\n');

            // Compute age and birthday status from DOB
            const dobVal = firstVal(formData.dob, freshData.dob, sidebarData.dob);
            const age = InfoPanel._calcAge(dobVal);
            const bdayStatus = InfoPanel._getBirthdayStatus(dobVal);

            // Witness lock state — persists across refreshes so user can override SSD form scrape
            const witLocked = !!GM_getValue('cn_wit_lock_' + clientId, false);

            const fields = [
                { id: 'ssn', label: 'SSN', val: app.Core.Utils.formatSSN(firstVal(formData.ssn, freshData.ssn, sidebarData.ssn)) },
                { id: 'dob', label: 'DOB', val: dobVal, age: age, bdayStatus: bdayStatus },
                { id: 'phone', label: 'Phone', val: dedupedPhone || rawPhone },
                { id: 'addr', label: 'Address', val: firstVal(formData['Address'], freshData.address, allScrapedData['Address']) },
                { id: 'email', label: 'Email', val: firstVal(formData['Email'], freshData.email, allScrapedData['Email']) },
                { id: 'pob', label: 'POB', val: firstVal(formData['POB'], freshData.pob, allScrapedData['POB']) },
                { id: 'parents', label: 'Parents', val: firstVal(formData['Parents'], freshData.parents, allScrapedData['Parents']) },
                { id: 'wit', label: 'Witness', val: firstVal(formData['Witness'], freshData.witness, allScrapedData['Witness']), locked: witLocked }
            ];

            let html = `<div id="sn-info-container" style="padding:10px; background:#f9f9f9; min-height:100%; display:flex; flex-direction:column; box-sizing:border-box;">
                <style>
                    @keyframes sn-bday-glow {
                        0%, 100% { text-shadow: 0 0 3px #2196f3, 0 0 8px #2196f3; color:#64b5f6; }
                        50% { text-shadow: 0 0 10px #2196f3, 0 0 20px #2196f3, 0 0 30px #2196f3; color:#90caf9; }
                    }
                    @keyframes sn-bday-rainbow {
                        0% { color:#ff0000; text-shadow:0 0 4px #ff0000; }
                        14% { color:#ff8800; text-shadow:0 0 4px #ff8800; }
                        28% { color:#ffff00; text-shadow:0 0 4px #ffff00; }
                        42% { color:#00ff00; text-shadow:0 0 4px #00ff00; }
                        57% { color:#0088ff; text-shadow:0 0 4px #0088ff; }
                        71% { color:#8800ff; text-shadow:0 0 4px #8800ff; }
                        85% { color:#ff00ff; text-shadow:0 0 4px #ff00ff; }
                        100% { color:#ff0000; text-shadow:0 0 4px #ff0000; }
                    }
                    .sn-dob-age-upcoming {
                        animation: sn-bday-glow 2s ease-in-out infinite;
                        font-weight:bold !important;
                    }
                    .sn-dob-age-today {
                        animation: sn-bday-rainbow 3s linear infinite;
                        font-weight:bold !important;
                    }
                </style>
                <div style="flex-grow:1;">
            `;

            fields.forEach(f => {
                let labelHtml = f.label;
                if (f.id === 'dob' && f.age !== null && f.age !== undefined) {
                    const extraClass = f.bdayStatus === 'today' ? ' sn-dob-age-today'
                        : f.bdayStatus === 'upcoming' ? ' sn-dob-age-upcoming'
                        : '';
                    const baseStyle = 'color:gray;font-weight:normal;font-size:0.85em;';
                    labelHtml = `DOB <span id="sn-dob-age" style="${baseStyle}" class="${extraClass.trim()}">${f.age} YO</span>`;
                }
                if (f.id === 'wit') {
                    const lockIcon = f.locked ? '🔒' : '🔓';
                    const lockTitle = f.locked
                        ? 'Unlock Witness (allow updates from SSD form)'
                        : 'Lock Witness (prevent overwrites from SSD form)';
                    labelHtml = `Witness <span class="sn-wit-lock-btn" data-client-id="${clientId}" style="cursor:pointer; font-size:13px; margin-left:4px; user-select:none;" title="${lockTitle}">${lockIcon}</span>`;
                }
                html += `
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px; border-bottom:1px dashed #ccc; padding-bottom:2px; gap:10px;">
                    <div style="font-weight:bold; color:#555; flex-shrink:0; margin-top:2px; max-width:40%;">${labelHtml}</div>
                    <textarea class="sn-side-textarea" data-id="${f.id}" readonly rows="1"
                        style="flex-grow:1; text-align:right; border:1px solid transparent; background:transparent; font-family:inherit; padding:2px 4px; color:#333; outline:none; resize:none; overflow:hidden; transition:background 0.2s, border 0.2s;">${f.val || ''}</textarea>
                </div>`;
            });

            html += `
                </div>
            </div>`;
            container.innerHTML = html;

            // Wire up Witness lock toggle
            const witLockBtn = container.querySelector('.sn-wit-lock-btn');
            if (witLockBtn) {
                witLockBtn.onclick = (e) => {
                    e.stopPropagation();
                    const cId = witLockBtn.dataset.clientId;
                    const currentlyLocked = !!GM_getValue('cn_wit_lock_' + cId, false);
                    const newLocked = !currentlyLocked;
                    GM_setValue('cn_wit_lock_' + cId, newLocked);
                    witLockBtn.textContent = newLocked ? '🔒' : '🔓';
                    witLockBtn.title = newLocked
                        ? 'Unlock Witness (allow updates from SSD form)'
                        : 'Lock Witness (prevent overwrites from SSD form)';
                };
            }

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
                                // Format SSN as xxx-xx-xxxx
                                valueToSave = valueToSave.replace(/\D/g, '').replace(/^(\d{3})(\d{2})(\d{4})$/, '$1-$2-$3');
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

            this.setupAutoResize(container);

            // Deferred re-populate: handles the race condition where InfoPanel.render() is
            // called before fillForm() (setTimeout 0) has written cn_form_data_* to storage.
            // If SSN & DOB are still blank after the initial render, re-read storage and refresh.
            setTimeout(() => {
                const ssnEl = container.querySelector('.sn-side-textarea[data-id="ssn"]');
                const dobEl = container.querySelector('.sn-side-textarea[data-id="dob"]');
                if (ssnEl && dobEl && !ssnEl.value && !dobEl.value) {
                    const latestFormData = GM_getValue('cn_form_data_' + clientId, {});
                    const latestCnData = GM_getValue('cn_' + clientId, {});
                    // Merge both stores so we always show something
                    const merged = { ...latestCnData, ...latestFormData };
                    if (merged.ssn || merged.dob) {
                        updateFields(merged);
                    }
                }
            }, 150);
        }
    };

    app.Features.InfoPanel = InfoPanel;
})();
