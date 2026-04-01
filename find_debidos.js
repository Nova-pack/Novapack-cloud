const fs = require('fs');
const html = fs.readFileSync('public/admin.html', 'utf8');

// Find debidos references inside view-adv-billing
const viewStart = html.indexOf('id="view-adv-billing"');
if (viewStart === -1) { console.log("view-adv-billing not found"); process.exit(); }

// Search for "debidos" after view-adv-billing
let idx = viewStart;
const results = [];
while (true) {
    idx = html.indexOf('debid', idx);
    if (idx === -1) break;
    const start = Math.max(0, idx - 150);
    const end = Math.min(html.length, idx + 200);
    results.push(`--- offset ${idx} ---\n` + html.substring(start, end));
    idx += 5;
    if (results.length > 15) break;
}

fs.writeFileSync('debidos_in_pro.txt', results.join('\n\n'));
console.log("Found", results.length, "matches");
