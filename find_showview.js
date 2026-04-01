const fs = require('fs');
const text = fs.readFileSync('c:/NOVAPACK CLOUD/public/admin.html', 'utf8');
const lines = text.split('\n');
lines.forEach((l, i) => {
    if(l.includes('function showView(')) console.log(`[showView] Line ${i+1}: ${l.trim()}`);
    if(l.includes('admin-tickets')) console.log(`[admin-tickets] Line ${i+1}: ${l.trim()}`);
    if(l.includes('btn-admin-add-pkg')) console.log(`[btn-admin-add-pkg] Line ${i+1}: ${l.trim()}`);
});
