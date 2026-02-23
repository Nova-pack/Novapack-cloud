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
      allow read, write: if request.auth != null && 
        exists(/databases/$(database)/documents/config/admin) &&
        get(/databases/$(database)/documents/config/admin).data.uid == request.auth.uid;
    }

    // Reglas para todos los usuarios (incluyendo Clientes)
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Permitir leer la config del admin para detectar el botón de administración
    match /config/admin {
      allow read: if request.auth != null;
    }

    // Permitir leer configuraciones globales si las hubiera
    match /config/settings {
      allow read: if request.auth != null;
    }

    // Permitir leer la lista de teléfonos predefinidos
    match /config/phones/list/{phoneId} {
      allow read: if request.auth != null;
    }
  }
}
```

## 4. Archivo de Configuración

Edita el archivo `firebase-config.js` y pega tus credenciales (las obtienes en la Configuración del Proyecto -> "Tus apps" -> </> Web App).

## 5. despliegue

Ejecuta `firebase deploy` desde tu terminal para subir la aplicación a tu dominio de Firebase Hosting.

---
**Nota sobre creación de usuarios:**
En esta versión, el admin registra al cliente en la base de datos Firestore. Para que el cliente pueda entrar con contraseña, debes crearlo manualmente en la pestaña de **Authentication** en la consola de Firebase con el mismo correo, o implementar una Firebase Cloud Function (opción recomendada para producción).
