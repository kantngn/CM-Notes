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
            return GM_getValue(STORAGE_KEY, []);
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

            // Start checking for due reminders
            this._startChecker();
        },

        /**
         * Toggles the visibility of the Scheduler UI panel.
         * Instantiates the DOM elements and triggers calendar/list renders on first open.
         */
        toggle() {
            if (!this._panel) this._buildPanel();
            this._isOpen = !this._isOpen;
            this._panel.classList.toggle('open', this._isOpen);
            const btn = document.getElementById('sn-sidebar-sched');
            if (btn) btn.classList.toggle('active', this._isOpen);
            if (this._isOpen) {
                this._renderCalendar();
                this._renderUpcomingList();
                // Reset form visibility so it doesn't show stale state
                const form = document.getElementById('sn-sched-form');
                if (form) form.style.display = 'none';
                const list = document.getElementById('sn-sched-upcoming-list');
                if (list) list.style.display = 'block';
            }
            if (this._isOpen && this._panel) this._panel.focus();
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
                    <div>
                        <button id="sn-sched-clear-resolved" title="Clear Resolved" style="background:none; border:1px solid white; color:white; font-size:11px; cursor:pointer; border-radius:3px; opacity:0.7; margin-right:8px;">Clear ✓</button>
                        <button id="sn-sched-test-notif" title="Test Notification" style="background:none; border:1px solid white; color:white; font-size:11px; cursor:pointer; border-radius:3px; opacity:0.7; margin-right:8px;">Test 🔔</button>
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
                    width: ${GM_getValue('sn_sched_details_width', '300px')};
                    min-width: 250px;
                    display: flex; flex-direction: column; position: relative;
                    background: #fcfcfc; flex-shrink: 0;
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
                .sn-sched-flash { animation: sn-sched-flash-anim 1.5s ease-out; }
                @keyframes sn-sched-flash-anim { 0% { background-color: #fff9c4; } 100% { background-color: transparent; } }
                .sn-sched-day { position: relative; }
                .sn-sched-dots { position: absolute; bottom: 2px; left: 0; right: 0; display: flex; justify-content: center; gap: 3px; pointer-events: none; }
                .sn-sched-dot { width: 5px; height: 5px; border-radius: 50%; }
                .sn-sched-dot.reminder { background-color: var(--sn-primary); }
                .sn-sched-dot.revisit { background-color: #d32f2f; }
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

            // Auto-close on focus loss
            panel.addEventListener('focusout', (e) => {
                // If the new focus target is still inside the panel, or if there is no
                // new target (e.g., an element was hidden), don't close the panel.
                if (!e.relatedTarget || panel.contains(e.relatedTarget)) {
                    return;
                }

                // Otherwise, focus has moved outside the panel.
                if (this._isOpen) this.toggle();
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
                    const dayReminders = this._loadReminders().filter(r => r.date === key);
                    if (dayReminders.length > 0) {
                        // Show list and scroll to date
                        const form = document.getElementById('sn-sched-form');
                        const list = document.getElementById('sn-sched-upcoming-list');
                        if (form) form.style.display = 'none';
                        if (list) list.style.display = 'block';
                        this._scrollToDate(key);
                    } else {
                        this._showForm(key, d, null); // Go straight to add form
                    }
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

                        html += `
                            <div class="sn-sched-upcoming-item ${statusClass}" data-id="${r.id}">
                                <div class="actions">
                                    <button class="btn-complete" title="Complete">✓</button>
                                    <button class="btn-dismiss" title="Dismiss">✕</button>
                                </div>
                                <div class="time">${r.time || ''}</div>
                                <div class="title" title="${this._escHtml(r.note || '')}">${this._escHtml(r.title)}</div>
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
                const btn = e.target.closest('button');
                if (!btn) return;
                const item = btn.closest('.sn-sched-upcoming-item');
                if (!item) return;
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
                    if (confirm('Delete this reminder?')) {
                        const reminders = this._loadReminders().filter(r => r.id !== id);
                        this._saveReminders(reminders);
                        this._renderCalendar();
                        this._renderUpcomingList();
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
                html += `<div class="sn-sched-tip-item">
                    <b>${r.time || ''}</b> ${this._escHtml(r.title)}
                    ${r.note ? `<div style="font-size:10px;color:#666;">${this._escHtml(r.note)}</div>` : ''}
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

        _escHtml(str) {
            const d = document.createElement('div');
            d.textContent = str || '';
            return d.innerHTML;
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

            form.style.display = 'block';
            form.innerHTML = `
                <div class="sn-sched-form-header">
                    <b>${isEditing ? 'Edit Reminder' : 'Create Reminder'}</b>
                    <span class="sn-sched-form-close" title="Close">&times;</span>
                </div>
                <div class="sn-sched-form-fields">
                    <input type="hidden" id="sn-sched-id" value="${isEditing ? reminderToEdit.id : ''}">
                    <input id="sn-sched-title" placeholder="Title" class="sn-sched-input" value="${isEditing ? this._escHtml(reminderToEdit.title) : ''}" />
                    <div style="display:flex; gap:5px;">
                        <input id="sn-sched-date" type="date" class="sn-sched-input" style="flex:1;" value="${isEditing ? reminderToEdit.date : dateKey}" />
                        <input id="sn-sched-time" type="time" class="sn-sched-input" style="flex:1;" value="${isEditing ? (reminderToEdit.time || '09:00') : '09:00'}" />
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

            form.querySelector('#sn-sched-save').onclick = () => {
                const id = parseInt(document.getElementById('sn-sched-id').value);
                const title = document.getElementById('sn-sched-title').value.trim();
                const newDate = document.getElementById('sn-sched-date').value;
                const newTime = document.getElementById('sn-sched-time').value;
                const note = document.getElementById('sn-sched-note').value.trim();
                if (!title) { document.getElementById('sn-sched-title').style.borderColor = '#e53935'; return; }
                if (!newDate) { document.getElementById('sn-sched-date').style.borderColor = '#e53935'; return; }

                let reminders = this._loadReminders();
                if (id) { // Update mode
                    const index = reminders.findIndex(r => r.id === id);
                    if (index > -1) {
                        reminders[index] = { ...reminders[index], date: newDate, title, time: newTime, note };
                    }
                } else { // Add mode
                    const newId = reminders.length > 0 ? Math.max(...reminders.map(r => r.id)) + 1 : 1;
                    reminders.push({ id: newId, date: newDate, time: newTime, title: title, note: note });
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
