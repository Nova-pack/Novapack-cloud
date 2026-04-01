const html = require('fs').readFileSync('public/admin.html', 'utf8');
const ids = ['modal-manage-destinations', 'admin-dest-edit-id', 'admin-dest-name', 'admin-dest-phone', 'admin-dest-nif', 'admin-dest-street', 'admin-dest-number', 'admin-dest-locality', 'admin-dest-cp', 'admin-dest-province', 'admin-dest-notes', 'admin-dest-list-body'];
ids.forEach(id => {
    const result = html.includes('id="' + id + '"') || html.includes("id='" + id + "'");
    console.log(id, ':', result);
});
