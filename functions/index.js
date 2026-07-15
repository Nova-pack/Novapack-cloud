// =============================================================
// NOVAPACK CLOUD FUNCTIONS
// =============================================================
// Procesado servidor de la cola SMTP (/mailbox) sin depender de
// ningún PC encendido. Reemplaza el dependency de mail_engine.js
// corriendo en máquina del admin.
//
// Funciones expuestas:
//   - processMailboxQueue : scheduler cada 2 min, procesa la cola
//   - flushMailboxNow     : callable HTTP, lanza una pasada manual
//                            desde admin (botón "🚀 Flush ahora")
//
// Secretos requeridos (Firebase Secret Manager):
//   - SMTP_USER : usuario IONOS (administracion@novapack.info)
//   - SMTP_PASS : contraseña SMTP
// =============================================================

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { defineSecret } = require('firebase-functions/params');
const { setGlobalOptions, logger } = require('firebase-functions/v2');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

admin.initializeApp();
const db = admin.firestore();

// Región europea para latencia y soberanía de datos
setGlobalOptions({ region: 'europe-west1', maxInstances: 10 });

// Secretos (asignados con `firebase functions:secrets:set SMTP_USER` etc.)
const SMTP_USER = defineSecret('SMTP_USER');
const SMTP_PASS = defineSecret('SMTP_PASS');

const SMTP_HOST = 'smtp.ionos.es';
const SMTP_PORT = 465;
const SMTP_FROM_NAME = 'NOVAPACK Logística';
const OUTGOING_BATCH_MAX = 20;
const SMTP_BCC = ''; // opcional: si quieres recibir copia de TODO

function looksLikeHtml(s) {
    return typeof s === 'string' && /<(html|body|table|div|p|br|h[1-6]|strong|a\s)/i.test(s);
}

// =============================================================
// Núcleo: procesa la cola /mailbox status='queued' o 'outgoing'
// =============================================================
async function processQueue() {
    const user = SMTP_USER.value();
    const pass = SMTP_PASS.value();

    if (!user || !pass) {
        logger.error('SMTP credentials missing — define secrets SMTP_USER and SMTP_PASS');
        return { sent: 0, failed: 0, skipped: 0, error: 'missing_credentials' };
    }

    const transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: true,
        auth: { user, pass },
        connectionTimeout: 20000,
        socketTimeout: 30000
    });

    try {
        await transporter.verify();
        logger.info(`SMTP connected ${SMTP_HOST}:${SMTP_PORT} as ${user}`);
    } catch (e) {
        logger.error('SMTP verify FAILED', { msg: e.message });
        return { sent: 0, failed: 0, skipped: 0, error: e.message };
    }

    // Cola: status='queued' o 'outgoing' (legacy)
    let queueDocs = [];
    const q1 = await db.collection('mailbox').where('status', '==', 'queued').limit(OUTGOING_BATCH_MAX).get();
    q1.forEach(d => queueDocs.push({ id: d.id, ref: d.ref, ...d.data() }));
    if (queueDocs.length < OUTGOING_BATCH_MAX) {
        const q2 = await db.collection('mailbox').where('status', '==', 'outgoing').limit(OUTGOING_BATCH_MAX - queueDocs.length).get();
        q2.forEach(d => queueDocs.push({ id: d.id, ref: d.ref, ...d.data() }));
    }

    if (!queueDocs.length) {
        logger.info('cola vacía');
        return { sent: 0, failed: 0, skipped: 0 };
    }
    logger.info(`procesando ${queueDocs.length} correos`);

    let sent = 0, failed = 0, skipped = 0;
    for (const doc of queueDocs) {
        const id = doc.id;
        const to = (doc.to || '').trim();
        const subject = (doc.subject || '(sin asunto)').trim();
        const body = doc.body || '';

        // ── Correos de bienvenida enviados manualmente vía mailto ───────────
        // Cuando el admin pulsa ✉️, se abre el cliente de correo del admin
        // (mailto:) Y se graba un doc en /mailbox para trazabilidad. Estos docs
        // tienen sentVia='mailto_admin'. El SMTP no debe volver a enviarlos:
        // el destinatario ya los recibió del cliente de correo del admin.
        if (doc.sentVia === 'mailto_admin') {
            await doc.ref.update({
                status: 'sent_manual',
                skippedAt: admin.firestore.FieldValue.serverTimestamp(),
                skipReason: 'Enviado manualmente por el admin vía mailto. El motor SMTP no debe duplicarlo.'
            }).catch(() => {});
            skipped++;
            continue;
        }

        if (!to || !to.includes('@')) {
            await doc.ref.update({
                status: 'failed',
                errorMessage: 'Destinatario inválido o vacío',
                errorCode: 'BAD_RECIPIENT',
                failedAt: admin.firestore.FieldValue.serverTimestamp()
            }).catch(() => {});
            failed++;
            continue;
        }

        // Compare-and-swap: marcar 'sending' atómicamente
        try {
            const fresh = await doc.ref.get();
            const st = (fresh.exists && fresh.data().status) || '';
            if (st !== 'queued' && st !== 'outgoing') { skipped++; continue; }
            await doc.ref.update({
                status: 'sending',
                sendingAt: admin.firestore.FieldValue.serverTimestamp(),
                sendingBy: 'cloud_function'
            });
        } catch (e) {
            logger.warn(`no pude marcar sending ${id}`, { msg: e.message });
            skipped++;
            continue;
        }

        const isHtml = looksLikeHtml(body);
        const mailOpts = {
            from: `"${SMTP_FROM_NAME}" <${user}>`,
            to,
            subject,
            bcc: SMTP_BCC && SMTP_BCC !== to ? SMTP_BCC : undefined
        };
        if (isHtml) mailOpts.html = body;
        else mailOpts.text = body;

        // Adjuntos (URL HTTPS o base64)
        if (Array.isArray(doc.attachments) && doc.attachments.length > 0) {
            mailOpts.attachments = doc.attachments.map(a => {
                if (!a) return null;
                if (a.contentBase64) {
                    return {
                        filename: a.filename || 'adjunto',
                        content: Buffer.from(a.contentBase64, 'base64'),
                        contentType: a.contentType || 'application/octet-stream'
                    };
                }
                if (a.url) {
                    return {
                        filename: a.filename || 'adjunto.pdf',
                        path: a.url,
                        contentType: a.contentType || 'application/pdf'
                    };
                }
                return null;
            }).filter(Boolean);
        }

        try {
            const info = await transporter.sendMail(mailOpts);
            await doc.ref.update({
                status: 'sent',
                sentAt: admin.firestore.FieldValue.serverTimestamp(),
                smtpMessageId: info.messageId || null,
                smtpResponse: (info.response || '').toString().slice(0, 500),
                sentVia: 'cloud_function'
            });

            // Tracking de tipos especiales
            try {
                if (doc.clientId && (doc.type === 'outgoing_welcome' || doc.type === 'outgoing_pod')) {
                    await db.collection('users').doc(doc.clientId).set({
                        welcomeDeliveredAt: admin.firestore.FieldValue.serverTimestamp()
                    }, { merge: true });
                }
                if (doc.type === 'invoice_email' && doc.invoiceDocId) {
                    await db.collection('invoices').doc(doc.invoiceDocId).update({
                        emailSentAt: admin.firestore.FieldValue.serverTimestamp(),
                        emailSentTo: to,
                        emailSmtpId: info.messageId || null
                    });
                }
            } catch (e) {
                logger.warn('tracking update fail', { id, msg: e.message });
            }

            logger.info(`Sent ${doc.type || 'mail'} → ${to} ✅`, { messageId: info.messageId });
            sent++;
        } catch (e) {
            await doc.ref.update({
                status: 'failed',
                errorMessage: e.message || 'unknown',
                errorCode: e.code || 'SMTP_ERROR',
                failedAt: admin.firestore.FieldValue.serverTimestamp(),
                retries: (doc.retries || 0) + 1
            }).catch(() => {});
            logger.error(`Failed ${id} → ${to}`, { msg: e.message });
            failed++;
        }
    }

    return { sent, failed, skipped, processed: queueDocs.length };
}

// =============================================================
// SCHEDULER cada 2 min — always-on procesado de cola
// =============================================================
exports.processMailboxQueue = onSchedule({
    schedule: 'every 2 minutes',
    timeZone: 'Europe/Madrid',
    secrets: [SMTP_USER, SMTP_PASS],
    timeoutSeconds: 300,
    memory: '256MiB'
}, async (event) => {
    const result = await processQueue();
    logger.info('scheduler tick', result);
});

// =============================================================
// CALLABLE HTTP — botón "🚀 Flush ahora" desde admin
// (cualquier admin autenticado puede forzar una pasada)
// =============================================================
exports.flushMailboxNow = onCall({
    secrets: [SMTP_USER, SMTP_PASS],
    timeoutSeconds: 300,
    memory: '256MiB'
}, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Debes estar autenticado');
    }
    const result = await processQueue();
    logger.info('manual flush by user', { uid: request.auth.uid, result });
    return result;
});

// =============================================================
// HEALTH CHECK — devuelve stats de la cola sin enviar nada
// Útil para widget de salud en admin
// =============================================================
exports.mailboxHealth = onCall({
    timeoutSeconds: 30
}, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Debes estar autenticado');
    }
    const [queuedSnap, failedSnap, sendingSnap] = await Promise.all([
        db.collection('mailbox').where('status', '==', 'queued').limit(100).get(),
        db.collection('mailbox').where('status', '==', 'failed').limit(50).get(),
        db.collection('mailbox').where('status', '==', 'sending').limit(50).get()
    ]);

    let oldestQueued = null;
    queuedSnap.forEach(d => {
        const ca = d.data().createdAt;
        if (ca && ca.toDate) {
            const ts = ca.toDate().getTime();
            if (!oldestQueued || ts < oldestQueued) oldestQueued = ts;
        }
    });

    return {
        queued: queuedSnap.size,
        failed: failedSnap.size,
        sending: sendingSnap.size,
        oldestQueuedMs: oldestQueued,
        oldestQueuedAgeMin: oldestQueued ? Math.floor((Date.now() - oldestQueued) / 60000) : 0,
        timestamp: Date.now()
    };
});

// =============================================================
// UPDATE CLIENT AUTH — actualiza email y/o contraseña de una
// cuenta Firebase Auth existente sin crear una nueva ni dejar
// cuentas huérfanas.  Solo el admin puede llamar esto.
// =============================================================
exports.updateClientAuth = onCall({
    timeoutSeconds: 30
}, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Debes estar autenticado');
    }

    // Verificar que quien llama ES el admin registrado en config/admin
    const adminDoc = await db.collection('config').doc('admin').get();
    if (!adminDoc.exists || adminDoc.data().uid !== request.auth.uid) {
        throw new HttpsError('permission-denied', 'Solo el administrador puede cambiar credenciales de clientes');
    }

    const { uid, newEmail, newPassword } = request.data || {};
    if (!uid) throw new HttpsError('invalid-argument', 'uid requerido');

    const updates = {};
    if (newEmail && newEmail.trim()) updates.email = newEmail.trim().toLowerCase();
    if (newPassword && newPassword.trim()) updates.password = newPassword.trim();
    if (Object.keys(updates).length === 0) {
        throw new HttpsError('invalid-argument', 'Debes indicar al menos newEmail o newPassword');
    }

    try {
        await admin.auth().updateUser(uid, updates);
    } catch (e) {
        if (e.code === 'auth/email-already-exists') {
            throw new HttpsError('already-exists', 'Ese email ya está en uso por otra cuenta Firebase Auth');
        }
        throw new HttpsError('internal', e.message || 'Error actualizando Auth');
    }

    logger.info('updateClientAuth ok', { uid, changedEmail: !!updates.email, changedPassword: !!updates.password, by: request.auth.uid });
    return { success: true, changedEmail: !!updates.email, changedPassword: !!updates.password };
});

// =============================================================
// VERIFACTU — FASE 1 (RD 1007/2023 + Orden HAC/1177/2024)
// =============================================================
// Cada factura creada en /invoices se sella automáticamente con
// una huella SHA-256 encadenada a la anterior (registro de alta).
// Al mover una factura a la papelera (/deleted_invoices) se
// genera un registro de anulación, también encadenado.
//
// - Cadena de huellas: verifactu_chains/{nif} — UNA CADENA POR
//   EMPRESA emisora (obligado tributario), como exige la Orden
//   HAC/1177/2024 en sistemas multi-empresa.
// - Ledger append-only: /verifactu_registros (alta + anulación)
//   con estadoEnvioAEAT='pendiente' para la FASE 2 (remisión).
// - El QR tributario del PDF se genera en frontend (verifactu.js)
//   y NO depende de la huella (solo NIF, nº serie, fecha, importe).
// =============================================================

function vfRound2(n) {
    return Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100;
}
function vfImporte(n) {
    return vfRound2(n).toFixed(2);
}
function vfNif(raw) {
    return String(raw || '').replace(/[\s.\-]/g, '').toUpperCase();
}
function vfSha256(str) {
    return crypto.createHash('sha256').update(str, 'utf8').digest('hex').toUpperCase();
}

// ISO 8601 con huso horario de España: 2026-07-15T12:34:56+02:00
function vfMadridNowISO(d) {
    const date = d || new Date();
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Madrid',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false
    }).formatToParts(date).reduce((o, p) => { o[p.type] = p.value; return o; }, {});
    const hh = parts.hour === '24' ? '00' : parts.hour;
    // Offset real Madrid↔UTC en el instante dado (+01:00 invierno, +02:00 verano)
    const asUTC = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +hh, +parts.minute, +parts.second);
    const offsetMin = Math.round((asUTC - date.getTime()) / 60000);
    const sign = offsetMin >= 0 ? '+' : '-';
    const abs = Math.abs(offsetMin);
    const oh = String(Math.floor(abs / 60)).padStart(2, '0');
    const om = String(abs % 60).padStart(2, '0');
    return `${parts.year}-${parts.month}-${parts.day}T${hh}:${parts.minute}:${parts.second}${sign}${oh}:${om}`;
}

// dd-mm-yyyy (huso Madrid) desde Timestamp Firestore / Date / string
function vfFechaExpedicion(v) {
    let date = null;
    if (v && typeof v.toDate === 'function') date = v.toDate();
    else if (v instanceof Date) date = v;
    else if (v) { const t = new Date(v); if (!isNaN(t.getTime())) date = t; }
    if (!date) date = new Date();
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(date).reduce((o, p) => { o[p.type] = p.value; return o; }, {});
    return `${parts.day}-${parts.month}-${parts.year}`;
}

// F1 estándar; R1-R5 para rectificativas/abonos
function vfTipoFactura(inv) {
    if (inv.serie === 'R' || inv.isCredit || inv.isAbono) {
        const c = String(inv.rectificaCodigo || inv.motivoRectificacion || '').toUpperCase();
        return ['R1', 'R2', 'R3', 'R4', 'R5'].includes(c) ? c : 'R1';
    }
    return 'F1';
}

// ¿Parece un NIF/CIF español? (clientCIF a veces guarda el Nº de cliente)
function vfLooksLikeNif(s) {
    const v = vfNif(s);
    return /^[A-Z0-9]{8,9}$/.test(v) && /[A-Z]/.test(v);
}

// Resuelve nombre y NIF fiscal del destinatario. clientCIF no es fiable en
// todos los flujos (a veces es el nº interno de cliente) → fallback a la
// ficha del cliente en /users. Necesario para el XML de remisión (FASE 2).
async function vfResolveDestinatario(inv) {
    const dest = { nombre: inv.clientName || '', nif: '', avisos: [] };
    if (vfLooksLikeNif(inv.clientCIF)) {
        dest.nif = vfNif(inv.clientCIF);
        return dest;
    }
    if (inv.clientId) {
        try {
            const uSnap = await db.collection('users').doc(String(inv.clientId)).get();
            if (uSnap.exists) {
                const u = uSnap.data();
                const candidate = u.nif || u.cif || '';
                if (vfLooksLikeNif(candidate)) {
                    dest.nif = vfNif(candidate);
                    if (!dest.nombre) dest.nombre = u.name || '';
                    return dest;
                }
            }
        } catch (e) {
            logger.warn('verifactu: lookup destinatario falló', { clientId: inv.clientId, msg: e.message });
        }
    }
    dest.avisos.push('sin_nif_destinatario');
    return dest;
}

// ── Registro de ALTA: se sella cada factura nueva ────────────────
exports.verifactuStampInvoice = onDocumentCreated({
    document: 'invoices/{docId}',
    memory: '256MiB',
    timeoutSeconds: 60
}, async (event) => {
    const snap = event.data;
    if (!snap) return;
    const inv = snap.data() || {};

    // Restauración desde papelera: ya tiene huella, no re-sellar
    if (inv.verifactu && inv.verifactu.huella) {
        logger.info(`verifactu: ${event.params.docId} ya sellada (restauración) — skip`);
        return;
    }

    // Cadena independiente por empresa emisora (obligado tributario)
    const nif = vfNif(inv.senderData && inv.senderData.cif);
    const headRef = db.collection('verifactu_chains').doc(nif || 'SIN_NIF');
    const ledgerRef = db.collection('verifactu_registros').doc();

    // Destinatario con NIF fiscal real (lookup a /users si hace falta) — FASE 2
    const destinatario = await vfResolveDestinatario(inv);

    try {
        await db.runTransaction(async (tx) => {
            const [head, invSnap] = await Promise.all([tx.get(headRef), tx.get(snap.ref)]);
            if (!invSnap.exists) return;                       // anulada antes de sellar
            if ((invSnap.data().verifactu || {}).huella) return; // sellada en otro intento

            const prev = (head.exists && head.data().lastHuella) || '';
            const idx = ((head.exists && head.data().chainIndex) || 0) + 1;

            const numSerie = String(inv.invoiceId || event.params.docId);
            const fechaExp = vfFechaExpedicion(inv.date || inv.createdAt);
            const tipo = vfTipoFactura(inv);
            const cuota = vfImporte(inv.iva);
            // ImporteTotal Verifactu = base + cuota IVA (sin retención IRPF)
            const importe = vfImporte((Number(inv.subtotal) || 0) + (Number(inv.iva) || 0));
            const fechaHora = vfMadridNowISO();

            // Cadena de entrada de la huella — orden y formato normativos
            // (Orden HAC/1177/2024, anexo I, registro de alta)
            const cadena =
                'IDEmisorFactura=' + nif +
                '&NumSerieFactura=' + numSerie +
                '&FechaExpedicionFactura=' + fechaExp +
                '&TipoFactura=' + tipo +
                '&CuotaTotal=' + cuota +
                '&ImporteTotal=' + importe +
                '&Huella=' + prev +
                '&FechaHoraHusoGenRegistro=' + fechaHora;
            const huella = vfSha256(cadena);

            tx.set(ledgerRef, {
                tipoRegistro: 'alta',
                invoiceDocId: event.params.docId,
                idEmisorFactura: nif,
                nombreRazonEmisor: (inv.senderData && inv.senderData.name) || '',
                numSerieFactura: numSerie,
                fechaExpedicionFactura: fechaExp,
                tipoFactura: tipo,
                // Desglose para el XML de remisión (FASE 2)
                baseImponible: vfImporte(inv.subtotal),
                tipoImpositivo: Number(inv.ivaRate) || 21,
                cuotaTotal: cuota,
                importeTotal: importe,
                descripcionOperacion: 'Servicios de transporte y logística',
                destinatarioNombre: destinatario.nombre,
                destinatarioNif: destinatario.nif,
                avisos: destinatario.avisos,
                huella,
                huellaAnterior: prev,
                fechaHoraHusoGenRegistro: fechaHora,
                chainIndex: idx,
                estadoEnvioAEAT: 'pendiente', // FASE 2: remisión a AEAT
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
            tx.update(snap.ref, {
                verifactu: {
                    huella,
                    huellaAnterior: prev,
                    fechaHoraHusoGenRegistro: fechaHora,
                    tipoFactura: tipo,
                    chainIndex: idx,
                    registroId: ledgerRef.id
                }
            });
            tx.set(headRef, {
                nif: nif || 'SIN_NIF',
                lastHuella: huella,
                chainIndex: idx,
                lastNumSerie: numSerie,
                lastRegistroId: ledgerRef.id,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        });
        logger.info(`verifactu alta OK → ${event.params.docId}`);
    } catch (e) {
        logger.error(`verifactu alta FAILED ${event.params.docId}`, { msg: e.message });
    }
});

// ── Registro de ANULACIÓN: factura movida a la papelera ──────────
exports.verifactuStampAnulacion = onDocumentCreated({
    document: 'deleted_invoices/{docId}',
    memory: '256MiB',
    timeoutSeconds: 60
}, async (event) => {
    const snap = event.data;
    if (!snap) return;
    const inv = snap.data() || {};
    if (!inv.invoiceId) return; // no era una factura real
    if (inv.verifactuAnulacion && inv.verifactuAnulacion.huella) return;

    // Cadena independiente por empresa emisora (obligado tributario)
    const nif = vfNif(inv.senderData && inv.senderData.cif);
    const headRef = db.collection('verifactu_chains').doc(nif || 'SIN_NIF');
    const ledgerRef = db.collection('verifactu_registros').doc();

    try {
        await db.runTransaction(async (tx) => {
            const [head, delSnap] = await Promise.all([tx.get(headRef), tx.get(snap.ref)]);

            const prev = (head.exists && head.data().lastHuella) || '';
            const idx = ((head.exists && head.data().chainIndex) || 0) + 1;

            const numSerie = String(inv.invoiceId);
            const fechaExp = vfFechaExpedicion(inv.date || inv.createdAt);
            const fechaHora = vfMadridNowISO();

            // Cadena del registro de anulación (Orden HAC/1177/2024, anexo I)
            const cadena =
                'IDEmisorFacturaAnulada=' + nif +
                '&NumSerieFacturaAnulada=' + numSerie +
                '&FechaExpedicionFacturaAnulada=' + fechaExp +
                '&Huella=' + prev +
                '&FechaHoraHusoGenRegistro=' + fechaHora;
            const huella = vfSha256(cadena);

            tx.set(ledgerRef, {
                tipoRegistro: 'anulacion',
                invoiceDocId: event.params.docId,
                idEmisorFactura: nif,
                numSerieFactura: numSerie,
                fechaExpedicionFactura: fechaExp,
                huella,
                huellaAnterior: prev,
                fechaHoraHusoGenRegistro: fechaHora,
                chainIndex: idx,
                estadoEnvioAEAT: 'pendiente', // FASE 2
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
            // El registro del ledger es lo esencial; el doc de papelera
            // puede haber sido purgado en el intervalo
            if (delSnap.exists) {
                tx.update(snap.ref, {
                    verifactuAnulacion: {
                        huella,
                        huellaAnterior: prev,
                        fechaHoraHusoGenRegistro: fechaHora,
                        chainIndex: idx,
                        registroId: ledgerRef.id
                    }
                });
            }
            tx.set(headRef, {
                nif: nif || 'SIN_NIF',
                lastHuella: huella,
                chainIndex: idx,
                lastNumSerie: numSerie,
                lastRegistroId: ledgerRef.id,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        });
        logger.info(`verifactu anulación OK → ${event.params.docId}`);
    } catch (e) {
        logger.error(`verifactu anulación FAILED ${event.params.docId}`, { msg: e.message });
    }
});
