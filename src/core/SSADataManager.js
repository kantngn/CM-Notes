/**
 * @file SSADataManager.js
 * @description Single-source SSA database manager. Fetches SSADatabase_geo.json
 *   from GitHub (contains both FO and DDS with lat/lng/zip/state).
 *   Provides `fetch()` for the map and `search()` for text lookup.
 *
 * @requires gm-compat.js — GM_xmlhttpRequest
 * @consumed-by SSAPanel.js, DDSPanel.js, NearestOffice.js
 */
(function () {
    const app = window.CM_App = window.CM_App || {};
    app.Core = app.Core || {};

    const AUTHORIZED_USERS = ['KANT NGUYEN', 'KANT NGUYEN '];

    const SSADataManager = {
        /** @type {string} Single database URL. */
        dbUrl: 'https://raw.githubusercontent.com/kantngn/CM-Notes/refs/heads/main/db/SSADatabase_geo.json',

        /** @type {Object|null} In-memory cache. */
        _cache: null,

        /**
         * Fetches the SSA database from GitHub (or returns cached copy).
         * @param {function(Object|null): void} cb
         */
        fetch(cb) {
            if (this._cache) return cb(this._cache);
            GM_xmlhttpRequest({
                method: "GET",
                url: this.dbUrl,
                onload: (res) => {
                    try {
                        this._cache = JSON.parse(res.responseText);
                        this._applyOverrides(this._cache);
                        cb(this._cache);
                    } catch (e) { console.error("SSA DB Error", e); cb(null); }
                },
                onerror: () => cb(null)
            });
        },

        /** Alias for backward compatibility */
        fetchGeo(cb) { this.fetch(cb); },

        isAuthorized() {
            let user = GM_getValue('sn_global_cm1', '');
            if (!user) user = app.Core.Utils.getCurrentUser();
            if (!user) return false;
            const upperUser = user.trim().toUpperCase();
            return AUTHORIZED_USERS.some(u => upperUser.includes(u.trim().toUpperCase()));
        },

        async syncToGlobal(id, phone, fax, cb) {
            let token = GM_getValue('sn_gh_token');
            if (!token) {
                token = prompt("To update the master database for everyone, please enter your GitHub Personal Access Token (PAT):");
                if (token) GM_setValue('sn_gh_token', token);
                else return cb?.(false, "No token provided");
            }
            try {
                await this._updateGitHubFile('kantngn', 'CM-Notes', 'db/SSADatabase_geo.json', (content) => {
                    const db = JSON.parse(content);
                    this._applyOverrideToData(db, id, phone, fax);
                    return JSON.stringify(db, null, 2);
                }, token);
                cb?.(true);
            } catch (err) {
                console.error("[SSADataManager] Sync Failed", err);
                if (err.status === 401) GM_deleteValue('sn_gh_token');
                cb?.(false, err.message || "Network Error");
            }
        },

        /** @private */
        _applyOverrideToData(db, id, phone, fax) {
            ['FO', 'DDS'].forEach(type => {
                if (!db[type]) return;
                const item = db[type].find(i => String(i.id) === String(id) || i.office_name === id);
                if (item) {
                    if (phone) item.phone = this._formatPhone(phone);
                    if (fax) item.fax = this._formatPhone(fax);
                }
            });
        },

        /** @private */
        _updateGitHubFile(owner, repo, path, transformCb, token) {
            return new Promise((resolve, reject) => {
                const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
                GM_xmlhttpRequest({
                    method: "GET", url,
                    headers: { "Authorization": `Bearer ${token}`, "Accept": "application/vnd.github.v3+json" },
                    onload: (res) => {
                        if (res.status === 403) return reject({ status: 403, message: `Access Denied (403).` });
                        if (res.status !== 200) return reject({ status: res.status, message: `Failed to fetch metadata (${res.status})` });
                        const meta = JSON.parse(res.responseText);
                        const oldContent = decodeURIComponent(escape(atob(meta.content)));
                        const newContent = transformCb(oldContent);
                        GM_xmlhttpRequest({
                            method: "PUT", url,
                            headers: { "Authorization": `Bearer ${token}`, "Accept": "application/vnd.github.v3+json", "Content-Type": "application/json" },
                            data: JSON.stringify({
                                message: `Update SSA office via tool UI`,
                                content: btoa(unescape(encodeURIComponent(newContent))),
                                sha: meta.sha
                            }),
                            onload: (res2) => { if (res2.status >= 200 && res2.status < 300) resolve(); else reject({ status: res2.status }); },
                            onerror: (err) => reject(err)
                        });
                    },
                    onerror: (err) => reject(err)
                });
            });
        },

        /** @private */
        _applyOverrides(db) {
            const overrides = GM_getValue('sn_ssa_overrides', {});
            if (Object.keys(overrides).length === 0) return;
            Object.entries(overrides).forEach(([key, data]) => {
                ['FO', 'DDS'].forEach(type => {
                    if (!db[type]) return;
                    const item = db[type].find(i => String(i.id) === String(key) || i.office_name === key);
                    if (item) {
                        item.hasOverride = true;
                        if (data.phone) item.phone = this._formatPhone(data.phone);
                        if (data.fax) item.fax = this._formatPhone(data.fax);
                    }
                });
            });
        },

        /** @private */
        _formatPhone(num) {
            if (!num) return num;
            const s = String(num).replace(/\D/g, '');
            if (s.length !== 10) return s;
            return `${s.slice(0, 3)}-${s.slice(3, 6)}-${s.slice(6)}`;
        },

        /**
         * Searches the single database for FO or DDS records matching the query.
         * Uses geo DB fields: office_name, address, state.
         *
         * @param {'FO'|'DDS'} type
         * @param {string} query - State abbreviation, location, or phone suffix.
         * @param {function(Array): void} cb
         */
        search(type, query, cb) {
            this.fetch(db => {
                if (!db) { console.warn('[SSADataManager] Database failed to load'); return cb([]); }
                const q = query ? query.trim().toUpperCase() : '';
                if (!q) return cb([]);

                let results = [];
                const isPhoneSearch = /^\d+$/.test(q);

                if (type === 'FO' && db.FO) {
                    results = db.FO.filter(i => {
                        if (isPhoneSearch) {
                            const p = i.phone ? String(i.phone).replace(/\D/g, '') : '';
                            const f = i.fax ? String(i.fax).replace(/\D/g, '') : '';
                            return p.includes(q) || f.includes(q);
                        }
                        const name = (i.office_name || '').toUpperCase();
                        const addr = (i.address || '').toUpperCase();

                        if (q.length === 2) {
                            return name.endsWith(` ${q}`) || addr.includes(`, ${q},`);
                        }
                        return name.includes(q) || addr.includes(q);
                    });
                } else if (type === 'DDS' && db.DDS) {
                    results = db.DDS.filter(i => {
                        if (isPhoneSearch) {
                            const p = i.phone ? String(i.phone).replace(/\D/g, '') : '';
                            const f = i.fax ? String(i.fax).replace(/\D/g, '') : '';
                            return p.includes(q) || f.includes(q);
                        }
                        const name = (i.office_name || '').toUpperCase();
                        if (q.length === 2) {
                            return name.endsWith(` ${q}`);
                        }
                        return name.includes(q);
                    });
                }
                cb(results);
            });
        }
    };

    app.Core.SSADataManager = SSADataManager;
})();
