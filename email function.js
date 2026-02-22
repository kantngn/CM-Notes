(async function testEmailAutomation() {
    console.log("🚀 Starting Optimized Email Automation...");
    const delay = ms => new Promise(res => setTimeout(res, ms));

    function queryDeep(selector, root = document) {
        let el = root.querySelector(selector);
        if (el) return el;
        const allNodes = root.querySelectorAll('*');
        for (let node of allNodes) {
            if (node.shadowRoot) {
                el = queryDeep(selector, node.shadowRoot);
                if (el) return el;
            }
        }
        return null;
    }

    function queryAllDeep(selector, root = document) {
        let els = Array.from(root.querySelectorAll(selector));
        const allNodes = root.querySelectorAll('*');
        for (let node of allNodes) {
            if (node.shadowRoot) {
                els = els.concat(queryAllDeep(selector, node.shadowRoot));
            }
        }
        return els;
    }

    // New helper to find the deepest nested iframe by title or class
    function findDeepIframe(root = document) {
        const iframes = queryAllDeep('iframe', root);
        for (let img of iframes) {
            // Check for the CKEditor frame specifically from your screenshot
            if (img.classList.contains('cke_wysiwyg_frame') || img.title === "Email Body") {
                return img;
            }
            // Recursively check inside iframes if accessible
            try {
                const subFrame = findDeepIframe(img.contentDocument || img.contentWindow.document);
                if (subFrame) return subFrame;
            } catch (e) { /* Cross-origin security block */ }
        }
        return null;
    }

    async function waitForElement(selector, maxWait = 10000) {
        let elapsed = 0;
        while (elapsed < maxWait) {
            let el = queryDeep(selector);
            if (el) return el;
            await delay(100); 
            elapsed += 100;
        }
        return null;
    }

    try {
        // Step 1: Open Email
        console.log("Step 1: Clicking Email button...");
        const emailBtn = await waitForElement('button[title="Email"][value="SendEmail"]');
        if (!emailBtn) throw new Error("Could not find 'Email' button.");
        emailBtn.dispatchEvent(new MouseEvent('click', { view: window, bubbles: true, cancelable: true }));
        await delay(2000); 

        // Step 2: Clear BCC
        console.log("Step 2: Clearing BCC field...");
        const bccList = queryDeep('ul[aria-label="Bcc"]');
        if (bccList) {
            const bccDeletes = queryAllDeep('.deleteAction, .slds-pill__remove, button[title="Remove"]', bccList);
            for (let btn of bccDeletes) {
                btn.click();
                await delay(300);
            }
        }

        // Step 3: Fill "To"
        console.log("Step 3: Populating 'To' field...");
        const toList = queryDeep('ul[aria-label="To"]');
        if (toList) {
            const toInput = queryDeep('input', toList);
            if (toInput) {
                toInput.focus();
                toInput.value = "client@email.address";
                toInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                await delay(300);
                toInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, composed: true }));
            }
        }

        // Step 4: Fill Subject
        console.log("Step 4: Populating Subject...");
        const subjectInput = queryDeep('input[placeholder*="Subject"], input[aria-label="Subject"]');
        if (subjectInput) {
            subjectInput.focus();
            subjectInput.value = "Message from your SSD Case Manager";
            subjectInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        }

        // Step 5: Fill Body (Nested Iframe)
        console.log("Step 5: Searching for Nested Email Body iframe...");
        const iframe = findDeepIframe();
        if (!iframe) throw new Error("Could not find the nested Email Body iframe.");
        
        try {
            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
            const editorBody = iframeDoc.querySelector('body');
            
            if (editorBody) {
                editorBody.innerHTML = `
                    <p><strong>ABC TEST</strong></p>
                    <p>Hello [Client Name],</p>
                    <p>Please see the important update regarding your case.</p>
                    <p>Best regards,<br>Your SSD Case Manager</p>
                `;
                editorBody.dispatchEvent(new Event('input', { bubbles: true }));
                console.log("✅ Body injected successfully.");
            } else {
                throw new Error("Iframe found but body element is missing.");
            }
        } catch (secErr) {
            console.error("❌ Security Error: Cannot access iframe content due to Cross-Origin restrictions.");
        }

        console.log("✅ Sequence finished. Review and Save.");

    } catch (error) {
        console.error("❌ " + error.message);
    }
})();