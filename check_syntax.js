const fs = require('fs');
const cp = require('child_process');
const html = fs.readFileSync('c:/NOVAPACK CLOUD/public/admin.html','utf8');
const matches = html.match(/<script>([\s\S]*?)<\/script>/g);
if(matches) {
    matches.forEach((s,i) => {
        let code = s.replace('<script>','').replace('</script>','');
        fs.writeFileSync('c:/NOVAPACK CLOUD/tmp_check_'+i+'.js', code);
        try {
            cp.execSync('node -c "c:/NOVAPACK CLOUD/tmp_check_'+i+'.js"');
        } catch(e) {
            console.log("Syntax error in inline script " + i);
            console.log(e.stderr ? e.stderr.toString() : e.message);
        }
    });
}
console.log("Syntax check complete.");
