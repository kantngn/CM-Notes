// ==UserScript==
// @name         CM Notes Optimized
// @namespace    http://tampermonkey.net/
// @version      0.4.0
// @description  KD CM1 Notes tool - Robust DOM Observer & Secure Events
// @author       Kant Nguyen (Optimized)
// @match        https://*.lightning.force.com/*
// @match        https://kdcv1.lightning.force.com/*
// @match        https://*.my.site.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_listValues
// @grant        GM_setClipboard
// @grant        GM_deleteValue
// ==/UserScript==

(function() {
    'use strict';

    // ==========================================
    // 1. CSS STYLES (Optimized to remove inline hover scripts)
    // ==========================================
    GM_addStyle(`
        /* --- Taskbar --- */
        #sn-taskbar {
            position: fixed; bottom: 0; left: 500px; right: 0; height: 35px;
            background: #e0f2f1; border-top: 1px solid #80cbc4; z-index: 99999;
            display: flex; align-items: center; justify-content: center;
            box-shadow: 0 -2px 5px rgba(0,0,0,0.05); font-family: sans-serif; font-size: 13px;
        }

        /* Left Label */
        .sn-version-label {
            position: absolute; left: 15px;
            font-weight: bold; color: #00695c;
            font-size: 12px; font-family: 'Segoe UI', sans-serif;
            text-transform: uppercase; letter-spacing: 0.5px;
            pointer-events: none;
        }

        /* Center Tabs */
        .sn-center-group { display: flex; gap: 10px; transform: translateX(-250px); }

        .sn-tb-btn {
            width: 140px; padding: 4px 0; border: 1px solid #b2dfdb; background: #fff;
            cursor: pointer; border-radius: 3px; font-weight: bold; color: #00695c;
            opacity: 0.6; transition: all 0.2s; text-align: center;
        }
        .sn-tb-btn:hover { opacity: 0.9; background: #f0fdfc; }
        .sn-tb-btn.active { opacity: 1.0; border-color: #009688; background: #fff; border-bottom: 3px solid #009688; }
        .sn-tb-btn.focused { background: #009688; color: white; border-color: #00796b; opacity: 1.0; }

        /* Dashboard Button */
        #sn-dash-btn {
            position: absolute; right: 15px; bottom: 15px;
            width: 60px; height: 60px;
            background: white; border: 2px solid #29b6f6; border-radius: 50%;
            font-size: 28px; cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            box-shadow: 0 0 20px #4fc3f7;
            transition: transform 0.2s, box-shadow 0.2s;
            z-index: 100000;
        }
        #sn-dash-btn:hover { transform: scale(1.1); box-shadow: 0 0 30px #03a9f4; }

        /* --- Color Picker --- */
        .sn-cp-dropdown { position: relative; display: inline-block; margin-right: 5px; }
        .sn-cp-btn { cursor: pointer; font-size: 16px; background: none; border: none; }
        .sn-cp-content {
            display: none; position: absolute; top: 20px; right: 0;
            background-color: white; border: 1px solid #ccc; padding: 5px;
            box-shadow: 0 4px 8px rgba(0,0,0,0.2); z-index: 10002;
            width: 110px; flex-wrap: wrap; gap: 2px;
        }
        .sn-cp-dropdown:hover .sn-cp-content { display: flex; }
        .sn-swatch { width: 20px; height: 20px; cursor: pointer; border: 1px solid #ddd; }
        .sn-swatch:hover { border-color: #000; transform: scale(1.1); }

        /* --- Windows --- */
        .sn-window {
            position: fixed; border: 1px solid #009688;
            box-shadow: 5px 5px 15px rgba(0,0,0,0.3); z-index: 10000;
            display: flex; flex-direction: column;
            min-width: 250px; min-height: 200px;
            background: #e0f2f1;
            transition: box-shadow 0.2s, border-color 0.2s;
        }
        .sn-saved-glow { box-shadow: 0 0 15px #009688 !important; border-color: #009688 !important; }
        .sn-header { padding: 6px 10px; cursor: move; user-select: none; display: flex; justify-content: space-between; align-items: center; }

        .sn-dds-blue { background-color: #0d47a1 !important; color: white !important; }
        .sn-dds-white { background-color: #e3f2fd !important; color: black !important; }

        /* --- Dashboard Specifics --- */
        .sn-dash-body { display: flex; flex-grow: 1; overflow: hidden; height: 100%; }
        .sn-dash-sidebar {
            width: 50px; background: #00695c; display: flex; flex-direction: column; align-items: center; padding-top: 10px; gap: 10px;
        }
        .sn-dash-tab {
            writing-mode: vertical-rl; text-orientation: mixed; transform: rotate(180deg);
            padding: 15px 5px; color: #b2dfdb; cursor: pointer; font-weight: bold; font-size: 12px;
            border-left: 3px solid transparent; transition: all 0.2s;
        }
        .sn-dash-tab:hover { color: white; background: rgba(255,255,255,0.1); }
        .sn-dash-tab.active { color: white; border-left: 3px solid #29b6f6; background: rgba(255,255,255,0.2); }

        .sn-dash-list { flex-grow: 1; overflow-y: auto; padding: 10px; background: #f1f8e9; }

        .sn-list-item {
            padding: 8px; border-bottom: 1px solid #b2dfdb; cursor: pointer;
            display: flex; justify-content: space-between; align-items: center;
            background: white; margin-bottom: 5px; border-radius: 4px; border: 1px solid #b2dfdb;
            transition: transform 0.1s, box-shadow 0.1s;
        }
        .sn-list-item:hover { transform: translateX(2px); box-shadow: 2px 2px 5px rgba(0,0,0,0.1); }

        .sn-item-left { display: flex; flex-direction: column; }
        .sn-item-name { font-weight: bold; color: #004d40; font-size: 13px; }
        .sn-item-status { font-size: 11px; color: #00796b; font-style: italic; margin-top: 2px; }

        .sn-item-right { text-align: right; max-width: 140px; font-size: 10px; color: #555; }
        .sn-todo-line { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

        /* --- Fax Form Buttons --- */
        .sn-fax-btn {
            width: 100%; text-align: left; background: #e0e0e0; border: 1px solid #bbb;
            padding: 5px; font-weight: bold; cursor: pointer; margin-bottom: 2px;
            color: #333; transition: background 0.2s;
        }
        .sn-fax-btn:hover { background: #ccc !important; }

        /* --- Resizers & Utils --- */
        .sn-resizer { position: absolute; z-index: 10001; }
        .rs-n { top:-5px; left:5px; right:5px; height:10px; cursor:n-resize; }
        .rs-s { bottom:-5px; left:5px; right:5px; height:10px; cursor:s-resize; }
        .rs-e { right:-5px; top:5px; bottom:5px; width:10px; cursor:e-resize; }
        .rs-w { left:-5px; top:5px; bottom:5px; width:10px; cursor:w-resize; }
        .rs-ne { top:-5px; right:-5px; width:15px; height:15px; cursor:ne-resize; }
        .rs-nw { top:-5px; left:-5px; width:15px; height:15px; cursor:nw-resize; }
        .rs-se { bottom:-5px; right:-5px; width:15px; height:15px; cursor:se-resize; }
        .rs-sw { bottom:-5px; left:-5px; width:15px; height:15px; cursor:sw-resize; }
        [contenteditable]:empty:before { content: attr(placeholder); color: #888; font-style: italic; display: block; }
    `);

    // ==========================================
    // 2. SCRAPER MODULE
    // ==========================================
    const Scraper = {
        getHeaderData() {
            const data = {};
            function pierceShadows(root) {
                if (!root.querySelectorAll) return;

                root.querySelectorAll('p.slds-text-title').forEach(labelEl => {
                    // Skip hidden elements from background tabs
                    if (labelEl.getBoundingClientRect().width === 0) return;

                    const label = (labelEl.getAttribute('title') || labelEl.textContent).trim();
                    if (label) {
                        const sibling = labelEl.nextElementSibling;
                        if (sibling && sibling.classList.contains('fieldComponent')) {
                            // Try normal innerText first
                            let value = sibling.innerText ? sibling.innerText.trim() : '';
                            
                            // If empty, intercept the <slot> projection
                            if (!value) {
                                const slot = sibling.querySelector('slot');
                                if (slot && slot.assignedNodes) {
                                    const slottedElements = slot.assignedNodes({ flatten: true });
                                    value = slottedElements.map(node => node.textContent || node.innerText).join('').trim();
                                }
                            }
                            if (value) data[label] = value;
                        }
                    }
                });

                // NEW: Search for the SSD App Form Link
                root.querySelectorAll('a').forEach(aTag => {
                    if (aTag.getBoundingClientRect().width === 0) return;
                    
                    const href = aTag.getAttribute('href');
                    const text = aTag.textContent.trim();
                    
                    if (href && (text === 'Open SSD App Form' || href.includes('my.site.com/forms/s/'))) {
                        data['ssdAppLink'] = href;
                    }
                });
                
                // Recursively dig through all Shadow DOMs
                root.querySelectorAll('*').forEach(child => {
                    if (child.shadowRoot) pierceShadows(child.shadowRoot);
                });
            }
            
            pierceShadows(document);
            return data;
        },

        getSidebarData() {
            const getDeepValue = (possibleLabels) => {
                const findLabel = (root) => {
                    const spans = Array.from(root.querySelectorAll('span.test-id__field-label'));

                    // NEW: Filter out hidden spans so it only reads the active client on screen
                    const visibleSpans = spans.filter(s => s.getBoundingClientRect().width > 0);

                    const found = visibleSpans.find(s => possibleLabels.some(l => s.innerText.trim().toLowerCase() === l.toLowerCase()));
                    if (found) return found;

                    for (let el of root.querySelectorAll('*')) {
                        if (el.shadowRoot) {
                            const res = findLabel(el.shadowRoot);
                            if (res) return res;
                        }
                    }
                    return null;
                };

                const labelSpan = findLabel(document);
                if (!labelSpan) return "";
                const container = labelSpan.closest('.slds-form-element');
                if (!container) return "";
                const selectors = ['lightning-formatted-text', '.test-id__field-value', 'span[slot="outputField"]', '.slds-form-element__static'];
                for (let sel of selectors) {
                    const elem = container.querySelector(sel);
                    if (elem && elem.innerText.trim()) return elem.innerText.trim();
                }
                return "";
            };

            const first = getDeepValue(["First Name"]), last = getDeepValue(["Last Name"]);
            const ssn = getDeepValue(["SSN", "Social Security Number"]), dob = getDeepValue(["DOB", "Date of Birth"]);
            const name = (first + " " + last).trim();
            return { name: name, ssn, dob, combined: (name + "|" + (ssn || "N/A") + "|" + (dob || "N/A")) };
        }
    };

    // ==========================================
    // 3. WINDOW MANAGER
    // ==========================================
    const Windows = {
        bringToFront(el) {
            document.querySelectorAll('.sn-window').forEach(w => w.style.zIndex = "10000");
            el.style.zIndex = "10001";
            document.querySelectorAll('.sn-tb-btn').forEach(b => b.classList.remove('focused'));
            const btn = document.getElementById('tab-' + el.id);
            if(btn) btn.classList.add('focused');
        },

        toggle(id) {
            const el = document.getElementById(id);
            if (!el) return false;

            if (el.style.display === 'none') {
                el.style.display = 'flex';
                this.bringToFront(el);
            } else {
                el.style.display = 'none';
            }
            this.updateTabState(id);
            return true;
        },

        updateTabState(id) {
            const btn = document.getElementById('tab-' + id);
            const el = document.getElementById(id);
            if (!btn) return;

            document.querySelectorAll('.sn-tb-btn').forEach(b => b.classList.remove('focused'));

            if (el && el.style.display !== 'none') {
                btn.classList.add('active');
                if (el.style.zIndex === "10001") btn.classList.add('focused');
            } else if (el && el.style.display === 'none') {
                 btn.classList.add('active');
                 btn.classList.remove('focused');
            } else {
                btn.classList.remove('active');
                btn.classList.remove('focused');
            }
        },

        setup(w, minBtn, header, typeId) {
            this.makeDraggable(w, header);
            this.makeResizable(w);

            header.ondblclick = () => {
                w.style.display = 'none';
                this.updateTabState(w.id);
            };

            this.updateTabState(w.id);
            w.onmousedown = () => this.bringToFront(w);

            if (minBtn) {
                let startTime = 0;
                minBtn.onmousedown = () => { startTime = Date.now(); };

                minBtn.onmouseup = () => {
                    const duration = Date.now() - startTime;
                    if (duration < 500) {
                        w.style.display = 'none';
                        this.updateTabState(w.id);
                    } else {
                        const def = { width: w.style.width, height: w.style.height, top: w.style.top, left: w.style.left };
                        GM_setValue('def_pos_' + typeId, def);
                        w.classList.add('sn-saved-glow');
                        setTimeout(() => w.classList.remove('sn-saved-glow'), 300);
                    }
                };
            }
        },

        makeDraggable(el, header) {
            let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
            header.onmousedown = (e) => {
                this.bringToFront(el);
                pos3 = e.clientX; pos4 = e.clientY;
                const onMove = (e) => {
                    pos1 = pos3 - e.clientX; pos2 = pos4 - e.clientY;
                    pos3 = e.clientX; pos4 = e.clientY;
                    el.style.top = (el.offsetTop - pos2) + "px";
                    el.style.left = (el.offsetLeft - pos1) + "px";
                };
                const onUp = () => {
                    document.removeEventListener('mousemove', onMove);
                    document.removeEventListener('mouseup', onUp);
                    el.dispatchEvent(new Event('mouseup'));
                };
                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
            };
        },

        makeResizable(el) {
            el.querySelectorAll('.sn-resizer').forEach(r => {
                r.onmousedown = (e) => {
                    e.preventDefault(); e.stopPropagation();
                    Windows.bringToFront(el);
                    const startX = e.clientX, startY = e.clientY;
                    // Fix: Use bounding client rect to handle hidden elements better if needed
                    const rect = el.getBoundingClientRect();
                    const startW = rect.width;
                    const startH = rect.height;
                    const startL = el.offsetLeft, startT = el.offsetTop;
                    const cls = r.className;
                    const onMove = (e) => {
                        const dx = e.clientX - startX, dy = e.clientY - startY;
                        if (cls.includes('rs-e') || cls.includes('ne') || cls.includes('se')) el.style.width = (startW + dx) + 'px';
                        if (cls.includes('rs-s') || cls.includes('se') || cls.includes('sw')) el.style.height = (startH + dy) + 'px';
                        if (cls.includes('rs-w') || cls.includes('nw') || cls.includes('sw')) { el.style.width = (startW - dx) + 'px'; el.style.left = (startL + dx) + 'px'; }
                        if (cls.includes('rs-n') || cls.includes('ne') || cls.includes('nw')) { el.style.height = (startH - dy) + 'px'; el.style.top = (startT + dy) + 'px'; }
                    };
                    const onUp = () => {
                        document.removeEventListener('mousemove', onMove);
                        document.removeEventListener('mouseup', onUp);
                        el.dispatchEvent(new Event('input', {bubbles: true}));
                    };
                    document.addEventListener('mousemove', onMove);
                    document.addEventListener('mouseup', onUp);
                };
            });
        }
    };

    // ==========================================
    // 4. CLIENT NOTE MODULE
    // ==========================================
    const ClientNote = {
        presets: [
            '#ffcdd2', '#ffe0b2', '#fff9c4', '#c8e6c9', '#b2dfdb',
            '#bbdefb', '#d1c4e9', '#f8bbd0', '#d7ccc8', '#cfd8dc'
        ],
        colors: {
            "EST": ["#ffe0b2", "#ffcc80"], "CST": ["#fff9c4", "#fff59d"], "MST": ["#c8e6c9", "#a5d6a7"],
            "PST": ["#b2dfdb", "#80cbc4"], "AKST": ["#bbdefb", "#90caf9"], "HST": ["#e1bee7", "#ce93d8"], "Default": ["#fff9c4", "#fff59d"]
        },

        create(clientId) {
            const id = 'sn-client-note';
            if (document.getElementById(id)) { Windows.toggle(id); return; }

            const savedData = GM_getValue('cn_' + clientId, {});
            const savedColorKey = GM_getValue('cn_color_' + clientId, 'CST');
            const savedFontSize = GM_getValue('cn_font_' + clientId, '12px');
            const [bodyColor, headerColor] = this.colors[savedColorKey] || this.colors.Default;
            const defPos = GM_getValue('def_pos_CN', { width: '500px', height: '400px', top: '100px', left: '100px' });

            const w = document.createElement('div');
            w.id = id; w.className = 'sn-window';
            w.style.width = savedData.width || defPos.width; w.style.height = savedData.height || defPos.height;
            w.style.top = savedData.top || defPos.top; w.style.left = savedData.left || defPos.left;
            w.style.backgroundColor = savedData.customColor || bodyColor;
            w.style.fontSize = savedFontSize;

            const paletteHTML = this.presets.map(c => `<div class="sn-swatch" style="background:${c}" data-col="${c}"></div>`).join('');

            w.innerHTML = `
                    <div id="sn-wrapper" style="position:relative; width:100%; height:100%; display:flex; flex-direction:row;">

                        <div id="sn-spine-strip" style="width:28px; background:#00695c; display:flex; flex-direction:column; align-items:center; padding-top:10px; border-right:1px solid rgba(0,0,0,0.2); z-index:20; flex-shrink:0;">
                            <div class="sn-spine-btn" data-panel="info" title="Client Info" style="writing-mode:vertical-rl; text-orientation:mixed; transform:rotate(180deg); padding:15px 5px; color:#b2dfdb; cursor:pointer; font-weight:bold; font-size:12px; margin-bottom:5px; transition:background 0.2s;">CL Info</div>
                            <div class="sn-spine-btn" data-panel="fax" title="PDF Forms" style="writing-mode:vertical-rl; text-orientation:mixed; transform:rotate(180deg); padding:15px 5px; color:#b2dfdb; cursor:pointer; font-weight:bold; font-size:12px; margin-bottom:5px; transition:background 0.2s;">Fax Forms</div>
                        </div>

                        <div id="sn-side-panel" style="position:absolute; right:100%; top:0; bottom:0; width:0px; display:none; flex-direction:column; background:rgba(255,255,255,0.95); border:1px solid #999; border-right:none; box-shadow:-2px 0 5px rgba(0,0,0,0.1); font-size:12px;">
                             <div id="sn-panel-header" style="padding:5px; font-weight:bold; background:#d0d0d0; border-bottom:1px solid #999; display:flex; align-items:center; color:#333;">
                                <span id="sn-panel-title" style="margin-right:auto;">Info</span>
                                <button id="sn-side-font-dec" style="cursor:pointer; border:1px solid #999; background:#eee; width:18px; border-radius:3px; margin-right:2px;">-</button>
                                <button id="sn-side-font-inc" style="cursor:pointer; border:1px solid #999; background:#eee; width:18px; border-radius:3px; margin-right:5px;">+</button>
                                <button id="sn-panel-close" style="border:none; background:none; cursor:pointer; font-weight:bold;">×</button>
                             </div>
                             <div id="sn-panel-body" style="padding:0px; overflow-y:auto; flex-grow:1;"></div>
                             <div class="sn-panel-resizer-left" style="width:5px; cursor:col-resize; height:100%; position:absolute; left:0; top:0; z-index:10;"></div>
                        </div>

                        <div style="flex-grow:1; display:flex; flex-direction:column; min-width:200px; height:100%; overflow:hidden;">
                            
                            <div class="sn-header" id="sn-cn-header" style="background:${headerColor}; border-bottom:1px solid rgba(0,0,0,0.1); padding:4px; display:flex; align-items:center;">
                                
                                <button id="sn-refresh-btn" title="Refresh Scraped Data" style="border:none; background:transparent; cursor:pointer; font-size:14px; margin-right:4px; transition:transform 0.2s;">🔄</button>
                                
                                <span id="sn-cl-name" style="font-weight:bold; margin-left:4px;">${savedData.name || 'Client Note'}</span>
                                <div style="display:flex; align-items:center; margin-left:auto;">
                                    <div class="sn-cp-dropdown">
                                        <button class="sn-cp-btn">🎨</button>
                                        <div class="sn-cp-content">${paletteHTML}</div>
                                    </div>
                                    <button id="sn-pop-btn" title="Copy to Clipboard" style="cursor:pointer; background:none; border:none;">📋</button>
                                    <select id="sn-tz-select" style="background:rgba(255,255,255,0.5); border:none; width:50px;">
                                        <option value="EST">EST</option><option value="CST">CST</option><option value="MST">MST</option>
                                        <option value="PST">PST</option><option value="AKST">AKST</option><option value="HST">HST</option>
                                    </select>
                                    <button id="sn-min-btn" style="cursor:pointer; background:none; border:none; font-weight:bold; padding:0 5px;">_</button>
                                </div>
                            </div>

                            <div style="padding: 5px; border-bottom:1px solid #ccc; background:rgba(255,255,255,0.3); display:flex; gap:5px; align-items:center;">
                                <div style="display:flex; gap:2px;">
                                    <select id="sn-level" style="width:70px; background:rgba(255,255,255,0.7); border:1px solid #999; font-size:inherit;">
                                        <option value="Level">Level</option><option value="IA">IA</option><option value="Recon">Recon</option><option value="Hearing">Hearing</option>
                                    </select>
                                    <select id="sn-type" style="width:70px; background:rgba(255,255,255,0.7); border:1px solid #999; font-size:inherit;">
                                        <option value="Type">Type</option><option value="Concurrent">Concurrent</option><option value="T2">T2</option><option value="T16">T16</option>
                                    </select>
                                    
                                    <input id="sn-substatus" type="text" placeholder="Sub-status" readonly style="width:140px; background:rgba(255,255,255,0.5); border:1px solid #999; font-size:inherit; padding:1px 4px; color:#333; cursor:default; overflow:hidden; text-overflow:ellipsis;" title="Sub-status" value="${savedData.substatus || ''}">
                                </div>
                            </div>

                            <div style="display:flex; flex-direction:column; flex-grow:1; height:100%; overflow:hidden;">
                                <textarea id="sn-notes" style="flex-grow:1; resize:none; border:none; padding:8px; background:transparent; font-family:sans-serif; font-size:inherit; height:${savedData.notesHeight || '50%'};" placeholder="Case notes...">${savedData.notes || ''}</textarea>
                                <div id="sn-partition" style="height:5px; background:rgba(0,0,0,0.1); cursor:ns-resize; border-top:1px solid rgba(0,0,0,0.1); border-bottom:1px solid rgba(0,0,0,0.1);"></div>
                                <div id="sn-todo-container" style="flex-grow:1; background:rgba(255,255,255,0.4); display:flex; flex-direction:column; overflow:hidden;">
                                    <div style="padding:2px; background:rgba(0,0,0,0.05); font-size:0.8em; font-weight:bold; padding-left:5px; color:#555;">TO-DO LIST</div>
                                    <div id="sn-todo-list" style="flex-grow:1; overflow-y:auto; padding:5px; outline:none; font-size:inherit;"></div>
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
            Windows.setup(w, w.querySelector('#sn-min-btn'), w.querySelector('#sn-cn-header'), 'CN');

            // --- MED PROVIDER POP-OUT ---
            // --- MED PROVIDER POP-OUT ---
            const createMedWindow = () => {
                const mid = 'sn-med-popout';
                if(document.getElementById(mid)) {
                    Windows.bringToFront(document.getElementById(mid));
                    return;
                }

                // Calculate 50% screen size and bottom-center relative to the Client Note
                const rect = w.getBoundingClientRect();
                const mwW = window.innerWidth * 0.5;
                const mwH = window.innerHeight * 0.5;
                const mwLeft = rect.left + (rect.width / 2) - (mwW / 2);
                const mwTop = rect.bottom - (mwH * 0.8); // Positions it near the bottom of the Client Note

                const mw = document.createElement('div');
                mw.id = mid; mw.className = 'sn-window';
                mw.style.cssText = `width:50vw; height:50vh; top:${mwTop}px; left:${mwLeft}px; background:#f9f9f9; display:flex; flex-direction:column; box-shadow:0 4px 15px rgba(0,0,0,0.4); font-size:12px; z-index:10005;`;

                const style = document.createElement('style');
                style.innerHTML = `
                    td[contenteditable]:empty::before { content: attr(placeholder); color: #aaa; font-style: italic; }
                    #sn-med-table { table-layout: fixed; width: 100%; border-collapse: collapse; }
                    #sn-med-table td, #sn-med-table th { word-wrap: break-word; overflow-wrap: break-word; }
                `;
                mw.appendChild(style);

                const scrapedSSN = Scraper.getSidebarData().ssn || '--';
                const clientName = w.querySelector('#sn-cl-name').innerText || 'Client';

                mw.innerHTML += `
                    <div class="sn-header" style="background:#ddd; padding:5px; display:flex; align-items:center; cursor:move; border-bottom:1px solid #ccc;">
                        <span style="font-weight:bold; margin-right:auto;">Medical Providers Table</span>
                        <button id="sn-med-close-btn" style="border:none; background:none; cursor:pointer; font-size:14px; font-weight:bold;">×</button>
                    </div>

                    <div style="background:#fff; padding:8px; border-bottom:1px solid #eee; text-align:center; flex-shrink:0;">
                        <span style="font-size:14px; font-weight:bold; color:#333;">Client: ${clientName}</span>
                        <span style="margin:0 10px; color:#ccc;">|</span>
                        <span style="font-size:14px; font-weight:bold; color:#333;">SSN: ${scrapedSSN}</span>
                    </div>

                    <div style="display:flex; flex-grow:1; overflow:hidden;">
                        <div style="width:40%; border-right:1px solid #ccc; padding:10px; overflow-y:auto; background:#fff; flex-shrink:0;">
                            <div style="display:flex; justify-content:space-between; align-items:center; font-weight:bold; margin-bottom:5px; border-bottom:1px solid #eee;">
                                <span>Providers (Scraped)</span>
                                <div style="display:flex; align-items:center;">
                                    <button id="sn-med-font-dec" style="cursor:pointer; border:1px solid #999; background:#eee; width:20px; border-radius:3px; margin-right:2px; font-weight:normal;">-</button>
                                    <button id="sn-med-font-inc" style="cursor:pointer; border:1px solid #999; background:#eee; width:20px; border-radius:3px; font-weight:normal;">+</button>
                                </div>
                            </div>
                            <div style="font-size:inherit; color:#555;">
                                ${Scraper.getSidebarData().medProviders || 'No providers found on page.'}
                            </div>
                        </div>
                        <div style="flex-grow:1; padding:10px; overflow-y:auto; display:flex; flex-direction:column; background:#fff;">
                            <div style="flex-grow:1;">
                                <table id="sn-med-table" style="font-size:inherit;">
                                    <colgroup>
                                        <col style="width:auto;"><col style="width:auto;"><col style="width:120px;"><col style="width:100px;"><col style="width:100px;">
                                    </colgroup>
                                    <thead>
                                        <tr style="background:#eee; text-align:left;">
                                            <th style="border:1px solid #ccc; padding:4px;">Dr/Facilities</th><th style="border:1px solid #ccc; padding:4px;">Address</th>
                                            <th style="border:1px solid #ccc; padding:4px;">Phone</th><th style="border:1px solid #ccc; padding:4px;">Last Visit</th><th style="border:1px solid #ccc; padding:4px;">First Visit</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${[1,2,3].map(() => `
                                        <tr>
                                            <td contenteditable="true" placeholder="Facilities / Doctor" style="border:1px solid #ccc; padding:4px;"></td>
                                            <td contenteditable="true" style="border:1px solid #ccc; padding:4px;"></td><td contenteditable="true" style="border:1px solid #ccc; padding:4px;"></td>
                                            <td contenteditable="true" style="border:1px solid #ccc; padding:4px;"></td><td contenteditable="true" style="border:1px solid #ccc; padding:4px;"></td>
                                        </tr>`).join('')}
                                    </tbody>
                                </table>
                            </div>
                            <div style="padding-top:10px; text-align:center;">
                                <button style="padding:5px 15px; cursor:pointer; font-weight:bold;">📄 Generate PDF</button>
                            </div>
                        </div>
                    </div>
                    <div class="sn-resizer rs-se"></div>
                `;
                document.body.appendChild(mw);
                Windows.setup(mw, null, mw.querySelector('.sn-header'), 'MED');
                Windows.bringToFront(mw);

                mw.querySelector('#sn-med-close-btn').onclick = () => mw.remove();

                const updateMedFont = (d) => {
                    let cur = parseInt(mw.style.fontSize) || 12;
                    mw.style.fontSize = Math.max(9, Math.min(18, cur + d)) + 'px';
                };
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
            };



            // --- SIDEBAR (Info & Fax) ---
            const sidePanel = w.querySelector('#sn-side-panel');
            const sideBody = w.querySelector('#sn-panel-body');
            const sideTitle = w.querySelector('#sn-panel-title');

            const updateSideFont = (d) => { let cur = parseInt(sidePanel.style.fontSize) || 12; sidePanel.style.fontSize = Math.max(9, Math.min(16, cur + d)) + 'px'; };
            w.querySelector('#sn-side-font-dec').onclick = (e) => { e.stopPropagation(); updateSideFont(-1); };
            w.querySelector('#sn-side-font-inc').onclick = (e) => { e.stopPropagation(); updateSideFont(1); };

            const setupAutoResize = (container) => {
                container.querySelectorAll('.sn-side-textarea').forEach(inp => {
                    const adjustHeight = () => {
                        inp.style.height = '1px'; // Reset to calculate exact shrink/grow
                        inp.style.height = (inp.scrollHeight) + 'px';
                    };

                    setTimeout(adjustHeight, 10);

                    inp.ondblclick = () => {
                        inp.removeAttribute('readonly');
                        inp.style.background = '#fff9c4';
                        inp.style.border = '1px solid #b0bec5';
                        inp.style.borderRadius = '3px';
                        inp.focus();
                    };

                    inp.oninput = adjustHeight;

                    inp.onblur = () => {
                        inp.setAttribute('readonly', true);
                        inp.style.background = 'transparent';
                        inp.style.border = '1px solid transparent';
                        window.getSelection().removeAllRanges();
                    };
                });
            };

            const renderInfoPanel = (container) => {
                const sidebarData = Scraper.getSidebarData();
                
                const fields = [
                    { id: 'ssn', label: 'SSN', val: sidebarData.ssn },
                    { id: 'dob', label: 'DOB', val: sidebarData.dob },
                    { id: 'phone', label: 'Phone', val: '' },
                    { id: 'addr', label: 'Address', val: '' },
                    { id: 'email', label: 'Email', val: '' },
                    { id: 'pob', label: 'POB', val: '' },
                    { id: 'parents', label: 'Parents', val: '' },
                    { id: 'wit', label: 'Witness', val: '' }
                ];

                let html = `<div id="sn-info-container" style="padding:10px; background:#f9f9f9; min-height:100%; display:flex; flex-direction:column; box-sizing:border-box;">
                    <div style="display:flex; gap:10px; margin-bottom:12px;">
                        <button id="sn-open-ssd-btn" style="flex:1; padding:5px; cursor:pointer; font-weight:bold; background:#e0f2f1; border:1px solid #009688; border-radius:4px; color:#004d40; white-space:nowrap;">Open SSD App</button>
                        <button id="sn-go-med-btn" style="flex:1; padding:5px; cursor:pointer; font-weight:bold; background:#b2dfdb; border:1px solid #009688; border-radius:4px; color:#004d40; white-space:nowrap;">Med Prov ➔</button>
                    </div>
                    <div style="flex-grow:1;">
                `;

                fields.forEach(f => {
                    html += `
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px; border-bottom:1px dashed #ccc; padding-bottom:2px;">
                        <div style="font-weight:bold; color:#555; white-space:nowrap; margin-right:8px; margin-top:2px;">${f.label}</div>
                        <textarea class="sn-side-textarea" readonly rows="1"
                            style="width:100%; text-align:right; border:1px solid transparent; background:transparent; font-family:inherit; padding:2px 4px; color:#333; outline:none; resize:none; overflow:hidden; transition:background 0.2s, border 0.2s;">${f.val || ''}</textarea>
                    </div>`;
                });
                
                html += `
                    </div>
                </div>`;
                container.innerHTML = html;

                // Wire up the SSD App Button
                const ssdBtn = container.querySelector('#sn-open-ssd-btn');
                ssdBtn.onmouseover = () => ssdBtn.style.background = '#b2dfdb';
                ssdBtn.onmouseout = () => ssdBtn.style.background = '#e0f2f1';
                ssdBtn.onclick = () => {
                    // LIVE SCRAPE: Grab the link from the page right at the moment of clicking!
                    const liveData = Scraper.getHeaderData();
                    if (liveData.ssdAppLink) {
                        window.open(liveData.ssdAppLink, '_blank');
                    } else {
                        alert("No SSD App link found! Please make sure you are on a tab where the link is currently visible on your screen.");
                    }
                };

                // Wire up the Med Provider Button
                const medBtn = container.querySelector('#sn-go-med-btn');
                medBtn.onmouseover = () => medBtn.style.background = '#80cbc4';
                medBtn.onmouseout = () => medBtn.style.background = '#b2dfdb';
                medBtn.onclick = () => createMedWindow();

                setupAutoResize(container);
            };

            const togglePanel = (type) => {
                const titleMap = { 'info': 'Client Info', 'fax': 'PDF Forms' };
                const isSame = sideTitle.innerText === titleMap[type];

                w.querySelectorAll('.sn-spine-btn').forEach(b => {
                    b.style.color = '#b2dfdb';
                    b.style.background = 'transparent';
                });

                if (sidePanel.style.display === 'flex' && isSame) {
                    sidePanel.style.display = 'none'; sidePanel.style.width = '0px';
                } else {
                    sidePanel.style.display = 'flex'; sidePanel.style.width = '250px';
                    sideTitle.innerText = titleMap[type];

                    const activeBtn = w.querySelector(`.sn-spine-btn[data-panel="${type}"]`);
                    if (activeBtn) {
                        activeBtn.style.color = 'white';
                        activeBtn.style.background = 'rgba(255,255,255,0.1)';
                    }

                    sideBody.innerHTML = '';
                    if (type === 'fax') renderFaxForm(sideBody);
                    else renderInfoPanel(sideBody);
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

            const renderFaxForm = (container) => {
                const data = Scraper.getSidebarData();
                const styles = `border:none; border-bottom:1px dashed #999; background:transparent; font-family:inherit; width:100%;`;
                // Removed inline inline event listeners
                const createField = (lbl, val, hasCheck = false) => `
                    <div style="display:flex; align-items:center; margin-bottom:4px; font-size:0.9em;">
                        ${hasCheck ? '<input type="checkbox" style="margin-right:4px;">' : ''}
                        <span style="color:#555; margin-right:4px; font-weight:bold;">${lbl}:</span>
                        <input type="text" class="sn-fax-input" value="${val || ''}" readonly style="${styles}">
                    </div>`;

                const sections = [
                    { title: "Letter 25", content: `${createField('Name', data.name)}${createField('SSN', data.ssn)}${createField('Phone', '', true)}${createField('Address', '', true)}<button style="margin-top:5px; width:100%;">📄 Generate PDF</button>` },
                    { title: "Status to DDS", content: `${createField('DDS', 'Unknown')}${createField('Fax #', '')}${createField('Name', data.name)}${createField('SSN', data.ssn)}${createField('DOB', data.dob)}<button style="margin-top:5px; width:100%;">📄 Generate PDF</button>` },
                    { title: "Status to FO", content: `${createField('Name', data.name)}${createField('SSN', data.ssn)}<button style="margin-top:5px; width:100%;">📄 Generate PDF</button>` },
                    { title: "Med Providers", content: `` }
                ];

                sections.forEach(sec => {
                    const wrap = document.createElement('div');
                    if (sec.title === "Med Providers") {
                         wrap.innerHTML = `<button class="sn-fax-btn">${sec.title}</button>`;
                         wrap.querySelector('button').onclick = createMedWindow;
                    } else {
                        wrap.innerHTML = `
                            <button class="sn-fax-btn">${sec.title}</button>
                            <div class="sn-fax-content" style="display:none; padding:8px; border:1px solid #ccc; background:#f9f9f9; margin-bottom:5px;">${sec.content}</div>
                        `;
                        wrap.querySelector('.sn-fax-btn').onclick = function() {
                            const c = this.nextElementSibling;
                            c.style.display = c.style.display === 'none' ? 'block' : 'none';
                        };
                    }
                    container.appendChild(wrap);
                });

                // Attach events dynamically for security
                container.querySelectorAll('.sn-fax-input').forEach(inp => {
                    inp.ondblclick = () => { inp.removeAttribute('readonly'); inp.focus(); };
                    inp.onblur = () => inp.setAttribute('readonly', true);
                    inp.onkeydown = (e) => { if (e.key === 'Enter') inp.blur(); };
                });
            };

            // --- UTILS (Main Font, Save, Resizers) ---
            const updateFont = (delta) => {
                let current = parseInt(w.style.fontSize) || 12;
                let newSize = Math.max(10, Math.min(16, current + delta));
                w.style.fontSize = newSize + 'px';
                GM_setValue('cn_font_' + clientId, newSize + 'px');
            };
            w.querySelector('#sn-font-inc').onclick = () => updateFont(1);
            w.querySelector('#sn-font-dec').onclick = () => updateFont(-1);

            w.querySelectorAll('.sn-swatch').forEach(sw => { sw.onclick = () => { w.style.backgroundColor = sw.getAttribute('data-col'); saveState(); }; });

            const todoList = w.querySelector('#sn-todo-list');
            const rowTpl = `<div style="display:flex; align-items:center; margin-bottom:4px; cursor:text;"><input type="checkbox" style="margin-right:6px; cursor:pointer;"><span contenteditable="true" placeholder="New Task..." style="flex-grow:1; outline:none; min-height:1em;"></span></div>`;

            // Safe HTML Injection logic (Fallback for legacy saved HTML)
            if (savedData.todoHTML && savedData.todoHTML.trim()) {
                const parser = new DOMParser();
                const doc = parser.parseFromString(savedData.todoHTML, 'text/html');
                Array.from(doc.body.childNodes).forEach(node => todoList.appendChild(node));
            } else {
                todoList.insertAdjacentHTML('beforeend', rowTpl);
            }

            todoList.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault(); todoList.insertAdjacentHTML('beforeend', rowTpl);
                    const spans = todoList.querySelectorAll('span'); spans[spans.length - 1].focus(); saveState();
                }
            });
            todoList.addEventListener('click', (e) => { if(e.target.tagName === 'DIV' && e.target.closest('#sn-todo-list')) { const span = e.target.querySelector('span'); if(span) span.focus(); } });

            const saveState = () => {
                if(!document.body.contains(w)) return;
                try {
                    const rows = todoList.querySelectorAll('div');
                    rows.forEach(row => {
                        const cb = row.querySelector('input[type="checkbox"]');
                        if (cb) { if (cb.checked) cb.setAttribute('checked', 'checked'); else cb.removeAttribute('checked'); }
                    });
                    const data = {
                        name: w.querySelector('#sn-cl-name').innerText, notes: w.querySelector('#sn-notes').value,
                        revisitActive: w.querySelector('#sn-revisit-check').checked, revisit: w.querySelector('#sn-revisit-date').value,
                        level: w.querySelector('#sn-level').value, type: w.querySelector('#sn-type').value,
                        todoHTML: todoList.innerHTML, notesHeight: w.querySelector('#sn-notes').style.height,
                        width: w.style.width, height: w.style.height, top: w.style.top, left: w.style.left,
                        customColor: w.style.backgroundColor, timestamp: Date.now()
                    };
                    GM_setValue('cn_' + clientId, data);
                } catch (err) {}
            };
            w.addEventListener('input', saveState); w.addEventListener('change', saveState); w.addEventListener('mouseup', saveState);

            const tzSelect = w.querySelector('#sn-tz-select');
            tzSelect.value = savedColorKey;
            tzSelect.onchange = () => {
                const [bg, head] = this.colors[tzSelect.value] || this.colors.Default;
                w.style.backgroundColor = bg; w.querySelector('#sn-cn-header').style.background = head;
                GM_setValue('cn_color_' + clientId, tzSelect.value);
            };
            if(savedData.level) w.querySelector('#sn-level').value = savedData.level;
            if(savedData.type) w.querySelector('#sn-type').value = savedData.type;

            const fillForm = () => {
                 const headerData = Scraper.getHeaderData();
                 const sidebarData = Scraper.getSidebarData();

                 // Populate Name
                 if (sidebarData.name && w.querySelector('#sn-cl-name').innerText === 'Client Note') {
                     w.querySelector('#sn-cl-name').innerText = sidebarData.name;
                 }

                 // Populate Level
                 const lvlSelect = w.querySelector('#sn-level');
                 if (lvlSelect.value === 'Level' && headerData['Status']) {
                    const statusMap = { 'Initial Application': 'IA', 'Reconsideration': 'Recon', 'Hearing': 'Hearing' };
                    const val = statusMap[headerData['Status']] || headerData['Status'];
                    const opts = lvlSelect.options;
                    for(let i=0; i<opts.length; i++) {
                        if(opts[i].text === val || opts[i].value === val) lvlSelect.selectedIndex = i;
                    }
                 }

                 // Populate Type
                 const typSelect = w.querySelector('#sn-type');
                 if (typSelect.value === 'Type' && headerData['SS Classification']) {
                    const map = { 'SSI': 'T16', 'SSDIB': 'T2', 'SSI/SSDIB': 'Concurrent' };
                    const val = map[headerData['SS Classification']] || headerData['SS Classification'];
                    const opts = typSelect.options;
                    for(let i=0; i<opts.length; i++) {
                        if(opts[i].text === val || opts[i].value === val) typSelect.selectedIndex = i;
                    }
                 }

                 saveState();
            };

            // Force fillForm to run if the dropdowns are currently stuck on their default values
            // This prevents old, empty saves from locking the script out.
            if (!savedData.timestamp || w.querySelector('#sn-level').value === 'Level' || w.querySelector('#sn-type').value === 'Type') {
                fillForm();
            }

            w.querySelector('#sn-pop-btn').onclick = () => { const d = Scraper.getSidebarData(); if(d.combined) GM_setClipboard(d.combined); };
            const partition = w.querySelector('#sn-partition'), noteArea = w.querySelector('#sn-notes');
            partition.onmousedown = (e) => {
                e.preventDefault(); const startY = e.clientY, startH = noteArea.offsetHeight;
                const onMove = (mv) => { noteArea.style.height = (startH + (mv.clientY - startY)) + 'px'; noteArea.style.flexGrow = 0; };
                const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); saveState(); };
                document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
            };
            w.querySelector('#sn-del-btn').onclick = () => { if(confirm("Delete notes?")) { try { GM_deleteValue('cn_' + clientId); w.remove(); } catch(e) {} } };

            if (!savedData.timestamp) fillForm();
        }
    };

    // ==========================================
    // 5. CONTACT FORMS MODULE
    // ==========================================
    const ContactForms = {
        create(type) {
            const id = type === 'FO' ? 'sn-fo-form' : 'sn-dds-form';
            if (document.getElementById(id)) { Windows.toggle(id); return; }

            const sidebarData = Scraper.getSidebarData();
            const clientName = sidebarData.name || "Unknown";
            const defPos = GM_getValue('def_pos_' + type, { width: '500px', height: 'auto', top: '150px', left: '150px' });

            const w = document.createElement('div');
            w.id = id; w.className = 'sn-window';
            w.style.width = defPos.width; w.style.height = defPos.height;
            w.style.top = defPos.top; w.style.left = defPos.left;
            w.style.backgroundColor = '#e0f2f1'; w.style.border = '1px solid #009688';

            let bodyHTML = '';
            if (type === 'FO') {
                bodyHTML = `
                <div style="padding:10px; display:flex; flex-direction:column; gap:8px;">
                    <div style="display:flex; gap:10px; align-items:center;">
                        <input type="text" id="fo-rep" placeholder="Rep Name" style="width:120px; border:1px solid #ccc; padding:3px;">
                        <label><input type="checkbox" id="fo-proc"> Processed</label>
                        <label><input type="checkbox" id="fo-1696"> 1696</label>
                        <label><input type="checkbox" id="fo-other"> Other Rep</label>
                        <label><input type="checkbox" id="fo-wet"> Wet Sig</label>
                    </div>
                    <div style="display:flex; gap:5px; align-items:center;">
                        <select id="fo-claim-lvl" style="background:white; border:1px solid #ccc;"><option>Claim Level</option><option>IA</option><option>Recon</option></select>
                        <select id="fo-claim-typ" style="background:white; border:1px solid #ccc;"><option>Claim Type</option><option>T2</option><option>T16</option><option>Concurrent</option></select>
                        <label><input type="checkbox" id="fo-ptr"> PTR</label>
                    </div>
                    <textarea id="fo-details" placeholder="Details..." style="width:100%; border:1px solid #ccc; padding:3px; resize:vertical; height:40px;"></textarea>
                    <div style="display:flex; gap:10px; align-items:center;">
                        <label><input type="checkbox" id="fo-attest"> Attested</label>
                        <label><input type="checkbox" id="fo-dds"> Transferred to DDS</label>
                        <input type="text" id="fo-trans-txt" placeholder="Date Transferred" style="flex-grow:1; border:1px solid #ccc; padding:3px;">
                    </div>
                    <div style="display:flex; gap:5px;">
                        <input type="text" id="fo-ifd" placeholder="IFD" style="flex-grow:1; border:1px solid #ccc; padding:3px; text-align:center;">
                        <input type="text" id="fo-aod" placeholder="AOD" style="flex-grow:1; border:1px solid #ccc; padding:3px; text-align:center;">
                        <input type="text" id="fo-dli" placeholder="DLI" style="flex-grow:1; border:1px solid #ccc; padding:3px; text-align:center;">
                    </div>
                    <div style="margin-top:5px; border:2px solid #009688; background:rgba(255,255,255,0.6);">
                        <div style="background:#009688; color:white; font-weight:bold; text-align:center; padding:2px; font-size:11px;">DECISION</div>
                        <div style="padding:5px; display:flex; flex-direction:column; gap:5px;">
                            <div style="display:flex; align-items:center; gap:5px;">
                                <strong style="width:30px;">T2:</strong>
                                <label><input type="checkbox" id="fo-t2-app"> Appr</label>
                                <label><input type="checkbox" id="fo-t2-den"> Den</label>
                                <input type="text" id="fo-t2-date" placeholder="Date" style="width:100px; border:1px solid #ccc;">
                                <input type="text" id="fo-t2-reason" placeholder="Reason" style="flex-grow:1; border:1px solid #ccc;">
                            </div>
                            <div style="display:flex; align-items:center; gap:5px;">
                                <strong style="width:30px;">T16:</strong>
                                <label><input type="checkbox" id="fo-t16-app"> Appr</label>
                                <label><input type="checkbox" id="fo-t16-den"> Den</label>
                                <input type="text" id="fo-t16-date" placeholder="Date" style="width:100px; border:1px solid #ccc;">
                                <input type="text" id="fo-t16-reason" placeholder="Reason" style="flex-grow:1; border:1px solid #ccc;">
                            </div>
                        </div>
                    </div>
                </div>`;
            } else {
                bodyHTML = `
                <div style="padding:10px; display:flex; flex-direction:column; gap:8px;">
                    <div style="display:flex; gap:10px; align-items:center;">
                        <input type="text" id="dds-rep" placeholder="Rep Name" style="width:110px; border:1px solid #ccc; padding:3px;">
                        <label><input type="checkbox" id="dds-1696"> 1696</label>
                        <label><input type="checkbox" id="dds-other"> Other Rep</label>
                        <div style="flex-grow:1;"></div>
                        <input type="text" id="dds-trans" placeholder="Date Transferred" style="width:120px; border:1px solid #ccc; padding:3px; text-align:right;">
                    </div>
                    <textarea id="dds-details" placeholder="Details..." style="width:100%; border:1px solid #ccc; padding:3px; resize:vertical; height:40px;"></textarea>
                    <div style="display:flex; gap:5px; align-items:center;">
                        <label><input type="checkbox" id="dds-assign"> Assigned</label>
                        <input type="text" id="dds-assign-txt" style="flex-grow:1; border:1px solid #ccc; padding:3px;">
                        <label><input type="checkbox" id="dds-predev"> Pre-Dev Unit</label>
                    </div>
                    <div style="display:flex; gap:10px; align-items:center;">
                        <label><input type="checkbox" id="dds-wh"> WH</label>
                        <label><input type="checkbox" id="dds-fr"> FR</label>
                        <label><input type="checkbox" id="dds-rec"> Received</label>
                        <label><input type="checkbox" id="dds-prov"> Med Provider</label>
                        <label><input type="checkbox" id="dds-ce"> CE Scheduled</label>
                    </div>
                    <textarea id="dds-ce-box" style="display:none; height:50px; width:100%; border:1px solid red; background:white;" placeholder="CE Details..."></textarea>
                    <div style="display:flex; gap:5px; align-items:center;">
                        <strong>Outstanding:</strong>
                        <input type="text" id="dds-out-txt" style="flex-grow:1; border:1px solid #ccc; padding:3px;">
                    </div>
                </div>`;
            }

            w.innerHTML = `
                <div class="sn-header" id="sn-${type.toLowerCase()}-header" style="background:#b2dfdb; border-bottom:1px solid #80cbc4;">
                    <div style="display:flex; align-items:center; gap:5px;">
                         <button id="sn-${type.toLowerCase()}-min" style="cursor:pointer; background:none; border:none; font-weight:bold;">_</button>
                         <span style="font-weight:bold; color:#004d40;">${type} Contact - ${clientName}</span>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span id="${type.toLowerCase()}-undo" style="display:none; cursor:pointer; font-size:11px; font-weight:bold; color:#444;">UNDO</span>
                        <span id="${type.toLowerCase()}-clear" style="cursor:pointer; font-size:11px; font-weight:bold; color:#004d40;">CLEAR</span>
                        <button id="sn-${type.toLowerCase()}-close" style="background:none; border:none; font-weight:bold; cursor:pointer; font-size:14px; margin-left:5px;">X</button>
                    </div>
                </div>
                ${bodyHTML}
                <div style="padding:10px; border-top:1px solid #80cbc4; display:flex; flex-direction:column; flex-grow:1;">
                    <textarea id="${type.toLowerCase()}-notes" style="flex-grow:1; min-height:60px; border:1px solid #ccc; background:rgba(255,255,255,0.8); resize:vertical;" placeholder="Additional Notes..."></textarea>
                    <div id="${type.toLowerCase()}-msg" style="height:15px; font-size:10px; color:red; text-align:right;"></div>
                </div>
                <div class="sn-resizer rs-n"></div><div class="sn-resizer rs-s"></div>
                <div class="sn-resizer rs-e"></div><div class="sn-resizer rs-w"></div>
                <div class="sn-resizer rs-ne"></div><div class="sn-resizer rs-nw"></div>
                <div class="sn-resizer rs-se"></div><div class="sn-resizer rs-sw"></div>
            `;
            document.body.appendChild(w);
            Windows.setup(w, w.querySelector(`#sn-${type.toLowerCase()}-min`), w.querySelector('.sn-header'), type);

            if (type === 'DDS') {
                const ceCheck = w.querySelector('#dds-ce'), ceBox = w.querySelector('#dds-ce-box');
                ceCheck.onchange = () => { ceBox.style.display = ceCheck.checked ? 'block' : 'none'; };
            }

            const clearBtn = w.querySelector(`#${type.toLowerCase()}-clear`);
            const undoBtn = w.querySelector(`#${type.toLowerCase()}-undo`);
            const msgSpan = w.querySelector(`#${type.toLowerCase()}-msg`);
            let holdTimer; let undoBuffer = null;

            clearBtn.onmousedown = () => {
                clearBtn.style.color = "red"; clearBtn.innerText = "HOLD...";
                holdTimer = setTimeout(() => {
                    const inputs = w.querySelectorAll('input, select, textarea');
                    undoBuffer = {};
                    inputs.forEach(el => undoBuffer[el.id] = (el.type === 'checkbox' ? el.checked : el.value));
                    inputs.forEach(el => { if (el.type === 'checkbox') el.checked = false; else el.value = ''; });
                    clearBtn.innerText = "CLEAR"; clearBtn.style.color = "#004d40";
                    undoBtn.style.display = "inline"; msgSpan.innerText = "Form Cleared";
                    setTimeout(() => msgSpan.innerText = "", 2000);
                }, 2000);
            };

            const resetClearBtn = () => { clearTimeout(holdTimer); if(clearBtn.innerText === "HOLD...") { clearBtn.innerText = "CLEAR"; clearBtn.style.color = "#004d40"; }};
            clearBtn.onmouseup = resetClearBtn; clearBtn.onmouseleave = resetClearBtn;

            undoBtn.onclick = () => {
                if (undoBuffer) {
                    const inputs = w.querySelectorAll('input, select, textarea');
                    inputs.forEach(el => { if (undoBuffer[el.id] !== undefined) { if (el.type === 'checkbox') el.checked = undoBuffer[el.id]; else el.value = undoBuffer[el.id]; } });
                    undoBtn.style.display = "none"; msgSpan.innerText = "Restored"; setTimeout(() => msgSpan.innerText = "", 2000);
                }
            };

            w.querySelector(`#sn-${type.toLowerCase()}-close`).onclick = () => { w.style.display = 'none'; Windows.updateTabState(w.id); };
        }
    };

    // ==========================================
    // 6. DASHBOARD MODULE
    // ==========================================
    const Dashboard = {
        activeTab: 'revisit',

        toggle() {
            if (Windows.toggle('sn-dashboard')) {
                const el = document.getElementById('sn-dashboard');
                if (el.style.display !== 'none') { this.renderList(el); el.querySelector('#dash-search').focus(); }
                return;
            }

            const w = document.createElement('div');
            w.id = 'sn-dashboard'; w.className = 'sn-window';
            w.style.width = '450px'; w.style.height = '600px';
            w.style.bottom = '90px'; w.style.right = '20px';
            w.style.backgroundColor = '#e0f2f1'; w.style.border = '1px solid #009688';

            w.innerHTML = `
                <div class="sn-header" style="background:#b2dfdb; border-bottom:1px solid #009688; color:#004d40;">
                    <span style="font-weight:bold;">Sticky Notes Dashboard</span>
                    <button id="dash-close" style="background:none; border:none; color:#004d40; cursor:pointer; font-weight:bold;">X</button>
                </div>
                <div style="padding:10px; border-bottom:1px solid #b2dfdb; background:#e0f2f1;">
                    <input type="text" id="dash-search" placeholder="Search Clients..." style="width:100%; padding:8px; box-sizing:border-box; background:white; border:1px solid #b2dfdb; color:#333;">
                </div>
                <div class="sn-dash-body">
                    <div class="sn-dash-sidebar">
                        <div id="tab-revisit" class="sn-dash-tab active">Revisit</div>
                        <div id="tab-recent" class="sn-dash-tab">Recent</div>
                    </div>
                    <div id="dash-content" class="sn-dash-list"></div>
                </div>
                <div style="padding:10px; border-top:1px solid #b2dfdb; display:flex; gap:10px; justify-content:space-between; font-size:11px; background:#e0f2f1;">
                    <button id="dash-export">Export Data</button>
                    <button id="dash-import">Import</button>
                    <button id="dash-reset">Reset Pos</button>
                </div>
            `;
            document.body.appendChild(w);
            Windows.makeDraggable(w, w.querySelector('.sn-header'));
            w.querySelector('#dash-close').onclick = () => w.style.display = 'none';

            const searchInput = w.querySelector('#dash-search');
            searchInput.focus();
            searchInput.oninput = () => {
                const query = searchInput.value.toLowerCase();
                if (query.length === 0) this.renderList(w); else this.renderSearchResults(w, query);
            };

            w.querySelector('#tab-revisit').onclick = () => { this.activeTab = 'revisit'; this.updateSidebar(w); this.renderList(w); };
            w.querySelector('#tab-recent').onclick = () => { this.activeTab = 'recent'; this.updateSidebar(w); this.renderList(w); };

            w.querySelector('#dash-export').onclick = () => { const data={}; GM_listValues().forEach(k => data[k] = GM_getValue(k)); GM_setClipboard(JSON.stringify(data)); alert("Data copied!"); };
            w.querySelector('#dash-import').onclick = () => { const i = prompt("Paste JSON:"); if(i) { try { const d = JSON.parse(i); Object.keys(d).forEach(k => GM_setValue(k, d[k])); alert("Done. Reload."); } catch(e) { alert("Invalid."); } } };
            w.querySelector('#dash-reset').onclick = () => { if(confirm("Reset defaults?")) { GM_setValue('def_pos_CN', null); GM_setValue('def_pos_FO', null); GM_setValue('def_pos_DDS', null); alert("Reset."); } };

            this.renderList(w);
        },

        updateSidebar(w) {
            w.querySelectorAll('.sn-dash-tab').forEach(t => t.classList.remove('active'));
            w.querySelector(`#tab-${this.activeTab}`).classList.add('active');
        },

        renderList(w) {
            const container = w.querySelector('#dash-content');
            container.innerHTML = '';

            const keys = GM_listValues().filter(k => k.startsWith('cn_') && !k.startsWith('cn_color'));
            let items = keys.map(k => {
                const d = GM_getValue(k);
                return { id: k.replace('cn_', ''), ...d };
            });

            if (this.activeTab === 'revisit') {
                 items = items.filter(i => i.revisitActive).sort((a,b) => {
                     if (a.revisit && b.revisit) return new Date(a.revisit) - new Date(b.revisit);
                     return (b.timestamp || 0) - (a.timestamp || 0);
                 });
                 if (items.length === 0) container.innerHTML = '<div style="text-align:center; color:#888; margin-top:20px;">No Revisit cases.</div>';
            } else {
                 items = items.sort((a,b) => (b.timestamp || 0) - (a.timestamp || 0));
                 if (items.length === 0) container.innerHTML = '<div style="text-align:center; color:#888; margin-top:20px;">No Recent history.</div>';
            }

            items.slice(0, 8).forEach(item => this.createRow(container, item));
        },

        renderSearchResults(w, query) {
            const container = w.querySelector('#dash-content');
            container.innerHTML = '';
            const keys = GM_listValues().filter(k => k.startsWith('cn_') && !k.startsWith('cn_color'));
            const items = keys.map(k => ({id:k.replace('cn_', ''), ...GM_getValue(k)}))
                              .filter(i => i.name && i.name.toLowerCase().includes(query));

            if (items.length === 0) container.innerHTML = '<div style="text-align:center; color:#888; margin-top:20px;">No matches found.</div>';
            items.forEach(item => this.createRow(container, item));
        },

        createRow(container, item) {
            const status = (item.level && item.type) ? `${item.level} - ${item.type}` : (item.level || item.type || "No Status");

            let todoPreview = "No tasks";
            if (item.todoHTML) {
                // Safer parsing
                const tempDiv = document.createElement('div');
                const parser = new DOMParser();
                const doc = parser.parseFromString(item.todoHTML, 'text/html');
                const tasks = Array.from(doc.body.querySelectorAll('div')).map(d => d.innerText.trim()).filter(t => t);
                if (tasks.length > 0) todoPreview = tasks.slice(0,2).map(t => `<div class="sn-todo-line">• ${t}</div>`).join('');
            }

            const div = document.createElement('div');
            div.className = 'sn-list-item';
            div.innerHTML = `
                <div class="sn-item-left">
                    <div class="sn-item-name">${item.name}</div>
                    <div class="sn-item-status">${status}</div>
                </div>
                <div class="sn-item-right">
                    ${todoPreview}
                </div>
            `;
            div.onclick = () => { window.open(`${window.location.origin}/lightning/r/kdlaw__Matter__c/${item.id}/view`, '_blank'); };
            container.appendChild(div);
        }
    };

    // ==========================================
    // 7. MAIN INITIALIZATION & OBSERVER
    // ==========================================
    const AppObserver = {
        lastUrl: location.href,
        activeClientId: null, // Tracks the currently loaded record

        // --- Universal Client ID Extractor & Converter ---
        getClientId() {
            let id = null;

            // 1. Check Standard Lightning URL
            const sfMatch = window.location.href.match(/kdlaw__Matter__c\/([a-zA-Z0-9]{15,18})/);
            if (sfMatch && sfMatch[1]) {
                id = sfMatch[1];
            }
            // 2. Check Form URL (recordid parameter)
            else if (window.location.href.includes('recordid=')) {
                const urlParams = new URLSearchParams(window.location.search);
                id = urlParams.get('recordid');
            }

            if (!id) return null;

            // 3. Normalize 15-char IDs to 18-char IDs so local storage matches perfectly
            if (id.length === 15) {
                let suffix = '';
                for (let i = 0; i < 3; i++) {
                    let flags = 0;
                    for (let j = 0; j < 5; j++) {
                        let c = id.charAt(i * 5 + j);
                        if (c >= 'A' && c <= 'Z') flags += 1 << j;
                    }
                    suffix += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ012345'.charAt(flags);
                }
                return id + suffix;
            }

            return id;
        },

        init() {
            if (document.getElementById('sn-taskbar')) return;
            this.buildTaskbar();

            // Watch for SF virtual navigation without reloading
            new MutationObserver(() => {
                const url = location.href;
                if (url !== this.lastUrl) {
                    this.lastUrl = url;
                    this.handleRecordLoad();
                }
            }).observe(document, { subtree: true, childList: true });

            // Initial load check
            this.handleRecordLoad();
        },

        buildTaskbar() {
            const taskbar = document.createElement('div');
            taskbar.id = 'sn-taskbar';
            taskbar.innerHTML = `
                <div class="sn-version-label">Kanto CM notes v1.6 (Opt)</div>
                <div class="sn-center-group">
                    <button id="tab-sn-client-note" class="sn-tb-btn">Client Note</button>
                    <button id="tab-sn-fo-form" class="sn-tb-btn">FO Contact</button>
                    <button id="tab-sn-dds-form" class="sn-tb-btn">DDS Contact</button>
                </div>
                <button id="sn-dash-btn" title="Dashboard">📝</button>
            `;
            document.body.appendChild(taskbar);

            const bind = (id, fn) => { const el = document.getElementById(id); if(el) el.onclick = fn; };

            bind('sn-dash-btn', () => Dashboard.toggle());

            bind('tab-sn-client-note', () => {
                 const clientId = this.getClientId();
                 if (clientId) {
                     if (!document.getElementById('sn-client-note')) {
                         ClientNote.create(clientId);
                     } else {
                         Windows.toggle('sn-client-note');
                     }
                 } else {
                     alert("Go to a Client Page.");
                 }
            });

            bind('tab-sn-fo-form', () => ContactForms.create('FO'));
            bind('tab-sn-dds-form', () => ContactForms.create('DDS'));

            // Keyboard Shortcuts
            window.addEventListener('keydown', e => {
                if (!e.altKey) return;
                if (e.code === 'KeyY') { e.preventDefault(); Dashboard.toggle(); }
                if (e.key === '1') {
                     const clientId = this.getClientId();
                     if (clientId) {
                         if (!document.getElementById('sn-client-note')) ClientNote.create(clientId);
                         else Windows.toggle('sn-client-note');
                     }
                }
                if (e.key === '2') ContactForms.create('FO');
                if (e.key === '3') ContactForms.create('DDS');
            });
        },

        handleRecordLoad() {
            const clientId = this.getClientId();

            if (clientId) {
                // If the ID matches the already active ID, do absolutely nothing.
                if (this.activeClientId === clientId) {
                    return;
                }

                // If we navigated to a DIFFERENT client, destroy the old notes so fresh ones open
                if (this.activeClientId && this.activeClientId !== clientId) {
                    const oldNote = document.getElementById('sn-client-note');
                    if (oldNote) {
                        oldNote.remove();
                        Windows.updateTabState('sn-client-note');
                    }
                }

                this.activeClientId = clientId;

                // Auto-load if data exists in local storage
                if (GM_getValue('cn_' + clientId)) {
                    // Slight delay to allow SF DOM to populate text nodes for the scraper
                    setTimeout(() => {
                        const btn = document.getElementById('tab-sn-client-note');
                        if(btn) btn.classList.add('active');

                        // Ensure we only create if it isn't already open
                        if (!document.getElementById('sn-client-note')) {
                            ClientNote.create(clientId);
                        }
                    }, 500);
                }
            } else {
                // Not on a Matter or Form page, clear tracker
                this.activeClientId = null;
            }
        }
    };

    AppObserver.init();

})();