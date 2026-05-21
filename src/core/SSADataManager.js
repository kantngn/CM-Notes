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
                token = prompt("To update the master database for everyone, please enter your GitHub Personal Access Token (PAT).\nNeeds 'public_repo' scope for public repos, or 'repo' for private repos.");
                if (token) GM_setValue('sn_gh_token', token);
                else return cb?.(false, "No token provided");
            }
            try {
                let found = false;
                await this._updateGitHubFile('kantngn', 'CM-Notes', 'db/SSADatabase_geo.json', (content) => {
                    const db = JSON.parse(content);
                    // Check if item exists before modifying
                    const searchKey = String(id || '').trim().toUpperCase();
                    const exists = ['FO', 'DDS'].some(type => {
                        if (!db[type]) return false;
                        return db[type].some(i => {
                            if (type === 'DDS') {
                                // DDS entries identified by site code only
                                return String(i.id).trim().toUpperCase() === searchKey;
                            }
                            // FO entries: match by id, office_name, name, or combined
                            return String(i.id).trim().toUpperCase() === searchKey ||
                                (i.office_name || '').trim().toUpperCase() === searchKey ||
                                (i.name || '').trim().toUpperCase() === searchKey ||
                                (String(i.id).trim() + ' ' + (i.office_name || '').trim()).toUpperCase() === searchKey;
                        });
                    });
                    if (!exists) {
                        console.warn(`[SSADataManager] Item "${id}" not found in database.`);
                        found = false;
                        return content; // Return unchanged
                    }
                    found = true;
                    this._applyOverrideToData(db, id, phone, fax);
                    return JSON.stringify(db, null, 2);
                }, token);
                if (!found) {
                    cb?.(false, `Office "${id}" not found in the master database.`);
                } else {
                    cb?.(true);
                }
            } catch (err) {
                console.error("[SSADataManager] Sync Failed", err);
                if (err.status === 401) {
                    GM_deleteValue('sn_gh_token');
                    cb?.(false, "Token rejected (401). Your PAT has been cleared. Please generate a new one with 'public_repo' scope.");
                } else if (err.status === 0) {
                    cb?.(false, "Network Error — check that api.github.com is accessible (extension may need host permission).");
                } else {
                    cb?.(false, err.message || "Network Error");
                }
            }
        },

        /** @private */
        _applyOverrideToData(db, id, phone, fax) {
            const searchId = String(id || '').trim().toUpperCase();
            ['FO', 'DDS'].forEach(type => {
                if (!db[type]) return;
                const item = db[type].find(i => {
                    if (type === 'DDS') {
                        return String(i.id).trim().toUpperCase() === searchId;
                    }
                    return String(i.id).trim().toUpperCase() === searchId ||
                        (i.office_name || '').trim().toUpperCase() === searchId ||
                        (i.name || '').trim().toUpperCase() === searchId ||
                        (String(i.id).trim() + ' ' + (i.office_name || '').trim()).toUpperCase() === searchId;
                });
                if (item) {
                    // Update phone/fax even if empty (to allow clearing)
                    if (phone !== undefined) item.phone = this._formatPhone(phone || '');
                    if (fax !== undefined) item.fax = this._formatPhone(fax || '');
                }
            });
        },

        /** @private */
        _base64Encode(str) {
            const bytes = new TextEncoder().encode(str);
            let binary = '';
            for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
            return btoa(binary);
        },

        /** @private */
        _base64Decode(base64) {
            // Strip any whitespace/newlines that GitHub may insert for line wrapping
            const clean = String(base64).replace(/\s/g, '');
            const binary = atob(clean);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            return new TextDecoder('utf-8').decode(bytes);
        },

        /** @private */
        _updateGitHubFile(owner, repo, path, transformCb, token) {
            return new Promise((resolve, reject) => {
                const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
                const MAX_RETRIES = 3;

                const attempt = (retriesLeft) => {
                    GM_xmlhttpRequest({
                        method: "GET", url,
                        headers: { "Authorization": `Bearer ${token}`, "Accept": "application/vnd.github.v3+json" },
                        onload: (res) => {
                            if (res.status === 403) return reject({ status: 403, message: `Access Denied (403). Check token permissions.` });
                            if (res.status !== 200) return reject({ status: res.status, message: `Failed to fetch metadata (${res.status}): ${res.responseText?.substring(0, 200)}` });
                            let meta, oldContent;
                            try {
                                meta = JSON.parse(res.responseText);
                                if (!meta || !meta.content) {
                                    return reject({ status: res.status, message: 'GitHub response missing content field' });
                                }
                                oldContent = this._base64Decode(meta.content);
                            } catch (e) {
                                return reject({ status: res.status, message: `Failed to parse GitHub response: ${e.message}` });
                            }
                            const newContent = transformCb(oldContent);
                            if (newContent === oldContent) {
                                console.warn('[SSADataManager] No changes detected — item not found or data unchanged');
                                return resolve();
                            }
                            GM_xmlhttpRequest({
                                method: "PUT", url,
                                headers: { "Authorization": `Bearer ${token}`, "Accept": "application/vnd.github.v3+json", "Content-Type": "application/json" },
                                data: JSON.stringify({
                                    message: `Update SSA office via tool UI`,
                                    content: this._base64Encode(newContent),
                                    sha: meta.sha
                                }),
                                onload: (res2) => {
                                    if (res2.status >= 200 && res2.status < 300) return resolve();
                                    if ((res2.status === 409 || res2.status === 422) && retriesLeft > 0) {
                                        console.warn(`[SSADataManager] SHA conflict (${res2.status}), retrying... (${retriesLeft} left)`);
                                        return attempt(retriesLeft - 1);
                                    }
                                    reject({ status: res2.status, message: `GitHub PUT failed (${res2.status}): ${res2.responseText?.substring(0, 200)}` });
                                },
                                onerror: (err) => reject({ status: 0, message: err.message || 'Network Error' })
                            });
                        },
                        onerror: (err) => reject({ status: 0, message: err.message || 'Network Error' })
                    });
                };

                attempt(MAX_RETRIES);
            });
        },

        /** @private */
        _applyOverrides(db) {
            const overrides = GM_getValue('sn_ssa_overrides', {});
            if (Object.keys(overrides).length === 0) return;

            Object.entries(overrides).forEach(([key, data]) => {
                const searchKey = String(key).trim().toUpperCase();
                ['FO', 'DDS'].forEach(type => {
                    if (!db[type]) return;
                    const item = db[type].find(i => {
                        if (type === 'DDS') {
                            return String(i.id).trim().toUpperCase() === searchKey;
                        }
                        return String(i.id).trim().toUpperCase() === searchKey ||
                            (i.office_name || '').trim().toUpperCase() === searchKey ||
                            (i.name || '').trim().toUpperCase() === searchKey ||
                            (String(i.id).trim() + ' ' + (i.office_name || '').trim()).toUpperCase() === searchKey;
                    });
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
            const raw = String(num);
            const digits = raw.replace(/\D/g, '');
            if (digits.length === 10) {
                return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
            }
            if (digits.length > 10) {
                // Preserve extension: format main number + append extension text
                const extMatch = raw.match(/[xX#]\s*\d+$/);
                const main = digits.slice(0, 10);
                const formatted = `${main.slice(0, 3)}-${main.slice(3, 6)}-${main.slice(6)}`;
                return extMatch ? `${formatted} ${extMatch[0].trim()}` : formatted;
            }
            return raw; // leave unusual numbers as-is
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
                        // Extract digits from query for phone/fax matching even in mixed queries
                        const queryDigits = q.replace(/\D/g, '');
                        if (isPhoneSearch) {
                            const p = i.phone ? String(i.phone).replace(/\D/g, '') : '';
                            const f = i.fax ? String(i.fax).replace(/\D/g, '') : '';
                            return p.includes(q) || f.includes(q);
                        }
                        // If query contains digits, also try phone/fax matching
                        if (queryDigits.length >= 3) {
                            const p = i.phone ? String(i.phone).replace(/\D/g, '') : '';
                            const f = i.fax ? String(i.fax).replace(/\D/g, '') : '';
                            if (p.includes(queryDigits) || f.includes(queryDigits)) return true;
                        }
                        const name = (i.office_name || '').toUpperCase();
                        const id = (i.id || '').toUpperCase();
                        const addr = (i.address || '').toUpperCase();
                        const st = (i.state || '').toUpperCase();

                        if (q.length === 2) {
                            return name.endsWith(` ${q}`) || id === q || st === q;
                        }
                        return name.includes(q) || id.includes(q) || addr.includes(q) || st.includes(q);
                    });
                }
                cb(results);
            });
        }
    };

    app.Core.SSADataManager = SSADataManager;
})();
