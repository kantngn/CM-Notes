(function() {
    console.log("[CM-Notes-Injected] Running automation in main world...");

    // Retrieve data passed from the content script via the script tag attribute
    const scriptEl = document.currentScript;
    const faxNum = scriptEl ? scriptEl.getAttribute('data-fax-num') : '';
    const email = scriptEl ? scriptEl.getAttribute('data-email') : '';

    const MAX_RETRIES = 40;   // 40 × 500ms = 20s max wait
    const RETRY_MS = 500;

    /**
     * Polls `fn` until it returns truthy, up to maxRetries times.
     * @param {Function} fn
     * @param {number} [maxRetries=MAX_RETRIES]
     * @param {number} [delay=RETRY_MS]
     * @returns {Promise<boolean>}
     */
    function waitFor(fn, maxRetries = MAX_RETRIES, delay = RETRY_MS) {
        return new Promise(resolve => {
            let retries = 0;
            const check = () => {
                retries++;
                if (fn()) {
                    resolve(true);
                } else if (retries < maxRetries) {
                    setTimeout(check, delay);
                } else {
                    console.log(`[CM-Notes] waitFor exhausted after ${maxRetries} retries`);
                    resolve(false);
                }
            };
            check();
        });
    }

    /**
     * Returns the Selectize instance for an element id, or null.
     */
    function getSelectize(elementId) {
        const el = document.getElementById(elementId);
        if (!el) return null;
        if (window.jQuery && jQuery(el)[0] && jQuery(el)[0].selectize) {
            return jQuery(el)[0].selectize;
        }
        return null;
    }

    /**
     * Sets a Selectize field by matching option text.
     * Retries until options are loaded and match is found.
     * For DID, falls back to first available option if the target isn't found.
     */
    async function setSelectizeByText(elementId, textToFind) {
        const ready = await waitFor(() => {
            const s = getSelectize(elementId);
            if (!s) return false;
            // Accept when any option matches the text, or for DID when any option exists
            if (Object.values(s.options).some(opt => opt.text.includes(textToFind))) return true;
            if (elementId === 'id_did' && Object.keys(s.options).length > 0) return true;
            return false;
        });

        if (!ready) {
            console.log(`[CM-Notes] Could not set #${elementId}, Selectize not ready`);
            return;
        }

        const selectize = getSelectize(elementId);
        if (!selectize) return;

        const targetOption = Object.values(selectize.options).find(opt => opt.text.includes(textToFind));
        if (targetOption) {
            selectize.setValue(targetOption.value, false);
            console.log(`[CM-Notes] Set #${elementId} to:`, targetOption.text);
        } else if (elementId === 'id_did') {
            const availableValues = Object.keys(selectize.options);
            if (availableValues.length > 0) {
                console.log("[CM-Notes] DID specific match failed, selecting first available option:", availableValues[0]);
                selectize.setValue(availableValues[0], false);
            }
        }
    }

    /**
     * Sets the destination fax number via Selectize createItem.
     * Retries until Selectize is ready.
     */
    async function setDestination(faxNum) {
        if (!faxNum) return;

        const ready = await waitFor(() => {
            const s = getSelectize('id_destination');
            return s !== null;
        });

        if (!ready) {
            console.log("[CM-Notes] Could not set destination, Selectize not ready");
            return;
        }

        const selectize = getSelectize('id_destination');
        if (selectize) {
            selectize.createItem(faxNum, false);
            console.log("[CM-Notes] Set destination to:", faxNum);
        }
    }

    /**
     * Sets the notification email via Selectize.
     */
    async function setNotification(email) {
        if (!email) return;
        await setSelectizeByText('id_notification', email);
    }

    // Execute sequentially — DID may need to be set before destination is available
    (async () => {
        await setSelectizeByText('id_did', '2142926581');
        await setDestination(faxNum);
        await setNotification(email);
    })();
})();
