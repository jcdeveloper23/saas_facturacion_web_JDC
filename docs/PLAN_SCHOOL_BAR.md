# `pkg_school_bar` — Administración de Bares Escolares Ecuador
## Documento Estratégico Completo

> **Versión:** 1.3 — 2026-06-01
> **Estado:** Fase 1 MVP implementada con correcciones estructurales pendientes — ver [Diagnóstico](#diagnóstico-estratégico-v13)
> **Restricción absoluta:** Este módulo se integra sobre la arquitectura existente sin cambios al core. Sigue el patrón `pkg_*` de `enabledPackages`. No se crean arquitecturas paralelas de inventario, productos ni POS.

---

## Índice

0. [Estado de Implementación](#0-estado-de-implementación)
0b. [Diagnóstico Estratégico v1.3](#diagnóstico-estratégico-v13)
1. [Análisis de Negocio Real](#1-análisis-de-negocio-real--bares-escolares-ecuador)
2. [Benchmark Competitivo — Paymon](#2-benchmark-competitivo--paymon-ecuador)
3. [Módulos Funcionales](#3-módulos-funcionales-del-pkg_school_bar)
4. [Flujos Operativos Completos](#4-flujos-operativos-completos)
5. [Modelo de Datos](#5-modelo-de-datos)
6. [Identificación Inteligente QR/NFC](#6-identificación-inteligente-qrnfc)
7. [Sistema de Recargas y Wallet Estudiantil](#7-sistema-de-recargas-y-wallet-estudiantil)
8. [UX/UI — Experiencia por Rol](#8-uxui--experiencia-por-rol)
9. [Monetización SaaS](#9-monetización-saas)
10. [Roadmap por Fases](#10-roadmap-por-fases)
11. [Backlog Estructurado](#11-backlog-estructurado)
12. [Ventajas Competitivas](#12-ventajas-competitivas-propuestas)
13. [Integración con el Sistema Existente](#13-integración-con-el-sistema-existente)

---

## 0. Estado de Implementación

> Actualizado: 2026-06-01

### ✅ Completado (Fase 1 MVP)

| Artefacto | Archivo |
|-----------|---------|
| Seed `pkg_school_bar` | `src/app/core/seed/plugin-packages-seed.ts` |
| Permisos MODULE_METADATA (11 módulos) | `src/app/core/interfaces/permission.interface.ts` |
| Interfaces de datos (7 archivos + barrel) | `src/app/features/school-bar/models/` |
| Servicios Firestore (7 servicios) | `src/app/features/school-bar/services/` |
| Rutas lazy-loaded | `src/app/features/school-bar/school-bar.routes.ts` |
| Integración en `app.routes.ts` | `src/app/app.routes.ts` |
| Sidebar nav (8 ítems) | `src/app/layout/default-layout/_nav.ts` |
| Índices Firestore (12 índices) | `firestore.indexes.json` |
| — SchoolSetupComponent | `school-setup/` |
| — SchoolStudentsListComponent | `school-students/` |
| — SchoolStudentFormComponent | `school-students/` |
| — SchoolMenuEditorComponent | `school-menu/` |
| — SchoolOrdersBoardComponent | `school-orders/` |
| — SchoolPosComponent | `school-pos/` |
| — SchoolWalletHistoryComponent | `school-wallet/` |
| — SchoolAccessoriesListComponent | `school-accessories/` |

### ✅ Fase 1.1 — Correcciones estructurales (Completada 2026-06-01)

| Problema | Solución aplicada |
|----------|------------------|
| `SchoolInstitution` duplica la empresa | Eliminada — reemplazada por `SchoolBarSettings` en `settings/school_bar` |
| POS bloqueado al menú publicado | POS carga `getActiveProducts()` como fuente primaria; menú es opcional |
| Menú como única fuente de productos | `MenuItem.productId` obligatorio; precio readonly al seleccionar producto |
| Datos del estudiante vacíos en orden inmediata | POS lookup con `getStudentOnce()` / `scanQr()` — datos reales del alumno |
| Todos los servicios usaban `institutionId` | Reemplazado por `companyId` inyectado desde `TenantService` en 7 servicios |
| Todos los componentes tenían selector de institución | Eliminado en 8 componentes — el tenant es la institución |

### ✅ Fase 2 — Cloud Functions críticas (Completada 2026-06-02)

| Cloud Function | Trigger | Descripción |
|---|---|---|
| `schoolGenerateStudentQr` | `onDocumentCreated` `school_students` | Genera token HMAC-SHA256 + imagen QR en Storage |
| `schoolProcessPurchase` | `onDocumentCreated` `school_orders` | Descuenta wallet atómicamente, confirma la orden |
| `schoolConfirmRecharge` | `onDocumentUpdated` `school_recharges` | Acredita wallet al confirmar una recarga |
| `schoolScanQr` | `onCall` HTTPS | Valida firma QR, devuelve datos del alumno al POS |

Variables de entorno requeridas:
- `SCHOOL_QR_SECRET` — clave HMAC-SHA256 para firmar/verificar tokens QR
  ```
  firebase functions:secrets:set SCHOOL_QR_SECRET
  ```

### 🔜 Pendiente (Fase 3 — Portal Representante)

- `school-parent/school-parent-dashboard.component`
- `school-parent/school-parent-link.component`
- Recargas con pago en línea (Kushki / PayPhone)

### 🔜 Pendiente (Fase 4 — Planificación de Menús Semanales)

- Editor de menú semanal con referencia obligatoria a productos del catálogo
- Publicación masiva por semana

### 🔜 Pendiente (Fase 5 — Entrega en Aula)

- `SchoolDeliveryBoardComponent`
- Rol `school_delivery`
- Confirmación de entrega por QR/NFC

### 🔜 Pendiente (Fase 6 — App Representantes)

- PWA para representantes
- Recargas con tarjeta en línea
- Notificaciones push (FCM)

---

## Diagnóstico Estratégico v1.3

> Análisis realizado el 2026-06-01 sobre el código implementado en Fase 1.
> **Ningún cambio debe implementarse sin haber revisado este diagnóstico.**

### Principios de diseño que deben guiar todas las correcciones

1. **La empresa es la institución educativa.** No existe una capa intermedia.
2. **Todo producto activo es vendible.** El menú diario es una herramienta de planificación, no una barrera de venta.
3. **No se duplica información.** Lo que ya está en el sistema (productos, inventario, familias, categorías, empresa) se reutiliza.
4. **El POS del bar es una adaptación del POS existente**, no un sistema paralelo.

---

### Problema 1 — `SchoolInstitution` duplica la empresa (CRÍTICO)

**Código afectado:** `school-institution.interface.ts`, `school-institution.service.ts`, `school-setup.component.ts`, todos los servicios que reciben `institutionId`.

**Qué pasa hoy:**

La colección `companies/{companyId}/school_institutions/{institutionId}` almacena `name`, `address`, `city`, `province`, `logoUrl`. Todos esos campos ya existen en el documento de la empresa. El admin que activa el módulo de Bar Escolar debe ingresar dos veces el mismo nombre, la misma dirección, la misma ciudad.

El `SchoolSetupComponent` renderiza un formulario con esos campos duplicados. El `SchoolPosComponent` tiene un selector de institución, como si una empresa pudiera tener múltiples escuelas. Todos los servicios reciben `institutionId` como parámetro cuando en el modelo de negocio correcto `institutionId === companyId`.

**Qué es exclusivo del bar escolar (lo que SÍ debe conservarse):**

| Campo | Pertenece a |
|-------|------------|
| `code` | Código AMIE del MINEDUC |
| `currentPeriod` | Período académico "2025-2026" |
| `schedules[]` | Franjas de recreo (hora, duración, días) |
| `barName` | Nombre del bar (puede diferir de la institución) |
| `barConfig` | Wallet limits, delivery config, pagos aceptados |

**Corrección:**

Mover esos campos exclusivos a la configuración de la empresa. El path natural es:

```
/companies/{companyId}/settings/school_bar
  amieCode:      string
  currentPeriod: string
  barName:       string
  schedules:     SchoolSchedule[]
  barConfig:     SchoolBarConfig
```

El `school-setup` pasa a ser una página de configuración del bar (solo campos del bar) que lee el nombre y dirección directamente de la empresa. La colección `school_institutions` desaparece. Los `school_grades` ya usan `companyId` directamente.

Todos los servicios que reciben `institutionId` lo reemplazarán por `companyId` inyectado desde `TenantService` (ya disponible).

---

### Problema 2 — El POS solo funciona si existe un menú publicado

**Código afectado:** `school-pos.component.ts:62-66`.

```typescript
// Estado actual — si no hay menú publicado, el POS queda vacío
loadMenu(institutionId: string): void {
  this.menuService.getPublishedMenuForDate(institutionId, this.today)
    .subscribe(m => this.menu.set(m)); // null → POS sin productos
}
```

Si hoy no se publicó un menú, `this.menu()` es `null` y el POS no muestra ningún producto. El bar no puede vender absolutamente nada: ni bebidas, ni snacks, ni chocolates, ni ningún producto de siempre.

**Corrección:**

El `SchoolPosComponent` debe cargar `ProductsService.getActiveProducts()` como fuente principal. El menú del día, si existe, se muestra como sección resaltada o filtro adicional. El bar siempre puede operar.

---

### Problema 3 — El menú es la única fuente de productos del POS

**Código afectado:** `school-pos.component.ts` (no hay ninguna referencia a `ProductsService`).

El componente nunca llama a `ProductsService`. Los únicos productos que aparecen son los `MenuItem` del menú publicado. Para que un producto como "Jugo de naranja" aparezca en el POS, el admin debe primero:

1. Crear el menú del día.
2. Buscar el producto en el editor de menú.
3. Agregarlo manualmente al menú.
4. Publicar el menú.
5. Solo entonces el POS muestra el jugo.

Esto es excesivo para productos que se venden todos los días.

**Corrección:**

- POS carga todos los productos activos del catálogo (`ProductsService.getActiveProducts()`).
- Filtros: por familia, por categoría (usando las existentes del sistema).
- Si hay menú publicado: se muestra una sección "Menú del día" o un badge sobre los productos incluidos.
- El menú pasa a ser un organizador/destacador, no la fuente de datos.

---

### Problema 4 — Datos del estudiante vacíos en orden inmediata

**Código afectado:** `school-pos.component.ts:103-107`.

```typescript
// Estado actual — campos vacíos en todas las órdenes del POS
studentCode:    '',
gradeId:        '',
gradeName:      '',
section:        '',
```

Las órdenes creadas desde el POS quedan sin datos de grado ni código del estudiante. El tablero de órdenes no puede mostrar a qué grado pertenece el alumno.

**Corrección:**

Al ingresar el ID del estudiante, el sistema hace una query a `school_students` para recuperar `studentCode`, `gradeId`, `gradeName`, `section` antes de crear la orden.

---

### Problema 5 — Cloud Functions no implementadas (BLOQUEANTE)

Sin estas funciones el flujo financiero no existe. El wallet nunca cambia de valor.

| Cloud Function | Responsabilidad | Efecto si no existe |
|---------------|----------------|---------------------|
| `schoolGenerateStudentQr` | Genera QR firmado al crear estudiante | No hay identificación |
| `schoolProcessPurchase` | Descuenta wallet atómicamente | El saldo nunca disminuye |
| `schoolConfirmRecharge` | Acredita wallet al confirmar recarga | El saldo nunca aumenta |
| `schoolScanQr` | Valida QR, devuelve datos del estudiante | El cajero escribe IDs a mano |

**El sistema puede guardar órdenes y recargas en Firestore, pero el saldo del estudiante no cambia. Ningún flujo real funciona hasta que estas funciones existan.**

---

### Problema 6 — `SchoolMenuEditorComponent` crea datos duplicados del producto

El editor de menú permite ingresar `name`, `description`, `category`, `price` manualmente por cada item. Esto genera inconsistencias: el producto tiene precio $2.50 en el catálogo, pero el menú dice $2.00. El stock se descuenta del producto pero el precio cobrado puede diferir.

**Corrección:**

Cuando se selecciona un `productId` en el editor de menú, el precio debe tomarse siempre del producto referenciado. El campo `price` del `MenuItem` no debe ser editable cuando hay `productId`. Solo en items sin `productId` (almuerzos preparados sin referencia en catálogo) puede editarse el precio directamente.

---

### Resumen de correcciones por orden de prioridad

| # | Corrección | Tipo | Bloquea a |
|---|-----------|------|-----------|
| 1 | Cloud Functions (`schoolProcessPurchase`, `schoolGenerateStudentQr`, `schoolConfirmRecharge`, `schoolScanQr`) | Backend | Todo el flujo financiero |
| 2 | Eliminar `SchoolInstitution` como entidad separada | Refactor | Flujo de setup y todos los servicios |
| 3 | POS: carga `ProductsService.getActiveProducts()` como fuente principal | Feature | Operación diaria del bar |
| 4 | Enriquecer datos del estudiante en orden inmediata | Fix | Trazabilidad de órdenes |
| 5 | `MenuItem.price` siempre del producto referenciado | Fix | Consistencia de precios |
| 6 | `menuId` opcional (enviar `null`, no `''`) en órdenes inmediatas sin menú | Fix | Integridad de datos |

---

## 1. Análisis de Negocio Real — Bares Escolares Ecuador

### 1.1 La Realidad Operativa Actual

El bar escolar ecuatoriano opera en una ventana de tiempo extremadamente comprimida: entre **15 y 20 minutos de recreo** para atender a un volumen que en instituciones medianas oscila entre 200 y 800 alumnos. No hay sistema. Hay un cuaderno, una caja registradora de los años 90 o directamente una bandeja con billetes, y un concesionario (persona natural o empresa pequeña) que intenta no perder el hilo de lo que lleva y lo que cobra.

**Problemas estructurales identificados:**

**Control de efectivo nulo.** El concesionario recauda todo en efectivo, sin recibo, sin comprobante. La institución educativa no tiene visibilidad de las ventas reales. El acuerdo de concesión habla de un porcentaje pero nadie sabe con certeza sobre qué base se calcula. Esto genera desconfianza mutua y contratos que no se renuevan o se renegocian por intuición.

**Falta de trazabilidad del gasto estudiantil.** El representante entrega dinero en efectivo al estudiante cada mañana. No sabe en qué lo gasta. No puede verificar si comió o no comió. No puede detectar si el alumno llega al bar o si lo usa para otros fines. Este es un punto de dolor emocional fuerte para los padres, especialmente en primaria y básica.

**Tiempo de atención incompatible con el recreo.** Con métodos manuales, una transacción de bar toma entre 45 segundos y 2 minutos. En 15 minutos, un punto de atención puede despachar como máximo 20-25 alumnos. El resultado es colas, niños que no alcanzan a comprar, o niños que se saltan el almuerzo.

**Inventario perecedero sin control.** El concesionario compra por intuición basada en experiencia. Prepara demasiado y pierde producto. Prepara poco y pierde ventas. No hay datos históricos de demanda.

**Fraude y pérdidas internas.** Cuando el personal del bar son dos o tres personas sin sistema, no hay manera de auditar quién despachó qué, cuánto ingresó realmente a caja versus cuánto se declaró.

**Regulación MINEDUC ignorada en la práctica.** El Acuerdo Ministerial 0005-14 establece que los alimentos deben cumplir con semáforo nutricional, listas de permitidos y prohibidos, y registros sanitarios. En la práctica, la mayoría de bares no tienen un sistema que les permita documentar el cumplimiento.

**Desconexión entre institución y concesionario.** La autoridad escolar no tiene visibilidad en tiempo real de qué se vende, a qué precio, en qué cantidades.

### 1.2 Pain Points por Actor

| Actor | Pain Points Críticos |
|-------|---------------------|
| Concesionario / Dueño del bar | Sin datos de venta, pérdida de efectivo no detectada, inventario a ojo, sin facturación SRI |
| Representante / Padre | No sabe en qué gasta el hijo, no puede cargar saldo digitalmente, no tiene historial |
| Alumno | Colas largas, no alcanza el tiempo, puede perder o que le roben el dinero |
| Institución educativa | Sin trazabilidad del concesionario, exposición ante MINEDUC, sin datos nutricionales |
| Super admin SaaS | Necesita onboarding simple, escala por número de alumnos, facturación automatizada |

---

## 2. Benchmark Competitivo — Paymon Ecuador

### 2.1 Qué es Paymon

Paymon es la plataforma ecuatoriana especializada en pagos escolares. Su propuesta central: digitalizar los pagos del bar escolar mediante una billetera estudiantil que los padres recargan desde su teléfono y el alumno usa en el bar mediante una aplicación o tarjeta.

### 2.2 Lo que Paymon hace bien

- Billetera digital por estudiante recargable por el representante
- Panel web para padres con historial de consumo
- Panel de cobro en el bar (dispositivo tablet/teléfono del bar)
- Notificaciones a padres cuando el hijo compra
- Recarga por transferencia y tarjeta de crédito/débito
- App móvil para representantes (Android/iOS)
- Identificación del alumno por QR en app móvil o tarjeta física
- Cobra comisión sobre cada recarga (entre 2% y 4% según el método)

### 2.3 Puntos Débiles de Paymon — Oportunidades para `pkg_school_bar`

| Debilidad Paymon | Oportunidad `pkg_school_bar` |
|-----------------|------------------------------|
| Sin control nutricional integrado (semáforo MINEDUC) | Módulo nutricional con cumplimiento regulatorio documentado |
| Sin facturación electrónica SRI para el concesionario | Integración directa con `pkg_sri` ya existente en la plataforma |
| Identificación solo por QR (app móvil o tarjeta impresa) | NFC nativo: tarjeta, manilla, llavero; solicitud y pago desde la misma plataforma |
| Sin pedido anticipado estructurado | Flujo de orden anticipada: padre ordena, bar prepara, alumno retira |
| Sin entrega en aula | Flujo de delivery en aula por grado y sección |
| Onboarding no es self-service | Representante entra con Google en 1 toque y vincula al hijo escaneando su QR |
| No hay ERP detrás; es solo pagos | `pkg_school_bar` vive sobre ERP completo: inventario, compras, facturación, reportes |
| Sin venta directa de accesorios NFC desde plataforma | Tienda de accesorios integrada: solicitud, pago, activación, asignación |
| Control parental básico | Límites de gasto diario/semanal, horarios de compra, categorías permitidas |
| Sin planificación de menú semanal | El admin del bar planifica el menú; el representante ve la semana completa |
| Soporte al concesionario mínimo | El concesionario es un cliente del SaaS con acceso a inventario y compras |

### 2.4 Diferencial Estratégico Central

Paymon es una **fintech de pagos escolares**. `pkg_school_bar` es un **ERP vertical escolar con pagos integrados**. La diferencia no es de funcionalidades; es de profundidad. Un padre en Paymon ve cuánto gastó su hijo. Un padre en `pkg_school_bar` ve cuánto gastó, en qué productos, con qué valor nutricional, y puede ordenar para mañana desde hoy.

---

## 3. Módulos Funcionales del `pkg_school_bar`

### 3.1 Mapa de Módulos

```
pkg_school_bar
├── school_setup          — Configuración del bar (sobre la empresa existente)
├── school_students       — Gestión de estudiantes (mínima, por admin)
├── school_parents        — Panel de representantes (gestión real del hijo)
├── school_menus          — Planificación de menús del día (opcional, para almuerzos especiales)
├── school_orders         — Órdenes anticipadas y en el momento
├── school_delivery       — Entrega en aula
├── school_accessories    — Accesorios NFC (catálogo, solicitud, gestión)
├── school_wallet         — Billetera estudiantil y recargas
├── school_pos            — Caja del bar (catálogo completo + menú del día destacado)
├── school_nutrition      — Control nutricional MINEDUC
└── school_reports_bar    — Reportes especializados
```

### 3.2 Descripción Detallada por Módulo

**`school_setup` — Configuración del Bar Escolar**

> **Corrección v1.3:** No duplica datos de la empresa. Configura exclusivamente lo que es del bar.

El admin encuentra en esta pantalla los datos básicos de la empresa ya cargados (nombre, dirección, logo). Solo ingresa lo que es exclusivo del bar: código AMIE del MINEDUC, período académico actual, nombre del bar, horarios de recreo por jornada (hora inicio, duración, días de la semana), y la configuración del wallet (saldo máximo por alumno, límites de gasto, métodos de pago aceptados, hora de corte para pedidos anticipados, entrega en aula y cargo adicional). Gestión de grados y secciones (CRUD).

**`school_students` — Perfil Estudiantil (registro mínimo por admin)**

El admin escolar solo registra los datos mínimos: nombre completo, código interno, grado y sección. La plataforma genera automáticamente el QR. El admin imprime el QR y lo entrega al alumno/representante. **Todo lo demás del perfil lo gestiona el representante.**

**`school_parents` — Panel del Representante (gestión real del hijo)**

El representante entra con Google (1 toque), escanea el QR del hijo con la cámara de su teléfono, y queda vinculado inmediatamente. Desde su panel gestiona: foto del hijo, alergias, límites de gasto, alertas de bajo saldo, recargas, pedidos anticipados, solicitud de accesorios NFC y todo el historial de consumo.

**`school_menus` — Planificación de Menús del Día (herramienta opcional)**

> **Corrección v1.3:** El menú NO es el mecanismo principal de venta. Es una herramienta de planificación para almuerzos especiales y productos del día.

El administrador del bar puede planificar qué almuerzos o platos especiales ofrece cada día. Cada item del menú **referencia obligatoriamente a un producto del catálogo** (`productId` requerido). El precio y nombre se leen del producto referenciado, no se ingresan manualmente. La información nutricional se configura en el producto una sola vez.

El menú publicado se muestra en el POS como una **sección destacada** y en el panel del representante para que pueda hacer pedidos anticipados. Si no se publica menú en un día, el POS sigue funcionando normalmente con todos los productos activos del catálogo.

**`school_pos` — Punto de Venta del Bar**

> **Corrección v1.3:** Fuente principal de productos = catálogo activo de la empresa, no el menú publicado.

La interfaz que usa el personal del bar durante el recreo. Optimizada para tablet, táctil. Carga **todos los productos activos del catálogo** organizados por familia y categoría. Si hay un menú publicado para hoy, esos productos aparecen en una sección destacada "Menú del día" con su badge correspondiente.

Filtros disponibles: por familia (Bebidas, Snacks, Almuerzos, etc.), por categoría, y por "Menú del día" si existe. Búsqueda rápida por nombre.

Al identificar al alumno (QR/NFC o búsqueda), el sistema enriquece automáticamente la orden con sus datos de grado y sección. El cajero selecciona productos, confirma el total, y el sistema descuenta del wallet mediante Cloud Function.

**`school_wallet` — Billetera y Recargas**

Cada estudiante tiene `walletBalance: number` actualizado exclusivamente por Cloud Functions. Las recargas son transacciones documentadas en `school_recharges`. Cada operación (compra, recarga, reembolso) crea un movimiento en `school_transactions`. Opciones rápidas de recarga: $1, $2, $5, $10, $20.

**`school_accessories` — Accesorios NFC**

Catálogo de accesorios físicos: tarjeta plástica NFC ($3.50), manilla de silicona NFC ($6.00), llavero NFC ($5.00). El representante solicita, paga, el admin configura el UID del chip y lo entrega. Desactivación lógica inmediata ante pérdida o robo.

**`school_nutrition` — Control Nutricional MINEDUC**

Módulo de cumplimiento regulatorio. Semáforo nutricional por nutriente (grasa, azúcar, sodio) según Acuerdo Ministerial 0005-14. La información nutricional se configura en el producto una sola vez y se reutiliza en el menú. Reportes de cumplimiento exportables para inspecciones.

**`school_reports_bar` — Reportes Especializados**

Ventas del día/semana/mes por producto, por grado, por alumno. Alumnos con bajo saldo. Inventario proyectado vs. real (integrado con stock existente). Ingresos del concesionario. Exportación CSV/Excel. Cumplimiento MINEDUC documentable.

---

## 4. Flujos Operativos Completos

### Flujo A — Onboarding del Representante (Self-Service con Google)

```
Día 0 — La institución:
  1. Admin crea el alumno (nombre + grado + sección)
  2. La plataforma genera el QR automáticamente (Cloud Function)
  3. El admin imprime el QR y lo entrega al alumno

Día 1 — El representante (menos de 2 minutos):
  1. Abre la URL del panel
  2. Toca "Ingresar con Google" (1 toque, Firebase Auth Google Provider)
  3. Primera vez → perfil de representante creado automáticamente
     con displayName, email y photoURL del token Google
  4. El sistema detecta que no tiene hijos vinculados
     → lo dirige directamente a "Vincular hijo"
  5. Toca "Escanear QR de mi hijo" → usa la cámara del teléfono
  6. Escanea el QR físico del alumno (3 segundos)
  7. La plataforma identifica al estudiante por el token firmado del QR
     → vinculación automática: parentId queda en school_students.parentIds[]
  8. Confirmación: "Vinculado con Juan Pérez, 3ro B"
  ✅ El representante YA puede ver el saldo, recargar y comprar
```

**Regla de seguridad:** máximo 2 representantes por estudiante.

---

### Flujo B — Venta Inmediata en el Bar (sin menú previo)

```
1. Alumno se acerca al bar durante el recreo
2. Presenta su identificador: QR o accesorio NFC
3. El cajero escanea con la cámara (QR) o acerca el lector NFC
4. Cloud Function schoolScanQr valida el token y devuelve:
   → foto del alumno, nombre, grado, sección, saldo disponible
5. Pantalla muestra el catálogo completo de productos activos
   → Si hay menú del día publicado: sección "Menú del día" destacada al inicio
   → Filtros por familia/categoría disponibles
6. El cajero selecciona productos del catálogo táctil
7. El sistema calcula el total en tiempo real
8. Si el saldo alcanza → cajero confirma la venta
   Si no alcanza → el sistema indica el déficit
9. Cloud Function schoolProcessPurchase:
   → Descuenta el monto del walletBalance atómicamente
   → Valida límites de gasto diario/semanal
   → Crea el documento school_orders con estado 'delivered'
   → Crea el movimiento en school_transactions
   → Decrementa stock del producto via ProductsService.recordSale()
10. Cloud Function notifica al representante: saldo actual + detalle de compra
```

---

### Flujo C — Compra Anticipada por Representante

```
1. Representante inicia sesión en su panel (Google, 1 toque)
2. Selecciona a cuál hijo quiere ordenar
3. Ve el menú del día disponible (publicado por el bar con horario de corte visible)
4. Selecciona items del menú: almuerzo + snack + bebida
5. Ve el resumen del pedido con total y saldo disponible del hijo
6. Si el saldo es suficiente → confirma la orden
   Si no alcanza → se ofrece recargar saldo en ese momento
7. La orden se crea en estado 'pending' con tipo 'advance'
8. A la hora de corte, el bar visualiza la lista de órdenes del día
9. El bar prepara los pedidos y los marca como 'ready'
10. Alumno llega al bar en el recreo, presenta QR
11. El cajero ve la orden anticipada del alumno, la confirma
12. La orden pasa a estado 'delivered'
13. Cloud Function notifica al representante con hora de retiro
```

---

### Flujo D — Solicitud de Accesorio NFC

```
PARTE 1 — Solicitud por representante:
1. Representante accede a "Accesorios NFC" en su panel
2. Ve el catálogo: tarjeta $3.50, manilla $6.00, llavero $5.00
3. Selecciona el accesorio y el hijo al que se asignará
4. Paga con tarjeta o transferencia
5. La solicitud se crea en school_accessories con estado 'requested'

PARTE 2 — Configuración por admin:
6. El admin ve la solicitud en su panel de accesorios
7. Recibe el accesorio físico (NFC en blanco)
8. Usa un dispositivo Android con NFC para leer el UID del chip
9. Ingresa el UID en la plataforma → queda asociado al estudiante
10. Marca el accesorio como 'configured'

PARTE 3 — Entrega:
11. El admin entrega el accesorio al alumno
12. Marca el accesorio como 'delivered'
13. Cloud Function notifica al representante: accesorio activo

FLUJO DE REEMPLAZO:
14. Si el accesorio se pierde → representante reporta pérdida
15. El identificador NFC queda 'revoked' de inmediato
16. El QR generado sigue funcionando como respaldo siempre
```

---

### Flujo E — Entrega en Aula

```
1. Representante crea orden anticipada con tipo 'classroom_delivery'
2. Especifica: grado y sección de entrega
3. A la hora de corte, el bar ve la lista de órdenes con entrega en aula
4. El bar agrupa los pedidos por aula y los empaca etiquetados
5. El repartidor (rol school_delivery) inicia su recorrido
6. Por cada entrega: escanea el QR del alumno o selecciona de la lista
7. La orden pasa a 'delivered' con timestamp
8. Si el alumno está ausente → repartidor marca 'student_absent'
9. La orden queda 'undelivered', se genera crédito al wallet automáticamente
10. Cloud Function notifica al representante del estado final
```

---

## 5. Modelo de Datos

Todos los paths siguen el patrón multi-tenant existente: `companies/{companyId}/...`

### 5.1 Corrección: Empresa = Institución Educativa

> **v1.3:** La colección `school_institutions` queda eliminada. La empresa registrada en el sistema ES la institución educativa. No existe capa intermedia.

**Configuración del bar almacenada en:**

```
/companies/{companyId}/settings/school_bar
```

```typescript
interface SchoolBarSettings {
  amieCode:      string;           // Código AMIE del MINEDUC
  currentPeriod: string;           // "2025-2026"
  barName:       string;           // Nombre del bar (puede diferir de la empresa)
  schedules:     SchoolSchedule[]; // Franjas de recreo
  barConfig:     SchoolBarConfig;
  state:         boolean;
  updatedAt:     Timestamp;
}

interface SchoolSchedule {
  name:          string;           // "Recreo Matutino"
  type:          'morning' | 'afternoon' | 'full';
  breakStart:    string;           // "10:00" (HH:mm)
  breakDuration: number;           // minutos
  days:          number[];         // [1,2,3,4,5] = lunes a viernes
}

interface SchoolBarConfig {
  maxWalletBalance:      number;   // saldo máximo por alumno (USD)
  dailySpendLimit?:      number;
  weeklySpendLimit?:     number;
  emergencyCreditLimit?: number;
  orderCutoffHour:       number;
  orderCutoffMinute:     number;
  allowClassroomDelivery: boolean;
  deliveryFee?:          number;
  acceptedPayments:      string[]; // ['wallet'] o ['wallet', 'cash']
  defaultWarehouseCode?: string;
}
```

**Lo que el `school-setup` ya NO gestiona:** nombre de la empresa, dirección, ciudad, provincia, logo. Esos datos se leen del documento de la empresa.

---

### 5.2 División de Responsabilidades

| Campo / Acción | Responsable |
|---------------|-------------|
| Nombre completo del alumno | Admin escolar |
| Grado y sección | Admin escolar |
| Código interno | Admin escolar |
| Generación del QR | Sistema (Cloud Function automática al crear) |
| Foto del estudiante | **Representante** |
| Alergias y restricciones alimentarias | **Representante** |
| Límite de gasto diario/semanal | **Representante** |
| Categorías de productos permitidas | **Representante** |
| Umbral de alerta de bajo saldo | **Representante** |
| Recargar saldo | **Representante** |
| Solicitar accesorios NFC | **Representante** |
| `walletBalance` | **Solo Cloud Functions** (nunca el frontend) |

---

### 5.3 Entidades

#### `school_grades/{gradeId}` — `/companies/{companyId}/school_grades/{gradeId}`

```typescript
interface SchoolGrade {
  id:           string;
  companyId:    string;            // Reemplaza institutionId — siempre === companyId
  name:         string;            // "Tercero de Básica"
  shortName:    string;            // "3ro B"
  level:        number;            // 1-13 para ordenar
  section:      string;            // "A", "B", "C", "Única"
  schedule:     'morning' | 'afternoon' | 'full';
  teacherName?: string;
  studentCount: number;            // denormalizado
  state:        boolean;
  createdAt:    Timestamp;
  updatedAt:    Timestamp;
}
```

#### `school_students/{studentId}`

```typescript
interface SchoolStudent {
  id:           string;
  companyId:    string;            // Reemplaza institutionId
  gradeId:      string;
  gradeName:    string;            // denormalizado
  section:      string;
  firstName:    string;
  lastName:     string;
  fullName:     string;
  code:         string;            // código interno de la institución
  photoUrl?:    string;            // gestionado por el representante
  // Representantes vinculados (max 2)
  parentIds:          string[];
  primaryParentId:    string;
  // Billetera — solo escrito por Cloud Functions
  walletBalance:      number;
  // Identificadores
  qrCode:      string;             // token HMAC-SHA256
  qrCodeUrl:   string;             // URL imagen QR (Firebase Storage)
  identifiers: StudentIdentifier[];
  // Control parental — gestionado por representante
  allowedCategories?: string[];
  allergyNotes?:      string;
  spendLimits?: {
    dailyLimit?:        number;
    weeklyLimit?:       number;
    overriddenByParent: boolean;
  };
  // Stats denormalizados — actualizados por CF
  totalSpentMonth:    number;
  totalSpentWeek:     number;
  totalTransactions:  number;
  state:     boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

interface StudentIdentifier {
  type:        'qr' | 'nfc_card' | 'nfc_bracelet' | 'nfc_keyring';
  accessoryId?: string;
  nfcUid?:     string;             // UID físico del chip (hex)
  status:      'active' | 'revoked' | 'pending_activation';
  activatedAt?: Timestamp;
  revokedAt?:   Timestamp;
  revokedReason?: string;
}
```

#### `school_parents/{parentId}`

```typescript
interface SchoolParent {
  id:        string;
  userId:    string;               // Firebase Auth UID (Google)
  companyId: string;
  firstName: string;
  lastName:  string;
  fullName:  string;
  email:     string;
  phone?:    string;
  // Hijos vinculados
  studentIds:       string[];
  primaryStudentId?: string;
  // Preferencias de notificación
  notifyOnPurchase:      boolean;
  notifyOnLowBalance:    boolean;
  lowBalanceThreshold:   number;  // USD
  notifyOnOrderReady:    boolean;
  notifyOnDelivery:      boolean;
  savedPaymentMethods?:  SavedPaymentMethod[];
  state:     boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

#### `school_menus/{menuId}`

> **Corrección v1.3:** `productId` es requerido cuando el item existe en el catálogo. El precio siempre se lee del producto referenciado.

```typescript
interface SchoolMenu {
  id:           string;
  companyId:    string;
  date:         string;            // "2026-06-01" (YYYY-MM-DD)
  publishedAt?: Timestamp;
  published:    boolean;
  orderCutoff:  Timestamp;
  items:        MenuItem[];
  totalItemCount: number;
  createdAt:    Timestamp;
  updatedAt:    Timestamp;
}

interface MenuItem {
  id:          string;
  productId:   string;             // REQUERIDO — referencia a products/{id}
  productSku:  string;             // denormalizado para movimientos
  name:        string;             // denormalizado del producto
  imageUrl?:   string;             // denormalizado del producto
  category:    'almuerzo' | 'snack' | 'bebida' | 'postre' | 'otro';
  price:       number;             // SIEMPRE leído del producto — no editable aquí
  dailyCapacity: number;           // unidades preparables hoy
  reservedCount: number;           // pedidos anticipados tomados (actualizado por CF)
  soldCount:     number;           // ventas del momento (actualizado por CF)
  available:     boolean;
  // Nutricional — leído de products si existe, completable aquí
  nutrition?:    NutritionInfo;
  mineducCategory: 'allowed' | 'restricted' | 'prohibited';
}

interface NutritionInfo {
  calories:    number;             // kcal por porción
  protein:     number;             // gramos
  carbs:       number;
  fat:         number;
  sodium:      number;             // mg
  sugar:       number;
  servingSize: string;             // "1 porción (250g)"
  trafficLight: {
    fat:   'green' | 'yellow' | 'red';
    sugar: 'green' | 'yellow' | 'red';
    sodium:'green' | 'yellow' | 'red';
  };
}
```

#### `school_orders/{orderId}`

```typescript
interface SchoolOrder {
  id:           string;
  companyId:    string;
  menuId?:      string;            // null si es compra inmediata sin menú
  studentId:    string;
  studentName:  string;
  studentCode:  string;            // NUNCA vacío — se enriquece al identificar al alumno
  gradeId:      string;            // NUNCA vacío
  gradeName:    string;            // NUNCA vacío
  section:      string;            // NUNCA vacío
  parentId?:    string;            // null si fue creada en el bar directamente
  parentName?:  string;
  warehouseCode: string;
  items:        SchoolOrderItem[];
  subtotal:     number;
  total:        number;
  orderType:    'advance' | 'immediate';
  deliveryType: 'bar_pickup' | 'classroom_delivery';
  classroomGradeId?:   string;
  classroomGradeName?: string;
  classroomSection?:   string;
  deliveryFee?:        number;
  status:       'pending' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'undelivered' | 'cancelled' | 'refunded';
  statusHistory: OrderStatusEntry[];
  paymentMethod: 'wallet';
  walletTransactionId: string;
  amountCharged:       number;
  dispatchedBy?:       string;
  dispatchedAt?:       Timestamp;
  deliveryConfirmedAt?: Timestamp;
  invoiceId?:          string;
  invoiceNumber?:      string;
  scheduledFor:        Timestamp;
  createdAt:           Timestamp;
  updatedAt:           Timestamp;
}

interface SchoolOrderItem {
  menuItemId?:  string;            // null si es venta directa desde catálogo sin menú
  productId:    string;            // SIEMPRE requerido para descontar stock
  productSku:   string;
  name:         string;
  category:     string;
  imageUrl?:    string;
  quantity:     number;
  unitPrice:    number;
  lineTotal:    number;
}
```

**Máquina de estados:**
```
pending → confirmed → preparing → ready → delivered
                                        ↘ undelivered → (reembolso wallet)
     ↘ cancelled (antes de 'ready')
     → refunded (si ya fue cobrado)
```

**Integración con stock:** Al entregar una orden (`delivered`), `SchoolOrderService.markDelivered()` itera sobre los items e invoca `ProductsService.recordSale()` por cada `productId`. El stock se descuenta del almacén definido en `SchoolBarConfig.defaultWarehouseCode`.

#### `school_accessories/{accessoryId}`

```typescript
const ACCESSORY_PRICES: Record<string, number> = {
  nfc_card:     3.50,
  nfc_bracelet: 6.00,
  nfc_keyring:  5.00
};

interface SchoolAccessory {
  id:              string;
  companyId:       string;
  type:            'nfc_card' | 'nfc_bracelet' | 'nfc_keyring';
  typeName:        string;
  unitPrice:       number;
  currency:        'USD';
  requestedBy:     string;        // parentId
  requestedByName: string;
  studentId:       string;
  studentName:     string;
  status:          'requested' | 'paid' | 'configured' | 'delivered' | 'revoked' | 'lost';
  statusHistory:   AccessoryStatusEntry[];
  paymentMethod:   'card' | 'transfer';
  paymentStatus:   'pending' | 'confirmed' | 'failed' | 'refunded';
  paymentRef?:     string;
  proofUrl?:       string;
  paymentConfirmedAt?: Timestamp;
  nfcUid?:         string;        // UID físico del chip (hex)
  configuredBy?:   string;
  configuredAt?:   Timestamp;
  deliveredAt?:    Timestamp;
  deliveredBy?:    string;
  revokedAt?:      Timestamp;
  revokedReason?:  string;
  replacedByAccessoryId?: string;
  createdAt:       Timestamp;
  updatedAt:       Timestamp;
}
```

#### `school_recharges/{rechargeId}`

```typescript
interface SchoolRecharge {
  id:           string;
  companyId:    string;
  studentId:    string;
  studentName:  string;
  gradeId:      string;
  gradeName:    string;
  parentId:     string;
  parentName:   string;
  amount:       number;
  balanceBefore: number;
  balanceAfter:  number;
  method:       'card' | 'transfer' | 'cash_admin';
  methodLabel:  string;
  paymentStatus: 'pending' | 'confirmed' | 'failed' | 'refunded';
  paymentRef?:  string;
  proofUrl?:    string;
  confirmedBy?: string;
  confirmedAt?: Timestamp;
  confirmationNote?: string;
  walletTransactionId?: string;
  createdAt:    Timestamp;
  updatedAt:    Timestamp;
}
```

#### `school_transactions/{transactionId}` — Append-only

```typescript
interface SchoolTransaction {
  id:            string;
  companyId:     string;
  studentId:     string;
  studentName:   string;
  type:          'recharge' | 'purchase' | 'refund' | 'adjustment';
  amount:        number;           // + = ingreso, - = egreso
  balanceBefore: number;
  balanceAfter:  number;
  description:   string;
  referenceId?:  string;           // orderId o rechargeId
  referenceType?: 'order' | 'recharge' | 'adjustment';
  createdBy?:    string;           // userId (null = Cloud Function)
  createdAt:     Timestamp;
}
```

---

### 5.4 Relaciones Clave

```
company (empresa)  — configura — settings/school_bar
company            — tiene     — school_grades[]
school_grades      — agrupa    — school_students[]
school_students    — tiene     — walletBalance (solo CF)
school_students    — tiene     — identifiers[] → school_accessories
school_students    — tiene     — school_transactions[]
school_parents     — gestiona  — school_students (parentIds)
school_parents     — crea      — school_orders
school_parents     — solicita  — school_accessories
school_parents     — crea      — school_recharges
school_menus       — referencia → products[] (productId requerido)
school_orders      — referencia → school_menus (menuId opcional)
school_orders      — referencia → products[] (para stock)
school_orders      — genera    — school_transactions
school_recharges   — genera    — school_transactions
products           — comparte  — stock con school_orders (ProductsService.recordSale)
```

---

## 6. Identificación Inteligente QR/NFC

### 6.1 QR de Doble Propósito

El QR del estudiante sirve para **dos contextos con el mismo código**:

1. **Identificar al alumno en el bar** (cajero escanea para cobrar)
2. **Vincular al representante con el alumno** (padre escanea para registrarse)

La Cloud Function `schoolScanQr` determina el contexto según el caller.

**Token del QR:**
```typescript
interface StudentQrPayload {
  studentId:  string;
  companyId:  string;
  version:    number;  // para invalidar QRs viejos si es necesario
  // NO incluir: nombre, saldo, datos personales
}
// Firmado con HMAC-SHA256 — no contiene datos personales
// No se puede adivinar ni falsificar sin la clave del servidor
```

**Generación:** Al crear el perfil del estudiante, `schoolGenerateStudentQr` genera el token firmado, lo convierte en imagen QR y la almacena en `companies/{companyId}/students/{studentId}/qr.png`.

### 6.2 Sistema NFC

**Tecnología:** Tags NFC tipo NTAG213 o NTAG215. El UID del chip es fijo e inmutable.

**Proceso:** El admin usa un dispositivo Android con NFC para leer el UID del chip físico e ingresarlo en la plataforma. La plataforma asocia ese UID al `studentId`. La Web NFC API (Chrome Android) permite leer tags NFC directamente desde una PWA.

**Desactivación:** Es lógica, no física. Se cambia el `status` del identificador de `active` a `revoked`. Inmediato.

### 6.3 Tabla Comparativa de Identificadores

| Característica | QR Pantalla | QR Impreso | NFC Tarjeta | NFC Manilla | NFC Llavero |
|---------------|------------|-----------|------------|------------|------------|
| Costo para el padre | $0 | $0 | $3.50 | $6.00 | $5.00 |
| Velocidad de lectura | 1-2s | 1-2s | 200ms | 200ms | 200ms |
| Durabilidad | Depende del cel | Baja | Alta | Alta | Alta |
| Requiere celular del padre | Sí | No | No | No | No |
| Adecuado para primaria | No siempre | Sí | Sí | **Sí (ideal)** | Sí |

---

## 7. Sistema de Recargas y Wallet Estudiantil

### 7.1 Arquitectura del Wallet

El wallet es `walletBalance: number` en `school_students`. Cada operación se realiza mediante una **Firestore transaction atómica en Cloud Function** para evitar condiciones de carrera.

> **Regla absoluta:** Las Cloud Functions son el único punto de escritura del `walletBalance`. El frontend nunca escribe directamente este campo. Las Firestore Security Rules deben reforzar esta restricción.

### 7.2 Opciones de Recarga

**Botones rápidos (UI):** `$1` · `$2` · `$5` · `$10` · `$20`

**Métodos de pago:**
- Tarjeta de crédito/débito (gateway: Kushki Ecuador o PayPhone) — Fase 3
- Transferencia bancaria (padre sube comprobante, admin confirma) — disponible desde Fase 2
- Efectivo en administración (admin registra en plataforma) — disponible desde Fase 2

### 7.3 Límites y Control Parental

| Configuración | Quién la define | Nivel |
|--------------|----------------|-------|
| Saldo máximo de wallet | Institución (barConfig) | Empresa |
| Límite de gasto diario | Representante | Padre |
| Límite de gasto semanal | Representante | Padre |
| Alerta de bajo saldo (umbral) | Representante | Padre |
| Categorías de productos permitidas | Representante | Padre |

### 7.4 Crédito de Emergencia

Por defecto el wallet no puede ir a saldo negativo. La institución puede configurar un "crédito de emergencia" (ej. $2.00). El crédito queda registrado como saldo negativo y el sistema notifica al padre para que recargue.

---

## 8. UX/UI — Experiencia por Rol

### 8.1 Panel Bar — Interfaz Táctil del Cajero

**Contexto:** Tablet Android 10-12", durante el recreo. **Flujo de venta en menos de 15 segundos.**

**Pantalla principal (standby):**
- Botón central grande: `ESCANEAR QR / NFC`
- Panel lateral: órdenes anticipadas del día (pendientes / listas)
- Cuenta regresiva al recreo

**Post-escaneo:**
- Foto del alumno, nombre, grado, saldo disponible
- Si tiene orden anticipada → se muestra con botón "Entregar pedido anticipado"
- Si no tiene orden → catálogo completo de productos activos

**Catálogo (venta inmediata):**
- Vista principal: todos los productos activos, organizados por familia
- Si hay menú publicado hoy: sección "Menú del día" destacada al inicio con badge
- Filtros rápidos: por familia, por categoría, solo "Menú del día"
- Búsqueda rápida por nombre del producto
- Grid con foto, nombre y precio — botones `+` y `-`
- Total en tiempo real — botón `COBRAR` grande en verde

### 8.2 Panel Representante — Web

**Pantalla de inicio:**
- Tarjetas por hijo: foto, nombre, saldo actual, gasto de hoy
- Alerta prominente si algún hijo tiene saldo bajo
- Acceso rápido a: recargar saldo, ver menú del día, ver historial

**Vista de un hijo específico — Tabs:**

| Tab | Contenido |
|-----|-----------|
| **Menú del Día** | Items publicados por el bar, botón "Ordenar para hoy/mañana", semáforo nutricional visible |
| **Catálogo** | Todos los productos del bar (para explorar aunque no sean del menú de hoy) |
| **Historial** | Extracto cronológico de transacciones |
| **Accesorios** | Accesorios activos, solicitudes en proceso, botón "Solicitar nuevo" |
| **Configuración** | Límites de gasto, umbral de alerta, restricciones de categoría, foto del hijo |

### 8.3 Panel Institución — Admin Escolar

- **Dashboard en tiempo real:** ventas del día, estudiantes con bajo saldo, estado de órdenes
- **Configuración del bar:** código AMIE, período, horarios de recreo, config del wallet (nombre de empresa y dirección se leen de la empresa, no se editan aquí)
- **Grados y secciones:** CRUD
- **Estudiantes:** crear perfil mínimo (nombre + grado), ver QR, ver accesorios NFC pendientes
- **Reportes:** ventas del concesionario, consumo nutricional, cumplimiento MINEDUC

---

## 9. Monetización SaaS

### 9.1 Suscripción por Institución

| Plan | Estudiantes | Precio/mes | Incluye |
|------|------------|-----------|---------:|
| Starter | Hasta 150 | $89 | Wallet, QR, catálogo completo, reportes estándar |
| Growth | 151 - 500 | $159 | Todo Starter + NFC, entrega en aula, notificaciones |
| Scale | 501 - 1.500 | $249 | Todo Growth + nutrición MINEDUC, SRI integrado, reportes avanzados |
| Enterprise | 1.500+ | Cotización | Todo Scale + SLA premium, soporte dedicado |

> Para una institución con 500 alumnos donde cada uno gasta $2/día en el bar, el volumen mensual es ~$20.000. El plan Growth a $159/mes es menos del **0.8% del GMV**.

### 9.2 Comisión sobre Recargas

| Método de recarga | Comisión plataforma |
|------------------|-------------------|
| Tarjeta de crédito | 2.5% (+ ~1.8% gateway ≈ 4.3% total al padre) |
| Tarjeta de débito | 1.5% (+ ~1.2% gateway ≈ 2.7%) |
| Transferencia | $0.25 fija o 0% |
| Efectivo en admin | 0% |

### 9.3 Venta de Accesorios NFC

| Accesorio | Costo físico | Precio venta | Margen bruto |
|----------|-------------|-------------|-------------|
| Tarjeta NFC | $0.80 | $3.50 | $2.70 (77%) |
| Manilla NFC | $1.50 | $6.00 | $4.50 (75%) |
| Llavero NFC | $1.20 | $5.00 | $3.80 (76%) |

### 9.4 Setup / Onboarding Fee

Cargo único al inicio: **$150 - $300** dependiendo del plan.

### 9.5 Proyección de Revenue por Institución

```
Institución Growth (500 alumnos):
  Suscripción mensual:         $159.00
  Comisión recargas (neto):    $112.50
  Accesorios promedio/mes:     $ 45.00
  ─────────────────────────────────────
  MRR por institución:         $316.50

Con 30 instituciones activas:   $9,495 MRR
Con 100 instituciones activas: $31,650 MRR
```

---

## 10. Roadmap por Fases

---

### Fase 1.1 — Correcciones Estructurales (antes de cualquier avance)

**Objetivo:** El sistema opera correctamente sobre la arquitectura existente, sin duplicaciones y sin bloqueos operativos.

**No son nuevas features. Son correcciones a lo ya implementado.**

| # | Corrección | Archivos afectados |
|---|-----------|-------------------|
| 1 | Eliminar `SchoolInstitution` como entidad separada. Mover `barConfig`, `schedules`, `amieCode`, `barName`, `currentPeriod` a `companies/{companyId}/settings/school_bar`. | `school-institution.interface.ts`, `school-institution.service.ts`, todos los servicios que usan `institutionId`, `school-setup.component.*` |
| 2 | `school_grades` usa `companyId` directamente (renombrar campo `institutionId` → `companyId` en modelo e índices). | `school-institution.interface.ts` (SchoolGrade), `school-institution.service.ts`, `firestore.indexes.json` |
| 3 | `SchoolPosComponent` carga `ProductsService.getActiveProducts()` como fuente principal. El menú del día se muestra como sección destacada opcional. | `school-pos.component.ts`, `school-pos.component.html` |
| 4 | Enriquecer datos del estudiante: al ingresar `studentId` en el POS, hacer query a `school_students` y auto-completar `studentCode`, `gradeId`, `gradeName`, `section`. | `school-pos.component.ts` |
| 5 | `menuId` enviado como `null` (no como `''`) en órdenes sin menú activo. | `school-pos.component.ts` |
| 6 | `SchoolMenuEditorComponent`: cuando se selecciona un `productId`, el precio se lee del producto y no es editable. `productId` es obligatorio. | `school-menu-editor.component.ts`, `school-menu-editor.component.html` |
| 7 | Actualizar todos los modelos: `institutionId` → `companyId` en `SchoolStudent`, `SchoolParent`, `SchoolMenu`, `SchoolOrder`, `SchoolAccessory`, `SchoolRecharge`, `SchoolTransaction`. | `models/*.interface.ts`, `services/*.service.ts` |
| 8 | `SchoolPosComponent` elimina el selector de institución (ya no existe). Usa `TenantService.companyId` directamente. | `school-pos.component.ts`, `school-pos.component.html` |
| 9 | `SchoolStudentsListComponent` elimina el selector de institución. | `school-students-list.component.ts`, `school-students-list.component.html` |

---

### Fase 2 — Cloud Functions Críticas (desbloqueante del flujo financiero)

**Objetivo:** El wallet funciona realmente. Sin estas funciones no hay sistema operativo real.

| # | Cloud Function | Trigger | Responsabilidad |
|---|---------------|---------|----------------|
| 1 | `schoolGenerateStudentQr` | `onCreate` en `school_students` | Genera token HMAC-SHA256, crea imagen QR, guarda en Storage, actualiza `qrCode` y `qrCodeUrl` |
| 2 | `schoolProcessPurchase` | HTTP callable (POS llama al confirmar) | Valida saldo, valida límites de gasto diario/semanal, descuenta wallet atómicamente, crea `school_transaction`, llama `ProductsService.recordSale()` si hay stock |
| 3 | `schoolConfirmRecharge` | `onUpdate` en `school_recharges` (paymentStatus → confirmed) | Acredita wallet atómicamente, crea `school_transaction`, actualiza `balanceBefore`/`balanceAfter` |
| 4 | `schoolScanQr` | HTTP callable | Valida firma del token QR, devuelve datos del estudiante (foto, nombre, grado, saldo), diferencia contexto (POS vs. vinculación) |

**Firestore Security Rules a agregar:**

```javascript
// school_students — walletBalance solo por Cloud Functions
match /companies/{companyId}/school_students/{studentId} {
  allow read: if request.auth.uid in resource.data.parentIds
               || hasRole(companyId, 'admin')
               || hasRole(companyId, 'cashier');
  allow create, update: if hasRole(companyId, 'admin')
    && !('walletBalance' in request.resource.data.diff(resource.data).affectedKeys());
  allow update: if request.auth.uid in resource.data.parentIds
    && !('walletBalance' in request.resource.data.diff(resource.data).affectedKeys());
}

// school_transactions — append-only, solo Cloud Functions
match /companies/{companyId}/school_transactions/{txId} {
  allow read: if hasRole(companyId, 'admin')
               || request.auth.uid in get(...school_students/$(resource.data.studentId)).data.parentIds;
  allow create, update, delete: if false; // Solo Admin SDK (Cloud Functions)
}

// school_parents — solo el propio representante
match /companies/{companyId}/school_parents/{parentId} {
  allow read, write: if request.auth.uid == resource.data.userId;
}
```

---

### Fase 3 — Portal de Representantes

**Objetivo:** Los padres pueden operar de forma autónoma. Es el corazón de la propuesta de valor.

| # | Funcionalidad |
|---|-------------|
| 1 | `SchoolParentDashboardComponent` — saldo actual de cada hijo, historial de transacciones, pedidos activos |
| 2 | `SchoolParentLinkComponent` — vinculación de hijo por escaneo QR con cámara |
| 3 | Vista del catálogo del bar para representantes (reutiliza catálogo público filtrado por empresa) |
| 4 | Vista del menú del día para representantes (cuando hay menú publicado) |
| 5 | Flujo de pedido anticipado desde el panel del representante |
| 6 | Solicitud de recarga con comprobante de transferencia |
| 7 | Gestión del perfil del hijo: foto, alergias, límites de gasto, categorías permitidas |
| 8 | Gestión multi-hijo (representante con más de un hijo) |
| 9 | `schoolLinkParentToStudent` Cloud Function — vinculación segura con validación de cupo (max 2 padres) |

---

### Fase 4 — Planificación de Menús Diarios

**Objetivo:** El administrador puede planificar la semana; el bar trabaja con menos fricciones.

| # | Funcionalidad |
|---|-------------|
| 1 | Editor de menú semanal (columna por día) — planificación de lunes a viernes en una pantalla |
| 2 | Publicación masiva: publicar toda la semana de una vez |
| 3 | `productId` siempre requerido en `MenuItem` — precio y nombre siempre del catálogo |
| 4 | Información nutricional configurada en el producto (una vez), heredada por el menú |
| 5 | Resumen de capacidad: cuántas unidades de cada item preparar según pedidos anticipados |
| 6 | Notificación al representante cuando el menú de la semana próxima es publicado |

---

### Fase 5 — Control de Entrega y Retiro

**Objetivo:** El bar sabe quién recogió y quién no. El representante recibe confirmación.

| # | Funcionalidad |
|---|-------------|
| 1 | `SchoolDeliveryBoardComponent` — lista de órdenes por grado para el turno de recreo |
| 2 | Confirmación de entrega por QR o selección manual del alumno |
| 3 | Rol `school_delivery` — acceso solo a órdenes con `deliveryType = 'classroom_delivery'` |
| 4 | Flujo `undelivered` — alumno ausente → reembolso automático al wallet (`schoolRefundUndeliveredOrders` CF) |
| 5 | Notificación push al representante: orden entregada o alumno ausente |
| 6 | `schoolDeliveryConfirm` Cloud Function — confirma entrega y actualiza estado atómicamente |

---

### Fase 6 — Aplicación para Representantes y Estudiantes

**Objetivo:** App móvil/PWA autónoma para padres.

| # | Funcionalidad |
|---|-------------|
| 1 | PWA instalable (service worker, manifest) para representantes |
| 2 | Recargas con tarjeta en línea — integración Kushki o PayPhone |
| 3 | Notificaciones push (FCM): compra realizada, saldo bajo, orden lista, entrega confirmada |
| 4 | Solicitud de accesorio NFC desde la app con pago en línea |
| 5 | Historial nutricional del hijo (qué comió esta semana, semáforo acumulado) |
| 6 | Reportes de cumplimiento MINEDUC exportables a PDF |

---

## 11. Backlog Estructurado

### Épics

```
EPIC-01: Correcciones Estructurales Fase 1.1
EPIC-02: Cloud Functions Críticas
EPIC-03: Configuración del Bar (school_setup corregido)
EPIC-04: Gestión de Estudiantes
EPIC-05: Portal del Representante
EPIC-06: POS del Bar (catálogo completo)
EPIC-07: Menú y Planificación
EPIC-08: Sistema de Órdenes
EPIC-09: Wallet y Recargas
EPIC-10: Accesorios NFC
EPIC-11: Entrega en Aula
EPIC-12: Control Nutricional MINEDUC
EPIC-13: Reportes y Analítica
EPIC-14: Notificaciones
EPIC-15: Infraestructura y Seguridad
```

---

#### EPIC-01 — Correcciones Estructurales Fase 1.1

| ID | Historia | Fase |
|----|---------|------|
| US-01-01 | Como sistema, quiero que la configuración del bar se almacene en `settings/school_bar` de la empresa, sin duplicar nombre, dirección ni logo | 1.1 |
| US-01-02 | Como admin, quiero que el `school-setup` muestre los datos de la empresa (solo lectura) y me permita configurar solo lo que es del bar (código AMIE, período, horarios, barConfig) | 1.1 |
| US-01-03 | Como sistema, quiero que `school_grades` use `companyId` en lugar de `institutionId` | 1.1 |
| US-01-04 | Como cajero, quiero que el POS muestre todos los productos activos del catálogo sin depender de que exista un menú publicado | 1.1 |
| US-01-05 | Como sistema, quiero que la orden inmediata del POS incluya `studentCode`, `gradeId`, `gradeName` y `section` recuperados automáticamente del perfil del estudiante | 1.1 |
| US-01-06 | Como sistema, quiero que `menuId` sea `null` (no `''`) cuando la orden no tiene menú asociado | 1.1 |
| US-01-07 | Como admin, quiero que el editor de menú tome el precio siempre del producto referenciado y no permita editarlo manualmente | 1.1 |
| US-01-08 | Como sistema, quiero que todos los modelos del módulo usen `companyId` en lugar de `institutionId` | 1.1 |

---

#### EPIC-02 — Cloud Functions Críticas

| ID | Historia | Fase |
|----|---------|------|
| US-02-01 | Como sistema, quiero generar automáticamente el QR del estudiante al crear su perfil (Cloud Function `schoolGenerateStudentQr`) | 2 |
| US-02-02 | Como sistema, quiero validar el token QR y devolver el perfil del estudiante al POS en menos de 1 segundo (Cloud Function `schoolScanQr`) | 2 |
| US-02-03 | Como sistema, quiero descontar el wallet del estudiante atómicamente al procesar una compra, validando saldo y límites de gasto (`schoolProcessPurchase`) | 2 |
| US-02-04 | Como sistema, quiero acreditar el wallet al confirmar una recarga de forma atómica (`schoolConfirmRecharge`) | 2 |
| US-02-05 | Como sistema, quiero que `walletBalance` solo pueda escribirse mediante Cloud Functions (Firestore Security Rules) | 2 |
| US-02-06 | Como sistema, quiero que `school_transactions` sea append-only y nunca modificable desde el cliente | 2 |

---

#### EPIC-03 — Configuración del Bar

| ID | Historia | Fase |
|----|---------|------|
| US-03-01 | Como admin, quiero registrar el código AMIE, período académico y nombre del bar | 1.1 |
| US-03-02 | Como admin, quiero configurar las franjas de recreo (hora inicio, duración, días) | 1.1 |
| US-03-03 | Como admin, quiero configurar el saldo máximo del wallet y hora de corte de pedidos | 1.1 |
| US-03-04 | Como admin, quiero crear y gestionar grados y secciones | 1.1 |

---

#### EPIC-04 — Gestión de Estudiantes

| ID | Historia | Fase |
|----|---------|------|
| US-04-01 | Como admin, quiero crear el perfil mínimo de un estudiante (nombre + grado) | 1.1 |
| US-04-02 | Como sistema, quiero generar automáticamente el QR de cada estudiante al crearlo | 2 |
| US-04-03 | Como admin, quiero ver el saldo de wallet de cualquier estudiante | 1.1 |
| US-04-04 | Como admin, quiero imprimir o descargar el QR de un estudiante en formato tarjeta | 2 |
| US-04-05 | Como admin, quiero importar estudiantes masivamente desde Excel | 3 |
| US-04-06 | Como admin, quiero ver qué representantes están vinculados a un estudiante | 1.1 |
| US-04-07 | Como admin, quiero ver el historial completo de transacciones de un estudiante | 2 |

---

#### EPIC-05 — Portal del Representante

| ID | Historia | Fase |
|----|---------|------|
| US-05-01 | Como representante, quiero ingresar al panel con mi cuenta de Google (1 toque) | 3 |
| US-05-02 | Como representante, quiero escanear el QR de mi hijo con la cámara del teléfono para vincularlo | 3 |
| US-05-03 | Como sistema, quiero permitir máximo 2 representantes por estudiante; el segundo confirma explícitamente | 3 |
| US-05-04 | Como representante, quiero ver el saldo actual del wallet de mi hijo | 3 |
| US-05-05 | Como representante, quiero ver el historial de compras de mi hijo | 3 |
| US-05-06 | Como representante, quiero solicitar una recarga subiendo un comprobante de transferencia | 3 |
| US-05-07 | Como representante, quiero completar el perfil de mi hijo (foto, alergias) | 3 |
| US-05-08 | Como representante, quiero configurar un límite de gasto diario para mi hijo | 3 |
| US-05-09 | Como representante con varios hijos, quiero cambiar entre hijos fácilmente | 3 |
| US-05-10 | Como representante, quiero ver el menú del día y ordenar de forma anticipada | 4 |
| US-05-11 | Como representante, quiero recargar el saldo con tarjeta de crédito/débito | 6 |

---

#### EPIC-06 — POS del Bar (catálogo completo)

| ID | Historia | Fase |
|----|---------|------|
| US-06-01 | Como cajero, quiero ver todos los productos activos del catálogo en el POS, organizados por familia y categoría | 1.1 |
| US-06-02 | Como cajero, quiero que el menú del día publicado aparezca como sección destacada en el POS cuando existe | 1.1 |
| US-06-03 | Como cajero, quiero filtrar productos por familia, categoría o solo "Menú del día" | 1.1 |
| US-06-04 | Como cajero, quiero escanear el QR de un alumno con la cámara de la tablet | 2 |
| US-06-05 | Como cajero, quiero ver automáticamente el perfil completo del alumno (foto, grado, saldo) tras escanear su QR | 2 |
| US-06-06 | Como cajero, quiero ver si el alumno tiene una orden anticipada lista para despachar | 2 |
| US-06-07 | Como cajero, quiero buscar a un alumno por nombre si el QR no funciona | 2 |
| US-06-08 | Como cajero, quiero leer un accesorio NFC con la tablet para identificar al alumno | 5 |
| US-06-09 | Como cajero, quiero confirmar la venta y ver el nuevo saldo del alumno en pantalla | 2 |

---

#### EPIC-07 — Menú y Planificación

| ID | Historia | Fase |
|----|---------|------|
| US-07-01 | Como admin del bar, quiero crear el menú del día seleccionando productos del catálogo existente | 1.1 |
| US-07-02 | Como admin del bar, quiero que el precio del item del menú siempre venga del producto referenciado | 1.1 |
| US-07-03 | Como admin del bar, quiero publicar el menú para que sea visible en el POS y para representantes | 1.1 |
| US-07-04 | Como admin del bar, quiero marcar un item del menú como agotado durante el recreo | 1.1 |
| US-07-05 | Como admin del bar, quiero definir la capacidad de producción diaria de cada item | 4 |
| US-07-06 | Como admin del bar, quiero planificar el menú de toda la semana en una sola pantalla | 4 |

---

#### EPIC-08 — Sistema de Órdenes

| ID | Historia | Fase |
|----|---------|------|
| US-08-01 | Como cajero del bar, quiero ver la lista de órdenes anticipadas del día agrupadas por estado | 2 |
| US-08-02 | Como cajero del bar, quiero avanzar el estado de una orden (kanban) | 2 |
| US-08-03 | Como cajero del bar, quiero marcar una orden como entregada descargando el stock correspondiente | 2 |
| US-08-04 | Como representante, quiero crear una orden anticipada seleccionando items del menú publicado | 3 |
| US-08-05 | Como representante, quiero cancelar una orden anticipada antes del corte | 3 |
| US-08-06 | Como sistema, quiero bloquear nuevas órdenes anticipadas cuando pasa la hora de corte | 3 |
| US-08-07 | Como admin, quiero ver el resumen de producción del día (cuántas unidades de cada item preparar) | 3 |

---

#### EPIC-09 — Wallet y Recargas

| ID | Historia | Fase |
|----|---------|------|
| US-09-01 | Como sistema, quiero decrementar atómicamente el wallet en cada compra (Cloud Function) | 2 |
| US-09-02 | Como sistema, quiero rechazar una compra si el saldo es insuficiente o si se supera el límite diario | 2 |
| US-09-03 | Como admin, quiero confirmar una recarga por transferencia cuando el padre sube el comprobante | 2 |
| US-09-04 | Como admin, quiero registrar una recarga en efectivo para un alumno | 2 |
| US-09-05 | Como sistema, quiero crear un movimiento en `school_transactions` por cada operación del wallet | 2 |
| US-09-06 | Como sistema, quiero enviar notificación al padre cuando el saldo baja del umbral | 2 |
| US-09-07 | Como admin, quiero ver el total de saldos de todos los wallets (dinero float en la plataforma) | 3 |

---

#### EPIC-10 — Accesorios NFC

| ID | Historia | Fase |
|----|---------|------|
| US-10-01 | Como representante, quiero ver el catálogo de accesorios disponibles con precio | 3 |
| US-10-02 | Como representante, quiero solicitar un accesorio y pagar por transferencia | 3 |
| US-10-03 | Como admin, quiero ver la lista de solicitudes de accesorios pendientes | 3 |
| US-10-04 | Como admin, quiero registrar el UID NFC de un accesorio y asociarlo al estudiante | 3 |
| US-10-05 | Como admin, quiero marcar un accesorio como entregado para activarlo | 3 |
| US-10-06 | Como representante, quiero reportar un accesorio como perdido para desactivarlo inmediatamente | 3 |
| US-10-07 | Como cajero, quiero leer el accesorio NFC con la tablet (Web NFC API, Chrome Android) | 5 |
| US-10-08 | Como representante, quiero pagar un accesorio con tarjeta en línea | 6 |

---

#### EPIC-11 — Entrega en Aula

| ID | Historia | Fase |
|----|---------|------|
| US-11-01 | Como representante, quiero elegir "entrega en aula" al crear una orden anticipada | 5 |
| US-11-02 | Como repartidor, quiero ver mi lista de aulas con pedidos asignados | 5 |
| US-11-03 | Como repartidor, quiero marcar un pedido como entregado escaneando el QR del alumno | 5 |
| US-11-04 | Como repartidor, quiero marcar un alumno como ausente si no está en el aula | 5 |
| US-11-05 | Como sistema, quiero generar crédito al wallet si la orden no pudo entregarse por ausencia | 5 |
| US-11-06 | Como admin, quiero ver el estado de todas las entregas en aula en tiempo real | 5 |

---

#### EPIC-12 — Control Nutricional MINEDUC

| ID | Historia | Fase |
|----|---------|------|
| US-12-01 | Como admin del bar, quiero ingresar información nutricional a cada producto del catálogo | 4 |
| US-12-02 | Como sistema, quiero calcular el semáforo nutricional por nutriente (grasa, azúcar, sodio) | 4 |
| US-12-03 | Como representante, quiero ver el semáforo nutricional de cada item al ordenar | 4 |
| US-12-04 | Como admin, quiero que el sistema me alerte si publico un item prohibido por MINEDUC | 4 |
| US-12-05 | Como admin, quiero generar un reporte de cumplimiento MINEDUC exportable a PDF | 6 |

---

#### EPIC-13 — Reportes

| ID | Historia | Fase |
|----|---------|------|
| US-13-01 | Como admin, quiero ver el total de ventas del día con desglose por producto | 2 |
| US-13-02 | Como admin, quiero ver un listado de estudiantes con saldo bajo | 2 |
| US-13-03 | Como admin, quiero ver el comparativo de ventas semana a semana | 4 |
| US-13-04 | Como admin, quiero ver el consumo mensual por estudiante | 4 |
| US-13-05 | Como admin, quiero exportar el reporte de ventas a Excel | 4 |
| US-13-06 | Como representante, quiero descargar el historial mensual de mi hijo en PDF | 6 |

---

#### EPIC-14 — Notificaciones

| ID | Historia | Fase |
|----|---------|------|
| US-14-01 | Como sistema, quiero enviar email al representante cada vez que su hijo hace una compra | 2 |
| US-14-02 | Como sistema, quiero enviar email al representante cuando el saldo baja del umbral | 2 |
| US-14-03 | Como sistema, quiero enviar email de confirmación cuando se confirma una recarga | 2 |
| US-14-04 | Como sistema, quiero notificar cuando la orden anticipada está lista para retirar | 4 |
| US-14-05 | Como sistema, quiero notificar cuando el accesorio NFC fue activado | 3 |
| US-14-06 | Como sistema, quiero enviar notificaciones push (FCM) al representante | 6 |

---

#### EPIC-15 — Infraestructura y Seguridad

| ID | Historia | Fase |
|----|---------|------|
| US-15-01 | Como sistema, quiero que toda operación de wallet use Firestore transactions atómicas vía Cloud Function | 2 |
| US-15-02 | Como sistema, quiero Firestore Security Rules que impidan que el frontend escriba `walletBalance` | 2 |
| US-15-03 | Como sistema, quiero que `school_transactions` sea append-only (ningún cliente puede editar ni borrar) | 2 |
| US-15-04 | Como sistema, quiero que el representante solo pueda leer los `school_students` donde su uid esté en `parentIds` | 2 |
| US-15-05 | Como sistema, quiero que el QR del alumno sea un token HMAC-SHA256 generado por Cloud Function | 2 |
| US-15-06 | Como dev, quiero datos seed para emuladores locales (5 estudiantes, 2 padres, menú del día, productos del catálogo) | 1.1 |
| US-15-07 | Como sistema, quiero que `pkg_school_bar` siga el patrón de `enabledPackages` del sistema actual | 1.1 |
| US-15-08 | Como sistema, quiero que los módulos estén protegidos por `moduleGuard` | 1.1 |

---

### Tareas Técnicas por Capa

#### Frontend Angular — Fase 1.1

| Tarea | Nota |
|-------|------|
| `SchoolSetupComponent`: eliminar campos duplicados de empresa; leer de `TenantService`; guardar en `settings/school_bar` | Refactor |
| `SchoolPosComponent`: cargar `ProductsService.getActiveProducts()` como fuente principal; menú del día como sección opcional | Refactor |
| `SchoolPosComponent`: eliminar selector de institución; usar `TenantService.companyId` | Refactor |
| `SchoolPosComponent`: al identificar estudiante, query a `school_students` para auto-completar datos | Fix |
| `SchoolStudentsListComponent`: eliminar selector de institución | Refactor |
| `SchoolMenuEditorComponent`: hacer `productId` requerido; precio siempre del catálogo | Fix |
| Todos los modelos: renombrar `institutionId` → `companyId` | Refactor |
| `SchoolInstitutionService`: migrar a `SchoolBarSettingsService` que lee/escribe `settings/school_bar` | Refactor |

#### Frontend Angular — Fases siguientes

| Tarea | Fase |
|-------|------|
| `SchoolParentDashboardComponent` (Google login + panel representante) | 3 |
| `SchoolParentLinkComponent` (escanear QR del hijo para vincular) | 3 |
| `QrScannerService` (cámara, ZXing) en POS | 2 |
| `NfcReaderService` (Web NFC API) | 5 |
| `SchoolDeliveryBoardComponent` (repartidor en aula) | 5 |
| `SchoolNutritionEditorComponent` (semáforo MINEDUC en producto) | 4 |
| `SchoolReportsComponent` con gráficos | 4 |
| `SchoolMenuWeeklyPlannerComponent` (planificación semanal) | 4 |

#### Backend Cloud Functions

| Función | Prioridad | Fase |
|---------|-----------|------|
| `schoolGenerateStudentQr` | MUST | 2 |
| `schoolScanQr` | MUST | 2 |
| `schoolProcessPurchase` | MUST | 2 |
| `schoolConfirmRecharge` | MUST | 2 |
| `schoolSendPurchaseNotification` | MUST | 2 |
| `schoolLinkParentToStudent` | MUST | 3 |
| `schoolCheckLowBalanceAlerts` (cron) | SHOULD | 2 |
| `schoolCreateAdvanceOrder` | SHOULD | 3 |
| `schoolCutoffOrdersJob` (cron) | SHOULD | 4 |
| `schoolDeliveryConfirm` | SHOULD | 5 |
| `schoolRefundUndeliveredOrders` | SHOULD | 5 |
| `schoolActivateAccessory` | SHOULD | 3 |
| `schoolRevokeAccessory` | SHOULD | 3 |
| `schoolImportStudentsFromExcel` | COULD | 3 |

#### Firestore — Índices Requeridos

| Colección | Campos del índice | Fase |
|----------|------------------|------|
| `school_orders` | `companyId` + `scheduledFor` + `status` | 1.1 |
| `school_transactions` | `studentId` + `createdAt` | 1.1 |
| `school_students` | `companyId` + `gradeId` + `state` + `fullName` | 1.1 |
| `school_students` | `parentIds` (array-contains) + `state` | 1.1 |
| `school_menus` | `companyId` + `date` + `published` | 1.1 |
| `school_accessories` | `companyId` + `status` + `createdAt` | 3 |
| `school_recharges` | `companyId` + `paymentStatus` + `createdAt` | 2 |

---

## 12. Ventajas Competitivas Propuestas

### 12.1 Tabla de Diferenciación vs. Paymon

| Dimensión | Paymon | `pkg_school_bar` | Ventaja |
|-----------|--------|-----------------|---------|
| Naturaleza del producto | Fintech de pagos escolares | ERP vertical escolar con pagos integrados | Profundidad de valor |
| Catálogo de productos del bar | Sin gestión | Todos los productos activos del catálogo, siempre vendibles | Diferencial operativo |
| Control nutricional MINEDUC | No | Sí, con semáforo y reporte de cumplimiento | Diferencial regulatorio |
| Facturación electrónica SRI | No | Sí, vía `pkg_sri` ya existente | Diferencial fiscal |
| Identificación NFC | No nativo | Sí: tarjeta, manilla, llavero | Diferencial de experiencia |
| Onboarding del representante | Proceso asistido | Google Sign-In + escaneo QR en <2 minutos | Diferencial de adopción |
| Vinculación representante-hijo | Código de invitación | Escaneo del QR del alumno | Diferencial de UX |
| Gestión del perfil del hijo | Admin de la institución | El propio representante | Diferencial de control |
| Orden anticipada estructurada | No | Sí, con hora de corte y kanban en el bar | Diferencial operativo |
| Entrega en aula | No | Sí, con rol de repartidor y confirmación | Diferencial de servicio |
| Control parental avanzado | Básico | Límites, categorías, horarios, alertas | Diferencial parental |
| Inventario del concesionario | No | Sí, vía inventario existente del ERP | Diferencial operativo |
| Reportes multi-dimensión | Básico | Por alumno, grado, nutrición, concesión | Diferencial analítico |
| Integración con ERP existente | No aplica | Nativo (es el mismo ERP) | Ventaja estructural |

### 12.2 Ventaja Estratégica Central: El Efecto Ecosistema

La ventaja más profunda no es ninguna funcionalidad aislada. Es que `pkg_school_bar` es un módulo más de una plataforma ERP completa que ya existe. El concesionario del bar puede activar `pkg_sri` y emitir facturas electrónicas. Puede gestionar compras a proveedores. Puede controlar el inventario de ingredientes.

Paymon no puede darle nada de eso. Es solo la capa de pagos.

### 12.3 Propuesta de Valor por Stakeholder

> **Para el concesionario del bar:** "Administra tu bar escolar como una empresa. Controla tu inventario, gestiona tus compras, emite facturas electrónicas al SRI y cobra sin efectivo. Todo en una sola plataforma."

> **Para la institución educativa:** "Cumple con MINEDUC. Ten visibilidad en tiempo real de lo que se vende en tu bar. Genera el reporte de cumplimiento nutricional cuando llegue una inspección."

> **Para el representante:** "Entra con Google, escanea el QR de tu hijo y listo. Sabe lo que come, controla cuánto gasta al día y recibe una notificación en el momento en que compra."

> **Para el alumno:** "Olvida las monedas. Llega al bar, acerca tu manilla, y listo. En 5 segundos tienes tu almuerzo."

---

## 13. Integración con el Sistema Existente

### 13.1 Principios de Reutilización

| Recurso existente | Cómo lo usa `pkg_school_bar` |
|-------------------|------------------------------|
| `ProductsService.getActiveProducts()` | Fuente principal de productos del POS del bar |
| `ProductsService.recordSale()` | Descuento de stock al entregar una orden |
| `FamiliesService` / categorías | Filtros del POS del bar |
| Documento empresa | Nombre, dirección, logo — sin duplicar |
| `TenantService` | `companyId` inyectado en todos los servicios |
| `AuthService` | Autenticación de cajeros, admins y representantes |
| `ModuleGuard` | Protección de rutas por módulo habilitado |
| Catálogo público (marketplace) | Vista del catálogo del bar para representantes |
| CoreUI components | Imports estándar, sin componentes nuevos base |
| `firestore.indexes.json` | Índices del bar agregados al mismo archivo |

### 13.2 Posición en el Árbol de Dependencias

```
pkg_base (always active)
  └── pkg_school_bar ($89-$249/mes — standalone vertical)
        ├── school_setup
        ├── school_students
        ├── school_parents
        ├── school_menus
        ├── school_orders
        ├── school_wallet
        ├── school_pos
        ├── school_accessories
        ├── school_delivery
        ├── school_nutrition
        └── school_reports_bar

EXTENSIONES OPCIONALES (add-ons activables):
  pkg_school_bar + pkg_sri       → Facturación electrónica de ventas del bar
  pkg_school_bar + pkg_purchases → Compras a proveedores del concesionario
  pkg_school_bar + pkg_reports   → Reportes financieros avanzados
```

### 13.3 Flujo de Primera Compra — End-to-End (estado objetivo)

```
Día 0 — Institución:
  Admin crea el alumno (nombre + grado) → QR generado automáticamente (CF) → QR impreso y entregado

Día 1 — Representante (menos de 2 minutos):
  1. Abre el panel → "Ingresar con Google" (1 toque)
  2. Escanea el QR del hijo con el teléfono (3 segundos)
  ✅ Vinculado. Ve el saldo: $0.00
  3. Recarga $5 por transferencia → sube comprobante (30 segundos)
     (admin confirma → CF acredita wallet → saldo disponible)
  4. En el POS del bar: alumno presenta QR → cajero ve todos los productos activos
  5. Cajero selecciona almuerzo + bebida → confirma → CF descuenta wallet + decrementa stock
  ✅ Venta completada. Representante recibe notificación con detalle de compra.

TIEMPO TOTAL OPERACIÓN EN BAR: < 15 segundos (con QR listo)
```

### 13.4 Seed en `plugin-packages-seed.ts`

```typescript
{
  code:          'pkg_school_bar',
  name:          'Bar Escolar',
  description:   'Administración completa de bar escolar: wallet estudiantil, identificación QR/NFC, POS con catálogo completo, órdenes anticipadas, control nutricional MINEDUC y entrega en aula.',
  modules:       [
    'school_setup', 'school_students', 'school_parents',
    'school_menus', 'school_orders', 'school_wallet',
    'school_pos', 'school_accessories', 'school_delivery',
    'school_nutrition', 'school_reports_bar'
  ],
  dependencies:  ['pkg_base'],
  price:         159,
  currency:      'USD',
  billingPeriod: 'monthly',
  icon:          'cil-restaurant',
  color:         'warning',
  isSystem:      false,
  order:         10,
  state:         true
}
```

---

## Resumen Ejecutivo

**El mercado existe y es capturable.** Ecuador tiene aproximadamente 5.000 unidades educativas con bar escolar activo. El segmento de colegios privados y fiscomisionales con 200+ alumnos representa un mercado inmediato de 800-1.200 instituciones. El mercado está sin penetración significativa.

**La Fase 1 MVP está implementada pero tiene correcciones estructurales críticas** que deben resolverse antes de avanzar. El problema principal es que la arquitectura asume una entidad `SchoolInstitution` separada de la empresa, cuando el modelo de negocio correcto es `empresa = institución educativa`. Adicionalmente, el POS solo funciona si existe un menú publicado, lo que bloquea la venta de productos de siempre (bebidas, snacks) cuando no se ha planificado el menú del día.

**Las Cloud Functions son el desbloqueante más urgente.** Sin `schoolProcessPurchase` y `schoolConfirmRecharge`, el wallet del estudiante nunca cambia de valor. El sistema puede guardar órdenes y recargas en Firestore pero el flujo financiero no existe en la práctica.

**El diferencial competitivo es estructural, no de features.** Paymon puede agregar NFC. Pero no puede convertirse en un ERP. La ventaja de `pkg_school_bar` es que el concesionario del bar escolar recibe el mismo sistema que usaría para cualquier negocio de alimentos, más las funcionalidades específicas del contexto escolar. Eso no se copia en un sprint.

---

*Documento actualizado: 2026-06-01 | Versión: 1.3*
*Próximo paso: implementar correcciones de Fase 1.1 — comenzar por los servicios (migración `institutionId` → `companyId`) y el POS (fuente dual de productos).*
