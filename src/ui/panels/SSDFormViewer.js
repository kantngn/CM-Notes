const app = window.CM_App = window.CM_App || {};

export const SSDFormViewer = {
    async toggle() {
        const id = 'sn-ssd-viewer';
        const existing = document.getElementById(id);
        const clientId = app.AppObserver.getClientId();

        const scrapeAndSave = async () => {
            if (!clientId) return;

            const contentDiv = document.getElementById('ssd-content');
            if (contentDiv) contentDiv.innerHTML = '<div style="padding:20px; text-align:center; color:#e65100;">⏳ Switching tabs & scraping...</div>';

            const data = await app.Core.Scraper.getFullSSDData();

            const hasContent = Object.values(data).some(val => val && val.trim().length > 0);
            if (!hasContent) {
                console.warn("[SSDFormViewer] ⚠️ Scraper found no data. Skipping save to prevent overwrite.");
                return;
            }

            this.renderContent(existing || document.getElementById(id), data);
            app.Features.ClientNote.updateAndSaveData(clientId, data);
        };

        if (existing) {
            if (existing.style.display === 'none') app.Core.Windows.toggle(id);
            await scrapeAndSave();
            return;
        }

        const w = document.createElement('div');
        w.id = id; w.className = 'sn-window';
        w.style.width = '400px'; w.style.height = 'auto'; w.style.maxHeight = '600px';
        w.style.top = '100px'; w.style.left = '100px';
        w.style.backgroundColor = 'var(--sn-bg-lighter)'; w.style.border = '1px solid var(--sn-border)';

        w.innerHTML = `
            <div class="sn-header" style="background:var(--sn-bg-light); border-bottom:1px solid var(--sn-border); color:var(--sn-primary-text);">
                <span style="font-weight:bold;">SSD App Form Data</span>
                <button id="ssd-close" style="background:none; border:none; color:var(--sn-primary-text); cursor:pointer; font-weight:bold;">X</button>
            </div>
            <div id="ssd-content" style="padding:10px; overflow-y:auto; flex-grow:1; background:#fff; min-height:200px;">
            </div>
            <div style="padding:8px; border-top:1px solid var(--sn-bg-light); display:flex; justify-content:center; align-items:center; gap:20px; background:var(--sn-bg-lighter);">
                <label style="cursor:pointer; font-size:12px; color:var(--sn-text-main); display:flex; align-items:center;">
                    <input type="checkbox" id="ssd-autoclose-next" style="margin-right:5px;">
                    auto close next time?
                </label>
                <button id="ssd-close-app" style="padding:5px 10px; cursor:pointer; font-weight:bold; color:var(--sn-primary-text); border:1px solid var(--sn-border); background:white;">Close SSD App</button>
            </div>
        `;

        document.body.appendChild(w);
        app.Core.Windows.makeDraggable(w, w.querySelector('.sn-header'));

        const autoCloseCheck = w.querySelector('#ssd-autoclose-next');
        autoCloseCheck.checked = GM_getValue('sn_ssd_autoclose', false);
        autoCloseCheck.onchange = () => {
            GM_setValue('sn_ssd_autoclose', autoCloseCheck.checked);
        };

        await scrapeAndSave();

        w.querySelector('#ssd-close').onclick = () => w.remove();
        w.querySelector('#ssd-close-app').onclick = () => {
            window.close();
        };
    },

    renderContent(w, data) {
        if (!w) return;
        const container = w.querySelector('#ssd-content');
        let rows = '';

        const order = ['Address', 'Phone', 'Email', 'POB', 'Parents', 'Witness', 'Condition', 'Assistive Devices', 'Medical Provider'];

        const sortedKeys = Object.keys(data).sort((a, b) => {
            const idxA = order.indexOf(a);
            const idxB = order.indexOf(b);
            if (idxA !== -1 && idxB !== -1) return idxA - idxB;
            if (idxA !== -1) return -1;
            if (idxB !== -1) return 1;
            return a.localeCompare(b);
        });

        for (const key of sortedKeys) {
            const val = data[key];
            if (!val) continue;
            rows += `<div style="display:flex; border-bottom:1px solid var(--sn-bg-light); padding:4px;">
                <strong style="width:120px; color:var(--sn-primary-text); font-size:11px; flex-shrink:0;">${key}:</strong>
                <span style="flex-grow:1; font-size:11px; word-break:break-word; white-space:pre-wrap;">${val}</span>
            </div>`;
        }

        container.innerHTML = rows || '<div style="padding:10px; text-align:center; color:#999;">No relevant data found on this page.</div>';
    }
};
