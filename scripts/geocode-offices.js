#!/usr/bin/env node
/**
 * geocode-offices.js
 * 
 * Batch geocoding script for SSA Field Office addresses.
 * Uses OpenStreetMap Nominatim (free, 1 req/sec) to add lat/lng
 * to each FO entry and outputs a standardized SSADatabase_geo.json.
 * 
 * Usage:
 *   node scripts/geocode-offices.js
 * 
 * Options:
 *   --resume   Resume from where the last run left off (reads partial output)
 *   --dry-run  Parse addresses but don't make API calls
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// ── Config ─────────────────────────────────────────────────────
const INPUT_PATH = path.join(__dirname, '..', 'db', 'SSADatabase.json');
const OUTPUT_PATH = path.join(__dirname, '..', 'db', 'SSADatabase_geo.json');
const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'KD-CM-Notes-Geocoder/1.0 (batch geocoding for internal tool)';
const RATE_LIMIT_MS = 1100; // 1.1 seconds to stay safely under 1 req/sec

// US State abbreviation list for validation
const US_STATES = new Set([
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN',
    'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV',
    'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN',
    'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC', 'PR', 'GU', 'VI', 'AS', 'MP'
]);

// ── Address Parsing ────────────────────────────────────────────

/**
 * Parse a fullAddress string like "STE 100, 70 COMMERCIAL ST, CONCORD, NH, 3301"
 * into structured components.
 */
function parseAddress(fullAddress) {
    if (!fullAddress) return null;

    const parts = fullAddress.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length < 3) return null;

    // Last part is ZIP
    let zip = parts[parts.length - 1].trim();
    // Second to last is state
    const state = parts[parts.length - 2].trim().toUpperCase();
    // Third to last is city
    const city = parts[parts.length - 3].trim();

    // Everything before city is street (may include suite/floor prefix)
    const streetParts = parts.slice(0, parts.length - 3);
    let street = streetParts.join(', ').trim();

    // Remove suite/floor/room prefixes that confuse geocoders
    street = street.replace(/^(STE\s+\w+|SUITE\s+\w+|RM\s+\w+|FL\s+\d+|FLR\s+\d+|\d+(ST|ND|RD|TH)\s+FL(R|OOR)?|ROOM\s+\w+|FEDERAL\s+BLDG?\s*\w*|FED\s+BLDG?\s*\w*|GIAIMO\s+FED\s+BLDG\s*\w*|HASTINGS\s+KEITH\s+FED\s+BL\w*|PHILBIN\s+FED\s+BLDG|MADISON\s+PLACE|ROEBLING\s+MARKET|PAVILION\s+PLZ|ADMINISTRATION|TECHNOLOGY\s+PARK)\s*,?\s*/gi, '').trim();

    // Clean leading comma
    street = street.replace(/^,\s*/, '').trim();

    // Sometimes street is empty after cleaning (address had only a building name)
    if (!street) {
        // Use city name as the search query fallback
        street = '';
    }

    // Zero-pad ZIP codes
    if (/^\d+$/.test(zip)) {
        zip = zip.padStart(5, '0');
    }

    // Validate state
    if (!US_STATES.has(state)) {
        console.warn(`  ⚠ Invalid state "${state}" in address: ${fullAddress}`);
    }

    return { street, city, state, zip };
}

/**
 * Format phone number for display: 8773193076 → "877-319-3076"
 */
function formatPhone(phone) {
    if (!phone) return '';
    const digits = String(phone).replace(/\D/g, '');
    if (digits.length === 10) {
        return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    if (digits.length === 11 && digits[0] === '1') {
        return `${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
    }
    return String(phone);
}

// ── Geocoding ──────────────────────────────────────────────────

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Geocode an address using Nominatim.
 * Returns { lat, lng } or null on failure.
 */
function geocode(street, city, state, zip) {
    return new Promise((resolve) => {
        // Build structured query
        const params = new URLSearchParams({
            format: 'json',
            countrycodes: 'us',
            limit: '1',
            street: street,
            city: city,
            state: state,
            postalcode: zip
        });

        const url = `${NOMINATIM_BASE}?${params.toString()}`;

        https.get(url, {
            headers: { 'User-Agent': USER_AGENT }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const results = JSON.parse(data);
                    if (results && results.length > 0) {
                        resolve({
                            lat: parseFloat(results[0].lat),
                            lng: parseFloat(results[0].lon)
                        });
                    } else {
                        resolve(null);
                    }
                } catch (e) {
                    console.error(`  ✗ JSON parse error: ${e.message}`);
                    resolve(null);
                }
            });
        }).on('error', (err) => {
            console.error(`  ✗ Network error: ${err.message}`);
            resolve(null);
        });
    });
}

/**
 * Fallback: geocode using just city + state + zip (less precise but better than nothing)
 */
function geocodeFallback(city, state, zip) {
    return new Promise((resolve) => {
        const params = new URLSearchParams({
            format: 'json',
            countrycodes: 'us',
            limit: '1',
            q: `${city}, ${state} ${zip}`
        });

        const url = `${NOMINATIM_BASE}?${params.toString()}`;

        https.get(url, {
            headers: { 'User-Agent': USER_AGENT }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const results = JSON.parse(data);
                    if (results && results.length > 0) {
                        resolve({
                            lat: parseFloat(results[0].lat),
                            lng: parseFloat(results[0].lon)
                        });
                    } else {
                        resolve(null);
                    }
                } catch (e) {
                    resolve(null);
                }
            });
        }).on('error', () => resolve(null));
    });
}

// ── Main ───────────────────────────────────────────────────────

async function main() {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');
    const resume = args.includes('--resume');

    console.log('╔══════════════════════════════════════════╗');
    console.log('║   SSA Field Office Geocoder              ║');
    console.log('╚══════════════════════════════════════════╝');
    console.log(`  Mode: ${dryRun ? 'DRY RUN (no API calls)' : 'LIVE'}`);

    // Load source data
    const rawData = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf-8'));
    const foEntries = rawData.FO || [];
    console.log(`  Input: ${foEntries.length} FO entries from SSADatabase.json\n`);

    // Load partial results if resuming
    let existingResults = {};
    if (resume && fs.existsSync(OUTPUT_PATH)) {
        const partial = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf-8'));
        if (partial.FO) {
            partial.FO.forEach(o => {
                if (o.lat && o.lng) existingResults[o.id] = o;
            });
            console.log(`  Resuming: ${Object.keys(existingResults).length} entries already geocoded\n`);
        }
    }

    const results = [];
    let geocoded = 0;
    let failed = 0;
    let skipped = 0;

    for (let i = 0; i < foEntries.length; i++) {
        const entry = foEntries[i];
        const id = entry.id;
        const location = (entry.location || '').trim();
        const fullAddress = (entry.fullAddress || '').trim();

        // Check if already geocoded (resume mode)
        if (existingResults[id]) {
            results.push(existingResults[id]);
            skipped++;
            continue;
        }

        const parsed = parseAddress(fullAddress);
        const isSubsidiary = typeof id === 'string' && /^[A-Za-z]/.test(id);

        process.stdout.write(`  [${i + 1}/${foEntries.length}] ${location}... `);

        if (!parsed) {
            console.log('✗ Could not parse address');
            results.push({
                id,
                office_name: location,
                address: fullAddress,
                zip: '',
                state: '',
                lat: null,
                lng: null,
                phone: formatPhone(entry.phone),
                fax: formatPhone(entry.fax),
                is_subsidiary: isSubsidiary
            });
            failed++;
            continue;
        }

        let coords = null;

        if (!dryRun) {
            // Primary attempt with full address
            coords = await geocode(parsed.street, parsed.city, parsed.state, parsed.zip);
            await sleep(RATE_LIMIT_MS);

            // Fallback if primary failed
            if (!coords) {
                process.stdout.write('(fallback) ');
                coords = await geocodeFallback(parsed.city, parsed.state, parsed.zip);
                await sleep(RATE_LIMIT_MS);
            }
        }

        const cleanAddress = [parsed.street, parsed.city, parsed.state].filter(Boolean).join(', ');

        const result = {
            id,
            office_name: location,
            address: cleanAddress || fullAddress,
            zip: parsed.zip,
            state: parsed.state,
            lat: coords ? coords.lat : null,
            lng: coords ? coords.lng : null,
            phone: formatPhone(entry.phone),
            fax: formatPhone(entry.fax),
            is_subsidiary: isSubsidiary
        };

        results.push(result);

        if (coords) {
            console.log(`✓ (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`);
            geocoded++;
        } else {
            console.log(dryRun ? '– (dry run)' : '✗ No result');
            failed++;
        }

        // Save progress every 50 entries
        if (!dryRun && (i + 1) % 50 === 0) {
            const progressOutput = { FO: results, _meta: { lastUpdated: new Date().toISOString(), totalProcessed: i + 1 } };
            fs.writeFileSync(OUTPUT_PATH, JSON.stringify(progressOutput, null, 2));
            console.log(`  💾 Progress saved (${results.length} entries)\n`);
        }
    }

    // Write final output
    const output = {
        FO: results,
        _meta: {
            generatedAt: new Date().toISOString(),
            sourceFile: 'SSADatabase.json',
            totalEntries: results.length,
            geocoded: geocoded + skipped,
            failed: failed,
            geocoder: 'OpenStreetMap Nominatim'
        }
    };

    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  ✅ Complete! Output: db/SSADatabase_geo.json`);
    console.log(`  📊 Geocoded: ${geocoded} | Resumed: ${skipped} | Failed: ${failed} | Total: ${results.length}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
