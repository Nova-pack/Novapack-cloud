// =============================================================
// ⚡ ENTRADA RÁPIDA DE ALBARANES — rejilla CRM por teclado
// =============================================================
// Pantalla de entrada masiva para el admin: cada FILA es un
// albarán. Flujo 100% teclado, "a la antigua usanza":
//   - ENTER / TAB → siguiente celda
//   - ENTER en la última celda → valida la fila y abre otra
//     (cliente y sede se heredan de la fila anterior)
//   - Autocompletado de cliente y destinatario con ↑ ↓ + ENTER
//   - CP rellena la provincia solo; destinatario conocido rellena
//     dirección/teléfono completos
//   - Ctrl+S → guarda TODO el lote
//
// Crea los albaranes con el MISMO esquema que el flujo manual del
// admin (docId {idNum}_{compId}_{businessId}, auto-ruta por CP) y
// numeración ATÓMICA vía ticket_counters (como la app cliente),
// para que no colisione con albaranes creados por el cliente.
//
// Dependencias (admin.html): db, firebase, window.userMap,
// window.openWorkspaceOrModal (erp_tabs.js).
// =============================================================
(function () {
    'use strict';

    // ── estado del módulo ──
    let _rows = [];
    let _routes = null;        // [{label(lower), phone}]
    let _articles = null;      // [nombres]
    let _clientsIndex = null;  // [{id, idNum, name, search}]
    let _compsCache = {};      // clientId → [{id, name, prefix, ...}]
    let _destCache = {};       // clientId → [{receiver, street, number, localidad, cp, province, phone}]
    let _container = null;
    let _closeFn = null;
    let _seq = 0;

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

    function _esc(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    // ── cargas iniciales (una vez por sesión) ──
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
        // comp_main primero
        comps.sort((a, b) => (a.id === 'comp_main' ? -1 : b.id === 'comp_main' ? 1 : 0));
        _compsCache[clientId] = comps;
        return comps;
    }

    // Destinatarios conocidos = últimos albaranes del cliente (repite el 90%)
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
                    province: t.province || '', phone: t.phone || ''
                });
            });
        } catch (e) { console.warn('[ER] destinos:', e); }
        _destCache[clientId] = out;
        return out;
    }

    // ── dropdown de autocompletado (uno global, reutilizado) ──
    const _dd = { el: null, items: [], sel: -1, onPick: null, anchor: null };

    function _ddEnsure() {
        if (_dd.el) return;
        _dd.el = document.createElement('div');
        _dd.el.id = 'er-dropdown';
        _dd.el.style.cssText = 'position:fixed; z-index:100001; background:#252526; border:1px solid #FF6600; border-radius:6px; max-height:240px; overflow-y:auto; display:none; min-width:220px; box-shadow:0 6px 18px rgba(0,0,0,0.6); font-size:0.78rem;';
        document.body.appendChild(_dd.el);
        _dd.el.addEventListener('mousedown', function (e) {
            const item = e.target.closest('[data-idx]');
            if (item) { e.preventDefault(); _ddPick(parseInt(item.dataset.idx, 10)); }
        });
    }

    function _ddShow(anchor, items, onPick) {
        _ddEnsure();
        _dd.items = items; _dd.onPick = onPick; _dd.anchor = anchor; _dd.sel = items.length ? 0 : -1;
        if (!items.length) { _ddHide(); return; }
        _dd.el.innerHTML = items.map((it, i) =>
            '<div data-idx="' + i + '" style="padding:6px 10px; cursor:pointer; ' + (i === 0 ? 'background:#FF6600; color:#000;' : 'color:#ddd;') + '">'
            + '<div style="font-weight:600;">' + _esc(it.label) + '</div>'
            + (it.sub ? '<div style="font-size:0.68rem; opacity:0.75;">' + _esc(it.sub) + '</div>' : '')
            + '</div>').join('');
        const r = anchor.getBoundingClientRect();
        _dd.el.style.left = r.left + 'px';
        _dd.el.style.top = (r.bottom + 2) + 'px';
        _dd.el.style.minWidth = Math.max(220, r.width) + 'px';
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

    // ── filas ──
    const COLS = ['cliente', 'sede', 'receiver', 'street', 'number', 'localidad', 'cp', 'province', 'phone', 'qty', 'articulo', 'timeslot', 'shipping'];

    function _rowTemplate(rid) {
        const hour = new Date().getHours();
        const slot = (hour >= 8 && hour < 15) ? 'MAÑANA' : 'TARDE';
        return '<tr id="er-row-' + rid + '" style="border-bottom:1px solid #2d2d30;">'
            + '<td class="er-st" style="width:34px; text-align:center; font-size:0.85rem; color:#666;">—</td>'
            + '<td><input data-col="cliente" placeholder="cliente / nº" style="width:130px;" autocomplete="off"></td>'
            + '<td><select data-col="sede" style="width:92px;"><option value="comp_main">Principal</option></select></td>'
            + '<td><input data-col="receiver" placeholder="destinatario" style="width:150px; text-transform:uppercase;" autocomplete="off"></td>'
            + '<td><input data-col="street" placeholder="calle" style="width:150px;" autocomplete="off"></td>'
            + '<td><input data-col="number" placeholder="nº" style="width:42px;" autocomplete="off"></td>'
            + '<td><input data-col="localidad" placeholder="localidad" style="width:110px;" autocomplete="off"></td>'
            + '<td><input data-col="cp" placeholder="CP" maxlength="5" style="width:52px;" autocomplete="off"></td>'
            + '<td><input data-col="province" placeholder="provincia" style="width:95px;" autocomplete="off"></td>'
            + '<td><input data-col="phone" placeholder="teléfono" style="width:88px;" autocomplete="off"></td>'
            + '<td><input data-col="qty" type="number" min="1" value="1" style="width:44px; text-align:center;"></td>'
            + '<td><input data-col="articulo" placeholder="artículo" list="er-articles" style="width:110px;" autocomplete="off"></td>'
            + '<td><select data-col="timeslot" style="width:64px;"><option' + (slot === 'MAÑANA' ? ' selected' : '') + '>MAÑANA</option><option' + (slot === 'TARDE' ? ' selected' : '') + '>TARDE</option></select></td>'
            + '<td><select data-col="shipping" style="width:70px;"><option value="Pagados">Pagados</option><option value="Debidos">Debidos</option></select></td>'
            + '<td style="width:26px;"><button class="er-del" title="Quitar fila" style="background:none; border:none; color:#f44; cursor:pointer;">✕</button></td>'
            + '</tr>';
    }

    function _addRow(inherit) {
        const rid = ++_seq;
        const tbody = _container.querySelector('#er-tbody');
        tbody.insertAdjacentHTML('beforeend', _rowTemplate(rid));
        const tr = document.getElementById('er-row-' + rid);
        const row = { rid: rid, tr: tr, client: null, comps: null, status: 'edit', savedId: '' };
        _rows.push(row);

        // Heredar cliente + sede de la fila anterior (stack del mismo cliente)
        if (inherit && inherit.client) {
            row.client = inherit.client;
            row.comps = inherit.comps;
            const cInp = tr.querySelector('[data-col="cliente"]');
            cInp.value = inherit.client.name;
            cInp.style.color = '#4CAF50';
            _fillSedeSelect(row, inherit.tr.querySelector('[data-col="sede"]').value);
        }

        _wireRow(row);
        return row;
    }

    function _fillSedeSelect(row, selectedId) {
        const sel = row.tr.querySelector('[data-col="sede"]');
        const comps = row.comps || [{ id: 'comp_main', name: '' }];
        sel.innerHTML = comps.map(c =>
            '<option value="' + _esc(c.id) + '"' + (c.id === (selectedId || 'comp_main') ? ' selected' : '') + '>'
            + _esc(c.id === 'comp_main' ? (c.name || 'Principal') : (c.name || c.id)) + '</option>').join('');
    }

    function _inp(row, col) { return row.tr.querySelector('[data-col="' + col + '"]'); }

    function _focusCol(row, col) {
        const el = _inp(row, col);
        if (el) { el.focus(); if (el.select) el.select(); }
    }

    function _nextCol(col) { const i = COLS.indexOf(col); return i >= 0 && i < COLS.length - 1 ? COLS[i + 1] : null; }
    function _prevCol(col) { const i = COLS.indexOf(col); return i > 0 ? COLS[i - 1] : null; }

    function _wireRow(row) {
        const tr = row.tr;

        tr.querySelector('.er-del').addEventListener('click', function () {
            if (row.status === 'saved') return;
            _rows = _rows.filter(r => r !== row);
            tr.remove();
            _updateCounter();
        });

        COLS.forEach(col => {
            const el = _inp(row, col);
            if (!el) return;

            el.addEventListener('keydown', function (e) {
                // Dropdown activo: ↑↓ navegan, ENTER/TAB pican
                if (_ddOpen() && _dd.anchor === el) {
                    if (e.key === 'ArrowDown') { e.preventDefault(); _ddMove(1); return; }
                    if (e.key === 'ArrowUp') { e.preventDefault(); _ddMove(-1); return; }
                    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); _ddPick(-1); return; }
                    if (e.key === 'Escape') { _ddHide(); return; }
                }
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const nx = _nextCol(col);
                    if (nx) { _focusCol(row, nx); }
                    else { _commitRow(row); }
                    return;
                }
                // ↑↓ sin dropdown: moverse entre filas en la misma columna
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    if (el.tagName === 'SELECT') return; // los select usan ↑↓ para opciones
                    e.preventDefault();
                    const idx = _rows.indexOf(row);
                    const target = _rows[idx + (e.key === 'ArrowDown' ? 1 : -1)];
                    if (target && target.status !== 'saved') _focusCol(target, col);
                    return;
                }
            });

            el.addEventListener('blur', function () { setTimeout(() => { if (_dd.anchor === el) _ddHide(); }, 150); });
        });

        // ── autocompletado CLIENTE ──
        const cliInp = _inp(row, 'cliente');
        cliInp.addEventListener('input', function () {
            row.client = null; row.comps = null;
            cliInp.style.color = '';
            // userMap puede tardar en poblarse tras el login → reintentar índice
            if (!_clientsIndex || !_clientsIndex.length) _buildClientsIndex();
            const q = cliInp.value.trim().toLowerCase();
            if (q.length < 2) { _ddHide(); return; }
            const matches = _clientsIndex.filter(c => c.search.indexOf(q) !== -1).slice(0, 8);
            _ddShow(cliInp, matches.map(c => ({ label: c.name, sub: '#' + c.idNum, _c: c })), function (it) {
                _setRowClient(row, it._c);
            });
        });

        // ── autocompletado DESTINATARIO ──
        const recInp = _inp(row, 'receiver');
        recInp.addEventListener('input', function () {
            if (!row.client) { _ddHide(); return; }
            const q = recInp.value.trim().toUpperCase();
            const dests = _destCache[row.client.id] || [];
            if (q.length < 2 || !dests.length) { _ddHide(); return; }
            const matches = dests.filter(d => d.receiver.indexOf(q) !== -1).slice(0, 8);
            _ddShow(recInp, matches.map(d => ({
                label: d.receiver,
                sub: [d.street, d.localidad, d.cp].filter(Boolean).join(', '),
                _d: d
            })), function (it) {
                const d = it._d;
                recInp.value = d.receiver;
                _inp(row, 'street').value = d.street;
                _inp(row, 'number').value = d.number;
                _inp(row, 'localidad').value = d.localidad;
                _inp(row, 'cp').value = d.cp;
                _inp(row, 'province').value = d.province;
                _inp(row, 'phone').value = d.phone;
                // Con todo relleno, saltar directo a bultos
                _focusCol(row, 'qty');
            });
        });

        // ── CP → provincia automática ──
        const cpInp = _inp(row, 'cp');
        cpInp.addEventListener('input', function () {
            const cp = cpInp.value.trim();
            if (cp.length >= 2) {
                const prov = PROV_BY_CP[cp.substring(0, 2)];
                const provInp = _inp(row, 'province');
                if (prov && !provInp.value.trim()) provInp.value = prov;
                if (prov) provInp.value = prov;
            }
        });
    }

    async function _setRowClient(row, c) {
        const cliInp = _inp(row, 'cliente');
        cliInp.value = c.name;
        cliInp.style.color = '#4CAF50';
        row.client = c;
        _focusCol(row, 'receiver');
        // Cargas en segundo plano: sedes + destinatarios conocidos
        _loadComps(c.id).then(comps => { row.comps = comps; _fillSedeSelect(row); });
        _loadDests(c.id, c.idNum);
    }

    // ── validación + commit de fila (ENTER en la última celda) ──
    function _validateRow(row) {
        const errs = [];
        if (!row.client || !row.client.idNum) errs.push('cliente');
        if (!_inp(row, 'receiver').value.trim()) errs.push('destinatario');
        if (!(parseInt(_inp(row, 'qty').value, 10) >= 1)) errs.push('bultos');
        if (!_inp(row, 'articulo').value.trim()) errs.push('artículo');
        return errs;
    }

    function _commitRow(row) {
        const errs = _validateRow(row);
        const st = row.tr.querySelector('.er-st');
        if (errs.length) {
            st.textContent = '⚠';
            st.style.color = '#FF9800';
            st.title = 'Falta: ' + errs.join(', ');
            _focusCol(row, errs[0] === 'cliente' ? 'cliente' : errs[0] === 'destinatario' ? 'receiver' : errs[0] === 'bultos' ? 'qty' : 'articulo');
            return;
        }
        st.textContent = '✓';
        st.style.color = '#4CAF50';
        st.title = 'Lista para guardar';
        row.status = 'ready';
        _updateCounter();
        const nr = _addRow(row);
        _focusCol(nr, 'receiver');
    }

    function _updateCounter() {
        const el = _container.querySelector('#er-counter');
        if (!el) return;
        const ready = _rows.filter(r => r.status === 'ready').length;
        const saved = _rows.filter(r => r.status === 'saved').length;
        el.innerHTML = '<b style="color:#4CAF50;">' + ready + '</b> listas · <b style="color:#5DADE2;">' + saved + '</b> guardadas';
    }

    // ── numeración atómica (misma que la app cliente) ──
    async function _nextTicketId(idNum, compId, comp) {
        const prefix = (comp && comp.prefix) || 'NP';
        const YY = String(new Date().getFullYear()).slice(-2);
        const yearPrefix = prefix + '-' + YY + '-';
        const counterRef = db.collection('ticket_counters').doc(compId + '_' + idNum + '_' + YY);

        let seed = 0;
        const cSnap = await counterRef.get();
        if (!cSnap.exists) {
            // Primera vez: sembrar con el máximo histórico de este cliente+sede
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

    // ── guardado del lote ──
    async function _saveAll() {
        const pending = _rows.filter(r => (r.status === 'ready' || r.status === 'edit') && _validateRow(r).length === 0);
        if (!pending.length) { alert('No hay filas completas que guardar.\n\nRellena al menos: cliente, destinatario, bultos y artículo.'); return; }

        const btn = _container.querySelector('#er-save-btn');
        btn.disabled = true; btn.textContent = 'GUARDANDO…';
        await _loadRoutes();

        let ok = 0, ko = 0;
        for (const row of pending) {
            const st = row.tr.querySelector('.er-st');
            try {
                st.textContent = '⏳'; st.style.color = '#FFD700';
                const c = row.client;
                const compId = _inp(row, 'sede').value || 'comp_main';
                const comp = (row.comps || []).find(x => x.id === compId) || { id: compId, prefix: 'NP' };
                const uData = (window.userMap || {})[c.id] || {};

                const businessId = await _nextTicketId(c.idNum, compId, comp);

                const street = _inp(row, 'street').value.trim();
                const number = _inp(row, 'number').value.trim();
                const locality = _inp(row, 'localidad').value.trim();
                const cp = _inp(row, 'cp').value.trim();

                // Auto-ruta: etiqueta de ruta == CP o localidad
                let driverPhone = '';
                for (const r of _routes) {
                    if (r.label === cp || (locality && r.label === locality.toLowerCase())) { driverPhone = r.phone; break; }
                }

                const addrParts = [];
                if (street) addrParts.push(street);
                if (number) addrParts.push('Nº ' + number);
                if (locality) addrParts.push(locality);
                if (cp) addrParts.push('(CP ' + cp + ')');

                const qty = parseInt(_inp(row, 'qty').value, 10) || 1;
                const ticketData = {
                    id: businessId,
                    sender: comp.name || uData.name || 'NOVAPACK',
                    senderAddress: comp.address || uData.senderAddress || '',
                    senderPhone: comp.phone || uData.senderPhone || '',
                    receiver: _inp(row, 'receiver').value.trim().toUpperCase(),
                    phone: _inp(row, 'phone').value.trim(),
                    driverPhone: driverPhone,
                    address: addrParts.join(', '),
                    street: street,
                    number: number,
                    localidad: locality,
                    cp: cp,
                    province: _inp(row, 'province').value.trim(),
                    timeSlot: _inp(row, 'timeslot').value,
                    shippingType: _inp(row, 'shipping').value,
                    cod: 0,
                    packagesList: [{ qty: qty, weight: '', size: _inp(row, 'articulo').value.trim() }],
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

                row.status = 'saved';
                row.savedId = businessId;
                st.textContent = '✓'; st.style.color = '#5DADE2'; st.title = 'Guardado: ' + businessId;
                // Congelar la fila y mostrar el nº asignado
                COLS.forEach(col => { const el = _inp(row, col); if (el) el.disabled = true; });
                _inp(row, 'cliente').value = c.name + '  →  ' + businessId;
                ok++;
            } catch (e) {
                console.error('[ER] guardar fila:', e);
                st.textContent = '✗'; st.style.color = '#f44'; st.title = 'Error: ' + e.message;
                ko++;
            }
            _updateCounter();
        }

        btn.disabled = false; btn.textContent = '💾 GUARDAR TODO (Ctrl+S)';
        const msg = '✅ ' + ok + ' albarán(es) creados' + (ko ? ' · ❌ ' + ko + ' con error' : '') + '.\n\nYa aparecen en el listado normal — imprímelos desde allí como siempre.';
        if (typeof showToast === 'function' && !ko) showToast(ok + ' albaranes creados ✓', 'success');
        else alert(msg);
    }

    // ── apertura de la pantalla ──
    window.openEntradaRapida = async function () {
        const opener = (typeof window.openWorkspaceOrModal === 'function')
            ? window.openWorkspaceOrModal({
                tabKey: 'entrada-rapida',
                tabTitle: '⚡ Entrada Rápida',
                tabIcon: 'bolt',
                modalId: 'er-modal',
                modalStyle: 'position:fixed; inset:0; background:#1e1e1e; z-index:99990; display:flex; flex-direction:column; overflow:hidden;'
            })
            : (function () {
                const old = document.getElementById('er-modal');
                if (old) old.remove();
                const m = document.createElement('div');
                m.id = 'er-modal';
                m.style.cssText = 'position:fixed; inset:0; background:#1e1e1e; z-index:99990; display:flex; flex-direction:column; overflow:hidden;';
                document.body.appendChild(m);
                return { container: m, close: () => m.remove(), useERP: false };
            })();

        _container = opener.container;
        _closeFn = opener.close;
        _rows = [];
        _seq = 0;

        _container.innerHTML = ''
            + '<div style="display:flex; flex-direction:column; height:100%; min-height:0; width:100%;">'
            + '<div style="padding:12px 18px; display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; border-bottom:1px solid #333; background:#252526;">'
            + '  <div>'
            + '    <span style="color:#FF6600; font-weight:900; letter-spacing:1px;">⚡ ENTRADA RÁPIDA DE ALBARANES</span>'
            + '    <span id="er-counter" style="margin-left:14px; font-size:0.78rem; color:#888;">0 listas · 0 guardadas</span>'
            + '  </div>'
            + '  <div style="display:flex; gap:8px; align-items:center;">'
            + '    <button id="er-add-btn" style="background:transparent; border:1px solid #555; color:#ccc; padding:8px 14px; border-radius:6px; cursor:pointer; font-size:0.78rem;">+ Fila</button>'
            + '    <button id="er-save-btn" style="background:linear-gradient(135deg,#FF6600,#E65100); border:0; color:#fff; padding:8px 18px; border-radius:6px; cursor:pointer; font-weight:900; font-size:0.8rem;">💾 GUARDAR TODO (Ctrl+S)</button>'
            + (opener.useERP ? '' : '    <button id="er-close-btn" style="background:#333; border:1px solid #555; color:#fff; padding:8px 14px; border-radius:6px; cursor:pointer; font-size:0.78rem;">Cerrar</button>')
            + '  </div>'
            + '</div>'
            + '<div style="padding:6px 18px; font-size:0.7rem; color:#777; border-bottom:1px solid #2a2a2a;">'
            + '  Teclado: <b style="color:#aaa;">ENTER/TAB</b> siguiente campo · <b style="color:#aaa;">ENTER al final</b> = fila lista + nueva (hereda cliente) · <b style="color:#aaa;">↑↓</b> autocompletar o cambiar de fila · destinatario conocido rellena la dirección solo · el CP pone la provincia'
            + '</div>'
            + '<div style="flex:1; overflow:auto; padding:0 8px 40px;">'
            + '  <table style="border-collapse:collapse; font-size:0.78rem; color:#ddd; margin-top:4px; min-width:1350px;">'
            + '    <thead><tr style="color:#9cdcfe; font-size:0.66rem; text-transform:uppercase; letter-spacing:0.5px;">'
            + '      <th></th><th style="text-align:left; padding:4px;">Cliente</th><th style="text-align:left; padding:4px;">Sede</th>'
            + '      <th style="text-align:left; padding:4px;">Destinatario</th><th style="text-align:left; padding:4px;">Calle</th><th style="padding:4px;">Nº</th>'
            + '      <th style="text-align:left; padding:4px;">Localidad</th><th style="padding:4px;">CP</th><th style="text-align:left; padding:4px;">Provincia</th>'
            + '      <th style="text-align:left; padding:4px;">Teléfono</th><th style="padding:4px;">Bult.</th><th style="text-align:left; padding:4px;">Artículo</th>'
            + '      <th style="padding:4px;">Turno</th><th style="padding:4px;">Portes</th><th></th>'
            + '    </tr></thead>'
            + '    <tbody id="er-tbody"></tbody>'
            + '  </table>'
            + '  <datalist id="er-articles"></datalist>'
            + '</div>'
            + '</div>';

        // Estilo de inputs de la rejilla (una sola vez)
        if (!document.getElementById('er-style')) {
            const style = document.createElement('style');
            style.id = 'er-style';
            style.textContent = '#er-tbody input, #er-tbody select { background:#2d2d30; border:1px solid #3c3c3c; color:#fff; padding:5px 6px; border-radius:4px; font-size:0.78rem; outline:none; box-sizing:border-box; }'
                + '#er-tbody input:focus, #er-tbody select:focus { border-color:#FF6600; background:#33302c; }'
                + '#er-tbody td { padding:3px 2px; }'
                + '#er-tbody input:disabled, #er-tbody select:disabled { opacity:0.45; }';
            document.head.appendChild(style);
        }

        _container.querySelector('#er-save-btn').addEventListener('click', _saveAll);
        _container.querySelector('#er-add-btn').addEventListener('click', function () {
            const last = _rows.length ? _rows[_rows.length - 1] : null;
            const nr = _addRow(last);
            _focusCol(nr, last && last.client ? 'receiver' : 'cliente');
        });
        const closeBtn = _container.querySelector('#er-close-btn');
        if (closeBtn) closeBtn.addEventListener('click', function () { _ddHide(); _closeFn(); });

        _container.addEventListener('keydown', function (e) {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); _saveAll(); }
        });

        // Cargas
        _buildClientsIndex();
        _loadRoutes();
        _loadArticles().then(arts => {
            const dl = _container.querySelector('#er-articles');
            if (dl) dl.innerHTML = arts.map(a => '<option value="' + _esc(a) + '">').join('');
        });

        const first = _addRow(null);
        _focusCol(first, 'cliente');
    };
})();
