const fs = require('fs');
const html = fs.readFileSync('public/admin.html', 'utf8');

const matches = html.match(/id=\"[^\"]*admin-ticket[^\"]*\"/g);
if (matches) {
    console.log(matches.join(', '));
} else {
    console.log("None");
}
