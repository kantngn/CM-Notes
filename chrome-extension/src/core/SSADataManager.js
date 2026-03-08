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
                        cb(this._cache);
                    } catch (e) { console.error("SSA DB Error", e); cb(null); }
                },
                onerror: () => cb(null)
            });
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
