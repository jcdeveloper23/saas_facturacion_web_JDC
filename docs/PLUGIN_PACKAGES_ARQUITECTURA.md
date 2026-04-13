# Plugin Packages — Arquitectura Comercial
## Decisión de diseño · 2026-04-13

---

## Contexto

El sistema ya tiene un catálogo de módulos individuales (`/modules` en Firestore) y una UI para activarlos por empresa (`CompanyPluginsComponent`). Cada empresa almacena `enabledModules: string[]` y el `TenantService` expone `hasModule()` para guardar/mostrar rutas condicionalmente.

**Problema:** Los módulos individuales no son una unidad comercial coherente. No se puede ofrecer "Facturación Electrónica SRI" como producto si sus tres comprobantes (facturas, notas de débito, retenciones) son módulos separados que se activan uno a uno.

**Objetivo:** Agrupar módulos en paquetes comerciales que se puedan activar/cobrar como unidad, sin romper la lógica existente de `moduleGuard` ni el nav filtrado.

---

## Decisión

Se agrega una capa **Plugin Package** entre el super-admin y los módulos individuales:

- Un **Plugin Package** es una agrupación comercial con precio, descripción y lista de módulos que incluye.
- Las empresas activan **packages**, no módulos individuales.
- El `TenantService` deriva `enabledModules[]` automáticamente de los packages activos.
- El `moduleGuard` y `_nav.ts` no cambian — siguen operando sobre módulos.

---

## Firestore Schema

### Colección nueva: `/plugin-packages/{packageId}` (platform-level)

```typescript
interface PluginPackage {
  id: string;                            // Firestore doc ID
  code: string;                          // 'pkg_sri', 'pkg_sales', etc.
  name: string;                          // 'Facturación Electrónica SRI'
  description: string;
  modules: string[];                     // códigos de módulos que incluye
  dependencies: string[];                // códigos de otros packages requeridos
  price: number;                         // precio mensual en USD (0 = incluido en plan)
  currency: 'USD';
  billingPeriod: 'monthly' | 'yearly' | 'one_time';
  icon: string;                          // ícono CoreUI
  color: string;                         // color badge/card (e.g. 'primary', 'success')
  isSystem: boolean;                     // true = no se puede desactivar (pkg_base)
  order: number;
  state: boolean;
}
```

### Cambio en `/companies/{companyId}`

```typescript
// Campos nuevos (los existentes no cambian)
enabledPackages: string[];   // ['pkg_base', 'pkg_sales', 'pkg_sri']

// Campo existente — ahora derivado de packages (+ overrides manuales)
enabledModules: string[];    // ['dashboard', 'personas', 'invoices', 'sri', ...]
disabledModules: string[];   // overrides: desactivar un módulo sin cambiar el package
```

---

## Paquetes disponibles

| Código | Nombre | Módulos incluidos | Depende de | isSystem |
|--------|--------|-------------------|------------|----------|
| `pkg_base` | Base | `dashboard`, `settings`, `users` | — | `true` |
| `pkg_sales` | Facturación Base | `personas`, `products`, `invoices`, `stock` | `pkg_base` | `false` |
| `pkg_sales_advanced` | Facturación Avanzada | `quotes`, `orders`, `proformas`, `pos` | `pkg_sales` | `false` |
| `pkg_sri` | Facturación Electrónica SRI | `sri`, `debitNotes`, `retentions` | `pkg_sales` | `false` |
| `pkg_purchases` | Módulo Compras | `purchase_invoices`, `purchase_orders`, `purchase_proformas` | `pkg_sales` | `false` |
| `pkg_reports` | Reportes e Informes | `report_invoices`, `report_products`, `report_orders` | `pkg_sales` | `false` |

### Árbol de dependencias

```
pkg_base  (siempre activo)
  └── pkg_sales
        ├── pkg_sales_advanced
        ├── pkg_sri
        ├── pkg_purchases
        └── pkg_reports
```

---

## Cambios en el frontend

### 1. `TenantService`

```typescript
// Señales nuevas
activePackages = signal<string[]>([]);

// Señal existente — ahora se calcula desde packages
activeModules = computed(() => this.resolveModulesFromPackages(
  this.activePackages(),
  this.packageCatalog()
));

// Helper privado
private resolveModulesFromPackages(
  activePkgCodes: string[],
  catalog: PluginPackage[]
): string[] {
  const active = catalog.filter(p => activePkgCodes.includes(p.code));
  const fromPkgs = new Set(active.flatMap(p => p.modules));
  // aplicar disabledModules overrides
  this.disabledModules().forEach(m => fromPkgs.delete(m));
  return [...fromPkgs];
}

// API pública nueva
hasPackage(code: string): boolean {
  return this.activePackages().includes(code);
}
```

> **Nota:** `hasModule()` no cambia — todo el código existente (guards, nav, templates) sigue funcionando igual.

### 2. `CompanyPluginsComponent` (refactor)

- Vista actual: lista de módulos con toggles individuales.
- Vista nueva: cards de packages con toggle principal + lista colapsable de módulos incluidos.
- Al activar un package → verificar dependencias faltantes → activar módulos en batch.
- Al desactivar → validar que no haya otro package activo que dependa de este.

### 3. Nueva ruta super-admin: `/super-admin/plugin-packages`

- Lista de packages con precio, módulos, dependencias.
- CRUD completo.
- Botón "Registrar paquetes por defecto" (seed idempotente).

### 4. Nueva vista empresa: `/settings/plugins`

- Cards de paquetes activos (verde) y disponibles (gris).
- Cada card muestra: nombre, descripción, módulos incluidos, precio.
- La empresa ve pero no activa (activa el super-admin, o Stripe en el futuro).
- Opcionalmente: botón "Solicitar activación" que envía notificación al super-admin.

---

## Firestore Rules — adición requerida

```
// /plugin-packages — solo super_admin escribe, cualquier auth lee
match /plugin-packages/{packageId} {
  allow read: if request.auth != null;
  allow write: if request.auth.token.role == 'super_admin';
}
```

---

## Archivos a crear / modificar

| Archivo | Acción | Descripción |
|---------|--------|-------------|
| `core/interfaces/permission.interface.ts` | Modificar | Agregar `PluginPackage`, `PluginPackageInput` interfaces |
| `core/services/plugin-packages.service.ts` | Crear | CRUD `/plugin-packages` (root-level) |
| `core/services/tenant.service.ts` | Modificar | `activePackages` signal, `resolveModulesFromPackages()`, `hasPackage()` |
| `core/seed/plugin-packages-seed.ts` | Crear | Seed de los 6 paquetes definidos |
| `features/super-admin/pages/plugin-packages/` | Crear | UI catálogo paquetes super-admin |
| `features/super-admin/pages/companies/company-plugins.component` | Modificar | Refactor: packages primero, módulos como detalle |
| `features/super-admin/layout/_nav.ts` | Modificar | Agregar enlace a "Plugin Packages" |
| `features/settings/pages/plugins/` | Crear | Vista empresa de sus paquetes activos |
| `features/settings/settings.routes.ts` | Modificar | Agregar ruta `/settings/plugins` |
| `firestore.rules` | Modificar | Agregar regla para `/plugin-packages` |

---

## Criterio de aceptación

- [ ] Super-admin puede crear/editar/eliminar plugin packages desde `/super-admin/plugin-packages`
- [ ] Super-admin puede asignar packages a una empresa y los módulos se activan automáticamente
- [ ] Al activar un package con dependencias faltantes, el sistema alerta y ofrece activar las dependencias en cascade
- [ ] La empresa ve sus packages activos en `/settings/plugins`
- [ ] El nav y las rutas siguen filtrándose correctamente por módulo (sin cambios en moduleGuard)
- [ ] `pkg_base` no se puede desactivar desde la UI
- [ ] Seed idempotente: ejecutar "Registrar paquetes por defecto" varias veces no duplica datos

---

## Lo que NO cambia

- `moduleGuard` — sigue operando igual sobre `enabledModules`
- `_nav.ts` — el filtro `filterNavByRole()` + `hasModule()` no cambia
- Estructura de rutas — ninguna ruta existente cambia
- Schema de `/modules` — los módulos individuales siguen existiendo como catálogo técnico
- `enabledModules` en companies — sigue existiendo, ahora se calcula automáticamente

---

## Extensibilidad — Nuevos paquetes futuros

El sistema está diseñado para crecer indefinidamente sin cambios en el core. Agregar un paquete nuevo es solo:
1. Crear el documento en `/plugin-packages` (o el seed)
2. Crear los módulos que activa en `/modules`
3. Implementar las rutas/componentes Angular con `moduleGuard`

No se requiere deploy de lógica nueva en guards, nav ni TenantService.

### Categorías de paquetes previstos

#### Verticales de negocio
Paquetes que activan funcionalidades específicas para un tipo de empresa. Al activarse, el sistema adapta su terminología, campos, workflows y reportes para ese sector.

| Código | Nombre | Activa |
|--------|--------|--------|
| `pkg_automotive` | Automotriz | Módulos de vehículos (marca, modelo, año, VIN), órdenes de trabajo, historial por placa, checklist de recepción/entrega |
| `pkg_pharmacy` | Farmacia | Gestión de lotes y fechas de vencimiento, control de psicotrópicos, alertas de caducidad, dispensación |
| `pkg_optics` | Óptica | Ficha del paciente con receta (OD/OI/ADD), historial de graduaciones, pedidos a laboratorio, agenda de entregas |
| `pkg_restaurant` | Restaurante / Food | Mesas y comandas, cocina display, carta digital por QR, propinas, split de cuenta |
| `pkg_services` | Servicios / Proyectos | Contratos, órdenes de servicio, asignación de técnicos, seguimiento de tickets, facturación por horas |
| `pkg_rental` | Alquiler / Renta | Contratos de arrendamiento, control de disponibilidad, depósitos, renovaciones automáticas |

#### Funcionalidades transversales
Paquetes que añaden capacidades que cualquier tipo de empresa puede aprovechar, independientemente del vertical.

| Código | Nombre | Activa |
|--------|--------|--------|
| `pkg_accounting` | Contabilidad | Plan de cuentas, asientos contables, libro mayor, balance general, estado de resultados, integración con SRI (ATS) |
| `pkg_dashboard_advanced` | Dashboard Avanzado | KPIs personalizables, gráficas de cohortes, análisis de rentabilidad por producto/cliente, exportación a Excel/PDF, comparativos mes-a-mes |
| `pkg_benefits` | Beneficios y Fidelización | Programa de puntos, tarjetas de fidelidad, descuentos por nivel de cliente, historial de canjes, campañas de recompensa |
| `pkg_hr` | Recursos Humanos | Gestión de empleados, roles y turnos, control de asistencia, nómina básica, vacaciones y permisos |
| `pkg_crm` | CRM | Pipeline de ventas, seguimiento de oportunidades, actividades y recordatorios, integración con email |
| `pkg_ecommerce` | Tienda Online | Catálogo público, carrito, pasarela de pagos, sincronización de stock con el ERP |

### Cómo funciona la personalización por vertical

Cuando una empresa tiene activo un paquete vertical, el sistema puede:

1. **Adaptar la terminología** — vía `companyConfig.terminology` en Firestore (e.g., "Cliente" → "Paciente" en óptica/farmacia)
2. **Mostrar campos extra en formularios** — los componentes leen `TenantService.hasPackage('pkg_optics')` para renderizar tabs o campos adicionales
3. **Activar flujos específicos** — rutas y Cloud Functions que solo existen si el paquete está activo
4. **Cambiar el dashboard** — los tiles del dashboard son condicionales por módulo/paquete activo
5. **Personalizar reportes** — reportes específicos del sector se activan junto con el paquete

### Reglas de diseño para paquetes nuevos

- **Un paquete no modifica otro paquete** — extiende, no reemplaza.
- **Los módulos base (personas, products, invoices) son compartidos** — los paquetes verticales los reusan y agregan encima.
- **Sin lógica hardcodeada** — toda condicionalidad usa `hasModule()` o `hasPackage()`.
- **Seed idempotente** — cada paquete nuevo se agrega al seed sin tocar los existentes.
- **Precio independiente** — cada paquete tiene su propio precio; se pueden combinar libremente.

---

## Evolución futura (fuera de scope ahora)

- Integración con Stripe para auto-servicio de activación de paquetes
- Métricas de uso por paquete para reportes de facturación
- Paquetes con trial period configurable
- Notificaciones cuando un paquete está próximo a vencer
- Marketplace de paquetes third-party (socios que desarrollan su propio vertical)
