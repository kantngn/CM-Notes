(function() {
    console.log("[CM-Notes-Injected] Running automation in main world...");

    // Retrieve data passed from the content script via the script tag attribute
    const scriptEl = document.currentScript;
    const faxNum = scriptEl ? scriptEl.getAttribute('data-fax-num') : '';
    const email = scriptEl ? scriptEl.getAttribute('data-email') : '';

    function setSelectizeByText(elementId, textToFind) {
        const el = document.getElementById(elementId);
        if (!el) return;

        // Attempt Selectize.js manipulation via exposed jQuery
        if (window.jQuery && jQuery(el)[0] && jQuery(el)[0].selectize) {
            const selectize = jQuery(el)[0].selectize;
            const targetOption = Object.values(selectize.options).find(opt => opt.text.includes(textToFind));
            
            if (targetOption) {
                selectize.setValue(targetOption.value, false);
            } else {
                // If specific number not found, but it's the DID box and there's only 1 option, select it.
                if (elementId === 'id_did') {
                    const availableValues = Object.keys(selectize.options);
                    if (availableValues.length > 0) {
                        console.log("[CM-Notes] DID specific match failed, selecting first available option:", availableValues[0]);
                        selectize.setValue(availableValues[0], false);
                    }
                }
            }
        } else {
            // Fallback to standard DOM if Selectize not present
            const option = Array.from(el.options).find(opt => opt.text.includes(textToFind));
            if (option) {
                el.value = option.value;
                el.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
    }

    // Execute fields
    // Using the working number: 2142926581
    setSelectizeByText('id_did', '2142926581');

    const destEl = document.getElementById('id_destination');

    if (destEl && window.jQuery && jQuery(destEl)[0] && jQuery(destEl)[0].selectize && faxNum) {
        jQuery(destEl)[0].selectize.createItem(faxNum, false); 
    } else if (destEl && faxNum) {
        destEl.value = faxNum;
        destEl.dispatchEvent(new Event('change', { bubbles: true }));
    }

    if (email) {
        setSelectizeByText('id_notification', email);
    }

    
})();
