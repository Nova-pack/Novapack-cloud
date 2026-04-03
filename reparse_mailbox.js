/**
 * REPARSE MAILBOX — One-time script
 * Re-applies the improved extractTicketRef to all existing mailbox entries.
 * Run: node reparse_mailbox.js
 */

const firebase = require('firebase/compat/app');
require('firebase/compat/auth');
require('firebase/compat/firestore');

const FIREBASE_CONFIG = {
    apiKey: "AIzaSyCHIqqwPtx5SFzf5d-cb6H0VSwX5eP_5lE",
    authDomain: "novapack-68f05.firebaseapp.com",
    projectId: "novapack-68f05"
};

// === IMPROVED extractTicketRef (same as mail_engine.js) ===
function extractTicketRef(text) {
    if (!text) return null;
    
    const clean = text.replace(/\s+/g, ' ');
    
    // Format 1 (PRIORITY): Keywords followed by a number (albarán 150200209, ref: 12345, nº 150200209)
    // Must run FIRST to prevent partial-word false positives ("albarán" → "n" captured as prefix)
    let match = clean.match(/(?:albar[aáà]n|albaran|alb\.?|ref\.?|referencia|ticket|envío|envio|pedido|n[ºo°]\.?|número|numero)\s*[.:\-–—#]*\s*(\d{5,12})/i);
    if (match) return match[1];

    // Format 2: "pod del 150200209" / "pod de 150200209"
    match = clean.match(/(?:pod|comprobante|justificante|prueba\s+de\s+entrega|acuse)\s+(?:del?|para|de\s+el)?\s*[#nº]*\s*(\d{5,12})/i);
    if (match) return match[1];

    // Format 3: Prefixed albarán numbers (NP00001, NP-12345, 15020-00209, etc.)
    // Requires 2+ alpha chars to avoid capturing trailing letter from words like "albarán"
    match = clean.match(/\b([A-Z]{2,4}\d{0,4})[-\s]?(\d{4,9})\b/i);
    if (match) return (match[1] + match[2]).toUpperCase();

    // Format 4: Standalone long number (6-12 digits)
    match = clean.match(/\b(\d{6,12})\b/);
    if (match) {
        const num = match[1];
        const isPhone = (num.length === 9 && /^[679]/.test(num));
        const isDate = /^\d{2}[\/\-]\d{2}[\/\-]\d{2,4}$/.test(num);
        const isYear = (num.length === 4 && parseInt(num) >= 1990 && parseInt(num) <= 2030);
        if (!isPhone && !isDate && !isYear) {
            return num;
        }
    }

    return null;
}

async function main() {
    if (!firebase.apps.length) {
        firebase.initializeApp(FIREBASE_CONFIG);
    }

    // Authenticate
    const accounts = [
        { email: 'eldarvo30@gmail.com', pass: 'Drcracing1975' },
        { email: 'eldarvi30@gmail.com', pass: 'Drcracing1975' },
    ];

    let authed = false;
    for (const acc of accounts) {
        try {
            await firebase.auth().signInWithEmailAndPassword(acc.email, acc.pass);
            console.log('[REPARSE] Auth OK:', acc.email);
            authed = true;
            break;
        } catch(e) {
            console.log('[REPARSE] Auth failed:', acc.email, e.code);
        }
    }

    if (!authed) {
        console.error('[REPARSE] Cannot authenticate. Aborting.');
        process.exit(1);
    }

    const db = firebase.firestore();

    // Read ALL mailbox documents
    console.log('[REPARSE] Reading all mailbox entries...');
    const snap = await db.collection('mailbox').get();
    console.log(`[REPARSE] Found ${snap.size} entries.`);

    let updated = 0;
    let alreadyOK = 0;
    let noRef = 0;

    for (const doc of snap.docs) {
        const data = doc.data();
        const fullText = ((data.subject || '') + ' ' + (data.body || ''));
        const newRef = extractTicketRef(fullText);
        const oldRef = data.ticketRef || null;

        if (newRef && newRef !== oldRef) {
            try {
                await db.collection('mailbox').doc(doc.id).update({ ticketRef: newRef });
                console.log(`  ✅ ${doc.id.substring(0, 40)}... | "${(data.subject || '').substring(0, 50)}" → ticketRef: ${oldRef || 'null'} → ${newRef}`);
                updated++;
            } catch(e) {
                console.error(`  ❌ Error updating ${doc.id}:`, e.message);
            }
        } else if (newRef && newRef === oldRef) {
            alreadyOK++;
        } else {
            noRef++;
        }
    }

    console.log('\n[REPARSE] =================== RESULTS ===================');
    console.log(`  Updated:     ${updated}`);
    console.log(`  Already OK:  ${alreadyOK}`);
    console.log(`  No ref found: ${noRef}`);
    console.log(`  Total:       ${snap.size}`);
    console.log('[REPARSE] Done!');

    process.exit(0);
}

main();
