const fs = require('fs');

const html = fs.readFileSync('public/admin.html', 'utf8');
const jsMatches = Array.from(html.matchAll(/<script>((?:.|\n)*?)<\/script>/gi)).map(m => m[1]);
const js = jsMatches.join('\n');

const lines = js.split('\n');
const varDecl = /const\s+([a-zA-Z0-9_]+)\s*=\s*document\.getElementById\(['"]([^'"]+)['"]\)/g;
const vars = {};

let m;
while ((m = varDecl.exec(js)) !== null) {
    vars[m[1]] = m[2];
}

lines.forEach((l, i) => {
    // Check global assignments
    const assignMatch = l.match(/([a-zA-Z0-9_]+)\.on(click|change|input|submit)\s*=/);
    if (assignMatch) {
        const v = assignMatch[1];
        if (vars[v]) {
            const id = vars[v];
            if (!html.includes(`id="${id}"`) && !html.includes(`id='${id}'`)) {
                console.log(`WARN: Element '${id}' missing for variable '${v}' at line ${i + 1}`);
            }
        }
    }

    const docMatch = l.match(/document\.getElementById\(['"]([^'"]+)['"]\)\.on(click|change|input|submit)\s*=/);
    if (docMatch) {
        const id = docMatch[1];
        if (!html.includes(`id="${id}"`) && !html.includes(`id='${id}'`)) {
            console.log(`WARN: Inline element '${id}' missing at line ${i + 1}`);
        }
    }
});
