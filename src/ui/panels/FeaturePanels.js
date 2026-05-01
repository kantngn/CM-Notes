(function () {
    const app = window.CM_App = window.CM_App || {};
    app.Tools = app.Tools || {};

    /**
     * Manages supplementary feature panels like 'PDF Forms' (FAX) and 'IR Tool'.
     * Handles UI generation, PDF manipulation (via PDFLib), and data scraping/summarization for IRs.
     * Interacts with Scraper, PdfManager, and WindowManager.
     * @namespace app.Tools.FeaturePanels
     */
    const FeaturePanels = {
        /**
         * Builds or toggles the specified feature panel window.
         * Initiates data loading or scraping based on the panel type.
         * 
         * @param {string} type - The panel type identifier ('FAX' or 'IR').
         */
        create(type) {
            const id = type === 'FAX' ? 'sn-fax-panel' : 'sn-ir-panel';
            if (document.getElementById(id)) { app.Core.Windows.toggle(id); return; }

            let clientId = app.AppObserver.getClientId();
            if (!clientId) {
                const cn = document.getElementById('sn-client-note');
                if (cn && cn.dataset.clientId) {
                    clientId = cn.dataset.clientId;
                } else {
                    app.Core.Utils.showNotification("Client context not found.", { type: 'error' });
                    return;
                }
            }

            // 🔴 ON HOLD: getSidebarData unreliable. Use fallback names instead.
            // Consider getting client info from SSD App page in the future.

            const config = {
                'FAX': { title: 'PDF Forms' },
                'IR': { title: 'IR Tool' }
            };
            const currentConfig = config[type];

            const defPos = GM_getValue('def_pos_' + type, { width: '350px', height: 'auto', bottom: '50px', left: 'calc(50% - 175px)' });

            const w = document.createElement('div');
            w.id = id;
            w.className = 'sn-window';
            w.style.width = defPos.width;
            w.style.height = defPos.height;
            if (defPos.top) w.style.top = defPos.top;
            if (defPos.bottom) w.style.bottom = defPos.bottom;
            w.style.left = defPos.left;
            w.style.backgroundColor = 'var(--sn-bg-lighter)';
            w.style.border = '1px solid var(--sn-border)';
            w.style.flexDirection = 'column';
            w.style.display = 'flex';

            w.innerHTML = `
                <div class="sn-header" style="background:var(--sn-bg-light); border-bottom:1px solid var(--sn-border);">
                    <div style="display:flex; align-items:center; gap:5px;">
                         <button id="sn-${type.toLowerCase()}-min" style="cursor:pointer; background:none; border:none; font-weight:bold;">_</button>
                         <span style="font-weight:bold; color:var(--sn-primary-dark);">${currentConfig.title} - Client</span>
                         ${type === 'FAX' ? '<button id="sn-fax-refresh" style="cursor:pointer; background:none; border:none; font-size:14px;" title="Refresh Data">🔄</button>' : ''}
                    </div>
                    <button id="sn-${type.toLowerCase()}-close" style="background:none; border:none; font-weight:bold; cursor:pointer; font-size:14px; margin-left:5px;">X</button>
                </div>
                <div id="${type.toLowerCase()}-body" style="overflow-y:auto; flex-grow:1;">
                    <!-- Content will be rendered here -->
                </div>
                <div class="sn-resizer rs-n"></div><div class="sn-resizer rs-s"></div>
                <div class="sn-resizer rs-e"></div><div class="sn-resizer rs-w"></div>
                <div class="sn-resizer rs-ne"></div><div class="sn-resizer rs-nw"></div>
                <div class="sn-resizer rs-se"></div><div class="sn-resizer rs-sw"></div>
            `;
            document.body.appendChild(w);
            app.Core.Windows.setup(w, w.querySelector(`#sn-${type.toLowerCase()}-min`), w.querySelector('.sn-header'), type);
            w.querySelector(`#sn-${type.toLowerCase()}-close`).onclick = () => { w.style.display = 'none'; app.Core.Windows.updateTabState(w.id); };

            const bodyContainer = w.querySelector(`#${type.toLowerCase()}-body`);

            if (type === 'FAX') {
                const loadFaxData = (refreshOnly = false) => {
                    const savedData = GM_getValue('cn_' + clientId, {});
                    const headerData = app.Core.Scraper.getHeaderData();
                    const pageData = app.Core.Scraper.getAllPageData();

                    const sidebarData = {
                        name: savedData.name || headerData.clientName || "Client",
                        ssn: savedData.ssn || pageData.ssn || "",
                        dob: savedData.dob || pageData.dob || ""
                    };

                    if (refreshOnly) {
                        const formData = GM_getValue('cn_form_data_' + clientId, {});

                        const updateFields = (cls, val) => {
                            bodyContainer.querySelectorAll('.' + cls).forEach(el => el.value = val || '');
                        };

                        // Extract Fax numbers for refresh
                        let foFax = '';
                        if (formData.FO_Text) {
                            const match = formData.FO_Text.match(/Fax:\s*([\d-]+)/i);
                            if (match) foFax = match[1].replace(/\D/g, '');
                        }

                        updateFields('sn-field-name', sidebarData.name);
                        updateFields('sn-field-ssn', sidebarData.ssn);
                        updateFields('sn-field-dob', sidebarData.dob);
                        
                        // Handle Address & Phone (including L25 specific splits)
                        const addrVal = formData['Address'] || '';
                        const phoneVal = formData['Phone'] || '';

                        const addrParts = addrVal.split(',').map(s => s.trim()).filter(s => s);
                        updateFields('sn-l25-addr1', addrParts[0] || '');
                        updateFields('sn-l25-addr2', addrParts.length > 1 ? addrParts.slice(1).join(', ') : '');

                        const phones = phoneVal.split(/[\n,;|]+/).map(s => s.trim()).filter(p => p.length > 0);
                        updateFields('sn-l25-primary-phone', phones[0] || '');
                        updateFields('sn-l25-alt-phone', phones.length > 1 ? phones.slice(1).join(" || ") : '');

                        updateFields('sn-field-dds', formData.DDS_Selection);
                        updateFields('sn-fax-fo', foFax);
                        updateFields('sn-global-cm1', GM_getValue('sn_global_cm1', ''));
                        updateFields('sn-global-ext', GM_getValue('sn_global_ext', ''));
                    } else {
                        bodyContainer.innerHTML = '';
                        this.renderFaxForm(bodyContainer, clientId, sidebarData);
                    }
                };
                loadFaxData();

                w.querySelector('#sn-fax-refresh').onclick = (e) => {
                    e.target.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], { duration: 500 });
                    loadFaxData(true);
                };
            } else if (type === 'IR') {
                this.renderIRPanel(bodyContainer);
            }
        },

        renderFaxForm(container, clientId, data) {
            const formData = GM_getValue('cn_form_data_' + clientId, {});
            const ddsName = formData.DDS_Selection || '';
            const globalCM1 = GM_getValue('sn_global_cm1', '');
            const globalExt = GM_getValue('sn_global_ext', '');

            let foFax = '';
            if (formData.FO_Text) {
                const match = formData.FO_Text.match(/Fax:\s*([\d-]+)/i);
                if (match) foFax = match[1].replace(/\D/g, '');
            }

            const styles = `border:none; border-bottom:1px dashed #999; background:transparent; font-family:inherit; width:100%;`;
            const createField = (lbl, val, hasCheck = false, extraClass = '', checkId = '') => `
                <div style="display:flex; align-items:center; margin-bottom:4px; font-size:0.9em;">
                    ${hasCheck ? `<input type="checkbox" ${checkId ? `id="${checkId}"` : ''} style="margin-right:4px;">` : ''}
                    <span style="color:#555; margin-right:4px; font-weight:bold; white-space:nowrap;">${lbl ? lbl + ':' : ''}</span>
                    <input type="text" class="sn-fax-input ${extraClass}" value="${val || ''}" readonly style="${styles}">
                </div>`;

            const formData1696 = GM_getValue('cn_form_data_' + clientId, {});
            const addr1696  = formData1696['Address'] || '';
            const phone1696 = (formData1696['Phone'] || '').split(/[\n,;|]+/)[0].trim(); // primary phone only

            const sections = [
                { title: "Letter 25", content: `
                    ${createField('Name', data.name, false, 'sn-field-name')}
                    ${createField('SSN', data.ssn, false, 'sn-field-ssn')}
                    <div style="margin:5px 0; border-bottom:1px solid #ccc; padding-bottom:5px; display:flex; gap:10px;">
                        <label><input type="checkbox" id="sn-l25-phone-chk" checked> Include Phone</label>
                        <label><input type="checkbox" id="sn-l25-addr-chk" checked> Include Address</label>
                    </div>
                    <div id="sn-l25-dynamic-header" style="font-weight: bold; margin: 8px 0 4px 0; color: var(--sn-primary-dark); font-size: 0.95em;"></div>
                    <input type="hidden" class="sn-l25-header" value="">
                    <div id="sn-l25-phone-fields-container">
                        ${createField('Primary Number', '', false, 'sn-l25-primary-phone')}
                        ${createField('Alt /Home number', '', false, 'sn-l25-alt-phone')}
                    </div>
                    <div id="sn-l25-addr-fields-container">
                        ${createField('New address', '', false, 'sn-l25-addr1')}
                        ${createField('', '', false, 'sn-l25-addr2')}
                    </div>
                    ${createField('Fax #', foFax, false, 'sn-field-fax sn-fax-fo')}
                    <div style="display:flex; gap:5px; margin-top:5px;">
                        <button id="sn-pdf-l25" style="flex:1;">📄 Generate PDF</button>
                        <button class="sn-open-ifax" style="flex:1;">Open iFax</button>
                    </div>
                ` },
                { title: "Status to DDS", content: `${createField('DDS', ddsName, false, 'sn-field-dds')}${createField('Fax #', '', false, 'sn-field-fax sn-fax-dds')}${createField('Name', data.name, false, 'sn-field-name')}${createField('SSN', data.ssn, false, 'sn-field-ssn')}${createField('DOB', data.dob, false, 'sn-field-dob')}${createField('Last update', 'N/A', false, 'sn-last-update')}${createField('CM1', globalCM1, false, 'sn-global-cm1')}${createField('Ext.', globalExt, false, 'sn-global-ext')}<div style="display:flex; gap:5px; margin-top:5px;"><button id="sn-pdf-s2dds" style="flex:1;">📄 Generate PDF</button><button class="sn-open-ifax" style="flex:1;">Open iFax</button></div>` },
                { title: "Status to FO", content: `${createField('Name', data.name, false, 'sn-field-name')}${createField('SSN', data.ssn, false, 'sn-field-ssn')}${createField('DOB', data.dob, false, 'sn-field-dob')}${createField('Fax #', foFax, false, 'sn-field-fax sn-fax-fo')}<div style="display:flex; gap:5px; margin-top:5px;"><button id="sn-pdf-s2fo" style="flex:1;">📄 Generate PDF</button><button class="sn-open-ifax" style="flex:1;">Open iFax</button></div>` },
                { title: "1696", content: `
                    ${createField('Name', data.name, false, 'sn-field-name sn-1696-name')}
                    ${createField('SSN', data.ssn, false, 'sn-field-ssn sn-1696-ssn')}
                    ${createField('DOB', data.dob, false, 'sn-field-dob sn-1696-dob')}
                    ${createField('Address', addr1696, false, 'sn-1696-address')}
                    ${createField('Phone', phone1696, false, 'sn-1696-phone')}
                    <input type="file" id="sn-1696-file-input" accept=".pdf" style="display:none;">
                    <div id="sn-1696-file-label" style="font-size:0.8em; color:#888; margin:4px 0 6px 0; min-height:16px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">No file selected</div>
                    <div style="display:flex; gap:5px; margin-top:5px;">
                        <button id="sn-1696-select-btn" style="flex:1;">📂 Select IP Contract</button>
                        <button id="sn-1696-process-btn" style="flex:1;">⚙️ Process</button>
                        <button class="sn-open-ifax" style="flex:1;">Open iFax</button>
                    </div>
                ` }
            ];

            container.style.padding = '10px';

            // Create Button Container
            const btnContainer = document.createElement('div');
            btnContainer.style.display = 'flex';
            btnContainer.style.gap = '5px';
            btnContainer.style.marginBottom = '10px';
            container.appendChild(btnContainer);

            // Create Content Container
            const contentContainer = document.createElement('div');
            container.appendChild(contentContainer);

            sections.forEach(sec => {
                const btn = document.createElement('button');
                btn.className = 'sn-fax-btn';
                btn.innerText = sec.title;
                btn.style.flex = '1';
                btn.onclick = () => {
                    contentContainer.innerHTML = `<div style="padding:8px; border:1px solid #ccc; background:#f9f9f9;">${sec.content}</div>`;
                    this.attachFaxEvents(contentContainer, clientId, data, formData, ddsName, globalCM1, globalExt);
                };
                btnContainer.appendChild(btn);
            });
        },

        attachFaxEvents(container, clientId, data, formData, ddsName, globalCM1, globalExt) {
            container.querySelectorAll('.sn-fax-input').forEach(inp => {
                inp.ondblclick = () => { inp.removeAttribute('readonly'); inp.focus(); };
                inp.onblur = () => inp.setAttribute('readonly', true);
                inp.onkeydown = (e) => { if (e.key === 'Enter') inp.blur(); };
            });

            const getVal = (cls) => { const el = container.querySelector('.' + cls); return el ? el.value : ''; };

            // --- L25 Dynamic Update Logic ---
            const updateL25 = () => {
                const phoneChk = container.querySelector('#sn-l25-phone-chk');
                if (!phoneChk) return; // Not on L25 tab

                const includePhone = phoneChk.checked;
                const includeAddr = container.querySelector('#sn-l25-addr-chk').checked;
                const phoneVal = formData['Phone'] || '';
                const addrVal = formData['Address'] || '';
                
                const setVal = (cls, v) => { const el = container.querySelector('.' + cls); if (el) el.value = v; };
                const setVisibility = (id, visible) => { const el = container.querySelector(id); if (el) el.style.display = visible ? 'block' : 'none'; };

                if (includePhone && !includeAddr) header = "Updated Phone Number";
                else if (!includePhone && includeAddr) header = "Updated Address";
                else if (includePhone && includeAddr) header = "Updated Phone Number and Address";

                // Update the visible label and the hidden input
                const headerDisplayEl = container.querySelector('#sn-l25-dynamic-header');
                if (headerDisplayEl) headerDisplayEl.innerText = header;
                setVal('sn-l25-header', header);

                // Handle phone fields
                setVisibility('#sn-l25-phone-fields-container', includePhone);
                if (includePhone) {
                    let phones = phoneVal.split(/[\n,;|]+/).map(s => s.trim()).filter(p => p.length > 0);
                    setVal('sn-l25-primary-phone', phones[0] || '');
                    setVal('sn-l25-alt-phone', phones.length > 1 ? phones.slice(1).join(" || ") : '');
                } else {
                    setVal('sn-l25-primary-phone', '');
                    setVal('sn-l25-alt-phone', '');
                }

                // Handle address fields
                setVisibility('#sn-l25-addr-fields-container', includeAddr);
                if (includeAddr) {
                    const parts = addrVal.split(',').map(s => s.trim()).filter(s => s);
                    setVal('sn-l25-addr1', parts[0] || '');
                    setVal('sn-l25-addr2', parts.length > 1 ? parts.slice(1).join(', ') : '');
                } else {
                    setVal('sn-l25-addr1', '');
                    setVal('sn-l25-addr2', '');
                }
            };
            container.querySelector('#sn-l25-phone-chk')?.addEventListener('change', updateL25);
            container.querySelector('#sn-l25-addr-chk')?.addEventListener('change', updateL25);
            updateL25(); // Initial run

            container.querySelectorAll('.sn-open-ifax').forEach(btn => {
                btn.onclick = () => {
                    const faxNum = getVal('sn-field-fax');
                    GM_setValue('sn_temp_fax_number', faxNum);
                    window.open('https://ifax.pro/sent/create/', '_blank', 'width=1000,height=800,menubar=no,toolbar=no,location=no,status=no,scrollbars=yes');
                };
            });

            const setupPdfBtn = (btnId, url, fileName, fillFn) => {
                const btn = container.querySelector(btnId);
                if (!btn) return;

                btn.onclick = async () => {
                    const originalText = btn.innerText;
                    btn.innerText = "⏳ Processing...";
                    try {
                        // FIX: Removed CDN loading to comply with Chrome Extension CSP.
                        // Ensure 'pdf-lib.min.js' is included in manifest.json under "content_scripts".
                        const PDFLib = window.PDFLib;
                        if (!PDFLib) {
                            throw new Error("PDFLib not found. Please add 'pdf-lib.min.js' to your extension manifest.");
                        }

                        const formBytes = (app.Core.PdfManager && typeof app.Core.PdfManager.fetchPdfBytes === 'function') ? await app.Core.PdfManager.fetchPdfBytes(url) : await fetch(url).then(res => res.arrayBuffer());
                        const pdfDoc = await PDFLib.PDFDocument.load(formBytes);
                        const form = pdfDoc.getForm();
                        const today = new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });

                        fillFn(form, today);

                        form.flatten();

                        // FIX: Save to "To Be Faxed" folder using Chrome Downloads API (requires Background Script handler)
                        const pdfBase64 = await pdfDoc.saveAsBase64({ dataUri: true });
                        const finalFilename = `To Be Faxed/${fileName} - ${data.name} - ${today.replace(/\//g, '-')}.pdf`;

                        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
                            chrome.runtime.sendMessage({
                                action: 'DOWNLOAD_FILE',
                                url: pdfBase64,
                                filename: finalFilename
                            }, (response) => {
                                if (chrome.runtime.lastError) {
                                    console.error("Download failed:", chrome.runtime.lastError);
                                    alert("Download failed via extension: " + chrome.runtime.lastError.message);
                                    btn.innerText = "❌ Error";
                                } else {
                                    btn.innerText = "✅ Done";
                                }
                            });
                        } else {
                            throw new Error("Chrome Runtime not available.");
                        }
                    } catch (e) { console.error(e); btn.innerText = "❌ Error"; alert(e.message); }
                    setTimeout(() => btn.innerText = originalText, 2000);
                };
            };

            setupPdfBtn('#sn-pdf-l25', 'https://raw.githubusercontent.com/kantngn/CM-Notes/refs/heads/main/db/L25.pdf', 'Letter 25', (form, today) => {
                try { form.getTextField('Date').setText(today); } catch (e) { }
                try { form.getTextField('Name').setText(getVal('sn-field-name')); } catch (e) { }
                try { form.getTextField('SSN').setText(getVal('sn-field-ssn')); } catch (e) { }
                try { form.getTextField('Header').setText(getVal('sn-l25-header')); } catch (e) { }

                const includePhone = container.querySelector('#sn-l25-phone-chk').checked;
                const includeAddr = container.querySelector('#sn-l25-addr-chk').checked;
                let lines = [];

                if (includePhone) {
                    const primary = getVal('sn-l25-primary-phone');
                    const alt = getVal('sn-l25-alt-phone');
                    if (primary) lines.push(`Primary Number: ${primary}`);
                    if (alt) lines.push(`Alt /Home number: ${alt}`);
                }
                if (includeAddr) {
                    const addr1 = getVal('sn-l25-addr1');
                    const addr2 = getVal('sn-l25-addr2');
                    if (addr1) lines.push(`New address: ${addr1}`);
                    if (addr2) lines.push(addr2);
                }

                for (let i = 0; i < 5; i++) {
                    try { form.getTextField(`Info${i + 1}`).setText(lines[i] || ""); } catch (e) { }
                }
            });

            setupPdfBtn('#sn-pdf-s2fo', 'https://raw.githubusercontent.com/kantngn/CM-Notes/refs/heads/main/db/S2FO.pdf', 'Fax Status Sheet to FO', (form, today) => {
                const nameVal = getVal('sn-field-name');
                const ssnVal = getVal('sn-field-ssn');
                const dobVal = getVal('sn-field-dob');
                try { form.getTextField('Date').setText(today); } catch (e) { }
                try { form.getTextField('ID').setText(`${nameVal}, SSN: ${ssnVal}`); } catch (e) { }
                try { form.getTextField('DOB').setText(dobVal); } catch (e) { }
            });

            setupPdfBtn('#sn-pdf-s2dds', 'https://raw.githubusercontent.com/kantngn/CM-Notes/refs/heads/main/db/S2DDS.pdf', 'Fax Status Sheet to DDS', (form, today) => {
                const ddsVal = getVal('sn-field-dds');
                const nameVal = getVal('sn-field-name');
                const ssnVal = getVal('sn-field-ssn');
                const dobVal = getVal('sn-field-dob');
                const lastUpdateVal = getVal('sn-last-update');
                const cm1Val = getVal('sn-global-cm1');
                const extVal = getVal('sn-global-ext');

                try { form.getTextField('Date').setText(today); } catch (e) { }
                try { form.getTextField('DDS').setText(ddsVal); } catch (e) { }
                try { form.getTextField('ID').setText(`${nameVal}, SSN: ${ssnVal}`); } catch (e) { }
                try { form.getTextField('Name').setText(nameVal); } catch (e) { }
                try { form.getTextField('SSN').setText(ssnVal); } catch (e) { }
                try { form.getTextField('Last update').setText(lastUpdateVal); } catch (e) { }
                try { form.getTextField('CM1').setText(cm1Val); } catch (e) { }
                try { form.getTextField('DOB').setText(dobVal); } catch (e) { }
                try { form.getTextField('Ext').setText(extVal); } catch (e) { }
            });
            // ── 1696 IP Contract Processing ──────────────────────────────────
            const fileInput1696 = container.querySelector('#sn-1696-file-input');
            const fileLabel1696 = container.querySelector('#sn-1696-file-label');
            const selectBtn1696 = container.querySelector('#sn-1696-select-btn');
            const processBtn1696 = container.querySelector('#sn-1696-process-btn');

            if (selectBtn1696 && fileInput1696) {
                selectBtn1696.onclick = () => fileInput1696.click();

                fileInput1696.onchange = () => {
                    const file = fileInput1696.files[0];
                    if (file) fileLabel1696.textContent = file.name;
                };

                processBtn1696.onclick = async () => {
                    const file = fileInput1696.files[0];
                    if (!file) { alert('Please select an IP Contract PDF first.'); return; }

                    const PDFLib = window.PDFLib;
                    if (!PDFLib) { alert('PDFLib not found. Ensure pdf-lib.min.js is in manifest.json.'); return; }

                    const originalText = processBtn1696.innerText;
                    processBtn1696.innerText = '⏳ Processing...';
                    processBtn1696.disabled = true;

                    try {
                        const { PDFDocument, rgb, StandardFonts } = PDFLib;
                        const fileBytes = await file.arrayBuffer();
                        const pdfDoc = await PDFDocument.load(fileBytes);

                        const helvetica     = await pdfDoc.embedFont(StandardFonts.Helvetica);
                        const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

                        const nameVal = getVal('sn-1696-name') || getVal('sn-field-name') || '';
                        const ssnVal  = getVal('sn-1696-ssn')  || getVal('sn-field-ssn')  || '';
                        const dobVal  = getVal('sn-1696-dob')  || getVal('sn-field-dob')  || '';
                        const addrVal = getVal('sn-1696-address') || '';
                        const today   = new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });

                        // ── Step 1: Stamp BEFORE deleting ───────────────────────────
                        // pdf-lib's getPages() always returns pages in their original
                        // document order regardless of removePage() calls. We must stamp
                        // first using original 0-based indices, then delete afterward.

                        // ── Step 2: Parse address into components ───────────────────
                        // Expected format: "123 Main St, Dallas, TX 75201"
                        // We split into: street | city | state (2-char) | zip
                        const STATE_ABBR = {
                            'alabama':'AL','alaska':'AK','arizona':'AZ','arkansas':'AR','california':'CA',
                            'colorado':'CO','connecticut':'CT','delaware':'DE','florida':'FL','georgia':'GA',
                            'hawaii':'HI','idaho':'ID','illinois':'IL','indiana':'IN','iowa':'IA',
                            'kansas':'KS','kentucky':'KY','louisiana':'LA','maine':'ME','maryland':'MD',
                            'massachusetts':'MA','michigan':'MI','minnesota':'MN','mississippi':'MS','missouri':'MO',
                            'montana':'MT','nebraska':'NE','nevada':'NV','new hampshire':'NH','new jersey':'NJ',
                            'new mexico':'NM','new york':'NY','north carolina':'NC','north dakota':'ND','ohio':'OH',
                            'oklahoma':'OK','oregon':'OR','pennsylvania':'PA','rhode island':'RI','south carolina':'SC',
                            'south dakota':'SD','tennessee':'TN','texas':'TX','utah':'UT','vermont':'VT',
                            'virginia':'VA','washington':'WA','west virginia':'WV','wisconsin':'WI','wyoming':'WY'
                        };
                        const toStateAbbr = (s) => {
                            if (!s) return '';
                            const t = s.trim();
                            if (/^[A-Z]{2}$/i.test(t)) return t.toUpperCase();
                            return STATE_ABBR[t.toLowerCase()] || t.toUpperCase();
                        };
                        const parseAddress = (raw) => {
                            const parts = raw.split(',').map(s => s.trim()).filter(s => s);
                            const street = parts[0] || '';
                            let city = '', state = '', zip = '';

                            if (parts.length >= 4) {
                                // Format: "Street, City, State, ZIP"
                                city  = parts[1];
                                state = toStateAbbr(parts[2]);
                                zip   = parts[3];
                            } else if (parts.length === 3) {
                                // Format: "Street, City, State ZIP"  or  "Street, City, State"
                                city = parts[1];
                                const last = parts[2];
                                const m = last.match(/^(.+?)\s+(\d{5}(?:-\d{4})?)$/);
                                if (m) { state = toStateAbbr(m[1]); zip = m[2]; }
                                else   { state = toStateAbbr(last); }
                            } else if (parts.length === 2) {
                                // Format: "Street, City State ZIP" (no inner commas)
                                const last = parts[1];
                                const m = last.match(/^(.*?)\s+([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
                                if (m) { city = m[1]; state = toStateAbbr(m[2]); zip = m[3]; }
                                else   { city = last; }
                            }

                            return { street, city, state, zip };
                        };
                        const addr = parseAddress(addrVal);

                        // ── Step 3: Stamp client data ────────────────────────────────
                        // Helper: draw text and auto-shrink font if it exceeds maxWidth.
                        const drawFit = (page, text, x, y, maxWidth, baseFontSize, font, color) => {
                            if (!text) return;
                            let size = baseFontSize;
                            while (size > 5 && font.widthOfTextAtSize(text, size) > maxWidth) size -= 0.5;
                            page.drawText(text, { x, y, size, font, color });
                        };
                        // drawExact: fixed size, no shrink
                        const drawExact = (page, text, x, y, size, font, color) => {
                            if (!text) return;
                            page.drawText(text, { x, y, size, font, color });
                        };

                        const black = rgb(0, 0, 0);
                        const red   = rgb(0.85, 0, 0);
                        const pages = pdfDoc.getPages(); // original order, before deletion

                        // ── Original Page 8 → 0-based index 7 ───────────────────────
                        // Client name: x=81, y=616 (1px down) | max width 114pt | Sz 12 scale-to-fit
                        if (pages.length > 7) {
                            drawFit(pages[7], nameVal, 81, 616, 114, 12, helvetica, black);
                        }

                        // ── Original Page 13 → 0-based index 12 ─────────────────────
                        if (pages.length > 12) {
                            const p13 = pages[12];

                            // Address (street only, no city/state/zip) — Sz 14
                            drawExact(p13, addr.street, 44, 489, 14, helvetica, black);

                            // City | State | Zip — Sz 14, y=445
                            // State col pulled back from zip (498) to 428; zip stays at 498
                            drawExact(p13, addr.city,  44,  445, 14, helvetica, black);
                            drawExact(p13, addr.state, 428, 445, 14, helvetica, black);
                            drawExact(p13, addr.zip,   498, 445, 14, helvetica, black);

                            // Disclaimer — two lines, Sz 12, red (not bold)
                            drawExact(p13, 'Please remove any additional representations listed prior to', 81, 325, 12, helvetica, red);
                            drawExact(p13, 'Andrew Kirkendall, Kirkendall Dwyer as listed below',          81, 305, 12, helvetica, red);
                        }

                        // ── Original Page 14 → 0-based index 13 ─────────────────────
                        if (pages.length > 13) {
                            const p14 = pages[13];

                            // Client name — x=273 (+4), y=714, Sz 12
                            drawExact(p14, nameVal, 273, 714, 12, helvetica, black);

                            // SSN & DOB — x+4 each, y=686, Sz 12
                            drawExact(p14, ssnVal,  274, 686, 12, helvetica, black);
                            drawExact(p14, dobVal,  449, 686, 12, helvetica, black);

                            // Address components — Sz 12
                            // Street x aligned to city x (188); state pulled back from zip col
                            drawExact(p14, addr.street, 188, 151, 12, helvetica, black);
                            drawExact(p14, addr.city,   188, 130, 12, helvetica, black);
                            drawExact(p14, addr.state,  490, 130, 12, helvetica, black);
                            drawExact(p14, addr.zip,    550, 130, 12, helvetica, black);

                            // Phone — x=53, y=129, Sz 12
                            const phoneVal1696 = getVal('sn-1696-phone') || '';
                            drawExact(p14, phoneVal1696, 53, 129, 12, helvetica, black);
                        }

                        // ── Step 2: Delete pages AFTER stamping ──────────────────────
                        // Remove highest index first to prevent index shifting.
                        //   Pages 9-12 (1-indexed) → indices 11, 10, 9, 8 (0-indexed)
                        //   Pages 1-3  (1-indexed) → indices  2,  1, 0   (0-indexed)
                        const pagesToRemove = [11, 10, 9, 8, 2, 1, 0];
                        for (const idx of pagesToRemove) {
                            if (idx < pdfDoc.getPageCount()) pdfDoc.removePage(idx);
                        }

                        // Save & download
                        const pdfBytes = await pdfDoc.save();
                        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
                        const url  = URL.createObjectURL(blob);
                        const a    = document.createElement('a');
                        a.href     = url;
                        a.download = `1696 Fee Agreement - ${nameVal} - Faxed ${today.replace(/\//g, '-')}.pdf`;
                        a.click();
                        URL.revokeObjectURL(url);

                        processBtn1696.innerText = '✅ Done';
                    } catch (err) {
                        console.error('[1696 Process]', err);
                        alert('Error processing PDF: ' + err.message);
                        processBtn1696.innerText = '❌ Error';
                    } finally {
                        processBtn1696.disabled = false;
                        setTimeout(() => processBtn1696.innerText = originalText, 2500);
                    }
                };
            }
        },

        renderIRPanel(container) {
            container.innerHTML = `
                <div style="padding:10px; display:flex; flex-direction:column; height:100%; box-sizing:border-box; gap:10px;">
                    <div style="display:flex; flex-direction:column; height:auto; flex-shrink:0;">
                        <button id="sn-ir-select-btn" style="width:100%; padding:10px; cursor:pointer; background:var(--sn-bg-lighter); border:1px solid var(--sn-border); border-radius:4px; color:var(--sn-primary-dark); font-weight:bold; display:flex; align-items:center; justify-content:center; gap:5px;">
                            <span>🎯</span> Select IR Report from Page
                        </button>
                        <div id="sn-ir-status" style="font-size:10px; color:#666; text-align:center; margin-top:4px; min-height:14px;"></div>
                    </div>
                    <div style="display:flex; flex-direction:column; flex-grow:1; overflow:hidden;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2px;">
                            <label style="font-weight:bold; color:var(--sn-primary-text); font-size:11px;">Output</label>
                            <button id="sn-ir-copy" style="cursor:pointer; background:var(--sn-bg-lighter); border:1px solid var(--sn-border); border-radius:3px; font-size:10px; padding:1px 5px; color:var(--sn-primary-dark);">Copy</button>
                        </div>
                        <div id="sn-ir-output" contenteditable="true" style="flex-grow:1; width:100%; border:1px solid #ccc; font-family:inherit; padding:5px; box-sizing:border-box; background:#fff; font-size:11px; overflow-y:auto; white-space:pre-wrap;"></div>
                    </div>
                </div>
            `;

            const isIRReport = (text) => {
                if (!text) return false;
                const lowerText = text.toLowerCase();
                return lowerText.includes('case level:') &&
                    lowerText.includes('receipt date:') &&
                    (lowerText.includes('claim #') || lowerText.includes('claim status:'));
            };

            const summarizeIR = (text, reportDate) => {
                if (!text) return "";
                const getVal = (regex, str = text) => (str.match(regex) || [])[1] || "";
                const fmtDate = (d) => { if (!d) return ""; const date = new Date(d); return isNaN(date) ? d : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };
                let caseLevel = getVal(/Case Level:\s*(.*)/i).trim();
                caseLevel = caseLevel.includes("Reconsideration") ? "Recon" : (caseLevel.includes("Initial") ? "IA" : caseLevel);
                const receiptDate = getVal(/Receipt Date:\s*(\d{2}\/\d{2}\/\d{4})/);
                const assignedDate = getVal(/First Date Assigned:\s*(\d{2}\/\d{2}\/\d{4})/);
                const claimBlocks = text.split(/Claim # \d+:/).slice(1);
                let types = new Set(), statuses = new Set(), office = "", closedDate = "";

                claimBlocks.forEach(block => {
                    const type = (block.match(/Claim Type:\s*(.*)/i) || [])[1] || "";
                    if (type.includes("Title 16")) types.add("T16"); if (type.includes("Title 2")) types.add("T2");
                    const stat = (block.match(/Claim Status:\s*(.*)/i) || [])[1] || "";
                    statuses.add(stat.trim());
                    if (stat.includes("Closed")) closedDate = (block.match(/Status Date:\s*(\d{2}\/\d{2}\/\d{4})/) || [])[1];
                    const off = (block.match(/Office\s+with\s+Jurisdiction:\s*(.*)/i) || [])[1];
                    if (off) office = off.trim();
                });

                const claimType = (types.has("T2") && types.has("T16")) ? "Concurrent" : (types.has("T2") ? "T2" : "T16");
                const isClosed = [...statuses].some(s => s.includes("Closed"));
                const isStaging = [...statuses].some(s => s.includes("Staging"));
                const article = /^[aeiou]/i.test(caseLevel) ? "an" : "a";
                let summary = `IR report received on ${reportDate} indicates ${article} ${caseLevel} ${claimType} claim`;

                if (isClosed) return `${summary} and was closed at DDS ${office} on ${fmtDate(closedDate)}.`;

                summary += `, received at DDS ${office} on ${fmtDate(receiptDate)}`;
                if (isStaging) {
                    summary += ` and the status was Staging.`;
                } else {
                    summary += (assignedDate === receiptDate) ? `, assigned on same date.` : `, assigned on ${fmtDate(assignedDate)}.`;
                }

                const arBarcodes = new Set();
                const clRequests = [];
                const facilities = {};
                const ceAppointments = [];

                // Split text into sections based on headers
                const sections = text.split(/(?=Claimant Information Request # \d+|Medical Evidence Request # \d+|CE Appointment # \d+)/);

                sections.forEach(section => {
                    if (section.includes("Claimant Information Request #")) {
                        let name = getVal(/Letter Name:\s*([^,\n]+)/, section).trim();
                        const date = fmtDate(getVal(/Date Sent:\s*(\d{2}\/\d{2}\/\d{4})/, section));
                        
                        if (name.toLowerCase().includes("barcode")) {
                            if (date) arBarcodes.add(date);
                        } else {
                            let address = getVal(/Address 1:\s*\[.*?Address:\s*([^\]]+)\s*\]/, section).trim();
                            
                            if (name.includes("Work History")) name = "WH";
                            else if (name.includes("Activities of Daily Living")) name = "ADL";
                            
                            if (name && date) {
                                clRequests.push({ name, date, address });
                            }
                        }
                    } else if (section.includes("Medical Evidence Request #")) {
                        let name = getVal(/Letter Name:\s*([^,\n]+)/, section).trim();
                        const sent = fmtDate(getVal(/Date Sent:\s*(\d{2}\/\d{2}\/\d{4})/, section));
                        
                        if (name.toLowerCase().includes("barcode")) {
                             if (sent) arBarcodes.add(sent);
                        } else {
                             const received = getVal(/Date Received:\s*(\d{2}\/\d{2}\/\d{4})/, section);
                             let org = getVal(/Organization Name:\s*([^,\]\n]+)/, section).trim();
                             if (!org) org = getVal(/Individual Name:\s*([^,\]\n]+)/, section).trim();
                             const address = getVal(/Facility Address:\s*([^\n]+)/, section).trim();
                             
                             if (org) {
                                if (!facilities[org]) facilities[org] = { address: address, reqs: [] };
                                facilities[org].reqs.push({ sent, received: fmtDate(received) });
                            }
                        }
                    } else if (section.includes("CE Appointment #")) {
                         const date = fmtDate(getVal(/Appointment Date:\s*(\d{2}\/\d{2}\/\d{4})/, section));
                         const time = getVal(/Appointment(?: Start)? Time:\s*([^,\n]+)/, section).trim();
                         const status = getVal(/Status:\s*([^,\n]+)/, section).trim();
                         const facilityRaw = getVal(/Facility:\s*\[([\s\S]*?)\]/, section);
                         const address = getVal(/Facility Address:\s*([^\n]+)/, section).trim();
                         
                         let indName = getVal(/Individual Name:\s*([^,\n]+)/, facilityRaw).trim();
                         let orgName = getVal(/Organization Name:\s*([^,\n]+)/, facilityRaw).trim();
                         
                         ceAppointments.push({ date, time, status, address, indName, orgName });
                    }
                });

                // AR Barcodes Output
                if (arBarcodes.size > 0) {
                    const dates = Array.from(arBarcodes).sort();
                    summary += `\n\nAR Barcode sent on ${dates.join(" and ")}.`;
                }

                // Client Letters Output
                if (clRequests.length > 0) {
                    const names = [...new Set(clRequests.map(r => r.name))];
                    const dates = [...new Set(clRequests.map(r => r.date))];
                    const addresses = [...new Set(clRequests.map(r => r.address).filter(a => a))];

                    const formatList = (list) => {
                        if (list.length === 0) return "";
                        if (list.length === 1) return list[0];
                        if (list.length === 2) return list.join(" and ");
                        return list.slice(0, -1).join(", ") + " and " + list[list.length - 1];
                    };

                    const nameStr = formatList(names);
                    const dateStr = dates.join(" and ");
                    const addrStr = addresses.length > 0 ? ` to ${formatList(addresses)}` : "";
                    const verb = names.length > 1 ? "were" : "was";

                    summary += `\n\n${nameStr} ${verb} sent to CL on ${dateStr}${addrStr}.`;
                }

                // Medical Evidence Output
                Object.entries(facilities).forEach(([org, data]) => {
                    if (data.reqs.length === 1) {
                        const r = data.reqs[0];
                        let line = `\n\nA Medical Report request was sent to ${org}, Address: ${data.address} on ${r.sent}`;
                        if (r.received) line += ` and received a reply on ${r.received}`;
                        else line += ` with no confirmation on receipt`;
                        line += ".";
                        summary += line;
                    } else {
                        const allNoReply = data.reqs.every(r => !r.received);
                        if (allNoReply) {
                            const dates = data.reqs.map(r => r.sent).join(" and ");
                            const countStr = data.reqs.length === 2 ? "both" : "all";
                            summary += `\n\nMedical Report requests were sent to ${org}, Address: ${data.address} on ${dates}, ${countStr} with no confirmation on receipt.`;
                        } else {
                            let line = `\n\nMedical Report requests were sent to ${org}, Address: ${data.address}.`;
                            const parts = data.reqs.map((r, i) => {
                                let p = i === 0 ? `One was sent on ${r.sent}` : `another was sent on ${r.sent}`;
                                if (r.received) p += ` and received a reply on ${r.received}`;
                                else p += ` with no confirmation on receipt`;
                                return p;
                            });
                            line += " " + parts.join(", and also ") + ".";
                            summary += line;
                        }
                    }
                });

                // CE Appointments
                ceAppointments.forEach(ce => {
                    let facilityStr = "";
                    if (ce.indName) facilityStr += " with " + ce.indName;
                    if (ce.orgName) facilityStr += " at " + ce.orgName;
                    
                    let line = `\n\nA CE appointment was scheduled for CL at ${ce.time} ${ce.date}${facilityStr}, ${ce.address}`;
                    if (ce.status.toLowerCase().includes("cancelled")) line += " - but it was cancelled.";
                    else if (ce.status.toLowerCase().includes("kept")) line += " - CL attendance was confirmed.";
                    else line += " - CL attendance was not confirmed.";
                    summary += line;
                });

                return summary;
            };

            const output = container.querySelector('#sn-ir-output');
            const copyBtn = container.querySelector('#sn-ir-copy');
            const selectBtn = container.querySelector('#sn-ir-select-btn');
            const statusDiv = container.querySelector('#sn-ir-status');
            let isCapturing = false, highlightEl = null, mouseOverHandler = null, clickHandler = null;

            const cleanup = () => {
                if (highlightEl) highlightEl.remove();
                if (mouseOverHandler) document.removeEventListener('mouseover', mouseOverHandler);
                if (clickHandler) document.removeEventListener('click', clickHandler, true);
                isCapturing = false;
                selectBtn.style.background = 'var(--sn-bg-lighter)';
                selectBtn.innerHTML = '<span>🎯</span> Select IR Report from Page';
                statusDiv.innerText = "";
            };

            selectBtn.onclick = (e) => {
                e.stopPropagation();
                if (isCapturing) { cleanup(); return; }
                isCapturing = true;
                selectBtn.style.background = '#ffccbc';
                selectBtn.innerHTML = '<span>❌</span> Cancel Selection';
                statusDiv.innerText = "Hover over text block & click to capture...";
                highlightEl = document.createElement('div');
                highlightEl.style.cssText = 'position:absolute; border:2px dashed #f44336; pointer-events:none; z-index:999999; background:rgba(244, 67, 54, 0.1); transition: all 0.1s ease;';
                document.body.appendChild(highlightEl);

                mouseOverHandler = (ev) => {
                    const container = ev.target.closest('.slds-timeline__item_expandable, .slds-card, .task-card');
                    const target = container || ev.target;
                    const text = target.innerText || "";

                    if (isIRReport(text)) {
                        highlightEl.style.borderColor = '#4CAF50'; // Green
                        highlightEl.style.background = 'rgba(76, 175, 80, 0.1)';
                    } else {
                        highlightEl.style.borderColor = '#f44336'; // Red
                        highlightEl.style.background = 'rgba(244, 67, 54, 0.1)';
                    }

                    const rect = target.getBoundingClientRect();
                    highlightEl.style.width = rect.width + 'px'; highlightEl.style.height = rect.height + 'px';
                    highlightEl.style.top = (rect.top + window.scrollY) + 'px'; highlightEl.style.left = (rect.left + window.scrollX) + 'px';
                };

                clickHandler = (ev) => {
                    if (ev.target === selectBtn || selectBtn.contains(ev.target)) return;
                    const container = ev.target.closest('.slds-timeline__item_expandable, .slds-card, .task-card');
                    const target = container || ev.target;
                    const text = target.innerText || target.value || "";

                    if (isIRReport(text)) {
                        ev.preventDefault(); ev.stopPropagation();
                        let dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                        const dateMatch = text.match(/(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}(?:,?\s+\d{4})?/i);
                        if (dateMatch) { dateStr = dateMatch[0]; if (!/\d{4}/.test(dateStr)) { dateStr += `, ${new Date().getFullYear()}`; } }
                        output.innerHTML = summarizeIR(text, dateStr);
                        statusDiv.innerText = "Captured!";
                        setTimeout(() => statusDiv.innerText = "", 2000);
                        cleanup();
                    }
                };
                document.addEventListener('mouseover', mouseOverHandler);
                document.addEventListener('click', clickHandler, true);
            };

            copyBtn.onclick = () => {
                GM_setClipboard(output.innerText);
                copyBtn.innerText = "Copied!";
                setTimeout(() => copyBtn.innerText = "Copy", 1000);
            };
        }
    };

    app.Tools.FeaturePanels = FeaturePanels;
})();
