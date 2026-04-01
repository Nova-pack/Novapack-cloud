const fs = require('fs');
const file = 'c:\\NOVAPACK CLOUD\\public\\admin.html';
let content = fs.readFileSync(file, 'utf8');

const regex = /<!-- Mobile Header \(Visible <992px\) -->[\s\S]*?<!-- Control Tower View -->/;

const newSidebar = `<!-- Mobile Header (Visible <992px) -->
    <div class="mobile-header">
        <div class="logo" onclick="location.reload()"
            style="font-family: var(--font-logo); letter-spacing: 4px; font-size: 0.8rem;">
            NOVAPACK<span>➤</span>
        </div>
        <div style="flex: 1;"></div>
        <button class="btn btn-outline btn-sm" onclick="toggleSidebar()">☰ MENU</button>
    </div>

    <!-- Premium Sidebar Navigation -->
    <div class="sidebar" id="sidebar">
        <div class="sidebar-logo" onclick="location.reload()">
            NOVAPACK<span>➤</span>
        </div>

        <div class="nav-item" id="nav-item-alerts" onclick="showView('pending-deletes');" style="display:none; color:white; background:linear-gradient(135deg, #FF3B30, #FF6B00); box-shadow: 0 4px 15px rgba(255,59,48,0.4); font-weight:900; animation: pulse 2s infinite; margin: 0 15px 15px 15px; border:2px solid #FF3B30;">
            <span>🚨</span> <div id="alert-count-text">0 ANULACIONES</div>
        </div>

        <style>
            .accordion-btn {
                background: transparent;
                color: var(--text-dim);
                cursor: pointer;
                padding: 10px 15px;
                width: 100%;
                text-align: left;
                border: none;
                outline: none;
                transition: 0.3s;
                font-weight: 700;
                font-size: 0.85rem;
                display: flex;
                justify-content: space-between;
                align-items: center;
                text-transform: uppercase;
                margin-top: 5px;
            }
            .accordion-btn:hover {
                color: white;
            }
            .accordion-btn.active-acc {
                color: var(--brand-primary);
            }
            .accordion-btn.active-acc::after {
                content: '▲';
            }
            .accordion-btn::after {
                content: '▼';
                font-size: 0.7rem;
                color: #888;
            }
            .accordion-content {
                background: rgba(0,0,0,0.2);
                overflow: hidden;
                transition: max-height 0.3s ease-out;
                max-height: 0;
            }
            .accordion-content .nav-item {
                padding-left: 30px;
                font-size: 0.9rem;
            }
        </style>

        <div class="nav-group" id="accordion-menu" style="margin-bottom: 30px; overflow-y:auto; flex:1;">
            <button class="accordion-btn active-acc">Facturación y Ventas</button>
            <div class="accordion-content" style="max-height: 500px;">
                <div class="nav-item" onclick="showView('adv-billing'); if(typeof window.advPopulateClientPicker === 'function') window.advPopulateClientPicker();" style="color:#FFB300; border-left: 2px solid #FFB300; font-weight:bold;">
                    <span>⚡</span> FACTURACIÓN PRO
                </div>
                <div class="nav-item" onclick="showView('billing'); if(typeof switchBillingTab==='function') switchBillingTab('pending');">
                    <span>💶</span> Registro y Abonos
                </div>
                <div class="nav-item" onclick="showView('reports')">
                    <span>📊</span> Informes de Ventas
                </div>
            </div>

            <button class="accordion-btn">Clientes y Entregas</button>
            <div class="accordion-content">
                <div class="nav-item active" onclick="showView('users')">
                    <span>👥</span> Gestión Clientes
                </div>
                <div class="nav-item" onclick="showView('admin-tickets')">
                    <span>📝</span> Albaranes Manuales
                </div>
                <div class="nav-item" onclick="showView('tariffs')">
                    <span>💰</span> Tarifas
                </div>
            </div>

            <button class="accordion-btn">Rutas Rápidas</button>
            <div class="accordion-content">
                <div class="nav-item" onclick="showView('route-monitor')">
                    <span>📍</span> Control Rutas
                </div>
                <div class="nav-item" onclick="showView('phones')">
                    <span>🔔</span> Alertas Pickup
                </div>
                <div class="nav-item" onclick="window.adminScannerMode='deliver'; showView('qr-scanner-view')">
                    <span>📷</span> Escáner Cámara
                </div>
            </div>

            <button class="accordion-btn">Sistema Local</button>
            <div class="accordion-content">
                <div class="nav-item" onclick="showView('config')">
                    <span>⚙️</span> Ajustes App
                </div>
                <div class="nav-item" onclick="showView('tax-models')">
                    <span>🏛️</span> Impuestos
                </div>
                <div class="nav-item" onclick="showView('maintenance')">
                    <span>🛡️</span> DB Local
                </div>
            </div>
        </div>

        <script>
            document.addEventListener('DOMContentLoaded', () => {
                const acc = document.getElementsByClassName("accordion-btn");
                for (let i = 0; i < acc.length; i++) {
                    acc[i].addEventListener("click", function() {
                        this.classList.toggle("active-acc");
                        const panel = this.nextElementSibling;
                        if (panel.style.maxHeight) {
                            panel.style.maxHeight = null;
                        } else {
                            panel.style.maxHeight = panel.scrollHeight + "px";
                        } 
                    });
                }
            });
        </script>

        <div class="sidebar-footer">
            <div class="nav-item" style="color: #ff4444;" onclick="logout()">
                <span>🚪</span> CERRAR SESIÓN
            </div>
        </div>
    </div>

    <div class="main-content" id="main-content">
        <!-- Control Tower View -->`;

const newContent = content.replace(regex, newSidebar);
if (content === newContent) {
    console.log('No match found for replacement!');
    process.exit(1);
} else {
    fs.writeFileSync(file, newContent, 'utf8');
    console.log('Successfully restored and injected sidebar.');
}
