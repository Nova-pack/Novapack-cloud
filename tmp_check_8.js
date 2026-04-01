
            // --- MISSING GLOBAL VARIABLES DECLARATION ---
            let adminHtml5QrCode = null;
            let unbilledTickets = [];

            // --- GLOBAL ERROR HANDLING & STATE ---
            window.onerror = (e) => {
                console.error("Global ERP Error:", e);
                if (typeof hideLoading === 'function') hideLoading();
            };

            // NEW: Robust Global Logout
            window.logout = () => {
                if (confirm("¿Cerrar sesión en Novapack Cloud?")) {
                    if (typeof showLoading === 'function') showLoading();
                    firebase.auth().signOut().then(() => {
                        window.location.href = 'index.html';
                    }).catch(e => {
                        console.error("Logout Error:", e);
                        window.location.href = 'index.html'; // Force redirect
                    });
                }
            };

            // Safety timeout for loading overlay (max 8s)
            setTimeout(() => { if (typeof hideLoading === 'function') hideLoading(); }, 8000);

            let userMap = {}; window.userMap = userMap;
            let reportsData = [];
            let tariffsCache = {};
            let userCompaniesMap = {};
            let adminManPackages = [];
            let adminTicketUID = null;
            let adminTicketCompID = null;
            let currentAdminTargetUid = null;
            let invCompanyData = {};
            let adminDestinationsCache = [];

            // Paginación Global
            let adminTicketsPage = 1;
            let adminTicketsLimit = 30;
            let adminTicketsCursors = [];

            let invoicesPage = 1;
            let invoicesLimit = 20;
            let invoicesCursors = [];
            let lastInvoiceSnapshot = null;

            let usersPage = 1;
            let usersLimit = 50;
            let usersCursors = [];
            let lastUserSnapshot = null;
            let adminTicketsListener = null;

            const userTableBody = document.getElementById('user-table-body');
            const addUserModal = document.getElementById('add-user-modal');
            const btnAddUser = document.getElementById('btn-add-user');
            const btnCloseModal = document.getElementById('btn-close-modal');
            const addUserForm = document.getElementById('add-user-form');
            let phoneTableBody = null; // Initialized below
            let adminCompaniesCache = {};
            let adminCompanyTickets = [];

            // Helper for global collection logic (Option A)
            function getCollection(name) {
                if (name === 'tickets' || name === 'invoices') return db.collection(name);
                const uid = adminTicketUID || (auth.currentUser ? auth.currentUser.uid : null);
                if (!uid) return null;
                return db.collection('users').doc(uid).collection(name);
            }

            // --- CUSTOM STORAGE HELPERS (FOR PROVINCES ETC) ---
            async function getCustomData(key) {
                const user = auth.currentUser;
                if (!user) return null;
                try {
                    const doc = await db.collection('users').doc(user.uid).collection('config').doc('settings').get();
                    return doc.exists ? doc.data()[key] : null;
                } catch (e) {
                    console.warn("Error getting custom data:", e);
                    return null;
                }
            }

            async function saveCustomData(key, value) {
                const user = auth.currentUser;
                if (!user) return;
                try {
                    await db.collection('users').doc(user.uid).collection('config').doc('settings').set({ [key]: value }, { merge: true });
                } catch (e) {
                    console.error("Error saving custom data:", e);
                }
            }

            // QR Generation Helper
            function generateQRCode(text, size = 512) {
                try {
                    if (typeof QRious === 'undefined') {
                        console.warn("QRious library not loaded");
                        return "";
                    }
                    const qr = new QRious({
                        value: text,
                        size: size,
                        level: 'H', // High error correction is better for printing
                        padding: 2
                    });
                    return qr.toDataURL('image/png');
                } catch (e) {
                    console.error("QR Generation error:", e);
                    return "";
                }
            }

            // Navigation Elements (Top Bar)
            const viewUsers = document.getElementById('view-users');
            const viewReports = document.getElementById('view-reports');
            const viewTariffs = document.getElementById('view-tariffs');
            const viewPhones = document.getElementById('nav-phones'); // Placeholder for view logic consistency
            const viewConfig = document.getElementById('view-config');
            const viewBilling = document.getElementById('view-billing');
            const viewAdminTickets = document.getElementById('view-admin-tickets');
            const viewArticles = document.getElementById('view-articles');
            const viewCreditNotes = document.getElementById('view-credit-notes');
            const viewCreditNotesList = document.getElementById('view-credit-notes-list');

            console.log("NOVAPACK ADMIN CONSOLE - ERP v2.0 ACTIVE");

            // Mobile Sidebar Toggle
            window.toggleSidebar = () => {
                const sidebar = document.getElementById('sidebar');
                if (sidebar) sidebar.classList.toggle('mobile-active');
            };

            // --- CP AUTOCOMPLETE LOGIC ---
            document.getElementById('admin-t-cp').addEventListener('input', async (e) => {
                const cp = e.target.value.trim();
                if(cp.length === 5 && !isNaN(cp)) {
                    try {
                        const res = await fetch(`https://api.zippopotam.us/es/${cp}`);
                        if(res.ok) {
                            const data = await res.json();
                            const place = data.places[0];
                            // Populate province field: "Localidad, Provincia"
                            document.getElementById('admin-t-locality').value = `${place['place name']}`;
                            document.getElementById('admin-t-province').value = `${place['state']}`;
                            // Fire a custom event or highlight field to show it worked
                            document.getElementById('admin-t-locality').style.borderColor = "var(--success)";
                            document.getElementById('admin-t-province').style.borderColor = "var(--success)";
                            setTimeout(() => {
                                document.getElementById('admin-t-locality').style.borderColor = "";
                                document.getElementById('admin-t-province').style.borderColor = "";
                            }, 2000);
                        }
                    } catch(err) { console.log("CP autofill API error", err); }
                }
            });

            // Switching Views (Enhanced v3.0)
            window.showView = (viewId) => {
                // 1. Update Sidebar Active State
                document.querySelectorAll('.nav-item').forEach(item => {
                    const onclickStr = item.getAttribute('onclick') || "";
                    if (onclickStr.includes(`'${viewId}'`)) {
                        item.classList.add('active');
                    } else {
                        item.classList.remove('active');
                    }
                });

                // 2. Hide Mobile Sidebar on navigation
                if (window.innerWidth <= 992) {
                    const sidebar = document.getElementById('sidebar');
                    if (sidebar) sidebar.classList.remove('mobile-active');
                }

                // 3. Toggle Visibility
                const views = ['welcome', 'pending-deletes', 'route-monitor', 'users', 'reports', 'tariffs', 'phones', 'config', 'billing', 'adv-billing', 'admin-tickets', 'tax-models', 'articles', 'credit-notes', 'credit-notes-list', 'qr-scanner-view', 'maintenance'];
                views.forEach(v => {
                    const el = document.getElementById('view-' + v);
                    if (el) el.style.display = (v === viewId) ? 'block' : 'none';
                });

                // 4. Component Initializations
                if (viewId === 'pending-deletes') loadPendingDeletions();
                if (viewId === 'config') loadConfigInfo();
                if (viewId === 'route-monitor') loadRouteMonitor();
                if (viewId === 'phones') loadPhones();
                if (viewId === 'reports') initReportsView();
                if (viewId === 'tariffs') loadTariffClients();
                if (viewId === 'billing') initBillingView();
                if (viewId === 'admin-tickets') initAdminTicketsView();
                if (viewId === 'tax-models') initTaxModelsView();
                if (viewId === 'articles') initArticlesView();
                if (viewId === 'credit-notes') initCreditNotesView();
                if (viewId === 'credit-notes-list') initCreditNotesListView();
                if (viewId === 'maintenance') initMaintenanceView();

                if (viewId === 'qr-scanner-view') {
                    setTimeout(() => { if (typeof startAdminScanner === 'function') startAdminScanner(); }, 200);
                } else {
                    if (typeof stopAdminScanner === 'function') stopAdminScanner();
                }

                // 5. UX: Scroll to Top
                setTimeout(() => window.scrollTo(0, 0), 100);
            };

            // --- ARTICLES MASTER LOGIC ---
            let articlesMaster = [];
            async function initArticlesView() {
                const tbody = document.getElementById('articles-master-body');
                tbody.innerHTML = '<tr><td colspan="4">Cargando catálogo...</td></tr>';
                try {
                    const snap = await db.collection('articles').get();
                    tbody.innerHTML = '';
                    articlesMaster = [];
                    snap.forEach(doc => {
                        const data = doc.data();
                        articlesMaster.push({ id: doc.id, ...data });
                    });
                    renderArticlesTable(articlesMaster);
                } catch (e) { console.error(e); }
            }

            function renderArticlesTable(articles) {
                const tbody = document.getElementById('articles-master-body');
                tbody.innerHTML = '';
                articles.forEach(data => {
                    const row = document.createElement('tr');
                    row.className = 'user-row';
                    row.innerHTML = `
                    <td style="font-weight:700">${data.name}</td>
                    <td style="color:#888">${data.description || '-'}</td>
                    <td style="color:var(--brand-primary); font-weight:bold;">${data.basePrice ? data.basePrice.toFixed(2) + '€' : '-'}</td>
                    <td>
                        <div style="display:flex; gap:5px;">
                            <button class="btn btn-outline btn-sm" onclick="editArticle('${data.id}')">✏️</button>
                            <button class="btn btn-outline btn-sm" onclick="deleteArticle('${data.id}')">🗑️</button>
                        </div>
                    </td>
                `;
                    tbody.appendChild(row);
                });
            }

            window.filterArticles = (val) => {
                const f = val.toLowerCase();
                const filtered = articlesMaster.filter(a =>
                    (a.name || '').toLowerCase().includes(f) ||
                    (a.description || '').toLowerCase().includes(f)
                );
                renderArticlesTable(filtered);
            };

            window.editArticle = (id) => {
                const art = articlesMaster.find(a => a.id === id);
                if (!art) return;
                document.getElementById('article-modal-title').textContent = "Editar Artículo";
                document.getElementById('article-id').value = art.id;
                document.getElementById('article-name').value = art.name;
                document.getElementById('article-desc').value = art.description || "";
                document.getElementById('article-price').value = art.basePrice || 0;
                document.getElementById('modal-article').style.display = 'flex';
                window.scrollTo(0, 0);
                document.getElementById('modal-article').scrollTop = 0;
            };

            window.openNewArticleModal = () => {
                document.getElementById('article-modal-title').textContent = "Añadir Artículo Master";
                document.getElementById('article-id').value = "";
                document.getElementById('article-form').reset();
                document.getElementById('modal-article').style.display = 'flex';
                window.scrollTo(0, 0);
                document.getElementById('modal-article').scrollTop = 0;
            };

            var el = document.getElementById('article-form'); if (el) el.onsubmit = async (e) => {
                e.preventDefault();
                const id = document.getElementById('article-id').value;
                const data = {
                    name: document.getElementById('article-name').value.trim(),
                    description: document.getElementById('article-desc').value.trim(),
                    basePrice: parseFloat(document.getElementById('article-price').value) || 0,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                };

                try {
                    if (id) {
                        await db.collection('articles').doc(id).update(data);
                    } else {
                        data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                        await db.collection('articles').add(data);
                    }
                    document.getElementById('modal-article').style.display = 'none';
                    initArticlesView();
                } catch (e) { alert("Error al guardar artículo."); }
            };

            window.deleteArticle = async (id) => {
                if (confirm("¿Eliminar este artículo del catálogo maestro?")) {
                    await db.collection('articles').doc(id).delete();
                    initArticlesView();
                }
            };

            // --- CREDIT NOTES (ABONOS) LOGIC ---
            let currentAbonoLines = [];
            function initCreditNotesView() {
                const select = document.getElementById('abono-client-select');
                select.innerHTML = '<option value="">-- Seleccione Cliente --</option>';
                document.getElementById('abono-company-select').innerHTML = '<option value="">-- Elija Master Primero --</option>';
                Object.keys(userMap).forEach(uid => {
                    const u = userMap[uid];
                    const opt = document.createElement('option');
                    opt.value = uid;
                    opt.textContent = `[#${u.idNum || '?'}] ${u.name}`;
                    select.appendChild(opt);
                });
                document.getElementById('abono-form-area').style.display = 'none';
                currentAbonoLines = [];
                renderAbonoLines();
            }

            window.filterAbonoClients = () => {
                const val = document.getElementById('abono-client-search').value.toLowerCase();
                const select = document.getElementById('abono-client-select');
                select.innerHTML = '<option value="">-- Seleccione Cliente --</option>';
                Object.keys(userMap).forEach(uid => {
                    const u = userMap[uid];
                    if (u.name.toLowerCase().includes(val) || (u.idNum || "").includes(val)) {
                        const opt = document.createElement('option');
                        opt.value = uid;
                        opt.textContent = `[#${u.idNum || '?'}] ${u.name}`;
                        select.appendChild(opt);
                    }
                });
            };

            window.populateAbonoCompanySelect = async (uid) => {
                const select = document.getElementById('abono-company-select');
                document.getElementById('abono-form-area').style.display = 'none';

                if (!uid) {
                    select.innerHTML = '<option value="">-- Elija Master Primero --</option>';
                    return;
                }

                select.innerHTML = '<option value="">Buscando filiales...</option>';
                try {
                    const aliases = await getClientDocAliases(uid);
                    let snap = null;
                    
                    for (const id of aliases) {
                        const s = await db.collection('users').doc(id).collection('companies').get();
                        if (!s.empty) {
                            snap = s;
                            break;
                        }
                    }

                    if (!snap || snap.empty) {
                        select.innerHTML = '<option value="comp_main">🏠 Empresa Principal</option>';
                        select.value = "comp_main";
                    } else {
                        let html = '';
                        let firstId = "";
                        snap.forEach(doc => {
                            const data = doc.data();
                            html += `<option value="${doc.id}">${data.name || 'Empresa sin nombre'}</option>`;
                            if (!firstId) firstId = doc.id;
                        });
                        select.innerHTML = html;
                        select.value = firstId;
                    }
                    loadAbonoForm();
                } catch (e) {
                    console.error("Error cargando filiales para abono:", e);
                    select.innerHTML = '<option value="comp_main">🏠 Empresa Principal</option>';
                    select.value = "comp_main";
                    loadAbonoForm();
                }
            };

            window.loadAbonoForm = () => {
                const uid = document.getElementById('abono-client-select').value;
                const compId = document.getElementById('abono-company-select').value;
                if (uid && compId) document.getElementById('abono-form-area').style.display = 'block';
            };

            window.addAbonoLine = () => {
                const name = document.getElementById('abono-item-name').value;
                const price = parseFloat(document.getElementById('abono-item-price').value);
                const iva = parseFloat(document.getElementById('abono-item-iva').value);
                if (!name) { alert("Ingrese el concepto del abono."); return; }
                if (isNaN(price) || price <= 0) { alert("Ingrese un importe base válido."); return; }

                currentAbonoLines.push({ name, base: price, iva, total: price * (1 + iva / 100) });
                renderAbonoLines();
                document.getElementById('abono-item-name').value = '';
                document.getElementById('abono-item-price').value = '';
            };

            function renderAbonoLines() {
                const tbody = document.getElementById('abono-lines-body');
                tbody.innerHTML = '';
                currentAbonoLines.forEach((l, idx) => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                    <td>${l.name}</td>
                    <td style="color:#ff4444">- ${l.base.toFixed(2)}€</td>
                    <td>${l.iva}%</td>
                    <td style="font-weight:bold; color:#ff4444">- ${l.total.toFixed(2)}€</td>
                    <td><button class="btn btn-outline btn-sm" onclick="removeAbonoLine(${idx})">❌</button></td>
                `;
                    tbody.appendChild(row);
                });
            }

            window.removeAbonoLine = (idx) => {
                currentAbonoLines.splice(idx, 1);
                renderAbonoLines();
            };

            window.openUserSpecialTariff = (uid) => {
                showView('tariffs');
                document.getElementById('tariff-client-select').value = uid;
                document.getElementById('btn-load-tariff').click();
            };

            window.saveAbonoTicket = async () => {
                const uid = document.getElementById('abono-client-select').value;
                const reason = document.getElementById('abono-reason').value;
                if (!uid) { alert("Seleccione un cliente para el abono."); return; }
                if (currentAbonoLines.length === 0) { alert("Añada líneas al abono para continuar."); return; }

                if (!confirm("¿Desea generar esta factura de abono? Los importes se guardarán en negativo.")) return;

                showLoading();
                try {
                    const nextId = "ABO-" + Date.now();
                    const totalBase = currentAbonoLines.reduce((s, l) => s + l.base, 0) * -1;
                    const totalFull = currentAbonoLines.reduce((s, l) => s + l.total, 0) * -1;

                    const compId = document.getElementById('abono-company-select').value || 'comp_main';
                    const abonoData = {
                        id: nextId,
                        uid: uid,
                        compId: compId,
                        type: 'abono',
                        receiver: 'ABONO CLIENTE: ' + (userMap[uid]?.name || ''),
                        reason: reason,
                        lines: currentAbonoLines,
                        totalBase: totalBase,
                        total: totalFull,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                        adminCreated: true
                    };

                    await db.collection('tickets').doc(uid + "_abono_" + nextId).set(abonoData);
                    alert("✅ Factura de Abono Generada con éxito.");
                    
                    // Reset Form
                    currentAbonoLines = [];
                    renderAbonoLines();
                    document.getElementById('abono-reason').value = '';

                    // Volver a la misma pantalla y recargar la lista
                    showView('billing');
                    if(typeof switchBillingTab === 'function') switchBillingTab('credit');
                } catch (e) { alert("Error al generar abono: " + e.message); }
                hideLoading();
            };

            async function initCreditNotesListView() {
                const tbody = document.getElementById('credit-notes-list-body');
                tbody.innerHTML = '<tr><td colspan="6">Cargando libro de abonos...</td></tr>';
                try {
                    // Using collectionGroup to find all abonos across all client-specific collections if they were nested, 
                    // but since I'm saving them in 'tickets' root for abonos:
                    const snap = await db.collection('tickets').where('type', '==', 'abono').get();
                    tbody.innerHTML = '';
                    if (snap.empty) {
                        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:#888;">No se han emitido facturas de abono todavía.</td></tr>';
                        return;
                    }
                    snap.forEach(doc => {
                        const data = doc.data();
                        const date = (data.createdAt && data.createdAt.toDate) ? data.createdAt.toDate().toLocaleDateString() : 'N/A';
                        const row = document.createElement('tr');
                        row.className = 'user-row';
                        row.innerHTML = `
                        <td style="font-weight:700; color:var(--brand-primary)">${data.id}</td>
                        <td>${date}</td>
                        <td style="font-weight:700">${data.receiver.replace('ABONO CLIENTE: ', '')}</td>
                        <td style="font-size:0.8rem; color:#aaa">${data.reason || '-'}</td>
                        <td style="color:#ff4d4d; font-weight:bold;">${data.total ? data.total.toFixed(2) : '0.00'}€</td>
                        <td>
                             <button class="btn btn-outline btn-sm" onclick="printTicketFromAdmin('${data.uid}', '${data.compId}', '${doc.id}')" title="Imprimir Comprobante">🖨️</button>
                        </td>
                    `;
                        tbody.appendChild(row);
                    });
                } catch (e) {
                    console.error(e);
                    tbody.innerHTML = '<tr><td colspan="6" style="color:#ff4444">Error al cargar datos.</td></tr>';
                }
            }



            async function loadConfigInfo() {
                if (!auth.currentUser) return;
                const elUid = document.getElementById('conf-admin-uid');
                const elProj = document.getElementById('conf-project-id');
                if (elUid) elUid.textContent = auth.currentUser.uid;
                if (elProj) elProj.textContent = firebaseConfig.projectId;

                try {
                    const settingsDoc = await db.collection('config').doc('settings').get();
                    if (settingsDoc.exists) {
                        const data = settingsDoc.data();

                    }
                } catch (e) { console.error(e); }
            }



            // WORKER: Borrado efectivo de datos operativos (sin prompts)
            async function _doWipeOperationalData() {
                console.log("[Maintenance] Iniciando borrado masivo...");

                // 1. Borrar todos los albaranes (Tickets) - Colección Global
                const ticketsSnap = await db.collection('tickets').get();
                console.log(`[Maintenance] Eliminando ${ticketsSnap.size} albaranes...`);
                let batch = db.batch();
                let count = 0;

                for (const doc of ticketsSnap.docs) {
                    batch.delete(doc.ref);
                    count++;
                    if (count >= 400) { // Límite de batch de Firebase (500)
                        await batch.commit();
                        batch = db.batch();
                        count = 0;
                    }
                }
                await batch.commit();

                // 2. Borrar todas las facturas
                const invoicesSnap = await db.collection('invoices').get();
                console.log(`[Maintenance] Eliminando ${invoicesSnap.size} facturas...`);
                batch = db.batch();
                count = 0;
                for (const doc of invoicesSnap.docs) {
                    batch.delete(doc.ref);
                    count++;
                    if (count >= 400) {
                        await batch.commit();
                        batch = db.batch();
                        count = 0;
                    }
                }
                await batch.commit();

                // 3. Resetear contadores de empresa
                const companiesSnap = await db.collectionGroup('companies').get();
                batch = db.batch();
                count = 0;
                for (const doc of companiesSnap.docs) {
                    batch.update(doc.ref, { startNum: 1 });
                    count++;
                    if (count >= 400) {
                        await batch.commit();
                        batch = db.batch();
                        count = 0;
                    }
                }
                await batch.commit();
            }

            // FUNCIÓN DE RESET TOTAL DE DATOS OPERATIVOS
            window.wipeAllOperationalData = async () => {
                const p1 = confirm("⚠️ ATENCIÓN: Vas a borrar TODOS los albaranes y facturas de la base de datos.\n\n¿Estás completamente seguro?");
                if (!p1) return;

                const p2 = confirm("ESTA ACCIÓN NO SE PUEDE DESHACER.\nLos contadores de facturas y albaranes volverán a empezar desde el número 1.\n\n¿Deseas continuar?");
                if (!p2) return;

                const code = prompt("Escribe 'BORRAR TODO' para confirmar definitivamente:");
                if (code !== 'BORRAR TODO') {
                    alert("Confirmación incorrecta. Acción cancelada.");
                    return;
                }

                showLoading();
                try {
                    await _doWipeOperationalData();
                    alert("✅ Datos operativos borrados. Los contadores han vuelto a 1.");
                } catch (e) {
                    console.error(e);
                    alert("Error durante la limpieza.");
                } finally {
                    hideLoading();
                }
            };

            window.fullAppReset = async () => {
                const p1 = confirm("🚨 RESET TOTAL DE LA APLICACIÓN 🚨\n\nEsto borrará:\n- TODOS los Clientes (excepto tú)\n- TODAS las Tarifas\n- TODOS los Albaranes y Facturas\n- TODA la configuración\n\n¿Estás SEGURO?");
                if (!p1) return;

                const code = prompt("Escribe 'DESTROY' para confirmar:");
                if (code !== 'DESTROY') return;

                showLoading();
                try {
                    // Borrar Albaranes y Facturas (usando el worker interno)
                    await _doWipeOperationalData();

                    // Borrar Tarifas
                    const tSnap = await db.collection('tariffs').get();
                    let batch = db.batch();
                    tSnap.forEach(d => batch.delete(d.ref));
                    await batch.commit();

                    // Borrar Clientes (excepto el admin actual)
                    const uSnap = await db.collection('users').get();
                    batch = db.batch();
                    for (const doc of uSnap.docs) {
                        if (doc.id !== auth.currentUser.uid) {
                            batch.delete(doc.ref);
                        }
                    }
                    await batch.commit();

                    localStorage.clear();
                    alert("APP RESETEADA COMPLETAMENTE. Recargando...");
                    window.location.reload();
                } catch (e) {
                    alert("Error en reset: " + e.message);
                } finally {
                    hideLoading();
                }
            };

            // Función para reparar la base de datos (Admin Privs & Indexes)
            window.repairDatabase = async () => {
                if (!confirm("Esta acción reconstruirá los privilegios de administrador y verificará la estructura base. ¿Deseas continuar?")) return;
                showLoading();
                try {
                    if (auth.currentUser) {
                        // Restaurar doc de admin explícitamente
                        await db.collection('config').doc('admin').set({ uid: auth.currentUser.uid }, { merge: true });
                        console.log("[Repair] Admin privileges restored for:", auth.currentUser.uid);
                    }

                    // Forzar recarga de usuarios
                    await loadUsers();
                    alert("✅ Reparación completada e índices refrescados.");
                } catch (e) {
                    console.error("Repair failed:", e);
                    alert("Error en reparación: " + e.message);
                } finally {
                    hideLoading();
                }
            };


            window.syncAllTicketsIndices = async () => {
                const confirmed = confirm("🔍 SINCRO GLOBAL DE ALBARANES\n\nEste proceso buscará albaranes que no aparecen en la App del cliente (por IDs antiguos o inconsistentes) y los vinculará al ID actual de cada usuario.\n\n¿Ejecutar ahora?");
                if (!confirmed) return;

                showLoading();
                try {
                    const usersSnap = await db.collection('users').get();
                    const uMap = {};
                    usersSnap.forEach(uDoc => {
                        const u = uDoc.data();
                        uMap[uDoc.id] = u.idNum;
                        if (u.authUid) uMap[u.authUid] = u.idNum;
                        if (u.email) uMap[u.email.toLowerCase()] = u.idNum;
                    });

                    const ticketsSnap = await db.collection('tickets').get();
                    let totalUpdated = 0;
                    let batch = db.batch();
                    let count = 0;

                    for (const tDoc of ticketsSnap.docs) {
                        const t = tDoc.data();
                        const targetIdNum = uMap[t.uid] || uMap[t.email ? t.email.toLowerCase() : ''];

                        if (targetIdNum && String(t.clientIdNum) !== String(targetIdNum)) {
                            batch.update(tDoc.ref, { clientIdNum: String(targetIdNum) });
                            totalUpdated++;
                            count++;
                            if (count >= 400) {
                                await batch.commit();
                                batch = db.batch();
                                count = 0;
                            }
                        }
                    }

                    if (count > 0) await batch.commit();
                    alert(`✅ Sincronización completada.\n\nSe han reparado ${totalUpdated} albaranes huerfanos o mal vinculados.`);
                    if (typeof loadAdminTicketList === 'function') loadAdminTicketList();
                } catch (e) {
                    console.error(e);
                    alert("Error en sincro: " + e.message);
                } finally {
                    hideLoading();
                }
            };

            const DEFAULTS = ["MALAGA", "GRANADA", "SEVILLA", "CORDOBA", "VELEZ-MALAGA", "TORRE DEL MAR", "ALGARROBO", "NERJA", "TORROX COSTA", "LOJA", "ANTEQUERA", "ESTEPONA", "MARBELLA", "TORREMOLINOS", "FUENGIROLA", "MIJAS", "BENALMADENA"];

            // Carga completa en tiempo real para buscadores y selects con procesamiento de cambios
            let usersListener = null;
            let pendingUserUIUpdate = null;

            function triggerDebouncedUserUIUpdate() {
                if (pendingUserUIUpdate) clearTimeout(pendingUserUIUpdate);
                pendingUserUIUpdate = setTimeout(() => {
                    console.log("[SYNC] Refrescando listados de clientes...");
                    if (typeof populateAdminTicketClients === 'function') populateAdminTicketClients();
                    if (typeof populateInvoiceClientSelect === 'function') populateInvoiceClientSelect();
                    if (typeof loadUsers === 'function') loadUsers('current');
                    pendingUserUIUpdate = null;
                }, 800); // 800ms debounce
            }

            async function fetchAllUsersMap() {
                if (usersListener) usersListener();
                try {
                    // Escucha incremental para eficiencia en grandes volúmenes
                    usersListener = db.collection('users').onSnapshot(snapshot => {
                        snapshot.docChanges().forEach(change => {
                            const doc = change.doc;
                            const data = { ...doc.data(), id: doc.id }; // STRICT ENFORCEMENT: doc.id must override any rogue inner json properties
                            if (data.idNum !== undefined) data.idNum = String(data.idNum);

                            if (change.type === 'removed') {
                                delete userMap[data.id];
                                if (data.authUid) delete userMap[data.authUid];
                                delete userCompaniesMap[data.id];
                            } else {
                                userMap[data.id] = data;
                                if (data.authUid) userMap[data.authUid] = data;

                                // Pro-actively keep userCompaniesMap hint updated if data has hints
                                if (data.companies) {
                                    userCompaniesMap[data.id] = data.companies.map(c => c.name).join(" ");
                                }
                            }
                        });

                        triggerDebouncedUserUIUpdate();
                    }, e => console.warn("Error en escucha (Usuarios):", e));
                } catch (e) {
                    console.warn("Error iniciando listener (Usuarios):", e);
                }
            }

            window.loadUsers = loadUsers; async function loadUsers(direction = 'first') {
                if (!userTableBody) return;
                userTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:30px;">Cargando usuarios...</td></tr>';
                const paginationUI = document.getElementById('users-pagination');

                try {
                    // Initial static data (only once)
                    if (direction === 'first') {
                        const sProv = document.getElementById('province-datalist');
                        if (sProv) {
                            try {
                                const DEFAULTS = ["MALAGA", "GRANADA", "SEVILLA", "CORDOBA", "VELEZ-MALAGA", "TORRE DEL MAR", "ALGARROBO", "NERJA", "TORROX COSTA", "LOJA", "ANTEQUERA", "ESTEPONA", "MARBELLA", "TORREMOLINOS", "FUENGIROLA", "MIJAS", "BENALMADENA"];
                                const custom = await getCustomData('provinces') || [];
                                const deleted = await getCustomData('provinces_deleted') || [];
                                let allP = [...new Set([...DEFAULTS, ...custom])].filter(p => !deleted.includes(p)).sort();
                                let htmlP = '';
                                allP.forEach(z => htmlP += `<option value="${z}"></option>`);
                                sProv.innerHTML = htmlP;
                            } catch (e) { }
                        }
                        try { populateGlobalTariffsDatalist(); } catch (e) { }
                    }

                    // 1. Pagination Logic
                    if (direction === 'first') {
                        usersPage = 1;
                    } else if (direction === 'next') {
                        usersPage++;
                    } else if (direction === 'prev' && usersPage > 1) {
                        usersPage--;
                    }

                    // 2. Fetch ALL users once and paginate in memory to safely filter out clones without breaking page limits
                    // Ensure local cache is populated
                    if (Object.keys(userMap).length < 2) {
                        const allUsersSnap = await db.collection('users').get();
                        allUsersSnap.forEach(doc => { 
                            const d = { ...doc.data(), id: doc.id }; // Enforce strict DB path ID
                            userMap[d.id] = d; 
                            if (d.authUid) userMap[d.authUid] = d; 
                        });
                    }

                    // Extract all valid profiles by intelligently grouping duplicates
                    let groupedUsers = {};
                    Object.values(userMap).forEach(data => {
                        if (!data.id) return;
                        
                        // Extract a unified identity key
                        const key = String(data.email || data.idNum || data.id).toLowerCase();
                        
                        if (!groupedUsers[key]) {
                            groupedUsers[key] = data;
                        } else {
                            // If a duplicate exists, keep the most "authentic" profile (prioritize Master > Linked > Synthetic)
                            const current = groupedUsers[key];
                            const currentScore = (current.isSynthetic ? 0 : (current.isLinked ? 1 : 2));
                            const newScore = (data.isSynthetic ? 0 : (data.isLinked ? 1 : 2));
                            
                            // Break ties by picking the one with the most data (e.g. authUid)
                            if (newScore > currentScore) {
                                groupedUsers[key] = data;
                            } else if (newScore === currentScore && data.authUid && !current.authUid) {
                                groupedUsers[key] = data;
                            }
                        }
                    });
                    
                    let validUsers = Object.values(groupedUsers);

                    // --- CLIENT SEARCH FILTER ---
                    const searchQuery = (window._clientSearchFilter || '').trim().toLowerCase();
                    if (searchQuery) {
                        validUsers = validUsers.filter(u => {
                            const fields = [
                                String(u.idNum || ''),
                                String(u.name || ''),
                                String(u.email || ''),
                                String(u.nif || ''),
                                String(u.senderPhone || ''),
                                String(u.id || ''),
                                String(u.address || ''),
                                String(u.city || ''),
                            ];
                            return fields.some(f => f.toLowerCase().includes(searchQuery));
                        });
                    }
                    // Update search count indicator
                    const searchCountEl = document.getElementById('client-search-count');
                    const searchClearBtn = document.getElementById('client-search-clear');
                    if (searchCountEl) {
                        searchCountEl.textContent = searchQuery ? `${validUsers.length} resultado${validUsers.length !== 1 ? 's' : ''}` : '';
                    }
                    if (searchClearBtn) {
                        searchClearBtn.style.display = searchQuery ? 'inline-block' : 'none';
                    }

                    // Sort alphabetically by name ensuring strict String types
                    validUsers.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));

                    // Pagination slice
                    const totalPages = Math.ceil(validUsers.length / usersLimit) || 1;
                    if (usersPage > totalPages) usersPage = totalPages;

                    const startIndex = (usersPage - 1) * usersLimit;
                    const pageUsers = validUsers.slice(startIndex, startIndex + usersLimit);

                    userTableBody.innerHTML = '';

                    if (pageUsers.length === 0) {
                        const dbLength = Object.keys(userMap).length;
                        userTableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:30px; color:#c00;">
                            <strong>ALERTA DE SISTEMA:</strong><br>
                            El filtro de usuarios procesó 0 de ${dbLength} perfiles en RAM.<br>
                            Si la RAM tiene 0, ${dbLength === 0 ? 'Firebase ha devuelto 0 documentos.' : 'Ocurre un error lógico de conversión.'}
                        </td></tr>`;
                        if (usersPage === 1) paginationUI.style.display = 'none';
                    } else {
                        pageUsers.forEach(data => {
                            const row = document.createElement('tr');
                            row.className = 'user-row';
                            row.innerHTML = `
                            <td style="text-align:center;"><input type="checkbox" class="client-check" data-id="${data.id}"></td>
                            <td style="font-weight:900; color:var(--brand-primary); padding-left:20px;">#${data.idNum || '---'}</td>
                            <td>
                                <div style="font-weight:700">${data.name || 'Sin Nombre'}</div>
                                <div style="font-size:0.8rem; color:#888">${data.email || data.id}</div>
                                <div style="font-size:0.7rem; color:var(--brand-primary); margin-top:2px;">Clave: ${data.password || '****'}</div>
                            </td>
                            <td><span class="chip">Activo</span></td>
                            <td style="color:#888">${data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate().toLocaleDateString() : new Date(data.createdAt).toLocaleDateString()) : 'N/A'}</td>
                            <td>
                                <div style="display:flex; gap:5px;">
                                    <button class="btn btn-primary btn-sm" onclick="openEditUserModal('${data.id}')" title="Editar Cliente">✏️</button>
                                    <button class="btn btn-outline btn-sm" onclick="openManageCompaniesModal('${data.id}')" title="Sedes/Empresas">🏢</button>
                                    <button class="btn btn-outline btn-sm" onclick="openManageDestinationsModal('${data.id}')" title="Agenda/Direcciones">📇</button>
                                    <button class="btn btn-secondary btn-sm" onclick="sendWhatsApp('${data.senderPhone || ''}', 'Hola ${data.name}')" title="WhatsApp">💬</button>
                                    <button class="btn btn-danger btn-sm" onclick="deleteUser('${data.id}')" title="Eliminar">🗑️</button>
                                </div>
                            </td>
                        `;
                            userTableBody.appendChild(row);
                        });

                        // Update UI Labels
                        paginationUI.style.display = 'flex';
                        document.getElementById('label-users-page').textContent = `Página ${usersPage} de ${totalPages}`;
                        document.getElementById('btn-users-prev').disabled = (usersPage === 1);
                        document.getElementById('btn-users-next').disabled = (usersPage >= totalPages);
                    }

                    // Update selects (Search-based ones)
                    if (typeof populateAdminTicketClients === 'function') populateAdminTicketClients();

                } catch (e) {
                    console.error(e);
                    userTableBody.innerHTML = `<tr><td colspan="5" style="color:red; text-align:center;">Error: ${e.message}</td></tr>`;
                }
            }

            // --- CLIENT SEARCH: Debounced Input Listener ---
            (function() {
                const searchInput = document.getElementById('client-search-input');
                if (searchInput) {
                    let _searchTimer = null;
                    searchInput.addEventListener('input', function() {
                        clearTimeout(_searchTimer);
                        _searchTimer = setTimeout(() => {
                            window._clientSearchFilter = searchInput.value;
                            loadUsers('first');
                        }, 300);
                    });
                    // Allow Enter key to search immediately
                    searchInput.addEventListener('keydown', function(e) {
                        if (e.key === 'Enter') {
                            clearTimeout(_searchTimer);
                            window._clientSearchFilter = searchInput.value;
                            loadUsers('first');
                        }
                    });
                }
            })();

            // --- PHANTOM DIRECTORY: AUTO-COMPLETE (ADMIN ADD USER) ---
            (function() {
                const nameInput = document.getElementById('new-user-name');
                const nifInput = document.getElementById('new-user-nif');
                let searchTimer = null;
                
                // Crea contenedor de resultados debajo del active input
                const resultsContainer = document.createElement('div');
                resultsContainer.id = 'phantom-admin-results';
                resultsContainer.style.position = 'absolute';
                resultsContainer.style.width = '100%';
                resultsContainer.style.maxHeight = '200px';
                resultsContainer.style.overflowY = 'auto';
                resultsContainer.style.background = 'var(--bg-dark)';
                resultsContainer.style.border = '1px solid var(--brand-primary)';
                resultsContainer.style.borderRadius = '8px';
                resultsContainer.style.zIndex = '9999';
                resultsContainer.style.display = 'none';

                function attachResults(inputEl) {
                    inputEl.parentNode.style.position = 'relative';
                    inputEl.parentNode.appendChild(resultsContainer);
                }

                function handleInput(e) {
                    const inputEl = e.target;
                    attachResults(inputEl);
                    clearTimeout(searchTimer);
                    
                    searchTimer = setTimeout(() => {
                        const q = inputEl.value.trim();
                        if (q.length < 3) {
                            resultsContainer.style.display = 'none';
                            return;
                        }
                        
                        // Ojo: "Directorio Global" - no mencionar Cooper
                        if (typeof window.searchPhantomDirectory === 'function') {
                            const results = window.searchPhantomDirectory(q);
                            if (results.length > 0) {
                                resultsContainer.innerHTML = '';
                                resultsContainer.style.display = 'block';
                                results.forEach(r => {
                                    const div = document.createElement('div');
                                    div.style.padding = '10px';
                                    div.style.borderBottom = '1px solid rgba(255,255,255,0.1)';
                                    div.style.cursor = 'pointer';
                                    div.innerHTML = `<strong>${r.name || ''}</strong> <span style="font-size:0.7rem; color:#888;">NIF: ${r.nif || 'N/A'}</span>`;
                                    
                                    div.onmouseover = () => div.style.background = 'rgba(255,102,0,0.2)';
                                    div.onmouseout = () => div.style.background = 'transparent';
                                    
                                    div.onclick = () => {
                                        document.getElementById('new-user-name').value = r.name || '';
                                        if (document.getElementById('new-user-nif')) document.getElementById('new-user-nif').value = r.nif || '';
                                        if (document.getElementById('new-user-sender-street')) document.getElementById('new-user-sender-street').value = r.street || '';
                                        if (document.getElementById('new-user-sender-cp')) document.getElementById('new-user-sender-cp').value = r.cp || '';
                                        if (document.getElementById('new-user-sender-city')) document.getElementById('new-user-sender-city').value = r.localidad || '';
                                        if (document.getElementById('new-user-sender-province')) document.getElementById('new-user-sender-province').value = r.province || '';
                                        if (document.getElementById('new-user-sender-phone')) document.getElementById('new-user-sender-phone').value = r.senderPhone || '';
                                        resultsContainer.style.display = 'none';
                                    };
                                    resultsContainer.appendChild(div);
                                });
                            } else {
                                resultsContainer.style.display = 'none';
                            }
                        }
                    }, 300);
                }

                if (nameInput) nameInput.addEventListener('input', handleInput);
                if (nifInput) nifInput.addEventListener('input', handleInput);
                
                // Hide when clicking outside
                document.addEventListener('click', (e) => {
                    if (e.target !== nameInput && e.target !== nifInput && !resultsContainer.contains(e.target)) {
                        resultsContainer.style.display = 'none';
                    }
                });
            })();

            if (addUserForm) {
                addUserForm.onsubmit = async (e) => {
                    e.preventDefault();
                    const idNum = document.getElementById('new-user-id-num').value.trim();
                    const name = document.getElementById('new-user-name').value.trim();
                    const nif = document.getElementById('new-user-nif') ? document.getElementById('new-user-nif').value.trim().toUpperCase() : '';
                    const email = document.getElementById('new-user-email').value.trim().toLowerCase();
                    const password = document.getElementById('new-user-password').value.trim();
                    const tariffId = document.getElementById('new-user-tariff-id').value.trim();
                    const iban = document.getElementById('new-user-iban').value.trim();
                    const sepaRef = document.getElementById('new-user-sepa-ref').value.trim();
                    const sepaDate = document.getElementById('new-user-sepa-date').value;
                    const billingCompanyId = document.getElementById('new-user-billing-company') ? document.getElementById('new-user-billing-company').value : '';

                    const street = document.getElementById('new-user-sender-street').value.trim();
                    const num = document.getElementById('new-user-sender-num').value.trim();
                    const city = document.getElementById('new-user-sender-city').value.trim();
                    const cp = document.getElementById('new-user-sender-cp').value.trim();
                    const province = document.getElementById('new-user-sender-province').value;
                    const senderPhone = document.getElementById('new-user-sender-phone').value.trim();

                    const userId = document.getElementById('edit-user-uid').value;

                    // Construir dirección para compatibilidad
                    const parts = [];
                    if (street) parts.push(street);
                    if (num) parts.push("Nº " + num);
                    if (city) parts.push(city);
                    if (cp) parts.push(`(CP ${cp})`);
                    const senderAddress = parts.join(', ');

                    if (!email || !idNum) { alert("Email e ID son obligatorios."); return; }

                    try {
                        showLoading();

                        // 1. VERIFICACIÓN DE DUPLICADOS (Seguridad e Independencia)
                        if (!userId) {
                            // Si es nuevo cliente, probamos si el email ya existe
                            const docEmail = await db.collection('users').doc(email).get();
                            if (docEmail.exists) {
                                alert(`❌ ERROR: El email "${email}" ya está registrado para otro cliente.`);
                                hideLoading();
                                return;
                            }

                            // Probamos si el ID de cliente ya existe (como string o como número)
                            const snapId = await db.collection('users').where('idNum', '==', idNum).get();
                            const snapIdNum = await db.collection('users').where('idNum', '==', parseInt(idNum)).get();

                            if (!snapId.empty || !snapIdNum.empty) {
                                const existing = (!snapId.empty ? snapId.docs[0].data() : snapIdNum.docs[0].data());
                                alert(`⚠️ AVISO: El ID #${idNum} ya pertenece a "${existing.name}".\nPor favor, usa un ID único.`);
                                hideLoading();
                                return;
                            }
                        }

                        // 2. GUARDAR DATOS DEL USUARIO
                        const idNumStr = String(idNum).trim();
                        const updateData = {
                            idNum: idNumStr, name, email, password, tariffId, iban, sepaRef, sepaDate, billingCompanyId,
                            senderAddress, senderPhone, nif,
                            street: street || '',
                            number: num || '',
                            localidad: city || '',
                            cp: cp || '',
                            province: province || ''
                        };

                        let targetDocId = userId; // Tracker para asociar la sede

                        if (userId) {
                            // Actualización
                            await db.collection('users').doc(userId).update(updateData);
                            // FIX: Update memory cache
                            if (window.userMap && window.userMap[userId]) {
                                Object.assign(window.userMap[userId], updateData);
                            }
                        } else {
                            if (!password || password.length < 6) {
                                alert("❌ ERROR: Al crear un nuevo cliente la contraseña debe tener al menos 6 caracteres para Firebase.");
                                hideLoading();
                                return;
                            }
                            
                            // Creación de nuevo registro maestro a través de secondaryApp para forzar UID real
                            const secApp = firebase.apps.find(app => app.name === "Secondary") || firebase.initializeApp(firebaseConfig, "Secondary");
                            const uCred = await secApp.auth().createUserWithEmailAndPassword(email, password);
                            targetDocId = uCred.user.uid;
                            await secApp.auth().signOut(); // Evitar cruces de sesión

                            const newUserData = {
                                ...updateData,
                                role: 'client',
                                street: street || '',
                                number: num || '',
                                localidad: city || '',
                                cp: cp || '',
                                province: province || '',
                                authUid: targetDocId, // Firma explícita
                                createdAt: firebase.firestore.FieldValue.serverTimestamp()
                            };
                            await db.collection('users').doc(targetDocId).set(newUserData);
                            
                            // FIX: Add to memory cache so loadUsers() sees it immediately without full reload
                            newUserData.id = targetDocId;
                            if(!window.userMap) window.userMap = {};
                            window.userMap[targetDocId] = newUserData;
                        }

                        // 3. ACTUALIZAR SEDE PRINCIPAL (comp_main) - Siempre sincronizada con la ficha maestra
                        const mainCompData = {
                            name: name,
                            idNum: parseInt(idNumStr) || null,
                            nif: nif || '',
                            address: senderAddress || 'Dirección no definida',
                            street: street || '',
                            number: num || '',
                            localidad: city || '',
                            cp: cp || '',
                            province: province || '',
                            phone: senderPhone || '',
                            prefix: (idNum || "NP").substring(0, 3).toUpperCase(),
                            startNum: 1001,
                            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                        };

                        // For existing users, we update. For new users, we set/merge.
                        await db.collection('users').doc(targetDocId).collection('companies').doc('comp_main').set(mainCompData, { merge: true });

                        addUserModal.style.display = 'none';
                        loadUsers();
                        alert(userId ? "✅ Cliente actualizado correctamente." : "✅ Cliente creado con éxito en la nube.");
                    } catch (err) {
                        console.error(err);
                        alert('Error al procesar el usuario: ' + err.message);
                    } finally {
                        hideLoading();
                    }
                };
            }

            window.openEditUserModal = (uid) => {
                const data = userMap[uid];
                if (!data) return;
                document.getElementById('modal-user-title').textContent = "Editar Cliente";
                document.getElementById('edit-user-uid').value = uid;
                if(document.getElementById('new-user-nif')) document.getElementById('new-user-nif').value = data.nif || '';
                document.getElementById('new-user-id-num').value = data.idNum || '';
                document.getElementById('new-user-name').value = data.name || '';
                document.getElementById('new-user-email').value = data.email || '';
                document.getElementById('new-user-password').value = data.password || '';
                document.getElementById('new-user-tariff-id').value = data.tariffId || '';
                document.getElementById('new-user-iban').value = data.iban || '';
                if(document.getElementById('new-user-billing-company')) document.getElementById('new-user-billing-company').value = data.billingCompanyId || '';
                document.getElementById('new-user-sepa-ref').value = data.sepaRef || '';
                document.getElementById('new-user-sepa-date').value = data.sepaDate || '';
                document.getElementById('new-user-sender-street').value = data.street || '';
                document.getElementById('new-user-sender-num').value = data.number || '';
                document.getElementById('new-user-sender-city').value = data.localidad || '';
                document.getElementById('new-user-sender-cp').value = data.cp || '';
                document.getElementById('new-user-sender-province').value = data.province || '';
                document.getElementById('new-user-sender-phone').value = data.senderPhone || '';
                addUserModal.style.display = 'flex';
                window.scrollTo(0, 0);
                addUserModal.scrollTop = 0;
            };

            window.toggleSelectAllClients = (checkbox) => {
                const checkboxes = document.querySelectorAll('.client-check');
                checkboxes.forEach(cb => cb.checked = checkbox.checked);
            };

            window.deleteSelectedClients = async () => {
                const checkboxes = document.querySelectorAll('.client-check:checked');
                if (checkboxes.length === 0) {
                    alert("⚠️ Selecciona al menos un cliente para eliminar.");
                    return;
                }

                if (confirm(`🚨 ¿Estás seguro de que deseas ELIMINAR PERMANENTEMENTE a los ${checkboxes.length} clientes seleccionados junto con todos sus usuarios y accesos? Esta acción NO se puede deshacer.`)) {
                    showLoading();
                    try {
                        let deletedCount = 0;
                        let batch = db.batch();
                        let operationsCount = 0;

                        const commitBatchIfNeeded = async () => {
                            if (operationsCount >= 400) {
                                await batch.commit();
                                batch = db.batch();
                                operationsCount = 0;
                            }
                        };

                        for (let i = 0; i < checkboxes.length; i++) {
                            const uid = checkboxes[i].dataset.id;
                            if (!uid) continue;
                            const uData = userMap[uid];
                            if (!uData) continue;
                            
                            const targetIdNum = String(uData.idNum);

                            // 1. Tíckets
                            const qUID = await db.collection('tickets').where('uid', '==', uid).get();
                            for (const doc of qUID.docs) { batch.delete(doc.ref); operationsCount++; await commitBatchIfNeeded(); }
                            
                            if (targetIdNum && targetIdNum !== 'undefined') {
                                const qClientNum = await db.collection('tickets').where('clientIdNum', '==', targetIdNum).get();
                                for (const doc of qClientNum.docs) { batch.delete(doc.ref); operationsCount++; await commitBatchIfNeeded(); }
                            }

                            // 2. Facturas
                            const invUID = await db.collection('invoices').where('uid', '==', uid).get();
                            for (const doc of invUID.docs) { batch.delete(doc.ref); operationsCount++; await commitBatchIfNeeded(); }

                            if (targetIdNum && targetIdNum !== 'undefined') {
                                const invClientNum = await db.collection('invoices').where('clientIdNum', '==', targetIdNum).get();
                                for (const doc of invClientNum.docs) { batch.delete(doc.ref); operationsCount++; await commitBatchIfNeeded(); }
                            }

                            // 3. Sedes/Companies
                            const compSnap = await db.collection('users').doc(uid).collection('companies').get();
                            for (const doc of compSnap.docs) { batch.delete(doc.ref); operationsCount++; await commitBatchIfNeeded(); }

                            // 4. Matriz de Usuario
                            batch.delete(db.collection('users').doc(uid));
                            operationsCount++;
                            await commitBatchIfNeeded();

                            deletedCount++;
                        }
                        
                        if (operationsCount > 0) {
                            await batch.commit();
                        }
                        
                        // Clean up cache
                        userMap = {}; 
                        
                        alert(`✅ Se han eliminado y purgado ${deletedCount} clientes correctamente y todos sus datos.`);
                        const selectAll = document.getElementById('user-select-all');
                        if (selectAll) selectAll.checked = false;
                        
                        loadUsers();
                    } catch (e) {
                        alert("❌ Error eliminando clientes: " + e.message);
                    } finally {
                        hideLoading();
                    }
                }
            };

            window.deleteUser = async (id) => {
                const uData = userMap[id];
                if (!uData) { alert("Error: Datos del cliente no encontrados en el sistema."); return; }
                
                const confirm1 = confirm(`⚠️ ALERTA: Vas a eliminar al cliente "${uData.name}".\n\n¿Estás completamente seguro de que quieres destruir su acceso?`);
                if (!confirm1) return;
                
                const code = prompt(`ESTA ACCIÓN NO SE PUEDE DESHACER.\nSe borrarán TODOS sus albaranes, facturas y sedes asociadas.\n\nEscribe "BORRAR" para confirmar la destrucción total:`);
                if (code !== 'BORRAR') {
                    alert("Cancelado. El cliente NO ha sido eliminado.");
                    return;
                }

                showLoading();
                try {
                    console.log(`[CASCADE DELETE] Iniciando borrado de ${uData.name} (UID: ${id}, ID_NUM: ${uData.idNum})`);
                    let batch = db.batch();
                    let operationsCount = 0;

                    // Helper para no pasarnos de los 500 max writes del batch
                    const commitBatchIfNeeded = async () => {
                        if (operationsCount >= 400) {
                            await batch.commit();
                            batch = db.batch();
                            operationsCount = 0;
                        }
                    };

                    const targetIdNum = String(uData.idNum);

                    // 1. ELIMINAR ALBARANES ASOCIADOS (Global tickets collection)
                    // Eliminamos tanto por UID interno como por el Nº Lógico (por si fallara algo)
                    const qUID = await db.collection('tickets').where('uid', '==', id).get();
                    for (const doc of qUID.docs) {
                        batch.delete(doc.ref);
                        operationsCount++;
                        await commitBatchIfNeeded();
                    }

                    if (targetIdNum && targetIdNum !== 'undefined') {
                        const qClientNum = await db.collection('tickets').where('clientIdNum', '==', targetIdNum).get();
                        for (const doc of qClientNum.docs) {
                            batch.delete(doc.ref);
                            operationsCount++;
                            await commitBatchIfNeeded();
                        }
                    }

                    // 2. ELIMINAR FACTURAS ASOCIADAS
                    const invUID = await db.collection('invoices').where('uid', '==', id).get();
                    for (const doc of invUID.docs) {
                        batch.delete(doc.ref);
                        operationsCount++;
                        await commitBatchIfNeeded();
                    }
                    
                    if (targetIdNum && targetIdNum !== 'undefined') {
                        const invClientNum = await db.collection('invoices').where('clientIdNum', '==', targetIdNum).get();
                        for (const doc of invClientNum.docs) {
                            batch.delete(doc.ref);
                            operationsCount++;
                            await commitBatchIfNeeded();
                        }
                    }

                    // 3. ELIMINAR SUBCOLECCIONES INTERNAS (Sedes/Companies)
                    const compSnap = await db.collection('users').doc(id).collection('companies').get();
                    for (const doc of compSnap.docs) {
                        batch.delete(doc.ref);
                        operationsCount++;
                        await commitBatchIfNeeded();
                    }

                    // 4. ELIMINAR DOCUMENTO MATRIZ DEL USUARIO
                    batch.delete(db.collection('users').doc(id));
                    
                    // Final commit
                    await batch.commit();
                    
                    alert(`✅ Cliente "${uData.name}" y todos sus datos han sido purgados del sistema.`);
                    loadUsers('first'); // Recargar página 1
                } catch (err) {
                    console.error("Error durante Delete Cascade:", err);
                    alert("Error crítico durante el borrado continuo: " + err.message);
                } finally {
                    hideLoading();
                }
            };


            // Reports Logic

            function formatDateLocal(d) {
                if (!d || isNaN(d.getTime())) return "";
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            }

            async function initReportsView() {
                const userSnap = await db.collection('users').get();
                const datalist = document.getElementById('clients-datalist');
                if (datalist) datalist.innerHTML = '';
                userMap = {}; window.userMap = userMap;
                userSnap.forEach(doc => {
                    const data = doc.data();
                    userMap[doc.id] = data; // Store full user object
                    if (data.role !== 'admin' && datalist) {
                        const opt = document.createElement('option');
                        opt.value = data.idNum || '---';
                        opt.textContent = data.name || data.email;
                        datalist.appendChild(opt);
                    }
                });

                // Pre-load all tariffs for report calculation
                tariffsCache = {};
                try {
                    const tariffSnap = await db.collection('tariffs').get();
                    tariffSnap.forEach(doc => {
                        tariffsCache[doc.id] = doc.data(); // store whole doc including subTariff
                    });
                } catch (e) {
                    console.warn("Error pre-cargando tarifas:", e);
                    // Fallback a collectionGroup si la anterior falla por alguna razón de permisos
                    const groupSnap = await db.collectionGroup('tariffs').get();
                    groupSnap.forEach(doc => { tariffsCache[doc.id] = doc.data(); });
                }

                const today = formatDateLocal(new Date());
                document.getElementById('rep-date-from').value = today;
                document.getElementById('rep-date-to').value = today;
            }

            if(document.getElementById('btn-search-reports')) document.getElementById('btn-search-reports').onclick = async () => {
                const dFrom = document.getElementById('rep-date-from').value;
                const dTo = document.getElementById('rep-date-to').value;
                const fCID = document.getElementById('rep-client-id').value.trim();
                const fProv = document.getElementById('rep-province').value.trim().toLowerCase();
                const status = document.getElementById('reports-status');
                const table = document.getElementById('reports-table-result');
                const tbody = document.getElementById('reports-body');

                status.style.display = 'block';
                status.textContent = "Buscando envíos y aplicando tarifas...";
                table.style.display = 'none';
                tbody.innerHTML = '';
                reportsData = [];

                try {
                    if (Object.keys(tariffsCache).length === 0) {
                        const tariffSnap = await db.collection('tariffs').get();
                        tariffSnap.forEach(doc => { tariffsCache[doc.id] = doc.data(); });
                    }

                    // Opcion A: Ahora todos los tickets estan en una sola coleccion global
                    const snap = await db.collection('tickets').get();

                    // Helper to find user data by any ID (email or UID)
                    const findUserData = (id) => {
                        if (userMap[id]) return userMap[id];
                        // Search by internal uid field
                        const found = Object.values(userMap).find(u => u.uid === id);
                        if (found) return found;
                        return null;
                    };

                    snap.forEach(doc => {
                        const t = doc.data();
                        const d = (t.createdAt && t.createdAt.toDate) ? t.createdAt.toDate() : (t.createdAt ? new Date(t.createdAt) : null);

                        // Si no hay fecha, solo lo filtramos si el usuario puso un rango
                        let dIso = "";
                        if (d && !isNaN(d.getTime())) {
                            dIso = formatDateLocal(d);
                            if (dFrom && dIso < dFrom) return;
                            if (dTo && dIso > dTo) return;
                        } else if (dFrom || dTo) {
                            return; // Omitimos si no tiene fecha y hay filtro de fecha
                        }

                        // Identificación del propietario (Ahora por campos explicitos, no por ruta)
                        const recordUid = t.uid;
                        const pathCompId = t.compId || 'default';

                        const uData = findUserData(recordUid) || {};
                        const cid = uData.idNum || t.clientIdNum || '---';
                        const tId = uData.tariffId;

                        if (fCID && cid !== fCID) return;
                        if (fProv && (!t.province || !t.province.toLowerCase().includes(fProv))) return;

                        // Tarifa
                        let activeTariffRaw = {};
                        const lookupId = uData.uid || recordUid || t.uid;
                        const baseT = tId ? tariffsCache["GLOBAL_" + tId] : tariffsCache[lookupId];
                        if (baseT) {
                            activeTariffRaw = baseT.items ? { ...baseT.items } : { ...baseT };
                            // Apply sub-tariff if ticket has it
                            if (t.subTariffId && baseT.subTariff && baseT.subTariff[t.subTariffId]) {
                                Object.assign(activeTariffRaw, baseT.subTariff[t.subTariffId]);
                            }
                        }

                        const activeTariff = {};
                        Object.keys(activeTariffRaw).forEach(k => { activeTariff[k.toLowerCase()] = activeTariffRaw[k]; });

                        let companyPrice = 0;
                        if (Object.keys(activeTariff).length > 0 && t.packagesList) {
                            t.packagesList.forEach(p => {
                                const sizeKey = (p.size || 'Bulto').toLowerCase();
                                companyPrice += (parseInt(p.qty) || 1) * (activeTariff[sizeKey] || 0);
                            });
                        }

                        const compName = (userCompaniesMap[lookupId] && userCompaniesMap[lookupId][pathCompId]) ? userCompaniesMap[lookupId][pathCompId] : "";
                        reportsData.push({ ...t, uid: lookupId, compId: pathCompId, compName: compName, docId: doc.id, clientIdNum: cid, companyPrice });
                    });

                    if (reportsData.length === 0) {
                        status.textContent = "Sin resultados.";
                    } else {
                        status.style.display = 'none';
                        table.style.display = 'table';
                        reportsData.sort((a, b) => {
                            const da = (a.createdAt && a.createdAt.toDate) ? a.createdAt.toDate() : (a.createdAt ? new Date(a.createdAt) : new Date(0));
                            const db_ = (b.createdAt && b.createdAt.toDate) ? b.createdAt.toDate() : (b.createdAt ? new Date(b.createdAt) : new Date(0));
                            return db_ - da;
                        }).forEach(t => {
                            const date = (t.createdAt && t.createdAt.toDate) ? t.createdAt.toDate() : new Date(t.createdAt);
                            const row = document.createElement('tr');
                            row.innerHTML = `
                            <td style="font-weight:900; color:var(--brand-primary); padding-left:10px;">#${t.clientIdNum}</td>
                            <td>${t.id}</td>
                            <td>${isNaN(date.getTime()) ? '---' : date.toLocaleDateString()}</td>
                            <td style="text-transform:uppercase; font-size:0.85rem;">${t.receiver}</td>
                            <td>${t.province || ''}</td>
                            <td>${t.packagesList ? t.packagesList.reduce((s, p) => s + (parseInt(p.qty) || 1), 0) : 1}</td>
                            <td>${t.shippingType}</td>
                            <td style="font-weight:bold; color:#FF6600;">${t.cod ? t.cod + '€' : '-'}</td>
                            <td>
                                <div style="display:flex; gap:5px;">
                                    <button class="btn btn-outline btn-sm" onclick="printTicketFromAdmin('${t.uid}', '${t.compId}', '${t.docId}')" title="Imprimir">🖨️</button>
                                    <button class="btn btn-secondary btn-sm" onclick="sendWhatsAppTicket('${t.uid}', '${t.compId}', '${t.docId}')" title="WhatsApp">💬</button>
                                </div>
                            </td>
        `;
                            tbody.appendChild(row);
                        });
                    }
                } catch (e) {
                    console.error(e);
                    status.textContent = "Error al cargar datos: " + e.message;
                }
            };

            window.printReportsListado = () => {
                if (!reportsData || reportsData.length === 0) { alert('Realiza una búsqueda primero.'); return; }
                const sf = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', 'Helvetica Neue', sans-serif";
                const dFrom = document.getElementById('rep-date-from').value || '';
                const dTo = document.getElementById('rep-date-to').value || '';
                const fCID = document.getElementById('rep-client-id').value.trim();
                const fProv = document.getElementById('rep-province').value.trim();
                const rangeLabel = (dFrom || dTo) ? (dFrom || '...') + ' — ' + (dTo || '...') : 'Todas las fechas';
                
                let totalPkgs = 0, totalPrice = 0, totalCod = 0;
                let rowsHTML = '';
                reportsData.forEach((t, i) => {
                    const date = (t.createdAt && t.createdAt.toDate) ? t.createdAt.toDate() : new Date(t.createdAt);
                    const dateStr = !isNaN(date.getTime()) ? date.toLocaleDateString() : '—';
                    const pkgs = t.packagesList ? t.packagesList.reduce((s, p) => s + (parseInt(p.qty) || 1), 0) : 1;
                    const cod = parseFloat(t.cod) || 0;
                    totalPkgs += pkgs;
                    totalPrice += (t.companyPrice || 0);
                    totalCod += cod;
                    rowsHTML += `<tr style="border-bottom:1px solid #f0f0f0;">
                        <td style="padding:6px 0; color:#888; font-weight:300; font-size:0.8rem;">${i+1}</td>
                        <td style="padding:6px 0; color:#444; font-weight:300; font-size:0.8rem;">#${t.clientIdNum}</td>
                        <td style="padding:6px 0; color:#444; font-weight:300; font-size:0.8rem;">${t.id}</td>
                        <td style="padding:6px 0; color:#888; font-weight:300; font-size:0.8rem;">${dateStr}</td>
                        <td style="padding:6px 4px; color:#333; font-weight:300; font-size:0.8rem; max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${t.receiver}</td>
                        <td style="padding:6px 0; color:#888; font-weight:300; font-size:0.8rem;">${t.province || ''}</td>
                        <td style="padding:6px 0; color:#444; font-weight:300; font-size:0.8rem; text-align:center;">${pkgs}</td>
                        <td style="padding:6px 0; color:#444; font-weight:300; font-size:0.8rem; text-align:right;">${(t.companyPrice || 0).toFixed(2)} €</td>
                        <td style="padding:6px 0; color:#888; font-weight:300; font-size:0.8rem;">${t.shippingType || ''}</td>
                        <td style="padding:6px 0; color:${cod > 0 ? '#c00' : '#888'}; font-weight:300; font-size:0.8rem; text-align:right;">${cod > 0 ? cod.toFixed(2) + ' €' : '—'}</td>
                    </tr>`;
                });

                const win = window.open('', '_blank');
                win.document.write(`<html><head><title>Listado NOVAPACK</title>
                <style>
                    @font-face { font-family: 'Xenotron'; src: url('https://db.onlinewebfonts.com/t/13f990d5baee565bea4d9ff96e201c84.woff2') format('woff2'); }
                    @media print { @page { size: A4 landscape; margin: 10mm; } .no-print { display: none !important; } }
                </style></head>
                <body style="background:#f5f5f5; padding:20px;">
                <div style="max-width:1100px; margin:0 auto; background:white; padding:40px; box-shadow:0 0 10px rgba(0,0,0,0.05); font-family:${sf}; color:#444; font-weight:300; line-height:1.5;">
                    
                    <!-- HEADER -->
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:30px;">
                        <div>
                            <div style="font-family:Xenotron, sans-serif; color:#FF6600; font-size:1.4rem; letter-spacing:3px;">NOVAPACK S.L.</div>
                            <div style="border-top:0.5px solid #ddd; margin-top:4px; padding-top:4px; font-size:0.6rem; color:#999; letter-spacing:1.5px; text-transform:uppercase; font-weight:400;">Servicio Inmediato de Paquetería</div>
                        </div>
                        <div style="text-align:right;">
                            <div style="font-size:0.6rem; color:#bbb; letter-spacing:2px; text-transform:uppercase; font-weight:400;">Listado de Envíos</div>
                            <div style="font-size:1.1rem; color:#333; font-weight:300; margin:4px 0 10px;">${rangeLabel}</div>
                            ${fCID ? '<div style="font-size:0.75rem; color:#888; font-weight:300;">Cliente: #' + fCID + '</div>' : ''}
                            ${fProv ? '<div style="font-size:0.75rem; color:#888; font-weight:300;">Provincia: ' + fProv + '</div>' : ''}
                            <div style="font-size:0.7rem; color:#bbb; font-weight:300; margin-top:6px;">${reportsData.length} registros</div>
                        </div>
                    </div>

                    <div style="border-top:0.5px solid #e0e0e0; margin-bottom:20px;"></div>

                    <!-- TABLE -->
                    <table style="width:100%; border-collapse:collapse; margin-bottom:25px;">
                        <thead>
                            <tr style="border-bottom:0.5px solid #ccc;">
                                <th style="padding:6px 0; text-align:left; font-size:0.55rem; color:#bbb; letter-spacing:1px; text-transform:uppercase; font-weight:400; width:30px;">#</th>
                                <th style="padding:6px 0; text-align:left; font-size:0.55rem; color:#bbb; letter-spacing:1px; text-transform:uppercase; font-weight:400;">ID Cte.</th>
                                <th style="padding:6px 0; text-align:left; font-size:0.55rem; color:#bbb; letter-spacing:1px; text-transform:uppercase; font-weight:400;">Albarán</th>
                                <th style="padding:6px 0; text-align:left; font-size:0.55rem; color:#bbb; letter-spacing:1px; text-transform:uppercase; font-weight:400;">Fecha</th>
                                <th style="padding:6px 0; text-align:left; font-size:0.55rem; color:#bbb; letter-spacing:1px; text-transform:uppercase; font-weight:400;">Destinatario</th>
                                <th style="padding:6px 0; text-align:left; font-size:0.55rem; color:#bbb; letter-spacing:1px; text-transform:uppercase; font-weight:400;">Zona</th>
                                <th style="padding:6px 0; text-align:center; font-size:0.55rem; color:#bbb; letter-spacing:1px; text-transform:uppercase; font-weight:400;">Btos.</th>
                                <th style="padding:6px 0; text-align:right; font-size:0.55rem; color:#bbb; letter-spacing:1px; text-transform:uppercase; font-weight:400;">Precio</th>
                                <th style="padding:6px 0; text-align:left; font-size:0.55rem; color:#bbb; letter-spacing:1px; text-transform:uppercase; font-weight:400;">Portes</th>
                                <th style="padding:6px 0; text-align:right; font-size:0.55rem; color:#bbb; letter-spacing:1px; text-transform:uppercase; font-weight:400;">Reemb.</th>
                            </tr>
                        </thead>
                        <tbody>${rowsHTML}</tbody>
                    </table>

                    <!-- TOTALS -->
                    <div style="display:flex; justify-content:flex-end;">
                        <div style="width:300px;">
                            <div style="display:flex; justify-content:space-between; padding:5px 0; color:#999; font-weight:300; font-size:0.8rem;">
                                <span>Total Bultos</span><span>${totalPkgs}</span>
                            </div>
                            <div style="display:flex; justify-content:space-between; padding:5px 0; color:#999; font-weight:300; font-size:0.8rem;">
                                <span>Total Reembolsos</span><span>${totalCod.toFixed(2)} €</span>
                            </div>
                            <div style="border-top:0.5px solid #ccc; margin-top:6px; padding-top:10px; display:flex; justify-content:space-between; font-size:1.1rem; color:#222; font-weight:700;">
                                <span>Total Facturación</span><span>${totalPrice.toFixed(2)} €</span>
                            </div>
                        </div>
                    </div>

                    <!-- FOOTER -->
                    <div style="margin-top:40px; border-top:0.5px solid #e0e0e0; padding-top:12px; font-size:0.6rem; color:#ccc; font-weight:300;">
                        Generado el ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()} — NOVAPACK S.L. — Documento interno
                    </div>
                </div>

                <div class="no-print" style="text-align:center; padding:20px;">
                    <button onclick="window.print()" style="padding:12px 30px; background:#FF6600; color:white; border:none; border-radius:5px; cursor:pointer; font-weight:bold; font-size:1rem;">🖨️ IMPRIMIR</button>
                </div>
                </body></html>`);
                win.document.close();
            };

            if(document.getElementById('btn-export-reports')) document.getElementById('btn-export-reports').onclick = () => {
                if (reportsData.length === 0) return;
                let csv = "ID CLIENTE;ALBARAN;FECHA;DELEGACION;DESTINATARIO;ZONA;BULTOS;PRECIO TARIFA;PORTES;REEMBOLSO\n";
                reportsData.forEach(t => {
                    const date = (t.createdAt && t.createdAt.toDate) ? t.createdAt.toDate() : new Date(t.createdAt);
                    const pkgs = t.packagesList ? t.packagesList.reduce((s, p) => s + (parseInt(p.qty) || 1), 0) : 1;
                    csv += `${t.clientIdNum};${t.id};${date.toLocaleDateString()};${t.compName || ""};${t.receiver};${t.province ||
                        ''
                        };${pkgs};${t.companyPrice.toFixed(2)};${t.shippingType};${t.cod || ''} \n`;
                });
                const blob = new Blob(["\ufeff" + csv], { type: 'text/csv;charset=utf-8;' });
                const link = document.createElement("a");
                link.href = URL.createObjectURL(blob);
                link.download = `envios_global_${new Date().toISOString().split('T')[0]}.csv`;
                link.click();
            };

            // Accounting Export (Universal Format)
            if(document.getElementById('btn-export-accounting')) document.getElementById('btn-export-accounting').onclick = () => {
                if (reportsData.length === 0) { alert("Genera un listado primero."); return; }

                // Standard accounting format: Date, DocNo, Account/ID, Name, Concept, Base, VAT, Total
                let csv = "FECHA;ASIENTO;CUENTA_ID;CLIENTE;DELEGACION;CONCEPTO;BASE_IMP;IVA;TOTAL_TARIFA;REEMBOLSO\n";

                reportsData.forEach(t => {
                    const date = (t.createdAt && t.createdAt.toDate) ? t.createdAt.toDate() : new Date(t.createdAt);
                    const dateStr = date.toLocaleDateString();

                    const total = t.companyPrice || 0;
                    const base = (total / 1.21).toFixed(2);
                    const iva = (total - parseFloat(base)).toFixed(2);

                    const receiver = (t.receiver || "").replace(/;/g, ",");
                    const concept = `Tarifa Novapack Ref: ${t.id} `;

                    csv += `${dateStr};${t.id};${t.clientIdNum};${receiver};${t.compName || ""};${concept};${base};${iva};${total.toFixed(2)};${t.cod ||
                        0
                        } \n`;
                });

                const blob = new Blob(["\ufeff" + csv], { type: 'text/csv;charset=utf-8;' });
                const link = document.createElement("a");
                link.href = URL.createObjectURL(blob);
                link.download = `CONTABILIDAD_NOVAPACK_${new Date().toISOString().split('T')[0]}.csv`;
                link.click();
            };

            if(document.getElementById('btn-print-reports')) document.getElementById('btn-print-reports').onclick = () => window.print();

            // Phone Management
            phoneTableBody = document.getElementById('phone-table-body');
            const addPhoneModal = document.getElementById('add-phone-modal');
            const btnAddPhone = document.getElementById('btn-add-phone');
            const btnClosePhoneModal = document.getElementById('btn-close-phone-modal');
            const addPhoneForm = document.getElementById('add-phone-form');

            let globalRoutes = [];
            async function loadPhones() {
                const snapshot = await db.collection('config').doc('phones').collection('list').get();
                phoneTableBody.innerHTML = '';
                globalRoutes = [];
                snapshot.forEach(doc => {
                    const data = doc.data();
                    const phoneClean = data.number ? data.number.replace(/\D/g, '').replace(/^34/, '') : '';
                    globalRoutes.push({ label: data.label.trim().toLowerCase(), phone: phoneClean });
                    
                    const names = [];
                    if (data.driverName) names.push(data.driverName);
                    if (data.driverName2) names.push(data.driverName2);
                    if (data.driverName3) names.push(data.driverName3);
                    if (data.driverName4) names.push(data.driverName4);
                    const combinedNames = names.join(" / ") || '-';

                    const row = document.createElement('tr');
                    row.className = 'user-row';
                    row.innerHTML = `<td>${data.label}</td>
    <td>${data.number}</td>
    <td>${combinedNames}</td>
    <td style="display:flex; gap:10px;">
        <button class="btn btn-secondary btn-sm" onclick="editPhone('${doc.id}', '${data.label.replace(/'/g, "\\'")}', '${data.number.replace(/'/g, "\\'")}', '${(data.driverName || '').replace(/'/g, "\\'")}', '${(data.driverName2 || '').replace(/'/g, "\\'")}', '${(data.driverName3 || '').replace(/'/g, "\\'")}', '${(data.driverName4 || '').replace(/'/g, "\\'")}')">✏️</button>
        <button class="btn btn-danger btn-sm" onclick="deletePhone('${doc.id}')">🗑️</button>
    </td>`;
                    phoneTableBody.appendChild(row);
                });
            }

            if (addPhoneForm) addPhoneForm.onsubmit = async (e) => {
                e.preventDefault();
                const editId = document.getElementById('edit-phone-id') ? document.getElementById('edit-phone-id').value : '';
                
                const data = {
                    label: document.getElementById('new-phone-label').value,
                    number: document.getElementById('new-phone-number').value,
                    driverName: document.getElementById('new-phone-driver-name').value.trim(),
                    driverName2: document.getElementById('new-phone-driver-name-2').value.trim(),
                    driverName3: document.getElementById('new-phone-driver-name-3').value.trim(),
                    driverName4: document.getElementById('new-phone-driver-name-4').value.trim(),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                };

                if(editId) {
                    await db.collection('config').doc('phones').collection('list').doc(editId).update(data);
                } else {
                    data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                    await db.collection('config').doc('phones').collection('list').add(data);
                }
                
                addPhoneModal.style.display = 'none';
                addPhoneForm.reset();
                if(document.getElementById('edit-phone-id')) document.getElementById('edit-phone-id').value = '';
                
                loadPhones();
            };

            window.editPhone = async (id, label, number, driverName, driverName2, driverName3, driverName4) => {
                if(document.getElementById('edit-phone-id')) document.getElementById('edit-phone-id').value = id;
                document.getElementById('new-phone-label').value = label;
                document.getElementById('new-phone-number').value = number;
                document.getElementById('new-phone-driver-name').value = driverName || '';
                document.getElementById('new-phone-driver-name-2').value = driverName2 || '';
                document.getElementById('new-phone-driver-name-3').value = driverName3 || '';
                document.getElementById('new-phone-driver-name-4').value = driverName4 || '';
                if (addPhoneModal) addPhoneModal.style.display = 'flex';
            };

            window.deletePhone = async (id) => {
                await db.collection('config').doc('phones').collection('list').doc(id).delete();
                loadPhones();
            };

            // --- REDESIGNED ROUTE MONITOR TOWER ---
            let unsubscribeRouteMonitor = null;
            let currentRouteDetailPhone = null;
            let routeTowerUnsubscribes = [];

            async function loadRouteMonitor() {
                if (typeof showLoading === 'function') showLoading();
                const grid = document.getElementById('route-monitor-grid');
                grid.innerHTML = '<div style="color:var(--text-dim);">Conectando Torre en Tiempo Real...</div>';

                // Clear previous listeners to prevent memory leaks if called multiple times
                routeTowerUnsubscribes.forEach(unsub => unsub());
                routeTowerUnsubscribes = [];

                try {
                    const phoneSnap = await db.collection('config').doc('phones').collection('list').get();
                    if (phoneSnap.empty) {
                        grid.innerHTML = '<div style="color:var(--text-dim);">No hay rutas configuradas.</div>';
                        if (typeof hideLoading === 'function') hideLoading();
                        return;
                    }
                    grid.innerHTML = '';

                    phoneSnap.forEach(doc => {
                        const routeData = doc.data();
                        const pNum = routeData.number ? routeData.number.replace(/\D/g, '').replace(/^34/, '') : '';
                        const cardId = 'route-card-' + doc.id;
                        
                        const driverNames = [];
                        if (routeData.driverName) driverNames.push(routeData.driverName);
                        if (routeData.driverName2) driverNames.push(routeData.driverName2);
                        if (routeData.driverName3) driverNames.push(routeData.driverName3);
                        if (routeData.driverName4) driverNames.push(routeData.driverName4);
                        const names = driverNames.join(" / ") || "Sin chóferes configurados";

                        // Create placeholder card
                        const card = document.createElement('div');
                        card.id = cardId;
                        card.className = 'card';
                        card.style.cursor = 'pointer';
                        card.style.transition = 'transform 0.2s';
                        card.onmouseover = () => card.style.transform = 'scale(1.02)';
                        card.onmouseout = () => card.style.transform = 'scale(1)';
                        card.onclick = () => openRouteDetails(routeData.label, pNum);
                        
                        card.innerHTML = `<div style="color:var(--text-dim); text-align:center; padding:20px;">Sincronizando ${routeData.label}...</div>`;
                        grid.appendChild(card);

                        // Attach real-time listener for this specific route
                        const unsub = db.collection('tickets').where('driverPhone', '==', pNum).onSnapshot(ticketsSnap => {
                            let total = 0;
                            let pending = 0;
                            let delivered = 0;
                            let incidents = 0;
                            let incidentDetails = [];
                            let incidentTicketIds = [];

                            ticketsSnap.forEach(tDoc => {
                                const tData = tDoc.data();
                                const bultos = tData.packagesList ? tData.packagesList.reduce((s,p)=>s+(parseInt(p.qty)||1),0) : (tData.packages || 1);
                                total += bultos;
                                if (tData.status === 'Entregado') delivered += bultos;
                                else if (tData.status === 'Incidencia' || tData.status === 'Devuelto') {
                                    incidents += bultos;
                                    incidentTicketIds.push(tDoc.id);
                                    const reason = tData.incidentReason || 'Incidencia general';
                                    incidentDetails.push(`<div onclick="openIncidentManagerModal('${tDoc.id}')" style="cursor:pointer; padding:4px 6px; margin:2px 0; border-radius:4px; transition:background 0.2s;" onmouseover="this.style.background='rgba(255,59,48,0.2)'" onmouseout="this.style.background='transparent'"><b>${tData.id}</b>: ${reason} <span style='color:#FF9800; font-weight:bold;'>→ RESOLVER</span></div>`);
                                }
                                else pending += bultos;
                                
                                if (tData.notes && tData.notes.includes("MODIFICADO POR REPARTIDOR") && !tData.adminAcknowledged) {
                                    incidentDetails.push(`<div style="display:flex; align-items:center; gap:6px; padding:4px 6px; margin:2px 0; border-radius:4px; transition:background 0.2s;" onmouseover="this.style.background='rgba(255,152,0,0.2)'" onmouseout="this.style.background='transparent'"><div onclick="openIncidentManagerModal('${tDoc.id}')" style="cursor:pointer; flex:1;"><b>${tData.id}</b>: El repartidor modificó bultos. <span style='color:#FF9800; font-weight:bold;'>→ VER</span></div><button onclick="event.stopPropagation(); acknowledgeDriverModification('${tDoc.id}')" style="background:#4CAF50; color:white; border:none; border-radius:4px; padding:3px 8px; font-size:0.7rem; cursor:pointer; font-weight:bold; white-space:nowrap;" title="Marcar como revisado">✓ VISTO</button></div>`);
                                }
                            });

                            let statusColor = "var(--text-dim)";
                            let borderColor = "var(--border-glass)";
                            if (incidents > 0) {
                                statusColor = "#FF3B30";
                                borderColor = "#FF3B3055";
                            } else if (pending > 0) {
                                statusColor = "#FF9800";
                                borderColor = "#FF980055";
                            } else if (total > 0 && pending === 0) {
                                statusColor = "#4CAF50";
                                borderColor = "#4CAF5055";
                            }

                            const cardElem = document.getElementById(cardId);
                            if(cardElem) {
                                cardElem.style.border = `1px solid ${borderColor}`;
                                cardElem.onclick = null; // Remove card-level click, use buttons instead
                                cardElem.style.cursor = 'default';
                                cardElem.innerHTML = `
                                    <div style="font-size:1.1rem; font-weight:bold; color:var(--brand-primary); margin-bottom:5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="Ruta: ${routeData.label}">Ruta: ${routeData.label}</div>
                                    <div style="font-size:0.7rem; color:var(--text-dim); margin-bottom:15px; font-weight:bold; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${names}">${names}</div>
                                    <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                                        <div style="text-align:center;">
                                            <div style="font-size:1.5rem; font-weight:bold;">${total}</div>
                                            <div style="font-size:0.7rem; color:var(--text-dim);">Total Bultos</div>
                                        </div>
                                        <div style="text-align:center;">
                                            <div style="font-size:1.5rem; font-weight:bold; color:#FF9800;">${pending}</div>
                                            <div style="font-size:0.7rem; color:var(--text-dim);">Pendientes</div>
                                        </div>
                                        <div style="text-align:center;">
                                            <div style="font-size:1.5rem; font-weight:bold; color:#4CAF50;">${delivered}</div>
                                            <div style="font-size:0.7rem; color:var(--text-dim);">Entregados</div>
                                        </div>
                                        ${incidents > 0 ? `<div style="text-align:center;">
                                            <div style="font-size:1.5rem; font-weight:bold; color:#FF3B30;">${incidents}</div>
                                            <div style="font-size:0.7rem; color:#FF3B30;">Incidencias</div>
                                        </div>` : ''}
                                    </div>
                                    ${incidentDetails.length > 0 ? `<div style="margin-top:10px; font-size:0.8rem; color:#FF3B30; background:rgba(255,59,48,0.1); padding:10px; border-radius:8px; text-align:left; max-height:250px; overflow-y:auto; line-height:1.6;">
                                        <strong style="display:block; margin-bottom:8px; font-size:0.85rem;">⚠️ Incidencias (click para gestionar):</strong>
                                        ${incidentDetails.join('')}
                                    </div>` : ''}
                                    <div style="display:flex; gap:8px; margin-top:12px; border-top:1px solid var(--border-glass); padding-top:12px;">
                                        <button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); openRouteDetails('${routeData.label}', '${pNum}')" style="flex:1; font-size:0.75rem; padding:8px;">📋 Ver Detalles</button>
                                        <button class="btn btn-outline btn-sm" onclick="event.stopPropagation(); openReassignRouteModal('${routeData.label}', '${pNum}')" style="flex:1; font-size:0.75rem; padding:8px; border-color:#FF9800; color:#FF9800;">🔄 Reasignar</button>
                                    </div>
                                `;
                            }
                        });
                        routeTowerUnsubscribes.push(unsub);
                    });

                } catch (e) {
                    console.error("Error conectando torre en tiempo real", e);
                    grid.innerHTML = '<div style="color:#FF3B30;">Error al conectar el monitor. Revisa la consola.</div>';
                }
                if (typeof hideLoading === 'function') hideLoading();
            }

            function openRouteDetails(label, phone) {
                currentRouteDetailPhone = phone;
                document.getElementById('route-details-title').textContent = "Albaranes en la ruta: " + label;
                document.getElementById('modal-route-details').style.display = 'flex';
                
                if (unsubscribeRouteMonitor) unsubscribeRouteMonitor();
                
                const tbody = document.getElementById('route-details-body');
                tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Cargando albaranes...</td></tr>';
                document.getElementById('route-details-select-all').checked = false; // Reset master checkbox
                
                unsubscribeRouteMonitor = db.collection('tickets').where('driverPhone', '==', phone).onSnapshot(snap => {
                    tbody.innerHTML = '';
                    if (snap.empty) {
                        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-dim);">No hay albaranes en esta ruta.</td></tr>';
                        return;
                    }

                    const docs = snap.docs.map(doc => ({id: doc.id, data: doc.data()}));
                    docs.sort((a,b) => {
                        if (a.data.status === 'Entregado' && b.data.status !== 'Entregado') return 1;
                        if (b.data.status === 'Entregado' && a.data.status !== 'Entregado') return -1;
                        return 0;
                    });

                    docs.forEach(item => {
                        const data = item.data;
                        const bultos = data.packagesList ? data.packagesList.reduce((s,p)=>s+(parseInt(p.qty)||1),0) : (data.packages || 1);
                        
                        let badgeColor = "var(--text-dim)";
                        if (data.status === 'Entregado') badgeColor = "#4CAF50";
                        else if (data.status === 'Incidencia' || data.status === 'Devuelto') badgeColor = "#FF3B30";
                        else badgeColor = "#FF9800";

                        const row = document.createElement('tr');
                        row.innerHTML = `
                            <td style="text-align:center;"><input type="checkbox" class="route-ticket-checkbox" value="${item.id}" style="cursor:pointer; transform:scale(1.2);"></td>
                            <td style="font-weight:bold;">${data.id}</td>
                            <td>
                                <div>${data.receiver || 'Desconocido'}</div>
                                <div style="font-size:0.75rem; color:var(--text-dim);">${data.address || ''}</div>
                            </td>
                            <td>${bultos}</td>
                            <td style="color:${badgeColor}; font-weight:bold;">${data.status || 'Pendiente'}</td>
                            <td>
                                <button class="btn btn-outline btn-sm" onclick="unassignTicketFromRoute('${item.id}')" title="Quitar de esta ruta">❌</button>
                                ${data.status === 'Incidencia' ? `<button class="btn btn-sm btn-outline" style="border-color:#FF9800; color:#FF9800; margin-left:5px;" onclick="openIncidentManagerModal('${item.id}')" title="Gestionar / Resolver Incidencia">⚙️ RESOLVER</button>` : ''}
                            </td>
                        `;
                        tbody.appendChild(row);
                    });
                }, err => {
                    console.error(err);
                    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#FF3B30;">Error al leer albaranes.</td></tr>';
                });
            }

            window.openIncidentManagerModal = async (tid) => {
                document.getElementById('modal-incident-manager').style.display = 'flex';
                document.getElementById('incident-m-id').textContent = tid;
                document.getElementById('incident-m-reason').textContent = "Cargando...";
                document.getElementById('incident-m-packages').value = "";
                
                try {
                    const docSnap = await db.collection('tickets').doc(tid).get();
                    if(docSnap.exists) {
                        const data = docSnap.data();
                        document.getElementById('incident-m-reason').textContent = data.incidentReason || "Sin reportar / Causa abstracta";
                        const bultos = data.packagesList ? data.packagesList.reduce((s,p)=>s+(parseInt(p.qty)||1),0) : (data.packages || 1);
                        document.getElementById('incident-m-packages').value = bultos;
                        document.getElementById('incident-m-status').value = data.status || 'Incidencia';
                        window.currentIncidentTicketData = data; 
                    } else {
                        document.getElementById('incident-m-reason').textContent = "Albarán no encontrado.";
                    }
                } catch(e) { console.error("Error cargando incidencia:", e); }
            };

            window.saveIncidentResolution = async () => {
                const tid = document.getElementById('incident-m-id').textContent;
                const newStatus = document.getElementById('incident-m-status').value;
                const newPkgCount = parseInt(document.getElementById('incident-m-packages').value);
                
                if(!tid) { alert("Error: Sin ID de albarán."); return; }
                
                const data = window.currentIncidentTicketData;
                if(!data) { alert("Error: Datos del albarán no cargados. Cierra y abre de nuevo."); return; }

                if(isNaN(newPkgCount) || newPkgCount < 1) { alert("Indicador de bultos inválido."); return; }

                if(confirm("¿Confirmas la resolución de esta incidencia? Se actualizará el estado permanentemente.")) {
                    if (typeof showLoading === 'function') showLoading();
                    try {
                        let updates = { status: newStatus, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
                        let logMsg = "\nRESOLUCIÓN ADMIN - " + new Date().toLocaleString() + ": Pasado a " + newStatus + ".";
                        
                        const oldBultos = data.packagesList ? data.packagesList.reduce((s,p)=>s+(parseInt(p.qty)||1),0) : (data.packages || 1);
                        if(newPkgCount !== oldBultos) {
                            let newList = data.packagesList ? JSON.parse(JSON.stringify(data.packagesList)) : [];
                            if(newList.length > 0) { newList[0].qty = newPkgCount; } 
                            else { newList = [{qty: newPkgCount, size: 'Bulto', weight: data.weight||1}]; }
                            updates.packages = newPkgCount;
                            updates.packagesList = newList;
                            logMsg += " Bultos modificados de " + oldBultos + " a " + newPkgCount + ".";
                        }

                        if(newStatus === 'Pendiente' || newStatus === 'Entregado') {
                            updates.incidentReason = firebase.firestore.FieldValue.delete();
                        }
                        updates.notes = (data.notes || '') + logMsg;
                        
                        if(newStatus === 'Entregado' && data.status !== 'Entregado') {
                           updates.deliveredAt = firebase.firestore.FieldValue.serverTimestamp();
                           updates.deliveredBy = 'ADMIN - GESTIÓN INCIDENCIAS';
                           updates.syncStatus = 'completed';
                        }

                        await db.collection('tickets').doc(tid).update(updates);
                        
                        alert("✅ Incidencia resuelta correctamente. Estado: " + newStatus);
                        document.getElementById('modal-incident-manager').style.display = 'none';
                        setTimeout(loadRouteMonitor, 500);
                    } catch(e) { 
                        console.error("Error guardando resolución:", e);
                        alert("Error al resolver: " + e.message); 
                    }
                    if (typeof hideLoading === 'function') hideLoading();
                }
            };

            window.unassignTicketFromRoute = async (tid) => {
                if (confirm(`¿Estás seguro de que quieres desasignar el albarán ${tid} de esta ruta?\nDesaparecerá del móvil del repartidor inmediatamente.`)) {
                    try {
                        await db.collection('tickets').doc(tid).update({
                            driverPhone: firebase.firestore.FieldValue.delete()
                        });
                        setTimeout(loadRouteMonitor, 1000);
                    } catch (e) {
                        alert("Error al desasignar: " + e.message);
                    }
                }
            };

            window.toggleAllRouteTickets = (elem) => {
                document.querySelectorAll('.route-ticket-checkbox').forEach(cb => cb.checked = elem.checked);
            };

            window.unassignSelectedRouteTickets = async () => {
                const checked = document.querySelectorAll('.route-ticket-checkbox:checked');
                if (checked.length === 0) {
                    alert("Selecciona al menos un albarán marcando sus casillas.");
                    return;
                }
                if (confirm(`¿Desasignar los ${checked.length} albaranes marcados de esta ruta?\nDesaparecerán del móvil inmediatamente.`)) {
                    if (typeof showLoading === 'function') showLoading();
                    try {
                        const batch = db.batch();
                        checked.forEach(cb => {
                            batch.update(db.collection('tickets').doc(cb.value), {
                                driverPhone: firebase.firestore.FieldValue.delete()
                            });
                        });
                        await batch.commit();
                        document.getElementById('route-details-select-all').checked = false;
                        setTimeout(loadRouteMonitor, 1000);
                    } catch (e) {
                        alert("Error múltiple: " + e.message);
                    }
                    if (typeof hideLoading === 'function') hideLoading();
                }
            };

            // --- DELETE SELECTED ROUTE TICKETS ---
            window.deleteSelectedRouteTickets = async () => {
                const checked = document.querySelectorAll('.route-ticket-checkbox:checked');
                if (checked.length === 0) {
                    alert('Selecciona al menos un albarán marcando sus casillas.');
                    return;
                }
                if (!confirm(`⚠️ ¿Estás seguro de que quieres ELIMINAR ${checked.length} albarán(es)?\n\nEsta acción es PERMANENTE y no se puede deshacer.`)) return;
                if (!confirm(`🔴 CONFIRMACIÓN FINAL: Se van a eliminar ${checked.length} albaranes de forma permanente. ¿Continuar?`)) return;

                if (typeof showLoading === 'function') showLoading();
                try {
                    const batch = db.batch();
                    checked.forEach(cb => {
                        batch.delete(db.collection('tickets').doc(cb.value));
                    });
                    await batch.commit();
                    document.getElementById('route-details-select-all').checked = false;
                    alert(`✅ ${checked.length} albarán(es) eliminados correctamente.`);
                    setTimeout(loadRouteMonitor, 1000);
                } catch (e) {
                    console.error('Error eliminando albaranes:', e);
                    alert('Error al eliminar: ' + e.message);
                }
                if (typeof hideLoading === 'function') hideLoading();
            };

            // --- ACKNOWLEDGE DRIVER MODIFICATION ---
            window.acknowledgeDriverModification = async (ticketId) => {
                try {
                    await db.collection('tickets').doc(ticketId).update({
                        adminAcknowledged: true
                    });
                } catch (e) {
                    console.error('Error al marcar como visto:', e);
                    alert('Error: ' + e.message);
                }
            };

            // --- REASSIGN ROUTE FUNCTIONS ---
            window._reassignTicketIds = [];
            window._reassignOriginPhone = '';

            window.openReassignRouteModal = async (label, phone) => {
                window._reassignOriginPhone = phone;
                document.getElementById('reassign-origin').textContent = label;
                
                // Get all ticket IDs for this route
                const snap = await db.collection('tickets').where('driverPhone', '==', phone).get();
                window._reassignTicketIds = snap.docs.map(d => d.id);
                document.getElementById('reassign-info').textContent = `Se reasignarán ${window._reassignTicketIds.length} albaranes de la ruta "${label}".`;
                
                // Load available routes
                const phoneSnap = await db.collection('config').doc('phones').collection('list').get();
                const sel = document.getElementById('reassign-target-route');
                sel.innerHTML = '<option value="">-- Seleccionar ruta destino --</option>';
                phoneSnap.forEach(doc => {
                    const r = doc.data();
                    if (r.number !== phone) { // Exclude the current route
                        sel.innerHTML += `<option value="${r.number}">${r.label} (${r.number})</option>`;
                    }
                });
                
                document.getElementById('modal-reassign-route').style.display = 'flex';
            };

            window.reassignSelectedRouteTickets = async () => {
                const checked = document.querySelectorAll('.route-ticket-checkbox:checked');
                if (checked.length === 0) {
                    alert("Selecciona al menos un albarán marcando sus casillas.");
                    return;
                }
                window._reassignTicketIds = Array.from(checked).map(cb => cb.value);
                document.getElementById('reassign-origin').textContent = document.getElementById('route-details-title').textContent.replace('Albaranes en la ruta: ', '');
                document.getElementById('reassign-info').textContent = `Se reasignarán ${window._reassignTicketIds.length} albaranes seleccionados.`;
                
                // Load available routes
                const phoneSnap = await db.collection('config').doc('phones').collection('list').get();
                const sel = document.getElementById('reassign-target-route');
                sel.innerHTML = '<option value="">-- Seleccionar ruta destino --</option>';
                phoneSnap.forEach(doc => {
                    const r = doc.data();
                    if (r.number !== currentRouteDetailPhone) {
                        sel.innerHTML += `<option value="${r.number}">${r.label} (${r.number})</option>`;
                    }
                });
                
                document.getElementById('modal-reassign-route').style.display = 'flex';
            };

            window.executeReassign = async () => {
                const targetPhone = document.getElementById('reassign-target-route').value;
                if (!targetPhone) {
                    alert("Selecciona una ruta destino.");
                    return;
                }
                if (window._reassignTicketIds.length === 0) {
                    alert("No hay albaranes para reasignar.");
                    return;
                }
                
                const targetLabel = document.getElementById('reassign-target-route').selectedOptions[0].text;
                if (!confirm(`¿Reasignar ${window._reassignTicketIds.length} albaranes a ${targetLabel}?\n\nLos albaranes desaparecerán de la ruta actual y aparecerán en el móvil de la ruta destino.`)) return;
                
                if (typeof showLoading === 'function') showLoading();
                try {
                    const batch = db.batch();
                    window._reassignTicketIds.forEach(tid => {
                        batch.update(db.collection('tickets').doc(tid), {
                            driverPhone: targetPhone
                        });
                    });
                    await batch.commit();
                    
                    document.getElementById('modal-reassign-route').style.display = 'none';
                    document.getElementById('modal-route-details').style.display = 'none';
                    alert(`✅ ${window._reassignTicketIds.length} albaranes reasignados a ${targetLabel}.`);
                    setTimeout(loadRouteMonitor, 500);
                } catch (e) {
                    alert("Error al reasignar: " + e.message);
                }
                if (typeof hideLoading === 'function') hideLoading();
            };


            if (btnAddPhone) btnAddPhone.onclick = () => { 
                addPhoneForm.reset();
                if(document.getElementById('edit-phone-id')) document.getElementById('edit-phone-id').value = '';
                if (addPhoneModal) addPhoneModal.style.display = 'flex'; 
            };
            if (btnClosePhoneModal) btnClosePhoneModal.onclick = () => { if (addPhoneModal) addPhoneModal.style.display = 'none'; };
            window.openNewUserModal = () => {
                document.getElementById('modal-user-title').textContent = "Añadir Nuevo Cliente";
                document.getElementById('edit-user-uid').value = "";
                addUserForm.reset();
                // Auto-generar el siguiente ID lógico
                document.getElementById('new-user-id-num').value = getNextUserId();
                if(document.getElementById('new-user-billing-company')) document.getElementById('new-user-billing-company').value = '';
                addUserModal.style.display = 'flex';
                window.scrollTo(0, 0);
                addUserModal.scrollTop = 0;
            };
            btnCloseModal.onclick = () => addUserModal.style.display = 'none';
            // Logout is now handled by inline onclick for maximum reliability

            // Tariff Management Logic
            // Variables moved to top for initialization safety

            async function loadTariffClients() {
                const select = document.getElementById('tariff-client-select');
                if (!select) return;
                select.innerHTML = '<option value="">Cargando clientes...</option>';

                try {
                    if (Object.keys(userMap).length === 0) await loadUsers();
                    allClientsForTariff = Object.keys(userMap).map(uid => ({ uid, ...userMap[uid] }));
                    renderFilteredTariffClients('');
                    populateGlobalTariffsDatalist();
                } catch (e) { console.error(e); }
            }

            async function populateGlobalTariffsDatalist() {
                const globalDatalist = document.getElementById('global-tariffs-datalist');
                const globalSelect = document.getElementById('new-user-tariff-id');
                if (!globalDatalist && !globalSelect) return;
                if (globalDatalist) globalDatalist.innerHTML = '';
                if (globalSelect) globalSelect.innerHTML = '<option value="">-- Sin Tarifa Global --</option>';

                try {
                    const tariffSnap = await db.collection('tariffs').get();
                    const globalIds = [];
                    tariffSnap.forEach(doc => { if (doc.id.startsWith("GLOBAL_")) globalIds.push(doc.id.replace("GLOBAL_", "")); });
                    globalIds.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).forEach(id => {
                        if (globalDatalist) { const o = document.createElement('option'); o.value = id; globalDatalist.appendChild(o); }
                        if (globalSelect) { const o = document.createElement('option'); o.value = id; o.textContent = "Tarifa Global #" + id; globalSelect.appendChild(o); }
                    });
                } catch (e) { console.error(e); }
            }

            function renderFilteredTariffClients(filter) {
                const select = document.getElementById('tariff-client-select');
                select.innerHTML = '<option value="">-- Seleccionar un Cliente --</option>';
                const f = filter.toLowerCase();
                allClientsForTariff.filter(c => (c.name || '').toLowerCase().includes(f) || (c.idNum || '').toLowerCase().includes(f)).forEach(c => {
                    const opt = document.createElement('option');
                    opt.value = c.uid;
                    opt.textContent = `[#${c.idNum || '---'}] ${c.name || c.email} `;
                    select.appendChild(opt);
                });
            }

            document.getElementById('btn-load-tariff').onclick = () => {
                const uid = document.getElementById('tariff-client-select').value;
                if (!uid) { alert("Selecciona un cliente"); return; }
                currentTariffUID = uid;
                activeSubTariff = null;
                // Switch to global tab to show editor (editor lives there)
                if(typeof window.showTariffTab === 'function') window.showTariffTab('global');
                document.getElementById('sub-tariff-tabs').style.display = 'none';
                document.getElementById('tariff-editor-area').style.display = 'block';
                const clientName = window.userMap[uid] ? window.userMap[uid].name : uid;
                document.getElementById('tariff-editor-title').textContent = "Tarifa de: " + clientName;
                document.getElementById('btn-delete-global-tariff').style.display = 'none';
                loadTariffTable(uid);
            };

            document.getElementById('btn-load-global-tariff').onclick = () => {
                const tid = document.getElementById('tariff-global-id').value.trim();
                if (!tid) { alert("ID de Tarifa Global"); return; }
                currentTariffUID = "GLOBAL_" + tid;
                window.currentTariffUID = currentTariffUID;
                activeSubTariff = null;
                document.getElementById('sub-tariff-tabs').style.display = 'flex';
                document.getElementById('tariff-editor-area').style.display = 'block';
                document.getElementById('tariff-editor-title').textContent = "Editar Tarifa Global #" + tid;
                document.getElementById('btn-delete-global-tariff').style.display = 'inline-block';
                loadTariffTable(currentTariffUID);
            };

            async function loadTariffTable(uid) {
                const tbody = document.getElementById('tariff-items-body');
                tbody.innerHTML = '<tr><td colspan="3">Cargando...</td></tr>';
                try {
                    const doc = await db.collection('tariffs').doc(uid).get();
                    currentTariffDocData = doc.exists ? doc.data() : { items: {}, subTariff: {} };
                    renderTariffLevel();
                    if (uid.startsWith("GLOBAL_")) renderSubTariffTabs();
                } catch (e) { console.error(e); }
            }

            function renderSubTariffTabs() {
                const container = document.getElementById('sub-tariff-list');
                container.innerHTML = '';

                // Main tab
                const btnMain = document.createElement('button');
                btnMain.className = activeSubTariff === null ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-outline';
                btnMain.textContent = "ESTÁNDAR (PRINCIPAL)";
                btnMain.onclick = () => { activeSubTariff = null; renderTariffLevel(); renderSubTariffTabs(); };
                container.appendChild(btnMain);

                const subs = currentTariffDocData.subTariff || {};
                Object.keys(subs).forEach(subName => {
                    const btn = document.createElement('button');
                    btn.className = activeSubTariff === subName ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-outline';
                    btn.textContent = subName.toUpperCase();
                    btn.onclick = () => { activeSubTariff = subName; renderTariffLevel(); renderSubTariffTabs(); };
                    container.appendChild(btn);
                });
            }

            function renderTariffLevel() {
                const tbody = document.getElementById('tariff-items-body');
                tbody.innerHTML = '';
                const items = activeSubTariff ? (currentTariffDocData.subTariff[activeSubTariff] || {}) : (currentTariffDocData.items || {});

                document.getElementById('sub-tariff-controls').style.display = activeSubTariff ? 'block' : 'none';

                const keys = Object.keys(items);
                if (keys.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:#888;">No hay artículos.</td></tr>';
                    return;
                }
                keys.forEach(name => {
                    const row = document.createElement('tr');
                    const price = parseFloat(items[name]).toFixed(2);
                    row.innerHTML = `<td style="font-weight:700">${name}</td><td>${price}€</td>
                    <td style="text-align:right"><button class="btn btn-sm tariff-edit-btn" style="background:#007acc; color:white; border:none; margin-right:4px; cursor:pointer; padding:2px 8px;">✏️</button><button class="btn btn-danger btn-sm tariff-del-btn">🗑️</button></td>`;
                    // Bind edit
                    row.querySelector('.tariff-edit-btn').addEventListener('click', () => editTariffItem(name, parseFloat(items[name])));
                    row.querySelector('.tariff-del-btn').addEventListener('click', () => deleteTariffItem(name));
                    tbody.appendChild(row);
                });
            }

            document.getElementById('btn-add-tariff-item').onclick = async () => {
                const name = document.getElementById('new-tariff-item-name').value.trim();
                const price = parseFloat(document.getElementById('new-tariff-item-price').value);
                if (!name || isNaN(price)) { alert("Completa nombre y precio"); return; }

                try {
                    if (!currentTariffDocData) currentTariffDocData = { items: {}, subTariff: {} };
                    if (activeSubTariff) {
                        if (!currentTariffDocData.subTariff) currentTariffDocData.subTariff = {};
                        if (!currentTariffDocData.subTariff[activeSubTariff]) currentTariffDocData.subTariff[activeSubTariff] = {};
                        currentTariffDocData.subTariff[activeSubTariff][name] = price;
                    } else {
                        if (!currentTariffDocData.items) currentTariffDocData.items = {};
                        currentTariffDocData.items[name] = price;
                    }
                    await db.collection('tariffs').doc(currentTariffUID).set(currentTariffDocData, { merge: true });
                    document.getElementById('new-tariff-item-price').value = '';
                    renderTariffLevel();
                } catch (e) { alert("Error al guardar."); }
            };

            window.editTariffItem = async (oldName, oldPrice) => {
                // Find the row by iterating tbody
                const tbody = document.getElementById('tariff-items-body');
                const rows = tbody.querySelectorAll('tr');
                for (const row of rows) {
                    const cells = row.querySelectorAll('td');
                    if (cells.length >= 3 && cells[0].textContent.trim() === oldName) {
                        // Transform row into inline edit mode
                        cells[0].innerHTML = `<input type="text" value="${oldName.replace(/"/g, '&quot;')}" style="width:100%; padding:3px 6px; background:#1e1e1e; border:1px solid #007acc; color:white; border-radius:3px; font-size:0.85rem;" id="edit-tariff-name">`;
                        cells[1].innerHTML = `<input type="number" step="0.01" value="${oldPrice}" style="width:80px; padding:3px 6px; background:#1e1e1e; border:1px solid #007acc; color:white; border-radius:3px; font-size:0.85rem;" id="edit-tariff-price">`;
                        cells[2].innerHTML = `<button style="background:#4CAF50; color:white; border:none; padding:3px 10px; cursor:pointer; border-radius:3px; font-size:0.85rem;" id="btn-save-tariff-edit">💾</button>`;
                        document.getElementById('edit-tariff-name').focus();
                        
                        document.getElementById('btn-save-tariff-edit').onclick = async () => {
                            const newName = document.getElementById('edit-tariff-name').value.trim();
                            const newPrice = parseFloat(document.getElementById('edit-tariff-price').value);
                            if (!newName || isNaN(newPrice)) return;
                            try {
                                const items = activeSubTariff ? currentTariffDocData.subTariff[activeSubTariff] : currentTariffDocData.items;
                                if (newName !== oldName) delete items[oldName];
                                items[newName] = newPrice;
                                await db.collection('tariffs').doc(currentTariffUID).set(currentTariffDocData, { merge: true });
                                renderTariffLevel();
                            } catch (e) { console.error('Error al editar:', e); }
                        };
                        break;
                    }
                }
            };

            window.deleteTariffItem = async (name) => {
                if (!confirm(`¿Eliminar ${name}?`)) return;
                try {
                    if (activeSubTariff) {
                        delete currentTariffDocData.subTariff[activeSubTariff][name];
                    } else {
                        delete currentTariffDocData.items[name];
                    }
                    await db.collection('tariffs').doc(currentTariffUID).set(currentTariffDocData);
                    renderTariffLevel();
                } catch (e) { alert("Error al eliminar."); }
            };

            window.promptCreateSubTariff = () => {
                const name = prompt("Nombre de la Sub-Tarifa (Ej: ZONA_A, VIP, URGENTE):");
                if (!name) return;
                const subName = name.trim().toUpperCase();
                if (!currentTariffDocData.subTariff) currentTariffDocData.subTariff = {};
                if (currentTariffDocData.subTariff[subName]) { alert("Ya existe una sub-tarifa con ese nombre."); return; }

                // Initializing with same articles as main but price 0 (or can clone main)
                currentTariffDocData.subTariff[subName] = { ...currentTariffDocData.items };
                activeSubTariff = subName;
                renderSubTariffTabs();
                renderTariffLevel();
            };

            window.deleteCurrentSubTariff = async () => {
                if (!activeSubTariff) return;
                if (!confirm(`¿Eliminar permanentemente la sub - tarifa ${activeSubTariff}?`)) return;
                delete currentTariffDocData.subTariff[activeSubTariff];
                activeSubTariff = null;
                await db.collection('tariffs').doc(currentTariffUID).set(currentTariffDocData);
                renderSubTariffTabs();
                renderTariffLevel();
            };

            // MODAL LOGIC MOVED AND CONSOLIDATED BELOW (Line 5081+)

            // DEPRECATED MODAL LOGIC REMOVED


            window.deleteAdminDest = async (docId) => {
                if (!confirm("¿Eliminar esta entrada de la agenda?")) return;
                showLoading();
                try {
                    const uid = adminTicketUID;
                    const uData = userMap[uid] || {};
                    const targetUid = uData.authUid || uData.id || uid;
                    if (!targetUid || targetUid === "") throw new Error("ID de cliente no válido.");
                    await db.collection('users').doc(targetUid).collection('destinations').doc(docId).delete();
                    loadAdminDestList();
                    loadAdminTicketDestinations(uid);
                } catch (e) {
                    alert("Error: " + e.message);
                } finally {
                    hideLoading();
                }
            };



            loadUsers();
            populateGlobalTariffsDatalist();

            // --- BILLING / ACCOUNTING SYSTEM ---

            async function initBillingView() {
                loadFiscalData();
                loadInvoices();
            }

            async function loadFiscalData() {
                const doc = await db.collection('config').doc('fiscal').get();
                if (doc.exists) {
                    invCompanyData = doc.data();
                    document.getElementById('fiscal-name').value = invCompanyData.name || '';
                    document.getElementById('fiscal-cif').value = invCompanyData.cif || '';
                    document.getElementById('fiscal-address').value = invCompanyData.address || '';
                    document.getElementById('fiscal-email').value = invCompanyData.email || '';
                    document.getElementById('fiscal-bank').value = invCompanyData.bank || '';
                    document.getElementById('fiscal-sepa-id').value = invCompanyData.sepaId || '';
                    document.getElementById('fiscal-iva').value = invCompanyData.iva || 21;
                    document.getElementById('fiscal-irpf').value = invCompanyData.irpf || 0;
                }
            }

            const btnSaveFiscal = document.getElementById('btn-save-fiscal');
            if (btnSaveFiscal) {
                btnSaveFiscal.onclick = async () => {
                    const data = {
                        name: document.getElementById('fiscal-name').value.trim(),
                        cif: document.getElementById('fiscal-cif').value.trim(),
                        address: document.getElementById('fiscal-address').value.trim(),
                        email: document.getElementById('fiscal-email').value.trim(),
                        bank: document.getElementById('fiscal-bank').value.trim(),
                        sepaId: document.getElementById('fiscal-sepa-id').value.trim(),
                        iva: parseFloat(document.getElementById('fiscal-iva').value) || 0,
                        irpf: parseFloat(document.getElementById('fiscal-irpf').value) || 0,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    };
                    await db.collection('config').doc('fiscal').set(data);
                    invCompanyData = data;
                };
            }

            const btnBillingConf = document.getElementById('btn-billing-config');
            if (btnBillingConf) {
                btnBillingConf.onclick = () => {
                    const section = document.getElementById('billing-config-section');
                    section.style.display = section.style.display === 'none' ? 'block' : 'none';
                };
            }

            const btnGenInvView = document.getElementById('btn-generate-invoice-view');
            if (btnGenInvView) {
                btnGenInvView.onclick = () => {
                    document.getElementById('modal-generate-invoice').style.display = 'flex';
                    document.getElementById('inv-client-search').value = '';
                    populateInvoiceClientSelect();
                    const today = new Date();
                    const thirtyDaysAgo = new Date(today);
                    thirtyDaysAgo.setDate(today.getDate() - 30);

                    const fromStr = thirtyDaysAgo.toISOString().split('T')[0];
                    const toStr = today.toISOString().split('T')[0];

                    document.getElementById('inv-date-from').value = fromStr;
                    document.getElementById('inv-date-to').value = toStr;
                };
            }

            const btnCloseInvModal = document.getElementById('btn-close-inv-modal');
            if (btnCloseInvModal) {
                btnCloseInvModal.onclick = () => {
                    document.getElementById('modal-generate-invoice').style.display = 'none';
                };
            }

            function populateInvoiceClientSelect(filter = "") {
                const select = document.getElementById('inv-client-select');
                select.innerHTML = '<option value="">-- Seleccionar Cliente --</option>';

                // Filter duplicates (UID vs Email) to avoid showing same client twice
                const uniqueEntries = [];
                const seenIds = new Set();
                Object.values(userMap).forEach(u => {
                    if (!u.id || seenIds.has(u.id)) return;
                    seenIds.add(u.id);
                    uniqueEntries.push(u);
                });

                uniqueEntries.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

                const f = filter.toLowerCase();
                uniqueEntries.forEach(u => {
                    const searchStr = ((u.name || "") + " " + (u.idNum || "") + " " + (u.email || "")).toLowerCase();
                    if (f && !searchStr.includes(f)) return;

                    const opt = document.createElement('option');
                    opt.value = u.id; // Correct authoritative document ID
                    opt.textContent = `[#${u.idNum || '?'}] ${u.name || 'Sin Nombre'} `;
                    select.appendChild(opt);
                });
            }

            document.getElementById('inv-client-select').onchange = (e) => loadInvoiceCompanies(e.target.value);
            document.getElementById('inv-company-select').onchange = refreshUnbilledList;
            document.getElementById('inv-date-from').onchange = refreshUnbilledList;
            document.getElementById('inv-date-to').onchange = refreshUnbilledList;

            async function loadInvoiceCompanies(uid) {
                const select = document.getElementById('inv-company-select');
                const tbody = document.getElementById('unbilled-tickets-body');

                if (!uid) {
                    select.innerHTML = '<option value="">-- Primero elije cliente --</option>';
                    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Selecciona un cliente para comenzar.</td></tr>';
                    return;
                }

                select.innerHTML = '<option value="">Buscando empresas...</option>';
                try {
                    const aliases = await getClientDocAliases(uid);
                    let snap = null;
                    let workingUid = uid;

                    for (const id of aliases) {
                        const s = await db.collection('users').doc(id).collection('companies').get();
                        if (!s.empty) {
                            snap = s;
                            workingUid = id;
                            break;
                        }
                    }

                    if (!snap || snap.empty) {
                        console.warn("[Billing] No se encontraron empresas para este cliente. Añadiendo opción virtual de Empresa Principal.");
                        const uData = userMap[uid] || {};
                        adminCompaniesCache['comp_main'] = {
                            name: uData.name || 'Empresa Principal',
                            address: uData.senderAddress || 'Sede Central',
                            subTariffId: uData.subTariffId || ''
                        };
                        select.innerHTML = '<option value="comp_main">🏠 Empresa Principal (Automática)</option>';
                        select.value = "comp_main";
                        refreshUnbilledList();
                    } else {
                        console.log(`[Billing] Éxito.Usando UID: ${workingUid}.Encontradas: ${snap.size} `);
                        // Guardamos el workingUid en el select para que refreshUnbilledList lo use
                        select.dataset.workingUid = workingUid;

                        let html = '<option value="ALL">-- TODAS LAS EMPRESAS --</option>';
                        let firstId = "";
                        snap.forEach(doc => {
                            const data = doc.data();
                            adminCompaniesCache[doc.id] = data; // Cache for pricing logic
                            html += `<option value="${doc.id}">${data.name || 'Empresa sin nombre'}</option>`;
                            if (!firstId) firstId = doc.id;
                        });
                        select.innerHTML = html;

                        if (snap.size === 1) {
                            select.value = firstId;
                        } else {
                            select.value = "ALL";
                        }

                        refreshUnbilledList();
                    }
                } catch (e) {
                    console.error("Error crítico cargando empresas:", e);
                    select.innerHTML = '<option value="">Error de conexión</option>';
                    tbody.innerHTML = `<tr> <td colspan="6" style="text-align:center; color:#FF3B30;">Error al acceder a la nube: ${e.message}</td></tr> `;
                }
            }

            // Buscador de clientes en el modal de factura
            document.getElementById('inv-client-search').oninput = (e) => {
                populateInvoiceClientSelect(e.target.value);
            };

            // Seleccionar/Deseleccionar todos los albaranes
            document.getElementById('inv-select-all').onchange = (e) => {
                const checks = document.querySelectorAll('.inv-ticket-check');
                checks.forEach(c => c.checked = e.target.checked);
                updateInvoiceCalculations();
            };

            async function refreshUnbilledList() {
                const selectComp = document.getElementById('inv-company-select');
                const selectedUid = document.getElementById('inv-client-select').value;
                const uidInSelect = selectComp.dataset.workingUid; // El UID real detectado al cargar empresas
                const compId = selectComp.value;
                const from = document.getElementById('inv-date-from').value;
                const to = document.getElementById('inv-date-to').value;
                const tbody = document.getElementById('unbilled-tickets-body');

                if (!selectedUid) {
                    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Selecciona un cliente para comenzar.</td></tr>';
                    return;
                }
                // En modo inteligente, si no hay empresa seleccionada pero hay client, buscamos igual
                tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Sincronizando con los listados globales...</td></tr>';

                try {
                    // Ensure all necessary data for pricing is present
                    if (Object.keys(tariffsCache).length === 0) {
                        console.log("[Billing] Pre-loading tariffs...");
                        const tSnap = await db.collection('tariffs').get();
                        tSnap.forEach(d => { tariffsCache[d.id] = d.data(); });
                    }

                    // Ensure userMap is reasonably populated
                    if (Object.keys(userMap).length < 2) {
                        console.log("[Billing] Pre-loading users...");
                        const uSnap = await db.collection('users').get();
                        uSnap.forEach(d => { userMap[d.id] = d.data(); if (d.data().authUid) userMap[d.data().authUid] = d.data(); });
                    }

                    const uData = userMap[selectedUid] || {};
                    const idNumStr = String(uData.idNum || '').trim();
                    const authUid = uData.authUid || selectedUid;

                    // PRECIO QUERY OPTIMIZADA: Buscamos por ID de cliente o por UID
                    // Intentamos buscar por clientIdNum que es lo más consistente
                    let query = db.collection('tickets');
                    if (idNumStr) {
                        query = query.where('clientIdNum', '==', idNumStr);
                    } else {
                        query = query.where('uid', '==', authUid);
                    }

                    const snap = await query.limit(2000).get();

                    let tickets = [];
                    let filteredByDate = 0;
                    let filteredByBilled = 0;
                    let matchCount = 0;

                    const targetUid = authUid;
                    const targetEmail = (uData.email || '').toLowerCase();
                    const targetIdNum = idNumStr;
                    const targetName = (uData.name || '').toLowerCase();
                    const targetSenderAddr = (uData.senderAddress || '').toLowerCase();

                    snap.forEach(doc => {
                        const t = doc.data();
                        const ticketOwnerUid = t.uid || '';
                        const pathCompId = t.compId || 'comp_main';
                        const docClientIdNum = String(t.clientIdNum || '');
                        const docSender = (t.sender || '').toLowerCase();
                        const docSenderAddr = (t.senderAddress || '').toLowerCase();

                        // VALIDACIÓN MULTI-FACTOR PERFECCIONADA
                        const isOwner = (ticketOwnerUid === targetUid) ||
                            (t.clientIdNum && targetIdNum && String(t.clientIdNum) === targetIdNum) ||
                            (targetName && docSender.includes(targetName)) ||
                            (targetEmail && t.email && t.email.toLowerCase() === targetEmail) ||
                            (targetSenderAddr && docSenderAddr && docSenderAddr.includes(targetSenderAddr));

                        if (!isOwner) return;
                        matchCount++;

                        // 2. FILTRAR POR ESTADO DE FACTURACIÓN
                        if (t.invoiceId && String(t.invoiceId).trim() !== "" && String(t.invoiceId).toLowerCase() !== "null") {
                            filteredByBilled++;
                            return;
                        }

                        // 3. FILTRAR POR EMPRESA (Lógica inteligente para 'Empresa Principal')
                        const isMainCompSelected = (compId === "comp_main" || compId === "default" || !compId);
                        const isMainPathComp = (pathCompId === "comp_main" || pathCompId === "default" || pathCompId === "tickets");

                        if (compId && compId !== "ALL") {
                            if (isMainCompSelected) {
                                // Si seleccionamos la principal, aceptamos cualquier ID de "Principal"
                                if (!isMainPathComp) return;
                            } else {
                                // Si seleccionamos una específica secundaría, debe coincidir exactamente
                                if (pathCompId !== compId) return;
                            }
                        }

                        // 4. FILTRAR POR FECHA
                        const date = (t.createdAt && t.createdAt.toDate) ? t.createdAt.toDate() : (t.createdAt ? new Date(t.createdAt) : null);
                        if (date && !isNaN(date.getTime())) {
                            const iso = date.toISOString().split('T')[0];
                            if ((from && iso < from) || (to && iso > to)) { filteredByDate++; return; }
                        } else if (from || to) { filteredByDate++; return; }

                        const compName = (userCompaniesMap[targetUid] && userCompaniesMap[targetUid][pathCompId]) ? userCompaniesMap[targetUid][pathCompId] : "";

                        tickets.push({
                            ...t,
                            docId: doc.id,
                            compId: pathCompId,
                            compName: compName,
                            uid: ticketOwnerUid || targetUid
                        });
                    });

                    unbilledTickets = tickets;

                    if (tickets.length === 0) {
                        let msg = "No hay albaranes pendientes";
                        let detail = "";
                        if (matchCount === 0) {
                            detail = `Se han analizado todos los albaranes de la nube, pero ninguno parece pertenecer a este cliente(${uData.name || 'Desconocido'}).`;
                        } else {
                            detail = `${filteredByBilled} ya están facturados, ${filteredByDate} fuera de fecha o empresa seleccionada diferente.`;
                        }

                        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 30px;">
                        <div style="font-weight:600; color:var(--text-dim);">${msg}</div>
                        <div style="margin-top:10px; font-size:0.8rem; color:#888;">${detail}</div>
                    </td></tr>`;
                    } else {
                        renderUnbilledTable();
                        updateInvoiceCalculations();
                    }
                    document.getElementById('inv-select-all').checked = true;
                } catch (e) {
                    console.error("Error crítico en Billing Sync (v2.4):", e);
                    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:red; padding:20px;">
                    <strong>Error de sincronización (v2.4)</strong><br>
                    <small style="color:#666;">${e.message || 'Error desconocido'}</small><br>
                    <button class="btn btn-xs btn-outline" style="margin-top:10px;" onclick="refreshUnbilledList()">Reintentar</button>
                </td></tr>`;
                }
            }
            function renderUnbilledTable() {
                const uidInput = document.getElementById('inv-client-select');
                const compInput = document.getElementById('inv-company-select');
                const uid = uidInput ? uidInput.value : '';
                const selectedCompId = compInput ? compInput.value : 'comp_main';
                const tbody = document.getElementById('unbilled-tickets-body');
                tbody.innerHTML = '';

                unbilledTickets.forEach((t, i) => {
                    const date = (t.createdAt && t.createdAt.toDate) ? t.createdAt.toDate() : new Date(t.createdAt);
                    const pkgs = t.packagesList ? t.packagesList.reduce((s, p) => s + (parseInt(p.qty) || 1), 0) : 1;

                    // IMPORTANT: Use the selected company from the dropdown if it's not "ALL"
                    // This ensures the price reflects the sub-tariff the admin expects to use.
                    const activeCompId = (selectedCompId && selectedCompId !== 'ALL') ? selectedCompId : (t.compId || 'comp_main');
                    const price = calculateTicketPriceSync(t, uid, activeCompId);
                    t.calculatedPrice = price;

                    const tr = document.createElement('tr');
                    tr.className = 'user-row';
                    tr.innerHTML = `
            <td><input type="checkbox" class="inv-ticket-check" data-index="${i}" checked
                onchange="updateInvoiceCalculations()"></td>
        <td>${date.toLocaleDateString()}</td>
        <td>${t.id}</td>
        <td>${t.receiver}</td>
        <td>${pkgs}</td>
        <td>${price.toFixed(2)}€</td>
        `;
                    tbody.appendChild(tr);
                });
            }

            window.updateInvoiceCalculations = () => {
                const checks = document.querySelectorAll('.inv-ticket-check');
                let subtotal = 0;
                checks.forEach(c => {
                    if (c.checked) {
                        const idx = parseInt(c.dataset.index);
                        subtotal += unbilledTickets[idx].calculatedPrice;
                    }
                });

                const ivaRate = parseFloat(document.getElementById('fiscal-iva').value) || 0;
                const irpfRate = parseFloat(document.getElementById('fiscal-irpf').value) || 0;

                const iva = subtotal * (ivaRate / 100);
                const irpf = subtotal * (irpfRate / 100);
                const total = subtotal + iva - irpf;

                document.getElementById('inv-calc-subtotal').textContent = subtotal.toFixed(2) + '€';
                document.getElementById('inv-calc-iva').textContent = iva.toFixed(2) + '€';
                document.getElementById('inv-calc-irpf').textContent = irpf.toFixed(2) + '€';
                document.getElementById('inv-calc-total').textContent = total.toFixed(2) + '€';

                invoiceCalculations = { subtotal, iva, irpf, total, ivaRate, irpfRate };
            };

            // MASS DELETION FEATURE
            document.getElementById('btn-delete-unbilled-final').onclick = async () => {
                const checks = document.querySelectorAll('.inv-ticket-check:checked');
                if (checks.length === 0) {
                    alert("Selecciona al menos un albarán para eliminar.");
                    return;
                }

                if (!confirm(`⚠️ ALERTA DE DESTRUCCIÓN DE DATOS\n\n¿Estás completamente seguro de que deseas ELIMINAR DE FORMA DEFINITIVA los ${checks.length} albaranes seleccionados?\n\nEsta acción no se puede deshacer y los albaranes desaparecerán de forma permanente de la base de datos.`)) return;

                showLoading();
                try {
                    let batch = db.batch();
                    let count = 0;

                    for (const c of checks) {
                        const idx = parseInt(c.dataset.index);
                        const ticket = unbilledTickets[idx];
                        
                        // Borramos también del bucket de "companies" local si es posible.
                        // La estructura nativa ubica los tickets en la colección tickets global siempre actualmente!
                        const ref = db.collection('tickets').doc(ticket.docId);
                        batch.delete(ref);
                        
                        count++;
                        if (count >= 400) { // Safety yield against batch limits
                            await batch.commit();
                            batch = db.batch();
                            count = 0;
                        }
                    }

                    if (count > 0) {
                        await batch.commit();
                    }

                    alert(`✅ Borrado masivo completado con éxito. Se han destruido ${checks.length} albaranes.`);
                    await refreshUnbilledList(); // Force an immediate query reload against the table

                } catch (e) {
                    console.error("Error durante borrado masivo:", e);
                    alert("Fallo crítico durante el borrado masivo: " + e.message);
                } finally {
                    hideLoading();
                }
            };

            document.getElementById('btn-create-invoice-final').onclick = async () => {
                if (invoiceCalculations.total <= 0) { alert("Selecciona albaranes con valor."); return; } if (!invCompanyData ||
                    !invCompanyData.cif) { alert("Primero configura los Datos Fiscales de NOVAPACK."); return; } const
                        checks = document.querySelectorAll('.inv-ticket-check:checked'); const
                            selectedIndices = Array.from(checks).map(c => parseInt(c.dataset.index));
                const selectedTickets = selectedIndices.map(i => unbilledTickets[i]);

                const uid = document.getElementById('inv-client-select').value;
                const clientData = userMap[uid];

                showLoading();
                try {
                    // Get next invoice number
                    const invSnap = await db.collection('invoices').orderBy('number', 'desc').limit(1).get();
                    let nextNum = 1;
                    if (!invSnap.empty) nextNum = (invSnap.docs[0].data().number || 0) + 1;

                    const invoiceData = {
                        number: nextNum,
                        invoiceId: `FAC - ${new Date().getFullYear()} -${nextNum.toString().padStart(4, '0')} `,
                        date: firebase.firestore.FieldValue.serverTimestamp(),
                        clientId: uid,
                        clientName: clientData.name,
                        clientCIF: clientData.idNum || 'N/A',
                        subtotal: invoiceCalculations.subtotal,
                        iva: invoiceCalculations.iva,
                        ivaRate: invoiceCalculations.ivaRate,
                        irpf: invoiceCalculations.irpf,
                        irpfRate: invoiceCalculations.irpfRate,
                        total: invoiceCalculations.total,
                        tickets: selectedTickets.map(t => t.id),
                        ticketsDetail: selectedTickets.map(t => ({
                            id: t.id,
                            compName: t.compName || "",
                            price: t.calculatedPrice || 0
                        })),
                        senderData: invCompanyData
                    };

                    const invDoc = await db.collection('invoices').add(invoiceData);

                    // Update Tickets with invoiceId to mark as billed
                    const batch = db.batch();
                    selectedTickets.forEach(t => {
                        // Ruta directa en Coleccion Global (Opcion A)
                        const tRef = db.collection('tickets').doc(t.docId);
                        batch.update(tRef, { invoiceId: invDoc.id, invoiceNum: invoiceData.invoiceId });
                    });
                    await batch.commit();

                    alert(`Factura ${invoiceData.invoiceId} generada con éxito.`);
                    document.getElementById('btn-close-inv-modal').click();
                    loadInvoices();
                } catch (e) { alert("Error: " + e.message); }
                finally { hideLoading(); }
            };

            async function loadInvoices(direction = 'first') {
                const tbody = document.getElementById('invoice-table-body');
                const paginationUI = document.getElementById('invoices-pagination');
                tbody.innerHTML = '<tr><td colspan="8">Cargando facturas...</td></tr>';

                try {
                    // 1. Handle Pagination State
                    if (direction === 'first') {
                        invoicesPage = 1;
                        invoicesCursors = [];
                    } else if (direction === 'next' && lastInvoiceSnapshot) {
                        invoicesCursors[invoicesPage] = lastInvoiceSnapshot;
                        invoicesPage++;
                    } else if (direction === 'prev' && invoicesPage > 1) {
                        invoicesPage--;
                    }

                    // 2. Build Query
                    let query = db.collection('invoices').orderBy('number', 'desc');
                    const currentCursor = invoicesPage > 1 ? invoicesCursors[invoicesPage - 1] : null;
                    if (currentCursor) query = query.startAfter(currentCursor);
                    query = query.limit(invoicesLimit);

                    const snap = await query.get();
                    tbody.innerHTML = '';

                    let stats303 = {};
                    let stats111 = {};

                    if (snap.empty) {
                        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:#888;">No hay más facturas.</td></tr>';
                        lastInvoiceSnapshot = null;
                    } else {
                        lastInvoiceSnapshot = snap.docs[snap.docs.length - 1];

                        snap.forEach(doc => {
                            const inv = doc.data();
                            const date = (inv.date && inv.date.toDate) ? inv.date.toDate() : new Date();

                            // Quarters for AEAT Models
                            const quarter = "Trimestre " + (Math.floor(date.getMonth() / 3) + 1) + " (" + date.getFullYear() + ")";
                            if (!stats303[quarter]) stats303[quarter] = { base: 0, iva: 0 };
                            if (!stats111[quarter]) stats111[quarter] = { base: 0, irpf: 0 };

                            stats303[quarter].base += inv.subtotal;
                            stats303[quarter].iva += inv.iva;
                            stats111[quarter].base += inv.subtotal;
                            stats111[quarter].irpf += inv.irpf;

                            const tr = document.createElement('tr');
                            tr.className = 'user-row';
                            tr.innerHTML = `
                            <td style="display:flex; align-items:center; gap:5px; border-bottom:none;">
                                <input type="checkbox" class="sepa-check" data-id="${doc.id}">
                                <span style="font-weight:bold;">${inv.invoiceId}</span>
                            </td>
                            <td>${date.toLocaleDateString()}</td>
                            <td>${inv.clientName}</td>
                            <td>${inv.subtotal.toFixed(2)}€</td>
                            <td>${inv.iva.toFixed(2)}€ (${inv.ivaRate}%)</td>
                            <td>${inv.irpf.toFixed(2)}€ (${inv.irpfRate}%)</td>
                            <td style="font-weight:900; color:var(--brand-primary)">${inv.total.toFixed(2)}€</td>
                            <td>
                                <div style="display:flex; gap:5px;">
                                    <button class="btn btn-primary btn-sm" style="background:linear-gradient(135deg, #007acc, #005a9e);" onclick="advLoadInvoice('${doc.id}')" title="Abrir en Facturación PRO">⚡ PRO</button>
                                    <button class="btn btn-outline btn-sm" onclick="printInvoice('${doc.id}')">🖨️</button>
                                    <button class="btn btn-secondary btn-sm" onclick="emailInvoice('${doc.id}')">📧</button>
                                    <button class="btn btn-secondary btn-sm" style="background:#25D366; border-color:#25D366;" onclick="sendWhatsAppInvoice('${doc.id}')">💬</button>
                                    <button class="btn btn-outline btn-sm" style="color:#FF4444;" onclick="downloadInvoicePDF('${doc.id}')">📄</button>
                                    <button class="btn btn-danger btn-sm" onclick="deleteInvoice('${doc.id}')">🗑️</button>
                                </div>
                            </td>
                        `;
                            tbody.appendChild(tr);
                        });

                        // Update Pagination UI
                        document.getElementById('label-invoices-page').textContent = `Página ${invoicesPage}`;
                        document.getElementById('btn-invoices-prev').disabled = (invoicesPage === 1);
                        document.getElementById('btn-invoices-next').disabled = (snap.docs.length < invoicesLimit);
                    }

                    renderTaxSummary(stats303, stats111);
                } catch (e) {
                    console.error(e);
                    tbody.innerHTML = `<tr><td colspan="8" style="color:red; text-align:center;">Error: ${e.message}</td></tr>`;
                }
            }

            if(document.getElementById('btn-generate-sepa')) document.getElementById('btn-generate-sepa').onclick = async () => {
                const checks = document.querySelectorAll('.sepa-check:checked');
                if (checks.length === 0) { alert("Selecciona al menos una factura para remesar."); return; }
                if (!invCompanyData || !invCompanyData.bank || !invCompanyData.cif) {
                    alert("Configura primero los datos fiscales y el IBAN de NOVAPACK."); return;
                }

                showLoading();
                try {
                    let invoices = [];
                    for (let c of checks) {
                        const doc = await db.collection('invoices').doc(c.dataset.id).get();
                        if (doc.exists) invoices.push({ id: doc.id, ...doc.data() });
                    }

                    const xml = generateSEPAXML(invoices, invCompanyData);
                    const blob = new Blob([xml], { type: 'application/xml' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `REMESA_SEPA_${new Date().toISOString().split('T')[0]}.xml`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    alert("Remesa SEPA generada correctamente. Súbala ahora a la web de su banco.");
                } catch (e) { alert("Error: " + e.message); }
                finally { hideLoading(); }
            };

            function generateSEPAXML(invoices, company) {
                const msgId = "MSG" + Date.now();
                const creationDate = new Date().toISOString().split('.')[0];
                const totalAmount = invoices.reduce((sum, inv) => sum + inv.total, 0).toFixed(2);
                const numTrans = invoices.length;
                const creditorIBAN = company.bank.replace(/\s/g, '');
                const creditorCIF = company.cif.replace(/[^A-Z0-9]/g, '');
                const creditorName = company.name;
                const sepaId = company.sepaId || "000";
                const creditorId = `ES${creditorIBAN.substring(2, 4)}${sepaId}${creditorCIF} `;

                let transactionsHTML = '';
                invoices.forEach(inv => {
                    const client = userMap[inv.clientId] || {};
                    const clientIBAN = (client.iban || "").replace(/\s/g, '');
                    const clientName = (client.name || inv.clientName).substring(0, 70).replace(/[&<>"]/g, '');
                    const mandateId = client.sepaRef || ("MANDATO-" + inv.clientId.substring(0, 8));
                    const mandateDate = client.sepaDate || new Date().toISOString().split('T')[0];

                    transactionsHTML += `
            <DrctDbtTxInf>
                    <PmtId><EndToEndId>${inv.invoiceId}</EndToEndId></PmtId>
                    <InstdAmt Ccy="EUR">${inv.total.toFixed(2)}</InstdAmt>
                    <DrctDbtTx>
                        <MndtRltdInf>
                            <MndtId>${mandateId}</MndtId>
                            <DtOfSgntr>${mandateDate}</DtOfSgntr>
                        </MndtRltdInf>
                    </DrctDbtTx>
                    <Dbtr><Nm>${clientName}</Nm></Dbtr>
                    <DbtrAcct><Id><IBAN>${clientIBAN}</IBAN></Id></DbtrAcct>
                    <RmtInf><Ustrd>Factura ${inv.invoiceId}</Ustrd></RmtInf>
                </DrctDbtTxInf> `;
                });

                return `<? xml version = "1.0" encoding = "UTF-8" ?>
            <Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.008.001.02">
                <CstmrDrctDbtInitn>
                    <GrpHdr>
                        <MsgId>${msgId}</MsgId>
                        <CreDtTm>${creationDate}</CreDtTm>
                        <NbOfTxs>${numTrans}</NbOfTxs>
                        <CtrlSum>${totalAmount}</CtrlSum>
                        <InitgPty><Nm>${creditorName}</Nm></InitgPty>
                    </GrpHdr>
                    <PmtInf>
                        <PmtInfId>${msgId}-INF</PmtInfId>
                        <PmtMtd>DD</PmtMtd>
                        <NbOfTxs>${numTrans}</NbOfTxs>
                        <CtrlSum>${totalAmount}</CtrlSum>
                        <PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl><LclInstrm><Cd>CORE</Cd></LclInstrm><SeqTp>RCUR</SeqTp></PmtTpInf>
                        <ReqdColltnDt>${new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0]}</ReqdColltnDt>
                        <Cdtr><Nm>${creditorName}</Nm></Cdtr>
                        <CdtrAcct><Id><IBAN>${creditorIBAN}</IBAN></Id></CdtrAcct>
                        <CdtrAgt><FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId></CdtrAgt>
                        <CdtrSchmeId><Id><PrvtId><Othr><Id>${creditorId}</Id><SchmeNm><Prtry>SEPA</Prtry></SchmeNm></Othr></PrvtId></Id></CdtrSchmeId>
                        ${transactionsHTML}
                    </PmtInf>
                </CstmrDrctDbtInitn>
            </Document>`;
            }

            function renderTaxSummary(s303, s111) {
                const div303 = document.getElementById('summary-303');
                const div111 = document.getElementById('summary-111');

                if (div303) div303.innerHTML = '';
                if (div111) div111.innerHTML = '';

                Object.keys(s303).forEach(q => {
                    const data = s303[q];
                    if (div303) {
                        div303.innerHTML += `
                            <div style = "background:rgba(255,255,255,0.03); padding:10px; border-radius:4px; margin-bottom:10px;" >
                            <strong>${q}</strong><br>
                            Base Imponible: ${data.base.toFixed(2)}€ |
                            <span style="color:#4CAF50">IVA Devengado: ${data.iva.toFixed(2)}€</span>
                            </div>
                        `;
                    }
                });

                Object.keys(s111).forEach(q => {
                    const data = s111[q];
                    if (div111) {
                        div111.innerHTML += `
                            <div style = "background:rgba(255,255,255,0.03); padding:10px; border-radius:4px; margin-bottom:10px;" >
                                <strong>${q}</strong><br>
                                Base Retenciones: ${data.base.toFixed(2)}€ |
                                <span style="color:#FF3B30">IRPF a Ingresar: ${data.irpf.toFixed(2)}€</span>
                            </div>
                        `;
                    }
                });
            }

            window.printInvoice = async (id) => {
                showLoading();
                const doc = await db.collection('invoices').doc(id).get();
                const inv = doc.data();
                hideLoading();
                const date = (inv.date && inv.date.toDate) ? inv.date.toDate().toLocaleDateString() : 'N/A';
                const win = window.open('', '_blank');
                win.document.write(`
            <html>
            <head><title>Factura ${inv.invoiceId}</title><style>@font-face { font-family: 'Xenotron'; src: url('https://db.onlinewebfonts.com/t/13f990d5baee565bea4d9ff96e201c84.woff2') format('woff2'); font-weight: normal; } @media print { @page { size: A4; margin: 0; } .no-print { display: none; } }</style></head>
            <body style="background:#f5f5f5; padding: 20px;">
                <div id="inv-content" style="max-width: 800px; margin: 0 auto; box-shadow: 0 0 10px rgba(0,0,0,0.1);">
                    ${generateInvoiceHTML(inv, date, userMap[inv.clientId])}
                    <div class="no-print" style="text-align:center; padding: 20px;">
                        <button onclick="window.print()" style="padding:15px 30px; background:#FF6600; color:white; border:none; border-radius:5px; cursor:pointer; font-weight:bold;">🖨️ IMPRIMIR FACTURA</button>
                    </div>
                </div>
            
</html>
            `);
                win.document.close();
            };

            window.emailInvoice = async (id) => {
                const doc = await db.collection('invoices').doc(id).get();
                const inv = doc.data();
                const client = userMap[inv.clientId];
                const email = client ? client.email : '';
                const subject = encodeURIComponent(`Factura ${inv.invoiceId} - NOVAPACK LOGÍSTICA`);
                const body = encodeURIComponent(`Hola ${inv.clientName}, \n\nLe adjuntamos el detalle de su factura ${inv.invoiceId} por importe de ${inv.total.toFixed(2)}€.\n\nForma de pago: Transferencia a ${inv.senderData ? inv.senderData.bank : 'la cuenta habitual'} \n\nGracias por confiar en NOVAPACK.`);
                window.location.href = `mailto:${email}?subject = ${subject}& body=${body} `;
            };

            window.downloadInvoicePDF = async (id) => {
                showLoading();
                const doc = await db.collection('invoices').doc(id).get();
                const inv = doc.data();
                const date = (inv.date && inv.date.toDate) ? inv.date.toDate().toLocaleDateString() : 'N/A';
                const element = document.createElement('div');
                element.innerHTML = generateInvoiceHTML(inv, date, userMap[inv.clientId]);
                const opt = {
                    margin: 10,
                    filename: `Factura_${inv.invoiceId}.pdf`,
                    image: { type: 'jpeg', quality: 0.98 },
                    html2canvas: { scale: 2 },
                    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
                };
                html2pdf().from(element).set(opt).save();
                hideLoading();
            };

            window.sendWhatsApp = (phone, msg) => {
                if (!phone) { alert("Sin teléfono configurado."); return; }
                const clean = phone.replace(/\s+/g, '').replace('+', '');
                const final = clean.startsWith('34') ? clean : '34' + clean;
                window.open(`https://wa.me/${final}?text=${encodeURIComponent(msg)}`, '_blank');
            };

            window.sendWhatsAppInvoice = async (id) => {
                const doc = await db.collection('invoices').doc(id).get();
                const inv = doc.data();
                const client = userMap[inv.clientId];
                const phone = client ? client.senderPhone : '';
                const msg = `Hola ${inv.clientName}, le enviamos su factura ${inv.invoiceId} (${inv.total.toFixed(2)}€). Saludos, NOVAPACK.`;
                window.sendWhatsApp(phone, msg);
            };

            window.sendWhatsAppTicket = async (uid, compId, docId) => {
                const doc = await db.collection('tickets').doc(docId).get();
                const t = doc.data();
                const client = userMap[uid];
                const msg = `Hola, consulta sobre el albarán ${t.id} con destino ${t.receiver}.`;
                window.sendWhatsApp(client ? client.senderPhone : '', msg);
            };

            window.createCreditInvoice = async (id) => {
                if (!confirm("¿Desea crear una factura de abono (rectificativa) para esta factura? El importe será negativo.")) return;
                showLoading();
                try {
                    const doc = await db.collection('invoices').doc(id).get();
                    const inv = doc.data();

                    // Get next invoice ID with a 'CR-' prefix for credits
                    const counterDoc = await db.collection('config').doc('counters').get();
                    let nextNum = (counterDoc.data().invoice || 0) + 1;
                    const creditId = `ABO-${new Date().getFullYear()}-${nextNum.toString().padStart(4, '0')}`;

                    const creditData = {
                        ...inv,
                        invoiceId: creditId,
                        isCredit: true,
                        date: firebase.firestore.FieldValue.serverTimestamp(),
                        subtotal: -inv.subtotal,
                        iva: -inv.iva,
                        irpf: -inv.irpf,
                        total: -inv.total,
                        originalInvoice: inv.invoiceId,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    };

                    await db.collection('invoices').doc(creditId).set(creditData);
                    await db.collection('config').doc('counters').update({ invoice: nextNum });

                    alert(`Factura de abono ${creditId} generada con éxito.`);
                    loadInvoices();
                } catch (e) { alert("Error al crear abono: " + e.message); }
                finally { hideLoading(); }
            };

            
            function generateAdminA4TicketHTML(t, footerLabel, qrImageSrc) {
                const ts = (t.createdAt && typeof t.createdAt.toDate === 'function') ? t.createdAt.toDate() : (t.createdAt ? new Date(t.createdAt) : new Date());
                const validDateStr = !isNaN(ts.getTime()) ? (ts.toLocaleDateString() + " " + ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })) : "Fecha pendiente";

                let displayList = t.packagesList && t.packagesList.length > 0 ? t.packagesList : [{ qty: parseInt(t.packages) || 1, weight: t.weight, size: t.size }];
                const hasCod = t.cod && t.cod.toString().trim() !== '' && t.cod.toString() !== '0';

                let rowsHtml = '';
                displayList.forEach((p) => {
                    let w = p.weight;
                    if (typeof w === 'number') w = w + " kg";
                    if (typeof w === 'string' && !w.includes('kg')) w = w + " kg";
                    const qty = p.qty || 1;
                    rowsHtml += `<tr><td style="border: 1px solid #000; padding: 1px 3px; text-align: center; font-size: 8pt;">${qty}</td><td style="border: 1px solid #000; padding: 1px 3px; text-align: center; font-size: 8pt;">${w}</td><td style="border: 1px solid #000; padding: 1px 3px; text-align: center; font-size: 8pt;">${p.size || 'Bulto'}</td>${hasCod ? `<td style="border: 1px solid #000; padding: 1px 3px; text-align: center; font-size: 8pt;">${t.cod} €</td>` : ''}</tr>`;
                });

                return `
                <div style="font-family: Arial, sans-serif; padding: 4px; border: 2px solid #000; min-height: 110mm; height: 110mm; position: relative; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden; background: white;">
                    ${t.province ? `<div style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%) rotate(-25deg); font-size:4.5rem; color:#000; font-weight:900; white-space:nowrap; z-index:0; pointer-events:none; width: 100%; text-align: center; font-family: 'Arial Black', sans-serif; opacity: 0.04; text-transform: uppercase;">${t.province}</div>` : ''}
                    <div style="z-index: 2;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #000; padding-bottom: 5px; margin-bottom: 5px; position:relative;">
                            <div style="flex: 1;">
                                <div style="font-family: 'Xenotron', sans-serif; font-size: 24pt; color: #FF6600; line-height: 1;">NOVAPACK</div>
                                <div style="font-size: 0.7rem; letter-spacing: 0.5px; color:#333; margin-top: 2px;">administracion@novapack.info</div>
                            </div>
                            <div style="flex: 1; text-align: center; padding: 0 10px;">
                                <div style="padding: 5px; background:#FFF; display: inline-block; min-width: 140px;">
                                    <div style="font-size: 0.9rem; font-weight: bold; color: #000; margin-bottom: 5px;">PORTES ${t.shippingType === 'Debidos' ? 'DEBIDOS' : 'PAGADOS'}</div>
                                    <div style="font-size: 1.6rem; font-weight: 900; color: #FF6600; text-transform:uppercase; line-height: 1.1;">${t.province || '&nbsp;'}</div>
                                    ${t.timeSlot ? `<div style="font-size: 0.9rem; font-weight: 900; background: #EEE; color: #000; text-align: center; padding: 3px 5px; margin-top: 4px; border-radius: 4px;">TURNO: ${t.timeSlot}</div>` : ''}
                                    ${hasCod ? `<div style="font-size: 1.1rem; font-weight: 900; color: #FF3B30; margin-top: 5px; border-top: 1px solid #FF6600; padding-top:4px;">REEMBOLSO: ${t.cod} €</div>` : ''}
                                </div>
                            </div>
                            <div style="flex: 1; text-align: right; display: flex; flex-direction: row-reverse; gap: 10px; align-items: start;">
                                <div style="text-align: right;">
                                    <div style="font-size: 1rem; font-weight: bold; margin-bottom: 5px;">${validDateStr}</div>
                                    <div style="font-size: 0.75rem; color: #555; text-transform:uppercase; font-weight: 800;">Albarán Nº</div>
                                    <div style="font-family: 'Outfit', sans-serif; font-size: 1.6rem; color: #000; font-weight: 800; letter-spacing: -1px;">${t.id}</div>
                                </div>
                                <div style="background: white; padding: 2px; border: 1px solid #eee;">
                                    <img src="${qrImageSrc}" alt="QR Albaran" style="display: block; width: 110px; height: 110px; image-rendering: pixelated;">
                                </div>
                            </div>
                        </div>
                        <div style="margin-top: 5px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; position:relative;">
                            <div style="border: 1px solid #ccc; padding: 5px; font-size: 0.8rem;"><strong>REMITENTE:</strong><br>${t.sender}<br>${t.senderAddress || ''}<br>${t.senderPhone ? `Telf: ${t.senderPhone}` : ''}</div>
                            <div style="border: 1px solid #000; padding: 5px; font-size: 10pt;"><strong>DESTINATARIO:</strong><br><div style="font-weight:bold; font-size:1.1em;">${t.receiver}</div>${t.address}</div>
                        </div>
                        <table style="width: 100%; margin-top: 5px; border-collapse: collapse; border: 1px solid #ccc;">
                            <thead><tr style="border-bottom: 1px solid #ccc; color: #000;"><th style="border: 1px solid #ccc; padding: 1px; font-size: 0.7rem;">BULTOS</th><th style="border: 1px solid #ccc; padding: 1px; font-size: 0.7rem;">PESO</th><th style="border: 1px solid #ccc; padding: 1px; font-size: 0.7rem;">MEDIDA</th>${hasCod ? '<th style="border: 1px solid #ccc; padding: 1px; font-size: 0.7rem;">REEMBOLSO</th>' : ''}</tr></thead>
                            <tbody>${rowsHtml}</tbody>
                        </table>
                        <div style="margin-top: 5px; border: 1px solid #ccc; padding: 5px; background:transparent; display:flex; justify-content:space-around; font-weight:bold; font-size:1rem;">
                            <span>TOTAL BULTOS: ${displayList.reduce((sum, p) => sum + (parseInt(p.qty) || 1), 0)}</span>
                            <span>TOTAL PESO: ${displayList.reduce((sum, p) => sum + ((parseFloat(p.weight) || 0) * (parseInt(p.qty) || 1)), 0).toFixed(2)} kg</span>
                        </div>
                        <div style="margin-top: 4px; border: 1px solid #ccc; padding: 2px 5px; font-size: 0.75rem; white-space: pre-wrap; word-break: break-word; overflow: hidden; max-height: 50px;">
                            <strong>Observaciones:</strong> ${t.notes}
                        </div>
                    </div>
                    <div style="margin-top: 5px; font-size: 0.7rem; width: 100%; display: flex; justify-content: flex-end; padding-right: 10px;">
                        <div style="text-align:right;"><span>Firma y Sello:</span><br><span style="font-weight: bold; text-transform: uppercase;">${footerLabel}</span></div>
                    </div>
                </div>`;
            }

window.printTicketFromAdmin = async (uid, compId, docId) => {
                showLoading();
                const doc = await db.collection('tickets').doc(docId).get();
                const t = doc.data();
                hideLoading();
                if (!t) return;

                // Marcar como impreso en la nube para sincronización
                db.collection('tickets').doc(docId).update({ printed: true }).catch(err => console.error("Error al marcar impreso:", err));

                const printableId = `${t.clientIdNum || uid}_${t.compId || compId}_${t.id}`;
                const qrData = {
                    id: t.id,
                    sn: t.clientIdNum || uid,
                    ci: t.compId || compId,
                    r: (t.receiver || "").substring(0, 40),
                    a: (t.address || '').substring(0, 60),
                    v: t.province || '',
                    k: (t.packagesList ? t.packagesList.reduce((s, p) => s + (parseInt(p.qty) || 1), 0) : (t.packages || 1)),
                    w: (t.packagesList ? t.packagesList.reduce((s, p) => s + (parseFloat(p.weight) || 0), 0) : (t.weight || 0)).toFixed(2),
                    s: t.shippingType || 'Pagados',
                    c: t.cod || 0,
                    n: (t.notes || '').substring(0, 50),
                    docId: docId,
                    f: window.billingCompaniesMap && window.billingCompaniesMap[t.billingEntityId] ? (window.billingCompaniesMap[t.billingEntityId].shortId || t.billingEntityId) : (t.billingEntityId || '')
                };
                const qrImage = generateQRCode(JSON.stringify(qrData), 350);

                const win = window.open('', '_blank');

                const tCode = `<div style="height: 50%; width: 100%; box-sizing: border-box; padding: 10mm; display: flex; flex-direction: column; justify-content: center; align-items: center; border-bottom: 2px dashed #bbb;">
                    ${generateAdminA4TicketHTML(t, "Ejemplar para Administración", qrImage)}
                </div>`;
                const tCode2 = `<div style="height: 50%; width: 100%; box-sizing: border-box; padding: 10mm; display: flex; flex-direction: column; justify-content: center; align-items: center;">
                    ${generateAdminA4TicketHTML(t, "Ejemplar para el Cliente", qrImage)}
                </div>`;

                win.document.write(`<html><head><meta charset="UTF-8"><title>Albarán ${t.id}</title><style>
                * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                body { margin:0; padding:0; background:#eee; font-family: sans-serif; }
                .page { width: 210mm; height: 297mm; display: flex; flex-direction: column; background: white; margin: 0 auto; box-sizing: border-box; }
                @media print {
                    @page { size: A4; margin: 0; }
                    body { background:white; margin:0; padding:0; }
                    .page { width: 100%; height: 100%; margin: 0; box-shadow: none; }
                    .no-print { display: none !important; }
                }
                </style></head>
                <body>
                    <div class="page">
                        ${tCode}
                        ${tCode2}
                    </div>
                <div class="no-print" style="position:fixed; bottom:30px; right:30px; display:flex; gap:15px;">
                    <button onclick="window.print()" style="padding:15px 30px; background:#FF6600; color:white; border:none; border-radius:12px; cursor:pointer; font-weight:900; box-shadow:0 10px 20px rgba(255,102,0,0.3); font-size:1rem; display:flex; align-items:center; gap:10px;">
                        <span>🖨️</span> IMPRIMIR AHORA
                    </button>
                    <button onclick="window.close()" style="padding:15px 30px; background:#333; color:white; border:none; border-radius:12px; cursor:pointer; font-weight:900; box-shadow:0 10px 20px rgba(0,0,0,0.3); font-size:1rem; display:flex; align-items:center; gap:10px;">
                        <span>❌</span> CERRAR
                    </button>
                </div>
                <script>
                    window.onload = () => { setTimeout(() => window.print(), 500); };
                <\/script>
            
</html>`);
                win.document.close();
            };

            function generateInvoiceHTML(inv, date, clientObj) {
                const cl = clientObj || {};
                const sf = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', 'Helvetica Neue', sans-serif";
                
                let conceptHTML = '';
                if (inv.advancedGrid && inv.advancedGrid.length > 0) {
                    inv.advancedGrid.forEach(r => {
                        const detail = r.qty !== 1 || r.discount > 0 ? `<div style="font-size:0.72rem; color:#aaa; margin-top:2px;">${r.qty} × ${r.price.toFixed(2)}€${r.discount > 0 ? '  (−' + r.discount + '% dto.)' : ''}</div>` : '';
                        conceptHTML += `
                        <tr>
                            <td style="padding:10px 0; border-bottom:1px solid #f0f0f0; color:#444; font-weight:300;">${r.description}${detail}</td>
                            <td style="padding:10px 0; border-bottom:1px solid #f0f0f0; text-align:center; color:#888; font-weight:300;">${r.qty}</td>
                            <td style="padding:10px 0; border-bottom:1px solid #f0f0f0; text-align:right; color:#888; font-weight:300;">${r.price.toFixed(2)} €</td>
                            <td style="padding:10px 0; border-bottom:1px solid #f0f0f0; text-align:right; color:#444; font-weight:300;">${r.total.toFixed(2)} €</td>
                        </tr>`;
                    });
                } else if (inv.ticketsDetail && inv.ticketsDetail.length > 0) {
                    const grouped = {};
                    inv.ticketsDetail.forEach(t => {
                        const group = t.compName || "Sede Principal";
                        if (!grouped[group]) grouped[group] = { ids: [], subtotal: 0 };
                        grouped[group].ids.push(t.id);
                        grouped[group].subtotal += (t.price || 0);
                    });
                    Object.keys(grouped).forEach(group => {
                        conceptHTML += `
                        <tr>
                            <td style="padding:10px 0; border-bottom:1px solid #f0f0f0; color:#444; font-weight:300;">
                                Servicios de Transporte — ${group}
                                <div style="font-size:0.72rem; color:#aaa; margin-top:2px;">Albaranes: ${grouped[group].ids.join(', ')}</div>
                            </td>
                            <td style="padding:10px 0; border-bottom:1px solid #f0f0f0; text-align:center; color:#888; font-weight:300;">—</td>
                            <td style="padding:10px 0; border-bottom:1px solid #f0f0f0; text-align:right; color:#888; font-weight:300;">—</td>
                            <td style="padding:10px 0; border-bottom:1px solid #f0f0f0; text-align:right; color:#444; font-weight:300;">${grouped[group].subtotal.toFixed(2)} €</td>
                        </tr>`;
                    });
                } else {
                    conceptHTML = `
                    <tr>
                        <td style="padding:10px 0; border-bottom:1px solid #f0f0f0; color:#444; font-weight:300;">Servicios de transporte (Alb: ${inv.tickets.join(', ')})</td>
                        <td style="padding:10px 0; border-bottom:1px solid #f0f0f0; text-align:center; color:#888; font-weight:300;">—</td>
                        <td style="padding:10px 0; border-bottom:1px solid #f0f0f0; text-align:right; color:#888; font-weight:300;">—</td>
                        <td style="padding:10px 0; border-bottom:1px solid #f0f0f0; text-align:right; color:#444; font-weight:300;">${inv.subtotal.toFixed(2)} €</td>
                    </tr>`;
                }

                const senderBranch = inv.senderData || {};
                const clientAddr = cl.senderAddress || [cl.street, cl.localidad, cl.cp ? 'CP ' + cl.cp : ''].filter(Boolean).join(', ');
                const clientPhone = cl.senderPhone || cl.phone || '';

                return `
            <div style="font-family:${sf}; padding:50px; color:#444; line-height:1.6; background:white; max-width:800px; margin:0 auto; min-height:1060px; position:relative; box-sizing:border-box; font-weight:300;">
                
                <!-- HEADER -->
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:50px;">
                    <div>
                        <div style="font-family:Xenotron, sans-serif; color:#FF6600; font-size:1.8rem; letter-spacing:3px; font-weight:normal;">NOVAPACK S.L.</div>
                        <div style="border-top:0.5px solid #ddd; margin-top:5px; padding-top:5px; font-size:0.7rem; color:#999; letter-spacing:1.5px; text-transform:uppercase; font-weight:400;">Servicio Inmediato de Paquetería</div>
                        <div style="margin-top:18px; font-size:0.8rem; color:#999; line-height:1.7; font-weight:300;">
                            ${senderBranch.name || 'NOVAPACK LOGÍSTICA'}<br>
                            CIF: ${senderBranch.cif || '—'}<br>
                            ${(senderBranch.address || '').replace(/,/g, '<br>')}<br>
                            ${senderBranch.email ? senderBranch.email : ''}
                        </div>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-size:0.7rem; color:#bbb; letter-spacing:2px; text-transform:uppercase; font-weight:400;">Factura</div>
                        <div style="font-size:1.6rem; color:#333; font-weight:300; margin:4px 0 20px;">${inv.invoiceId}</div>
                        <div style="font-size:0.7rem; color:#bbb; letter-spacing:1px; text-transform:uppercase; font-weight:400;">Fecha</div>
                        <div style="font-size:0.95rem; color:#555; font-weight:300;">${date}</div>
                        ${inv.isAbono ? '<div style="margin-top:12px; color:#DC2626; font-size:0.75rem; letter-spacing:1px; text-transform:uppercase; font-weight:400; border:1px solid #DC2626; padding:4px 10px; display:inline-block;">Rectificativa</div>' : ''}
                    </div>
                </div>

                <!-- SEPARATOR -->
                <div style="border-top:0.5px solid #e0e0e0; margin-bottom:35px;"></div>

                <!-- CLIENT -->
                <div style="margin-bottom:40px;">
                    <div style="font-size:0.65rem; color:#bbb; letter-spacing:2px; text-transform:uppercase; font-weight:400; margin-bottom:8px;">Facturar a</div>
                    <div style="font-size:1.05rem; color:#333; font-weight:400; margin-bottom:3px;">${inv.clientName}</div>
                    <div style="font-size:0.82rem; color:#888; font-weight:300; line-height:1.7;">
                        CIF/NIF: ${cl.nif || inv.clientCIF || '—'} · Nº Cliente: ${inv.clientCIF || ''}
                        ${clientAddr ? '<br>' + clientAddr : ''}
                        ${clientPhone ? '<br>' + clientPhone : ''}
                        ${cl.email ? '<br>' + cl.email : ''}
                    </div>
                </div>

                <!-- TABLE -->
                <table style="width:100%; border-collapse:collapse; margin-bottom:35px;">
                    <thead>
                        <tr style="border-bottom:0.5px solid #ccc;">
                            <th style="padding:8px 0; text-align:left; font-size:0.65rem; color:#bbb; letter-spacing:1.5px; text-transform:uppercase; font-weight:400;">Concepto</th>
                            <th style="padding:8px 0; text-align:center; font-size:0.65rem; color:#bbb; letter-spacing:1.5px; text-transform:uppercase; font-weight:400; width:60px;">Cant.</th>
                            <th style="padding:8px 0; text-align:right; font-size:0.65rem; color:#bbb; letter-spacing:1.5px; text-transform:uppercase; font-weight:400; width:90px;">Precio</th>
                            <th style="padding:8px 0; text-align:right; font-size:0.65rem; color:#bbb; letter-spacing:1.5px; text-transform:uppercase; font-weight:400; width:100px;">Importe</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${conceptHTML}
                    </tbody>
                </table>

                <!-- TOTALS -->
                <div style="display:flex; justify-content:flex-end; margin-bottom:80px;">
                    <div style="width:280px;">
                        <div style="display:flex; justify-content:space-between; padding:6px 0; color:#999; font-weight:300; font-size:0.85rem;">
                            <span>Base Imponible</span>
                            <span>${inv.subtotal.toFixed(2)} €</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; padding:6px 0; color:#999; font-weight:300; font-size:0.85rem;">
                            <span>IVA (${inv.ivaRate}%)</span>
                            <span>${inv.iva.toFixed(2)} €</span>
                        </div>
                        ${inv.irpf !== 0 ? `<div style="display:flex; justify-content:space-between; padding:6px 0; color:#999; font-weight:300; font-size:0.85rem;"><span>IRPF (−${inv.irpfRate}%)</span><span>−${Number(inv.irpf).toFixed(2)} €</span></div>` : ''}
                        
                        <div style="border-top:0.5px solid #ccc; margin-top:8px; padding-top:12px; display:flex; justify-content:space-between; font-size:1.3rem; color:#222; font-weight:700;">
                            <span>Total</span>
                            <span>${inv.total.toFixed(2)} €</span>
                        </div>
                    </div>
                </div>

                <!-- FOOTER -->
                <div style="position:absolute; bottom:50px; left:50px; right:50px; border-top:0.5px solid #e0e0e0; padding-top:18px;">
                    <div style="display:flex; justify-content:space-between; align-items:flex-end;">
                        <div>
                            <div style="font-size:0.65rem; color:#bbb; letter-spacing:1.5px; text-transform:uppercase; font-weight:400; margin-bottom:6px;">Forma de pago</div>
                            <div style="font-size:0.8rem; color:#666; font-weight:300;">Transferencia bancaria</div>
                            <div style="font-family:monospace; font-size:0.9rem; color:#444; font-weight:400; letter-spacing:0.5px; margin-top:3px;">${senderBranch.bank || 'ESXX XXXX XXXX XXXX XXXX XXXX'}</div>
                        </div>
                        <div style="text-align:right; font-size:0.65rem; color:#ccc; font-weight:300; max-width:220px; line-height:1.5;">
                            ${senderBranch.legal || 'Documento de validez fiscal conforme a la normativa vigente.'}
                        </div>
                    </div>
                </div>
            </div>`;
            }

            window.deleteInvoice = async (id) => {
                if (!confirm("¿Eliminar factura y marcar albaranes como No Facturados?")) return;
                showLoading();
                try {
                    const doc = await db.collection('invoices').doc(id).get();
                    const inv = doc.data();
                    const batch = db.batch();
                    const uSnap = await db.collection('tickets').where('invoiceId', '==', id).get();
                    uSnap.forEach(tDoc => {
                        batch.update(tDoc.ref, {
                            invoiceId: firebase.firestore.FieldValue.delete(), invoiceNum:
                                firebase.firestore.FieldValue.delete()
                        });
                    });
                    batch.delete(db.collection('invoices').doc(id));
                    await batch.commit();
                    alert("Factura eliminada. Los albaranes vuelven a aparecer como 'No Facturados'.");
                    loadInvoices();
                } catch (e) { alert("Error: " + e.message); }
                finally { hideLoading(); }
            };

            // --- TAX MODELS LOGIC ---
            let currentTaxData = { iva: 0, base: 0, irpf: 0, total: 0, count: 0 };

            async function initTaxModelsView() {
                const period = document.getElementById('tax-period-select').value;
                const year = parseInt(document.getElementById('tax-year-input').value);

                showLoading();
                try {
                    const snap = await db.collection('invoices').get();
                    let filteredInvoices = [];

                    snap.forEach(doc => {
                        const inv = doc.data();
                        const d = (inv.createdAt && inv.createdAt.toDate) ? inv.createdAt.toDate() : new Date(inv.createdAt);
                        if (d.getFullYear() !== year) return;

                        if (period !== "ALL") {
                            const month = d.getMonth() + 1; // 1-12
                            const trimesters = { "1": [1, 2, 3], "2": [4, 5, 6], "3": [7, 8, 9], "4": [10, 11, 12] };
                            if (!trimesters[period].includes(month)) return;
                        }
                        filteredInvoices.push(inv);
                    });

                    let totalBase = 0;
                    let totalIva = 0;
                    let totalIrpf = 0;
                    let totalNum = filteredInvoices.length;

                    filteredInvoices.forEach(inv => {
                        totalBase += (inv.subtotal || 0);
                        totalIva += (inv.iva || 0);
                        totalIrpf += (inv.irpf || 0);
                    });

                    currentTaxData = { base: totalBase, iva: totalIva, irpf: totalIrpf, total: totalBase + totalIva - totalIrpf, count: totalNum };

                    // Update UI
                    const full303 = document.getElementById('full-summary-303');
                    if (full303) {
                        full303.innerHTML = `
                    <div style="display:grid; grid-template-columns: 2fr 1fr; gap:10px; border-bottom:1px solid #333; padding:10px 0;">
                        <span>Base Imponible Gravada (Ingresos):</span>
                        <span style="text-align:right; font-weight:bold;">${totalBase.toFixed(2)}€</span>
                    </div>
                    <div style="display:grid; grid-template-columns: 2fr 1fr; gap:10px; border-bottom:1px solid #333; padding:10px 0;">
                        <span>IVA Repercutido (21%):</span>
                        <span style="text-align:right; font-weight:bold; color:#4CAF50;">+ ${totalIva.toFixed(2)}€</span>
                    </div>
                    <div style="margin-top:15px; text-align:right; font-size:1.1rem; color:#4CAF50;">
                        IVA A LIQUIDAR: <strong>${totalIva.toFixed(2)}€</strong>
                    </div>
                `;
                    }

                    const full111 = document.getElementById('full-summary-111');
                    if (full111) {
                        full111.innerHTML = `
                    <div style="display:grid; grid-template-columns: 2fr 1fr; gap:10px; border-bottom:1px solid #333; padding:10px 0;">
                        <span>Número de perceptores (Facturas con IRPF):</span>
                        <span style="text-align:right; font-weight:bold;">${filteredInvoices.filter(i => i.irpf > 0).length}</span>
                    </div>
                    <div style="display:grid; grid-template-columns: 2fr 1fr; gap:10px; border-bottom:1px solid #333; padding:10px 0;">
                        <span>Base de las retenciones:</span>
                        <span style="text-align:right; font-weight:bold;">${filteredInvoices.reduce((s, i) => s + (i.irpf > 0 ? i.subtotal : 0), 0).toFixed(2)}€</span>
                    </div>
                    <div style="display:grid; grid-template-columns: 2fr 1fr; gap:10px; border-bottom:1px solid #333; padding:10px 0;">
                        <span>Retenciones practicadas (IRPF):</span>
                        <span style="text-align:right; font-weight:bold; color:#FF9800;">- ${totalIrpf.toFixed(2)}€</span>
                    </div>
                    <div style="margin-top:15px; text-align:right; font-size:1.1rem; color:#FF9800;">
                        IRPF A INGRESAR: <strong>${totalIrpf.toFixed(2)}€</strong>
                    </div>
                `;
                    }
                } catch (e) { console.error(e); }
                finally { hideLoading(); }
            }

            window.exportTaxData = () => {
                const period = document.getElementById('tax-period-select').value;
                const year = document.getElementById('tax-year-input').value;
                let csv = "CONCEPTO;VALOR\n";
                csv += `Periodo;${period} Trimestre ${year}\n`;
                csv += `Base Imponible;${currentTaxData.base.toFixed(2)}\n`;
                csv += `IVA Repercutido;${currentTaxData.iva.toFixed(2)}\n`;
                csv += `Retenciones IRPF;${currentTaxData.irpf.toFixed(2)}\n`;
                csv += `Total Facturado (con IVA);${(currentTaxData.base + currentTaxData.iva).toFixed(2)}\n`;

                const blob = new Blob(["\ufeff" + csv], { type: 'text/csv;charset=utf-8;' });
                const link = document.createElement("a");
                link.href = URL.createObjectURL(blob);
                link.download = `MODELO_TRIBUTARIO_${period}T_${year}.csv`;
                link.click();
            };

            window.sendTaxesByEmail = () => {
                const period = document.getElementById('tax-period-select').value;
                const year = document.getElementById('tax-year-input').value;
                const subject = encodeURIComponent(`Modelos Tributarios NOVAPACK - ${period}T ${year}`);
                const body = encodeURIComponent(`Hola,\n\nAdjunto resumen tributario de NOVAPACK para el periodo ${period}T de ${year}:\n\n` +
                    `- Base Imponible: ${currentTaxData.base.toFixed(2)}€\n` +
                    `- IVA Repercutido: ${currentTaxData.iva.toFixed(2)}€\n` +
                    `- Retenciones IRPF: ${currentTaxData.irpf.toFixed(2)}€\n\n` +
                    `Saludos.`);
                window.location.href = `mailto:?subject=${subject}&body=${body}`;
            };

            function showLoading() {
                if (document.getElementById('loading-overlay'))
                    document.getElementById('loading-overlay').style.display = 'flex';
            }
            function hideLoading() {
                if (document.getElementById('loading-overlay'))
                    document.getElementById('loading-overlay').style.display = 'none';
            }

            // --- ADMIN MANUAL TICKETS ---

            async function initAdminTicketsView() {
                showLoading();
                try {
                    if (Object.keys(tariffsCache).length === 0) {
                        const tariffSnap = await db.collection('tariffs').get();
                        tariffSnap.forEach(doc => { tariffsCache[doc.id] = doc.data(); });
                    }

                    // Cargar todas las empresas para el buscador sin usar collectionGroup
                    userCompaniesMap = {};
                    
                    // Solo iterar sobre perfiles que ya estén cargados
                    const fetchPromises = Object.keys(userMap).map(async (uid) => {
                        try {
                            const compSnap = await db.collection('users').doc(uid).collection('companies').get();
                            if (!compSnap.empty) {
                                if (!userCompaniesMap[uid]) userCompaniesMap[uid] = {};
                                compSnap.forEach(doc => {
                                    userCompaniesMap[uid][doc.id] = doc.data().name || "";
                                });
                            }
                        } catch(e) { } // Silently ignore failed subcollection fetches
                    });
                    
                    await Promise.all(fetchPromises);

                } catch (e) { console.error("Error inicializando Admin Tickets:", e); }
                finally { hideLoading(); }

                populateAdminTicketClients();
                resetAdminTicketForm();
                setAdminTicketSubView('create');
            }

            function setAdminTicketSubView(view) {
                document.getElementById('sub-view-admin-create').style.display = view === 'create' ? 'block' : 'none';
                document.getElementById('sub-view-admin-list').style.display = view === 'list' ? 'block' : 'none';

                document.getElementById('btn-admin-view-create').className = view === 'create' ? 'btn btn-primary' : 'btn btn-outline';
                document.getElementById('btn-admin-view-list').className = view === 'list' ? 'btn btn-primary' : 'btn btn-outline';

                if (view === 'create' && adminTicketCompID === 'ALL') {
                    const select = document.getElementById('admin-ticket-company-select');
                    // Pick first option that is not ALL
                    for (let opt of select.options) {
                        if (opt.value !== 'ALL') {
                            select.value = opt.value;
                            adminTicketCompID = opt.value;
                            const event = new Event('change');
                            select.dispatchEvent(event);
                            break;
                        }
                    }
                }

                if (view === 'list' && adminTicketUID && adminTicketCompID) {
                    loadAdminTicketList();
                }

                // Scroll to top with delay or immediately
                setTimeout(() => window.scrollTo(0, 0), 50);
            }

            function populateAdminTicketClients(filter = "") {
                const select = document.getElementById('admin-ticket-client-select');
                if (!select) return;
                const currentVal = select.value;
                select.innerHTML = '';

                // Agrupar por Email (o ID si no hay Email) y priorizar el registro que tenga 'authUid' (más completo)
                const grouped = {};
                Object.values(userMap).forEach(u => {
                    const key = (u.email || u.id || "unk").toLowerCase();
                    const existing = grouped[key];
                    // Priorizar el que tiene authUid (vinculado a login) o idNum
                    if (!existing || (!existing.authUid && u.authUid) || (!existing.idNum && u.idNum)) {
                        grouped[key] = u;
                    }
                });

                const uniqueEntries = Object.values(grouped);
                uniqueEntries.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

                const f = filter.toLowerCase();
                let count = 0;
                
                // Opción vacía por defecto
                const defaultOpt = document.createElement('option');
                defaultOpt.value = "";
                defaultOpt.disabled = true;
                defaultOpt.textContent = "--- SELECCIONA UN CLIENTE ---";
                select.appendChild(defaultOpt);

                uniqueEntries.forEach(u => {
                    const uid = u.id || u.email;
                    const companies = userCompaniesMap[uid] || userCompaniesMap[u.authUid] || "";
                    const companiesStr = (typeof companies === 'string') ? companies : (Object.values(companies || {}).map(c => c.name || c).join(" "));
                    const searchStr = ((u.name || "") + " " + (u.idNum || "") + " " + (u.email || "") + " " + companiesStr).toLowerCase();

                    if (f && !searchStr.includes(f)) return;

                    const opt = document.createElement('option');
                    opt.value = uid;
                    opt.style.padding = "10px";
                    opt.textContent = `[#${u.idNum || '?'}] ${u.name || 'Sin Nombre'}`;
                    select.appendChild(opt);
                    count++;
                });

                if (currentVal && Array.from(select.options).some(o => o.value === currentVal)) {
                    select.value = currentVal;
                } else {
                    select.value = "";
                }
                
                // Dispatch change event to clear dependencies if blank, or load if a client is pre-selected
                const event = new Event('change');
                select.dispatchEvent(event);
            }

            document.getElementById('admin-ticket-client-search').oninput = (e) => {
                populateAdminTicketClients(e.target.value);
            };

            document.getElementById('admin-ticket-client-select').onchange = async (e) => {
                adminTicketUID = e.target.value;
                await loadAdminTicketCompanies(adminTicketUID);
                await loadAdminTicketDestinations(adminTicketUID);

                refreshAdminSuggestedSizes(adminTicketUID, adminTicketCompID);

                const createView = document.getElementById('sub-view-admin-create');
                const listBtn = document.getElementById('btn-admin-view-list');
                const createBtn = document.getElementById('btn-admin-view-create');

                // Si no hay uid, desactivar los botones o volver a crear
                if (!adminTicketUID) {
                     setAdminTicketSubView('create');
                     return;
                }

                if (createView.style.display === 'none') {
                    setAdminTicketSubView('list');
                } else {
                    setTimeout(() => window.scrollTo(0, 0), 50);
                }
            };

            let lastLoadedCompaniesUid = null;
            async function loadAdminTicketCompanies(uid, force = false) {
                const select = document.getElementById('admin-ticket-company-select');
                if (!uid) {
                    if (select) {
                        select.innerHTML = '<option value="">-- SELECCIONA CLIENTE PRIMERO --</option>';
                    }
                    adminTicketCompID = null;
                    return;
                }
                if (uid === lastLoadedCompaniesUid && !force) return;
                lastLoadedCompaniesUid = uid;

                console.log("Loading companies for:", uid);
                if (!select) return;
                select.innerHTML = '<option value="">Cargando empresas...</option>';
                try {
                    const aliases = await getClientDocAliases(uid);

                    let snap = null;
                    for (const id of aliases) {
                        const s = await db.collection('users').doc(id).collection('companies').get();
                        if (!s.empty) { snap = s; break; }
                    }

                    select.innerHTML = '';
                    adminCompaniesCache = {};

                    // Add "TODAS" option for full visibility
                    const optAll = document.createElement('option');
                    optAll.value = 'ALL';
                    optAll.textContent = '📂 TODAS LAS SEDES';
                    select.appendChild(optAll);

                    if (snap && !snap.empty) {
                        snap.forEach(doc => {
                            const d = doc.data();
                            adminCompaniesCache[doc.id] = d;
                            const opt = document.createElement('option');
                            opt.value = doc.id;
                            opt.textContent = d.name;
                            select.appendChild(opt);
                        });
                        // Refresh search map
                        userCompaniesMap[uid] = Object.values(adminCompaniesCache).map(c => c.name).join(" ");
                    } else {
                        const uData = userMap[uid] || {};
                        const opt = document.createElement('option');
                        opt.value = 'comp_main';
                        opt.textContent = '🏠 Empresa Principal (Defecto)';
                        select.appendChild(opt);
                        adminCompaniesCache['comp_main'] = {
                            name: uData.name || 'Empresa Principal',
                            address: uData.senderAddress || uData.street || 'Sin dirección',
                            phone: uData.senderPhone || ''
                        };
                    }

                    const compKeys = Object.keys(adminCompaniesCache);
                    if (compKeys.length === 1) {
                        select.value = compKeys[0];
                        adminTicketCompID = compKeys[0];
                    } else {
                        select.value = "ALL";
                        adminTicketCompID = "ALL";
                    }

                    // Trigger the dropdown change event to natively bind text nodes & display elements.
                    select.dispatchEvent(new Event('change'));

                } catch (e) {
                    console.error("Error cargando empresas admin:", e);
                    select.innerHTML = '<option value="">Error de conexión</option>';
                }
            }

            async function loadAdminTicketDestinations(uid) {
                adminDestinationsCache = [];
                const resultsDiv = document.getElementById('admin-t-destinations-results');
                if (resultsDiv) resultsDiv.classList.add('hidden');

                if (!uid) return;
                try {
                    const aliases = await getClientDocAliases(uid);
                    let snap = null;
                    for (const id of aliases) {
                        const s = await db.collection('users').doc(id).collection('destinations').get();
                        if (!s.empty) { snap = s; break; }
                    }

                    if (snap && !snap.empty) {
                        snap.forEach(doc => {
                            const d = doc.data();
                            if (d.addresses && Array.isArray(d.addresses)) {
                                d.addresses.forEach(addr => {
                                    adminDestinationsCache.push({
                                        name: d.name || 'Sin Nombre',
                                        phone: d.phone || '',
                                        ...addr
                                    });
                                });
                            } else if (d.address || d.street || d.localidad || d.cp) {
                                // Soporte para formato antiguo (Flat Object)
                                adminDestinationsCache.push({
                                    name: d.name || 'Sin Nombre',
                                    phone: d.phone || '',
                                    address: d.address || '',
                                    street: d.street || '',
                                    number: d.number || '',
                                    localidad: d.localidad || d.city || '',
                                    cp: d.cp || '',
                                    province: d.province || ''
                                });
                            }
                        });
                        console.log(`Cargadas ${adminDestinationsCache.length} destinaciones para el cliente.`);
                    }
                } catch (e) { console.warn("Error cargando agenda de cliente:", e); }
            }

            const adminTReceiver = document.getElementById('admin-t-receiver');
            const adminTResults = document.getElementById('admin-t-destinations-results');

            if (adminTReceiver && adminTResults) {
                const showAdminDestinations = () => {
                    const q = adminTReceiver.value.toLowerCase().trim();
                    let matches = adminDestinationsCache;

                    if (q.length > 0) {
                        matches = adminDestinationsCache.filter(d =>
                            (d.name && d.name.toLowerCase().includes(q)) ||
                            (d.address && d.address.toLowerCase().includes(q)) ||
                            (d.street && d.street.toLowerCase().includes(q))
                        );
                    }
                    
                    matches = matches.slice(0, 15);

                    if (matches.length === 0) { adminTResults.classList.add('hidden'); return; }

                    adminTResults.innerHTML = '';
                    adminTResults.classList.remove('hidden');
                    
                    const cleanStr = (s) => (s && String(s).toLowerCase() !== 'undefined') ? String(s).trim() : '';

                    matches.forEach(m => {
                        const div = document.createElement('div');
                        div.className = 'suggestion-item';
                        div.style = "padding:10px; border-bottom:1px solid var(--border-glass); cursor:pointer; font-size:0.8rem;";
                        
                        let printAddr = cleanStr(m.address) || cleanStr(m.street);
                        let printLoc = cleanStr(m.localidad) || cleanStr(m.province);
                        let fullSpan = [printAddr, cleanStr(m.number), printLoc].filter(Boolean).join(', ');

                        div.innerHTML = `<strong>${cleanStr(m.name)}</strong><br><span style="color:#888;">${fullSpan}</span>`;
                        div.onclick = () => {
                            adminTReceiver.value = cleanStr(m.name);
                            document.getElementById('admin-t-phone').value = cleanStr(m.phone);
                            document.getElementById('admin-t-address').value = cleanStr(m.street) || cleanStr(m.address);
                            document.getElementById('admin-t-number').value = cleanStr(m.number);
                            document.getElementById('admin-t-locality').value = cleanStr(m.localidad);
                            document.getElementById('admin-t-cp').value = cleanStr(m.cp);
                            document.getElementById('admin-t-province').value = cleanStr(m.province);
                            adminTResults.classList.add('hidden');
                        };
                        adminTResults.appendChild(div);
                    });
                };

                adminTReceiver.addEventListener('input', showAdminDestinations);
                adminTReceiver.addEventListener('focus', showAdminDestinations);

                // Hide suggestions on blur (with delay to allow click)
                adminTReceiver.onblur = () => {
                    setTimeout(() => adminTResults.classList.add('hidden'), 200);
                };
            }

            // --- GESTIÓN DE SEDES Y AGENDA (ADMIN ACTIONS) ---
            // Helper: Obtener todos los IDs de consulta posibles para un cliente (UID, Email, IDNum)
            async function getClientDocAliases(uid) {
                const aliases = new Set();
                if (uid) aliases.add(uid);
                const u = userMap[uid];
                if (u) {
                    if (u.id) aliases.add(u.id);
                    if (u.email) aliases.add(u.email.toLowerCase());
                    if (u.authUid) aliases.add(u.authUid);
                    if (u.idNum) {
                        const n = String(u.idNum);
                        aliases.add(n);
                        aliases.add(n.padStart(3, '0'));
                    }
                }
                // También buscar por email si recordamos el UID original
                if (typeof uid === 'string' && uid.includes('@')) {
                    aliases.add(uid.toLowerCase());
                }
                return [...aliases].filter(x => x && typeof x === 'string');
            }

            window.getBankName = function(iban) {
                const clean = (iban || '').replace(/[\s-]/g, '').toUpperCase();
                if (clean.length >= 8 && clean.startsWith('ES')) {
                    const c = clean.substring(4, 8);
                    const b = {'0182':'BBVA','0049':'SANTANDER','0030':'SANTANDER','2100':'CAIXABANK','0081':'SABADELL','2038':'CAIXABANK','0128':'BANKINTER','0138':'BANKOA','0239':'EVO BANCO','3025':'CAJA INGENIEROS','3190':'IBERCAJA','0073':'OPENBANK','0149':'MYINVESTOR','1465':'ING DIRECT','0237':'CAJASUR','2085':'IBERCAJA','3058':'CAJAMAR','0019':'BANESTO','2095':'KUTXABANK','2048':'KUTXABANK'};
                    return b[c] || 'ENTIDAD: ' + c;
                }
                return '';
            };

            document.getElementById('comp-iban').addEventListener('input', (e) => {
                let val = e.target.value.toUpperCase().replace(/[^\dA-Z\-_]/g, '');
                e.target.value = val.match(/.{1,4}/g)?.join(' ') || '';
                document.getElementById('comp-bank-name').textContent = window.getBankName(val);
            });


            window.openManageCompaniesModal = async (uid) => {
                currentAdminTargetUid = uid || adminTicketUID;
                if (!currentAdminTargetUid) {
                    alert("Por favor, selecciona un cliente primero.");
                    return;
                }
                document.getElementById('modal-manage-companies').style.display = 'flex';
                document.getElementById('company-form-area').style.display = 'none';
                window.scrollTo({ top: 0, behavior: 'smooth' });
                document.getElementById('modal-manage-companies').scrollTop = 0;
                loadCompaniesTable(currentAdminTargetUid);
            };

            window.openNewCompanyForm = () => {
                document.getElementById('company-form-area').style.display = 'block';
                document.getElementById('edit-company-id').value = '';
                document.getElementById('comp-name').value = '';
                document.getElementById('comp-prefix').value = '';
                document.getElementById('comp-iban').value = '';
                document.getElementById('comp-bank-name').textContent = '';
                document.getElementById('comp-start-num').value = '1001';
                document.getElementById('comp-street').value = '';
                document.getElementById('comp-number').value = '';
                document.getElementById('comp-city').value = '';
                document.getElementById('comp-cp').value = '';
                document.getElementById('comp-province').value = '';
                document.getElementById('comp-phone').value = '';

                // Populate sub-tariff select
                const uData = userMap[currentAdminTargetUid] || {};
                const select = document.getElementById('comp-subtariff-id');
                select.innerHTML = '<option value="">-- Usar Tarifa Global --</option>';

                const baseT = tariffsCache[currentAdminTargetUid] || (uData.tariffId && tariffsCache["GLOBAL_" + uData.tariffId]);
                if (baseT && baseT.subTariff) {
                    Object.keys(baseT.subTariff).forEach(id => {
                        select.innerHTML += `<option value="${id}">${id}</option>`;
                    });
                }
            };

            window.saveCompany = async () => {
                if (!currentAdminTargetUid) return;
                const compId = document.getElementById('edit-company-id').value || 'comp_' + Date.now();
                const name = document.getElementById('comp-name').value.trim();
                const prefix = document.getElementById('comp-prefix').value.trim().toUpperCase();
                const iban = document.getElementById('comp-iban').value.trim().toUpperCase();
                const startNum = parseInt(document.getElementById('comp-start-num').value) || 1001;
                const street = document.getElementById('comp-street').value.trim();
                const num = document.getElementById('comp-number').value.trim();
                const city = document.getElementById('comp-city').value.trim();
                const cp = document.getElementById('comp-cp').value.trim();
                const province = document.getElementById('comp-province').value.trim();
                const phone = document.getElementById('comp-phone').value.trim();
                const subTariffId = document.getElementById('comp-subtariff-id').value;

                if (!name) { alert("El nombre de la sede es obligatorio."); return; }

                const addressParts = [];
                if (street) addressParts.push(street);
                if (num) addressParts.push("Nº " + num);
                if (city) addressParts.push(city);
                if (cp) addressParts.push(`(CP ${cp})`);
                const fullAddress = addressParts.join(', ');

                const data = {
                    name, prefix, startNum, street, number: num, localidad: city, cp, province, phone,
                    address: fullAddress, iban,
                    subTariffId: subTariffId || null,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                };

                showLoading();
                try {
                    await db.collection('users').doc(currentAdminTargetUid).collection('companies').doc(compId).set(data, { merge: true });
                    alert("✅ Sede guardada correctamente.");
                    document.getElementById('company-form-area').style.display = 'none';
                    loadCompaniesTable(currentAdminTargetUid);
                } catch (e) {
                    alert("Error al guardar sede: " + e.message);
                } finally {
                    hideLoading();
                }
            };

            async function loadCompaniesTable(uid) {
                const tbody = document.getElementById('company-manage-list-body');
                tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Cargando sedes...</td></tr>';
                try {
                    const aliases = await getClientDocAliases(uid);
                    let snap = null;
                    for (const id of aliases) {
                        const s = await db.collection('users').doc(id).collection('companies').get();
                        if (!s.empty) { snap = s; break; }
                    }

                    tbody.innerHTML = '';
                    if (!snap || snap.empty) {
                        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:#888;">No hay sedes configuradas.</td></tr>';
                        return;
                    }
                    snap.forEach(doc => {
                        const d = doc.data();
                        const tr = document.createElement('tr');
                        tr.innerHTML = `
                        <td><strong>${d.name}</strong></td>
                        <td style="font-size:0.75rem; color:#888;">${d.address || '---'}</td>
                        <td><span class="chip">${d.prefix || 'NP'} ${d.startNum || ''}</span></td>
                        <td><span class="chip" style="background:var(--brand-primary); opacity:0.8;">${d.subTariffId || 'Principal'}</span></td>
                        <td>
                            <div style="display:flex; gap:5px;">
                                <button class="btn btn-primary btn-sm" onclick="editCompany('${doc.id}')" title="Editar Sede">✏️</button>
                                <button class="btn btn-danger btn-sm" onclick="deleteCompany('${doc.id}')" title="Eliminar Sede">🗑️</button>
                            </div>
                        </td>
                    `;
                        tbody.appendChild(tr);
                    });
                } catch (e) {
                    tbody.innerHTML = '<tr><td colspan="5" style="color:red; text-align:center;">Error: ' + e.message + '</td></tr>';
                }
            }

            window.editCompany = async (compId) => {
                const aliases = await getClientDocAliases(currentAdminTargetUid);
                let docSnap = null;
                for (const id of aliases) {
                    const d = await db.collection('users').doc(id).collection('companies').doc(compId).get();
                    if (d.exists) { docSnap = d; break; }
                }
                if (!docSnap || !docSnap.exists) { alert("Sede no encontrada."); return; }
                const d = docSnap.data();
                openNewCompanyForm();
                document.getElementById('edit-company-id').value = compId;
                document.getElementById('comp-name').value = d.name || '';
                document.getElementById('comp-prefix').value = d.prefix || '';
                document.getElementById('comp-iban').value = d.iban || '';
                if(d.iban) document.getElementById('comp-bank-name').textContent = window.getBankName(d.iban);
                else document.getElementById('comp-bank-name').textContent = '';
                document.getElementById('comp-start-num').value = d.startNum || '1001';
                document.getElementById('comp-street').value = d.street || '';
                document.getElementById('comp-number').value = d.number || '';
                document.getElementById('comp-city').value = d.localidad || '';
                document.getElementById('comp-cp').value = d.cp || '';
                document.getElementById('comp-province').value = d.province || '';
                document.getElementById('comp-phone').value = d.phone || '';
                document.getElementById('comp-subtariff-id').value = d.subTariffId || '';
            };

            window.deleteCompany = async (compId) => {
                if (!confirm("¿Eliminar esta sede?")) return;
                showLoading();
                try {
                    const aliases = await getClientDocAliases(currentAdminTargetUid);
                    for (const id of aliases) {
                        await db.collection('users').doc(id).collection('companies').doc(compId).delete();
                    }
                    loadCompaniesTable(currentAdminTargetUid);
                } catch (e) { alert("Error: " + e.message); }
                finally { hideLoading(); }
            };

            // Agenda / Destinations logic for Admin
            window.openManageDestinationsModal = async (uid) => {
                currentAdminTargetUid = uid || adminTicketUID;
                if (!currentAdminTargetUid) {
                    alert("Por favor, selecciona un cliente primero.");
                    return;
                }
                document.getElementById('modal-manage-destinations').style.display = 'flex';
                resetAdminDestForm();
                loadAdminDestinationsList(currentAdminTargetUid);
            };

            window.saveAdminDestination = async () => {
                if (!currentAdminTargetUid) return;
                const editId = document.getElementById('admin-dest-edit-id').value;
                const name = document.getElementById('admin-dest-name').value.trim().toUpperCase();
                const phone = document.getElementById('admin-dest-phone').value.trim();
                const nif = document.getElementById('admin-dest-nif').value.trim();
                const street = document.getElementById('admin-dest-street').value.trim();
                const number = document.getElementById('admin-dest-number').value.trim();
                const city = document.getElementById('admin-dest-locality').value.trim();
                const cp = document.getElementById('admin-dest-cp').value.trim();
                const province = document.getElementById('admin-dest-province').value.trim();
                const notes = document.getElementById('admin-dest-notes').value.trim();

                if (!name || !street) { alert("Nombre y calle son obligatorios."); return; }

                const addrParts = [];
                if (street) addrParts.push(street);
                if (number) addrParts.push("Nº " + number);
                if (city) addrParts.push(city);
                if (cp) addrParts.push(`(CP ${cp})`);
                const fullAddress = addrParts.join(', ');

                const destData = {
                    name, phone, nif, notes,
                    addresses: [{
                        address: fullAddress,
                        street, number, localidad: city, cp, province
                    }],
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                };

                showLoading();
                try {
                    if (editId) {
                        await db.collection('users').doc(currentAdminTargetUid).collection('destinations').doc(editId).set(destData, { merge: true });
                        alert("✅ Destinatario actualizado.");
                    } else {
                        await db.collection('users').doc(currentAdminTargetUid).collection('destinations').add(destData);
                        alert("✅ Destinatario añadido a la agenda.");
                    }
                    resetAdminDestForm();
                    loadAdminDestinationsList(currentAdminTargetUid);
                } catch (e) { alert("Error: " + e.message); }
                finally { hideLoading(); }
            };

            window.resetAdminDestForm = () => {
                document.getElementById('admin-dest-edit-id').value = '';
                const titleEl = document.getElementById('admin-dest-form-title');
                if (titleEl) titleEl.textContent = "NUEVA ENTRADA DE AGENDA";
                document.querySelectorAll('#modal-manage-destinations input, #modal-manage-destinations textarea').forEach(i => i.value = '');
            };

            async function loadAdminDestinationsList(uid) {
                const tbody = document.getElementById('admin-destinations-list-body');
                if (!tbody) return;
                tbody.innerHTML = '<tr><td colspan="2" style="text-align:center; padding:20px;">Cargando agenda...</td></tr>';
                try {
                    const aliases = await getClientDocAliases(uid);
                    let snap = null;
                    for (const id of aliases) {
                        const s = await db.collection('users').doc(id).collection('destinations').get();
                        if (!s.empty) { snap = s; break; }
                    }

                    tbody.innerHTML = '';
                    if (!snap || snap.empty) {
                        tbody.innerHTML = '<tr><td colspan="2" style="text-align:center; padding:20px; color:#888;">La agenda está vacía.</td></tr>';
                        return;
                    }
                    snap.forEach(doc => {
                        const d = doc.data();
                        const addr = d.addresses ? d.addresses[0] : {};
                        const tr = document.createElement('tr');
                        tr.innerHTML = `
                        <td>
                            <div style="font-weight:700;">${d.name}</div>
                            <div style="font-size:0.75rem; color:#888;">${addr.address || 'Sin dirección'}</div>
                        </td>
                        <td style="text-align:right;">
                            <div style="display:flex; gap:5px; justify-content:flex-end;">
                                <button class="btn btn-primary btn-sm" onclick="editAdminDestination('${doc.id}')" title="Editar Contacto">✏️</button>
                                <button class="btn btn-danger btn-sm" onclick="deleteAdminDestination('${doc.id}')" title="Eliminar Contacto">🗑️</button>
                            </div>
                        </td>
                    `;
                        tbody.appendChild(tr);
                    });
                } catch (e) { tbody.innerHTML = '<tr><td colspan="2" style="color:red;">Error: ' + e.message + '</td></tr>'; }
            }

            window.editAdminDestination = async (destId) => {
                const aliases = await getClientDocAliases(currentAdminTargetUid);
                let docSnap = null;
                for (const id of aliases) {
                    const d = await db.collection('users').doc(id).collection('destinations').doc(destId).get();
                    if (d.exists) { docSnap = d; break; }
                }
                if (!docSnap || !docSnap.exists) { alert("Contacto no encontrado."); return; }
                const d = docSnap.data();
                const addr = d.addresses ? d.addresses[0] : {};

                document.getElementById('admin-dest-edit-id').value = destId;
                document.getElementById('admin-dest-name').value = d.name || '';
                document.getElementById('admin-dest-phone').value = d.phone || '';
                document.getElementById('admin-dest-nif').value = d.nif || '';
                document.getElementById('admin-dest-street').value = addr.street || '';
                document.getElementById('admin-dest-number').value = addr.number || '';
                document.getElementById('admin-dest-locality').value = addr.localidad || '';
                document.getElementById('admin-dest-cp').value = addr.cp || '';
                document.getElementById('admin-dest-province').value = addr.province || '';
                document.getElementById('admin-dest-notes').value = d.notes || '';
                document.getElementById('admin-dest-form-title').textContent = "EDITAR ENTRADA DE AGENDA";
            };

            window.deleteAdminDestination = async (destId) => {
                if (!confirm("¿Eliminar este contacto de la agenda?")) return;
                showLoading();
                try {
                    const aliases = await getClientDocAliases(currentAdminTargetUid);
                    for (const id of aliases) {
                        await db.collection('users').doc(id).collection('destinations').doc(destId).delete();
                    }
                    loadAdminDestinationsList(currentAdminTargetUid);
                } catch (e) { alert("Error: " + e.message); }
                finally { hideLoading(); }
            };


            function refreshAdminSuggestedSizes(uid, compId) {
                const datalist = document.getElementById('admin-suggested-sizes');
                if (!datalist) return;

                // Base sizes as fallback
                const baseSizes = ["Sobre", "Pequeño", "Mediano", "Grande", "Palet", "Bulto", "Caja"];
                let items = [...baseSizes];

                try {
                    const uData = userMap[uid] || {};
                    let baseT = null;

                    // Lookup strategy (matches price calculation)
                    if (uData.tariffId) {
                        const tid = String(uData.tariffId).trim();
                        baseT = tariffsCache["GLOBAL_" + tid] ||
                            tariffsCache["GLOBAL_" + tid.padStart(3, '0')] ||
                            tariffsCache["GLOBAL_" + parseInt(tid)];
                    }

                    if (!baseT) {
                        baseT = tariffsCache[uid] || (uData.id && tariffsCache[uData.id]) || {};
                    }

                    if (baseT) {
                        const tariffItems = baseT.items ? Object.keys(baseT.items) : Object.keys(baseT).filter(k => k !== 'subTariff' && k !== 'id');
                        items = [...new Set([...items, ...tariffItems])];

                        // Overlay sub-tariff if applicable
                        if (compId && compId !== 'ALL' && adminCompaniesCache[compId] && adminCompaniesCache[compId].subTariffId) {
                            const subId = adminCompaniesCache[compId].subTariffId;
                            if (baseT.subTariff && baseT.subTariff[subId]) {
                                const subItems = Object.keys(baseT.subTariff[subId]);
                                items = [...new Set([...items, ...subItems])];
                            }
                        }
                    }
                } catch (e) { console.warn("Error refreshing suggested sizes", e); }

                datalist.innerHTML = items.map(s => `<option value="${s}">`).join('');
            }

            document.getElementById('admin-ticket-company-select').onchange = (e) => {
                adminTicketCompID = e.target.value;

                refreshAdminSuggestedSizes(adminTicketUID, adminTicketCompID);

                // Actualizar info visual del remitente
                const infoBox = document.getElementById('admin-t-sender-info');
                const infoText = document.getElementById('admin-t-sender-text');
                const infoLabel = document.getElementById('admin-t-sender-label');
                const comp = adminCompaniesCache[adminTicketCompID];
                
                if (comp) {
                    if(infoLabel) infoLabel.textContent = '🏢 FACTURANDO ACTUALMENTE A:';
                    if(infoText) infoText.textContent = `${comp.name} - ${comp.address || 'Sin dirección'}`;
                    if(infoBox) {
                        infoBox.style.background = 'linear-gradient(135deg, rgba(76, 175, 80, 0.15), rgba(76, 175, 80, 0.05))';
                        infoBox.style.borderColor = 'var(--brand-primary)';
                        infoBox.style.display = 'block';
                    }
                } else {
                    if(infoLabel) infoLabel.textContent = '⚠️ ATENCIÓN: SEDE NO DEFINIDA';
                    if(infoText) infoText.textContent = 'SELECCIONE UNA EMPRESA ESPECÍFICA ABAJO';
                    if(infoBox) {
                        infoBox.style.background = 'linear-gradient(135deg, rgba(255, 60, 48, 0.15), rgba(255, 60, 48, 0.05))';
                        infoBox.style.borderColor = '#FF3C30';
                        infoBox.style.display = 'block';
                    }
                }

                setAdminTicketSubView('list');
                loadAdminTicketList('first');
            };

            async function loadAdminTicketList(direction = 'first') {
                if (adminTicketsListener) adminTicketsListener();
                const tbody = document.getElementById('admin-tickets-table-body');
                const paginationUI = document.getElementById('admin-tickets-pagination');

                try {
                    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:20px;">Cargando albaranes...</td></tr>';
                    const uData = userMap[adminTicketUID] || {};
                    const idNumStr = String(uData.idNum || '').trim();
                    if (!idNumStr && !adminTicketUID) return;

                    // 1. Build Base Query (Smart retrieval using multiple match factors)
                    let query = db.collection('tickets');

                    // Búsqueda "Universal": combinamos variantes de ID numérico e Identidades (UID/Email)
                    // Esto asegura que albaranes de ayer (en diversos formatos) siempre aparezcan
                    let searchIdentities = [];
                    if (idNumStr) {
                        searchIdentities.push(idNumStr, idNumStr.padStart(3, '0'), idNumStr.padStart(2, '0'));
                        const n = parseInt(idNumStr);
                        if (!isNaN(n)) searchIdentities.push(n);
                    }

                    // Añadimos también los identificadores de cuenta (UID, Email) por si se guardaron ahí
                    const identityIds = [adminTicketUID, uData.id, uData.authUid, uData.email];
                    searchIdentities = [...new Set([...searchIdentities, ...identityIds].filter(x => x && (typeof x === 'string' || typeof x === 'number')))];

                    // Limitamos a 10 elementos por restricción de Firestore 'in'
                    const finalSearchIds = searchIdentities.slice(0, 10);
                    query = query.where('clientIdNum', 'in', finalSearchIds);

                    // 2. Local pagination variables
                    if (direction === 'first') adminTicketsPage = 1;

                    const executeSearch = (searchField, searchValues) => {
                        if (adminTicketsListener) adminTicketsListener();
                        let q = db.collection('tickets').where(searchField, 'in', searchValues.slice(0, 10));

                        adminTicketsListener = q.onSnapshot(snapshot => {
                            if (snapshot.empty && searchField === 'clientIdNum' && adminTicketsPage === 1) {
                                const uids = [...new Set(identityIds.filter(x => x && typeof x === 'string'))];
                                if (uids.length > 0) return executeSearch('uid', uids);
                            }

                            let raw = [];
                            snapshot.forEach(doc => raw.push({ ...doc.data(), docId: doc.id, docRef: doc }));

                            // 1. Sort locally instead of Firebase orderBy
                            raw.sort((a,b) => {
                                const da = a.createdAt && a.createdAt.toDate ? a.createdAt.toDate() : (a.createdAt ? new Date(a.createdAt) : new Date(0));
                                const db_ = b.createdAt && b.createdAt.toDate ? b.createdAt.toDate() : (b.createdAt ? new Date(b.createdAt) : new Date(0));
                                return db_ - da; // Descending
                            });

                            // 2. Filter locally
                            const isMainCompSelected = (adminTicketCompID === "comp_main" || !adminTicketCompID);
                            const filteredFull = raw.filter(t => {
                                const tCompId = t.compId || 'comp_main';
                                const isMainTComp = (tCompId === "comp_main" || tCompId === "default");
                                const compMatch = (adminTicketCompID === "ALL") || (isMainCompSelected && isMainTComp) || (tCompId === adminTicketCompID);

                                // Filter: Only pending tickets (invoiceId empty)
                                // TEMP FIX: Disabled to reveal all history
                                const isPending = true; // !t.invoiceId || String(t.invoiceId).trim() === "" || String(t.invoiceId).toLowerCase() === "null";
                                
                                // Filter: Billing Entity Isolation
                                const filterSel = document.getElementById('filter-admin-billing-entity');
                                const activeFilialVal = filterSel ? filterSel.value : 'ALL';
                                let filialMatch = true;
                                if (activeFilialVal !== 'ALL') {
                                    const tFilial = t.billingEntityId || 'DEFAULT';
                                    filialMatch = (tFilial === activeFilialVal);
                                }
                                
                                // Filter: Driver
                                const driverSel = document.getElementById('filter-admin-driver');
                                const activeDriverVal = driverSel ? driverSel.value : 'ALL';
                                let driverMatch = true;
                                if (activeDriverVal === 'NONE') {
                                    driverMatch = !t.driverPhone;
                                } else if (activeDriverVal !== 'ALL') {
                                    driverMatch = (t.driverPhone === activeDriverVal);
                                }

                                return compMatch && isPending && filialMatch && driverMatch;
                            });
                            
                            // Dynamically update Driver options
                            const driverSel = document.getElementById('filter-admin-driver');
                            if (driverSel && adminTicketsPage === 1) {
                                const currentVal = driverSel.value;
                                const uniqueDrivers = new Set();
                                raw.filter(t => t.driverPhone).forEach(t => uniqueDrivers.add(t.driverPhone));
                                
                                let ops = `<option value="ALL">-- Todos los Repartidores --</option>
                                           <option value="NONE">-- Sin Asignar --</option>`;
                                Array.from(uniqueDrivers).sort().forEach(phone => {
                                    ops += `<option value="${phone}">🚚 ${phone}</option>`;
                                });
                                driverSel.innerHTML = ops;
                                driverSel.value = Array.from(uniqueDrivers).includes(currentVal) || ['ALL','NONE'].includes(currentVal) ? currentVal : 'ALL';
                            }

                            // 3. Apply Local Memory Pagination
                            if (direction === 'next' && (adminTicketsPage * adminTicketsLimit) < filteredFull.length) adminTicketsPage++;
                            else if (direction === 'prev' && adminTicketsPage > 1) adminTicketsPage--;

                            const startIndex = (adminTicketsPage - 1) * adminTicketsLimit;
                            adminCompanyTickets = filteredFull.slice(startIndex, startIndex + adminTicketsLimit);

                            // Silent validation applied natively

                            if (adminCompanyTickets.length === 0) {
                                tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:20px; color:#888;">${adminTicketsPage > 1 ? 'No hay más albaranes en esta página.' : 'Todos los albaranes están facturados.'}</td></tr>`;
                                if (adminTicketsPage === 1) paginationUI.style.display = 'none';
                            } else {
                                tbody.innerHTML = '';
                                adminCompanyTickets.forEach((t, i) => {
                                    const date = (t.createdAt && t.createdAt.toDate) ? t.createdAt.toDate().toLocaleDateString() : 'N/A';
                                    const pkgs = t.packagesList ? t.packagesList.reduce((s, p) => s + (parseInt(p.qty) || 1), 0) : (t.packages || 1);
                                    const price = calculateTicketPrice(t, adminTicketUID);
                                    t.calculatedPrice = price;
                                    const isPrinted = !!t.printed;
                                    const isPendingDelete = !!t.deleteRequested;
                                    
                                    const tr = document.createElement('tr');
                                    tr.className = 'user-row';
                                    if (isPendingDelete) {
                                        tr.style.backgroundColor = 'rgba(255, 59, 48, 0.1)';
                                        tr.style.borderLeft = '4px solid #FF3B30';
                                    }

                                    tr.innerHTML = `
                                <td><input type="checkbox" class="admin-ticket-check" data-index="${i}" onchange="updateAdminSelectedTotal()"></td>
                                <td>${date}</td>
                                <td>${t.id}</td>
                                <td>${t.receiver}</td>
                                <td>${pkgs}</td>
                                <td>${price.toFixed(2)}€</td>
                                <td>${t.driverPhone ? '🚚 ' + t.driverPhone : '<span style="color:#888;font-size:0.75rem;">---</span>'}</td>
                                <td><span class="badge ${isPendingDelete ? 'badge-danger' : (isPrinted ? 'badge-success' : 'badge-warning')}" style="${isPendingDelete ? 'background:#FF3B30;' : ''}">${isPendingDelete ? '🚨 ANULAR' : (isPrinted ? '🖨️ IMPRESO' : '🕒 NUEVO')}</span></td>
                                <td style="text-align:right;">
                                    <button class="btn btn-xs btn-outline" style="border-color:#F59E0B; color:#F59E0B;" onclick="openTicketReassignModal('${t.docId}')" title="Reasignar Repartidor">🚚</button>
                                    <button class="btn btn-xs btn-outline" style="border-color:#3B82F6; color:#3B82F6;" onclick="openTicketEditModal('${t.docId}')" title="Editar Metadata e Incidencias">✏️</button>
                                    <button class="btn btn-xs btn-outline" style="border-color:#147A4B; color:#147A4B;" onclick="openTicketPreviewModal('${t.docId}')" title="Examinar / Aprobar Borrado">🔍</button>
                                    <button class="btn btn-xs btn-outline" onclick="printTicketFromAdmin('${adminTicketUID}', '${adminTicketCompID}', '${t.docId}')">🖨️</button>
                                </td>
                            `;
                                    tbody.appendChild(tr);
                                });

                                // Show Pagination controls
                                paginationUI.style.display = 'flex';
                                document.getElementById('label-admin-tickets-page').textContent = `Página ${adminTicketsPage}`;
                                document.getElementById('btn-admin-tickets-prev').disabled = (adminTicketsPage === 1);
                                document.getElementById('btn-admin-tickets-next').disabled = ((adminTicketsPage * adminTicketsLimit) >= filteredFull.length);
                            }
                            updateAdminSelectedTotal();
                        }, err => {
                            console.error("Error en escucha de albaranes:", err);
                            tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:20px; color:red;">Error: ${err.message}</td></tr>`;
                        });
                    };

                    executeSearch('clientIdNum', finalSearchIds);
                } catch (e) {
                    console.error(e);
                    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:20px; color:red;">Error: ${e.message}</td></tr>`;
                }
            }

            async function calculateTicketPriceAsync(t, uid, compId) {
                const uData = userMap[uid] || {};
                const baseT = (uData.tariffId && tariffsCache["GLOBAL_" + uData.tariffId]) ? tariffsCache["GLOBAL_" + uData.tariffId] : (tariffsCache[uid] || {});
                let activeTariffRaw = baseT.items ? { ...baseT.items } : { ...baseT };
                delete activeTariffRaw.subTariff;
                delete activeTariffRaw.items;

                // 2. Check for Sub-Tariff if Sede is provided
                if (compId) {
                    // Try from local cache first (usually populated in admin views)
                    let subId = (adminCompaniesCache[compId]) ? adminCompaniesCache[compId].subTariffId : null;

                    // Fallback to fetch if not in cache (async)
                    if (!subId) {
                        try {
                            const compDoc = await db.collection('users').doc(uid).collection('companies').doc(compId).get();
                            subId = compDoc.exists ? compDoc.data().subTariffId : null;
                        } catch (e) { console.warn("Sub-tariff lookup fail", e); }
                    }

                    if (subId && baseT.subTariff && baseT.subTariff[subId]) {
                        Object.assign(activeTariffRaw, baseT.subTariff[subId]);
                    }
                }

                const activeTariff = {};
                Object.keys(activeTariffRaw).forEach(k => { activeTariff[k.toLowerCase()] = activeTariffRaw[k]; });

                let price = 0;
                if (t.packagesList) {
                    t.packagesList.forEach(p => {
                        const sizeKey = (p.size || 'Bulto').toLowerCase();
                        price += (parseInt(p.qty) || 1) * (activeTariff[sizeKey] || 0);
                    });
                } else {
                    const sizeKey = (t.size || 'Bulto').toLowerCase();
                    price = (parseInt(t.packages) || 1) * (activeTariff[sizeKey] || 0);
                }
                return price;
            }

            // Keep synchronous version for legacy if needed or wrap
            function calculateTicketPrice(t, uid) {
                // This is now suboptimal because sub-tariffs require async lookup.
                // We will try to pre-cache everything in initReportsView or loadAdminTicketList.
                return calculateTicketPriceSync(t, uid, adminTicketCompID);
            }

            function calculateTicketPriceSync(t, uid, compId) {
                if (!t) return 0;
                const uData = userMap[uid] || {};
                let baseT = null;

                // 1. Precise Lookup Strategy
                if (uData.tariffId) {
                    const tid = String(uData.tariffId).trim();
                    // Try literal, then numeric padding, then raw number
                    baseT = tariffsCache["GLOBAL_" + tid] ||
                        tariffsCache["GLOBAL_" + tid.padStart(3, '0')] ||
                        tariffsCache["GLOBAL_" + parseInt(tid)];
                }

                // Fallback to personal tariff using any available ID key
                if (!baseT) {
                    baseT = tariffsCache[uid] ||
                        (uData.id && tariffsCache[uData.id]) ||
                        (uData.authUid && tariffsCache[uData.authUid]) ||
                        (uData.email && tariffsCache[uData.email]) ||
                        {};
                }

                // 2. Extract Tariff Items (Handle modern .items vs legacy root)
                let activeTariffRaw = baseT.items ? { ...baseT.items } : { ...baseT };
                delete activeTariffRaw.subTariff; // Avoid pollution

                // 3. Dynamic Sub-Tariff Overlay (Zonas/Delegaciones)
                // Use the selected company from the cache if possible
                const targetCompId = compId || 'comp_main';
                const companyData = adminCompaniesCache[targetCompId];

                if (companyData && companyData.subTariffId) {
                    const subId = companyData.subTariffId;
                    if (baseT.subTariff && baseT.subTariff[subId]) {
                        Object.assign(activeTariffRaw, baseT.subTariff[subId]);
                    }
                } else if (uData.subTariffId && baseT.subTariff && baseT.subTariff[uData.subTariffId]) {
                    // Secondary fallback to user-level sub-tariff
                    Object.assign(activeTariffRaw, baseT.subTariff[uData.subTariffId]);
                }

                // 4. Case-Insensitive Key Mapping
                const activeTariff = {};
                Object.keys(activeTariffRaw).forEach(k => { activeTariff[k.toLowerCase()] = activeTariffRaw[k]; });

                // 5. Final Calculation
                let price = 0;
                if (t.packagesList && t.packagesList.length > 0) {
                    t.packagesList.forEach(p => {
                        const sizeKey = (p.size || 'Bulto').toLowerCase();
                        const rate = parseFloat(activeTariff[sizeKey]) || 0;
                        price += (parseInt(p.qty) || 1) * rate;
                    });
                } else {
                    const sizeKey = (t.size || 'Bulto').toLowerCase();
                    const rate = parseFloat(activeTariff[sizeKey]) || 0;
                    price = (parseInt(t.packages) || 1) * rate;
                }

                if (price === 0) {
                    console.warn(`[PriceEngine] Ticket ${t.id} calculated as 0. Tariff doc:`, baseT.id || 'none', "Key searched:", (t.size || 'Bulto'));
                }

                return isNaN(price) ? 0 : price;
            }

            window.updateAdminSelectedTotal = () => {
                const checks = document.querySelectorAll('.admin-ticket-check:checked');
                let total = 0;
                checks.forEach(c => {
                    const idx = parseInt(c.dataset.index);
                    total += adminCompanyTickets[idx].calculatedPrice;
                });
                document.getElementById('admin-selected-total').textContent = total.toFixed(2) + '€';
            };

            window.toggleSelectAllAdminTickets = (checked) => {
                const checks = document.querySelectorAll('.admin-ticket-check');
                if (checked === undefined) {
                    // Toggle mode
                    const allSelected = Array.from(checks).every(c => c.checked);
                    checks.forEach(c => c.checked = !allSelected);
                    document.getElementById('admin-select-all-checkbox').checked = !allSelected;
                } else {
                    checks.forEach(c => c.checked = checked);
                }
                updateAdminSelectedTotal();
            };

            window.selectAdminTicketsByDate = () => {
                const dateVal = document.getElementById('admin-tickets-select-date').value;
                if (!dateVal) { alert("⚠️ Selecciona una fecha primero."); return; }
                
                // Format date manually to match the table's locale date (D/M/YYYY or DD/MM/YYYY)
                const d = new Date(dateVal);
                const targetDateText = d.toLocaleDateString();
                
                const checks = document.querySelectorAll('.admin-ticket-check');
                let foundAny = false;
                
                checks.forEach(c => {
                    const idx = parseInt(c.dataset.index);
                    const t = adminCompanyTickets[idx];
                    const tDate = (t.createdAt && t.createdAt.toDate) ? t.createdAt.toDate().toLocaleDateString() : 'N/A';
                    if (tDate === targetDateText) {
                        c.checked = true;
                        foundAny = true;
                    }
                });
                
                updateAdminSelectedTotal();
                if (!foundAny) alert("ℹ️ No se encontraron albaranes para la fecha " + targetDateText + " en la visualización actual.");
            };

            window.exportSelectedToGesco = () => {
                const checks = document.querySelectorAll('.admin-ticket-check:checked');
                if (checks.length === 0) { alert("⚠️ Selecciona primero los albaranes a exportar."); return; }

                const lines = ["ID (Referencia);Destinatario;Direccion;Provincia;Telefono;Bultos;Reembolso;Observaciones"];
                checks.forEach(c => {
                    const idx = parseInt(c.dataset.index);
                    const t = adminCompanyTickets[idx];
                    const pkgs = t.packagesList ? t.packagesList.reduce((s, p) => s + (parseInt(p.qty) || 1), 0) : (t.packages || 1);

                    const cols = [
                        t.id,
                        t.receiver,
                        t.address,
                        t.province,
                        t.phone,
                        pkgs,
                        (t.cod || 0).toFixed(2),
                        (t.notes || "").replace(/;/g, ',')
                    ];
                    lines.push(cols.join(';'));
                });

                const csvContent = "\ufeff" + lines.join("\n");
                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.setAttribute("href", url);
                link.setAttribute("download", `EXPORT_GESCO_${new Date().toISOString().slice(0, 10)}.csv`);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            };

            window.printBulkLabelsQR = async () => {
                const checks = document.querySelectorAll('.admin-ticket-check:checked');
                if (checks.length === 0) { alert("⚠️ Selecciona los albaranes que deseas imprimir."); return; }

                showLoading();
                try {
                    const labelsHTML = [];
                    for (const checkbox of checks) {
                        const idx = parseInt(checkbox.dataset.index);
                        const t = adminCompanyTickets[idx];
                        const docId = t.docId;
                        const qrData = `ALBARAN:${docId}`;
                        const qrImage = await QRCode.toDataURL(qrData, { margin: 1, width: 250 });
                        const pkgs = t.packagesList ? t.packagesList.reduce((s, p) => s + (parseInt(p.qty) || 1), 0) : (t.packages || 1);

                        labelsHTML.push(`
                        <div class="label-page">
                            <div style="display:flex; justify-content:space-between; border-bottom:2px solid black; padding-bottom:5px;">
                                <div style="font-size:1.4rem; font-weight:900;">NOVAPACK</div>
                                <div style="text-align:right; font-size:0.9rem;">ID: ${t.id}</div>
                            </div>
                            <div style="display:grid; grid-template-columns: 1.5fr 1fr; gap:10px; margin-top:10px;">
                                <div>
                                    <p style="font-size:0.75rem; color:#666;">DESTINATARIO:</p>
                                    <p style="font-weight:bold; font-size:1.1rem; line-height:1.2;">${t.receiver}</p>
                                    <p style="font-size:0.9rem;">${t.address}<br><strong>${t.province}</strong></p>
                                    <div style="margin-top:4px; padding:2px 5px; border:2px solid black; display:inline-block; font-weight:900; font-size:0.9rem;">TURNO: ${t.timeSlot || 'MAÑANA'}</div>
                                    <p style="font-size:0.85rem; margin-top:4px;">📞 ${t.phone || '-'}</p>
                                </div>
                                <div style="text-align:center;">
                                    <img src="${qrImage}" style="width:120px; height:120px; border:1px solid #000;">
                                    <p style="font-size:0.5rem; color:#000;">SYNC: ${docId}</p>
                                </div>
                            </div>
                            <div style="margin-top:auto; border-top:1px solid #000; padding-top:10px; display:flex; justify-content:space-between; align-items:center;">
                                <div>
                                    <p style="font-size:0.8rem;">BULTOS: <strong>${pkgs}</strong></p>
                                    <p style="font-size:1.1rem; font-weight:bold;">${t.shippingType || 'PAGADOS'} ${t.cod > 0 ? '| REEM: ' + t.cod.toFixed(2) + '€' : ''}</p>
                                </div>
                                <div style="text-align:right;">
                                </div>
                            </div>
                        </div>
                    `);

                        await db.collection('tickets').doc(docId).update({ printed: true });
                    }

                    const bulkWin = window.open('', '_blank');
                    const css = '@page { size: 4in 6in; margin: 0; } body { font-family: sans-serif; margin: 0; } .label-page { width: 4in; height: 6in; page-break-after: always; padding: 25px; box-sizing: border-box; display: flex; flex-direction: column; background: white; color: black; } p { margin: 0; }';
                    bulkWin.document.write('<html><head><style>' + css + '</style></head><body>' + labelsHTML.join('') + ' <script>window.onload=()=>{window.print();window.close();}<\/script></body></html>');
                    bulkWin.document.close();

                    loadAdminTicketList();

                } catch (e) {
                    alert("Error: " + e.message);
                } finally {
                    hideLoading();
                }
            };

            window.assignDriverBulkAdmin = async () => {
                const checks = document.querySelectorAll('.admin-ticket-check:checked');
                if (checks.length === 0) { alert("⚠️ Selecciona al menos un albarán."); return; }

                const phone = prompt("AÑADIR REPARTIDOR A LA RUTA\n\nIntroduce el TELÉFONO del repartidor para asignar estos albaranes:\n(Ej: 600123456)\n\nDeja en blanco para ELIMINAR el repartidor asignado.");
                if (phone === null) return; // cancel
                
                const cleanPhone = phone.replace(/\D/g, '').replace(/^34/, '');
                
                if (confirm(`¿Actualizar ${checks.length} albaranes al teléfono "${cleanPhone || 'Ninguno'}"?`)) {
                    showLoading();
                    try {
                        const batch = db.batch();
                        const selectedTickets = Array.from(checks).map(c => adminCompanyTickets[parseInt(c.dataset.index)]);
                        
                        for (const t of selectedTickets) {
                            const snap = await db.collection('tickets').where('id', '==', t.id).get();
                            if (!snap.empty) {
                                batch.update(snap.docs[0].ref, { 
                                    driverPhone: cleanPhone,
                                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                                });
                            }
                        }
                        
                        await batch.commit();
                        alert("Repartidores actualizados correctamente.");
                        
                        const selectAll = document.getElementById('admin-select-all-checkbox');
                        if(selectAll) selectAll.checked = false;
                        if(typeof toggleSelectAllAdminTickets === 'function') toggleSelectAllAdminTickets(false);
                        
                        loadAdminTicketList();
                        
                    } catch (e) {
                        alert("Error al asignar repartidor: " + e.message);
                    } finally {
                        hideLoading();
                    }
                }
            };

            window.invoiceSelectedAdminTickets = async () => {
                const checks = document.querySelectorAll('.admin-ticket-check:checked');
                if (checks.length === 0) { alert("⚠️ Selecciona al menos un albarán."); return; }

                const selectedTickets = Array.from(checks).map(c => adminCompanyTickets[parseInt(c.dataset.index)]);
                const subtotal = selectedTickets.reduce((s, t) => s + (t.calculatedPrice || 0), 0);

                if (subtotal <= 0) { alert("⚠️ Los albaranes seleccionados no tienen precio asignado."); return; }

                // --- MULTI-SUBSIDIARY COLLISION CHECK ---
                let distinctEntities = new Set();
                let chosenEntityId = null;
                selectedTickets.forEach(t => {
                    const eId = t.billingEntityId || 'DEFAULT';
                    distinctEntities.add(eId);
                    chosenEntityId = eId;
                });

                if (distinctEntities.size > 1) {
                    alert("🚫 ERROR FISCAL:\nNo puedes facturar albaranes de diferentes Empresas Emisoras (Filiales) en la misma factura.\nPor favor, filtra los albaranes por filial antes de generar la factura.");
                    return;
                }

                // Resolver los Datos del Emisor según la Filial detectada
                let finalSenderData = Object.assign({}, invCompanyData); // Fallback Central
                if (chosenEntityId && chosenEntityId !== 'DEFAULT' && billingCompaniesMap[chosenEntityId]) {
                    const filial = billingCompaniesMap[chosenEntityId];
                    // Override global mapping for this specific invoice
                    finalSenderData = {
                        name: filial.name,
                        cif: filial.nif,
                        address: filial.address,
                        bank: filial.bank || invCompanyData.bank || '',
                        email: filial.email || invCompanyData.email || '',
                        legal: filial.legal || invCompanyData.legal || ''
                    };
                } else {
                    if (!invCompanyData || !invCompanyData.cif) {
                        alert("⚠️ Datos Fiscales Centrales no configurados. (Ajustes -> Facturación)");
                        return;
                    }
                }

                const clientData = userMap[adminTicketUID];
                const ivaRate = parseFloat(document.getElementById('fiscal-iva').value) || 21;
                const irpfRate = parseFloat(document.getElementById('fiscal-irpf').value) || 0;
                const iva = subtotal * (ivaRate / 100);
                const irpf = subtotal * (irpfRate / 100);
                const total = subtotal + iva - irpf;

                if (!confirm(`¿Generar factura por ${total.toFixed(2)}€ emitida por ${finalSenderData.name} (${selectedTickets.length} albaranes)?`)) return;

                showLoading();
                try {
                    const invSnap = await db.collection('invoices').orderBy('number', 'desc').limit(1).get();
                    let nextNum = 1;
                    if (!invSnap.empty) nextNum = (invSnap.docs[0].data().number || 0) + 1;

                    const invoiceData = {
                        number: nextNum,
                        invoiceId: `FAC-${new Date().getFullYear()}-${nextNum.toString().padStart(4, '0')}`,
                        date: firebase.firestore.FieldValue.serverTimestamp(),
                        clientId: adminTicketUID,
                        clientName: clientData.name,
                        clientCIF: clientData.idNum || 'N/A',
                        billingEntityId: chosenEntityId === 'DEFAULT' ? null : chosenEntityId,
                        subtotal, iva, ivaRate, irpf, irpfRate, total,
                        tickets: selectedTickets.map(t => t.id),
                        ticketsDetail: selectedTickets.map(t => ({ id: t.id, compName: t.compName || "", price: t.calculatedPrice || 0 })),
                        senderData: finalSenderData
                    };

                    const invDoc = await db.collection('invoices').add(invoiceData);
                    const batch = db.batch();
                    selectedTickets.forEach(t => {
                        batch.update(db.collection('tickets').doc(t.docId), { invoiceId: invDoc.id, invoiceNum: invoiceData.invoiceId });
                    });
                    await batch.commit();

                    alert(`Factura ${invoiceData.invoiceId} generada con éxito.`);
                    loadAdminTicketList();
                } catch (e) {
                    alert("Error: " + e.message);
                } finally {
                    hideLoading();
                }
            };

            function renderAdminPackages() {
                const container = document.getElementById('admin-t-packages-list');
                if (!container) return;
                container.innerHTML = adminManPackages.map((p, i) => `
                <div style="display:flex; justify-content:space-between; margin-bottom:5px; background:rgba(255,255,255,0.05); padding:8px; border-radius:6px; border:1px solid var(--border-glass);">
                    <span style="font-weight:600;">${p.qty}x ${p.size}</span>
                    <button type="button" class="btn btn-xs btn-outline" style="border:none; color:#FF4444;" onclick="removeAdminPkg(${i})">🗑️</button>
                </div>
            `).join('');
            }

            window.removeAdminPkg = (i) => {
                adminManPackages.splice(i, 1);
                renderAdminPackages();
            };

            // Escáner USB Panel Admin - Captura Global 
            // Esto permite leer un QR con la pistola desde CUALQUIER lugar de la pestaña sin tener el foco en un input específico.
            let adminScannerBuffer = "";
            let adminScannerStamp = 0;

            document.addEventListener("keydown", function(e) {
                // Solo escuchar si estamos en la vista de Albaranes Manuales creando uno nuevo
                const ticketsView = document.getElementById("view-admin-tickets");
                const createSubView = document.getElementById("sub-view-admin-create");
                if (!ticketsView || ticketsView.style.display === "none" || !createSubView || createSubView.style.display === "none") return;

                // Si está escribiendo en campos grandes como textarea, no interrumpir
                if (e.target.tagName === "TEXTAREA") return;

                const t = Date.now();
                // Aumentamos a 150ms porque el explorador a veces pausa los eventos y parte el JSON por la mitad
                if (t - adminScannerStamp > 150) { 
                    adminScannerBuffer = "";
                }
                adminScannerStamp = t;

                if (e.key === "Enter") {
                    if (adminScannerBuffer.length > 5) { // Un código válido de app/barcode 
                        e.preventDefault();
                        const val = adminScannerBuffer.trim();
                        adminScannerBuffer = "";
                        
                        console.log("Scanner Físico Capturado (Buffer Completo):", val);
                        processAdminScannedCode(val);
                        
                        // Limpiamos el focus de cualquier otro input si captura el QR globalmente
                        if (document.activeElement) document.activeElement.blur();
                    }
                    adminScannerBuffer = "";
                } else if (e.key.length === 1) { // Solo añadir caracteres normales, no "Shift", "Control", etc.
                    adminScannerBuffer += e.key;
                }
            }, true); // Use capture phase to intercept before inputs if needed

            // Mantenemos la compatibilidad con el input específico por si acaso clickan ahí
            const manualIdInputAdmin = document.getElementById('manual-id-admin');
            if (manualIdInputAdmin) {
                manualIdInputAdmin.onkeypress = function (e) {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        const val = this.value.trim(); // No .toUpperCase() para no romper el parsing JSON del QR
                        if (val) {
                            processAdminScannedCode(val);
                        }
                    }
                };
            }

            async function processAdminScannedCode(idContent) {
                 // Limpiar input
                 if(document.getElementById('manual-id-admin')) document.getElementById('manual-id-admin').value = '';

                 let qrData = null;
                 let searchId = idContent;

                 try {
                     // 1. Limpiar el string de la pistola (algunas añaden sufijos o prefijos invisibles)
                     let cleanContent = idContent.trim();
                     console.log("Intentando parsear QR:", cleanContent);
                     
                     // 2. Intentar parsear como JSON si viene del QR extendido
                     if (cleanContent.startsWith('{') || cleanContent.includes('{"id"')) {
                         
                         // Extraer solo la parte JSON si hay basura antes o después
                         const jsonMatch = cleanContent.match(/\{.*\}/);
                         if (jsonMatch) {
                             cleanContent = jsonMatch[0];
                         }

                         qrData = JSON.parse(cleanContent);
                         searchId = qrData.docId || qrData.id || cleanContent;
                     }
                 } catch (e) {
                     console.warn("Error al intentar parsear el JSON. Procesando con fallbacks...", e);
                 }
                 
                 // Fallback 1: Formato GESCO / Custom Pipe-Separated (ej: ID:xx|DEST:xx|ADDR:xx)
                 // Relajamos las condiciones de entrada porque a veces hay espacios ocultos
                 if (!qrData && idContent.toUpperCase().includes("DEST:")) {
                     const manualParse = {};
                     // Dividir por | (y limpiar caracteres invisibles/saltos de linea)
                     const cleanPipeContent = idContent.replace(/[\r\n]+/g, "").trim();
                     const parts = cleanPipeContent.split('|');
                     
                     parts.forEach(p => {
                         const splitIdx = p.indexOf(':');
                         if (splitIdx > -1) {
                             const key = p.substring(0, splitIdx).trim().toUpperCase();
                             const v = p.substring(splitIdx + 1).trim();
                             
                             // Mapeamos a nuestras variables internas Novapack
                             if (key === 'ID') manualParse.id = v;
                             if (key === 'DEST') manualParse.r = v;
                             if (key === 'ADDR') manualParse.a = v;
                             if (key === 'PROV') manualParse.v = v;
                             if (key === 'TEL') manualParse.t = v; // Teléfono
                             if (key === 'COD') manualParse.c = v;
                             if (key === 'BULTOS') manualParse.k = v;
                             if (key === 'OBS') manualParse.n = v;
                             if (key === 'CLI' || key === 'IDNUM') manualParse.senderIdNum = v; // Identidad Remitente
                             if (key === 'FIL' || key === 'EMP') manualParse.billingEntityId = v; // Filial Facturación
                         }
                     });
                     
                     // Si logró recabar el Cliente/Destinatario, damos por bueno este modelo
                     if (manualParse.r) {
                         console.log("Fallback Pipe-Separated tuvo éxito recabando:", manualParse);
                         qrData = manualParse;
                         searchId = qrData.id || idContent;
                     }
                 }

                 // Fallback 2: Si falló todo, probar si es un JSON sucio de Novapack usando Regex
                 if (!qrData) {
                     const manualParse = {};
                     // Hacemos el regex menos estricto para lidiar con lectores que pierden comillas o añaden espacios
                     let pId = idContent.match(/"?id"?:?\s*"?([^",}]+)"?/i); if(pId) manualParse.id = pId[1].trim();
                     let pR = idContent.match(/"?r"?:?\s*"?([^",}]+)"?/i); if(pR) manualParse.r = pR[1].trim();
                     let pA = idContent.match(/"?a"?:?\s*"?([^",}]+)"?/i); if(pA) manualParse.a = pA[1].trim();
                     let pV = idContent.match(/"?v"?:?\s*"?([^",}]+)"?/i); if(pV) manualParse.v = pV[1].trim();
                     let pK = idContent.match(/"?k"?:?\s*"?([^",}]+)"?/i); if(pK) manualParse.k = pK[1].trim();
                     let pC = idContent.match(/"?c"?:?\s*"?([^",}]+)"?/i); if(pC) manualParse.c = pC[1].trim();
                     let pS = idContent.match(/"?s"?:?\s*"?([^",}]+)"?/i); if(pS) manualParse.s = pS[1].trim();
                     let pN = idContent.match(/"?n"?:?\s*"?([^"}]+)"?/i); if(pN) manualParse.n = pN[1].trim(); // notas puede tener comas, cogemos hasta la llave
                     
                     let pFil = idContent.match(/"?(?:f|fil|emp)"?:?\s*"?([^",}]+)"?/i); if(pFil) manualParse.billingEntityId = pFil[1].trim();

                     // Considerar válido si tiene al menos el destinatario (r) o la dirección (a)
                     if (manualParse.r || manualParse.a) {
                         console.log("Fallback Regex tuvo éxito recabando:", manualParse);
                         qrData = manualParse;
                         searchId = qrData.id || idContent;
                     }
                 }

                 if(qrData && qrData.r) {
                    
                    // Si el QR especifica el creador/remitente (CLI:109 / IDNUM:109)
                    if (qrData.senderIdNum) {
                        const sIdText = String(qrData.senderIdNum).replace('#','').trim();
                        const clientSelect = document.getElementById('admin-ticket-client-select');
                        if (clientSelect) {
                            let matchedValue = null;
                            const optionsList = Array.from(clientSelect.options);
                            
                            // Buscar en los values del dropdown que coincidan con la sintaxis del UID o el nombre
                            for (let opt of optionsList) {
                                // El texto del option suele tener el formato "ID - Nombre"
                                if (opt.text.includes(sIdText + " - ") || opt.text.startsWith(sIdText + " ")) {
                                    matchedValue = opt.value;
                                    break;
                                }
                            }
                            
                            // Si no se encuentra por texto del dropdown, buscar en userMap por idNum
                            if (!matchedValue) {
                                for (const uid in userMap) {
                                    if (String(userMap[uid].idNum) === sIdText) {
                                        matchedValue = uid;
                                        break;
                                    }
                                }
                            }

                            if (matchedValue) {
                                clientSelect.value = matchedValue;
                                // Disparar carga de empresas y agenda para ese cliente
                                const event = new Event('change');
                                clientSelect.dispatchEvent(event);
                                console.log("Remitente auto-seleccionado por QR:", matchedValue);
                            } else {
                                console.warn("El QR pedía el remitente", sIdText, "pero no se ha encontrado en la lista.");
                            }
                        }
                    }

                    document.getElementById('admin-t-receiver').value = qrData.r || '';
                    document.getElementById('admin-t-address').value = qrData.a || '';
                    document.getElementById('admin-t-province').value = qrData.v || '';
                    document.getElementById('admin-t-cod').value = qrData.c || 0;
                    document.getElementById('admin-t-shipping').value = qrData.s || 'Pagados';
                    
                    if (document.getElementById('admin-t-notes')) {
                        document.getElementById('admin-t-notes').value = qrData.n || '';
                    }
                    if (qrData.t && document.getElementById('admin-t-phone')) {
                        document.getElementById('admin-t-phone').value = qrData.t;
                    }

                    // Auto-seleccionar Empresa Emisora / Filial si viene forzada en el QR
                    const rawFilial = qrData.billingEntityId || qrData.f || qrData.fil || qrData.emp;
                    if (rawFilial) {
                        const targetFilial = String(rawFilial).trim().toUpperCase();
                        const billSel = document.getElementById('admin-ticket-billing-entity');
                        if (billSel) {
                            let matched = "";
                            const optionsList = Array.from(billSel.options);
                            for (let opt of optionsList) {
                                let optShortId = "";
                                if (window.billingCompaniesMap && window.billingCompaniesMap[opt.value]) {
                                    optShortId = window.billingCompaniesMap[opt.value].shortId || "";
                                }
                                if (opt.value.toUpperCase() === targetFilial || 
                                    opt.text.toUpperCase().includes(targetFilial) || 
                                    targetFilial.includes(opt.value.toUpperCase()) ||
                                    (optShortId && optShortId.toUpperCase() === targetFilial)) {
                                    matched = opt.value; 
                                    break;
                                }
                            }
                            if (matched) {
                                billSel.value = matched;
                                console.log("Empresa emisora seleccionada por QR:", matched);
                            } else {
                                console.warn("El QR exige la filial", targetFilial, "pero no está dada de alta.");
                            }
                        }
                    }

                    // Autocompletar bultos base
                    const numBultos = parseInt(qrData.k) || 1;
                    adminManPackages = [{ qty: numBultos, size: 'Bulto' }];
                    renderAdminPackagesList();

                    // --- ALERTA DE ALBARÁN DUPLICADO / YA CARGADO ---
                    if (qrData.id) {
                        try {
                            if(document.getElementById('admin-t-erp-id')) {
                                document.getElementById('admin-t-erp-id').value = qrData.id;
                            }
                            db.collection('tickets').where('erpId', '==', qrData.id).limit(1).get().then(snap => {
                                if (!snap.empty) {
                                    alert("¡ATENCIÓN!\n\nEste albarán externo (Ref: " + qrData.id + ") YA SE ENCUENTRA REGISTRADO en la base de datos del cliente.\nSi lo guardas, vas a crear un duplicado exacto.");
                                }
                            });
                        } catch (e) {
                            console.warn("Fallo comprobando alertas de duplicación:", e);
                        }
                    }
                 } else {
                     searchId = searchId.toUpperCase();
                     document.getElementById('admin-t-receiver').value = searchId;
                     
                     // MOSTRAR DEBUG VISUAL SI FALLA
                     const debugBox = document.getElementById('admin-scanner-debug');
                     if(debugBox) {
                         debugBox.style.display = 'block';
                         debugBox.innerHTML = "<b>DIAGNOSTICO DE LECTURA RAW:</b><br>" + idContent;
                     }
                     
                     alert('⚠️ Se ha escaneado un código que no se ha podido separar automáticamente en el formulario. Se ha colocado entero en Destinatario. Los datos leídos fueron exactamente: ' + idContent);
                 }
            }

            var el4 = document.getElementById('admin-manual-ticket-form'); if (el4) el4.onsubmit = async (e) => {
                e.preventDefault();
                if (!adminTicketUID || !adminTicketCompID || adminTicketCompID === "ALL") {
                    alert("Por favor, selecciona una Sede/Empresa específica para el remitente.");
                    return;
                }
                if (adminManPackages.length === 0) { alert("Añade al menos un bulto."); return; }

                showLoading();
                try {
                    const uData = userMap[adminTicketUID] || {};
                    const myIdNum = String(uData.idNum || '').trim();
                    if (!myIdNum) throw new Error("El cliente no tiene un número de ID asignado.");

                    const compData = adminCompaniesCache[adminTicketCompID] || {};

                    // Generar ID correlativo buscando el más alto actual para esta empresa
                    const businessId = await getNextId();

                    const street = document.getElementById('admin-t-address').value.trim();
                    const number = document.getElementById('admin-t-number').value.trim();
                    const locality = document.getElementById('admin-t-locality').value.trim();
                    const cp = document.getElementById('admin-t-cp').value.trim();
                    const localityField = document.getElementById('admin-t-locality').value.trim();
                    let manualDriver = document.getElementById('admin-t-driver-phone') ? document.getElementById('admin-t-driver-phone').value.trim() : '';

                    // --- Auto-Routing Logic ---
                    if (!manualDriver && globalRoutes && globalRoutes.length > 0) {
                        for (let r of globalRoutes) {
                            if (r.label === cp || r.label === localityField.toLowerCase()) {
                                manualDriver = r.phone;
                                console.log("Auto-Assigned Route:", manualDriver);
                                break;
                            }
                        }
                    }

                    const addrParts = [];
                    if (street) addrParts.push(street);
                    if (number) addrParts.push("Nº " + number);
                    if (locality) addrParts.push(locality);
                    if (cp) addrParts.push(`(CP ${cp})`);

                    const myIdNumStr = String(uData.idNum || '---').trim();
                    const targetUidRoot = uData.authUid || uData.id || adminTicketUID;

                    const ticketData = {
                        id: businessId,
                        sender: compData.name || 'NOVAPACK',
                        senderAddress: compData.address || '',
                        senderPhone: compData.phone || '',
                        receiver: document.getElementById('admin-t-receiver').value.trim().toUpperCase(),
                        phone: document.getElementById('admin-t-phone').value.trim(),
                        driverPhone: manualDriver ? manualDriver.toString().replace(/\D/g, '').replace(/^34/, '') : '',
                        address: addrParts.join(', '),
                        street: street,
                        number: number,
                        localidad: locality,
                        cp: cp,
                        province: document.getElementById('admin-t-province').value.trim(),
                        timeSlot: document.getElementById('admin-t-timeslot').value,
                        shippingType: document.getElementById('admin-t-shipping').value,
                        cod: parseFloat(document.getElementById('admin-t-cod').value) || 0,
                        packagesList: adminManPackages,
                        uid: targetUidRoot, // Usar el root activo (UID si existe)
                        billingEntityId: document.getElementById('admin-ticket-billing-entity') ? document.getElementById('admin-ticket-billing-entity').value : '',
                        erpId: document.getElementById('admin-t-erp-id') ? document.getElementById('admin-t-erp-id').value.trim() : '',
                        compId: adminTicketCompID,
                        subTariffId: compData.subTariffId || null,
                        clientIdNum: myIdNumStr, // Siempre String
                        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                        adminCreated: true,
                        printed: false
                    };

                    // Pattern: [ID_CLIENTE]_[ID_SEDE]_[ID_ALBARAN]
                    const docId = `${myIdNumStr}_${adminTicketCompID}_${businessId}`;
                    await db.collection('tickets').doc(docId).set(ticketData);

                    resetAdminTicketForm();
                } catch (err) { alert("Error: " + err.message); }
                finally { hideLoading(); }
            };

            function resetAdminTicketForm() {
                const form = document.getElementById('admin-manual-ticket-form');
                if (form) form.reset();
                adminManPackages = [];
                const list = document.getElementById('admin-t-packages-list');
                if (list) list.innerHTML = '';

                // Explicitly clear destination fields to ensure "blank" state
                const fields = ['admin-t-receiver', 'admin-t-phone', 'admin-t-address', 'admin-t-number', 'admin-t-locality',
                    'admin-t-cp', 'admin-t-province', 'admin-t-cod', 'admin-t-notes', 'admin-t-erp-id', 'admin-ticket-billing-entity', 'admin-t-driver-phone'];
                fields.forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.value = '';
                });

                const shipping = document.getElementById('admin-t-shipping');
                if (shipping) shipping.value = 'Pagados';
                const timeslot = document.getElementById('admin-t-timeslot');
                if (timeslot) {
                    const hour = new Date().getHours();
                    timeslot.value = (hour >= 8 && hour < 15) ? 'MAÑANA' : 'TARDE';
                }
            } // Billing Selection Filter logic
            document.getElementById('inv-client-search').oninput = (e) => {
                populateInvoiceClientSelect(e.target.value);
            };

            // Escáner administrativo
            async function startAdminScanner() {
                const container = document.getElementById('admin-qr-reader');
                if (!container) return;

                if (typeof Html5Qrcode === 'undefined') {
                    alert("Error: Biblioteca de escaneo no cargada.");
                    return;
                }

                if (adminHtml5QrCode) {
                    await stopAdminScanner();
                }

                try {
                    adminHtml5QrCode = new Html5Qrcode("admin-qr-reader");
                    const config = { fps: 10, qrbox: { width: 250, height: 250 } };

                    await adminHtml5QrCode.start(
                        { facingMode: "environment" },
                        config,
                        (decodedText) => {
                            console.log("QR Decoded:", decodedText);
                            const cleanId = decodedText.trim(); // No .toUpperCase()
                            if (cleanId) {
                                // Feedback visual simple
                                const reader = document.getElementById('admin-qr-reader');
                                reader.style.borderColor = "#4CAF50";
                                setTimeout(() => reader.style.borderColor = "var(--brand-primary)", 500);

                                if (window.adminScannerMode === 'form') {
                                    stopAdminScanner();
                                    showView('admin-tickets');
                                    processAdminScannedCode(cleanId);
                                } else {
                                    showScannedTicket(cleanId);
                                }
                            }
                        }
                    );
                } catch (err) {
                    console.error("Scanner error:", err);
                    alert("No se pudo iniciar la cámara. Verifica los permisos.");
                }
            }

            async function stopAdminScanner() {
                if (adminHtml5QrCode) {
                    try {
                        await adminHtml5QrCode.stop();
                    } catch (e) {
                        console.warn("Error stopping scanner admin:", e);
                    }
                    adminHtml5QrCode = null;
                }
            }

            async function showScannedTicket(id) {
                // Ensure the master container view is visible before attempting to reveal the child scanner result
                showView('qr-scanner-view');
                window.scrollTo({ top: 0, behavior: 'smooth' });

                let searchId = id;
                let qrData = null;
                try {
                    if (id.trim().startsWith('{')) {
                        qrData = JSON.parse(id);
                        searchId = qrData.docId || qrData.id || id;
                    }
                } catch (e) { console.warn("Not a JSON QR", e); }

                // Pipe-separated QR format: ID:xxx|DEST:xxx|ADDR:xxx|...
                if (!qrData && id.includes('|') && id.toUpperCase().includes('ID:')) {
                    const parts = id.split('|');
                    const parsed = {};
                    parts.forEach(p => {
                        const idx = p.indexOf(':');
                        if (idx > -1) {
                            const key = p.substring(0, idx).trim().toUpperCase();
                            const val = p.substring(idx + 1).trim();
                            if (key === 'ID') parsed.id = val;
                            if (key === 'DEST') parsed.r = val;
                            if (key === 'ADDR') parsed.a = val;
                            if (key === 'PROV') parsed.v = val;
                            if (key === 'TEL') parsed.t = val;
                            if (key === 'COD') parsed.c = val;
                            if (key === 'BULTOS') parsed.k = val;
                            if (key === 'CLI') parsed.senderIdNum = val;
                        }
                    });
                    if (parsed.id || parsed.r) {
                        qrData = parsed;
                        searchId = parsed.id || id;
                        console.log("Pipe-separated QR parsed:", qrData, "searchId:", searchId);
                    }
                }

                // Si es un QR con datos completos, podemos pre-visualizar sin esperar a la nube
                if (qrData) {
                    document.getElementById('scanned-result-area').classList.remove('hidden');
                    document.getElementById('scanned-id').textContent = "ID: " + (qrData.id || searchId);
                    const badge = document.getElementById('scanned-status-badge');
                    badge.textContent = '📦 PROCESANDO...';
                    badge.className = 'status-badge new';

                    document.getElementById('scanned-details').innerHTML = `
        <div style="margin-top:10px; border-top:1px solid #EEE; padding-top:10px;">
            <b>Destinatario:</b> ${qrData.r || '---'}<br>
            <b>Dirección:</b> ${qrData.a || '---'}<br>
            <b>Bultos:</b> ${qrData.k || 1}<br>
            <b>Cod/Reemb:</b> ${qrData.c || 0}€<br>
            <i style="font-size:0.8rem; color:#666;">Cargando datos extendidos de la nube...</i>
        </div>
        `;
                }

                // Inteligencia de búsqueda: Probar por DocID (completo) y luego por BusinessID (corto)
                let doc = await db.collection('tickets').doc(searchId).get();
                let t;
                if (doc.exists) {
                    t = doc.data();
                } else {
                    console.log("No DocID found, searching by Business ID:", searchId);
                    const snap = await db.collection('tickets').where('id', '==', searchId).get();
                    if (snap.empty) {
                        // Fallback: try searching with trimmed/padded variants
                        const trimId = searchId.replace(/^0+/, '');
                        const snap2 = await db.collection('tickets').where('id', '==', trimId).get();
                        if (snap2.empty) {
                            alert("Albarán no encontrado: " + searchId);
                            return;
                        }
                        doc = snap2.docs[0];
                        t = doc.data();
                    } else {
                        doc = snap.docs[0];
                        t = doc.data();
                    }
                }

                document.getElementById('scanned-result-area').classList.remove('hidden');
                document.getElementById('scanned-id').textContent = "ID: " + (t.id || id);
                const isDelivered = t.delivered || t.status === 'Entregado';

                const badge = document.getElementById('scanned-status-badge');
                badge.textContent = isDelivered ? '✅ ENTREGADO' : '⚪ PENDIENTE';
                badge.className = 'status-badge ' + (isDelivered ? 'delivered' : 'new');
                badge.style = ""; // Clear inline styles

                let deletionHtml = '';
                if (t.deleteRequested) {
                    deletionHtml = `
                    <div style="margin-top:15px; background:rgba(255,59,48,0.1); border:1px solid #FF3B30; padding:15px; border-radius:8px;">
                        <h4 style="color:#FF3B30; margin-top:0; margin-bottom:8px;">🚨 SOLICITUD DE BORRADO</h4>
                        <p style="font-size:0.85rem; margin-top:0; margin-bottom:12px;"><b>Motivo:</b> <i>"${t.deleteReason || 'Sin motivo especificado'}"</i></p>
                        <div style="display:flex; gap:10px;">
                            <button class="btn btn-sm btn-outline" style="flex:1; border-color:#FF3B30; color:#FF3B30; font-weight:bold;" onclick="handleTicketDeletionDecision('${doc.id}', true)">🔴 APROBAR</button>
                            <button class="btn btn-sm btn-primary" style="flex:1; background:#147A4B; border:none; font-weight:bold;" onclick="handleTicketDeletionDecision('${doc.id}', false)">🟢 DENEGAR</button>
                        </div>
                    </div>`;
                }

                document.getElementById('scanned-details').innerHTML = `
        <div style="margin-top:10px; border-top:1px solid #EEE; padding-top:10px;">
            <b>Remitente:</b> ${t.sender || '---'}<br>
            <b>Destinatario:</b> ${t.receiver}<br>
            <b>Dirección:</b> ${t.address || t.street || '---'}<br>
            <b>Bultos:</b> ${t.packagesList ? t.packagesList.reduce((s, p) => s + (parseInt(p.qty) || 1), 0) :
                        (t.packages || 1)}<br>
            <b>Estado Cloud:</b> ${isDelivered ? 'Entregado' : 'Pendiente/En Tránsito'}
        </div>
        ${deletionHtml}
        `;

                document.getElementById('btn-mark-scanned').onclick = async () => {
                    if (isDelivered) {
                        alert("Este albarán ya consta como entregado.");
                        return;
                    }
                    showLoading();
                    try {
                        await doc.ref.update({
                            delivered: true,
                            status: 'Entregado',
                            deliveredAt: firebase.firestore.FieldValue.serverTimestamp(),
                            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                        });
                        alert("Albarán " + (t.id || id) + " marcado como ENTREGADO con éxito.");
                        showScannedTicket(id);
                    } catch (err) {
                        alert("Error: " + err.message);
                    } finally {
                        hideLoading();
                    }
                };
            }

            window.handleTicketDeletionDecision = async (id, approve) => {
                if (approve) {
                    if (!confirm("¿Borrar definitivamente este albarán? Esta acción pulverizará el documento en Firebase y no se puede deshacer.")) return;
                    showLoading();
                    try {
                        await db.collection('tickets').doc(id).delete();
                        alert("Albarán fulminado definitivamente.");
                        document.getElementById('scanned-result-area').classList.add('hidden');
                        if (typeof loadAdminTicketList === 'function') loadAdminTicketList('first');
                    } catch (e) { alert("Error: " + e.message); }
                    hideLoading();
                } else {
                    if (!confirm("¿Denegar la solicitud de borrado y restaurar el albarán al cliente?")) return;
                    showLoading();
                    try {
                        await db.collection('tickets').doc(id).update({
                            deleteRequested: firebase.firestore.FieldValue.delete(),
                            deleteReason: firebase.firestore.FieldValue.delete(),
                            status: "Pendiente",
                            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                        });
                        alert("Albarán restaurado.");
                        document.getElementById('scanned-result-area').classList.add('hidden');
                        if (typeof loadAdminTicketList === 'function') loadAdminTicketList('first');
                    } catch (e) { alert("Error: " + e.message); }
                    hideLoading();
                }
            };

            window.openGescoImport = () => {
                if (!adminTicketUID) {
                    alert("⚠️ Error: No has seleccionado ningún CLIENTE.");
                    return;
                }
                if (!adminTicketCompID) {
                    alert("⚠️ Error: No has seleccionado ninguna SEDE/EMPRESA.");
                    return;
                }
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.csv, .txt';
                input.style.display = 'none';
                input.onchange = (e) => handleImportGesco(e);
                document.body.appendChild(input);
                input.click();
            };

            window.openJSONImport = () => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.json';
                input.style.display = 'none';
                input.onchange = (e) => handleImportJSON(e);
                document.body.appendChild(input);
                input.click();
            };

            // UI Initializers for Import Buttons
            const bindImportButtons = () => {
                const btnGesco = document.getElementById('btn-import-gesco');
                const btnGescoAlt = document.getElementById('btn-import-gesco-alt');
                const btnJson = document.getElementById('btn-import-json');
                const btnJsonAlt = document.getElementById('btn-import-json-alt');

                if (btnGesco) btnGesco.onclick = openGescoImport;
                if (btnGescoAlt) btnGescoAlt.onclick = openGescoImport;
                if (btnJson) btnJson.onclick = openJSONImport;
                if (btnJsonAlt) btnJsonAlt.onclick = openJSONImport;
            };
            bindImportButtons();

            async function handleImportGesco(e) {
                const file = e.target.files[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = async (ev) => {
                    try {
                        const content = ev.target.result;
                        const lines = content.split(/\r?\n/);
                        const importedTickets = [];

                        lines.forEach(line => {
                            if (!line.trim()) return;
                            const cols = line.split(';');
                            if (cols.length < 5) return;

                            const uData = userMap[adminTicketUID] || {};
                            const myIdNumStr = String(uData.idNum || '---').trim();
                            const targetUidRoot = uData.authUid || uData.id || adminTicketUID;
                            
                            const cpText = cols[3]?.trim() || '';
                            const locText = cols[4]?.trim() || '';
                            
                            let assignedPhone = '';
                            if (globalRoutes && globalRoutes.length > 0) {
                                for (let r of globalRoutes) {
                                    if (r.label === cpText || r.label === locText.toLowerCase()) {
                                        assignedPhone = r.phone;
                                        break;
                                    }
                                }
                            }

                            const t = {
                                id: cols[0]?.trim(),
                                receiver: cols[1]?.trim(),
                                address: cols[2]?.trim(),
                                cp: cols[3]?.trim(),
                                localidad: cols[4]?.trim(),
                                province: cols[5]?.trim(),
                                phone: cols[6]?.trim(),
                                driverPhone: assignedPhone,
                                packages: parseInt(cols[7]) || 1,
                                weight: parseFloat(cols[8]?.replace(',', '.')) || 0,
                                cod: parseFloat(cols[9]?.replace(',', '.')) || 0,
                                notes: cols[10]?.trim() || '',
                                timeSlot: 'MAÑANA',
                                shippingType: 'Pagados',
                                uid: targetUidRoot,
                                compId: adminTicketCompID,
                                clientIdNum: myIdNumStr,
                                createdAt: new Date(),
                                updatedAt: new Date(),
                                printed: false,
                                adminCreated: true
                            };

                            if (t.id && t.id.toLowerCase() !== 'referencia' && t.id.toLowerCase() !== 'id') {
                                importedTickets.push(t);
                            }
                        });

                        if (importedTickets.length === 0) {
                            alert("⚠️ No se encontraron registros válidos en el archivo.");
                            return;
                        }

                        const targetUserName = userMap[adminTicketUID]?.name || adminTicketUID;
                        const msg = `⚠️ ESTÁS IMPORTANDO PARA: "${targetUserName}"\n\n` +
                            `- Registros detectados: ${importedTickets.length}\n` +
                            `- Formato esperado: Referencia;Destinatario;Direccion;CP;Localidad;Provincia;Telefono;Bultos;Peso;Reembolso;Observaciones\n\n` +
                            `¿Confirmas la importación masiva?`;

                        if (!confirm(msg)) return;

                        showLoading();
                        const ticketsCol = db.collection('tickets');
                        for (let i = 0; i < importedTickets.length; i += 50) {
                            const chunk = importedTickets.slice(i, i + 50);
                            const batch = db.batch();
                            const uData = userMap[adminTicketUID] || {};
                            const myIdNumStr = String(uData.idNum || '---').trim();
                            chunk.forEach(t => {
                                const docId = `${myIdNumStr}_${adminTicketCompID}_${t.id}`;
                                batch.set(ticketsCol.doc(docId), t, { merge: true });
                            });
                            await batch.commit();
                        }

                        hideLoading();
                        alert("✅ Importación de Gesco completada.");
                        showView('admin-tickets');
                        loadAdminTicketList();
                    } catch (err) {
                        hideLoading();
                        console.error("Gesco process error:", err);
                        alert("Error procesando Gesco: " + err.message);
                    }
                };
                reader.readAsText(file, 'ISO-8859-1');
            }

            async function handleImportJSON(e) {
                const file = e.target.files[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = async (ev) => {
                    try {
                        const raw = JSON.parse(ev.target.result);
                        let ticketsToImport = [];

                        if (Array.isArray(raw)) {
                            ticketsToImport = raw;
                        } else if (raw.collections && raw.collections.tickets) {
                            ticketsToImport = raw.collections.tickets;
                        } else if (raw.tickets) {
                            ticketsToImport = raw.tickets;
                        }

                        if (ticketsToImport.length === 0) {
                            alert("No se encontraron albaranes en el JSON de backup.");
                            return;
                        }

                        if (!confirm(`¿RESTAURACIÓN CRÍTICA: Desea sobreescribir ${ticketsToImport.length} albaranes desde el backup JSON?\n\nFecha del backup: ${raw.backup_info ? raw.backup_info.timestamp : 'Desconocida'}`)) return;

                        showLoading();
                        const ticketsCol = db.collection('tickets');
                        
                        // Execute batching perfectly
                        for (let i = 0; i < ticketsToImport.length; i += 50) {
                            const chunk = ticketsToImport.slice(i, i + 50);
                            const batch = db.batch();
                            
                            chunk.forEach(t => {
                                if (!t.id || !t.uid || !t.compId) return;
                                const docId = `${t.uid}_${t.compId}_${t.id}`;
                                
                                // Ensure clientIdNum exists for global synchronization searches
                                if (!t.clientIdNum && userMap[t.uid]) t.clientIdNum = userMap[t.uid].idNum;
                                
                                // Convert timestamp strings back to Firebase native dates gracefully
                                if (t.createdAt && typeof t.createdAt === 'string') t.createdAt = new Date(t.createdAt);
                                if (t.updatedAt && typeof t.updatedAt === 'string') t.updatedAt = new Date(t.updatedAt);
                                
                                batch.set(ticketsCol.doc(docId), t, { merge: true });
                            });
                            
                            await batch.commit();
                        }
                        
                        hideLoading();
                        alert("✅ Restauración de BD completada con éxito. Por favor compruebe la integridad y refresque el navegador.");
                        location.reload();
                    } catch (err) {
                        hideLoading();
                        alert("Error procesando JSON: " + err.message);
                    }
                };
                reader.readAsText(file);
            }

            // --- AUTH & SECURITY (Moved to end to avoid TDZ) ---
            auth.onAuthStateChanged(async (user) => {
                if (!user) {
                    window.location.href = 'index.html';
                    return;
                }
                try {
                    const adminDoc = await db.collection('config').doc('admin').get();
                    if (!adminDoc.exists || adminDoc.data().uid !== user.uid) {
                        window.location.href = 'app.html';
                    } else {
                        Promise.all([
                            loadConfigInfo(),
                            loadUsers('first'),
                            fetchAllUsersMap(),
                            initDeletionAlertsListener()
                        ]).then(() => hideLoading());
                    }
                } catch (e) {
                    console.error("Admin verification failed:", e);
                    window.location.href = 'app.html';
                }
            });

            // Mobile Menu Toggle Logic
            document.querySelectorAll('.menu-item').forEach(item => {
                item.addEventListener('click', (e) => {
                    if (window.innerWidth <= 992) {
                        const isDropdownItem = e.target.closest('.dropdown-item');
                        if (isDropdownItem) {
                            item.classList.remove('mobile-active-item');
                        } else {
                            const wasActive = item.classList.contains('mobile-active-item');
                            document.querySelectorAll('.menu-item').forEach(mi => mi.classList.remove('mobile-active-item'));
                            if (!wasActive) item.classList.add('mobile-active-item');
                        }
                    }
                });
            });

            document.addEventListener('click', (e) => {
                if (!e.target.closest('.menu-item') && window.innerWidth <= 992) {
                    document.querySelectorAll('.menu-item').forEach(mi => mi.classList.remove('mobile-active-item'));
                }
            });

            // Logout logic is now handled by inline onclick for maximum reliability

            // --- ADMINISTRATION GLOBAL LISTENERS ---
            let pendingDeletionsUnsub = null;
            function initDeletionAlertsListener() {
                if (pendingDeletionsUnsub) pendingDeletionsUnsub();
                pendingDeletionsUnsub = db.collection('tickets').where('deleteRequested', '==', true).onSnapshot(snap => {
                    const count = snap.docs.length;
                    const alertBtn = document.getElementById('nav-item-alerts');
                    const countText = document.getElementById('alert-count-text');
                    if (alertBtn && countText) {
                        if (count > 0) {
                            countText.textContent = `${count} SOLICITUD${count > 1 ? 'ES' : ''}`;
                            alertBtn.style.display = 'flex';
                            
                            // Si estamos en la vista de anulaciones, refrescamos la tabla silenciosamente
                            const viewPD = document.getElementById('view-pending-deletes');
                            if (viewPD && viewPD.style.display === 'block') {
                                loadPendingDeletions();
                            }
                        } else {
                            alertBtn.style.display = 'none';
                            
                            // Si estamos en la vista de anulaciones y se vació, volvemos a mostrarla para que enseñe "No hay anulaciones"
                            const viewPD = document.getElementById('view-pending-deletes');
                            if (viewPD && viewPD.style.display === 'block') {
                                loadPendingDeletions();
                            }
                        }
                    }
                }, err => {
                    console.error("Error validando anulaciones globales:", err);
                });
            }

            async function loadPendingDeletions() {
                const tbody = document.getElementById('pending-deletions-body');
                tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">Buscando solicitudes...</td></tr>';
                
                try {
                    const snap = await db.collection('tickets').where('deleteRequested', '==', true).get();
                    if (snap.empty) {
                        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:30px; color:var(--text-dim);">No hay ninguna solicitud de anulación pendiente.</td></tr>';
                        return;
                    }
                    
                    let html = '';
                    snap.forEach(doc => {
                        const t = doc.data();
                        const idStr = t.id || t.docId || doc.id;
                        let dStr = 'Sin Fecha';
                        if (t.createdAt) {
                            const dateObj = typeof t.createdAt.toDate === 'function' ? t.createdAt.toDate() : new Date(t.createdAt);
                            dStr = dateObj.toLocaleDateString() + " " + dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                        }
                        
                        // Extract Name
                        let senderName = "Desconocido";
                        if (userMap[t.uid]) {
                            senderName = userMap[t.uid].name || userMap[t.uid].email || t.uid;
                        } else if (t.clientIdNum) {
                            // Try finding by idNum
                            const u = Object.values(userMap).find(u => u.idNum == t.clientIdNum);
                            if (u) senderName = u.name || t.clientIdNum;
                        }
                        
                        // Motif
                        let motivo = escapeHtml(t.deleteReason || 'Ninguno proporcionado');
                        if (motivo.length > 50) motivo = motivo.substring(0, 50) + "...";

                        html += `
                            <tr style="background: rgba(255, 59, 48, 0.05); border-left: 4px solid #FF3B30;">
                                <td style="font-weight:bold; color:var(--brand-primary);">${idStr}</td>
                                <td style="font-size:0.8rem;">${dStr}</td>
                                <td style="font-weight:bold; font-size:0.85rem;">${senderName}</td>
                                <td style="color:#FF3B30; font-size:0.8rem; font-style:italic;">"${motivo}"</td>
                                <td><span class="status-badge" style="background:#FF3B30; color:white;">PEND. ANULAR</span></td>
                                <td>
                                    <button class="btn btn-sm btn-outline" style="border-color:var(--brand-primary); color:var(--brand-primary);" onclick="openTicketPreviewModal('${doc.id}')" title="Inspeccionar">🔍 VER ALBARÁN</button>
                                </td>
                            </tr>
                        `;
                    });
                    tbody.innerHTML = html;
                    
                } catch(e) {
                    console.error("Error loading pending deletions:", e);
                    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#FF3B30; padding:20px;">Error al cargar datos.</td></tr>';
                }
            }

            window.openTicketPreviewModal = async (docId) => {
                const modal = document.getElementById('modal-ticket-preview');
                const content = document.getElementById('preview-ticket-content');
                const actions = document.getElementById('preview-ticket-actions');
                
                content.innerHTML = '<div style="text-align:center; color:#aaa; padding:20px;">Cargando detalles del albarán...</div>';
                actions.innerHTML = '';
                modal.style.display = 'flex';

                try {
                    const doc = await db.collection('tickets').doc(docId).get();
                    if (!doc.exists) {
                        content.innerHTML = '<div style="color:#FF3B30; padding:20px;">Albarán no encontrado o ya eliminado.</div>';
                        return;
                    }
                    
                    const t = doc.data();
                    let dStr = 'Sin Fecha';
                    if (t.createdAt) {
                        const dateObj = typeof t.createdAt.toDate === 'function' ? t.createdAt.toDate() : new Date(t.createdAt);
                        dStr = dateObj.toLocaleDateString() + " " + dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                    }

                    // Sender Name
                    let senderName = "Desconocido";
                    if (userMap[t.uid]) {
                        senderName = userMap[t.uid].name || userMap[t.uid].email || t.uid;
                    } else if (t.clientIdNum) {
                        const u = Object.values(userMap).find(u => u.idNum == t.clientIdNum);
                        if (u) senderName = u.name;
                    }

                    const bultos = t.packagesList ? t.packagesList.reduce((s, p) => s + (parseInt(p.qty) || 1), 0) : (t.packages || 1);
                    const peso = t.packagesList ? t.packagesList.reduce((s, p) => s + (parseFloat(p.weight) || 0), 0) : (t.weight || 0);

                    content.innerHTML = `
                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px; margin-bottom:15px;">
                            <div style="background:rgba(255,255,255,0.05); padding:12px; border-radius:8px;">
                                <div style="color:var(--text-dim); font-size:0.75rem; text-transform:uppercase;">ID de Albarán</div>
                                <div style="font-weight:900; color:var(--brand-primary); font-size:1.1rem;">${t.id || docId}</div>
                            </div>
                            <div style="background:rgba(255,255,255,0.05); padding:12px; border-radius:8px;">
                                <div style="color:var(--text-dim); font-size:0.75rem; text-transform:uppercase;">Fecha Creación</div>
                                <div style="font-weight:900;">${dStr}</div>
                            </div>
                        </div>
                        
                        <div style="margin-bottom:15px;">
                            <strong style="color:var(--brand-primary);">REMITENTE:</strong> <br>
                            ${t.sender || senderName} - ${t.senderAddress || ''}<br>
                            ${t.senderPhone ? 'Telf: ' + t.senderPhone : ''}
                        </div>
                        
                        <div style="background:rgba(0,0,0,0.3); padding:15px; border-radius:8px; border:1px solid rgba(255,255,255,0.1); margin-bottom:15px;">
                            <strong style="color:var(--brand-primary);">DESTINATARIO:</strong> <br>
                            <span style="font-size:1.1rem; font-weight:bold;">${t.receiver}</span><br>
                            ${t.address || t.street || ''} ${t.number || ''}<br>
                            ${t.localidad || ''} ${t.cp || ''} - <strong>${t.province || ''}</strong><br>
                            ${t.phone ? '☎️ ' + t.phone : ''}
                        </div>
                        
                        <div style="display:flex; justify-content:space-between; padding:10px 0; border-bottom:1px solid rgba(255,255,255,0.1);">
                            <div><strong>📦 Bultos:</strong> ${bultos}</div>
                            <div><strong>⚖️ Peso:</strong> ${parseFloat(peso).toFixed(2)} Kg</div>
                            <div style="color:${t.cod > 0 ? '#FF3B30' : 'white'}; font-weight:${t.cod > 0 ? 'bold' : 'normal'};"><strong>💰 Reemb:</strong> ${t.cod || 0} €</div>
                        </div>
                        
                        <div style="margin-top:15px; padding:15px; background:rgba(255,59,48,0.1); border-left:4px solid #FF3B30; border-radius:4px;">
                            <strong style="color:#FF3B30;">🚨 MOTIVO DE ANULACIÓN DEL CLIENTE:</strong><br>
                            <i style="color:#ddd;">"${escapeHtml(t.deleteReason || 'Ninguno especificado')}"</i>
                        </div>
                    `;

                    // Poner los botones de aprobar/rechazar
                    actions.innerHTML = `
                        <button class="btn" style="flex:1; padding:12px; background:rgba(255,59,48,0.1); border:1px solid #FF3B30; color:#FF3B30; font-weight:900;" onclick="handleTicketDeletionDecision('${docId}', true); document.getElementById('modal-ticket-preview').style.display='none';">🗑️ APROBAR BORRADO</button>
                        <button class="btn" style="flex:1; padding:12px; background:rgba(255,255,255,0.1); border:1px solid white; color:white; font-weight:900;" onclick="handleTicketDeletionDecision('${docId}', false); document.getElementById('modal-ticket-preview').style.display='none';">❌ DENEGAR</button>
                    `;

                } catch(e) {
                    console.error("Preview error:", e);
                    content.innerHTML = '<div style="color:#FF3B30; padding:20px;">Ocurrió un error cargando el albarán.</div>';
                }
            };
            
            // Helper
            function escapeHtml(unsafe) {
                if (!unsafe) return "";
                return unsafe
                     .replace(/&/g, "&amp;")
                     .replace(/</g, "&lt;")
                     .replace(/>/g, "&gt;")
                     .replace(/"/g, "&quot;")
                     .replace(/'/g, "&#039;");
            }

            // adminManPackages already declared at top

            // Add Package Handler for Admin Manual Ticket
            const btnAdminAddPkg = document.getElementById('btn-admin-add-pkg');
            if (btnAdminAddPkg) {
                btnAdminAddPkg.onclick = () => {
                    const qtyInput = document.getElementById('admin-t-pkg-qty');
                    const sizeInput = document.getElementById('admin-t-pkg-size');
                    const qty = parseInt(qtyInput.value) || 1;
                    const size = sizeInput.value.trim().toUpperCase();
                    if (!size) { alert("⚠️ Indica el artículo/tamaño del bulto."); return; }
                    adminManPackages.push({ qty, size });
                    renderAdminPackagesList();
                    qtyInput.value = 1;
                    sizeInput.value = '';
                };
            }

            function renderAdminPackagesList() {
                const list = document.getElementById('admin-t-packages-list');
                if (!list) return;
                list.innerHTML = '';
                adminManPackages.forEach((p, i) => {
                    const div = document.createElement('div');
                    div.style = "display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.03); padding:8px 12px; border-radius:6px; border:1px solid var(--border-glass); margin-bottom:5px;";
                    div.innerHTML = `
                    <span style="font-size:0.85rem; font-weight:600; color:white;">${p.qty}x ${p.size}</span>
                    <button type="button" class="btn btn-sm btn-outline" style="border:none; color:#FF4444; padding:2px 5px;" onclick="removeAdminManPkg(${i})">🗑️</button>
                `;
                    list.appendChild(div);
                });
            }
            window.removeAdminManPkg = (i) => {
                adminManPackages.splice(i, 1);
                renderAdminPackagesList();
            };


            // Duplicate reset function removed to avoid conflict

            // Helper to get next Ticket ID for Admin
            async function getNextId() {
                const comp = adminCompaniesCache[adminTicketCompID] || {};
                const prefix = comp.prefix || "NP";
                const startNum = parseInt(comp.startNum) || 1001;

                const uData = userMap[adminTicketUID] || {};
                const myIdNum = String(uData.idNum || '').trim();
                if (!myIdNum) return prefix + startNum.toString().padStart(5, '0');

                // Variantes de ID para búsqueda exhaustiva
                let idVariants = [myIdNum];
                const n = parseInt(myIdNum);
                if (!isNaN(n)) {
                    idVariants.push(n, n.toString());
                    idVariants.push(n.toString().padStart(2, '0'));
                    idVariants.push(n.toString().padStart(3, '0'));
                    idVariants.push(n.toString().padStart(4, '0'));
                }
                const finalVariants = [...new Set(idVariants.filter(v => v !== null && v !== undefined && v !== ""))];

                const snap = await db.collection('tickets')
                    .where('clientIdNum', 'in', finalVariants)
                    .get();

                let maxNum = startNum - 1;
                snap.forEach(doc => {
                    const d = doc.data();
                    const tcid = d.compId || 'comp_main';
                    // Solo considerar si coincide la empresa o si es la principal/default
                    if (adminTicketCompID === "ALL" || tcid === adminTicketCompID || tcid === 'comp_main' || tcid === 'default') {
                        const bid = d.id || "";
                        if (bid.startsWith(prefix)) {
                            const num = parseInt(bid.substring(prefix.length).replace(/[^0-9]/g, ""));
                            if (!isNaN(num) && num > maxNum) maxNum = num;
                        }
                    }
                });

                const nextNum = maxNum + 1;
                return prefix + nextNum.toString().padStart(5, '0');
            }

            window.getNextUserId = () => {
                let max = 100;
                Object.values(userMap).forEach(u => {
                    const val = parseInt(u.idNum);
                    if (!isNaN(val) && val > max) max = val;
                });
                return max + 1;
            };

            window.reindexUserIds = async () => {
                const p1 = confirm("⚠️ ATENCIÓN: Esta acción reasignará números de ID correlativos (101, 102...) a todos los clientes y actualizará sus albaranes.\n\n¿Deseas continuar?");
                if (!p1) return;

                showLoading();
                try {
                    const uSnap = await db.collection('users').get();
                    let users = [];
                    uSnap.forEach(doc => {
                        const d = doc.data();
                        if (d.role !== 'admin') users.push({ id: doc.id, ...d });
                    });
                    users.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

                    let start = 101;
                    for (let i = 0; i < users.length; i++) {
                        const u = users[i];
                        const newIdNum = start + i;
                        const oldIdNum = u.idNum;

                        // Update User
                        await db.collection('users').doc(u.id).update({ idNum: newIdNum });

                        // Update associated tickets
                        if (oldIdNum) {
                            // Buscar variantes: "5", "05", "005", etc.
                            let vars = [String(oldIdNum)];
                            const on = parseInt(oldIdNum);
                            if (!isNaN(on)) {
                                vars.push(on, on.toString(), on.toString().padStart(2, '0'), on.toString().padStart(3, '0'), on.toString().padStart(4, '0'));
                            }
                            const finalVars = [...new Set(vars.filter(v => v))];

                            // Firestore "in" query para capturar todas las variantes legacy
                            const tSnap = await db.collection('tickets').where('clientIdNum', 'in', finalVars).get();

                            let batch = db.batch();
                            let count = 0;
                            for (const tDoc of tSnap.docs) {
                                batch.update(tDoc.ref, { clientIdNum: String(newIdNum) });
                                count++;
                                if (count >= 400) {
                                    await batch.commit();
                                    batch = db.batch();
                                    count = 0;
                                }
                            }
                            await batch.commit();
                        }
                    }
                    alert("✅ Clientes re-indexados con éxito.");
                    loadUsers();
                } catch (e) {
                    console.error("Reindex error:", e);
                    alert("Error en re-index: " + e.message);
                } finally {
                    hideLoading();
                }
            };

            // [MAINTENANCE] Auto-cleaner for anomalous alphanumeric company names
            setTimeout(async () => {
                try {
                    console.log("[Maintenance] Scanning for corrupted company entries...");
                    const snap = await db.collectionGroup('companies').get();
                    let deletedCount = 0;
                    snap.forEach(doc => {
                        const data = doc.data();
                        const name = data.name || "";
                        if (!name || name === doc.id || (name.length >= 20 && !name.includes(" "))) {
                            console.warn("[Maintenance] FOUND ANOMALOUS COMPANY. Deleting:", doc.ref.path, data);
                            db.doc(doc.ref.path).delete();
                            deletedCount++;
                        }
                    });
                    if (deletedCount > 0) console.log(`[Maintenance] Successfully deleted ${deletedCount} corrupted company entries.`);
                } catch(e) {
                    console.error("[Maintenance] Error in cleaner:", e);
                }
            }, 3000);

            // --- [MULTI-FILIAL CONFIGURATION CONTROLLERS] ---
            let billingCompaniesMap = {};

            
            document.getElementById('billing-comp-iban').addEventListener('input', (e) => {
                let val = e.target.value.toUpperCase().replace(/[^\dA-Z\-_]/g, '');
                e.target.value = val.match(/.{1,4}/g)?.join(' ') || '';
                if(window.getBankName) document.getElementById('billing-comp-bank-name').textContent = window.getBankName(val);
            });
            async function loadBillingCompanies() {
                const tbody = document.getElementById('billing-companies-table-body');
                const adminTicketBillingSelect = document.getElementById('admin-ticket-billing-entity');
                const filterBillingSel = document.getElementById('filter-admin-billing-entity');

                if (!tbody) return;
                try {
                    const snap = await db.collection('billing_companies').get();
                    billingCompaniesMap = {};
                    tbody.innerHTML = '';
                    
                    const clientBillingSelect = document.getElementById('new-user-billing-company');
                    if (clientBillingSelect) {
                        clientBillingSelect.innerHTML = '<option value="">-- Por Defecto (Central) --</option>';
                    }
                    if (adminTicketBillingSelect) {
                        adminTicketBillingSelect.innerHTML = '<option value="">-- Por Defecto (Central) --</option>';
                    }
                    if (filterBillingSel) {
                        filterBillingSel.innerHTML = '<option value="ALL">-- Todas las Emisoras --</option><option value="DEFAULT">Central (Por Defecto)</option>';
                    }

                    if (snap.empty) {
                        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:15px; color:var(--text-dim);">No hay empresas facturadoras creadas. Pulsa "Nueva Filial".</td></tr>';
                        return;
                    }
                    snap.forEach(doc => {
                        const data = doc.data();
                        billingCompaniesMap[doc.id] = data;
                        tbody.innerHTML += `
                        <tr>
                            <td style="font-weight:600; color:var(--brand-primary);">${data.name}</td>
                            <td>${data.nif}</td>
                            <td style="font-size:0.8rem; color:var(--text-dim);">${data.address}</td>
                            <td>
                                <div style="display:flex; gap:5px;">
                                    <button class="btn btn-sm btn-outline" style="border-color:var(--brand-primary); color:white; padding:5px 10px;" onclick="openAddBillingCompanyModal('${doc.id}')">✏️ Editar</button>
                                    <button class="btn btn-sm btn-outline" style="border-color:#ff4444; color:#ff4444; padding:5px 10px;" onclick="deleteBillingCompany('${doc.id}')">🗑️ Eliminar</button>
                                </div>
                            </td>
                        </tr>`;

                        if (clientBillingSelect) {
                            clientBillingSelect.innerHTML += `<option value="${doc.id}">${data.name}</option>`;
                        }
                        if (adminTicketBillingSelect) {
                            adminTicketBillingSelect.innerHTML += `<option value="${doc.id}">${data.name}</option>`;
                        }
                        if (filterBillingSel) {
                            filterBillingSel.innerHTML += `<option value="${doc.id}">${data.name}</option>`;
                        }
                    });
                } catch(e) {
                    console.error("Error loading billing companies:", e);
                }
            }

            
            async function openAddBillingCompanyModal(id = null) {
                const modal = document.getElementById('modal-billing-company');
                const title = document.getElementById('billing-comp-title');
                
                document.getElementById('billing-comp-id').value = id || '';
                
                if (id && billingCompaniesMap[id]) {
                    title.textContent = '✏️ Editar Filial Central';
                    const data = billingCompaniesMap[id];
                    document.getElementById('billing-comp-name').value = data.name || '';
                    document.getElementById('billing-comp-nif').value = data.nif || '';
                    document.getElementById('billing-comp-address').value = data.address || '';
                    document.getElementById('billing-comp-phone').value = data.phone || '';
                    document.getElementById('billing-comp-shortid').value = data.shortId || '';
                    document.getElementById('billing-comp-iban').value = data.iban || '';
                    
                    if(data.iban && window.getBankName) {
                        document.getElementById('billing-comp-bank-name').textContent = window.getBankName(data.iban);
                    } else {
                        document.getElementById('billing-comp-bank-name').textContent = '';
                    }
                } else {
                    title.textContent = '🏢 Añadir Filial Central';
                    document.getElementById('billing-comp-name').value = '';
                    document.getElementById('billing-comp-nif').value = '';
                    document.getElementById('billing-comp-address').value = '';
                    document.getElementById('billing-comp-phone').value = '';
                    document.getElementById('billing-comp-shortid').value = '';
                    document.getElementById('billing-comp-iban').value = '';
                    document.getElementById('billing-comp-bank-name').textContent = '';
                }
                
                modal.style.display = 'flex';
                window.scrollTo(0, 0);
                modal.scrollTop = 0;
            }

            async function saveBillingCompany() {
                const id = document.getElementById('billing-comp-id').value;
                const name = document.getElementById('billing-comp-name').value.trim().toUpperCase();
                const nif = document.getElementById('billing-comp-nif').value.trim().toUpperCase();
                const address = document.getElementById('billing-comp-address').value.trim();
                const phone = document.getElementById('billing-comp-phone').value.trim();
                const shortId = document.getElementById('billing-comp-shortid').value.trim().toUpperCase();
                const iban = document.getElementById('billing-comp-iban').value.trim().toUpperCase();
                
                if (!name || !nif || !address) {
                    alert("Por favor, rellena los campos obligatorios: Nombre, NIF y Dirección.");
                    return;
                }
                
                showLoading();
                try {
                    const data = {
                        name, nif, address, phone, shortId, iban,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    };
                    
                    if (id) {
                        await db.collection('billing_companies').doc(id).update(data);
                        alert("✅ Filial modificada con éxito.");
                    } else {
                        data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                        await db.collection('billing_companies').add(data);
                        alert("✅ Filial creada con éxito.");
                    }
                    
                    document.getElementById('modal-billing-company').style.display='none';
                    await loadBillingCompanies();
                } catch(e) {
                    alert("Error guardando filial: " + e.message);
                } finally {
                    hideLoading();
                }
            }

            async function deleteBillingCompany(id) {
                if(!confirm("⚠️ ¿Estás seguro de que quieres ELIMINAR esta Empresa Emisora/Filial de la base de datos?\nLos albaranes creados anteriormente usando esta filial mantendrán el nombre impreso, pero ya no podrás elegirla para futuros PDF.")) return;
                try {
                    showLoading();
                    await db.collection('billing_companies').doc(id).delete();
                    await loadBillingCompanies();
                } catch(e) {
                    alert("Error borrando: " + e.message);
                } finally {
                    hideLoading();
                }
            }

            // Hook it into admin init
            setTimeout(() => { if(window.db) loadBillingCompanies(); }, 1500);

            // --- [GESCO CLIENT BATCH EXCEL IMPORTER] ---
            async function initiateGescoClientImport() {
                const fileInput = document.getElementById('input-gesco-clients');
                const logBox = document.getElementById('gesco-client-import-log');
                if (!fileInput || !fileInput.files.length) {
                    alert("⚠️ Selecciona primero un archivo CSV o Excel extraído de GESCO desde el botón 'Examinar'.");
                    return;
                }
                if (typeof XLSX === 'undefined') {
                    alert("Error: Librería de importación XLSX no cargada en el panel. Refresca la ventana (F5).");
                    return;
                }

                if (!confirm("⚠️ ATENCIÓN: ¿Estás seguro de iniciar la importación masiva de CLIENTES?\nEsto procesará el archivo y creará todas las cuentas en la Base de Datos automáticamente, bloqueando sus IDs de GESCO nativos.")) return;

                logBox.style.display = 'block';
                logBox.innerHTML = "Iniciando lectura biométrica del archivo GESCO...<br>";

                showLoading();
                try {
                    const file = fileInput.files[0];
                    const data = await file.arrayBuffer();
                    const workbook = XLSX.read(data);
                    const jsonA = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: "" });

                    if (jsonA.length === 0) throw new Error("El archivo excel parece estar vacío o carecer de formato tabular.");

                    logBox.innerHTML += `Encontradas ${jsonA.length} filas analíticas. Procesando...<br>`;

                    let successCount = 0;
                    let errorCount = 0;

                    for (let i = 0; i < jsonA.length; i++) {
                        const row = jsonA[i];
                        // Smart Key Resolver for dynamic GESCO columns
                        const getCol = (possibleNames) => {
                            const key = Object.keys(row).find(k => possibleNames.some(p => k.toLowerCase().includes(p.toLowerCase())));
                            return key ? row[key] : null;
                        };

                        let idNum = getCol(['codigo', 'código', 'id', 'ref']);
                        const name = getCol(['nombre', 'cliente', 'razon', 'razón']);
                        const email = getCol(['email', 'correo', 'e-mail']);
                        const phone = getCol(['telefono', 'teléfono', 'tel']);
                        const address = getCol(['direccion', 'dirección', 'domicilio']);
                        const dni = getCol(['nif', 'cif', 'dni']);
                        const tariff = getCol(['tarifa', 'precio']);
                        
                        if (!name) { errorCount++; continue; }

                        if (!idNum) idNum = `TMP${Math.floor(Math.random() * 90000) + 10000}`; // Fake ID fallback
                        idNum = String(idNum).trim();
                        const safeName = String(name).trim().toUpperCase();

                        const fallbackEmail = email ? String(email).trim().toLowerCase() : `imp_gesco_${idNum}_${Date.now()}@novapack.es`;
                        const fallbackPass = idNum + "novapack";

                        try {
                            // Buscar colisiones para hacer Update puro en vez de duplicar
                            const existQ = await db.collection('users').where('idNum', '==', idNum).limit(1).get();
                            
                            let targetDocRef = null;
                            if (!existQ.empty) {
                                targetDocRef = existQ.docs[0].ref;
                            } else {
                                targetDocRef = db.collection('users').doc();
                            }

                            // Inject Core Identifiers (Bridged logic)
                            await targetDocRef.set({
                                idNum: idNum,
                                name: safeName,
                                email: fallbackEmail,
                                address: address || '',
                                phone: phone || '',
                                nif: dni || '',
                                role: 'CLIENT',
                                gescoImported: true,
                                importedAt: firebase.firestore.FieldValue.serverTimestamp(),
                                passwordOffline: fallbackPass
                            }, { merge: true });

                            // Guarantee primary company presence for immediate invoice readiness
                            const compRef = targetDocRef.collection('companies').doc('comp_main');
                            await compRef.set({
                                name: safeName,
                                address: address || '',
                                phone: phone || '',
                                nif: dni || ''
                            }, { merge: true });

                            // Optional Tariff binding
                            if (tariff) {
                                await targetDocRef.set({ internalTariffCode: String(tariff).trim() }, {merge: true});
                            }

                            successCount++;
                            if (i % 15 === 0) logBox.innerHTML += `Progreso: Inyectando ${i}/${jsonA.length}...<br>`;

                        } catch (innerErr) {
                            console.error("Fallo inyección fila", i, innerErr);
                            errorCount++;
                        }
                    }
                    
                    logBox.innerHTML += `<br><span style="color:#4CAF50; font-weight:bold;">✅ IMPORTACIÓN FINALIZADA.</span><br>Éxitos: ${successCount} | Errores / Descartados: ${errorCount}`;
                    alert(`Integración GESCO completada.\n\nClientes insertados/actualizados: ${successCount}\nRegistros omitidos: ${errorCount}`);
                    if(typeof loadUsers === 'function') loadUsers();

                } catch (e) {
                    logBox.innerHTML += `<span style="color:#ff4444; font-weight:bold;">Error fatal: ${e.message}</span>`;
                    alert("Error crítico interrumpiendo la importación: " + e.message);
                } finally {
                    hideLoading();
                }
            }
            // --- MIXED BACKGROUND SYNCHRONIZATION (ADMIN) ---
            setInterval(() => {
                if (auth && auth.currentUser) {
                    // Update user listing if visible
                    const viewUsers = document.getElementById('view-users');
                    if (viewUsers && viewUsers.style.display !== 'none' && typeof loadUsers === 'function') {
                        loadUsers();
                    }
                    // Update admin manual tickets if visible
                    const viewAdminTickets = document.getElementById('view-admin-tickets');
                    if (viewAdminTickets && viewAdminTickets.style.display !== 'none' && typeof loadAdminTicketList === 'function') {
                        loadAdminTicketList('refresh_state');
                    }
                }
            }, 180000); // 3 minutes heartbeat
        