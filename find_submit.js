const fs = require('fs');
const html = fs.readFileSync('public/admin.html', 'utf8');

const startIdx = html.indexOf("document.getElementById('admin-manual-ticket-form').addEventListener('submit'");
if (startIdx !== -1) {
    fs.writeFileSync('submit_handler.txt', html.substring(startIdx, startIdx + 1500));
} else {
    // try to find just the id
    const start2 = html.indexOf("'admin-manual-ticket-form'");
    if(start2 !== -1) {
        fs.writeFileSync('submit_handler.txt', html.substring(Math.max(0, start2-100), start2+1000));
    }
}
