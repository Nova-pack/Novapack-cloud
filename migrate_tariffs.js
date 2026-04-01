const fs = require('fs');
const file = 'c:/NOVAPACK CLOUD/public/admin.html';
let lines = fs.readFileSync(file, 'utf8').split('\n');

// 1. Remove sidebar button
let tariffBtnStart = -1;
for(let i=0; i<lines.length; i++){
    if(lines[i].includes(`onclick="showView('tariffs')"`)) {
        tariffBtnStart = i; break;
    }
}
if(tariffBtnStart > -1) {
    // It's a 3-line block: <div ...> \n <span>... \n </div>
    lines.splice(tariffBtnStart, 3);
    console.log("Sidebar button removed.");
}

// 2. Extract Tariff View
let tarStart = -1, tarEnd = -1, depth = 0;
for(let i=0; i<lines.length; i++){
    if(lines[i].includes('id="view-tariffs"')) {
        tarStart = i;
        depth = 1;
    } else if (tarStart !== -1) {
        depth += (lines[i].match(/<div/g) || []).length;
        depth -= (lines[i].match(/<\/div>/g) || []).length;
        if (depth <= 0 && tarEnd === -1) {
            tarEnd = i;
            break;
        }
    }
}
if(tarStart === -1 || tarEnd === -1) {
    console.log("Could not find view-tariffs block");
    process.exit(1);
}
let tariffBlock = lines.splice(tarStart, tarEnd - tarStart + 1);
console.log("Tariff block extracted. Lines: ", tariffBlock.length);

// Change id and styling of the extracted block
tariffBlock[0] = tariffBlock[0].replace('id="view-tariffs"', 'id="adv-tariffs-workspace"').replace('style="display:none"', 'style="display:none; flex:1; overflow-y:auto; padding:20px; background:#f4f7f6; color:#333;"');

// Now find where to insert
// A. Insert `<div id="adv-billing-workspace" style="display:flex; flex-direction:column; flex:1; overflow-y:auto;">` before `<!-- HEADER PANEL -->`
let headerIdx = lines.findIndex(l => l.includes('<!-- HEADER PANEL -->'));
if(headerIdx > -1) {
    lines.splice(headerIdx, 0, '            <div id="adv-billing-workspace" style="display:flex; flex-direction:column; flex:1;">');
} else {
    console.log("Could not find HEADER PANEL");
    process.exit(1);
}

// B. Find `<style>` inside view-adv-billing, which is right after FOOTER TOTALS
// headerIdx has shifted the lines down by 1!
let styleIdx = lines.findIndex((l, i) => i > headerIdx && l.includes('<style>') && lines[i-1] && lines[i-1].includes('</div>'));
if(styleIdx > -1) {
    // we want to close adv-billing-workspace and then insert the tariffs block
    // let's insert exactly before the <style>
    lines.splice(styleIdx, 0, '            </div> <!-- /adv-billing-workspace -->', ...tariffBlock);
} else {
    console.log("Could not find styleIdx");
    process.exit(1);
}

// C. Insert the new button in the Toolbar. Let's find "Ver Historial" which is the last button
let btnSearchIdx = lines.findIndex(l => l.includes('btn-adv-search'));
if(btnSearchIdx > -1) {
    lines.splice(btnSearchIdx, 0, '                <button id="btn-adv-tariffs-toggle" style="background:transparent; border:1px solid transparent; color:#FFD700; padding:4px 10px; font-size:0.85rem; cursor:pointer;" onmouseover="this.style.background=\'rgba(255,255,255,0.2)\'" onmouseout="this.style.background=\'transparent\'" onclick="if(typeof window.toggleAdvTariffs === \'function\') window.toggleAdvTariffs()">💰 Gestión de Tarifas</button>');
} else {
    console.log("Could not find btnSearchIdx");
}

fs.writeFileSync(file, lines.join('\n'));
console.log("DONE! Saved admin.html");
