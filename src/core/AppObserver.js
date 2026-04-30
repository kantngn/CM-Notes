(function () {
    const app = window.CM_App = window.CM_App || {};

    /**
     * Monitors URL changes to extract Salesforce client IDs, manages global hotkeys, 
     * initializes the taskbar, and coordinates the lifecycle of UI panels based on record context.
     * Interacts with Themes, GlobalNotes, Scheduler, Taskbar, Scraper, ClientNote, WindowManager, 
     * MedicationPanel, FeaturePanels, MailResolve, SSDFormViewer, Dashboard, Utils, and gm-compat.
     * @namespace app.AppObserver
     */
    const AppObserver = {
        activeClientId: null, // Tracks the currently loaded record
        loadTimer: null,
        lastUrl: window.location.href,

        _checkCaseManager(clientId) {
            const expectedCM = GM_getValue('sn_global_cm1', '');
            if (!expectedCM) return; // If user hasn't set up CM Name, skip

            const pageData = app.Core.Scraper.getAllPageData();
            let pageCM = pageData.cmName;

            // If it failed to scrape or is empty, try once more after a tiny delay
            if (!pageCM) {
                setTimeout(() => {
                    const retryData = app.Core.Scraper.getAllPageData();
                    if (retryData.cmName && retryData.cmName.toLowerCase() !== expectedCM.toLowerCase()) {
                        this._showCMWarning(retryData.cmName, expectedCM);
                    }
                }, 1500);
            } else if (pageCM.toLowerCase() !== expectedCM.toLowerCase()) {
                this._showCMWarning(pageCM, expectedCM);
            }
        },

        _showCMWarning(found, expected) {
            if (document.getElementById('sn-cm-warning')) return;
            const notification = document.createElement('div');
            notification.id = 'sn-cm-warning';
            notification.style.position = 'fixed';
            notification.style.top = '25px';
            notification.style.left = '50%';
            notification.style.transform = 'translateX(-50%)';
            notification.style.zIndex = '999999'; 
            notification.style.backgroundColor = '#d32f2f';
            notification.style.color = '#ffffff';
            notification.style.padding = '16px 32px';
            notification.style.borderRadius = '8px';
            notification.style.boxShadow = '0 8px 24px rgba(0,0,0,0.5)';
            notification.style.fontFamily = 'system-ui, -apple-system, sans-serif';
            notification.style.fontSize = '20px';
            notification.style.fontWeight = 'bold';
            notification.style.cursor = 'pointer'; 
            notification.style.textAlign = 'center';
            notification.innerHTML = `
                ⚠️ This is not your case!<br>
                <span style="font-size: 14px; font-weight: normal; margin-top: 8px; display: block; opacity: 0.9;">
                    Assigned to: <strong>${found}</strong> | Expected: <strong>${expected}</strong><br>
                    (Click anywhere on this box to dismiss)
                </span>
            `;
            notification.addEventListener('click', () => notification.remove());
            document.body.appendChild(notification);
        },

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

        /**
         * Extracts and normalizes the Salesforce Client ID from the current URL.
         * 
         * @returns {string|null} The 18-character Salesforce Client ID, or null if not found.
         */
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

        /**
         * Initializes the application by setting up styles, taskbar, global listeners, and polling.
         */
        init() {
            if (document.getElementById('sn-taskbar')) return;
            app.Core.Styles.init(); // Initialize styles
            this.buildTaskbar();
            if (window.CM_App.Tools.GlobalNotes) window.CM_App.Tools.GlobalNotes.init();
            if (window.CM_App.Tools.Scheduler) window.CM_App.Tools.Scheduler.init();
            if (app.Tools && app.Tools.Dashboard) app.Tools.Dashboard.init();
            if (app.Core.Taskbar) app.Core.Taskbar.init();
            app.Core.Taskbar.update(); // Initial update to show counters on load.
            if (app.Automation && app.Automation.AutomationPanel.init) app.Automation.AutomationPanel.init();

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

        /**Ad
         * Checks if the current page is an SSD form and conditionally triggers data scraping. 
         * If auto-close is enabled, closes the tab after successful scrape.
         */
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

                        // Set a temporary, unique key with the scraped data. This triggers the
                        // listener in InfoPanel.js without overwriting the main form data store.
                        if (scrapedData.Address || scrapedData.Phone || scrapedData['Medical Provider'] || scrapedData['Condition']) {
                            // Use chrome.storage.local.set directly with a callback to ensure write completion
                            // before potentially closing the window.
                            chrome.storage.local.set({ [`cn_scrape_result_${clientId}`]: scrapedData }, () => {
                                if (chrome.runtime.lastError) {
                                    console.error("[SSD Auto-Scraper] Error saving scrape result to storage:", chrome.runtime.lastError);
                                }
                                // Only close the window AFTER the data is confirmed to be saved.
                                if (GM_getValue('sn_ssd_autoclose', true)) {
                                    window.close();
                                }
                            });
                        }
                    } catch (e) {
                        console.error("[SSD Auto-Scraper] Error during scraping:", e);
                    }
                })();
            }
        },

        /**
         * Constructs the global taskbar UI and registers global keyboard shortcuts.
         */
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
                <button id="sn-dash-btn" title="Dashboard"><img src="${chrome.runtime.getURL('icon/icon48.png')}" style="width:32px;height:32px;border-radius:50%;"></button>
            `;
            document.body.appendChild(taskbar);

            const bind = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };

            bind('sn-dash-btn', () => { if (app.Tools && app.Tools.Dashboard) { app.Tools.Dashboard.toggle(); } else { console.warn('[CM Notes] Dashboard module not loaded'); } });

            bind('tab-sn-client-note', () => {
                const noteWindow = document.getElementById('sn-client-note');
                if (noteWindow) {
                    // If the window exists, just toggle it.
                    app.Core.Windows.toggle('sn-client-note');
                } else {
                    // If it doesn't exist, we need a client ID to create it.
                    const clientId = this.getClientId();
                    if (clientId) {
                        app.Features.ClientNote.create(clientId);
                    } else {
                        app.Core.Utils.showNotification("Go to a Client Page.", { type: 'error' });
                    }
                }
            });


            bind('tab-sn-med-popout', () => app.Features.ClientNote.toggleMedWindow());
            bind('tab-sn-meds-panel', () => app.Tools.MedicationPanel.create());
            bind('tab-sn-fax-panel', () => app.Tools.FeaturePanels.create('FAX'));
            bind('tab-sn-ir-panel', () => app.Tools.FeaturePanels.create('IR'));

            // Keyboard Shortcuts
            window.addEventListener('keydown', e => {
                if (!e.altKey) return;

                // Alt + ` : Global Note
                if (e.code === 'Backquote') {
                    e.preventDefault();
                    if (window.CM_App.Tools.GlobalNotes) window.CM_App.Tools.GlobalNotes.toggle();
                }

                // Alt + 1 : Client Note
                if (e.code === 'Digit1') {
                    e.preventDefault();
                    const btn = document.getElementById('tab-sn-client-note');
                    if (btn) btn.click();
                }

                // Alt + 2 : Med Window (Provider Popout)
                if (e.code === 'Digit2') {
                    e.preventDefault();
                    const btn = document.getElementById('tab-sn-med-popout');
                    if (btn) btn.click();
                }

                // Alt + 3 : Medication Panel (Meds)
                if (e.code === 'Digit3') {
                    e.preventDefault();
                    const btn = document.getElementById('tab-sn-meds-panel');
                    if (btn) btn.click();
                }

                // Alt + 4 : Fax Form
                if (e.code === 'Digit4') {
                    e.preventDefault();
                    const btn = document.getElementById('tab-sn-fax-panel');
                    if (btn) btn.click();
                }

                // Alt + 5 : IR Tool
                if (e.code === 'Digit5') {
                    e.preventDefault();
                    const btn = document.getElementById('tab-sn-ir-panel');
                    if (btn) btn.click();
                }

                // Alt + Q : Info Panel
                if (e.code === 'KeyQ') {
                    e.preventDefault();
                    const btn = document.querySelector('#sn-client-note .sn-spine-btn[data-panel="info"]');
                    if (btn) btn.click();
                }

                // Alt + W : SSA Panel
                if (e.code === 'KeyW') {
                    e.preventDefault();
                    const btn = document.querySelector('#sn-client-note .sn-spine-btn[data-panel="ssa"]');
                    if (btn) btn.click();
                }

                // Alt + F or Alt + E : Fetch Data
                if (e.code === 'KeyF' || e.code === 'KeyE') {
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

                // Alt + A : Mail Resolver
                if (e.code === 'KeyA') {
                    e.preventDefault();
                    app.Automation.MailResolve.run();
                }

                // Alt + S : SSD Form Viewer (Only on Forms)
                if (e.code === 'KeyS') {
                    if (window.location.href.includes('/forms/s/')) {
                        e.preventDefault();
                        app.Tools.SSDFormViewer.toggle();
                    }
                }

                // Alt + L : Scheduler
                if (e.code === 'KeyL') {
                    e.preventDefault();
                    if (window.CM_App.Tools.Scheduler) window.CM_App.Tools.Scheduler.toggle();
                }

                // Alt + T : Dashboard
                if (e.code === 'KeyT') {
                    e.preventDefault();
                    if (app.Tools && app.Tools.Dashboard) { app.Tools.Dashboard.toggle(); }
                }

                // Alt + H : Show Instructions
                if (e.code === 'KeyH') {
                    e.preventDefault();
                    if (window.CM_App.Tools.GlobalNotes) window.CM_App.Tools.GlobalNotes.showInstructions();
                }
            });
        },

        /**
         * Handles logic when a new Salesforce record is loaded or URL changes.
         * Manages the lifecycle, cleanup, and visibility of floating UI panels.
         */
        handleRecordLoad() {
            if (this.loadTimer) clearTimeout(this.loadTimer);

            app.Automation.MailResolve.init();

            const clientId = this.getClientId();
            const currentUrl = window.location.href;
            const isFormPage = currentUrl.includes('/forms/s/');

            // Exception URLs: If we hit any of these, immediately nuke all panels regardless of pin state.
            const isExceptionUrl = currentUrl.includes('/lightning/r/Report/') ||
                currentUrl.includes('/lightning/r/Dashboard') ||
                currentUrl.includes('/lightning/o/Report') ||
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

                let wasNoteOpen = false;
                let wasMedPopoutOpen = false;
                let wasMedsPanelOpen = false;

                if (this.activeClientId && this.activeClientId !== clientId) {
                    // NEW CLIENT LOADED. Erase old panels regardless of pin state.
                    const oldNote = document.getElementById('sn-client-note');
                    if (oldNote) {
                        wasNoteOpen = true;
                        app.Features.ClientNote.destroy(this.activeClientId, true);
                        app.Core.Windows.updateTabState('sn-client-note');
                    }

                    const oldMedPopout = document.getElementById('sn-med-popout');
                    if (oldMedPopout) {
                        wasMedPopoutOpen = true;
                        oldMedPopout.remove();
                        app.Core.Windows.updateTabState('sn-med-popout');
                    }

                    const oldMeds = document.getElementById('sn-meds-panel');
                    if (oldMeds) {
                        wasMedsPanelOpen = true;
                        oldMeds.remove();
                        app.Core.Windows.updateTabState('sn-meds-panel');
                    }
                }

                this.activeClientId = clientId;

                if (GM_getValue('cn_' + clientId) || wasNoteOpen || wasMedPopoutOpen || wasMedsPanelOpen) {
                    this.loadTimer = setTimeout(() => {
                        const btn = document.getElementById('tab-sn-client-note');
                        if (btn) btn.classList.add('active');

                        if ((GM_getValue('cn_' + clientId) || wasNoteOpen) && !document.getElementById('sn-client-note') && !isFormPage) {
                            app.Features.ClientNote.create(clientId);
                        }

                        if (wasMedPopoutOpen && !document.getElementById('sn-med-popout')) {
                            if (app.Features.ClientNote.toggleMedWindow) app.Features.ClientNote.toggleMedWindow();
                        }

                        if (wasMedsPanelOpen && !document.getElementById('sn-meds-panel')) {
                            if (app.Tools && app.Tools.MedicationPanel) app.Tools.MedicationPanel.create();
                        }

                        // Refresh Automation Panel if it's currently open
                        const autoPanel = document.getElementById('sn-automation-panel');
                        if (autoPanel && app.Automation.AutomationPanel.render) {
                            app.Automation.AutomationPanel.render(autoPanel, clientId);
                        }
                    }, 500);
                }

                // Check if the assigned case manager matches the tool's setting
                setTimeout(() => {
                    this._checkCaseManager(clientId);
                }, 2500); // 2.5 second delay to ensure LWC elements are painted

                app.Features.ClientNote.checkStoredData(clientId);

            } else {
                // Navigating to an Undefined URL (Not a specific client, and not an exception URL)
                // Panels persistently stay on the UI when users navigate between sub pages.
                // We retain the active clientId so saves will keep functioning and appending correctly.
            }
        }
    };

    app.AppObserver = AppObserver;
})();
