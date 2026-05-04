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
        waitForElement: (sel, max) => app.Core.Utils.waitForElement(sel, max),

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
            newTaskBtn.click();

            // Step 2: Set Subject 
            const subjectInput = await this.waitForElement('input[aria-label="Subject"]');
            if (!subjectInput) throw new Error("Could not find Subject input.");

            subjectInput.focus();
            subjectInput.click();
            subjectInput.value = "Rose Letter 01 - NC to Client";
            subjectInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
            subjectInput.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
            await this.delay(200);
        },

        async ncl_step2() {
            // Step 3: Set Due Date
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
                dateInput = this.queryDeep('lightning-datepicker input');
            }

            if (dateInput) {
                dateInput.value = todayStr;
                dateInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                dateInput.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
            }
            await this.delay(50);

            // Step 4: Set Type to "Send Letter"
            let typeTrigger = null;
            for (let i = 0; i < 10; i++) {
                const typeContainer = this.queryDeep('div[data-target-selection-name="sfdc:RecordField.Task.Type"]');
                if (typeContainer) {
                    typeTrigger = typeContainer.querySelector('a.select');
                }
                if (typeTrigger) break;
                await this.delay(300);
            }

            if (typeTrigger) {
                typeTrigger.click();
                await this.delay(600);

                const options = this.queryAllDeep('a[role="option"], li.uiMenuItem a');
                const sendLetterOption = Array.from(options).find(opt =>
                    opt.getAttribute('title') === 'Send Letter' ||
                    (opt.textContent || "").trim() === 'Send Letter'
                );

                if (sendLetterOption) {
                    if (typeof sendLetterOption.focus === 'function') sendLetterOption.focus();
                    sendLetterOption.click();
                    await this.delay(300);
                }
            }
        },

        async ncl_step3() {
            // Step 5: Reassign to Rose Robot
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
                await this.delay(300);
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

            // Wait for results to populate
            await this.waitForElement('a[role="option"]', 5000);
            await this.delay(500);

            const allOptions = this.queryAllDeep('a[role="option"]');
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
                await this.delay(500);
            }

            // Step 6: Save
            const saveBtn = await this.waitForElement('button[name="SaveEdit"], button.slds-button[title="Save"]');
            if (saveBtn) saveBtn.click();
        },

        /**
         * Orchestrates the complete 3-step automation for creating a "Non-Client Letter" (NCL)
         * task in Salesforce and assigning it to the 'Rose Robot'.
         * @param {string} clientId - The ID of the current client record.
         */
        async runNCL(clientId) {
            try {
                await this.ncl_step1();
                await this.ncl_step2();
                await this.ncl_step3();
            } catch (error) {
                console.error("❌ NCL Automation Error: " + error.message);
                throw error;
            }
        },

        /**
         * Orchestrates the complete automation for drafting a follow-up email.
         * Fills in the recipient, subject, and injects a template into the CKEditor iframe.
         * @param {string} clientId - The ID of the current client record.
         * @param {Object} [template=null] - Optional template object {subject, body}.
         */
        async runEmail(clientId, template = null) {
            try {
                await this.email_step1();
                await this.email_step2(clientId);
                await this.email_step3(clientId, template);
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
                let smsTab = await this.waitForElement('a[data-label="SMS"], a.slds-tabs_default__link[data-label="SMS"]', 4000);

                if (!smsTab) {
                    const allTabs = this.queryAllDeep('a.slds-tabs_default__link, .slds-tabs_default__link');
                    smsTab = allTabs.find(el => el.textContent.trim().toUpperCase() === 'SMS');
                }

                if (smsTab) {
                    if (typeof smsTab.focus === 'function') smsTab.focus();
                    smsTab.click();

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
                        smsInput.value = template.body;

                        // Dispatch events
                        smsInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                        smsInput.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
                        return;
                    }
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
            emailBtn.click();

            // Wait for the email composer to open by specifically targeting the subject field
            // with the placeholder "Enter Subject...". This is more reliable than a fixed delay
            // and avoids accidentally selecting the subject from the previous NCL modal.
            const subjectInput = await this.waitForElement('input[placeholder="Enter Subject..."]', 5000);
            if (!subjectInput) throw new Error("Email composer's subject field did not appear.");
        },

        async email_step2(clientId) {
            // Data Prep
            const formData = GM_getValue('cn_form_data_' + clientId, {});
            const emailAddr = formData['Email'] || '';
            if (!emailAddr) console.warn("⚠️ No email address found in scraped data.");

            // Step 2: Clear BCC
            const bccList = this.queryDeep('ul[aria-label="Bcc"]');
            if (bccList) {
                const bccDeletes = this.queryAllDeep('.deleteAction, .slds-pill__remove, button[title="Remove"]', bccList);
                for (let btn of bccDeletes) {
                    btn.click();
                    await this.delay(300);
                }
            }

            // Step 3: Fill "To"
            const toList = this.queryDeep('ul[aria-label="To"]');
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

        async email_step3(clientId, template = null) {
            // Data Prep
            const clientData = GM_getValue('cn_' + clientId, {});
            const clientName = clientData.name || 'Client';

            // Step 4: Fill Subject
            const subjectInput = await this.waitForElement('input[placeholder="Enter Subject..."]', 2000);
            if (!subjectInput) throw new Error("Email composer's subject field not found.");

            const subjectText = template ? template.subject : "Message from your SSD Case Manager";

            subjectInput.focus();
            subjectInput.value = subjectText;
            subjectInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
            subjectInput.dispatchEvent(new Event('change', { bubbles: true, composed: true }));

            // Step 5: Fill Body
            const signature = this.getSignature();
            let bodyHTML = template ? template.body : `
                <p>Dear ${clientName},</p>
                <p>This is a message from Kirkendall Dwyer - Social Security Division. We haven't been able to reach you by phone and wanted to follow up regarding your Social Security Disability claim.</p>  
                <p>Please contact our office as soon as possible to discuss an important matter regarding your claim.</p>
                <p>Thank you.</p>
            `;

            // Append signature if not already present or if it's a template that needs it
            if (!bodyHTML.includes('Confidentiality Notice')) {
                bodyHTML += '<br>' + signature;
            }

            // Grab the OUTER iframe
            const outerIframe = await this.waitForElement('iframe[title="Email Body"], iframe[name^="vfFrameId"]', 8000);
            if (!outerIframe) throw new Error("Could not find outer email iframe after 8 seconds.");


            let editorBody = null;
            let elapsed = 0;

            while (elapsed < 5000) {
                try {
                    // 1. Enter the outer iframe
                    const outerDoc = outerIframe.contentDocument || outerIframe.contentWindow?.document;
                    if (outerDoc) {

                        // 2. Look for the inner CKEditor iframe
                        const innerIframe = outerDoc.querySelector('iframe.cke_wysiwyg_frame');

                        if (innerIframe) {
                            // 3. Enter the inner iframe
                            const innerDoc = innerIframe.contentDocument || innerIframe.contentWindow?.document;
                            if (innerDoc) {
                                // 4. Find the actual editable body
                                const body = innerDoc.querySelector('body.cke_editable');
                                if (body) {
                                    editorBody = body;
                                    break; // Found it! Exit the loop.
                                }
                            }
                        } else {
                            // Fallback: If Salesforce updates and removes the inner iframe
                            const body = outerDoc.querySelector('body');
                            if (body && (body.isContentEditable || body.getAttribute('contenteditable') === 'true')) {
                                editorBody = body;
                                break;
                            }
                        }
                    }
                } catch (e) {
                    /* Ignore Cross-Origin errors that happen briefly while frames are loading */
                }

                await this.delay(200);
                elapsed += 200;
            }

            if (editorBody) {
                // Force focus
                if (typeof editorBody.focus === 'function') editorBody.focus();

                // Inject the HTML
                editorBody.innerHTML = bodyHTML;

                // Dispatch events
                editorBody.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                editorBody.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
                editorBody.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, composed: true, key: 'Space', code: 'Space' }));

            } else {
                throw new Error("Email body could not be found for editing after 5 seconds.");
            }
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
         * Clicks the "Last Activity" button and waits for the publisher to appear.
         */
        async clickLastActivity() {
            const lastActivityBtn = await this.waitForElement('button[title="Last Activity"]', 5000);
            if (!lastActivityBtn) throw new Error("Could not find 'Last Activity' button.");
            lastActivityBtn.click();
            await this.delay(600);
        },

        /**
         * Fills the Subject input with the given text.
         * @param {string} text
         */
        async fillSubject(text) {
            const subjectInput = await this.waitForElement('input.slds-combobox__input[aria-label="Subject"]', 5000);
            if (!subjectInput) throw new Error("Could not find Subject input.");
            subjectInput.focus();
            subjectInput.value = text;
            subjectInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
            subjectInput.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
            await this.delay(200);
        },

        /**
         * Fills the Comment textarea with the given text.
         * @param {string} text
         */
        async fillComment(text) {
            const commentTA = await this.waitForElement('textarea.uiInputTextArea', 5000);
            if (!commentTA) throw new Error("Could not find Comment textarea.");
            commentTA.focus();
            commentTA.value = text;
            commentTA.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
            commentTA.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
            await this.delay(200);
        },

        /**
         * Clicks the Salesforce Save button in the publisher.
         * @param {number} [waitMs=1000] - How long to wait after clicking for the save to complete.
         */
        async clickSaveButton(waitMs = 1000) {
            const saveBtn = await this.waitForElement('button.cuf-publisherShareButton.slds-button--brand', 5000);
            if (!saveBtn) throw new Error("Could not find Save button.");
            saveBtn.click();
            await this.delay(waitMs);
        },

        /**
         * Builds the FTR Comment string.
         * @param {string} clientId
         * @param {Object} config
         * @param {string} config.ftrResult - Full FTR result text
         * @param {string} [config.customFtrText] - Optional text appended after ftrResult
         * @param {string} [config.reason] - Reason text (ignored if ftrResult contains "LVM")
         * @param {string} config.nclOption - "NCL" or "No NCL"
         * @param {string} [config.wnResult] - WN result text (empty = no WN, "No WN" = explicit no, else WN result)
         * @returns {string} The formatted comment string
         */
        buildFTRComment(clientId, config) {
            const { ftrResult, customFtrText, reason, nclOption, wnResult, wnCustomText } = config;
            const clPhone = this.getCLPhone(clientId);

            // Build the FTR result portion with optional custom text
            let ftrPortion = ftrResult;
            if (customFtrText && customFtrText.trim()) {
                ftrPortion += ' ' + customFtrText.trim();
            }

            // Reason line — hidden if FTR contains "LVM"
            const hasLVM = ftrResult.toUpperCase().includes('LVM');
            let reasonLine = '';
            if (!hasLVM && reason && reason.trim()) {
                reasonLine = ' | ' + reason.trim();
            }

            // NCL message
            const nclMsg = nclOption === 'NCL'
                ? ' | Send SMS Email NCL to ask for CL call back'
                : ' | No NCL';

            // CL line
            let comment = `FTR CL @ ${clPhone} - ${ftrPortion}${reasonLine}${nclMsg}`;

            // WN line — always "Called WN @ {WN Number}, {FTR Result}" if a WN result is selected
            // and it's not empty/No WN
            const hasWN = wnResult && wnResult !== 'No WN' && wnResult.trim() !== '';
            if (hasWN) {
                const wnPhone = this.getWNPhone(clientId);
                let wnLine = '';
                if (wnResult === 'Reached') {
                    wnLine = `Reached WN @ ${wnPhone}${wnCustomText ? ', ' + wnCustomText : ''}`;
                } else {
                    wnLine = `Called WN @ ${wnPhone}, ${wnResult}`;
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
         * 4. Based on individual trigger flags (triggerNCL / triggerSMS / triggerEmail) — trigger
         *    the corresponding automations sequentially (NCL → SMS → Email order).
         *
         * @param {string} clientId
         * @param {Object} config - FTR configuration object (see buildFTRComment).
         *   - config.wnResult: empty = no WN, "No WN" = explicit no, any other = WN result text
         * @param {string} [commentOverride] - If provided, use this exact string as the comment instead of building it.
         * @returns {Promise<{ comment: string }>} Resolves with the comment string that was used.
         */
        async runFTR(clientId, config, commentOverride = null) {
            try {
                // 1. Click Last Activity
                await this.clickLastActivity();

                // 2. Fill Subject
                await this.fillSubject('Call to Client/FTR');

                // 3. Build & fill Comment
                const comment = commentOverride || this.buildFTRComment(clientId, config);
                await this.fillComment(comment);

                // Determine if WN is active (has a real result selected)
                const hasWN = config.wnResult && config.wnResult !== 'No WN' && config.wnResult.trim() !== '';

                // ⏸ Pause — user must click "Confirm & Save" from the panel
                this._ftrState = { clientId, config, comment, hasWN };

                return { comment };
            } catch (error) {
                console.error("❌ FTR Automation Error:", error);
                delete this._ftrState;
                throw error;
            }
        },

        /**
         * Called by the AutomationPanel after the user clicks "Confirm & Save".
         * Saves the current FTR entry and handles WN loop + sequential automations.
         * @returns {Promise<void>}
         */
        async confirmAndSaveFTR() {
            const state = this._ftrState;
            if (!state) throw new Error("No FTR state found. Run FTR first.");

            const { clientId, config, comment, hasWN } = state;

            // 1. Click Save (first entry — CL entry)
            await this.clickSaveButton(1200);

            // 2. If a WN result was selected (not empty, not "No WN") — second entry with auto-save
            if (hasWN) {
                await this.clickLastActivity();
                await this.fillSubject(config.wnResult === 'Reached' ? 'Reached WN' : 'Called WN');
                // Build a WN-specific comment
                const wnPhone = this.getWNPhone(clientId);
                let wnComment = '';
                if (config.wnResult === 'Reached') {
                    wnComment = `Reached WN @ ${wnPhone}${config.wnCustomText ? ', ' + config.wnCustomText : ''}`;
                } else {
                    wnComment = `Called WN @ ${wnPhone}, ${config.wnResult}`;
                }
                await this.fillComment(wnComment);
                // Auto-save (no user confirmation)
                await this.clickSaveButton(1200);
            }

            // 3. Sequential automations based on individual trigger flags (NCL → SMS → Email)
            const activeTriggers = [];
            if (config.triggerNCL) activeTriggers.push('NCL');
            if (config.triggerSMS) activeTriggers.push('SMS');
            if (config.triggerEmail) activeTriggers.push('Email');

            if (activeTriggers.length > 0) {
                app.Core.Utils.showNotification(`FTR saved. Starting ${activeTriggers.join(' → ')} sequence...`, { type: 'info', duration: 3000 });
                await this.delay(500);

                if (config.triggerNCL) {
                    await this.runNCL(clientId);
                    await this.delay(800);
                }
                if (config.triggerSMS) {
                    const smsBody = `Hello {{clientName}}, this is {{cmName}} with Kirkendall Dwyer. Please call me back at {{cmPhone}} regarding your SSD claim. Thank you.`;
                    await this.sendSMS(clientId, { body: smsBody });
                    await this.delay(800);
                }
                if (config.triggerEmail) {
                    await this.runEmail(clientId, null);
                    await this.delay(500);
                }
            }

            // Clean up state
            delete this._ftrState;
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