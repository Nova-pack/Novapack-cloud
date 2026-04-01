const fs = require('fs');
const file = 'c:\\NOVAPACK CLOUD\\public\\admin.html';
let content = fs.readFileSync(file, 'utf8');

const regex = /<\/div>\s*<!-- \/adv-billing-workspace -->/;

const drawerInjection = `
            <!-- LATERAL DRAWER FOR CATALOGS -->
            <style>
            .adv-drawer {
                position: absolute;
                top: 0;
                right: -550px;
                width: 500px;
                height: 100%;
                background: #252526;
                border-left: 1px solid #3c3c3c;
                box-shadow: -5px 0 15px rgba(0,0,0,0.5);
                transition: right 0.3s ease-out;
                z-index: 10000;
                display: flex;
                flex-direction: column;
            }
            .adv-drawer.open {
                right: 0;
            }
            .adv-drawer-header {
                padding: 15px;
                background: #1e1e1e;
                border-bottom: 1px solid #3c3c3c;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .adv-drawer-body {
                flex: 1;
                overflow-y: auto;
                padding: 15px;
                font-size: 0.85rem;
            }
            .adv-drawer-item {
                background: #1e1e1e;
                border: 1px solid #3c3c3c;
                padding: 10px;
                margin-bottom: 10px;
                border-radius: 4px;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .adv-drawer-item:hover {
                border-color: #007acc;
            }
            </style>
            <div id="adv-catalog-drawer" class="adv-drawer">
                <div class="adv-drawer-header">
                    <h3 style="margin:0; color:#fff; font-size:1rem;" id="adv-drawer-title">Catálogo</h3>
                    <button onclick="document.getElementById('adv-catalog-drawer').classList.remove('open')" style="background:transparent; border:none; color:#aaa; cursor:pointer; font-size:1.2rem; outline:none;">✖</button>
                </div>
                <div class="adv-drawer-body">
                    <input type="text" id="adv-drawer-search" placeholder="🔍 Buscar..." style="width:100%; padding:8px; margin-bottom:15px; background:#333; border:1px solid #555; color:#fff; box-sizing:border-box; outline:none;" oninput="if(typeof window.advFilterDrawer === 'function') window.advFilterDrawer(this.value)">
                    <div id="adv-drawer-list">
                        <!-- Items populated via JS -->
                        <div style="text-align:center; color:#666; padding:20px;">Seleccione una opción de catálogo</div>
                    </div>
                </div>
            </div>
            </div> <!-- /adv-billing-workspace -->
`;

content = content.replace(regex, drawerInjection);

const toolbarRegex = /<!-- GRID TOOLBAR -->[\s\S]*?<!-- GRID AREA -->/;
const newToolbar = `<!-- GRID TOOLBAR -->
            <div style="background:#1e1e1e; padding:5px 15px; border-bottom:1px solid #3c3c3c; display:flex; gap:10px; align-items:center;">
                <button onclick="advOpenTicketImportModal()" style="background:#333; border:1px solid #555; color:#d4d4d4; padding:4px 10px; font-size:0.8rem; cursor:pointer;" onmouseover="this.style.background='#444'" onmouseout="this.style.background='#333'">📥 Importar Albaranes</button>
                <button onclick="advAddEmptyRow()" style="background:#333; border:1px solid #555; color:#d4d4d4; padding:4px 10px; font-size:0.8rem; cursor:pointer;" onmouseover="this.style.background='#444'" onmouseout="this.style.background='#333'">+ Añadir Concepto Libre</button>
                
                <div style="width:1px; height:20px; background:#fff; opacity:0.1; margin:0 5px;"></div>
                
                <button onclick="if(typeof window.advOpenDrawer==='function') window.advOpenDrawer('articles')" style="background:#094771; border:1px solid #007acc; color:#fff; padding:4px 10px; font-size:0.8rem; cursor:pointer;" onmouseover="this.style.background='#0a5a92'" onmouseout="this.style.background='#094771'">📦 Catálogo Master</button>
                <button onclick="if(typeof window.advOpenDrawer==='function') window.advOpenDrawer('tariffs')" style="background:#2E7D32; border:1px solid #4CAF50; color:#fff; padding:4px 10px; font-size:0.8rem; cursor:pointer;" onmouseover="this.style.background='#388E3C'" onmouseout="this.style.background='#2E7D32'">💰 Tarifas Cliente</button>
            </div>

            <!-- GRID AREA -->`;
            
content = content.replace(toolbarRegex, newToolbar);
fs.writeFileSync(file, content, 'utf8');
console.log('Successfully injected drawer UI.');
