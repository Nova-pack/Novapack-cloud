// =============================================
// NOVAPACK ERP — Albaranes Centralizado v1.0
// =============================================
// Full-screen tab with sub-filters, toolbar, and batch operations.
// Sub-tabs: TODOS | PENDIENTES | FACTURADOS | DEBIDOS

(function() {
    'use strict';

    let _albCache = [];
    let _albFiltered = [];
    let _albSubTab = 'todos';
    let _albPage = 0;
    const PAGE_SIZE = 100;
    let _albDateFrom = '';
    let _albDateTo = '';
    let _albTextFilter = '';
    let _albLoading = false;

    // ============================================================
    //  INIT — called by erp_tabs onLoad
    // ============================================================
    window.albCentralInit = function() {
        _albRender();
        _albLoadData();
    };

    // ============================================================
    //  MAIN LAYOUT
    // ============================================================
    function _albRender() {
        const container = document.getElementById('erp-tab-albaranes-central');
        if (!container) return;

        const today = new Date();
        const monthAgo = new Date(today);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        if (!_albDateFrom) _albDateFrom = monthAgo.toISOString().split('T')[0];
        if (!_albDateTo) _albDateTo = today.toISOString().split('T')[0];

        const subTabStyle = (id, color) => {
            const active = _albSubTab === id;
            return `padding:10px 20px; cursor:pointer; font-size:0.85rem; font-weight:600; color:${active ? '#fff' : '#888'}; border-bottom:${active ? '3px solid ' + color : '3px solid transparent'}; display:flex; align-items:center; gap:5px; transition:all 0.2s; user-select:none;`;
        };

        container.innerHTML = `
        <div style="display:flex; flex-direction:column; height:100%; background:#1e1e1e; color:#d4d4d4; font-family:'Segoe UI',sans-serif;">
            <!-- HEADER -->
            <div style="background:linear-gradient(135deg, #0d47a1, #1565c0); padding:14px 24px; display:flex; justify-content:space-between; align-items:center; flex-shrink:0;">
                <div style="display:flex; align-items:center; gap:10px;">
                    <span class="material-symbols-outlined" style="font-size:1.5rem; color:#fff;">inventory_2</span>
                    <span style="font-size:1.3rem; font-weight:bold; color:#fff;">ALBARANES CENTRALIZADO</span>
                    <span id="alb-total-badge" style="background:rgba(255,255,255,0.2); color:#fff; padding:3px 10px; border-radius:12px; font-size:0.75rem; font-weight:bold;"></span>
                </div>
                <div style="display:flex; gap:8px; align-items:center;">
                    <button onclick="window._albExportCSV()" style="background:rgba(255,255,255,0.15); border:1px solid rgba(255,255,255,0.3); color:#fff; padding:7px 14px; border-radius:5px; cursor:pointer; font-size:0.8rem; display:flex; align-items:center; gap:4px;">
                        <span class="material-symbols-outlined" style="font-size:0.9rem;">download</span> Exportar
                    </button>
                    <button onclick="window._albRefresh()" style="background:#4CAF50; border:none; color:#fff; padding:7px 14px; border-radius:5px; cursor:pointer; font-weight:bold; font-size:0.8rem; display:flex; align-items:center; gap:4px;">
                        <span class="material-symbols-outlined" style="font-size:0.9rem;">refresh</span> Actualizar
                    </button>
                </div>
            </div>

            <!-- FILTER BAR -->
            <div style="background:#252526; padding:10px 24px; display:flex; gap:12px; align-items:center; flex-wrap:wrap; flex-shrink:0; border-bottom:1px solid #3c3c3c;">
                <div style="display:flex; align-items:center; gap:6px;">
                    <label style="color:#888; font-size:0.7rem; text-transform:uppercase;">Desde</label>
                    <input type="date" id="alb-date-from" value="${_albDateFrom}" onchange="window._albApplyFilters()" style="background:#2d2d30; border:1px solid #3c3c3c; color:#fff; padding:5px 8px; border-radius:4px; font-size:0.8rem;">
                </div>
                <div style="display:flex; align-items:center; gap:6px;">
                    <label style="color:#888; font-size:0.7rem; text-transform:uppercase;">Hasta</label>
                    <input type="date" id="alb-date-to" value="${_albDateTo}" onchange="window._albApplyFilters()" style="background:#2d2d30; border:1px solid #3c3c3c; color:#fff; padding:5px 8px; border-radius:4px; font-size:0.8rem;">
                </div>
                <div style="flex:1; min-width:200px;">
                    <input type="text" id="alb-text-filter" value="${_albTextFilter}" placeholder="🔍 Buscar por nº, cliente, destino, ciudad..." oninput="window._albApplyFilters()"
                        style="width:100%; background:#2d2d30; border:1px solid #3c3c3c; color:#fff; padding:7px 12px; border-radius:4px; font-size:0.8rem; box-sizing:border-box;">
                </div>
                <button onclick="window._albFacturarSeleccionados()" style="background:linear-gradient(135deg,#1b5e20,#2e7d32); border:none; color:#fff; padding:7px 16px; border-radius:5px; cursor:pointer; font-weight:bold; font-size:0.8rem; display:flex; align-items:center; gap:4px;">
                    <span class="material-symbols-outlined" style="font-size:0.9rem;">receipt</span> Facturar Seleccionados
                </button>
            </div>

            <!-- SUB-TAB BAR -->
            <div style="display:flex; background:#1e1e1e; border-bottom:2px solid #333; flex-shrink:0;">
                <div onclick="window._albSetSubTab('todos')" style="${subTabStyle('todos', '#2196F3')}">
                    <span class="material-symbols-outlined" style="font-size:1rem;">list</span> TODOS
                    <span id="alb-count-todos" style="background:rgba(33,150,243,0.2); color:#64B5F6; padding:1px 7px; border-radius:8px; font-size:0.65rem;"></span>
                </div>
                <div onclick="window._albSetSubTab('pendientes')" style="${subTabStyle('pendientes', '#FF9800')}">
                    <span class="material-symbols-outlined" style="font-size:1rem;">pending_actions</span> PENDIENTES
                    <span id="alb-count-pendientes" style="background:rgba(255,152,0,0.2); color:#FFB74D; padding:1px 7px; border-radius:8px; font-size:0.65rem;"></span>
                </div>
                <div onclick="window._albSetSubTab('facturados')" style="${subTabStyle('facturados', '#4CAF50')}">
                    <span class="material-symbols-outlined" style="font-size:1rem;">check_circle</span> FACTURADOS
                    <span id="alb-count-facturados" style="background:rgba(76,175,80,0.2); color:#81C784; padding:1px 7px; border-radius:8px; font-size:0.65rem;"></span>
                </div>
                <div onclick="window._albSetSubTab('debidos')" style="${subTabStyle('debidos', '#E040FB')}">
                    <span class="material-symbols-outlined" style="font-size:1rem;">swap_horiz</span> DEBIDOS
                    <span id="alb-count-debidos" style="background:rgba(224,64,251,0.2); color:#EA80FC; padding:1px 7px; border-radius:8px; font-size:0.65rem;"></span>
                </div>
            </div>

            <!-- TABLE AREA -->
            <div id="alb-table-area" style="flex:1; overflow-y:auto; padding:0;">
                <div style="text-align:center; padding:60px; color:#888;">
                    <span class="material-symbols-outlined" style="font-size:3rem; display:block; margin-bottom:10px;">hourglass_empty</span>
                    Cargando albaranes...
                </div>
            </div>

            <!-- PAGINATION -->
            <div id="alb-pagination" style="background:#252526; padding:8px 24px; display:flex; justify-content:space-between; align-items:center; flex-shrink:0; border-top:1px solid #3c3c3c;">
                <span id="alb-page-info" style="color:#888; font-size:0.75rem;"></span>
                <div style="display:flex; gap:6px;">
                    <button onclick="window._albPrevPage()" id="alb-btn-prev" style="background:#2d2d30; border:1px solid #3c3c3c; color:#ccc; padding:4px 12px; border-radius:3px; cursor:pointer; font-size:0.8rem;">← Anterior</button>
                    <button onclick="window._albNextPage()" id="alb-btn-next" style="background:#2d2d30; border:1px solid #3c3c3c; color:#ccc; padding:4px 12px; border-radius:3px; cursor:pointer; font-size:0.8rem;">Siguiente →</button>
                </div>
            </div>
        </div>`;
    }

    // ============================================================
    //  DATA LOADING
    // ============================================================
    async function _albLoadData() {
        if (_albLoading) return;
        _albLoading = true;

        try {
            const fromEl = document.getElementById('alb-date-from');
            const toEl = document.getElementById('alb-date-to');
            if (fromEl) _albDateFrom = fromEl.value;
            if (toEl) _albDateTo = toEl.value;

            let query = db.collection('tickets');

            if (_albDateFrom) {
                query = query.where('createdAt', '>=', new Date(_albDateFrom + 'T00:00:00'));
            }
            if (_albDateTo) {
                const endD = new Date(_albDateTo + 'T23:59:59');
                query = query.where('createdAt', '<=', endD);
            }

            query = query.orderBy('createdAt', 'desc').limit(5000);
            const snap = await query.get();

            _albCache = [];
            snap.forEach(doc => _albCache.push({ docId: doc.id, ...doc.data() }));

            _albApplyFiltersInternal();
        } catch (e) {
            const area = document.getElementById('alb-table-area');
            if (area) area.innerHTML = `<div style="color:#f44; padding:30px; text-align:center;">Error cargando: ${e.message}</div>`;
        } finally {
            _albLoading = false;
        }
    }

    // ============================================================
    //  FILTERS & SUB-TABS
    // ============================================================
    window._albSetSubTab = function(tab) {
        _albSubTab = tab;
        _albPage = 0;
        _albApplyFiltersInternal();
        // Re-render sub-tab bar styles
        _albRender();
        _albApplyFiltersInternal();
    };

    window._albApplyFilters = function() {
        const fromEl = document.getElementById('alb-date-from');
        const toEl = document.getElementById('alb-date-to');
        const textEl = document.getElementById('alb-text-filter');
        if (fromEl) _albDateFrom = fromEl.value;
        if (toEl) _albDateTo = toEl.value;
        if (textEl) _albTextFilter = textEl.value;

        // If dates changed, reload from Firestore
        _albPage = 0;
        _albLoadData();
    };

    window._albRefresh = function() {
        _albCache = [];
        _albLoadData();
    };

    function _albApplyFiltersInternal() {
        let data = _albCache.slice();
        const q = _albTextFilter.toLowerCase().trim();

        // Text filter
        if (q) {
            data = data.filter(t => {
                const fields = [
                    t.id, t.receiver, t.receiverName, t.receiverAddress,
                    t.city, t.receiverCity, t.senderName, t.sender,
                    t.observations, t.shippingType, String(t.clientIdNum || ''),
                    t.billToClientName || ''
                ].join(' ').toLowerCase();
                return fields.includes(q);
            });
        }

        // Sub-tab filter
        const isPending = (t) => !t.invoiceId || t.invoiceId === '' || t.invoiceId === 'null';
        const isBilled = (t) => t.invoiceId && t.invoiceId !== '' && t.invoiceId !== 'null';
        const isDebido = (t) => t.shippingType === 'Debidos';

        let countAll = data.length;
        let countPend = data.filter(isPending).length;
        let countBill = data.filter(isBilled).length;
        let countDeb = data.filter(isDebido).length;

        switch (_albSubTab) {
            case 'pendientes': data = data.filter(isPending); break;
            case 'facturados': data = data.filter(isBilled); break;
            case 'debidos': data = data.filter(isDebido); break;
        }

        _albFiltered = data;

        // Update counters
        _updateBadge('alb-count-todos', countAll);
        _updateBadge('alb-count-pendientes', countPend);
        _updateBadge('alb-count-facturados', countBill);
        _updateBadge('alb-count-debidos', countDeb);
        _updateBadge('alb-total-badge', countAll + ' albaranes');

        _albRenderTable();
    }

    function _updateBadge(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    // ============================================================
    //  TABLE RENDER
    // ============================================================
    function _albRenderTable() {
        const area = document.getElementById('alb-table-area');
        if (!area) return;

        const start = _albPage * PAGE_SIZE;
        const pageData = _albFiltered.slice(start, start + PAGE_SIZE);
        const totalPages = Math.ceil(_albFiltered.length / PAGE_SIZE) || 1;

        // Pagination info
        const pageInfo = document.getElementById('alb-page-info');
        if (pageInfo) pageInfo.textContent = `Mostrando ${start + 1}-${Math.min(start + PAGE_SIZE, _albFiltered.length)} de ${_albFiltered.length} · Página ${_albPage + 1}/${totalPages}`;

        const prevBtn = document.getElementById('alb-btn-prev');
        const nextBtn = document.getElementById('alb-btn-next');
        if (prevBtn) prevBtn.disabled = _albPage === 0;
        if (nextBtn) nextBtn.disabled = start + PAGE_SIZE >= _albFiltered.length;

        if (pageData.length === 0) {
            area.innerHTML = `<div style="text-align:center; padding:60px; color:#888;">
                <span class="material-symbols-outlined" style="font-size:2.5rem; display:block; margin-bottom:10px;">search_off</span>
                No hay albaranes con estos filtros.
            </div>`;
            return;
        }

        // Build userMap lookup
        const umap = window.userMap || {};

        let html = `
        <table style="width:100%; border-collapse:collapse; font-size:0.8rem;">
            <thead style="position:sticky; top:0; z-index:2;">
                <tr style="background:#252526; color:#9cdcfe; font-size:0.7rem;">
                    <th style="padding:8px 6px; text-align:center; width:30px;">
                        <input type="checkbox" id="alb-select-all" onchange="document.querySelectorAll('.alb-chk').forEach(c=>c.checked=this.checked)" style="scale:1.2;">
                    </th>
                    <th style="padding:8px 6px; text-align:left;">Fecha</th>
                    <th style="padding:8px 6px; text-align:left;">Nº Albarán</th>
                    <th style="padding:8px 6px; text-align:left;">Cliente</th>
                    <th style="padding:8px 6px; text-align:left;">Destinatario</th>
                    <th style="padding:8px 6px; text-align:left;">Ciudad</th>
                    <th style="padding:8px 6px; text-align:center;">Bultos</th>
                    <th style="padding:8px 6px; text-align:center;">Kg</th>
                    <th style="padding:8px 6px; text-align:center;">Tipo</th>
                    <th style="padding:8px 6px; text-align:center;">Estado</th>
                    <th style="padding:8px 6px; text-align:center;">Acciones</th>
                </tr>
            </thead>
            <tbody>`;

        pageData.forEach(t => {
            const date = t.createdAt && t.createdAt.toDate ? t.createdAt.toDate().toLocaleDateString('es-ES') : 'N/A';
            const billed = t.invoiceId && t.invoiceId !== '' && t.invoiceId !== 'null';
            const statusHtml = billed
                ? `<span style="color:#4CAF50; font-size:0.7rem;">✅ Facturado</span>`
                : `<span style="color:#FF9800; font-size:0.7rem;">⏳ Pendiente</span>`;
            const typeColor = t.shippingType === 'Debidos' ? '#E040FB' : '#2196F3';
            const pkgs = t.packagesList ? t.packagesList.reduce((s, p) => s + (parseInt(p.qty) || 1), 0) : (t.packages || 1);

            // Find client name
            const clientName = t.senderName || t.sender || '';
            const clientId = t.uid || '';

            html += `
            <tr style="border-bottom:1px solid #2d2d30;" onmouseover="this.style.background='rgba(255,255,255,0.03)'" onmouseout="this.style.background='transparent'">
                <td style="padding:6px; text-align:center;">${!billed ? `<input type="checkbox" class="alb-chk" data-docid="${t.docId}" data-clientid="${clientId}" style="scale:1.1;">` : ''}</td>
                <td style="padding:6px; color:#ccc;">${date}</td>
                <td style="padding:6px; color:#FFD700; font-weight:bold;">${t.id || t.docId || '-'}</td>
                <td style="padding:6px; color:#64B5F6; cursor:pointer;" onclick="if(typeof openFichaCliente==='function' && '${clientId}') openFichaCliente('${clientId}')" title="Abrir ficha">
                    <span style="border-bottom:1px dotted #64B5F6;">[#${t.clientIdNum || '?'}] ${clientName.substring(0, 30)}</span>
                </td>
                <td style="padding:6px; color:#fff;">${(t.receiver || t.receiverName || '-').substring(0, 35)}</td>
                <td style="padding:6px; color:#888;">${t.city || t.receiverCity || '-'}</td>
                <td style="padding:6px; text-align:center; color:#ccc;">${pkgs}</td>
                <td style="padding:6px; text-align:center; color:#ccc;">${t.weight || t.kilos || '-'}</td>
                <td style="padding:6px; text-align:center; color:${typeColor}; font-size:0.7rem; font-weight:bold;">${t.shippingType || 'Pagados'}</td>
                <td style="padding:6px; text-align:center;">${statusHtml}</td>
                <td style="padding:6px; text-align:center; white-space:nowrap;">
                    <button onclick="window._albViewTicket('${t.docId}')" style="background:#333; border:1px solid #555; color:#ccc; padding:2px 6px; font-size:0.7rem; cursor:pointer; border-radius:3px; margin:1px;" title="Ver detalle">👁️</button>
                </td>
            </tr>`;
        });

        html += '</tbody></table>';
        area.innerHTML = html;
    }

    // ============================================================
    //  PAGINATION
    // ============================================================
    window._albPrevPage = function() {
        if (_albPage > 0) { _albPage--; _albRenderTable(); }
    };
    window._albNextPage = function() {
        if ((_albPage + 1) * PAGE_SIZE < _albFiltered.length) { _albPage++; _albRenderTable(); }
    };

    // ============================================================
    //  BATCH INVOICE
    // ============================================================
    window._albFacturarSeleccionados = function() {
        const checks = document.querySelectorAll('.alb-chk:checked');
        if (checks.length === 0) {
            alert('Selecciona al menos un albarán pendiente.');
            return;
        }

        // Group by client
        const byClient = {};
        checks.forEach(chk => {
            const cid = chk.getAttribute('data-clientid');
            if (!byClient[cid]) byClient[cid] = [];
            byClient[cid].push(chk.getAttribute('data-docid'));
        });

        const clientCount = Object.keys(byClient).length;
        if (clientCount > 1) {
            alert(`Has seleccionado albaranes de ${clientCount} clientes distintos.\nPara facturar en lote, selecciona albaranes de un solo cliente.`);
            return;
        }

        const clientId = Object.keys(byClient)[0];
        if (!clientId) { alert('No se pudo identificar el cliente.'); return; }

        // Open billing tab
        if (typeof window.erpOpenTab === 'function') window.erpOpenTab('factura');

        setTimeout(() => {
            if (typeof window.advLoadClientDetails === 'function') {
                window.advLoadClientDetails(clientId);
            }
        }, 500);

        alert(`Se han seleccionado ${checks.length} albaranes. Se abre Facturación con el cliente.`);
    };

    // ============================================================
    //  VIEW TICKET DETAIL (reuses existing modal)
    // ============================================================
    window._albViewTicket = function(docId) {
        if (typeof window.advOpenTicketDetailModal === 'function') {
            window.advOpenTicketDetailModal(docId);
        } else {
            alert('Función de detalle no disponible.');
        }
    };

    // ============================================================
    //  EXPORT CSV
    // ============================================================
    window._albExportCSV = function() {
        if (_albFiltered.length === 0) { alert('No hay datos para exportar.'); return; }

        const headers = ['Fecha', 'Nº Albarán', 'Cliente Nº', 'Cliente', 'Destinatario', 'Ciudad', 'Bultos', 'Kg', 'Tipo', 'Estado'];
        let csv = headers.join(';') + '\n';

        _albFiltered.forEach(t => {
            const date = t.createdAt && t.createdAt.toDate ? t.createdAt.toDate().toLocaleDateString('es-ES') : '';
            const billed = t.invoiceId && t.invoiceId !== '' ? 'Facturado' : 'Pendiente';
            const pkgs = t.packagesList ? t.packagesList.reduce((s, p) => s + (parseInt(p.qty) || 1), 0) : (t.packages || 1);
            const row = [
                date,
                t.id || t.docId || '',
                t.clientIdNum || '',
                (t.senderName || t.sender || '').replace(/;/g, ','),
                (t.receiver || t.receiverName || '').replace(/;/g, ','),
                (t.city || t.receiverCity || '').replace(/;/g, ','),
                pkgs,
                t.weight || t.kilos || '',
                t.shippingType || 'Pagados',
                billed
            ];
            csv += row.join(';') + '\n';
        });

        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `albaranes_${_albDateFrom}_${_albDateTo}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

})();
