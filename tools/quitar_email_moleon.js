#!/usr/bin/env node
// =============================================================
// DEJAR DE MANDAR CORREOS DEL SISTEMA A e.merida@luismoleon.com
// =============================================================
// Uso:
//   node tools/quitar_email_moleon.js              → SIMULACIÓN (no escribe)
//   node tools/quitar_email_moleon.js --ejecutar   → lo hace de verdad
//
// POR QUÉ: esa dirección está puesta como `email` Y como `adminEmail` en las
// CUATRO fichas de LUIS MOLEÓN (el padre gesco_106 y las sucursales de Málaga,
// Sevilla y Córdoba). El servidor elige el destinatario de los avisos con
// `adminEmail || email` (functions/index.js, tkResolveClientEmail), así que todo
// aviso de entrega de cualquiera de las cuatro acabab ahí.
//
// QUÉ HACE: vacía `email` y `adminEmail` en esas fichas y guarda la dirección en
// `emailAnterior`, con el motivo y la fecha, para no perder el dato y poder
// deshacerlo. No borra ninguna ficha ni ningún albarán.
//
// CONSECUENCIA, QUE HAY QUE TENER CLARA: con los dos campos vacíos, LUIS MOLEÓN
// deja de recibir CUALQUIER aviso de entrega (el servidor no manda nada si no
// hay dirección). Es lo correcto mientras no se ponga la dirección buena, pero
// hay que ponerla. Se hace desde el admin, en la ficha de cada sucursal.
//
// CANDADOS: solo toca fichas cuyo `email` o `adminEmail` sea EXACTAMENTE la
// dirección de abajo. Cualquier otra ficha se deja intacta.
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

const DIRECCION = 'e.merida@luismoleon.com';
const EJECUTAR = process.argv.indexOf('--ejecutar') >= 0;

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
    console.log('dirección a retirar: ' + DIRECCION + '\n');

    const us = await db.collection('users').get();
    const afectadas = [];
    us.forEach(d => {
        const x = d.data();
        const coincide = [x.email, x.adminEmail]
            .some(v => String(v || '').trim().toLowerCase() === DIRECCION.toLowerCase());
        if (coincide) afectadas.push({ doc: d.id, name: x.name, idNum: x.idNum,
            email: x.email || '', adminEmail: x.adminEmail || '', loginEmail: x.loginEmail || '' });
    });

    console.log('FICHAS AFECTADAS: ' + afectadas.length);
    afectadas.forEach(a => {
        console.log('  · ' + String(a.name).padEnd(34) + ' (nº ' + a.idNum + ')');
        console.log('      email      = ' + JSON.stringify(a.email) + '  ->  ""');
        console.log('      adminEmail = ' + JSON.stringify(a.adminEmail) + '  ->  ""');
        console.log('      (su acceso sigue siendo ' + (a.loginEmail || '-') + ', eso NO se toca)');
    });

    if (!afectadas.length) { console.log('\nNada que hacer.'); process.exit(0); }

    console.log('\nDESPUÉS DE ESTO, ESAS FICHAS NO RECIBIRÁN NINGÚN AVISO DE ENTREGA');
    console.log('hasta que se les ponga la dirección buena desde el admin.');

    if (!EJECUTAR) {
        console.log('\n--- SIMULACIÓN TERMINADA. No se ha escrito nada. ---');
        console.log('Para hacerlo de verdad:  node tools/quitar_email_moleon.js --ejecutar');
        process.exit(0);
    }

    let hechas = 0, fallos = 0;
    for (const a of afectadas) {
        try {
            await db.collection('users').doc(a.doc).update({
                email: '',
                adminEmail: '',
                emailAnterior: DIRECCION,
                emailAnteriorMotivo: 'Retirado por orden del administrador: recibia los avisos del sistema de las cuatro fichas de LUIS MOLEON y no debia.',
                emailAnteriorFecha: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            console.log('  hecho: ' + a.name);
            hechas++;
        } catch (e) {
            console.log('  ERROR en ' + a.name + ': ' + e.message);
            fallos++;
        }
    }
    console.log('\nFICHAS ACTUALIZADAS: ' + hechas + '   ERRORES: ' + fallos);

    // Comprobación final
    const us2 = await db.collection('users').get();
    let quedan = 0;
    us2.forEach(d => {
        const x = d.data();
        if ([x.email, x.adminEmail].some(v => String(v || '').trim().toLowerCase() === DIRECCION.toLowerCase())) quedan++;
    });
    console.log('fichas que todavía apuntan a esa dirección: ' + quedan + (quedan === 0 ? '  (correcto)' : '  <= REVISAR'));
    process.exit(fallos ? 1 : 0);
})().catch(e => { console.error('ERROR GENERAL:', e.message); process.exit(1); });
