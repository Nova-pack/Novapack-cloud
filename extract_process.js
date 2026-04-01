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

                    document.getElementById('admin-t-receiver').value = qrData.