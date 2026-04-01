const fs = require('fs');
const lines = fs.readFileSync('public/admin.html', 'utf8').split('\n');
const scriptLines = lines.slice(1969, 6128); // specifically lines 1970 to 6129
fs.writeFileSync('temp_script_exact.js', scriptLines.join('\n'));
