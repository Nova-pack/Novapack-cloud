/**
 * LIMPIEZA DE CLIENTES QUE NO SON REALES
 * ======================================
 * El admin confirmo (2026-09-12) que los unicos clientes reales son:
 *
 *     LUIS MOLEON RECAMBIOS #106 y sus sucursales (Malaga, Sevilla, Cordoba)
 *     TALLERES SCORA MALAGA #1746
 *     AUTOCRISTAL SEVILLA   #1502
 *
 * Todo lo demas que estuviera activo es ruido de pruebas. Este script lo manda
 * a la PAPELERA con la misma mecanica que el boton "eliminar cliente" del admin
 * (mueve la ficha a /deleted_users con sus sedes y su agenda, y sus albaranes a
 * /deleted_tickets), asi que se deshace desde Papelera -> Clientes -> Restaurar.
 *
 * Las cuentas que no son de cliente (el propio admin, pruebas) NO se borran: se
 * marcan isSystemAccount para que dejen de contar como clientes.
 *
 *   node tools/limpiar_clientes_no_reales.js             ENSAYO (no escribe)
 *   node tools/limpiar_clientes_no_reales.js --aplicar   lo hace de verdad
 *
 * Antes de escribir nada vuelca un respaldo completo a tools/backups/.
 * NO toca las 75 fichas sin estrenar: esas son la cartera importada del sistema
 * antiguo, no ruido.
 */
const firebase = require('firebase/compat/app');
require('firebase/compat/auth');
require('firebase/compat/firestore');
const path = require('path'), fs = require('fs');

(function loadDotEnv() {
    fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/).forEach(function (l) {
        const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (!m) return;
        let v = m[2];
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
        if (process.env[m[1]] === undefined) process.env[m[1]] = v;
    });
})();

const APLICAR = process.argv.indexOf('--aplicar') >= 0;

// INTOCABLES. El script aborta si alguno se cuela en las listas de limpieza.
const REALES = {
    'gesco_106':                    'LUIS MOLEON RECAMBIOS, S.L. #106',
    '9ccIq26Ru6S8LAZN5LW5HpZ5h3g1': 'LUIS MOLEON MALAGA (sucursal)',
    'orBkZ4e5bgdUz1nOpKRjfEkjyZI2': 'LUIS MOLEON (sucursal)',
    'sQEXiMWx83PBe7M7T7HhXWH4kM52': 'LUIS MOLEON (sucursal)',
    '20nEisTdCgXyooxHb6wN0zzlngw2': 'TALLERES SCORA MALAGA #1746',
    'dJHxrY8Aiqd45vzEOPIw44Y0pTI3': 'AUTOCRISTAL SEVILLA #1502'
};

const A_PAPELERA = [
    ['Zc3ZcGfMLPapB4ONeqQkui5kiWC2', 'ALVIASA SEVILLA #1652'],
    ['w7AhCf0FNFVtpfVyBUBANWwAigJ3', 'ANDALUZA DE PARABRISAS S.L. #1042'],
    ['0mJvBPjatCx4dmH0q4Ex',         'SCORA MALAGA #1746 - ficha duplicada VACIA'],
    ['KCwoxP8ZQQRQOlcNjSx6nBw1TBy1', 'CLAUDIA #1747'],
    ['hXbkfJxnC3XZy4iIkqGCwBpI2HL2', 'DAVASA MALAGA #104 (ficha A)'],
    ['nb3rq3NR9Zg0ZHrpBnc0j2Yc6rf1', 'DAVASA MALAGA #104 (ficha B, clon de la A)'],
    ['35eQyYcdAbhTA5hMSAHJWtNL9iu2', 'JOSE ANT REAL DE LA VEGA #1013 - OJO: 5114 destinatarios'],
    ['gesco_60',                     'COVEI #60'],
    ['o3IqPf5AJXPFoAVoiF9I929wGqL2', 'ECOALBORAN #553 (sucursal de COVEI)']
];

const A_SISTEMA = [
    ['qzs4dFFKxtZ1kwmtgfprElt5Udk1', 'Cuenta del propio administrador'],
    ['xwBggin3dVM0feyTPf1uqD1SQXN2', 'Cuenta de pruebas USER'],
    ['FONc5LEEQvSedUA8xl4SCYyOAzo2', 'Perfil sintetico LUISMOLEON (el cliente real es gesco_106)']
];

// Numeros de cliente del ruido: sirven para barrer albaranes que no lleven uid.
const NUMEROS_RUIDO = ['1652', '1042', '1747', '104', '1013', '60', '553'];

const SUBCOLECCIONES = ['companies', 'destinations', 'config', 'nextId'];

(async function () {
    firebase.initializeApp({
        apiKey: process.env.FIREBASE_API_KEY,
        authDomain: 'novapack-68f05.firebaseapp.com',
        projectId: 'novapack-68f05'
    });
    await firebase.auth().signInWithEmailAndPassword(process.env.FIREBASE_ADMIN_EMAIL, process.env.FIREBASE_ADMIN_PASS);
    const db = firebase.firestore();

    console.log(APLICAR ? '*** APLICANDO ***\n' : '--- ENSAYO: no se escribe nada (usa --aplicar) ---\n');
    console.log('INTOCABLES:');
    Object.keys(REALES).forEach(function (k) { console.log('   . ' + REALES[k]); });
    console.log('');

    // Guardia dura
    A_PAPELERA.concat(A_SISTEMA).forEach(function (par) {
        if (REALES[par[0]]) { console.error('ABORTO: ' + par[0] + ' es un cliente REAL.'); process.exit(1); }
    });

    const respaldo = { fecha: new Date().toISOString(), usuarios: {}, subcolecciones: {}, tickets: {} };
    function meta() {
        return {
            _deletedAt: firebase.firestore.FieldValue.serverTimestamp(),
            _deletedBy: 'admin',
            _deleteReason: 'Cuenta de pruebas - limpieza previa a produccion',
            _deleteSource: 'limpiar_clientes_no_reales'
        };
    }

    let totFichas = 0, totTk = 0, totSub = 0;

    for (const par of A_PAPELERA) {
        const id = par[0], etiqueta = par[1];
        const ref = db.collection('users').doc(id);
        const snap = await ref.get();
        if (!snap.exists) { console.log('SALTO     ' + etiqueta + ' - la ficha ya no existe\n'); continue; }
        const data = snap.data();
        respaldo.usuarios[id] = data;

        // Albaranes: por uid y, si es ruido conocido, tambien por numero de cliente
        const vistos = {};
        const tickets = [];
        const consultas = [await db.collection('tickets').where('uid', '==', id).get()];
        if (data.idNum && NUMEROS_RUIDO.indexOf(String(data.idNum)) >= 0) {
            consultas.push(await db.collection('tickets').where('clientIdNum', '==', String(data.idNum)).get());
        }
        consultas.forEach(function (s) {
            s.forEach(function (d) { if (!vistos[d.id]) { vistos[d.id] = 1; tickets.push(d); } });
        });

        const subs = {};
        for (const nombre of SUBCOLECCIONES) {
            const s = await ref.collection(nombre).get();
            if (s.size) subs[nombre] = s.docs;
        }
        respaldo.subcolecciones[id] = {};
        Object.keys(subs).forEach(function (n) {
            respaldo.subcolecciones[id][n] = subs[n].map(function (d) { return { id: d.id, data: d.data() }; });
        });
        respaldo.tickets[id] = tickets.map(function (d) { return { id: d.id, data: d.data() }; });

        const nSub = Object.keys(subs).reduce(function (a, n) { return a + subs[n].length; }, 0);
        const detalle = Object.keys(subs).map(function (n) { return n + ':' + subs[n].length; }).join(', ') || 'ninguna';
        console.log('PAPELERA  ' + etiqueta);
        console.log('          ficha + ' + tickets.length + ' albaran(es) + ' + nSub + ' doc(s) de subcoleccion (' + detalle + ')');

        if (APLICAR) {
            let lote = db.batch(), ops = 0;
            async function soltar() { if (ops >= 400) { await lote.commit(); lote = db.batch(); ops = 0; } }

            lote.set(db.collection('deleted_users').doc(id),
                     Object.assign({}, data, meta(), { _originalDocId: id }));
            ops++;

            for (const d of tickets) {
                lote.set(db.collection('deleted_tickets').doc(d.id),
                         Object.assign({}, d.data(), meta(), { _originalDocId: d.id }));
                ops++;
                lote.delete(d.ref);
                ops++;
                await soltar();
            }
            for (const nombre of Object.keys(subs)) {
                for (const d of subs[nombre]) {
                    lote.set(db.collection('deleted_users').doc(id).collection(nombre).doc(d.id), d.data());
                    ops++;
                    lote.delete(d.ref);
                    ops++;
                    await soltar();
                }
            }
            lote.delete(ref);
            ops++;
            await lote.commit();
            console.log('          OK - a la papelera');
        }
        totFichas++; totTk += tickets.length; totSub += nSub;
        console.log('');
    }

    for (const par of A_SISTEMA) {
        const id = par[0], motivo = par[1];
        const ref = db.collection('users').doc(id);
        const snap = await ref.get();
        if (!snap.exists) { console.log('SALTO     ' + id + ' - no existe\n'); continue; }
        respaldo.usuarios[id] = snap.data();
        console.log('SISTEMA   ' + String(snap.data().name || id).slice(0, 40) + '  -  ' + motivo);
        console.log('          se marca isSystemAccount (no se borra: debajo cuelga su sesion)');
        if (APLICAR) {
            await ref.update({ isSystemAccount: true, systemReason: motivo });
            console.log('          OK - marcada');
        }
        console.log('');
    }

    const dir = path.join(__dirname, 'backups');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const f = path.join(dir, 'limpieza_clientes_' + new Date().toISOString().replace(/[:.]/g, '-') + '.json');
    fs.writeFileSync(f, JSON.stringify(respaldo, null, 2));

    console.log('=========================================');
    console.log('Respaldo COMPLETO (fichas, subcolecciones y albaranes): ' + f);
    console.log((APLICAR ? 'HECHO: ' : 'ENSAYO - se harian: ') + totFichas + ' ficha(s) a la papelera, '
              + totTk + ' albaran(es) y ' + totSub + ' doc(s) de subcoleccion.');
    console.log(APLICAR ? 'Se deshace desde el admin: Papelera -> Clientes -> Restaurar.'
                        : 'Repite con --aplicar para hacerlo de verdad.');
    process.exit(0);
})().catch(function (e) { console.error('ERROR:', e.message); process.exit(1); });
