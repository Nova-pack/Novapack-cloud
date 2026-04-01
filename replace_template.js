const fs = require('fs');
const file = 'c:\\NOVAPACK CLOUD\\public\\admin.html';
let content = fs.readFileSync(file, 'utf8');

const regex = /function generateInvoiceHTML\(inv, date\) {[\s\S]*?return `[\s\S]*?<\/div>`;\s*}/;

const newHTML = `function generateInvoiceHTML(inv, date) {
                let conceptHTML = '';
                if (inv.advancedGrid && inv.advancedGrid.length > 0) {
                    inv.advancedGrid.forEach(r => {
                        const showDetails = r.qty !== 1 || r.discount > 0 ? \`<div style="font-size: 0.75rem; color: #888; margin-top: 4px;">Cant: \${r.qty} x \${r.price.toFixed(2)}€ \${r.discount > 0 ? "(-" + r.discount + "%)" : ""}</div>\` : '';
                        conceptHTML += \`
                        <tr>
                            <td style="padding: 12px 15px; border-bottom: 1px solid #E5E7EB;">
                                <div style="font-weight: 600; color: #1F2937; font-size: 0.9rem;">\${r.description}</div>
                                \${showDetails}
                            </td>
                            <td style="padding: 12px 15px; border-bottom: 1px solid #E5E7EB; text-align: center; color: #4B5563; font-size: 0.9rem;">\${r.qty}</td>
                            <td style="padding: 12px 15px; border-bottom: 1px solid #E5E7EB; text-align: right; color: #4B5563; font-size: 0.9rem;">\${r.price.toFixed(2)}€</td>
                            <td style="padding: 12px 15px; border-bottom: 1px solid #E5E7EB; text-align: right; font-weight: 600; color: #1F2937; font-size: 0.95rem;">\${r.total.toFixed(2)}€</td>
                        </tr>\`;
                    });
                } else if (inv.ticketsDetail && inv.ticketsDetail.length > 0) {
                    const grouped = {};
                    inv.ticketsDetail.forEach(t => {
                        const group = t.compName || "Sede Principal";
                        if (!grouped[group]) grouped[group] = { ids: [], subtotal: 0 };
                        grouped[group].ids.push(t.id);
                        grouped[group].subtotal += (t.price || 0);
                    });

                    Object.keys(grouped).forEach(group => {
                        conceptHTML += \`
                    <tr>
                        <td style="padding: 12px 15px; border-bottom: 1px solid #E5E7EB;">
                            <div style="font-weight: 600; color: #1F2937; font-size: 0.95rem;">Servicios de Transporte: \${group}</div>
                            <div style="font-size: 0.75rem; color: #6B7280; margin-top: 4px; line-height: 1.4;">Albaranes: \${grouped[group].ids.join(', ')}</div>
                        </td>
                        <td style="padding: 12px 15px; border-bottom: 1px solid #E5E7EB; text-align: center; color: #4B5563;">-</td>
                        <td style="padding: 12px 15px; border-bottom: 1px solid #E5E7EB; text-align: right; color: #4B5563;">-</td>
                        <td style="padding: 12px 15px; border-bottom: 1px solid #E5E7EB; text-align: right; font-weight: 600; color: #1F2937;">\${grouped[group].subtotal.toFixed(2)}€</td>
                    </tr>\`;
                    });
                } else {
                    conceptHTML = \`
                <tr>
                    <td style="padding: 12px 15px; border-bottom: 1px solid #E5E7EB; color: #1F2937;">Servicios de transporte (Albaranes: \${inv.tickets.join(', ')})</td>
                    <td style="padding: 12px 15px; border-bottom: 1px solid #E5E7EB; text-align: center; color: #4B5563;">-</td>
                    <td style="padding: 12px 15px; border-bottom: 1px solid #E5E7EB; text-align: right; color: #4B5563;">-</td>
                    <td style="padding: 12px 15px; border-bottom: 1px solid #E5E7EB; text-align: right; font-weight: 600; color: #1F2937;">\${inv.subtotal.toFixed(2)}€</td>
                </tr>\`;
                }

                const logoTag = inv.isAbono 
                    ? '<div style="background:#FEE2E2; color:#DC2626; padding:8px 16px; border-radius:6px; font-weight:bold; font-size:1rem; display:inline-block; border:1px solid #F87171;">FACTURA RECTIFICATIVA</div>' 
                    : '<div style="color: #FF6600; font-weight: 900; font-size: 2.2rem; letter-spacing: -1px; display: flex; align-items: center; gap: 8px;"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg> NOVAPACK</div>';

                const senderBranch = inv.senderData || {};

                return \`
            <div style="font-family: 'Inter', 'Roboto', 'Segoe UI', sans-serif; padding: 40px; color: #374151; line-height: 1.5; background:white; max-width: 800px; margin: 0 auto; min-height: 1000px; position:relative; box-sizing:border-box;">
                
                <!-- HEADER -->
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px;">
                    <div>
                        \${logoTag}
                        <div style="margin-top: 15px; font-size: 0.9rem; color: #6B7280; line-height: 1.6;">
                            <strong style="color: #1F2937;">\${senderBranch.name || 'NOVAPACK LOGÍSTICA'}</strong><br>
                            CIF/NIF: \${senderBranch.cif || '-'}<br>
                            \${(senderBranch.address || '').replace(/,/g, '<br>')}<br>
                            \${senderBranch.email ? 'Email: ' + senderBranch.email : ''}
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 2rem; font-weight: 800; color: #111827; letter-spacing: -0.5px; margin-bottom: 5px;">FACTURA</div>
                        <div style="font-size: 1.1rem; color: #4B5563; font-weight: 600; margin-bottom: 15px;"># \${inv.invoiceId}</div>
                        <div style="background: #F3F4F6; padding: 10px 15px; border-radius: 6px; display: inline-block; text-align: right;">
                            <div style="font-size: 0.75rem; color: #6B7280; text-transform: uppercase; font-weight: 700; margin-bottom: 2px;">Fecha de Emisión</div>
                            <div style="font-weight: 600; color: #1F2937;">\${date}</div>
                        </div>
                    </div>
                </div>

                <!-- CLIENT INFO -->
                <div style="background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 8px; padding: 25px; margin-bottom: 40px;">
                    <div style="font-size: 0.8rem; color: #FF6600; text-transform: uppercase; font-weight: 800; letter-spacing: 0.5px; margin-bottom: 10px;">Facturar a:</div>
                    <div style="font-size: 1.1rem; font-weight: 700; color: #1F2937; margin-bottom: 4px;">\${inv.clientName}</div>
                    <div style="font-size: 0.95rem; color: #4B5563; margin-bottom: 4px;">CIF/NIF: <span style="font-weight: 600;">\${inv.clientCIF}</span></div>
                    <div style="font-size: 0.9rem; color: #6B7280;">Nº Cliente: \${inv.clientId}</div>
                </div>

                <!-- TABLE -->
                <table style="width: 100%; border-collapse: separate; border-spacing: 0; margin-bottom: 30px;">
                    <thead>
                        <tr>
                            <th style="background: #1F2937; color: white; padding: 12px 15px; text-align: left; font-size: 0.85rem; text-transform: uppercase; font-weight: 600; border-top-left-radius: 6px; border-bottom-left-radius: 6px;">Concepto / Descripción</th>
                            <th style="background: #1F2937; color: white; padding: 12px 15px; text-align: center; font-size: 0.85rem; text-transform: uppercase; font-weight: 600;">Cant.</th>
                            <th style="background: #1F2937; color: white; padding: 12px 15px; text-align: right; font-size: 0.85rem; text-transform: uppercase; font-weight: 600;">Precio Ud.</th>
                            <th style="background: #1F2937; color: white; padding: 12px 15px; text-align: right; font-size: 0.85rem; text-transform: uppercase; font-weight: 600; border-top-right-radius: 6px; border-bottom-right-radius: 6px;">Importe</th>
                        </tr>
                    </thead>
                    <tbody>
                        \${conceptHTML}
                    </tbody>
                </table>

                <!-- TOTALS -->
                <div style="display: flex; justify-content: flex-end; margin-bottom: 60px;">
                    <div style="width: 350px;">
                        <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #F3F4F6; color: #4B5563;">
                            <span>Base Imponible</span>
                            <span style="font-weight: 600;">\${inv.subtotal.toFixed(2)} €</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #F3F4F6; color: #4B5563;">
                            <span>IVA (\${inv.ivaRate}%)</span>
                            <span style="font-weight: 600;">\${inv.iva.toFixed(2)} €</span>
                        </div>
                        \${inv.irpf !== 0 ? \`<div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #F3F4F6; color: #4B5563;"><span>IRPF (-\${inv.irpfRate}%)</span><span style="font-weight: 600; color:#DC2626;">-\${Number(inv.irpf).toFixed(2)} €</span></div>\` : ''}
                        
                        <div style="display: flex; justify-content: space-between; padding: 15px 0; margin-top: 5px; font-size: 1.5rem; font-weight: 900; color: #1F2937; border-bottom: 3px solid #FF6600;">
                            <span>TOTAL</span>
                            <span>\${inv.total.toFixed(2)} €</span>
                        </div>
                    </div>
                </div>

                <!-- FOOTER -->
                <div style="position: absolute; bottom: 40px; left: 40px; right: 40px; border-top: 1px solid #E5E7EB; padding-top: 20px;">
                    <div style="display: flex; justify-content: space-between; align-items:flex-end;">
                        <div style="width: 60%;">
                            <div style="font-size: 0.8rem; color: #1F2937; font-weight: 700; margin-bottom: 5px;">MÉTODO DE PAGO Y CONDICIONES</div>
                            <div style="font-size: 0.85rem; color: #4B5563; background: #FFF7ED; border: 1px solid #FED7AA; padding: 12px; border-radius: 6px;">
                                <div style="color: #C2410C; font-size: 0.75rem; text-transform: uppercase; font-weight: 700; margin-bottom: 4px;">Transferencia Bancaria (IBAN)</div>
                                <div style="font-family: monospace; font-size: 1.1rem; font-weight: bold; color: #1F2937; letter-spacing: 1px;">\${senderBranch.bank || 'ESXX XXXX XXXX XXXX XXXX XXXX'}</div>
                            </div>
                        </div>
                        <div style="text-align: right; font-size: 0.7rem; color: #9CA3AF; width: 35%;">
                            Factura generada electrónicamente.<br>
                            \${senderBranch.legal || 'Documento de validez fiscal conforme a la normativa vigente.'}
                        </div>
                    </div>
                </div>
            </div>\`;
            }`;

const newContent = content.replace(regex, newHTML);

if (content === newContent) {
    console.log("No match found!");
    process.exit(1);
} else {
    fs.writeFileSync(file, newContent, 'utf8');
    console.log("Template injected successfully!");
}
