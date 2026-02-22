// ==UserScript==
// @name         CM Notes 0.8.5
// @namespace    http://tampermonkey.net/
// @version      0.8.5
// @description  KD CM1 Notes automate tool
// @author       Kant Nguyen (Optimized)
// @match        https://*.lightning.force.com/*
// @match        https://*.my.site.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_listValues
// @grant        GM_setClipboard
// @grant        GM_deleteValue
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// @grant        GM_xmlhttpRequest
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
            cursor: pointer; border-radius: 3px; font-weight: bold; color: #00695c; text-align: center;
            opacity: 0.5; transition: all 0.2s; border-style: dashed; /* Ghosted by default */
        }
        .sn-tb-btn:hover { opacity: 0.8; background: #f0fdfc; }
        .sn-tb-btn.sn-has-data { opacity: 1.0; border-style: solid; border-bottom: 3px solid #009688; } /* Solid if data */
        .sn-tb-btn.active { opacity: 1.0; background: #fff; }
        .sn-tb-btn.focused { background: #009688; color: white; border-color: #00796b; opacity: 1.0; }

        /* Dashboard Button */
        #sn-dash-btn {
            position: absolute; right: 5px; bottom: 2px; /* Flushed to bottom right of taskbar */
            width: 30px; height: 30px; /* Half size */
            background: white; border: 1px solid #29b6f6; border-radius: 50%;
            font-size: 16px; cursor: pointer; /* Smaller font */
            display: flex; align-items: center; justify-content: center;
            box-shadow: 0 0 10px #4fc3f7; /* Reduced shadow */
            transition: transform 0.2s, box-shadow 0.2s;
            z-index: 100000;
        }
        #sn-dash-btn:hover { transform: scale(1.1); box-shadow: 0 0 15px #03a9f4; }

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
        .sn-list-item.overdue {
            border-left: 4px solid #e53935; /* Red alert color */
            background: #fff3f3;
        }

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

        .sn-ghost { opacity: 0.5; transition: opacity 0.3s; }
        .sn-ghost:hover { opacity: 0.95; }
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

                // Optimized: Use TreeWalker to find Shadow Roots (avoids expensive querySelectorAll('*'))
                const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null, false);
                let node = walker.nextNode();
                while (node) {
                    if (node.shadowRoot) pierceShadows(node.shadowRoot);
                    node = walker.nextNode();
                }
            }
            
            // console.time('ScraperHeader'); // Uncomment to verify performance
            pierceShadows(document);
            // console.timeEnd('ScraperHeader');
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

                    // Optimized: TreeWalker for Sidebar recursion
                    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null, false);
                    let node = walker.nextNode();
                    while (node) {
                        if (node.shadowRoot) {
                            const res = findLabel(node.shadowRoot);
                            if (res) return res;
                        }
                        node = walker.nextNode();
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
        },

        getSSDFormData() {
            console.log("🎯 SSD Scraper Started...");
            const rawData = {};
            const phoneSet = new Set();
            const witnessPhones = new Set();
            const witnessInfo = [];

            // Fields we specifically want to capture for the address
            const addressParts = { street: '', city: '', state: '', zip: '' };
            const pobParts = { city: '', state: '' };

            function getInnerText(node) {
                return node ? (node.innerText || node.textContent || "").replace('*', '').trim() : "";
            }

            function hunt(root) {
                const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null, false);
                let node = walker.nextNode();

                while (node) {
                    const shadow = node.shadowRoot;

                    // 1. Recursion: Shadow DOM
                    if (shadow) hunt(shadow);

                    // 2. Recursion: Iframe
                    if (node.tagName === 'IFRAME') {
                        try {
                            const doc = node.contentDocument || node.contentWindow.document;
                            if (doc) hunt(doc);
                        } catch(e) {}
                    }

                    // 3. Extraction: LWC State Component
                    const labelAttr = node.getAttribute('label');
                    const innerLabel = shadow ? getInnerText(shadow.querySelector('label')) : null;
                    const componentLabel = labelAttr || innerLabel;

                    if (componentLabel === 'State') {
                        let val = node.value;
                        if (!val && shadow) { 
                            const internalSelect = shadow.querySelector('select');
                            const hiddenInput = shadow.querySelector('input[type="hidden"]');
                            const visibleInput = shadow.querySelector('input');

                            if (internalSelect && internalSelect.value) val = internalSelect.value;
                            else if (hiddenInput && hiddenInput.value) val = hiddenInput.value;
                            else if (visibleInput && visibleInput.value) val = visibleInput.value;
                        }
                        if (val) rawData['State'] = val;
                    }

                    // 4. Extraction: Standard Labels (Light DOM & Shadow Content)
                    if (node.matches('label') || node.classList.contains('slds-form-element__label')) {
                        const labelText = getInnerText(node);
                        if (labelText && labelText !== 'State') {
                            const container = node.closest('.slds-form-element') || (root.host ? root : root.body || root);
                            
                            let el = null;

                            // 1. LWC Component Check (Fix for Witness/Contact fields)
                            if (container.tagName && container.tagName.startsWith('LIGHTNING-')) {
                                el = container;
                            }

                            // 2. Standard Input Check
                            if (!el && container.querySelector) el = container.querySelector('input:not([type="hidden"]), textarea, select, [role="textbox"]');
                            
                            // 3. Read-only Static Text Check
                            if (!el && container.querySelector) el = container.querySelector('.slds-form-element__static, lightning-formatted-text, .test-id__field-value');

                            if (el) {
                                const val = el.value || el.getAttribute('value') || getInnerText(el);
                                if (val) rawData[labelText] = val;
                            }
                        }
                    }
                    node = walker.nextNode();
                }
            }

            hunt(document);

            // --- Post-Processing & Filtering ---
            const finalData = {};

            // 1. Address Parsing
            // Look for keys that might match address components
            for (const [key, val] of Object.entries(rawData)) {
                const k = key.toLowerCase();

                // 0. Witness/Contact (Prioritize to prevent mixing with client data)
                if (k.includes('witness') || k.includes('contact/witness')) {
                    if (k.includes('contact info')) {
                        witnessInfo.push(val);
                    }
                    finalData[key] = val; // Ensure raw field shows in Viewer
                    continue;
                }

                if (k.includes('street') || k.includes('mailing address')) addressParts.street = val;
                else if (k.includes('city') && !k.includes('born') && !k.includes('birth')) addressParts.city = val;
                else if (k === 'state') addressParts.state = val;
                else if (k.includes('zip')) addressParts.zip = val;
                
                // 2. Phone Parsing (Unique)
                else if (k.includes('phone') || k.includes('mobile') || k.includes('number')) {
                    phoneSet.add(val);
                }

                // 3. Email
                else if (k.includes('email')) finalData['Email'] = val;

                // 4. POB
                else if (k.includes('city') && k.includes('born')) pobParts.city = val;
                else if (k.includes('state') && k.includes('born')) pobParts.state = val;

                // 5. Parents
                else if (k.includes('mother') || k.includes('father') || k.includes('parent')) {
                    finalData['Parents'] = (finalData['Parents'] ? finalData['Parents'] + ', ' : '') + val;
                }

                // 6. Medical / Condition (Placeholder for Tab 2)
                else if (k.toLowerCase().includes('list of physical and mental conditions')) finalData['Condition'] = val;
                else if (k.includes('assistive')) finalData['Assistive Devices'] = val;
                else if (k.includes('doctor') || k.includes('hospital') || k.includes('clinic')) {
                     finalData['Medical Provider'] = (finalData['Medical Provider'] ? finalData['Medical Provider'] + '\n' : '') + val;
                }
            }

            // Construct Composite Fields
            const addr = [addressParts.street, addressParts.city, addressParts.state, addressParts.zip].filter(Boolean).join(', ');
            if (addr) finalData['Address'] = addr;
            if (addressParts.state) finalData['State'] = addressParts.state;
            if (addressParts.city) finalData['City'] = addressParts.city;

            const pob = [pobParts.city, pobParts.state].filter(Boolean).join(', ');
            if (pob) finalData['POB'] = pob;

            // Merge Witness Phones into Main Phone Field
            if (phoneSet.size > 0) finalData['Phone'] = Array.from(phoneSet).join(' - ');

            // Construct Witness Field
            if (witnessInfo.length > 0) {
                finalData['Witness'] = witnessInfo.join('\n');
            }

            // Ensure Medical fields exist even if empty (for Tab 2)
            // FIX: Do not force 'Witness' to empty string here, or it will overwrite data1 when merging data2 in getFullSSDData
            const result = { ...finalData, 'Condition': finalData['Condition'] || '', 'Assistive Devices': finalData['Assistive Devices'] || '', 'Medical Provider': finalData['Medical Provider'] || '' };
            if (finalData['Witness']) {
                result['Witness'] = finalData['Witness'];
            }
            return result;
        },

        _findMedicalTab(root = document) {
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null, false);
            let node = walker.nextNode();
            while (node) {
                if (node.tagName === 'A' && node.classList.contains('slds-path__link') && (node.innerText || "").includes('Medical')) {
                    return node;
                }
                if (node.shadowRoot) {
                    const found = this._findMedicalTab(node.shadowRoot);
                    if (found) return found;
                }
                node = walker.nextNode();
            }
            return null;
        },

        async getFullSSDData() {
            console.log("🎯 Starting Full SSD Scrape...");
            const data1 = this.getSSDFormData();

            const medTab = this._findMedicalTab();
            if (medTab) {
                console.log("🖱️ Medical Tab found. Clicking...");
                medTab.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true }));
                
                await new Promise(r => setTimeout(r, 800)); // Wait for LWC render
                
                const data2 = this.getSSDFormData();
                return { ...data1, ...data2 };
            }
            return data1;
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
            // Special handling for MedWindow which might not be created yet

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
                minBtn.title = "Minimize (Hold to save default size/pos)";
                let holdTimer = null;
                let saved = false;

                minBtn.onmousedown = (e) => {
                    e.stopPropagation();
                    saved = false;
                    holdTimer = setTimeout(() => {
                        const def = { width: w.style.width, height: w.style.height, top: w.style.top, left: w.style.left };
                        GM_setValue('def_pos_' + typeId, def);
                        w.classList.add('sn-saved-glow');
                        setTimeout(() => w.classList.remove('sn-saved-glow'), 500);
                        saved = true;
                    }, 500);
                };

                minBtn.onmouseup = () => {
                    clearTimeout(holdTimer);
                    if (!saved) {
                        w.style.display = 'none';
                        this.updateTabState(w.id);
                    }
                };
                minBtn.onmouseleave = () => clearTimeout(holdTimer);
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

                    let tip = document.getElementById('sn-resize-tip');
                    if (!tip) {
                        tip = document.createElement('div');
                        tip.id = 'sn-resize-tip';
                        tip.style.cssText = 'position:fixed; background:rgba(0,0,0,0.8); color:white; padding:4px 8px; border-radius:4px; font-size:11px; pointer-events:none; z-index:20000; display:none; font-family:sans-serif;';
                        document.body.appendChild(tip);
                    }
                    tip.style.display = 'block';

                    const startX = e.clientX, startY = e.clientY;
                    // Fix: Use bounding client rect to handle hidden elements better if needed
                    const rect = el.getBoundingClientRect();
                    const startW = rect.width;
                    const startH = rect.height;
                    const startL = el.offsetLeft, startT = el.offsetTop;
                    const cls = r.className;

                    const updateTip = (ev) => {
                        tip.innerText = `W: ${Math.round(el.offsetWidth)} H: ${Math.round(el.offsetHeight)} | X: ${Math.round(el.offsetLeft)} Y: ${Math.round(el.offsetTop)}`;
                        tip.style.top = (ev.clientY + 15) + 'px';
                        tip.style.left = (ev.clientX + 15) + 'px';
                    };
                    updateTip(e);

                    const onMove = (e) => {
                        const dx = e.clientX - startX, dy = e.clientY - startY;
                        if (cls.includes('rs-e') || cls.includes('ne') || cls.includes('se')) el.style.width = (startW + dx) + 'px';
                        if (cls.includes('rs-s') || cls.includes('se') || cls.includes('sw')) el.style.height = (startH + dy) + 'px';
                        if (cls.includes('rs-w') || cls.includes('nw') || cls.includes('sw')) { el.style.width = (startW - dx) + 'px'; el.style.left = (startL + dx) + 'px'; }
                        if (cls.includes('rs-n') || cls.includes('ne') || cls.includes('nw')) { el.style.height = (startH - dy) + 'px'; el.style.top = (startT + dy) + 'px'; }
                        updateTip(e);
                    };
                    const onUp = () => {
                        document.removeEventListener('mousemove', onMove);
                        document.removeEventListener('mouseup', onUp);
                        tip.style.display = 'none';
                        el.dispatchEvent(new Event('input', {bubbles: true}));
                    };
                    document.addEventListener('mousemove', onMove);
                    document.addEventListener('mouseup', onUp);
                };
            });
        }
    };

    // ==========================================
    // 3.5. SSA DATA MANAGER
    // ==========================================
    const SSADataManager = {
        dbUrl: 'https://raw.githubusercontent.com/kantngn/CM-Notes/refs/heads/main/db/SSADatabase.json',
        _cache: null,

        fetch(cb) {
            if (this._cache) return cb(this._cache);
            GM_xmlhttpRequest({
                method: "GET",
                url: this.dbUrl,
                onload: (res) => {
                    try {
                        this._cache = JSON.parse(res.responseText);
                        cb(this._cache);
                    } catch(e) { console.error("SSA DB Error", e); cb(null); }
                },
                onerror: () => cb(null)
            });
        },

        search(type, state, cb) {
            this.fetch(db => {
                if (!db) return cb([]);
                const s = state ? state.trim().toUpperCase() : '';
                if (!s) return cb([]);
                
                let results = [];
                if (type === 'FO' && db.FO) {
                    // Search full address for state match to avoid partial matches in location (e.g. "COUNTY" matching "CO")
                    results = db.FO.filter(i => i.fullAddress && i.fullAddress.includes(' ' + s + ','));
                } else if (type === 'DDS' && db.DDS) {
                    results = db.DDS.filter(i => i.name && (i.name.includes(' ' + s + ' ') || i.name.startsWith(s)));
                }
                cb(results);
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
        stateTZ: {
            'AL': 'CST', 'AK': 'AKST', 'AZ': 'MST', 'AR': 'CST', 'CA': 'PST', 'CO': 'MST', 'CT': 'EST', 'DE': 'EST', 'FL': 'EST', 'GA': 'EST',
            'HI': 'HST', 'ID': 'MST', 'IL': 'CST', 'IN': 'EST', 'IA': 'CST', 'KS': 'CST', 'KY': 'EST', 'LA': 'CST', 'ME': 'EST', 'MD': 'EST',
            'MA': 'EST', 'MI': 'EST', 'MN': 'CST', 'MS': 'CST', 'MO': 'CST', 'MT': 'MST', 'NE': 'CST', 'NV': 'PST', 'NH': 'EST', 'NJ': 'EST',
            'NM': 'MST', 'NY': 'EST', 'NC': 'EST', 'ND': 'CST', 'OH': 'EST', 'OK': 'CST', 'OR': 'PST', 'PA': 'EST', 'RI': 'EST', 'SC': 'EST',
            'SD': 'CST', 'TN': 'CST', 'TX': 'CST', 'UT': 'MST', 'VT': 'EST', 'VA': 'EST', 'WA': 'PST', 'WV': 'EST', 'WI': 'CST', 'WY': 'MST',
            'DC': 'EST'
        },
        specialTZ: {
            'FL': { 'PENSACOLA': 'CST', 'PANAMA CITY': 'CST', 'DESTIN': 'CST', 'FORT WALTON BEACH': 'CST' },
            'TX': { 'EL PASO': 'MST', 'HUDSPETH': 'MST' },
            'TN': { 'KNOXVILLE': 'EST', 'CHATTANOOGA': 'EST', 'JOHNSON CITY': 'EST', 'KINGSPORT': 'EST' },
            'IN': { 'GARY': 'CST', 'EVANSVILLE': 'CST' },
            'KY': { 'BOWLING GREEN': 'CST', 'OWENSBORO': 'CST', 'PADUCAH': 'CST' },
            'MI': { 'IRON MOUNTAIN': 'CST', 'MENOMINEE': 'CST' }
        },
        ianaTZ: {
            'EST': 'America/New_York', 'CST': 'America/Chicago', 'MST': 'America/Denver',
            'PST': 'America/Los_Angeles', 'AKST': 'America/Anchorage', 'HST': 'Pacific/Honolulu'
        },
        listeners: {},
        clockInterval: null,

        detectTimezone(state, city) {
            if (!state) return null;
            const s = state.toUpperCase();
            const c = city ? city.toUpperCase().trim() : '';
            if (this.specialTZ[s] && this.specialTZ[s][c]) return this.specialTZ[s][c];
            return this.stateTZ[s] || null;
        },

        create(clientId) {
            const id = 'sn-client-note';
            if (document.getElementById(id)) { Windows.toggle(id); return; }

            const savedData = GM_getValue('cn_' + clientId, {});
            const savedColorKey = GM_getValue('cn_color_' + clientId, 'CST');
            const savedFontSize = GM_getValue('cn_font_' + clientId, '12px');
            const [bodyColor, headerColor] = this.colors[savedColorKey] || this.colors.Default;
            const defPos = GM_getValue('def_pos_CN', { width: '500px', height: '400px', top: '100px', left: '100px' });

            // NEW: Register Cross-Tab Listener
            if (!this.listeners[clientId]) {
                console.log(`[ClientNote] 🎧 Listening for updates on cn_form_data_${clientId}`);
                this.listeners[clientId] = GM_addValueChangeListener('cn_form_data_' + clientId, (name, oldVal, newVal, remote) => {
                    console.log(`[ClientNote] 📨 Update received! Remote: ${remote}`, newVal);
                    if (remote) {
                        this.updateUI(newVal);
                    }
                });
            }

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
                            <div class="sn-spine-btn" data-panel="ssa" title="SSA Contacts" style="writing-mode:vertical-rl; text-orientation:mixed; transform:rotate(180deg); padding:15px 5px; color:#b2dfdb; cursor:pointer; font-weight:bold; font-size:12px; margin-bottom:5px; transition:background 0.2s;">SSA</div>
                            <div class="sn-spine-btn" data-panel="fax" title="PDF Forms" style="writing-mode:vertical-rl; text-orientation:mixed; transform:rotate(180deg); padding:15px 5px; color:#b2dfdb; cursor:pointer; font-weight:bold; font-size:12px; margin-bottom:5px; transition:background 0.2s;">Fax</div>
                            <div class="sn-spine-btn" data-panel="ir" title="IR Tool" style="writing-mode:vertical-rl; text-orientation:mixed; transform:rotate(180deg); padding:15px 5px; color:#b2dfdb; cursor:pointer; font-weight:bold; font-size:12px; margin-bottom:5px; transition:background 0.2s;">IR</div>
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
                                <span id="sn-city" style="font-weight:bold; margin-left:8px; color:#004d40; font-size:0.9em;">${savedData.city || ''}</span>
                                <span id="sn-state" style="font-weight:bold; margin-left:4px; color:#004d40; font-size:0.9em;">${savedData.state || ''}</span>
                                <span id="sn-time" style="font-weight:normal; margin-left:8px; font-size:0.85em; color:#333; min-width:60px;"></span>
                                <div style="display:flex; align-items:center; margin-left:auto;">
                                    <select id="sn-tz-select" style="display:none;">
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
                                <div id="sn-note-wrapper" style="position:relative; flex-grow:1; height:${savedData.notesHeight || '50%'}; min-height:50px;">
                                    <textarea id="sn-notes" style="width:100%; height:100%; resize:none; border:none; padding:8px; background:transparent; font-family:sans-serif; font-size:inherit; box-sizing:border-box;" placeholder="Case notes...">${savedData.notes || ''}</textarea>
                                    <button id="sn-ncl-btn" title="Task NCL" style="position:absolute; bottom:5px; right:15px; font-size:10px; padding:2px 6px; cursor:pointer; background:rgba(255,255,255,0.6); border:1px solid #999; border-radius:3px; color:#00695c; font-weight:bold;">NCL</button>
                                </div>
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

                                <button id="sn-pop-btn" title="Copy to Clipboard" style="cursor:pointer; background:none; border:none; margin-right:5px;">📋</button>
                                <div class="sn-cp-dropdown" style="margin-right:5px;">
                                    <button class="sn-cp-btn" title="Change Color">🎨</button>
                                    <div class="sn-cp-content" style="bottom:100%; top:auto; margin-bottom:5px;">${paletteHTML}</div>
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
                        saveState(); // Trigger save when editing is finished
                    };
                });
            };

            const renderInfoPanel = (container) => {
                const sidebarData = Scraper.getSidebarData();
                const freshData = GM_getValue('cn_' + clientId, {}); // Get latest data
                const formData = GM_getValue('cn_form_data_' + clientId, {}); // Get latest form data
                
                const fields = [
                    { id: 'ssn', label: 'SSN', val: freshData.ssn || sidebarData.ssn },
                    { id: 'dob', label: 'DOB', val: freshData.dob || sidebarData.dob },
                    { id: 'phone', label: 'Phone', val: formData['Phone'] || freshData.phone || '' },
                    { id: 'addr', label: 'Address', val: formData['Address'] || freshData.address || '' },
                    { id: 'email', label: 'Email', val: formData['Email'] || freshData.email || '' },
                    { id: 'pob', label: 'POB', val: formData['POB'] || freshData.pob || '' },
                    { id: 'parents', label: 'Parents', val: formData['Parents'] || freshData.parents || '' },
                    { id: 'wit', label: 'Witness', val: formData['Witness'] || freshData.witness || '' }
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
                        <textarea class="sn-side-textarea" data-id="${f.id}" readonly rows="1"
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
                    // Generate URL directly using the 15-char ID and constant UUID
                    const id15 = clientId.substring(0, 15);
                    window.open(`https://kdcv1.my.site.com/forms/s/?uuid=a0UfL000002vlqfUAA&recordid=${id15}`, '_blank');
                };

                // Wire up the Med Provider Button
                const medBtn = container.querySelector('#sn-go-med-btn');
                medBtn.onmouseover = () => medBtn.style.background = '#80cbc4';
                medBtn.onmouseout = () => medBtn.style.background = '#b2dfdb';
                medBtn.onclick = () => ClientNote.toggleMedWindow();

                setupAutoResize(container);

                // Save changes to Form Data on blur
                const fieldMap = {
                    'phone': 'Phone', 'addr': 'Address', 'email': 'Email',
                    'pob': 'POB', 'parents': 'Parents', 'wit': 'Witness'
                };
                Object.keys(fieldMap).forEach(domId => {
                    const el = container.querySelector(`.sn-side-textarea[data-id="${domId}"]`);
                    if (el) {
                        el.addEventListener('blur', () => {
                            ClientNote.updateAndSaveData(clientId, { [fieldMap[domId]]: el.value });
                        });
                    }
                });
            };

            const togglePanel = (type) => {
                const titleMap = { 'info': 'Client Info', 'fax': 'PDF Forms', 'ssa': 'SSA Contacts', 'ir': 'IR Tool' };
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
                    else if (type === 'ssa') renderSSAPanel(sideBody);
                    else if (type === 'ir') renderIRPanel(sideBody);
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
                const formData = GM_getValue('cn_form_data_' + clientId, {});
                const ddsName = formData.DDS_Selection || '';
                const globalCM1 = GM_getValue('sn_global_cm1', '');
                const globalExt = GM_getValue('sn_global_ext', '');

                const styles = `border:none; border-bottom:1px dashed #999; background:transparent; font-family:inherit; width:100%;`;
                // Removed inline inline event listeners
                const createField = (lbl, val, hasCheck = false, extraClass = '') => `
                    <div style="display:flex; align-items:center; margin-bottom:4px; font-size:0.9em;">
                        ${hasCheck ? '<input type="checkbox" style="margin-right:4px;">' : ''}
                        <span style="color:#555; margin-right:4px; font-weight:bold; white-space:nowrap;">${lbl}:</span>
                        <input type="text" class="sn-fax-input ${extraClass}" value="${val || ''}" readonly style="${styles}">
                    </div>`;

                const sections = [
                    { title: "Letter 25", content: `${createField('Name', data.name)}${createField('SSN', data.ssn)}${createField('Phone', formData['Phone'] || '', true)}${createField('Address', formData['Address'] || '', true)}<button style="margin-top:5px; width:100%;">📄 Generate PDF</button>` },
                    { title: "Status to DDS", content: `${createField('DDS', ddsName)}${createField('Fax #', '')}${createField('Name', data.name)}${createField('SSN', data.ssn)}${createField('DOB', data.dob)}${createField('Last update', 'N/A')}${createField('CM1', globalCM1, false, 'sn-global-cm1')}${createField('Ext.', globalExt, false, 'sn-global-ext')}<button style="margin-top:5px; width:100%;">📄 Generate PDF</button>` },
                    { title: "Status to FO", content: `${createField('Name', data.name)}${createField('SSN', data.ssn)}<button style="margin-top:5px; width:100%;">📄 Generate PDF</button>` }
                ];

                sections.forEach(sec => {
                    const wrap = document.createElement('div');
                    wrap.innerHTML = `
                        <button class="sn-fax-btn">${sec.title}</button>
                        <div class="sn-fax-content" style="display:none; padding:8px; border:1px solid #ccc; background:#f9f9f9; margin-bottom:5px;">${sec.content}</div>
                    `;
                    wrap.querySelector('.sn-fax-btn').onclick = function() {
                        const c = this.nextElementSibling;
                        c.style.display = c.style.display === 'none' ? 'block' : 'none';
                    };
                    container.appendChild(wrap);
                });

                // Attach events dynamically for security
                container.querySelectorAll('.sn-fax-input').forEach(inp => {
                    inp.ondblclick = () => { inp.removeAttribute('readonly'); inp.focus(); };
                    inp.onblur = () => inp.setAttribute('readonly', true);
                    inp.onkeydown = (e) => { if (e.key === 'Enter') inp.blur(); };
                });

                // Global savers
                container.querySelectorAll('.sn-global-cm1').forEach(el => el.oninput = () => GM_setValue('sn_global_cm1', el.value));
                container.querySelectorAll('.sn-global-ext').forEach(el => el.oninput = () => GM_setValue('sn_global_ext', el.value));
            };

            const renderSSAPanel = (container) => {
                const formData = GM_getValue('cn_form_data_' + clientId, {});
                const state = w.querySelector('#sn-state').innerText || '';

                container.innerHTML = `
                    <div style="padding:10px; display:flex; flex-direction:column; gap:15px;">
                        <!-- FO Section -->
                        <div class="sn-ssa-section" data-type="FO">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2px; border-bottom:1px solid #ccc; padding-bottom:2px;">
                                <span style="font-weight:bold; color:#00695c;">Field Office (FO)</span>
                                <div style="display:flex; gap:2px;">
                                    <button class="sn-ssa-search-btn" style="cursor:pointer; background:#e0f2f1; border:1px solid #009688; border-radius:3px; font-size:10px; padding:1px 5px;">Search</button>
                                    <button class="sn-ssa-clear-btn" style="cursor:pointer; background:#ffebee; border:1px solid #ef5350; border-radius:3px; font-size:10px; padding:1px 5px;">✕</button>
                                </div>
                            </div>
                            <div class="sn-ssa-display" style="background:#fff; border:1px solid #ccc; padding:5px; font-size:11px; min-height:40px; white-space:pre-wrap; color:#333;">${formData.FO_Text || ''}</div>
                            <div class="sn-ssa-search-box" style="display:none;">
                                <input type="text" class="sn-ssa-input" style="width:100%; border:1px solid #009688; padding:4px; font-size:11px; box-sizing:border-box; margin-bottom:5px;" placeholder="Enter State...">
                                <div class="sn-ssa-results" style="border:1px solid #b2dfdb; max-height:150px; overflow-y:auto; background:white; display:none;"></div>
                            </div>
                        </div>

                        <!-- DDS Section -->
                        <div class="sn-ssa-section" data-type="DDS">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2px; border-bottom:1px solid #ccc; padding-bottom:2px;">
                                <span style="font-weight:bold; color:#00695c;">DDS Office</span>
                                <div style="display:flex; gap:2px;">
                                    <button class="sn-ssa-search-btn" style="cursor:pointer; background:#e0f2f1; border:1px solid #009688; border-radius:3px; font-size:10px; padding:1px 5px;">Search</button>
                                    <button class="sn-ssa-clear-btn" style="cursor:pointer; background:#ffebee; border:1px solid #ef5350; border-radius:3px; font-size:10px; padding:1px 5px;">✕</button>
                                </div>
                            </div>
                            <div class="sn-ssa-display" style="background:#fff; border:1px solid #ccc; padding:5px; font-size:11px; min-height:40px; white-space:pre-wrap; color:#333;">${formData.DDS_Text || ''}</div>
                            <div class="sn-ssa-search-box" style="display:none;">
                                <input type="text" class="sn-ssa-input" style="width:100%; border:1px solid #009688; padding:4px; font-size:11px; box-sizing:border-box; margin-bottom:5px;" placeholder="Enter State...">
                                <div class="sn-ssa-results" style="border:1px solid #b2dfdb; max-height:150px; overflow-y:auto; background:white; display:none;"></div>
                            </div>
                            <textarea id="sn-dds-note" placeholder="DDS Notes..." style="width:100%; height:40px; border:1px solid #ccc; font-family:inherit; font-size:11px; margin-top:5px; resize:vertical; box-sizing: border-box;">${formData.DDS_Note || ''}</textarea>
                        </div>
                    </div>
                `;

                // Add listener for DDS Note
                const ddsNote = container.querySelector('#sn-dds-note');
                ddsNote.oninput = () => {
                    ClientNote.updateAndSaveData(clientId, { DDS_Note: ddsNote.value });
                };

                container.querySelectorAll('.sn-ssa-section').forEach(section => {
                    const type = section.getAttribute('data-type');
                    const searchBtn = section.querySelector('.sn-ssa-search-btn');
                    const clearBtn = section.querySelector('.sn-ssa-clear-btn');
                    const displayDiv = section.querySelector('.sn-ssa-display');
                    const searchBox = section.querySelector('.sn-ssa-search-box');
                    const input = section.querySelector('.sn-ssa-input');
                    const resultsDiv = section.querySelector('.sn-ssa-results');

                    const performSearch = () => {
                        const query = input.value.trim();
                        if (!query) return;
                        
                        searchBtn.innerText = "...";
                        SSADataManager.search(type, query, (results) => {
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
                                row.onmouseover = () => row.style.background = "#e0f2f1";
                                row.onmouseout = () => row.style.background = "white";
                                
                                const label = type === 'FO' ? `<b>${item.location}</b><br>PN: ${item.phone} | Fax: ${item.fax}` : `<b>${item.name}</b><br>PN: ${item.phone}` + (item.fax ? ` | Fax (??): ${item.fax}` : '');
                                row.innerHTML = label;
                                row.onclick = () => {
                                    const saveVal = type === 'FO' ? item.id : item.name;
                                    const displayText = type === 'FO' ? `${item.location}\n${item.fullAddress}\nPN: ${item.phone}\nFax: ${item.fax}` : `${item.name}\nPN: ${item.phone}` + (item.fax ? `\nFax (??): ${item.fax}` : '');
                                    
                                    ClientNote.updateAndSaveData(clientId, { [`${type}_Selection`]: saveVal, [`${type}_Text`]: displayText });
                                    displayDiv.innerText = displayText;
                                    
                                    // Close search
                                    searchBox.style.display = 'none';
                                    displayDiv.style.display = 'block';
                                    searchBtn.innerText = "Search";
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
                            searchBtn.innerText = "Search";
                        }
                    };

                    clearBtn.onclick = () => {
                        if (confirm(`Clear ${type}?`)) {
                            displayDiv.innerText = "";
                            ClientNote.updateAndSaveData(clientId, { [`${type}_Selection`]: "", [`${type}_Text`]: "" });
                            searchBox.style.display = 'none';
                            displayDiv.style.display = 'block';
                            searchBtn.innerText = "Search";
                        }
                    };
                });
            };

            const renderIRPanel = (container) => {
                container.innerHTML = `
                    <div style="padding:10px; display:flex; flex-direction:column; height:100%; box-sizing:border-box; gap:10px;">
                        <div style="display:flex; flex-direction:column; height:auto; flex-shrink:0;">
                            <button id="sn-ir-select-btn" style="width:100%; padding:10px; cursor:pointer; background:#e0f2f1; border:1px solid #009688; border-radius:4px; color:#004d40; font-weight:bold; display:flex; align-items:center; justify-content:center; gap:5px;">
                                <span>🎯</span> Select IR Report from Page
                            </button>
                            <div id="sn-ir-status" style="font-size:10px; color:#666; text-align:center; margin-top:4px; min-height:14px;"></div>
                        </div>
                        <div style="display:flex; flex-direction:column; flex-grow:1; overflow:hidden;">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2px;">
                                <label style="font-weight:bold; color:#00695c; font-size:11px;">Output</label>
                                <button id="sn-ir-copy" style="cursor:pointer; background:#e0f2f1; border:1px solid #009688; border-radius:3px; font-size:10px; padding:1px 5px; color:#004d40;">Copy</button>
                            </div>
                            <div id="sn-ir-output" contenteditable="true" style="flex-grow:1; width:100%; border:1px solid #ccc; font-family:inherit; padding:5px; box-sizing:border-box; background:#fff; font-size:11px; overflow-y:auto; white-space:pre-wrap;"></div>
                        </div>
                    </div>
                `;

                const summarizeIR = (text, reportDate) => {
                    if (!text) return "";
                    const getVal = (regex) => (text.match(regex) || [])[1] || "";
                    const fmtDate = (d) => {
                        if (!d) return "";
                        const date = new Date(d);
                        return isNaN(date) ? d : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                    };

                    let caseLevel = getVal(/Case Level:\s*(.*)/i).trim();
                    caseLevel = caseLevel.includes("Reconsideration") ? "Recon" : (caseLevel.includes("Initial") ? "IA" : caseLevel);
                    const receiptDate = getVal(/Receipt Date:\s*(\d{2}\/\d{2}\/\d{4})/);
                    const assignedDate = getVal(/First Date Assigned:\s*(\d{2}\/\d{2}\/\d{4})/);

                    const claimBlocks = text.split(/Claim # \d+:/).slice(1);
                    let types = new Set(), statuses = new Set(), office = "", closedDate = "";
                    claimBlocks.forEach(block => {
                        const type = (block.match(/Claim Type:\s*(.*)/i) || [])[1] || "";
                        if (type.includes("Title 16")) types.add("T16");
                        if (type.includes("Title 2")) types.add("T2");
                        const stat = (block.match(/Claim Status:\s*(.*)/i) || [])[1] || "";
                        statuses.add(stat.trim());
                        if (stat.includes("Closed")) closedDate = (block.match(/Status Date:\s*(\d{2}\/\d{2}\/\d{4})/) || [])[1];
                        const off = (block.match(/Office\s+with\s+Jurisdiction:\s*(.*)/i) || [])[1];
                        if (off) office = off.trim();
                    });

                    const claimType = (types.has("T2") && types.has("T16")) ? "Concurrent" : (types.has("T2") ? "T2" : "T16");
                    const isClosed = [...statuses].some(s => s.includes("Closed"));
                    const isStaging = [...statuses].some(s => s.includes("Staging"));

                    const article = /^[aeiou]/i.test(caseLevel) ? "an" : "a";
                    let summary = `IR report received on ${reportDate} indicates ${article} ${caseLevel} ${claimType} claim`;
                    if (isClosed) return `${summary} and was closed at DDS ${office} on ${fmtDate(closedDate)}.`;
                    
                    summary += `, received at DDS ${office} on ${fmtDate(receiptDate)}`;
                    summary += (assignedDate === receiptDate) ? `, assigned on same date.` : `, assigned on ${fmtDate(assignedDate)}.`;
                    if (isStaging) summary += ` and still on staging.`;

                    // Claimant Info
                    const clRegex = /Letter Name:\s*([^,]+),[\s\S]*?Date Sent:\s*(\d{2}\/\d{2}\/\d{4}),[\s\S]*?Address 1:\s*\[.*?Address:\s*([^\]]+)\s*\]/g;
                    const clRequests = [];
                    let match;
                    while ((match = clRegex.exec(text)) !== null) {
                        let name = match[1].trim();
                        if (name.includes("Work History")) name = "WH";
                        else if (name.includes("Activities of Daily Living")) name = "ADL";
                        clRequests.push({ name, date: fmtDate(match[2]), address: match[3].trim() });
                    }
                    if (clRequests.length > 0) {
                        const byAddr = {};
                        clRequests.forEach(r => { if (!byAddr[r.address]) byAddr[r.address] = []; byAddr[r.address].push(r); });
                        Object.entries(byAddr).forEach(([addr, reqs]) => {
                            const verb = reqs.length > 1 ? "were" : "was";
                            summary += `\n\n${reqs.map(r => r.name).join(" and ")} ${verb} sent to CL on ${reqs.map(r => r.date).join(" and ")} to ${addr}.`;
                        });
                    }

                    // Medical Evidence
                    const medRegex = /Letter Name:\s*([^,]+),[\s\S]*?Date Sent:\s*(\d{2}\/\d{2}\/\d{4}),(?:[\s\S]*?Date Received:\s*(\d{2}\/\d{2}\/\d{4}),)?[\s\S]*?Organization Name:\s*([^,\]]+)[\s\S]*?Facility Address:\s*(.*)/g;
                    const facilities = {};
                    let medMatch;
                    while ((medMatch = medRegex.exec(text)) !== null) {
                        const org = medMatch[4].trim();
                        if (!facilities[org]) facilities[org] = { address: medMatch[5].trim(), reqs: [] };
                        facilities[org].reqs.push({ sent: fmtDate(medMatch[2]), received: medMatch[3] ? fmtDate(medMatch[3]) : null });
                    }
                    Object.entries(facilities).forEach(([org, data]) => {
                        const count = data.reqs.length === 1 ? "One" : (data.reqs.length === 2 ? "Two" : data.reqs.length);
                        const noun = data.reqs.length === 1 ? "Request" : "Requests";
                        const verb = data.reqs.length === 1 ? "was" : "were";
                        let line = `\n\n${count} Medical Evidence ${noun} ${verb} sent to ${org}, Address: ${data.address}`;
                        line += " " + data.reqs.map(r => `on ${r.sent}` + (r.received ? ` and received reply on ${r.received}` : ` with no confirmation on receipt`)).join(". Also ") + ".";
                        summary += line;
                    });

                    // CE Appointments
                    const ceRegex = /CE Appointment # \d+:[\s\S]*?Appointment Date:\s*(\d{2}\/\d{2}\/\d{4}),[\s\S]*?Appointment(?: Start)? Time:\s*([^,]+),[\s\S]*?Status:\s*([^,]+),[\s\S]*?Facility:\s*\[([\s\S]*?)\][\s\S]*?Facility Address:\s*(.*)/g;
                    let ceMatch;
                    while ((ceMatch = ceRegex.exec(text)) !== null) {
                        const date = fmtDate(ceMatch[1]);
                        const time = ceMatch[2].trim();
                        const status = ceMatch[3].trim();
                        const facilityRaw = ceMatch[4];
                        const address = ceMatch[5].trim();

                        let indName = (facilityRaw.match(/Individual Name:\s*([^,]+)/) || [])[1] || "";
                        let orgName = (facilityRaw.match(/Organization Name:\s*([^,]+)/) || [])[1] || "";
                        
                        let facilityStr = "";
                        if (indName) facilityStr += " with " + indName.trim();
                        if (orgName) facilityStr += " at " + orgName.trim();

                        let line = `\n\nA CE appointment was scheduled for CL at ${time} ${date}${facilityStr}, ${address}`;
                        
                        if (status.toLowerCase().includes("cancelled")) {
                            line += " - but it was cancelled.";
                        } else if (status.toLowerCase().includes("kept")) {
                            line += " - CL attendance was confirmed.";
                        } else {
                            line += " - CL attendance was not confirmed.";
                        }
                        summary += line;
                    }

                    return summary;
                };

                const output = container.querySelector('#sn-ir-output');
                const copyBtn = container.querySelector('#sn-ir-copy');
                const selectBtn = container.querySelector('#sn-ir-select-btn');
                const statusDiv = container.querySelector('#sn-ir-status');

                let isCapturing = false;
                let highlightEl = null;
                let mouseOverHandler = null;
                let clickHandler = null;

                const cleanup = () => {
                    if (highlightEl) highlightEl.remove();
                    if (mouseOverHandler) document.removeEventListener('mouseover', mouseOverHandler);
                    if (clickHandler) document.removeEventListener('click', clickHandler, true);
                    isCapturing = false;
                    selectBtn.style.background = '#e0f2f1';
                    selectBtn.innerHTML = '<span>🎯</span> Select IR Report from Page';
                    statusDiv.innerText = "";
                };

                selectBtn.onclick = (e) => {
                    e.stopPropagation();
                    if (isCapturing) {
                        cleanup();
                        return;
                    }

                    isCapturing = true;
                    selectBtn.style.background = '#ffccbc';
                    selectBtn.innerHTML = '<span>❌</span> Cancel Selection';
                    statusDiv.innerText = "Hover over text block & click to capture...";

                    highlightEl = document.createElement('div');
                    highlightEl.style.cssText = 'position:absolute; border:2px dashed #f44336; pointer-events:none; z-index:999999; background:rgba(244, 67, 54, 0.1); transition: all 0.1s ease;';
                    document.body.appendChild(highlightEl);

                    mouseOverHandler = (ev) => {
                        const container = ev.target.closest('.slds-timeline__item_expandable, .slds-card, .task-card');
                        const target = container || ev.target;
                        const rect = target.getBoundingClientRect();
                        highlightEl.style.width = rect.width + 'px';
                        highlightEl.style.height = rect.height + 'px';
                        highlightEl.style.top = (rect.top + window.scrollY) + 'px';
                        highlightEl.style.left = (rect.left + window.scrollX) + 'px';
                    };

                    clickHandler = (ev) => {
                        ev.preventDefault();
                        ev.stopPropagation();
                        
                        if (ev.target === selectBtn || selectBtn.contains(ev.target)) return;

                        const container = ev.target.closest('.slds-timeline__item_expandable, .slds-card, .task-card');
                        const target = container || ev.target;
                        const text = target.innerText || target.value || "";
                        
                        if (text) {
                            let dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                            // Attempt to find a date in the captured text (e.g., "Jan 3" or "Jan 3, 2025")
                            const dateMatch = text.match(/(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}(?:,?\s+\d{4})?/i);
                            if (dateMatch) {
                                dateStr = dateMatch[0];
                                if (!/\d{4}/.test(dateStr)) {
                                    dateStr += `, ${new Date().getFullYear()}`;
                                }
                            }

                            output.innerHTML = summarizeIR(text, dateStr);
                            statusDiv.innerText = "Captured!";
                            setTimeout(() => statusDiv.innerText = "", 2000);
                        } else {
                            statusDiv.innerText = "No text found.";
                        }
                        cleanup();
                    };

                    document.addEventListener('mouseover', mouseOverHandler);
                    document.addEventListener('click', clickHandler, true);
                };

                copyBtn.onclick = () => {
                    GM_setClipboard(output.innerText);
                    copyBtn.innerText = "Copied!";
                    setTimeout(() => copyBtn.innerText = "Copy", 1000);
                };
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

            // Check initial data state for buttons
            this.checkStoredData(clientId);

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

                    // Retrieve previous data to preserve fields if UI elements are missing (e.g. closed sidebar)
                    const previous = GM_getValue('cn_' + clientId, {});
                    const ssnEl = w.querySelector('.sn-side-textarea[data-id="ssn"]');
                    const dobEl = w.querySelector('.sn-side-textarea[data-id="dob"]');

                    const data = {
                        name: w.querySelector('#sn-cl-name').innerText, notes: w.querySelector('#sn-notes').value,
                        city: w.querySelector('#sn-city').innerText,
                        state: w.querySelector('#sn-state').innerText,
                        substatus: w.querySelector('#sn-substatus').value,
                        ssn: ssnEl ? ssnEl.value : previous.ssn,
                        dob: dobEl ? dobEl.value : previous.dob,
                        revisitActive: w.querySelector('#sn-revisit-check').checked, revisit: w.querySelector('#sn-revisit-date').value,
                        level: w.querySelector('#sn-level').value, type: w.querySelector('#sn-type').value,
                        todoHTML: todoList.innerHTML, notesHeight: w.querySelector('#sn-note-wrapper').style.height,
                        width: w.style.width, height: w.style.height, top: w.style.top, left: w.style.left,
                        customColor: w.style.backgroundColor, timestamp: Date.now(),
                        // We do NOT save form data (med/wit/etc) here to prevent overwriting.
                        // It is managed by cn_form_data_{id}
                    };
                    
                    GM_setValue('cn_' + clientId, data);
                    this.checkStoredData(clientId);
                } catch (err) {}
            };
            w.addEventListener('input', saveState); w.addEventListener('change', saveState); w.addEventListener('mouseup', saveState);

            const tzSelect = w.querySelector('#sn-tz-select');
            tzSelect.value = savedColorKey;
            tzSelect.onchange = () => {
                const [bg, head] = this.colors[tzSelect.value] || this.colors.Default;
                w.style.backgroundColor = bg; w.querySelector('#sn-cn-header').style.background = head;
                GM_setValue('cn_color_' + clientId, tzSelect.value);
                this.startClock(tzSelect.value);
            };
            if(savedData.level) w.querySelector('#sn-level').value = savedData.level;
            if(savedData.type) w.querySelector('#sn-type').value = savedData.type;

            // Helper to update Info Panel inputs from data
            const updateInfoPanelUI = (data) => {
                const keyMap = {
                    'ssn': 'ssn', 'dob': 'dob', 'phone': 'Phone', 'addr': 'Address',
                    'email': 'Email', 'pob': 'POB', 'parents': 'Parents', 'wit': 'Witness'
                };
                Object.entries(keyMap).forEach(([domId, dataKey]) => {
                    const el = w.querySelector(`.sn-side-textarea[data-id="${domId}"]`);
                    if (el && data[dataKey] !== undefined) el.value = data[dataKey];
                });
            };
            
            // Load separate form data
            const formData = GM_getValue('cn_form_data_' + clientId, {});
            this.medProvider = formData['Medical Provider'] || '';
            this.assistiveDevice = formData['Assistive Devices'] || '';
            this.condition = formData['Condition'] || '';

            const fillForm = (force = false) => {
                 // 1. Load the single source of truth: the data from storage.
                 const freshData = GM_getValue('cn_' + clientId, {});
                 // Always load the latest form data
                 const freshFormData = GM_getValue('cn_form_data_' + clientId, {}); 

                 // 2. Scrape the current page for supplementary data.
                 const headerData = Scraper.getHeaderData();
                 const sidebarData = Scraper.getSidebarData();

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
                     nameEl.innerText = sidebarData.name || freshData.name || 'Client Note';
                 }

                 // Populate City
                 const cityEl = w.querySelector('#sn-city');
                 const cityVal = headerData['City'] || headerData['Mailing City'] || freshData.city || freshFormData['City'] || '';
                 if (cityEl) cityEl.innerText = cityVal;

                 // Populate State
                 const stateEl = w.querySelector('#sn-state');
                 const stateVal = headerData['State'] || headerData['Mailing State'] || freshData.state || freshFormData['State'] || '';
                 if (stateEl) {
                     stateEl.innerText = stateVal;
                     // Auto-detect Timezone and Color
                     const detectedTZ = this.detectTimezone(stateVal, cityVal);
                     if (detectedTZ) {
                         const tzDropdown = w.querySelector('#sn-tz-select');
                         if (tzDropdown.value !== detectedTZ) {
                             tzDropdown.value = detectedTZ;
                             tzDropdown.dispatchEvent(new Event('change')); // Trigger color change and clock
                         }
                     }
                 }

                 const lvlSelect = w.querySelector('#sn-level');
                 if (force || lvlSelect.value === 'Level') {
                     const statusMap = { 'Initial Application': 'IA', 'Reconsideration': 'Recon', 'Hearing': 'Hearing' };
                     const val = statusMap[headerData['Status']] || headerData['Status'] || freshData.level;
                     if (val) for(let i=0; i<lvlSelect.options.length; i++) { if(lvlSelect.options[i].text === val || lvlSelect.options[i].value === val) lvlSelect.selectedIndex = i; }
                 }

                 const typSelect = w.querySelector('#sn-type');
                 if (force || typSelect.value === 'Type') {
                     const map = { 'SSI': 'T16', 'SSDIB': 'T2', 'SSI/SSDIB': 'Concurrent' };
                     const val = map[headerData['SS Classification']] || headerData['SS Classification'] || freshData.type;
                     if (val) for(let i=0; i<typSelect.options.length; i++) { if(typSelect.options[i].text === val || typSelect.options[i].value === val) typSelect.selectedIndex = i; }
                 }

                 if (headerData['Sub-status']) {
                     w.querySelector('#sn-substatus').value = headerData['Sub-status'];
                 } else if (freshData.substatus) {
                     w.querySelector('#sn-substatus').value = freshData.substatus;
                 }

                 // 5. Update any dependent UI
                 this.updateMedWindowUI();

                 // 6. Save the newly merged state back to storage.
                 saveState();
            };

            // Force fillForm to run if the dropdowns are currently stuck on their default values
            // This prevents old, empty saves from locking the script out.
            if (!savedData.timestamp || w.querySelector('#sn-level').value === 'Level' || w.querySelector('#sn-type').value === 'Type') {
                fillForm();
            }

            // REFRESH BUTTON: Only scrape and update Header + Status Bar
            w.querySelector('#sn-refresh-btn').onclick = () => {
                const headerData = Scraper.getHeaderData();
                const sidebarData = Scraper.getSidebarData();
                
                // Load existing data for fallback
                const freshData = GM_getValue('cn_' + clientId, {});
                const freshFormData = GM_getValue('cn_form_data_' + clientId, {});

                // Update Header
                w.querySelector('#sn-cl-name').innerText = sidebarData.name || headerData['Client Name'] || freshData.name || 'Client Note';
                const newCity = headerData['City'] || headerData['Mailing City'] || freshData.city || freshFormData['City'] || '';
                w.querySelector('#sn-city').innerText = newCity;

                const newState = headerData['State'] || headerData['Mailing State'] || freshData.state || freshFormData['State'] || '';
                w.querySelector('#sn-state').innerText = newState;
                
                const detectedTZ = this.detectTimezone(newState, newCity);
                if (detectedTZ) {
                     const tzDropdown = w.querySelector('#sn-tz-select');
                     if (tzDropdown.value !== detectedTZ) {
                         tzDropdown.value = detectedTZ;
                         tzDropdown.dispatchEvent(new Event('change'));
                     }
                }

                // Update Status Bar
                const lvlSelect = w.querySelector('#sn-level');
                const statusMap = { 'Initial Application': 'IA', 'Reconsideration': 'Recon', 'Hearing': 'Hearing' };
                const val = statusMap[headerData['Status']] || headerData['Status'];
                if (val) for(let i=0; i<lvlSelect.options.length; i++) { if(lvlSelect.options[i].text === val || lvlSelect.options[i].value === val) lvlSelect.selectedIndex = i; }

                const typSelect = w.querySelector('#sn-type');
                const map = { 'SSI': 'T16', 'SSDIB': 'T2', 'SSI/SSDIB': 'Concurrent' };
                const val2 = map[headerData['SS Classification']] || headerData['SS Classification'];
                if (val2) for(let i=0; i<typSelect.options.length; i++) { if(typSelect.options[i].text === val2 || typSelect.options[i].value === val2) typSelect.selectedIndex = i; }

                if (headerData['Sub-status']) {
                    w.querySelector('#sn-substatus').value = headerData['Sub-status'];
                }
                saveState();
            };

            w.querySelector('#sn-pop-btn').onclick = () => { const d = Scraper.getSidebarData(); if(d.combined) GM_setClipboard(d.combined); };
            this.startClock(savedColorKey); // Start clock on init
            const partition = w.querySelector('#sn-partition'), noteArea = w.querySelector('#sn-note-wrapper');
            partition.onmousedown = (e) => {
                e.preventDefault(); const startY = e.clientY, startH = noteArea.offsetHeight;
                const onMove = (mv) => { noteArea.style.height = (startH + (mv.clientY - startY)) + 'px'; noteArea.style.flexGrow = 0; };
                const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); saveState(); };
                document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
            };
            
            w.querySelector('#sn-del-btn').onclick = () => { 
                if(confirm("Delete notes?")) { 
                    try { 
                        GM_deleteValue('cn_' + clientId); 
                        GM_deleteValue('cn_form_data_' + clientId); 
                        
                        // Reset internal memory
                        this.medProvider = ''; this.assistiveDevice = ''; this.condition = '';
                        
                        // Close windows immediately
                        this.destroy(clientId);
                        
                        // Update taskbar state (ghost the buttons)
                        this.checkStoredData(clientId);
                    } catch(e) {} 
                } 
            };

            // Bind NCL Button
            w.querySelector('#sn-ncl-btn').onclick = () => TaskAutomation.runNCL(clientId);

            if (!savedData.timestamp) fillForm();
        },

        updateAndSaveData(clientId, newData) {
            // SAVE TO DEDICATED STORAGE KEY
            const key = 'cn_form_data_' + clientId;
            const existingData = GM_getValue(key, {});
            const mergedData = { ...existingData, ...newData };
            
            mergedData.timestamp = Date.now(); // Mark as updated
            GM_setValue(key, mergedData);
            this.checkStoredData(clientId);
            console.log(`Saved scraped data for client ${clientId}.`);

            // LIVE UPDATE: Update local UI immediately
            this.updateUI(mergedData);
        },

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
                } catch(e) { el.innerText = ''; }
            };
            update();
            this.clockInterval = setInterval(update, 1000);
        },

        // NEW: Centralized UI Update (used by both local save and remote listener)
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

        destroy(clientId) {
            const w = document.getElementById('sn-client-note');
            if (w) w.remove();
            
            const mw = document.getElementById('sn-med-popout');
            if (mw) { mw.remove(); Windows.updateTabState('sn-med-popout'); }

            if (this.listeners[clientId]) {
                GM_removeValueChangeListener(this.listeners[clientId]);
                delete this.listeners[clientId];
            }
            if (this.clockInterval) { clearInterval(this.clockInterval); this.clockInterval = null; }
        },

        updateMedWindowUI() {
            const medWindow = document.getElementById('sn-med-popout');
            if (medWindow) {
                const setVal = (field, val) => { const el = medWindow.querySelector(`textarea[data-field="${field}"]`); if(el) el.value = val || ''; };
                setVal('Medical Provider', this.medProvider);
                setVal('Assistive Device', this.assistiveDevice);
                setVal('Condition', this.condition);
            }
        },

        toggleMedWindow() {
            const mid = 'sn-med-popout';
            const medWindow = document.getElementById(mid);

            if (medWindow) {
                if (medWindow.style.display === 'none') {
                    medWindow.style.display = 'flex';
                    Windows.bringToFront(medWindow);
                } else {
                    medWindow.style.display = 'none';
                }
                Windows.updateTabState(mid);
                return;
            }

            const w = document.getElementById('sn-client-note');
            if (!w || w.style.display === 'none') {
                alert('Client Note must be open to create the Medical Providers window.');
                return;
            }

            // --- MED PROVIDER POP-OUT ---
            const rect = w.getBoundingClientRect();
            const mwW = window.innerWidth * 0.55;
            const mwH = window.innerHeight / 5;
            const mwLeft = rect.left + (rect.width / 2) - (mwW / 2);
            const mwTop = rect.bottom;

            const mw = document.createElement('div');
            mw.id = mid; mw.className = 'sn-window';
            mw.style.cssText = `width:${mwW}px; height:${mwH}px; top:${mwTop}px; left:${mwLeft}px; background:#f9f9f9; display:flex; flex-direction:column; box-shadow:0 4px 15px rgba(0,0,0,0.4); font-size:12px; z-index:10005;`;

            const style = document.createElement('style');
            style.innerHTML = `
                td[contenteditable]:empty::before { content: attr(placeholder); color: #aaa; font-style: italic; }
                #sn-med-table { table-layout: fixed; width: 100%; border-collapse: collapse; }
                #sn-med-table td, #sn-med-table th { word-wrap: break-word; overflow-wrap: break-word; }
            `;
            mw.appendChild(style);

            const scrapedSSN = Scraper.getSidebarData().ssn || '--';
            const clientName = w.querySelector('#sn-cl-name').innerText || 'Client';

            const headerData = Scraper.getHeaderData();
            // Use data from ClientNote memory (which might be saved or scraped)
            const medProviderText = this.medProvider || headerData['Medical Provider'] || '';
            const assistiveDeviceText = this.assistiveDevice || headerData['Assistive Device'] || '';
            const conditionText = this.condition || headerData['Condition'] || '';

            mw.innerHTML += `
                <div class="sn-header" style="background:#ddd; padding:5px; display:flex; align-items:center; cursor:move; border-bottom:1px solid #ccc;">
                    <span style="font-weight:bold; margin-right:auto;">Medical Providers Table</span>
                    <button id="sn-med-close-btn" style="border:none; background:none; cursor:pointer; font-size:14px; font-weight:bold;">×</button>
                </div>
                <div style="display:flex; flex-grow:1; overflow:hidden;">
                    <div id="sn-med-left" style="width:30%; display:flex; flex-direction:column; border-right:1px solid #ccc; background:#fff; flex-shrink:0; font-size:inherit;">
                        <div style="padding:10px; overflow-y:auto; flex-grow:1; display:flex; flex-direction:column; gap:8px;">
                            <div style="display:flex; justify-content:space-between; align-items:center; font-weight:bold; border-bottom:1px solid #eee; padding-bottom:5px; margin-bottom: 5px;">
                                <span>Medical Information</span>
                                <div style="display:flex; align-items:center;">
                                    <button id="sn-med-font-dec" style="cursor:pointer; border:1px solid #999; background:#eee; width:20px; border-radius:3px; margin-right:2px; font-weight:normal;">-</button>
                                    <button id="sn-med-font-inc" style="cursor:pointer; border:1px solid #999; background:#eee; width:20px; border-radius:3px; font-weight:normal;">+</button>
                                </div>
                            </div>
                            <div><label style="font-weight:bold; font-size:11px; color:#555; display:block; margin-bottom:2px;">Medical Provider</label><textarea class="sn-med-textarea" data-field="Medical Provider" readonly style="width:100%; height: 80px; resize:vertical; border:1px solid #ccc; padding:4px; background:#f9f9f9; font-family:inherit; font-size:inherit;">${medProviderText}</textarea></div>
                            <div><label style="font-weight:bold; font-size:11px; color:#555; display:block; margin-bottom:2px;">Assistive Device</label><textarea class="sn-med-textarea" data-field="Assistive Device" readonly style="width:100%; height: 40px; resize:vertical; border:1px solid #ccc; padding:4px; background:#f9f9f9; font-family:inherit; font-size:inherit;">${assistiveDeviceText}</textarea></div>
                            <div><label style="font-weight:bold; font-size:11px; color:#555; display:block; margin-bottom:2px;">Condition</label><textarea class="sn-med-textarea" data-field="Condition" readonly style="width:100%; height: 40px; resize:vertical; border:1px solid #ccc; padding:4px; background:#f9f9f9; font-family:inherit; font-size:inherit;">${conditionText}</textarea></div>
                        </div>
                    </div>
                    <div id="sn-med-partition" style="width:5px; cursor:col-resize; background:#f0f0f0; border-left:1px solid #ddd; border-right:1px solid #ddd; flex-shrink:0;"></div>
                    <div style="flex-grow:1; display:flex; flex-direction:column; background:#fff; min-width:200px; overflow:hidden;">
                        <div style="padding:8px; border-bottom:1px solid #eee; text-align:center; flex-shrink:0;">
                            <span style="font-size:14px; font-weight:bold; color:#333;">Client: ${clientName}</span>
                            <span style="margin:0 10px; color:#ccc;">|</span>
                            <span style="font-size:14px; font-weight:bold; color:#333;">SSN: ${scrapedSSN}</span>
                        </div>
                        <div style="flex-grow:1; padding:10px; overflow-y:auto;">
                            <table id="sn-med-table" style="font-size:inherit;"><colgroup><col style="width:auto;"><col style="width:auto;"><col style="width:120px;"><col style="width:100px;"><col style="width:100px;"></colgroup><thead><tr style="background:#eee; text-align:left;"><th style="border:1px solid #ccc; padding:4px;">Dr/Facilities</th><th style="border:1px solid #ccc; padding:4px;">Address</th><th style="border:1px solid #ccc; padding:4px;">Phone</th><th style="border:1px solid #ccc; padding:4px;">Last Visit</th><th style="border:1px solid #ccc; padding:4px;">First Visit</th></tr></thead><tbody>${[1,2,3].map(() => `<tr><td contenteditable="true" placeholder="Facilities / Doctor" style="border:1px solid #ccc; padding:4px;"></td><td contenteditable="true" style="border:1px solid #ccc; padding:4px;"></td><td contenteditable="true" style="border:1px solid #ccc; padding:4px;"></td><td contenteditable="true" style="border:1px solid #ccc; padding:4px;"></td><td contenteditable="true" style="border:1px solid #ccc; padding:4px;"></td></tr>`).join('')}</tbody></table>
                            <div style="padding-top:10px; text-align:center;"><button style="padding:5px 15px; cursor:pointer; font-weight:bold;">📄 Generate PDF</button></div>
                        </div>
                    </div>
                </div>
                <div class="sn-resizer rs-n"></div><div class="sn-resizer rs-s"></div><div class="sn-resizer rs-e"></div><div class="sn-resizer rs-w"></div><div class="sn-resizer rs-ne"></div><div class="sn-resizer rs-nw"></div><div class="sn-resizer rs-se"></div><div class="sn-resizer rs-sw"></div>
            `;
            document.body.appendChild(mw);
            Windows.setup(mw, null, mw.querySelector('.sn-header'), 'MED');
            
            Windows.bringToFront(mw);

            mw.querySelector('#sn-med-close-btn').onclick = () => mw.remove();

            mw.querySelectorAll('.sn-med-textarea').forEach(inp => {
                inp.ondblclick = () => { inp.removeAttribute('readonly'); inp.style.background = '#fff'; inp.style.border = '1px solid #009688'; inp.focus(); };
                inp.onblur = () => { inp.setAttribute('readonly', true); inp.style.background = '#f9f9f9'; inp.style.border = '1px solid #ccc'; };
                inp.oninput = () => {
                    const field = inp.getAttribute('data-field');
                    if (field === 'Medical Provider') this.medProvider = inp.value;
                    if (field === 'Assistive Device') this.assistiveDevice = inp.value;
                    if (field === 'Condition') this.condition = inp.value;
                    // Trigger save in ClientNote (which listens for inputs on 'w', but this is a separate window, so we might need to manually trigger save or rely on close)
                    // Ideally, we update the main state. For now, we update the memory vars which get saved when ClientNote saves.
                    // To be safe, let's trigger a save on the main window if possible, or just wait.
                    // Better: Update the variables, and if the main window is open, trigger its save.
                    const cn = document.getElementById('sn-client-note');
                    if(cn) cn.dispatchEvent(new Event('input')); 
                };
            });

            const medPart = mw.querySelector('#sn-med-partition');
            const leftPanel = mw.querySelector('#sn-med-left');
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
        }
    };

    // ==========================================
    // 5. CONTACT FORMS MODULE
    // ==========================================
    const ContactForms = {
        formConfigs: {
            'FO': {
                title: 'FO Contact',
                body: `
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
                    </div>`
            },
            'DDS': {
                title: 'DDS Contact',
                body: `
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
                    </div>`
            }
        },

        create(type) {
            const id = type === 'FO' ? 'sn-fo-form' : 'sn-dds-form';
            if (document.getElementById(id)) { Windows.toggle(id); return; }

            const config = this.formConfigs[type];
            if (!config) return;

            const sidebarData = Scraper.getSidebarData();
            const clientName = sidebarData.name || "Unknown";
            const defPos = GM_getValue('def_pos_' + type, { width: '500px', height: 'auto', top: '350px', left: '20px' });

            const w = document.createElement('div');
            w.id = id; w.className = 'sn-window';
            w.style.width = defPos.width; w.style.height = defPos.height;
            w.style.top = defPos.top; w.style.left = defPos.left;
            w.style.backgroundColor = '#e0f2f1'; w.style.border = '1px solid #009688';

            w.innerHTML = `
                <div class="sn-header" id="sn-${type.toLowerCase()}-header" style="background:#b2dfdb; border-bottom:1px solid #80cbc4;">
                    <div style="display:flex; align-items:center; gap:5px;">
                         <button id="sn-${type.toLowerCase()}-min" style="cursor:pointer; background:none; border:none; font-weight:bold;">_</button>
                         <span style="font-weight:bold; color:#004d40;">${config.title} - ${clientName}</span>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span id="${type.toLowerCase()}-undo" style="display:none; cursor:pointer; font-size:11px; font-weight:bold; color:#444;">UNDO</span>
                        <span id="${type.toLowerCase()}-clear" style="cursor:pointer; font-size:11px; font-weight:bold; color:#004d40;">CLEAR</span>
                        <button id="sn-${type.toLowerCase()}-close" style="background:none; border:none; font-weight:bold; cursor:pointer; font-size:14px; margin-left:5px;">X</button>
                    </div>
                </div>
                ${config.body}
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

            // Add type-specific event handlers
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
    // 6. SSD FORM VIEWER
    // ==========================================
    const SSDFormViewer = {
        async toggle() {
            const id = 'sn-ssd-viewer'; 
            const existing = document.getElementById(id);
            const clientId = AppObserver.getClientId();

            const scrapeAndSave = async () => {
                if (!clientId) return;
                
                const contentDiv = document.getElementById('ssd-content');
                if (contentDiv) contentDiv.innerHTML = '<div style="padding:20px; text-align:center; color:#e65100;">⏳ Switching tabs & scraping...</div>';

                const data = await Scraper.getFullSSDData();

                // SAFETY CHECK: Don't save if data is empty (page loading/rendering)
                // We check if at least one key field has content
                const hasContent = Object.values(data).some(val => val && val.trim().length > 0);
                if (!hasContent) {
                    console.warn("[SSDFormViewer] ⚠️ Scraper found no data. Skipping save to prevent overwrite.");
                    return;
                }

                this.renderContent(existing || document.getElementById(id), data); // Re-render viewer content
                ClientNote.updateAndSaveData(clientId, data); // Save data to persistent storage
            };
            
            // If window exists, just refresh data and ensure visible
            if (existing) {
                if (existing.style.display === 'none') Windows.toggle(id);
                await scrapeAndSave();
                return;
            }

            const w = document.createElement('div');
            w.id = id; w.className = 'sn-window';
            // Fixed size, no resize needed per request
            w.style.width = '400px'; w.style.height = 'auto'; w.style.maxHeight = '600px';
            w.style.top = '100px'; w.style.left = '100px';
            w.style.backgroundColor = '#fff3e0'; w.style.border = '1px solid #ef6c00';

            w.innerHTML = `
                <div class="sn-header" style="background:#ffe0b2; border-bottom:1px solid #ef6c00; color:#e65100;">
                    <span style="font-weight:bold;">SSD App Form Data</span>
                    <button id="ssd-close" style="background:none; border:none; color:#e65100; cursor:pointer; font-weight:bold;">X</button>
                </div>
                <div id="ssd-content" style="padding:10px; overflow-y:auto; flex-grow:1; background:#fff; min-height:200px;">
                    <!-- Content injected via renderContent -->
                </div>
                <div style="padding:8px; border-top:1px solid #ffe0b2; text-align:center; background:#fff3e0;">
                    <button id="ssd-copy" style="padding:5px 10px; cursor:pointer; font-weight:bold; color:#e65100; border:1px solid #ef6c00; background:white;">Copy All JSON</button>
                </div>
            `;

            document.body.appendChild(w);
            // Setup without resizers or minimize button
            Windows.makeDraggable(w, w.querySelector('.sn-header'));
            
            await scrapeAndSave();

            w.querySelector('#ssd-close').onclick = () => w.remove();
            w.querySelector('#ssd-copy').onclick = () => {
                const saved = GM_getValue('cn_form_data_' + clientId, {});
                GM_setClipboard(JSON.stringify(saved, null, 2));
                alert('Copied to clipboard!');
            };
        },

        renderContent(w, data) {
            if (!w) return;
            const container = w.querySelector('#ssd-content');
            let rows = '';
            
            // Define preferred order
            const order = ['Address', 'Phone', 'Email', 'POB', 'Parents', 'Witness', 'Condition', 'Assistive Devices', 'Medical Provider'];
            
            // Sort keys based on preferred order, then others
            const sortedKeys = Object.keys(data).sort((a, b) => {
                const idxA = order.indexOf(a);
                const idxB = order.indexOf(b);
                if (idxA !== -1 && idxB !== -1) return idxA - idxB;
                if (idxA !== -1) return -1;
                if (idxB !== -1) return 1;
                return a.localeCompare(b);
            });

            for (const key of sortedKeys) {
                const val = data[key];
                if (!val) continue; // Skip empty fields to keep it clean
                rows += `<div style="display:flex; border-bottom:1px solid #ffe0b2; padding:4px;">
                    <strong style="width:120px; color:#e65100; font-size:11px; flex-shrink:0;">${key}:</strong>
                    <span style="flex-grow:1; font-size:11px; word-break:break-word; white-space:pre-wrap;">${val}</span>
                </div>`;
            }
            
            container.innerHTML = rows || '<div style="padding:10px; text-align:center; color:#999;">No relevant data found on this page.</div>';
        }
    };

    // ==========================================
    // 6. DASHBOARD MODULE
    // ==========================================
    const Dashboard = {
        activeTab: 'recent',
        _dataCache: [],

        _loadData() {
            const keys = GM_listValues().filter(k => k.startsWith('cn_') && !k.startsWith('cn_color') && !k.startsWith('cn_form'));
            this._dataCache = keys.map(k => {
                const d = GM_getValue(k);
                if (d && typeof d === 'object') {
                    return { id: k.replace('cn_', ''), ...d };
                }
                return null;
            }).filter(Boolean); // Filter out any null values from failed reads
        },

        toggle() {
            if (Windows.toggle('sn-dashboard')) {
                const el = document.getElementById('sn-dashboard');
                if (el.style.display !== 'none') { this._loadData(); this.renderList(); el.querySelector('#dash-search').focus(); }
                return;
            }

            const w = document.createElement('div');
            w.id = 'sn-dashboard'; w.className = 'sn-window';
            w.style.width = '450px'; w.style.height = '600px'; // Default size
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
                        <div id="tab-revisit" class="sn-dash-tab">Revisit</div>
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
                this.renderSearchResults();
            };

            w.querySelector('#tab-revisit').onclick = () => { this.activeTab = 'revisit'; this.updateSidebar(); this.renderList(); };
            w.querySelector('#tab-recent').onclick = () => { this.activeTab = 'recent'; this.updateSidebar(); this.renderList(); };

            w.querySelector('#dash-export').onclick = () => { const data={}; GM_listValues().forEach(k => data[k] = GM_getValue(k)); GM_setClipboard(JSON.stringify(data)); alert("Data copied!"); };
            w.querySelector('#dash-import').onclick = () => { const i = prompt("Paste JSON:"); if(i) { try { const d = JSON.parse(i); Object.keys(d).forEach(k => GM_setValue(k, d[k])); alert("Done. Reload."); } catch(e) { alert("Invalid."); } } };
            w.querySelector('#dash-reset').onclick = () => { if(confirm("Reset defaults?")) { GM_setValue('def_pos_CN', null); GM_setValue('def_pos_FO', null); GM_setValue('def_pos_DDS', null); alert("Reset."); } };

            this._loadData();
            this.updateSidebar();
            this.renderList();
        },

        updateSidebar() {
            const w = document.getElementById('sn-dashboard');
            if (!w) return;
            w.querySelectorAll('.sn-dash-tab').forEach(t => t.classList.remove('active'));
            w.querySelector(`#tab-${this.activeTab}`).classList.add('active');
        },

        renderList() {
            const w = document.getElementById('sn-dashboard');
            if (!w) return;
            const container = w.querySelector('#dash-content');
            container.innerHTML = '';

            let items = [...this._dataCache];

            if (this.activeTab === 'revisit') {
                 items = items.filter(i => i.revisitActive).sort((a,b) => {
                     if (a.revisit && b.revisit) return new Date(a.revisit) - new Date(b.revisit);
                     return (b.timestamp || 0) - (a.timestamp || 0);
                 });
            } else {
                 items = items.sort((a,b) => (b.timestamp || 0) - (a.timestamp || 0));
            }

            if (items.length === 0) {
                const msg = this.activeTab === 'revisit' ? 'No Revisit cases.' : 'No Recent history.';
                container.innerHTML = `<div style="text-align:center; color:#888; margin-top:20px;">${msg}</div>`;
            } else {
                items.slice(0, 50).forEach(item => this.createRow(container, item));
            }
        },

        renderSearchResults() {
            const w = document.getElementById('sn-dashboard');
            if (!w) return;
            const container = w.querySelector('#dash-content');
            const query = w.querySelector('#dash-search').value.toLowerCase();
            container.innerHTML = '';
            const items = this._dataCache.filter(i => i.name && i.name.toLowerCase().includes(query));

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
    // 7. MAIL RESOLVE MODULE
    // ==========================================
    const MailResolve = {
        btn: null,

        init() {
            if (window.location.href.includes('kdlaw__Mail_Log__c')) {
                this.createButton();
            } else {
                this.removeButton();
            }
        },

        createButton() {
            if (this.btn) return;
            this.btn = document.createElement('button');
            this.btn.innerHTML = '✓';
            this.btn.title = 'Resolve Mail Log (Alt+M)';
            this.btn.style.cssText = `
                position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
                width: 60px; height: 60px; border-radius: 50%;
                background: white; border: 3px solid #009688; color: #009688;
                font-size: 30px; font-weight: bold; cursor: pointer;
                z-index: 999999; display: flex; align-items: center; justify-content: center;
                box-shadow: 0 4px 15px rgba(0,0,0,0.3); transition: all 0.3s ease;
            `;
            this.btn.onclick = () => this.run();
            document.body.appendChild(this.btn);
        },

        removeButton() {
            if (this.btn) {
                this.btn.remove();
                this.btn = null;
            }
        },

        async run() {
            if (!window.location.href.includes('kdlaw__Mail_Log__c')) return;

            if (this.btn) {
                this.btn.innerHTML = '⏳';
                this.btn.style.cursor = 'wait';
            }

            console.time("KD-UltraSpeed");

            const findDeep = (selector, root = document) => {
                let el = root.querySelector(selector);
                if (el) return el;
                const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null, false);
                let node = walker.nextNode();
                while (node) {
                    if (node.shadowRoot) {
                        const found = findDeep(selector, node.shadowRoot);
                        if (found) return found;
                    }
                    node = walker.nextNode();
                }
                return null;
            };

            const fastWait = async (selector, root = document) => {
                return new Promise(resolve => {
                    const interval = setInterval(() => {
                        const found = root.querySelector(selector) || findDeep(selector, root);
                        if (found) {
                            clearInterval(interval);
                            resolve(found);
                        }
                    }, 50);
                    setTimeout(() => { clearInterval(interval); resolve(null); }, 2000);
                });
            };

            const tasks = [
                { label: "Addressed To", value: "KD" },
                { label: "Direction", value: "Incoming" },
                { label: "Method", value: "US Mail" },
                { label: "Resolved", value: "Yes" }
            ];

            const pencil = findDeep('button[title*="Edit Addressed To"]');
            if (pencil) {
                pencil.click();
                await new Promise(r => setTimeout(r, 300)); // Wait for modal
            }

            for (const task of tasks) {
                const btn = await fastWait(`button[aria-label="${task.label}"]`);
                if (!btn || btn.innerText.includes(task.value)) continue;

                btn.click();
                const listboxId = btn.getAttribute('aria-controls');
                if (listboxId) {
                    const listbox = await fastWait(`#${listboxId}`);
                    if (listbox) {
                        const options = listbox.querySelectorAll('lightning-base-combobox-item');
                        const target = Array.from(options).find(opt => opt.innerText.includes(task.value));
                        if (target) {
                            target.click();
                            await new Promise(r => setTimeout(r, 100)); // Debounce
                        }
                    }
                }
            }

            const save = await fastWait('button[name="SaveEdit"]');
            if (save) save.click();

            console.timeEnd("KD-UltraSpeed");

            if (this.btn) {
                this.btn.innerHTML = '✓';
                this.btn.style.background = '#e0f2f1';
                this.btn.style.borderColor = '#4caf50';
                this.btn.style.color = '#4caf50';
                this.btn.style.cursor = 'default';
            }
        }
    };

    // ==========================================
    // 7.5. TASK AUTOMATION MODULE
    // ==========================================
    const TaskAutomation = {
        delay: ms => new Promise(res => setTimeout(res, ms)),

        queryDeep(selector, root = document) {
            let el = root.querySelector(selector);
            if (el) return el;
            // Optimized: Use TreeWalker instead of querySelectorAll('*') for performance
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null, false);
            let node = walker.nextNode();
            while (node) {
                if (node.shadowRoot) {
                    el = this.queryDeep(selector, node.shadowRoot);
                    if (el) return el;
                }
                node = walker.nextNode();
            }
            return null;
        },

        queryAllDeep(selector, root = document) {
            let els = Array.from(root.querySelectorAll(selector));
            // Optimized: Use TreeWalker
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null, false);
            let node = walker.nextNode();
            while (node) {
                if (node.shadowRoot) {
                    els = els.concat(this.queryAllDeep(selector, node.shadowRoot));
                }
                node = walker.nextNode();
            }
            return els;
        },

        findDeepIframe(root = document) {
            const iframes = this.queryAllDeep('iframe', root);
            for (let img of iframes) {
                if (img.classList.contains('cke_wysiwyg_frame') || img.title === "Email Body") {
                    return img;
                }
                try {
                    const subFrame = this.findDeepIframe(img.contentDocument || img.contentWindow.document);
                    if (subFrame) return subFrame;
                } catch (e) { /* Cross-origin */ }
            }
            return null;
        },

        async waitForElement(selector, maxWait = 10000) {
            let elapsed = 0;
            while (elapsed < maxWait) {
                let el = this.queryDeep(selector);
                if (el) return el;
                await this.delay(100);
                elapsed += 100;
            }
            return null;
        },

        async runNCL(clientId) {
            console.log("🚀 Starting NCL Automation...");
            try {
                // Step 0: Pre-warm (Open and Close Task Modal) to fix DOM cold-start issues
                console.log("Step 0: Pre-warming Task Modal...");
                const preWarmBtn = await this.waitForElement('button[title="New Task"]');
                if (preWarmBtn) {
                    preWarmBtn.click();
                    // Wait for modal to appear (Subject input is a good proxy)
                    const dummySubject = await this.waitForElement('input[aria-label="Subject"]', 2000);
                    if (dummySubject) {
                        console.log("   -> Modal opened. Closing...");
                        // Find close button (top right X)
                        const closeBtn = this.queryDeep('button[title="Close"]');
                        if (closeBtn) {
                            closeBtn.click();
                            await this.delay(800); // Allow animation to finish
                        }
                    }
                }

                // Step 1: Click "New Task"
                console.log("Step 1: Waiting for New Task button...");
                const newTaskBtn = await this.waitForElement('button[title="New Task"]');
                if (!newTaskBtn) throw new Error("Could not find 'New Task' button.");
                newTaskBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

                // Step 2: Set Subject 
                console.log("Step 2: Waiting for Subject input to render...");
                const subjectInput = await this.waitForElement('input[aria-label="Subject"]');
                if (!subjectInput) throw new Error("Could not find Subject input.");
                
                subjectInput.focus();
                subjectInput.click();
                subjectInput.value = "Rose Letter 01 - NC to Client";
                subjectInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                subjectInput.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
                await this.delay(50); 

                // Step 3: Set Due Date
                console.log("Step 3: Setting Due Date...");
                const todayStr = new Date().toLocaleDateString('en-US'); 
                let dateInput = null;
                
                const allLabels = this.queryAllDeep('label');
                const dateLabel = allLabels.find(l => l.textContent && l.textContent.trim() === 'Due Date');
                
                if (dateLabel) {
                    const inputId = dateLabel.getAttribute('for');
                    if (inputId) {
                        const rootNode = dateLabel.getRootNode();
                        dateInput = rootNode.querySelector(`[id="${inputId}"]`);
                    }
                }
                
                if (!dateInput) {
                    console.log("⚠️ Label matching failed, falling back to datepicker query...");
                    dateInput = this.queryDeep('lightning-datepicker input');
                }

                if (dateInput) {
                    dateInput.value = todayStr;
                    dateInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                    dateInput.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
                } else {
                    console.log("⚠️ Could not find Due Date input.");
                }
                await this.delay(50); 

                // Step 4: Reassign to Rose Robot
                console.log("Step 4: Reassigning to Rose...");
                let clearAssigneeBtn = null;
                
                const allAssistiveTexts = this.queryAllDeep('.assistiveText');
                const assignedToLabel = allAssistiveTexts.find(el => el.textContent && el.textContent.includes('Assigned To'));
                
                if (assignedToLabel) {
                    clearAssigneeBtn = assignedToLabel.parentElement.querySelector('a.deleteAction');
                } else {
                    const allPills = this.queryAllDeep('.uiPillContainer');
                    const userPillContainer = allPills.find(el => el.textContent && el.textContent.includes('Assigned To'));
                    if (userPillContainer) {
                        clearAssigneeBtn = userPillContainer.querySelector('a.deleteAction');
                    }
                }

                if (clearAssigneeBtn) {
                    clearAssigneeBtn.click();
                    await this.delay(50); 
                }

                const assignInputs = this.queryAllDeep('input').filter(el => 
                    (el.title && el.title.includes('Search Users')) || 
                    (el.placeholder && el.placeholder.includes('Search Users')) ||
                    (el.title && el.title.includes('Search People'))
                );
                
                const assignInput = assignInputs.length > 0 ? assignInputs[0] : this.queryDeep('input.uiInputTextForAutocomplete');
                if (!assignInput) throw new Error("Could not find 'Assigned To' search input after clearing pill.");
                
                assignInput.focus();
                assignInput.click();
                assignInput.value = "Rose";
                assignInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                
                await this.delay(300); 

                const userOptions = this.queryAllDeep('a[role="option"]');
                const roseRobotOption = userOptions.find(el => {
                    const hasRose = el.querySelector('[title="Rose Robot"]');
                    const hasCM1 = el.querySelector('[title="CM 1"]');
                    return hasRose && hasCM1;
                });
                
                if (roseRobotOption) {
                    console.log("✅ Found Rose Robot with CM 1 subtitle. Clicking...");
                    roseRobotOption.click();
                } else {
                    console.log("⚠️ Could not find 'Rose Robot' with 'CM 1' in the search results.");
                }

                // Step 5: Halt for Manual Save
                console.log("Step 5: Halting before Save...");
                console.log("✅ Automation paused. Please review the inputs and manually click the 'Save' button.");
                
                // Step 6: Wait for Modal Close (User Save) then Email
                console.log("⏳ Waiting for Task Modal to close before sending email...");
                // Poll until modal is gone
                while (this.queryDeep('div.modal-container.slds-modal__container') || this.queryDeep('div.slds-modal__container')) {
                    await this.delay(500);
                }

                console.log("✅ Modal closed. Waiting 1000ms...");
                await this.delay(1000);
                await this.runEmail(clientId);

            } catch (error) {
                console.error("❌ " + error.message);
                alert("❌ Automation Error: " + error.message);
            }
        },

        async runEmail(clientId) {
            console.log("🚀 Starting Email Automation...");
            try {
                // Data Prep
                const formData = GM_getValue('cn_form_data_' + clientId, {});
                const clientData = GM_getValue('cn_' + clientId, {});
                const emailAddr = formData['Email'] || '';
                const clientName = clientData.name || 'Client';

                if (!emailAddr) console.warn("⚠️ No email address found in scraped data.");

                // Step 1: Open Email
                console.log("Step 1: Clicking Email button...");
                const emailBtn = await this.waitForElement('button[title="Email"][value="SendEmail"]');
                if (!emailBtn) throw new Error("Could not find 'Email' button.");
                emailBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                await this.delay(2000); 

                // Step 2: Clear BCC
                console.log("Step 2: Clearing BCC field...");
                const bccList = this.queryDeep('ul[aria-label="Bcc"]');
                if (bccList) {
                    const bccDeletes = this.queryAllDeep('.deleteAction, .slds-pill__remove, button[title="Remove"]', bccList);
                    for (let btn of bccDeletes) {
                        btn.click();
                        await this.delay(300);
                    }
                }

                // Step 3: Fill "To"
                console.log("Step 3: Populating 'To' field...");
                const toList = this.queryDeep('ul[aria-label="To"]');
                if (toList && emailAddr) {
                    const toInput = this.queryDeep('input', toList);
                    if (toInput) {
                        toInput.focus();
                        toInput.value = emailAddr;
                        toInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                        await this.delay(300);
                        toInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, composed: true }));
                    }
                }

                // Step 4: Fill Subject
                console.log("Step 4: Populating Subject...");
                const subjectInput = this.queryDeep('input[placeholder*="Subject"], input[aria-label="Subject"]');
                if (subjectInput) {
                    subjectInput.focus();
                    subjectInput.value = "Message from your SSD Case Manager";
                    subjectInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                }

                // Step 5: Fill Body
                console.log("Step 5: Injecting Body...");
                
                // --- Dynamic User Data ---
                const cmName = GM_getValue('sn_global_cm1', 'Kant Nguyen');
                const cmExt = GM_getValue('sn_global_ext', '1072');
                const cmPhone = `(214) 271-4027${cmExt ? ' Ext. ' + cmExt : ''}`;
                let cmEmail = 'casemanager@kirkendalldwyer.com';

                // Scrape Email from "From" dropdown
                try {
                    const fromLinks = this.queryAllDeep('a.select');
                    const fromLink = fromLinks.find(el => el.innerText && el.innerText.includes('@') && el.innerText.includes('<'));
                    if (fromLink) {
                        const match = fromLink.innerText.match(/<([^>]+)>/);
                        if (match) cmEmail = match[1];
                    }
                } catch(e) { console.log("Email scrape failed", e); }
                // -------------------------

                const iframe = this.findDeepIframe();
                if (iframe) {
                    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                    const editorBody = iframeDoc.querySelector('body');
                    if (editorBody) {
                        editorBody.innerHTML = `
                            <p>Dear ${clientName},</p>
                            <p>This is a message from Kirkendall Dwyer - Social Security Division.</p>
                            <p>Please contact our office as soon as possible at ${cmPhone} to discuss an important matter regarding your claim.</p>
                            <p>Thank you.</p>
                            <br>
                            <p>${cmName}<br>Case Manager I<br>Kirkendall Dwyer LLP<br>T: ${cmPhone}<br>F: 214.292.6581<br>E: ${cmEmail}<br>4343 Sigma Rd. Suite 200, Dallas, TX 75244</p>
                            <p style="font-size:10px; color:gray;">Confidentiality Notice: The information contained in this e-mail and any attachments to it may be legally privileged and include confidential information intended only for the recipient(s) identified above. If you are not one of those intended recipients, you are hereby notified that any dissemination, distribution or copying of this e-mail or its attachments is strictly prohibited. If you have received this e-mail in error, please notify the sender of that fact by return e-mail and permanently delete the e-mail and any attachments to it immediately. Please do not retain, copy or use this e-mail or its attachments for any purpose, nor disclose all or any part of its contents to any other person. Thank you.</p>
                        `;
                        editorBody.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                }
            } catch (e) { console.error("Email Auto Error:", e); }
        }
    };

    // ==========================================
    // 8. MAIN INITIALIZATION & OBSERVER
    // ==========================================
    const AppObserver = {
        activeClientId: null, // Tracks the currently loaded record
        loadTimer: null,
        lastUrl: window.location.href,

        // --- Universal Client ID Extractor & Converter ---
        _to18CharId(id15) {
            if (!id15 || id15.length !== 15) return id15;
            let suffix = '';
            const charMap = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ012345';
            for (let i = 0; i < 3; i++) {
                let flags = 0;
                for (let j = 0; j < 5; j++) {
                    const char = id15.charAt(i * 5 + j);
                    if (char >= 'A' && char <= 'Z') {
                        flags += 1 << j;
                    }
                }
                suffix += charMap.charAt(flags);
            }
            return id15 + suffix;
        },

        getClientId() {
            let id = null;
            const href = window.location.href;

            // 1. Check Standard Lightning URL
            const sfMatch = href.match(/kdlaw__Matter__c\/([a-zA-Z0-9]{15,18})/);
            if (sfMatch && sfMatch[1]) {
                id = sfMatch[1];
            }
            // 2. Check Form URL (recordid parameter)
            else if (href.includes('recordid=')) {
                const match = href.match(/[?&]recordid=([a-zA-Z0-9]{15,18})/);
                if (match) id = match[1];
            }

            if (!id) return null;

            // 3. Normalize to 18-char ID
            return this._to18CharId(id);
        },

        init() {
            if (document.getElementById('sn-taskbar')) return;
            this.buildTaskbar();

            // Optimized: Simple polling is more robust than History API patching for SPAs
            // It avoids race conditions and complexity with Salesforce's internal router.
            setInterval(() => {
                if (window.location.href !== this.lastUrl) {
                    this.lastUrl = window.location.href;
                    this.handleRecordLoad();
                }
            }, 500);

            // Initial load check
            this.handleRecordLoad();
        },

        buildTaskbar() {
            const taskbar = document.createElement('div');
            taskbar.id = 'sn-taskbar';
            taskbar.innerHTML = `
                <div class="sn-version-label"></div>
                <div class="sn-center-group">
                    <button id="tab-sn-client-note" class="sn-tb-btn">Client Note</button>
                    <button id="tab-sn-fo-form" class="sn-tb-btn">FO Contact</button>
                    <button id="tab-sn-dds-form" class="sn-tb-btn">DDS Contact</button>
                    <button id="tab-sn-med-popout" class="sn-tb-btn">Med Prov</button>
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
            bind('tab-sn-med-popout', () => ClientNote.toggleMedWindow());

            // Keyboard Shortcuts
            window.addEventListener('keydown', e => {
                if (!e.altKey) return;
                if (e.code === 'KeyY') { e.preventDefault(); Dashboard.toggle(); }
                if (e.code === 'KeyQ') {
                    e.preventDefault();
                    ClientNote.toggleMedWindow();
                }
                if (e.code === 'KeyR') {
                    if (window.location.href.includes('/forms/s/')) {
                        e.preventDefault();
                        SSDFormViewer.toggle();
                    }
                }
                if (e.code === 'KeyM') {
                    e.preventDefault();
                    MailResolve.run();
                }

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
            if (this.loadTimer) clearTimeout(this.loadTimer);

            MailResolve.init();

            const clientId = this.getClientId();
            const isFormPage = window.location.href.includes('/forms/s/');

            if (clientId) {
                // If the ID matches the already active ID, do absolutely nothing.
                if (this.activeClientId === clientId) {
                    return;
                }

                // If we navigated to a DIFFERENT client, destroy the old notes so fresh ones open
                if (this.activeClientId && this.activeClientId !== clientId) {
                    const oldNote = document.getElementById('sn-client-note');
                    if (oldNote) {
                        ClientNote.destroy(this.activeClientId);
                        Windows.updateTabState('sn-client-note');
                    }
                }

                this.activeClientId = clientId;

                // Auto-load if data exists in local storage
                if (GM_getValue('cn_' + clientId)) {
                    // Slight delay to allow SF DOM to populate text nodes for the scraper
                    this.loadTimer = setTimeout(() => {
                        const btn = document.getElementById('tab-sn-client-note');
                        if(btn) btn.classList.add('active');

                        // Ensure we only create if it isn't already open
                        if (!document.getElementById('sn-client-note') && !isFormPage) {
                            ClientNote.create(clientId);
                        }
                    }, 500);
                }
                ClientNote.checkStoredData(clientId);
            } else {
                // Not on a Matter or Form page (Dashboard, History, etc.)
                // Force cleanup of all windows
                ClientNote.destroy(this.activeClientId);
                this.activeClientId = null;

                const w = document.getElementById('sn-client-note');
                if (w) w.remove();
                const mw = document.getElementById('sn-med-popout');
                if (mw) { mw.remove(); Windows.updateTabState('sn-med-popout'); }
                
                // Reset buttons
                document.querySelectorAll('.sn-tb-btn').forEach(b => b.classList.remove('sn-has-data'));
            }
        }
    };

    AppObserver.init();

})();