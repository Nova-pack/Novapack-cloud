import os

# 1. UPDATE ADMIN.HTML
path_ad = r'c:\NOVAPACK CLOUD\public\admin.html'
with open(path_ad, 'r', encoding='utf-8') as f:
    html = f.read()

# Add buttons to ticket list
old_buttons = """                                <td style="text-align:right;">
                                    <button class="btn btn-xs btn-outline" style="border-color:#147A4B; color:#147A4B;" onclick="openTicketPreviewModal('${t.docId}')" title="Examinar / Aprobar Borrado">🔍</button>
                                    <button class="btn btn-xs btn-outline" onclick="printTicketFromAdmin('${adminTicketUID}', '${adminTicketCompID}', '${t.docId}')">🖨️</button>
                                </td>"""

new_buttons = """                                <td style="text-align:right;">
                                    <button class="btn btn-xs btn-outline" style="border-color:#F59E0B; color:#F59E0B;" onclick="openTicketReassignModal('${t.docId}')" title="Reasignar Repartidor">🚚</button>
                                    <button class="btn btn-xs btn-outline" style="border-color:#3B82F6; color:#3B82F6;" onclick="openTicketEditModal('${t.docId}')" title="Editar Metadata e Incidencias">✏️</button>
                                    <button class="btn btn-xs btn-outline" style="border-color:#147A4B; color:#147A4B;" onclick="openTicketPreviewModal('${t.docId}')" title="Examinar / Aprobar Borrado">🔍</button>
                                    <button class="btn btn-xs btn-outline" onclick="printTicketFromAdmin('${adminTicketUID}', '${adminTicketCompID}', '${t.docId}')">🖨️</button>
                                </td>"""

if "openTicketEditModal" not in html and old_buttons in html:
    html = html.replace(old_buttons, new_buttons)

# Modals HTML to inject before </body>
modals_html = """
    <!-- MODAL REASIGNAR REPARTIDOR -->
    <div id="modal-ticket-reassign" class="modal-overlay" style="display:none; z-index:9999;">
        <div class="modal card" style="max-width:500px; padding:30px;">
            <h2 style="color:var(--brand-primary); margin-top:0;">🚚 Reasignar Repartidor</h2>
            <div style="font-size:0.85rem; color:var(--text-dim); margin-bottom:15px;">Selecciona el nuevo conductor de la ruta para el albarán <strong id="reassign-ticket-id" style="color:white;"></strong>.</div>
            <input type="hidden" id="reassign-doc-id">
            
            <div class="form-group mb-4">
                <label class="form-label" style="color:var(--brand-primary);">NUEVO REPARTIDOR</label>
                <select id="reassign-driver-select" class="form-control">
                    <option value="">-- Sin asignar / Eliminar ruta --</option>
                    <!-- Se rellena dinamicamente desde globalRoutes -->
                </select>
            </div>
            
            <div style="display:flex; gap:10px; margin-top:20px;">
                <button type="button" class="btn" style="flex:1; background:rgba(255,255,255,0.1); border:1px solid white;" onclick="document.getElementById('modal-ticket-reassign').style.display='none'">CANCELAR</button>
                <button type="button" class="btn btn-primary" style="flex:1;" onclick="saveTicketReassign()">♻️ ACTUALIZAR RUTA</button>
            </div>
        </div>
    </div>

    <!-- MODAL EDITAR METADATA Y ABRIR INCIDENCIA -->
    <div id="modal-ticket-edit" class="modal-overlay" style="display:none; z-index:9999;">
        <div class="modal card" style="max-width:600px; padding:30px;">
            <h2 style="color:var(--brand-primary); margin-top:0;">✏️ Editar Albarán (Incidencia)</h2>
            <div style="font-size:0.85rem; color:var(--text-dim); margin-bottom:15px; border-left:3px solid #F59E0B; padding-left:10px;">
                ⚠️ IMPORTANTE: Modificar peso o reembolso alterará el precio final. Al guardar, el albarán quedará <strong>BLOQUEADO (Pendiente Confirmación)</strong> hasta que el cliente lo acepte en su portal.
            </div>
            <input type="hidden" id="edit-doc-id">
            
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px; margin-bottom:15px;">
                <div class="form-group">
                    <label class="form-label">TOTAL BULTOS</label>
                    <input type="number" id="edit-t-packages" class="form-control" min="1">
                </div>
                <div class="form-group">
                    <label class="form-label">PESO TOTAL (KG)</label>
                    <input type="number" id="edit-t-weight" class="form-control" step="0.01" min="0">
                </div>
            </div>
            
            <div class="form-group mb-4">
                <label class="form-label">REEMBOLSO (COD €)</label>
                <input type="number" id="edit-t-cod" class="form-control" step="0.01" min="0">
            </div>

            <div class="form-group mb-4">
                <label class="form-label" style="color:#F59E0B;">NOTAS / TEXTO DE AVISO AL CLIENTE</label>
                <textarea id="edit-t-incident-notes" class="form-control" placeholder="Explica por qué se realiza esta modificación (ej. 'Pesaba 10kg más en báscula'). Esto se añadirá a Observaciones." style="min-height:80px;"></textarea>
            </div>
            
            <div style="display:flex; gap:10px; margin-top:20px;">
                <button type="button" class="btn" style="flex:1; background:rgba(255,255,255,0.1); border:1px solid white;" onclick="document.getElementById('modal-ticket-edit').style.display='none'">CANCELAR</button>
                <button type="button" class="btn btn-primary" style="flex:1; font-weight:900;" onclick="saveTicketEditWarning()">📩 ENVIAR MODIFICACIÓN A CLIENTE</button>
            </div>
        </div>
    </div>
"""

# JS Logic to inject before </body>
js_html = """
<script>
window.openTicketReassignModal = async (docId) => {
    document.getElementById('reassign-doc-id').value = docId;
    const doc = await db.collection('tickets').doc(docId).get();
    const t = doc.data();
    document.getElementById('reassign-ticket-id').textContent = t.id || docId;
    
    const select = document.getElementById('reassign-driver-select');
    select.innerHTML = '<option value="">-- Sin asignar / Eliminar ruta --</option>';
    if (window.globalRoutes && window.globalRoutes.length > 0) {
        window.globalRoutes.forEach(r => {
            const cleanPhone = r.phone.replace(/\D/g, '').replace(/^34/, '');
            const opt = document.createElement('option');
            opt.value = cleanPhone;
            opt.textContent = `${r.number ? r.number + ' - ' : ''}${r.name} (${r.label}) [${r.phone}]`;
            if (t.driverPhone && t.driverPhone === cleanPhone) {
                opt.selected = true;
            }
            select.appendChild(opt);
        });
    }
    
    document.getElementById('modal-ticket-reassign').style.display = 'flex';
};

window.saveTicketReassign = async () => {
    const docId = document.getElementById('reassign-doc-id').value;
    const driverPhone = document.getElementById('reassign-driver-select').value;
    
    showLoading();
    try {
        await db.collection('tickets').doc(docId).update({ driverPhone });
        loadAdminTicketList('first'); // refresh list
        document.getElementById('modal-ticket-reassign').style.display = 'none';
        alert('Ruta reasignada con éxito.');
    } catch(e) {
        alert('Error reasignando: ' + e.message);
    } finally {
        hideLoading();
    }
};

window.openTicketEditModal = async (docId) => {
    document.getElementById('edit-doc-id').value = docId;
    
    showLoading();
    try {
        const doc = await db.collection('tickets').doc(docId).get();
        const t = doc.data();
        
        const bultos = t.packagesList ? t.packagesList.reduce((s, p) => s + (parseInt(p.qty) || 1), 0) : (t.packages || 1);
        const peso = t.packagesList ? t.packagesList.reduce((s, p) => s + (parseFloat(p.weight) || 0), 0) : (t.weight || 0);
        
        document.getElementById('edit-t-packages').value = bultos;
        document.getElementById('edit-t-weight').value = parseFloat(peso).toFixed(2);
        document.getElementById('edit-t-cod').value = t.cod || 0;
        document.getElementById('edit-t-incident-notes').value = ''; // Clean initial, user writes why
        
        document.getElementById('modal-ticket-edit').style.display = 'flex';
    } catch(e) {
        alert('Error: ' + e.message);
    } finally {
        hideLoading();
    }
};

window.saveTicketEditWarning = async () => {
    if(!confirm("⚠️ ¿Poner este albarán en Pendiente de Confirmación bloqueando el portal del cliente?")) return;
    const docId = document.getElementById('edit-doc-id').value;
    
    const pkgsStr = parseInt(document.getElementById('edit-t-packages').value) || 1;
    const weightNum = parseFloat(document.getElementById('edit-t-weight').value) || 0;
    const codNum = parseFloat(document.getElementById('edit-t-cod').value) || 0;
    const incidentNotes = document.getElementById('edit-t-incident-notes').value.trim();
    
    showLoading();
    try {
        const doc = await db.collection('tickets').doc(docId).get();
        const t = doc.data();
        
        // Build new packages list retaining previous sizes if possible, else condensing into ONE generic block with total peso
        const newPkgs = [{ qty: pkgsStr, weight: weightNum, size: 'Bulto Modificado' }];
        
        // Evaluate new price based on new parameters
        // We reuse the central price calculation with mock object
        const mockTicket = { ...t, packagesList: newPkgs, packages: pkgsStr, weight: weightNum, cod: codNum };
        const newPrice = calculateTicketPrice(mockTicket, t.uid || adminTicketUID);
        
        const updates = {
            status: "pending_confirmation",
            pendingChangesText: incidentNotes || "El albarán ha sido modificado por la central (Diferencia de peso o de reembolso descubierta).",
            pendingChanges: {
                packagesList: newPkgs,
                packages: pkgsStr,
                weight: weightNum,
                cod: codNum,
                price: newPrice
            }
        };
        
        await db.collection('tickets').doc(docId).update(updates);
        loadAdminTicketList('first');
        document.getElementById('modal-ticket-edit').style.display = 'none';
        alert("Albarán paralizado y notificado al cliente exitosamente.");
    } catch (e) {
        alert("Error: " + e.message);
    } finally {
        hideLoading();
    }
};
</script>
"""

if "modal-ticket-reassign" not in html:
    html = html.replace("</body>", modals_html + js_html + "\n</body>")

with open(path_ad, 'w', encoding='utf-8') as f:
    f.write(html)

print("Admin Tracking Control / Modals deployed successfully.")
