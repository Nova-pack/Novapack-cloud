/**
 * NOVAPACK CLOUD - FULL OPERATIONAL LOGIC
 * Multi-tenant Firebase Integration
 */

// --- GLOBAL STATE ---
let currentUser = null;
let currentCompanyId = 'default';
let companies = [];
let editingId = null;
let editingClientId = null;
let currentReportData = [];

// Constants
const DEFAULT_ZONES = [
    "MALAGA", "GRANADA", "SEVILLA", "CORDOBA", "VELEZ-MALAGA",
    "TORRE DEL MAR", "ALGARROBO", "NERJA", "TORROX COSTA", "LOJA",
    "BANAMEJI", "LUCENA", "ANTEQUERA", "MOLLINA", "PUENTE GENIL",
    "FUENTE DE PIEDRA", "ESTEPONA", "MARBELLA", "TORREMOLINOS",
    "FUENGIROLA", "MIJAS", "BENALMADENA",
    "ALCALA DE GUADAIRA", "CABRA", "F.VAQUEROS", "ARCHIDONA",
    "ALBOLOTE", "N.ANDALAUCIA", "SAN PEDRO"
];

const DEFAULT_SIZES = "Pequeño, Mediano, Grande, Sobre, Palet, BATERIA 45AH, BATERIA 75AH, BATERIA 100AH, BATERIA CAMION, TAMBOR CAMION, CALIPER DE CAMION, CAJAS DE ACEITE O AGUA, GARRAFAS ADBLUE";

// --- INITIALIZATION ---
auth.onAuthStateChanged(async (user) => {
    if (!user) {
        window.location.href = 'index.html';
        return;
    }
    currentUser = user;
    const userDisplay = document.getElementById('user-display-name');
    if (userDisplay) userDisplay.textContent = user.email;

    // Admin Detection
    try {
        const adminDoc = await db.collection('config').doc('admin').get();
        if (adminDoc.exists && adminDoc.data().uid === user.uid) {
            console.log("Admin detectado en App Cliente.");
            const adminBtn = document.getElementById('nav-admin');
            if (adminBtn) {
                adminBtn.classList.remove('hidden');
                adminBtn.onclick = () => window.location.href = 'admin.html';
            }
        }
    } catch (e) { console.warn("Admin check skipped:", e); }

    showLoading();
    try {
        await loadCompanies();
        await loadProvinces();
        await resetEditor();
        hideLoading();
    } catch (e) {
        console.error("Init Error:", e);
        hideLoading();
    }
});

// --- CLOUD HELPERS ---
const getCollection = (name) => {
    if (!currentUser) return null;
    return db.collection('users').doc(currentUser.uid)
        .collection('companies').doc(currentCompanyId)
        .collection(name);
};

// --- DATA ACCESS: COMPANIES ---
async function loadCompanies() {
    const snap = await db.collection('users').doc(currentUser.uid).collection('companies').get();
    companies = [];
    snap.forEach(doc => companies.push({ id: doc.id, ...doc.data() }));

    if (companies.length === 0) {
        // Create first company if none exists
        const defaultComp = {
            name: 'Empresa Principal',
            prefix: 'NP',
            address: 'Dirección no configurada',
            phone: '',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        const newDoc = await db.collection('users').doc(currentUser.uid).collection('companies').add(defaultComp);
        currentCompanyId = newDoc.id;
        companies.push({ id: newDoc.id, ...defaultComp });
    } else {
        // Check if there's a stored preference, or use first
        const savedId = localStorage.getItem('last_company_id');
        if (savedId && companies.find(c => c.id === savedId)) {
            currentCompanyId = savedId;
        } else {
            currentCompanyId = companies[0].id;
        }
    }
    renderCompanySelector();
}

function renderCompanySelector() {
    const sel = document.getElementById('company-selector');
    sel.innerHTML = '';
    companies.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name;
        if (c.id === currentCompanyId) opt.selected = true;
        sel.appendChild(opt);
    });
}

document.getElementById('company-selector').onchange = (e) => {
    currentCompanyId = e.target.value;
    localStorage.setItem('last_company_id', currentCompanyId);
    showLoading();
    loadProvinces().then(() => resetEditor().then(hideLoading));
};

// --- NAVIGATION ---
const views = ['dashboard-view', 'clients-view', 'reports-view'];
const hideAllViews = () => views.forEach(id => document.getElementById(id).classList.add('hidden'));

document.getElementById('nav-home').onclick = (e) => {
    if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
    hideAllViews();
    document.getElementById('dashboard-view').classList.remove('hidden');
};

document.getElementById('nav-clients').onclick = () => {
    hideAllViews();
    document.getElementById('clients-view').classList.remove('hidden');
    renderClientsList();
};

document.getElementById('nav-reports').onclick = () => {
    hideAllViews();
    document.getElementById('reports-view').classList.remove('hidden');
    const now = new Date();
    document.getElementById('report-date-start').valueAsDate = new Date(now.getFullYear(), now.getMonth(), 1);
    document.getElementById('report-date-end').valueAsDate = now;
    runReport();
};

document.getElementById('btn-close-clients').onclick = () => document.getElementById('nav-home').click();
document.getElementById('btn-close-reports').onclick = () => document.getElementById('nav-home').click();
document.getElementById('btn-logout').onclick = () => auth.signOut();

// --- TICKET SEARCH & LIST ---
document.getElementById('ticket-search').oninput = (e) => loadTickets(e.target.value);
document.getElementById('date-filter').onchange = () => loadTickets();

async function loadTickets(searchQuery = '') {
    const list = document.getElementById('tickets-list');
    const dateFilter = document.getElementById('date-filter').value;

    // We fetch recent tickets and filter client-side for better UX
    let query = getCollection('tickets').orderBy('createdAt', 'desc').limit(200);
    const snapshot = await query.get();

    let tickets = [];
    snapshot.forEach(doc => tickets.push({ id: doc.id, ...doc.data() }));

    // Apply filters
    if (dateFilter) {
        tickets = tickets.filter(t => {
            if (!t.createdAt) return false;
            const d = t.createdAt.toDate ? t.createdAt.toDate() : new Date(t.createdAt);
            return d.toISOString().split('T')[0] === dateFilter;
        });
    }

    if (searchQuery) {
        const q = searchQuery.toLowerCase();
        tickets = tickets.filter(t =>
            (t.id || "").toLowerCase().includes(q) ||
            (t.receiver || "").toLowerCase().includes(q)
        );
    }

    list.innerHTML = '';
    if (tickets.length === 0) {
        list.innerHTML = '<div style="text-align:center; padding:20px; color:#888;">No hay albaranes.</div>';
        return;
    }

    tickets.forEach(t => renderTicketItem(t, list));
}

function renderTicketItem(t, list) {
    const div = document.createElement('div');
    div.className = `ticket-list-item ${t.printed ? 'printed' : ''} ${editingId === t.id ? 'active' : ''}`;

    const d = t.createdAt ? (t.createdAt.toDate ? t.createdAt.toDate() : new Date(t.createdAt)) : new Date();
    const dateStr = d.toLocaleDateString();
    const pkgCount = t.packagesList ? t.packagesList.reduce((s, p) => s + (parseInt(p.qty) || 1), 0) : (t.packages || 1);

    div.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
            <strong style="color:var(--brand-primary);">${t.id}</strong>
            <span class="status-badge ${t.printed ? 'printed' : 'new'}">${t.printed ? 'IMP' : 'NUEVO'}</span>
        </div>
        <div style="font-weight:700; margin:4px 0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${(t.receiver || "").toUpperCase()}</div>
        <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--text-dim);">
            <span>${dateStr}</span>
            <span>📦 ${pkgCount}</span>
        </div>
    `;
    div.onclick = () => loadEditor(t);
    list.appendChild(div);
}

// --- TICKET EDITOR ---
document.getElementById('btn-add-package').onclick = () => addPackageRow();
document.getElementById('action-new').onclick = () => resetEditor();
document.getElementById('create-ticket-form').onsubmit = handleFormSubmit;

async function loadEditor(t) {
    editingId = t.id;
    document.getElementById('editor-title').textContent = "Visualizando Albarán";
    document.getElementById('editor-status').textContent = `ID: ${t.id}`;
    document.getElementById('editor-actions').classList.remove('hidden');

    // Form data
    document.getElementById('ticket-sender').value = t.sender || '';
    document.getElementById('ticket-sender-address').value = t.senderAddress || '';
    document.getElementById('ticket-sender-phone').value = t.senderPhone || '';
    document.getElementById('ticket-receiver').value = t.receiver || '';
    document.getElementById('ticket-address').value = t.street || t.address || '';
    document.getElementById('ticket-number').value = t.number || '';
    document.getElementById('ticket-phone').value = t.phone || '';
    document.getElementById('ticket-province').value = t.province || '';
    document.getElementById('ticket-shipping-type').value = t.shippingType || 'Pagados';
    document.getElementById('ticket-cod').value = t.cod || '';
    document.getElementById('ticket-notes').value = t.notes || '';
    document.getElementById('ticket-time-slot').value = t.timeSlot || 'MAÑANA';

    // Packages
    const list = document.getElementById('packages-list');
    list.innerHTML = '';
    if (t.packagesList && t.packagesList.length > 0) {
        t.packagesList.forEach(p => addPackageRow(p));
    } else {
        addPackageRow();
    }

    // Actions
    document.getElementById('action-print').onclick = () => printTicket(t);
    document.getElementById('action-label').onclick = () => printLabel(t);
    document.getElementById('action-delete').onclick = () => deleteTicket(t.id);

    // UI Refresh
    loadTickets(document.getElementById('ticket-search').value);
}

async function resetEditor() {
    editingId = null;
    document.getElementById('create-ticket-form').reset();
    document.getElementById('editor-title').textContent = "Nuevo Albarán";

    showLoading();
    const nextId = await getNextId();
    document.getElementById('editor-status').innerHTML = `ALBARÁN NÚMERO: <strong>${nextId}</strong>`;
    document.getElementById('editor-actions').classList.add('hidden');

    // Set auto-date if not set
    if (!document.getElementById('date-filter').value) {
        document.getElementById('date-filter').value = new Date().toISOString().split('T')[0];
    }

    // Packages
    document.getElementById('packages-list').innerHTML = '';
    addPackageRow();

    // Default Sender
    const comp = companies.find(c => c.id === currentCompanyId);
    if (comp) {
        document.getElementById('ticket-sender').value = comp.name || '';
        document.getElementById('ticket-sender-address').value = comp.address || '';
        document.getElementById('ticket-sender-phone').value = comp.phone || '';
    }

    // Auto-select slot by hour
    const hour = new Date().getHours();
    document.getElementById('ticket-time-slot').value = hour < 15 ? 'MAÑANA' : 'TARDE';

    await loadTickets();
    hideLoading();
}

async function getNextId() {
    const comp = companies.find(c => c.id === currentCompanyId);
    const prefix = (comp && comp.prefix) ? comp.prefix : "NP";

    const snapshot = await getCollection('tickets').orderBy('id', 'desc').limit(5).get();
    let maxNum = 0;
    snapshot.forEach(doc => {
        const id = doc.id;
        const match = id.match(/\d+/);
        if (match) {
            const num = parseInt(match[0]);
            if (num > maxNum) maxNum = num;
        }
    });
    return prefix + (maxNum + 1).toString().padStart(2, '0');
}

// --- PACKAGE MANAGEMENT ---
function addPackageRow(data = null) {
    const list = document.getElementById('packages-list');
    const row = document.createElement('div');
    row.className = 'package-row';
    row.style = "display: flex; gap: 10px; margin-bottom: 12px; align-items: flex-end; padding: 10px; background: rgba(255,255,255,0.02); border-radius: 8px;";

    let options = DEFAULT_SIZES.split(',').map(s => `<option value="${s.trim()}">${s.trim()}</option>`).join('');

    row.innerHTML = `
        <div style="width: 70px;">
            <label style="font-size:0.65rem; color:var(--text-dim);">CANT.</label>
            <input type="number" class="pkg-qty form-control" value="1" min="1" style="text-align:center; font-weight:bold;">
        </div>
        <div style="width: 90px;">
            <label style="font-size:0.65rem; color:var(--text-dim);">PESO (KG)</label>
            <input type="number" class="pkg-weight form-control" step="0.1" placeholder="0.0" style="text-align:center;">
        </div>
        <div style="flex:1;">
            <label style="font-size:0.65rem; color:var(--text-dim);">TAMAÑO / TIPO</label>
            <select class="pkg-size form-control">${options}</select>
        </div>
        <button type="button" class="btn-remove-pkg" style="background:none; border:none; color:#FF3B30; font-size:1.5rem; cursor:pointer; padding-bottom:5px;">&times;</button>
    `;

    list.appendChild(row);

    const qtyIn = row.querySelector('.pkg-qty');
    const weightIn = row.querySelector('.pkg-weight');
    const sizeSel = row.querySelector('.pkg-size');
    const removeBtn = row.querySelector('.btn-remove-pkg');

    qtyIn.oninput = updateContext;
    weightIn.oninput = updateContext;
    removeBtn.onclick = () => { row.remove(); updateContext(); };

    // Auto-weight logic
    sizeSel.onchange = () => {
        const val = sizeSel.value;
        const weights = { 'BATERIA 45AH': 15, 'BATERIA 75AH': 25, 'BATERIA 100AH': 45, 'BATERIA CAMION': 60, 'TAMBOR CAMION': 50, 'GARRAFAS ADBLUE': 10 };
        if (weights[val]) {
            weightIn.value = weights[val];
            updateContext();
        }
    };

    if (data) {
        qtyIn.value = data.qty || 1;
        weightIn.value = data.weight || 0;
        sizeSel.value = data.size || 'Pequeño';
    }
    updateContext();
}

function updateContext() {
    const rows = document.querySelectorAll('.package-row');
    let totalQty = 0;
    let totalWeight = 0;
    rows.forEach(r => {
        const q = parseInt(r.querySelector('.pkg-qty').value) || 0;
        const w = parseFloat(r.querySelector('.pkg-weight').value) || 0;
        totalQty += q;
        totalWeight += (q * w);
    });
    document.getElementById('display-total-packages').textContent = totalQty;
    document.getElementById('ticket-packages-count').value = totalQty;
    document.getElementById('ticket-weight-total').value = totalWeight.toFixed(2);
}

function getPackagesData() {
    return Array.from(document.querySelectorAll('.package-row')).map(row => ({
        qty: parseInt(row.querySelector('.pkg-qty').value) || 1,
        weight: parseFloat(row.querySelector('.pkg-weight').value) || 0,
        size: row.querySelector('.pkg-size').value
    }));
}

// --- FORM SUBMIT (SAVE TICKET) ---
async function handleFormSubmit(e) {
    e.preventDefault();
    const pkgs = getPackagesData();
    if (pkgs.length === 0) { alert("Añade al menos un bulto."); return; }

    const street = document.getElementById('ticket-address').value;
    const number = document.getElementById('ticket-number').value;
    const fullAddr = street + (number ? " Nº " + number : "");

    const data = {
        sender: document.getElementById('ticket-sender').value,
        senderAddress: document.getElementById('ticket-sender-address').value,
        senderPhone: document.getElementById('ticket-sender-phone').value,
        receiver: document.getElementById('ticket-receiver').value,
        street: street,
        number: number,
        address: fullAddr,
        phone: document.getElementById('ticket-phone').value,
        province: document.getElementById('ticket-province').value,
        shippingType: document.getElementById('ticket-shipping-type').value,
        cod: document.getElementById('ticket-cod').value,
        notes: document.getElementById('ticket-notes').value,
        timeSlot: document.getElementById('ticket-time-slot').value,
        packagesList: pkgs,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    showLoading();
    try {
        let ticketId = editingId;
        if (editingId) {
            await getCollection('tickets').doc(editingId).update(data);
        } else {
            ticketId = await getNextId();
            data.id = ticketId;
            data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            data.printed = false;
            await getCollection('tickets').doc(ticketId).set(data);
        }

        // Save Client to Agenda if checked
        if (document.getElementById('save-destination-check').checked) {
            await saveClientToAgenda(data);
        }

        alert(`Albarán ${ticketId} guardado con éxito.`);
        await resetEditor();
    } catch (err) {
        console.error(err);
        alert("Error al guardar: " + err.message);
    } finally {
        hideLoading();
    }
}

async function deleteTicket(id) {
    if (confirm(`¿Estás seguro de eliminar el albarán ${id} permanentemente de la nube?`)) {
        showLoading();
        await getCollection('tickets').doc(id).delete();
        await resetEditor();
        hideLoading();
    }
}

// --- CLIENT AGENDA ---
async function saveClientToAgenda(t) {
    const agenda = getCollection('destinations');
    const snap = await agenda.where('name', '==', t.receiver).get();

    const newAddr = {
        id: "addr_" + Date.now(),
        address: t.address,
        street: t.street,
        number: t.number,
        province: t.province
    };

    if (snap.empty) {
        await agenda.add({
            name: t.receiver,
            phone: t.phone,
            addresses: [newAddr]
        });
    } else {
        const doc = snap.docs[0];
        const data = doc.data();
        const exists = data.addresses.some(a => a.address === t.address);
        if (!exists) {
            data.addresses.push(newAddr);
            await doc.ref.update({ addresses: data.addresses, phone: t.phone || data.phone });
        }
    }
}

async function renderClientsList() {
    const list = document.getElementById('clients-view-list');
    const search = document.getElementById('client-view-search').value.toLowerCase();

    list.innerHTML = '<div style="padding:20px; text-align:center;">Cargando clientes...</div>';
    const snap = await getCollection('destinations').get();

    let clients = [];
    snap.forEach(doc => clients.push({ id: doc.id, ...doc.data() }));
    clients.sort((a, b) => a.name.localeCompare(b.name));

    if (search) {
        clients = clients.filter(c => c.name.toLowerCase().includes(search));
    }

    list.innerHTML = '';
    if (clients.length === 0) {
        list.innerHTML = '<div style="padding:20px; text-align:center; color:#888;">No hay clientes.</div>';
    }

    clients.forEach(c => {
        const item = document.createElement('div');
        item.style = `padding:15px; border-bottom:1px solid var(--border-glass); cursor:pointer; background:${editingClientId === c.id ? 'var(--surface-active)' : 'transparent'};`;
        item.innerHTML = `
            <div style="font-weight:bold; color:white;">${c.name.toUpperCase()}</div>
            <div style="font-size:0.8rem; color:var(--text-dim);">${c.addresses.length} direcciones registradas</div>
        `;
        item.onclick = () => loadClientToEdit(c);
        list.appendChild(item);
    });
}

document.getElementById('client-view-search').oninput = renderClientsList;

function loadClientToEdit(c) {
    editingClientId = c.id;
    document.getElementById('client-edit-id').value = c.id;
    document.getElementById('client-edit-name').value = c.name;
    document.getElementById('client-edit-phone').value = c.phone || "";

    const container = document.getElementById('client-edit-addresses-container');
    container.innerHTML = '';
    if (c.addresses && c.addresses.length > 0) {
        c.addresses.forEach(a => addAddressRowToEditor(a));
    } else {
        addAddressRowToEditor();
    }
    renderClientsList();
}

function addAddressRowToEditor(data = null) {
    const container = document.getElementById('client-edit-addresses-container');
    const row = document.createElement('div');
    row.className = 'address-edit-row';
    row.style = "background:rgba(255,255,255,0.03); padding:15px; border-radius:12px; border:1px solid var(--border-glass); margin-bottom:15px;";

    row.innerHTML = `
        <div class="form-group mb-2">
            <label style="font-size:0.6rem;">DIRECCIÓN COMPLETA</label>
            <input type="text" class="edit-addr-full form-control" placeholder="Se genera auto..." value="${data ? data.address : ''}">
        </div>
        <div style="display:grid; grid-template-columns: 2fr 1fr 1fr; gap:10px;">
            <div>
                <label style="font-size:0.6rem;">CALLE</label>
                <input type="text" class="edit-addr-street form-control" value="${data ? (data.street || '') : ''}">
            </div>
            <div>
                <label style="font-size:0.6rem;">Nº</label>
                <input type="text" class="edit-addr-num form-control" value="${data ? (data.number || '') : ''}">
            </div>
            <div>
                <label style="font-size:0.6rem;">PROVINCIA</label>
                <select class="edit-addr-prov form-control"></select>
            </div>
        </div>
        <button class="btn-remove-addr" style="background:none; border:none; color:#FF3B30; font-size:0.7rem; font-weight:bold; cursor:pointer; margin-top:10px;">🗑️ ELIMINAR DIRECCIÓN</button>
    `;

    // Fill provinces
    const provSel = row.querySelector('.edit-addr-prov');
    let html = '<option value="">-- Zona --</option>';
    DEFAULT_ZONES.sort().forEach(z => html += `<option value="${z}">${z}</option>`);
    provSel.innerHTML = html;
    if (data && data.province) provSel.value = data.province;

    container.appendChild(row);
    row.querySelector('.btn-remove-addr').onclick = () => row.remove();
}

document.getElementById('btn-client-save').onclick = async () => {
    const id = document.getElementById('client-edit-id').value;
    const name = document.getElementById('client-edit-name').value.trim();
    const phone = document.getElementById('client-edit-phone').value.trim();

    const rows = document.querySelectorAll('.address-edit-row');
    const addresses = Array.from(rows).map(row => ({
        id: "addr_" + Date.now() + Math.random(),
        address: row.querySelector('.edit-addr-full').value.trim(),
        street: row.querySelector('.edit-addr-street').value.trim(),
        number: row.querySelector('.edit-addr-num').value.trim(),
        province: row.querySelector('.edit-addr-prov').value
    })).filter(a => a.address);

    if (!name) { alert("El nombre es obligatorio"); return; }
    if (addresses.length === 0) { alert("Añade al menos una dirección"); return; }

    showLoading();
    try {
        const agenda = getCollection('destinations');
        if (id) {
            await agenda.doc(id).update({ name, phone, addresses });
        } else {
            await agenda.add({ name, phone, addresses });
        }
        alert("Cliente guardado correctamente.");
        await renderClientsList();
    } catch (e) {
        alert("Error: " + e.message);
    } finally {
        hideLoading();
    }
};

document.getElementById('btn-client-new').onclick = () => {
    editingClientId = null;
    document.getElementById('client-edit-id').value = '';
    document.getElementById('client-edit-name').value = '';
    document.getElementById('client-edit-phone').value = '';
    document.getElementById('client-edit-addresses-container').innerHTML = '';
    addAddressRowToEditor();
};

document.getElementById('btn-add-address-row').onclick = () => addAddressRowToEditor();

// --- CLIENT PICKER (AUTO-COMPLETE) ---
const clientPickerInput = document.getElementById('client-picker');
const clientPickerResults = document.getElementById('client-picker-results');

clientPickerInput.oninput = async () => {
    const q = clientPickerInput.value.toLowerCase();
    if (q.length < 1) { clientPickerResults.classList.add('hidden'); return; }

    const snap = await getCollection('destinations').get();
    let matches = [];
    snap.forEach(doc => {
        const c = doc.data();
        if (c.name.toLowerCase().includes(q)) {
            c.addresses.forEach(a => matches.push({ name: c.name, phone: c.phone, ...a }));
        } else {
            c.addresses.forEach(a => {
                if (a.address.toLowerCase().includes(q)) matches.push({ name: c.name, phone: c.phone, ...a });
            });
        }
    });

    if (matches.length > 0) {
        clientPickerResults.innerHTML = '';
        clientPickerResults.classList.remove('hidden');
        matches.slice(0, 10).forEach(m => {
            const div = document.createElement('div');
            div.className = 'suggestion-item';
            div.style = "padding:10px; border-bottom:1px solid var(--border-glass); cursor:pointer;";
            div.innerHTML = `<strong>${m.name}</strong><br><span style="font-size:0.8rem; color:#888;">${m.address}</span>`;
            div.onclick = () => {
                document.getElementById('ticket-receiver').value = m.name;
                document.getElementById('ticket-address').value = m.street || m.address;
                document.getElementById('ticket-number').value = m.number || '';
                document.getElementById('ticket-phone').value = m.phone || '';
                document.getElementById('ticket-province').value = m.province || '';
                clientPickerInput.value = '';
                clientPickerResults.classList.add('hidden');
            };
            clientPickerResults.appendChild(div);
        });
    } else {
        clientPickerResults.classList.add('hidden');
    }
};

// --- PROVINCES ---
async function loadProvinces() {
    const sel = document.getElementById('ticket-province');
    sel.innerHTML = '<option value="">-- PROVINCIA --</option>';
    DEFAULT_ZONES.sort().forEach(z => {
        const opt = document.createElement('option');
        opt.value = z;
        opt.textContent = z;
        sel.appendChild(opt);
    });
}

// --- REPORTS ---
async function runReport() {
    const list = document.getElementById('report-results');
    const client = document.getElementById('report-client').value.toLowerCase();
    const startStr = document.getElementById('report-date-start').value;
    const endStr = document.getElementById('report-date-end').value;

    showLoading();
    const snap = await getCollection('tickets').get();
    let tickets = [];
    snap.forEach(doc => tickets.push({ id: doc.id, ...doc.data() }));

    tickets = tickets.filter(t => {
        if (!t.createdAt) return false;
        const ts = t.createdAt.toDate ? t.createdAt.toDate() : new Date(t.createdAt);
        const dStr = ts.toISOString().split('T')[0];
        const matchesClient = !client || (t.receiver || "").toLowerCase().includes(client) || (t.id || "").toLowerCase().includes(client);
        const matchesDate = (!startStr || dStr >= startStr) && (!endStr || dStr <= endStr);
        return matchesClient && matchesDate;
    });

    tickets.sort((a, b) => (b.createdAt.toDate ? b.createdAt.toDate() : new Date(b.createdAt)) - (a.createdAt.toDate ? a.createdAt.toDate() : new Date(a.createdAt)));
    currentReportData = tickets;

    document.getElementById('report-total-count').textContent = tickets.length;
    list.innerHTML = '';

    if (tickets.length === 0) {
        document.getElementById('report-empty').style.display = 'block';
    } else {
        document.getElementById('report-empty').style.display = 'none';
        tickets.forEach(t => {
            const tr = document.createElement('tr');
            const dStr = (t.createdAt.toDate ? t.createdAt.toDate() : new Date(t.createdAt)).toLocaleDateString();
            const pkgCount = t.packagesList ? t.packagesList.reduce((s, p) => s + (parseInt(p.qty) || 1), 0) : 1;
            const weight = t.packagesList ? t.packagesList.reduce((s, p) => s + (parseFloat(p.weight) || 0), 0) : 0;

            tr.innerHTML = `
                <td style="padding:12px; border-bottom:1px solid #222;">${t.id}</td>
                <td style="padding:12px; border-bottom:1px solid #222;">${dStr}</td>
                <td style="padding:12px; border-bottom:1px solid #222;">${t.receiver}</td>
                <td style="padding:12px; border-bottom:1px solid #222;">${t.province || '-'}</td>
                <td style="padding:12px; border-bottom:1px solid #222; text-align:center;">${pkgCount}</td>
                <td style="padding:12px; border-bottom:1px solid #222; text-align:center;">${weight.toFixed(1)}kg</td>
                <td style="padding:12px; border-bottom:1px solid #222; text-align:center;">${t.shippingType}</td>
                <td style="padding:12px; border-bottom:1px solid #222; text-align:center;">${t.printed ? '✅' : '⏳'}</td>
            `;
            list.appendChild(tr);
        });
    }
    hideLoading();
}

document.getElementById('btn-run-report').onclick = runReport;

// --- PRINTING LOGIC ---
function renderQRCodesInPrintArea() {
    const elements = document.querySelectorAll('#print-area .ticket-qr-code');
    elements.forEach(el => {
        const id = el.dataset.id;
        new QRCode(el, { text: id, width: 80, height: 80, colorDark: "#000000", colorLight: "#ffffff" });
    });
}

function generateTicketHTML(t, footerLabel) {
    const dStr = (t.createdAt.toDate ? t.createdAt.toDate() : new Date(t.createdAt)).toLocaleString();
    const pkgList = t.packagesList || [{ qty: 1, weight: 0, size: 'Bulto' }];
    const hasCod = t.cod && parseFloat(t.cod) > 0;

    let rows = '';
    pkgList.forEach(p => {
        rows += `
            <tr>
                <td style="border:1px solid #000; padding:2px; text-align:center;">${p.qty}</td>
                <td style="border:1px solid #000; padding:2px; text-align:center;">${p.weight} kg</td>
                <td style="border:1px solid #000; padding:2px; text-align:center;">${p.size || 'Bulto'}</td>
                <td style="border:1px solid #000; padding:2px; text-align:center;">${t.shippingType}</td>
                ${hasCod ? `<td style="border:1px solid #000; padding:2px; text-align:center;">${t.cod} €</td>` : ''}
            </tr>
        `;
    });

    return `
    <div class="print-ticket" style="font-family: Arial, sans-serif; border: 2px solid #000; padding: 15px; margin-bottom: 20px; position: relative; background: white; color: black; min-height: 120mm; display:flex; flex-direction:column; justify-content:space-between;">
        <div style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%) rotate(-30deg); font-size:4rem; color:rgba(0,0,0,0.05); font-weight:900; z-index:0; text-transform:uppercase;">${t.province || ''}</div>
        
        <div style="z-index:1;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #000; padding-bottom:10px;">
                <div>
                    <div style="font-weight:900; font-size:1.8rem; color:#FF6600;">NOVAPACK</div>
                    <div style="font-size:0.7rem;">administracion@novapack.info</div>
                </div>
                <div style="text-align:center; border:2px solid #FF6600; padding:5px; border-radius:5px;">
                    <div style="font-size:0.6rem; font-weight:bold; border-bottom:1px solid #FF6600;">ZONA DE REPARTO</div>
                    <div style="font-size:1.5rem; font-weight:900;">${t.province || 'GENÉRICA'}</div>
                </div>
                <div class="ticket-qr-code" data-id="${t.id}"></div>
                <div style="text-align:right;">
                    <div style="font-weight:bold; font-size:1.2rem;">ALBARÁN: <span style="color:#FF6600;">${t.id}</span></div>
                    <div style="font-size:0.8rem;">${dStr}</div>
                    <div style="font-size:0.9rem; font-weight:bold; color:#FF6600;">RECOGIDA: ${t.timeSlot || 'MAÑANA'}</div>
                </div>
            </div>

            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px; margin-top:15px;">
                <div style="border:1px solid #ccc; padding:8px; font-size:0.8rem;">
                    <strong>REMITENTE:</strong><br>${t.sender}<br>${t.senderAddress}<br>${t.senderPhone}
                </div>
                <div style="border:1px solid #000; padding:8px; font-size:1rem;">
                    <strong>DESTINATARIO:</strong><br><span style="font-weight:900; font-size:1.1rem;">${t.receiver}</span><br>${t.address}<br>Telf: ${t.phone || '-'}
                </div>
            </div>

            <table style="width:100%; border-collapse:collapse; margin-top:15px; border:1px solid #000;">
                <thead style="background:#000; color:#fff;">
                    <tr>
                        <th style="font-size:0.7rem;">BULTOS</th>
                        <th style="font-size:0.7rem;">PESO</th>
                        <th style="font-size:0.7rem;">TIPO</th>
                        <th style="font-size:0.7rem;">PORTES</th>
                        ${hasCod ? '<th style="font-size:0.7rem;">REEMBOLSO</th>' : ''}
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>

            <div style="margin-top:10px; border:2px solid #000; padding:8px; display:flex; justify-content:space-around; font-weight:bold; background:#f5f5f5;">
                <span>TOTAL BULTOS: ${pkgList.reduce((s, p) => s + (parseInt(p.qty) || 1), 0)}</span>
                <span>TOTAL PESO: ${pkgList.reduce((s, p) => s + (parseFloat(p.weight) || 0), 0).toFixed(1)} kg</span>
            </div>
            
            <div style="margin-top:10px; border:1px solid #ccc; padding:5px; font-size:0.8rem;">
                <strong>OBSERVACIONES:</strong> ${t.notes || 'Sin observaciones.'}
            </div>
        </div>

        <div style="text-align:right; font-size:0.7rem; border-top:1px dashed #ccc; padding-top:10px; margin-top:10px;">
            <span>Firma y Sello:</span><br>
            <strong style="text-transform:uppercase;">${footerLabel}</strong>
        </div>
    </div>
    `;
}

async function printTicket(t) {
    const area = document.getElementById('print-area');
    area.innerHTML = generateTicketHTML(t, "Ejemplar para el Cliente") +
        '<div style="border-top: 1px dashed #000; margin: 20px 0;"></div>' +
        generateTicketHTML(t, "Ejemplar para Administración");

    renderQRCodesInPrintArea();

    // Mark as printed in background
    getCollection('tickets').doc(t.id).update({ printed: true });

    setTimeout(() => {
        window.print();
        area.innerHTML = '';
    }, 500);
}

// --- SHIFT BATCH PRINTING ---
document.getElementById('btn-print-morning').onclick = () => printShiftBatch('MAÑANA');
document.getElementById('btn-print-afternoon').onclick = () => printShiftBatch('TARDE');

async function printShiftBatch(slot) {
    const today = new Date().toISOString().split('T')[0];
    showLoading();
    const snap = await getCollection('tickets').get();
    let tickets = [];
    snap.forEach(doc => {
        const d = doc.data();
        const dStr = (d.createdAt.toDate ? d.createdAt.toDate() : new Date(d.createdAt)).toISOString().split('T')[0];
        if (dStr === today && d.timeSlot === slot) tickets.push({ id: doc.id, ...d });
    });
    hideLoading();

    if (tickets.length === 0) { alert(`No hay albaranes para el turno ${slot} hoy.`); return; }
    if (!confirm(`¿Imprimir ${tickets.length} albaranes del turno ${slot}?`)) return;

    const area = document.getElementById('print-area');
    area.innerHTML = '';
    tickets.forEach(t => {
        area.innerHTML += `
            <div style="page-break-after: always; padding: 20px 0;">
                ${generateTicketHTML(t, "Ejemplar para el Cliente")}
                <div style="border-top:1px dashed #000; margin: 30px 0;"></div>
                ${generateTicketHTML(t, "Ejemplar para Administración")}
            </div>
        `;
        getCollection('tickets').doc(t.id).update({ printed: true });
    });

    renderQRCodesInPrintArea();
    setTimeout(() => { window.print(); area.innerHTML = ''; }, 500);
}

// --- LABELS PRINTING ---
document.getElementById('btn-print-labels-morning').onclick = () => printShiftLabels('MAÑANA');
document.getElementById('btn-print-labels-afternoon').onclick = () => printShiftLabels('TARDE');

function generateLabelHTML(t, index, total) {
    const weight = t.packagesList ? (t.packagesList[0] ? t.packagesList[0].weight : 0) : 0;
    return `
    <div style="width: 100mm; height: 140mm; border: 3px solid #000; padding: 10px; margin: 5px; box-sizing: border-box; display: flex; flex-direction: column; background: white; color: black; position: relative; font-family: sans-serif;">
        <div style="display:flex; justify-content:space-between; border-bottom:3px solid #FF6600; padding-bottom:5px;">
            <div style="font-weight:900; font-size:1.5rem; color:#FF6600;">NOVAPACK</div>
            <div style="text-align:right; font-size:0.6rem;">REMITENTE:<br><strong>${t.sender}</strong></div>
        </div>
        <div style="flex:1; display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center;">
            <div style="font-size:0.7rem; color:#888;">DESTINATARIO:</div>
            <div style="font-size:1.8rem; font-weight:900; text-transform:uppercase;">${t.receiver}</div>
            <div style="font-size:1rem; margin-top:10px;">${t.address}</div>
            <div style="font-size:2rem; font-weight:900; color:#FF6600; margin-top:10px;">${t.province || ''}</div>
            ${t.notes ? `<div style="font-size:0.8rem; font-weight:bold; margin-top:10px; border-top:1px dotted #ccc; padding-top:5px;">OBS: ${t.notes}</div>` : ''}
        </div>
        <div style="position:absolute; bottom:60px; right:10px;" class="ticket-qr-code" data-id="${t.id}"></div>
        <div style="display:flex; justify-content:space-between; border-top:3px solid #000; padding-top:5px; background:#f0f0f0;">
            <div style="text-align:center; flex:1;">BULTO<br><strong>${index + 1} / ${total}</strong></div>
            <div style="text-align:center; flex:2; border-left:1px solid #ccc; border-right:1px solid #ccc;">${t.id}</div>
            <div style="text-align:center; flex:1;">PESO<br><strong>${weight} kg</strong></div>
        </div>
        ${(t.cod && parseFloat(t.cod) > 0) ? `<div style="position:absolute; top:80px; left:10px; border:2px solid red; color:red; font-weight:900; padding:5px; transform:rotate(-20deg);">REEMBOLSO: ${t.cod} €</div>` : ''}
    </div>
    `;
}

async function printShiftLabels(slot) {
    const today = new Date().toISOString().split('T')[0];
    showLoading();
    const snap = await getCollection('tickets').get();
    let tickets = [];
    snap.forEach(doc => {
        const d = doc.data();
        const dStr = (d.createdAt.toDate ? d.createdAt.toDate() : new Date(d.createdAt)).toISOString().split('T')[0];
        if (dStr === today && d.timeSlot === slot) tickets.push({ id: doc.id, ...d });
    });
    hideLoading();

    if (tickets.length === 0) return;
    const area = document.getElementById('print-area');
    area.innerHTML = '';

    // Grid alignment for A4 (4 labels per page)
    let page = document.createElement('div');
    page.style = "display:grid; grid-template-columns: 1fr 1fr; gap:5mm; page-break-after:always; width:210mm; height:297mm; padding:5mm; box-sizing:border-box;";

    let count = 0;
    tickets.forEach(t => {
        const totalPkgs = t.packagesList ? t.packagesList.reduce((s, p) => s + (parseInt(p.qty) || 1), 0) : 1;
        for (let i = 0; i < totalPkgs; i++) {
            page.innerHTML += generateLabelHTML(t, i, totalPkgs);
            count++;
            if (count % 4 === 0) {
                area.appendChild(page);
                page = document.createElement('div');
                page.style = "display:grid; grid-template-columns: 1fr 1fr; gap:5mm; page-break-after:always; width:210mm; height:297mm; padding:5mm; box-sizing:border-box;";
            }
        }
    });

    if (count % 4 !== 0) area.appendChild(page);
    renderQRCodesInPrintArea();
    setTimeout(() => { window.print(); area.innerHTML = ''; }, 500);
}

function printLabel(t) {
    const area = document.getElementById('print-area');
    area.innerHTML = '';
    const totalPkgs = t.packagesList ? t.packagesList.reduce((s, p) => s + (parseInt(p.qty) || 1), 0) : 1;

    let page = document.createElement('div');
    page.style = "display:grid; grid-template-columns: 1fr 1fr; gap:5mm; page-break-after:always; width:210mm; height:297mm; padding:5mm; box-sizing:border-box;";

    for (let i = 0; i < totalPkgs; i++) {
        page.innerHTML += generateLabelHTML(t, i, totalPkgs);
    }
    area.appendChild(page);
    renderQRCodesInPrintArea();
    setTimeout(() => { window.print(); area.innerHTML = ''; }, 500);
}

// --- UTILS ---
function showLoading() { document.getElementById('loading-overlay').style.display = 'flex'; }
function hideLoading() { document.getElementById('loading-overlay').style.display = 'none'; }
