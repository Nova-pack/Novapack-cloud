import os
import re

path_ad = r'c:\NOVAPACK CLOUD\public\admin.html'

with open(path_ad, 'r', encoding='utf-8') as f:
    html = f.read()

# 1. EXTRACT VIEW-REPORTS (Listados)
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

# 2. EXTRACT VIEW-BILLING (Historial, Abonos, Fiscal)
start_billing = html.find('<div id="view-billing"')
end_billing = -1
if start_billing != -1:
    brace_count = 0
    in_div = False
    for i in range(start_billing, len(html)):
        if html[i:i+4] == '<div':
            brace_count += 1
            in_div = True
        elif html[i:i+6] == '</div>':
            brace_count -= 1
        
        if in_div and brace_count == 0:
            end_billing = i + 6
            break
billing_html = html[start_billing:end_billing] if end_billing != -1 else ""

# Only proceed if we found both blocks
if reports_html and billing_html:
    # Remove old blocks from DOM
    if start_reports > start_billing:
        html = html[:start_reports] + html[end_reports:]
        html = html[:start_billing] + html[end_billing:]
    else:
        html = html[:start_billing] + html[end_billing:]
        html = html[:start_reports] + html[end_reports:]

    # 3. TRANSFORM view-billing INTO adv-history-workspace (Dark Theme Adaptations)
    history_workspace = billing_html.replace('id="view-billing"', 'id="adv-history-workspace"')
    history_workspace = history_workspace.replace('class="view-content"', '')
    # Wrap in dark theme styling
    history_workspace = f'''
        <div id="adv-history-workspace" style="display:none; flex:1; overflow-y:auto; padding:20px; background:#1e1e1e; color:#d4d4d4;">
            <div class="header" style="border-bottom:1px solid #3c3c3c; padding-bottom:15px; margin-bottom:20px;">
                <h1 style="color:#fff; margin:0;">Historial, Abonos y Fiscal</h1>
                <p style="color:#aaa; font-size:0.85rem; margin-top:5px;">Consolidado de libros registro y metadatos operativos.</p>
            </div>
            {history_workspace[history_workspace.find('<!-- NEW TAB SYSTEM -->'):]}
    '''
    # Fix light mode artifacts in history
    history_workspace = history_workspace.replace('background:rgba(255,255,255,0.02)', 'background:rgba(255,255,255,0.05)')
    history_workspace = history_workspace.replace('class="card"', 'class="card" style="background:#252526; border-color:#3c3c3c; box-shadow:none;"')
    
    # 4. TRANSFORM view-reports INTO adv-reports-workspace
    rep_workspace = reports_html.replace('id="view-reports"', 'id="adv-reports-workspace"')
    rep_workspace = f'''
        <div id="adv-reports-workspace" style="display:none; flex:1; overflow-y:auto; padding:20px; background:#1e1e1e; color:#d4d4d4;">
            <div class="header" style="border-bottom:1px solid #3c3c3c; padding-bottom:15px; margin-bottom:20px;">
                <h1 style="color:#fff; margin:0;">Generación de Listados e Informes V4</h1>
                <p style="color:#aaa; font-size:0.85rem; margin-top:5px;">Motor unificado de listados globales para exportación y control logístico.</p>
            </div>
            {rep_workspace[rep_workspace.find('<div class="header">')+rep_workspace[rep_workspace.find('<div class="header">'):].find('</div>')+6:]}
    '''
    rep_workspace = rep_workspace.replace('class="card responsive-grid"', 'class="card responsive-grid" style="background:#252526; border-color:#3c3c3c; box-shadow:none;"')
    rep_workspace = rep_workspace.replace('class="card"', 'class="card" style="background:#252526; border-color:#3c3c3c; box-shadow:none;"')

    # 5. INJECT NEW WORKSPACES INTO VIEW-ADV-BILLING
    insert_point = html.find('</div> <!-- /adv-billing-workspace -->')
    if insert_point == -1:
        # fallback
        insert_point = html.find('<div id="adv-tariffs-workspace"')

    if insert_point != -1:
        html = html[:insert_point] + "\n" + history_workspace + "\n" + rep_workspace + "\n" + html[insert_point:]

    # 6. UPDATE PRO TOOLBAR BUTTONS
    toolbar_injection = """
                <button id="btn-adv-reports-toggle" style="background:transparent; border:1px solid transparent; color:#00CED1; padding:4px 10px; font-size:0.85rem; cursor:pointer;" onmouseover="this.style.background='rgba(255,255,255,0.2)'" onmouseout="this.style.background='transparent'" onclick="if(typeof window.toggleAdvWorkspace === 'function') window.toggleAdvWorkspace('reports')">📊 Listados V4</button>
                <div style="width:1px; height:20px; background:#fff; opacity:0.3; margin:0 5px;"></div>
    """
    
    old_search_btn = """<button id="btn-adv-search" style="background:transparent; border:1px solid transparent; color:white; padding:4px 10px; font-size:0.85rem; cursor:pointer;" onmouseover="this.style.background='rgba(255,255,255,0.2)'" onmouseout="this.style.background='transparent'" onclick="showView('billing'); document.getElementById('view-adv-billing').style.display='none';">🔍 Ver Historial</button>"""
    
    new_search_btn = """<button id="btn-adv-search" style="background:transparent; border:1px solid transparent; color:#fff; padding:4px 10px; font-size:0.85rem; cursor:pointer;" onmouseover="this.style.background='rgba(255,255,255,0.2)'" onmouseout="this.style.background='transparent'" onclick="if(typeof window.toggleAdvWorkspace === 'function') window.toggleAdvWorkspace('history')">🔍 Historial y Abonos</button>"""
    
    html = html.replace(old_search_btn, toolbar_injection + new_search_btn)

    # 7. ADD JS WORKSPACE CONTROLLER JS into the document
    js_controller = """
<script>
window.toggleAdvWorkspace = function(mode) {
    document.getElementById('adv-billing-workspace').style.display = 'none';
    if(document.getElementById('adv-tariffs-workspace')) document.getElementById('adv-tariffs-workspace').style.display = 'none';
    if(document.getElementById('adv-history-workspace')) document.getElementById('adv-history-workspace').style.display = 'none';
    if(document.getElementById('adv-reports-workspace')) document.getElementById('adv-reports-workspace').style.display = 'none';
    
    if (mode === 'builder') {
        document.getElementById('adv-billing-workspace').style.display = 'flex';
    } else if (mode === 'tariffs') {
        document.getElementById('adv-tariffs-workspace').style.display = 'flex';
    } else if (mode === 'history') {
        document.getElementById('adv-history-workspace').style.display = 'block';
    } else if (mode === 'reports') {
        document.getElementById('adv-reports-workspace').style.display = 'block';
    }
};

window.toggleAdvTariffs = function() {
    const w = document.getElementById('adv-tariffs-workspace');
    if (w && w.style.display !== 'none') {
        window.toggleAdvWorkspace('builder');
    } else {
        window.toggleAdvWorkspace('tariffs');
    }
};
</script>
"""
    if "window.toggleAdvWorkspace" not in html:
        html = html.replace('</body>', js_controller + '</body>')

    # 8. REMOVE LEGACY SIDEBAR NAV ITEMS
    # For Registros y Abonos
    billing_nav_match = re.search(r'<div class="nav-item" onclick="showView\(\'billing\'\).*?>.*?</div>', html, re.DOTALL)
    if billing_nav_match:
        html = html.replace(billing_nav_match.group(0), '')
        
    # For Informes de Ventas
    reports_nav_match = re.search(r'<div class="nav-item" onclick="showView\(\'reports\'\).*?>.*?</div>', html, re.DOTALL)
    if reports_nav_match:
        html = html.replace(reports_nav_match.group(0), '')

    # For Tarifas
    tariffs_nav_match = re.search(r'<div class="nav-item" onclick="showView\(\'tariffs\'\).*?>.*?</div>', html, re.DOTALL)
    if tariffs_nav_match:
        html = html.replace(tariffs_nav_match.group(0), '')

    with open(path_ad, 'w', encoding='utf-8') as f:
        f.write(html)
    print("PRO ERP Consolidation successful. Workspaces ported into View-Adv-Billing DOM.")
else:
    print("Error: Could not locate legacy containers (view-reports or view-billing).")
