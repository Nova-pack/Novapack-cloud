const fs = require('fs');
const html = fs.readFileSync('public/admin.html', 'utf8');

// Check the logo arrow hasn't been replaced
const logoCheck = html.includes('NOVAPACK<span>➤</span>');
console.log("Logo arrow (➤) intact:", logoCheck);

// Verify Material Symbols font link
console.log("Material Symbols font loaded:", html.includes('Material+Symbols+Outlined'));

// Quick check: count remaining emojis
const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
const remaining = html.match(emojiRegex);
console.log("Remaining emoji characters:", remaining ? remaining.length : 0);
if (remaining) {
    const unique = [...new Set(remaining)];
    console.log("Unique remaining:", unique.join(' '));
}

// Check material-symbols-outlined spans exist
const spanCount = (html.match(/material-symbols-outlined/g) || []).length;
console.log("Material icon spans:", spanCount);
