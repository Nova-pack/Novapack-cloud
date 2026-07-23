// =============================================================
// BILLING SERIES — Numeración de facturas POR EMPRESA emisora
// (Verifactu multi-empresa · RD 1619/2012 + Orden HAC/1177/2024)
// =============================================================
// Cada obligado tributario (empresa emisora) debe llevar
// numeración correlativa PROPIA. Formato:
//   FAC-{SERIE}-{YY}-{SEQ}   (también R- y ABO-)
// donde SERIE es un código corto por empresa
// (billing_companies.serieCode, derivado del nombre y persistido
// la primera vez que se usa).
// Contadores: sequence_counters/{tipo}_{NIF}_{YYYY} — cada
// empresa arranca su serie en 1 (es legal iniciar serie nueva a
// mitad de año).
//
// Cargado por admin.html. Define también allocSequentialNumber
// (contador atómico genérico) porque admin.html no carga
// firebase-app.js — misma implementación, no divergir.
// =============================================================

// Contador atómico genérico via transacción Firestore.
// (idéntico al de firebase-app.js — mantener en sincronía)
if (typeof window.allocSequentialNumber !== 'function') {
    window.allocSequentialNumber = async function allocSequentialNumber(counterPath, seedFn) {
        if (!counterPath || typeof counterPath !== 'string') throw new Error('counterPath required');
        const ref = db.doc(counterPath);
        return await db.runTransaction(async (tx) => {
            const snap = await tx.get(ref);
            let next;
            if (snap.exists && typeof snap.data().currentMax === 'number') {
                next = snap.data().currentMax + 1;
            } else {
                const seed = (typeof seedFn === 'function') ? await seedFn() : 0;
                next = (parseInt(seed, 10) || 0) + 1;
            }
            tx.set(ref, {
                currentMax: next,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            return next;
        });
    };
}

// ── Helpers económicos compartidos por TODOS los flujos de emisión ──

// Redondeo fiscal a 2 decimales (evita persistir 12.340000000002)
window.round2 = window.round2 || function round2(n) {
    return Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100;
};

// Vencimiento según condiciones de pago del cliente
window.calcDueDate = window.calcDueDate || function calcDueDate(baseDate, paymentTerms) {
    var DAYS = { contado: 0, transferencia: 30, recibo_sepa: 30, dias15: 15, dias30: 30, dias45: 45, dias60: 60, dias90: 90 };
    var d = baseDate instanceof Date ? new Date(baseDate.getTime()) : new Date();
    var key = String(paymentTerms || 'contado').toLowerCase();
    var days = DAYS[key] !== undefined ? DAYS[key] : (parseInt(key.replace(/\D/g, ''), 10) || 0);
    d.setDate(d.getDate() + days);
    return d;
};

// Guard de emisora: sin CIF del emisor la factura entra en la cadena
// Verifactu basura 'SIN_NIF', se imprime SIN QR y queda bloqueada en el
// envío a AEAT. Devuelve el NIF normalizado o null (con alert).
window.requireEmitterCif = function requireEmitterCif(senderData, contexto) {
    var nif = String((senderData && (senderData.cif || senderData.nif)) || '').replace(/[\s.\-]/g, '').toUpperCase();
    if (!nif) {
        alert('🔒 NO SE PUEDE EMITIR' + (contexto ? ' (' + contexto + ')' : '') + '\n\n' +
              'La EMPRESA EMISORA seleccionada no tiene CIF/NIF configurado.\n\n' +
              'Sin él, la factura no llevaría QR tributario y quedaría fuera de Verifactu.\n' +
              'Configúralo en Facturación → Empresas emisoras y vuelve a intentarlo.');
        return null;
    }
    return nif;
};

window._billingCompaniesCache = window._billingCompaniesCache || null;

window.billingSerieCode = async function billingSerieCode(nifRaw) {
    var norm = function (s) { return String(s || '').replace(/[\s.\-]/g, '').toUpperCase(); };
    var nif = norm(nifRaw);
    if (!nif) return '';

    if (!window._billingCompaniesCache) {
        var map = {};
        try {
            var snap = await db.collection('billing_companies').get();
            snap.forEach(function (d) {
                var data = d.data(); data._id = d.id; map[d.id] = data;
            });
        } catch (e) { console.warn('billingSerieCode: no pude cargar billing_companies', e); }
        window._billingCompaniesCache = map;
    }
    var companies = window._billingCompaniesCache;

    var compId = null, comp = null;
    for (var id in companies) {
        if (norm(companies[id].nif || companies[id].cif) === nif) { compId = id; comp = companies[id]; break; }
    }

    if (comp && comp.serieCode) return norm(comp.serieCode);

    // Derivar: primeras 3 alfanuméricas del nombre (NOVAPACK → NOV)
    var baseName = (comp && comp.name) || '';
    var code = norm(baseName).replace(/[^A-Z0-9]/g, '').slice(0, 3) || nif.slice(-3);
    // Colisión con el serieCode de otra empresa → añadir último carácter del NIF
    var used = [];
    for (var k in companies) {
        if (companies[k] !== comp && companies[k].serieCode) used.push(norm(companies[k].serieCode));
    }
    if (used.indexOf(code) !== -1) code = (code + nif.slice(-1)).slice(0, 4);

    // Persistir para que la serie sea estable para siempre
    if (compId) {
        try {
            await db.collection('billing_companies').doc(compId).set({ serieCode: code }, { merge: true });
            companies[compId].serieCode = code;
        } catch (e) { console.warn('billingSerieCode: no pude persistir serieCode', e); }
    }
    return code;
};

// Asigna el siguiente número correlativo de la serie de UNA empresa.
//   senderData → datos fiscales del emisor ({cif|nif, name, ...})
//   kind       → 'FAC' (facturas) | 'R' (rectificativas) | 'ABO' (abonos legacy)
//   yearOpt    → año de la serie (por defecto, el actual)
// Devuelve { invoiceId, number, serieCode }
window.allocInvoiceNumber = async function allocInvoiceNumber(senderData, kind, yearOpt) {
    kind = kind || 'FAC';
    var counterPrefix = kind === 'R' ? 'credits' : (kind === 'ABO' ? 'abonos' : 'invoices');
    var year = parseInt(yearOpt, 10) || new Date().getFullYear();
    var yy = String(year).slice(-2);
    var nif = String((senderData && (senderData.cif || senderData.nif)) || '').replace(/[\s.\-]/g, '').toUpperCase();

    if (!nif) {
        // Sin NIF de emisor (no debería ocurrir): serie legacy compartida
        var legacyN = await window.allocSequentialNumber(
            'sequence_counters/' + counterPrefix + '_' + year,
            async function () { return 0; }
        );
        return { invoiceId: kind + '-' + yy + '-' + legacyN, number: legacyN, serieCode: '' };
    }

    var serieCode = await window.billingSerieCode(nif);
    var n = await window.allocSequentialNumber(
        'sequence_counters/' + counterPrefix + '_' + nif + '_' + year,
        async function () { return 0; } // serie nueva por empresa: arranca en 1
    );
    return { invoiceId: kind + '-' + serieCode + '-' + yy + '-' + n, number: n, serieCode: serieCode };
};

// =============================================================
// NUMERACIÓN DE ALBARANES — puente ficha ⇄ contador atómico
// =============================================================
// El nº de albarán que se emite NO sale de comp_main.startNum:
// sale del contador atómico ticket_counters/{compId}_{idNum}_{YY}.
// Por eso, cambiar "Próximo nº" en la ficha no tenía ningún efecto
// real. Estos helpers leen el próximo nº de verdad y permiten
// FIJARLO desde el admin sincronizando el contador.
// =============================================================

// Saneado del prefijo de albarán. Hay sedes antiguas con un UID de 28
// caracteres grabado como prefijo (p.ej. "qzs4dFFK…-26-11" en vez de
// "553-26-11"). Un prefijo válido tiene 1-6 caracteres A-Z/0-9; si no,
// se deriva del nº de cliente. (idéntico en firebase-app.js — no divergir)
window.sanitizeTicketPrefix = window.sanitizeTicketPrefix || function (raw, idNum) {
    var p = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (p && p.length <= 6) return p;
    var fb = String(idNum || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    return fb || 'NP';
};

window.ticketCounterPath = function ticketCounterPath(compId, idNum) {
    var yy = String(new Date().getFullYear()).slice(-2);
    return 'ticket_counters/' + (compId || 'comp_main') + '_' + String(idNum) + '_' + yy;
};

// Mayor secuencial ya emitido este año para ese cliente+sede.
window.ticketHistoryMax = async function ticketHistoryMax(idNum, compId, prefix) {
    var yy = String(new Date().getFullYear()).slice(-2);
    var yearPrefix = window.sanitizeTicketPrefix(prefix, idNum) + '-' + yy + '-';
    var max = 0;
    try {
        var snap = await db.collection('tickets').where('clientIdNum', '==', String(idNum)).get();
        snap.forEach(function (d) {
            var t = d.data();
            if ((t.compId || 'comp_main') !== (compId || 'comp_main')) return;
            var bid = t.id || '';
            if (bid.indexOf(yearPrefix) === 0) {
                var seq = parseInt(bid.substring(yearPrefix.length), 10);
                if (!isNaN(seq) && seq > max) max = seq;
            }
        });
    } catch (e) { console.warn('ticketHistoryMax:', e && e.message); }
    return max;
};

// Suelo de numeración configurado por el admin: el primer albarán
// será exactamente startNum (por defecto 1001).
window.ticketStartFloor = function ticketStartFloor(comp) {
    var n = parseInt(comp && comp.startNum, 10);
    return (n > 0) ? n - 1 : 1000;
};

// Próximo nº que se emitirá DE VERDAD, sin consumirlo.
window.peekNextTicketNumber = async function peekNextTicketNumber(idNum, compId, comp) {
    var ref = db.doc(window.ticketCounterPath(compId, idNum));
    try {
        var snap = await ref.get();
        if (snap.exists && typeof snap.data().currentMax === 'number') {
            return { next: snap.data().currentMax + 1, source: 'contador' };
        }
    } catch (e) { console.warn('peekNextTicketNumber:', e && e.message); }
    var hist = await window.ticketHistoryMax(idNum, compId, comp && comp.prefix);
    var floor = window.ticketStartFloor(comp);
    return { next: Math.max(hist, floor) + 1, source: (hist > floor) ? 'histórico' : 'configurado' };
};

// Fija el próximo nº de albarán: guarda startNum en comp_main Y
// sincroniza el contador atómico (currentMax = n-1) para que el
// siguiente albarán salga con ese número exacto.
// Devuelve {ok:false, reason:'backwards'} si retrocedería por debajo
// de lo ya emitido (duplicaría nº de albarán) — salvo opts.force.
window.applyTicketStartNumber = async function applyTicketStartNumber(clientDocId, compId, idNum, startNum, opts) {
    opts = opts || {};
    var n = parseInt(startNum, 10);
    if (!(n > 0)) return { ok: false, reason: 'invalid' };
    if (!clientDocId || idNum === undefined || idNum === null || idNum === '') {
        return { ok: false, reason: 'no-client' };
    }
    compId = compId || 'comp_main';

    var compRef = db.collection('users').doc(clientDocId).collection('companies').doc(compId);
    var comp = {};
    try {
        var cs = await compRef.get();
        if (cs.exists) comp = cs.data() || {};
    } catch (e) { console.warn('applyTicketStartNumber comp:', e && e.message); }

    var hist = await window.ticketHistoryMax(idNum, compId, comp.prefix);
    var ref = db.doc(window.ticketCounterPath(compId, idNum));
    var cur = 0;
    try {
        var s = await ref.get();
        if (s.exists) cur = s.data().currentMax || 0;
    } catch (e) { console.warn('applyTicketStartNumber counter:', e && e.message); }
    var usedMax = Math.max(hist, cur);

    if (n <= usedMax && !opts.force) {
        return { ok: false, reason: 'backwards', usedMax: usedMax, suggested: usedMax + 1 };
    }

    await compRef.set({
        startNum: n,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    await ref.set({
        compId: compId,
        clientIdNum: String(idNum),
        year: String(new Date().getFullYear()).slice(-2),
        prefix: window.sanitizeTicketPrefix(comp.prefix, idNum),
        currentMax: n - 1,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    return { ok: true, applied: n, previousMax: usedMax };
};
