#!/usr/bin/env node
// =============================================================
// LIMPIEZA — campo `id` OBSOLETO dentro de documentos de /users
// =============================================================
// Algunos clientes arrastran un campo `id` dentro del documento con
// un identificador antiguo distinto del docId real (herencia de
// cuando se les activó el acceso online y el doc se recreó bajo su
// authUid). Ese alias muerto provocaba escrituras contra documentos
// inexistentes ("No document to update: users/gesco_553").
//
// El código ya ignora ese campo (siempre fuerza id = doc.id), así
// que borrarlo es hilo dental: elimina la posibilidad de recaída.
//
// Uso:
//   node tools/limpiar_id_obsoleto.js            → sólo LISTA (no toca nada)
//   node tools/limpiar_id_obsoleto.js --borrar   → borra el campo
//   node tools/limpiar_id_obsoleto.js --restaurar <backup.json>
//
// Antes de borrar guarda una copia en tools/backups/.
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

const DO_DELETE = process.argv.includes('--borrar');
const RESTORE_IDX = process.argv.indexOf('--restaurar');

async function main() {
    firebase.initializeApp({
        apiKey: need('FIREBASE_API_KEY'),
        authDomain: need('FIREBASE_AUTH_DOMAIN'),
        projectId: need('FIREBASE_PROJECT_ID')
    });
    await firebase.auth().signInWithEmailAndPassword(need('FIREBASE_ADMIN_EMAIL'), need('FIREBASE_ADMIN_PASS'));
    const db = firebase.firestore();

    // ---- RESTAURAR ----
    if (RESTORE_IDX !== -1) {
        const file = process.argv[RESTORE_IDX + 1];
        if (!file || !fs.existsSync(file)) { console.error('Indica un fichero de backup existente.'); process.exit(1); }
        const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
        const batch = db.batch();
        rows.forEach(r => batch.update(db.collection('users').doc(r.docId), { id: r.staleId }));
        await batch.commit();
        console.log('Restaurados ' + rows.length + ' documentos desde ' + file);
        process.exit(0);
    }

    const snap = await db.collection('users').get();
    const afectados = [];
    snap.forEach(d => {
        const data = d.data();
        if (data.id !== undefined && data.id !== d.id) {
            afectados.push({
                docId: d.id,
                staleId: data.id,
                name: data.name || '(sin nombre)',
                idNum: data.idNum === undefined ? null : String(data.idNum),
                authUid: data.authUid || null
            });
        }
    });

    console.log('Documentos revisados : ' + snap.size);
    console.log('Con campo `id` obsoleto: ' + afectados.length + '\n');
    afectados.forEach((a, i) => {
        console.log((i + 1) + '. ' + a.name);
        console.log('     docId real   : ' + a.docId);
        console.log('     campo id     : ' + a.staleId + '   <-- se borra');
        console.log('     nº cliente   : ' + (a.idNum || '(sin nº)'));
        console.log('     coincide con authUid: ' + (a.authUid === a.docId ? 'si' : 'no (' + a.authUid + ')'));
    });

    if (!afectados.length) { console.log('\nNada que limpiar.'); process.exit(0); }

    if (!DO_DELETE) {
        console.log('\n[SIMULACION] No se ha tocado nada. Ejecuta con --borrar para aplicarlo.');
        process.exit(0);
    }

    // ---- BACKUP ----
    const dir = path.join(__dirname, 'backups');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(dir, 'users_id_obsoleto_' + stamp + '.json');
    fs.writeFileSync(backupFile, JSON.stringify(afectados, null, 2), 'utf8');
    console.log('\nCopia de seguridad: ' + backupFile);

    // ---- BORRADO ----
    const batch = db.batch();
    afectados.forEach(a => {
        batch.update(db.collection('users').doc(a.docId), {
            id: firebase.firestore.FieldValue.delete()
        });
    });
    await batch.commit();
    console.log('Campo `id` borrado en ' + afectados.length + ' documentos.');

    // ---- VERIFICACION ----
    let restan = 0;
    for (const a of afectados) {
        const d = await db.collection('users').doc(a.docId).get();
        if (!d.exists) { console.log('  AVISO: ' + a.name + ' ya no existe'); continue; }
        const still = d.data().id;
        if (still !== undefined) { restan++; console.log('  FALLO: ' + a.name + ' conserva id=' + still); }
        else console.log('  OK  ' + a.name + ' (' + a.docId + ')');
    }
    console.log(restan === 0 ? '\nVerificado: ningun alias obsoleto restante.' : '\nQuedan ' + restan + ' sin limpiar.');
    process.exit(restan === 0 ? 0 : 1);
}
main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
