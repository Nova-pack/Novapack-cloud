const fs = require('fs');
const html = fs.readFileSync('c:/NOVAPACK CLOUD/public/admin.html', 'utf8');
const lines = html.split('\n');

let stack = [];
let errors = [];

for(let i=0; i<lines.length; i++) {
    let line = lines[i];
    
    // Naive open div
    let opens = (line.match(/<div(\s|>)/gi) || []).length;
    let closes = (line.match(/<\/div>/gi) || []).length;
    
    for(let k=0; k<opens; k++) stack.push(i);
    for(let k=0; k<closes; k++) {
        if(stack.length > 0) {
            stack.pop();
        } else {
            console.log(`Unmatched </div> at line ${i+1}`);
        }
    }
}
console.log(`Remaining open <div>s: ${stack.length}`);
if(stack.length > 0) {
    stack.slice(-5).forEach(l => {
        console.log(`Open div at line ${l+1}: ` + lines[l].trim());
    });
}
