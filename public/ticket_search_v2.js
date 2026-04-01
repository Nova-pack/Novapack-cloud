/**
 * TICKET SEARCH V2
 * Advanced Search Module for Tickets
 */

let _advSearchTicketsCache = [];

window.advPerformTicketSearch = async function() {
    if (!window.db) {
        console.error("[Search] Firestore not available");
        return;
    }

    const start = document.getElementById('ts-filter-start')?.value;
    const end = document.getElementById('ts-filter-end')?.value;
    const status = document.getElementById('ts-filter-status')?.value || 'todos';
    const text = (document.getElementById('ts-filter-text')?.value || '').toLowerCase().trim();

    const tbody = document.getElementById('ts-results-body');
    const countEl = document.getElementById('ts-results-count');

    if (tbody) tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:30px; color:var(--brand-primary);"><span class="material-symbols-outlined" style="animation: spin 1s linear infinite;">sync</span> Buscando en millones de albaranes...</td></tr>`;

    try {
        let query = window.db.collection('tickets');

        if (start && end) {
            query = query.where('createdAt', '>=', new Date(start + 'T00:00:00'))
                         .where('createdAt', '<=', new Date(end + 'T23:59:59'));
        } else if (start) {
            query = query.where('createdAt', '>=', new Date(start + 'T00:00:00'));
        }

        const snapshot = await query.limit(300).get();
        let results = [];

        snapshot.forEach(doc => {
            const data = doc.data();
            data.id = doc.id;
            results.push(data);
        });

        // App-side filtering
        results = results.filter(t => {
            // Text search
            if (text) {
                const combined = `${t.id} ${t.senderName||''} ${t.receiver||''} ${t.city||''}`.toLowerCase();
                if (!combined.includes(text)) return false;
            }

            // Status search
            if (status !== 'todos') {
                const isDelivered = t.deliveryStatus === 'Entregado' || t.status === 'Entregado';
                if (status === 'Entregado' && !isDelivered) return false;
                if (status === 'Transito' && isDelivered) return false;
            }

            return true;
        });

        // Sort descending by date
        results.sort((a,b) => {
            const d1 = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
            const d2 = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
            return d2 - d1;
        });

        _advSearchTicketsCache = results;
        advRenderTicketSearchResults();

        if (countEl) countEl.innerHTML = `<span>${results.length} resultados encontrados.</span><span>0 seleccionados.</span>`;

    } catch (e) {
        console.error("Search error", e);
        if (tbody) tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:30px; color:var(--danger);">Error en la búsqueda: ${e.message}<br><small>Recuerda que si cruzas fechas debe existir un índice compuesto.</small></td></tr>`;
    }
};

window.advRenderTicketSearchResults = function() {
    const tbody = document.getElementById('ts-results-body');
    if (!tbody) return;

    if (_advSearchTicketsCache.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:30px; color:#aaa;">No se encontraron resultados para estos filtros.</td></tr>`;
        return;
    }

    let html = '';
    _advSearchTicketsCache.forEach(t => {
        let dateStr = '-';
        if (t.createdAt && t.createdAt.toDate) {
            dateStr = t.createdAt.toDate().toLocaleDateString('es-ES', { day:'2-digit', month:'2-digit', year:'numeric' });
        }

        const bultos = t.packages || t.bultos || '-';
        const receiverStr = `${t.receiver||'Sin destino'} <br><small style="color:#aaa;">${t.city||'-'}</small>`;
        const statusBadge = (t.deliveryStatus === 'Entregado' || t.status === 'Entregado') 
            ? `<span style="background:rgba(76,175,80,0.2); color:#4CAF50; padding:2px 8px; border-radius:12px; font-weight:bold; font-size:0.75rem;">Entregado</span>`
            : `<span style="background:rgba(255,152,0,0.2); color:#FF9800; padding:2px 8px; border-radius:12px; font-weight:bold; font-size:0.75rem;">Tránsito</span>`;

        html += `
        <tr style="border-bottom:1px solid #3c3c3c;" class="mailbox-row">
            <td style="text-align:center;"><input type="checkbox" class="ts-row-cb" value="${t.id}" onclick="advUpdateSearchCount()"></td>
            <td style="font-size:0.85rem; color:#ccc;">${dateStr}</td>
            <td style="font-weight:bold; color:var(--brand-primary);">${t.id}</td>
            <td style="font-size:0.9rem;">${t.senderName||'-'}</td>
            <td style="font-size:0.9rem;">${receiverStr}</td>
            <td style="text-align:center; font-weight:bold;">${bultos}</td>
            <td style="text-align:center;">${statusBadge}</td>
            <td style="text-align:center;">
                <button class="btn btn-sm btn-outline" style="padding:4px;" onclick="window.advQuickSearch('${t.id}')" title="Ver Detalle"><span class="material-symbols-outlined" style="font-size:1rem;">visibility</span></button>
            </td>
        </tr>`;
    });

    tbody.innerHTML = html;
};

window.advUpdateSearchCount = function() {
    const checked = document.querySelectorAll('.ts-row-cb:checked').length;
    const countEl = document.getElementById('ts-results-count');
    if (countEl) {
        countEl.innerHTML = `<span>${_advSearchTicketsCache.length} resultados encontrados.</span><span style="color:var(--brand-primary);">${checked} seleccionados.</span>`;
    }
};

window.advToggleAllSearchTickets = function(source) {
    const checkboxes = document.querySelectorAll('.ts-row-cb');
    checkboxes.forEach(cb => cb.checked = source.checked);
    advUpdateSearchCount();
};

window.advBatchPrintSearchTickets = function() {
    const checked = Array.from(document.querySelectorAll('.ts-row-cb:checked')).map(cb => cb.value);
    if (checked.length === 0) {
        alert("Selecciona al menos un albarán para imprimir.");
        return;
    }
    
    alert("Función de impresión por lotes en desarrollo. Has seleccionado " + checked.length + " albaranes:\n" + checked.join(', '));
};
