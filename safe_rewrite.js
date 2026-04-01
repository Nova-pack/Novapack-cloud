const fs = require('fs');
try {
    const html = fs.readFileSync('c:/NOVAPACK CLOUD/public/admin.html', 'utf8');
    const lines = html.split('\n');
    let outLines = [];
    
    // We want to delete everything from "<!-- Add Phone Modal -->" at line ~1655
    // up to the closing `</div> </div>` right before `<script> // --- MISSING GLOBAL VARIABLES DECLARATION ---`.
    // Then insert the RECREATED MODALS there.
    // Finally, remove the RECREATED MODALS from the bottom of the file.

    const targetStart = lines.findIndex(l => l.includes('<!-- Add Phone Modal -->'));
    const targetScript = lines.findIndex(l => l.includes('// --- MISSING GLOBAL VARIABLES DECLARATION ---'));
    
    if (targetStart === -1 || targetScript === -1) throw new Error('Could not find exact markers in HTML for old modals');

    // Go backwards from targetScript to find the `<script>` tag
    let scriptTagIndex = targetScript;
    while(scriptTagIndex > targetStart && !lines[scriptTagIndex].includes('<script>')) {
        scriptTagIndex--;
    }

    const recreatedStart = lines.findIndex(l => l.includes('RECREATED MODALS FOR ADMIN ERP'));
    let bodyEnd = -1;
    // Find the closest </script> or </body> after the recreated modals
    for (let i = lines.length - 1; i > recreatedStart; i--) {
        if (lines[i].includes('</body>') || lines[i].includes('</html>')) {
            bodyEnd = i;
            break;
        }
    }

    if (recreatedStart === -1 || bodyEnd === -1) throw new Error('Could not find recreated modals or body end');

    const recreatedModalsCount = lines.slice(recreatedStart - 1, bodyEnd);
    console.log(`Found ${recreatedModalsCount.length} lines of recreated modals.`);

    // Build the new array
    for (let i = 0; i < lines.length; i++) {
        if (i === targetStart) {
            // Drop in our good modals!
            outLines.push(...recreatedModalsCount);
        }
        
        // Skip the old broken modals
        if (i >= targetStart && i < scriptTagIndex) {
            continue;
        }

        // Skip the recreated modals at the bottom
        if (i >= recreatedStart - 1 && i < bodyEnd) {
            continue;
        }

        outLines.push(lines[i]);
    }

    fs.writeFileSync('c:/NOVAPACK CLOUD/public/admin.html_fixed.html', outLines.join('\n'));
    console.log('Successfully created admin.html_fixed.html with accurate modal order');
} catch (e) {
    console.error(e);
}
