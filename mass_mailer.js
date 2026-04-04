/**
 * NOVAPACK Mass Mailer v1.0
 * Sends outgoing campaign emails via SMTP (IONOS).
 *
 * Usage:
 *   node mass_mailer.js              → processes all 'outgoing' campaign emails
 *   node mass_mailer.js --dry-run    → shows what would be sent without sending
 *
 * Reads from Firestore mailbox collection (type: 'outgoing_campaign', status: 'outgoing'),
 * sends via SMTP, updates status to 'sent' or 'failed'.
 */

const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');
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
    tls: { rejectUnauthorized: false },
    pool: true,          // Use connection pool for mass sending
    maxConnections: 3,   // Max simultaneous connections
    maxMessages: 50,     // Max messages per connection
    rateDelta: 2000,     // 2 seconds between messages
    rateLimit: 5         // Max 5 messages per rateDelta
};

const FIREBASE_CONFIG = {
    apiKey: "AIzaSyCHIqqwPtx5SFzf5d-cb6H0VSwX5eP_5lE",
    authDomain: "novapack-68f05.firebaseapp.com",
    projectId: "novapack-68f05"
};

const FROM_NAME = 'NOVAPACK Administración';
const FROM_EMAIL = 'administracion@novapack.info';
const LOGO_PATH = path.join(__dirname, 'public', 'icon_new.png');
const BATCH_SIZE = 10;
// ================================

const DRY_RUN = process.argv.includes('--dry-run');

// Initialize Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(FIREBASE_CONFIG);
}
const db = firebase.firestore();

// Build HTML email from plain text body
function buildHtmlEmail(subject, body, clientName) {
    const logoExists = fs.existsSync(LOGO_PATH);
    const escapedBody = body
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');

    return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0; padding:0; background:#f4f4f4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4; padding:20px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:8px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.1);">
    <!-- Header -->
    <tr>
        <td style="background:linear-gradient(135deg, #1a1a2e, #16213e); padding:25px 30px; text-align:center;">
            ${logoExists ? '<img src="cid:logo" alt="NOVAPACK" style="height:50px; margin-bottom:10px; display:block; margin-left:auto; margin-right:auto;">' : ''}
            <h1 style="color:#FF9800; margin:0; font-size:1.4rem; letter-spacing:1px;">NOVAPACK</h1>
        </td>
    </tr>
    <!-- Body -->
    <tr>
        <td style="padding:30px; color:#333; font-size:0.95rem; line-height:1.7;">
            ${escapedBody}
        </td>
    </tr>
    <!-- Footer -->
    <tr>
        <td style="background:#f9f9f9; padding:20px 30px; border-top:1px solid #eee; text-align:center; font-size:0.8rem; color:#999;">
            Este mensaje ha sido enviado por NOVAPACK &mdash; administracion@novapack.info<br>
            <a href="https://novapaack.com" style="color:#FF9800; text-decoration:none;">novapaack.com</a>
        </td>
    </tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

async function processOutgoing() {
    console.log('\n=== NOVAPACK Mass Mailer v1.0 ===');
    console.log(DRY_RUN ? '  MODE: DRY RUN (no emails will be sent)\n' : '  MODE: LIVE SENDING\n');

    // Query outgoing campaign emails
    const snap = await db.collection('mailbox')
        .where('type', '==', 'outgoing_campaign')
        .where('status', '==', 'outgoing')
        .get();

    if (snap.empty) {
        console.log('No pending outgoing campaign emails found.');
        return { sent: 0, failed: 0 };
    }

    console.log(`Found ${snap.size} pending email(s) to send.\n`);

    // Create transporter
    let transporter;
    if (!DRY_RUN) {
        transporter = nodemailer.createTransport(SMTP_CONFIG);
        // Verify connection
        try {
            await transporter.verify();
            console.log('SMTP connection verified.\n');
        } catch (err) {
            console.error('SMTP connection failed:', err.message);
            return { sent: 0, failed: snap.size };
        }
    }

    let sent = 0;
    let failed = 0;
    const docs = [];
    snap.forEach(doc => docs.push({ id: doc.id, ...doc.data() }));

    // Process in batches
    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
        const batch = docs.slice(i, i + BATCH_SIZE);

        for (const email of batch) {
            const idx = docs.indexOf(email) + 1;
            process.stdout.write(`  [${idx}/${docs.length}] → ${email.to} ... `);

            if (DRY_RUN) {
                console.log('SKIP (dry-run)');
                sent++;
                continue;
            }

            try {
                const htmlBody = buildHtmlEmail(email.subject, email.body, email.toName);
                const logoExists = fs.existsSync(LOGO_PATH);

                const mailOpts = {
                    from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
                    to: email.to,
                    subject: email.subject,
                    text: email.body,
                    html: htmlBody,
                    attachments: logoExists ? [{
                        filename: 'logo.png',
                        path: LOGO_PATH,
                        cid: 'logo'
                    }] : []
                };

                await transporter.sendMail(mailOpts);

                await db.collection('mailbox').doc(email.id).update({
                    status: 'sent',
                    sentAt: firebase.firestore.FieldValue.serverTimestamp()
                });

                console.log('OK');
                sent++;
            } catch (err) {
                console.log('FAILED (' + err.message + ')');
                failed++;

                try {
                    await db.collection('mailbox').doc(email.id).update({
                        status: 'failed',
                        error: err.message,
                        failedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                } catch (_) {}
            }
        }

        // Small pause between batches
        if (i + BATCH_SIZE < docs.length) {
            await new Promise(r => setTimeout(r, 1000));
        }
    }

    // Close transporter pool
    if (transporter) {
        transporter.close();
    }

    console.log(`\n=== RESULTS: ${sent} sent, ${failed} failed out of ${docs.length} ===\n`);
    return { sent, failed };
}

// Run
processOutgoing()
    .then(result => {
        console.log('Done.');
        process.exit(result.failed > 0 ? 1 : 0);
    })
    .catch(err => {
        console.error('Fatal error:', err);
        process.exit(1);
    });
