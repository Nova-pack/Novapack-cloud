const fs = require('fs');
const html = fs.readFileSync('c:/NOVAPACK CLOUD/public/admin.html','utf8');
const p1 = html.indexOf('id="view-users"');
let p2 = -1;
if(p1 > -1) {
    let depth = 1;
    let pos = p1 + 10;
    while(depth > 0 && pos < html.length) {
        let op = html.indexOf('<div', pos);
        let cl = html.indexOf('</div', pos);
        if(op > -1 && op < cl) {
            depth++; pos = op + 4;
        } else if(cl > -1) {
            depth--; pos = cl + 5;
            if(depth===0) { p2 = pos; break; }
        } else { break; }
    }
}
console.log("view-users start:", p1);
console.log("view-users end:", p2);
const pAdmin = html.indexOf('id="view-admin-tickets"');
console.log("Is admin-tickets nested in view-users?", pAdmin > p1 && pAdmin < p2);
