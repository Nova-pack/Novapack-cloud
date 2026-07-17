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
const https = require('https');

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
                if (doc.type === 'outgoing_welcome') {
                    // Bienvenida ENTREGADA → marcar entrega y BORRAR la
                    // contraseña en claro de todos los clientes del email
                    // (clientIds en el consolidado; clientId en el individual).
                    const ids = (Array.isArray(doc.clientIds) && doc.clientIds.length > 0)
                        ? doc.clientIds
                        : (doc.clientId ? [doc.clientId] : []);
                    for (const cid of ids) {
                        await db.collection('users').doc(String(cid)).set({
                            welcomeDeliveredAt: admin.firestore.FieldValue.serverTimestamp(),
                            loginPasswordPlain: admin.firestore.FieldValue.delete()
                        }, { merge: true }).catch(e => {
                            logger.warn(`welcome delivered: no pude actualizar users/${cid}`, { msg: e.message });
                        });
                    }
                } else if (doc.clientId && doc.type === 'outgoing_pod') {
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

// =============================================================
// VERIFACTU — FASE 2: REMISIÓN DE REGISTROS A LA AEAT
// =============================================================
// Envía los registros de /verifactu_registros (estadoEnvioAEAT=
// 'pendiente') a la sede electrónica de la AEAT, agrupados por
// empresa emisora (un envío por NIF), autenticando con el
// certificado electrónico de CADA empresa (mTLS).
//
// ACTIVACIÓN (ver tools/verifactu/ACTIVACION_FASE2.md):
//   1. Secret VERIFACTU_CERTS = JSON {"<NIF>":{"pfxBase64":"...",
//      "passphrase":"..."}, ...}  (uno por empresa)
//   2. Firestore config/verifactu_sif = datos del productor del
//      software (bloque SistemaInformatico del XML)
//   3. Firestore config/verifactu_envio = { activo: true,
//      entorno: 'pruebas' }  → probar → { entorno: 'produccion' }
//
// Mientras config/verifactu_envio.activo != true, el scheduler
// no hace nada (gate seguro).
// =============================================================

const VERIFACTU_CERTS = defineSecret('VERIFACTU_CERTS');

const VF_ENDPOINTS = {
    pruebas: 'https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP',
    produccion: 'https://www1.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP'
};
const VF_NS_LR = 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroLR.xsd';
const VF_NS_SI = 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroInformacion.xsd';
const VF_BATCH_MAX = 100; // registros por envío (límite AEAT: 1000)

function vfXml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

// Bloque SistemaInformatico (común a alta y anulación)
function vfXmlSistema(sif) {
    return ''
        + '<sum1:SistemaInformatico>'
        + '<sum1:NombreRazon>' + vfXml(sif.nombreRazonProductor) + '</sum1:NombreRazon>'
        + '<sum1:NIF>' + vfXml(sif.nifProductor) + '</sum1:NIF>'
        + '<sum1:NombreSistemaInformatico>' + vfXml(sif.nombreSistema || 'NOVAPACK CLOUD') + '</sum1:NombreSistemaInformatico>'
        + '<sum1:IdSistemaInformatico>' + vfXml(sif.idSistema || 'NP') + '</sum1:IdSistemaInformatico>'
        + '<sum1:Version>' + vfXml(sif.version || '2.2') + '</sum1:Version>'
        + '<sum1:NumeroInstalacion>' + vfXml(sif.numeroInstalacion || '0001') + '</sum1:NumeroInstalacion>'
        + '<sum1:TipoUsoPosibleSoloVerifactu>S</sum1:TipoUsoPosibleSoloVerifactu>'
        + '<sum1:TipoUsoPosibleMultiOT>S</sum1:TipoUsoPosibleMultiOT>'
        + '<sum1:IndicadorMultiplesOT>S</sum1:IndicadorMultiplesOT>'
        + '</sum1:SistemaInformatico>';
}

// Bloque Encadenamiento a partir del registro anterior de la cadena
function vfXmlEncadenamiento(reg, prevReg) {
    if (!reg.huellaAnterior) {
        return '<sum1:Encadenamiento><sum1:PrimerRegistro>S</sum1:PrimerRegistro></sum1:Encadenamiento>';
    }
    // Si no localizamos el registro anterior completo, referenciamos solo la huella
    const p = prevReg || {};
    return ''
        + '<sum1:Encadenamiento><sum1:RegistroAnterior>'
        + '<sum1:IDEmisorFactura>' + vfXml(p.idEmisorFactura || reg.idEmisorFactura) + '</sum1:IDEmisorFactura>'
        + '<sum1:NumSerieFactura>' + vfXml(p.numSerieFactura || '') + '</sum1:NumSerieFactura>'
        + '<sum1:FechaExpedicionFactura>' + vfXml(p.fechaExpedicionFactura || '') + '</sum1:FechaExpedicionFactura>'
        + '<sum1:Huella>' + vfXml(reg.huellaAnterior) + '</sum1:Huella>'
        + '</sum1:RegistroAnterior></sum1:Encadenamiento>';
}

// XML de un registro de ALTA
function vfXmlRegistroAlta(reg, prevReg, sif) {
    const esRectificativa = /^R[1-5]$/.test(reg.tipoFactura || '');
    const base = reg.baseImponible != null ? reg.baseImponible
        : (Number(reg.importeTotal || 0) - Number(reg.cuotaTotal || 0)).toFixed(2);
    const tipoIVA = reg.tipoImpositivo != null ? reg.tipoImpositivo : 21;

    let destinatarios = '';
    if (reg.destinatarioNif) {
        destinatarios = ''
            + '<sum1:Destinatarios><sum1:IDDestinatario>'
            + '<sum1:NombreRazon>' + vfXml(reg.destinatarioNombre || 'Cliente') + '</sum1:NombreRazon>'
            + '<sum1:NIF>' + vfXml(reg.destinatarioNif) + '</sum1:NIF>'
            + '</sum1:IDDestinatario></sum1:Destinatarios>';
    }

    return ''
        + '<sum1:RegistroAlta>'
        + '<sum1:IDVersion>1.0</sum1:IDVersion>'
        + '<sum1:IDFactura>'
        + '<sum1:IDEmisorFactura>' + vfXml(reg.idEmisorFactura) + '</sum1:IDEmisorFactura>'
        + '<sum1:NumSerieFactura>' + vfXml(reg.numSerieFactura) + '</sum1:NumSerieFactura>'
        + '<sum1:FechaExpedicionFactura>' + vfXml(reg.fechaExpedicionFactura) + '</sum1:FechaExpedicionFactura>'
        + '</sum1:IDFactura>'
        + '<sum1:NombreRazonEmisor>' + vfXml(reg.nombreRazonEmisor || '') + '</sum1:NombreRazonEmisor>'
        + '<sum1:TipoFactura>' + vfXml(reg.tipoFactura || 'F1') + '</sum1:TipoFactura>'
        + (esRectificativa ? '<sum1:TipoRectificativa>I</sum1:TipoRectificativa>' : '')
        + '<sum1:DescripcionOperacion>' + vfXml(reg.descripcionOperacion || 'Servicios de transporte y logística') + '</sum1:DescripcionOperacion>'
        + destinatarios
        + '<sum1:Desglose><sum1:DetalleDesglose>'
        + '<sum1:Impuesto>01</sum1:Impuesto>'
        + '<sum1:ClaveRegimen>01</sum1:ClaveRegimen>'
        + '<sum1:CalificacionOperacion>S1</sum1:CalificacionOperacion>'
        + '<sum1:TipoImpositivo>' + vfXml(tipoIVA) + '</sum1:TipoImpositivo>'
        + '<sum1:BaseImponibleOimporteNoSujeto>' + vfXml(base) + '</sum1:BaseImponibleOimporteNoSujeto>'
        + '<sum1:CuotaRepercutida>' + vfXml(reg.cuotaTotal) + '</sum1:CuotaRepercutida>'
        + '</sum1:DetalleDesglose></sum1:Desglose>'
        + '<sum1:CuotaTotal>' + vfXml(reg.cuotaTotal) + '</sum1:CuotaTotal>'
        + '<sum1:ImporteTotal>' + vfXml(reg.importeTotal) + '</sum1:ImporteTotal>'
        + vfXmlEncadenamiento(reg, prevReg)
        + vfXmlSistema(sif)
        + '<sum1:FechaHoraHusoGenRegistro>' + vfXml(reg.fechaHoraHusoGenRegistro) + '</sum1:FechaHoraHusoGenRegistro>'
        + '<sum1:TipoHuella>01</sum1:TipoHuella>'
        + '<sum1:Huella>' + vfXml(reg.huella) + '</sum1:Huella>'
        + '</sum1:RegistroAlta>';
}

// XML de un registro de ANULACIÓN
function vfXmlRegistroAnulacion(reg, prevReg, sif) {
    return ''
        + '<sum1:RegistroAnulacion>'
        + '<sum1:IDVersion>1.0</sum1:IDVersion>'
        + '<sum1:IDFactura>'
        + '<sum1:IDEmisorFacturaAnulada>' + vfXml(reg.idEmisorFactura) + '</sum1:IDEmisorFacturaAnulada>'
        + '<sum1:NumSerieFacturaAnulada>' + vfXml(reg.numSerieFactura) + '</sum1:NumSerieFacturaAnulada>'
        + '<sum1:FechaExpedicionFacturaAnulada>' + vfXml(reg.fechaExpedicionFactura) + '</sum1:FechaExpedicionFacturaAnulada>'
        + '</sum1:IDFactura>'
        + vfXmlEncadenamiento(reg, prevReg)
        + vfXmlSistema(sif)
        + '<sum1:FechaHoraHusoGenRegistro>' + vfXml(reg.fechaHoraHusoGenRegistro) + '</sum1:FechaHoraHusoGenRegistro>'
        + '<sum1:TipoHuella>01</sum1:TipoHuella>'
        + '<sum1:Huella>' + vfXml(reg.huella) + '</sum1:Huella>'
        + '</sum1:RegistroAnulacion>';
}

// Sobre SOAP completo para UNA empresa
function vfBuildEnvelope(nif, nombreRazon, registrosXml) {
    return ''
        + '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:sum="' + VF_NS_LR + '" xmlns:sum1="' + VF_NS_SI + '">'
        + '<soapenv:Header/><soapenv:Body>'
        + '<sum:RegFactuSistemaFacturacion>'
        + '<sum:Cabecera><sum1:ObligadoEmision>'
        + '<sum1:NombreRazon>' + vfXml(nombreRazon) + '</sum1:NombreRazon>'
        + '<sum1:NIF>' + vfXml(nif) + '</sum1:NIF>'
        + '</sum1:ObligadoEmision></sum:Cabecera>'
        + registrosXml.map(x => '<sum:RegistroFactura>' + x + '</sum:RegistroFactura>').join('')
        + '</sum:RegFactuSistemaFacturacion>'
        + '</soapenv:Body></soapenv:Envelope>';
}

// POST SOAP con mTLS (certificado de la empresa)
function vfPostSoap(urlStr, xml, pfxBuffer, passphrase) {
    return new Promise((resolve, reject) => {
        const u = new URL(urlStr);
        const req = https.request({
            hostname: u.hostname,
            path: u.pathname + (u.search || ''),
            method: 'POST',
            pfx: pfxBuffer,
            passphrase: passphrase,
            headers: {
                'Content-Type': 'text/xml; charset=UTF-8',
                'SOAPAction': '',
                'Content-Length': Buffer.byteLength(xml, 'utf8')
            },
            timeout: 60000
        }, (res) => {
            let data = '';
            res.on('data', (c) => { data += c; });
            res.on('end', () => resolve({ status: res.statusCode, body: data }));
        });
        req.on('error', reject);
        req.on('timeout', () => req.destroy(new Error('Timeout conectando con AEAT')));
        req.write(xml, 'utf8');
        req.end();
    });
}

// Parseo de la respuesta AEAT (regex tolerante a prefijos de namespace)
function vfTag(xml, tag) {
    const m = xml.match(new RegExp('<(?:\\w+:)?' + tag + '>([\\s\\S]*?)</(?:\\w+:)?' + tag + '>'));
    return m ? m[1].trim() : '';
}
function vfParseRespuesta(xml) {
    const lineas = [];
    const re = /<(?:\w+:)?RespuestaLinea>([\s\S]*?)<\/(?:\w+:)?RespuestaLinea>/g;
    let m;
    while ((m = re.exec(xml)) !== null) {
        const l = m[1];
        lineas.push({
            numSerieFactura: vfTag(l, 'NumSerieFactura') || vfTag(l, 'NumSerieFacturaAnulada'),
            estadoRegistro: vfTag(l, 'EstadoRegistro'),
            codigoError: vfTag(l, 'CodigoErrorRegistro'),
            descripcionError: vfTag(l, 'DescripcionErrorRegistro')
        });
    }
    return {
        estadoEnvio: vfTag(xml, 'EstadoEnvio'),
        csv: vfTag(xml, 'CSV'),
        tiempoEspera: parseInt(vfTag(xml, 'TiempoEsperaEnvio'), 10) || 60,
        lineas
    };
}

// Registro anterior de la cadena (para el bloque Encadenamiento)
async function vfGetRegistroAnterior(nif, chainIndex, batchMap) {
    if (!chainIndex || chainIndex <= 1) return null;
    if (batchMap && batchMap.has(chainIndex - 1)) return batchMap.get(chainIndex - 1);
    const q = await db.collection('verifactu_registros')
        .where('idEmisorFactura', '==', nif)
        .where('chainIndex', '==', chainIndex - 1)
        .limit(1).get();
    return q.empty ? null : q.docs[0].data();
}

// ── Núcleo del envío ─────────────────────────────────────────
async function vfProcessPending(triggeredBy) {
    // Gate: solo si el envío está activado explícitamente
    const cfgSnap = await db.collection('config').doc('verifactu_envio').get();
    const cfg = cfgSnap.exists ? cfgSnap.data() : {};
    if (cfg.activo !== true) {
        return { skipped: true, reason: 'envio_no_activado' };
    }
    const entorno = cfg.entorno === 'produccion' ? 'produccion' : 'pruebas';
    const endpoint = VF_ENDPOINTS[entorno];

    // Respetar TiempoEsperaEnvio de la AEAT
    const now = Date.now();
    if (cfg.lastSendAt && cfg.tiempoEsperaSegundos) {
        const nextAllowed = cfg.lastSendAt.toMillis() + cfg.tiempoEsperaSegundos * 1000;
        if (now < nextAllowed) {
            return { skipped: true, reason: 'espera_flujo', segundosRestantes: Math.ceil((nextAllowed - now) / 1000) };
        }
    }

    // Datos del productor (bloque SistemaInformatico)
    const sifSnap = await db.collection('config').doc('verifactu_sif').get();
    if (!sifSnap.exists || !sifSnap.data().nifProductor) {
        logger.error('verifactu envío: falta config/verifactu_sif (datos del productor)');
        return { error: 'falta_config_sif' };
    }
    const sif = sifSnap.data();

    // Certificados por empresa
    let certs = {};
    try {
        certs = JSON.parse(VERIFACTU_CERTS.value() || '{}');
    } catch (e) {
        logger.error('verifactu envío: VERIFACTU_CERTS no es JSON válido');
        return { error: 'certs_invalidos' };
    }

    // Registros pendientes, agrupados por empresa y ordenados por cadena
    const pendSnap = await db.collection('verifactu_registros')
        .where('estadoEnvioAEAT', '==', 'pendiente')
        .limit(500).get();
    if (pendSnap.empty) return { sent: 0, reason: 'sin_pendientes' };

    const porNif = {};
    pendSnap.forEach(d => {
        const r = d.data(); r._ref = d.ref;
        const nif = r.idEmisorFactura || 'SIN_NIF';
        (porNif[nif] = porNif[nif] || []).push(r);
    });

    const resumen = { entorno, empresas: {}, sent: 0, rechazados: 0, bloqueados: 0 };
    let ultimoTiempoEspera = 60;

    for (const nif of Object.keys(porNif)) {
        const grupo = porNif[nif].sort((a, b) => (a.chainIndex || 0) - (b.chainIndex || 0)).slice(0, VF_BATCH_MAX);

        if (!nif || nif === 'SIN_NIF') {
            for (const r of grupo) {
                await r._ref.update({ estadoEnvioAEAT: 'bloqueado_sin_nif_emisor' });
                resumen.bloqueados++;
            }
            continue;
        }
        const cert = certs[nif];
        if (!cert || !cert.pfxBase64) {
            logger.warn(`verifactu envío: sin certificado para ${nif} — ${grupo.length} registros esperan`);
            resumen.empresas[nif] = { estado: 'sin_certificado', pendientes: grupo.length };
            continue;
        }

        // F1 sin NIF de destinatario → bloquear (AEAT lo rechazaría)
        const enviables = [];
        for (const r of grupo) {
            if (r.tipoRegistro === 'alta' && r.tipoFactura === 'F1' && !r.destinatarioNif) {
                await r._ref.update({
                    estadoEnvioAEAT: 'bloqueado_sin_nif_destinatario',
                    bloqueadoAt: admin.firestore.FieldValue.serverTimestamp()
                });
                resumen.bloqueados++;
            } else {
                enviables.push(r);
            }
        }
        if (!enviables.length) continue;

        // Construir XML (con lookup del registro anterior para Encadenamiento)
        const batchMap = new Map();
        enviables.forEach(r => batchMap.set(r.chainIndex, r));
        const registrosXml = [];
        for (const r of enviables) {
            const prev = await vfGetRegistroAnterior(nif, r.chainIndex, batchMap);
            registrosXml.push(r.tipoRegistro === 'anulacion'
                ? vfXmlRegistroAnulacion(r, prev, sif)
                : vfXmlRegistroAlta(r, prev, sif));
        }
        const nombreRazon = (enviables.find(r => r.nombreRazonEmisor) || {}).nombreRazonEmisor || nif;
        const envelope = vfBuildEnvelope(nif, nombreRazon, registrosXml);

        // Enviar
        let resp;
        try {
            const pfx = Buffer.from(cert.pfxBase64, 'base64');
            resp = await vfPostSoap(endpoint, envelope, pfx, cert.passphrase || '');
        } catch (e) {
            logger.error(`verifactu envío ${nif}: fallo de conexión`, { msg: e.message });
            resumen.empresas[nif] = { estado: 'error_conexion', msg: e.message };
            continue;
        }
        if (resp.status !== 200) {
            logger.error(`verifactu envío ${nif}: HTTP ${resp.status}`, { body: (resp.body || '').slice(0, 800) });
            resumen.empresas[nif] = { estado: 'http_' + resp.status };
            continue;
        }

        // Procesar respuesta línea a línea (mismo orden que el envío)
        const parsed = vfParseRespuesta(resp.body);
        ultimoTiempoEspera = parsed.tiempoEspera || 60;
        let ok = 0, ko = 0;
        for (let i = 0; i < enviables.length; i++) {
            const r = enviables[i];
            const linea = parsed.lineas[i] || parsed.lineas.find(l => l.numSerieFactura === r.numSerieFactura) || {};
            const estado = (linea.estadoRegistro || '').toLowerCase();
            const update = {
                envioEntorno: entorno,
                envioAt: admin.firestore.FieldValue.serverTimestamp(),
                envioCsv: parsed.csv || null,
                envioEstadoLinea: linea.estadoRegistro || '',
                envioCodigoError: linea.codigoError || '',
                envioDescripcionError: linea.descripcionError || ''
            };
            if (estado === 'correcto') {
                update.estadoEnvioAEAT = 'enviado'; ok++;
            } else if (estado === 'aceptadoconerrores') {
                update.estadoEnvioAEAT = 'aceptado_con_errores'; ok++;
            } else if (estado) {
                update.estadoEnvioAEAT = 'rechazado'; ko++;
            } else {
                // sin línea identificable: conservar pendiente para reintento
                update.estadoEnvioAEAT = 'pendiente';
                update.envioSinLinea = true;
            }
            await r._ref.update(update);
        }
        resumen.sent += ok; resumen.rechazados += ko;
        resumen.empresas[nif] = { estado: parsed.estadoEnvio || 'sin_estado', ok, ko, csv: parsed.csv || null };
        logger.info(`verifactu envío ${nif} [${entorno}]: ${parsed.estadoEnvio} — ${ok} ok, ${ko} rechazados`);
    }

    await db.collection('config').doc('verifactu_envio').set({
        lastSendAt: admin.firestore.FieldValue.serverTimestamp(),
        tiempoEsperaSegundos: ultimoTiempoEspera,
        lastResumen: JSON.parse(JSON.stringify(resumen)),
        lastTriggeredBy: triggeredBy || 'scheduler'
    }, { merge: true });

    return resumen;
}

// Scheduler cada 5 min (inofensivo mientras activo != true)
exports.verifactuSendPending = onSchedule({
    schedule: 'every 5 minutes',
    timeZone: 'Europe/Madrid',
    secrets: [VERIFACTU_CERTS],
    timeoutSeconds: 300,
    memory: '256MiB'
}, async () => {
    const r = await vfProcessPending('scheduler');
    if (!r.skipped) logger.info('verifactu scheduler', r);
});

// Disparo manual desde admin (solo administrador)
exports.verifactuSendNow = onCall({
    secrets: [VERIFACTU_CERTS],
    timeoutSeconds: 300,
    memory: '256MiB'
}, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Debes estar autenticado');
    const adminDoc = await db.collection('config').doc('admin').get();
    if (!adminDoc.exists || adminDoc.data().uid !== request.auth.uid) {
        throw new HttpsError('permission-denied', 'Solo el administrador');
    }
    return await vfProcessPending('manual:' + request.auth.uid);
});
