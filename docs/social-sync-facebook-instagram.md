# Plan de Implementación: Sincronización Social — Facebook, Instagram & Marketplace

**Proyecto:** SaasFacturacion  
**Fecha:** 2026-04-30  
**Alcance:** Sincronización automática de productos con Meta Catalog (Facebook Shop, Instagram Shopping, Facebook Marketplace) por empresa/tenant  
**Estado:** Pendiente de implementación

---

## Índice

1. [Resumen ejecutivo](#1-resumen-ejecutivo)
2. [Arquitectura general](#2-arquitectura-general)
3. [Prerequisitos y restricciones](#3-prerequisitos-y-restricciones)
4. [Fases de implementación](#4-fases-de-implementación)
   - [Fase 1 — Fundamentos (Schema + Meta Client)](#fase-1--fundamentos-schema--meta-client)
   - [Fase 2 — Sincronización en tiempo real](#fase-2--sincronización-en-tiempo-real)
   - [Fase 3 — OAuth y conexión de cuenta](#fase-3--oauth-y-conexión-de-cuenta)
   - [Fase 4 — Frontend settings](#fase-4--frontend-settings)
   - [Fase 5 — Sync programado y reconciliación](#fase-5--sync-programado-y-reconciliación)
   - [Fase 6 — Indicadores en lista de productos](#fase-6--indicadores-en-lista-de-productos)
5. [Modelo de datos detallado](#5-modelo-de-datos-detallado)
6. [Contratos de Cloud Functions](#6-contratos-de-cloud-functions)
7. [Reglas Firestore adicionales](#7-reglas-firestore-adicionales)
8. [Seguridad de tokens](#8-seguridad-de-tokens)
9. [Manejo de errores y reintentos](#9-manejo-de-errores-y-reintentos)
10. [Testing por fase](#10-testing-por-fase)
11. [Checklist general](#11-checklist-general)

---

## 1. Resumen ejecutivo

### Objetivo
Permitir que cada empresa (tenant) conecte su cuenta de Meta Business y sincronice automáticamente su catálogo de productos públicos con Facebook Shop, Instagram Shopping y/o Facebook Marketplace, de forma aislada por tenant.

### Principio base
- Si la empresa **no tiene** configuración de social sync → no se sincroniza nada. Cero impacto en empresas que no usen la feature.
- Si la empresa **tiene** la configuración pero está **deshabilitada** → tampoco se sincroniza.
- Solo se sincronizan productos con `isPublic = true` y `isActive = true`.

### Flujo de alto nivel
```
Producto cambia en Firestore
    └── onProductPublicSync (ya existe) → /public-catalogs/{slug}/products
    └── onProductSocialSync (NUEVO) → Meta Catalog API → FB Shop / IG / Marketplace
```

---

## 2. Arquitectura general

### Componentes nuevos

```
functions/src/social-sync/
├── meta-catalog-client.ts       Wrapper de la Meta Catalog Batch API
├── meta-product-mapper.ts       Mapea Product → Meta Catalog Item
├── on-product-social-sync.ts    Trigger Firestore → sync individual
├── scheduled-social-sync.ts     Reconciliación diaria completa
├── facebook-oauth.ts            onCall: intercambio de código OAuth
├── disconnect-social-sync.ts    onCall: revocar token y limpiar
└── trigger-manual-sync.ts       onCall: sync manual desde el frontend

src/app/features/settings/marketplace/
└── social-sync/
    ├── social-sync-settings.component.ts
    ├── social-sync-settings.component.scss
    └── facebook-connect-button.component.ts

src/app/features/products/
└── (modificar) products-list.component.ts   Columna de estado sync
```

### Paths Firestore nuevos

```
/companies/{companyId}
    └── marketplace.socialSync          Configuración por empresa (en doc existente)

/companies/{companyId}/social-sync-logs/{logId}
    └── Auditoría de cada operación de sync
```

---

## 3. Prerequisitos y restricciones

### Por parte del tenant (administrador de cada empresa)
- Cuenta activa en **Meta Business Manager**
- **Página de Facebook** vinculada al Business Manager
- Para Instagram Shopping: cuenta **Instagram Business o Creator** vinculada a la Página
- Para Marketplace nativo: la página debe estar aprobada para comercio en Meta (disponibilidad varía por país)

### Restricción importante — Ecuador
Facebook Marketplace con carrito nativo **no está disponible en Ecuador** a la fecha de este documento. La integración permitirá sincronizar el catálogo de Meta, lo que hace que los productos aparezcan con enlace al catálogo público de la app (`/catalogo/{slug}`). Esto funciona globalmente.

### Por parte de la plataforma
- Las imágenes de productos deben estar en URLs HTTPS públicas → Firebase Storage ya cumple esto.
- El catálogo público (`/public-catalogs/{slug}`) debe estar activo → prerequisito: `marketplace.enabled = true`.
- Acceso a **Meta Graph API** v18+ con permisos:
  - `catalog_management`
  - `business_management`
  - `pages_read_engagement`
  - `instagram_shopping_tag_products` (para IG)

### App de Meta requerida
Se necesita registrar una **Meta App** en developers.facebook.com con:
- Tipo: **Business**
- Productos habilitados: Facebook Login for Business, Commerce
- Redirect URI configurada: `https://{tu-dominio}/auth/facebook/callback`
- Variables de entorno: `META_APP_ID`, `META_APP_SECRET`

---

## 4. Fases de implementación

---

### Fase 1 — Fundamentos (Schema + Meta Client)

**Objetivo:** Establecer la base de datos y el cliente de la API sin tocar nada de producción.

**Duración estimada:** 1–2 días

#### 1.1 Actualizar interfaces TypeScript

**Archivo:** `src/app/features/settings/models/settings.interfaces.ts`

Agregar interfaz `SocialSyncConfig` y extender `CompanyConfig.marketplace`:

```typescript
// NUEVO
export type SocialSyncStatus = 'idle' | 'syncing' | 'success' | 'partial' | 'error';
export type SocialConnectStatus = 'connected' | 'disconnected' | 'error' | 'token_expired';

export interface FacebookSyncConfig {
  enabled: boolean;
  connectStatus: SocialConnectStatus;
  // Token se guarda en Firestore cifrado — nunca expuesto al frontend
  catalogId: string;
  pageId: string;
  pageName: string;
  connectedAt: Timestamp;
  connectedByUid: string;
  // Destinos activos:
  syncFacebookShop: boolean;
  syncInstagram: boolean;
  syncMarketplace: boolean;
  // Estado del último sync:
  lastSyncAt?: Timestamp;
  lastSyncStatus?: SocialSyncStatus;
  lastSyncError?: string;
  lastSyncCount?: number;
  lastSyncErrorCount?: number;
}

export interface SocialSyncConfig {
  facebook?: FacebookSyncConfig;
}

// En CompanyConfig.marketplace agregar:
// socialSync?: SocialSyncConfig;
```

**Archivo:** `functions/src/models/social-sync.model.ts` (NUEVO)

```typescript
export interface MetaCatalogItem {
  retailer_id: string;          // SKU del producto
  method: 'CREATE' | 'UPDATE' | 'DELETE' | 'UPSERT';
  data?: {
    name: string;
    description: string;
    price: string;              // Formato: "10.00 USD"
    availability: 'in stock' | 'out of stock' | 'preorder';
    condition: 'new' | 'refurbished' | 'used';
    link: string;               // URL al catálogo público del producto
    image_link: string;         // URL de imagen principal
    additional_image_link?: string; // Imágenes adicionales separadas por coma
    brand?: string;             // manufacturerName
    google_product_category?: string; // familyName
    retailer_product_group_id?: string; // familyId (para agrupar variantes)
  };
}

export interface SocialSyncLog {
  id?: string;
  platform: 'facebook';
  syncType: 'realtime' | 'scheduled' | 'manual';
  status: 'success' | 'partial' | 'error';
  totalProducts: number;
  syncedCount: number;
  errorCount: number;
  errors: Array<{ sku: string; message: string }>;
  startedAt: Timestamp;
  completedAt?: Timestamp;
}
```

#### 1.2 Crear Meta Catalog Client

**Archivo:** `functions/src/social-sync/meta-catalog-client.ts` (NUEVO)

Responsabilidades:
- Encapsular todas las llamadas a `graph.facebook.com/v18.0`
- Manejar rate limiting (Meta permite 200 req/hora por token)
- Batch de hasta 5000 items por request a `/{catalog-id}/items_batch`
- Renovar token cuando esté a menos de 7 días de expirar
- Lanzar errores tipados: `MetaAuthError`, `MetaRateLimitError`, `MetaApiError`

```typescript
// Firma pública del cliente
export class MetaCatalogClient {
  constructor(private accessToken: string, private catalogId: string) {}

  async upsertItems(items: MetaCatalogItem[]): Promise<MetaBatchResponse>
  async deleteItems(retailerIds: string[]): Promise<MetaBatchResponse>
  async getTokenInfo(): Promise<MetaTokenInfo>
  async refreshLongLivedToken(): Promise<string>
  async listCatalogs(businessId: string): Promise<MetaCatalog[]>
}
```

#### 1.3 Crear Product Mapper

**Archivo:** `functions/src/social-sync/meta-product-mapper.ts` (NUEVO)

```typescript
// Mapea un producto de Firestore al formato de Meta Catalog
export function toMetaItem(
  product: Product,
  slug: string,
  baseUrl: string  // dominio de la app, ej: "https://app.saasf.ec"
): MetaCatalogItem

// Calcula precio con IVA formateado para Meta
function formatPrice(salePrice: number, taxRate: number): string
// "12.50 USD" (precio final con IVA incluido)
```

#### 1.4 Helper de cifrado de tokens

**Archivo:** `functions/src/social-sync/token-cipher.ts` (NUEVO)

- Usar `crypto` de Node.js con AES-256-GCM
- La clave de cifrado se almacena en **Firebase Secret Manager** como `SOCIAL_SYNC_TOKEN_KEY`
- Funciones: `encryptToken(plain: string): string` y `decryptToken(cipher: string): string`

#### Checklist Fase 1
- [ ] Interfaz `FacebookSyncConfig` y `SocialSyncConfig` en `settings.interfaces.ts`
- [ ] Interfaz `MetaCatalogItem` y `SocialSyncLog` en `functions/src/models/social-sync.model.ts`
- [ ] `MetaCatalogClient` implementado con manejo de errores y batching
- [ ] `meta-product-mapper.ts` con mapeo completo y cálculo de precio con IVA
- [ ] `token-cipher.ts` con AES-256-GCM usando secreto de Secret Manager
- [ ] Secret `SOCIAL_SYNC_TOKEN_KEY` creado en Firebase Secret Manager (sin commitearlo)
- [ ] Variables de entorno `META_APP_ID` y `META_APP_SECRET` en Secret Manager

---

### Fase 2 — Sincronización en tiempo real

**Objetivo:** Cada vez que un producto cambia en Firestore, sincronizar automáticamente con Meta si la empresa tiene el sync activo.

**Duración estimada:** 1–2 días

#### 2.1 Cloud Function: `onProductSocialSync`

**Archivo:** `functions/src/social-sync/on-product-social-sync.ts` (NUEVO)

**Trigger:** `onDocumentWritten('companies/{companyId}/products/{productId}')`

**Lógica:**

```
1. Leer company doc → verificar marketplace.socialSync.facebook.enabled
2. Si no está habilitado → return early (no cost, no side effects)

3. Leer before/after del producto:
   - Si after == null (deleted) → DELETE en Meta
   - Si after.isActive == false || after.isPublic == false → DELETE en Meta
   - Si after.isActive == true && after.isPublic == true → UPSERT en Meta

4. Construir MetaCatalogItem usando meta-product-mapper.ts

5. Llamar MetaCatalogClient.upsertItems([item]) o deleteItems([sku])

6. Actualizar company doc:
   - marketplace.socialSync.facebook.lastSyncAt = now()
   - marketplace.socialSync.facebook.lastSyncStatus = 'success' | 'error'
   - marketplace.socialSync.facebook.lastSyncError = mensaje si error

7. Escribir SocialSyncLog en /companies/{companyId}/social-sync-logs/{logId}
```

**Manejo de errores:**
- `MetaAuthError` (código 190): cambiar `connectStatus = 'token_expired'`, no reintentar
- `MetaRateLimitError`: no lanzar error, programar retry en 1 minuto con Cloud Tasks
- `MetaApiError` genérico: loggear, marcar `lastSyncStatus = 'error'`, no bloquear

#### 2.2 Coexistencia con `onProductPublicSync` existente

El trigger existente (`on-product-public-sync.ts`) ya usa `onDocumentWritten` en la misma colección. No hay conflicto — Firebase permite múltiples funciones en el mismo trigger. Ambas se ejecutarán en paralelo.

No modificar `on-product-public-sync.ts`.

#### Checklist Fase 2
- [ ] `on-product-social-sync.ts` implementado con todos los casos (upsert / delete)
- [ ] Early return correcto cuando `socialSync` no está habilitado
- [ ] Escritura de `SocialSyncLog` en cada operación
- [ ] Actualización de `lastSyncAt` / `lastSyncStatus` en company doc
- [ ] Manejo de `MetaAuthError` → cambiar `connectStatus = 'token_expired'`
- [ ] Función registrada en `functions/src/index.ts`
- [ ] Deploy a emulador y probar con producto público → verificar llamada a Meta API (mock)

---

### Fase 3 — OAuth y conexión de cuenta

**Objetivo:** Flujo completo para que el admin de cada empresa conecte su cuenta de Meta Business de forma segura.

**Duración estimada:** 2–3 días

#### 3.1 Flujo OAuth de Meta

```
Admin hace click en "Conectar con Facebook"
    └── Frontend abre popup → graph.facebook.com/oauth/authorize
            params: client_id, redirect_uri, scope, state (= companyId + uid)
    └── Admin autoriza en Meta
    └── Meta redirige a /auth/facebook/callback?code=XXX&state=YYY
    └── Angular intercepta en AuthCallbackComponent
    └── Llama onCall facebookOAuthCallback({ code, state })
    └── Cloud Function:
            1. Valida state (companyId + uid, verificar que uid pertenece a empresa)
            2. Intercambia code por short-lived token
            3. Intercambia por long-lived token (60 días)
            4. Obtiene lista de catálogos disponibles del Business Manager
            5. Devuelve { catalogs, pages } al frontend
    └── Frontend muestra selector de catálogo y página
    └── Admin selecciona catálogo + página
    └── Frontend llama onCall saveFacebookConnection({ catalogId, pageId, pageName })
    └── Cloud Function:
            1. Cifra el long-lived token con token-cipher.ts
            2. Guarda en company doc:
                marketplace.socialSync.facebook = {
                  enabled: false,  // admin debe habilitarlo manualmente
                  connectStatus: 'connected',
                  accessToken: <cifrado>,
                  catalogId, pageId, pageName,
                  connectedAt: now(),
                  connectedByUid: uid,
                  syncFacebookShop: true,
                  syncInstagram: false,
                  syncMarketplace: false
                }
```

#### 3.2 Cloud Functions del OAuth

**`functions/src/social-sync/facebook-oauth.ts`** (NUEVO)

```typescript
// Función 1: intercambio de código OAuth
export const facebookOAuthExchange = onCall(async (request) => {
  // Verifica auth, extrae companyId del custom claim
  // POST a graph.facebook.com/oauth/access_token
  // Intercambia short-lived por long-lived token
  // Lista catálogos disponibles con /{user}/businesses
  // Devuelve { catalogs: [{id, name}], pages: [{id, name}] }
})

// Función 2: guardar conexión confirmada
export const saveFacebookConnection = onCall(async (request) => {
  // Verifica auth y rol admin
  // Cifra el token
  // Actualiza company doc
  // Devuelve { success: true }
})

// Función 3: desconectar
export const disconnectSocialSync = onCall(async (request) => {
  // Opcional: DELETE /{user}/permissions en Meta para revocar acceso
  // Borra token del company doc
  // connectStatus = 'disconnected', enabled = false
})
```

#### 3.3 Renovación automática de tokens

Meta long-lived tokens duran 60 días y se renuevan automáticamente si el usuario interactúa. Para garantizar continuidad:

**`functions/src/social-sync/scheduled-token-refresh.ts`** (NUEVO)

```
Schedule: todos los lunes a las 03:00 AM
Lógica:
  - Consultar todas las empresas con socialSync.facebook.connectStatus = 'connected'
  - Para cada una: llamar MetaCatalogClient.getTokenInfo()
  - Si expira en menos de 15 días: llamar refreshLongLivedToken()
  - Actualizar token cifrado en Firestore
  - Si falla: conectStatus = 'token_expired', no deshabilitar sync aún
```

#### Checklist Fase 3
- [ ] Meta App registrada en developers.facebook.com con permisos correctos
- [ ] `redirect_uri` configurada tanto para desarrollo (localhost) como producción
- [ ] `facebookOAuthExchange` onCall implementado
- [ ] `saveFacebookConnection` onCall implementado con cifrado de token
- [ ] `disconnectSocialSync` onCall implementado
- [ ] `scheduled-token-refresh.ts` implementado
- [ ] Validación de `state` anti-CSRF en el callback
- [ ] Verificación de que el uid que conecta tiene rol `admin` en la empresa
- [ ] Funciones registradas en `index.ts`

---

### Fase 4 — Frontend settings

**Objetivo:** Interfaz de administración para que cada empresa configure y controle su sincronización social.

**Duración estimada:** 2–3 días

#### 4.1 Estructura de componentes

```
src/app/features/settings/marketplace/social-sync/
├── social-sync-settings.component.ts        Componente principal (tab)
├── social-sync-settings.component.scss      Estilos
├── facebook-connect-button.component.ts     Botón OAuth con estados
└── facebook-connect-button.component.scss
```

#### 4.2 `social-sync-settings.component.ts`

Tab dentro de la pantalla de configuración de Marketplace. Secciones:

**Sección: Conexión**
```
┌─────────────────────────────────────────────────┐
│  Facebook / Instagram                           │
│                                                 │
│  [Icono FB]  No conectado                       │
│  [Botón: Conectar con Facebook]                 │
│                                                 │
│  — o si ya está conectado —                     │
│                                                 │
│  [Icono FB]  Conectado como "Óptica Visión EC"  │
│              Catálogo: "Productos Óptica"       │
│              Conectado el 15/03/2026            │
│  [Botón: Desconectar]                           │
└─────────────────────────────────────────────────┘
```

**Sección: Destinos (solo visible si conectado)**
```
┌─────────────────────────────────────────────────┐
│  Dónde publicar                                 │
│                                                 │
│  [toggle] Facebook Shop                         │
│  [toggle] Instagram Shopping                    │
│  [toggle] Facebook Marketplace                  │
│           ⚠ No disponible en Ecuador            │
└─────────────────────────────────────────────────┘
```

**Sección: Control**
```
┌─────────────────────────────────────────────────┐
│  Sincronización activa     [toggle ON/OFF]      │
│                                                 │
│  Último sync: hace 2 horas                      │
│  Productos sincronizados: 45                    │
│  Errores: 0                                     │
│                                                 │
│  [Botón: Sincronizar ahora]                     │
│  [Ver historial de sync]                        │
└─────────────────────────────────────────────────┘
```

#### 4.3 `facebook-connect-button.component.ts`

- Abre popup (window.open) hacia el endpoint OAuth de Meta
- Escucha `message` event del popup para recibir el código
- Muestra spinner durante el intercambio
- Muestra selector de catálogo/página si el intercambio fue exitoso

#### 4.4 Servicio frontend

**Archivo:** `src/app/features/settings/services/social-sync.service.ts` (NUEVO)

```typescript
@Injectable({ providedIn: 'root' })
export class SocialSyncService {
  // Llamadas a Cloud Functions
  exchangeFacebookCode(code: string): Observable<{ catalogs, pages }>
  saveFacebookConnection(payload): Observable<void>
  disconnect(): Observable<void>
  triggerManualSync(): Observable<{ jobId: string }>

  // Lectura reactiva del estado de sync
  getSyncStatus(companyId: string): Observable<FacebookSyncConfig>
  getSyncLogs(companyId: string, limit: number): Observable<SocialSyncLog[]>
}
```

#### 4.5 Integración en el routing existente

Agregar el tab "Redes Sociales" en el componente de settings de marketplace existente. No crear nueva ruta — es un tab adicional en la pantalla de marketplace settings.

#### Checklist Fase 4
- [ ] `social-sync-settings.component.ts` con las 3 secciones (conexión, destinos, control)
- [ ] `facebook-connect-button.component.ts` con flujo popup OAuth
- [ ] `SocialSyncService` con todas las llamadas a Cloud Functions
- [ ] Toggle habilitado/deshabilitado guarda en Firestore en tiempo real (debounce 500ms)
- [ ] Indicador de estado de token expirado con CTA para reconectar
- [ ] Mensaje de advertencia para Marketplace no disponible en Ecuador
- [ ] Scss separado (no inline styles), siguiendo patrón del proyecto
- [ ] Usar `cFormSelect` para selectores (patrón del proyecto)

---

### Fase 5 — Sync programado y reconciliación

**Objetivo:** Garantizar que el catálogo de Meta esté consistente incluso si hubo errores transitorios en el sync en tiempo real.

**Duración estimada:** 1 día

#### 5.1 `scheduled-social-sync.ts`

**Schedule:** Todos los días a las 02:00 AM (horario Ecuador, UTC-5)

**Lógica:**

```
1. Consultar todas las empresas activas con:
   - marketplace.enabled = true
   - marketplace.socialSync.facebook.enabled = true
   - marketplace.socialSync.facebook.connectStatus = 'connected'

2. Para cada empresa (procesadas en paralelo con límite de concurrencia 5):
   a. Descifrar access token
   b. Obtener TODOS los productos públicos/activos de Firestore
   c. Mapear a MetaCatalogItem[]
   d. Hacer UPSERT en batches de 5000 items
   e. Obtener retailer_ids actualmente en el catálogo de Meta
   f. Calcular diff: IDs en Meta que ya no están en Firestore → DELETE
   g. Escribir SocialSyncLog con resultado
   h. Actualizar company doc con lastSyncAt, lastSyncStatus, lastSyncCount

3. Si alguna empresa falla: loggear y continuar con las demás (no detener el batch)
```

#### 5.2 `trigger-manual-sync.ts` (onCall)

Permite disparar el sync de una empresa específica desde el frontend:

```typescript
export const triggerManualSync = onCall(async (request) => {
  // Verificar auth y rol admin
  // Llamar la misma lógica de scheduled-social-sync pero solo para esta empresa
  // Devuelve { syncedCount, errorCount, errors }
})
```

#### Checklist Fase 5
- [ ] `scheduled-social-sync.ts` con lógica de diff (upsert + delete)
- [ ] Concurrencia controlada (máximo 5 empresas en paralelo)
- [ ] `trigger-manual-sync.ts` implementado
- [ ] Escritura de `SocialSyncLog` en cada operación
- [ ] Schedule configurado en `firebase.json` o en la función con `onSchedule`
- [ ] Funciones registradas en `index.ts`

---

### Fase 6 — Indicadores en lista de productos

**Objetivo:** Visibilidad rápida del estado de sync por producto en la pantalla de lista.

**Duración estimada:** 0.5–1 día

#### 6.1 Cambios en `products-list.component.ts`

- Verificar si la empresa tiene `socialSync.facebook.enabled = true` (con `TenantService`)
- Si sí: mostrar columna adicional pequeña con íconos de FB/IG
- Solo mostrar para productos con `isPublic = true`
- Tooltip al pasar el mouse: "Sincronizado con Facebook Shop e Instagram"

No se necesita almacenar el estado de sync por producto en Firestore — si el producto es `isPublic = true`, `isActive = true` y la empresa tiene sync habilitado, se asume que está sincronizado. El estado de error se refleja en el `lastSyncStatus` de la empresa.

#### 6.2 Opcional: estado de error por producto

Si se quiere granularidad por producto (para el caso de que falle solo un producto específico):

```
/companies/{companyId}/products/{productId}
  └── socialSyncStatus?: {
        facebook?: 'synced' | 'error' | 'excluded';
        facebookError?: string;
        facebookSyncedAt?: Timestamp;
      }
```

Este campo lo escribe `on-product-social-sync.ts`. En la lista se muestra un ícono de advertencia si `socialSyncStatus.facebook = 'error'`.

#### Checklist Fase 6
- [ ] Columna de iconos en `products-list.component.ts` solo si sync está habilitado
- [ ] Tooltip informativo con destinos activos
- [ ] Ícono de error/advertencia si `socialSyncStatus.facebook = 'error'`
- [ ] Sin impacto de rendimiento — usar signal del TenantService ya existente

---

## 5. Modelo de datos detallado

### Campo `marketplace.socialSync` en `/companies/{companyId}`

```typescript
{
  marketplace: {
    // ... campos existentes sin cambios ...
    
    socialSync: {
      facebook: {
        enabled: false,
        connectStatus: 'disconnected',     // 'connected' | 'disconnected' | 'error' | 'token_expired'
        accessToken: '',                    // cifrado con AES-256-GCM
        catalogId: '',
        pageId: '',
        pageName: '',
        connectedAt: null,
        connectedByUid: '',
        syncFacebookShop: true,
        syncInstagram: false,
        syncMarketplace: false,
        lastSyncAt: null,
        lastSyncStatus: null,              // 'success' | 'partial' | 'error'
        lastSyncError: null,
        lastSyncCount: 0,
        lastSyncErrorCount: 0
      }
    }
  }
}
```

### Colección `/companies/{companyId}/social-sync-logs/{logId}`

```typescript
{
  platform: 'facebook',
  syncType: 'realtime' | 'scheduled' | 'manual',
  status: 'success' | 'partial' | 'error',
  totalProducts: 45,
  syncedCount: 44,
  errorCount: 1,
  errors: [
    { sku: 'LENTE001', message: 'Image URL returned 404' }
  ],
  startedAt: Timestamp,
  completedAt: Timestamp
}
```

### Campo opcional en `/companies/{companyId}/products/{productId}`

```typescript
{
  // ... campos existentes sin cambios ...
  
  socialSyncStatus: {
    facebook: 'synced',          // 'synced' | 'error' | 'excluded'
    facebookError: null,
    facebookSyncedAt: Timestamp
  }
}
```

---

## 6. Contratos de Cloud Functions

### `facebookOAuthExchange` (onCall)

**Request:**
```typescript
{ code: string }
```

**Response:**
```typescript
{
  catalogs: Array<{ id: string; name: string }>;
  pages: Array<{ id: string; name: string }>;
  tempToken: string;   // token temporal (no long-lived), para el siguiente paso
}
```

**Errores:**
- `permission-denied` — usuario no autenticado
- `invalid-argument` — code inválido o expirado
- `failed-precondition` — empresa no tiene marketplace habilitado

### `saveFacebookConnection` (onCall)

**Request:**
```typescript
{
  tempToken: string;
  catalogId: string;
  pageId: string;
  pageName: string;
  syncFacebookShop: boolean;
  syncInstagram: boolean;
  syncMarketplace: boolean;
}
```

**Response:**
```typescript
{ success: true }
```

### `disconnectSocialSync` (onCall)

**Request:**
```typescript
{ platform: 'facebook' }
```

**Response:**
```typescript
{ success: true }
```

### `triggerManualSync` (onCall)

**Request:**
```typescript
{ platform: 'facebook' }
```

**Response:**
```typescript
{
  syncedCount: number;
  errorCount: number;
  errors: Array<{ sku: string; message: string }>;
  durationMs: number;
}
```

---

## 7. Reglas Firestore adicionales

Agregar en `firestore.rules`:

```javascript
// Logs de social sync — solo lectura para admin de la empresa
match /companies/{companyId}/social-sync-logs/{logId} {
  allow read: if isCompanyAdmin(companyId);
  allow write: if false;   // Solo Cloud Functions escriben aquí
}

// Helper isCompanyAdmin ya debe existir — verifica custom claims
```

El campo `marketplace.socialSync.facebook.accessToken` nunca debe ser leído desde el frontend. Las reglas deben asegurar que este campo no sea retornado:

```javascript
match /companies/{companyId} {
  allow read: if isCompanyMember(companyId)
    && !('accessToken' in resource.data.marketplace.socialSync.facebook);
  // Alternativa: usar Cloud Function para leer el doc y omitir el token
}
```

**Alternativa recomendada:** Mover el token a una subcolección separada con acceso restringido:

```
/companies/{companyId}/social-credentials/facebook
  └── accessToken: string (cifrado)
  └── Regla: allow read/write: if false  (solo Cloud Functions)
```

---

## 8. Seguridad de tokens

### Almacenamiento del Access Token de Meta

Opciones en orden de preferencia:

| Opción | Seguridad | Complejidad |
|---|---|---|
| **Firebase Secret Manager** (recomendado para tokens de sistema) | Alta | Media |
| **AES-256-GCM en Firestore** con clave en Secret Manager | Alta | Baja |
| Firestore en texto plano | Baja | Muy baja — NO USAR |

**Opción elegida:** AES-256-GCM en Firestore

- Razón: cada empresa tiene su propio token (Secret Manager no es ideal para secretos dinámicos por tenant)
- La clave de cifrado (`SOCIAL_SYNC_TOKEN_KEY`) sí va en Secret Manager como un único secreto de plataforma
- El token cifrado se guarda en `/companies/{companyId}/social-credentials/facebook.accessToken`

### Meta App Credentials

```
META_APP_ID       → Firebase Secret Manager
META_APP_SECRET   → Firebase Secret Manager
SOCIAL_SYNC_TOKEN_KEY  → Firebase Secret Manager
```

Nunca en `.env` commiteados, nunca en código fuente.

---

## 9. Manejo de errores y reintentos

### Errores de la Meta API

| Código | Tipo | Acción |
|---|---|---|
| 190 | Token inválido/expirado | `connectStatus = 'token_expired'`, no reintentar, notificar admin |
| 4, 17, 32 | Rate limit | Esperar y reintentar con backoff exponencial |
| 100 | Parámetro inválido | Loggear, marcar producto con error, no bloquear otros |
| 200 | Permiso denegado | `connectStatus = 'error'`, notificar admin |
| 500+ | Error de servidor Meta | Reintentar hasta 3 veces con backoff |

### Estrategia de reintentos en tiempo real (`on-product-social-sync`)

- **Rate limit o error 5xx**: No lanzar error en la CF (evita reintento infinito de Firebase). En su lugar, escribir en una cola de reintentos:
  ```
  /companies/{companyId}/social-sync-queue/{productId}
  └── retryAt: Timestamp (now + 5 min)
  └── retries: number
  └── payload: MetaCatalogItem
  ```
  El `scheduled-social-sync` procesa esta cola como parte de su ejecución.

- **Error de token**: No encolar. Detener todos los syncs hasta que el admin reconecte.

- **Error de producto específico** (imagen 404, nombre muy largo): Loggear, continuar con otros productos, marcar ese producto con `socialSyncStatus.facebook = 'error'`.

---

## 10. Testing por fase

### Fase 1
- Unit test de `meta-product-mapper.ts` — casos: producto con IVA 0%, 12%, 15%; sin imagen; sin fabricante
- Unit test de `token-cipher.ts` — encrypt → decrypt round-trip
- Unit test de `MetaCatalogClient` con Mock de fetch

### Fase 2
- Test de integración con Firebase Emulator Suite
- Crear producto `isPublic=true` → verificar llamada a MetaCatalogClient (mock)
- Cambiar producto a `isPublic=false` → verificar llamada DELETE
- Desactivar producto → verificar llamada DELETE
- Empresa sin socialSync configurado → verificar que no se llama MetaCatalogClient

### Fase 3
- Test del flujo OAuth completo en entorno de staging con Meta Test App
- Verificar que el token se cifra antes de guardarse en Firestore
- Verificar que el token NO aparece en las Firestore Rules (leer doc desde cliente)

### Fase 4
- E2E manual del flujo completo: conectar FB → habilitar sync → cambiar producto → verificar en Meta
- Verificar que el toggle de sync guarda correctamente con debounce

### Fase 5
- Ejecutar `scheduled-social-sync` manualmente en emulador con 100+ productos
- Verificar diff correcto (upsert + delete)
- Simular empresa con token expirado — verificar que no se cuelga el batch

### Fase 6
- Verificar que la columna de íconos NO aparece si socialSync está deshabilitado
- Verificar que el ícono de error aparece cuando `socialSyncStatus.facebook = 'error'`

---

## 11. Checklist general

### Infraestructura
- [ ] Meta App creada en developers.facebook.com
- [ ] Permisos de la app aprobados: `catalog_management`, `business_management`, `pages_read_engagement`, `instagram_shopping_tag_products`
- [ ] `META_APP_ID` y `META_APP_SECRET` en Firebase Secret Manager
- [ ] `SOCIAL_SYNC_TOKEN_KEY` (32 bytes random) en Firebase Secret Manager
- [ ] Redirect URI configurada en la Meta App para producción y localhost

### Cloud Functions
- [ ] `meta-catalog-client.ts`
- [ ] `meta-product-mapper.ts`
- [ ] `token-cipher.ts`
- [ ] `on-product-social-sync.ts`
- [ ] `facebook-oauth.ts` (facebookOAuthExchange + saveFacebookConnection)
- [ ] `disconnect-social-sync.ts`
- [ ] `trigger-manual-sync.ts`
- [ ] `scheduled-social-sync.ts`
- [ ] `scheduled-token-refresh.ts`
- [ ] Todas registradas en `functions/src/index.ts`

### Modelos y schema
- [ ] `SocialSyncConfig` / `FacebookSyncConfig` en `settings.interfaces.ts`
- [ ] `MetaCatalogItem` / `SocialSyncLog` en `functions/src/models/`
- [ ] Campo `socialSyncStatus` en `product.interface.ts` (opcional)

### Frontend
- [ ] `social-sync-settings.component.ts` + scss
- [ ] `facebook-connect-button.component.ts` + scss
- [ ] `SocialSyncService`
- [ ] Tab "Redes Sociales" integrado en marketplace settings
- [ ] Columna de íconos en `products-list.component.ts`

### Seguridad
- [ ] Reglas Firestore para `social-sync-logs`
- [ ] Subcolección `social-credentials` con acceso `allow read/write: if false`
- [ ] Verificación de rol admin en todas las onCall functions
- [ ] Token nunca expuesto al frontend

### Documentación
- [ ] Variables de entorno documentadas en README de functions
- [ ] Pasos de configuración de Meta App documentados para el equipo de soporte

---

## Notas finales

### Sobre la disponibilidad de Facebook Marketplace en Ecuador
A la fecha (2026-04-30), Facebook Marketplace Commerce (con carrito integrado) tiene disponibilidad limitada por país. Se implementará el toggle pero con advertencia clara en el UI. Los productos del catálogo de Meta pueden aparecer como listados con enlace externo al catálogo público de la app (`/catalogo/{slug}/producto/{sku}`), lo cual es la alternativa funcional global.

### Escalabilidad del sync programado
Con 1000+ empresas activas, el scheduled sync podría superar el timeout de Cloud Functions (540 segundos). Si se llega a ese umbral, migrar a **Cloud Tasks** para procesar empresas en cola de forma distribuida. El diseño actual facilita esa migración ya que la lógica de sync por empresa está encapsulada.

### Extensibilidad futura
El schema `socialSync` está diseñado para agregar otras plataformas sin breaking changes:
```typescript
socialSync: {
  facebook?: FacebookSyncConfig;
  // Futuro:
  tiktok?: TikTokSyncConfig;
  google?: GoogleMerchantSyncConfig;
}
```


Crear app
