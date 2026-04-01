const fs = require('fs');
const text = fs.readFileSync('c:/NOVAPACK CLOUD/public/admin.html', 'utf8');
const lines = text.split('\n');
const results = [];
lines.forEach((l, i) => {
    if(l.includes('function showView(')) results.push(`Line ${i+1}: ${l.trim()}`);
});
fs.writeFileSync('c:/NOVAPACK CLOUD/showview_lines.json', JSON.stringify(results, null, 2));
