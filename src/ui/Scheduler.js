/**
 * Scheduler – Calendar panel with reminders and notifications.
 * Accessible from the left sidebar. Data stored via GM_setValue('sn_reminders', ...).
 */
(function () {
    const app = window.CM_App = window.CM_App || {};
    app.Tools = app.Tools || {};

    const STORAGE_KEY = 'sn_reminders';
    const CHECK_INTERVAL = 30000; // Check every 30 seconds

    /**
     * Provides a calendar-based scheduling interface with persistent reminders 
     * and a polling mechanism for push notifications. 
     * Integrates with WindowManager and GlobalNotes for UI and access.
     * @namespace app.Tools.Scheduler
     */
    const Scheduler = {
        _panel: null,
        _isOpen: false,
        _viewYear: null,
        _viewMonth: null,
        _checkTimer: null,
        _tooltip: null,

        // ── Data ────────────────────────────────────────────────
        _loadReminders() {
            let reminders = GM_getValue(STORAGE_KEY, []);
            let modified = false;
            reminders.forEach(r => {
                // Backfill missing timezone for reminders linked to a matter
                if (r.matterClientId && !r.matterTZ) {
                    const resolved = this._resolveMatterTZ(r.matterClientId);
                    if (resolved) {
                        r.matterTZ = resolved;
                        modified = true;
                    }
                }
            });
            if (modified) {
                this._saveReminders(reminders);
            }
            return reminders;
        },

        _saveReminders(list) {
            GM_setValue(STORAGE_KEY, list);
        },

        _dateKey(y, m, d) {
            return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        },

        // ── Init ────────────────────────────────────────────────
        /**
         * Initializes the scheduler's background state by purging transient reminder statuses
         * (like 'snoozed' or 'notified') and starts the automated checker loop for alerts.
         */
        init() {
            const now = new Date();
            this._viewYear = now.getFullYear();
            this._viewMonth = now.getMonth();

            // Clear 'dismissed' and 'snoozed' state on startup
            const reminders = this._loadReminders();
            let wasModified = false;
            reminders.forEach(r => {
                // Clear transient states on startup
                if (r.status === 'notified' || r.status === 'snoozed') {
                    delete r.status;
                    wasModified = true;
                }
                if (r.snoozedUntil) {
                    delete r.snoozedUntil;
                    wasModified = true;
                }
            });
            if (wasModified) {
                this._saveReminders(reminders);
            }

            // Listen for UI state changes from other tabs
            GM_addValueChangeListener('sn_scheduler_ui_state', (name, oldVal, newVal, remote) => {
                if (remote) this._syncState(newVal);
            });

            // Sync to initial state on load
            const initialState = GM_getValue('sn_scheduler_ui_state', {
                isOpen: false, year: this._viewYear, month: this._viewMonth
            });

            // Listen for changes to the reminders themselves (cross-tab sync)
            GM_addValueChangeListener(STORAGE_KEY, (name, oldVal, newVal, remote) => {
                if (remote) {
                    this._syncNotifications(newVal);
                    if (this._isOpen) { this._renderCalendar(); this._renderUpcomingList(); }
                }
            });

            if (initialState.isOpen) this._syncState(initialState);


            // Start checking for due reminders
            this._startChecker();
        },

        /**
         * Toggles the visibility of the Scheduler UI panel.
         * Instantiates the DOM elements and triggers calendar/list renders on first open.
         */
        toggle() {
            const currentState = GM_getValue('sn_scheduler_ui_state', {
                isOpen: false, year: this._viewYear, month: this._viewMonth
            });
            const newState = { ...currentState, isOpen: !currentState.isOpen };
            GM_setValue('sn_scheduler_ui_state', newState);
            this._syncState(newState); // Update this tab immediately
        },

        /**
         * Internal method to apply state changes to the UI.
         * @param {object} state - The state object { isOpen, year, month }.
         */
        _syncState(state) {
            if (!state) return;
            const shouldBeOpen = state.isOpen;

            if (!this._panel && shouldBeOpen) this._buildPanel();
            if (!this._panel) return;

            this._isOpen = shouldBeOpen;
            this._panel.classList.toggle('open', this._isOpen);
            const btn = document.getElementById('sn-sidebar-sched');
            if (btn) btn.classList.toggle('active', this._isOpen);

            if (this._isOpen) {
                this._viewYear = state.year;
                this._viewMonth = state.month;
                this._renderCalendar();
                this._renderUpcomingList();
                if (this._panel) this._panel.focus();
            }
        },

        /**
         * Synchronizes active notification elements with the latest data from storage.
         * If a reminder is marked as resolved or snoozed in another tab, its UI is removed here.
         */
        _syncNotifications(reminders) {
            const activeNotifs = document.querySelectorAll('.sn-sched-notif');
            activeNotifs.forEach(notif => {
                const idMatch = notif.id.match(/sn-sched-notif-(\d+)/);
                if (idMatch) {
                    const id = parseInt(idMatch[1]);
                    const r = reminders.find(x => x.id === id);
                    // If the reminder is gone, or status changed to something that shouldn't be showing
                    if (!r || ['completed', 'cleared', 'snoozed'].includes(r.status)) {
                        notif.classList.remove('show');
                        setTimeout(() => notif.remove(), 300);
                    }
                }
            });
        },

        // ── Panel ───────────────────────────────────────────────
        _buildPanel() {
            const panel = document.createElement('div');
            panel.id = 'sn-sched-panel';
            panel.className = 'sn-sched-panel';
            panel.tabIndex = -1; // Make focusable for blur events

            panel.innerHTML = `
                <div class="sn-gnotes-header">
                    <span style="font-weight:bold; font-size:13px;">📅 Scheduler</span>
                    <div style="display:flex; align-items:center; gap:6px;">
                        <label id="sn-sched-autohide-label" title="Auto-close when clicking outside" style="font-size:10px; color:rgba(255,255,255,0.8); cursor:pointer; display:flex; align-items:center; gap:3px; user-select:none;">
                            <input type="checkbox" id="sn-sched-autohide" ${GM_getValue('sn_sched_autohide', true) ? 'checked' : ''} style="margin:0; cursor:pointer;" />
                            Auto✕
                        </label>
                        <button id="sn-sched-clear-resolved" title="Clear Resolved" style="background:none; border:1px solid white; color:white; font-size:11px; cursor:pointer; border-radius:3px; opacity:0.7;">Clear ✓</button>
                        <button id="sn-sched-test-notif" title="Test Notification" style="background:none; border:1px solid white; color:white; font-size:11px; cursor:pointer; border-radius:3px; opacity:0.7;">Test 🔔</button>
                        <span class="sn-gnotes-close" title="Close">&times;</span>
                    </div>
                </div>
                <div class="sn-sched-body-wrapper">
                    <div class="sn-sched-calendar-wrapper">
                        <div class="sn-sched-nav">
                            <button class="sn-sched-nav-btn" id="sn-sched-prev">◀</button>
                            <span class="sn-sched-month-label" id="sn-sched-month-label"></span>
                            <button class="sn-sched-nav-btn" id="sn-sched-next">▶</button>
                        </div>
                        <div class="sn-sched-grid" id="sn-sched-grid"></div>
                    </div>
                    <div id="sn-sched-v-resizer" style="width: 5px; cursor: col-resize; background: var(--sn-bg-light); flex-shrink: 0; border-left: 1px solid var(--sn-border); border-right: 1px solid var(--sn-border);"></div>
                    <div id="sn-sched-details-panel">
                        <div id="sn-sched-upcoming-list"></div>
                        <div class="sn-sched-form" id="sn-sched-form" style="display:none"></div>
                    </div>
                </div>
            `;

            // Inject styles for dots
            const style = document.createElement('style');
            style.innerHTML = `
                #sn-sched-panel { min-width: 650px !important; width: auto !important; }
                .sn-sched-body-wrapper { display: flex; flex-grow: 1; overflow: hidden; }
                .sn-sched-calendar-wrapper { display: flex; flex-direction: column; width: 320px; flex-shrink: 0; }
                #sn-sched-details-panel {
                    width: ${GM_getValue('sn_sched_details_width', '325px')};
                    min-width: 250px;
                    display: flex; flex-direction: column; position: relative;
                    background: #fcfcfc; flex-shrink: 0; flex-grow: 1;
                }
                #sn-sched-upcoming-list { flex-grow: 1; overflow-y: auto; }
                .sn-sched-group-header { position: sticky; top: 0; background: #f5f5f5; padding: 6px 10px; font-weight: bold; font-size: 12px; border-bottom: 1px solid #ddd; border-top: 1px solid #ddd; color: #555; z-index: 10; }
                .sn-sched-upcoming-item { display: flex; align-items: center; padding: 8px; border-bottom: 1px solid #eee; gap: 6px; transition: background 0.3s; }
                .sn-sched-upcoming-item:hover { background: #fafafa; }
                .sn-sched-upcoming-item.completed { background: #e8f5e9; }
                .sn-sched-upcoming-item.completed .title { color: #2e7d32; }
                .sn-sched-upcoming-item.cleared { opacity: 0.6; }
                .sn-sched-upcoming-item.cleared .title { text-decoration: line-through; color: #c62828; }
                .sn-sched-upcoming-item .time { font-size: 11px; font-weight: bold; color: #666; min-width: 35px; }
                .sn-sched-upcoming-item .title { flex-grow: 1; font-size: 12px; word-break: break-word; }
                .sn-sched-upcoming-item .actions { display: flex; gap: 4px; }
                .sn-sched-upcoming-item .actions button { background: transparent; border: 1px solid #ddd; border-radius: 4px; width: 24px; height: 24px; cursor: pointer; color: #999; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
                .sn-sched-upcoming-item .actions button:hover { color: #333; border-color: #999; background: #eee; }
                .sn-sched-upcoming-item.completed .btn-complete { background: #2e7d32; color: white; border-color: #2e7d32; }
                .sn-sched-upcoming-item.cleared .btn-dismiss { background: #ffebee; color: #c62828; border-color: #ef9a9a; }
                .sn-sched-upcoming-item .actions .btn-del.confirm-delete { background: #c62828; color: white; border-color: #b71c1c; }
                .sn-sched-upcoming-item .actions .btn-del.confirm-delete:hover { background: #d32f2f; border-color: #c62828; }
                .sn-sched-flash { animation: sn-sched-flash-anim 1.5s ease-out; }
                @keyframes sn-sched-flash-anim { 0% { background-color: #fff9c4; } 100% { background-color: transparent; } }
                .sn-sched-day { position: relative; }
                .sn-sched-dots { position: absolute; bottom: 2px; left: 0; right: 0; display: flex; justify-content: center; gap: 3px; pointer-events: none; }
                .sn-sched-dot { width: 5px; height: 5px; border-radius: 50%; }
                .sn-sched-dot.reminder { background-color: var(--sn-primary); }
                .sn-sched-dot.revisit { background-color: #d32f2f; }
                .sn-sched-matter-link:hover { text-decoration: underline !important; color: #0d47a1 !important; }
                .sn-sched-matter-option:hover { background: #e3f2fd !important; }
                .sn-sched-matter-dropdown::-webkit-scrollbar { width: 6px; }
                .sn-sched-matter-dropdown::-webkit-scrollbar-thumb { background: #c5cae9; border-radius: 3px; }
                .sn-sched-time-popup { user-select: none; }
                .sn-sched-time-popup .sn-ts-marker { pointer-events: none; }
                #sn-sched-time-display:hover { border-color: #1565c0 !important; background: #e3f2fd !important; }
                #sn-sched-time-display::before { content: '🕒'; margin-right: 4px; font-size: 11px; }
            `;
            panel.appendChild(style);

            document.body.appendChild(panel);
            this._panel = panel;

            panel.querySelector('.sn-gnotes-close').onclick = () => this.toggle();
            document.getElementById('sn-sched-prev').onclick = () => { this._changeMonth(-1); };
            document.getElementById('sn-sched-next').onclick = () => { this._changeMonth(1); };

            panel.querySelector('#sn-sched-clear-resolved').onclick = () => {
                if (confirm('Clear all resolved (completed/cleared) reminders?')) {
                    const reminders = this._loadReminders().filter(r => r.status !== 'completed' && r.status !== 'cleared');
                    this._saveReminders(reminders);
                    this._renderCalendar();
                    this._renderUpcomingList();
                }
            };

            panel.querySelector('#sn-sched-test-notif').onclick = () => {
                const testReminder = {
                    id: 'test-' + Date.now(),
                    title: 'This is a test reminder',
                    time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
                    note: 'You can snooze or dismiss this notification.'
                };
                this._showNotification(testReminder);
            };

            panel.addEventListener('mousedown', e => e.stopPropagation());

            // Auto-close on focus loss (respects autohide checkbox and time slider)
            panel.addEventListener('focusout', (e) => {
                if (!GM_getValue('sn_sched_autohide', true)) return; // Autohide disabled
                if (this._timeSliderPopup) return; // Keep panel open while time slider is active
                // If the new focus target is still inside the panel, or if there is no
                // new target (e.g., an element was hidden), don't close the panel.
                if (!e.relatedTarget || panel.contains(e.relatedTarget)) {
                    return;
                }

                // Otherwise, focus has moved outside the panel.
                if (this._isOpen) this.toggle();
            });

            // Save autohide preference on toggle
            panel.querySelector('#sn-sched-autohide').addEventListener('change', function () {
                GM_setValue('sn_sched_autohide', this.checked);
            });

            // Resizer logic for the details panel
            const detailsPanel = panel.querySelector('#sn-sched-details-panel');
            const vResizer = panel.querySelector('#sn-sched-v-resizer');
            vResizer.onmousedown = (e) => {
                e.preventDefault();
                const startX = e.clientX;
                const startW = detailsPanel.offsetWidth;
                const onMove = (ev) => {
                    const newWidth = startW + (ev.clientX - startX);
                    detailsPanel.style.width = Math.max(200, newWidth) + 'px'; // Min width of 200px
                };
                const onUp = () => {
                    document.removeEventListener('mousemove', onMove);
                    document.removeEventListener('mouseup', onUp);
                    GM_setValue('sn_sched_details_width', detailsPanel.style.width);
                };
                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
            };
        },

        _changeMonth(delta) {
            this._viewMonth += delta;
            if (this._viewMonth < 0) { this._viewMonth = 11; this._viewYear--; }
            if (this._viewMonth > 11) { this._viewMonth = 0; this._viewYear++; }

            // Update state in storage
            const currentState = GM_getValue('sn_scheduler_ui_state', { isOpen: false });
            const newState = { ...currentState, year: this._viewYear, month: this._viewMonth };
            GM_setValue('sn_scheduler_ui_state', newState);

            this._renderCalendar();
            this._renderUpcomingList();
        },

        // ── Calendar Rendering ──────────────────────────────────
        _renderCalendar() {
            const months = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'];
            const label = document.getElementById('sn-sched-month-label');
            if (label) label.textContent = `${months[this._viewMonth]} ${this._viewYear}`;

            const grid = document.getElementById('sn-sched-grid');
            if (!grid) return;
            grid.innerHTML = '';

            // Day headers
            ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].forEach(d => {
                const h = document.createElement('div');
                h.className = 'sn-sched-day-header';
                h.textContent = d;
                grid.appendChild(h);
            });

            const year = this._viewYear;
            const month = this._viewMonth;
            const firstDay = new Date(year, month, 1).getDay();
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const today = new Date();
            const todayKey = this._dateKey(today.getFullYear(), today.getMonth(), today.getDate());
            const reminders = this._loadReminders();
            const revisits = this._loadRevisits();

            // Blank cells for days before the 1st
            for (let i = 0; i < firstDay; i++) {
                const blank = document.createElement('div');
                blank.className = 'sn-sched-day blank';
                grid.appendChild(blank);
            }

            for (let d = 1; d <= daysInMonth; d++) {
                const key = this._dateKey(year, month, d);
                const cell = document.createElement('div');
                cell.className = 'sn-sched-day';
                if (key === todayKey) cell.classList.add('today');

                const dayReminders = reminders.filter(r => r.date === key);
                const dayRevisits = revisits[key] || [];

                // 1. Gray out Sat/Sun
                const dayOfWeek = new Date(year, month, d).getDay();
                if (dayOfWeek === 0 || dayOfWeek === 6) {
                    cell.style.backgroundColor = '#f5f5f5';
                }

                // 2. Holidays
                const holidays = this._getHolidays(year, month, d);
                if (holidays.length > 0) {
                    const company = holidays.find(h => h.type === 'company');
                    if (company) {
                        cell.style.backgroundColor = '#c8e6c9'; // Green
                    } else {
                        cell.style.backgroundColor = '#bbdefb'; // Blue
                    }
                    cell.title = holidays.map(h => h.name).join(', ');
                }

                cell.textContent = d;
                cell.onclick = () => {
                    this._showForm(key, d, null);
                };

                // 3. Visual Indicators (Dots)
                const dotsContainer = document.createElement('div');
                dotsContainer.className = 'sn-sched-dots';

                // Reminder Dot (Theme Color)
                if (dayReminders.length > 0) {
                    const rDot = document.createElement('div');
                    rDot.className = 'sn-sched-dot reminder';
                    dotsContainer.appendChild(rDot);
                }

                // Revisit Dot (Red)
                if (dayRevisits.length > 0) {
                    const rvDot = document.createElement('div');
                    rvDot.className = 'sn-sched-dot revisit';
                    dotsContainer.appendChild(rvDot);
                }
                cell.appendChild(dotsContainer);

                // Hover tooltip for reminders
                if (dayReminders.length > 0 || dayRevisits.length > 0 || holidays.length > 0) {
                    cell.onmouseenter = (e) => this._showTooltip(e, dayReminders, dayRevisits, holidays);
                    cell.onmouseleave = () => this._hideTooltip();
                }

                grid.appendChild(cell);
            }
        },

        _loadRevisits() {
            const map = {};
            const keys = GM_listValues().filter(k => k.startsWith('cn_') && !k.startsWith('cn_form') && !k.startsWith('cn_color'));
            keys.forEach(k => {
                const d = GM_getValue(k);
                if (d && d.revisitActive && d.revisit) {
                    if (!map[d.revisit]) map[d.revisit] = [];
                    map[d.revisit].push(d);
                }
            });
            return map;
        },

        _getHolidays(year, month, day) {
            const list = [];
            const m = month + 1;
            const key = `${m}/${day}`;
            const date = new Date(year, month, day);
            const dayOfWeek = date.getDay(); // 0=Sun, 6=Sat

            // Company Holidays (Green)
            const companyHolidays = [
                '1/1', '1/19', '4/3', '5/25', '7/4', '9/7', '10/12',
                '11/11', '11/26', '11/27', '12/24', '12/25'
            ];
            if (companyHolidays.includes(key)) list.push({ type: 'company', name: 'Company Holiday' });

            // US Federal Holidays (Blue)
            // Helper to check Nth weekday
            const isNthWeekday = (n, wd) => {
                const firstDay = new Date(year, month, 1).getDay();
                const offset = (wd - firstDay + 7) % 7;
                const targetDay = 1 + offset + (n - 1) * 7;
                return day === targetDay;
            };
            // Helper for Last weekday
            const isLastWeekday = (wd) => {
                const nextMonth = new Date(year, month + 1, 1);
                const lastDay = new Date(nextMonth - 1);
                const lastDate = lastDay.getDate();
                const lastDayOfWeek = lastDay.getDay();
                const offset = (lastDayOfWeek - wd + 7) % 7;
                return day === (lastDate - offset);
            };

            // Fixed Date Holidays & Observance
            const checkFixed = (fm, fd, name) => {
                // Actual date
                if (m === fm && day === fd) {
                    list.push({ type: 'us', name: name });
                    return;
                }
                // Observed: Sat -> Fri, Sun -> Mon
                const actual = new Date(year, fm - 1, fd);
                const actualDay = actual.getDay();
                if (actualDay === 6 && m === (new Date(year, fm - 1, fd - 1).getMonth() + 1) && day === (fd - 1)) {
                    list.push({ type: 'us', name: name + ' (Observed)' });
                }
                if (actualDay === 0 && m === (new Date(year, fm - 1, fd + 1).getMonth() + 1) && day === (fd + 1)) {
                    list.push({ type: 'us', name: name + ' (Observed)' });
                }
            };

            checkFixed(1, 1, "New Year's Day");
            checkFixed(6, 19, "Juneteenth");
            checkFixed(7, 4, "Independence Day");
            checkFixed(11, 11, "Veterans Day");
            checkFixed(12, 25, "Christmas Day");

            // Floating Holidays
            if (m === 1 && isNthWeekday(3, 1)) list.push({ type: 'us', name: "Martin Luther King Jr. Day" });
            if (m === 2 && isNthWeekday(3, 1)) list.push({ type: 'us', name: "Presidents' Day" });
            if (m === 5 && isLastWeekday(1)) list.push({ type: 'us', name: "Memorial Day" });
            if (m === 9 && isNthWeekday(1, 1)) list.push({ type: 'us', name: "Labor Day" });
            if (m === 10 && isNthWeekday(2, 1)) list.push({ type: 'us', name: "Columbus Day" });
            if (m === 11 && isNthWeekday(4, 4)) list.push({ type: 'us', name: "Thanksgiving Day" });

            return list;
        },

        _extractChecklist(notes) {
            if (!notes) return [];
            const items = [];
            // Try HTML parsing first
            if (notes.includes('<') && notes.includes('>')) {
                const div = document.createElement('div');
                div.innerHTML = notes;
                div.querySelectorAll('.sn-todo-item').forEach(el => {
                    const span = el.querySelector('span');
                    if (span) items.push(span.textContent.trim());
                });
            }
            // Fallback/Legacy text parsing
            if (items.length === 0 && notes) {
                const lines = notes.split('\n');
                lines.forEach(line => {
                    const trim = line.trim();
                    if (trim.startsWith('> ') || trim.startsWith('>x ')) {
                        items.push(trim.replace(/^>x? /, ''));
                    }
                });
            }
            return items;
        },

        _renderUpcomingList() {
            const listEl = document.getElementById('sn-sched-upcoming-list');
            if (!listEl) return;

            const reminders = this._loadReminders().sort((a, b) => {
                if (a.date !== b.date) return a.date.localeCompare(b.date);
                return (a.time || '00:00').localeCompare(b.time || '00:00');
            });

            let html = '';
            if (reminders.length === 0) {
                html += '<div style="padding:15px; text-align:center; color:#999; font-size:12px;">No reminders.</div>';
            } else {
                // Group by date
                const groups = {};
                reminders.forEach(r => {
                    if (!groups[r.date]) groups[r.date] = [];
                    groups[r.date].push(r);
                });

                Object.keys(groups).sort().forEach(dateKey => {
                    html += `<div id="sn-sched-group-${dateKey}" class="sn-sched-date-group">`;
                    html += `<div class="sn-sched-group-header">${dateKey}</div>`;
                    groups[dateKey].forEach(r => {
                        let statusClass = '';
                        if (r.status === 'completed') statusClass = 'completed';
                        else if (r.status === 'cleared') statusClass = 'cleared';

                        const titleContent = r.matterClientId
                            ? `<span class="sn-sched-matter-link" data-matter-id="${this._escHtml(r.matterClientId)}" style="cursor:pointer; color:#1565c0; text-decoration:underline;" title="Click to open case${r.matterClientName ? ': ' + this._escHtml(r.matterClientName) : ''}">${this._escHtml(r.title)}</span>`
                            : this._escHtml(r.title);

                        html += `
                            <div class="sn-sched-upcoming-item ${statusClass}" data-id="${r.id}">
                                <div class="actions">
                                    <button class="btn-complete" title="Complete">✓</button>
                                    <button class="btn-dismiss" title="Dismiss">✕</button>
                                </div>
                                <div class="time">${r.time || ''}</div>
                                <div class="title" title="${this._escHtml(r.note || '')}${r.matterClientName ? '\nMatter: ' + this._escHtml(r.matterClientName) : ''}${r.matterTZ ? '\nTZ: ' + this._escHtml(r.matterTZ) : ''}">${titleContent}</div>
                                <div class="actions">
                                    <button class="btn-edit" title="Edit">✏️</button>
                                    <button class="btn-del" title="Delete">🗑️</button>
                                </div>
                            </div>
                        `;
                    });
                    html += `</div>`;
                });
            }
            listEl.innerHTML = html;

            // Bind events
            listEl.onclick = (e) => {
                // Handle matter link clicks (open the case)
                const matterLink = e.target.closest('.sn-sched-matter-link');
                if (matterLink) {
                    const mid = matterLink.dataset.matterId;
                    if (mid) {
                        GM_openInTab(`${window.location.origin}/lightning/r/kdlaw__Matter__c/${mid}/view`, { active: false });
                    }
                    return;
                }

                // Click on the time display → show the time slider popup
                const timeEl = e.target.closest('.time');
                if (timeEl) {
                    const item = timeEl.closest('.sn-sched-upcoming-item');
                    if (item) {
                        const id = parseInt(item.dataset.id);
                        const r = this._loadReminders().find(x => x.id === id);
                        if (r) this._showTimeSlider(e, r);
                    }
                    return;
                }

                const btn = e.target.closest('button');
                const item = btn ? btn.closest('.sn-sched-upcoming-item') : null;

                // If a delete confirmation is pending, and the click is not on that same button, reset it.
                const pendingDelete = listEl.querySelector('.btn-del.confirm-delete');
                if (pendingDelete && pendingDelete !== btn) {
                    pendingDelete.classList.remove('confirm-delete');
                    pendingDelete.innerHTML = '🗑️';
                }

                if (!btn || !item) return;

                const id = parseInt(item.dataset.id);

                if (btn.classList.contains('btn-complete')) {
                    this._toggleStatus(id, 'completed');
                } else if (btn.classList.contains('btn-dismiss')) {
                    this._toggleStatus(id, 'cleared');
                } else if (btn.classList.contains('btn-edit')) {
                    const r = this._loadReminders().find(x => x.id === id);
                    if (r) {
                        const dayNum = parseInt(r.date.split('-')[2]);
                        this._showForm(r.date, dayNum, id);
                    }
                } else if (btn.classList.contains('btn-del')) {
                    if (btn.classList.contains('confirm-delete')) {
                        // This is the second click, so delete the item.
                        const reminders = this._loadReminders().filter(r => r.id !== id);
                        this._saveReminders(reminders);
                        this._renderCalendar();
                        this._renderUpcomingList();
                    } else {
                        // This is the first click, change to confirm state.
                        btn.classList.add('confirm-delete');
                    }
                }
            };
        },

        _toggleStatus(id, status) {
            const reminders = this._loadReminders();
            const r = reminders.find(x => x.id === id);
            if (r) {
                // Toggle off if already set, otherwise set
                r.status = (r.status === status) ? undefined : status;
                this._saveReminders(reminders);
                this._renderCalendar();
                this._renderUpcomingList();
            }
        },

        _scrollToDate(dateKey) {
            const group = document.getElementById('sn-sched-group-' + dateKey);
            if (group) {
                group.scrollIntoView({ behavior: 'smooth', block: 'start' });
                // Trigger animation
                group.classList.remove('sn-sched-flash');
                void group.offsetWidth;
                group.classList.add('sn-sched-flash');
            }
        },

        // ── Tooltip ─────────────────────────────────────────────
        _showTooltip(e, reminders, revisits, holidays) {
            this._hideTooltip();
            const tip = document.createElement('div');
            tip.className = 'sn-sched-tooltip';
            let html = '';

            if (holidays && holidays.length > 0) {
                holidays.forEach(h => {
                    html += `<div class="sn-sched-tip-item" style="color:${h.type === 'company' ? '#2e7d32' : '#1565c0'}; font-weight:bold;">🎉 ${h.name}</div>`;
                });
            }

            reminders.forEach(r => {
                // Resolve TZ on the fly for tooltip display if not already saved
                const tipTZ = r.matterTZ || (r.matterClientId ? this._resolveMatterTZ(r.matterClientId) : null);
                html += `<div class="sn-sched-tip-item">
                    <b>${r.time || ''}</b> ${this._escHtml(r.title)}
                    ${r.note ? `<div style="font-size:10px;color:#666;">${this._escHtml(r.note)}</div>` : ''}
                    ${r.matterClientName ? `<div style="font-size:10px;color:#1565c0;">📁 ${this._escHtml(r.matterClientName)}</div>` : ''}
                    ${tipTZ ? `<div style="font-size:10px;color:#e65100;">🕐 ${this._escHtml(tipTZ)}</div>` : ''}
                </div>`;
            });

            revisits.forEach(rv => {
                const todos = this._extractChecklist(rv.notes);
                const todoHtml = todos.length > 0 ? `<div style="font-size:10px;color:#555;margin-left:5px;">${todos.map(t => `• ${this._escHtml(t)}`).join('<br>')}</div>` : '';
                html += `<div class="sn-sched-tip-item" style="border-top:1px solid #eee; margin-top:2px; padding-top:2px;">
                    <span style="color:#d32f2f; font-weight:bold;">Revisit:</span> ${this._escHtml(rv.name)}
                    ${todoHtml}
                </div>`;
            });

            tip.innerHTML = html;
            document.body.appendChild(tip);
            this._tooltip = tip;

            const rect = e.target.getBoundingClientRect();
            tip.style.left = (rect.right + 8) + 'px';
            tip.style.top = rect.top + 'px';

            // Keep in viewport
            const tipRect = tip.getBoundingClientRect();
            if (tipRect.right > window.innerWidth - 10) {
                tip.style.left = (rect.left - tipRect.width - 8) + 'px';
            }
            if (tipRect.bottom > window.innerHeight - 10) {
                tip.style.top = (window.innerHeight - tipRect.height - 10) + 'px';
            }
        },

        _hideTooltip() {
            if (this._tooltip) { this._tooltip.remove(); this._tooltip = null; }
        },

        // ── Time Slider Popup ───────────────────────────────────
        _timeSliderPopup: null,

        /**
         * Shows an interactive horizontal time slider (7AM–5PM) with the reminder's
         * current time and local machine time marked. Supports drag-to-select.
         * @param {MouseEvent} e - The click event.
         * @param {object} reminder - The reminder object.
         * @param {Function} [onSelect] - Optional callback(minutes) when user selects a time.
         */
        _showTimeSlider(e, reminder, onSelect) {
            this._hideTimeSlider();

            const START = 7 * 60;  // 7:00 AM
            const END = 17 * 60;   // 5:00 PM
            const RANGE = END - START;
            const toPct = (m) => Math.max(0, Math.min(100, ((m - START) / RANGE) * 100));

            const reminderMinutes = this._parseTime(reminder.time) || START;
            const now = new Date();
            const localMinutes = now.getHours() * 60 + now.getMinutes();
            const localStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

            // ── Timezone conversion ──
            const ianaMap = (app.Features && app.Features.ClientNote && app.Features.ClientNote.ianaTZ) || {};
            const matterTZ = reminder.matterTZ || '';
            const ianaTZ = ianaMap[matterTZ] || null;
            const localTZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

            // Build a date string from today + the reminder time for conversion
            const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;

            const fmt = (m) => {
                const h = Math.floor(m / 60);
                const min = m % 60;
                const ampm = h >= 12 ? 'PM' : 'AM';
                const hh = h > 12 ? h - 12 : (h === 0 ? 12 : h);
                return `${hh}:${String(min).padStart(2, '0')} ${ampm}`;
            };

            // Convert a minutes-based time from matter TZ to local TZ
            const toLocalTime = (mins) => {
                if (!ianaTZ) return null;
                const h = Math.floor(mins / 60);
                const m = mins % 60;
                const dateStr = `${todayStr}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`;
                try {
                    const d = new Date(dateStr);
                    return d.toLocaleTimeString('en-US', { timeZone: localTZ, hour: '2-digit', minute: '2-digit', hour12: true });
                } catch(e) {
                    return null;
                }
            };

            const popup = document.createElement('div');
            popup.className = 'sn-sched-time-popup';
            popup.style.cssText = `
                position:fixed; z-index:2147483647; background:#fff; border:1px solid #c5cae9;
                border-radius:8px; padding:14px 16px; box-shadow:0 6px 20px rgba(0,0,0,0.18);
                font-family:inherit; width:300px;
            `;
            popup.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <span style="font-weight:bold; font-size:13px; color:#333;">⏱ Select Time</span>
                    <span style="font-size:11px; color:#999;">${this._escHtml(reminder.title)}</span>
                </div>
                ${ianaTZ ? `<div style="font-size:10px; color:#666; margin-bottom:6px; text-align:center;">🕐 Matter timezone: <b>${this._escHtml(matterTZ)}</b> &nbsp;|&nbsp; Your local: <b>${localTZ}</b></div>` : ''}
                <div class="sn-ts-track" style="position:relative; height:40px; margin:2px 0 2px 0; cursor:pointer;">
                    <div style="position:absolute; top:16px; left:0; right:0; height:6px; background:#e8eaf6; border-radius:3px; pointer-events:none;"></div>
                    <div style="position:absolute; top:0; left:0; right:0; display:flex; justify-content:space-between; font-size:9px; color:#999; pointer-events:none;">
                        <span>7AM</span><span>12PM</span><span>5PM</span>
                    </div>
                    <!-- Draggable reminder marker (blue) -->
                    <div class="sn-ts-marker reminder" style="position:absolute; top:10px; left:${toPct(reminderMinutes)}%; transform:translateX(-50%); display:flex; flex-direction:column; align-items:center; z-index:3; pointer-events:none;">
                        <div style="width:14px; height:14px; background:#1565c0; border:2px solid #fff; border-radius:50%; box-shadow:0 1px 4px rgba(0,0,0,0.3);"></div>
                        <span style="font-size:11px; font-weight:bold; color:#1565c0; margin-top:1px; white-space:nowrap;">${fmt(reminderMinutes)}${ianaTZ ? ' ' + matterTZ : ''}</span>
                    </div>
                    <!-- Local time marker (red, static) -->
                    <div class="sn-ts-marker local" style="position:absolute; top:10px; left:${toPct(localMinutes)}%; transform:translateX(-50%); display:flex; flex-direction:column; align-items:center; z-index:2; pointer-events:none;">
                        <div style="width:10px; height:10px; background:#e53935; border:2px solid #fff; border-radius:50%; box-shadow:0 1px 4px rgba(0,0,0,0.3);"></div>
                        <span style="font-size:9px; color:#e53935; margin-top:1px; white-space:nowrap;">Now ${localStr}</span>
                    </div>
                </div>
                ${ianaTZ ? `<div id="sn-ts-local-eq" style="font-size:10px; color:#666; text-align:center; margin-top:2px;">${fmt(reminderMinutes)} ${matterTZ} = <b>${toLocalTime(reminderMinutes) || '?'}</b> your time</div>` : ''}
                ${onSelect ? `<div style="text-align:center; margin-top:4px;"><button class="sn-ts-apply-btn" style="padding:4px 16px; background:#1565c0; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:12px;">Apply Time</button></div>` : ''}
            `;

            document.body.appendChild(popup);
            this._timeSliderPopup = popup;
            popup.addEventListener('click', (ev) => ev.stopPropagation());

            // ── Interactive drag on the track ──
            const track = popup.querySelector('.sn-ts-track');
            const reminderMarker = popup.querySelector('.sn-ts-marker.reminder');
            const reminderLabel = reminderMarker.querySelector('span');
            let _dragging = false;

            const updateFromMouse = (clientX) => {
                const rect = track.getBoundingClientRect();
                let pct = ((clientX - rect.left) / rect.width) * 100;
                pct = Math.max(0, Math.min(100, pct));
                const mins = Math.round((START + (pct / 100) * RANGE) / 5) * 5; // snap to 5-min
                pct = toPct(mins);
                reminderMarker.style.left = pct + '%';
                reminderLabel.textContent = fmt(mins) + (ianaTZ ? ' ' + matterTZ : '');
                // Update local time conversion label
                const localEqEl = popup.querySelector('#sn-ts-local-eq');
                if (localEqEl && ianaTZ) {
                    localEqEl.innerHTML = `${fmt(mins)} ${matterTZ} = <b>${toLocalTime(mins) || '?'}</b> your time`;
                }
                return mins;
            };

            const onTrackDown = (ev) => {
                _dragging = true;
                updateFromMouse(ev.clientX);
            };

            track.addEventListener('mousedown', onTrackDown);
            // Store for cleanup
            popup._trackDown = onTrackDown;

            document.addEventListener('mousemove', (ev) => {
                if (_dragging) updateFromMouse(ev.clientX);
            });

            document.addEventListener('mouseup', () => {
                _dragging = false;
            });

            // ── Apply button (only when onSelect is provided) ──
            if (onSelect) {
                popup.querySelector('.sn-ts-apply-btn').onclick = () => {
                    // Read the current selected time from the marker position
                    const pctStr = reminderMarker.style.left;
                    const pct = parseFloat(pctStr);
                    if (!isNaN(pct)) {
                        const mins = Math.round((START + (pct / 100) * RANGE) / 5) * 5;
                        onSelect(mins);
                    }
                    this._hideTimeSlider();
                };
            }

            // ── Position ──
            const rect = e.target.getBoundingClientRect();
            let left = rect.left + rect.width / 2 - 140;
            let top = rect.bottom + 8;
            if (left < 10) left = 10;
            if (left + 280 > window.innerWidth - 10) left = window.innerWidth - 290;
            if (top + popup.offsetHeight > window.innerHeight - 10) top = rect.top - popup.offsetHeight - 8;
            popup.style.left = left + 'px';
            popup.style.top = top + 'px';

            // ── Close handlers ──
            const close = () => this._hideTimeSlider();
            setTimeout(() => document.addEventListener('click', close), 10);
            this._timeSliderClose = close;
            const onKey = (ev) => { if (ev.key === 'Escape') close(); };
            document.addEventListener('keydown', onKey);
            this._timeSliderKeyHandler = onKey;
        },

        _hideTimeSlider() {
            if (this._timeSliderPopup) {
                this._timeSliderPopup.remove();
                this._timeSliderPopup = null;
            }
            if (this._timeSliderClose) {
                document.removeEventListener('click', this._timeSliderClose);
                this._timeSliderClose = null;
            }
            if (this._timeSliderKeyHandler) {
                document.removeEventListener('keydown', this._timeSliderKeyHandler);
                this._timeSliderKeyHandler = null;
            }
        },

        _parseTime(timeStr) {
            if (!timeStr) return null;
            const parts = timeStr.split(':');
            if (parts.length < 2) return null;
            const h = parseInt(parts[0]);
            const m = parseInt(parts[1]);
            if (isNaN(h) || isNaN(m)) return null;
            return h * 60 + m;
        },

        _formatTime(mins) {
            const h = Math.floor(mins / 60);
            const m = mins % 60;
            return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        },

        _escHtml(str) {
            const d = document.createElement('div');
            d.textContent = str || '';
            return d.innerHTML;
        },

        /**
         * Gets the current page's matter info (client name + client ID + timezone) if on a case page.
         * @returns {{clientId: string|null, clientName: string, timezone: string|null}}
         */
        _getCurrentMatter() {
            const clientId = app.AppObserver && app.AppObserver.getClientId();
            if (!clientId) return { clientId: null, clientName: '', timezone: null };
            const clientData = GM_getValue('cn_' + clientId, {});
            const tz = clientData.tz || (app.Features.ClientNote && app.Features.ClientNote.detectTimezone(clientData.state, clientData.city)) || null;
            return { clientId, clientName: clientData.name || '', timezone: tz };
        },

        /**
         * Searches all stored matters by name (case-insensitive).
         * @param {string} query - The search string.
         * @returns {Array<{clientId: string, clientName: string}>}
         */
        _searchMatters(query) {
            if (!query || !query.trim()) return [];
            const q = query.trim().toLowerCase();
            const results = [];
            const keys = GM_listValues().filter(k => k.startsWith('cn_') && !k.startsWith('cn_color') && !k.startsWith('cn_form') && !k.startsWith('cn_med') && !k.startsWith('cn_font'));
            keys.forEach(k => {
                const clientId = k.slice(3); // Remove 'cn_' prefix
                const d = GM_getValue(k);
                if (d && d.name && d.name.toLowerCase().includes(q)) {
                    results.push({ clientId, clientName: d.name });
                }
            });
            // Sort by relevance: exact starts-with matches first
            results.sort((a, b) => {
                const aStarts = a.clientName.toLowerCase().startsWith(q) ? 0 : 1;
                const bStarts = b.clientName.toLowerCase().startsWith(q) ? 0 : 1;
                if (aStarts !== bStarts) return aStarts - bStarts;
                return a.clientName.localeCompare(b.clientName);
            });
            return results.slice(0, 20); // Limit to 20 results
        },

        /**
         * Resolves the timezone for a given matter client ID by checking:
         *   1. Saved timezone in `cn_<clientId>.tz`
         *   2. Auto-detection from saved `state`/`city` in `cn_<clientId>`
         *   3. Auto-detection from form data `cn_form_data_<clientId>` (State/City)
         *   4. Auto-detection from `cn_contact_data_<clientId>` (fallback scrape data)
         * @param {string} clientId - The 18-character Salesforce Client ID.
         * @returns {string|null} The timezone abbreviation or null.
         */
        _resolveMatterTZ(clientId) {
            if (!clientId) return null;

            // 1. Check saved timezone in main client data
            const clientData = GM_getValue('cn_' + clientId, {});
            if (clientData.tz) return clientData.tz;

            // 2. Auto-detect from saved state/city in main client data
            if (clientData.state || clientData.city) {
                const detected = app.Features.ClientNote &&
                    app.Features.ClientNote.detectTimezone(clientData.state, clientData.city);
                if (detected) return detected;
            }

            // 3. Fallback to form data (cn_form_data_*)
            const formData = GM_getValue('cn_form_data_' + clientId, {});
            const formState = formData['State'] || clientData.state;
            const formCity = formData['City'] || clientData.city;
            if (formState || formCity) {
                const detected = app.Features.ClientNote &&
                    app.Features.ClientNote.detectTimezone(formState, formCity);
                if (detected) return detected;
            }

            // 4. Fallback to contact data (scraped from matter pages)
            const contactData = GM_getValue('sn_contact_data_' + clientId, {});
            // Contact data may have city/state keys from scraped matter fields
            return null;
        },

        // ── Reminder Form ───────────────────────────────────────
        _showForm(dateKey, dayNum, reminderId = null) {
            const form = document.getElementById('sn-sched-form');
            if (!form) return;

            // Prevent auto-close by moving focus to panel before destroying button elements
            if (this._panel) this._panel.focus();

            const isEditing = reminderId !== null;
            let reminderToEdit = null;
            if (isEditing) {
                reminderToEdit = this._loadReminders().find(r => r.id === reminderId);
            }

            // Resolve matter defaults: for editing, use stored values; for new, use current page
            const matter = this._getCurrentMatter();
            const matterName = isEditing ? (reminderToEdit.matterClientName || '') : (matter.clientName || '');
            const matterId = isEditing ? (reminderToEdit.matterClientId || '') : (matter.clientId || '');
            const matterTZ = isEditing ? (reminderToEdit.matterTZ || '') : (matter.timezone || '');

            // DST-aware timezone dropdown: only show current season's options
            const _isUSDaylightTime = () => {
                const now = new Date();
                const year = now.getFullYear();
                // DST starts 2nd Sunday of March, ends 1st Sunday of November
                const mar1 = new Date(year, 2, 1);
                const marSun = (mar1.getDay() === 0 ? 7 : mar1.getDay()); // days until first Sunday
                const dstStart = new Date(year, 2, 1 + (7 - mar1.getDay()) % 7 + 7); // 2nd Sunday
                const nov1 = new Date(year, 10, 1);
                const dstEnd = new Date(year, 10, 1 + (7 - nov1.getDay()) % 7); // 1st Sunday
                return now >= dstStart && now < dstEnd;
            };
            const isDaylight = _isUSDaylightTime();
            const tzOptions = isDaylight
                ? ['', 'EDT', 'CDT', 'MDT', 'PDT', 'AKDT', 'HST']
                : ['', 'EST', 'CST', 'MST', 'PST', 'AKST', 'HST'];
            const tzLabels = {
                '': '— None —',
                'EDT': 'EDT', 'CDT': 'CDT', 'MDT': 'MDT', 'PDT': 'PDT', 'AKDT': 'AKDT',
                'EST': 'EST', 'CST': 'CST', 'MST': 'MST', 'PST': 'PST', 'AKST': 'AKST',
                'HST': 'HST'
            };
            // If saved matterTZ isn't in current season's options, still include it so it shows
            if (matterTZ && !tzOptions.includes(matterTZ)) {
                tzOptions.push(matterTZ);
            }
            const tzHtml = tzOptions.map(v =>
                `<option value="${v}"${matterTZ === v ? ' selected' : ''}>${tzLabels[v] || v}</option>`
            ).join('');

            form.style.display = 'block';
            form.innerHTML = `
                <div class="sn-sched-form-header">
                    <b>${isEditing ? 'Edit Reminder' : 'Create Reminder'}</b>
                    <span class="sn-sched-form-close" title="Close">&times;</span>
                </div>
                <div class="sn-sched-form-fields">
                    <input type="hidden" id="sn-sched-id" value="${isEditing ? reminderToEdit.id : ''}">
                    <div class="sn-sched-matter-row" style="display:flex; align-items:center; gap:5px; margin-bottom:6px; position:relative;">
                        <label style="font-size:11px; color:#666; min-width:45px; font-weight:bold;">Matter:</label>
                        <input id="sn-sched-matter-name" type="text" class="sn-sched-input" placeholder="Type to search matters…" style="flex-grow:1; font-size:12px; padding:4px 6px;" value="${this._escHtml(matterName)}" autocomplete="off" />
                        <input type="hidden" id="sn-sched-matter-id" value="${matterId}" />
                        <button id="sn-sched-clear-matter" title="Remove matter link (make generic reminder)" style="background:none; border:1px solid #ddd; border-radius:3px; cursor:pointer; color:#999; width:24px; height:24px; display:flex; align-items:center; justify-content:center; font-size:13px;${matterName ? '' : ' opacity:0.3;'}"${matterName ? '' : ' disabled'}>✕</button>
                        <div id="sn-sched-matter-dropdown" class="sn-sched-matter-dropdown" style="display:none; position:absolute; top:100%; left:50px; right:30px; z-index:1000; background:#fff; border:1px solid #c5cae9; border-radius:3px; max-height:200px; overflow-y:auto; box-shadow:0 4px 12px rgba(0,0,0,0.15);"></div>
                    </div>
                    <input id="sn-sched-title" placeholder="Title" class="sn-sched-input" value="${isEditing ? this._escHtml(reminderToEdit.title) : ''}" />
                    <div style="display:flex; gap:4px; align-items:center;">
                        <input id="sn-sched-date" type="date" class="sn-sched-input" style="flex:1; min-width:0;" value="${isEditing ? reminderToEdit.date : dateKey}" />
                        <div id="sn-sched-time-wrapper" style="flex:0 0 auto; position:relative;">
                            <input type="hidden" id="sn-sched-time" value="${isEditing ? (reminderToEdit.time || '09:00') : '09:00'}" />
                            <span id="sn-sched-time-display" style="display:block; padding:4px 7px; background:#fff; border:1px solid #bdbdbd; border-radius:3px; font-size:11px; cursor:pointer; text-align:center; color:#333; user-select:none; min-width:48px;">${isEditing ? (reminderToEdit.time || '09:00') : '09:00'}</span>
                        </div>
                        <select id="sn-sched-tz" class="sn-sched-input" style="flex:0 0 auto; width:78px; font-size:11px; padding:3px 2px;">${tzHtml}</select>
                    </div>
                    <textarea id="sn-sched-note" placeholder="Note (optional)" class="sn-sched-input" rows="3">${isEditing ? this._escHtml(reminderToEdit.note || '') : ''}</textarea>
                    <div style="display:flex; gap: 8px; margin-top: 5px;">
                        <button id="sn-sched-back-btn" class="sn-sched-save-btn" style="background-color: #757575;">Back to List</button>
                        <button id="sn-sched-save" class="sn-sched-save-btn" style="flex-grow: 1;">${isEditing ? 'Update Reminder' : 'Save Reminder'}</button>
                    </div>
                </div>
            `;

            form.querySelector('.sn-sched-form-close').onclick = () => { form.style.display = 'none'; };

            const goBackToList = () => {
                form.style.display = 'none';
                const list = document.getElementById('sn-sched-upcoming-list');
                if (list) list.style.display = 'block';
            };
            form.querySelector('#sn-sched-back-btn').onclick = goBackToList;

            // ── Matter autocomplete ─────────────────────────────
            const matterInput = form.querySelector('#sn-sched-matter-name');
            const matterIdEl = form.querySelector('#sn-sched-matter-id');
            const dropdown = form.querySelector('#sn-sched-matter-dropdown');
            let _selectedIndex = -1;

            // Input: when the user manually types (not selecting from dropdown), clear the ID
            matterInput.addEventListener('input', () => {
                matterIdEl.value = ''; // User is typing, so unlink from any previously selected matter
                _selectedIndex = -1;
                const query = matterInput.value.trim();
                if (query.length < 1) {
                    dropdown.style.display = 'none';
                    return;
                }
                const results = this._searchMatters(query);
                if (results.length === 0) {
                    dropdown.style.display = 'none';
                    return;
                }
                // Render dropdown
                dropdown.innerHTML = results.map((r, i) =>
                    `<div class="sn-sched-matter-option" data-index="${i}" data-id="${this._escHtml(r.clientId)}" data-name="${this._escHtml(r.clientName)}" style="padding:6px 8px; cursor:pointer; font-size:12px; border-bottom:1px solid #f0f0f0; transition:background 0.15s;">${this._escHtml(r.clientName)}</div>`
                ).join('');
                dropdown.style.display = 'block';
            });

            // Dropdown item click → select
            dropdown.addEventListener('click', (e) => {
                const opt = e.target.closest('.sn-sched-matter-option');
                if (!opt) return;
                matterInput.value = opt.dataset.name;
                matterIdEl.value = opt.dataset.id;
                dropdown.style.display = 'none';
                _selectedIndex = -1;
                // Re-enable clear button
                const btn = form.querySelector('#sn-sched-clear-matter');
                btn.style.opacity = '';
                btn.disabled = false;
                // Auto-update timezone from selected matter (uses _resolveMatterTZ fallback chain)
                const detectedTZ = this._resolveMatterTZ(opt.dataset.id) || '';
                const tzSelect = form.querySelector('#sn-sched-tz');
                if (detectedTZ && tzSelect) tzSelect.value = detectedTZ;
            });

            // Keyboard navigation in the dropdown
            matterInput.addEventListener('keydown', (e) => {
                const options = dropdown.querySelectorAll('.sn-sched-matter-option');
                if (options.length === 0) return;
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    _selectedIndex = Math.min(_selectedIndex + 1, options.length - 1);
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    _selectedIndex = Math.max(_selectedIndex - 1, -1);
                } else if (e.key === 'Enter' && _selectedIndex >= 0) {
                    e.preventDefault();
                    options[_selectedIndex].click();
                    return;
                } else if (e.key === 'Escape') {
                    dropdown.style.display = 'none';
                    _selectedIndex = -1;
                    return;
                } else {
                    return; // Let other keys propagate
                }
                // Highlight the selected option
                options.forEach((opt, i) => {
                    opt.style.background = i === _selectedIndex ? '#e3f2fd' : '';
                    opt.style.fontWeight = i === _selectedIndex ? 'bold' : 'normal';
                });
            });

            // Hide dropdown on blur (with delay to allow click)
            matterInput.addEventListener('blur', () => {
                setTimeout(() => { dropdown.style.display = 'none'; _selectedIndex = -1; }, 200);
            });

            // Clear matter button
            form.querySelector('#sn-sched-clear-matter').onclick = () => {
                matterInput.value = '';
                matterIdEl.value = '';
                dropdown.style.display = 'none';
                _selectedIndex = -1;
                const btn = form.querySelector('#sn-sched-clear-matter');
                btn.style.opacity = '0.3';
                btn.disabled = true;
            };

            // ── Time display click → open interactive slider ──
            const timeDisplay = form.querySelector('#sn-sched-time-display');
            const timeHidden = form.querySelector('#sn-sched-time');
            const tzSelect = form.querySelector('#sn-sched-tz');
            timeDisplay.onclick = (ev) => {
                // Build a fake reminder object with the current form values
                const fakeReminder = {
                    title: document.getElementById('sn-sched-title').value.trim() || 'Set time',
                    time: timeHidden.value,
                    matterTZ: tzSelect.value || undefined
                };
                this._showTimeSlider(ev, fakeReminder, (mins) => {
                    const newTime = this._formatTime(mins);
                    timeHidden.value = newTime;
                    timeDisplay.textContent = newTime;
                });
            };

            // ── Save handler ────────────────────────────────────
            form.querySelector('#sn-sched-save').onclick = () => {
                const id = parseInt(document.getElementById('sn-sched-id').value);
                const title = document.getElementById('sn-sched-title').value.trim();
                const newDate = document.getElementById('sn-sched-date').value;
                const newTime = document.getElementById('sn-sched-time').value;
                const note = document.getElementById('sn-sched-note').value.trim();
                const matterClientId = document.getElementById('sn-sched-matter-id').value.trim() || undefined;
                const matterClientName = matterClientId ? document.getElementById('sn-sched-matter-name').value.trim() : undefined;
                const matterTZ = document.getElementById('sn-sched-tz').value || undefined;
                if (!title) { document.getElementById('sn-sched-title').style.borderColor = '#e53935'; return; }
                if (!newDate) { document.getElementById('sn-sched-date').style.borderColor = '#e53935'; return; }

                let reminders = this._loadReminders();
                if (id) { // Update mode
                    const index = reminders.findIndex(r => r.id === id);
                    if (index > -1) {
                        reminders[index] = { ...reminders[index], date: newDate, title, time: newTime, note, matterClientId, matterClientName, matterTZ };
                    }
                } else { // Add mode
                    const newId = reminders.length > 0 ? Math.max(...reminders.map(r => r.id)) + 1 : 1;
                    reminders.push({ id: newId, date: newDate, time: newTime, title, note, matterClientId, matterClientName, matterTZ });
                }
                this._saveReminders(reminders);
                this._renderCalendar(); // Update dots
                this._renderUpcomingList();

                // Go back to the list view for that day
                goBackToList();
                this._scrollToDate(newDate);
            };
        },

        // ── Notification Checker ────────────────────────────────
        _startChecker() {
            this._checkDue();
            this._checkTimer = setInterval(() => this._checkDue(), CHECK_INTERVAL);
        },

        _checkDue() {
            const now = new Date();
            const todayKey = this._dateKey(now.getFullYear(), now.getMonth(), now.getDate());
            const nowMinutes = now.getHours() * 60 + now.getMinutes();
            const reminders = this._loadReminders();
            let saveNeeded = false;

            // Auto-clear at 4:45 PM
            const autoClearTime = 16 * 60 + 45;

            reminders.forEach(r => {
                if (r.date !== todayKey) return;

                // Auto-clear logic: Clear itself on due date's 4:45pm
                if (!r.status && nowMinutes >= autoClearTime) {
                    r.status = 'cleared';
                    saveNeeded = true;
                    // Remove any visible notification if it exists
                    const existingId = 'sn-sched-notif-' + r.id;
                    const existing = document.getElementById(existingId);
                    if (existing) existing.remove();
                    return;
                }

                // Only process reminders that are pending or snooze
                if (r.status && r.status !== 'snoozed') return;

                // Parse time
                if (!r.time) return;
                const [h, m] = r.time.split(':').map(Number);
                const reminderMinutes = h * 60 + m;

                // Check snoozed
                if (r.status === 'snoozed' && r.snoozedUntil) {
                    const snoozeTime = new Date(r.snoozedUntil);
                    if (now < snoozeTime) return;
                }

                if (nowMinutes >= reminderMinutes) {
                    // --- NEW SYNC LOGIC ---
                    // Use a distributed lock to ensure only one tab shows the notification.
                    const lockKey = 'sn_notif_lock_' + r.id;
                    const lockTime = GM_getValue(lockKey, 0);

                    // If a lock exists and is less than twice the check interval (e.g., 60s),
                    // assume another tab is handling it or has recently handled it.
                    if ((now.getTime() - lockTime) < (CHECK_INTERVAL * 2)) {
                        return;
                    }
                    // Acquire the lock for this tab.
                    GM_setValue(lockKey, now.getTime());
                    // --- END SYNC LOGIC ---

                    this._showNotification(r);
                    // Mark as notified so it doesn't fire again unless snoozed
                    r.status = 'notified';
                    saveNeeded = true;
                }
            });

            if (saveNeeded) {
                this._saveReminders(reminders);
                this._renderUpcomingList(); // Update the upcoming list for any status changes
                if (this._isOpen) this._renderCalendar(); // Update calendar dots if needed
            }
        },

        _showNotification(reminder) {
            // Remove any existing notification for this reminder
            const existingId = 'sn-sched-notif-' + reminder.id;
            const existing = document.getElementById(existingId);
            if (existing) existing.remove();

            const notif = document.createElement('div');
            notif.id = existingId;
            notif.className = 'sn-sched-notif';
            notif.style.width = '450px';

            // Updated layout with side buttons and larger snooze buttons
            notif.innerHTML = `
                <div style="display:flex; flex-direction:row; height:100%; min-height:100px;">
                    <div class="sn-sched-notif-wrapper" style="flex-grow:1; display:flex; flex-direction:column; padding:10px;">
                        <div class="sn-sched-notif-header" style="display:flex; justify-content:space-between; margin-bottom:5px;">
                            <span style="font-weight:bold; color:#333;">🔔 Reminder</span>
                        </div>
                        <div class="sn-sched-notif-body" style="flex-grow:1;">
                            <div class="sn-sched-notif-title" style="font-weight:bold; font-size:1.1em; margin-bottom:2px;">${this._escHtml(reminder.title)}</div>
                            <div class="sn-sched-notif-time" style="color:#666; font-size:0.9em;">${reminder.time || ''}</div>
                            ${reminder.note ? `<div class="sn-sched-notif-note" style="margin-top:5px; font-size:0.9em; color:#444;">${this._escHtml(reminder.note)}</div>` : ''}
                        </div>
                        <div class="sn-sched-notif-actions" style="margin-top:10px; display:flex; align-items:center; gap:5px;">
                            <span style="font-size:11px; color:#666;">Snooze:</span>
                            <button class="sn-sched-snooze" data-min="5" style="padding:6px 10px; cursor:pointer; font-size:12px;">5m</button>
                            <button class="sn-sched-snooze" data-min="15" style="padding:6px 10px; cursor:pointer; font-size:12px;">15m</button>
                            <button class="sn-sched-snooze" data-min="30" style="padding:6px 10px; cursor:pointer; font-size:12px;">30m</button>
                            <button class="sn-sched-snooze" data-min="60" style="padding:6px 10px; cursor:pointer; font-size:12px;">1h</button>
                        </div>
                    </div>
                    <div style="display:flex; flex-direction:column; width:50px; border-left:1px solid #eee;">
                        <button class="sn-sched-btn-check" title="Complete" style="flex:1; border:none; background:#e8f5e9; color:#2e7d32; cursor:pointer; font-size:20px; display:flex; align-items:center; justify-content:center; transition:background 0.2s;">✓</button>
                        <button class="sn-sched-btn-close" title="Dismiss" style="flex:1; border:none; background:#ffebee; color:#c62828; cursor:pointer; font-size:20px; display:flex; align-items:center; justify-content:center; transition:background 0.2s;">✕</button>
                    </div>
                </div>
            `;

            document.body.appendChild(notif);

            // Trigger slide-in animation
            requestAnimationFrame(() => notif.classList.add('show'));




            const closeAndSetStatus = (status) => {
                const reminders = this._loadReminders();
                const r = reminders.find(x => x.id === reminder.id);
                if (r) {
                    r.status = status;
                    this._saveReminders(reminders);
                }
                notif.classList.remove('show');
                setTimeout(() => notif.remove(), 300);
                this._renderCalendar(); // To update any views
                this._renderUpcomingList(); // To update the new list
            };

            // Right side buttons
            const checkBtn = notif.querySelector('.sn-sched-btn-check');
            const xBtn = notif.querySelector('.sn-sched-btn-close');

            checkBtn.onmouseover = () => checkBtn.style.background = '#c8e6c9';
            checkBtn.onmouseout = () => checkBtn.style.background = '#e8f5e9';
            checkBtn.onclick = () => closeAndSetStatus('completed');

            xBtn.onmouseover = () => xBtn.style.background = '#ffcdd2';
            xBtn.onmouseout = () => xBtn.style.background = '#ffebee';
            xBtn.onclick = () => closeAndSetStatus('cleared');

            // Snooze buttons
            notif.querySelectorAll('.sn-sched-snooze').forEach(btn => {
                btn.onclick = () => {
                    const minutes = parseInt(btn.dataset.min);
                    const reminders = this._loadReminders();
                    const r = reminders.find(x => x.id === reminder.id);
                    if (r) {
                        const snoozeUntil = new Date(Date.now() + minutes * 60000);
                        r.snoozedUntil = snoozeUntil.toISOString();
                        r.status = 'snoozed';
                        this._saveReminders(reminders);
                    }
                    notif.classList.remove('show');
                    setTimeout(() => notif.remove(), 300);
                };
            });
        }
    };

    app.Tools.Scheduler = Scheduler;
})();
