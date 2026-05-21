(function () {
    const app = window.CM_App = window.CM_App || {};
    app.Features = app.Features || {};

    /**
     * Provides a floating UI panel to control OBS Studio recording via WebSocket.
     * Uses obs-websocket-js loaded from src/lib/obs-ws.js (bundled in manifest.json).
     * Connects to obs-websocket (default port 4455) to Start/Pause/Stop recordings.
     * On Stop, saves the file with the format: "{Date & Time} - {CL Name} - Call {From/To} {CL/DDS/FO}"
     *
     * Also integrates with a companion Windows app (companion_app.py) that monitors the
     * Bicom Communicator via pywinauto. The companion runs a WebSocket server on
     * localhost:8027 and broadcasts CALL_RINGING / CALL_CONNECTED / CALL_HOLD / CALL_END
     * events. When auto-track is enabled, OBS recording starts automatically on
     * CALL_CONNECTED and stops on CALL_END.
     * 
     * Relies on: WindowManager.js (dragging), Utils.js (notifications), AppObserver.js (client context), gm-compat.js
     * @namespace app.Features.ObsRecorder
     */
    const ObsRecorder = {
        obs: null,           // OBSWebSocket instance
        connected: false,
        recording: false,
        paused: false,
        startTime: null,
        elapsedTimer: null,
        elapsedSeconds: 0,
        _cachedClientName: null,   // cached on recording start; cleared on stop

        connectionConfig: {
            host: '127.0.0.1',
            port: 4455,
            password: ''
        },

        callDirection: '',     // 'From', 'To', or '' (unchecked)
        callTarget: '',       // 'CL', 'DDS', 'SSA', or '' (not selected)
        triggerSide: 'right',   // 'left' or 'right'

        // ---------- COMPANION APP INTEGRATION ----------

        autoTrackEnabled: false,   // auto-record based on Communicator companion app
        companionWs: null,         // WebSocket to companion app (port 8027)
        companionConnected: false,
        currentCallNumber: '',     // phone number of the current call
        companionWsId: 0,             // incrementing ID to identify WS instances
        _companionSawRinging: false,  // true when CALL_RINGING seen before CALL_CONNECTED
        _companionUnloadCleanup: null, // bound beforeunload handler reference
        _companionWsIdentity: null,    // identity token of current WS to prevent stale onclose
        _filenameCustomized: false,    // true when direction+target explicitly set (user or auto-detection)

        // ---------- INIT ----------

        init() {
            if (document.getElementById('sn-obs-trigger')) return;

            // Guard rail: only enable OBS recorder for Kant Nguyen
            const cmName = GM_getValue('sn_global_cm1', '');
            const cmEmail = GM_getValue('sn_global_email', '');
            if (cmName !== 'Kant Nguyen' || cmEmail !== 'kantnguyen@kirkendalldwyer.com') {
                return;
            }

            this.loadConfig();
            // Trigger button removed — use Alt+R to open the panel
            this.connectCompanion();

            // Clean up companion connection on page unload to prevent
            // orphaned WebSockets and timers from leaking across navigations
            if (!this._companionUnloadCleanup) {
                this._companionUnloadCleanup = () => {
                    this.disconnectCompanion();
                    this.stopElapsedTimer();
                };
                window.addEventListener('beforeunload', this._companionUnloadCleanup);
                window.addEventListener('pagehide', this._companionUnloadCleanup);
            }
        },

        loadConfig() {
            const saved = GM_getValue('sn_obs_config');
            if (saved) {
                Object.assign(this.connectionConfig, saved);
            }
            // callDirection, callTarget, _filenameCustomized are session-only — not persisted
            this.autoTrackEnabled = GM_getValue('sn_obs_auto_track', false);
        },

        saveConfig() {
            GM_setValue('sn_obs_config', this.connectionConfig);
            GM_setValue('sn_obs_auto_track', this.autoTrackEnabled);
        },

        // ---------- FLOATING TRIGGER ----------

        getTriggerStyles(side) {
            if (side === 'left') {
                return `
                    position: fixed;
                    left: 0;
                    width: 38px;
                    height: 44px;
                    background: #1e1e1e;
                    color: white;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    z-index: 100005;
                    border-radius: 0 20px 20px 0;
                    box-shadow: 4px 0 12px rgba(0,0,0,0.15);
                    font-size: 22px;
                    transform: translateX(-33px);
                    transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                    user-select: none;
                    border: 1px solid rgba(255,255,255,0.1);
                    border-left: none;
                `;
            }
            return `
                position: fixed;
                right: 0;
                width: 38px;
                height: 44px;
                background: #1e1e1e;
                color: white;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                z-index: 100005;
                border-radius: 20px 0 0 20px;
                box-shadow: -4px 0 12px rgba(0,0,0,0.15);
                font-size: 22px;
                transform: translateX(33px);
                transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                user-select: none;
                border: 1px solid rgba(255,255,255,0.1);
                border-right: none;
            `;
        },

        createTrigger() {
            const triggerId = 'sn-obs-trigger';
            if (document.getElementById(triggerId)) return;

            const t = document.createElement('div');
            t.id = triggerId;
            t.title = 'OBS Recorder (Drag to move)';
            t.innerHTML = '🎙';

            t.style.cssText = this.getTriggerStyles(this.triggerSide);

            const savedY = GM_getValue('sn_obs_trigger_y', '60%');
            t.style.top = savedY;

            t.onmouseenter = () => {
                t.style.transform = 'translateX(0)';
                t.style.background = '#2d2d2d';
                t.style.width = '42px';
            };
            t.onmouseleave = () => {
                const offset = this.triggerSide === 'left' ? '-33px' : '33px';
                t.style.transform = 'translateX(' + offset + ')';
                t.style.background = '#1e1e1e';
                t.style.width = '36px';
            };

            let isDragging = false;
            let startY = 0;
            let startX = 0;
            let startTop = 0;

            const updatePanelSide = (side, top) => {
                const panel = document.getElementById('sn-obs-panel');
                if (!panel) return;
                const gap = 45;
                if (side === 'left') {
                    panel.style.left = gap + 'px';
                    panel.style.right = 'auto';
                } else {
                    panel.style.right = gap + 'px';
                    panel.style.left = 'auto';
                }
                panel.style.top = Math.max(10, top - 80) + 'px';
            };

            t.onmousedown = (e) => {
                isDragging = false;
                startY = e.clientY;
                startX = e.clientX;
                startTop = t.offsetTop;
                t.style.transform = 'translateX(0)'; // Fully visible while dragging
                const onMouseMove = (moveEvent) => {
                    const deltaY = moveEvent.clientY - startY;
                    const deltaX = moveEvent.clientX - startX;
                    if (Math.abs(deltaY) > 5 || Math.abs(deltaX) > 5) isDragging = true;
                    let newTop = startTop + deltaY;
                    newTop = Math.max(10, Math.min(window.innerHeight - 50, newTop));
                    t.style.top = newTop + 'px';
                    t.style.transform = 'translateX(0)'; // Keep visible while dragging
                    const panel = document.getElementById('sn-obs-panel');
                    if (panel) panel.style.top = Math.max(10, newTop - 80) + 'px';
                };
                const cleanup = () => {
                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);
                    window.removeEventListener('mouseup', onMouseUp);
                };
                const onMouseUp = () => {
                    cleanup();
                    if (isDragging) {
                        // Snap trigger + panel together to nearest side
                        const snapThreshold = window.innerWidth / 2;
                        const rect = t.getBoundingClientRect();
                        const centerX = rect.left + rect.width / 2;
                        const newSide = centerX < snapThreshold ? 'left' : 'right';
                        if (newSide !== this.triggerSide) {
                            this.triggerSide = newSide;
                            t.style.cssText = this.getTriggerStyles(newSide);
                            t.style.top = rect.top + 'px';
                        }
                        updatePanelSide(this.triggerSide, rect.top);
                        GM_setValue('sn_obs_trigger_y', t.style.top);
                        const offset = this.triggerSide === 'left' ? '-33px' : '33px';
                        t.style.transform = 'translateX(' + offset + ')';
                    }
                };
                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
                // Also catch mouseup when cursor leaves the browser window
                window.addEventListener('mouseup', onMouseUp);
            };

            t.onclick = (e) => {
                if (isDragging) return;
                this.create();
            };

            document.body.appendChild(t);

            // ── Touch support: tap to reveal, auto-hide after 4s ──
            let touchHideTimer = null;
            const showTrigger = () => {
                t.style.transform = 'translateX(0)';
                clearTimeout(touchHideTimer);
                touchHideTimer = setTimeout(() => {
                    const offset = this.triggerSide === 'left' ? '-33px' : '33px';
                    t.style.transform = 'translateX(' + offset + ')';
                }, 4000);
            };
            t.addEventListener('touchstart', (e) => {
                if (t.style.transform === 'translateX(0)' || t.style.transform === 'matrix(1, 0, 0, 1, 0, 0)') {
                    clearTimeout(touchHideTimer);
                    touchHideTimer = setTimeout(() => {
                        const offset = this.triggerSide === 'left' ? '-33px' : '33px';
                        t.style.transform = 'translateX(' + offset + ')';
                    }, 4000);
                    return;
                }
                e.preventDefault();
                showTrigger();
            }, { passive: false });
            t.addEventListener('touchmove', () => {
                clearTimeout(touchHideTimer);
            }, { passive: true });
        },

        // ---------- MAIN PANEL ----------

        create() {
            const id = 'sn-obs-panel';
            const existing = document.getElementById(id);
            if (existing) {
                app.Core.Windows.toggle(id);
                return;
            }

            const w = document.createElement('div');
            w.id = id;
            w.className = 'sn-window';

            const trigger = document.getElementById('sn-obs-trigger');
            const triggerTop = trigger ? trigger.offsetTop : 200;

            const savedPanelY = GM_getValue('sn_obs_panel_y', null);
            const panelTop = savedPanelY !== null ? savedPanelY : Math.max(10, triggerTop - 80);

            const gap = 45;
            const panelLeft = this.triggerSide === 'left' ? `${gap}px` : 'auto';
            const panelRight = this.triggerSide === 'right' ? `${gap}px` : 'auto';
            w.style.cssText = `
                width: 260px;
                height: auto;
                top: ${panelTop}px;
                left: ${panelLeft};
                right: ${panelRight};
                background: var(--sn-bg-lighter, #f5f5f5);
                border: 1px solid var(--sn-border, #ddd);
                flex-direction: column;
                display: flex;
                z-index: 10010;
                overflow: hidden;
                border-radius: 12px;
                box-shadow: 0 8px 32px rgba(0,0,0,0.12);
            `;

            this.render(w);
            document.body.appendChild(w);
            app.Core.Windows.makeDraggable(w, w.querySelector('.sn-header'));

            // Auto-connect to OBS on panel open
            if (!this.connected) {
                setTimeout(() => this.doConnect().then(() => this.refresh()), 100);
            }
        },

        render(w) {
            const statusColor = this.connected ? (this.recording ? '#e53935' : '#43a047') : '#999';
            const statusText = this.connected ? (this.recording ? (this.paused ? '⏸ Paused' : '🔴 Recording') : '⚪ Idle') : '⚫ Disconnected';
            const elapsedDisplay = this.formatElapsed(this.elapsedSeconds);
            const clientName = this._cachedClientName || this.getClientName();

            const statusBarBg     = this.recording ? (this.paused ? '#fff8e1' : '#fdecea') : (this.connected ? '#e8f5e9' : '#f5f5f5');
            const statusBarBorder = this.recording ? (this.paused ? '#ffe082' : '#ef9a9a') : (this.connected ? '#a5d6a7' : '#ddd');
            const statusTextColor = this.recording ? (this.paused ? '#e65100' : '#c62828') : (this.connected ? '#2e7d32' : '#888');

            w.innerHTML = `
                <div class="sn-header" style="background:#1e1e1e; color:white; padding:8px 12px; border-bottom:1px solid rgba(0,0,0,0.1); display:flex; align-items:center; justify-content:space-between; cursor:move;">
                    <span style="font-weight:bold; font-size:13px; letter-spacing:0.5px;">🎙 OBS Recorder</span>
                    <div style="display:flex; align-items:center; gap:4px;">
                        <button id="sn-obs-settings-btn" title="OBS Connection Settings" style="background:rgba(255,255,255,0.1); border:none; color:rgba(255,255,255,0.7); cursor:pointer; font-size:14px; width:22px; height:22px; border-radius:50%; display:flex; align-items:center; justify-content:center; transition:background 0.2s; line-height:1;">⚙</button>
                        <button id="sn-obs-close" title="Click to close · Hold to save panel position" style="background:rgba(255,255,255,0.1); border:none; color:white; font-weight:bold; cursor:pointer; font-size:16px; width:24px; height:24px; border-radius:50%; display:flex; align-items:center; justify-content:center; transition:background 0.2s;">×</button>
                    </div>
                </div>
                <div style="padding:12px; display:flex; flex-direction:column; gap:10px; background:white;">
                    <!-- Prominent status bar -->
                    <div id="sn-obs-status-bar" style="display:flex; align-items:center; gap:8px; padding:8px 12px; border-radius:8px; background:${statusBarBg}; border:1px solid ${statusBarBorder}; transition:background 0.3s, border-color 0.3s;">
                        <span id="sn-obs-status-dot" style="display:inline-block; width:11px; height:11px; border-radius:50%; background:${statusColor}; flex-shrink:0; transition:background 0.3s;"></span>
                        <span id="sn-obs-status-text" style="font-size:13px; font-weight:700; color:${statusTextColor}; flex:1; letter-spacing:0.2px;">${statusText}</span>
                        <span id="sn-obs-timer-inline" style="font-family:monospace; font-size:12px; font-weight:600; color:#888;">${this.recording ? elapsedDisplay : ''}</span>
                    </div>

                    <!-- Call type selector: Direction checkboxes + Target dropdown -->
                    <div style="display:flex; align-items:center; gap:6px; font-size:11px; color:#444;">
                        <span style="white-space:nowrap; font-weight:500;">Call:</span>
                        <label style="display:flex; align-items:center; gap:3px; cursor:pointer; user-select:none; color:#555;">
                            <input type="checkbox" id="sn-obs-call-from" ${this.callDirection === 'From' ? 'checked' : ''}>
                            <span>From</span>
                        </label>
                        <label style="display:flex; align-items:center; gap:3px; cursor:pointer; user-select:none; color:#555;">
                            <input type="checkbox" id="sn-obs-call-to" ${this.callDirection === 'To' ? 'checked' : ''}>
                            <span>To</span>
                        </label>
                        <select id="sn-obs-call-target" style="flex:0 0 auto; padding:4px 6px; border:1px solid #ddd; border-radius:6px; font-size:11px; background:white; color:#333;">
                            <option value=""${this.callTarget === '' ? ' selected' : ''}>-- Select --</option>
                            <option value="CL"${this.callTarget === 'CL' ? ' selected' : ''}>CL</option>
                            <option value="DDS"${this.callTarget === 'DDS' ? ' selected' : ''}>DDS</option>
                            <option value="SSA"${this.callTarget === 'SSA' ? ' selected' : ''}>SSA</option>
                        </select>
                    </div>

                    <!-- Calling number display -->
                    ${this.currentCallNumber ? `
                    <div style="background:#e3f2fd; border-radius:8px; padding:6px 10px; font-size:12px; color:#1565c0; border:1px solid #bbdefb; display:flex; align-items:center; gap:6px;">
                        <span>📞</span>
                        <span style="font-weight:bold;">${app.Core.Utils.formatPhoneNumber(this.currentCallNumber.replace(/\D/g, '')) || this.currentCallNumber}</span>
                    </div>
                    ` : ''}

                    <!-- Client name / filename preview -->
                    <div style="background:#f9f9f9; border-radius:8px; padding:8px 10px; font-size:11px; color:#444; border:1px solid #eee;">
                        <div style="font-weight:600; margin-bottom:3px;">Filename:</div>
                        <code id="sn-obs-filename-preview" style="font-size:10px; color:#666; word-break:break-all;">${this.buildFilenamePreview(clientName)}</code>
                    </div>

                    <!-- Auto-track toggle with Companion app -->
                    <div style="display:flex; align-items:center; gap:6px; font-size:11px; padding-top:8px; border-top:1px solid #eee;">
                        <label style="display:flex; align-items:center; gap:6px; cursor:pointer; flex:1; color:#555; user-select:none;">
                            <input type="checkbox" id="sn-obs-auto-track" ${this.autoTrackEnabled ? 'checked' : ''}>
                            <span>Auto-record with Communicator</span>
                        </label>
                        <span id="sn-obs-companion-status" style="font-size:10px;" title="${this.companionConnected ? 'Companion connected' : 'Companion disconnected'}">${this.companionConnected ? '🟢' : '⚫'}</span>
                    </div>

                    <!-- Control buttons -->
                    <div style="display:flex; gap:8px;">
                        ${!this.recording ? `
                            <button id="sn-obs-start" style="flex:1; padding:10px; background:#e53935; color:white; border:none; border-radius:8px; font-weight:bold; cursor:pointer; font-size:13px;">🔴 Start</button>
                        ` : `
                            <button id="sn-obs-pause" style="flex:1; padding:10px; background:${this.paused ? '#43a047' : '#ff9800'}; color:white; border:none; border-radius:8px; font-weight:bold; cursor:pointer; font-size:13px;">${this.paused ? '▶ Resume' : '⏸ Pause'}</button>
                            <button id="sn-obs-stop" style="flex:1; padding:10px; background:#e53935; color:white; border:none; border-radius:8px; font-weight:bold; cursor:pointer; font-size:13px;">⏹ Stop</button>
                        `}
                    </div>
                </div>
            `;

            this.bindEvents(w);
        },

        bindEvents(w) {
            // × button: click to close · hold 800ms to save panel position
            (() => {
                const btn = w.querySelector('#sn-obs-close');
                let holdTimer = null;
                let isHold = false;

                btn.onmousedown = () => {
                    isHold = false;
                    holdTimer = setTimeout(() => {
                        isHold = true;
                        GM_setValue('sn_obs_panel_y', parseInt(w.style.top) || w.offsetTop);
                        btn.style.background = 'rgba(255,255,255,0.3)';
                        setTimeout(() => { btn.style.background = 'rgba(255,255,255,0.1)'; }, 300);
                        app.Core.Utils.showNotification('Panel position saved.');
                    }, 300);
                };
                btn.onmouseup = () => {
                    clearTimeout(holdTimer);
                    holdTimer = null;
                };
                btn.onmouseleave = () => {
                    clearTimeout(holdTimer);
                    holdTimer = null;
                };
                btn.onclick = (e) => {
                    if (isHold) return;
                    w.remove();
                };
            })();

            if (w.querySelector('#sn-obs-settings-btn')) {
                w.querySelector('#sn-obs-settings-btn').onclick = () => this.showSettings(w);
            }

            // Call direction + target selectors
            // Call direction checkboxes (mutually exclusive)
            const updateDirection = () => {
                const cbFrom = document.getElementById('sn-obs-call-from');
                const cbTo = document.getElementById('sn-obs-call-to');
                const checkedFrom = cbFrom && cbFrom.checked;
                const checkedTo = cbTo && cbTo.checked;

                if (checkedFrom && !checkedTo) {
                    this.callDirection = 'From';
                } else if (checkedTo && !checkedFrom) {
                    this.callDirection = 'To';
                } else {
                    this.callDirection = '';
                }

                // session-only: do NOT persist callDirection to GM storage
                if (this.callDirection) {
                    this._filenameCustomized = true;
                } else {
                    this._filenameCustomized = false;
                }

                this.refresh();
            };

            const cbFrom = w.querySelector('#sn-obs-call-from');
            if (cbFrom) {
                cbFrom.onchange = () => {
                    // Mutual exclusivity
                    const cbTo = w.querySelector('#sn-obs-call-to');
                    if (cbFrom.checked && cbTo) cbTo.checked = false;
                    updateDirection();
                };
            }
            const cbTo = w.querySelector('#sn-obs-call-to');
            if (cbTo) {
                cbTo.onchange = () => {
                    // Mutual exclusivity
                    const cbFrom = w.querySelector('#sn-obs-call-from');
                    if (cbTo.checked && cbFrom) cbFrom.checked = false;
                    updateDirection();
                };
            }

            const targetSelect = w.querySelector('#sn-obs-call-target');
            if (targetSelect) {
                targetSelect.onchange = () => {
                    this.callTarget = targetSelect.value;
                    // session-only: do NOT persist callTarget to GM storage
                    this.refresh();
                };
            }

            if (w.querySelector('#sn-obs-start')) {
                w.querySelector('#sn-obs-start').onclick = async () => {
                    await this.doStart();
                    this.refresh();
                };
            }

            if (w.querySelector('#sn-obs-pause')) {
                w.querySelector('#sn-obs-pause').onclick = async () => {
                    if (this.paused) {
                        await this.doResume();
                    } else {
                        await this.doPause();
                    }
                    this.refresh();
                };
            }

            if (w.querySelector('#sn-obs-stop')) {
                w.querySelector('#sn-obs-stop').onclick = async () => {
                    await this.doStop();
                    this.refresh();
                };
            }

            // Auto-track toggle
            const autoTrackToggle = w.querySelector('#sn-obs-auto-track');
            if (autoTrackToggle) {
                autoTrackToggle.onchange = () => {
                    this.autoTrackEnabled = autoTrackToggle.checked;
                    GM_setValue('sn_obs_auto_track', this.autoTrackEnabled);
                    app.Core.Utils.showNotification(
                        this.autoTrackEnabled ? 'Auto-record enabled.' : 'Auto-record disabled.'
                    );
                };
            }
        },

        // ---------- SETTINGS ----------

        showSettings(w) {
            if (w.querySelector('#sn-obs-settings-area')) return; // guard: already open
            const origWidth = w.style.width || '260px';
            w.style.width = '320px';

            const settingsHtml = `
                <div style="padding:12px 12px 16px; border-top:1px solid #eee; background:#fafafa; display:flex; flex-direction:column; gap:10px;">
                    <div style="font-weight:bold; font-size:12px; color:#555; margin-bottom:4px;">OBS Connection Settings</div>
                    <div style="display:flex; gap:8px; align-items:center;">
                        <label style="font-size:11px; color:#666; min-width:50px;">Host:</label>
                        <input id="sn-obs-settings-host" type="text" value="${this.connectionConfig.host}" style="flex:1; padding:6px 8px; border:1px solid #ddd; border-radius:6px; font-size:12px;">
                    </div>
                    <div style="display:flex; gap:8px; align-items:center;">
                        <label style="font-size:11px; color:#666; min-width:50px;">Port:</label>
                        <input id="sn-obs-settings-port" type="number" value="${this.connectionConfig.port}" style="flex:1; padding:6px 8px; border:1px solid #ddd; border-radius:6px; font-size:12px;">
                    </div>
                    <div style="display:flex; gap:8px; align-items:center;">
                        <label style="font-size:11px; color:#666; min-width:50px;">Pass:</label>
                        <input id="sn-obs-settings-pass" type="password" value="${this.connectionConfig.password}" style="flex:1; padding:6px 8px; border:1px solid #ddd; border-radius:6px; font-size:12px;">
                    </div>
                    <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:4px;">
                        <button id="sn-obs-settings-save" style="padding:6px 16px; background:#1976d2; color:white; border:none; border-radius:6px; cursor:pointer; font-size:11px; font-weight:bold;">Save</button>
                        <button id="sn-obs-settings-cancel" style="padding:6px 16px; background:#eee; color:#555; border:1px solid #ddd; border-radius:6px; cursor:pointer; font-size:11px;">Cancel</button>
                    </div>
                </div>
            `;

            const settingsDiv = document.createElement('div');
            settingsDiv.id = 'sn-obs-settings-area';
            settingsDiv.innerHTML = settingsHtml;
            w.appendChild(settingsDiv);

            w.querySelector('#sn-obs-settings-save').onclick = () => {
                this.connectionConfig.host = w.querySelector('#sn-obs-settings-host').value.trim() || '127.0.0.1';
                this.connectionConfig.port = parseInt(w.querySelector('#sn-obs-settings-port').value) || 4455;
                this.connectionConfig.password = w.querySelector('#sn-obs-settings-pass').value;
                this.saveConfig();
                settingsDiv.remove();
                w.style.width = origWidth;
                this.refresh();
                app.Core.Utils.showNotification('OBS settings saved.');
            };

            w.querySelector('#sn-obs-settings-cancel').onclick = () => {
                settingsDiv.remove();
                w.style.width = origWidth;
            };
        },

        // ---------- OBS WEBSOCKET ACTIONS ----------

        async doConnect() {
            try {
                if (typeof OBSWebSocket === 'undefined') {
                    app.Core.Utils.showNotification('OBSWebSocket library not loaded. Check manifest.json.', { type: 'error' });
                    return;
                }

                // Create fresh instance if previous attempt failed
                if (!this.obs) {
                    this.obs = new OBSWebSocket();
                    // Listen for unexpected disconnections so we reconnect next time
                    this.obs.on('ConnectionClosed', () => {
                        this.connected = false;
                    });
                    this.obs.on('ConnectionError', () => {
                        this.connected = false;
                    });
                }

                if (this.obs.identified) {
                    this.connected = true;
                    await this.updateStatus();
                    return;
                }

                const url = `ws://${this.connectionConfig.host}:${this.connectionConfig.port}`;

                await this.obs.connect(url, this.connectionConfig.password || undefined, {
                    rpcVersion: 1
                });

                if (this.obs.identified) {
                    this.connected = true;
                    app.Core.Utils.showNotification('Connected to OBS successfully.');
                    await this.updateStatus();
                } else {
                    app.Core.Utils.showNotification('Connected but not identified. Check password.', { type: 'error' });
                }
            } catch (err) {
                console.error('[OBS] Connection failed:', err);
                app.Core.Utils.showNotification(`OBS connection failed: ${err.message || err}`, { type: 'error' });
                this.connected = false;
                // Remove listeners then wipe the instance so next attempt creates a fresh one
                try { this.obs.off('ConnectionClosed'); this.obs.off('ConnectionError'); } catch (_) {}
                this.obs = null;
            }
        },

        async doStart() {
            try {
                if (!this.obs || !this.connected) {
                    await this.doConnect();
                }
                if (!this.connected) {
                    app.Core.Utils.showNotification('Cannot start recording: not connected to OBS.', { type: 'error' });
                    return;
                }

                // Sync state with OBS before acting (handles manual stop in OBS)
                await this.updateStatus();
                if (this.recording) {
                    app.Core.Utils.showNotification('Already recording.');
                    return;
                }

                // Cache client name for the duration of this recording
                this._cachedClientName = this.getClientName();

                // Set filename formatting before starting
                const filename = this.buildFilename();
                try {
                    await this.obs.call('SetProfileParameter', {
                        parameterCategory: 'Output',
                        parameterName: 'FilenameFormatting',
                        parameterValue: filename
                    });
                } catch (e) {
                    console.warn('[OBS] Could not set filename formatting:', e.message);
                }

                await this.obs.call('StartRecord');
                this.recording = true;
                this.paused = false;
                this.startTime = Date.now();
                this.elapsedSeconds = 0;
                this.startElapsedTimer();
                app.Core.Utils.showNotification('OBS recording started.');
            } catch (err) {
                console.error('[OBS] Start failed:', err);
                app.Core.Utils.showNotification(`Failed to start recording: ${err.message || err}`, { type: 'error' });
            }
        },

        async doPause() {
            if (!this.obs || !this.connected) {
                await this.doConnect();
            }
            if (!this.connected) {
                app.Core.Utils.showNotification('Cannot pause: not connected to OBS.', { type: 'error' });
                return;
            }

            // Sync state with OBS before acting (handles manual stop in OBS)
            await this.updateStatus();
            if (!this.recording || this.paused) return;
            try {
                await this.obs.call('PauseRecord');
                this.paused = true;
                this.stopElapsedTimer();
                app.Core.Utils.showNotification('OBS recording paused.');
            } catch (err) {
                console.error('[OBS] Pause failed:', err);
                app.Core.Utils.showNotification(`Pause failed: ${err.message || err}`, { type: 'error' });
            }
        },

        async doResume() {
            if (!this.obs || !this.connected) {
                await this.doConnect();
            }
            if (!this.connected) {
                app.Core.Utils.showNotification('Cannot resume: not connected to OBS.', { type: 'error' });
                return;
            }

            // Sync state with OBS before acting (handles manual stop in OBS)
            await this.updateStatus();
            if (!this.recording || !this.paused) return;
            try {
                await this.obs.call('ResumeRecord');
                this.paused = false;
                this.startElapsedTimer();
                app.Core.Utils.showNotification('OBS recording resumed.');
            } catch (err) {
                console.error('[OBS] Resume failed:', err);
                app.Core.Utils.showNotification(`Resume failed: ${err.message || err}`, { type: 'error' });
            }
        },

        async doStop() {
            try {
                if (!this.obs || !this.connected) {
                    await this.doConnect();
                }
                if (!this.connected) {
                    app.Core.Utils.showNotification('Cannot stop recording: not connected to OBS.', { type: 'error' });
                    return;
                }

                // Sync state with OBS before acting (handles manual stop in OBS)
                await this.updateStatus();
                if (!this.recording) {
                    app.Core.Utils.showNotification('Not currently recording.');
                    return;
                }

                const filename = this.buildFilename();

                await this.obs.call('StopRecord');
                this.recording = false;
                this.paused = false;
                this.stopElapsedTimer();
                this._cachedClientName = null;

                app.Core.Utils.showNotification(`Recording saved as: ${filename}`);
            } catch (err) {
                console.error('[OBS] Stop failed:', err);
                app.Core.Utils.showNotification(`Failed to stop recording: ${err.message || err}`, { type: 'error' });
            }
        },

        async doDisconnect() {
            try {
                if (this.recording) {
                    await this.doStop();
                }
                if (this.obs) {
                    await this.obs.disconnect();
                }
            } catch (e) { /* ignore */ }
            this.connected = false;
            this.recording = false;
            this.paused = false;
            this.stopElapsedTimer();
            app.Core.Utils.showNotification('Disconnected from OBS.');
        },

        // ---------- COMPANION APP WEBSOCKET ----------

        connectCompanion() {
            // Close existing WS without triggering reconnect
            if (this.companionWs) {
                try {
                    this.companionWs.onclose = null;
                    this.companionWs.close();
                } catch (e) { /* ignore */ }
                this.companionWs = null;
            }

            try {
                const ws = new WebSocket('ws://localhost:8027');
                const wsId = ++this.companionWsId;

                ws.onopen = () => {
                    this.companionConnected = true;
                    this._companionWsIdentity = wsId;
                    this.companionWs = ws;
                    this.updateCompanionUI();
                };

                ws.onmessage = (event) => {
                    this.handleCompanionMessage(event);
                };

                ws.onclose = () => {
                    if (this._companionWsIdentity !== wsId) return;
                    this.companionConnected = false;
                    this.companionWs = null;
                    this._companionWsIdentity = null;
                    this.updateCompanionUI();
                };

                // No onerror handler — errors are silent. onclose handles state cleanup.

                this.companionWs = ws;
                this._companionWsIdentity = wsId;
            } catch (err) {
                this.companionConnected = false;
                this.updateCompanionUI();
            }
        },

        disconnectCompanion() {
            if (this.companionWs) {
                try {
                    this.companionWs.onclose = null;
                    this.companionWs.close();
                } catch (e) { /* ignore */ }
                this.companionWs = null;
            }
            this._companionWsIdentity = null;
            this.companionConnected = false;
            this.currentCallNumber = '';
            this.updateCompanionUI();
        },

        // ---------- CALL DIRECTION DETECTION ----------

        /**
         * Strips all non-digit characters from a phone string for comparison.
         */
        _stripPhone(num) {
            return (num || '').replace(/\D/g, '');
        },

        /**
         * Checks whether the given phone number matches any of the current
         * client's phone numbers (from the stored form data).
         */
        _isClientPhoneNumber(number) {
            try {
                const digits = this._stripPhone(number);
                if (!digits) return false;
                const clientId = app.AppObserver && app.AppObserver.getClientId();
                if (!clientId) return false;
                const formData = GM_getValue('cn_form_data_' + clientId, {});
                const rawPhone = formData['Phone'] || '';
                // The Phone field may contain multiple numbers separated by newlines,
                // commas, or " - ".  Extract each and compare digits only.
                const numbers = rawPhone.split(/\n|,| - /).map(p => p.trim()).filter(Boolean);
                return numbers.some(p => this._stripPhone(p) === digits);
            } catch (e) {
                return false;
            }
        },

        /**
         * Tries to determine the call direction based on companion events.
         *
         * Heuristic (in order of priority):
         *  1) Automation panel open → outgoing "To" (user initiated the call)
         *  2) CALL_RINGING was seen before CALL_CONNECTED → incoming "From"
         *     (the phone rang, someone called us)
         *  3) CALL_CONNECTED without prior CALL_RINGING → outgoing "To"
         *     (we dialed out, no ringing on our end)
         */
        _detectCompanionDirection(number) {
            // 1) Automation panel visible → outgoing call "To"
            if (document.getElementById('sn-automation-panel')) {
                return { direction: 'To', target: 'CL' };
            }

            // Determine target: auto-select CL only if number matches a client phone
            const matchedClient = number && this._isClientPhoneNumber(number);
            const target = matchedClient ? 'CL' : '';

            // 2) Saw ringing before connect → incoming call "From"
            if (this._companionSawRinging) {
                return { direction: 'From', target };
            }
            // 3) Connected without prior ringing → outgoing call "To"
            return { direction: 'To', target };
        },

        handleCompanionMessage(event) {
            try {
                const data = JSON.parse(event.data);
                const { event: evt, number, duration } = data;

                console.log(`[OBS Companion] Event: ${evt} | Number: ${number || ''} | Duration: ${duration || 0}`);

                // Always store the number, regardless of autoTrack state
                this.currentCallNumber = number || '';

                // Track whether we saw ringing before connect
                if (evt === 'CALL_RINGING') {
                    this._companionSawRinging = true;
                }

                // Detect direction on ringing or connected
                if (evt === 'CALL_RINGING' || evt === 'CALL_CONNECTED') {
                    const detected = this._detectCompanionDirection(number);
                    this.callDirection = detected.direction;
                    this.callTarget = detected.target;
                    // session-only: do NOT persist these to GM storage
                    if (!this._filenameCustomized) {
                        this._filenameCustomized = true;
                    }
                }

                // Reset ringing flag on CALL_END regardless of autoTrack state
                if (evt === 'CALL_END') {
                    this._companionSawRinging = false;
                }

                if (!this.autoTrackEnabled) {
                    this.updateCompanionUI();
                    return;
                }

                switch (evt) {
                    case 'CALL_CONNECTED':
                        // Only start if not already recording
                        if (!this.recording) {
                            app.Core.Utils.showNotification('Companion: Call connected — starting recording.');
                            this.doStart()
                                .then(() => this.refresh())
                                .catch(e => console.error('[OBS] Auto-start failed:', e));
                        }
                        break;

                    case 'CALL_HOLD':
                        // Pause recording when call is on hold
                        if (this.recording && !this.paused) {
                            this.doPause()
                                .then(() => this.refresh())
                                .catch(e => console.error('[OBS] Auto-pause failed:', e));
                        }
                        break;

                    case 'CALL_RESUMED':
                        // Resume recording when call comes off hold
                        if (this.recording && this.paused) {
                            this.doResume()
                                .then(() => this.refresh())
                                .catch(e => console.error('[OBS] Auto-resume failed:', e));
                        }
                        break;

                    case 'CALL_RINGING':
                        // Don't start recording on ringing, only on connected
                        break;

                    case 'CALL_END':
                        // Stop recording if it's running
                        if (this.recording) {
                            app.Core.Utils.showNotification('Companion: Call ended — stopping recording.');
                            this.doStop()
                                .then(() => this.refresh())
                                .catch(e => console.error('[OBS] Auto-stop failed:', e));
                        }
                        break;
                }

                this.updateCompanionUI();
            } catch (err) {
                console.warn('[OBS Companion] Failed to parse message:', err.message);
            }
        },

        updateCompanionUI() {
            const statusEl = document.getElementById('sn-obs-companion-status');
            if (statusEl) {
                statusEl.textContent = this.companionConnected ? '🟢' : '⚫';
                statusEl.title = this.companionConnected
                    ? 'Companion connected'
                    : 'Companion disconnected (auto-retrying...) ';
            }
            const toggleEl = document.getElementById('sn-obs-auto-track');
            if (toggleEl) {
                toggleEl.checked = this.autoTrackEnabled;
            }
        },

        async updateStatus() {
            if (!this.obs || !this.connected) {
                this.recording = false;
                this.paused = false;
                this.stopElapsedTimer();
                return;
            }
            try {
                const status = await this.obs.call('GetRecordStatus');
                this.recording = status.outputActive || false;
                this.paused = status.outputPaused || false;
                if (this.recording && !this.paused) {
                    this.startElapsedTimer();
                } else {
                    this.stopElapsedTimer();
                }
            } catch (e) {
                console.warn('[OBS] Could not get status:', e.message);
            }
        },

        // ---------- TIMER ----------

        startElapsedTimer() {
            this.stopElapsedTimer();
            this.elapsedTimer = setInterval(() => {
                if (this.recording && !this.paused) {
                    this.elapsedSeconds++;
                    this.updateTimerDisplay();
                }
            }, 1000);
        },

        stopElapsedTimer() {
            if (this.elapsedTimer) {
                clearInterval(this.elapsedTimer);
                this.elapsedTimer = null;
            }
        },

        updateTimerDisplay() {
            // Inline timer inside the status bar
            const timerEl = document.getElementById('sn-obs-timer-inline');
            if (timerEl) {
                timerEl.textContent = this.recording ? this.formatElapsed(this.elapsedSeconds) : '';
            }
            // Filename preview — use cached name to avoid GM read every second
            const previewEl = document.getElementById('sn-obs-filename-preview');
            if (previewEl) {
                previewEl.textContent = this.buildFilenamePreview(this._cachedClientName || this.getClientName());
            }
            // Status dot + text
            const dot  = document.getElementById('sn-obs-status-dot');
            const text = document.getElementById('sn-obs-status-text');
            const bar  = document.getElementById('sn-obs-status-bar');
            if (dot) dot.style.background = this.recording ? (this.paused ? '#ff9800' : '#e53935') : (this.connected ? '#43a047' : '#999');
            if (text) {
                text.textContent = this.connected
                    ? (this.recording ? (this.paused ? '⏸ Paused' : '🔴 Recording') : '⚪ Idle')
                    : '⚫ Disconnected';
                text.style.color = this.recording
                    ? (this.paused ? '#e65100' : '#c62828')
                    : (this.connected ? '#2e7d32' : '#888');
            }
            if (bar) {
                bar.style.background = this.recording
                    ? (this.paused ? '#fff8e1' : '#fdecea')
                    : (this.connected ? '#e8f5e9' : '#f5f5f5');
                bar.style.borderColor = this.recording
                    ? (this.paused ? '#ffe082' : '#ef9a9a')
                    : (this.connected ? '#a5d6a7' : '#ddd');
            }
            // Sync direction checkboxes
            const cbFrom = document.getElementById('sn-obs-call-from');
            const cbTo   = document.getElementById('sn-obs-call-to');
            if (cbFrom) cbFrom.checked = (this.callDirection === 'From');
            if (cbTo)   cbTo.checked   = (this.callDirection === 'To');
            // Sync target dropdown
            const targetSelect = document.getElementById('sn-obs-call-target');
            if (targetSelect && targetSelect.value !== this.callTarget) {
                targetSelect.value = this.callTarget;
            }
            // Sync companion UI
            this.updateCompanionUI();
        },

        formatElapsed(totalSeconds) {
            const hrs = Math.floor(totalSeconds / 3600);
            const mins = Math.floor((totalSeconds % 3600) / 60);
            const secs = totalSeconds % 60;
            if (hrs > 0) {
                return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
            }
            return `${mins}:${String(secs).padStart(2, '0')}`;
        },

        // ---------- FILENAME ----------

        getClientName() {
            try {
                const clientId = app.AppObserver && app.AppObserver.getClientId();
                if (!clientId) return 'Unknown';
                const clientData = GM_getValue('cn_' + clientId, {});
                return clientData.name || 'Unknown';
            } catch (e) {
                return 'Unknown';
            }
        },

        getDateStr() {
            const now = new Date();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const year = String(now.getFullYear()).slice(-2);
            let hours = now.getHours();
            const ampm = hours >= 12 ? 'pm' : 'am';
            hours = hours % 12;
            if (hours === 0) hours = 12;
            const minutes = String(now.getMinutes()).padStart(2, '0');
            return `${month}.${day}.${year} ${hours}.${minutes}${ampm}`;
        },

        getRecordId() {
            try {
                const id = app.AppObserver && app.AppObserver.getClientId();
                return id ? id.slice(-8) : null;
            } catch (e) {
                return null;
            }
        },

        buildFilenamePreview(clientName) {
            const dateStr = this.getDateStr();

            // Unless direction was explicitly set, use simple fallback
            if (!this._filenameCustomized) {
                return `${clientName} call`;
            }

            // Full descriptive name
            const dest = this.callTarget || 'Unknown';
            return `${dateStr} - ${clientName} - Call ${this.callDirection} ${dest}`;
        },

        buildFilename() {
            const raw = this.buildFilenamePreview(this.getClientName());
            // Remove characters invalid in Windows filenames: \ / : * ? " < > |
            return raw.replace(/[\\/:*?"<>|]/g, '_');
        },

        // ---------- REFRESH ----------

        refresh() {
            const panel = document.getElementById('sn-obs-panel');
            if (panel) {
                this.render(panel);
            }
        }
    };

    app.Features.ObsRecorder = ObsRecorder;
})();