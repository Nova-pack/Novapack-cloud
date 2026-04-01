const fs = require('fs');
const html = fs.readFileSync('public/admin.html', 'utf8');
const lines = html.split('\n');

console.log("Searching for showView definition...");
lines.forEach((l, i) => {
    if (l.includes('window.showView =') || l.includes('function showView')) console.log(`showView at line ${i}`);
});
