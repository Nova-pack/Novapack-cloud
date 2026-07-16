#!/usr/bin/env node
// =============================================================
// VERIFACTU — Herramienta de activación/operación FASE 2
// =============================================================
// Se autentica como admin (credenciales de .env, mismo patrón
// que mail_engine.js) y opera sobre la configuración Verifactu.
//
// Uso:  node tools/verifactu/activate_fase2.js <comando> [args]
//   inspect                 → lista registros pendientes por NIF (solo lectura)
//   set-sif                 → escribe config/verifactu_sif (datos productor)
//   mark-legacy <ISO>       → pendientes creados antes de <ISO> → descartado_legacy
//   activate [pruebas|produccion] → config/verifactu_envio activo:true
//   deactivate              → config/verifactu_envio activo:false
//   send                    → llama a verifactuSendNow y muestra el resultado
//   status                  → resumen del último envío + recuento por estado
// =============================================================
const path = require('path');
const fs = require('fs');
const firebase = require('firebase/compat/app');
require('firebase/compat/auth');
require('firebase/compat/firestore');
require('firebase/compat/functions');

// .env del raíz del repo (sin dependencia dotenv — igual que mail_engine)
(function loadEnv() {
    const envPath = path.join(__dirname, '..', '..', '.env');
    if (!fs.existsSync(envPath)) return;
    fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach((line) => {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
    });
})();

function requireEnv(name) {
    const v = process.env[name];
    if (!v) { console.error('❌ Falta variable ' + name + ' en .env'); process.exit(1); }
    return v;
}

const FIREBASE_CONFIG = {
    apiKey: requireEnv('FIREBASE_API_KEY'),
    authDomain: requireEnv('FIREBASE_AUTH_DOMAIN'),
    projectId: requireEnv('FIREBASE_PROJECT_ID')
};

// Datos del productor del software (= declaración responsable)
const SIF_DATA = {
    nombreRazonProductor: 'NOVAPACK SERVICIO INMEDIATO DE PAQUETERIA SL',
    nifProductor: 'B93587194',
    nombreSistema: 'NOVAPACK CLOUD',
    idSistema: 'NP',
    version: '2.2',
    numeroInstalacion: '0001'
};

async function main() {
    const cmd = process.argv[2] || 'inspect';
    firebase.initializeApp(FIREBASE_CONFIG);
    await firebase.auth().signInWithEmailAndPassword(
        requireEnv('FIREBASE_ADMIN_EMAIL'), requireEnv('FIREBASE_ADMIN_PASS')
    );
    console.log('✔ Autenticado como admin');
    const db = firebase.firestore();

    if (cmd === 'inspect') {
        const snap = await db.collection('verifactu_registros')
            .where('estadoEnvioAEAT', '==', 'pendiente').limit(500).get();
        console.log(`\nRegistros PENDIENTES: ${snap.size}`);
        const porNif = {};
        snap.forEach(d => {
            const r = d.data();
            const k = r.idEmisorFactura || 'SIN_NIF';
            (porNif[k] = porNif[k] || []).push(r);
        });
        Object.keys(porNif).forEach(nif => {
            console.log(`\n── ${nif} (${porNif[nif].length}):`);
            porNif[nif]
                .sort((a, b) => (a.chainIndex || 0) - (b.chainIndex || 0))
                .forEach(r => {
                    const ts = r.createdAt && r.createdAt.toDate ? r.createdAt.toDate().toISOString() : '?';
                    console.log(`   #${r.chainIndex} ${r.tipoRegistro} ${r.numSerieFactura} · ${r.fechaExpedicionFactura} · ${r.importeTotal}€ · dest:${r.destinatarioNif || '—'} · creado:${ts}`);
                });
        });
        const chains = await db.collection('verifactu_chains').get();
        console.log('\nCadenas por empresa:');
        chains.forEach(d => {
            const c = d.data();
            console.log(`   ${d.id}: index ${c.chainIndex} · última ${c.lastNumSerie}`);
        });
    }

    else if (cmd === 'set-sif') {
        await db.collection('config').doc('verifactu_sif').set(SIF_DATA, { merge: true });
        console.log('✔ config/verifactu_sif escrito:', SIF_DATA);
    }

    else if (cmd === 'mark-legacy') {
        const cutoff = new Date(process.argv[3]);
        if (isNaN(cutoff.getTime())) { console.error('Uso: mark-legacy <fecha ISO>'); process.exit(1); }
        const snap = await db.collection('verifactu_registros')
            .where('estadoEnvioAEAT', '==', 'pendiente').limit(500).get();
        let n = 0;
        for (const d of snap.docs) {
            const r = d.data();
            const ts = r.createdAt && r.createdAt.toDate ? r.createdAt.toDate() : null;
            if (ts && ts < cutoff) {
                await d.ref.update({ estadoEnvioAEAT: 'descartado_legacy' });
                console.log(`   descartado: ${r.numSerieFactura} (${ts.toISOString()})`);
                n++;
            }
        }
        console.log(`✔ ${n} registros marcados descartado_legacy (anteriores a ${cutoff.toISOString()})`);
    }

    else if (cmd === 'activate') {
        const entorno = process.argv[3] === 'produccion' ? 'produccion' : 'pruebas';
        await db.collection('config').doc('verifactu_envio').set({ activo: true, entorno }, { merge: true });
        console.log(`✔ Envío ACTIVADO — entorno: ${entorno}`);
    }

    else if (cmd === 'deactivate') {
        await db.collection('config').doc('verifactu_envio').set({ activo: false }, { merge: true });
        console.log('✔ Envío DESACTIVADO');
    }

    else if (cmd === 'send') {
        const fn = firebase.app().functions('europe-west1').httpsCallable('verifactuSendNow');
        const res = await fn({});
        console.log('Resultado verifactuSendNow:\n', JSON.stringify(res.data, null, 2));
    }

    else if (cmd === 'status') {
        const cfg = await db.collection('config').doc('verifactu_envio').get();
        console.log('config/verifactu_envio:', JSON.stringify(cfg.exists ? cfg.data() : null, null, 2));
        for (const estado of ['pendiente', 'enviado', 'aceptado_con_errores', 'rechazado', 'bloqueado_sin_nif_destinatario', 'descartado_legacy']) {
            const s = await db.collection('verifactu_registros').where('estadoEnvioAEAT', '==', estado).limit(500).get();
            if (s.size) console.log(`   ${estado}: ${s.size}`);
        }
    }

    else {
        console.error('Comando desconocido:', cmd);
    }

    process.exit(0);
}

main().catch(e => { console.error('❌', e.message || e); process.exit(1); });
