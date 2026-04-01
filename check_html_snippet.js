const fs=require('fs');
const html=fs.readFileSync('c:/NOVAPACK CLOUD/public/admin.html','utf8');
const i=html.indexOf('id="view-admin-tickets"');
console.log(html.substring(i, i+300));
