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
        },

        showNotification(message, { type = 'error', duration = 3000 } = {}) {
            const notification = document.createElement('div');
            const colors = {
                info: { bg: '#e3f2fd', border: '#90caf9', color: '#1976d2' },
                error: { bg: '#ffebee', border: '#ef9a9a', color: '#c62828' },
                success: { bg: '#e8f5e9', border: '#a5d6a7', color: '#2e7d32' }
            };
            const theme = colors[type] || colors.info;

            Object.assign(notification.style, {
                position: 'fixed',
                bottom: '0px',
                left: '50%',
                transform: 'translateX(-50%)',
                padding: '18px 30px',
                background: theme.bg,
                border: `1px solid ${theme.border}`,
                color: theme.color,
                borderRadius: '8px',
                boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
                zIndex: '100000',
                fontSize: '21px',
                fontWeight: 'bold',
                transition: 'opacity 0.3s, bottom 0.3s',
                opacity: '0'
            });
            notification.textContent = message;
            document.body.appendChild(notification);

            requestAnimationFrame(() => {
                notification.style.opacity = '1';
                notification.style.bottom = '200px';
            });

            setTimeout(() => {
                notification.style.opacity = '0';
                notification.style.bottom = '0px';
                setTimeout(() => notification.remove(), 300);
            }, duration);
        }
    };

    app.Core.Utils = Utils;
})();
