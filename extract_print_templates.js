const fs = require('fs');

const sourceFile = "C:\\\\Novapack_instablable evo5 SMS\\\\app.js";
const targetFile = "C:\\\\NOVAPACK CLOUD\\\\public\\\\firebase-app.js";

let source = fs.readFileSync(sourceFile, 'utf8');
let target = fs.readFileSync(targetFile, 'utf8');

function extractFunction(text, funcName) {
    const startIdx = text.indexOf("function " + funcName + "(");
    if (startIdx === -1) return null;
    
    let endIdx = startIdx;
    let openBrackets = 0;
    let started = false;
    
    for (let i = startIdx; i < text.length; i++) {
        if (text[i] === '{') {
            openBrackets++;
            started = true;
        } else if (text[i] === '}') {
            openBrackets--;
        }
        
        if (started && openBrackets === 0) {
            endIdx = i + 1;
            break;
        }
    }
    return text.substring(startIdx, endIdx);
}

const funcsToReplace = [
    'generateTicketHTML',
    'generateManifestHTML',
    'generateLabelHTML'
];

let success = true;
for (const func of funcsToReplace) {
    const newFunc = extractFunction(source, func);
    const oldFunc = extractFunction(target, func);
    
    if (newFunc && oldFunc) {
        target = target.replace(oldFunc, newFunc);
        console.log("Transplanted " + func);
    } else {
        console.log("Failed to find " + func + ". new:" + !!newFunc + " old:" + !!oldFunc);
        success = false;
    }
}

// Extract print routines and render grid if missing
const renderA4 = extractFunction(source, 'renderLabelsInA4Grid');
if (renderA4 && !target.includes('function renderLabelsInA4Grid')) {
    target += "\\n\\n" + renderA4 + "\\n";
    console.log("Appended renderLabelsInA4Grid");
}

if (success) {
    fs.writeFileSync(targetFile, target, 'utf8');
    console.log("Successfully updated firebase-app.js!");
}
