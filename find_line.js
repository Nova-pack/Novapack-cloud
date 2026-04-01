const fs = require('fs');
const lines = fs.readFileSync('c:/NOVAPACK CLOUD/public/admin.html','utf8').split('\n');
lines.forEach((l,i) => {
    if(l.includes('id="view-admin-tickets"')) console.log(i, l.trim());
});
