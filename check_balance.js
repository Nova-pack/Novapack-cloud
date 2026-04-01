const fs = require('fs');
const html = fs.readFileSync('c:/NOVAPACK CLOUD/public/admin.html','utf8');
const lines = html.split('\n');

let depth = 1;
let endLine = -1;

for(let i=833; i<=1047; i++) {
    let openMatch = lines[i].match(/<div/gi);
    let closeMatch = lines[i].match(/<\/div>/gi);
    
    if(openMatch) depth += openMatch.length;
    if(closeMatch) depth -= closeMatch.length;
    
    if(depth <= 0) {
        endLine = i;
        break;
    }
}

console.log('Balance reaches 0 at line:', endLine, 'Remaining depth:', depth);
