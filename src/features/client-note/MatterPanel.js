/**
 * @file MatterPanel.js
 * @description Sidebar panel "MATTER" showing structured case data from
 *   harvestFields(). Three collapsible sections: Overview (paired rows),
 *   IA & Recon, Last Contact (auto-saved) — with mm/dd/yy formatting,
 *   days-since, and special T2/TDQ coloring.
 *
 * @uses app.Core.Scraper (harvestFields)
 * @namespace app.Features.MatterPanel
 */

(function () {
    const app = window.CM_App = window.CM_App || {};
    app.Features = app.Features || {};

    const MatterPanel = {
        _fieldMap: {
            engagementDate:  ['Engagement Date', 'Intake Date', 'Date of Engagement', 'Eng Date'],
            dateFiledApp:    ['Date Filed: App', 'App Filed', 'Date Filed App', 'Date Filed'],
            aod:             ['AOD', 'Alleged Onset Date', 'Alleged Onset'],
            dateLastInsured: ['Date Last Insured', 'DLI', 'Last Insured Date'],
            protectiveDof:   ['Protective DOF', 'Protective Filing Date', 'Protective Date', 'Protective Filing'],
            blindDli:        ['Blind DLI', 'B-DLI', 'Blind Date Last Insured'],
            ssiQual:         ['SSI Qualification', 'T16 Qualification', 'T16 Qual Date', 'SSI Qual Date', 'Qualification Date'],
            dibQual:         ['DIB Qualification', 'T2 Qualification', 'T2 Qual Date', 'DIB Qual Date'],
            iaFiled:         ['Date Filed: App', 'IA Filed', 'App Filed', 'Date Filed App'],
            iaAtDds:         ['IA at DDS', 'IA DDS', 'DDS IA', 'At DDS'],
            t2Decision:      ['T2 App Decision', 'T2 Decision', 'T2 App Dec'],
            t2Date:          ['T2 IA Decision Date', 'T2 Decision Date', 'T2 Date'],
            t16Decision:     ['T16 App Decision', 'T16 Decision', 'T16 App Dec'],
            t16Date:         ['T16 IA Decision Date', 'Decision Date: App', 'Decision Date App', 'IA Decision Date'],
            iaDecision:      ['Decision App', 'IA Decision', 'Decision'],
            reconFiled:      ['Date Filed: Recon', 'Recon Filed', 'Date Filed Recon'],
            lastContact:     ['Last CM1 Update', 'Last Client Contact', 'Global Last Client Contact', 'Last Contact Date'],
            lastContactAtt:  ['Last CM1 Update Attempt', 'Last Contact Attempt', 'Global Last Client Contact Attempt', 'Last Attempt'],
            lastIsu:         ['Last Initial Status Update', 'Last ISU', 'Last Status Update', 'Initial Status Update'],
            lastIsuAtt:      ['Last ISU Attempt', 'ISU Attempt', 'Last Initial Status Attempt']
        },

        _pick(raw, patterns) {
            if (!raw || !patterns) return '';
            const keys = Object.keys(raw);
            for (const p of patterns) {
                const pLow = p.toLowerCase();
                let found = keys.find(k => k.toLowerCase() === pLow);
                // if (!found) found = keys.find(k => k.toLowerCase().includes(pLow));
                if (found) return raw[found] || '';
            }
            return '';
        },

        _parseDate(str) {
            if (!str) return null;
            const s = String(str).trim();
            let d = new Date(s);
            if (!isNaN(d)) return d;
            const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
            if (mdy) { d = new Date(+mdy[3], +mdy[1] - 1, +mdy[2]); if (!isNaN(d)) return d; }
            const mmm = s.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})$/);
            if (mmm) { d = new Date(`${mmm[1]} ${mmm[2]}, ${mmm[3]}`); if (!isNaN(d)) return d; }
            const ddmm = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
            if (ddmm) { d = new Date(`${ddmm[2]} ${ddmm[1]}, ${ddmm[3]}`); if (!isNaN(d)) return d; }
            return null;
        },

        _formatDate(str) {
            const d = this._parseDate(str);
            if (!d) return str || '';
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            const yy = String(d.getFullYear()).slice(-2);
            return `${mm}/${dd}/${yy}`;
        },

        _daysSince(dateStr) {
            const d = this._parseDate(dateStr);
            if (!d) return '';
            const diff = Math.floor((Date.now() - d) / 86400000);
            return diff < 0 ? `in ${-diff} days` : `${diff} days`;
        },

        _fmtDateFull(str) {
            const f = this._formatDate(str);
            if (!f) return '';
            const days = this._daysSince(str);
            const blue = `<span style="color:#1565c0;">${this._escapeHtml(f)}</span>`;
            return days ? `${blue}  <span style="color:#888;font-size:11px;">${days}</span>` : blue;
        },

        _fmtT2Decision(val) {
            if (!val) return '<span style="color:#bbb;font-style:italic;">\u2014</span>';
            const v = String(val);
            if (/medically denied[\s\S]*not disabled/i.test(v)) {
                return '<span style="color:#d32f2f;">Med Denied</span>';
            }
            if (/t2 denied[\s\S]*work history/i.test(v) || /not insured/i.test(v)) {
                return '<span style="color:#7b1fa2;">Not Insured</span>';
            }
            return '<span style="color:#1565c0;">' + this._escapeHtml(v) + '</span>';
        },

        _fmtQual(val) {
            if (!val) return '<span style="color:#bbb;font-style:italic;">\u2014</span>';
            const v = String(val);
            const formatted = this._formatDate(v) || v;
            if (/^TDQ/i.test(formatted)) {
                return `<span style="color:#d32f2f;">${this._escapeHtml(formatted)}</span>`;
            }
            return `<span style="color:#1565c0;">${this._escapeHtml(formatted)}</span>`;
        },

        render(container, context) {
            const { clientId } = context;
            container.innerHTML = '<div id="sn-scrape-results" style="display:flex;flex-direction:column;gap:6px;font-size:12px;"></div>';
            this._doScrape(container.querySelector('#sn-scrape-results'), clientId);
        },

        _doScrape(target, clientId) {
            const Scraper = app.Core.Scraper;
            if (!Scraper) {
                target.innerHTML = '<div style="color:#c62828;padding:8px;">\u274C Scraper not available.</div>';
                return;
            }

            const raw = Scraper.harvestFields();
            const F = (name) => this._pick(raw, this._fieldMap[name]);

            const sections = [];

            // ─────── Section 1: Overview (paired rows) ───────
            const eng   = F('engagementDate');
            const filed = F('dateFiledApp');
            const aod   = F('aod');
            const dli   = F('dateLastInsured');
            const pfd   = F('protectiveDof');
            const bdli  = F('blindDli');
            const t16   = F('ssiQual');
            const t2    = F('dibQual');

            sections.push(`
                <div class="sn-si-section" style="border:1px solid #ddd;border-radius:4px;background:#fafafa;">
                    <div class="sn-si-toggle" style="display:flex;align-items:center;gap:4px;padding:5px 6px;cursor:pointer;background:#e8eaf6;border-radius:4px 4px 0 0;user-select:none;font-weight:600;font-size:12px;color:#283593;" data-target="sn-sec-overview">
                        <span class="sn-si-arrow" style="font-size:10px;width:14px;">\u25BC</span>Overview
                    </div>
                    <div id="sn-sec-overview-body" style="display:block;padding:6px 8px;">
                        ${this._pairRow('Intake', eng, 'Filed', filed)}
                        ${this._pairRow('AOD', aod, 'DLI', dli)}
                        ${this._pairRow('PFD', pfd, 'B-DLI', bdli)}
                        ${this._pairRow('T16', t16, 'T2', t2, true)}
                    </div>
                </div>`);

            // ─────── Section 2: IA & Recon ───────
            const iaRows = [
                { label: 'IA filed', val: this._fmtDateFull(F('iaFiled')), raw: true },
                { label: 'DDS', val: this._fmtDateFull(F('iaAtDds')), raw: true },
                { label: 'T2 Decision', val: this._fmtT2Decision(F('t2Decision')), raw: true },
                { label: 'T2 Date', val: this._fmtDateFull(F('t2Date')), raw: true },
                { label: 'T16 Decision', val: this._fmtT2Decision(F('t16Decision')), raw: true },
                { label: 'T16 Date', val: this._fmtDateFull(F('t16Date')), raw: true },
                { label: 'IA Decision', val: this._fmtDateFull(F('iaDecision')), raw: true }
            ];
            const reconVal = F('reconFiled');
            if (reconVal) {
                iaRows.push(null);
                iaRows.push({ label: 'Recon filed', val: this._fmtDateFull(reconVal), raw: true });
            }
            sections.push(this._sectionHtml('IA & Recon', 'sn-sec-iar', true, iaRows));

            // ─────── Section 3: Last Contact (saved) ───────
            const ct = {
                lastCt: F('lastContact'), lastCtAtt: F('lastContactAtt'),
                lastIsu: F('lastIsu'), lastIsuAtt: F('lastIsuAtt')
            };
            this._saveContactData(clientId, ct);

            sections.push(this._sectionHtml('Last Contact', 'sn-sec-contact', true, [
                { label: 'Last CL contact', val: this._fmtDateFull(ct.lastCt), raw: true },
                { label: 'Last attempt', val: this._fmtDateFull(ct.lastCtAtt), raw: true },
                { label: 'Last ISU', val: this._fmtDateFull(ct.lastIsu), raw: true },
                { label: 'Last attempt', val: this._fmtDateFull(ct.lastIsuAtt), raw: true }
            ]));

            target.innerHTML = sections.join('');
        },

        _saveContactData(clientId, data) {
            if (!clientId) return;
            try {
                const prev = GM_getValue('sn_contact_data_' + clientId, {});
                GM_setValue('sn_contact_data_' + clientId, { ...prev, ...data, _updated: Date.now() });
            } catch (e) {}
        },

        /** Paired row: two fields side by side */
        _pairRow(label1, val1, label2, val2, isT16T2) {
            const fmt = (label, val, special) => {
                if (!val) return `<span style="color:#bbb;font-style:italic;">${this._escapeHtml(label)}: \u2014</span>`;
                const f = this._formatDate(val) || val;
                let color = '#1565c0';
                if (special && /^TDQ/i.test(f)) color = '#d32f2f';
                return `<span style="color:#888;">${this._escapeHtml(label)}:</span> <span style="color:${color};">${this._escapeHtml(f)}</span>`;
            };
            return `<div style="display:flex;gap:12px;margin-bottom:3px;">
                <div style="flex:1;min-width:0;">${fmt(label1, val1, isT16T2 && label1 === 'T16')}</div>
                <div style="flex:1;min-width:0;">${fmt(label2, val2, isT16T2 && label2 === 'T2')}</div>
            </div>`;
        },

        _sectionHtml(title, id, startOpen, rows) {
            const display = startOpen ? 'block' : 'none';
            const arrow = startOpen ? '\u25BC' : '\u25B6';
            const body = rows.map(r => {
                if (!r) return '<div style="height:1px;background:#e0e0e0;margin:4px 0;"></div>';
                const valHtml = r.raw ? r.val : (
                    r.val
                        ? `<span style="color:#1565c0;">${this._escapeHtml(r.val)}</span>`
                        : '<span style="color:#bbb;font-style:italic;">\u2014</span>'
                );
                return `<div style="margin-bottom:2px;"><span style="color:#888;">${this._escapeHtml(r.label)}:</span> ${valHtml}</div>`;
            }).join('');
            return `
                <div class="sn-si-section" style="border:1px solid #ddd;border-radius:4px;background:#fafafa;">
                    <div class="sn-si-toggle" style="display:flex;align-items:center;gap:4px;padding:5px 6px;cursor:pointer;background:#e8eaf6;border-radius:4px 4px 0 0;user-select:none;font-weight:600;font-size:12px;color:#283593;" data-target="${id}">
                        <span class="sn-si-arrow" style="font-size:10px;width:14px;">${arrow}</span>
                        ${this._escapeHtml(title)}
                    </div>
                    <div id="${id}-body" style="display:${display};padding:6px 8px;">
                        ${body}
                    </div>
                </div>`;
        },

        _escapeHtml(str) {
            if (!str) return '';
            return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
        }
    };

    app.Features.MatterPanel = MatterPanel;

    document.addEventListener('click', (e) => {
        const toggle = e.target.closest('.sn-si-toggle');
        if (!toggle) return;
        const id = toggle.getAttribute('data-target');
        if (!id) return;
        const body = document.getElementById(id + '-body');
        const arrow = toggle.querySelector('.sn-si-arrow');
        if (!body || !arrow) return;
        const hidden = body.style.display === 'none';
        body.style.display = hidden ? 'block' : 'none';
        arrow.textContent = hidden ? '\u25BC' : '\u25B6';
    });
})();
