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

            const clientId = app.AppObserver.getClientId();
            if (!clientId) {
                app.Core.Utils.showNotification("Client context not found.", { type: 'error' });
                return;
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
                        updateFields('sn-field-name', sidebarData.name);
                        updateFields('sn-field-ssn', sidebarData.ssn);
                        updateFields('sn-field-dob', sidebarData.dob);
                        updateFields('sn-field-phone', formData['Phone']);
                        updateFields('sn-field-addr', formData['Address']);
                        updateFields('sn-field-dds', formData.DDS_Selection);
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

            const styles = `border:none; border-bottom:1px dashed #999; background:transparent; font-family:inherit; width:100%;`;
            const createField = (lbl, val, hasCheck = false, extraClass = '', checkId = '') => `
                <div style="display:flex; align-items:center; margin-bottom:4px; font-size:0.9em;">
                    ${hasCheck ? `<input type="checkbox" ${checkId ? `id="${checkId}"` : ''} style="margin-right:4px;">` : ''}
                    <span style="color:#555; margin-right:4px; font-weight:bold; white-space:nowrap;">${lbl}:</span>
                    <input type="text" class="sn-fax-input ${extraClass}" value="${val || ''}" readonly style="${styles}">
                </div>`;

            const sections = [
                { title: "Letter 25", content: `${createField('Name', data.name, false, 'sn-field-name')}${createField('SSN', data.ssn, false, 'sn-field-ssn')}${createField('Phone', formData['Phone'] || '', true, 'sn-field-phone', 'sn-l25-phone-chk')}${createField('Address', formData['Address'] || '', true, 'sn-field-addr', 'sn-l25-addr-chk')}<button id="sn-pdf-l25" style="margin-top:5px; width:100%;">📄 Generate PDF</button>` },
                { title: "Status to DDS", content: `${createField('DDS', ddsName, false, 'sn-field-dds')}${createField('Fax #', '', false, 'sn-field-fax')}${createField('Name', data.name, false, 'sn-field-name')}${createField('SSN', data.ssn, false, 'sn-field-ssn')}${createField('DOB', data.dob, false, 'sn-field-dob')}${createField('Last update', 'N/A', false, 'sn-last-update')}${createField('CM1', globalCM1, false, 'sn-global-cm1')}${createField('Ext.', globalExt, false, 'sn-global-ext')}<button id="sn-pdf-s2dds" style="margin-top:5px; width:100%;">📄 Generate PDF</button>` },
                { title: "Status to FO", content: `${createField('Name', data.name, false, 'sn-field-name')}${createField('SSN', data.ssn, false, 'sn-field-ssn')}${createField('DOB', data.dob, false, 'sn-field-dob')}<button id="sn-pdf-s2fo" style="margin-top:5px; width:100%;">📄 Generate PDF</button>` }
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
                const phoneChk = container.querySelector('#sn-l25-phone-chk').checked;
                const addrChk = container.querySelector('#sn-l25-addr-chk').checked;
                const nameVal = getVal('sn-field-name');
                const ssnVal = getVal('sn-field-ssn');
                const phoneVal = getVal('sn-field-phone');
                const addrVal = getVal('sn-field-addr');

                try { form.getTextField('Date').setText(today); } catch (e) { }
                try { form.getTextField('Name').setText(nameVal); } catch (e) { }
                try { form.getTextField('SSN').setText(ssnVal); } catch (e) { }
                let header = "", info1 = "", info2 = "", info3 = "";
                if (phoneChk && !addrChk) { header = "Current Phone Number"; info1 = phoneVal; }
                else if (!phoneChk && addrChk) { header = "Current Address"; const parts = addrVal.split(','); info1 = parts[0] ? parts[0].trim() : ""; info2 = parts.slice(1).join(',').trim(); }
                else if (phoneChk && addrChk) { header = "Current Phone Number and Address"; info1 = phoneVal; const parts = addrVal.split(','); info2 = parts[0] ? parts[0].trim() : ""; info3 = parts.slice(1).join(',').trim(); }
                try { form.getTextField('Header').setText(header); } catch (e) { }
                try { form.getTextField('Info1').setText(info1); } catch (e) { }
                try { form.getTextField('Info2').setText(info2); } catch (e) { }
                try { form.getTextField('Info3').setText(info3); } catch (e) { }
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
                            const org = getVal(/Organization Name:\s*([^,\]\n]+)/, section).trim();
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
