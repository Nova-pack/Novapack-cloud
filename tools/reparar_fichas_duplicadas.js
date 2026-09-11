/**
 * REPARACION DE FICHAS DUPLICADAS
 * ===============================
 * La app clonaba la ficha entera del cliente al entrar, asi que cada cliente
 * acababa con DOS documentos y el segundo aparecia en el admin como un cliente
 * mas: mismo numero, mismo NIF, mismo login. Peor: los datos se repartian entre
 * los dos (DAVASA tenia los albaranes en uno y la numeracion configurada en el
 * otro, arrancando en 1 y en 1001 respectivamente).
 *
 * El login ya no clona (escribe solo un puntero). Este script arregla lo que
 * quedo hecho antes:
 *
 *   RETIRAR   ficha duplicada VACIA -> a la papelera (deleted:true, recuperable)
 *   ENLAZAR   documento de sesion con datos debajo -> se marca isLinkDoc y se le
 *             quitan los campos de cliente (nombre, nº, NIF...). Las
 *             subcolecciones NO se tocan: ahi siguen la sede y la agenda, que es
 *             donde la app las lee.
 *   SISTEMA   cuentas que no son clientes (admin, pruebas) -> isSystemAccount
 *
 * Nada se borra de verdad y todo se guarda antes en tools/backups/.
 *
 *   node tools/reparar_fichas_duplicadas.js             ENSAYO (no escribe)
 *   node tools/reparar_fichas_duplicadas.js --aplicar   aplica de verdad
 */
const firebase = require('firebase/compat/app');
require('firebase/compat/auth');
require('firebase/compat/firestore');
const path = require('path'), fs = require('fs');

(function loadDotEnv() {
    const p = path.join(__dirname, '..', '.env');
    fs.readFileSync(p, 'utf8').split(/\r?\n/).forEach(l => {
        const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (!m) return;
        let v = m[2];
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
        if (process.env[m[1]] === undefined) process.env[m[1]] = v;
    });
})();

const APLICAR = process.argv.includes('--aplicar');

// Campos que convierten un documento en "ficha de cliente". Al enlazar se
// quitan para que deje de suplantar a uno.
const CAMPOS_CLIENTE = ['name', 'idNum', 'nif', 'email', 'loginEmail', 'loginPasswordPlain',
                        'companyName', 'phone', 'senderPhone', 'senderAddress', 'address',
                        'street', 'number', 'localidad', 'cp', 'province', 'tariffId',
                        'parentClientId', 'id'];

const PLAN = [
    { accion: 'RETIRAR', doc: '0mJvBPjatCx4dmH0q4Ex',
      motivo: 'SCORA #1746 duplicada y VACIA: 0 albaranes, 0 agenda, 0 sedes, sin acceso. La buena es 20nEisTdCgXyooxHb6wN0zzlngw2 (205 albaranes, 33 clientes).' },

    { accion: 'ENLAZAR', doc: 'nb3rq3NR9Zg0ZHrpBnc0j2Yc6rf1', maestra: 'hXbkfJxnC3XZy4iIkqGCwBpI2HL2',
      motivo: 'DAVASA #104: es el CLON de hXbkf... (lo dice su campo id interno y comparten createdAt al segundo). Deja de figurar como cliente; su sede y su agenda siguen intactas debajo, que es de donde la app las lee.' },

    { accion: 'ENLAZAR', doc: 'FONc5LEEQvSedUA8xl4SCYyOAzo2', maestra: 'gesco_106',
      motivo: 'Perfil sintetico "LUISMOLEON" creado antes de vincular el acceso. El cliente real es gesco_106, que ya tiene el authUid de esta sesion.' },

    { accion: 'SISTEMA', doc: 'qzs4dFFKxtZ1kwmtgfprElt5Udk1',
      motivo: 'Cuenta del propio administrador entrando en la app de cliente. No es un cliente.' },

    { accion: 'SISTEMA', doc: 'xwBggin3dVM0feyTPf1uqD1SQXN2',
      motivo: 'Cuenta de pruebas "USER" (usuario@desconocido.com). No es un cliente.' }
];

(async () => {
    firebase.initializeApp({
        apiKey: process.env.FIREBASE_API_KEY,
        authDomain: 'novapack-68f05.firebaseapp.com',
        projectId: 'novapack-68f05'
    });
    await firebase.auth().signInWithEmailAndPassword(process.env.FIREBASE_ADMIN_EMAIL, process.env.FIREBASE_ADMIN_PASS);
    const db = firebase.firestore();

    console.log(APLICAR ? '*** APLICANDO CAMBIOS ***\n' : '--- ENSAYO: no se escribe nada (usa --aplicar) ---\n');

    const respaldo = { fecha: new Date().toISOString(), docs: {} };
    const acciones = [];

    for (const p of PLAN) {
        const ref = db.collection('users').doc(p.doc);
        const snap = await ref.get();
        if (!snap.exists) { console.log('[' + p.doc + '] NO EXISTE — salto\n'); continue; }
        const x = snap.data();
        respaldo.docs[p.doc] = x;

        // Comprobacion de seguridad: nunca retirar algo que tenga datos
        const nTk = (await db.collection('tickets').where('uid', '==', p.doc).limit(1).get()).size;
        const nDest = (await ref.collection('destinations').limit(1).get()).size;
        const nComp = (await ref.collection('companies').limit(1).get()).size;

        console.log(p.accion + '  [' + p.doc + ']  ' + String(x.name || '-').slice(0, 40) + '  #' + (x.idNum || '?'));
        console.log('   ' + p.motivo);
        console.log('   contenido: albaranes=' + nTk + '  agenda=' + nDest + '  sedes=' + nComp);

        if (p.accion === 'RETIRAR' && (nTk || nDest || nComp)) {
            console.log('   ⛔ ABORTO esta accion: tiene datos, no se retira.\n');
            continue;
        }

        let cambios;
        if (p.accion === 'RETIRAR') {
            cambios = {
                deleted: true,
                deletedAt: firebase.firestore.FieldValue.serverTimestamp(),
                deletedReason: 'Ficha duplicada vacia — reparacion ' + new Date().toISOString().slice(0, 10)
            };
        } else if (p.accion === 'ENLAZAR') {
            cambios = {
                isLinkDoc: true,
                masterDocId: p.maestra,
                authUid: x.authUid || p.doc,
                linkedAt: firebase.firestore.FieldValue.serverTimestamp(),
                linkedReason: p.motivo
            };
            CAMPOS_CLIENTE.forEach(c => { if (x[c] !== undefined) cambios[c] = firebase.firestore.FieldValue.delete(); });
        } else {
            cambios = { isSystemAccount: true, systemReason: p.motivo };
        }

        const borrados = (p.accion === 'ENLAZAR') ? CAMPOS_CLIENTE.filter(c => x[c] !== undefined) : [];
        const anadidos = Object.keys(cambios).filter(k => borrados.indexOf(k) < 0);
        console.log('   se anade:  ' + anadidos.join(', '));
        if (borrados.length) console.log('   se QUITA:  ' + borrados.join(', '));

        if (APLICAR) {
            await ref.update(cambios);
            console.log('   ✔ aplicado');
        }
        acciones.push(p.doc);
        console.log('');
    }

    const dir = path.join(__dirname, 'backups');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const f = path.join(dir, 'fichas_duplicadas_' + new Date().toISOString().replace(/[:.]/g, '-') + '.json');
    fs.writeFileSync(f, JSON.stringify(respaldo, null, 2));
    console.log('Respaldo de las fichas ORIGINALES: ' + f);
    console.log(APLICAR ? ('HECHO: ' + acciones.length + ' ficha(s) reparadas.')
                        : ('ENSAYO: se repararian ' + acciones.length + ' ficha(s). Repite con --aplicar.'));
    process.exit(0);
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
