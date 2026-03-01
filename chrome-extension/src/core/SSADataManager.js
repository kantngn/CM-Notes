(function () {
    const app = window.CM_App = window.CM_App || {};
    app.Core = app.Core || {};

    const SSADataManager = {
        dbUrl: 'https://raw.githubusercontent.com/kantngn/CM-Notes/refs/heads/main/db/SSADatabase.json',
        _cache: null,

        fetch(cb) {
            if (this._cache) return cb(this._cache);
            GM_xmlhttpRequest({
                method: "GET",
                url: this.dbUrl,
                onload: (res) => {
                    try {
                        this._cache = JSON.parse(res.responseText);
                        cb(this._cache);
                    } catch (e) { console.error("SSA DB Error", e); cb(null); }
                },
                onerror: () => cb(null)
            });
        },

        search(type, state, cb) {
            this.fetch(db => {
                if (!db) { console.warn('[SSADataManager] Database failed to load'); return cb([]); }
                const s = state ? state.trim().toUpperCase() : '';
                if (!s) return cb([]);

                let results = [];
                const isPhoneSearch = /^\d{4}$/.test(s);

                if (type === 'FO' && db.FO) {
                    results = db.FO.filter(i => {
                        if (isPhoneSearch) {
                            const p = i.phone ? String(i.phone) : '';
                            const f = i.fax ? String(i.fax) : '';
                            return p.endsWith(s) || f.endsWith(s);
                        }

                        const addr = (i.fullAddress || '').toUpperCase();
                        const loc = (i.location || '').toUpperCase();

                        if (s.length === 2) {
                            return addr.includes(`, ${s},`) || loc.endsWith(` ${s}`);
                        }

                        return loc.includes(s) || addr.includes(s);
                    });
                } else if (type === 'DDS' && db.DDS) {
                    results = db.DDS.filter(i => {
                        if (isPhoneSearch) {
                            const p = i.phone || '';
                            const f = i.fax || '';
                            return p.includes(s) || f.includes(s);
                        }

                        const name = (i.name || '').toUpperCase();

                        if (s.length === 2) {
                            return name.includes(` ${s} `) || name.endsWith(` ${s}`) || name.endsWith(` ${s} `);
                        }

                        return name.includes(s);
                    });
                }
                cb(results);
            });
        }
    };

    app.Core.SSADataManager = SSADataManager;
})();
