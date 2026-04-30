
const fs = require('fs');

const scrapedText = `
Alabama (AL)
Disability Determination Services
P.O. Box 830300
Birmingham, AL 35283-0300
Medical Relations Coordinator
800-292-8106

Disability Determination Services
Post Office Box 2371
Mobile, AL 36652-2371
Medical Relations Officer
800-292-6743

Florida (FL)
Department of Health
Division of Disability Determinations
Administrative Office
P.O. Box 7118
Tallahassee, FL 32314-5270
Professional Relations Coordinator
800-499-6590, ext. 5238

Department of Health
Division of Disability Determinations
PO BOX 10375
JACKSONVILLE FL 32247-0375
Professional Relations Officer
800-821-8122, ext. 4017

Department of Health
Division of Disability Determinations
P.O. BOX 839001
MIAMI FL 33283-9001
Professional Relations Officer
305-596-3020, ext. 6017

Department of Health
Division of Disability Determinations
PO BOX 15550
TAMPA FL 33684-5550
Professional Relations Officer
813-806-8950, ext. 8017

Department of Health
Division of Disability Determinations
PO BOX 9860
PENSACOLA FL 32513-9860
Professional Relations Officer
866-209-2095, ext. 3017

Division of Disability Determinations
PO BOX 144040
ORLANDO FL 32814-4040
Professional Relations Officer
800-342-2065, ext. 7017
`;

const db = JSON.parse(fs.readFileSync('d:/KDCM Note Development/CM Notes/db/SSADatabase.json', 'utf8'));
const matchedAddresses = new Set(db.DDS.map(d => d.fullAddress).filter(Boolean));

function clean(str) {
    return str.replace(/\s+/g, ' ').trim();
}

console.log("Checking for AL leftovers...");
if (!matchedAddresses.has(clean("P.O. Box 830300, Birmingham, AL 35283-0300"))) console.log("- Birmingham (AL) unmatched");
if (!matchedAddresses.has(clean("Post Office Box 2371, Mobile, AL 36652-2371"))) console.log("- Mobile (AL) unmatched");

console.log("Checking for FL leftovers...");
if (!matchedAddresses.has(clean("Department of Health, Division of Disability Determinations, Administrative Office, P.O. Box 7118, Tallahassee, FL 32314-5270"))) console.log("- Tallahassee Admin (FL) unmatched");
if (!matchedAddresses.has(clean("Department of Health, Division of Disability Determinations, PO BOX 10375, JACKSONVILLE FL 32247-0375"))) console.log("- Jacksonville (FL) unmatched");
if (!matchedAddresses.has(clean("Department of Health, Division of Disability Determinations, P.O. BOX 839001, MIAMI FL 33283-9001"))) console.log("- Miami (FL) unmatched");
if (!matchedAddresses.has(clean("Department of Health, Division of Disability Determinations, PO BOX 15550, TAMPA FL 33684-5550"))) console.log("- Tampa (FL) unmatched");
if (!matchedAddresses.has(clean("Department of Health, Division of Disability Determinations, PO BOX 9860, PENSACOLA FL 32513-9860"))) console.log("- Pensacola (FL) unmatched");
if (!matchedAddresses.has(clean("Division of Disability Determinations, PO BOX 144040, ORLANDO FL 32814-4040"))) console.log("- Orlando (FL) unmatched");
