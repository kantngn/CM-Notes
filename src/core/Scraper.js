import { Utils } from './Utils.js';

export const Scraper = {
    harvestFields(root = document) {
        let fieldMap = {};

        // A. Look for INPUTS (Edit Mode / Intake Form)
        const inputs = root.querySelectorAll('lightning-input, lightning-textarea, lightning-combobox, input, textarea, select');
        inputs.forEach(el => {
            let label = el.label;
            let value = el.value;

            // Fallback for label
            if (!label && el.closest('.slds-form-element')) {
                const lblEl = el.closest('.slds-form-element').querySelector('.slds-form-element__label');
                if (lblEl) label = lblEl.innerText;
            }

            if (el.type === 'checkbox' || el.type === 'radio') {
                if (el.type === 'radio' && !el.checked) return;
                value = el.checked ? "Yes" : "No";
            }

            if (label && (value || value === 0)) {
                fieldMap[label.trim().toLowerCase().replace(/[:?]/g, '')] = String(value).trim();
            }
        });

        // B. Look for READ-ONLY TEXT (Main Page View Mode)
        const outputs = root.querySelectorAll('lightning-formatted-text, lightning-formatted-name, lightning-formatted-phone, lightning-output-field');
        outputs.forEach(el => {
            // Traverse up to find the label container
            const parent = el.closest('.slds-form-element') || el.closest('.test-id__output-root');
            if (parent) {
                const labelEl = parent.querySelector('.slds-form-element__label') || parent.querySelector('.test-id__field-label');
                if (labelEl) {
                    const key = labelEl.innerText.trim().toLowerCase().replace(/[:?]/g, '');
                    // Only add if not already captured by inputs (Inputs take priority)
                    if (!fieldMap[key]) {
                        fieldMap[key] = el.innerText.trim();
                    }
                }
            }
        });

        // Recurse Shadow DOM (Optimized with TreeWalker)
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null, false);
        let node = walker.nextNode();
        while (node) {
            if (node.shadowRoot) {
                Object.assign(fieldMap, this.harvestFields(node.shadowRoot));
            }
            node = walker.nextNode();
        }

        return fieldMap;
    },

    getHeaderData() {
        // --- Client Name from Title ---
        const title = document.title || "";
        const parts = title.split('|');
        const clientName = parts.length > 0 ? parts[0].trim() : "";

        // --- Header Fields using old, reliable method ---
        const headerFields = {};
        function pierceShadows(root) {
            if (!root.querySelectorAll) return;

            root.querySelectorAll('p.slds-text-title').forEach(labelEl => {
                if (labelEl.getBoundingClientRect().width === 0) return;

                const label = (labelEl.getAttribute('title') || labelEl.textContent).trim();
                if (label) {
                    const sibling = labelEl.nextElementSibling;
                    if (sibling && sibling.classList.contains('fieldComponent')) {
                        let value = sibling.innerText ? sibling.innerText.trim() : '';
                        if (!value) {
                            const slot = sibling.querySelector('slot');
                            if (slot && slot.assignedNodes) {
                                const slottedElements = slot.assignedNodes({ flatten: true });
                                value = slottedElements.map(node => node.textContent || node.innerText).join('').trim();
                            }
                        }
                        if (value) headerFields[label] = value;
                    }
                }
            });

            const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null, false);
            let node = walker.nextNode();
            while (node) {
                if (node.shadowRoot) pierceShadows(node.shadowRoot);
                node = walker.nextNode();
            }
        }
        pierceShadows(document);

        return {
            clientName,
            "Status": headerFields["Status"] || headerFields["Case Status"],
            "Sub-status": headerFields["Sub-status"] || headerFields["Sub Status"],
            "SS Classification": headerFields["SS Classification"] || headerFields["Classification"] || headerFields["Type"],
            "Qualification Date": headerFields["Qualification Date"],
            "Date Filed: App": headerFields["Date Filed: App"]
        };
    },

    getAllPageData() {
        const apiMap = {
            "Last_CM1_Update_Attempt__c": "lastCA",
            "Last_CM1_Update__c": "lastCU",
            "Last_ISU_Attempt__c": "lastSUAtt",
            "Last_Initial_Status_Update__c": "lastSU",
            "IR_Status_Date__c": "irDate",
            "T2_App_Decision__c": "t2DeDec",
            "T16_App_Decision__c": "t16DeDec",
            "T2_IA_Decision_Date__c": "t2Date",
            "T16_IA_Decision_Date__c": "t16Date",
            "Decision_Date_App__c": "iaDeDate",
            "IA_Appeal_SOL__c": "iaSol",
            "AOD__c": "aod",
            "DLI__c": "dli",
            "Blind_DLI__c": "bdli",
            "ERE_Status__c": "ere",
            "Date_File_Recon__c": "rfd",
            "Qualification_Date__c": "qualDate",
            "Date_Filed_App__c": "ifd"
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
                    } catch (e) { }
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

            // 1.1 SSN and DOB
            else if ((k === 'ssn' || k === 'social security number' || (k.includes('social security') && !k.includes('applied') && !k.includes('denied'))) && !/^(yes|no|true|false)$/i.test(val)) finalData['ssn'] = val;
            else if (k.includes('dob') || (k.includes('date') && k.includes('birth'))) finalData['dob'] = val;

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

        const waitForData = async (check, interval = 100, max = 100) => {
            for (let i = 0; i < max; i++) {
                const d = this.getSSDFormData();
                if (check(d)) return d;
                await new Promise(r => setTimeout(r, interval));
            }
            return this.getSSDFormData();
        };

        const data1 = await waitForData(d => d.ssn || d.dob);

        const medTab = this._findMedicalTab();
        if (medTab) {
            console.log("🖱️ Medical Tab found. Clicking...");
            medTab.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true }));

            await new Promise(r => setTimeout(r, 100));

            const data2 = await waitForData(d => d['Medical Provider'] || d['Assistive Devices'] || d['Condition']);

            const merged = { ...data1, ...data2 };
            // Prioritize Tab 1 (Client Info) for Identity fields to prevent overwrite by empty fields in Tab 2
            if (data1.ssn) merged.ssn = data1.ssn;
            if (data1.dob) merged.dob = data1.dob;
            return merged;
        }
        return data1;
    }
};
