/**
 * @file geocode_dds.js
 * @description Geocodes all DDS entries in SSADatabase_geo.json that are missing
 *   lat/lng coordinates. Uses OpenStreetMap Nominatim API (1 req/sec rate limit).
 *
 * usage: node scripts/geocode_dds.js
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const GEO_PATH = path.join(__dirname, '../db/SSADatabase_geo.json');

/**
 * Geocodes an address using Nominatim.
 * @param {string} address - Full address string.
 * @returns {Promise<{lat: number, lng: number}|null>}
 */
function geocodeAddress(address) {
    return new Promise((resolve, reject) => {
        const params = new URLSearchParams({
            format: 'json',
            addressdetails: '1',
            countrycodes: 'us',
            limit: '1',
            q: address
        });

        const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;

        https.get(url, {
            headers: { 'User-Agent': 'KD-CM-Notes-Geocoder/1.0' }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const results = JSON.parse(data);
                    if (results && results.length > 0) {
                        const r = results[0];
                        resolve({
                            lat: parseFloat(r.lat),
                            lng: parseFloat(r.lon)
                        });
                    } else {
                        resolve(null);
                    }
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

/**
 * Pause helper for rate limiting.
 */
function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function main() {
    console.log('Loading SSADatabase_geo.json...');
    const geo = JSON.parse(fs.readFileSync(GEO_PATH, 'utf8'));

    if (!geo.DDS || geo.DDS.length === 0) {
        console.log('No DDS entries found in the database.');
        return;
    }

    const toGeocode = geo.DDS.filter(d => d.lat === null || d.lng === null);
    const total = geo.DDS.length;
    const alreadyDone = total - toGeocode.length;

    console.log(`Total DDS entries: ${total}`);
    console.log(`Already geocoded: ${alreadyDone}`);
    console.log(`Need geocoding: ${toGeocode.length}`);

    if (toGeocode.length === 0) {
        console.log('Nothing to do!');
        return;
    }

    let success = 0;
    let failed = 0;

    for (let i = 0; i < toGeocode.length; i++) {
        const entry = toGeocode[i];
        // Build a good query: use address + zip for best results
        const query = `${entry.address}, ${entry.zip}, ${entry.state}`;
        const pct = ((i + 1) / toGeocode.length * 100).toFixed(1);

        process.stdout.write(`[${pct}% ${i + 1}/${toGeocode.length}] ${entry.office_name}... `);

        try {
            const coords = await geocodeAddress(query);
            if (coords) {
                // Find entry in original array and update
                const idx = geo.DDS.findIndex(d => d.id === entry.id);
                if (idx !== -1) {
                    geo.DDS[idx].lat = coords.lat;
                    geo.DDS[idx].lng = coords.lng;
                    process.stdout.write(`✓ ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}\n`);
                    success++;
                }
            } else {
                process.stdout.write('✗ No results\n');
                failed++;
            }
        } catch (err) {
            process.stdout.write(`✗ Error: ${err.message}\n`);
            failed++;
        }

        // Nominatim requires max 1 request per second
        if (i < toGeocode.length - 1) {
            await sleep(1100);
        }
    }

    // Save updated database
    fs.writeFileSync(GEO_PATH, JSON.stringify(geo, null, 2), 'utf8');

    const remaining = geo.DDS.filter(d => d.lat === null || d.lng === null);

    console.log('\n═══════════════════════════════════════');
    console.log(`  Total:       ${total}`);
    console.log(`  Successful:  ${success}`);
    console.log(`  Failed:      ${failed}`);
    console.log(`  Still null:  ${remaining.length}`);
    console.log('═══════════════════════════════════════');
    console.log(`Database saved to: ${GEO_PATH}`);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
