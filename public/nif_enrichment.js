// =============================================
// NOVAPACK — NIF/CIF Enrichment v1.0
// =============================================
// Search and auto-fill CIF/NIF for clients
// using APIEmpresas.es or DatosCif.es
// =============================================

(function() {
    'use strict';

    var _clientsWithoutNif = []; // [{uid, name, email, idNum}]

    window.loadNifEnrichment = function() {
        // Auto-scan on load if userMap is available
        if (typeof userMap !== 'undefined' && Object.keys(userMap).length > 0) {
            nifScanMissing();
        }
    };

    // --- SCAN CLIENTS WITHOUT NIF ---
    window.nifScanMissing = function() {
        var listEl = document.getElementById('nif-client-list');
        var statsEl = document.getElementById('nif-stats');
        if (!listEl) return;

        if (typeof userMap === 'undefined') {
            listEl.innerHTML = '<div style="padding:20px; text-align:center; color:#FF5252;">userMap no disponible. Carga la lista de clientes primero.</div>';
            return;
        }

        _clientsWithoutNif = [];
        var totalClients = 0;
        var withNif = 0;

        Object.entries(userMap).forEach(function(entry) {
            var uid = entry[0];
            var u = entry[1];
            if (u.isGlobal) return;
            totalClients++;
            if (u.nif && u.nif.trim().length >= 8) {
                withNif++;
            } else {
                _clientsWithoutNif.push({
                    uid: uid,
                    name: u.name || '',
                    email: u.email || '',
                    idNum: u.idNum || u.clientNumber || '',
                    currentNif: u.nif || ''
                });
            }
        });

        // Sort by name
        _clientsWithoutNif.sort(function(a, b) { return (a.name || '').localeCompare(b.name || ''); });

        // Stats
        if (statsEl) {
            var pct = totalClients > 0 ? Math.round((withNif / totalClients) * 100) : 0;
            statsEl.innerHTML =
                '<div style="background:rgba(76,175,80,0.1); border:1px solid rgba(76,175,80,0.3); border-radius:8px; padding:8px 14px; text-align:center;">' +
                '<div style="font-size:1.3rem; font-weight:900; color:#4CAF50;">' + withNif + '</div>' +
                '<div style="font-size:0.7rem; color:#aaa;">Con NIF</div></div>' +
                '<div style="background:rgba(255,152,0,0.1); border:1px solid rgba(255,152,0,0.3); border-radius:8px; padding:8px 14px; text-align:center;">' +
                '<div style="font-size:1.3rem; font-weight:900; color:#FF9800;">' + _clientsWithoutNif.length + '</div>' +
                '<div style="font-size:0.7rem; color:#aaa;">Sin NIF</div></div>' +
                '<div style="background:rgba(33,150,243,0.1); border:1px solid rgba(33,150,243,0.3); border-radius:8px; padding:8px 14px; text-align:center;">' +
                '<div style="font-size:1.3rem; font-weight:900; color:#2196F3;">' + pct + '%</div>' +
                '<div style="font-size:0.7rem; color:#aaa;">Completado</div></div>';
        }

        _renderMissingList();
    };

    function _renderMissingList() {
        var listEl = document.getElementById('nif-client-list');
        if (_clientsWithoutNif.length === 0) {
            listEl.innerHTML = '<div style="padding:30px; text-align:center; color:#4CAF50; font-size:0.9rem;"><span class="material-symbols-outlined" style="font-size:2rem; display:block; margin-bottom:8px;">check_circle</span>Todos los clientes tienen NIF/CIF.</div>';
            return;
        }

        var html = '<table style="width:100%; border-collapse:collapse; font-size:0.82rem;">';
        html += '<thead><tr style="background:#1a1a2e; position:sticky; top:0; z-index:1;">';
        html += '<th style="padding:8px; text-align:left; color:#aaa;">Nº</th>';
        html += '<th style="padding:8px; text-align:left; color:#aaa;">Cliente</th>';
        html += '<th style="padding:8px; text-align:left; color:#aaa;">NIF Actual</th>';
        html += '<th style="padding:8px; text-align:center; color:#aaa;">Asignar NIF</th>';
        html += '<th style="padding:8px; text-align:center; color:#aaa;">Acciones</th>';
        html += '</tr></thead><tbody>';

        _clientsWithoutNif.forEach(function(c, i) {
            var bg = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)';
            html += '<tr id="nif-row-' + i + '" style="background:' + bg + '; border-bottom:1px solid #222;">';
            html += '<td style="padding:6px 8px; color:#FF9800; font-weight:bold;">' + (c.idNum || '-') + '</td>';
            html += '<td style="padding:6px 8px;">' + _esc(c.name || 'Sin nombre') + '</td>';
            html += '<td style="padding:6px 8px; color:#FF5252;">' + (c.currentNif || '<em>vacío</em>') + '</td>';
            html += '<td style="padding:6px 8px; text-align:center;">' +
                '<input type="text" id="nif-input-' + i + '" placeholder="B12345678" style="background:#2a2a2d; border:1px solid #444; color:#d4d4d4; padding:4px 8px; border-radius:4px; font-size:0.82rem; width:110px; text-transform:uppercase;" value="' + _esc(c.currentNif || '') + '">' +
                '</td>';
            html += '<td style="padding:6px 8px; text-align:center; white-space:nowrap;">' +
                '<button onclick="nifSearchFor(' + i + ')" style="background:#2196F3; border:none; color:white; padding:3px 8px; border-radius:4px; font-size:0.72rem; cursor:pointer; margin-right:4px;" title="Buscar online">🔍</button>' +
                '<button onclick="nifApplyOne(' + i + ')" style="background:#4CAF50; border:none; color:white; padding:3px 8px; border-radius:4px; font-size:0.72rem; cursor:pointer; margin-right:4px;" title="Guardar NIF">✓</button>' +
                '<button onclick="nifOpenWeb(' + i + ')" style="background:#555; border:none; color:white; padding:3px 8px; border-radius:4px; font-size:0.72rem; cursor:pointer;" title="Buscar en web">🌐</button>' +
                '</td>';
            html += '</tr>';
        });

        html += '</tbody></table>';
        listEl.innerHTML = html;
    }

    // --- SEARCH FOR A SPECIFIC CLIENT ---
    window.nifSearchFor = async function(idx) {
        var client = _clientsWithoutNif[idx];
        if (!client || !client.name) { alert('Cliente sin nombre.'); return; }

        var source = document.getElementById('nif-source').value;
        var apiKey = (document.getElementById('nif-api-key').value || '').trim();

        if (source === 'datoscif') {
            // Open DatosCif in new tab
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
                // Single result
                var input = document.getElementById('nif-input-' + idx);
                if (input) input.value = data.data.cif;
                alert('Encontrado: ' + data.data.name + ' → ' + data.data.cif);
            } else {
                alert('No se encontraron resultados para "' + client.name + '". Prueba a buscar manualmente con 🌐.');
            }
        } catch(err) {
            if (row) row.style.opacity = '1';
            // CORS error or network issue — fallback to web search
            console.warn('[NIF] API error, falling back to web:', err.message);
            var fallback = confirm('La API no está disponible (posible CORS). ¿Abrir búsqueda en web?\n\n' + err.message);
            if (fallback) {
                window.open('https://www.datoscif.es/buscar/empresa/' + encodeURIComponent(client.name), '_blank');
            }
        }
    };

    function _showSearchResults(idx, results) {
        var resultsEl = document.getElementById('nif-manual-results');
        if (!resultsEl) return;

        var client = _clientsWithoutNif[idx];
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
            html += '<button onclick="document.getElementById(\'nif-input-' + idx + '\').value=\'' + _esc(cif) + '\'" style="background:#4CAF50; border:none; color:white; padding:4px 12px; border-radius:4px; font-size:0.75rem; cursor:pointer; font-weight:bold;">Usar</button>';
            html += '</div>';
        });

        html += '</div>';
        resultsEl.innerHTML = html;

        // Scroll to results
        resultsEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // --- MANUAL SEARCH ---
    window.nifManualSearch = async function() {
        var query = (document.getElementById('nif-manual-search').value || '').trim();
        if (!query || query.length < 3) { alert('Escribe al menos 3 caracteres.'); return; }

        var resultsEl = document.getElementById('nif-manual-results');
        var source = document.getElementById('nif-source').value;
        var apiKey = (document.getElementById('nif-api-key').value || '').trim();

        if (source === 'datoscif') {
            window.open('https://www.datoscif.es/buscar/empresa/' + encodeURIComponent(query), '_blank');
            return;
        }

        resultsEl.innerHTML = '<div style="color:#aaa; font-size:0.85rem;">Buscando "' + _esc(query) + '"...</div>';

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
                resultsEl.innerHTML = html;
            } else {
                resultsEl.innerHTML = '<div style="color:#888; font-size:0.85rem;">Sin resultados para "' + _esc(query) + '".</div>';
            }
        } catch(err) {
            console.warn('[NIF] Manual search error:', err.message);
            resultsEl.innerHTML = '<div style="color:#FF9800; font-size:0.85rem;">Error de API: ' + _esc(err.message) + '. <a href="https://www.datoscif.es/buscar/empresa/' + encodeURIComponent(query) + '" target="_blank" style="color:#2196F3;">Buscar en DatosCif</a></div>';
        }
    };

    // --- APPLY NIF TO ONE CLIENT ---
    window.nifApplyOne = async function(idx) {
        var client = _clientsWithoutNif[idx];
        if (!client) return;

        var input = document.getElementById('nif-input-' + idx);
        var nif = (input ? input.value : '').trim().toUpperCase();

        if (!nif || nif.length < 8) {
            alert('Introduce un NIF/CIF válido (mínimo 8 caracteres).');
            return;
        }

        try {
            await db.collection('users').doc(client.uid).update({ nif: nif });

            // Update local userMap
            if (typeof userMap !== 'undefined' && userMap[client.uid]) {
                userMap[client.uid].nif = nif;
            }

            // Visual feedback
            var row = document.getElementById('nif-row-' + idx);
            if (row) {
                row.style.background = 'rgba(76,175,80,0.1)';
                row.querySelector('td:nth-child(3)').innerHTML = '<span style="color:#4CAF50; font-weight:bold;">' + _esc(nif) + '</span>';
            }

            // Remove from list
            _clientsWithoutNif.splice(idx, 1);

            // Refresh stats
            setTimeout(function() { nifScanMissing(); }, 500);
        } catch(err) {
            alert('Error al guardar: ' + err.message);
        }
    };

    // --- OPEN WEB SEARCH ---
    window.nifOpenWeb = function(idx) {
        var client = _clientsWithoutNif[idx];
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
