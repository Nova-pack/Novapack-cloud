const fs = require('fs');
let html = fs.readFileSync('public/admin.html', 'utf8');

// Check if material-symbols link exists in any form
const hasLink1 = html.includes('Material+Symbols+Outlined');
const hasLink2 = html.includes('material-symbols-outlined');
const hasLink3 = html.includes('Material Symbols Outlined');
console.log("Font link check:", { hasLink1, hasLink2, hasLink3 });

// Check for the font face or link tag
const fontIdx = html.indexOf('Material');
if (fontIdx > -1) {
    console.log("Context:", html.substring(Math.max(0, fontIdx - 50), fontIdx + 100));
}

// Find the head section to see what we injected
const headEnd = html.indexOf('</head>');
const last200 = html.substring(Math.max(0, headEnd - 500), headEnd);
console.log("\n\nLast 500 chars before </head>:\n", last200);
