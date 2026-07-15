#!/usr/bin/env node
// =============================================================
// VERIFACTU — Empaquetador de certificados para Secret Manager
// =============================================================
// Convierte los certificados .pfx/.p12 de cada empresa en el
// JSON que espera el secret VERIFACTU_CERTS.
//
// Uso (tríos NIF ruta contraseña, tantos como empresas):
//   node build_certs_json.js B11111111 ./empresa1.pfx clave1 \
//                            B22222222 ./empresa2.pfx clave2 \
//                            B33333333 ./empresa3.pfx clave3
//
// Genera certs.json en este directorio y muestra el comando
// exacto para subirlo a Firebase Secret Manager.
//
// ⚠️ certs.json contiene los certificados y sus contraseñas.
//    BORRARLO después de subir el secret. Está en .gitignore.
// =============================================================
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
if (args.length === 0 || args.length % 3 !== 0) {
    console.error('Uso: node build_certs_json.js <NIF> <ruta.pfx> <contraseña> [<NIF> <ruta.pfx> <contraseña> ...]');
    process.exit(1);
}

const out = {};
for (let i = 0; i < args.length; i += 3) {
    const nif = String(args[i]).replace(/[\s.\-]/g, '').toUpperCase();
    const ruta = args[i + 1];
    const pass = args[i + 2];
    if (!fs.existsSync(ruta)) {
        console.error(`❌ No existe el fichero: ${ruta}`);
        process.exit(1);
    }
    const buf = fs.readFileSync(ruta);
    out[nif] = { pfxBase64: buf.toString('base64'), passphrase: pass };
    console.log(`✔ ${nif} ← ${path.basename(ruta)} (${buf.length} bytes)`);
}

const outPath = path.join(__dirname, 'certs.json');
fs.writeFileSync(outPath, JSON.stringify(out));
console.log(`\n✅ Generado: ${outPath}`);
console.log('\nAhora sube el secret con:');
console.log('  firebase functions:secrets:set VERIFACTU_CERTS --project novapack-68f05 --data-file "' + outPath + '"');
console.log('\nY DESPUÉS BORRA certs.json:');
console.log('  del "' + outPath + '"');
