import re

# 1. firebase-app.js
path_fb = r'c:\NOVAPACK CLOUD\public\firebase-app.js'
with open(path_fb, 'r', encoding='utf-8') as f:
    js = f.read()

# Address agenda doc id: allow hyphens
js = js.replace("const norm = (s) => (s || \"\").toString().replace(/[^a-z0-9]/gi, '').toLowerCase();", "const norm = (s) => (s || \"\").toString().replace(/[^a-z0-9\-_]/gi, '').toLowerCase();")
js = js.replace("const docId = (t.receiver || \"\").replace(/[^a-z0-9]/gi, '_').toLowerCase();", "const docId = (t.receiver || \"\").replace(/[^a-z0-9\-_]/gi, '_').toLowerCase();")

# Client doc id: allow hyphens
js = js.replace("const docId = editingClientId || name.replace(/[^a-z0-9]/gi, '_').toLowerCase();", "const docId = editingClientId || name.replace(/[^a-z0-9\-_]/gi, '_').toLowerCase();")
js = js.replace("const docId = c.id || c.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();", "const docId = c.id || c.name.replace(/[^a-z0-9\-_]/gi, '_').toLowerCase();")

with open(path_fb, 'w', encoding='utf-8') as f:
    f.write(js)

# 2. admin.html
path_ad = r'c:\NOVAPACK CLOUD\public\admin.html'
with open(path_ad, 'r', encoding='utf-8') as f:
    html = f.read()

# Invoices client search regex: expand to allow hyphens and underscores
# old regex: replace(/[^\dA-Z]/g, '')
html = re.sub(
    r"let val = e\.target\.value\.toUpperCase\(\)\.replace\(/\[\^\\dA-Z\]/g, ''\);",
    r"let val = e.target.value.toUpperCase().replace(/[^\\dA-Z\\-_]/g, '');",
    html
)

# Exception for IBAN which we recently added
# Need to make sure IBAN still uses /[^\dA-Z]/g or we just let it be since it strips spaces to format them
old_iban_listen = r"val = e.target.value.toUpperCase().replace(/[^\\dA-Z\\-_]/g, '');\n                e.target.value = val.match(/.{1,4}/g)?.join(' ') || '';"
new_iban_listen = r"val = e.target.value.toUpperCase().replace(/[^\\dA-Z]/g, '');\n                e.target.value = val.match(/.{1,4}/g)?.join(' ') || '';"
html = html.replace(old_iban_listen, new_iban_listen)

with open(path_ad, 'w', encoding='utf-8') as f:
    f.write(html)

print("Regexes expanded to allow alphanumeric structures (- _).")
