const fs = require('fs');
let html;
try {
    html = fs.readFileSync('c:/NOVAPACK CLOUD/public/admin.html', 'utf8');
} catch (e) {
    html = fs.readFileSync('c:/NOVAPACK CLOUD/public/admin.html', 'utf16le');
}
const lines = html.split('\n');
let inTickets = false;
let foundAdd = false;
for(let i=0; i<lines.length; i++) {
    const l = lines[i];
    if(l.includes('id="view-admin-tickets"')) inTickets = true;
    if(inTickets && l.includes('</section>')){
          console.log("End of section");
          break;
    }
    if(inTickets && l.toLowerCase().includes('btn') && l.toLowerCase().includes('añadir')) {
         console.log(i+1 + ': ' + l.trim());
         foundAdd = true;
    }
}
if (!foundAdd && inTickets) {
    for(let i=0; i<lines.length; i++) {
        if(lines[i].includes('view-admin-tickets')) {
            console.log(lines.slice(i, i+30).join('\n'));
            break;
        }
    }
}
