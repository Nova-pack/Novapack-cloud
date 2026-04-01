const fs = require('fs');
let html = fs.readFileSync('public/admin.html', 'utf8');

if (!html.includes("font-family: 'Material Symbols Outlined'")) {
    const iconCSS = `
    <style>
        /* Material Icons inline alignment */
        .material-symbols-outlined {
            font-family: 'Material Symbols Outlined';
            font-weight: normal;
            font-style: normal;
            font-size: 1.2em;
            line-height: 1;
            letter-spacing: normal;
            text-transform: none;
            display: inline-flex;
            white-space: nowrap;
            word-wrap: normal;
            direction: ltr;
            vertical-align: middle;
            -webkit-font-smoothing: antialiased;
        }
        .nav-item .material-symbols-outlined { font-size: 1.3rem; }
        .btn .material-symbols-outlined { font-size: 1.1em; }
        h1 .material-symbols-outlined, h2 .material-symbols-outlined, h3 .material-symbols-outlined { font-size: 1em; }
    </style>`;
    
    const headEnd = html.indexOf('</head>');
    html = html.substring(0, headEnd) + iconCSS + '\n' + html.substring(headEnd);
    fs.writeFileSync('public/admin.html', html);
    console.log("CSS injected!");
} else {
    console.log("CSS already present");
}
