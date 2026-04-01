const fs = require('fs');
const html = fs.readFileSync('c:/NOVAPACK CLOUD/public/admin.html','utf8');
const p1 = html.indexOf('id="view-adv-billing"');
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
const pTickets = html.indexOf('id="view-admin-tickets"');
console.log("adv-billing start:", p1);
console.log("adv-billing end:", p2);
console.log("admin-tickets start:", pTickets);
console.log("IS TICKETS NESTED INSIDE ADV-BILLING?", pTickets > p1 && pTickets < p2); 
