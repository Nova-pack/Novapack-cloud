/**
 * MAILBOX MANAGER V3.0
 * Motor del Buzón Inteligente (Gestión de incidencias y correos)
 * Mejoras: preview en tabla, tooltip subject, notas persistentes, toast, respuesta mejorada, categorías centralizadas
 */

let _mailboxCache = [];
let _mailboxUnsubscribe = null;

// ============ CATEGORÍAS CENTRALIZADAS ============
const MAILBOX_CATEGORIES = {
    pod:              { emoji: '📄', label: 'Solicitud POD' },
    abono:            { emoji: '💰', label: 'Solicitud Abono' },
    rectificacion:    { emoji: '📑', label: 'Rectificación' },
    fiscal:           { emoji: '📊', label: 'Petición Fiscal' },
    consulta_albaran: { emoji: '📦', label: 'Consulta Albarán' },
    reclamacion:      { emoji: '⚠️', label: 'Reclamación' },
    facturacion:      { emoji: '🏢', label: 'Facturación' },
    otro:             { emoji: '📧', label: 'Otros' }
};

function getCategoryText(cat) {
    const c = MAILBOX_CATEGORIES[cat] || MAILBOX_CATEGORIES.otro;
    return `${c.emoji} ${c.label}`;
}
// ==================================================

// ============ TOAST SYSTEM ============
function showMailboxToast(message, type) {
    let container = document.getElementById('mailbox-toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'mailbox-toast-container';
        container.style.cssText = 'position:fixed; bottom:30px; right:30px; z-index:999999; display:flex; flex-direction:column; gap:10px;';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    const colors = { success: '#4CAF50', error: '#f44336', info: '#2196F3', warning: '#FF9800' };
    const bg = colors[type] || colors.info;
    toast.style.cssText = `background:${bg}; color:white; padding:12px 24px; border-radius:8px; font-size:0.9rem; font-weight:bold; box-shadow:0 4px 20px rgba(0,0,0,0.4); opacity:0; transform:translateX(40px); transition:all 0.3s ease;`;
    toast.textContent = message;
    container.appendChild(toast);
    requestAnimationFrame(() => { toast.style.opacity = '1'; toast.style.transform = 'translateX(0)'; });
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(40px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
// ======================================

window.loadMailbox = function() {
    if (!window.db) {
        console.error("[MAILBOX] Firestore db not available");
        return;
    }

    const currentUser = window.auth ? window.auth.currentUser : (window.firebase && window.firebase.auth ? window.firebase.auth().currentUser : null);
    if (!currentUser) {
        console.warn("[MAILBOX] No authenticated user, waiting for auth state...");
        const tbody = document.getElementById('mailbox-list-body');
        if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:30px; color:#FF9800;">Esperando autenticación... Si persiste, recarga la página.</td></tr>';

        const authInstance = window.auth || (window.firebase && window.firebase.auth ? window.firebase.auth() : null);
        if (authInstance) {
            const unsubAuth = authInstance.onAuthStateChanged(function(user) {
                unsubAuth();
                if (user) {
                    console.log("[MAILBOX] Auth resolved, retrying loadMailbox...");
                    window.loadMailbox();
                } else {
                    if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:30px; color:#ff4444;">No hay sesión activa. Inicia sesión para ver el buzón.</td></tr>';
                }
            });
        }
        return;
    }

    console.log("[MAILBOX] Inicializando escucha de correos... (user: " + currentUser.uid + ")");
    const tbody = document.getElementById('mailbox-list-body');
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:30px; color:#aaa;">Rastreando buzón de entrada... <span class="material-symbols-outlined" style="animation: spin 1s linear infinite;">sync</span></td></tr>';

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
            if (error.code === 'permission-denied' || error.code === 'failed-precondition' || error.message.includes('permissions') || error.message.includes('index')) {
                console.log("[MAILBOX] Retrying without orderBy...");
                _mailboxUnsubscribe = window.db.collection('mailbox')
                    .limit(100)
                    .onSnapshot((snapshot) => {
                        _mailboxCache = [];
                        snapshot.forEach(doc => {
                            const data = doc.data();
                            data.id = doc.id;
                            _mailboxCache.push(data);
                        });
                        _mailboxCache.sort((a, b) => {
                            const ta = a.createdAt && a.createdAt.toDate ? a.createdAt.toDate().getTime() : 0;
                            const tb = b.createdAt && b.createdAt.toDate ? b.createdAt.toDate().getTime() : 0;
                            return tb - ta;
                        });
                        renderMailbox();
                    }, (error2) => {
                        console.error("[MAILBOX] Fallback also failed:", error2);
                        if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:30px; color:#ff4444;">Error de permisos: ' + error2.message + '<br>Verifica que la colección "mailbox" existe en Firestore y las reglas permiten lectura.</td></tr>';
                    });
            } else {
                if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:30px; color:#ff4444;">Error: ' + error.message + '</td></tr>';
            }
        });
};


window.renderMailbox = function() {
    const tbody = document.getElementById('mailbox-list-body');
    if (!tbody) return;

    const statusFilter = document.getElementById('mailbox-filter-status')?.value || 'todas';
    const categoryFilter = document.getElementById('mailbox-filter-category')?.value || 'todas';
    const searchText = (document.getElementById('mailbox-search')?.value || '').toLowerCase();

    const filtered = _mailboxCache.filter(item => {
        if (statusFilter !== 'todas') {
            const itemStatus = item.status || 'nueva';
            if (itemStatus !== statusFilter) return false;
        }
        if (categoryFilter !== 'todas') {
            const itemCat = item.category || 'otro';
            if (itemCat !== categoryFilter) return false;
        }
        if (searchText) {
            const textToSearch = `${item.from || ''} ${item.subject || ''} ${item.body || ''} ${item.ticketRef || ''}`.toLowerCase();
            if (!textToSearch.includes(searchText)) return false;
        }
        return true;
    });

    const counterEl = document.getElementById('mailbox-counter');
    const newCount = _mailboxCache.filter(i => (i.status || 'nueva') === 'nueva').length;
    if (counterEl) {
        counterEl.innerHTML = `Total: <b>${_mailboxCache.length}</b> · Nuevas: <b style="color:#FF9800;">${newCount}</b> · Mostrando: <b>${filtered.length}</b>`;
    }

    if (filtered.length === 0) {
        if (_mailboxCache.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:30px; color:#FF9800; font-style:italic;">El buzón está vacío. No se han recibido correos aún.<br><span style="font-size:0.8rem; color:#888;">Si esperabas correos, verifica que el servicio de importación sigue activo.</span></td></tr>`;
        } else {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:30px; color:var(--text-dim); font-style:italic;">No hay correos que coincidan con el filtro actual. Prueba a cambiar a "Todas".</td></tr>`;
        }
        return;
    }

    let html = '';
    filtered.forEach((item, idx) => {
        const est = item.status || 'nueva';
        let estIcon = '🔴';
        if (est === 'en_curso') estIcon = '🟡';
        else if (est === 'resuelta') estIcon = '🟢';
        else if (est === 'archivada') estIcon = '⚫';

        const catText = getCategoryText(item.category || 'otro');

        let dateStr = 'Sin fecha';
        if (item.createdAt && typeof item.createdAt.toDate === 'function') {
            dateStr = item.createdAt.toDate().toLocaleString('es-ES', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
        } else if (item.date) {
            dateStr = item.date;
        }

        const ticketStr = item.ticketRef ? `<span style="background:rgba(255,152,0,0.2); color:#FF9800; padding:2px 6px; border-radius:4px; font-weight:bold; font-size:0.8rem;">${item.ticketRef}</span>` : `<span style="color:#666;">-</span>`;

        // Preview: primeras 80 chars del body
        const bodyPreview = item.body ? item.body.replace(/[\r\n]+/g, ' ').substring(0, 80) + (item.body.length > 80 ? '...' : '') : '';

        // Subject con title tooltip para ver completo al pasar raton
        const subjectFull = (item.subject || '(Sin Asunto)').replace(/"/g, '&quot;');

        html += `
        <tr style="border-bottom:1px solid #3c3c3c; cursor:pointer;" class="mailbox-row hover-highlight" data-mail-idx="${idx}">
            <td style="padding:12px; text-align:center; font-size: 1.2rem;">${estIcon}</td>
            <td style="padding:12px; font-size:0.85rem; color:#aaa; font-weight: bold;">${catText}</td>
            <td style="padding:12px; font-weight:bold; color:#ddd;">${item.from || 'Desconocido'}</td>
            <td style="padding:12px; color:#fff; max-width:300px;" title="${subjectFull}">
                <div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-weight:600;">${item.subject || '(Sin Asunto)'}</div>
                <div style="font-size:0.75rem; color:#888; margin-top:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${bodyPreview}</div>
            </td>
            <td style="padding:12px; text-align:center;">${ticketStr}</td>
            <td style="padding:12px; font-size:0.8rem; color:#888; text-align:center;">${dateStr}</td>
            <td style="padding:12px; text-align:center; white-space:nowrap;">
                <button class="mailbox-open-btn" data-mail-idx="${idx}" style="background:linear-gradient(135deg,#2196F3,#1565C0); border:none; color:#fff; padding:4px 10px; font-size:0.8rem; border-radius:4px; cursor:pointer; font-weight:bold; margin-right:4px;" title="Ver Correo">👁 Ver</button>
                <button class="mailbox-resolve-btn" data-mail-idx="${idx}" style="background:#4CAF50; border:none; color:#fff; padding:4px 8px; font-size:0.8rem; border-radius:4px; cursor:pointer; font-weight:bold;" title="Marcar Resuelta">✓</button>
            </td>
        </tr>`;
    });

    tbody.innerHTML = html;
    window._mailboxFiltered = filtered;

    if (!tbody._mailboxListenerAttached) {
        tbody._mailboxListenerAttached = true;
    tbody.addEventListener('click', function(e) {
        const openBtn = e.target.closest('.mailbox-open-btn');
        if (openBtn) {
            e.stopPropagation();
            const idx = parseInt(openBtn.getAttribute('data-mail-idx'));
            const item = window._mailboxFiltered[idx];
            if (item) openMailboxModal(item.id);
            return;
        }

        const resolveBtn = e.target.closest('.mailbox-resolve-btn');
        if (resolveBtn) {
            e.stopPropagation();
            const idx = parseInt(resolveBtn.getAttribute('data-mail-idx'));
            const item = window._mailboxFiltered[idx];
            if (item) updateMailboxStatus(item.id, 'resuelta');
            return;
        }

        const row = e.target.closest('tr[data-mail-idx]');
        if (row) {
            const idx = parseInt(row.getAttribute('data-mail-idx'));
            const item = window._mailboxFiltered[idx];
            if (item) openMailboxModal(item.id);
        }
    });
    }
};

window.openMailboxModal = function(id) {
    const item = _mailboxCache.find(i => i.id === id);
    if (!item) return;

    const modalEl = document.getElementById('mailbox-modal');
    if (!modalEl) return;

    // Subject and Sender
    const subjectEl = document.getElementById('mailbox-modal-subject');
    if (subjectEl) subjectEl.innerText = item.subject || '(Sin Asunto)';
    const fromEl = document.getElementById('mailbox-modal-from');
    if (fromEl) fromEl.innerText = item.from || 'Desconocido';

    // Date
    let dateStr = 'Sin fecha';
    if (item.createdAt && typeof item.createdAt.toDate === 'function') {
        dateStr = item.createdAt.toDate().toLocaleString('es-ES');
    } else if (item.date) {
        dateStr = item.date;
    }
    const dateEl = document.getElementById('mailbox-modal-date');
    if (dateEl) dateEl.innerText = dateStr;

    // Body Text
    const bodyEl = document.getElementById('mailbox-modal-body');
    if (bodyEl) bodyEl.innerText = item.body || '(Sin cuerpo de mensaje visible. Revisa el correo original.)';

    // Category badge
    const catBadgeEl = document.getElementById('mailbox-modal-category');
    if (catBadgeEl) catBadgeEl.innerText = getCategoryText(item.category || 'otro');

    // Ticket ref
    const tRef = document.getElementById('mailbox-modal-ticketref');
    const noTRef = document.getElementById('mailbox-no-ticket');
    const btnTRef = document.getElementById('mailbox-btn-ticket');

    if (item.ticketRef) {
        if (tRef) { tRef.innerText = item.ticketRef; tRef.style.display = 'block'; }
        if (btnTRef) btnTRef.style.display = 'block';
        if (noTRef) noTRef.style.display = 'none';

        window.openTicketFromMailbox = function() {
            modalEl.style.display = 'none';
            if (typeof erpOpenTab === 'function') erpOpenTab('inicio');
            setTimeout(() => {
                const searchBox = document.getElementById('adv-ticket-search-input');
                if (searchBox) {
                    searchBox.value = item.ticketRef;
                    if (typeof window.advQuickSearch === 'function') {
                        window.advQuickSearch(item.ticketRef);
                    } else {
                        showMailboxToast('Función de búsqueda no disponible', 'warning');
                    }
                }
            }, 300);
        };
    } else {
        if (tRef) tRef.style.display = 'none';
        if (btnTRef) btnTRef.style.display = 'none';
        if (noTRef) noTRef.style.display = 'block';
    }

    // Load saved notes from Firestore
    const notesEl = document.getElementById('mailbox-modal-notes');
    if (notesEl) {
        notesEl.value = item.notes || '';
    }

    // Setup reply
    window.replyMailboxEmail = function() {
        if (!item.from) return;
        let emailAddress = item.from;
        const match = emailAddress.match(/<([^>]+)>/);
        if (match) emailAddress = match[1];

        // Body completo citado (max 2000 chars para mailto)
        const quotedBody = item.body ? item.body.substring(0, 2000).split('\n').map(l => '> ' + l).join('\n') : '';
        const sub = encodeURIComponent(`Re: ${item.subject || 'Tu consulta en Novapack'}`);
        const body = encodeURIComponent(
            `Estimado/a cliente,\n\n\n\nAtentamente,\nNOVAPACK - Departamento de Administración\n\n` +
            `--- Mensaje original ---\n` +
            `De: ${item.from}\n` +
            `Fecha: ${dateStr}\n` +
            `Asunto: ${item.subject || ''}\n\n` +
            quotedBody
        );
        window.open(`mailto:${emailAddress}?subject=${sub}&body=${body}`, '_blank');
    };

    // Store active ID
    modalEl.setAttribute('data-active-id', id);
    modalEl.style.display = 'flex';
};

/**
 * Save internal notes to Firestore
 */
window.saveMailboxNotes = async function() {
    const modalEl = document.getElementById('mailbox-modal');
    const id = modalEl?.getAttribute('data-active-id');
    if (!id) return;

    const notesEl = document.getElementById('mailbox-modal-notes');
    const notes = notesEl ? notesEl.value : '';

    try {
        await window.db.collection('mailbox').doc(id).update({
            notes: notes,
            updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
        });
        // Update local cache
        const item = _mailboxCache.find(i => i.id === id);
        if (item) item.notes = notes;
        showMailboxToast('Notas guardadas', 'success');
    } catch (error) {
        console.error("[MAILBOX] Error saving notes:", error);
        showMailboxToast('Error al guardar notas: ' + error.message, 'error');
    }
};

/**
 * Update Mailbox Status
 */
window.updateMailboxStatus = async function(id, newStatus) {
    if (!id) {
        id = document.getElementById('mailbox-modal')?.getAttribute('data-active-id');
    }
    if (!id) return;

    // Also save notes if modal is open
    const notesEl = document.getElementById('mailbox-modal-notes');
    const notes = notesEl ? notesEl.value : undefined;

    const updateData = {
        status: newStatus,
        updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
    };
    if (notes !== undefined) {
        updateData.notes = notes;
    }

    try {
        await window.db.collection('mailbox').doc(id).update(updateData);

        console.log(`[MAILBOX] Ref ${id} estado cambiado a ${newStatus}`);

        const item = _mailboxCache.find(i => i.id === id);
        if (item) {
            item.status = newStatus;
            if (notes !== undefined) item.notes = notes;
        }

        const statusLabels = { en_curso: 'En Curso', resuelta: 'Resuelta', archivada: 'Archivada' };
        showMailboxToast(`Estado actualizado: ${statusLabels[newStatus] || newStatus}`, 'success');

        // Close modal after brief delay so user sees the toast
        setTimeout(() => {
            const modalEl = document.getElementById('mailbox-modal');
            if (modalEl && modalEl.style.display === 'flex') {
                modalEl.style.display = 'none';
            }
        }, 600);

    } catch (error) {
        console.error("Error updating mailbox status:", error);

        if (error.code === 'not-found') {
            showMailboxToast('El correo ya no existe en el buzón central', 'error');
            const idx = _mailboxCache.findIndex(i => i.id === id);
            if (idx > -1) _mailboxCache.splice(idx, 1);
        } else {
            showMailboxToast('Error al actualizar: ' + error.message, 'error');
        }
    }
};

// Auto-trigger loadMailbox when the tab opens
document.addEventListener('DOMContentLoaded', () => {
    const style = document.createElement('style');
    style.innerHTML = `
    .mailbox-row { transition: all 0.2s; }
    .mailbox-row:hover { background: rgba(0, 206, 209, 0.1) !important; cursor: pointer; }
    `;
    document.head.appendChild(style);
});
