const fs = require('fs');
const html = fs.readFileSync('public/admin.html', 'utf8');

const matches = [];
let re = /Guardar.*?</gi;
let match;
while ((match = re.exec(html)) !== null) {
    const start = Math.max(0, match.index - 100);
    const end = Math.min(html.length, match.index + 100);
    matches.push(html.substring(start, end));
}

let re2 = /save.*Ticket/gi;
while ((match = re2.exec(html)) !== null) {
    const start = Math.max(0, match.index - 50);
    const end = Math.min(html.length, match.index + 50);
    matches.push(html.substring(start, end));
}

fs.writeFileSync('save_functions.txt', matches.join('\n\n'));
