const fs = require('fs');
const path = require('path');

// Dependency Order defined in Core.md
const MODULES = [
    'Core.js',
    'Automation.js',
    'Tools.js',
    'ClientNote.js'
];

const ENTRY_POINT = 'Main.js';
const OUTPUT_FILE = 'CM-Notes.user.js';

function build() {
    console.log('🚀 Starting Build Process...');
    
    const rootDir = __dirname;
    const mainPath = path.join(rootDir, ENTRY_POINT);

    if (!fs.existsSync(mainPath)) {
        console.error(`❌ Error: Entry point ${ENTRY_POINT} not found.`);
        process.exit(1);
    }

    // 1. Process Header from Main.js
    const mainContent = fs.readFileSync(mainPath, 'utf8');
    const headerMatch = mainContent.match(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/);
    
    if (!headerMatch) {
        console.error('❌ Error: No UserScript header found in Main.js');
        process.exit(1);
    }

    let header = headerMatch[0];
    // Remove @require lines pointing to our internal modules
    header = header.replace(/\/\/ @require\s+.*(Core|Automation|Tools|ClientNote)\.js.*/g, '');
    
    let bundle = header + '\n\n';

    // 2. Concatenate Modules
    MODULES.forEach(file => {
        const filePath = path.join(rootDir, file);
        if (fs.existsSync(filePath)) {
            console.log(`📦 Bundling ${file}...`);
            bundle += fs.readFileSync(filePath, 'utf8') + '\n\n';
        } else {
            console.warn(`⚠️ Warning: ${file} not found. Skipping.`);
        }
    });

    // 3. Append Main.js Body (Logic after header)
    console.log(`📦 Bundling ${ENTRY_POINT}...`);
    const mainBody = mainContent.replace(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/, '').trim();
    bundle += mainBody + '\n';

    // 4. Write Output
    fs.writeFileSync(path.join(rootDir, OUTPUT_FILE), bundle);
    console.log(`✅ Build Complete! Output file: ${OUTPUT_FILE}`);
}

build();