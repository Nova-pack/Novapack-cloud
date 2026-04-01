const fs = require('fs');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;

const html = fs.readFileSync('public/admin.html', 'utf-8');
const dom = new JSDOM(html, { runScripts: "dangerously" });

const window = dom.window;
const document = window.document;

// We want to find references to document.getElementById in the source code
// and check if those IDs exist in the HTML.
// A simpler robust way: regex for document.getElementById\(['"]([^'"]+)['"]\)
const regex = /document\.getElementById\(['"]([^'"]+)['"]\)/g;
let match;
const missingIds = new Set();
const foundIds = new Set();

while ((match = regex.exec(html)) !== null) {
    const id = match[1];
    if (!document.getElementById(id)) {
        missingIds.add(id);
    } else {
        foundIds.add(id);
    }
}

console.log('Missing IDs referenced in document.getElementById:');
for (const id of missingIds) {
    // try to see if it's maybe created dynamically, but usually it's just a bug
    console.log(`- ${id}`);
}
console.log(`Found ${foundIds.size} valid IDs.`);
