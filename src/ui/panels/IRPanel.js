(function () {
    const app = window.CM_App = window.CM_App || {};
    app.Tools = app.Tools || {};

    /**
     * IR Tool panel — captures IR (Interim Report) text from the page and
     * produces a natural-language summary. Supports logging the summary to
     * Salesforce as a Last Activity and FACT log entry.
     *
     * @namespace app.Tools.IRPanel
     */
    const IRPanel = {
        /**
         * Creates (or toggles) the IR Tool panel window.
         */
        create() {
            const id = 'sn-ir-panel';
            const existing = document.getElementById(id);
            if (existing) {
                app.Core.Windows.toggle(id);
                return;
            }

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

            const defPos = GM_getValue('def_pos_IR', { width: '350px', height: 'auto', bottom: '50px', left: 'calc(50% - 175px)' });

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
                         <button id="sn-ir-min" style="cursor:pointer; background:none; border:none; font-weight:bold;">_</button>
                         <span style="font-weight:bold; color:var(--sn-primary-dark);">IR Tool - Client</span>
                    </div>
                    <button id="sn-ir-close" style="background:none; border:none; font-weight:bold; cursor:pointer; font-size:14px; margin-left:5px;">X</button>
                </div>
                <div id="ir-body" style="overflow-y:auto; flex-grow:1;">
                    <!-- Content will be rendered here -->
                </div>
                <div class="sn-resizer rs-n"></div><div class="sn-resizer rs-s"></div>
                <div class="sn-resizer rs-e"></div><div class="sn-resizer rs-w"></div>
                <div class="sn-resizer rs-ne"></div><div class="sn-resizer rs-nw"></div>
                <div class="sn-resizer rs-se"></div><div class="sn-resizer rs-sw"></div>
            `;
            document.body.appendChild(w);
            app.Core.Windows.setup(w, w.querySelector('#sn-ir-min'), w.querySelector('.sn-header'), 'IR');
            w.querySelector('#sn-ir-close').onclick = () => { w.style.display = 'none'; app.Core.Windows.updateTabState(w.id); };

            this._renderIRPanel(w.querySelector('#ir-body'));
        },

        // ── IR Report detection ──────────────────────────────────────────────

        _isIRReport(text) {
            if (!text) return false;
            const lowerText = text.toLowerCase();
            return lowerText.includes('case level:') &&
                lowerText.includes('receipt date:') &&
                (lowerText.includes('claim #') || lowerText.includes('claim status:'));
        },

        // ── Summarization ────────────────────────────────────────────────────

        _summarizeIR(text, reportDate) {
            if (!text) return "";

            const getVal = (regex, str = text) => (str.match(regex) || [])[1] || "";
            const fmtDate = (d) => {
                if (!d) return "";
                const date = new Date(d);
                return isNaN(date) ? d : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            };

            let caseLevel = getVal(/Case Level:\s*(.*)/i).trim();
            caseLevel = caseLevel.includes("Reconsideration") ? "Recon" : (caseLevel.includes("Initial") ? "IA" : caseLevel);
            const receiptDate = getVal(/Receipt Date:\s*(\d{2}\/\d{2}\/\d{4})/);
            const assignedDate = getVal(/First Date Assigned:\s*(\d{2}\/\d{2}\/\d{4})/);
            const claimBlocks = text.split(/Claim # \d+:/).slice(1);
            const types = new Set();
            const statuses = new Set();
            let office = "";
            const closedClaims = [];

            claimBlocks.forEach(block => {
                const type = (block.match(/Claim Type:\s*(.*)/i) || [])[1] || "";
                let abbr = "";
                if (type.includes("Title 16")) { types.add("T16"); abbr = "T16"; }
                if (type.includes("Title 2")) { types.add("T2"); abbr = "T2"; }
                const stat = (block.match(/Claim Status:\s*(.*)/i) || [])[1] || "";
                statuses.add(stat.trim());
                if (stat.includes("Closed")) {
                    const cDate = (block.match(/Status Date:\s*(\d{2}\/\d{2}\/\d{4})/) || [])[1];
                    closedClaims.push({ type: abbr, date: cDate });
                }
                const off = (block.match(/Office\s+with\s+Jurisdiction:\s*(.*)/i) || [])[1];
                if (off) office = off.trim();
            });

            const claimType = (types.has("T2") && types.has("T16")) ? "Concurrent" : (types.has("T2") ? "T2" : "T16");
            const isStaging = [...statuses].some(s => s.includes("Staging"));
            const article = /^[aeiou]/i.test(caseLevel) ? "an" : "a";
            let summary = `IR report received on ${reportDate} indicates ${article} ${caseLevel} ${claimType} claim`;

            summary += `, received at DDS ${office} on ${fmtDate(receiptDate)}`;
            if (isStaging) {
                summary += ` and the status was Staging.`;
            } else {
                summary += (assignedDate === receiptDate) ? `, assigned on same date.` : `, assigned on ${fmtDate(assignedDate)}.`;
            }

            if (closedClaims.length > 0) {
                const closedParts = closedClaims.map(c => `${c.type} was closed ${c.date}`);
                summary += ` ${closedParts.join(" and ")}.`;
                if (closedClaims.length === claimBlocks.length) {
                    return summary;
                }
            }

            const arBarcodes = new Set();
            const clRequests = [];
            const facilities = {};
            const ceAppointments = [];

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
                        if (name && date) clRequests.push({ name, date, address });
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
                            if (!facilities[org]) facilities[org] = { address, reqs: [] };
                            facilities[org].reqs.push({ sent, received: fmtDate(received) });
                        }
                    }
                } else if (section.includes("CE Appointment #")) {
                    const date = fmtDate(getVal(/Appointment Date:\s*(\d{2}\/\d{2}\/\d{4})/, section));
                    const time = getVal(/Appointment(?: Start)? Time:\s*([^,\n]+)/, section).trim();
                    const status = getVal(/Status:\s*([^,\n]+)/, section).trim();
                    const facilityRaw = getVal(/Facility:\s*\[([\s\S]*?)\]/, section);
                    const address = getVal(/Facility Address:\s*([^\n]+)/, section).trim();
                    const indName = getVal(/Individual Name:\s*([^,\n]+)/, facilityRaw).trim();
                    const orgName = getVal(/Organization Name:\s*([^,\n]+)/, facilityRaw).trim();
                    ceAppointments.push({ date, time, status, address, indName, orgName });
                }
            });

            // AR Barcodes
            if (arBarcodes.size > 0) {
                const dates = Array.from(arBarcodes).sort();
                summary += `\n\nAR Barcode sent on ${dates.join(" and ")}.`;
            }

            // Client Letters
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

            // Medical Evidence
            Object.entries(facilities).forEach(([org, facData]) => {
                if (facData.reqs.length === 1) {
                    const r = facData.reqs[0];
                    let line = `\n\nA Medical Report request was sent to ${org}, Address: ${facData.address} on ${r.sent}`;
                    if (r.received) line += ` and received a reply on ${r.received}`;
                    else line += ` with no confirmation on receipt`;
                    line += ".";
                    summary += line;
                } else {
                    const allNoReply = facData.reqs.every(r => !r.received);
                    if (allNoReply) {
                        const dates = facData.reqs.map(r => r.sent).join(" and ");
                        const countStr = facData.reqs.length === 2 ? "both" : "all";
                        summary += `\n\nMedical Report requests were sent to ${org}, Address: ${facData.address} on ${dates}, ${countStr} with no confirmation on receipt.`;
                    } else {
                        let line = `\n\nMedical Report requests were sent to ${org}, Address: ${facData.address}.`;
                        const parts = facData.reqs.map((r, i) => {
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
        },

        // ── UI Rendering ─────────────────────────────────────────────────────

        _renderIRPanel(container) {
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
                            <div style="display:flex; gap:4px;">
                                <button id="sn-ir-log-activity" style="cursor:pointer; background:var(--sn-primary); border:1px solid var(--sn-primary); border-radius:3px; font-size:10px; padding:1px 6px; color:white; font-weight:bold;">📋 Log Activity</button>
                                <button id="sn-ir-copy" style="cursor:pointer; background:var(--sn-bg-lighter); border:1px solid var(--sn-border); border-radius:3px; font-size:10px; padding:1px 5px; color:var(--sn-primary-dark);">Copy</button>
                            </div>
                        </div>
                        <div id="sn-ir-output" contenteditable="true" style="flex-grow:1; width:100%; border:1px solid #ccc; font-family:inherit; padding:5px; box-sizing:border-box; background:#fff; font-size:11px; overflow-y:auto; white-space:pre-wrap;"></div>
                    </div>
                </div>
            `;

            this._bindIREvents(container);
        },

        _bindIREvents(container) {
            const output = container.querySelector('#sn-ir-output');
            const copyBtn = container.querySelector('#sn-ir-copy');
            const selectBtn = container.querySelector('#sn-ir-select-btn');
            const statusDiv = container.querySelector('#sn-ir-status');
            let isCapturing = false, highlightEl = null, mouseOverHandler = null, clickHandler = null;

            const cleanup = () => {
                if (highlightEl) highlightEl.remove();
                if (mouseOverHandler) document.removeEventListener('mouseover', mouseOverHandler);
                if (clickHandler) document.removeEventListener('click', clickHandler, true);
                if (keydownHandler) document.removeEventListener('keydown', keydownHandler);
                isCapturing = false;
                selectBtn.style.background = 'var(--sn-bg-lighter)';
                selectBtn.innerHTML = '<span>🎯</span> Select IR Report from Page';
                statusDiv.innerText = "";
            };

            const keydownHandler = (ev) => {
                if (ev.key === 'Escape') { cleanup(); }
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
                    const cont = ev.target.closest('.slds-timeline__item_expandable, .slds-card, .task-card');
                    const target = cont || ev.target;
                    const text = target.innerText || "";

                    if (this._isIRReport(text)) {
                        highlightEl.style.borderColor = '#4CAF50';
                        highlightEl.style.background = 'rgba(76, 175, 80, 0.1)';
                    } else {
                        highlightEl.style.borderColor = '#f44336';
                        highlightEl.style.background = 'rgba(244, 67, 54, 0.1)';
                    }

                    const rect = target.getBoundingClientRect();
                    highlightEl.style.width = rect.width + 'px';
                    highlightEl.style.height = rect.height + 'px';
                    highlightEl.style.top = (rect.top + window.scrollY) + 'px';
                    highlightEl.style.left = (rect.left + window.scrollX) + 'px';
                };

                clickHandler = (ev) => {
                    if (ev.target === selectBtn || selectBtn.contains(ev.target)) return;
                    const cont = ev.target.closest('.slds-timeline__item_expandable, .slds-card, .task-card');
                    const target = cont || ev.target;
                    const text = target.innerText || target.value || "";

                    if (this._isIRReport(text)) {
                        ev.preventDefault();
                        ev.stopPropagation();
                        let dateStr = "";
                        const dueDateEl = (cont || target).querySelector('.dueDate');
                        if (dueDateEl) {
                            const dueText = dueDateEl.textContent.trim();
                            if (dueText.toLowerCase() === 'today') {
                                dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                            } else if (dueText.toLowerCase() === 'yesterday') {
                                const yesterday = new Date();
                                yesterday.setDate(yesterday.getDate() - 1);
                                dateStr = yesterday.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                            } else {
                                dateStr = dueText;
                                if (!/\d{4}/.test(dateStr)) dateStr += `, ${new Date().getFullYear()}`;
                            }
                        }
                        if (!dateStr) {
                            const dateMatch = text.match(/(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}(?:,?\s+\d{4})?/i);
                            if (dateMatch) {
                                dateStr = dateMatch[0];
                                if (!/\d{4}/.test(dateStr)) dateStr += `, ${new Date().getFullYear()}`;
                            } else {
                                dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                            }
                        }
                        output.innerHTML = this._summarizeIR(text, dateStr);
                        statusDiv.innerText = "Captured!";
                        setTimeout(() => statusDiv.innerText = "", 2000);
                        cleanup();
                    }
                };

                document.addEventListener('mouseover', mouseOverHandler);
                document.addEventListener('click', clickHandler, true);
                document.addEventListener('keydown', keydownHandler);
            };

            copyBtn.onclick = () => {
                GM_setClipboard(output.innerText);
                copyBtn.innerText = "Copied!";
                setTimeout(() => copyBtn.innerText = "Copy", 1000);
            };

            const logActivityBtn = container.querySelector('#sn-ir-log-activity');
            if (logActivityBtn) {
                logActivityBtn.onclick = async () => {
                    const summaryText = output.innerText || output.textContent || "";
                    if (!summaryText.trim()) {
                        app.Core.Utils.showNotification("No IR summary to log. Capture a report first.", { type: 'error' });
                        return;
                    }

                    const originalText = logActivityBtn.innerText;
                    logActivityBtn.disabled = true;
                    logActivityBtn.innerText = '⏳ FACT logging...';

                    try {
                        const TA = app.Automation.TaskAutomation;
                        if (!TA) throw new Error("TaskAutomation not available.");

                        logActivityBtn.innerText = '⏳ Activity...';
                        const panel = await TA.clickLastActivity();
                        await TA.fillSubject('Call to DDS', panel);
                        await TA.fillComment(summaryText, panel);
                        await TA.clickSaveButton(500, panel);

                        logActivityBtn.innerText = '⏳ FACT...';
                        await TA.runFACTLog(summaryText);

                        logActivityBtn.innerText = '✅ Logged';
                        app.Core.Utils.showNotification("FACT + Activity logged successfully.", { type: 'success', duration: 3000 });
                    } catch (err) {
                        console.error("[IR Log Activity]", err);
                        logActivityBtn.innerText = '❌ Error';
                        app.Core.Utils.showNotification("Log Error: " + err.message, { type: 'error' });
                    }

                    setTimeout(() => {
                        logActivityBtn.innerText = originalText;
                        logActivityBtn.disabled = false;
                    }, 5000);
                };
            }
        }
    };

    app.Tools.IRPanel = IRPanel;
})();
