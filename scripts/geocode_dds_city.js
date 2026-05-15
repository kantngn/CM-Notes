/**
 * @file geocode_dds_city.js
 * @description Re-geocodes DDS entries using city names extracted from
 *   office_name (e.g., "DDS OAKLAND CA" → "Oakland, CA") instead of ZIP codes,
 *   since many DDS offices use PO Box ZIPs that Nominatim can't resolve.
 *
 * usage: node scripts/geocode_dds_city.js
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const GEO_PATH = path.join(__dirname, '../db/SSADatabase_geo.json');

/**
 * Extracts the city name from a DDS office_name string.
 * @param {string} name - e.g. "DDS OAKLAND CA"
 * @returns {string|null} e.g. "Oakland"
 */
function extractCity(name) {
    if (!name) return null;
    // Match "DDS <city> <state>" or "<prefix> <city> <state>"
    const cleaned = name.trim().replace(/\s+/g, ' ');
    // Remove common prefixes
    let cityPart = cleaned
        .replace(/^(DDS\s+)/i, '')
        .replace(/^(DPB\s+)/i, '')
        .replace(/^(PR\s+)/i, '')
        .replace(/&?\s*\S+\s+DPU\s+/i, '')
        .replace(/\s+REGION\s*/i, ' ')
        .replace(/\s+REGIONAL\s+OFFICE\s*/i, ' ')
        .trim();
    // Remove trailing state code (2 uppercase letters)
    cityPart = cityPart.replace(/\s+[A-Z]{2}\s*$/, '').trim();
    return cityPart || null;
}

/**
 * Geocodes a city+state query using Nominatim.
 */
function geocodeCity(city, state) {
    return new Promise((resolve, reject) => {
        const query = `${city}, ${state}`;
        const params = new URLSearchParams({
            format: 'json',
            countrycodes: 'us',
            limit: '1',
            q: query
        });
        const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;
        https.get(url, { headers: { 'User-Agent': 'KD-CM-Notes-Geocoder/1.0' } }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try {
                    const results = JSON.parse(data);
                    if (results && results.length > 0) {
                        resolve({ lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) });
                    } else {
                        resolve(null);
                    }
                } catch (e) { reject(e); }
            });
        }).on('error', reject);
    });
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function main() {
    console.log('Loading SSADatabase_geo.json...');
    const geo = JSON.parse(fs.readFileSync(GEO_PATH, 'utf8'));
    const dds = geo.DDS;

    // Re-geocode ALL DDS entries using city names for accuracy
    const toFix = dds.filter(d => {
        const city = extractCity(d.office_name);
        return city && city.length > 0;
    });

    // Also check: DDS DALTON GA (zip 30271, lat 36.44,-76.69 - that's NC, not GA)
    // DDS SHREVEPORT LA (zip 71134, lat 34.05,-118.24 - that's LA, not Shreveport)
    // DDS DETROIT MI (zip 48231, lat 38.56,-94.85 - that's Kansas)
    // DDS KALAMAZOO MI (zip 49003, lat 38.56,-94.85 - that's Kansas)
    // DDS HONOLULU HI (zip 96804, lat 36.73,-85.20 - that's Kentucky)
    // DDS NY NY (zip 12260, lat 42.68,-73.85 - Albany, not NYC)

    console.log(`Total DDS: ${dds.length}`);
    console.log(`Entries to re-geocode: ${toFix.length}\n`);

    if (toFix.length === 0) {
        console.log('Nothing to fix!');
        return;
    }

    let success = 0;
    let failed = 0;

    for (let i = 0; i < toFix.length; i++) {
        const entry = toFix[i];
        const city = extractCity(entry.office_name);
        const pct = ((i + 1) / toFix.length * 100).toFixed(1);

        process.stdout.write(`[${pct}% ${i + 1}/${toFix.length}] ${entry.office_name}... `);

        if (!city) {
            process.stdout.write(`✗ Could not extract city from "${entry.office_name}"\n`);
            failed++;
            continue;
        }

        try {
            const coords = await geocodeCity(city, entry.state);
            if (coords) {
                const idx = dds.findIndex(d => d.id === entry.id);
                if (idx !== -1) {
                    dds[idx].lat = coords.lat;
                    dds[idx].lng = coords.lng;
                    process.stdout.write(`✓ ${city}, ${entry.state} → ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}\n`);
                    success++;
                }
            } else {
                process.stdout.write(`✗ No results for "${city}, ${entry.state}"\n`);
                failed++;
            }
        } catch (err) {
            process.stdout.write(`✗ Error: ${err.message}\n`);
            failed++;
        }

        if (i < toFix.length - 1) await sleep(1100);
    }

    fs.writeFileSync(GEO_PATH, JSON.stringify(geo, null, 2), 'utf8');

    const remaining = dds.filter(d => !d.lat || !d.lng);

    console.log('\n═══════════════════════════════════════');
    console.log(`  Total DDS:      ${dds.length}`);
    console.log(`  Attempted:      ${toFix.length}`);
    console.log(`  Successful:     ${success}`);
    console.log(`  Failed:         ${failed}`);
    console.log(`  Remaining null: ${remaining.length}`);
    console.log('═══════════════════════════════════════');
    if (remaining.length > 0) {
        console.log('Still null:');
        remaining.forEach(d => console.log(`  ${d.id}: ${d.office_name}`));
    }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
