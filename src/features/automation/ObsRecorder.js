(function () {
    const app = window.CM_App = window.CM_App || {};
    app.Features = app.Features || {};

    /**
     * Provides a floating UI panel to control OBS Studio recording via WebSocket.
     * Uses obs-websocket-js loaded from src/lib/obs-ws.js (bundled in manifest.json).
     * Connects to obs-websocket (default port 4455) to Start/Pause/Stop recordings.
     * On Stop, saves the file with the format: "Call with {CLname}-Mon.DD H.MMa"
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

        connectionConfig: {
            host: '127.0.0.1',
            port: 4455,
            password: ''
        },

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
            this.createTrigger();
        },

        loadConfig() {
            const saved = GM_getValue('sn_obs_config');
            if (saved) {
                Object.assign(this.connectionConfig, saved);
            }
        },

        saveConfig() {
            GM_setValue('sn_obs_config', this.connectionConfig);
        },

        // ---------- FLOATING TRIGGER ----------

        createTrigger() {
            const triggerId = 'sn-obs-trigger';
            if (document.getElementById(triggerId)) return;

            const t = document.createElement('div');
            t.id = triggerId;
            t.title = 'OBS Recorder (Drag to move)';
            t.innerHTML = '🎙';

            t.style.cssText = `
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
                transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                user-select: none;
                border: 1px solid rgba(255,255,255,0.1);
                border-right: none;
            `;

            const savedY = GM_getValue('sn_obs_trigger_y', '60%');
            t.style.top = savedY;

            t.onmouseenter = () => { t.style.background = '#2d2d2d'; t.style.width = '42px'; };
            t.onmouseleave = () => { t.style.background = '#1e1e1e'; t.style.width = '36px'; };

            let isDragging = false;
            let startY = 0;
            let startTop = 0;

            t.onmousedown = (e) => {
                isDragging = false;
                startY = e.clientY;
                startTop = t.offsetTop;
                const onMouseMove = (moveEvent) => {
                    const deltaY = moveEvent.clientY - startY;
                    if (Math.abs(deltaY) > 5) isDragging = true;
                    let newTop = startTop + deltaY;
                    newTop = Math.max(10, Math.min(window.innerHeight - 50, newTop));
                    t.style.top = newTop + 'px';
                    const panel = document.getElementById('sn-obs-panel');
                    if (panel) panel.style.top = Math.max(10, newTop - 80) + 'px';
                };
                const onMouseUp = () => {
                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);
                    if (isDragging) GM_setValue('sn_obs_trigger_y', t.style.top);
                };
                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            };

            t.onclick = (e) => {
                if (isDragging) return;
                this.create();
            };

            document.body.appendChild(t);
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

            w.style.cssText = `
                width: 260px;
                height: auto;
                top: ${panelTop}px;
                right: 50px;
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

            const clientName = this.getClientName();

            w.innerHTML = `
                <div class="sn-header" style="background:#1e1e1e; color:white; padding:12px; border-bottom:1px solid rgba(0,0,0,0.1); display:flex; align-items:center; justify-content:space-between; cursor:move;">
                    <span style="font-weight:bold; font-size:13px; letter-spacing:0.5px;">🎙 OBS Recorder</span>
                    <div style="display:flex; align-items:center; gap:6px;">
                        <span id="sn-obs-status-dot" style="display:inline-block; width:10px; height:10px; border-radius:50%; background:${statusColor}; transition:background 0.3s;"></span>
                        <span id="sn-obs-status-text" style="font-size:10px; color:rgba(255,255,255,0.7);">${statusText}</span>
                        <button id="sn-obs-close" title="Click to close · Hold to save panel position" style="background:rgba(255,255,255,0.1); border:none; color:white; font-weight:bold; cursor:pointer; font-size:16px; width:24px; height:24px; border-radius:50%; display:flex; align-items:center; justify-content:center; transition:background 0.2s;">×</button>
                    </div>
                </div>
                <div style="padding:12px; display:flex; flex-direction:column; gap:10px; background:white;">
                    <!-- Connection info -->
                    <div style="display:flex; align-items:center; gap:8px; font-size:11px; color:#666;">
                        <span>${this.connectionConfig.host}:${this.connectionConfig.port}</span>
                        <span style="flex:1;"></span>
                        <button id="sn-obs-settings-btn" style="background:none; border:1px solid #ddd; border-radius:6px; padding:3px 8px; cursor:pointer; font-size:10px; color:#555;">⚙ Settings</button>
                    </div>

                    <!-- Client name / filename preview -->
                    <div style="background:#f9f9f9; border-radius:8px; padding:8px 10px; font-size:11px; color:#444; border:1px solid #eee;">
                        <div style="font-weight:600; margin-bottom:3px;">Filename:</div>
                        <code id="sn-obs-filename-preview" style="font-size:10px; color:#666; word-break:break-all;">${this.buildFilenamePreview(clientName)}</code>
                    </div>

                    <!-- Timer -->
                    <div id="sn-obs-timer" style="text-align:center; font-size:28px; font-weight:bold; font-family:monospace; color:#333; letter-spacing:2px; padding:10px 0; background:${this.recording ? '#fff5f5' : '#f5f5f5'}; border-radius:8px;">
                        ${elapsedDisplay}
                    </div>

                    <!-- Control buttons (Start / Pause+Stop; no manual Connect needed) -->
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
        },

        // ---------- SETTINGS ----------

        showSettings(w) {
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

                if (!this.obs) {
                    this.obs = new OBSWebSocket();
                }

                if (this.obs.identified) {
                    this.connected = true;
                    await this.updateStatus();
                    return;
                }

                const url = `ws://${this.connectionConfig.host}:${this.connectionConfig.port}`;

                const { identified } = await this.obs.connect(url, this.connectionConfig.password || undefined, {
                    rpcVersion: 1
                });

                if (identified) {
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
            }
        },

        async doStart() {
            try {
                if (!this.obs || !this.connected) {
                    await this.doConnect();
                }
                if (!this.connected) return;

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
                const filename = this.buildFilename();

                await this.obs.call('StopRecord');
                this.recording = false;
                this.paused = false;
                this.stopElapsedTimer();

                // Try to set the filename one more time (in case it wasn't set before start)
                try {
                    await this.obs.call('SetProfileParameter', {
                        parameterCategory: 'Output',
                        parameterName: 'FilenameFormatting',
                        parameterValue: filename
                    });
                } catch (e) { /* ignore */ }

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
            const timerEl = document.getElementById('sn-obs-timer');
            if (timerEl) {
                timerEl.textContent = this.formatElapsed(this.elapsedSeconds);
            }
            const previewEl = document.getElementById('sn-obs-filename-preview');
            if (previewEl) {
                previewEl.textContent = this.buildFilenamePreview(this.getClientName());
            }
            const dot = document.getElementById('sn-obs-status-dot');
            const text = document.getElementById('sn-obs-status-text');
            if (dot) dot.style.background = this.recording ? (this.paused ? '#ff9800' : '#e53935') : '#43a047';
            if (text) text.textContent = this.recording ? (this.paused ? '⏸ Paused' : '🔴 Recording') : '⚪ Idle';
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

        buildFilenamePreview(clientName) {
            // "Call with {CLname}-Oct.23 2.15pm"
            const now = new Date();
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const month = months[now.getMonth()];
            const day = now.getDate();
            let hours = now.getHours();
            const ampm = hours >= 12 ? 'pm' : 'am';
            hours = hours % 12;
            if (hours === 0) hours = 12;
            const minutes = String(now.getMinutes()).padStart(2, '0');
            return `Call with ${clientName}-${month}.${day} ${hours}.${minutes}${ampm}`;
        },

        buildFilename() {
            return this.buildFilenamePreview(this.getClientName());
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