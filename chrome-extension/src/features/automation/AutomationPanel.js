(function () {
    const app = window.CM_App = window.CM_App || {};
    app.Automation = app.Automation || {};

    /**
     * Provides a floating UI panel containing buttons to trigger Salesforce automation scripts.
     * Interacts with `TaskAutomation` to execute steps for NCLs and Emails.
     * @namespace app.Automation.AutomationPanel
     */
    const AutomationPanel = {
        /**
         * Builds or toggles the automation control panel window.
         * Sets up event listeners that delegate actions to `TaskAutomation`.
         */
        create() {
            const id = 'sn-automation-panel';
            if (document.getElementById(id)) {
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
            w.style.cssText = `
                width: 280px;
                height: auto;
                top: 150px;
                left: 150px;
                background-color: var(--sn-bg-lighter);
                border: 1px solid var(--sn-border);
                flex-direction: column;
                display: flex;
                z-index: 10010;
            `;

            w.innerHTML = `
                <div class="sn-header" style="background:var(--sn-bg-light); border-bottom:1px solid var(--sn-border);">
                    <span style="font-weight:bold; color:var(--sn-primary-dark);">🤖 Automation</span>
                    <button id="sn-automation-close" style="background:none; border:none; font-weight:bold; cursor:pointer; font-size:14px;">X</button>
                </div>
                <div style="padding:10px; display:flex; flex-direction:column; gap:15px;">
                    <!-- NCL Section -->
                    <div class="sn-automation-section">
                        <div class="sn-section-title">NCL Task (Rose Letter 01)</div>
                        <button class="sn-auto-btn" data-action="ncl-step1">1. Create & Set Subject</button>
                        <button class="sn-auto-btn" data-action="ncl-step2">2. Set Due Date & Type</button>
                        <button class="sn-auto-btn" data-action="ncl-step3">3. Assign & Save</button>
                        <hr style="border:none; border-top:1px solid #ccc; margin: 8px 0;">
                        <button class="sn-auto-btn sn-run-all" data-action="ncl-all">Run All NCL Steps</button>
                    </div>
                    <!-- Email Section -->
                    <div class="sn-automation-section">
                        <div class="sn-section-title">Follow-up Email</div>
                        <button class="sn-auto-btn" data-action="email-step1">1. Open Email Composer</button>
                        <button class="sn-auto-btn" data-action="email-step2">2. Fill To, Subject & BCC</button>
                        <button class="sn-auto-btn" data-action="email-step3">3. Fill Email Body</button>
                        <hr style="border:none; border-top:1px solid #ccc; margin: 8px 0;">
                        <button class="sn-auto-btn sn-run-all" data-action="email-all">Run All Email Steps</button>
                    </div>
                </div>
            `;

            document.body.appendChild(w);
            app.Core.Windows.makeDraggable(w, w.querySelector('.sn-header'));
            w.querySelector('#sn-automation-close').onclick = () => w.remove();

            w.addEventListener('click', async (e) => {
                const btn = e.target.closest('.sn-auto-btn');
                if (!btn) return;

                const action = btn.dataset.action;
                const originalText = btn.innerHTML;
                btn.innerHTML = '⏳ Working...';
                btn.disabled = true;

                try {
                    const TA = app.Automation.TaskAutomation;
                    switch (action) {
                        case 'ncl-step1': await TA.ncl_step1(); break;
                        case 'ncl-step2': await TA.ncl_step2(); break;
                        case 'ncl-step3': await TA.ncl_step3(); break;
                        case 'ncl-all': await TA.runNCL(clientId); break;

                        case 'email-step1': await TA.email_step1(); break;
                        case 'email-step2': await TA.email_step2(clientId); break;
                        case 'email-step3': await TA.email_step3(clientId); break;
                        case 'email-all': await TA.runEmail(clientId); break;
                    }
                    btn.innerHTML = '✅ Done';
                    setTimeout(() => {
                        btn.innerHTML = originalText;
                        btn.disabled = false;
                    }, 1500);
                } catch (err) {
                    console.error(`Automation error on action ${action}:`, err);
                    btn.innerHTML = '❌ Error';
                    btn.style.background = '#ffebee';
                    setTimeout(() => {
                        btn.innerHTML = originalText;
                        btn.disabled = false;
                        btn.style.background = '';
                    }, 3000);
                }
            });
        }
    };

    app.Automation.AutomationPanel = AutomationPanel;
})();