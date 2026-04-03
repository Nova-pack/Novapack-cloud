/**
 * NOVAPACK POD RESPONDER v1.0
 * Sends POD email responses via SMTP (IONOS).
 *
 * Usage:
 *   Mode 1 (manual):  node pod_responder.js              → processes all 'pod_autorizada' emails
 *   Mode 2 (single):  node pod_responder.js <mailboxDocId> → sends one specific email
 *
 * Can also be required as a module and called from other scripts.
 */

const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const https = require('https');
const firebase = require('firebase/compat/app');
require('firebase/compat/auth');
require('firebase/compat/firestore');

// ============ CONFIG ============
const SMTP_CONFIG = {
    host: 'smtp.ionos.es',
    port: 587,
    secure: false, // STARTTLS
    auth: {
        user: 'administracion@novapack.info',
        pass: 'MAJUPACLA'
    },
    tls: { rejectUnauthorized: false }
};

const FIREBASE_CONFIG = {
    apiKey: "AIzaSyCHIqqwPtx5SFzf5d-cb6H0VSwX5eP_5lE",
    authDomain: "novapack-68f05.firebaseapp.com",
    projectId: "novapack-68f05"
};

const LOGO_PATH = path.join(__dirname, 'public', 'icon_new.png');
const TEMPLATE_PATH = path.join(__dirname, 'public', 'pod_email_template.html');
// ================================

// Download a file from URL to a temp buffer
function downloadFile(url) {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : require('http');
        client.get(url, (res) => {
            if (res.statusCode === 302 || res.statusCode === 301) {
                return downloadFile(res.headers.location).then(resolve).catch(reject);
            }
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks)));
            res.on('error', reject);
        }).on('error', reject);
    });
}

// Build the HTML email from template
function buildEmailHTML(podInfo, ticketRef) {
    let html = fs.readFileSync(TEMPLATE_PATH, 'utf8');

    // Format delivery date
    let deliveredAt = 'N/A';
    if (podInfo.deliveredAt) {
        if (podInfo.deliveredAt.toDate) {
            deliveredAt = podInfo.deliveredAt.toDate().toLocaleString('es-ES');
        } else if (podInfo.deliveredAt._seconds) {
            deliveredAt = new Date(podInfo.deliveredAt._seconds * 1000).toLocaleString('es-ES');
        } else {
            deliveredAt = new Date(podInfo.deliveredAt).toLocaleString('es-ES');
        }
    }

    html = html.replace('{{TICKET_REF}}', ticketRef || 'N/A');
    html = html.replace('{{DELIVERED_AT}}', deliveredAt);
    html = html.replace('{{RECEIVER_NAME}}', podInfo.receiverName || 'N/A');
    html = html.replace('{{DRIVER_NAME}}', podInfo.driverName || 'N/A');

    return html;
}

// Extract email address from "Name <email>" format
function extractEmail(from) {
    const match = (from || '').match(/<([^>]+)>/);
    return match ? match[1] : from;
}

// Send a single POD email
async function sendPODEmail(transporter, mailboxDoc) {
    const data = mailboxDoc.data ? mailboxDoc.data() : mailboxDoc;
    const podInfo = data.podInfo;
    const ticketRef = data.ticketRef;
    const recipientEmail = extractEmail(data.from);

    if (!recipientEmail || !podInfo || !podInfo.ready) {
        throw new Error(`Missing data: email=${recipientEmail}, podReady=${podInfo?.ready}`);
    }

    console.log(`[POD RESPONDER] Sending POD for ticket ${ticketRef} to ${recipientEmail}...`);

    // Build HTML
    const html = buildEmailHTML(podInfo, ticketRef);

    // Prepare attachments
    const attachments = [];

    // Logo inline (for CID reference in HTML)
    if (fs.existsSync(LOGO_PATH)) {
        attachments.push({
            filename: 'novapack-logo.png',
            path: LOGO_PATH,
            cid: 'novapack-logo'
        });
    }

    // Download and attach signature
    if (podInfo.signatureURL) {
        try {
            const sigBuffer = await downloadFile(podInfo.signatureURL);
            attachments.push({
                filename: `firma_${ticketRef}.png`,
                content: sigBuffer,
                contentType: 'image/png'
            });
        } catch(e) {
            console.warn(`[POD RESPONDER] Could not download signature: ${e.message}`);
        }
    }

    // Download and attach photo
    if (podInfo.photoURL) {
        try {
            const photoBuffer = await downloadFile(podInfo.photoURL);
            attachments.push({
                filename: `foto_entrega_${ticketRef}.jpg`,
                content: photoBuffer,
                contentType: 'image/jpeg'
            });
        } catch(e) {
            console.warn(`[POD RESPONDER] Could not download photo: ${e.message}`);
        }
    }

    // Send email
    const result = await transporter.sendMail({
        from: '"NOVAPACK Administración" <administracion@novapack.info>',
        to: recipientEmail,
        subject: `Prueba de Entrega - Albarán ${ticketRef}`,
        html: html,
        attachments: attachments
    });

    console.log(`[POD RESPONDER] Sent! MessageId: ${result.messageId}`);
    return result;
}

// Main: process authorized POD emails
async function main() {
    // Init Firebase
    if (!firebase.apps.length) {
        firebase.initializeApp(FIREBASE_CONFIG);
    }

    // Auth
    const accounts = [
        { email: 'eldarvo30@gmail.com', pass: 'Drcracing1975' },
        { email: 'eldarvi30@gmail.com', pass: 'Drcracing1975' },
    ];
    let authed = false;
    for (const acc of accounts) {
        try {
            await firebase.auth().signInWithEmailAndPassword(acc.email, acc.pass);
            console.log('[POD RESPONDER] Firebase auth OK as', acc.email);
            authed = true;
            break;
        } catch(e) { /* next */ }
    }
    if (!authed) {
        console.error('[POD RESPONDER] Cannot authenticate with Firebase');
        process.exit(1);
    }

    const db = firebase.firestore();
    const transporter = nodemailer.createTransport(SMTP_CONFIG);

    // Verify SMTP connection
    try {
        await transporter.verify();
        console.log('[POD RESPONDER] SMTP connection verified');
    } catch(e) {
        console.error('[POD RESPONDER] SMTP connection failed:', e.message);
        process.exit(1);
    }

    // Check if single doc ID passed as argument
    const singleDocId = process.argv[2];

    let docs;
    if (singleDocId) {
        const doc = await db.collection('mailbox').doc(singleDocId).get();
        if (!doc.exists) {
            console.error(`[POD RESPONDER] Document ${singleDocId} not found`);
            process.exit(1);
        }
        docs = [doc];
    } else {
        // Find all authorized POD emails
        const snapshot = await db.collection('mailbox')
            .where('status', '==', 'pod_autorizada')
            .get();
        docs = snapshot.docs;
    }

    console.log(`[POD RESPONDER] Found ${docs.length} email(s) to process`);

    let sent = 0, errors = 0;
    for (const doc of docs) {
        try {
            await sendPODEmail(transporter, doc);
            // Mark as sent
            await db.collection('mailbox').doc(doc.id).update({
                status: 'resuelta',
                podSentAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                notes: (doc.data().notes || '') + '\n[AUTO] POD enviada por email el ' + new Date().toLocaleString('es-ES')
            });
            sent++;
        } catch(e) {
            console.error(`[POD RESPONDER] Error sending ${doc.id}:`, e.message);
            errors++;
        }
    }

    console.log(`[POD RESPONDER] Done! Sent: ${sent}, Errors: ${errors}`);
    transporter.close();
    process.exit(errors > 0 ? 1 : 0);
}

// Export for use as module
module.exports = { sendPODEmail, buildEmailHTML, SMTP_CONFIG };

// Run if executed directly
if (require.main === module) {
    main();
}
