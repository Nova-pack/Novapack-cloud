const fs = require('fs');
const content = fs.readFileSync('public/admin.html', 'utf8');
const startIdx = content.indexOf('async function processAdminScannedCode');
if (startIdx !== -1) {
    fs.writeFileSync('extract_process.js', content.substring(startIdx, startIdx + 8000));
} else {
    fs.writeFileSync('extract_process.js', 'not found');
}
