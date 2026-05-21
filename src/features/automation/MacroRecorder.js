(function () {
    const app = window.CM_App = window.CM_App || {};
    app.Automation = app.Automation || {};

    /**
     * Macro Recorder & Player for Salesforce Lightning automation.
     * Standalone floating panel (Alt+M to toggle).
     *
     * Records user interactions (clicks, combobox selections, removals, field clears)
     * and replays them on matching pages. Think of it as a macro recorder for
     * repetitive form-filling tasks like Mail Log resolution.
     *
     * Recording captures **stable selectors only** (aria-label, title,
     * data-target-selection-name, role+text) — never pixel positions or
     * fragile DOM paths — so macros work across screen sizes.
     *
     * @namespace app.Automation.MacroRecorder
     */
    const MacroRecorder = {
        // ── Panel State ──
        triggerSide: 'right',
        triggerY: null,

        // ── Builder State (manual step-by-step) ──
        _builderSteps: [],
        _elementPickerActive: false,
        _pickerClickHandler: null,
        _pickerMoveHandler: null,
        _pickerHighlight: null,
        _pickerPanelEl: null,
        _pendingPickResolve: null,
        _advancedMode: false,
        _defaultMacro: null,

        // ══════════════════════════════════════════════
        //  TRIGGER & PANEL
        // ══════════════════════════════════════════════

        init() {
            this._defaultMacro = GM_getValue('sn_default_macro', null);
            this._advancedMode = GM_getValue('sn_macro_advanced_mode', false);
        },

        getTriggerStyles(side) {
            const base = `
                position: fixed;
                width: 38px;
                height: 44px;
                background: #1e1e1e;
                color: white;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                z-index: 100005;
                font-size: 22px;
                transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                user-select: none;
                border: 1px solid rgba(255,255,255,0.1);
            `;
            if (side === 'left') {
                return base + `
                    left: 0;
                    border-radius: 0 20px 20px 0;
                    box-shadow: 4px 0 12px rgba(0,0,0,0.15);
                    border-left: none;
                `;
            }
            return base + `
                right: 0;
                border-radius: 20px 0 0 20px;
                box-shadow: -4px 0 12px rgba(0,0,0,0.15);
                border-right: none;
            `;
        },

        createTrigger() {
            const triggerId = 'sn-macro-trigger';
            if (document.getElementById(triggerId)) return;

            const t = document.createElement('div');
            t.id = triggerId;
            t.title = 'Macro Recorder (Drag to move)';
            t.innerHTML = '🎬';

            const savedSide = GM_getValue('sn_macro_trigger_side', 'right');
            this.triggerSide = savedSide;
            t.style.cssText = this.getTriggerStyles(savedSide);

            const savedY = GM_getValue('sn_macro_trigger_y', '50%');
            this.triggerY = savedY;
            t.style.top = savedY;

            t.onmouseenter = () => { t.style.background = '#2d2d2d'; t.style.width = '42px'; };
            t.onmouseleave = () => { t.style.background = '#1e1e1e'; t.style.width = '36px'; };

            let isDragging = false;
            let startY = 0, startTop = 0;

            const updatePanelSide = (side, top) => {
                const panel = document.getElementById('sn-macro-panel');
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
                startTop = t.offsetTop;
                const onMouseMove = (me) => {
                    const deltaY = me.clientY - startY;
                    if (Math.abs(deltaY) > 5 || Math.abs(me.clientX - e.clientX) > 5) isDragging = true;
                    let newTop = startTop + deltaY;
                    newTop = Math.max(10, Math.min(window.innerHeight - 50, newTop));
                    t.style.top = newTop + 'px';
                    const panel = document.getElementById('sn-macro-panel');
                    if (panel) panel.style.top = Math.max(10, newTop - 80) + 'px';
                };
                const onMouseUp = () => {
                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);
                    window.removeEventListener('mouseup', onMouseUp);
                    if (isDragging) {
                        const rect = t.getBoundingClientRect();
                        const centerX = rect.left + rect.width / 2;
                        const newSide = centerX < window.innerWidth / 2 ? 'left' : 'right';
                        if (newSide !== this.triggerSide) {
                            this.triggerSide = newSide;
                            t.style.cssText = this.getTriggerStyles(newSide);
                            t.style.top = rect.top + 'px';
                            GM_setValue('sn_macro_trigger_side', newSide);
                        }
                        updatePanelSide(this.triggerSide, rect.top);
                        GM_setValue('sn_macro_trigger_y', t.style.top);
                        this.triggerY = t.style.top;
                    }
                };
                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
                window.addEventListener('mouseup', onMouseUp);
            };

            t.onclick = (e) => {
                if (isDragging) return;
                this.toggle();
            };

            document.body.appendChild(t);
        },

        toggle() {
            const id = 'sn-macro-panel';
            const existing = document.getElementById(id);
            if (existing) {
                // If default macro is set and panel is being opened, auto-play
                const isHidden = existing.style.display === 'none' || !existing.isConnected || 
                    (app.Core.Windows && !app.Core.Windows.isVisible(id));
                
                if (isHidden && this._defaultMacro) {
                    const macro = this.getMacro(this._defaultMacro);
                    if (macro) {
                        if (app.Core.Windows) app.Core.Windows.toggle(id);
                        else { existing.style.display = 'flex'; }
                        setTimeout(() => this.playMacro(this._defaultMacro), 500);
                        return;
                    }
                }
                if (app.Core.Windows) app.Core.Windows.toggle(id);
                return;
            }
            this._defaultMacro = GM_getValue('sn_default_macro', null);
            this.create();
        },

        create() {
            const id = 'sn-macro-panel';
            const existing = document.getElementById(id);
            if (existing) {
                if (app.Core.Windows) app.Core.Windows.toggle(id);
                return;
            }

            const w = document.createElement('div');
            w.id = id;
            w.className = 'sn-window';

            const trigger = document.getElementById('sn-macro-trigger');
            const triggerTop = trigger ? trigger.offsetTop : 200;
            const gap = 45;
            const panelLeft = this.triggerSide === 'left' ? `${gap}px` : 'auto';
            const panelRight = this.triggerSide === 'right' ? `${gap}px` : 'auto';

            w.style.cssText = `
                width: 300px;
                height: auto;
                max-height: 500px;
                top: ${Math.max(10, triggerTop - 80)}px;
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
            if (app.Core.Windows) app.Core.Windows.makeDraggable(w, w.querySelector('.sn-header'));
        },

        render(w) {
            w.innerHTML = `
                <div class="sn-header" style="background:#1e1e1e; color:white; padding:8px 12px; border-bottom:1px solid rgba(0,0,0,0.1); display:flex; align-items:center; justify-content:space-between; cursor:move;">
                    <span style="font-weight:bold; font-size:13px; letter-spacing:0.5px;">🎬 Macro Builder</span>
                    <button id="sn-macro-close" style="background:rgba(255,255,255,0.1); border:none; color:white; font-weight:bold; cursor:pointer; font-size:16px; width:24px; height:24px; border-radius:50%; display:flex; align-items:center; justify-content:center;">×</button>
                </div>
                <div id="sn-macro-body" style="padding:12px; display:flex; flex-direction:column; gap:8px; background:white; overflow-y:auto; max-height:440px;">
                    ${this._renderBuildView()}
                </div>
            `;

            this.bindEvents(w);
        },



        _renderBuildView() {
            const steps = this._builderSteps;
            const isPicking = this._elementPickerActive;
            const icons = { click: '👆', select: '📋', remove: '🗑️', clear: '🧹', wait: '⏳' };
            const typeLabels = { click: 'Click', select: 'Select', remove: 'Remove', clear: 'Clear', wait: 'Wait' };
            const macros = this.getMacros();
            const macroNames = Object.keys(macros);

            return `
                <div style="display:flex; flex-direction:column; gap:6px; border-bottom:1px solid #eee; padding-bottom:8px; margin-bottom:4px;">
                    <div style="display:flex; gap:6px;">
                        <button id="sn-builder-pick-btn" style="flex:1; padding:10px; border:none; border-radius:8px; font-weight:bold; cursor:pointer; font-size:13px; ${isPicking ? 'background:#e53935; color:white;' : 'background:#43a047; color:white;'}">
                            ${isPicking ? '✕ Cancel Pick' : '🎯 Pick Element'}
                        </button>
                        <button id="sn-builder-add-wait" style="padding:8px 12px; background:#f5f5f5; border:1px solid #ddd; border-radius:8px; cursor:pointer; font-size:16px; color:#888;" title="Add wait step">⏳</button>
                    </div>
                    <div style="display:flex; gap:6px; align-items:center;">
                        <label style="font-size:11px; color:#888; display:flex; align-items:center; gap:4px; cursor:pointer; flex:1;">
                            <input type="checkbox" id="sn-macro-advanced-toggle" ${this._advancedMode ? 'checked' : ''} style="cursor:pointer;">
                            🔍 Advanced Mode
                        </label>
                        ${macroNames.length > 0 ? `
                        <label style="font-size:11px; color:#888; display:flex; align-items:center; gap:4px; cursor:pointer;">
                            <input type="checkbox" id="sn-macro-default-toggle" ${this._defaultMacro ? 'checked' : ''} style="cursor:pointer;">
                            ⚡ Default (Alt+M)
                        </label>
                        ` : ''}
                    </div>
                </div>
                ${isPicking ? '<div style="font-size:11px; color:#e53935; text-align:center; padding:4px; background:#fff0f0; border-radius:6px; font-weight:bold;">👆 Click any element on the page to select it for this step</div>' : ''}
                <div id="sn-builder-status" style="font-size:11px; color:#888; min-height:16px; padding:2px 0;">
                    ${steps.length === 0
                        ? 'No steps yet. Click <strong>Pick Element</strong> to start building.'
                        : `<strong>${steps.length}</strong> step(s) in this macro`
                    }
                </div>
                <div id="sn-builder-steps" style="display:flex; flex-direction:column; gap:4px; max-height:280px; overflow-y:auto;">
                    ${steps.length === 0
                        ? '<div style="font-size:11px; color:#aaa; text-align:center; padding:16px 0;">🔧 Build your macro step by step</div>'
                        : steps.map((step, i) => {
                            const targetLabel = step.selectors
                                ? (step.selectors.ariaLabel || step.selectors.title || step.selectors.name || step.selectors.placeholder || step.selectors.innerText || 'element')
                                : (step.value || step.ms + 'ms');
                            const shortTarget = targetLabel.length > 25 ? targetLabel.substring(0, 25) + '…' : targetLabel;
                            return `
                                <div class="sn-builder-step" style="display:flex; align-items:center; gap:4px; padding:6px 8px; background:white; border:1px solid #eee; border-radius:8px; font-size:11px;">
                                    <span style="color:#999; font-weight:bold; min-width:20px;">${i + 1}.</span>
                                    <span title="${typeLabels[step.type] || step.type}">${icons[step.type] || '➡️'}</span>
                                    <span style="flex:1; color:#333; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${targetLabel}">${shortTarget}</span>
                                    <div style="display:flex; gap:2px; flex-shrink:0;">
                                        <button class="sn-builder-move" data-index="${i}" data-dir="-1" style="background:none; border:none; cursor:pointer; font-size:12px; color:#999; padding:2px; ${i === 0 ? 'opacity:0.3;cursor:default;' : ''}">↑</button>
                                        <button class="sn-builder-move" data-index="${i}" data-dir="1" style="background:none; border:none; cursor:pointer; font-size:12px; color:#999; padding:2px; ${i === steps.length - 1 ? 'opacity:0.3;cursor:default;' : ''}">↓</button>
                                        <button class="sn-builder-edit" data-index="${i}" style="background:none; border:none; cursor:pointer; font-size:12px; color:#999; padding:2px;" title="Edit step">✏️</button>
                                        <button class="sn-builder-delete" data-index="${i}" style="background:none; border:none; cursor:pointer; font-size:12px; color:#e53935; padding:2px;" title="Delete step">✕</button>
                                    </div>
                                </div>
                            `;
                        }).join('')
                    }
                </div>
                ${steps.length > 0 ? `
                    <div style="display:flex; gap:6px; margin-top:4px;">
                        <button id="sn-builder-play" style="flex:1; padding:8px; background:#1976d2; color:white; border:none; border-radius:8px; font-weight:bold; cursor:pointer; font-size:12px;">▶ Play Steps</button>
                        <button id="sn-builder-clear" style="padding:8px 10px; background:#f5f5f5; color:#888; border:1px solid #ddd; border-radius:8px; cursor:pointer; font-size:12px;">🗑️ Clear All</button>
                    </div>
                    <button id="sn-builder-save" style="padding:8px; background:#43a047; color:white; border:none; border-radius:8px; font-weight:bold; cursor:pointer; font-size:12px;">💾 Save as Macro</button>
                ` : ''}
                ${steps.length === 0 ? this._renderSavedMacrosList() : ''}
            `;
        },

        _renderSavedMacrosList() {
            const macros = this.getMacros();
            const macroNames = Object.keys(macros);
            if (macroNames.length === 0) return '';

            const icons = { click: '👆', select: '📋', remove: '🗑️', clear: '🧹' };

            return `
                <div style="border-top:1px solid #eee; padding-top:8px; margin-top:4px;">
                    <div style="font-size:11px; font-weight:bold; color:#888; margin-bottom:6px;">💾 Saved Macros</div>
                    <div id="sn-macro-list" style="display:flex; flex-direction:column; gap:4px; max-height:320px; overflow-y:auto;">
                        ${macroNames.map(name => {
                            const macro = macros[name];
                            const sc = (macro.steps || []).length;
                            const summary = (macro.steps || []).slice(0, 3).map(s => icons[s.type] || '➡️').join(' ');
                            const extra = sc > 3 ? ` +${sc - 3}` : '';
                            const isDefault = this._defaultMacro === name;
                            return `
                                <div class="sn-macro-item" style="display:flex; align-items:center; gap:6px; padding:8px 10px; background:white; border:1px solid ${isDefault ? '#1976d2' : '#eee'}; border-radius:8px; ${isDefault ? 'box-shadow:0 0 0 1px #1976d2;' : ''}">
                                    <div style="flex:1; min-width:0;">
                                        <div style="font-size:12px; font-weight:600; color:#333; display:flex; align-items:center; gap:4px;">
                                            ${name}
                                            ${isDefault ? '<span style="font-size:9px; background:#1976d2; color:white; padding:1px 5px; border-radius:4px; font-weight:bold;">DEFAULT</span>' : ''}
                                        </div>
                                        <div style="font-size:10px; color:#999; display:flex; gap:4px; align-items:center; flex-wrap:wrap;">
                                            <span>${sc} step(s)</span>
                                            <span>·</span>
                                            <span>${summary}${extra}</span>
                                            ${macro.urlPattern ? `<span>·</span><span style="color:#1565c0;">${macro.urlPattern}</span>` : ''}
                                        </div>
                                    </div>
                                    <div style="display:flex; gap:3px; flex-shrink:0;">
                                        <button class="sn-macro-default" data-macro="${encodeURIComponent(name)}" title="${isDefault ? 'Remove default' : 'Set as default (Alt+M)'}" style="background:none; border:none; cursor:pointer; font-size:14px; padding:2px; ${isDefault ? 'color:#1976d2;' : 'color:#bbb;'}">⚡</button>
                                        <button class="sn-macro-play" data-macro="${encodeURIComponent(name)}" title="Play macro" style="background:var(--sn-primary,#1976d2); color:white; border:none; border-radius:6px; padding:6px 12px; font-size:12px; cursor:pointer; font-weight:bold;">▶</button>
                                        <button class="sn-macro-edit" data-macro="${encodeURIComponent(name)}" title="Edit macro" style="background:#f5f5f5; color:#666; border:1px solid #eee; border-radius:6px; padding:6px 8px; font-size:12px; cursor:pointer;">✏️</button>
                                        <button class="sn-macro-delete" data-macro="${encodeURIComponent(name)}" title="Delete macro" style="background:#f5f5f5; color:#999; border:1px solid #eee; border-radius:6px; padding:6px 8px; font-size:12px; cursor:pointer;">🗑️</button>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        },

        bindEvents(w) {
            const self = this;

            // ── Close ──
            const closeBtn = w.querySelector('#sn-macro-close');
            if (closeBtn) {
                closeBtn.onclick = () => {
                    if (self._elementPickerActive) self.stopElementPicker();
                    const id = 'sn-macro-panel';
                    if (app.Core.Windows) {
                        app.Core.Windows.toggle(id);
                    } else {
                        w.style.display = 'none';
                    }
                };
            }

            // ── Advanced Mode Toggle ──
            const advToggle = w.querySelector('#sn-macro-advanced-toggle');
            if (advToggle) {
                advToggle.onchange = () => {
                    self._advancedMode = advToggle.checked;
                    GM_setValue('sn_macro_advanced_mode', self._advancedMode);
                };
            }

            // ── Default Macro Toggle ──
            const defToggle = w.querySelector('#sn-macro-default-toggle');
            if (defToggle) {
                defToggle.onchange = () => {
                    if (defToggle.checked) {
                        const macros = self.getMacros();
                        const names = Object.keys(macros);
                        if (names.length === 1) {
                            self._defaultMacro = names[0];
                            GM_setValue('sn_default_macro', names[0]);
                        } else if (names.length > 1) {
                            const chosen = prompt('Set default macro name (Alt+M will auto-play this):\nAvailable: ' + names.join(', '), self._defaultMacro || names[0]);
                            if (chosen && names.includes(chosen)) {
                                self._defaultMacro = chosen;
                                GM_setValue('sn_default_macro', chosen);
                            } else {
                                defToggle.checked = false;
                                self._defaultMacro = null;
                                GM_setValue('sn_default_macro', null);
                            }
                        } else {
                            defToggle.checked = false;
                        }
                    } else {
                        self._defaultMacro = null;
                        GM_setValue('sn_default_macro', null);
                    }
                    self.render(w);
                };
            }

            // ── Saved Macros ──
            w.querySelectorAll('.sn-macro-play').forEach(btn => {
                btn.onclick = async (e) => {
                    e.stopPropagation();
                    const name = decodeURIComponent(btn.dataset.macro);
                    btn.disabled = true;
                    btn.textContent = '⏳';
                    await self.playMacro(name);
                    btn.disabled = false;
                    btn.textContent = '▶';
                };
            });

            w.querySelectorAll('.sn-macro-edit').forEach(btn => {
                btn.onclick = (e) => {
                    e.stopPropagation();
                    const name = decodeURIComponent(btn.dataset.macro);
                    self._editSavedMacro(name, w);
                };
            });

            w.querySelectorAll('.sn-macro-delete').forEach(btn => {
                btn.onclick = (e) => {
                    e.stopPropagation();
                    const name = decodeURIComponent(btn.dataset.macro);
                    if (confirm(`Delete macro "${name}"?`)) {
                        if (self._defaultMacro === name) {
                            self._defaultMacro = null;
                            GM_setValue('sn_default_macro', null);
                        }
                        self.deleteMacro(name);
                        self.render(w);
                    }
                };
            });

            w.querySelectorAll('.sn-macro-default').forEach(btn => {
                btn.onclick = (e) => {
                    e.stopPropagation();
                    const name = decodeURIComponent(btn.dataset.macro);
                    if (self._defaultMacro === name) {
                        self._defaultMacro = null;
                        GM_setValue('sn_default_macro', null);
                    } else {
                        self._defaultMacro = name;
                        GM_setValue('sn_default_macro', name);
                    }
                    self.render(w);
                };
            });

            // ── BUILD VIEW ──
            const pickBtn = w.querySelector('#sn-builder-pick-btn');
            if (pickBtn) {
                pickBtn.onclick = () => {
                    if (self._elementPickerActive) {
                        self.stopElementPicker();
                        self.render(w);
                    } else {
                        self.startElementPicker(w);
                    }
                };
            }

            const addWaitBtn = w.querySelector('#sn-builder-add-wait');
            if (addWaitBtn) {
                addWaitBtn.onclick = () => {
                    const ms = prompt('Wait duration in ms:', '1000');
                    if (ms && !isNaN(ms) && parseInt(ms) > 0) {
                        self._builderSteps.push({
                            type: 'wait',
                            ms: parseInt(ms),
                            waitAfter: parseInt(ms),
                            selectors: null
                        });
                        self.render(w);
                    }
                };
            }

            w.querySelectorAll('.sn-builder-move').forEach(btn => {
                btn.onclick = (e) => {
                    e.stopPropagation();
                    const idx = parseInt(btn.dataset.index);
                    const dir = parseInt(btn.dataset.dir);
                    const newIdx = idx + dir;
                    if (newIdx < 0 || newIdx >= self._builderSteps.length) return;
                    [self._builderSteps[idx], self._builderSteps[newIdx]] = [self._builderSteps[newIdx], self._builderSteps[idx]];
                    self.render(w);
                };
            });

            w.querySelectorAll('.sn-builder-edit').forEach(btn => {
                btn.onclick = (e) => {
                    e.stopPropagation();
                    const idx = parseInt(btn.dataset.index);
                    self._editBuilderStep(idx, w);
                };
            });

            w.querySelectorAll('.sn-builder-delete').forEach(btn => {
                btn.onclick = (e) => {
                    e.stopPropagation();
                    const idx = parseInt(btn.dataset.index);
                    if (confirm(`Delete step ${idx + 1}?`)) {
                        self._builderSteps.splice(idx, 1);
                        self.render(w);
                    }
                };
            });

            const playBtn = w.querySelector('#sn-builder-play');
            if (playBtn) {
                playBtn.onclick = async () => {
                    if (self._builderSteps.length === 0) return;
                    playBtn.disabled = true;
                    playBtn.textContent = '⏳ Playing...';
                    await self.executeSteps(self._builderSteps, 'Build preview');
                    playBtn.disabled = false;
                    playBtn.textContent = '▶ Play Steps';
                };
            }

            const clearBtn = w.querySelector('#sn-builder-clear');
            if (clearBtn) {
                clearBtn.onclick = () => {
                    if (self._builderSteps.length === 0) return;
                    if (confirm('Clear all steps?')) {
                        self._builderSteps = [];
                        self.render(w);
                    }
                };
            }

            const saveBtn = w.querySelector('#sn-builder-save');
            if (saveBtn) {
                saveBtn.onclick = () => {
                    if (self._builderSteps.length === 0) return;
                    const name = prompt('Name this macro:', '');
                    if (name && name.trim()) {
                        self.saveMacro(name.trim(), [...self._builderSteps]);
                        self._builderSteps = [];
                        self.render(w);
                    }
                };
            }
        },

        // ══════════════════════════════════════════════
        //  SELECTOR BUILDERS
        // ══════════════════════════════════════════════

        /**
         * Extracts all stable selectors from a DOM element.
         * These are HTML attributes that survive layout changes, window resizing,
         * and zoom level changes.
         * @param {Element} el - The DOM element to extract selectors from.
         * @returns {Object} Selector map with null values for missing attributes.
         */
        _buildSelectors(el) {
            if (!el) return {};
            const text = (el.textContent || '').trim().substring(0, 80);

            // Try to find the closest interactive/meaningful ancestor if el is 
            // a deeply nested text node or generic element
            let target = el;
            if (!el.hasAttribute('aria-label') && !el.hasAttribute('title') &&
                !el.hasAttribute('data-target-selection-name') && !el.hasAttribute('name') &&
                el.tagName !== 'BUTTON' && el.tagName !== 'A' && el.tagName !== 'INPUT' &&
                el.tagName !== 'SELECT' && el.tagName !== 'TEXTAREA' &&
                el.getAttribute('role') !== 'option' && el.getAttribute('role') !== 'button') {
                target = el.closest('button, a, [role="button"], [role="option"], [role="tab"], ' +
                    'input, select, textarea, [data-target-selection-name]') || el;
            }

            // For combobox items, also capture the text value that was selected
            let selectedValue = null;
            if (target.getAttribute('role') === 'option' || target.closest('[role="option"], lightning-base-combobox-item')) {
                selectedValue = text;
            }

            const selectors = {
                ariaLabel: target.getAttribute('aria-label'),
                title: target.getAttribute('title'),
                dataTarget: target.getAttribute('data-target-selection-name'),
                role: target.getAttribute('role'),
                innerText: text,
                name: target.getAttribute('name'),
                placeholder: target.getAttribute('placeholder'),
                value: target.getAttribute('value'),
                selectedValue: selectedValue,
                // data-key is stable in Lightning combobox items
                dataKey: target.getAttribute('data-key') || target.getAttribute('data-value'),
                // For buttons with icon, capture the icon's data attribute
                iconName: target.querySelector('lightning-icon')?.getAttribute('icon-name') || null,
                // Element identity for precision matching
                tagName: (target.tagName || '').toLowerCase(),
                // aria-required — stable boolean that distinguishes required vs optional fields
                ariaRequired: target.getAttribute('aria-required'),
                // Field label text from the parent layout item (e.g. "Search People")
                fieldLabel: this._extractFieldLabel(target),
                // CSS path — unique positional identifier as fallback
                cssPath: this._buildUniqueCSSPath(target)
            };

            // Validate uniqueness — if the best attribute matches multiple elements,
            // include a note (shown during playback for diagnostics)
            const matchCount = this._validateSelectorsUniqueness(selectors, target);
            selectors._matchCount = matchCount;

            return selectors;
        },

        /**
         * Generates a unique CSS selector path for an element.
         * Walks up the DOM tree building a path like:
         *   records-record-layout-item:nth-child(3) .slds-form-element:nth-child(2) button[title="Save"]
         * This provides a reliable positional identifier when stable attributes
         * aren't unique enough.
         * @param {Element} el - The element to build a path for.
         * @param {number} [maxDepth=5] - Maximum ancestor depth to traverse.
         * @returns {string} CSS selector path, or empty string if el is null.
         */
        _buildUniqueCSSPath(el, maxDepth = 15) {
            if (!el || el === document.body || el === document.documentElement) return '';
            const parts = [];
            let current = el;
            let depth = 0;

            while (current && current !== document.body && current !== document.documentElement && depth < maxDepth) {
                const tag = (current.tagName || '').toLowerCase();
                if (!tag) break;

                // Use ID if available — but skip dynamic Salesforce input IDs
                if (current.id && !current.id.includes('input-')) {
                    parts.unshift(`#${CSS.escape(current.id)}`);
                    break;
                }

                let selector = tag;
                const parent = current.parentElement;

                if (parent) {
                    const siblings = Array.from(parent.children).filter(s =>
                        (s.tagName || '').toLowerCase() === tag
                    );
                    if (siblings.length > 1) {
                        const index = siblings.indexOf(current) + 1;
                        selector += `:nth-of-type(${index})`;
                    }
                }

                // Add stable attributes — prefer Salesforce-specific ones
                if (current.getAttribute('data-target-selection-name')) {
                    selector += `[data-target-selection-name="${CSS.escape(current.getAttribute('data-target-selection-name'))}"]`;
                } else if (current.getAttribute('name')) {
                    selector += `[name="${CSS.escape(current.getAttribute('name'))}"]`;
                }

                parts.unshift(selector);

                // Stop early at major Salesforce structural boundaries
                if (tag === 'records-record-layout-item' || tag === 'flexipage-component2') {
                    break;
                }

                current = current.parentElement;
                depth++;
            }

            return parts.join(' > ');
        },

        /**
         * Validates whether the recorded selectors uniquely identify the element.
         * If not unique, logs a warning and returns the ambiguous matches count.
         * @param {Object} selectors - The selector map from _buildSelectors().
         * @param {Element} el - The original element that was clicked.
         * @returns {number} Number of DOM elements matched. 1 = unique, >1 = ambiguous.
         */
        _validateSelectorsUniqueness(selectors, el) {
            if (!selectors || !el) return 0;

            // Use the best attribute to find candidates
            let candidates = [];

            // aria-label is usually most reliable
            if (selectors.ariaLabel) {
                candidates = Array.from(document.querySelectorAll(
                    `[aria-label="${CSS.escape(selectors.ariaLabel)}"]`
                ));
            }

            // If aria-label isn't unique, try title
            if (candidates.length !== 1 && selectors.title) {
                candidates = Array.from(document.querySelectorAll(
                    `[title="${CSS.escape(selectors.title)}"]`
                ));
            }

            // If still not unique, try data-target (Salesforce-specific)
            if (candidates.length !== 1 && selectors.dataTarget) {
                candidates = Array.from(document.querySelectorAll(
                    `[data-target-selection-name="${CSS.escape(selectors.dataTarget)}"]`
                ));
            }

            const count = candidates.length;
            if (count > 1) {
                console.warn(`[MacroRecorder] Selector ambiguity: "${selectors.ariaLabel || selectors.title || selectors.dataTarget}" matches ${count} elements. Including CSS path for disambiguation.`);
            }
            return count;
        },

        /**
         * Scores a candidate element against recorded selectors.
         * Each matching attribute adds to the score, with more unique
         * attributes weighted higher.
         * @param {Object} selectors - The recorded selector map.
         * @param {Element} candidate - The DOM element to score.
         * @returns {number} Match score (higher = better match).
         */
        _scoreElement(selectors, candidate) {
            if (!selectors || !candidate) return 0;
            let score = 0;

            // Salesforce Gold Standard: data-target-selection-name (Weight: 100, up from 85)
            if (selectors.dataTarget && candidate.getAttribute('data-target-selection-name') === selectors.dataTarget) {
                score += 100;
            }

            // Salesforce Silver Standard: name (Weight: 95, up from 70)
            if (selectors.name && candidate.getAttribute('name') === selectors.name) {
                score += 95;
            }

            // aria-label match (Weight: 80, down from 100 — less reliable in SF)
            if (selectors.ariaLabel && candidate.getAttribute('aria-label') === selectors.ariaLabel) {
                score += 80;
            }

            // title match (Weight: 70, down from 90 — titles like "Edit" are everywhere)
            if (selectors.title && candidate.getAttribute('title') === selectors.title) {
                score += 70;
            }

            // Role match (weight: 40)
            if (selectors.role && candidate.getAttribute('role') === selectors.role) {
                score += 40;
            }

            // Inner text match (weight: 50)
            if (selectors.innerText) {
                const candText = (candidate.textContent || '').trim().substring(0, 80);
                if (candText === selectors.innerText) {
                    score += 50;
                } else if (candText.includes(selectors.innerText) || selectors.innerText.includes(candText)) {
                    score += 25; // partial match
                }
            }

            // Placeholder match (weight: 60)
            if (selectors.placeholder && candidate.getAttribute('placeholder') === selectors.placeholder) {
                score += 60;
            }

            // data-key match (weight: 75)
            const candKey = candidate.getAttribute('data-key') || candidate.getAttribute('data-value');
            if (selectors.dataKey && candKey === selectors.dataKey) {
                score += 75;
            }

            // TagName match (weight: 30)
            if (selectors.tagName && (candidate.tagName || '').toLowerCase() === selectors.tagName) {
                score += 30;
            }

            // Selected value match (weight: 45)
            if (selectors.selectedValue) {
                const candText = (candidate.textContent || '').trim();
                if (candText === selectors.selectedValue) {
                    score += 45;
                }
            }

            // aria-required match (weight: 55) — distinguishes required vs optional lookup fields
            if (selectors.ariaRequired && candidate.getAttribute('aria-required') === selectors.ariaRequired) {
                score += 55;
            }

            // Field label match (weight: 65) — text label from parent layout item
            if (selectors.fieldLabel) {
                const candLabel = this._extractFieldLabel(candidate);
                if (candLabel === selectors.fieldLabel) {
                    score += 65;
                } else if (candLabel && selectors.fieldLabel &&
                    (candLabel.includes(selectors.fieldLabel) || selectors.fieldLabel.includes(candLabel))) {
                    score += 30; // partial match
                }
            }

            // CSS path suffix match — bonus if the element's CSS path ends
            // with a portion of the recorded path (handles dynamic parent indices)
            if (selectors.cssPath) {
                const candPath = this._buildUniqueCSSPath(candidate, 3);
                if (candPath && selectors.cssPath.endsWith(candPath)) {
                    score += 30; // increased from 20 for stronger tiebreaking
                }
            }

            // iconName match (weight: 35)
            if (selectors.iconName) {
                const candIcon = candidate.querySelector('lightning-icon')?.getAttribute('icon-name') || null;
                if (candIcon === selectors.iconName) {
                    score += 35;
                }
            }

            return score;
        },

        /**
         * Finds the best-matching element for recorded selectors using
         * scored multi-attribute matching. Collects ALL candidates that
         * match ANY selector attribute, then returns the one with the
         * highest combined score.
         * @param {Object} selectors - The recorded selector map.
         * @returns {Element|null} The best-matching element, or null.
         */
        _findBestMatch(selectors) {
            if (!selectors || Object.keys(selectors).length === 0) return null;

            const candidateSet = new Set();
            const U = app.Core.Utils;

            const attrs = ['ariaLabel', 'title', 'dataTarget', 'name', 'placeholder', 'dataKey'];
            for (const attr of attrs) {
                if (selectors[attr]) {
                    const attrName = attr === 'ariaLabel' ? 'aria-label'
                        : attr === 'dataTarget' ? 'data-target-selection-name'
                        : attr;

                    // 1. Gather Light DOM matches
                    try {
                        const els = document.querySelectorAll(`[${attrName}="${CSS.escape(selectors[attr])}"]`);
                        els.forEach(el => candidateSet.add(el));
                    } catch (e) { /* skip bad selectors */ }

                    // 2. ALWAYS gather Shadow DOM matches alongside Light DOM
                    try {
                        const deepEl = U.queryDeep(`[${attrName}="${CSS.escape(selectors[attr])}"]`, document);
                        if (deepEl) candidateSet.add(deepEl);
                    } catch (e) { /* skip */ }
                }
            }

            // Also collect by role + innerText
            if (selectors.role && selectors.innerText) {
                try {
                    const els = document.querySelectorAll(`[role="${CSS.escape(selectors.role)}"]`);
                    els.forEach(el => {
                        const text = (el.textContent || '').trim();
                        if (text.includes(selectors.innerText) || selectors.innerText.includes(text)) {
                            candidateSet.add(el);
                        }
                    });
                } catch (e) { /* skip */ }
            }

            // If cssPath is available, also collect elements near that path
            if (selectors.cssPath) {
                try {
                    const el = document.querySelector(selectors.cssPath);
                    if (el) candidateSet.add(el);
                } catch (e) { /* skip invalid path */ }
            }

            if (candidateSet.size === 0) return null;

            // Score each candidate and return the best match
            let bestEl = null;
            let bestScore = -1;

            for (const candidate of candidateSet) {
                const score = this._scoreElement(selectors, candidate);
                if (score > bestScore) {
                    bestScore = score;
                    bestEl = candidate;
                }
            }

            return bestEl;
        },

        /**
         * Determines if an element looks like a "remove" or "clear" button.
         * These are the X buttons that clear a selected value from a field.
         * @param {Element} el - The element to check.
         * @returns {boolean}
         */
        _isRemoveButton(el) {
            const btn = el.closest('button, [role="button"]');
            if (!btn) return false;
            const title = (btn.getAttribute('title') || '').toLowerCase();
            const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
            const text = (btn.textContent || '').toLowerCase().trim();
            const innerHtml = (btn.innerHTML || '').toLowerCase();

            return (
                title.includes('remove') || title.includes('clear') || title.includes('delete') ||
                title.includes('deselect') || title === 'x' ||
                ariaLabel.includes('remove') || ariaLabel.includes('clear') ||
                ariaLabel.includes('delete') || ariaLabel.includes('deselect') ||
                text === '×' || text === 'x' || text === '✕' || text === '✖' ||
                innerHtml.includes('×') || innerHtml.includes('✕') ||
                // Salesforce specific: remove selected item button
                btn.matches('button.slds-button_icon[title*="Remove"]') ||
                btn.matches('button.slds-button_icon[title*="Clear"]') ||
                // Lightning combobox clear button
                (btn.getAttribute('aria-live') === 'assertive' && innerHtml.includes('x'))
            );
        },

        /**
         * Determines if an element is a Lightning combobox trigger button
         * (the button you click to open the dropdown).
         * @param {Element} el - The element to check.
         * @returns {boolean}
         */
        _isComboboxTrigger(el) {
            const btn = el.closest('button, [role="combobox"], [role="button"]');
            if (!btn) return false;
            const ariaControls = btn.getAttribute('aria-controls');
            const ariaHas = btn.getAttribute('aria-haspopup');
            const role = btn.getAttribute('role');
            return !!(
                (role === 'combobox') ||
                (ariaHas === 'listbox' || ariaHas === 'dialog' || ariaHas === 'true') ||
                (ariaControls && document.getElementById(ariaControls)?.querySelector('[role="listbox"], [role="option"]')) ||
                btn.closest('lightning-combobox, .slds-combobox')
            );
        },

        /**
         * Determines if an element is a selectable option in a combobox dropdown.
         * @param {Element} el - The element to check.
         * @returns {boolean}
         */
        _isComboboxOption(el) {
            const opt = el.closest('[role="option"], lightning-base-combobox-item');
            return !!opt;
        },

        /**
         * Determines if an element is a text input/textarea that can be cleared.
         * @param {Element} el - The element to check.
         * @returns {boolean}
         */
        _isTextInput(el) {
            const input = el.closest('input, textarea');
            if (!input) return false;
            const type = (input.getAttribute('type') || 'text').toLowerCase();
            return type === 'text' || type === 'date' || type === 'email' ||
                type === 'tel' || type === 'url' || type === 'number' ||
                type === 'search' || input.tagName === 'TEXTAREA';
        },

        /**
         * Checks if a text input has been cleared (was non-empty, now empty).
         * Uses a recorded baseline of the initial value.
         * @param {Element} input - The input element to check.
         * @param {string} previousValue - The value captured before the change.
         * @returns {boolean}
         */
        _wasCleared(input, previousValue) {
            return previousValue && previousValue.length > 0 && !input.value;
        },

        /**
         * Extracts the visible field label text from the parent Salesforce layout item.
         * For lookup fields like "Search People", this finds the label
         * in the parent records-record-layout-item so identical-looking
         * inputs can be distinguished.
         * @param {Element} el - The target element (or any child of the layout item).
         * @returns {string|null} The field label text, or null.
         */
        _extractFieldLabel(el) {
            if (!el) return null;

            // Walk up to the nearest records-record-layout-item
            const layoutItem = el.closest('records-record-layout-item, .slds-form-element');
            if (!layoutItem) return null;

            // Try Salesforce standard label span
            const labelSpan = layoutItem.querySelector(
                'span.slds-form-element__label, ' +
                'span[data-aura-class*="uiLabel"], ' +
                '.slds-form-element > label, ' +
                'records-field-label span, ' +
                'label span'
            );
            if (labelSpan) {
                const text = (labelSpan.textContent || '').trim();
                if (text) return text.substring(0, 80);
            }

            // Fallback: check for any label-like element
            const anyLabel = layoutItem.querySelector(
                '.label, [class*="label"], legend, ' +
                'dt, th'
            );
            if (anyLabel) {
                const text = (anyLabel.textContent || '').trim();
                if (text) return text.substring(0, 80);
            }

            // Last resort: use the layout item's own title or text content summary
            const title = layoutItem.getAttribute('title') || layoutItem.getAttribute('aria-label');
            if (title) return title;

            return null;
        },

        // ── Recording has been removed. Use the Build tab to create macros step by step. ──

        // ── Storage ──

        /**
         * Saves the current recording (or provided steps) as a named macro.
         * @param {string} name - The macro name.
         * @param {Array} [steps] - Steps to save. Defaults to current recording.
         * @param {string} [urlPattern] - URL pattern for auto-suggest (e.g. "kdlaw__Mail_Log__c").
         */
        saveMacro(name, steps, urlPattern) {
            if (!name || !name.trim()) return false;
            const allMacros = GM_getValue('sn_macros', {});
            
            // Extract URL pattern from current page if not provided
            const pattern = urlPattern || this._detectUrlPattern();
            
            allMacros[name.trim()] = {
                steps: steps || this._steps,
                urlPattern: pattern,
                created: Date.now(),
                updated: Date.now()
            };
            GM_setValue('sn_macros', allMacros);
            app.Core.Utils.showNotification(`✅ Macro "${name}" saved (${(steps || this._steps).length} steps)`, {
                type: 'success',
                duration: 3000
            });
            return true;
        },

        /**
         * Detects a URL pattern from the current Salesforce page.
         * Extracts the object API name from the URL.
         * @returns {string} The detected URL pattern, or empty string.
         */
        _detectUrlPattern() {
            const href = window.location.href;
            // Match Salesforce object URL like /kdlaw__Mail_Log__c/
            const objMatch = href.match(/\/([a-zA-Z0-9_]+__c)\/[a-zA-Z0-9]{15,18}/);
            if (objMatch) return objMatch[1];
            // Generic: match the path after .com/
            const pathMatch = href.match(/\.com\/([^?]+)/);
            return pathMatch ? pathMatch[1] : '';
        },

        /**
         * Retrieves all saved macros.
         * @returns {Object} { macroName: { steps, urlPattern, created, updated } }
         */
        getMacros() {
            return GM_getValue('sn_macros', {});
        },

        /**
         * Deletes a saved macro by name.
         * @param {string} name - The macro name to delete.
         */
        deleteMacro(name) {
            const allMacros = GM_getValue('sn_macros', {});
            if (allMacros[name]) {
                delete allMacros[name];
                GM_setValue('sn_macros', allMacros);
                app.Core.Utils.showNotification(`🗑️ Macro "${name}" deleted`, { type: 'info', duration: 2000 });
                return true;
            }
            return false;
        },

        /**
         * Gets a single macro by name.
         * @param {string} name - The macro name.
         * @returns {Object|null}
         */
        getMacro(name) {
            const allMacros = GM_getValue('sn_macros', {});
            return allMacros[name] || null;
        },

        // ── Playback ──

        /**
         * Plays a macro by name.
         * @param {string} name - The macro name to play.
         * @returns {Promise<Object>} Result with success, step counts, and any error.
         */
        async playMacro(name) {
            const macro = this.getMacro(name);
            if (!macro) {
                app.Core.Utils.showNotification(`❌ Macro "${name}" not found`, { type: 'error' });
                return { success: false, error: 'Macro not found' };
            }
            return this.executeSteps(macro.steps, name);
        },

        /**
         * Executes an array of steps sequentially.
         * @param {Array} steps - The steps to execute.
         * @param {string} [macroName] - Optional name for status messages.
         * @returns {Promise<Object>} Result summary.
         */
        async executeSteps(steps, macroName) {
            const U = app.Core.Utils;
            let completed = 0;
            let failed = 0;
            let lastError = null;

            // Show progress notification
            const statusMsg = macroName
                ? `▶️ Playing macro "${macroName}" (${steps.length} steps)...`
                : `▶️ Playing ${steps.length} step(s)...`;
            app.Core.Utils.showNotification(statusMsg, { type: 'info', duration: 5000 });

            for (let i = 0; i < steps.length; i++) {
                const step = steps[i];
                try {
                    const result = await this._executeStep(step, i);
                    if (result) completed++;
                    else {
                        failed++;
                        lastError = `Step ${i + 1} (${step.type}) returned no result`;
                    }
                } catch (err) {
                    failed++;
                    lastError = `Step ${i + 1} (${step.type}): ${err.message}`;
                    console.error(`[MacroRecorder] Step ${i + 1} failed:`, err);
                }
            }

            const total = steps.length;
            const msg = macroName
                ? `${failed === 0 ? '✅' : '⚠️'} Macro "${macroName}" done — ${completed}/${total} steps OK`
                : `${failed === 0 ? '✅' : '⚠️'} ${completed}/${total} steps OK`;
            app.Core.Utils.showNotification(msg, {
                type: failed === 0 ? 'success' : 'error',
                duration: 4000
            });

            return { success: failed === 0, completed, failed, total, error: lastError };
        },

        /**
         * Executes a single step.
         * @param {Object} step - The step to execute.
         * @param {number} index - Step index (for logging).
         * @returns {Promise<boolean>} True if the step succeeded.
         */
        async _executeStep(step, index) {
            const U = app.Core.Utils;

            switch (step.type) {
                case 'delay': {
                    await U.delay(step.ms || step.waitAfter || 1000);
                    return true;
                }

                case 'waitFor': {
                    const el = await U.waitForElement(
                        this._selectorsToCSS(step.selectors),
                        step.timeout || 5000
                    );
                    if (step.waitAfter) await U.delay(step.waitAfter);
                    return !!el;
                }

                case 'click': {
                    const el = await this._resolveElement(step.selectors, 5000);
                    if (!el) throw new Error(`Element not found for click`);
                    el.click();
                    if (step.waitAfter) await U.delay(step.waitAfter);
                    return true;
                }

                case 'select': {
                    // Step 1: Click the combobox trigger to open it
                    const trigger = await this._resolveElement(step.selectors, 5000);
                    if (!trigger) throw new Error(`Combobox trigger not found`);
                    trigger.click();
                    await U.delay(400);

                    // Step 2: Find and click the option with matching text
                    const listboxId = trigger.getAttribute('aria-controls');
                    let option = null;

                    if (listboxId) {
                        const listbox = document.getElementById(listboxId);
                        if (listbox) {
                            option = this._findOptionInElement(listbox, step.value);
                        }
                    }

                    // If aria-controls didn't work, search broadly
                    if (!option) {
                        // Look in shadow DOM for the dropdown
                        const dropdowns = document.querySelectorAll(
                            '[role="listbox"], [role="option"], lightning-base-combobox-item'
                        );
                        for (const dd of dropdowns) {
                            option = this._findOptionInElement(dd, step.value);
                            if (option) break;
                        }
                    }

                    // Last resort: global search
                    if (!option) {
                        option = this._findOptionGlobally(step.value);
                    }

                    if (!option) throw new Error(`Option "${step.value}" not found in dropdown`);

                    option.click();
                    if (step.waitAfter) await U.delay(step.waitAfter);
                    return true;
                }

                case 'remove': {
                    const el = await this._resolveElement(step.selectors, 5000);
                    if (!el) throw new Error(`Remove button not found`);
                    el.click();
                    if (step.waitAfter) await U.delay(step.waitAfter);
                    return true;
                }

                case 'clear': {
                    const el = await this._resolveElement(step.selectors, 5000);
                    if (!el) throw new Error(`Input field not found for clear`);

                    // Handle both the field container and the actual input
                    const input = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA'
                        ? el
                        : el.querySelector('input, textarea');

                    if (!input) throw new Error(`No input element found in field`);

                    // Clear the field
                    input.value = '';
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));

                    // For Lightning date fields, also try to find and click
                    // any visible clear button inside the same container
                    const container = el.closest('records-record-layout-item, .slds-form-element') || el;
                    const clearBtn = container.querySelector(
                        'button[title*="Clear"], button[title*="Remove"], ' +
                        'button.slds-button_icon[aria-live="assertive"]'
                    );
                    if (clearBtn) {
                        clearBtn.click();
                        await U.delay(100);
                    }

                    if (step.waitAfter) await U.delay(step.waitAfter);
                    return true;
                }

                default: {
                    console.warn(`[MacroRecorder] Unknown step type: ${step.type}`);
                    return false;
                }
            }
        },

        /**
         * Finds a dropdown option element by text content within a parent.
         * @param {Element} parent - The parent element to search within.
         * @param {string} value - The text to match.
         * @returns {Element|null}
         */
        _findOptionInElement(parent, value) {
            const items = parent.querySelectorAll(
                '[role="option"], lightning-base-combobox-item, li[role="option"]'
            );
            for (const item of items) {
                const text = (item.textContent || '').trim();
                if (text === value || text.includes(value) || value.includes(text)) {
                    return item;
                }
            }
            // Search through shadow DOM
            if (parent.shadowRoot) {
                return this._findOptionInElement(parent.shadowRoot, value);
            }
            return null;
        },

        /**
         * Global search for a dropdown option by text.
         * @param {string} value - The text to match.
         * @returns {Element|null}
         */
        _findOptionGlobally(value) {
            const all = document.querySelectorAll(
                '[role="option"], lightning-base-combobox-item'
            );
            for (const el of all) {
                const text = (el.textContent || '').trim();
                if (text === value || text.includes(value) || value.includes(text)) {
                    return el;
                }
            }
            return null;
        },

        /**
         * Resolves an element using scored multi-attribute matching.
         *
         * PRIMARY STRATEGY — Scored matching (_findBestMatch):
         *   Collects ALL elements matching ANY recorded attribute, then scores
         *   each against ALL recorded attributes. Returns the best overall match.
         *   This fixes the "wrong element" problem caused by OR-based first-match
         *   when multiple elements share the same aria-label/title.
         *
         * FALLBACK — CSS path + polling:
         *   If scored matching fails, tries the CSS path (positional identifier),
         *   then polls with the best available attribute selector.
         *
         * @param {Object} selectors - The selector map from _buildSelectors().
         * @param {number} timeout - Max wait time in ms.
         * @returns {Promise<Element|null>}
         */
        async _resolveElement(selectors, timeout) {
            const U = app.Core.Utils;

            if (!selectors || Object.keys(selectors).length === 0) return null;

            // ── PRIMARY: Scored multi-attribute matching ──
            const bestMatch = this._findBestMatch(selectors);
            if (bestMatch) return bestMatch;

            // ── FALLBACK 1: CSS path (positional identifier) ──
            if (selectors.cssPath) {
                try {
                    const el = document.querySelector(selectors.cssPath);
                    if (el) return el;
                } catch (e) { /* skip invalid path */ }
            }

            // ── FALLBACK 2: Shadow DOM piercing ──
            for (const attr of ['ariaLabel', 'title', 'dataTarget', 'name']) {
                if (selectors[attr]) {
                    const cssSel = attr === 'ariaLabel'
                        ? `[aria-label="${selectors[attr]}"]`
                        : attr === 'dataTarget'
                            ? `[data-target-selection-name="${selectors[attr]}"]`
                            : `[${attr}="${selectors[attr]}"]`;
                    try {
                        const el = U.queryDeep(cssSel, document);
                        if (el) return el;
                    } catch (e) { /* skip bad selectors */ }
                }
            }

            // ── FALLBACK 3: Poll with the best available CSS selector ──
            const bestSelector = selectors.cssPath || selectors.ariaLabel
                ? `[aria-label="${CSS.escape(selectors.ariaLabel)}"]`
                : selectors.title
                    ? `[title="${CSS.escape(selectors.title)}"]`
                    : selectors.dataTarget
                        ? `[data-target-selection-name="${CSS.escape(selectors.dataTarget)}"]`
                        : selectors.name
                            ? `[name="${CSS.escape(selectors.name)}"]`
                            : selectors.placeholder
                                ? `[placeholder="${CSS.escape(selectors.placeholder)}"]`
                                : null;

            if (bestSelector) {
                try {
                    return await U.waitForElement(bestSelector, timeout);
                } catch (e) {
                    return null;
                }
            }

            return null;
        },

        /**
         * Converts a selectors object to a CSS selector string (best effort).
         * Tries cssPath first (most precise), then falls back to attribute selectors.
         * @param {Object} selectors - The selector map.
         * @returns {string} Best CSS selector or empty string.
         */
        _selectorsToCSS(selectors) {
            if (!selectors) return '';
            // cssPath is the most precise positional identifier
            if (selectors.cssPath) return selectors.cssPath;
            return selectors.ariaLabel
                ? `[aria-label="${CSS.escape(selectors.ariaLabel)}"]`
                : selectors.title
                    ? `[title="${CSS.escape(selectors.title)}"]`
                    : selectors.dataTarget
                        ? `[data-target-selection-name="${CSS.escape(selectors.dataTarget)}"]`
                        : selectors.name
                            ? `[name="${CSS.escape(selectors.name)}"]`
                            : selectors.placeholder
                                ? `[placeholder="${CSS.escape(selectors.placeholder)}"]`
                                : '';
        },

        // ── Step Summary ──

        /**
         * Returns a human-readable summary of the recorded steps.
         * @param {Array} [steps] - Steps to summarize. Defaults to current recording.
         * @returns {string} Summary text.
         */
        getStepsSummary(steps) {
            const s = steps || this._steps;
            if (!s || s.length === 0) return 'No steps recorded';

            const counts = {};
            s.forEach(step => {
                counts[step.type] = (counts[step.type] || 0) + 1;
            });

            const parts = Object.entries(counts).map(([type, count]) => {
                const icons = { click: '👆', select: '📋', remove: '🗑️', clear: '🧹', delay: '⏳', waitFor: '👀' };
                return `${icons[type] || '➡️'} ${count}× ${type}`;
            });

            return parts.join('  ');
        },

        // ══════════════════════════════════════════════
        //  MANUAL STEP BUILDER — Element Picker
        // ══════════════════════════════════════════════

        /**
         * Activates element picker mode. The user clicks any element on the page,
         * and a floating action chooser appears to select what kind of step to add.
         * @param {Element} panelEl - The panel DOM element (to re-render after picking).
         */
        startElementPicker(panelEl) {
            if (this._elementPickerActive) return;
            this._elementPickerActive = true;
            this._pickerPanelEl = panelEl;

            // Create a highlight overlay that follows the cursor
            const highlight = document.createElement('div');
            highlight.id = 'sn-builder-highlight';
            highlight.style.cssText = `
                position: fixed; pointer-events: none; z-index: 100000;
                border: 2px solid #43a047; background: rgba(67,160,71,0.12);
                border-radius: 4px; transition: all 0.08s ease;
                display: none;
            `;
            document.body.appendChild(highlight);
            this._pickerHighlight = highlight;

            // Track cursor to highlight element under it
            this._pickerMoveHandler = (e) => {
                const el = document.elementFromPoint(e.clientX, e.clientY);
                if (!el || el.closest('#sn-macro-panel, #sn-macro-trigger, #sn-builder-highlight, #sn-builder-action-chooser')) {
                    highlight.style.display = 'none';
                    return;
                }
                const target = el.closest('button, a, [role="button"], [role="option"], [role="tab"], ' +
                    'input, textarea, select, [data-target-selection-name], label, ' +
                    'records-record-layout-item, .slds-form-element') || el;
                const rect = target.getBoundingClientRect();
                highlight.style.display = 'block';
                highlight.style.left = rect.left + 'px';
                highlight.style.top = rect.top + 'px';
                highlight.style.width = rect.width + 'px';
                highlight.style.height = rect.height + 'px';
                highlight.dataset.targetId = target.id || '';
            };
            document.addEventListener('mousemove', this._pickerMoveHandler);

            // Click handler — captures the clicked element and shows action chooser
            this._pickerClickHandler = (e) => {
                if (!this._elementPickerActive) return;
                const el = e.target;
                // Ignore clicks on our own UI
                if (el.closest('#sn-macro-panel, #sn-macro-trigger, #sn-builder-highlight, #sn-builder-action-chooser')) return;

                e.preventDefault();
                e.stopPropagation();

                const target = el.closest('button, a, [role="button"], [role="option"], [role="tab"], ' +
                    'input, textarea, select, [data-target-selection-name], label, ' +
                    'records-record-layout-item, .slds-form-element') || el;

                // Build selectors for the picked element
                const selectors = this._buildSelectors(target);
                const rect = target.getBoundingClientRect();

                // Show action chooser near the element
                this._showActionChooser(selectors, rect, target);
            };
            // Use capture + immediate stop to prevent Salesforce from processing
            document.addEventListener('click', this._pickerClickHandler, true);

            // Update the panel UI
            if (panelEl) this.render(panelEl);
        },

        /**
         * Deactivates element picker mode and removes all picker UI.
         */
        stopElementPicker() {
            this._elementPickerActive = false;
            if (this._pickerClickHandler) {
                document.removeEventListener('click', this._pickerClickHandler, true);
                this._pickerClickHandler = null;
            }
            if (this._pickerMoveHandler) {
                document.removeEventListener('mousemove', this._pickerMoveHandler);
                this._pickerMoveHandler = null;
            }
            if (this._pickerHighlight) {
                this._pickerHighlight.remove();
                this._pickerHighlight = null;
            }
            // Remove action chooser if open
            const chooser = document.getElementById('sn-builder-action-chooser');
            if (chooser) chooser.remove();
            if (this._pickerPanelEl) {
                document.body.style.cursor = '';
                this.render(this._pickerPanelEl);
            }
        },

        /**
         * Shows a floating action chooser popup near the picked element.
         * The user selects what action to perform on this element.
         * @param {Object} selectors - The selector map of the picked element.
         * @param {DOMRect} rect - Bounding rect of the element (for positioning).
         * @param {Element} target - The picked DOM element.
         */
        _showActionChooser(selectors, rect, target) {
            // Remove any existing chooser
            const oldChooser = document.getElementById('sn-builder-action-chooser');
            if (oldChooser) oldChooser.remove();

            // Determine if the element is an input-like element
            const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' ||
                target.querySelector('input, textarea') !== null;
            const isComboboxItem = target.getAttribute('role') === 'option' ||
                target.closest('[role="option"], lightning-base-combobox-item') !== null;
            const isRemoveBtn = this._isRemoveButton(target);

            const chooser = document.createElement('div');
            chooser.id = 'sn-builder-action-chooser';
            chooser.style.cssText = `
                position: fixed; z-index: 100010;
                background: white; border-radius: 12px;
                box-shadow: 0 8px 32px rgba(0,0,0,0.2);
                border: 1px solid #e0e0e0;
                padding: 12px; min-width: 200px;
                font-family: system-ui, -apple-system, sans-serif;
            `;

            // Position near the element
            const viewportW = window.innerWidth;
            const viewportH = window.innerHeight;
            let left = rect.right + 10;
            let top = rect.top;

            // If chooser would go off right edge, show on left side
            if (left + 220 > viewportW) {
                left = Math.max(5, rect.left - 210);
            }
            // If chooser would go off bottom, shift up
            if (top + 280 > viewportH) {
                top = Math.max(5, viewportH - 290);
            }

            chooser.style.left = left + 'px';
            chooser.style.top = top + 'px';

            // Build target label for display
            const targetLabel = selectors.ariaLabel || selectors.title || selectors.name ||
                selectors.placeholder || selectors.innerText || target.tagName;
            const showAdvanced = this._advancedMode;
            const outerHtml = showAdvanced ? (target.outerHTML || '').substring(0, 300) : '';
            const cssPath = selectors.cssPath || '';

            chooser.innerHTML = `
                <div style="font-size:12px; font-weight:bold; color:#333; margin-bottom:8px; display:flex; align-items:center; gap:6px;">
                    <span style="background:#43a047; color:white; border-radius:50%; width:20px; height:20px; display:flex; align-items:center; justify-content:center; font-size:11px;">✓</span>
                    Element selected
                    <span style="margin-left:auto; cursor:pointer; color:#999; font-size:14px;" id="sn-chooser-close">✕</span>
                </div>
                <div style="font-size:10px; color:#666; background:#f5f5f5; padding:4px 8px; border-radius:4px; margin-bottom:${showAdvanced ? '4' : '8'}px; word-break:break-all; max-height:32px; overflow:hidden;">
                    ${targetLabel.substring(0, 50)}
                </div>
                ${showAdvanced ? `
                <div style="margin-bottom:6px;">
                    <div style="font-size:10px; font-weight:bold; color:#888; margin-bottom:2px;">CSS Path:</div>
                    <div style="font-size:9px; color:#555; background:#f0f0f0; padding:3px 6px; border-radius:4px; word-break:break-all; max-height:40px; overflow-y:auto; font-family:monospace;">${cssPath.substring(0, 200) || 'N/A'}</div>
                </div>
                <div style="margin-bottom:6px;">
                    <div style="font-size:10px; font-weight:bold; color:#888; margin-bottom:2px;">HTML (outer):</div>
                    <div style="font-size:9px; color:#555; background:#f0f0f0; padding:3px 6px; border-radius:4px; word-break:break-all; max-height:60px; overflow-y:auto; font-family:monospace;">${outerHtml || 'N/A'}</div>
                </div>
                ` : ''}
                <div style="font-size:11px; color:#888; margin-bottom:6px;">Choose action:</div>
                <div style="display:flex; flex-direction:column; gap:4px;">
                    <button class="sn-chooser-action" data-action="click" style="display:flex; align-items:center; gap:8px; padding:8px 10px; border:1px solid #eee; border-radius:6px; background:white; cursor:pointer; font-size:12px; text-align:left; transition:background 0.15s;">
                        <span style="font-size:16px;">👆</span>
                        <div><div style="font-weight:600; color:#333;">Click</div><div style="font-size:10px; color:#999;">Click this element</div></div>
                    </button>
                    ${isComboboxItem || selectors.role === 'option' || selectors.selectedValue ? `
                    <button class="sn-chooser-action" data-action="select" data-value="${CSS.escape(selectors.innerText || selectors.selectedValue || '')}" style="display:flex; align-items:center; gap:8px; padding:8px 10px; border:1px solid #eee; border-radius:6px; background:white; cursor:pointer; font-size:12px; text-align:left; transition:background 0.15s;">
                        <span style="font-size:16px;">📋</span>
                        <div><div style="font-weight:600; color:#333;">Select value</div><div style="font-size:10px; color:#999;">${(selectors.innerText || selectors.selectedValue || '').substring(0, 30)}</div></div>
                    </button>
                    ` : `
                    <button class="sn-chooser-action" data-action="select" style="display:flex; align-items:center; gap:8px; padding:8px 10px; border:1px solid #eee; border-radius:6px; background:white; cursor:pointer; font-size:12px; text-align:left; transition:background 0.15s;">
                        <span style="font-size:16px;">📋</span>
                        <div><div style="font-weight:600; color:#333;">Select</div><div style="font-size:10px; color:#999;">Combobox selection — type the value</div></div>
                    </button>
                    `}
                    ${isInput ? `
                    <button class="sn-chooser-action" data-action="clear" style="display:flex; align-items:center; gap:8px; padding:8px 10px; border:1px solid #eee; border-radius:6px; background:white; cursor:pointer; font-size:12px; text-align:left; transition:background 0.15s;">
                        <span style="font-size:16px;">🧹</span>
                        <div><div style="font-weight:600; color:#333;">Clear</div><div style="font-size:10px; color:#999;">Clear text/date field value</div></div>
                    </button>
                    ` : ''}
                    ${isRemoveBtn || selectors.title?.toLowerCase().includes('remove') || selectors.title?.toLowerCase().includes('clear') ? `
                    <button class="sn-chooser-action" data-action="remove" style="display:flex; align-items:center; gap:8px; padding:8px 10px; border:1px solid #eee; border-radius:6px; background:white; cursor:pointer; font-size:12px; text-align:left; transition:background 0.15s;">
                        <span style="font-size:16px;">🗑️</span>
                        <div><div style="font-weight:600; color:#333;">Remove</div><div style="font-size:10px; color:#999;">Remove/clear selected item</div></div>
                    </button>
                    ` : ''}
                </div>
                <button id="sn-chooser-cancel" style="width:100%; margin-top:8px; padding:6px; background:#f5f5f5; border:1px solid #eee; border-radius:6px; cursor:pointer; font-size:11px; color:#888;">Cancel</button>
            `;

            document.body.appendChild(chooser);

            // Bind action buttons
            chooser.querySelectorAll('.sn-chooser-action').forEach(btn => {
                btn.onclick = () => {
                    const action = btn.dataset.action;
                    this._handleChosenAction(action, selectors, btn.dataset.value);
                    chooser.remove();
                };
            });

            const closeBtn = chooser.querySelector('#sn-chooser-close');
            if (closeBtn) closeBtn.onclick = () => chooser.remove();

            const cancelBtn = chooser.querySelector('#sn-chooser-cancel');
            if (cancelBtn) cancelBtn.onclick = () => chooser.remove();
        },

        /**
         * Handles the user's action choice from the action chooser.
         * For 'select' without a value, prompts for the value.
         * For any action, adds the step to _builderSteps.
         * @param {string} action - The chosen action type.
         * @param {Object} selectors - The selector map.
         * @param {string} [value] - Optional pre-filled value (for select).
         */
        _handleChosenAction(action, selectors, value) {
            const step = { type: action, selectors: selectors, waitAfter: 500 };

            if (action === 'select') {
                // Prompt for the value if not already provided
                const val = value || prompt('Enter the value to select:', '');
                if (!val) return; // User cancelled
                step.value = val;
            }

            if (action === 'wait') {
                const ms = parseInt(prompt('Wait duration in ms:', '1000'));
                if (isNaN(ms) || ms <= 0) return;
                step.ms = ms;
                step.waitAfter = ms;
                delete step.selectors;
            }

            this._builderSteps.push(step);
            this.stopElementPicker();
        },

        /**
         * Opens an inline editor for a builder step (inside the panel).
         * Lets the user change the action type, selectors description, or value/ms.
         * @param {number} index - The step index to edit.
         * @param {Element} panelEl - The panel element (to re-render after edit).
         */
        _editBuilderStep(index, panelEl) {
            const step = this._builderSteps[index];
            if (!step) return;

            const typeLabels = { click: 'Click', select: 'Select', remove: 'Remove', clear: 'Clear', wait: 'Wait' };

            // Build a simple inline edit form
            const body = panelEl.querySelector('#sn-macro-body');
            if (!body) return;

            // Save current steps state
            const steps = this._builderSteps;

            // Show edit form
            body.innerHTML = `
                <div style="font-size:12px; font-weight:bold; color:#333; margin-bottom:8px;">✏️ Edit Step ${index + 1}</div>
                <div style="display:flex; flex-direction:column; gap:8px;">
                    <div>
                        <label style="font-size:10px; color:#888; display:block; margin-bottom:2px;">Action Type</label>
                        <select id="sn-edit-type" style="width:100%; padding:6px 8px; border:1px solid #ddd; border-radius:6px; font-size:12px;">
                            ${Object.entries(typeLabels).map(([key, label]) =>
                                `<option value="${key}" ${step.type === key ? 'selected' : ''}>${label}</option>`
                            ).join('')}
                        </select>
                    </div>
                    <div>
                        <label style="font-size:10px; color:#888; display:block; margin-bottom:2px;">Target Label (for display only)</label>
                        <input id="sn-edit-label" type="text" value="${(step.selectors ? (step.selectors.ariaLabel || step.selectors.title || step.selectors.name || step.selectors.innerText || '') : '') || step.value || step.ms + 'ms'}" style="width:100%; padding:6px 8px; border:1px solid #ddd; border-radius:6px; font-size:12px; box-sizing:border-box;" placeholder="Description of target">
                    </div>
                    <div id="sn-edit-value-group" style="${step.type === 'select' || step.type === 'wait' ? '' : 'display:none;'}">
                        <label id="sn-edit-value-label" style="font-size:10px; color:#888; display:block; margin-bottom:2px;">
                            ${step.type === 'select' ? 'Value to select' : step.type === 'wait' ? 'Duration (ms)' : 'Value'}
                        </label>
                        <input id="sn-edit-value" type="text" value="${step.type === 'select' ? (step.value || '') : step.type === 'wait' ? (step.ms || '1000') : ''}" style="width:100%; padding:6px 8px; border:1px solid #ddd; border-radius:6px; font-size:12px; box-sizing:border-box;">
                    </div>
                    <div>
                        <label style="font-size:10px; color:#888; display:block; margin-bottom:2px;">Wait after step (ms)</label>
                        <input id="sn-edit-wait" type="number" value="${step.waitAfter || 500}" min="0" step="100" style="width:100%; padding:6px 8px; border:1px solid #ddd; border-radius:6px; font-size:12px; box-sizing:border-box;">
                    </div>
                    <div style="display:flex; gap:6px;">
                        <button id="sn-edit-save" style="flex:1; padding:8px; background:#1976d2; color:white; border:none; border-radius:6px; font-weight:bold; cursor:pointer; font-size:12px;">💾 Save</button>
                        <button id="sn-edit-cancel" style="flex:1; padding:8px; background:#f5f5f5; color:#888; border:1px solid #ddd; border-radius:6px; cursor:pointer; font-size:12px;">Cancel</button>
                    </div>
                </div>
            `;

            // Toggle value field visibility when type changes
            const typeSelect = body.querySelector('#sn-edit-type');
            const valueGroup = body.querySelector('#sn-edit-value-group');
            const valueLabel = body.querySelector('#sn-edit-value-label');
            const valueInput = body.querySelector('#sn-edit-value');
            if (typeSelect) {
                typeSelect.onchange = () => {
                    const newType = typeSelect.value;
                    valueGroup.style.display = (newType === 'select' || newType === 'wait') ? '' : 'none';
                    valueLabel.textContent = newType === 'select' ? 'Value to select' : newType === 'wait' ? 'Duration (ms)' : 'Value';
                    valueInput.value = newType === 'wait' ? '1000' : '';
                };
            }

            // Save
            const saveBtn = body.querySelector('#sn-edit-save');
            if (saveBtn) {
                saveBtn.onclick = () => {
                    const newType = typeSelect.value;
                    const newWait = parseInt(body.querySelector('#sn-edit-wait')?.value) || 500;

                    // Update the step
                    this._builderSteps[index].type = newType;
                    this._builderSteps[index].waitAfter = newWait;

                    if (newType === 'select') {
                        this._builderSteps[index].value = valueInput?.value || '';
                    } else if (newType === 'wait') {
                        const ms = parseInt(valueInput?.value) || 1000;
                        this._builderSteps[index].ms = ms;
                        this._builderSteps[index].waitAfter = ms;
                        delete this._builderSteps[index].selectors;
                    } else {
                        delete this._builderSteps[index].value;
                        delete this._builderSteps[index].ms;
                    }

                    this.render(panelEl);
                };
            }

            // Cancel
            const cancelBtn = body.querySelector('#sn-edit-cancel');
            if (cancelBtn) {
                cancelBtn.onclick = () => {
                    this.render(panelEl);
                };
            }
        },

        // ══════════════════════════════════════════════
        //  SAVED MACRO EDITOR
        // ══════════════════════════════════════════════

        /**
         * Opens the saved macro editor for an existing macro.
         * Shows all steps with reorder/edit/delete controls, lets you change
         * the macro name, and saves changes back to storage.
         * @param {string} name - The macro name to edit.
         * @param {Element} panelEl - The panel element (to re-render after).
         */
        _editSavedMacro(name, panelEl) {
            const macro = this.getMacro(name);
            if (!macro) {
                app.Core.Utils.showNotification(`❌ Macro "${name}" not found`, { type: 'error' });
                return;
            }

            const body = panelEl.querySelector('#sn-macro-body');
            if (!body) return;

            // Local copy of steps for editing
            const workingSteps = JSON.parse(JSON.stringify(macro.steps || []));
            const icons = { click: '👆', select: '📋', remove: '🗑️', clear: '🧹', wait: '⏳' };
            const typeLabels = { click: 'Click', select: 'Select', remove: 'Remove', clear: 'Clear', wait: 'Wait' };
            const self = this;

            function renderEditor() {
                body.innerHTML = `
                    <div style="font-size:12px; font-weight:bold; color:#333; margin-bottom:8px; display:flex; align-items:center; gap:6px;">
                        <span>✏️ Edit Macro</span>
                        <span style="font-size:10px; color:#999; font-weight:normal;">${name}</span>
                    </div>
                    <div style="display:flex; flex-direction:column; gap:8px;">
                        <div>
                            <label style="font-size:10px; color:#888; display:block; margin-bottom:2px;">Macro Name</label>
                            <input id="sn-edit-macro-name" type="text" value="${name.replace(/"/g, '&quot;')}" style="width:100%; padding:6px 8px; border:1px solid #ddd; border-radius:6px; font-size:12px; box-sizing:border-box;">
                        </div>
                        <div style="font-size:10px; color:#888; display:flex; justify-content:space-between; align-items:center;">
                            <span>Steps (${workingSteps.length})</span>
                            <span style="font-size:10px; color:#999;">↑↓ reorder · ✏️ edit · ✕ delete</span>
                        </div>
                        <div id="sn-edit-macro-steps" style="display:flex; flex-direction:column; gap:3px; max-height:280px; overflow-y:auto;">
                            ${workingSteps.length === 0
                                ? '<div style="font-size:11px; color:#aaa; text-align:center; padding:16px 0;">No steps — macro will be empty</div>'
                                : workingSteps.map((step, i) => {
                                    const targetLabel = step.selectors
                                        ? (step.selectors.ariaLabel || step.selectors.title || step.selectors.name || step.selectors.placeholder || step.selectors.innerText || 'element')
                                        : (step.value || step.ms + 'ms');
                                    const shortTarget = targetLabel.length > 28 ? targetLabel.substring(0, 28) + '…' : targetLabel;
                                    return `
                                        <div style="display:flex; align-items:center; gap:4px; padding:5px 8px; background:white; border:1px solid #eee; border-radius:6px; font-size:11px;">
                                            <span style="color:#999; font-weight:bold; min-width:18px;">${i + 1}.</span>
                                            <span title="${typeLabels[step.type] || step.type}">${icons[step.type] || '➡️'}</span>
                                            <span style="flex:1; color:#333; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${targetLabel.replace(/"/g, '&quot;')}">${shortTarget}</span>
                                            <div style="display:flex; gap:2px; flex-shrink:0;">
                                                <button class="sn-es-move" data-idx="${i}" data-dir="-1" style="background:none; border:none; cursor:pointer; font-size:11px; color:#999; padding:1px; ${i === 0 ? 'opacity:0.3;cursor:default;' : ''}">↑</button>
                                                <button class="sn-es-move" data-idx="${i}" data-dir="1" style="background:none; border:none; cursor:pointer; font-size:11px; color:#999; padding:1px; ${i === workingSteps.length - 1 ? 'opacity:0.3;cursor:default;' : ''}">↓</button>
                                                <button class="sn-es-edit" data-idx="${i}" style="background:none; border:none; cursor:pointer; font-size:11px; color:#999; padding:1px;" title="Edit step">✏️</button>
                                                <button class="sn-es-delete" data-idx="${i}" style="background:none; border:none; cursor:pointer; font-size:11px; color:#e53935; padding:1px;" title="Delete step">✕</button>
                                            </div>
                                        </div>
                                    `;
                                }).join('')
                            }
                        </div>
                        <div style="display:flex; gap:6px;">
                            <button id="sn-es-save" style="flex:1; padding:8px; background:#1976d2; color:white; border:none; border-radius:6px; font-weight:bold; cursor:pointer; font-size:12px;">💾 Save Changes</button>
                            <button id="sn-es-cancel" style="flex:1; padding:8px; background:#f5f5f5; color:#888; border:1px solid #ddd; border-radius:6px; cursor:pointer; font-size:12px;">Cancel</button>
                        </div>
                    </div>
                `;

                // ── Bind step events ──
                body.querySelectorAll('.sn-es-move').forEach(btn => {
                    btn.onclick = () => {
                        const idx = parseInt(btn.dataset.idx);
                        const dir = parseInt(btn.dataset.dir);
                        const newIdx = idx + dir;
                        if (newIdx < 0 || newIdx >= workingSteps.length) return;
                        [workingSteps[idx], workingSteps[newIdx]] = [workingSteps[newIdx], workingSteps[idx]];
                        renderEditor();
                    };
                });

                body.querySelectorAll('.sn-es-delete').forEach(btn => {
                    btn.onclick = () => {
                        const idx = parseInt(btn.dataset.idx);
                        if (confirm(`Delete step ${idx + 1}?`)) {
                            workingSteps.splice(idx, 1);
                            renderEditor();
                        }
                    };
                });

                body.querySelectorAll('.sn-es-edit').forEach(btn => {
                    btn.onclick = () => {
                        const idx = parseInt(btn.dataset.idx);
                        self._editSingleStep(workingSteps, idx, panelEl, () => renderEditor());
                    };
                });

                // ── Save ──
                const saveBtn = body.querySelector('#sn-es-save');
                if (saveBtn) {
                    saveBtn.onclick = () => {
                        const newName = body.querySelector('#sn-edit-macro-name')?.value?.trim();
                        if (!newName) {
                            app.Core.Utils.showNotification('❌ Macro name cannot be empty', { type: 'error' });
                            return;
                        }

                        // Update the macro in storage
                        const allMacros = GM_getValue('sn_macros', {});
                        if (!allMacros[name]) {
                            app.Core.Utils.showNotification('❌ Macro not found in storage', { type: 'error' });
                            return;
                        }

                        // If name changed, create new key and remove old one
                        if (newName !== name) {
                            allMacros[newName] = {
                                ...allMacros[name],
                                steps: workingSteps,
                                updated: Date.now()
                            };
                            delete allMacros[name];
                        } else {
                            allMacros[name].steps = workingSteps;
                            allMacros[name].updated = Date.now();
                        }

                        GM_setValue('sn_macros', allMacros);
                        app.Core.Utils.showNotification(`✅ Macro "${newName}" updated`, { type: 'success', duration: 2000 });
                        self.render(panelEl);
                    };
                }

                // ── Cancel ──
                const cancelBtn = body.querySelector('#sn-es-cancel');
                if (cancelBtn) {
                    cancelBtn.onclick = () => {
                        self.render(panelEl);
                    };
                }
            }

            renderEditor();
        },

        /**
         * Inline editor for a single step — reused by both builder and saved-macro editor.
         * Puts an edit form into the body area for the given step.
         * @param {Array} stepsArray - The array that contains the step (will be mutated).
         * @param {number} index - Index of the step to edit.
         * @param {Element} panelEl - Panel element (to re-render after save/cancel).
         * @param {Function} onSave - Callback to re-render the parent view.
         */
        _editSingleStep(stepsArray, index, panelEl, onSave) {
            const step = stepsArray[index];
            if (!step) return;

            const body = panelEl.querySelector('#sn-macro-body');
            if (!body) return;

            const typeLabels = { click: 'Click', select: 'Select', remove: 'Remove', clear: 'Clear', wait: 'Wait' };

            body.innerHTML = `
                <div style="font-size:12px; font-weight:bold; color:#333; margin-bottom:8px;">✏️ Edit Step ${index + 1}</div>
                <div style="display:flex; flex-direction:column; gap:8px;">
                    <div>
                        <label style="font-size:10px; color:#888; display:block; margin-bottom:2px;">Action Type</label>
                        <select id="sn-es-type" style="width:100%; padding:6px 8px; border:1px solid #ddd; border-radius:6px; font-size:12px;">
                            ${Object.entries(typeLabels).map(([key, label]) =>
                                `<option value="${key}" ${step.type === key ? 'selected' : ''}>${label}</option>`
                            ).join('')}
                        </select>
                    </div>
                    <div>
                        <label style="font-size:10px; color:#888; display:block; margin-bottom:2px;">Target Description</label>
                        <input id="sn-es-label" type="text" value="${((step.selectors ? (step.selectors.ariaLabel || step.selectors.title || step.selectors.name || step.selectors.innerText || '') : '') || step.value || step.ms + 'ms').replace(/"/g, '&quot;')}" style="width:100%; padding:6px 8px; border:1px solid #ddd; border-radius:6px; font-size:12px; box-sizing:border-box;" placeholder="Description (display only)">
                    </div>
                    <div id="sn-es-value-group" style="${step.type === 'select' || step.type === 'wait' ? '' : 'display:none;'}">
                        <label id="sn-es-value-label" style="font-size:10px; color:#888; display:block; margin-bottom:2px;">
                            ${step.type === 'select' ? 'Value to select' : step.type === 'wait' ? 'Duration (ms)' : 'Value'}
                        </label>
                        <input id="sn-es-value" type="text" value="${step.type === 'select' ? (step.value || '') : step.type === 'wait' ? (step.ms || '1000') : ''}" style="width:100%; padding:6px 8px; border:1px solid #ddd; border-radius:6px; font-size:12px; box-sizing:border-box;">
                    </div>
                    <div>
                        <label style="font-size:10px; color:#888; display:block; margin-bottom:2px;">Wait after step (ms)</label>
                        <input id="sn-es-wait" type="number" value="${step.waitAfter || 500}" min="0" step="100" style="width:100%; padding:6px 8px; border:1px solid #ddd; border-radius:6px; font-size:12px; box-sizing:border-box;">
                    </div>
                    <div style="display:flex; gap:6px;">
                        <button id="sn-es-step-save" style="flex:1; padding:8px; background:#1976d2; color:white; border:none; border-radius:6px; font-weight:bold; cursor:pointer; font-size:12px;">💾 Save</button>
                        <button id="sn-es-step-cancel" style="flex:1; padding:8px; background:#f5f5f5; color:#888; border:1px solid #ddd; border-radius:6px; cursor:pointer; font-size:12px;">Cancel</button>
                    </div>
                </div>
            `;

            const typeSelect = body.querySelector('#sn-es-type');
            const valueGroup = body.querySelector('#sn-es-value-group');
            const valueLabel = body.querySelector('#sn-es-value-label');
            const valueInput = body.querySelector('#sn-es-value');
            if (typeSelect) {
                typeSelect.onchange = () => {
                    const newType = typeSelect.value;
                    valueGroup.style.display = (newType === 'select' || newType === 'wait') ? '' : 'none';
                    valueLabel.textContent = newType === 'select' ? 'Value to select' : newType === 'wait' ? 'Duration (ms)' : 'Value';
                    valueInput.value = newType === 'wait' ? '1000' : '';
                };
            }

            const saveBtn = body.querySelector('#sn-es-step-save');
            if (saveBtn) {
                saveBtn.onclick = () => {
                    const newType = typeSelect.value;
                    const newWait = parseInt(body.querySelector('#sn-es-wait')?.value) || 500;
                    stepsArray[index].type = newType;
                    stepsArray[index].waitAfter = newWait;
                    if (newType === 'select') {
                        stepsArray[index].value = valueInput?.value || '';
                    } else if (newType === 'wait') {
                        const ms = parseInt(valueInput?.value) || 1000;
                        stepsArray[index].ms = ms;
                        stepsArray[index].waitAfter = ms;
                        delete stepsArray[index].selectors;
                    } else {
                        delete stepsArray[index].value;
                        delete stepsArray[index].ms;
                    }
                    if (onSave) onSave();
                };
            }

            const cancelBtn = body.querySelector('#sn-es-step-cancel');
            if (cancelBtn) {
                cancelBtn.onclick = () => {
                    if (onSave) onSave();
                };
            }
        }
    };

    app.Automation.MacroRecorder = MacroRecorder;
})();
