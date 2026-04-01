const fs = require('fs');
const html = fs.readFileSync('public/admin.html', 'utf8');

// The giant script is practically from line 1970 to 6128
// Let's extract it by finding the tags
const scriptStart = html.indexOf('<script>', html.indexOf('firebase-config'));
const scriptEnd = html.indexOf('</script>', scriptStart + 10);

if (scriptStart > -1 && scriptEnd > -1) {
    const scriptContent = html.substring(scriptStart + 8, scriptEnd);
    fs.writeFileSync('temp_script.js', scriptContent);
    console.log("Extracted script to temp_script.js, length:", scriptContent.length);
} else {
    console.log("Could not extract script");
}
