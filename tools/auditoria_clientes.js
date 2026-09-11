/**
 * AUDITORIA DE FICHAS DE CLIENTE — solo lectura, no escribe nada.
 * =============================================================
 * Responde a una pregunta concreta: "¿la app va a funcionar igual para TODOS
 * mis clientes?". La app es la misma para todos; lo que cambia es la FORMA de
 * los datos, y es ahi donde se rompe. Este script encuentra las fichas mal
 * formadas ANTES de que el cliente llame por telefono.
 *
 *   node tools/auditoria_clientes.js            (solo los que ya usan la app)
 *   node tools/auditoria_clientes.js --todos    (tambien los que no han entrado)
 *
 * Lo que revisa, y por que importa cada cosa:
 *   alias-id        el campo 'id' guardado DENTRO del documento no coincide con
 *                   su docId. Es un alias heredado y hace que la app busque los
 *                   datos del cliente en la ficha equivocada.
 *   nº-duplicado    dos fichas con el mismo numero de cliente: albaranes e
 *                   informes se reparten entre las dos.
 *   login-duplicado el mismo correo de acceso en dos fichas: al entrar, la app
 *                   tiene que adivinar cual es la buena.
 *   padre-roto      sucursal cuyo parentClientId no existe: se queda sin la
 *                   agenda compartida de su empresa.
 *   sin-sede        no tiene companies/comp_main: de ahi salen la numeracion de
 *                   albaran y la direccion de recogida. (Normal si aun no ha
 *                   entrado nunca: la app la crea en el primer acceso.)
 *   sede-sin-direccion  la sede existe pero sin direccion: el albaran sale sin
 *                   punto de recogida valido.
 *   sin-nif         bloquea la adjudicacion de portes debidos y la facturacion.
 *   sintetica       idNum == docId: perfil creado sobre la marcha porque no se
 *                   encontro ficha. Suelen ser cuentas de prueba.
 */
const firebase = require('firebase/compat/app');
require('firebase/compat/auth');
require('firebase/compat/firestore');
const path = require('path'), fs = require('fs');

(function loadDotEnv() {
    const p = path.join(__dirname, '..', '.env');
    if (!fs.existsSync(p)) { console.error('Falta .env'); process.exit(1); }
    fs.readFileSync(p, 'utf8').split(/\r?\n/).forEach(l => {
        const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (!m) return;
        let v = m[2];
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
        if (process.env[m[1]] === undefined) process.env[m[1]] = v;
    });
})();

const TODOS = process.argv.includes('--todos');

(async () => {
    firebase.initializeApp({
        apiKey: process.env.FIREBASE_API_KEY,
        authDomain: 'novapack-68f05.firebaseapp.com',
        projectId: 'novapack-68f05'
    });
    await firebase.auth().signInWithEmailAndPassword(process.env.FIREBASE_ADMIN_EMAIL, process.env.FIREBASE_ADMIN_PASS);
    const db = firebase.firestore();

    const snap = await db.collection('users').get();
    const todos = [];
    snap.forEach(d => todos.push({ docId: d.id, ...d.data() }));
    const porDocId = {};
    todos.forEach(u => porDocId[u.docId] = u);

    // Quien usa la app de verdad: ha entrado alguna vez (authUid) o tiene albaranes
    const usados = new Set();
    (await db.collection('tickets').get()).forEach(d => {
        const t = d.data();
        if (t.uid) usados.add(t.uid);
        if (t.clientIdNum) usados.add('num:' + t.clientIdNum);
    });

    const conAcceso = todos.filter(u => !u.deleted && u.idNum && (u.loginEmail || u.email));
    const activos = conAcceso.filter(u => u.authUid || usados.has(u.docId) || usados.has('num:' + u.idNum));
    const objetivo = TODOS ? conAcceso : activos;

    console.log('Fichas con acceso: ' + conAcceso.length
              + '   ·   que ya usan la app: ' + activos.length
              + '   ·   sin estrenar: ' + (conAcceso.length - activos.length));
    console.log('Auditando: ' + objetivo.length + (TODOS ? ' (todas)' : ' (solo las que usan la app)') + '\n');

    const prob = {};
    const marca = (docId, t) => { (prob[docId] = prob[docId] || []).push(t); };

    const porNum = {}, porLogin = {};
    objetivo.forEach(u => {
        (porNum[String(u.idNum)] = porNum[String(u.idNum)] || []).push(u.docId);
        (porLogin[String(u.loginEmail || u.email).toLowerCase()] = porLogin[String(u.loginEmail || u.email).toLowerCase()] || []).push(u.docId);
    });
    Object.values(porNum).filter(v => v.length > 1).forEach(v => v.forEach(d => marca(d, 'nº-duplicado')));
    Object.values(porLogin).filter(v => v.length > 1).forEach(v => v.forEach(d => marca(d, 'login-duplicado')));

    for (const u of objetivo) {
        if (u.id && u.id !== u.docId) marca(u.docId, 'alias-id');
        if (String(u.idNum) === String(u.docId)) marca(u.docId, 'sintetica');
        if (!u.nif) marca(u.docId, 'sin-nif');
        if (u.parentClientId) {
            const ok = porDocId[String(u.parentClientId)]
                    || todos.find(t => String(t.idNum) === String(u.parentClientId));
            if (!ok) marca(u.docId, 'padre-roto');
        }
        try {
            const c = await db.collection('users').doc(u.docId).collection('companies').doc('comp_main').get();
            if (!c.exists) { if (activos.includes(u)) marca(u.docId, 'sin-sede'); }
            else {
                const x = c.data();
                if (!x.address || /no configurada/i.test(x.address)) marca(u.docId, 'sede-sin-direccion');
            }
        } catch (e) { marca(u.docId, 'sede-ilegible'); }
    }

    const tipos = {};
    Object.values(prob).forEach(l => l.forEach(t => tipos[t] = (tipos[t] || 0) + 1));

    console.log('================ RESUMEN ================');
    if (!Object.keys(tipos).length) console.log('  Sin incidencias.');
    Object.entries(tipos).sort((a, b) => b[1] - a[1])
        .forEach(([t, n]) => console.log('  ' + String(n).padStart(3) + '  ' + t));

    const rotos = Object.keys(prob).length;
    console.log('\n  Con alguna incidencia: ' + rotos + ' de ' + objetivo.length);
    console.log('  Limpias:               ' + (objetivo.length - rotos) + ' de ' + objetivo.length);

    if (rotos) {
        console.log('\n================ DETALLE ================');
        Object.entries(prob)
            .sort((a, b) => b[1].length - a[1].length)
            .forEach(([d, l]) => {
                const u = porDocId[d] || {};
                console.log('  [' + d + ']');
                console.log('      #' + (u.idNum || '?') + '  ' + String(u.name || '-').slice(0, 45));
                console.log('      ' + l.join(', '));
            });
    }
    process.exit(0);
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
