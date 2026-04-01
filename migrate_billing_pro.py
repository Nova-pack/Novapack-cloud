import os
import re

path_ad = r'c:\NOVAPACK CLOUD\public\admin.html'

with open(path_ad, 'r', encoding='utf-8') as f:
    html = f.read()

# 1. EXTRACT ADV-TARIFFS-WORKSPACE
# We know it starts at <div id="adv-tariffs-workspace"...>
start_tariffs = html.find('<div id="adv-tariffs-workspace"')
# Find the end of this div using a simple brace counter
end_tariffs = -1
if start_tariffs != -1:
    brace_count = 0
    in_div = False
    for i in range(start_tariffs, len(html)):
        if html[i:i+4] == '<div':
            brace_count += 1
            in_div = True
        elif html[i:i+6] == '</div>':
            brace_count -= 1
        
        if in_div and brace_count == 0:
            end_tariffs = i + 6
            break

tariffs_html = html[start_tariffs:end_tariffs] if end_tariffs != -1 else ""

# 2. EXTRACT VIEW-REPORTS
start_reports = html.find('<div id="view-reports"')
end_reports = -1
if start_reports != -1:
    brace_count = 0
    in_div = False
    for i in range(start_reports, len(html)):
        if html[i:i+4] == '<div':
            brace_count += 1
            in_div = True
        elif html[i:i+6] == '</div>':
            brace_count -= 1
        
        if in_div and brace_count == 0:
            end_reports = i + 6
            break

reports_html = html[start_reports:end_reports] if end_reports != -1 else ""

if tariffs_html and reports_html:
    # Remove them from original positions (careful to remove from end to start to not mess up indices)
    if start_reports > start_tariffs:
        html = html[:start_reports] + html[end_reports:]
        html = html[:start_tariffs] + html[end_tariffs:]
    else:
        html = html[:start_tariffs] + html[end_tariffs:]
        html = html[:start_reports] + html[end_reports:]

    # Modify IDs to match new tab system
    tariffs_html = tariffs_html.replace('id="adv-tariffs-workspace"', 'id="billing-tab-tariffs"')
    tariffs_html = tariffs_html.replace('style="display:none; flex:1;', 'style="display:none; border-top: 1px solid rgba(255,255,255,0.1); margin-top:20px; padding-top:20px;')
    # Ensure it's not flex if we don't want it to break layout
    reports_html = reports_html.replace('id="view-reports"', 'id="billing-tab-reports"')
    reports_html = reports_html.replace('style="display:none"', 'style="display:none; border-top: 1px solid rgba(255,255,255,0.1); margin-top:20px; padding-top:20px;"')

    # 3. INSERT INTO VIEW-BILLING
    insert_point = html.find('</div>\n\n        <!-- Usuarios View -->')
    if insert_point == -1:
        insert_point = html.find('<!-- Usuarios View -->') - 10
    
    nuevo_contenido = f"\n{tariffs_html}\n{reports_html}\n"
    html = html[:insert_point] + nuevo_contenido + html[insert_point:]

# 4. UPDATE TAB CONTROLS in view-billing
old_tabs = """            <button class="btn btn-outline" id="tab-billing-credit" onclick="switchBillingTab('credit')" style="border-radius:20px; font-weight:800; white-space:nowrap;">📉 ABONOS (NC)</button>
            <button class="btn btn-outline" id="tab-billing-fiscal" onclick="switchBillingTab('fiscal')" style="border-radius:20px; font-weight:800; white-space:nowrap;">📊 PANEL FISCAL</button>
        </div>"""

new_tabs = """            <button class="btn btn-outline" id="tab-billing-credit" onclick="switchBillingTab('credit')" style="border-radius:20px; font-weight:800; white-space:nowrap;">📉 ABONOS (NC)</button>
            <button class="btn btn-outline" id="tab-billing-fiscal" onclick="switchBillingTab('fiscal')" style="border-radius:20px; font-weight:800; white-space:nowrap;">📊 PANEL FISCAL</button>
            <button class="btn btn-outline" id="tab-billing-tariffs" onclick="switchBillingTab('tariffs')" style="border-radius:20px; font-weight:800; white-space:nowrap;">🧮 TARIFAS Y ZONAS</button>
            <button class="btn btn-outline" id="tab-billing-reports" onclick="switchBillingTab('reports')" style="border-radius:20px; font-weight:800; white-space:nowrap;">🗂️ INFORMES V4</button>
        </div>"""

html = html.replace(old_tabs, new_tabs)

old_switch = """                document.getElementById('billing-tab-fiscal').style.display = 'none';"""
new_switch = """                document.getElementById('billing-tab-fiscal').style.display = 'none';
                if(document.getElementById('billing-tab-tariffs')) document.getElementById('billing-tab-tariffs').style.display = 'none';
                if(document.getElementById('billing-tab-reports')) document.getElementById('billing-tab-reports').style.display = 'none';"""

html = html.replace(old_switch, new_switch)

old_switch_btn = """                document.getElementById('tab-billing-fiscal').className = 'btn btn-outline';"""
new_switch_btn = """                document.getElementById('tab-billing-fiscal').className = 'btn btn-outline';
                if(document.getElementById('tab-billing-tariffs')) document.getElementById('tab-billing-tariffs').className = 'btn btn-outline';
                if(document.getElementById('tab-billing-reports')) document.getElementById('tab-billing-reports').className = 'btn btn-outline';"""

html = html.replace(old_switch_btn, new_switch_btn)

# 5. REMOVE OLD MENU ITEMS
old_menu_reports = """                <div class="nav-item" onclick="showView('reports')">
                    <span>📊</span> Informes de Ventas
                </div>"""
html = html.replace(old_menu_reports, "")

old_menu_tariffs = """                <div class="nav-item" onclick="showView('tariffs')">
                    <span>💰</span> Tarifas
                </div>"""
html = html.replace(old_menu_tariffs, "")

# 6. FIX ADV-BILLING
# The user asked to remove old menus. There is an "💶 Registro y Abonos" pointing to showView('billing') 
# and "⚡ FACTURACIÓN PRO" pointing to showView('adv-billing').
# We should combine them.
old_menu_billing = """                <div class="nav-item" onclick="showView('billing'); if(typeof switchBillingTab==='function') switchBillingTab('pending');">
                    <span>💶</span> Registro y Abonos
                </div>"""
html = html.replace(old_menu_billing, "")

with open(path_ad, 'w', encoding='utf-8') as f:
    f.write(html)

print("Migration of Tariffs and Reports to PRO Billing successfully authored in DOM.")
