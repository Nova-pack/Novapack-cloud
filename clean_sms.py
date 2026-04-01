import os

def clean_file(filepath, replacements):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    for old_text, new_text in replacements:
        if old_text in content:
            content = content.replace(old_text, new_text)
        else:
            print(f"Warning: Text not found in {filepath}:\n{old_text[:50]}...")
            
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

# admin.html replacements
admin_r = [
    (
        """            <div class="card">\n                <h3 class="section-title" style="margin-top:0;">Configuración de Comunicaciones</h3>\n                <div class="form-group">\n                    <label>Pasarela SMS Gateway URL (Usar {TELEFONO} y {MENSAJE})</label>\n                    <input type="text" id="conf-sms-gateway"\n                        placeholder="https://api.gateway.com/send?to={TELEFONO}&msg={MENSAJE}">\n                </div>\n                <div class="form-group">\n                    <label>Teléfono Global Alerta Recogidas (Pickup SMS)</label>\n                    <input type="text" id="conf-pickup-phone" placeholder="+34600000000">\n                </div>\n                <button class="btn btn-primary" id="btn-save-settings">💾 GUARDAR CONFIGURACIÓN</button>\n            </div>""", 
        ""
    ),
    (
        """                        const elSms = document.getElementById('conf-sms-gateway');\n                        const elPhone = document.getElementById('conf-pickup-phone');\n                        if (elSms) elSms.value = data.sms_gateway_url || '';\n                        if (elPhone) elPhone.value = data.pickup_alert_phone || '';""",
        ""
    ),
    (
        """            document.getElementById('btn-save-settings').onclick = async () => {\n                const smsURL = document.getElementById('conf-sms-gateway').value;\n                const pickupPhone = document.getElementById('conf-pickup-phone').value;\n                try {\n                    await db.collection('config').doc('settings').set({\n                        sms_gateway_url: smsURL,\n                        pickup_alert_phone: pickupPhone\n                    }, { merge: true });\n                } catch (e) { alert("Error al guardar."); }\n            };""",
        ""
    )
]

# firebase-app.js replacements
fb_r = [
    ("document.getElementById('action-sms-pickup').onclick = () => sendPickupSMS(t);", ""),
    ("document.getElementById('action-sms-pickup').style.display = 'inline-block';", ""),
    ("document.getElementById('action-sms-pickup').style.display = 'none';", ""),
    ("document.getElementById('comp-sms-gateway').value = c.smsGateway || '';", ""),
    ("document.getElementById('comp-sms-pickup').value = c.pickupAlertPhone || '';", ""),
    ("smsGateway: document.getElementById('comp-sms-gateway').value.trim(),", ""),
    ("pickupAlertPhone: document.getElementById('comp-sms-pickup').value.trim(),", ""),
    ("await checkAndSendAutoShiftSMS(data);", ""),
    ("await checkAndSendAutoShiftSMS(tData).catch(e => console.error(\"SMS Warning:\", e));", "")
]

print("Cleaning admin.html...")
clean_file('public/admin.html', admin_r)

print("Cleaning firebase-app.js...")
clean_file('public/firebase-app.js', fb_r)

# Removing functions by regex
import re
with open('public/firebase-app.js', 'r', encoding='utf-8') as f:
    fb_content = f.read()

# remove checkAndSendAutoShiftSMS
fb_content = re.sub(r'async function checkAndSendAutoShiftSMS\(.*?^}', '', fb_content, flags=re.MULTILINE|re.DOTALL)
# remove sendPickupSMS
fb_content = re.sub(r'async function sendPickupSMS\(.*?^}', '', fb_content, flags=re.MULTILINE|re.DOTALL)

with open('public/firebase-app.js', 'w', encoding='utf-8') as f:
    f.write(fb_content)

print("Finished SMS cleanup script.")
