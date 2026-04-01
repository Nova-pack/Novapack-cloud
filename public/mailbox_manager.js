/**
 * MAILBOX MANAGER V2.1
 * Motor del Buzón Inteligente (Gestión de incidencias y correos)
 */

let _mailboxCache = [];
let _mailboxUnsubscribe = null;

// Initialize mailbox
window.loadMailbox = function() {
    if (!window.db) {
        console.error("[MAILBOX] Firestore db not available");
        return;
    }

    console.log("[MAILBOX] Inicializando escucha de correos...");
    const tbody = document.getElementById('mailbox-list-body');
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:30px; color:#aaa;">Rastreando buzón de entrada... <span class="material-symbols-outlined" style="animation: spin 1s linear infinite;">sync</span></td></tr>`;

    // Try to listen to "mailbox" collection
    if (_mailboxUnsubscribe) _mailboxUnsubscribe();

    _mailboxUnsubscribe = window.db.collection('mailbox')
        .orderBy('createdAt', 'desc')
        .limit(100)
        .onSnapshot((snapshot) => {
            _mailboxCache = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                data.id = doc.id;
                _mailboxCache.push(data);
            });
            renderMailbox();
        }, (error) => {
            console.error("[MAILBOX] Error leyendo correos:", error);
            if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:30px; color:#ff4444;">Error de permisos o tabla inexistente: ${error.message} <br>Es posible que no tengas ningún correo registrado todavía o falten índices en Firestore.</td></tr>`;
        });
};

window.renderMailbox = function() {
    const tbody = document.getElementById('mailbox-list-body');
    if (!tbody) return;

    const statusFilter = document.getElementById('mailbox-filter-status')?.value || 'todas';
    const categoryFilter = document.getElementById('mailbox-filter-category')?.value || 'todas';
    const searchText = (document.getElementById('mailbox-search')?.value || '').toLowerCase();

    // Filter data
    const filtered = _mailboxCache.filter(item => {
        // Status
        if (statusFilter !== 'todas') {
            const itemStatus = item.status || 'nueva';
            if (itemStatus !== statusFilter) return false;
        }

        // Category
        if (categoryFilter !== 'todas') {
            const itemCat = item.category || 'otro';
            if (itemCat !== categoryFilter) return false;
        }

        // Search text
        if (searchText) {
            const textToSearch = `${item.from || ''} ${item.subject || ''} ${item.body || ''} ${item.ticketRef || ''}`.toLowerCase();
            if (!textToSearch.includes(searchText)) return false;
        }

        return true;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:30px; color:var(--text-dim);font-style:italic;">No hay correos en el buzón que coincidan con los filtros.</td></tr>`;
        return;
    }

    // Render rows
    let html = '';
    filtered.forEach(item => {
        const est = item.status || 'nueva';
        let estIcon = '🔴';
        if (est === 'en_curso') estIcon = '🟡';
        else if (est === 'resuelta') estIcon = '🟢';
        else if (est === 'archivada') estIcon = '⚫';

        const cat = item.category || 'otro';
        let catText = '📧 Otros';
        if(cat==='pod') catText='📄 Solicitud POD';
        else if(cat==='abono') catText='💰 Solicitud Abono';
        else if(cat==='rectificacion') catText='📑 Rectificación';
        else if(cat==='fiscal') catText='📊 Petición Fiscal';
        else if(cat==='consulta_albaran') catText='📦 Consulta Albarán';
        else if(cat==='reclamacion') catText='⚠️ Reclamación';
        else if(cat==='facturacion') catText='🏢 Facturación';

        // Date extraction
        let dateStr = 'Sin fecha';
        if (item.createdAt && typeof item.createdAt.toDate === 'function') {
            dateStr = item.createdAt.toDate().toLocaleString('es-ES', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
        } else if (item.date) {
            dateStr = item.date;
        }

        const ticketStr = item.ticketRef ? `<span style="background:rgba(255,152,0,0.2); color:#FF9800; padding:2px 6px; border-radius:4px; font-weight:bold; font-size:0.8rem;">${item.ticketRef}</span>` : `<span style="color:#666;">-</span>`;

        html += `
        <tr style="border-bottom:1px solid #3c3c3c; cursor:pointer;" class="mailbox-row hover-highlight" onclick="openMailboxModal('${item.id}')">
            <td style="padding:12px; text-align:center; font-size: 1.2rem;">${estIcon}</td>
            <td style="padding:12px; font-size:0.85rem; color:#aaa; font-weight: bold;">${catText}</td>
            <td style="padding:12px; font-weight:bold; color:#ddd;">${item.from || 'Desconocido'}</td>
            <td style="padding:12px; color:#fff; max-width:250px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${item.subject || '(Sin Asunto)'}</td>
            <td style="padding:12px; text-align:center;">${ticketStr}</td>
            <td style="padding:12px; font-size:0.8rem; color:#888; text-align:center;">${dateStr}</td>
            <td style="padding:12px; text-align:center;">
                <button class="btn btn-sm btn-outline" style="border-color:#4CAF50; color:#4CAF50; padding:2px 8px; font-size:0.85rem; border-radius:4px; transform:translateY(-2px); box-shadow: 0 2px 4px rgba(76, 175, 80, 0.2);" onclick="event.stopPropagation(); updateMailboxStatus('${item.id}', 'resuelta')" title="Marcar Resuelta">✓</button>
            </td>
        </tr>`;
    });

    tbody.innerHTML = html;
};

window.openMailboxModal = function(id) {
    const item = _mailboxCache.find(i => i.id === id);
    if (!item) return;

    // Subject and Sender
    document.getElementById('mailbox-modal-subject').innerText = item.subject || '(Sin Asunto)';
    document.getElementById('mailbox-modal-from').innerText = item.from || 'Desconocido';
    
    // Date
    let dateStr = 'Sin fecha';
    if (item.createdAt && typeof item.createdAt.toDate === 'function') {
        dateStr = item.createdAt.toDate().toLocaleString('es-ES');
    } else if (item.date) {
        dateStr = item.date;
    }
    document.getElementById('mailbox-modal-date').innerText = dateStr;
    
    // Body Text
    document.getElementById('mailbox-modal-body').innerText = item.body || '(Sin cuerpo de mensaje visible. Revisa el correo original.)';
    
    // Ticket ref
    const tRef = document.getElementById('mailbox-modal-ticketref');
    const noTRef = document.getElementById('mailbox-no-ticket');
    const btnTRef = document.getElementById('mailbox-btn-ticket');
    
    if (item.ticketRef) {
        tRef.innerText = item.ticketRef;
        tRef.style.display = 'block';
        if (btnTRef) btnTRef.style.display = 'block';
        if (noTRef) noTRef.style.display = 'none';
        
        // Setup direct open ticket function (if modal btn exists)
        window.openTicketFromMailbox = function() {
            document.getElementById('mailbox-modal').style.display = 'none';
            if (typeof erpOpenTab === 'function') erpOpenTab('inicio'); // Go back to inicio/scanner
            // Allow time for tab swap
            setTimeout(() => {
                const searchBox = document.getElementById('adv-ticket-search-input');
                if (searchBox) {
                    searchBox.value = item.ticketRef;
                    if (typeof window.advQuickSearch === 'function') {
                        window.advQuickSearch(item.ticketRef);
                    }
                }
            }, 300);
        };
    } else {
        if(tRef) tRef.style.display = 'none';
        if (btnTRef) btnTRef.style.display = 'none';
        if (noTRef) noTRef.style.display = 'block';
    }

    // Setup reply
    window.replyMailboxEmail = function() {
        if (!item.from) return;
        // Extract email if it has format "Name <email@domain.com>"
        let emailAddress = item.from;
        const match = emailAddress.match(/<([^>]+)>/);
        if (match) emailAddress = match[1];

        const sub = encodeURIComponent(`Re: ${item.subject || 'Tu consulta en Novapack'}`);
        const body = encodeURIComponent(`\n\n---\nEn respuesta a tu mensaje:\n> ${item.body ? item.body.substring(0, 200) + '...' : ''}\n\n`);
        window.open(`mailto:${emailAddress}?subject=${sub}&body=${body}`, '_blank');
    };

    // Store active ID for status action buttons inside modal (which call updateMailboxStatus without ID)
    document.getElementById('mailbox-modal').setAttribute('data-active-id', id);

    document.getElementById('mailbox-modal').style.display = 'flex';
};

/**
 * Update Mailbox Status
 * If id is not provided (called from modal buttons), extracts the active id from the modal attribute.
 */
window.updateMailboxStatus = async function(id, newStatus) {
    if (!id) {
        id = document.getElementById('mailbox-modal')?.getAttribute('data-active-id');
    }
    if (!id) return;

    try {
        await window.db.collection('mailbox').doc(id).update({
            status: newStatus,
            updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
        });
        
        console.log(`[MAILBOX] Ref ${id} estado cambiado a ${newStatus}`);
        
        // Optimistic UI update (the snapshot listener will update it shortly anyway)
        const item = _mailboxCache.find(i => i.id === id);
        if (item) item.status = newStatus;
        if (document.getElementById('mailbox-modal').style.display === 'flex') {
            document.getElementById('mailbox-modal').style.display = 'none';
        }

    } catch (error) {
        console.error("Error updating mailbox status:", error);
        
        // If the document doesn't strictly exist, attempt to gracefully handle or alert
        if (error.code === 'not-found') {
            alert("El correo no se pudo actualizar porque ya no existe en el buzón central.");
            const idx = _mailboxCache.findIndex(i => i.id === id);
            if (idx > -1) _mailboxCache.splice(idx, 1);
        } else {
            alert("Error al actualizar estado: " + error.message);
        }
    }
};

// Auto-trigger loadMailbox when the tab opens
// We intercept erpOpenTab via an observer or rely on erp_tabs.js calling loadMailbox
document.addEventListener('DOMContentLoaded', () => {
    // Inject minimalist CSS for highlighting rows
    const style = document.createElement('style');
    style.innerHTML = `
    .mailbox-row { transition: all 0.2s; }
    .mailbox-row:hover { background: rgba(0, 206, 209, 0.1) !important; cursor: pointer; }
    `;
    document.head.appendChild(style);
});
