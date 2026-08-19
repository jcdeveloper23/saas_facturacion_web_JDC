# Plan Módulo Contabilidad — SaasFacturacion Ecuador

**Última actualización:** 2026-08-18  
**Rama activa:** `developFacturasEc`  
**Plugin:** `pkg_accounting` — $29/mes — disponible en planes Profesional, Enterprise, Ultimate  
**Feature flag:** `accountingModule`  
**Roles:** `admin`, `accountant`

---

## Estado General

La base del módulo está implementada y es de buena calidad arquitectural. Los modelos, servicios, reglas Firestore y las 8 páginas de gestión están funcionales. Sin embargo, 3 gaps críticos impiden su uso en producción real para primeros clientes.

**Estimado para producción:** 3 sprints de 1 semana cada uno.

---

## Inventario Actual del Código

### Frontend — `src/app/features/accounting/`

#### Modelos
| Archivo | Contenido |
|---|---|
| `models/account.interface.ts` | `Account`, tipos, seed 89 cuentas Ecuador, helpers árbol |
| `models/accounting-period.interface.ts` | `AccountingPeriod`, estados `open/closed/locked` |
| `models/journal-entry.interface.ts` | `JournalEntry`, `JournalEntryLine`, `LibroMayorLine`, `BalanceComprobacionLine`, `calcEntryTotals()` |
| `models/cost-center.interface.ts` | `CostCenter`, `CostCenterTreeNode`, helper árbol |

#### Servicios
| Archivo | Estado |
|---|---|
| `services/chart-of-accounts.service.ts` | Completo |
| `services/journal-entries.service.ts` | Completo (usa `runTransaction` para numeración atómica) |
| `services/accounting-periods.service.ts` | **Bug crítico** en `closePeriod()` — ver Fase 1 |
| `services/cost-centers.service.ts` | Completo |

#### Páginas (8 componentes — HTML/SCSS/TS separados)
| Componente | Estado | Ruta |
|---|---|---|
| `chart-of-accounts-page` | Completo | `/accounting/chart-of-accounts` |
| `journal-entries-page` | Completo | `/accounting/journal-entries` |
| `journal-entry-form-page` | Completo | `/accounting/journal-entries/new` y `/edit/:id` |
| `libro-diario-page` | Completo | `/accounting/libro-diario` |
| `libro-mayor-page` | Completo | `/accounting/libro-mayor` |
| `balance-comprobacion-page` | Completo | `/accounting/balance-comprobacion` |
| `cost-centers-page` | Completo | `/accounting/cost-centers` |
| `accounting-periods-page` | Completo | `/accounting/periods` |
| `estado-resultados-page` | **AUSENTE** | `/accounting/estado-resultados` |
| `balance-general-page` | **AUSENTE** | `/accounting/balance-general` |

#### Rutas — `accounting.routes.ts`
9 rutas registradas. Falta agregar rutas para Estado de Resultados y Balance General.

### Cloud Functions — `functions/src/accounting/`

| Función | Trigger | Estado |
|---|---|---|
| `generate-journal-entry-from-invoice.ts` | `onDocumentUpdated` en `invoices` cuando `status → issued` | Completo pero sin COGS |
| `generate-journal-entry-from-retention.ts` | `onDocumentUpdated` en `retentions` | Completo |
| `close-accounting-period.ts` | `onCall` HTTPS Callable — `closeAccountingPeriod` | Completo pero **no invocado desde la UI** |

### Firestore — Colecciones

```
companies/{companyId}/
  ├── chart_of_accounts/{accountId}
  ├── accounting_periods/{periodId}
  ├── journal_entries/{entryId}
  ├── cost_centers/{centerId}
  └── counters/journal_entries   ← contador atómico por año (journal_{year})
```

---

## Plan de Cuentas Ecuador

Seed de **89 cuentas** — NIIF para PYMES adaptadas Ecuador:

| Grupo | Descripción |
|---|---|
| 1 | Activo corriente y no corriente con depreciaciones |
| 2 | Pasivo corriente y no corriente — IVA, retenciones, IESS |
| 3 | Patrimonio — reservas y resultados |
| 4 | Ingresos operacionales y no operacionales (0%/15%/exento) |
| 5 | Costos de ventas, gastos operacionales y no operacionales |

Cuentas clave para automatizaciones:

| Código | Nombre | Uso |
|---|---|---|
| `1.1.01.001` | Caja General | Ventas contado |
| `1.1.01.002` | Banco Principal | Pagos/cobros |
| `1.1.02.001` | Cuentas por Cobrar | Ventas crédito |
| `1.1.03.001` | Inventario de Mercaderías | Costo de ventas (COGS crédito) |
| `2.1.01.003` | IVA en Ventas por Pagar | IVA facturado |
| `2.1.01.004` | Ret. en la Fuente por Pagar | Retenciones IR |
| `2.1.01.005` | Ret. IVA por Pagar | Retenciones IVA |
| `4.1.01.001` | Ventas con tarifa 15% IVA | Ingresos con IVA |
| `4.1.01.002` | Ventas con tarifa 0% IVA | Ingresos sin IVA |
| `5.1.01.001` | Costo de Ventas | COGS débito |

---

## Reglas Firestore — Estado

| Colección | Create | Update | Delete |
|---|---|---|---|
| `chart_of_accounts` | Solo admin | Solo admin | **BLOQUEADO permanentemente** |
| `accounting_periods` | Solo admin | Solo admin | **BLOQUEADO** |
| `journal_entries` | Admin/Accountant — solo como `draft` | Admin: libre. Accountant: bloquea asientos `automatic` y `cancelled` | Solo `draft` + `manual` + admin |
| `cost_centers` | Admin/Accountant | Admin/Accountant | Solo admin |

---

## Fases de Implementación

---

## FASE 1 — Crítica (Sprint 1 — 1 semana)
> **Sin esto el módulo no se puede vender ni activar para primeros clientes**

### 1.1 — Fix: Cierre de ejercicio no genera asiento de cierre

**Problema:** `AccountingPeriodsService.closePeriod()` llama `updateDoc` directo a Firestore cambiando `status: 'closed'` pero **nunca invoca la Cloud Function** `closeAccountingPeriod`. El asiento de cierre de resultados nunca se genera.

**Archivo:** `src/app/features/accounting/services/accounting-periods.service.ts`

**Corrección:** Reemplazar el `updateDoc` del método `closePeriod()` por:
```typescript
import { getFunctions, httpsCallable } from '@angular/fire/functions';

async closePeriod(companyId: string, periodId: string): Promise<void> {
  const functions = getFunctions();
  const closeAccountingPeriod = httpsCallable(functions, 'closeAccountingPeriod');
  await closeAccountingPeriod({ companyId, periodId });
}
```

**Esfuerzo:** ~15 líneas. **Prioridad: MÁXIMA.**

---

### 1.2 — Nuevo: Página Estado de Resultados

**Ruta:** `/accounting/estado-resultados`  
**Archivo nuevo:** `src/app/features/accounting/pages/estado-resultados-page/`

**Lógica de cálculo:**
1. Leer todos los `journal_entries` con `status: 'posted'` del período seleccionado
2. Sumar líneas de cuentas grupo `4.x.x.x` (Ingresos) → calcular saldo neto (crédito - débito, naturaleza acreedora)
3. Sumar líneas de cuentas grupo `5.x.x.x` (Costos y Gastos) → calcular saldo neto (débito - crédito, naturaleza deudora)
4. Calcular: `Utilidad/Pérdida = Total Ingresos - Total Costos y Gastos`

**Secciones del reporte:**
```
INGRESOS OPERACIONALES
  4.1 Ventas netas              $X
  4.2 Otros ingresos            $X
TOTAL INGRESOS                  $X

COSTOS Y GASTOS
  5.1 Costo de ventas           $X
  5.2 Gastos operacionales      $X
  5.3 Gastos no operacionales   $X
TOTAL COSTOS Y GASTOS           $X

UTILIDAD (PÉRDIDA) DEL EJERCICIO $X
```

**Filtros:** Selector de período contable (igual que Libro Diario).  
**Export:** `window.print()` en primera versión.

---

### 1.3 — Nuevo: Página Balance General

**Ruta:** `/accounting/balance-general`  
**Archivo nuevo:** `src/app/features/accounting/pages/balance-general-page/`

**Lógica de cálculo:**
1. Leer todos los `journal_entries` con `status: 'posted'` acumulados hasta el cierre del período
2. Para cuentas grupo `1.x.x.x` (Activos): saldo = débitos acumulados - créditos acumulados (naturaleza deudora)
3. Para cuentas grupo `2.x.x.x` (Pasivos): saldo = créditos acumulados - débitos acumulados (naturaleza acreedora)
4. Para cuentas grupo `3.x.x.x` (Patrimonio): saldo = créditos acumulados - débitos acumulados
5. Verificar: `Total Activos = Total Pasivos + Total Patrimonio`

**Secciones del reporte:**
```
ACTIVOS
  1.1 Activo Corriente          $X
    1.1.01 Disponible           $X
    1.1.02 Exigible             $X
    1.1.03 Inventarios          $X
  1.2 Activo No Corriente       $X
TOTAL ACTIVOS                   $X

PASIVOS Y PATRIMONIO
  2.1 Pasivo Corriente          $X
  2.2 Pasivo No Corriente       $X
  3.1 Capital Social            $X
  3.3 Resultados del Ejercicio  $X
TOTAL PASIVOS + PATRIMONIO      $X

DIFERENCIA (debe ser $0.00)     $X
```

**Filtros:** Selector de período contable.  
**Export:** `window.print()` en primera versión.

---

### 1.4 — Actualizar rutas y sidebar

**Archivo:** `src/app/features/accounting/accounting.routes.ts`

Agregar:
```typescript
{
  path: 'estado-resultados',
  loadComponent: () => import('./pages/estado-resultados-page/estado-resultados-page.component')
    .then(m => m.EstadoResultadosPageComponent),
  canActivate: [authGuard, featureFlagGuard('accountingModule')]
},
{
  path: 'balance-general',
  loadComponent: () => import('./pages/balance-general-page/balance-general-page.component')
    .then(m => m.BalanceGeneralPageComponent),
  canActivate: [authGuard, featureFlagGuard('accountingModule')]
}
```

**Sidebar:** Agregar ítems en el nav de contabilidad en `_nav.ts` o equivalente.

---

## FASE 2 — Importante (Sprint 2 — 1 semana)
> **Calidad del producto — necesario para empresas con inventario**

### 2.1 — COGS Automático en facturación

**Problema:** `generate-journal-entry-from-invoice.ts` solo genera el asiento de ingresos. No genera la contrapartida de costo de ventas, dejando incompleta la contabilidad para empresas con inventario.

**Archivo:** `functions/src/accounting/generate-journal-entry-from-invoice.ts`

**Datos disponibles:** El campo `averageCost` ya existe en `InvoiceLine` y se calcula en `on-purchase-receive.ts`.

**Asiento adicional a generar (por cada línea de producto con `averageCost > 0`):**
```
DÉBITO  5.1.01.001  Costo de Ventas              = qty * averageCost
CRÉDITO 1.1.03.001  Inventario de Mercaderías    = qty * averageCost
```

**Lógica a agregar:**
```typescript
// Calcular COGS por línea
const cogsLines = invoice.lines
  .filter(line => line.averageCost && line.averageCost > 0)
  .flatMap(line => {
    const cogs = line.quantity * line.averageCost;
    return [
      { accountCode: '5.1.01.001', accountName: 'Costo de Ventas', debit: cogs, credit: 0 },
      { accountCode: '1.1.03.001', accountName: 'Inventario de Mercaderías', debit: 0, credit: cogs }
    ];
  });

// Agregar al asiento existente si hay líneas de COGS
if (cogsLines.length > 0) {
  entryLines.push(...cogsLines);
}
```

**Condición:** Solo aplica si el producto tiene `averageCost > 0` (excluye servicios).

---

### 2.2 — Asiento de Apertura al crear ejercicio

**Problema:** El campo `openingEntryId` existe en `AccountingPeriod` pero nunca se llena. Al iniciar un nuevo ejercicio no queda registrado el balance inicial.

**Archivos a modificar:**
- `functions/src/accounting/close-accounting-period.ts` — generar asiento de apertura del siguiente ejercicio con los saldos de cuentas de Balance General

**O alternativamente:**
- Nueva Cloud Function: `generate-opening-entry.ts` — callable que toma el `closingEntryId` del período anterior y genera el asiento de apertura

**Lógica:** El asiento de apertura invierte el asiento de cierre: los saldos finales de cuentas de activo, pasivo y patrimonio se convierten en saldos iniciales del nuevo período.

---

### 2.3 — Configuración de mapa de cuentas por empresa

**Problema:** Las Cloud Functions usan `DEFAULT_ACCOUNTS` hardcodeado. Empresas que personalicen su plan de cuentas no pueden mapear sus propias cuentas sin modificar el código.

**Solución:**
1. Crear documento en Firestore: `companies/{companyId}/settings/accounting` con campo `accountMapping`
2. Nueva página en frontend: `accounting-settings-page` con formulario para mapear cada cuenta contable del sistema (ventas, IVA, retenciones, inventario, COGS, etc.)
3. Las Cloud Functions deben leer primero `settings/accounting.accountMapping` y hacer fallback a `DEFAULT_ACCOUNTS`

**Schema propuesto:**
```typescript
interface AccountingSettings {
  accountMapping: {
    salesAccount15: string;      // default '4.1.01.001'
    salesAccount0: string;       // default '4.1.01.002'
    salesExempt: string;         // default '4.1.01.003'
    vatPayable: string;          // default '2.1.01.003'
    retIRPayable: string;        // default '2.1.01.004'
    retIVAPayable: string;       // default '2.1.01.005'
    accountsReceivable: string;  // default '1.1.02.001'
    cashAccount: string;         // default '1.1.01.001'
    inventory: string;           // default '1.1.03.001'
    cogs: string;                // default '5.1.01.001'
  };
}
```

---

### 2.4 — Integración contable: Notas de Crédito

**Problema:** Las notas de crédito no generan ningún asiento contable. Son la reversión de una factura.

**Archivo nuevo:** `functions/src/accounting/generate-journal-entry-from-credit-note.ts`

**Lógica:** Misma que `generate-journal-entry-from-invoice.ts` pero con débitos y créditos invertidos. El asiento de crédito anula el ingreso y revierte el IVA.

**Trigger:** `onDocumentUpdated` en `companies/{cId}/credit_notes/{noteId}` cuando `status → issued`.

---

## FASE 3 — Mejoras de Producción (Sprint 3 — 1 semana)
> **Calidad profesional y cumplimiento normativo**

### 3.1 — Export PDF real en reportes

**Problema:** Los tres reportes (Libro Diario, Libro Mayor, Balance de Comprobación) usan `window.print()` que produce resultados inconsistentes según el navegador del usuario.

**Opciones:**
- **Opción A (recomendada):** Cloud Function callable que recibe los datos del reporte y retorna un PDF usando `pdfmake` o similar. El frontend llama y descarga el Blob.
- **Opción B:** Librería en frontend `jsPDF` + `jspdf-autotable` para generación client-side.

**Reportes a convertir:**
- Libro Diario
- Libro Mayor
- Balance de Comprobación
- Estado de Resultados (desde Fase 1)
- Balance General (desde Fase 1)

**Encabezado del PDF:** Nombre de la empresa, RUC, logo, período, fecha de generación, página X de Y.

---

### 3.2 — Integración contable: Compras

**Problema:** Las compras/recepciones no generan asientos contables.

**Archivo nuevo:** `functions/src/accounting/generate-journal-entry-from-purchase.ts`

**Asiento al recibir una compra:**
```
DÉBITO  1.1.03.001  Inventario de Mercaderías    = subtotal
DÉBITO  1.1.05.001  IVA en Compras (Crédito Tributario) = IVA
CRÉDITO 2.1.01.001  Cuentas por Pagar            = total
```

**Trigger:** `onDocumentUpdated` en `companies/{cId}/purchases/{purchaseId}` cuando `receivedAt` cambia de null a fecha.

---

### 3.3 — Integración contable: POS

**Problema:** Las ventas del POS generan facturas pero el trigger `generateJournalEntryFromInvoice` solo se activa si `sriStatus === 'authorized'` o `'not_required'`. Verificar que el flujo del POS actualiza correctamente estos campos.

**Acción:** Auditar el flujo en `functions/src/pos/` y en el servicio Angular del POS para confirmar que las ventas del POS actualizan `status: 'issued'` y `sriStatus: 'not_required'` (o el valor correcto) en el documento de factura, activando así el trigger contable existente.

---

### 3.4 — Validaciones y calidad

**3.4.1 — Prevenir dos ejercicios `open` del mismo año**

En `AccountingPeriodsService.createPeriod()` o en reglas Firestore, validar que no exista otro período con el mismo `year` y `status: 'open'` antes de crear.

**3.4.2 — Verificar rol `accountant` en custom claims**

Confirmar que el rol `accountant` está definido en:
- El sistema de custom claims de Firebase Auth
- La interfaz de gestión de usuarios del frontend
- La pantalla de invitación/asignación de roles

**3.4.3 — Expandir límite del Libro Mayor**

El método de búsqueda de cuentas en `libro-mayor-page` tiene `slice(0, 80)`. Para planes Enterprise con planes de cuentas extendidos, aumentar o implementar búsqueda con paginación.

---

### 3.5 — Integración contable: Notas de Débito

**Archivo nuevo:** `functions/src/accounting/generate-journal-entry-from-debit-note.ts`

Genera asiento por diferencias en precio/cantidad que incrementan el valor de la factura original.

---

## FASE 4 — Futuro / Avanzado (Post-producción)

### 4.1 — Conciliación bancaria

Módulo para cargar extractos bancarios (CSV/OFX) y conciliarlos con los asientos de caja/banco en el diario.

### 4.2 — Centros de costo en reportes

Los centros de costo ya están implementados en los asientos pero no aparecen en los reportes. Agregar filtro por centro de costo en Libro Mayor, Estado de Resultados y Balance General.

### 4.3 — Presupuesto vs real

Módulo para definir presupuesto por cuenta/período y compararlo con los movimientos reales en el Estado de Resultados.

### 4.4 — Depreciaciones automáticas

Trigger mensual (Cloud Scheduler) que calcule y genere asientos de depreciación de activos fijos basados en los activos registrados en `1.2.x.x`.

### 4.5 — Declaración de impuestos (formularios SRI)

- Formulario 104 (IVA mensual)
- Formulario 101 (Impuesto a la Renta anual)
- Pre-llenado automático desde los asientos contables

### 4.6 — Multi-moneda

Soporte para transacciones en USD (Ecuador solo usa USD, pero puede necesitarse para clientes con operaciones internacionales).

---

## Checklist de QA Antes de Activar para Primeros Clientes

### Funcionalidad mínima (Fase 1 completada)
- [ ] Plan de cuentas cargado con seed Ecuador de 89 cuentas
- [ ] Al menos 1 ejercicio contable creado y en estado `open`
- [ ] Asiento manual: crear, contabilizar, anular — flujo completo sin errores
- [ ] Factura autorizada por SRI → asiento automático creado con referencias correctas
- [ ] Retención autorizada → asiento automático con cuentas correctas de IR/IVA
- [ ] `closePeriod()` invoca la Cloud Function y genera asiento de cierre de resultados
- [ ] Estado de Resultados muestra ingresos vs costos del período
- [ ] Balance General muestra activos = pasivos + patrimonio (diferencia < $0.01)
- [ ] Libro Diario, Mayor y Balance de Comprobación imprimen correctamente

### Seguridad
- [ ] Usuarios con rol `viewer` o `seller` no pueden acceder a rutas `/accounting/*`
- [ ] Un usuario de empresa A no puede leer asientos de empresa B
- [ ] Asientos con `type: 'automatic'` no son editables desde la UI
- [ ] Asientos `cancelled` son inmutables

### Datos
- [ ] El contador atómico `counters/journal_entries` no genera números duplicados bajo carga concurrente
- [ ] El batch de importación de cuentas (450 por batch) funciona sin errores de cuota
- [ ] Ejercicios en estado `locked` bloquean la creación de nuevos asientos en ese período

---

## Referencias de Código Clave

| Concepto | Archivo |
|---|---|
| Seed 89 cuentas Ecuador | `src/app/features/accounting/models/account.interface.ts` |
| Asiento automático desde factura | `functions/src/accounting/generate-journal-entry-from-invoice.ts` |
| Asiento automático desde retención | `functions/src/accounting/generate-journal-entry-from-retention.ts` |
| Cloud Function cierre de ejercicio | `functions/src/accounting/close-accounting-period.ts` |
| Bug crítico `closePeriod()` | `src/app/features/accounting/services/accounting-periods.service.ts` |
| Rutas del módulo | `src/app/features/accounting/accounting.routes.ts` |
| COGS source data | `functions/src/inventory/on-purchase-receive.ts` (campo `averageCost`) |
| Feature flag guard | `src/app/core/guards/feature-flag.guard.ts` |
| Plugin definition | Seed de plugins — `pkg_accounting`, $29/mes |

---

## Decisiones de Arquitectura Tomadas

1. **Numeración atómica de asientos** — Se usa `runTransaction` con contador en `counters/journal_entries` separado por año (`journal_2025`, `journal_2026`). Esto garantiza que los números sean consecutivos sin huecos bajo concurrencia.

2. **Asientos automáticos inmutables para usuarios** — Las reglas Firestore bloquean que cualquier rol de usuario (`admin`, `accountant`) modifique asientos con `type: 'automatic'`. Solo el Admin SDK de Cloud Functions puede hacerlo. Esto preserva la trazabilidad fiscal.

3. **Trigger idempotente** — El campo `accountingEntryId` en la factura sirve como flag de idempotencia: si ya existe, la Cloud Function retorna sin hacer nada. Previene asientos duplicados por reintentos de Firebase.

4. **Período contable como filtro de asientos** — Los asientos tienen `periodId` y `periodYear`. Los reportes filtran por período, no por rango de fechas arbitrario. Esto es coherente con cómo trabajan los contadores en Ecuador.

5. **Plan de cuentas no se puede eliminar** — La regla `allow delete: if false` en `chart_of_accounts` es permanente. Las cuentas solo se desactivan con `isActive: false`. Esto es un requisito contable: no se puede borrar historia.

6. **DEFAULT_ACCOUNTS en Cloud Functions** — Actualmente hardcodeado. La Fase 2.3 lo moverá a Firestore para configuración por empresa. La arquitectura ya contempla el fallback.
