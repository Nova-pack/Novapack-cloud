const { createCanvas, registerFont } = require('canvas');
const fs = require('fs');
const path = require('path');

// Registrar la fuente Xenotron
const fontPath = path.join(__dirname, 'public', 'fonts', 'Xenotron_Normal.ttf');
registerFont(fontPath, { family: 'Xenotron' });

// Crear un canvas de 512x512
const width = 512;
const height = 512;
const canvas = createCanvas(width, height);
const ctx = canvas.getContext('2d');

// Fondo negro
ctx.fillStyle = '#0a0a0ade'; // o '#000000'
ctx.fillRect(0, 0, width, height);

// Dibujar la letra N central en color corporativo
ctx.fillStyle = '#FF6600'; // Naranja Novapack
ctx.font = '350px "Xenotron"';
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
ctx.fillText('N', width / 2, height / 2 + 20); // Ajuste fino vertical

// Escribir el buffer a la imagen png
const buffer = canvas.toBuffer('image/png');
const outPath = path.join(__dirname, 'public', 'logo_n.png');
fs.writeFileSync(outPath, buffer);
console.log('Icono generado exitosamente en ' + outPath);
