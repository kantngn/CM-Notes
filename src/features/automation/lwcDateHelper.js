(function () {
    'use strict';
    // Guard: only run once
    if (window.__cmLwcHelperLoaded) return;
    window.__cmLwcHelperLoaded = true;

    console.log('[CM-Notes LWC Helper] Loaded in page context — listening for cm-set-lwc-value');

    /**
     * Sets a value on a lightning-datepicker (or any LWC custom element) from
     * the page context, where LWC's JavaScript setters are accessible.
     * The content script cannot invoke LWC @api setters because it runs in
     * Chrome's isolated world — this helper bridges that gap via postMessage.
     */
    window.addEventListener('message', function (event) {
        if (event.source !== window) return;
        if (!event.data || event.data.type !== 'cm-set-lwc-value') return;

        const { selector, property, value } = event.data;
        const el = document.querySelector(selector);
        if (!el) {
            console.warn('[CM-Notes LWC Helper] Element not found:', selector);
            return;
        }

        console.log('[CM-Notes LWC Helper] Setting', property, '=', value, 'on', el.tagName, selector);

        // Set the component property — THIS runs in the page context, so
        // LWC's @api setter is properly invoked.
        el[property] = value;

        // Dispatch LWC-style CustomEvents (bubbles + composes out of shadow)
        el.dispatchEvent(new CustomEvent('change', {
            detail: { value },
            bubbles: true,
            composed: true
        }));
        el.dispatchEvent(new CustomEvent('input', {
            detail: { value },
            bubbles: true,
            composed: true
        }));

        // Also trigger a native input event on the shadow DOM input as a fallback
        const shadowInput = el.shadowRoot && el.shadowRoot.querySelector('input');
        if (shadowInput) {
            shadowInput.value = value;
            shadowInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
            shadowInput.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        }
    });
})();
