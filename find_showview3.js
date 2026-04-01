const fs = require('fs');
const text = fs.readFileSync('c:/NOVAPACK CLOUD/public/admin.html', 'utf8');
const lines = text.split('\n');
const results = [];
lines.forEach((l, i) => {
    if(l.includes('showView') && !l.includes('onclick=')) results.push(`Line ${i+1}: ${l.trim()}`);
});
fs.writeFileSync('c:/NOVAPACK CLOUD/showview_lines.json', JSON.stringify(results, null, 2));

const text2 = fs.readFileSync('c:/NOVAPACK CLOUD/all_js.js', 'utf8');
const lines2 = text2.split('\n');
const results2 = [];
lines2.forEach((l, i) => {
    if(l.includes('showView')) results2.push(`Line ${i+1}: ${l.trim()}`);
});
fs.writeFileSync('c:/NOVAPACK CLOUD/showview_lines2.json', JSON.stringify(results2, null, 2));
