const fs = require('fs');
const u16 = fs.readFileSync('c:/NOVAPACK CLOUD/curl_admin.html', 'utf16le');
const u8 = fs.readFileSync('c:/NOVAPACK CLOUD/public/admin.html', 'utf8');
console.log('curl_admin.html lines:', u16.split('\n').length);
console.log('admin.html lines:', u8.split('\n').length);
console.log('curl_admin.html has modal:', u16.includes('add-user-modal'));
