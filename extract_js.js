const fs = require('fs');
const html = fs.readFileSync('public/admin.html', 'utf8');

// The main script is the one containing 'NOVAPACK ADMIN CONSOLE'
const startIdx = html.indexOf('<script>', html.indexOf('firebase-config.js'));
const endIdx = html.indexOf('</script>', startIdx);

const js = html.substring(startIdx + 8, endIdx);
fs.writeFileSync('extracted.js', js);
console.log("Extracted JS length:", js.length);
