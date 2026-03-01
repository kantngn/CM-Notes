(function () {
    const app = window.CM_App = window.CM_App || {};
    app.Automation = app.Automation || {};

    const TaskAutomation = {
        delay: ms => new Promise(res => setTimeout(res, ms)),

        queryDeep(selector, root = document) {
            let el = root.querySelector(selector);
            if (el) return el;
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
                // Step 1: Click "New Task"
                console.log("Step 1: Waiting for New Task button...");
                const newTaskBtn = await this.waitForElement('button[title="New Task"]');
                if (!newTaskBtn) throw new Error("Could not find 'New Task' button.");
                newTaskBtn.click();

                // Step 2: Set Subject 
                console.log("Step 2: Waiting for Subject input to render...");
                const subjectInput = await this.waitForElement('input[aria-label="Subject"]');
                if (!subjectInput) throw new Error("Could not find Subject input.");

                subjectInput.focus();
                subjectInput.click();
                subjectInput.value = "Rose Letter 01 - NC to Client";
                subjectInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                subjectInput.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
                await this.delay(200);

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

                // Step 4: Set Type to "Send Letter"
                console.log("Step 4: Setting Type to 'Send Letter'...");
                let typeTrigger = null;

                // 🔄 1. Find and click the trigger to open the menu
                for (let i = 0; i < 10; i++) {
                    const typeContainer = this.queryDeep('div[data-target-selection-name="sfdc:RecordField.Task.Type"]');
                    if (typeContainer) {
                        typeTrigger = typeContainer.querySelector('a.select');
                    }

                    if (typeTrigger) break;
                    await this.delay(300);
                }

                if (typeTrigger) {
                    typeTrigger.click(); // Open dropdown
                    await this.delay(600); // Crucial: Wait for the popup menu to attach to the DOM

                    // 🎯 2. Find the exact option based on your screenshot
                    // Looking for <a> tags with role="option" or inside the uiMenuItem list
                    const options = this.queryAllDeep('a[role="option"], li.uiMenuItem a');

                    const sendLetterOption = Array.from(options).find(opt =>
                        opt.getAttribute('title') === 'Send Letter' ||
                        (opt.textContent || "").trim() === 'Send Letter'
                    );

                    if (sendLetterOption) {
                        console.log("✅ Found 'Send Letter' option. Clicking...");

                        // Force focus before clicking to satisfy Salesforce Aura requirements
                        if (typeof sendLetterOption.focus === 'function') sendLetterOption.focus();
                        sendLetterOption.click();

                        await this.delay(300); // Brief pause to let the selection register
                    } else {
                        console.log("⚠️ 'Send Letter' option not found. Found options:", Array.from(options).map(o => o.getAttribute('title') || o.textContent));
                    }
                } else {
                    console.log("⚠️ Could not find the 'Type' dropdown trigger after 3 seconds.");
                }

                // Step 5: Reassign to Rose Robot
                console.log("Step 5: Reassigning to Rose...");
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

                console.log("   -> Waiting for 'Rose Robot' option to appear...");
                const roseRobotOptionEl = await this.waitForElement('a[role="option"] [title="Rose Robot"]', 5000);

                if (roseRobotOptionEl) {
                    const parentOption = roseRobotOptionEl.closest('a[role="option"]');
                    const hasCM1 = parentOption ? parentOption.querySelector('[title="CM 1"]') : null;
                    if (parentOption && hasCM1) {
                        console.log("✅ Found Rose Robot with CM 1 subtitle. Clicking...");
                        parentOption.click();
                    } else {
                        console.log("⚠️ Found 'Rose Robot' but not with 'CM 1' subtitle. Not clicking.");
                    }
                } else {
                    console.log("⚠️ Could not find 'Rose Robot' in the search results after 5 seconds.");
                }

                // Step 6: Halt for Manual Save
                console.log("Step 6: Halting before Save...");
                console.log("✅ Automation paused. Please review the inputs and manually click the 'Save' button.");

                // Step 7: Wait for Modal Close (User Save) then Email
                console.log("⏳ Waiting for Task Modal to close before sending email...");
                while (this.queryDeep('div.modal-container.slds-modal__container') || this.queryDeep('div.slds-modal__container')) {
                    await this.delay(100);
                }

                console.log("✅ Modal closed. Waiting 1000ms...");
                await this.delay(200);
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
                emailBtn.click();
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
                } catch (e) { console.log("Email scrape failed", e); }
                // -------------------------

                // Grab the OUTER iframe
                const outerIframe = await this.waitForElement('iframe[title="Email Body"], iframe[name^="vfFrameId"]', 8000);
                if (!outerIframe) throw new Error("Could not find outer email iframe after 8 seconds.");

                console.log("   -> Outer iframe found. Searching for CKEditor inner iframe...");
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
                    console.log("   -> Body is ready. Injecting content.");

                    // Force focus so CKEditor knows we are interacting with it
                    if (typeof editorBody.focus === 'function') editorBody.focus();

                    // Inject the HTML
                    editorBody.innerHTML = `
                        <p>Dear ${clientName},</p>
                        <p>This is a message from Kirkendall Dwyer - Social Security Division. We haven't been able to reach you by phone and wanted to follow up regarding your Social Security Disability claim.</p>  
                        <p>Please contact our office as soon as possible at ${cmPhone} to discuss an important matter regarding your claim.</p>
                        <p>Thank you.</p>
                        <br>
                        <p>${cmName}<br>Case Manager I<br>Kirkendall Dwyer LLP<br>T: ${cmPhone}<br>F: 214.292.6581<br>E: ${cmEmail}<br>4343 Sigma Rd. Suite 200, Dallas, TX 75244</p>
                        <p style="font-size:10px; color:gray;">Confidentiality Notice: The information contained in this e-mail and any attachments to it may be legally privileged and include confidential information intended only for the recipient(s) identified above. If you are not one of those intended recipients, you are hereby notified that any dissemination, distribution or copying of this e-mail or its attachments is strictly prohibited. If you have received this e-mail in error, please notify the sender of that fact by return e-mail and permanently delete the e-mail and any attachments to it immediately. Please do not retain, copy or use this e-mail or its attachments for any purpose, nor disclose all or any part of its contents to any other person. Thank you.</p>
                    `;

                    // 💥 Crucial for CKEditor: Dispatch events so the UI recognizes the change
                    // Without this, the "Send" button might remain grayed out or the email might send blank
                    editorBody.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                    editorBody.dispatchEvent(new Event('change', { bubbles: true, composed: true }));

                    // Simulate a keystroke to force CKEditor's internal change tracker to fire
                    editorBody.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, composed: true, key: 'Space', code: 'Space' }));

                    console.log("✅ Email template injected successfully!");

                } else {
                    throw new Error("Email body inner iframe was found, but its content was not ready for editing after 5 seconds.");
                }
            } catch (e) { console.error("Email Auto Error:", e); }
        }
    };

    app.Automation.TaskAutomation = TaskAutomation;
})();
