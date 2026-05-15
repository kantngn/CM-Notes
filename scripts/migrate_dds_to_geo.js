/**
 * @file migrate_dds_to_geo.js
 * @description Migrates DDS entries from the main SSADatabase.json into
 *   SSADatabase_geo.json if they are missing from the geo database.
 *   This ensures all DDS offices have geo-capable records.
 *
 * usage: node scripts/migrate_dds_to_geo.js
 */
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../db/SSADatabase.json');
const GEO_PATH = path.join(__dirname, '../db/SSADatabase_geo.json');

/**
 * Extracts a 5-digit ZIP code from an address string.
 */
function extractZip(address) {
    if (!address) return null;
    const matches = address.match(/\b\d{5}(?:-\d{4})?\b/g);
    if (!matches) return null;
    return matches[matches.length - 1].substring(0, 5);
}

/**
 * Extracts two-letter state abbreviation from an address string.
 */
function extractState(address) {
    if (!address) return null;
    const match = address.match(/,\s*([A-Z]{2})\s*\d{5}/i);
    return match ? match[1].toUpperCase() : null;
}

/**
 * Formats a phone number from various formats to XXX-XXX-XXXX.
 */
function formatPhone(num) {
    if (!num) return '';
    const s = String(num).replace(/\D/g, '');
    if (s.length !== 10) return s;
    return `${s.slice(0, 3)}-${s.slice(3, 6)}-${s.slice(6)}`;
}

function main() {
    console.log('Loading databases...');

    const mainDb = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    const geoDb = JSON.parse(fs.readFileSync(GEO_PATH, 'utf8'));

    if (!mainDb.DDS || !geoDb.DDS) {
        console.error('Missing DDS section in one or both databases.');
        process.exit(1);
    }

    const geoIds = new Set(geoDb.DDS.map(d => d.id));

    // Find DDS entries in main DB that are missing from geo DB
    const toAdd = mainDb.DDS.filter(d => {
        // Extract ID from the name (e.g., "S51 DDS WATERBURY VT " -> "S51")
        const id = (d.name || '').trim().split(' ')[0];
        return id && !geoIds.has(id);
    });

    console.log(`\nMain DB DDS entries: ${mainDb.DDS.length}`);
    console.log(`Geo DB DDS entries: ${geoDb.DDS.length}`);
    console.log(`Entries to migrate: ${toAdd.length}`);

    if (toAdd.length === 0) {
        console.log('Nothing to migrate!');
        return;
    }

    let added = 0;

    toAdd.forEach(d => {
        const name = (d.name || '').trim();
        const id = name.split(' ')[0];
        const address = d.fullAddress || '';
        const zip = extractZip(address);
        const state = extractState(address) || (name.match(/\b([A-Z]{2})$/)?.[1]);

        // Build office_name without the ID prefix (e.g., "S51 DDS WATERBURY VT" -> "DDS WATERBURY VT")
        const officeName = name.replace(/^\S+\s+/, '').trim();

        const newEntry = {
            id: id,
            office_name: officeName,
            address: address,
            zip: zip || '',
            state: state || '',
            lat: null,
            lng: null,
            phone: formatPhone(d.phone || ''),
            fax: formatPhone(d.fax || '')
        };

        geoDb.DDS.push(newEntry);
        added++;
        console.log(`  [+] ${id}: ${officeName} (${state || '??'}) - ${zip || 'no zip'}`);
    });

    // Sort by ID for consistency
    geoDb.DDS.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

    // Save
    fs.writeFileSync(GEO_PATH, JSON.stringify(geoDb, null, 2), 'utf8');
    console.log(`\n✓ Added ${added} entries to ${GEO_PATH}`);
    console.log(`  Geo DB now has ${geoDb.DDS.length} DDS entries.`);
    console.log('\nNext step: Run "node scripts/geocode_dds.js" to geocode the new entries.');
}

main();
