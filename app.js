/**
 * NOVAPACK OFFLINE - Core Logic
 */

/* --- PERSISTENT STORAGE HELPER (IndexedDB) --- */
const idb = {
    dbName: 'NovapackLegacyDB',
    storeName: 'Handles',
    async getStore() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);
            request.onupgradeneeded = () => request.result.createObjectStore(this.storeName);
            request.onsuccess = () => {
                const db = request.result;
                const tx = db.transaction(this.storeName, 'readwrite');
                resolve(tx.objectStore(this.storeName));
            };
            request.onerror = () => reject(request.error);
        });
    },
    async set(key, val) {
        try {
            const store = await this.getStore();
            store.put(val, key);
        } catch (e) { console.error("IDB Set Error:", e); }
    },
    async get(key) {
        try {
            const store = await this.getStore();
            return new Promise((resolve) => {
                const req = store.get(key);
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => resolve(null);
            });
        } catch (e) { return null; }
    }
};

let backupDirHandle = null;

/* --- LOCAL STORAGE DATABASE --- */
class LocalDB {
    constructor() {
        this.basePrefix = "novapack_";
        this.companyId = 'default'; // Will be set in init
    }

    setCompany(id) {
        this.companyId = id;
    }

    getKey(collection) {
        // Shared Collections
        if (collection === 'destinations') return this.basePrefix + collection; // Shared

        // Company Specific
        return this.basePrefix + this.companyId + '_' + collection;
    }

    // Generic Get
    getAll(collection) {
        const data = localStorage.getItem(this.getKey(collection));
        return data ? JSON.parse(data) : [];
    }

    getOne(collection, id) {
        const all = this.getAll(collection);
        return all.find(item => item.id === id);
    }

    // Generic Add
    add(collection, item) {
        const all = this.getAll(collection);
        all.push(item);
        this.save(collection, all);
        return item;
    }

    // Generic Update
    update(collection, id, updates) {
        const all = this.getAll(collection);
        const index = all.findIndex(item => item.id === id);
        if (index !== -1) {
            all[index] = { ...all[index], ...updates };
            this.save(collection, all);
            return all[index];
        }
        return null;
    }

    // Generic Delete
    delete(collection, id) {
        let all = this.getAll(collection);
        all = all.filter(item => item.id !== id);
        this.save(collection, all);
    }

    save(collection, data) {
        localStorage.setItem(this.getKey(collection), JSON.stringify(data));
    }

    // Backup
    getBackupJSON() {
        const data = {};
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith(this.basePrefix)) {
                data[key] = localStorage.getItem(key);
            }
        }
        return JSON.stringify(data, null, 2);
    }

    // Restore
    restoreFromJSON(jsonString) {
        try {
            const data = JSON.parse(jsonString);
            Object.keys(data).forEach(key => {
                if (key.startsWith(this.basePrefix)) {
                    localStorage.setItem(key, data[key]);
                }
            });
            return true;
        } catch (e) {
            console.error(e);
            return false;
        }
    }
}

const db = new LocalDB();

/* --- COMPANY MANAGEMENT --- */
function initCompanySystem() {
    let companies = localStorage.getItem('novapack_companies');

    if (!companies) {
        // Migration: Create Default Company
        const defaultId = 'comp_main';
        const defaultCompany = { id: defaultId, name: 'NOVAPACK (Principal)' };
        localStorage.setItem('novapack_companies', JSON.stringify([defaultCompany]));
        localStorage.setItem('novapack_current_company_id', defaultId);

        // Migrate existing tickets data if present
        const oldTickets = localStorage.getItem('novapack_tickets');
        if (oldTickets) {
            localStorage.setItem('novapack_comp_main_tickets', oldTickets);
            // Optional: Remove old? Better keep for safety for now.
        }

        // Migrate Sender
        const oldSender = localStorage.getItem('novapack_default_sender');
        if (oldSender) localStorage.setItem('novapack_comp_main_default_sender', oldSender);

        const oldAddr = localStorage.getItem('novapack_default_sender_address');
        if (oldAddr) localStorage.setItem('novapack_comp_main_default_sender_address', oldAddr);
    }

    // Set active
    db.setCompany(localStorage.getItem('novapack_current_company_id') || 'comp_main');
}

function loadCompanySelector() {
    const selector = document.getElementById('company-selector');
    const companies = JSON.parse(localStorage.getItem('novapack_companies') || '[]');

    selector.innerHTML = '';
    companies.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name;
        if (c.id === db.companyId) opt.selected = true;
        selector.appendChild(opt);
    });
}

function switchCompany(id) {
    localStorage.setItem('novapack_current_company_id', id);
    db.setCompany(id);
    location.reload(); // Simple reload to refresh all data
}

function manageCompanies() {
    const companies = JSON.parse(localStorage.getItem('novapack_companies') || '[]');
    let msg = "EMPRESAS ACTUALES:\n";
    companies.forEach(c => msg += `- ${c.name} (ID: ${c.id})\n`);
    msg += "\n¿Qué deseas hacer?\n1. Crear Nueva Empresa\n2. Renombrar Empresa Actual\n3. Modificar Remitente/Dirección Predeterminados\n4. Eliminar Empresa Actual\n5. Modificar Prefijo de Albaranes\n6. Reiniciar Contador de Albaranes\n7. Configurar Pasarela SMS (API)\n8. Probar Pasarela SMS\n9. Guardar Configuración SMS en Archivo\n10. RESTAURAR DE FABRICA (BORRAR TODO)\n11. Cancelar";

    const choice = prompt(msg);
    if (choice === '1') {
        const newName = prompt("Nombre de la nueva empresa:");
        if (newName && newName.trim()) {
            let newAddress = "";
            while (!newAddress || newAddress.trim().length === 0) {
                newAddress = prompt("Dirección de la Empresa (OBLIGATORIO):");
            }

            const newPhone = prompt("Teléfono de la Empresa (Opcional):") || "";
            const newNif = prompt("NIF/CIF de la Empresa (Opcional):") || "";
            const pickupPhone = prompt("Teléfono del REPARTIDOR (Predeterminado para SMS):") || "";
            const senderNum = prompt("Número de Remitente / Código Empresa (Opcional):") || "";

            // New: Custom Start Number
            const startNumInput = prompt("Número inicial de albarán (Opcional, Intro para empezar en 1):");
            let startNum = 1;
            if (startNumInput && startNumInput.trim().length > 0 && !isNaN(parseInt(startNumInput))) {
                startNum = parseInt(startNumInput);
            }

            const newId = 'comp_' + Date.now();
            companies.push({ id: newId, name: newName.trim() });
            localStorage.setItem('novapack_companies', JSON.stringify(companies));

            // Set default sender data for this company
            localStorage.setItem('novapack_' + newId + '_default_sender', newName.trim());
            localStorage.setItem('novapack_' + newId + '_default_sender_address', newAddress.trim());
            localStorage.setItem('novapack_' + newId + '_default_sender_phone', newPhone.trim());
            localStorage.setItem('novapack_' + newId + '_default_sender_nif', newNif.trim());
            localStorage.setItem('novapack_' + newId + '_pickup_alert_phone', pickupPhone.trim());
            localStorage.setItem('novapack_' + newId + '_sender_number', senderNum.trim());
            localStorage.setItem('novapack_' + newId + '_start_counter', startNum);

            // Set Security PIN (REMOVED)
            // localStorage.setItem('novapack_' + newId + '_pin', "0000");



            if (confirm("¿Cambiar a la nueva empresa ahora?")) {
                switchCompany(newId);
            } else {
                loadCompanySelector();
            }
        }
    } else if (choice === '2') {
        const currentName = getCompanyName(db.companyId);
        const newName = prompt("Nuevo nombre para la empresa:", currentName);
        if (newName && newName.trim()) {
            const index = companies.findIndex(c => c.id === db.companyId);
            if (index !== -1) {
                companies[index].name = newName.trim();
                localStorage.setItem('novapack_companies', JSON.stringify(companies));
                loadCompanySelector();
                alert("Nombre actualizado correctamente.");
            }
        }
    } else if (choice === '3') {
        const keyName = db.getKey('default_sender');
        const keyAddr = db.getKey('default_sender_address');
        const keyPhone = db.getKey('default_sender_phone');

        const currentSender = localStorage.getItem(keyName) || getCompanyName(db.companyId);
        const currentAddr = localStorage.getItem(keyAddr) || "";
        const currentPhone = localStorage.getItem(keyPhone) || "";

        const newSender = prompt("Nombre del Remitente Predeterminado (para nuevos albaranes):", currentSender);
        if (newSender !== null) {
            const newAddr = prompt("Dirección del Remitente Predeterminada:", currentAddr);
            if (newAddr !== null) {
                const newPhone = prompt("Teléfono del Remitente Predeterminado:", currentPhone);
                if (newPhone !== null) {
                    const newNif = prompt("NIF/CIF del Remitente Predeterminado:", localStorage.getItem(db.getKey('default_sender_nif')) || "");
                    const currentPickupPhone = localStorage.getItem(db.getKey('pickup_alert_phone')) || "";
                    const newPickupPhone = prompt("Teléfono del REPARTIDOR (Predeterminado para SMS):", currentPickupPhone);

                    localStorage.setItem(keyName, newSender.trim());
                    localStorage.setItem(keyAddr, newAddr.trim());
                    localStorage.setItem(keyPhone, newPhone.trim());
                    if (newNif !== null) localStorage.setItem(db.getKey('default_sender_nif'), newNif.trim());
                    if (newPickupPhone !== null) localStorage.setItem(db.getKey('pickup_alert_phone'), newPickupPhone.trim());

                    const currentSenderNum = localStorage.getItem(db.getKey('sender_number')) || "";
                    const newSenderNum = prompt("Número de Remitente / Código Empresa:", currentSenderNum);
                    if (newSenderNum !== null) localStorage.setItem(db.getKey('sender_number'), newSenderNum.trim());

                    // Update current view if fields exist
                    const fieldName = document.getElementById('ticket-sender');
                    const fieldAddress = document.getElementById('ticket-sender-address');
                    const fieldPhone = document.getElementById('ticket-sender-phone');

                    if (fieldName) fieldName.value = newSender.trim();
                    if (fieldAddress) fieldAddress.value = newAddr.trim();
                    if (fieldPhone) fieldPhone.value = newPhone.trim();

                    alert("Datos predeterminados actualizados correctamente.");
                }
            }
        }
    } else if (choice === '4') {
        if (companies.length <= 1) {
            alert("No puedes eliminar la única empresa.");
            return;
        }

        const currentName = getCompanyName(db.companyId);
        if (confirm(`¿ELIMINAR EMPRESA "${currentName}" Y TODOS SUS DATOS?\nEsta acción no se puede deshacer.`)) {
            if (prompt("Escribe 'BORRAR' para confirmar:") === 'BORRAR') {
                // Delete data logic could go here but it's complex to clean up all keys
                // For now, just remove from list and switch
                const newCompanies = companies.filter(c => c.id !== db.companyId);
                localStorage.setItem('novapack_companies', JSON.stringify(newCompanies));
                switchCompany(newCompanies[0].id);
            }
        }
    } else if (choice === '5') {
        const key = db.getKey('ticket_prefix');
        const currentPrefix = localStorage.getItem(key) || getInitials(getCompanyName(db.companyId));
        const newPrefix = prompt("Introduce el Prefijo para los albaranes (ej. NOV, EMP1):", currentPrefix);

        if (newPrefix && newPrefix.trim()) {
            localStorage.setItem(key, newPrefix.trim().toUpperCase());
            alert("Prefijo actualizado. Los nuevos albaranes empezarán por: " + newPrefix.trim().toUpperCase());
            resetEditor(); // Refresh UI
        }
    } else if (choice === '6') {
        if (confirm("¿Estás SEGURO de querer reiniciar el contador de albaranes?\nEsto hará que los nuevos albaranes empiecen desde el número 1 (o el que elijas).\n\nATENCIÓN: Si ya existen albaranes con esos números, se podrían crear duplicados.")) {
            const startStr = prompt("Introduce el número por el que quieres empezar:", "1");
            const startNum = parseInt(startStr);

            if (!isNaN(startNum) && startNum > 0) {
                // We set 'start_counter' to the desired number
                localStorage.setItem(db.getKey('start_counter'), startNum);

                // We must also reset 'last_sequence' so getNextId doesn't pick up the old max
                // If we want the NEXT one to be X, we set last_sequence to X-1
                localStorage.setItem(db.getKey('last_sequence'), startNum - 1);

                alert(`Contador reiniciado. El próximo albarán será el número: ${getNextId(getCompanyName(db.companyId))}`);
                resetEditor();
            } else {
                alert("Número inválido.");
            }
        }
    } else if (choice === '7') {
        // SMS Gateway Configuration
        const key = db.getKey('sms_gateway_url');
        const currentUrl = localStorage.getItem(key) || "";

        const explanation = "CONFIGURACIÓN DE PASARELA SMS (API HTTP)\n\n" +
            "Introduce la URL de tu proveedor de SMS (ej. ClickSend, Textlocal, Altiria).\n" +
            "Usa los marcadores {TELEFONO}, {MENSAJE}, {FECHA}, {HORA} y {TURNO} donde correspondan.\n\n" +
            "EJEMPLO:\n" +
            "https://api-mapper.clicksend.com/http/v2/send.php?method=http&username=USER&key=KEY&to={TELEFONO}&message={MENSAJE}&turno={TURNO}\n\n" +
            "Si lo dejas en blanco, se usará la aplicación de SMS predeterminada del sistema.";

        const newUrl = prompt(explanation, currentUrl);

        if (newUrl !== null) {
            localStorage.setItem(key, newUrl.trim());
            alert("Configuración SMS guardada.");
        }
    } else if (choice === '8') {
        // TEST SMS
        const key = db.getKey('sms_gateway_url');
        const url = localStorage.getItem(key);
        if (!url || !url.trim()) {
            alert("No hay una pasarela SMS configurada. Configurala en la opción 7 primero.");
        } else {
            const driverPhone = localStorage.getItem(db.getKey('pickup_alert_phone')) || "";
            const phone = prompt("Confirmar Teléfono del REPARTIDOR para Prueba:", driverPhone.trim());
            if (phone) {
                const now = new Date();
                const fDate = now.getDate().toString().padStart(2, '0') + '/' + (now.getMonth() + 1).toString().padStart(2, '0') + '/' + now.getFullYear();
                const fTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
                const timestamp = `${fDate} ${fTime}`;
                const cleanPhone = phone.trim().replace(/[\s\(\)\-]/g, '');
                let generatedUrl = url.replace(/\{TELEFONO\}/gi, cleanPhone)
                    .replace(/\{MENSAJE\}/gi, encodeURIComponent(msg))
                    .replace(/\{FECHA\}/gi, encodeURIComponent(fDate))
                    .replace(/\{HORA\}/gi, encodeURIComponent(fTime))
                    .replace(/\{TURNO\}/gi, encodeURIComponent("TEST"));

                const finalUrl = prompt("URL Generada (Puedes editarla antes de enviar):", generatedUrl);

                if (finalUrl) {
                    showNotification("Enviando SMS de prueba...", "info");
                    fetch(finalUrl, { mode: 'no-cors' })
                        .then(() => alert("Petición de 'Prueba' enviada a la API.\n\nSi no recibes el SMS, verifica:\n1. Que la URL y Credenciales sean correctas.\n2. Que tengas saldo en el proveedor.\n3. Que el proveedor acepte peticiones desde el navegador (CORS)."))
                        .catch(e => alert("Error enviando petición: " + e));
                }
            }
        }
    } else if (choice === '9') {
        const key = db.getKey('sms_gateway_url');
        const url = localStorage.getItem(key) || "";

        if (url && url.trim()) {
            const blob = new Blob([url], { type: 'text/plain' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'pasarela_sms.txt';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            alert("✅ Archivo 'pasarela_sms.txt' generado.\n\nPor favor, guárdalo en la carpeta del ESCRITORIO llamada 'CLAVES SMS' que acabo de crear para ti.");
        } else {
            alert("⚠️ No hay ninguna URL de SMS configurada para guardar.");
        }
    } else if (choice === '10') {
        if (confirm("⚠️ PELIGRO ⚠️\n\n¿Estás seguro de que deseas RESTAURAR DE FÁBRICA la aplicación?\n\nESTO BORRARÁ TODAS LAS EMPRESAS, ALBARANES, CLIENTES Y CONFIGURACIONES.\n\nEsta acción NO se puede deshacer.")) {
            if (prompt("Para confirmar, escribe: BORRAR TODO") === "BORRAR TODO") {
                localStorage.clear();
                alert("Aplicación restaurada. Se recargará la página.");
                window.location.reload();
            } else {
                alert("Código de confirmación incorrecto. No se ha borrado nada.");
            }
        }
    }
}

function getCompanyName(id) {
    const companies = JSON.parse(localStorage.getItem('novapack_companies') || '[]');
    const c = companies.find(x => x.id === id);
    return c ? c.name : id;
}

/* --- STATE & CONFIG --- */
const defaultWeights = "1kg, 2kg, 5kg, 10kg, 15kg, 20kg, +20kg";
const defaultSizes = "Sobre, Pequeño, Mediano, Grande, Extra Grande, Palet, BATERIA 45AH, BATERIA 75AH, BATERIA 100AH, BATERIA CAMION, LUNA DELANTERA, CAPO, PARAGOLPES EN CAJA, PARAGOLPES, ALETA, FARO, TAMBOR CAMION, CAJAS DE ACEITE O AGUA, NEUMATICOS, GARRAFAS ADBLUE, CALIPER DE CAMION";
let dirHandle = null; // for File System Access API

/* --- INITIALIZATION --- */
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

function initApp() {
    // 1. Initialize Company System (Migration if needed)
    initCompanySystem();

    // 2. Load Company Selector
    loadCompanySelector();

    // 3. Set Welcome Message in Intro
    const introWelcome = document.getElementById('intro-welcome');
    if (introWelcome) {
        const companyName = getCompanyName(db.companyId);
        introWelcome.textContent = `BIENVENIDO ${companyName}`;
    }

    // 1. Sender Check (Once per session)
    checkSender();

    // Set Date Filter to Today by default
    const todayStr = new Date().toISOString().slice(0, 10);
    document.getElementById('date-filter').value = todayStr;

    // 4. Migrate Data if needed (Multiple Addresses)
    migrateClientData();

    // 5. Load initial data
    loadTickets();
    loadClients();

    // Recover linked backup folder
    if (typeof idb !== 'undefined') {
        idb.get('backup_folder').then(handle => {
            if (handle) backupDirHandle = handle;
        });
    }

    // Event Listeners
    setupEventListeners();

    // Check URL for ticket
    const urlParams = new URLSearchParams(window.location.search);
    const tid = urlParams.get('ticketId');
    if (tid) setTimeout(() => loadEditor(tid), 500);

    // Auto-reload every 10 minutes to sync with terminal clock
    setInterval(() => {
        window.location.reload();
    }, 10 * 60 * 1000); // 10 minutes

    // Initialize Editor State
    if (!tid) resetEditor();
}

function migrateClientData() {
    const clients = db.getAll('destinations');
    if (clients.length === 0) return;

    // Check if already migrated
    const isNewFormat = clients.every(c => Array.isArray(c.addresses));
    if (isNewFormat) return;

    console.log("Migrating clients to multiple addresses format...");
    const grouped = {};
    clients.forEach(c => {
        const name = (c.name || "CLIENTE SIN NOMBRE").trim();
        if (!grouped[name]) {
            grouped[name] = {
                id: "cli_" + Date.now() + Math.floor(Math.random() * 1000),
                name: name,
                phone: c.phone || "",
                addresses: []
            };
        }

        // Add address if not already present for this name
        const addrStr = (c.address || "").trim();
        const alreadyHas = grouped[name].addresses.find(a => a.address.trim() === addrStr);

        if (!alreadyHas && addrStr) {
            grouped[name].addresses.push({
                id: "addr_" + Date.now() + Math.floor(Math.random() * 1000),
                address: addrStr,
                street: c.street || "",
                number: c.number || "",
                province: c.province || ""
            });
        }

        // Use latest phone if available
        if (c.phone) grouped[name].phone = c.phone;
    });

    db.save('destinations', Object.values(grouped));
    console.log("Migration complete.");
}

function checkSender() {
    // Current company sender logic
    // Key depends on selected company
    // Current company sender logic
    // Key depends on selected company
    const keyName = db.getKey('default_sender');
    const keyAddr = db.getKey('default_sender_address');
    const keyPhone = db.getKey('default_sender_phone');

    const savedName = localStorage.getItem(keyName);
    const savedAddress = localStorage.getItem(keyAddr);
    // savedPhone not explicitly saved in var but used directly

    // Only prompt if we have NO Sender set for THIS company
    if (!savedName) {
        // If it's the very first time ever, we might prompt
        // But better to just default to the Company Name if possible
        const companyName = getCompanyName(db.companyId);

        // If user hasn't set it, use Company Name as default
        localStorage.setItem(keyName, companyName);
    }

    // Set fields if they exist
    const fieldName = document.getElementById('ticket-sender');
    const fieldAddress = document.getElementById('ticket-sender-address');
    const fieldPhone = document.getElementById('ticket-sender-phone');

    if (fieldName) fieldName.value = localStorage.getItem(keyName) || '';
    if (fieldAddress) fieldAddress.value = localStorage.getItem(keyAddr) || '';
    if (fieldPhone) fieldPhone.value = localStorage.getItem(keyPhone) || '';
}

function setupEventListeners() {
    // Search & Filter
    document.getElementById('ticket-search').addEventListener('input', (e) => loadTickets(e.target.value));
    document.getElementById('date-filter').addEventListener('change', () => loadTickets());

    // Form Submit
    document.getElementById('create-ticket-form').addEventListener('submit', handleFormSubmit);

    // Company Management
    document.getElementById('company-selector').addEventListener('change', (e) => switchCompany(e.target.value));
    document.getElementById('btn-manage-companies').addEventListener('click', manageCompanies);

    // Editor Actions
    document.getElementById('action-new').addEventListener('click', resetEditor);

    // Packages
    document.getElementById('btn-add-package').addEventListener('click', () => addPackageRow());

    // Client Picker
    // Client Picker
    // Client Picker (Searchable Input)
    // Client Picker (Searchable Input)
    const clientPickerInput = document.getElementById('client-picker');
    const clientPickerResults = document.getElementById('client-picker-results');
    let pickerHighlightIndex = -1;

    function updatePickerHighlight() {
        const items = clientPickerResults.querySelectorAll('.suggestion-item');
        items.forEach((item, index) => {
            if (index === pickerHighlightIndex) {
                item.style.backgroundColor = '#eefbff';
                item.style.borderLeft = '4px solid #FF6600';
                item.scrollIntoView({ block: 'nearest' });
            } else {
                item.style.backgroundColor = '#fff';
                item.style.borderLeft = '4px solid transparent';
            }
        });
    }

    clientPickerInput.addEventListener('keydown', (e) => {
        const items = clientPickerResults.querySelectorAll('.suggestion-item');
        if (clientPickerResults.style.display === 'none' || items.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            pickerHighlightIndex++;
            if (pickerHighlightIndex >= items.length) pickerHighlightIndex = 0;
            updatePickerHighlight();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            pickerHighlightIndex--;
            if (pickerHighlightIndex < 0) pickerHighlightIndex = items.length - 1;
            updatePickerHighlight();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (pickerHighlightIndex > -1 && items[pickerHighlightIndex]) {
                items[pickerHighlightIndex].click();
            }
        } else if (e.key === 'Escape') {
            clientPickerResults.style.display = 'none';
            pickerHighlightIndex = -1;
        }
    });

    clientPickerInput.addEventListener('input', () => {
        const q = clientPickerInput.value.toLowerCase();
        pickerHighlightIndex = -1; // Reset on new search

        if (q.length < 1) {
            clientPickerResults.style.display = 'none';
            return;
        }

        const clients = db.getAll('destinations');
        const matches = [];

        clients.forEach(c => {
            if (c.name.toLowerCase().includes(q)) {
                c.addresses.forEach(a => {
                    matches.push({ ...c, ...a, clientId: c.id, addressId: a.id });
                });
            } else {
                c.addresses.forEach(a => {
                    if (a.address.toLowerCase().includes(q)) {
                        matches.push({ ...c, ...a, clientId: c.id, addressId: a.id });
                    }
                });
            }
        });

        matches.sort((a, b) => {
            const aName = a.name.toLowerCase();
            const bName = b.name.toLowerCase();
            const aStarts = aName.startsWith(q);
            const bStarts = bName.startsWith(q);
            if (aStarts && !bStarts) return -1;
            if (!aStarts && bStarts) return 1;
            return aName.localeCompare(bName);
        });

        clientPickerResults.innerHTML = '';
        if (matches.length > 0) {
            clientPickerResults.style.display = 'block';
            matches.forEach((c, index) => {
                const div = document.createElement('div');
                div.className = 'suggestion-item';
                div.style.padding = '8px';
                div.style.cursor = 'pointer';
                div.style.borderBottom = '1px solid var(--border-glass)';
                div.style.borderLeft = '4px solid transparent';

                div.innerHTML = `<strong>${c.name}</strong><br><span style="font-size:0.8rem; color:var(--text-dim);">${c.address || ''}</span>`;

                div.onclick = () => {
                    document.getElementById('ticket-receiver').value = c.name;
                    if (c.street) {
                        document.getElementById('ticket-address').value = c.street;
                        document.getElementById('ticket-number').value = c.number || '';
                    } else {
                        document.getElementById('ticket-address').value = c.address;
                        document.getElementById('ticket-number').value = '';
                    }
                    document.getElementById('ticket-phone').value = c.phone || "";

                    if (c.province) {
                        const provSel = document.getElementById('ticket-province');
                        if (provSel.querySelector(`option[value="${c.province}"]`)) {
                            provSel.value = c.province;
                        }
                    }

                    clientPickerInput.value = "";
                    clientPickerResults.style.display = 'none';
                    pickerHighlightIndex = -1;
                };
                clientPickerResults.appendChild(div);
            });
        } else {
            clientPickerResults.style.display = 'none';
        }
    });

    // Close picker on outside click
    document.addEventListener('click', (e) => {
        if (e.target !== clientPickerInput) clientPickerResults.style.display = 'none';
    });



    // Backup / Restore
    // Elegant Intro Animation
    const intro = document.getElementById('app-intro');
    if (intro) {
        setTimeout(() => {
            intro.classList.add('fade-out');
            setTimeout(() => {
                intro.style.display = 'none';
            }, 800);
        }, 3000);
    }

    document.getElementById('btn-export').addEventListener('click', exportData);
    document.getElementById('btn-import').addEventListener('click', () => document.getElementById('import-file').click());
    document.getElementById('import-file').addEventListener('change', importData);

    // Elegant Outro on Page Leave
    window.addEventListener('beforeunload', () => {
        const outro = document.getElementById('app-outro');
        if (outro) {
            outro.classList.remove('hidden');
        }
    });

    // Exit Button Logic
    document.getElementById('btn-exit').addEventListener('click', () => {
        // Trigger automatic backup
        exportData();

        const outro = document.getElementById('app-outro');
        if (outro) {
            outro.classList.remove('hidden');
            // Give time for the animation before attempting to close
            setTimeout(() => {
                // Technique to try and bypass "Close site?" prompt
                window.open('', '_self', '');
                window.close();
                // Fallback if window.close() is blocked
                window.location.href = "about:blank";
            }, 4000); // Slightly longer to allow the download to start
        }
    });

    // Auto-search Suggestions
    const receiverInput = document.getElementById('ticket-receiver');
    const suggestionsBox = document.getElementById('suggestions-box');

    receiverInput.addEventListener('input', () => {
        const val = receiverInput.value.toLowerCase();
        if (val.length < 1) { suggestionsBox.style.display = 'none'; return; }

        const allClients = db.getAll('destinations');
        const matches = [];
        allClients.forEach(c => {
            c.addresses.forEach(a => {
                if (c.name.toLowerCase().includes(val) || a.address.toLowerCase().includes(val)) {
                    matches.push({ ...c, ...a });
                }
            });
        });

        // Sort: startsWith first, then everything else
        matches.sort((a, b) => {
            const aName = a.name.toLowerCase();
            const bName = b.name.toLowerCase();
            const aStarts = aName.startsWith(val);
            const bStarts = bName.startsWith(val);
            if (aStarts && !bStarts) return -1;
            if (!aStarts && bStarts) return 1;
            return aName.localeCompare(bName);
        });

        suggestionsBox.innerHTML = '';
        if (matches.length > 0) {
            suggestionsBox.style.display = 'block';
            matches.forEach(c => {
                const div = document.createElement('div');
                div.className = 'suggestion-item';
                // Show Name AND Address
                div.innerHTML = `<strong>${c.name}</strong><br><span style="font-size:0.8rem; color:var(--text-dim);">${c.address}</span>`;
                div.onclick = () => {
                    receiverInput.value = c.name;
                    document.getElementById('ticket-address').value = c.address;
                    document.getElementById('ticket-phone').value = c.phone || "";
                    if (c.province) {
                        const provSel = document.getElementById('ticket-province');
                        if (provSel.querySelector(`option[value="${c.province}"]`)) {
                            provSel.value = c.province;
                        }
                    }
                    suggestionsBox.style.display = 'none';
                };
                suggestionsBox.appendChild(div);
            });
        } else {
            suggestionsBox.style.display = 'none';
        }
    });

    document.addEventListener('click', (e) => {
        if (e.target !== receiverInput) suggestionsBox.style.display = 'none';
    });

    // Batch Print logic
    // Batch Print logic
    document.getElementById('btn-print-morning').addEventListener('click', () => printShiftBatch('MAÑANA'));
    document.getElementById('btn-print-afternoon').addEventListener('click', () => printShiftBatch('TARDE'));
    document.getElementById('btn-print-manifest-only').addEventListener('click', printManifestOnly);
    document.getElementById('btn-print-labels-morning').addEventListener('click', () => printLabelShiftBatch('MAÑANA'));
    document.getElementById('btn-print-labels-afternoon').addEventListener('click', () => printLabelShiftBatch('TARDE'));

    // --- PROVINCE LOGIC ---
    const provinceSel = document.getElementById('ticket-province');
    provinceSel.addEventListener('change', () => {
        if (provinceSel.value === 'create_new') {
            const newProv = prompt("Introduce el nombre de la nueva Provincia/Zona:");
            if (newProv && newProv.trim()) {
                const clean = newProv.trim();
                let saved = db.getAll('provinces');
                if (!saved) saved = [];
                if (!saved.includes(clean)) {
                    saved.push(clean);
                    saved.sort(); // Keep alphabetical
                    db.save('provinces', saved);
                }
                loadProvinces(clean); // Reload and select new
            } else {
                provinceSel.value = "";
            }
        }
    });

    // Delete Province Logic
    document.getElementById('btn-delete-province').addEventListener('click', () => {
        const sel = document.getElementById('ticket-province');
        const val = sel.value;

        if (!val || val === 'create_new') return;

        if (confirm(`¿Eliminar la provincia "${val}" de la lista?`)) {
            // Check if default
            if (DEFAULT_ZONES.includes(val)) {
                // Add to deleted defaults list
                const deleted = db.getAll('provinces_deleted') || [];
                if (!deleted.includes(val)) {
                    deleted.push(val);
                    db.save('provinces_deleted', deleted);
                }
            } else {
                // Remove from custom list
                let saved = db.getAll('provinces') || [];
                const newSaved = saved.filter(p => p !== val);
                db.save('provinces', newSaved);
            }

            loadProvinces(); // Reload
            alert("Provincia eliminada.");
        }
    });

    // Initial Load
    loadProvinces();

    // Focus Tracking for "Synchronized Scroll"
    document.getElementById('create-ticket-form').addEventListener('focusin', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') {
            const editor = document.querySelector('.ticket-editor');
            if (editor) {
                const rect = e.target.getBoundingClientRect();
                const editorRect = editor.getBoundingClientRect();

                // If the element is too close to bottom or top of editor view
                if (rect.bottom > editorRect.bottom - 40 || rect.top < editorRect.top + 40) {
                    e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }
        }
    });

    // --- CLIENTS NAVIGATION & LOGIC ---
    // --- NAVIGATION LOGIC ---
    const views = ['dashboard-view', 'clients-view', 'reports-view'];
    const hideAllViews = () => views.forEach(id => document.getElementById(id).classList.add('hidden'));

    document.getElementById('nav-home').addEventListener('click', (e) => {
        // Prevent if clicking buttons inside header like New/Print
        if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;

        hideAllViews();
        document.getElementById('dashboard-view').classList.remove('hidden');
    });

    document.getElementById('nav-clients').addEventListener('click', (e) => {
        e.preventDefault();
        hideAllViews();
        document.getElementById('clients-view').classList.remove('hidden');
        renderClientsList();
    });

    /* --- CLIENTS LOGIC --- */
    document.getElementById('client-view-search').addEventListener('input', (e) => renderClientsList(e.target.value));
    document.getElementById('btn-client-save').addEventListener('click', saveClientFromManager);
    document.getElementById('btn-client-new').addEventListener('click', resetClientManager);
    document.getElementById('btn-client-delete').addEventListener('click', deleteClientFromManager);
    document.getElementById('btn-client-exit').addEventListener('click', () => {
        document.getElementById('clients-view').classList.add('hidden');
        document.getElementById('dashboard-view').classList.remove('hidden');
    });
    document.getElementById('btn-add-address-row').addEventListener('click', () => addAddressRowToEditor());

    // Bulk Delete Listeners
    document.getElementById('client-select-all').addEventListener('change', toggleSelectAllClients);
    document.getElementById('btn-delete-selected-clients').addEventListener('click', deleteSelectedClients);

    /* --- REPORTS NAVIGATION --- */
    document.getElementById('nav-reports').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('dashboard-view').classList.add('hidden');
        document.getElementById('clients-view').classList.add('hidden');
        document.getElementById('reports-view').classList.remove('hidden');

        // Set default dates (Current Month)
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        document.getElementById('report-date-start').valueAsDate = firstDay;
        document.getElementById('report-date-end').valueAsDate = now;

        runReport();
    });

    document.getElementById('btn-close-reports').addEventListener('click', () => {
        document.getElementById('reports-view').classList.add('hidden');
        document.getElementById('dashboard-view').classList.remove('hidden');
    });

    if (document.getElementById('btn-close-clients')) {
        document.getElementById('btn-close-clients').addEventListener('click', () => {
            document.getElementById('clients-view').classList.add('hidden');
            document.getElementById('dashboard-view').classList.remove('hidden');
        });
    }

    document.getElementById('btn-run-report').addEventListener('click', runReport);
    document.getElementById('btn-export-csv').addEventListener('click', exportReportCSV);


    const btnSetBackup = document.getElementById('btn-set-backup-folder');
    if (btnSetBackup) btnSetBackup.addEventListener('click', setupBackupFolder);
}


/* --- REPORTS LOGIC --- */
let currentReportData = [];

function runReport() {
    const clientTerm = document.getElementById('report-client').value.toLowerCase();
    const startDate = document.getElementById('report-date-start').value;
    const endDate = document.getElementById('report-date-end').value;

    let tickets = db.getAll('tickets');

    // Filter
    currentReportData = tickets.filter(t => {
        const tDate = t.createdAt.split('T')[0]; // YYYY-MM-DD
        let matchesDate = true;
        if (startDate && tDate < startDate) matchesDate = false;
        if (endDate && tDate > endDate) matchesDate = false;

        let matchesClient = true;
        if (clientTerm) {
            const q = clientTerm.toLowerCase();
            const idClean = (t.id || "").toLowerCase().replace(/[^a-z0-9]/g, '');
            const qClean = q.replace(/[^a-z0-9]/g, '');

            matchesClient = t.receiver.toLowerCase().includes(q) ||
                t.address.toLowerCase().includes(q) ||
                (t.id || "").toLowerCase().includes(q) ||
                idClean.includes(qClean);
        }

        return matchesDate && matchesClient;
    });

    // Sort by Date DESC
    currentReportData.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Render
    const tbody = document.getElementById('report-results');
    const emptyMsg = document.getElementById('report-empty');
    const countSpan = document.getElementById('report-total-count');

    tbody.innerHTML = '';
    countSpan.textContent = currentReportData.length;

    if (currentReportData.length === 0) {
        emptyMsg.style.display = 'block';
        return;
    }
    emptyMsg.style.display = 'none';

    currentReportData.forEach(t => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = "1px solid #ddd";

        // Calculate totals
        const pkgs = t.packagesList ? t.packagesList.reduce((s, p) => s + (parseInt(p.qty) || 1), 0) : t.packages;
        const weight = t.packagesList ? t.packagesList.reduce((s, p) => s + ((parseFloat(p.weight) || 0) * (parseInt(p.qty) || 1)), 0).toFixed(2) : '0.00';

        tr.innerHTML = `
            <td style="padding:10px; font-weight:bold;">${t.id}</td>
            <td style="padding:10px;">${new Date(t.createdAt).toLocaleDateString()}</td>
            <td style="padding:10px;">${t.receiver}</td>
            <td style="padding:10px; font-size:0.85rem; color:#A0A5AD;">${t.province || 'S/P'}</td>
            <td style="padding:10px; text-align:center;">${pkgs}</td>
            <td style="padding:10px; text-align:center;">${weight} kg</td>
            <td style="padding:10px; text-align:center;">
                <span style="padding:2px 6px; border-radius:4px; font-size:0.75rem; font-weight:bold; background:${t.shippingType === 'Pagados' ? 'rgba(52, 199, 89, 0.1)' : 'rgba(255, 102, 0, 0.1)'}; color:${t.shippingType === 'Pagados' ? '#34C759' : '#FF6600'}; border: 1px solid ${t.shippingType === 'Pagados' ? '#34C759' : '#FF6600'};">
                    ${(t.shippingType || 'Pagados').toUpperCase()}
                </span>
            </td>
            <td style="padding:10px; text-align:center;">
                <span style="padding:2px 6px; border-radius:4px; font-size:0.8rem; background:${t.printed ? 'rgba(52, 199, 89, 0.1)' : 'rgba(255, 59, 48, 0.1)'}; color:${t.printed ? '#34C759' : '#FF3B30'};">
                    ${t.printed ? '✅ IMPRESO' : '⏳ PEND.'}
                </span>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function exportReportCSV() {
    if (currentReportData.length === 0) {
        alert("No hay datos para exportar.");
        return;
    }

    // CSV Header
    let csvContent = "ID;FECHA;REMITENTE;DESTINATARIO;DIRECCION;TELEFONO;PROVINCIA;BULTOS;PESO;PORTES;OBSERVACIONES;HORARIO\n";

    currentReportData.forEach(t => {
        // Safe strings for CSV
        const safe = (str) => (str || "").replace(/;/g, ",").replace(/\n/g, " ");

        const pkgs = t.packagesList ? t.packagesList.reduce((s, p) => s + (parseInt(p.qty) || 1), 0) : t.packages;
        const weight = t.packagesList ? t.packagesList.reduce((s, p) => s + ((parseFloat(p.weight) || 0) * (parseInt(p.qty) || 1)), 0).toFixed(2) : '0.00';
        const date = new Date(t.createdAt).toLocaleDateString();

        csvContent += `${t.id};${date};${safe(t.sender)};${safe(t.receiver)};${safe(t.address)};${safe(t.phone)};${safe(t.province)};${pkgs};${weight};${t.shippingType};${safe(t.notes)};${safe(t.timeSlot)}\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `reporte_albaranes_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

const DEFAULT_ZONES = [
    "MALAGA", "GRANADA", "SEVILLA", "CORDOBA", "VELEZ-MALAGA",
    "TORRE DEL MAR", "ALGARROBO", "NERJA", "TORROX COSTA", "LOJA",
    "BANAMEJI", "LUCENA", "ANTEQUERA", "MOLLINA", "PUENTE GENIL",
    "FUENTE DE PIEDRA", "ESTEPONA", "MARBELLA", "TORREMOLINOS",
    "FUENGIROLA", "MIJAS", "BENALMADENA",
    "ALCALA DE GUADAIRA", "CABRA", "F.VAQUEROS", "ARCHIDONA",
    "ALBOLOTE", "N.ANDALAUCIA", "SAN PEDRO"
];

function loadProvinces(selectedVal = null) {
    const provinceSel = document.getElementById('ticket-province');
    let saved = db.getAll('provinces') || [];
    let deleted = db.getAll('provinces_deleted') || [];

    // Merge defaults with saved, remove duplicates
    let all = [...new Set([...DEFAULT_ZONES, ...saved])];

    // Filter out deleted ones
    all = all.filter(p => !deleted.includes(p));
    all.sort();

    let html = '<option value="">-- Seleccionar --</option>';
    all.forEach(p => {
        html += `<option value="${p}">${p}</option>`;
    });
    html += '<option value="create_new" style="color:var(--brand-primary); font-weight:bold;">+ Crear Nueva Provincia...</option>';

    provinceSel.innerHTML = html;
    if (selectedVal) provinceSel.value = selectedVal;
}

// ... existing code ...

// function generateQRData Removed


function renderQRCodesInPrintArea() {
    const containers = document.querySelectorAll('#print-area .ticket-qr-code');
    containers.forEach(container => {
        const id = container.dataset.id;
        if (!id) return;
        const t = db.getOne('tickets', id);
        if (!t) return;

        // Calculate totals
        const pkgs = t.packagesList ? t.packagesList.reduce((s, p) => s + (parseInt(p.qty) || 1), 0) : (parseInt(t.packages) || 1);
        const weight = t.packagesList ? t.packagesList.reduce((s, p) => s + ((parseFloat(p.weight) || 0) * (parseInt(p.qty) || 1)), 0) : (parseFloat(t.weight) || 0);

        // Prepare detailed items list
        let detailedItems = [];
        if (t.packagesList && t.packagesList.length > 0) {
            detailedItems = t.packagesList.map(p => ({
                q: parseInt(p.qty) || 1,
                s: p.size || 'Bulto',
                w: parseFloat(p.weight) || 0
            }));
        } else {
            // Legacy fallback
            detailedItems.push({
                q: parseInt(t.packages) || 1,
                s: t.size || 'Bulto',
                w: parseFloat(t.weight) || 0
            });
        }

        // Compact Data for QR (to ensure it fits in a small code)
        const senderNum = localStorage.getItem(db.getKey('sender_number')) || "";
        const data = {
            id: t.id,
            sn: senderNum, // Sender Number / Code
            d: t.createdAt ? t.createdAt.split('T')[0] : '', // Date only
            r: t.receiver,
            a: t.address,
            p: t.phone || '',
            v: t.province || '',
            k: pkgs,
            w: weight.toFixed(2),
            s: t.shippingType || 'Pagados',
            c: t.cod || '',
            n: t.notes || ''
        };

        // Clear previous content just in case
        container.innerHTML = '';

        try {
            // Check if it's inside a label to use a smaller size
            const isLabel = container.closest('.label-item');
            const qrSize = isLabel ? 100 : 140;

            // Use the prefixed format for better scanner compatibility
            // Including full data for detail retrieval
            const qrText = "TICKET_ID:" + JSON.stringify(data);

            new QRCode(container, {
                text: qrText,
                width: qrSize,
                height: qrSize,
                colorDark: "#000000",
                colorLight: "#ffffff",
                correctLevel: 0 // Level L (better for large data)
            });
        } catch (e) {
            console.error("QR Error", e);
            container.innerHTML = "Error QR";
        }
    });
}

/* --- PRINTING SYSTEM --- */
function generateTicketHTML(t, footerLabel) {
    const date = new Date(t.createdAt).toLocaleDateString() + " " + new Date(t.createdAt).toLocaleTimeString();

    // Grouped Package List Logic (One line per UI row)
    let displayList = [];
    if (t.packagesList && t.packagesList.length > 0) {
        displayList = t.packagesList;
    } else {
        // Legacy support
        displayList = [{
            qty: parseInt(t.packages) || 1,
            weight: t.weight,
            size: t.size
        }];
    }

    // Check if COD (Reembolso) exists and is not zero
    const hasCod = t.cod && t.cod.toString().trim() !== '' && t.cod.toString() !== '0';

    let rowsHtml = '';
    displayList.forEach((p) => {
        // Handle "10 kg" string vs "10" number
        let w = p.weight;
        if (typeof w === 'number') w = w + " kg";
        if (typeof w === 'string' && !w.includes('kg')) w = w + " kg";

        const qty = p.qty || 1;

        rowsHtml += `
            <tr>
               <td style="border: 1px solid #000; padding: 1px 3px; text-align: center; font-size: 8pt;">${qty}</td>
               <td style="border: 1px solid #000; padding: 1px 3px; text-align: center; font-size: 8pt;">${w}</td>
               <td style="border: 1px solid #000; padding: 1px 3px; text-align: center; font-size: 8pt;">${p.size || 'Bulto'}</td>
               <td style="border: 1px solid #000; padding: 1px 3px; text-align: center; font-size: 8pt;">${t.shippingType}</td>
               ${hasCod ? `<td style="border: 1px solid #000; padding: 1px 3px; text-align: center; font-size: 8pt;">${t.cod} €</td>` : ''}
            </tr>
        `;
    });

    return `
    <div style="font-family: Arial, sans-serif; padding: 5px; border: 2px solid #000; min-height: 100mm; height: auto; position: relative; page-break-after: auto; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between; print-color-adjust: exact; -webkit-print-color-adjust: exact;">
        <!-- Watermark (Province/Zone) -->
        ${t.province ? `<div style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%) rotate(-45deg); font-size:5rem; color:#000; font-weight:900; white-space:nowrap; z-index:0; pointer-events:none; width: 100%; text-align: center; font-family: 'Arial Black', sans-serif; opacity: 0.06; overflow: hidden; text-transform: uppercase;">${t.province}</div>` : ''}
        
        <div style="z-index: 2;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 10px; position:relative;">
                <!-- Left: Logo -->
                <div style="flex: 1;">
                    <div style="font-family: 'Xenotron', sans-serif; font-size: 24pt; color: #FF6600; line-height: 1;">NOVAPACK</div>
                    <div style="font-size: 0.7rem; letter-spacing: 0.5px; color:#333; margin-top: 2px;">administracion@novapack.info</div>
                </div>

                <!-- Center: Zona Reparto -->
                <div style="flex: 1; text-align: center; padding: 0 10px;">
                     <div style="border: 2px solid #FF6600; padding: 5px; background:#FFF; display: inline-block; min-width: 140px; border-radius: 5px;">
                        <div style="font-size: 0.65rem; font-weight: 800; text-transform:uppercase; border-bottom:1px solid #FF6600; margin-bottom:2px; color:#555;">ZONA DE REPARTO</div>
                        <div style="font-size: 1.6rem; font-weight: 900; color: #FF6600; text-transform:uppercase; line-height: 1.1;">
                            ${t.province || '&nbsp;'}
                        </div>
                        <div style="font-size: 0.95rem; font-weight: 900; text-transform:uppercase; color: #000; margin-top: 2px;">
                            PORTES: ${t.shippingType.toUpperCase()}
                        </div>
                        <div style="font-size: 1.1rem; font-weight: 900; color: #000; text-transform:uppercase; border-top:1px solid #FF6600; margin-top:2px; padding-top:2px;">
                            ${t.timeSlot || 'MAÑANA'}
                        </div>
                     </div>
                </div>

                <!-- QR Code (Now on BOTH Copies for scanning) -->
                <div style="display:flex; justify-content:center; align-items:center; padding: 0 10px;">
                     <div class="ticket-qr-code" data-id="${t.id}"></div>
                </div>

                <!-- Right: Ticket Info -->
                <div style="flex: 1; text-align: right;">
                    <div style="font-size: 14pt; font-weight: bold; color: #000;">Albarán: <span style="color: #FF6600;">${t.id}</span></div>
                    <div style="font-size: 1.2rem; font-weight: 900; color: #000; text-transform: uppercase; margin: 3px 0; border: 2px solid #000; display: inline-block; padding: 2px 8px; border-radius: 4px; background: #FFF;">
                         ${t.timeSlot || 'MAÑANA'}
                    </div>
                    <div style="font-size: 0.85rem; color:#444; margin-top:2px;">${date}</div>
                    <div style="margin-top: 4px; border: 1px solid #000; padding: 1px 5px; background:#FFF; display: inline-block; border-radius: 3px;">
                        <span style="font-size: 0.6rem; font-weight: 700; color:#000;">PORTES:</span>
                        <span style="font-size: 0.8rem; font-weight: 900; color: #000;">${t.shippingType}</span>
                     </div>
                </div>
            </div>
            
            <div style="margin-top: 10px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; position:relative;">
                <div style="border: 1px solid #ccc; padding: 5px; font-size: 0.8rem;">
                    <strong>REMITENTE:</strong><br>
                    <span style="font-weight: normal;">${t.sender}</span><br>
                    <span style="font-weight: bold;">${t.senderAddress || ''}</span><br>
                    <span style="font-weight: normal;">${t.senderPhone ? `Telf: ${t.senderPhone}` : ''}</span>
                </div>
                <div style="border: 1px solid #000; padding: 5px; font-size: 10pt;">
                    <strong>DESTINATARIO:</strong><br>
                    <div style="font-weight:normal; font-size:1.1em;">${t.receiver}</div>
                    <div style="font-weight:bold;">${t.address}</div>
                </div>
            </div>

            <table style="width: 100%; margin-top: 10px; border-collapse: collapse; border: 1px solid #000;">
                <thead>
                    <tr style="background: #000; color: #FFF; print-color-adjust: exact; -webkit-print-color-adjust: exact;">
                        <th style="border: 1px solid #000; padding: 1px; font-size: 0.7rem;">BULTOS</th>
                        <th style="border: 1px solid #000; padding: 1px; font-size: 0.7rem;">PESO</th>
                        <th style="border: 1px solid #000; padding: 1px; font-size: 0.7rem;">MEDIDA</th>
                        <th style="border: 1px solid #000; padding: 1px; font-size: 0.7rem;">PORTES</th>
                        ${hasCod ? '<th style="border: 1px solid #000; padding: 1px; font-size: 0.7rem;">REEMBOLSO</th>' : ''}
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>

            <!-- Total Summary -->
            <div style="margin-top: 5px; border: 2px solid #000; padding: 5px; background:#f9f9f9; display:flex; justify-content:space-around; font-weight:bold; font-size:1rem;">
                <span>TOTAL BULTOS: ${displayList.reduce((sum, p) => sum + (parseInt(p.qty) || 1), 0)}</span>
                <span>TOTAL PESO: ${displayList.reduce((sum, p) => sum + ((parseFloat(p.weight) || 0) * (parseInt(p.qty) || 1)), 0).toFixed(2)} kg</span>
            </div>

             <div style="margin-top: 5px; border: 1px solid #ccc; padding: 2px 5px; font-size: 0.75rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                <strong>Observaciones:</strong> ${t.notes}
            </div>
        </div>

        <div style="margin-top: 5px; font-size: 0.7rem; width: 100%; display: flex; justify-content: flex-end; padding-right: 10px;">
            <div style="text-align:right;">
                <span>Firma y Sello:</span><br>
                <span style="font-weight: bold; text-transform: uppercase;">${footerLabel}</span>
            </div>
        </div>
    </div>
    `;
}

function printTicket(id) {
    const t = db.getOne('tickets', id);
    if (!t) return;

    db.update('tickets', id, { printed: true });
    loadTickets(document.getElementById('ticket-search').value);

    const printArea = document.getElementById('print-area');

    // Generate 2 copies with different footers
    const copy1 = generateTicketHTML(t, "Ejemplar para el Cliente");
    const copy2 = generateTicketHTML(t, "Ejemplar para Administración");

    let finalHtml = `
        <div style="height: 275mm; width: 94%; margin: 0 auto; margin-left:6mm; margin-top:3mm; display: grid; grid-template-rows: 1fr 1fr; gap: 0; box-sizing: border-box;">
            <div style="display: flex; flex-direction: column; justify-content: flex-start; padding-top: 5px; padding-bottom: 5px; border-bottom: 1px dashed #000; overflow: hidden;">
                ${copy2}
            </div>
            <div style="display: flex; flex-direction: column; justify-content: flex-start; padding-top: 5px; overflow: hidden;">
                ${copy1}
            </div>
        </div>
    `;

    // Ask if they want the manifest ONLY if it's the first time printing (not a reprint)
    // User requested "reimprimir solo individualmente" for already printed tickets
    if (!t.printed && confirm("¿Deseas imprimir también el Manifiesto para este albarán?")) {
        const manifestHtml = generateManifestHTML([t]);
        finalHtml += manifestHtml;
    }

    printArea.innerHTML = finalHtml;

    renderQRCodesInPrintArea();

    setTimeout(() => window.print(), 500);
}

function generateManifestHTML(tickets) {
    const today = new Date().toLocaleDateString();

    // Split tickets by Time Slot
    const morningTickets = tickets.filter(t => t.timeSlot === 'MAÑANA');
    const afternoonTickets = tickets.filter(t => t.timeSlot === 'TARDE');

    // Helper to generate a table for a subset of tickets
    function generateTableHTML(subset, title) {
        if (subset.length === 0) return '';

        // Check columns availability
        const hasCOD = subset.some(t => t.cod && parseFloat(t.cod) > 0);
        const hasNotes = subset.some(t => t.notes && t.notes.trim().length > 0);

        let rows = '';
        let totalPackages = 0;
        let totalWeight = 0;

        subset.forEach(t => {
            const pkgs = t.packagesList ? t.packagesList.reduce((s, p) => s + (parseInt(p.qty) || 1), 0) : (parseInt(t.packages) || 1);
            const weight = t.packagesList ? t.packagesList.reduce((s, p) => s + ((parseFloat(p.weight) || 0) * (parseInt(p.qty) || 1)), 0) : (parseFloat(t.weight) || 0);

            totalPackages += pkgs;
            totalWeight += weight;

            // Format Address - REMOVED from view but kept in variable if needed later
            // const fullAddress = `${t.address} ${t.city || ''}`.trim();

            // Format Content (Articles)
            let contentStr = '';
            if (t.packagesList && t.packagesList.length > 0) {
                const items = {};
                t.packagesList.forEach(p => {
                    const size = p.size || 'Bulto';
                    const qty = parseInt(p.qty) || 1;
                    items[size] = (items[size] || 0) + qty;
                });
                contentStr = Object.entries(items).map(([name, count]) => `${count}x ${name}`).join(', ');
            } else {
                contentStr = `${t.packages || 1}x Bulto`;
            }

            rows += `
                <tr>
                    <td style="border: 1px solid #999; padding: 4px; text-align: center;">${t.id}</td>
                    <td style="border: 1px solid #999; padding: 4px;">${t.receiver}</td>
                    <td style="border: 1px solid #999; padding: 4px; font-size: 0.85rem;">${contentStr}</td>
                    <td style="border: 1px solid #999; padding: 4px; text-align: center;">${pkgs}</td>
                    <td style="border: 1px solid #999; padding: 4px; text-align: center;">${weight.toFixed(2)}</td>
                    <td style="border: 1px solid #999; padding: 4px; text-align: center; font-weight:bold;">${t.shippingType === 'Debidos' ? 'D' : 'P'}</td>
                    ${hasCOD ? `<td style="border: 1px solid #999; padding: 4px; text-align: center; font-weight:bold; color:red;">${(t.cod && parseFloat(t.cod) > 0) ? t.cod + ' €' : ''}</td>` : ''}
                    ${hasNotes ? `<td style="border: 1px solid #999; padding: 4px;">${t.notes || ''}</td>` : ''}
                </tr>
            `;
        });

        return `
            <div style="margin-top: 20px;">
                <h3 style="background:#ddd; padding:5px; border:1px solid #999; text-align:center; margin-bottom:0;">${title} (${subset.length})</h3>
                <table style="width: 100%; border-collapse: collapse; font-size: 10pt; margin-top:5px;">
                    <thead>
                        <tr style="background-color: #f0f0f0;">
                            <th style="border: 1px solid #000; padding: 6px;">ALBARÁN</th>
                            <th style="border: 1px solid #000; padding: 6px;">DESTINATARIO</th>
                            <th style="border: 1px solid #000; padding: 6px;">CONTENIDO</th>
                            <th style="border: 1px solid #000; padding: 6px;">BULTOS</th>
                            <th style="border: 1px solid #000; padding: 6px;">PESO (kg)</th>
                            <th style="border: 1px solid #000; padding: 6px; width: 30px;">P/D</th>
                            ${hasCOD ? `<th style="border: 1px solid #000; padding: 6px;">REEMBOLSO</th>` : ''}
                            ${hasNotes ? `<th style="border: 1px solid #000; padding: 6px;">OBSERVACIONES</th>` : ''}
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                    <tfoot>
                        <tr style="font-weight: bold; background-color: #fafafa;">
                            <td colspan="3" style="border: 1px solid #000; padding: 6px; text-align: right;">TOTALES ${title}:</td>
                            <td style="border: 1px solid #000; padding: 6px; text-align: center;">${totalPackages}</td>
                            <td style="border: 1px solid #000; padding: 6px; text-align: center;">${totalWeight.toFixed(2)}</td>
                            <td style="border: 1px solid #000; padding: 6px;"></td>
                            ${hasCOD ? `<td style="border: 1px solid #000; padding: 6px;"></td>` : ''}
                            ${hasNotes ? `<td style="border: 1px solid #000; padding: 6px;"></td>` : ''}
                        </tr>
                    </tfoot>
                </table>
            </div>
        `;
    }

    const morningHTML = generateTableHTML(morningTickets, "TURNO DE MAÑANA");
    const afternoonHTML = generateTableHTML(afternoonTickets, "TURNO DE TARDE");

    // Fallback if empty
    let content = morningHTML + afternoonHTML;
    if (!content) content = '<div style="text-align:center; padding:20px;">No hay envíos para este manifiesto.</div>';

    return `
        <div style="width: 98%; min-height: 260mm; margin: 0 auto; page-break-before: always; font-family: Calibri, Arial, sans-serif; padding: 20px; box-sizing: border-box;">
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 10px;">
                <div>
                    <h2 style="margin:0; text-transform:uppercase; color:#FF6600;">Manifiesto de Salida</h2>
                    <div style="font-size:0.9rem;">RELACIÓN DE ENVÍOS DIARIOS</div>
                </div>
                <div style="text-align:right;">
                    <div style="font-size: 1.2rem; font-weight:bold;">${tickets[0] ? tickets[0].sender : 'NOVAPACK'}</div>
                    <div style="font-size: 1.2rem; font-weight:bold;">Fecha: ${new Date(tickets[0] ? tickets[0].createdAt : new Date()).toLocaleDateString()}</div>
                    <div style="font-size: 0.9rem;">Total Envíos: ${tickets.length}</div>
                </div>
            </div>
            
            ${content}
            
            <div style="margin-top: 40px; border-top: 1px solid #000; width: 300px; padding-top: 5px; text-align: center; float:right;">
                Firma y Sello del Transportista
            </div>
        </div>
    `;
}

function printDailyBatch() {
    const tickets = db.getAll('tickets');
    // Filter unprinted
    const unprinted = tickets.filter(t => !t.printed);

    if (unprinted.length === 0) {
        alert("No hay albaranes pendientes de imprimir.");
        return;
    }

    if (!confirm(`¿Imprimir ${unprinted.length} albaranes y el manifiesto?`)) return;

    const printArea = document.getElementById('print-area');
    printArea.innerHTML = '';

    // 1. Add Tickets
    unprinted.forEach((t, index) => {
        // Update status
        db.update('tickets', t.id, { printed: true });

        // Generate copies
        const copy1 = generateTicketHTML(t, "Ejemplar para el Cliente");
        const copy2 = generateTicketHTML(t, "Ejemplar para Administración");

        // Append to print area
        let batchHtml = `
            <div style="height: 96vh; width: 94%; margin: 0 auto; margin-left:6mm; margin-top:3mm; display: flex; flex-direction: column; justify-content: space-between; page-break-after: always; padding: 10px 0; box-sizing: border-box;">
            <div style="border-bottom: 2px dashed #999; padding-bottom: 10px;">
                ${copy2}
            </div>
            <div>
                ${copy1}
            </div>
        </div>
            `;

        printArea.innerHTML += batchHtml;
    });

    // 2. Add Manifest at the end
    const manifestHtml = generateManifestHTML(unprinted);
    printArea.innerHTML += manifestHtml;

    renderQRCodesInPrintArea();

    setTimeout(() => window.print(), 500);
}

function printShiftBatch(targetSlot) {
    const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const tickets = db.getAll('tickets');

    // Filter ALL tickets for TODAY and specific SLOT
    const shiftTickets = tickets.filter(t => {
        const tDate = t.createdAt.split('T')[0];
        return tDate === todayStr && t.timeSlot === targetSlot;
    });

    if (shiftTickets.length === 0) {
        alert(`No hay albaranes del turno de ${targetSlot} con fecha de hoy.`);
        return;
    }

    if (!confirm(`¿IMPRIMIR TURNO ${targetSlot} (${shiftTickets.length} albaranes + Manifiesto) ? `)) return;

    const printArea = document.getElementById('print-area');
    printArea.innerHTML = '';

    // 1. Add Tickets
    shiftTickets.forEach((t) => {
        // Ensure they are marked printed just in case
        if (!t.printed) db.update('tickets', t.id, { printed: true });

        const copy1 = generateTicketHTML(t, "Ejemplar para el Cliente");
        const copy2 = generateTicketHTML(t, "Ejemplar para Administración");

        let batchHtml = `
        <div style="height: 96vh; width: 94%; margin: 0 auto; margin-left:6mm; margin-top:3mm; display: flex; flex-direction: column; justify-content: space-between; page-break-after: always; padding: 10px 0; box-sizing: border-box;">
            <div style="border-bottom: 2px dashed #999; padding-bottom: 10px;">
                ${copy2}
            </div>
            <div>
                ${copy1}
            </div>
        </div>
        `;

        printArea.innerHTML += batchHtml;
    });

    // 2. Add Shift Manifest (only contain these tickets)
    // We reuse generateManifestHTML but pass only this shift's tickets
    // Note: generateManifestHTML splits by morning/afternoon internally, so passing only morning tickets works fine (it will just show morning table).
    const manifestHtml = generateManifestHTML(shiftTickets);
    printArea.innerHTML += manifestHtml;

    renderQRCodesInPrintArea();

    setTimeout(() => window.print(), 500);
}

function printManifestOnly() {
    // USE SELECTED DATE FROM FILTER
    const dateInput = document.getElementById('date-filter');
    const selectedDate = dateInput.value;

    if (!selectedDate) {
        alert("Por favor selecciona una fecha primero.");
        return;
    }

    const tickets = db.getAll('tickets');

    // Filter ALL tickets for SELECTED DATE
    let filteredTickets = tickets.filter(t => {
        const tDate = t.createdAt.split('T')[0];
        return tDate === selectedDate;
    });

    if (filteredTickets.length === 0) {
        alert("No hay albaranes con la fecha seleccionada.");
        return;
    }

    // Ask for SHIFT
    const choice = prompt("¿Qué manifiesto deseas imprimir?\n1 - MAÑANA\n2 - TARDE\n3 - TODOS (Ambos turnos)\n\nEscribe 1, 2 o 3:", "3");

    if (choice === "1") {
        filteredTickets = filteredTickets.filter(t => t.timeSlot === "MAÑANA");
    } else if (choice === "2") {
        filteredTickets = filteredTickets.filter(t => t.timeSlot === "TARDE");
    } else if (choice === "3" || choice === null || choice === "") {
        // Keep all
    } else {
        alert("Opción no válida.");
        return;
    }

    if (filteredTickets.length === 0) {
        alert("No hay albaranes registrados para el turno seleccionado.");
        return;
    }

    const printArea = document.getElementById('print-area');
    printArea.innerHTML = '';

    // Only Manifest
    const manifestHtml = generateManifestHTML(filteredTickets);
    printArea.innerHTML = manifestHtml;

    setTimeout(() => window.print(), 500);
}

/* --- PACKAGE MANAGEMENT --- */
function addPackageRow(data = null) {
    const list = document.getElementById('packages-list');
    const noMsg = list.querySelector('.no-packages-msg');
    if (noMsg) noMsg.remove();

    const row = document.createElement('div');
    row.className = 'package-row';
    row.style.cssText = "display: flex; gap: 10px; margin-bottom: 12px; align-items: flex-end; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 12px;";

    // Size Options
    let sizes = defaultSizes.split(',').map(s => s.trim());
    const customSizes = db.getAll('custom_sizes') || [];
    const deletedSizes = db.getAll('sizes_deleted') || [];

    let allSizes = [...new Set([...sizes, ...customSizes])];
    allSizes = allSizes.filter(s => !deletedSizes.includes(s));

    let sizeOptions = allSizes.map(s => `<option value="${s}">${s}</option>`).join('');
    sizeOptions += `<option value="create_new_size" style="color:var(--brand-primary); font-weight:bold;">+ CREAR NUEVO...</option>`;

    row.innerHTML = `
        <div style="width: 70px; display:flex; flex-direction:column;">
            <label style="font-size:0.65rem; color:var(--text-dim); margin-bottom:4px; font-weight:700;">BULTOS</label>
            <input type="number" class="pkg-qty form-control" value="1" min="1" style="padding:6px; font-size:1rem; text-align:center; font-weight:900; background:rgba(255,102,0,0.05); border-color:rgba(255,102,0,0.2);">
        </div>
        <div style="flex:1; display:flex; flex-direction:column;">
            <label style="font-size:0.65rem; color:var(--text-dim); margin-bottom:4px; font-weight:700;">PESO (KG)</label>
            <input type="number" class="pkg-weight form-control" step="0.1" placeholder="0.00" style="padding:6px; font-size:1rem; font-weight:900;">
        </div>
        <div style="flex:2; display:flex; flex-direction:column;">
            <label style="font-size:0.65rem; color:var(--text-dim); margin-bottom:4px; font-weight:700;">TIPO / TAMAÑO</label>
            <div style="display:flex;">
                <select class="pkg-size form-control" style="padding:6px; font-size:0.9rem; border-top-right-radius:0; border-bottom-right-radius:0; flex:1; font-weight:700;">${sizeOptions}</select>
                <button type="button" class="btn-delete-size-opt" style="border:1px solid var(--border-glass); border-left:none; background:rgba(255,255,255,0.05); color:#FF3B30; cursor:pointer; padding:0 10px; border-top-right-radius:8px; border-bottom-right-radius:8px; font-weight:bold;" title="Eliminar tipo">✕</button>
            </div>
        </div>
        <button type="button" class="btn-remove-pkg" style="background:rgba(255,59,48,0.1); border:1px solid rgba(255,59,48,0.3); color:#FF3B30; cursor:pointer; width:36px; height:36px; border-radius:8px; display:flex; align-items:center; justify-content:center; margin-left:5px; font-size:1.2rem; font-weight:900;">&times;</button>
    `;

    list.appendChild(row);

    // Auto-scroll the main editor area to show the new row
    const editor = document.querySelector('.ticket-editor');
    if (editor) {
        setTimeout(() => {
            editor.scrollTo({ top: editor.scrollHeight, behavior: 'smooth' });
        }, 100);
    }


    // Logic for this row
    const qtyIn = row.querySelector('.pkg-qty');
    const weightIn = row.querySelector('.pkg-weight');
    const sizeSel = row.querySelector('.pkg-size');
    const removeBtn = row.querySelector('.btn-remove-pkg');
    const delSizeBtn = row.querySelector('.btn-delete-size-opt');

    // Delete Size Option Logic
    delSizeBtn.onclick = () => {
        const val = sizeSel.value;
        if (!val || val === 'create_new_size') return;

        if (confirm(`¿Eliminar tamaño "${val}" de la lista para SIEMPRE ? `)) {
            const defaults = defaultSizes.split(',').map(s => s.trim());
            if (defaults.includes(val)) {
                let del = db.getAll('sizes_deleted') || [];
                if (!del.includes(val)) {
                    del.push(val);
                    db.save('sizes_deleted', del);
                }
            } else {
                let custom = db.getAll('custom_sizes') || [];
                custom = custom.filter(s => s !== val);
                db.save('custom_sizes', custom);
            }
            alert("Tamaño eliminado. No aparecerá en nuevos bultos.");
            // Remove from current select for immediate feedback
            const opt = sizeSel.querySelector(`option[value = "${val}"]`);
            if (opt) {
                opt.remove();
                sizeSel.value = "";
                updateContext();
            }
        }
    };

    // Size Creation Logic & Auto-Weight
    sizeSel.addEventListener('change', () => {
        const val = sizeSel.value;

        // Auto-Weight Logic
        const weights = {
            'BATERIA 45AH': 15,
            'BATERIA 75AH': 25,
            'BATERIA 100AH': 45,
            'BATERIA CAMION': 60,
            'TAMBOR CAMION': 50,
            'CALIPER DE CAMION': 50,
            'CAJAS DE ACEITE O AGUA': 15,
            'GARRAFAS ADBLUE': 10
        };

        if (weights[val]) {
            weightIn.value = weights[val];
            updateContext();
        }

        if (val === 'create_new_size') {
            const newType = prompt("Nombre del nuevo tipo de bulto:");
            if (newType && newType.trim()) {
                const cleanVal = newType.trim();
                let saved = db.getAll('custom_sizes');
                if (!saved) saved = [];
                if (!saved.includes(cleanVal) && !defaultSizes.includes(cleanVal)) {
                    saved.push(cleanVal);
                    db.save('custom_sizes', saved);

                    // Update ALL existing size selects to include the new one
                    const allSizeSelects = document.querySelectorAll('.pkg-size');
                    allSizeSelects.forEach(sel => {
                        const opt = document.createElement('option');
                        opt.value = cleanVal;
                        opt.text = cleanVal;
                        // Insert before the last option (which is create new)
                        sel.add(opt, sel.options[sel.options.length - 1]);
                    });

                    // Select it in current
                    sizeSel.value = cleanVal;
                }
            } else {
                sizeSel.value = "Mediano"; // Revert to default
            }
        }
    });

    // Update totals on change
    qtyIn.addEventListener('input', updateContext);
    weightIn.addEventListener('input', updateContext);

    // Focus next if enter
    qtyIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') weightIn.focus(); });
    weightIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') sizeSel.focus(); });

    removeBtn.onclick = () => {
        row.remove();
        updateContext();
        if (list.children.length === 0) list.innerHTML = '<div class="no-packages-msg" style="text-align:center; color:#999; font-size:0.9rem;">No hay bultos añadidos</div>';
    };

    // Pre-fill
    if (data) {
        if (data.qty) qtyIn.value = data.qty;

        // Handle legacy weight strings (e.g. "1kg")
        let w = data.weight;
        if (typeof w === 'string') {
            w = w.replace('kg', '').trim();
        }
        weightIn.value = w;

        sizeSel.value = data.size;
    }

    updateContext();
}

function updateContext() {
    // Update hidden count or total weight if needed
    const list = document.getElementById('packages-list').getElementsByClassName('package-row');

    let totalQty = 0;
    let totalWeight = 0;

    Array.from(list).forEach(row => {
        const qVal = parseFloat(row.querySelector('.pkg-qty').value) || 0;
        const wVal = parseFloat(row.querySelector('.pkg-weight').value) || 0;

        totalQty += qVal;
        totalWeight += (qVal * wVal);
    });

    document.getElementById('ticket-packages-count').value = totalQty;

    // Display total
    const displayTotal = document.getElementById('display-total-packages');
    if (displayTotal) displayTotal.textContent = totalQty;

    const totalInput = document.getElementById('ticket-weight-total');
    if (totalInput) totalInput.value = totalWeight.toFixed(2) + " kg";

    // Aggressive scroll removed as per user request for "synchronized" focus-based scroll
}

function getPackagesData() {
    const rows = document.getElementById('packages-list').getElementsByClassName('package-row');
    return Array.from(rows).map(row => {
        const qty = parseInt(row.querySelector('.pkg-qty').value) || 1;
        const weight = parseFloat(row.querySelector('.pkg-weight').value) || 0;
        const size = row.querySelector('.pkg-size').value;
        return { qty, weight: weight, size: size }; // Store number for weight
    });
}

/* --- TICKET MANAGEMENT --- */
let editingId = null;

function loadTickets(searchQuery = '') {
    const list = document.getElementById('tickets-list');
    const dateFilter = document.getElementById('date-filter').value;

    let tickets = db.getAll('tickets');

    // Sort desc (newest first)
    tickets.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Filter
    if (dateFilter) {
        tickets = tickets.filter(t => t.createdAt.startsWith(dateFilter));

        // User Request: "visualizar en la zona de albaranes impresos solo los del turno actual"
        // Valid only if filter is TODAY (dynamic shift filtering only makes sense for current operations)
        const todayStr = new Date().toISOString().slice(0, 10);
        if (dateFilter === todayStr) {
            const currentHour = new Date().getHours();
            const currentSlot = currentHour < 15 ? 'MAÑANA' : 'TARDE';

            tickets = tickets.filter(t => {
                // If printed, ONLY show if it matches current slot
                if (t.printed) {
                    return t.timeSlot === currentSlot;
                }
                // If not printed (new/pending), always show it so we don't lose track of pending work
                return true;
            });
        }
    }
    if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const qClean = q.replace(/[^a-z0-9]/g, '');

        tickets = tickets.filter(t => {
            const receiver = (t.receiver || "").toLowerCase();
            const id = (t.id || "").toLowerCase();
            const idClean = id.replace(/[^a-z0-9]/g, '');
            const address = (t.address || "").toLowerCase();
            const sender = (t.sender || "").toLowerCase();

            return receiver.includes(q) ||
                id.includes(q) ||
                idClean.includes(qClean) ||
                address.includes(q) ||
                sender.includes(q);
        });
    }

    list.innerHTML = '';
    if (tickets.length === 0) {
        list.innerHTML = '<div style="text-align:center; padding:20px; color:#999;">No hay albaranes.</div>';
        return;
    }

    tickets.forEach(t => renderTicketItem(t, list));
}

function renderTicketItem(t, list) {
    const div = document.createElement('div');
    div.className = `ticket-list-item ${t.printed ? 'printed' : ''} ${editingId === t.id ? 'active' : ''}`;
    const dateStr = new Date(t.createdAt).toLocaleDateString();

    // Calc total packages
    let pkgCount = 0;
    if (t.packagesList) {
        // New structure check: if it has qty
        pkgCount = t.packagesList.reduce((sum, p) => sum + (p.qty || 1), 0);
    } else {
        pkgCount = t.packages || 0;
    }

    div.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 4px;">
            <strong style="color:var(--brand-primary); font-size:1rem; font-family:var(--font-heading);">${t.id}</strong>
            <span class="status-badge ${t.printed ? 'printed' : 'new'}">${t.printed ? 'IMP' : 'NUEVO'}</span>
        </div>
        <div style="font-weight:700; font-size:0.9rem; color: #FFF; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-bottom: 4px;">${t.receiver.toUpperCase()}</div>
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.75rem; color:var(--text-dim); border-top: 1px solid rgba(255,255,255,0.05); padding-top: 4px;">
            <span><i class="icon-calendar"></i> ${dateStr}</span>
            <span style="background: rgba(255,102,0,0.1); color: var(--brand-primary); padding: 1px 6px; border-radius: 4px; font-weight: 800;">📦 ${pkgCount}</span>
        </div>
    `;

    div.onclick = () => loadEditor(t.id);
    list.appendChild(div);
}

function loadEditor(id) {
    const t = db.getOne('tickets', id);
    if (!t) return;

    editingId = id;

    // Fill Form
    document.getElementById('ticket-sender').value = t.sender;
    document.getElementById('ticket-sender-address').value = t.senderAddress || '';
    document.getElementById('ticket-sender-phone').value = t.senderPhone || '';
    document.getElementById('ticket-receiver').value = t.receiver;

    if (t.street) {
        document.getElementById('ticket-address').value = t.street;
        document.getElementById('ticket-number').value = t.number || '';
    } else {
        document.getElementById('ticket-address').value = t.address;
        document.getElementById('ticket-number').value = '';
    }

    document.getElementById('ticket-phone').value = t.phone || '';

    // Ensure province option exists before setting it (if it was deleted from list but exists in ticket)
    if (t.province && !document.querySelector(`#ticket-province option[value="${t.province}"]`)) {
        const opt = document.createElement('option');
        opt.value = t.province;
        opt.textContent = t.province;
        const sel = document.getElementById('ticket-province');
        sel.add(opt, sel.options[sel.options.length - 1]); // Insert before "Create New"
    }
    document.getElementById('ticket-province').value = t.province || '';

    document.getElementById('ticket-shipping-type').value = t.shippingType;
    document.getElementById('ticket-cod').value = t.cod || '';
    document.getElementById('ticket-notes').value = t.notes || '';
    document.getElementById('ticket-time-slot').value = t.timeSlot || '';

    // Load Packages
    const list = document.getElementById('packages-list');
    list.innerHTML = ''; // Clear

    if (t.packagesList && t.packagesList.length > 0) {
        t.packagesList.forEach(p => addPackageRow(p));
    } else {
        // Legacy: create rows based on count
        const count = t.packages || 1;
        for (let i = 0; i < count; i++) {
            addPackageRow({ weight: t.weight, size: t.size || 'Mediano' });
        }
    }

    // UI State
    document.getElementById('editor-title').textContent = "Visualizando Albarán";
    document.getElementById('editor-status').textContent = `ID: ${t.id}`;
    document.getElementById('editor-actions').classList.remove('hidden');

    // Update Action Handlers
    document.getElementById('action-print').onclick = () => printTicket(id);
    document.getElementById('action-label').onclick = () => printLabel(id);
    document.getElementById('action-delete').onclick = () => deleteTicket(id);

    // SMS Button
    const btnSMS = document.getElementById('action-sms-pickup');
    if (btnSMS) {
        btnSMS.style.display = 'inline-block';
        btnSMS.onclick = () => sendPickupSMS(id);
    }

    loadTickets(document.getElementById('ticket-search').value);
}


function resetEditor() {
    editingId = null;
    document.getElementById('create-ticket-form').reset();

    // Calculate Next ID for display
    const currentCompName = getCompanyName(db.companyId);
    const nextId = getNextId(currentCompName);

    document.getElementById('editor-title').textContent = "Nuevo Albarán";
    document.getElementById('editor-status').innerHTML = `ALBARÁN NÚMERO: <strong>${nextId}</strong>`;
    document.getElementById('editor-actions').classList.add('hidden');

    // Hide SMS Button
    const btnSMS = document.getElementById('action-sms-pickup');
    if (btnSMS) btnSMS.style.display = 'none';

    document.getElementById('ticket-province').value = '';
    document.getElementById('ticket-number').value = '';

    // Auto-select Time Slot based on current hour
    const currentHour = new Date().getHours();
    const timeSlot = currentHour < 15 ? 'MAÑANA' : 'TARDE';
    document.getElementById('ticket-time-slot').value = timeSlot;

    // Restore default sender
    const savedSender = localStorage.getItem(db.getKey('default_sender'));
    const savedSenderAddr = localStorage.getItem(db.getKey('default_sender_address'));
    const savedSenderPhone = localStorage.getItem(db.getKey('default_sender_phone'));
    if (savedSender) document.getElementById('ticket-sender').value = savedSender;
    if (savedSenderAddr) document.getElementById('ticket-sender-address').value = savedSenderAddr;
    if (savedSenderPhone) document.getElementById('ticket-sender-phone').value = savedSenderPhone;

    // Reset Packages
    document.getElementById('packages-list').innerHTML = '<div class="no-packages-msg" style="text-align:center; color:#999; font-size:0.9rem;">No hay bultos añadidos</div>';

    loadTickets(document.getElementById('ticket-search').value);
}

function getInitials(name) {
    // 1. Check if there is a custom prefix for the CURRENT company
    // Note: getInitials is usually called with 'senderName', but for ID generation we really want the Company's prefix.
    // In this app structure, 'name' passed here is usually getCompanyName(db.companyId).

    // Access DB directly to check prefix for current company
    const customPrefix = localStorage.getItem(db.getKey('ticket_prefix'));
    if (customPrefix && customPrefix.trim().length > 0) {
        return customPrefix.trim().toUpperCase();
    }

    // 2. Fallback to name-based initials
    if (!name || name.trim().length === 0) return "UNK";
    return name.trim().split(/\s+/).map(n => n[0]).join('').toUpperCase().substring(0, 3);
}

function getNextId(senderName) {
    const initials = getInitials(senderName);
    const tickets = db.getAll('tickets');

    // Filter tickets that start with these initials + number
    // Regex: ^NOV[0-9]+$  (Example for NOVAPACK)
    const regex = new RegExp(`^${initials}([0-9]+)$`);

    let max = 0; // Start count at 0 so first one becomes 1
    tickets.forEach(t => {
        const match = t.id.match(regex);
        if (match) {
            const num = parseInt(match[1]);
            if (num > max) max = num;
        }
    });

    // Check for configured start counter (via Manage Companies)
    const configStart = parseInt(localStorage.getItem(db.getKey('start_counter'))) || 1;

    // Check for persistently stored last sequence (to prevent reuse after delete)
    const lastSequence = parseInt(localStorage.getItem(db.getKey('last_sequence'))) || 0;

    // Calculate effective max based on:
    // 1. Existing tickets (max) - ensures we don't overlap if DB has higher numbers
    // 2. Last Sequence (lastSequence) - ensures we don't reuse deleted numbers
    // 3. Config Start - ensures we respect the manual start configuration
    let effectiveMax = Math.max(max, lastSequence);

    if ((configStart - 1) > effectiveMax) {
        effectiveMax = configStart - 1;
    }

    const nextNum = effectiveMax + 1;
    // Format with at least 2 digits (e.g. 01, 02... 10, 100)
    const paddedNum = nextNum.toString().padStart(2, '0');

    return `${initials}${paddedNum}`;
}

async function handleFormSubmit(e) {
    e.preventDefault();

    const packagesList = getPackagesData();
    if (packagesList.length === 0) {
        alert("Añade al menos un bulto.");
        return;
    }

    const street = document.getElementById('ticket-address').value;
    const number = document.getElementById('ticket-number').value;
    const fullAddress = street + (number ? ` Nº ${number}` : '');

    const selectedSlot = document.getElementById('ticket-time-slot').value;
    const data = {
        sender: document.getElementById('ticket-sender').value,
        senderAddress: document.getElementById('ticket-sender-address').value,
        senderPhone: document.getElementById('ticket-sender-phone').value,
        receiver: document.getElementById('ticket-receiver').value,
        street: street,
        number: number,
        address: fullAddress,
        phone: document.getElementById('ticket-phone').value,
        province: document.getElementById('ticket-province').value,
        packagesList: packagesList,
        shippingType: document.getElementById('ticket-shipping-type').value,
        cod: document.getElementById('ticket-cod').value,
        notes: document.getElementById('ticket-notes').value,
        timeSlot: selectedSlot || (new Date().getHours() < 15 ? 'MAÑANA' : 'TARDE'),
        updatedAt: new Date().toISOString()
    };

    if (editingId) {
        db.update('tickets', editingId, data);
        showNotification("Albarán actualizado correctamente", "success");
    } else {
        // Create New ID
        const currentCompanyName = getCompanyName(db.companyId);
        const nextId = getNextId(currentCompanyName);
        data.id = nextId;
        data.createdAt = new Date().toISOString();
        data.printed = false;

        db.add('tickets', data);

        // Update last used sequence
        const initials = getInitials(currentCompanyName);
        const regex = new RegExp(`^${initials}([0-9]+)$`);
        const match = nextId.match(regex);
        if (match) {
            const num = parseInt(match[1]);
            localStorage.setItem(db.getKey('last_sequence'), num);
        }

        // SMS ALERT LOGIC (First Ticket of EACH Slot Today)
        // Local Date for "First of the Day" check (avoids UTC confusion at midnight)
        const now = new Date();
        const localDay = now.getFullYear() + '-' + (now.getMonth() + 1).toString().padStart(2, '0') + '-' + now.getDate().toString().padStart(2, '0');
        const currentSlot = data.timeSlot;

        // Robust filter: ensure createdAt exists before calling startsWith
        const existingInSlot = db.getAll('tickets').filter(t => {
            if (!t.createdAt) return false;
            const tDate = new Date(t.createdAt);
            const tDay = tDate.getFullYear() + '-' + (tDate.getMonth() + 1).toString().padStart(2, '0') + '-' + tDate.getDate().toString().padStart(2, '0');
            return tDay === localDay && t.timeSlot === currentSlot;
        });

        // Since we just added 'data' to DB, if length is 1, it's the first one!
        if (existingInSlot.length === 1) {
            const alertPhone = localStorage.getItem(db.getKey('pickup_alert_phone'));
            if (alertPhone && alertPhone.trim().length > 0) {
                const companyName = getCompanyName(db.companyId);
                const now = new Date();
                const fDate = now.getDate().toString().padStart(2, '0') + '/' + (now.getMonth() + 1).toString().padStart(2, '0') + '/' + now.getFullYear();
                const fTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
                const timestamp = `${fDate} ${fTime}`;
                const msg = `NOVAPACK - AVISO DE RECOGIDA (${currentSlot}) ${timestamp}: Hay envíos preparados en ${companyName}.`;

                const smsGatewayUrl = localStorage.getItem(db.getKey('sms_gateway_url'));

                if (smsGatewayUrl && smsGatewayUrl.trim().length > 0) {
                    showNotification("Enviando aviso SMS automático...", "info");

                    const cleanPhone = alertPhone.trim().replace(/[\s\(\)\-]/g, '');
                    let finalUrl = smsGatewayUrl
                        .replace(/\{TELEFONO\}/gi, cleanPhone)
                        .replace(/\{MENSAJE\}/gi, encodeURIComponent(msg))
                        .replace(/\{FECHA\}/gi, encodeURIComponent(fDate))
                        .replace(/\{HORA\}/gi, encodeURIComponent(fTime))
                        .replace(/\{TURNO\}/gi, encodeURIComponent(currentSlot));

                    fetch(finalUrl, { mode: 'no-cors' })
                        .then(() => {
                            console.log("Auto SMS Sent to: " + alertPhone);
                            showNotification("Aviso SMS enviado (Turno " + currentSlot + ")", "success");
                        })
                        .catch(err => {
                            console.error("Auto SMS Error", err);
                            showNotification("Error enviando SMS automático", "error");
                        });
                } else {
                    // Fallback to Protocol Handler (sms:)
                    // Using a small delay to avoid interrupting the save process visual feedback
                    setTimeout(() => {
                        window.location.href = `sms:${alertPhone.trim()}?body=${encodeURIComponent(msg)}`;
                    }, 1000);
                    showNotification("Abriendo aplicación de SMS...", "info");
                }
            }
        }

        // Auto-Download to PC
        showNotification(`Albarán Guardado Correctamente: ${data.id}`, "success");
        resetEditor();
    }

    // Save Client
    if (document.getElementById('save-destination-check').checked) {
        saveClient({
            name: data.receiver,
            address: data.address,
            street: data.street,
            number: data.number,
            phone: data.phone,
            province: data.province
        });
    }

    loadTickets();
}

function deleteTicket(id) {
    if (confirm("¿Estás seguro de borrar este albarán?")) {
        db.delete('tickets', id);
        resetEditor();
    }
}

/* --- CLIENTS / DESTINATIONS --- */
/* --- CLIENTS / DESTINATIONS --- */
// --- NEW CLIENT PICKER LOGIC ---
function loadClients() {
    // No-op or clear input?
    // Since we now have a search input, we don't pre-load options.
    // Just clearing the input might be nice on reset.
    const input = document.getElementById('client-picker');
    if (input) input.value = '';
}

function saveClient(clientData) {
    const clients = db.getAll('destinations');

    // Find Client by Name
    let client = clients.find(c => c.name.toLowerCase() === clientData.name.toLowerCase().trim());

    if (client) {
        // Check if address already exists
        const addrExists = client.addresses.find(a => a.address.toLowerCase().trim() === clientData.address.toLowerCase().trim());

        if (!addrExists) {
            client.addresses.push({
                id: "addr_" + Date.now() + Math.floor(Math.random() * 1000),
                address: clientData.address,
                street: clientData.street || "",
                number: clientData.number || "",
                province: clientData.province || ""
            });
            if (clientData.phone) client.phone = clientData.phone;
            db.update('destinations', client.id, client);
        } else {
            // Just update phone if provided
            if (clientData.phone) {
                client.phone = clientData.phone;
                db.update('destinations', client.id, client);
            }
        }
    } else {
        // Create new client object
        const newClient = {
            id: "cli_" + Date.now() + Math.floor(Math.random() * 1000),
            name: clientData.name.trim(),
            phone: clientData.phone || "",
            addresses: [{
                id: "addr_" + Date.now() + Math.floor(Math.random() * 1000),
                address: clientData.address,
                street: clientData.street || "",
                number: clientData.number || "",
                province: clientData.province || ""
            }]
        };
        db.add('destinations', newClient);
        loadClients();
    }
}

// --- CLIENT MANAGER LOGIC ---
let editingClientId = null;

function renderClientsList(search = "") {
    const list = document.getElementById('clients-view-list');
    let clients = db.getAll('destinations');

    // Sort
    clients.sort((a, b) => a.name.localeCompare(b.name));

    if (search) {
        const q = search.toLowerCase();
        clients = clients.filter(c =>
            c.name.toLowerCase().includes(q) ||
            c.addresses.some(a => a.address.toLowerCase().includes(q))
        );
    }

    // Reset selection UI
    document.getElementById('client-select-all').checked = false;
    updateClientSelectionUI();

    list.innerHTML = "";
    clients.forEach(c => {
        const item = document.createElement('div');
        item.style.padding = "10px";
        item.style.borderBottom = "1px solid var(--border-glass)";
        item.style.cursor = "pointer";
        item.style.backgroundColor = (editingClientId === c.id) ? "var(--surface-active)" : "transparent";
        item.style.display = "flex";
        item.style.alignItems = "center";
        item.style.gap = "10px";

        const addrCount = c.addresses.length;

        item.innerHTML = `
            <input type="checkbox" class="client-checkbox" value="${c.id}" style="transform:scale(1.1); cursor:pointer;">
            <div style="flex:1;">
                <div style="font-weight:bold; color:#FFF;">${c.name}</div>
                <div style="font-size:0.8rem; color:var(--text-dim);">${addrCount} direccion(es)</div>
                ${c.phone ? `<div style="font-size:0.8rem; color: var(--brand-primary);">📞 ${c.phone}</div>` : ''}
            </div>
        `;

        // Checkbox logic
        const cb = item.querySelector('.client-checkbox');
        cb.onclick = (e) => {
            e.stopPropagation();
            updateClientSelectionUI();
        };

        // Item click
        item.onclick = (e) => {
            if (e.target !== cb) loadClientToEdit(c);
        };

        list.appendChild(item);
    });
}

function addAddressRowToEditor(data = null) {
    const container = document.getElementById('client-edit-addresses-container');
    const noMsg = container.querySelector('.no-addresses-msg');
    if (noMsg) noMsg.remove();

    const row = document.createElement('div');
    row.className = 'client-address-row';
    if (data && data.id) row.dataset.id = data.id; // Preserve ID
    row.style.cssText = "display: flex; gap: 10px; padding: 10px; background: rgba(255,255,255,0.03); border: 1px solid var(--border-glass); border-radius: 8px; flex-direction: column;";

    row.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
             <span style="font-size:0.7rem; color:var(--brand-primary); font-weight:bold;">📍 DIRECCIÓN DE ENTREGA</span>
             <button type="button" class="btn-remove-addr" style="background:none; border:none; color:#FF3B30; cursor:pointer; font-size:0.7rem; font-weight:bold; letter-spacing:0.5px;">✕ ELIMINAR</button>
        </div>
        
        <div style="display:grid; grid-template-columns: 3fr 1fr; gap:10px;">
            <div class="form-group" style="margin:0;">
                <label style="font-size:0.6rem; color:var(--text-dim); display:block; margin-bottom:3px;">CALLE / AVENIDA</label>
                <input type="text" class="addr-street form-control" placeholder="Nombre de calle..." style="font-size:0.85rem; padding:8px;">
            </div>
            <div class="form-group" style="margin:0;">
                <label style="font-size:0.6rem; color:var(--text-dim); display:block; margin-bottom:3px;">Nº</label>
                <input type="text" class="addr-number form-control" placeholder="Casa/Km" style="font-size:0.85rem; padding:8px; text-align:center;">
            </div>
        </div>

        <div class="form-group" style="margin:0;">
            <label style="font-size:0.6rem; color:var(--text-dim); display:block; margin-bottom:3px;">PROVINCIA / ZONA</label>
            <select class="addr-province form-control" style="font-size:0.85rem; padding:8px;">
                 <!-- Provinces will be loaded here -->
            </select>
        </div>

        <div class="form-group" style="margin:0;">
            <label style="font-size:0.6rem; color:var(--brand-primary); display:block; margin-bottom:5px; font-weight:700;">VISTA PREVIA DIREC. COMPLETA (SE GENERA SOLO)</label>
            <textarea class="addr-full form-control" style="font-size:0.85rem; min-height:50px; background:rgba(0,0,0,0.2); border-style:dashed;" placeholder="Se generará automáticamente..."></textarea>
        </div>
    `;

    container.appendChild(row);

    // Load Provinces into the new select
    const provSel = row.querySelector('.addr-province');
    let provinces = [...new Set([...DEFAULT_ZONES, ...(db.getAll('provinces') || [])])];
    const deleted = db.getAll('provinces_deleted') || [];
    provinces = provinces.filter(p => !deleted.includes(p)).sort();

    let html = '<option value="">-- Provincia --</option>';
    provinces.forEach(p => html += `<option value="${p}">${p}</option>`);
    provSel.innerHTML = html;

    // Remove logic
    row.querySelector('.btn-remove-addr').onclick = () => {
        row.remove();
        if (container.children.length === 0) {
            container.innerHTML = '<div class="no-addresses-msg" style="text-align:center; color:var(--text-muted); font-size:0.85rem; padding:10px;">NO HAY DIRECCIONES REGISTRADAS</div>';
        }
    };

    // Logic: Auto-update full address from street/number/province
    const updateFull = () => {
        const street = row.querySelector('.addr-street').value.trim();
        const num = row.querySelector('.addr-number').value.trim();
        const prov = row.querySelector('.addr-province').value;

        let full = street;
        if (num) full += (full ? ' Nº ' : 'Nº ') + num;
        if (prov) full += (full ? ', ' : '') + prov;

        row.querySelector('.addr-full').value = full;
    };

    row.querySelector('.addr-street').addEventListener('input', updateFull);
    row.querySelector('.addr-number').addEventListener('input', updateFull);
    row.querySelector('.addr-province').addEventListener('change', updateFull);

    // Fill data if provided
    if (data) {
        row.querySelector('.addr-full').value = data.address || "";
        row.querySelector('.addr-street').value = data.street || "";
        row.querySelector('.addr-number').value = data.number || "";
        row.querySelector('.addr-province').value = data.province || "";
    }
}

function loadClientToEdit(c) {
    editingClientId = c.id;
    document.getElementById('client-edit-id').value = c.id;
    document.getElementById('client-edit-name').value = c.name;
    document.getElementById('client-edit-phone').value = c.phone || "";

    // Clear and load addresses
    const container = document.getElementById('client-edit-addresses-container');
    container.innerHTML = "";
    if (c.addresses && c.addresses.length > 0) {
        c.addresses.forEach(a => addAddressRowToEditor(a));
    } else {
        container.innerHTML = '<div class="no-addresses-msg" style="text-align:center; color:var(--text-muted); font-size:0.85rem; padding:10px;">NO HAY DIRECCIONES REGISTRADAS</div>';
    }

    renderClientsList(document.getElementById('client-view-search').value); // Update active state
}

function resetClientManager() {
    editingClientId = null;
    document.getElementById('client-edit-id').value = "";
    document.getElementById('client-edit-name').value = "";
    document.getElementById('client-edit-phone').value = "";
    document.getElementById('client-edit-addresses-container').innerHTML = "";
    addAddressRowToEditor(); // Add a default empty row for new client
    renderClientsList(document.getElementById('client-view-search').value);
}

function saveClientFromManager() {
    const id = document.getElementById('client-edit-id').value;
    const name = document.getElementById('client-edit-name').value.trim();
    const phone = document.getElementById('client-edit-phone').value.trim();

    if (!name) { alert("El nombre es obligatorio"); return; }

    const addressRows = document.querySelectorAll('.client-address-row');
    const addresses = Array.from(addressRows).map(row => ({
        id: row.dataset.id || ("addr_" + Date.now() + Math.floor(Math.random() * 1000)),
        address: row.querySelector('.addr-full').value.trim(),
        street: row.querySelector('.addr-street').value.trim(),
        number: row.querySelector('.addr-number').value.trim(),
        province: row.querySelector('.addr-province').value
    })).filter(a => a.address);

    if (addresses.length === 0) {
        alert("Añade al menos una dirección");
        return;
    }

    const data = { id: id || ("cli_" + Date.now()), name: name, phone: phone, addresses: addresses };

    if (id) {
        db.update('destinations', id, data);
        alert("Cliente actualizado correctamente");
    } else {
        db.add('destinations', data);
        alert("Nuevo cliente creado correctamente");
    }

    resetClientManager();
    loadClients(); // Update picker
}

function deleteClientFromManager() {
    const id = document.getElementById('client-edit-id').value;
    if (!id) return;

    if (confirm("¿Seguro que quieres eliminar este cliente y TODAS sus direcciones?")) {
        db.delete('destinations', id);
        resetClientManager();
        loadClients(); // Update picker
        alert("Cliente eliminado");
    }
}

/* --- BULK DELETE CLIENTS --- */
function toggleSelectAllClients(e) {
    const isChecked = e.target.checked;
    const checkboxes = document.querySelectorAll('.client-checkbox');
    checkboxes.forEach(cb => cb.checked = isChecked);
    updateClientSelectionUI();
}

function updateClientSelectionUI() {
    const checkboxes = document.querySelectorAll('.client-checkbox');
    const selected = Array.from(checkboxes).filter(cb => cb.checked);
    const count = selected.length;

    const btn = document.getElementById('btn-delete-selected-clients');
    const countSpan = document.getElementById('client-selected-count');

    // Safety check if elements exist (in case view is not loaded)
    if (!btn || !countSpan) return;

    if (count > 0) {
        btn.style.display = 'block';
        btn.innerHTML = `🗑️ Borrar (${count})`;
        countSpan.style.display = 'block';
        countSpan.textContent = `${count} seleccionados`;
    } else {
        btn.style.display = 'none';
        countSpan.style.display = 'none';
    }
}

function deleteSelectedClients() {
    const checkboxes = document.querySelectorAll('.client-checkbox:checked');
    if (checkboxes.length === 0) return;

    if (confirm(`¿Estás seguro de eliminar ${checkboxes.length} clientes seleccionados?`)) {
        checkboxes.forEach(cb => {
            db.delete('destinations', cb.value);
        });

        // Reset editor if we deleted the currently edited client
        if (editingClientId) {
            const deleted = Array.from(checkboxes).find(cb => cb.value === editingClientId);
            if (deleted) resetClientManager();
        }

        // Refresh list
        renderClientsList(document.getElementById('client-view-search').value);
        loadClients(); // Update main picker

        alert("Clientes eliminados correctamente.");

        // Reset Select All
        document.getElementById('client-select-all').checked = false;
        updateClientSelectionUI();
    }
}

/* --- EXPORT / IMPORT --- */
async function setupBackupFolder() {
    if (!window.showDirectoryPicker) {
        alert("Tu navegador no soporta la selección de carpetas persistentes.");
        return;
    }
    try {
        const handle = await window.showDirectoryPicker({
            id: 'novapack_backups',
            mode: 'readwrite'
        });
        backupDirHandle = handle;
        await idb.set('backup_folder', handle);
        alert("✅ Carpeta de copias vinculada correctamente.");
    } catch (e) {
        console.error(e);
    }
}

async function exportData() {
    const json = db.getBackupJSON();
    const companyName = getCompanyName(db.companyId).replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = now.getHours().toString().padStart(2, '0') +
        now.getMinutes().toString().padStart(2, '0') +
        now.getSeconds().toString().padStart(2, '0');
    const fileName = `novapack_backup_${companyName}_${dateStr}_${timeStr}.json`;

    // Try persistent folder if supported and linked
    if (backupDirHandle) {
        try {
            // Verify permission
            if (await backupDirHandle.queryPermission({ mode: 'readwrite' }) !== 'granted') {
                if (await backupDirHandle.requestPermission({ mode: 'readwrite' }) !== 'granted') {
                    throw new Error("Permission denied");
                }
            }
            const fileHandle = await backupDirHandle.getFileHandle(fileName, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(json);
            await writable.close();

            // Show a non-blocking notification if possible, otherwise alert
            if (typeof showNotification === 'function') {
                showNotification(`✅ Copia guardada en carpeta vinculada.`, 'success');
            } else {
                console.log("Copia guardada en carpeta vinculada.");
            }
            return;
        } catch (e) {
            console.warn("Could not save to linked folder, falling back to download:", e);
        }
    }

    // Fallback to standard download
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

function importData(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
        if (db.restoreFromJSON(ev.target.result)) {
            alert("Datos restaurados correctamente.");
            location.reload();
        } else {
            alert("Error al leer el archivo de copia de seguridad.");
        }
    };
    reader.readAsText(file);
}

/* --- PRINTING --- */
/* --- PRINTING - END --- */

function generateLabelHTML(t, index, total, weightStr) {
    // Note: Removed 'page-break-after: always' here to better control it via grid container
    // If printing single 4x6, the printer usually handles the cut/stop.
    // We keep width and margins but allow flex layout to handle positioning.
    return `
        <div class="label-item" style="width: 100mm; height: 138mm; zoom: 1; border: 3px solid #000; padding: 10px; box-sizing: border-box; font-family: sans-serif; position: relative; overflow: hidden; margin: 0 auto; display: flex; flex-direction: column; background:white; print-color-adjust: exact; -webkit-print-color-adjust: exact;">
            
            
            <!-- Header: Logo & Sender -->
            <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #FF6600; padding-bottom: 8px; margin-bottom: 8px; z-index:1;">
                <div style="width: 40%;">
                    <div style="font-family: 'Xenotron', sans-serif; font-size: 16pt; color: #FF6600; line-height: 0.9;">NOVAPACK</div>
                    <div style="font-size: 0.5rem; letter-spacing: 0.5px; color:#333;">administracion@novapack.info</div>
                </div>
                <div style="width: 60%; text-align: right; font-size: 0.7rem; color: #000; line-height: 1.1;">
                    <strong style="font-size:0.6rem; color:#666;">REMITENTE:</strong><br>
                    <strong style="font-size:0.8rem; text-transform:uppercase;">${t.sender}</strong><br>
                    ${t.senderAddress || ''}
                </div>
            </div>

            <!-- Receiver -->
            <div style="flex:1; display:flex; flex-direction:column; justify-content:center; text-align: center; z-index:1; padding-bottom: 28px;">
                <div style="font-size:0.8rem; color:#666; text-align:left; width:100%; margin-bottom:5px;">DESTINATARIO:</div>
                <div style="font-size: 20pt; font-weight: 900; line-height: 1; text-transform: uppercase; margin-bottom: 10px; color: #000;">
                    ${t.receiver}
                </div>
                <div style="font-size: 10pt; line-height: 1.2; overflow: hidden;">
                    ${t.address}
                </div>
                ${t.province ? `
                    <div style="font-size: 22pt; font-weight:900; text-transform:uppercase; color: #FF6600; margin-top: 4px; line-height: 1;">
                        ${t.province}
                    </div>
                     <div style="font-size: 14pt; font-weight:900; text-transform:uppercase; color: #000; margin-top: 5px;">
                        PORTES: ${t.shippingType.toUpperCase()}
                    </div>
                ` : ''}
                ${t.notes ? `<div style="font-size: 0.8rem; font-weight: bold; color: #333; margin-top: 10px; border-top: 1px dotted #ccc; padding-top: 5px; white-space: normal; line-height: 1.2;">OBS: ${t.notes}</div>` : ''}
            </div>

            <!-- QR Code (Absolute positioned above footer) -->
            <div class="ticket-qr-code" data-id="${t.id}" style="position: absolute; bottom: 72px; right: 10px; z-index: 50;"></div>

            <!-- Footer Info -->
            <div style="display: flex; justify-content: space-between; align-items: flex-end; border-top: 3px solid #000; padding-top: 8px; margin-top: 8px; z-index:1; background: #EEE; print-color-adjust: exact;">
                <div style="text-align: center; flex: 1;">
                    <div style="font-size: 7pt; color:#666;">Bulto</div>
                    <div style="font-size: 16pt; font-weight: bold;">${index + 1} / ${total}</div>
                </div>

                <div style="text-align: center; flex: 2; border-left: 1px solid #ccc; border-right: 1px solid #ccc;">
                    <strong style="font-size: 12pt;">${t.id}</strong>
                </div>

                <div style="text-align: center; flex: 1;">
                    <div style="font-size: 7pt; color:#666;">Peso</div>
                    <div style="font-size: 12pt; font-weight:bold;">${weightStr}</div>
                </div>
            </div>

            <!-- Date & Time Footer -->
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px; font-size: 0.65rem; color: #444; border-top: 1px solid #ccc; padding-top: 2px;">
                <span>${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}</span>
                <span style="font-weight:bold; color:#FF6600">NOVAPACK CLOUD</span>
            </div>

            <!-- COD Warning -->
            ${(t.cod && parseFloat(t.cod) > 0) ? `
            <div style="position: absolute; top: 120px; right: -5px; transform: rotate(15deg); background: white; color: black; padding: 4px 10px; font-weight: 900; border-radius: 4px; font-size: 0.8rem; border: 3px solid black; box-shadow: 2px 2px 5px rgba(0,0,0,0.2); text-align: center; line-height: 1.1; z-index: 10;">
                ATENCIÓN<br>REEMBOLSO<br>
                <span style="font-size: 1.2rem; color: black;">${t.cod} €</span>
            </div>` : ''}
        </div>
    `;
}

function printLabel(id) {
    const t = db.getOne('tickets', id);
    if (!t) return;

    const printArea = document.getElementById('print-area');
    printArea.innerHTML = '';

    // Normalize packages list
    let pkgList = [];
    if (t.packagesList) {
        t.packagesList.forEach(p => {
            const qty = parseInt(p.qty) || 1;
            for (let i = 0; i < qty; i++) pkgList.push(p);
        });
    } else {
        pkgList = Array(t.packages).fill({ weight: t.weight, size: t.size });
    }

    // Collect HTML for all labels
    let allLabelsHtml = [];
    pkgList.forEach((p, index) => {
        let w = p.weight;
        if (typeof w === 'number') w = w + " kg";
        if (typeof w === 'string' && !w.includes('kg')) w = w + " kg";
        allLabelsHtml.push(generateLabelHTML(t, index, pkgList.length, w));
    });

    // Render in A4 Chunks (4 labels per page)
    renderLabelsInA4Grid(printArea, allLabelsHtml);

    renderQRCodesInPrintArea();

    setTimeout(() => window.print(), 500);
}

// Helper to render labels in 2x2 grid for A4
function renderLabelsInA4Grid(container, labelsHtml) {
    // If only 1 label, just print it normally (assuming 4x6 printer)
    // BUT user asked for A4 support. We can try to detect or just always ensure alignment.
    // However, if we force A4 layout, single label printers might break.
    // STRATEGY: We will wrap them in a grid IF there are multiple, or just flow them.
    // The user specifically asked: "SI EL PAPEL SELECIONADO ES TAMAÑO A4...". We can't detect paper size from JS.
    // We will assume that if we are printing labels, we might be on A4.
    // To be safe for both:
    // We can wrap every 4 labels in a "page" div that ensures breaks.

    // Better approach: Just style the print area to be a grid that wraps.
    // But to force 4 per page exactly, we need page-breaks.

    let chunk = [];
    for (let i = 0; i < labelsHtml.length; i++) {
        chunk.push(labelsHtml[i]);

        if (chunk.length === 4 || i === labelsHtml.length - 1) {
            // Create a page container
            let pageDiv = document.createElement('div');
            pageDiv.style.width = "210mm"; // A4 Width
            pageDiv.style.height = "297mm"; // A4 Height
            pageDiv.style.display = "grid";
            pageDiv.style.gridTemplateColumns = "1fr 1fr";
            pageDiv.style.gridTemplateRows = "1fr 1fr";
            pageDiv.style.gap = "5mm";
            pageDiv.style.padding = "5mm";
            pageDiv.style.boxSizing = "border-box";
            pageDiv.style.pageBreakAfter = "always";
            // Ensure content doesn't overflow
            pageDiv.style.overflow = "hidden";

            // Add labels to this page
            pageDiv.innerHTML = chunk.join('');

            // Adjust label styles for grid placement if needed (remove margins/page-breaks from individual labels if inside grid)
            // The generateLabelHTML returns a div with 'page-break-after: always'. We should remove that if inside standard A4 grid.
            // But we can't easily modify the string.
            // Let's rely on the grid layout.
            // We should strip the 'page-break-after: always' from the individual label HTML string for this mode
            // or override it via CSS in the parent.

            container.appendChild(pageDiv);
            chunk = []; // Reset chunk
        }
    }
}

function printLabelShiftBatch(targetSlot) {
    const todayStr = new Date().toISOString().slice(0, 10);
    const tickets = db.getAll('tickets');

    // Filter tickets by date (TODAY) and time slot
    const shiftTickets = tickets.filter(t => {
        const tDate = t.createdAt.split('T')[0];
        return tDate === todayStr && t.timeSlot === targetSlot;
    });

    if (shiftTickets.length === 0) {
        alert(`No hay etiquetas del turno de ${targetSlot} con fecha de hoy.`);
        return;
    }

    if (!confirm(`¿IMPRIMIR TODAS LAS ETIQUETAS DEL TURNO DE ${targetSlot} (${shiftTickets.length} envíos)?`)) return;

    const printArea = document.getElementById('print-area');
    printArea.innerHTML = '';

    let allLabelsHtml = [];

    shiftTickets.forEach(t => {
        // Normalize packages list
        let pkgList = [];
        if (t.packagesList) {
            t.packagesList.forEach(p => {
                const qty = parseInt(p.qty) || 1;
                for (let i = 0; i < qty; i++) pkgList.push(p);
            });
        } else {
            pkgList = Array(t.packages).fill({ weight: t.weight, size: t.size });
        }

        pkgList.forEach((p, index) => {
            let w = p.weight;
            if (typeof w === 'number') w = w + " kg";
            if (typeof w === 'string' && !w.includes('kg')) w = w + " kg";

            allLabelsHtml.push(generateLabelHTML(t, index, pkgList.length, w));
        });
    });

    // Render in A4 Chunks
    renderLabelsInA4Grid(printArea, allLabelsHtml);


    renderQRCodesInPrintArea();

    setTimeout(() => window.print(), 500);
}

function showNotification(msg, type = 'success') {
    let toast = document.getElementById('notification-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'notification-toast';
        toast.className = 'notification-toast';
        document.body.appendChild(toast);
    }

    toast.textContent = msg;
    toast.className = `notification-toast ${type}`;

    // Force reflow
    void toast.offsetWidth;

    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

function sendPickupSMS(id) {
    const t = db.getOne('tickets', id);
    if (!t) return;

    const key = db.getKey('sms_gateway_url');
    const url = localStorage.getItem(key);

    if (!url || !url.trim()) {
        alert("⚠️ No hay pasarela SMS configurada.\nVe a '⚙️ Gestionar Empresas' -> Opción 7 para configurarla.");
        return;
    }

    // Check for phone logic is handled below with fallback to driver

    // Get Company Name for the message
    const company = getCompanyName(db.companyId);

    // Default Message
    const now = new Date();
    const fDate = now.getDate().toString().padStart(2, '0') + '/' + (now.getMonth() + 1).toString().padStart(2, '0') + '/' + now.getFullYear();
    const fTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
    const timestamp = `${fDate} ${fTime}`;
    const shift = t.timeSlot || (now.getHours() < 15 ? 'MAÑANA' : 'TARDE');
    const msgDefault = `${company.toUpperCase()} - AVISO DE RECOGIDA (${shift}) ${timestamp}: Paquetería lista para envío.`;

    // Get pickup alert phone if configured (Driver)
    const driverPhone = localStorage.getItem(db.getKey('pickup_alert_phone')) || "";

    // Manual SMS button is for "AVISO DE RECOGIDA", so we prioritize the Repartidor (Driver)
    const defaultPhone = driverPhone.trim() || (t.phone ? t.phone.trim() : "");
    const isDriver = driverPhone.trim().length > 0;

    const msg = prompt("Confirmar Mensaje SMS:", msgDefault);
    if (!msg) return;

    // Use prompt to confirm phone number
    const phoneToSend = prompt(isDriver ? "Confirmar Teléfono del REPARTIDOR:" : "Confirmar Teléfono del CLIENTE:", defaultPhone.trim());
    if (!phoneToSend) return;

    // Replace placeholders: Clean phone to avoid encoding the '+' which many gateways reject as '%2B'
    const cleanPhoneToSend = phoneToSend.trim().replace(/[\s\(\)\-]/g, '');

    let finalUrl = url.replace(/\{TELEFONO\}/gi, cleanPhoneToSend)
        .replace(/\{MENSAJE\}/gi, encodeURIComponent(msg.trim()))
        .replace(/\{FECHA\}/gi, encodeURIComponent(fDate))
        .replace(/\{HORA\}/gi, encodeURIComponent(fTime))
        .replace(/\{TURNO\}/gi, encodeURIComponent(shift));

    showNotification("Enviando SMS...", "info");

    // Use no-cors mode since we likely can't read response from external SMS APIs due to CORS
    fetch(finalUrl, { mode: 'no-cors' })
        .then(() => {
            alert("✅ Petición SMS enviada.");
        })
        .catch(e => {
            alert("❌ Error enviando SMS: " + e);
        });
}
