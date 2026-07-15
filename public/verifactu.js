// =============================================================
// VERIFACTU — FASE 1 (frontend)
// RD 1007/2023 + Orden HAC/1177/2024
//
// Genera el QR tributario obligatorio en las facturas impresas
// (URL de cotejo de la AEAT). La huella SHA-256 y el encadena-
// miento de registros se calculan en servidor (Cloud Function
// verifactuStampInvoice) al crear cada factura — el QR no
// depende de la huella, solo de: NIF emisor, nº serie, fecha
// e importe total.
//
// FASE 2 (pendiente): envío de registros a la AEAT. Cuando se
// active, poner VERIFACTU_SENDING = true para que aparezca la
// leyenda «Factura verificable en la sede electrónica de la
// AEAT — VERI*FACTU» (solo permitida si realmente se remiten
// los registros).
// =============================================================
(function () {
    'use strict';

    // FASE 2: cambiar a true cuando el envío a AEAT esté operativo
    window.VERIFACTU_SENDING = false;

    var QR_BASE_URL = 'https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR';

    function _nif(raw) {
        return String(raw || '').replace(/[\s.\-]/g, '').toUpperCase();
    }

    function _round2(n) {
        return Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100;
    }

    // dd-mm-yyyy a partir de Timestamp Firestore / Date / string
    function _fechaDDMMYYYY(v) {
        var d = null;
        if (v && typeof v.toDate === 'function') d = v.toDate();
        else if (v instanceof Date) d = v;
        else if (v) { var t = new Date(v); if (!isNaN(t.getTime())) d = t; }
        if (!d) d = new Date();
        var dd = String(d.getDate()).padStart(2, '0');
        var mm = String(d.getMonth() + 1).padStart(2, '0');
        return dd + '-' + mm + '-' + d.getFullYear();
    }

    // URL de cotejo AEAT (Orden HAC/1177/2024, anexo II)
    window.verifactuQRUrl = function (nif, numserie, fecha, importe) {
        return QR_BASE_URL
            + '?nif=' + encodeURIComponent(nif)
            + '&numserie=' + encodeURIComponent(numserie)
            + '&fecha=' + encodeURIComponent(fecha)
            + '&importe=' + encodeURIComponent(importe);
    };

    // Bloque HTML con el QR tributario para insertar en la plantilla
    // de factura. Devuelve '' si faltan datos o falla la librería QR.
    //   inv        → objeto factura (invoiceId, date, subtotal, iva, senderData)
    //   senderCif  → (opcional) NIF emisor si no viene en inv.senderData.cif
    window.verifactuQRBlock = function (inv, senderCif) {
        try {
            if (!inv) return '';
            var nif = _nif(senderCif || (inv.senderData && inv.senderData.cif));
            var numserie = String(inv.invoiceId || '').trim();
            if (!nif || !numserie) return '';

            var fecha = _fechaDDMMYYYY(inv.date || inv.createdAt);
            // ImporteTotal Verifactu = base + cuota IVA (el IRPF no forma
            // parte del registro). Debe coincidir con el registro sellado
            // en servidor.
            var importe = _round2((Number(inv.subtotal) || 0) + (Number(inv.iva) || 0)).toFixed(2);
            var url = window.verifactuQRUrl(nif, numserie, fecha, importe);

            if (typeof QRious === 'undefined') {
                console.warn('verifactu: QRious no cargado, factura sin QR tributario');
                return '';
            }
            var dataUrl = new QRious({ value: url, size: 240, level: 'M', padding: 12 }).toDataURL();

            // Leyenda VERI*FACTU solo si el sistema remite registros a AEAT
            var leyenda = window.VERIFACTU_SENDING
                ? '<div style="font-size:7.5px; color:#666; margin-top:2px; max-width:120px; line-height:1.3;">Factura verificable en la sede electr&oacute;nica de la AEAT<br><b>VERI*FACTU</b></div>'
                : '';

            return '<div style="display:flex; flex-direction:column; align-items:flex-start;">'
                + '<div style="font-size:7.5px; color:#999; letter-spacing:1px; text-transform:uppercase; margin-bottom:3px;">QR tributario</div>'
                + '<img src="' + dataUrl + '" style="width:113px; height:113px; display:block; border:0.5px solid #eee;" alt="QR tributario AEAT"/>'
                + leyenda
                + '</div>';
        } catch (e) {
            console.warn('verifactu: error generando QR', e);
            return '';
        }
    };
})();
