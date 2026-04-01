import re

path = r'c:\NOVAPACK CLOUD\public\admin.html'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

targets = [
    'btn-search-reports',
    'btn-export-reports', 
    'btn-export-accounting',
    'btn-print-reports',
    'btn-import-gesco',
    'btn-generate-sepa',
    'btn-generate-invoice-view',
]

count = 0
for btn_id in targets:
    old = f"document.getElementById('{btn_id}').onclick"
    safe = f"if(document.getElementById('{btn_id}')) document.getElementById('{btn_id}').onclick"
    if old in content and safe not in content:
        content = content.replace(old, safe)
        count += 1
        print(f"  Fixed: {btn_id}")

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print(f"Wrapped {count} bindings with null-safety checks.")
