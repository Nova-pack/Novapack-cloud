const jsonA = [
    { A: "Nombre", B: "Direccion", C: "CP" },
    { A: "Juan", B: "Calle 1", C: "14001" },
    { A: "Pedro", B: "Calle 2", C: "18001" }
];
let headerRowIndex = 0;
let bestScore = 0;
const kwds = ['nombre', 'destinatario', 'cliente', 'postal', 'cp', 'c.p.', 'c.p', 'direccion', 'provincia', 'localidad', 'poblacion', 'bulto', 'bultos', 'cantidad', 'telefono', 'movil', 'municipio', 'destino'];
for (let r = 0; r < Math.min(jsonA.length, 15); r++) {
    let score = 0;
    Object.values(jsonA[r]).forEach(val => {
        if (typeof val === 'string') {
            const lVal = val.toLowerCase().trim().replace(/_/g, ' ');
            if (kwds.some(k => lVal === k || lVal.startsWith(k + " "))) score++;
        }
    });
    if (score > bestScore) { bestScore = score; headerRowIndex = r; }
    if (score >= 3) break;
}
const headers = jsonA[headerRowIndex];
console.log("Headers Row:", headerRowIndex, "Headers:", headers);
for (let i = headerRowIndex + 1; i < jsonA.length; i++) {
    const rawRow = jsonA[i];
    const getVal = (...possibleHeaders) => {
        for (let h of possibleHeaders) {
            for (let col in headers) {
                if (headers[col] && headers[col].toString().toLowerCase() === h.toLowerCase()) {
                    if (rawRow[col]) return rawRow[col];
                }
            }
        }
        return "";
    };
    const receiver = getVal('nombre_cliente', 'Nombre', 'Destinatario');
    const cp = getVal('cod_postal', 'CP');
    console.log("Row", i, "-> receiver:", receiver, "cp:", cp);
}
