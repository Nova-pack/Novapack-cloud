// Modulo de Facturación Avanzada (Factucont Style)
// Este script asume que `admin.html` ya ha cargado firebase, variables globales (userMap, etc)

let advCurrentClient = null;
let advCurrentInvoiceId = null; // Track loaded or just-saved invoice
let advUnbilledTicketsCache = [];
let advGridRows = []; 
// Row structure: { id, description, qty, price, discount, iva, total, ticketId }

document.addEventListener("DOMContentLoaded", () => {
    // Populate client picker when switching to view
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.target.id === 'view-adv-billing' && mutation.target.style.display !== 'none') {
                advPopulateClientPicker();
                if(typeof window.advPopulateCompanyPicker === 'function') window.advPopulateCompanyPicker();
            }
        });
    });
    
    const targetNode = document.getElementById('view-adv-billing');
    if(targetNode) observer.observe(targetNode, { attributes: true, attributeFilter: ['style'] });
});

window.advPopulateClientPicker = async () => {
    const select = document.getElementById('adv-client-picker');
    if(!select) return;
    try {
        if (!window.userMap || Object.keys(window.userMap).length < 2) {
            if (typeof window.loadUsers === 'function') {
                select.innerHTML = '<option value="">Cargando clientes de la nube...</option>';
                await window.loadUsers('first');
            } else {
                throw new Error("window.loadUsers is missing");
            }
        }

        const currentValue = select.value;
        const uniqueEntries = [];
        const seenIds = new Set();
        Object.entries(window.userMap || {}).forEach(([uid, u]) => {
            if(u && u.role === 'admin') return; // Hide admins to keep list clean
            const actualId = u.id || uid;
            if (!actualId || seenIds.has(actualId)) return;
            seenIds.add(actualId);
            uniqueEntries.push({ ...u, id: actualId });
        });

        if (uniqueEntries.length === 0) {
            select.innerHTML = `<option value="">0 ENCONTRADOS (userMap: ${Object.keys(window.userMap||{}).length})</option>`;
            return;
        }

        select.innerHTML = '<option value="">-- Cargar Cliente --</option>';
        uniqueEntries.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        uniqueEntries.forEach(u => {
            const opt = document.createElement('option');
            opt.value = u.id;
            opt.textContent = `[#${u.idNum || '?'}] ${u.name || 'Sin Nombre'}`;
            select.appendChild(opt);
        });
        
        if (currentValue) select.value = currentValue;
    } catch(err) {
        select.innerHTML = '<option value="">ERROR: ' + err.message + '</option>';
    }
}

window.advPopulateCompanyPicker = async () => {
    const picker = document.getElementById('adv-company-picker');
    if(!picker) return;
    try {
        const snap = await db.collection('billing_companies').get();
        if(snap.empty) return;
        let html = '<option value="main">Sede Principal (NOVAPACK)</option>';
        window.advCompaniesMap = {};
        snap.forEach(doc => {
             const data = doc.data();
             window.advCompaniesMap[doc.id] = data;
             html += `<option value="${doc.id}">${data.name}</option>`;
        });
        picker.innerHTML = html;
        const currentCompany = window.advCurrentCompany || 'main';
        picker.value = currentCompany;
    } catch(e) { console.error("Error loading adv companies:", e); }
};

window.advLoadClientDetails = async (uid) => {
    if (!uid) {
        advCurrentClient = null;
        advGridRows = [];
        advRenderGrid();
        return;
    }
    advCurrentClient = window.userMap[uid];
    
    // Auto-generate invoice number placeholder — Format: FAC-YY-SEQ
    try {
        const currentYY = String(new Date().getFullYear()).slice(-2);
        const yearStart = new Date(new Date().getFullYear(), 0, 1);
        const yearEnd = new Date(new Date().getFullYear() + 1, 0, 1);
        const invSnap = await db.collection('invoices')
            .where('date', '>=', yearStart)
            .where('date', '<', yearEnd)
            .orderBy('date', 'desc')
            .get();
        let nextNum = 0;
        invSnap.forEach(doc => {
            const iid = doc.data().invoiceId || '';
            const match = iid.match(/^FAC-\d{2}-(\d+)$/);
            if (match) {
                const seq = parseInt(match[1], 10);
                if (!isNaN(seq) && seq >= nextNum) nextNum = seq + 1;
            }
        });
        document.getElementById('adv-inv-number').value = `FAC-${currentYY}-${nextNum} (BORRADOR)`;
        document.getElementById('adv-inv-date').value = new Date().toISOString().split('T')[0];
    } catch(e) { console.error("Error auto-num:", e); }
    
    advGridRows = []; // Clear grid on new client
    advRenderGrid();
    
    // UI: Update Client Card
    const card = document.getElementById('adv-client-card');
    if(card) {
        if(!uid) {
            card.innerHTML = 'Seleccione un cliente para ver sus datos fiscales.';
            card.style.background = 'rgba(0,0,0,0.2)';
            card.style.borderColor = '#555';
            card.style.color = '#888';
        } else {
            const u = window.userMap[uid];
            card.innerHTML = `
                <div style="flex:1;">
                    <strong style="color:#FFF; font-size:0.9rem;">${u.name || 'Sin Nombre'}</strong><br>
                    <span style="font-size:0.8rem; color:#aaa;">CIF: ${u.idNum || 'N/A'}</span>
                </div>
                <div style="text-align:right; font-size:0.75rem; color:#ccc;">
                    ${u.address || 'Sin dirección registrada'}
                </div>
            `;
            card.style.background = 'rgba(76, 175, 80, 0.1)';
            card.style.borderColor = '#4CAF50';
            card.style.color = '#d4d4d4';
        }
    }
};

window.advOpenTicketImportModal = async () => {
    if (!advCurrentClient) {
        alert("Por favor, seleccione un cliente primero.");
        return;
    }
    
    document.getElementById('modal-adv-import-tickets').style.display = 'flex';
    const tbody = document.getElementById('adv-import-tickets-body');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Buscando albaranes pendientes en la nube...</td></tr>';
    
    try {
        const idNumStr = String(advCurrentClient.idNum || '').trim();
        const authUid = advCurrentClient.authUid || advCurrentClient.id;
        
        // Exact same query strategy as original system
        let query = db.collection('tickets');
        if (idNumStr) {
            query = query.where('clientIdNum', '==', idNumStr);
        } else {
            query = query.where('uid', '==', authUid);
        }
        
        const snap = await query.limit(2000).get();
        advUnbilledTicketsCache = [];
        
        snap.forEach(doc => {
            const t = doc.data();
            // Filter already billed
            if (t.invoiceId && String(t.invoiceId).trim() !== "" && String(t.invoiceId).toLowerCase() !== "null") return;
            // Cross-check owner
            const isOwner = (t.uid === authUid) || (t.clientIdNum && String(t.clientIdNum) === idNumStr);
            if (!isOwner && !idNumStr) return; 
            
            // Calc price using the window scope calculateTicketPriceSync
            let price = 0;
            if (typeof window.calculateTicketPriceSync === 'function') {
                price = window.calculateTicketPriceSync(t, advCurrentClient.id, t.compId || 'comp_main');
            }
            
            advUnbilledTicketsCache.push({
                ...t, docId: doc.id, calculatedPrice: price
            });
        });
        
        if (advUnbilledTicketsCache.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No hay albaranes pendientes para facturar.</td></tr>';
            return;
        }
        
        advRenderImportTable();
    } catch(e) {
        tbody.innerHTML = `<tr><td colspan="6" style="color:red; text-align:center;">Error: ${e.message}</td></tr>`;
    }
};

function advRenderImportTable() {
    const tbody = document.getElementById('adv-import-tickets-body');
    tbody.innerHTML = '';
    
    // Sort array by date asc
    advUnbilledTicketsCache.sort((a,b) => {
        const da = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt||0);
        const db = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt||0);
        return da - db;
    });

    advUnbilledTicketsCache.forEach((t, i) => {
        // Skip if already in grid
        if (advGridRows.find(r => r.ticketId === t.docId)) return;
        
        const date = (t.createdAt && t.createdAt.toDate) ? t.createdAt.toDate().toLocaleDateString() : 'N/A';
        const pkgs = t.packagesList ? t.packagesList.reduce((s, p) => s + (parseInt(p.qty) || 1), 0) : (t.packages||1);
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="text-align:center;"><input type="checkbox" class="adv-import-check" value="${i}" style="width:18px; height:18px;"></td>
            <td>${date}</td>
            <td style="font-weight:bold;">${t.id}</td>
            <td>${t.receiver || ''}</td>
            <td style="text-align:center;">${pkgs}</td>
            <td style="text-align:right; color:#4CAF50; font-weight:bold;">${(t.calculatedPrice||0).toFixed(2)}€</td>
        `;
        tbody.appendChild(tr);
    });
}

window.advToggleAllImportTickets = (checked) => {
    document.querySelectorAll('.adv-import-check').forEach(cb => cb.checked = checked);
};

window.advConfirmTicketImport = () => {
    const checks = document.querySelectorAll('.adv-import-check:checked');
    if(checks.length === 0) { alert("Seleccione al menos un albarán."); return; }
    
    checks.forEach(c => {
        const idx = parseInt(c.value);
        const t = advUnbilledTicketsCache[idx];
        const pkgs = t.packagesList ? t.packagesList.reduce((s, p) => s + (parseInt(p.qty) || 1), 0) : (t.packages||1);
        
        // Push into Grid Rows
        advGridRows.push({
            id: 'row_' + Date.now() + Math.random(),
            description: `Albarán ${t.id} - Destino: ${t.receiver}`,
            qty: pkgs,
            price: t.calculatedPrice || 0,
            discount: 0,
            iva: window.invCompanyData ? window.invCompanyData.iva : 21,
            ticketId: t.docId,
            rawTicketData: t
        });
    });
    
    document.getElementById('modal-adv-import-tickets').style.display = 'none';
    advRenderGrid();
};

window.advAddEmptyRow = () => {
    advGridRows.push({
        id: 'row_' + Date.now(),
        description: '',
        qty: 1,
        price: 0,
        discount: 0,
        iva: window.invCompanyData ? window.invCompanyData.iva : 21,
        ticketId: null
    });
    advRenderGrid();
};

window.advRemoveRow = (id) => {
    advGridRows = advGridRows.filter(r => r.id !== id);
    advRenderGrid();
};

window.advUpdateRow = (id, field, value) => {
    const row = advGridRows.find(r => r.id === id);
    if (!row) return;
    
    if (field === 'description') row.description = value;
    else row[field] = parseFloat(value) || 0;
    
    advCalculateTotals(); // Only calculate totals, don't re-render entire grid to not lose input focus
};

function advRenderGrid() {
    const tbody = document.getElementById('adv-grid-body');
    tbody.innerHTML = '';
    
    if (advGridRows.length === 0) {
        tbody.innerHTML = '<tr id="adv-grid-empty"><td colspan="7" style="text-align:center; color:#666; padding:30px;">Comience importando albaranes o añadiendo líneas libres.</td></tr>';
        advCalculateTotals();
        return;
    }
    
    advGridRows.forEach(r => {
        const isLocked = r.ticketId ? 'readonly style="background:#222; opacity:0.8;"' : '';
        const lockedDesc = r.ticketId ? 'readonly style="background:#222; border-color:transparent;"' : '';
        
        // Safe line total calculation
        const gross = r.qty * r.price;
        const totalLine = gross - (gross * (r.discount / 100));
        r.total = totalLine;
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input type="text" value="${r.description}" ${lockedDesc} onchange="advUpdateRow('${r.id}', 'description', this.value)"></td>
            <td><input type="number" class="num-input" value="${r.qty}" min="1" step="1" onchange="advUpdateRow('${r.id}', 'qty', this.value)" oninput="advUpdateRow('${r.id}', 'qty', this.value)"></td>
            <td><input type="number" class="num-input" value="${r.price.toFixed(2)}" step="0.01" onchange="advUpdateRow('${r.id}', 'price', this.value)" oninput="advUpdateRow('${r.id}', 'price', this.value)"></td>
            <td><input type="number" class="num-input" value="${r.discount}" min="0" max="100" step="1" onchange="advUpdateRow('${r.id}', 'discount', this.value)" oninput="advUpdateRow('${r.id}', 'discount', this.value)"></td>
            <td><input type="number" class="num-input" value="${r.iva}" step="1" onchange="advUpdateRow('${r.id}', 'iva', this.value)" oninput="advUpdateRow('${r.id}', 'iva', this.value)"></td>
            <td style="text-align:right; font-weight:bold; vertical-align:middle; padding-right:15px;" id="adv-line-total-${r.id}">${totalLine.toFixed(2)}€</td>
            <td style="text-align:center; vertical-align:middle;"><button style="background:transparent; border:none; color:#FF3B30; cursor:pointer;" onclick="advRemoveRow('${r.id}')">🗑️</button></td>
        `;
        tbody.appendChild(tr);
    });
    
    advCalculateTotals();
}

window.advCurrentCalculations = { subtotal:0, iva:0, total:0 };

function advCalculateTotals() {
    let subtotal = 0;
    let totalIva = 0;
    
    // Aggregate by row to update individual row totals visually without losing focus
    advGridRows.forEach(r => {
        const gross = r.qty * r.price;
        const lineTotal = gross - (gross * (r.discount / 100));
        r.total = lineTotal;
        const lineIva = lineTotal * (r.iva / 100);
        
        subtotal += lineTotal;
        totalIva += lineIva;
        
        const lineTotalElem = document.getElementById(`adv-line-total-${r.id}`);
        if(lineTotalElem) lineTotalElem.textContent = lineTotal.toFixed(2) + '€';
    });
    
    const irpfRate = parseFloat(document.getElementById('fiscal-irpf')?.value || 0);
    const irpf = subtotal * (irpfRate / 100);
    const total = subtotal + totalIva - irpf;
    
    document.getElementById('adv-base').textContent = subtotal.toFixed(2) + '€';
    document.getElementById('adv-iva').textContent = totalIva.toFixed(2) + '€';
    
    if (irpfRate > 0) {
        document.getElementById('adv-irpf-box').style.display = 'flex';
        document.getElementById('adv-irpf').textContent = '- ' + irpf.toFixed(2) + '€';
    } else {
        document.getElementById('adv-irpf-box').style.display = 'none';
    }
    
    document.getElementById('adv-total').textContent = total.toFixed(2) + '€';
    
    window.advCurrentCalculations = { subtotal, iva: totalIva, irpf, irpfRate, total };
}

// SAVE INVOICE LOGIC (Critical DB cross-check)
document.getElementById('btn-adv-save').onclick = async () => {
    if (!advCurrentClient) { alert("Seleccione un cliente."); return; }
    if (advGridRows.length === 0) { alert("La factura está vacía."); return; }
    if (advCurrentCalculations.total <= 0 && !confirm("El total es 0 o negativo. ¿Guardar de todos modos?")) return;
    
    if (typeof showLoading === 'function') showLoading();
    try {
        const dateStr = document.getElementById('adv-inv-date').value;
        const finalDate = dateStr ? new Date(dateStr) : new Date();
        const invYr = finalDate.getFullYear();
        const invYYSave = String(invYr).slice(-2);
        const yrStart = new Date(invYr, 0, 1);
        const yrEnd = new Date(invYr + 1, 0, 1);
        const invSnap = await db.collection('invoices')
            .where('date', '>=', yrStart)
            .where('date', '<', yrEnd)
            .orderBy('date', 'desc')
            .get();
        let nextNum = 0;
        invSnap.forEach(doc => {
            const iid = doc.data().invoiceId || '';
            const match = iid.match(/^FAC-\d{2}-(\d+)$/);
            if (match) {
                const seq = parseInt(match[1], 10);
                if (!isNaN(seq) && seq >= nextNum) nextNum = seq + 1;
            }
        });

        // Extraer tickets afectados
        const ticketsIdArray = advGridRows.filter(r => r.ticketId).map(r => r.rawTicketData.id);
        const ticketsDetailArray = advGridRows.filter(r => r.ticketId).map(r => ({
            id: r.rawTicketData.id,
            compName: r.rawTicketData.compName || "",
            price: r.price
        }));

        // Construir datos del emisor basados en filial seleccionada
        const compId = document.getElementById('adv-company-picker')?.value || 'main';
        let finalSenderData = Object.assign({}, window.invCompanyData || {});
        if (compId !== 'main' && window.advCompaniesMap && window.advCompaniesMap[compId]) {
            const filial = window.advCompaniesMap[compId];
            finalSenderData.name = filial.name;
            finalSenderData.cif = filial.nif || filial.cif;
            finalSenderData.address = filial.address;
            if(filial.bank) finalSenderData.bank = filial.bank;
            if(filial.email) finalSenderData.email = filial.email;
            if(filial.legal) finalSenderData.legal = filial.legal;
        }

        const invoiceData = {
            number: nextNum,
            invoiceId: `FAC-${invYYSave}-${nextNum}`,
            date: finalDate,
            clientId: advCurrentClient.id,
            clientName: advCurrentClient.name,
            clientCIF: advCurrentClient.idNum || 'N/A',
            subtotal: advCurrentCalculations.subtotal,
            iva: advCurrentCalculations.iva,
            ivaRate: advGridRows.length > 0 ? advGridRows[0].iva : 21, // Simplified avg if mixed
            irpf: advCurrentCalculations.irpf,
            irpfRate: advCurrentCalculations.irpfRate,
            total: advCurrentCalculations.total,
            tickets: ticketsIdArray, // Old array style for compatibility
            ticketsDetail: ticketsDetailArray,
            senderData: finalSenderData,
            // Advanced specific fields (to recreate grids if needed later)
            advancedGrid: advGridRows.map(r => ({description: r.description, qty: r.qty, price: r.price, discount: r.discount, iva: r.iva, total: r.total, ticketId: r.ticketId}))
        };
        if (typeof getOperatorStamp === 'function') Object.assign(invoiceData, getOperatorStamp());

        const invDoc = await db.collection('invoices').add(invoiceData);

        // Batch update all tickets
        if (ticketsIdArray.length > 0) {
            const batch = db.batch();
            advGridRows.filter(r=>r.ticketId).forEach(r => {
                const tRef = db.collection('tickets').doc(r.ticketId);
                batch.update(tRef, { invoiceId: invDoc.id, invoiceNum: invoiceData.invoiceId });
            });
            await batch.commit();
        }

        alert(`✅ Factura ${invoiceData.invoiceId} generada y registrada con éxito.\nImporte: ${invoiceData.total.toFixed(2)}€`);
        
        // Transition to Saved State
        advCurrentInvoiceId = invDoc.id;
        document.getElementById('adv-inv-number').value = invoiceData.invoiceId;
        
        // Update Buttons
        document.getElementById('btn-adv-save').style.display = 'none';
        const payBtn = document.getElementById('btn-adv-pay');
        const creditBtn = document.getElementById('btn-adv-credit');
        const printBtn = document.getElementById('btn-adv-print');
        const emailBtn = document.getElementById('btn-adv-email');
        if(payBtn) payBtn.style.display = 'block';
        if(creditBtn) creditBtn.style.display = 'block';
        if(printBtn) printBtn.style.display = 'block';
        if(emailBtn) emailBtn.style.display = 'block';
        
        // Refresh classic billing list just in case
        if (typeof window.loadInvoices === 'function') window.loadInvoices();

    } catch (e) {
        alert("Error crítico guardando factura: " + e.message);
        console.error(e);
    } finally {
        if (typeof hideLoading === 'function') hideLoading();
    }
};

document.getElementById('btn-adv-print')?.addEventListener('click', () => {
    if(!advCurrentInvoiceId) { alert("Primero debes guardar la factura."); return; }
    if(typeof window.printInvoice === 'function') window.printInvoice(advCurrentInvoiceId);
});

document.getElementById('btn-adv-email')?.addEventListener('click', () => {
    if(!advCurrentInvoiceId) { alert("Primero debes guardar la factura."); return; }
    if(typeof window.emailInvoice === 'function') window.emailInvoice(advCurrentInvoiceId);
});

document.getElementById('btn-adv-pay')?.addEventListener('click', async () => {
    if(!advCurrentInvoiceId) { alert("Primero debes guardar la factura."); return; }
    if(confirm("¿Marcar esta factura como COBRADA?")) {
        try {
            await db.collection('invoices').doc(advCurrentInvoiceId).update({ paid: true, paidDate: new Date(), ...(typeof getOperatorStamp === 'function' ? getOperatorStamp() : {}) });
            alert("✅ Factura marcada como cobrada exitosamente.");
            document.getElementById('btn-adv-pay').style.display = 'none';
        } catch(e) {
            alert("Error: " + e.message);
        }
    }
});

document.getElementById('btn-adv-close')?.addEventListener('click', () => {
    if(typeof window.showView === 'function') window.showView('billing');
});

window.advResetForm = () => {
    if(advGridRows.length > 0 && !confirm('¿Borrador en curso. Seguro que quieres limpiar y empezar una nueva factura?')) return;
    advCurrentClient = null;
    advCurrentInvoiceId = null;
    document.getElementById('adv-client-picker').value = '';
    document.getElementById('adv-inv-number').value = '';
    document.getElementById('adv-inv-date').value = '';
    advGridRows = [];
    advRenderGrid();
    
    // Show all buttons by default as requested by user
    document.getElementById('btn-adv-save').style.display = 'block';
    const payBtn = document.getElementById('btn-adv-pay');
    const creditBtn = document.getElementById('btn-adv-credit');
    const printBtn = document.getElementById('btn-adv-print');
    const emailBtn = document.getElementById('btn-adv-email');
    if(payBtn) payBtn.style.display = 'block';
    if(creditBtn) creditBtn.style.display = 'block';
    if(printBtn) printBtn.style.display = 'block';
    if(emailBtn) emailBtn.style.display = 'block';
};

document.getElementById('btn-adv-credit')?.addEventListener('click', async () => {
    if(!advCurrentInvoiceId) { alert("Debes guardar o cargar una factura primero."); return; }
    if(!confirm("¿Deseas generar una FACTURA RECTIFICATIVA (Abono) idéntica pero en negativo para esta factura?")) return;
    
    if(typeof showLoading === 'function') showLoading();
    try {
        const doc = await db.collection('invoices').doc(advCurrentInvoiceId).get();
        if(!doc.exists) throw new Error("La factura original ya no existe.");
        const orig = doc.data();
        
        // Year-based numbering for credit note: ABO-YY-SEQ
        const aboYear = new Date().getFullYear();
        const aboYY = String(aboYear).slice(-2);
        const aboYrStart = new Date(aboYear, 0, 1);
        const aboYrEnd = new Date(aboYear + 1, 0, 1);
        const invSnap = await db.collection('invoices')
            .where('date', '>=', aboYrStart)
            .where('date', '<', aboYrEnd)
            .orderBy('date', 'desc')
            .get();
        let nextNum = 0;
        invSnap.forEach(doc => {
            const iid = doc.data().invoiceId || '';
            const match = iid.match(/^(?:FAC|ABO)-\d{2}-(\d+)$/);
            if (match) {
                const seq = parseInt(match[1], 10);
                if (!isNaN(seq) && seq >= nextNum) nextNum = seq + 1;
            }
        });

        const abonoData = {
            ...orig,
            number: nextNum,
            invoiceId: `ABO-${aboYY}-${nextNum}`,
            date: new Date(),
            subtotal: -orig.subtotal,
            iva: -orig.iva,
            irpf: -orig.irpf,
            total: -orig.total,
            isAbono: true,
            rectificaA: orig.invoiceId,
            paid: true, // usually a credit note is considered balanced
            advancedGrid: (orig.advancedGrid || []).map(r => ({...r, qty: -r.qty, total: -r.total}))
        };
        
        if (abonoData.ticketsDetail) {
            abonoData.ticketsDetail = abonoData.ticketsDetail.map(t => ({...t, price: -t.price}));
        }
        if (typeof getOperatorStamp === 'function') Object.assign(abonoData, getOperatorStamp());

        const abonoDoc = await db.collection('invoices').add(abonoData);
        alert(`✅ Abono ${abonoData.invoiceId} generado exitosamente.`);
        
        // Auto-load the new abono
        advLoadInvoice(abonoDoc.id);
        
        // Reload classic list
        if (typeof window.loadInvoices === 'function') window.loadInvoices();
        
    } catch(e) {
        alert("Error generando abono: " + e.message);
    } finally {
        if(typeof hideLoading === 'function') hideLoading();
    }
});

window.advLoadInvoice = async (invoiceId) => {
    if(!invoiceId) return;
    if(typeof showLoading === 'function') showLoading();
    try {
        const doc = await db.collection('invoices').doc(invoiceId).get();
        if(!doc.exists) throw new Error("Factura no encontrada.");
        const inv = doc.data();
        
        advCurrentClient = window.userMap ? window.userMap[inv.clientId] : { name: inv.clientName, idNum: inv.clientCIF, id: inv.clientId };
        advCurrentInvoiceId = doc.id;
        
        // Set header
        document.getElementById('adv-inv-number').value = inv.invoiceId;
        const dateObj = inv.date?.toDate ? inv.date.toDate() : new Date(inv.date);
        document.getElementById('adv-inv-date').value = dateObj.toISOString().split('T')[0];
        
        // Populate Grid
        advGridRows = [];
        if (inv.advancedGrid && inv.advancedGrid.length > 0) {
            inv.advancedGrid.forEach((r, i) => {
                advGridRows.push({
                    id: 'row_loaded_' + i,
                    description: r.description,
                    qty: r.qty,
                    price: r.price,
                    discount: r.discount || 0,
                    iva: r.iva || inv.ivaRate || 21,
                    total: r.total,
                    ticketId: r.ticketId
                });
            });
        } else if (inv.ticketsDetail && inv.ticketsDetail.length > 0) {
             inv.ticketsDetail.forEach((t, i) => {
                 advGridRows.push({
                     id: 'row_loaded_' + i,
                     description: `Albarán ${t.id} - ${t.compName || ''}`,
                     qty: 1,
                     price: t.price,
                     discount: 0,
                     iva: inv.ivaRate || 21,
                     total: t.price,
                     ticketId: t.id
                 });
             });
        }
        
        // We override the client picker to show the current client's name without needing full reload of dropdown if not found
        const picker = document.getElementById('adv-client-picker');
        let optionExists = Array.from(picker.options).some(o => o.value === inv.clientId);
        if(!optionExists) {
            const opt = document.createElement('option');
            opt.value = inv.clientId;
            opt.textContent = `[${inv.clientCIF}] ${inv.clientName}`;
            picker.appendChild(opt);
        }
        picker.value = inv.clientId;
        
        advRenderGrid();
        
        // UI State
        document.getElementById('btn-adv-save').style.display = 'none';
        const payBtn = document.getElementById('btn-adv-pay');
        const creditBtn = document.getElementById('btn-adv-credit');
        const printBtn = document.getElementById('btn-adv-print');
        const emailBtn = document.getElementById('btn-adv-email');
        if(payBtn) payBtn.style.display = inv.paid ? 'none' : 'block';
        if(creditBtn) creditBtn.style.display = 'block';
        if(printBtn) printBtn.style.display = 'block';
        if(emailBtn) emailBtn.style.display = 'block';
        
        const viewDiv = document.getElementById('view-adv-billing');
        if(viewDiv) viewDiv.style.display = 'flex';
        
    } catch(e) {
        alert("Error cargando factura: " + e.message);
    } finally {
        if(typeof hideLoading === 'function') hideLoading();
    }
};

window.toggleAdvTariffs = () => {
    const isShowingTariffs = document.getElementById('adv-tariffs-workspace').style.display !== 'none';
    if(isShowingTariffs) {
        document.getElementById('adv-tariffs-workspace').style.display = 'none';
        document.getElementById('adv-billing-workspace').style.display = 'flex';
        document.getElementById('btn-adv-tariffs-toggle').innerHTML = '💰 Gestión de Tarifas';
        document.getElementById('btn-adv-tariffs-toggle').style.color = '#FFD700';
    } else {
        document.getElementById('adv-billing-workspace').style.display = 'none';
        document.getElementById('adv-tariffs-workspace').style.display = 'flex';
        document.getElementById('btn-adv-tariffs-toggle').innerHTML = '◀ Volver a Factura';
        document.getElementById('btn-adv-tariffs-toggle').style.color = 'white';
        if(typeof window.loadTariffClients === 'function') window.loadTariffClients();
    }
};


// --- DRAWER LOGIC FOR CATALOG AND TARIFFS ---
window.advCurrentDrawerType = null;
window.advDrawerItemsCache = [];

window.advOpenDrawer = async (type) => {
    window.advCurrentDrawerType = type;
    const drawer = document.getElementById('adv-catalog-drawer');
    const title = document.getElementById('adv-drawer-title');
    const list = document.getElementById('adv-drawer-list');
    const search = document.getElementById('adv-drawer-search');
    
    if(!drawer) return;
    drawer.classList.add('open');
    if(search) search.value = '';
    list.innerHTML = '<div style="text-align:center; padding:20px; color:#aaa;">Cargando catálogo interactivamente...</div>';
    window.advDrawerItemsCache = [];

    try {
        if (type === 'articles') {
            title.textContent = '📦 Catálogo Maestro de Artículos';
            const snap = await db.collection('articles').orderBy('name').get();
            if(!snap.empty) {
                snap.forEach(doc => {
                    const d = doc.data();
                    window.advDrawerItemsCache.push({ id: doc.id, name: d.name, price: d.price || 0, type: 'article' });
                });
            } else {
                list.innerHTML = '<div style="text-align:center; padding:20px; color:#aaa;">No hay artículos en el maestro. Crealos en la sección Artículos.</div>';
                return;
            }
        } else if (type === 'tariffs') {
            title.textContent = '💰 Tarifas y Acuerdos de Cliente';
            if (!advCurrentClient) {
                list.innerHTML = '<div style="text-align:center; padding:20px; color:#ff4444; font-weight:bold;">⚠️ Seleccione primero un CLIENTE en la cabecera de la factura.</div>';
                return;
            }
            
            // Check global / client tariffs from global window.tariffsCache or fetch
            let tariffsArray = [];
            if(window.tariffsCache && Object.keys(window.tariffsCache).length > 0) {
                 tariffsArray = Object.values(window.tariffsCache);
            } else {
                 const tSnap = await db.collection('tariffs').get();
                 tSnap.forEach(tDoc => tariffsArray.push({id: tDoc.id, ...tDoc.data()}));
            }

            let foundAny = false;
            tariffsArray.forEach(t => {
                // Filter if it's assigned to this client or is a general one
                if(t.assignedClient === advCurrentClient.id || t.assignedClient === advCurrentClient.idNum || !t.assignedClient || t.assignedClient === 'GLOBAL') {
                    foundAny = true;
                    if(t.subTariff && t.subTariff.length > 0) {
                        t.subTariff.forEach(st => {
                            window.advDrawerItemsCache.push({
                                id: t.id + '_' + st.id,
                                name: `${t.name} - ${st.name} (${st.origin || '*'} ➔ ${st.destination || '*'})`,
                                price: st.price || 0,
                                type: 'tariff'
                            });
                        });
                    } else if (t.basePrice) {
                        window.advDrawerItemsCache.push({
                            id: t.id,
                            name: t.name,
                            price: t.basePrice || 0,
                            type: 'tariff'
                        });
                    }
                }
            });

            if(!foundAny || window.advDrawerItemsCache.length === 0) {
                list.innerHTML = '<div style="text-align:center; padding:20px; color:#ff4444;">No se encontraron tarifas genéricas ni asociadas a este cliente.</div>';
                return;
            }
        }
        
        advRenderDrawerList();
    } catch(e) {
        list.innerHTML = `<div style="text-align:center; padding:20px; color:#ff4444;">Error de lectura: ${e.message}</div>`;
    }
};

window.advRenderDrawerList = (filter = '') => {
    const list = document.getElementById('adv-drawer-list');
    if(!list) return;
    list.innerHTML = '';
    const term = filter.toLowerCase();
    
    let count = 0;
    window.advDrawerItemsCache.forEach(item => {
        if(term && !item.name.toLowerCase().includes(term)) return;
        count++;
        
        const div = document.createElement('div');
        div.className = 'adv-drawer-item';
        // HTML Injection safe string escaping for item.name
        const safeName = item.name.replace(/'/g, "\\'");
        div.innerHTML = `
            <div style="flex:1; padding-right:10px;">
                <div style="color:#d4d4d4; font-weight:bold; font-size:0.9rem; line-height:1.2; margin-bottom:4px;">${item.name}</div>
                <div style="color:#4CAF50; font-size:0.85rem; font-weight:900;">${parseFloat(item.price).toFixed(2)} €</div>
            </div>
            <button style="background:#007acc; border:none; color:white; padding:8px 15px; border-radius:4px; font-weight:bold; cursor:pointer;" onmouseover="this.style.background='#0098ff'" onmouseout="this.style.background='#007acc'" onclick="advAddRowFromDrawer('${safeName}', ${item.price})">+ AÑADIR</button>
        `;
        list.appendChild(div);
    });
    
    if(count === 0) {
        list.innerHTML = '<div style="text-align:center; padding:20px; color:#666;">No hay coincidencias con tu búsqueda.</div>';
    }
};

window.advFilterDrawer = (val) => {
    advRenderDrawerList(val);
};

window.advAddRowFromDrawer = (desc, price) => {
    advGridRows.push({
        id: 'row_' + Date.now() + Math.floor(Math.random()*1000),
        description: desc,
        qty: 1,
        price: parseFloat(price) || 0,
        discount: 0,
        iva: window.invCompanyData ? window.invCompanyData.iva : 21,
        ticketId: null
    });
    advRenderGrid();
};
