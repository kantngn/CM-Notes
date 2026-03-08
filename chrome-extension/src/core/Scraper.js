/**
 * @file Scraper.js
 * @description Identifies, traverses, and extracts client and case field data from both
 *   standard DOM elements and nested Salesforce Lightning Web Component (LWC) shadow roots.
 *   Exports methods on the {@link app.Core.Scraper} namespace.
 *
 * @requires Utils.js — app.Core.Utils (formatPhoneNumber)
 *
 * @consumed-by AppObserver.js, ClientNote.js, FeaturePanels.js,
 *   InfoPanel.js, MatterPanel.js, SSDFormViewer.js
 */
(function () {
    const app = window.CM_App = window.CM_App || {};
    app.Core = app.Core || {};

    /**
     * @typedef {Object.<string, string>} ScraperFieldMap
     * A flat key/value map where keys are normalised label strings
     * (lower-cased, punctuation stripped) and values are the corresponding
     * field text extracted from the DOM or shadow DOM.
     */

    /**
     * @typedef {Object} HeaderData
     * @property {string} clientName       - Client name parsed from `document.title`.
     * @property {string} [Status]         - Case status from the record header.
     * @property {string} [Sub-status]     - Case sub-status from the record header.
     * @property {string} [SS Classification] - Social Security classification / type.
     * @property {string} [Qualification Date] - Qualification date value.
     * @property {string} [Date Filed: App]    - Application filing date.
     */

    /**
     * @typedef {Object} MatterPageData
     * Flat map of shorthand keys derived from Salesforce API field names.
     * Keys are defined by the internal `apiMap` and `sidebarTargets` lookup
     * tables (e.g. "lastCA", "ssn", "dob", "qualDate").
     * @property {string} [ssn]       - Social Security Number.
     * @property {string} [dob]       - Date of Birth.
     * @property {string} [lastCA]    - Last CM1 Update Attempt.
     * @property {string} [lastCU]    - Last CM1 Update.
     * @property {string} [lastSUAtt] - Last ISU Attempt.
     * @property {string} [lastSU]    - Last Initial Status Update.
     * @property {string} [irDate]    - IR Status Date.
     * @property {string} [t2DeDec]   - T2 App Decision.
     * @property {string} [t16DeDec]  - T16 App Decision.
     * @property {string} [t2Date]    - T2 IA Decision Date.
     * @property {string} [t16Date]   - T16 IA Decision Date.
     * @property {string} [iaDeDate]  - Decision Date (App).
     * @property {string} [iaSol]     - IA Appeal SOL.
     * @property {string} [aod]       - Alleged Onset Date.
     * @property {string} [dli]       - Date Last Insured.
     * @property {string} [bdli]      - Blind DLI.
     * @property {string} [ere]       - ERE Status.
     * @property {string} [rfd]       - Date Filed Recon.
     * @property {string} [qualDate]  - Qualification Date.
     * @property {string} [ifd]       - Initial Filing Date (App).
     */

    /**
     * @typedef {Object} SSDFormData
     * Post-processed client intake data scraped from SSD application forms.
     * @property {string} [ssn]               - Social Security Number.
     * @property {string} [dob]               - Date of Birth.
     * @property {string} [Address]           - Composite mailing address string.
     * @property {string} [State]             - Two-letter state abbreviation.
     * @property {string} [City]              - City portion of the address.
     * @property {string} [Phone]             - Pipe-delimited formatted phone numbers.
     * @property {string} [Email]             - Email address.
     * @property {string} [POB]               - Place of Birth (city, state).
     * @property {string} [Parents]           - Parent names (comma-separated).
     * @property {string} [Condition]         - Physical and mental conditions text.
     * @property {string} [Assistive Devices] - Assistive devices description.
     * @property {string} [Medical Provider]  - Doctor / hospital / clinic entries.
     * @property {string} [Witness]           - Witness contact information.
     */

    const Scraper = {
        /**
         * Recursively harvests editable and read-only field data from a given
         * DOM root, piercing through LWC shadow roots.
         *
         * Input elements (edit mode) take priority over read-only output
         * elements (view mode) when the same label is encountered.
         *
         * @param {Document|ShadowRoot} [root=document] - The DOM root to scan.
         * @returns {ScraperFieldMap} Flat map of label → value pairs.
         */
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

        /**
         * Extracts header-level fields (status, classification, dates) and
         * the client name from the page title text. Pierces shadow roots to
         * reach Salesforce record-header field components.
         *
         * @returns {HeaderData} Object containing clientName and header field values.
         */
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

        /**
         * Scrapes the full Salesforce matter record page for API-mapped field
         * values (dates, decisions, SSN, DOB) by walking shadow roots and
         * matching `data-target-selection-name` attributes.
         *
         * @returns {MatterPageData} Flat map of shorthand keys to scraped values.
         */
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

        /**
         * Internal recursive walker that matches elements by
         * `data-target-selection-name` (API fields) and `.test-id__field-label`
         * (sidebar demographic fields), piercing shadow roots at each level.
         *
         * @private
         * @param {Document|ShadowRoot} root          - Current DOM root to walk.
         * @param {Object.<string, string>} apiMap     - Salesforce API name → shorthand key mapping.
         * @param {Object.<string, string>} sidebarTargets - Visible label → shorthand key mapping.
         * @returns {MatterPageData} Accumulated results from this root and its shadow children.
         */
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

        /**
         * Scrapes a multi-section SSD application intake form, extracting
         * identity, address, contact, witness, and medical fields from the
         * light DOM, shadow DOM, and iframes. Post-processes raw data into
         * composite fields (Address, Phone, POB, Witness) with state-abbreviation
         * normalisation.
         *
         * Uses {@link app.Core.Utils.formatPhoneNumber} for phone formatting.
         *
         * @returns {SSDFormData} Processed intake form data object.
         */
        getSSDFormData() {

            const rawData = {};
            const phoneSet = new Set();
            const witnessPhones = new Set();
            const witnessInfo = [];

            // Fields we specifically want to capture for the address
            const addressParts = { street: '', city: '', state: '', zip: '', rawState: '' };
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
                        if (labelText) {
                            const container = node.closest('.slds-form-element') || (root.host ? root : root.body || root);

                            let el = null;
                            let val = undefined;
                            let foundInputOrText = false;

                            if (container) {
                                const searchRoot = container.shadowRoot || container;

                                let checkedRadio = searchRoot.querySelector('input[type="radio"]:checked, input[type="checkbox"]:checked');
                                if (checkedRadio) {
                                    el = checkedRadio;
                                    foundInputOrText = true;
                                } else {
                                    let anyRadioOrCheck = searchRoot.querySelector('input[type="radio"], input[type="checkbox"]');
                                    if (anyRadioOrCheck) {
                                        foundInputOrText = true;
                                    } else {
                                        el = searchRoot.querySelector('input:not([type="hidden"]), textarea, select, [role="textbox"]');
                                        if (el) foundInputOrText = true;
                                    }
                                }

                                if (!el && !foundInputOrText) {
                                    el = searchRoot.querySelector('.slds-form-element__static, lightning-formatted-text, lightning-formatted-phone, lightning-formatted-email, lightning-formatted-address, lightning-formatted-date-time, lightning-formatted-name, .test-id__field-value, span[slot="outputField"]');
                                    if (el) foundInputOrText = true;
                                }

                                if (!el && !foundInputOrText && container.tagName && container.tagName.startsWith('LIGHTNING-')) {
                                    el = container;
                                }
                            }

                            if (el) {
                                val = el.value !== undefined ? el.value : el.getAttribute('value');
                                if (val === undefined || val === null || val === '') {
                                    val = getInnerText(el);
                                }

                                if (el.type === 'checkbox') {
                                    val = el.checked ? "Yes" : "No";
                                } else if (el.type === 'radio') {
                                    if (val === 'on' || val === true) val = "Yes";
                                }

                                if (val && typeof val === 'string') {
                                    // Make sure we aren't just grabbing the label itself!
                                    val = val.trim();
                                    if (val === labelText) {
                                        val = "";
                                    } else if (val.startsWith(labelText + '\n')) {
                                        val = val.substring(labelText.length + 1).trim();
                                    } else if (val.startsWith(labelText + ' ')) {
                                        val = val.substring(labelText.length + 1).trim();
                                    }
                                }

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

            const stateMap = {
                "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR", "california": "CA",
                "colorado": "CO", "connecticut": "CT", "delaware": "DE", "florida": "FL", "georgia": "GA",
                "hawaii": "HI", "idaho": "ID", "illinois": "IL", "indiana": "IN", "iowa": "IA",
                "kansas": "KS", "kentucky": "KY", "louisiana": "LA", "maine": "ME", "maryland": "MD",
                "massachusetts": "MA", "michigan": "MI", "minnesota": "MN", "mississippi": "MS", "missouri": "MO",
                "montana": "MT", "nebraska": "NE", "nevada": "NV", "new hampshire": "NH", "new jersey": "NJ",
                "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND", "ohio": "OH",
                "oklahoma": "OK", "oregon": "OR", "pennsylvania": "PA", "rhode island": "RI", "south carolina": "SC",
                "south dakota": "SD", "tennessee": "TN", "texas": "TX", "utah": "UT", "vermont": "VT",
                "virginia": "VA", "washington": "WA", "west virginia": "WV", "wisconsin": "WI", "wyoming": "WY",
                "district of columbia": "DC", "puerto rico": "PR"
            };

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
                else if (k === 'state') {
                    addressParts.rawState = val;
                    addressParts.state = stateMap[String(val).toLowerCase()] || String(val).toUpperCase();
                }
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
            const addr = [addressParts.street, addressParts.city, (addressParts.rawState || addressParts.state), addressParts.zip].filter(Boolean).join(', ');
            if (addr) finalData['Address'] = addr;
            if (addressParts.state) finalData['State'] = addressParts.state;
            if (addressParts.city) finalData['City'] = addressParts.city;

            const pob = [pobParts.city, pobParts.state].filter(Boolean).join(', ');
            if (pob) finalData['POB'] = pob;

            // Merge Witness Phones into Main Phone Field
            if (phoneSet.size > 0) finalData['Phone'] = Array.from(phoneSet).map(p => app.Core.Utils.formatPhoneNumber(p)).join(' || ');

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

        /**
         * Locates the "Medical" tab link within the SSD application form
         * by walking shadow roots for a matching `<a>` element.
         *
         * @private
         * @param {Document|ShadowRoot} [root=document] - DOM root to search.
         * @returns {HTMLAnchorElement|null} The Medical tab anchor, or null if not found.
         */
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

        /**
         * Performs a full two-pass SSD form scrape: first collects client
         * identity data from the default tab, then programmatically clicks
         * the Medical tab and scrapes medical/condition fields. Merges both
         * passes with Tab 1 identity fields taking priority.
         *
         * Handles CSP-safe tab navigation by temporarily stripping
         * `javascript:` hrefs before dispatching click events.
         *
         * @async
         * @returns {Promise<SSDFormData>} Merged SSD form data from both tabs.
         */
        async getFullSSDData() {


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

                // Prevent CSP violation by temporarily removing javascript href, if any.
                const oldHref = medTab.getAttribute('href');
                const hasJsHref = oldHref && oldHref.toLowerCase().startsWith('javascript:');
                if (hasJsHref) {
                    medTab.removeAttribute('href');
                }

                medTab.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true }));

                if (hasJsHref) {
                    setTimeout(() => medTab.setAttribute('href', oldHref), 0);
                }

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

    app.Core.Scraper = Scraper;
})();
