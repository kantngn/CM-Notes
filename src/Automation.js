(function(app) {
    'use strict';

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
                await new Promise(r => setTimeout(r, 500)); // Wait for modal
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
                            await this.delay(300); // Allow animation to finish
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
                            <p>This is a message from Kirkendall Dwyer - Social Security Division. We haven't been able to reach you by phone and wanted to follow up regarding your Social Security Disability claim.</p>  
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

    // Assign to namespace
    Object.assign(app.Automation, { MailResolve, TaskAutomation });

})(window.CM_App = window.CM_App || {});