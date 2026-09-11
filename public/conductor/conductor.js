// ============================================================
// NOVAPACK - Panel Conductor v1.0
// Standalone driver panel for viewing routes and printing tickets
// ============================================================

// --- Utility ---
function escapeHtml(str) {
    if (str == null) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

// QR local con qrcode.min.js (sin dependencia externa). Fallback al API
// externo si la lib no está disponible por alguna razón.
function _conductorQrUrl(data, fallbackSize) {
    fallbackSize = fallbackSize || 400;
    try {
        if (typeof qrcode !== 'undefined') {
            var qr = qrcode(0, 'M');
            qr.addData(data);
            qr.make();
            return qr.createDataURL(4, 0);
        }
    } catch (e) {
        console.warn('[conductor] QR local fail, fallback API:', e.message);
    }
    return 'https://api.qrserver.com/v1/create-qr-code/?size=' + fallbackSize + 'x' + fallbackSize + '&data=' + encodeURIComponent(data);
}

// El renderizador compartido (albaran_render.js) pide este generador de QR.
// El del conductor ya existe y hace lo mismo: lo prestamos.
window.npGenerateQrUrl = window.npGenerateQrUrl || _conductorQrUrl;

// Formato del albarán: FUENTE ÚNICA en albaran_render.js. Antes había aquí
// una copia con el formato viejo de 110mm, distinto al de la app de cliente.
const generateTicketHTML = window.npGenerateTicketHTML;

// --- State ---
let allRoutes = [];          // { id, label, number, driverName }
let routeTickets = {};       // routeId -> [ticket, ...]
let routeUnsubs = [];        // Firestore unsubscribe functions
let currentRouteId = null;

// --- PIN Login ---
(function initPinInputs() {
    const digits = document.querySelectorAll('.pin-digit');
    digits.forEach((input, i) => {
        input.addEventListener('input', () => {
            input.value = input.value.replace(/\D/g, '');
            if (input.value && i < digits.length - 1) digits[i + 1].focus();
            // Auto-submit when all 4 filled
            const pin = Array.from(digits).map(d => d.value).join('');
            if (pin.length === 4) verifyPin(pin);
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !input.value && i > 0) digits[i - 1].focus();
        });
    });
})();

async function verifyPin(pin) {
    const errorEl = document.getElementById('pin-error');
    errorEl.textContent = '';
    try {
        const configDoc = await db.collection('config').doc('phones').get();
        const data = configDoc.exists ? configDoc.data() : {};
        const conductorPin = data.conductorPin || '';

        if (!conductorPin || pin !== conductorPin) {
            errorEl.textContent = 'PIN incorrecto';
            document.querySelectorAll('.pin-digit').forEach(d => { d.value = ''; });
            document.querySelector('.pin-digit').focus();
            return;
        }

        // Anonymous auth so Firestore rules (request.auth != null) allow ticket reads
        try {
            await auth.signInAnonymously();
            console.log('[CONDUCTOR] Anonymous auth OK');
        } catch (authErr) {
            console.error('[CONDUCTOR] Anonymous auth failed:', authErr);
            errorEl.textContent = 'Error de autenticación';
            return;
        }

        sessionStorage.setItem('conductor_auth', '1');
        showApp();
    } catch (e) {
        console.error('PIN verification error:', e);
        errorEl.textContent = 'Error de conexión';
    }
}

// --- Session ---
function showApp() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app-screen').style.display = 'block';
    loadRoutes();
}

function logout() {
    sessionStorage.removeItem('conductor_auth');
    // Cleanup listeners
    routeUnsubs.forEach(fn => fn());
    routeUnsubs = [];
    allRoutes = [];
    routeTickets = {};
    currentRouteId = null;

    auth.signOut().catch(() => {});

    document.getElementById('app-screen').style.display = 'none';
    document.getElementById('login-screen').style.display = 'flex';
    document.querySelectorAll('.pin-digit').forEach(d => { d.value = ''; });
    document.querySelector('.pin-digit').focus();
}

// Resume session — re-auth anonymously if needed
if (sessionStorage.getItem('conductor_auth') === '1') {
    if (auth.currentUser) {
        showApp();
    } else {
        auth.signInAnonymously().then(() => {
            console.log('[CONDUCTOR] Session resumed with anonymous auth');
            showApp();
        }).catch(() => {
            sessionStorage.removeItem('conductor_auth');
            console.warn('[CONDUCTOR] Could not resume session');
        });
    }
}

// --- Load Routes ---
async function loadRoutes() {
    try {
        const snap = await db.collection('config').doc('phones').collection('list').get();
        allRoutes = [];
        snap.forEach(doc => {
            const d = doc.data();
            allRoutes.push({ id: doc.id, label: d.label || '', number: d.number || '', driverName: d.driverName || '' });
        });

        if (allRoutes.length === 0) {
            document.getElementById('route-grid').innerHTML = `
                <div class="empty-state">
                    <span class="material-symbols-outlined">info</span>
                    No hay rutas configuradas
                </div>`;
            return;
        }

        // Initialize ticket arrays
        allRoutes.forEach(r => { routeTickets[r.id] = []; });

        // Render empty cards first
        renderRouteGrid();

        // Attach real-time listeners for each route
        allRoutes.forEach(route => {
            if (!route.number) return;
            const unsub = db.collection('tickets')
                .where('driverPhone', '==', route.number)
                .onSnapshot(ticketsSnap => {
                    const tickets = [];
                    ticketsSnap.forEach(tDoc => {
                        tickets.push({ docId: tDoc.id, id: tDoc.id, ...tDoc.data() });
                    });
                    routeTickets[route.id] = tickets;
                    renderRouteCard(route.id);
                    // If viewing this route's detail, update it too
                    if (currentRouteId === route.id) renderTicketList(route.id);
                });
            routeUnsubs.push(unsub);
        });

    } catch (e) {
        console.error('Error loading routes:', e);
        document.getElementById('route-grid').innerHTML = `
            <div class="empty-state">
                <span class="material-symbols-outlined">error</span>
                Error cargando rutas
            </div>`;
    }
}

// --- Render Route Grid ---
function renderRouteGrid() {
    const grid = document.getElementById('route-grid');
    grid.innerHTML = '';
    allRoutes.forEach(route => {
        const card = document.createElement('div');
        card.className = 'route-card';
        card.id = `route-card-${route.id}`;
        card.onclick = () => openRouteDetail(route.id);
        card.innerHTML = buildRouteCardHTML(route, routeTickets[route.id] || []);
        grid.appendChild(card);
    });
}

function renderRouteCard(routeId) {
    const card = document.getElementById(`route-card-${routeId}`);
    if (!card) return;
    const route = allRoutes.find(r => r.id === routeId);
    if (!route) return;
    card.innerHTML = buildRouteCardHTML(route, routeTickets[routeId] || []);
}

function buildRouteCardHTML(route, tickets) {
    const total = tickets.length;
    const delivered = tickets.filter(t => t.status === 'Entregado').length;
    const pending = tickets.filter(t => !t.status || t.status === 'Pendiente' || t.status === 'En reparto').length;
    const incidents = tickets.filter(t => t.status === 'Incidencia').length;
    const totalBultos = tickets.reduce((sum, t) => {
        if (t.packagesList && t.packagesList.length > 0) {
            return sum + t.packagesList.reduce((s, p) => s + (parseInt(p.qty) || 1), 0);
        }
        return sum + (parseInt(t.packages) || 1);
    }, 0);
    const pct = total > 0 ? Math.round((delivered / total) * 100) : 0;

    return `
        <div class="route-card-header">
            <div class="route-card-icon"><span class="material-symbols-outlined">local_shipping</span></div>
            <div>
                <div class="route-card-name">${escapeHtml(route.label)}</div>
                <div class="route-card-driver">${escapeHtml(route.driverName || route.number)}</div>
            </div>
        </div>
        <div class="route-card-stats">
            <div class="stat"><div class="stat-num">${totalBultos}</div><div class="stat-label">Bultos</div></div>
            <div class="stat"><div class="stat-num" style="color:var(--yellow)">${pending}</div><div class="stat-label">Pendientes</div></div>
            <div class="stat"><div class="stat-num" style="color:var(--green)">${delivered}</div><div class="stat-label">Entregados</div></div>
            <div class="stat"><div class="stat-num" style="color:var(--red)">${incidents}</div><div class="stat-label">Incidencias</div></div>
        </div>
        <div class="progress-bar"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
    `;
}

// --- Route Detail ---
function openRouteDetail(routeId) {
    currentRouteId = routeId;
    const route = allRoutes.find(r => r.id === routeId);
    if (!route) return;

    document.getElementById('detail-title').textContent = `Ruta: ${route.label}`;
    document.getElementById('detail-driver').textContent = route.driverName ? `Conductor: ${route.driverName}` : route.number;
    document.getElementById('route-list').style.display = 'none';
    document.getElementById('route-detail').style.display = 'block';

    renderTicketList(routeId);
}

function showRouteList() {
    currentRouteId = null;
    document.getElementById('route-detail').style.display = 'none';
    document.getElementById('route-list').style.display = 'block';
}

function renderTicketList(routeId) {
    const container = document.getElementById('ticket-list');
    const tickets = routeTickets[routeId] || [];

    if (tickets.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <span class="material-symbols-outlined">inventory_2</span>
                No hay albaranes en esta ruta
            </div>`;
        return;
    }

    container.innerHTML = '';
    tickets.forEach(t => {
        const statusClass = t.status === 'Entregado' ? 'status-delivered'
            : (t.status === 'Incidencia' ? 'status-incident' : 'status-pending');
        const statusText = t.status || 'Pendiente';
        const bultos = t.packagesList ? t.packagesList.reduce((s, p) => s + (parseInt(p.qty) || 1), 0) : (parseInt(t.packages) || 1);

        const row = document.createElement('div');
        row.className = 'ticket-row';
        row.innerHTML = `
            <div class="ticket-id">${escapeHtml(t.id)}</div>
            <div class="ticket-receiver">
                <div class="ticket-receiver-name">${escapeHtml(t.receiver || 'Sin destinatario')}</div>
                <div class="ticket-receiver-addr">${escapeHtml(t.address || '')}</div>
            </div>
            ${t.province ? `<span class="ticket-province">${escapeHtml(t.province)}</span>` : ''}
            <span class="ticket-status ${statusClass}">${escapeHtml(statusText)}</span>
            <span class="ticket-bultos">${bultos} bto${bultos !== 1 ? 's' : ''}</span>
            <button class="btn-print" onclick="event.stopPropagation(); printSingleTicket('${route_esc(routeId)}', '${escapeHtml(t.docId)}')">
                <span class="material-symbols-outlined" style="font-size:1rem;">print</span> Imprimir
            </button>
        `;
        container.appendChild(row);
    });
}

function route_esc(s) { return String(s).replace(/'/g, "\\'"); }

// --- Ticket Print HTML (ported from firebase-app.js) ---

// --- Print Functions ---
function printSingleTicket(routeId, docId) {
    // Misma CSS de impresión forzada que la app de cliente y el admin.
    window.npSetPrintPageSize('A4 portrait');
    const tickets = routeTickets[routeId] || [];
    const t = tickets.find(tk => tk.docId === docId);
    if (!t) { alert('Albarán no encontrado'); return; }

    const area = document.getElementById('print-area');
    area.innerHTML = '';

    const page = document.createElement('div');
    page.style = "width: 210mm; height: 297mm; display: flex; flex-direction: column; background: white; margin: 0 auto; box-sizing: border-box;";

    page.innerHTML = `
        <div style="flex: 1; width: 100%; box-sizing: border-box; padding: 8mm 10mm; display: flex; flex-direction: column; justify-content: center; align-items: center; border-bottom: 2px dashed #bbb;">
            ${generateTicketHTML(t, "Ejemplar para Administración")}
        </div>
        <div style="flex: 1; width: 100%; box-sizing: border-box; padding: 8mm 10mm; display: flex; flex-direction: column; justify-content: center; align-items: center;">
            ${generateTicketHTML(t, "Ejemplar para el Cliente")}
        </div>`;

    area.appendChild(page);

    // Mark as printed in DB
    db.collection('tickets').doc(t.docId).update({ printed: true }).catch(e => console.error('Error marking printed:', e));

    setTimeout(() => window.print(), 300);
}

function printAllTickets() {
    window.npSetPrintPageSize('A4 portrait');
    if (!currentRouteId) return;
    const tickets = routeTickets[currentRouteId] || [];
    if (tickets.length === 0) { alert('No hay albaranes para imprimir'); return; }

    const area = document.getElementById('print-area');
    area.innerHTML = '';

    tickets.forEach(t => {
        const page = document.createElement('div');
        page.style = "width: 210mm; height: 297mm; display: flex; flex-direction: column; background: white; margin: 0 auto; box-sizing: border-box; page-break-after: always;";

        page.innerHTML = `
            <div style="flex: 1; width: 100%; box-sizing: border-box; padding: 8mm 10mm; display: flex; flex-direction: column; justify-content: center; align-items: center; border-bottom: 2px dashed #bbb;">
                ${generateTicketHTML(t, "Ejemplar para Administración")}
            </div>
            <div style="flex: 1; width: 100%; box-sizing: border-box; padding: 8mm 10mm; display: flex; flex-direction: column; justify-content: center; align-items: center;">
                ${generateTicketHTML(t, "Ejemplar para el Cliente")}
            </div>`;

        area.appendChild(page);

        // Mark as printed
        db.collection('tickets').doc(t.docId).update({ printed: true }).catch(e => console.error('Error marking printed:', e));
    });

    setTimeout(() => window.print(), 300);
}
