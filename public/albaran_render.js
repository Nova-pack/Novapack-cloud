/**
 * ALBARÁN — RENDERIZADOR ÚNICO DE NOVAPACK
 * =============================================================
 * FUENTE ÚNICA DE VERDAD del formato físico del albarán. Antes había CUATRO
 * copias de esta función y se habían separado en DOS formatos distintos:
 *
 *   • 132mm con QR grande y CIF  → app de cliente y previsualización
 *   • 110mm con provincia naranja → admin y conductor,
 *     y la del admin además imprimía el NOMBRE DEL CLIENTE donde va el logo
 *
 * El mismo albarán salía distinto según desde dónde se imprimiera. Ahora todos
 * cargan este fichero: un solo formato, imposible que vuelvan a divergir.
 *
 * Lo carga: app.html, admin.html, conductor/index.html y albaran_preview.html.
 * No depende de Firebase ni de ninguna variable global de la app: lo único que
 * necesita del anfitrión es window.npGenerateQrUrl (generador de QR local).
 *
 * OJO al tocar: el albarán es el documento de transporte de NOVAPACK. El
 * membrete es SIEMPRE NOVAPACK; los datos del cliente van en REMITENTE.
 */
(function (global) {
'use strict';

// escapeHtml propio: el anfitrión puede no tenerlo (conductor, preview).
function escapeHtml(x) {
    return String(x == null ? '' : x)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const NOVAPACK_CARRIER = {
    name:  'NOVAPACK SERVI INMEDIATO DE PAQUETERIA S.L.',
    nif:   'B93587194',
    email: 'administracion@novapack.info'
};

function npBultosExpandidos(t) {
    const out = [];
    if (t && t.packagesList && t.packagesList.length > 0) {
        t.packagesList.forEach(function (p) {
            const q = parseInt(p.qty) || 1;
            for (let i = 0; i < q; i++) {
                out.push({ weight: parseFloat(p.weight) || 0, size: p.size || 'Bulto' });
            }
        });
    }
    if (out.length === 0) {
        const q = parseInt(t && t.packages) || 1;
        for (let i = 0; i < q; i++) {
            out.push({ weight: parseFloat(t && t.weight) || 0, size: (t && t.size) || 'Bulto' });
        }
    }
    return out;
}

function npTotalBultos(t) {
    return npBultosExpandidos(t).length;
}

function npQrField(v) {
    return String(v == null ? '' : v).replace(/\|/g, '/').replace(/[\r\n]+/g, ' ').trim();
}

function setPrintPageSize(size) {
    let s = document.getElementById('print-page-size');
    if (!s) {
        s = document.createElement('style');
        s.id = 'print-page-size';
        document.head.appendChild(s);
    }
    const parsedSize = size === "101.6mm 152.4mm" ? "auto" : size;
    // Dimensiones físicas según size (para forzar el body)
    let bodyW = '210mm', bodyH = 'auto';
    if (parsedSize === 'A4 portrait' || parsedSize === 'A4') { bodyW = '210mm'; bodyH = 'auto'; }
    else if (parsedSize === 'A4 landscape') { bodyW = '297mm'; bodyH = 'auto'; }
    else if (parsedSize === 'A5 portrait' || parsedSize === 'A5') { bodyW = '148mm'; bodyH = 'auto'; }

    s.innerHTML = `
        @media print {
            @page {
                size: ${parsedSize} !important;
                margin: 0 !important;
                marks: none !important;
            }
            html, body {
                margin: 0 !important;
                padding: 0 !important;
                background: white !important;
                width: ${bodyW} !important;
                height: ${bodyH} !important;
                min-height: 0 !important;
                max-width: ${bodyW} !important;
                /* Forzar render exacto de colores/fondos/bordes — neutraliza
                   el "ahorro de tinta" que algunos drivers aplican */
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                color-adjust: exact !important;
                overflow: hidden !important;
            }
            /* Esconder TODO menos print-area — neutraliza sidebars, headers,
               nav, modals abiertos, etc. de la página padre */
            body > *:not(#print-area) { display: none !important; }
            body > #print-area {
                display: block !important;
                visibility: visible !important;
                position: static !important;
                margin: 0 !important;
                padding: 0 !important;
                width: ${bodyW} !important;
                background: white !important;
            }
            #print-area, #print-area * {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                color-adjust: exact !important;
            }
            /* Bloquear el reajuste de tamaño que algunos browsers aplican */
            #print-area > * {
                box-sizing: border-box !important;
                page-break-after: always !important;
                page-break-inside: avoid !important;
                break-inside: avoid !important;
            }
            #print-area > *:last-child {
                page-break-after: auto !important;
            }
            /* Asegurar que las imágenes (QR) salen en máxima calidad */
            #print-area img {
                image-rendering: pixelated !important;
                max-width: 100% !important;
            }
        }
    `;
}

function generateTicketHTML(t, footerLabel) {
    const ts = (t.createdAt && typeof t.createdAt.toDate === 'function') ? t.createdAt.toDate() : (t.createdAt ? new Date(t.createdAt) : new Date());
    const validDateStr = !isNaN(ts.getTime())
        ? (ts.toLocaleDateString('es-ES') + " " + ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
        : "Fecha pendiente";

    // ── Emisor del albarán: SIEMPRE NOVAPACK (ver NOVAPACK_CARRIER) ──
    const billingName  = NOVAPACK_CARRIER.name;
    const billingNif   = NOVAPACK_CARRIER.nif;
    const billingEmail = NOVAPACK_CARRIER.email;

    // ── Auto-agrupar items por size+peso ──
    let rawList = [];
    if (t.packagesList && t.packagesList.length > 0) {
        rawList = t.packagesList;
    } else {
        rawList = [{
            qty: parseInt(t.packages) || 1,
            weight: parseFloat(t.weight) || 0,
            size: t.size || 'Bulto'
        }];
    }
    const groupMap = {};
    rawList.forEach((p) => {
        const qty    = parseInt(p.qty) || 1;
        const weight = parseFloat(p.weight) || 0;
        const size   = p.size || 'Bulto';
        const key    = size + '|' + weight;
        if (!groupMap[key]) groupMap[key] = { qty: 0, weight: weight, size: size };
        groupMap[key].qty += qty;
    });
    const grouped = Object.values(groupMap);

    // Totales
    const totalBultos = grouped.reduce((s, p) => s + p.qty, 0);
    const totalPeso   = grouped.reduce((s, p) => s + (p.weight * p.qty), 0);
    const anyWeight   = grouped.some(p => p.weight > 0);
    // Umbral a 4 (no 6) para que no se desborde la media-página A4
    const manyLines   = grouped.length > 4;

    // Reembolso
    const hasCod = t.cod && t.cod.toString().trim() !== '' && t.cod.toString() !== '0';

    // Pre-albarán (sello discreto B&N)
    const isPrealbaran = (t.originType === 'driver_pickup_no_doc') || (t.status === 'pending_client_completion');

    // Porte
    const porteLabel = t.shippingType === 'Debidos' ? 'DEBIDOS' : 'PAGADOS';
    const paymentType = t.paymentType || (t.shippingType === 'Debidos' ? 'DEBIDO' : 'PAGADO');
    const portePagadoBy = t.portePagadoBy || (paymentType === 'DEBIDO' ? 'receiver' : 'sender');

    // QR enriquecido — incluye PAY/PAYBY/COMP para auto-completar el formulario de facturación al escanear en oficina
    const qrData =
        `ID:${t.id || ''}` +
        `|DEST:${t.receiver || ''}` +
        `|ADDR:${t.address || ''}` +
        `|PROV:${t.province || ''}` +
        `|TEL:${t.phone || ''}` +
        `|COD:${t.cod || 0}` +
        `|BULTOS:${totalBultos}` +
        `|PESO:${anyWeight ? totalPeso.toFixed(0) : 0}` +
        `|OBS:${(t.notes || '').substring(0, 80)}` +
        `|CLI:${t.clientIdNum || ''}` +
        `|NIF:${t.receiverNif || ''}` +
        `|PAY:${paymentType}` +
        `|PAYBY:${portePagadoBy}` +
        `|COMP:${t.compId || ''}`;

    // QR local (sin dependencia externa) vía helper compartido
    const qrUrl = window.npGenerateQrUrl(qrData, 400);

    // Bandas (cada artículo agrupado) — compactas para caber en media página A4
    const bandsHtml = grouped.map((p) => {
        const w = (p.weight > 0)
            ? `<div style="padding:2px 7px; font-size:7pt; color:#555; background:#f5f5f5; display:flex; align-items:center; border-left:1px dashed #999; font-weight:600;">${(p.weight * p.qty).toFixed(0)} kg</div>`
            : '';
        return `<div style="display:flex; align-items:stretch; border:1px solid #000;">` +
            `<div style="background:#000; color:#fff; font-family:'Outfit',sans-serif; font-weight:900; font-size:10pt; padding:1px 8px; min-width:28px; text-align:center; display:flex; align-items:center; justify-content:center; line-height:1;">${p.qty}</div>` +
            `<div style="flex:1; padding:1px 8px; font-weight:800; font-size:8.5pt; display:flex; align-items:center; text-transform:uppercase;">${escapeHtml(p.size)}</div>` +
            w +
        `</div>`;
    }).join('');

    const bandsContainerStyle = manyLines
        ? 'display:grid; grid-template-columns:1fr 1fr; gap:2px;'
        : 'display:grid; gap:2px;';

    // Sello pre-albarán (B&N, discreto)
    const preStamp = isPrealbaran
        ? `<div style="display:inline-block; margin-top:4px; padding:2px 8px; border:2px solid #000; background:#fff; font-family:'Outfit',sans-serif; font-weight:900; font-size:7pt; letter-spacing:1px; line-height:1.2;">PRE-ALBARÁN<span style="display:block; font-size:5.5pt; font-weight:700; letter-spacing:0; margin-top:1px;">Completar 24h</span></div>`
        : '';

    return `
    <div style="font-family:'Inter',Arial,sans-serif; padding:3mm 5mm; border:1.5px solid #000; height:132mm; max-height:132mm; position:relative; box-sizing:border-box; display:flex; flex-direction:column; overflow:hidden; background:white; color:#000;">
        <!-- Marca de agua provincia (intacta) -->
        ${t.province ? `<div style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%) rotate(-25deg); font-size:6rem; color:#000; font-weight:900; white-space:nowrap; z-index:0; pointer-events:none; width:100%; text-align:center; font-family:'Arial Black',sans-serif; opacity:0.05; text-transform:uppercase;">${escapeHtml(t.province)}</div>` : ''}

        <!-- ── CABECERA (compacta para caber en 132mm) ── -->
        <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:1.5px solid #000; padding-bottom:3px; margin-bottom:4px; position:relative; z-index:2;">
            <!-- Logo + empresa facturadora -->
            <!-- Xenotron es una fuente MUY ancha por diseño; ajustamos tamaño
                 y quitamos letter-spacing extra, además de overflow:hidden +
                 nowrap como red de seguridad para que jamás invada el bloque
                 central, da igual cómo renderice la impresora. -->
            <div style="flex:0 0 32%; max-width:32%; min-width:0; overflow:hidden;">
                <div style="font-family:'Xenotron','Outfit',sans-serif; font-weight:900; font-size:13pt; color:#FF6600; line-height:1; letter-spacing:0; white-space:nowrap; overflow:hidden;">NOVAPACK<span style="color:#FF3B30; font-family:sans-serif; font-weight:900; margin-left:1px;">►</span></div>
                <div style="margin-top:3px; font-size:7pt; line-height:1.3; color:#333;">
                    ${escapeHtml(billingEmail)}<br>
                    ${billingNif ? `<span style="font-weight:700; color:#000;">NIF: ${escapeHtml(billingNif)}</span><br>` : ''}
                    <span style="color:#777; font-size:6.5pt;">${escapeHtml(billingName)}</span>
                </div>
                ${preStamp}
            </div>

            <!-- Centro: bloque protagonista compacto -->
            <div style="flex:1; padding:0 6px; text-align:center;">
                <div style="font-family:'Outfit',sans-serif; font-size:13pt; font-weight:900; line-height:1; color:#000; padding:2px 0; border-top:1px solid #000; border-bottom:1px solid #000; background:#f0f0f0; letter-spacing:1px;">PORTES ${porteLabel}</div>
                <div style="margin-top:3px; padding:2px 6px; border:2.5px solid #000; font-family:'Outfit',sans-serif; font-weight:900; font-size:18pt; line-height:1.1; letter-spacing:-0.5px;">${escapeHtml(t.id || '')}</div>
                ${t.province ? `<div style="margin-top:2px; font-family:'Outfit',sans-serif; font-weight:900; font-size:10pt; text-transform:uppercase; letter-spacing:1.5px;">→ ${escapeHtml(t.province)} ←</div>` : ''}
                ${(t.timeSlot || hasCod) ? `<div style="margin-top:2px; font-size:7.5pt; font-weight:700; color:#000;">${t.timeSlot ? `TURNO: ${escapeHtml(t.timeSlot)}` : ''}${hasCod ? `<span style="display:inline-block; padding:1px 5px; border:1.5px solid #000; margin-left:5px; font-weight:900;">REEMB: ${escapeHtml(t.cod)} €</span>` : ''}</div>` : ''}
            </div>

            <!-- Derecha: Fecha + QR (~30mm físicos para escaneo móvil fiable) -->
            <div style="flex:0 0 115px; text-align:right; display:flex; flex-direction:column; align-items:flex-end;">
                <div style="font-size:7pt; font-weight:700; margin-bottom:2px; color:#000;">${validDateStr}</div>
                <div style="width:113px; height:113px; background:#fff; display:flex; align-items:center; justify-content:center;">
                    <img src="${qrUrl}" alt="QR" style="display:block; width:100%; height:100%; image-rendering:pixelated;">
                </div>
            </div>
        </div>

        <!-- ── REMITENTE / DESTINATARIO (compacto) ── -->
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-bottom:4px; position:relative; z-index:2;">
            <div style="border:1px solid #999; padding:3px 6px; font-size:8.5pt; line-height:1.25;">
                <h4 style="margin:0 0 1px; font-size:6.5pt; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:#555;">Remitente</h4>
                <div style="font-weight:700; font-size:9.5pt;">${escapeHtml(t.sender || '')}</div>
                ${escapeHtml(t.senderAddress || '')}
                ${t.senderPhone ? `<span style="color:#555; font-size:7.5pt;"> · Tel: ${escapeHtml(t.senderPhone)}</span>` : ''}
            </div>
            <div style="border:1.5px solid #000; padding:3px 6px; font-size:8.5pt; line-height:1.25;">
                <h4 style="margin:0 0 1px; font-size:6.5pt; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:#000;">Destinatario</h4>
                <div style="font-weight:900; font-size:10pt;">${escapeHtml(t.receiver || '')}</div>
                ${escapeHtml([t.address, t.cp, t.localidad].filter(Boolean).join(' · '))}
                ${t.phone ? `<span style="color:#555; font-size:7.5pt;"> · Tel: ${escapeHtml(t.phone)}</span>` : ''}
            </div>
        </div>

        <!-- ── ARTÍCULOS (Hero compacto + bandas) ── -->
        <div style="margin-bottom:4px; position:relative; z-index:2;">
            <div style="border:3px solid #000; text-align:center; padding:3px 8px 5px; margin-bottom:4px;">
                <div style="display:flex; justify-content:center; align-items:baseline; gap:8px;">
                    <span style="font-size:7pt; font-weight:700; text-transform:uppercase; letter-spacing:2px; color:#555;">TOTAL</span>
                    <span style="font-family:'Outfit',sans-serif; font-weight:900; font-size:32pt; line-height:1; letter-spacing:-1.5px;">${totalBultos}</span>
                    <span style="font-size:10pt; font-weight:800; text-transform:uppercase; letter-spacing:2px;">Bultos</span>
                    ${anyWeight ? `<span style="font-size:8pt; font-weight:700; color:#555; letter-spacing:1px; border-left:1px dashed #999; padding-left:8px;">${totalPeso.toFixed(0)} KG</span>` : ''}
                </div>
            </div>
            <div style="${bandsContainerStyle}">${bandsHtml}</div>
        </div>

        <!-- ── OBSERVACIONES (max 2 líneas, recorta limpio) ── -->
        ${t.notes ? `<div style="border:1px solid #ccc; padding:3px 7px; font-size:8pt; margin-bottom:4px; position:relative; z-index:2; line-height:1.3; max-height:9mm; overflow:hidden;">
            <strong style="font-size:6.5pt; text-transform:uppercase; letter-spacing:1px; color:#555;">Obs:</strong> ${escapeHtml(t.notes)}
        </div>` : ''}

        <!-- ── FIRMA SIMPLIFICADA (cajas más bajas) ── -->
        <div style="margin-top:auto; display:grid; grid-template-columns:1fr 1.4fr; gap:8px; border-top:1.5px solid #000; padding-top:3px; position:relative; z-index:2;">
            <div>
                <h4 style="margin:0 0 1px; font-size:6.5pt; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:#000;">DNI / Sello</h4>
                <div style="border-bottom:1px solid #000; height:13mm;"></div>
            </div>
            <div>
                <h4 style="margin:0 0 1px; font-size:6.5pt; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:#000;">Firma</h4>
                <div style="border:1px solid #000; height:15mm;"></div>
            </div>
        </div>

        <!-- Ejemplar -->
        <div style="margin-top:4px; text-align:right; font-size:7pt; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:#666; position:relative; z-index:2;">
            ${escapeHtml(footerLabel || '')}
        </div>
    </div>
    `;
}

// ── Exportación ────────────────────────────────────────────────────
global.NOVAPACK_CARRIER      = NOVAPACK_CARRIER;
global.npBultosExpandidos    = npBultosExpandidos;
global.npTotalBultos         = npTotalBultos;
global.npQrField             = npQrField;
global.npSetPrintPageSize    = setPrintPageSize;
global.npGenerateTicketHTML  = generateTicketHTML;

})(window);
