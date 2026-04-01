const fs = require('fs');
const html = fs.readFileSync('public/admin.html', 'utf8');
console.log('article-form exists:', html.includes('id="article-form"'));
console.log('add-user-form exists:', html.includes('id="add-user-form"'));
console.log('add-ticket-form exists:', html.includes('id="add-ticket-form"'));
console.log('admin-manual-ticket-form exists:', html.includes('id="admin-manual-ticket-form"'));
