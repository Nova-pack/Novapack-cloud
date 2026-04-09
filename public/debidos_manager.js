// Gestor de Portes Debidos - Novapack Cloud

let debidosTicketsCache = [];
let debidosAssignedCache = [];
let debidosCurrentView = 'pendientes';

window.loadDebidosManager = async () => {
    const tbody = document.getElementById('debidos-table-body');
    const tbodyAssigned = document.getElementById('debidos-assigned-body');
    if (tbody) tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:#aaa;">Cargando albaranes a portes debidos...</td></tr>';
    if (tbodyAssigned) tbodyAssigned.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:#aaa;">Cargando...</td></tr>';

    try {
        const snap = await db.collection('tickets')
            .where('shippingType', '==', 'Debidos')
            .orderBy('createdAt', 'desc')
            .limit(1000)
            .get();

        debidosTicketsCache = [];
        debidosAssignedCache = [];

        snap.forEach(doc => {
            const t = doc.data();
            // Si ya está facturado, ignorar
            if (t.invoiceId && String(t.invoiceId).trim() !== "" && String(t.invoiceId).toLowerCase() !== "null") return;
            // Si está pendiente de anulación, ignorar
            if (t.deleteRequested || t.status === 'Pendiente Anulación') return;

            if (t.billToUid) {
                // Asignado pero no facturado → lista de asignados
                debidosAssignedCache.push({ ...t, docId: doc.id });
            } else {
                // Sin asignar → pendientes
                debidosTicketsCache.push({ ...t, docId: doc.id });
            }
        });

        renderDebidosTable(debidosTicketsCache);
        renderDebidosAssignedTable(debidosAssignedCache);

    } catch (e) {
        console.error("Error loading debidos:", e);
        if (tbody) tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:red; padding:20px;">Error: ${e.message}</td></tr>`;
    }
};

window.switchDebidosView = function(view) {
    debidosCurrentView = view;
    var btnP = document.getElementById('debidos-tab-pendientes');
    var btnA = document.getElementById('debidos-tab-asignados');
    var tblP = document.getElementById('debidos-table-pendientes');
    var tblA = document.getElementById('debidos-table-asignados');
    if (view === 'asignados') {
        if (btnP) { btnP.style.background = '#2d2d30'; btnP.style.color = '#888'; }
        if (btnA) { btnA.style.background = '#4CAF50'; btnA.style.color = '#fff'; }
        if (tblP) tblP.style.display = 'none';
        if (tblA) tblA.style.display = 'table';
    } else {
        if (btnP) { btnP.style.background = '#FF9800'; btnP.style.color = '#000'; }
        if (btnA) { btnA.style.background = '#2d2d30'; btnA.style.color = '#888'; }
        if (tblP) tblP.style.display = 'table';
        if (tblA) tblA.style.display = 'none';
    }
};

window.renderDebidosAssignedTable = (ticketsArray) => {
    const tbody = document.getElementById('debidos-assigned-body');
    if (!tbody) return;

    if (ticketsArray.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:30px; color:#888;">No hay albaranes asignados pendientes de facturar.</td></tr>';
        return;
    }

    let html = '';
    ticketsArray.forEach(t => {
        const dateStr = t.createdAt && typeof t.createdAt.toDate === 'function' ?
            t.createdAt.toDate().toLocaleDateString() : 'Sin fecha';
        const docIdSafe = (t.docId || '').replace(/'/g, "\\'");
        const ticketIdSafe = (t.id || t.docId || '').replace(/'/g, "\\'");
        // Resolve client name from userMap
        let clientName = t.billToClientIdNum || '?';
        if (window.userMap && t.billToUid && window.userMap[t.billToUid]) {
            clientName = window.userMap[t.billToUid].name || clientName;
        }

        html += `
            <tr style="border-bottom: 1px solid #333; transition:background 0.2s;"
                onmouseover="this.style.background='rgba(76,175,80,0.08)'"
                onmouseout="this.style.background='transparent'">
                <td style="padding:10px;">${dateStr}</td>
                <td style="padding:10px; font-weight:bold; color:var(--brand-primary);">${t.id || t.docId}</td>
                <td style="padding:10px;">
                    <div>${t.senderName || 'Remitente N/A'}</div>
                    <div style="font-size:0.75rem; color:#888;">${t.city || t.province || ''}</div>
                </td>
                <td style="padding:10px; color:#fff;">
                    <div style="font-weight:bold;">${t.receiver || 'Destinatario N/A'}</div>
                </td>
                <td style="padding:10px;">
                    <span style="color:#4CAF50; font-weight:600; font-size:0.82rem;">${clientName}</span>
                    <div style="font-size:0.7rem; color:#666;">Nº ${t.billToClientIdNum || ''}</div>
                </td>
                <td style="padding:10px; text-align:right;">
                    <button class="btn btn-outline btn-sm" onclick="event.stopPropagation(); unassignDebido('${docIdSafe}', '${ticketIdSafe}')" style="font-size:0.7rem; border-color:#FF5252; color:#FF5252; display:flex; align-items:center; gap:3px;">
                        <span class="material-symbols-outlined" style="font-size:14px;">link_off</span> Desasignar
                    </button>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
};

window.unassignDebido = async (docId, ticketId) => {
    if (!confirm('¿Desasignar el albarán ' + ticketId + '?\n\nVolverá a la lista de pendientes.')) return;

    try {
        await db.collection('tickets').doc(docId).update({
            billToUid: firebase.firestore.FieldValue.delete(),
            billToClientIdNum: firebase.firestore.FieldValue.delete(),
            ...(typeof getOperatorStamp === 'function' ? getOperatorStamp() : {})
        });

        // Move from assigned to pending cache
        var idx = debidosAssignedCache.findIndex(t => t.docId === docId);
        if (idx !== -1) {
            var ticket = debidosAssignedCache.splice(idx, 1)[0];
            delete ticket.billToUid;
            delete ticket.billToClientIdNum;
            debidosTicketsCache.unshift(ticket);
        }

        renderDebidosTable(debidosTicketsCache);
        renderDebidosAssignedTable(debidosAssignedCache);
        alert('✅ Albarán ' + ticketId + ' desasignado');
    } catch(e) {
        alert('Error: ' + e.message);
        console.error(e);
    }
};

window.renderDebidosTable = (ticketsArray) => {
    const tbody = document.getElementById('debidos-table-body');
    if (!tbody) return;
    
    if (ticketsArray.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:30px; color:#888;">¡Todo al día! No hay portes debidos pendientes de adjudicar.</td></tr>';
        return;
    }
    
    let html = '';
    ticketsArray.forEach(t => {
        const dateStr = t.createdAt && typeof t.createdAt.toDate === 'function' ? 
            t.createdAt.toDate().toLocaleDateString() : 'Sin fecha';
        const docIdSafe = (t.docId || '').replace(/'/g, "\\'");
        const ticketIdSafe = (t.id || t.docId || '').replace(/'/g, "\\'");
            
        html += `
            <tr style="border-bottom: 1px solid #333; cursor:pointer; transition:background 0.2s;" 
                onmouseover="this.style.background='rgba(255,152,0,0.08)'" 
                onmouseout="this.style.background='transparent'">
                <td style="padding:10px;" onclick="openDebidoDetail('${docIdSafe}')">${dateStr}</td>
                <td style="padding:10px; font-weight:bold; color:var(--brand-primary);" onclick="openDebidoDetail('${docIdSafe}')">${t.id || t.docId}</td>
                <td style="padding:10px;" onclick="openDebidoDetail('${docIdSafe}')">
                    <div>${t.senderName || 'Remitente N/A'}</div>
                    <div style="font-size:0.75rem; color:#888;">${t.city || t.province || ''}</div>
                </td>
                <td style="padding:10px; color:#fff;" onclick="openDebidoDetail('${docIdSafe}')">
                    <div style="font-weight:bold;">${t.receiver || 'Destinatario N/A'}</div>
                    <div style="font-size:0.75rem; color:#888;">${t.receiverAddress || ''}</div>
                </td>
                <td style="padding:10px; text-align:right;">
                    <div style="display:flex; gap:5px; justify-content:flex-end;">
                        <button class="btn btn-outline btn-sm" onclick="event.stopPropagation(); openDebidoDetail('${docIdSafe}')" style="font-size:0.7rem; border-color:#4CAF50; color:#4CAF50; display:flex; align-items:center; gap:3px;">
                            <span class="material-symbols-outlined" style="font-size:14px;">edit</span> Editar
                        </button>
                        <button class="btn btn-outline btn-sm" onclick="event.stopPropagation(); openAssignDebidoModal('${docIdSafe}', '${ticketIdSafe}')" style="font-size:0.7rem; border-color:#FF9800; color:#FF9800; display:flex; align-items:center; gap:3px;">
                            <span class="material-symbols-outlined" style="font-size:14px;">link</span> Asignar
                        </button>
                        <button class="btn btn-outline btn-sm" onclick="event.stopPropagation(); deleteDebidoTicket('${docIdSafe}', '${ticketIdSafe}')" style="font-size:0.7rem; border-color:#FF5252; color:#FF5252; display:flex; align-items:center; gap:3px;">
                            <span class="material-symbols-outlined" style="font-size:14px;">delete</span>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;
};

var _filterDebidosTimer;
window.filterDebidosList = (query) => {
    clearTimeout(_filterDebidosTimer);
    _filterDebidosTimer = setTimeout(() => {
        const q = query.toLowerCase().trim();
        const matchFn = t => {
            const s = (t.senderName || '').toLowerCase();
            const r = (t.receiver || '').toLowerCase();
            const id = (t.id || t.docId || '').toLowerCase();
            return s.includes(q) || r.includes(q) || id.includes(q);
        };
        if (!q) {
            renderDebidosTable(debidosTicketsCache);
            renderDebidosAssignedTable(debidosAssignedCache);
        } else {
            renderDebidosTable(debidosTicketsCache.filter(matchFn));
            renderDebidosAssignedTable(debidosAssignedCache.filter(matchFn));
        }
    }, 300);
};

// ================= MODAL DE ASIGNACIÓN =================

window.openAssignDebidoModal = async (docId, ticketId) => {
    document.getElementById('assign-debido-ticket-id').value = docId;
    document.getElementById('assign-debido-id').textContent = ticketId;

    document.getElementById('assign-debido-search').value = '';
    document.getElementById('assign-debido-dropdown').style.display = 'none';
    document.getElementById('assign-debido-selected-card').style.display = 'none';

    document.getElementById('modal-assign-debido').style.display = 'flex';

    // Cargar clientes desde userMap si no están disponibles
    await _debidosEnsureClients();
};

async function _debidosEnsureClients() {
    // Si advAllClients ya tiene datos, usarlos
    if (window.advAllClients && window.advAllClients.length > 0) return;

    // Cargar userMap si está vacío
    if (!window.userMap || Object.keys(window.userMap).length < 2) {
        if (typeof window.loadUsers === 'function') await window.loadUsers('first');
    }

    // Construir lista de clientes desde userMap
    if (window.userMap) {
        var seen = {};
        window.advAllClients = [];
        Object.entries(window.userMap).forEach(function(entry) {
            var uid = entry[0], u = entry[1];
            if (u && u.role === 'admin') return;
            var actualId = u.id || uid;
            if (!actualId || seen[actualId]) return;
            seen[actualId] = true;
            window.advAllClients.push(Object.assign({}, u, { id: actualId }));
        });
        window.advAllClients.sort(function(a, b) { return (a.name || '').localeCompare(b.name || ''); });
        console.log('[Debidos] Loaded ' + window.advAllClients.length + ' clients from userMap');
    }
}

window.closeAssignDebidoModal = () => {
    document.getElementById('modal-assign-debido').style.display = 'none';
};

// Escuchador del buscador del modal
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('assign-debido-search');
    if(searchInput) {
        var _debidosClientTimer;
        searchInput.addEventListener('input', function() {
            var val = this.value.trim();
            clearTimeout(_debidosClientTimer);
            _debidosClientTimer = setTimeout(function() { debidosFilterClients(val); }, 300);
        });
    }
});

function debidosFilterClients(query) {
    const dropdown = document.getElementById('assign-debido-dropdown');
    if (!dropdown) return;
    
    if (!window.advAllClients || window.advAllClients.length === 0) return;
    
    const q = query.toLowerCase();
    if (!q) {
        dropdown.style.display = 'none';
        return;
    }
    
    const filtered = advAllClients.filter(u => {
        const name = (u.name || '').toLowerCase();
        const nif = (u.nif || '').toLowerCase();
        const idNum = String(u.idNum || '').toLowerCase();
        return name.includes(q) || nif.includes(q) || idNum.includes(q);
    }).slice(0, 20); // Limit to 20 for perf
    
    if (filtered.length === 0) {
        dropdown.innerHTML = '<div style="padding:10px; color:#888; text-align:center; font-size:0.8rem;">Sin resultados</div>';
        dropdown.style.display = 'block';
        return;
    }
    
    dropdown.innerHTML = '';
    filtered.forEach(u => {
        const item = document.createElement('div');
        item.style.cssText = 'padding:8px 10px; cursor:pointer; font-size:0.85rem; border-bottom:1px solid #3c3c3c; display:flex; justify-content:space-between; align-items:center; background:#1e1e1e;';
        item.innerHTML = `
            <span style="color:#fff;">${escapeHtml(u.name || 'Sin Nombre')}</span>
            <span style="color:#888; font-size:0.75rem;">Nº: ${escapeHtml(u.idNum || '?')}${u.nif ? ' · NIF: ' + escapeHtml(u.nif) : ''}</span>
        `;
        item.addEventListener('mouseenter', () => { item.style.background = 'rgba(76, 175, 80, 0.3)'; });
        item.addEventListener('mouseleave', () => { item.style.background = '#1e1e1e'; });
        item.addEventListener('click', () => {
            selectDebidoClient(u);
            dropdown.style.display = 'none';
            document.getElementById('assign-debido-search').value = u.name;
        });
        dropdown.appendChild(item);
    });
    
    dropdown.style.display = 'block';
}

function selectDebidoClient(u) {
    document.getElementById('assign-debido-sel-uid').value = u.id;
    document.getElementById('assign-debido-sel-idnum').value = u.idNum || '';
    
    document.getElementById('assign-debido-sel-name').textContent = u.name || 'Sin Nombre';
    document.getElementById('assign-debido-sel-nif').textContent = `Nº Cliente: ${u.idNum || 'N/A'} | NIF/CIF: ${u.nif || 'N/A'}`;
    
    document.getElementById('assign-debido-selected-card').style.display = 'block';
}

window.confirmAssignDebido = async () => {
    const docId = document.getElementById('assign-debido-ticket-id').value;
    const uid = document.getElementById('assign-debido-sel-uid').value;
    const idNum = document.getElementById('assign-debido-sel-idnum').value;
    const clientName = document.getElementById('assign-debido-sel-name').textContent;
    
    if(!docId || !uid) {
        alert("Faltan datos para la asignación.");
        return;
    }
    
    if(!confirm(`¿Estás seguro de que quieres facturar este albarán a:\n${clientName}?`)) return;
    
    if(typeof showLoading === 'function') showLoading("Adjudicando albarán...");
    
    try {
        await db.collection('tickets').doc(docId).update({
            billToUid: uid,
            billToClientIdNum: idNum,
            ...(typeof getOperatorStamp === 'function' ? getOperatorStamp() : {})
        });
        
        closeAssignDebidoModal();
        
        // Refrescar lista visual sin llamar de nuevo a DB
        debidosTicketsCache = debidosTicketsCache.filter(t => t.docId !== docId);
        filterDebidosList(document.getElementById('erp-debidos-search')?.value || '');
        
        // Si la factura del cliente destino está abierta detrás en la UI, conviene alertar
        alert("✅ Albarán adjudicado correctamente a " + clientName);
        
    } catch(e) {
        alert("Error al intentar asignar: " + e.message);
        console.error(e);
    } finally {
        if(typeof hideLoading === 'function') hideLoading();
    }
};

// ================= DETALLE / EDICIÓN DE ALBARÁN =================

window.openDebidoDetail = async (docId) => {
    const ticket = debidosTicketsCache.find(t => t.docId === docId);
    if (!ticket) {
        // Try loading from DB if not in cache
        try {
            const doc = await db.collection('tickets').doc(docId).get();
            if (!doc.exists) { alert('Albarán no encontrado'); return; }
            showDebidoEditModal({ ...doc.data(), docId: doc.id });
        } catch(e) { alert('Error: ' + e.message); }
        return;
    }
    showDebidoEditModal(ticket);
};

function showDebidoEditModal(t) {
    // Remove existing modal if any
    let modal = document.getElementById('modal-edit-debido');
    if (modal) modal.remove();

    const dateStr = t.createdAt && typeof t.createdAt.toDate === 'function' 
        ? t.createdAt.toDate().toISOString().split('T')[0] : '';

    modal = document.createElement('div');
    modal.id = 'modal-edit-debido';
    modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); z-index:50000; display:flex; align-items:center; justify-content:center; font-family:-apple-system,sans-serif;';
    modal.innerHTML = `
        <div style="background:#1e1e1e; border:1px solid #3c3c3c; border-radius:12px; width:95%; max-width:700px; max-height:90vh; overflow-y:auto; padding:25px; color:#d4d4d4; box-shadow:0 20px 60px rgba(0,0,0,0.6);">
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #3c3c3c; padding-bottom:12px; margin-bottom:20px;">
                <h2 style="margin:0; color:#FF9800; font-size:1.3rem; display:flex; align-items:center; gap:8px;">
                    <span class="material-symbols-outlined">receipt_long</span>
                    Albarán ${t.id || t.docId}
                </h2>
                <button onclick="document.getElementById('modal-edit-debido').remove()" style="background:none; border:none; color:#aaa; font-size:1.5rem; cursor:pointer;">&times;</button>
            </div>

            <input type="hidden" id="edit-debido-docid" value="${t.docId}">

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px;">
                <div>
                    <label style="font-size:0.75rem; color:#888; text-transform:uppercase; letter-spacing:1px;">Nº Albarán</label>
                    <input id="edit-debido-id" value="${t.id || ''}" style="width:100%; background:#2d2d30; border:1px solid #3c3c3c; color:white; padding:8px; border-radius:4px; font-size:0.9rem;">
                </div>
                <div>
                    <label style="font-size:0.75rem; color:#888; text-transform:uppercase; letter-spacing:1px;">Fecha</label>
                    <input type="date" id="edit-debido-date" value="${dateStr}" style="width:100%; background:#2d2d30; border:1px solid #3c3c3c; color:white; padding:8px; border-radius:4px; font-size:0.9rem;">
                </div>
            </div>

            <div style="margin-top:18px; padding:12px; background:rgba(0,122,204,0.08); border:1px solid rgba(0,122,204,0.2); border-radius:8px;">
                <div style="font-size:0.75rem; color:#007acc; text-transform:uppercase; letter-spacing:1px; margin-bottom:10px;">Remitente</div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                    <div>
                        <label style="font-size:0.7rem; color:#888;">Nombre</label>
                        <input id="edit-debido-sender" value="${(t.senderName || '').replace(/"/g, '&quot;')}" style="width:100%; background:#2d2d30; border:1px solid #3c3c3c; color:white; padding:6px; border-radius:4px; font-size:0.85rem;">
                    </div>
                    <div>
                        <label style="font-size:0.7rem; color:#888;">Ciudad/Provincia</label>
                        <input id="edit-debido-city" value="${(t.city || t.province || '').replace(/"/g, '&quot;')}" style="width:100%; background:#2d2d30; border:1px solid #3c3c3c; color:white; padding:6px; border-radius:4px; font-size:0.85rem;">
                    </div>
                </div>
            </div>

            <div style="margin-top:12px; padding:12px; background:rgba(76,175,80,0.08); border:1px solid rgba(76,175,80,0.2); border-radius:8px;">
                <div style="font-size:0.75rem; color:#4CAF50; text-transform:uppercase; letter-spacing:1px; margin-bottom:10px;">Destinatario</div>
                <div style="display:grid; grid-template-columns:1fr; gap:10px;">
                    <div>
                        <label style="font-size:0.7rem; color:#888;">Nombre</label>
                        <input id="edit-debido-receiver" value="${(t.receiver || '').replace(/"/g, '&quot;')}" style="width:100%; background:#2d2d30; border:1px solid #3c3c3c; color:white; padding:6px; border-radius:4px; font-size:0.85rem;">
                    </div>
                    <div>
                        <label style="font-size:0.7rem; color:#888;">Dirección</label>
                        <input id="edit-debido-address" value="${(t.receiverAddress || '').replace(/"/g, '&quot;')}" style="width:100%; background:#2d2d30; border:1px solid #3c3c3c; color:white; padding:6px; border-radius:4px; font-size:0.85rem;">
                    </div>
                </div>
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:15px; margin-top:15px;">
                <div>
                    <label style="font-size:0.75rem; color:#888; text-transform:uppercase; letter-spacing:1px;">Bultos</label>
                    <input type="number" id="edit-debido-packages" value="${t.packages || t.bultos || 0}" style="width:100%; background:#2d2d30; border:1px solid #3c3c3c; color:white; padding:8px; border-radius:4px; font-size:0.9rem;">
                </div>
                <div>
                    <label style="font-size:0.75rem; color:#888; text-transform:uppercase; letter-spacing:1px;">Kilos</label>
                    <input type="number" step="0.01" id="edit-debido-weight" value="${t.weight || t.kilos || 0}" style="width:100%; background:#2d2d30; border:1px solid #3c3c3c; color:white; padding:8px; border-radius:4px; font-size:0.9rem;">
                </div>
                <div>
                    <label style="font-size:0.75rem; color:#888; text-transform:uppercase; letter-spacing:1px;">Tipo Envío</label>
                    <input id="edit-debido-shipping" value="${t.shippingType || 'Debidos'}" readonly style="width:100%; background:#252526; border:1px solid #3c3c3c; color:#888; padding:8px; border-radius:4px; font-size:0.9rem;">
                </div>
            </div>

            <div style="margin-top:15px;">
                <label style="font-size:0.75rem; color:#888; text-transform:uppercase; letter-spacing:1px;">Observaciones</label>
                <textarea id="edit-debido-notes" rows="2" style="width:100%; background:#2d2d30; border:1px solid #3c3c3c; color:white; padding:8px; border-radius:4px; font-size:0.85rem; resize:vertical;">${t.notes || t.observations || ''}</textarea>
            </div>

            <div style="display:flex; gap:10px; justify-content:flex-end; margin-top:20px; border-top:1px solid #3c3c3c; padding-top:15px;">
                <button onclick="document.getElementById('modal-edit-debido').remove()" style="background:#333; border:1px solid #555; color:#ccc; padding:8px 20px; font-size:0.85rem; cursor:pointer; border-radius:4px;">Cancelar</button>
                <button onclick="saveDebidoChanges()" style="background:#FF9800; border:none; color:#fff; padding:8px 20px; font-size:0.85rem; cursor:pointer; border-radius:4px; font-weight:bold; display:flex; align-items:center; gap:5px;">
                    <span class="material-symbols-outlined" style="font-size:16px;">save</span> Guardar Cambios
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    // Close on backdrop click
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}

window.saveDebidoChanges = async () => {
    const docId = document.getElementById('edit-debido-docid').value;
    if (!docId) return;

    const updates = {
        id: document.getElementById('edit-debido-id').value.trim(),
        senderName: document.getElementById('edit-debido-sender').value.trim(),
        city: document.getElementById('edit-debido-city').value.trim(),
        receiver: document.getElementById('edit-debido-receiver').value.trim(),
        receiverAddress: document.getElementById('edit-debido-address').value.trim(),
        packages: parseInt(document.getElementById('edit-debido-packages').value) || 0,
        weight: parseFloat(document.getElementById('edit-debido-weight').value) || 0,
        notes: document.getElementById('edit-debido-notes').value.trim(),
    };

    // Update date if changed
    const dateVal = document.getElementById('edit-debido-date').value;
    if (dateVal) {
        updates.createdAt = firebase.firestore.Timestamp.fromDate(new Date(dateVal));
    }

    if (typeof getOperatorStamp === 'function') Object.assign(updates, getOperatorStamp());
    try {
        await db.collection('tickets').doc(docId).update(updates);

        // Update cache
        const cached = debidosTicketsCache.find(t => t.docId === docId);
        if (cached) Object.assign(cached, updates);

        document.getElementById('modal-edit-debido').remove();
        renderDebidosTable(debidosTicketsCache);
        alert('✅ Albarán actualizado correctamente');
    } catch(e) {
        alert('Error al guardar: ' + e.message);
        console.error(e);
    }
};

// ================= ELIMINAR ALBARÁN =================

window.deleteDebidoTicket = async (docId, ticketId) => {
    if (!confirm(`¿Eliminar el albarán ${ticketId}?\n\nSe moverá a la papelera.`)) return;

    try {
        await moveTicketToTrash(docId, 'Eliminado desde debidos', 'debidos');
        debidosTicketsCache = debidosTicketsCache.filter(t => t.docId !== docId);
        renderDebidosTable(debidosTicketsCache);
        alert('🗑️ Albarán ' + ticketId + ' movido a la papelera');
    } catch(e) {
        alert('Error al eliminar: ' + e.message);
        console.error(e);
    }
};
