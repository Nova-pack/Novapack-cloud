const fs = require('fs');
let html = fs.readFileSync('c:/NOVAPACK CLOUD/public/admin.html', 'utf8');
let lines=html.split('\n');
for(let i=0; i<lines.length; i++){ 
    if(lines[i].includes('Redirect bypassed')) { 
        lines[i] = lines[i].replace('console.log("Redirect bypassed"); //window.location.href', 'window.location.href'); 
    } 
} 
fs.writeFileSync('c:/NOVAPACK CLOUD/public/admin.html', lines.join('\n')); 
console.log('Redirects Restored.');
