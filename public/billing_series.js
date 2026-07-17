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
