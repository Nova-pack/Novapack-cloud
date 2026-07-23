#!/usr/bin/env node
// =============================================================
// DIAGNÓSTICO (solo lectura) — de dónde sale la cuota mensual
// =============================================================
// Uso:  node tools/diag_cuota.js "PARTE DEL NOMBRE DEL CLIENTE"
// Muestra: tariffId del cliente, items flat_monthly de su tarifa,
// overrides personalizados, legacy flatRateAmount y las partes
// repartidas a sus sucursales. No escribe nada.
// =============================================================
const path = require('path');
const fs = require('fs');
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

const query = (process.argv[2] || '').toLowerCase().trim();
if (!query) { console.error('Uso: node tools/diag_cuota.js "nombre del cliente"'); process.exit(1); }

async function main() {
    firebase.initializeApp({
        apiKey: need('FIREBASE_API_KEY'),
        authDomain: need('FIREBASE_AUTH_DOMAIN'),
        projectId: need('FIREBASE_PROJECT_ID')
    });
    await firebase.auth().signInWithEmailAndPassword(need('FIREBASE_ADMIN_EMAIL'), need('FIREBASE_ADMIN_PASS'));
    const db = firebase.firestore();

    const usersSnap = await db.collection('users').get();
    const all = [];
    usersSnap.forEach(d => all.push(Object.assign({ id: d.id }, d.data())));

    const matches = all.filter(u => String(u.name || '').toLowerCase().includes(query));
    if (!matches.length) { console.log('Sin clientes que contengan:', query); process.exit(0); }

    for (const c of matches) {
        console.log('\n==============================================');
        console.log('CLIENTE:', c.name, ' (docId', c.id + ', nº', c.idNum + ')');
        console.log('  parentClientId :', c.parentClientId || '(es padre)');
        console.log('  tariffId       :', c.tariffId || '(sin tarifa)');
        console.log('  isFlatRate     :', c.isFlatRate, ' flatRateAmount:', c.flatRateAmount);
        console.log('  flatMonthlyShare:', c.flatMonthlyShare == null ? '(no)' : c.flatMonthlyShare);
        if (c.tariffOverrides) console.log('  tariffOverrides:', JSON.stringify(c.tariffOverrides));

        if (c.tariffId) {
            const cands = [c.tariffId, 'GLOBAL_' + c.tariffId, 'GLOBAL_' + c.tariffId + '_v2'];
            let found = false;
            for (const tid of cands) {
                const t = await db.collection('tariffs').doc(tid).get();
                if (!t.exists) continue;
                found = true;
                const td = t.data();
                console.log('  --- TARIFA', t.id, '(' + (td.name || 's/n') + ') version', td.version, '---');
                const items = Array.isArray(td.items) ? td.items : [];
                const flats = items.filter(i => i.mode === 'flat_monthly');
                if (!flats.length) console.log('    (sin items flat_monthly)');
                let sum = 0;
                flats.forEach(i => { sum += Number(i.basePrice) || 0; console.log('    flat_monthly:', i.label || i.id || '(sin label)', '=', i.basePrice, '€'); });
                console.log('    >>> SUMA flat_monthly:', sum.toFixed(2), '€');
                break;
            }
            if (!found) console.log('  ⚠ No existe ningún doc de tarifa para', c.tariffId, '(probado:', cands.join(', ') + ')');
        }

        // Sucursales y sus partes
        const kids = all.filter(u => u.parentClientId === c.id || (c.idNum && String(u.parentClientId) === String(c.idNum)));
        if (kids.length) {
            console.log('  --- SUCURSALES ---');
            let sh = 0;
            kids.forEach(k => { const v = Number(k.flatMonthlyShare) || 0; sh += v; console.log('    ', k.name, '(#' + k.idNum + ') parte:', v, '€'); });
            console.log('    >>> TOTAL repartido a sucursales:', sh.toFixed(2), '€');
        }
    }
    process.exit(0);
}
main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
