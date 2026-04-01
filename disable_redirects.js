const fs=require('fs');
let html=fs.readFileSync('c:/NOVAPACK CLOUD/public/admin.html','utf8');
let lines=html.split('\n');
for(let i=0; i<lines.length; i++) {
    if(lines[i].includes('auth.onAuthStateChanged')) {
        for(let j=i; j<i+20; j++) {
            if(lines[j].includes('window.location.href')) {
                lines[j] = lines[j].replace('window.location.href', 'console.log("Redirect bypassed"); //window.location.href');
            }
        }
        break;
    }
}
fs.writeFileSync('c:/NOVAPACK CLOUD/public/admin.html', lines.join('\n'));
console.log("Redirects disabled in admin.html.");
