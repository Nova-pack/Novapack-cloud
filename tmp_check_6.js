
            function sendAIPrompt(textStr) {
                const input = document.getElementById('ai-chat-input');
                const text = textStr || input.value.trim();
                if(!text) return;
                
                input.value = '';
                const body = document.getElementById('ai-chat-body');
                
                // Hide suggestions
                const sugg = document.getElementById('ai-suggestions-box');
                if(sugg) sugg.style.display = 'none';

                // User Msg
                const userDiv = document.createElement('div');
                userDiv.style.cssText = 'align-self:flex-end; background:var(--brand-primary); color:white; padding:10px 14px; border-radius:12px 12px 0 12px; font-size:0.9rem; max-width:85%;';
                userDiv.textContent = text;
                body.appendChild(userDiv);
                
                // Simulated thinking
                setTimeout(() => {
                    const botDiv = document.createElement('div');
                    botDiv.style.cssText = 'align-self:flex-start; background:#252526; border:1px solid #3c3c3c; padding:10px 14px; border-radius:12px 12px 12px 0; color:#d4d4d4; font-size:0.9rem; max-width:85%;';
                    
                    // Simple FAQ Engine Logic
                    let reply = "Lo siento, actualmente no estoy conectado a una IA libre con OpenAI/Gemini. Solo puedo responder a comandos predefinidos. Por favor solicita al desarrollador la integración con IA Libre si deseas consultas sin límites.";
                    
                    const t = text.toLowerCase();
                    if(t.includes("factura") || t.includes("pro")) {
                        reply = "<b>Para Facturación PRO:</b><br>1. Ve a Facturación PRO en el menú.<br>2. Selecciona un cliente del listado.<br>3. Abajo verás los albaranes pendientes.<br>4. Marca los que desees incluir.<br>5. Pulsa 'Generar Factura DEFINITIVA'.";
                    } else if(t.includes("repartidor") || t.includes("chofer")) {
                        reply = "<b>App de Repartidor:</b><br>Los chóferes deben acceder desde su móvil ingresando su nombre tal cual aparece en 'Rutas / Carpetas'. Allí verán los albaranes asignados a su ruta diaria, podrán escanear QR's de estado e introducir la firma del destinatario.";
                    } else if(t.includes("debidos")) {
                        reply = "<b>Portes Debidos:</b><br>Al escanear un ticket sin asignar o recibir un albarán desde web marcado como 'Portes Debidos', este caerá en 'Facturación PRO' -> Pestaña 'Portes Debidos'. Debes asignarle un Cliente para que pase al flujo normal de facturación.";
                    } else if(t.includes("identidad") || t.includes("quien soy")) {
                        const iden = window.adminIdentity || "Administrador Anónimo";
                        reply = "Actualmente estás operando el sistema bajo la identidad: <b>" + iden + "</b>.";
                    }

                    botDiv.innerHTML = reply;
                    body.appendChild(botDiv);
                    body.scrollTop = body.scrollHeight;
                }, 800);
                
                body.scrollTop = body.scrollHeight;
            }
            
            // Re-update dynamic-identity-name when chat modal is opened if identity was chosen
            document.getElementById('ai-assistant-fab').addEventListener('click', () => {
                if(window.adminIdentity) {
                    document.querySelectorAll('.dynamic-identity-name').forEach(el => el.textContent = window.adminIdentity);
                }
            });
        