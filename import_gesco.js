/**
 * Import GESCO clients from clientes.xls into Firestore 'users' collection.
 * Maps: C0=idNum, C1=name, C2=address, C3=city, C4=cp, C5=phone, C8=nif
 */
const admin = require('firebase-admin');
const XLSX = require('xlsx');
const path = require('path');

// Initialize with project ID (uses ADC or firebase login token)
admin.initializeApp({
    projectId: 'novapack-68f05'
});
const db = admin.firestore();

async function importClients() {
    const filePath = path.join(__dirname, 'public', 'clientes.xls');
    
    // Read Excel
    const workbook = XLSX.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    
    console.log(`Excel cargado: ${rows.length} filas`);
    
    let imported = 0;
    let skipped = 0;
    let errors = [];
    
    // Process in batches of 500 (Firestore limit)
    let batch = db.batch();
    let batchCount = 0;
    
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const c0 = row[0]; // ID
        const c1 = row[1]; // Name
        
        // Skip section headers (no name in C1)
        if (!c1 || String(c1).trim() === '' || String(c1).includes(' - ')) {
            skipped++;
            continue;
        }
        
        const idNum = c0 ? String(Math.floor(Number(c0))) : '';
        const name = String(c1).trim();
        const street = row[2] ? String(row[2]).trim() : '';
        const city = row[3] ? String(row[3]).trim() : '';
        const cpRaw = row[4];
        const cp = cpRaw ? String(Math.floor(Number(cpRaw))).padStart(5, '0') : '';
        const phone = row[5] ? String(row[5]).trim() : '';
        const nif = row[8] ? String(row[8]).trim() : '';
        
        // Build address
        const parts = [];
        if (street) parts.push(street);
        if (city) parts.push(city);
        if (cp) parts.push(`(CP ${cp})`);
        const senderAddress = parts.join(', ');
        
        const clientData = {
            idNum: idNum,
            name: name,
            nif: nif,
            street: street,
            localidad: city,
            cp: cp,
            senderAddress: senderAddress,
            senderPhone: phone,
            role: 'client',
            email: '',
            importedFrom: 'GESCO',
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        };
        
        const docId = idNum ? `gesco_${idNum}` : `gesco_row_${i}`;
        
        try {
            batch.set(db.collection('users').doc(docId), clientData, { merge: true });
            batchCount++;
            imported++;
            
            // Commit every 499
            if (batchCount >= 499) {
                await batch.commit();
                console.log(`  Batch committed: ${imported} importados...`);
                batch = db.batch();
                batchCount = 0;
            }
        } catch (e) {
            errors.push(`Row ${i} (${name}): ${e.message}`);
        }
    }
    
    // Commit remaining
    if (batchCount > 0) {
        await batch.commit();
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('RESULTADO FINAL:');
    console.log(`  ✅ Importados: ${imported}`);
    console.log(`  ⏭️  Saltados: ${skipped}`);
    console.log(`  ❌ Errores: ${errors.length}`);
    if (errors.length > 0) {
        errors.slice(0, 10).forEach(e => console.log(`    - ${e}`));
    }
    console.log('='.repeat(50));
    
    process.exit(0);
}

importClients().catch(e => {
    console.error('FATAL ERROR:', e);
    process.exit(1);
});
