#!/usr/bin/env node
// =============================================================
// REPARACIÓN — sedes operativas (comp_main) con la dirección vacía
// =============================================================
// comp_main es la sede que precarga y IMPRIME el albarán del cliente.
// Algunas se crearon a medias (sólo prefijo y nº de albarán), porque
// guardar la ficha escribía sólo esos dos campos con merge y eso CREA
// el documento. Resultado: el albarán saldría con "Dirección no
// definida" — justo lo que avisa el semáforo 🚦 de cliente listo.
//
// Este script copia la dirección de la ficha (/users) a la sede.
// No inventa nada: si la ficha tampoco la tiene, lo deja y lo reporta.
//
// Uso:
//   node tools/reparar_sede_vacia.js             → sólo LISTA
//   node tools/reparar_sede_vacia.js --reparar   → aplica
// Guarda copia previa en tools/backups/.
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

const APLICAR = process.argv.includes('--reparar');

function componerDireccion(u) {
    const p = [];
    if (u.street) p.push(u.street);
    if (u.number) p.push('Nº ' + u.number);
    if (u.localidad) p.push(u.localidad);
    if (u.cp) p.push('(CP ' + u.cp + ')');
    return p.join(', ');
}

async function main() {
    firebase.initializeApp({
        apiKey: need('FIREBASE_API_KEY'),
        authDomain: need('FIREBASE_AUTH_DOMAIN'),
        projectId: need('FIREBASE_PROJECT_ID')
    });
    await firebase.auth().signInWithEmailAndPassword(need('FIREBASE_ADMIN_EMAIL'), need('FIREBASE_ADMIN_PASS'));
    const db = firebase.firestore();

    const snap = await db.collection('users').get();
    const users = [];
    snap.forEach(d => { const x = d.data(); if (x.role !== 'admin') users.push(Object.assign({ __id: d.id }, x)); });

    const reparables = [], sinDatos = [];
    for (const u of users) {
        const ref = db.collection('users').doc(u.__id).collection('companies').doc('comp_main');
        const c = await ref.get();
        if (!c.exists) continue;                       // se creará completa en el primer login
        const addr = ((c.data().address || '') + '').trim();
        if (addr && !/^direcci[oó]n no (definida|configurada)$/i.test(addr)) continue;

        const nueva = componerDireccion(u);
        const fila = {
            docId: u.__id, idNum: String(u.idNum || ''), name: u.name || '(sin nombre)',
            antes: c.data(), direccionNueva: nueva
        };
        if (nueva) reparables.push(fila); else sinDatos.push(fila);
    }

    console.log('Clientes revisados      : ' + users.length);
    console.log('Sedes reparables        : ' + reparables.length);
    console.log('Sin dirección ni en ficha: ' + sinDatos.length + '\n');

    reparables.forEach((r, i) => {
        console.log((i + 1) + '. #' + r.idNum + '  ' + r.name);
        console.log('     sede ahora : (vacía)');
        console.log('     quedara    : ' + r.direccionNueva);
    });
    if (sinDatos.length) {
        console.log('\nEstos NO se pueden reparar (la ficha tampoco tiene dirección):');
        sinDatos.forEach(r => console.log('   #' + r.idNum + '  ' + r.name));
    }

    if (!reparables.length) { console.log('\nNada que reparar.'); process.exit(0); }
    if (!APLICAR) { console.log('\n[SIMULACION] No se ha tocado nada. Ejecuta con --reparar para aplicarlo.'); process.exit(0); }

    const dir = path.join(__dirname, 'backups');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'sedes_vacias_' + new Date().toISOString().replace(/[:.]/g, '-') + '.json');
    fs.writeFileSync(file, JSON.stringify(reparables, null, 2), 'utf8');
    console.log('\nCopia de seguridad: ' + file);

    const batch = db.batch();
    reparables.forEach(r => {
        const u = users.find(x => x.__id === r.docId);
        batch.set(db.collection('users').doc(r.docId).collection('companies').doc('comp_main'), {
            name: u.name || '',
            nif: u.nif || '',
            idNum: parseInt(u.idNum, 10) || null,
            street: u.street || '',
            number: u.number || '',
            localidad: u.localidad || '',
            cp: u.cp || '',
            province: u.province || '',
            phone: u.senderPhone || '',
            address: r.direccionNueva,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    });
    await batch.commit();
    console.log('Reparadas ' + reparables.length + ' sedes.');

    let mal = 0;
    for (const r of reparables) {
        const c = await db.collection('users').doc(r.docId).collection('companies').doc('comp_main').get();
        const a = ((c.data().address || '') + '').trim();
        if (!a) { mal++; console.log('  FALLO #' + r.idNum + ' ' + r.name); }
        else console.log('  OK  #' + r.idNum + '  ' + a);
    }
    console.log(mal === 0 ? '\nVerificado: todas las sedes con dirección.' : '\nQuedan ' + mal + ' sin reparar.');
    process.exit(mal === 0 ? 0 : 1);
}
main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
