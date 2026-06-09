(function () {
    const app = window.CM_App = window.CM_App || {};
    app.Features = app.Features || {};

    /**
     * Orchestrates the "Client Note" feature by managing the core note window, 
     * rich-text case notes, and to-do lists while synchronizing client and matter data 
     * across multiple specialized sidebar panels.
     * Interacts with Themes, Scraper, WindowManager, Taskbar, Utils, InfoPanel, SSAPanel,
     * DDSPanel, Dashboard, MedicationPanel, AppObserver, and gm-compat.
     * @namespace app.Features.ClientNote
     */
    const ClientNote = {
        presets: [
            '#ffe0b2', '#fff9c4', '#c8e6c9', '#b2dfdb', '#bbdefb', '#d1c4e9', '#f8bbd0', '#d7ccc8', '#cfd8dc'
        ],
        ianaTZ: {
            'EDT': 'America/New_York', 'CDT': 'America/Chicago', 'MDT': 'America/Denver',
            'PDT': 'America/Los_Angeles', 'AKDT': 'America/Anchorage', 'HST': 'Pacific/Honolulu',
            // Fallbacks for legacy data
            'EST': 'America/New_York', 'CST': 'America/Chicago', 'MST': 'America/Denver',
            'PST': 'America/Los_Angeles', 'AKST': 'America/Anchorage'
        },
        listeners: {},
        clockInterval: null,

        /** Predefined global badge type definitions. Stored in GM storage for user-custom additions. */
        _badgeDefs: null, // Lazy-loaded in _getBadgeDefs()

        /**
         * Returns (and initializes if needed) the global badge definitions.
         * Stored under GM key `cn_badge_defs` so users can add custom badges.
         * @returns {Object} Badge definition map keyed by badge type ID.
         */
        _getBadgeDefs() {
            if (this._badgeDefs) return this._badgeDefs;
            const defaults = {
                'nc': {
                    label: 'NC', type: 'auto', desc: 'Last Client Contact (auto-shows if 90+ days old)',
                    activeByDefault: false,
                },
                'ssa_gov': {
                    label: 'SSA.GOV', type: 'stateful',
                    desc: 'SSA.gov account status',
                    activeByDefault: false,
                    states: [
                        { label: 'N/A', color: '#9e9e9e', textColor: '#fff', tooltip: 'Not applicable / not yet asked' },
                        { label: 'Got Account', color: '#4caf50', textColor: '#fff', tooltip: 'Client has an account' },
                        { label: 'Asked', color: '#2196f3', textColor: '#fff', tooltip: 'Asked client about SSA.gov' },
                        { label: 'Rejected', color: '#f44336', textColor: '#fff', tooltip: 'Client rejected setting up account' },
                        { label: 'Not Interested', color: '#fdd835', textColor: '#333', tooltip: 'CL not interested in online access' },
                        { label: 'No Access', color: '#e91e63', textColor: '#fff', tooltip: 'No internet / no computer / unable' }
                    ]
                },
                'dds': {
                    label: 'DDS', type: 'multitoggle', desc: 'DDS statuses',
                    activeByDefault: false,
                    items: [
                        { id: 'assigned', label: 'Assigned', color: '#43a047', tooltip: 'Assigned to DDS examiner' },
                        { id: 'contact_req', label: 'Contact Request', color: '#1e88e5', tooltip: 'Contact request sent' },
                        { id: 'mr', label: 'MR', color: '#fb8c00', tooltip: 'Medical Records requested/received' },
                        { id: 'ce', label: 'CE', color: '#8e24aa', tooltip: 'Consultative Exam scheduled/done' },
                        { id: '1696', label: '1696', color: '#00897b', tooltip: 'Form 1696 on file with DDS' }
                    ]
                },
                'fo': {
                    label: 'FO', type: 'multitoggle', desc: 'Field Office statuses',
                    activeByDefault: false,
                    items: [
                        { id: 'contact', label: 'Contact', color: '#43a047', tooltip: 'Contacted FO' },
                        { id: '1696', label: '1696', color: '#1e88e5', tooltip: 'Form 1696 filed at FO' },
                        { id: '827', label: '827', color: '#fb8c00', tooltip: 'Form SSA-827 on file' },
                        { id: 'attest', label: 'Attest', color: '#8e24aa', tooltip: 'Attestation submitted' }
                    ]
                }
            };
            // Merge with any user-customized versions from GM storage
            const saved = GM_getValue('cn_badge_defs', {});
            this._badgeDefs = { ...defaults, ...saved };
            // Ensure default badges are always present (user may have deleted some, re-add if needed)
            Object.keys(defaults).forEach(k => {
                if (!this._badgeDefs[k]) this._badgeDefs[k] = defaults[k];
            });
            return this._badgeDefs;
        },

        /**
         * Saves a custom badge definition to global storage.
         * @param {string} id - Badge type ID.
         * @param {Object} def - Badge definition object.
         */
        _saveBadgeDef(id, def) {
            const defs = this._getBadgeDefs();
            defs[id] = def;
            this._badgeDefs = defs;
            GM_setValue('cn_badge_defs', defs);
        },

        /**
         * Removes a user-created badge definition from global storage.
         * @param {string} id - Badge type ID to remove.
         */
        _removeBadgeDef(id) {
            const defs = this._getBadgeDefs();
            delete defs[id];
            this._badgeDefs = defs;
            GM_setValue('cn_badge_defs', defs);
        },

        /**
         * Renders the badge strip for the current client note window.
         * @param {HTMLElement} w - The client note window element.
         * @param {string} clientId - The 18-character Salesforce Client ID.
         * @param {Object} savedData - The saved note data (may contain badge states).
         */
        _renderBadges(w, clientId, savedData) {
            const container = w.querySelector('#sn-badges-container');
            if (!container) return;
            container.innerHTML = '';

            const defs = this._getBadgeDefs();
            const pageData = app.Core.Scraper.getAllPageData();
            const savedBadges = savedData.badges || {};

            Object.entries(defs).forEach(([typeId, def]) => {
                // Determine if this badge should be shown
                let isActive = savedBadges[typeId]?.active !== undefined ? savedBadges[typeId].active : (def.activeByDefault || false);

                // NC badge: auto-activate if lastCA is 90+ days old
                if (typeId === 'nc' && def.type === 'auto') {
                    const rawLastCA = pageData.lastCA || '';
                    if (rawLastCA) {
                        const contactDate = new Date(rawLastCA);
                        if (!isNaN(contactDate.getTime())) {
                            const daysSince = Math.floor((Date.now() - contactDate.getTime()) / (1000 * 60 * 60 * 24));
                            if (daysSince >= 90) {
                                isActive = true;
                            }
                        }
                    }
                }

                if (!isActive) return;

                const badgeEl = document.createElement('span');
                badgeEl.className = 'sn-badge';
                badgeEl.dataset.type = typeId;

                if (def.type === 'auto' && typeId === 'nc') {
                    // NC badge: auto-populated from raw lastCA
                    const rawLastCA = pageData.lastCA || '';
                    const dateStr = rawLastCA ? this._formatDateShort(rawLastCA) : '';
                    badgeEl.textContent = `NC: ${dateStr}`;
                    badgeEl.style.background = '#607d8b';
                    badgeEl.style.color = '#fff';
                    badgeEl.title = `Last Client Contact: ${rawLastCA || 'No date available'}`;
                    badgeEl.style.cursor = 'default';
                } else if (def.type === 'stateful') {
                    // Stateful badge (e.g., SSA.GOV)
                    const currentIdx = savedBadges[typeId]?.stateIdx ?? 0;
                    const state = def.states[currentIdx] || def.states[0];
                    badgeEl.textContent = def.label + ': ' + state.label;
                    badgeEl.style.background = state.color;
                    badgeEl.style.color = state.textColor || (state.color === '#fdd835' ? '#333' : '#fff');
                    badgeEl.title = state.tooltip || def.label;
                    badgeEl.dataset.stateIdx = currentIdx;

                    // Click → show dropdown
                    badgeEl.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this._showBadgeStateDropdown(e, w, clientId, typeId, def);
                    });
                } else if (def.type === 'multitoggle') {
                    // Multi-toggle badge (e.g., DDS, FO)
                    const toggledState = savedBadges[typeId]?.toggled || {};
                    const activeItems = (def.items || []).filter(item => toggledState[item.id]);
                    if (activeItems.length === 0) {
                        // Show gray "off" version
                        badgeEl.textContent = def.label;
                        badgeEl.style.background = '#9e9e9e';
                        badgeEl.style.color = '#fff';
                        badgeEl.title = def.label + ' — click to toggle items';
                    } else {
                        badgeEl.textContent = def.label + ': ' + activeItems.map(i => i.label).join('/');
                        badgeEl.style.background = '#455a64';
                        badgeEl.style.color = '#fff';
                        badgeEl.title = def.label + ': ' + activeItems.map(i => i.label).join(', ');
                    }
                    // Click → show multi-toggle dropdown
                    badgeEl.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this._showBadgeMultiToggle(e, w, clientId, typeId, def);
                    });
                }

                container.appendChild(badgeEl);
            });
        },

        /**
         * Shows a dropdown to pick a state for a stateful badge (e.g., SSA.GOV).
         */
        _showBadgeStateDropdown(e, w, clientId, typeId, def) {
            // Remove any existing badge dropdowns
            this._closeBadgeDropdowns(w);

            const dropdown = document.createElement('div');
            dropdown.className = 'sn-badge-dropdown';

            const savedBadges = GM_getValue('cn_' + clientId, {}).badges || {};
            const currentIdx = savedBadges[typeId]?.stateIdx ?? 0;

            (def.states || []).forEach((state, idx) => {
                const item = document.createElement('div');
                item.style.cssText = 'display:flex;align-items:center;gap:6px;padding:4px 8px;cursor:pointer;border-radius:3px;font-size:12px;';
                item.innerHTML = `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${state.color};flex-shrink:0;"></span>${state.label}${idx === currentIdx ? ' ✓' : ''}`;
                item.title = state.tooltip || '';
                item.addEventListener('mouseenter', () => item.style.background = '#f0f0f0');
                item.addEventListener('mouseleave', () => item.style.background = 'transparent');
                item.addEventListener('click', () => {
                    this._setBadgeState(clientId, typeId, idx);
                    this._renderBadges(w, clientId, GM_getValue('cn_' + clientId, {}));
                    // Keep dropdown open so user can keep interacting
                });
                dropdown.appendChild(item);
            });

            // Separator
            const sep = document.createElement('div');
            sep.style.cssText = 'border-top:1px solid #eee;margin:4px 0;';
            dropdown.appendChild(sep);

            // Edit badge button
            const editItem = document.createElement('div');
            editItem.style.cssText = 'display:flex;align-items:center;gap:6px;padding:4px 8px;cursor:pointer;border-radius:3px;font-size:12px;color:#555;';
            editItem.innerHTML = '✎ Edit';
            editItem.addEventListener('mouseenter', () => editItem.style.background = '#f0f0f0');
            editItem.addEventListener('mouseleave', () => editItem.style.background = 'transparent');
            editItem.addEventListener('click', () => {
                this._showBadgeEditor(w, clientId, typeId, def);
            });
            dropdown.appendChild(editItem);

            // Remove badge option
            const removeItem = document.createElement('div');
            removeItem.style.cssText = 'display:flex;align-items:center;gap:6px;padding:4px 8px;cursor:pointer;border-radius:3px;font-size:12px;color:#e53935;';
            removeItem.textContent = '✕ Remove this badge';
            removeItem.addEventListener('mouseenter', () => removeItem.style.background = '#f0f0f0');
            removeItem.addEventListener('mouseleave', () => removeItem.style.background = 'transparent');
            removeItem.addEventListener('click', () => {
                this._closeBadgeDropdowns(w);
                this._setBadgeActive(clientId, typeId, false);
                this._renderBadges(w, clientId, GM_getValue('cn_' + clientId, {}));
                const data = GM_getValue('cn_' + clientId, {});
                this._syncBadgeSave(clientId, data);
            });
            dropdown.appendChild(removeItem);

            // Append to window first so offsetWidth is measurable
            w.appendChild(dropdown);
            w._badgeDropdown = dropdown;

            // Now position — dropdown is in DOM so offsetWidth is accurate
            const rect = e.target.getBoundingClientRect();
            dropdown.style.cssText = 'position:fixed;background:#fff;border:1px solid #999;border-radius:4px;box-shadow:0 2px 8px rgba(0,0,0,0.2);z-index:50000;padding:4px;min-width:140px;';
            dropdown.style.top = (rect.bottom + 4) + 'px';
            dropdown.style.left = Math.max(4, Math.min(window.innerWidth - dropdown.offsetWidth - 4, Math.max(4, rect.left))) + 'px';

            // Close on outside click
            const closeHandler = (ev) => {
                if (!dropdown.contains(ev.target) && ev.target !== e.target) {
                    this._closeBadgeDropdowns(w);
                    document.removeEventListener('click', closeHandler);
                }
            };
            setTimeout(() => document.addEventListener('click', closeHandler), 10);
        },

        /**
         * Shows a dropdown to toggle sub-items for a multi-toggle badge (e.g., DDS, FO).
         */
        _showBadgeMultiToggle(e, w, clientId, typeId, def) {
            this._closeBadgeDropdowns(w);

            const dropdown = document.createElement('div');
            dropdown.className = 'sn-badge-dropdown';

            const savedBadges = GM_getValue('cn_' + clientId, {}).badges || {};
            const toggledState = savedBadges[typeId]?.toggled || {};

            // Header
            const header = document.createElement('div');
            header.style.cssText = 'font-weight:bold;font-size:11px;padding:2px 8px 4px;color:#555;border-bottom:1px solid #eee;margin-bottom:4px;';
            header.textContent = def.label;
            dropdown.appendChild(header);

            (def.items || []).forEach(item => {
                const isChecked = !!toggledState[item.id];
                const row = document.createElement('div');
                row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:4px 8px;cursor:pointer;border-radius:3px;font-size:12px;';
                const swatch = document.createElement('span');
                swatch.style.cssText = `display:inline-block;width:10px;height:10px;border-radius:3px;background:${item.color};flex-shrink:0;opacity:${isChecked ? '1' : '0.3'};`;
                const label = document.createElement('span');
                label.textContent = item.label;
                label.style.flexGrow = '1';
                const check = document.createElement('span');
                check.textContent = isChecked ? '✓' : '';
                check.style.color = '#4caf50';
                check.style.fontWeight = 'bold';
                row.appendChild(swatch);
                row.appendChild(label);
                row.appendChild(check);
                row.title = item.tooltip || '';
                row.addEventListener('mouseenter', () => row.style.background = '#f0f0f0');
                row.addEventListener('mouseleave', () => row.style.background = 'transparent');
                row.addEventListener('click', () => {
                    this._toggleBadgeItem(clientId, typeId, item.id);
                    this._renderBadges(w, clientId, GM_getValue('cn_' + clientId, {}));
                    // Keep dropdown open so user can keep toggling
                });
                dropdown.appendChild(row);
            });

            // Separator
            const sep = document.createElement('div');
            sep.style.cssText = 'border-top:1px solid #eee;margin:4px 0;';
            dropdown.appendChild(sep);

            // Edit badge button
            const editItem = document.createElement('div');
            editItem.style.cssText = 'display:flex;align-items:center;gap:6px;padding:4px 8px;cursor:pointer;border-radius:3px;font-size:12px;color:#555;';
            editItem.innerHTML = '✎ Edit';
            editItem.addEventListener('mouseenter', () => editItem.style.background = '#f0f0f0');
            editItem.addEventListener('mouseleave', () => editItem.style.background = 'transparent');
            editItem.addEventListener('click', () => {
                this._showBadgeEditor(w, clientId, typeId, def);
            });
            dropdown.appendChild(editItem);

            // Remove badge option
            const removeItem = document.createElement('div');
            removeItem.style.cssText = 'display:flex;align-items:center;gap:6px;padding:4px 8px;cursor:pointer;border-radius:3px;font-size:12px;color:#e53935;';
            removeItem.textContent = '✕ Remove this badge';
            removeItem.addEventListener('mouseenter', () => removeItem.style.background = '#f0f0f0');
            removeItem.addEventListener('mouseleave', () => removeItem.style.background = 'transparent');
            removeItem.addEventListener('click', () => {
                this._closeBadgeDropdowns(w);
                this._setBadgeActive(clientId, typeId, false);
                this._renderBadges(w, clientId, GM_getValue('cn_' + clientId, {}));
            });
            dropdown.appendChild(removeItem);

            // Append to window first so offsetWidth is measurable
            w.appendChild(dropdown);
            w._badgeDropdown = dropdown;

            // Now position
            const rect = e.target.getBoundingClientRect();
            dropdown.style.cssText = 'position:fixed;background:#fff;border:1px solid #999;border-radius:4px;box-shadow:0 2px 8px rgba(0,0,0,0.2);z-index:50000;padding:4px;min-width:160px;';
            dropdown.style.top = (rect.bottom + 4) + 'px';
            dropdown.style.left = Math.max(4, Math.min(window.innerWidth - dropdown.offsetWidth - 4, Math.max(4, rect.left))) + 'px';

            const closeHandler = (ev) => {
                if (!dropdown.contains(ev.target) && ev.target !== e.target) {
                    this._closeBadgeDropdowns(w);
                    document.removeEventListener('click', closeHandler);
                }
            };
            setTimeout(() => document.addEventListener('click', closeHandler), 10);
        },

        /** Closes any open badge dropdown for the given window. */
        _closeBadgeDropdowns(w) {
            if (w._badgeDropdown) {
                w._badgeDropdown.remove();
                w._badgeDropdown = null;
            }
        },

        /**
         * Sets the state index for a stateful badge (per-client).
         */
        _setBadgeState(clientId, typeId, stateIdx) {
            const data = GM_getValue('cn_' + clientId, {});
            if (!data.badges) data.badges = {};
            if (!data.badges[typeId]) data.badges[typeId] = {};
            data.badges[typeId].stateIdx = stateIdx;
            data.badges[typeId].active = true;
            this._syncBadgeSave(clientId, data);
        },

        /**
         * Toggles a sub-item for a multi-toggle badge (per-client).
         */
        _toggleBadgeItem(clientId, typeId, itemId) {
            const data = GM_getValue('cn_' + clientId, {});
            if (!data.badges) data.badges = {};
            if (!data.badges[typeId]) data.badges[typeId] = { toggled: {} };
            if (!data.badges[typeId].toggled) data.badges[typeId].toggled = {};
            data.badges[typeId].toggled[itemId] = !data.badges[typeId].toggled[itemId];
            data.badges[typeId].active = true;
            this._syncBadgeSave(clientId, data);
        },

        /**
         * Sets whether a badge is active (shown) for a client.
         */
        _setBadgeActive(clientId, typeId, active) {
            const data = GM_getValue('cn_' + clientId, {});
            if (!data.badges) data.badges = {};
            if (!data.badges[typeId]) data.badges[typeId] = {};
            data.badges[typeId].active = active;
            this._syncBadgeSave(clientId, data);
        },

        /** Saves client data after badge manipulation and triggers UI updates. */
        _syncBadgeSave(clientId, data) {
            try { GM_setValue('cn_' + clientId, data); } catch (e) { console.error('[ClientNote] Badge save failed:', e); }
            this.checkStoredData(clientId);
            app.Core.Taskbar.update();
            GM_setValue('sn_dashboard_broadcast', Date.now());
        },

        /**
         * Shows the custom badge creation popup.
         * @param {HTMLElement} w - The client note window.
         * @param {string} clientId - The 18-character Salesforce Client ID.
         */
        _showAddBadgePopup(w, clientId) {
            const existingPopup = document.getElementById('sn-badge-add-popup');
            if (existingPopup) { existingPopup.remove(); return; }

            const defs = this._getBadgeDefs();
            const savedBadges = GM_getValue('cn_' + clientId, {}).badges || {};

            const overlay = document.createElement('div');
            overlay.id = 'sn-badge-add-popup';
            overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.3);z-index:30000;display:flex;align-items:center;justify-content:center;';

            const popup = document.createElement('div');
            popup.style.cssText = 'background:#fff;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.3);padding:14px;max-width:360px;width:90%;max-height:80vh;overflow-y:auto;font-size:13px;';

            popup.innerHTML = `
                <div style="font-weight:bold;font-size:14px;margin-bottom:8px;display:flex;align-items:center;gap:8px;">
                    <span>Add Badge</span>
                    <span style="flex-grow:1;"></span>
                    <span id="sn-badge-popup-close" style="cursor:pointer;font-size:18px;color:#999;">×</span>
                </div>
                <div style="margin-bottom:8px;font-size:11px;color:#666;">Click a badge type to add it, or create a custom one below.</div>
                <div id="sn-badge-available-list" style="margin-bottom:10px;">
                    ${Object.entries(defs).map(([id, def]) => {
                        const isActive = savedBadges[id]?.active !== undefined ? savedBadges[id].active : (def.activeByDefault || false);
                        return `<div class="sn-badge-avail-item" data-id="${id}" style="display:flex;align-items:center;justify-content:space-between;padding:5px 8px;cursor:pointer;border-radius:4px;margin-bottom:2px;${isActive ? 'background:#e8f5e9;' : ''}">
                            <span><strong>${def.label}</strong> <span style="color:#888;font-size:11px;">— ${def.desc || ''}</span></span>
                            <span style="color:${isActive ? '#4caf50' : '#999'};font-size:11px;">${isActive ? 'Active ✓' : '+ Add'}</span>
                        </div>`;
                    }).join('')}
                </div>
                <div style="border-top:1px solid #eee;padding-top:8px;">
                    <div style="font-weight:bold;font-size:12px;margin-bottom:6px;">Create Custom Badge</div>
                    <div style="display:flex;flex-direction:column;gap:4px;">
                        <input id="sn-badge-custom-name" placeholder="Badge name (e.g., 'Medical')" style="border:1px solid #ccc;border-radius:3px;padding:4px 6px;font-size:12px;">
                        <select id="sn-badge-custom-type" style="border:1px solid #ccc;border-radius:3px;padding:4px 6px;font-size:12px;">
                            <option value="stateful">Single state (click to change)</option>
                            <option value="multitoggle">Multiple checkable items</option>
                        </select>
                        <textarea id="sn-badge-custom-items" placeholder="For single-state: label1=color,label2=color,...&#10;For multi-toggle: item1,item2,...&#10;Colors: red, blue, green, orange, purple, teal, pink, gray" style="border:1px solid #ccc;border-radius:3px;padding:4px 6px;font-size:11px;min-height:50px;resize:vertical;"></textarea>
                        <button id="sn-badge-custom-add" style="background:#1976d2;color:#fff;border:none;border-radius:3px;padding:5px;cursor:pointer;font-size:12px;margin-top:2px;">+ Create Badge</button>
                        <div id="sn-badge-custom-error" style="color:#e53935;font-size:11px;display:none;"></div>
                    </div>
                </div>
            `;

            overlay.appendChild(popup);
            document.body.appendChild(overlay);

            // Close handlers
            popup.querySelector('#sn-badge-popup-close').onclick = () => overlay.remove();
            overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

            // Available badge clicks
            popup.querySelectorAll('.sn-badge-avail-item').forEach(el => {
                el.addEventListener('click', () => {
                    const id = el.dataset.id;
                    const data = GM_getValue('cn_' + clientId, {});
                    if (!data.badges) data.badges = {};
                    if (!data.badges[id]) data.badges[id] = {};
                    data.badges[id].active = !(savedBadges[id]?.active !== undefined ? savedBadges[id].active : (defs[id]?.activeByDefault || false));
                    try { GM_setValue('cn_' + clientId, data); } catch (e) {}
                    this._renderBadges(w, clientId, GM_getValue('cn_' + clientId, {}));
                    overlay.remove();
                });
            });

            // Custom badge creation
            popup.querySelector('#sn-badge-custom-add').onclick = () => {
                const name = popup.querySelector('#sn-badge-custom-name').value.trim();
                const type = popup.querySelector('#sn-badge-custom-type').value;
                const itemsRaw = popup.querySelector('#sn-badge-custom-items').value.trim();
                const errorEl = popup.querySelector('#sn-badge-custom-error');

                errorEl.style.display = 'none';
                if (!name) { errorEl.textContent = 'Please enter a badge name.'; errorEl.style.display = 'block'; return; }
                if (!itemsRaw) { errorEl.textContent = 'Please enter items or states.'; errorEl.style.display = 'block'; return; }

                const id = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
                if (defs[id]) { errorEl.textContent = 'A badge with this name already exists.'; errorEl.style.display = 'block'; return; }

                const colorMap = {
                    'red': '#e53935', 'blue': '#1e88e5', 'green': '#43a047', 'orange': '#fb8c00',
                    'purple': '#8e24aa', 'teal': '#00897b', 'pink': '#e91e63', 'gray': '#9e9e9e',
                    'yellow': '#fdd835', 'indigo': '#3949ab', 'brown': '#6d4c41', 'cyan': '#00acc1'
                };

                let def;
                if (type === 'stateful') {
                    const parts = itemsRaw.split(',').map(s => s.trim()).filter(Boolean);
                    const states = parts.map(p => {
                        const [label, colorName] = p.split('=').map(s => s.trim());
                        const color = colorMap[colorName?.toLowerCase()] || colorName || '#9e9e9e';
                        const textColor = (color === '#fdd835') ? '#333' : '#fff';
                        return { label: label || p, color, textColor, tooltip: '' };
                    });
                    def = { label: name, type: 'stateful', desc: 'Custom badge', states, activeByDefault: false };
                } else {
                    const items = itemsRaw.split(',').map(s => s.trim()).filter(Boolean);
                    const itemDefs = items.map((item, i) => {
                        const colors = ['#43a047', '#1e88e5', '#fb8c00', '#8e24aa', '#00897b', '#e91e63', '#3949ab', '#6d4c41'];
                        return { id: item.toLowerCase().replace(/[^a-z0-9]/g, '_'), label: item, color: colors[i % colors.length], tooltip: '' };
                    });
                    def = { label: name, type: 'multitoggle', desc: 'Custom badge', items: itemDefs, activeByDefault: false };
                }

                this._saveBadgeDef(id, def);
                // Activate it for this client
                const data = GM_getValue('cn_' + clientId, {});
                if (!data.badges) data.badges = {};
                data.badges[id] = { active: true };
                try { GM_setValue('cn_' + clientId, data); } catch (e) {}
                this._renderBadges(w, clientId, GM_getValue('cn_' + clientId, {}));
                overlay.remove();
            };
        },

        /** Color palette for the badge editor's color picker. */
        _badgeEditorColors: [
            '#e53935', '#f44336', '#ff7043', '#fb8c00', '#ffb300', '#fdd835',
            '#c0ca33', '#43a047', '#00897b', '#00acc1', '#1e88e5', '#3949ab',
            '#8e24aa', '#e91e63', '#6d4c41', '#607d8b', '#9e9e9e', '#333333'
        ],

        /**
         * Opens an inline editor popup for a badge definition.
         * @param {HTMLElement} w - The client note window.
         * @param {string} clientId - The 18-character Salesforce Client ID.
         * @param {string} typeId - Badge type ID.
         * @param {Object} def - Badge definition object.
         */
        _showBadgeEditor(w, clientId, typeId, def) {
            // Close the badge dropdown first
            this._closeBadgeDropdowns(w);

            const overlay = document.createElement('div');
            overlay.className = 'sn-badge-editor-overlay';
            overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.25);z-index:60000;display:flex;align-items:center;justify-content:center;';

            const isDefault = ['nc', 'ssa_gov', 'dds', 'fo'].includes(typeId);
            const itemsOrStates = def.type === 'stateful' ? (def.states || []) : (def.items || []);
            const isStateful = def.type === 'stateful';

            const popup = document.createElement('div');
            popup.style.cssText = 'background:#fff;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.3);padding:16px;max-width:420px;width:90%;max-height:80vh;overflow-y:auto;font-size:13px;';

            let bodyHTML = `
                <div style="font-weight:bold;font-size:15px;margin-bottom:10px;display:flex;align-items:center;gap:8px;">
                    <span>Edit: ${def.label}</span>
                    <span style="flex-grow:1;"></span>
                    <span class="sn-badge-editor-close" style="cursor:pointer;font-size:20px;color:#999;line-height:1;">×</span>
                </div>
                <div style="margin-bottom:10px;">
                    <label style="font-size:11px;color:#666;display:block;margin-bottom:2px;">Badge Label</label>
                    <input id="sn-be-name" value="${def.label.replace(/"/g, '&quot;')}" style="width:100%;border:1px solid #ccc;border-radius:3px;padding:5px 7px;font-size:13px;box-sizing:border-box;" ${isDefault ? 'disabled' : ''}>
                    ${isDefault ? '<div style="font-size:10px;color:#999;margin-top:2px;">Default badge — label is fixed</div>' : ''}
                </div>
                <div style="margin-bottom:8px;">
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
                        <span style="font-size:11px;color:#666;font-weight:bold;">${isStateful ? 'States' : 'Items'}</span>
                        <button class="sn-be-add-row" style="border:1px solid #1976d2;background:transparent;color:#1976d2;border-radius:3px;cursor:pointer;font-size:11px;padding:2px 8px;">+ Add</button>
                    </div>
                    <div id="sn-be-list" style="display:flex;flex-direction:column;gap:4px;">
                        ${itemsOrStates.map((item, idx) => {
                            const label = isStateful ? item.label : item.label;
                            const color = isStateful ? item.color : item.color;
                            const tid = isStateful ? (item.tooltip || '') : (item.tooltip || '');
                            return `
                                <div class="sn-be-row" data-idx="${idx}" style="display:flex;align-items:center;gap:4px;">
                                    <div class="sn-be-swatch" style="width:22px;height:22px;border-radius:4px;background:${color};border:1px solid rgba(0,0,0,0.15);cursor:pointer;flex-shrink:0;"></div>
                                    <input class="sn-be-label" value="${label.replace(/"/g, '&quot;')}" placeholder="Label" style="flex-grow:1;border:1px solid #ddd;border-radius:3px;padding:3px 5px;font-size:12px;min-width:60px;">
                                    <input class="sn-be-tooltip" value="${tid.replace(/"/g, '&quot;')}" placeholder="Tooltip (opt)" style="flex:0 0 100px;border:1px solid #ddd;border-radius:3px;padding:3px 5px;font-size:11px;">
                                    <button class="sn-be-del-row" style="border:none;background:transparent;color:#e53935;cursor:pointer;font-size:14px;padding:0 2px;line-height:1;" title="Remove">×</button>
                                </div>`;
                        }).join('')}
                    </div>
                </div>
                <div style="margin-bottom:10px;">
                    <div style="font-size:11px;color:#666;font-weight:bold;margin-bottom:4px;">Colors</div>
                    <div id="sn-be-color-palette" style="display:flex;flex-wrap:wrap;gap:3px;">
                        ${this._badgeEditorColors.map(c =>
                            `<div class="sn-be-color" data-color="${c}" style="width:18px;height:18px;border-radius:3px;background:${c};cursor:pointer;border:2px solid transparent;box-sizing:border-box;"></div>`
                        ).join('')}
                    </div>
                </div>
                <div style="display:flex;gap:6px;justify-content:flex-end;border-top:1px solid #eee;padding-top:10px;">
                    <button class="sn-badge-editor-close" style="border:1px solid #ccc;background:#fff;border-radius:4px;padding:5px 14px;cursor:pointer;font-size:12px;">Cancel</button>
                    <button id="sn-be-save" style="background:#1976d2;color:#fff;border:none;border-radius:4px;padding:5px 14px;cursor:pointer;font-size:12px;font-weight:bold;">Save</button>
                </div>
            `;

            popup.innerHTML = bodyHTML;
            overlay.appendChild(popup);
            document.body.appendChild(overlay);

            // Track which swatch is being edited
            let selectedSwatch = null;
            let selectedRow = null;

            // Color palette clicks
            popup.querySelectorAll('.sn-be-color').forEach(sw => {
                sw.addEventListener('click', () => {
                    const color = sw.dataset.color;
                    if (selectedSwatch) {
                        selectedSwatch.style.background = color;
                        selectedSwatch.style.borderColor = 'rgba(0,0,0,0.15)';
                    }
                    // Clear selection highlight
                    popup.querySelectorAll('.sn-be-color').forEach(s => s.style.borderColor = 'transparent');
                    sw.style.borderColor = '#333';
                    selectedSwatch = sw; // Keep reference but this is the palette swatch, not the row swatch
                });
            });

            // Row swatch clicks — highlight and set as target
            popup.querySelectorAll('.sn-be-swatch').forEach(sw => {
                sw.addEventListener('click', () => {
                    selectedSwatch = sw;
                    selectedRow = sw.closest('.sn-be-row');
                    // Highlight selected
                    popup.querySelectorAll('.sn-be-swatch').forEach(s => s.style.outline = 'none');
                    sw.style.outline = '2px solid #1976d2';
                    sw.style.outlineOffset = '1px';
                });
            });

            // Row delete buttons
            popup.querySelectorAll('.sn-be-del-row').forEach(btn => {
                btn.addEventListener('click', () => {
                    const row = btn.closest('.sn-be-row');
                    if (row) row.remove();
                });
            });

            // Add row button
            popup.querySelector('.sn-be-add-row').addEventListener('click', () => {
                const list = popup.querySelector('#sn-be-list');
                const row = document.createElement('div');
                row.className = 'sn-be-row';
                row.style.cssText = 'display:flex;align-items:center;gap:4px;';
                const defaultColor = '#9e9e9e';
                row.innerHTML = `
                    <div class="sn-be-swatch" style="width:22px;height:22px;border-radius:4px;background:${defaultColor};border:1px solid rgba(0,0,0,0.15);cursor:pointer;flex-shrink:0;"></div>
                    <input class="sn-be-label" value="" placeholder="Label" style="flex-grow:1;border:1px solid #ddd;border-radius:3px;padding:3px 5px;font-size:12px;min-width:60px;">
                    <input class="sn-be-tooltip" value="" placeholder="Tooltip (opt)" style="flex:0 0 100px;border:1px solid #ddd;border-radius:3px;padding:3px 5px;font-size:11px;">
                    <button class="sn-be-del-row" style="border:none;background:transparent;color:#e53935;cursor:pointer;font-size:14px;padding:0 2px;line-height:1;" title="Remove">×</button>
                `;
                list.appendChild(row);

                // Wire up the new swatch
                const newSwatch = row.querySelector('.sn-be-swatch');
                newSwatch.addEventListener('click', () => {
                    selectedSwatch = newSwatch;
                    selectedRow = row;
                    popup.querySelectorAll('.sn-be-swatch').forEach(s => s.style.outline = 'none');
                    newSwatch.style.outline = '2px solid #1976d2';
                    newSwatch.style.outlineOffset = '1px';
                });

                // Wire up delete
                row.querySelector('.sn-be-del-row').addEventListener('click', () => row.remove());

                // Auto-select the new swatch for color picking
                selectedSwatch = newSwatch;
                selectedRow = row;
                popup.querySelectorAll('.sn-be-swatch').forEach(s => s.style.outline = 'none');
                newSwatch.style.outline = '2px solid #1976d2';
                newSwatch.style.outlineOffset = '1px';
            });

            // Close handlers
            popup.querySelectorAll('.sn-badge-editor-close').forEach(el => {
                el.addEventListener('click', () => overlay.remove());
            });
            overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

            // Save
            popup.querySelector('#sn-be-save').addEventListener('click', () => {
                const newName = popup.querySelector('#sn-be-name').value.trim();
                if (!newName) { alert('Badge label cannot be empty.'); return; }

                const rows = popup.querySelectorAll('.sn-be-row');
                const newItems = [];
                let valid = true;
                rows.forEach(row => {
                    const label = row.querySelector('.sn-be-label').value.trim();
                    if (!label) return; // skip empty rows
                    const color = row.querySelector('.sn-be-swatch').style.background || '#9e9e9e';
                    const tooltip = row.querySelector('.sn-be-tooltip').value.trim();
                    if (isStateful) {
                        newItems.push({ label, color, textColor: (color === '#fdd835' || color === '#ffb300' || color === '#c0ca33') ? '#333' : '#fff', tooltip });
                    } else {
                        const id = label.toLowerCase().replace(/[^a-z0-9]/g, '_');
                        newItems.push({ id, label, color, tooltip });
                    }
                });

                if (newItems.length === 0) { alert('At least one ${isStateful ? "state" : "item"} is required.'); return; }

                const newId = isDefault ? typeId : (newName.toLowerCase().replace(/[^a-z0-9]/g, '_'));
                const updatedDef = { ...def };
                if (!isDefault) updatedDef.label = newName;
                if (isStateful) {
                    updatedDef.states = newItems;
                } else {
                    updatedDef.items = newItems;
                }

                this._saveBadgeDef(newId, updatedDef);
                // If the ID changed, remove old def
                if (newId !== typeId && !isDefault) {
                    this._removeBadgeDef(typeId);
                }

                this._renderBadges(w, clientId, GM_getValue('cn_' + clientId, {}));
                overlay.remove();
            });
        },

        /**
         * Formats a date string into a short display format (MM/DD/YY).
         * @param {string} dateStr - The date string to format.
         * @returns {string} Formatted short date or original if unparseable.
         */
        _formatDateShort(dateStr) {
            if (!dateStr) return 'Intake';
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return dateStr;
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const y = String(d.getFullYear()).slice(-2);
            return m + '/' + day + '/' + y;
        },

        _inlineToolbar: null,

        _buildInlineToolbar() {
            if (this._inlineToolbar) return;
            const bar = document.createElement('div');
            bar.className = 'sn-gnotes-inline-bar';
            bar.id = 'cnFormatToolbar';
            bar.style.display = 'none';

            const buttons = [
                { cmd: 'bold', icon: '<b>B</b>', title: 'Bold' },
                { cmd: 'italic', icon: '<i>I</i>', title: 'Italic' },
                { cmd: 'underline', icon: '<u>U</u>', title: 'Underline' },
                { type: 'sep' },
                { cmd: 'insertUnorderedList', icon: '•', title: 'Bullet List' },
                { type: 'sep' },
                {
                    type: 'dropdown', title: 'Text Color', icon: 'A', isColor: true, command: 'foreColor',
                    items: ['#e53935', '#fb8c00', '#43a047', '#1e88e5', '#8e24aa', '#00897b', '#6d4c41', '#333333']
                },
                {
                    type: 'dropdown', title: 'Highlight Color', icon: '✎', isColor: true, command: 'backColor',
                    items: ['#fff9c4', '#ffcdd2', '#e1bee7', '#c8e6c9', '#b2ebf2', '#bbdefb', '#d7ccc8', 'transparent']
                },
                { cmd: 'removeFormat', icon: '⊘', title: 'Clear Formatting' },
            ];

            buttons.forEach(b => {
                if (b.type === 'sep') {
                    const sep = document.createElement('div');
                    sep.className = 'sn-gnotes-inline-sep';
                    bar.appendChild(sep);
                    return;
                }
                if (b.type === 'dropdown') {
                    const container = document.createElement('div');
                    container.className = 'sn-gnotes-dropdown-container';
                    const button = document.createElement('button');
                    button.className = 'sn-gnotes-inline-btn';
                    button.title = b.title;
                    button.innerHTML = b.icon;
                    container.appendChild(button);
                    const menu = document.createElement('div');
                    menu.className = 'sn-gnotes-dropdown-menu';
                    container.appendChild(menu);
                    if (b.isColor) {
                        menu.style.flexDirection = 'row';
                        menu.style.flexWrap = 'wrap';
                        menu.style.width = '124px';
                        b.items.forEach(color => {
                            const swatch = document.createElement('button');
                            swatch.className = 'sn-gnotes-swatch';
                            swatch.style.background = color;
                            if (color === 'transparent') { swatch.innerHTML = '⊘'; swatch.style.lineHeight = '20px'; swatch.style.textAlign = 'center'; swatch.title = 'No Highlight'; }
                            swatch.onmousedown = (e) => { e.preventDefault(); this._executeFormatAction(b.command, color); };
                            menu.appendChild(swatch);
                        });
                    }
                    button.onmousedown = (e) => {
                        e.preventDefault();
                        const isVisible = menu.style.display === 'flex';
                        bar.querySelectorAll('.sn-gnotes-dropdown-menu').forEach(m => m.style.display = 'none');
                        menu.style.display = isVisible ? 'none' : 'flex';
                    };
                    bar.appendChild(container);
                    return;
                }
                const btn = document.createElement('button');
                btn.className = 'sn-gnotes-inline-btn';
                btn.innerHTML = b.icon;
                btn.title = b.title;
                btn.onmousedown = (e) => { e.preventDefault(); this._executeFormatAction(b.cmd, b.value || null); };
                bar.appendChild(btn);
            });

            document.body.appendChild(bar);
            this._inlineToolbar = bar;
            bar.addEventListener('mousedown', (e) => e.preventDefault());
        },

        _checkSelection() {
            const sel = window.getSelection();
            const editor = document.getElementById('sn-notes');
            if (!sel || sel.isCollapsed || !editor || !editor.contains(sel.anchorNode)) { this._hideInlineToolbar(); return; }
            const range = sel.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            if (rect.width === 0) { this._hideInlineToolbar(); return; }
            const bar = this._inlineToolbar;
            bar.style.display = 'flex';
            const barW = bar.offsetWidth || 220;
            let left = rect.left + (rect.width / 2) - (barW / 2);
            let top = rect.top - 44;
            if (left < 4) left = 4;
            if (left + barW > window.innerWidth - 4) left = window.innerWidth - barW - 4;
            if (top < 4) top = rect.bottom + 8;
            bar.style.left = left + 'px';
            bar.style.top = top + 'px';
        },

        _hideInlineToolbar() {
            if (this._inlineToolbar) {
                this._inlineToolbar.style.display = 'none';
                this._inlineToolbar.querySelectorAll('.sn-gnotes-dropdown-menu').forEach(menu => { menu.style.display = 'none'; });
            }
        },

        _executeFormatAction(cmd, value = null) {
            if (cmd === 'insertCheckbox') {
                const sel = window.getSelection();
                if (!sel || !sel.rangeCount) return;
                const range = sel.getRangeAt(0);
                const editor = document.getElementById('sn-notes');

                // Find the direct child block of the editor
                let block = range.commonAncestorContainer;
                while (block && block.parentNode !== editor && block !== editor) {
                    block = block.parentNode;
                }

                // Convert block to checkbox if it's a direct child (valid block)
                if (block && block.parentNode === editor) {
                    const text = block.textContent;
                    const div = document.createElement('div');
                    div.className = 'sn-todo-item';
                    div.setAttribute('draggable', 'true');
                    div.setAttribute('data-checked', 'false');
                    const safeText = text.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' })[m]);
                    div.innerHTML = `<input type="checkbox"><span contenteditable="true">${safeText}</span>`;
                    div.setAttribute('contenteditable', 'false');
                    block.replaceWith(div);

                    // Restore cursor to the end of the new item
                    const span = div.querySelector('span');
                    if (span) {
                        const newRange = document.createRange();
                        newRange.selectNodeContents(span);
                        newRange.collapse(false);
                        sel.removeAllRanges();
                        sel.addRange(newRange);
                    }

                    this._hideInlineToolbar();
                    return;
                }
            }

            document.execCommand(cmd, false, value);
            this._hideInlineToolbar();
            // The selection is intentionally not collapsed to preserve user context.
        },

        /**
         * Resolves the current note colors based on manual selection, timezone, and global themes.
         * 
         * @param {string|null} tzKey - The timezone abbreviation (e.g., 'EST').
         * @param {Object} [savedData={}] - Persisted data for the client note, which may contain a `customColor`.
         * @returns {[string, string]} A tuple containing `[bodyColor, headerColor]`.
         */
        getNoteColors(tzKey, savedData = {}) {
            // Priority 1: Manually set custom color for this specific note
            if (savedData.customColor) {
                let headerTheme = Object.values(app.Core.Themes).find(t => t.lighter === savedData.customColor);
                const headerColor = headerTheme ? headerTheme.light : app.Core.Themes['Yellow'].light;
                return [savedData.customColor, headerColor];
            }

            // Priority 2 & 3: Global settings (Timezone > UI Theme > Default)
            const useTzColor = GM_getValue('sn_tz_note_color', true);
            const followTheme = GM_getValue('sn_note_follow_theme', true);
            const currentThemeName = GM_getValue('sn_ui_theme', 'Teal');
            const defaultNoteColor = GM_getValue('sn_note_default_color', app.Core.Themes['Yellow'].lighter);
            let bodyColor, headerColor;

            if (useTzColor && tzKey && app.Core.NoteThemes.colors[tzKey]) {
                [bodyColor, headerColor] = app.Core.NoteThemes.colors[tzKey];
            } else {
                if (followTheme) {
                    const theme = app.Core.Themes[currentThemeName];
                    bodyColor = theme.lighter;
                    headerColor = theme.light;
                } else {
                    bodyColor = defaultNoteColor;
                    // Find which theme this color belongs to for the header
                    let headerTheme = Object.values(app.Core.Themes).find(t => t.lighter === bodyColor);
                    headerColor = headerTheme ? headerTheme.light : app.Core.Themes['Yellow'].light;
                }
            }
            return [bodyColor, headerColor];
        },

        /**
         * Updates the physical background colors of the client note window.
         * 
         * @param {string} clientId - The 18-character Salesforce Client ID.
         */
        updateNoteColor(clientId) {
            const w = document.getElementById('sn-client-note');
            if (!w) return;

            const savedData = GM_getValue('cn_' + clientId, {});
            const tzKey = w.querySelector('#sn-tz-select').value;
            const [newBodyColor, newHeaderColor] = this.getNoteColors(tzKey, savedData);

            w.style.backgroundColor = newBodyColor;
            w.querySelector('#sn-cn-header').style.background = newHeaderColor;
        },

        /**
         * Determines the appropriate timezone based on state and city context.
         * 
         * @param {string} state - The 2-letter state abbreviation.
         * @param {string} [city] - The city name for exceptions.
         * @returns {string|null} The time zone abbreviation or null if unrecognized.
         */
        detectTimezone(state, city) {
            if (!state) return null;
            const s = state.toUpperCase();
            const c = city ? city.toUpperCase().trim() : '';
            if (app.Core.NoteThemes.specialTZ[s] && app.Core.NoteThemes.specialTZ[s][c]) return app.Core.NoteThemes.specialTZ[s][c];
            return app.Core.NoteThemes.stateTZ[s] || null;
        },

        /**
         * Constructs and initializes the main Client Note UI window for a specific client.
         * 
         * @param {string} clientId - The 18-character Salesforce Client ID.
         */
        create(clientId) {
            const id = 'sn-client-note';
            const existingW = document.getElementById(id);
            if (existingW) {
                // If it's the SAME client, just toggle visibility
                if (existingW.dataset.clientId === clientId) {
                    app.Core.Windows.toggle(id);
                    if (existingW.style.display !== 'none') {
                        this._clearStatusHighlights(existingW);
                        this._startStatusPolling(clientId, existingW);
                    }
                    return;
                } else {
                    // Different client record! Destroy the old one to avoid data leakage and stale closures.
                    console.log(`[ClientNote] Switching client from ${existingW.dataset.clientId} to ${clientId}. Re-initializing.`);
                    this.destroy(existingW.dataset.clientId, true);
                    // Continue to create new window for new client
                }
            }

            const harvested = app.Core.Scraper.harvestFields();
            const savedData = GM_getValue('cn_' + clientId, {});
            const savedFontSize = GM_getValue('cn_font_global', '12px');
            const detectedTZ = this.detectTimezone(savedData.state, savedData.city);
            const initialTZ = savedData.tz || detectedTZ || null;

            const [bodyColor, headerColor] = this.getNoteColors(initialTZ, savedData);


            let finalHeaderColor = headerColor;
            if (savedData.customColor) {
                let headerTheme = Object.values(app.Core.Themes).find(t => t.lighter === savedData.customColor);
                if (headerTheme) finalHeaderColor = headerTheme.light;
            }

            // Initialize Toolbar
            this._buildInlineToolbar();

            // Listen for dashboard setting changes
            const settingsToWatch = ['sn_ui_theme', 'sn_tz_note_color', 'sn_note_follow_theme', 'sn_note_default_color', 'cn_font_global'];
            settingsToWatch.forEach(key => {
                const lKey = `${key}_${clientId}`;
                if (!this.listeners[lKey]) { // Prevent adding multiple listeners for the same key
                    this.listeners[lKey] = GM_addValueChangeListener(key, (name, oldVal, newVal, remote) => {
                        if (name === 'cn_font_global') {
                            w.style.fontSize = newVal;
                        } else {
                            this.updateNoteColor(clientId);
                        }
                    });
                }
            });

            const w = document.createElement('div');
            w.id = id; w.className = 'sn-window';
            w.dataset.clientId = clientId;

            const pageWidth = window.innerWidth;
            const pageHeight = window.innerHeight;
            const defaultWidth = 380;
            const defaultHeight = 320;

            const defPos = GM_getValue('def_pos_CN', {
                width: defaultWidth + 'px',
                height: defaultHeight + 'px',
                top: ((pageHeight - defaultHeight) / 2) + 'px',
                left: ((pageWidth - defaultWidth) / 2) + 'px'
            });

            w.style.width = defPos.width; w.style.height = defPos.height;
            w.style.backgroundColor = bodyColor; // Color is set based on getNoteColors hierarchy
            w.style.top = defPos.top; w.style.left = defPos.left;
            w.style.fontSize = savedFontSize;

            const paletteHTML = this.presets.map(c => `<div class="sn-swatch" style="background:${c}" data-col="${c}"></div>`).join('') + `<div class="sn-swatch" id="sn-reset-color-swatch" title="Reset to Default" style="background: #fff; border: 1px dashed #999; display: flex; align-items: center; justify-content: center; font-size: 14px; color: #555;">⌫</div>`;

            // Saved data takes priority, if not exist > take live data. 
            const statusDisplay = ClientNote._formatStatusText(savedData.status || harvested.status || '');
            const ssClassDisplay = ClientNote._formatStatusText(savedData.ssClassification || harvested['ss classification'] || '');
            const substatusDisplay = ClientNote._formatStatusText(savedData.substatus || harvested['sub-status'] || '');
            w.innerHTML = `
                    <style>
                        #sn-notes:empty::before { content: attr(placeholder); color: #999; pointer-events: none; }
                        #sn-todo-divider:hover { background: rgba(0,0,0,0.12) !important; }
                        .sn-todo-item { display: flex; align-items: center; margin-bottom: 2px; position: relative; }
                        .sn-todo-item input[type="checkbox"] { margin-right: 8px; flex-shrink: 0; cursor: pointer; }
                        .sn-todo-item .sn-todo-input { flex-grow: 1; border: none; background: transparent; font-family: sans-serif; font-size: inherit; outline: none; min-width: 10px; padding: 0; }
                        .sn-todo-item[data-checked="true"] .sn-todo-input { text-decoration: line-through; color: #888; }
                        .sn-todo-item:not(.has-content) input[type="checkbox"] { display: none; }
                        .sn-todo-item.dragging { opacity: 0.5; background: #e0e0e0; }
                        .sn-todo-del-btn { position:absolute; right:0; top:50%; transform:translateY(-50%); display:none; border:none; background:#e57373; color:white; width:16px; height:16px; border-radius:50%; font-size:10px; line-height:16px; text-align:center; cursor:pointer; padding:0; }
                        .sn-todo-item:hover .sn-todo-del-btn { display:block; }
                        .sn-todo-del-btn:hover { background:#d32f2f; }
                        .sn-todo-header-btn { cursor:pointer; border:none; background:transparent; color:#999; font-size:0.8em; font-weight:bold; padding:1px 4px; border-radius:3px; }
                        .sn-todo-header-btn:hover { background:rgba(0,0,0,0.06); color:#555; }
                        #sn-notes ul { list-style-type: disc; padding-left: 20px; margin: 4px 0; }
                        #sn-notes ol { list-style-type: decimal; padding-left: 20px; margin: 4px 0; }
                        /* Badge Strip */
                        #sn-badge-strip { flex-shrink:0; display:flex; align-items:center; gap:3px; padding:3px 6px; border-top:1px solid rgba(0,0,0,0.06); border-bottom:1px solid rgba(0,0,0,0.06); background:rgba(255,255,255,0.15); flex-wrap:wrap; min-height:22px; position:relative; }
                        .sn-badge { display:inline-flex; align-items:center; padding:0 6px; height:18px; border-radius:9px; font-size:10px; font-weight:bold; white-space:nowrap; cursor:pointer; line-height:18px; user-select:none; transition:box-shadow 0.15s; }
                        .sn-badge:hover { box-shadow:0 1px 4px rgba(0,0,0,0.25); }
                        .sn-badge-dropdown { font-size:12px; }
                        .sn-badge-dropdown > div:hover { background:#f0f0f0; }
                        #sn-badge-add-btn { display:inline-flex; align-items:center; justify-content:center; width:18px; height:18px; border-radius:9px; border:1px dashed #aaa; background:transparent; color:#888; font-size:14px; font-weight:bold; cursor:pointer; line-height:1; padding:0; flex-shrink:0; transition:all 0.15s; }
                        #sn-badge-add-btn:hover { background:rgba(0,0,0,0.06); border-color:#666; color:#555; }
                        /* Layout switch */
                        #sn-layout-switch:hover { background:rgba(255,255,255,0.1); }
                        .sn-layout-flipped #sn-spine-strip { order:1; border-right:none !important; border-left:1px solid rgba(0,0,0,0.2) !important; }
                        .sn-layout-flipped #sn-side-panel { right:auto !important; left:100% !important; border:1px solid #999; border-left:none !important; box-shadow:2px 0 5px rgba(0,0,0,0.1) !important; }
                        .sn-layout-flipped .sn-panel-resizer-left { left:auto !important; right:0 !important; }
                    </style>
                    <div id="sn-wrapper" style="position:relative; width:100%; height:100%; display:flex; flex-direction:row;">

                        <div id="sn-spine-strip" style="width:28px; background:var(--sn-primary-text); display:flex; flex-direction:column; align-items:center; padding-top:10px; border-right:1px solid rgba(0,0,0,0.2); z-index:20; flex-shrink:0;">
                            <button id="sn-refresh-btn" title="Refresh Scraped Data" style="border:none; background:transparent; cursor:pointer; font-size:14px; margin-bottom:5px; color:var(--sn-bg-light); transition:transform 0.2s;">🔄</button>
                            <div class="sn-spine-btn" data-panel="info" title="Info" style="writing-mode:vertical-rl; text-orientation:mixed; transform:rotate(180deg); padding:15px 5px; color:var(--sn-bg-light); cursor:pointer; font-weight:normal; font-size:14px; text-transform:uppercase; margin-bottom:5px; transition:background 0.2s;">Info</div>
                            <div class="sn-spine-btn" data-panel="ssa" title="SSA Contacts" style="writing-mode:vertical-rl; text-orientation:mixed; transform:rotate(180deg); padding:15px 5px; color:var(--sn-bg-light); cursor:pointer; font-weight:normal; font-size:14px; text-transform:uppercase; margin-bottom:5px; transition:background 0.2s;">SSA</div>
                            <div class="sn-spine-btn" data-panel="dds" title="DDS Office" style="writing-mode:vertical-rl; text-orientation:mixed; transform:rotate(180deg); padding:15px 5px; color:var(--sn-bg-light); cursor:pointer; font-weight:normal; font-size:14px; text-transform:uppercase; margin-bottom:5px; transition:background 0.2s;">DDS</div>
                            <div class="sn-spine-btn" data-panel="scrape" title="Matter Data" style="writing-mode:vertical-rl; text-orientation:mixed; transform:rotate(180deg); padding:15px 5px; color:var(--sn-bg-light); cursor:pointer; font-weight:normal; font-size:14px; text-transform:uppercase; margin-bottom:5px; transition:background 0.2s;">MATTER</div>
                            <!-- <div class="sn-spine-btn" data-panel="matter" title="Matter Details" style="writing-mode:vertical-rl; text-orientation:mixed; transform:rotate(180deg); padding:15px 5px; color:var(--sn-bg-light); cursor:pointer; font-weight:normal; font-size:14px; text-transform:uppercase; margin-bottom:5px; transition:background 0.2s;">Matter</div> -->
                            <button id="sn-layout-switch" title="Switch Layout" style="margin-top:auto; border:none; background:transparent; cursor:pointer; font-size:18px; padding:4px 0; color:var(--sn-bg-light); transition:transform 0.3s;">⇄</button>
                        </div>

                        <div id="sn-side-panel" style="position:absolute; right:100%; top:0; bottom:0; width:0px; display:none; flex-direction:column; background:rgba(255,255,255,0.95); border:1px solid #999; border-right:none; box-shadow:-2px 0 5px rgba(0,0,0,0.1); font-size:inherit;">
                             <div id="sn-panel-header" style="padding:5px; font-weight:bold; background:var(--sn-bg-light); border-bottom:1px solid #999; display:flex; align-items:center; color:#333;">
                                 <span id="sn-panel-title" style="margin-right:auto;">Info</span>
                                 <button id="sn-fetch-btn" title="Fetch SSN & DOB from SSD Form" style="display:block; cursor:pointer; border:1px solid #999; background:#eee; width:22px; height:22px; border-radius:3px; margin-right:5px; font-size:14px; line-height:1;">📋</button>
                                <button id="sn-side-font-dec" style="cursor:pointer; border:1px solid #999; background:#eee; width:18px; border-radius:3px; margin-right:2px;">-</button>
                                <button id="sn-side-font-inc" style="cursor:pointer; border:1px solid #999; background:#eee; width:18px; border-radius:3px; margin-right:5px;">+</button>
                                <button id="sn-panel-close" style="border:none; background:none; cursor:pointer; font-weight:bold;">×</button>
                             </div>
                             <div id="sn-panel-body" style="padding:0px; overflow-y:auto; flex-grow:1;"></div>
                             <div class="sn-panel-resizer-left" style="width:5px; cursor:col-resize; height:100%; position:absolute; left:0; top:0; z-index:10;"></div>
                        </div>

                        <div style="flex-grow:1; display:flex; flex-direction:column; min-width:200px; height:100%; overflow:hidden;">
                            
                            <div class="sn-header" id="sn-cn-header" style="background:${finalHeaderColor}; border-bottom:1px solid rgba(0,0,0,0.1); padding:4px; display:flex; align-items:center;">
                                
                                <span id="sn-cl-name" style="font-weight:bold; margin-left:4px; color:#333;">${savedData.name || harvested['matter name'] || 'Client Note'}</span>
                                <div style="flex-grow:1;"></div>
                                <span id="sn-city" style="font-weight:bold; color:var(--sn-primary-dark);">${savedData.city || ''}</span>
                                <span style="margin:0 4px; font-weight:bold; color:#555;">-</span>
                                <span id="sn-state" style="font-weight:bold; color:var(--sn-primary-dark);">${savedData.state || ''}</span>
                                <span style="margin:0 4px; font-weight:bold; color:#555;">-</span>
                                <span id="sn-time" style="font-weight:bold; font-size:1em; color:#333; min-width:60px;"></span>
                                <div style="display:flex; align-items:center; margin-left:8px;">
                                    <select id="sn-tz-select" style="display:none;">
                                        <option value="EDT">EDT</option><option value="CDT">CDT</option><option value="MDT">MDT</option>
                                        <option value="PDT">PDT</option><option value="AKDT">AKDT</option><option value="HST">HST</option>
                                    </select>
                                    <button id="sn-min-btn" style="cursor:pointer; background:none; border:none; font-weight:bold; padding:0 5px;">_</button>
                                </div>
                            </div>

                            <div id="sn-status-bar" style="padding: 5px; border-bottom:1px solid #ccc; display:flex; align-items:center; font-size: 0.9em; gap:5px; flex-wrap:wrap;">
                                <span id="sn-status" title="Status" style="color:#333; cursor:pointer; font-weight:bold;">${statusDisplay}</span>
                                <span style="color:#aaa;">-</span>
                                <span id="sn-ss-classification" title="SS Classification" style="color:#333; cursor:pointer;">${ssClassDisplay}</span>
                                <span style="color:#aaa;">-</span>
                                <span id="sn-substatus" title="Sub-status" style="color:#333; cursor:pointer;">${substatusDisplay}</span>
                                <span id="sn-ptr-indicator" title="PTR Case" style="display:none; color:#d32f2f; font-weight:bold;">PTR</span>
                                <span id="sn-company-badge" title="Click to toggle company mode" style="margin-left:auto; cursor:pointer; font-weight:bold; padding:1px 8px; border-radius:3px; font-size:0.85em; user-select:none; letter-spacing:0.3px;">${(() => { const c = GM_getValue('sn_company_badge', 'KD'); return c === 'TDA' ? 'TDA' : 'KD'; })()}</span>
                            </div>

                            <div style="display:flex; flex-direction:column; flex-grow:1; height:100%; overflow:hidden;">
                                <div id="sn-note-wrapper" style="position:relative; flex-grow:1; min-height:50px;">
                                    <div id="sn-notes" contenteditable="true" style="width:100%; height:100%; resize:none; border:none; padding:8px; background:transparent; font-family:sans-serif; font-size:inherit; box-sizing:border-box; overflow-y:auto;" placeholder="Case notes..."></div>
                                </div>
                                <!-- Badge Strip -->
                                <div id="sn-badge-strip">
                                    <div id="sn-badges-container" style="display:flex;flex-wrap:wrap;align-items:center;gap:3px;flex-grow:1;"></div>
                                    <button id="sn-badge-add-btn" title="Add or remove badges">+</button>
                                </div>
                                <!-- Resizable divider for Todos -->
                                <div id="sn-todo-divider" style="height:6px; cursor:row-resize; background:rgba(0,0,0,0.06); display:flex; align-items:center; justify-content:center; flex-shrink:0; user-select:none;">
                                    <div style="width:24px; height:3px; background:rgba(0,0,0,0.18); border-radius:2px;"></div>
                                </div>
                                <!-- Dedicated Todo Area (3 rows default) -->
                                <div id="sn-todo-wrapper" style="flex-shrink:0; overflow:hidden; display:flex; flex-direction:column;" data-height="78">
                                    <div style="font-size:0.8em; padding:1px 8px; color:#999; font-weight:bold; border-bottom:1px solid rgba(0,0,0,0.06); flex-shrink:0; display:flex; align-items:center; gap:4px;">
                                        <span style="flex-grow:1;">To-Do</span>
                                        <button id="sn-clear-completed" class="sn-todo-header-btn" title="Remove all checked items">Clear ✓</button>
                                    </div>
                                    <div id="sn-todo-list" style="width:100%; flex-grow:1; resize:none; border:none; padding:4px 8px; background:rgba(255,255,255,0.25); font-family:sans-serif; font-size:inherit; box-sizing:border-box; outline:none; overflow-y:auto; min-height:54px;"></div>
                                </div>
                            </div>

                            <div style="padding:4px 8px; border-top:1px solid #ccc; background:rgba(255,255,255,0.5); display:flex; align-items:center;">
                                <label style="font-size:0.9em; font-weight:bold; margin-right:8px; cursor:pointer;">
                                    <input type="checkbox" id="sn-revisit-check" ${savedData.revisitActive ? 'checked' : ''}> Revisit
                                </label>
                                <input type="date" id="sn-revisit-date" value="${savedData.revisit || ''}" style="border:1px solid #999; border-radius:3px; font-size:0.9em; padding:1px;">

                                <div style="margin-left:auto; margin-right:auto; display:flex; align-items:center; gap:5px;">
                                    <button id="sn-font-dec" style="cursor:pointer; border:1px solid #999; background:#eee; width:20px; border-radius:3px; font-size:0.8em;">-</button>
                                    <span style="font-size:0.8em; color:#555;">Aa</span>
                                    <button id="sn-font-inc" style="cursor:pointer; border:1px solid #999; background:#eee; width:20px; border-radius:3px; font-size:0.8em;">+</button>
                                </div>

                                <div class="sn-cp-dropdown" style="position: relative; margin-right:5px;">
                                    <button class="sn-cp-btn" title="Change Color">🎨</button>
                                    <div class="sn-cp-content" style="display:none; position:absolute; bottom:100%; right:0; background:white; border:1px solid #999; padding:5px; border-radius:4px; box-shadow:0 2px 5px rgba(0,0,0,0.2); margin-bottom:5px; z-index: 25;">${paletteHTML}</div>
                                </div>
                                <button id="sn-del-btn" style="cursor:pointer; background:none; border:none; font-size:12px;" title="Delete Data & Close">🗑️</button>
                            </div>
                        </div>
                    </div>

                    <div class="sn-resizer rs-n"></div><div class="sn-resizer rs-s"></div>
                    <div class="sn-resizer rs-e"></div><div class="sn-resizer rs-w"></div>
                    <div class="sn-resizer rs-ne"></div><div class="sn-resizer rs-nw"></div>
                    <div class="sn-resizer rs-se"></div><div class="sn-resizer rs-sw"></div>
                `;
            document.body.appendChild(w);
            app.Core.Windows.setup(w, w.querySelector('#sn-min-btn'), w.querySelector('#sn-cn-header'), 'CN');

            // --- REVISIT DATE PICKER ---
            const revisitCheck = w.querySelector('#sn-revisit-check');
            const revisitDate = w.querySelector('#sn-revisit-date');

            // Set initial visibility based on saved state
            revisitDate.style.display = revisitCheck.checked ? 'inline-block' : 'none';

            revisitCheck.addEventListener('click', (e) => {
                if (e.target.checked) {
                    revisitDate.style.display = 'inline-block';
                    try {
                        // Attempt to open the picker. This may fail due to browser security,
                        // but the input is now visible for manual interaction.
                        revisitDate.showPicker();
                    } catch (err) {
                        console.warn('[ClientNote] Could not programmatically open date picker. The input is now visible for manual selection.', err);
                    }
                } else {
                    // When unchecking, hide the input and clear its value.
                    revisitDate.style.display = 'none';
                    revisitDate.value = '';
                }
                // Manually trigger a save to immediately update dashboard and taskbar without debounce.
                saveState();
            });

            // --- SIDEBAR (Info & Fax) ---
            const sidePanel = w.querySelector('#sn-side-panel');
            const sideBody = w.querySelector('#sn-panel-body');
            const sideTitle = w.querySelector('#sn-panel-title');

            w.querySelector('#sn-side-font-dec').onclick = (e) => { e.stopPropagation(); updateFont(-1); };
            w.querySelector('#sn-side-font-inc').onclick = (e) => { e.stopPropagation(); updateFont(1); };

            const togglePanel = (type) => {
                const titleMap = { 'info': 'Client Info', 'ssa': 'SSA Contacts', 'dds': 'DDS Office', 'scrape': 'Matter' };
                const isSame = sideTitle.innerText === titleMap[type];

                w.querySelectorAll('.sn-spine-btn').forEach(b => {
                    b.style.color = 'var(--sn-bg-light)';
                    b.style.background = 'transparent';
                });

                if (sidePanel.style.display === 'flex' && isSame) {
                    sidePanel.style.display = 'none';
                    sidePanel.style.width = '0px';
                } else {
                    sidePanel.style.display = 'flex'; sidePanel.style.width = '250px';
                    sideTitle.innerText = titleMap[type];

                    const activeBtn = w.querySelector(`.sn-spine-btn[data-panel="${type}"]`);
                    if (activeBtn) {
                        activeBtn.style.color = 'white';
                        activeBtn.style.background = 'rgba(255,255,255,0.1)';
                    }

                    sideBody.innerHTML = '';
                    const context = { clientId, w, ClientNote: this, app: window.CM_App, saveState };
                    if (type === 'ssa') {
                        app.Features.SSAPanel.render(sideBody, context);
                    } else if (type === 'dds') {
                        app.Features.DDSPanel.render(sideBody, context);
                    } else if (type === 'info') {
                        app.Features.InfoPanel.render(sideBody, context);
                    } else if (type === 'scrape') {
                        app.Features.MatterPanel.render(sideBody, context);
                    }
                }
            };

            w.querySelector('#sn-panel-close').onclick = () => { sidePanel.style.display = 'none'; sidePanel.style.width = '0'; };
            w.querySelectorAll('.sn-spine-btn').forEach(btn => btn.onclick = () => togglePanel(btn.getAttribute('data-panel')));

            // --- FETCH BUTTON (permanent in header bar) ---
            const fetchBtn = w.querySelector('#sn-fetch-btn');
            if (fetchBtn) {
                fetchBtn.onclick = () => {
                    fetchBtn.disabled = true;
                    fetchBtn.style.opacity = '0.5';
                    fetchBtn.style.cursor = 'wait';
                    fetchBtn.innerHTML = '⏳';

                    const id15 = clientId.substring(0, 15);
                    const targetURL = `https://kdcv1.my.site.com/forms/s/?uuid=a0UfL000002vlqfUAA&recordid=${id15}&clientId=${clientId}`;

                    const scrapeListenKey = `cn_scrape_result_${clientId}`;
                    chrome.storage.local.remove(scrapeListenKey);

                    const tempListenerId = GM_addValueChangeListener(scrapeListenKey, (name, old_value, new_value, remote) => {
                        if (remote && new_value && Object.keys(new_value).length > 0) {
                            fetchBtn.disabled = false;
                            fetchBtn.innerHTML = '📋';
                            fetchBtn.style.opacity = '1';
                            fetchBtn.style.cursor = 'pointer';

                            // Save fields from the SSD form fetch that are NOT available
                            // from the Salesforce page sidebar (getAllPageData).
                            // Phone, Witness, Email, medical info only come from the SSD form.
                            const ssdFieldsToSave = ['Address','Phone','Witness','Email','State','City','POB','Parents','prefix','Medical Provider','Assistive Devices','Condition'];
                            const witnessLocked = !!GM_getValue('cn_wit_lock_' + clientId, false);
                            const existingFormData = GM_getValue('cn_form_data_' + clientId, {});
                            const fetchData = {};
                            ssdFieldsToSave.forEach(k => {
                                // Skip Witness if locked
                                if (k === 'Witness' && witnessLocked) return;
                                // Only skip Medical Provider / Assistive Devices if already saved (user-edited)
                                if ((k === 'Medical Provider' || k === 'Assistive Devices') && existingFormData[k]) return;
                                if (new_value[k]) fetchData[k] = new_value[k];
                            });
                            if (Object.keys(fetchData).length > 0) {
                                ClientNote.updateAndSaveData(clientId, fetchData);
                                ClientNote.updateUI(fetchData);
                                // Auto-open Info panel to show fetched data
                                const infoSpineBtn = w.querySelector('.sn-spine-btn[data-panel="info"]');
                                if (infoSpineBtn) infoSpineBtn.click();
                            }

                            if (openedWindowId && chrome.runtime?.id) {
                                chrome.runtime.sendMessage({ type: 'CLOSE_WINDOW', windowId: openedWindowId });
                                openedWindowId = null;
                            }

                            GM_removeValueChangeListener(tempListenerId);
                            GM_deleteValue(scrapeListenKey);
                        }
                    });

                    let openedWindowId = null;
                    if (chrome.runtime?.id) {
                        chrome.runtime.sendMessage({ type: 'OPEN_SCRAPER_WINDOW', url: targetURL }, (response) => {
                            if (response && response.success && response.windowId) {
                                openedWindowId = response.windowId;
                            } else if (response && response.error) {
                                console.error("[Scraper] Window failed to open:", response.error);
                                GM_removeValueChangeListener(tempListenerId);
                                fetchBtn.disabled = false;
                                fetchBtn.innerHTML = '📋';
                                fetchBtn.style.opacity = '1';
                                fetchBtn.style.cursor = 'pointer';
                            }
                        });
                    } else {
                        console.error("[Scraper] Extension context invalidated. Please refresh the page.");
                    }

                    setTimeout(() => {
                        if (fetchBtn.disabled) {
                            fetchBtn.disabled = false;
                            fetchBtn.innerHTML = '📋';
                            if (openedWindowId && chrome.runtime?.id) {
                                chrome.runtime.sendMessage({ type: 'CLOSE_WINDOW', windowId: openedWindowId });
                                openedWindowId = null;
                            }
                            GM_removeValueChangeListener(tempListenerId);
                            fetchBtn.style.cursor = 'pointer';
                            fetchBtn.style.opacity = '1';
                        }
                    }, 6000);
                };
            }

            const sideResizer = w.querySelector('.sn-panel-resizer-left');
            sideResizer.onmousedown = (e) => {
                e.preventDefault(); const startX = e.clientX, startW = parseInt(window.getComputedStyle(sidePanel).width);
                const resizerFlipped = wrapper.classList.contains('sn-layout-flipped');
                const onMove = (mv) => {
                    const delta = resizerFlipped ? (mv.clientX - startX) : (startX - mv.clientX);
                    sidePanel.style.width = (startW + delta) + 'px';
                };
                const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
                document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
            };

            // --- UTILS (Main Font, Save, Resizers) ---
            const updateFont = (delta) => {
                let current = parseInt(w.style.fontSize) || 12;
                let newSize = Math.max(10, Math.min(18, current + delta)); // Increased max to 18px
                w.style.fontSize = newSize + 'px';
                GM_setValue('cn_font_global', newSize + 'px');

                // Immediately trigger resize of side panel textareas if visible
                const sidePanel = w.querySelector('#sn-side-panel');
                if (sidePanel && sidePanel.style.display !== 'none' && app.Features.InfoPanel) {
                    app.Features.InfoPanel.setupAutoResize(sidePanel);
                }
            };
            w.querySelector('#sn-font-inc').onclick = () => updateFont(1);
            w.querySelector('#sn-font-dec').onclick = () => updateFont(-1);

            // Check initial data state for buttons
            this.checkStoredData(clientId);

            // --- LAYOUT SWITCH (flip spine+side panel to right side) ---
            const wrapper = w.querySelector('#sn-wrapper');
            const layoutSwitchBtn = w.querySelector('#sn-layout-switch');
            const isFlipped = GM_getValue('cn_layout_flipped', false);
            if (isFlipped) {
                wrapper.classList.add('sn-layout-flipped');
                layoutSwitchBtn.style.transform = 'scaleX(-1)';
            }
            layoutSwitchBtn.onclick = () => {
                const nowFlipped = wrapper.classList.toggle('sn-layout-flipped');
                GM_setValue('cn_layout_flipped', nowFlipped);
                layoutSwitchBtn.style.transform = nowFlipped ? 'scaleX(-1)' : '';
            };

            // --- COLOR PICKER DROPDOWN ---
            const cpDropdown = w.querySelector('.sn-cp-dropdown');
            const cpContent = cpDropdown.querySelector('.sn-cp-content');
            const cpBtn = cpDropdown.querySelector('.sn-cp-btn');

            // Move panel to be a direct child of the window, escaping any overflow:hidden containers
            w.appendChild(cpContent);

            cpBtn.onclick = (e) => {
                e.stopPropagation();
                if (cpContent.style.display === 'flex') {
                    cpContent.style.display = 'none';
                } else {
                    const btnRect = cpBtn.getBoundingClientRect();
                    // Set fixed position before showing to avoid flicker
                    cpContent.style.position = 'fixed';
                    cpContent.style.bottom = 'auto';
                    cpContent.style.right = 'auto';
                    cpContent.style.display = 'flex'; // Now display to measure

                    // Position panel above the button, aligning right edges
                    cpContent.style.top = (btnRect.top - cpContent.offsetHeight - 5) + 'px'; // 5px is original margin
                    cpContent.style.left = (btnRect.right - cpContent.offsetWidth) + 'px';
                }
            };

            const outsideClickListener = (event) => {
                if (!document.body.contains(w)) {
                    document.removeEventListener('click', outsideClickListener);
                    return;
                }
                // Hide if clicking outside of the button AND the now-independent panel
                if (!cpBtn.contains(event.target) && !cpContent.contains(event.target) && cpContent.style.display === 'flex') {
                    cpContent.style.display = 'none';
                }
            };
            document.addEventListener('click', outsideClickListener);

            // Store reference for cleanup in destroy()
            this.listeners[`cpClickListener_${clientId}`] = outsideClickListener;

            w.querySelectorAll('.sn-swatch').forEach(sw => {
                sw.onclick = () => {
                    const newColor = sw.getAttribute('data-col');
                    const currentData = GM_getValue('cn_' + clientId, {});
                    if (newColor) {
                        currentData.customColor = newColor;
                    } else {
                        delete currentData.customColor;
                    }
                    GM_setValue('cn_' + clientId, currentData);
                    this.updateNoteColor(clientId);
                    cpContent.style.display = 'none'; // Hide after selection
                };
            });

            // --- TODO LIST LOGIC ---
            const notesContainer = w.querySelector('#sn-notes');

            const makeTodoElement = (text = '', checked = false) => {
                const safeText = text.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
                const checkedAttr = checked ? 'checked' : '';
                return `<div class="sn-todo-item" draggable="true" data-checked="${checked}"><input type="checkbox" ${checkedAttr}><input type="text" class="sn-todo-input" value="${safeText}" placeholder="To-do item..."><button class="sn-todo-del-btn" title="Delete item">×</button></div>`;
            };

            const renderTodosContent = (todosData) => {
                // New format: JSON array of {text, checked} objects
                if (Array.isArray(todosData)) {
                    if (todosData.length === 0) return makeTodoElement() + makeTodoElement() + makeTodoElement();
                    return todosData.map(t => makeTodoElement(t.text || '', t.checked || false)).join('');
                }
                // String: could be JSON array or old HTML format
                if (typeof todosData === 'string') {
                    // Try JSON array
                    try {
                        const parsed = JSON.parse(todosData);
                        if (Array.isArray(parsed)) {
                            if (parsed.length === 0) return makeTodoElement() + makeTodoElement() + makeTodoElement();
                            return parsed.map(t => makeTodoElement(t.text || '', t.checked || false)).join('');
                        }
                    } catch(e) {}
                    // Old HTML format fallback or empty
                    if (!todosData.trim()) {
                        return makeTodoElement() + makeTodoElement() + makeTodoElement();
                    }
                    return todosData;
                }
                // Empty / undefined
                return makeTodoElement() + makeTodoElement() + makeTodoElement();
            };

            const renderNotesContent = (notesString) => {
                if (!notesString) return '';

                // Detect HTML format (Rich Text) vs Legacy Line format
                // Check for ANY HTML tag pattern to catch <font>, <span>, <br>, <p>, etc.
                if (/<[a-z][\s\S]*?>/i.test(notesString.trim()) || notesString.includes('</')) {
                    return notesString;
                }

                // Legacy Line Parser
                const lines = notesString.split('\n');
                const escapeHTML = (str) => str.replace(/[&<>"']/g, (match) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[match]);

                return lines.map(line => {
                    if (line.startsWith('>x ')) {
                        const text = escapeHTML(line.substring(3));
                        return `<div class="sn-todo-item" draggable="true" data-checked="true" contenteditable="false"><input type="checkbox" checked><span contenteditable="true">${text}</span></div>`;
                    } else if (line.startsWith('> ')) {
                        const text = escapeHTML(line.substring(2));
                        return `<div class="sn-todo-item" draggable="true" data-checked="false" contenteditable="false"><input type="checkbox"><span contenteditable="true">${text}</span></div>`;
                    } else {
                        const text = escapeHTML(line);
                        return `<div>${text}</div>`;
                    }
                }).join('');
            };

            // --- DEDICATED TODO LIST ---
            const todoList = w.querySelector('#sn-todo-list');
            const todoWrapper = w.querySelector('#sn-todo-wrapper');

            // Restore saved todo height
            if (savedData.todoHeight) {
                todoWrapper.style.height = savedData.todoHeight + 'px';
                todoWrapper.setAttribute('data-height', savedData.todoHeight);
            } else {
                todoWrapper.style.height = '78px';
            }

            // Helper: toggle .has-content class based on whether the input has text
            const refreshTodoCheckboxVisibility = () => {
                Array.from(todoList.children).forEach(item => {
                    const input = item.querySelector('.sn-todo-input');
                    if (input) {
                        const hasText = input.value.trim().length > 0;
                        item.classList.toggle('has-content', hasText);
                        item.setAttribute('data-checked', item.querySelector('input[type="checkbox"]').checked);
                    }
                });
            };

            // Migrate old HTML-format todos to JSON, then load
            let todosData = savedData.todos;
            if (typeof todosData === 'string' && todosData.includes('contenteditable')) {
                // Old format: HTML string with contenteditable spans → convert to JSON array
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = todosData;
                todosData = Array.from(tempDiv.children)
                    .filter(el => el.classList.contains('sn-todo-item'))
                    .map(el => ({
                        checked: el.querySelector('input[type="checkbox"]')?.checked || false,
                        text: el.querySelector('span')?.textContent || ''
                    }));
            }

            // Load saved todos (or defaults)
            todoList.innerHTML = renderTodosContent(todosData || []);

            // Initial checkbox visibility check
            refreshTodoCheckboxVisibility();

            // Input handler: save + update checkbox visibility
            todoList.addEventListener('input', () => {
                refreshTodoCheckboxVisibility();
                debouncedSave();
            });

            // Click: checkbox toggle, delete button
            todoList.addEventListener('click', (e) => {
                const item = e.target.closest('.sn-todo-item');
                if (!item) return;

                if (e.target.matches('.sn-todo-item input[type="checkbox"]')) {
                    item.setAttribute('data-checked', e.target.checked);
                    refreshTodoCheckboxVisibility();
                    saveState();
                }

                if (e.target.matches('.sn-todo-del-btn')) {
                    e.preventDefault();
                    item.remove();
                    refreshTodoCheckboxVisibility();
                    saveState();
                    // Focus next or prev item
                    const remaining = todoList.querySelectorAll('.sn-todo-item');
                    const next = remaining[0];
                    if (next) setTimeout(() => next.querySelector('.sn-todo-input')?.focus(), 0);
                }
            });

            // Enter creates new row; Tab/ArrowUp/ArrowDown move between rows
            todoList.addEventListener('keydown', (e) => {
                const input = e.target.closest('.sn-todo-input');
                if (!input) return;
                const item = input.closest('.sn-todo-item');
                if (!item) return;

                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    const newItem = document.createElement('div');
                    newItem.className = 'sn-todo-item';
                    newItem.setAttribute('draggable', 'true');
                    newItem.setAttribute('data-checked', 'false');
                    newItem.innerHTML = '<input type="checkbox"><input type="text" class="sn-todo-input" placeholder="To-do item..."><button class="sn-todo-del-btn" title="Delete item">×</button>';
                    item.after(newItem);
                    newItem.querySelector('.sn-todo-input').focus();
                }

                if (e.key === 'Tab' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    const items = Array.from(todoList.querySelectorAll('.sn-todo-item'));
                    const idx = items.indexOf(item);
                    const dir = (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) ? -1 : 1;
                    const nextIdx = idx + dir;
                    if (nextIdx >= 0 && nextIdx < items.length) {
                        items[nextIdx].querySelector('.sn-todo-input').focus();
                    }
                }
            });

            // Clear Completed button
            const clearCompletedBtn = w.querySelector('#sn-clear-completed');
            if (clearCompletedBtn) {
                clearCompletedBtn.addEventListener('click', () => {
                    const completed = todoList.querySelectorAll('.sn-todo-item[data-checked="true"]');
                    if (completed.length === 0) {
                        if (app.Core.Utils && app.Core.Utils.showNotification) {
                            app.Core.Utils.showNotification('No completed items to clear.', { type: 'info', duration: 1500 });
                        }
                        return;
                    }
                    completed.forEach(el => el.remove());
                    refreshTodoCheckboxVisibility();
                    saveState();
                });
            }

            // Drag-to-reorder for todo items
            const getDragAfterElement = (container, y) => {
                const draggableElements = [...container.querySelectorAll('.sn-todo-item:not(.dragging)')];
                return draggableElements.reduce((closest, child) => {
                    const box = child.getBoundingClientRect();
                    const offset = y - box.top - box.height / 2;
                    if (offset < 0 && offset > closest.offset) {
                        return { offset: offset, element: child };
                    } else {
                        return closest;
                    }
                }, { offset: Number.NEGATIVE_INFINITY }).element;
            };

            todoList.addEventListener('dragstart', e => {
                const item = e.target.closest('.sn-todo-item');
                if (item) {
                    item.classList.add('dragging');
                }
            });

            todoList.addEventListener('dragend', e => {
                const item = e.target.closest('.sn-todo-item');
                if (item) {
                    item.classList.remove('dragging');
                    saveState();
                }
            });

            todoList.addEventListener('dragover', e => {
                e.preventDefault();
                const draggingItem = todoList.querySelector('.dragging');
                if (!draggingItem) return;
                const afterElement = getDragAfterElement(todoList, e.clientY);
                if (afterElement == null) { todoList.appendChild(draggingItem); } else { todoList.insertBefore(draggingItem, afterElement); }
            });

            // --- TODO DIVIDER RESIZE ---
            const todoDivider = w.querySelector('#sn-todo-divider');
            let isResizing = false;

            todoDivider.addEventListener('mousedown', (e) => {
                e.preventDefault();
                isResizing = true;
                const startY = e.clientY;
                const startH = todoWrapper.offsetHeight;

                const onMove = (mv) => {
                    if (!isResizing) return;
                    const newH = Math.max(54, Math.min(250, startH + (mv.clientY - startY)));
                    todoWrapper.style.height = newH + 'px';
                    todoWrapper.setAttribute('data-height', newH);
                };
                const onUp = () => {
                    isResizing = false;
                    document.removeEventListener('mousemove', onMove);
                    document.removeEventListener('mouseup', onUp);
                };
                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
            });

            // --- BADGE STRIP ---
            this._renderBadges(w, clientId, savedData);

            // Wire up the "+" add badge button
            const addBadgeBtn = w.querySelector('#sn-badge-add-btn');
            if (addBadgeBtn) {
                addBadgeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this._showAddBadgePopup(w, clientId);
                });
            }

            // --- NOTES AREA (clean - no todo conversion) ---
            notesContainer.innerHTML = renderNotesContent(savedData.notes || '');

            // Selection listeners for Toolbar
            notesContainer.addEventListener('mouseup', () => setTimeout(() => this._checkSelection(), 10));
            notesContainer.addEventListener('keyup', (e) => { if (e.shiftKey) setTimeout(() => this._checkSelection(), 10); });

            const onSelChange = () => {
                const sel = window.getSelection();
                if (!sel || sel.isCollapsed || !notesContainer.contains(sel.anchorNode)) { this._hideInlineToolbar(); }
            };
            document.addEventListener('selectionchange', onSelChange);
            this.listeners[`selChange_${clientId}`] = onSelChange;


            const saveState = () => {
                if (!document.body.contains(w) || w._isDeleting) return;
                try {
                    // Retrieve previous data to preserve fields if UI elements are missing (e.g. closed sidebar)
                    const previous = GM_getValue('cn_' + clientId, {});
                    const formData = GM_getValue('cn_form_data_' + clientId, {});
                    const ssnEl = w.querySelector('.sn-side-textarea[data-id="ssn"]');
                    const dobEl = w.querySelector('.sn-side-textarea[data-id="dob"]');
                    const todoWrapperEl = w.querySelector('#sn-todo-wrapper');

                    // Save notes as innerHTML (rich text), todos as JSON array
                    const notesToSave = notesContainer.innerHTML;
                    const todosToSave = JSON.stringify(Array.from(todoList.children).map(item => ({
                        checked: item.querySelector('input[type="checkbox"]')?.checked || false,
                        text: item.querySelector('.sn-todo-input')?.value || ''
                    })));

                    const data = {
                        name: w.querySelector('#sn-cl-name').innerText, notes: notesToSave,
                        todos: todosToSave,
                        todoHeight: todoWrapperEl ? todoWrapperEl.getAttribute('data-height') || '78' : '78',
                        city: w.querySelector('#sn-city').innerText,
                        state: w.querySelector('#sn-state').innerText,
                        status: w.querySelector('#sn-status').innerText,
                        ssClassification: w.querySelector('#sn-ss-classification').innerText,
                        substatus: w.querySelector('#sn-substatus').innerText,
                        ssn: ssnEl ? ssnEl.value : (formData.ssn || previous.ssn), // from info panel or form storage
                        tz: w.querySelector('#sn-tz-select').value,
                        dob: dobEl ? dobEl.value : (formData.dob || previous.dob),
                        revisitActive: w.querySelector('#sn-revisit-check').checked, revisit: w.querySelector('#sn-revisit-date').value,
                        // Preserve badges from previous save (badges mutate via badge dropdowns, not DOM)
                        badges: previous.badges || (savedData.badges || {}),
                        // Window state
                        width: w.style.width, height: w.style.height, top: w.style.top, left: w.style.left, timestamp: Date.now(),
                    };

                    try {
                        GM_setValue('cn_' + clientId, data);
                    } catch (e) { console.error('[ClientNote] Failed to save state due to invalidated context.', e); }
                    this.checkStoredData(clientId);
                    app.Core.Taskbar.update();

                    // Broadcast that data has changed to update other tabs
                    GM_setValue('sn_dashboard_broadcast', Date.now());

                    const revisitStatusChanged = data.revisitActive !== previous.revisitActive || data.revisit !== previous.revisit;
                    if (revisitStatusChanged) {
                        // If dashboard is open, refresh its list view
                        const dashEl = document.getElementById('sn-dashboard');
                        if (dashEl && dashEl.style.display !== 'none' && app.Tools.Dashboard && app.Tools.Dashboard.currentView === 'list') {
                            app.Tools.Dashboard._loadData();
                            app.Tools.Dashboard.renderList();
                        }
                    }
                } catch (err) {
                    console.error('[ClientNote] Error during saveState:', err);
                }
            };

            const fillForm = (force = false, _retryState = null) => {
                // --- Retry guard: detect incomplete data (page not yet loaded) ---
                const retry = _retryState || { attempts: 0, maxAttempts: 5, interval: 2000 };

                // Defer heavy scraping to prevent UI blocking on creation
                setTimeout(() => {
                    // 1. Load the single source of truth: the data from storage.
                    const freshData = GM_getValue('cn_' + clientId, {});
                    // Always load the latest form data
                    const freshFormData = GM_getValue('cn_form_data_' + clientId, {});

                    // 2. Scrape the current page for supplementary data.
                    const harvested = app.Core.Scraper.harvestFields();
                    const pageData = app.Core.Scraper.getAllPageData();
                    const allScrapedData = { ...harvested, ...pageData };

                    // 2b. Guard: if no meaningful client data yet (page still loading), retry up to ~10s
                    const hasNameData = harvested['matter name'] || pageData.firstName || pageData.lastName;
                    if (!hasNameData && retry.attempts < retry.maxAttempts) {
                        retry.attempts++;
                        console.log(`[ClientNote] Page not ready yet (attempt ${retry.attempts}/${retry.maxAttempts}). Retrying in ${retry.interval}ms...`);
                        setTimeout(() => fillForm(force, retry), retry.interval);
                        return;
                    }
                    if (!hasNameData && retry.attempts >= retry.maxAttempts) {
                        const msg = 'Fail to get Client info - Reload page';
                        console.warn(`[ClientNote] ${msg}`);
                        if (app.Core.Utils && app.Core.Utils.showNotification) {
                            app.Core.Utils.showNotification(msg, { type: 'error', duration: 5000 });
                        }
                        // Fall through: still apply what little data we have
                    }

                    // 3. Merge supplementary data from the current page scrape into storage and update UI.
                    const dataToSave = {};

                    // Fields from the Salesforce record page sidebar (always use pageData as source)
                    const sidebarFields = ['ssn', 'dob', 'firstName', 'lastName', 'cellPhone', 'pobCity', 'motherName', 'fatherName'];
                    sidebarFields.forEach(k => {
                        const val = pageData[k];
                        if (val && (force || !freshFormData[k])) {
                            dataToSave[k] = val;
                        }
                    });

                    // Fields that may come from the record page or SSD form (Alt+E)
                    const generalFields = ['Phone', 'Address', 'Email', 'Witness', 'City', 'State'];
                    generalFields.forEach(k => {
                        const val = allScrapedData[k];
                        if (val && (force || !freshFormData[k])) {
                            dataToSave[k] = val;
                        }
                    });

                    // POB is a single field — use pobCity directly, no processing
                    if (!dataToSave['POB'] && dataToSave.pobCity) {
                        dataToSave['POB'] = dataToSave.pobCity;
                    } else if (!dataToSave['POB'] && freshFormData.pobCity) {
                        dataToSave['POB'] = freshFormData.pobCity;
                    }

                    // Derive Parents from Mother + Father if Parents not already set
                    if (!dataToSave['Parents']) {
                        const parentParts = [];
                        const mother = dataToSave.motherName || freshFormData.motherName || '';
                        const father = dataToSave.fatherName || freshFormData.fatherName || '';
                        if (mother) parentParts.push(mother);
                        if (father) parentParts.push(father);
                        if (parentParts.length > 0) {
                            dataToSave['Parents'] = parentParts.join(', ');
                        }
                    }

                    if (Object.keys(dataToSave).length > 0) {
                        this.updateAndSaveData(clientId, dataToSave);
                    } else {
                        this.updateUI(freshFormData);
                    }

                    // 4. Merge supplementary data from the current page scrape.
                    // Only update if the stored value is empty/default, or if it's a forced refresh.
                    const nameEl = w.querySelector('#sn-cl-name');
                    if (force || nameEl.innerText === 'Client Note') {
                        // Build name from scraped fields (matter name or first+last), same keys used by create()
                        const scrapedName = harvested['matter name'] || 
                            (pageData.firstName || pageData.lastName ? `${pageData.firstName || ''} ${pageData.lastName || ''}`.trim() : '');
                        nameEl.innerText = scrapedName || freshData.name || 'Client Note';
                    }

                    // Populate City
                    const cityEl = w.querySelector('#sn-city');
                    const cityVal = allScrapedData['City'] || allScrapedData['Mailing City'] || freshData.city || freshFormData['City'] || '';
                    if (cityEl) cityEl.innerText = cityVal;

                    // Populate State
                    const stateEl = w.querySelector('#sn-state');
                    const stateVal = allScrapedData['State'] || allScrapedData['Mailing State'] || freshData.state || freshFormData['State'] || '';
                    if (stateEl) {
                        stateEl.innerText = stateVal;
                        // Auto-detect Timezone and Color
                        const detectedTZ = this.detectTimezone(stateVal, cityVal);
                        if (detectedTZ) {
                            const tzDropdown = w.querySelector('#sn-tz-select');
                            if (tzDropdown.value !== detectedTZ) {
                                tzDropdown.value = detectedTZ;
                                tzDropdown.dispatchEvent(new Event('change')); // Trigger color change and clock
                            } else {
                                this.startClock(detectedTZ);
                                this.updateNoteColor(clientId);
                            }
                        }
                    }

                    // Update Status Bar from scraped data (with abbreviations)
                    w.querySelector('#sn-status').innerText = this._formatStatusText(harvested['status'] ?? freshData.status) || '';
                    w.querySelector('#sn-ss-classification').innerText = this._formatStatusText(harvested['ss classification'] ?? freshData.ssClassification) || '';
                    w.querySelector('#sn-substatus').innerText = this._formatStatusText(harvested['sub-status'] ?? freshData.substatus) || '';

                    // 5. Update any dependent UI (med provider, if open)
                    if (app.Features.ProviderPanel) app.Features.ProviderPanel.updateMedWindowUI();

                    // 5b. Re-render badges (NC date may have updated from scrape)
                    this._renderBadges(w, clientId, GM_getValue('cn_' + clientId, {}));

                    // 6. Save the newly merged state back to storage.
                    saveState();
                }, 0);
            };

            // Store refresh function for external/toggle access
            w._refresh = fillForm;

            // Load separate form data
            const formData = GM_getValue('cn_form_data_' + clientId, {});

            let _saveTimer;
            const debouncedSave = () => { clearTimeout(_saveTimer); _saveTimer = setTimeout(saveState, 300); };
            w.addEventListener('input', debouncedSave); w.addEventListener('change', debouncedSave);

            const tzSelect = w.querySelector('#sn-tz-select');
            if (initialTZ) {
                // Map legacy standard time keys to daylight time keys for the dropdown selection
                const legacyMap = { 'EST': 'EDT', 'CST': 'CDT', 'MST': 'MDT', 'PST': 'PDT', 'AKST': 'AKDT' };
                const normalizedTZ = legacyMap[initialTZ] || initialTZ;
                tzSelect.value = normalizedTZ;
            }
            tzSelect.onchange = () => {
                this.startClock(tzSelect.value);
                this.updateNoteColor(clientId);
                saveState();
            };

            // Load existing data for fallback
            // const freshData = GM_getValue('cn_' + clientId, {});
            // const freshFormData = GM_getValue('cn_form_data_' + clientId, {});

            // Auto-refresh data on open if it's a new note (status will be blank)
            if (!savedData.timestamp) {
                fillForm();
            }

            // Start polling status every 60 seconds
            this._startStatusPolling(clientId, w);

            // Click-to-clear highlights on status fields
            w.querySelector('#sn-status').addEventListener('click', () => this._clearStatusHighlights(w));
            w.querySelector('#sn-ss-classification').addEventListener('click', () => this._clearStatusHighlights(w));
            w.querySelector('#sn-substatus').addEventListener('click', () => this._clearStatusHighlights(w));

            // Company badge toggle + theme
            this._applyBadgeTheme(w);
            const badge = w.querySelector('#sn-company-badge');
            if (badge) {
                badge.addEventListener('click', () => {
                    const current = GM_getValue('sn_company_badge', 'KD');
                    const next = current === 'KD' ? 'TDA' : 'KD';
                    GM_setValue('sn_company_badge', next);
                    this._applyBadgeTheme(w);
                });
            }

            // REFRESH BUTTON: Force-refresh data from scraped page (overwrites existing fields like DOB/SSN)
            w.querySelector('#sn-refresh-btn').onclick = () => fillForm(true, null);

            const delBtn = w.querySelector('#sn-del-btn');
            let deleteConfirmState = false;
            let lastDelClickTime = 0;

            if (delBtn) {
                delBtn.onclick = () => {
                    const now = Date.now();

                    if (!deleteConfirmState) {
                        // First click: prime for deletion
                        deleteConfirmState = true;
                        lastDelClickTime = now;
                        delBtn.style.backgroundColor = '#c62828'; // Change to red background
                        delBtn.style.color = 'white';
                        delBtn.style.borderRadius = '4px';
                        app.Core.Utils.showNotification("Click again to confirm deletion.", { type: 'info', duration: 2500 });

                        // Auto-reset the button if they don't confirm within 3 seconds
                        setTimeout(() => {
                            if (document.body.contains(delBtn)) {
                                deleteConfirmState = false;
                                delBtn.style.backgroundColor = 'transparent';
                                delBtn.style.color = '';
                                delBtn.style.borderRadius = '';
                            }
                        }, 3000);
                    } else {
                        // Second click: check timing to avoid accidental double-clicks
                        if (now - lastDelClickTime < 300) return;

                        w._isDeleting = true; // Block further saves
                        try {
                            GM_deleteValue('cn_' + clientId);
                            GM_deleteValue('cn_form_data_' + clientId);
                            GM_deleteValue('cn_med_table_' + clientId);

                            this.destroy(clientId);
                            app.Features.ProviderPanel.destroy(clientId);
                            this.checkStoredData(clientId);
                            app.Features.ProviderPanel.checkStoredData(clientId);
                            app.Core.Utils.showNotification("Notes and data deleted.", { type: 'success' });
                        } catch (e) {
                            console.error('[ClientNote] Delete failed:', e);
                            w._isDeleting = false;
                        }
                        app.Core.Taskbar.update();
                    }
                };
            }



            // Persist an entry immediately so the Dashboard registers this case as opened (even with no edits)
            saveState();

            // Start clock on init
            this.startClock(initialTZ);
            app.Core.Taskbar.update();
        },

        /**
         * Merges new data into the dedicated `cn_form_data` storage for a client and triggers a UI update.
         * 
         * @param {string} clientId - The 18-character Salesforce Client ID.
         * @param {Object} newData - The partial data object to merge and save.
         */
        updateAndSaveData(clientId, newData) {
            // SAVE TO DEDICATED STORAGE KEY
            const key = 'cn_form_data_' + clientId;
            const existingData = GM_getValue(key, {});
            const mergedData = { ...existingData, ...newData };

            mergedData.timestamp = Date.now(); // Mark as updated
            GM_setValue(key, mergedData);
            this.checkStoredData(clientId);

            // Broadcast custom event for taskbar update.
            GM_setValue('sn_dashboard_broadcast', Date.now());


            // LIVE UPDATE: Update local UI immediately
            this.updateUI(mergedData);
            app.Core.Taskbar.update();
        },

        /**
         * Initializes and controls the live clock display within the header.
         * 
         * @param {string} tzKey - The timezone abbreviation.
         */
        startClock(tzKey) {
            if (this.clockInterval) clearInterval(this.clockInterval);
            const el = document.getElementById('sn-time');
            if (!el) return;

            const iana = this.ianaTZ[tzKey];
            if (!iana) { el.innerText = ''; return; }

            const update = () => {
                try {
                    const now = new Date();
                    el.innerText = now.toLocaleTimeString('en-US', { timeZone: iana, hour: '2-digit', minute: '2-digit', hour12: false }) + ' ' + tzKey;

                    const h = parseInt(now.toLocaleTimeString('en-US', { timeZone: iana, hour: 'numeric', hour12: false }));
                    if (h >= 8 && h < 9) el.style.color = '#F57F17'; // Dark Yellow
                    else if (h >= 9 && h < 16) el.style.color = '#333333'; // Black
                    else el.style.color = '#C62828'; // Dark Red
                } catch (e) { el.innerText = ''; el.style.color = '#333'; }
            };
            update();
            this.clockInterval = setInterval(update, 60000);
        },

        /**
         * Synchronizes local UI elements (Info panel) with incoming data state. Medical fields are
         * handled by ProviderPanel.updateUI().
         * 
         * @param {Object} data - The client data object containing extracted fields.
         */
        updateUI(data) {
            if (!data) return;
            const cnWindow = document.getElementById('sn-client-note');
            if (!cnWindow) return;

            // Update Info Panel Textareas
            const keyMap = {
                'Address': 'addr', 'Phone': 'phone', 'Email': 'email',
                'POB': 'pob', 'Parents': 'parents', 'Witness': 'wit',
                'ssn': 'ssn', 'dob': 'dob',
                'firstName': 'firstName', 'lastName': 'lastName',
                'cellPhone': 'cellPhone',
                'pobCity': 'pobCity',
                'motherName': 'motherName', 'fatherName': 'fatherName'
            };
            Object.entries(keyMap).forEach(([scrapedKey, domId]) => {
                if (data[scrapedKey] !== undefined) {
                    // Respect witness lock — never overwrite witness DOM when locked
                    if (domId === 'wit' && GM_getValue('cn_wit_lock_' + cnWindow.dataset.clientId, false)) return;
                    const el = cnWindow.querySelector(`.sn-side-textarea[data-id="${domId}"]`);
                    if (el) {
                        el.value = data[scrapedKey];
                        // Trigger resize
                        el.style.height = '1px';
                        el.style.height = (el.scrollHeight) + 'px';
                    }
                }
            });

            // Update City if present
            if (data['City']) {
                const cityEl = cnWindow.querySelector('#sn-city');
                if (cityEl) cityEl.innerText = data['City'];
            }

            // Update State if present in remote data, and always refresh clock/color
            if (data['State']) {
                const stateEl = cnWindow.querySelector('#sn-state');
                if (stateEl && stateEl.innerText !== data['State']) {
                    stateEl.innerText = data['State'];
                }
                const currentCity = data['City'] || cnWindow.querySelector('#sn-city').innerText;
                const detectedTZ = this.detectTimezone(data['State'], currentCity);
                if (detectedTZ) {
                    const tzDropdown = cnWindow.querySelector('#sn-tz-select');
                    if (tzDropdown && tzDropdown.value !== detectedTZ) {
                        tzDropdown.value = detectedTZ;
                        tzDropdown.dispatchEvent(new Event('change'));
                    } else if (tzDropdown) {
                        // TZ matches — still ensure clock/color are active
                        const clientId = cnWindow.dataset.clientId;
                        this.startClock(detectedTZ);
                        this.updateNoteColor(clientId);
                    }
                }
            }

            // Update MedWindow UI if open
            if (app.Features.ProviderPanel) app.Features.ProviderPanel.updateUI(data);
        },

        /**
         * Evaluates stored data for a client to toggle visibility indicators (e.g. "has-data" glow) on taskbar tabs.
         * 
         * @param {string} clientId - The 18-character Salesforce Client ID.
         */
        checkStoredData(clientId) {
            if (!clientId) return;
            const cnBtn = document.getElementById('tab-sn-client-note');

            // Check Client Note Data
            const cnData = GM_getValue('cn_' + clientId);
            if (cnData && cnData.timestamp) {
                if (cnBtn) cnBtn.classList.add('sn-has-data');
            } else {
                if (cnBtn) cnBtn.classList.remove('sn-has-data');
            }
        },

        /**
         * Applies status text abbreviations for compact display.
         * "Initial Application" → "IA", "Reconsideration" → "Recon",
         * "Filed - Pending at FO" → "Pending at FO", "Filed - Pending at DDS" → "Pending at DDS".
         * @param {string} text - The raw status text.
         * @returns {string} The abbreviated status text.
         */
        _formatStatusText(text) {
            if (!text) return '';
            return text
                .replace(/Initial Application/gi, 'IA')
                .replace(/Init App/gi, 'IA')
                .replace(/Reconsideration/gi, 'Recon')
                .replace(/Filed - Pending at (FO|DDS)/g, 'Pending at $1');
        },

        /**
         * Applies the company badge theme to the status bar of the client note window.
         * Reads the stored 'sn_company_badge' value ('KD' or 'TDA').
         * 'KD' floods the status bar with light blue, 'TDA' with green.
         * @param {HTMLElement} w - The client note window element.
         */
        _applyBadgeTheme(w) {
            const bar = w.querySelector('#sn-status-bar');
            const badge = w.querySelector('#sn-company-badge');
            if (!bar || !badge) return;
            const company = GM_getValue('sn_company_badge', 'KD');
            badge.textContent = company;
            if (company === 'TDA') {
                bar.style.background = '#c8e6c9';
                bar.style.borderBottom = '1px solid #a5d6a7';
                badge.style.background = '#388e3c';
                badge.style.color = '#ffffff';
            } else {
                bar.style.background = '#bbdefb';
                bar.style.borderBottom = '1px solid #90caf9';
                badge.style.background = '#1976d2';
                badge.style.color = '#ffffff';
            }
        },

        /**
         * Removes orange highlights from all status bar fields
         * and stops any active "Filed" alert animation.
         * @param {HTMLElement} [w] - The client note window element. Defaults to the active window.
         */
        _clearStatusHighlights(w) {
            if (!w) w = document.getElementById('sn-client-note');
            if (!w) return;
            this._stopFiledAnimation(w);
            ['#sn-status', '#sn-ss-classification', '#sn-substatus'].forEach(sel => {
                const el = w.querySelector(sel);
                if (el) {
                    el.style.background = '';
                    el.style.padding = '';
                    el.style.borderRadius = '';
                }
            });
        },

        /**
         * Starts polling status every 60 seconds.
         * Does an initial check 3 seconds after opening.
         * Clears any previous timer and existing highlights first.
         * @param {string} clientId - The 18-character Salesforce Client ID.
         * @param {HTMLElement} w - The client note window element.
         */
        _startStatusPolling(clientId, w) {
            this._clearStatusHighlights(w);
            if (this._statusPollInterval) {
                clearInterval(this._statusPollInterval);
                this._statusPollInterval = null;
            }
            // Initial check shortly after opening
            setTimeout(() => {
                if (!document.body.contains(w) || w._isDeleting) return;
                this._checkStatusChanges(clientId, w);
            }, 3000);
            // Recurring poll every 60 seconds
            this._statusPollInterval = setInterval(() => {
                if (!document.body.contains(w) || w._isDeleting) {
                    clearInterval(this._statusPollInterval);
                    this._statusPollInterval = null;
                    return;
                }
                this._checkStatusChanges(clientId, w);
            }, 60000);
        },

        /**
         * Scrapes current page data, compares status fields against what's currently displayed,
         * and highlights any changes with an orange background.
         * Special case: if sub-status changes to "Filed", triggers a pulsing red alert.
         * @param {string} clientId - The 18-character Salesforce Client ID.
         * @param {HTMLElement} w - The client note window element.
         */
        _checkStatusChanges(clientId, w) {
            const harvested = app.Core.Scraper.harvestFields();
            const changed = [];

            const checkField = (sel, rawValue, label) => {
                const el = w.querySelector(sel);
                if (!el) return;
                const newVal = this._formatStatusText(rawValue || '');
                const oldVal = el.textContent;
                if (newVal && newVal !== oldVal) {
                    el.textContent = newVal;
                    el.style.background = '#FF9800';
                    el.style.padding = '1px 4px';
                    el.style.borderRadius = '3px';
                    changed.push(label);
                }
            };

            checkField('#sn-status', harvested['status'], 'Status');
            checkField('#sn-ss-classification', harvested['ss classification'], 'SS Classification');

            // Special handling for sub-status "Filed" alert
            const subEl = w.querySelector('#sn-substatus');
            if (subEl) {
                const rawSub = harvested['sub-status'] || '';
                const newSubVal = this._formatStatusText(rawSub);
                const oldSubVal = subEl.textContent;
                if (newSubVal && newSubVal !== oldSubVal) {
                    subEl.textContent = newSubVal;
                    changed.push('Sub-status');

                    if (newSubVal === 'Filed') {
                        this._triggerFiledAlert(w);
                    } else {
                        subEl.style.background = '#FF9800';
                        subEl.style.padding = '1px 4px';
                        subEl.style.borderRadius = '3px';
                    }
                }
            }

            if (changed.length > 0 && app.Core.Utils && app.Core.Utils.showNotification) {
                app.Core.Utils.showNotification(`Status updated: ${changed.join(', ')}`, { type: 'info', duration: 4000 });
            }
        },

        /**
         * Injects CSS keyframes for the "Filed" alert animation (one-time).
         */
        _ensureFiledStyles() {
            if (document.getElementById('sn-filed-anim-style')) return;
            const style = document.createElement('style');
            style.id = 'sn-filed-anim-style';
            style.textContent = `
                @keyframes sn-filed-pulse {
                    0%, 100% {
                        background: #d32f2f !important;
                        box-shadow: 0 0 5px rgba(211,47,47,0.5);
                        color: #fff !important;
                    }
                    50% {
                        background: #b71c1c !important;
                        box-shadow: 0 0 20px rgba(211,47,47,0.9), 0 0 40px rgba(211,47,47,0.4);
                        color: #fff !important;
                    }
                }
                @keyframes sn-filed-pop {
                    0% { transform: scale(1); }
                    40% { transform: scale(1.25); }
                    70% { transform: scale(0.95); }
                    100% { transform: scale(1); }
                }
                .sn-filed-alert {
                    animation: sn-filed-pop 0.5s ease-out 1, sn-filed-pulse 1.5s ease-in-out infinite !important;
                    padding: 1px 6px !important;
                    border-radius: 4px !important;
                    font-weight: bold !important;
                    cursor: pointer !important;
                }
            `;
            document.head.appendChild(style);
        },

        /**
         * Triggers a pulsing red glow + pop animation on the sub-status element
         * and shows a notification when sub-status changes to "Filed".
         * Animation persists until the user clicks on the sub-status field.
         * @param {HTMLElement} w - The client note window element.
         */
        _triggerFiledAlert(w) {
            this._ensureFiledStyles();
            const el = w.querySelector('#sn-substatus');
            if (!el) return;

            // Remove any existing orange highlight styling
            el.style.background = '';
            el.style.padding = '';
            el.style.borderRadius = '';

            // Add the filed alert class for pulsing red glow + pop animation
            el.classList.add('sn-filed-alert');

            // Notification
            if (app.Core.Utils && app.Core.Utils.showNotification) {
                app.Core.Utils.showNotification('🚨 Sub-status changed to FILED!', {
                    type: 'error',
                    duration: 6000
                });
            }
        },

        /**
         * Stops the "Filed" pulsing red animation on the sub-status element.
         * @param {HTMLElement} w - The client note window element.
         */
        _stopFiledAnimation(w) {
            const el = w.querySelector('#sn-substatus');
            if (el) {
                el.classList.remove('sn-filed-alert');
                el.style.background = '';
                el.style.padding = '';
                el.style.borderRadius = '';
                el.style.color = '';
                el.style.animation = '';
            }
        },

        /**
         * Safely dismantles the Client Note window, cleans up event listeners, 
         * and respects the "pinned" status unless forced. Medical window is handled by ProviderPanel.destroy().
         * 
         * @param {string} clientId - The 18-character Salesforce Client ID.
         * @param {boolean} [force=false] - Whether to destroy the windows regardless of their pinned state.
         */
        destroy(clientId, force = false) {
            const w = document.getElementById('sn-client-note');

            if (w) {
                // Close any open badge dropdown
                this._closeBadgeDropdowns(w);
                w.remove();
            }
            if (app.Features.ProviderPanel) app.Features.ProviderPanel.destroy(clientId);

            // Remove GM value listeners
            if (this.listeners[clientId]) {
                GM_removeValueChangeListener(this.listeners[clientId]);
                delete this.listeners[clientId];
            }
            // Remove GM value listeners
            const settingsToWatch = ['sn_ui_theme', 'sn_tz_note_color', 'sn_note_follow_theme', 'sn_note_default_color', 'cn_font_global'];
            settingsToWatch.forEach(key => {
                const lKey = `${key}_${clientId}`;
                if (this.listeners[lKey]) {
                    GM_removeValueChangeListener(this.listeners[lKey]);
                    delete this.listeners[lKey];
                }
            });

            // Remove click event listener for color picker
            const cpClickKey = `cpClickListener_${clientId}`;
            if (this.listeners[cpClickKey]) {
                document.removeEventListener('click', this.listeners[cpClickKey]);
                delete this.listeners[cpClickKey];
            }

            const selChangeKey = `selChange_${clientId}`;
            if (this.listeners[selChangeKey]) {
                document.removeEventListener('selectionchange', this.listeners[selChangeKey]);
                delete this.listeners[selChangeKey];
            }

            if (this.clockInterval) { clearInterval(this.clockInterval); this.clockInterval = null; }
            if (this._statusPollInterval) { clearInterval(this._statusPollInterval); this._statusPollInterval = null; }
            if (this._statusCheckTimer) { clearTimeout(this._statusCheckTimer); this._statusCheckTimer = null; }
        },

        // (updateMedWindowUI, toggleMedWindow, parseMedicalProviders moved to ProviderPanel.js)
    };

    /**
     * Helper mapping exposing the `AppObserver` method for internal use.
     * 
     * @returns {string|null} The current active 18-character Client ID.
     */
    ClientNote.getClientId = () => window.CM_App.AppObserver.getClientId();

    app.Features.ClientNote = ClientNote;
})();
