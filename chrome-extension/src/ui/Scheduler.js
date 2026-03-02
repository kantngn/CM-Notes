/**
 * Scheduler – Calendar panel with reminders and notifications.
 * Accessible from the left sidebar. Data stored via GM_setValue('sn_reminders', ...).
 */
(function () {
    const app = window.CM_App = window.CM_App || {};
    app.Tools = app.Tools || {};

    const STORAGE_KEY = 'sn_reminders';
    const CHECK_INTERVAL = 30000; // Check every 30 seconds

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
        init() {
            const now = new Date();
            this._viewYear = now.getFullYear();
            this._viewMonth = now.getMonth();

            // Start checking for due reminders
            this._startChecker();
        },

        toggle() {
            if (!this._panel) this._buildPanel();
            this._isOpen = !this._isOpen;
            this._panel.classList.toggle('open', this._isOpen);
            const btn = document.getElementById('sn-sidebar-sched');
            if (btn) btn.classList.toggle('active', this._isOpen);
            if (this._isOpen) this._renderCalendar();
        },

        // ── Panel ───────────────────────────────────────────────
        _buildPanel() {
            const panel = document.createElement('div');
            panel.id = 'sn-sched-panel';
            panel.className = 'sn-sched-panel';

            panel.innerHTML = `
                <div class="sn-gnotes-header">
                    <span style="font-weight:bold; font-size:13px;">📅 Scheduler</span>
                    <span class="sn-gnotes-close" title="Close">&times;</span>
                </div>
                <div class="sn-sched-nav">
                    <button class="sn-sched-nav-btn" id="sn-sched-prev">◀</button>
                    <span class="sn-sched-month-label" id="sn-sched-month-label"></span>
                    <button class="sn-sched-nav-btn" id="sn-sched-next">▶</button>
                </div>
                <div class="sn-sched-grid" id="sn-sched-grid"></div>
                <div class="sn-sched-form" id="sn-sched-form" style="display:none"></div>
            `;

            document.body.appendChild(panel);
            this._panel = panel;

            panel.querySelector('.sn-gnotes-close').onclick = () => this.toggle();
            document.getElementById('sn-sched-prev').onclick = () => { this._changeMonth(-1); };
            document.getElementById('sn-sched-next').onclick = () => { this._changeMonth(1); };

            panel.addEventListener('mousedown', e => e.stopPropagation());
        },

        _changeMonth(delta) {
            this._viewMonth += delta;
            if (this._viewMonth < 0) { this._viewMonth = 11; this._viewYear--; }
            if (this._viewMonth > 11) { this._viewMonth = 0; this._viewYear++; }
            this._renderCalendar();
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
                if (dayReminders.length > 0) {
                    cell.classList.add('has-reminder');
                }

                cell.textContent = d;
                cell.onclick = () => this._showForm(key, d);

                // Hover tooltip for reminders
                if (dayReminders.length > 0) {
                    cell.onmouseenter = (e) => this._showTooltip(e, dayReminders);
                    cell.onmouseleave = () => this._hideTooltip();
                }

                grid.appendChild(cell);
            }
        },

        // ── Tooltip ─────────────────────────────────────────────
        _showTooltip(e, reminders) {
            this._hideTooltip();
            const tip = document.createElement('div');
            tip.className = 'sn-sched-tooltip';
            let html = '';
            reminders.forEach(r => {
                html += `<div class="sn-sched-tip-item">
                    <b>${r.time || ''}</b> ${this._escHtml(r.title)}
                    ${r.note ? `<div style="font-size:10px;color:#666;">${this._escHtml(r.note)}</div>` : ''}
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
        _showForm(dateKey, dayNum) {
            const form = document.getElementById('sn-sched-form');
            if (!form) return;

            const existing = this._loadReminders().filter(r => r.date === dateKey);

            form.style.display = 'block';
            form.innerHTML = `
                <div class="sn-sched-form-header">
                    <b>📅 ${dateKey}</b>
                    <span class="sn-sched-form-close" title="Close">&times;</span>
                </div>
                ${existing.length > 0 ? `<div class="sn-sched-existing">${existing.map(r => `
                    <div class="sn-sched-existing-item">
                        <span><b>${r.time || ''}</b> ${this._escHtml(r.title)}</span>
                        <span class="sn-sched-del-btn" data-id="${r.id}" title="Delete">🗑️</span>
                    </div>
                `).join('')}</div>` : ''}
                <div class="sn-sched-form-fields">
                    <input id="sn-sched-title" placeholder="Title" class="sn-sched-input" />
                    <input id="sn-sched-time" type="time" class="sn-sched-input" />
                    <textarea id="sn-sched-note" placeholder="Note (optional)" class="sn-sched-input" rows="2"></textarea>
                    <button id="sn-sched-save" class="sn-sched-save-btn">Save Reminder</button>
                </div>
            `;

            form.querySelector('.sn-sched-form-close').onclick = () => { form.style.display = 'none'; };

            // Delete buttons
            form.querySelectorAll('.sn-sched-del-btn').forEach(btn => {
                btn.onclick = () => {
                    const id = parseInt(btn.dataset.id);
                    let reminders = this._loadReminders();
                    reminders = reminders.filter(r => r.id !== id);
                    this._saveReminders(reminders);
                    this._showForm(dateKey, dayNum);
                    this._renderCalendar();
                };
            });

            document.getElementById('sn-sched-save').onclick = () => {
                const title = document.getElementById('sn-sched-title').value.trim();
                const time = document.getElementById('sn-sched-time').value;
                const note = document.getElementById('sn-sched-note').value.trim();
                if (!title) { document.getElementById('sn-sched-title').style.borderColor = '#e53935'; return; }

                const reminders = this._loadReminders();
                const newId = reminders.length > 0 ? Math.max(...reminders.map(r => r.id)) + 1 : 1;
                reminders.push({ id: newId, date: dateKey, time: time, title: title, note: note });
                this._saveReminders(reminders);
                this._showForm(dateKey, dayNum);
                this._renderCalendar();
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

            reminders.forEach(r => {
                if (r.date !== todayKey) return;
                if (r.dismissed) return;

                // Parse time
                if (!r.time) return;
                const [h, m] = r.time.split(':').map(Number);
                const reminderMinutes = h * 60 + m;

                // Check snoozed
                if (r.snoozedUntil) {
                    const snoozeTime = new Date(r.snoozedUntil);
                    if (now < snoozeTime) return;
                }

                if (nowMinutes >= reminderMinutes) {
                    this._showNotification(r);
                    // Mark as dismissed so it doesn't fire again
                    r.dismissed = true;
                    this._saveReminders(reminders);
                }
            });
        },

        _showNotification(reminder) {
            // Remove any existing notification for this reminder
            const existingId = 'sn-sched-notif-' + reminder.id;
            const existing = document.getElementById(existingId);
            if (existing) existing.remove();

            const notif = document.createElement('div');
            notif.id = existingId;
            notif.className = 'sn-sched-notif';

            notif.innerHTML = `
                <div class="sn-sched-notif-header">
                    <span>🔔 Reminder</span>
                    <span class="sn-sched-notif-close" title="Dismiss">&times;</span>
                </div>
                <div class="sn-sched-notif-body">
                    <div class="sn-sched-notif-title">${this._escHtml(reminder.title)}</div>
                    <div class="sn-sched-notif-time">${reminder.time || ''}</div>
                    ${reminder.note ? `<div class="sn-sched-notif-note">${this._escHtml(reminder.note)}</div>` : ''}
                </div>
                <div class="sn-sched-notif-actions">
                    <span style="font-size:11px; color:#666;">Snooze:</span>
                    <button class="sn-sched-snooze" data-min="5">5m</button>
                    <button class="sn-sched-snooze" data-min="15">15m</button>
                    <button class="sn-sched-snooze" data-min="30">30m</button>
                    <button class="sn-sched-snooze" data-min="60">1h</button>
                </div>
            `;

            document.body.appendChild(notif);

            // Trigger slide-in animation
            requestAnimationFrame(() => notif.classList.add('show'));

            // Dismiss
            notif.querySelector('.sn-sched-notif-close').onclick = () => {
                notif.classList.remove('show');
                setTimeout(() => notif.remove(), 300);
            };

            // Snooze buttons
            notif.querySelectorAll('.sn-sched-snooze').forEach(btn => {
                btn.onclick = () => {
                    const minutes = parseInt(btn.dataset.min);
                    const reminders = this._loadReminders();
                    const r = reminders.find(x => x.id === reminder.id);
                    if (r) {
                        const snoozeUntil = new Date(Date.now() + minutes * 60000);
                        r.snoozedUntil = snoozeUntil.toISOString();
                        r.dismissed = false; // Allow it to fire again
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
