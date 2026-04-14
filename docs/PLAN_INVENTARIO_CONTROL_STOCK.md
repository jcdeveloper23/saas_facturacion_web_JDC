# Plan de Control de Inventario — SaasFacturacion Ecuador

**Versión:** 1.1  
**Fecha:** 2026-04-13  
**Estado:** Pendiente implementación  
**Autor:** CEO Agent (análisis) + Jean Carlos Rodríguez (revisión)

---

## 1. Diagnóstico del estado actual

### Lo que YA existe y funciona

| Componente | Archivo | Estado |
|---|---|---|
| Schema `Product` con campos de stock | `products/models/product.interface.ts` | ✅ Completo |
| Schema `ProductStock` (por almacén) | `products/models/product.interface.ts:87` | ✅ Completo |
| Schema `StockMovement` (log inmutable) | `products/models/product.interface.ts:141` | ✅ Completo |
| Schema `StockTransfer` (entre almacenes) | `products/models/product.interface.ts:173` | ✅ Completo |
| `ProductsService.recordSale()` | `products/services/products.service.ts:203` | ✅ Implementado |
| `ProductsService.recordPurchase()` | `products/services/products.service.ts:264` | ✅ Implementado |
| `ProductsService.adjustStock()` | `products/services/products.service.ts:139` | ✅ Funcional |
| UI: overview de stock + ajuste manual | `stock/stock-overview.component.ts` | ✅ Funcional |
| UI: log de movimientos (lectura) | `stock/stock-movements.component.ts` | ✅ Funcional |
| Reglas Firestore de stock | `firestore.rules` | ✅ Correctas |
| Índices Firestore básicos de movimientos | `firestore.indexes.json` | ✅ Parciales |

### El bloqueo crítico

> **`recordSale()` y `recordPurchase()` existen y son correctos pero NUNCA se llaman desde ningún flujo de negocio.**
>
> `onInvoiceEmit` (`functions/src/invoices/on-invoice-emit.ts`) ejecuta el pipeline SRI completo (XML → firma → SRI → PDF → email) pero **no tiene ninguna línea de lógica de stock**. Se puede facturar sin límite y el inventario no se mueve.

### Problema adicional — Los tres modos de facturación

El sistema soporta (o debe soportar) tres modos de emisión, y el stock debe moverse en **todos** ellos:

| Modo | Descripción | `sriStatus` al emitir | ¿Mueve stock? |
|---|---|---|---|
| **Básica** | Factura interna sin envío a SRI (empresas no obligadas, pruebas, etc.) | `'not_required'` | ✅ Sí |
| **Avanzada** | Factura con numeración controlada, sin XML/SRI | `'not_required'` | ✅ Sí |
| **Electrónica** | Factura con XML firmado y enviado al SRI | `null` → `'pending'` → `'authorized'` | ✅ Sí |

**Problema detectado en `onInvoiceEmit`:**  
La condición actual `!after.sriStatus` haría que el pipeline SRI se dispare incluso para facturas básicas si no se inicializa `sriStatus` correctamente. El frontend debe establecer `sriStatus: 'not_required'` en el momento de crear/emitir facturas no electrónicas.

**Regla de diseño confirmada:**  
> El trigger de stock (`onInvoiceStock`) escucha **únicamente** `status → 'issued'`.  
> No depende de `sriStatus` en absoluto. Son dos pipelines completamente independientes.

```
status → 'issued'
   │
   ├─── onInvoiceStock  (SIEMPRE — básica, avanzada, electrónica)
   │         └── descuenta stock, registra StockMovement tipo 'sale'
   │
   └─── onInvoiceEmit   (SOLO si sriStatus es null/undefined — electrónica)
             └── XML → firma → SRI → PDF → email

status → 'void'
   └─── onInvoiceStock  (si stockProcessed === true)
             └── restaura stock, registra StockMovement tipo 'return_sale'
```

### Gaps identificados

| # | Gap | Severidad |
|---|---|---|
| G1 | `onInvoiceStock` CF no existe — ningún modo de facturación descuenta stock | 🔴 Crítico |
| G2 | Sin validación de disponibilidad en formulario de factura | 🔴 Crítico |
| G3 | Anulación de factura (`void`) no restaura stock | 🔴 Crítico |
| G4 | Frontend no establece `sriStatus: 'not_required'` para facturas no electrónicas | 🟠 Alto |
| G5 | Nota de crédito no restaura stock (`return_sale`) | 🟠 Alto |
| G6 | Sin módulo de compras — `recordPurchase()` está huérfano | 🟠 Alto |
| G7 | `StockTransfer` modelado pero sin UI ni Cloud Function | 🟡 Medio |
| G8 | Índices Firestore faltantes para filtro `type + createdAt` | 🟡 Medio |
| G9 | Facturas históricas sin movimientos (backfill) | 🟡 Medio |
| G10 | `stockReserved` nunca se actualiza | 🔵 Bajo (futuro) |

---

## 2. Colecciones Firestore — Paths de referencia

```
/companies/{companyId}/
  ├── products/{productId}                     ← Product (stockQty, stockAvailable CF-maintained)
  │   └── stocks/{warehouseCode}               ← ProductStock (qty, available, reserved por almacén)
  ├── stock-movements/{movementId}             ← StockMovement (log inmutable)
  ├── stock-transfers/{transferId}             ← StockTransfer (entre almacenes)
  ├── invoices/{invoiceId}                     ← Invoice (campo stockProcessed: boolean a añadir)
  └── purchases/{purchaseId}                   ← Purchase (NUEVA colección — Fase D)
```

### Nuevo campo en `Invoice` (Fase A)
```typescript
stockProcessed: boolean   // true = CF ya procesó el stock (idempotencia)
stockProcessedAt?: Timestamp
```

### Nueva colección `Purchase` (Fase D)
```
/companies/{companyId}/purchases/{purchaseId}
  status:        'draft' | 'ordered' | 'received' | 'partial' | 'cancelled'
  supplierId:    string
  supplierName:  string             // denormalized
  warehouseCode: string
  warehouseName: string             // denormalized
  lines:         PurchaseLine[]
    ├── productId:    string
    ├── productSku:   string
    ├── productName:  string
    ├── qty:          number
    ├── qtyReceived:  number        // para recepciones parciales
    └── unitCost:     number
  totalCost:     number
  notes?:        string
  receivedAt?:   Timestamp
  stockProcessed: boolean
  createdBy:     string
  createdAt:     Timestamp
  updatedAt:     Timestamp
```

---

## 3. Plan de implementación por fases

---

### FASE A — Conectar facturación con stock (todos los modos)
**Prioridad:** Máxima  
**Esfuerzo estimado:** 2 días  
**Agente:** Cloud Functions Agent + Angular Agent  
**Dependencias:** Ninguna — todo el código de soporte ya existe

#### A0. Corrección en el frontend — `sriStatus` para facturas no electrónicas

**Archivo:** `src/app/features/invoices/invoice-form.component.ts` + `invoices.service.ts`

Cuando se emite una factura que NO requiere SRI (modo básico o avanzado), el frontend debe escribir `sriStatus: 'not_required'` al crear/actualizar el documento. Esto garantiza que `onInvoiceEmit` no intente procesarla por SRI.

```typescript
// En InvoiceCreateInput / save(), cuando !company.sriEnabled:
sriStatus: 'not_required'
```

La bandera que decide si es electrónica proviene de la configuración de la empresa:
`companies/{companyId}/configuration/main.sriEnabled: boolean`

> **Regla clara:** `onInvoiceEmit` ya tiene el guard `!after.sriStatus`. Si `sriStatus === 'not_required'`, el pipeline SRI no corre. No hay que modificar `onInvoiceEmit`.

#### A1. Crear `functions/src/stock/on-invoice-stock.ts`

**Trigger:** `onDocumentUpdated('companies/{companyId}/invoices/{invoiceId}')`

Este trigger maneja **tres eventos** en el ciclo de vida de una factura:

---

**Evento 1 — Emisión** (`draft/any → 'issued'`)

Aplica a: facturación básica, avanzada y electrónica. No depende de `sriStatus`.

```typescript
const isNewIssuance = before.status !== 'issued' && after.status === 'issued'
                      && !after.stockProcessed;
```

Pipeline por línea (productos con `trackStock=true` y `noStock=false`):
```
1. Resolver almacén: line.warehouseCode ?? invoice.warehouseCode ?? config.defaultWarehouseCode
2. runTransaction:
   a. Leer invoice → guard: if (stockProcessed === true) return  ← idempotencia
   b. Leer ProductStock del almacén resuelto
   c. Decrementar: ProductStock.qty -= qty, ProductStock.available -= qty
   d. Decrementar: Product.stockQty -= qty, Product.stockAvailable -= qty
   e. Escribir StockMovement { type: 'sale', qtyDelta: -qty, sourceDocId: invoiceId, sourceDocType: 'invoice' }
   f. invoice.stockProcessed = true, stockProcessedAt = now()
```

---

**Evento 2 — Anulación** (`issued/paid → 'void'`)

```typescript
const isVoiding = before.status !== 'void' && after.status === 'void'
                  && after.stockProcessed === true
                  && !after.stockRestored;
```

Pipeline — reversa exacta de la emisión:
```
Por cada línea del invoice (mismo criterio trackStock/noStock):
  runTransaction:
    a. Guard: if (stockRestored === true) return
    b. Incrementar: ProductStock.qty += qty, ProductStock.available += qty
    c. Incrementar: Product.stockQty += qty, Product.stockAvailable += qty
    d. Escribir StockMovement { type: 'return_sale', qtyDelta: +qty, sourceDocId: invoiceId }
    e. invoice.stockRestored = true, stockRestoredAt = now()
```

---

**Evento 3 — Nota de Crédito** (`isCreditNote = true`, `draft → 'issued'`)

Ya queda cubierto por el Evento 1 — misma condición, misma lógica de descuento. Si la nota de crédito es una devolución de productos físicos, los productos de la nota de crédito son los que se devuelven al inventario.

> **Nota:** La nota de crédito *descuenta* stock de los productos que incluye en sus líneas (porque es un nuevo documento emitido). La *restauración* del stock de la factura original ocurre al anular esa factura original (Evento 2). No son la misma operación.

#### A2. Nuevos campos en interfaz `Invoice`

```typescript
// src/app/features/invoices/models/invoice.interface.ts
stockProcessed?:   boolean;    // true = CF procesó el egreso al emitir
stockProcessedAt?: Timestamp;
stockRestored?:    boolean;    // true = CF restauró el stock al anular
stockRestoredAt?:  Timestamp;
```

#### A3. Exportar en `functions/src/index.ts`

```typescript
// Stock
export { onInvoiceStock } from './stock/on-invoice-stock';
```

#### A4. Pruebas con Firebase Emulator — secuencia completa

```
── Escenario 1: Factura básica (sriStatus: 'not_required') ─────────────────
1. Producto A: trackStock=true, stockQty=10
2. Crear factura básica (sriStatus='not_required'), qty=3, emitir
3. ✅ product.stockQty = 7
4. ✅ stock-movements: doc tipo 'sale', qtyDelta=-3
5. ✅ onInvoiceEmit NO se dispara (sriStatus ya estaba seteado)
6. Anular la factura
7. ✅ product.stockQty = 10
8. ✅ stock-movements: doc tipo 'return_sale', qtyDelta=+3

── Escenario 2: Factura electrónica ────────────────────────────────────────
1. Producto B: trackStock=true, stockQty=5
2. Emitir factura electrónica (sriStatus=null al crear)
3. ✅ onInvoiceStock se dispara: product.stockQty = 2
4. ✅ onInvoiceEmit se dispara: sriStatus → 'pending' → 'authorized'
5. Ambos pipelines corren de forma independiente ← clave

── Escenario 3: Idempotencia ───────────────────────────────────────────────
1. Simular retry del trigger de stock
2. ✅ product.stockQty NO cambia (guard stockProcessed === true)

── Escenario 4: Producto tipo servicio ─────────────────────────────────────
1. Producto C: type='service', noStock=true
2. Emitir factura con Producto C
3. ✅ No se genera StockMovement (noStock=true, se omite)
```

---

### FASE B — Validación de disponibilidad en formulario de factura
**Prioridad:** Alta  
**Esfuerzo estimado:** 1 día  
**Agente:** Angular Agent  
**Dependencias:** Fase A completa (para que la validación sea contra datos reales)

#### B1. Leer stock al seleccionar producto en una línea

En `invoice-form.component.ts`, al asignar `productId` a una línea:

```typescript
// Llamar solo si trackStock=true && noStock=false && type !== 'service'
const stocks = await this.productsSvc.getStocks(productId);
const warehouseStock = stocks.find(s => s.warehouseCode === this.activeWarehouse());
line.stockAvailable = warehouseStock?.available ?? 0;
line.trackStock = product.trackStock;
```

#### B2. Mostrar indicador de disponibilidad

En el HTML de la línea de factura, junto al campo de cantidad:
- ✅ Verde: `qty <= stockAvailable`
- ⚠️ Amarillo: `qty > stockAvailable && stockAvailable > 0`
- 🔴 Rojo: `stockAvailable === 0` (sin stock)
- Mostrar tooltip: "Disponible: X unidades en almacén Y"

#### B3. Comportamiento configurable por empresa

En `companies/{companyId}/configuration/main`:
```typescript
stock: {
  blockSaleOnInsufficient: boolean  // false = advertir, true = bloquear botón Emitir
  warnOnInsufficient: boolean       // default: true
}
```

El botón "Emitir" se deshabilita solo si `blockSaleOnInsufficient === true` Y hay alguna línea con stock insuficiente.

---

### FASE C — Índices Firestore y optimización de consultas
**Prioridad:** Media  
**Esfuerzo estimado:** 0.5 días  
**Agente:** Firebase Agent  
**Dependencias:** Ninguna

#### C1. Nuevos índices en `firestore.indexes.json`

```json
{
  "collectionGroup": "stock-movements",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "type",      "order": "ASCENDING" },
    { "fieldPath": "createdAt", "order": "DESCENDING" }
  ]
},
{
  "collectionGroup": "stock-movements",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "type",          "order": "ASCENDING" },
    { "fieldPath": "warehouseCode", "order": "ASCENDING" },
    { "fieldPath": "createdAt",     "order": "DESCENDING" }
  ]
},
{
  "collectionGroup": "stock-movements",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "sourceDocId", "order": "ASCENDING" },
    { "fieldPath": "createdAt",   "order": "DESCENDING" }
  ]
},
{
  "collectionGroup": "purchases",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "status",    "order": "ASCENDING" },
    { "fieldPath": "createdAt", "order": "DESCENDING" }
  ]
}
```

#### C2. Optimizar `StockService.getAllMovements()`

Mover los filtros `type` y `warehouseCode` a la query de Firestore (actualmente se aplican en cliente), aprovechando los nuevos índices.

#### C3. Desplegar
```bash
firebase deploy --only firestore:indexes
```

---

### FASE D — Módulo de Compras / Ingresos de inventario
**Prioridad:** Alta  
**Esfuerzo estimado:** 3–4 días  
**Agentes:** Angular Agent + Firebase Agent + Cloud Functions Agent  
**Dependencias:** Fase A (para que la lógica de `recordPurchase` esté alineada)

#### D1. Interfaz y modelo
- Crear `src/app/features/purchases/models/purchase.interface.ts`
- Definir `Purchase`, `PurchaseLine`, `PurchaseStatus`

#### D2. Servicio Angular
- Crear `src/app/features/purchases/services/purchases.service.ts`
- Operaciones: `create()`, `update()`, `markReceived()`, `getAll()`, `getById()`
- `markReceived()` solo cambia `status → 'received'`; la CF hace el resto

#### D3. Componentes UI
- `purchases-list.component` — mismo patrón visual que artículos y personas
  - Seg-tabs: Todos / Borrador / Pendiente / Recibido / Cancelado
  - Búsqueda por proveedor, referencia
  - Tabla: proveedor, almacén, # líneas, costo total, estado, fecha
- `purchase-form.component` — formulario de orden de compra
  - Selector de proveedor (de colección personas con rol `supplier`)
  - Selector de almacén destino
  - Tabla de líneas con autocompletado de producto
  - Botón "Marcar como recibida" → cambia status, dispara CF

#### D4. Rutas
```typescript
// src/app/features/purchases/purchases.routes.ts
{ path: '',    component: PurchasesListComponent },
{ path: 'new', component: PurchaseFormComponent },
{ path: ':id/edit', component: PurchaseFormComponent }
```

Registrar en `app.routes.ts` con `moduleGuard: 'stock'`.

#### D5. Navegación
En `_nav.ts`, bajo la sección Almacén:
```typescript
{ name: 'Compras',    url: '/purchases',  icon: 'nav-icon-bullet' }
```

#### D6. Cloud Function `onPurchaseReceive`
- Archivo: `functions/src/stock/on-purchase-receive.ts`
- Trigger: `onDocumentUpdated('companies/{companyId}/purchases/{purchaseId}')`
- Condición: `before.status !== 'received' && after.status === 'received' && !after.stockProcessed`
- Lógica por línea: llamar equivalente a `recordPurchase()` en Admin SDK
  - Incrementar `ProductStock.qty`, `ProductStock.available`
  - Incrementar `Product.stockQty`, `Product.stockAvailable`
  - Actualizar `Product.averageCost` (costo promedio ponderado)
  - Escribir `StockMovement` tipo `'purchase'`
- Mismo patrón de idempotencia con `runTransaction`

#### D7. Reglas Firestore
```
match /purchases/{id} {
  allow read:   if isAuthenticated() && belongsToCompany(companyId);
  allow create: if isAuthenticated() && belongsToCompany(companyId) && canWrite();
  allow update: if isAuthenticated() && belongsToCompany(companyId) && canWrite()
                 && resource.data.status != 'received';
  allow delete: if isAuthenticated() && belongsToCompany(companyId) && isAdmin()
                 && resource.data.status == 'draft';
}
```

---

### FASE E — Transferencias entre almacenes
**Prioridad:** Media  
**Esfuerzo estimado:** 2–3 días  
**Agentes:** Angular Agent + Cloud Functions Agent  
**Dependencias:** Fase A, Fase D  

El schema `StockTransfer` ya está definido en `product.interface.ts:173`. Solo falta implementar la operación.

#### E1. Componentes UI
- `stock-transfers.component` — lista de transferencias
  - Seg-tabs: Borrador / En tránsito / Recibidas / Canceladas
- `stock-transfer-form.component` — formulario
  - Almacén origen → Almacén destino
  - Tabla de líneas (producto, cantidad)
  - Estados: Borrador → Enviar (→ IN_TRANSIT) → Confirmar recepción (→ RECEIVED)

#### E2. Rutas
Agregar en `src/app/features/stock/stock.routes.ts`:
```typescript
{ path: 'transfers',        component: StockTransfersComponent },
{ path: 'transfers/new',    component: StockTransferFormComponent },
{ path: 'transfers/:id/edit', component: StockTransferFormComponent }
```

#### E3. Cloud Function `onTransferUpdate`
- Archivo: `functions/src/stock/on-transfer-update.ts`
- Trigger: `onDocumentUpdated('companies/{companyId}/stock-transfers/{transferId}')`

Dos eventos relevantes:

**Al pasar a `IN_TRANSIT`:**
- Marcar `ProductStock.pendingReceive += qty` en almacén destino (indicador visual)

**Al pasar a `RECEIVED`:**
- Ejecutar `runTransaction`:
  - `ProductStock[origen].qty -= qty`
  - `ProductStock[origen].available -= qty`
  - `ProductStock[destino].qty += qty`
  - `ProductStock[destino].available += qty`
  - `ProductStock[destino].pendingReceive -= qty`
  - Escribir dos `StockMovement`: tipo `transfer_out` (origen) y `transfer_in` (destino)
  - `transfer.stockProcessed = true`
- El agregado `Product.stockQty` NO cambia (misma empresa, mismo total)

---

### FASE F — Script de backfill histórico
**Prioridad:** Media (ejecutar una sola vez tras Fase A)  
**Esfuerzo estimado:** 0.5 días  
**Agente:** Cloud Functions Agent / DevOps Agent  

Las facturas emitidas antes de la Fase A tienen `stockProcessed === undefined`. El inventario está desincronizado históricamente.

#### F1. Script `scripts/backfill-stock-movements.ts`

```
1. Consultar todas las invoices con status === 'issued' && !stockProcessed
2. Para cada invoice, ejecutar la misma lógica de onInvoiceStock
3. Registrar en un log cuántas facturas se procesaron y cuántas fallaron
4. Marcar invoice.stockProcessed = true al terminar cada una
```

**Ejecución:** Una sola vez contra producción, en horario de baja actividad, con backup previo.

---

## 4. Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Factura básica sin `sriStatus:'not_required'` dispara SRI | Alta | Alto | A0: frontend setea `sriStatus` según `config.sriEnabled` al crear/emitir |
| Doble descuento de stock por retry de CF | Media | Crítico | `runTransaction` con guard `stockProcessed` dentro de la transacción |
| Anulación sin restaurar stock | Media | Alto | Evento 2 en `onInvoiceStock` escucha `status → 'void'` con guard `stockRestored` |
| Stock negativo por ventas concurrentes | Baja | Alto | Validación en CF con `runTransaction`; frontend solo advierte, no garantiza |
| Almacén no resuelto en ninguna de las tres fuentes | Alta | Medio | Cascada: `line.warehouseCode` → `invoice.warehouseCode` → `config.defaultWarehouseCode`; si falta loguear warning y omitir línea |
| Backfill rompe stock histórico | Media | Alto | Ejecutar con emulador primero; backup Firestore antes de producción |
| `seller` escribe movimientos desde cliente | Baja | Medio | Reglas Firestore: `stock-movements` solo escribible por admin/CF (Admin SDK bypasea) |
| Nota de crédito parcial (cantidades distintas a la original) | Media | Medio | Fase A: se descuenta lo que diga la nota de crédito, no la factura original; correcto por diseño |
| `sriEnabled` no existe en `configuration/main` | Alta | Medio | Fallback seguro: si no existe la configuración, tratar como `sriEnabled: false` (básica) |

---

## 5. Checklist de prerequisitos antes de Fase A

- [ ] Verificar que existe `companies/{companyId}/configuration/main` con campo `defaultWarehouseCode`
- [ ] Verificar / agregar campo `sriEnabled: boolean` en `companies/{companyId}/configuration/main`
- [ ] Verificar que `invoices` tienen campo `warehouseCode` (nivel invoice) y opcionalmente por línea
- [ ] Confirmar que `Product.trackStock` y `Product.noStock` están correctamente seteados en datos de prueba
- [ ] Confirmar que `Product.type` ('product' | 'service') está seteado correctamente
- [ ] Tener al menos un almacén configurado en `settings/warehouses`
- [ ] Firebase Emulator Suite funcionando localmente
- [ ] Revisar si existen facturas emitidas sin `sriStatus` seteado (riesgo de disparo doble en SRI)

---

## 6. Árbol de archivos a crear/modificar

```
functions/src/
  stock/                                    ← NUEVA carpeta
    on-invoice-stock.ts                     ← NUEVO (Fase A) — emisión + anulación + NC
    on-purchase-receive.ts                  ← NUEVO (Fase D)
    on-transfer-update.ts                   ← NUEVO (Fase E)
  index.ts                                  ← MODIFICAR (agregar exports de stock)

src/app/features/
  invoices/
    models/
      invoice.interface.ts                  ← MODIFICAR (Fase A: stockProcessed, stockRestored, sriEnabled)
    services/
      invoices.service.ts                   ← MODIFICAR (Fase A0: setear sriStatus según sriEnabled)
    invoice-form.component.ts               ← MODIFICAR (Fase A0: sriStatus al emitir; Fase B: validación stock)
  purchases/                                ← NUEVA carpeta (Fase D)
    models/
      purchase.interface.ts
    services/
      purchases.service.ts
    purchases-list.component.ts
    purchases-list.component.html
    purchases-form.component.ts
    purchases-form.component.html
    purchases.routes.ts
  stock/
    stock-transfers.component.ts            ← NUEVO (Fase E)
    stock-transfers.component.html          ← NUEVO (Fase E)
    stock-transfer-form.component.ts        ← NUEVO (Fase E)
    stock-transfer-form.component.html      ← NUEVO (Fase E)
    stock.routes.ts                         ← MODIFICAR (agregar rutas transfers)
    stock-movements.component.ts            ← MODIFICAR (Fase C: mover filtros a Firestore)

src/app/
  app.routes.ts                             ← MODIFICAR (agregar /purchases)

firestore.rules                             ← MODIFICAR (Fase D: reglas purchases)
firestore.indexes.json                      ← MODIFICAR (Fase C: nuevos índices)

scripts/
  backfill-stock-movements.ts               ← NUEVO (Fase F)
```

---

## 7. Orden de ejecución recomendado

```
Fase C (índices)     →  Fase A (CF on-invoice-stock)
                              ↓
                         Fase B (validación frontend)
                              ↓
                         Fase F (backfill histórico)
                              ↓
                         Fase D (módulo compras)
                              ↓
                         Fase E (transferencias)
```

Fase C no tiene dependencias y se puede hacer en paralelo con Fase A.

---

## 8. Definición de "listo" por fase

| Fase | Criterio de aceptación |
|---|---|
| A | Emitir factura → `stock-movements` recibe doc `sale` → `product.stockQty` decrece. Emitir nota de crédito → `stock-movements` recibe `return_sale` → stock restaurado. Retry no duplica. |
| B | Al agregar línea con producto sin stock, aparece badge de advertencia. Con `blockSaleOnInsufficient=true`, botón Emitir se deshabilita. |
| C | `stock-movements.component` aplica filtros en Firestore. Sin errores de índice faltante en console. |
| D | Crear orden de compra → marcar como recibida → `product.stockQty` incrementa → `product.averageCost` recalculado. |
| E | Crear transferencia → marcar IN_TRANSIT → confirmar recepción → stock disminuye en origen y aumenta en destino. `product.stockQty` total sin cambio. |
| F | Todas las facturas históricas tienen `stockProcessed=true`. El stock actual refleja la historia de ventas. |
