import os
import re

path = r'c:\NOVAPACK CLOUD\public\admin.html'

with open(path, 'r', encoding='utf-8') as f:
    html = f.read()

# Replace openAddBillingCompanyModal chunk completely
old_func_regex = r"async function openAddBillingCompanyModal\(\) \{.*?\}\s*async function deleteBillingCompany"
new_funcs = '''
            async function openAddBillingCompanyModal(id = null) {
                const modal = document.getElementById('modal-billing-company');
                const title = document.getElementById('billing-comp-title');
                
                document.getElementById('billing-comp-id').value = id || '';
                
                if (id && billingCompaniesMap[id]) {
                    title.textContent = '✏️ Editar Filial Central';
                    const data = billingCompaniesMap[id];
                    document.getElementById('billing-comp-name').value = data.name || '';
                    document.getElementById('billing-comp-nif').value = data.nif || '';
                    document.getElementById('billing-comp-address').value = data.address || '';
                    document.getElementById('billing-comp-phone').value = data.phone || '';
                    document.getElementById('billing-comp-shortid').value = data.shortId || '';
                    document.getElementById('billing-comp-iban').value = data.iban || '';
                    
                    if(data.iban && window.getBankName) {
                        document.getElementById('billing-comp-bank-name').textContent = window.getBankName(data.iban);
                    } else {
                        document.getElementById('billing-comp-bank-name').textContent = '';
                    }
                } else {
                    title.textContent = '🏢 Añadir Filial Central';
                    document.getElementById('billing-comp-name').value = '';
                    document.getElementById('billing-comp-nif').value = '';
                    document.getElementById('billing-comp-address').value = '';
                    document.getElementById('billing-comp-phone').value = '';
                    document.getElementById('billing-comp-shortid').value = '';
                    document.getElementById('billing-comp-iban').value = '';
                    document.getElementById('billing-comp-bank-name').textContent = '';
                }
                
                modal.style.display = 'flex';
                window.scrollTo(0, 0);
                modal.scrollTop = 0;
            }

            async function saveBillingCompany() {
                const id = document.getElementById('billing-comp-id').value;
                const name = document.getElementById('billing-comp-name').value.trim().toUpperCase();
                const nif = document.getElementById('billing-comp-nif').value.trim().toUpperCase();
                const address = document.getElementById('billing-comp-address').value.trim();
                const phone = document.getElementById('billing-comp-phone').value.trim();
                const shortId = document.getElementById('billing-comp-shortid').value.trim().toUpperCase();
                const iban = document.getElementById('billing-comp-iban').value.trim().toUpperCase();
                
                if (!name || !nif || !address) {
                    alert("Por favor, rellena los campos obligatorios: Nombre, NIF y Dirección.");
                    return;
                }
                
                showLoading();
                try {
                    const data = {
                        name, nif, address, phone, shortId, iban,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    };
                    
                    if (id) {
                        await db.collection('billing_companies').doc(id).update(data);
                        alert("✅ Filial modificada con éxito.");
                    } else {
                        data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                        await db.collection('billing_companies').add(data);
                        alert("✅ Filial creada con éxito.");
                    }
                    
                    document.getElementById('modal-billing-company').style.display='none';
                    await loadBillingCompanies();
                } catch(e) {
                    alert("Error guardando filial: " + e.message);
                } finally {
                    hideLoading();
                }
            }

            async function deleteBillingCompany'''
html = re.sub(old_func_regex, new_funcs, html, flags=re.DOTALL)

# Inject option parsing into loadBillingCompanies()
old_load = "if (adminTicketBillingSelect) {"
new_load = '''const clientBillingSelect = document.getElementById('new-user-billing-company');
                    if (clientBillingSelect) {
                        clientBillingSelect.innerHTML = '<option value="">-- Por Defecto (Central) --</option>';
                    }
                    if (adminTicketBillingSelect) {'''
html = html.replace(old_load, new_load, 1)

old_load_opt = "if (adminTicketBillingSelect) {"
new_load_opt = '''if (clientBillingSelect) {
                            clientBillingSelect.innerHTML += `<option value="${doc.id}">${data.name}</option>`;
                        }
                        if (adminTicketBillingSelect) {'''
html = html.replace(old_load_opt, new_load_opt, 1)

old_actions_btn = """<td><button class="btn btn-sm btn-outline" style="border-color:#ff4444; color:#ff4444; padding:5px 10px;" onclick="deleteBillingCompany('${doc.id}')">🗑️ Eliminar</button></td>"""
new_actions_btn = """<td>
                                <div style="display:flex; gap:5px;">
                                    <button class="btn btn-sm btn-outline" style="border-color:var(--brand-primary); color:white; padding:5px 10px;" onclick="openAddBillingCompanyModal('${doc.id}')">✏️ Editar</button>
                                    <button class="btn btn-sm btn-outline" style="border-color:#ff4444; color:#ff4444; padding:5px 10px;" onclick="deleteBillingCompany('${doc.id}')">🗑️ Eliminar</button>
                                </div>
                            </td>"""
html = html.replace(old_actions_btn, new_actions_btn)

iban_listen = '''
            document.getElementById('billing-comp-iban').addEventListener('input', (e) => {
                let val = e.target.value.toUpperCase().replace(/[^\\dA-Z]/g, '');
                e.target.value = val.match(/.{1,4}/g)?.join(' ') || '';
                if(window.getBankName) document.getElementById('billing-comp-bank-name').textContent = window.getBankName(val);
            });
'''
if iban_listen.strip() not in html:
    html = html.replace("async function loadBillingCompanies() {", iban_listen + "\\n            async function loadBillingCompanies() {")

old_onsubmit1 = "const sepaDate = document.getElementById('new-user-sepa-date').value;"
new_onsubmit1 = "const sepaDate = document.getElementById('new-user-sepa-date').value;\\n                    const billingCompanyId = document.getElementById('new-user-billing-company') ? document.getElementById('new-user-billing-company').value : '';"
html = html.replace(old_onsubmit1, new_onsubmit1)

old_onsubmit2 = "idNum: idNumStr, name, email, password, tariffId, iban, sepaRef, sepaDate,"
new_onsubmit2 = "idNum: idNumStr, name, email, password, tariffId, iban, sepaRef, sepaDate, billingCompanyId,"
html = html.replace(old_onsubmit2, new_onsubmit2)

old_new_user = "document.getElementById('new-user-id-num').value = getNextUserId();"
new_new_user = "document.getElementById('new-user-id-num').value = getNextUserId();\\n                if(document.getElementById('new-user-billing-company')) document.getElementById('new-user-billing-company').value = '';"
html = html.replace(old_new_user, new_new_user)

old_edit_user = "document.getElementById('new-user-iban').value = data.iban || '';"
new_edit_user = "document.getElementById('new-user-iban').value = data.iban || '';\\n                if(document.getElementById('new-user-billing-company')) document.getElementById('new-user-billing-company').value = data.billingCompanyId || '';"
html = html.replace(old_edit_user, new_edit_user)

with open(path, 'w', encoding='utf-8') as f:
    f.write(html)
print("JS logic applied successfully.")
