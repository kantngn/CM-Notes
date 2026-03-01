(function () {
    const app = window.CM_App = window.CM_App || {};
    app.Automation = app.Automation || {};

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


            const U = app.Core.Utils;


            const tasks = [
                { label: "Addressed To", value: "KD" },
                { label: "Direction", value: "Incoming" },
                { label: "Method", value: "US Mail" },
                { label: "Resolved", value: "Yes" }
            ];

            const pencil = U.queryDeep('button[title*="Edit Addressed To"]');
            if (pencil) {
                pencil.click();
                await U.delay(800); // Wait for modal
            }

            for (const task of tasks) {
                const btn = await U.waitForElement(`button[aria-label="${task.label}"]`, 2000);
                if (!btn || btn.innerText.includes(task.value)) continue;

                btn.click();
                const listboxId = btn.getAttribute('aria-controls');
                if (listboxId) {
                    const listbox = await U.waitForElement(`#${listboxId}`, 2000);
                    if (listbox) {
                        const options = listbox.querySelectorAll('lightning-base-combobox-item');
                        const target = Array.from(options).find(opt => opt.innerText.includes(task.value));
                        if (target) {
                            target.click();
                            await U.delay(100); // Debounce
                        }
                    }
                }
            }

            const save = await U.waitForElement('button[name="SaveEdit"]', 2000);
            if (save) save.click();



            if (this.btn) {
                this.btn.innerHTML = '✓';
                this.btn.style.background = '#e0f2f1';
                this.btn.style.borderColor = '#4caf50';
                this.btn.style.color = '#4caf50';
                this.btn.style.cursor = 'default';
            }
        }
    };

    app.Automation.MailResolve = MailResolve;
})();
