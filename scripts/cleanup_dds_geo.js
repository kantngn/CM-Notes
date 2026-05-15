/**
 * @file cleanup_dds_geo.js
 * @description Cleans up duplicate and incomplete DDS entries in the geo database.
 *
 * Fixes:
 *   1. Removes S0M (duplicate of S27 — DDS NORTH MADISON MS, same address/phone)
 *   2. V61 DDS SIERRA CLOVIS CA — no address available, just phone
 *
 * usage: node scripts/cleanup_dds_geo.js
 */
const fs = require('fs');
const path = require('path');

const GEO_PATH = path.join(__dirname, '../db/SSADatabase_geo.json');
const geo = JSON.parse(fs.readFileSync(GEO_PATH, 'utf8'));

const before = geo.DDS.length;

// 1. Remove S0M (exact duplicate of S27)
geo.DDS = geo.DDS.filter(d => d.id !== 'S0M');

console.log(`Removed S0M (duplicate of S27)`);

const after = geo.DDS.length;
console.log(`DDS entries: ${before} → ${after}`);

// 2. Try to find an address for V61 from the main DB
const mainDb = JSON.parse(fs.readFileSync(path.join(__dirname, '../db/SSADatabase.json'), 'utf8'));
const v61main = mainDb.DDS.find(d => (d.name || '').trim().startsWith('V61'));
if (v61main) {
    console.log(`V61 main DB entry:`, JSON.stringify(v61main));
}

fs.writeFileSync(GEO_PATH, JSON.stringify(geo, null, 2), 'utf8');
console.log(`Saved to ${GEO_PATH}`);
