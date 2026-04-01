import os
import re

path = r'c:\NOVAPACK CLOUD\public\admin.html'

with open(path, 'r', encoding='utf-8') as f:
    html = f.read()

# 1. Update Scanner matching logic
old_scanner_match = '''                            for (let opt of optionsList) {
                                if (opt.value.toUpperCase() === targetFilial || opt.text.toUpperCase().includes(targetFilial) || targetFilial.includes(opt.value.toUpperCase())) {
                                    matched = opt.value; 
                                    break;
                                }
                            }'''
new_scanner_match = '''                            for (let opt of optionsList) {
                                let optShortId = "";
                                if (window.billingCompaniesMap && window.billingCompaniesMap[opt.value]) {
                                    optShortId = window.billingCompaniesMap[opt.value].shortId || "";
                                }
                                if (opt.value.toUpperCase() === targetFilial || 
                                    opt.text.toUpperCase().includes(targetFilial) || 
                                    targetFilial.includes(opt.value.toUpperCase()) ||
                                    (optShortId && optShortId.toUpperCase() === targetFilial)) {
                                    matched = opt.value; 
                                    break;
                                }
                            }'''
if old_scanner_match in html:
    html = html.replace(old_scanner_match, new_scanner_match)


# 2. Update QR payload generation
old_qr_payload = '''                    n: (t.notes || '').substring(0, 50),
                    docId: docId
                };'''
new_qr_payload = '''                    n: (t.notes || '').substring(0, 50),
                    docId: docId,
                    f: window.billingCompaniesMap && window.billingCompaniesMap[t.billingEntityId] ? (window.billingCompaniesMap[t.billingEntityId].shortId || t.billingEntityId) : (t.billingEntityId || '')
                };'''
if old_qr_payload in html:
    html = html.replace(old_qr_payload, new_qr_payload)

with open(path, 'w', encoding='utf-8') as f:
    f.write(html)
print("QR parsing logic updated.")
