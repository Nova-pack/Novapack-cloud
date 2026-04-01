
window.openTicketReassignModal = async (docId) => {
    document.getElementById('reassign-doc-id').value = docId;
    const doc = await db.collection('tickets').doc(docId).get();
    const t = doc.data();
    document.getElementById('reassign-ticket-id').textContent = t.id || docId;
    
    const select = document.getElementById('reassign-driver-select');
    select.innerHTML = '<option value="">-- Sin asignar / Eliminar ruta --</option>';
    if (window.globalRoutes && window.globalRoutes.length > 0) {
        window.globalRoutes.forEach(r => {
            const cleanPhone = r.phone.replace(/\D/g, '').replace(/^34/, '');
            const opt = document.createElement('option');
            opt.value = cleanPhone;
            opt.textContent = `${r.number ? r.number + ' - ' : ''}${r.name} (${r.label}) [${r.phone}]`;
            if (t.driverPhone && t.driverPhone === cleanPhone) {
                opt.selected = true;
            }
            select.appendChild(opt);
        });
    }
    
    document.getElementById('modal-ticket-reassign').style.display = 'flex';
};

window.saveTicketReassign = async () => {
    const docId = document.getElementById('reassign-doc-id').value;
    const driverPhone = document.getElementById('reassign-driver-select').value;
    
    showLoading();
    try {
        await db.collection('tickets').doc(docId).update({ driverPhone });
        loadAdminTicketList('first'); // refresh list
        document.getElementById('modal-ticket-reassign').style.display = 'none';
        alert('Ruta reasignada con éxito.');
    } catch(e) {
        alert('Error reasignando: ' + e.message);
    } finally {
        hideLoading();
    }
};

window.openTicketEditModal = async (docId) => {
    document.getElementById('edit-doc-id').value = docId;
    
    showLoading();
    try {
        const doc = await db.collection('tickets').doc(docId).get();
        const t = doc.data();
        
        const bultos = t.packagesList ? t.packagesList.reduce((s, p) => s + (parseInt(p.qty) || 1), 0) : (t.packages || 1);
        const peso = t.packagesList ? t.packagesList.reduce((s, p) => s + (parseFloat(p.weight) || 0), 0) : (t.weight || 0);
        
        document.getElementById('edit-t-packages').value = bultos;
        document.getElementById('edit-t-weight').value = parseFloat(peso).toFixed(2);
        document.getElementById('edit-t-cod').value = t.cod || 0;
        document.getElementById('edit-t-incident-notes').value = ''; // Clean initial, user writes why
        
        document.getElementById('modal-ticket-edit').style.display = 'flex';
    } catch(e) {
        alert('Error: ' + e.message);
    } finally {
        hideLoading();
    }
};

window.saveTicketEditWarning = async () => {
    if(!confirm("⚠️ ¿Poner este albarán en Pendiente de Confirmación bloqueando el portal del cliente?")) return;
    const docId = document.getElementById('edit-doc-id').value;
    
    const pkgsStr = parseInt(document.getElementById('edit-t-packages').value) || 1;
    const weightNum = parseFloat(document.getElementById('edit-t-weight').value) || 0;
    const codNum = parseFloat(document.getElementById('edit-t-cod').value) || 0;
    const incidentNotes = document.getElementById('edit-t-incident-notes').value.trim();
    
    showLoading();
    try {
        const doc = await db.collection('tickets').doc(docId).get();
        const t = doc.data();
        
        // Build new packages list retaining previous sizes if possible, else condensing into ONE generic block with total peso
        const newPkgs = [{ qty: pkgsStr, weight: weightNum, size: 'Bulto Modificado' }];
        
        // Evaluate new price based on new parameters
        // We reuse the central price calculation with mock object
        const mockTicket = { ...t, packagesList: newPkgs, packages: pkgsStr, weight: weightNum, cod: codNum };
        const newPrice = calculateTicketPrice(mockTicket, t.uid || adminTicketUID);
        
        const updates = {
            status: "pending_confirmation",
            pendingChangesText: incidentNotes || "El albarán ha sido modificado por la central (Diferencia de peso o de reembolso descubierta).",
            pendingChanges: {
                packagesList: newPkgs,
                packages: pkgsStr,
                weight: weightNum,
                cod: codNum,
                price: newPrice
            }
        };
        
        await db.collection('tickets').doc(docId).update(updates);
        loadAdminTicketList('first');
        document.getElementById('modal-ticket-edit').style.display = 'none';
        alert("Albarán paralizado y notificado al cliente exitosamente.");
    } catch (e) {
        alert("Error: " + e.message);
    } finally {
        hideLoading();
    }
};

// --- TEMPORARY: GESCO Client Import ---
window.importGESCOClients = async () => {
    if (!confirm('⚠️ IMPORTACIÓN MASIVA: Esto importará ~1142 clientes GESCO a Firestore.\n\n¿Continuar?')) return;
    showLoading();
    try {
        const resp = await fetch('/gesco_clients.json');
        const clients = await resp.json();
        console.log('Loaded', clients.length, 'clients from JSON');
        
        let imported = 0;
        let batch = db.batch();
        let batchCount = 0;
        
        for (const c of clients) {
            const parts = [];
            if (c.street) parts.push(c.street);
            if (c.localidad) parts.push(c.localidad);
            if (c.cp) parts.push('(CP ' + c.cp + ')');
            const senderAddress = parts.join(', ');
            
            const docId = 'gesco_' + c.idNum;
            const ref = db.collection('users').doc(docId);
            batch.set(ref, {
                idNum: c.idNum,
                name: c.name,
                nif: c.nif || '',
                street: c.street || '',
                localidad: c.localidad || '',
                cp: c.cp || '',
                senderAddress: senderAddress,
                senderPhone: c.senderPhone || '',
                role: 'client',
                email: '',
                importedFrom: 'GESCO',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            
            batchCount++;
            imported++;
            
            if (batchCount >= 499) {
                await batch.commit();
                console.log('Batch committed:', imported);
                batch = db.batch();
                batchCount = 0;
            }
        }
        
        if (batchCount > 0) await batch.commit();
        
        hideLoading();
        alert('✅ IMPORTACIÓN COMPLETADA\n\nClientes importados: ' + imported + '\n\nRecargue la página para verlos en la lista.');
        console.log('GESCO import done:', imported, 'clients');
    } catch(e) {
        hideLoading();
        alert('❌ Error en importación: ' + e.message);
        console.error(e);
    }
};

// --- TEMPORARY: GESCO Articles Import ---
window.importGESCOArticles = async () => {
    console.log('🚀 Iniciando importación artículos GESCO...');
    showLoading();
    try {
        const resp = await fetch('/gesco_articles.json');
        const articles = await resp.json();
        console.log('Loaded', articles.length, 'articles');
        
        let imported = 0;
        let batch = db.batch();
        let batchCount = 0;
        
        for (const a of articles) {
            const docId = 'art_' + (a.code || 'nocode_' + imported).replace(/[\/\.#\$\[\]]/g, '_');
            const ref = db.collection('articles').doc(docId);
            batch.set(ref, {
                name: a.name,
                description: a.code || '',
                price: a.price || 0,
                weight: 0,
                category: a.category || '',
                importedFrom: 'GESCO',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            
            batchCount++;
            imported++;
            
            if (batchCount >= 499) {
                await batch.commit();
                console.log('Batch committed:', imported);
                batch = db.batch();
                batchCount = 0;
            }
        }
        
        if (batchCount > 0) await batch.commit();
        
        hideLoading();
        console.log('✅ IMPORTACIÓN COMPLETADA — Artículos importados:', imported);
        console.log('GESCO articles import done:', imported);
    } catch(e) {
        hideLoading();
        console.log('❌ Error:', e.message);
        console.error(e);
    }
};

// --- TEMPORARY: Tarifas50 Import ---
window.importTarifas50 = async () => {
    console.log('🚀 Iniciando importación TARIFAS50 a tarifa global 50...');
    showLoading();
    try {
        const resp = await fetch('/gesco_tarifas50.json');
        const rawItems = await resp.json();
        console.log('Loaded', rawItems.length, 'tariff items from JSON');
        
        // Build items map: { "BULTO": 14, "BULTO ANTEQUERA-MALAGA": 12, ... }
        const itemsMap = {};
        rawItems.forEach(item => {
            itemsMap[item.name] = item.price || 0;
        });
        
        // Save as single document tariffs/GLOBAL_50 with items map
        await db.collection('tariffs').doc('GLOBAL_50').set({
            items: itemsMap,
            subTariff: {},
            importedFrom: 'GESCO',
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        hideLoading();
        console.log('✅ IMPORTACIÓN COMPLETADA — Tarifa Global 50 — Artículos:', Object.keys(itemsMap).length);
    } catch(e) {
        hideLoading();
        console.error('❌ Error:', e.message, e);
    }
};
