
(function() {
    // Inject the contabilidad workspace panel into the billing view
    const billView = document.getElementById('view-adv-billing');
    if (!billView) return;

    const ws = document.createElement('div');
    ws.id = 'conta-workspace';
    ws.style.cssText = 'display:none; flex-direction:column; flex:1; overflow-y:auto; padding:20px; background:#1e1e1e; color:#d4d4d4;';
    ws.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #3c3c3c; padding-bottom:15px; margin-bottom:20px;">
            <div>
                <h1 style="color:#fff; margin:0; font-size:1.2rem;">📚 Motor Contable · Novapack Cloud</h1>
                <p style="color:#aaa; font-size:0.8rem; margin-top:5px;">Asientos automáticos del módulo de facturación avanzada.</p>
            </div>
            <div style="display:flex; gap:6px; flex-wrap:wrap;">
                <button onclick="contaLoadDashboard()" style="background:#333; border:1px solid #555; color:#E040FB; padding:5px 12px; font-size:0.78rem; cursor:pointer; border-radius:3px;">📊 Dashboard</button>
                <button onclick="contaLoadDiario()" style="background:#333; border:1px solid #555; color:#9cdcfe; padding:5px 12px; font-size:0.78rem; cursor:pointer; border-radius:3px;">📖 Diario</button>
                <button onclick="contaLoadBalance()" style="background:#333; border:1px solid #555; color:#FFD700; padding:5px 12px; font-size:0.78rem; cursor:pointer; border-radius:3px;">⚖️ Balance</button>
                <button onclick="contaLoadIVA()" style="background:#333; border:1px solid #555; color:#81C784; padding:5px 12px; font-size:0.78rem; cursor:pointer; border-radius:3px;">🧾 IVA</button>
                <button onclick="contaLoadCartera()" style="background:#333; border:1px solid #555; color:#ff6b6b; padding:5px 12px; font-size:0.78rem; cursor:pointer; border-radius:3px;">📋 Cartera</button>
                <button onclick="contaLoadModelo303()" style="background:#333; border:1px solid #555; color:#00BCD4; padding:5px 12px; font-size:0.78rem; cursor:pointer; border-radius:3px;">🏛️ Mod.303</button>
                <button onclick="contaLoadModelo347()" style="background:#333; border:1px solid #555; color:#FF9800; padding:5px 12px; font-size:0.78rem; cursor:pointer; border-radius:3px;">📄 Mod.347</button>
                <button onclick="contaLoadGastos()" style="background:#333; border:1px solid #555; color:#ffab91; padding:5px 12px; font-size:0.78rem; cursor:pointer; border-radius:3px;">💸 Gastos</button>
                <button onclick="contaLoadPyG()" style="background:#333; border:1px solid #555; color:#00E5FF; padding:5px 12px; font-size:0.78rem; cursor:pointer; border-radius:3px;">📈 PyG</button>
                <button onclick="contaLoadSEPA()" style="background:#333; border:1px solid #555; color:#2196F3; padding:5px 12px; font-size:0.78rem; cursor:pointer; border-radius:3px;">🏦 SEPA</button>
            </div>
        </div>
        <div id="conta-content" style="flex:1; overflow-y:auto;"></div>
    `;
    billView.appendChild(ws);

    // --- CLIENTS WORKSPACE ---
    const clientsWS = document.createElement('div');
    clientsWS.id = 'adv-clients-workspace';
    clientsWS.style.cssText = 'display:none; flex-direction:column; flex:1; overflow-y:auto; padding:20px; background:#1e1e1e; color:#d4d4d4;';
    clientsWS.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #3c3c3c; padding-bottom:15px; margin-bottom:15px;">
            <div>
                <h1 style="color:#fff; margin:0; font-size:1.2rem;">👥 Gestión de Clientes · Facturación PRO</h1>
                <p style="color:#aaa; font-size:0.8rem; margin-top:5px;">Buscar, editar y gestionar clientes sin salir de Facturación.</p>
            </div>
            <div style="display:flex; gap:8px;">
                <button onclick="if(typeof window.openNewUserModal==='function') window.openNewUserModal();" style="background:#FF9800; border:none; color:#fff; padding:6px 14px; font-size:0.8rem; cursor:pointer; border-radius:4px; font-weight:bold;">➕ Nuevo Cliente</button>
                <button onclick="if(typeof window.toggleAdvWorkspace==='function') window.toggleAdvWorkspace('main');" style="background:#333; border:1px solid #555; color:#ccc; padding:6px 14px; font-size:0.8rem; cursor:pointer; border-radius:4px;">◀ Volver</button>
            </div>
        </div>
        <div style="margin-bottom:15px; display:flex; gap:10px; align-items:center;">
            <input type="text" id="adv-client-search" placeholder="🔍 Buscar cliente por nombre, email, NIF, teléfono..." oninput="window.advFilterClients(this.value)" style="flex:1; background:#2d2d30; border:1px solid #3c3c3c; color:#fff; padding:10px 14px; font-size:0.85rem; border-radius:6px; outline:none;">
            <span id="adv-client-count" style="color:#888; font-size:0.75rem; white-space:nowrap;"></span>
        </div>
        <div id="adv-clients-content" style="flex:1; overflow-y:auto;"></div>
    `;
    billView.appendChild(clientsWS);

    // Client management functions for embedded workspace
    window._advClientsCache = [];
    
    window.advLoadClients = async function() {
        const container = document.getElementById('adv-clients-content');
        if (!container) return;
        container.innerHTML = '<div style="text-align:center; padding:40px; color:#888;">Cargando clientes...</div>';
        
        try {
            const snap = await db.collection('users').orderBy('name', 'asc').limit(500).get();
            window._advClientsCache = [];
            snap.forEach(doc => {
                window._advClientsCache.push({ id: doc.id, ...doc.data() });
            });
            window.advRenderClients(window._advClientsCache);
        } catch(e) {
            container.innerHTML = '<div style="color:#f44; padding:20px;">Error: ' + e.message + '</div>';
        }
    };
    
    window.advFilterClients = function(query) {
        const q = (query || '').toLowerCase().trim();
        if (!q) { window.advRenderClients(window._advClientsCache); return; }
        const filtered = window._advClientsCache.filter(c => {
            return (c.name || '').toLowerCase().includes(q) ||
                   (c.email || '').toLowerCase().includes(q) ||
                   (c.idNum || '').toLowerCase().includes(q) ||
                   (c.phone || '').toLowerCase().includes(q) ||
                   (String(c.clientNumber || '')).includes(q);
        });
        window.advRenderClients(filtered);
    };
    
    window.advRenderClients = function(clients) {
        const container = document.getElementById('adv-clients-content');
        const countEl = document.getElementById('adv-client-count');
        if (!container) return;
        if (countEl) countEl.textContent = clients.length + ' clientes';
        
        if (clients.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:40px; color:#888;">No se encontraron clientes.</div>';
            return;
        }
        
        let html = '<div style="overflow-y:auto; max-height:calc(100vh - 280px);">';
        html += '<table style="width:100%; border-collapse:collapse; font-size:0.8rem;">';
        html += '<thead style="position:sticky; top:0; z-index:1;"><tr style="background:#2d2d30; color:#9cdcfe; font-size:0.7rem;">';
        html += '<th style="padding:8px 6px; text-align:left;">Nº</th>';
        html += '<th style="padding:8px 6px; text-align:left;">Nombre</th>';
        html += '<th style="padding:8px 6px; text-align:left;">Email</th>';
        html += '<th style="padding:8px 6px; text-align:left;">NIF/CIF</th>';
        html += '<th style="padding:8px 6px; text-align:left;">Teléfono</th>';
        html += '<th style="padding:8px 6px; text-align:center;">Estado</th>';
        html += '<th style="padding:8px 6px; text-align:center; min-width:200px;">Acciones</th>';
        html += '</tr></thead><tbody>';
        
        clients.forEach(c => {
            const status = c.active !== false ? '<span style="color:#4CAF50;">● Activo</span>' : '<span style="color:#f44;">● Inactivo</span>';
            html += '<tr style="border-bottom:1px solid #2d2d30;" onmouseover="this.style.background=\'rgba(255,255,255,0.03)\'" onmouseout="this.style.background=\'transparent\'">';
            html += '<td style="padding:6px; color:#FFD700; font-weight:bold;">' + (c.clientNumber || c.idNum || '-') + '</td>';
            html += '<td style="padding:6px; color:#fff;">' + (c.name || '-') + '</td>';
            html += '<td style="padding:6px; color:#888;">' + (c.email || '-') + '</td>';
            html += '<td style="padding:6px; color:#ccc;">' + (c.idNum || '-') + '</td>';
            html += '<td style="padding:6px; color:#888;">' + (c.phone || '-') + '</td>';
            html += '<td style="padding:6px; text-align:center; font-size:0.7rem;">' + status + '</td>';
            html += '<td style="padding:6px; text-align:center; white-space:nowrap;">';
            html += '<button onclick="advSelectClientForInvoice(\'' + c.id + '\')" style="background:#007acc; border:none; color:#fff; padding:3px 8px; font-size:0.7rem; cursor:pointer; border-radius:3px; margin:1px;" title="Facturar a este cliente">📋</button>';
            html += '<button onclick="advEditClient(\'' + c.id + '\')" style="background:#FF9800; border:none; color:#fff; padding:3px 8px; font-size:0.7rem; cursor:pointer; border-radius:3px; margin:1px;" title="Editar cliente">✏️</button>';
            html += '<button onclick="advDeleteClient(\'' + c.id + '\', \'' + (c.name || '').replace(/'/g, '') + '\')" style="background:transparent; border:1px solid #f44; color:#f44; padding:3px 8px; font-size:0.7rem; cursor:pointer; border-radius:3px; margin:1px;" title="Eliminar cliente">🗑️</button>';
            html += '</td></tr>';
        });
        
        html += '</tbody></table></div>';
        container.innerHTML = html;
    };
    
    // Edit client - uses the existing edit modal
    window.advEditClient = function(clientId) {
        if (typeof window.openEditUserModal === 'function') {
            window.openEditUserModal(clientId);
        } else {
            alert('Función de edición no disponible. Edita el cliente desde la sección Gestión de Clientes del menú lateral.');
        }
    };
    
    // Delete client
    window.advDeleteClient = async function(clientId, clientName) {
        if (!confirm('¿Estás seguro de eliminar al cliente "' + clientName + '"?\n\nEsta acción no se puede deshacer.')) return;
        try {
            await db.collection('users').doc(clientId).delete();
            alert('✅ Cliente eliminado.');
            window.advLoadClients();
        } catch(e) {
            alert('Error al eliminar: ' + e.message);
        }
    };
    
    // Quick action: select client and go back to invoice form
    window.advSelectClientForInvoice = function(clientId) {
        const client = window._advClientsCache.find(c => c.id === clientId);
        if (!client) return;
        // Set the client picker if available
        const picker = document.getElementById('adv-client-picker');
        if (picker) {
            // Find option matching this client
            for (let i = 0; i < picker.options.length; i++) {
                if (picker.options[i].value === client.name || picker.options[i].value === clientId) {
                    picker.selectedIndex = i;
                    picker.dispatchEvent(new Event('change'));
                    break;
                }
            }
        }
        // Switch back to main workspace
        if(typeof window.toggleAdvWorkspace === 'function') window.toggleAdvWorkspace('main');
    };

    // --- PROVIDERS WORKSPACE ---
    const provsWS = document.createElement('div');
    provsWS.id = 'adv-providers-workspace';
    provsWS.style.cssText = 'display:none; flex-direction:column; flex:1; overflow-y:auto; padding:20px; background:#1e1e1e; color:#d4d4d4;';
    provsWS.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #3c3c3c; padding-bottom:15px; margin-bottom:15px;">
            <div>
                <h1 style="color:#fff; margin:0; font-size:1.2rem;">🏭 Gestión de Proveedores · Facturación PRO</h1>
                <p style="color:#aaa; font-size:0.8rem; margin-top:5px;">Alta, edición y gestión de proveedores para el registro de gastos.</p>
            </div>
            <div style="display:flex; gap:8px;">
                <button onclick="if(typeof window.toggleAdvWorkspace==='function') window.toggleAdvWorkspace('main');" style="background:#333; border:1px solid #555; color:#ccc; padding:6px 14px; font-size:0.8rem; cursor:pointer; border-radius:4px;">◀ Volver</button>
            </div>
        </div>
        <!-- Provider Form -->
        <div style="background:#252526; border:1px solid #3c3c3c; border-radius:10px; padding:18px; margin-bottom:20px;">
            <div style="color:#FF9800; font-size:0.78rem; font-weight:bold; margin-bottom:12px;" id="prov-form-title">➕ NUEVO PROVEEDOR</div>
            <input type="hidden" id="prov-edit-id" value="">
            <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:10px;">
                <div>
                    <label style="color:#888; font-size:0.65rem; display:block; margin-bottom:4px;">NOMBRE / RAZÓN SOCIAL *</label>
                    <input type="text" id="prov-name" placeholder="Nombre del proveedor" style="background:#3c3c3c; border:1px solid #555; color:#fff; padding:8px; font-size:0.85rem; width:100%; box-sizing:border-box; outline:none; border-radius:4px;">
                </div>
                <div>
                    <label style="color:#888; font-size:0.65rem; display:block; margin-bottom:4px;">NIF / CIF</label>
                    <input type="text" id="prov-nif" placeholder="B12345678" style="background:#3c3c3c; border:1px solid #555; color:#fff; padding:8px; font-size:0.85rem; width:100%; box-sizing:border-box; outline:none; border-radius:4px; text-transform:uppercase;">
                </div>
                <div>
                    <label style="color:#888; font-size:0.65rem; display:block; margin-bottom:4px;">CATEGORÍA</label>
                    <select id="prov-category" style="background:#3c3c3c; border:1px solid #555; color:#fff; padding:8px; font-size:0.85rem; width:100%; box-sizing:border-box; outline:none; border-radius:4px;">
                        <option value="">— Seleccionar —</option>
                        <option value="Combustible">Combustible</option>
                        <option value="Mantenimiento Vehículos">Mantenimiento Vehículos</option>
                        <option value="Seguros">Seguros</option>
                        <option value="Peajes y Autopistas">Peajes y Autopistas</option>
                        <option value="Material Embalaje">Material Embalaje</option>
                        <option value="Alquiler Local/Nave">Alquiler Local/Nave</option>
                        <option value="Suministros">Suministros (Luz, Agua, Internet)</option>
                        <option value="Teléfono/Comunicaciones">Teléfono/Comunicaciones</option>
                        <option value="Material Oficina">Material Oficina</option>
                        <option value="Asesoría/Gestoría">Asesoría/Gestoría</option>
                        <option value="Reparaciones">Reparaciones</option>
                        <option value="Publicidad">Publicidad</option>
                        <option value="Otros">Otros</option>
                    </select>
                </div>
            </div>
            <div style="display:grid; grid-template-columns: 2fr 1fr 1fr; gap:10px; margin-top:10px;">
                <div>
                    <label style="color:#888; font-size:0.65rem; display:block; margin-bottom:4px;">DIRECCIÓN</label>
                    <input type="text" id="prov-address" placeholder="Calle, número, CP, Ciudad" style="background:#3c3c3c; border:1px solid #555; color:#fff; padding:8px; font-size:0.85rem; width:100%; box-sizing:border-box; outline:none; border-radius:4px;">
                </div>
                <div>
                    <label style="color:#888; font-size:0.65rem; display:block; margin-bottom:4px;">TELÉFONO</label>
                    <input type="text" id="prov-phone" placeholder="600 000 000" style="background:#3c3c3c; border:1px solid #555; color:#fff; padding:8px; font-size:0.85rem; width:100%; box-sizing:border-box; outline:none; border-radius:4px;">
                </div>
                <div>
                    <label style="color:#888; font-size:0.65rem; display:block; margin-bottom:4px;">EMAIL</label>
                    <input type="text" id="prov-email" placeholder="admin@proveedor.com" style="background:#3c3c3c; border:1px solid #555; color:#fff; padding:8px; font-size:0.85rem; width:100%; box-sizing:border-box; outline:none; border-radius:4px;">
                </div>
            </div>
            <div style="display:grid; grid-template-columns: 1fr 2fr auto; gap:10px; margin-top:10px; align-items:end;">
                <div>
                    <label style="color:#888; font-size:0.65rem; display:block; margin-bottom:4px;">IBAN BANCARIO</label>
                    <input type="text" id="prov-iban" placeholder="ES00 0000 0000 0000 0000 0000" style="background:#3c3c3c; border:1px solid #555; color:#fff; padding:8px; font-size:0.85rem; width:100%; box-sizing:border-box; outline:none; border-radius:4px; text-transform:uppercase;">
                </div>
                <div>
                    <label style="color:#888; font-size:0.65rem; display:block; margin-bottom:4px;">NOTAS</label>
                    <input type="text" id="prov-notes" placeholder="Notas adicionales..." style="background:#3c3c3c; border:1px solid #555; color:#fff; padding:8px; font-size:0.85rem; width:100%; box-sizing:border-box; outline:none; border-radius:4px;">
                </div>
                <div style="display:flex; gap:6px;">
                    <button onclick="window.advSaveProvider()" style="background:#FF9800; border:none; color:#fff; padding:8px 18px; font-size:0.8rem; cursor:pointer; border-radius:4px; font-weight:bold;">💾 Guardar</button>
                    <button onclick="window.advResetProvForm()" style="background:#333; border:1px solid #555; color:#ccc; padding:8px 12px; font-size:0.8rem; cursor:pointer; border-radius:4px;">✕</button>
                </div>
            </div>
        </div>
        <!-- Search -->
        <div style="margin-bottom:15px; display:flex; gap:10px; align-items:center;">
            <input type="text" id="adv-prov-search" placeholder="🔍 Buscar proveedor..." oninput="window.advFilterProviders(this.value)" style="flex:1; background:#2d2d30; border:1px solid #3c3c3c; color:#fff; padding:10px 14px; font-size:0.85rem; border-radius:6px; outline:none;">
            <span id="adv-prov-count" style="color:#888; font-size:0.75rem; white-space:nowrap;"></span>
        </div>
        <div id="adv-providers-content" style="flex:1; overflow-y:auto;"></div>
    `;
    billView.appendChild(provsWS);

    // Providers CRUD
    window._advProvsCache = [];
    
    window.advResetProvForm = function() {
        document.getElementById('prov-edit-id').value = '';
        document.getElementById('prov-name').value = '';
        document.getElementById('prov-nif').value = '';
        document.getElementById('prov-category').value = '';
        document.getElementById('prov-address').value = '';
        document.getElementById('prov-phone').value = '';
        document.getElementById('prov-email').value = '';
        document.getElementById('prov-iban').value = '';
        document.getElementById('prov-notes').value = '';
        document.getElementById('prov-form-title').textContent = '➕ NUEVO PROVEEDOR';
    };
    
    window.advLoadProviders = async function() {
        const container = document.getElementById('adv-providers-content');
        if (!container) return;
        container.innerHTML = '<div style="text-align:center; padding:40px; color:#888;">Cargando proveedores...</div>';
        try {
            const snap = await db.collection('providers').orderBy('name', 'asc').limit(500).get();
            window._advProvsCache = [];
            snap.forEach(doc => { window._advProvsCache.push({ id: doc.id, ...doc.data() }); });
            window.advRenderProviders(window._advProvsCache);
        } catch(e) {
            container.innerHTML = '<div style="color:#f44; padding:20px;">Error: ' + e.message + '</div>';
        }
    };
    
    window.advFilterProviders = function(query) {
        const q = (query || '').toLowerCase().trim();
        if (!q) { window.advRenderProviders(window._advProvsCache); return; }
        const filtered = window._advProvsCache.filter(p =>
            (p.name || '').toLowerCase().includes(q) ||
            (p.nif || '').toLowerCase().includes(q) ||
            (p.email || '').toLowerCase().includes(q) ||
            (p.category || '').toLowerCase().includes(q) ||
            (p.phone || '').includes(q)
        );
        window.advRenderProviders(filtered);
    };
    
    window.advRenderProviders = function(provs) {
        const container = document.getElementById('adv-providers-content');
        const countEl = document.getElementById('adv-prov-count');
        if (!container) return;
        if (countEl) countEl.textContent = provs.length + ' proveedores';
        
        if (provs.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:40px; color:#888;">No hay proveedores. Usa el formulario de arriba para crear uno.</div>';
            return;
        }
        
        let html = '<table style="width:100%; border-collapse:collapse; font-size:0.8rem;"><thead><tr style="background:#2d2d30; color:#9cdcfe; font-size:0.7rem;">';
        html += '<th style="padding:8px 6px; text-align:left;">Nombre</th>';
        html += '<th style="padding:8px 6px; text-align:left;">NIF</th>';
        html += '<th style="padding:8px 6px; text-align:left;">Categoría</th>';
        html += '<th style="padding:8px 6px; text-align:left;">Teléfono</th>';
        html += '<th style="padding:8px 6px; text-align:left;">Email</th>';
        html += '<th style="padding:8px 6px; text-align:center;">Acciones</th>';
        html += '</tr></thead><tbody>';
        
        provs.forEach(p => {
            html += '<tr style="border-bottom:1px solid #2d2d30;">';
            html += '<td style="padding:6px; color:#fff; font-weight:600;">' + (p.name || '-') + '</td>';
            html += '<td style="padding:6px; color:#ccc;">' + (p.nif || '-') + '</td>';
            html += '<td style="padding:6px; color:#FFB74D;">' + (p.category || '-') + '</td>';
            html += '<td style="padding:6px; color:#888;">' + (p.phone || '-') + '</td>';
            html += '<td style="padding:6px; color:#888;">' + (p.email || '-') + '</td>';
            html += '<td style="padding:6px; text-align:center;">';
            html += '<button onclick="window.advEditProvider(\'' + p.id + '\')" style="background:#007acc; border:none; color:#fff; padding:3px 8px; font-size:0.7rem; cursor:pointer; border-radius:3px; margin-right:4px;">✏️ Editar</button>';
            html += '<button onclick="window.advDeleteProvider(\'' + p.id + '\')" style="background:transparent; border:1px solid #f44; color:#f44; padding:3px 8px; font-size:0.7rem; cursor:pointer; border-radius:3px;">🗑️</button>';
            html += '</td></tr>';
        });
        html += '</tbody></table>';
        container.innerHTML = html;
    };
    
    window.advSaveProvider = async function() {
        const name = document.getElementById('prov-name').value.trim();
        if (!name) { alert('Introduce el nombre del proveedor.'); return; }
        
        const data = {
            name: name,
            nif: document.getElementById('prov-nif').value.trim().toUpperCase(),
            category: document.getElementById('prov-category').value,
            address: document.getElementById('prov-address').value.trim(),
            phone: document.getElementById('prov-phone').value.trim(),
            email: document.getElementById('prov-email').value.trim(),
            iban: document.getElementById('prov-iban').value.trim().toUpperCase(),
            notes: document.getElementById('prov-notes').value.trim(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        const editId = document.getElementById('prov-edit-id').value;
        try {
            if (editId) {
                await db.collection('providers').doc(editId).update(data);
                alert('✅ Proveedor actualizado.');
            } else {
                data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                await db.collection('providers').add(data);
                alert('✅ Proveedor creado.');
            }
            window.advResetProvForm();
            window.advLoadProviders();
        } catch(e) {
            alert('Error: ' + e.message);
        }
    };
    
    window.advEditProvider = function(provId) {
        const prov = window._advProvsCache.find(p => p.id === provId);
        if (!prov) return;
        document.getElementById('prov-edit-id').value = prov.id;
        document.getElementById('prov-name').value = prov.name || '';
        document.getElementById('prov-nif').value = prov.nif || '';
        document.getElementById('prov-category').value = prov.category || '';
        document.getElementById('prov-address').value = prov.address || '';
        document.getElementById('prov-phone').value = prov.phone || '';
        document.getElementById('prov-email').value = prov.email || '';
        document.getElementById('prov-iban').value = prov.iban || '';
        document.getElementById('prov-notes').value = prov.notes || '';
        document.getElementById('prov-form-title').textContent = '✏️ EDITANDO: ' + prov.name;
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    
    window.advDeleteProvider = async function(provId) {
        if (!confirm('¿Eliminar este proveedor?')) return;
        try {
            await db.collection('providers').doc(provId).delete();
            alert('✅ Proveedor eliminado.');
            window.advLoadProviders();
        } catch(e) { alert('Error: ' + e.message); }
    };

    // =============================================
    // EMBEDDED CLIENT MODAL (within Facturación PRO)
    // =============================================
    const clientModal = document.createElement('div');
    clientModal.id = 'adv-client-modal';
    clientModal.style.cssText = 'display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); z-index:100000; justify-content:center; align-items:flex-start; overflow-y:auto; padding:30px;';
    clientModal.innerHTML = `
        <div style="background:#1e1e2e; border:1px solid #3c3c3c; border-radius:12px; padding:25px; width:100%; max-width:850px; margin-top:20px;">
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #3c3c3c; padding-bottom:12px; margin-bottom:20px;">
                <h2 id="adv-client-modal-title" style="margin:0; color:#FF9800; font-size:1.2rem;">➕ Nuevo Cliente</h2>
                <button onclick="document.getElementById('adv-client-modal').style.display='none';" style="background:transparent; border:none; color:#888; font-size:1.5rem; cursor:pointer;">✕</button>
            </div>
            <input type="hidden" id="adv-cm-uid" value="">
            <!-- Row 1: ID, Nombre, NIF -->
            <div style="display:grid; grid-template-columns:100px 1fr 1fr; gap:10px; margin-bottom:12px;">
                <div><label style="color:#888; font-size:0.65rem; display:block; margin-bottom:3px;">Nº CLIENTE</label>
                <input type="number" id="adv-cm-idnum" style="background:#2d2d30; border:1px solid #555; color:#fff; padding:8px; width:100%; box-sizing:border-box; border-radius:4px; font-size:0.85rem;"></div>
                <div><label style="color:#888; font-size:0.65rem; display:block; margin-bottom:3px;">RAZÓN SOCIAL / EMPRESA *</label>
                <input type="text" id="adv-cm-name" style="background:#2d2d30; border:1px solid #555; color:#fff; padding:8px; width:100%; box-sizing:border-box; border-radius:4px; font-size:0.85rem;"></div>
                <div><label style="color:#888; font-size:0.65rem; display:block; margin-bottom:3px;">CIF / NIF</label>
                <input type="text" id="adv-cm-nif" style="background:#2d2d30; border:1px solid #555; color:#fff; padding:8px; width:100%; box-sizing:border-box; border-radius:4px; font-size:0.85rem; text-transform:uppercase;"></div>
            </div>
            <!-- Row 2: Email, Password -->
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:12px;">
                <div><label style="color:#888; font-size:0.65rem; display:block; margin-bottom:3px;">EMAIL</label>
                <input type="email" id="adv-cm-email" style="background:#2d2d30; border:1px solid #555; color:#fff; padding:8px; width:100%; box-sizing:border-box; border-radius:4px; font-size:0.85rem;"></div>
                <div><label style="color:#888; font-size:0.65rem; display:block; margin-bottom:3px;">CLAVE ACCESO</label>
                <input type="text" id="adv-cm-password" style="background:#2d2d30; border:1px solid #555; color:#fff; padding:8px; width:100%; box-sizing:border-box; border-radius:4px; font-size:0.85rem;"></div>
            </div>
            <!-- Row 3: Tarifa, IBAN, Filial -->
            <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; margin-bottom:12px;">
                <div><label style="color:#888; font-size:0.65rem; display:block; margin-bottom:3px;">TARIFA GLOBAL</label>
                <input type="text" id="adv-cm-tariff" placeholder="Ej: 50" style="background:#2d2d30; border:1px solid #555; color:#fff; padding:8px; width:100%; box-sizing:border-box; border-radius:4px; font-size:0.85rem;"></div>
                <div><label style="color:#888; font-size:0.65rem; display:block; margin-bottom:3px;">IBAN BANCARIO</label>
                <input type="text" id="adv-cm-iban" placeholder="ES00 0000 0000 0000 0000" style="background:#2d2d30; border:1px solid #555; color:#fff; padding:8px; width:100%; box-sizing:border-box; border-radius:4px; font-size:0.85rem; text-transform:uppercase;"></div>
                <div><label style="color:#888; font-size:0.65rem; display:block; margin-bottom:3px;">FILIAL FACTURADORA</label>
                <select id="adv-cm-billing-company" style="background:#2d2d30; border:1px solid #555; color:#fff; padding:8px; width:100%; box-sizing:border-box; border-radius:4px; font-size:0.85rem;">
                    <option value="">-- Central (por defecto) --</option>
                </select></div>
            </div>
            <!-- Row 4: SEPA -->
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:12px;">
                <div><label style="color:#888; font-size:0.65rem; display:block; margin-bottom:3px;">REFERENCIA SEPA</label>
                <input type="text" id="adv-cm-sepa-ref" style="background:#2d2d30; border:1px solid #555; color:#fff; padding:8px; width:100%; box-sizing:border-box; border-radius:4px; font-size:0.85rem;"></div>
                <div><label style="color:#888; font-size:0.65rem; display:block; margin-bottom:3px;">FECHA MANDATO SEPA</label>
                <input type="date" id="adv-cm-sepa-date" style="background:#2d2d30; border:1px solid #555; color:#fff; padding:8px; width:100%; box-sizing:border-box; border-radius:4px; font-size:0.85rem;"></div>
            </div>
            <!-- Address header -->
            <div style="color:#FF9800; font-size:0.75rem; font-weight:bold; margin:15px 0 10px; border-top:1px solid #3c3c3c; padding-top:12px;">📍 DIRECCIÓN PRINCIPAL</div>
            <!-- Row 5: Calle, Num, CP -->
            <div style="display:grid; grid-template-columns:2fr 80px 100px; gap:10px; margin-bottom:12px;">
                <div><label style="color:#888; font-size:0.65rem; display:block; margin-bottom:3px;">CALLE / VÍA</label>
                <input type="text" id="adv-cm-street" style="background:#2d2d30; border:1px solid #555; color:#fff; padding:8px; width:100%; box-sizing:border-box; border-radius:4px; font-size:0.85rem;"></div>
                <div><label style="color:#888; font-size:0.65rem; display:block; margin-bottom:3px;">Nº</label>
                <input type="text" id="adv-cm-num" style="background:#2d2d30; border:1px solid #555; color:#fff; padding:8px; width:100%; box-sizing:border-box; border-radius:4px; font-size:0.85rem;"></div>
                <div><label style="color:#888; font-size:0.65rem; display:block; margin-bottom:3px;">C.P.</label>
                <input type="text" id="adv-cm-cp" style="background:#2d2d30; border:1px solid #555; color:#fff; padding:8px; width:100%; box-sizing:border-box; border-radius:4px; font-size:0.85rem;"></div>
            </div>
            <!-- Row 6: Ciudad, Provincia, Teléfono -->
            <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; margin-bottom:15px;">
                <div><label style="color:#888; font-size:0.65rem; display:block; margin-bottom:3px;">LOCALIDAD</label>
                <input type="text" id="adv-cm-city" style="background:#2d2d30; border:1px solid #555; color:#fff; padding:8px; width:100%; box-sizing:border-box; border-radius:4px; font-size:0.85rem;"></div>
                <div><label style="color:#888; font-size:0.65rem; display:block; margin-bottom:3px;">PROVINCIA</label>
                <input type="text" id="adv-cm-province" style="background:#2d2d30; border:1px solid #555; color:#fff; padding:8px; width:100%; box-sizing:border-box; border-radius:4px; font-size:0.85rem;"></div>
                <div><label style="color:#888; font-size:0.65rem; display:block; margin-bottom:3px;">TELÉFONO</label>
                <input type="text" id="adv-cm-phone" style="background:#2d2d30; border:1px solid #555; color:#fff; padding:8px; width:100%; box-sizing:border-box; border-radius:4px; font-size:0.85rem;"></div>
            </div>
            <!-- Buttons -->
            <div style="display:flex; justify-content:flex-end; gap:10px; border-top:1px solid #3c3c3c; padding-top:15px;">
                <button onclick="document.getElementById('adv-client-modal').style.display='none';" style="background:#333; border:1px solid #555; color:#ccc; padding:8px 20px; font-size:0.85rem; cursor:pointer; border-radius:4px;">Cancelar</button>
                <button onclick="window.advSaveClientPro()" style="background:#FF9800; border:none; color:#fff; padding:8px 25px; font-size:0.85rem; cursor:pointer; border-radius:4px; font-weight:bold;">💾 Guardar Cliente</button>
            </div>
        </div>
    `;
    document.body.appendChild(clientModal);

    // Open client modal (create or edit)
    window.advOpenClientModal = function(mode, clientId) {
        const modal = document.getElementById('adv-client-modal');
        const title = document.getElementById('adv-client-modal-title');
        // Reset all fields
        ['adv-cm-uid','adv-cm-idnum','adv-cm-name','adv-cm-nif','adv-cm-email','adv-cm-password','adv-cm-tariff','adv-cm-iban','adv-cm-sepa-ref','adv-cm-sepa-date','adv-cm-street','adv-cm-num','adv-cm-cp','adv-cm-city','adv-cm-province','adv-cm-phone'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        document.getElementById('adv-cm-billing-company').value = '';

        if (mode === 'edit' && clientId) {
            title.textContent = '✏️ Editar Cliente';
            document.getElementById('adv-cm-uid').value = clientId;
            // Load data from userMap or from cache
            const data = (window.userMap && window.userMap[clientId]) ? window.userMap[clientId] : null;
            const cached = window._advClientsCache ? window._advClientsCache.find(c => c.id === clientId) : null;
            const d = data || cached || {};
            document.getElementById('adv-cm-idnum').value = d.idNum || '';
            document.getElementById('adv-cm-name').value = d.name || '';
            document.getElementById('adv-cm-nif').value = d.nif || '';
            document.getElementById('adv-cm-email').value = d.email || '';
            document.getElementById('adv-cm-password').value = d.password || '';
            document.getElementById('adv-cm-tariff').value = d.tariffId || '';
            document.getElementById('adv-cm-iban').value = d.iban || '';
            document.getElementById('adv-cm-billing-company').value = d.billingCompanyId || '';
            document.getElementById('adv-cm-sepa-ref').value = d.sepaRef || '';
            document.getElementById('adv-cm-sepa-date').value = d.sepaDate || '';
            document.getElementById('adv-cm-street').value = d.street || '';
            document.getElementById('adv-cm-num').value = d.number || '';
            document.getElementById('adv-cm-cp').value = d.cp || '';
            document.getElementById('adv-cm-city').value = d.localidad || '';
            document.getElementById('adv-cm-province').value = d.province || '';
            document.getElementById('adv-cm-phone').value = d.senderPhone || d.phone || '';
        } else {
            title.textContent = '➕ Nuevo Cliente';
            // Auto-generate next ID
            if (typeof window.getNextUserId === 'function') {
                document.getElementById('adv-cm-idnum').value = window.getNextUserId();
            }
        }
        modal.style.display = 'flex';
    };

    // Save client from embedded modal
    window.advSaveClientPro = async function() {
        const name = document.getElementById('adv-cm-name').value.trim();
        const email = document.getElementById('adv-cm-email').value.trim().toLowerCase();
        const password = document.getElementById('adv-cm-password').value.trim();
        if (!name) { alert('El nombre es obligatorio.'); return; }
        if (!email) { alert('El email es obligatorio.'); return; }
        if (!password && !document.getElementById('adv-cm-uid').value) { alert('La clave es obligatoria para clientes nuevos.'); return; }

        const userData = {
            idNum: document.getElementById('adv-cm-idnum').value.trim(),
            name: name,
            nif: document.getElementById('adv-cm-nif').value.trim().toUpperCase(),
            email: email,
            password: password,
            tariffId: document.getElementById('adv-cm-tariff').value.trim(),
            iban: document.getElementById('adv-cm-iban').value.trim().toUpperCase(),
            billingCompanyId: document.getElementById('adv-cm-billing-company').value,
            sepaRef: document.getElementById('adv-cm-sepa-ref').value.trim(),
            sepaDate: document.getElementById('adv-cm-sepa-date').value,
            street: document.getElementById('adv-cm-street').value.trim(),
            number: document.getElementById('adv-cm-num').value.trim(),
            cp: document.getElementById('adv-cm-cp').value.trim(),
            localidad: document.getElementById('adv-cm-city').value.trim(),
            province: document.getElementById('adv-cm-province').value.trim(),
            senderPhone: document.getElementById('adv-cm-phone').value.trim(),
            role: 'client'
        };

        const editId = document.getElementById('adv-cm-uid').value;
        try {
            if (editId) {
                await db.collection('users').doc(editId).update(userData);
                if (window.userMap) window.userMap[editId] = { ...window.userMap[editId], ...userData };
                alert('✅ Cliente actualizado.');
            } else {
                // Create via Firebase Auth + Firestore
                if (typeof firebase !== 'undefined' && firebase.auth) {
                    try {
                        const currentUser = firebase.auth().currentUser;
                        const cred = await firebase.auth().createUserWithEmailAndPassword(email, password);
                        const newUid = cred.user.uid;
                        userData.authUid = newUid;
                        await db.collection('users').doc(newUid).set(userData);
                        if (window.userMap) window.userMap[newUid] = userData;
                        // Re-login as admin
                        if (currentUser && currentUser.email) {
                            // The admin re-auth logic is already handled by the existing system
                        }
                        alert('✅ Cliente creado (ID: ' + userData.idNum + ').');
                    } catch(authErr) {
                        // If auth fails, save just to Firestore
                        const docRef = await db.collection('users').add(userData);
                        if (window.userMap) window.userMap[docRef.id] = userData;
                        alert('✅ Cliente creado (sin autenticación): ' + authErr.message);
                    }
                } else {
                    const docRef = await db.collection('users').add(userData);
                    if (window.userMap) window.userMap[docRef.id] = userData;
                    alert('✅ Cliente creado.');
                }
            }
            document.getElementById('adv-client-modal').style.display = 'none';
            // Reload clients if in that workspace
            if (typeof window.advLoadClients === 'function') window.advLoadClients();
            if (typeof window.loadUsers === 'function') window.loadUsers();
        } catch(e) {
            alert('Error: ' + e.message);
        }
    };

    // Override advEditClient to use the new embedded modal
    window.advEditClient = function(clientId) {
        window.advOpenClientModal('edit', clientId);
    };

    // =============================================
    // MANUAL TICKETS WORKSPACE
    // =============================================
    const manualWS = document.createElement('div');
    manualWS.id = 'adv-manual-tickets-workspace';
    manualWS.style.cssText = 'display:none; flex-direction:column; flex:1; overflow-y:auto; padding:20px; background:#1e1e1e; color:#d4d4d4;';
    manualWS.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #3c3c3c; padding-bottom:15px; margin-bottom:15px;">
            <div>
                <h1 style="color:#fff; margin:0; font-size:1.2rem;">📝 Albaranes Manuales · Facturación PRO</h1>
                <p style="color:#aaa; font-size:0.8rem; margin-top:5px;">Gestionar y crear albaranes para el cliente seleccionado sin salir del workspace.</p>
            </div>
            <div style="display:flex; gap:8px;">
                <button onclick="window.advManualCreateTicket()" style="background:#FF9800; border:none; color:#fff; padding:6px 14px; font-size:0.8rem; cursor:pointer; border-radius:4px; font-weight:bold;">➕ Nuevo Albarán</button>
                <button onclick="if(typeof window.toggleAdvWorkspace==='function') window.toggleAdvWorkspace('main');" style="background:#333; border:1px solid #555; color:#ccc; padding:6px 14px; font-size:0.8rem; cursor:pointer; border-radius:4px;">◀ Volver</button>
            </div>
        </div>
        <div style="margin-bottom:15px; display:flex; gap:10px; align-items:center;">
            <select id="adv-manual-client-select" onchange="window.advLoadManualTickets(this.value)" style="flex:1; background:#2d2d30; border:1px solid #3c3c3c; color:#fff; padding:10px; font-size:0.85rem; border-radius:6px; outline:none;">
                <option value="">— Seleccionar Cliente —</option>
            </select>
            <span id="adv-manual-ticket-count" style="color:#888; font-size:0.75rem; white-space:nowrap;"></span>
        </div>
        <div id="adv-manual-tickets-content" style="flex:1; overflow-y:auto;"></div>
    `;
    billView.appendChild(manualWS);

    // Load clients into the manual tickets selector
    window.advInitManualTickets = async function() {
        const select = document.getElementById('adv-manual-client-select');
        if (!select) return;
        select.innerHTML = '<option value="">— Seleccionar Cliente —</option>';
        try {
            if (window.userMap && Object.keys(window.userMap).length > 0) {
                Object.keys(window.userMap).sort((a,b) => (window.userMap[a].name||'').localeCompare(window.userMap[b].name||'')).forEach(uid => {
                    const u = window.userMap[uid];
                    const opt = document.createElement('option');
                    opt.value = uid;
                    opt.textContent = (u.idNum || '') + ' — ' + (u.name || uid);
                    select.appendChild(opt);
                });
            } else {
                const snap = await db.collection('users').orderBy('name','asc').limit(500).get();
                snap.forEach(doc => {
                    const d = doc.data();
                    const opt = document.createElement('option');
                    opt.value = doc.id;
                    opt.textContent = (d.idNum || '') + ' — ' + (d.name || doc.id);
                    select.appendChild(opt);
                });
            }
        } catch(e) { console.error(e); }
    };

    window.advLoadManualTickets = async function(clientUid) {
        const container = document.getElementById('adv-manual-tickets-content');
        const countEl = document.getElementById('adv-manual-ticket-count');
        if (!container) return;
        if (!clientUid) { container.innerHTML = '<div style="text-align:center; padding:40px; color:#888;">Selecciona un cliente para ver sus albaranes.</div>'; if(countEl) countEl.textContent=''; return; }
        container.innerHTML = '<div style="text-align:center; padding:40px; color:#888;">Cargando...</div>';
        try {
            const client = window.userMap ? window.userMap[clientUid] : null;
            const idNum = client ? String(client.idNum || '') : '';
            let q = db.collection('tickets');
            if (idNum) q = q.where('clientIdNum', '==', idNum);
            else q = q.where('uid', '==', clientUid);
            const snap = await q.orderBy('createdAt', 'desc').limit(200).get();
            const tickets = [];
            snap.forEach(doc => tickets.push({ id: doc.id, ...doc.data() }));
            if (countEl) countEl.textContent = tickets.length + ' albaranes';
            if (tickets.length === 0) { container.innerHTML = '<div style="text-align:center; padding:40px; color:#888;">No hay albaranes para este cliente.</div>'; return; }

            let html = '<div style="overflow-y:auto; max-height:calc(100vh - 300px);"><table style="width:100%; border-collapse:collapse; font-size:0.8rem;"><thead style="position:sticky;top:0;z-index:1;"><tr style="background:#2d2d30; color:#9cdcfe; font-size:0.7rem;">';
            html += '<th style="padding:8px 6px; text-align:left;">Albarán</th>';
            html += '<th style="padding:8px 6px; text-align:left;">Fecha</th>';
            html += '<th style="padding:8px 6px; text-align:left;">Destinatario</th>';
            html += '<th style="padding:8px 6px; text-align:center;">Bultos</th>';
            html += '<th style="padding:8px 6px; text-align:center;">Estado</th>';
            html += '<th style="padding:8px 6px; text-align:center;">Factura</th>';
            html += '</tr></thead><tbody>';
            tickets.forEach(t => {
                const date = (t.createdAt && t.createdAt.toDate) ? t.createdAt.toDate().toLocaleDateString() : '-';
                const pkgs = t.packagesList ? t.packagesList.reduce((s,p) => s + (parseInt(p.qty)||1), 0) : (t.packages||1);
                const invoiced = (t.invoiceId && t.invoiceId !== 'null') ? '<span style="color:#4CAF50;">✅ ' + t.invoiceId + '</span>' : '<span style="color:#FFD700;">⏳ Pendiente</span>';
                const status = t.status || 'creado';
                html += '<tr style="border-bottom:1px solid #2d2d30;" onmouseover="this.style.background=\'rgba(255,255,255,0.03)\'" onmouseout="this.style.background=\'transparent\'">';
                html += '<td style="padding:6px; color:#fff; font-weight:bold;">' + (t.id || t.ticketId || '-') + '</td>';
                html += '<td style="padding:6px; color:#888;">' + date + '</td>';
                html += '<td style="padding:6px; color:#ccc;">' + (t.receiver || t.receiverName || '-') + '</td>';
                html += '<td style="padding:6px; text-align:center; color:#FFD700;">' + pkgs + '</td>';
                html += '<td style="padding:6px; text-align:center; color:#9cdcfe;">' + status + '</td>';
                html += '<td style="padding:6px; text-align:center;">' + invoiced + '</td>';
                html += '</tr>';
            });
            html += '</tbody></table></div>';
            container.innerHTML = html;
        } catch(e) { container.innerHTML = '<div style="color:#f44; padding:20px;">Error: ' + e.message + '</div>'; }
    };

    window.advManualCreateTicket = function() {
        // Open the old manual ticket creation but seamlessly
        if (typeof window.showView === 'function') {
            window.showView('admin-tickets');
            document.getElementById('view-adv-billing').style.display = 'none';
        }
    };

    // =============================================
    // SCANNER WORKSPACE
    // =============================================
    const scanWS = document.createElement('div');
    scanWS.id = 'adv-scanner-workspace';
    scanWS.style.cssText = 'display:none; flex-direction:column; flex:1; overflow-y:auto; padding:20px; background:#1e1e1e; color:#d4d4d4;';
    scanWS.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #3c3c3c; padding-bottom:15px; margin-bottom:15px;">
            <div>
                <h1 style="color:#fff; margin:0; font-size:1.2rem;">📷 Escáner de Albaranes · Facturación PRO</h1>
                <p style="color:#aaa; font-size:0.8rem; margin-top:5px;">Escanea QR de albaranes para verificar estado y registrar entregas.</p>
            </div>
            <div style="display:flex; gap:8px;">
                <button onclick="window.advStopScanner()" style="background:#333; border:1px solid #555; color:#ccc; padding:6px 14px; font-size:0.8rem; cursor:pointer; border-radius:4px;">⏹ Parar Cámara</button>
                <button onclick="if(typeof window.toggleAdvWorkspace==='function') window.toggleAdvWorkspace('main');" style="background:#333; border:1px solid #555; color:#ccc; padding:6px 14px; font-size:0.8rem; cursor:pointer; border-radius:4px;">◀ Volver</button>
            </div>
        </div>
        <div style="max-width:500px; margin:0 auto; text-align:center;">
            <div id="adv-qr-reader" style="width:100%; min-height:280px; border-radius:12px; overflow:hidden; border:2px solid #FF9800; background:#000; margin-bottom:15px;"></div>
            <div id="adv-scan-result" style="display:none; text-align:left; padding:15px; background:#252526; border:1px solid #3c3c3c; border-radius:10px; margin-top:10px;">
                <div style="font-weight:bold; color:#FF9800; margin-bottom:8px;">📋 Resultado del Escaneo</div>
                <div id="adv-scan-details" style="font-size:0.85rem;"></div>
            </div>
            <div id="adv-scan-log" style="margin-top:15px; max-height:150px; overflow-y:auto; font-size:0.75rem; color:#888; text-align:left;"></div>
        </div>
    `;
    billView.appendChild(scanWS);

    window._advQrScanner = null;
    window.advStartScanner = function() {
        const readerEl = document.getElementById('adv-qr-reader');
        if (!readerEl || !window.Html5Qrcode) {
            alert('El módulo de escáner no está disponible. Asegúrate de que html5-qrcode está cargado.');
            return;
        }
        if (window._advQrScanner) { try { window._advQrScanner.stop(); } catch(e){} }
        window._advQrScanner = new Html5Qrcode('adv-qr-reader');
        window._advQrScanner.start(
            { facingMode: 'environment' },
            { fps: 10, qrbox: { width: 250, height: 250 } },
            (decodedText) => { window.advHandleScan(decodedText); },
            (errorMessage) => {}
        ).catch(err => {
            document.getElementById('adv-qr-reader').innerHTML = '<div style="padding:40px; color:#f44;">Error al iniciar cámara: ' + err + '</div>';
        });
    };

    window.advStopScanner = function() {
        if (window._advQrScanner) {
            try { window._advQrScanner.stop(); } catch(e){}
            window._advQrScanner = null;
        }
    };

    window.advHandleScan = async function(text) {
        window.advStopScanner(); // Stop after successful scan
        const resultDiv = document.getElementById('adv-scan-result');
        const detailsDiv = document.getElementById('adv-scan-details');
        const logDiv = document.getElementById('adv-scan-log');
        resultDiv.style.display = 'block';
        detailsDiv.innerHTML = '<div style="color:#888;">Buscando albarán: ' + text + '...</div>';

        // Log the scan
        const logEntry = document.createElement('div');
        logEntry.textContent = new Date().toLocaleTimeString() + ' — Escaneado: ' + text;
        logDiv.prepend(logEntry);

        try {
            // Try to find the ticket
            const snap = await db.collection('tickets').where('id', '==', text).limit(1).get();
            if (snap.empty) {
                detailsDiv.innerHTML = '<div style="color:#f44;">❌ Albarán "' + text + '" no encontrado en el sistema.</div>';
                return;
            }
            const doc = snap.docs[0];
            const t = doc.data();
            const date = (t.createdAt && t.createdAt.toDate) ? t.createdAt.toDate().toLocaleDateString() : '-';
            detailsDiv.innerHTML = `
                <div style="margin-bottom:6px;"><strong style="color:#FFD700;">Albarán:</strong> ${t.id || text}</div>
                <div style="margin-bottom:6px;"><strong>Remitente:</strong> ${t.senderName || t.clientIdNum || '-'}</div>
                <div style="margin-bottom:6px;"><strong>Destinatario:</strong> ${t.receiver || t.receiverName || '-'}</div>
                <div style="margin-bottom:6px;"><strong>Fecha:</strong> ${date}</div>
                <div style="margin-bottom:6px;"><strong>Estado:</strong> <span style="color:#4CAF50;">${t.status || 'creado'}</span></div>
                <div style="margin-bottom:6px;"><strong>Factura:</strong> ${t.invoiceId || 'Sin facturar'}</div>
                <div style="margin-top:10px;">
                    <button onclick="window.advStartScanner()" style="background:#FF9800; border:none; color:#fff; padding:6px 16px; font-size:0.8rem; cursor:pointer; border-radius:4px;">📷 Escanear Otro</button>
                </div>
            `;
        } catch(e) {
            detailsDiv.innerHTML = '<div style="color:#f44;">Error: ' + e.message + '</div>';
        }
    };

    // SAFE HOOK: Observe invoice creation to auto-generate journal entries
    // This does NOT modify any existing code — it's a passive Firestore listener
    if (window.db) {
        console.log('[CONTA] Setting up invoice observer...');
        db.collection('invoices').orderBy('date', 'desc').limit(1)
            .onSnapshot(snap => {
                snap.docChanges().forEach(change => {
                    if (change.type === 'added') {
                        const data = change.doc.data();
                        // Only process recent invoices (within last 30 seconds)
                        const now = Date.now();
                        const docDate = data.date && data.date.toDate ? data.date.toDate().getTime() : 0;
                        if (now - docDate < 60000) {
                            if (typeof window.generateInvoiceJournalEntry === 'function') {
                                window.generateInvoiceJournalEntry(data, change.doc.id);
                            }
                        }
                    }
                    if (change.type === 'modified') {
                        const data = change.doc.data();
                        // If invoice just got marked as paid, generate payment entry
                        if (data.paid && data.paidDate) {
                            const paidTime = data.paidDate.toDate ? data.paidDate.toDate().getTime() : 0;
                            if (Date.now() - paidTime < 60000) {
                                if (typeof window.generatePaymentJournalEntry === 'function') {
                                    window.generatePaymentJournalEntry(data, change.doc.id);
                                }
                            }
                        }
                    }
                });
            }, err => console.warn('[CONTA] Invoice observer error:', err));
    }
})();
