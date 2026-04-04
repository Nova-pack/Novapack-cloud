# NOVAPACK CLOUD

Sistema de gestion logistica SaaS para empresas de transporte y paqueteria.
**Version:** 2.2 | **Stack:** Vanilla JS + Firebase | **URL:** https://novapaack.com

---

## Arquitectura

| Componente | Tecnologia |
|---|---|
| Frontend | HTML/CSS/JS vanilla (SPA) |
| Backend/DB | Firebase (Firestore, Auth, Hosting) |
| Email | IMAP (IONOS) + Nodemailer SMTP |
| Monitorizacion | Sentry |
| Impresion | Sistema propio con fuentes Xenotron/San Francisco |

### Estructura de archivos principales

```
public/
  index.html            - Login / landing page
  admin.html            - Panel de administracion (ERP completo)
  app.html              - Panel de cliente (crear albaranes)
  reparto.html          - App del repartidor (movil)
  erp_tabs.js           - Motor de pestanas ERP
  albaranes_central.js  - Gestion centralizada de albaranes
  facturas_central.js   - Gestion centralizada de facturas
  billing_adv_v4.js     - Motor de facturacion avanzada
  monthly_billing_flow.js - Flujo de facturacion mensual + SEPA
  debidos_manager.js    - Gestion de portes debidos
  ficha_cliente.js      - Ficha maestra de cliente
  mailbox_manager.js    - Buzon inteligente de emails
  comunicaciones.js     - Sistema de comunicaciones masivas
  nif_enrichment.js     - Enriquecimiento de NIF/CIF
  phantom-engine.js     - Motor de busqueda Gesco (PhantomDirectory)
  contabilidad.js       - Modulo contable
  export_engine.js      - Motor de exportacion
  phones_manager.js     - Gestion de telefonos
  sentry-config.js      - Configuracion Sentry
  firebase-config.js    - Configuracion Firebase
  reparto.js / .css     - App del repartidor
  gesco_clients.json    - Base de datos Gesco (1142 clientes con NIF)
  gesco_articles.json   - Articulos Gesco
  gesco_tarifas50.json  - Tarifas Gesco
```

### Colecciones Firestore

```
users/                  - Usuarios (admin, clientes, conductores)
  {uid}/destinations/   - Directorio de destinos del usuario
tickets/                - Albaranes activos
invoices/               - Facturas
deleted_tickets/        - Papelera de albaranes
deleted_invoices/       - Papelera de facturas
deleted_abonos/         - Papelera de abonos
deleted_erp_ids/        - Blacklist anti-duplicados
config/                 - Configuracion global (phones, etc.)
mailbox/                - Emails sincronizados via IMAP
```

---

## Historial de desarrollo

### Fase 1 — Fundamentos del ERP

**Ficha Maestra de Cliente**
- Sub-tabs: Principal, Economico, Albaranes, Facturacion
- Creacion automatica de empresa por defecto al dar de alta un cliente
- Display compacto con deteccion de tickets por email

**Albaranes Centralizado**
- Sub-tabs con paginacion, filtros avanzados y facturacion masiva
- Botones de editar e imprimir en tabla central
- Limpieza de botones redundantes

**Sincronizacion Contable**
- Fecha de vencimiento automatica (dueDate)
- Email admin preferente
- Alertas de facturas vencidas

---

### Fase 2 — Buzon Inteligente y Comunicaciones

**Buzon de Emails (IMAP/IONOS)**
- Sincronizacion IMAP de emails a Firestore
- Deteccion automatica de IDs de albaran en emails (9+ digitos, formatos variados)
- Vista completa del body, notas, preview, retry IMAP
- Recategorizacion con dropdown
- Archivado automatico de emails resueltos por categoria
- Operaciones masivas: checkboxes + archivar/resolver en lote
- Filtro de archivados (ocultos por defecto, visibles con filtro)
- Filtro anti-spam

**POD (Prueba de Entrega) por Email**
- Auto-respuesta al remitente con POD adjunto
- Envio via SMTP (Nodemailer)
- Template HTML personalizado
- Imagenes de firma integradas en albaranes central

**Comunicaciones Masivas**
- Sistema de campanas para clientes
- Envio segmentado

---

### Fase 3 — Facturacion y Contabilidad

**Centro de Facturacion**
- Panel centralizado con KPIs y filtro por empresa
- Notas de credito parciales (abonos)
- Editor de facturas con picker de cliente
- Workspace de facturacion avanzada (billing_adv_v4)

**Facturacion Mensual + SEPA**
- Flujo de facturacion mensual automatizado
- Generacion de remesas SEPA para domiciliaciones bancarias

**Numeracion de Albaranes/Facturas**
- Formato PREFIX-YY-SEQ (ej: NP-26-00142)
- Nombre de empresa dinamico en cabeceras (no hardcoded)

**NIF/CP Obligatorios**
- NIF y codigo postal requeridos para emitir
- Bloqueo de impresion si albaran en revision
- Correccion del campo NIF en facturacion (nif real vs idNum)

---

### Fase 4 — App del Repartidor (reparto.html)

**App Movil PWA**
- Service Worker para funcionamiento offline
- Canvas responsive para firma digital
- Registro SW robusto con UX hardening

**Escaner QR**
- Blindaje contra recreacion de tickets eliminados
- Deteccion de tickets entregados, eliminados y duplicados
- Firewall de tickets borrados

**Panel de Incidencias**
- Panel de incidencias del conductor
- Boton de resolver con z-index corregido para todos los estados
- Tarjeta de ruta con modal de detalles

**Reparto UI**
- Stat boxes tappables (reemplazan filter chips)
- Limpieza de jornada 8h
- Fix overflow en boton cancelar

---

### Fase 5 — Tarifas y Precios

**Tarifa Geografica Inteligente**
- Filtrado automatico por zona geografica

**Tarifa de Pesos**
- Sistema de tarifas basado en peso
- Recargo por peso como complemento a tarifas de articulo

**Subtarifa Especial**
- Precios exclusivos por cliente
- Pestana "Exclusivas" en modulo de Tarifas

---

### Fase 6 — Seguridad y Control de Acceso

**PIN de Acceso**
- PIN de 4 digitos por usuario para Facturacion Pro
- Gate de PIN movido a seleccion de identidad (antes de entrar al sistema)
- Fix de identidad: guardar nombre antes de cerrar modal

**PIN Maestro**
- Acceso admin al terminal del repartidor sin SMS
- Validacion via config/phones en Firestore (lectura publica)

**Audit Trail**
- Identificador oculto de operador en todas las escrituras a Firestore
- Trazabilidad completa de quien hizo que

**Condiciones Generales**
- Aceptacion obligatoria de condiciones generales
- Aviso en primer albaran del cliente

**Sentry**
- Monitorizacion de errores con Sentry DSN configurado

**Seguridad del Hosting**
- Headers: X-Content-Type-Options, X-Frame-Options, X-XSS-Protection
- Referrer-Policy, Permissions-Policy (camara self, micro off, geo self)
- Cache-Control no-cache en HTML/JS

---

### Fase 7 — Portes Debidos

**Gestion de Portes Debidos**
- Asignacion automatica por matching de NIF
- Toggle Pendientes/Asignados con boton Desasignar
- Fix busqueda en modal Asignar
- Movido a dropdown de Albaranes en ERP
- Fix del modal (movido a body level para evitar z-index)

---

### Fase 8 — Impresion

**Sistema de Impresion**
- Overhaul completo del sistema de impresion
- Fuente San Francisco en tarjetas
- Impresion admin con formato user
- Fuente Xenotron en contextos de ticket/etiqueta
- Evento afterprint en lugar de timeouts fijos
- Compresion PDF de facturas para clientes de tarifa plana

---

### Fase 9 — NOVA-IA

**Asistente Inteligente v2.0**
- Asistente con conocimiento completo del sistema
- Contexto de todas las funcionalidades de la app

---

### Fase 10 — Notificaciones y Flujos

**Inbox de Notificaciones**
- Eliminacion del flujo de aprobacion de tickets del cliente
- Nuevo buzon de notificaciones admin

**Recordatorio Diario**
- Deteccion de tickets duplicados/eliminados desde admin
- Recordatorio diario automatico al cliente

---

### Fase 11 — Enriquecimiento NIF/CIF

**Herramienta de Enriquecimiento**
- Doble pestana: Global (Cooper, ~5100 clientes) + Local (Firestore users)
- Auto-match con base Gesco (PhantomDirectory) por nombre normalizado
- Busqueda individual: primero Gesco local, luego Google como fallback
- Selector manual de usuario para directorio global
- Deteccion automatica del usuario Cooper por keywords + scan de subcollections
- Limpieza de nombres (S.L., S.A., S.C., C.B., prefijos X/NO-)
- Boton de acceso rapido en toolbar admin

---

### Fase 12 — Papelera (Recuperacion de Eliminados)

**Papelera de Albaranes, Facturas y Abonos**
- 3 sub-tabs: Albaranes / Facturas / Abonos
- Estadisticas por tipo y origen de eliminacion
- Busqueda y filtrado en cada pestana
- Restaurar: devuelve el documento a su coleccion original
  - Albaranes: restaura a `tickets`, elimina de blacklist, estado "Pendiente"
  - Facturas: restaura a `invoices`, re-vincula albaranes asociados
  - Abonos: restaura a `tickets` con tipo 'abono'
- Eliminar definitivo (con confirmacion)
- Vaciar papelera completa (doble confirmacion: escribir "VACIAR")
- Boton de acceso rapido (rojo) en toolbar admin

**Puntos de eliminacion que alimentan la papelera:**
- Aprobacion de solicitudes de anulacion del usuario
- Eliminacion desde monitor de rutas
- Eliminacion masiva de errores de importacion
- Eliminacion desde portes debidos
- Eliminacion de facturas desde listado
- Eliminacion de abonos desde notas de credito

---

## Despliegue

```bash
# Desde la raiz del proyecto
npx firebase deploy --only hosting --project novapack-68f05
```

El hosting se sirve desde `public/` con rewrite SPA a `index.html`.

---

## Datos importados

| Origen | Archivo/Coleccion | Registros | Contenido |
|---|---|---|---|
| Gesco | `gesco_clients.json` | ~1142 | Clientes con NIF |
| Gesco | `gesco_articles.json` | - | Catalogo de articulos |
| Gesco | `gesco_tarifas50.json` | - | Tarifas |
| Cooper | `users/{uid}/destinations/` | ~5100 | Clientes sin NIF (directorio global) |
| Excel | `CLIENTES COOPER/*.xlsx` | - | Importacion masiva via script |
