(function () {
    const app = window.CM_App = window.CM_App || {};
    app.Features = app.Features || {};

    /**
     * Renders and manages the "Info" tab within the Client Note interface.
     * Displays core client demographic data (SSN, DOB, Phone, Address, and record-page fields)
     * and provides inline editing. Record-page sidebar fields are scraped via harvestFields()
     * on note creation/refresh. The Alt+E fetch button only fills Phone, Address, Witness, and
     * ProviderPanel from the SSD form.
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
         * Builds HTML for the phone content div with individual tel: links per line.
         * Lines with "Label: number" format get the label as plain text and the number
         * wrapped in its own <a href="tel:...">. Plain-number lines also get linked.
         * @param {string} phoneVal - The raw phone value (may be multi-line).
         * @returns {string} HTML string with linked phone numbers.
         */
        _buildPhoneHTML(phoneVal) {
            if (!phoneVal) return '';
            const cleaned = String(phoneVal).trim();
            if (/^(0+|n\/?a)$/i.test(cleaned)) return '';
            const phoneLines = cleaned.split('\n').filter(Boolean);
            const hasLabels = phoneLines.some(l => l.includes(':'));
            if (hasLabels) {
                // Sub-row format: each labeled line gets its own row
                return phoneLines.map(line => {
                    const colonIdx = line.indexOf(':');
                    if (colonIdx > 0) {
                        const subLabel = line.substring(0, colonIdx).trim();
                        let number = line.substring(colonIdx + 1).trim();
                        // Extract trailing suffix like (WN) for gray label display
                        let suffix = '';
                        const suffixMatch = number.match(/\s*\((WN)\)\s*$/i);
                        if (suffixMatch) {
                            suffix = suffixMatch[0].trim();
                            number = number.slice(0, -suffix.length).trim();
                        }
                        const digits = number.replace(/\D/g, '');
                        const telLink = digits.length >= 7
                            ? `<a href="tel:${digits}" style="color:#1976d2;text-decoration:none;" title="Click to call ${number}">${number}</a>`
                            : number;
                        const suffixHtml = suffix
                            ? ` <span style="color:#aaa;font-size:10px;">${suffix}</span>`
                            : '';
                        return `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2px; border-bottom:1px dashed #eee; padding-bottom:2px;">
                            <div style="font-weight:bold; color:#555; font-size:13px;">${subLabel}</div>
                            <div style="text-align:right; color:#1976d2; font-size:13px; white-space:nowrap;">${telLink}${suffixHtml}</div>
                        </div>`;
                    }
                    return '';
                }).filter(Boolean).join('');
            }
            // Single unlabeled number — simple link
            const number = phoneLines[0] || '';
            const digits = number.replace(/\D/g, '');
            if (digits.length >= 7) {
                return `<a href="tel:${digits}" style="color:#1976d2;text-decoration:none;" title="Click to call ${number}">${number}</a>`;
            }
            return number;
        },

        /**
         * Generates the HTML for the Info panel and binds edit/save and scraping events.
         * @param {HTMLElement} container - The DOM element where the panel will be rendered.
         * @param {Object} context - An object containing dependencies (clientId, ClientNote, app, etc.).
         */
        render(container, context) {
            const { clientId, w, ClientNote, saveState, app } = context;

            const harvested = app.Core.Scraper.harvestFields();

            // Helper: case-insensitive harvest lookup with apostrophe normalization
            const h = (key) => {
                const norm = String(key).toLowerCase().trim().replace(/[\u2018\u2019]/g, "'");
                for (const [hk, hv] of Object.entries(harvested)) {
                    if (hk.toLowerCase().trim().replace(/[\u2018\u2019]/g, "'") === norm) return hv;
                }
                return undefined;
            };

            const freshData = GM_getValue('cn_' + clientId, {}); // Get latest data
            const formData = GM_getValue('cn_form_data_' + clientId, {}); // Get latest form data

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

                // Normalized lookup: register both exact and lowercased keys
                const norm = {};
                const normalizeKey = (k) => String(k).toLowerCase().trim().replace(/[\u2018\u2019]/g, "'");
                Object.keys(data).forEach(k => {
                    const v = data[k];
                    if (v !== undefined && v !== null) {
                        norm[k] = v;
                        norm[normalizeKey(k)] = v;
                    }
                });

                // Fresh harvest from the page takes highest priority over saved data.
                // Exception: the Witness field (WN) should never be overwritten by fresh harvest.
                const harvestNow = app.Core.Scraper.harvestFields();
                if (harvestNow) {
                    Object.keys(harvestNow).forEach(k => {
                        const v = harvestNow[k];
                        if (v !== undefined && v !== null && !InfoPanel._isBlank(v)) {
                            const nk = normalizeKey(k);
                            if (nk === 'witness') return; // never touch Witness
                            norm[k] = v;
                            norm[nk] = v;
                        }
                    });
                }

                const get = (...keys) => {
                    for (const k of keys) {
                        const lookup = normalizeKey(k);
                        const v = norm[lookup] !== undefined ? norm[lookup] : norm[k];
                        if (v !== undefined && !InfoPanel._isBlank(v)) return String(v).trim();
                    }
                    return '';
                };

                const setField = (domId, ...keys) => {
                    let el = container.querySelector(`.sn-side-textarea[data-id="${domId}"]`);
                    // Phone uses a div with individual tel: links, not a textarea
                    if (!el && domId === 'phone') {
                        el = container.querySelector('.sn-phone-content[data-id="phone"]');
                    }
                    if (!el) return;
                    // Respect witness lock
                    if (domId === 'wit' && GM_getValue('cn_wit_lock_' + clientId, false)) return;
                    let val = get(...keys);
                    if (domId === 'ssn' && val) val = app.Core.Utils.formatSSN(val);
                    if (domId === 'phone') {
                        // Cell from harvested sidebar or separate cellPhone key
                        const cellRaw = get('cell phone');
                        const cell = cellRaw ? app.Core.Utils.formatPhoneNumber(cellRaw) : '';
                        // Home/Alt from separate keys — no label parsing needed
                        const homeRaw = get('homePhone', 'homephone');
                        const altRaw = get('altPhone', 'altphone');
                        const homeFormatted = homeRaw ? app.Core.Utils.formatPhoneNumber(homeRaw) : '';
                        const altFormatted = altRaw ? app.Core.Utils.formatPhoneNumber(altRaw) : '';

                        // Extract WN phone digits for CL phone matching
                        const formData = GM_getValue('cn_form_data_' + clientId, {});
                        const wnBlock = formData['Witness'] || '';
                        const wnMatches = wnBlock.match(/(?:\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b)|(?:\(\d{3}\)\s?\d{3}[-.\s]?\d{4})/g) || [];
                        const wnDigits = wnMatches.map(m => m.replace(/\D/g, ''));

                        const parts = [];
                        const cellDigits = cellRaw ? cellRaw.replace(/\D/g, '') : '';
                        const homeDigits = homeRaw ? homeRaw.replace(/\D/g, '') : '';
                        const altDigits = altRaw ? altRaw.replace(/\D/g, '') : '';
                        // Always label Cell as "Cell/Primary"
                        if (cell && homeFormatted && altFormatted && cellDigits && cellDigits === homeDigits && homeDigits === altDigits) {
                            // All 3 same → show single "Cell/Primary" entry
                            parts.push('Cell/Primary: ' + cell);
                        } else {
                            if (cell) parts.push('Cell/Primary: ' + cell);
                            if (homeFormatted) {
                                const suffix = !wnDigits.includes(homeDigits) ? '' : ' (WN)';
                                parts.push('Home: ' + homeFormatted + suffix);
                            }
                            if (altFormatted) {
                                const suffix = !wnDigits.includes(altDigits) ? '' : ' (WN)';
                                parts.push('Alt: ' + altFormatted + suffix);
                            }
                        }
                        const combined = parts.join('\n');
                        const phoneHTML = combined ? InfoPanel._buildPhoneHTML(combined) : '';
                        if (el.innerHTML !== phoneHTML) {
                            el.innerHTML = phoneHTML;
                        }
                        return;
                    }
                    const newVal = val || '';
                    if (el.value !== newVal) el.value = newVal;
                };

                setField('ssn', 'ssn');
                setField('dob', 'dob');
                setField('phone', 'Phone', 'phone', 'cellPhone', 'cell phone');
                setField('addr', 'Address', 'address');
                // Deduplicate state in address (e.g. "Roy, Utah, Utah" -> "Roy, Utah")
                (() => {
                    const addrEl = container.querySelector('.sn-side-textarea[data-id="addr"]');
                    if (addrEl && addrEl.value) {
                        // Remove consecutive duplicate state names (full or abbreviated)
                        const stateNames = ['alabama','alaska','arizona','arkansas','california','colorado','connecticut','delaware','florida','georgia','hawaii','idaho','illinois','indiana','iowa','kansas','kentucky','louisiana','maine','maryland','massachusetts','michigan','minnesota','mississippi','missouri','montana','nebraska','nevada','new hampshire','new jersey','new mexico','new york','north carolina','north dakota','ohio','oklahoma','oregon','pennsylvania','rhode island','south carolina','south dakota','tennessee','texas','utah','vermont','virginia','washington','west virginia','wisconsin','wyoming','district of columbia','puerto rico'];
                        const stateAbbrs = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC','PR'];
                        const allStates = [...stateNames, ...stateAbbrs];
                        for (const st of allStates) {
                            const esc = st.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                            const re = new RegExp(`,\\s*${esc},\\s*${esc}`, 'gi');
                            addrEl.value = addrEl.value.replace(re, `, ${st}`);
                        }
                    }
                })();
                setField('email', 'Email', 'email');
                setField('pob', 'POB', 'pob', 'city where born');
                // Parents: combined from Mother's Maiden Name + Father's Full Name (harvest) or saved Parents (form data)
                setField('parents', 'Parents', 'parents');
                setField('wit', 'Witness', 'witness');

                // Combined Parents logic: live Mother + Father first, fall back to form data Parents
                const parentsEl = container.querySelector('.sn-side-textarea[data-id="parents"]');
                if (parentsEl) {
                    const mother = get("mother's maiden name", 'motherName', 'mother name');
                    const father = get("father's full name", 'fatherName', 'father name');
                    const combined = [mother, father].filter(Boolean).join('\n');
                    if (combined) {
                        if (parentsEl.value !== combined) parentsEl.value = combined;
                    } else {
                        const savedParents = get('Parents', 'parents');
                        const sp = savedParents || '';
                        if (parentsEl.value !== sp) parentsEl.value = sp;
                    }
                }

                // Update age display and birthday effects when dob changes
                const ageSpan = container.querySelector('#sn-dob-age');
                const dobVal = get('dob');
                const newAge = InfoPanel._calcAge(dobVal);
                const newStatus = InfoPanel._getBirthdayStatus(dobVal);
                if (ageSpan) {
                    const ageText = newAge !== null ? newAge + ' YO' : '';
                    if (ageSpan.textContent !== ageText) ageSpan.textContent = ageText;
                    ageSpan.classList.remove('sn-dob-age-upcoming', 'sn-dob-age-today');
                    if (newStatus === 'today') ageSpan.classList.add('sn-dob-age-today');
                    else if (newStatus === 'upcoming') ageSpan.classList.add('sn-dob-age-upcoming');
                }

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

            // Skip InfoPanel re-render when only medical-only fields changed (ProviderPanel fields)
            const medicalOnlyKeys = new Set(['Condition', 'Assistive Devices', 'Medical Provider']);

            w._infoListener = GM_addValueChangeListener('cn_form_data_' + clientId, (name, old, newVal, remote) => {
                if (!newVal) return;
                // If the change only touches medical-only fields, skip re-render
                const changedKeys = Object.keys(newVal).filter(k => k !== 'timestamp');
                if (changedKeys.length > 0 && changedKeys.every(k => medicalOnlyKeys.has(k))) return;

                updateHeaderIcon(newVal.prefix || '');
                const mergedData = { ...old, ...newVal };
                updateFields(mergedData);
            });

            // Watch for refreshes from scraper - when 'cn_' + clientId changes (raw data), also update
            w._infoRawListener = GM_addValueChangeListener('cn_' + clientId, (name, old, newVal, remote) => {
                if (newVal) {
                    // Skip DOM updates while user is editing Witness (only editable field)
                    if (container.querySelector('.sn-side-textarea[data-id="wit"]:not([readonly])')) return;

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

            // Compute age and birthday status from DOB
            const dobVal = firstVal(freshData.dob, h('dob'), formData.dob);
            const age = InfoPanel._calcAge(dobVal);
            const bdayStatus = InfoPanel._getBirthdayStatus(dobVal);

            // Witness lock state
            const witLocked = !!GM_getValue('cn_wit_lock_' + clientId, false);

            // Fields: harvest for core data, SSD form for Phone/Address/Email/Witness
            const fields = [
                { id: 'ssn', label: 'SSN', val: app.Core.Utils.formatSSN(firstVal(freshData.ssn, h('ssn'), formData.ssn)) },
                { id: 'dob', label: 'DOB', val: firstVal(freshData.dob, h('dob'), formData.dob), age: age, bdayStatus: bdayStatus },
                { id: 'phone', label: 'Phone', val: (() => {
                    // Cell from harvested sidebar or separate cellPhone key
                    const cellRaw = firstVal(freshData['cell phone'], h('cell phone'), formData.cellPhone);
                    const cell = cellRaw ? app.Core.Utils.formatPhoneNumber(cellRaw) : '';
                    // Home/Alt from separate keys (SSD form) — no label parsing needed
                    const homeRaw = firstVal(freshData.homePhone, formData.homePhone, formData['homePhone']);
                    const altRaw = firstVal(freshData.altPhone, formData.altPhone, formData['altPhone']);
                    const homeFormatted = homeRaw ? app.Core.Utils.formatPhoneNumber(homeRaw) : '';
                    const altFormatted = altRaw ? app.Core.Utils.formatPhoneNumber(altRaw) : '';
                    const parts = [];
                    if (cell) parts.push('Cell: ' + cell);
                    if (homeFormatted) parts.push('Home: ' + homeFormatted);
                    if (altFormatted) parts.push('Alt: ' + altFormatted);
                    return parts.join('\n');
                })() },
                { id: 'addr', label: 'Address', val: firstVal(freshData.address, h('Address'), h('address'), formData['Address']) },
                { id: 'email', label: 'Email', val: firstVal(freshData.email, h('Email'), h('email'), formData['Email']) },
                { id: 'pob', label: 'POB', val: firstVal(freshData.pob, h('city where born'), formData['POB']) },
                // Parents: live harvest Mother + Father first, fall back to form data
                { id: 'parents', label: 'Parents', val: (() => {
                    const liveMF = [h("mother's maiden name"), h("father's full name")].filter(Boolean).join('\n');
                    return liveMF || firstVal(freshData.parents, formData['Parents']);
                })() },
                { id: 'wit', label: 'Witness', val: firstVal(freshData.witness, formData['Witness']), locked: witLocked }
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
                    /* Read-only fields: muted, static look */
                    .sn-side-textarea.sn-field-readonly {
                        color:#777 !important;
                        cursor:default !important;
                    }
                    /* Witness field: subtle cue that it's interactive */
                    .sn-side-textarea[data-id="wit"] {
                        cursor:pointer !important;
                    }
                    .sn-side-textarea[data-id="wit"]:not([readonly]) {
                        background:#fff9c4 !important;
                        border:1px solid #b0bec5 !important;
                        border-radius:3px;
                        cursor:text !important;
                    }
                </style>
                <div style="flex-grow:1;">
            `;

            fields.forEach(f => {
                let labelHtml = f.label;
                const isStacked = f.id === 'wit' || f.id === 'addr' || f.id === 'parents';
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
                const isWit = f.id === 'wit';
                const extraClass = isWit ? '' : ' sn-field-readonly';
                const readonlyAttr = 'readonly';

                if (isStacked) {
                    html += `
                <div style="margin-bottom:6px; border-bottom:1px dashed #ccc; padding-bottom:2px;">
                    <div style="font-weight:bold; color:#555; margin-bottom:2px;">${labelHtml}</div>
                    <textarea class="sn-side-textarea${extraClass}" data-id="${f.id}" ${readonlyAttr} rows="1"
                        style="width:100%; text-align:right !important; border:1px solid transparent; background:transparent; font-family:inherit; padding:2px 4px; color:#1976d2 !important; outline:none; resize:none; overflow:hidden; transition:background 0.2s, border 0.2s; box-sizing:border-box;">${f.val || ''}</textarea>
                </div>`;
                } else if (f.id === 'phone' && f.val) {
                    const hasLabels = String(f.val).includes(':');
                    if (hasLabels) {
                        // Labeled multi-line phone — render sub-rows, no top-level "Phone" label row
                        html += `
                <div style="margin-bottom:6px; border-bottom:1px dashed #ccc; padding-bottom:2px;" data-id="phone" class="sn-phone-content">
                    ${InfoPanel._buildPhoneHTML(f.val)}
                </div>`;
                    } else {
                        // Single unlabeled phone number — standard flex row
                        html += `
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px; border-bottom:1px dashed #ccc; padding-bottom:2px; gap:10px;">
                    <div style="font-weight:bold; color:#555; flex-shrink:0; margin-top:2px; max-width:40%;">${labelHtml}</div>
                    <div data-id="phone" class="sn-phone-content" style="flex-grow:1; text-align:right !important; font-family:inherit; padding:2px 4px; color:#1976d2 !important; font-size:13px; line-height:1.4; white-space:pre-wrap; word-break:break-all;">${InfoPanel._buildPhoneHTML(f.val)}</div>
                </div>`;
                    }
                } else {
                    html += `
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px; border-bottom:1px dashed #ccc; padding-bottom:2px; gap:10px;">
                    <div style="font-weight:bold; color:#555; flex-shrink:0; margin-top:2px; max-width:40%;">${labelHtml}</div>
                    <textarea class="sn-side-textarea${extraClass}" data-id="${f.id}" ${readonlyAttr} rows="1"
                        style="flex-grow:1; text-align:right !important; border:1px solid transparent; background:transparent; font-family:inherit; padding:2px 4px; color:#1976d2 !important; outline:none; resize:none; overflow:hidden; transition:background 0.2s, border 0.2s;">${f.val || ''}</textarea>
                </div>`;
                }
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

            // Double-click Witness to edit (only editable field)
            const witTextarea = container.querySelector('.sn-side-textarea[data-id="wit"]');
            if (witTextarea) {
                witTextarea.addEventListener('dblclick', function () {
                    if (this.hasAttribute('readonly')) {
                        this.removeAttribute('readonly');
                        this.focus();
                        // Save when it loses focus
                        const onBlur = () => {
                            this.setAttribute('readonly', true);
                            this.removeEventListener('blur', onBlur);
                            // Persist the edited value
                            const val = this.value;
                            if (val !== undefined) {
                                ClientNote.updateAndSaveData(clientId, { Witness: val });
                                saveState();
                            }
                        };
                        this.addEventListener('blur', onBlur);
                    }
                });
            }

            this.setupAutoResize(container);

            // --- Delayed live harvest check (retries up to 30s) ---
            (function pollScrape(attempt) {
                const maxAttempts = 6;
                setTimeout(() => {
                    const liveData = app.Core.Scraper.harvestFields();
                    if (liveData && (liveData.ssn || liveData.dob || liveData['first name'] || liveData['matter name'] || liveData["mother's maiden name"] || liveData["father's full name"])) {
                        const currentCnData = GM_getValue('cn_' + clientId, {});
                        const currentFormData = GM_getValue('cn_form_data_' + clientId, {});
                        const merged = { ...currentFormData, ...currentCnData, ...liveData };
                        const mergedKey = JSON.stringify(merged);
                        if (container._lastPollMerged !== mergedKey) {
                            container._lastPollMerged = mergedKey;
                            updateFields(merged);
                        } else if (attempt < maxAttempts) {
                            pollScrape(attempt + 1);
                        }
                    } else if (attempt < maxAttempts) {
                        pollScrape(attempt + 1);
                    }
                }, 5000);
            })(1);
        }
    };

    app.Features.InfoPanel = InfoPanel;
})();
