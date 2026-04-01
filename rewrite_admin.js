const fs = require('fs');
const html = fs.readFileSync('c:/NOVAPACK CLOUD/public/admin.html', 'utf8');
const lines = html.split('\n');

// Find the index of <!-- RECREATED MODALS FOR ADMIN ERP -->
const newModalsStart = lines.findIndex(l => l.includes('<!-- RECREATED MODALS FOR ADMIN ERP -->'));
// Find the end of it (it goes up to the closing body tag, so let's find </body>)
const bodyCloseIdx = lines.findIndex(l => l.includes('</body>'));

const newModalsCode = lines.slice(newModalsStart - 1, bodyCloseIdx);

// Find the old broken modals
const oldModalsStart = lines.findIndex(l => l.includes('<!-- Add Phone Modal -->'));
const scriptStart = lines.findIndex((l, index) => l.includes('<script>') && index > oldModalsStart && index < oldModalsStart + 500);

// Just to be safe with the scriptStart index:
let trueScriptStart = oldModalsStart;
for(let i=oldModalsStart; i<lines.length; i++) {
    if (lines[i].includes('<script>')) {
        trueScriptStart = i;
        break;
    }
}

// Assemble new file
const newLines = [];
newLines.push(...lines.slice(0, oldModalsStart));
newLines.push('');
newLines.push(...newModalsCode);
newLines.push('');
newLines.push(...lines.slice(trueScriptStart, newModalsStart - 1)); // up to where we extracted the new modals
newLines.push(...lines.slice(bodyCloseIdx));

fs.writeFileSync('c:/NOVAPACK CLOUD/public/admin.html', newLines.join('\n'));
console.log('Done rewriting admin.html');
