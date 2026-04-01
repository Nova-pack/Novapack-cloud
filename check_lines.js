const html = require('fs').readFileSync('public/admin.html', 'utf8');
const lines = html.split('\n');
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('modal-manage-companies')) {
        console.log(i - 1, lines[i - 1]);
        console.log(i, lines[i]);
        console.log(i + 1, lines[i + 1]);
        console.log(i + 2, lines[i + 2]);
    }
}
