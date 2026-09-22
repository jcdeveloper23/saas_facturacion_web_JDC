# Plan Maestro — Facturación Electrónica SRI Ecuador
## SaasFacturacion · Angular 21 + Firebase Functions v2

**Versión:** 1.9  
**Última actualización:** 2026-08-22 — auditoría completa de firma XAdES-BES, causa raíz de "FIRMA INVALIDA", validadores estructurales y XSD real (ver §7)  
**Stack:** Angular 21 · CoreUI 5.x · Firebase (Firestore, Functions v2, Storage) · Node.js 20 · node-forge  
**Referencia normativa:** Ficha Técnica Comprobantes Electrónicos SRI v2.32 (oct-2025) · Resolución NAC-DGERCGC16-00000247 · WSDL SRI Ecuador

---

## Índice

1. [Estado actual](#1-estado-actual)
2. [Decisiones de arquitectura](#2-decisiones-de-arquitectura)
3. [Esquema de datos Firestore](#3-esquema-de-datos-firestore)
4. [Fases de implementación](#4-fases-de-implementación)
5. [Configurabilidad del XML desde DB](#5-configurabilidad-del-xml-desde-db)
6. [Flujo completo de emisión](#6-flujo-completo-de-emisión)
7. [Bugs corregidos](#7-bugs-corregidos)
8. [Pendientes no-SRI](#8-pendientes-no-sri)
9. [Referencia de archivos clave](#9-referencia-de-archivos-clave)
10. [Módulos de documentos electrónicos](#10-módulos-de-documentos-electrónicos)
11. [Bugs críticos — Ficha Técnica SRI v2.32](#11-bugs-críticos--ficha-técnica-sri-v232)
12. [Parámetros faltantes por configurar](#12-parámetros-faltantes-por-configurar)
13. [Plan de acción priorizado — Sprints pendientes](#13-plan-de-acción-priorizado--sprints-pendientes)

---

## 0. Resumen ejecutivo de avance

> Actualizado: 2026-04-10 (v1.8) — tras Sprints 1–4

### Avance global: **96 %** de la integración SRI operativa

| Dimensión | Estado | % |
|-----------|--------|---|
| Comprobantes electrónicos comunes (01, 04, 05, 07) | ✅ End-to-end completos | 100% |
| Comprobantes futuros (03, 06) | 🔴 Sprint 5 | 0% |
| Bugs críticos vs Ficha Técnica SRI v2.32 | ✅ Todos corregidos | 100% |
| Parametría configurable (sin redeploy) | ✅ Cubierta | 100% |
| Firma XAdES-BES unificada | ✅ Helper único con C14N | 100% |
| Password certificado .p12 | ⚠️ Texto plano en Firestore (Secret Manager pendiente) | 60% |
| Seguridad Firestore | ✅ Reglas específicas por colección | 100% |
| Tests unitarios | ✅ 27 tests pasando (módulo 11, totales, templates) | 100% |
| UX / alertas operacionales | ✅ Alerta vencimiento, badge SRI, Consumidor Final, spinner descarga | 100% |
| Descarga documentos | ✅ CF `downloadDocument` conectada en 3 módulos | 100% |
| Sustento tributario retenciones | ✅ `supportDocCodSust` con 13 opciones SRI | 100% |

### Comprobantes SRI implementados

| Comprobante | codDoc | XML | Firma | SOAP SRI | RIDE PDF | Email | Estado |
|-------------|--------|-----|-------|----------|----------|-------|--------|
| Factura | `01` | ✅ | ✅ | ✅ | ✅ | ✅ | **Producción** |
| Nota de Crédito | `04` | ✅ | ✅ | ✅ | ✅ | ✅ | **Producción** |
| Nota de Débito | `05` | ✅ | ✅ | ✅ | ✅ | ✅ | **Producción** |
| Retención | `07` | ✅ | ✅ | ✅ | ✅ | ✅ | **Producción** |
| Liquidación de compra | `03` | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | Sprint 5 |
| Guía de remisión | `06` | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | Sprint 5 |

### Pendientes antes de ir a producción real

| # | Pendiente | Criticidad | Estado |
|---|-----------|-----------|--------|
| P1 | **Secret Manager** para password del .p12 (actualmente texto plano en `company.sri.certPassword`) | 🔴 Alta | 🔴 Pendiente |
| P2 | **Tests unitarios** — 27 tests: módulo 11 (7), `calcInvoiceTotals` (10), `resolveTemplate` (10) | 🟠 Media | ✅ Completo |
| P3 | **`downloadDocument` en UI** — botones XML/PDF en las 3 listas llaman CF para URL fresca de 1h + spinner | 🟠 Media | ✅ Completo |
| P4 | **`supportDocCodSust`** — selector de tipo de sustento tributario SRI (13 opciones) en formulario de retenciones | 🟠 Media | ✅ Completo |
| P5 | **Multi-establecimiento** — los 4 generadores de XML ignoraban la serie y usaban siempre `company.sri.establishment`; una sola dirección de establecimiento. Ver §12.4 (2026-09-22) | 🔴 Alta (latente: hoy todas emiten con `001-001`) | ✅ Commiteado (`ac51a1e`, `066effa`, `fd52160`, `54b63ec`) — ✅ **reglas en producción y matrices sembradas** (2026-09-22) · ⏳ **functions sin desplegar** |
| P6 | ⚠️ **Un cajero puede reescribir `configuration/sri`** y un vendedor crear almacenes: `configuration` y `warehouses` dicen «solo admin», pero la regla por defecto `match /{collection}/{id}` las re-abre a `seller`/`cashier` (verificado en emulador, 2026-09-22). Arreglo: agregar `'warehouses'` y `'configuration'` a `isAdminGovernedCollection` | 🔴 Alta | ⏳ **Pendiente de decisión** — no aplicado, cambia colecciones en uso. Las reglas del 2026-09-22 **se desplegaron sin este arreglo** |

---

## 1. Estado actual

### ✅ Completado

| Ítem | Descripción | Archivos |
|------|-------------|---------|
| **Módulo facturas (UI)** | CRUD completo, líneas, cálculos, autoguardado, búsqueda productos/clientes | `invoice-form.component.*` |
| **Bug: track $index** | Eliminación de líneas correcta (track por referencia FormGroup) | `invoice-form.component.html:263` |
| **Bug: vatPct validators** | `Validators.required` reemplazado por `min(0)/max(100)` — permite IVA 0% | `invoice-form.component.ts:511` |
| **Bug: taxRate mapping** | `(p as any).vatPct` → `p.taxRate` en selectProduct/selectProductBySku | `invoice-form.component.ts:590,763` |
| **Modelo Company.sri extendido** | +7 campos: contribuyenteEspecial, microempresa, regimen, representanteLegal, certificatePath, certificateThumbprint, certificateSubject | `company.interface.ts` |
| **Modelo Invoice extendido** | SriDocumentStatus, accessKey, codigoNumerico, authorizationNumber, authorizedAt, sriError, xmlUrl, pdfUrl | `invoice.interface.ts` |
| **Modelo InvoiceLine extendido** | `sriTaxCode?: string` | `invoice.interface.ts` |
| **Settings UI: pestaña SRI** | Ambiente, establecimiento, punto emisión, régimen, tipo contribuyente, obligaciones, representante legal | `company-settings.component.*` |
| **Settings service SRI** | `getSriConfig()` / `saveSriConfig()` → leen/escriben `Company.sri` | `settings.service.ts` |
| **Badge SRI en lista** | Columna estado SRI (pending/authorized/rejected) en tabla de facturas | `invoices-list.component.*` |
| **CF: uploadCertificate** | Parse PKCS#12 con node-forge, validación RUC, upload Storage, update Firestore | `functions/src/invoices/upload-certificate.ts` |
| **Phase 1.4: Subir certificado UI** | Input .p12 + campo password + llamada `httpsCallable(uploadCertificate)` conectada | `company-settings.component.*` |
| **Phase 1.5: Estado certificado UI** | Badge "Configurado/Sin configurar", huella SHA1, fecha vencimiento (rojo si expirado) | `company-settings.component.html` |
| **Phase 2A–2D: Parametría XML** | `SriPlatformConfig` interface completa (Fichas Técnica SRI v2.32), seed-defaults, Settings empresa con campos XML + additionalInfoFields | `platform-defaults.interface.ts`, `platform-defaults.service.ts`, `seed-defaults.ts`, `company-settings.*` |
| **Phase 2B: Super-admin SRI Config UI** | 11 secciones: versiones, endpoints, general, doc types, taxTypeCodes (TABLA 16), IVA (TABLA 17), retenciones (TABLA 19), retención IVA (TABLA 20), formas de pago, identificaciones, ICE (TABLA 18) | `platform-sri-config.component.*` |
| **CF: generateInvoiceXml** | Construcción XML factura con xmlbuilder2, clave de acceso 49 dígitos (módulo 11), multi-tasa IVA | `functions/src/invoices/generate-invoice-xml.ts` |
| **CF: signXml** | Firma XAdES-BES con node-forge, carga .p12 de Storage | `functions/src/invoices/sign-xml.ts` |
| **CF: sendToSri** | SOAP recepción + autorización, manejo reintentos, actualiza sriStatus/authorizationNumber | `functions/src/invoices/send-to-sri.ts` |
| **CF: generatePdf** | RIDE con pdfkit + qrcode, todos los campos obligatorios RIDE | `functions/src/invoices/generate-pdf.ts` |
| **CF: onInvoiceEmit** | Trigger Firestore: draft→issued activa flujo completo XML→firma→SRI→PDF | `functions/src/invoices/on-invoice-emit.ts` |
| **Phase 8.1: Reenviar a SRI** | Botón en lista de facturas, visible si `sriStatus === 'rejected'`, llama CF `sendToSri` | `invoices-list.component.*` |
| **Phase 8.2: Descargar XML** | Botón `cilCloudDownload`, visible si `xmlUrl` existe, abre URL en nueva pestaña | `invoices-list.component.*` |
| **Phase 8.3: Descargar PDF/RIDE** | Botón `cilFile`, visible si `pdfUrl` existe, abre URL en nueva pestaña | `invoices-list.component.*` |
| **Fix P3: Validación cliente edición** | Guard `!selectedCustomer()` sin condicional `isNew()` — protege también borradores en edición | `invoice-form.component.ts:663` |
| **Fix P6: updatedBy en updates** | `InvoicesService.updateInvoice` incluye `updatedBy: userId` + campo `Invoice.updatedBy?` | `invoices.service.ts`, `invoice.interface.ts` |
| **Módulo Retenciones (UI)** | CRUD completo: lista con filtros, badge SRI, formulario con búsqueda proveedor, doc sustento, FormArray impuestos IR+IVA con recálculo automático | `retentions/` |
| **Módulo Notas de Débito (UI)** | CRUD completo: lista con filtros, badge SRI, formulario con búsqueda cliente, referencia factura original, FormArray motivos, totales en tiempo real | `debit-notes/` |
| **CF: generateRetentionXml** | XML `comprobanteRetencion` (codDoc=`07`), clave 49 dígitos, bloque `<impuestos>` + `<docsSustento>` | `functions/src/retentions/generate-retention-xml.ts` |
| **CF: onRetentionEmit** | Trigger draft→issued: XML → firma XAdES-BES → SOAP SRI recepción+autorización | `functions/src/retentions/on-retention-emit.ts` |
| **CF: generateDebitNoteXml** | XML `notaDebito` (codDoc=`05`), clave 49 dígitos, `<motivos>` + `totalConImpuestos` | `functions/src/debit-notes/generate-debit-note-xml.ts` |
| **CF: onDebitNoteEmit** | Trigger draft→issued: XML → firma XAdES-BES → SOAP SRI recepción+autorización | `functions/src/debit-notes/on-debit-note-emit.ts` |
| **CF: sendToSri unificado** | Callable que acepta `documentType: 'invoice' \| 'retention' \| 'debitNote'` — maneja los 3 tipos con `DOC_TYPE_CONFIGS` map; retro-compatible con `invoiceId` | `functions/src/invoices/send-to-sri.ts` |
| **CF: generateRetentionPdf** | RIDE retención con pdfkit + QRCode — agente retenedor, proveedor, doc sustento, tabla impuestos (IR+IVA), total retenido; Storage `pdf/ret-{id}.pdf` | `functions/src/retentions/generate-retention-pdf.ts` |
| **CF: generateDebitNotePdf** | RIDE nota de débito con pdfkit + QRCode (acento ámbar `#c47a1a`) — comprobante modificado, cliente, tabla motivos, totales IVA; Storage `pdf/dn-{id}.pdf` | `functions/src/debit-notes/generate-debit-note-pdf.ts` |
| **CF: sendRetentionEmail** | Email HTML al proveedor tras autorización SRI — busca email en `personas/{supplierId}`, fallback a `retention.supplierEmail`; tabla retención + links PDF/XML | `functions/src/retentions/send-retention-email.ts` |
| **CF: onRetentionEmit post-auth** | Tras autorización SRI dispara en paralelo: `generateRetentionPdfInternal` → `sendRetentionEmailInternal` (no bloqueante) | `functions/src/retentions/on-retention-emit.ts` |
| **UI: Botón PDF retenciones** | Botón "Generar PDF/RIDE" visible si `sriStatus=authorized && !pdfUrl`; botón "Descargar PDF" si `pdfUrl` existe | `retentions-list.component.ts` |
| **UI: Botón PDF notas débito** | Mismo patrón que retenciones | `debit-notes-list.component.ts` |
| **Módulos sistema plugins** | `debitNotes` + `retentions` añadidos a `MODULES_SEED` (orden 18/19) — sincronizables desde `/super-admin/catalog` | `src/app/core/seed/modules-seed.ts` |
| **DocumentSeries tipos ampliados** | Union type expandido: `'invoice' \| 'creditNote' \| 'debitNote' \| 'retention' \| 'quote' \| 'order' \| 'remission'` | `settings.interfaces.ts` |
| **Seed defaults: series ND + Ret** | `platform-defaults.service.ts` + `setup-company.ts` incluyen series para `debitNote` y `retention` | `platform-defaults.service.ts`, `setup-company.ts` |
| **Fix: router protected** | `private router` → `protected router` en `DebitNoteFormComponent` y `RetentionFormComponent` para acceso desde template | `debit-note-form.ts`, `retention-form.ts` |
| **Fix: Timestamp.toDate()** | `r.date \| date:'...'` → `r.date.toDate() \| date:'...'` en ambas listas | `retentions-list.ts`, `debit-notes-list.ts` |
| **CF: sendDebitNoteEmail** | Email HTML al cliente tras autorización SRI de N/D — busca email en `personas/{customerId}`, fallback `debitNote.customerEmail`; tabla comprobante + motivos + links PDF/XML | `functions/src/debit-notes/send-debit-note-email.ts` |
| **CF: onDebitNoteEmit post-auth** | Tras autorización SRI dispara en paralelo: `generateDebitNotePdfInternal` → `sendDebitNoteEmailInternal` | `functions/src/debit-notes/on-debit-note-emit.ts` |
| **CF: checkSriStatus multi-tipo** | Callable unificado para `invoice \| retention \| debitNote` — acepta `documentType` + `documentId`; retro-compatible con `invoiceId` | `functions/src/invoices/check-sri-status.ts` |
| **SMTP administrable — UI** | Página super-admin `Config SMTP` (`/super-admin/defaults/smtp-config`) — form host/port/secure/user/pass/from/isActive; guarda en Firestore `platform/defaults/smtpConfig/data` | `platform-smtp-config.component.ts` |
| **SMTP administrable — helper CF** | `smtp-helper.ts`: lee Firestore primero (cache 5 min), fallback a env vars; exporta `createSmtpTransporter()` + `getSmtpFrom()` | `functions/src/utils/smtp-helper.ts` |
| **SMTP administrable — CFs** | `send-invoice-email`, `send-retention-email`, `send-debit-note-email` usan el helper (sin código SMTP duplicado) | 3 archivos de email |
| **SmtpPlatformConfig interface** | Nueva interfaz en `platform-defaults.interface.ts` con todos los campos SMTP | `platform-defaults.interface.ts` |
| **PlatformDefaultsService SMTP** | `getSmtpConfig()` + `saveSmtpConfig()` → `platform/defaults/smtpConfig/data` | `platform-defaults.service.ts` |

### ✅ Fases 8 + 9 + 10 + 11 (Post-autorización + Módulos + SMTP administrable) completas

---

## 2. Decisiones de arquitectura

### 2.1 Separación de responsabilidades del XML

| Capa | Qué contiene | Dónde vive | Quién cambia |
|------|-------------|-----------|-------------|
| **Estructura XML** | Elementos, atributos, orden (definido por XSD SRI) | Hardcoded en CF | Solo si SRI cambia resolución legal |
| **Parámetros técnicos** | URLs WSDL, versiones schema, códigos de documento, tabla IVA SRI | `/platform/defaults/sriConfig` | Super-admin (sin redeploy) |
| **Datos fiscales empresa** | RUC, razón social, establecimiento, régimen | `/companies/{id}` (Company.sri) | Admin empresa |
| **Datos XML empresa** | Dirección exacta XML, teléfono, correo, additionalInfoFields | `/companies/{id}/configuration/sri` | Admin empresa |
| **Datos de la factura** | Cliente, líneas, totales, formas de pago | `/companies/{id}/invoices/{id}` | Sistema |

### 2.2 additionalInfoFields

El SRI permite un bloque `<infoAdicional>` libre al final del XML. Se configura en DB como array key-value con soporte de **templates dinámicos**:

```
{ nombre: 'Email cliente',   valor: '${customer.email}' }
{ nombre: 'Orden de Compra', valor: '${invoice.customerReference}' }
{ nombre: 'Vendedor',        valor: '${invoice.agentCode}' }
{ nombre: 'Dirección',       valor: '${customer.address}' }
```

La CF resuelve los templates en tiempo de generación. Variables disponibles:
- `${invoice.*}` — cualquier campo del documento Invoice
- `${customer.*}` — snapshot del cliente en la factura
- `${company.*}` — datos de la empresa

### 2.3 Estrategia de certificado

- **Archivo .p12** → Cloud Storage: `companies/{companyId}/certificates/signing.p12` (bucket privado)
- **Password** → NO se almacena en Firestore. Se recibe en cada llamada a la CF de firma como parámetro, o se guarda en **Google Secret Manager** con nombre `cert-password-{companyId}` (decisión pendiente — ver sección 4, Fase 4)
- **Metadatos** (path, thumbprint, subject, expiry) → `Company.sri.*` en Firestore

### 2.4 Ambiente de pruebas primero

Toda la implementación se desarrolla y prueba en ambiente `testing` del SRI. El cambio a `production` es solo un campo en `Company.sri.environment` — sin cambio de código.

---

## 3. Esquema de datos Firestore

### 3.1 `/platform/defaults/sriConfig` (documento único, super-admin)

```typescript
interface SriPlatformConfig {
  // Versiones de schema XML por tipo de comprobante
  facturaVersion:      string;   // '1.0.0'
  notaCreditoVersion:  string;   // '1.0.0'
  notaDebitoVersion:   string;   // '1.0.0'

  // Endpoints WSDL del SRI
  endpoints: {
    testing: {
      receptionUrl:     string;  // URL recepción (ambiente pruebas)
      authorizationUrl: string;  // URL autorización (ambiente pruebas)
    };
    production: {
      receptionUrl:     string;
      authorizationUrl: string;
    };
  };

  // Códigos de tipo de comprobante SRI
  documentTypeCodes: {
    invoice:     string;  // '01'
    creditNote:  string;  // '04'
    debitNote:   string;  // '05'
    remission:   string;  // '06'
    retention:   string;  // '07'
  };

  // Tabla de tasas IVA SRI (código SRI ↔ porcentaje)
  taxCodes: Array<{
    vatPct:    number;   // 0, 5, 15
    sriCode:   string;   // '2'=0%, '3'=15%, '5'=5%, '6'=Exento
    name:      string;
    isExempt?: boolean;  // true si es código 6 (exento, no gravado)
  }>;

  // Formas de pago SRI (actualizables sin redeploy)
  paymentMethodCodes: Array<{
    code: string;
    name: string;
  }>;

  updatedAt: Timestamp;
  updatedBy: string;
}
```

**URLs actuales SRI Ecuador:**
```
testing.receptionUrl:     https://celcer.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline?wsdl
testing.authorizationUrl: https://celcer.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline?wsdl
production.receptionUrl:     https://cel.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline?wsdl
production.authorizationUrl: https://cel.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline?wsdl
```

---

### 3.2 `/companies/{id}/configuration/sri` (por empresa)

```typescript
interface SriCompanyConfig {
  // Datos tal como deben aparecer en el XML (pueden diferir de configuration/general)
  razonSocial:              string;   // Razón social exacta registrada en SRI
  nombreComercial?:         string;   // Nombre comercial (opcional en XML)
  direccionMatriz:          string;   // Dirección de la matriz (XML campo fijo)
  direccionEstablecimiento: string;   // Respaldo: desde 2026-09-22 la dirección sale de
                                      // establishments/{código}.address (ver §12.4)
  telefono?:                string;
  correo?:                  string;

  // Flags contribuyente para XML
  obligadoContabilidad: 'SI' | 'NO';
  contribuyenteEspecial: string;      // número resolución o '' si no aplica

  // Campos adicionales libres — bloque <infoAdicional> del XML
  // Soportan templates: ${invoice.field}, ${customer.field}, ${company.field}
  additionalInfoFields: Array<{
    nombre: string;   // nombre del campo en el XML
    valor:  string;   // valor fijo o template
  }>;

  updatedAt: Timestamp;
  updatedBy: string;
}
```

---

### 3.3 Campos SRI en `/companies/{id}/invoices/{id}` (ya extendido)

```typescript
// Añadidos en Fase 0.2 a Invoice interface:
sriStatus?:           SriDocumentStatus;  // 'pending' | 'authorized' | 'rejected' | 'not_required'
accessKey?:           string;             // clave de acceso 49 dígitos
codigoNumerico?:      string;             // 8 dígitos aleatorios (parte del accessKey)
authorizationNumber?: string;             // número de autorización SRI
authorizedAt?:        Timestamp;
sriError?:            string;             // mensaje si sriStatus === 'rejected'
xmlUrl?:              string;             // Cloud Storage URL del XML firmado
pdfUrl?:              string;             // Cloud Storage URL del PDF (RIDE)

// En InvoiceLine (Fase 0.3):
sriTaxCode?: string;                      // '2' | '3' | '5' | '6' — código SRI de la tasa
```

---

## 4. Fases de implementación

### ✅ FASE 0 — Modelos y UI SRI *(COMPLETADO)*

**Objetivo:** Extender modelos y UI para tener todos los datos antes de implementar lógica.

| Sub-tarea | Estado | Archivos |
|-----------|--------|---------|
| 0.1 Extender Company.sri | ✅ | `company.interface.ts`, `setup-company.ts` |
| 0.2 Extender Invoice interface | ✅ | `invoice.interface.ts` |
| 0.3 Extender InvoiceLine (sriTaxCode) | ✅ | `invoice.interface.ts` |
| 0.4 Settings UI: pestaña SRI | ✅ | `company-settings.component.*`, `settings.service.ts` |
| 0.5 Badge SRI en lista de facturas | ✅ | `invoices-list.component.*` |

---

### ✅ FASE 1 — Cloud Function: Certificado *(COMPLETADO)*

**Objetivo:** Subir y validar el certificado .p12 de firma digital.

| Sub-tarea | Estado | Archivos |
|-----------|--------|---------|
| 1.1 CF uploadCertificate | ✅ | `functions/src/invoices/upload-certificate.ts` |
| 1.2 Añadir node-forge | ✅ | `functions/package.json` |
| 1.3 Exportar en index.ts | ✅ | `functions/src/index.ts` |
| 1.4 Conectar botón "Subir Certificado" en settings UI | ✅ | `company-settings.component.ts` — `uploadCertificate()`, input password, `httpsCallable` |
| 1.5 Estado real del certificado en UI | ✅ | `company-settings.component.html` — badge, thumbprint, vencimiento dinámico |

---

### ✅ FASE 2 — Parametría XML en DB *(COMPLETADO)*

**Objetivo:** Crear la infraestructura de datos configurable antes de generar XML.

| Sub-tarea | Estado | Archivos |
|-----------|--------|---------|
| 2A Interfaces y modelos | ✅ | `platform-defaults.interface.ts` (SriPlatformConfig completa Ficha Técnica v2.32) |
| 2B Seed platform defaults | ✅ | `seed-defaults.ts`, `platform-defaults.service.ts` |
| 2C Super-admin UI SRI Config | ✅ | `platform-sri-config.component.*` (11 secciones: TABLAS 16–20, ICE, endpoints, etc.) |
| 2D Settings empresa UI: datos XML | ✅ | `company-settings.component.*` (razonSocial, direcciones, additionalInfoFields) |

**Nota:** `SriPlatformConfig` actualizada con Ficha Técnica SRI v2.32 — incluye TABLAS 2, 4, 6, 16, 17, 18, 19, 20, URLs consulta WS, Consumidor Final (`9999999999999`), códigos tipo impuesto XML.

---

### FASE 3 — Cloud Function: Generación XML

**Objetivo:** Construir el XML de factura según el esquema SRI a partir de los datos de Firestore.

**Dependencias:** Fase 2 completada (necesita leer sriConfig de platform + empresa)

#### Función: `generateInvoiceXml(invoiceId: string, companyId: string)`

```
Flujo:
1. Lee Invoice desde Firestore
2. Lee /platform/defaults/sriConfig (versión, códigos)
3. Lee /companies/{id} (Company.sri: RUC, ambiente, establecimiento)
4. Lee /companies/{id}/configuration/sri (razonSocial, direcciones, additionalInfoFields)
5. Genera codigoNumerico (8 dígitos aleatorios si no existe)
6. Calcula clave de acceso 49 dígitos (algoritmo módulo 11)
7. Construye XML con xmlbuilder2
8. Valida XML (estructura mínima)
9. Guarda XML sin firma en Storage: companies/{id}/xml/{invoiceId}.xml
10. Actualiza Invoice: codigoNumerico, accessKey, sriStatus = 'xml_generated'
```

#### Algoritmo clave de acceso (49 dígitos)

```
fecha (8)        ddMMaaaa
tipoComprobante (2)  '01' = factura
ruc (13)
ambiente (1)     '1'=pruebas, '2'=producción
serie (6)        establecimiento(3) + puntoEmision(3)
secuencial (9)   número de factura con padding
codigoNumerico (8)  aleatorio único por factura
tipoEmision (1)  '1' = emisión normal
─────────────────────────────────────────────────
48 dígitos + 1 dígito verificador (módulo 11)
```

```typescript
function calcularDigitoVerificador(clave48: string): number {
  const factores = [2, 3, 4, 5, 6, 7];
  let suma = 0;
  for (let i = clave48.length - 1, f = 0; i >= 0; i--, f++) {
    suma += parseInt(clave48[i]) * factores[f % 6];
  }
  const residuo = suma % 11;
  if (residuo === 0) return 0;
  if (residuo === 1) return 1;
  return 11 - residuo;
}
```

#### Estructura XML factura (esquema SRI resolución NAC-DGERCGC16-00000247)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<factura id="comprobante" version="1.0.0">
  <infoTributaria>
    <ambiente>1</ambiente>                    <!-- 1=pruebas, 2=producción -->
    <tipoEmision>1</tipoEmision>              <!-- 1=normal -->
    <razonSocial>EMPRESA S.A.</razonSocial>
    <nombreComercial>MARCA</nombreComercial>
    <ruc>1700000000001</ruc>
    <claveAcceso>4904202601170...</claveAcceso>   <!-- 49 dígitos -->
    <codDoc>01</codDoc>
    <estab>001</estab>
    <ptoEmi>001</ptoEmi>
    <secuencial>000000001</secuencial>
    <dirMatriz>Av. Ejemplo 123</dirMatriz>
  </infoTributaria>

  <infoFactura>
    <fechaEmision>09/04/2026</fechaEmision>
    <dirEstablecimiento>Av. Ejemplo 123</dirEstablecimiento>
    <contribuyenteEspecial/>                  <!-- vacío si no aplica -->
    <obligadoContabilidad>SI</obligadoContabilidad>
    <tipoIdentificacionComprador>04</tipoIdentificacionComprador>  <!-- 04=RUC, 05=CI -->
    <razonSocialComprador>CLIENTE S.A.</razonSocialComprador>
    <identificacionComprador>0900000000001</identificacionComprador>
    <totalSinImpuestos>100.00</totalSinImpuestos>
    <totalDescuento>0.00</totalDescuento>
    <totalConImpuestos>
      <totalImpuesto>
        <codigo>2</codigo>                    <!-- 2=IVA -->
        <codigoPorcentaje>3</codigoPorcentaje> <!-- 3=15% -->
        <baseImponible>100.00</baseImponible>
        <valor>15.00</valor>
      </totalImpuesto>
    </totalConImpuestos>
    <propina>0.00</propina>
    <importeTotal>115.00</importeTotal>
    <moneda>DOLAR</moneda>
    <pagos>
      <pago>
        <formaPago>01</formaPago>
        <total>115.00</total>
        <plazo>0</plazo>
        <unidadTiempo>dias</unidadTiempo>
      </pago>
    </pagos>
  </infoFactura>

  <detalles>
    <detalle>
      <codigoPrincipal>SKU001</codigoPrincipal>
      <descripcion>Producto A</descripcion>
      <cantidad>2.000000</cantidad>
      <precioUnitario>50.000000</precioUnitario>
      <descuento>0.00</descuento>
      <precioTotalSinImpuesto>100.00</precioTotalSinImpuesto>
      <impuestos>
        <impuesto>
          <codigo>2</codigo>
          <codigoPorcentaje>3</codigoPorcentaje>
          <tarifa>15.00</tarifa>
          <baseImponible>100.00</baseImponible>
          <valor>15.00</valor>
        </impuesto>
      </impuestos>
    </detalle>
  </detalles>

  <infoAdicional>
    <!-- Generado desde additionalInfoFields de la empresa -->
    <campoAdicional nombre="Email">cliente@ejemplo.com</campoAdicional>
    <campoAdicional nombre="Orden de Compra">OC-2026-001</campoAdicional>
  </infoAdicional>
</factura>
```

**Nuevas dependencias a añadir a `functions/package.json`:**
```json
"xmlbuilder2": "^3.1.1"
```

**Estado:** ✅ COMPLETADO — `functions/src/invoices/generate-invoice-xml.ts`

---

### FASE 4 — Cloud Function: Firma Digital

**Objetivo:** Firmar el XML con el certificado .p12 usando XAdES-BES.

**Dependencias:** Fase 3 completada + certificado .p12 subido (Fase 1)

**Decisión pendiente — almacenamiento de password:**

| Opción | Pros | Contras |
|--------|------|---------|
| **A) Google Secret Manager** | Más seguro, auditable | Costo adicional, más setup |
| **B) Parámetro en cada llamada** | Simple, sin estado | El admin debe ingresarlo cada vez que la CF necesite firmar |
| **C) Cifrado en Firestore con KMS** | Transparente para el admin | Complejidad de setup KMS |

**Recomendación:** Opción A (Secret Manager) para producción. Durante desarrollo usar Opción B.

#### Función: `signXml(invoiceId: string, companyId: string)`

```
Flujo:
1. Lee XML sin firma de Storage
2. Carga certificado .p12 de Storage (companies/{id}/certificates/signing.p12)
3. Lee password del certificado (Secret Manager o parámetro)
4. Aplica firma XAdES-BES con node-forge
5. Valida que la firma es correcta
6. Guarda XML firmado en Storage: companies/{id}/xml/{invoiceId}-signed.xml
7. Actualiza Invoice: xmlUrl (URL del signed), sriStatus = 'signed'
```

**Estado:** ✅ COMPLETADO — `functions/src/invoices/sign-xml.ts`

---

### FASE 5 — Cloud Function: Envío a SRI

**Objetivo:** Enviar el XML firmado al webservice del SRI y procesar la respuesta.

**Dependencias:** Fase 4 completada

#### Función: `sendToSri(invoiceId: string, companyId: string)`

```
Flujo:
1. Lee XML firmado de Storage
2. Lee Company.sri.environment ('testing' | 'production')
3. Lee /platform/defaults/sriConfig para obtener URLs WSDL según ambiente
4. Llama webservice SOAP de RECEPCIÓN:
   POST {receptionUrl}
   Body: XML en base64
   Respuesta esperada: { estado: 'RECIBIDA' | 'DEVUELTA', comprobantes: [...] }
5. Si DEVUELTA → actualiza Invoice.sriError + sriStatus = 'rejected'
6. Si RECIBIDA → llama webservice de AUTORIZACIÓN:
   POST {authorizationUrl}
   Body: { claveAccesoComprobante: Invoice.accessKey }
   Respuesta: { numeroAutorizacion, fechaAutorizacion, estado, ... }
7. Si autorizada:
   - Invoice.authorizationNumber = numeroAutorizacion
   - Invoice.authorizedAt = fechaAutorizacion (Timestamp)
   - Invoice.sriStatus = 'authorized'
8. Si rechazada:
   - Invoice.sriError = mensaje SRI
   - Invoice.sriStatus = 'rejected'
```

**Manejo de reintentos:**
- Errores de red (timeout, 5xx): reintentar hasta 3 veces con backoff exponencial (1s, 2s, 4s)
- Error DEVUELTA del SRI: NO reintentar (error en el XML, requiere corrección)
- Error de autorización: reintentar 1 vez después de 5 segundos

**Nuevas dependencias:**
```json
"axios": "^1.7.0"   // llamadas HTTP al SOAP del SRI
```

**Nota:** El SRI usa SOAP/WSDL. Las llamadas son HTTP POST con body XML envuelto en envelope SOAP. No requiere librería SOAP completa — se puede hacer con axios + XML manual.

**Estado:** ✅ COMPLETADO — `functions/src/invoices/send-to-sri.ts`

---

### FASE 6 — Cloud Function: Generación PDF (RIDE)

**Objetivo:** Generar el PDF de Representación Impresa del Documento Electrónico.

**Dependencias:** Fase 5 completada (necesita authorizationNumber para el PDF)

#### Función: `generatePdf(invoiceId: string, companyId: string)`

```
Flujo:
1. Lee Invoice (ya autorizada, con authorizationNumber)
2. Lee Company (logo, datos fiscales)
3. Lee /companies/{id}/configuration/sri (razonSocial, direcciones)
4. Genera QR con la clave de acceso (49 dígitos)
5. Genera PDF con pdfkit o Puppeteer (HTML → PDF)
6. Guarda PDF en Storage: companies/{id}/pdf/{invoiceId}.pdf
7. Actualiza Invoice.pdfUrl
```

**Contenido del PDF (RIDE mínimo legal):**
- Logo de la empresa + datos emisor (RUC, razón social, dirección, establecimiento)
- Número de autorización SRI + fecha de autorización
- Clave de acceso (en texto + QR code)
- Datos del receptor (nombre, RUC/CI, dirección)
- Tabla de líneas (descripción, cantidad, precio, IVA, total)
- Totales (subtotal, descuento, base imponible, IVA, total)
- Forma de pago
- Bloque de información adicional
- Pie: "Este documento es una representación impresa de un comprobante electrónico"

**Decisión de librería PDF:**

| Opción | Pros | Contras |
|--------|------|---------|
| **pdfkit** | Liviano, sin dependencias de browser | Layout manual, más código |
| **Puppeteer** (HTML→PDF) | Fácil de diseñar, WYSIWYG | Pesado (~150MB), frío lento en CF |
| **jsPDF + html2canvas** | Funciona en Node | No tan preciso |

**Recomendación:** `pdfkit` para CFs. Si el diseño requiere mucho layout visual, evaluar Puppeteer con CF de 2GB RAM.

**Nuevas dependencias:**
```json
"pdfkit":       "^0.15.0",
"qrcode":       "^1.5.4"
```

**Estado:** ✅ COMPLETADO — `functions/src/invoices/generate-pdf.ts`

---

### FASE 7 — Cloud Function: Orquestador

**Objetivo:** Trigger automático que ejecuta el flujo completo al emitir una factura.

**Dependencias:** Fases 3, 4, 5, 6 completadas

#### Función: `onInvoiceEmit` (Firestore trigger)

```typescript
// Se dispara cuando Invoice.status cambia de 'draft' → 'issued'
export const onInvoiceEmit = onDocumentUpdated(
  'companies/{companyId}/invoices/{invoiceId}',
  async (event) => {
    const before = event.data?.before.data() as Invoice;
    const after  = event.data?.after.data()  as Invoice;

    // Solo actuar si el status cambió a 'issued' y no tiene sriStatus aún
    if (before.status !== 'issued' && after.status === 'issued' && !after.sriStatus) {
      const companyId  = event.params.companyId;
      const invoiceId  = event.params.invoiceId;

      try {
        // 1. Marcar como pending
        await db.doc(`companies/${companyId}/invoices/${invoiceId}`)
          .update({ sriStatus: 'pending' });

        // 2. Generar XML
        await generateInvoiceXmlInternal(invoiceId, companyId);

        // 3. Firmar XML
        await signXmlInternal(invoiceId, companyId);

        // 4. Enviar a SRI
        await sendToSriInternal(invoiceId, companyId);

        // 5. Generar PDF (incluso si SRI rechazó — el PDF sirve para ver el error)
        await generatePdfInternal(invoiceId, companyId);

      } catch (err) {
        // Registrar error sin dejar la factura en estado inconsistente
        await db.doc(`companies/${companyId}/invoices/${invoiceId}`)
          .update({ 
            sriStatus: 'rejected',
            sriError: err instanceof Error ? err.message : 'Error inesperado'
          });
        console.error('[onInvoiceEmit] Error:', err);
      }
    }
  }
);
```

**Estado:** ✅ COMPLETADO — `functions/src/invoices/on-invoice-emit.ts`

---

### FASE 8 — Funcionalidades complementarias (post-core)

| Sub-tarea | Descripción | Estado | Archivos |
|-----------|-------------|--------|---------|
| 8.1 Botón "Reenviar a SRI" | Reintento manual para facturas rejected | ✅ | `invoices-list.component.*` |
| 8.2 Descarga XML | Botón para descargar XML firmado de Storage | ✅ | `invoices-list.component.*` |
| 8.3 Descarga PDF / RIDE | Botón para descargar PDF de Storage | ✅ | `invoices-list.component.*` |
| 8.4 Consulta estado SRI | Botón "Verificar en SRI" → CF `checkSriStatus` → actualiza estado | ✅ | `check-sri-status.ts`, `invoices-list.*` |
| 8.5 Notas de Crédito UI | Botón "Crear N/C" en lista → `createCreditNote()` → borrador pre-poblado | ✅ | `invoices-list.component.*` |
| 8.6 Notificación email | CF `sendInvoiceEmail` (nodemailer SMTP) + auto-disparo en orquestador | ✅ | `send-invoice-email.ts`, `on-invoice-emit.ts` |
| 8.7 Multi-método de pago | `paymentMethods` FormArray con add/remove en UI | ✅ | `invoice-form.component.*` |
| 8.8 Fix: selectedCustomer | Restaurado en `patchForm` desde snapshot del cliente en factura | ✅ | `invoice-form.component.ts` |

---

## 5. Configurabilidad del XML desde DB

### ¿Qué se puede cambiar sin redeploy?

| Parámetro | Dónde | Ejemplo de cambio |
|-----------|-------|------------------|
| URLs webservice SRI | `/platform/defaults/sriConfig.endpoints` | SRI cambia servidor → admin actualiza URL |
| Versión schema XML factura | `/platform/defaults/sriConfig.facturaVersion` | SRI sube de 1.0.0 a 2.0.0 |
| Versión schema XML nota de crédito | `/platform/defaults/sriConfig.notaCreditoVersion` | Actualización SRI |
| Versión schema XML nota de débito | `/platform/defaults/sriConfig.notaDebitoVersion` | Actualización SRI |
| Versión schema XML retención | `/platform/defaults/sriConfig.comprobanteRetencionVersion` | **PENDIENTE** — actualmente hardcoded `'1.0.0'` |
| Tabla taxCodes (IVA) | `/platform/defaults/sriConfig.taxCodes` | SRI agrega nueva tasa (ej. 8%) |
| Formas de pago | `/platform/defaults/sriConfig.paymentMethodCodes` | SRI agrega nuevo código |
| Códigos de retención IR | `/platform/defaults/sriConfig.retentionTaxCodes` | Nuevos códigos retención |
| Ambiente testing/prod | `Company.sri.environment` | Empresa pasa a producción |
| Razón social en XML | `/companies/{id}/configuration/sri.razonSocial` | Empresa cambia nombre comercial |
| Campos adicionales XML | `/companies/{id}/configuration/sri.additionalInfoFields` | Empresa quiere mostrar su web en el PDF |
| Número de resolución agente retención | `/companies/{id}/configuration/sri.agenteRetencion` | **PENDIENTE** — falta campo |
| Tipo de contribuyente | `/companies/{id}/configuration/sri.tipoContribuyente` | **PENDIENTE** — falta campo |
| Régimen microempresa | `/companies/{id}/configuration/sri.regimenMicroempresa` | **PENDIENTE** — falta campo |

### ¿Qué NO se puede cambiar sin redeploy?

| Parámetro | Por qué |
|-----------|---------|
| Estructura de elementos XML | Definida por XSD SRI — si cambia es cambio legal |
| Algoritmo módulo 11 (clave acceso) | Definido en resolución SRI |
| Protocolo SOAP | Parte del webservice SRI |
| Algoritmo de firma XAdES-BES | Estándar criptográfico |
| Reglas de longitud de campos | Definidas en XSD (ej. descripción máx 300 chars) |

---

## 6. Flujo completo de emisión

```
USUARIO                     FRONTEND                    CLOUD FUNCTIONS              SRI
   │                            │                               │                     │
   │── Click "Emitir" ─────────►│                               │                     │
   │                            │── save(emitAfter=true) ──────►│                     │
   │                            │                         updateDoc(status='issued')  │
   │                            │                               │                     │
   │                            │                         [onInvoiceEmit trigger]      │
   │                            │                               │                     │
   │                            │                         generateXml()               │
   │                            │                         → Lee sriConfig (platform)  │
   │                            │                         → Lee Company.sri           │
   │                            │                         → Lee configuration/sri     │
   │                            │                         → Calcula clave 49 dígitos  │
   │                            │                         → Guarda XML en Storage     │
   │                            │                               │                     │
   │                            │                         signXml()                   │
   │                            │                         → Lee .p12 de Storage       │
   │                            │                         → Aplica XAdES-BES          │
   │                            │                         → Guarda XML-firmado        │
   │                            │                               │                     │
   │                            │                         sendToSri()                 │
   │                            │                               │── SOAP recepción ──►│
   │                            │                               │◄── RECIBIDA ────────│
   │                            │                               │── SOAP autorización►│
   │                            │                               │◄── AUTORIZADA ──────│
   │                            │                         updateDoc(sriStatus=authorized,
   │                            │                                  authorizationNumber,
   │                            │                                  authorizedAt)       │
   │                            │                               │                     │
   │                            │                         generatePdf()               │
   │                            │                         → Incluye QR + N° autorización
   │                            │                         → Guarda PDF en Storage     │
   │                            │                         updateDoc(pdfUrl)           │
   │                            │                               │                     │
   │◄── Badge "Autorizada" ─────│◄── onSnapshot ────────────────│                     │
   │◄── Botones XML + PDF ──────│                               │                     │
```

---

## 7. Bugs corregidos

| Bug | Causa raíz | Fix aplicado | Archivo:Línea |
|-----|-----------|-------------|--------------|
| Eliminar línea incorrecta | `track $index` en `@for` — Angular reutiliza DOM por posición | `track lineGroup; let i = $index` | `invoice-form.component.html:263` |
| Primera línea no eliminable | Consecuencia del bug anterior (visual) | Mismo fix | — |
| Facturas con IVA 0% no se guardan | `Validators.required` trata `0` como inválido (falsy) | `[Validators.min(0), Validators.max(100)]` | `invoice-form.component.ts:511` |
| IVA siempre 15% al seleccionar producto | `(p as any).vatPct ?? 15` — campo no existe, es `p.taxRate` | `p.taxRate ?? 15` | `invoice-form.component.ts:590,763` |
| `fechaEmision`/`claveAcceso` un día adelantada | `getDate()/getMonth()/getFullYear()` usan timezone del runtime (UTC), no Ecuador (UTC-5) | `Intl.DateTimeFormat` con `timeZone: 'America/Guayaquil'` | `utils/sri-date.ts` (nuevo) |
| PDF (RIDE) crasheaba: `Cannot read properties of undefined (reading 'toFixed')` | Interfaces `Invoice`/`InvoiceLine` en generate-pdf.ts con nombres de campo obsoletos (`subtotal`,`discount`,`taxRate`...) que ya no existen en el documento real | Mismos fallbacks que ya tenía el generador de XML | `invoices/generate-pdf.ts`, `invoices/generate-credit-note-pdf.ts` |
| Selección de certificado en `.p12` con cadena | Tomaba ciegamente `certBags[0]`; con cadena completa (titular+CA+raíz) podía embeber el cert equivocado | Selecciona el cert cuyo módulo/exponente RSA coincide con la llave privada | `utils/sign-xml-helper.ts` |
| **"FIRMA INVALIDA" — causa raíz real** | C14N casero declaraba `xmlns:ds`+`xmlns:xades` juntos en `ds:Signature`; el algoritmo no-exclusivo que exige el SRI (`REC-xml-c14n-20010315`) renderiza TODOS los namespaces en scope en cada nodo referenciado — `SignedInfo`/`KeyInfo` nunca deberían heredar `xades`, solo `SignedProperties` | `xmlns:xades` se movió a declararse en `xades:QualifyingProperties` (no en `ds:Signature`); `withDsNs()` (solo ds) vs `withInheritedNs()` (ds+xades) según corresponda | `utils/sign-xml-helper.ts` |
| `X509IssuerName` en orden ASN.1 en vez de RFC 2253 | XMLDSig §4.4.4 exige RFC 2253 (más específico primero: `CN,O,C`); el código unía `certificate.issuer.attributes` en el orden crudo del certificado (`C,O,CN`) | `.reverse()` antes de unir los atributos del emisor | `utils/sign-xml-helper.ts` |
| `tipoIdentificacionComprador` = 04 en vez de 07 para Consumidor Final | Dependía de `customerTaxIdType` (texto), que puede desincronizarse del cliente real (visto en producción: cliente "Consumidor Final" guardado con `taxIdType:"RUC"`) | `resolveTipoIdentificacionComprador()`: si `identificacionComprador === '9999999999999'` fuerza 07 SIEMPRE, sin importar el texto | `utils/sri-buyer-id.ts` (nuevo), usado en los 3 generadores (factura/NC/ND) |
| Nota de débito: `tipoIdentificacionComprador` sin mapear | Volcaba el string crudo (`"RUC"`, `"CI"`...) directo al XML en vez de un código SRI de 2 dígitos | Usa `resolveTipoIdentificacionComprador()` | `debit-notes/generate-debit-note-xml.ts` |
| Doble aplicación del descuento global | `totalSinImp = subtotal - discountAmt` cuando `subtotal` YA era `netAmount` (ya neto del descuento) | Solo resta `discountAmt` cuando el campo fuente es `subtotal`/`grossAmount` (no cuando ya es `netAmount`) | `invoices/generate-invoice-xml.ts` |

---

## 7.1 Auditoría completa de firma XAdES-BES y capa de validación (2026-08-22)

Auditoría end-to-end solicitada explícitamente: generación de clave de acceso, identificación del comprador, totales, XAdES-BES 1.3.2, C14N, digests, certificado, y validación XSD. Resultado: **72 tests automatizados pasando**, incluyendo firma real + verificación criptográfica real (no solo self-consistency) con detección de manipulación probada contra un certificado generado en memoria.

**Módulos nuevos (`functions/src/utils/`):**

| Archivo | Responsabilidad |
|---|---|
| `sri-access-key.ts` | `generateAccessKey()` / `validateAccessKey()` / `calculateModulo11()` / `assertValidAccessKey()` — construcción y validación estructural completa de la clave de 49 dígitos (fecha, RUC, ambiente, establecimiento, punto emisión, secuencial, código numérico, tipo emisión, dígito verificador). Conectado como guardia obligatoria en los 4 generadores (factura, NC, ND, retención) — nunca se firma con una clave mal construida. |
| `sri-buyer-id.ts` | `resolveTipoIdentificacionComprador()` — Tabla 6 SRI (04 RUC, 05 Cédula, 06 Pasaporte, 07 Consumidor Final, 08 Exterior), verificada contra el XSD oficial (`pattern value="[0][4-8]"`). Consumidor Final se detecta por la identificación fija `9999999999999`, no por texto. |
| `sri-invoice-validator.ts` | `validateBuyerIdentification()`, `validateTotals()`, `validateInvoiceForSri()` — validación estructurada (`{valid, errors: [{code, field, message}]}`) de consistencia comprador/totales, ejecutada ANTES de construir el XML. |
| `sign-xml-helper.ts` (extendido) | `verifySignedXml()` — re-deriva los 3 digests + verifica `SignatureValue` RSA-SHA1 contra el certificado embebido, desde el XML YA FIRMADO (no solo re-firmando). Conectado como guardia obligatoria al final de `signXmlContent()`: si la firma no se auto-verifica, lanza error y NO se envía nada al SRI. |
| `validate-electronic-invoice.ts` | CLI: `npx ts-node src/utils/validate-electronic-invoice.ts factura.xml` — corre TODAS las validaciones (estructura, **XSD oficial vía `xmllint`**, clave de acceso, comprador, totales, certificado, 3 digests, SignatureValue, XAdES-BES) e imprime un reporte `[✓]/[✗]/[?]`. `[?]` = no verificado (nunca se reporta como válido sin ejecutar el chequeo). |

**XSD oficial:** ya estaba vendido en `docs/XML y XSD Factura/factura_V{1.0.0,1.1.0,2.0.0,2.1.0}.xsd` — solo faltaba `xmldsig-core-schema.xsd` (schema W3C estándar que el XSD del SRI importa), agregado a la misma carpeta. Validado con `xmllint --schema` (libxml2): el XML que genera `generate-invoice-xml.ts` **valida correctamente contra `factura_V1.0.0.xsd`**.

⚠️ **La validación XSD SOLO corre en el CLI local** — no se conectó al flujo de producción de Cloud Functions porque no se confirmó que el binario `xmllint` exista en el runtime de Firebase Functions Gen2 (Cloud Run, Node 20). Conectarlo sin verificar eso podría romper la generación de facturas en producción con `ENOENT`. Antes de conectarlo a producción: confirmar disponibilidad de `xmllint` en ese runtime, o migrar a una librería XSD pura-Node.

**Tests nuevos (`functions/src/__tests__/`):** `sri-access-key.test.ts`, `sri-buyer-id.test.ts`, `sri-invoice-validator.test.ts`, `sign-xml-helper.test.ts` (firma+verificación+tamper-detection reales con cert RSA generado en memoria vía `node-forge`, sin depender de `openssl`).

---

## 7.2 Causa raíz definitiva de "FIRMA INVALIDA", confirmada contra la Ficha Técnica oficial (2026-08-22)

Tras §7.1, el SRI seguía rechazando con `identificador 39, "FIRMA INVALIDA", informacionAdicional: "firma y/o certificados alterados"` — probado con **dos certificados de dos entidades certificadoras distintas** (Lazzate y FirmaSegura), ambos fallando igual, mientras que **Odoo** (localización EC de terceros) autorizaba sin problema una factura firmada con el mismo certificado Lazzate el mismo día. Esto descartó infraestructura del certificado como causa.

Se leyó el documento oficial `docs/FICHA TE_CNICA COMPROBANTES ELECTRO_NICOS ESQUEMA OFFLINE Versio_n 234.pdf` (requiere `poppler-utils`: `brew install poppler`, para que el lector de PDF del entorno pueda renderizar páginas — no viene preinstalado). El **ANEXO 14** (pág. 111-113) trae el ejemplo XML oficial completo de una firma XAdES-BES. Comparado campo por campo contra `sign-xml-helper.ts`, se encontraron:

1. **Namespace scope revertido incorrectamente en una iteración previa (§7.1 Bug 2c).** El ejemplo oficial declara `xmlns:ds` Y `xmlns:xades` JUNTOS en `<ds:Signature>` — la estrategia original (antes de "corregirla" comparando con Odoo, un tercero, en vez de la ficha técnica). Se revirtió: ambos namespaces vuelven a `ds:Signature`, `withDsNs()` se eliminó, todo usa `withInheritedNs()` (ds+xades) para SignedInfo/KeyInfo/SignedProperties.
2. **Bug real, presente desde el origen:** el atributo `Type` de la `ds:Reference` a `SignedProperties` debía ser la constante XAdES fija `http://uri.etsi.org/01903#SignedProperties` (sin `/v1.3.2`) — el código generaba `http://uri.etsi.org/01903/v1.3.2#SignedProperties` (derivado por error del namespace de versión `XADES_NS`). Confirmado tanto por la ficha técnica como por el XML de Odoo. Nueva constante `XADES_SIGNED_PROPERTIES_TYPE` separada de `XADES_NS`.
3. **Orden de `ds:Reference` en `SignedInfo`:** el ejemplo oficial (y Odoo) van SignedProperties → KeyInfo → comprobante. El código tenía el orden inverso; se corrigió.
4. `ds:SignatureValue` con atributo `Id` (presente en el ejemplo oficial, bajo impacto ya que nada lo referencia, pero se agregó por fidelidad).

**Lección:** para dudas de conformidad con el SRI, la Ficha Técnica oficial (`docs/FICHA TE_CNICA...pdf`, hay v232 y v234 en el repo) es la fuente de verdad — no la implementación de un tercero (Odoo), que puede usar convenciones alternativas válidas para SU propio software pero no necesariamente exigidas por el SRI, y que además puede tener otras diferencias (IDs con GUID, elementos opcionales presentes/ausentes) que no son la causa del problema.

**Estado:** 72 tests pasan, XSD real (`xmllint`) y verificación criptográfica real pasan end-to-end localmente. **Aún sin confirmar contra el SRI real** — pendiente deploy + reintento.

---

## 8. Pendientes no-SRI

| # | Bug/Mejora | Impacto | Estado |
|---|-----------|---------|--------|
| P1 | `selectedCustomer` null al cargar factura existente | Bajo | ✅ Resuelto (8.8) |
| P2 | `paymentMethods` solo 1 método por factura | Medio | ✅ Resuelto (8.7) |
| P3 | Sin validación de cliente en edición de borrador | Bajo | ✅ Resuelto — guard `!selectedCustomer()` sin `isNew()` |
| P4 | Búsqueda client-side — lenta con +5000 registros | Medio | 🔴 Futuro — evaluar Algolia o Firestore composite index |
| P5 | Sin tests unitarios en cálculos ni validadores | Alto | ✅ Resuelto (2026-08-22) — 72 tests: clave de acceso, comprador, totales, firma real+tamper-detection (ver §7.1) |
| P6 | `updatedBy` faltante en operaciones de update | Bajo | ✅ Resuelto — `invoices.service.ts` + `Invoice.updatedBy?` |
| P7 | Notas de Crédito sin UI | Alto | ✅ Resuelto (8.5) — solo UI, backend SRI pendiente (ver Sección 13) |
| P8 | Signed URLs de Storage expiran en 7 días | Alto | 🔴 Sprint 3 — reemplazar por CF callable de descarga |
| P9 | Secuenciales no aislados por punto de emisión | Medio | 🔴 Sprint 3 — clave counter `{estab}_{pto}_{año}` |
| P10 | Alerta certificado próximo a vencer en dashboard | Medio | 🔴 Sprint 4 |

---

## 9. Referencia de archivos clave

### Frontend (Angular)

```
src/app/features/invoices/
├── invoice-form.component.ts          ← Formulario CRUD + multi-pago FormArray + selectedCustomer fix
├── invoice-form.component.html
├── invoices-list.component.ts         ← Lista + badge SRI + createCreditNote + reenviar/verificar
├── invoices-list.component.html
├── models/
│   └── invoice.interface.ts           ← Invoice (updatedBy?), InvoiceLine, SriDocumentStatus
└── services/
    └── invoices.service.ts            ← CRUD + autoincrement + updatedBy en updates

src/app/features/retentions/
├── retentions-list.component.ts       ← Lista filtros año/estado/búsqueda, badge SRI, reenviar/XML
├── retention-form.component.ts        ← Búsqueda proveedor, doc sustento, FormArray impuestos IR+IVA
├── retention-form.component.html
├── retentions.routes.ts
├── models/
│   └── retention.interface.ts         ← Retention, RetentionTax, códigos IR/IVA, tipos doc sustento
└── services/
    └── retentions.service.ts          ← CRUD + autoincrement + updatedBy

src/app/features/debit-notes/
├── debit-notes-list.component.ts      ← Lista filtros, badge SRI, reenviar/XML/PDF
├── debit-note-form.component.ts       ← Búsqueda cliente, referencia factura, FormArray motivos
├── debit-note-form.component.html
├── debit-notes.routes.ts
├── models/
│   └── debit-note.interface.ts        ← DebitNote, DebitNoteMotivo, calcDebitNoteTotals
└── services/
    └── debit-notes.service.ts         ← CRUD + autoincrement + updatedBy

src/app/features/settings/
├── models/
│   └── settings.interfaces.ts         ← DocumentSeries, TaxRate, CompanySettings
├── services/
│   └── settings.service.ts            ← getSriConfig(), saveSriConfig()
└── pages/
    └── company-settings/
        ├── company-settings.component.ts   ← sriForm, uploadCertificate(), certStatus
        └── company-settings.component.html ← Pestaña SRI + certificado

src/app/features/super-admin/
└── models/
    └── company.interface.ts            ← Company con Company.sri extendido
```

### Cloud Functions (Node.js 20)

```
functions/src/
├── index.ts                           ← Punto de entrada, exporta todo
├── auth/
│   ├── set-custom-claims.ts
│   └── setup-first-admin.ts
├── tenants/
│   └── setup-company.ts               ← Crea empresa + defaults
├── tools/
│   └── seed-defaults.ts               ✅ Seed completo: platform/defaults/sriConfig (TABLAS 16–20)
├── invoices/
│   ├── upload-certificate.ts          ✅ Subir y validar .p12 → Storage + Firestore
│   ├── generate-invoice-xml.ts        ✅ XML factura (xmlbuilder2, clave 49 dígitos)
│   ├── sign-xml.ts                    ✅ Firma XAdES-BES (node-forge)
│   ├── send-to-sri.ts                 ✅ SOAP recepción + autorización + reintentos
│   ├── check-sri-status.ts            ✅ Consulta WS autorización SRI
│   ├── generate-pdf.ts                ✅ RIDE con pdfkit + qrcode
│   ├── send-invoice-email.ts          ✅ Email al cliente tras autorización (nodemailer SMTP)
│   └── on-invoice-emit.ts             ✅ Trigger Firestore: XML→firma→SRI→PDF→email
├── retentions/
│   ├── generate-retention-xml.ts      ✅ XML comprobanteRetencion (codDoc=07, clave 49 dígitos)
│   ├── generate-retention-pdf.ts      ✅ RIDE retención (pdfkit + QR) → Storage pdf/ret-{id}.pdf
│   ├── send-retention-email.ts        ✅ Email HTML al proveedor (smtp-helper)
│   └── on-retention-emit.ts           ✅ Trigger: XML→firma→SRI→PDF→email (post-auth no bloqueante)
├── debit-notes/
│   ├── generate-debit-note-xml.ts     ✅ XML notaDebito (codDoc=05, clave 49 dígitos)
│   ├── generate-debit-note-pdf.ts     ✅ RIDE nota débito (pdfkit + QR) → Storage pdf/dn-{id}.pdf
│   ├── send-debit-note-email.ts       ✅ Email HTML al cliente (smtp-helper)
│   └── on-debit-note-emit.ts          ✅ Trigger: XML→firma→SRI→PDF→email (post-auth no bloqueante)
└── utils/
    ├── smtp-helper.ts                 ✅ Lee SMTP de Firestore (cache 5 min) o env vars; createSmtpTransporter/getSmtpFrom
    ├── sri-date.ts                    ✅ Fecha/clave en timezone America/Guayaquil (no UTC del runtime)
    ├── sri-access-key.ts              ✅ generateAccessKey/validateAccessKey/calculateModulo11 — clave 49 dígitos
    ├── sri-buyer-id.ts                ✅ resolveTipoIdentificacionComprador — Tabla 6 SRI, Consumidor Final por identificación fija
    ├── sri-invoice-validator.ts       ✅ validateBuyerIdentification/validateTotals/validateInvoiceForSri
    ├── sign-xml-helper.ts             ✅ Firma XAdES-BES + verifySignedXml (verificación criptográfica real post-firma)
    ├── validate-signature.ts          ✅ Script diagnóstico local: firma un XML de prueba y verifica matemáticamente
    └── validate-electronic-invoice.ts ✅ CLI: valida un XML firmado real (XSD, clave, comprador, totales, firma) — ver §7.1
```

### Firestore paths

```
/platform/defaults/
├── sriConfig/data                     ← URLs WSDL, versiones, códigos SRI (TABLAS 16–20)
├── taxRates/{id}
├── paymentTerms/{id}
├── documentSeries/{id}
├── warehouses/{id}
└── currencies/{code}

/companies/{companyId}/
├── (documento raíz)                   ← Company con Company.sri
├── configuration/
│   ├── general                        ← CompanySettings
│   └── sri                            ← SriCompanyConfig (razonSocial, direcciones, additionalInfoFields)
├── invoices/{invoiceId}               ← Invoice con campos SRI extendidos + updatedBy
├── retentions/{retentionId}           ← Retention (comprobante 07)
├── debitNotes/{debitNoteId}           ← DebitNote (comprobante 05)
├── counters/invoices                  ← Autoincrement por serie+año (facturas)
├── counters/retentions                ← Autoincrement por serie+año (retenciones)
├── counters/debitNotes                ← Autoincrement por serie+año (notas débito)
├── taxRates/{id}
├── documentSeries/{id}
├── warehouses/{id}
├── paymentTerms/{id}
└── products/{id}

Cloud Storage:
companies/{companyId}/
├── certificates/signing.p12               ← .p12 privado (bucket privado)
├── xml/{invoiceId}.xml                    ← XML factura sin firma
├── xml/{invoiceId}-signed.xml             ← XML factura firmado
├── xml/ret-{retentionId}.xml              ← XML retención sin firma
├── xml/ret-{retentionId}-signed.xml       ← XML retención firmado
├── xml/dn-{debitNoteId}.xml               ← XML nota débito sin firma
├── xml/dn-{debitNoteId}-signed.xml        ← XML nota débito firmado
├── pdf/{invoiceId}.pdf                    ← RIDE factura
├── pdf/ret-{retentionId}.pdf              ← RIDE retención
└── pdf/dn-{debitNoteId}.pdf               ← RIDE nota de débito
```

---

## 10. Módulos de documentos electrónicos

### Comprobantes implementados

| Comprobante | codDoc | Módulo Angular | CF XML | CF Trigger | Estado |
|-------------|--------|---------------|--------|-----------|--------|
| Factura de venta | `01` | `invoices/` | `generate-invoice-xml.ts` | `on-invoice-emit.ts` | ✅ End-to-end |
| Nota de crédito | `04` | `invoices/` (createCreditNote + motivo + info NC) | `generate-credit-note-xml.ts` | `on-invoice-emit.ts` (bifurcado) | ✅ End-to-end |
| Nota de débito | `05` | `debit-notes/` | `generate-debit-note-xml.ts` | `on-debit-note-emit.ts` | ✅ End-to-end |
| Comprobante de retención | `07` | `retentions/` | `generate-retention-xml.ts` | `on-retention-emit.ts` | ✅ End-to-end |
| Liquidación de compra | `03` | — | — | — | 🔴 Futuro (Sprint 5) |
| Guía de remisión | `06` | — | — | — | 🔴 Futuro (Sprint 5) |

### Rutas Angular

| Ruta | Componente | Rol mínimo |
|------|-----------|-----------|
| `/invoices` | `InvoicesListComponent` | seller |
| `/invoices/new` | `InvoiceFormComponent` | seller |
| `/retentions` | `RetentionsListComponent` | accountant |
| `/retentions/new` | `RetentionFormComponent` | accountant |
| `/debit-notes` | `DebitNotesListComponent` | seller |
| `/debit-notes/new` | `DebitNoteFormComponent` | seller |

### Patrones comunes entre módulos

- **Numeración:** `companies/{id}/counters/{module}` — `runTransaction` atómico, clave `{seriesCode}_{fiscalYear}`
- **Clave de acceso:** 48 dígitos = fecha(8) + codDoc(2) + RUC(13) + ambiente(1) + serie(6) + secuencial(9) + codigoNumerico(8) + tipoEmisión(1) → + dígito verificador módulo 11
- **Pipeline emisión:** draft → issued → trigger CF → pending → xml_generated → signed → authorized/rejected
- **Firma:** XAdES-BES con node-forge, .p12 en Storage (`signing.p12`)
- **SOAP SRI:** recepción + autorización, mismos endpoints para todos los comprobantes
- **updatedBy:** todos los servicios incluyen `updatedBy: userId` en cada update

### Pendientes módulos retenciones/notas débito

| # | Ítem | Prioridad | Estado |
|---|------|-----------|--------|
| R1 | PDF/RIDE para retenciones (pdfkit) | Media | ✅ Completado |
| R2 | PDF/RIDE para notas de débito (pdfkit) | Media | ✅ Completado |
| R3 | Email al proveedor tras retención autorizada | Baja | ✅ Completado |
| R4 | Links en sidebar navegación (`default-layout`) | Alta | ✅ Completado — `_nav.ts` |
| R5 | Agregar `retentions` y `debitNotes` al `DocumentSeries` | Media | ✅ Completado |

---

## 11. Bugs críticos — Ficha Técnica SRI v2.32

> Análisis contra Ficha Técnica v2.32 (octubre 2025). Estos issues deben corregirse **antes** de hacer pruebas reales contra el webservice SRI.

### 🔴 CRÍTICO — Deben corregirse en Sprint 1

| # | Descripción | Archivo | Línea | Impacto |
|---|-------------|---------|-------|---------|
| B1 | **Fallback `sriCode` IVA 15% incorrecto**: código `'3'` hardcoded debe ser `'4'` (TABLA 17 v2.32). Si Firestore no tiene el seed sembrado, todas las facturas 15% se emiten con código erróneo y el SRI las rechaza. | `generate-invoice-xml.ts` | ~180 | CRITICO — rechazo SRI masivo |
| B2 | **Password .p12 siempre vacío** en `on-retention-emit.ts` y `on-debit-note-emit.ts`. Los certificados del BCE tienen contraseña obligatoria en producción; la firma fallará silenciosamente. | `on-retention-emit.ts`, `on-debit-note-emit.ts` | passphrase `''` hardcoded | CRITICO — firma invalida en producción |
| B3 | **Tres implementaciones XAdES-BES separadas** (facturas, retenciones, notas débito) con canonicalización C14N aproximada (strip de `<?xml?>`). Puede causar rechazos intermitentes por orden de namespaces/atributos. | `sign-xml.ts`, `on-retention-emit.ts`, `on-debit-note-emit.ts` | — | CRITICO — tasa de rechazo intermitente |
| B4 | **Nota de crédito marcada ✅ pero backend ausente**: `on-invoice-emit.ts` no distingue `isCreditNote=true` y generaría `<factura codDoc='01'>` en lugar de `<notaCredito codDoc='04'>`. El SRI rechazaría este documento. | `on-invoice-emit.ts` | — | CRITICO — NC no se puede emitir electrónicamente |

### 🟠 ALTO — Correcciones de conformidad con XSD SRI

| # | Descripción | Archivo | Impacto |
|---|-------------|---------|---------|
| B5 | **Nodo `<impuestos>` a nivel raíz en retenciones**: la Ficha v2.32 ubica los impuestos dentro de `<docSustento><retenciones>`, no a nivel raíz del comprobante. Puede fallar validación XSD. | `generate-retention-xml.ts` | Alto — rechazo por schema |
| B6 | **Campos vacíos de comercio exterior** (`<tipoRegi>`, `<paisEfecPago>`) emitidos siempre en retenciones. Deben omitirse si el pago es local; enviarlos vacíos puede fallar XSD. | `generate-retention-xml.ts` | Alto |
| B7 | **`codigoPrincipal` puede estar ausente** en detalles de factura si el producto no tiene SKU. El SRI lo requiere; usar ID del producto o `'SIN-CODIGO'` como fallback. | `generate-invoice-xml.ts` | Alto — rechazo por campo requerido |
| B8 | **`comprobanteRetencionVersion` hardcoded** (`'1.0.0'`). No existe en `SriPlatformConfig`, impidiendo actualizarlo sin redeploy. | `generate-retention-xml.ts` | Medio — riesgo al actualizar esquema SRI |

### 🟡 MEDIO — Mejoras de conformidad

| # | Descripción | Impacto |
|---|-------------|---------|
| B9 | **Lógica Consumidor Final ausente**: cuando `taxId='9999999999999'` debe forzarse `tipoIdentificacion='07'` y `razonSocial='CONSUMIDOR FINAL'`, y validar que el total < `consumidorFinalMaxAmountUsd`. | Medio |
| B10 | **`unidadMedida` no incluida en detalles XML**: campo esperado por muchos validadores aunque opcional en facturas. | Bajo |
| B11 | **`codigoAdicional` no soportado**: la Ficha permite segundo código (barras, ref. interna) en cada detalle; `InvoiceLine` no tiene el campo. | Bajo |
| B12 | **ISD en retenciones sin UI**: `SriPlatformConfig.retentionTaxCodes` incluye código `'6'` (ISD) pero el formulario solo permite IR e IVA. | Bajo |
| B13 | **Signed URLs de Storage expiran en 7 días**: los links `xmlUrl`/`pdfUrl` guardados en Firestore dejan de funcionar. No hay proceso de renovación. | Medio — afecta descarga a largo plazo |

---

## 12. Parámetros faltantes por configurar

> El sistema ya tiene buena cobertura de parametría. Estos son los campos adicionales identificados contra la Ficha Técnica v2.32 que aún faltan.

### 12.1 En `/platform/defaults/sriConfig/data` (SriPlatformConfig)

| Campo | Tipo | Para qué sirve | Estado |
|-------|------|----------------|--------|
| `comprobanteRetencionVersion` | `string` | Versión schema XML de retención (actualmente hardcoded `'1.0.0'`) | **PENDIENTE** |
| `liquidacionCompraVersion` | `string` | Versión para liquidaciones de compra (codDoc=03) | Futuro |
| `guiaRemisionVersion` | `string` | Versión para guías de remisión (codDoc=06) | Futuro |
| `consumidorFinalTipoId` | `string` | Tipo identificación consumidor final (`'07'`) — parametrizable | **PENDIENTE** |
| `consumidorFinalMaxAmountUsd` | `number` | Monto máximo para emitir a consumidor final (actualmente en seed pero sin lógica frontend) | **PENDIENTE** |
| `documentosElectronicosPermitidos` | `string[]` | Lista de codDoc que requieren emisión electrónica | Futuro |

### 12.2 En `/companies/{id}` — campo `sri`

| Campo | Tipo | Para qué sirve | Estado |
|-------|------|----------------|--------|
| `certPassword` | Referencia a Secret Manager o campo cifrado | Password del .p12 para firma automática en retenciones y N/D | **CRITICO — PENDIENTE** |
| `tipoEmision` | `'1'` | Posición 47 de clave de acceso — actualmente hardcoded `'1'` | Parametrizar (bajo) |

### 12.3 En `/companies/{id}/configuration/sri` (SriCompanyConfig)

| Campo | Tipo | Para qué sirve | Estado |
|-------|------|----------------|--------|
| `agenteRetencion` | `string` | Número de resolución de agente retenedor — aparece en RIDE y XML | **PENDIENTE** |
| `tipoContribuyente` | `'01' \| '02'` | Persona natural (`01`) o sociedad (`02`) — algunos comprobantes lo requieren | **PENDIENTE** |
| `regimenMicroempresa` | `boolean` | Indicador XML para facturas de microempresas (reforma 2023) | **PENDIENTE** |
| `exportador` | `boolean` | Habilitador de estructura XML diferente para facturas de exportación | Futuro |
| `emailReplyTo` | `string` | Email de respuesta del emisor en emails al cliente | **PENDIENTE** |
| `emailCcAccounting` | `string` | CC al departamento contable en cada email de comprobante | Futuro |

### 12.4 Secuenciales por punto de emisión y establecimientos — ✅ commiteado (2026-09-22), reglas y siembra en producción, ⏳ functions sin desplegar

~~El counter actual usa clave `{seriesCode}_{fiscalYear}`… Cambio necesario: clave del
counter → `{establecimiento}_{puntoEmision}_{fiscalYear}`~~ → **ya hecho**: el contador
`companies/{cid}/counters/invoices` usa la clave `estab_pto_año` (`001_001_2025`,
`invoices.service.ts:166-185`, verificado el 2026-09-22).

Lo que faltaba (2026-09-22): los **4 generadores de XML** (factura, NC, ND, retención)
ignoraban la serie y usaban siempre `company.sri.establishment` / `emissionPoint`, y la
dirección era una sola (`configuration/sri.direccionEstablecimiento`). La factura de una
sucursal llegaba al SRI como de la matriz con un secuencial ya usado.

| Commit (`feat/portal-canal`) | Qué |
|---|---|
| `ac51a1e` | `functions/src/utils/establishments.ts`: `resolveEmissionSeries` (usa `seriesEstablishment`/`seriesEmissionPoint` del comprobante, en pareja; la empresa como respaldo), `resolveEstablishmentAddress` (`<dirEstablecimiento>` desde `establishments/{código}`, respaldo `configuration/sri`), `buildMainEstablishment`. `setupCompany` crea la matriz. Reglas (`isAdminGovernedCollection`). `scripts/seed-establishments.ts` (en seco por defecto, sin clave). 125 pruebas jest |
| `066effa` | Configuración → Establecimientos (`/settings/establishments`); las series eligen establecimiento y punto de emisión de una lista |
| `fd52160` | El super admin los administra desde la ficha de la empresa (`/super-admin/companies/:id/establishments`, reusa la pantalla con un `companyId` explícito). Reglas: también el super admin y el admin del canal de la empresa, con el canal activo (`inCallerChannel`); 17 casos en emulador. Ítem `settings_establishments` en `MODULES_SEED` (orden 911.5); el script crea solo ese módulo si falta (`seed-modules.ts` reescribe el catálogo con merge y pisaría los ajustes de la pantalla Módulos) |
| `fded82a` | Cómo correr el script (sin `ts-node`, ver abajo) |
| `8fe8f47` | El error de carga dice la causa (permiso denegado o el código) |
| `54b63ec` | El super admin no podía listar: `collectionData` (rxfire) choca con la instancia de Firestore del proyecto («Expected type '_Query'…»). Ahora `onSnapshot`, como `FirestoreService.getCollection`. **En este proyecto no usar `collectionData`** |

**Modelo:** `companies/{cid}/establishments/{código}` — el id es el código SRI (3 dígitos,
no `000`). Campos `code, name, address, city, phone, isMain, isActive,
emissionPoints[{code, name, isActive}]`. No se borran (hay comprobantes con ese código): se
desactivan. Lee cualquier usuario de la empresa; escribe el admin de la empresa, el super
admin y el admin del canal de la empresa (`fd52160`). El menú de la empresa sale de
`/modules` en Firestore (no de `_nav.ts`), por eso hace falta `modules/settings_establishments`.

**Despliegue**, con nombres (nunca deploy general: publicaría `getAuthToken`,
herramienta de desarrollo sin autenticación, nunca desplegada):

- ✅ `firestore:rules` — desplegadas por el usuario el 2026-09-22 (ruleset activo 16:05 UTC,
  idéntico al archivo local de 794 líneas).
- ✅ `seed-establishments --apply` — corrido el 2026-09-22: creó
  `modules/settings_establishments` y la matriz 001 de «Empresa 001»
  (`OXxy4Zw3bSZn4ayRxTfF`); LEANDRO LEÓN (`OG4ydEyOAhtsNmkOjc1P`) ya tenía su 001 y no se
  tocó.
- ⏳ Las 8 functions:

```bash
# desde saas_facturacion_web_JDC/, rama feat/portal-canal — PENDIENTE
firebase deploy --only functions:generateInvoiceXml,functions:generateCreditNoteXml,functions:generateDebitNoteXml,functions:generateRetentionXml,functions:onInvoiceEmit,functions:onRetentionEmit,functions:onDebitNoteEmit,functions:setupCompany
```

El script (~~`npx ts-node`~~: no hay `ts-node` en el repo), sin claves, con la sesión de
`gcloud`:

```bash
# desde saas_facturacion_web_JDC/
gcloud auth application-default login
functions/node_modules/.bin/tsc scripts/seed-establishments.ts --outDir /tmp/seed \
  --rootDir . --module commonjs --target es2020 --esModuleInterop --skipLibCheck
NODE_PATH=functions/node_modules node /tmp/seed/scripts/seed-establishments.js           # en seco
NODE_PATH=functions/node_modules node /tmp/seed/scripts/seed-establishments.js --apply   # escribe
```

> `createAndEmitInvoice` (emisión por API) sigue usando `company.sri.establishment`:
> mismo contador y mismo formato de clave que la web —no choca—, pero siempre emite desde
> la matriz. Bitácora completa:
> `App_AdminWeb_Conectate/weworkscloud/docs/BITACORA_INTEGRACION.md` (2026-09-22).

### 12.5 Configuración email por empresa (faltantes en SriCompanyConfig)

| Campo | Para qué sirve |
|-------|----------------|
| `emailReplyTo` | Reply-to del emisor en emails de comprobantes |
| `emailFooter` | Pie personalizado del email (leyenda legal, redes sociales) |
| `emailCcAccounting` | CC fijo al área contable |

---

## 13. Plan de acción priorizado — Sprints pendientes

### SPRINT 1 — Correcciones críticas (antes de pruebas SRI reales)

| # | Tarea | Agente | Archivo(s) | Estado |
|---|-------|--------|------------|--------|
| 1.1 | Corregir fallback `sriCode: '3'` → `'4'` para IVA 15% | **Cloud Functions Agent** | `functions/src/invoices/generate-invoice-xml.ts:180` | ✅ |
| 1.2 | Crear `sign-xml-helper.ts` unificado con C14N real (attr sort + ns heredados) | **Cloud Functions Agent** | `functions/src/utils/sign-xml-helper.ts` | ✅ |
| 1.3 | Refactorizar `sign-xml.ts`, `on-retention-emit.ts`, `on-debit-note-emit.ts` para usar helper | **Cloud Functions Agent** | 3 archivos | ✅ |
| 1.4 | Implementar Google Secret Manager para password del .p12 por empresa | **Cloud Functions Agent** + **DevOps Agent** | `functions/src/utils/cert-helper.ts` (nuevo), IAM roles | 🔴 Pendiente |
| 1.5 | Corregir estructura XML retención: eliminar `<impuestos>` raíz, mover a `<docSustento><retenciones>` | **SRI Agent** | `functions/src/retentions/generate-retention-xml.ts` | ✅ |
| 1.6 | Omitir campos de comercio exterior cuando `pagoLocExt='01'`; corregir `codSustento` vs `codDocSustento`; versión `2.0.0` | **SRI Agent** | `functions/src/retentions/generate-retention-xml.ts` | ✅ |

### SPRINT 2 — Nota de crédito electrónica (codDoc=04) ✅ COMPLETADO

| # | Tarea | Archivo(s) | Estado |
|---|-------|------------|--------|
| 2.1 | Extender `Invoice` con `rectifiedInvoiceAuthNumber`, `rectifiedInvoiceDate`, `creditNoteMotivo` + `Company.sri.certPassword` | `invoice.interface.ts`, `company.interface.ts` | ✅ |
| 2.2 | Actualizar `createCreditNote()` + campo `creditNoteMotivo` en formulario + sección informativa NC en template | `invoices-list.component.ts`, `invoice-form.component.ts`, `.html` | ✅ |
| 2.3 | Crear `generate-credit-note-xml.ts` — `<notaCredito codDoc='04'>`, clave 49 dígitos, módulo 11 | `functions/src/invoices/generate-credit-note-xml.ts` | ✅ |
| 2.4 | Crear `generate-credit-note-pdf.ts` — RIDE NC con sección "Comprobante Modificado", azul `#1a4c94` | `functions/src/invoices/generate-credit-note-pdf.ts` | ✅ |
| 2.5 | Bifurcar `on-invoice-emit.ts`: `isCreditNote=true` → pipeline NC; agregar `creditNote` a `DOC_TYPE_CONFIGS` en `send-to-sri.ts` | `on-invoice-emit.ts`, `send-to-sri.ts` | ✅ |
| 2.6 | Crear `send-credit-note-email.ts` — email HTML al cliente tras autorización NC | `functions/src/invoices/send-credit-note-email.ts` | ✅ |
| 2.7 | Agregar `comprobanteRetencionVersion` a `SriPlatformConfig` + seed + UI super-admin | `platform-defaults.interface.ts`, `seed-defaults.ts`, `platform-sri-config.component.*` | ✅ |
| 2.8 | Exportar `generateCreditNoteXml`, `generateCreditNotePdf`, `sendCreditNoteEmail` en `index.ts` | `functions/src/index.ts` | ✅ |

### SPRINT 3 — Parametría faltante y robustez ✅ COMPLETADO

| # | Tarea | Archivo(s) | Estado |
|---|-------|------------|--------|
| 3.1 | Agregar `agenteRetencion`, `tipoContribuyente`, `regimenMicroempresa` a `SriCompanyConfig` + UI Settings pestaña SRI | `settings.interfaces.ts`, `company-settings.component.*` | ✅ |
| 3.2 | Agregar `emailReplyTo` a `SriCompanyConfig` + UI Settings | `settings.interfaces.ts`, `company-settings.component.*` | ✅ |
| 3.3 | Consumidor Final: botón C/F + `selectConsumidorFinal()` + computed `isConsumidorFinal` | `invoice-form.component.ts`, `.html` | ✅ |
| 3.4 | `codigoPrincipal` siempre presente en XML: fallback `line.productId ?? 'SIN-CODIGO'` | `generate-invoice-xml.ts`, `generate-credit-note-xml.ts` | ✅ |
| 3.5 | `unidadMedida` en `InvoiceLine` + XML factura y NC (default `'UNIDAD'`) | `invoice.interface.ts`, `generate-invoice-xml.ts`, `generate-credit-note-xml.ts` | ✅ |
| 3.6 | CF `downloadDocument` con Signed URL de 1h (reemplaza URLs estáticas de 7 días) | `functions/src/utils/download-document.ts` (nuevo) | ✅ |
| 3.7 | Counter por `{estab}_{pto}_{año}` en los 3 servicios CRUD (facturas, retenciones, N/D) | `invoices.service.ts`, `retentions.service.ts`, `debit-notes.service.ts` | ✅ |

### SPRINT 4 — Seguridad, tests y UX

| # | Tarea | Archivo(s) | Estado |
|---|-------|------------|--------|
| 4.1 | Reglas Firestore específicas para `retentions` y `debitNotes` — helpers `canReadFiscalDoc`, `canCreateFiscalDoc`, `sriAuthorizedGuard`, `statusNotRolledBack`, `onlyUiFields` | `firestore.rules` | ✅ |
| 4.2 | Tests unitarios: `calcularDigitoVerificador()`, `calcInvoiceTotals()`, `resolveTemplate()` | `functions/src/__tests__/` | 🔴 Pendiente |
| 4.3 | `skuAlt?: string` en `InvoiceLine` + `<codigoAdicional>` condicional en XML factura y NC | `invoice.interface.ts`, `generate-invoice-xml.ts`, `generate-credit-note-xml.ts` | ✅ |
| 4.4 | `<regimenMicroempresa>CONTRIBUYENTE</regimenMicroempresa>` condicional en `<infoFactura>` cuando empresa es microempresa | `generate-invoice-xml.ts` | ✅ |
| 4.5 | ISD (código `'6'`, pctCode `'4580'`, tasa fija 5%) en formulario de retenciones — optgroup + badge `danger` + campo rate readonly | `retention-form.component.*`, `retention.interface.ts` | ✅ |
| 4.6 | Alerta `c-alert` en Settings SRI: `danger` si vencido, `warning` si < 30 días — getters `certDaysLeft` y `certExpiryAlert` | `company-settings.component.*` | ✅ |

### SPRINT 5 — Módulos futuros

| # | Tarea | Agente | Estado |
|---|-------|--------|--------|
| 5.1 | Liquidación de compra (codDoc=03) — UI + XML SRI + trigger completo | **SRI Agent** + **Angular Agent** + **Cloud Functions Agent** | 🔴 Futuro |
| 5.2 | Guía de remisión (codDoc=06) — UI + XML SRI + trigger completo | **SRI Agent** + **Angular Agent** + **Cloud Functions Agent** | 🔴 Futuro |
| 5.3 | Búsqueda server-side en clientes y productos (Algolia o Firestore full-text index) | **Architecture Agent** + **Firebase Agent** | 🔴 Futuro |

---

### Orden recomendado de delegación de agentes

```
Sprint 1 (urgente):
  1. SRI Agent         → revisar y corregir estructura XML retención (B5, B6)
  2. Cloud Functions Agent → B1 (IVA sriCode), B3 (sign-xml-helper unificado), B4 (nota crédito backend)
  3. DevOps Agent      → Secret Manager setup + IAM roles para password .p12

Sprint 2 (nota de crédito):
  4. Business Agent    → extender Invoice interface con campos NC
  5. SRI Agent         → generar template XML <notaCredito codDoc='04'>
  6. Cloud Functions Agent → implementar generate-credit-note-xml.ts + orquestador
  7. Angular Agent     → actualizar createCreditNote() con nuevos campos
  8. Firebase Agent    → agregar comprobanteRetencionVersion a SriPlatformConfig + seed

Sprint 3 (parametría):
  9. Firebase Agent    → agregar campos SriCompanyConfig faltantes
  10. Angular Agent    → UI Settings para nuevos campos + lógica Consumidor Final
  11. Cloud Functions Agent → downloadDocument CF + corrección counters multi-establecimiento

Sprint 4 (calidad):
  12. Security Agent   → auditar y corregir Firestore rules
  13. Business Agent   → tests unitarios cálculos SRI
  14. Angular Agent    → alerta certificado + UI ISD retenciones
```

---

*Documento creado: 2026-04-08*  
*Última actualización: 2026-04-10 (v1.9) — Sprints 1–4 + pendientes completados · Avance 96%*  
*Mantenido por: CEO Agent · SaasFacturacion*
