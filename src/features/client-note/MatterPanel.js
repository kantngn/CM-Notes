export const MatterPanel = {
    updateIndicators(w, data, app) {
        let currentData = data;
        if (!currentData) {
            const h = app.Core.Scraper.getHeaderData();
            const p = app.Core.Scraper.getAllPageData();
            currentData = { ...h, ...p };
        }

        const qDateStr = currentData.qualDate || currentData["Qualification Date"];
        const ifdStr = currentData.ifd || currentData["Date Filed: App"];

        // PTR Logic
        let isPTR = false;
        if (qDateStr && ifdStr) {
            const qDate = new Date(qDateStr);
            const fDate = new Date(ifdStr);
            if (!isNaN(qDate) && !isNaN(fDate) && fDate < qDate) {
                isPTR = true;
            }
        }

        // Update Status Bar
        const ptrInd = w.querySelector('#sn-ptr-indicator');
        if (ptrInd) ptrInd.style.display = isPTR ? 'block' : 'none';

        // Update Matter Panel Checkbox
        const ptrCheck = w.querySelector('#sn-ptr-check');
        if (ptrCheck) {
            ptrCheck.checked = isPTR;
            const label = ptrCheck.parentElement;
            if (label) {
                label.style.color = isPTR ? '#d32f2f' : '#333';
                label.style.fontWeight = isPTR ? 'bold' : 'normal';
            }
        }
    },

    render(container, context) {
        const { w, app } = context;

        // Per user request: data is scraped every time panel is opened and is not saved.
        const pageData = app.Core.Scraper.getAllPageData();
        const headerData = app.Core.Scraper.getHeaderData();

        // Combine data, giving preference to header data for the specified fields
        const scrapedData = {
            ...pageData,
            qualDate: headerData["Qualification Date"] || pageData.qualDate,
            ifd: headerData["Date Filed: App"] || pageData.ifd
        };
        const displayStyle = "width:100%; box-sizing:border-box; border:none; padding:2px 4px; background:#f0f0f0; font-family:inherit; font-size:inherit; cursor:default; border-radius: 3px;";

        const createField = (label, value = '', id = '') => {
            return `<div style="flex:1; min-width:0;"><div style="font-size:0.85em; color:#555; font-weight:bold; margin-bottom:2px;">${label}</div><input id="${id}" value="${value || ''}" readonly style="${displayStyle}"></div>`;
        };

        const createCheckbox = (label, id = '', checked = false) => {
            return `<label style="display:flex; align-items:center; font-size:0.9em; color:#333; padding-bottom: 3px;"><input type="checkbox" id="${id}" ${checked ? 'checked' : ''} disabled style="margin-right:4px; transform: scale(1.2);">${label}</label>`;
        };

        const createInlineField = (label, value = '', id = '') => {
            return `<div style="display:flex; align-items:center; gap:8px; flex:1; min-width:0;">
                    <div style="font-size:0.85em; color:#555; font-weight:bold; white-space:nowrap;">${label}</div>
                    <input id="${id}" value="${value || ''}" readonly style="${displayStyle} flex:1;">
                    </div>`;
        };

        container.innerHTML = `
            <style>
                .sn-mp-area { padding-bottom: 6px; margin-bottom: 6px; border-bottom: 1px solid #ddd; }
                .sn-mp-area:last-child { border-bottom: none; margin-bottom: 0; }
                .sn-mp-title { font-weight: bold; color: var(--sn-primary-dark); padding-bottom: 4px; margin-bottom: 6px; font-size: 1em; }
                .sn-mp-sub-area { border-top: 1px dashed #bbb; padding-top: 6px; margin-top: 6px; }
                .sn-mp-sub-title { font-weight: bold; color: #333; margin-bottom: 4px; font-size: 0.95em; }
                .sn-mp-row { display: flex; gap: 8px; margin-bottom: 6px; align-items: flex-end; }
            </style>
            <div style="padding:10px; font-size:0.9em; overflow-y:auto; height:100%; background:#f9f9f9; box-sizing:border-box;">
                <!-- Area 1: App Filing -->
                <div class="sn-mp-area">
                    <div class="sn-mp-title">App Filing</div>
                    <div class="sn-mp-row" title="sn-mp-row App Filing">
                        ${createField('Intake', scrapedData.qualDate)}
                        ${createField('IFD', scrapedData.ifd)}
                        ${createCheckbox('PTR', 'sn-ptr-check')}
                    </div> 
                    <div class="sn-mp-row">
                        ${createField('Qual.', '')}
                        ${createField('.', '')}
                    </div>
                </div>

                <!-- Area 2: Claim Detail -->
                <div class="sn-mp-area">
                    <div class="sn-mp-title">Claim Detail</div>
                    <div class="sn-mp-row" title = "sn-mp-row Claim Detail">
                        ${createField('AOD', scrapedData.aod)}
                        ${createField('DLI', scrapedData.dli)}
                        ${createField('Blind DLI', scrapedData.blindDli)}
                    </div> 
                    <div class="sn-mp-row">
                        ${createField('IR Status Date', scrapedData.irStatusDate)}
                        ${createField('Days from App', '...')}
                    </div>
                    <div class="sn-mp-row" style="justify-content: space-around; margin-top: 15px;">
                        ${createCheckbox('1696 Confirmed', 'sn-1696-check')}
                        ${createCheckbox('ERE Access', 'sn-ere-check', scrapedData.ereStatus)}
                    </div>
                </div>

                <!-- Area 3: Claim Status -->
                <div class="sn-mp-area" title="sn-mp-area Claim Status">
                    <div class="sn-mp-title">Claim Status</div>
                    <div class="sn-mp-sub-area">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                            <div class="sn-mp-sub-title" style="margin-bottom: 0;">Initial Application</div>
                            ${createCheckbox('SSA Confirmed', 'sn-ia-ssa-check')}
                        </div> 
                        
                        <div class="sn-mp-row">
                            ${createInlineField('Dec. Date: App', scrapedData.decDateApp)}
                        </div> 
                        
                        <div class="sn-mp-row">${createField('T2 Decision', scrapedData.t2Dec)} ${createField('Reason', scrapedData.t2Reason)} ${createField('Date', scrapedData.t2Date)}</div>
                        <div class="sn-mp-row">${createField('T16 Decision', scrapedData.t16Dec)} ${createField('Reason', scrapedData.t16Reason)} ${createField('Date', scrapedData.t16Date)}</div>
                        
                        <div class="sn-mp-row">
                            ${createInlineField('IA Appeal SOL', scrapedData.iaSol)}
                        </div>
                    </div>
                    <div class="sn-mp-sub-area">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                            <div class="sn-mp-sub-title" style="margin-bottom: 0;">Reconsideration</div>
                            ${createCheckbox('SSA Confirmed', 'sn-recon-ssa-check')}
                        </div>
                        <div class="sn-mp-row" title = "sn-mp-row Reconsideration">
                            ${createInlineField('Date File: Recon', scrapedData.dateFileRecon)}
                        </div>
                        <div class="sn-mp-row">
                            ${createField('Reentry #', '')}
                            ${createField('Days since Recon', '...')}
                        </div>
                    </div>
                </div>

                <!-- Area 4: CM Status -->
                <div class="sn-mp-area" title = "sn-mp-area CM Status">
                    <div class="sn-mp-title">CM Status</div> 
                    <div class="sn-mp-row">${createField('Last CM1 Upd', scrapedData.lastCU)} ${createField('Last CM1 Att', scrapedData.lastCA)}</div>
                    <div class="sn-mp-row">${createField('Last ISU', scrapedData.lastStatusUpd)} ${createField('Last ISU Att', scrapedData.lastStatusAtt)}</div>
                </div>
            </div>
        `;
        // After rendering, update indicators which rely on these new DOM elements.
        this.updateIndicators(w, scrapedData, app);
    }
};
