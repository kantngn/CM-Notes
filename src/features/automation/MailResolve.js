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
                await new Promise(r => setTimeout(r, 800)); // Wait for modal
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

    app.Automation.MailResolve = MailResolve;
})();
