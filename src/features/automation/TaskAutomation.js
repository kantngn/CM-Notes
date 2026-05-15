(function () {
    const app = window.CM_App = window.CM_App || {};
    app.Automation = app.Automation || {};

    /**
     * Handles complex, multi-step browser automation for Salesforce tasks and emails.
     * Uses DOM traversal to find nested iframes (like CKEditor) and dispatches events
     * to simulate user interaction.
     * @namespace app.Automation.TaskAutomation
     */
    const TaskAutomation = {
        // Delegate to shared Utils
        delay: ms => app.Core.Utils.delay(ms),
        queryDeep: (sel, root) => app.Core.Utils.queryDeep(sel, root),
        queryAllDeep: (sel, root) => app.Core.Utils.queryAllDeep(sel, root),
        waitForElement: (sel, max, root) => app.Core.Utils.waitForElement(sel, max, root),

        /**
         * Replaces placeholders like {{clientName}} in templates.
         */
        parseTemplate(text, clientId) {
            if (!text) return '';
            const clientData = GM_getValue('cn_' + clientId, {});
            const formData = GM_getValue('cn_form_data_' + clientId, {});
            const prefix = formData.prefix ? formData.prefix + ' ' : 'Mr./Mrs. ';
            const clientName = prefix + (clientData.name || 'Client');
            const cmName = GM_getValue('sn_global_cm1', 'Kant Nguyen');
            const cmExt = GM_getValue('sn_global_ext', '1072');
            const cmPhone = `(214) 271-4027${cmExt ? ' Ext. ' + cmExt : ''}`;
            
            return text
                .replace(/{{clientName}}/g, clientName)
                .replace(/{{cmName}}/g, cmName)
                .replace(/{{cmPhone}}/g, cmPhone);
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

        // --- NCL STEPS ---
        async ncl_step1() {
            // Step 1: Click "New Task"
            const newTaskBtn = await this.waitForElement('button[title="New Task"]');
            if (!newTaskBtn) throw new Error("Could not find 'New Task' button.");

            // Delta Tracking: Capture modals AND docked panels before click
            const beforeModals = Array.from(document.querySelectorAll('.uiModal.open, .slds-modal'));
            const beforeDocked = Array.from(document.querySelectorAll('.forceDockingPanel.DOCKED'));
            newTaskBtn.click();

            // Wait for a new modal OR docked panel to appear
            let root = null;
            for (let i = 0; i < 30; i++) {
                // Check for new modal first
                const curModals = Array.from(document.querySelectorAll('.uiModal.open, .slds-modal'));
                const newModal = curModals.reverse().find(m => !beforeModals.includes(m));
                if (newModal) {
                    root = newModal;
                    break;
                }
                // Fallback: check for new docked panel (Salesforce sometimes opens Task as docked)
                const curDocked = Array.from(document.querySelectorAll('.forceDockingPanel.DOCKED'));
                const newDocked = curDocked.find(p => !beforeDocked.includes(p));
                if (newDocked) {
                    root = newDocked;
                    break;
                }
                await this.delay(100);
            }

            // Ensure we strictly pick a modal/docked, not document
            if (!root) {
                root = Array.from(document.querySelectorAll('.uiModal.open, .slds-modal')).reverse()[0]
                    || Array.from(document.querySelectorAll('.forceDockingPanel.DOCKED')).reverse()[0]
                    || document;
            }

            // Step 2: Set Subject 
            const subjectInput = await this.waitForElement('input[aria-label="Subject"]', 5000, root);
            if (!subjectInput) throw new Error("Could not find Subject input.");

            subjectInput.focus();
            subjectInput.click();
            await this.delay(30);

            subjectInput.value = "Rose Letter 01 - NC to Client";
            subjectInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
            subjectInput.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
            await this.delay(100);
            return root; // Return for next steps
        },

        async ncl_step2(root = null) {
            // Strictly fallback to a modal if root is missing
            root = root || Array.from(document.querySelectorAll('.uiModal.open, .slds-modal')).reverse()[0] || this.getActivePanel();
            // Step 3: Set Due Date
            const todayStr = new Date().toLocaleDateString('en-US');
            let dateInput = null;

            const allLabels = this.queryAllDeep('label', root);
            const dateLabel = allLabels.find(l => l.textContent && l.textContent.trim() === 'Due Date');

            if (dateLabel) {
                const inputId = dateLabel.getAttribute('for');
                if (inputId) {
                    const rootNode = dateLabel.getRootNode();
                    dateInput = rootNode.querySelector(`[id="${inputId}"]`);
                }
            }

            if (!dateInput) {
                dateInput = this.queryDeep('lightning-datepicker input', root);
            }

            if (dateInput) {
                dateInput.value = todayStr;
                dateInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                dateInput.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
            }
            await this.delay(50);

            // Step 4: Set Type to "Send Letter"
            // Try multiple strategies to find the Type trigger (classic Aura <a> or LWC <button>)
            let typeTrigger = null;
            for (let i = 0; i < 10; i++) {
                const typeContainer = this.queryDeep('div[data-target-selection-name="sfdc:RecordField.Task.Type"]', root);
                if (typeContainer) {
                    // Classic Aura picklist: <a class="select">
                    typeTrigger = typeContainer.querySelector('a.select');
                    // LWC combobox: <button> inside the container (exclude unrelated factType buttons)
                    if (!typeTrigger) {
                        const buttons = typeContainer.querySelectorAll('button.slds-combobox__input, button[role="combobox"]');
                        for (const btn of buttons) {
                            // Skip buttons for unrelated fields like factType
                            if (btn.getAttribute('name') !== 'factType') {
                                typeTrigger = btn;
                                break;
                            }
                        }
                    }
                }
                if (typeTrigger) break;
                await this.delay(300);
            }

            if (typeTrigger) {
                typeTrigger.click();
                await this.delay(400);

                // Poll for options — find "Send Letter" by text content, not index
                let sendLetterOption = null;
                for (let i = 0; i < 15; i++) {
                    const options = document.querySelectorAll(
                        'a[role="option"], li.uiMenuItem a, [role="option"], .slds-listbox__item[role="option"], li[role="option"]'
                    );
                    // Search by text — much more robust than relying on position
                    sendLetterOption = Array.from(options).find(opt =>
                        (opt.textContent || '').trim() === 'Send Letter'
                    );
                    if (sendLetterOption) break;
                    await this.delay(200);
                }

                if (sendLetterOption) {
                    sendLetterOption.click();
                    await this.delay(400);
                } else {
                    console.warn("Could not find 'Send Letter' option by text. Falling back to index-based selection.");
                    const options = document.querySelectorAll(
                        'a[role="option"], li.uiMenuItem a, [role="option"], .slds-listbox__item[role="option"], li[role="option"]'
                    );
                    // Try index 5 (historically "Send Letter" position) then index 4 as fallback
                    const fallbackOption = options[5] || options[4];
                    if (fallbackOption) {
                        fallbackOption.click();
                        await this.delay(400);
                    }
                }
            }
        },

        async ncl_step3(root = null) {
            // Strictly fallback to a modal if root is missing
            root = root || Array.from(document.querySelectorAll('.uiModal.open, .slds-modal')).reverse()[0] || this.getActivePanel();
            // Step 5: Reassign to Rose Robot
            let clearAssigneeBtn = null;
            const allAssistiveTexts = this.queryAllDeep('.assistiveText', root);
            const assignedToLabel = allAssistiveTexts.find(el => el.textContent && el.textContent.includes('Assigned To'));

            if (assignedToLabel) {
                clearAssigneeBtn = assignedToLabel.parentElement.querySelector('a.deleteAction');
            } else {
                const allPills = this.queryAllDeep('.uiPillContainer', root);
                const userPillContainer = allPills.find(el => el.textContent && el.textContent.includes('Assigned To'));
                if (userPillContainer) {
                    clearAssigneeBtn = userPillContainer.querySelector('a.deleteAction');
                }
            }

            if (clearAssigneeBtn) {
                clearAssigneeBtn.click();
                await this.delay(300);
            }

            const assignInputs = this.queryAllDeep('input', root).filter(el =>
                (el.title && el.title.includes('Search Users')) ||
                (el.placeholder && el.placeholder.includes('Search Users')) ||
                (el.title && el.title.includes('Search People'))
            );

            const assignInput = assignInputs.length > 0 ? assignInputs[0] : this.queryDeep('input.uiInputTextForAutocomplete', root);
            if (!assignInput) throw new Error("Could not find 'Assigned To' search input after clearing pill.");

            assignInput.focus();
            assignInput.click();
            assignInput.value = "Rose";
            assignInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));

            // Wait for results to populate
            await this.waitForElement('a[role="option"]', 5000, root);
            await this.delay(500);

            const allOptions = this.queryAllDeep('a[role="option"]', root);
            let targetOption = allOptions.find(opt => {
                const text = (opt.textContent || "").toLowerCase();
                const hasRose = (opt.title && opt.title.includes("Rose Robot")) || opt.querySelector('[title="Rose Robot"]') || text.includes("rose robot");
                const hasCM1 = (opt.title && opt.title.includes("CM 1")) || opt.querySelector('[title="CM 1"]') || text.includes("cm 1");
                return hasRose && hasCM1;
            });

            // Fallback: Try to find any "Rose Robot" if specific match fails
            if (!targetOption) {
                targetOption = allOptions.find(opt => (opt.title && opt.title.includes("Rose Robot")) || opt.querySelector('[title="Rose Robot"]') || (opt.textContent || "").toLowerCase().includes("rose robot"));
            }

            if (targetOption) {
                targetOption.click();
                await this.delay(200);
            }

            // Step 6: Save - REMOVED per user request for manual review
        },

        /**
         * Orchestrates the complete 3-step automation for creating a "Non-Client Letter" (NCL)
         * task in Salesforce and assigning it to the 'Rose Robot'.
         * Opens ONE modal, fills it, verifies, and retries failed steps on the same modal.
         * On success, auto-saves the task.
         * @param {string} clientId - The ID of the current client record.
         */
        async runNCL(clientId) {
            try {
                // Step 1: Open the NCL modal ONCE
                const modal = await this.ncl_step1();

                const maxRetries = 2;
                for (let attempt = 0; attempt <= maxRetries; attempt++) {
                    await this.ncl_step2(modal);
                    await this.ncl_step3(modal);

                    // Verify all fields were actually set
                    await this.delay(300);
                    const subjectOk = this.verifyNCLSubject(modal);
                    const dateOk = this.verifyNCLDate(modal);
                    const typeOk = this.verifyNCLType(modal);
                    const assignOk = this.verifyNCLAssigned(modal);

                    if (subjectOk && dateOk && typeOk && assignOk) {
                        await this.clickNCLSave(modal);
                        return;
                    }
                    console.warn(`NCL verification attempt ${attempt + 1} failed (subj=${subjectOk} date=${dateOk} type=${typeOk} assign=${assignOk}), retrying steps 2-3...`);
                }
                console.error("NCL verification failed after all retries — fields may be incomplete.");
            } catch (error) {
                console.error("❌ NCL Automation Error: " + error.message);
                throw error;
            }
        },

        /**
         * Clicks the Save button on the NCL Task modal.
         * @param {HTMLElement} root - The NCL modal root element.
         */
        async clickNCLSave(root) {
            const saveBtn = await this.waitForElement(
                'button.slds-button--brand.cuf-publisherShareButton, button.slds-button_brand[title="Save"], button[name="SaveEdit"], .slds-modal__footer button.slds-button_brand, .slds-modal__footer button.slds-button--brand',
                5000, root
            );
            if (!saveBtn) throw new Error("Could not find NCL Save button.");
            saveBtn.click();
            await this.delay(800);
        },

        /** Checks if Subject input was filled with the correct value */
        verifyNCLSubject(root) {
            const input = this.queryDeep('input[aria-label="Subject"]', root);
            return input && input.value && input.value.includes('Rose Letter');
        },

        /** Checks if Due Date input has a non-empty value (today) */
        verifyNCLDate(root) {
            const input = this.queryDeep('lightning-datepicker input', root);
            return input && input.value && input.value.trim().length > 0;
        },

        /** Checks if Type dropdown shows "Send Letter" selected */
        verifyNCLType(root) {
            const container = this.queryDeep('div[data-target-selection-name="sfdc:RecordField.Task.Type"]', root);
            if (!container) return false;
            const selected = container.querySelector('a.select') || container.querySelector('.slds-truncate');
            return selected && selected.textContent.trim() === 'Send Letter';
        },

        /** Checks if Assigned To has Rose Robot selected */
        verifyNCLAssigned(root) {
            const pills = this.queryAllDeep('.slds-pill, .uiPill', root);
            return pills.some(p => p.textContent.includes('Rose Robot'));
        },

        /**
         * Orchestrates the complete automation for drafting a follow-up email.
         * Fills in the recipient, subject, and injects a template into the CKEditor iframe.
         * @param {string} clientId - The ID of the current client record.
         * @param {Object} [template=null] - Optional template object {subject, body}.
         */
        async runEmail(clientId, template = null) {
            try {
                const panel = await this.email_step1();
                await this.email_step2(clientId, panel);
                await this.email_step3(clientId, template, panel);
            } catch (e) {
                console.error("Email Auto Error:", e);
                throw e;
            }
        },

        /**
         * Sends an SMS message via the Salesforce SMS component (Placeholder/Stub).
         * @param {string} clientId
         * @param {Object} template
         */
        async sendSMS(clientId, template) {
            try {
                if (template.body) console.log(`[SMS] Sending to ${clientId}: ${template.body}`);

                // 1. Find the SMS tab (Aggressive Search)
                let smsTab = await this.waitForElement('a[data-label="SMS"], a.slds-tabs_default__link[data-label="SMS"], .slds-tabs_default__item[title="SMS"] a', 4000);

                if (!smsTab) {
                    const allLinks = this.queryAllDeep('a, .slds-tabs_default__link, .slds-button');
                    smsTab = allLinks.find(el => {
                        const txt = el.textContent.trim().toUpperCase();
                        return txt === 'SMS' || txt === 'TEXT MESSAGE' || txt.includes('SMS');
                    });
                }

                if (smsTab) {
                    if (typeof smsTab.focus === 'function') smsTab.focus();
                    smsTab.click();
                    
                    // Force a second click if it's a Salesforce dropdown tab
                    if (smsTab.getAttribute('aria-expanded') === 'false') {
                        smsTab.click();
                    }

                    // 2. Wait for tab switching
                    await this.delay(800);

                    // 3. Find the textarea
                    let smsInput = await this.waitForElement('textarea.slds-textarea, textarea[part="textarea"]', 3000);

                    if (!smsInput) {
                        const allTextareas = this.queryAllDeep('textarea');
                        smsInput = allTextareas.find(ta => ta.classList.contains('slds-textarea') || ta.placeholder?.includes('SMS'));
                    }

                    if (smsInput && template.body) {
                        smsInput.focus();
                        smsInput.click();
                        await this.delay(100);
                        
                        const parsedBody = this.parseTemplate(template.body, clientId);
                        smsInput.value = parsedBody;

                        // Dispatch comprehensive events
                        smsInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                        smsInput.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
                        smsInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, composed: true, key: ' ', code: 'Space' }));
                        
                        app.Core.Utils.showNotification("SMS drafted successfully.", { type: 'success', duration: 2000 });
                        return;
                    }
                } else {
                    app.Core.Utils.showNotification("Could not find SMS tab. Please open it manually.", { type: 'warning' });
                }

                if (template.body) {
                    app.Core.Utils.showNotification("SMS Content Ready. Please paste into SMS field.", { type: 'info' });
                    await navigator.clipboard.writeText(template.body);
                }
            } catch (e) {
                console.error("SMS Auto Error:", e);
                throw e;
            }
        },

        /**
         * Finds and clicks the "Send" button in the SMS component.
         */
        async clickSendSMS() {
            try {
                // Find the SVG with data-key="send" and then go up to the button
                const sendIcon = await this.waitForElement('svg[data-key="send"]', 2000);
                if (sendIcon) {
                    const sendBtn = sendIcon.closest('button');
                    if (sendBtn) {
                        sendBtn.click();
                        return;
                    }
                }

                // Fallback selector for buttons labeled "Send"
                const fallbackBtn = await this.waitForElement('button.slds-button_brand', 1000);
                if (fallbackBtn && fallbackBtn.textContent.includes('Send')) {
                    fallbackBtn.click();
                }
            } catch (e) {
                console.error("SMS Send Error:", e);
                throw e;
            }
        },

        /**
         * Finds and clicks the "Send" button in the Email composer.
         */
        async clickSendEmail() {
            try {
                const sendBtn = await this.waitForElement('button.slds-button_brand[title="Send"], button.slds-button--brand[title="Send"], button.slds-button_brand:not([disabled])', 3000);
                if (sendBtn) {
                    sendBtn.click();
                } else {
                    throw new Error("Could not find active Email Send button.");
                }
            } catch (e) {
                console.error("Email Send Error:", e);
                throw e;
            }
        },

        async email_step1() {
            // Step 1: Open Email
            const emailBtn = await this.waitForElement('button[title="Email"][value="SendEmail"]');
            if (!emailBtn) throw new Error("Could not find 'Email' button.");

            const before = Array.from(document.querySelectorAll('.forceDockingPanel.DOCKED'));
            emailBtn.click();

            // Wait for the specific new email composer to appear
            let newPanel = null;
            for (let i = 0; i < 30; i++) { // Increased to 3s total
                const current = Array.from(document.querySelectorAll('.forceDockingPanel.DOCKED'));
                // Strictly find a panel that was NOT in the 'before' list
                newPanel = current.find(p => !before.includes(p));
                
                // Extra check: must look like an email composer
                if (newPanel && newPanel.querySelector('input[placeholder*="Subject"], .emailSubject')) break;
                
                await this.delay(100);
            }

            const root = newPanel || this.getActivePanel();

            const subjectInput = await this.waitForElement('input[placeholder="Enter Subject..."]', 5000, root);
            if (!subjectInput) throw new Error("Email composer's subject field did not appear.");
            return root;
        },

        async email_step2(clientId, root = null) {
            root = root || this.getActivePanel();
            // Data Prep
            const formData = GM_getValue('cn_form_data_' + clientId, {});
            const emailAddr = formData['Email'] || '';
            if (!emailAddr) console.warn("⚠️ No email address found in scraped data.");

            // Step 2: Clear BCC
            const bccList = this.queryDeep('ul[aria-label="Bcc"]', root);
            if (bccList) {
                const bccDeletes = this.queryAllDeep('.deleteAction, .slds-pill__remove, button[title="Remove"]', bccList);
                for (let btn of bccDeletes) {
                    btn.click();
                    await this.delay(300);
                }
            }

            // Step 3: Fill "To"
            const toList = this.queryDeep('ul[aria-label="To"]', root);
            if (toList && emailAddr) {
                const toInput = this.queryDeep('input', toList);
                if (toInput) {
                    toInput.focus();
                    toInput.value = emailAddr;
                    toInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                    await this.delay(1000);
                    toInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, composed: true }));
                }
            }
        },

        async email_step3(clientId, template = null, root = null) {
            root = root || this.getActivePanel();
            // Data Prep
            const clientData = GM_getValue('cn_' + clientId, {});
            const clientName = clientData.name || 'Client';

            // Step 4: Fill Subject
            const subjectInput = await this.waitForElement('input[placeholder="Enter Subject..."]', 2000, root);
            if (!subjectInput) throw new Error("Email composer's subject field not found.");

            const subjectText = template ? this.parseTemplate(template.subject, clientId) : "Message from your SSD Case Manager";

            subjectInput.focus();
            subjectInput.value = subjectText;
            subjectInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
            subjectInput.dispatchEvent(new Event('change', { bubbles: true, composed: true }));

            // Step 5: Fill Body
            const signature = this.getSignature();
            let bodyHTML = template ? this.parseTemplate(template.body, clientId) : `
                <p>Dear ${clientName},</p>
                <p>This is a message from Kirkendall Dwyer - Social Security Division. We haven't been able to reach you by phone and wanted to follow up regarding your Social Security Disability claim.</p>  
                <p>Please contact our office as soon as possible to discuss an important matter regarding your claim.</p>
                <p>Thank you.</p>
            `;

            // Append signature if not already present or if it's a template that needs it
            if (!bodyHTML.includes('Confidentiality Notice')) {
                bodyHTML += '<br>' + signature;
            }

            // Step 6: Find email body editor (iframe or contenteditable)
            // Broader selectors to cover different Salesforce org configurations
            const outerIframe = await this.waitForElement(
                'iframe[title="Email Body"], iframe[name^="vfFrameId"], iframe[title*="Rich Text"], .emailBody iframe, iframe[class*="editor"]',
                10000, root
            );

            let editorBody = null;
            let elapsed = 0;

            if (outerIframe) {
                // Found an iframe — search inside for the editable body (up to 8s)
                while (elapsed < 8000) {
                    try {
                        const outerDoc = outerIframe.contentDocument || outerIframe.contentWindow?.document;
                        if (outerDoc) {
                            // Look for inner CKEditor (or similar WYSIWYG) iframe
                            const innerIframe = outerDoc.querySelector(
                                'iframe.cke_wysiwyg_frame, iframe[title*="Rich Text"], iframe[class*="wysiwyg"], iframe[class*="editor"]'
                            );
                            if (innerIframe) {
                                const innerDoc = innerIframe.contentDocument || innerIframe.contentWindow?.document;
                                if (innerDoc) {
                                    const body = innerDoc.querySelector('body.cke_editable, body[contenteditable], body[class*="editor"]');
                                    if (body) {
                                        editorBody = body;
                                        break;
                                    }
                                }
                            }
                            // Direct contenteditable body (Salesforce sometimes uses this instead of inner iframe)
                            const body = outerDoc.querySelector(
                                'body[contenteditable="true"], [contenteditable="true"], .cke_editable, .editorBody'
                            );
                            if (body) {
                                editorBody = body;
                                break;
                            }
                        }
                    } catch (e) {
                        // Cross-origin errors while iframe is still loading — ignore
                    }
                    await this.delay(200);
                    elapsed += 200;
                }
            }

            // Fallback: if no iframe found, search for a contenteditable inside the panel directly
            if (!editorBody) {
                const directBody = root.querySelector('[contenteditable="true"], .cke_editable, .editorBody');
                if (directBody) editorBody = directBody;
            }

            if (editorBody) {
                // Wait 500ms before first fill attempt to let the editor fully initialise
                await this.delay(500);

                // Verification Loop: Try to inject and verify up to 4 times
                // Re-finds the editor body on each attempt in case Salesforce swaps the DOM element.
                let success = false;
                for (let attempt = 0; attempt < 4; attempt++) {
                    // Re-find the editor body element (Salesforce may replace it between attempts)
                    const freshBody = this.findEmailBody(root);
                    const targetBody = freshBody || editorBody;

                    if (typeof targetBody.focus === 'function') targetBody.focus();

                    // Strategy A: innerHTML (fast, but sometimes overwritten by Salesforce framework)
                    targetBody.innerHTML = bodyHTML;
                    targetBody.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                    targetBody.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
                    targetBody.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, composed: true, key: ' ', code: 'Space' }));

                    await this.delay(600);
                    let currentHTML = targetBody.innerHTML || "";
                    if (currentHTML.length > 20 && currentHTML.includes('Kirkendall Dwyer')) {
                        success = true;
                        break;
                    }

                    // Strategy B: execCommand('insertHTML') — more reliable with Salesforce's framework
                    try {
                        targetBody.focus();
                        document.execCommand('selectAll', false, null);
                        document.execCommand('insertHTML', false, bodyHTML);
                        currentHTML = targetBody.innerHTML || "";
                        if (currentHTML.length > 20 && currentHTML.includes('Kirkendall Dwyer')) {
                            success = true;
                            break;
                        }
                    } catch (ex) {
                        // execCommand may fail in some contexts
                    }

                    console.warn(`Email injection attempt ${attempt + 1} failed, retrying...`);
                }

                if (!success) {
                    console.error("Failed to verify email body injection after 4 attempts.");
                    try { editorBody.innerHTML = bodyHTML; } catch (e) {}
                }
            } else {
                throw new Error("Email body could not be found or became ready after 8 seconds.");
            }
        },

        /**
         * Re-finds the email body editable element inside the panel.
         * Useful when Salesforce swaps the DOM element mid-automation.
         * @param {HTMLElement} root - The email composer panel root.
         * @returns {HTMLElement|null} The editable body element, or null.
         */
        findEmailBody(root) {
            const iframe = root.querySelector('iframe[title="Email Body"], iframe[name^="vfFrameId"], iframe[title*="Rich Text"], .emailBody iframe, iframe[class*="editor"]');
            if (iframe) {
                try {
                    const outerDoc = iframe.contentDocument || iframe.contentWindow?.document;
                    if (outerDoc) {
                        const innerIframe = outerDoc.querySelector('iframe.cke_wysiwyg_frame, iframe[title*="Rich Text"], iframe[class*="wysiwyg"], iframe[class*="editor"]');
                        if (innerIframe) {
                            const innerDoc = innerIframe.contentDocument || innerIframe.contentWindow?.document;
                            if (innerDoc) {
                                const body = innerDoc.querySelector('body.cke_editable, body[contenteditable], body[class*="editor"]');
                                if (body) return body;
                            }
                        }
                        const body = outerDoc.querySelector('body[contenteditable="true"], [contenteditable="true"], .cke_editable, .editorBody');
                        if (body) return body;
                    }
                } catch (e) { /* cross-origin */ }
            }
            const directBody = root.querySelector('[contenteditable="true"], .cke_editable, .editorBody');
            return directBody || null;
        },

        // ──────────────────────────────────────────────
        //  FTR (Failed to Reach) Logger
        // ──────────────────────────────────────────────

        /**
         * Extracts the first CL phone number from stored form data.
         * @param {string} clientId
         * @returns {string} First phone number, or "No CL number" if empty.
         */
        getCLPhone(clientId) {
            const formData = GM_getValue('cn_form_data_' + clientId, {});
            const phoneRaw = formData['Phone'] || '';
            const phones = phoneRaw.split(/\n|,| - /).map(p => p.trim()).filter(Boolean);
            return phones.length > 0 ? phones[0] : 'No CL number';
        },

        /**
         * Extracts the Witness Phone Number from the Witness data block.
         * @param {string} clientId
         * @returns {string} Formatted phone number string, or "No WN number" if none found.
         */
        getWNPhone(clientId) {
            const formData = GM_getValue('cn_form_data_' + clientId, {});
            const witnessBlock = formData['Witness'] || '';
            if (!witnessBlock) return 'No WN number';

            // regex to find common US phone formats: 123-456-7890, (123) 456-7890, 1234567890
            const phoneRegex = /(?:\d{3}[-.\s]?\d{3}[-.\s]?\d{4})|(?:\(\d{3}\)\s?\d{3}[-.\s]?\d{4})/g;
            const matches = witnessBlock.match(phoneRegex);

            if (matches && matches.length > 0) {
                return app.Core.Utils.formatPhoneNumber(matches[0]);
            }

            // Fallback: split by lines/commas and find first piece with 10+ digits
            const parts = witnessBlock.split(/\n|,| - /).map(s => s.trim()).filter(Boolean);
            for (let part of parts) {
                const digits = part.replace(/\D/g, '');
                if (digits.length >= 10) {
                    return app.Core.Utils.formatPhoneNumber(part);
                }
            }

            return 'No WN number';
        },

        /**
         * Identifies the most recently opened Salesforce docked panel (composer).
         * This prevents automation from overwriting the wrong panel when multiple are open.
         * @returns {HTMLElement|Document} The newest docked panel, or document if none found.
         */
        getActivePanel() {
            // Priority 1: Salesforce Docked Composers (Email, Log a Call, etc.)
            // We filter for panels that are actually visible (offsetParent != null)
            const panels = Array.from(document.querySelectorAll('.forceDockingPanel.DOCKED'));
            const visiblePanels = panels.filter(p => p.offsetParent !== null && !p.classList.contains('slds-hide'));

            if (visiblePanels.length > 0) {
                return visiblePanels[visiblePanels.length - 1];
            }

            // Priority 2: Salesforce Modals (New Task, etc.)
            const modals = Array.from(document.querySelectorAll('.uiModal.open, .panel-content, .slds-modal'));
            const visibleModals = modals.filter(m => m.offsetParent !== null || m.classList.contains('slds-fade-in-open'));

            if (visibleModals.length > 0) {
                return visibleModals[visibleModals.length - 1];
            }
            return document;
        },

        /**
         * Clicks the "Last Activity" button and waits for the publisher to appear.
         */
        async clickLastActivity() {
            const before = Array.from(document.querySelectorAll('.forceDockingPanel.DOCKED'));

            const lastActivityBtn = await this.waitForElement('button[title="Last Activity"]', 5000);
            if (!lastActivityBtn) throw new Error("Could not find 'Last Activity' button.");

            lastActivityBtn.click();

            // Wait for a NEW panel to appear (Delta Tracking)
            let newPanel = null;
            for (let i = 0; i < 30; i++) {
                const current = Array.from(document.querySelectorAll('.forceDockingPanel.DOCKED'));
                // Type-specific check: Must contain a Task subject field (aria-label)
                newPanel = current.find(p => !before.includes(p) && p.querySelector('input[aria-label="Subject"]'));
                if (newPanel) break; 
                await this.delay(50);
            }

            const result = newPanel || this.getActivePanel();
            await this.delay(50);
            return result;
        },

        /**
         * Fills the Subject input with the given text.
         * @param {string} text
         */
        async fillSubject(text, root = null) {
            root = root || this.getActivePanel();
            const subjectInput = await this.waitForElement('input.slds-combobox__input[aria-label="Subject"]', 5000, root);
            if (!subjectInput) throw new Error("Could not find Subject input in active panel.");

            subjectInput.focus();
            subjectInput.click();
            await this.delay(50);

            subjectInput.value = text;
            subjectInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
            subjectInput.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
            subjectInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, composed: true, key: 'Enter' }));
            await this.delay(100);
        },

        /**
         * Fills the Comment textarea with the given text.
         * @param {string} text
         */
        async fillComment(text, root = null) {
            root = root || this.getActivePanel();
            const commentTA = await this.waitForElement('textarea.uiInputTextArea', 5000, root);
            if (!commentTA) throw new Error("Could not find Comment textarea in active panel.");

            commentTA.focus();
            commentTA.click();
            await this.delay(50);

            commentTA.value = text;
            commentTA.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
            commentTA.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
            await this.delay(100);
        },

        /**
         * Clicks the Salesforce Save button in the publisher.
         * @param {number} [waitMs=1000] - How long to wait after clicking for the save to complete.
         */
        async clickSaveButton(waitMs = 500, root = null) {
            const panel = root || this.getActivePanel();
            const saveBtn = await this.waitForElement('button.cuf-publisherShareButton.slds-button--brand, button.slds-button_brand[title="Save"], button[name="SaveEdit"]', 5000, panel);
            if (!saveBtn) throw new Error("Could not find Save button in active panel.");

            saveBtn.click();
            await this.delay(waitMs);
        },

        /**
         * Builds the FTR Comment string.
         * Supports multiple CL numbers with individual results.
         * Respects trigger checkboxes (NCL/Email/SMS) for the send message.
         * @param {string} clientId
         * @param {Object} config
         * @param {Array} config.clResults - Array of { phone, index, result } per CL number
         * @param {string} [config.customFtrText] - Optional text appended to each CL line
         * @param {string} [config.reason] - Reason text (shown if no CL result contains "LVM")
         * @param {boolean} config.triggerNCL - Whether NCL trigger is checked
         * @param {boolean} config.triggerSMS - Whether SMS trigger is checked
         * @param {boolean} config.triggerEmail - Whether Email trigger is checked
         * @param {string} [config.wnResult] - WN result text (empty = no WN, "No WN" = explicit no)
         * @param {string} [config.wnCustomText] - Custom text for WN "Reached" result
         * @returns {string} The formatted comment string
         */
        buildFTRComment(clientId, config) {
            const { clResults, customFtrText, reason, triggerNCL, triggerSMS, triggerEmail, wnResult, wnCustomText } = config;

            // ── CL Lines (one per number) ──
            const lines = [];
            const anyLVM = clResults.some(r => r.result.toUpperCase().includes('LVM'));

            clResults.forEach((r, idx) => {
                const phoneDisplay = app.Core.Utils.formatPhoneNumber(r.phone) || r.phone;
                let line = `FTR CL @ ${phoneDisplay} - ${r.result}`;
                // Append custom text and reason to the last CL line (not separate lines)
                if (idx === clResults.length - 1) {
                    if (customFtrText && customFtrText.trim()) {
                        line += ' - ' + customFtrText.trim();
                    }
                    if (!anyLVM && reason && reason.trim()) {
                        line += ' - ' + reason.trim();
                    }
                }
                lines.push(line);
            });

            // ── Send message based on trigger checkboxes ──
            const activeTriggers = [];
            if (triggerNCL) activeTriggers.push('NCL');
            if (triggerEmail) activeTriggers.push('Email');
            if (triggerSMS) activeTriggers.push('SMS');

            if (activeTriggers.length > 0) {
                lines.push('Send ' + activeTriggers.join(', '));
            }

            let comment = lines.join('\n');

            // ── WN line ──
            const hasWN = wnResult && wnResult !== 'No WN' && wnResult.trim() !== '';
            if (hasWN) {
                const wnPhone = this.getWNPhone(clientId);
                let wnLine = '';
                if (wnResult === 'Reached') {
                    wnLine = `Called WN @ ${wnPhone}${wnCustomText ? ', ' + wnCustomText : ''}`;
                } else {
                    wnLine = `FTR WN @ ${wnPhone}, ${wnResult}`;
                }
                comment += '\n' + wnLine;
            } else if (wnResult === 'No WN') {
                comment += '\nNo WN listed';
            }

            return comment;
        },

        /**
         * Orchestrates the complete FTR (Failed to Reach) Logger sequence.
         *
         * Flow:
         * 1. Click "Last Activity" → fill Subject → fill Comment → PAUSE for user confirmation.
         * 2. On confirm — click Save.
         * 3. If WN result selected (not empty/No WN) — repeat Last Activity → fill new WN comment → auto-save.
         * 4. Based on individual trigger flags (triggerNCL / triggerEmail / triggerSMS) — trigger
         *    the corresponding automations sequentially (NCL → Email → SMS order).
         *
         * @param {string} clientId
         * @param {Object} config - FTR configuration object (see buildFTRComment).
         *   - config.wnResult: empty = no WN, "No WN" = explicit no, any other = WN result text
         * @param {string} [commentOverride] - If provided, use this exact string as the comment instead of building it.
         * @returns {Promise<{ comment: string }>} Resolves with the comment string that was used.
         */
        async runFTR(clientId, config, commentOverride = null) {
            try {
                // 1. First Entry: Client (CL)
                const clPanel = await this.clickLastActivity();
                await this.fillSubject('Call to Client/FTR', clPanel);
                const comment = commentOverride || this.buildFTRComment(clientId, config);
                await this.fillComment(comment, clPanel);
                await this.clickSaveButton(300, clPanel);

                // 2. Second Entry: Witness Number (WN)
                const hasWN = config.wnResult && config.wnResult !== 'No WN' && config.wnResult.trim() !== '';
                if (hasWN) {
                    const wnPanel = await this.clickLastActivity();
                    // User requested 2nd log to be IDENTICAL to the first
                    await this.fillSubject('Call to Client/FTR', wnPanel);
                    await this.fillComment(comment, wnPanel);
                    await this.clickSaveButton(300, wnPanel);
                }

                // 3. Wait for any lingering FTR docked panels to fully close before triggering automations
                for (let i = 0; i < 30; i++) {
                    const visibleDocked = Array.from(document.querySelectorAll('.forceDockingPanel.DOCKED'))
                        .filter(p => p.offsetParent !== null && !p.classList.contains('slds-hide'));
                    if (visibleDocked.length === 0) break;
                    await this.delay(200);
                }

                // 4. Parallel automations based on trigger flags
                // NCL fires first, then Email starts 1s later without waiting for NCL to finish
                const savedTemplates = GM_getValue('sn_templates', {});
                const emailOrder = GM_getValue('sn_templates_email_order', []);
                const smsOrder = GM_getValue('sn_templates_sms_order', []);

                if (config.triggerNCL) {
                    // Start NCL without blocking — Email will fire 1s later
                    const nclPromise = this.runNCL(clientId).catch(err => console.error("[FTR] NCL parallel error:", err));
                    await this.delay(1000);

                    if (config.triggerEmail) {
                        let emailTmpl = null;
                        if (savedTemplates.email) {
                            const allEmail = savedTemplates.email;
                            const firstKey = emailOrder.find(k => allEmail[k]) || Object.keys(allEmail)[0];
                            if (firstKey) emailTmpl = allEmail[firstKey];
                        }
                        // Fire Email while NCL is still running
                        const emailPromise = this.runEmail(clientId, emailTmpl).catch(err => console.error("[FTR] Email parallel error:", err));
                        // Wait for both to finish
                        await Promise.all([nclPromise, emailPromise]);
                    } else {
                        await nclPromise;
                    }
                    await this.delay(500);
                } else if (config.triggerEmail) {
                    // No NCL — just run Email sequentially
                    let emailTmpl = null;
                    if (savedTemplates.email) {
                        const allEmail = savedTemplates.email;
                        const firstKey = emailOrder.find(k => allEmail[k]) || Object.keys(allEmail)[0];
                        if (firstKey) {
                            emailTmpl = allEmail[firstKey];
                        }
                    }
                    await this.runEmail(clientId, emailTmpl);
                    await this.delay(500);
                }
                
                if (config.triggerSMS) {
                    // Use the user's first saved SMS template (by order), or fallback
                    let smsTmpl = null;
                    if (savedTemplates.sms) {
                        const allSms = savedTemplates.sms;
                        const firstKey = smsOrder.find(k => allSms[k]) || Object.keys(allSms)[0];
                        if (firstKey) {
                            smsTmpl = allSms[firstKey];
                        }
                    }
                    
                    if (!smsTmpl) {
                        smsTmpl = { body: `Hello {{clientName}}, this is {{cmName}} with Kirkendall Dwyer. Please call me back at {{cmPhone}} regarding your SSD claim. Thank you.` };
                    }
                    
                    await this.sendSMS(clientId, smsTmpl);
                }

                return { comment };
            } catch (error) {
                console.error("❌ FTR Automation Error:", error);
                throw error;
            }
        },

        /**
         * Creates a FACT (Fact) log entry with "DDS Status Update" type.
         * Flow:
         * 1. Click Fact Type combobox → select "DDS Status Update"
         * 2. Click "Start New Fact" button
         * 3. Wait ~5s for flexipage panel to fully load
         * 4. Fill the content textarea with the provided text
         * 5. Click Save button (name="SaveEdit")
         *
         * @param {string} content - The content text to fill in the FACT
         */
        async runFACTLog(content) {
            if (!content || !content.trim()) {
                throw new Error("No content provided for FACT log.");
            }

            // 1. Find and click the Fact Type combobox (scoped inside the "New SSD Facts" card)
            let factTypeBtn = null;
            for (let i = 0; i < 20; i++) {
                const factsCard = document.querySelector('article.slds-card');
                if (factsCard && factsCard.textContent.includes('New SSD Facts')) {
                    factTypeBtn = factsCard.querySelector('button.slds-combobox__input[name="factType"]');
                }
                if (!factTypeBtn) {
                    factTypeBtn = document.querySelector(
                        'button.slds-combobox__input[name="factType"], button[aria-label="Type"][name="factType"]'
                    );
                }
                if (factTypeBtn) break;
                await this.delay(200);
            }

            if (!factTypeBtn) throw new Error("Could not find Fact Type combobox.");

            factTypeBtn.click();
            await this.delay(400);

            // 2. Select "DDS Status Update" from the dropdown
            let ddsOption = null;
            for (let i = 0; i < 15; i++) {
                ddsOption = document.querySelector(
                    'span[title="DDS Status Update"], [role="option"][title="DDS Status Update"]'
                );
                if (!ddsOption) {
                    const allOptions = document.querySelectorAll(
                        '[role="option"], .slds-listbox__item, li[role="option"]'
                    );
                    ddsOption = Array.from(allOptions).find(opt =>
                        (opt.textContent || '').trim() === 'DDS Status Update'
                    );
                }
                if (ddsOption) break;
                await this.delay(200);
            }

            if (!ddsOption) throw new Error("Could not find 'DDS Status Update' option.");

            ddsOption.click();
            await this.delay(400);

            // 3. Click "Start New Fact" button (scoped inside the "New SSD Facts" card)
            let startFactBtn = null;
            for (let i = 0; i < 20; i++) {
                const factsCard = document.querySelector('article.slds-card');
                if (factsCard && factsCard.textContent.includes('New SSD Facts')) {
                    startFactBtn = factsCard.querySelector('button.slds-button_brand[name="save"]');
                }
                if (!startFactBtn) {
                    const allBrandBtns = document.querySelectorAll('button.slds-button_brand');
                    startFactBtn = Array.from(allBrandBtns).find(btn =>
                        (btn.textContent || '').trim() === 'Start New Fact'
                    );
                }
                if (startFactBtn) break;
                await this.delay(200);
            }

            if (!startFactBtn) throw new Error("Could not find 'Start New Fact' button.");

            startFactBtn.click();

            // 4. Wait for flexipage panel to fully load (takes 4-5s)
            await this.delay(5000);

            // 5. Find and fill the textarea inside the flexipage
            const contentTA = await this.waitForElement(
                'one-record-action-flexipage textarea.slds-textarea, .flexipage textarea.slds-textarea',
                8000
            );

            if (!contentTA) throw new Error("Could not find FACT content textarea.");

            contentTA.focus();
            contentTA.click();
            await this.delay(50);

            contentTA.value = content;
            contentTA.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
            contentTA.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
            await this.delay(200);

            // 6. Leave FACT filled for user confirmation — do NOT auto-save
            await this.delay(200);
        },

        /**
         * Creates a FACT (Fact) log entry with a custom fact type.
         * Flow:
         * 1. Click Fact Type combobox → select the specified factType
         * 2. Click "Start New Fact" button
         * 3. Wait ~5s for flexipage panel to fully load
         * 4. Fill the content textarea with the provided text
         * 5. Leave FACT filled for user confirmation (do NOT auto-save)
         *
         * @param {string} content - The content text to fill in the FACT
         * @param {string} factType - The type of fact to create (e.g., "CM1 Update Attempt")
         */
        async runFACTLog(content, factType = "DDS Status Update") {
            if (!content || !content.trim()) {
                throw new Error("No content provided for FACT log.");
            }

            // 1. Find and click the Fact Type combobox (scoped inside the "New SSD Facts" card)
            let factTypeBtn = null;
            for (let i = 0; i < 20; i++) {
                const factsCard = document.querySelector('article.slds-card');
                if (factsCard && factsCard.textContent.includes('New SSD Facts')) {
                    factTypeBtn = factsCard.querySelector('button.slds-combobox__input[name="factType"]');
                }
                if (!factTypeBtn) {
                    factTypeBtn = document.querySelector(
                        'button.slds-combobox__input[name="factType"], button[aria-label="Type"][name="factType"]'
                    );
                }
                if (factTypeBtn) break;
                await this.delay(200);
            }

            if (!factTypeBtn) throw new Error("Could not find Fact Type combobox.");

            factTypeBtn.click();
            await this.delay(400);

            // 2. Select the specified fact type from the dropdown
            let factOption = null;
            for (let i = 0; i < 15; i++) {
                factOption = document.querySelector(
                    `span[title="${factType}"], [role="option"][title="${factType}"]`
                );
                if (!factOption) {
                    const allOptions = document.querySelectorAll(
                        '[role="option"], .slds-listbox__item, li[role="option"]'
                    );
                    factOption = Array.from(allOptions).find(opt =>
                        (opt.textContent || '').trim() === factType
                    );
                }
                if (factOption) break;
                await this.delay(200);
            }

            if (!factOption) throw new Error(`Could not find '${factType}' option.`);

            factOption.click();
            await this.delay(400);

            // 3. Click "Start New Fact" button (scoped inside the "New SSD Facts" card)
            let startFactBtn = null;
            for (let i = 0; i < 20; i++) {
                const factsCard = document.querySelector('article.slds-card');
                if (factsCard && factsCard.textContent.includes('New SSD Facts')) {
                    startFactBtn = factsCard.querySelector('button.slds-button_brand[name="save"]');
                }
                if (!startFactBtn) {
                    const allBrandBtns = document.querySelectorAll('button.slds-button_brand');
                    startFactBtn = Array.from(allBrandBtns).find(btn =>
                        (btn.textContent || '').trim() === 'Start New Fact'
                    );
                }
                if (startFactBtn) break;
                await this.delay(200);
            }

            if (!startFactBtn) throw new Error("Could not find 'Start New Fact' button.");

            startFactBtn.click();

            // 4. Wait for flexipage panel to fully load (takes 4-5s)
            await this.delay(5000);

            // 5. Find and fill the textarea inside the flexipage
            const contentTA = await this.waitForElement(
                'one-record-action-flexipage textarea.slds-textarea, .flexipage textarea.slds-textarea',
                8000
            );

            if (!contentTA) throw new Error("Could not find FACT content textarea.");

            contentTA.focus();
            contentTA.click();
            await this.delay(50);

            contentTA.value = content;
            contentTA.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
            contentTA.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
            await this.delay(200);

            // 6. Leave FACT filled for user confirmation — do NOT auto-save
            await this.delay(200);
        },

        /**
         * Generates the HTML signature block for emails.
         */
        getSignature() {
            const cmName = GM_getValue('sn_global_cm1', 'Kant Nguyen');
            const cmExt = GM_getValue('sn_global_ext', '1072');
            const cmPhone = `(214) 271-4027${cmExt ? ' Ext. ' + cmExt : ''}`;
            let cmEmail = 'casemanager@kirkendalldwyer.com';

            try {
                const fromLinks = this.queryAllDeep('a.select');
                const fromLink = fromLinks.find(el => el.innerText && el.innerText.includes('@') && el.innerText.includes('<'));
                if (fromLink) {
                    const match = fromLink.innerText.match(/<([^>]+)>/);
                    if (match) cmEmail = match[1];
                }
            } catch (e) { }

            return `
                <p>${cmName}<br>Case Manager I<br>Kirkendall Dwyer LLP<br>T: ${cmPhone}<br>F: 214.292.6581<br>E: ${cmEmail}<br>4343 Sigma Rd. Suite 200, Dallas, TX 75244</p>
                <p style="font-size:10px; color:gray;">Confidentiality Notice: The information contained in this e-mail and any attachments to it may be legally privileged and include confidential information intended only for the recipient(s) identified above. If you are not one of those intended recipients, you are hereby notified that any dissemination, distribution or copying of this e-mail or its attachments is strictly prohibited. If you have received this e-mail in error, please notify the sender of that fact by return e-mail and permanently delete the e-mail and any attachments to it immediately. Please do not retain, copy or use this e-mail or its attachments for any purpose, nor disclose all or any part of its contents to any other person. Thank you.</p>
            `;
        }
    };

    app.Automation.TaskAutomation = TaskAutomation;
})();