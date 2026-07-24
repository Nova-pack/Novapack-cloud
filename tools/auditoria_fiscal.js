#!/usr/bin/env node
// =============================================================
// AUDITORÍA FISCAL-CONTABLE (solo lectura) — NOVAPACK CLOUD
// =============================================================
// Revisa las facturas y gastos REALES contra las reglas del RD
// 1619/2012 y la coherencia interna del sistema:
//   1. Numeración correlativa POR SERIE (sin huecos ni duplicados)
//   2. Datos obligatorios: NIF emisor, NIF receptor, fecha, número
//   3. Aritmética: subtotal + IVA − IRPF = total (céntimo arriba/abajo)
//   4. Abonos/rectificativas con signo coherente
//   5. Cadena Verifactu por NIF emisor (continuidad de hashes)
//   6. Gastos: NIF empresa pagadora + NIF proveedor
// No escribe nada. Uso:  node tools/auditoria_fiscal.js
// =============================================================
const path = require('path');
const fs = require('fs');
const firebase = require('firebase/compat/app');
require('firebase/compat/auth');
require('firebase/compat/firestore');

(function loadEnv() {
    const p = path.join(__dirname, '..', '.env');
    if (!fs.existsSync(p)) return;
    fs.readFileSync(p, 'utf8').split(/\r?\n/).forEach((l) => {
        const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
    });
})();
function need(n) { const v = process.env[n]; if (!v) { console.error('Falta ' + n); process.exit(1); } return v; }
const normNif = (s) => String(s || '').replace(/[\s.\-]/g, '').toUpperCase();
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

async function main() {
    firebase.initializeApp({ apiKey: need('FIREBASE_API_KEY'), authDomain: need('FIREBASE_AUTH_DOMAIN'), projectId: need('FIREBASE_PROJECT_ID') });
    await firebase.auth().signInWithEmailAndPassword(need('FIREBASE_ADMIN_EMAIL'), need('FIREBASE_ADMIN_PASS'));
    const db = firebase.firestore();

    const problemas = { criticos: [], avisos: [] };
    const C = (m) => problemas.criticos.push(m);
    const A = (m) => problemas.avisos.push(m);

    // ── FACTURAS ──
    const snap = await db.collection('invoices').get();
    const invs = [];
    snap.forEach(d => invs.push({ _id: d.id, ...d.data() }));
    console.log('Facturas en el sistema: ' + invs.length);

    const esAbono = (v) => !!(v.isAbono || v.isCredit || v.serie === 'R' || /^(R|ABO)-/.test(String(v.invoiceId || v.number || '')));

    // 1) numeración por serie
    const series = {};
    invs.forEach(v => {
        const num = String(v.invoiceId || v.number || '').trim();
        if (!num) { C('Factura ' + v._id + ' SIN NÚMERO'); return; }
        const m = num.match(/^([A-Z]+-[A-Z0-9]*-?\d{2})-(\d+)$/);
        if (!m) { A('Factura ' + num + ': formato de número no estándar'); return; }
        (series[m[1]] = series[m[1]] || []).push({ seq: parseInt(m[2], 10), num, id: v._id });
    });
    Object.entries(series).forEach(([s, arr]) => {
        arr.sort((a, b) => a.seq - b.seq);
        const seen = new Set();
        arr.forEach(x => {
            if (seen.has(x.seq)) C('Serie ' + s + ': número DUPLICADO ' + x.num);
            seen.add(x.seq);
        });
        for (let i = 1; i < arr.length; i++) {
            const gap = arr[i].seq - arr[i - 1].seq;
            if (gap > 1) A('Serie ' + s + ': hueco de ' + (gap - 1) + ' entre ' + arr[i - 1].num + ' y ' + arr[i].num);
        }
    });
    console.log('Series detectadas: ' + Object.keys(series).map(s => s + ' (' + series[s].length + ')').join(', '));

    // 2) obligatorios + 3) aritmética + 4) abonos
    invs.forEach(v => {
        const num = String(v.invoiceId || v.number || v._id);
        const emisorNif = normNif(v.senderData && (v.senderData.cif || v.senderData.nif));
        const receptorNif = normNif(v.clientNif || v.nif || (v.clientData && v.clientData.nif));
        if (!emisorNif) C(num + ': SIN NIF EMISOR (bloquea Verifactu y anula la factura formalmente)');
        if (!receptorNif) A(num + ': sin NIF del receptor');
        if (!v.date && !v.createdAt) C(num + ': sin fecha');

        const sub = r2(v.subtotal), iva = r2(v.iva !== undefined ? v.iva : v.ivaAmount), irpf = r2(v.irpf), tot = r2(v.total);
        if (v.subtotal !== undefined && v.total !== undefined) {
            const calc = r2(sub + iva - Math.abs(irpf) * Math.sign(sub || 1));
            if (Math.abs(calc - tot) > 0.011) {
                C(num + ': ARITMÉTICA ROTA — ' + sub + ' + ' + iva + ' − IRPF ' + irpf + ' = ' + calc + ' ≠ total ' + tot);
            }
        }
        if (esAbono(v)) {
            if (r2(v.total) > 0) A(num + ': abono/rectificativa con total POSITIVO (' + v.total + ') — el visor lo niega, pero el dato está en positivo');
            if (v.serie === 'R' && !v.rectifies && !v.rectifiedInvoiceId && !v.originalInvoiceId) A(num + ': rectificativa sin referencia a la factura original');
        }
        const ivaRate = v.ivaRate !== undefined ? Number(v.ivaRate) : null;
        if (ivaRate !== null && [0, 4, 10, 21].indexOf(ivaRate) < 0) A(num + ': tipo de IVA raro (' + ivaRate + '%)');
    });

    // 5) cadena Verifactu por NIF emisor (verifactu_registros: huella /
    //    huellaAnterior / chainIndex, cabezas en verifactu_chains)
    const vfSnap = await db.collection('verifactu_registros').get().catch(() => null);
    if (vfSnap) {
        const porNif = {};
        vfSnap.forEach(d => { const x = d.data(); (porNif[x.idEmisorFactura || '?'] = porNif[x.idEmisorFactura || '?'] || []).push(x); });
        Object.entries(porNif).forEach(([nif, regs]) => {
            regs.sort((a, b) => (a.chainIndex || 0) - (b.chainIndex || 0));
            let rotos = 0;
            for (let i = 1; i < regs.length; i++) {
                if (regs[i].huellaAnterior !== regs[i - 1].huella) rotos++;
            }
            const dup = new Set(); let dupN = 0;
            regs.forEach(r => { if (dup.has(r.chainIndex)) dupN++; dup.add(r.chainIndex); });
            console.log('Verifactu ' + nif + ': ' + regs.length + ' registros, ' + rotos + ' saltos de cadena, ' + dupN + ' chainIndex duplicados');
            if (nif === 'SIN_NIF' && regs.length) C('Verifactu: ' + regs.length + ' registros en la cadena SIN_NIF (facturas emitidas sin CIF de emisora)');
            if (rotos) C('Verifactu ' + nif + ': ' + rotos + ' SALTOS en la cadena de huellas');
            if (dupN) C('Verifactu ' + nif + ': ' + dupN + ' chainIndex duplicados');
        });
        // cabeza de cadena vs último registro
        const chSnap = await db.collection('verifactu_chains').get().catch(() => null);
        if (chSnap) chSnap.forEach(d => {
            const h = d.data();
            const regs = porNif[d.id] || [];
            const last = regs.length ? regs[regs.length - 1] : null;
            if (last && h.lastHuella !== last.huella) C('Verifactu ' + d.id + ': la cabeza de cadena (lastHuella) NO coincide con el último registro');
            if (last && h.chainIndex !== last.chainIndex) A('Verifactu ' + d.id + ': chainIndex de cabeza (' + h.chainIndex + ') ≠ último registro (' + last.chainIndex + ')');
        });
        // facturas selladas vs libro
        const conVf = new Set(); vfSnap.forEach(d => conVf.add(String(d.data().numSerieFactura || '')));
        let sinVf = 0;
        invs.forEach(v => { const n = String(v.invoiceId || v.number || ''); if (n && !conVf.has(n)) sinVf++; });
        if (sinVf) A(sinVf + ' facturas sin registro Verifactu (revisar si son anteriores a la activación)');
    } else {
        A('No se pudo leer verifactu_registros');
    }

    // 6) gastos
    const gSnap = await db.collection('expenses').get().catch(() => null);
    if (gSnap) {
        let g = 0, sinComp = 0, sinProv = 0;
        gSnap.forEach(d => {
            const e = d.data(); g++;
            if (!normNif(e.companyNif)) sinComp++;
            if (!normNif(e.providerNif)) sinProv++;
        });
        console.log('Gastos: ' + g + ' | sin NIF empresa pagadora: ' + sinComp + ' | sin NIF proveedor: ' + sinProv);
        if (sinComp) A(sinComp + ' gastos sin NIF de empresa pagadora (no entran bien en el 303 por emisora)');
        if (sinProv) A(sinProv + ' gastos sin NIF de proveedor (347 incompleto)');
    }

    // sequence_counters vs realidad
    const scSnap = await db.collection('sequence_counters').get().catch(() => null);
    if (scSnap) {
        scSnap.forEach(d => {
            const cm = d.data().currentMax;
            console.log('Contador ' + d.id + ': currentMax=' + cm);
        });
    }

    console.log('\n════════ RESULTADO ════════');
    console.log('CRÍTICOS: ' + problemas.criticos.length);
    problemas.criticos.forEach(m => console.log('  ✗ ' + m));
    console.log('AVISOS: ' + problemas.avisos.length);
    problemas.avisos.slice(0, 40).forEach(m => console.log('  ⚠ ' + m));
    if (problemas.avisos.length > 40) console.log('  … y ' + (problemas.avisos.length - 40) + ' avisos más');
    process.exit(0);
}
main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
