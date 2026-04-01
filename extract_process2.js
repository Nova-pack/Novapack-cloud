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

                    // --- ALERTA DE ALBAR