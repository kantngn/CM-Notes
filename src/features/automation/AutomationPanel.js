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

        /**
         * Initializes the automation trigger button.
         */
        init() {
            if (document.getElementById('sn-auto-trigger')) return;
            this.createTrigger();
        },

        /**
         * Creates a persistent floating trigger button on the right edge of the screen.
         * Allows vertical movement along the edge.
         */
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
                width: 36px;
                height: 42px;
                background: var(--sn-primary-dark);
                color: white;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                z-index: 100005;
                border-radius: 8px 0 0 8px;
                box-shadow: -2px 0 8px rgba(0,0,0,0.2);
                font-size: 20px;
                transition: background 0.2s, width 0.2s;
                user-select: none;
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

                    // SYNC PANEL POSITION
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

        /**
         * Builds or toggles the automation control panel window.
         */
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
                width: 300px;
                height: auto;
                min-height: 250px;
                top: ${Math.max(10, triggerTop - 50)}px;
                right: 50px;
                background-color: var(--sn-bg-lighter);
                border: 1px solid var(--sn-border);
                flex-direction: column;
                display: flex;
                z-index: 10010;
                overflow: hidden;
                border-radius: 8px;
                box-shadow: 0 10px 25px rgba(0,0,0,0.15);
            `;

            this.render(w, clientId);
            document.body.appendChild(w);
            app.Core.Windows.makeDraggable(w, w.querySelector('.sn-header'));
        },

        render(w, clientId) {
            w.innerHTML = `
                <div class="sn-header" style="background:var(--sn-primary-dark); color:white; padding:10px; border-bottom:1px solid rgba(0,0,0,0.1);">
                    <span style="font-weight:bold;">🤖 Smart Automation</span>
                    <button id="sn-automation-close" style="background:none; border:none; color:white; font-weight:bold; cursor:pointer; font-size:16px;">×</button>
                </div>
                <!-- Tabs -->
                <div style="display:flex; background:var(--sn-bg-light); border-bottom:1px solid var(--sn-bg-light);">
                    <div class="sn-auto-tab ${this.activeTab === 'NCL' ? 'active' : ''}" data-tab="NCL">NCL</div>
                    <div class="sn-auto-tab ${this.activeTab === 'EMAIL' ? 'active' : ''}" data-tab="EMAIL">Email</div>
                    <div class="sn-auto-tab ${this.activeTab === 'SMS' ? 'active' : ''}" data-tab="SMS">SMS</div>
                </div>
                <div id="sn-auto-content" style="padding:15px; flex-grow:1; display:flex; flex-direction:column; gap:10px; max-height:400px; overflow-y:auto;">
                    ${this.renderTabContent(clientId)}
                </div>
            `;

            // Style Injection (only once)
            if (!document.getElementById('sn-automation-global-styles')) {
                const style = document.createElement('style');
                style.id = 'sn-automation-global-styles';
                style.innerHTML = `
                    .sn-auto-tab { flex:1; padding:8px; text-align:center; cursor:pointer; font-weight:bold; font-size:12px; color:var(--sn-primary-text); transition:all 0.2s; border-bottom:2px solid transparent; }
                    .sn-auto-tab:hover { background:rgba(255,255,255,0.2); }
                    .sn-auto-tab.active { background:var(--sn-bg-lighter); color:var(--sn-primary-dark); border-bottom:2px solid var(--sn-primary-dark); }
                    
                    .sn-auto-action-btn { width: 100%; padding: 10px; background: white; border: 1px solid var(--sn-bg-light); border-radius: 6px; cursor: pointer; text-align: left; font-size: 13px; font-weight: 500; transition: all 0.2s; position: relative; display: flex; align-items: center; justify-content: space-between; }
                    .sn-auto-action-btn:hover:not(:disabled) { background: var(--sn-bg-lighter); border-color: var(--sn-primary); transform: translateY(-1px); box-shadow: 0 4px 8px rgba(0,0,0,0.05); }
                    .sn-auto-action-btn.primary { background: var(--sn-primary); color: white; border: none; justify-content: center; font-weight: bold; }
                    .sn-auto-action-btn.primary:hover:not(:disabled) { background: var(--sn-primary-dark); }
                    .sn-auto-action-btn:disabled { opacity: 0.6; cursor: wait; }

                    .sn-auto-sub-btn { background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px; padding: 6px 10px; font-size: 11px; cursor: pointer; transition: all 0.2s; }
                    .sn-auto-sub-btn:hover { background: #eee; border-color: #bbb; }
                    
                    .sn-explode-btn { background: none; border: none; cursor: pointer; font-size: 18px; color: var(--sn-primary-dark); padding: 0 5px; line-height: 1; }
                    .sn-manual-step { font-size: 11px; padding: 6px 10px; background: #fafafa; border-left: 3px solid var(--sn-primary); border-radius: 0 4px 4px 0; display: flex; justify-content: space-between; align-items: center; }
                `;
                document.head.appendChild(style);
            }

            this.bindEvents(w, clientId);
        },

        renderTabContent(clientId) {
            if (this.activeTab === 'NCL') {
                return `
                    <div style="display:flex; align-items:center; gap:5px;">
                        <button class="sn-auto-action-btn primary sn-auto-trigger-btn" data-action="ncl-all" style="flex:1;">Run All NCL Steps</button>
                        <button class="sn-explode-btn" id="sn-ncl-explode" title="Toggle Manual Steps">${this.nclExploded ? '−' : '+'}</button>
                    </div>
                    ${this.nclExploded ? `
                        <div style="display:flex; flex-direction:column; gap:6px; margin-top:5px; border-left:2px dashed var(--sn-bg-light); padding-left:10px;">
                            <div class="sn-manual-step">1. Create & Set Subject <button class="sn-auto-sub-btn sn-auto-trigger-btn" data-action="ncl-step1">Run</button></div>
                            <div class="sn-manual-step">2. Set Date & Type <button class="sn-auto-sub-btn sn-auto-trigger-btn" data-action="ncl-step2">Run</button></div>
                            <div class="sn-manual-step">3. Assign & Save <button class="sn-auto-sub-btn sn-auto-trigger-btn" data-action="ncl-step3">Run</button></div>
                        </div>
                    ` : ''}
                `;
            }

            if (this.activeTab === 'EMAIL') {
                return `
                    <button class="sn-auto-action-btn primary sn-auto-trigger-btn" data-action="email-init">1. Open & Init Email</button>
                    <div style="font-size: 11px; color: #666; margin: 5px 0 2px 0; font-weight: bold;">Templates (Select one after init):</div>
                    <div style="display:flex; flex-direction:column; gap:5px;">
                        <button class="sn-auto-action-btn sn-auto-trigger-btn" data-action="email-template-ftr"><span>📝 <b>FTR</b> - Standard Follow-up</span> ➔</button>
                        <button class="sn-auto-action-btn sn-auto-trigger-btn" data-action="email-template-ssa"><span>🆔 <b>SSA</b> - Account Setup</span> ➔</button>
                        <button class="sn-auto-action-btn sn-auto-trigger-btn" data-action="email-template-med"><span>🏥 <b>Med</b> - Info Request</span> ➔</button>
                    </div>
                `;
            }

            if (this.activeTab === 'SMS') {
                return `<div style="text-align:center; color:#888; padding:20px;">SMS Automation coming soon...</div>`;
            }
        },

        bindEvents(w, clientId) {
            w.querySelector('#sn-automation-close').onclick = () => w.remove();

            // Tab Switching
            w.querySelectorAll('.sn-auto-tab').forEach(tab => {
                tab.onclick = () => {
                    this.activeTab = tab.dataset.tab;
                    this.render(w, clientId);
                };
            });

            // Explode NCL
            const explodeBtn = w.querySelector('#sn-ncl-explode');
            if (explodeBtn) {
                explodeBtn.onclick = () => {
                    this.nclExploded = !this.nclExploded;
                    this.render(w, clientId);
                };
            }

            // Action Buttons
            w.querySelectorAll('.sn-auto-trigger-btn').forEach(btn => {
                btn.onclick = async () => {
                    const action = btn.dataset.action;
                    const originalHTML = btn.innerHTML;
                    btn.disabled = true;
                    btn.innerHTML = '⏳ Working...';

                    try {
                        const TA = app.Automation.TaskAutomation;
                        const clientData = GM_getValue('cn_' + clientId, {});
                        const clientName = clientData.name || 'Client';

                        switch (action) {
                            case 'ncl-all': await TA.runNCL(clientId); break;
                            case 'ncl-step1': await TA.ncl_step1(); break;
                            case 'ncl-step2': await TA.ncl_step2(); break;
                            case 'ncl-step3': await TA.ncl_step3(); break;

                            case 'email-init':
                                await TA.email_step1();
                                await TA.email_step2(clientId);
                                break;

                            case 'email-template-ftr':
                                await TA.email_step3(clientId); // Default template
                                break;

                            case 'email-template-ssa':
                                await TA.email_step3(clientId, this.getSSATemplate(clientName));
                                break;

                            case 'email-template-med':
                                await TA.email_step3(clientId, this.getMedTemplate(clientName));
                                break;
                        }

                        btn.innerHTML = '✅ Done';
                        btn.style.borderColor = 'var(--sn-primary)';
                        setTimeout(() => {
                            btn.innerHTML = originalHTML;
                            btn.disabled = false;
                            btn.style.borderColor = '';
                        }, 2000);
                    } catch (err) {
                        console.error(`Automation Error [${action}]:`, err);
                        btn.innerHTML = '❌ Error';
                        btn.style.background = '#ffebee';
                        setTimeout(() => {
                            btn.innerHTML = originalHTML;
                            btn.disabled = false;
                            btn.style.background = '';
                        }, 3000);
                    }
                };
            });
        },

        getSSATemplate(clientName) {
            return {
                subject: "Creating your MY Social Security account on ssa.gov",
                body: `
                    <p>Hello ${clientName},</p>
                    <p>It was a pleasure speaking with you earlier regarding your claim. As we discussed, I am sending you the instructions to sign up for your "my Social Security" account. This is a vital tool that allows you to monitor your claim status and view important updates directly from the SSA.</p>
                    <p><b>Please follow these steps to create your account:</b></p>
                    <ol>
                        <li>Visit the official SSA website: <a href="https://www.ssa.gov/myaccount/">https://www.ssa.gov/myaccount/</a></li>
                        <li>Click the <b>"Create an Account"</b> button.</li>
                        <li>You will be asked to choose a credential provider. You can select either <b>Login.gov</b> or <b>ID.me</b>. Both are standard government-verified services; either choice will work perfectly for creating your account.</li>
                        <li>Simply follow the prompts from your chosen provider to verify your identity and finalize your registration.</li>
                    </ol>
                    <p>If you encounter any difficulty during the process, please don't hesitate to contact me.</p>
                    <p>Best Regards,</p>
                `
            };
        },

        getMedTemplate(clientName) {
            return {
                subject: "Request for medical information from your SSD Case Manager",
                body: `
                    <p>Dear ${clientName},</p>
                    <p>It was great talking with you today! To ensure we built the strongest possible case to fight for your claim, we need to gather some updated details regarding your medical treatment. Having a complete picture of your providers and medications is crucial for your success.</p>
                    <p><b>Please provide the following information for any new medical providers:</b></p>
                    <ol>
                        <li>Doctor's Name or Facility's Name</li>
                        <li>Office Address</li>
                        <li>Telephone Number</li>
                        <li>Date of your first visit and your last visit</li>
                        <li>Date of your next scheduled appointment</li>
                    </ol>
                    <p><b>Additionally, it would be beneficial to document your current medications:</b></p>
                    <ul>
                        <li>Medication name, dosage, and frequency</li>
                        <li>The prescribing doctor and when you started taking it</li>
                    </ul>
                    <p><i><b>Pro Tip:</b> To save time, you can simply take a clear picture of your prescription bottles/labels and send them to us! We can log all the details for you so you don't have to type them out manually.</i></p>
                    <p>Thank you for your help in moving your claim forward.</p>
                    <p>Sincerely,</p>
                `
            };
        }
    };

    app.Automation.AutomationPanel = AutomationPanel;
})();