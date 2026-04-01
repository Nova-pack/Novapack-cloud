// Phones Manager - Novapack ERP
// Manages driver routes and phone numbers
// Firestore: config/phones/list

(function() {
    'use strict';

    let phonesCache = [];

    window.loadPhonesManager = async () => {
        const container = document.getElementById('erp-tab-phones');
        if (!container) return;

        // Build UI if not already built
        if (!container.querySelector('#phones-mgr-table')) {
            container.innerHTML = `
                <div style="max-width:1200px; margin:0 auto; width:100%;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:25px; flex-wrap:wrap; gap:15px;">
                        <div>
                            <h2 style="margin:0; color:white; font-size:1.4rem;">
                                <span class="material-symbols-outlined" style="color:#FF9800; vertical-align:middle; margin-right:8px;">call</span>
                                Rutas y Repartidores
                            </h2>
                            <p style="color:#666; margin:5px 0 0; font-size:0.85rem;">Gestión de teléfonos y chóferes asignados a cada ruta de reparto.</p>
                        </div>
                        <div style="display:flex; gap:8px;" id="phones-toolbar">
                            <button onclick="openPhoneModal()" style="background:#FF9800; border:none; color:#fff; padding:8px 16px; font-size:0.82rem; cursor:pointer; border-radius:4px; font-weight:bold; display:flex; align-items:center; gap:5px;">
                                <span class="material-symbols-outlined" style="font-size:16px;">add</span> Nueva Ruta
                            </button>
                            <button onclick="loadPhonesManager()" style="background:#333; border:1px solid #555; color:#d4d4d4; padding:6px 16px; font-size:0.82rem; cursor:pointer; border-radius:4px; display:flex; align-items:center; gap:5px;">
                                <span class="material-symbols-outlined" style="font-size:16px;">refresh</span> Refrescar
                            </button>
                        </div>
                    </div>
                    <table id="phones-mgr-table" style="width:100%; border-collapse:collapse; font-size:0.85rem;">
                        <thead style="background:#333;">
                            <tr>
                                <th style="padding:10px; text-align:left; color:#aaa; font-weight:600;">Localidad / Ruta</th>
                                <th style="padding:10px; text-align:left; color:#aaa; font-weight:600;">Teléfono</th>
                                <th style="padding:10px; text-align:left; color:#aaa; font-weight:600;">Chóferes</th>
                                <th style="padding:10px; text-align:right; color:#aaa; font-weight:600;">Acciones</th>
                            </tr>
                        </thead>
                        <tbody id="phones-mgr-body">
                            <tr><td colspan="4" style="text-align:center; padding:30px; color:#555;">Cargando...</td></tr>
                        </tbody>
                    </table>
                </div>
            `;
        }

        const tbody = document.getElementById('phones-mgr-body');
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:#aaa;">Cargando rutas...</td></tr>';

        try {
            const snap = await db.collection('config').doc('phones').collection('list').get();
            phonesCache = [];
            snap.forEach(doc => {
                phonesCache.push({ ...doc.data(), docId: doc.id });
            });

            renderPhonesTable();

            // Add export button
            if (typeof addExportButton === 'function') {
                addExportButton('phones-toolbar', () => {
                    return phonesCache.map(p => ({
                        'Ruta': p.label || '',
                        'Teléfono': p.number || '',
                        'Chófer 1': p.driverName || '',
                        'Chófer 2': p.driverName2 || '',
                        'Chófer 3': p.driverName3 || '',
                        'Chófer 4': p.driverName4 || ''
                    }));
                }, 'rutas_telefonos');
            }
        } catch(e) {
            console.error('[Phones] Error:', e);
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:red; padding:20px;">Error: ${e.message}</td></tr>`;
        }
    };

    function renderPhonesTable() {
        const tbody = document.getElementById('phones-mgr-body');
        if (!tbody) return;

        if (phonesCache.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:30px; color:#888;">No hay rutas configuradas. Pulsa "Nueva Ruta" para crear una.</td></tr>';
            return;
        }

        let html = '';
        phonesCache.forEach(p => {
            const names = [p.driverName, p.driverName2, p.driverName3, p.driverName4].filter(n => n && n.trim());
            const namesStr = names.length > 0 ? names.join(' <span style="color:#555;">·</span> ') : '<span style="color:#666;">Sin asignar</span>';
            const docIdSafe = (p.docId || '').replace(/'/g, "\\'");

            html += `
                <tr style="border-bottom:1px solid #333; cursor:pointer; transition:background 0.2s;"
                    onmouseover="this.style.background='rgba(255,152,0,0.08)'"
                    onmouseout="this.style.background='transparent'">
                    <td style="padding:10px; font-weight:bold; color:#FF9800;">${p.label || 'Sin nombre'}</td>
                    <td style="padding:10px;">
                        <a href="tel:${p.number || ''}" style="color:#4FC3F7; text-decoration:none;">${p.number || '-'}</a>
                    </td>
                    <td style="padding:10px; color:#d4d4d4;">${namesStr}</td>
                    <td style="padding:10px; text-align:right;">
                        <div style="display:flex; gap:5px; justify-content:flex-end;">
                            <button onclick="event.stopPropagation(); openPhoneModal('${docIdSafe}')" style="background:#333; border:1px solid #555; color:#4CAF50; padding:4px 10px; font-size:0.75rem; cursor:pointer; border-radius:3px; display:flex; align-items:center; gap:3px;">
                                <span class="material-symbols-outlined" style="font-size:14px;">edit</span> Editar
                            </button>
                            <button onclick="event.stopPropagation(); deletePhoneRoute('${docIdSafe}')" style="background:#333; border:1px solid #555; color:#FF5252; padding:4px 10px; font-size:0.75rem; cursor:pointer; border-radius:3px; display:flex; align-items:center; gap:3px;">
                                <span class="material-symbols-outlined" style="font-size:14px;">delete</span>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
    }

    // ================== MODAL CREAR/EDITAR ==================

    window.openPhoneModal = (docId) => {
        let modal = document.getElementById('modal-edit-phone');
        if (modal) modal.remove();

        const existing = docId ? phonesCache.find(p => p.docId === docId) : null;
        const isEdit = !!existing;

        modal = document.createElement('div');
        modal.id = 'modal-edit-phone';
        modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); z-index:50000; display:flex; align-items:center; justify-content:center;';
        modal.innerHTML = `
            <div style="background:#1e1e1e; border:1px solid #3c3c3c; border-radius:12px; width:95%; max-width:550px; padding:25px; color:#d4d4d4; box-shadow:0 20px 60px rgba(0,0,0,0.6);">
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #3c3c3c; padding-bottom:12px; margin-bottom:20px;">
                    <h2 style="margin:0; color:#FF9800; font-size:1.2rem;">${isEdit ? '✏️ Editar Ruta' : '➕ Nueva Ruta'}</h2>
                    <button onclick="document.getElementById('modal-edit-phone').remove()" style="background:none; border:none; color:#aaa; font-size:1.5rem; cursor:pointer;">&times;</button>
                </div>

                <input type="hidden" id="phone-edit-docid" value="${docId || ''}">

                <div style="margin-bottom:15px;">
                    <label style="font-size:0.75rem; color:#888; text-transform:uppercase; letter-spacing:1px;">Localidad / Nombre de Ruta</label>
                    <input id="phone-edit-label" value="${(existing?.label || '').replace(/"/g, '&quot;')}" placeholder="Ej: Barcelona Centro" style="width:100%; background:#2d2d30; border:1px solid #3c3c3c; color:white; padding:8px; border-radius:4px; font-size:0.9rem; margin-top:4px;">
                </div>

                <div style="margin-bottom:15px;">
                    <label style="font-size:0.75rem; color:#888; text-transform:uppercase; letter-spacing:1px;">Teléfono Repartidor</label>
                    <input id="phone-edit-number" value="${(existing?.number || '').replace(/"/g, '&quot;')}" placeholder="Ej: 612345678" style="width:100%; background:#2d2d30; border:1px solid #3c3c3c; color:white; padding:8px; border-radius:4px; font-size:0.9rem; margin-top:4px;">
                </div>

                <div style="padding:12px; background:rgba(76,175,80,0.08); border:1px solid rgba(76,175,80,0.2); border-radius:8px;">
                    <div style="font-size:0.75rem; color:#4CAF50; text-transform:uppercase; letter-spacing:1px; margin-bottom:10px;">Chóferes / Turnos</div>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
                        <input id="phone-edit-d1" value="${(existing?.driverName || '').replace(/"/g, '&quot;')}" placeholder="Chófer 1" style="background:#2d2d30; border:1px solid #3c3c3c; color:white; padding:6px; border-radius:4px; font-size:0.85rem;">
                        <input id="phone-edit-d2" value="${(existing?.driverName2 || '').replace(/"/g, '&quot;')}" placeholder="Chófer 2" style="background:#2d2d30; border:1px solid #3c3c3c; color:white; padding:6px; border-radius:4px; font-size:0.85rem;">
                        <input id="phone-edit-d3" value="${(existing?.driverName3 || '').replace(/"/g, '&quot;')}" placeholder="Chófer 3" style="background:#2d2d30; border:1px solid #3c3c3c; color:white; padding:6px; border-radius:4px; font-size:0.85rem;">
                        <input id="phone-edit-d4" value="${(existing?.driverName4 || '').replace(/"/g, '&quot;')}" placeholder="Chófer 4" style="background:#2d2d30; border:1px solid #3c3c3c; color:white; padding:6px; border-radius:4px; font-size:0.85rem;">
                    </div>
                </div>

                <div style="display:flex; gap:10px; justify-content:flex-end; margin-top:20px; border-top:1px solid #3c3c3c; padding-top:15px;">
                    <button onclick="document.getElementById('modal-edit-phone').remove()" style="background:#333; border:1px solid #555; color:#ccc; padding:8px 20px; font-size:0.85rem; cursor:pointer; border-radius:4px;">Cancelar</button>
                    <button onclick="savePhoneRoute()" style="background:#FF9800; border:none; color:#fff; padding:8px 20px; font-size:0.85rem; cursor:pointer; border-radius:4px; font-weight:bold; display:flex; align-items:center; gap:5px;">
                        <span class="material-symbols-outlined" style="font-size:16px;">save</span> ${isEdit ? 'Guardar Cambios' : 'Crear Ruta'}
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    };

    window.savePhoneRoute = async () => {
        const docId = document.getElementById('phone-edit-docid').value;
        const data = {
            label: document.getElementById('phone-edit-label').value.trim(),
            number: document.getElementById('phone-edit-number').value.trim(),
            driverName: document.getElementById('phone-edit-d1').value.trim(),
            driverName2: document.getElementById('phone-edit-d2').value.trim(),
            driverName3: document.getElementById('phone-edit-d3').value.trim(),
            driverName4: document.getElementById('phone-edit-d4').value.trim(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (!data.label) { alert('El nombre de la ruta es obligatorio'); return; }

        try {
            if (docId) {
                await db.collection('config').doc('phones').collection('list').doc(docId).update(data);
            } else {
                data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                await db.collection('config').doc('phones').collection('list').add(data);
            }

            document.getElementById('modal-edit-phone').remove();
            loadPhonesManager(); // Refresh
            alert('✅ Ruta guardada correctamente');
        } catch(e) {
            alert('Error: ' + e.message);
            console.error(e);
        }
    };

    window.deletePhoneRoute = async (docId) => {
        if (!confirm('¿Eliminar esta ruta?')) return;
        try {
            await db.collection('config').doc('phones').collection('list').doc(docId).delete();
            phonesCache = phonesCache.filter(p => p.docId !== docId);
            renderPhonesTable();
        } catch(e) {
            alert('Error: ' + e.message);
        }
    };

    console.log('[Phones Manager] ✅ Módulo cargado');
})();
