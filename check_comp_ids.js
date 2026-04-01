const html = require('fs').readFileSync('public/admin.html', 'utf8');
const ids = ['manage-comp-uid', 'modal-manage-companies', 'company-form-area', 'edit-company-id', 'comp-name', 'comp-prefix', 'comp-start-num', 'comp-street', 'comp-number', 'comp-city', 'comp-cp', 'comp-province', 'comp-phone', 'comp-subtariff-id', 'company-manage-list-body'];
ids.forEach(id => {
    const result = html.includes('id="' + id + '"') || html.includes("id='" + id + "'");
    console.log(id, ':', result);
});
