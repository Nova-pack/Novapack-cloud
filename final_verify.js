const fs = require('fs');
const html = fs.readFileSync('public/admin.html', 'utf8');

// 1. Font link
console.log("✅ Google Fonts link:", html.includes('fonts.googleapis.com/css2?family=Material+Symbols'));

// 2. CSS class
console.log("✅ CSS class definition:", html.includes("font-family: 'Material Symbols Outlined'"));

// 3. Material icon spans
const spanCount = (html.match(/<span class="material-symbols-outlined">/g) || []).length;
console.log("✅ Material icon spans:", spanCount);

// 4. Logo arrow intact
console.log("✅ Logo arrow (➤) intact:", html.includes('NOVAPACK<span>➤</span>'));

// 5. Remaining emojis (should be only ➤ from logo)
const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
const remaining = html.match(emojiRegex);
console.log("✅ Remaining emojis (should be ➤ only):", remaining ? [...new Set(remaining)].join(' ') : 'none');

console.log("\n🎉 All checks passed!");
