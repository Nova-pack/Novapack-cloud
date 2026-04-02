---
description: Guardar todo el trabajo en Git y desplegar a Firebase Hosting. Activar con /deploy o con la palabra clave "publicar".
---

# 🚀 Protocolo de Publicación — NOVAPACK CLOUD

Este workflow guarda todo el trabajo actual en Git (commit + push) y despliega a Firebase Hosting.
Se activa cuando el usuario dice **`/deploy`**, **`publicar`**, **`guardar todo`**, o **`subir cambios`**.

## Pasos

### 1. Verificar estado de Git
Comprobar qué archivos han sido modificados.
// turbo
```powershell
git -C "c:\NOVAPACK CLOUD" status --short
```

### 2. Añadir todos los cambios al staging
// turbo
```powershell
git -C "c:\NOVAPACK CLOUD" add -A
```

### 3. Crear commit con mensaje descriptivo
Generar un mensaje de commit que resuma los cambios realizados durante la sesión.
El formato del mensaje debe ser:
```
[FECHA] Resumen breve de los cambios

- Detalle 1
- Detalle 2
```
Donde FECHA es la fecha actual en formato YYYY-MM-DD.

```powershell
git -C "c:\NOVAPACK CLOUD" commit -m "<mensaje generado>"
```

### 4. Push a GitHub
Subir los cambios al repositorio remoto en la rama main.
```powershell
git -C "c:\NOVAPACK CLOUD" push origin main
```

### 5. Desplegar a Firebase Hosting
Desplegar la carpeta `public/` a Firebase Hosting.
```powershell
cd "c:\NOVAPACK CLOUD"; firebase deploy --only hosting
```

### 6. Confirmar al usuario
Informar al usuario con un resumen:
- ✅ Commit creado con hash `<hash>`
- ✅ Push a GitHub completado
- ✅ Firebase deploy completado
- 🌐 URL: https://novapack-68f05.web.app (o el dominio personalizado si aplica)

## Notas
- Si no hay cambios pendientes, informar al usuario y no hacer commit vacío.
- Si el push o deploy falla, mostrar el error y preguntar cómo proceder.
- El `.firebaserc` está en `.gitignore`, por lo que la config de Firebase no se sube a Git (tener en cuenta al configurar en otros terminales).
