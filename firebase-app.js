// --- GLOBAL STATE ---
console.log("NOVAPACK CLOUD - ENGINE v2.2 ACTIVE");
let currentUser = null;
let userData = null; // Stored profile data (idNum, name, etc.)
let currentCompanyId = 'default';
let companies = [];
let editingId = null;
let editingClientId = null;
let currentReportData = [];
let activeTariffArticles = [];

// Constants
const DEFAULT_SIZES = "Pequeño, Mediano, Grande, Sobre, Palet, BATERIA 45AH, BATERIA 75AH, BATERIA 100AH, BATERIA CAMION, TAMBOR CAMION, CALIPER DE CAMION, CAJAS DE ACEITE O AGUA, GARRAFAS ADBLUE";

// --- CUSTOM STORAGE (Firestore-backed User Settings) ---
async function getCustomData(key) {
    if (!currentUser) return null;
    try {
        const doc = await db.collection('users').doc(currentUser.uid).collection('config').doc('settings').get();
        return doc.exists ? doc.data()[key] : null;
    } catch (e) {
        console.warn("Error getting custom data:", e);
        return null;
    }
}

async function getGlobalData(key) {
    try {
        const doc = await db.collection('config').doc('settings').get();
        return doc.exists ? doc.data()[key] : null;
    } catch (e) {
        console.warn("Error getting global data:", e);
        return null;
    }
}

async function saveCustomData(key, value) {
    if (!currentUser) return;
    try {
        await db.collection('users').doc(currentUser.uid).collection('config').doc('settings').set({ [key]: value }, { merge: true });
    } catch (e) {
        console.error("Error saving custom data:", e);
    }
}

// --- INITIALIZATION ---
auth.onAuthStateChanged(async (user) => {
    if (!user) {
        window.location.href = 'index.html';
        return;
    }
    currentUser = user;
    const userDisplay = document.getElementById('user-display-name');
    if (userDisplay) userDisplay.textContent = user.email;

    // Fetch user profile from Firestore
    try {
        let userDoc = await db.collection('users').doc(user.uid).get();
        let foundProfile = userDoc.exists ? userDoc.data() : null;

        // Si no hay perfil o faltan datos clave (nombre/ID), buscamos por email
        if (!foundProfile || !foundProfile.name || !foundProfile.idNum) {
            console.log("Perfil incompleto o inexistente. Buscando por email...");
            const snap = await db.collection('users').where('email', '==', user.email).get();
            if (!snap.empty) {
                const legacyDoc = snap.docs[0];
                const legacyData = legacyDoc.data();
                console.log("Perfil maestro encontrado por email. Sincronizando...");

                userData = { ...foundProfile, ...legacyData, uid: user.uid };
                await db.collection('users').doc(user.uid).set(userData, { merge: true });

                // Si el original era un document ID aleatorio, lo limpiamos para evitar duplicados
                if (!legacyDoc.id.includes('@') && legacyDoc.id !== user.uid) {
                    await legacyDoc.ref.delete();
                }
            } else {
                userData = foundProfile;
            }
        } else {
            userData = foundProfile;
        }

        if (userData && document.getElementById('user-display-name')) {
            document.getElementById('user-display-name').textContent = `[#${userData.idNum || ''}] ${userData.name || user.email}`;
            console.log("Perfil cargado satisfactoriamente:", userData.name);
        }
    } catch (e) {
        console.warn("Error en sincronización de perfil:", e);
    }

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
        await loadActiveTariff(); // Load custom items from tariff
        await loadProvinces();
        await resetEditor();
        await renderCompanySelector();
        await loadPredefinedPhones();
    } catch (e) { console.error("LoadCompanies Error:", e); }
    hideLoading();
});

async function loadPredefinedPhones() {
    try {
        const snap = await db.collection('config').doc('phones').collection('list').get();
        const list = document.getElementById('predefined-phones');
        if (!list) return;
        list.innerHTML = '';
        snap.forEach(doc => {
            const data = doc.data();
            const opt = document.createElement('option');
            opt.value = data.number;
            opt.textContent = data.label;
            list.appendChild(opt);
        });
    } catch (e) {
        console.warn("Predefined phones ignored (possibly no permissions):", e);
    }
}

async function loadActiveTariff() {
    activeTariffArticles = [];
    if (!currentUser) return;

    try {
        let tariffData = null;
        // 1. Try Global Tariff if assigned
        if (userData && userData.tariffId) {
            const globalDoc = await db.collection('tariffs').doc("GLOBAL_" + userData.tariffId).get();
            if (globalDoc.exists) {
                tariffData = globalDoc.data();
                console.log("Cargando Tarifa Global:", userData.tariffId);
            }
        }

        // 2. Fallback to Specific User Tariff
        if (!tariffData) {
            const userDoc = await db.collection('tariffs').doc(currentUser.uid).get();
            if (userDoc.exists) {
                tariffData = userDoc.data();
                console.log("Cargando Tarifa Personalizada de Usuario");
            }
        }

        if (tariffData && tariffData.items) {
            activeTariffArticles = Object.keys(tariffData.items);
            console.log("Artículos de Tarifa activos:", activeTariffArticles);
        }
    } catch (e) {
        console.warn("Error al cargar tarifa activa:", e);
    }
}

let targetContext = null; // { uid, compId, idNum, name, address, phone }

// --- CLOUD HELPERS ---
const getCollection = (name) => {
    if (!currentUser) return null;

    let uid = currentUser.uid;
    let cid = currentCompanyId;

    // Si tenemos un contexto de cliente escaneado por QR, redirigimos los tickets (lectura/escritura)
    if (targetContext && (name === 'tickets' || name === 'nextId')) {
        uid = targetContext.uid;
        cid = targetContext.compId;
    }

    const userRef = db.collection('users').doc(uid);

    // Shared collections (global to the user, across all their companies)
    if (name === 'destinations') {
        return userRef.collection(name);
    }

    // Company-specific collections
    return userRef.collection('companies').doc(cid).collection(name);
};

// --- DATA ACCESS: COMPANIES ---
async function loadCompanies() {
    const snap = await db.collection('users').doc(currentUser.uid).collection('companies').get();
    companies = [];
    snap.forEach(doc => companies.push({ id: doc.id, ...doc.data() }));

    if (companies.length === 0) {
        // Create first company using data provided by admin
        console.log("Creando empresa inicial vinculada al nombre del cliente...");
        const clientName = (userData && userData.name) ? userData.name : 'Mi Empresa Novapack';
        const defaultComp = {
            name: clientName, // El Cliente ES la Empresa
            prefix: (userData && userData.idNum) ? userData.idNum : 'NP',
            address: (userData && userData.senderAddress) ? userData.senderAddress : 'Dirección no configurada',
            phone: (userData && userData.senderPhone) ? userData.senderPhone : '',
            startNum: 1,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        const newDoc = await db.collection('users').doc(currentUser.uid).collection('companies').add(defaultComp);
        currentCompanyId = newDoc.id;
        companies.push({ id: newDoc.id, ...defaultComp });
    } else {
        // Sync existing primary company with Admin settings (Ensures updates propagate)
        if (userData && companies.length > 0) {
            const firstComp = companies[0];
            const needsUpdate = (userData.name && firstComp.name !== userData.name) ||
                (userData.senderAddress && firstComp.address !== userData.senderAddress) ||
                (userData.senderPhone && firstComp.phone !== userData.senderPhone);

            if (needsUpdate) {
                console.log("Actualizando datos de remitente según configuración de Administrador...");
                const syncData = {
                    name: userData.name || firstComp.name,
                    address: userData.senderAddress || firstComp.address,
                    phone: userData.senderPhone || firstComp.phone
                };
                await db.collection('users').doc(currentUser.uid).collection('companies').doc(firstComp.id).update(syncData);
                Object.assign(firstComp, syncData);
            }
        }

        // Check if there's a stored preference, or use first
        const savedId = localStorage.getItem('last_company_id');
        if (savedId && companies.find(c => c.id === savedId)) {
            currentCompanyId = savedId;
        } else {
            currentCompanyId = companies[0].id;
        }
    }
    renderCompanySelector();
    renderCompanyList(); // Also update list if modal is open
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
    Promise.all([loadProvinces(), resetEditor(), loadTickets()]).then(hideLoading);
    // Reiniciar escucha para la nueva empresa
    initTicketListener();
};

// Company Modal Listeners
document.getElementById('btn-manage-companies').onclick = () => {
    document.getElementById('company-modal').classList.remove('hidden');
    renderCompanyList();
};
document.getElementById('btn-close-company-modal').onclick = () => {
    document.getElementById('company-modal').classList.add('hidden');
    resetCompanyForm();
};
document.getElementById('company-form').onsubmit = handleCompanyFormSubmit;
document.getElementById('btn-cancel-comp-edit').onclick = resetCompanyForm;

// Batch Print Listeners
document.getElementById('btn-print-morning').onclick = () => printShiftBatch('MAÑANA');
document.getElementById('btn-print-afternoon').onclick = () => printShiftBatch('TARDE');
document.getElementById('btn-print-labels-morning').onclick = () => printLabelShiftBatch('MAÑANA');
document.getElementById('btn-print-labels-afternoon').onclick = () => printLabelShiftBatch('TARDE');

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

// --- TICKET SEARCH & LIST (Real-time Multi-station) ---
let lastTicketsBatch = [];
let ticketListener = null;

function initTicketListener() {
    if (ticketListener) ticketListener(); // Unsubscribe prev

    console.log("Iniciando escucha en tiempo real para MULTIPUESTO...");
    // Aumentamos el límite un poco para dar más margen de búsqueda histórica
    const query = getCollection('tickets').orderBy('createdAt', 'desc').limit(300);

    ticketListener = query.onSnapshot(snapshot => {
        lastTicketsBatch = [];
        snapshot.forEach(doc => lastTicketsBatch.push({ id: doc.id, ...doc.data() }));
        renderTicketsList();
    }, err => {
        console.error("Error en tiempo real:", err);
        // Si hay error (ej: permisos o desconexión), intentamos reconectar en 5s
        setTimeout(initTicketListener, 5000);
    });
}

function renderTicketsList() {
    const list = document.getElementById('tickets-list');
    const searchQuery = document.getElementById('ticket-search').value.toLowerCase().trim();
    const dateFilter = document.getElementById('date-filter').value;

    let filtered = [...lastTicketsBatch];

    // 1. Filtro por Fecha
    if (dateFilter) {
        filtered = filtered.filter(t => {
            if (!t.createdAt) return false;
            const d = t.createdAt.toDate ? t.createdAt.toDate() : new Date(t.createdAt);
            return d.toISOString().split('T')[0] === dateFilter;
        });
    }

    // 2. Filtro por Búsqueda (ID o Destinatario)
    if (searchQuery) {
        filtered = filtered.filter(t =>
            (t.id || "").toLowerCase().includes(searchQuery) ||
            (t.receiver || "").toLowerCase().includes(searchQuery) ||
            (t.address || "").toLowerCase().includes(searchQuery)
        );
    }

    list.innerHTML = '';
    if (filtered.length === 0) {
        list.innerHTML = `<div style="text-align:center; padding:20px; color:#888;">
            ${searchQuery || dateFilter ? 'No se encontraron resultados.' : 'No hay albaranes registrados.'}
        </div>`;
        return;
    }

    // Renderizar solo los primeros 100 resultados para mantener el DOM fluido
    filtered.slice(0, 100).forEach(t => renderTicketItem(t, list));
}

// Mantenemos loadTickets para compatibilidad de eventos pero redirigimos al render
async function loadTickets() {
    if (lastTicketsBatch.length === 0) {
        initTicketListener();
    } else {
        renderTicketsList();
    }
}

document.getElementById('ticket-search').oninput = renderTicketsList;
document.getElementById('date-filter').onchange = renderTicketsList;


function renderTicketItem(t, list) {
    const div = document.createElement('div');
    div.className = `ticket-list-item ${t.printed ? 'printed' : ''} ${editingId === t.id ? 'active' : ''}`;

    const d = t.createdAt ? (t.createdAt.toDate ? t.createdAt.toDate() : new Date(t.createdAt)) : new Date();
    const dateStr = d.toLocaleDateString();
    const pkgCount = t.packagesList ? t.packagesList.reduce((s, p) => s + (parseInt(p.qty) || 1), 0) : (t.packages || 1);

    div.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2px;">
            <strong style="color:var(--brand-primary); font-size:0.85rem; letter-spacing:0.5px;">${t.id}</strong>
            <span class="status-badge ${t.printed ? 'printed' : 'new'}" style="font-size:0.55rem; padding:1px 4px;">${t.printed ? 'IMP' : 'NUEVO'}</span>
        </div>
        <div style="font-weight:600; font-size:0.9rem; margin:2px 0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:var(--text-main);">${(t.receiver || "").toUpperCase()}</div>
        <div style="display:flex; justify-content:space-between; font-size:0.7rem; color:var(--text-dim); opacity:0.8;">
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
        for (const p of t.packagesList) await addPackageRow(p);
    } else {
        await addPackageRow();
    }

    // Actions
    document.getElementById('action-print').onclick = () => printTicket(t);
    document.getElementById('action-label').onclick = () => printLabel(t);
    document.getElementById('action-delete').onclick = () => deleteTicket(t.id);
    document.getElementById('action-sms-pickup').onclick = () => sendPickupSMS(t);
    document.getElementById('action-sms-pickup').style.display = 'inline-block';

    // UI Refresh
    loadTickets(document.getElementById('ticket-search').value);
}

async function resetEditor() {
    editingId = null;
    document.getElementById('create-ticket-form').reset();
    document.getElementById('editor-title').textContent = "Nuevo Albarán";
    document.getElementById('action-sms-pickup').style.display = 'none';

    showLoading();
    const nextId = await getNextId();
    document.getElementById('editor-status').innerHTML = `ALBARÁN NÚMERO: <strong>${nextId}</strong>`;
    document.getElementById('editor-actions').classList.add('hidden');

    // Set auto-date if not set
    if (!document.getElementById('date-filter').value) {
        document.getElementById('date-filter').value = new Date().toISOString().split('T')[0];
    }

    // Sender Info based on context
    if (targetContext) {
        document.getElementById('ticket-sender').value = targetContext.name;
        document.getElementById('ticket-sender-address').value = targetContext.address;
        document.getElementById('ticket-sender-phone').value = targetContext.phone || '';
    } else {
        const userDisplay = document.getElementById('user-display-name');
        if (userDisplay && userData) {
            userDisplay.textContent = `[#${userData.idNum || ''}] ${userData.name || currentUser.email}`;
            userDisplay.style.color = '';
        }
        const comp = companies.find(c => c.id === currentCompanyId);
        if (comp) {
            document.getElementById('ticket-sender').value = comp.name;
            document.getElementById('ticket-sender-address').value = comp.address;
            document.getElementById('ticket-sender-phone').value = comp.phone || '';
        }
    }

    // Packages
    document.getElementById('packages-list').innerHTML = '';
    await addPackageRow();

    // Default Sender: Treat Client name as the main identity
    const comp = companies.find(c => c.id === currentCompanyId) || {};
    const clientName = (userData && userData.name) ? userData.name : (comp.name || '');

    document.getElementById('ticket-sender').value = clientName;
    document.getElementById('ticket-sender-address').value = (userData && userData.senderAddress) ? userData.senderAddress : (comp.address || '');
    document.getElementById('ticket-sender-phone').value = (userData && userData.senderPhone) ? userData.senderPhone : (comp.phone || '');

    // Auto-select slot by hour
    const hour = new Date().getHours();
    document.getElementById('ticket-time-slot').value = hour < 15 ? 'MAÑANA' : 'TARDE';

    await loadTickets();
    hideLoading();
}

async function getNextId() {
    const comp = companies.find(c => c.id === currentCompanyId);
    if (!comp) return "NP01";
    const prefix = comp.prefix || "NP";
    const startNum = parseInt(comp.startNum) || 1;

    try {
        const snapshot = await getCollection('tickets').orderBy('id', 'desc').limit(50).get();
        let maxNum = startNum - 1;

        snapshot.forEach(doc => {
            const id = doc.id;
            if (id.startsWith(prefix)) {
                // Remove prefix and any non-numeric chars to get the number
                const numPart = id.substring(prefix.length).match(/\d+/);
                if (numPart) {
                    const num = parseInt(numPart[0]);
                    if (num > maxNum) maxNum = num;
                }
            }
        });
        return prefix + (maxNum + 1).toString().padStart(2, '0');
    } catch (e) {
        console.error("Error generating next ID:", e);
        return prefix + startNum.toString().padStart(2, '0');
    }
}

// --- COMPANY MANAGEMENT LOGIC ---
function renderCompanyList() {
    const container = document.getElementById('company-list-container');
    if (!container) return;
    container.innerHTML = '';

    companies.forEach(c => {
        const item = document.createElement('div');
        item.style = "display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.05); padding:10px 15px; border-radius:10px; border:1px solid var(--border-glass);";
        item.innerHTML = `
            <div>
                <div style="font-weight:bold; font-size:0.9rem;">${c.name}</div>
                <div style="font-size:0.7rem; color:var(--text-dim);">${c.prefix || 'NP'} | ${c.address}</div>
            </div>
            <div style="display:flex; gap:8px;">
                <button class="btn btn-xs btn-outline" onclick="editCompanyUI('${c.id}')">✏️</button>
                <button class="btn btn-xs btn-danger" onclick="deleteCompanyCloud('${c.id}')">🗑️</button>
            </div>
        `;
        container.appendChild(item);
    });
}

window.editCompanyUI = (id) => {
    const c = companies.find(x => x.id === id);
    if (!c) return;

    document.getElementById('comp-edit-id').value = c.id;
    document.getElementById('comp-name').value = c.name;
    document.getElementById('comp-address').value = c.address;
    document.getElementById('comp-phone').value = c.phone || '';
    document.getElementById('comp-prefix').value = c.prefix || 'NP';
    document.getElementById('comp-start-num').value = c.startNum || 1;
    document.getElementById('comp-province').value = c.province || '';
    document.getElementById('comp-sms-gateway').value = c.smsGateway || '';
    document.getElementById('comp-sms-pickup').value = c.pickupAlertPhone || '';

    document.getElementById('company-form-title').textContent = "EDITAR EMPRESA";
    document.getElementById('btn-cancel-comp-edit').classList.remove('hidden');
};

function resetCompanyForm() {
    document.getElementById('company-form').reset();
    document.getElementById('comp-edit-id').value = '';
    document.getElementById('company-form-title').textContent = "AÑADIR NUEVA EMPRESA";
    document.getElementById('btn-cancel-comp-edit').classList.add('hidden');
}

async function handleCompanyFormSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('comp-edit-id').value;
    const data = {
        name: document.getElementById('comp-name').value.trim(),
        address: document.getElementById('comp-address').value.trim(),
        phone: document.getElementById('comp-phone').value.trim(),
        province: document.getElementById('comp-province').value,
        prefix: (document.getElementById('comp-prefix').value.trim() || 'NP').toUpperCase(),
        startNum: parseInt(document.getElementById('comp-start-num').value) || 1,
        smsGateway: document.getElementById('comp-sms-gateway').value.trim(),
        pickupAlertPhone: document.getElementById('comp-sms-pickup').value.trim(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    showLoading();
    try {
        const col = db.collection('users').doc(currentUser.uid).collection('companies');
        if (id) {
            await col.doc(id).update(data);
        } else {
            data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            const newDoc = await col.add(data);
            // Switch to the new company automatically
            currentCompanyId = newDoc.id;
            localStorage.setItem('last_company_id', currentCompanyId);
        }
        await loadCompanies();
        resetCompanyForm();
        // Force refresh editor to use the new company as sender
        await resetEditor();

        // CERRAR MODAL AUTOMÁTICAMENTE
        document.getElementById('company-modal').classList.add('hidden');

        console.log("Empresa guardada con éxito.");
        // Opcional: Notificación menos intrusiva si se prefiere, pero alert está bien.
    } catch (err) {
        alert("Error: " + err.message);
    } finally {
        hideLoading();
    }
}

window.deleteCompanyCloud = async (id) => {
    if (companies.length <= 1) {
        alert("No puedes eliminar la única empresa.");
        return;
    }
    const c = companies.find(x => x.id === id);
    if (!confirm(`¿Eliminar la empresa "${c.name}" y TODOS sus datos asociados?`)) return;

    showLoading();
    try {
        await db.collection('users').doc(currentUser.uid).collection('companies').doc(id).delete();
        if (currentCompanyId === id) {
            const next = companies.find(x => x.id !== id);
            currentCompanyId = next.id;
            localStorage.setItem('last_company_id', currentCompanyId);
        }
        await loadCompanies();
        await resetEditor();
        alert("Empresa eliminada.");
    } catch (err) {
        alert("Error al eliminar: " + err.message);
    } finally {
        hideLoading();
    }
};

// --- PACKAGE MANAGEMENT ---
async function addPackageRow(data = null) {
    const list = document.getElementById('packages-list');
    const row = document.createElement('div');
    row.className = 'package-row';
    row.style = "display: flex; gap: 8px; margin-bottom: 8px; align-items: flex-end; padding: 6px 8px; background: rgba(255,255,255,0.01); border-radius: 4px; border: 1px solid rgba(255,255,255,0.03);";

    // Generate options: Prioritize active tariff articles if they exist
    let optionsHtml = "";
    if (activeTariffArticles.length > 0) {
        optionsHtml = activeTariffArticles.map(s => `<option value="${s.trim()}">${s.trim()}</option>`).join('');
    } else {
        const customSizes = await getCustomData('custom_sizes') || [];
        optionsHtml = DEFAULT_SIZES.split(',').map(s => `<option value="${s.trim()}">${s.trim()}</option>`).join('');
        customSizes.forEach(s => optionsHtml += `<option value="${s.trim()}">${s.trim()}</option>`);
    }
    optionsHtml += `<option value="create_new_size" style="color:var(--brand-primary); font-weight:bold;">+ CREAR NUEVO...</option>`;

    row.innerHTML = `
        <div style="width: 60px;">
            <label style="font-size:0.6rem; color:var(--text-dim); font-weight:600;">CANT.</label>
            <input type="number" class="pkg-qty form-control" value="1" min="1" style="text-align:center; padding:4px;">
        </div>
        <div style="width: 70px;">
            <label style="font-size:0.6rem; color:var(--text-dim); font-weight:600;">PESO</label>
            <input type="number" class="pkg-weight form-control" step="0.1" placeholder="0.0" style="text-align:center; padding:4px;">
        </div>
        <div style="flex:1;">
            <label style="font-size:0.65rem; color:var(--text-dim);">TAMAÑO / TIPO</label>
            <select class="pkg-size form-control">${optionsHtml}</select>
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

    // Create new size logic
    sizeSel.onchange = async () => {
        if (sizeSel.value === 'create_new_size') {
            const newSize = prompt("Nombre del nuevo tamaño/tipo:");
            if (newSize && newSize.trim()) {
                const current = await getCustomData('custom_sizes') || [];
                current.push(newSize.trim());
                await saveCustomData('custom_sizes', [...new Set(current)]);

                // Add to all selects in UI
                document.querySelectorAll('.pkg-size').forEach(sel => {
                    const opt = document.createElement('option');
                    opt.value = newSize.trim();
                    opt.textContent = newSize.trim();
                    sel.add(opt, sel.options[sel.options.length - 1]);
                });
                sizeSel.value = newSize.trim();
            } else {
                sizeSel.value = "Mediano";
            }
        }

        // Auto-weight logic
        const val = sizeSel.value;
        const weights = { 'BATERIA 45AH': 15, 'BATERIA 75AH': 25, 'BATERIA 100AH': 45, 'BATERIA CAMION': 60, 'TAMBOR CAMION': 50, 'GARRAFAS ADBLUE': 10 };
        if (weights[val]) {
            weightIn.value = weights[val];
        }
        updateContext();
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
        uid: currentUser.uid,
        clientIdNum: userData ? userData.idNum : '---',
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

            // Auto-SMS Alert on First Ticket of Shift
            await checkAndSendAutoShiftSMS(data);

            // Si estábamos en contexto externo (QR), revertimos tras guardar
            if (targetContext) {
                console.log("Ticket guardado en contexto externo. Revirtiendo a contexto propio...");
                targetContext = null;
                await loadCompanies(); // Recargar mis propias empresas
                await initTicketListener(); // Volver a escuchar mis tickets
            }
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

async function checkAndSendAutoShiftSMS(ticket) {
    const now = new Date();
    const today = now.toLocaleDateString('en-CA'); // YYYY-MM-DD local
    const snap = await getCollection('tickets').get();

    let count = 0;
    snap.forEach(doc => {
        const d = doc.data();
        if (!d.createdAt || !d.timeSlot) return;

        const dateObj = d.createdAt.toDate ? d.createdAt.toDate() : new Date(d.createdAt);
        if (isNaN(dateObj.getTime())) return;

        const dStr = dateObj.toLocaleDateString('en-CA');
        if (dStr === today && d.timeSlot === ticket.timeSlot) count++;
    });

    if (count === 1) { // This is the first one for this shift today
        const comp = companies.find(c => c.id === currentCompanyId) || {};
        const alertPhone = comp.pickupAlertPhone || await getGlobalData('pickup_alert_phone');
        const smsGateway = comp.smsGateway || await getGlobalData('sms_gateway_url');

        if (alertPhone && smsGateway) {
            const timestamp = now.toLocaleDateString() + " " + now.toLocaleTimeString();
            const msg = `NOVAPACK - AVISO RECOGIDA (${ticket.timeSlot}) ${timestamp}: Envío preparado en ${ticket.sender}.`;

            const finalUrl = smsGateway
                .replace(/\{TELEFONO\}/gi, alertPhone)
                .replace(/\{MENSAJE\}/gi, encodeURIComponent(msg));

            console.log("SMS Automático: Intentando enviar a " + alertPhone);
            fetch(finalUrl, { mode: 'no-cors' })
                .then(() => console.log("✅ SMS Automático disparado."))
                .catch(e => console.warn("❌ Fallo en SMS Automático:", e));
        } else {
            console.warn("SMS Auto-aviso omitido: Falta configurar teléfono o pasarela.");
        }
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
        item.style = `padding:10px 15px; border-bottom:1px solid var(--border-glass); cursor:pointer; background:${editingClientId === c.id ? 'var(--surface-active)' : 'transparent'}; transition: background 0.2s;`;
        item.innerHTML = `
            <div style="font-weight:600; color:var(--text-main); font-size:0.9rem;">${c.name.toUpperCase()}</div>
            <div style="font-size:0.7rem; color:var(--text-dim); opacity:0.8;">${c.addresses.length} DIRECCIONES</div>
        `;
        item.onclick = () => loadClientToEdit(c);
        list.appendChild(item);
    });
}

document.getElementById('client-view-search').oninput = renderClientsList;

async function loadClientToEdit(c) {
    editingClientId = c.id;
    document.getElementById('client-edit-id').value = c.id;
    document.getElementById('client-edit-name').value = c.name;
    document.getElementById('client-edit-phone').value = c.phone || "";

    const container = document.getElementById('client-edit-addresses-container');
    container.innerHTML = '';
    if (c.addresses && c.addresses.length > 0) {
        for (const a of c.addresses) await addAddressRowToEditor(a);
    } else {
        await addAddressRowToEditor();
    }
    renderClientsList();
}

async function addAddressRowToEditor(data = null) {
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
    const custom = await getCustomData('provinces') || [];
    const deleted = await getCustomData('provinces_deleted') || [];
    const DEFAULTS = ["MALAGA", "GRANADA", "SEVILLA", "CORDOBA", "VELEZ-MALAGA", "TORRE DEL MAR", "ALGARROBO", "NERJA", "TORROX COSTA", "LOJA", "ANTEQUERA", "ESTEPONA", "MARBELLA", "TORREMOLINOS", "FUENGIROLA", "MIJAS", "BENALMADENA"];
    let allP = [...new Set([...DEFAULTS, ...custom])].filter(p => !deleted.includes(p)).sort();

    let html = '<option value="">-- Zona --</option>';
    allP.forEach(z => html += `<option value="${z}">${z}</option>`);
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
    const selectors = [
        document.getElementById('ticket-province'),
        document.getElementById('report-province'),
        document.getElementById('comp-province')
    ];
    const custom = await getCustomData('provinces') || [];
    const deleted = await getCustomData('provinces_deleted') || [];

    // Default zones
    const DEFAULTS = ["MALAGA", "GRANADA", "SEVILLA", "CORDOBA", "VELEZ-MALAGA", "TORRE DEL MAR", "ALGARROBO", "NERJA", "TORROX COSTA", "LOJA", "ANTEQUERA", "ESTEPONA", "MARBELLA", "TORREMOLINOS", "FUENGIROLA", "MIJAS", "BENALMADENA"];

    let all = [...new Set([...DEFAULTS, ...custom])].filter(p => !deleted.includes(p)).sort();

    let html = '<option value="">-- PROVINCIA --</option>';
    all.forEach(z => html += `<option value="${z}">${z}</option>`);

    selectors.forEach(sel => {
        if (!sel) return;
        const currentVal = sel.value;
        sel.innerHTML = html + (sel.id !== 'comp-province' ? '<option value="create_new" style="color:var(--brand-primary); font-weight:bold;">+ CREAR NUEVA...</option>' : '');
        sel.value = currentVal;
    });
}

// Auto-populate driver phone based on company province
document.getElementById('comp-province').onchange = (e) => {
    const selectedProv = e.target.value;
    if (!selectedProv) return;

    // Try to find a matching phone in the datalist options
    const datalist = document.getElementById('predefined-phones');
    if (!datalist) return;

    for (const opt of datalist.options) {
        // Check if the label contains the province name
        if (opt.textContent.toUpperCase().includes(selectedProv.toUpperCase())) {
            document.getElementById('comp-sms-pickup').value = opt.value;
            break;
        }
    }
};

document.getElementById('ticket-province').onchange = async (e) => {
    if (e.target.value === 'create_new') {
        const name = prompt("Nombre de la nueva zona:");
        if (name && name.trim()) {
            const custom = await getCustomData('provinces') || [];
            custom.push(name.trim().toUpperCase());
            await saveCustomData('provinces', [...new Set(custom)]);
            await loadProvinces();
            e.target.value = name.trim().toUpperCase();
        } else {
            e.target.value = "";
        }
    }
};

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

// Export CSV Logic
function handleExportCSV() {
    if (currentReportData.length === 0) {
        alert("Primero genera un listado con datos para exportar.");
        return;
    }

    try {
        let csv = "ID;FECHA;REMITENTE;DESTINATARIO;ZONA;BULTOS;PESO;TURNO;PORTES;REEMBOLSO;NOTAS\n";
        currentReportData.forEach(t => {
            const d = (t.createdAt && t.createdAt.toDate) ? t.createdAt.toDate() : new Date(t.createdAt);
            const dStr = d.toLocaleDateString();
            const pkgCount = t.packagesList ? t.packagesList.reduce((s, p) => s + (parseInt(p.qty) || 1), 0) : 1;
            const weight = t.packagesList ? t.packagesList.reduce((s, p) => s + (parseFloat(p.weight) || 0), 0) : 0;

            const row = [
                t.id || '',
                dStr,
                (t.sender || '').replace(/;/g, ','),
                (t.receiver || '').replace(/;/g, ','),
                t.province || '',
                pkgCount,
                weight.toFixed(2),
                t.timeSlot || '',
                t.shippingType || '',
                t.cod || '0.00',
                (t.notes || '').replace(/[\n\r;]/g, ' ')
            ];
            csv += row.join(';') + "\n";
        });

        const blob = new Blob(["\ufeff" + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `reporte_novapack_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    } catch (e) {
        console.error("Export Error:", e);
        alert("Error al exportar CSV: " + e.message);
    }
}

document.getElementById('btn-export-csv').onclick = handleExportCSV;

// --- PRINTING LOGIC ---
function renderQRCodesInPrintArea(ticketData = null) {
    const elements = document.querySelectorAll('#print-area .ticket-qr-code');
    elements.forEach(el => {
        const id = el.dataset.id;

        let qrValue = "TICKET_ID:" + id;

        // If ticketData is provided, encode full info to avoid encoding issues (Mojibake)
        if (ticketData && ticketData.id === id) {
            try {
                const compactData = {
                    id: ticketData.id,
                    r: ticketData.receiver,
                    a: ticketData.address,
                    p: ticketData.phone || '',
                    v: ticketData.province || '',
                    s: ticketData.sender || '',
                    sa: ticketData.senderAddress || '',
                    sp: ticketData.senderPhone || '',
                    t: ticketData.timeSlot || 'MAÑANA',
                    st: ticketData.shippingType || 'Pagados',
                    c: ticketData.cod || '0.00',
                    n: ticketData.notes || '',
                    pkgs: ticketData.packagesList || []
                };
                // Encode as Base64 to safely store Spanish characters and complex objects
                const jsonStr = JSON.stringify(compactData);
                const base64 = btoa(unescape(encodeURIComponent(jsonStr)));
                qrValue = "TICKET_DATA:" + base64;
            } catch (e) {
                console.error("Error encoding QR full data", e);
            }
        }

        new QRCode(el, {
            text: qrValue,
            width: 80,
            height: 80,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: 0 // Level L for higher data density
        });
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
    <div class="print-ticket" style="width: 210mm; height: 148.5mm; border-bottom: 1px dashed #000; padding: 8mm; box-sizing: border-box; position: relative; background: white; color: black; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden; page-break-inside: avoid;">
        <div style="position:absolute; top:45%; left:50%; transform:translate(-50%, -50%) rotate(-25deg); font-size:5rem; color:rgba(0,0,0,0.025); font-weight:900; z-index:0; text-transform:uppercase; pointer-events:none;">${t.province || ''}</div>
        
        <div style="z-index:1;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #000; padding-bottom:6px; margin-bottom:8px;">
                <div style="flex:1;">
                    <div style="font-family: 'Xenotron', sans-serif; font-weight:400; font-size:1.8rem; color:#FF6600; line-height:1; letter-spacing:1px;">NOVAPACK</div>
                    <div style="font-size:0.65rem; color:#444;">administracion@novapack.info</div>
                </div>
                <div style="flex:1; text-align:center;">
                    <div style="display:inline-block; border:2px solid #FF6600; padding:3px 12px; border-radius:6px;">
                        <div style="font-size:0.55rem; font-weight:bold; letter-spacing:1px; color:#666;">ZONA DE REPARTO</div>
                        <div style="font-size:1.2rem; font-weight:900;">${t.province || 'GENÉRICA'}</div>
                        <div style="font-size:1rem; font-weight:900; color:#000; border-top:1px solid #FF6600; margin-top:2px;">${t.timeSlot || 'MAÑANA'}</div>
                    </div>
                </div>
                <div style="flex:1.4; display:flex; justify-content:flex-end; align-items:center; gap:12px;">
                    <div class="ticket-qr-code" data-id="${t.id}"></div>
                    <div style="text-align:right;">
                        <div style="font-weight:bold; font-size:1.1rem; line-height:1.1;">ALBARÁN: <span style="color:#FF6600;">${t.id}</span></div>
                        <div style="font-size:0.75rem; color:#444;">${dStr}</div>
                        <div style="font-size:1.1rem; font-weight:900; color:#000; margin-top:2px; letter-spacing:0.5px; border:1px solid #000; padding:1px 5px; display:inline-block;">${t.timeSlot || 'MAÑANA'}</div>
                        <div style="font-size:0.8rem; font-weight:900; color:#000; margin-top:1px;">PORTES: ${t.shippingType.toUpperCase()}</div>
                    </div>
                </div>
            </div>

            <div style="display:grid; grid-template-columns: 1fr 1.2fr; gap:12px; margin-top:8px;">
                <div style="border:1px solid #ddd; padding:6px; font-size:0.75rem; border-radius:5px; background:#fafafa;">
                    <strong style="color:#888; font-size:0.55rem; display:block; text-transform:uppercase; margin-bottom:2px;">REMITENTE:</strong>
                    <div style="font-weight:normal; font-size:0.85rem; margin-bottom:1px;">${t.sender}</div>
                    <div style="font-weight:bold; color:#111;">${t.senderAddress}</div>
                    <div style="font-weight:normal;">${t.senderPhone}</div>
                </div>
                <div style="border:2px solid #000; padding:6px; font-size:0.8rem; border-radius:5px; background:#fff;">
                    <strong style="color:#888; font-size:0.55rem; display:block; text-transform:uppercase; margin-bottom:2px;">DESTINATARIO:</strong>
                    <div style="font-weight:normal; font-size:1rem; text-transform:uppercase; margin-bottom:1px;">${t.receiver}</div>
                    <div style="font-weight:bold; color:#000;">${t.address}</div>
                    <div style="font-weight:normal; font-size:1rem; color:#000; margin-top:2px;">${t.phone || '-'}</div>
                </div>
            </div>

            <table style="width:100%; border-collapse:collapse; margin-top:10px; border:1.5px solid #000; font-size:0.75rem;">
                <thead style="background:#000; color:#fff;">
                    <tr>
                        <th style="padding:4px; border:1px solid #000; font-size:0.65rem;">BULTOS</th>
                        <th style="padding:4px; border:1px solid #000; font-size:0.65rem;">PESO</th>
                        <th style="padding:4px; border:1px solid #000; font-size:0.65rem;">TIPO / TAMAÑO</th>
                        <th style="padding:4px; border:1px solid #000; font-size:0.65rem;">PORTES</th>
                        ${hasCod ? '<th style="padding:4px; border:1px solid #000; background:#FF6600; font-size:0.65rem;">REEMBOLSO</th>' : ''}
                    </tr>
                </thead>
                <tbody style="font-weight:700; text-align:center;">${rows}</tbody>
            </table>

            <div style="margin-top:6px; border:1.5px solid #000; padding:4px; display:flex; justify-content:space-around; font-weight:900; background:#f5f5f5; font-size:0.9rem; letter-spacing:0.5px;">
                <span>BULTOS: ${pkgList.reduce((s, p) => s + (parseInt(p.qty) || 1), 0)}</span>
                <span>PESO: ${pkgList.reduce((s, p) => s + (parseFloat(p.weight) || 0), 0).toFixed(1)} kg</span>
            </div>
            
            <div style="margin-top:6px; border:1px dashed #aaa; padding:5px; font-size:0.75rem; border-radius:4px;">
                <strong style="color:#888; font-size:0.55rem; display:block; text-transform:uppercase;">OBSERVACIONES:</strong>
                <div style="font-weight:700;">${t.notes || 'Sin observaciones.'}</div>
            </div>
        </div>

        <div style="font-size:0.65rem; border-top:1px solid #eee; padding-top:6px; margin-top:8px; display:flex; justify-content:space-between; align-items:flex-end;">
            <div style="color:#999; font-weight:bold; letter-spacing:0.5px;">SISTEMA NOVAPACK CLOUD</div>
            <div style="text-align:right;">
                <span style="color:#888;">Firma y Sello:</span><br />
                <strong style="text-transform:uppercase; font-size:0.75rem;">${footerLabel}</strong>
            </div>
        </div>
    </div>
    `;
}

async function printTicket(t) {
    const area = document.getElementById('print-area');
    area.innerHTML = '';

    // A4 container for two A5s
    const page = document.createElement('div');
    page.style = "width: 210mm; height: 297mm; display: flex; flex-direction: column; background: white; margin: 0 auto; box-sizing: border-box;";

    page.innerHTML = generateTicketHTML(t, "Ejemplar para el Cliente");
    page.innerHTML += generateTicketHTML(t, "Ejemplar para Administración");

    area.appendChild(page);

    if (confirm("¿Deseas imprimir también el Manifiesto para este albarán?")) {
        area.innerHTML += '<div style="page-break-before: always;"></div>';
        area.innerHTML += generateManifestHTML([t]);
    }

    renderQRCodesInPrintArea(t);
    await getCollection('tickets').doc(t.id).update({ printed: true });

    // Asegurar que no tenemos el modo etiqueta activo
    document.body.classList.remove('printing-labels');

    setTimeout(() => {
        window.print();
        area.innerHTML = '';
    }, 500);
}

function generateManifestHTML(tickets) {
    const dStr = new Date().toLocaleDateString();
    let rows = '';
    let totalB = 0; let totalW = 0;

    tickets.forEach(t => {
        const pkgs = t.packagesList ? t.packagesList.reduce((s, p) => s + (parseInt(p.qty) || 1), 0) : 1;
        const weight = t.packagesList ? t.packagesList.reduce((s, p) => s + (parseFloat(p.weight) || 0), 0) : 0;
        totalB += pkgs; totalW += weight;
        rows += `
            <tr>
                <td style="border:1px solid #000; padding:5px; text-align:center;">${t.id}</td>
                <td style="border:1px solid #000; padding:5px;">${t.receiver}</td>
                <td style="border:1px solid #000; padding:5px;">${t.address}</td>
                <td style="border:1px solid #000; padding:5px; text-align:center;">${pkgs}</td>
                <td style="border:1px solid #000; padding:5px; text-align:center;">${weight.toFixed(1)}</td>
                <td style="border:1px solid #000; padding:5px; text-align:center;">${t.shippingType === 'Pagados' ? 'P' : 'D'}</td>
                <td style="border:1px solid #000; padding:5px; text-align:center; color:red;">${t.cod || ''}</td>
            </tr>
        `;
    });

    return `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
        <div style="display:flex; justify-content:space-between; border-bottom:2px solid #000; padding-bottom:10px;">
            <div><h2 style="margin:0; color:#FF6600;">MANIFIESTO DE SALIDA</h2></div>
            <div style="text-align:right;"><strong>Fecha:</strong> ${dStr} | <strong>Total Envíos:</strong> ${tickets.length}</div>
        </div>
        <table style="width:100%; border-collapse:collapse; margin-top:20px;">
            <thead style="background:#f0f0f0;">
                <tr>
                    <th style="border:1px solid #000; padding:5px;">ID</th>
                    <th style="border:1px solid #000; padding:5px;">DESTINATARIO</th>
                    <th style="border:1px solid #000; padding:5px;">DIRECCIÓN</th>
                    <th style="border:1px solid #000; padding:5px;">BULTOS</th>
                    <th style="border:1px solid #000; padding:5px;">PESO</th>
                    <th style="border:1px solid #000; padding:5px;">P/D</th>
                    <th style="border:1px solid #000; padding:5px;">REEMB.</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
            <tfoot>
                <tr style="font-weight:bold; background:#eee;">
                    <td colspan="3" style="border:1px solid #000; padding:5px; text-align:right;">TOTALES:</td>
                    <td style="border:1px solid #000; padding:5px; text-align:center;">${totalB}</td>
                    <td style="border:1px solid #000; padding:5px; text-align:center;">${totalW.toFixed(1)}</td>
                    <td colspan="2" style="border:1px solid #000;"></td>
                </tr>
            </tfoot>
        </table>
        <div style="margin-top:50px; border-top:1px solid #000; width:200px; text-align:center; float:right;">Firma Transportista</div>
    </div >
        `;
}

// --- SHIFT BATCH PRINTING ---
document.getElementById('btn-print-morning').onclick = () => printShiftBatch('MAÑANA');
document.getElementById('btn-print-afternoon').onclick = () => printShiftBatch('TARDE');
document.getElementById('btn-manifest-m').onclick = () => printManifestOnlyBatch('MAÑANA');
document.getElementById('btn-manifest-t').onclick = () => printManifestOnlyBatch('TARDE');
document.getElementById('btn-manifest-all').onclick = () => printManifestOnlyBatch('AMBOS');

async function printManifestOnlyBatch(slot = 'AMBOS') {
    const today = new Date().toISOString().split('T')[0];
    showLoading();
    const snap = await getCollection('tickets').get();
    let tickets = [];
    snap.forEach(doc => {
        const d = doc.data();
        const dStr = (d.createdAt.toDate ? d.createdAt.toDate() : new Date(d.createdAt)).toISOString().split('T')[0];
        if (dStr === today) {
            if (slot === 'AMBOS' || d.timeSlot === slot) {
                tickets.push({ id: doc.id, ...d });
            }
        }
    });
    hideLoading();

    if (tickets.length === 0) {
        alert(slot === 'AMBOS' ? "No hay albaranes registrados hoy." : `No hay albaranes para el turno ${slot} hoy.`);
        return;
    }

    const area = document.getElementById('print-area');
    area.innerHTML = `
        < div style = "background:white; padding:20px; min-height:297mm;" >
            <div style="text-align:center; font-weight:bold; font-size:1.2rem; margin-bottom:10px; color:#FF6600;">
                MANIFIESTO - TURNO: ${slot}
            </div>
            ${generateManifestHTML(tickets)}
        </div >
        `;

    setTimeout(() => {
        window.print();
        area.innerHTML = '';
    }, 500);
}
document.getElementById('btn-export-csv').onclick = handleExportCSV;
document.getElementById('btn-import-json').onclick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.style.display = 'none';
    input.onchange = (e) => handleImportJSON(e);
    document.body.appendChild(input);
    input.click();
    document.body.removeChild(input);
};

async function handleImportJSON(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
        try {
            const raw = JSON.parse(ev.target.result);
            let importedTickets = [];
            let importedDestinations = [];
            let importedProvinces = [];
            let importedSizes = [];

            // Case A: Full Backup Object (contains keys like novapack_...)
            if (typeof raw === 'object' && !Array.isArray(raw)) {
                Object.keys(raw).forEach(key => {
                    if (key.includes('_tickets')) {
                        try { importedTickets = importedTickets.concat(JSON.parse(raw[key])); } catch (e) { }
                    }
                    if (key === 'novapack_destinations') {
                        try { importedDestinations = JSON.parse(raw[key]); } catch (e) { }
                    }
                    if (key === 'novapack_provinces') {
                        try { importedProvinces = JSON.parse(raw[key]); } catch (e) { }
                    }
                    if (key === 'novapack_custom_sizes') {
                        try { importedSizes = JSON.parse(raw[key]); } catch (e) { }
                    }
                });
            }
            // Case B: Array (assume tickets for current company)
            else if (Array.isArray(raw)) {
                importedTickets = raw;
            }

            if (importedTickets.length === 0 && importedDestinations.length === 0 && importedProvinces.length === 0) {
                alert("No se encontraron albaranes o clientes válidos en el archivo.");
                return;
            }

            if (!confirm(`Se han detectado ${importedTickets.length} albaranes, ${importedDestinations.length} clientes y ${importedProvinces.length} zonas. ¿Deseas importarlos a la empresa actual(${companies.find(c => c.id === currentCompanyId).name}) ? `)) return;

            showLoading();

            // Import Tickets
            if (importedTickets.length > 0) {
                const ticketsCol = getCollection('tickets');
                for (let i = 0; i < importedTickets.length; i += 50) { // Batch chunks
                    const chunk = importedTickets.slice(i, i + 50);
                    const batch = db.batch();
                    chunk.forEach(t => {
                        if (!t.id) return;
                        // Map old date strings to ServerTimestamp or JS Date if needed, 
                        // but here we keep strings for historical consistency if that's what we have
                        if (t.createdAt && typeof t.createdAt === 'string') t.createdAt = new Date(t.createdAt);
                        if (t.updatedAt && typeof t.updatedAt === 'string') t.updatedAt = new Date(t.updatedAt);

                        batch.set(ticketsCol.doc(t.id), t);
                    });
                    await batch.commit();
                }
            }

            // Import Destinations
            if (importedDestinations.length > 0) {
                const destCol = db.collection('users').doc(currentUser.uid).collection('destinations');
                for (let i = 0; i < importedDestinations.length; i += 50) {
                    const chunk = importedDestinations.slice(i, i + 50);
                    const batch = db.batch();
                    chunk.forEach(d => {
                        if (!d.id) d.id = "cli_" + Date.now() + Math.random();
                        batch.set(destCol.doc(d.id), d);
                    });
                    await batch.commit();
                }
            }

            // Import Provinces & Sizes
            if (importedProvinces.length > 0) {
                const existingX = await getCustomData('provinces') || [];
                await saveCustomData('provinces', [...new Set([...existingX, ...importedProvinces])]);
            }
            if (importedSizes.length > 0) {
                const existingS = await getCustomData('custom_sizes') || [];
                await saveCustomData('custom_sizes', [...new Set([...existingS, ...importedSizes])]);
            }

            hideLoading();
            alert("✅ Importación completada con éxito.");
            location.reload();

        } catch (err) {
            hideLoading();
            alert("Error al procesar el archivo: " + err.message);
            console.error(err);
        }
    };
    reader.readAsText(file);
}

function handleExportCSV() {
    if (currentReportData.length === 0) { alert("No hay datos para exportar."); return; }
    let csv = "ID;FECHA;CLIENTE;ZONA;BULTOS;PESO;TIPO;PORTES;REEMBOLSO\n";
    currentReportData.forEach(t => {
        const d = (t.createdAt && t.createdAt.toDate) ? t.createdAt.toDate() : new Date(t.createdAt);
        const dStr = d.toLocaleDateString();
        const pkgCount = t.packagesList ? t.packagesList.reduce((s, p) => s + (parseInt(p.qty) || 1), 0) : 1;
        const weight = t.packagesList ? t.packagesList.reduce((s, p) => s + (parseFloat(p.weight) || 0), 0) : 0;
        csv += `${t.id};${dStr};${t.receiver};${t.province || ''};${pkgCount};${weight.toFixed(1)};${t.timeSlot || ''};${t.shippingType};${t.cod || ''} \n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `reporte_novapack_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
}

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
    if (!confirm(`¿Imprimir ${tickets.length} albaranes y Manifiesto ? `)) return;

    const area = document.getElementById('print-area');
    area.innerHTML = '';

    // Each ticket gets its own A4 page with 2 A5 copies (Cuartilla)
    tickets.forEach(t => {
        const page = document.createElement('div');
        page.style = "width: 210mm; height: 297mm; display: flex; flex-direction: column; background: white; margin: 0 auto; box-sizing: border-box; page-break-after: always;";
        page.innerHTML = generateTicketHTML(t, "Ejemplar para el Cliente");
        page.innerHTML += generateTicketHTML(t, "Ejemplar para Administración");
        area.appendChild(page);
        getCollection('tickets').doc(t.id).update({ printed: true });
    });

    area.innerHTML += generateManifestHTML(tickets);

    renderQRCodesInPrintArea();
    setTimeout(() => { window.print(); area.innerHTML = ''; }, 500);
}

// --- LABELS PRINTING ---
document.getElementById('btn-print-labels-morning').onclick = () => printLabelShiftBatch('MAÑANA');
document.getElementById('btn-print-labels-afternoon').onclick = () => printLabelShiftBatch('TARDE');

function generateLabelHTML(t, index, total) {
    const weight = t.packagesList ? (t.packagesList[index] ? t.packagesList[index].weight : (t.packagesList[0] ? t.packagesList[0].weight : 0)) : 0;
    return `
        <div class="label-item" style="width: 100mm; height: 140mm; border: 2px solid #000; padding: 10px; box-sizing: border-box; display: flex; flex-direction: column; background: white; color: black; position: relative; font-family: sans-serif; overflow: hidden;">
        <div style="display:flex; justify-content:space-between; border-bottom:3px solid #FF6600; padding-bottom:5px;">
            <div style="font-weight:900; font-size:1.6rem; color:#FF6600; letter-spacing: -1px;">NOVAPACK</div>
            <div style="text-align:right; font-size:0.65rem; line-height:1.1;">REMITENTE:<br /><strong style="font-size:0.8rem;">${t.sender}</strong></div>
        </div>
        <div style="flex:1; display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center;">
            <div style="font-size:0.75rem; color:#333; width:100%; text-align:left; font-weight:bold; text-transform:uppercase;">DESTINATARIO:</div>
            <div style="font-size:1.8rem; font-weight:900; text-transform:uppercase; margin:8px 0; line-height:1;">${t.receiver}</div>
            <div style="font-size:1.2rem; line-height:1.2; font-weight:500;">${t.address}</div>
            <div style="font-size:2.4rem; font-weight:900; color:#FF6600; margin-top:10px; border:2px solid #FF6600; padding:3px 15px; border-radius:8px;">${t.province || ''}</div>
            ${t.notes ? `<div style="font-size:0.9rem; font-weight:bold; margin-top:15px; border-top:1px dashed #000; padding-top:8px; width:100%;">OBS: ${t.notes}</div>` : ''}
        </div>
        <div style="position:absolute; bottom:80px; right:15px;" class="ticket-qr-code" data-id="${t.id}"></div>
        <div style="display:flex; justify-content:space-between; border-top:3px solid #000; padding-top:8px; margin-top:8px;">
            <div style="text-align:center; flex:1; border-right:2px solid #000;">
                <div style="font-size:0.6rem; text-transform:uppercase;">Bulto</div>
                <div style="font-size:1.3rem; font-weight:900;">${index + 1} / ${total}</div>
            </div>
            <div style="text-align:center; flex:2; display:flex; align-items:center; justify-content:center; font-size:1.2rem; font-weight:900; background:#eee; margin:0 8px;">${t.id}</div>
            <div style="text-align:center; flex:1; border-left:2px solid #000;">
                <div style="font-size:0.6rem; text-transform:uppercase;">Peso</div>
                <div style="font-size:1.3rem; font-weight:900;">${weight} kg</div>
            </div>
        </div>
        ${(t.cod && parseFloat(t.cod) > 0) ? `<div style="position:absolute; top:100px; right:5px; border:3px solid black; background:white; color:black; font-weight:900; padding:8px; transform:rotate(15deg); text-align:center; box-shadow: 4px 4px 0 #000; z-index:10;">ATENCIÓN<br />REEMBOLSO<br /><span style="font-size:1.5rem;">${t.cod} €</span></div>` : ''}
    </div>
        `;
}

async function printLabelShiftBatch(slot) {
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

    let labelsHtml = [];
    tickets.forEach(t => {
        const totalPkgs = t.packagesList ? t.packagesList.reduce((s, p) => s + (parseInt(p.qty) || 1), 0) : 1;
        for (let i = 0; i < totalPkgs; i++) labelsHtml.push(generateLabelHTML(t, i, totalPkgs));
    });

    renderLabelsInA4Grid(area, labelsHtml);
    renderQRCodesInPrintArea();
    document.body.classList.add('printing-labels');
    setTimeout(() => {
        window.print();
        area.innerHTML = '';
        document.body.classList.remove('printing-labels');
    }, 500);
}

function renderLabelsInA4Grid(container, labelsHtml) {
    let page = null;
    labelsHtml.forEach((html, i) => {
        if (i % 4 === 0) {
            page = document.createElement('div');
            page.style = "display:grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; width:210mm; height:297mm; page-break-after:always; box-sizing:border-box; padding:5mm; gap:5mm;";
            container.appendChild(page);
        }
        const wrapper = document.createElement('div');
        wrapper.style = "display:flex; justify-content:center; align-items:center;";
        wrapper.innerHTML = html;
        page.appendChild(wrapper);
    });
}

function printLabel(t) {
    const area = document.getElementById('print-area');
    area.innerHTML = '';
    const totalPkgs = t.packagesList ? t.packagesList.reduce((s, p) => s + (parseInt(p.qty) || 1), 0) : 1;
    let labelsHtml = [];
    for (let i = 0; i < totalPkgs; i++) labelsHtml.push(generateLabelHTML(t, i, totalPkgs));

    renderLabelsInA4Grid(area, labelsHtml);
    renderQRCodesInPrintArea();
    document.body.classList.add('printing-labels');
    setTimeout(() => {
        window.print();
        area.innerHTML = '';
        document.body.classList.remove('printing-labels');
    }, 500);
}

async function sendPickupSMS(t) {
    const comp = companies.find(c => c.id === currentCompanyId) || {};
    const smsGateway = comp.smsGateway || await getGlobalData('sms_gateway_url');
    if (!smsGateway) { alert("Configura la pasarela SMS en Ajustes de Empresa o Panel de Administración."); return; }

    const defaultMsg = `NOVAPACK - AVISO RECOGIDA: Hay envíos listos para ${t.receiver}.`;
    const msg = prompt("Confirmar Mensaje:", defaultMsg);
    if (!msg) return;

    // Use company-specific driver phone as default if available
    const driverPhone = comp.pickupAlertPhone || t.phone || "";
    const phone = prompt("Confirmar Teléfono del Repartidor/Cliente:", driverPhone);
    if (!phone) return;

    showLoading();
    const finalUrl = smsGateway.replace(/\{TELEFONO\}/gi, phone).replace(/\{MENSAJE\}/gi, encodeURIComponent(msg));

    fetch(finalUrl, { mode: 'no-cors' })
        .then(() => alert("✅ Petición SMS enviada."))
        .catch(e => alert("❌ Error SMS: " + e.message))
        .finally(hideLoading);
}

// --- QR SCANNER LOGIC ---
let html5QrCode = null;

async function startScanner() {
    const modal = document.getElementById('qr-scanner-modal');
    if (!modal) return;
    modal.style.display = 'flex';

    if (!html5QrCode) {
        html5QrCode = new Html5Qrcode("qr-reader");
    }

    const config = { fps: 10, qrbox: { width: 250, height: 250 } };

    try {
        await html5QrCode.start(
            { facingMode: "environment" },
            config,
            async (decodedText) => {
                console.log("QR Scanned:", decodedText);
                if (decodedText.startsWith("CLIENT_ID:")) {
                    const idNum = decodedText.split(":")[1];
                    await stopScanner();
                    setClientContext(idNum);
                } else {
                    alert("Código QR no reconocido como Cliente Novapack.");
                }
            }
        );
    } catch (err) {
        console.error("Scanner Error:", err);
        alert("No se pudo iniciar la cámara: " + err);
        modal.style.display = 'none';
    }
}

async function stopScanner() {
    if (html5QrCode) {
        try {
            await html5QrCode.stop();
        } catch (e) { console.warn(e); }
    }
    document.getElementById('qr-scanner-modal').style.display = 'none';
}

async function setClientContext(idNum) {
    showLoading();
    try {
        const snap = await db.collection('users').where('idNum', '==', idNum).get();
        if (snap.empty) { alert("ID de cliente no encontrado."); return; }

        const userDoc = snap.docs[0];
        const uData = userDoc.data();

        const compSnap = await db.collection('users').doc(userDoc.id).collection('companies').get();
        if (compSnap.empty) { alert("El cliente no tiene empresas configuradas."); return; }

        const cDoc = compSnap.docs[0];
        const cData = cDoc.data();

        targetContext = {
            uid: userDoc.id,
            compId: cDoc.id,
            idNum: idNum,
            name: uData.name,
            address: cData.address,
            phone: cData.phone
        };

        // UI updates
        const userDisplay = document.getElementById('user-display-name');
        if (userDisplay) {
            userDisplay.textContent = `🚩 [EXT: #${idNum}] ${uData.name}`;
            userDisplay.style.color = 'var(--brand-primary)';
        }

        // Auto-fill sender info
        document.getElementById('ticket-sender').value = uData.name;
        document.getElementById('ticket-sender-address').value = cData.address;
        document.getElementById('ticket-sender-phone').value = cData.phone;

        // Refresh with THIS client context
        initTicketListener();
        resetEditor();

    } catch (e) {
        console.error(e);
        alert("Error al cargar contexto de cliente.");
    } finally {
        hideLoading();
    }
}

// Global Exports
window.startScanner = startScanner;
window.stopScanner = stopScanner;

// Event Listeners for Scanner
if (document.getElementById('btn-scan-qr')) document.getElementById('btn-scan-qr').onclick = startScanner;
if (document.getElementById('btn-close-scanner')) document.getElementById('btn-close-scanner').onclick = stopScanner;

// --- UTILS ---
function showLoading() { document.getElementById('loading-overlay').style.display = 'flex'; }
function hideLoading() { document.getElementById('loading-overlay').style.display = 'none'; }
function showNotification(msg) { alert(msg); }
