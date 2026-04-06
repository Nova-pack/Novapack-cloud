// =============================================
// NOVAPACK ETIQUETAS — Label-focused shipping app
// Ready for deployment (latent)
// =============================================

(function() {
'use strict';

// --- GLOBALS ---
var currentUser = null;
var userData = null;
var currentCompanyId = null;
var companyData = null;
var tickets = [];
var destinations = [];
var provinces = [];
var selectedTicketId = null;
var editingTicketId = null;
var printCallback = null;

// --- LABEL FORMATS ---
var LABEL_FORMATS = [
    { id: '6x4',  name: '6 × 4 pulgadas',  w: 152, h: 102, desc: '152 × 102 mm — Estándar transporte', icon: '6×4' },
    { id: '4x6',  name: '4 × 6 pulgadas',  w: 102, h: 152, desc: '102 × 152 mm — Vertical estándar', icon: '4×6' },
    { id: '4x4',  name: '4 × 4 pulgadas',  w: 102, h: 102, desc: '102 × 102 mm — Cuadrada', icon: '4×4' },
    { id: '4x3',  name: '4 × 3 pulgadas',  w: 102, h: 76,  desc: '102 × 76 mm — Mediana', icon: '4×3' },
    { id: '4x2',  name: '4 × 2 pulgadas',  w: 102, h: 51,  desc: '102 × 51 mm — Dirección pequeña', icon: '4×2' },
    { id: '3x2',  name: '3 × 2 pulgadas',  w: 76,  h: 51,  desc: '76 × 51 mm — Mini', icon: '3×2' },
    { id: '100x150', name: '100 × 150 mm',  w: 100, h: 150, desc: 'DHL / GLS / SEUR estándar', icon: '100' },
    { id: '100x200', name: '100 × 200 mm',  w: 100, h: 200, desc: 'Etiqueta larga', icon: '200' }
];
var currentFormat = LABEL_FORMATS[0]; // Default: 6x4

// --- HELPERS ---
function escapeHtml(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showToast(msg, type) {
    type = type || 'info';
    var c = document.getElementById('toast-container');
    var t = document.createElement('div');
    t.className = 'toast ' + type;
    t.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px;">' +
        (type === 'success' ? 'check_circle' : type === 'error' ? 'error' : 'info') +
        '</span>' + escapeHtml(msg);
    c.appendChild(t);
    setTimeout(function() { t.remove(); }, 4000);
}

function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

function nowTimeStr() {
    var d = new Date();
    return d.toLocaleTimeString('es-ES', { hour:'2-digit', minute:'2-digit' });
}

// --- WAIT FOR FIREBASE ---
function waitForFirebase(cb) {
    if (typeof firebase !== 'undefined' && firebase.auth && firebase.firestore) {
        cb();
    } else {
        setTimeout(function() { waitForFirebase(cb); }, 100);
    }
}

// --- PROVINCES ---
var defaultProvinces = [
    'Álava','Albacete','Alicante','Almería','Asturias','Ávila','Badajoz','Barcelona',
    'Burgos','Cáceres','Cádiz','Cantabria','Castellón','Ciudad Real','Córdoba','Cuenca',
    'Gerona','Granada','Guadalajara','Guipúzcoa','Huelva','Huesca','Islas Baleares',
    'Jaén','La Coruña','La Rioja','Las Palmas','León','Lérida','Lugo','Madrid','Málaga',
    'Murcia','Navarra','Orense','Palencia','Pontevedra','Salamanca','Santa Cruz de Tenerife',
    'Segovia','Sevilla','Soria','Tarragona','Teruel','Toledo','Valencia','Valladolid',
    'Vizcaya','Zamora','Zaragoza','Ceuta','Melilla'
];

function loadProvinces() {
    var sel = document.getElementById('f-province');
    var list = provinces.length > 0 ? provinces : defaultProvinces;
    list.forEach(function(p) {
        var opt = document.createElement('option');
        opt.value = p;
        opt.textContent = p;
        sel.appendChild(opt);
    });
}

// --- PACKAGE TYPES ---
var packageTypes = ['Pequeño','Mediano','Grande','Sobre','Palet','BATERÍAS','TAMBOR CAMIÓN','CALIPER','Otro'];

function addPackageRow(type, qty, weight) {
    var list = document.getElementById('pkg-list');
    var row = document.createElement('div');
    row.className = 'pkg-row';
    row.innerHTML =
        '<select class="pkg-type">' + packageTypes.map(function(t) {
            return '<option value="' + t + '"' + (t === type ? ' selected' : '') + '>' + t + '</option>';
        }).join('') + '</select>' +
        '<input type="number" class="pkg-qty" placeholder="Cant." min="1" value="' + (qty || 1) + '" style="width:65px;">' +
        '<input type="number" class="pkg-weight" placeholder="Kg" min="0" step="0.1" value="' + (weight || '') + '" style="width:65px;">' +
        '<button class="btn-del-pkg" title="Eliminar"><span class="material-symbols-outlined" style="font-size:16px;">close</span></button>';
    row.querySelector('.btn-del-pkg').onclick = function() {
        row.remove();
        updatePreview();
    };
    row.querySelectorAll('input, select').forEach(function(el) {
        el.addEventListener('input', updatePreview);
    });
    list.appendChild(row);
}

// --- FORM DATA ---
function getFormData() {
    var pkgRows = document.querySelectorAll('#pkg-list .pkg-row');
    var packagesList = [];
    var totalPkgs = 0;
    var totalWeight = 0;
    pkgRows.forEach(function(row) {
        var type = row.querySelector('.pkg-type').value;
        var qty = parseInt(row.querySelector('.pkg-qty').value) || 1;
        var weight = parseFloat(row.querySelector('.pkg-weight').value) || 0;
        packagesList.push({ type: type, qty: qty, weight: weight });
        totalPkgs += qty;
        totalWeight += weight * qty;
    });
    if (packagesList.length === 0) {
        packagesList.push({ type: 'Mediano', qty: 1, weight: 0 });
        totalPkgs = 1;
    }

    return {
        receiver: document.getElementById('f-receiver').value.trim(),
        receiverNif: document.getElementById('f-nif').value.trim().toUpperCase(),
        phone: document.getElementById('f-phone').value.trim(),
        address: document.getElementById('f-address').value.trim(),
        localidad: document.getElementById('f-localidad').value.trim(),
        cp: document.getElementById('f-cp').value.trim(),
        province: document.getElementById('f-province').value,
        packagesList: packagesList,
        packages: totalPkgs,
        weight: totalWeight,
        timeSlot: document.getElementById('f-slot').value,
        shippingType: document.getElementById('f-shipping-type').value,
        cod: parseFloat(document.getElementById('f-cod').value) || 0,
        notes: document.getElementById('f-notes').value.trim()
    };
}

function clearForm() {
    ['f-receiver','f-nif','f-phone','f-address','f-localidad','f-cp','f-notes','f-cod'].forEach(function(id) {
        document.getElementById(id).value = '';
    });
    document.getElementById('f-province').value = '';
    document.getElementById('f-slot').value = new Date().getHours() < 15 ? 'MAÑANA' : 'TARDE';
    document.getElementById('f-shipping-type').value = 'Pagados';
    document.getElementById('pkg-list').innerHTML = '';
    addPackageRow('Mediano', 1, '');
    editingTicketId = null;
    document.querySelector('.form-title').innerHTML = '<span class="material-symbols-outlined icon-filled">label</span> Nuevo Envío';
    updatePreview();
}

function loadTicketIntoForm(t) {
    document.getElementById('f-receiver').value = t.receiver || '';
    document.getElementById('f-nif').value = t.receiverNif || '';
    document.getElementById('f-phone').value = t.phone || '';
    document.getElementById('f-address').value = t.address || '';
    document.getElementById('f-localidad').value = t.localidad || '';
    document.getElementById('f-cp').value = t.cp || '';
    document.getElementById('f-province').value = t.province || '';
    document.getElementById('f-slot').value = t.timeSlot || 'MAÑANA';
    document.getElementById('f-shipping-type').value = t.shippingType || 'Pagados';
    document.getElementById('f-cod').value = t.cod || '';
    document.getElementById('f-notes').value = t.notes || '';

    document.getElementById('pkg-list').innerHTML = '';
    if (t.packagesList && t.packagesList.length > 0) {
        t.packagesList.forEach(function(p) { addPackageRow(p.type, p.qty, p.weight); });
    } else {
        addPackageRow('Mediano', t.packages || 1, '');
    }
    editingTicketId = t._id;
    document.querySelector('.form-title').innerHTML = '<span class="material-symbols-outlined icon-filled">edit</span> Editar Envío';
    updatePreview();
}

// --- LIVE PREVIEW ---
function updatePreview() {
    var d = getFormData();
    var now = new Date();

    // Date
    document.getElementById('lbl-date').innerHTML =
        String(now.getDate()).padStart(2,'0') + '/' + String(now.getMonth()+1).padStart(2,'0') + '/' + now.getFullYear() +
        '<br>' + nowTimeStr();

    // Sender
    if (companyData) {
        document.getElementById('lbl-sender-name').textContent = companyData.name || '---';
        document.getElementById('lbl-sender-addr').textContent = [companyData.address, companyData.localidad].filter(Boolean).join(', ') || '---';
    }

    // Destination
    document.getElementById('lbl-dest-name').textContent = d.receiver || 'NOMBRE DESTINATARIO';
    document.getElementById('lbl-dest-addr').textContent =
        [d.address, d.localidad, d.cp].filter(Boolean).join(', ') || 'Dirección completa';
    document.getElementById('lbl-dest-province').textContent = d.province || 'PROVINCIA';

    // Package info
    document.getElementById('lbl-pkg').textContent = 'Bulto 1 / ' + d.packages;
    document.getElementById('lbl-weight').textContent = d.weight > 0 ? d.weight.toFixed(1) + ' kg' : '---';

    // COD banner
    var codBanner = document.getElementById('lbl-cod-banner');
    if (d.cod > 0) {
        codBanner.textContent = 'REEMBOLSO €' + d.cod.toFixed(2);
        codBanner.classList.add('visible');
    } else {
        codBanner.classList.remove('visible');
    }

    // ID
    document.getElementById('lbl-id').textContent = editingTicketId ? editingTicketId.substring(0, 10).toUpperCase() : 'NP-NUEVO';

    // QR
    try {
        if (typeof qrcode !== 'undefined') {
            var qr = qrcode(0, 'M');
            var qrData = JSON.stringify({
                r: d.receiver, a: d.address, cp: d.cp, p: d.province,
                pk: d.packages, w: d.weight
            });
            qr.addData(qrData.substring(0, 200));
            qr.make();
            document.getElementById('lbl-qr-placeholder').innerHTML =
                '<img src="' + qr.createDataURL(3, 0) + '" style="width:48px;height:48px;">';
        }
    } catch(e) { /* QR lib not loaded yet */ }
}

// --- TICKET LIST ---
function renderTicketList(list) {
    var el = document.getElementById('ticket-list');
    var search = (document.getElementById('search-input').value || '').toLowerCase();

    var filtered = list;
    if (search) {
        filtered = list.filter(function(t) {
            return (t.receiver || '').toLowerCase().includes(search) ||
                   (t.address || '').toLowerCase().includes(search) ||
                   (t.cp || '').includes(search);
        });
    }

    if (filtered.length === 0) {
        el.innerHTML = '<div class="empty-state"><span class="material-symbols-outlined">inbox</span><p>' +
            (search ? 'Sin resultados' : 'Sin envíos hoy') + '</p></div>';
        return;
    }

    el.innerHTML = filtered.map(function(t) {
        var pkgs = t.packages || 1;
        var isPrinted = t.labelPrinted || t.printed;
        return '<div class="ticket-item' + (isPrinted ? ' printed' : '') +
            (t._id === selectedTicketId ? ' active' : '') +
            '" data-id="' + t._id + '">' +
            '<div class="ti-status"></div>' +
            '<div class="ti-info">' +
                '<div class="ti-name">' + escapeHtml(t.receiver || '---') + '</div>' +
                '<div class="ti-addr">' + escapeHtml([t.address, t.localidad, t.cp].filter(Boolean).join(', ')) + '</div>' +
                '<div class="ti-meta">' +
                    '<span>' + (t.timeSlot || '---') + '</span>' +
                    (t.cod > 0 ? '<span style="color:#FF3B30;">COD €' + t.cod.toFixed(2) + '</span>' : '') +
                '</div>' +
            '</div>' +
            '<div class="ti-pkgs">' + pkgs + ' bto' + (pkgs > 1 ? 's' : '') + '</div>' +
        '</div>';
    }).join('');

    // Click handlers
    el.querySelectorAll('.ticket-item').forEach(function(item) {
        item.addEventListener('click', function() {
            var id = this.getAttribute('data-id');
            selectedTicketId = id;
            var t = tickets.find(function(tk) { return tk._id === id; });
            if (t) loadTicketIntoForm(t);
            renderTicketList(tickets);
        });
    });
}

// --- SAVE TICKET ---
async function saveTicket(andPrint) {
    var d = getFormData();

    // Validation
    if (!d.receiver) { showToast('Falta el nombre del destinatario', 'error'); return; }
    if (!d.address) { showToast('Falta la dirección', 'error'); return; }
    if (!d.cp || d.cp.length !== 5) { showToast('Código postal inválido', 'error'); return; }
    if (!d.province) { showToast('Selecciona la provincia', 'error'); return; }

    var ticketData = {
        receiver: d.receiver,
        receiverNif: d.receiverNif,
        phone: d.phone,
        address: d.address,
        localidad: d.localidad,
        cp: d.cp,
        province: d.province,
        packagesList: d.packagesList,
        packages: d.packages,
        weight: d.weight,
        timeSlot: d.timeSlot,
        shippingType: d.shippingType,
        cod: d.cod,
        notes: d.notes,
        sender: companyData ? companyData.name : '',
        senderAddress: companyData ? companyData.address : '',
        senderPhone: companyData ? companyData.phone : '',
        senderNif: companyData ? companyData.nif : '',
        companyId: currentCompanyId || '',
        userId: userData ? userData.id : '',
        userEmail: currentUser ? currentUser.email : '',
        status: 'Pendiente',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        dateStr: todayStr(),
        labelPrinted: false,
        source: 'etiquetas-app'
    };

    try {
        var docRef;
        if (editingTicketId) {
            await db.collection('tickets').doc(editingTicketId).update(ticketData);
            docRef = { id: editingTicketId };
            showToast('Envío actualizado', 'success');
        } else {
            docRef = await db.collection('tickets').add(ticketData);
            showToast('Envío creado', 'success');
        }

        if (andPrint) {
            ticketData._id = docRef.id;
            openPaperModal(function(paper) {
                printLabels([ticketData], paper);
                db.collection('tickets').doc(docRef.id).update({ labelPrinted: true });
            });
        }

        clearForm();
    } catch(e) {
        showToast('Error al guardar: ' + e.message, 'error');
        console.error(e);
    }
}

// --- PRINT LABELS ---
function generatePrintLabelHTML(t, bultoIndex, totalBultos) {
    var now = t.createdAt ? (t.createdAt.toDate ? t.createdAt.toDate() : new Date(t.createdAt)) : new Date();
    var dateStr = String(now.getDate()).padStart(2,'0') + '/' + String(now.getMonth()+1).padStart(2,'0') + '/' + now.getFullYear();
    var timeStr = now.toLocaleTimeString('es-ES', { hour:'2-digit', minute:'2-digit' });
    var weight = t.weight ? parseFloat(t.weight).toFixed(1) + ' kg' : '---';
    var id = (t._id || '').substring(0, 12).toUpperCase();

    // QR
    var qrImg = '';
    try {
        if (typeof qrcode !== 'undefined') {
            var qr = qrcode(0, 'M');
            qr.addData(JSON.stringify({
                id: t._id, r: t.receiver, a: t.address, cp: t.cp, p: t.province,
                pk: totalBultos, b: bultoIndex, w: t.weight
            }).substring(0, 250));
            qr.make();
            qrImg = '<img src="' + qr.createDataURL(4, 0) + '" style="width:70px;height:70px;">';
        }
    } catch(e) {}

    var codHtml = '';
    if (t.cod > 0) {
        codHtml = '<div style="position:absolute; top:40%; right:-25px; transform:rotate(-15deg); background:#FF3B30; color:#fff; padding:3px 40px; font-size:8pt; font-weight:800; letter-spacing:0.5px;">REEMBOLSO €' + t.cod.toFixed(2) + '</div>';
    }

    var lW = currentFormat.w + 'mm';
    var lH = currentFormat.h + 'mm';
    // Adaptive font sizes based on label area
    var area = currentFormat.w * currentFormat.h;
    var isSmall = area < 6000;
    var namePt = isSmall ? '12pt' : '16pt';
    var addrPt = isSmall ? '7pt' : '9pt';
    var provPt = isSmall ? '10pt' : '14pt';
    var qrSize = isSmall ? '50px' : '70px';
    var qrBox = isSmall ? '54px' : '72px';

    return '<div class="print-label" style="width:' + lW + ';height:' + lH + ';position:relative;overflow:hidden;font-family:Inter,Arial,sans-serif;color:#000;background:#fff;">' +
        // Header
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;padding:3mm 4mm 2mm;border-bottom:0.8mm solid #FF6600;">' +
            '<div style="font-family:Outfit,sans-serif;font-weight:700;font-size:14pt;letter-spacing:1px;color:#FF6600;">NOVAPACK</div>' +
            '<div style="font-size:7pt;color:#666;text-align:right;line-height:1.3;">' + dateStr + '<br>' + timeStr + '</div>' +
        '</div>' +
        // Sender
        '<div style="padding:1.5mm 4mm;font-size:7pt;color:#555;background:#f5f5f5;border-bottom:0.3mm solid #ddd;">' +
            '<strong style="color:#333;">REM:</strong> ' + escapeHtml(t.sender || '') +
            (t.senderAddress ? ' — ' + escapeHtml(t.senderAddress) : '') +
        '</div>' +
        // Body
        '<div style="flex:1;padding:3mm 4mm;position:relative;display:flex;flex-direction:column;justify-content:center;min-height:45mm;">' +
            '<div style="font-size:6pt;color:#999;text-transform:uppercase;letter-spacing:1px;margin-bottom:1mm;">DESTINATARIO</div>' +
            '<div style="font-size:' + namePt + ';font-weight:900;text-transform:uppercase;color:#000;line-height:1.1;">' + escapeHtml(t.receiver || '') + '</div>' +
            '<div style="font-size:' + addrPt + ';color:#333;margin-top:1.5mm;line-height:1.3;">' +
                escapeHtml([t.address, t.localidad, t.cp].filter(Boolean).join(', ')) +
            '</div>' +
            '<div style="font-size:' + provPt + ';font-weight:900;color:#FF6600;text-transform:uppercase;margin-top:2mm;">' + escapeHtml(t.province || '') + '</div>' +
            (t.notes && !isSmall ? '<div style="font-size:7pt;color:#666;margin-top:2mm;border-top:0.3mm dotted #ccc;padding-top:1.5mm;">' + escapeHtml(t.notes) + '</div>' : '') +
            // QR
            '<div style="position:absolute;right:3mm;bottom:1mm;width:' + qrBox + ';height:' + qrBox + ';border:0.3mm solid #ddd;border-radius:2px;display:flex;align-items:center;justify-content:center;background:#fff;">' +
                qrImg +
            '</div>' +
            codHtml +
        '</div>' +
        // Footer
        '<div style="display:flex;justify-content:space-between;align-items:center;padding:2mm 4mm;border-top:0.6mm solid #222;background:#111;color:#fff;font-size:8pt;font-weight:700;position:absolute;bottom:0;left:0;right:0;">' +
            '<span>Bulto ' + bultoIndex + ' / ' + totalBultos + '</span>' +
            '<span style="font-size:10pt;font-weight:900;letter-spacing:0.5px;">' + id + '</span>' +
            '<span>' + weight + '</span>' +
        '</div>' +
        (t.timeSlot ? '<div style="position:absolute;bottom:8mm;left:4mm;font-size:6pt;color:#aaa;">' + t.timeSlot + '</div>' : '') +
    '</div>';
}

function printLabels(ticketList, paper) {
    var printArea = document.getElementById('print-area');
    var html = '';

    // Set CSS vars for current label format (forces NOVAPACK's format)
    document.documentElement.style.setProperty('--label-w', currentFormat.w + 'mm');
    document.documentElement.style.setProperty('--label-h', currentFormat.h + 'mm');

    if (paper === 'a4') {
        printArea.className = 'print-area a4-mode';
    } else {
        printArea.className = 'print-area';
    }

    ticketList.forEach(function(t) {
        var total = t.packages || 1;
        for (var i = 1; i <= total; i++) {
            html += generatePrintLabelHTML(t, i, total);
        }
    });

    printArea.innerHTML = html;
    printArea.style.display = 'block';
    setTimeout(function() {
        window.print();
        setTimeout(function() {
            printArea.style.display = 'none';
            printArea.innerHTML = '';
        }, 1000);
    }, 300);
}

function openPaperModal(callback) {
    printCallback = callback;
    document.getElementById('paper-modal').classList.add('open');
}

// --- BATCH PRINT ---
function printBatch(slot) {
    var batch = tickets.filter(function(t) {
        return t.timeSlot === slot && !t.labelPrinted && !t.printed;
    });
    if (batch.length === 0) {
        showToast('No hay etiquetas sin imprimir para ' + slot, 'info');
        return;
    }
    openPaperModal(function(paper) {
        printLabels(batch, paper);
        // Mark as printed
        batch.forEach(function(t) {
            db.collection('tickets').doc(t._id).update({ labelPrinted: true });
        });
        showToast(batch.length + ' etiqueta(s) enviadas a impresión', 'success');
    });
}

// --- FIRESTORE LISTENERS ---
var unsubTickets = null;

function startTicketListener() {
    if (unsubTickets) unsubTickets();
    if (!userData) return;

    var q = db.collection('tickets')
        .where('userEmail', '==', currentUser.email)
        .where('dateStr', '==', todayStr())
        .orderBy('createdAt', 'desc');

    unsubTickets = q.onSnapshot(function(snap) {
        tickets = [];
        snap.forEach(function(doc) {
            var t = doc.data();
            t._id = doc.id;
            tickets.push(t);
        });
        renderTicketList(tickets);
    }, function(err) {
        console.error('Ticket listener error:', err);
        // Fallback without orderBy
        var q2 = db.collection('tickets')
            .where('userEmail', '==', currentUser.email)
            .where('dateStr', '==', todayStr());
        unsubTickets = q2.onSnapshot(function(snap) {
            tickets = [];
            snap.forEach(function(doc) {
                var t = doc.data();
                t._id = doc.id;
                tickets.push(t);
            });
            renderTicketList(tickets);
        });
    });
}

async function loadCompany() {
    if (!userData || !currentUser) return;
    var uid = userData.id || currentUser.uid;

    try {
        var snap = await db.collection('users').doc(uid).collection('companies').get();
        if (!snap.empty) {
            var doc = snap.docs[0];
            companyData = doc.data();
            currentCompanyId = doc.id;
            document.getElementById('company-name').textContent = companyData.name || '---';
        }
    } catch(e) { console.warn('Company load error:', e); }
}

async function loadDestinations() {
    if (!userData || !currentUser) return;
    var uid = userData.id || currentUser.uid;

    try {
        var snap = await db.collection('users').doc(uid).collection('destinations').get();
        destinations = [];
        snap.forEach(function(doc) {
            var d = doc.data();
            d._id = doc.id;
            destinations.push(d);
        });
    } catch(e) { console.warn('Destinations load error:', e); }
}

// --- LABEL FORMAT MANAGEMENT ---
// Load saved format for this company from Firestore
async function loadLabelFormat() {
    if (!currentCompanyId || !userData) return;
    var uid = userData.id || currentUser.uid;
    try {
        var doc = await db.collection('users').doc(uid).collection('companies').doc(currentCompanyId).get();
        if (doc.exists && doc.data().labelFormat) {
            var saved = doc.data().labelFormat;
            // Find matching preset or create custom
            var match = LABEL_FORMATS.find(function(f) { return f.id === saved.id; });
            if (match) {
                currentFormat = match;
            } else if (saved.w && saved.h) {
                currentFormat = { id: 'custom', name: 'Personalizado', w: saved.w, h: saved.h, desc: saved.w + ' × ' + saved.h + ' mm', icon: 'C' };
            }
            updateFormatUI();
        }
    } catch(e) { console.warn('Label format load error:', e); }
}

// Save format to company in Firestore (blindaje: locked per company)
async function saveLabelFormat(format) {
    currentFormat = format;
    updateFormatUI();
    if (!currentCompanyId || !userData) return;
    var uid = userData.id || currentUser.uid;
    try {
        await db.collection('users').doc(uid).collection('companies').doc(currentCompanyId).update({
            labelFormat: { id: format.id, w: format.w, h: format.h, name: format.name }
        });
        showToast('Formato guardado: ' + format.name + ' — bloqueado para esta empresa', 'success');
    } catch(e) {
        console.warn('Format save error:', e);
        showToast('Formato aplicado (no se pudo guardar)', 'info');
    }
}

function updateFormatUI() {
    // Update badge in toolbar
    var badge = document.getElementById('format-badge');
    if (badge) badge.textContent = currentFormat.w + '×' + currentFormat.h;
    // Update preview header
    var previewLabel = document.getElementById('preview-format-label');
    if (previewLabel) previewLabel.textContent = currentFormat.w + '×' + currentFormat.h + 'mm';
    // Update label preview aspect ratio
    var lp = document.querySelector('.label-preview');
    if (lp) {
        var maxW = 340;
        var ratio = currentFormat.h / currentFormat.w;
        lp.style.width = maxW + 'px';
        lp.style.height = Math.round(maxW * ratio) + 'px';
    }
    // Set CSS vars
    document.documentElement.style.setProperty('--label-w', currentFormat.w + 'mm');
    document.documentElement.style.setProperty('--label-h', currentFormat.h + 'mm');
}

function renderFormatModal() {
    var list = document.getElementById('format-list');
    if (!list) return;
    list.innerHTML = LABEL_FORMATS.map(function(f) {
        var isActive = currentFormat.id === f.id;
        return '<div class="format-item' + (isActive ? ' active' : '') + '" data-format-id="' + f.id + '">' +
            '<div class="format-icon">' + f.icon + '</div>' +
            '<div class="format-info">' +
                '<div class="format-name">' + f.name +
                    (isActive ? '<span class="format-lock"><span class="material-symbols-outlined" style="font-size:12px;">lock</span>ACTIVO</span>' : '') +
                '</div>' +
                '<div class="format-dims">' + f.desc + '</div>' +
            '</div>' +
            '<span class="material-symbols-outlined format-check icon-filled">' + (isActive ? 'check_circle' : 'radio_button_unchecked') + '</span>' +
        '</div>';
    }).join('');

    // Add custom format if active and not in presets
    if (currentFormat.id === 'custom') {
        list.innerHTML += '<div class="format-item active">' +
            '<div class="format-icon">C</div>' +
            '<div class="format-info">' +
                '<div class="format-name">Personalizado<span class="format-lock"><span class="material-symbols-outlined" style="font-size:12px;">lock</span>ACTIVO</span></div>' +
                '<div class="format-dims">' + currentFormat.w + ' × ' + currentFormat.h + ' mm</div>' +
            '</div>' +
            '<span class="material-symbols-outlined format-check icon-filled" style="color:var(--primary);">check_circle</span>' +
        '</div>';
    }

    // Click handlers
    list.querySelectorAll('.format-item[data-format-id]').forEach(function(item) {
        item.addEventListener('click', function() {
            var fId = this.getAttribute('data-format-id');
            var format = LABEL_FORMATS.find(function(f) { return f.id === fId; });
            if (format) {
                saveLabelFormat(format);
                renderFormatModal(); // re-render to update active state
                updatePreview();
            }
        });
    });
}

// --- CLIENT PICKER AUTOCOMPLETE ---
function initClientPicker() {
    var input = document.getElementById('client-picker');
    var wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:relative;';
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);

    var dropdown = document.createElement('div');
    dropdown.style.cssText = 'position:absolute;top:100%;left:0;right:0;background:#1a1d21;border:1px solid rgba(255,255,255,0.1);border-radius:4px;max-height:200px;overflow-y:auto;z-index:50;display:none;';
    wrapper.appendChild(dropdown);

    input.addEventListener('input', function() {
        var val = this.value.toLowerCase();
        if (val.length < 2) { dropdown.style.display = 'none'; return; }
        var matches = destinations.filter(function(d) {
            return (d.name || '').toLowerCase().includes(val) ||
                   (d.receiver || '').toLowerCase().includes(val) ||
                   (d.address || '').toLowerCase().includes(val);
        }).slice(0, 8);

        if (matches.length === 0) { dropdown.style.display = 'none'; return; }
        dropdown.innerHTML = matches.map(function(d) {
            return '<div style="padding:8px 12px;cursor:pointer;font-size:0.8rem;border-bottom:1px solid rgba(255,255,255,0.05);transition:background 0.15s;" ' +
                'onmouseenter="this.style.background=\'rgba(255,102,0,0.1)\'" onmouseleave="this.style.background=\'none\'" ' +
                'data-idx="' + destinations.indexOf(d) + '">' +
                '<div style="font-weight:600;">' + escapeHtml(d.receiver || d.name || '---') + '</div>' +
                '<div style="font-size:0.7rem;color:#888;">' + escapeHtml([d.address, d.localidad, d.cp].filter(Boolean).join(', ')) + '</div>' +
            '</div>';
        }).join('');
        dropdown.style.display = 'block';

        dropdown.querySelectorAll('div[data-idx]').forEach(function(item) {
            item.addEventListener('click', function() {
                var idx = parseInt(this.getAttribute('data-idx'));
                var dest = destinations[idx];
                if (dest) {
                    document.getElementById('f-receiver').value = dest.receiver || dest.name || '';
                    document.getElementById('f-nif').value = dest.nif || '';
                    document.getElementById('f-phone').value = dest.phone || '';
                    document.getElementById('f-address').value = dest.address || '';
                    document.getElementById('f-localidad').value = dest.localidad || '';
                    document.getElementById('f-cp').value = dest.cp || '';
                    document.getElementById('f-province').value = dest.province || '';
                    updatePreview();
                }
                dropdown.style.display = 'none';
                input.value = '';
            });
        });
    });

    document.addEventListener('click', function(e) {
        if (!wrapper.contains(e.target)) dropdown.style.display = 'none';
    });
}

// --- INIT ---
waitForFirebase(function() {
    auth.onAuthStateChanged(async function(user) {
        if (!user) {
            window.location.href = '../index.html';
            return;
        }
        currentUser = user;
        document.getElementById('user-display-name').textContent = user.displayName || user.email;

        // Load user profile
        try {
            var snap = await db.collection('users').where('email', '==', user.email).limit(1).get();
            if (!snap.empty) {
                userData = snap.docs[0].data();
                userData.id = snap.docs[0].id;
            } else {
                userData = { id: user.uid, email: user.email };
            }
        } catch(e) {
            userData = { id: user.uid, email: user.email };
        }

        // Load data in parallel
        await Promise.all([loadCompany(), loadDestinations()]);
        await loadLabelFormat(); // Load saved format for this company
        updateFormatUI();
        loadProvinces();
        initClientPicker();
        startTicketListener();
        clearForm();
        updatePreview();

        showToast('Bienvenido a NOVAPACK Etiquetas', 'success');
    });
});

// --- EVENT LISTENERS ---
document.addEventListener('DOMContentLoaded', function() {
    // Form field changes → update preview
    ['f-receiver','f-nif','f-phone','f-address','f-localidad','f-cp','f-province',
     'f-slot','f-shipping-type','f-cod','f-notes'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.addEventListener('input', updatePreview);
    });

    // Buttons
    document.getElementById('btn-save').addEventListener('click', function() { saveTicket(false); });
    document.getElementById('btn-save-print').addEventListener('click', function() { saveTicket(true); });
    document.getElementById('btn-clear').addEventListener('click', clearForm);
    document.getElementById('btn-new-ticket').addEventListener('click', clearForm);
    document.getElementById('btn-add-pkg').addEventListener('click', function() { addPackageRow('Mediano', 1, ''); updatePreview(); });

    // Search
    document.getElementById('search-input').addEventListener('input', function() { renderTicketList(tickets); });

    // Batch print
    document.getElementById('btn-print-morning').addEventListener('click', function() { printBatch('MAÑANA'); });
    document.getElementById('btn-print-afternoon').addEventListener('click', function() { printBatch('TARDE'); });

    // Preview print
    document.getElementById('btn-preview-print').addEventListener('click', function() {
        if (!editingTicketId) { showToast('Guarda el envío primero', 'info'); return; }
        var t = tickets.find(function(tk) { return tk._id === editingTicketId; });
        if (t) {
            openPaperModal(function(paper) {
                printLabels([t], paper);
                db.collection('tickets').doc(t._id).update({ labelPrinted: true });
            });
        }
    });

    // Paper modal options
    document.querySelectorAll('.paper-option').forEach(function(opt) {
        opt.addEventListener('click', function() {
            var paper = this.getAttribute('data-paper');
            document.getElementById('paper-modal').classList.remove('open');
            if (printCallback) {
                printCallback(paper);
                printCallback = null;
            }
        });
    });

    // Format selector button
    document.getElementById('btn-label-format').addEventListener('click', function() {
        renderFormatModal();
        document.getElementById('format-modal').classList.add('open');
    });

    // Custom format
    document.getElementById('btn-custom-format').addEventListener('click', function() {
        var w = parseInt(document.getElementById('custom-w').value);
        var h = parseInt(document.getElementById('custom-h').value);
        if (!w || !h || w < 20 || h < 20 || w > 300 || h > 300) {
            showToast('Dimensiones inválidas (20-300mm)', 'error');
            return;
        }
        var custom = { id: 'custom', name: 'Personalizado', w: w, h: h, desc: w + ' × ' + h + ' mm', icon: 'C' };
        saveLabelFormat(custom);
        renderFormatModal();
        updatePreview();
        document.getElementById('custom-w').value = '';
        document.getElementById('custom-h').value = '';
    });

    // Auto-detect time slot
    document.getElementById('f-slot').value = new Date().getHours() < 15 ? 'MAÑANA' : 'TARDE';

    // Init first package row
    addPackageRow('Mediano', 1, '');
});

})();
