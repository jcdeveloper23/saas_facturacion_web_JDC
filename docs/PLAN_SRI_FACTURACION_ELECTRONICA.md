# Plan Maestro — Facturación Electrónica SRI Ecuador
## SaasFacturacion · Angular 21 + Firebase Functions v2

**Versión:** 1.7  
**Última actualización:** 2026-04-10  
**Stack:** Angular 21 · CoreUI 5.x · Firebase (Firestore, Functions v2, Storage) · Node.js 20 · node-forge  
**Referencia normativa:** Resolución NAC-DGERCGC16-00000247 · WSDL SRI Ecuador

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
  direccionEstablecimiento: string;   // Dirección del establecimiento emisor
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
| Versión schema XML | `/platform/defaults/sriConfig.facturaVersion` | SRI sube de 1.0.0 a 2.0.0 |
| Tabla taxCodes | `/platform/defaults/sriConfig.taxCodes` | SRI agrega nueva tasa (ej. 8%) |
| Formas de pago | `/platform/defaults/sriConfig.paymentMethodCodes` | SRI agrega nuevo código |
| Campos adicionales XML | `/companies/{id}/configuration/sri.additionalInfoFields` | Empresa quiere mostrar su web en el PDF |
| Ambiente testing/prod | `Company.sri.environment` | Empresa pasa a producción |
| Razón social en XML | `/companies/{id}/configuration/sri.razonSocial` | Empresa cambia nombre comercial |

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

---

## 8. Pendientes no-SRI

| # | Bug/Mejora | Impacto | Estado |
|---|-----------|---------|--------|
| P1 | `selectedCustomer` null al cargar factura existente | Bajo | ✅ Resuelto (8.8) |
| P2 | `paymentMethods` solo 1 método por factura | Medio | ✅ Resuelto (8.7) |
| P3 | Sin validación de cliente en edición de borrador | Bajo | ✅ Resuelto — guard `!selectedCustomer()` sin `isNew()` |
| P4 | Búsqueda client-side — lenta con +5000 registros | Medio | 🔴 Futuro |
| P5 | Sin tests unitarios en cálculos ni validadores | Alto | 🔴 Sprint dedicado |
| P6 | `updatedBy` faltante en operaciones de update | Bajo | ✅ Resuelto — `invoices.service.ts` + `Invoice.updatedBy?` |
| P7 | Notas de Crédito sin UI | Alto | ✅ Resuelto (8.5) |

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
    └── smtp-helper.ts                 ✅ Lee SMTP de Firestore (cache 5 min) o env vars; createSmtpTransporter/getSmtpFrom
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
| Factura de venta | `01` | `invoices/` | `generate-invoice-xml.ts` | `on-invoice-emit.ts` | ✅ |
| Nota de crédito | `04` | `invoices/` (createCreditNote en lista) | — | `on-invoice-emit.ts` | ✅ |
| Nota de débito | `05` | `debit-notes/` | `generate-debit-note-xml.ts` | `on-debit-note-emit.ts` | ✅ |
| Comprobante de retención | `07` | `retentions/` | `generate-retention-xml.ts` | `on-retention-emit.ts` | ✅ |
| Liquidación de compra | `03` | — | — | — | 🔴 Futuro |
| Guía de remisión | `06` | — | — | — | 🔴 Futuro |

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

| # | Ítem | Prioridad |
|---|------|-----------|
| R1 | PDF/RIDE para retenciones (pdfkit) | Media |
| R2 | PDF/RIDE para notas de débito (pdfkit) | Media |
| R3 | Email al proveedor tras retención autorizada | Baja |
| R4 | Links en sidebar navegación (`default-layout`) | Alta — pendiente conectar |
| R5 | Agregar `retentions` y `debitNotes` al `DocumentSeries` de Settings | Media |

---

*Documento creado: 2026-04-08*  
*Última actualización: 2026-04-09 (v1.5)*  
*Mantenido por: CEO Agent · SaasFacturacion*
