const fs = require('fs');
const html = fs.readFileSync('public/admin.html', 'utf8');

const fnIdx = html.indexOf('function setAdminTicketSubView');
if(fnIdx !== -1) {
    fs.writeFileSync('create_view_fn.txt', html.substring(Math.max(0, fnIdx-50), Math.min(html.length, fnIdx+2000)));
} else {
    fs.writeFileSync('create_view_fn.txt', 'setAdminTicketSubView not found');
}

const formIdx = html.indexOf('sub-view-admin-create');
if(formIdx !== -1) {
    fs.writeFileSync('create_view_html.txt', html.substring(Math.max(0, formIdx-100), Math.min(html.length, formIdx+5000)));
} else {
    fs.writeFileSync('create_view_html.txt', 'sub-view-admin-create not found');
}
