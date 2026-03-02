(function () {
    const app = window.CM_App = window.CM_App || {};

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
            if (app.Tools.GlobalNotes) app.Tools.GlobalNotes.init();
            app.Core.Taskbar.update(); // Initial update to show counters on load.

            // Add a global listener for data changes from other tabs to update the taskbar
            // and other components that need to be synced.
            GM_addValueChangeListener('sn_dashboard_broadcast', (name, oldVal, newVal, remote) => {
                if (remote) {

                    if (app.Core.Taskbar) {
                        app.Core.Taskbar.update();
                    }
                }
            });

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
            this.initSSDScraping();
        },

        initSSDScraping() {
            const urlParams = new URLSearchParams(window.location.search);
            const clientId = urlParams.get('clientId');
            const formUUID = urlParams.get('uuid');

            // Check if this is an SSD form page
            if (formUUID === 'a0UfL000002vlqfUAA' && clientId) {
                if (document.readyState === 'loading') return;


                (async () => {
                    try {
                        const scrapedData = await app.Core.Scraper.getFullSSDData();

                        if (scrapedData.ssn || scrapedData.dob || scrapedData['Medical Provider'] || scrapedData['Condition']) {
                            GM_setValue(`cn_form_data_${clientId}`, scrapedData);


                            if (GM_getValue('sn_ssd_autoclose', true)) {
                                window.close();
                            }
                        }
                    } catch (e) {
                        console.error("[SSD Auto-Scraper] Error during scraping:", e);
                    }
                })();
            }
        },

        buildTaskbar() {
            const taskbar = document.createElement('div');
            taskbar.id = 'sn-taskbar';
            taskbar.innerHTML = `
                <div class="sn-version-label"></div>
                <div class="sn-center-group">
                    <button id="tab-sn-client-note" class="sn-tb-btn">Client Note</button>
                    <button id="tab-sn-med-popout" class="sn-tb-btn">Med Prov</button>
                    <button id="tab-sn-meds-panel" class="sn-tb-btn">Meds</button>
                    <div id="tab-sn-fax-panel" class="sn-tb-btn">Fax Forms</div>
                    <div id="tab-sn-ir-panel" class="sn-tb-btn">IR Tool</div>
                </div>
                <button id="sn-dash-btn" title="Dashboard">📝</button>
            `;
            document.body.appendChild(taskbar);

            const bind = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };

            bind('sn-dash-btn', () => { if (app.Tools && app.Tools.Dashboard) { app.Tools.Dashboard.toggle(); } else { console.warn('[CM Notes] Dashboard module not loaded'); } });

            bind('tab-sn-client-note', () => {
                const clientId = this.getClientId();
                if (clientId) {
                    if (!document.getElementById('sn-client-note')) {
                        app.Features.ClientNote.create(clientId);
                    } else {
                        app.Core.Windows.toggle('sn-client-note');
                    }
                } else {
                    app.Core.Utils.showNotification("Go to a Client Page.", { type: 'error' });
                }
            });


            bind('tab-sn-med-popout', () => app.Features.ClientNote.toggleMedWindow());
            bind('tab-sn-meds-panel', () => app.Tools.MedicationPanel.create());
            bind('tab-sn-fax-panel', () => app.Tools.FeaturePanels.create('FAX'));
            bind('tab-sn-ir-panel', () => app.Tools.FeaturePanels.create('IR'));

            // Keyboard Shortcuts
            window.addEventListener('keydown', e => {
                if (!e.altKey) return;
                if (e.code === 'KeyY') { e.preventDefault(); if (app.Tools && app.Tools.Dashboard) { app.Tools.Dashboard.toggle(); } }

                if (e.code === 'KeyQ') { // Info Tab Toggle
                    e.preventDefault();
                    const btn = document.querySelector('#sn-client-note .sn-spine-btn[data-panel="info"]');
                    if (btn) btn.click();
                }
                if (e.code === 'KeyW') { // Med Window Toggle
                    e.preventDefault();
                    app.Features.ClientNote.toggleMedWindow();
                }
                if (e.code === 'KeyE') { // SSD Tab Toggle
                    e.preventDefault();
                    const btn = document.querySelector('#sn-client-note .sn-spine-btn[data-panel="ssa"]');
                    if (btn) btn.click();
                }

                //SSD App Scraper Toggle (Only on Forms)
                if (e.code === 'KeyS') {
                    if (window.location.href.includes('/forms/s/')) {
                        e.preventDefault();
                        app.Tools.SSDFormViewer.toggle();
                    }
                }

                // Mail Resolve (Global)
                if (e.code === 'KeyM') {
                    e.preventDefault();
                    app.Automation.MailResolve.run();
                }

                if (e.key === '4') app.Features.ClientNote.toggleMedWindow();
                if (e.key === '5') app.Tools.FeaturePanels.create('FAX');
                if (e.key === '6') app.Tools.FeaturePanels.create('IR');

                // Global SSD Data Fetch
                if (e.code === 'Backquote') {
                    e.preventDefault();
                    const cn = document.getElementById('sn-client-note');
                    if (cn) {
                        let btn = cn.querySelector('#sn-open-ssd-btn');
                        if (!btn) {
                            const infoTab = cn.querySelector('.sn-spine-btn[data-panel="info"]');
                            if (infoTab) { infoTab.click(); btn = cn.querySelector('#sn-open-ssd-btn'); }
                        }
                        if (btn) btn.click();
                    }
                }
            });
        },

        handleRecordLoad() {
            if (this.loadTimer) clearTimeout(this.loadTimer);

            app.Automation.MailResolve.init();

            const clientId = this.getClientId();
            const currentUrl = window.location.href;
            const isFormPage = currentUrl.includes('/forms/s/');

            // Exception URLs: If we hit any of these, immediately nuke all panels regardless of pin state.
            const isExceptionUrl = currentUrl.includes('/lightning/r/Report/') ||
                currentUrl.includes('/lightning/r/Dashboard') ||
                currentUrl.includes('/lightning/o/') ||
                currentUrl.includes('/lightning/page/');

            if (isExceptionUrl) {
                app.Features.ClientNote.destroy(this.activeClientId, true);
                this.activeClientId = null;
                const w = document.getElementById('sn-client-note');
                if (w) w.remove();
                const mw = document.getElementById('sn-med-popout');
                if (mw) { mw.remove(); app.Core.Windows.updateTabState('sn-med-popout'); }
                const mwp = document.getElementById('sn-meds-panel');
                if (mwp) { mwp.remove(); app.Core.Windows.updateTabState('sn-meds-panel'); }
                document.querySelectorAll('.sn-tb-btn').forEach(b => b.classList.remove('sn-has-data'));
                return;
            }

            if (clientId) {
                // We are ON a valid Client Record
                if (this.activeClientId === clientId) return;

                if (this.activeClientId && this.activeClientId !== clientId) {
                    // NEW CLIENT LOADED. Erase old panels regardless of pin state.
                    const oldNote = document.getElementById('sn-client-note');
                    if (oldNote) {
                        app.Features.ClientNote.destroy(this.activeClientId, true);
                        app.Core.Windows.updateTabState('sn-client-note');
                    }

                    const oldMeds = document.getElementById('sn-meds-panel');
                    if (oldMeds) {
                        oldMeds.remove();
                        app.Core.Windows.updateTabState('sn-meds-panel');
                    }
                }

                this.activeClientId = clientId;

                if (GM_getValue('cn_' + clientId)) {
                    this.loadTimer = setTimeout(() => {
                        const btn = document.getElementById('tab-sn-client-note');
                        if (btn) btn.classList.add('active');

                        if (!document.getElementById('sn-client-note') && !isFormPage) {
                            app.Features.ClientNote.create(clientId);
                        }
                    }, 500);
                }
                app.Features.ClientNote.checkStoredData(clientId);

            } else {
                // Navigating to an Undefined URL (Not a specific client, and not an exception URL)
                const w = document.getElementById('sn-client-note');
                const mw = document.getElementById('sn-med-popout');
                const mwp = document.getElementById('sn-meds-panel');

                const isCnPinned = w && w.dataset.pinned === 'true';
                const isMedPinned = mw && mw.dataset.pinned === 'true';
                const isMedsPinned = mwp && mwp.dataset.pinned === 'true';

                if (!isCnPinned) {
                    app.Features.ClientNote.destroy(this.activeClientId);
                    if (w) w.remove();
                }

                if (!isMedPinned) {
                    if (mw) { mw.remove(); app.Core.Windows.updateTabState('sn-med-popout'); }
                }

                if (!isMedsPinned) {
                    if (mwp) { mwp.remove(); app.Core.Windows.updateTabState('sn-meds-panel'); }
                }

                // If NOTHING is pinned, we fully reset the active client.
                // If SOMETHING is pinned, we hold onto the active client string so saves keep functioning and appending correctly.
                if (!isCnPinned && !isMedPinned && !isMedsPinned) {
                    this.activeClientId = null;
                    document.querySelectorAll('.sn-tb-btn').forEach(b => b.classList.remove('sn-has-data'));
                }
            }
        }
    };

    app.AppObserver = AppObserver;
})();
