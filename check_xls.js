const XLSX = require('xlsx');
const workbook = XLSX.readFile('C:\\NOVAPACK CLOUD\\public\\nuevaexportacion.xls');
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(sheet, { header: "A", defval: "" });
console.log("HEADERS (Row 0):", data[0]);
console.log("FIRST RECORD (Row 1):", data[1]);
