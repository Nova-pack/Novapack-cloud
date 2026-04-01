const fs = require('fs');
const html = fs.readFileSync('public/admin.html', 'utf8');

console.log("--- VIEWS ---");
const viewMatch = html.match(/id="view-[^"]*"/g);
if (viewMatch) {
    console.log([...new Set(viewMatch)].join(', '));
} else {
    console.log("No views found matching pattern.");
}

console.log("\n--- SEDES ---");
const sedesMatch = html.match(/.{0,50}sedes.{0,50}/gi);
if (sedesMatch) {
    console.log([...new Set(sedesMatch)].join('\n'));
} else {
    console.log("No 'sedes' found.");
}

console.log("\n--- EDIT CLIENT ---");
const editClientMatch = html.match(/.{0,50}modifi.{0,50}/gi) || html.match(/.{0,50}editUser.{0,50}/gi) || html.match(/.{0,50}editar.{0,50}/gi);
if (editClientMatch) {
    console.log([...new Set(editClientMatch)].join('\n'));
} else {
    console.log("No edit client matches found.");
}
