(function(app) {
    'use strict';

    // ==========================================
    // 0. NAMESPACE SETUP
    // ==========================================
    app.Core = app.Core || {};
    app.Features = app.Features || {};
    app.Tools = app.Tools || {};
    app.Automation = app.Automation || {};

    // ==========================================
    // 1. CSS STYLES
    // ==========================================
    const Styles = {
        init() {
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
        }
    };

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
                    app.Core.Windows.bringToFront(el);

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

    // Assign to the namespace
    app.Core = {
        Styles,
        Scraper,
        Windows,
        SSADataManager
    };

})(window.CM_App = window.CM_App || {});