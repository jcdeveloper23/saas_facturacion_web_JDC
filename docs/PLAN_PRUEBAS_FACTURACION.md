# Plan de Pruebas — Facturación Electrónica FacturaSec

**Proyecto:** facturasProEc  
**Ambiente SRI Pruebas:** `https://celcer.sri.gob.ec`  
**Fecha:** Abril 2026

---

## 1. Prerequisitos

### 1.1 Datos necesarios antes de empezar

| Ítem | Descripción |
|------|-------------|
| Certificado .p12 | Certificado de firma electrónica del BCE (entidad certificadora) o del SRI. Debe estar vigente. |
| RUC | RUC de la empresa de prueba (debe existir en el SRI) |
| Credenciales Firebase | Token de autenticación (idToken) de un usuario con rol `admin` |
| `companyId` | ID del tenant en Firestore |
| `companyId` super_admin | Para pruebas de setup |

### 1.2 Configuración previa en la plataforma

1. Crear empresa via `setupCompany` (o tener una ya creada)
2. Subir certificado .p12 via `uploadCertificate`
3. Configurar datos SRI en `companies/{companyId}/configuration/sri`:
   - `ruc`, `razonSocial`, `nombreComercial`
   - `direccionMatriz`, `direccionEstablecimiento`
   - `ambiente`: `"1"` (pruebas) o `"2"` (producción)
   - `tipoEmision`: `"1"` (normal)
   - `obligadoContabilidad`: `"SI"` o `"NO"`
   - Serie: `establecimiento` (001) + `puntoEmision` (001)
4. Crear al menos un cliente en `companies/{companyId}/customers`
5. Crear al menos un producto en `companies/{companyId}/products`

---

## 2. Flujo de Prueba — Factura Electrónica (Tipo 01)

### FASE 1: Creación del documento

**Test 2.1 — Crear factura borrador en Firestore**

Crear directamente en Firestore `companies/{companyId}/invoices/{invoiceId}` con:

```json
{
  "number": "001",
  "date": "2026-04-12",
  "status": "draft",
  "sriStatus": "pending",
  "customer": {
    "Name": "CLIENTE PRUEBA SRI",
    "TaxId": "1713175071001",
    "IdentificationType": "04",
    "Email": "prueba@email.com",
    "Address": "Quito, Ecuador"
  },
  "lines": [
    {
      "sku": "PROD001",
      "description": "Servicio de prueba",
      "quantity": 1,
      "unitPrice": 100.00,
      "discount": 0,
      "taxRate": 15,
      "lineTotal": 100.00,
      "taxAmount": 15.00
    }
  ],
  "subtotal": 100.00,
  "discount": 0,
  "taxableBase": 100.00,
  "vatAmount": 15.00,
  "total": 115.00,
  "paymentMethod": "01",
  "paymentDays": 0
}
```

**Resultado esperado:** Documento creado con `sriStatus: "pending"`

---

### FASE 2: Generación de XML

**Test 2.2 — generateInvoiceXml**

```
Función: generateInvoiceXml
Datos: { invoiceId, companyId }
```

**Validaciones:**
- [ ] Respuesta contiene `accessKey` de exactamente 49 dígitos
- [ ] `accessKey` tiene el dígito verificador correcto (módulo 11)
- [ ] `xmlUrl` apunta a un archivo válido en Cloud Storage
- [ ] `sriStatus` actualizado a `"xml_generated"` en Firestore
- [ ] `codigoNumerico` (8 dígitos) guardado en el documento
- [ ] XML descargable desde la URL, con estructura válida
- [ ] XML contiene `<factura>` con `id="comprobante"` y versión `2.1.0`
- [ ] Nodo `<infoTributaria>` contiene RUC correcto, ambiente `"1"`, tipoEmision `"1"`
- [ ] Nodo `<infoFactura>` contiene fecha, total, IVA correctos
- [ ] `<claveAcceso>` en el XML coincide con `accessKey` retornado

**Casos de error:**
- [ ] `invoiceId` inexistente → `not-found`
- [ ] Sin permisos (companyId diferente) → `permission-denied`
- [ ] Sin configuración SRI → error descriptivo

---

### FASE 3: Firma Electrónica

**Test 2.3 — signXml**

```
Función: signXml
Datos: { invoiceId, companyId }
```

**Validaciones:**
- [ ] Respuesta contiene `signedXmlUrl`
- [ ] `sriStatus` actualizado a `"signed"`
- [ ] XML firmado descargable
- [ ] XML firmado contiene nodo `<ds:Signature>` o `<xades:QualifyingProperties>`
- [ ] Firma usa certificado correcto (thumbprint coincide)

**Casos de error:**
- [ ] Certificado no subido → error descriptivo con instrucciones
- [ ] Certificado expirado → error con fecha de expiración
- [ ] Contraseña del .p12 incorrecta → `invalid-argument`

---

### FASE 4: Envío al SRI

**Test 2.4 — sendToSri (ambiente pruebas)**

```
Función: sendToSri
Datos: { invoiceId, companyId, documentType: "invoice" }
```

**Validaciones:**
- [ ] SRI responde con estado `"RECIBIDA"` inicialmente
- [ ] Función consulta autorización automáticamente
- [ ] `sriStatus` actualizado a `"authorized"` o `"rejected"`
- [ ] Si autorizado:
  - [ ] `authorizationNumber` (49 dígitos) guardado
  - [ ] `authorizedAt` (fecha/hora) guardado
- [ ] Si rechazado:
  - [ ] `sriError` contiene mensaje descriptivo del SRI
  - [ ] `sriStatus: "rejected"`

**Casos de error:**
- [ ] XML no firmado (`sriStatus != "signed"`) → error descriptivo
- [ ] URL SRI no disponible → timeout controlado
- [ ] Clave de acceso duplicada → mensaje del SRI manejado

---

### FASE 5: Consulta de Estado

**Test 2.5 — checkSriStatus**

```
Función: checkSriStatus
Datos: { invoiceId, companyId, documentType: "invoice" }
```

**Validaciones:**
- [ ] Retorna `sriStatus` actualizado
- [ ] Si autorizado: `authorizationNumber` presente
- [ ] `estado` y `mensaje` del SRI incluidos en respuesta
- [ ] Firestore actualizado con el estado más reciente

---

### FASE 6: Generación de PDF (RIDE)

**Test 2.6 — generatePdf**

```
Función: generatePdf
Datos: { invoiceId, companyId }
```

**Validaciones:**
- [ ] Respuesta contiene `pdfUrl`
- [ ] PDF descargable desde la URL
- [ ] PDF contiene número de autorización si está autorizado
- [ ] PDF contiene código QR con clave de acceso
- [ ] Datos del emisor y receptor correctos en el RIDE
- [ ] Totales (subtotal, IVA, total) correctos

---

### FASE 7: Envío por Email

**Test 2.7 — sendInvoiceEmail**

```
Función: sendInvoiceEmail
Datos: { invoiceId, companyId }
```

**Validaciones:**
- [ ] Respuesta `{ sent: true, to: "email@cliente.com" }`
- [ ] Email recibido en bandeja
- [ ] Email contiene enlace al PDF
- [ ] Email contiene enlace al XML
- [ ] `emailSent: true` en Firestore

---

## 3. Flujo de Prueba — Nota de Crédito (Tipo 04)

### Prerequisito
Necesitas una factura **autorizada** para referenciar.

**Test 3.1 — Crear nota de crédito en Firestore**

```json
{
  "date": "2026-04-12",
  "status": "draft",
  "sriStatus": "pending",
  "rectifiedInvoiceNumber": "001-001-000000001",
  "rectifiedInvoiceDate": "2026-04-10",
  "rectifiedInvoiceAuthNumber": "{authorizationNumber_de_factura}",
  "creditNoteMotivo": "Devolución de mercadería",
  "customer": { ... },
  "lines": [ ... ],
  "total": 115.00
}
```

**Test 3.2 — generateCreditNoteXml**
- [ ] XML con `codDoc: "04"`
- [ ] Nodo `<infoNotaCredito>` con `codDocModificado`, `numDocModificado`, `fechaEmisionDocSustento`
- [ ] `valorModificacion` correcto

**Test 3.3 — signXml** (mismo endpoint, maneja `creditNoteId`)
**Test 3.4 — sendToSri** con `documentType: "creditNote"` o por trigger
**Test 3.5 — generateCreditNotePdf** — RIDE con referencia a factura original
**Test 3.6 — sendCreditNoteEmail**

---

## 4. Flujo de Prueba — Nota de Débito (Tipo 05)

**Test 4.1 — Crear nota de débito en Firestore**

```json
{
  "date": "2026-04-12",
  "status": "draft",
  "sriStatus": "pending",
  "originalInvoiceNumber": "001-001-000000001",
  "originalInvoiceDate": "2026-04-10",
  "motivos": [
    { "razon": "Interés por mora", "valor": 10.00 }
  ],
  "totalSinImpuestos": 10.00,
  "vatPct": 15,
  "vatAmount": 1.50,
  "total": 11.50,
  "customer": { ... }
}
```

**Test 4.2 — generateDebitNoteXml**
- [ ] XML con `codDoc: "05"`
- [ ] Nodo `<infoNotaDebito>` con referencia a documento original
- [ ] `<motivos>` con lista de razones y valores

**Test 4.3 — signXml, sendToSri, generateDebitNotePdf, sendDebitNoteEmail**

---

## 5. Flujo de Prueba — Retención (Tipo 07)

**Test 5.1 — Crear retención en Firestore**

```json
{
  "number": "001",
  "date": "2026-04-12",
  "periodoFiscal": "04/2026",
  "status": "draft",
  "sriStatus": "pending",
  "supplierName": "PROVEEDOR SA",
  "supplierTaxId": "1713175071001",
  "supplierTaxIdType": "04",
  "supportDocType": "01",
  "supportDocNumber": "001-001-000000001",
  "supportDocDate": "2026-04-10",
  "supportDocTotal": 115.00,
  "taxes": [
    {
      "taxCode": "1",
      "pctCode": "327",
      "rate": 1,
      "taxableBase": 100.00,
      "retainedAmount": 1.00
    },
    {
      "taxCode": "2",
      "pctCode": "9",
      "rate": 10,
      "taxableBase": 100.00,
      "retainedAmount": 10.00
    }
  ],
  "totalRetained": 11.00
}
```

**Test 5.2 — generateRetentionXml**
- [ ] XML con `codDoc: "07"`
- [ ] Nodo `<docsSustento>` con `<docSustento>` y `<retenciones>`
- [ ] Códigos de retención correctos (IR y IVA)

**Test 5.3 — signXml, sendToSri, generateRetentionPdf, sendRetentionEmail**

---

## 6. Pruebas de Certificado

**Test 6.1 — uploadCertificate (certificado válido)**

```
Función: uploadCertificate
Datos: { companyId, certificateBase64: "base64...", password: "clave" }
```

- [ ] Retorna `thumbprint`, `subject`, `expiresAt`
- [ ] Archivo subido a `companies/{companyId}/certificates/signing.p12`
- [ ] Datos actualizados en `companies/{companyId}.sri`

**Test 6.2 — uploadCertificate (certificado expirado)**
- [ ] Error con mensaje claro sobre expiración

**Test 6.3 — uploadCertificate (contraseña incorrecta)**
- [ ] Error `invalid-argument`

**Test 6.4 — uploadCertificate (RUC no coincide)**
- [ ] Error indicando que el certificado no pertenece al RUC de la empresa

---

## 7. Pruebas de Clave de Acceso (Módulo 11)

Validar que `accessKey` de 49 dígitos cumple la estructura SRI:

```
[2 fecha_dia][2 fecha_mes][4 fecha_año][2 tipoComprobante][13 ruc]
[1 tipoAmbiente][3 serie_establecimiento][3 serie_puntoEmision]
[8 codigoNumerico][1 tipoEmision][1 dígito_verificador]
```

- [ ] Longitud exacta de 49 caracteres
- [ ] `tipoComprobante`: `01`=factura, `04`=NC, `05`=ND, `07`=retención
- [ ] `tipoAmbiente`: `1`=pruebas, `2`=producción
- [ ] Dígito verificador calculado con módulo 11 (pesos 2-7 cíclicos)
- [ ] `codigoNumerico` de 8 dígitos aleatorio distinto entre documentos

---

## 8. Pruebas de Seguridad y Permisos

| Test | Acción | Resultado Esperado |
|------|--------|-------------------|
| 8.1 | Llamar función sin token de auth | `unauthenticated` |
| 8.2 | Admin empresa A intenta acceder a empresa B | `permission-denied` |
| 8.3 | Usuario `viewer` intenta emitir factura | `permission-denied` |
| 8.4 | `super_admin` puede acceder a cualquier empresa | OK |
| 8.5 | Token expirado | `unauthenticated` |

---

## 9. Pruebas de Integridad de Datos

| Test | Validación |
|------|-----------|
| 9.1 | Total factura = subtotal + IVA - descuentos |
| 9.2 | IVA = base imponible × tasa IVA |
| 9.3 | Suma de líneas = subtotal |
| 9.4 | `codigoNumerico` único por documento en la empresa |
| 9.5 | Número de documento secuencial por serie |
| 9.6 | Fecha de nota de crédito >= fecha factura original |

---

## 10. Pruebas con Firebase Emulator (Desarrollo Local)

```bash
# Iniciar emuladores
firebase emulators:start

# Endpoints locales
http://localhost:5001/{projectId}/{region}/{functionName}

# Auth emulator
http://localhost:9099

# Firestore emulator
http://localhost:8080
```

Para tests locales, usa `Authorization: Bearer owner` como token en el emulador (modo permisivo).

---

## 11. Checklist Final antes de pasar a Producción

- [ ] Todos los flujos completos (factura, NC, ND, retención) autorizados en SRI pruebas
- [ ] PDFs con número de autorización correcto
- [ ] Emails recibidos con archivos adjuntos correctos
- [ ] Certificado de producción subido y verificado
- [ ] `ambiente` cambiado a `"2"` en configuración SRI
- [ ] Prueba completa del ciclo en producción con 1 documento real
- [ ] Backup de `.firebaserc` y reglas Firestore

---

*Última actualización: Abril 2026*
