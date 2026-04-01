const fs = require('fs');
let html = fs.readFileSync('public/admin.html', 'utf8');

// Backup
fs.writeFileSync('public/admin.html.bak_emoji', html);

// Helper: wraps a material icon name into the correct span
const mi = (name) => `<span class="material-symbols-outlined">${name}</span>`;

// ============================================================
// EMOJI → MATERIAL ICON MAPPING (77 emojis)
// ============================================================
// We only replace emojis that appear in the UI (buttons, labels, headers).
// We skip emojis inside JS strings (alerts, console.log) to avoid breakage.

const emojiMap = {
    '✅': mi('check_circle'),
    '⚠️': mi('warning'),
    '🗑️': mi('delete'),
    '✏️': mi('edit'),
    '📋': mi('assignment'),
    '❌': mi('close'),
    '🖨️': mi('print'),
    '🔍': mi('search'),
    '📦': mi('inventory_2'),
    '🔄': mi('refresh'),
    '💾': mi('save'),
    '📊': mi('bar_chart'),
    '🚨': mi('notification_important'),
    '➕': mi('add'),
    '📥': mi('download'),
    '📷': mi('qr_code_scanner'),
    '⚙️': mi('settings'),
    '👤': mi('person'),
    '🚚': mi('local_shipping'),
    '🏢': mi('business'),
    '⚡': mi('bolt'),
    '👥': mi('group'),
    '📝': mi('edit_note'),
    '📍': mi('location_on'),
    '💰': mi('paid'),
    '➡️': mi('arrow_forward'),
    '✕': mi('close'),
    '🚀': mi('rocket_launch'),
    '🏠': mi('home'),
    '📄': mi('description'),
    '📅': mi('calendar_today'),
    '🧾': mi('receipt_long'),
    '💬': mi('chat'),
    '🛡️': mi('security'),
    '🔢': mi('tag'),
    '💳': mi('credit_card'),
    '📚': mi('menu_book'),
    '🏭': mi('factory'),
    '✖': mi('close'),
    '📉': mi('trending_down'),
    '🤖': mi('smart_toy'),
    '🟢': mi('circle'),
    '📧': mi('email'),
    '📇': mi('contacts'),
    '🔴': mi('circle'),
    '⚖️': mi('balance'),
    '☰': mi('menu'),
    '🔔': mi('notifications'),
    '🚪': mi('logout'),
    '✉️': mi('mail'),
    '☑️': mi('check_box'),
    '📑': mi('note_add'),
    '📔': mi('auto_stories'),
    '👋': mi('waving_hand'),
    '🔗': mi('link'),
    '🧨': mi('warning'),
    '💣': mi('dangerous'),
    '📲': mi('qr_code_scanner'),
    '☀️': mi('light_mode'),
    '🌙': mi('dark_mode'),
    '✓': mi('check'),
    '📂': mi('folder_open'),
    '🕒': mi('schedule'),
    '📞': mi('call'),
    '🚫': mi('block'),
    '⚪': mi('radio_button_unchecked'),
    '☎️': mi('call'),
    '♻️': mi('autorenew'),
    '📩': mi('send'),
    '📖': mi('book'),
    '🏛️': mi('account_balance'),
    '💸': mi('payments'),
    '📈': mi('trending_up'),
    '🏦': mi('account_balance'),
    '⬅️': mi('arrow_back'),
};

// Also handle the 1️⃣ and 2️⃣ keycap emojis  
html = html.replace(/1️⃣/g, mi('looks_one'));
html = html.replace(/2️⃣/g, mi('looks_two'));

// ============================================================
// PERFORM REPLACEMENTS
// ============================================================
let replacedCount = 0;
for (const [emoji, replacement] of Object.entries(emojiMap)) {
    const before = html;
    html = html.split(emoji).join(replacement);
    const count = (before.length - html.length + replacement.length * ((before.length - html.length) / (emoji.length - replacement.length + emoji.length))) ;
    // Simple count
    const occurrences = before.split(emoji).length - 1;
    if (occurrences > 0) {
        replacedCount += occurrences;
    }
}

// ============================================================
// ADD MATERIAL SYMBOLS FONT + CSS (if not already present)
// ============================================================
if (!html.includes('material-symbols-outlined')) {
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
    
    // Insert after the last <link> in <head> or before </head>
    const headEnd = html.indexOf('</head>');
    html = html.substring(0, headEnd) + fontLink + iconCSS + html.substring(headEnd);
}

fs.writeFileSync('public/admin.html', html);
console.log(`Done! Replaced ${replacedCount} emoji occurrences with Material Icons.`);
