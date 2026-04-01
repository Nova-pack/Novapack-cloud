
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
                    auth.signOut().then(() => {
                        window.location.href = 'index.html';
                    }).catch(e => {
                        console.error("Logout Error:", e);
                        window.location.href = 'index.html'; // Force redirect
                    });
                }
            };

            // Safety timeout for loading overlay (max 8s)
            setTimeout(() => { if (typeof hideLoading === 'function') hideLoading(); }, 8000);

            let userMap = {};
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
            function generateQRCode(text, size = 256) {
                try {
                    if (typeof QRious === 'undefined') {
                        console.warn("QRious library not loaded");
                        return "";
                    }
                    const qr = new QRious({
                        value: text,
                        size: size,
                        level: 'M' // Medium error correction is better for printing
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
                const views = ['users', 'reports', 'tariffs', 'phones', 'config', 'billing', 'admin-tickets', 'tax-models', 'articles', 'credit-notes', 'credit-notes-list', 'qr-scanner-view', 'maintenance'];
                views.forEach(v => {
                    const el = document.getElementById('view-' + v);
                    if (el) el.style.display = (v === viewId) ? 'block' : 'none';
                });

                // 4. Component Initializations
                if (viewId === 'config') loadConfigInfo();
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

            window.loadAbonoForm = () => {
                const uid = document.getElementById('abono-client-select').value;
                if (uid) document.getElementById('abono-form-area').style.display = 'block';
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

                    const abonoData = {
                        id: nextId,
                        uid: uid,
                        compId: 'comp_main',
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
                    showView('billing');
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
                        const elSms = document.getElementById('conf-sms-gateway');
                        const elPhone = document.getElementById('conf-pickup-phone');
                        if (elSms) elSms.value = data.sms_gateway_url || '';
                        if (elPhone) elPhone.value = data.pickup_alert_phone || '';
                    }
                } catch (e) { console.error(e); }
            }

            document.getElementById('btn-save-settings').onclick = async () => {
                const smsURL = document.getElementById('conf-sms-gateway').value;
                const pickupPhone = document.getElementById('conf-pickup-phone').value;
                try {
                    await db.collection('config').doc('settings').set({
                        sms_gateway_url: smsURL,
                        pickup_alert_phone: pickupPhone
                    }, { merge: true });
                } catch (e) { alert("Error al guardar."); }
            };

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
                            const data = { id: doc.id, ...doc.data() };
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

            async function loadUsers(direction = 'first') {
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
                        usersCursors = [];
                    } else if (direction === 'next' && lastUserSnapshot) {
                        usersCursors[usersPage] = lastUserSnapshot;
                        usersPage++;
                    } else if (direction === 'prev' && usersPage > 1) {
                        usersPage--;
                    }

                    // 2. Query execution
                    const currentCursor = usersPage > 1 ? usersCursors[usersPage - 1] : null;
                    // Si falta createdAt, el documento se omite en el listado.
                    // Usamos idNum o email como backup o simplemente ordenamos por email si es necesario, 
                    // pero createdAt es el estándar del sistema.
                    let query = db.collection('users').orderBy('name', 'asc'); // Cambiar a 'name' para que sea más estable si faltan fechas
                    if (currentCursor) query = query.startAfter(currentCursor);
                    query = query.limit(usersLimit);

                    const snapshot = await query.get();
                    userTableBody.innerHTML = '';

                    if (snapshot.empty) {
                        userTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:30px; color:#888;">No hay clientes registrados en esta página.</td></tr>';
                        if (usersPage === 1) paginationUI.style.display = 'none';
                    } else {
                        lastUserSnapshot = snapshot.docs[snapshot.docs.length - 1];
                        snapshot.forEach(doc => {
                            const data = { id: doc.id, ...doc.data() };

                            // Cumulative cache (to avoid breaking Ticket/Billing selects)
                            userMap[data.id] = data;
                            if (data.authUid) userMap[data.authUid] = data;

                            const row = document.createElement('tr');
                            row.className = 'user-row';
                            row.innerHTML = `
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
                        document.getElementById('label-users-page').textContent = `Página ${usersPage}`;
                        document.getElementById('btn-users-prev').disabled = (usersPage === 1);
                        document.getElementById('btn-users-next').disabled = (snapshot.docs.length < usersLimit);
                    }

                    // Update selects (Search-based ones)
                    if (typeof populateAdminTicketClients === 'function') populateAdminTicketClients();

                } catch (e) {
                    console.error(e);
                    userTableBody.innerHTML = `<tr><td colspan="5" style="color:red; text-align:center;">Error: ${e.message}</td></tr>`;
                }
            }

            if (addUserForm) {
                addUserForm.onsubmit = async (e) => {
                    e.preventDefault();
                    const idNum = document.getElementById('new-user-id-num').value.trim();
                    const name = document.getElementById('new-user-name').value.trim();
                    const email = document.getElementById('new-user-email').value.trim().toLowerCase();
                    const password = document.getElementById('new-user-password').value.trim();
                    const tariffId = document.getElementById('new-user-tariff-id').value.trim();
                    const iban = document.getElementById('new-user-iban').value.trim();
                    const sepaRef = document.getElementById('new-user-sepa-ref').value.trim();
                    const sepaDate = document.getElementById('new-user-sepa-date').value;

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
                            idNum: idNumStr, name, email, password, tariffId, iban, sepaRef, sepaDate,
                            senderAddress, senderPhone,
                            street: street || '',
                            number: num || '',
                            localidad: city || '',
                            cp: cp || '',
                            province: province || ''
                        };

                        if (userId) {
                            // Actualización
                            await db.collection('users').doc(userId).update(updateData);
                        } else {
                            // Creación de nuevo registro maestro
                            await db.collection('users').doc(email).set({
                                ...updateData,
                                role: 'client',
                                street: street || '',
                                number: num || '',
                                localidad: city || '',
                                cp: cp || '',
                                province: province || '',
                                createdAt: firebase.firestore.FieldValue.serverTimestamp()
                            });

                        }

                        // 3. ACTUALIZAR SEDE PRINCIPAL (comp_main) - Siempre sincronizada con la ficha maestra
                        const mainCompData = {
                            name: name,
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
                        // We use the email (doc ID) or userId to reach the subcollection
                        const targetDocId = userId || email;
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
                document.getElementById('new-user-id-num').value = data.idNum || '';
                document.getElementById('new-user-name').value = data.name || '';
                document.getElementById('new-user-email').value = data.email || '';
                document.getElementById('new-user-password').value = data.password || '';
                document.getElementById('new-user-tariff-id').value = data.tariffId || '';
                document.getElementById('new-user-iban').value = data.iban || '';
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

            window.deleteUser = async (id) => {
                if (confirm('¿Eliminar cliente?')) {
                    await db.collection('users').doc(id).delete();
                    loadUsers();
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
                userMap = {};
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

            document.getElementById('btn-search-reports').onclick = async () => {
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
                            const da = (a.createdAt && a.createdAt.toDate) ? a.createdAt.toDate() : new Date(a.createdAt);
                            const db_ = (b.createdAt && b.createdAt.toDate) ? b.createdAt.toDate() : new Date(b.createdAt);
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

            document.getElementById('btn-export-reports').onclick = () => {
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
            document.getElementById('btn-export-accounting').onclick = () => {
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

            document.getElementById('btn-print-reports').onclick = () => window.print();

            // Phone Management
            phoneTableBody = document.getElementById('phone-table-body');
            const addPhoneModal = document.getElementById('add-phone-modal');
            const btnAddPhone = document.getElementById('btn-add-phone');
            const btnClosePhoneModal = document.getElementById('btn-close-phone-modal');
            const addPhoneForm = document.getElementById('add-phone-form');

            async function loadPhones() {
                const snapshot = await db.collection('config').doc('phones').collection('list').get();
                phoneTableBody.innerHTML = '';
                snapshot.forEach(doc => {
                    const data = doc.data();
                    const row = document.createElement('tr');
                    row.className = 'user-row';
                    row.innerHTML = `<td>${data.label}</td>
    <td>${data.number}</td>
    <td><button class="btn btn-danger btn-sm" onclick="deletePhone('${doc.id}')">🗑️</button></td>`;
                    phoneTableBody.appendChild(row);
                });
            }

            if (addPhoneForm) addPhoneForm.onsubmit = async (e) => {
                e.preventDefault();
                await db.collection('config').doc('phones').collection('list').add({
                    label: document.getElementById('new-phone-label').value,
                    number: document.getElementById('new-phone-number').value,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                addPhoneModal.style.display = 'none';
                loadPhones();
            };

            window.deletePhone = async (id) => {
                await db.collection('config').doc('phones').collection('list').doc(id).delete();
                loadPhones();
            };

            if (btnAddPhone) btnAddPhone.onclick = () => { if (addPhoneModal) addPhoneModal.style.display = 'flex'; };
            if (btnClosePhoneModal) btnClosePhoneModal.onclick = () => { if (addPhoneModal) addPhoneModal.style.display = 'none'; };
            window.openNewUserModal = () => {
                document.getElementById('modal-user-title').textContent = "Añadir Nuevo Cliente";
                document.getElementById('edit-user-uid').value = "";
                addUserForm.reset();
                // Auto-generar el siguiente ID lógico
                document.getElementById('new-user-id-num').value = getNextUserId();
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
                document.getElementById('sub-tariff-tabs').style.display = 'none';
                document.getElementById('tariff-editor-area').style.display = 'block';
                document.getElementById('tariff-editor-title').textContent = "Editar Tarifa Personalizada";
                loadTariffTable(uid);
            };

            document.getElementById('btn-load-global-tariff').onclick = () => {
                const tid = document.getElementById('tariff-global-id').value.trim();
                if (!tid) { alert("ID de Tarifa Global"); return; }
                currentTariffUID = "GLOBAL_" + tid;
                activeSubTariff = null;
                document.getElementById('sub-tariff-tabs').style.display = 'flex';
                document.getElementById('tariff-editor-area').style.display = 'block';
                document.getElementById('tariff-editor-title').textContent = "Editar Tarifa Global #" + tid;
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
                    row.innerHTML = `<td style = "font-weight:700" > ${name}</td><td>${parseFloat(items[name]).toFixed(2)}€</td>
                    <td style="text-align:right"><button class="btn btn-danger btn-sm" onclick="deleteTariffItem('${name}')">🗑️</button></td>`;
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

            document.getElementById('btn-save-fiscal').onclick = async () => {
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

            document.getElementById('btn-billing-config').onclick = () => {
                const section = document.getElementById('billing-config-section');
                section.style.display = section.style.display === 'none' ? 'block' : 'none';
            };

            document.getElementById('btn-generate-invoice-view').onclick = () => {
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

            document.getElementById('btn-close-inv-modal').onclick = () => {
                document.getElementById('modal-generate-invoice').style.display = 'none';
            };

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

            document.getElementById('btn-generate-sepa').onclick = async () => {
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

                div303.innerHTML = '';
                div111.innerHTML = '';

                Object.keys(s303).forEach(q => {
                    const data = s303[q];
                    div303.innerHTML += `
                <div style = "background:rgba(255,255,255,0.03); padding:10px; border-radius:4px; margin-bottom:10px;" >
                <strong>${q}</strong><br>
                Base Imponible: ${data.base.toFixed(2)}€ |
                <span style="color:#4CAF50">IVA Devengado: ${data.iva.toFixed(2)}€</span>
            </div>
        `;
                });

                Object.keys(s111).forEach(q => {
                    const data = s111[q];
                    div111.innerHTML += `
            <div style = "background:rgba(255,255,255,0.03); padding:10px; border-radius:4px; margin-bottom:10px;" >
                <strong>${q}</strong><br>
                Base Retenciones: ${data.base.toFixed(2)}€ |
                <span style="color:#FF3B30">IRPF a Ingresar: ${data.irpf.toFixed(2)}€</span>
            </div>
        `;
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
            <head><title>Factura ${inv.invoiceId}</title><style>@media print { @page { size: A4; margin: 0; } .no-print { display: none; } }</style></head>
            <body style="background:#f5f5f5; padding: 20px;">
                <div id="inv-content" style="max-width: 800px; margin: 0 auto; box-shadow: 0 0 10px rgba(0,0,0,0.1);">
                    ${generateInvoiceHTML(inv, date)}
                    <div class="no-print" style="text-align:center; padding: 20px;">
                        <button onclick="window.print()" style="padding:15px 30px; background:#FF6600; color:white; border:none; border-radius:5px; cursor:pointer; font-weight:bold;">🖨️ IMPRIMIR FACTURA</button>
                    </div>
                </div>
            </body>
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
                element.innerHTML = generateInvoiceHTML(inv, date);
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
                    docId: docId
                };
                const qrImage = generateQRCode(JSON.stringify(qrData), 350);

                const win = window.open('', '_blank');
                win.document.write(`<html><head><meta charset="UTF-8"><title>Albarán ${t.id}</title><style>
                * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                body{font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin:0; padding:0; background:#f9f9f9; color:#333; line-height:1.4;}
                .ticket-container{width:210mm; min-height:297mm; margin:10mm auto; background:white; padding:15mm; border-radius:10px; box-shadow:0 0 20px rgba(0,0,0,0.1); border:1px solid #EEE;}
                .header{display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3mm solid #FF6600; padding-bottom:10mm; margin-bottom:10mm;}
                .logo-text{font-size:2.5rem; font-weight:900; color:#FF6600; margin:0; letter-spacing:-1px;}
                .id-box{text-align:right;}
                .id-label{font-size:0.8rem; color:#888; text-transform:uppercase; font-weight:bold;}
                .id-value{font-size:1.8rem; font-weight:900; color:#333;}
                .section-grid{display:grid; grid-template-columns:1fr 1fr; gap:30px; margin-bottom:20px;}
                .info-card{border:1px solid #EEE; padding:20px; border-radius:12px; background:#FAFAFA;}
                .info-title{margin-top:0; color:#FF6600; font-size:0.75rem; text-transform:uppercase; letter-spacing:1px; margin-bottom:10px; border-bottom:1px solid #EEE; padding-bottom:5px;}
                .info-content{font-size:1.1rem; font-weight:600; margin:0; color:#111;}
                .details-box{border:2px solid #EEE; padding:25px; border-radius:15px; margin-bottom:20px; background:white;}
                .detail-item{display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #F0F0F0;}
                .detail-item:last-child{border-bottom:none;}
                .label{color:#666; font-weight:500;}
                .value{font-weight:700; color:#000;}
                @media print {
                    @page { size: A4; margin: 10mm; }
                    body { background:white; margin:0; padding:0; }
                    .ticket-container { width:190mm; margin:0 auto; padding:0; box-shadow:none; border:none; border-radius:0; page-break-after: always; }
                    .no-print { display:none; }
                }
            </style></head><body>
                <div class="ticket-container">
                    <div class="header">
                        <div>
                            <div class="logo-text">NOVAPACK</div>
                            <div style="color:#666; font-weight:600; margin-top:5px; font-size:0.9rem;">LOGÍSTICA Y DISTRIBUCIÓN</div>
                        </div>
                        <div class="id-box">
                            <div class="id-label">Albarán Oficial</div>
                            <div class="id-value">${t.id}</div>
                            <div style="font-size:0.8rem; color:#888; margin-top:5px;">${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}</div>
                        </div>
                    </div>
                    
                    <div class="section-grid">
                        <div class="info-card">
                            <h3 class="info-title">Remitente</h3>
                            <p class="info-content">${t.sender}</p>
                            <p style="font-size:0.85rem; color:#666; margin:5px 0 0 0;">${t.senderAddress || ''}</p>
                        </div>
                        <div class="info-card" style="border-color:#FF6600; background:#FFF9F5;">
                            <h3 class="info-title">Destinatario</h3>
                            <p class="info-content">${t.receiver}</p>
                            <p style="font-size:0.95rem; color:#333; margin:8px 0 0 0; font-weight:bold;">${t.address}</p>
                            <p style="margin:5px 0 0 0; color:#666;">${t.province || ''} ${t.phone || ''}</p>
                        </div>
                    </div>

                    <div class="details-box">
                        <h3 class="info-title">Especificaciones del Envío</h3>
                        <div class="detail-item">
                            <span class="label">Bultos Totales:</span>
                            <span class="value">${t.packagesList ? t.packagesList.reduce((s, p) => s + (parseInt(p.qty) || 1), 0) : (t.packages || 1)}</span>
                        </div>
                        <div class="detail-item">
                            <span class="label">Servicio:</span>
                            <span class="value">${t.shippingType || 'Pagados'}</span>
                        </div>
                        <div class="detail-item">
                            <span class="label">Turno:</span>
                            <span class="value">${t.timeSlot || 'MAÑANA'}</span>
                        </div>
                        <div class="detail-item">
                            <span class="label">Observaciones:</span>
                            <span class="value">${t.notes || 'Bajo demanda.'}</span>
                        </div>
                    </div>

                    <div style="display:flex; justify-content:space-between; align-items:flex-end;">
                        <div>
                            <img src="${qrImage}" style="width:130px; height:130px; border:1px solid #EEE; padding:8px; border-radius:12px;">
                            <p style="font-size:0.6rem; color:#AAA; margin:5px 0 0 0; letter-spacing:1px;">SYNC ID: ${docId}</p>
                        </div>
                        <div style="text-align:right;">
                            <div style="border-top:1px dashed #CCC; width:200px; margin-bottom:10px;"></div>
                            <p style="font-size:0.8rem; color:#888; margin:0;">Firma Receptor</p>
                        </div>
                    </div>
                </div>

                <div class="no-print" style="position:fixed; bottom:30px; right:30px; display:flex; gap:15px;">
                    <button onclick="window.print()" style="padding:15px 30px; background:#FF6600; color:white; border:none; border-radius:12px; cursor:pointer; font-weight:900; box-shadow:0 10px 20px rgba(255,102,0,0.3); font-size:1rem; display:flex; align-items:center; gap:10px;">
                        <span>🖨️</span> IMPRIMIR AHORA
                    </button>
                </div>
            </body></html>`);
                win.document.close();
            };

            function generateInvoiceHTML(inv, date) {
                let conceptHTML = '';
                if (inv.ticketsDetail && inv.ticketsDetail.length > 0) {
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
                        <td style="padding: 15px; border-bottom: 1px solid #EEE;">
                            <div style="font-weight: bold; color: #333;">DELEGACIÓN: ${group}</div>
                            <div style="font-size: 0.85rem; color: #666; margin-top: 4px;">Albaranes: ${grouped[group].ids.join(', ')}</div>
                        </td>
                        <td style="padding: 15px; border-bottom: 1px solid #EEE; text-align: right;">${grouped[group].subtotal.toFixed(2)}€</td>
                    </tr>`;
                    });
                } else {
                    conceptHTML = `
                <tr>
                    <td style="padding: 15px; border-bottom: 1px solid #EEE;">Servicios de transporte (Albaranes: ${inv.tickets.join(', ')})</td>
                    <td style="padding: 15px; border-bottom: 1px solid #EEE; text-align: right;">${inv.subtotal.toFixed(2)}€</td>
                </tr>`;
                }

                return `
            <div style="font-family: sans-serif; padding: 40px; color: #333; line-height: 1.6; background:white;">
                <div style="display: flex; justify-content: space-between; border-bottom: 2px solid #EEE; padding-bottom: 20px; margin-bottom: 40px;">
                    <div><div style="font-size: 2rem; font-weight: bold; color: #FF6600;">NOVAPACK LOGÍSTICA</div><div style="font-size: 1.2rem; color: #666;">FACTURA: ${inv.invoiceId}</div></div>
                    <div style="text-align: right;"><div style="font-size: 1.1rem; font-weight: bold;">Fecha: ${date}</div></div>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 40px;">
                    <div style="border: 1px solid #EEE; padding: 20px; border-radius: 8px;"><strong>EMISOR:</strong><br>${inv.senderData.name}<br>CIF: ${inv.senderData.cif}<br>${inv.senderData.address}</div>
                    <div style="border: 1px solid #EEE; padding: 20px; border-radius: 8px;"><strong>CLIENTE:</strong><br>${inv.clientName}<br>CIF/NIF: ${inv.clientCIF}</div>
                </div>
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 40px;">
                    <thead><tr style="background: #F9F9F9;"><th style="padding: 15px; border-bottom: 2px solid #EEE; text-align: left;">CONCEPTO</th><th style="padding: 15px; border-bottom: 2px solid #EEE; text-align: right;">TOTAL</th></tr></thead>
                    <tbody>${conceptHTML}</tbody>
                </table>
                <div style="float: right; width: 300px;">
                    <div style="display: flex; justify-content: space-between; padding: 5px 0;"><span>Base Imponible:</span><span>${inv.subtotal.toFixed(2)}€</span></div>
                    <div style="display: flex; justify-content: space-between; padding: 5px 0;"><span>IVA (${inv.ivaRate}%):</span><span>${inv.iva.toFixed(2)}€</span></div>
                    ${inv.irpf > 0 ? `<div style="display: flex; justify-content: space-between; padding: 5px 0;"><span>IRPF (-${inv.irpfRate}%):</span><span>-${inv.irpf.toFixed(2)}€</span></div>` : ''}
                    <div style="display: flex; justify-content: space-between; padding: 10px 0; font-size: 1.4rem; font-weight: bold; border-top: 2px solid #FF6600; color: #FF6600;"><span>TOTAL:</span><span>${inv.total.toFixed(2)}€</span></div>
                </div>
                <div style="clear: both; margin-top: 60px; padding: 20px; background: #F9F9F9; border-radius: 8px;"><strong>FORMA DE PAGO:</strong> Transferencia a ${inv.senderData.bank}</div>
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
                    document.getElementById('full-summary-303').innerHTML = `
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

                    document.getElementById('full-summary-111').innerHTML = `
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
                        <span style="text-align:right; font-weight:bold; color:#FF9800;">${totalIrpf.toFixed(2)}€</span>
                    </div>
                    <div style="margin-top:15px; text-align:right; font-size:1.1rem; color:#FF9800;">
                        TOTAL A INGRESAR: <strong>${totalIrpf.toFixed(2)}€</strong>
                    </div>
                `;

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

                    // Cargar todas las empresas para el buscador (Crucial para encontrar por nombre de empresa)
                    userCompaniesMap = {};
                    const compSnap = await db.collectionGroup('companies').get();
                    compSnap.forEach(doc => {
                        const parentUid = doc.ref.parent.parent.id;
                        if (!userCompaniesMap[parentUid]) userCompaniesMap[parentUid] = {};
                        userCompaniesMap[parentUid][doc.id] = doc.data().name || "";
                    });

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
                }
            }

            document.getElementById('admin-ticket-client-search').oninput = (e) => {
                populateAdminTicketClients(e.target.value);
            };

            document.getElementById('admin-ticket-client-select').onchange = async (e) => {
                adminTicketUID = e.target.value;
                await loadAdminTicketCompanies(adminTicketUID);
                await loadAdminTicketDestinations(adminTicketUID);

                // Default to 'ALL' to show all tickets across all branches when selecting a client
                adminTicketCompID = "ALL";
                document.getElementById('admin-ticket-company-select').value = "ALL";

                refreshAdminSuggestedSizes(adminTicketUID, "ALL");

                const createView = document.getElementById('sub-view-admin-create');
                if (createView.style.display === 'none') {
                    setAdminTicketSubView('list');
                } else {
                    setTimeout(() => window.scrollTo(0, 0), 50);
                }
            };

            let lastLoadedCompaniesUid = null;
            async function loadAdminTicketCompanies(uid, force = false) {
                if (!uid) return;
                if (uid === lastLoadedCompaniesUid && !force) return;
                lastLoadedCompaniesUid = uid;

                console.log("Loading companies for:", uid);
                const select = document.getElementById('admin-ticket-company-select');
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

                    select.value = "ALL";
                    adminTicketCompID = "ALL";

                    const infoBox = document.getElementById('admin-t-sender-info');
                    const infoText = document.getElementById('admin-t-sender-text');
                    if (infoBox) infoBox.style.display = 'none'; // ALL has no specific sender info
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
                            }
                        });
                        console.log(`Cargadas ${adminDestinationsCache.length} destinaciones para el cliente.`);
                    }
                } catch (e) { console.warn("Error cargando agenda de cliente:", e); }
            }

            const adminTReceiver = document.getElementById('admin-t-receiver');
            const adminTResults = document.getElementById('admin-t-destinations-results');

            if (adminTReceiver && adminTResults) {
                adminTReceiver.oninput = () => {
                    const q = adminTReceiver.value.toLowerCase().trim();
                    if (q.length < 1) { adminTResults.classList.add('hidden'); return; }

                    const matches = adminDestinationsCache.filter(d =>
                        d.name.toLowerCase().includes(q) ||
                        (d.address && d.address.toLowerCase().includes(q))
                    ).slice(0, 10);

                    if (matches.length === 0) { adminTResults.classList.add('hidden'); return; }

                    adminTResults.innerHTML = '';
                    adminTResults.classList.remove('hidden');
                    matches.forEach(m => {
                        const div = document.createElement('div');
                        div.className = 'suggestion-item';
                        div.style = "padding:10px; border-bottom:1px solid var(--border-glass); cursor:pointer; font-size:0.8rem;";
                        div.innerHTML = `<strong>${m.name}</strong><br><span style="color:#888;">${m.address || ''}</span>`;
                        div.onclick = () => {
                            adminTReceiver.value = m.name;
                            document.getElementById('admin-t-phone').value = m.phone || '';
                            document.getElementById('admin-t-address').value = m.street || m.address || '';
                            document.getElementById('admin-t-number').value = m.number || '';
                            document.getElementById('admin-t-locality').value = m.localidad || '';
                            document.getElementById('admin-t-cp').value = m.cp || '';
                            document.getElementById('admin-t-province').value = m.province || '';
                            adminTResults.classList.add('hidden');
                        };
                        adminTResults.appendChild(div);
                    });
                };

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
                    address: fullAddress,
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
                document.getElementById('admin-dest-form-title').textContent = "NUEVA ENTRADA DE AGENDA";
                document.querySelectorAll('#modal-manage-destinations input, #modal-manage-destinations textarea').forEach(i => i.value = '');
            };

            async function loadAdminDestinationsList(uid) {
                const tbody = document.getElementById('admin-dest-list-body');
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
                const comp = adminCompaniesCache[adminTicketCompID];
                if (comp) {
                    infoText.textContent = `${comp.name} - ${comp.address || 'Sin dirección'}`;
                    infoBox.style.display = 'block';
                } else {
                    infoBox.style.display = 'none';
                }

                if (document.getElementById('sub-view-admin-list').style.display !== 'none') {
                    loadAdminTicketList();
                }
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

                    // Add sorting
                    query = query.orderBy('createdAt', 'desc');

                    // 2. Handle Pagination State
                    if (direction === 'first') {
                        adminTicketsPage = 1;
                        adminTicketsCursors = [];
                    } else if (direction === 'next' && adminCompanyTickets.length > 0) {
                        const lastVisible = adminCompanyTickets[adminCompanyTickets.length - 1].docRef;
                        adminTicketsCursors[adminTicketsPage] = lastVisible;
                        adminTicketsPage++;
                    } else if (direction === 'prev' && adminTicketsPage > 1) {
                        adminTicketsPage--;
                    }

                    // 3. Apply Cursor and Limit
                    const currentCursor = adminTicketsPage > 1 ? adminTicketsCursors[adminTicketsPage - 1] : null;

                    const executeSearch = (searchField, searchValues) => {
                        if (adminTicketsListener) adminTicketsListener();
                        let q = db.collection('tickets').where(searchField, 'in', searchValues.slice(0, 10)).orderBy('createdAt', 'desc');
                        if (currentCursor) q = q.startAfter(currentCursor);
                        q = q.limit(adminTicketsLimit);

                        adminTicketsListener = q.onSnapshot(snapshot => {
                            if (snapshot.empty && searchField === 'clientIdNum' && adminTicketsPage === 1) {
                                const uids = [...new Set(identityIds.filter(x => x && typeof x === 'string'))];
                                if (uids.length > 0) return executeSearch('uid', uids);
                            }

                            let raw = [];
                            snapshot.forEach(doc => raw.push({ ...doc.data(), docId: doc.id, docRef: doc }));

                            const isMainCompSelected = (adminTicketCompID === "comp_main" || !adminTicketCompID);
                            adminCompanyTickets = raw.filter(t => {
                                const tCompId = t.compId || 'comp_main';
                                const isMainTComp = (tCompId === "comp_main" || tCompId === "default");
                                const compMatch = (adminTicketCompID === "ALL") || (isMainCompSelected && isMainTComp) || (tCompId === adminTicketCompID);

                                // Filter: Only pending tickets (invoiceId empty)
                                const isPending = !t.invoiceId || String(t.invoiceId).trim() === "" || String(t.invoiceId).toLowerCase() === "null";
                                return compMatch && isPending;
                            });

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
                                    const tr = document.createElement('tr');
                                    tr.className = 'user-row';
                                    tr.innerHTML = `
                                <td><input type="checkbox" class="admin-ticket-check" data-index="${i}" onchange="updateAdminSelectedTotal()"></td>
                                <td>${date}</td>
                                <td>${t.id}</td>
                                <td>${t.receiver}</td>
                                <td>${pkgs}</td>
                                <td>${price.toFixed(2)}€</td>
                                <td><span class="badge ${isPrinted ? 'badge-success' : 'badge-warning'}">${isPrinted ? '🖨️ IMPRESO' : '🕒 NUEVO'}</span></td>
                                <td style="text-align:right;">
                                    <button class="btn btn-xs btn-outline" onclick="printTicketFromAdmin('${adminTicketUID}', '${adminTicketCompID}', '${t.docId}')">🖨️</button>
                                </td>
                            `;
                                    tbody.appendChild(tr);
                                });

                                // Show Pagination controls
                                paginationUI.style.display = 'flex';
                                document.getElementById('label-admin-tickets-page').textContent = `Página ${adminTicketsPage}`;
                                document.getElementById('btn-admin-tickets-prev').disabled = (adminTicketsPage === 1);
                                document.getElementById('btn-admin-tickets-next').disabled = (snapshot.docs.length < adminTicketsLimit);
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
                                    <p style="font-size:0.85rem;">📞 ${t.phone || '-'}</p>
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
                                    <div style="border:2px solid black; padding:5px; font-weight:900; font-size:1.4rem;">${t.timeSlot || 'MAÑANA'}</div>
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

            window.invoiceSelectedAdminTickets = async () => {
                const checks = document.querySelectorAll('.admin-ticket-check:checked');
                if (checks.length === 0) { alert("⚠️ Selecciona al menos un albarán."); return; }

                if (!invCompanyData || !invCompanyData.cif) {
                    alert("⚠️ Configura los Datos Fiscales en la sección Facturación.");
                    return;
                }

                const selectedTickets = Array.from(checks).map(c => adminCompanyTickets[parseInt(c.dataset.index)]);
                const subtotal = selectedTickets.reduce((s, t) => s + (t.calculatedPrice || 0), 0);

                if (subtotal <= 0) { alert("⚠️ Los albaranes seleccionados no tienen precio asignado."); return; }

                const clientData = userMap[adminTicketUID];
                const ivaRate = parseFloat(document.getElementById('fiscal-iva').value) || 21;
                const irpfRate = parseFloat(document.getElementById('fiscal-irpf').value) || 0;
                const iva = subtotal * (ivaRate / 100);
                const irpf = subtotal * (irpfRate / 100);
                const total = subtotal + iva - irpf;

                if (!confirm(`¿Generar factura por ${total.toFixed(2)}€ (${selectedTickets.length} albaranes)?`)) return;

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
                        subtotal, iva, ivaRate, irpf, irpfRate, total,
                        tickets: selectedTickets.map(t => t.id),
                        ticketsDetail: selectedTickets.map(t => ({ id: t.id, compName: t.compName || "", price: t.calculatedPrice || 0 })),
                        senderData: invCompanyData
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
                    'admin-t-cp', 'admin-t-province', 'admin-t-cod', 'admin-t-notes'];
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

                                showScannedTicket(cleanId);
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
                let searchId = id;
                let qrData = null;
                try {
                    if (id.trim().startsWith('{')) {
                        qrData = JSON.parse(id);
                        searchId = qrData.docId || qrData.id || id;
                    }
                } catch (e) { console.warn("Not a JSON QR", e); }

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
                        alert("Albarán no encontrado: " + searchId);
                        return;
                    }
                    doc = snap.docs[0];
                    t = doc.data();
                }

                document.getElementById('scanned-result-area').classList.remove('hidden');
                document.getElementById('scanned-id').textContent = "ID: " + (t.id || id);
                const isDelivered = t.delivered || t.status === 'Entregado';

                const badge = document.getElementById('scanned-status-badge');
                badge.textContent = isDelivered ? '✅ ENTREGADO' : '⚪ PENDIENTE';
                badge.className = 'status-badge ' + (isDelivered ? 'delivered' : 'new');
                badge.style = ""; // Clear inline styles

                document.getElementById('scanned-details').innerHTML = `
        <div style="margin-top:10px; border-top:1px solid #EEE; padding-top:10px;">
            <b>Remitente:</b> ${t.sender || '---'}<br>
            <b>Destinatario:</b> ${t.receiver}<br>
            <b>Dirección:</b> ${t.address || t.street || '---'}<br>
            <b>Bultos:</b> ${t.packagesList ? t.packagesList.reduce((s, p) => s + (parseInt(p.qty) || 1), 0) :
                        (t.packages || 1)}<br>
            <b>Estado Cloud:</b> ${isDelivered ? 'Entregado' : 'Pendiente/En Tránsito'}
        </div>
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
                document.body.removeChild(input);
            };

            window.openJSONImport = () => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.json';
                input.style.display = 'none';
                input.onchange = (e) => handleImportJSON(e);
                document.body.appendChild(input);
                input.click();
                document.body.removeChild(input);
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

                            const t = {
                                id: cols[0]?.trim(),
                                receiver: cols[1]?.trim(),
                                address: cols[2]?.trim(),
                                cp: cols[3]?.trim(),
                                localidad: cols[4]?.trim(),
                                province: cols[5]?.trim(),
                                phone: cols[6]?.trim(),
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
                        } else if (raw.tickets) {
                            ticketsToImport = raw.tickets;
                        }

                        if (ticketsToImport.length === 0) {
                            alert("No se encontraron albaranes en el JSON.");
                            return;
                        }

                        if (!confirm(`¿Restaurar ${ticketsToImport.length} albaranes desde el backup JSON?`)) return;

                        showLoading();
                        const ticketsCol = db.collection('tickets');
                        for (let i = 0; i < ticketsToImport.length; i += 50) {
                            const chunk = ticketsToImport.slice(i, i + 50); const
                                batch = db.batch(); chunk.forEach(t => {
                                    if (!t.id || !t.uid || !t.compId) return;
                                    const docId = `${t.uid}_${t.compId}_${t.id}`;
                                    // Asegurar clientIdNum para sincronización
                                    if (!t.clientIdNum && userMap[t.uid]) t.clientIdNum = userMap[t.uid].idNum;
                                    // Convertir fechas si son strings
                                    if (t.createdAt && typeof t.createdAt === 'string') t.createdAt = new Date(t.createdAt);
                                    if (t.updatedAt && typeof t.updatedAt === 'string') t.updatedAt = new Date(t.updatedAt);
                                    batch.set(ticketsCol.doc(docId), t, { merge: true });
                                });
                            await batch.commit();
                        }
                        hideLoading();
                        alert("✅ Restauración de backup JSON completada.");
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
                            fetchAllUsersMap()
                        ]).finally(() => hideLoading());
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

            // --- MISSING ADMIN OPERATIONAL LOGIC ---
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
        