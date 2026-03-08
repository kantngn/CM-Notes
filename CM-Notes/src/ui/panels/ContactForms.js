(function () {
    const app = window.CM_App = window.CM_App || {};
    app.Tools = app.Tools || {};

    /**
     * Manages specialized floating contact log forms (like FO and DDS).
     * Provides templates, drag-and-drop window creation, and data-clearing logic.
     * Interacts with WindowManager and GlobalNotes.
     * @namespace app.Tools.ContactForms
     */
    const ContactForms = {
        formConfigs: {
            'FO': {
                title: 'FO Contact',
                body: `
                    <div style="padding:10px; display:flex; flex-direction:column; gap:8px;">
                        <div style="display:flex; gap:10px; align-items:center;">
                            <input type="text" id="fo-rep" placeholder="Rep Name" style="width:120px; border:1px solid #ccc; padding:3px;">
                            <label><input type="checkbox" id="fo-proc"> Processed</label>
                            <label><input type="checkbox" id="fo-1696"> 1696</label>
                            <label><input type="checkbox" id="fo-other"> Other Rep</label>
                            <label><input type="checkbox" id="fo-wet"> Wet Sig</label>
                        </div>
                        <div style="display:flex; gap:5px; align-items:center;">
                            <select id="fo-claim-lvl" style="background:white; border:1px solid #ccc;"><option>Claim Level</option><option>IA</option><option>Recon</option></select>
                            <select id="fo-claim-typ" style="background:white; border:1px solid #ccc;"><option>Claim Type</option><option>T2</option><option>T16</option><option>Concurrent</option></select>
                            <label><input type="checkbox" id="fo-ptr"> PTR</label>
                        </div>
                        <textarea id="fo-details" placeholder="Details..." style="width:100%; border:1px solid #ccc; padding:3px; resize:vertical; height:40px;"></textarea>
                        <div style="display:flex; gap:10px; align-items:center;">
                            <label><input type="checkbox" id="fo-attest"> Attested</label>
                            <label><input type="checkbox" id="fo-dds"> Transferred to DDS</label>
                            <input type="text" id="fo-trans-txt" placeholder="Date Transferred" style="flex-grow:1; border:1px solid #ccc; padding:3px;">
                        </div>
                        <div style="display:flex; gap:5px;">
                            <input type="text" id="fo-ifd" placeholder="IFD" style="flex-grow:1; border:1px solid #ccc; padding:3px; text-align:center;">
                            <input type="text" id="fo-aod" placeholder="AOD" style="flex-grow:1; border:1px solid #ccc; padding:3px; text-align:center;">
                            <input type="text" id="fo-dli" placeholder="DLI" style="flex-grow:1; border:1px solid #ccc; padding:3px; text-align:center;">
                        </div>
                        <div style="margin-top:5px; border:2px solid var(--sn-primary); background:rgba(255,255,255,0.6);">
                            <div style="background:var(--sn-primary); color:white; font-weight:bold; text-align:center; padding:2px; font-size:11px;">DECISION</div>
                            <div style="padding:5px; display:flex; flex-direction:column; gap:5px;">
                                <div style="display:flex; align-items:center; gap:5px;">
                                    <strong style="width:30px;">T2:</strong>
                                    <label><input type="checkbox" id="fo-t2-app"> Appr</label>
                                    <label><input type="checkbox" id="fo-t2-den"> Den</label>
                                    <input type="text" id="fo-t2-date" placeholder="Date" style="width:100px; border:1px solid #ccc;">
                                    <input type="text" id="fo-t2-reason" placeholder="Reason" style="flex-grow:1; border:1px solid #ccc;">
                                </div>
                                <div style="display:flex; align-items:center; gap:5px;">
                                    <strong style="width:30px;">T16:</strong>
                                    <label><input type="checkbox" id="fo-t16-app"> Appr</label>
                                    <label><input type="checkbox" id="fo-t16-den"> Den</label>
                                    <input type="text" id="fo-t16-date" placeholder="Date" style="width:100px; border:1px solid #ccc;">
                                    <input type="text" id="fo-t16-reason" placeholder="Reason" style="flex-grow:1; border:1px solid #ccc;">
                                </div>
                            </div>
                        </div>
                    </div>`
            },
            'DDS': {
                title: 'DDS Contact',
                body: `
                    <div style="padding:10px; display:flex; flex-direction:column; gap:8px;">
                        <div style="display:flex; gap:10px; align-items:center;">
                            <input type="text" id="dds-rep" placeholder="Rep Name" style="width:110px; border:1px solid #ccc; padding:3px;">
                            <label><input type="checkbox" id="dds-1696"> 1696</label>
                            <label><input type="checkbox" id="dds-other"> Other Rep</label>
                            <div style="flex-grow:1;"></div>
                            <input type="text" id="dds-trans" placeholder="Date Transferred" style="width:120px; border:1px solid #ccc; padding:3px; text-align:right;">
                        </div>
                        <textarea id="dds-details" placeholder="Details..." style="width:100%; border:1px solid #ccc; padding:3px; resize:vertical; height:40px;"></textarea>
                        <div style="display:flex; gap:5px; align-items:center;">
                            <label><input type="checkbox" id="dds-assign"> Assigned</label>
                            <input type="text" id="dds-assign-txt" style="flex-grow:1; border:1px solid #ccc; padding:3px;">
                            <label><input type="checkbox" id="dds-predev"> Pre-Dev Unit</label>
                        </div>
                        <div style="display:flex; gap:10px; align-items:center;">
                            <label><input type="checkbox" id="dds-wh"> WH</label>
                            <label><input type="checkbox" id="dds-fr"> FR</label>
                            <label><input type="checkbox" id="dds-rec"> Received</label>
                            <label><input type="checkbox" id="dds-prov"> Med Provider</label>
                            <label><input type="checkbox" id="dds-ce"> CE Scheduled</label>
                        </div>
                        <textarea id="dds-ce-box" style="display:none; height:50px; width:100%; border:1px solid red; background:white;" placeholder="CE Details..."></textarea>
                        <div style="display:flex; gap:5px; align-items:center;">
                            <strong>Outstanding:</strong>
                            <input type="text" id="dds-out-txt" style="flex-grow:1; border:1px solid #ccc; padding:3px;">
                        </div>
                    </div>`
            }
        },

        /**
         * Builds or toggles a specific contact form window.
         * 
         * @param {string} type - The form type identifier (e.g., 'FO' or 'DDS').
         */
        create(type) {
            const id = type === 'FO' ? 'sn-fo-form' : 'sn-dds-form';
            if (document.getElementById(id)) { app.Core.Windows.toggle(id); return; }

            const config = this.formConfigs[type];
            if (!config) return;

            const defPos = GM_getValue('def_pos_' + type, { width: '500px', height: 'auto', top: '350px', left: '35px' });

            const w = document.createElement('div');
            w.id = id; w.className = 'sn-window';
            w.style.width = defPos.width; w.style.height = defPos.height;
            w.style.top = defPos.top; w.style.left = defPos.left;
            w.style.backgroundColor = 'var(--sn-bg-lighter)'; w.style.border = '1px solid var(--sn-border)';

            w.innerHTML = `
                <div class="sn-header" id="sn-${type.toLowerCase()}-header" style="background:var(--sn-bg-light); border-bottom:1px solid var(--sn-border);">
                    <div style="display:flex; align-items:center; gap:5px;">
                         <button id="sn-${type.toLowerCase()}-min" style="cursor:pointer; background:none; border:none; font-weight:bold;">_</button>
                         <span style="font-weight:bold; color:var(--sn-primary-dark);">${config.title} - Client</span>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span id="${type.toLowerCase()}-undo" style="display:none; cursor:pointer; font-size:11px; font-weight:bold; color:#444;">UNDO</span>
                        <span id="${type.toLowerCase()}-clear" style="cursor:pointer; font-size:11px; font-weight:bold; color:var(--sn-primary-dark);">CLEAR</span>
                        <button id="sn-${type.toLowerCase()}-close" style="background:none; border:none; font-weight:bold; cursor:pointer; font-size:14px; margin-left:5px;">X</button>
                    </div>
                </div>
                ${config.body}
                <div style="padding:10px; border-top:1px solid var(--sn-border); display:flex; flex-direction:column; flex-grow:1;">
                    <textarea id="${type.toLowerCase()}-notes" style="flex-grow:1; min-height:60px; border:1px solid #ccc; background:rgba(255,255,255,0.8); resize:vertical;" placeholder="Additional Notes..."></textarea>
                    <div id="${type.toLowerCase()}-msg" style="height:15px; font-size:10px; color:red; text-align:right;"></div>
                </div>
                <div class="sn-resizer rs-n"></div><div class="sn-resizer rs-s"></div>
                <div class="sn-resizer rs-e"></div><div class="sn-resizer rs-w"></div>
                <div class="sn-resizer rs-ne"></div><div class="sn-resizer rs-nw"></div>
                <div class="sn-resizer rs-se"></div><div class="sn-resizer rs-sw"></div>
            `;
            document.body.appendChild(w);
            app.Core.Windows.setup(w, w.querySelector(`#sn-${type.toLowerCase()}-min`), w.querySelector('.sn-header'), type);

            if (type === 'DDS') {
                const ceCheck = w.querySelector('#dds-ce'), ceBox = w.querySelector('#dds-ce-box');
                ceCheck.onchange = () => { ceBox.style.display = ceCheck.checked ? 'block' : 'none'; };
            }

            const clearBtn = w.querySelector(`#${type.toLowerCase()}-clear`);
            const undoBtn = w.querySelector(`#${type.toLowerCase()}-undo`);
            const msgSpan = w.querySelector(`#${type.toLowerCase()}-msg`);

            let holdTimer; let undoBuffer = null;

            clearBtn.onmousedown = () => {
                clearBtn.style.color = "red"; clearBtn.innerText = "HOLD...";
                holdTimer = setTimeout(() => {
                    const inputs = w.querySelectorAll('input, select, textarea');
                    undoBuffer = {};
                    inputs.forEach(el => undoBuffer[el.id] = (el.type === 'checkbox' ? el.checked : el.value));
                    inputs.forEach(el => { if (el.type === 'checkbox') el.checked = false; else el.value = ''; });
                    clearBtn.innerText = "CLEAR"; clearBtn.style.color = "var(--sn-primary-dark)";
                    undoBtn.style.display = "inline"; msgSpan.innerText = "Form Cleared";
                    setTimeout(() => msgSpan.innerText = "", 2000);
                }, 2000);
            };

            const resetClearBtn = () => { clearTimeout(holdTimer); if (clearBtn.innerText === "HOLD...") { clearBtn.innerText = "CLEAR"; clearBtn.style.color = "var(--sn-primary-dark)"; } };
            clearBtn.onmouseup = resetClearBtn; clearBtn.onmouseleave = resetClearBtn;

            undoBtn.onclick = () => {
                if (undoBuffer) {
                    const inputs = w.querySelectorAll('input, select, textarea');
                    inputs.forEach(el => { if (undoBuffer[el.id] !== undefined) { if (el.type === 'checkbox') el.checked = undoBuffer[el.id]; else el.value = undoBuffer[el.id]; } });
                    undoBtn.style.display = "none"; msgSpan.innerText = "Restored"; setTimeout(() => msgSpan.innerText = "", 2000);
                }
            };

            w.querySelector(`#sn-${type.toLowerCase()}-close`).onclick = () => { w.style.display = 'none'; app.Core.Windows.updateTabState(w.id); };
        }
    };

    app.Tools.ContactForms = ContactForms;
})();
