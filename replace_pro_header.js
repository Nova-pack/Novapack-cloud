const fs = require('fs');
const file = 'c:\\NOVAPACK CLOUD\\public\\admin.html';
let content = fs.readFileSync(file, 'utf8');

const regex = /<!-- HEADER PANEL -->[\s\S]*?<!-- GRID TOOLBAR -->/;

const newHeader = `<!-- HEADER PANEL -->
            <div style="background:#252526; border-bottom:1px solid #3c3c3c; padding:10px 15px; display:flex; gap:20px; font-size:0.85rem; align-items: flex-start; flex-wrap: wrap;">
                
                <!-- EMISORA (NUEVO) -->
                <div style="display:flex; flex-direction:column; gap:4px; width:220px;">
                    <label style="color:#9cdcfe; font-weight:bold; font-size:0.75rem; text-transform:uppercase;">Empresa Emisora (Sede)</label>
                    <select id="adv-company-picker" style="background:#3c3c3c; border:1px solid #555; color:#FFD700; font-weight:bold; padding:4px 8px; font-size:0.85rem; outline:none; cursor:pointer;" onchange="window.advCurrentCompany = this.value; if(typeof advCalculateTotals==='function') advCalculateTotals();">
                        <option value="main">Sede Principal (NOVAPACK)</option>
                        <!-- Se poblará vía JS si el admin tiene más filiales -->
                    </select>
                </div>

                <!-- CLIENTE RECEPTOR -->
                <div style="display:flex; flex-direction:column; gap:4px; width:300px;">
                    <label style="color:#9cdcfe; font-weight:bold; font-size:0.75rem; text-transform:uppercase;">Cód. Cliente / NIF</label>
                    <select id="adv-client-picker" onchange="advLoadClientDetails(this.value)" style="background:#3c3c3c; border:1px solid #555; color:#d4d4d4; padding:4px 8px; font-size:0.85rem; outline:none; cursor:pointer;">
                        <option value="">-- Seleccionar --</option>
                    </select>
                </div>

                <!-- TARJETA VISUAL DATOS CLIENTE (NUEVO) -->
                <div id="adv-client-card" style="flex:1; min-width: 250px; background: rgba(0,0,0,0.2); border: 1px dashed #555; border-radius: 4px; padding: 6px 12px; display:flex; align-items: center; color: #888; font-style: italic; min-height: 48px;">
                    Seleccione un cliente para ver sus datos fiscales.
                </div>

                <!-- DATOS FACTURA -->
                <div style="display:flex; gap:15px;">
                    <div style="display:flex; flex-direction:column; gap:4px; width:130px;">
                        <label style="color:#9cdcfe; font-weight:bold; font-size:0.75rem; text-transform:uppercase;">Nº Factura</label>
                        <input type="text" id="adv-inv-number" readonly placeholder="[Auto]" style="background:#333; border:1px solid #555; color:#aaa; padding:4px 8px; font-size:0.85rem; outline:none;">
                    </div>
                    <div style="display:flex; flex-direction:column; gap:4px; width:130px;">
                        <label style="color:#9cdcfe; font-weight:bold; font-size:0.75rem; text-transform:uppercase;">Fecha Emisión</label>
                        <input type="date" id="adv-inv-date" style="background:#3c3c3c; border:1px solid #555; color:#d4d4d4; padding:4px 8px; font-size:0.85rem; outline:none;">
                    </div>
                </div>
            </div>

            <!-- GRID TOOLBAR -->`;

const newContent = content.replace(regex, newHeader);
if (content === newContent) {
    console.log('No match found for replacement!');
    process.exit(1);
} else {
    fs.writeFileSync(file, newContent, 'utf8');
    console.log('Successfully injected PRO Billing Header.');
}
