const fs = require('fs');

function extractFile(filepath, idStr) {
    if (!fs.existsSync(filepath)) return `File ${filepath} not found\n`;
    const content = fs.readFileSync(filepath, 'utf8');
    const results = [];
    let idx = content.indexOf(idStr);
    while (idx !== -1) {
        const start = Math.max(0, idx - 200);
        const end = Math.min(content.length, idx + 2000);
        results.push(`\n--- Match in ${filepath} for ${idStr} ---\n` + content.substring(start, end));
        idx = content.indexOf(idStr, idx + idStr.length);
    }
    return results.length ? results.join('\n') : `No match for ${idStr} in ${filepath}\n`;
}

let out = '';
out += extractFile('public/admin.html', 'view-admin-tickets');
out += extractFile('public/admin.html', 'admin-tickets');
out += extractFile('public/admin.html', 'qr-scanner');
out += extractFile('public/admin.html', 'adminScannerMode');

// Also scan JS files for adminScannerMode to find where scanning is handled
const mainDir = fs.readdirSync('.', {withFileTypes: true});
mainDir.forEach(d => {
    if(d.isFile() && d.name.endsWith('.js')) {
        const txt = fs.readFileSync(d.name, 'utf8');
        if(txt.includes('adminScannerMode')) {
            out += `\n--- Found adminScannerMode in ${d.name} ---\n`;
            const idx = txt.indexOf('adminScannerMode');
            out += txt.substring(Math.max(0, idx - 200), Math.min(txt.length, idx + 1000));
        }
    }
});

const pubDir = fs.readdirSync('public', {withFileTypes: true});
pubDir.forEach(d => {
    if(d.isFile() && d.name.endsWith('.js')) {
        const txt = fs.readFileSync(`public/${d.name}`, 'utf8');
        if(txt.includes('adminScannerMode')) {
            out += `\n--- Found adminScannerMode in public/${d.name} ---\n`;
            const idx = txt.indexOf('adminScannerMode');
            out += txt.substring(Math.max(0, idx - 200), Math.min(txt.length, idx + 1000));
        }
    }
});

fs.writeFileSync('extract_out.txt', out);
