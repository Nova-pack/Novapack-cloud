/**
 * NOVAPACK MAIL ENGINE v1.1
 * Connects to IONOS IMAP, reads recent emails, and syncs them to Firestore 'mailbox' collection.
 * Run manually: node mail_engine.js
 * Or schedule via Task Scheduler / cron every 5 minutes.
 */

const Imap = require('imap');
const { simpleParser } = require('mailparser');
const firebase = require('firebase/compat/app');
require('firebase/compat/auth');
require('firebase/compat/firestore');

// ============ CONFIG ============
const IMAP_CONFIG = {
    user: 'administracion@novapack.info',
    password: 'MAJUPACLA',
    host: 'imap.ionos.es',
    port: 993,
    tls: true,
    tlsOptions: { rejectUnauthorized: false },
    connTimeout: 30000,
    authTimeout: 15000
};

const FIREBASE_CONFIG = {
    apiKey: "AIzaSyCHIqqwPtx5SFzf5d-cb6H0VSwX5eP_5lE",
    authDomain: "novapack-68f05.firebaseapp.com",
    projectId: "novapack-68f05"
};

// How many days back to scan for emails
const DAYS_BACK = 3;
// Max emails to process per run
const MAX_EMAILS = 50;
// Max body length to store (was 2000, now 10000 for full visibility)
const MAX_BODY_LENGTH = 10000;
// IMAP retry config
const IMAP_MAX_RETRIES = 3;
const IMAP_RETRY_DELAY_MS = 5000;
// ================================

// Categorize email by subject/body content
function categorizeEmail(subject, body) {
    const text = ((subject || '') + ' ' + (body || '')).toLowerCase();
    if (text.includes('pod') || text.includes('prueba de entrega') || text.includes('comprobante')) return 'pod';
    if (text.includes('abono') || text.includes('devoluc')) return 'abono';
    if (text.includes('rectifica') || text.includes('error en factura')) return 'rectificacion';
    if (text.includes('fiscal') || text.includes('modelo') || text.includes('hacienda') || text.includes('certificado')) return 'fiscal';
    if (text.includes('albar') || text.includes('np-') || text.includes('envío') || text.includes('paquete') || text.includes('seguimiento')) return 'consulta_albaran';
    if (text.includes('reclama') || text.includes('queja') || text.includes('incidencia') || text.includes('daño') || text.includes('roto')) return 'reclamacion';
    if (text.includes('factura') || text.includes('cobro') || text.includes('pago') || text.includes('recibo')) return 'facturacion';
    return 'otro';
}

// Extract ticket references from text (150200209, NP-00001, NP00234, etc.)
function extractTicketRef(text) {
    if (!text) return null;
    
    // Normalize: collapse whitespace, remove invisible chars
    const clean = text.replace(/\s+/g, ' ');
    
    // Format 1 (PRIORITY): Keywords followed by a number (albarán 150200209, ref: 12345, nº 150200209)
    // This must run FIRST to prevent partial-word false positives (e.g. "albarán" → "n" captured as prefix)
    let match = clean.match(/(?:albar[aáà]n|albaran|alb\.?|ref\.?|referencia|ticket|envío|envio|pedido|n[ºo°]\.?|número|numero)\s*[.:;\-–—#]*\s*(\d{5,12})/i);
    if (match) return match[1];

    // Format 2: "pod del 150200209" / "pod de 150200209" / "pod 150200209"
    match = clean.match(/(?:pod|comprobante|justificante|prueba\s+de\s+entrega|acuse)\s+(?:del?|para|de\s+el)?\s*[#nº]*\s*(\d{5,12})/i);
    if (match) return match[1];

    // Format 3: Prefixed albarán numbers (NP00001, NP-12345, 15020-00209, etc.)
    // Requires 2+ alpha chars as prefix to avoid capturing trailing letter from words like "albarán"
    match = clean.match(/\b([A-Z]{2,4}\d{0,4})[-\s]?(\d{4,9})\b/i);
    if (match) return (match[1] + match[2]).toUpperCase();

    // Format 4: Standalone long number (6-12 digits) likely to be an albarán
    // Only match if no other significant numbers present to avoid false positives
    match = clean.match(/\b(\d{6,12})\b/);
    if (match) {
        // Validate it's not a phone number (9 digits starting with 6/7/9 in Spain)
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

async function run() {
    console.log('[MAIL ENGINE] Starting at', new Date().toLocaleString('es-ES'));

    // 1. Init Firebase
    if (!firebase.apps.length) {
        firebase.initializeApp(FIREBASE_CONFIG);
    }
    const db = firebase.firestore();

    // 2. Auth with Firebase (use any valid account - we'll use the admin check)
    // We need a service account or a known user. For now we try anonymous or skip auth
    // Since rules allow any authenticated user, we need to sign in
    let authUser = firebase.auth().currentUser;
    if (!authUser) {
        // Try to find admin credentials from config
        try {
            // Sign in with a known admin email
            const adminSnap = await db.collection('config').doc('admin').get();
            console.log('[MAIL ENGINE] Attempting Firebase auth...');
        } catch(e) {
            // Expected - need auth first
        }
    }

    // 3. Connect IMAP
    console.log('[MAIL ENGINE] Connecting to IONOS IMAP...');

    return new Promise((resolve, reject) => {
        const imap = new Imap(IMAP_CONFIG);

        imap.once('ready', () => {
            console.log('[MAIL ENGINE] IMAP connected');

            imap.openBox('INBOX', true, async (err, box) => {
                if (err) {
                    console.error('[MAIL ENGINE] Failed to open INBOX:', err.message);
                    imap.end();
                    reject(err);
                    return;
                }

                console.log(`[MAIL ENGINE] INBOX: ${box.messages.total} total, ${box.messages.new} new`);

                // Search for recent emails (last N days)
                const sinceDate = new Date();
                sinceDate.setDate(sinceDate.getDate() - DAYS_BACK);
                const searchDate = sinceDate.toISOString().split('T')[0].split('-');
                const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                const imapDate = `${searchDate[2]}-${months[parseInt(searchDate[1])-1]}-${searchDate[0]}`;

                imap.search([['SINCE', imapDate]], async (err, results) => {
                    if (err) {
                        console.error('[MAIL ENGINE] Search error:', err.message);
                        imap.end();
                        reject(err);
                        return;
                    }

                    console.log(`[MAIL ENGINE] Found ${results.length} emails since ${imapDate}`);

                    if (results.length === 0) {
                        console.log('[MAIL ENGINE] No recent emails to process');
                        imap.end();
                        resolve();
                        return;
                    }

                    // Limit to most recent N
                    const toFetch = results.slice(-MAX_EMAILS);
                    console.log(`[MAIL ENGINE] Processing ${toFetch.length} emails...`);

                    const emails = [];
                    let processed = 0;

                    const fetch = imap.fetch(toFetch, {
                        bodies: '',
                        struct: true
                    });

                    fetch.on('message', (msg, seqno) => {
                        let buffer = '';

                        msg.on('body', (stream) => {
                            stream.on('data', (chunk) => {
                                buffer += chunk.toString('utf8');
                            });
                        });

                        msg.once('end', async () => {
                            try {
                                const parsed = await simpleParser(buffer);
                                const from = parsed.from ? parsed.from.text : 'Desconocido';
                                const subject = parsed.subject || '(Sin Asunto)';
                                const body = parsed.text ? parsed.text.substring(0, MAX_BODY_LENGTH) : '';
                                const date = parsed.date || new Date();
                                const messageId = parsed.messageId || `imap_${seqno}_${Date.now()}`;

                                emails.push({
                                    messageId,
                                    from,
                                    subject,
                                    body,
                                    date,
                                    category: categorizeEmail(subject, body),
                                    ticketRef: extractTicketRef(subject + ' ' + body),
                                    status: 'nueva',
                                    source: 'imap_ionos'
                                });
                            } catch(e) {
                                console.warn(`[MAIL ENGINE] Parse error on msg ${seqno}:`, e.message);
                            }
                            processed++;
                        });
                    });

                    fetch.once('error', (err) => {
                        console.error('[MAIL ENGINE] Fetch error:', err.message);
                    });

                    fetch.once('end', async () => {
                        console.log(`[MAIL ENGINE] Parsed ${emails.length} emails, writing to Firestore...`);

                        // Sign in to Firebase first
                        try {
                            // Use anonymous auth or find admin creds
                            // For now, enable anonymous auth or use admin creds
                            if (!firebase.auth().currentUser) {
                                // We'll try to write without explicit login since rules allow authenticated users
                                // If this fails, we need proper service account
                                console.log('[MAIL ENGINE] No Firebase auth - attempting with stored session...');
                            }
                        } catch(e) {
                            console.warn('[MAIL ENGINE] Auth warning:', e.message);
                        }

                        let written = 0, skipped = 0;

                        for (const email of emails) {
                            try {
                                // Use messageId as document ID to prevent duplicates
                                const docId = email.messageId
                                    .replace(/[\/\\<>@.\s]/g, '_')
                                    .substring(0, 100);

                                const docRef = db.collection('mailbox').doc(docId);
                                const existing = await docRef.get();

                                if (existing.exists) {
                                    skipped++;
                                    continue;
                                }

                                await docRef.set({
                                    from: email.from,
                                    subject: email.subject,
                                    body: email.body,
                                    category: email.category,
                                    ticketRef: email.ticketRef || null,
                                    status: email.status,
                                    source: email.source,
                                    messageId: email.messageId,
                                    createdAt: firebase.firestore.Timestamp.fromDate(email.date instanceof Date ? email.date : new Date(email.date))
                                });
                                written++;
                            } catch(e) {
                                console.error(`[MAIL ENGINE] Write error for "${email.subject}":`, e.message);
                            }
                        }

                        console.log(`[MAIL ENGINE] Done! Written: ${written}, Skipped (duplicates): ${skipped}, Errors: ${emails.length - written - skipped}`);

                        imap.end();
                        resolve({ written, skipped });
                    });
                });
            });
        });

        imap.once('error', (err) => {
            console.error('[MAIL ENGINE] IMAP error:', err.message);
            reject(err);
        });

        imap.once('end', () => {
            console.log('[MAIL ENGINE] IMAP connection closed');
        });

        imap.connect();
    });
}

// Run and handle Firebase auth
async function main() {
    // Init Firebase
    if (!firebase.apps.length) {
        firebase.initializeApp(FIREBASE_CONFIG);
    }

    // We need to authenticate to write to Firestore
    // Try to sign in with a known user
    try {
        // Read admin UID from environment or hardcode for this script
        // The Firestore rules require auth, so we need a valid user
        const accounts = [
            { email: 'eldarvo30@gmail.com', pass: 'Drcracing1975' },
            { email: 'eldarvi30@gmail.com', pass: 'Drcracing1975' },
        ];

        let authed = false;
        for (const acc of accounts) {
            try {
                await firebase.auth().signInWithEmailAndPassword(acc.email, acc.pass);
                console.log('[MAIL ENGINE] Firebase auth OK as', acc.email);
                authed = true;
                break;
            } catch(e) {
                console.log('[MAIL ENGINE] Auth failed for', acc.email, '-', e.code);
            }
        }

        if (!authed) {
            console.error('[MAIL ENGINE] Cannot authenticate with Firebase. Creating anonymous session...');
            try {
                await firebase.auth().signInAnonymously();
                console.log('[MAIL ENGINE] Anonymous auth OK');
            } catch(e) {
                console.error('[MAIL ENGINE] Anonymous auth also failed:', e.message);
                console.error('[MAIL ENGINE] Firestore writes will fail. Please register the email in Firebase Auth.');
                // Try anyway - maybe rules changed
            }
        }
    } catch(e) {
        console.error('[MAIL ENGINE] Auth setup error:', e.message);
    }

    let lastError = null;
    for (let attempt = 1; attempt <= IMAP_MAX_RETRIES; attempt++) {
        try {
            console.log(`[MAIL ENGINE] Attempt ${attempt}/${IMAP_MAX_RETRIES}...`);
            await run();
            lastError = null;
            break;
        } catch(e) {
            lastError = e;
            console.error(`[MAIL ENGINE] Attempt ${attempt} failed: ${e.message}`);
            if (attempt < IMAP_MAX_RETRIES) {
                console.log(`[MAIL ENGINE] Retrying in ${IMAP_RETRY_DELAY_MS / 1000}s...`);
                await new Promise(r => setTimeout(r, IMAP_RETRY_DELAY_MS));
            }
        }
    }

    if (lastError) {
        console.error('[MAIL ENGINE] ALL RETRIES EXHAUSTED. Last error:', lastError.message);
        console.error('[MAIL ENGINE] ⚠️  ALERTA: El buzón no se ha podido sincronizar. Revisa la conexión IMAP o las credenciales.');
    }

    process.exit(lastError ? 1 : 0);
}

main();
