/**
 * @file db_manager.js
 * @description Command-line tool to update SSA office contact info in the single master database.
 * usage: node scripts/db_manager.js <id> <new_phone> [new_fax]
 */
const fs = require('fs');
const path = require('path');

const GEO_PATH = path.join(__dirname, '../db/SSADatabase_geo.json');

function formatPhone(num) {
    if (!num) return '';
    const s = String(num).replace(/\D/g, '');
    if (s.length !== 10) return num;
    return `${s.slice(0, 3)}-${s.slice(3, 6)}-${s.slice(6)}`;
}

async function updateDatabase(id, newPhone, newFax) {
    console.log(`\nAttempting to update ID: ${id}...`);

    let geo = JSON.parse(fs.readFileSync(GEO_PATH, 'utf8'));
    let found = false;

    ['FO', 'DDS'].forEach(type => {
        if (!geo[type]) return;
        const index = geo[type].findIndex(item => String(item.id) === String(id));
        if (index !== -1) {
            if (newPhone) geo[type][index].phone = formatPhone(newPhone);
            if (newFax) geo[type][index].fax = formatPhone(newFax);
            found = true;
            console.log(`[SSADatabase_geo.json] Updated ${type} ${geo[type][index].office_name}`);
        }
    });

    if (!found) {
        console.error(`ERROR: ID ${id} not found in database.`);
        return;
    }

    fs.writeFileSync(GEO_PATH, JSON.stringify(geo, null, 2), 'utf8');
    console.log('\nSUCCESS: Database updated.');
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
