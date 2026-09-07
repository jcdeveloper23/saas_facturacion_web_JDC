# Plan de Integración: Sistemas Externos con FacturaEc
## Puente de Transición + Análisis de Potencial de Integración

**Versión:** 1.0  
**Fecha:** 2026-09-02  
**Branch:** developFacturasEc  
**Relacionado con:** `docs/PLAN_API_PUBLICA_TERCEROS.md` (prerequisito de lectura)  
**Stack:** Angular 21 · Firebase Cloud Functions v2 · Firestore · Flutter · Spring Boot  

---

## Índice

1. [Contexto: el problema real](#1-contexto-el-problema-real)
2. [Fase 0 — createAndEmitInvoice: el puente](#2-fase-0--createandemitinvoice-el-puente)
3. [Fase 1 — Integración Flutter](#3-fase-1--integración-flutter)
4. [Fase 2 — Integración Buseta (Angular + Spring Boot)](#4-fase-2--integración-buseta-angular--spring-boot)
5. [Análisis: Mayor Potencial del Sistema con una API Robusta](#5-análisis-mayor-potencial-del-sistema-con-una-api-robusta)
6. [Ecosistema de Integraciones Posibles](#6-ecosistema-de-integraciones-posibles)
7. [Comparativa de Modelos de Integración](#7-comparativa-de-modelos-de-integración)
8. [Roadmap Unificado](#8-roadmap-unificado)
9. [Riesgos y Mitigaciones](#9-riesgos-y-mitigaciones)

---

## 1. Contexto: el problema real

### El pipeline SRI actual asume que la factura existe en Firestore

`generateInvoiceXml` hace estas lecturas:

```
READ  companies/{companyId}/invoices/{invoiceId}   ← FALLA si no existe
READ  companies/{companyId}
READ  companies/{companyId}/configuration/sri
READ  platform/defaults/sriConfig/data
WRITE companies/{companyId}/invoices/{invoiceId}   ← actualiza sriStatus, accessKey, xmlUrl
```

**Si la factura vive en un sistema externo** (Flutter con su propia DB, Spring Boot con PostgreSQL), la función lanza `Factura no encontrada` antes de hacer nada.

### La pregunta clave

> ¿Qué pasa si la factura no se genera en la base de este sistema y solo se requiere generar el XML aquí?

La respuesta correcta no es adaptar el sistema externo para que escriba directamente en Firestore (puede que no tenga acceso, puede que no tenga el SDK), sino exponer **una API que acepte el payload completo de la factura, cree el documento en Firestore, y ejecute el pipeline**. Así el sistema externo solo necesita hacer una llamada HTTP.

### El hallazgo que simplifica todo

`on-invoice-emit.ts` ya orquesta el pipeline completo cuando cualquier documento cambia `status → 'issued'`. Esto significa que el puente puede ser una sola Cloud Function nueva: `createAndEmitInvoice`.

---

## 2. Fase 0 — `createAndEmitInvoice`: el puente

**Prioridad:** Máxima. Es el prerequisito de las Fases 1 y 2.  
**Estimado:** 3-4 días de desarrollo + 1 día de pruebas  
**Agente responsable:** Cloud Functions Agent  

### 2.1 Arquitectura de la función

```
Sistema Externo (Flutter / Spring Boot / cualquier cliente)
        │
        │  Llama: createAndEmitInvoice({
        │    companyId,
        │    invoice: { customer, lines, paymentMethods, date, ... }
        │  })
        │
        ▼
createAndEmitInvoice (nueva — onCall)
  ├─ 1. Valida Firebase Auth token (companyId del claims)
  ├─ 2. Valida payload con schema zod
  ├─ 3. Crea doc: companies/{companyId}/invoices/{newId}
  │      { ...invoiceData, status: 'issued', source: 'api' }
  └─ 4. Retorna { invoiceId, status: 'processing' }
        │
        ▼ (Firestore trigger automático — ya existe)
onInvoiceEmit
  ├─ generateInvoiceXmlInternal
  ├─ signXmlInternal
  ├─ sendToSriInternal
  ├─ generatePdfInternal
  └─ sendInvoiceEmailInternal
        │
        ▼
Sistema externo hace polling:
checkSriStatus({ invoiceId, companyId })
  → { sriStatus: 'authorized', accessKey, pdfUrl, authorizationNumber }
```

### 2.2 Archivo a crear

**`functions/src/invoices/create-and-emit-invoice.ts`**

```typescript
// Contrato de la función — implementación a cargo del Cloud Functions Agent

export const createAndEmitInvoice = onCall(async (request) => {
  // Autenticación: companyId SIEMPRE del token, nunca del body
  if (!request.auth) throw new HttpsError('unauthenticated', '...');
  
  const callerCompanyId = request.auth.token['companyId'] as string;
  const callerRole = request.auth.token['role'] as string;
  const { companyId, invoice } = request.data;
  
  // Aislamiento multi-tenant: el caller solo puede crear en su companyId
  // excepto super_admin que puede actuar en nombre de cualquier empresa
  if (callerRole !== 'super_admin' && callerCompanyId !== companyId) {
    throw new HttpsError('permission-denied', '...');
  }
  
  // Validación del payload mínimo (zod)
  // - customer.taxId, customer.name, customer.taxIdType
  // - lines (al menos 1, con description, quantity, unitPrice, vatPct)
  // - paymentMethods (al menos 1)
  // - date
  
  // Cálculo de totales si el sistema externo no los envía
  // (calcular netAmount, vatAmount, total a partir de lines)
  
  // Crear documento en Firestore
  const invoiceRef = db.collection(`companies/${companyId}/invoices`).doc();
  await invoiceRef.set({
    ...mappedInvoice,           // payload normalizado al modelo interno
    status: 'issued',           // dispara onInvoiceEmit
    sriStatus: null,            // indica que el pipeline no ha corrido
    source: request.data.source ?? 'external_api',
    externalId: request.data.externalId ?? null, // ID del sistema origen (opcional)
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
  
  return {
    invoiceId: invoiceRef.id,
    status: 'processing',
    message: 'Factura creada. Use checkSriStatus para consultar el resultado.',
    pollUrl: null, // el sistema externo llama checkSriStatus con invoiceId
  };
});
```

### 2.3 Campo `externalId` — clave para la trazabilidad

El payload acepta un campo `externalId` opcional. El sistema externo (Flutter, Spring Boot) envía su propio ID de factura:

```json
{
  "companyId": "abc123",
  "externalId": "buseta-invoice-2026-001",
  "invoice": { ... }
}
```

Esto permite al sistema externo:
1. Guardar el `invoiceId` de Firestore de vuelta en su DB
2. O buscar por `externalId` si perdió el `invoiceId`

Y permite a FacturaEc mostrar el origen del documento en el historial.

### 2.4 Normalización de totales

Muchos sistemas externos calculan los totales diferente. La función debe calcular/verificar los totales si no vienen completos:

```
Si el sistema externo envía solo lines con unitPrice y vatPct:
  → calcular subtotal por línea = quantity * unitPrice
  → calcular vatAmount por línea = subtotal * (vatPct/100)
  → calcular netAmount = suma de subtotals
  → calcular total = netAmount + suma de vatAmounts
  → rellenar los campos que espera el pipeline interno
```

Esta normalización en `createAndEmitInvoice` evita modificar `generateInvoiceXmlInternal` (que ya está probado en producción).

### 2.5 Modo síncrono vs asíncrono

La función retorna inmediatamente (`processing`) y el pipeline corre vía trigger. Para sistemas que necesitan la respuesta completa en una sola llamada, existe una variante `mode: 'sync'`:

```json
{
  "companyId": "abc123",
  "mode": "sync",
  "syncTimeoutMs": 45000,
  "invoice": { ... }
}
```

En modo `sync`, la función espera el resultado del pipeline (polling interno a Firestore cada 2s hasta `sriStatus !== null || timeout`). Si el SRI autoriza antes del timeout, retorna la respuesta completa. Si no, retorna `processing` igual que el modo async.

**Advertencia:** Este modo tiene riesgo de timeout en Cloud Functions v2 (máximo 9 minutos, default 60s). Configurar `timeoutSeconds: 120` en la función para modo sync.

### 2.6 Actualización de firestore.rules necesaria

La función usa Admin SDK (bypasea reglas), pero si se quiere que sistemas externos escriban directamente en Firestore (sin pasar por la Cloud Function), las reglas deben permitirlo para el rol correcto:

```javascript
// En firestore.rules — SOLO si se decide permitir escritura directa
// El patrón recomendado es usar createAndEmitInvoice (Cloud Function) siempre
match /companies/{companyId}/invoices/{invoiceId} {
  allow create: if isCompanyMember(companyId) 
                && (hasRole('admin') || hasRole('seller'))
                && request.resource.data.status != 'authorized';
                // Nunca crear directamente como 'authorized'
}
```

### 2.7 Export en `functions/src/index.ts`

```typescript
// Agregar junto a los otros exports de invoices
export { createAndEmitInvoice } from './invoices/create-and-emit-invoice';
```

---

## 3. Fase 1 — Integración Flutter

**Prerequisito:** Fase 0 completada  
**Estimado:** 4-6 semanas para MVP completo  
**Agente responsable:** Cloud Functions Agent + Angular Agent (patrones Dart equivalentes)  

### 3.1 Contexto técnico

El sistema Flutter ya tiene en `pubspec.yaml`:
- `firebase_auth` — auth idéntico al Angular
- `cloud_firestore` — SDK Firestore nativo
- `cloud_functions` — SDK para llamar onCall directamente
- `dio` — HTTP client para REST

El `AuthService` Flutter ya lee `companyId` de custom claims. La infraestructura de autenticación está lista.

### 3.2 Flujo de emisión de factura desde Flutter

```dart
// Llamar createAndEmitInvoice desde Flutter
final functions = FirebaseFunctions.instance;
final callable = functions.httpsCallable('createAndEmitInvoice');

final result = await callable.call({
  'companyId': authService.companyId,
  'externalId': localInvoiceId,  // ID en la DB local de Flutter (si existe)
  'mode': 'async',
  'invoice': {
    'date': '2026-09-02',
    'customer': {
      'taxId': '1712345678',
      'taxIdType': 'CI',
      'name': 'Juan Pérez',
      'email': 'juan@email.com',
    },
    'lines': [
      {
        'sku': 'PROD-001',
        'description': 'Servicio de consultoría',
        'quantity': 1,
        'unitPrice': 100.00,
        'vatPct': 15,
      }
    ],
    'paymentMethods': [
      { 'code': '01', 'amount': 115.00, 'deadline': 0, 'timeUnit': 'dias' }
    ],
  }
});

final invoiceId = result.data['invoiceId'];

// Polling con onSnapshot en el documento específico (no la colección)
FirebaseFirestore.instance
  .doc('companies/${authService.companyId}/invoices/$invoiceId')
  .snapshots()
  .listen((snapshot) {
    final data = snapshot.data()!;
    final sriStatus = data['sriStatus'];
    if (sriStatus == 'authorized' || sriStatus == 'rejected') {
      // Actualizar UI con resultado
      // Guardar invoiceId de vuelta en DB local de Flutter si se necesita
    }
  });
```

### 3.3 Módulos Flutter a construir (por prioridad)

| Semana | Módulo | Dependencias Firestore | Dependencias Cloud Functions |
|--------|--------|----------------------|------------------------------|
| 1-2 | Dashboard (solo lectura) | `invoices` (limit:20), `usage/{period}` | ninguna |
| 1-2 | Historial de facturas | `invoices` (query + onSnapshot doc) | `checkSriStatus` |
| 3 | Gestión de clientes | `customers` (CRUD directo) | ninguna |
| 3-4 | Emisión de facturas | `invoices` (vía createAndEmitInvoice) | `createAndEmitInvoice` |
| 4-5 | Visualización PDF/XML | Storage URLs | `downloadDocument` |
| 5-6 | Catálogo de productos (lectura) | `products` (limit:50) | ninguna |

### 3.4 Reglas críticas para Flutter

**Regla 1 — `companyId` solo de claims, nunca de localStorage:**
```dart
// CORRECTO
final companyId = (await user.getIdTokenResult(forceRefresh: false))
    .claims?['companyId'] as String?;

// INCORRECTO — nunca hacer esto
final companyId = prefs.getString('companyId'); // puede ser manipulado
```

**Regla 2 — `onSnapshot` con `limit` obligatorio en colecciones transaccionales:**
```dart
// CORRECTO — limit siempre
FirebaseFirestore.instance
  .collection('companies/$companyId/invoices')
  .orderBy('date', descending: true)
  .limit(20)  // OBLIGATORIO según Firebase Pagination Guidelines del proyecto
  .snapshots();

// INCORRECTO — nunca sin limit en colecciones grandes
FirebaseFirestore.instance
  .collection('companies/$companyId/invoices')
  .snapshots(); // puede traer miles de documentos → costo + crash
```

**Regla 3 — Certificados .p12 nunca accesibles desde Flutter:**  
Los certificados están en Storage con rules privadas. La firma electrónica siempre ocurre en Cloud Function del servidor. Verificar que `storage.rules` bloquea `/companies/{companyId}/certificates/` para cualquier cliente autenticado.

---

## 4. Fase 2 — Integración Buseta (Angular + Spring Boot)

**Prerequisito:** Fase 0 completada  
**Estimado:** 3-4 semanas para SSO + módulo de facturación básico  
**Agente responsable:** Architecture Agent + Cloud Functions Agent  

### 4.1 Arquitectura recomendada: SSO compartido

```
Usuario de Buseta
        │
        │ 1. Login → Firebase Auth (mismo proyecto facturasproec)
        │    → Token con claims { companyId: 'buseta-company-id', role: 'seller' }
        │
        ├──────────────────────────────────────────────────────────┐
        │                                                          │
        ▼                                                          ▼
Angular de Buseta                                        Spring Boot (Buseta)
(usa @angular/fire)                                      (usa Firebase Admin SDK Java)
        │                                                          │
        │ @angular/fire llama directamente                         │ Verifica token en
        │ Cloud Functions de FacturaEc                             │ cada HTTP request
        │ (createAndEmitInvoice, checkSriStatus)                   │
        │                                                          │
        ▼                                                          ▼
Cloud Functions FacturaEc                            Base de datos Buseta
(genera factura, pipeline SRI)                       (vehículos, rutas, conductores)
        │
        ▼
Firestore companies/{companyId}/invoices
(fuente de verdad para documentos SRI)
```

### 4.2 Configuración Spring Boot — Firebase Admin SDK

```xml
<!-- pom.xml -->
<dependency>
    <groupId>com.google.firebase</groupId>
    <artifactId>firebase-admin</artifactId>
    <version>9.3.0</version>
</dependency>
```

```java
// FirebaseAuthFilter.java — se ejecuta en cada request
@Component
public class FirebaseAuthFilter extends OncePerRequestFilter {
    
    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws IOException, ServletException {
        
        String authHeader = request.getHeader("Authorization");
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            response.setStatus(401);
            return;
        }
        
        String idToken = authHeader.substring(7);
        
        try {
            // checkRevoked: true → verifica si el token fue revocado
            // (por ejemplo si el admin cambió el rol del usuario en FacturaEc)
            FirebaseToken decodedToken = FirebaseAuth.getInstance()
                .verifyIdToken(idToken, true); // checkRevoked = true OBLIGATORIO
            
            String companyId = (String) decodedToken.getClaims().get("companyId");
            String role = (String) decodedToken.getClaims().get("role");
            String uid = decodedToken.getUid();
            
            // Inyectar en el contexto de Spring Security
            UsernamePasswordAuthenticationToken auth =
                new UsernamePasswordAuthenticationToken(uid, null,
                    List.of(new SimpleGrantedAuthority("ROLE_" + role.toUpperCase())));
            auth.setDetails(Map.of("companyId", companyId, "uid", uid));
            SecurityContextHolder.getContext().setAuthentication(auth);
            
            filterChain.doFilter(request, response);
            
        } catch (FirebaseAuthException e) {
            response.setStatus(401);
            response.getWriter().write("{\"error\": \"INVALID_TOKEN\"}");
        }
    }
}
```

### 4.3 Llamada a Cloud Functions desde Spring Boot

Para operaciones de facturación desde el backend de Buseta (ej: facturación automática de abonos de ruta):

```java
// InvoiceService.java en Spring Boot
@Service
public class BusetaInvoiceService {
    
    private final RestTemplate restTemplate;
    
    // Usando Firebase Admin SDK — genera un custom token para el servidor
    // que el Cloud Function reconoce como super_admin o service_account
    public InvoiceResult createInvoiceForRoute(RoutePayment payment) {
        
        // Opción A: Llamar la Cloud Function onCall directamente con HTTP
        // El onCall de Firebase acepta requests HTTP con el token en Authorization
        String functionUrl = "https://us-central1-facturasproec.cloudfunctions.net/createAndEmitInvoice";
        
        // Generar un ID token de servicio usando Firebase Admin
        String serviceToken = FirebaseAuth.getInstance()
            .createCustomToken("buseta-service-account",
                Map.of("companyId", payment.getCompanyId(), "role", "seller"));
        
        // Construir el request al formato Firebase onCall
        Map<String, Object> body = Map.of(
            "data", Map.of(
                "companyId", payment.getCompanyId(),
                "externalId", "buseta-" + payment.getId(),
                "invoice", buildInvoicePayload(payment)
            )
        );
        
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(serviceToken);
        headers.setContentType(MediaType.APPLICATION_JSON);
        
        ResponseEntity<Map> response = restTemplate.exchange(
            functionUrl, HttpMethod.POST,
            new HttpEntity<>(body, headers),
            Map.class
        );
        
        // Polling: consultar checkSriStatus hasta obtener resultado
        String invoiceId = (String) ((Map) response.getBody().get("result")).get("invoiceId");
        return pollUntilAuthorized(invoiceId, payment.getCompanyId());
    }
}
```

### 4.4 Angular de Buseta — configuración @angular/fire

```typescript
// app.config.ts de Buseta — mismo proyecto Firebase que FacturaEc
export const appConfig: ApplicationConfig = {
  providers: [
    provideFirebaseApp(() => initializeApp({
      // Mismas credenciales de facturasproec
      apiKey: environment.firebaseApiKey,
      projectId: 'facturasproec',
      // ...
    })),
    provideAuth(() => getAuth()),
    provideFunctions(() => getFunctions()),  // Para llamar Cloud Functions
    // NO proveer Firestore si Buseta no lee datos de FacturaEc directamente
  ],
};
```

```typescript
// invoice.service.ts en Angular de Buseta
@Injectable({ providedIn: 'root' })
export class BusetaInvoiceService {
  private readonly fn = inject(Functions);
  
  createInvoice(payload: BusetaInvoicePayload): Observable<{ invoiceId: string }> {
    const createAndEmit = httpsCallable<BusetaInvoicePayload, { invoiceId: string }>(
      this.fn,
      'createAndEmitInvoice'
    );
    return from(createAndEmit(payload)).pipe(map(r => r.data));
  }
  
  checkStatus(invoiceId: string, companyId: string): Observable<SriStatus> {
    const checkStatus = httpsCallable(this.fn, 'checkSriStatus');
    return from(checkStatus({ invoiceId, companyId })).pipe(map(r => r.data as SriStatus));
  }
}
```

---

## 5. Análisis: Mayor Potencial del Sistema con una API Robusta

Esta sección responde la pregunta del usuario: **¿cómo le daría mayor potencial al sistema para disponibilidad de integraciones muy robustas?**

### 5.1 El salto conceptual: de SaaS cerrado a plataforma abierta

La arquitectura actual de FacturaEc es un SaaS con un solo punto de entrada: el frontend Angular. Toda la lógica SRI ya está encapsulada en Cloud Functions internas (`*Internal`). La diferencia entre un SaaS y una **plataforma** es si esa lógica está accesible para terceros.

```
SaaS cerrado (actual)          Plataforma abierta (propuesta)
═════════════════════          ═════════════════════════════
                               
Usuario → Angular → SRI        Usuario → Angular → SRI
                               Sistema externo → API → SRI
                               Flutter → SDK → SRI
                               Zapier → Webhook → SRI
                               ERP tercero → API → SRI
                               Chatbot → API → SRI
```

**El pipeline SRI ya está construido y funciona en producción.** El único trabajo es exponer ese pipeline de forma segura. Esto convierte años de trabajo de implementación SRI en una ventaja competitiva que ningún sistema externo puede replicar fácilmente.

### 5.2 Qué se gana con la API REST pública (ver PLAN_API_PUBLICA_TERCEROS.md)

| Capacidad | Sin API pública | Con API pública |
|-----------|----------------|-----------------|
| Clientes que pueden usar el sistema | Solo usuarios con acceso al frontend Angular | Cualquier sistema que haga HTTP |
| Integración con ERPs de clientes | Imposible sin acceso manual | Automática vía API |
| Modelo de negocio | Solo SaaS de usuario final | SaaS + API as a Service (precio por llamada) |
| Tiempo de integración para un tercero | Semanas/meses (acceso manual) | Horas (documentación OpenAPI + Postman collection) |
| Escalabilidad | Limitada a usuarios humanos | Escala con el volumen del tercero |

### 5.3 El diferencial del modelo híbrido onCall + REST

La arquitectura propuesta mantiene **dos superficies de API** en paralelo:

```
SUPERFICIE 1: Firebase onCall (actual + createAndEmitInvoice)
  → Para: Angular frontend, Flutter, clientes que usan Firebase SDK
  → Auth: Firebase ID Token (Firebase Auth)
  → Ventaja: Real-time con Firestore, sin latencia de autenticación extra
  → Desventaja: Requiere Firebase SDK instalado

SUPERFICIE 2: REST API pública (PLAN_API_PUBLICA_TERCEROS.md)
  → Para: Spring Boot, Python, Node.js, cualquier cliente HTTP
  → Auth: JWT propio (clientId + clientSecret)
  → Ventaja: Universal, sin dependencia de SDK Firebase
  → Desventaja: Sin real-time, polling para estado SRI
```

Esta dualidad es la clave de la robustez: un sistema con Firebase SDK usa `createAndEmitInvoice` directamente. Un sistema sin Firebase SDK usa el REST endpoint `POST /api/v1/invoices`.

### 5.4 Modelo de ingresos adicional: API as a Service

Una API pública bien documentada habilita un modelo de ingresos que el SaaS actual no tiene:

```
Plan actual:
  Empresa paga €X/mes por acceso al frontend

Con API pública:
  Empresa paga €X/mes por acceso al frontend
  +
  Developer/integrador paga €Y por llamadas API (sin usar el frontend)
  +
  Empresa que solo necesita facturación electrónica paga €Z/1000 facturas (standalone)
```

Los clientes `standalone` del plan (definidos en `PLAN_API_PUBLICA_TERCEROS.md` sección 2) son empresas que tienen su propio ERP pero necesitan la lógica SRI de Ecuador. No les interesa el frontend Angular. Solo quieren el pipeline XML → firma → SRI → PDF.

### 5.5 Disponibilidad robusta: qué significa en la práctica

**Problema actual:** Si el frontend Angular tiene un bug o está en mantenimiento, los usuarios no pueden emitir facturas.

**Con la API + createAndEmitInvoice:** Los sistemas integrados (Flutter, Buseta, ERPs) pueden seguir emitiendo facturas mientras el frontend Angular esté caído. El pipeline SRI es independiente del frontend.

**Diagrama de independencia de fallos:**

```
Escenario: Angular frontend caído por deploy

Sistema externo (Flutter / Buseta):
  → Llama createAndEmitInvoice (Cloud Function)
  → Cloud Function llama pipeline *Internal
  → Factura se genera y autoriza en SRI
  → FUNCIONA — independiente del frontend

Escenario: Cloud Function de un pipeline específico con error (ej: generatePdf)
  → La factura se autoriza en SRI (paso 3 completado)
  → El PDF falla pero el documento ya tiene valor legal
  → sriStatus: 'authorized', pdfError: 'Error generando PDF'
  → El sistema externo puede reintentar generatePdf por separado
  → FUNCIONA — el pipeline es tolerante a fallos parciales
```

### 5.6 Webhook + onSnapshot: notificaciones en tiempo real sin polling

Con el sistema de webhooks (Fase D de `PLAN_API_PUBLICA_TERCEROS.md`), los sistemas externos no necesitan hacer polling:

```
Sin webhooks:
  Sistema externo llama createAndEmitInvoice → polling cada 2s por 30s → respuesta

Con webhooks configurados:
  Sistema externo llama createAndEmitInvoice → retorna invoiceId inmediatamente
  SRI autoriza (15-30 segundos después)
  Firestore trigger detecta cambio de sriStatus
  dispatch-webhook.ts envía POST al URL del sistema externo
  Sistema externo actualiza su DB con el resultado
  ZERO polling — event-driven
```

Esto reduce latencia percibida, elimina llamadas innecesarias y hace el sistema completamente event-driven.

---

## 6. Ecosistema de Integraciones Posibles

Una API pública robusta habilita el siguiente ecosistema. No todo es urgente — es un mapa de posibilidades:

### 6.1 Integraciones inmediatas (habilitadas con Fase 0 + PLAN_API_PUBLICA_TERCEROS.md)

| Sistema | Integración | Valor |
|---------|-------------|-------|
| **Flutter (este proyecto)** | SDK Firebase onCall | Emisión móvil de facturas |
| **Buseta (Angular + Spring Boot)** | SSO Firebase + Cloud Functions | Facturación de transporte |
| **WhatsApp Business API** | El cliente pide factura por WhatsApp → webhook → createAndEmitInvoice | Facturación conversacional |
| **Telegram Bot** | Mismo patrón que WhatsApp | Canal alternativo |
| **Shopify** | Shopify webhook → REST API → factura automática por cada venta | E-commerce con facturación automática |
| **WooCommerce** | Plugin WooCommerce → REST API → pipeline SRI | Tiendas en línea |

### 6.2 Integraciones de mediano plazo

| Sistema | Integración | Valor |
|---------|-------------|-------|
| **Zapier / Make.com** | Trigger de cualquier app → REST API FacturaEc | 5000+ apps conectables sin código |
| **Odoo** | Módulo Python → REST API → pipeline SRI | Clientes con Odoo como ERP principal |
| **SAP Business One** | Integration SDK → REST API | Empresas medianas con SAP |
| **QuickBooks** | Webhook de venta → REST API → SRI Ecuador | Empresas que usan QBO globalmente |
| **Alegra** | Competidor que no tiene SRI Ecuador robusto | Migración de clientes Alegra |

### 6.3 Integraciones de largo plazo (plataforma madura)

| Sistema | Integración | Valor |
|---------|-------------|-------|
| **SDK generado automáticamente** | OpenAPI → openapi-generator → SDK para Python, Java, Dart, PHP | Reduce el tiempo de integración de horas a minutos |
| **Marketplace de integraciones** | Panel en Angular donde los tenants activan integraciones pre-construidas | Modelo similar a Zapier pero específico para FacturaEc |
| **API GraphQL** | Capa GraphQL sobre los endpoints REST para queries flexibles | Necesidad de desarrolladores avanzados |
| **Webhooks bidireccionales** | FacturaEc recibe webhooks de sistemas externos (Shopify, WooCommerce) | Reducción de polling en ambas direcciones |
| **Multi-ambiente en una sola API** | Un solo cliente API con dos ambientes: testing y production | Developer experience superior |

### 6.4 Integración específica: Zapier como multiplicador

```
Zapier trigger: "Nueva venta en Shopify"
        │
        ▼
Zapier action: "POST a FacturaEc API"
  {
    "companyId": "...",
    "invoice": {
      "customer": { ...datos de Shopify... },
      "lines": [ ...productos de Shopify... ],
      "paymentMethods": [ { "code": "17", "amount": ... } ]  // Tarjeta de crédito
    }
  }
        │
        ▼
FacturaEc: genera XML, firma, envía SRI, genera PDF
        │
        ▼
Zapier: recibe webhook con resultado
        │
        ▼
Zapier action: "Enviar email con PDF" o "Guardar en Google Drive" o "Notificar en Slack"
```

Con Zapier, cualquier empresa que vende en línea puede tener facturación electrónica automática sin escribir una línea de código.

---

## 7. Comparativa de Modelos de Integración

| Aspecto | Acceso directo Firestore | Firebase onCall (createAndEmitInvoice) | REST API pública |
|---------|-------------------------|----------------------------------------|------------------|
| Requiere Firebase SDK | Sí | Sí | No |
| Requiere Firebase Auth | Sí | Sí | No (JWT propio) |
| Soporta Spring Boot | Sí (Admin SDK) | Sí (Admin SDK) | Sí (HTTP estándar) |
| Soporta Python/PHP/Ruby | Con SDK | Con SDK | Sí |
| Real-time | Sí (onSnapshot) | No | No (webhooks sí) |
| Lógica de negocio del lado del cliente | Ninguna | Ninguna | Ninguna |
| Velocidad de integración | Alta (mismo SDK) | Alta (mismo SDK) | Media (nueva auth) |
| Rate limiting | Por reglas Firestore | Por función | Por JWT + Firestore |
| Documentación | Manual | Manual | OpenAPI auto-generada |
| Aislamiento multi-tenant | Rules Firestore | Claims JWT | JWT propio + reglas |

**Decisión:**

- **Flutter y clientes Firebase:** usar `createAndEmitInvoice` (onCall) — menos overhead
- **Spring Boot y ERPs sin Firebase:** usar REST API pública cuando esté disponible; en interim usar onCall con Admin SDK
- **Terceros externos (Zapier, Shopify, etc.):** REST API pública, nunca acceso directo a Firestore

---

## 8. Roadmap Unificado

```
FASE 0 — createAndEmitInvoice (3-4 días)
  ├─ create-and-emit-invoice.ts
  ├─ Normalización de totales
  ├─ Campo externalId
  ├─ Modo sync/async
  └─ Export en index.ts

FASE 1 — Flutter (4-6 semanas, puede empezar en paralelo con Fase 0)
  ├─ Semana 1-2: Dashboard + historial (solo lectura Firestore)
  ├─ Semana 3: Gestión de clientes (CRUD directo)
  ├─ Semana 3-4: Emisión de facturas (vía createAndEmitInvoice)
  └─ Semana 5-6: PDF/XML + catálogo de productos

FASE 2 — Buseta Spring Boot (3-4 semanas, paralelo con Flutter)
  ├─ Semana 1: Firebase Admin SDK en Spring Boot + FirebaseAuthFilter
  ├─ Semana 2: Angular Buseta con @angular/fire + login Firebase
  ├─ Semana 3: BusetaInvoiceService (llama createAndEmitInvoice)
  └─ Semana 4: UI de facturación en Angular Buseta

FASE 3 — API REST pública (12-16 días según PLAN_API_PUBLICA_TERCEROS.md)
  └─ Ver plan detallado en ese documento

FASE 4 — Ecosistema (continuo)
  ├─ Webhooks para Shopify/WooCommerce
  ├─ Conector Zapier
  └─ SDK auto-generado desde OpenAPI
```

**Paralelización posible:**

```
Semana 1-2:  [Fase 0]   [Fase 1 — Dashboard Flutter]
Semana 3-4:  [Fase 1 — Emisión Flutter]   [Fase 2 — Spring Boot SSO]
Semana 5-8:  [Fase 3 — API REST (Fases A + B)]   [Fase 2 — UI Buseta]
Semana 9-16: [Fase 3 — API REST (Fases C-F)]
```

---

## 9. Riesgos y Mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|
| `onInvoiceEmit` se dispara dos veces para documentos API | Media | Alto (doble envío al SRI) | El trigger ya verifica `sriStatus: null` antes de proceder — si un request duplicado llega, el segundo encuentra `sriStatus: 'pending'` y se cancela |
| Timeout del pipeline en modo sync | Media | Medio | Configurar `timeoutSeconds: 120` en la Cloud Function; el fallback es mode: 'async' |
| companyId manipulado por sistema externo | Baja | Crítico | `companyId` siempre del token JWT, nunca del body del request |
| Certificado .p12 accesible desde Flutter | Baja | Crítico | Storage rules auditadas: `/certificates/` bloqueado para clientes |
| onSnapshot sin limit en Flutter | Media | Alto (costo + crash) | Code review de cada query Firestore en el código Flutter antes de merge |
| Webhook enviado a URL maliciosa (SSRF) | Baja | Alto | Validar que el webhookUrl no es un IP privado (RFC 1918) antes de guardar |
| Doble facturación si el sistema externo reintenta | Media | Crítico | El campo `externalId` con índice único previene duplicados — si el sistema externo reenvía el mismo `externalId`, la Cloud Function retorna el documento existente |
| Token de Spring Boot no revocado en FacturaEc | Media | Medio | `checkRevoked: true` en `verifyIdToken` — si el admin cambia el rol en FacturaEc, Spring Boot rechaza el token en el próximo request |

---

## Resumen Ejecutivo

### Qué se construye

| Componente | Archivo | Estado | Días |
|-----------|---------|--------|------|
| `createAndEmitInvoice` | `functions/src/invoices/create-and-emit-invoice.ts` | **Pendiente — PRIORIDAD 1** | 3-4 |
| Módulos Flutter (lectura) | `flutter_app/lib/features/invoices/` | Pendiente | 5-7 |
| Módulos Flutter (emisión) | `flutter_app/lib/features/invoices/` | Pendiente | 5-7 |
| Spring Boot FirebaseAuthFilter | `buseta-backend/src/security/` | Pendiente | 2-3 |
| Angular Buseta con @angular/fire | `buseta-frontend/src/app/` | Pendiente | 3-4 |
| API REST pública completa | `functions/src/api-public/` | Ver plan PLAN_API_PUBLICA_TERCEROS.md | 12-16 |

### La apuesta estratégica

FacturaEc tiene construido en producción lo más difícil de Ecuador: firma XAdES-BES correcta, pipeline SRI completo, contabilidad doble entrada automática. Ese trabajo ya está hecho.

Exponer ese trabajo vía API pública convierte el sistema de un **SaaS de un solo canal** (el frontend Angular) a una **plataforma de facturación electrónica** que cualquier sistema puede usar. El mercado objetivo deja de ser solo empresas que usan el frontend, y pasa a incluir desarrolladores, integradores, y empresas con ERPs propios que necesitan la lógica SRI de Ecuador.

La función `createAndEmitInvoice` es el primer paso de esa transformación: resuelve el problema inmediato (Flutter y Buseta) sin modificar el pipeline existente, en 3-4 días de desarrollo.
