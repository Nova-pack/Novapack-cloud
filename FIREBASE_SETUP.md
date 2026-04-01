# Configuración de NOVAPACK CLOUD en Firebase

Para que la aplicación funcione correctamente en tu servidor de Firebase, sigue estos pasos:

## 1. Crear el Proyecto en Firebase

1. Ve a [Firebase Console](https://console.firebase.google.com/).
2. Crea un nuevo proyecto llamado `NOVAPACK CLOUD`.
3. Activa **Authentication** (Habilita el método "Correo electrónico/contraseña").
4. Activa **Firestore Database**.
5. Activa **Hosting** para desplegar la app.

## 2. Configurar el Admin Único

Para que tú seas el admin único:

1. Regístrate en la app normalmente o crea un usuario en la consola de Firebase Auth.
2. Copia el **UID** de ese usuario desde la consola de Auth.
3. En Firestore, crea una colección llamada `config`.
4. Crea un documento dentro de `config` con el ID `admin`.
5. Añade un campo: `uid` (tipo string) con el valor de tu UID.

## 3. Reglas de Seguridad de Firestore

Copia y pega estas reglas en la pestaña "Rules" de tu base de datos Firestore para asegurar que cada cliente SOLO vea sus propios datos:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Función para verificar si es el admin global
    function isAdmin() {
      return get(/databases/$(database)/documents/config/admin).data.uid == request.auth.uid;
    }

    // El admin tiene acceso total a todo
    match /{document=**} {
      allow read, write: if request.auth != null && isAdmin();
    }

    // Reglas para Albaranes (Colección Global - Opción A)
    match /tickets/{ticketId} {
      allow read, update, delete: if request.auth != null && (resource.data.uid == request.auth.uid || isAdmin());
      allow create: if request.auth != null && (request.resource.data.uid == request.auth.uid || isAdmin());
    }

    // Reglas para Facturas (Colección Global - Opción A)
    match /invoices/{invoiceId} {
      allow read: if request.auth != null && (resource.data.clientId == request.auth.uid || isAdmin());
      allow write: if request.auth != null && isAdmin(); // Solo admin crea/borra facturas
    }

    // Reglas heredadas para perfiles de usuario
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && (request.auth.uid == userId || isAdmin());
    }
    
    match /config/{document=**} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && isAdmin();
    }

    match /tariffs/{document=**} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && isAdmin();
    }
  }
}
```

## 4. Archivo de Configuración

Edita el archivo `firebase-config.js` y pega tus credenciales (las obtienes en la Configuración del Proyecto -> "Tus apps" -> </> Web App).

## 5. despliegue

Ejecuta `firebase deploy` desde tu terminal para subir la aplicación a tu dominio de Firebase Hosting.

## 6. Configurar Dominio Personalizado (`novapaack.com`)

Dado que has solicitado instalar el dominio en **Firebase** y **GitHub**, a continuación encontrarás los pasos a seguir para cada plataforma e incorporar el dominio de manera segura.

### A) Configuración en Firebase Hosting (Recomendado)

Firebase alojará tu sitio de manera veloz con un certificado SSL (HTTPS) gratuito.

1. Abre tu proyecto en **Firebase Console**.
2. En el menú izquierdo, entra a **Hosting**.
3. Haz clic en el botón **Agregar dominio personalizado** (Add custom domain).
4. Introduce tu dominio: `novapaack.com` y haz clic en Continuar.
5. Firebase te proporcionará registros **TXT** o **A** (como las IP `199.36.158.100`, etc.).
6. Ve al panel de control de donde compraste tu dominio (GoDaddy, Namecheap, Hostinger, etc.) a la sección **Gestión de DNS**.
7. Añade los registros **A** y **TXT** que te haya dado Firebase.
8. Una vez guardados, espera algunas horas (hasta 24h) a que se propaguen. Firebase emitirá tu SSL automáticamente y tu app correrá en `https://novapaack.com`.

### B) Configuración en GitHub (Si usas GitHub Pages)

El archivo `CNAME` incluido en la raíz del proyecto ya facilita la integración.

1. Ve a tu repositorio en **GitHub** de NOVAPACK CLOUD.
2. Entra en **Settings** (Configuración) de tu repositorio.
3. En la barra lateral izquierda, selecciona **Pages** (Páginas).
4. Desplázate hasta **Custom domain** e introduce `novapaack.com`.
5. Dale a **Save**.
6. GitHub te solicitará crear registros **A** apuntando a sus IPs (como `185.199.108.153`...) en el lugar donde compraste tu dominio.
7. Una vez añadidos los registros DNS, marca la casilla **Enforce HTTPS** en GitHub Pages para ofrecer tráfico seguro.

*(Recuerda que los registros A (DNS) apuntarán a Firebase Hosting o GitHub Pages, por norma general **solo puedes optar por uno** para servir el contenido principal).*

---
**Nota sobre creación de usuarios:**
En esta versión, el admin registra al cliente en la base de datos Firestore. Para que el cliente pueda entrar con contraseña, debes crearlo manualmente en la pestaña de **Authentication** en la consola de Firebase con el mismo correo, o implementar una Firebase Cloud Function (opción recomendada para producción).
