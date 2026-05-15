/**
 * @file fix_dds_zips.js
 * @description Fixes missing ZIP codes for DDS entries that have addresses
 *   containing ZIPs but where the zip field was never extracted.
 *
 * usage: node scripts/fix_dds_zips.js
 */
const fs = require('fs');
const path = require('path');

const GEO_PATH = path.join(__dirname, '../db/SSADatabase_geo.json');

const ZIP_FIXES = {
    'S13': { zip: '30087', state: 'GA' },
    'S36': { zip: '27699', state: 'NC' },
    'S39': { zip: '73124', state: 'OK' },
    'V27': { zip: '07101', state: 'NJ' },
    'V28': { zip: '07010', state: 'NJ' },
    'V56': { zip: '08625', state: 'NJ' }
};

const geo = JSON.parse(fs.readFileSync(GEO_PATH, 'utf8'));
let fixed = 0;

Object.entries(ZIP_FIXES).forEach(([id, data]) => {
    const entry = geo.DDS.find(d => d.id === id);
    if (entry) {
        entry.zip = data.zip;
        // Also ensure state is set
        if (!entry.state) entry.state = data.state;
        fixed++;
        console.log(`  ✓ ${id}: ${entry.office_name} → ZIP ${data.zip}`);
    } else {
        console.log(`  ✗ ${id}: not found in DDS`);
    }
});

fs.writeFileSync(GEO_PATH, JSON.stringify(geo, null, 2), 'utf8');
console.log(`\nFixed ${fixed} entries. Saved to ${GEO_PATH}`);
