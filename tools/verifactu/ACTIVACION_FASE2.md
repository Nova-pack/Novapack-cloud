# VERIFACTU — Activación de la FASE 2 (envío a AEAT)

Todo el código está escrito y **desactivado** (gate `config/verifactu_envio.activo`).
Cuando lleguen los certificados, la activación son 4 pasos.

> ⚠️ **IMPORTANTE — hasta completar el Paso 1**: las funciones
> `verifactuSendPending` y `verifactuSendNow` declaran el secret
> `VERIFACTU_CERTS`; mientras ese secret no exista, un
> `firebase deploy --only functions` completo fallará en esas dos
> funciones (las demás se despliegan bien). Para deploys intermedios
> usar `--only hosting` o funciones por nombre. El secret se crea
> automáticamente la primera vez que se ejecuta el `secrets:set` del
> Paso 1.

## Requisitos previos
- Certificado electrónico **.pfx/.p12** de CADA empresa emisora (FNMT representante
  de persona jurídica) con su contraseña de exportación.
- Los NIF de las 3 empresas tal y como figuran en `billing_companies` (campo `nif`).

## Paso 1 — Subir los certificados al Secret Manager

```bash
cd "C:\NOVAPACK CLOUD\tools\verifactu"
node build_certs_json.js B11111111 ruta\empresa1.pfx clave1  B22222222 ruta\empresa2.pfx clave2  B33333333 ruta\empresa3.pfx clave3
firebase functions:secrets:set VERIFACTU_CERTS --project novapack-68f05 --data-file certs.json
del certs.json
```

Tras cambiar un secret hay que **redesplegar las funciones que lo usan**:

```bash
cd "C:\NOVAPACK CLOUD"
firebase deploy --only "functions:verifactuSendPending,functions:verifactuSendNow" --project novapack-68f05
```

## Paso 2 — Datos del productor del software (Firestore)

Crear/editar el doc `config/verifactu_sif` (Firebase Console → Firestore):

```
nombreRazonProductor: "<razón social de la empresa dueña del software>"
nifProductor:         "<su NIF>"
nombreSistema:        "NOVAPACK CLOUD"
idSistema:            "NP"
version:              "2.2"
numeroInstalacion:    "0001"
```

(Los mismos datos que la declaración responsable — DECLARACION_RESPONSABLE_VERIFACTU.docx)

## Paso 3 — Limpiar registros legacy (solo la primera vez)

Los registros sellados ANTES del despliegue multi-empresa (cadena global antigua,
si los hay del 15-07-2026 por la mañana) no deben enviarse. En Firestore, colección
`verifactu_registros`: los docs con `estadoEnvioAEAT == 'pendiente'` cuya
`huellaAnterior` pertenezca a otra empresa → cambiar a `'descartado_legacy'`.
(En la práctica: pedírselo a Claude, lo hace en un minuto.)

## Paso 4 — Activar en modo PRUEBAS y luego producción

Crear el doc `config/verifactu_envio`:

```
activo:  true
entorno: "pruebas"
```

- El scheduler `verifactuSendPending` corre cada 5 min. Para forzar una pasada
  inmediata: llamar a la función `verifactuSendNow` (o pedírselo a Claude).
- Comprobar en `verifactu_registros` que los docs pasan a `estadoEnvioAEAT:
  'enviado'` con su `envioCsv`. Errores → `'rechazado'` con `envioCodigoError`.
- Cuando pruebas funcione: cambiar `entorno: "produccion"`.

## Paso 5 — Al activar producción

1. En `public/verifactu.js` cambiar `window.VERIFACTU_SENDING = true`
   (añade la leyenda «VERI*FACTU» a las facturas) y desplegar hosting.
2. Firmar la declaración responsable (DECLARACION_RESPONSABLE_VERIFACTU.docx).

## Estados posibles de un registro

| estadoEnvioAEAT | Significado |
|---|---|
| `pendiente` | En cola, se enviará en la próxima pasada |
| `enviado` | Aceptado por AEAT (CSV en `envioCsv`) |
| `aceptado_con_errores` | Aceptado, revisar `envioDescripcionError` |
| `rechazado` | Rechazado, corregir y re-poner `pendiente` |
| `bloqueado_sin_nif_destinatario` | Falta NIF del cliente en su ficha → completarlo y re-poner `pendiente` |
| `descartado_legacy` | Registro pre-multi-empresa, no se envía |

## Endpoints AEAT usados

- Pruebas: `https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP`
- Producción: `https://www1.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP`
