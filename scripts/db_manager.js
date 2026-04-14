/**
 * @file db_manager.js
 * @description Command-line tool to update SSA office contact info in both master database files.
 * usage: node scripts/db_manager.js <id> <new_phone> [new_fax]
 */
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../db/SSADatabase.json');
const GEO_PATH = path.join(__dirname, '../db/SSADatabase_geo.json');

function formatPhone(num) {
    if (!num) return '';
    const s = String(num).replace(/\D/g, '');
    if (s.length !== 10) return num; // return as is if not 10 digits
    return `${s.slice(0, 3)}-${s.slice(3, 6)}-${s.slice(6)}`;
}

function cleanPhone(s) {
    if (!s) return null;
    return parseInt(String(s).replace(/\D/g, ''));
}

async function updateDatabase(id, newPhone, newFax) {
    console.log(`\nAttempting to update ID: ${id}...`);

    // 1. Update SSADatabase.json
    let db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    let foundInDb = false;

    ['FO', 'DDS'].forEach(type => {
        if (!db[type]) return;
        const index = db[type].findIndex(item => String(item.id) === String(id));
        if (index !== -1) {
            if (newPhone) db[type][index].phone = cleanPhone(newPhone);
            if (newFax) db[type][index].fax = cleanPhone(newFax);
            foundInDb = true;
            console.log(`[SSADatabase.json] Updated ${type} ${db[type][index].location || db[type][index].name}`);
        }
    });

    if (!foundInDb) {
        console.error(`ERROR: ID ${id} not found in SSADatabase.json`);
        return;
    }

    // 2. Update SSADatabase_geo.json
    let geo = JSON.parse(fs.readFileSync(GEO_PATH, 'utf8'));
    let foundInGeo = false;

    if (geo.FO) {
        const index = geo.FO.findIndex(item => String(item.id) === String(id));
        if (index !== -1) {
            if (newPhone) geo.FO[index].phone = formatPhone(newPhone);
            if (newFax) geo.FO[index].fax = formatPhone(newFax);
            foundInGeo = true;
            console.log(`[SSADatabase_geo.json] Updated FO ${geo.FO[index].office_name}`);
        }
    }

    // Save files
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
    fs.writeFileSync(GEO_PATH, JSON.stringify(geo, null, 2), 'utf8');

    console.log('\nSUCCESS: Database files updated successfully.');
    console.log('IMPORTANT: Run "git add ." and "git commit" to save these changes to the master repository.');
}

// CLI handling
const args = process.argv.slice(2);
if (args.length < 2) {
    console.log(`
Usage: node scripts/db_manager.js <id> <new_phone> [new_fax]

Example:
  node scripts/db_manager.js 1 8005551234 8005559999
    `);
    process.exit(0);
}

const id = args[0];
const phone = args[1];
const fax = args[2] || null;

updateDatabase(id, phone, fax);
