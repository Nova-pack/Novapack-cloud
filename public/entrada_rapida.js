// =============================================================
// ⚡ ENTRADA RÁPIDA DE ALBARANES — ventana CRM clásica
// =============================================================
// Ventana modal (estilo Windows) de alta velocidad por teclado:
//   - CLIENTE con buscador (al enfocar YA muestra la lista;
//     escribir filtra por nombre o nº)
//   - DESTINATARIO con buscador doble: destinos conocidos del
//     cliente (sus últimos albaranes) + DIRECTORIO GLOBAL 🌐
//     (6.315 registros gesco) — elegir rellena dirección, CP,
//     localidad, provincia y teléfono de golpe
//   - PROVINCIA como desplegable (teclado nativo) y auto por CP
//   - ARTÍCULO con buscador del catálogo
//   - ENTER avanza; en el último campo GUARDA y limpia el
//     destino manteniendo el cliente → siguiente albarán del taco
//   - Los creados van apareciendo abajo con su número y botón 🖨️
//
// El guardado usa el MISMO esquema que el flujo manual del admin
// (docId {idNum}_{compId}_{businessId}, auto-ruta por CP) y
// numeración ATÓMICA vía ticket_counters (como la app cliente).
// =============================================================
(function () {
    'use strict';

    let _routes = null;
    let _articles = null;
    let _clientsIndex = null;
    let _compsCache = {};
    let _destCache = {};
    let _win = null;
    let _client = null;      // {id, idNum, name}
    let _comps = null;
    let _createdCount = 0;

    const PROV_BY_CP = {
        '01': 'Álava', '02': 'Albacete', '03': 'Alicante', '04': 'Almería', '05': 'Ávila',
        '06': 'Badajoz', '07': 'Baleares', '08': 'Barcelona', '09': 'Burgos', '10': 'Cáceres',
        '11': 'Cádiz', '12': 'Castellón', '13': 'Ciudad Real', '14': 'Córdoba', '15': 'A Coruña',
        '16': 'Cuenca', '17': 'Girona', '18': 'Granada', '19': 'Guadalajara', '20': 'Guipúzcoa',
        '21': 'Huelva', '22': 'Huesca', '23': 'Jaén', '24': 'León', '25': 'Lleida',
        '26': 'La Rioja', '27': 'Lugo', '28': 'Madrid', '29': 'Málaga', '30': 'Murcia',
        '31': 'Navarra', '32': 'Ourense', '33': 'Asturias', '34': 'Palencia', '35': 'Las Palmas',
        '36': 'Pontevedra', '37': 'Salamanca', '38': 'S.C. Tenerife', '39': 'Cantabria', '40': 'Segovia',
        '41': 'Sevilla', '42': 'Soria', '43': 'Tarragona', '44': 'Teruel', '45': 'Toledo',
        '46': 'Valencia', '47': 'Valladolid', '48': 'Vizcaya', '49': 'Zamora', '50': 'Zaragoza',
        '51': 'Ceuta', '52': 'Melilla'
    };
    const PROVINCES = Object.values(PROV_BY_CP).sort((a, b) => a.localeCompare(b));

    function _esc(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    // ── datos ──
    async function _loadRoutes() {
        if (_routes) return _routes;
        _routes = [];
        try {
            const snap = await db.collection('config').doc('phones').collection('list').get();
            snap.forEach(d => {
                const r = d.data();
                if (r.label) _routes.push({
                    label: String(r.label).trim().toLowerCase(),
                    phone: r.number ? String(r.number).replace(/\D/g, '').replace(/^34/, '') : ''
                });
            });
        } catch (e) { console.warn('[ER] rutas:', e); }
        return _routes;
    }

    async function _loadArticles() {
        if (_articles) return _articles;
        _articles = [];
        try {
            const snap = await db.collection('articles').get();
            snap.forEach(d => {
                const a = d.data();
                const name = a.name || a.nombre || d.id;
                if (name) _articles.push(String(name));
            });
            _articles.sort();
        } catch (e) { console.warn('[ER] artículos:', e); }
        return _articles;
    }

    function _buildClientsIndex() {
        const map = window.userMap || {};
        _clientsIndex = Object.keys(map).map(id => {
            const u = map[id] || {};
            return {
                id: id,
                idNum: String(u.idNum || '').trim(),
                name: u.name || '(sin nombre)',
                search: ((u.name || '') + ' ' + (u.idNum || '')).toLowerCase()
            };
        }).filter(c => c.idNum);
        _clientsIndex.sort((a, b) => a.name.localeCompare(b.name));
    }

    async function _loadComps(clientId) {
        if (_compsCache[clientId]) return _compsCache[clientId];
        const comps = [];
        try {
            const snap = await db.collection('users').doc(clientId).collection('companies').get();
            snap.forEach(d => comps.push(Object.assign({ id: d.id }, d.data())));
        } catch (e) { console.warn('[ER] comps:', e); }
        if (comps.length === 0) comps.push({ id: 'comp_main', name: '', prefix: 'NP' });
        comps.sort((a, b) => (a.id === 'comp_main' ? -1 : b.id === 'comp_main' ? 1 : 0));
        _compsCache[clientId] = comps;
        return comps;
    }

    async function _loadDests(clientId, idNum) {
        if (_destCache[clientId]) return _destCache[clientId];
        const seen = {};
        const out = [];
        try {
            const snap = await db.collection('tickets')
                .where('clientIdNum', '==', String(idNum))
                .orderBy('createdAt', 'desc')
                .limit(300).get();
            snap.forEach(d => {
                const t = d.data();
                const key = (t.receiver || '').trim().toUpperCase();
                if (!key || seen[key]) return;
                seen[key] = true;
                out.push({
                    receiver: key,
                    street: t.street || '', number: t.number || '',
                    localidad: t.localidad || '', cp: t.cp || '',
                    province: t.province || '', phone: t.phone || '',
                    fuente: 'cliente'
                });
            });
        } catch (e) { console.warn('[ER] destinos:', e); }
        _destCache[clientId] = out;
        return out;
    }

    // ── dropdown buscador (uno global) ──
    const _dd = { el: null, items: [], sel: -1, onPick: null, anchor: null };

    function _ddEnsure() {
        if (_dd.el) return;
        _dd.el = document.createElement('div');
        _dd.el.style.cssText = 'position:fixed; z-index:100010; background:#2b2b2e; border:1px solid #FF6600; border-radius:6px; max-height:260px; overflow-y:auto; display:none; box-shadow:0 8px 22px rgba(0,0,0,0.65); font-size:0.8rem;';
        document.body.appendChild(_dd.el);
        _dd.el.addEventListener('mousedown', function (e) {
            const item = e.target.closest('[data-idx]');
            if (item) { e.preventDefault(); _ddPick(parseInt(item.dataset.idx, 10)); }
        });
    }

    function _ddShow(anchor, items, onPick) {
        _ddEnsure();
        if (!items.length) { _ddHide(); return; }
        _dd.items = items; _dd.onPick = onPick; _dd.anchor = anchor; _dd.sel = 0;
        _dd.el.innerHTML = items.map((it, i) =>
            '<div data-idx="' + i + '" style="padding:7px 12px; cursor:pointer; ' + (i === 0 ? 'background:#FF6600; color:#000;' : 'color:#ddd;') + '">'
            + '<div style="font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + it.label + '</div>'
            + (it.sub ? '<div style="font-size:0.68rem; opacity:0.75; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + _esc(it.sub) + '</div>' : '')
            + '</div>').join('');
        const r = anchor.getBoundingClientRect();
        _dd.el.style.left = r.left + 'px';
        _dd.el.style.top = (r.bottom + 2) + 'px';
        _dd.el.style.width = Math.max(280, r.width) + 'px';
        _dd.el.style.display = 'block';
    }

    function _ddMove(delta) {
        if (!_ddOpen()) return;
        _dd.sel = Math.max(0, Math.min(_dd.items.length - 1, _dd.sel + delta));
        Array.prototype.forEach.call(_dd.el.children, (el, i) => {
            el.style.background = i === _dd.sel ? '#FF6600' : 'transparent';
            el.style.color = i === _dd.sel ? '#000' : '#ddd';
        });
        const selEl = _dd.el.children[_dd.sel];
        if (selEl) selEl.scrollIntoView({ block: 'nearest' });
    }

    function _ddPick(idx) {
        const it = _dd.items[idx >= 0 ? idx : _dd.sel];
        const cb = _dd.onPick;
        _ddHide();
        if (it && cb) cb(it);
    }

    function _ddHide() { if (_dd.el) _dd.el.style.display = 'none'; _dd.items = []; _dd.sel = -1; _dd.onPick = null; _dd.anchor = null; }
    function _ddOpen() { return _dd.el && _dd.el.style.display === 'block' && _dd.items.length > 0; }

    // ── campos y navegación ──
    const FIELDS = ['er-cliente', 'er-sede', 'er-receiver', 'er-street', 'er-number', 'er-cp', 'er-localidad', 'er-provincia', 'er-phone', 'er-qty', 'er-articulo', 'er-timeslot', 'er-shipping'];

    function $(id) { return _win ? _win.querySelector('#' + id) : null; }

    function _focus(id) { const el = $(id); if (el) { el.focus(); if (el.select) el.select(); } }

    function _nextField(id) { const i = FIELDS.indexOf(id); return i >= 0 && i < FIELDS.length - 1 ? FIELDS[i + 1] : null; }

    // ── buscadores ──
    function _searchClients(q) {
        if (!_clientsIndex || !_clientsIndex.length) _buildClientsIndex();
        q = (q || '').trim().toLowerCase();
        const list = q ? _clientsIndex.filter(c => c.search.indexOf(q) !== -1) : _clientsIndex;
        return list.slice(0, 10).map(c => ({ label: _esc(c.name), sub: 'Cliente nº ' + c.idNum, _c: c }));
    }

    function _searchDests(q) {
        q = (q || '').trim().toUpperCase();
        const propios = (_client && _destCache[_client.id]) || [];
        let items = (q ? propios.filter(d => d.receiver.indexOf(q) !== -1) : propios).slice(0, 7)
            .map(d => ({ label: '📦 ' + _esc(d.receiver), sub: [d.street, d.localidad, d.cp].filter(Boolean).join(', '), _d: d }));
        // Directorio global 🌐 (gesco, 6.315 registros) a partir de 3 letras
        if (q.length >= 3 && typeof window.searchPhantomDirectory === 'function') {
            const seen = {};
            items.forEach(i => { if (i._d) seen[i._d.receiver] = true; });
            window.searchPhantomDirectory(q).forEach(g => {
                const key = String(g.name || '').toUpperCase();
                if (!key || seen[key]) return;
                items.push({
                    label: '🌐 ' + _esc(key),
                    sub: [g.street, g.localidad, g.cp].filter(Boolean).join(', '),
                    _d: {
                        receiver: key, street: g.street || '', number: '',
                        localidad: g.localidad || '', cp: g.cp || '',
                        province: PROV_BY_CP[String(g.cp || '').substring(0, 2)] || '',
                        phone: g.senderPhone || '', fuente: 'global'
                    }
                });
            });
        }
        return items.slice(0, 12);
    }

    function _searchArticles(q) {
        const arts = _articles || [];
        q = (q || '').trim().toLowerCase();
        const list = q ? arts.filter(a => a.toLowerCase().indexOf(q) !== -1) : arts;
        return list.slice(0, 12).map(a => ({ label: _esc(a), _a: a }));
    }

    function _pickDest(d) {
        $('er-receiver').value = d.receiver;
        $('er-street').value = d.street;
        $('er-number').value = d.number;
        $('er-cp').value = d.cp;
        $('er-localidad').value = d.localidad;
        if (d.province) $('er-provincia').value = d.province;
        else if (d.cp) { const p = PROV_BY_CP[String(d.cp).substring(0, 2)]; if (p) $('er-provincia').value = p; }
        $('er-phone').value = d.phone;
        _setStatus('Destino cargado' + (d.fuente === 'global' ? ' del directorio global 🌐' : ' de los envíos del cliente 📦') + ' — revisa y ENTER', '#4CAF50');
        _focus('er-qty');
    }

    async function _pickClient(c) {
        _client = c;
        const inp = $('er-cliente');
        inp.value = c.name;
        inp.style.borderColor = '#4CAF50';
        $('er-cliente-num').textContent = 'nº ' + c.idNum;
        _comps = await _loadComps(c.id);
        const sel = $('er-sede');
        sel.innerHTML = _comps.map(cp =>
            '<option value="' + _esc(cp.id) + '">' + _esc(cp.id === 'comp_main' ? (cp.name || 'Principal') : (cp.name || cp.id)) + '</option>').join('');
        // Sede única → saltar directo a destinatario
        _loadDests(c.id, c.idNum).then(d => {
            _setStatus(d.length ? d.length + ' destinos conocidos de este cliente — enfoca Destinatario y aparecen' : 'Cliente sin envíos previos — el buscador 🌐 global sigue disponible', '#5DADE2');
        });
        if (_comps.length <= 1) _focus('er-receiver');
        else _focus('er-sede');
    }

    function _setStatus(msg, color) {
        const el = $('er-status');
        if (el) { el.textContent = msg; el.style.color = color || '#888'; }
    }

    // ── guardado ──
    async function _nextTicketId(idNum, compId, comp) {
        const prefix = (comp && comp.prefix) || 'NP';
        const YY = String(new Date().getFullYear()).slice(-2);
        const yearPrefix = prefix + '-' + YY + '-';
        const counterRef = db.collection('ticket_counters').doc(compId + '_' + idNum + '_' + YY);

        let seed = 0;
        const cSnap = await counterRef.get();
        if (!cSnap.exists) {
            try {
                const snap = await db.collection('tickets').where('clientIdNum', '==', String(idNum)).get();
                snap.forEach(d => {
                    const t = d.data();
                    if ((t.compId || 'comp_main') !== compId) return;
                    const bid = t.id || '';
                    if (bid.indexOf(yearPrefix) === 0) {
                        const seq = parseInt(bid.substring(yearPrefix.length), 10);
                        if (!isNaN(seq) && seq > seed) seed = seq;
                    }
                });
            } catch (e) { console.warn('[ER] seed:', e); }
        }

        const next = await db.runTransaction(async tx => {
            const dSnap = await tx.get(counterRef);
            const cur = dSnap.exists ? (dSnap.data().currentMax || 0) : seed;
            const nx = cur + 1;
            tx.set(counterRef, { currentMax: nx, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
            return nx;
        });
        return yearPrefix + next;
    }

    function _validate() {
        if (!_client) { _setStatus('⚠ Elige un CLIENTE del buscador (enfoca el campo y aparece la lista)', '#FF9800'); _focus('er-cliente'); return false; }
        if (!$('er-receiver').value.trim()) { _setStatus('⚠ Falta el DESTINATARIO', '#FF9800'); _focus('er-receiver'); return false; }
        if (!(parseInt($('er-qty').value, 10) >= 1)) { _setStatus('⚠ Bultos debe ser 1 o más', '#FF9800'); _focus('er-qty'); return false; }
        if (!$('er-articulo').value.trim()) { _setStatus('⚠ Falta el ARTÍCULO (enfoca el campo y elige del catálogo)', '#FF9800'); _focus('er-articulo'); return false; }
        return true;
    }

    async function _save() {
        if (!_validate()) return;
        const btn = $('er-save-btn');
        btn.disabled = true; btn.textContent = '⏳ GUARDANDO…';
        try {
            await _loadRoutes();
            const c = _client;
            const compId = $('er-sede').value || 'comp_main';
            const comp = (_comps || []).find(x => x.id === compId) || { id: compId, prefix: 'NP' };
            const uData = (window.userMap || {})[c.id] || {};

            const businessId = await _nextTicketId(c.idNum, compId, comp);

            const street = $('er-street').value.trim();
            const number = $('er-number').value.trim();
            const locality = $('er-localidad').value.trim();
            const cp = $('er-cp').value.trim();

            let driverPhone = '';
            for (const r of _routes) {
                if (r.label === cp || (locality && r.label === locality.toLowerCase())) { driverPhone = r.phone; break; }
            }

            const addrParts = [];
            if (street) addrParts.push(street);
            if (number) addrParts.push('Nº ' + number);
            if (locality) addrParts.push(locality);
            if (cp) addrParts.push('(CP ' + cp + ')');

            const qty = parseInt($('er-qty').value, 10) || 1;
            const ticketData = {
                id: businessId,
                sender: comp.name || uData.name || 'NOVAPACK',
                senderAddress: comp.address || uData.senderAddress || '',
                senderPhone: comp.phone || uData.senderPhone || '',
                receiver: $('er-receiver').value.trim().toUpperCase(),
                phone: $('er-phone').value.trim(),
                driverPhone: driverPhone,
                address: addrParts.join(', '),
                street: street,
                number: number,
                localidad: locality,
                cp: cp,
                province: $('er-provincia').value || '',
                timeSlot: $('er-timeslot').value,
                shippingType: $('er-shipping').value,
                cod: 0,
                packagesList: [{ qty: qty, weight: '', size: $('er-articulo').value.trim() }],
                uid: uData.authUid || uData.id || c.id,
                compId: compId,
                subTariffId: comp.subTariffId || null,
                clientIdNum: String(c.idNum),
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                adminCreated: true,
                entryMode: 'rapida',
                printed: false
            };

            const docId = String(c.idNum) + '_' + compId + '_' + businessId;
            await db.collection('tickets').doc(docId).set(ticketData);

            _createdCount++;
            $('er-count').textContent = _createdCount;
            const list = $('er-created-list');
            const row = document.createElement('div');
            row.style.cssText = 'display:flex; align-items:center; gap:10px; padding:6px 10px; border-bottom:1px solid #2d2d30; font-size:0.8rem;';
            row.innerHTML = '<span style="color:#4CAF50; font-weight:900; font-family:monospace;">' + _esc(businessId) + '</span>'
                + '<span style="color:#ddd; flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + _esc(ticketData.receiver) + '</span>'
                + '<span style="color:#888;">' + _esc(locality || cp || '') + '</span>'
                + '<button data-print style="background:#333; border:1px solid #4CAF50; color:#4CAF50; padding:2px 8px; font-size:0.72rem; cursor:pointer; border-radius:3px;">🖨️</button>';
            row.querySelector('[data-print]').addEventListener('click', function () {
                if (typeof printTicketFromAdmin === 'function') printTicketFromAdmin(c.id, compId, docId);
                else alert('Impresión no disponible en esta vista. Imprime desde Albaranes Centralizados.');
            });
            list.insertBefore(row, list.firstChild);

            // Limpiar SOLO destino y mercancía — el cliente se mantiene (taco)
            ['er-receiver', 'er-street', 'er-number', 'er-cp', 'er-localidad', 'er-phone'].forEach(id => { $(id).value = ''; });
            $('er-provincia').value = '';
            $('er-qty').value = '1';
            $('er-articulo').value = '';
            _setStatus('✅ ' + businessId + ' creado — siguiente destinatario', '#4CAF50');
            _focus('er-receiver');
        } catch (e) {
            console.error('[ER] guardar:', e);
            _setStatus('❌ Error: ' + (e.message || e), '#f44336');
        } finally {
            btn.disabled = false; btn.textContent = '💾 GUARDAR Y SIGUIENTE  (Enter)';
        }
    }

    // ── ventana ──
    function _inputStyle(extra) {
        return 'background:#2d2d30; border:1px solid #4a4a4e; color:#fff; padding:9px 10px; border-radius:5px; font-size:0.88rem; outline:none; box-sizing:border-box; width:100%; ' + (extra || '');
    }

    window.openEntradaRapida = function () {
        try { _openInner(); } catch (e) {
            console.error('[ER] error abriendo:', e);
            alert('Error abriendo Entrada Rápida: ' + (e.message || e));
        }
    };

    function _openInner() {
        const old = document.getElementById('er-window-overlay');
        if (old) old.remove();
        _client = null; _comps = null; _createdCount = 0;

        const overlay = document.createElement('div');
        overlay.id = 'er-window-overlay';
        overlay.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.72); z-index:99995; display:flex; align-items:center; justify-content:center; padding:16px;';
        overlay.innerHTML = ''
            + '<div id="er-window" style="background:#1f1f22; border:1px solid #FF6600; border-radius:10px; width:100%; max-width:820px; max-height:94vh; display:flex; flex-direction:column; box-shadow:0 20px 60px rgba(0,0,0,0.8); overflow:hidden;">'

            // barra de título estilo ventana
            + '  <div style="background:linear-gradient(135deg,#2a2a2e,#232326); padding:10px 16px; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #FF6600;">'
            + '    <div style="color:#FF6600; font-weight:900; letter-spacing:1px; font-size:0.95rem;">⚡ ENTRADA RÁPIDA DE ALBARANES</div>'
            + '    <button id="er-close" title="Cerrar (Esc)" style="background:none; border:none; color:#aaa; font-size:1.15rem; cursor:pointer; padding:2px 8px;">✕</button>'
            + '  </div>'

            // cuerpo del formulario
            + '  <div style="padding:14px 18px 6px; overflow-y:auto;">'

            + '    <div style="font-size:0.66rem; color:#FF6600; letter-spacing:2px; font-weight:700; margin-bottom:6px;">CLIENTE (REMITENTE)</div>'
            + '    <div style="display:grid; grid-template-columns: 1fr 170px; gap:10px; margin-bottom:14px;">'
            + '      <div style="position:relative;">'
            + '        <input id="er-cliente" placeholder="🔍 Enfoca aquí y elige — o escribe nombre / nº de cliente" style="' + _inputStyle('border-color:#FF6600;') + '" autocomplete="off">'
            + '        <span id="er-cliente-num" style="position:absolute; right:10px; top:50%; transform:translateY(-50%); color:#4CAF50; font-size:0.7rem; font-weight:700;"></span>'
            + '      </div>'
            + '      <select id="er-sede" title="Sede del cliente" style="' + _inputStyle() + '"><option value="comp_main">Principal</option></select>'
            + '    </div>'

            + '    <div style="font-size:0.66rem; color:#FF6600; letter-spacing:2px; font-weight:700; margin-bottom:6px;">DESTINO</div>'
            + '    <div style="margin-bottom:10px;">'
            + '      <input id="er-receiver" placeholder="🔍 Destinatario — enfoca y salen los habituales del cliente · 3 letras busca en el directorio global 🌐" style="' + _inputStyle('text-transform:uppercase;') + '" autocomplete="off">'
            + '    </div>'
            + '    <div style="display:grid; grid-template-columns: 1fr 90px; gap:10px; margin-bottom:10px;">'
            + '      <input id="er-street" placeholder="Calle / dirección" style="' + _inputStyle() + '" autocomplete="off">'
            + '      <input id="er-number" placeholder="Nº" style="' + _inputStyle() + '" autocomplete="off">'
            + '    </div>'
            + '    <div style="display:grid; grid-template-columns: 90px 1fr 200px 150px; gap:10px; margin-bottom:14px;">'
            + '      <input id="er-cp" placeholder="CP" maxlength="5" style="' + _inputStyle() + '" autocomplete="off">'
            + '      <input id="er-localidad" placeholder="Localidad" style="' + _inputStyle() + '" autocomplete="off">'
            + '      <select id="er-provincia" style="' + _inputStyle() + '">'
            + '        <option value="">Provincia…</option>'
            + PROVINCES.map(p => '<option value="' + _esc(p) + '">' + _esc(p) + '</option>').join('')
            + '      </select>'
            + '      <input id="er-phone" placeholder="Teléfono" style="' + _inputStyle() + '" autocomplete="off">'
            + '    </div>'

            + '    <div style="font-size:0.66rem; color:#FF6600; letter-spacing:2px; font-weight:700; margin-bottom:6px;">MERCANCÍA</div>'
            + '    <div style="display:grid; grid-template-columns: 90px 1fr 130px 130px; gap:10px; margin-bottom:14px;">'
            + '      <input id="er-qty" type="number" min="1" value="1" title="Bultos" style="' + _inputStyle('text-align:center; font-weight:700;') + '">'
            + '      <input id="er-articulo" placeholder="🔍 Artículo — enfoca y sale el catálogo" style="' + _inputStyle() + '" autocomplete="off">'
            + '      <select id="er-timeslot" style="' + _inputStyle() + '"><option>MAÑANA</option><option>TARDE</option></select>'
            + '      <select id="er-shipping" style="' + _inputStyle() + '"><option value="Pagados">Pagados</option><option value="Debidos">Debidos</option></select>'
            + '    </div>'

            + '    <div id="er-status" style="min-height:18px; font-size:0.75rem; color:#888; margin-bottom:8px;">Enfoca el campo Cliente para empezar — todo se maneja con ENTER y las flechas</div>'
            + '    <button id="er-save-btn" style="width:100%; background:linear-gradient(135deg,#FF6600,#E65100); border:0; color:#fff; padding:13px; border-radius:7px; cursor:pointer; font-weight:900; font-size:0.95rem; letter-spacing:1px;">💾 GUARDAR Y SIGUIENTE  (Enter)</button>'
            + '  </div>'

            // creados en esta sesión
            + '  <div style="border-top:1px solid #333; background:#1a1a1c; max-height:180px; display:flex; flex-direction:column;">'
            + '    <div style="padding:8px 16px 4px; font-size:0.66rem; color:#888; letter-spacing:2px; font-weight:700;">CREADOS EN ESTA SESIÓN (<span id="er-count">0</span>)</div>'
            + '    <div id="er-created-list" style="overflow-y:auto; padding:0 8px 8px;"></div>'
            + '  </div>'

            + '</div>';

        document.body.appendChild(overlay);
        _win = overlay;

        // cargas en segundo plano
        _buildClientsIndex();
        _loadRoutes();
        _loadArticles();

        // ── eventos ──
        $('er-close').addEventListener('click', function () { _ddHide(); overlay.remove(); _win = null; });
        overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) { _ddHide(); overlay.remove(); _win = null; } });
        $('er-save-btn').addEventListener('click', _save);

        // teclado global de la ventana
        overlay.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && !_ddOpen()) { _ddHide(); overlay.remove(); _win = null; return; }
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); _save(); return; }
        });

        // navegación ENTER + dropdowns por campo
        FIELDS.forEach(id => {
            const el = $(id);
            if (!el) return;
            el.addEventListener('keydown', function (e) {
                if (_ddOpen() && _dd.anchor === el) {
                    if (e.key === 'ArrowDown') { e.preventDefault(); _ddMove(1); return; }
                    if (e.key === 'ArrowUp') { e.preventDefault(); _ddMove(-1); return; }
                    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); _ddPick(-1); return; }
                    if (e.key === 'Escape') { e.stopPropagation(); _ddHide(); return; }
                }
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const nx = _nextField(id);
                    if (nx) _focus(nx); else _save();
                }
            });
            el.addEventListener('blur', function () { setTimeout(() => { if (_dd.anchor === el) _ddHide(); }, 160); });
        });

        // CLIENTE: lista al enfocar + filtro al escribir
        const cliInp = $('er-cliente');
        function _cliShow() { _ddShow(cliInp, _searchClients(cliInp.value), it => _pickClient(it._c)); }
        cliInp.addEventListener('focus', _cliShow);
        cliInp.addEventListener('input', function () {
            _client = null; cliInp.style.borderColor = '#FF6600';
            $('er-cliente-num').textContent = '';
            _cliShow();
        });

        // DESTINATARIO: habituales al enfocar + global al escribir 3+
        const recInp = $('er-receiver');
        function _recShow() { _ddShow(recInp, _searchDests(recInp.value), it => _pickDest(it._d)); }
        recInp.addEventListener('focus', _recShow);
        recInp.addEventListener('input', _recShow);

        // ARTÍCULO: catálogo al enfocar + filtro
        const artInp = $('er-articulo');
        function _artShow() { _ddShow(artInp, _searchArticles(artInp.value), it => { artInp.value = it._a; _focus('er-timeslot'); }); }
        artInp.addEventListener('focus', _artShow);
        artInp.addEventListener('input', _artShow);

        // CP → provincia
        $('er-cp').addEventListener('input', function () {
            const cp = $('er-cp').value.trim();
            if (cp.length >= 2) {
                const p = PROV_BY_CP[cp.substring(0, 2)];
                if (p) $('er-provincia').value = p;
            }
        });

        // turno por hora
        const hour = new Date().getHours();
        $('er-timeslot').value = (hour >= 8 && hour < 15) ? 'MAÑANA' : 'TARDE';

        _focus('er-cliente');
    }

    console.log('[ER] ⚡ Entrada Rápida (ventana) cargada — window.openEntradaRapida() lista');
})();
