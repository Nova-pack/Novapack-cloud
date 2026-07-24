// =============================================================
// ⚡ ENTRADA RÁPIDA DE ALBARANES — ventana CRM clásica
// =============================================================
// Ventana modal de alta velocidad por teclado:
//   - CLIENTE con buscador (al enfocar ya muestra la lista)
//   - DESTINATARIO: destinos habituales del cliente 📦 + directorio
//     global 🌐 (gesco) — elegir rellena dirección completa
//   - PROVINCIA desplegable + auto por CP
//   - MERCANCÍA multi-línea: varios bultos/artículos por albarán
//   - PRECIO ESTIMADO en vivo con la tarifa del cliente
//     (window.calculateTicketPriceSync — el mismo motor que factura)
//   - ENTER avanza; al final GUARDA manteniendo el cliente
//
// Guarda con el MISMO esquema que el flujo manual del admin y
// numeración ATÓMICA vía ticket_counters.
// =============================================================
(function () {
    'use strict';

    let _routes = null;
    let _articles = null;
    let _clientsIndex = null;
    let _compsCache = {};
    let _destCache = {};
    let _emisoras = null;    // billing_companies: quién FACTURA el albarán
    let _win = null;
    let _client = null;
    let _comps = null;
    let _createdCount = 0;
    let _lineSeq = 0;

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
    function _money(n) { return (Math.round((Number(n) || 0) * 100) / 100).toFixed(2).replace('.', ',') + ' €'; }

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

    // Empresas EMISORAS (billing_companies): quién facturará el albarán.
    // Se guarda como billingEntityId en el ticket ('' = central por defecto),
    // igual que el flujo manual del admin.
    async function _loadEmisoras() {
        if (_emisoras) return _emisoras;
        _emisoras = [];
        try {
            const snap = await db.collection('billing_companies').get();
            snap.forEach(d => {
                const c = d.data();
                _emisoras.push({ id: d.id, name: c.name || d.id, nif: c.nif || c.cif || '' });
            });
            _emisoras.sort((a, b) => a.name.localeCompare(b.name));
        } catch (e) { console.warn('[ER] emisoras:', e); }
        return _emisoras;
    }

    function _fillEmisoraSelect(preselectId) {
        const sel = $('er-emisora');
        if (!sel) return;
        sel.innerHTML = '<option value="">🏢 Factura: Central (por defecto)</option>'
            + (_emisoras || []).map(e =>
                '<option value="' + _esc(e.id) + '"' + (e.id === preselectId ? ' selected' : '') + '>🏢 Factura: ' + _esc(e.name) + '</option>').join('');
        if (preselectId && sel.value !== preselectId) sel.value = '';
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

    // Las sedes pueden vivir bajo el doc MAESTRO (users/{docId}) o bajo el
    // CLON del login (users/{authUid}) — la app cliente las clona ahí.
    // Buscamos en ambos y fusionamos por id.
    async function _loadComps(clientId) {
        if (_compsCache[clientId]) return _compsCache[clientId];
        const uData = (window.userMap || {})[clientId] || {};
        const roots = [clientId];
        if (uData.authUid && uData.authUid !== clientId) roots.push(uData.authUid);

        const byId = {};
        for (const root of roots) {
            try {
                const snap = await db.collection('users').doc(root).collection('companies').get();
                // d.id al final: gana sobre un campo `id` obsoleto del doc
                snap.forEach(d => { if (!byId[d.id]) byId[d.id] = Object.assign({}, d.data(), { id: d.id }); });
            } catch (e) { console.warn('[ER] comps de ' + root + ':', e); }
        }
        let comps = Object.values(byId);
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

    // ── dropdown buscador ──
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

    // ── helpers de ventana ──
    function $(id) { return _win ? _win.querySelector('#' + id) : null; }
    function _focus(id) { const el = $(id); if (el) { el.focus(); if (el.select) el.select(); } }
    function _setStatus(msg, color) {
        const el = $('er-status');
        if (el) { el.textContent = msg; el.style.color = color || '#888'; }
    }

    // Campos fijos ANTES de las líneas de mercancía
    const HEAD_FIELDS = ['er-cliente', 'er-sede', 'er-emisora', 'er-receiver', 'er-street', 'er-number', 'er-cp', 'er-localidad', 'er-provincia', 'er-phone'];
    const TAIL_FIELDS = ['er-timeslot', 'er-shipping'];

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

    // ── líneas de mercancía (multi-bulto) ──
    function _addLine(focusIt) {
        const idx = ++_lineSeq;
        const cont = $('er-lines');
        const row = document.createElement('div');
        row.className = 'er-line';
        row.dataset.line = idx;
        row.style.cssText = 'display:grid; grid-template-columns: 90px 1fr 34px; gap:10px; margin-bottom:8px; align-items:center;';
        row.innerHTML = ''
            + '<input class="er-l-qty" type="number" min="1" value="1" title="Bultos" style="' + _inputStyle('text-align:center; font-weight:700;') + '">'
            + '<input class="er-l-art" placeholder="🔍 Artículo — enfoca y sale el catálogo" style="' + _inputStyle() + '" autocomplete="off">'
            + '<button class="er-l-del" title="Quitar línea" style="background:none; border:1px solid #555; color:#f44; border-radius:5px; cursor:pointer; height:34px;">✕</button>';
        cont.appendChild(row);

        const qtyInp = row.querySelector('.er-l-qty');
        const artInp = row.querySelector('.er-l-art');
        row.querySelector('.er-l-del').addEventListener('click', function () {
            if (_win.querySelectorAll('.er-line').length <= 1) { qtyInp.value = '1'; artInp.value = ''; _updateEstimate(); return; }
            row.remove(); _updateEstimate();
        });

        // navegación de la línea
        qtyInp.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); artInp.focus(); artInp.select(); }
        });
        artInp.addEventListener('keydown', function (e) {
            if (_ddOpen() && _dd.anchor === artInp) {
                if (e.key === 'ArrowDown') { e.preventDefault(); _ddMove(1); return; }
                if (e.key === 'ArrowUp') { e.preventDefault(); _ddMove(-1); return; }
                if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); _ddPick(-1); return; }
                if (e.key === 'Escape') { e.stopPropagation(); _ddHide(); return; }
            }
            if (e.key === 'Enter') {
                e.preventDefault();
                const lines = Array.from(_win.querySelectorAll('.er-line'));
                const pos = lines.indexOf(row);
                if (pos >= 0 && pos < lines.length - 1) lines[pos + 1].querySelector('.er-l-qty').focus();
                else _focus('er-timeslot');
            }
        });
        function _artShow() {
            _ddShow(artInp, _searchArticles(artInp.value), it => {
                artInp.value = it._a; _updateEstimate();
                const lines = Array.from(_win.querySelectorAll('.er-line'));
                const pos = lines.indexOf(row);
                if (pos >= 0 && pos < lines.length - 1) lines[pos + 1].querySelector('.er-l-qty').focus();
                else _focus('er-timeslot');
            });
        }
        artInp.addEventListener('focus', _artShow);
        artInp.addEventListener('input', function () { _artShow(); _updateEstimate(); });
        artInp.addEventListener('blur', function () { setTimeout(() => { if (_dd.anchor === artInp) _ddHide(); }, 160); });
        qtyInp.addEventListener('input', _updateEstimate);

        if (focusIt) { qtyInp.focus(); qtyInp.select(); }
        return row;
    }

    function _getPackagesList() {
        return Array.from(_win.querySelectorAll('.er-line')).map(row => ({
            qty: parseInt(row.querySelector('.er-l-qty').value, 10) || 1,
            weight: '',
            size: row.querySelector('.er-l-art').value.trim()
        })).filter(p => p.size);
    }

    // ── precio estimado en vivo (mismo motor que la facturación) ──
    function _updateEstimate() {
        const el = $('er-price-est');
        if (!el) return;
        try {
            if (!_client || typeof window.calculateTicketPriceSync !== 'function') {
                el.textContent = '—'; el.style.color = '#666'; return;
            }
            const pkgs = _getPackagesList();
            if (!pkgs.length) { el.textContent = '—'; el.style.color = '#666'; return; }
            const pseudo = {
                packagesList: pkgs,
                cp: $('er-cp').value.trim(),
                localidad: $('er-localidad').value.trim(),
                province: $('er-provincia').value || ''
            };
            const compId = $('er-sede').value || 'comp_main';
            const price = window.calculateTicketPriceSync(pseudo, _client.id, compId);
            const uData = (window.userMap || {})[_client.id] || {};
            const tid = uData.tariffId ? String(uData.tariffId).trim() : '';
            if (uData.isFlatRate === true) {
                el.textContent = '0,00 € (tarifa plana mensual)'; el.style.color = '#5DADE2';
            } else if (price > 0) {
                el.textContent = _money(price); el.style.color = '#4CAF50';
                el.title = 'Tarifa: ' + (tid || 'personalizada');
            } else if (!tid) {
                el.textContent = '⚠ sin tarifa asignada'; el.style.color = '#FF9800';
                el.title = 'Asigna una tarifa al cliente en su ficha';
            } else {
                el.textContent = '0,00 € — tarifa "' + tid + '" no cubre este envío'; el.style.color = '#FF9800';
                el.title = 'La tarifa existe pero no da precio para estos bultos/destino';
            }
        } catch (e) {
            el.textContent = '—'; el.style.color = '#666';
        }
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
        _updateEstimate();
        _setStatus('Destino cargado' + (d.fuente === 'global' ? ' del directorio global 🌐' : ' de los envíos del cliente 📦') + ' — revisa y ENTER', '#4CAF50');
        const firstLine = _win.querySelector('.er-line .er-l-qty');
        if (firstLine) { firstLine.focus(); firstLine.select(); }
    }

    async function _pickClient(c) {
        _client = c;
        const inp = $('er-cliente');
        inp.value = c.name;
        inp.style.borderColor = '#4CAF50';
        $('er-cliente-num').textContent = 'nº ' + c.idNum;

        // Mostrar que estamos accediendo a su tarifa
        var priceEl = $('er-price-est');
        if (priceEl) { priceEl.textContent = 'cargando tarifa…'; priceEl.style.color = '#888'; }

        _comps = await _loadComps(c.id);
        const sel = $('er-sede');
        sel.innerHTML = _comps.map(cp =>
            '<option value="' + _esc(cp.id) + '">' + _esc(cp.id === 'comp_main' ? (cp.name || 'Principal') : (cp.name || cp.id)) + '</option>').join('');
        // Preseleccionar la emisora asignada en la ficha del cliente
        const uD = (window.userMap || {})[c.id] || {};
        await _loadEmisoras();
        _fillEmisoraSelect(uD.billingCompanyId || '');
        _loadDests(c.id, c.idNum).then(d => {
            _setStatus((d.length ? d.length + ' destinos conocidos de este cliente · ' : '') + (_comps.length > 1 ? _comps.length + ' sedes cargadas · ' : '') + 'buscador 🌐 global activo', '#5DADE2');
        });

        // ACCEDER A LA TARIFA PERSONALIZADA del cliente y recalcular el precio
        await _ensureClientTariff(c);
        _updateEstimate();

        if (_comps.length <= 1) _focus('er-receiver');
        else _focus('er-sede');
    }

    // ── TARIFA PERSONALIZADA del cliente ──
    // El motor de precios (calculateTicketPriceSync) lee window.tariffsCache;
    // al abrir la ventana puede estar vacío → precio 0. Aquí garantizamos que
    // la tarifa del cliente seleccionado esté cargada: su tarifa global
    // asignada (GLOBAL_{tariffId} y _v2), y su tarifa PERSONAL por docId/authUid.
    async function _ensureClientTariff(c) {
        if (!window.tariffsCache) window.tariffsCache = {};
        const cache = window.tariffsCache;
        const uData = (window.userMap || {})[c.id] || {};
        const tid = uData.tariffId ? String(uData.tariffId).trim() : '';

        // Claves que necesita el motor para ESTE cliente
        const wanted = [];
        if (tid) {
            wanted.push('GLOBAL_' + tid);
            wanted.push('GLOBAL_' + tid + '_v2');
            wanted.push('GLOBAL_' + tid.padStart(3, '0'));
        }
        wanted.push(c.id);                       // tarifa personal por docId
        if (uData.authUid) wanted.push(uData.authUid);
        if (uData.email) wanted.push(uData.email);

        const missing = wanted.filter(k => k && !cache[k]);
        if (!missing.length && Object.keys(cache).length > 0) return; // ya está

        // Cache global vacío → una sola carga trae TODO (incluye subtarifas)
        if (Object.keys(cache).length === 0) {
            try {
                const snap = await db.collection('tariffs').get();
                snap.forEach(d => { cache[d.id] = d.data(); });
                console.log('[ER] tarifas cargadas:', Object.keys(cache).length);
                return;
            } catch (e) { console.warn('[ER] carga masiva tarifas:', e); }
        }
        // Si no, solo las que falten para este cliente (targeted, barato)
        for (const k of missing) {
            try {
                const d = await db.collection('tariffs').doc(k).get();
                if (d.exists) cache[k] = d.data();
            } catch (e) { /* ignorar */ }
        }
    }

    // ── numeración atómica ──
    async function _nextTicketId(idNum, compId, comp) {
        // Motor compartido (billing_series.js): misma transacción atómica
        // que usan el alta manual del admin y la app cliente.
        if (typeof window.allocTicketId === 'function') {
            return await window.allocTicketId(idNum, compId, comp || {});
        }
        // Fallback local (por si billing_series no cargó)
        // Saneado: sedes antiguas pueden traer un UID como prefijo
        const prefix = (typeof window.sanitizeTicketPrefix === 'function')
            ? window.sanitizeTicketPrefix(comp && comp.prefix, idNum)
            : ((comp && comp.prefix) || 'NP');
        const YY = String(new Date().getFullYear()).slice(-2);
        const yearPrefix = prefix + '-' + YY + '-';
        const counterRef = db.collection('ticket_counters').doc(compId + '_' + idNum + '_' + YY);

        // Suelo configurado por el admin (comp_main.startNum): si el cliente
        // aún no tiene albaranes este año, el primero sale con ESE número.
        let seed = (comp && parseInt(comp.startNum, 10) > 0) ? parseInt(comp.startNum, 10) - 1 : 1000;
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
        if (!_client) { _setStatus('⚠ Elige un CLIENTE del buscador', '#FF9800'); _focus('er-cliente'); return false; }
        if (!$('er-receiver').value.trim()) { _setStatus('⚠ Falta el DESTINATARIO', '#FF9800'); _focus('er-receiver'); return false; }
        const pkgs = _getPackagesList();
        if (!pkgs.length) {
            _setStatus('⚠ Añade al menos una línea con ARTÍCULO', '#FF9800');
            const l = _win.querySelector('.er-line .er-l-art'); if (l) l.focus();
            return false;
        }
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

            const pkgs = _getPackagesList();
            let priceEst = 0;
            try {
                if (typeof window.calculateTicketPriceSync === 'function') {
                    priceEst = window.calculateTicketPriceSync({ packagesList: pkgs, cp: cp, localidad: locality, province: $('er-provincia').value || '' }, c.id, compId) || 0;
                }
            } catch (e) { /* estimación opcional */ }

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
                packagesList: pkgs,
                uid: uData.authUid || uData.id || c.id,
                billingEntityId: $('er-emisora').value || '', // quién FACTURA ('' = central)
                compId: compId,
                subTariffId: comp.subTariffId || null,
                clientIdNum: String(c.idNum),
                priceEstimated: Math.round(priceEst * 100) / 100, // informativo (la facturación recalcula con tarifa)
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
            const totalPkgs = pkgs.reduce((s, p) => s + p.qty, 0);
            const list = $('er-created-list');
            const row = document.createElement('div');
            row.style.cssText = 'display:flex; align-items:center; gap:10px; padding:6px 10px; border-bottom:1px solid #2d2d30; font-size:0.8rem;';
            row.innerHTML = '<span style="color:#4CAF50; font-weight:900; font-family:monospace;">' + _esc(businessId) + '</span>'
                + '<span style="color:#ddd; flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + _esc(ticketData.receiver) + '</span>'
                + '<span style="color:#888;">' + totalPkgs + ' bulto' + (totalPkgs === 1 ? '' : 's') + '</span>'
                + '<span style="color:' + (priceEst > 0 ? '#FFD700' : '#666') + '; font-weight:700;">' + (priceEst > 0 ? _money(priceEst) : '—') + '</span>'
                + '<span style="color:#888;">' + _esc(locality || cp || '') + '</span>'
                + '<button data-print style="background:#333; border:1px solid #4CAF50; color:#4CAF50; padding:2px 8px; font-size:0.72rem; cursor:pointer; border-radius:3px;">🖨️</button>';
            row.querySelector('[data-print]').addEventListener('click', function () {
                if (typeof printTicketFromAdmin === 'function') printTicketFromAdmin(c.id, compId, docId);
                else alert('Impresión no disponible en esta vista. Imprime desde Albaranes Centralizados.');
            });
            list.insertBefore(row, list.firstChild);

            // Limpiar destino + mercancía — cliente/sede se mantienen (taco)
            ['er-receiver', 'er-street', 'er-number', 'er-cp', 'er-localidad', 'er-phone'].forEach(id => { $(id).value = ''; });
            $('er-provincia').value = '';
            $('er-lines').innerHTML = '';
            _addLine(false);
            _updateEstimate();
            _setStatus('✅ ' + businessId + ' creado' + (priceEst > 0 ? ' · ' + _money(priceEst) : '') + ' — siguiente destinatario', '#4CAF50');
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
        _client = null; _comps = null; _createdCount = 0; _lineSeq = 0;

        const overlay = document.createElement('div');
        overlay.id = 'er-window-overlay';
        overlay.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.72); z-index:99995; display:flex; align-items:center; justify-content:center; padding:16px;';
        overlay.innerHTML = ''
            + '<div id="er-window" style="background:#1f1f22; border:1px solid #FF6600; border-radius:10px; width:100%; max-width:820px; max-height:94vh; display:flex; flex-direction:column; box-shadow:0 20px 60px rgba(0,0,0,0.8); overflow:hidden;">'

            + '  <div style="background:linear-gradient(135deg,#2a2a2e,#232326); padding:10px 16px; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #FF6600;">'
            + '    <div style="color:#FF6600; font-weight:900; letter-spacing:1px; font-size:0.95rem;">⚡ ENTRADA RÁPIDA DE ALBARANES</div>'
            + '    <button id="er-close" title="Cerrar (Esc)" style="background:none; border:none; color:#aaa; font-size:1.15rem; cursor:pointer; padding:2px 8px;">✕</button>'
            + '  </div>'

            + '  <div style="padding:14px 18px 6px; overflow-y:auto;">'

            + '    <div style="font-size:0.66rem; color:#FF6600; letter-spacing:2px; font-weight:700; margin-bottom:6px;">CLIENTE (REMITENTE) · QUIÉN FACTURA</div>'
            + '    <div style="display:grid; grid-template-columns: 1fr 150px 230px; gap:10px; margin-bottom:14px;">'
            + '      <div style="position:relative;">'
            + '        <input id="er-cliente" placeholder="🔍 Enfoca aquí y elige — o escribe nombre / nº de cliente" style="' + _inputStyle('border-color:#FF6600;') + '" autocomplete="off">'
            + '        <span id="er-cliente-num" style="position:absolute; right:10px; top:50%; transform:translateY(-50%); color:#4CAF50; font-size:0.7rem; font-weight:700;"></span>'
            + '      </div>'
            + '      <select id="er-sede" title="Sede del cliente (remitente del albarán)" style="' + _inputStyle() + '"><option value="comp_main">Principal</option></select>'
            + '      <select id="er-emisora" title="Empresa que FACTURARÁ este albarán (billing_companies)" style="' + _inputStyle('border-color:#FFB300;') + '"><option value="">🏢 Factura: Central (por defecto)</option></select>'
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

            + '    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">'
            + '      <div style="font-size:0.66rem; color:#FF6600; letter-spacing:2px; font-weight:700;">MERCANCÍA</div>'
            + '      <button id="er-add-line" style="background:transparent; border:1px solid #FF6600; color:#FF6600; padding:4px 12px; border-radius:5px; cursor:pointer; font-size:0.72rem; font-weight:700;">+ AÑADIR LÍNEA</button>'
            + '    </div>'
            + '    <div id="er-lines" style="margin-bottom:6px;"></div>'
            + '    <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:10px; margin-bottom:12px;">'
            + '      <select id="er-timeslot" style="' + _inputStyle() + '"><option>MAÑANA</option><option>TARDE</option></select>'
            + '      <select id="er-shipping" style="' + _inputStyle() + '"><option value="Pagados">Pagados</option><option value="Debidos">Debidos</option></select>'
            + '      <div style="display:flex; align-items:center; justify-content:flex-end; gap:8px; background:#26262a; border:1px solid #3c3c3c; border-radius:5px; padding:0 12px;">'
            + '        <span style="font-size:0.66rem; color:#888; letter-spacing:1px;">IMPORTE</span>'
            + '        <span id="er-price-est" style="font-size:1rem; font-weight:900; color:#666;">—</span>'
            + '      </div>'
            + '    </div>'

            + '    <div id="er-status" style="min-height:18px; font-size:0.75rem; color:#888; margin-bottom:8px;">Enfoca el campo Cliente para empezar — todo se maneja con ENTER y las flechas</div>'
            + '    <button id="er-save-btn" style="width:100%; background:linear-gradient(135deg,#FF6600,#E65100); border:0; color:#fff; padding:13px; border-radius:7px; cursor:pointer; font-weight:900; font-size:0.95rem; letter-spacing:1px;">💾 GUARDAR Y SIGUIENTE  (Enter)</button>'
            + '  </div>'

            + '  <div style="border-top:1px solid #333; background:#1a1a1c; max-height:170px; display:flex; flex-direction:column;">'
            + '    <div style="padding:8px 16px 4px; font-size:0.66rem; color:#888; letter-spacing:2px; font-weight:700;">CREADOS EN ESTA SESIÓN (<span id="er-count">0</span>)</div>'
            + '    <div id="er-created-list" style="overflow-y:auto; padding:0 8px 8px;"></div>'
            + '  </div>'

            + '</div>';

        document.body.appendChild(overlay);
        _win = overlay;

        _buildClientsIndex();
        _loadRoutes();
        _loadArticles();
        _loadEmisoras().then(() => _fillEmisoraSelect(''));
        // Precargar el catálogo de tarifas para que el precio salga al instante
        // en cuanto se elija cliente (calienta window.tariffsCache).
        try {
            if (!window.tariffsCache || Object.keys(window.tariffsCache).length === 0) {
                if (!window.tariffsCache) window.tariffsCache = {};
                db.collection('tariffs').get().then(function (snap) {
                    snap.forEach(function (d) { window.tariffsCache[d.id] = d.data(); });
                    console.log('[ER] tarifas precargadas:', Object.keys(window.tariffsCache).length);
                    if (_client) _updateEstimate();
                }).catch(function (e) { console.warn('[ER] precarga tarifas:', e); });
            }
        } catch (e) {}

        $('er-close').addEventListener('click', function () { _ddHide(); overlay.remove(); _win = null; });
        overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) { _ddHide(); overlay.remove(); _win = null; } });
        $('er-save-btn').addEventListener('click', _save);
        $('er-add-line').addEventListener('click', function () { _addLine(true); });

        overlay.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && !_ddOpen()) { _ddHide(); overlay.remove(); _win = null; return; }
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); _save(); return; }
        });

        HEAD_FIELDS.concat(TAIL_FIELDS).forEach(id => {
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
                    if (id === 'er-phone') {
                        const l = _win.querySelector('.er-line .er-l-qty');
                        if (l) { l.focus(); l.select(); }
                        return;
                    }
                    if (id === 'er-shipping') { _save(); return; }
                    const all = HEAD_FIELDS.concat(TAIL_FIELDS);
                    const nx = all[all.indexOf(id) + 1];
                    if (nx) _focus(nx);
                }
            });
            el.addEventListener('blur', function () { setTimeout(() => { if (_dd.anchor === el) _ddHide(); }, 160); });
        });

        const cliInp = $('er-cliente');
        function _cliShow() { _ddShow(cliInp, _searchClients(cliInp.value), it => _pickClient(it._c)); }
        cliInp.addEventListener('focus', _cliShow);
        cliInp.addEventListener('input', function () {
            _client = null; cliInp.style.borderColor = '#FF6600';
            $('er-cliente-num').textContent = '';
            _cliShow();
        });

        const recInp = $('er-receiver');
        function _recShow() { _ddShow(recInp, _searchDests(recInp.value), it => _pickDest(it._d)); }
        recInp.addEventListener('focus', _recShow);
        recInp.addEventListener('input', _recShow);

        $('er-cp').addEventListener('input', function () {
            const cp = $('er-cp').value.trim();
            if (cp.length >= 2) {
                const p = PROV_BY_CP[cp.substring(0, 2)];
                if (p) $('er-provincia').value = p;
            }
            _updateEstimate();
        });
        $('er-sede').addEventListener('change', _updateEstimate);

        const hour = new Date().getHours();
        $('er-timeslot').value = (hour >= 8 && hour < 15) ? 'MAÑANA' : 'TARDE';

        _addLine(false);
        _focus('er-cliente');
    }

    console.log('[ER] ⚡ Entrada Rápida (ventana+precios+multilínea) cargada');
})();
