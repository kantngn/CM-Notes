(function () {
    const app = window.CM_App = window.CM_App || {};
    app.Features = app.Features || {};

    /**
     * Orchestrates the "Client Note" feature by managing the core note window, 
     * rich-text case notes, and to-do lists while synchronizing client and matter data 
     * across multiple specialized sidebar panels.
     * Interacts with Themes, Scraper, WindowManager, Taskbar, Utils, InfoPanel, SSAPanel, 
     * MatterPanel, Dashboard, MedicationPanel, AppObserver, and gm-compat.
     * @namespace app.Features.ClientNote
     */
    const ClientNote = {
        presets: [
            '#ffe0b2', '#fff9c4', '#c8e6c9', '#b2dfdb', '#bbdefb', '#d1c4e9', '#f8bbd0', '#d7ccc8', '#cfd8dc'
        ],
        ianaTZ: {
            'EST': 'America/New_York', 'CST': 'America/Chicago', 'MST': 'America/Denver',
            'PST': 'America/Los_Angeles', 'AKST': 'America/Anchorage', 'HST': 'Pacific/Honolulu'
        },
        listeners: {},
        clockInterval: null,

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
                { cmd: 'insertCheckbox', icon: '☑', title: 'Checkbox' },
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
                    div.innerHTML = `<input type="checkbox"><span>${safeText}</span><button class="sn-todo-del">×</button>`;
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
            if (document.getElementById(id)) { app.Core.Windows.toggle(id); return; }

            const headerData = app.Core.Scraper.getHeaderData();
            const livePageData = app.Core.Scraper.getAllPageData();
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
            const settingsToWatch = ['sn_ui_theme', 'sn_tz_note_color', 'sn_note_follow_theme', 'sn_note_default_color'];
            settingsToWatch.forEach(key => {
                if (!this.listeners[key]) { // Prevent adding multiple listeners for the same key
                    this.listeners[key] = GM_addValueChangeListener(key, (name, oldVal, newVal, remote) => {
                        this.updateNoteColor(clientId);
                    });
                }
            });

            const w = document.createElement('div');
            w.id = id; w.className = 'sn-window';

            const pageWidth = window.innerWidth;
            const pageHeight = window.innerHeight;
            const defaultWidth = 380;
            const defaultHeight = 320;
            w.style.width = savedData.width || '380px'; w.style.height = savedData.height || '320px';
            w.style.backgroundColor = bodyColor; // Color is set based on getNoteColors hierarchy
            w.style.top = savedData.top || ((pageHeight - defaultHeight) / 2) + 'px'; w.style.left = savedData.left || ((pageWidth - defaultWidth) / 2) + 'px';
            w.style.fontSize = savedFontSize;

            const paletteHTML = this.presets.map(c => `<div class="sn-swatch" style="background:${c}" data-col="${c}"></div>`).join('') + `<div class="sn-swatch" id="sn-reset-color-swatch" title="Reset to Default" style="background: #fff; border: 1px dashed #999; display: flex; align-items: center; justify-content: center; font-size: 14px; color: #555;">⌫</div>`;

            // Saved data takes priority, if not exist > take live data. 
            const statusDisplay = savedData.status || headerData.Status || 'Status';
            const ssClassDisplay = savedData.ssClassification || headerData['SS Classification'] || 'Classification';
            const substatusDisplay = savedData.substatus || headerData['Sub-status'] || 'Sub-status';
            w.innerHTML = `
                    <style>
                        #sn-notes:empty::before { content: attr(placeholder); color: #999; pointer-events: none; }
                        .sn-todo-item { display: flex; align-items: center; margin-bottom: 2px; }
                        .sn-todo-item input[type="checkbox"] { margin-right: 8px; flex-shrink: 0; cursor: pointer; }
                        .sn-todo-item span { flex-grow: 1; outline: none; }
                        .sn-todo-item[data-checked="true"] > span { text-decoration: line-through; color: #888; }
                        .sn-todo-item .sn-todo-del { margin-left: auto; border: none; background: transparent; color: #aaa; cursor: pointer; display: inline-block; font-size: 1.2em; padding: 0 5px; opacity: 0; visibility: hidden; transition: opacity 0.2s, visibility 0.2s; }
                        .sn-todo-item[data-checked="true"] .sn-todo-del { visibility: visible; opacity: 0.2; }
                        .sn-todo-item[data-checked="true"]:hover .sn-todo-del { opacity: 1; }
                        .sn-todo-item.dragging { opacity: 0.5; background: #e0e0e0; }
                        #sn-notes ul { list-style-type: disc; padding-left: 20px; margin: 4px 0; }
                        #sn-notes ol { list-style-type: decimal; padding-left: 20px; margin: 4px 0; }
                    </style>
                    <div id="sn-wrapper" style="position:relative; width:100%; height:100%; display:flex; flex-direction:row;">

                        <div id="sn-spine-strip" style="width:28px; background:var(--sn-primary-text); display:flex; flex-direction:column; align-items:center; padding-top:10px; border-right:1px solid rgba(0,0,0,0.2); z-index:20; flex-shrink:0;">
                            <button id="sn-refresh-btn" title="Refresh Scraped Data" style="border:none; background:transparent; cursor:pointer; font-size:14px; margin-bottom:5px; color:var(--sn-bg-light); transition:transform 0.2s;">🔄</button>
                            <div class="sn-spine-btn" data-panel="info" title="Info" style="writing-mode:vertical-rl; text-orientation:mixed; transform:rotate(180deg); padding:15px 5px; color:var(--sn-bg-light); cursor:pointer; font-weight:normal; font-size:14px; text-transform:uppercase; margin-bottom:5px; transition:background 0.2s;">Info</div>
                            <div class="sn-spine-btn" data-panel="ssa" title="SSA Contacts" style="writing-mode:vertical-rl; text-orientation:mixed; transform:rotate(180deg); padding:15px 5px; color:var(--sn-bg-light); cursor:pointer; font-weight:normal; font-size:14px; text-transform:uppercase; margin-bottom:5px; transition:background 0.2s;">SSA</div>
                            <!-- <div class="sn-spine-btn" data-panel="matter" title="Matter Details" style="writing-mode:vertical-rl; text-orientation:mixed; transform:rotate(180deg); padding:15px 5px; color:var(--sn-bg-light); cursor:pointer; font-weight:normal; font-size:14px; text-transform:uppercase; margin-bottom:5px; transition:background 0.2s;">Matter</div> -->
                        </div>

                        <div id="sn-side-panel" style="position:absolute; right:100%; top:0; bottom:0; width:0px; display:none; flex-direction:column; background:rgba(255,255,255,0.95); border:1px solid #999; border-right:none; box-shadow:-2px 0 5px rgba(0,0,0,0.1); font-size:12px;">
                             <div id="sn-panel-header" style="padding:5px; font-weight:bold; background:var(--sn-bg-light); border-bottom:1px solid #999; display:flex; align-items:center; color:#333;">
                                <span id="sn-panel-title" style="margin-right:auto;">Info</span>
                                <button id="sn-info-edit-btn" title="Edit Info" style="display:none; cursor:pointer; border:1px solid #999; background:#eee; width:22px; height: 22px; border-radius:3px; margin-right:5px; font-size: 14px;">✏️</button>
                                <button id="sn-side-font-dec" style="cursor:pointer; border:1px solid #999; background:#eee; width:18px; border-radius:3px; margin-right:2px;">-</button>
                                <button id="sn-side-font-inc" style="cursor:pointer; border:1px solid #999; background:#eee; width:18px; border-radius:3px; margin-right:5px;">+</button>
                                <button id="sn-panel-close" style="border:none; background:none; cursor:pointer; font-weight:bold;">×</button>
                             </div>
                             <div id="sn-panel-body" style="padding:0px; overflow-y:auto; flex-grow:1;"></div>
                             <div class="sn-panel-resizer-left" style="width:5px; cursor:col-resize; height:100%; position:absolute; left:0; top:0; z-index:10;"></div>
                        </div>

                        <div style="flex-grow:1; display:flex; flex-direction:column; min-width:200px; height:100%; overflow:hidden;">
                            
                            <div class="sn-header" id="sn-cn-header" style="background:${finalHeaderColor}; border-bottom:1px solid rgba(0,0,0,0.1); padding:4px; display:flex; align-items:center;">
                                
                                <span id="sn-cl-name" style="font-weight:bold; margin-left:4px; color:#333;">${savedData.name || headerData.clientName || 'Client Note'}</span>
                                <div style="flex-grow:1;"></div>
                                <span id="sn-city" style="font-weight:bold; color:var(--sn-primary-dark);">${savedData.city || ''}</span>
                                <span style="margin:0 4px; font-weight:bold; color:#555;">-</span>
                                <span id="sn-state" style="font-weight:bold; color:var(--sn-primary-dark);">${savedData.state || ''}</span>
                                <span style="margin:0 4px; font-weight:bold; color:#555;">-</span>
                                <span id="sn-time" style="font-weight:bold; font-size:1em; color:#333; min-width:60px;"></span>
                                <div style="display:flex; align-items:center; margin-left:8px;">
                                    <select id="sn-tz-select" style="display:none;">
                                        <option value="EST">EST</option><option value="CST">CST</option><option value="MST">MST</option>
                                        <option value="PST">PST</option><option value="AKST">AKST</option><option value="HST">HST</option>
                                    </select>
                                    <button id="sn-min-btn" style="cursor:pointer; background:none; border:none; font-weight:bold; padding:0 5px;">_</button>
                                </div>
                            </div>

                            <div style="padding: 5px; border-bottom:1px solid #ccc; background:rgba(255,255,255,0.3); display:flex; align-items:center; text-align:center; font-size: 0.9em;">
                                <div id="sn-status" title="Status" style="flex:1; padding:2px 4px; color:#333; cursor:default; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:bold;">${statusDisplay}</div>
                                <span style="color: #aaa; padding: 0 4px;">||</span>
                                <div id="sn-ss-classification" title="SS Classification" style="flex:1; padding:2px 4px; color:#333; cursor:default; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${ssClassDisplay}</div>
                                <span style="color: #aaa; padding: 0 4px;">||</span>
                                <div id="sn-substatus" title="Sub-status" style="flex:1.5; padding:2px 4px; color:#333; cursor:default; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${substatusDisplay}</div>
                                <div id="sn-ptr-indicator" title="PTR Case" style="display:none; color:#d32f2f; font-weight:bold; margin-left:5px; font-size:0.9em;">PTR</div>
                            </div>

                            <div style="display:flex; flex-direction:column; flex-grow:1; height:100%; overflow:hidden;">
                                <div id="sn-note-wrapper" style="position:relative; flex-grow:1; min-height:50px;">
                                    <div id="sn-notes" contenteditable="true" style="width:100%; height:100%; resize:none; border:none; padding:8px; background:transparent; font-family:sans-serif; font-size:inherit; box-sizing:border-box; overflow-y:auto;" placeholder="Case notes..."></div>
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

            const updateSideFont = (d) => { let cur = parseInt(sidePanel.style.fontSize) || 12; sidePanel.style.fontSize = Math.max(9, Math.min(16, cur + d)) + 'px'; };
            w.querySelector('#sn-side-font-dec').onclick = (e) => { e.stopPropagation(); updateSideFont(-1); };
            w.querySelector('#sn-side-font-inc').onclick = (e) => { e.stopPropagation(); updateSideFont(1); };

            const togglePanel = (type) => {
                const titleMap = { 'info': 'Client Info', 'ssa': 'SSA Contacts', 'matter': 'Matter Details' };
                const isSame = sideTitle.innerText === titleMap[type];
                const editBtn = w.querySelector('#sn-info-edit-btn');

                w.querySelectorAll('.sn-spine-btn').forEach(b => {
                    b.style.color = 'var(--sn-bg-light)';
                    b.style.background = 'transparent';
                });

                if (sidePanel.style.display === 'flex' && isSame) {
                    sidePanel.style.display = 'none';
                    sidePanel.style.width = '0px';
                    if (editBtn) editBtn.style.display = 'none';
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
                        if (editBtn) editBtn.style.display = 'none';
                    } else if (type === 'info') {
                        app.Features.InfoPanel.render(sideBody, context);
                        if (editBtn) editBtn.style.display = 'block';
                    } /* else if (type === 'matter') {
                        app.Features.MatterPanel.render(sideBody, context);
                        if (editBtn) editBtn.style.display = 'none';
                    } */
                }
            };

            w.querySelector('#sn-panel-close').onclick = () => { sidePanel.style.display = 'none'; sidePanel.style.width = '0'; };
            w.querySelectorAll('.sn-spine-btn').forEach(btn => btn.onclick = () => togglePanel(btn.getAttribute('data-panel')));

            const sideResizer = w.querySelector('.sn-panel-resizer-left');
            sideResizer.onmousedown = (e) => {
                e.preventDefault(); const startX = e.clientX, startW = parseInt(window.getComputedStyle(sidePanel).width);
                const onMove = (mv) => { sidePanel.style.width = (startW + (startX - mv.clientX)) + 'px'; };
                const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
                document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
            };

            // --- UTILS (Main Font, Save, Resizers) ---
            const updateFont = (delta) => {
                let current = parseInt(w.style.fontSize) || 12;
                let newSize = Math.max(10, Math.min(16, current + delta));
                w.style.fontSize = newSize + 'px';
                GM_setValue('cn_font_global', newSize + 'px');
            };
            w.querySelector('#sn-font-inc').onclick = () => updateFont(1);
            w.querySelector('#sn-font-dec').onclick = () => updateFont(-1);

            // Check initial data state for buttons
            this.checkStoredData(clientId);

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

            const renderNotesContent = (notesString) => {
                if (!notesString) return '';

                // Detect HTML format (Rich Text) vs Legacy Line format
                if (notesString.trim().startsWith('<') || notesString.includes('</div>') || notesString.includes('</b>') || notesString.includes('</i>')) {
                    return notesString;
                }

                // Legacy Line Parser
                const lines = notesString.split('\n');
                const escapeHTML = (str) => str.replace(/[&<>"']/g, (match) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[match]);

                return lines.map(line => {
                    if (line.startsWith('>x ')) {
                        const text = escapeHTML(line.substring(3));
                        return `<div class="sn-todo-item" draggable="true" data-checked="true"><input type="checkbox" checked><span>${text}</span><button class="sn-todo-del">×</button></div>`;
                    } else if (line.startsWith('> ')) {
                        const text = escapeHTML(line.substring(2));
                        return `<div class="sn-todo-item" draggable="true" data-checked="false"><input type="checkbox"><span>${text}</span><button class="sn-todo-del">×</button></div>`;
                    } else {
                        const text = escapeHTML(line);
                        return `<div>${text}</div>`;
                    }
                }).join('');
            };

            notesContainer.innerHTML = renderNotesContent(savedData.notes || '');

            notesContainer.addEventListener('input', (e) => {
                const sel = window.getSelection();
                if (!sel || !sel.rangeCount) return;

                // Find direct block child
                let node = sel.anchorNode;
                const editor = notesContainer;
                
                let block = node;
                while (block && block.parentNode !== editor && block !== editor) {
                    block = block.parentNode;
                }

                if (!block || block === editor) return;

                const text = block.textContent || '';
                // Normalize non-breaking spaces for comparison
                if (text.replace(/\u00A0/g, ' ').startsWith('> ')) {
                    const content = text.replace(/\u00A0/g, ' ').substring(2);

                    const todoDiv = document.createElement('div');
                    todoDiv.className = 'sn-todo-item';
                    todoDiv.setAttribute('data-checked', 'false');
                    todoDiv.setAttribute('draggable', 'true');
                    const safeText = content.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' })[m]);
                    todoDiv.innerHTML = `<input type="checkbox"><span>${safeText}</span><button class="sn-todo-del">×</button>`;
                    
                    const span = todoDiv.querySelector('span');
                    if (!safeText) span.appendChild(document.createElement('br'));

                    block.replaceWith(todoDiv);

                    const newRange = document.createRange();
                    newRange.setStart(span, 0);
                    newRange.collapse(true);
                    sel.removeAllRanges();
                    sel.addRange(newRange);
                }
            });

            notesContainer.addEventListener('click', (e) => {
                if (e.target.matches('.sn-todo-item input[type="checkbox"]')) {
                    const item = e.target.closest('.sn-todo-item');
                    item.setAttribute('data-checked', e.target.checked);
                    saveState();
                }
                if (e.target.matches('.sn-todo-item .sn-todo-del')) {
                    e.target.closest('.sn-todo-item').remove();
                    saveState();
                }
            });

            notesContainer.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    const sel = window.getSelection();
                    if (!sel.rangeCount) return;
                    let node = sel.getRangeAt(0).startContainer;
                    if (node.nodeType === 3) node = node.parentNode; // Handle Text Node
                    const parentTodoItem = node.closest('.sn-todo-item');

                    if (parentTodoItem) {
                        e.preventDefault();
                        const newDiv = document.createElement('div');
                        newDiv.innerHTML = '<br>'; // Create an empty line
                        parentTodoItem.after(newDiv);

                        // Move cursor to the new line
                        const range = document.createRange();
                        range.setStart(newDiv, 0);
                        range.collapse(true);
                        sel.removeAllRanges();
                        sel.addRange(range);
                    }
                }
            });

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

            notesContainer.addEventListener('dragstart', e => {
                if (e.target.matches('.sn-todo-item')) {
                    e.target.classList.add('dragging');
                }
            });

            notesContainer.addEventListener('dragend', e => {
                if (e.target.matches('.sn-todo-item')) {
                    e.target.classList.remove('dragging');
                    saveState(); // Save new order
                }
            });

            notesContainer.addEventListener('dragover', e => {
                e.preventDefault();
                const draggingItem = notesContainer.querySelector('.dragging');
                if (!draggingItem) return;
                const afterElement = getDragAfterElement(notesContainer, e.clientY);
                if (afterElement == null) { notesContainer.appendChild(draggingItem); } else { notesContainer.insertBefore(draggingItem, afterElement); }
            });

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
                if (!document.body.contains(w)) return;
                try {
                    // Retrieve previous data to preserve fields if UI elements are missing (e.g. closed sidebar)
                    const previous = GM_getValue('cn_' + clientId, {});
                    const ssnEl = w.querySelector('.sn-side-textarea[data-id="ssn"]');
                    const dobEl = w.querySelector('.sn-side-textarea[data-id="dob"]');

                    // Save innerHTML directly to support Rich Text
                    const notesToSave = notesContainer.innerHTML;

                    const data = {
                        name: w.querySelector('#sn-cl-name').innerText, notes: notesToSave,
                        city: w.querySelector('#sn-city').innerText,
                        state: w.querySelector('#sn-state').innerText,
                        status: w.querySelector('#sn-status').innerText,
                        ssClassification: w.querySelector('#sn-ss-classification').innerText,
                        substatus: w.querySelector('#sn-substatus').innerText,
                        ssn: ssnEl ? ssnEl.value : previous.ssn, // from info panel
                        tz: w.querySelector('#sn-tz-select').value,
                        dob: dobEl ? dobEl.value : previous.dob,
                        revisitActive: w.querySelector('#sn-revisit-check').checked, revisit: w.querySelector('#sn-revisit-date').value,
                        // Matter panel data is no longer saved. It is scraped fresh when the panel opens.
                        // Window state
                        width: w.style.width, height: w.style.height, top: w.style.top, left: w.style.left, timestamp: Date.now(),
                        // We do NOT save form data (med/wit/etc) here to prevent overwriting.
                        // It is managed by cn_form_data_{id}
                        // customColor is saved separately by the swatch click handler.
                    };

                    // While gm-compat.js has a try-catch, adding one here provides an extra layer of
                    // safety to prevent crashes during the critical save operation if the extension
                    // context becomes invalidated at an inopportune moment.
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
            let _saveTimer;
            const debouncedSave = () => { clearTimeout(_saveTimer); _saveTimer = setTimeout(saveState, 300); };
            w.addEventListener('input', debouncedSave); w.addEventListener('change', debouncedSave);

            const tzSelect = w.querySelector('#sn-tz-select');
            if (initialTZ) { tzSelect.value = initialTZ; }
            tzSelect.onchange = () => {
                this.startClock(tzSelect.value);
                this.updateNoteColor(clientId);
                saveState();
            };

            // Helper to update Info Panel inputs from data
            const updateInfoPanelUI = (data) => {
                const keyMap = {
                    'ssn': 'ssn', 'dob': 'dob', 'phone': 'Phone', 'addr': 'Address',
                    'email': 'Email', 'pob': 'POB', 'parents': 'Parents', 'wit': 'Witness'
                };
                Object.entries(keyMap).forEach(([domId, dataKey]) => {
                    const el = w.querySelector(`.sn-side-textarea[data-id="${domId}"]`);
                    if (el && data[dataKey] !== undefined) {
                        el.value = data[dataKey];
                        // Trigger resize so multi-line values are fully visible
                        el.style.height = '1px';
                        el.style.height = (el.scrollHeight) + 'px';
                    }
                });
            };

            // Load separate form data
            const formData = GM_getValue('cn_form_data_' + clientId, {});
            this.medProvider = formData['Medical Provider'] || '';
            this.assistiveDevice = formData['Assistive Devices'] || '';
            this.condition = formData['Condition'] || '';

            const fillForm = (force = false) => {
                // Defer heavy scraping to prevent UI blocking on creation
                setTimeout(() => {
                    // 1. Load the single source of truth: the data from storage.
                    const freshData = GM_getValue('cn_' + clientId, {});
                    // Always load the latest form data
                    const freshFormData = GM_getValue('cn_form_data_' + clientId, {});

                    // 2. Scrape the current page for supplementary data.
                    const headerData = app.Core.Scraper.getHeaderData();
                    const pageData = app.Core.Scraper.getAllPageData();
                    const allScrapedData = { ...headerData, ...pageData };

                    // 3. FORCE Populate UI from the separate form storage (freshFormData).
                    // This ensures the latest scraped data always wins on refresh.
                    updateInfoPanelUI(freshFormData);
                    this.medProvider = freshFormData['Medical Provider'] || freshData.medProvider || '';
                    this.assistiveDevice = freshFormData['Assistive Devices'] || freshData.assistiveDevice || '';
                    this.condition = freshFormData['Condition'] || freshData.condition || '';

                    // 4. Merge supplementary data from the current page scrape.
                    // Only update if the stored value is empty/default, or if it's a forced refresh.
                    const nameEl = w.querySelector('#sn-cl-name');
                    if (force || nameEl.innerText === 'Client Note') {
                        nameEl.innerText = allScrapedData.clientName || freshData.name || 'Client Note';
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

                    // Update Status Bar from scraped data
                    w.querySelector('#sn-status').innerText = (headerData["Status"] ?? freshData.status) || 'Status';
                    w.querySelector('#sn-ss-classification').innerText = (headerData["SS Classification"] ?? freshData.ssClassification) || 'Classification';
                    w.querySelector('#sn-substatus').innerText = (headerData["Sub-status"] ?? freshData.substatus) || 'Sub-status';

                    // 5. Update any dependent UI
                    this.updateMedWindowUI();

                    // 6. Save the newly merged state back to storage.
                    saveState();
                }, 0);
            };

            // Force fillForm to run if the dropdowns are currently stuck on their default values
            // This prevents old, empty saves from locking the script out.
            if (!savedData.timestamp || w.querySelector('#sn-status').innerText === 'Status') {
                fillForm();
            }

            // REFRESH BUTTON: Scrape and update Header, Status Bar, and Info Panel (SSN & DOB)
            w.querySelector('#sn-refresh-btn').onclick = () => {
                // --- CONSOLIDATED SCRAPING ---
                // This now uses the centralized, reliable scraper functions from Core.js
                // instead of its own separate (and broken) logic.
                const headerData = app.Core.Scraper.getHeaderData();
                const pageData = app.Core.Scraper.getAllPageData();
                const allScrapedData = { ...headerData, ...pageData };

                // Update Info Panel Fields (SSN & DOB) from page scrape
                ['ssn', 'dob'].forEach(key => {
                    if (allScrapedData[key]) {
                        const el = w.querySelector(`.sn-side-textarea[data-id="${key}"]`);
                        if (el) {
                            el.value = allScrapedData[key];
                            el.style.height = '1px'; // Reset to calculate exact shrink/grow.
                            el.style.height = (el.scrollHeight) + 'px';
                        }
                    }
                });

                // Load existing data for fallback
                const freshData = GM_getValue('cn_' + clientId, {});
                const freshFormData = GM_getValue('cn_form_data_' + clientId, {});

                // Update Header
                w.querySelector('#sn-cl-name').innerText = headerData.clientName || freshData.name || 'Client Note';
                const newCity = allScrapedData['City'] || allScrapedData['Mailing City'] || freshData.city || freshFormData['City'] || '';
                w.querySelector('#sn-city').innerText = newCity;

                const newState = allScrapedData['State'] || allScrapedData['Mailing State'] || freshData.state || freshFormData['State'] || '';
                w.querySelector('#sn-state').innerText = newState;

                const detectedTZ = this.detectTimezone(newState, newCity);
                if (detectedTZ) {
                    const tzDropdown = w.querySelector('#sn-tz-select');
                    if (tzDropdown.value !== detectedTZ) {
                        tzDropdown.value = detectedTZ;
                        tzDropdown.dispatchEvent(new Event('change'));
                    } else {
                        // Force update even if TZ hasn't changed (fixes lost color/time on refresh)
                        this.startClock(detectedTZ);
                        this.updateNoteColor(clientId);
                    }
                }

                // Update Status Bar using the reliable getHeaderData() results
                w.querySelector('#sn-status').innerText = (headerData["Status"] ?? freshData.status) || 'Status';
                w.querySelector('#sn-ss-classification').innerText = (headerData["SS Classification"] ?? freshData.ssClassification) || 'Classification';
                w.querySelector('#sn-substatus').innerText = (headerData["Sub-status"] ?? freshData.substatus) || 'Sub-status';

                // Re-render Matter Panel if it's open to reflect new data
                /* const sidePanel = w.querySelector('#sn-side-panel');
                const sideTitle = w.querySelector('#sn-panel-title');
                if (sidePanel.style.display === 'flex' && sideTitle.innerText === 'Matter Details') {
                    app.Features.MatterPanel.render(w.querySelector('#sn-panel-body'), { clientId, w, ClientNote: this, app: window.CM_App });
                }

                // Update Indicators with fresh data
                app.Features.MatterPanel.updateIndicators(w, allScrapedData, app); */

                saveState();
            };

            w.querySelector('#sn-del-btn').onclick = () => {
                if (confirm("Delete notes?")) {
                    try {
                        GM_deleteValue('cn_' + clientId);
                        GM_deleteValue('cn_form_data_' + clientId);
                        GM_deleteValue('cn_med_table_' + clientId);

                        // Reset internal memory
                        this.medProvider = ''; this.assistiveDevice = ''; this.condition = '';

                        // Close windows immediately
                        this.destroy(clientId);

                        // Update taskbar state (ghost the buttons)
                        this.checkStoredData(clientId);
                    } catch (e) { }
                    app.Core.Taskbar.update();
                }
            };



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
         * Synchronizes local UI elements (like Medical fields and Info panel) with incoming data state.
         * 
         * @param {Object} data - The client data object containing extracted fields.
         */
        updateUI(data) {
            if (!data) return;
            const cnWindow = document.getElementById('sn-client-note');
            if (!cnWindow) return;

            // Update internal memory for medical fields
            if (data['Medical Provider']) this.medProvider = data['Medical Provider'];
            if (data['Assistive Devices']) this.assistiveDevice = data['Assistive Devices'];
            if (data['Condition']) this.condition = data['Condition'];

            // Update Info Panel Textareas
            const keyMap = {
                'Address': 'addr', 'Phone': 'phone', 'Email': 'email',
                'POB': 'pob', 'Parents': 'parents', 'Witness': 'wit'
            };
            Object.entries(keyMap).forEach(([scrapedKey, domId]) => {
                if (data[scrapedKey] !== undefined) {
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

            // Update State if present in remote data
            if (data['State']) {
                const stateEl = cnWindow.querySelector('#sn-state');
                if (stateEl && stateEl.innerText !== data['State']) {
                    stateEl.innerText = data['State'];
                    // Trigger logic to update color/time if needed
                    const currentCity = data['City'] || cnWindow.querySelector('#sn-city').innerText;
                    const detectedTZ = this.detectTimezone(data['State'], currentCity);
                    if (detectedTZ) {
                        const tzDropdown = cnWindow.querySelector('#sn-tz-select');
                        if (tzDropdown && tzDropdown.value !== detectedTZ) {
                            tzDropdown.value = detectedTZ;
                            tzDropdown.dispatchEvent(new Event('change'));
                        }
                    }
                }
            }

            // Update MedWindow UI if open
            this.updateMedWindowUI();
        },

        /**
         * Evaluates stored data for a client to toggle visibility indicators (e.g. "has-data" glow) on taskbar tabs.
         * 
         * @param {string} clientId - The 18-character Salesforce Client ID.
         */
        checkStoredData(clientId) {
            if (!clientId) return;
            const cnBtn = document.getElementById('tab-sn-client-note');
            const medBtn = document.getElementById('tab-sn-med-popout');

            // Check Client Note Data
            const cnData = GM_getValue('cn_' + clientId);
            if (cnData && cnData.timestamp) {
                if (cnBtn) cnBtn.classList.add('sn-has-data');
            } else {
                if (cnBtn) cnBtn.classList.remove('sn-has-data');
            }

            // Check Med Data
            const formData = GM_getValue('cn_form_data_' + clientId, {});
            const hasMed = formData['Medical Provider'] || formData['Assistive Devices'] || formData['Condition'];
            if (hasMed && medBtn) medBtn.classList.add('sn-has-data');
            else if (medBtn) medBtn.classList.remove('sn-has-data');
        },

        /**
         * Safely dismantles the Client Note and/or Medical windows, cleans up event listeners, 
         * and respects the "pinned" status unless forced.
         * 
         * @param {string} clientId - The 18-character Salesforce Client ID.
         * @param {boolean} [force=false] - Whether to destroy the windows regardless of their pinned state.
         */
        destroy(clientId, force = false) {
            const w = document.getElementById('sn-client-note');
            const mw = document.getElementById('sn-med-popout');

            if (w) w.remove();
            if (mw) { mw.remove(); app.Core.Windows.updateTabState('sn-med-popout'); }

            // Remove GM value listeners
            if (this.listeners[clientId]) {
                GM_removeValueChangeListener(this.listeners[clientId]);
                delete this.listeners[clientId];
            }
            const settingsToWatch = ['sn_ui_theme', 'sn_tz_note_color', 'sn_note_follow_theme', 'sn_note_default_color'];
            settingsToWatch.forEach(key => {
                if (this.listeners[key]) {
                    GM_removeValueChangeListener(this.listeners[key]);
                    delete this.listeners[key];
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
        },

        /**
         * Refreshes the textareas within the Medical Provider popout window with current memory values.
         */
        updateMedWindowUI() {
            const medWindow = document.getElementById('sn-med-popout');
            if (medWindow) {
                const setVal = (field, val) => { const el = medWindow.querySelector(`textarea[data-field="${field}"]`); if (el) el.value = val || ''; };
                setVal('Medical Provider', this.medProvider);
                setVal('Assistive Devices', this.assistiveDevice);
                setVal('Condition', this.condition);
            }
        },

        /**
         * Toggles the visibility of the supplementary Medical Provider window.
         * Instantiates the window and its parsing logic if it doesn't exist.
         */
        toggleMedWindow() {
            const mid = 'sn-med-popout';
            const medWindow = document.getElementById(mid);

            if (medWindow) {
                if (medWindow.style.display === 'none') {
                    medWindow.style.display = 'flex';
                    app.Core.Windows.bringToFront(medWindow);
                } else {
                    medWindow.style.display = 'none';
                }
                app.Core.Windows.updateTabState(mid);
                return;
            }

            const clientId = this.getClientId();
            if (!clientId) {
                app.Core.Utils.showNotification("Cannot open Medical Window without a client record loaded.", { type: 'error' });
                return;
            }

            const cnWindow = document.getElementById('sn-client-note');
            let clientName, scrapedSSN;

            if (cnWindow && cnWindow.style.display !== 'none') {
                clientName = cnWindow.querySelector('#sn-cl-name').innerText || 'Client';
                scrapedSSN = app.Core.Scraper.getAllPageData().ssn || '--';
            } else {
                const headerData = app.Core.Scraper.getHeaderData();
                const pageData = app.Core.Scraper.getAllPageData();
                clientName = headerData.clientName || 'Client';
                scrapedSSN = pageData.ssn || '--';
            }

            // Load medical data from storage regardless
            const formData = GM_getValue('cn_form_data_' + clientId, {});
            this.medProvider = formData['Medical Provider'] || '';
            this.assistiveDevice = formData['Assistive Devices'] || '';
            this.condition = formData['Condition'] || '';
            const medProviderText = this.medProvider;
            const assistiveDeviceText = this.assistiveDevice;
            const conditionText = this.condition;

            // --- MED PROVIDER POP-OUT ---
            // NEW: Load saved table data
            const savedTableData = GM_getValue('cn_med_table_' + clientId, null);
            // NEW LOGIC: Determine if left panel should be shown initially
            const showLeftPanel = !savedTableData || savedTableData.length === 0;

            // CHANGED: Default position logic (1080x450, center bottom)
            let savedSize = GM_getValue('def_pos_MED', { width: '1080px', height: '450px' });
            // Migration: Upgrade old defaults to new ones
            if (savedSize.height === '300px') savedSize.height = '450px';
            if (savedSize.width === '700px') savedSize.width = '1080px';

            const mwW = parseInt(savedSize.width);
            const mwH = parseInt(savedSize.height);
            const mwLeft = (window.innerWidth / 2) - (mwW / 2);

            const mw = document.createElement('div');
            mw.id = mid; mw.className = 'sn-window';
            mw.style.width = mwW + 'px';
            mw.style.height = mwH + 'px';
            mw.style.left = mwLeft + 'px';
            mw.style.bottom = '40px'; // Docked above taskbar
            mw.style.background = '#f9f9f9';
            mw.style.display = 'flex';
            mw.style.flexDirection = 'column';
            mw.style.boxShadow = '0 4px 15px rgba(0,0,0,0.4)';
            mw.style.fontSize = '12px';
            mw.style.zIndex = '10005';

            const style = document.createElement('style');
            style.innerHTML = `
                td[contenteditable]:empty::before { content: attr(placeholder); color: #aaa; font-style: italic; }
                #sn-med-table { width: 100%; border-collapse: collapse; }
                #sn-med-table td, #sn-med-table th { word-wrap: break-word; overflow-wrap: break-word; }
                #sn-med-table th:nth-child(n+3), #sn-med-table td:nth-child(n+3) { width: 1%; white-space: nowrap; }
            `;
            mw.appendChild(style);

            mw.innerHTML += `
                <div class="sn-header" style="background:var(--sn-bg-light); padding:5px; display:flex; justify-content:space-between; align-items:center; cursor:move; border-bottom:1px solid var(--sn-border); position: relative;">
                    <span style="font-weight:bold;">Medical Providers Table</span>
                    <button id="sn-med-expand-btn" style="position: absolute; left: 50%; transform: translateX(-50%); cursor:pointer; background:var(--sn-bg-lighter); border:1px solid var(--sn-border); border-radius:3px; font-size:10px; padding:2px 6px; color:var(--sn-primary-dark); font-weight:bold;">Expand</button>
                    <div>
                        <button id="sn-med-min-btn" style="cursor:pointer; background:none; border:none; font-weight:bold; padding:0 5px;">_</button>
                    </div>
                </div>
                <div style="display:flex; flex-grow:1; overflow:hidden;">
                    <div id="sn-med-left" style="width:30%; display:${showLeftPanel ? 'flex' : 'none'}; flex-direction:column; border-right:1px solid #ccc; background:#fff; flex-shrink:0; font-size:inherit;">
                        <div style="padding:10px; overflow-y:auto; flex-grow:1; display:flex; flex-direction:column; gap:8px;">
                            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #eee; padding-bottom:5px; margin-bottom: 5px;">
                                <div style="display:flex; gap:5px;">
                                    <button id="sn-med-parse-btn" title="Parse medical text" style="padding:4px 8px; cursor:pointer; border:1px solid #999; background:var(--sn-bg-lighter); border-radius:4px; font-size:11px; font-weight:bold;">Parse Medical Data</button>
                                    <button id="sn-med-undo-btn" title="Undo last parse" style="display:none; padding:4px 8px; cursor:pointer; border:1px solid #ef5350; background:#ffebee; color:#c62828; border-radius:4px; font-size:11px; font-weight:bold;">Undo</button>
                                </div>
                                <button id="sn-med-hide-btn" style="cursor:pointer; background:var(--sn-bg-lighter); border:1px solid var(--sn-border); border-radius:3px; font-size:10px; padding:2px 6px; color:var(--sn-primary-dark); font-weight:bold;">Hide</button>
                            </div>
                            <div style="flex-grow:1; display:flex; flex-direction:column;"><label style="font-weight:bold; font-size:11px; color:#555; display:block; margin-bottom:2px;">Medical Provider</label><textarea class="sn-med-textarea" data-field="Medical Provider" readonly style="width:100%; flex-grow:1; resize:none; border:1px solid #ccc; padding:4px; background:#f9f9f9; font-family:inherit; font-size:inherit;">${medProviderText}</textarea></div>
                        </div>
                    </div>
                    <div id="sn-med-partition" style="width:5px; cursor:col-resize; background:#f0f0f0; border-left:1px solid #ddd; border-right:1px solid #ddd; flex-shrink:0;"></div>
                    <div style="flex-grow:1; display:flex; flex-direction:column; background:#fff; min-width:200px; overflow:hidden;">
                        <div style="padding:8px; border-bottom:1px solid #eee; display:flex; align-items:center; gap:10px; flex-shrink:0;">
                            <button id="sn-med-raw-btn" title="Show Raw Medical Text" style="padding:4px 8px; cursor:pointer; border:1px solid #999; background:var(--sn-bg-lighter); border-radius:4px; font-size:11px; font-weight:bold;">Raw</button>
                            <span style="margin-left:auto; font-size:14px; font-weight:bold; color:#333;">Client: ${clientName}</span>
                            <span style="color:#ccc;">|</span>
                            <span style="font-size:14px; font-weight:bold; color:#333;">SSN: ${scrapedSSN}</span>
                        </div>
                        <div style="flex-grow:1; padding:10px; overflow-y:auto; display:flex; flex-direction:column;">
                            <div style="flex-grow:1; overflow:auto; margin-bottom:10px; border:1px solid #eee;">
                                <table id="sn-med-table" style="font-size:inherit;"><thead><tr style="background:#eee; text-align:left;"><th style="border:1px solid #ccc; padding:4px;">Dr/Facilities</th><th style="border:1px solid #ccc; padding:4px;">Address</th><th style="border:1px solid #ccc; padding:4px;">Phone</th><th style="border:1px solid #ccc; padding:4px;">First Visit</th><th style="border:1px solid #ccc; padding:4px;">Last Visit</th><th style="border:1px solid #ccc; padding:4px;">Next Appt</th></tr></thead><tbody></tbody></table>
                            </div>
                            <div style="display:flex; gap:10px; border-top:1px solid #eee; padding-top:10px; flex-shrink:0;">
                                <div style="flex:1; display:flex; flex-direction:column;">
                                    <label style="font-weight:bold; font-size:11px; color:#555; margin-bottom:2px;">Medical Conditions</label>
                                    <textarea class="sn-med-textarea" data-field="Condition" style="width:100%; flex-grow:1; min-height:80px; resize:vertical; border:1px solid #ccc; padding:4px; background:#fff; font-family:inherit; font-size:inherit;">${conditionText}</textarea>
                                </div>
                                <div style="flex:1; display:flex; flex-direction:column;">
                                    <label style="font-weight:bold; font-size:11px; color:#555; margin-bottom:2px;">Assistive Devices</label>
                                    <textarea class="sn-med-textarea" data-field="Assistive Devices" style="width:100%; height:4.5em; resize:vertical; border:1px solid #ccc; padding:4px; background:#fff; font-family:inherit; font-size:inherit;">${assistiveDeviceText}</textarea>
                                    <div style="display:flex; justify-content:flex-end; align-items:center; gap:10px; margin-top:5px;">
                                        <button id="sn-med-font-dec" style="cursor:pointer; border:1px solid #999; background:#eee; width:20px; border-radius:3px; font-weight:normal;">-</button>
                                        <button id="sn-med-font-inc" style="cursor:pointer; border:1px solid #999; background:#eee; width:20px; border-radius:3px; font-weight:normal;">+</button>
                                        <button id="sn-medication-panel-trigger" style="padding:4px 8px; cursor:pointer; font-weight:bold; font-size:11px;">Medications</button>
                                        <button id="sn-med-gen-pdf" style="padding:5px 15px; cursor:pointer; font-weight:bold;">📄 Generate PDF</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="sn-resizer rs-n"></div><div class="sn-resizer rs-s"></div><div class="sn-resizer rs-e"></div><div class="sn-resizer rs-w"></div><div class="sn-resizer rs-ne"></div><div class="sn-resizer rs-nw"></div><div class="sn-resizer rs-se"></div><div class="sn-resizer rs-sw"></div>
            `;
            document.body.appendChild(mw);
            app.Core.Windows.setup(mw, mw.querySelector('#sn-med-min-btn'), mw.querySelector('.sn-header'), 'MED');

            app.Core.Windows.bringToFront(mw);

            const medPanelBtn = mw.querySelector('#sn-medication-panel-trigger');
            if (medPanelBtn) {
                medPanelBtn.onclick = () => {
                    // This module is loaded from a separate file. Check if it exists.
                    if (app.Tools && app.Tools.MedicationPanel) {
                        app.Tools.MedicationPanel.create();
                    }
                };
            }

            const expandBtn = mw.querySelector('#sn-med-expand-btn');
            expandBtn.onclick = () => {
                if (expandBtn.innerText === "Restore") {
                    mw.style.width = mwW + 'px'; mw.style.height = mwH + 'px';
                    mw.style.top = ''; mw.style.bottom = '40px'; mw.style.left = mwLeft + 'px';
                    expandBtn.innerText = "Expand";
                } else {
                    mw.style.height = '55vh';
                    mw.style.top = ''; // Allow bottom anchoring to take effect
                    mw.style.bottom = '40px';
                    expandBtn.innerText = "Restore";
                }
                // Trigger resize event for any listeners
                mw.dispatchEvent(new Event('resize'));
            };

            // NEW LOGIC: Raw/Hide buttons for dynamic window resizing
            const leftPanel = mw.querySelector('#sn-med-left');
            mw.querySelector('#sn-med-hide-btn').onclick = () => {
                if (leftPanel.style.display === 'none') return;
                const panelWidth = leftPanel.offsetWidth;
                mw.dataset.leftPanelWidth = panelWidth;
                const currentLeft = mw.offsetLeft;
                const currentWidth = mw.offsetWidth;
                leftPanel.style.display = 'none';
                mw.style.width = (currentWidth - panelWidth) + 'px';
                mw.style.left = (currentLeft + panelWidth) + 'px';
            };
            mw.querySelector('#sn-med-raw-btn').onclick = () => {
                if (leftPanel.style.display !== 'none') return;
                const panelWidth = parseInt(mw.dataset.leftPanelWidth || 255); // Default width ~30% of 850
                const currentLeft = mw.offsetLeft;
                const currentWidth = mw.offsetWidth;
                leftPanel.style.display = 'flex';
                leftPanel.style.width = panelWidth + 'px';
                mw.style.width = (currentWidth + panelWidth) + 'px';
                mw.style.left = (currentLeft - panelWidth) + 'px';
            };

            const tableBody = mw.querySelector('#sn-med-table tbody');
            let undoStack = null;

            const getTableData = () => {
                return Array.from(tableBody.querySelectorAll('tr')).map(row => {
                    const cells = row.querySelectorAll('td');
                    return {
                        doctorFacility: cells[0].innerText,
                        address: cells[1].innerText,
                        phone: cells[2].innerText,
                        firstVisit: cells[3].innerText,
                        lastVisit: cells[4].innerText,
                        nextVisit: cells[5].innerText
                    };
                });
            };

            const saveTableData = () => {
                const data = getTableData();
                GM_setValue('cn_med_table_' + clientId, data);
            };

            const renderTable = (data) => {
                tableBody.innerHTML = '';
                const rowsToRender = data && data.length > 0 ? data : [{}, {}, {}]; // Default 3 empty rows if null

                rowsToRender.forEach(provider => {
                    tableBody.insertAdjacentHTML('beforeend', `
                        <tr>
                            <td contenteditable="true" placeholder="Facilities / Doctor" style="border:1px solid #ccc; padding:4px;">${provider.doctorFacility || ''}</td>
                            <td contenteditable="true" style="border:1px solid #ccc; padding:4px;">${provider.address || ''}</td>
                            <td contenteditable="true" style="border:1px solid #ccc; padding:4px;">${provider.phone || ''}</td>
                            <td contenteditable="true" style="border:1px solid #ccc; padding:4px;">${provider.firstVisit || ''}</td>
                            <td contenteditable="true" style="border:1px solid #ccc; padding:4px;">${provider.lastVisit || ''}</td>
                            <td contenteditable="true" style="border:1px solid #ccc; padding:4px;">${provider.nextVisit || ''}</td>
                        </tr>
                    `);
                });
            };

            const runMedicalParse = () => {
                // 1. Grab the text from the Medical Provider textarea
                const medTextarea = mw.querySelector('textarea[data-field="Medical Provider"]');
                if (!medTextarea.value.trim()) return;

                // Save current state for Undo
                undoStack = getTableData();
                mw.querySelector('#sn-med-undo-btn').style.display = 'inline-block';

                // 2. Parse the text using your existing function
                const parsedData = this.parseMedicalProviders(medTextarea.value);

                // Add one empty row at the bottom for manual entry
                parsedData.push({});

                renderTable(parsedData);
                saveTableData();
            };

            mw.querySelector('#sn-med-parse-btn').onclick = runMedicalParse;
            mw.querySelector('#sn-med-undo-btn').onclick = () => {
                if (undoStack) {
                    renderTable(undoStack);
                    saveTableData();
                    mw.querySelector('#sn-med-undo-btn').style.display = 'none';
                    undoStack = null;
                }
            };

            // Save on any edit
            mw.querySelector('#sn-med-table').addEventListener('input', saveTableData);

            // Initialize: Load saved data OR parse if empty
            if (savedTableData && savedTableData.length > 0) {
                renderTable(savedTableData);
            } else {
                runMedicalParse();
                // Hide undo for initial auto-parse
                mw.querySelector('#sn-med-undo-btn').style.display = 'none';
            }

            mw.querySelectorAll('.sn-med-textarea').forEach(inp => {
                const field = inp.getAttribute('data-field');
                if (field === 'Medical Provider') {
                    inp.ondblclick = () => { inp.removeAttribute('readonly'); inp.style.background = '#fff'; inp.style.border = '1px solid var(--sn-border)'; inp.focus(); };
                    inp.onblur = () => { inp.setAttribute('readonly', true); inp.style.background = '#f9f9f9'; inp.style.border = '1px solid #ccc'; };
                }
                inp.oninput = () => {
                    const value = inp.value;

                    // Update internal state for immediate UI feedback if needed
                    if (field === 'Medical Provider') this.medProvider = value;
                    if (field === 'Assistive Devices') this.assistiveDevice = value;
                    if (field === 'Condition') this.condition = value;

                    // Directly save the change to persistent storage
                    this.updateAndSaveData(clientId, { [field]: value });
                };
            });

            const medPart = mw.querySelector('#sn-med-partition');
            medPart.onmousedown = (e) => {
                e.preventDefault(); const startX = e.clientX, startW = leftPanel.offsetWidth;
                const onMove = (mv) => { leftPanel.style.width = Math.max(100, (startW + (mv.clientX - startX))) + 'px'; };
                const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
                document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
            };

            const updateMedFont = (d) => { let cur = parseInt(mw.style.fontSize) || 12; mw.style.fontSize = Math.max(9, Math.min(18, cur + d)) + 'px'; };
            mw.querySelector('#sn-med-font-dec').onclick = (e) => { e.stopPropagation(); updateMedFont(-1); };
            mw.querySelector('#sn-med-font-inc').onclick = (e) => { e.stopPropagation(); updateMedFont(1); };

            const table = mw.querySelector('#sn-med-table');
            table.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    const row = e.target.closest('tr');
                    if (row && row === table.querySelector('tbody tr:last-child')) {
                        e.preventDefault();
                        const newRow = row.cloneNode(true);
                        newRow.querySelectorAll('td').forEach(td => td.innerText = '');
                        table.querySelector('tbody').appendChild(newRow);
                        newRow.querySelector('td').focus();
                    }
                }
            });
        },
        /**
         * Parses unstructured medical text blocks into structured provider objects.
         * 
         * @param {string} text - The raw text block containing medical provider notes.
         * @returns {Array<Object>} An array of parsed provider data objects.
         */
        parseMedicalProviders(text) {
            // Normalize separators: convert dash lines (2+ dashes) into empty lines
            let normalizedText = text.replace(/(?:^|\n)\s*-{2,}\s*(?:\n|$)/g, '\n\n');

            // Check for exploded text (all lines separated by empty lines)
            const tempBlocks = normalizedText.split(/\n\s*\n/).filter(b => b.trim());
            if (tempBlocks.length > 1 && tempBlocks.every(b => !b.trim().includes('\n'))) {
                normalizedText = normalizedText.replace(/\n\s*\n/g, '\n');
            }

            // 1. Split into blocks by one or more empty lines.
            const providerBlocks = normalizedText.split(/\n\s*\n/).filter(block => block.trim() !== '');
            const providers = [];

            for (const block of providerBlocks) {
                // 3. More flexible regexes. Using /m for multiline to anchor with ^, and /i for case-insensitivity.
                let doctorName = (block.match(/^(?:Dr\.?\s?Name|Dr information):?\s*(.*)/im) || [])[1] || "";
                let clinicName = (block.match(/^(?:Hospital Name|Health Facility|Office Name|Name of clinic\/ ?hospital|Doctor\/Facility):?\s*(.*)/im) || [])[1] || "";
                let doctorFacility = "";

                if (clinicName && doctorName) {
                    doctorFacility = `${doctorName.trim()} || ${clinicName.trim()}`;
                } else {
                    doctorFacility = (doctorName || clinicName).trim();
                }

                // If still no name, assume the first line is the name, as long as it doesn't look like another field.
                if (!doctorFacility) {
                    const lines = block.split('\n').map(l => l.trim()).filter(l => l);
                    if (lines.length > 0) {
                        let candidate = lines[0];
                        candidate = candidate.replace(/^[\d]+[.)]\s*/, ''); // Remove numbering

                        const skipRegex = /^(address|phone|visit|appt|telephone|1st|last|next|fv|lv|condition|treatment|diagnosis|medication|meds|rx|history|comment|note|date)/i;
                        const isDateOrNum = (s) => /^[\d\/\-\.\s]+$/.test(s);

                        if (/unsure|unknown|don't know/i.test(candidate) && lines.length > 1) {
                            const nextLine = lines[1];
                            if (!skipRegex.test(nextLine) && !isDateOrNum(nextLine)) candidate = nextLine;
                        }

                        if (!/:\s*$/.test(candidate) && !skipRegex.test(candidate) && !isDateOrNum(candidate)) {
                            doctorFacility = candidate;
                        }
                    }
                }

                // Capture address allowing for multiple lines (stop at next keyword or end of block)
                let addressMatch = block.match(/^Address:\s*([\s\S]+?)(?=\n\s*(?:Phone|Telephone|number|1st|First|FV|Last|Next|Appt)|$)/im);
                let address = "";
                if (addressMatch) {
                    address = addressMatch[1].replace(/\r?\n/g, ', ').trim().replace(/,\s*,/g, ', ').replace(/,\s*$/, '');
                }

                // Address Fallback
                if (!address) {
                    const lines = block.split('\n').map(l => l.trim());
                    for (let i = 0; i < lines.length; i++) {
                        const line = lines[i];
                        if (/[A-Z]{2}[,.]?\s+\d{5}/.test(line) && !/\d{1,2}\/\d{1,2}\/\d{4}/.test(line)) {
                            let addrParts = [line];
                            if (i > 0) {
                                const prev = lines[i - 1];
                                if (/^\d+/.test(prev) && !/phone|telephone/i.test(prev)) addrParts.unshift(prev);
                            }
                            address = addrParts.join(', ');
                            break;
                        }
                    }
                }

                let phone = (block.match(/^(?:Phone(?: Number)?|Telephone Number|number):?\s*(.*)/im) || [])[1] || "";
                if (!phone) { const pm = block.match(/(?:\+?1[-.\s]?)?\(?(\d{3})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})/); if (pm) phone = pm[0]; }

                let firstVisit = (block.match(/^(?:1st Visit|First Visit|1st V|First V|FV):?\s*(.*)/im) || [])[1] || "";
                let lastVisit = (block.match(/^(?:Last Visit|Last V|Last|LV):?\s*(.*)/im) || [])[1] || "";
                let nextVisit = (block.match(/^(?:Next Appointment|Next appt|Next Visit|Appointment|Appt.):?\s*(.*)/im) || [])[1] || "";

                const firstLastVisitMatch = block.match(/(?:First and last visit:)\s*([^\n\r]+)/i);
                if (firstLastVisitMatch) {
                    const dates = firstLastVisitMatch[1].split(',').map(d => d.trim());
                    if (dates.length === 2) {
                        [firstVisit, lastVisit] = dates;
                    }
                }

                // Only add if we found a name.
                if (doctorFacility) {
                    providers.push({
                        doctorFacility: doctorFacility.trim(),
                        address: address.trim(),
                        phone: app.Core.Utils.formatPhoneNumber(phone.trim()),
                        firstVisit: firstVisit.trim(),
                        lastVisit: lastVisit.trim(),
                        nextVisit: nextVisit.trim()
                    });
                }
            }

            return providers;
        }

    };

    /**
     * Helper mapping exposing the `AppObserver` method for internal use.
     * 
     * @returns {string|null} The current active 18-character Client ID.
     */
    ClientNote.getClientId = () => window.CM_App.AppObserver.getClientId();

    app.Features.ClientNote = ClientNote;
})();
