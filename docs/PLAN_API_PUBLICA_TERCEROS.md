# Plan de Implementación — API Pública para Terceros
## SaasFacturacion — Web Services de Integración

**Versión:** 1.0
**Fecha:** 2026-08-19
**Branch:** developFacturasEc
**Stack:** Angular 21 · Firebase Cloud Functions v2 · Firestore · Node.js 20
**Fase del proyecto:** F5+ (se apoya en lógica SRI ya implementada en F5)

---

## Indice

1. [Arquitectura General](#1-arquitectura-general)
2. [Modelo de Autenticacion JWT para Terceros](#2-modelo-de-autenticacion-jwt-para-terceros)
3. [Modelo de Datos Firestore](#3-modelo-de-datos-firestore)
4. [Endpoints a Implementar](#4-endpoints-a-implementar)
5. [Cloud Functions a Crear o Modificar](#5-cloud-functions-a-crear-o-modificar)
6. [Estructura de Carpetas](#6-estructura-de-carpetas)
7. [Plan de Implementacion por Fases y Agentes](#7-plan-de-implementacion-por-fases-y-agentes)
8. [Consideraciones de Seguridad Criticas](#8-consideraciones-de-seguridad-criticas)
9. [Especificacion OpenAPI/Swagger](#9-especificacion-openapiswagger)

---

## 1. Arquitectura General

### Diagrama de capas

```
Tercero (cliente API)
        |
        |  HTTPS  (Bearer JWT)
        v
+----------------------------------+
|  API Gateway Layer               |
|  Cloud Functions v2 HTTP         |
|  functions/src/api-public/       |
|                                  |
|  - JWT middleware                |
|  - Rate limiter                  |
|  - Audit logger                  |
|  - Request validator             |
+----------------------------------+
        |
        | Llama internals ya existentes
        v
+----------------------------------+
|  Existing SRI Pipeline           |
|  generateInvoiceXmlInternal()    |
|  signXmlInternal()               |
|  sendToSriInternal()             |
|  generatePdfInternal()           |
|  generateCreditNoteXmlInternal() |
|  generateDebitNoteXmlInternal()  |
|  Journal Entry functions         |
+----------------------------------+
        |
        v
+----------------------------------+
|  Firestore + Firebase Storage    |
|  companies/{companyId}/...       |
|  platform/api_clients/...        |
+----------------------------------+
```

### Principios de diseno

1. **El gateway NO reimplementa logica SRI.** Llama directamente a las funciones internas (`*Internal`) ya existentes y probadas. Esto elimina duplicacion de codigo.
2. **Multi-tenant estricto.** Cada request de un tercero con empresa registrada opera UNICAMENTE sobre su `companyId`. Un tercero sin empresa registrada tiene un `companyId` virtual asignado al crear sus credenciales.
3. **Operacion sincrona con timeout configurable.** Las APIs HTTP esperan el resultado completo del pipeline SRI (XML + firma + envio + PDF) dentro de un unico request, con timeout maximo de 60 segundos. Si el SRI tarda mas, la API responde con `status: processing` y un `documentId` para polling.
4. **Sin nueva infra.** Todo corre en Firebase Cloud Functions v2. No se necesita Express server dedicado, API Gateway de GCP, ni Pub/Sub.
5. **OpenAPI generado desde codigo.** El archivo `openapi.yaml` se genera automaticamente al hacer deploy, para que siempre este sincronizado con la implementacion real.

### Dos tipos de terceros

| Tipo | Descripcion | companyId | Aislamiento |
|------|-------------|-----------|-------------|
| **Tenant-linked** | Empresa ya registrada en el SaaS. El dueno del tenant genera credenciales API para integrarse con su propio ERP o sistema externo. | El mismo `companyId` del tenant | Comparte datos con el tenant — el tercero VE los documentos del tenant |
| **Standalone** | Empresa que usa el servicio SOLO como API (no tiene acceso al frontend). Se le crea un `companyId` virtual con configuracion SRI propia. | `companyId` virtual creado al registrar el cliente API | Datos completamente aislados en su propio tenant virtual |

---

## 2. Modelo de Autenticacion JWT para Terceros

### Por que JWT propio y no Firebase Auth directamente

Firebase Auth esta disenado para usuarios humanos con sesiones. Los clientes API de terceros necesitan:
- Autenticacion machine-to-machine (M2M)
- Tokens de larga duracion (dias/semanas, no 1 hora)
- Revocacion inmediata sin invalidar sesiones de usuarios humanos
- Rate limiting por `clientId`
- Rotacion de secretos sin downtime

Por eso se emiten JWTs propios firmados con un secret almacenado en Firebase Secret Manager (o en Firestore cifrado con KMS), no con Firebase Auth tokens.

### Flujo de autenticacion

```
1. Tercero llama POST /api/v1/auth/token
   Body: { clientId, clientSecret }

2. API Gateway valida clientId/clientSecret en Firestore
   (coleccion platform/api_clients/{clientId})

3. Si valido:
   - Genera JWT firmado con HS256
     Payload: { sub: clientId, companyId, scopes[], iat, exp }
   - Registra lastTokenIssuedAt en Firestore
   - Retorna: { accessToken, expiresIn, tokenType: 'Bearer' }

4. Tercero incluye en cada request:
   Authorization: Bearer <accessToken>

5. JWT middleware valida en cada endpoint:
   - Firma valida (HS256 con JWT_SECRET de Secret Manager)
   - No expirado
   - clientId no en lista negra (campo revokedAt en Firestore)
   - companyId del token coincide con el recurso solicitado
```

### Estructura del JWT

```json
{
  "header": {
    "alg": "HS256",
    "typ": "JWT"
  },
  "payload": {
    "sub": "client_abc123",
    "companyId": "company_xyz",
    "clientType": "tenant_linked" | "standalone",
    "scopes": ["invoices:write", "credit_notes:write", "debit_notes:write", "accounting:read"],
    "iat": 1755561600,
    "exp": 1755648000,
    "jti": "uuid-unico-por-token"
  }
}
```

### Emision, renovacion y revocacion

| Operacion | Endpoint | Quien puede | Efecto |
|-----------|----------|-------------|--------|
| Emitir token | POST /api/v1/auth/token | El tercero con clientId+secret | Genera JWT con TTL configurable (default 24h, max 30d) |
| Renovar token | POST /api/v1/auth/refresh | El tercero con token vigente (min 5 min antes de expirar) | Genera nuevo JWT, invalida el anterior por `jti` |
| Revocar token | POST /api/v1/auth/revoke | El tercero (auto-revocacion) o admin via panel Angular | Agrega `jti` a coleccion `revokedTokens`, token rechazado inmediatamente |
| Revocar cliente | PUT /api/v1/admin/clients/{clientId}/revoke | Solo super_admin via panel Angular | Setea `revokedAt` en `api_clients/{clientId}`, todos los tokens del cliente quedan invalidos |

### Scopes disponibles

```
invoices:write          Emitir facturas electronicas
invoices:read           Consultar facturas (estado SRI, XML, PDF)
credit_notes:write      Emitir notas de credito
credit_notes:read       Consultar notas de credito
debit_notes:write       Emitir notas de debito
debit_notes:read        Consultar notas de debito
retentions:write        Emitir retenciones
retentions:read         Consultar retenciones
accounting:read         Consultar asientos contables
accounting:write        Generar asientos manuales
webhooks:manage         Configurar webhooks de notificacion
```

---

## 3. Modelo de Datos Firestore

### 3.1 Coleccion `platform/api_clients/{clientId}`

Documento raiz del cliente API. Existe UNA vez por cliente, independiente de cuantos tokens haya emitido.

```typescript
interface ApiClient {
  clientId: string;                     // PK, igual al doc ID. Prefijo: "client_"
  clientSecretHash: string;             // bcrypt hash del secret. NUNCA almacenar el secret en claro.
  clientType: 'tenant_linked' | 'standalone';
  companyId: string;                    // tenant existente o virtual
  name: string;                         // nombre descriptivo del cliente
  contactEmail: string;
  scopes: string[];                     // scopes habilitados para este cliente
  status: 'active' | 'suspended' | 'revoked';
  revokedAt?: FirebaseFirestore.Timestamp;
  revokedReason?: string;
  createdAt: FirebaseFirestore.Timestamp;
  createdBy: string;                    // uid del admin que lo creo (o 'system' para standalone)
  updatedAt: FirebaseFirestore.Timestamp;

  // Rate limiting
  rateLimits: {
    requestsPerMinute: number;          // default: 60
    requestsPerDay: number;             // default: 5000
    concurrentRequests: number;         // default: 5
  };

  // Config de respuesta
  responseConfig: {
    includeXml: boolean;                // default: true
    includePdf: boolean;                // default: true
    includeSriDetails: boolean;         // default: true — claveAcceso, numero auth, fecha, estado
    xmlEncoding: 'base64' | 'raw';      // default: 'base64'
    webhookUrl?: string;                // URL para notificaciones async
    webhookSecret?: string;             // HMAC secret para validar payload del webhook
  };

  // Metadata de uso
  lastTokenIssuedAt?: FirebaseFirestore.Timestamp;
  totalRequestsAllTime: number;
}
```

**Path Firestore:** `platform/api_clients/{clientId}`

**Por que en `platform/` y no en `companies/`:** Los clientes API son entidades de la plataforma, no de un tenant especifico. El super_admin los gestiona desde el panel central. Aun cuando el `clientType` sea `tenant_linked`, el API client en si es un recurso de plataforma.

### 3.2 Coleccion `platform/api_usage/{clientId}/requests/{requestId}`

Registro de cada llamada. Se usa para rate limiting, auditoria y facturacion de uso.

```typescript
interface ApiRequest {
  requestId: string;                    // doc ID
  clientId: string;
  companyId: string;
  endpoint: string;                     // ej: 'POST /api/v1/invoices'
  method: string;
  ipAddress: string;
  userAgent?: string;
  requestedAt: FirebaseFirestore.Timestamp;
  respondedAt?: FirebaseFirestore.Timestamp;
  durationMs?: number;
  httpStatus: number;
  success: boolean;
  errorCode?: string;                   // ej: 'SRI_REJECTED', 'VALIDATION_ERROR'
  errorMessage?: string;
  // Referencia al documento creado (si aplica)
  resultDocumentType?: 'invoice' | 'credit_note' | 'debit_note' | 'retention';
  resultDocumentId?: string;
  resultSriStatus?: string;
}
```

**Path Firestore:** `platform/api_usage/{clientId}/requests/{requestId}`

**Nota de rendimiento:** Para rate limiting en tiempo real se usa un documento de ventana deslizante en `platform/api_rate_limits/{clientId}` (actualizado con transaccion en cada request), no la coleccion de logs. La coleccion de logs es solo para auditoria y reportes.

### 3.3 Documento `platform/api_rate_limits/{clientId}` (ventana deslizante)

```typescript
interface ApiRateLimitWindow {
  clientId: string;
  minuteWindowStart: FirebaseFirestore.Timestamp;
  minuteCount: number;
  dayWindowStart: FirebaseFirestore.Timestamp;
  dayCount: number;
  updatedAt: FirebaseFirestore.Timestamp;
}
```

### 3.4 Coleccion `platform/revoked_tokens/{jti}`

Lista negra de JTIs revocados. Se consulta en cada request para validacion rapida.

```typescript
interface RevokedToken {
  jti: string;                          // doc ID
  clientId: string;
  revokedAt: FirebaseFirestore.Timestamp;
  reason: 'manual' | 'rotation' | 'security';
  expiresAt: FirebaseFirestore.Timestamp; // cuando se puede eliminar el registro (= exp del JWT)
}
```

TTL automatico: una Cloud Function schedulada limpia los JTIs cuyo `expiresAt` ya paso.

### 3.5 Tenant virtual para clientes Standalone

Para clientes `standalone`, se crea un documento en `companies/{virtualCompanyId}` con la misma estructura que un tenant normal, mas un flag:

```typescript
// Dentro del documento companies/{virtualCompanyId}
{
  ...camposNormalesDeTenant,
  isApiVirtualTenant: true,
  apiClientId: 'client_xxx',            // referencia bidireccional
}
```

Los documentos de facturas, notas de credito, etc. de estos tenants virtuales viven en `companies/{virtualCompanyId}/invoices/...` exactamente igual que un tenant normal. Esto reutiliza todo el pipeline SRI sin modificaciones.

---

## 4. Endpoints a Implementar

**Base URL:** `https://us-central1-facturasproec.cloudfunctions.net/api`

**Convencion de versionado:** `/api/v1/...`

**Content-Type:** `application/json` en todos los endpoints.

**Autenticacion:** `Authorization: Bearer <token>` en todos los endpoints excepto `/auth/token`.

---

### 4.1 Autenticacion

#### POST /api/v1/auth/token

Genera un access token para un cliente API.

**Request:**
```json
{
  "clientId": "client_abc123",
  "clientSecret": "sk_live_xxxxxxxxxxxxxxxx",
  "expiresInSeconds": 86400
}
```

**Response 200:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiJ9...",
  "tokenType": "Bearer",
  "expiresIn": 86400,
  "expiresAt": "2026-08-20T12:00:00Z",
  "scopes": ["invoices:write", "invoices:read", "credit_notes:write"]
}
```

**Response 401:**
```json
{
  "error": "INVALID_CREDENTIALS",
  "message": "clientId o clientSecret invalidos"
}
```

---

#### POST /api/v1/auth/refresh

Renueva el token antes de que expire.

**Request:** (no body, el token actual va en Authorization header)

**Response 200:** igual que `/auth/token` pero con nuevo token y el anterior invalidado.

---

#### POST /api/v1/auth/revoke

Revoca el token actual o uno especifico por JTI.

**Request:**
```json
{
  "jti": "uuid-del-token-a-revocar"
}
```

---

### 4.2 Facturas Electronicas

#### POST /api/v1/invoices

Emite una factura electronica completa (genera XML, firma, envia al SRI, genera RIDE PDF).

**Scope requerido:** `invoices:write`

**Request:**
```json
{
  "date": "2026-08-19",
  "customer": {
    "taxId": "0912345678001",
    "taxIdType": "RUC",
    "name": "EMPRESA CLIENTE SA",
    "email": "cliente@empresa.com",
    "address": "Av. Patria 100, Quito"
  },
  "lines": [
    {
      "sku": "PROD-001",
      "description": "Producto de ejemplo",
      "quantity": 2,
      "unitPrice": 10.00,
      "discountPct": 0,
      "vatPct": 15
    }
  ],
  "paymentMethods": [
    {
      "code": "01",
      "name": "SIN UTILIZACION DEL SISTEMA FINANCIERO",
      "amount": 23.00,
      "deadline": 0,
      "timeUnit": "dias"
    }
  ],
  "notes": "Factura de prueba via API",
  "responseFields": ["xml", "pdf", "sri_details"]
}
```

**Campo `responseFields` (todos opcionales, default: todos incluidos):**
- `"xml"` — incluye el XML autorizado en base64 (o raw segun config del cliente)
- `"pdf"` — incluye URL del RIDE PDF en Firebase Storage (publica por 7 dias)
- `"sri_details"` — incluye claveAcceso, numeroAutorizacion, fechaAutorizacion, ambiente
- `"document_id"` — incluye el ID interno Firestore del documento

**Response 200 (SRI autorizo):**
```json
{
  "success": true,
  "status": "authorized",
  "documentId": "inv_abc123",
  "fullNumber": "001-001-000000042",
  "sri": {
    "claveAcceso": "1908202601093012345678001120010010000000421234567811",
    "numeroAutorizacion": "1908202601093012345678001120010010000000421234567811",
    "fechaAutorizacion": "2026-08-19T15:30:00-05:00",
    "ambiente": "PRODUCCION",
    "estado": "AUTORIZADO"
  },
  "xml": {
    "encoding": "base64",
    "content": "PD94bWwgdmVyc2lvbj0iMS4wIi..."
  },
  "pdf": {
    "url": "https://storage.googleapis.com/facturasproec.appspot.com/companies/.../pdf/inv_abc123.pdf",
    "expiresAt": "2026-08-26T15:30:00Z"
  }
}
```

**Response 200 (SRI rechazo):**
```json
{
  "success": false,
  "status": "rejected",
  "documentId": "inv_abc123",
  "fullNumber": "001-001-000000043",
  "sri": {
    "claveAcceso": "...",
    "estado": "DEVUELTA",
    "mensajes": [
      {
        "identificador": "35",
        "mensaje": "ARCHIVO NO CUMPLE ESTRUCTURA XML",
        "informacionAdicional": "...",
        "tipo": "ERROR"
      }
    ]
  },
  "xml": { "encoding": "base64", "content": "..." }
}
```

**Response 202 (procesando — timeout SRI):**
```json
{
  "success": null,
  "status": "processing",
  "documentId": "inv_abc123",
  "pollUrl": "/api/v1/invoices/inv_abc123"
}
```

---

#### GET /api/v1/invoices/{documentId}

Consulta el estado y datos de una factura previamente emitida.

**Scope requerido:** `invoices:read`

**Response 200:** igual que el response de POST pero con campo `status` actualizado.

---

#### GET /api/v1/invoices

Lista facturas del cliente con paginacion.

**Query params:**
- `limit` (default: 20, max: 100)
- `startAfter` (cursor de paginacion — `documentId` del ultimo elemento)
- `status` (filtro: `authorized` | `rejected` | `processing`)
- `dateFrom`, `dateTo` (formato: YYYY-MM-DD)

**Response 200:**
```json
{
  "items": [ /* array de facturas resumidas */ ],
  "total": 142,
  "nextCursor": "inv_xyz"
}
```

---

### 4.3 Notas de Credito

#### POST /api/v1/credit-notes

Emite una nota de credito electronica.

**Scope requerido:** `credit_notes:write`

**Request:**
```json
{
  "date": "2026-08-19",
  "originalInvoiceNumber": "001-001-000000042",
  "originalInvoiceDate": "2026-08-15",
  "originalInvoiceAccessKey": "...",
  "reason": "DEVOLUCION DE MERCADERIA",
  "customer": {
    "taxId": "0912345678001",
    "taxIdType": "RUC",
    "name": "EMPRESA CLIENTE SA"
  },
  "lines": [
    {
      "sku": "PROD-001",
      "description": "Devolucion parcial — Producto de ejemplo",
      "quantity": 1,
      "unitPrice": 10.00,
      "vatPct": 15
    }
  ],
  "responseFields": ["xml", "pdf", "sri_details"]
}
```

**Response:** misma estructura que facturas, `status` puede ser `authorized` | `rejected` | `processing`.

---

#### GET /api/v1/credit-notes/{documentId}

Consulta estado de una nota de credito.

**Scope requerido:** `credit_notes:read`

---

#### GET /api/v1/credit-notes

Lista notas de credito con paginacion.

---

### 4.4 Notas de Debito

#### POST /api/v1/debit-notes

Emite una nota de debito electronica.

**Scope requerido:** `debit_notes:write`

**Request:**
```json
{
  "date": "2026-08-19",
  "originalInvoiceNumber": "001-001-000000042",
  "originalInvoiceDate": "2026-08-15",
  "originalInvoiceAccessKey": "...",
  "customer": {
    "taxId": "0912345678001",
    "taxIdType": "RUC",
    "name": "EMPRESA CLIENTE SA"
  },
  "motivos": [
    {
      "razon": "INTERESES POR MORA",
      "valor": 15.00
    }
  ],
  "vatPct": 15,
  "responseFields": ["xml", "pdf", "sri_details"]
}
```

---

#### GET /api/v1/debit-notes/{documentId}
#### GET /api/v1/debit-notes

Misma convencion que facturas y notas de credito.

---

### 4.5 Retenciones

#### POST /api/v1/retentions

Emite una retencion electronica.

**Scope requerido:** `retentions:write`

**Request:**
```json
{
  "date": "2026-08-19",
  "supplier": {
    "taxId": "0912345678001",
    "taxIdType": "RUC",
    "name": "PROVEEDOR SA"
  },
  "originalDocumentNumber": "001-001-000000010",
  "originalDocumentDate": "2026-08-15",
  "retenciones": [
    {
      "codigo": "303",
      "codigoRetencion": "303",
      "descripcion": "Honorarios profesionales",
      "porcentaje": 10,
      "baseImponible": 100.00,
      "valorRetenido": 10.00
    }
  ],
  "responseFields": ["xml", "pdf", "sri_details"]
}
```

---

#### GET /api/v1/retentions/{documentId}
#### GET /api/v1/retentions

---

### 4.6 Contabilidad

#### GET /api/v1/accounting/journal-entries

Lista asientos contables del periodo.

**Scope requerido:** `accounting:read`

**Query params:**
- `period` (formato: YYYY-MM, ej: `2026-08`)
- `limit`, `startAfter`

**Response 200:**
```json
{
  "items": [
    {
      "entryId": "je_abc",
      "date": "2026-08-19",
      "reference": "FAC 001-001-000000042",
      "description": "Venta de mercaderia",
      "lines": [
        { "account": "1101", "accountName": "Caja", "debit": 23.00, "credit": 0 },
        { "account": "4101", "accountName": "Ventas", "debit": 0, "credit": 20.00 },
        { "account": "2201", "accountName": "IVA Ventas 15%", "debit": 0, "credit": 3.00 }
      ],
      "sourceType": "invoice",
      "sourceDocumentId": "inv_abc123"
    }
  ],
  "total": 87,
  "nextCursor": "je_xyz"
}
```

---

#### GET /api/v1/accounting/journal-entries/{entryId}

Detalle de un asiento contable.

---

#### POST /api/v1/accounting/journal-entries

Crea un asiento contable manual.

**Scope requerido:** `accounting:write`

**Request:**
```json
{
  "date": "2026-08-19",
  "description": "Asiento de ajuste manual",
  "lines": [
    { "account": "1101", "debit": 100.00, "credit": 0, "description": "Caja" },
    { "account": "3101", "debit": 0, "credit": 100.00, "description": "Capital" }
  ]
}
```

---

### 4.7 Webhooks

#### PUT /api/v1/webhooks/config

Configura el endpoint de webhook del cliente.

**Scope requerido:** `webhooks:manage`

**Request:**
```json
{
  "url": "https://mi-sistema.com/webhooks/facturacion",
  "secret": "mi_webhook_secret_32chars_minimo",
  "events": ["invoice.authorized", "invoice.rejected", "credit_note.authorized", "debit_note.authorized"]
}
```

**Payload que se envia al webhook (POST al URL del cliente):**
```json
{
  "event": "invoice.authorized",
  "timestamp": "2026-08-19T15:30:00Z",
  "data": {
    /* mismo objeto de respuesta del endpoint POST /invoices */
  }
}
```

El payload se firma con `X-Webhook-Signature: sha256=<hmac>` para que el cliente pueda validar autenticidad.

---

### 4.8 Estado del sistema

#### GET /api/v1/health

Sin autenticacion. Retorna el estado del servicio y conectividad con SRI.

**Response 200:**
```json
{
  "status": "ok",
  "version": "1.0.0",
  "sri": {
    "testing": "reachable",
    "production": "reachable"
  },
  "timestamp": "2026-08-19T15:30:00Z"
}
```

---

## 5. Cloud Functions a Crear o Modificar

### 5.1 Nuevas Cloud Functions — Modulo `api-public`

Todas son HTTP Functions (v2) exportadas desde `functions/src/api-public/index.ts`.

| Funcion | Archivo | Descripcion |
|---------|---------|-------------|
| `apiAuth` | `api-public/auth/api-auth.ts` | Maneja POST /auth/token, /auth/refresh, /auth/revoke |
| `apiInvoices` | `api-public/invoices/api-invoices.ts` | CRUD de facturas via API publica |
| `apiCreditNotes` | `api-public/credit-notes/api-credit-notes.ts` | CRUD de notas de credito |
| `apiDebitNotes` | `api-public/debit-notes/api-debit-notes.ts` | CRUD de notas de debito |
| `apiRetentions` | `api-public/retentions/api-retentions.ts` | CRUD de retenciones |
| `apiAccounting` | `api-public/accounting/api-accounting.ts` | Consulta y creacion de asientos |
| `apiWebhooks` | `api-public/webhooks/api-webhooks.ts` | Config de webhooks |
| `apiHealth` | `api-public/health/api-health.ts` | Health check |
| `cleanExpiredTokens` | `api-public/scheduled/clean-expired-tokens.ts` | Scheduled: limpia JTIs expirados de `revoked_tokens` |
| `dispatchWebhook` | `api-public/webhooks/dispatch-webhook.ts` | Firestore trigger: envia webhook cuando cambia sriStatus |
| `openApiSpec` | `api-public/docs/openapi-spec.ts` | GET /api/v1/docs — sirve el archivo openapi.yaml |

### 5.2 Shared Middleware (usada por todas las HTTP Functions)

| Archivo | Responsabilidad |
|---------|-----------------|
| `api-public/middleware/jwt-middleware.ts` | Valida JWT, extrae `clientId` y `companyId`, verifica scopes |
| `api-public/middleware/rate-limiter.ts` | Verifica y actualiza ventana deslizante en Firestore |
| `api-public/middleware/audit-logger.ts` | Escribe el registro en `platform/api_usage/` |
| `api-public/middleware/request-validator.ts` | Valida schema JSON del request body |
| `api-public/middleware/cors.ts` | Headers CORS configurables por cliente |

### 5.3 Funciones internas existentes — NO se modifican

Las siguientes funciones ya existen y NO deben cambiar. El modulo `api-public` las importa directamente:

```typescript
import { generateInvoiceXmlInternal }    from '../invoices/generate-invoice-xml';
import { generateCreditNoteXmlInternal } from '../invoices/generate-credit-note-xml';
import { generateDebitNoteXmlInternal }  from '../debit-notes/generate-debit-note-xml';
import { signXmlInternal }               from '../invoices/sign-xml';
import { sendToSriInternal }             from '../invoices/send-to-sri';
import { generatePdfInternal }           from '../invoices/generate-pdf';
import { generateCreditNotePdfInternal } from '../invoices/generate-credit-note-pdf';
import { generateDebitNotePdfInternal }  from '../debit-notes/generate-debit-note-pdf';
```

**Razon:** Estas funciones ya estan probadas y en produccion. Duplicarlas introduciria bugs de sincronizacion. El API gateway es solo una capa de entrada/autenticacion/mapeo por encima de la logica existente.

### 5.4 Adaptar el pipeline para modo API

El pipeline actual (onInvoiceEmit) funciona via triggers de Firestore. El modo API necesita operacion SINCRONA (request → response). Por eso `api-public/invoices/api-invoices.ts` ejecutara el pipeline directamente sin depender del trigger:

```
POST /api/v1/invoices
  → Crea documento en companies/{companyId}/invoices/{id} con status: 'api_draft'
  → Llama generateInvoiceXmlInternal()
  → Llama signXmlInternal()
  → Llama sendToSriInternal()
  → Llama generatePdfInternal()
  → Retorna respuesta completa al tercero
```

El campo `status: 'api_draft'` evita que `onInvoiceEmit` reactive el trigger sobre estos documentos (el trigger solo activa con `status: 'issued'`). Despues de completar el pipeline via API, el documento queda en `status: 'issued', sriStatus: 'authorized'|'rejected'` igual que si hubiera pasado por el flujo normal.

---

## 6. Estructura de Carpetas

```
functions/src/
├── api-public/                          ← NUEVO modulo completo
│   ├── index.ts                         ← exporta todas las HTTP Functions
│   ├── middleware/
│   │   ├── jwt-middleware.ts            ← valida Bearer JWT
│   │   ├── rate-limiter.ts             ← sliding window en Firestore
│   │   ├── audit-logger.ts             ← escribe en platform/api_usage/
│   │   ├── request-validator.ts        ← valida schemas de entrada con zod
│   │   └── cors.ts                     ← headers CORS
│   ├── auth/
│   │   └── api-auth.ts                 ← /auth/token, /auth/refresh, /auth/revoke
│   ├── invoices/
│   │   └── api-invoices.ts             ← GET/POST /invoices + /{id}
│   ├── credit-notes/
│   │   └── api-credit-notes.ts
│   ├── debit-notes/
│   │   └── api-debit-notes.ts
│   ├── retentions/
│   │   └── api-retentions.ts
│   ├── accounting/
│   │   └── api-accounting.ts
│   ├── webhooks/
│   │   ├── api-webhooks.ts             ← PUT /webhooks/config
│   │   └── dispatch-webhook.ts         ← trigger Firestore → envia webhook
│   ├── health/
│   │   └── api-health.ts
│   ├── scheduled/
│   │   └── clean-expired-tokens.ts     ← Cloud Scheduler — limpieza de JTIs
│   ├── docs/
│   │   └── openapi-spec.ts             ← sirve openapi.yaml
│   ├── schemas/                        ← schemas zod para validacion
│   │   ├── invoice-request.schema.ts
│   │   ├── credit-note-request.schema.ts
│   │   ├── debit-note-request.schema.ts
│   │   ├── retention-request.schema.ts
│   │   └── journal-entry-request.schema.ts
│   ├── mappers/                        ← convierte request API → modelo interno Firestore
│   │   ├── invoice.mapper.ts
│   │   ├── credit-note.mapper.ts
│   │   ├── debit-note.mapper.ts
│   │   └── retention.mapper.ts
│   ├── types/
│   │   ├── api-client.interface.ts
│   │   ├── api-request-log.interface.ts
│   │   └── api-response.interface.ts
│   └── utils/
│       ├── jwt.util.ts                 ← sign/verify JWT con jsonwebtoken
│       ├── bcrypt.util.ts              ← hash/verify client secrets
│       ├── webhook-signature.util.ts   ← HMAC-SHA256 para payloads de webhook
│       └── response-builder.ts        ← construye respuesta segun responseFields
│
├── invoices/                           ← existente, NO modificar
├── credit-notes/ (alias invoices/)     ← existente, NO modificar
├── debit-notes/                        ← existente, NO modificar
├── retentions/                         ← existente, NO modificar
├── accounting/                         ← existente, NO modificar
└── ...

src/app/features/
└── api-management/                     ← NUEVO modulo Angular (panel de administracion)
    ├── api-management.module.ts
    ├── api-management.routes.ts
    ├── pages/
    │   ├── api-clients-list-page/
    │   │   ├── api-clients-list-page.component.ts
    │   │   ├── api-clients-list-page.component.html
    │   │   └── api-clients-list-page.component.scss
    │   ├── api-client-form-page/
    │   │   ├── api-client-form-page.component.ts
    │   │   ├── api-client-form-page.component.html
    │   │   └── api-client-form-page.component.scss
    │   ├── api-client-detail-page/       ← ver credenciales, revocar, ver logs
    │   │   ├── api-client-detail-page.component.ts
    │   │   ├── api-client-detail-page.component.html
    │   │   └── api-client-detail-page.component.scss
    │   └── api-docs-page/                ← embeds Swagger UI
    │       ├── api-docs-page.component.ts
    │       ├── api-docs-page.component.html
    │       └── api-docs-page.component.scss
    ├── services/
    │   └── api-clients.service.ts
    └── models/
        └── api-client.interface.ts
```

---

## 7. Plan de Implementacion por Fases y Agentes

### Orden de dependencias general

```
Fase A (base, sin dependencias entre si — pueden correr en paralelo)
  A1: Firebase Agent — schemas Firestore + reglas de seguridad
  A2: Security Agent — JWT middleware + bcrypt + rate limiter
  A3: DevOps Agent — variables de entorno + CORS + Secret Manager

Fase B (depende de A)
  B1: Cloud Functions Agent — auth endpoint (/auth/token, /refresh, /revoke)
  B2: Cloud Functions Agent — mappers y schemas zod

Fase C (depende de B)
  C1: Cloud Functions Agent — endpoint invoices (usa pipeline existente)
  C2: Cloud Functions Agent — endpoint credit-notes
  C3: Cloud Functions Agent — endpoint debit-notes
  C4: Cloud Functions Agent — endpoint retentions
  C5: Cloud Functions Agent — endpoint accounting

  (C1-C5 pueden correr en paralelo entre si una vez que B esta completo)

Fase D (depende de C)
  D1: SRI Agent — verificacion y adaptacion del pipeline sincrono
  D2: Cloud Functions Agent — webhooks (dispatch + config)
  D3: Cloud Functions Agent — health check + openapi spec

Fase E (depende de D)
  E1: Angular Agent — panel de gestion de API clients
  E2: DevOps Agent — deploy a produccion + pruebas de integracion

Fase F (independiente, puede empezar desde A)
  F1: Security Agent — auditoria final, penetration test checklist
```

---

### Fase A — Infraestructura Base

**Duracion estimada:** 2-3 dias

---

#### A1 — Firebase Agent

**Tareas:**

1. Crear los siguientes documentos de schema en Firestore (usando la Admin SDK en un script de seed o en la funcion `setupCompany`):
   - `platform/api_clients/{clientId}` — schema definido en seccion 3.1
   - `platform/api_usage/{clientId}/requests/{requestId}` — seccion 3.2
   - `platform/api_rate_limits/{clientId}` — seccion 3.3
   - `platform/revoked_tokens/{jti}` — seccion 3.4

2. Actualizar `firestore.rules` para proteger las nuevas colecciones:
   ```
   // platform/api_clients: solo super_admin puede leer/escribir
   // platform/api_usage: solo Cloud Functions (Admin SDK) escriben, super_admin lee
   // platform/api_rate_limits: solo Cloud Functions (Admin SDK)
   // platform/revoked_tokens: solo Cloud Functions (Admin SDK)
   ```

3. Crear indices compuestos en `firestore.indexes.json`:
   - `platform/api_usage/{clientId}/requests` — indice por `clientId` + `requestedAt` DESC
   - `platform/api_usage/{clientId}/requests` — indice por `clientId` + `success` + `requestedAt`
   - `platform/revoked_tokens` — indice por `expiresAt` (para el scheduler de limpieza)

**Entregable:** `firestore.rules` actualizado + `firestore.indexes.json` actualizado.

---

#### A2 — Security Agent

**Tareas:**

1. Implementar `functions/src/api-public/utils/jwt.util.ts`:
   - `signToken(payload, expiresInSeconds): string` — firma JWT con HS256 usando JWT_SECRET de env
   - `verifyToken(token): JwtPayload | null` — verifica y decodifica, retorna null si invalido/expirado
   - `generateJti(): string` — genera UUID v4 para el campo `jti`

2. Implementar `functions/src/api-public/utils/bcrypt.util.ts`:
   - `hashSecret(secret: string): Promise<string>` — bcrypt con cost factor 12
   - `verifySecret(secret: string, hash: string): Promise<boolean>`
   - `generateClientSecret(): string` — genera secret criptograficamente seguro (32 bytes hex)

3. Implementar `functions/src/api-public/middleware/jwt-middleware.ts`:
   - Extrae `Authorization: Bearer <token>` del header
   - Verifica firma y expiracion
   - Consulta `platform/revoked_tokens/{jti}` — rechaza si existe
   - Consulta `platform/api_clients/{clientId}` — rechaza si `status !== 'active'`
   - Verifica que el scope requerido por el endpoint este en `client.scopes`
   - Inyecta `{ clientId, companyId, scopes }` en el contexto del request

4. Implementar `functions/src/api-public/middleware/rate-limiter.ts`:
   - Lee `platform/api_rate_limits/{clientId}`
   - Verifica ventana de 1 minuto y ventana de 1 dia
   - Si excede: retorna 429 con headers `Retry-After` y `X-RateLimit-Reset`
   - Si no excede: incrementa contadores con transaccion Firestore
   - Los limites vienen del documento `api_clients/{clientId}.rateLimits`

5. Implementar `functions/src/api-public/middleware/audit-logger.ts`:
   - Escribe el registro de la llamada en `platform/api_usage/{clientId}/requests/{requestId}`
   - La escritura es NO bloqueante (no bloquea la respuesta al tercero)
   - Registra: endpoint, method, ip, status HTTP, duracion, resultado, ID del documento creado

**Dependencias:** necesita que A1 haya definido los schemas Firestore.

**Entregable:** 5 archivos TypeScript en `functions/src/api-public/`.

---

#### A3 — DevOps Agent

**Tareas:**

1. Agregar al proyecto Firebase Secret Manager (o `.env` para emuladores) las variables:
   - `JWT_SECRET` — minimo 256 bits, generado con `openssl rand -hex 32`
   - `API_CORS_ORIGINS` — lista de origenes permitidos (separados por coma)

2. Configurar CORS en `functions/src/api-public/middleware/cors.ts`:
   - En emuladores: permite `*`
   - En produccion: solo los origenes configurados en `API_CORS_ORIGINS`
   - Metodos permitidos: `GET, POST, PUT, DELETE, OPTIONS`
   - Headers permitidos: `Authorization, Content-Type, X-Requested-With`

3. Actualizar `firebase.json` para mapear rutas de Firebase Hosting a las HTTP Functions:
   ```json
   {
     "rewrites": [
       { "source": "/api/v1/**", "function": "api" }
     ]
   }
   ```
   Esto permite que la URL publica sea `https://facturasproec.web.app/api/v1/...` en lugar de la URL larga de Cloud Functions.

4. Configurar `functions/.env.local` para pruebas con emuladores.

**Entregable:** `firebase.json` actualizado, documentacion de variables de entorno.

---

### Fase B — Autenticacion y Validacion

**Duracion estimada:** 2 dias

---

#### B1 — Cloud Functions Agent (auth endpoint)

**Tareas:**

1. Implementar `functions/src/api-public/auth/api-auth.ts`:
   - `POST /auth/token`: busca `clientId` en Firestore, verifica secret con bcrypt, emite JWT, actualiza `lastTokenIssuedAt`
   - `POST /auth/refresh`: valida token actual (no expirado, no revocado), emite nuevo JWT, revoca el anterior por JTI
   - `POST /auth/revoke`: agrega JTI a `platform/revoked_tokens/{jti}`

2. Agregar a `functions/src/api-public/index.ts`:
   ```typescript
   export const apiAuth = onRequest({ cors: corsOptions }, apiAuthHandler);
   ```

**Dependencias:** A2 (jwt.util + bcrypt.util).

---

#### B2 — Cloud Functions Agent (schemas y mappers)

**Tareas:**

1. Implementar schemas zod en `functions/src/api-public/schemas/`:
   - `invoice-request.schema.ts` — valida el body del POST /invoices
   - `credit-note-request.schema.ts`
   - `debit-note-request.schema.ts`
   - `retention-request.schema.ts`
   - `journal-entry-request.schema.ts`

2. Implementar mappers en `functions/src/api-public/mappers/`:
   - Cada mapper convierte del schema de request API al modelo interno que espera el pipeline SRI existente
   - El mapper de invoices debe ser compatible con la interfaz `Invoice` en `generate-invoice-xml.ts`
   - El mapper de credit notes con la interfaz `CreditNote` en `generate-credit-note-xml.ts`
   - El mapper de debit notes con la interfaz `DebitNote` en `generate-debit-note-xml.ts`

3. Implementar `functions/src/api-public/utils/response-builder.ts`:
   - Toma el documento Firestore post-pipeline y `responseFields[]` del request
   - Construye la respuesta JSON filtrando solo los campos pedidos
   - Convierte `xmlUrl` de Storage a contenido base64 si el cliente pide `xml` en `responseFields`

**Nota critica para el mapper de invoices:** El modelo interno usa campos como `netAmount`, `vatAmount`, `paymentMethods[]`, `customerTaxIdType`. El request API usara nombres mas intuitivos. El mapper es la frontera entre ambos mundos.

**Dependencias:** A1 (para conocer la estructura Firestore).

---

### Fase C — Endpoints de Documentos SRI

**Duracion estimada:** 3-4 dias (C1-C5 en paralelo)

---

#### C1 — Cloud Functions Agent (invoices)

**Tareas:**

1. Implementar `functions/src/api-public/invoices/api-invoices.ts`:

   **POST /api/v1/invoices:**
   - Ejecuta middleware: cors → jwt → rateLimit → audit
   - Valida body con schema zod de invoice
   - Mapea request al modelo interno con `invoice.mapper.ts`
   - Genera `invoiceId` unico
   - Crea documento en `companies/{companyId}/invoices/{invoiceId}` con `status: 'api_draft'`
   - Ejecuta pipeline sincrono:
     ```typescript
     await generateInvoiceXmlInternal(invoiceId, companyId);
     await signXmlInternal(invoiceId, companyId);
     const sriResult = await sendToSriInternal(invoiceId, companyId);
     await generatePdfInternal(invoiceId, companyId);
     ```
   - Lee el documento actualizado de Firestore
   - Construye respuesta con `response-builder.ts`
   - Retorna 200

   **GET /api/v1/invoices/{documentId}:**
   - Verifica que `documentId` pertenece al `companyId` del token (aislamiento multi-tenant)
   - Lee documento de Firestore
   - Construye y retorna respuesta

   **GET /api/v1/invoices:**
   - Query con filtros y paginacion usando Firestore query
   - Retorna lista paginada

**Dependencias:** B1 (middleware), B2 (schema + mapper + response-builder).

---

#### C2 — Cloud Functions Agent (credit-notes)

Identico a C1 pero para notas de credito. Usa `generateCreditNoteXmlInternal`, `signXmlInternal` con filename `cn-{id}.xml`, `sendToSriInternal` con tipo `'creditNote'`, `generateCreditNotePdfInternal`.

---

#### C3 — Cloud Functions Agent (debit-notes)

Identico a C1 pero para notas de debito. Implementa el pipeline completo equivalente a `on-debit-note-emit.ts`.

---

#### C4 — Cloud Functions Agent (retentions)

Identico a C1 pero para retenciones. Implementa el pipeline completo equivalente a `on-retention-emit.ts`.

---

#### C5 — Cloud Functions Agent (accounting)

1. **GET /api/v1/accounting/journal-entries**: consulta `companies/{companyId}/journalEntries` con filtros de periodo, retorna lista paginada.
2. **GET /api/v1/accounting/journal-entries/{entryId}**: lectura directa del documento.
3. **POST /api/v1/accounting/journal-entries**: valida que el asiento este balanceado (suma debitos = suma creditos), crea el documento en Firestore.

---

### Fase D — Webhooks, Health y Docs

**Duracion estimada:** 2 dias

---

#### D1 — SRI Agent (verificacion del pipeline sincrono)

**Tareas:**

1. Verificar que `generateInvoiceXmlInternal`, `signXmlInternal`, `sendToSriInternal`, `generatePdfInternal` son seguros para llamarse de forma sincrona desde un HTTP handler (sin efectos secundarios que dependan del trigger `onInvoiceEmit`).

2. Identificar si hay algun paso del pipeline que asuma que el documento ya tiene ciertos campos antes de ejecutarse. Si los hay, el mapper debe pre-popular esos campos en el documento `api_draft` antes de iniciar el pipeline.

3. Verificar que el campo `status: 'api_draft'` efectivamente evita que `onInvoiceEmit` se active. Confirmar en el codigo de `on-invoice-emit.ts` que el trigger verifica `status === 'issued'` antes de proceder (ya lo hace — linea 43: `prevStatus !== 'issued' && after['status'] === 'issued'`).

4. Documentar cualquier limitacion o caso borde encontrado.

**Entregable:** documento de hallazgos + posibles ajustes menores a los `*Internal` si son necesarios.

---

#### D2 — Cloud Functions Agent (webhooks)

1. Implementar `functions/src/api-public/webhooks/api-webhooks.ts`:
   - `PUT /api/v1/webhooks/config`: actualiza `responseConfig.webhookUrl` y `responseConfig.webhookSecret` en el documento `api_clients/{clientId}`.

2. Implementar `functions/src/api-public/webhooks/dispatch-webhook.ts`:
   - Trigger: `onDocumentUpdated('companies/{companyId}/invoices/{invoiceId}')` — filtra cuando `sriStatus` cambia a `authorized` o `rejected`
   - Lee el `api_clients` cuyo `companyId` coincide (o el `apiClientId` si es tenant virtual)
   - Si el cliente tiene `webhookUrl` configurado y el evento esta en su lista de `events`
   - Construye el payload igual que la respuesta del POST /invoices
   - Firma el payload con HMAC-SHA256 usando `webhookSecret`
   - Envia POST al `webhookUrl` del cliente con `X-Webhook-Signature` header
   - Reintenta hasta 3 veces con backoff exponencial si falla

---

#### D3 — Cloud Functions Agent (health + docs)

1. Implementar `functions/src/api-public/health/api-health.ts`:
   - Intenta conectar a los endpoints SRI testing y production con un HEAD request
   - Retorna estado de cada uno

2. Implementar `functions/src/api-public/docs/openapi-spec.ts`:
   - Sirve el archivo `openapi.yaml` como respuesta HTTP con Content-Type `application/yaml`
   - El archivo `openapi.yaml` se genera/actualiza manualmente segun los endpoints implementados (ver seccion 9)

---

### Fase E — Panel Angular y Deploy

**Duracion estimada:** 3-4 dias

---

#### E1 — Angular Agent (panel de gestion)

**Tareas:**

1. Crear modulo `src/app/features/api-management/` con la estructura definida en la seccion 6.

2. `api-clients-list-page`:
   - Lista todos los `api_clients` de la plataforma (solo visible para `super_admin`)
   - Columnas: nombre, tipo, companyId vinculado, status, fecha creacion, total requests
   - Acciones: ver detalle, suspender, revocar

3. `api-client-form-page`:
   - Formulario para crear un nuevo cliente API
   - Campos: nombre, contactEmail, tipo (tenant_linked / standalone), companyId (si tenant_linked), scopes (checkboxes), rateLimits, responseConfig
   - Al crear: llama a una Cloud Function `createApiClient` que genera el clientId, el clientSecret, hashea el secret y guarda el documento en Firestore
   - Muestra el `clientSecret` UNA SOLA VEZ al crear (no se vuelve a mostrar)

4. `api-client-detail-page`:
   - Muestra config del cliente
   - Permite revocar tokens activos
   - Muestra historial de llamadas recientes (leer de `platform/api_usage/`)
   - Permite cambiar status: active / suspended

5. `api-docs-page`:
   - Embebe Swagger UI (via CDN o libreria npm `swagger-ui-dist`)
   - Apunta al endpoint `GET /api/v1/docs` que sirve el `openapi.yaml`
   - Accesible para cualquier usuario autenticado (no solo super_admin)

6. Agregar entradas en `src/app/layout/default-layout/_nav.ts`:
   - Solo visible para `super_admin`
   - Entrada: "API Publica" con subitems "Clientes API" y "Documentacion"

**Patron de formulario a seguir:** usar `effect() + _patched` segun definido en `feedback_component_architecture.md`.

**Separacion de archivos:** HTML, SCSS y TS en archivos separados obligatorio.

---

#### E2 — DevOps Agent (deploy final)

**Tareas:**

1. Verificar que el `JWT_SECRET` esta en Firebase Secret Manager y que las Cloud Functions tienen acceso (`secretEnvironmentVariables` en la config de la funcion).

2. Hacer deploy de solo las nuevas Cloud Functions del modulo `api-public`:
   ```bash
   firebase deploy --only functions:apiAuth,functions:apiInvoices,functions:apiCreditNotes,functions:apiDebitNotes,functions:apiRetentions,functions:apiAccounting,functions:apiWebhooks,functions:apiHealth,functions:dispatchWebhook,functions:cleanExpiredTokens,functions:openApiSpec
   ```

3. Verificar CORS con un request `OPTIONS` desde Postman.

4. Actualizar la coleccion Postman existente (`docs/FacturaSec.postman_collection.json`) con los nuevos endpoints.

5. Ejecutar prueba de integracion end-to-end:
   - Crear cliente API via panel Angular
   - Obtener token via POST /auth/token
   - Emitir factura de prueba (ambiente testing SRI)
   - Verificar XML autorizado en la respuesta
   - Verificar PDF accesible via URL
   - Revocar token y verificar que el endpoint rechaza el request

---

### Fase F — Auditoria de Seguridad

**Duracion estimada:** 1-2 dias (corre en paralelo con E)

---

#### F1 — Security Agent

**Checklist de seguridad a verificar:**

**Autenticacion y autorizacion:**
- [ ] JWT verificado en TODOS los endpoints excepto `/health` y `/auth/token`
- [ ] Scope verificado por endpoint (no solo autenticacion general)
- [ ] `companyId` del token siempre verificado contra el recurso solicitado (nunca confiar en `companyId` del request body)
- [ ] Un cliente `tenant_linked` no puede acceder a recursos de otro tenant
- [ ] Un cliente `standalone` solo accede a su tenant virtual

**Secretos:**
- [ ] `clientSecretHash` en Firestore es bcrypt (cost 12+), nunca el secret en claro
- [ ] `JWT_SECRET` en Secret Manager, no en codigo ni en `.env` commiteado
- [ ] `webhookSecret` almacenado con atencion — evaluar si necesita cifrado adicional

**Rate limiting:**
- [ ] Rate limit verificado ANTES de ejecutar cualquier logica de negocio
- [ ] Headers de rate limit en todas las respuestas (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`)
- [ ] Rate limit por `clientId`, no por IP (IP puede cambiar, clientId es la entidad de negocio)

**Inputs:**
- [ ] Todos los request bodies validados con zod antes de tocar Firestore o pipeline SRI
- [ ] Paginacion con limites maximos forzados (max 100 items, nunca ilimitado)
- [ ] Strings sanitizados antes de construir paths de Firestore (evitar path traversal)

**Auditoria:**
- [ ] Cada request loggeado con IP, timestamp, resultado
- [ ] Intentos fallidos de autenticacion loggeados (para detectar brute force)
- [ ] Logs accesibles para el super_admin desde el panel Angular

**Multi-tenant:**
- [ ] Las reglas de Firestore bloquean acceso a `platform/api_clients` desde el cliente (solo Admin SDK)
- [ ] Un tercero nunca puede ver ni modificar documentos de otro `companyId`

---

## 8. Consideraciones de Seguridad Criticas

### Aislamiento multi-tenant en modo API

El mayor riesgo de una API publica en un sistema multi-tenant es que un tercero acceda a datos de otro tenant. Se previene con tres capas de defensa:

**Capa 1 — JWT payload:** El `companyId` esta dentro del JWT firmado. Un tercero no puede modificarlo sin invalidar la firma.

**Capa 2 — Middleware:** El `jwt-middleware.ts` extrae el `companyId` del token (no del request body) y lo inyecta en el contexto del request. Los handlers NUNCA usan el `companyId` del body.

**Capa 3 — Verificacion en handler:** Antes de leer/escribir cualquier documento, el handler verifica que el `documentId` solicitado pertenece al `companyId` del token:
```typescript
const doc = await db.doc(`companies/${companyId}/invoices/${documentId}`).get();
if (!doc.exists) {
  // El documento no existe en ESE companyId — puede ser de otro tenant
  return res.status(404).json({ error: 'NOT_FOUND' });
}
```

**Por que 404 y no 403:** Retornar 403 cuando el documento existe pero no le pertenece filtra informacion (confirma que el documento existe). Retornar 404 siempre que el documento no este en su tenant es mas seguro.

### Rate limiting y proteccion contra abuso

El rate limiter usa una ventana deslizante en Firestore en lugar de en memoria porque Cloud Functions son stateless y pueden correr en multiples instancias. Un rate limiter en memoria no funcionaria correctamente con multiple instancias.

Para evitar que la verificacion del rate limiter sea un bottleneck, la transaccion Firestore usa `FieldValue.increment()` que es atomico y rapido. La verificacion es la primera operacion despues del middleware JWT.

Si se detecta abuso sistematico (muchos 429 de un cliente), el Security Agent debe poder suspender el cliente inmediatamente via panel Angular (`status: 'suspended'`).

### Proteccion del webhook dispatch

El `dispatch-webhook.ts` envia datos del SRI (incluyendo XML autorizado) al URL configurado por el cliente. Riesgos:

1. **SSRF (Server-Side Request Forgery):** Un cliente malicioso podria poner como `webhookUrl` una URL interna de Firebase/GCP. Mitigacion: validar que el URL no apunta a ranges de IP privadas (RFC 1918) ni a metadata de GCP (`169.254.169.254`).

2. **Replay attacks:** El tercero podria recibir el mismo webhook dos veces. El payload debe incluir un `eventId` unico. El tercero debe implementar idempotencia.

3. **Timeout:** Si el `webhookUrl` del cliente no responde en 10 segundos, la Cloud Function no debe bloquearse. Usar `axios` con timeout de 10 segundos.

### Documentos SRI — inmutabilidad legal

Los documentos con `sriStatus: 'authorized'` son documentos tributarios legalmente validos. Las reglas de Firestore ya los protegen (`sriAuthorizedGuard()`). Las APIs publicas NO deben exponer endpoints que modifiquen documentos ya autorizados. Solo se permite:
- Leer el documento
- Emitir documentos de correccion (nota de credito, nota de debito)

---

## 9. Especificacion OpenAPI/Swagger

El archivo `openapi.yaml` debe ubicarse en `functions/src/api-public/docs/openapi.yaml` y ser servido por `openapi-spec.ts`.

### Estructura minima del archivo

```yaml
openapi: "3.0.3"
info:
  title: "SaasFacturacion API Publica"
  description: "API REST para integracion de terceros con SaasFacturacion ERP Ecuador"
  version: "1.0.0"
  contact:
    email: "soporte@facturasec.com"

servers:
  - url: "https://facturasproec.web.app/api/v1"
    description: "Produccion"
  - url: "http://localhost:5001/facturasproec/us-central1/api/v1"
    description: "Desarrollo (emuladores Firebase)"

security:
  - BearerAuth: []

components:
  securitySchemes:
    BearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT

  schemas:
    # Definir aqui todos los schemas de request y response
    # segun los ejemplos de la seccion 4
    InvoiceRequest: { ... }
    InvoiceResponse: { ... }
    CreditNoteRequest: { ... }
    DebitNoteRequest: { ... }
    RetentionRequest: { ... }
    JournalEntryRequest: { ... }
    ErrorResponse:
      type: object
      properties:
        error: { type: string }
        message: { type: string }
        details: { type: object }

paths:
  /auth/token:
    post:
      security: []
      # ...
  /invoices:
    post:
      security:
        - BearerAuth: []
      # ...
  # etc.
```

### Swagger UI en el panel Angular

La pagina `api-docs-page` debe cargar Swagger UI apuntando al endpoint `/api/v1/docs`:

```typescript
// api-docs-page.component.ts
SwaggerUI({
  url: 'https://facturasproec.web.app/api/v1/docs',
  dom_id: '#swagger-ui',
  presets: [SwaggerUI.presets.apis, SwaggerUI.SwaggerUIStandalonePreset],
  layout: 'StandaloneLayout',
  tryItOutEnabled: true,
});
```

La URL de Swagger UI debe ser configurable por entorno (development apunta a emuladores, production a la URL real).

---

## Resumen Ejecutivo

| Aspecto | Decision |
|---------|----------|
| Autenticacion | JWT propio HS256, clientId+secret via Firestore, revocacion por JTI |
| Gateway | HTTP Cloud Functions v2, sin Express server adicional |
| Pipeline SRI | Reutiliza 100% los `*Internal` existentes, sin duplicacion |
| Aislamiento tenant | `companyId` en JWT payload, verificado por middleware Y por handler |
| Rate limiting | Ventana deslizante en Firestore (stateless-safe) |
| Webhooks | Trigger Firestore + HMAC-SHA256 firmado |
| Documentacion | OpenAPI 3.0 servido via Cloud Function + Swagger UI en panel Angular |
| Carpeta nueva | `functions/src/api-public/` |
| Modulo Angular nuevo | `src/app/features/api-management/` |
| Agentes involucrados | Firebase, Security, Cloud Functions, SRI, Angular, DevOps |
| Fases de implementacion | A→B→C→D→E (F en paralelo con E) |
| Duracion total estimada | 12-16 dias de desarrollo |
| Riesgo principal | Aislamiento multi-tenant — mitigado con triple capa de verificacion |
