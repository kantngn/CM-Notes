/**
 * @file db_search.js
 * @description Search tool for the SSA Database records to find IDs.
 * usage: node scripts/db_search.js <query>
 */
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../db/SSADatabase.json');

function searchDatabase(query) {
    if (!query) return;
    const q = query.toUpperCase();
    const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    const results = [];

    ['FO', 'DDS'].forEach(type => {
        if (!db[type]) return;
        db[type].forEach(item => {
            const name = (item.location || item.name || '').toUpperCase();
            const addr = (item.fullAddress || '').toUpperCase();
            if (name.includes(q) || addr.includes(q) || String(item.id) === query) {
                results.push({ type, ...item });
            }
        });
    });

    if (results.length === 0) {
        console.log('No results found.');
    } else {
        console.log(`\nFound ${results.length} results:\n`);
        results.forEach(r => {
            console.log(`[ID: ${r.id}] ${r.type}: ${r.location || r.name}`);
            console.log(`   Address: ${r.fullAddress || 'N/A'}`);
            console.log(`   Current PN: ${r.phone || 'N/A'} | Fax: ${r.fax || 'N/A'}`);
            console.log('--------------------------------------------------');
        });
    }
}

const args = process.argv.slice(2);
if (args.length === 0) {
    console.log('Usage: node scripts/db_search.js <query>');
    process.exit(0);
}

searchDatabase(args[0]);
