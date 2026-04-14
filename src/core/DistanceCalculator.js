/**
 * @file DistanceCalculator.js
 * @description Provides client address geocoding (via Nominatim) and Haversine
 *   distance calculation to find the nearest SSA Field Offices.
 *   Exports on the {@link app.Core.DistanceCalculator} namespace.
 *
 * @requires gm-compat.js — GM_xmlhttpRequest (cross-origin fetch)
 *
 * @consumed-by NearestOffice.js
 */
(function () {
    const app = window.CM_App = window.CM_App || {};
    app.Core = app.Core || {};

    const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
    const STATE_MAP = {
        'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas', 'CA': 'California', 'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware', 'FL': 'Florida', 'GA': 'Georgia', 'HI': 'Hawaii', 'ID': 'Idaho', 'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa', 'KS': 'Kansas', 'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland', 'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi', 'MO': 'Missouri', 'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada', 'NH': 'New Hampshire', 'NJ': 'New Jersey', 'NM': 'New Mexico', 'NY': 'New York', 'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio', 'OK': 'Oklahoma', 'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina', 'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah', 'VT': 'Vermont', 'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia', 'WI': 'Wisconsin', 'WY': 'Wyoming', 'DC': 'District of Columbia'
    };

    const DistanceCalculator = {

        /**
         * Calculates the great-circle distance between two lat/lng points
         * using the Haversine formula.
         *
         * @param {number} lat1 - Latitude of point 1 (degrees).
         * @param {number} lng1 - Longitude of point 1 (degrees).
         * @param {number} lat2 - Latitude of point 2 (degrees).
         * @param {number} lng2 - Longitude of point 2 (degrees).
         * @returns {number} Distance in miles.
         */
        haversine(lat1, lng1, lat2, lng2) {
            const R = 3958.8; // Earth radius in miles
            const toRad = deg => deg * Math.PI / 180;

            const dLat = toRad(lat2 - lat1);
            const dLng = toRad(lng2 - lng1);

            const a = Math.sin(dLat / 2) ** 2 +
                Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
                Math.sin(dLng / 2) ** 2;

            return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        },

        /**
         * Validates a geocoding result against an expected state and ZIP code.
         * Helps prevent "2000 miles away" errors.
         *
         * @param {Object} result - Result from geocodeAddress.
         * @param {string} [expectedState] - Two-letter state code.
         * @param {string} [expectedZip] - 5-digit ZIP code.
         * @returns {boolean} True if matching or no criteria provided.
         */
        validateResult(result, expectedState, expectedZip) {
            if (!result) return false;

            // Check State
            if (expectedState && result.state) {
                const fullName = STATE_MAP[expectedState.toUpperCase()];
                const resState = result.state.toUpperCase();
                // Match if abbreviation or full name matches
                if (resState !== expectedState.toUpperCase() && (!fullName || !resState.includes(fullName.toUpperCase()))) {
                    return false;
                }
            }

            // Check ZIP (if both available)
            if (expectedZip && result.postcode) {
                if (!result.postcode.startsWith(expectedZip)) {
                    // Only fail if states also don't match, or if zip is completely different
                    // as postcodes can sometimes be weird in Nominatim
                    return false;
                }
            }

            return true;
        },

        /**
         * Geocodes an address string to lat/lng coordinates using OpenStreetMap Nominatim.
         * Uses GM_xmlhttpRequest from gm-compat.js for cross-origin access.
         *
         * @param {string} address - Full address string (e.g. "123 Main St, Springfield, IL 62701").
         * @returns {Promise<{lat: number, lng: number, state?: string, postcode?: string}|null>} Coordinates or null on failure.
         */
        geocodeAddress(address) {
            return new Promise((resolve) => {
                if (!address || !address.trim()) return resolve(null);

                const params = new URLSearchParams({
                    format: 'json',
                    addressdetails: '1',
                    countrycodes: 'us',
                    limit: '1',
                    q: address.trim()
                });

                GM_xmlhttpRequest({
                    method: 'GET',
                    url: `${NOMINATIM_URL}?${params.toString()}`,
                    headers: { 'User-Agent': 'KD-CM-Notes/1.0' },
                    onload: (res) => {
                        try {
                            const results = JSON.parse(res.responseText);
                            if (results && results.length > 0) {
                                const r = results[0];
                                resolve({
                                    lat: parseFloat(r.lat),
                                    lng: parseFloat(r.lon),
                                    state: r.address ? r.address.state : null,
                                    postcode: r.address ? r.address.postcode : null
                                });
                            } else {
                                console.warn('[DistanceCalculator] No geocoding results for:', address);
                                resolve(null);
                            }
                        } catch (e) {
                            console.error('[DistanceCalculator] Geocode parse error:', e);
                            resolve(null);
                        }
                    },
                    onerror: (err) => {
                        console.error('[DistanceCalculator] Geocode network error:', err);
                        resolve(null);
                    }
                });
            });
        },

        /**
         * Finds the nearest FO offices to a given location.
         * Filters by state first, then calculates Haversine distance for each,
         * and returns the top N sorted by distance ascending.
         *
         * @param {number} clientLat - Client's latitude.
         * @param {number} clientLng - Client's longitude.
         * @param {string} state - Two-letter state abbreviation to filter by.
         * @param {Array<Object>} offices - Array of geocoded FO office objects.
         * @param {number} [limit=5] - Maximum number of results to return.
         * @returns {Array<{office: Object, distanceMiles: number}>} Sorted results.
         */
        findNearest(clientLat, clientLng, state, offices, limit = 5) {
            if (!offices || !offices.length) return [];

            const stateUpper = (state || '').toUpperCase();

            // Filter offices with valid coordinates in the same state
            const candidates = offices.filter(o =>
                o.lat != null && o.lng != null && o.state === stateUpper
            );

            // If fewer than limit results in-state, expand to neighboring states
            // but always prioritize in-state offices
            let results = candidates.map(office => ({
                office,
                distanceMiles: this.haversine(clientLat, clientLng, office.lat, office.lng)
            }));

            // If we have too few in-state, also find the nearest from ALL states
            if (results.length < limit) {
                const allCandidates = offices
                    .filter(o => o.lat != null && o.lng != null && o.state !== stateUpper)
                    .map(office => ({
                        office,
                        distanceMiles: this.haversine(clientLat, clientLng, office.lat, office.lng)
                    }))
                    .sort((a, b) => a.distanceMiles - b.distanceMiles)
                    .slice(0, limit - results.length);

                results = results.concat(allCandidates);
            }

            // Sort by distance
            results.sort((a, b) => a.distanceMiles - b.distanceMiles);

            return results.slice(0, limit);
        },

        /**
         * Extracts the two-letter state abbreviation from an address string.
         * Handles formats like "123 Main St, City, ST 12345" and "City, ST, 12345".
         *
         * @param {string} address - The address string.
         * @returns {string|null} Two-letter state or null.
         */
        extractState(address) {
            if (!address) return null;
            // Try "City, ST ZIP" or "City, ST, ZIP"
            const match = address.match(/,\s*([A-Z]{2})\s*[,\s]\s*\d{5}/i) ||
                address.match(/,\s*([A-Z]{2})\s*$/i) ||
                address.match(/\b([A-Z]{2})\s+\d{5}/i);
            return match ? match[1].toUpperCase() : null;
        }
    };

    app.Core.DistanceCalculator = DistanceCalculator;
})();
