const fs = require('fs');

function extractMethod(filepath, methodName) {
    if (!fs.existsSync(filepath)) return `File ${filepath} not found\n`;
    const content = fs.readFileSync(filepath, 'utf8');
    const idx = content.indexOf(methodName);
    if (idx !== -1) {
        const start = Math.max(0, idx - 100);
        const end = Math.min(content.length, idx + 2500);
        return `\n--- ${methodName} in ${filepath} ---\n` + content.substring(start, end);
    }
    return `No match for ${methodName} in ${filepath}\n`;
}

let out = extractMethod('public/admin.html', 'function processAdminScannedCode(val)');
if (out.includes('No match')) out = extractMethod('public/admin.html', 'function processAdminScannedCode(');
if (out.includes('No match')) out = extractMethod('public/admin.html', 'processAdminScannedCode = ');
if (out.includes('No match')) out = extractMethod('public/reparto.js', 'processAdminScannedCode');
fs.writeFileSync('extract_func.txt', out);
