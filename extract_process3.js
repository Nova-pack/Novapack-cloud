const fs = require('fs');
const content = fs.readFileSync('public/admin.html', 'utf8');
const startIdx = content.indexOf("adminManPackages = [{ qty: numBultos, size: 'Bulto' }];");
if (startIdx !== -1) {
    fs.writeFileSync('extract_process3.txt', content.substring(startIdx, startIdx + 1500));
}
