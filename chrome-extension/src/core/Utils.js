(function () {
    const app = window.CM_App = window.CM_App || {};
    app.Core = app.Core || {};

    const Utils = {
        formatPhoneNumber(phoneStr) {
            if (!phoneStr) return '';
            const str = String(phoneStr);
            const digits = str.replace(/\D/g, '');
            if (digits.length === 10) {
                return `${digits.substring(0, 3)}-${digits.substring(3, 6)}-${digits.substring(6)}`;
            }
            if (digits.length === 11 && digits.startsWith('1')) {
                return `${digits.substring(1, 4)}-${digits.substring(4, 7)}-${digits.substring(7)}`;
            }
            return str; // return original if not a standard US number
        },

        /** Shadow-DOM-piercing querySelector */
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

        /** Shadow-DOM-piercing querySelectorAll */
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

        /** Poll for an element via shadow-piercing query */
        async waitForElement(selector, maxWait = 10000) {
            let elapsed = 0;
            while (elapsed < maxWait) {
                const el = this.queryDeep(selector);
                if (el) return el;
                await this.delay(100);
                elapsed += 100;
            }
            return null;
        },

        delay(ms) {
            return new Promise(res => setTimeout(res, ms));
        }
    };

    app.Core.Utils = Utils;
})();

