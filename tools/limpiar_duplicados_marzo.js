#!/usr/bin/env node
// =============================================================
// LIMPIEZA DE LOS 38 ALBARANES DUPLICADOS DE LA MIGRACIÓN DE MARZO 2026
// =============================================================
// Uso:
//   node tools/limpiar_duplicados_marzo.js              → SIMULACIÓN (no escribe)
//   node tools/limpiar_duplicados_marzo.js --ejecutar   → lo hace de verdad
//
// QUÉ PASA: la migración del 19-mar-2026 dejó 38 albaranes guardados DOS veces,
// el mismo número bajo dos nombres de documento distintos:
//     103_comp_main_<n>                            → fecha correcta  = SE QUEDA
//     dJHxrY8Aiqd45vzEOPIw44Y0pTI3_comp_main_<n>   → fecha guardada como objeto
//                                                    pelado { seconds, nanoseconds }
//                                                  = SE VA A LA PAPELERA
// Las dos copias son IDÉNTICAS campo por campo, ninguna facturada y ninguna
// entregada (comprobado sobre producción antes de escribir este script, y otra
// vez aquí para cada pareja, justo antes de tocarla).
//
// NO BORRA NADA DE VERDAD: mueve la copia sobrante a `deleted_tickets`, la misma
// papelera que usa el admin, conservando el identificador. Desde la pestaña
// Papelera del admin se restaura con un clic (restoreTicket).
//
// NO TOCA `deleted_erp_ids` A PROPÓSITO: ese número SIGUE EXISTIENDO en la copia
// buena, y meterlo en la lista negra haría que el escáner de la oficina diera el
// albarán por «FULMINADO» y la oficina lo rechazara.
//
// CUATRO CANDADOS: una pareja solo se toca si (1) son exactamente dos copias,
// una con fecha buena y otra con fecha rota; (2) coinciden en los 23 campos que
// importan; (3) ninguna está facturada ni entregada; y (4) la copia que se queda
// sigue existiendo en el momento de escribir.
// =============================================================
const path = require('path'), fs = require('fs');
const firebase = require('firebase/compat/app');
require('firebase/compat/auth');
require('firebase/compat/firestore');

(function loadEnv() {
    const envPath = path.join(__dirname, '..', '.env');
    if (!fs.existsSync(envPath)) return;
    fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach((line) => {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
    });
})();
function need(n) { const v = process.env[n]; if (!v) { console.error('Falta ' + n + ' en .env'); process.exit(1); } return v; }

const EJECUTAR = process.argv.indexOf('--ejecutar') >= 0;
const CAMPOS = ['clientIdNum', 'uid', 'authUid', 'compId', 'sender', 'senderAddress', 'senderPhone',
    'receiver', 'address', 'province', 'phone', 'cod', 'shippingType', 'status', 'printed',
    'labelsPrinted', 'delivered', 'invoiceId', 'invoiceNum', 'timeSlot', 'driverPhone', 'packages', 'id'];

(async () => {
    firebase.initializeApp({
        apiKey: need('FIREBASE_API_KEY'),
        authDomain: need('FIREBASE_AUTH_DOMAIN'),
        projectId: need('FIREBASE_PROJECT_ID')
    });
    await firebase.auth().signInWithEmailAndPassword(need('FIREBASE_ADMIN_EMAIL'), need('FIREBASE_ADMIN_PASS'));
    const db = firebase.firestore();

    console.log(EJECUTAR ? '*** MODO REAL: se va a escribir en producción ***\n'
                         : '--- SIMULACIÓN: no se escribe nada ---\n');

    const s = await db.collection('tickets').get();
    const porId = {};
    s.forEach(d => { const t = d.data(); if (!t.id) return; (porId[t.id] = porId[t.id] || []).push({ doc: d.id, t: t }); });

    const aPapelera = [], rechazados = [];
    Object.keys(porId).forEach(id => {
        const l = porId[id];
        if (l.length < 2) return;
        const buenas = l.filter(x => x.t.createdAt && typeof x.t.createdAt.toDate === 'function');
        const malas = l.filter(x => x.t.createdAt && typeof x.t.createdAt.toDate !== 'function'
                                    && typeof x.t.createdAt.seconds === 'number');
        if (buenas.length !== 1 || malas.length !== 1 || l.length !== 2) {
            rechazados.push(id + ': no es una pareja limpia (buenas=' + buenas.length + ' rotas=' + malas.length + ' total=' + l.length + ')');
            return;
        }
        const buena = buenas[0], mala = malas[0];
        const difs = CAMPOS.filter(c => JSON.stringify(buena.t[c]) !== JSON.stringify(mala.t[c]));
        if (difs.length) { rechazados.push(id + ': las copias NO son idénticas (' + difs.join(', ') + ')'); return; }
        if (l.some(x => x.t.invoiceId || x.t.invoiceNum)) { rechazados.push(id + ': tiene factura, no se toca'); return; }
        if (l.some(x => x.t.delivered || String(x.t.status || '').toLowerCase().indexOf('entreg') >= 0)) {
            rechazados.push(id + ': está entregado, no se toca'); return;
        }
        aPapelera.push({ id: id, mala: mala.doc, buena: buena.doc });
    });

    console.log('parejas que se van a limpiar: ' + aPapelera.length);
    console.log('parejas que NO se tocan:      ' + rechazados.length);
    rechazados.forEach(r => console.log('   ! ' + r));
    console.log('');
    aPapelera.slice(0, 5).forEach(p => {
        console.log('  ' + p.id + '  se queda:   ' + p.buena);
        console.log('  ' + ' '.repeat(String(p.id).length) + '  a papelera: ' + p.mala);
    });
    if (aPapelera.length > 5) console.log('  ... y ' + (aPapelera.length - 5) + ' más');

    if (!EJECUTAR) {
        console.log('\n--- SIMULACIÓN TERMINADA. No se ha escrito nada. ---');
        console.log('Para hacerlo de verdad:  node tools/limpiar_duplicados_marzo.js --ejecutar');
        process.exit(0);
    }

    let hechos = 0, fallos = 0;
    for (let i = 0; i < aPapelera.length; i++) {
        const p = aPapelera[i];
        try {
            const dMala = await db.collection('tickets').doc(p.mala).get();
            const dBuena = await db.collection('tickets').doc(p.buena).get();
            if (!dMala.exists) { console.log('  (ya no estaba) ' + p.id); continue; }
            if (!dBuena.exists) { console.log('  SALTADA ' + p.id + ': la copia que se queda ya no existe'); fallos++; continue; }
            const t = dMala.data();
            if (t.invoiceId || t.invoiceNum || t.delivered) { console.log('  SALTADA ' + p.id + ': ha cambiado de estado'); fallos++; continue; }

            const copia = Object.assign({}, t);
            copia._deletedAt = firebase.firestore.FieldValue.serverTimestamp();
            copia._deletedBy = 'limpieza duplicados migración marzo 2026';
            copia._deleteReason = 'Copia duplicada de la migración: idéntica a ' + p.buena
                + ', con la fecha guardada como objeto pelado. La copia buena se conserva.';
            copia._deleteSource = 'tools/limpiar_duplicados_marzo.js';
            copia._originalDocId = p.mala;

            await db.collection('deleted_tickets').doc(p.mala).set(copia);
            await db.collection('tickets').doc(p.mala).delete();
            hechos++;
            if (hechos % 10 === 0) console.log('  ... ' + hechos + '/' + aPapelera.length);
        } catch (e) {
            console.log('  ERROR en ' + p.id + ': ' + e.message);
            fallos++;
        }
    }
    console.log('\nLIMPIADOS: ' + hechos + '   SALTADOS/ERRORES: ' + fallos);

    const s2 = await db.collection('tickets').get();
    const por2 = {};
    s2.forEach(d => { const t = d.data(); if (t.id) por2[t.id] = (por2[t.id] || 0) + 1; });
    const repes = Object.keys(por2).filter(k => por2[k] > 1);
    console.log('albaranes en total: ' + s2.size + '   números repetidos que quedan: ' + repes.length);
    if (repes.length) console.log('   ' + repes.slice(0, 10).join(', '));
    process.exit(fallos ? 1 : 0);
})().catch(e => { console.error('ERROR GENERAL:', e.message); process.exit(1); });
