# Configuración de GitHub y Dominio (Novapaack.com)

Sigue estos pasos detallados para que tu aplicación funcione en tu dominio propio.

## 1. Configuración en Namecheap (DNS)

Es muy probable que GitHub diga que está "mal configurado" si hay registros antiguos. Haz lo siguiente:

1. Entra en **Namecheap** -> **Domain List** -> **Manage** -> **Advanced DNS**.
2. **BORRA** cualquier registro que diga `parkingpage.namecheap.com`.
3. Añade estos **4 Registros A** (Host: `@`):
    - `185.199.108.153`
    - `185.199.109.153`
    - `185.199.110.153`
    - `185.199.111.153`
4. Añade estos **4 Registros AAAA** (IPv6 de GitHub):
    - `2606:50c0:8000::153`
    - `2606:50c0:8001::153`
    - `2606:50c0:8002::153`
    - `2606:50c0:8003::153`
5. Añade **1 Registro CNAME**:
    - **Host**: `www`
    - **Valor**: `TU_USUARIO.github.io` (Cambia `TU_USUARIO` por tu nombre de GitHub).

---

## 2. Configuración en GitHub

1. En tu repositorio (`novapack-cloud`), ve a **Settings** > **Pages**.
2. En **Custom domain**, escribe: `novapaack.com`.
3. Pulsa **Save**.
4. Espera 5-10 minutos. Cuando el chequeo DNS pase a verde, marca **Enforce HTTPS**.

---

## 3. Configuración en Firebase (Acceso)

Para que el login funcione desde el nuevo dominio:

1. Ve a [Firebase Console](https://console.firebase.google.com/).
2. **Authentication** > **Settings** > **Authorized domains**.
3. Añade estos dos:
    - `novapaack.com`
    - `www.novapaack.com`

---

## 4. Subir cambios desde tu PC

Como los botones de "Subir" no funcionan si no tienes Git instalado, usa estos comandos en tu terminal local:

```bash
git add .
git commit -m "Actualización: Diseño y Etiquetas 4x6"
git push origin main
```

> **Nota:** Si no tienes Git, instálalo desde [git-scm.com](https://git-scm.com/).
