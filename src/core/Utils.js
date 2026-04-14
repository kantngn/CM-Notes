(function () {
    const app = window.CM_App = window.CM_App || {};
    app.Core = app.Core || {};

    /**
     * Shared independent utility functions for phone formatting, shadow-DOM piercing queries, 
     * element polling, and global notification UI management.
     * Interacts with AppObserver, Scraper, BackupManager, MailResolve, TaskAutomation, 
     * AutomationPanel, ClientNote, FeaturePanels, MedicationPanel, and InfoPanel.
     * @namespace app.Core.Utils
     */
    const Utils = {
        /**
         * Formats a string into a standard US phone number format (XXX-XXX-XXXX).
         * 
         * @param {string|number} phoneStr - The input phone number.
         * @returns {string} The formatted phone number, or the original string if not a standard US number.
         */
        formatPhoneNumber(phoneStr) {
            if (!phoneStr) return '';
            const str = String(phoneStr).trim();
            const digits = str.replace(/\D/g, '');
            if (digits.startsWith('000')) return '';
            if (digits.length === 10) {
                return `${digits.substring(0, 3)}-${digits.substring(3, 6)}-${digits.substring(6)}`;
            }
            if (digits.length === 11 && digits.startsWith('1')) {
                return `${digits.substring(1, 4)}-${digits.substring(4, 7)}-${digits.substring(7)}`;
            }
            return str; // return original if not a standard US number
        },

        /**
         * Formats a string into a standard US SSN format (XXX-XX-XXXX).
         * 
         * @param {string|number} ssnStr - The input SSN.
         * @returns {string} The formatted SSN, or the original string if not a 9-digit number.
         */
        formatSSN(ssnStr) {
            if (!ssnStr) return '';
            const digits = String(ssnStr).replace(/\D/g, '');
            if (digits.length === 9) {
                return `${digits.substring(0, 3)}-${digits.substring(3, 5)}-${digits.substring(5)}`;
            }
            return ssnStr;
        },

        /**
         * Shadow-DOM-piercing querySelector. Finds the first element matching the selector, 
         * traversing through shadow roots if necessary.
         * 
         * @param {string} selector - The CSS selector to match.
         * @param {Element|Document} [root=document] - The root node to start the search from.
         * @returns {Element|null} The matched element or null if not found.
         */
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

        /**
         * Shadow-DOM-piercing querySelectorAll. Finds all elements matching the selector, 
         * traversing through shadow roots if necessary.
         * 
         * @param {string} selector - The CSS selector to match.
         * @param {Element|Document} [root=document] - The root node to start the search from.
         * @returns {Element[]} An array of matched elements.
         */
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

        /**
         * Polls for an element via shadow-piercing query until it is found or the timeout is reached.
         * 
         * @param {string} selector - The CSS selector to match.
         * @param {number} [maxWait=10000] - Maximum wait time in milliseconds.
         * @returns {Promise<Element|null>} A promise that resolves to the matched element or null if it times out.
         */
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

        /**
         * Halts execution for a specified number of milliseconds.
         * 
         * @param {number} ms - The number of milliseconds to delay.
         * @returns {Promise<void>} A promise that resolves after the delay.
         */
        delay(ms) {
            return new Promise(res => setTimeout(res, ms));
        },

        /**
         * Displays a global UI notification message.
         * 
         * @param {string} message - The message to display.
         * @param {Object} [options] - Configuration options for the notification.
         * @param {'info'|'error'|'success'} [options.type='error'] - The theme type of the notification.
         * @param {number} [options.duration=3000] - Duration in milliseconds before the notification disappears.
         */
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
        },

        /**
         * Scrapes the current Salesforce user's name from the global profile header.
         * Used for authorizing database push operations.
         * 
         * @returns {string|null} The user's name, or null if not found.
         */
        getCurrentUser() {
            // Priority 1: Avatar tooltip
            const avatar = document.querySelector('.slds-global-header__item--profile .slds-avatar img');
            if (avatar && avatar.title) return avatar.title.toUpperCase();
            
            // Priority 2: User profile button text (some orgs)
            const profileBtn = document.querySelector('.profile-card-content .name a, .userProfilePanel .full-name');
            if (profileBtn) return profileBtn.innerText.toUpperCase();

            // Priority 3: Scrape from any element with data-presence-user-id (common in Lightning)
            const presence = document.querySelector('[data-presence-user-id]');
            if (presence && presence.title) return presence.title.toUpperCase();

            return null;
        }
    };

    app.Core.Utils = Utils;
})();
