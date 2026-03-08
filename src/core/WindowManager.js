(function () {
    const app = window.CM_App = window.CM_App || {};
    app.Core = app.Core || {};

    /**
     * Manages the logic for creating, dragging, resizing, and z-index stacking of 
     * floating UI windows while persisting their dimensions and positions.
     * Interacts with content.js, AppObserver, Dashboard, ContactForms, SSDFormViewer, 
     * MedicationPanel, FeaturePanels, ClientNote, and AutomationPanel.
     * @namespace app.Core.Windows
     */
    const WindowManager = {
        /**
         * Brings a specified window element to the front of the stacking order.
         * 
         * @param {HTMLElement} el - The window element to bring to the front.
         */
        bringToFront(el) {
            document.querySelectorAll('.sn-window').forEach(w => w.style.zIndex = "10000");
            el.style.zIndex = "10001";
            document.querySelectorAll('.sn-tb-btn').forEach(b => b.classList.remove('focused'));
            const btn = document.getElementById('tab-' + el.id);
            if (btn) btn.classList.add('focused');
        },

        /**
         * Toggles the display state of a window and its corresponding tab button.
         * 
         * @param {string} id - The DOM ID of the window to toggle.
         * @returns {boolean} True if the window exists, false otherwise.
         */
        toggle(id) {
            const el = document.getElementById(id);
            if (!el) return false;

            if (el.style.display === 'none') {
                el.style.display = 'flex';
                this.bringToFront(el);
            } else {
                el.style.display = 'none';
            }
            this.updateTabState(id);
            return true;
        },

        /**
         * Updates the visual state (active/focused) of a tab button based on its window's visibility.
         * 
         * @param {string} id - The DOM ID of the associated window.
         */
        updateTabState(id) {
            const btn = document.getElementById('tab-' + id);
            const el = document.getElementById(id);
            if (!btn) return;

            document.querySelectorAll('.sn-tb-btn').forEach(b => b.classList.remove('focused'));

            if (el && el.style.display !== 'none') {
                btn.classList.add('active');
                if (el.style.zIndex === "10001") btn.classList.add('focused');
            } else if (el && el.style.display === 'none') {
                btn.classList.add('active');
                btn.classList.remove('focused');
            } else {
                btn.classList.remove('active');
                btn.classList.remove('focused');
            }
        },

        /**
         * Initializes drag, resize, and state persistence behaviors for a floating window.
         * 
         * @param {HTMLElement} w - The main window element.
         * @param {HTMLElement|null} minBtn - The minimize button element, if any.
         * @param {HTMLElement} header - The header element used as a drag handle.
         * @param {string} typeId - The unique identifier used for saving position/size state in GM storage.
         */
        setup(w, minBtn, header, typeId) {
            this.makeDraggable(w, header);
            this.makeResizable(w);

            header.ondblclick = () => {
                w.style.display = 'none';
                this.updateTabState(w.id);
            };

            this.updateTabState(w.id);
            w.onmousedown = () => this.bringToFront(w);

            if (minBtn) {
                minBtn.title = "Minimize (Hold to save default size/pos)";
                let holdTimer = null;
                let saved = false;

                minBtn.onmousedown = (e) => {
                    e.stopPropagation();
                    saved = false;
                    holdTimer = setTimeout(() => {
                        const def = { width: w.style.width, height: w.style.height, top: w.style.top, left: w.style.left };
                        GM_setValue('def_pos_' + typeId, def);
                        w.classList.add('sn-saved-glow');
                        setTimeout(() => w.classList.remove('sn-saved-glow'), 500);
                        saved = true;
                    }, 500);
                };

                minBtn.onmouseup = () => {
                    clearTimeout(holdTimer);
                    if (!saved) {
                        w.style.display = 'none';
                        this.updateTabState(w.id);
                    }
                };
                minBtn.onmouseleave = () => clearTimeout(holdTimer);
            }
        },

        /**
         * Implements the dragging logic for a window element via its header.
         * 
         * @param {HTMLElement} el - The window element to be dragged.
         * @param {HTMLElement} header - The header element acting as the drag handle.
         */
        makeDraggable(el, header) {
            let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
            header.onmousedown = (e) => {
                this.bringToFront(el);
                pos3 = e.clientX; pos4 = e.clientY;
                const onMove = (e) => {
                    pos1 = pos3 - e.clientX; pos2 = pos4 - e.clientY;
                    pos3 = e.clientX; pos4 = e.clientY;
                    el.style.top = (el.offsetTop - pos2) + "px";
                    el.style.left = (el.offsetLeft - pos1) + "px";
                };
                const onUp = () => {
                    document.removeEventListener('mousemove', onMove);
                    document.removeEventListener('mouseup', onUp);
                    el.dispatchEvent(new Event('mouseup'));
                };
                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
            };
        },

        /**
         * Implements the resizing logic for a window element via resize handles.
         * 
         * @param {HTMLElement} el - The window element to be made resizable.
         */
        makeResizable(el) {
            el.querySelectorAll('.sn-resizer').forEach(r => {
                r.onmousedown = (e) => {
                    e.preventDefault(); e.stopPropagation();
                    this.bringToFront(el);

                    let tip = document.getElementById('sn-resize-tip');
                    if (!tip) {
                        tip = document.createElement('div');
                        tip.id = 'sn-resize-tip';
                        tip.style.cssText = 'position:fixed; background:rgba(0,0,0,0.8); color:white; padding:4px 8px; border-radius:4px; font-size:11px; pointer-events:none; z-index:20000; display:none; font-family:sans-serif;';
                        document.body.appendChild(tip);
                    }
                    tip.style.display = 'block';

                    const startX = e.clientX, startY = e.clientY;
                    const rect = el.getBoundingClientRect();
                    const startW = rect.width;
                    const startH = rect.height;
                    const startL = el.offsetLeft, startT = el.offsetTop;
                    const cls = r.className;

                    const updateTip = (ev) => {
                        tip.innerText = `W: ${Math.round(el.offsetWidth)} H: ${Math.round(el.offsetHeight)} | X: ${Math.round(el.offsetLeft)} Y: ${Math.round(el.offsetTop)}`;
                        tip.style.top = (ev.clientY + 15) + 'px';
                        tip.style.left = (ev.clientX + 15) + 'px';
                    };
                    updateTip(e);

                    const onMove = (e) => {
                        const dx = e.clientX - startX, dy = e.clientY - startY;
                        if (cls.includes('rs-e') || cls.includes('ne') || cls.includes('se')) el.style.width = (startW + dx) + 'px';
                        if (cls.includes('rs-s') || cls.includes('se') || cls.includes('sw')) el.style.height = (startH + dy) + 'px';
                        if (cls.includes('rs-w') || cls.includes('nw') || cls.includes('sw')) { el.style.width = (startW - dx) + 'px'; el.style.left = (startL + dx) + 'px'; }
                        if (cls.includes('rs-n') || cls.includes('ne') || cls.includes('nw')) { el.style.height = (startH - dy) + 'px'; el.style.top = (startT + dy) + 'px'; }
                        updateTip(e);
                    };
                    const onUp = () => {
                        document.removeEventListener('mousemove', onMove);
                        document.removeEventListener('mouseup', onUp);
                        tip.style.display = 'none';
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                    };
                    document.addEventListener('mousemove', onMove);
                    document.addEventListener('mouseup', onUp);
                };
            });
        }
    };

    app.Core.Windows = WindowManager;
})();
