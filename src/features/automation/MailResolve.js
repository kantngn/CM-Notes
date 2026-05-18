(function () {
    const app = window.CM_App = window.CM_App || {};
    app.Automation = app.Automation || {};

    /**
     * Injects a floating action button on Salesforce "Mail Log" pages.
     * Automates the repetitive task of resolving a mail log entry by setting specific dropdown values.
     * Supports both manual (button) and batch (auto-resolve via trigger keys) modes.
     * @namespace app.Automation.MailResolve
     */
    const MailResolve = {
        btn: null,
        _currentRecordId: null,

        /**
         * Extracts the Salesforce record ID from the current mail log URL.
         * @returns {string|null} The 15-18 char record ID, or null.
         */
        _extractRecordId() {
            const match = window.location.href.match(/kdlaw__Mail_Log__c\/([a-zA-Z0-9]{15,18})/);
            return match ? match[1] : null;
        },

        /**
         * Resets the button and record tracking so a fresh button
         * can be created for a new mail log record.
         */
        reset() {
            if (this.btn) {
                this.btn.remove();
                this.btn = null;
            }
        },

        init() {
            if (window.location.href.includes('kdlaw__Mail_Log__c')) {
                // Detect navigation to a different mail log record
                const recordId = this._extractRecordId();
                if (recordId && recordId !== this._currentRecordId) {
                    this._currentRecordId = recordId;
                    this.reset();
                }

                // Check for batch trigger matching this record
                const allKeys = GM_listValues();
                const myTrigger = allKeys.find(k => {
                    if (!k.startsWith('sn_batch_trigger_')) return false;
                    const data = GM_getValue(k);
                    return data && window.location.href.includes(data.recordId);
                });

                if (myTrigger) {
                    // Batch mode: run immediately, no button
                    const triggerData = GM_getValue(myTrigger);
                    GM_deleteValue(myTrigger); // Consume trigger immediately
                    this.autoRun(triggerData.entryId);
                } else {
                    this.createButton(); // Normal manual mode
                }
            } else {
                this.removeButton();
                this._currentRecordId = null;
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

        /**
         * Pre-check: reads field values in read-only mode to determine if
         * the mail log is already resolved. Avoids entering edit mode unnecessarily.
         * Checks if all 4 required fields have non-empty values.
         * @returns {boolean} true if all fields appear to be filled (resolved).
         */
        isAlreadyResolved() {
            const U = app.Core.Utils;
            const fieldsToCheck = [
                "Edit Addressed To",
                "Edit Direction",
                "Edit Method",
                "Edit Resolved"
            ];

            for (const editTitle of fieldsToCheck) {
                const editBtn = U.queryDeep(`button[title*="${editTitle}"]`);
                if (!editBtn) return false; // Can't find button, can't verify — assume not resolved

                // Walk up to the nearest field-level container
                // Salesforce Lightning wraps each field in a container with
                // data-target-selection-name or a .slds-form-element wrapper
                let fieldContainer = editBtn.closest(
                    '[data-target-selection-name], records-record-layout-item'
                );
                if (!fieldContainer) {
                    // Fallback: walk up a few parents
                    fieldContainer = editBtn.parentElement?.parentElement?.parentElement;
                }
                if (!fieldContainer) return false;

                // Look for value display elements within the container
                // In read-only mode, Salesforce puts values in lightning-formatted-text,
                // lightning-formatted-url, or .slds-form-element__static
                const valueEl = U.queryDeep(
                    'lightning-formatted-text, lightning-formatted-url, .slds-form-element__static',
                    fieldContainer
                );

                if (valueEl) {
                    const val = valueEl.textContent.trim();
                    if (!val || val === '--' || val === '—' || val === 'None') return false;
                } else {
                    // No explicit value element found; check if the container has
                    // meaningful text beyond just the field label and edit button
                    const fullText = fieldContainer.innerText || '';
                    // Extract just the label (e.g., "Resolved") from the edit button title
                    const label = editTitle.replace('Edit ', '');
                    // Remove the label and whitespace, see if anything remains
                    const stripped = fullText.replace(label, '').replace(/edit|pencil/gi, '').trim();
                    if (!stripped) return false; // Empty field
                }
            }
            return true; // All fields have values
        },

        /**
         * Executes the automation sequence to resolve a Mail Log.
         * Pre-checks field values in read-only mode first. If already resolved,
         * skips edit mode entirely. Otherwise enters edit, sets values, and saves.
         * @returns {Object} Result: { skipped: boolean, changed: boolean }
         */
        async run() {
            if (!window.location.href.includes('kdlaw__Mail_Log__c')) return { skipped: false, changed: false };

            if (this.btn) {
                this.btn.innerHTML = '⏳';
                this.btn.style.cursor = 'wait';
            }

            const U = app.Core.Utils;

            // ── Pre-check: skip edit mode if already resolved ──
            const alreadyDone = this.isAlreadyResolved();
            if (alreadyDone) {
                if (this.btn) {
                    this.btn.innerHTML = '⏭️';
                    this.btn.style.background = '#e8f5e9';
                    this.btn.style.borderColor = '#66bb6a';
                    this.btn.style.color = '#388e3c';
                    this.btn.style.cursor = 'default';
                    this.btn.title = 'Already resolved';
                }
                return { skipped: true, changed: false };
            }

            // ── Enter edit mode and set values ──
            const tasks = [
                { label: "Addressed To", value: "KD" },
                { label: "Direction", value: "Incoming" },
                { label: "Method", value: "US Mail" },
                { label: "Resolved", value: "Yes" }
            ];

            const pencil = U.queryDeep('button[title*="Edit Addressed To"]');
            if (pencil) {
                pencil.click();
                await U.delay(800); // Wait for edit modal
            }

            let anyChanged = false;
            for (const task of tasks) {
                const btn = await U.waitForElement(`button[aria-label="${task.label}"]`, 2000);
                if (!btn || btn.innerText.includes(task.value)) continue;

                anyChanged = true;
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

            // Only save if we actually changed something
            if (anyChanged) {
                const save = await U.waitForElement('button[name="SaveEdit"]', 2000);
                if (save) {
                    save.click();
                    await U.delay(1500); // Wait for save to complete
                }
            } else {
                // Nothing changed but we're in edit mode — cancel out
                const cancel = await U.waitForElement('button[name="CancelEdit"]', 1000);
                if (cancel) cancel.click();
            }

            if (this.btn) {
                this.btn.innerHTML = '✓';
                this.btn.style.background = '#e0f2f1';
                this.btn.style.borderColor = '#4caf50';
                this.btn.style.color = '#4caf50';
                this.btn.style.cursor = 'default';
            }

            return { skipped: false, changed: anyChanged };
        },

        /**
         * Batch auto-resolve mode. Called when this page was opened by
         * the BatchResolve queue manager. Runs resolve, signals result
         * back to the parent tab via GM_setValue, and does not create a button.
         * @param {string} entryId - The record ID used as key for result signaling.
         */
        async autoRun(entryId) {
            const U = app.Core.Utils;

            // Wait for the page to fully render before checking fields
            await U.delay(3000);

            try {
                const result = await this.run();
                GM_setValue('sn_batch_result_' + entryId, {
                    success: true,
                    skipped: result?.skipped || false,
                    changed: result?.changed || false,
                    timestamp: Date.now()
                });
            } catch (err) {
                console.error('[MailResolve] autoRun error:', err);
                GM_setValue('sn_batch_result_' + entryId, {
                    success: false,
                    error: err.message,
                    timestamp: Date.now()
                });
            }
        }
    };

    app.Automation.MailResolve = MailResolve;
})();
