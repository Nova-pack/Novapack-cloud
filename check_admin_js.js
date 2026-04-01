const fs = require('fs');
const { execSync } = require('child_process');

const html = fs.readFileSync('c:/NOVAPACK CLOUD/public/admin.html', 'utf8');
const scripts = html.match(/<script\b[^>]*>([\s\S]*?)<\/script>/gi) || [];

scripts.forEach((s, i) => {
    // Only extract the content inside <script>
    const codeMatch = s.match(/<script\b[^>]*>([\s\S]*?)<\/script>/i);
    if (codeMatch && codeMatch[1].trim()) {
        const code = codeMatch[1];
        const filename = `tmp_script_${i}.js`;
        fs.writeFileSync(filename, code);
        try {
            console.log(`Checking script ${i}...`);
            execSync(`node -c ${filename}`, { stdio: 'pipe' });
            console.log(`Script ${i} OK.`);
        } catch (e) {
            console.error(`Error in script ${i}:\n${e.stderr.toString()}`);
        }
    }
});
