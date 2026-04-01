
                function initMaintenanceView() {
                    updateMaintenanceStats();
                }

                async function updateMaintenanceStats() {
                    try {
                        const ticketsSnap = await db.collection('tickets').get();
                        const invoicesSnap = await db.collection('invoices').get();
                        const usersSnap = await db.collection('users').get();
                        document.getElementById('stat-total-tickets').textContent = ticketsSnap.size;
                        document.getElementById('stat-total-invoices').textContent = invoicesSnap.size;
                        document.getElementById('stat-total-clients').textContent = usersSnap.size;
                    } catch (e) {
                        console.error("Error loading maintenance stats:", e);
                    }
                }

                window.downloadFullBackupJSON = async () => {
                    if (!confirm("¿Desea descargar una copia de seguridad local de toda su base de datos?")) return;
                    showLoading();
                    try {
                        const backupDate = new Date().toISOString();
                        const data = {
                            backup_info: {
                                version: "Novapack Cloud v2.2",
                                timestamp: backupDate,
                                author: "Admin Cloud Console"
                            },
                            collections: {
                                users: {},
                                tickets: [],
                                invoices: [],
                                tariffs: [],
                                articles: [],
                                config: {}
                            }
                        };

                        const usersSnap = await db.collection('users').get();
                        for (const uDoc of usersSnap.docs) {
                            const uData = uDoc.data();
                            const compsSnap = await db.collection('users').doc(uDoc.id).collection('companies').get();
                            uData.companies = compsSnap.docs.map(c => ({ id: c.id, ...c.data() }));
                            data.collections.users[uDoc.id] = uData;
                        }

                        const tSnap = await db.collection('tickets').get();
                        data.collections.tickets = tSnap.docs.map(d => ({ id: d.id, ...d.data() }));

                        const iSnap = await db.collection('invoices').get();
                        data.collections.invoices = iSnap.docs.map(d => ({ id: d.id, ...d.data() }));

                        const tarSnap = await db.collection('tariffs').get();
                        data.collections.tariffs = tarSnap.docs.map(d => ({ id: d.id, ...d.data() }));

                        const artSnap = await db.collection('articles').get();
                        data.collections.articles = artSnap.docs.map(d => ({ id: d.id, ...d.data() }));

                        const cfgSnap = await db.collection('config').get();
                        cfgSnap.forEach(d => data.collections.config[d.id] = d.data());

                        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement("a");
                        link.href = url;
                        link.download = `NOVAPACK_FULL_BACKUP_${new Date().toISOString().split('T')[0]}.json`;
                        document.body.appendChild(link);
                        link.click();
                        link.remove();
                        URL.revokeObjectURL(url);
                        alert("✅ Copia de seguridad descargada correctamente.");
                    } catch (e) {
                        console.error("Backup Error:", e);
                        alert("❌ Error al generar la copia de seguridad: " + e.message);
                    } finally {
                        hideLoading();
                    }
                }
            