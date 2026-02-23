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
    const Themes = {
        'Red': { primary: '#e57373', dark: '#c62828', text: '#b71c1c', light: '#ffcdd2', lighter: '#ffebee', border: '#e57373', card: '#ffffff', textMain: '#333333' },
        'Orange': { primary: '#ffb74d', dark: '#ef6c00', text: '#e65100', light: '#ffe0b2', lighter: '#fff3e0', border: '#ffb74d', card: '#ffffff', textMain: '#333333' },
        'Yellow': { primary: '#fff176', dark: '#f9a825', text: '#f57f17', light: '#fff9c4', lighter: '#fffde7', border: '#fff176', card: '#ffffff', textMain: '#333333' },
        'Green': { primary: '#81c784', dark: '#2e7d32', text: '#1b5e20', light: '#c8e6c9', lighter: '#e8f5e9', border: '#81c784', card: '#ffffff', textMain: '#333333' },
        'Teal': { primary: '#4db6ac', dark: '#00695c', text: '#004d40', light: '#b2dfdb', lighter: '#e0f2f1', border: '#4db6ac', card: '#ffffff', textMain: '#333333' },
        'Blue': { primary: '#64b5f6', dark: '#1565c0', text: '#0d47a1', light: '#bbdefb', lighter: '#e3f2fd', border: '#64b5f6', card: '#ffffff', textMain: '#333333' },
        'Purple': { primary: '#9575cd', dark: '#512da8', text: '#311b92', light: '#d1c4e9', lighter: '#ede7f6', border: '#9575cd', card: '#ffffff', textMain: '#333333' },
        'Pink': { primary: '#f06292', dark: '#ad1457', text: '#880e4f', light: '#f8bbd0', lighter: '#fce4ec', border: '#f06292', card: '#ffffff', textMain: '#333333' },
        'Brown': { primary: '#a1887f', dark: '#5d4037', text: '#3e2723', light: '#d7ccc8', lighter: '#efebe9', border: '#a1887f', card: '#ffffff', textMain: '#333333' },
        'Grey': { primary: '#90a4ae', dark: '#455a64', text: '#263238', light: '#cfd8dc', lighter: '#eceff1', border: '#90a4ae', card: '#ffffff', textMain: '#333333' }
    };

    const NoteThemes = {
        colors: {
            "EST": ["#ffe0b2", "#ffcc80"], "CST": ["#fff9c4", "#fff59d"], "MST": ["#c8e6c9", "#a5d6a7"], // East -> West
            "PST": ["#b2dfdb", "#80cbc4"], "AKST": ["#bbdefb", "#90caf9"], "HST": ["#e1bee7", "#ce93d8"]
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
        }
    };

    const Styles = {
        init() {
            this.applyTheme(GM_getValue('sn_ui_theme', 'Teal'));
            GM_addStyle(`
                :root {
                    --sn-primary: #009688;
                    --sn-primary-dark: #004d40;
                    --sn-primary-text: #00695c;
                    --sn-bg-light: #b2dfdb;
                    --sn-bg-lighter: #e0f2f1;
                    --sn-border: #009688;
                    --sn-bg-card: #ffffff;
                    --sn-text-main: #333333;
                }

                /* --- Taskbar --- */
                #sn-taskbar {
                    position: fixed; bottom: 0; left: 168px; right: 0; height: 40px;
                    background: var(--sn-bg-lighter); border-top: 1px solid var(--sn-bg-light); z-index: 99999;
                    display: flex; align-items: center; justify-content: center;
                    box-shadow: 0 -2px 5px rgba(0,0,0,0.05); font-family: sans-serif; font-size: 13px;
                }

                /* Left Label */
                .sn-version-label {
                    position: absolute; left: 15px;
                    font-weight: bold; color: var(--sn-primary-text);
                    font-size: 12px; font-family: 'Segoe UI', sans-serif;
                    text-transform: uppercase; letter-spacing: 0.5px;
                    pointer-events: none;
                }

                /* Center Tabs */
                .sn-center-group { display: flex; gap: 10px; transform: translateX(-250px); }

                .sn-tb-btn {
                    width: 140px; padding: 4px 0; border: 1px solid var(--sn-bg-light); background: var(--sn-bg-card);
                    cursor: pointer; border-radius: 3px; font-weight: bold; color: var(--sn-primary-text); text-align: center;
                    opacity: 0.5; transition: all 0.2s; border-style: dashed; /* Ghosted by default */
                }
                .sn-tb-btn:hover { opacity: 0.8; background: #f0fdfc; }
                .sn-tb-btn.sn-has-data { opacity: 1.0; border-style: solid; border-bottom: 3px solid var(--sn-primary); } /* Solid if data */
                .sn-tb-btn.active { opacity: 1.0; background: var(--sn-bg-card); }
                .sn-tb-btn.focused { background: var(--sn-primary); color: white; border-color: var(--sn-primary-dark); opacity: 1.0; }

                /* Dashboard Button */
                #sn-dash-btn {
                    position: absolute; right: 8px; bottom: 5px; 
                    width: 38px; height: 38px; 
                    background: white; border: 1px solid #29b6f6; border-radius: 50%;
                    font-size: 25px; cursor: pointer;
                    display: flex; align-items: center; justify-content: center;
                    box-shadow: 0 0 10px #4fc3f7; 
                    transition: transform 0.2s, box-shadow 0.2s;
                    z-index: 100000;
                }
                #sn-dash-btn:hover { transform: scale(1.1); box-shadow: 0 0 15px #03a9f4; }

                /* --- Color Picker --- */
                .sn-cp-dropdown { position: relative; display: inline-block; margin-right: 5px; }
                .sn-cp-btn { cursor: pointer; font-size: 16px; background: none; border: none; }
                .sn-cp-content {
                    display: none; position: absolute; top: 20px; right: 0;
                    background-color: var(--sn-bg-card); border: 1px solid #ccc; padding: 5px;
                    box-shadow: 0 4px 8px rgba(0,0,0,0.2); z-index: 10002;
                    width: 110px; flex-wrap: wrap; gap: 2px;
                }
                .sn-cp-dropdown:hover .sn-cp-content { display: flex; }
                .sn-swatch { width: 20px; height: 20px; cursor: pointer; border: 1px solid #ddd; }
                .sn-swatch:hover { border-color: #000; transform: scale(1.1); }

                /* --- Windows --- */
                .sn-window {
                    position: fixed; border: 1px solid var(--sn-border);
                    box-shadow: 5px 5px 15px rgba(0,0,0,0.3); z-index: 10000;
                    display: flex; flex-direction: column;
                    min-width: 250px; min-height: 200px;
                    background: var(--sn-bg-lighter);
                    color: var(--sn-text-main);
                    transition: box-shadow 0.2s, border-color 0.2s;
                }
                .sn-saved-glow { box-shadow: 0 0 15px var(--sn-primary) !important; border-color: var(--sn-primary) !important; }
                .sn-header { padding: 6px 10px; cursor: move; user-select: none; display: flex; justify-content: space-between; align-items: center; }

                .sn-dds-blue { background-color: #0d47a1 !important; color: white !important; }
                .sn-dds-white { background-color: #e3f2fd !important; color: black !important; }

                /* --- Dashboard Specifics --- */
                .sn-dash-body { display: flex; flex-grow: 1; overflow: hidden; height: 100%; }
                .sn-dash-sidebar {
                    width: 40px; background: var(--sn-primary-text); display: flex; flex-direction: column; align-items: center; padding-top: 10px; gap: 10px;
                }
                .sn-dash-tab {
                    writing-mode: vertical-rl; text-orientation: mixed; transform: rotate(180deg);
                    padding: 15px 5px; color: var(--sn-bg-light); cursor: pointer; font-weight: normal; font-size: 14px;
                    border-left: 3px solid transparent; transition: all 0.2s; text-transform: uppercase;
                }
                .sn-dash-tab:hover { color: white; background: rgba(255,255,255,0.1); }
                .sn-dash-tab.active { color: white; border-left: 3px solid #29b6f6; background: rgba(255,255,255,0.2); }

                .sn-dash-list { flex-grow: 1; overflow-y: auto; padding: 10px; background: var(--sn-bg-lighter); }

                .sn-list-item {
                    padding: 8px; border-bottom: 1px solid var(--sn-bg-light); cursor: pointer;
                    display: flex; justify-content: space-between; align-items: center;
                    background: var(--sn-bg-card); margin-bottom: 5px; border-radius: 4px; border: 1px solid var(--sn-bg-light);
                    transition: transform 0.1s, box-shadow 0.1s, padding 0.2s, margin-bottom 0.2s;
                }
                .sn-list-item:hover { transform: translateX(2px); box-shadow: 2px 2px 5px rgba(0,0,0,0.1); }
                .sn-list-item.focused {
                    background: var(--sn-bg-light);
                    border-color: var(--sn-primary);
                }
                .sn-list-item.overdue {
                    border-left: 4px solid #e53935; /* Red alert color */
                    background: #fff3f3;
                }

                /* Compact Mode for Dashboard List */
                .sn-compact-mode .sn-list-item {
                    padding: 4px 8px;
                    margin-bottom: 2px;
                }
                .sn-compact-mode .sn-item-name { font-size: 12px; }
                .sn-compact-mode .sn-item-status { font-size: 10px; margin-top: 1px; }
                .sn-compact-mode .sn-item-right { font-size: 9px; }

                .sn-item-left { display: flex; flex-direction: column; }
                .sn-item-name { font-weight: bold; color: var(--sn-primary-dark); font-size: 13px; }
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

                /* --- Taskbar Counters --- */
                #sn-taskbar-counters {
                    position: absolute; right: 60px; display: flex; gap: 15px; align-items: center; height: 100%;
                    font-size: 11px; font-weight: bold; color: var(--sn-primary-text);
                }
                .sn-counter-item { display: flex; align-items: center; gap: 5px; cursor: default; }
                .sn-counter-urgent { color: #d32f2f; }

                #sn-dash-btn.sn-urgent {
                    border-color: #e53935 !important;
                    box-shadow: 0 0 20px #e53935 !important;
                    animation: sn-pulse-red 1.5s infinite;
                }
                @keyframes sn-pulse-red { 0% { box-shadow: 0 0 20px #e53935; transform: scale(1); } 50% { box-shadow: 0 0 40px #e53935; transform: scale(1.1); } 100% { box-shadow: 0 0 20px #e53935; transform: scale(1); } }
            `);
        },
        
        applyTheme(name) {
            const t = Themes[name] || Themes['Teal'];
            const root = document.documentElement;
            root.style.setProperty('--sn-primary', t.primary);
            root.style.setProperty('--sn-primary-dark', t.dark);
            root.style.setProperty('--sn-primary-text', t.text);
            root.style.setProperty('--sn-bg-light', t.light);
            root.style.setProperty('--sn-bg-lighter', t.lighter);
            root.style.setProperty('--sn-border', t.border);
            root.style.setProperty('--sn-bg-card', t.card || '#ffffff');
            root.style.setProperty('--sn-text-main', t.textMain || '#333333');
        }
    };

    // ==========================================
    // 2. SCRAPER MODULE
    // ==========================================
    const Scraper = {
        getHeaderData() {
            // Optimized: Extract Client Name directly from document title
            // Format: "[Client Name] | Matter | Salesforce"
            const title = document.title || "";
            const parts = title.split('|');
            const clientName = parts.length > 0 ? parts[0].trim() : "";
            return { clientName };
        },

        getAllPageData() {
            const apiMap = {
                "Last_CM1_Update_Attempt__c": "lastCm1Att",
                "Last_CM1_Update__c": "lastCm1Upd",
                "Last_ISU_Attempt__c": "lastStatusAtt",
                "Last_Initial_Status_Update__c": "lastStatusUpd",
                "kdlaw__Date_Filed_App__c": "ifd",
                "IR_Status_Date__c": "irStatusDate",
                "T2_App_Decision__c": "t2Dec",
                "T16_App_Decision__c": "t16Dec",
                "T2_IA_Decision_Date__c": "t2Date",
                "T16_IA_Decision_Date__c": "t16Date",
                "Decision_Date_App__c": "decDateApp",
                "IA_Appeal_SOL__c": "iaAppealSol",
                "Qualification_Date__c": "qualDate",
                "AOD__c": "aod",
                "DLI__c": "dli",
                "Blind_DLI__c": "blindDli",
                "ERE_Status__c": "ereStatus",
                "Date_File_Recon__c": "dateFileRecon",
                "Status": "Status",
                "Sub_Status": "Sub-status",
                "SS_Classification": "SS Classification"
            };

            const sidebarTargets = {
                "SSN": "ssn", "Social Security Number": "ssn",
                "DOB": "dob", "Date of Birth": "dob"
            };

            return this._scrapeRoot(document, apiMap, sidebarTargets);
        },

        _scrapeRoot(root, apiMap, sidebarTargets) {
            const results = {};
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null, false);
            let node = walker.nextNode();

            while (node) {
                if (node.shadowRoot) {
                    Object.assign(results, this._scrapeRoot(node.shadowRoot, apiMap, sidebarTargets));
                }

                if (node.hasAttribute('data-target-selection-name')) {
                    const targetName = node.getAttribute('data-target-selection-name');
                    for (const api in apiMap) {
                        if (targetName.includes(api)) {
                            const valEl = node.querySelector('lightning-formatted-text, lightning-formatted-date-time, .slds-form-element__static, span');
                            if (valEl) results[apiMap[api]] = valEl.innerText.trim();
                            break;
                        }
                    }
                }

                if (node.classList.contains('test-id__field-label')) {
                    const text = node.innerText.trim();
                    if (sidebarTargets[text] && node.getBoundingClientRect().width > 0) {
                        const container = node.closest('.slds-form-element');
                        if (container) {
                            const valEl = container.querySelector('lightning-formatted-text, .test-id__field-value, span[slot="outputField"], .slds-form-element__static');
                            if (valEl) results[sidebarTargets[text]] = valEl.innerText.trim();
                        }
                    }
                }
                node = walker.nextNode();
            }
            return results;
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
            if (phoneSet.size > 0) finalData['Phone'] = Array.from(phoneSet).map(p => Utils.formatPhoneNumber(p)).join(' || ');

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

                await new Promise(r => setTimeout(r, 200)); // Fast wait

                let data2 = this.getSSDFormData();
                const hasMed = data2['Medical Provider'] || data2['Assistive Devices'] || data2['Condition'];

                if (!hasMed) {
                    console.log("⚠️ Medical data empty. Retrying in 1000ms...");
                    await new Promise(r => setTimeout(r, 1000));
                    data2 = this.getSSDFormData();
                }

                if (GM_getValue('sn_ssd_autoclose', false)) {
                    setTimeout(() => window.close(), 1000);
                }
                return { ...data1, ...data2 };
            }
            return data1;
        }
    };

    // ==========================================
    // 2.5 UTILITIES
    // ==========================================
    const Utils = {
        formatPhoneNumber(phoneStr) {
            if (!phoneStr) return '';
            const digits = phoneStr.replace(/\D/g, '');
            if (digits.length === 10) {
                return `${digits.substring(0, 3)}-${digits.substring(3, 6)}-${digits.substring(6)}`;
            }
            if (digits.length === 11 && digits.startsWith('1')) {
                return `${digits.substring(1, 4)}-${digits.substring(4, 7)}-${digits.substring(7)}`;
            }
            return phoneStr; // return original if not a standard US number
        }
    };

    // ==========================================
    // 2.8 TASKBAR MANAGER
    // ==========================================
    const Taskbar = {
        update() {
            const bar = document.getElementById('sn-taskbar');
            if (!bar) return;

            let ctr = document.getElementById('sn-taskbar-counters');
            if (!ctr) {
                ctr = document.createElement('div');
                ctr.id = 'sn-taskbar-counters';
                bar.appendChild(ctr);
            }

            const now = new Date();
            const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
            const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).getTime();
            
            let touchedCount = 0;
            let revisitCount = 0;

            const keys = GM_listValues().filter(k => k.startsWith('cn_') && !k.startsWith('cn_color') && !k.startsWith('cn_form'));
            
            keys.forEach(k => {
                const d = GM_getValue(k);
                if (d) {
                    if (d.timestamp && d.timestamp >= startOfDay) touchedCount++;
                    if (d.revisitActive && d.revisit) {
                        const [y, m, day] = d.revisit.split('-').map(Number);
                        const revTime = new Date(y, m - 1, day).getTime();
                        if (revTime <= endOfToday) revisitCount++;
                    }
                }
            });

            let html = `
                <div class="sn-counter-item" title="Records edited today" style="margin-right:10px;">
                    <span>Matter touched today:</span>
                    <span>${touchedCount}</span>
                </div>
            `;

            const dashBtn = document.getElementById('sn-dash-btn');
            if (revisitCount > 0) {
                html += `<div class="sn-counter-item sn-counter-urgent" title="Revisits due today or earlier"><span>Matter Revisit due:</span><span>${revisitCount}</span></div>`;
                if (dashBtn) dashBtn.classList.add('sn-urgent');
            } else {
                if (dashBtn) dashBtn.classList.remove('sn-urgent');
            }
            ctr.innerHTML = html;
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
        Themes,
        NoteThemes,
        Styles,
        Scraper,
        Windows,
        SSADataManager,
        Taskbar,
        Utils,

        async loadPdfLib() {
            return window.PDFLib;
        },

        fetchPdfBytes(url) {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: "GET",
                    url: url,
                    responseType: 'arraybuffer',
                    onload: function(response) {
                        if (response.status >= 200 && response.status < 400) {
                            resolve(response.response);
                        } else {
                            reject(new Error(`PDF fetch failed: ${response.status} ${response.statusText}`));
                        }
                    },
                    onerror: reject
                });
            });
        }
    };

})(window.CM_App = window.CM_App || {});