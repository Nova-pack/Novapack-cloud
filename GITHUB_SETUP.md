# Configuración de GitHub y Dominio Personalizado

Para subir NOVAPACK a GitHub y usar tu dominio **Novapaack.com**, sigue estos pasos:

## 1. Preparación del Repositorio

Ya he creado los siguientes archivos necesarios:

- `.gitignore`: Para evitar subir archivos temporales o internos de Firebase.
- `CNAME`: Configurado con `novapaack.com` para que GitHub Pages reconozca tu dominio.

## 2. Subir el Código a GitHub

Como no puedo ejecutar comandos de Git directamente en este entorno local, sigue estos pasos en tu terminal (CMD o PowerShell):

1. **Inicializar Git**:

   ```bash
   git init
   ```

2. **Añadir los archivos**:

   ```bash
   git add .
   ```

3. **Primer commit**:

   ```bash
   git commit -m "Migración a GitHub y configuración de dominio"
   ```

4. **Subir a GitHub**:
   - Ve a [GitHub](https://github.com/new) y crea un repositorio nuevo llamado `novapack-cloud`.
   - Copia la URL del repositorio y ejecútalo en tu terminal:

   ```bash
   git remote add origin https://github.com/TU_USUARIO/novapack-cloud.git
   git branch -M main
   git push -u origin main
   ```

## 3. Configurar GitHub Pages

1. En tu repositorio de GitHub, ve a **Settings** > **Pages**.
2. En **Build and deployment**, asegúrate de que esté seleccionado "Deploy from a branch".
3. En **Branch**, selecciona `main` y `/ (root)`.
4. En **Custom domain**, debería aparecer `novapaack.com`. Si no, escríbelo y dale a "Save".
5. Activa **Enforce HTTPS**.

## 4. Configurar el Dominio (DNS)

Debes ir a tu proveedor de dominio (donde compraste Novapaack.com) y configurar estos registros:

### Registros A (Para apuntar a GitHub)

Añade estos 4 registros A si usas el dominio raíz (`novapaack.com`):

- `185.199.108.153`
- `185.199.109.153`
- `185.199.110.153`
- `185.199.111.153`

### Registro CNAME (Para <www.novapaack.com>)

- Nombre: `www`
- Valor: `TU_USUARIO.github.io` (sustituye TU_USUARIO por tu nombre en GitHub).

## 5. Firebase (Importante)

Para que los servicios (Login, Base de Datos) sigan funcionando desde el nuevo dominio:

1. Ve a [Firebase Console](https://console.firebase.google.com/).
2. Selecciona tu proyecto.
3. Ve a **Authentication** > **Settings** > **Authorized domains**.
4. Añade `novapaack.com` y `www.novapaack.com` a la lista de dominios autorizados.
