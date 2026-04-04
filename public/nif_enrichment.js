// =============================================
// NOVAPACK — NIF/CIF Enrichment v2.0
// =============================================
// Browse ALL global clients + search/auto-fill
// CIF/NIF using APIEmpresas.es or DatosCif.es
// Self-contained: loads from Firestore directly
// =============================================

(function() {
    'use strict';

    var _allClients = [];     // [{uid, name, email, idNum, nif, isGlobal, ...}]
    var _filteredClients = []; // after search/filter
    var _currentFilter = 'all'; // 'all' | 'missing' | 'complete'
    var _searchText = '';
    var _currentPage = 1;
    var _pageSize = 50;
    var _loading = false;

    // --- ENTRY POINT ---
    window.loadNifEnrichment = function() {
        _renderShell();
        _loadClientsFromDB();
    };

    // --- RENDER MAIN SHELL ---
    function _renderShell() {
        var container = document.querySelector('#erp-tab-nif-enrichment .erp-workspace-content');
        if (!container) return;

        container.innerHTML =
            // Header
            '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:25px; flex-wrap:wrap; gap:15px;">' +
                '<div>' +
                    '<h1 style="color:var(--brand-primary); margin:0; display:flex; align-items:center; gap:10px;">' +
                        '<span class="material-symbols-outlined" style="font-size:2rem;">badge</span> Base de Datos Global — CIF/NIF' +
                    '</h1>' +
                    '<p style="color:var(--text-dim); margin-top:5px; margin-bottom:0; font-size:0.9rem;">Todos los clientes de la base de datos. Busca y completa NIF/CIF online.</p>' +
                '</div>' +
                '<div id="nif-stats" style="display:flex; gap:12px; flex-wrap:wrap;"></div>' +
            '</div>' +

            // Search + Filters Bar
            '<div style="background:var(--bg-dark); border:1px solid var(--border-glass); border-radius:12px; padding:16px 20px; margin-bottom:20px;">' +
                '<div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap;">' +
                    // Client search
                    '<div style="flex:1; min-width:250px; position:relative;">' +
                        '<span class="material-symbols-outlined" style="position:absolute; left:10px; top:50%; transform:translateY(-50%); color:#666; font-size:1.1rem;">search</span>' +
                        '<input type="text" id="nif-client-search" placeholder="Buscar cliente por nombre, NIF, email, n\u00famero..." ' +
                            'style="width:100%; background:#2a2a2d; border:1px solid #444; color:#d4d4d4; padding:10px 14px 10px 36px; border-radius:8px; font-size:0.85rem; box-sizing:border-box;" ' +
                            'oninput="nifFilterClients()">' +
                    '</div>' +
                    // Filter tabs
                    '<div style="display:flex; gap:4px; background:#1a1a2e; border-radius:8px; padding:3px;">' +
                        '<button id="nif-filter-all" onclick="nifSetFilter(\'all\')" style="padding:8px 16px; border:none; border-radius:6px; font-size:0.8rem; cursor:pointer; font-weight:bold; background:#4CAF50; color:white;">Todos</button>' +
                        '<button id="nif-filter-missing" onclick="nifSetFilter(\'missing\')" style="padding:8px 16px; border:none; border-radius:6px; font-size:0.8rem; cursor:pointer; font-weight:bold; background:transparent; color:#aaa;">Sin NIF</button>' +
                        '<button id="nif-filter-complete" onclick="nifSetFilter(\'complete\')" style="padding:8px 16px; border:none; border-radius:6px; font-size:0.8rem; cursor:pointer; font-weight:bold; background:transparent; color:#aaa;">Con NIF</button>' +
                    '</div>' +
                    // Reload button
                    '<button onclick="nifReload()" style="background:linear-gradient(135deg,#4CAF50,#2E7D32); border:none; color:#fff; padding:10px 20px; border-radius:8px; font-weight:bold; font-size:0.85rem; cursor:pointer; display:flex; align-items:center; gap:6px;">' +
                        '<span class="material-symbols-outlined" style="font-size:1rem;">refresh</span> Recargar' +
                    '</button>' +
                '</div>' +
            '</div>' +

            // API Config (collapsible)
            '<div style="background:var(--bg-dark); border:1px solid var(--border-glass); border-radius:12px; margin-bottom:20px;">' +
                '<div onclick="document.getElementById(\'nif-api-panel\').style.display = document.getElementById(\'nif-api-panel\').style.display===\'none\'?\'\':\'none\'" ' +
                    'style="padding:14px 20px; cursor:pointer; display:flex; justify-content:space-between; align-items:center;">' +
                    '<h3 style="margin:0; color:#2196F3; font-size:0.9rem; display:flex; align-items:center; gap:6px;">' +
                        '<span class="material-symbols-outlined" style="font-size:1rem;">manage_search</span> B\u00fasqueda Online y Configuraci\u00f3n API' +
                    '</h3>' +
                    '<span class="material-symbols-outlined" style="color:#666;">expand_more</span>' +
                '</div>' +
                '<div id="nif-api-panel" style="display:none; padding:0 20px 16px;">' +
                    '<div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap; margin-bottom:12px;">' +
                        '<label style="font-size:0.75rem; color:#aaa; text-transform:uppercase; white-space:nowrap;">Fuente:</label>' +
                        '<select id="nif-source" style="background:#2a2a2d; border:1px solid #444; color:#d4d4d4; padding:8px 12px; border-radius:6px; font-size:0.85rem;">' +
                            '<option value="apiempresas">APIEmpresas.es (API)</option>' +
                            '<option value="datoscif">DatosCif.es (Web)</option>' +
                        '</select>' +
                        '<input type="text" id="nif-api-key" placeholder="API Key (si aplica)" style="flex:1; min-width:200px; background:#2a2a2d; border:1px solid #444; color:#d4d4d4; padding:8px 12px; border-radius:6px; font-size:0.85rem;">' +
                    '</div>' +
                    '<div style="display:flex; gap:10px; flex-wrap:wrap;">' +
                        '<input type="text" id="nif-manual-search" placeholder="Buscar empresa en API..." style="flex:1; min-width:250px; background:#2a2a2d; border:1px solid #444; color:#d4d4d4; padding:10px 14px; border-radius:6px; font-size:0.9rem;" onkeypress="if(event.key===\'Enter\') nifManualSearch()">' +
                        '<button onclick="nifManualSearch()" style="background:linear-gradient(135deg,#2196F3,#1565C0); border:none; color:#fff; padding:10px 20px; border-radius:8px; font-weight:bold; font-size:0.85rem; cursor:pointer;">Buscar Online</button>' +
                    '</div>' +
                    '<div id="nif-manual-results" style="margin-top:12px;"></div>' +
                '</div>' +
            '</div>' +

            // Client Table
            '<div style="background:var(--bg-dark); border:1px solid var(--border-glass); border-radius:12px; padding:20px;">' +
                '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; flex-wrap:wrap; gap:10px;">' +
                    '<h3 id="nif-table-title" style="margin:0; color:#FF9800; font-size:1rem; display:flex; align-items:center; gap:8px;">' +
                        '<span class="material-symbols-outlined">group</span> Clientes' +
                    '</h3>' +
                    '<div id="nif-pagination" style="display:flex; gap:8px; align-items:center; font-size:0.8rem; color:#aaa;"></div>' +
                '</div>' +
                '<div id="nif-client-list" style="max-height:600px; overflow-y:auto; color:#888; font-size:0.85rem;">' +
                    '<div style="padding:30px; text-align:center; color:#aaa;">Cargando clientes...</div>' +
                '</div>' +
            '</div>';
    }

    // --- LOAD ALL CLIENTS FROM FIRESTORE ---
    async function _loadClientsFromDB() {
        if (_loading) return;
        _loading = true;

        var listEl = document.getElementById('nif-client-list');
        if (listEl) listEl.innerHTML = '<div style="padding:30px; text-align:center; color:#aaa;"><span class="material-symbols-outlined" style="font-size:2rem; display:block; margin-bottom:8px; animation:spin 1s linear infinite;">sync</span>Cargando base de datos de clientes...</div>';

        try {
            // Load from Firestore
            var snap = await db.collection('users').get();
            _allClients = [];

            snap.forEach(function(doc) {
                var d = doc.data();
                _allClients.push({
                    uid: doc.id,
                    name: d.name || '',
                    email: d.email || '',
                    idNum: d.idNum || d.clientNumber || '',
                    nif: d.nif || '',
                    isGlobal: !!d.isGlobal,
                    address: d.address || '',
                    city: d.city || '',
                    senderPhone: d.senderPhone || '',
                    parentClientId: d.parentClientId || ''
                });

                // Also keep userMap updated
                if (typeof userMap !== 'undefined') {
                    if (!userMap[doc.id]) userMap[doc.id] = d;
                    userMap[doc.id].nif = d.nif || '';
                }
            });

            // Sort: by idNum numeric, then by name
            _allClients.sort(function(a, b) {
                var numA = parseInt(a.idNum) || 99999;
                var numB = parseInt(b.idNum) || 99999;
                if (numA !== numB) return numA - numB;
                return (a.name || '').localeCompare(b.name || '');
            });

            _loading = false;
            _currentPage = 1;
            _applyFilters();
        } catch(err) {
            _loading = false;
            if (listEl) listEl.innerHTML = '<div style="padding:30px; text-align:center; color:#FF5252;"><span class="material-symbols-outlined" style="font-size:2rem; display:block; margin-bottom:8px;">error</span>Error cargando clientes: ' + _esc(err.message) + '</div>';
        }
    }

    // --- RELOAD ---
    window.nifReload = function() {
        _allClients = [];
        _loadClientsFromDB();
    };

    // --- FILTERS ---
    window.nifSetFilter = function(filter) {
        _currentFilter = filter;
        _currentPage = 1;

        // Update button styles
        ['all', 'missing', 'complete'].forEach(function(f) {
            var btn = document.getElementById('nif-filter-' + f);
            if (!btn) return;
            if (f === filter) {
                btn.style.background = f === 'all' ? '#4CAF50' : (f === 'missing' ? '#FF9800' : '#2196F3');
                btn.style.color = 'white';
            } else {
                btn.style.background = 'transparent';
                btn.style.color = '#aaa';
            }
        });

        _applyFilters();
    };

    window.nifFilterClients = function() {
        var input = document.getElementById('nif-client-search');
        _searchText = (input ? input.value : '').trim().toLowerCase();
        _currentPage = 1;
        _applyFilters();
    };

    function _applyFilters() {
        _filteredClients = _allClients.filter(function(c) {
            // Filter by NIF status
            var hasNif = c.nif && c.nif.trim().length >= 8;
            if (_currentFilter === 'missing' && hasNif) return false;
            if (_currentFilter === 'complete' && !hasNif) return false;

            // Search text
            if (_searchText) {
                var fields = [
                    c.name, c.email, c.nif, c.idNum,
                    c.address, c.city, c.senderPhone, c.uid
                ].join(' ').toLowerCase();
                return fields.indexOf(_searchText) !== -1;
            }
            return true;
        });

        _updateStats();
        _renderClientTable();
    }

    // --- STATS ---
    function _updateStats() {
        var statsEl = document.getElementById('nif-stats');
        if (!statsEl) return;

        var total = _allClients.length;
        var withNif = 0;
        var withoutNif = 0;
        _allClients.forEach(function(c) {
            if (c.nif && c.nif.trim().length >= 8) withNif++;
            else withoutNif++;
        });

        var pct = total > 0 ? Math.round((withNif / total) * 100) : 0;

        statsEl.innerHTML =
            '<div style="background:rgba(33,150,243,0.1); border:1px solid rgba(33,150,243,0.3); border-radius:8px; padding:8px 14px; text-align:center; cursor:pointer;" onclick="nifSetFilter(\'all\')">' +
                '<div style="font-size:1.3rem; font-weight:900; color:#2196F3;">' + total + '</div>' +
                '<div style="font-size:0.7rem; color:#aaa;">Total</div></div>' +
            '<div style="background:rgba(76,175,80,0.1); border:1px solid rgba(76,175,80,0.3); border-radius:8px; padding:8px 14px; text-align:center; cursor:pointer;" onclick="nifSetFilter(\'complete\')">' +
                '<div style="font-size:1.3rem; font-weight:900; color:#4CAF50;">' + withNif + '</div>' +
                '<div style="font-size:0.7rem; color:#aaa;">Con NIF</div></div>' +
            '<div style="background:rgba(255,152,0,0.1); border:1px solid rgba(255,152,0,0.3); border-radius:8px; padding:8px 14px; text-align:center; cursor:pointer;" onclick="nifSetFilter(\'missing\')">' +
                '<div style="font-size:1.3rem; font-weight:900; color:#FF9800;">' + withoutNif + '</div>' +
                '<div style="font-size:0.7rem; color:#aaa;">Sin NIF</div></div>' +
            '<div style="background:rgba(156,39,176,0.1); border:1px solid rgba(156,39,176,0.3); border-radius:8px; padding:8px 14px; text-align:center;">' +
                '<div style="font-size:1.3rem; font-weight:900; color:#9C27B0;">' + pct + '%</div>' +
                '<div style="font-size:0.7rem; color:#aaa;">Completado</div></div>';
    }

    // --- RENDER CLIENT TABLE ---
    function _renderClientTable() {
        var listEl = document.getElementById('nif-client-list');
        var titleEl = document.getElementById('nif-table-title');
        var pagEl = document.getElementById('nif-pagination');
        if (!listEl) return;

        var totalFiltered = _filteredClients.length;
        var totalPages = Math.ceil(totalFiltered / _pageSize) || 1;
        if (_currentPage > totalPages) _currentPage = totalPages;

        var start = (_currentPage - 1) * _pageSize;
        var pageItems = _filteredClients.slice(start, start + _pageSize);

        // Title
        var filterLabel = _currentFilter === 'all' ? 'Todos los Clientes' :
                          _currentFilter === 'missing' ? 'Clientes sin NIF/CIF' : 'Clientes con NIF/CIF';
        if (titleEl) {
            titleEl.innerHTML = '<span class="material-symbols-outlined">group</span> ' + filterLabel +
                ' <span style="color:#666; font-weight:normal; font-size:0.85rem;">(' + totalFiltered + ')</span>';
        }

        // Pagination
        if (pagEl) {
            if (totalPages > 1) {
                pagEl.innerHTML =
                    '<button onclick="nifGoPage(' + Math.max(1, _currentPage - 1) + ')" style="background:#2a2a2d; border:1px solid #444; color:#d4d4d4; padding:4px 10px; border-radius:4px; cursor:pointer; font-size:0.8rem;"' + (_currentPage <= 1 ? ' disabled style="opacity:0.3;background:#2a2a2d;border:1px solid #444;color:#d4d4d4;padding:4px 10px;border-radius:4px;cursor:default;font-size:0.8rem;"' : '') + '>&laquo; Ant</button>' +
                    '<span style="color:#aaa; font-size:0.8rem;">' + _currentPage + ' / ' + totalPages + '</span>' +
                    '<button onclick="nifGoPage(' + Math.min(totalPages, _currentPage + 1) + ')" style="background:#2a2a2d; border:1px solid #444; color:#d4d4d4; padding:4px 10px; border-radius:4px; cursor:pointer; font-size:0.8rem;"' + (_currentPage >= totalPages ? ' disabled style="opacity:0.3;background:#2a2a2d;border:1px solid #444;color:#d4d4d4;padding:4px 10px;border-radius:4px;cursor:default;font-size:0.8rem;"' : '') + '>Sig &raquo;</button>';
            } else {
                pagEl.innerHTML = '';
            }
        }

        if (pageItems.length === 0) {
            listEl.innerHTML = '<div style="padding:30px; text-align:center; color:#888; font-size:0.9rem;">' +
                '<span class="material-symbols-outlined" style="font-size:2rem; display:block; margin-bottom:8px;">search_off</span>' +
                (_searchText ? 'No se encontraron clientes para "' + _esc(_searchText) + '".' : 'No hay clientes en esta categor\u00eda.') +
                '</div>';
            return;
        }

        var html = '<table style="width:100%; border-collapse:collapse; font-size:0.82rem;">';
        html += '<thead><tr style="background:#1a1a2e; position:sticky; top:0; z-index:1;">';
        html += '<th style="padding:8px; text-align:left; color:#aaa; width:60px;">N\u00ba</th>';
        html += '<th style="padding:8px; text-align:left; color:#aaa;">Cliente</th>';
        html += '<th style="padding:8px; text-align:left; color:#aaa; width:140px;">NIF/CIF</th>';
        html += '<th style="padding:8px; text-align:center; color:#aaa; width:160px;">Asignar NIF</th>';
        html += '<th style="padding:8px; text-align:center; color:#aaa; width:130px;">Acciones</th>';
        html += '</tr></thead><tbody>';

        pageItems.forEach(function(c, i) {
            var globalIdx = start + i;
            var hasNif = c.nif && c.nif.trim().length >= 8;
            var bg = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)';
            var typeBadge = c.isGlobal
                ? '<span style="background:#FF9800; color:white; padding:1px 6px; border-radius:3px; font-size:0.65rem; margin-left:6px;">GLOBAL</span>'
                : (c.parentClientId ? '<span style="background:#2196F3; color:white; padding:1px 6px; border-radius:3px; font-size:0.65rem; margin-left:6px;">FILIAL</span>' : '');

            html += '<tr id="nif-row-' + globalIdx + '" style="background:' + bg + '; border-bottom:1px solid #222;">';

            // Nº
            html += '<td style="padding:6px 8px; color:#FF9800; font-weight:bold;">' + (c.idNum || '-') + '</td>';

            // Client name + details
            html += '<td style="padding:6px 8px;">' +
                '<div style="font-weight:700; color:#eee;">' + _esc(c.name || 'Sin nombre') + typeBadge + '</div>' +
                (c.email ? '<div style="font-size:0.75rem; color:#666;">' + _esc(c.email) + '</div>' : '') +
                (c.city ? '<div style="font-size:0.72rem; color:#555;">' + _esc(c.city) + '</div>' : '') +
                '</td>';

            // NIF status
            html += '<td style="padding:6px 8px;">';
            if (hasNif) {
                html += '<span style="color:#4CAF50; font-weight:bold;">' + _esc(c.nif) + '</span>';
            } else {
                html += '<span style="color:#FF5252; font-style:italic;">Sin NIF</span>';
            }
            html += '</td>';

            // Input field
            html += '<td style="padding:6px 8px; text-align:center;">' +
                '<input type="text" id="nif-input-' + globalIdx + '" placeholder="B12345678" ' +
                'style="background:#2a2a2d; border:1px solid #444; color:#d4d4d4; padding:4px 8px; border-radius:4px; font-size:0.82rem; width:110px; text-transform:uppercase;" ' +
                'value="' + _esc(c.nif || '') + '">' +
                '</td>';

            // Actions
            html += '<td style="padding:6px 8px; text-align:center; white-space:nowrap;">' +
                '<button onclick="nifSearchFor(' + globalIdx + ')" style="background:#2196F3; border:none; color:white; padding:3px 8px; border-radius:4px; font-size:0.72rem; cursor:pointer; margin-right:3px;" title="Buscar online">\ud83d\udd0d</button>' +
                '<button onclick="nifApplyOne(' + globalIdx + ')" style="background:#4CAF50; border:none; color:white; padding:3px 8px; border-radius:4px; font-size:0.72rem; cursor:pointer; margin-right:3px;" title="Guardar NIF">\u2713</button>' +
                '<button onclick="nifOpenWeb(' + globalIdx + ')" style="background:#555; border:none; color:white; padding:3px 8px; border-radius:4px; font-size:0.72rem; cursor:pointer;" title="Buscar en web">\ud83c\udf10</button>' +
                '</td>';

            html += '</tr>';
        });

        html += '</tbody></table>';
        listEl.innerHTML = html;
    }

    // --- PAGINATION ---
    window.nifGoPage = function(page) {
        _currentPage = page;
        _renderClientTable();
        // Scroll to top of list
        var listEl = document.getElementById('nif-client-list');
        if (listEl) listEl.scrollTop = 0;
    };

    // --- SEARCH FOR A SPECIFIC CLIENT ---
    window.nifSearchFor = async function(idx) {
        var client = _filteredClients[idx];
        if (!client || !client.name) { alert('Cliente sin nombre.'); return; }

        var source = document.getElementById('nif-source');
        var sourceVal = source ? source.value : 'apiempresas';
        var apiKey = (document.getElementById('nif-api-key') || {}).value || '';
        apiKey = apiKey.trim();

        // Expand API panel if collapsed
        var panel = document.getElementById('nif-api-panel');
        if (panel) panel.style.display = '';

        if (sourceVal === 'datoscif') {
            window.open('https://www.datoscif.es/buscar/empresa/' + encodeURIComponent(client.name), '_blank');
            return;
        }

        // APIEmpresas.es
        var row = document.getElementById('nif-row-' + idx);
        if (row) row.style.opacity = '0.5';

        try {
            var url = 'https://apiempresas.es/autocompletado-cif-empresas/get?q=' + encodeURIComponent(client.name);
            if (apiKey) url += '&apikey=' + encodeURIComponent(apiKey);

            var resp = await fetch(url);
            var data = await resp.json();

            if (row) row.style.opacity = '1';

            if (data && data.data && Array.isArray(data.data) && data.data.length > 0) {
                _showSearchResults(idx, data.data);
            } else if (data && data.data && data.data.cif) {
                var input = document.getElementById('nif-input-' + idx);
                if (input) input.value = data.data.cif;
                alert('Encontrado: ' + data.data.name + ' \u2192 ' + data.data.cif);
            } else {
                alert('No se encontraron resultados para "' + client.name + '". Prueba a buscar manualmente con \ud83c\udf10.');
            }
        } catch(err) {
            if (row) row.style.opacity = '1';
            console.warn('[NIF] API error, falling back to web:', err.message);
            var fallback = confirm('La API no est\u00e1 disponible (posible CORS). \u00bfAbrir b\u00fasqueda en web?\n\n' + err.message);
            if (fallback) {
                window.open('https://www.datoscif.es/buscar/empresa/' + encodeURIComponent(client.name), '_blank');
            }
        }
    };

    function _showSearchResults(idx, results) {
        var resultsEl = document.getElementById('nif-manual-results');
        if (!resultsEl) return;

        var client = _filteredClients[idx];
        var html = '<div style="font-size:0.8rem; color:#aaa; margin-bottom:8px;">Resultados para <strong style="color:#FF9800;">' + _esc(client.name) + '</strong>:</div>';
        html += '<div style="display:flex; flex-direction:column; gap:6px;">';

        var items = Array.isArray(results) ? results.slice(0, 8) : [results];
        items.forEach(function(r) {
            var name = r.name || r.razon_social || '';
            var cif = r.cif || r.nif || '';
            html += '<div style="background:#1a1a2e; border:1px solid #333; border-radius:6px; padding:10px 14px; display:flex; justify-content:space-between; align-items:center;">';
            html += '<div><strong style="color:#eee;">' + _esc(name) + '</strong> <span style="color:#2196F3; font-weight:bold; margin-left:8px;">' + _esc(cif) + '</span>';
            if (r.province) html += ' <span style="color:#666; font-size:0.75rem;">(' + _esc(r.province) + ')</span>';
            html += '</div>';
            html += '<button onclick="document.getElementById(\'nif-input-' + idx + '\').value=\'' + _esc(cif) + '\'; this.textContent=\'Usado!\'; this.style.background=\'#FF9800\';" style="background:#4CAF50; border:none; color:white; padding:4px 12px; border-radius:4px; font-size:0.75rem; cursor:pointer; font-weight:bold;">Usar</button>';
            html += '</div>';
        });

        html += '</div>';
        resultsEl.innerHTML = html;
        resultsEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // --- MANUAL SEARCH ---
    window.nifManualSearch = async function() {
        var query = (document.getElementById('nif-manual-search').value || '').trim();
        if (!query || query.length < 3) { alert('Escribe al menos 3 caracteres.'); return; }

        var resultsEl = document.getElementById('nif-manual-results');
        var source = document.getElementById('nif-source');
        var sourceVal = source ? source.value : 'apiempresas';
        var apiKey = (document.getElementById('nif-api-key') || {}).value || '';
        apiKey = apiKey.trim();

        if (sourceVal === 'datoscif') {
            window.open('https://www.datoscif.es/buscar/empresa/' + encodeURIComponent(query), '_blank');
            return;
        }

        if (resultsEl) resultsEl.innerHTML = '<div style="color:#aaa; font-size:0.85rem;">Buscando "' + _esc(query) + '"...</div>';

        try {
            var url = 'https://apiempresas.es/autocompletado-cif-empresas/get?q=' + encodeURIComponent(query);
            if (apiKey) url += '&apikey=' + encodeURIComponent(apiKey);

            var resp = await fetch(url);
            var data = await resp.json();

            if (data && data.data && ((Array.isArray(data.data) && data.data.length > 0) || data.data.cif)) {
                var items = Array.isArray(data.data) ? data.data.slice(0, 10) : [data.data];
                var html = '<div style="font-size:0.8rem; color:#aaa; margin-bottom:8px;">' + items.length + ' resultado(s):</div>';
                html += '<div style="display:flex; flex-direction:column; gap:6px;">';

                items.forEach(function(r) {
                    var name = r.name || r.razon_social || '';
                    var cif = r.cif || r.nif || '';
                    html += '<div style="background:#1a1a2e; border:1px solid #333; border-radius:6px; padding:10px 14px; display:flex; justify-content:space-between; align-items:center;">';
                    html += '<div><strong style="color:#eee;">' + _esc(name) + '</strong> <span style="color:#2196F3; font-weight:bold; margin-left:8px;">' + _esc(cif) + '</span>';
                    if (r.address) html += '<br><span style="color:#666; font-size:0.75rem;">' + _esc(r.address) + '</span>';
                    if (r.province) html += ' <span style="color:#666; font-size:0.75rem;">(' + _esc(r.province) + ')</span>';
                    html += '</div>';
                    html += '<button onclick="navigator.clipboard.writeText(\'' + _esc(cif) + '\'); this.textContent=\'Copiado!\'; setTimeout(()=>this.textContent=\'Copiar\',1500)" style="background:#2196F3; border:none; color:white; padding:4px 12px; border-radius:4px; font-size:0.75rem; cursor:pointer; white-space:nowrap;">Copiar</button>';
                    html += '</div>';
                });

                html += '</div>';
                if (resultsEl) resultsEl.innerHTML = html;
            } else {
                if (resultsEl) resultsEl.innerHTML = '<div style="color:#888; font-size:0.85rem;">Sin resultados para "' + _esc(query) + '".</div>';
            }
        } catch(err) {
            console.warn('[NIF] Manual search error:', err.message);
            if (resultsEl) resultsEl.innerHTML = '<div style="color:#FF9800; font-size:0.85rem;">Error de API: ' + _esc(err.message) + '. <a href="https://www.datoscif.es/buscar/empresa/' + encodeURIComponent(query) + '" target="_blank" style="color:#2196F3;">Buscar en DatosCif</a></div>';
        }
    };

    // --- APPLY NIF TO ONE CLIENT ---
    window.nifApplyOne = async function(idx) {
        var client = _filteredClients[idx];
        if (!client) return;

        var input = document.getElementById('nif-input-' + idx);
        var nif = (input ? input.value : '').trim().toUpperCase();

        if (!nif || nif.length < 8) {
            alert('Introduce un NIF/CIF v\u00e1lido (m\u00ednimo 8 caracteres).');
            return;
        }

        try {
            await db.collection('users').doc(client.uid).update({ nif: nif });

            // Update local data
            client.nif = nif;
            if (typeof userMap !== 'undefined' && userMap[client.uid]) {
                userMap[client.uid].nif = nif;
            }

            // Also update in _allClients
            var origClient = _allClients.find(function(c) { return c.uid === client.uid; });
            if (origClient) origClient.nif = nif;

            // Visual feedback
            var row = document.getElementById('nif-row-' + idx);
            if (row) {
                row.style.background = 'rgba(76,175,80,0.15)';
                row.style.transition = 'background 0.5s';
            }

            // Refresh stats
            _updateStats();

            // Flash success
            if (input) {
                input.style.borderColor = '#4CAF50';
                input.style.background = 'rgba(76,175,80,0.2)';
                setTimeout(function() {
                    input.style.borderColor = '#444';
                    input.style.background = '#2a2a2d';
                }, 2000);
            }

        } catch(err) {
            alert('Error al guardar: ' + err.message);
        }
    };

    // --- OPEN WEB SEARCH ---
    window.nifOpenWeb = function(idx) {
        var client = _filteredClients[idx];
        if (!client || !client.name) return;
        window.open('https://www.datoscif.es/buscar/empresa/' + encodeURIComponent(client.name), '_blank');
    };

    // --- HELPER ---
    function _esc(str) {
        var div = document.createElement('div');
        div.textContent = str || '';
        return div.innerHTML;
    }

})();
