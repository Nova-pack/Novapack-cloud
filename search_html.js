const fs = require('fs');
const html = fs.readFileSync('public/admin.html', 'utf8');

function findId(id) {
    const idx = html.indexOf(`id="${id}"`);
    if (idx === -1) {
        console.log(`id="${id}" not found.`);
        return;
    }
    const start = Math.max(0, idx - 100);
    const end = Math.min(html.length, idx + 1000);
    console.log(`\n\n=== ${id} ===\n${html.substring(start, end)}\n=================\n`);
}

findId('view-admin-tickets');
findId('qr-scanner-view');
