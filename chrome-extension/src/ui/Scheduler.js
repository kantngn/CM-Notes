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

            // Clear 'dismissed' and 'snoozed' state on startup
            const reminders = this._loadReminders();
            let wasModified = false;
            reminders.forEach(r => {
                if (r.dismissed) {
                    delete r.dismissed;
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

        toggle() {
            if (!this._panel) this._buildPanel();
            this._isOpen = !this._isOpen;
            this._panel.classList.toggle('open', this._isOpen);
            const btn = document.getElementById('sn-sidebar-sched');
            if (btn) btn.classList.toggle('active', this._isOpen);
            if (this._isOpen) {
                this._renderCalendar();
                // Reset form visibility so it doesn't show stale state
                const form = document.getElementById('sn-sched-form');
                if (form) form.style.display = 'none';
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
                        <button id="sn-sched-test-notif" title="Test Notification" style="background:none; border:1px solid white; color:white; font-size:11px; cursor:pointer; border-radius:3px; opacity:0.7; margin-right:8px;">Test 🔔</button>
                        <span class="sn-gnotes-close" title="Close">&times;</span>
                    </div>
                </div>
                <div class="sn-sched-nav">
                    <button class="sn-sched-nav-btn" id="sn-sched-prev">◀</button>
                    <span class="sn-sched-month-label" id="sn-sched-month-label"></span>
                    <button class="sn-sched-nav-btn" id="sn-sched-next">▶</button>
                </div>
                <div class="sn-sched-grid" id="sn-sched-grid"></div>
                <div class="sn-sched-form" id="sn-sched-form" style="display:none"></div>
            `;

            // Inject styles for dots
            const style = document.createElement('style');
            style.innerHTML = `
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
                // If the new focus target is still inside the panel, don't close
                if (panel.contains(e.relatedTarget)) return;
                if (this._isOpen) this.toggle();
            });
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
                        this._showReminderList(key, d, dayReminders);
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
        _showReminderList(dateKey, dayNum, reminders) {
            const form = document.getElementById('sn-sched-form');
            if (!form) return;

            // Prevent auto-close by moving focus to panel before destroying button elements
            if (this._panel) this._panel.focus();

            form.style.display = 'block';
            form.innerHTML = `
                <div class="sn-sched-form-header">
                    <b>Reminders for 📅 ${dateKey}</b>
                    <span class="sn-sched-form-close" title="Close">&times;</span>
                </div>
                <div class="sn-sched-existing">
                    ${reminders.map(r => `
                        <div class="sn-sched-existing-item">
                            <span><b>${r.time || ''}</b> ${this._escHtml(r.title)}</span>
                            <div style="display: flex; gap: 8px; align-items: center;">
                                <span class="sn-sched-edit-btn" data-id="${r.id}" title="Edit" style="cursor:pointer; opacity:0.6; font-size:16px;">✏️</span>
                                <span class="sn-sched-del-btn" data-id="${r.id}" title="Delete">🗑️</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
                <div class="sn-sched-form-fields" style="padding: 10px;">
                     <button id="sn-sched-add-new" class="sn-sched-save-btn">Add New Reminder</button>
                </div>
            `;

            form.querySelector('.sn-sched-form-close').onclick = () => { form.style.display = 'none'; };
            form.querySelector('#sn-sched-add-new').onclick = () => this._showForm(dateKey, dayNum, null);

            // Edit buttons
            form.querySelectorAll('.sn-sched-edit-btn').forEach(btn => {
                btn.onmouseover = () => btn.style.opacity = '1';
                btn.onmouseout = () => btn.style.opacity = '0.6';
                btn.onclick = () => {
                    this._showForm(dateKey, dayNum, parseInt(btn.dataset.id));
                };
            });

            // Delete buttons
            form.querySelectorAll('.sn-sched-del-btn').forEach(btn => {
                btn.onclick = () => {
                    if (!confirm('Are you sure you want to delete this reminder?')) return;
                    const id = parseInt(btn.dataset.id);
                    const updatedReminders = this._loadReminders().filter(r => r.id !== id);
                    this._saveReminders(updatedReminders);
                    this._renderCalendar(); // Update dots
                    // Re-render the list
                    const dayReminders = updatedReminders.filter(r => r.date === dateKey);
                    if (dayReminders.length > 0) {
                        this._showReminderList(dateKey, dayNum, dayReminders);
                    } else {
                        form.style.display = 'none';
                    }
                };
            });
        },

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
                    <b>${isEditing ? 'Edit Reminder' : 'Add Reminder'} for 📅 ${dateKey}</b>
                    <span class="sn-sched-form-close" title="Close">&times;</span>
                </div>
                <div class="sn-sched-form-fields">
                    <input type="hidden" id="sn-sched-id" value="${isEditing ? reminderToEdit.id : ''}">
                    <input id="sn-sched-title" placeholder="Title" class="sn-sched-input" value="${isEditing ? this._escHtml(reminderToEdit.title) : ''}" />
                    <input id="sn-sched-time" type="time" class="sn-sched-input" value="${isEditing ? reminderToEdit.time : ''}" />
                    <textarea id="sn-sched-note" placeholder="Note (optional)" class="sn-sched-input" rows="3">${isEditing ? this._escHtml(reminderToEdit.note || '') : ''}</textarea>
                    <div style="display:flex; gap: 8px; margin-top: 5px;">
                        <button id="sn-sched-back-btn" class="sn-sched-save-btn" style="background-color: #757575;">Back to List</button>
                        <button id="sn-sched-save" class="sn-sched-save-btn" style="flex-grow: 1;">${isEditing ? 'Update Reminder' : 'Save Reminder'}</button>
                    </div>
                </div>
            `;

            form.querySelector('.sn-sched-form-close').onclick = () => { form.style.display = 'none'; };

            const goBackToList = () => {
                const dayReminders = this._loadReminders().filter(r => r.date === dateKey);
                this._showReminderList(dateKey, dayNum, dayReminders);
            };
            form.querySelector('#sn-sched-back-btn').onclick = goBackToList;

            form.querySelector('#sn-sched-save').onclick = () => {
                const id = parseInt(document.getElementById('sn-sched-id').value);
                const title = document.getElementById('sn-sched-title').value.trim();
                const time = document.getElementById('sn-sched-time').value;
                const note = document.getElementById('sn-sched-note').value.trim();
                if (!title) { document.getElementById('sn-sched-title').style.borderColor = '#e53935'; return; }

                let reminders = this._loadReminders();
                if (id) { // Update mode
                    const index = reminders.findIndex(r => r.id === id);
                    if (index > -1) {
                        reminders[index] = { ...reminders[index], title, time, note };
                    }
                } else { // Add mode
                    const newId = reminders.length > 0 ? Math.max(...reminders.map(r => r.id)) + 1 : 1;
                    reminders.push({ id: newId, date: dateKey, time: time, title: title, note: note });
                }
                this._saveReminders(reminders);
                this._renderCalendar(); // Update dots

                // Go back to the list view for that day
                goBackToList();
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
                <div class="sn-sched-notif-wrapper">
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
