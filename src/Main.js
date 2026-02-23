// ==UserScript==
// @name         CM Notes Loader
// @namespace    http://tampermonkey.net/
// @version      0.9.0
// @description  Modular loader for CM Notes
// @author       Kant Nguyen (Refactored by Gemini)
// @match        https://*.lightning.force.com/*
// @match        https://*.my.site.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_listValues
// @grant        GM_setClipboard
// @grant        GM_deleteValue
// @grant        GM_openInTab
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// @grant        GM_xmlhttpRequest
// @require      https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js
// @require      file:///d:/CM%20Notes/src/Core.js
// @require      file:///d:/CM%20Notes/src/Automation.js
// @require      file:///d:/CM%20Notes/src/Tools.js
// @require      file:///d:/CM%20Notes/src/ClientNote.js
// ==/UserScript==

(function(app) {
    'use strict';

    const AppObserver = {
        activeClientId: null, // Tracks the currently loaded record
        loadTimer: null,
        lastUrl: window.location.href,

        // --- Universal Client ID Extractor & Converter ---
        _to18CharId(id15) {
            if (!id15 || id15.length !== 15) return id15;
            let suffix = '';
            const charMap = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ012345';
            for (let i = 0; i < 3; i++) {
                let flags = 0;
                for (let j = 0; j < 5; j++) {
                    const char = id15.charAt(i * 5 + j);
                    if (char >= 'A' && char <= 'Z') {
                        flags += 1 << j;
                    }
                }
                suffix += charMap.charAt(flags);
            }
            return id15 + suffix;
        },

        getClientId() {
            let id = null;
            const href = window.location.href;

            // 1. Check Standard Lightning URL
            const sfMatch = href.match(/kdlaw__Matter__c\/([a-zA-Z0-9]{15,18})/);
            if (sfMatch && sfMatch[1]) {
                id = sfMatch[1];
            }
            // 2. Check Form URL (recordid parameter)
            else if (href.includes('recordid=')) {
                const match = href.match(/[?&]recordid=([a-zA-Z0-9]{15,18})/);
                if (match) id = match[1];
            }

            if (!id) return null;

            // 3. Normalize to 18-char ID
            return this._to18CharId(id);
        },

        init() {
            if (document.getElementById('sn-taskbar')) return;
            app.Core.Styles.init(); // Initialize styles
            this.buildTaskbar();

            // Optimized: Simple polling is more robust than History API patching for SPAs
            // It avoids race conditions and complexity with Salesforce's internal router.
            setInterval(() => {
                if (window.location.href !== this.lastUrl) {
                    this.lastUrl = window.location.href;
                    this.handleRecordLoad();
                }
            }, 500);

            // Initial load check
            this.handleRecordLoad();
        },

        buildTaskbar() {
            const taskbar = document.createElement('div');
            taskbar.id = 'sn-taskbar';
            taskbar.innerHTML = `
                <div class="sn-version-label"></div>
                <div class="sn-center-group">
                    <button id="tab-sn-client-note" class="sn-tb-btn">Client Note</button>
                    <button id="tab-sn-fo-form" class="sn-tb-btn">FO Contact</button>
                    <button id="tab-sn-dds-form" class="sn-tb-btn">DDS Contact</button>
                    <button id="tab-sn-med-popout" class="sn-tb-btn">Med Prov</button>
                    <div id="tab-sn-fax-panel" class="sn-tb-btn">Fax Forms</div>
                    <div id="tab-sn-ir-panel" class="sn-tb-btn">IR Tool</div>
                </div>
                <button id="sn-dash-btn" title="Dashboard">📝</button>
            `;
            document.body.appendChild(taskbar);

            const bind = (id, fn) => { const el = document.getElementById(id); if(el) el.onclick = fn; };

            bind('sn-dash-btn', () => app.Tools.Dashboard.toggle());

            bind('tab-sn-client-note', () => {
                 const clientId = this.getClientId();
                 if (clientId) {
                     if (!document.getElementById('sn-client-note')) {
                         app.Features.ClientNote.create(clientId);
                     } else {
                         app.Core.Windows.toggle('sn-client-note');
                     }
                 } else {
                     alert("Go to a Client Page.");
                 }
            });

            bind('tab-sn-fo-form', () => app.Tools.ContactForms.create('FO'));
            bind('tab-sn-dds-form', () => app.Tools.ContactForms.create('DDS'));
            bind('tab-sn-med-popout', () => app.Features.ClientNote.toggleMedWindow());
            bind('tab-sn-fax-panel', () => app.Tools.FeaturePanels.create('FAX'));
            bind('tab-sn-ir-panel', () => app.Tools.FeaturePanels.create('IR'));

            // Keyboard Shortcuts
            window.addEventListener('keydown', e => {
                if (!e.altKey) return;
                if (e.code === 'KeyY') { e.preventDefault(); app.Tools.Dashboard.toggle(); }
                if (e.code === 'KeyQ') {
                    e.preventDefault();
                    app.Features.ClientNote.toggleMedWindow();
                }
                if (e.code === 'KeyR') {
                    if (window.location.href.includes('/forms/s/')) {
                        e.preventDefault();
                        app.Tools.SSDFormViewer.toggle();
                    }
                }
                if (e.code === 'KeyM') {
                    e.preventDefault();
                    app.Automation.MailResolve.run();
                }

                if (e.key === '1') {
                     const clientId = this.getClientId();
                     if (clientId) {
                         if (!document.getElementById('sn-client-note')) app.Features.ClientNote.create(clientId);
                         else app.Core.Windows.toggle('sn-client-note');
                     }
                }
                if (e.key === '2') app.Tools.ContactForms.create('FO');
                if (e.key === '3') app.Tools.ContactForms.create('DDS');
            });
        },

        handleRecordLoad() {
            if (this.loadTimer) clearTimeout(this.loadTimer);

            app.Automation.MailResolve.init();

            const clientId = this.getClientId();
            const isFormPage = window.location.href.includes('/forms/s/');

            if (clientId) {
                if (this.activeClientId === clientId) return;

                if (this.activeClientId && this.activeClientId !== clientId) {
                    const oldNote = document.getElementById('sn-client-note');
                    if (oldNote) {
                        app.Features.ClientNote.destroy(this.activeClientId);
                        app.Core.Windows.updateTabState('sn-client-note');
                    }
                }

                this.activeClientId = clientId;

                if (GM_getValue('cn_' + clientId)) {
                    this.loadTimer = setTimeout(() => {
                        const btn = document.getElementById('tab-sn-client-note');
                        if(btn) btn.classList.add('active');

                        if (!document.getElementById('sn-client-note') && !isFormPage) {
                            app.Features.ClientNote.create(clientId);
                        }
                    }, 500);
                }
                app.Features.ClientNote.checkStoredData(clientId);
            } else {
                app.Features.ClientNote.destroy(this.activeClientId);
                this.activeClientId = null;

                const w = document.getElementById('sn-client-note');
                if (w) w.remove();
                const mw = document.getElementById('sn-med-popout');
                if (mw) { mw.remove(); app.Core.Windows.updateTabState('sn-med-popout'); }

                document.querySelectorAll('.sn-tb-btn').forEach(b => b.classList.remove('sn-has-data'));
            }
        }
    };

    app.AppObserver = AppObserver;

})(window.CM_App = window.CM_App || {});

// Initializer
(function() {
    'use strict';
    // Use a timeout to ensure all @require scripts have loaded and populated the namespace
    setTimeout(() => {
        if (window.CM_App && window.CM_App.AppObserver) {
            window.CM_App.AppObserver.init();
        } else {
            console.error("CM_App or its modules not found. Check script loading order and @require URLs.");
        }
    }, 0);
})();