import os
import re

# 1. UPDATE APP.HTML
path_app = r'c:\NOVAPACK CLOUD\public\app.html'
with open(path_app, 'r', encoding='utf-8') as f:
    html = f.read()

alert_html = """
                    <!-- ALERT BOX FOR PENDING MODIFICATIONS -->
                    <div id="pending-confirmation-alert" class="hidden" style="margin-bottom: 20px; padding: 20px; background: rgba(255, 165, 0, 0.15); border: 2px solid #FFA500; border-radius: 8px; text-align: center;">
                        <h3 style="color: #FFA500; margin-top:0;">⚠️ ATENCIÓN: ALBARÁN MODIFICADO POR LA COMPAÑÍA</h3>
                        <p id="pending-changes-text" style="color: white; font-size: 0.9rem; margin-bottom: 15px;">Se han detectado cambios en el peso o bultos de este albarán. Por favor, revisa los datos y acepta la modificación para continuar.</p>
                        <button type="button" class="btn" style="background: #FFA500; color: black; font-weight: 900; padding: 10px 20px; pointer-events: auto !important; position: relative; z-index: 9999;" onclick="acceptTicketModification()">✅ ACEPTAR MODIFICACIÓN</button>
                    </div>

"""

if 'id="pending-confirmation-alert"' not in html:
    insert_point = '<div id="create-ticket-form"'
    html = html.replace(insert_point, alert_html + insert_point)
    with open(path_app, 'w', encoding='utf-8') as f:
        f.write(html)


# 2. UPDATE FIREBASE-APP.JS
path_fb = r'c:\NOVAPACK CLOUD\public\firebase-app.js'
with open(path_fb, 'r', encoding='utf-8') as f:
    js = f.read()

# Replace variables in loadEditor
old_locks = """    const isBilled = !!(t.invoiceId || t.invoiceNum);
    const isPendingDelete = !!t.deleteRequested;
    const isLocked = isBilled || isPendingDelete;"""

new_locks = """    const isBilled = !!(t.invoiceId || t.invoiceNum);
    const isPendingDelete = !!t.deleteRequested;
    const isPendingConfirmation = (t.status === 'pending_confirmation');
    const isLocked = isBilled || isPendingDelete || isPendingConfirmation;"""

if "const isPendingConfirmation" not in js:
    js = js.replace(old_locks, new_locks)

# Add Alert display logic
old_lock_display = """    // Final lock state if billed or pending delete
    if (isLocked) {
        if (isPendingDelete) {"""

new_lock_display = """    // Show Pending Confirmation Alert if active
    const alertBox = document.getElementById('pending-confirmation-alert');
    if (alertBox) {
        if (isPendingConfirmation) {
            alertBox.classList.remove('hidden');
            const alertText = document.getElementById('pending-changes-text');
            if (alertText) alertText.innerHTML = t.pendingChangesText || "El albarán ha sido modificado por la central. Revisa y acepta los cambios.";
        } else {
            alertBox.classList.add('hidden');
        }
    }

    // Final lock state if billed or pending delete
    if (isLocked) {
        if (isPendingConfirmation) {
            document.getElementById('editor-title').innerHTML = `<span style="color:#FFA500; font-weight:900;">⚠️ ALBARÁN MODIFICADO (REQUIERE ACCIÓN)</span>`;
            document.getElementById('editor-status').innerHTML = `ID: ${t.id} | <span style="background:#FFA500; color:black; padding:2px 6px; border-radius:4px; font-weight:bold; font-size:0.75rem;">PENDIENTE CONFIRMACIÓN</span>`;
        } else if (isPendingDelete) {"""

if "alertBox.classList.remove('hidden');" not in js:
    js = js.replace(old_lock_display, new_lock_display)

# Add acceptTicketModification function at the end
accept_logic = """
window.acceptTicketModification = async () => {
    if (!editingId) return;
    if (!confirm("¿Aceptar y consolidar las modificaciones propuestas por la central?")) return;
    
    showLoading();
    try {
        const doc = await db.collection('tickets').doc(editingId).get();
        if (!doc.exists) throw new Error("El ticket no existe.");
        const t = doc.data();
        if (t.status !== 'pending_confirmation') throw new Error("Este ticket no requiere confirmación actualmente.");

        const updates = { ...t.pendingChanges }; // Apply all changes
        updates.status = 'Aceptado';
        updates.pendingChanges = firebase.firestore.FieldValue.delete();
        updates.pendingChangesText = firebase.firestore.FieldValue.delete();
        
        // Push acceptance audit onto notes
        const auditText = `[MODIFICACIÓN ACEPTADA POR CLIENTE - ${new Date().toLocaleString()}]`;
        updates.notes = t.notes ? t.notes + " | " + auditText : auditText;
        
        await db.collection('tickets').doc(editingId).update(updates);
        alert("Modificaciones aceptadas y consolidadas correctamente.");
        
        // Hide modal and refresh
        const alertBox = document.getElementById('pending-confirmation-alert');
        if(alertBox) alertBox.classList.add('hidden');
        resetEditor(); // Resets and unlocks form
    } catch(e) {
        alert("Error al confirmar modificaciones: " + e.message);
    } finally {
        hideLoading();
    }
};
"""

if "window.acceptTicketModification" not in js:
    js += accept_logic

# Also update renderTicketItem to show warning badge
old_badge = """    if (isPendingDelete) { badgeClass = 'billed'; badgeText = '🚨 PEND. ANULAR'; }
    else if (isBilled) { badgeClass = 'billed'; badgeText = '🔒 FACTURADO'; }"""

new_badge = """    const isPendingConfirmation = (t.status === 'pending_confirmation');
    if (isPendingConfirmation) { badgeClass = 'billed'; badgeText = '⚠️ REQUIERE ACCION'; }
    else if (isPendingDelete) { badgeClass = 'billed'; badgeText = '🚨 PEND. ANULAR'; }
    else if (isBilled) { badgeClass = 'billed'; badgeText = '🔒 FACTURADO'; }"""

if "badgeText = '⚠️ REQUIERE ACCION';" not in js:
    js = js.replace(old_badge, new_badge)

with open(path_fb, 'w', encoding='utf-8') as f:
    f.write(js)

print("Client-side workflow deployed successfully.")
