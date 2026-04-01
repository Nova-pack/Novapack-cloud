/**
 * NOVAPACK - Direct Excel Client Import Script
 * Imports all 4 Excel files into Cooper's Firestore destinations collection.
 * Usage: node import_cooper_clients.js
 */
const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const { getFirestore, collection, doc, writeBatch } = require('firebase/firestore');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

// Firebase config (same as firebase-config.js)
const firebaseConfig = {
    apiKey: "AIzaSyCHIqqwPtx5SFzf5d-cb6H0VSwX5eP_5lE",
    authDomain: "novapack-68f05.firebaseapp.com",
    projectId: "novapack-68f05",
    storageBucket: "novapack-68f05.firebasestorage.app",
    messagingSenderId: "139474143296",
    appId: "1:139474143296:web:92e8bf80a50adba0cd77a5",
};

// Cooper credentials
const USER_EMAIL = 'cooper@gmail.com';
const USER_PASSWORD = 'COOPER2026';

// Excel folder
const EXCEL_FOLDER = path.join(__dirname, 'public', 'CLIENTES COOPER');

async function main() {
    console.log('=== NOVAPACK - Importación Masiva de Clientes ===\n');

    // 1. Initialize Firebase
    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);

    // 2. Authenticate
    console.log(`🔐 Autenticando como ${USER_EMAIL}...`);
    const userCred = await signInWithEmailAndPassword(auth, USER_EMAIL, USER_PASSWORD);
    const uid = userCred.user.uid;
    console.log(`✅ Autenticado. UID: ${uid}\n`);

    // 3. Read all Excel files
    const files = fs.readdirSync(EXCEL_FOLDER).filter(f => f.endsWith('.xlsx'));
    console.log(`📁 Archivos encontrados: ${files.join(', ')}\n`);

    const allClients = new Map(); // Global dedup by client name

    for (const file of files) {
        const fullPath = path.join(EXCEL_FOLDER, file);
        const wb = XLSX.readFile(fullPath);
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        console.log(`📊 ${file}: ${rows.length} filas`);

        // Map columns (known structure: CLIENTE, DIRECCION, POBLACIÓN, PROVINCIA, TELÉFONO)
        const colKeys = Object.keys(rows[0] || {});
        const findCol = (...aliases) => colKeys.find(k => aliases.some(a => k.toLowerCase().includes(a.toLowerCase())));

        const colName     = findCol('cliente', 'nombre', 'name');
        const colAddress  = findCol('direccion', 'dirección', 'address', 'calle');
        const colCity     = findCol('poblacion', 'población', 'localidad', 'ciudad');
        const colProvince = findCol('provincia', 'zone', 'zona');
        const colPhone    = findCol('telefono', 'teléfono', 'phone', 'telf');
        const colCP       = findCol('cp', 'código postal', 'c.p.');

        if (!colName) {
            console.log(`  ⚠️ No se encontró columna de nombre. Saltando.`);
            continue;
        }

        let skipped = 0;
        rows.forEach(row => {
            let rawName = String(row[colName] || '').trim();
            if (!rawName) { skipped++; return; }

            // Clean name: remove leading numeric codes like "148508 - "
            const cleanName = rawName.replace(/^\d+\s*[-–]\s*/, '').trim().toUpperCase();
            if (!cleanName || cleanName === '.' || cleanName.length < 2) { skipped++; return; }

            const addr = {
                id: "addr_" + Math.random().toString(36).substr(2, 9),
                address: colAddress ? String(row[colAddress] || '').trim() : '',
                street: colAddress ? String(row[colAddress] || '').trim() : '',
                number: '',
                localidad: colCity ? String(row[colCity] || '').trim() : '',
                cp: colCP ? String(row[colCP] || '').trim() : '',
                province: colProvince ? String(row[colProvince] || '').trim() : ''
            };

            if (!allClients.has(cleanName)) {
                allClients.set(cleanName, {
                    name: cleanName,
                    phone: colPhone ? String(row[colPhone] || '').trim() : '',
                    nif: '',
                    email: '',
                    notes: '',
                    addresses: []
                });
            }

            const client = allClients.get(cleanName);
            // Avoid duplicate addresses
            const sigNew = (addr.address + addr.localidad + addr.cp).replace(/\s/g, '').toLowerCase();
            const isDup = client.addresses.some(a => (a.address + a.localidad + a.cp).replace(/\s/g, '').toLowerCase() === sigNew);
            if (!isDup && addr.address) {
                client.addresses.push(addr);
            }
            // Update phone if missing
            if (!client.phone && colPhone) {
                client.phone = String(row[colPhone] || '').trim();
            }
        });
        console.log(`  ✅ Procesado (${skipped} filas omitidas por nombre vacío/inválido)`);
    }

    console.log(`\n📋 Total clientes únicos: ${allClients.size}\n`);

    // 4. Upload to Firestore in batches
    const clientArray = Array.from(allClients.values());
    let batch = writeBatch(db);
    let count = 0;
    let totalImported = 0;
    let batchNum = 1;

    // Path: users/{uid}/destinations/{docId}
    for (const c of clientArray) {
        const docId = (c.name || "").replace(/[^a-z0-9\-_]/gi, '_').toLowerCase();
        if (!docId || docId.length < 2) continue;

        const docRef = doc(db, 'users', uid, 'destinations', docId);
        batch.set(docRef, {
            name: c.name,
            phone: c.phone || '',
            nif: c.nif || '',
            email: c.email || '',
            notes: c.notes || '',
            addresses: c.addresses || []
        }, { merge: true });

        count++;
        totalImported++;

        // Firestore batch limit = 500
        if (count >= 450) {
            console.log(`  💾 Enviando batch #${batchNum} (${count} docs)...`);
            await batch.commit();
            batch = writeBatch(db);
            count = 0;
            batchNum++;
        }
    }

    // Commit remaining
    if (count > 0) {
        console.log(`  💾 Enviando batch #${batchNum} (${count} docs)...`);
        await batch.commit();
    }

    console.log(`\n✅ ¡IMPORTACIÓN COMPLETADA!`);
    console.log(`   ${totalImported} clientes importados a Firestore para ${USER_EMAIL} (UID: ${uid})`);
    console.log(`   Ruta: users/${uid}/destinations/`);

    process.exit(0);
}

main().catch(err => {
    console.error('❌ Error fatal:', err.message);
    process.exit(1);
});
