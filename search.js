const fs = require('fs');
const html = fs.readFileSync('c:/NOVAPACK CLOUD/public/admin.html', 'utf8');
const lines = html.split('\n');

for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('add-user-modal')) {
        console.log(`Line ${i + 1}: ${lines[i].trim()}`);
    }
}
