/**
 * @file NearestOffice.js
 * @description Renders the "Nearest SSA Office" floating map popup.
 *   Uses Leaflet.js in a CSS-isolated container with defensive SLDS overrides,
 *   displays the Client's location and nearest FO offices on an interactive map.
 *
 * @requires gm-compat.js — GM_xmlhttpRequest
 * @requires DistanceCalculator.js — app.Core.DistanceCalculator
 * @requires SSADataManager.js — app.Core.SSADataManager (fetchGeo)
 * @requires WindowManager.js — app.Core.Windows
 *
 * @consumed-by SSAPanel.js
 */
(function () {
    const app = window.CM_App = window.CM_App || {};
    app.Features = app.Features || {};

    const WINDOW_ID = 'sn-nearest-office';

    const NearestOffice = {

        /**
         * Creates and opens the Nearest Office map popup.
         * Geocodes the client's address, finds nearest offices,
         * and renders an interactive Leaflet map.
         *
         * @param {string} clientAddress - Full client address string.
         * @param {string} clientState - Two-letter state abbreviation.
         * @param {string} [clientId] - Client ID for saving FO selection from sidebar.
         */
        create(clientAddress, clientState, clientId) {
            this._clientId = clientId || null;
            // Remove existing window if open
            const existing = document.getElementById(WINDOW_ID);
            if (existing) existing.remove();

            // Create floating window
            const w = document.createElement('div');
            w.id = WINDOW_ID;
            w.className = 'sn-window';
            w.style.cssText = 'width:750px; height:500px; top:80px; left:200px; font-family:"Segoe UI",sans-serif; font-size:13px;';

            // Header
            const header = document.createElement('div');
            header.className = 'sn-header';
            header.style.cssText = 'background:var(--sn-primary-dark); color:white;';
            header.innerHTML = `
                <span style="font-weight:bold;">📍 Nearest SSA Offices</span>
                <div style="display:flex; gap:5px; align-items:center;">
                    <button id="sn-nearest-gmaps" style="cursor:pointer; background:#4285F4; color:white; border:1px solid #3367D6; border-radius:3px; font-size:11px; padding:2px 8px;" title="Open Google Maps search">🗺️ Google Maps</button>
                    <button id="sn-nearest-close" style="cursor:pointer; background:transparent; border:none; color:white; font-size:18px; line-height:1;" title="Close">✕</button>
                </div>
            `;
            w.appendChild(header);

            // Body container
            const body = document.createElement('div');
            body.style.cssText = 'display:flex; flex:1; overflow:hidden;';
            w.appendChild(body);

            // Map container (will use Shadow DOM)
            const mapContainer = document.createElement('div');
            mapContainer.style.cssText = 'flex:1; position:relative;';
            body.appendChild(mapContainer);

            // Results sidebar
            const sidebar = document.createElement('div');
            sidebar.style.cssText = 'width:220px; overflow-y:auto; border-left:1px solid #ccc; background:#fafafa; padding:8px; font-size:12px;';
            sidebar.innerHTML = '<div style="text-align:center; padding:20px; color:#888;" class="sn-nearest-status"><span class="sn-dot-ani">Loading</span></div>';
            body.appendChild(sidebar);

            // Resizers
            ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].forEach(d => {
                const r = document.createElement('div');
                r.className = `sn-resizer rs-${d}`;
                w.appendChild(r);
            });

            document.body.appendChild(w);

            // Setup window behavior
            const closeBtn = w.querySelector('#sn-nearest-close');
            closeBtn.onclick = () => { w.style.display = 'none'; app.Core.Windows.updateTabState(WINDOW_ID); };
            app.Core.Windows.setup(w, null, header, 'nearest-office');

            // Setup Google Maps fallback
            const gmapsBtn = w.querySelector('#sn-nearest-gmaps');
            gmapsBtn.onclick = () => {
                const calc = app.Core.DistanceCalculator;
                const zip = this._extractZip(clientAddress);
                const query = zip ? `social+security+office+near+${zip}` : `social+security+office+near+${encodeURIComponent(clientAddress)}`;
                GM_openInTab(`https://www.google.com/maps/search/${query}`, { active: true });
            };

            // Now do the actual work
            this._loadAndRender(clientAddress, clientState, mapContainer, sidebar);
        },

        /**
         * Loads geocoded data, finds nearest offices, and renders map + sidebar.
         * @private
         */
        async _loadAndRender(clientAddress, clientState, mapContainer, sidebar) {
            const calc = app.Core.DistanceCalculator;
            const statusEl = sidebar.querySelector('.sn-nearest-status');

            try {
                // Step 1: Geocode (Use ZIP code only for reliability)
                const zip = this._extractZip(clientAddress);
                const expectedState = clientState || calc.extractState(clientAddress) || '';
                let clientCoords = null;

                if (zip) {
                    if (statusEl) statusEl.innerHTML = '<span class="sn-dot-ani">Geocoding ZIP code</span>';
                    // Include state in the query to help Nominatim focus on the correct region
                    const query = expectedState ? `${zip}, ${expectedState}` : zip;
                    const result = await calc.geocodeAddress(query);

                    // Validate result to catch any "2000 miles away" errors
                    if (calc.validateResult(result, expectedState, zip)) {
                        clientCoords = result;
                    } else {
                        console.warn('[NearestOffice] Geocode validation failed for:', query, result);
                    }
                }

                if (!clientCoords) {
                    // Fallback to full address only if ZIP missing? No, user said "without any full address geolocate attempt"
                    if (statusEl) statusEl.innerHTML = '<div style="color:#e53935;">⚠ Could not find or geocode ZIP code.<br><br>Try the Google Maps button instead.</div>';
                    return;
                }

                // Step 2: Fetch geocoded office database
                if (statusEl) statusEl.innerHTML = '<span class="sn-dot-ani">Loading office database</span>';
                const geoDb = await new Promise(resolve => {
                    app.Core.SSADataManager.fetchGeo(resolve);
                });

                if (!geoDb || !geoDb.FO) {
                    if (statusEl) statusEl.innerHTML = '<div style="color:#e53935;">⚠ Could not load office database.</div>';
                    return;
                }

                // Step 3: Find nearest offices
                const nearest = calc.findNearest(clientCoords.lat, clientCoords.lng, expectedState, geoDb.FO, 5);

                if (nearest.length === 0) {
                    if (statusEl) statusEl.innerHTML = '<div style="color:#888;">No offices found for this location.</div>';
                    return;
                }

                // Step 4: Render sidebar results
                this._renderSidebar(sidebar, nearest, clientCoords, mapContainer);

                // Step 5: Render map
                this._renderMap(mapContainer, clientCoords, nearest, clientAddress);

            } catch (err) {
                console.error('[NearestOffice] Error:', err);
                if (statusEl) statusEl.innerHTML = `<div style="color:#e53935;">⚠ Error: ${err.message}</div>`;
            }
        },

        /**
         * Renders the sidebar with the list of nearest offices.
         * @private
         */
        _renderSidebar(sidebar, nearest, clientCoords, mapContainer) {
            sidebar.innerHTML = '';

            // Title
            const title = document.createElement('div');
            title.style.cssText = 'font-weight:bold; color:var(--sn-primary-dark); margin-bottom:8px; padding-bottom:4px; border-bottom:2px solid var(--sn-primary);';
            title.innerText = `Top ${nearest.length} Nearest`;
            sidebar.appendChild(title);

            nearest.forEach((result, idx) => {
                const office = result.office;
                const card = document.createElement('div');
                card.style.cssText = 'background:white; border:1px solid #ddd; border-radius:4px; padding:6px 8px; margin-bottom:6px; cursor:pointer; transition:all 0.15s;';
                card.onmouseover = () => { card.style.borderColor = 'var(--sn-primary)'; card.style.boxShadow = '0 2px 6px rgba(0,150,136,0.2)'; };
                card.onmouseout = () => { card.style.borderColor = '#ddd'; card.style.boxShadow = 'none'; };

                const dist = result.distanceMiles.toFixed(1);
                const badge = office.is_subsidiary ? ' <span style="background:#ff9800; color:white; font-size:9px; padding:0 3px; border-radius:2px;">SUB</span>' : '';
                const stateTag = `<span style="background:var(--sn-bg-light); color:var(--sn-primary-dark); font-size:9px; padding:0 3px; border-radius:2px;">${office.state}</span>`;

                card.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:start;">
                        <div style="font-weight:bold; color:var(--sn-primary-dark); font-size:11px;">${idx + 1}. ${office.office_name}${badge}</div>
                        <div style="font-size:10px; color:#555; white-space:nowrap;">${dist} mi ${stateTag}</div>
                    </div>
                    <div style="font-size:10px; color:#666; margin-top:2px;">${office.address}</div>
                    <div style="font-size:10px; color:#444; margin-top:2px;">
                        📞 ${office.phone || 'N/A'}${office.fax ? ` &nbsp;📠 ${office.fax}` : ''}
                    </div>
                `;

                // Click to select this office + pan map
                card.onclick = () => {
                    // Save to SSA Panel if clientId available
                    if (this._clientId && app.Features.ClientNote) {
                        const phone = office.phone || '';
                        const fax = office.fax || '';
                        const displayText = `${office.office_name}\n${office.address}, ${office.zip}\nPN: ${phone}\nFax: ${fax}`;
                        app.Features.ClientNote.updateAndSaveData(this._clientId, { FO_Selection: office.id, FO_Text: displayText });

                        // Update the SSA Panel display div if visible
                        const foDisplay = document.querySelector('.sn-ssa-section[data-type="FO"] .sn-ssa-display');
                        if (foDisplay) foDisplay.innerText = displayText;
                    }

                    // Pan map to this office
                    if (this._map && office.lat && office.lng) {
                        this._map.setView([office.lat, office.lng], 14);
                        if (this._markers && this._markers[idx]) {
                            this._markers[idx].openPopup();
                        }
                    }
                };

                sidebar.appendChild(card);
            });

            // Add a note about the data source
            const note = document.createElement('div');
            note.style.cssText = 'font-size:9px; color:#999; margin-top:8px; text-align:center; font-style:italic;';
            note.innerText = 'Distances are approximate (straight line)';
            sidebar.appendChild(note);
        },

        /**
         * Renders the Leaflet map in a standard div container.
         * Leaflet JS is loaded via manifest content_scripts; CSS is injected once.
         * @private
         */
        _renderMap(container, clientCoords, nearest, clientAddress) {
            // Inject Leaflet CSS into main document (only once)
            if (!document.getElementById('sn-leaflet-css')) {
                const leafletCssUrl = chrome.runtime.getURL('src/lib/leaflet.min.css');
                const link = document.createElement('link');
                link.id = 'sn-leaflet-css';
                link.rel = 'stylesheet';
                link.href = leafletCssUrl;
                document.head.appendChild(link);
            }

            // Map container div
            const mapDiv = document.createElement('div');
            mapDiv.id = 'sn-map-root';
            mapDiv.style.cssText = 'width:100%; height:100%;';
            container.appendChild(mapDiv);

            // L is loaded via manifest content_scripts
            if (typeof L !== 'undefined') {
                setTimeout(() => this._initMap(mapDiv, clientCoords, nearest, clientAddress), 50);
            } else {
                mapDiv.innerHTML = '<div style="padding:20px; color:#e53935; text-align:center;">⚠ Map library not available. Use the Google Maps button.</div>';
            }
        },

        /**
         * Initializes the Leaflet map instance and adds markers.
         * @private
         */
        _initMap(mapDiv, clientCoords, nearest, clientAddress) {
            // L should be available globally after script load
            if (typeof L === 'undefined') {
                mapDiv.innerHTML = '<div style="padding:20px; color:#e53935; text-align:center;">⚠ Map library not available.</div>';
                return;
            }

            // Initialize map centered on client
            const map = L.map(mapDiv, {
                center: [clientCoords.lat, clientCoords.lng],
                zoom: 10,
                zoomControl: true
            });

            this._map = map;

            // OpenStreetMap tiles
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap',
                maxZoom: 18
            }).addTo(map);

            // Custom icon factory
            const makeIcon = (color, label) => {
                return L.divIcon({
                    className: '',
                    html: `<div style="
                        background:${color};
                        width:28px; height:28px;
                        border-radius:50% 50% 50% 0;
                        transform:rotate(-45deg);
                        border:2px solid white;
                        box-shadow:0 2px 6px rgba(0,0,0,0.3);
                        display:flex; align-items:center; justify-content:center;
                    "><span style="transform:rotate(45deg); color:white; font-weight:bold; font-size:12px;">${label}</span></div>`,
                    iconSize: [28, 28],
                    iconAnchor: [14, 28],
                    popupAnchor: [0, -28]
                });
            };

            // Blue marker for client
            const clientIcon = makeIcon('#1976D2', '🏠');
            L.marker([clientCoords.lat, clientCoords.lng], { icon: clientIcon })
                .addTo(map)
                .bindPopup(`<div class="sn-map-popup-name">Client Address</div><div class="sn-map-popup-addr">${clientAddress}</div>`)
                .openPopup();

            // Green markers for FO offices
            this._markers = [];
            const bounds = L.latLngBounds([[clientCoords.lat, clientCoords.lng]]);

            nearest.forEach((result, idx) => {
                const office = result.office;
                if (!office.lat || !office.lng) return;

                const officeIcon = makeIcon('#2E7D32', idx + 1);
                const marker = L.marker([office.lat, office.lng], { icon: officeIcon })
                    .addTo(map)
                    .bindPopup(`
                        <div class="sn-map-popup-name">${office.office_name}</div>
                        <div class="sn-map-popup-addr">${office.address}, ${office.zip}</div>
                        <div class="sn-map-popup-phone">📞 ${office.phone || 'N/A'}${office.fax ? `<br>📠 ${office.fax}` : ''}</div>
                        <div class="sn-map-popup-dist">${result.distanceMiles.toFixed(1)} miles away</div>
                    `);

                this._markers.push(marker);
                bounds.extend([office.lat, office.lng]);
            });

            // Fit map to show all markers
            if (nearest.length > 0) {
                map.fitBounds(bounds, { padding: [30, 30] });
            }

            // Auto-resize map when parent window is resized (drag handles)
            setTimeout(() => map.invalidateSize(), 200);
            const ro = new ResizeObserver(() => map.invalidateSize());
            ro.observe(mapDiv);

            // Clean up observer when window is removed
            const observer = new MutationObserver((mutations) => {
                for (const m of mutations) {
                    for (const node of m.removedNodes) {
                        if (node.id === WINDOW_ID || node.contains?.(mapDiv)) {
                            ro.disconnect();
                            observer.disconnect();
                            return;
                        }
                    }
                }
            });
            observer.observe(document.body, { childList: true });
        },

        /**
         * Extracts ZIP code from an address string.
         * @private
         */
        _extractZip(address) {
            if (!address) return null;
            // Look for a 5-digit number. We take the LAST one found because 
            // the first one is often the house number (e.g. 11424).
            const matches = address.match(/\b\d{5}(?:-\d{4})?\b/g);
            if (!matches) return null;
            // ZIP is almost always at the very end of a standard US address
            const lastMatch = matches[matches.length - 1];
            return lastMatch.substring(0, 5);
        },

        /** @private */
        _map: null,
        /** @private */
        _markers: []
    };

    app.Features.NearestOffice = NearestOffice;
})();
