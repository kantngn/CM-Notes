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

        // ── Recording State ──
        _recording: false,
        _steps: [],
        _lastClickTime: 0,
        _lastClickEl: null,
        _lastClickSelectors: null,
        _overlay: null,
        _clickHandler: null,
        _inputHandler: null,
        _debounceTimer: null,
        _inputValueCache: null,

        // ══════════════════════════════════════════════
        //  TRIGGER & PANEL
        // ══════════════════════════════════════════════

        init() {
            // Trigger button removed — use Alt+M to open the panel
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
                if (app.Core.Windows) app.Core.Windows.toggle(id);
                return;
            }
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
            const macros = this.getMacros();
            const macroNames = Object.keys(macros);
            const isRecording = this._recording;
            const stepCount = this._steps ? this._steps.length : 0;

            w.innerHTML = `
                <div class="sn-header" style="background:#1e1e1e; color:white; padding:8px 12px; border-bottom:1px solid rgba(0,0,0,0.1); display:flex; align-items:center; justify-content:space-between; cursor:move;">
                    <span style="font-weight:bold; font-size:13px; letter-spacing:0.5px;">🎬 Macro Recorder</span>
                    <button id="sn-macro-close" style="background:rgba(255,255,255,0.1); border:none; color:white; font-weight:bold; cursor:pointer; font-size:16px; width:24px; height:24px; border-radius:50%; display:flex; align-items:center; justify-content:center;">×</button>
                </div>
                <div id="sn-macro-body" style="padding:12px; display:flex; flex-direction:column; gap:8px; background:white; overflow-y:auto;">
                    <div style="display:flex; gap:6px;">
                        <button id="sn-macro-record-btn" style="flex:1; padding:10px; border:none; border-radius:8px; font-weight:bold; cursor:pointer; font-size:13px; ${isRecording ? 'background:#e53935; color:white;' : 'background:var(--sn-primary,#1976d2); color:white;'}">
                            ${isRecording ? '⏹ Stop' : '🔴 Record'}
                        </button>
                        <button id="sn-macro-cancel-btn" style="${isRecording ? '' : 'display:none;'} padding:8px 12px; background:#f5f5f5; border:1px solid #ddd; border-radius:8px; cursor:pointer; font-size:16px; color:#888;" title="Cancel recording">✕</button>
                    </div>
                    <div id="sn-macro-status" style="font-size:11px; color:#888; min-height:16px; padding:2px 0;">
                        ${isRecording
                            ? `🔴 Recording... <strong>${stepCount}</strong> step(s)`
                            : macroNames.length > 0
                                ? `<strong>${macroNames.length}</strong> macro(s) saved`
                                : 'No macros saved. Click <strong>Record</strong>, then perform your actions.'
                        }
                    </div>
                    <div id="sn-macro-list" style="display:flex; flex-direction:column; gap:4px; max-height:320px; overflow-y:auto;">
                        ${macroNames.length === 0
                            ? '<div style="font-size:11px; color:#aaa; text-align:center; padding:16px 0;">🎬 Record your first macro</div>'
                            : macroNames.map(name => {
                                const macro = macros[name];
                                const stepCount = (macro.steps || []).length;
                                const icons = { click: '👆', select: '📋', remove: '🗑️', clear: '🧹' };
                                const summary = (macro.steps || []).slice(0, 3).map(s => icons[s.type] || '➡️').join(' ');
                                const extra = stepCount > 3 ? ` +${stepCount - 3}` : '';
                                return `
                                    <div class="sn-macro-item" style="display:flex; align-items:center; gap:6px; padding:8px 10px; background:white; border:1px solid #eee; border-radius:8px;">
                                        <div style="flex:1; min-width:0;">
                                            <div style="font-size:12px; font-weight:600; color:#333;">${name}</div>
                                            <div style="font-size:10px; color:#999; display:flex; gap:4px; align-items:center; flex-wrap:wrap;">
                                                <span>${stepCount} step(s)</span>
                                                <span>·</span>
                                                <span>${summary}${extra}</span>
                                                ${macro.urlPattern ? `<span>·</span><span style="color:#1565c0;">${macro.urlPattern}</span>` : ''}
                                            </div>
                                        </div>
                                        <div style="display:flex; gap:3px; flex-shrink:0;">
                                            <button class="sn-macro-play" data-macro="${CSS.escape(name)}" title="Play macro" style="background:var(--sn-primary,#1976d2); color:white; border:none; border-radius:6px; padding:6px 12px; font-size:12px; cursor:pointer; font-weight:bold;">▶</button>
                                            <button class="sn-macro-delete" data-macro="${CSS.escape(name)}" title="Delete macro" style="background:#f5f5f5; color:#999; border:1px solid #eee; border-radius:6px; padding:6px 8px; font-size:12px; cursor:pointer;">🗑️</button>
                                        </div>
                                    </div>
                                `;
                            }).join('')
                        }
                    </div>
                </div>
            `;

            this.bindEvents(w);
        },

        bindEvents(w) {
            const closeBtn = w.querySelector('#sn-macro-close');
            if (closeBtn) {
                closeBtn.onclick = () => {
                    const id = 'sn-macro-panel';
                    if (app.Core.Windows) {
                        app.Core.Windows.toggle(id);
                    } else {
                        w.style.display = 'none';
                    }
                };
            }

            const recordBtn = w.querySelector('#sn-macro-record-btn');
            if (recordBtn) {
                recordBtn.onclick = () => {
                    if (this._recording) {
                        const steps = this.stopRecording();
                        if (steps.length === 0) {
                            this.render(w);
                            return;
                        }
                        const name = prompt('Name this macro:', '');
                        if (name && name.trim()) {
                            this.saveMacro(name.trim(), steps);
                        }
                        this.render(w);
                    } else {
                        this.startRecording();
                        this.render(w);
                    }
                };
            }

            const cancelBtn = w.querySelector('#sn-macro-cancel-btn');
            if (cancelBtn) {
                cancelBtn.onclick = () => {
                    this.cancelRecording();
                    this.render(w);
                };
            }

            w.querySelectorAll('.sn-macro-play').forEach(btn => {
                btn.onclick = async (e) => {
                    e.stopPropagation();
                    const name = btn.dataset.macro;
                    btn.disabled = true;
                    btn.textContent = '⏳';
                    await this.playMacro(name);
                    btn.disabled = false;
                    btn.textContent = '▶';
                };
            });

            w.querySelectorAll('.sn-macro-delete').forEach(btn => {
                btn.onclick = (e) => {
                    e.stopPropagation();
                    const name = btn.dataset.macro;
                    if (confirm(`Delete macro "${name}"?`)) {
                        this.deleteMacro(name);
                        this.render(w);
                    }
                };
            });
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
        _buildUniqueCSSPath(el, maxDepth = 5) {
            if (!el || el === document.body || el === document.documentElement) return '';
            const parts = [];
            let current = el;
            let depth = 0;

            while (current && current !== document.body && current !== document.documentElement && depth < maxDepth) {
                const tag = (current.tagName || '').toLowerCase();
                if (!tag) break;

                // Use ID if available (unique by definition)
                if (current.id) {
                    parts.unshift(`#${CSS.escape(current.id)}`);
                    break;
                }

                let selector = tag;

                // Add nth-child position among siblings with same tag
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

                // Add stable attributes that help identify it
                const ariaLabel = current.getAttribute('aria-label');
                if (ariaLabel) {
                    selector += `[aria-label="${CSS.escape(ariaLabel)}"]`;
                } else {
                    const title = current.getAttribute('title');
                    if (title) {
                        selector += `[title="${CSS.escape(title)}"]`;
                    } else {
                        const name = current.getAttribute('name');
                        if (name) {
                            selector += `[name="${CSS.escape(name)}"]`;
                        }
                    }
                }

                parts.unshift(selector);
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

            // aria-label match (weight: 100)
            if (selectors.ariaLabel && candidate.getAttribute('aria-label') === selectors.ariaLabel) {
                score += 100;
            }

            // title match (weight: 90)
            if (selectors.title && candidate.getAttribute('title') === selectors.title) {
                score += 90;
            }

            // data-target-selection-name match (weight: 85)
            if (selectors.dataTarget && candidate.getAttribute('data-target-selection-name') === selectors.dataTarget) {
                score += 85;
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

            // Name match (weight: 70)
            if (selectors.name && candidate.getAttribute('name') === selectors.name) {
                score += 70;
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

            // CSS path suffix match — bonus if the element's CSS path ends
            // with a portion of the recorded path (handles dynamic parent indices)
            if (selectors.cssPath) {
                const candPath = this._buildUniqueCSSPath(candidate, 3);
                if (candPath && selectors.cssPath.endsWith(candPath)) {
                    score += 20;
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

            // Collect candidates from all available selector attributes
            const candidateSet = new Set();

            const attrs = ['ariaLabel', 'title', 'dataTarget', 'name', 'placeholder', 'dataKey'];
            for (const attr of attrs) {
                if (selectors[attr]) {
                    const attrName = attr === 'ariaLabel' ? 'aria-label'
                        : attr === 'dataTarget' ? 'data-target-selection-name'
                        : attr;
                    try {
                        const els = document.querySelectorAll(`[${attrName}="${CSS.escape(selectors[attr])}"]`);
                        els.forEach(el => candidateSet.add(el));
                    } catch (e) { /* skip bad selectors */ }
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

            // If no candidates found via attributes, use shadow DOM piercing
            if (candidateSet.size === 0) {
                const U = app.Core.Utils;
                for (const attr of ['ariaLabel', 'title', 'dataTarget', 'name']) {
                    if (selectors[attr]) {
                        const cssSel = attr === 'ariaLabel'
                            ? `[aria-label="${selectors[attr]}"]`
                            : attr === 'dataTarget'
                                ? `[data-target-selection-name="${selectors[attr]}"]`
                                : `[${attr}="${selectors[attr]}"]`;
                        try {
                            const el = U.queryDeep(cssSel, document);
                            if (el) candidateSet.add(el);
                        } catch (e) { /* skip */ }
                    }
                }
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

        // ── Recording ──

        /**
         * Begins recording user interactions. Installs click, change, and input
         * handlers on the document (capture phase). Shows a floating recording badge.
         */
        startRecording() {
            if (this._recording) return;
            this._recording = true;
            this._steps = [];
            this._lastClickTime = 0;
            this._lastClickEl = null;
            this._lastClickSelectors = null;

            // ── Recording overlay badge ──
            this._createOverlay();

            // ── Click handler (capture phase to intercept before Salesforce handles it) ──
            this._clickHandler = (e) => {
                if (!this._recording) return;
                const el = e.target;

                // Ignore clicks on our own UI
                if (el.closest('#sn-macro-overlay, .sn-window, .sn-header, #sn-auto-trigger')) return;

                const now = Date.now();

                // ── Detect: clicking an option in a combobox (select action) ──
                if (this._isComboboxOption(el)) {
                    const opt = el.closest('[role="option"], lightning-base-combobox-item');
                    const selectors = this._buildSelectors(opt);
                    const value = (opt.textContent || '').trim();

                    // If the previous click was the combobox trigger, merge them
                    const timeSinceLast = now - this._lastClickTime;
                    if (this._lastClickSelectors && timeSinceLast < 3000) {
                        // Replace the last click (trigger open) with a select step
                        this._steps.pop();
                        this._steps.push({
                            type: 'select',
                            selectors: this._lastClickSelectors,
                            value: value,
                            waitAfter: 200
                        });
                        this._flashOverlay('select', value);
                    } else {
                        // Standalone option click — record as select with trigger inference
                        this._steps.push({
                            type: 'select',
                            selectors: selectors,
                            value: value,
                            waitAfter: 200
                        });
                        this._flashOverlay('select', value);
                    }

                    this._lastClickTime = now;
                    this._lastClickEl = opt;
                    this._lastClickSelectors = selectors;
                    return;
                }

                // ── Detect: clicking a remove/clear button ──
                if (this._isRemoveButton(el)) {
                    const btn = el.closest('button, [role="button"]');
                    const selectors = this._buildSelectors(btn);
                    this._steps.push({
                        type: 'remove',
                        selectors: selectors,
                        waitAfter: 500
                    });
                    this._flashOverlay('remove', selectors.title || selectors.ariaLabel || 'X');
                    this._lastClickTime = now;
                    this._lastClickEl = btn;
                    this._lastClickSelectors = selectors;
                    return;
                }

                // ── Detect: combobox trigger click (save it, may pair with option) ──
                if (this._isComboboxTrigger(el)) {
                    const btn = el.closest('button, [role="combobox"], [role="button"]');
                    const selectors = this._buildSelectors(btn);
                    this._steps.push({
                        type: 'click',
                        selectors: selectors,
                        waitAfter: 400
                    });
                    this._flashOverlay('click', selectors.title || selectors.ariaLabel || 'combobox');
                    this._lastClickTime = now;
                    this._lastClickEl = btn;
                    this._lastClickSelectors = selectors;
                    return;
                }

                // ── Generic click (button, link, etc.) ──
                const clickable = el.closest('button, a, [role="button"], [role="tab"], ' +
                    '[role="menuitem"], [onclick]');
                if (clickable) {
                    const selectors = this._buildSelectors(clickable);
                    this._steps.push({
                        type: 'click',
                        selectors: selectors,
                        waitAfter: 800
                    });
                    this._flashOverlay('click', selectors.title || selectors.ariaLabel || clickable.tagName);
                    this._lastClickTime = now;
                    this._lastClickEl = clickable;
                    this._lastClickSelectors = selectors;
                }
            };

            // ── Input handler: detect clearing of text/date fields ──
            this._inputValueCache = new WeakMap();
            this._inputHandler = (e) => {
                if (!this._recording) return;
                const el = e.target;
                if (!this._isTextInput(el)) return;

                const tag = el.closest('input, textarea');
                if (!tag) return;

                const prevVal = this._inputValueCache.get(tag) || '';
                const currentVal = tag.value;

                // Detect clear (was non-empty, now empty)
                if (prevVal && !currentVal) {
                    const selectors = this._buildSelectors(tag);
                    // Avoid duplicates: don't record clear right after a remove
                    const lastStep = this._steps[this._steps.length - 1];
                    if (lastStep && lastStep.type === 'remove') {
                        const timeSinceRemove = Date.now() - this._lastClickTime;
                        if (timeSinceRemove < 1000) {
                            this._inputValueCache.set(tag, currentVal);
                            return; // Skip — likely the X button already cleared it
                        }
                    }
                    this._steps.push({
                        type: 'clear',
                        selectors: selectors,
                        waitAfter: 300
                    });
                    this._flashOverlay('clear', selectors.title || selectors.ariaLabel || selectors.placeholder || 'field');
                }

                this._inputValueCache.set(tag, currentVal);
            };

            // Install handlers (capture phase = true, so we see events before Salesforce)
            document.addEventListener('click', this._clickHandler, true);
            document.addEventListener('input', this._inputHandler, true);

            app.Core.Utils.showNotification('🔴 Recording started — click actions to record', {
                type: 'info',
                duration: 3000
            });
        },

        /**
         * Stops recording and returns the captured steps.
         * @returns {Array} The recorded steps array.
         */
        stopRecording() {
            if (!this._recording) return this._steps;
            this._recording = false;

            // Remove handlers
            if (this._clickHandler) {
                document.removeEventListener('click', this._clickHandler, true);
                this._clickHandler = null;
            }
            if (this._inputHandler) {
                document.removeEventListener('input', this._inputHandler, true);
                this._inputHandler = null;
            }

            // Clean up overlay
            this._removeOverlay();

            app.Core.Utils.showNotification(
                `⏹ Recording stopped — ${this._steps.length} step(s) captured`,
                { type: 'info', duration: 3000 }
            );

            return this._steps;
        },

        /**
         * Cancels recording and discards captured steps.
         */
        cancelRecording() {
            this._recording = false;
            if (this._clickHandler) {
                document.removeEventListener('click', this._clickHandler, true);
                this._clickHandler = null;
            }
            if (this._inputHandler) {
                document.removeEventListener('input', this._inputHandler, true);
                this._inputHandler = null;
            }
            this._removeOverlay();
            this._steps = [];
            app.Core.Utils.showNotification('Recording cancelled', { type: 'info', duration: 2000 });
        },

        // ── Overlay UI ──

        _createOverlay() {
            if (this._overlay) return;
            const o = document.createElement('div');
            o.id = 'sn-macro-overlay';
            o.innerHTML = `
                <span id="sn-macro-rec-dot">🔴</span>
                <span id="sn-macro-rec-label">REC</span>
                <span id="sn-macro-rec-count">0</span>
                <span id="sn-macro-rec-flash"></span>
            `;
            o.style.cssText = `
                position: fixed; top: 8px; left: 50%; transform: translateX(-50%);
                z-index: 999999; background: rgba(0,0,0,0.8); color: white;
                padding: 6px 14px; border-radius: 20px; font-size: 13px;
                font-weight: bold; font-family: monospace; display: flex;
                align-items: center; gap: 8px; pointer-events: none;
                box-shadow: 0 4px 20px rgba(0,0,0,0.4);
                transition: opacity 0.3s;
            `;
            const flash = o.querySelector('#sn-macro-rec-flash');
            flash.style.cssText = `
                position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
                background: rgba(76, 175, 80, 0.3); color: white; padding: 8px 20px;
                border-radius: 8px; font-size: 14px; font-weight: bold;
                font-family: system-ui; pointer-events: none; opacity: 0;
                transition: opacity 0.15s; border: 2px solid rgba(76,175,80,0.6);
                max-width: 300px; text-align: center; word-break: break-all;
            `;
            document.body.appendChild(o);
            this._overlay = o;
            this._updateOverlayCount();
        },

        _removeOverlay() {
            if (this._overlay) {
                this._overlay.remove();
                this._overlay = null;
            }
        },

        _updateOverlayCount() {
            const el = document.getElementById('sn-macro-rec-count');
            if (el) el.textContent = this._steps.length;
        },

        /**
         * Flash a brief label on the overlay showing what was just recorded.
         * @param {string} type - The action type (click, select, remove, clear).
         * @param {string} label - A short description of what was captured.
         */
        _flashOverlay(type, label) {
            this._updateOverlayCount();
            const flash = this._overlay?.querySelector('#sn-macro-rec-flash');
            if (!flash) return;

            const icons = { click: '👆', select: '📋', remove: '🗑️', clear: '🧹' };
            const icon = icons[type] || '➡️';
            const shortLabel = (label || '').substring(0, 40);
            flash.textContent = `${icon} ${type}${shortLabel ? ': ' + shortLabel : ''}`;
            flash.style.opacity = '1';

            if (this._debounceTimer) clearTimeout(this._debounceTimer);
            this._debounceTimer = setTimeout(() => {
                flash.style.opacity = '0';
            }, 1200);
        },

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
        }
    };

    app.Automation.MacroRecorder = MacroRecorder;
})();
