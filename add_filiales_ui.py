import os

path = r'c:\NOVAPACK CLOUD\public\admin.html'

with open(path, 'r', encoding='utf-8') as f:
    html = f.read()

# 1. ADD SELECT TO CLIENT FORM (around line 2115)
client_select_html = """
                        <div class="form-group">
                            <label style="display:block; color:#aaa; font-size:0.8rem; margin-bottom:5px;">Filial Facturación</label>
                            <select id="new-user-billing-company" style="width:100%; padding:10px; background:rgba(0,0,0,0.3); border:1px solid var(--border-glass); color:white; border-radius:8px;">
                                <option value="">-- Por Defecto (Central) --</option>
                            </select>
                        </div>
"""
find_str = """                        <div class="form-group">
                            <label style="display:block; color:#aaa; font-size:0.8rem; margin-bottom:5px;">IBAN Bancario</label>
                            <input type="text" id="new-user-iban" style="width:100%; padding:10px; background:rgba(0,0,0,0.3); border:1px solid var(--border-glass); color:white; border-radius:8px;">
                        </div>"""

if find_str in html and "new-user-billing-company" not in html:
    html = html.replace(find_str, find_str + "\n" + client_select_html)

# 2. ADD BILLING_COMPANIES MODAL HTML
modal_html = """
        <!-- 3. MANAGE GLOBAL BILLING COMPANIES MODAL -->
        <div id="modal-billing-company" class="modal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:1005; justify-content:center; align-items:flex-start; overflow-y:auto; padding:20px;">
            <div class="modal-content" style="background:var(--bg-dark); border:1px solid var(--border-glass); border-radius:12px; padding:25px; width:100%; max-width:800px; margin-top:20px; position:relative;">
                <button type="button" onclick="document.getElementById('modal-billing-company').style.display='none'" style="position:absolute; top:15px; right:15px; background:none; border:none; color:white; font-size:1.5rem; cursor:pointer;">&times;</button>
                <h2 id="billing-comp-title" style="margin-top:0; color:var(--brand-primary);">🏢 Añadir Filial Central</h2>
                
                <input type="hidden" id="billing-comp-id">
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px; margin-top:20px;">
                    <div class="form-group">
                        <label>Nombre Fiscal *</label>
                        <input type="text" id="billing-comp-name" required placeholder="NovaPack Logistics S.L." style="width:100%; padding:8px; border-radius:5px;">
                    </div>
                    <div class="form-group">
                        <label>CIF / NIF *</label>
                        <input type="text" id="billing-comp-nif" required placeholder="B12345678" style="width:100%; padding:8px; border-radius:5px;">
                    </div>
                    <div class="form-group" style="grid-column: span 2;">
                        <label>Dirección Fiscal *</label>
                        <input type="text" id="billing-comp-address" required placeholder="C/ Ejemplo 123..." style="width:100%; padding:8px; border-radius:5px;">
                    </div>
                    <div class="form-group">
                        <label>Teléfono</label>
                        <input type="text" id="billing-comp-phone" style="width:100%; padding:8px; border-radius:5px;">
                    </div>
                    <div class="form-group">
                        <label>ID Corto QR <small>(Ej: NV1)</small></label>
                        <input type="text" id="billing-comp-shortid" style="width:100%; padding:8px; border-radius:5px; text-transform:uppercase;">
                    </div>
                    <div class="form-group" style="grid-column: span 2;">
                        <label style="display:flex; justify-content:space-between;">
                            <span>IBAN Bancario</span>
                            <span id="billing-comp-bank-name" style="color:var(--brand-primary); font-size:0.75rem; font-weight:bold;"></span>
                        </label>
                        <input type="text" id="billing-comp-iban" placeholder="ES00..." style="width:100%; padding:8px; border-radius:5px; text-transform:uppercase;">
                    </div>
                </div>
                
                <div style="display:flex; gap:10px; margin-top:20px;">
                    <button class="btn btn-primary" onclick="saveBillingCompany()" style="flex:1;">Guardar Filial</button>
                    <button class="btn" onclick="document.getElementById('modal-billing-company').style.display='none'" style="flex:1; background:#333;">Cancelar</button>
                </div>
            </div>
        </div>
"""
find_modal_anchor = "        <!-- 3. MANAGE DESTINATIONS / AGENDA MODAL -->"
if find_modal_anchor in html and "modal-billing-company" not in html:
    html = html.replace(find_modal_anchor, modal_html + "\n" + find_modal_anchor)

with open(path, 'w', encoding='utf-8') as f:
    f.write(html)
print("HTML UI Added correctly.")
