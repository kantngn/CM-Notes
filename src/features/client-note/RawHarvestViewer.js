/**
 * @file RawHarvestViewer.js
 * @description Floating window that displays ALL raw harvested fields from
 *   harvestFields() — opened via Alt+Shift+I. Shows every label→value
 *   pair the scraper found, with no filtering or restructuring.
 *
 * @uses app.Core.Scraper (harvestFields)
 * @namespace app.Features.RawHarvestViewer
 */
(function () {
    const app = window.CM_App = window.CM_App || {};
    app.Features = app.Features || {};

    const RawHarvestViewer = {
        _winId: 'sn-raw-harvest-viewer',

        toggle() {
            const existing = document.getElementById(this._winId);
            if (existing) {
                if (existing.style.display === 'none') {
                    existing.style.display = 'flex';
                    this._scrapeAndRender(existing);
                } else {
                    existing.remove();
                }
                return;
            }
            this._create();
        },

        _create() {
            const w = document.createElement('div');
            w.id = this._winId;
            w.className = 'sn-window';
            w.style.cssText = 'width:380px;height:auto;max-height:500px;top:80px;left:120px;background:#fff;border:1px solid #999;border-radius:4px;box-shadow:2px 2px 10px rgba(0,0,0,0.2);display:flex;flex-direction:column;z-index:100000;font-size:12px;font-family:sans-serif;';

            w.innerHTML = `
                <div style="display:flex;align-items:center;padding:5px 8px;background:#e8eaf6;border-bottom:1px solid #999;border-radius:4px 4px 0 0;cursor:move;user-select:none;">
                    <span style="font-weight:600;font-size:12px;color:#283593;flex:1;">\uD83D\uDD0D Raw Harvest Fields</span>
                    <button id="sn-rhv-close" style="border:none;background:none;cursor:pointer;font-weight:bold;font-size:14px;color:#666;">\u2716</button>
                </div>
                <div id="sn-rhv-body" style="padding:6px;overflow-y:auto;flex:1;max-height:440px;">
                    <div style="color:#999;text-align:center;padding:20px;">Scraping...</div>
                </div>
            `;

            document.body.appendChild(w);
            app.Core.Windows.makeDraggable(w, w.querySelector('div:first-child'));
            w.querySelector('#sn-rhv-close').onclick = () => w.remove();
            this._scrapeAndRender(w);
        },

        _scrapeAndRender(w) {
            const body = w.querySelector('#sn-rhv-body');
            if (!body) return;

            const Scraper = app.Core.Scraper;
            if (!Scraper) {
                body.innerHTML = '<div style="color:#c62828;padding:8px;">\u274C Scraper not available.</div>';
                return;
            }

            const raw = Scraper.harvestFields();
            const keys = Object.keys(raw);

            if (keys.length === 0) {
                body.innerHTML = '<div style="color:#999;padding:20px;text-align:center;">No fields found on this page.</div>';
                return;
            }

            let html = `<div style="font-size:11px;color:#666;padding:3px 0;border-bottom:1px solid #e0e0e0;margin-bottom:4px;">${keys.length} total fields</div>`;
            keys.forEach(k => {
                const v = raw[k] || '';
                html += `<div style="display:flex;border-bottom:1px solid #f0f0f0;padding:2px 0;">
                    <span style="width:110px;flex-shrink:0;font-weight:500;color:#333;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${this._escapeHtml(k)}">${this._escapeHtml(k)}</span>
                    <span style="flex:1;word-break:break-word;white-space:pre-wrap;color:#1565c0;">${this._escapeHtml(v) || '<span style="color:#bbb;font-style:italic;">(empty)</span>'}</span>
                </div>`;
            });

            body.innerHTML = html;
        },

        _escapeHtml(str) {
            if (!str) return '';
            return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
        }
    };

    app.Features.RawHarvestViewer = RawHarvestViewer;
})();
