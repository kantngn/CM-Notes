(function () {
    const app = window.CM_App = window.CM_App || {};
    app.Automation = app.Automation || {};

    /**
     * Provides a floating UI panel containing buttons to trigger Salesforce automation scripts.
     * Interacts with `TaskAutomation` to execute steps for NCLs and Emails.
     * @namespace app.Automation.AutomationPanel
     */
    const AutomationPanel = {
        activeTab: 'NCL', // NCL, EMAIL, SMS
        nclExploded: false,

        // Hardcoded defaults used only on first run to seed the database
        seedTemplates: {
            email: {
                tmpl_ftr: { name: 'FTR', subject: 'Message from your SSD Case Manager', body: '<p>Dear {{clientName}},</p><p>This is a message from Kirkendall Dwyer - Social Security Division. We haven\'t been able to reach you by phone and wanted to follow up regarding your Social Security Disability claim.</p><p>Please contact our office as soon as possible to discuss an important matter regarding your claim.</p><p>Thank you.</p>' },
                tmpl_ssa: { name: 'SSA', subject: 'Creating your MY Social Security account on ssa.gov', body: '<p>Hello {{clientName}},</p><p>It was a pleasure speaking with you earlier regarding your claim. As we discussed, I am sending you the instructions to sign up for your "my Social Security" account. This is a vital tool that allows you to monitor your claim status and view important updates directly from the SSA.</p><p><b>Please follow these steps to create your account:</b></p><ol><li>Visit the official SSA website: <a href="https://www.ssa.gov/myaccount/">https://www.ssa.gov/myaccount/</a></li><li>Click the <b>"Create an Account"</b> button.</li><li>You will be asked to choose a credential provider. You can select either <b>Login.gov</b> or <b>ID.me</b>. Both are standard government-verified services; either choice will work perfectly for creating your account.</li><li>Simply follow the prompts from your chosen provider to verify your identity and finalize your registration.</li></ol><p>If you encounter any difficulty during the process, please don\'t hesitate to contact me.</p><p>Best Regards,</p>' },
                tmpl_med: { name: 'Med', subject: 'Request for medical information from your SSD Case Manager', body: '<p>Dear {{clientName}},</p><p>It was great talking with you today! To ensure we built the strongest possible case to fight for your claim, we need to gather some updated details regarding your medical treatment. Having a complete picture of your providers and medications is crucial for your success.</p><p><b>Please provide the following information for any new medical providers:</b></p><ol><li>Doctor\'s Name or Facility\'s Name</li><li>Office Address</li><li>Telephone Number</li><li>Date of your first visit and your last visit</li><li>Date of your next scheduled appointment</li></ol><p><b>Additionally, it would be beneficial to document your current medications:</b></p><ul><li>Medication name, dosage, and frequency</li><li>The prescribing doctor and when you started taking it</li></ul><p><i><b>Pro Tip:</b> To save time, you can simply take a picture of your prescription bottles/labels and send them to us! We can log all the details for you so you don\'t have to type them out manually.</i></p><p>Thank you for your help in moving your claim forward.</p><p>Sincerely,</p>' }
            },
            sms: {
                tmpl_follow: { name: 'Follow-up', body: 'Hello {{clientName}}, this is {{cmName}} with Kirkendall Dwyer. Please call me back at {{cmPhone}} regarding your SSD claim. Thank you.' }
            }
        },

        init() {
            if (document.getElementById('sn-auto-trigger')) return;
            // Ensure templates are initialized in storage
            if (!GM_getValue('sn_templates')) {
                GM_setValue('sn_templates', this.seedTemplates);
            }
            this.createTrigger();
        },

        createTrigger() {
            const triggerId = 'sn-auto-trigger';
            if (document.getElementById(triggerId)) return;

            const t = document.createElement('div');
            t.id = triggerId;
            t.title = "Open Automation Panel (Drag to move)";
            t.innerHTML = '🤖';
            
            t.style.cssText = `
                position: fixed;
                right: 0;
                width: 38px;
                height: 44px;
                background: var(--sn-primary-dark);
                color: white;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                z-index: 100005;
                border-radius: 20px 0 0 20px;
                box-shadow: -4px 0 12px rgba(0,0,0,0.15);
                font-size: 22px;
                transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                user-select: none;
                border: 1px solid rgba(255,255,255,0.1);
                border-right: none;
            `;

            const savedY = GM_getValue('sn_auto_trigger_y', '50%');
            t.style.top = savedY;

            t.onmouseenter = () => {
                t.style.background = 'var(--sn-primary)';
                t.style.width = '42px';
            };
            t.onmouseleave = () => {
                t.style.background = 'var(--sn-primary-dark)';
                t.style.width = '36px';
            };

            let isDragging = false;
            let startY = 0;
            let startTop = 0;

            t.onmousedown = (e) => {
                isDragging = false;
                startY = e.clientY;
                startTop = t.offsetTop;

                const onMouseMove = (moveEvent) => {
                    const deltaY = moveEvent.clientY - startY;
                    if (Math.abs(deltaY) > 5) isDragging = true;
                    
                    let newTop = startTop + deltaY;
                    newTop = Math.max(10, Math.min(window.innerHeight - 50, newTop));
                    t.style.top = newTop + 'px';

                    const panel = document.getElementById('sn-automation-panel');
                    if (panel) {
                        panel.style.top = Math.max(10, newTop - 50) + 'px';
                    }
                };

                const onMouseUp = () => {
                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);
                    if (isDragging) {
                        GM_setValue('sn_auto_trigger_y', t.style.top);
                    }
                };

                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            };

            t.onclick = (e) => {
                if (isDragging) return;
                this.create();
            };

            document.body.appendChild(t);
        },

        create() {
            const id = 'sn-automation-panel';
            const existing = document.getElementById(id);
            if (existing) {
                app.Core.Windows.toggle(id);
                return;
            }

            const clientId = app.AppObserver.getClientId();
            if (!clientId) {
                app.Core.Utils.showNotification("Client context not found.", { type: 'error' });
                return;
            }

            const w = document.createElement('div');
            w.id = id;
            w.className = 'sn-window';
            
            const trigger = document.getElementById('sn-auto-trigger');
            const triggerTop = trigger ? trigger.offsetTop : 150;

            w.style.cssText = `
                width: 180px;
                height: auto;
                top: ${Math.max(10, triggerTop - 50)}px;
                right: 50px;
                background-color: var(--sn-bg-lighter);
                border: 1px solid var(--sn-border);
                flex-direction: column;
                display: flex;
                z-index: 10010;
                overflow: hidden;
                border-radius: 12px;
                box-shadow: 0 8px 32px rgba(0,0,0,0.12);
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            `;

            this.render(w, clientId);
            document.body.appendChild(w);
            app.Core.Windows.makeDraggable(w, w.querySelector('.sn-header'));
        },

        render(w, clientId) {
            w.innerHTML = `
                <div class="sn-header" style="background:var(--sn-primary-dark); color:white; padding:12px; border-bottom:1px solid rgba(0,0,0,0.1); display:flex; align-items:center; justify-content:space-between; cursor:move;">
                    <span style="font-weight:bold; font-size:13px; letter-spacing:0.5px;">🤖 Automation</span>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <button id="sn-edit-templates" title="Edit Templates" style="background:rgba(255,255,255,0.1); border:none; color:white; cursor:pointer; font-size:14px; width:24px; height:24px; border-radius:50%; display:flex; align-items:center; justify-content:center; transition:background 0.2s;">⚙️</button>
                        <button id="sn-automation-close" title="Close" style="background:rgba(255,255,255,0.1); border:none; color:white; font-weight:bold; cursor:pointer; font-size:16px; width:24px; height:24px; border-radius:50%; display:flex; align-items:center; justify-content:center; transition:background 0.2s;">×</button>
                    </div>
                </div>
                <div style="display:flex; background:var(--sn-bg-light); border-bottom:1px solid var(--sn-border); padding:2px;">
                    <div class="sn-auto-tab ${this.activeTab === 'NCL' ? 'active' : ''}" data-tab="NCL">NCL</div>
                    <div class="sn-auto-tab ${this.activeTab === 'EMAIL' ? 'active' : ''}" data-tab="EMAIL">Email</div>
                    <div class="sn-auto-tab ${this.activeTab === 'SMS' ? 'active' : ''}" data-tab="SMS">SMS</div>
                </div>
                <div id="sn-auto-content" style="padding:12px; flex-grow:1; display:flex; flex-direction:column; gap:8px; max-height:400px; overflow-y:auto; background:white;">
                    ${this.renderTabContent(clientId)}
                </div>
            `;

            if (!document.getElementById('sn-automation-global-styles')) {
                const style = document.createElement('style');
                style.id = 'sn-automation-global-styles';
                style.innerHTML = `
                    .sn-auto-tab { flex:1; padding:8px 4px; text-align:center; cursor:pointer; font-weight:600; font-size:11px; color:var(--sn-primary-text); transition:all 0.2s ease; border-bottom:2px solid transparent; opacity: 0.7; }
                    .sn-auto-tab:hover { opacity: 1; background:rgba(0,0,0,0.03); }
                    .sn-auto-tab.active { background:transparent; color:var(--sn-primary); border-bottom:2px solid var(--sn-primary); opacity: 1; }
                    
                    .sn-auto-action-btn { width: 100%; padding: 8px 12px; background: white; border: 1px solid var(--sn-border); border-radius: 10px; cursor: pointer; text-align: center; font-size: 12px; font-weight: 600; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); position: relative; color: var(--sn-primary-dark); box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
                    .sn-auto-action-btn:hover:not(:disabled) { background: var(--sn-bg-lighter); border-color: var(--sn-primary); transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
                    .sn-auto-action-btn.primary { background: var(--sn-primary); color: white; border: none; }
                    .sn-auto-action-btn.primary:hover:not(:disabled) { background: var(--sn-primary-dark); }
                    .sn-auto-action-btn:disabled { opacity: 0.6; cursor: wait; }

                    .sn-auto-compact-group { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; }
                    .sn-auto-compact-btn { padding: 6px; background: white; border: 1px solid var(--sn-border); border-radius: 8px; cursor: pointer; font-size: 11px; font-weight: 600; color: var(--sn-primary-dark); transition: all 0.2s; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: center; }
                    .sn-auto-compact-btn:hover:not(:disabled) { background: var(--sn-primary); color: white; border-color: var(--sn-primary); transform: scale(1.02); }

                    .sn-explode-btn { background: var(--sn-bg-light); border: none; cursor: pointer; font-size: 14px; color: var(--sn-primary-dark); width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
                    .sn-explode-btn:hover { background: var(--sn-border); transform: rotate(90deg); }
                    .sn-manual-step { font-size: 10px; padding: 6px 8px; background: white; border: 1px solid var(--sn-border); border-radius: 8px; display: flex; justify-content: space-between; align-items: center; margin-left: 5px; box-shadow: 0 1px 2px rgba(0,0,0,0.02); }
                    .sn-auto-sub-btn { background: var(--sn-primary); color: white; border: none; border-radius: 6px; padding: 2px 8px; font-size: 9px; cursor: pointer; font-weight: bold; }
                    .sn-auto-sub-btn:hover { background: var(--sn-primary-dark); }
                `;
                document.head.appendChild(style);
            }

            this.bindEvents(w, clientId);
        },

        renderTabContent(clientId) {
            const templates = GM_getValue('sn_templates', this.seedTemplates);
            const getOrderedItems = (category) => {
                const order = GM_getValue(`sn_templates_${category}_order`, Object.keys(templates[category]));
                return order.map(key => {
                    const t = templates[category][key];
                    if (!t) return '';
                    if (category === 'email') {
                        return `<button class="sn-auto-compact-btn sn-auto-trigger-btn" data-action="email-template" data-key="${key}" title="${t.name}">${t.name}</button>`;
                    }
                    if (category === 'sms') {
                        return `<button class="sn-auto-compact-btn sn-auto-trigger-btn" data-action="sms-template" data-key="${key}" title="${t.name}">📲 ${t.name}</button>`;
                    }
                    return '';
                }).join('');
            };

            if (this.activeTab === 'NCL') {
                return `
                    <div style="display:flex; align-items:center; gap:6px;">
                        <button class="sn-auto-action-btn primary sn-auto-trigger-btn" data-action="ncl-all" style="flex:1;">Run Full NCL</button>
                        <button class="sn-explode-btn" id="sn-ncl-explode" title="Manual Steps">${this.nclExploded ? '−' : '…'}</button>
                    </div>
                    ${this.nclExploded ? `
                        <div style="display:flex; flex-direction:column; gap:6px; margin-top:2px; padding-left:4px;">
                            <div class="sn-manual-step">Create/Subject <button class="sn-auto-sub-btn sn-auto-trigger-btn" data-action="ncl-step1">Go</button></div>
                            <div class="sn-manual-step">Date/Type <button class="sn-auto-sub-btn sn-auto-trigger-btn" data-action="ncl-step2">Go</button></div>
                            <div class="sn-manual-step">Assign/Save <button class="sn-auto-sub-btn sn-auto-trigger-btn" data-action="ncl-step3">Go</button></div>
                        </div>
                    ` : ''}
                `;
            }

            if (this.activeTab === 'EMAIL') {
                const items = getOrderedItems('email');
                return `
                    <div style="display:flex; gap:6px; margin-bottom:8px;">
                        <button class="sn-auto-action-btn primary sn-auto-trigger-btn" data-action="email-init" style="flex:1;">New Email</button>
                    </div>
                    <div class="sn-auto-compact-group">${items || '<i>None</i>'}</div>
                    ${this.renderPrefixSelectors()}
                `;
            }

            if (this.activeTab === 'SMS') {
                const items = getOrderedItems('sms');
                return `
                    <div class="sn-auto-compact-group">${items || '<i>None</i>'}</div>
                    ${this.renderPrefixSelectors()}
                `;
            }
        },

        bindEvents(w, clientId) {
            w.querySelector('#sn-automation-close').onclick = () => w.remove();
            w.querySelector('#sn-edit-templates').onclick = () => this.createTemplateEditor();

            w.querySelectorAll('.sn-auto-tab').forEach(tab => {
                tab.onclick = async () => {
                    this.activeTab = tab.dataset.tab;
                    this.render(w, app.AppObserver.getClientId());
                };
            });

            if (w.querySelector('#sn-ncl-explode')) {
                w.querySelector('#sn-ncl-explode').onclick = () => {
                    this.nclExploded = !this.nclExploded;
                    this.render(w, clientId);
                };
            }

            w.querySelectorAll('.sn-prefix-check').forEach(chk => {
                chk.onclick = () => {
                    if (chk.checked) {
                        w.querySelectorAll('.sn-prefix-check').forEach(other => {
                            if (other !== chk) other.checked = false;
                        });
                    }
                };
            });

            w.querySelectorAll('.sn-auto-trigger-btn').forEach(btn => {
                btn.onclick = async () => {
                    const action = btn.dataset.action;
                    const key = btn.dataset.key;
                    
                    // Always get the LATEST client ID from context at click-time
                    const activeId = app.AppObserver.getClientId();
                    if (!activeId) {
                        app.Core.Utils.showNotification("Client context not found. Navigate to a record first.", { type: 'error' });
                        return;
                    }

                    const originalHTML = btn.innerHTML;
                    btn.disabled = true;
                    btn.innerHTML = '⏳ Working...';

                    try {
                        const TA = app.Automation.TaskAutomation;
                        const templates = GM_getValue('sn_templates', this.seedTemplates);
                        
                        switch (action) {
                            case 'ncl-all': await TA.runNCL(activeId); break;
                            case 'ncl-step1': await TA.ncl_step1(); break;
                            case 'ncl-step2': await TA.ncl_step2(); break;
                            case 'ncl-step3': await TA.ncl_step3(); break;

                            case 'email-init':
                                await TA.email_step1();
                                await TA.email_step2(activeId);
                                break;
                            case 'email-send':
                                await TA.clickSendEmail();
                                break;

                            case 'sms-init':
                                // Just trigger the tab opening part of sendSMS logic
                                await TA.sendSMS(activeId, { body: "" }); 
                                break;
                            case 'sms-send':
                                await TA.clickSendSMS();
                                break;

                            case 'email-template':
                                await TA.email_step3(activeId, this.processPlaceholders(templates.email[key], activeId));
                                break;
                            case 'sms-template':
                                await TA.sendSMS(activeId, this.processPlaceholders(templates.sms[key], activeId));
                                break;
                        }

                        btn.innerHTML = '✅ Done';
                        setTimeout(() => {
                            btn.innerHTML = originalHTML;
                            btn.disabled = false;
                        }, 2000);
                    } catch (err) {
                        console.error(`Automation Error [${action}]:`, err);
                        btn.innerHTML = '❌ Error';
                        setTimeout(() => {
                            btn.innerHTML = originalHTML;
                            btn.disabled = false;
                        }, 3000);
                    }
                };
            });
        },

        renderPrefixSelectors() {
            return `
                <div style="display:flex; align-items:center; gap:10px; margin-top:10px; padding-top:10px; border-top:1px solid #eee; font-size:11px; color:#666;">
                    <label style="display:flex; align-items:center; gap:4px; cursor:pointer;"><input type="checkbox" class="sn-prefix-check" data-prefix="Mr."> Mr.</label>
                    <label style="display:flex; align-items:center; gap:4px; cursor:pointer;"><input type="checkbox" class="sn-prefix-check" data-prefix="Mrs."> Mrs.</label>
                </div>
            `;
        },

        processPlaceholders(template, clientId) {
            if (!template) return null;
            // Use provided ID or fallback to current context
            const activeId = clientId || app.AppObserver.getClientId();
            const clientData = GM_getValue('cn_' + activeId, {});

            // Determine Name Prefix
            let prefix = "Mr./Mrs. ";
            const checks = document.querySelectorAll('.sn-prefix-check:checked');
            if (checks.length > 0) {
                prefix = checks[0].dataset.prefix + " ";
            }

            const clientName = clientData.name || 'Client';
            const cmName = GM_getValue('sn_global_cm1', 'Kant Nguyen');
            const cmExt = GM_getValue('sn_global_ext', '1072');
            const cmPhone = `(214) 271-4027${cmExt ? ' Ext. ' + cmExt : ''}`;

            let res = { ...template };
            const map = {
                '{{clientName}}': prefix + clientName,
                '{{cmName}}': cmName,
                '{{cmExt}}': cmExt,
                '{{cmPhone}}': cmPhone
            };

            for (let [key, val] of Object.entries(map)) {
                if (res.subject) res.subject = res.subject.replaceAll(key, val);
                if (res.body) res.body = res.body.replaceAll(key, val);
            }
            return res;
        },

        createTemplateEditor() {
            const id = 'sn-template-editor';
            if (document.getElementById(id)) return;

            const w = document.createElement('div');
            w.id = id;
            w.className = 'sn-window';
            w.style.cssText = `
                position: fixed;
                width: 700px;
                height: 600px;
                top: 50px;
                left: 100px;
                background: white;
                border: 1px solid var(--sn-border);
                z-index: 100010;
                display: flex;
                flex-direction: column;
                border-radius: 8px;
                box-shadow: 0 20px 40px rgba(0,0,0,0.3);
            `;

            const allTemplates = GM_getValue('sn_templates', this.seedTemplates);
            const templates = JSON.parse(JSON.stringify(allTemplates));

            // --- Order Management ---
            let emailOrder = GM_getValue('sn_templates_email_order');
            if (!emailOrder || emailOrder.length !== Object.keys(templates.email).length) {
                emailOrder = Object.keys(templates.email);
                GM_setValue('sn_templates_email_order', emailOrder);
            }
            let smsOrder = GM_getValue('sn_templates_sms_order');
            if (!smsOrder || smsOrder.length !== Object.keys(templates.sms).length) {
                smsOrder = Object.keys(templates.sms);
                GM_setValue('sn_templates_sms_order', smsOrder);
            }

            // Smarter initialization: find the first available category and key
            let currentCategory = 'email';
            let currentTemplateKey = '';

            if (emailOrder.length > 0) {
                currentCategory = 'email';
                currentTemplateKey = emailOrder[0];
            } else if (smsOrder.length > 0) {
                currentCategory = 'sms';
                currentTemplateKey = smsOrder[0];
            }

            const setupDragDrop = () => {
                const lists = [w.querySelector('#sn-tmpl-list-email'), w.querySelector('#sn-tmpl-list-sms')];

                const getDragAfterElement = (container, y) => {
                    const draggableElements = [...container.querySelectorAll('.sn-tmpl-item:not(.dragging)')];
                    return draggableElements.reduce((closest, child) => {
                        const box = child.getBoundingClientRect();
                        const offset = y - box.top - box.height / 2;
                        if (offset < 0 && offset > closest.offset) {
                            return { offset: offset, element: child };
                        } else {
                            return closest;
                        }
                    }, { offset: Number.NEGATIVE_INFINITY }).element;
                };

                lists.forEach(listContainer => {
                    if (!listContainer) return;
                    listContainer.addEventListener('dragstart', e => { if (e.target.matches('.sn-tmpl-item')) e.target.classList.add('dragging'); });
                    listContainer.addEventListener('dragend', e => {
                        if (e.target.matches('.sn-tmpl-item')) {
                            e.target.classList.remove('dragging');
                            const category = listContainer.id.includes('email') ? 'email' : 'sms';
                            const newOrder = [...listContainer.querySelectorAll('.sn-tmpl-item')].map(item => item.dataset.key);
                            if (category === 'email') emailOrder = newOrder; else smsOrder = newOrder;
                            GM_setValue(`sn_templates_${category}_order`, newOrder);
                            const mainPanel = document.getElementById('sn-automation-panel');
                            if (mainPanel) this.render(mainPanel, app.AppObserver.getClientId());
                        }
                    });
                    listContainer.addEventListener('dragover', e => {
                        e.preventDefault();
                        const draggingItem = listContainer.querySelector('.dragging');
                        if (!draggingItem) return;
                        const afterElement = getDragAfterElement(listContainer, e.clientY);
                        if (afterElement == null) listContainer.appendChild(draggingItem);
                        else listContainer.insertBefore(draggingItem, afterElement);
                    });
                });
            };

            const renderEditor = () => {
                const current = (templates[currentCategory] && currentTemplateKey) ? templates[currentCategory][currentTemplateKey] : null;
                w.innerHTML = `
                    <div class="sn-header" style="background:var(--sn-primary-dark); color:white; padding:10px; border-radius:8px 8px 0 0; cursor:move; display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-weight:bold;">📝 Template Manager</span>
                        <button id="sn-editor-close" style="background:none; border:none; color:white; font-weight:bold; cursor:pointer; font-size:18px;">×</button>
                    </div>
                    <div style="display:flex; flex-grow:1; overflow:hidden;">
                        <!-- Sidebar -->
                        <div style="width:160px; flex-shrink:0; background:#f8f9fa; border-right:1px solid #ddd; display:flex; flex-direction:column; padding:10px; gap:6px; box-sizing:border-box;">
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <div style="font-size:11px; font-weight:bold; color:#777;">EMAIL</div>
                                <button class="sn-new-tmpl" data-cat="email" style="background:none; border:none; color:var(--sn-primary); cursor:pointer; font-weight:bold; font-size:14px;" title="New Email Template">+</button>
                            </div>
                            <div id="sn-tmpl-list-email" style="display:flex; flex-direction:column; gap:4px; max-height:180px; overflow-y:auto; margin-bottom:10px;">
                                ${emailOrder.map(k => templates.email[k] ? `<div class="sn-tmpl-item ${currentCategory === 'email' && currentTemplateKey === k ? 'active' : ''}" data-cat="email" data-key="${k}" draggable="true">${templates.email[k].name}</div>` : '').join('') || '<i style="font-size:11px; color:#999; padding:5px;">None</i>'}
                            </div>
                            
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <div style="font-size:11px; font-weight:bold; color:#777;">SMS</div>
                                <button class="sn-new-tmpl" data-cat="sms" style="background:none; border:none; color:var(--sn-primary); cursor:pointer; font-weight:bold; font-size:14px;" title="New SMS Template">+</button>
                            </div>
                            <div id="sn-tmpl-list-sms" style="display:flex; flex-direction:column; gap:4px; max-height:180px; overflow-y:auto;">
                                ${smsOrder.map(k => templates.sms[k] ? `<div class="sn-tmpl-item ${currentCategory === 'sms' && currentTemplateKey === k ? 'active' : ''}" data-cat="sms" data-key="${k}" draggable="true">${templates.sms[k].name}</div>` : '').join('') || '<i style="font-size:11px; color:#999; padding:5px;">None</i>'}
                            </div>
                        </div>

                        <!-- Main Content -->
                        <div style="flex-grow:1; padding:20px; display:flex; flex-direction:column; gap:15px; background:white; overflow-y:auto;">
                            ${current ? `
                                <div>
                                    <label style="display:block; font-size:12px; font-weight:bold; color:#555; margin-bottom:4px;">Template Name</label>
                                    <input id="sn-tmpl-name" type="text" value="${current.name}" style="width:100%; padding:8px; border:1px solid #ddd; border-radius:4px;">
                                </div>
                                ${currentCategory === 'email' ? `
                                    <div>
                                        <label style="display:block; font-size:12px; font-weight:bold; color:#555; margin-bottom:4px;">Subject</label>
                                        <input id="sn-tmpl-subject" type="text" value="${current.subject || ''}" style="width:100%; padding:8px; border:1px solid #ddd; border-radius:4px;">
                                    </div>
                                    <div style="flex-grow:1; display:flex; flex-direction:column;">
                                        <label style="display:block; font-size:12px; font-weight:bold; color:#555; margin-bottom:4px;">Body (Rich Text Editor)</label>
                                        <div id="sn-rte-toolbar" style="background:#f5f5f5; border:1px solid #ddd; border-bottom:none; padding:5px; display:flex; gap:5px; border-radius:4px 4px 0 0;">
                                            <button class="rte-tool" data-cmd="bold" title="Bold"><b>B</b></button>
                                            <button class="rte-tool" data-cmd="italic" title="Italic"><i>I</i></button>
                                            <button class="rte-tool" data-cmd="insertUnorderedList" title="Bullet List">• List</button>
                                            <button class="rte-tool" data-cmd="insertOrderedList" title="Numbered List">1. List</button>
                                            <button class="rte-tool" data-cmd="createLink" title="Insert Link">🔗 Link</button>
                                        </div>
                                        <div id="sn-tmpl-body-rte" contenteditable="true" style="flex-grow:1; min-height:200px; padding:15px; border:1px solid #ddd; border-radius:0 0 4px 4px; overflow-y:auto; line-height:1.5; font-size:13px; outline:none;">${current.body}</div>
                                    </div>
                                ` : `
                                    <div style="flex-grow:1; display:flex; flex-direction:column;">
                                        <label style="display:block; font-size:12px; font-weight:bold; color:#555; margin-bottom:4px;">Message Content</label>
                                        <textarea id="sn-tmpl-body-plain" style="flex-grow:1; padding:10px; border:1px solid #ddd; border-radius:4px; font-family:sans-serif; font-size:13px; resize:none; outline:none;">${current.body}</textarea>
                                    </div>
                                `}
                                <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid #eee; padding-top:10px;">
                                    <div style="font-size:10px; color:#999; max-width:250px;">Placeholders: {{clientName}}, {{cmName}}, {{cmExt}}, {{cmPhone}}</div>
                                    <div style="display:flex; gap:10px;">
                                        <button id="sn-tmpl-del" style="padding:8px 15px; background:#fff; color:#d32f2f; border:1px solid #d32f2f; border-radius:4px; cursor:pointer;">Delete</button>
                                        <button id="sn-tmpl-save" style="padding:8px 25px; background:var(--sn-primary); color:white; border:none; border-radius:4px; font-weight:bold; cursor:pointer;">Save Template</button>
                                    </div>
                                </div>
                            ` : '<div style="flex-grow:1; display:flex; align-items:center; justify-content:center; color:#999;">Select or create a template to get started</div>'}
                        </div>
                    </div>
                `;

                if (!document.getElementById('sn-editor-internal-styles')) {
                    const s = document.createElement('style');
                    s.id = 'sn-editor-internal-styles';
                    s.innerHTML = `
                        .sn-tmpl-item { padding:6px 10px; border-radius:4px; cursor:pointer; font-size:12px; color:#444; transition:all 0.1s; border-left: 3px solid transparent; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                        .sn-tmpl-item:hover:not(.dragging) { background:#eee; }
                        .sn-tmpl-item.active { background:#e3f2fd; color:var(--sn-primary-dark); font-weight:bold; border-left-color: var(--sn-primary); }
                        .rte-tool { background:white; border:1px solid #ddd; border-radius:3px; padding:2px 8px; cursor:pointer; font-size:11px; }
                        .rte-tool:hover { background:#eee; }
                    `;
                    document.head.appendChild(s);
                }

                w.querySelector('#sn-editor-close').onclick = () => w.remove();

                w.querySelectorAll('.sn-tmpl-item').forEach(item => {
                    item.onclick = () => {
                        currentCategory = item.dataset.cat;
                        currentTemplateKey = item.dataset.key;
                        renderEditor();
                    };
                });

                w.querySelectorAll('.sn-new-tmpl').forEach(btn => {
                    btn.onclick = () => {
                        const cat = btn.dataset.cat;
                        const newKey = 'tmpl_' + Date.now();
                        templates[cat][newKey] = {
                            name: 'New ' + cat.toUpperCase() + ' Template',
                            subject: cat === 'email' ? 'New Subject' : '',
                            body: cat === 'email' ? '<p>Hello {{clientName}},</p>' : 'Hello {{clientName}},'
                        };

                        if (cat === 'email') {
                            emailOrder.push(newKey);
                            GM_setValue('sn_templates_email_order', emailOrder);
                        } else {
                            smsOrder.push(newKey);
                            GM_setValue('sn_templates_sms_order', smsOrder);
                        }
                        currentCategory = cat;
                        currentTemplateKey = newKey;
                        renderEditor();
                    };
                });

                if (current) {
                    const rte = w.querySelector('#sn-tmpl-body-rte');
                    if (rte) {
                        w.querySelectorAll('.rte-tool').forEach(tool => {
                            tool.onclick = (e) => {
                                e.preventDefault();
                                const cmd = tool.dataset.cmd;
                                if (cmd === 'createLink') {
                                    const url = prompt("Enter URL:");
                                    if (url) document.execCommand(cmd, false, url);
                                } else {
                                    document.execCommand(cmd, false, null);
                                }
                                rte.focus();
                            };
                        });
                    }

                    w.querySelector('#sn-tmpl-save').onclick = () => {
                        const nameEl = w.querySelector('#sn-tmpl-name');
                        if (!nameEl.value.trim()) {
                            app.Core.Utils.showNotification("Name is required.", { type: 'error' });
                            return;
                        }
                        
                        const body = currentCategory === 'email' ? w.querySelector('#sn-tmpl-body-rte').innerHTML : w.querySelector('#sn-tmpl-body-plain').value;
                        
                        templates[currentCategory][currentTemplateKey].name = nameEl.value;
                        templates[currentCategory][currentTemplateKey].body = body;
                        
                        if (currentCategory === 'email') {
                            templates[currentCategory][currentTemplateKey].subject = w.querySelector('#sn-tmpl-subject').value;
                        }

                        // Persist working copy back to storage
                        GM_setValue('sn_templates', templates);
                        app.Core.Utils.showNotification("Template saved.");
                        
                        // Force refresh main automation panel to show new buttons
                        const mainPanel = document.getElementById('sn-automation-panel');
                        if (mainPanel) this.render(mainPanel, app.AppObserver.getClientId());
                        
                        renderEditor();
                    };

                    w.querySelector('#sn-tmpl-del').onclick = () => {
                        if (confirm(`Delete "${current.name}"?`)) {
                            delete templates[currentCategory][currentTemplateKey];

                            if (currentCategory === 'email') {
                                emailOrder = emailOrder.filter(k => k !== currentTemplateKey);
                                GM_setValue('sn_templates_email_order', emailOrder);
                            } else {
                                smsOrder = smsOrder.filter(k => k !== currentTemplateKey);
                                GM_setValue('sn_templates_sms_order', smsOrder);
                            }

                            GM_setValue('sn_templates', templates);
                            
                            // Switch to another template or clear
                            if (emailOrder.length > 0) {
                                currentCategory = 'email';
                                currentTemplateKey = emailOrder[0];
                            } else if (smsOrder.length > 0) {
                                currentCategory = 'sms';
                                currentTemplateKey = smsOrder[0];
                            } else {
                                currentTemplateKey = '';
                            }
                            
                            // Refresh main panel
                            const mainPanel = document.getElementById('sn-automation-panel');
                            if (mainPanel) this.render(mainPanel, app.AppObserver.getClientId());
                            
                            renderEditor();
                        }
                    };
                }

                setupDragDrop();
            };

            renderEditor();
            document.body.appendChild(w);
            app.Core.Windows.makeDraggable(w, w.querySelector('.sn-header'));

        }
    };

    app.Automation.AutomationPanel = AutomationPanel;
})();