const xlsx = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, 'public', 'clientes.xls');
try {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
    
    console.log("Headers:");
    console.log(data[0]);
    console.log("\nFirst 2 rows:");
    console.log(data[1]);
    console.log(data[2]);
    console.log("\nTotal rows:", data.length);
} catch (e) {
    console.error("Error reading excel:", e.message);
}
