# Plan de Evolución — Marketplace / Catálogo Público
> FacturaSec · Última actualización: 2026-04-27

---

## Índice

1. [Visión general](#1-visión-general)
2. [Estado actual — implementado](#2-estado-actual--implementado)
3. [Arquitectura técnica actual](#3-arquitectura-técnica-actual)
4. [Fase 2 — Carrito profesional](#4-fase-2--carrito-profesional)
5. [Fase 3 — Pedidos y checkout](#5-fase-3--pedidos-y-checkout)
6. [Fase 4 — Experiencia de compra avanzada](#6-fase-4--experiencia-de-compra-avanzada)
7. [Fase 5 — Analytics y CRM básico](#7-fase-5--analytics-y-crm-básico)
8. [Reglas Firestore pendientes](#8-reglas-firestore-pendientes)
9. [Mapa de archivos](#9-mapa-de-archivos)

---

## 1. Visión general

El catálogo público de FacturaSec es un **mini e-commerce embebido en el SaaS** que permite a cada empresa tenant exponer sus productos sin que el visitante necesite cuenta. La URL sigue el patrón:

```
https://app.facturasec.com/c/{slug}
```

El objetivo final es que un negocio ecuatoriano pueda:

- Mostrar su catálogo con precios e imágenes
- Recibir pedidos via WhatsApp o directamente en plataforma
- Convertir esos pedidos en facturas electrónicas con un clic
- Ver métricas de qué productos interesan más a sus clientes

---

## 2. Estado actual — implementado

### 2.1 Infraestructura Firestore

| Colección | Descripción |
|---|---|
| `public-catalogs/{slug}` | Config del catálogo: colores, whatsapp, flags de visibilidad |
| `public-catalogs/{slug}/products/{id}` | Productos públicos sincronizados desde el tenant |
| `public-catalogs/{slug}/product-likes/{productId}` | Contadores de likes en tiempo real |

### 2.2 Módulo Angular — `src/app/features/marketplace/`

```
marketplace/
├── models/
│   └── catalog.interface.ts          ← PublicCatalog, PublicProduct
├── services/
│   ├── public-catalog.service.ts     ← onSnapshot de catálogo y productos
│   ├── catalog-search.service.ts     ← signal centralizado de búsqueda
│   └── cart.service.ts               ← CartService con signals + localStorage
└── catalog/
    ├── catalog-shell.component.*     ← Layout: header sticky, footer, router-outlet
    ├── catalog-list.component.*      ← Grid/Lista, filtros, sidebar, likes
    ├── catalog-detail.component.*    ← Galería, precio con IVA, relacionados
    └── cart-drawer.component.*       ← Panel lateral del carrito
```

### 2.3 Funcionalidades operativas

#### Catálogo
- [x] Header sticky con color primario del tenant (`--catalog-primary`)
- [x] Buscador en header con signal centralizado (texto visible corregido)
- [x] Vista grid y lista con toggle
- [x] Sidebar: categorías por familia, filtro "solo disponibles", top vendidos
- [x] Mini carrusel de imágenes por tarjeta (hasta 4 imágenes)
- [x] Badges: Agotado, ★ Más vendido
- [x] Responsive mobile con sidebar como drawer
- [x] Skeleton loader durante carga

#### Detalle de producto
- [x] Galería con carrusel + miniaturas + swipe táctil
- [x] Precio con IVA desglosado
- [x] Pill de stock (En stock / Agotado / Servicio)
- [x] Botón WhatsApp con mensaje pre-llenado del producto
- [x] Compartir (Web Share API / fallback clipboard)
- [x] Productos relacionados (misma familia)

#### Me gusta (Likes)
- [x] Toggle like por producto
- [x] **Persistencia real en Firestore** (`product-likes/{productId}`)
- [x] Contadores en tiempo real via `onSnapshot`
- [x] Anti-duplicado por browser via `localStorage`
- [x] Sort "Más vendidos" usa contadores reales

#### Carrito de compras
- [x] `CartService` singleton con signals: `items`, `totalItems`, `totalPrice`
- [x] Persistencia en `localStorage` (survives page reload)
- [x] Badge en header actualizado en tiempo real
- [x] `CartDrawerComponent`: panel slide-in desde la derecha
  - Lista de items con imagen, nombre, precio unitario
  - Stepper de cantidad (−/+) por item
  - Eliminar item individual
  - Total general
  - Botón "Enviar pedido por WhatsApp" con mensaje completo
  - Botón "Vaciar carrito"
- [x] Botón "Agregar al carrito" en cada card de lista/grid con feedback visual verde
- [x] Stepper de cantidad en página de detalle antes de agregar
- [x] Optimistic UI: el carrito responde de inmediato

---

## 3. Arquitectura técnica actual

```
Visitante (anónimo)
       │
       ▼
Angular SPA (/c/{slug})
       │
       ├─ CatalogShellComponent (layout, header, cart drawer)
       │       └─ CartService (signal store + localStorage)
       │
       ├─ CatalogListComponent (productos, filtros, likes)
       │       ├─ PublicCatalogService (onSnapshot)
       │       └─ CatalogSearchService (signal query)
       │
       └─ CatalogDetailComponent (galería, detalle, qty, add to cart)

Firestore (reglas públicas)
       ├─ public-catalogs/{slug}
       ├─ public-catalogs/{slug}/products/
       └─ public-catalogs/{slug}/product-likes/
```

**Sin autenticación requerida.** Todo el catálogo público es read-only anónimo. Los likes y el carrito operan sin cuenta.

---

## 4. Fase 2 — Carrito profesional

> Objetivo: hacer el carrito indistinguible de uno de Shopify o MercadoLibre, sin requerir cuenta de usuario.

### 4.1 Variantes de producto

Permitir seleccionar talla, color, capacidad, etc. antes de agregar al carrito.

**Modelo de datos (ya existe en Firestore):**
```
public-catalogs/{slug}/products/{id}/variants/{variantId}
  {
    label: string,        // "Talla M", "Color Rojo"
    attributes: { [key]: string },
    stockAvailable: number,
    priceModifier: number // +/- sobre el precio base
  }
```

**Cambios Angular:**
- En `catalog-detail`: selector de variantes antes del botón agregar
- `CartItem` incluye `variantId?: string` y `variantLabel?: string`
- En el drawer mostrar la variante seleccionada

**Prioridad:** Alta — muchos negocios (ropa, calzado, electrónica) lo necesitan.

---

### 4.2 Cantidad máxima respetando stock

Actualmente se puede agregar qty ilimitada. Debe limitarse al `stockAvailable`.

**Cambios:**
- `incrementQty()` en detail: `qty.update(q => Math.min(q + 1, product().stockAvailable))`
- En el drawer: `increment()` también limitado por `item.product.stockAvailable`
- Badge rojo si qty == stockAvailable: "Máximo disponible"

---

### 4.3 Nota por item

El cliente puede agregar una observación por producto (ej: "sin cebolla", "grabado personalizado").

**UI:** campo de texto opcional debajo de cada item en el drawer.

**CartItem extendido:**
```typescript
interface CartItem {
  product: PublicProduct;
  catalogSlug: string;
  qty: number;
  variantId?: string;
  variantLabel?: string;
  note?: string;           // ← nuevo
}
```

---

### 4.4 Resumen del carrito mejorado

En el drawer footer:

```
─────────────────────────────
Subtotal (sin IVA)    $45.00
IVA 15%               $ 6.75
─────────────────────────────
Total                 $51.75
─────────────────────────────
```

Separar subtotal base e IVA total. Mucho más profesional y legal en Ecuador.

---

### 4.5 Indicador de progreso "mínimo de pedido"

Si el tenant configura un monto mínimo de pedido, mostrar barra de progreso:

```
Pedido mínimo: $20
[████████░░] $16 de $20 — agrega $4 más para continuar
```

**Config en `public-catalogs/{slug}`:**
```typescript
minOrderAmount?: number;
```

---

### 4.6 Animación "fly to cart"

Al tocar "Agregar" en la lista, la imagen del producto vuela hacia el ícono del carrito con una animación CSS (`translate` + `scale` + `opacity`). Efecto muy popular en apps de delivery.

**Implementación:** `AnimationBuilder` de Angular o CSS keyframes con posición calculada via `getBoundingClientRect()`.

---

## 5. Fase 3 — Pedidos y checkout

> Objetivo: que el pedido quede registrado en Firestore y el tenant lo reciba en su panel interno.

### 5.1 Formulario de checkout mínimo

Antes de enviar el pedido, capturar datos del comprador:

```
Nombre completo *
Teléfono *
Email (opcional)
Dirección de entrega (opcional)
Notas adicionales
```

**Componente:** `checkout-form.component` que reemplaza el botón directo de WhatsApp.

**Flujo:**
1. Usuario llena formulario → validación básica (nombre + teléfono requeridos)
2. Se crea documento en Firestore
3. Se redirige a WhatsApp con número de pedido incluido en el mensaje

---

### 5.2 Persistencia de pedidos en Firestore

```
public-catalogs/{slug}/orders/{orderId}
  {
    orderId: string,          // generado automáticamente
    status: 'pending' | 'confirmed' | 'cancelled',
    customer: {
      name: string,
      phone: string,
      email?: string,
      address?: string
    },
    items: [
      {
        productId: string,
        productName: string,
        variantLabel?: string,
        qty: number,
        unitPrice: number,     // precio con IVA al momento del pedido
        subtotal: number,
        note?: string
      }
    ],
    totals: {
      subtotal: number,        // sin IVA
      taxAmount: number,
      total: number
    },
    note?: string,
    channel: 'whatsapp' | 'direct',
    createdAt: Timestamp,
    updatedAt: Timestamp
  }
```

**Reglas Firestore:**
```
match /public-catalogs/{slug}/orders/{orderId} {
  allow create: if request.resource.data.status == 'pending'
                && request.resource.data.customer.name is string
                && request.resource.data.customer.phone is string;
  allow read: if false;  // solo el tenant via panel admin
  allow update, delete: if false;
}
```

---

### 5.3 Panel de pedidos en el tenant (módulo interno)

Nueva sección en el panel admin del tenant:

```
/app/marketplace/orders
```

Tabla con:
- N° pedido, fecha, cliente, total, estado
- Acciones: Confirmar, Ver detalle, Convertir a Factura (integración con módulo de facturas)

**Esta es la killer feature:** el pedido del catálogo público se convierte en factura electrónica con un clic.

---

### 5.4 Notificaciones push al tenant

Cuando llega un pedido nuevo → Cloud Function dispara notificación:
- Email al admin del tenant
- (Opcional) Notificación push en el panel vía FCM

**Cloud Function trigger:**
```typescript
onDocumentCreated('public-catalogs/{slug}/orders/{orderId}', async (event) => {
  // Obtener companyId desde public-catalogs/{slug}
  // Enviar email al admin con resumen del pedido
});
```

---

### 5.5 Número de pedido legible

En vez de IDs de Firestore, generar un número correlativo legible:

```
PED-2026-001
PED-2026-002
```

Usando el mismo patrón de contadores atómicos (`runTransaction`) que ya tiene el proyecto para facturas.

---

## 6. Fase 4 — Experiencia de compra avanzada

### 6.1 Wishlist (lista de deseos)

Separar "me gusta" (interés) de "guardar para después" (intención de compra). El visitante puede crear una wishlist sin cuenta y compartirla via URL.

**Storage:** `localStorage` + URL params serializados (base64).

---

### 6.2 Búsqueda avanzada con filtros de precio

En el sidebar, agregar rango de precio:

```
Precio
[   $0  ] ──────●────── [  $200 ]
```

Slider doble CSS puro o con `@angular/cdk`.

---

### 6.3 Vista de producto con zoom

En la galería del detalle, al hacer hover/tap en la imagen, mostrar zoom tipo lupa o lightbox fullscreen.

---

### 6.4 Productos recientemente vistos

Barra horizontal al pie de cualquier página del catálogo con los últimos 5 productos visitados. Persistir en `localStorage`.

---

### 6.5 Compartir catálogo

Botón en el header para compartir el catálogo completo o un producto específico:
- Copiar enlace
- QR code generado en cliente (librería `qrcode`)
- Compartir por WhatsApp directamente

---

### 6.6 Modo oscuro del catálogo

Toggle en el header. Respetar `prefers-color-scheme` del sistema. Definir tokens CSS dark en el shell.

---

### 6.7 PWA — Instalar el catálogo

Convertir el catálogo en una Progressive Web App instalable:
- `manifest.webmanifest` dinámico con nombre y color del tenant
- Service Worker para cache offline de productos y imágenes
- Prompt de instalación "Agrega a tu pantalla de inicio"

Esto es especialmente valioso para negocios cuyos clientes visitan el catálogo frecuentemente.

---

## 7. Fase 5 — Analytics y CRM básico

### 7.1 Eventos de comportamiento

Registrar en Firestore (anónimo, sin PII) los siguientes eventos:

| Evento | Colección |
|---|---|
| Vista de producto | `catalog-views/{slug}/events/` |
| Like | ya implementado en `product-likes` |
| Agregar al carrito | `catalog-events` |
| Inicio de checkout | `catalog-events` |
| Pedido completado | `orders` |

**Funnel de conversión:**
```
Vista → Like → Carrito → Checkout → Pedido
100%    35%     18%        12%        8%
```

### 7.2 Dashboard de analytics para el tenant

Nueva tab en el panel interno:

```
/app/marketplace/analytics
```

Métricas:
- Productos más vistos (últimos 7/30 días)
- Tasa de conversión por producto
- Horarios de mayor tráfico
- Embudo de conversión

Datos calculados por Cloud Functions y almacenados en documentos de agregación para evitar lecturas costosas.

---

### 7.3 Recuperación de carrito abandonado

Si el visitante dejó items en el carrito y volvió días después → mostrar un banner:

```
🛒 Tienes 3 productos guardados. ¿Quieres continuar tu pedido?
[Ver carrito]  [Limpiar]
```

Ya está implementado (localStorage persiste). Solo falta el banner de bienvenida.

---

## 8. Reglas Firestore pendientes

### Ya deployadas

```javascript
// product-likes — escritura pública con validación
match /public-catalogs/{slug}/product-likes/{productId} {
  allow read: if true;
  allow write: if request.resource.data.keys().hasOnly(['count', 'updatedAt'])
               && request.resource.data.count is int
               && request.resource.data.count >= 0;
}
```

### Pendientes de agregar

```javascript
// orders — el visitante puede crear, el tenant lee desde Admin SDK
match /public-catalogs/{slug}/orders/{orderId} {
  allow create: if request.resource.data.status == 'pending'
                && request.resource.data.customer.name is string
                && request.resource.data.customer.phone is string
                && request.resource.data.items.size() > 0;
  allow read, update, delete: if false;
}

// catalog-events — telemetría anónima
match /public-catalogs/{slug}/catalog-events/{eventId} {
  allow create: if request.resource.data.type is string
                && request.resource.data.createdAt != null;
  allow read, update, delete: if false;
}
```

**Deploy:**
```bash
firebase deploy --only firestore:rules
```

---

## 9. Mapa de archivos

### Actuales (implementados)

```
src/app/features/marketplace/
├── models/
│   └── catalog.interface.ts
├── services/
│   ├── public-catalog.service.ts    ← getCatalogBySlug, getPublicProducts,
│   │                                   getLikesForCatalog, toggleProductLike
│   ├── catalog-search.service.ts
│   └── cart.service.ts              ← addItem, removeItem, updateQty, clear
├── catalog/
│   ├── catalog-shell.component.*    ← header, footer, cart drawer, badge
│   ├── catalog-list.component.*     ← grid, lista, filtros, sidebar, botón agregar
│   ├── catalog-detail.component.*   ← galería, stepper, botón agregar
│   └── cart-drawer.component.*      ← panel carrito
└── marketplace.routes.ts
```

### Por crear (fases 2-5)

```
marketplace/
├── models/
│   └── order.interface.ts            ← Fase 3
├── services/
│   └── catalog-orders.service.ts     ← Fase 3
├── catalog/
│   ├── checkout-form.component.*     ← Fase 3
│   ├── product-variants.component.*  ← Fase 2
│   └── order-confirmation.component.* ← Fase 3
└── admin/                            ← Módulo interno del tenant
    ├── orders-list.component.*       ← Fase 3
    ├── order-detail.component.*      ← Fase 3
    └── marketplace-analytics.component.* ← Fase 5

functions/src/
├── catalogOrderCreated.ts            ← Fase 3 - notificación al tenant
└── catalogAnalyticsAggregate.ts      ← Fase 5 - cron de agregación
```

---

## Priorización recomendada

| Prioridad | Fase | Feature | Impacto | Esfuerzo |
|---|---|---|---|---|
| 🔴 1 | 2 | Resumen con IVA desglosado en drawer | Alto | Bajo |
| 🔴 2 | 3 | Formulario checkout + pedido en Firestore | Muy alto | Medio |
| 🔴 3 | 3 | Panel de pedidos en tenant | Muy alto | Medio |
| 🟡 4 | 2 | Variantes de producto | Alto | Medio |
| 🟡 5 | 3 | Convertir pedido → factura | Muy alto | Alto |
| 🟡 6 | 4 | Recuperación de carrito abandonado | Medio | Bajo |
| 🟢 7 | 3 | Notificaciones email al tenant | Alto | Bajo |
| 🟢 8 | 4 | PWA instalable | Medio | Medio |
| 🟢 9 | 5 | Dashboard analytics | Alto | Alto |
| ⚪ 10 | 2 | Animación fly to cart | Bajo | Bajo |
