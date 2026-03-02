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
<p><b>Keyboard Shortcuts (Alt + Key):</b></p>
<ul>
<li><b>Alt+1</b> – Toggle Client Note</li>
<li><b>Alt+2</b> – Open FO Contact Form</li>
<li><b>Alt+3</b> – Open DDS Contact Form</li>
<li><b>Alt+Y</b> – Toggle Dashboard</li>
<li><b>Alt+Q</b> – Toggle Info Panel</li>
<li><b>Alt+W</b> – Toggle Med Window</li>
<li><b>Alt+E</b> – Toggle SSA Panel</li>
<li><b>Alt+S</b> – SSD Form Viewer (on form pages)</li>
<li><b>Alt+M</b> – Mail Resolve</li>
<li><b>Alt+4</b> – Med Window</li>
<li><b>Alt+5</b> – Fax Forms</li>
<li><b>Alt+6</b> – IR Tool</li>
<li><b>Alt+\`</b> – Fetch SSD Data</li>
</ul>
<p><b>Window Controls:</b></p>
<ul>
<li><b>Double-click header</b> – Minimize window</li>
<li><b>Hold minimize button</b> – Save default size/position</li>
<li><b>Drag edges</b> – Resize any window</li>
</ul>
<p><b>Client Note:</b></p>
<ul>
<li>Auto-loads when visiting a known client record</li>
<li>Notes auto-save on every change</li>
<li>Use the color picker 🎨 to tag notes</li>
<li>Pin 📌 to keep the window open across navigation</li>
</ul>
<p><b>Global Notes (Ctrl shortcuts):</b></p>
<ul>
<li><b>Ctrl+B</b> – Bold</li>
<li><b>Ctrl+I</b> – Italic</li>
<li><b>Ctrl+U</b> – Underline</li>
<li>Right-click inside the editor for formatting menu</li>
<li>Double-click a tab name to rename it</li>
<li>Click <b>+</b> to add new tabs</li>
<li>Click <b>×</b> on a tab to remove it</li>
</ul>`;

    const GlobalNotes = {
        _panel: null,
        _isOpen: false,
        _activeTabId: 1, // Default to Scratch (not Instructions)
        _saveTimer: null,
        _contextMenu: null,

        // ── Data helpers ────────────────────────────────────────
        _loadData() {
            const raw = GM_getValue(STORAGE_KEY, null);
            if (raw && Array.isArray(raw.tabs)) return raw;
            // Default data – Instructions tab (id:0) shown on first open only
            return {
                activeTab: 0, // First open shows Instructions
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
        init() {
            if (document.getElementById('sn-gnotes-tab')) return;
            this._buildTab();
            this._buildSidebarButtons();
        },

        _buildTab() {
            // Trigger tab on the left edge
            const tab = document.createElement('div');
            tab.id = 'sn-gnotes-tab';
            tab.className = 'sn-gnotes-tab';
            tab.innerHTML = '📝';
            tab.title = 'Global Notes';
            tab.onclick = () => this.toggle();
            document.body.appendChild(tab);
        },

        _buildSidebarButtons() {
            // FO sidebar button
            const fo = document.createElement('div');
            fo.id = 'sn-sidebar-fo';
            fo.className = 'sn-sidebar-btn';
            fo.innerHTML = '<span>FO</span>';
            fo.title = 'FO Contact Form';
            fo.onclick = () => app.Tools.ContactForms.create('FO');
            document.body.appendChild(fo);

            // DDS sidebar button
            const dds = document.createElement('div');
            dds.id = 'sn-sidebar-dds';
            dds.className = 'sn-sidebar-btn sn-sidebar-btn-dds';
            dds.innerHTML = '<span>DDS</span>';
            dds.title = 'DDS Contact Form';
            dds.onclick = () => app.Tools.ContactForms.create('DDS');
            document.body.appendChild(dds);
        },

        toggle() {
            if (!this._panel) this._buildPanel();
            this._isOpen = !this._isOpen;
            this._panel.classList.toggle('open', this._isOpen);
            const tab = document.getElementById('sn-gnotes-tab');
            if (tab) tab.classList.toggle('active', this._isOpen);
        },

        // ── Panel construction ──────────────────────────────────
        _buildPanel() {
            const panel = document.createElement('div');
            panel.id = 'sn-gnotes-panel';
            panel.className = 'sn-gnotes-panel';

            // Default height: 60% of window
            const defaultH = Math.round(window.innerHeight * 0.6);
            panel.style.height = defaultH + 'px';
            panel.style.width = '360px';
            panel.style.bottom = '40px'; // above taskbar
            panel.style.top = 'auto';

            panel.innerHTML = `
                <div class="sn-gnotes-header">
                    <span style="font-weight:bold; font-size:13px;">Global Notes</span>
                    <span class="sn-gnotes-close" title="Close">&times;</span>
                </div>
                <div class="sn-gnotes-nav" id="sn-gnotes-nav"></div>
                <div class="sn-gnotes-toolbar" id="sn-gnotes-toolbar"></div>
                <div class="sn-gnotes-editor" id="sn-gnotes-editor" contenteditable="true"></div>
                <div class="sn-gnotes-resizer sn-gnotes-rs-e"></div>
                <div class="sn-gnotes-resizer sn-gnotes-rs-n"></div>
                <div class="sn-gnotes-resizer sn-gnotes-rs-ne"></div>
            `;

            document.body.appendChild(panel);
            this._panel = panel;

            // Close button
            panel.querySelector('.sn-gnotes-close').onclick = () => this.toggle();

            // Build toolbar
            this._buildToolbar();

            // Build context menu
            this._buildContextMenu();

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

            // Keyboard shortcuts for formatting (Ctrl+B/I/U)
            editor.addEventListener('keydown', (e) => {
                if (e.ctrlKey && !e.altKey && !e.shiftKey) {
                    if (e.key === 'b' || e.key === 'B') {
                        e.preventDefault();
                        document.execCommand('bold', false, null);
                    } else if (e.key === 'i' || e.key === 'I') {
                        e.preventDefault();
                        document.execCommand('italic', false, null);
                    } else if (e.key === 'u' || e.key === 'U') {
                        e.preventDefault();
                        document.execCommand('underline', false, null);
                    }
                }
            });

            // Right-click context menu for formatting
            editor.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this._showContextMenu(e.clientX, e.clientY);
            });

            // Hide context menu on click outside
            document.addEventListener('mousedown', (e) => {
                if (this._contextMenu && !this._contextMenu.contains(e.target)) {
                    this._contextMenu.style.display = 'none';
                }
            });

            // Prevent panel from closing on clicks inside
            panel.addEventListener('mousedown', e => e.stopPropagation());

            // Set up resizing on edges
            this._setupResizers(panel);
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
                    const startBottom = parseInt(panel.style.bottom) || 40;
                    const cls = r.className;

                    const onMove = (ev) => {
                        const dx = ev.clientX - startX;
                        const dy = ev.clientY - startY;

                        // East edge (right)
                        if (cls.includes('rs-e') || cls.includes('rs-ne')) {
                            panel.style.width = Math.max(280, startW + dx) + 'px';
                        }
                        // North edge (top) – panel is bottom-anchored, so grow upwards
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

        // ── Context Menu ────────────────────────────────────────
        _buildContextMenu() {
            const menu = document.createElement('div');
            menu.className = 'sn-gnotes-ctx';
            menu.style.display = 'none';

            const items = [
                { label: 'Bold', cmd: 'bold', shortcut: 'Ctrl+B' },
                { label: 'Italic', cmd: 'italic', shortcut: 'Ctrl+I' },
                { label: 'Underline', cmd: 'underline', shortcut: 'Ctrl+U' },
                { label: 'Strikethrough', cmd: 'strikeThrough' },
                { type: 'separator' },
                { label: '• Bullet List', cmd: 'insertUnorderedList' },
                { label: '1. Numbered List', cmd: 'insertOrderedList' },
                { type: 'separator' },
                { label: 'Clear Formatting', cmd: 'removeFormat' },
            ];

            items.forEach(item => {
                if (item.type === 'separator') {
                    const sep = document.createElement('div');
                    sep.className = 'sn-gnotes-ctx-sep';
                    menu.appendChild(sep);
                    return;
                }
                const row = document.createElement('div');
                row.className = 'sn-gnotes-ctx-item';
                row.innerHTML = `<span>${item.label}</span>${item.shortcut ? `<span class="sn-gnotes-ctx-key">${item.shortcut}</span>` : ''}`;
                row.onmousedown = (e) => {
                    e.preventDefault();
                    document.execCommand(item.cmd, false, null);
                    menu.style.display = 'none';
                };
                menu.appendChild(row);
            });

            // Color sub-section
            const colorSep = document.createElement('div');
            colorSep.className = 'sn-gnotes-ctx-sep';
            menu.appendChild(colorSep);

            const colorLabel = document.createElement('div');
            colorLabel.className = 'sn-gnotes-ctx-item';
            colorLabel.style.cursor = 'default';
            colorLabel.style.fontWeight = 'bold';
            colorLabel.style.fontSize = '11px';
            colorLabel.textContent = 'Text Color:';
            menu.appendChild(colorLabel);

            const colorRow = document.createElement('div');
            colorRow.style.cssText = 'display:flex; gap:3px; padding:4px 10px;';
            const colors = ['#333333', '#e53935', '#fb8c00', '#43a047', '#1e88e5', '#8e24aa', '#00897b', '#6d4c41'];
            colors.forEach(c => {
                const sw = document.createElement('span');
                sw.className = 'sn-gnotes-swatch';
                sw.style.background = c;
                sw.onmousedown = (e) => {
                    e.preventDefault();
                    document.execCommand('foreColor', false, c);
                    menu.style.display = 'none';
                };
                colorRow.appendChild(sw);
            });
            menu.appendChild(colorRow);

            document.body.appendChild(menu);
            this._contextMenu = menu;
        },

        _showContextMenu(x, y) {
            const menu = this._contextMenu;
            if (!menu) return;
            menu.style.display = 'block';
            menu.style.left = x + 'px';
            menu.style.top = y + 'px';

            // Keep in viewport
            const rect = menu.getBoundingClientRect();
            if (rect.right > window.innerWidth) menu.style.left = (x - rect.width) + 'px';
            if (rect.bottom > window.innerHeight) menu.style.top = (y - rect.height) + 'px';
        },

        _buildToolbar() {
            const toolbar = document.getElementById('sn-gnotes-toolbar');
            const buttons = [
                { cmd: 'bold', icon: '<b>B</b>', title: 'Bold (Ctrl+B)' },
                { cmd: 'italic', icon: '<i>I</i>', title: 'Italic (Ctrl+I)' },
                { cmd: 'underline', icon: '<u>U</u>', title: 'Underline (Ctrl+U)' },
                { cmd: 'strikeThrough', icon: '<s>S</s>', title: 'Strikethrough' },
                { cmd: 'insertUnorderedList', icon: '• List', title: 'Bullet List' },
                { cmd: 'insertOrderedList', icon: '1. List', title: 'Numbered List' },
            ];

            buttons.forEach(b => {
                const btn = document.createElement('button');
                btn.className = 'sn-gnotes-tbtn';
                btn.innerHTML = b.icon;
                btn.title = b.title;
                btn.onmousedown = (e) => {
                    e.preventDefault();
                    document.execCommand(b.cmd, false, null);
                };
                toolbar.appendChild(btn);
            });

            // Color picker
            const colors = ['#333333', '#e53935', '#fb8c00', '#43a047', '#1e88e5', '#8e24aa', '#00897b', '#6d4c41'];
            const cpWrap = document.createElement('div');
            cpWrap.className = 'sn-gnotes-cp-wrap';

            const cpBtn = document.createElement('button');
            cpBtn.className = 'sn-gnotes-tbtn sn-gnotes-cp-trigger';
            cpBtn.innerHTML = '🎨';
            cpBtn.title = 'Text Color';
            cpWrap.appendChild(cpBtn);

            const cpDropdown = document.createElement('div');
            cpDropdown.className = 'sn-gnotes-cp-dropdown';

            colors.forEach(c => {
                const swatch = document.createElement('span');
                swatch.className = 'sn-gnotes-swatch';
                swatch.style.background = c;
                swatch.onmousedown = (e) => {
                    e.preventDefault();
                    document.execCommand('foreColor', false, c);
                    cpDropdown.style.display = 'none';
                };
                cpDropdown.appendChild(swatch);
            });

            cpBtn.onclick = () => {
                cpDropdown.style.display = cpDropdown.style.display === 'flex' ? 'none' : 'flex';
            };

            cpWrap.appendChild(cpDropdown);
            toolbar.appendChild(cpWrap);
        },

        // ── Tab rendering ───────────────────────────────────────
        _renderTabs() {
            const nav = document.getElementById('sn-gnotes-nav');
            if (!nav) return;
            nav.innerHTML = '';

            const data = this._loadData();
            this._activeTabId = data.activeTab;

            // Separate regular tabs from the special Instructions tab
            const regularTabs = data.tabs.filter(t => t.id !== 0);
            const instructionsTab = data.tabs.find(t => t.id === 0);

            // Render regular tabs first
            regularTabs.forEach(t => {
                nav.appendChild(this._createTabElement(t, data));
            });

            // Add "+" tab
            const addTab = document.createElement('div');
            addTab.className = 'sn-gnotes-navtab sn-gnotes-add-tab';
            addTab.innerHTML = '+';
            addTab.title = 'New tab';
            addTab.onclick = () => this._addTab();
            nav.appendChild(addTab);

            // Spacer to push Instructions to far right
            const spacer = document.createElement('div');
            spacer.style.flex = '1';
            nav.appendChild(spacer);

            // Instructions tab on far right
            if (instructionsTab) {
                const instrEl = this._createTabElement(instructionsTab, data);
                instrEl.classList.add('sn-gnotes-instr-tab');
                nav.appendChild(instrEl);
            }

            // Load active tab content into editor
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

            // Close button (not for Instructions tab)
            if (t.id !== 0) {
                const closeBtn = document.createElement('span');
                closeBtn.className = 'sn-gnotes-navtab-close';
                closeBtn.innerHTML = '&times;';
                closeBtn.title = 'Close tab';
                closeBtn.onclick = (e) => {
                    e.stopPropagation();
                    this._closeTab(t.id);
                };
                tabEl.appendChild(closeBtn);
            }

            // Click to switch
            tabEl.onclick = () => this._switchTab(t.id);

            // Double-click to rename
            titleSpan.ondblclick = (e) => {
                e.stopPropagation();
                if (t.id === 0) return; // Can't rename Instructions
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
                    // Reload fresh data to avoid stale writes
                    const freshData = this._loadData();
                    const freshTab = freshData.tabs.find(t => t.id === tab.id);
                    if (freshTab) {
                        freshTab.title = newName;
                        this._saveData(freshData);
                    }
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
                // Update editor accent line color
                editor.style.borderTopColor = tab.color || '#009688';
                // Set readonly for instructions
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
            if (tabId === 0) return; // Can't close instructions
            const data = this._loadData();
            data.tabs = data.tabs.filter(t => t.id !== tabId);
            if (data.activeTab === tabId) {
                // Switch to first regular tab
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
