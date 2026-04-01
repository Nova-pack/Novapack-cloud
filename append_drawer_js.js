const fs = require('fs');
const file = 'c:\\NOVAPACK CLOUD\\public\\billing_adv.js';
const jsCode = `

// --- DRAWER LOGIC FOR CATALOG AND TARIFFS ---
window.advCurrentDrawerType = null;
window.advDrawerItemsCache = [];

window.advOpenDrawer = async (type) => {
    window.advCurrentDrawerType = type;
    const drawer = document.getElementById('adv-catalog-drawer');
    const title = document.getElementById('adv-drawer-title');
    const list = document.getElementById('adv-drawer-list');
    const search = document.getElementById('adv-drawer-search');
    
    if(!drawer) return;
    drawer.classList.add('open');
    if(search) search.value = '';
    list.innerHTML = '<div style="text-align:center; padding:20px; color:#aaa;">Cargando catálogo interactivamente...</div>';
    window.advDrawerItemsCache = [];

    try {
        if (type === 'articles') {
            title.textContent = '📦 Catálogo Maestro de Artículos';
            const snap = await db.collection('articles').orderBy('name').get();
            if(!snap.empty) {
                snap.forEach(doc => {
                    const d = doc.data();
                    window.advDrawerItemsCache.push({ id: doc.id, name: d.name, price: d.price || 0, type: 'article' });
                });
            } else {
                list.innerHTML = '<div style="text-align:center; padding:20px; color:#aaa;">No hay artículos en el maestro. Crealos en la sección Artículos.</div>';
                return;
            }
        } else if (type === 'tariffs') {
            title.textContent = '💰 Tarifas y Acuerdos de Cliente';
            if (!advCurrentClient) {
                list.innerHTML = '<div style="text-align:center; padding:20px; color:#ff4444; font-weight:bold;">⚠️ Seleccione primero un CLIENTE en la cabecera de la factura.</div>';
                return;
            }
            
            // Check global / client tariffs from global window.tariffsCache or fetch
            let tariffsArray = [];
            if(window.tariffsCache && Object.keys(window.tariffsCache).length > 0) {
                 tariffsArray = Object.values(window.tariffsCache);
            } else {
                 const tSnap = await db.collection('tariffs').get();
                 tSnap.forEach(tDoc => tariffsArray.push({id: tDoc.id, ...tDoc.data()}));
            }

            let foundAny = false;
            tariffsArray.forEach(t => {
                // Filter if it's assigned to this client or is a general one
                if(t.assignedClient === advCurrentClient.id || t.assignedClient === advCurrentClient.idNum || !t.assignedClient || t.assignedClient === 'GLOBAL') {
                    foundAny = true;
                    if(t.subTariff && t.subTariff.length > 0) {
                        t.subTariff.forEach(st => {
                            window.advDrawerItemsCache.push({
                                id: t.id + '_' + st.id,
                                name: \`\${t.name} - \${st.name} (\${st.origin || '*'} ➔ \${st.destination || '*'})\`,
                                price: st.price || 0,
                                type: 'tariff'
                            });
                        });
                    } else if (t.basePrice) {
                        window.advDrawerItemsCache.push({
                            id: t.id,
                            name: t.name,
                            price: t.basePrice || 0,
                            type: 'tariff'
                        });
                    }
                }
            });

            if(!foundAny || window.advDrawerItemsCache.length === 0) {
                list.innerHTML = '<div style="text-align:center; padding:20px; color:#ff4444;">No se encontraron tarifas genéricas ni asociadas a este cliente.</div>';
                return;
            }
        }
        
        advRenderDrawerList();
    } catch(e) {
        list.innerHTML = \`<div style="text-align:center; padding:20px; color:#ff4444;">Error de lectura: \${e.message}</div>\`;
    }
};

window.advRenderDrawerList = (filter = '') => {
    const list = document.getElementById('adv-drawer-list');
    if(!list) return;
    list.innerHTML = '';
    const term = filter.toLowerCase();
    
    let count = 0;
    window.advDrawerItemsCache.forEach(item => {
        if(term && !item.name.toLowerCase().includes(term)) return;
        count++;
        
        const div = document.createElement('div');
        div.className = 'adv-drawer-item';
        // HTML Injection safe string escaping for item.name
        const safeName = item.name.replace(/'/g, "\\\\'");
        div.innerHTML = \`
            <div style="flex:1; padding-right:10px;">
                <div style="color:#d4d4d4; font-weight:bold; font-size:0.9rem; line-height:1.2; margin-bottom:4px;">\${item.name}</div>
                <div style="color:#4CAF50; font-size:0.85rem; font-weight:900;">\${parseFloat(item.price).toFixed(2)} €</div>
            </div>
            <button style="background:#007acc; border:none; color:white; padding:8px 15px; border-radius:4px; font-weight:bold; cursor:pointer;" onmouseover="this.style.background='#0098ff'" onmouseout="this.style.background='#007acc'" onclick="advAddRowFromDrawer('\${safeName}', \${item.price})">+ AÑADIR</button>
        \`;
        list.appendChild(div);
    });
    
    if(count === 0) {
        list.innerHTML = '<div style="text-align:center; padding:20px; color:#666;">No hay coincidencias con tu búsqueda.</div>';
    }
};

window.advFilterDrawer = (val) => {
    advRenderDrawerList(val);
};

window.advAddRowFromDrawer = (desc, price) => {
    advGridRows.push({
        id: 'row_' + Date.now() + Math.floor(Math.random()*1000),
        description: desc,
        qty: 1,
        price: parseFloat(price) || 0,
        discount: 0,
        iva: window.invCompanyData ? window.invCompanyData.iva : 21,
        ticketId: null
    });
    advRenderGrid();
};
`;

fs.appendFileSync(file, jsCode, 'utf8');
console.log('Appended drawer logic to billing_adv.js');
