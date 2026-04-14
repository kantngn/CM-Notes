/**
 * @file SSADataManager.js
 * @description Fetches the remote SSADatabase.json from GitHub, caches it in memory,
 *   and provides a `search` method to filter FO/DDS contact records by location,
 *   name, or phone number. Exports on the {@link app.Core.SSADataManager} namespace.
 *
 * @requires gm-compat.js — GM_xmlhttpRequest (cross-origin fetch)
 *
 * @consumed-by SSAPanel.js
 */
(function () {
    const app = window.CM_App = window.CM_App || {};
    app.Core = app.Core || {};

    const AUTHORIZED_USERS = ['KANT NGUYEN', 'KANT NGUYEN ']; // Usernames allowed to push to GitHub

    /**
     * @typedef {Object} SSADatabase
     * @property {FORecord[]} [FO]  - Array of Field Office records.
     * @property {DDSRecord[]} [DDS] - Array of DDS branch records.
     */

    /**
     * @typedef {Object} FORecord
     * @property {string} location    - Office location name (e.g. "Springfield IL").
     * @property {string} fullAddress - Full mailing address.
     * @property {string} [phone]     - Phone number.
     * @property {string} [fax]       - Fax number.
     */

    /**
     * @typedef {Object} DDSRecord
     * @property {string} name  - DDS branch name (e.g. "Illinois DDS").
     * @property {string} [phone] - Phone number.
     * @property {string} [fax]   - Fax number.
     */

    const SSADataManager = {
        /** @type {string} URL to the remote SSADatabase.json on GitHub. */
        dbUrl: 'https://raw.githubusercontent.com/kantngn/CM-Notes/refs/heads/main/db/SSADatabase.json',

        /** @type {SSADatabase|null} In-memory cache of the fetched database. */
        _cache: null,

        /** @type {string} URL to the geocoded SSADatabase_geo.json on GitHub. */
        geoDbUrl: 'https://raw.githubusercontent.com/kantngn/CM-Notes/refs/heads/main/db/SSADatabase_geo.json',

        /** @type {Object|null} In-memory cache of the geocoded database. */
        _geoCache: null,

        /**
         * Fetches the geocoded SSA database JSON from GitHub (or returns the cached copy).
         * This database includes lat/lng coordinates for distance calculations.
         *
         * @param {function(Object|null): void} cb - Callback receiving the
         *   parsed geocoded database object, or `null` on error.
         */
        fetchGeo(cb) {
            if (this._geoCache) return cb(this._geoCache);
            GM_xmlhttpRequest({
                method: "GET",
                url: this.geoDbUrl,
                onload: (res) => {
                    try {
                        this._geoCache = JSON.parse(res.responseText);
                        this._applyOverrides(this._geoCache, true);
                        cb(this._geoCache);
                    } catch (e) { console.error("SSA Geo DB Error", e); cb(null); }
                },
                onerror: () => cb(null)
            });
        },

        /**
         * Fetches the SSA database JSON from GitHub (or returns the cached copy).
         * Uses {@link GM_xmlhttpRequest} for cross-origin access.
         *
         * @param {function(SSADatabase|null): void} cb - Callback receiving the
         *   parsed database object, or `null` on parse/network error.
         */
        fetch(cb) {
            if (this._cache) return cb(this._cache);
            GM_xmlhttpRequest({
                method: "GET",
                url: this.dbUrl,
                onload: (res) => {
                    try {
                        this._cache = JSON.parse(res.responseText);
                        this._applyOverrides(this._cache, false);
                        cb(this._cache);
                    } catch (e) { console.error("SSA DB Error", e); cb(null); }
                },
                onerror: () => cb(null)
            });
        },

        /**
         * Checks if the current user is authorized to push to the global database.
         */
        isAuthorized() {
            // Priority: Use the "CM Name" saved in global settings (Dashboard Settings)
            let user = GM_getValue('sn_global_cm1', '');
            
            // Fallback to scraper if setting is not yet configured
            if (!user) {
                user = app.Core.Utils.getCurrentUser();
            }

            if (!user) return false;
            
            // Match against white list (Kant Nguyen and authorized teammates)
            const upperUser = user.trim().toUpperCase();
            return AUTHORIZED_USERS.some(u => upperUser.includes(u.trim().toUpperCase()));
        },

        /**
         * Updates both master database files on GitHub directly.
         * Requires a Personal Access Token (PAT) with repo permissions.
         */
        async syncToGlobal(id, phone, fax, cb) {
            let token = GM_getValue('sn_gh_token');
            if (!token) {
                token = prompt("To update the master database for everyone, please enter your GitHub Personal Access Token (PAT):");
                if (token) GM_setValue('sn_gh_token', token);
                else return cb?.(false, "No token provided");
            }

            const owner = 'kantngn';
            const repo = 'CM-Notes';
            
            try {
                // 1. Update master records
                await this._updateGitHubFile(owner, repo, 'db/SSADatabase.json', (content) => {
                    const db = JSON.parse(content);
                    this._applyOverrideToData(db, id, phone, fax, false);
                    return JSON.stringify(db, null, 2);
                }, token);

                // 2. Update geocoded records
                await this._updateGitHubFile(owner, repo, 'db/SSADatabase_geo.json', (content) => {
                    const db = JSON.parse(content);
                    this._applyOverrideToData(db, id, phone, fax, true);
                    return JSON.stringify(db, null, 2);
                }, token);

                cb?.(true);
            } catch (err) {
                console.error("[SSADataManager] Master Sync Failed", err);
                // Clear token on 401
                if (err.status === 401) GM_deleteValue('sn_gh_token');
                cb?.(false, err.message || "Network Error");
            }
        },

        /** @private */
        _applyOverrideToData(db, id, phone, fax, isGeo) {
            ['FO', 'DDS'].forEach(type => {
                if (!db[type]) return;
                const item = db[type].find(i => String(i.id) === String(id));
                if (item) {
                    if (phone) item.phone = isGeo ? this._formatPhone(phone) : parseInt(String(phone).replace(/\D/g, ''));
                    if (fax) item.fax = isGeo ? this._formatPhone(fax) : parseInt(String(fax).replace(/\D/g, ''));
                }
            });
        },

        /** @private Helper to update a file on GitHub using REST API */
        _updateGitHubFile(owner, repo, path, transformCb, token) {
            return new Promise((resolve, reject) => {
                const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
                
                // Get SHA first
                GM_xmlhttpRequest({
                    method: "GET",
                    url: url,
                    headers: { "Authorization": `Bearer ${token}`, "Accept": "application/vnd.github.v3+json" },
                    onload: (res) => {
                        if (res.status === 403) return reject({ status: 403, message: `Access Denied (403). Ensure your token has 'repo' permissions and write access.` });
                        if (res.status !== 200) return reject({ status: res.status, message: `Failed to fetch file metadata (${res.status})` });
                        
                        const meta = JSON.parse(res.responseText);
                        const oldContent = decodeURIComponent(escape(atob(meta.content))); // Handle UTF-8
                        const newContent = transformCb(oldContent);

                        // PUT update
                        GM_xmlhttpRequest({
                            method: "PUT",
                            url: url,
                            headers: { 
                                "Authorization": `Bearer ${token}`, 
                                "Accept": "application/vnd.github.v3+json",
                                "Content-Type": "application/json"
                            },
                            data: JSON.stringify({
                                message: `Update SSA office ${path} via tool UI`,
                                content: btoa(unescape(encodeURIComponent(newContent))),
                                sha: meta.sha
                            }),
                            onload: (res2) => {
                                if (res2.status >= 200 && res2.status < 300) resolve();
                                else reject({ status: res2.status, message: `Failed to push update (${res2.status})` });
                            },
                            onerror: (err) => reject(err)
                        });
                    },
                    onerror: (err) => reject(err)
                });
            });
        },

        /**
         * Merges locally saved user overrides into the fetched database.
         * @private
         */
        _applyOverrides(db, isGeo = false) {
            const overrides = GM_getValue('sn_ssa_overrides', {});
            if (Object.keys(overrides).length === 0) return;

            Object.entries(overrides).forEach(([id, data]) => {
                ['FO', 'DDS'].forEach(type => {
                    if (!db[type]) return;
                    const item = db[type].find(i => String(i.id) === String(id));
                    if (item) {
                        item.hasOverride = true;
                        if (data.phone) {
                            item.phone = isGeo ? this._formatPhone(data.phone) : parseInt(String(data.phone).replace(/\D/g, ''));
                        }
                        if (data.fax) {
                            item.fax = isGeo ? this._formatPhone(data.fax) : parseInt(String(data.fax).replace(/\D/g, ''));
                        }
                    }
                });
            });
        },

        /** @private */
        _formatPhone(num) {
            if (!num) return num;
            const s = String(num).replace(/\D/g, '');
            if (s.length !== 10) return num;
            return `${s.slice(0, 3)}-${s.slice(3, 6)}-${s.slice(6)}`;
        },

        /**
         * Searches the cached SSA database for FO or DDS records matching
         * the given state/query string.
         *
         * **Search behaviour by query format:**
         * - 4-digit number → phone/fax suffix match.
         * - 2-letter string → state abbreviation match (address or name).
         * - Longer string  → substring match against location/address (FO) or name (DDS).
         *
         * @param {'FO'|'DDS'} type  - Record type to search.
         * @param {string} state     - State abbreviation, location substring, or 4-digit phone suffix.
         * @param {function(Array<FORecord|DDSRecord>): void} cb - Callback receiving
         *   the filtered results array (empty on failure).
         */
        search(type, state, cb) {
            this.fetch(db => {
                if (!db) { console.warn('[SSADataManager] Database failed to load'); return cb([]); }
                const s = state ? state.trim().toUpperCase() : '';
                if (!s) return cb([]);

                let results = [];
                const isPhoneSearch = /^\d+$/.test(s);

                if (type === 'FO' && db.FO) {
                    results = db.FO.filter(i => {
                        if (isPhoneSearch) {
                            const p = i.phone ? String(i.phone).replace(/\D/g, '') : '';
                            const f = i.fax ? String(i.fax).replace(/\D/g, '') : '';
                            return p.includes(s) || f.includes(s);
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
                            const p = i.phone ? String(i.phone).replace(/\D/g, '') : '';
                            const f = i.fax ? String(i.fax).replace(/\D/g, '') : '';
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
