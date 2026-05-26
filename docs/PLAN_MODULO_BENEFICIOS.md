# Plan de Implementacion — Modulo Beneficios / Distribucion de Ganancias

**Version:** 1.0  
**Fecha:** 2026-05-25  
**Stack:** Angular 21 + CoreUI 5.x + Firebase (Firestore, Auth, Functions)  
**Multi-tenant:** `/companies/{companyId}/...`  
**Plugin Package:** `pkg_benefits` (requiere `pkg_sales`)  
**Fase de implementacion:** F6 — Modulos Avanzados  

---

## 1. Resumen Ejecutivo

El modulo **Beneficios** calcula la ganancia bruta operacional de la empresa sumando ventas POS completadas y facturas emitidas/pagadas, sustrayendo el costo de ventas (COGS) usando el `averageCost` capturado al momento de cada transaccion. Permite configurar N socios con porcentajes de participacion y registrar liquidaciones periodicas con estado de pago por socio.

### Fuentes de datos

| Coleccion Firestore | Incluida si |
|---------------------|-------------|
| `pos-sales` | `status == 'completed'` |
| `invoices` | `status IN ['issued', 'paid']` y `isCreditNote == false` |
| Excluidas | `status == 'void'`, `status == 'draft'`, `isCreditNote == true` |

### Formula de ganancia bruta por linea

```
cogs_linea      = averageCost * quantity
revenue_linea   = subtotal               // precio neto sin IVA, con descuento de linea aplicado
gross_profit    = revenue_linea - cogs_linea
gross_margin %  = (gross_profit / revenue_linea) * 100
```

> El `subtotal` de cada linea ya incorpora el descuento de linea (`discountPct`) pero NO el descuento global del documento. Ver seccion 6 para el tratamiento del descuento global.

---

## 2. Paths Firestore — Schema Completo

### 2.1 Configuracion de socios (por empresa)

```
/companies/{companyId}/profit-config/{configId}
```

Existe un unico documento activo por empresa. Se puede versionar con `isActive = false` para mantener historial de configuraciones anteriores.

```jsonc
{
  "id": "string",
  "name": "Configuracion 2025",          // nombre descriptivo
  "isActive": true,                       // solo una config activa a la vez
  "partners": [
    {
      "id": "p1",                         // UUID local (no es FK)
      "name": "Socio A",
      "taxId": "0912345678",              // RUC/CI — opcional, para reportes
      "email": "socioa@empresa.com",      // opcional
      "percentage": 60.00,               // con 2 decimales
      "notes": "Socio fundador"
    },
    {
      "id": "p2",
      "name": "Socio B",
      "taxId": "0987654321",
      "percentage": 20.00
    },
    {
      "id": "p3",
      "name": "Socio C",
      "percentage": 20.00
    }
  ],
  "totalPercentage": 100.00,             // siempre debe ser 100, validado en UI y reglas
  "createdBy": "uid_firebase",
  "createdAt": "Timestamp",
  "updatedAt": "Timestamp",
  "updatedBy": "uid_firebase"
}
```

**Regla de negocio:** `sum(partners[].percentage) == 100` se valida en frontend antes de guardar y en Cloud Function si se implementa escritura via CF.

---

### 2.2 Snapshot de beneficios por periodo (cache agregado)

```
/companies/{companyId}/profit-snapshots/{snapshotId}
```

Documento generado por Cloud Function o calculado on-demand y persistido. Evita recalcular sobre colecciones grandes en cada consulta del dashboard.

```jsonc
{
  "id": "string",
  "periodType": "month",                 // 'day' | 'week' | 'month' | 'year' | 'custom'
  "periodLabel": "2025-04",             // 'YYYY-MM' | 'YYYY-Www' | 'YYYY' | 'YYYY-MM-DD'
  "startDate": "Timestamp",
  "endDate": "Timestamp",
  "warehouseCode": null,                // null = todas las bodegas
  "familyId": null,                     // null = todas las familias

  // Contadores de documentos procesados
  "posSalesCount": 142,
  "invoicesCount": 38,
  "totalDocsCount": 180,

  // Totales financieros (sin IVA)
  "totalRevenue": 15420.50,            // suma de subtotals netos de lineas
  "totalCogs": 9800.25,                // suma de (averageCost * qty) por linea
  "grossProfit": 5620.25,              // totalRevenue - totalCogs
  "grossMarginPct": 36.44,            // (grossProfit / totalRevenue) * 100

  // Lineas sin costo (para alertas)
  "linesWithoutCost": 12,             // count de lineas donde averageCost == 0
  "revenueWithoutCost": 320.00,       // revenue de esas lineas (impacto potencial)

  // Distribucion por socios (snapshot de la config activa al momento del calculo)
  "configId": "string",               // FK a profit-config
  "distribution": [
    {
      "partnerId": "p1",
      "partnerName": "Socio A",
      "percentage": 60.00,
      "amount": 3372.15
    },
    {
      "partnerId": "p2",
      "partnerName": "Socio B",
      "percentage": 20.00,
      "amount": 1124.05
    },
    {
      "partnerId": "p3",
      "partnerName": "Socio C",
      "percentage": 20.00,
      "amount": 1124.05
    }
  ],

  // Control
  "calculatedAt": "Timestamp",
  "calculatedBy": "uid_firebase",      // 'system' si fue CF
  "isStale": false,                    // true si hubo ventas nuevas despues del calculo
  "source": "manual"                   // 'manual' | 'scheduled_cf'
}
```

---

### 2.3 Liquidaciones (cierres de periodo)

```
/companies/{companyId}/profit-distributions/{distributionId}
```

Registro inmutable una vez creado (solo cambia `status` y `partnerPayments[].paidAt`).

```jsonc
{
  "id": "string",
  "snapshotId": "string",             // FK a profit-snapshots
  "periodType": "month",
  "periodLabel": "2025-04",
  "startDate": "Timestamp",
  "endDate": "Timestamp",

  // Totales al momento de la liquidacion
  "totalRevenue": 15420.50,
  "totalCogs": 9800.25,
  "grossProfit": 5620.25,
  "grossMarginPct": 36.44,

  // Config de socios usada (snapshot al momento de distribuir)
  "configId": "string",
  "configName": "Configuracion 2025",

  // Pagos por socio
  "partnerPayments": [
    {
      "partnerId": "p1",
      "partnerName": "Socio A",
      "taxId": "0912345678",
      "percentage": 60.00,
      "amount": 3372.15,
      "status": "pending",            // 'pending' | 'paid'
      "paidAt": null,
      "paidBy": null,                 // uid que marco como pagado
      "paymentMethod": null,          // 'cash' | 'transfer' | 'check' | 'other'
      "paymentReference": null,       // numero de transferencia, cheque, etc.
      "notes": null
    }
  ],

  // Estado general
  "status": "pending",               // 'pending' | 'partially_paid' | 'distributed'
  "notes": "Liquidacion abril 2025",

  // Auditoria
  "createdBy": "uid_firebase",
  "createdByName": "Juan Perez",
  "createdAt": "Timestamp",
  "updatedAt": "Timestamp",
  "updatedBy": "uid_firebase"
}
```

**Transicion de status:**
- `pending`: ninguno pagado
- `partially_paid`: al menos uno pagado, no todos
- `distributed`: todos marcados como pagados

---

### 2.4 Indices Firestore requeridos (firestore.indexes.json)

```jsonc
// profit-snapshots — filtro por periodo y tipo
{ "collectionGroup": "profit-snapshots",
  "fields": [
    { "fieldPath": "periodType", "order": "ASCENDING" },
    { "fieldPath": "startDate",  "order": "DESCENDING" }
  ]
}

// profit-distributions — filtro por estado
{ "collectionGroup": "profit-distributions",
  "fields": [
    { "fieldPath": "status",    "order": "ASCENDING" },
    { "fieldPath": "createdAt", "order": "DESCENDING" }
  ]
}

// pos-sales — calculo de beneficio por rango de fechas
{ "collectionGroup": "pos-sales",
  "fields": [
    { "fieldPath": "status",    "order": "ASCENDING" },
    { "fieldPath": "createdAt", "order": "ASCENDING" }
  ]
}

// invoices — calculo de beneficio por rango de fechas
{ "collectionGroup": "invoices",
  "fields": [
    { "fieldPath": "status",    "order": "ASCENDING" },
    { "fieldPath": "date",      "order": "ASCENDING" }
  ]
}
```

---

## 3. Modelos TypeScript

Archivo: `src/app/features/benefits/models/benefit.interface.ts`

```typescript
import { Timestamp } from '@angular/fire/firestore';

// ─── Enums ────────────────────────────────────────────────────────────────────

export type ProfitPeriodType = 'day' | 'week' | 'month' | 'year' | 'custom';
export type DistributionStatus = 'pending' | 'partially_paid' | 'distributed';
export type PartnerPaymentStatus = 'pending' | 'paid';
export type PartnerPaymentMethod = 'cash' | 'transfer' | 'check' | 'other';

// ─── Partner config ───────────────────────────────────────────────────────────

export interface ProfitPartner {
  id: string;                    // UUID local (nanoid / crypto.randomUUID)
  name: string;
  taxId?: string;
  email?: string;
  percentage: number;            // 0.01 - 100, suma total debe ser 100
  notes?: string;
}

// ─── Profit config ────────────────────────────────────────────────────────────
// /companies/{companyId}/profit-config/{configId}

export interface ProfitConfig {
  id: string;
  name: string;
  isActive: boolean;
  partners: ProfitPartner[];
  totalPercentage: number;       // cached sum — siempre 100 si es valida
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  updatedBy?: string;
}

// ─── Distribution line (por socio) ───────────────────────────────────────────

export interface PartnerDistributionLine {
  partnerId: string;
  partnerName: string;
  percentage: number;
  amount: number;
}

// ─── Profit snapshot ──────────────────────────────────────────────────────────
// /companies/{companyId}/profit-snapshots/{snapshotId}

export interface ProfitSnapshot {
  id: string;
  periodType: ProfitPeriodType;
  periodLabel: string;
  startDate: Timestamp;
  endDate: Timestamp;
  warehouseCode: string | null;
  familyId: string | null;

  // Contadores
  posSalesCount: number;
  invoicesCount: number;
  totalDocsCount: number;

  // Financiero
  totalRevenue: number;
  totalCogs: number;
  grossProfit: number;
  grossMarginPct: number;

  // Alertas
  linesWithoutCost: number;
  revenueWithoutCost: number;

  // Distribucion
  configId: string;
  distribution: PartnerDistributionLine[];

  // Control
  calculatedAt: Timestamp;
  calculatedBy: string;
  isStale: boolean;
  source: 'manual' | 'scheduled_cf';
}

// ─── Partner payment en una liquidacion ──────────────────────────────────────

export interface PartnerPayment {
  partnerId: string;
  partnerName: string;
  taxId?: string;
  percentage: number;
  amount: number;
  status: PartnerPaymentStatus;
  paidAt?: Timestamp | null;
  paidBy?: string | null;
  paymentMethod?: PartnerPaymentMethod | null;
  paymentReference?: string | null;
  notes?: string | null;
}

// ─── Profit distribution (liquidacion) ───────────────────────────────────────
// /companies/{companyId}/profit-distributions/{distributionId}

export interface ProfitDistribution {
  id: string;
  snapshotId: string;
  periodType: ProfitPeriodType;
  periodLabel: string;
  startDate: Timestamp;
  endDate: Timestamp;

  // Totales congelados al crear la liquidacion
  totalRevenue: number;
  totalCogs: number;
  grossProfit: number;
  grossMarginPct: number;

  // Config usada
  configId: string;
  configName: string;

  // Pagos
  partnerPayments: PartnerPayment[];
  status: DistributionStatus;

  notes?: string;
  createdBy: string;
  createdByName: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  updatedBy?: string;
}

// ─── Resultado de calculo (en memoria — no se persiste directamente) ──────────

export interface ProfitCalculationResult {
  periodType: ProfitPeriodType;
  periodLabel: string;
  startDate: Date;
  endDate: Date;
  posSalesCount: number;
  invoicesCount: number;
  totalRevenue: number;
  totalCogs: number;
  grossProfit: number;
  grossMarginPct: number;
  linesWithoutCost: number;
  revenueWithoutCost: number;
  lineBreakdown: ProfitLineDetail[];   // detalle para drill-down
}

export interface ProfitLineDetail {
  sourceType: 'pos_sale' | 'invoice';
  sourceId: string;
  sourceNumber: string;                // ticketNumber o fullNumber
  date: Date;
  productId: string;
  productSku: string;
  productName: string;
  familyId?: string;
  familyName?: string;
  warehouseCode: string;
  quantity: number;
  salePrice: number;
  averageCost: number;
  revenue: number;                     // subtotal neto de la linea
  cogs: number;                        // averageCost * quantity
  grossProfit: number;
  grossMarginPct: number;
  hasCost: boolean;                    // false si averageCost == 0
}

// ─── Labels y helpers ─────────────────────────────────────────────────────────

export const PERIOD_TYPE_LABELS: Record<ProfitPeriodType, string> = {
  day:    'Diario',
  week:   'Semanal',
  month:  'Mensual',
  year:   'Anual',
  custom: 'Personalizado'
};

export const DISTRIBUTION_STATUS_LABELS: Record<DistributionStatus, string> = {
  pending:          'Pendiente',
  partially_paid:   'Parcialmente pagado',
  distributed:      'Distribuido'
};

export const DISTRIBUTION_STATUS_COLORS: Record<DistributionStatus, string> = {
  pending:          'warning',
  partially_paid:   'primary',
  distributed:      'success'
};

export function calcDistributionStatus(payments: PartnerPayment[]): DistributionStatus {
  const paid = payments.filter(p => p.status === 'paid').length;
  if (paid === 0)                return 'pending';
  if (paid === payments.length)  return 'distributed';
  return 'partially_paid';
}
```

---

## 4. Arquitectura Angular

### 4.1 Estructura de directorios

```
src/app/features/benefits/
├── benefits.routes.ts
├── _benefits-shared.scss           // tokens/variables SCSS del modulo
│
├── models/
│   └── benefit.interface.ts        // (todas las interfaces de seccion 3)
│
├── services/
│   ├── profit-calculator.service.ts   // logica de calculo — query Firestore
│   ├── profit-config.service.ts       // CRUD de profit-config
│   └── profit-distribution.service.ts // CRUD de profit-snapshots + distributions
│
├── benefits-dashboard/                // P1 — pagina principal con KPIs
│   ├── benefits-dashboard.component.ts
│   ├── benefits-dashboard.component.html
│   └── benefits-dashboard.component.scss
│
├── benefits-config/                   // P2 — configuracion de socios
│   ├── benefits-config.component.ts
│   ├── benefits-config.component.html
│   └── benefits-config.component.scss
│
├── benefits-history/                  // P3 — historial de liquidaciones
│   ├── benefits-history.component.ts
│   ├── benefits-history.component.html
│   └── benefits-history.component.scss
│
└── components/
    ├── profit-period-selector/        // selector de periodo (dia/semana/mes/ano/custom)
    │   ├── profit-period-selector.component.ts
    │   ├── profit-period-selector.component.html
    │   └── profit-period-selector.component.scss
    ├── profit-kpi-cards/              // tarjetas de KPI (revenue, cogs, profit, margen)
    │   ├── profit-kpi-cards.component.ts
    │   ├── profit-kpi-cards.component.html
    │   └── profit-kpi-cards.component.scss
    ├── profit-partner-table/          // tabla de distribucion por socio
    │   ├── profit-partner-table.component.ts
    │   ├── profit-partner-table.component.html
    │   └── profit-partner-table.component.scss
    ├── profit-line-detail-modal/      // drill-down de lineas
    │   ├── profit-line-detail-modal.component.ts
    │   ├── profit-line-detail-modal.component.html
    │   └── profit-line-detail-modal.component.scss
    └── distribution-payment-modal/    // modal para marcar pago de socio
        ├── distribution-payment-modal.component.ts
        ├── distribution-payment-modal.component.html
        └── distribution-payment-modal.component.scss
```

### 4.2 Rutas (benefits.routes.ts)

```typescript
import { Routes } from '@angular/router';

export const BENEFITS_ROUTES: Routes = [
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full'
  },
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./benefits-dashboard/benefits-dashboard.component')
        .then(m => m.BenefitsDashboardComponent),
    title: 'Beneficios — Dashboard'
  },
  {
    path: 'config',
    loadComponent: () =>
      import('./benefits-config/benefits-config.component')
        .then(m => m.BenefitsConfigComponent),
    title: 'Beneficios — Configuracion de socios'
  },
  {
    path: 'history',
    loadComponent: () =>
      import('./benefits-history/benefits-history.component')
        .then(m => m.BenefitsHistoryComponent),
    title: 'Beneficios — Historial de liquidaciones'
  }
];
```

Registro en `app.routes.ts`:

```typescript
{
  path: 'benefits',
  canActivate: [authGuard, moduleGuard('benefits')],
  loadChildren: () =>
    import('./features/benefits/benefits.routes')
      .then(m => m.BENEFITS_ROUTES)
}
```

### 4.3 Servicio de calculo (profit-calculator.service.ts)

Este servicio contiene la logica central. Ejecuta queries paralelas sobre `pos-sales` e `invoices`, construye el `ProfitCalculationResult` en memoria.

```typescript
@Injectable({ providedIn: 'root' })
export class ProfitCalculatorService {
  private firestore     = inject(Firestore);
  private tenantService = inject(TenantService);

  // Calcula ganancia bruta para un rango de fechas
  async calculate(
    startDate: Date,
    endDate: Date,
    warehouseCode?: string,
    familyId?: string
  ): Promise<ProfitCalculationResult> {

    const [posSales, invoices] = await Promise.all([
      this.queryPosSales(startDate, endDate),
      this.queryInvoices(startDate, endDate)
    ]);

    const lines: ProfitLineDetail[] = [];

    // Procesar POS sales
    for (const sale of posSales) {
      for (const line of sale.lines) {
        // Filtro opcional por bodega
        if (warehouseCode && sale.warehouseCode !== warehouseCode) continue;
        // Filtro opcional por familia (requiere que el productId este en esa familia
        // — se resuelve con un Map pre-cargado de products si el filtro esta activo)
        lines.push(this.buildLineDetail('pos_sale', sale, line));
      }
    }

    // Procesar Invoices
    for (const invoice of invoices) {
      for (const line of invoice.lines) {
        if (warehouseCode && invoice.warehouseCode !== warehouseCode) continue;
        lines.push(this.buildLineDetail('invoice', invoice, line));
      }
    }

    return this.aggregateLines(lines, startDate, endDate, posSales.length, invoices.length);
  }

  private buildLineDetail(
    sourceType: 'pos_sale' | 'invoice',
    doc: PosSale | Invoice,
    line: PosCartItem | InvoiceLine
  ): ProfitLineDetail {
    // averageCost se toma directamente del campo en la linea
    // (en POS ya existe; en Invoice se debe agregar — ver seccion 6.2)
    const averageCost = (line as any).averageCost ?? 0;
    const quantity    = line.quantity;
    const revenue     = line.subtotal;          // neto sin IVA, con desc de linea
    const cogs        = round2(averageCost * quantity);
    const grossProfit = round2(revenue - cogs);
    const margin      = revenue > 0
      ? round2((grossProfit / revenue) * 100)
      : 0;

    return {
      sourceType,
      sourceId:      doc.id,
      sourceNumber:  sourceType === 'pos_sale'
        ? String((doc as PosSale).ticketNumber)
        : (doc as Invoice).fullNumber,
      date:          (doc.createdAt as Timestamp).toDate(),
      productId:     (line as any).productId ?? '',
      productSku:    (line as any).productSku ?? '',
      productName:   (line as any).productName ?? (line as InvoiceLine).description,
      warehouseCode: (doc as any).warehouseCode ?? '',
      quantity,
      salePrice:     (line as any).salePrice ?? (line as InvoiceLine).unitPrice,
      averageCost,
      revenue,
      cogs,
      grossProfit,
      grossMarginPct: margin,
      hasCost:       averageCost > 0
    };
  }

  private aggregateLines(
    lines: ProfitLineDetail[],
    startDate: Date,
    endDate: Date,
    posSalesCount: number,
    invoicesCount: number
  ): ProfitCalculationResult {
    const totalRevenue = round2(lines.reduce((s, l) => s + l.revenue, 0));
    const totalCogs    = round2(lines.reduce((s, l) => s + l.cogs, 0));
    const grossProfit  = round2(totalRevenue - totalCogs);
    const margin       = totalRevenue > 0 ? round2((grossProfit / totalRevenue) * 100) : 0;
    const noGap        = lines.filter(l => !l.hasCost);

    return {
      periodType:          'custom',
      periodLabel:         '',
      startDate,
      endDate,
      posSalesCount,
      invoicesCount,
      totalRevenue,
      totalCogs,
      grossProfit,
      grossMarginPct:      margin,
      linesWithoutCost:    noGap.length,
      revenueWithoutCost:  round2(noGap.reduce((s, l) => s + l.revenue, 0)),
      lineBreakdown:       lines
    };
  }

  private async queryPosSales(start: Date, end: Date): Promise<PosSale[]> {
    const ref = collection(
      this.firestore,
      `companies/${this.tenantService.companyId}/pos-sales`
    );
    const q = query(
      ref,
      where('status', '==', 'completed'),
      where('createdAt', '>=', Timestamp.fromDate(start)),
      where('createdAt', '<=', Timestamp.fromDate(end)),
      orderBy('createdAt', 'asc')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }) as PosSale);
  }

  private async queryInvoices(start: Date, end: Date): Promise<Invoice[]> {
    const ref = collection(
      this.firestore,
      `companies/${this.tenantService.companyId}/invoices`
    );
    // Se deben hacer 2 queries separadas (Firestore no soporta 'in' con rango de fecha)
    // Query 1: issued
    const q1 = query(ref,
      where('status', '==', 'issued'),
      where('isCreditNote', '==', false),
      where('date', '>=', Timestamp.fromDate(start)),
      where('date', '<=', Timestamp.fromDate(end)),
      orderBy('date', 'asc')
    );
    // Query 2: paid
    const q2 = query(ref,
      where('status', '==', 'paid'),
      where('isCreditNote', '==', false),
      where('date', '>=', Timestamp.fromDate(start)),
      where('date', '<=', Timestamp.fromDate(end)),
      orderBy('date', 'asc')
    );
    const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
    const all = [...snap1.docs, ...snap2.docs];
    return all.map(d => ({ id: d.id, ...d.data() }) as Invoice);
  }
}

function round2(n: number): number { return Math.round(n * 100) / 100; }
```

### 4.4 Servicio de configuracion (profit-config.service.ts)

```typescript
@Injectable({ providedIn: 'root' })
export class ProfitConfigService {
  private firestore     = inject(Firestore);
  private tenantService = inject(TenantService);
  private auth          = inject(Auth);

  private colPath(): string {
    return `companies/${this.tenantService.companyId}/profit-config`;
  }

  getActiveConfig(): Observable<ProfitConfig | null> {
    const ref = collection(this.firestore, this.colPath());
    const q   = query(ref, where('isActive', '==', true), limit(1));
    return new Observable(observer =>
      onSnapshot(q, snap => {
        if (snap.empty) { observer.next(null); return; }
        observer.next({ id: snap.docs[0].id, ...snap.docs[0].data() } as ProfitConfig);
      }, err => observer.error(err))
    );
  }

  async saveConfig(config: Partial<ProfitConfig>): Promise<string> {
    const uid  = this.auth.currentUser!.uid;
    const col  = collection(this.firestore, this.colPath());
    const now  = serverTimestamp();

    if (config.id) {
      // Actualizar existente
      await updateDoc(doc(col, config.id), {
        ...config,
        updatedAt: now,
        updatedBy: uid
      });
      return config.id;
    }

    // Nueva config: desactivar la anterior primero (batch)
    const batch = writeBatch(this.firestore);
    const prevSnap = await getDocs(query(col, where('isActive', '==', true)));
    prevSnap.docs.forEach(d =>
      batch.update(d.ref, { isActive: false, updatedAt: now, updatedBy: uid })
    );
    const newRef = doc(col);
    batch.set(newRef, {
      ...config,
      isActive: true,
      createdBy: uid,
      createdAt: now,
      updatedAt: now,
      updatedBy: uid
    });
    await batch.commit();
    return newRef.id;
  }
}
```

### 4.5 Servicio de liquidaciones (profit-distribution.service.ts)

```typescript
@Injectable({ providedIn: 'root' })
export class ProfitDistributionService {
  private firestore     = inject(Firestore);
  private tenantService = inject(TenantService);
  private auth          = inject(Auth);

  snapshotsPath()     = `companies/${this.tenantService.companyId}/profit-snapshots`;
  distributionsPath() = `companies/${this.tenantService.companyId}/profit-distributions`;

  // Persistir snapshot calculado
  async saveSnapshot(data: Omit<ProfitSnapshot, 'id'>): Promise<string> { ... }

  // Crear liquidacion a partir de un snapshot
  async createDistribution(
    snapshot: ProfitSnapshot,
    config: ProfitConfig,
    notes?: string
  ): Promise<string> { ... }

  // Marcar pago de un socio
  async markPartnerPaid(
    distributionId: string,
    partnerId: string,
    paymentData: Pick<PartnerPayment, 'paymentMethod' | 'paymentReference' | 'notes'>
  ): Promise<void> { ... }

  // Stream historial de liquidaciones
  getDistributions(limitN = 50): Observable<ProfitDistribution[]> { ... }
}
```

---

## 5. Calculo del COGS — Detalle Tecnico

### 5.1 Origen del averageCost

El `averageCost` utilizado en el calculo de COGS es el valor **capturado en el momento de la transaccion**:

- **POS Sale:** la interfaz `PosCartItem` ya tiene el campo `averageCost?: number` (ver `/features/pos/models/pos.interface.ts` linea 89). Este valor debe poblarse desde el producto en el momento en que se agrega al carrito. La Cloud Function de stock ya lo tiene disponible en `StockMovement.unitCost`.

- **Invoice:** la interfaz `InvoiceLine` NO tiene `averageCost` actualmente. Se debe agregar el campo `averageCost?: number` a `InvoiceLine` antes de implementar este modulo. El valor se copia desde `product.averageCost` al momento de agregar la linea en el form de factura (igual que en POS).

### 5.2 Por que NO se debe recalcular el costo a posteriori

El `averageCost` del producto cambia con cada compra. Si se recalcula usando el valor actual del producto para ventas historicas, el COGS historico sera incorrecto. El costo debe quedar **congelado en la linea del documento** en el momento de la venta.

### 5.3 Verificacion de consistencia

Para que el reporte contable cuadre:

```
Ventas brutas (sin IVA)   = sum(invoice.netAmount) + sum(posSale.subtotal - posSale.discountAmount)
COGS                      = sum(line.averageCost * line.quantity) para todas las lineas incluidas
Ganancia bruta            = Ventas brutas - COGS
```

**Nota:** `netAmount` en `Invoice` ya incluye el descuento global. En POS, `subtotal - discountAmount` equivale al neto. Por eso a nivel de linea usamos `line.subtotal` (que ya tiene el descuento de linea) pero debemos aplicar el factor del descuento global (ver seccion 6).

---

## 6. Casos Edge y Limitaciones

### 6.1 Productos sin costo (averageCost == 0)

**Productos nuevos sin compra:** si nunca se registro una compra, `averageCost` es 0. El sistema:
- Calcula COGS = 0 (ganancia = revenue completo)
- Registra el contador `linesWithoutCost` y `revenueWithoutCost` en el snapshot
- Muestra una alerta en el dashboard: "X lineas sin costo registrado — ganancia puede estar sobreestimada"

**Servicios (noStock = true):** los servicios tipicamente tienen `averageCost = 0`. Esto es correcto contablemente para servicios puros (el margen es el 100% del precio de venta). Sin embargo, el usuario puede ingresar un `costPrice` que se refleja como `averageCost` si lo desea. El modulo no distingue entre producto y servicio — simplemente usa el costo que este registrado.

**Recomendacion al usuario:** configurar `averageCost` en todos los productos vendibles antes de activar el modulo. Ofrecer un informe previo de "productos con costo cero" antes del primer calculo.

### 6.2 Campo averageCost faltante en InvoiceLine

Mientras no se agregue `averageCost` a `InvoiceLine`, las facturas tendran COGS = 0. El plan de migracion sugiere:

1. Agregar `averageCost?: number` a la interfaz `InvoiceLine`.
2. Modificar el componente `invoice-form` para copiar el valor desde el producto al agregar/editar una linea.
3. Verificar que la Cloud Function `onInvoiceStock` use este campo para el movimiento de stock (actualmente usa `unitCost` en `StockMovement`).
4. Las facturas historicas sin el campo se tratan como averageCost = 0 en los calculos.

### 6.3 Descuento global en documentos

La estructura de `Invoice` tiene `globalDiscountPct` y `discountAmount` a nivel de cabecera. Los `line.subtotal` NO reflejan el descuento global — solo el descuento de linea.

**Algoritmo para aplicar descuento global a nivel de linea:**

```typescript
// El mismo factor que usa calcInvoiceTotals() en invoice.interface.ts
const gross  = lines.reduce((s, l) => s + l.subtotal, 0);
const factor = gross > 0 ? invoice.netAmount / gross : 1;

// Revenue ajustado por linea
const revenueAdjusted = round2(line.subtotal * factor);
// COGS no cambia — el costo no cambia con el descuento al cliente
const cogs            = round2(line.averageCost * line.quantity);
const grossProfit     = round2(revenueAdjusted - cogs);
```

Este factor es identico al que usa `calcInvoiceTotals()` en el codigo existente (linea 205 de `invoice.interface.ts`), garantizando consistencia con los totales del documento.

**Para POS:** la estructura `PosSale` tiene `globalDiscountPct` y `discountAmount`. Se aplica el mismo factor:
```typescript
const factor = sale.subtotal > 0 ? (sale.subtotal - sale.discountAmount) / sale.subtotal : 1;
```

### 6.4 Notas de credito (credit notes)

Las facturas con `isCreditNote == true` estan excluidas del calculo. El modulo NO revierte el COGS de la venta original cuando hay una nota de credito. Esta es una simplificacion intencional para P1/P2:

- Contablemente deberia restarse la ganancia de las lineas devueltas.
- Para P3 se puede agregar soporte para `credit_notes` como fuente negativa.

### 6.5 Ventas POS vinculadas a facturas

Cuando una venta POS genera una factura electronica, existe el riesgo de **doble conteo**: la venta aparece en `pos-sales` Y en `invoices`.

**Solucion:** si `PosSale.invoiceId` esta presente, esa venta NO se incluye en el calculo de `pos-sales` (se usa la factura como fuente unica). El servicio debe filtrar:

```typescript
// En queryPosSales():
// Incluir solo ventas sin factura vinculada O ventas que NO generaron factura
where('generateInvoice', '==', false)
// O bien:
where('invoiceId', '==', null)   // Firestore no soporta null directamente
// Alternativa: agregar campo booleano 'hasLinkedInvoice' a PosSale
```

**Recomendacion:** agregar campo `hasLinkedInvoice: boolean` a `PosSale` y setearlo en la Cloud Function cuando se crea la factura vinculada. Esto permite un query simple y eficiente.

### 6.6 Limites de Firestore en periodos grandes

Para periodos anuales con muchas ventas, una query de todos los documentos puede superar los limites de memoria del browser o tardar demasiado.

**Estrategia:**
- **P1:** query directa para periodos de hasta 1 mes. Para periodos mayores, mostrar advertencia y usar snapshots pre-calculados.
- **P2:** Cloud Function `calculateProfitSnapshot` que corre on-demand (HTTP callable) y persiste el resultado en `profit-snapshots`.
- **P3:** Cloud Function schedulada (primer dia de cada mes a las 01:00 ECT) que genera snapshot del mes anterior automaticamente.

### 6.7 Concurrencia en configuracion de socios

Si dos usuarios guardan la config de socios simultaneamente, el batch que desactiva la config anterior puede fallar o producir dos configs activas. Mitigaciones:

- Usar una transaction en lugar de batch para la desactivacion.
- Agregar una regla Firestore que solo permita un documento con `isActive == true` por empresa (puede ser complejo en reglas — preferir validacion en CF).
- Para P1: la concurrencia es baja (solo admins configuran socios), el batch es suficiente.

---

## 7. Reglas de Firestore (Security Rules)

```javascript
// profit-config — solo admin puede escribir, todos los autenticados de la empresa leen
match /companies/{companyId}/profit-config/{docId} {
  allow read:  if isCompanyMember(companyId);
  allow write: if isCompanyAdmin(companyId);
}

// profit-snapshots — solo admin escribe (o CF), todos leen
match /companies/{companyId}/profit-snapshots/{docId} {
  allow read:  if isCompanyMember(companyId);
  allow write: if isCompanyAdmin(companyId);
}

// profit-distributions — admin crea/actualiza, todos leen
match /companies/{companyId}/profit-distributions/{docId} {
  allow read:  if isCompanyMember(companyId);
  allow create: if isCompanyAdmin(companyId);
  allow update: if isCompanyAdmin(companyId)
    // Solo se permiten actualizar campos de pago — no los totales congelados
    && !request.resource.data.diff(resource.data).affectedKeys()
       .hasAny(['totalRevenue', 'totalCogs', 'grossProfit', 'configId',
                'startDate', 'endDate', 'createdBy', 'createdAt']);
  allow delete: if false;  // las liquidaciones son inmutables
}
```

Donde `isCompanyMember` y `isCompanyAdmin` son funciones helpers existentes en las reglas del proyecto.

---

## 8. Plugin Package

Registrar en `/plugin-packages/pkg_benefits`:

```jsonc
{
  "code": "pkg_benefits",
  "name": "Beneficios / Distribucion de Ganancias",
  "description": "Calcula ganancia bruta por periodo, configura socios con porcentajes y registra liquidaciones.",
  "modules": ["benefits"],
  "dependencies": ["pkg_sales"],
  "price": 0,                   // incluido — ajustar segun modelo comercial
  "currency": "USD",
  "billingPeriod": "monthly",
  "isActive": true
}
```

En `company.enabledModules` se agrega `"benefits"` al activar el paquete.

---

## 9. Roadmap de Implementacion

### P1 — Dashboard de lectura (2-3 semanas)

**Objetivo:** visualizar ganancia bruta sin persistencia, sin socios.

| Tarea | Agente | Dependencias |
|-------|--------|--------------|
| Agregar `averageCost` a `InvoiceLine` interface | Angular Agent | ninguna |
| Modificar `invoice-form` para copiar averageCost al agregar linea | Angular Agent | tarea anterior |
| Implementar `ProfitCalculatorService` (queries + calculo) | Firebase Agent + Business Agent | InvoiceLine actualizado |
| Implementar `BenefitsDashboardComponent` con KPI cards | Angular Agent | ProfitCalculatorService |
| Implementar `ProfitPeriodSelectorComponent` | Angular Agent | ninguna |
| Implementar `ProfitKpiCardsComponent` | Angular Agent | ninguna |
| Agregar `hasLinkedInvoice` a PosSale y filtrar en calculo | Firebase Agent | ninguna |
| Aplicar factor de descuento global en calculo por linea | Business Agent | ProfitCalculatorService |
| Indice Firestore para pos-sales y invoices por fecha | Firebase Agent | ninguna |
| Reglas Firestore para profit-config, snapshots, distributions | Security Agent | ninguna |
| Agregar ruta y entrada en menu sidebar | Angular Agent | BenefitsDashboardComponent |

**Entregable P1:** dashboard que muestra revenue, COGS, ganancia bruta y margen para un periodo seleccionado. Alerta de lineas sin costo.

---

### P2 — Configuracion de socios + distribucion (1-2 semanas)

**Prerequisito:** P1 completado y en produccion.

| Tarea | Agente | Dependencias |
|-------|--------|--------------|
| Implementar `ProfitConfigService` (CRUD) | Firebase Agent | ninguna |
| Implementar `BenefitsConfigComponent` con form reactivo | Angular Agent | ProfitConfigService |
| Validacion: suma de porcentajes == 100 en tiempo real | Angular Agent | ninguna |
| Implementar `ProfitPartnerTableComponent` | Angular Agent | ninguna |
| Mostrar distribucion calculada en dashboard (usando config activa) | Angular Agent | ProfitConfigService + P1 |
| Implementar `ProfitDistributionService.saveSnapshot()` | Firebase Agent | ninguna |
| Boton "Guardar snapshot" en dashboard | Angular Agent | ProfitDistributionService |
| Registrar plugin-package `pkg_benefits` en Firestore | Firebase Agent | ninguna |
| Activar `moduleGuard('benefits')` en rutas | Angular Agent | ninguna |

**Entregable P2:** usuario puede configurar socios, ver cuanto corresponde a cada uno y guardar un snapshot del calculo actual.

---

### P3 — Liquidaciones e historial (2 semanas)

**Prerequisito:** P2 completado.

| Tarea | Agente | Dependencias |
|-------|--------|--------------|
| Implementar `ProfitDistributionService.createDistribution()` | Firebase Agent | ninguna |
| Implementar `BenefitsHistoryComponent` con tabla de liquidaciones | Angular Agent | ProfitDistributionService |
| Implementar `DistributionPaymentModalComponent` | Angular Agent | ninguna |
| Logica de transicion de status (pending → partially_paid → distributed) | Business Agent | ninguna |
| Implementar `ProfitDistributionService.markPartnerPaid()` | Firebase Agent | ninguna |
| PDF de liquidacion (usando Cloud Function o html-to-pdf en browser) | Cloud Functions Agent | ninguna |
| Cloud Function HTTP callable `calculateProfitSnapshot` | Cloud Functions Agent | ProfitCalculatorService (portar logica a Node.js) |
| Cloud Function schedulada mensual | Cloud Functions Agent | CF anterior |
| Campo `isStale` en snapshot — trigger al detectar nueva venta | Cloud Functions Agent | ninguna |

**Entregable P3:** modulo completo con flujo de liquidacion, historial inmutable, pagos por socio y generacion automatica de snapshots mensuales.

---

## 10. Consideraciones Contables

### Ecuacion de verificacion

Para auditar que el modulo es consistente con la contabilidad:

```
Ingresos operacionales (ventas sin IVA)
  - Descuentos en ventas
= Ventas netas
  - Costo de ventas (COGS)
= Ganancia bruta
  - Gastos operacionales (fuera de scope de este modulo)
= Resultado operacional
```

El modulo cubre hasta **ganancia bruta**. Los gastos operacionales (sueldos, arriendos, servicios) no estan en scope — pertenecen al modulo de Contabilidad (`/features/accounting`).

### Relacion con el modulo de Contabilidad

Si en el futuro se integra con `journal-entries`:
- Cada liquidacion puede generar un asiento contable de distribucion de utilidades.
- Las cuentas contables de cada socio se pueden mapear a `purchaseAccountCode` o a un campo nuevo `profitAccountCode` en `ProfitPartner`.
- Este mapping es P4 (futura fase, no en scope actual).

### IVA

El modulo trabaja exclusivamente con valores **sin IVA** (`subtotal`, `netAmount`). El IVA es un pasivo del Estado, no forma parte de la ganancia. Esto es correcto contablemente y consistente con los campos existentes en `InvoiceLine` y `PosCartItem`.

---

## 11. Cambios Requeridos en Modulos Existentes

| Modulo / Archivo | Cambio | Impacto |
|------------------|--------|---------|
| `invoice.interface.ts` — `InvoiceLine` | Agregar `averageCost?: number` | Bajo — campo opcional |
| `invoice-form.component.ts` | Copiar `product.averageCost` al agregar linea | Bajo — logica existente similar |
| `pos-sales.service.ts` | Verificar que `averageCost` se copia al cart item desde el producto | Bajo — campo ya existe en `PosCartItem` |
| `pos.interface.ts` — `PosSale` | Agregar `hasLinkedInvoice?: boolean` | Bajo — campo opcional |
| Cloud Function de factura | Setear `hasLinkedInvoice = true` en `PosSale` al crear factura vinculada | Medio — modificar CF existente |
| `firestore.indexes.json` | Agregar 4 indices nuevos (seccion 2.4) | Ninguno — solo configuracion |
| `firestore.rules` | Agregar reglas para 3 colecciones nuevas | Bajo — no afecta reglas existentes |
| Menu sidebar | Agregar entrada "Beneficios" condicionada a `moduleGuard` | Bajo |

---

## 12. Metricas de Exito del Modulo

| Metrica | Definicion | Meta |
|---------|------------|------|
| Precision del COGS | % de lineas con averageCost > 0 | > 95% al mes de activacion |
| Tiempo de calculo (P1) | Segundos para calcular 1 mes con 500 ventas | < 5 segundos |
| Tiempo de calculo (P2-CF) | CF on-demand para 1 ano completo | < 30 segundos |
| Liquidaciones creadas | N de cierres de periodo en los primeros 3 meses | Al menos 1 por mes |
| Tasa de pago completo | % de liquidaciones que pasan a `distributed` en < 30 dias | > 80% |
