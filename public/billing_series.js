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

// Asigna el SIGUIENTE nº de albarán de forma ATÓMICA (transacción sobre
// ticket_counters), respetando el suelo configurado (startNum) y saneando
// el prefijo. Es el MISMO motor que usan la app cliente y Entrada Rápida —
// lo usa también el alta manual/escáner del admin para que no exista un
// cuarto motor sin transacción que duplique números.
// Devuelve el id de negocio completo: "PREFIJO-YY-N".
window.allocTicketId = async function allocTicketId(idNum, compId, comp) {
    comp = comp || {};
    compId = compId || 'comp_main';
    var idn = String(idNum);
    var prefix = window.sanitizeTicketPrefix(comp.prefix, idn);
    var yy = String(new Date().getFullYear()).slice(-2);
    var yearPrefix = prefix + '-' + yy + '-';
    var counterRef = db.doc(window.ticketCounterPath(compId, idn));

    // Suelo configurado: el primer albarán del año sale con startNum (1001 por defecto)
    var floor = window.ticketStartFloor(comp);

    // Si el contador aún no existe, sembrar desde el histórico (probando
    // variantes del nº de cliente: "60", "060", 60…)
    var seed = floor;
    try {
        var cSnap = await counterRef.get();
        if (!cSnap.exists) {
            var variants = [idn];
            var n = parseInt(idn, 10);
            if (!isNaN(n)) variants.push(String(n), String(n).padStart(3, '0'));
            variants = Array.from(new Set(variants)).slice(0, 10);
            var snap = await db.collection('tickets').where('clientIdNum', 'in', variants).get();
            snap.forEach(function (d) {
                var t = d.data();
                if ((t.compId || 'comp_main') !== compId) return;
                var bid = t.id || '';
                if (bid.indexOf(yearPrefix) === 0) {
                    var seq = parseInt(bid.substring(yearPrefix.length), 10);
                    if (!isNaN(seq) && seq > seed) seed = seq;
                }
            });
        }
    } catch (e) { console.warn('allocTicketId seed:', e && e.message); }

    var next = await db.runTransaction(async function (tx) {
        var dSnap = await tx.get(counterRef);
        var cur = (dSnap.exists && typeof dSnap.data().currentMax === 'number')
            ? Math.max(dSnap.data().currentMax, floor)
            : seed;
        var nx = cur + 1;
        tx.set(counterRef, {
            compId: compId,
            clientIdNum: idn,
            year: yy,
            prefix: prefix,
            currentMax: nx,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        return nx;
    });
    return yearPrefix + next;
};

// =============================================================
// PARSER ÚNICO DE QR DE ALBARÁN
// =============================================================
// Entiende TODOS los formatos que circulan por el sistema:
//   1. URL de seguimiento (https://…/track…?id=XXX) → { id }
//   2. Pipe Novapack:  ID:x|DEST:x|ADDR:x|PROV:x|TEL:x|COD:x|BULTOS:x|
//                      PESO:x|OBS:x|CLI:x|NIF:x|TIPO:D
//   3. JSON del QR antiguo ({"id":…,"r":…})
//   4. JSON "sucio" (lectores que pierden comillas) por regex
// Devuelve null si no reconoce nada, o un objeto con:
//   { id, r (destinatario), a (dirección), v (provincia), t (tel),
//     c (reembolso), k (bultos), w (peso), n (obs), s (Pagados|Debidos),
//     receiverNif, senderIdNum, billingEntityId }
window.parseTicketQR = function parseTicketQR(raw) {
    var text = String(raw == null ? '' : raw).replace(/[\r\n]+/g, ' ').trim();
    if (!text) return null;

    // 1) URL de tracking escaneada por error → al menos rescatar el ID
    if (/^https?:\/\//i.test(text)) {
        var mUrl = text.match(/[?&]id=([^&\s]+)/i) || text.match(/\/t(?:rack)?\/([^/?\s]+)/i);
        if (mUrl) return { id: decodeURIComponent(mUrl[1]) };
        return null;
    }

    // 2) Formato pipe (el QR impreso actual)
    if (text.toUpperCase().indexOf('DEST:') >= 0 || (text.indexOf('|') >= 0 && text.toUpperCase().indexOf('ID:') >= 0)) {
        var out = {};
        text.split('|').forEach(function (p) {
            var i = p.indexOf(':');
            if (i < 0) return;
            var key = p.substring(0, i).trim().toUpperCase();
            var v = p.substring(i + 1).trim();
            if (key === 'ID') out.id = v;
            else if (key === 'DEST') out.r = v;
            else if (key === 'ADDR') out.a = v;
            else if (key === 'PROV') out.v = v;
            else if (key === 'TEL') out.t = v;
            else if (key === 'COD') out.c = v;
            else if (key === 'BULTOS') out.k = v;
            else if (key === 'PESO') out.w = v;
            else if (key === 'OBS') out.n = v;
            else if (key === 'CLI' || key === 'IDNUM') out.senderIdNum = v;
            else if (key === 'NIF') out.receiverNif = v.toUpperCase();
            else if (key === 'TIPO') out.s = (v.toUpperCase() === 'D' || v.toUpperCase() === 'DEBIDOS') ? 'Debidos' : 'Pagados';
            else if (key === 'PAY') out.s = (v.toUpperCase() === 'DEBIDO' || v.toUpperCase() === 'D') ? 'Debidos' : 'Pagados';
            else if (key === 'FIL' || key === 'EMP') out.billingEntityId = v;
        });
        if (out.id || out.r) return out;
    }

    // 3) JSON limpio
    if (text.indexOf('{') >= 0) {
        try {
            var jsonMatch = text.match(/\{.*\}/);
            var o = JSON.parse(jsonMatch ? jsonMatch[0] : text);
            if (o && (o.id || o.docId || o.r)) {
                if (o.docId && !o.id) o.id = o.docId;
                if (o.nif && !o.receiverNif) o.receiverNif = String(o.nif).toUpperCase();
                return o;
            }
        } catch (e) { /* sigue al regex */ }
    }

    // 4) JSON sucio por regex (lectores que se comen comillas)
    var dirty = {};
    var grab = function (key) {
        // Los dos puntos son OBLIGATORIOS: los lectores pierden comillas,
        // pero nunca los ':' — con ':' opcional, cualquier texto con una
        // 'a' o una 'r' colaba como falso positivo.
        var m = text.match(new RegExp('"?' + key + '"?\\s*:\\s*"?([^",}|]+)"?', 'i'));
        return m ? m[1].trim() : null;
    };
    var dId = grab('id'); if (dId) dirty.id = dId;
    var dR = grab('r'); if (dR) dirty.r = dR;
    var dA = grab('a'); if (dA) dirty.a = dA;
    var dV = grab('v'); if (dV) dirty.v = dV;
    var dK = grab('k'); if (dK) dirty.k = dK;
    var dC = grab('c'); if (dC) dirty.c = dC;
    var dS = grab('s'); if (dS) dirty.s = dS;
    var dN = grab('n'); if (dN) dirty.n = dN;
    var dF = grab('(?:f|fil|emp)'); if (dF) dirty.billingEntityId = dF;
    if (dirty.r || dirty.a) return dirty;

    return null;
};

// Sanea un valor antes de meterlo en el QR pipe: sin '|' (rompería el
// parseo) ni saltos de línea.
window.qrField = function qrField(v) {
    return String(v == null ? '' : v).replace(/\|/g, '/').replace(/[\r\n]+/g, ' ').trim();
};

// Pitido de confirmación de escaneo (WebAudio, sin ficheros). ok=false →
// tono grave de error. En almacén el oído confirma antes que la vista.
window.playScanBeep = function playScanBeep(ok) {
    try {
        var Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        window._npBeepCtx = window._npBeepCtx || new Ctx();
        var ctx = window._npBeepCtx;
        if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = (ok === false) ? 220 : 880;
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + ((ok === false) ? 0.25 : 0.09));
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + ((ok === false) ? 0.28 : 0.1));
    } catch (e) { /* sin audio no pasa nada */ }
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
