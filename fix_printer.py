import os

# 1. FIX FIREBASE-APP.JS CSS OVERFLOWS
path_fb = r'c:\NOVAPACK CLOUD\public\firebase-app.js'
with open(path_fb, 'r', encoding='utf-8') as f:
    js = f.read()

# Fix generateTicketHTML CSS for notes
old_css_ticket = r"padding: 2px 5px; font-size: 0.75rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"
new_css_ticket = r"padding: 2px 5px; font-size: 0.75rem; white-space: pre-wrap; word-break: break-word; overflow: hidden; max-height: 50px;"
js = js.replace(old_css_ticket, new_css_ticket)

# Fix generateLabelHTML CSS for notes
old_css_label = r"padding-top: 5px; white-space: normal; line-height: 1.2;"
new_css_label = r"padding-top: 5px; white-space: pre-wrap; word-break: break-word; overflow: hidden; line-height: 1.2;"
js = js.replace(old_css_label, new_css_label)

with open(path_fb, 'w', encoding='utf-8') as f:
    f.write(js)

# 2. INJECT missing generateAdminA4TicketHTML to admin.html and fix its CSS
path_ad = r'c:\NOVAPACK CLOUD\public\admin.html'
with open(path_ad, 'r', encoding='utf-8') as f:
    html = f.read()

offline_ticket_generator = """
            function generateAdminA4TicketHTML(t, footerLabel, qrImageSrc) {
                const ts = (t.createdAt && typeof t.createdAt.toDate === 'function') ? t.createdAt.toDate() : (t.createdAt ? new Date(t.createdAt) : new Date());
                const validDateStr = !isNaN(ts.getTime()) ? (ts.toLocaleDateString() + " " + ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })) : "Fecha pendiente";

                let displayList = t.packagesList && t.packagesList.length > 0 ? t.packagesList : [{ qty: parseInt(t.packages) || 1, weight: t.weight, size: t.size }];
                const hasCod = t.cod && t.cod.toString().trim() !== '' && t.cod.toString() !== '0';

                let rowsHtml = '';
                displayList.forEach((p) => {
                    let w = p.weight;
                    if (typeof w === 'number') w = w + " kg";
                    if (typeof w === 'string' && !w.includes('kg')) w = w + " kg";
                    const qty = p.qty || 1;
                    rowsHtml += `<tr><td style="border: 1px solid #000; padding: 1px 3px; text-align: center; font-size: 8pt;">${qty}</td><td style="border: 1px solid #000; padding: 1px 3px; text-align: center; font-size: 8pt;">${w}</td><td style="border: 1px solid #000; padding: 1px 3px; text-align: center; font-size: 8pt;">${p.size || 'Bulto'}</td>${hasCod ? `<td style="border: 1px solid #000; padding: 1px 3px; text-align: center; font-size: 8pt;">${t.cod} €</td>` : ''}</tr>`;
                });

                return `
                <div style="font-family: Arial, sans-serif; padding: 4px; border: 2px solid #000; min-height: 110mm; height: 110mm; position: relative; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden; background: white;">
                    ${t.province ? `<div style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%) rotate(-25deg); font-size:4.5rem; color:#000; font-weight:900; white-space:nowrap; z-index:0; pointer-events:none; width: 100%; text-align: center; font-family: 'Arial Black', sans-serif; opacity: 0.04; text-transform: uppercase;">${t.province}</div>` : ''}
                    <div style="z-index: 2;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #000; padding-bottom: 5px; margin-bottom: 5px; position:relative;">
                            <div style="flex: 1;">
                                <div style="font-family: 'Xenotron', sans-serif; font-size: 24pt; color: #FF6600; line-height: 1;">NOVAPACK</div>
                                <div style="font-size: 0.7rem; letter-spacing: 0.5px; color:#333; margin-top: 2px;">administracion@novapack.info</div>
                            </div>
                            <div style="flex: 1; text-align: center; padding: 0 10px;">
                                <div style="padding: 5px; background:#FFF; display: inline-block; min-width: 140px;">
                                    <div style="font-size: 0.9rem; font-weight: bold; color: #000; margin-bottom: 5px;">PORTES ${t.shippingType === 'Debidos' ? 'DEBIDOS' : 'PAGADOS'}</div>
                                    <div style="font-size: 1.6rem; font-weight: 900; color: #FF6600; text-transform:uppercase; line-height: 1.1;">${t.province || '&nbsp;'}</div>
                                    ${t.timeSlot ? `<div style="font-size: 0.9rem; font-weight: 900; background: #EEE; color: #000; text-align: center; padding: 3px 5px; margin-top: 4px; border-radius: 4px;">TURNO: ${t.timeSlot}</div>` : ''}
                                    ${hasCod ? `<div style="font-size: 1.1rem; font-weight: 900; color: #FF3B30; margin-top: 5px; border-top: 1px solid #FF6600; padding-top:4px;">REEMBOLSO: ${t.cod} €</div>` : ''}
                                </div>
                            </div>
                            <div style="flex: 1; text-align: right; display: flex; flex-direction: row-reverse; gap: 10px; align-items: start;">
                                <div style="text-align: right;">
                                    <div style="font-size: 1rem; font-weight: bold; margin-bottom: 5px;">${validDateStr}</div>
                                    <div style="font-size: 0.75rem; color: #555; text-transform:uppercase; font-weight: 800;">Albarán Nº</div>
                                    <div style="font-family: 'Outfit', sans-serif; font-size: 1.6rem; color: #000; font-weight: 800; letter-spacing: -1px;">${t.id}</div>
                                </div>
                                <div style="background: white; padding: 2px; border: 1px solid #eee;">
                                    <img src="${qrImageSrc}" alt="QR Albaran" style="display: block; width: 110px; height: 110px; image-rendering: pixelated;">
                                </div>
                            </div>
                        </div>
                        <div style="margin-top: 5px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; position:relative;">
                            <div style="border: 1px solid #ccc; padding: 5px; font-size: 0.8rem;"><strong>REMITENTE:</strong><br>${t.sender}<br>${t.senderAddress || ''}<br>${t.senderPhone ? `Telf: ${t.senderPhone}` : ''}</div>
                            <div style="border: 1px solid #000; padding: 5px; font-size: 10pt;"><strong>DESTINATARIO:</strong><br><div style="font-weight:bold; font-size:1.1em;">${t.receiver}</div>${t.address}</div>
                        </div>
                        <table style="width: 100%; margin-top: 5px; border-collapse: collapse; border: 1px solid #ccc;">
                            <thead><tr style="border-bottom: 1px solid #ccc; color: #000;"><th style="border: 1px solid #ccc; padding: 1px; font-size: 0.7rem;">BULTOS</th><th style="border: 1px solid #ccc; padding: 1px; font-size: 0.7rem;">PESO</th><th style="border: 1px solid #ccc; padding: 1px; font-size: 0.7rem;">MEDIDA</th>${hasCod ? '<th style="border: 1px solid #ccc; padding: 1px; font-size: 0.7rem;">REEMBOLSO</th>' : ''}</tr></thead>
                            <tbody>${rowsHtml}</tbody>
                        </table>
                        <div style="margin-top: 5px; border: 1px solid #ccc; padding: 5px; background:transparent; display:flex; justify-content:space-around; font-weight:bold; font-size:1rem;">
                            <span>TOTAL BULTOS: ${displayList.reduce((sum, p) => sum + (parseInt(p.qty) || 1), 0)}</span>
                            <span>TOTAL PESO: ${displayList.reduce((sum, p) => sum + ((parseFloat(p.weight) || 0) * (parseInt(p.qty) || 1)), 0).toFixed(2)} kg</span>
                        </div>
                        <div style="margin-top: 4px; border: 1px solid #ccc; padding: 2px 5px; font-size: 0.75rem; white-space: pre-wrap; word-break: break-word; overflow: hidden; max-height: 50px;">
                            <strong>Observaciones:</strong> ${t.notes}
                        </div>
                    </div>
                    <div style="margin-top: 5px; font-size: 0.7rem; width: 100%; display: flex; justify-content: flex-end; padding-right: 10px;">
                        <div style="text-align:right;"><span>Firma y Sello:</span><br><span style="font-weight: bold; text-transform: uppercase;">${footerLabel}</span></div>
                    </div>
                </div>`;
            }

"""

if "function generateAdminA4TicketHTML" not in html:
    insert_point = "window.printTicketFromAdmin = async"
    html = html.replace(insert_point, offline_ticket_generator + insert_point)

with open(path_ad, 'w', encoding='utf-8') as f:
    f.write(html)

print("CSS Fixed and generateAdminA4TicketHTML injected.")
