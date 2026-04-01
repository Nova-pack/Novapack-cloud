const fs = require('fs');
let html = fs.readFileSync('public/admin.html', 'utf8');

// Fix 1: Remove <span class="material-symbols-outlined">...</span> from inside JS strings (alert, confirm, prompt)
// These were incorrectly injected by the emoji replacement script into JS string literals.
// Pattern: match <span class="material-symbols-outlined">ICON_NAME</span> and replace with empty or the icon name as text
html = html.replace(/<span class="material-symbols-outlined">([^<]*)<\/span>/g, (match, iconName, offset) => {
    // Check if we're inside a <script> or inline JS context (alert, confirm, etc.)
    // We look at the surrounding context to decide
    const before = html.substring(Math.max(0, offset - 200), offset);
    
    // If we're inside an HTML attribute class= context for actual HTML elements, keep it
    // Check if this is inside an onclick, alert(, confirm( or similar JS context
    const isInsideJS = /(?:alert|confirm|prompt|innerText|innerHTML|textContent)\s*[\(=]/.test(before) ||
                       /(?:this\.inner(?:Text|HTML)\s*=)/.test(before) ||
                       /'\s*$/.test(before); // Inside a JS string that just had a quote
    
    // If inside a tag attribute like class="section-title", keep it
    const isInsideHTMLTag = /<[^>]*$/.test(before) && !/>/.test(before.slice(-50));
    
    if (isInsideHTMLTag) {
        return match; // Keep HTML element icons
    }
    
    // Always keep if it looks like it's a visible HTML element (not inside JS string)
    return match;
});

// Fix 2: The real fix - clean up broken strings in alert/confirm/prompt calls
// These have patterns like: alert('<span class="material-symbols-outlined">check_circle</span>')
// or worse: confirm('<span class="material-symbols-outlined"></span>'material-symbols-outlined">...)
// 
// Strategy: Find alert/confirm/prompt calls and clean spans from their string arguments

// Fix the completely broken line 3566 and similar patterns
// Pattern: '<span class="material-symbols-outlined"></span>'material-symbols-outlined">icon_name</span>
html = html.replace(/'<span class="material-symbols-outlined"><\/span>'material-symbols-outlined">/g, "'");

// Fix empty span alerts: alert('<span class="material-symbols-outlined"></span>') -> alert('✓')
html = html.replace(/alert\('<span class="material-symbols-outlined"><\/span>'\)/g, "alert('OK')");

// Fix empty span + text: alert('<span class="material-symbols-outlined"></span>' + 
html = html.replace(/alert\('<span class="material-symbols-outlined"><\/span>' \+ /g, "alert('ERROR: ' + ");

// Fix: confirm('<span class="material-symbols-outlined"></span>'
html = html.replace(/confirm\('<span class="material-symbols-outlined"><\/span>'/g, "confirm('");

// Fix: alert strings that have icon spans with content - replace the span with just the text
// alert('<span class="material-symbols-outlined">check_circle</span> Some text')
html = html.replace(/(alert|confirm|prompt)\((['`])<span class="material-symbols-outlined">(\w+)<\/span>\s*/g, '$1($2');

// Fix: strings like: alert(`<span class="material-symbols-outlined">check_circle</span> text`)  
html = html.replace(/(alert|confirm|prompt)\(`<span class="material-symbols-outlined">(\w+)<\/span>\s*/g, '$1(`');

// Fix: 'Copiado!'; setTimeout(()=>this.innerText='<span... -> use plain text
// Already fixed with &quot; entities, skip these

// Fix: if statements with alert containing spans
html = html.replace(/{ alert\('<span class="material-symbols-outlined"><\/span>'\); return; }/g, "{ alert('Campo requerido'); return; }");

// Fix alert('<span...>icon</span>') standalone
html = html.replace(/alert\('<span class="material-symbols-outlined">(\w+)<\/span>'\)/g, "alert('OK')");

// Fix: alert('<span...></span>' + newStatus) pattern  
html = html.replace(/alert\('<span class="material-symbols-outlined"><\/span>' \+ (\w+)\)/g, "alert($1)");

// Fix remaining notification_important span in confirm
html = html.replace(/<span class="material-symbols-outlined">notification_important<\/span>/g, '⚠️');

// Now write
fs.writeFileSync('public/admin.html', html);
console.log('Alerts/confirms cleaned successfully.');

// Verify no broken patterns remain
const result = html.match(/(?:alert|confirm)\(['"][^'"]*<span class="material-symbols-outlined">/g);
if (result) {
    console.log('WARNING: Still found ' + result.length + ' broken alert/confirm patterns:');
    result.forEach((m, i) => console.log(`  ${i+1}: ${m.substring(0, 100)}`));
} else {
    console.log('All alert/confirm patterns are clean.');
}
