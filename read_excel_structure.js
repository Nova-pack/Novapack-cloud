// Script to read Excel files and display their structure
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const folder = path.join(__dirname, 'public', 'CLIENTES COOPER');
const files = fs.readdirSync(folder).filter(f => f.endsWith('.xlsx'));

files.forEach(file => {
    console.log(`\n========== ${file} ==========`);
    const wb = XLSX.readFile(path.join(folder, file));
    const sheetName = wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    console.log(`Rows: ${data.length}`);
    if (data.length > 0) {
        console.log(`Columns: ${JSON.stringify(Object.keys(data[0]))}`);
        console.log(`Sample:`, JSON.stringify(data[0]));
    }
});
