export const Taskbar = {
    update() {
        const bar = document.getElementById('sn-taskbar');
        if (!bar) return;

        let ctr = document.getElementById('sn-taskbar-counters');
        if (!ctr) {
            ctr = document.createElement('div');
            ctr.id = 'sn-taskbar-counters';
            bar.appendChild(ctr);
        }

        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).getTime();

        let touchedCount = 0;
        let revisitCount = 0;

        const keys = GM_listValues().filter(k => k.startsWith('cn_') && !k.startsWith('cn_color') && !k.startsWith('cn_form'));

        keys.forEach(k => {
            const d = GM_getValue(k);
            if (d) {
                if (d.timestamp && d.timestamp >= startOfDay) touchedCount++;
                if (d.revisitActive && d.revisit) {
                    const [y, m, day] = d.revisit.split('-').map(Number);
                    const revTime = new Date(y, m - 1, day).getTime();
                    if (revTime <= endOfToday) revisitCount++;
                }
            }
        });

        let html = `
            <div class="sn-counter-item" title="Records edited today" style="margin-right:10px;">
                <span>Matter touched today:</span>
                <span>${touchedCount}</span>
            </div>
        `;

        const dashBtn = document.getElementById('sn-dash-btn');
        if (revisitCount > 0) {
            html += `<div class="sn-counter-item sn-counter-urgent" title="Revisits due today or earlier"><span>Matter Revisit due:</span><span>${revisitCount}</span></div>`;
            if (dashBtn) dashBtn.classList.add('sn-urgent');
        } else {
            if (dashBtn) dashBtn.classList.remove('sn-urgent');
        }
        ctr.innerHTML = html;
    }
};
