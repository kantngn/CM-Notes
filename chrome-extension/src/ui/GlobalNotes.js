/**
 * GlobalNotes – A persistent, slide-out notes panel on the left edge.
 * Supports multiple tabs with rich-text formatting.
 * Data is saved globally via GM_setValue('sn_global_notes', ...).
 */
(function () {
    const app = window.CM_App = window.CM_App || {};
    app.Tools = app.Tools || {};

    const STORAGE_KEY = 'sn_global_notes';

    const DEFAULT_INSTRUCTIONS = `<h3 style="margin-top:0">📋 KD CM Notes – Quick Reference</h3>
<p><b>Keyboard Shortcuts (Hold Alt):</b></p>
<ul>
<li><b>\`</b> – Toggle Global Notes</li>
<li><b>1</b> – Toggle Client Note</li>
<li><b>2</b> – Toggle Medical Provider Popout</li>
<li><b>3</b> – Toggle Medications Panel</li>
<li><b>4</b> – Toggle Fax Forms Panel</li>
<li><b>5</b> – Toggle IR Tool Panel</li>
<li><b>Q</b> – Toggle Info Panel (in Client Note)</li>
<li><b>W</b> – Toggle SSA Panel (in Client Note)</li>
<li><b>E</b> or <b>F</b> – Fetch SSD Data (in Client Note)</li>
<li><b>A</b> – Run Mail Resolver</li>
<li><b>S</b> – Toggle SSD Form Viewer (on form pages)</li>
<li><b>L</b> – Toggle Scheduler</li>
<li><b>T</b> – Toggle Dashboard</li>
<li><b>H</b> – Show this Help Panel</li>
</ul>
<p><b>Window Controls:</b></p>
<ul>
<li><b>Double-click header</b> – Minimize window</li>
<li><b>Drag edges</b> – Resize any window</li>
</ul>
<p><b>Client Note:</b></p>
<ul>
<li>Auto-loads when visiting a known client record</li>
<li>Notes auto-save on every change</li>
<li>Use the color picker 🎨 to tag notes</li>
<li>Pin 📌 to keep the window open across navigation</li>
</ul>
<p><b>Global Notes:</b></p>
<ul>
<li><b>Ctrl+B</b> – Bold</li>
<li><b>Ctrl+I</b> – Italic</li>
<li><b>Ctrl+U</b> – Underline</li>
<li>Select text to see the inline formatting toolbar</li>
<li>Double-click a tab name to rename it</li>
<li>Click <b>+</b> to add new tabs</li>
<li>Click <b>×</b> on a tab to remove it</li>
</ul>`;

    /**
     * Manages a persistent, slide-out notes panel on the left edge of the screen.
     * Supports multiple tabs with rich-text formatting and automatically saves data globally.
     * Constructs quick-access sidebar buttons for features like FO, DDS, and Scheduler.
     * Interacts with ContactForms and Scheduler.
     * @namespace app.Tools.GlobalNotes
     */
    const GlobalNotes = {
        _panel: null,
        _isOpen: false,
        _activeTabId: 1,
        _saveTimer: null,
        _inlineToolbar: null,

        // ── Data helpers ────────────────────────────────────────
        _loadData() {
            const raw = GM_getValue(STORAGE_KEY, null);
            if (raw && Array.isArray(raw.tabs)) return raw;
            return {
                activeTab: 0,
                tabs: [
                    { id: 0, title: 'Instructions', content: DEFAULT_INSTRUCTIONS, color: '#009688', special: true },
                    { id: 1, title: 'Scratch', content: '', color: '#1976d2' }
                ],
                nextId: 2
            };
        },

        _saveData(data) {
            GM_setValue(STORAGE_KEY, data);
        },

        _debouncedSave(data) {
            clearTimeout(this._saveTimer);
            this._saveTimer = setTimeout(() => this._saveData(data), 400);
        },

        // ── Initialization ──────────────────────────────────────
        /**
         * Initializes Global Notes by building the universal left-edge sidebar buttons.
         */
        init() {
            if (document.getElementById('sn-gnotes-tab')) return;
            this._buildSidebarButtons();
        },

        _buildSidebarButtons() {
            // Create a container for all sidebar buttons
            const container = document.createElement('div');
            container.id = 'sn-sidebar-group';
            container.className = 'sn-sidebar-group';

            // Global Notes button
            const gnBtn = document.createElement('div');
            gnBtn.id = 'sn-gnotes-tab';
            gnBtn.className = 'sn-sidebar-btn sn-sidebar-gnotes';
            gnBtn.innerHTML = '🌐';
            gnBtn.title = 'Global Notes';
            gnBtn.onclick = () => this.toggle();
            container.appendChild(gnBtn);

            // FO button
            const fo = document.createElement('div');
            fo.id = 'sn-sidebar-fo';
            fo.className = 'sn-sidebar-btn sn-sidebar-fo';
            fo.innerHTML = '<span>FO</span>';
            fo.title = 'FO Contact Form';
            fo.onclick = () => app.Tools.ContactForms.create('FO');
            container.appendChild(fo);

            // DDS button
            const dds = document.createElement('div');
            dds.id = 'sn-sidebar-dds';
            dds.className = 'sn-sidebar-btn sn-sidebar-dds';
            dds.innerHTML = '<span>DDS</span>';
            dds.title = 'DDS Contact Form';
            dds.onclick = () => app.Tools.ContactForms.create('DDS');
            container.appendChild(dds);

            // Scheduler button
            const schedBtn = document.createElement('div');
            schedBtn.id = 'sn-sidebar-sched';
            schedBtn.className = 'sn-sidebar-btn sn-sidebar-sched';
            schedBtn.innerHTML = '📅';
            schedBtn.title = 'Scheduler';
            schedBtn.onclick = () => { if (window.CM_App.Tools.Scheduler) window.CM_App.Tools.Scheduler.toggle(); };
            container.appendChild(schedBtn);

            document.body.appendChild(container);
        },

        /**
         * Toggles the visibility of the Global Notes panel.
         * Instantiates the panel DOM if it hasn't been built yet.
         */
        toggle() {
            if (!this._panel) this._buildPanel();
            this._isOpen = !this._isOpen;
            this._panel.classList.toggle('open', this._isOpen);
            const tab = document.getElementById('sn-gnotes-tab');
            if (tab) tab.classList.toggle('active', this._isOpen);

            // If opening, focus the editor so we can catch blur
            if (this._isOpen) {
                const editor = document.getElementById('sn-gnotes-editor');
                if (editor) editor.focus();
            }
        },

        /**
         * Opens the Global Notes panel and forcibly switches to the "Instructions" tab.
         */
        showInstructions() {
            if (!this._isOpen) {
                this.toggle();
            }
            this._switchTab(0);
        },

        // ── Panel construction ──────────────────────────────────
        _buildPanel() {
            const panel = document.createElement('div');
            panel.id = 'sn-gnotes-panel';
            panel.className = 'sn-gnotes-panel';
            panel.tabIndex = -1; // Make focusable for blur events

            // Load pin state
            const isPinned = GM_getValue('sn_gnotes_pinned', false);

            const defaultH = Math.round(window.innerHeight * 0.6);
            panel.style.height = defaultH + 'px';
            panel.style.width = '360px';
            panel.style.bottom = '40px';
            panel.style.top = 'auto';

            panel.innerHTML = `
                <div class="sn-gnotes-header">
                    <span style="font-weight:bold; font-size:13px;">🌐 Global Notes</span>
                    <div>
                        <span class="sn-gnotes-pin ${isPinned ? 'active' : ''}" id="sn-gnotes-pin" title="Pin Open" style="cursor:pointer; font-size:14px; margin-right:8px; opacity:${isPinned ? '1' : '0.5'};">📌</span>
                        <span class="sn-gnotes-close" title="Close">&times;</span>
                    </div>
                </div>
                <div class="sn-gnotes-nav" id="sn-gnotes-nav"></div>
                <div class="sn-gnotes-editor" id="sn-gnotes-editor" contenteditable="true"></div>
                <div class="sn-gnotes-resizer sn-gnotes-rs-e"></div>
                <div class="sn-gnotes-resizer sn-gnotes-rs-n"></div>
                <div class="sn-gnotes-resizer sn-gnotes-rs-ne"></div>
            `;

            document.body.appendChild(panel);
            this._panel = panel;

            // Pin toggle
            const pinBtn = document.getElementById('sn-gnotes-pin');
            pinBtn.onclick = (e) => {
                e.stopPropagation();
                const currentlyPinned = GM_getValue('sn_gnotes_pinned', false);
                GM_setValue('sn_gnotes_pinned', !currentlyPinned);
                pinBtn.style.opacity = !currentlyPinned ? '1' : '0.5';
                if (!currentlyPinned) {
                    pinBtn.classList.add('active');
                } else {
                    pinBtn.classList.remove('active');
                }
            };

            // Horizontal scroll for tabs
            const nav = document.getElementById('sn-gnotes-nav');
            nav.addEventListener('wheel', (e) => {
                if (e.deltaY !== 0) {
                    e.preventDefault();
                    nav.scrollLeft += e.deltaY;
                }
            });

            // Blur to auto-close
            panel.addEventListener('focusout', (e) => {
                if (GM_getValue('sn_gnotes_pinned', false)) return;

                // If the new focus target is still inside the panel, don't close
                if (panel.contains(e.relatedTarget)) return;

                // Close the panel
                if (this._isOpen) this.toggle();
            });

            panel.querySelector('.sn-gnotes-close').onclick = () => this.toggle();

            // Build inline floating toolbar (hidden by default)
            this._buildInlineToolbar();

            // Render tabs
            this._renderTabs();

            // Editor events
            const editor = document.getElementById('sn-gnotes-editor');
            editor.addEventListener('input', () => {
                const data = this._loadData();
                const tab = data.tabs.find(t => t.id === this._activeTabId);
                if (tab) {
                    tab.content = editor.innerHTML;
                    this._debouncedSave(data);
                }
            });

            // Ctrl+B/I/U shortcuts
            editor.addEventListener('keydown', (e) => {
                if (e.ctrlKey && !e.altKey && !e.shiftKey) {
                    if (e.key === 'b' || e.key === 'B') { e.preventDefault(); document.execCommand('bold', false, null); }
                    else if (e.key === 'i' || e.key === 'I') { e.preventDefault(); document.execCommand('italic', false, null); }
                    else if (e.key === 'u' || e.key === 'U') { e.preventDefault(); document.execCommand('underline', false, null); }
                }
            });

            // Show inline toolbar on text selection (mouseup)
            editor.addEventListener('mouseup', () => {
                setTimeout(() => this._checkSelection(), 10);
            });

            // Also check on keyup for shift+arrow selections
            editor.addEventListener('keyup', (e) => {
                if (e.shiftKey) {
                    setTimeout(() => this._checkSelection(), 10);
                }
            });

            // Listen for selection changes to hide toolbar when deselected
            document.addEventListener('selectionchange', () => {
                const sel = window.getSelection();
                if (!sel || sel.isCollapsed || !editor.contains(sel.anchorNode)) {
                    this._hideInlineToolbar();
                }
            });

            panel.addEventListener('mousedown', e => e.stopPropagation());
            this._setupResizers(panel);
        },

        // ── Inline Floating Toolbar ─────────────────────────────
        _buildInlineToolbar() {
            const bar = document.createElement('div');
            bar.className = 'sn-gnotes-inline-bar';
            bar.id = 'formatToolbar';
            bar.style.display = 'none';

            // Icon-based formatting buttons
            const buttons = [
                { cmd: 'bold', icon: '<b>B</b>', title: 'Bold' },
                { cmd: 'italic', icon: '<i>I</i>', title: 'Italic' },
                { cmd: 'underline', icon: '<u>U</u>', title: 'Underline' },
                { type: 'sep' },
                { cmd: 'insertUnorderedList', icon: '•', title: 'Bullet List' },
                { type: 'sep' },
                {
                    type: 'dropdown', title: 'Text Color', icon: 'A', isColor: true, command: 'foreColor',
                    items: ['#e53935', '#fb8c00', '#43a047', '#1e88e5', '#8e24aa', '#00897b', '#6d4c41', '#333333']
                },
                {
                    type: 'dropdown', title: 'Highlight Color', icon: '✎', isColor: true, command: 'backColor',
                    items: ['#fff9c4', '#ffcdd2', '#e1bee7', '#c8e6c9', '#b2ebf2', '#bbdefb', '#d7ccc8', 'transparent']
                },
                { cmd: 'removeFormat', icon: '⊘', title: 'Clear Formatting' },
            ];

            buttons.forEach(b => {
                if (b.type === 'sep') {
                    const sep = document.createElement('div');
                    sep.className = 'sn-gnotes-inline-sep';
                    bar.appendChild(sep);
                    return;
                }

                if (b.type === 'dropdown') {
                    const container = document.createElement('div');
                    container.className = 'sn-gnotes-dropdown-container';

                    const button = document.createElement('button');
                    button.className = 'sn-gnotes-inline-btn';
                    button.title = b.title;
                    button.innerHTML = b.icon;
                    container.appendChild(button);

                    const menu = document.createElement('div');
                    menu.className = 'sn-gnotes-dropdown-menu';
                    container.appendChild(menu);

                    if (b.isColor) {
                        menu.style.flexDirection = 'row';
                        menu.style.flexWrap = 'wrap';
                        menu.style.width = '124px';
                        b.items.forEach(color => {
                            const swatch = document.createElement('button');
                            swatch.className = 'sn-gnotes-swatch';
                            swatch.style.background = color;
                            if (color === 'transparent') {
                                swatch.innerHTML = '⊘';
                                swatch.style.lineHeight = '20px';
                                swatch.style.textAlign = 'center';
                                swatch.title = 'No Highlight';
                            }
                            swatch.onmousedown = (e) => {
                                e.preventDefault();
                                this._executeFormatAction(b.command, color);
                            };
                            menu.appendChild(swatch);
                        });
                    } else {
                        b.items.forEach(item => {
                            const itemBtn = document.createElement('button');
                            itemBtn.className = 'sn-gnotes-inline-btn';
                            itemBtn.style.width = 'auto';
                            itemBtn.style.padding = '0 8px';
                            itemBtn.innerHTML = item.label;
                            itemBtn.onmousedown = (e) => {
                                e.preventDefault();
                                item.action();
                                menu.style.display = 'none';
                            };
                            menu.appendChild(itemBtn);
                        });
                    }

                    button.onmousedown = (e) => {
                        e.preventDefault();
                        const isVisible = menu.style.display === 'flex';
                        bar.querySelectorAll('.sn-gnotes-dropdown-menu').forEach(m => m.style.display = 'none');
                        menu.style.display = isVisible ? 'none' : 'flex';
                    };
                    bar.appendChild(container);
                    return;
                }

                const btn = document.createElement('button');
                btn.className = 'sn-gnotes-inline-btn';
                btn.innerHTML = b.icon;
                btn.title = b.title;
                btn.onmousedown = (e) => {
                    e.preventDefault();
                    this._executeFormatAction(b.cmd, b.value || null);
                };
                bar.appendChild(btn);
            });

            document.body.appendChild(bar);
            this._inlineToolbar = bar;

            // Prevent toolbar clicks from deselecting text
            bar.addEventListener('mousedown', (e) => e.preventDefault());
        },

        _checkSelection() {
            const sel = window.getSelection();
            const editor = document.getElementById('sn-gnotes-editor');
            if (!sel || sel.isCollapsed || !editor || !editor.contains(sel.anchorNode)) {
                this._hideInlineToolbar();
                return;
            }

            const range = sel.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            if (rect.width === 0) {
                this._hideInlineToolbar();
                return;
            }

            const bar = this._inlineToolbar;
            bar.style.display = 'flex';

            // Position above the selection, centered
            const barW = bar.offsetWidth || 220;
            let left = rect.left + (rect.width / 2) - (barW / 2);
            let top = rect.top - 44;

            // Keep in viewport
            if (left < 4) left = 4;
            if (left + barW > window.innerWidth - 4) left = window.innerWidth - barW - 4;
            if (top < 4) top = rect.bottom + 8; // Flip below if no room above

            bar.style.left = left + 'px';
            bar.style.top = top + 'px';
        },

        _hideInlineToolbar() {
            if (this._inlineToolbar) {
                this._inlineToolbar.style.display = 'none';
                // Also hide any open dropdown menus
                this._inlineToolbar.querySelectorAll('.sn-gnotes-dropdown-menu').forEach(menu => {
                    menu.style.display = 'none';
                });
            }
        },

        _executeFormatAction(cmd, value = null) {
            document.execCommand(cmd, false, value);
            this._hideInlineToolbar();
            // Collapse selection to the end to show the result immediately
            setTimeout(() => {
                const sel = window.getSelection();
                if (sel) {
                    sel.collapseToEnd();
                }
            }, 10);
        },

        // ── Resizers ────────────────────────────────────────────
        _setupResizers(panel) {
            panel.querySelectorAll('.sn-gnotes-resizer').forEach(r => {
                r.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    const startX = e.clientX, startY = e.clientY;
                    const startW = panel.offsetWidth;
                    const startH = panel.offsetHeight;
                    const cls = r.className;

                    const onMove = (ev) => {
                        const dx = ev.clientX - startX;
                        const dy = ev.clientY - startY;
                        if (cls.includes('rs-e') || cls.includes('rs-ne')) {
                            panel.style.width = Math.max(280, startW + dx) + 'px';
                        }
                        if (cls.includes('rs-n') || cls.includes('rs-ne')) {
                            panel.style.height = Math.max(200, startH - dy) + 'px';
                        }
                    };

                    const onUp = () => {
                        document.removeEventListener('mousemove', onMove);
                        document.removeEventListener('mouseup', onUp);
                    };

                    document.addEventListener('mousemove', onMove);
                    document.addEventListener('mouseup', onUp);
                });
            });
        },

        // ── Tab rendering ───────────────────────────────────────
        _renderTabs() {
            const nav = document.getElementById('sn-gnotes-nav');
            if (!nav) return;
            nav.innerHTML = '';

            const data = this._loadData();
            this._activeTabId = data.activeTab;

            const regularTabs = data.tabs.filter(t => t.id !== 0);
            const instructionsTab = data.tabs.find(t => t.id === 0);

            regularTabs.forEach(t => {
                nav.appendChild(this._createTabElement(t, data));
            });

            // "+" tab
            const addTab = document.createElement('div');
            addTab.className = 'sn-gnotes-navtab sn-gnotes-add-tab';
            addTab.innerHTML = '+';
            addTab.title = 'New tab';
            addTab.onclick = () => this._addTab();
            nav.appendChild(addTab);

            // Spacer
            const spacer = document.createElement('div');
            spacer.style.flex = '1';
            nav.appendChild(spacer);

            // Instructions tab on far right
            if (instructionsTab) {
                const instrEl = this._createTabElement(instructionsTab, data);
                instrEl.classList.add('sn-gnotes-instr-tab');
                nav.appendChild(instrEl);
            }

            this._loadTabContent(this._activeTabId);
        },

        _createTabElement(t, data) {
            const tabEl = document.createElement('div');
            tabEl.className = 'sn-gnotes-navtab' + (t.id === this._activeTabId ? ' active' : '');
            tabEl.style.borderBottomColor = t.id === this._activeTabId ? t.color : 'transparent';
            tabEl.dataset.tabId = t.id;

            const titleSpan = document.createElement('span');
            titleSpan.className = 'sn-gnotes-navtab-title';
            titleSpan.textContent = t.title;
            tabEl.appendChild(titleSpan);

            if (t.id !== 0) {
                const closeBtn = document.createElement('span');
                closeBtn.className = 'sn-gnotes-navtab-close';
                closeBtn.innerHTML = '&times;';
                closeBtn.title = 'Close tab';
                closeBtn.onclick = (e) => { e.stopPropagation(); this._closeTab(t.id); };
                tabEl.appendChild(closeBtn);
            }

            tabEl.onclick = () => this._switchTab(t.id);

            titleSpan.ondblclick = (e) => {
                e.stopPropagation();
                if (t.id === 0) return;
                this._startInlineRename(titleSpan, t, data);
            };

            return tabEl;
        },

        _startInlineRename(titleSpan, tab, data) {
            const input = document.createElement('input');
            input.type = 'text';
            input.value = tab.title;
            input.className = 'sn-gnotes-rename-input';

            const commit = () => {
                const newName = input.value.trim();
                if (newName) {
                    const freshData = this._loadData();
                    const freshTab = freshData.tabs.find(t => t.id === tab.id);
                    if (freshTab) { freshTab.title = newName; this._saveData(freshData); }
                }
                this._renderTabs();
            };

            input.onblur = commit;
            input.onkeydown = (e) => {
                if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
                if (e.key === 'Escape') { input.value = tab.title; input.blur(); }
            };

            titleSpan.textContent = '';
            titleSpan.appendChild(input);
            input.focus();
            input.select();
        },

        _switchTab(tabId) {
            if (this._activeTabId === tabId) return;
            const data = this._loadData();
            data.activeTab = tabId;
            this._saveData(data);
            this._activeTabId = tabId;
            this._renderTabs();
        },

        _loadTabContent(tabId) {
            const data = this._loadData();
            const tab = data.tabs.find(t => t.id === tabId);
            const editor = document.getElementById('sn-gnotes-editor');
            if (editor && tab) {
                editor.innerHTML = tab.content || '';
                editor.style.borderTopColor = tab.color || '#009688';
                if (tabId === 0) {
                    editor.setAttribute('contenteditable', 'false');
                    editor.style.opacity = '0.92';
                } else {
                    editor.setAttribute('contenteditable', 'true');
                    editor.style.opacity = '1';
                }
            }
        },

        _addTab() {
            const data = this._loadData();
            const newId = data.nextId++;
            data.tabs.push({ id: newId, title: 'Note ' + newId, content: '', color: '#009688' });
            data.activeTab = newId;
            this._saveData(data);
            this._activeTabId = newId;
            this._renderTabs();
        },

        _closeTab(tabId) {
            if (tabId === 0) return;
            const data = this._loadData();
            data.tabs = data.tabs.filter(t => t.id !== tabId);
            if (data.activeTab === tabId) {
                const next = data.tabs.find(t => t.id !== 0);
                data.activeTab = next ? next.id : 0;
            }
            this._saveData(data);
            this._activeTabId = data.activeTab;
            this._renderTabs();
        }
    };

    app.Tools.GlobalNotes = GlobalNotes;
})();
