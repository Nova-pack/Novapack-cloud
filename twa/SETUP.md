# TWA — Novapack Repartidor (Google Play)

## Requisitos previos
- Node.js 14+
- Java JDK 11+
- Android SDK (o Android Studio instalado)

## Paso 1: Instalar Bubblewrap CLI
```bash
npm install -g @nicolo-ribaudo/bubblewrap
```

## Paso 2: Inicializar el proyecto TWA
```bash
cd twa
bubblewrap init --manifest="https://novapaack.com/manifest-repartidor.json"
```
Bubblewrap preguntara por la configuracion. Los valores por defecto ya estan
en `twa-manifest.json`. Acepta los valores o ajusta segun necesites.

## Paso 3: Generar el keystore (solo la primera vez)
```bash
keytool -genkey -v -keystore android.keystore -alias novapack-repartidor -keyalg RSA -keysize 2048 -validity 10000
```
**IMPORTANTE:** Guarda la contrasena del keystore en un lugar seguro. La necesitaras para cada actualizacion.

## Paso 4: Obtener el SHA-256 fingerprint
```bash
keytool -list -v -keystore android.keystore -alias novapack-repartidor
```
Copia el valor `SHA256:` y reemplazalo en:
`public/.well-known/assetlinks.json` → campo `sha256_cert_fingerprints`

## Paso 5: Construir el APK
```bash
bubblewrap build
```
Esto genera `app-release-signed.apk` listo para subir a Google Play.

## Paso 6: Deploy del assetlinks.json
Despues de actualizar el fingerprint SHA-256:
```bash
firebase deploy --only hosting
```
Verifica que funciona: https://novapaack.com/.well-known/assetlinks.json

## Paso 7: Subir a Google Play Console
1. Ve a https://play.google.com/console
2. Crea una nueva aplicacion
3. Sube el APK firmado
4. Completa la ficha de la tienda (capturas, descripcion, etc.)
5. Envia a revision

## Pantallas multimedia de vehiculos
La PWA ya es compatible con proyeccion desde el movil:
- **Android Auto / MirrorLink**: El repartidor conecta el movil por USB/Bluetooth
- **Pantallas Android**: Abrir Chrome → novapaack.com/reparto.html → Instalar PWA
- El Wake Lock mantiene la pantalla activa durante el reparto

## Actualizaciones
Para actualizar la app en Play Store:
1. Incrementa `appVersionCode` y `appVersionName` en `twa-manifest.json`
2. Ejecuta `bubblewrap build`
3. Sube el nuevo APK a Play Console
