/**
 * NOVAPACK MAIL ENGINE v2.0
 * Connects to IONOS IMAP, reads recent emails, and syncs them to Firestore 'mailbox' collection.
 * v2.0: HTML fallback, attachment info, POD auto-detection with ticket lookup
 * Run manually: node mail_engine.js
 * Or schedule via Task Scheduler / cron every 5 minutes.
 */

const Imap = require('imap');
const { simpleParser } = require('mailparser');
const { JSDOM } = require('jsdom');
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

// ============ SPAM / PUBLICITY FILTER ============
function isSpamOrPublicity(from, subject, body, headers) {
    const text = ((subject || '') + ' ' + (body || '')).toLowerCase();
    const fromLower = (from || '').toLowerCase();

    // Unsubscribe header or link = newsletter
    if (headers && headers.get && headers.get('list-unsubscribe')) return true;
    if (text.includes('unsubscribe') || text.includes('darse de baja') || text.includes('cancelar suscripci')) return true;

    // Marketing keywords
    const spamWords = ['newsletter', 'promoción especial', 'oferta exclusiva', 'click aquí para ver',
        'no-reply@', 'noreply@', 'marketing@', 'promo@', 'news@', 'info@',
        'has been added to', 'view in browser', 'ver en navegador'];
    for (const w of spamWords) {
        if (text.includes(w) || fromLower.includes(w)) return true;
    }

    // Automated system notifications
    const systemSenders = ['mailer-daemon', 'postmaster', 'notify@', 'notification@', 'alert@', 'system@'];
    for (const s of systemSenders) {
        if (fromLower.includes(s)) return true;
    }

    return false;
}

// ============ HTML TO TEXT FALLBACK ============
function htmlToText(html) {
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        // Remove script/style tags
        doc.querySelectorAll('script, style, head').forEach(el => el.remove());
        // Get text content, collapse whitespace
        return doc.body.textContent.replace(/\s+/g, ' ').trim();
    } catch(e) {
        // Simple regex fallback
        return html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    }
}

// ============ CATEGORIZE BY WEIGHTED SCORE ============
function categorizeEmail(subject, body) {
    const text = ((subject || '') + ' ' + (body || '')).toLowerCase();
    const subjectLower = (subject || '').toLowerCase();

    const categories = {
        pod:              { keywords: ['pod', 'prueba de entrega', 'comprobante', 'justificante de entrega', 'acuse de recibo'], score: 0 },
        abono:            { keywords: ['abono', 'devoluc', 'reembolso', 'devolver'], score: 0 },
        rectificacion:    { keywords: ['rectifica', 'error en factura', 'factura rectificativa', 'corregir factura'], score: 0 },
        fiscal:           { keywords: ['fiscal', 'hacienda', 'certificado fiscal', 'modelo 347', 'modelo 303', 'retencion', 'irpf'], score: 0 },
        consulta_albaran: { keywords: ['albar', 'np-', 'envío', 'envio', 'paquete', 'seguimiento', 'donde está', 'estado del envio'], score: 0 },
        reclamacion:      { keywords: ['reclama', 'queja', 'incidencia', 'daño', 'dano', 'roto', 'extravi', 'perdido'], score: 0 },
        facturacion:      { keywords: ['factura', 'cobro', 'pago', 'recibo', 'vencimiento', 'pendiente de pago'], score: 0 }
    };

    for (const [cat, cfg] of Object.entries(categories)) {
        for (const kw of cfg.keywords) {
            if (subjectLower.includes(kw)) cfg.score += 3; // Subject match = 3x weight
            else if (text.includes(kw)) cfg.score += 1;    // Body match = 1x weight
        }
    }

    // Find highest score
    let best = 'otro';
    let bestScore = 0;
    for (const [cat, cfg] of Object.entries(categories)) {
        if (cfg.score > bestScore) {
            bestScore = cfg.score;
            best = cat;
        }
    }

    return best;
}

// ============ EXTRACT ATTACHMENT INFO (metadata only, not content) ============
function extractAttachmentInfo(attachments) {
    if (!attachments || !attachments.length) return [];
    return attachments.map(att => ({
        filename: att.filename || 'sin_nombre',
        contentType: att.contentType || 'application/octet-stream',
        size: att.size || 0
    }));
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

// ============ POD TICKET LOOKUP ============
async function lookupTicketPOD(db, ticketRef) {
    try {
        // Search in tickets collection by document ID or ticketId field
        let ticketDoc = await db.collection('tickets').doc(ticketRef).get();

        // If not found by doc ID, try querying by ticketId field
        if (!ticketDoc.exists) {
            const query = await db.collection('tickets')
                .where('ticketId', '==', ticketRef)
                .limit(1)
                .get();
            if (!query.empty) {
                ticketDoc = query.docs[0];
            } else {
                // Try with albaranNumber field
                const query2 = await db.collection('tickets')
                    .where('albaranNumber', '==', ticketRef)
                    .limit(1)
                    .get();
                if (!query2.empty) {
                    ticketDoc = query2.docs[0];
                }
            }
        }

        if (!ticketDoc || !ticketDoc.exists) {
            console.log(`[MAIL ENGINE] POD lookup: ticket ${ticketRef} not found`);
            return { ready: false, reason: 'albaran_no_encontrado' };
        }

        const t = ticketDoc.data();
        const isDelivered = t.status === 'Entregado' || t.delivered === true;

        if (!isDelivered) {
            return { ready: false, reason: 'pendiente_entrega' };
        }

        const hasSignature = !!t.signatureURL;
        const hasPhoto = !!t.photoURL;

        if (!hasSignature && !hasPhoto) {
            return { ready: false, reason: 'entregado_sin_pod', deliveredAt: t.deliveredAt || null };
        }

        return {
            ready: true,
            reason: 'pod_disponible',
            ticketDocId: ticketDoc.id,
            signatureURL: t.signatureURL || null,
            photoURL: t.photoURL || null,
            deliveredAt: t.deliveredAt || null,
            receiverName: t.deliveryReceiverName || t.receiverName || 'N/A',
            driverName: t.deliveredByDriver || 'N/A'
        };
    } catch(e) {
        console.error(`[MAIL ENGINE] POD lookup error for ${ticketRef}:`, e.message);
        return { ready: false, reason: 'error_consulta' };
    }
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
                                const date = parsed.date || new Date();
                                const messageId = parsed.messageId || `imap_${seqno}_${Date.now()}`;

                                // Body: prefer text, fallback to HTML→text
                                let body = '';
                                if (parsed.text) {
                                    body = parsed.text.substring(0, MAX_BODY_LENGTH);
                                } else if (parsed.html) {
                                    body = htmlToText(parsed.html).substring(0, MAX_BODY_LENGTH);
                                }

                                // Spam/publicity filter
                                if (isSpamOrPublicity(from, subject, body, parsed.headers)) {
                                    console.log(`[MAIL ENGINE] Filtered (spam/publicity): "${subject}" from ${from}`);
                                    processed++;
                                    return;
                                }

                                // Attachment metadata (not content)
                                const attachments = extractAttachmentInfo(parsed.attachments);

                                const category = categorizeEmail(subject, body);
                                const ticketRef = extractTicketRef(subject + ' ' + body);

                                emails.push({
                                    messageId,
                                    from,
                                    subject,
                                    body,
                                    date,
                                    category,
                                    ticketRef,
                                    attachments,
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

                                // POD auto-detection: if category is POD and we have a ticketRef, look up the ticket
                                let podData = null;
                                if (email.category === 'pod' && email.ticketRef) {
                                    podData = await lookupTicketPOD(db, email.ticketRef);
                                }

                                const docData = {
                                    from: email.from,
                                    subject: email.subject,
                                    body: email.body,
                                    category: email.category,
                                    ticketRef: email.ticketRef || null,
                                    attachments: email.attachments || [],
                                    status: email.status,
                                    source: email.source,
                                    messageId: email.messageId,
                                    createdAt: firebase.firestore.Timestamp.fromDate(email.date instanceof Date ? email.date : new Date(email.date))
                                };

                                // If POD data found, enrich the mailbox doc
                                if (podData) {
                                    docData.podInfo = podData;
                                    if (podData.ready) {
                                        docData.status = 'pod_lista';
                                    }
                                }

                                await docRef.set(docData);
                                written++;

                                if (podData) {
                                    console.log(`[MAIL ENGINE] POD enriched: ticket ${email.ticketRef} → ${podData.ready ? 'READY' : 'NOT READY'}`);
                                }
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
