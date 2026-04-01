const fs = require('fs');
let html = fs.readFileSync('public/admin.html', 'utf8');

// Backup
fs.writeFileSync('public/admin.html.bak_emoji', html);

const mi = (name) => `<span class="material-symbols-outlined">${name}</span>`;

const emojiMap = {
    '✅': mi('check_circle'), '⚠️': mi('warning'), '🗑️': mi('delete'),
    '✏️': mi('edit'), '📋': mi('assignment'), '❌': mi('close'),
    '🖨️': mi('print'), '🔄': mi('refresh'), '💾': mi('save'),
    '📊': mi('bar_chart'), '🚨': mi('notification_important'), '➕': mi('add'),
    '📥': mi('download'), '📷': mi('qr_code_scanner'), '⚙️': mi('settings'),
    '👤': mi('person'), '🚚': mi('local_shipping'), '🏢': mi('business'),
    '⚡': mi('bolt'), '👥': mi('group'), '📝': mi('edit_note'),
    '📍': mi('location_on'), '💰': mi('paid'), '➡️': mi('arrow_forward'),
    '✕': mi('close'), '🚀': mi('rocket_launch'), '🏠': mi('home'),
    '📄': mi('description'), '📅': mi('calendar_today'), '🧾': mi('receipt_long'),
    '💬': mi('chat'), '🛡️': mi('security'), '🔢': mi('tag'),
    '💳': mi('credit_card'), '📚': mi('menu_book'), '🏭': mi('factory'),
    '✖': mi('close'), '📉': mi('trending_down'), '🤖': mi('smart_toy'),
    '🟢': mi('circle'), '📧': mi('email'), '📇': mi('contacts'),
    '🔴': mi('circle'), '⚖️': mi('balance'), '☰': mi('menu'),
    '🔔': mi('notifications'), '🚪': mi('logout'), '✉️': mi('mail'),
    '☑️': mi('check_box'), '📑': mi('note_add'), '📔': mi('auto_stories'),
    '👋': mi('waving_hand'), '🔗': mi('link'), '🧨': mi('warning'),
    '💣': mi('dangerous'), '📲': mi('qr_code_scanner'), '☀️': mi('light_mode'),
    '🌙': mi('dark_mode'), '✓': mi('check'), '📂': mi('folder_open'),
    '🕒': mi('schedule'), '📞': mi('call'), '🚫': mi('block'),
    '⚪': mi('radio_button_unchecked'), '☎️': mi('call'), '♻️': mi('autorenew'),
    '📩': mi('send'), '📖': mi('book'), '🏛️': mi('account_balance'),
    '💸': mi('payments'), '📈': mi('trending_up'), '🏦': mi('account_balance'),
    '⬅️': mi('arrow_back'), '📦': mi('inventory_2'),
};

// IMPORTANT: Only replace emojis in HTML content, NOT inside JS string literals.
// Strategy: Split file into <script>...</script> blocks and HTML blocks.
// Only replace in HTML blocks.

const parts = [];
let lastIdx = 0;
const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
let match;

while ((match = scriptRegex.exec(html)) !== null) {
    // Push HTML before this script
    parts.push({ type: 'html', content: html.substring(lastIdx, match.index) });
    // Push the script tag itself (don't modify)
    parts.push({ type: 'script', content: match[0] });
    lastIdx = match.index + match[0].length;
}
// Push remaining HTML after last script
parts.push({ type: 'html', content: html.substring(lastIdx) });

let replacedCount = 0;

// Replace emojis only in HTML parts
for (let i = 0; i < parts.length; i++) {
    if (parts[i].type === 'html') {
        let content = parts[i].content;
        for (const [emoji, replacement] of Object.entries(emojiMap)) {
            const occurrences = content.split(emoji).length - 1;
            if (occurrences > 0) {
                content = content.split(emoji).join(replacement);
                replacedCount += occurrences;
            }
        }
        // Also handle keycap emojis
        const kc1 = content.split('1️⃣').length - 1;
        const kc2 = content.split('2️⃣').length - 1;
        content = content.split('1️⃣').join(mi('looks_one'));
        content = content.split('2️⃣').join(mi('looks_two'));
        replacedCount += kc1 + kc2;
        
        parts[i].content = content;
    }
    // Script parts are left untouched
}

html = parts.map(p => p.content).join('');

// Also replace the 🔍 emoji inside HTML input placeholder attributes (these are in HTML, not JS)
// The placeholder="🔍 Buscar..." is inside an HTML attribute which our script also caught

// Add Material Symbols font + CSS if not already present
if (!html.includes('fonts.googleapis.com/css2?family=Material+Symbols+Outlined')) {
    const fontLink = `    <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap" rel="stylesheet">\n`;
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
    </style>\n`;
    
    const headEnd = html.indexOf('</head>');
    html = html.substring(0, headEnd) + fontLink + iconCSS + html.substring(headEnd);
}

fs.writeFileSync('public/admin.html', html);
console.log(`Done! Replaced ${replacedCount} emoji occurrences (HTML only, JS untouched).`);
