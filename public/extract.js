const fs = require('fs');
const content = fs.readFileSync('C:/NOVAPACK CLOUD/public/admin.html', 'utf8');
const scriptMatch = content.match(/<script>([\s\S]*?)<\/script>/);
if (scriptMatch) {
    fs.writeFileSync('C:/NOVAPACK CLOUD/public/test_script.js', scriptMatch[1]);
    console.log('Script extracted successfully!');
} else {
    console.log('Script tag not found.');
}
