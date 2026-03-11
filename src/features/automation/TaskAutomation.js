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

            const roseRobotOptionEl = await this.waitForElement('a[role="option"] [title="Rose Robot"]', 5000);

            if (roseRobotOptionEl) {
                const parentOption = roseRobotOptionEl.closest('a[role="option"]');
                const hasCM1 = parentOption ? parentOption.querySelector('[title="CM 1"]') : null;
                if (parentOption && hasCM1) {
                    parentOption.click();
                }
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
                // Implementation for SMS typically involves finding the SMS tab/button
                // and filling a textarea. For now, we'll log it and show a notification.
                console.log(`[SMS] Sending to ${clientId}: ${template.body}`);
                
                // Try to find the SMS button/modal if it exists in the standard UI
                const smsTab = await this.waitForElement('button[title="SMS"], button[title="Send SMS"]', 2000);
                if (smsTab) {
                    smsTab.click();
                    const smsInput = await this.waitForElement('textarea[name="message"], .sms-input-field', 3000);
                    if (smsInput) {
                        smsInput.value = template.body;
                        smsInput.dispatchEvent(new Event('input', { bubbles: true }));
                        // We don't auto-send for safety, just fill.
                        return;
                    }
                }
                
                app.Core.Utils.showNotification("SMS Content Ready. Please paste into SMS field.", { type: 'info' });
                // Fallback: Copy to clipboard?
                await navigator.clipboard.writeText(template.body);
            } catch (e) {
                console.error("SMS Auto Error:", e);
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
