const fs = require('fs');
const html = fs.readFileSync('public/admin.html', 'utf8');

// Extract all emoji characters used in the HTML
const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F000}-\u{1FFFF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]+/gu;
const found = {};
let m;
while ((m = emojiRegex.exec(html)) !== null) {
    const emoji = m[0];
    if (!found[emoji]) found[emoji] = { count: 0, contexts: [] };
    found[emoji].count++;
    if (found[emoji].contexts.length < 3) {
        const start = Math.max(0, m.index - 30);
        const end = Math.min(html.length, m.index + 40);
        found[emoji].contexts.push(html.substring(start, end).replace(/\n/g, ' '));
    }
}

const sorted = Object.entries(found).sort((a,b) => b[1].count - a[1].count);
let out = `Total unique emojis: ${sorted.length}\n\n`;
sorted.forEach(([emoji, info]) => {
    out += `${emoji} (x${info.count})\n`;
    info.contexts.forEach(c => out += `  ctx: ${c}\n`);
    out += '\n';
});

fs.writeFileSync('emoji_catalog.txt', out);
console.log("Found", sorted.length, "unique emojis");
