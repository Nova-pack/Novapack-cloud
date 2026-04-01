const fs = require('fs');
let html = fs.readFileSync('public/admin.html', 'utf8');

// Check if the actual <link> tag for Material Symbols exists
if (!html.includes('fonts.googleapis.com/css2?family=Material+Symbols')) {
    const fontLink = `    <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap" rel="stylesheet">\n`;
    
    // Insert after the existing Google Fonts link for Outfit/Inter
    const existingFontLink = html.indexOf("family=Outfit");
    if (existingFontLink > -1) {
        const afterLink = html.indexOf('>', existingFontLink);
        const insertAt = afterLink + 1;
        html = html.substring(0, insertAt) + '\n' + fontLink + html.substring(insertAt);
        console.log("Font link injected after Outfit font link");
    } else {
        // Fallback: insert before </head>
        const headEnd = html.indexOf('</head>');
        html = html.substring(0, headEnd) + fontLink + html.substring(headEnd);
        console.log("Font link injected before </head>");
    }
    
    fs.writeFileSync('public/admin.html', html);
    console.log("Done!");
} else {
    console.log("Font link already present!");
}
