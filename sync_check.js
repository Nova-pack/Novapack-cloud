            let unbilledTickets = [];

            window.onerror = (e) => {
                console.error("Global ERP Error:", e);
                if (typeof hideLoading === 'function') hideLoading();
            };

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

            function getCollection(name) {
                if (name === 'tickets' || name === 'invoices') return db.collection(name);
                const uid = adminTicketUID || (auth.currentUser ? auth.currentUser.uid : null);
                if (!uid) return null;
                return db.collection('users').doc(uid).collection(name);
            }

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

            window.toggleSidebar = () => {
                const sidebar = document.getElementById('sidebar');
                if (sidebar) sidebar.classList.toggle('mobile-active');
            };

            window.showView = (viewId) => {
                document.querySelectorAll('.nav-item').forEach(item => {
                    const onclickStr = item.getAttribute('onclick') || "";
                    if (onclickStr.includes(`'${viewId}'`)) {
                        item.classList.add('active');
                    } else {
                        item.classList.remove('active');
                    }
                });

                if (window.innerWidth <= 992) {
                    const sidebar = document.getElementById('sidebar');
                    if (sidebar) sidebar.classList.remove('mobile-active');
                }

                const views = ['users', 'reports', 'tariffs', 'phones', 'config', 'billing', 'admin-tickets', 'tax-models', 'articles', 'credit-notes', 'credit-notes-list', 'qr-scanner-view', 'maintenance'];
                views.forEach(v => {
                    const el = document.getElementById('view-' + v);
                    if (el) el.style.display = (v === viewId) ? 'block' : 'none';
                });

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

                setTimeout(() => window.scrollTo(0, 0), 100);
            };

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

            async function _doWipeOperationalData() {
                console.log("[Maintenance] Iniciando borrado masivo...");

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
                    await _doWipeOperationalData();

                    const tSnap = await db.collection('tariffs').get();
                    let batch = db.batch();
                    tSnap.forEach(d => batch.delete(d.ref));
                    await batch.commit();

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

            window.repairDatabase = async () => {
                if (!confirm("Esta acción reconstruirá los privilegios de administrador y verificará la estructura base. ¿Deseas continuar?")) return;
                showLoading();
                try {
                    if (auth.currentUser) {
                        await db.collection('config').doc('admin').set({ uid: auth.currentUser.uid }, { merge: true });
                        console.log("[Repair] Admin privileges restored for:", auth.currentUser.uid);
                    }

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
                    if (direction === 'first') {
                        const sProv = document.getElementById('new-user-sender-province');
                        if (sProv) {
                            try {
                                const custom = await getCustomData('provinces') || [];
                                const deleted = await getCustomData('provinces_deleted') || [];
                                let allP = [...new Set([...DEFAULTS, ...custom])].filter(p => !deleted.includes(p)).sort();
                                let htmlP = '<option value="">-- Provincia / Zona --</option>';
                                allP.forEach(z => htmlP += `<option value="${z}">${z}</option>`);
                                sProv.innerHTML = htmlP;
                            } catch (e) { }
                        }
                        try { populateGlobalTariffsDatalist(); } catch (e) { }
                    }

                    if (direction === 'first') {
                        usersPage = 1;
                        usersCursors = [];
                    } else if (direction === 'next' && lastUserSnapshot) {
                        usersCursors[usersPage] = lastUserSnapshot;
                        usersPage++;
                    } else if (direction === 'prev' && usersPage > 1) {
                        usersPage--;
                    }

                    const currentCursor = usersPage > 1 ? usersCursors[usersPage - 1] : null;
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

                        paginationUI.style.display = 'flex';
                        document.getElementById('label-users-page').textContent = `Página ${usersPage}`;
                        document.getElementById('btn-users-prev').disabled = (usersPage === 1);
                        document.getElementById('btn-users-next').disabled = (snapshot.docs.length < usersLimit);
                    }

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

                    const parts = [];
                    if (street) parts.push(street);
                    if (num) parts.push("Nº " + num);
                    if (city) parts.push(city);
                    if (cp) parts.push(`(CP ${cp})`);
                    const senderAddress = parts.join(', ');

                    if (!email || !idNum) { alert("Email e ID son obligatorios."); return; }

                    try {
                        showLoading();

                        if (!userId) {
                            const docEmail = await db.collection('users').doc(email).get();
                            if (docEmail.exists) {
                                alert(`❌ ERROR: El email "${email}" ya está registrado para otro cliente.`);
                                hideLoading();
                                return;
                            }

                            const snapId = await db.collection('users').where('idNum', '==', idNum).get();
                            const snapIdNum = await db.collection('users').where('idNum', '==', parseInt(idNum)).get();

                            if (!snapId.empty || !snapIdNum.empty) {
                                const existing = (!snapId.empty ? snapId.docs[0].data() : snapIdNum.docs[0].data());
                                alert(`⚠️ AVISO: El ID #${idNum} ya pertenece a "${existing.name}".\nPor favor, usa un ID único.`);
                                hideLoading();
                                return;
                            }
                        }

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
                            await db.collection('users').doc(userId).update(updateData);
                        } else {
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

