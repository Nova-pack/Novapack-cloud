path = r'c:\NOVAPACK CLOUD\public\admin.html'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Fix 1: Line ~3446 area - sepaDate and billingCompanyId  
old1 = "const sepaDate = document.getElementById('new-user-sepa-date').value;\\n                    const billingCompanyId"
new1 = "const sepaDate = document.getElementById('new-user-sepa-date').value;\r\n                    const billingCompanyId"

# Fix 2: Line ~3589 area - iban and billing company  
old2 = "document.getElementById('new-user-iban').value = data.iban || '';\\n                if(document.getElementById('new-user-billing-company'))"
new2 = "document.getElementById('new-user-iban').value = data.iban || '';\r\n                if(document.getElementById('new-user-billing-company'))"

# Fix 3: Line ~4294 area - getNextUserId and billing company
old3 = "document.getElementById('new-user-id-num').value = getNextUserId();\\n                if(document.getElementById('new-user-billing-company'))"
new3 = "document.getElementById('new-user-id-num').value = getNextUserId();\r\n                if(document.getElementById('new-user-billing-company'))"

# Fix 4: Line ~8223 area - loadBillingCompanies
old4 = "});\\n            async function loadBillingCompanies()"
new4 = "});\r\n            async function loadBillingCompanies()"

fixes = [(old1, new1), (old2, new2), (old3, new3), (old4, new4)]

for i, (old, new) in enumerate(fixes):
    if old in content:
        content = content.replace(old, new)
        print(f"  Fix {i+1}: Applied")
    else:
        print(f"  Fix {i+1}: Pattern not found (already fixed)")

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

# Verify
with open(path, 'r', encoding='utf-8') as f:
    verify = f.read()

remaining = 0
for old, _ in fixes:
    if old in verify:
        remaining += 1
print(f"\nRemaining unfixed patterns: {remaining}")

# Count any remaining literal \n that look suspicious
import re
suspicious = re.findall(r";\\n\s+(const |let |if\(|document\.|async |window\.)", verify)
print(f"Remaining suspicious literal \\n sequences: {len(suspicious)}")
for s in suspicious:
    idx = verify.find(s)
    line = verify[:idx].count('\n') + 1
    print(f"  Line {line}: ...;\\n{s[:30]}...")
