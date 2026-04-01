const html = require('fs').readFileSync('public/admin.html', 'utf8');
const checks = [
    'btn-add-phone', 'btn-close-phone-modal', 'btn-add-user', 'btn-close-modal', 'admin-t-receiver',
    'btn-gesco-import', 'btn-gesco-import-alt', 'btn-json-import', 'btn-json-import-alt', 'btn-admin-add-pkg'
];
checks.forEach(id => {
    const result = html.includes('id="' + id + '"') || html.includes('id=\'' + id + '\'');
    console.log('ID:', id, 'exists in HTML?', result);
});
