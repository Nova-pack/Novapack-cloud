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

// === extractTicketRef — ONLY Novapack format: PREFIX-YY-SEQ (same as mail_engine.js) ===
function extractTicketRef(text) {
    if (!text) return null;

    const clean = text.replace(/\s+/g, ' ');

    // Current 2-digit year and recent years (to validate YY part)
    const now = new Date();
    const thisYY = now.getFullYear() % 100;
    const validYears = new Set();
    for (let y = thisYY - 3; y <= thisYY + 1; y++) validYears.add(String(y).padStart(2, '0'));

    // Format 1 (PRIMARY): PREFIX-YY-SEQ with alphanumeric prefix (NP-26-15, NOVA-26-0)
    const matches1 = clean.matchAll(/\b([A-Z]{2,5})-(\d{2})-(\d{1,5})\b/gi);
    for (const m of matches1) {
        if (validYears.has(m[2])) return m[1].toUpperCase() + '-' + m[2] + '-' + m[3];
    }

    // Format 2: PREFIX-YY-SEQ with numeric prefix (5402-26-3, 1234-25-10)
    const matches2 = clean.matchAll(/\b(\d{3,5})-(\d{2})-(\d{1,5})\b/g);
    for (const m of matches2) {
        if (validYears.has(m[2])) return m[1] + '-' + m[2] + '-' + m[3];
    }

    // Format 3: Keyword + our format (albarán NP-26-15, ref: 5402-26-3)
    const kwMatch = clean.match(/(?:albar[aáà]n|ref\.?|referencia|ticket|envío|envio|pedido|n[ºo°]\.?)\s*[.:;\-–—#]*\s*([A-Z0-9]{2,5})-(\d{2})-(\d{1,5})/i);
    if (kwMatch && validYears.has(kwMatch[2])) {
        return kwMatch[1].toUpperCase() + '-' + kwMatch[2] + '-' + kwMatch[3];
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
