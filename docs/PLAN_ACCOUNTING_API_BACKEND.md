# Plan de Implementación — Backend Contable Independiente
## API Node.js + PostgreSQL para Integración con Sistemas Externos

**Versión:** 1.0  
**Fecha:** 2026-08-28  
**Propósito:** Backend de contabilidad como servicio SaaS, desacoplado del módulo de facturación. Permite a clientes externos enviar eventos comerciales (facturas, pagos, retenciones) y recibir asientos contables automáticos, con replicación en su propia base de datos PostgreSQL.

---

## Índice

1. [Contexto y Problema](#1-contexto-y-problema)
2. [Arquitectura General](#2-arquitectura-general)
3. [Stack Tecnológico](#3-stack-tecnológico)
4. [Schema de Base de Datos](#4-schema-de-base-de-datos)
5. [Contratos de la API — Eventos](#5-contratos-de-la-api--eventos)
6. [Flujo de Replicación al Cliente](#6-flujo-de-replicación-al-cliente)
7. [Seguridad](#7-seguridad)
8. [Fases de Implementación](#8-fases-de-implementación)
9. [Estructura de Carpetas](#9-estructura-de-carpetas)
10. [Variables de Entorno](#10-variables-de-entorno)
11. [Infraestructura y Deploy](#11-infraestructura-y-deploy)

---

## 1. Contexto y Problema

### Situación actual

El sistema SaasFacturacion tiene un módulo contable completo integrado con Firebase/Firestore. Los asientos contables se generan automáticamente mediante Cloud Functions cuando se emiten facturas, retenciones o notas de crédito/débito dentro del mismo sistema.

### Nuevo requerimiento

Algunos clientes ya tienen su propio sistema de facturación (ERP externo) y **solo necesitan el módulo contable**. Ellos:

1. Facturan en su propio sistema
2. Envían los eventos comerciales a nuestra API
3. Reciben los asientos contables generados automáticamente
4. Quieren que esos asientos se repliquen en su propia base de datos PostgreSQL

### Lo que NO debe hacer el backend contable

- No debe requerir que el cliente use nuestro módulo de facturación
- No debe tener acceso a la base de datos del cliente
- No debe generar documentos SRI (XML, RIDE) — eso es responsabilidad del sistema externo

---

## 2. Arquitectura General

```
╔══════════════════════════════════════════════════════════════════════╗
║  SISTEMA EXTERNO DEL CLIENTE (ERP propio)                           ║
║                                                                      ║
║  [Factura emitida] → Cola de eventos → Worker de envío             ║
╚══════════════════════════════════════════════════╦═════════════════╝
                                                   ║ HTTPS POST
                                                   ║ X-Api-Key
                                                   ║ X-Signature
                                                   ▼
╔══════════════════════════════════════════════════════════════════════╗
║  ACCOUNTING API  (Node.js + NestJS)                                  ║
║                                                                      ║
║  ┌─────────────────────────────────────────────────────────────┐    ║
║  │  API Gateway                                                 │    ║
║  │  • Valida API Key por empresa (multi-tenant)                │    ║
║  │  • Valida firma HMAC-SHA256                                 │    ║
║  │  • Verifica idempotencia (externalId único)                 │    ║
║  └──────────────────────────┬──────────────────────────────────┘    ║
║                             │                                        ║
║  ┌──────────────────────────▼──────────────────────────────────┐    ║
║  │  Event Handler                                               │    ║
║  │  • Mapea evento → asiento contable                          │    ║
║  │  • Aplica reglas SRI Ecuador (IVA, retenciones)             │    ║
║  │  • Valida cuadre débito = crédito                           │    ║
║  └──────────────────────────┬──────────────────────────────────┘    ║
║                             │                                        ║
║  ┌──────────────────────────▼──────────────────────────────────┐    ║
║  │  Journal Entry Service                                       │    ║
║  │  • Persiste asiento en PostgreSQL                           │    ║
║  │  • Incremento atómico del número de asiento                 │    ║
║  │  • Escribe en audit_log                                     │    ║
║  └──────────────────────────┬──────────────────────────────────┘    ║
║                             │                                        ║
║  ┌──────────────────────────▼──────────────────────────────────┐    ║
║  │  Webhook Dispatcher                                          │    ║
║  │  • Envía asiento al endpoint del cliente                    │    ║
║  │  • Reintentos: 3× con backoff (1s → 4s → 16s)             │    ║
║  │  • Persiste estado del webhook                              │    ║
║  └─────────────────────────────────────────────────────────────┘    ║
║                                                                      ║
║  ┌─────────────────────────────────────────────────────────────┐    ║
║  │  PostgreSQL (nuestra BD)                                     │    ║
║  │  companies │ journal_entries │ journal_entry_lines          │    ║
║  │  chart_of_accounts │ accounting_periods │ bank_accounts     │    ║
║  │  cost_centers │ budgets │ bank_statements │ advances        │    ║
║  │  petty_cash_funds │ fixed_assets │ audit_log               │    ║
║  └─────────────────────────────────────────────────────────────┘    ║
╚══════════════════════════════════════════════════╦═════════════════╝
                                                   ║ Webhook HTTPS POST
                                                   ║ X-Webhook-Signature
                                                   ▼
╔══════════════════════════════════════════════════════════════════════╗
║  BD POSTGRESQL DEL CLIENTE                                           ║
║                                                                      ║
║  accounting_journal_entries                                          ║
║  accounting_journal_entry_lines                                      ║
║  accounting_webhook_events                                           ║
╚══════════════════════════════════════════════════════════════════════╝
```

### Puente con el sistema SaasFacturacion existente (Firebase)

Para clientes que también usan el módulo de facturación de SaasFacturacion, el puente funciona así:

```
Cloud Function (trigger Firestore) → POST /api/v1/events/{tipo}
                                      con INTERNAL_API_TOKEN
```

El backend acepta eventos tanto de sistemas externos como del propio sistema Firebase. La lógica de generación de asientos es la misma.

---

## 3. Stack Tecnológico

| Capa | Tecnología | Justificación |
|---|---|---|
| **Framework** | NestJS (Node.js) | Estructura modular obligada desde el inicio. Guards integrados para auth. DI nativo para inyectar `companyId` en cada query. Ideal para lógica contable compleja. |
| **ORM** | Prisma | Schema-first con `schema.prisma` como fuente de verdad. Tipos TypeScript exactos. Raw SQL para queries complejas de reportes. |
| **Base de datos** | PostgreSQL 16 | `NUMERIC(15,2)` para exactitud monetaria. Row Level Security para multi-tenant. Window functions para reportes contables. |
| **Autenticación interna** | Firebase Admin SDK | Validación de JWT Firebase para clientes que usen nuestro frontend Angular. |
| **Autenticación externa** | API Key + HMAC-SHA256 | Para sistemas externos que no tienen Firebase. API Key identifica al tenant. HMAC garantiza integridad del payload. |
| **Validación** | class-validator + class-transformer | DTOs tipados con validación declarativa en cada endpoint. |
| **Lenguaje** | TypeScript (strict) | Consistencia con el frontend Angular y las Cloud Functions existentes. |
| **Testing** | Jest + Supertest | Unit tests para lógica contable, e2e para endpoints de eventos. |
| **Infra** | Cloud Run + Cloud SQL | Mismo ecosistema GCP que Firebase. Conexión privada vía Unix socket. |

---

## 4. Schema de Base de Datos

### Principios de diseño

- **`NUMERIC(15,2)`** en todos los campos monetarios. Nunca `FLOAT`.
- **`company_id TEXT`** en todas las tablas para Row Level Security.
- **Row Level Security (RLS)** activado como segunda capa de defensa.
- **UUID v4** como PK para evitar colisiones en entornos multi-tenant.
- **Particionado por año** en `audit_log` para rendimiento a largo plazo.

### Diagrama de relaciones

```
companies
    │
    ├── accounting_periods ────────────────────┐
    │       │                                   │
    │       └── journal_entries ─────── journal_entry_lines
    │               │
    │               └── (referencia a: invoices/purchases/retentions del sistema externo)
    │
    ├── chart_of_accounts
    ├── accounting_settings (1:1 con company)
    ├── cost_centers
    ├── bank_accounts
    │       └── bank_statements
    │               └── bank_statement_transactions
    ├── advances
    │       └── advance_applications
    ├── petty_cash_funds
    │       └── petty_cash_movements
    ├── fixed_assets
    │       └── fixed_asset_depreciation_log
    ├── budgets
    │       └── budget_lines
    ├── api_keys (por empresa, para autenticación externa)
    ├── webhook_endpoints (endpoint del cliente)
    ├── webhook_events (historial de envíos)
    └── audit_log (particionado por año)
```

### Tablas principales — DDL resumido

```sql
-- ─── EMPRESAS (tenants) ───────────────────────────────────────────────────────
CREATE TABLE companies (
  id                 TEXT PRIMARY KEY,           -- 'comp_' + nanoid
  name               TEXT NOT NULL,
  tax_id             TEXT NOT NULL,              -- RUC 13 dígitos
  taxpayer_type      TEXT NOT NULL               -- 'normal','especial','rise'
                     CHECK (taxpayer_type IN ('normal','especial','rise')),
  plan               TEXT NOT NULL DEFAULT 'basic',
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,
  fiscal_year_start  SMALLINT NOT NULL DEFAULT 1, -- mes de inicio (1=enero)
  timezone           TEXT NOT NULL DEFAULT 'America/Guayaquil',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── API KEYS (autenticación sistemas externos) ────────────────────────────────
CREATE TABLE api_keys (
  id            TEXT PRIMARY KEY,               -- 'ak_' + nanoid
  company_id    TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  key_prefix    TEXT NOT NULL,                  -- primeros 8 chars para mostrar en UI
  key_hash      TEXT NOT NULL,                  -- SHA-256 del key completo
  hmac_secret   TEXT NOT NULL,                  -- para verificar firma HMAC
  environment   TEXT NOT NULL DEFAULT 'production'
                CHECK (environment IN ('production','sandbox')),
  label         TEXT,                           -- "ERP principal", "Sistema de pruebas"
  ip_whitelist  TEXT[],                         -- null = sin restricción
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  last_used_at  TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_key_hash UNIQUE (key_hash)
);

-- ─── WEBHOOK ENDPOINTS (del cliente) ─────────────────────────────────────────
CREATE TABLE webhook_endpoints (
  id            TEXT PRIMARY KEY,
  company_id    TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  url           TEXT NOT NULL,
  secret        TEXT NOT NULL,                  -- para firmar el webhook saliente
  events        TEXT[] NOT NULL DEFAULT ARRAY['journal_entry.created'],
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── PLAN DE CUENTAS ─────────────────────────────────────────────────────────
CREATE TABLE chart_of_accounts (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id       TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code             TEXT NOT NULL,
  name             TEXT NOT NULL,
  type             TEXT NOT NULL
                   CHECK (type IN ('activo','pasivo','patrimonio','ingreso','costo','gasto','resultado')),
  nature           TEXT NOT NULL CHECK (nature IN ('deudora','acreedora')),
  level            SMALLINT NOT NULL,
  parent_code      TEXT,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  allows_movement  BOOLEAN NOT NULL DEFAULT FALSE,
  description      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_account_code UNIQUE (company_id, code)
);
CREATE INDEX idx_coa_company     ON chart_of_accounts(company_id);
CREATE INDEX idx_coa_parent      ON chart_of_accounts(company_id, parent_code);
CREATE INDEX idx_coa_movement    ON chart_of_accounts(company_id, allows_movement)
                                  WHERE allows_movement = TRUE;

-- ─── PERIODOS CONTABLES ───────────────────────────────────────────────────────
CREATE TABLE accounting_periods (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id     TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  year           SMALLINT NOT NULL,
  name           TEXT NOT NULL,
  start_date     DATE NOT NULL,
  end_date       DATE NOT NULL,
  status         TEXT NOT NULL DEFAULT 'open'
                 CHECK (status IN ('open','closed','locked')),
  closed_at      TIMESTAMPTZ,
  closed_by      TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_period_year UNIQUE (company_id, year)
);
CREATE INDEX idx_periods_status ON accounting_periods(company_id, status);

-- ─── ASIENTOS CONTABLES ───────────────────────────────────────────────────────
CREATE TABLE journal_entries (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  period_id       UUID NOT NULL REFERENCES accounting_periods(id),
  period_year     SMALLINT NOT NULL,
  number          INTEGER NOT NULL,             -- secuencial por empresa/periodo
  date            DATE NOT NULL,
  description     TEXT NOT NULL,
  type            TEXT NOT NULL
                  CHECK (type IN ('manual','automatic','opening','closing',
                                  'adjustment','depreciation','reversal')),
  status          TEXT NOT NULL DEFAULT 'posted'
                  CHECK (status IN ('draft','posted','cancelled')),
  -- Referencia al documento de origen (en sistema externo)
  external_id     TEXT,                         -- externalId del evento recibido
  reference       TEXT,                         -- número de serie del documento
  reference_id    TEXT,                         -- ID interno en el sistema externo
  reference_type  TEXT,                         -- 'invoice','purchase','retention',etc.
  -- Totales
  total_debit     NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_credit    NUMERIC(15,2) NOT NULL DEFAULT 0,
  is_balanced     BOOLEAN NOT NULL DEFAULT FALSE,
  -- Anulación
  cancelled_at    TIMESTAMPTZ,
  cancelled_by    TEXT,
  cancel_reason   TEXT,
  -- Auditoría
  created_by      TEXT NOT NULL,                -- userId o 'api:comp_xxx'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_entry_number UNIQUE (company_id, period_id, number)
);
CREATE INDEX idx_je_company_date   ON journal_entries(company_id, date);
CREATE INDEX idx_je_period         ON journal_entries(company_id, period_id);
CREATE INDEX idx_je_status         ON journal_entries(company_id, status);
CREATE INDEX idx_je_external_id    ON journal_entries(company_id, external_id)
                                   WHERE external_id IS NOT NULL;

-- ─── LÍNEAS DEL ASIENTO ───────────────────────────────────────────────────────
CREATE TABLE journal_entry_lines (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  journal_entry_id  UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  company_id        TEXT NOT NULL,              -- denormalizado para queries directas
  account_code      TEXT NOT NULL,
  account_name      TEXT NOT NULL,
  debit             NUMERIC(15,2) NOT NULL DEFAULT 0,
  credit            NUMERIC(15,2) NOT NULL DEFAULT 0,
  cost_center_id    UUID,
  cost_center_name  TEXT,
  description       TEXT,
  is_non_deductible BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order        SMALLINT NOT NULL DEFAULT 0
);
-- ÍNDICE CRÍTICO: sin este, libro mayor y balance de comprobación son lentos
CREATE INDEX idx_jel_account    ON journal_entry_lines(company_id, account_code);
CREATE INDEX idx_jel_entry      ON journal_entry_lines(journal_entry_id);

-- ─── CONFIGURACIÓN CONTABLE (mapeo de cuentas automáticas) ───────────────────
CREATE TABLE accounting_settings (
  company_id                TEXT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  -- Ventas
  sales_15                  TEXT NOT NULL DEFAULT '4.1.01.001',
  sales_5                   TEXT NOT NULL DEFAULT '4.1.01.004',
  sales_0                   TEXT NOT NULL DEFAULT '4.1.01.002',
  sales_exempt              TEXT NOT NULL DEFAULT '4.1.01.003',
  iva_collected             TEXT NOT NULL DEFAULT '2.1.04.001',
  -- Clientes
  accounts_receivable       TEXT NOT NULL DEFAULT '1.1.02.001',
  -- Compras
  inventory                 TEXT NOT NULL DEFAULT '1.1.03.001',
  cogs                      TEXT NOT NULL DEFAULT '5.1.01.001',
  iva_credit                TEXT NOT NULL DEFAULT '1.1.05.001',
  -- Proveedores
  accounts_payable          TEXT NOT NULL DEFAULT '2.1.01.001',
  -- Retenciones emitidas (agente retenedor)
  ret_ir_payable            TEXT NOT NULL DEFAULT '2.1.04.003',
  ret_iva_payable           TEXT NOT NULL DEFAULT '2.1.04.002',
  -- Retenciones recibidas (crédito tributario)
  credit_tax_ir             TEXT NOT NULL DEFAULT '1.1.05.002',
  credit_tax_iva            TEXT NOT NULL DEFAULT '1.1.05.003',
  -- Anticipos
  advances_from_customers   TEXT NOT NULL DEFAULT '2.1.04.008',
  advances_to_suppliers     TEXT NOT NULL DEFAULT '1.1.04.003',
  -- Otros
  depreciation_expense      TEXT NOT NULL DEFAULT '5.2.01.012',
  opening_balance_bridge    TEXT NOT NULL DEFAULT '3.3.01.001',
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── CONTADOR DE ASIENTOS (secuencia atómica por empresa/año) ─────────────────
CREATE TABLE journal_entry_counters (
  company_id  TEXT NOT NULL,
  period_year SMALLINT NOT NULL,
  last_number INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, period_year)
);

-- ─── CUENTAS BANCARIAS ────────────────────────────────────────────────────────
CREATE TABLE bank_accounts (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id           TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  bank_name            TEXT NOT NULL,
  account_number       TEXT NOT NULL,
  account_type         TEXT NOT NULL CHECK (account_type IN ('corriente','ahorros')),
  linked_gl_code       TEXT NOT NULL,
  linked_gl_name       TEXT NOT NULL,
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  opening_balance      NUMERIC(15,2),
  opening_balance_date DATE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_ba_company ON bank_accounts(company_id);

-- ─── WEBHOOK EVENTS (historial de envíos salientes) ──────────────────────────
CREATE TABLE webhook_events (
  id               TEXT PRIMARY KEY,
  company_id       TEXT NOT NULL,
  endpoint_id      TEXT NOT NULL REFERENCES webhook_endpoints(id),
  event_type       TEXT NOT NULL,
  payload          JSONB NOT NULL,
  journal_entry_id UUID REFERENCES journal_entries(id),
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','delivered','failed')),
  attempt_count    SMALLINT NOT NULL DEFAULT 0,
  last_attempt_at  TIMESTAMPTZ,
  next_attempt_at  TIMESTAMPTZ DEFAULT NOW(),
  http_status      SMALLINT,
  error_message    TEXT,
  delivered_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_we_status    ON webhook_events(status, next_attempt_at)
                               WHERE status IN ('pending','failed');
CREATE INDEX idx_we_company   ON webhook_events(company_id, created_at DESC);

-- ─── AUDIT LOG (append-only, particionado por año) ────────────────────────────
CREATE TABLE audit_log (
  id           UUID DEFAULT uuid_generate_v4(),
  company_id   TEXT NOT NULL,
  actor        TEXT NOT NULL,               -- userId o 'api:comp_xxx'
  action       TEXT NOT NULL,
  entity_type  TEXT NOT NULL,
  entity_id    TEXT NOT NULL,
  before_data  JSONB,
  after_data   JSONB,
  ip_address   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (created_at);

CREATE TABLE audit_log_2026 PARTITION OF audit_log
  FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');
CREATE TABLE audit_log_2027 PARTITION OF audit_log
  FOR VALUES FROM ('2027-01-01') TO ('2028-01-01');

CREATE INDEX idx_al_company ON audit_log(company_id, created_at DESC);
```

### Tablas de módulos adicionales (post-MVP)

Las siguientes tablas siguen el mismo patrón `company_id + UUID`:

| Tabla | Módulo | Fase |
|---|---|---|
| `cost_centers` | Centros de costo | Fase 3 |
| `budgets` + `budget_lines` | Presupuesto | Fase 4 |
| `bank_statements` + `bank_statement_transactions` | Conciliación bancaria | Fase 4 |
| `advances` + `advance_applications` | Anticipos | Fase 5 |
| `petty_cash_funds` + `petty_cash_movements` | Caja chica | Fase 5 |
| `fixed_assets` + `fixed_asset_depreciation_log` | Activos fijos | Fase 5 |

---

## 5. Contratos de la API — Eventos

### Cabeceras requeridas en todos los eventos

```http
POST /api/v1/events/{tipo}
Content-Type: application/json
X-Api-Key: sk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
X-Signature: sha256=<hmac_sha256_del_body>
```

### Campo universal: `externalId`

Presente en todos los eventos. Es el **ID único del documento en el sistema del cliente**. Si el mismo `externalId` llega dos veces, la API retorna el asiento ya creado con `HTTP 200` e `"idempotent": true` sin crear un duplicado.

Convención recomendada: `{TIPO}-{AÑO}-{NUMERO_SECUENCIAL}`

| Tipo de evento | Ejemplo de externalId |
|---|---|
| Factura de venta | `INV-2026-000087` |
| Pago recibido | `PAY-2026-000087` |
| Factura de compra | `PUR-2026-000023` |
| Pago a proveedor | `PMT-2026-000023` |
| Nota de crédito | `CN-2026-000012` |
| Nota de débito | `DN-2026-000005` |
| Retención emitida | `RET-2026-000031` |
| Retención recibida | `RETR-2026-000008` |

---

### Evento A — `POST /api/v1/events/invoice-issued`

Factura de venta emitida al cliente final.

**Cuándo disparar:** al confirmar/emitir la factura en el sistema externo. No en estado borrador.

**Payload:**
```json
{
  "externalId": "INV-2026-000087",
  "companyId": "comp_abc123",
  "date": "2026-08-15",
  "fiscalYear": "2026",
  "fullNumber": "001-001-000000087",
  "customerName": "SUPERMERCADO DEL VALLE CIA. LTDA.",
  "customerId": "cli_00234",
  "netAmount": 869.57,
  "vatAmount": 130.43,
  "total": 1000.00,
  "costCenterId": "cc_ventas",
  "costCenterName": "Ventas Quito",
  "vatSummary": [
    { "vatPct": 15, "taxableBase": 869.57, "vatAmount": 130.43 }
  ],
  "lines": [
    {
      "description": "Laptop HP EliteBook 840",
      "quantity": 2,
      "unitPrice": 450.00,
      "subtotal": 900.00,
      "vatPct": 15,
      "vatAmount": 135.00,
      "total": 1035.00,
      "averageCost": 320.00
    }
  ]
}
```

**Campos requeridos:**

| Campo | Tipo | Descripción |
|---|---|---|
| externalId | string | ID único de la factura |
| companyId | string | ID de empresa |
| date | string YYYY-MM-DD | Fecha de emisión |
| fiscalYear | string YYYY | Año fiscal |
| fullNumber | string | Serie: 001-001-000000001 |
| customerName | string | Razón social del cliente |
| netAmount | number | Base imponible total sin IVA |
| vatAmount | number | Total IVA |
| total | number | Debe ser exactamente `netAmount + vatAmount` |
| vatSummary[] | array | Al menos un elemento. Ver sub-campos. |

**vatSummary[] sub-campos:**

| Campo | Tipo | Descripción |
|---|---|---|
| vatPct | number | Tasa: `0`, `5`, `15`, `-1` (exento) |
| taxableBase | number | Base neta post-descuentos para esta tarifa |
| vatAmount | number | `taxableBase × vatPct / 100` |

**lines[] sub-campos (opcional, solo si hay inventario):**

| Campo | Tipo | Descripción |
|---|---|---|
| description | string | Nombre del producto |
| quantity | number | Cantidad |
| unitPrice | number | Precio unitario sin IVA |
| subtotal | number | `quantity × unitPrice` (antes de descuento) |
| vatPct | number | Tasa IVA de la línea |
| vatAmount | number | IVA de la línea |
| total | number | `subtotal + vatAmount` |
| **averageCost** | number (opc) | Si > 0, genera asiento COGS automático |

**Asiento generado:**
```
DÉBITO  1.1.02.001  Cuentas por Cobrar Clientes     $1,000.00
  CRÉDITO  4.1.01.001  Ventas 15% IVA               $  869.57
  CRÉDITO  2.1.04.001  IVA en Ventas                $  130.43

[Si averageCost enviado]
DÉBITO  5.1.01.001  Costo de Ventas                 $  640.00
  CRÉDITO  1.1.03.001  Inventario de Mercaderías    $  640.00
```

---

### Evento B — `POST /api/v1/events/invoice-payment-received`

Cobro de una factura de venta.

**Cuándo disparar:** cuando se registra el pago del cliente en el sistema externo.

**Payload:**
```json
{
  "externalId": "PAY-2026-000087",
  "companyId": "comp_abc123",
  "date": "2026-09-03",
  "fiscalYear": "2026",
  "invoiceExternalId": "INV-2026-000087",
  "invoiceFullNumber": "001-001-000000087",
  "customerName": "SUPERMERCADO DEL VALLE CIA. LTDA.",
  "bankAccountId": "ba_pichincha001",
  "amount": 1000.00
}
```

> **Importante:** `amount` puede ser menor que el total de la factura (pago parcial). Enviar un evento `B` por cada pago parcial.

**Asiento generado:**
```
DÉBITO  1.1.01.001  Banco Pichincha Cta Corriente    $1,000.00
  CRÉDITO  1.1.02.001  Cuentas por Cobrar Clientes   $1,000.00
```

---

### Evento C — `POST /api/v1/events/purchase-received`

Factura de compra recibida del proveedor.

**Cuándo disparar:** cuando la factura es procesada/aprobada en el sistema externo.

**Payload:**
```json
{
  "externalId": "PUR-2026-000023",
  "companyId": "comp_abc123",
  "date": "2026-08-10",
  "fiscalYear": "2026",
  "fullNumber": "001-001-000000156",
  "supplierName": "IMPORTADORA TECH S.A.",
  "supplierRuc": "1790456789001",
  "vatAmount": 195.00,
  "total": 1495.00,
  "lines": [
    {
      "description": "Laptop HP EliteBook 840",
      "qty": 4,
      "unitCost": 325.00,
      "subtotal": 1300.00,
      "vatPct": 15,
      "vatAmount": 195.00,
      "type": "product"
    }
  ]
}
```

**lines[] sub-campos:**

| Campo | Tipo | Descripción |
|---|---|---|
| description | string | Descripción del bien/servicio |
| qty | number | Cantidad |
| unitCost | number | Costo unitario sin IVA |
| subtotal | number | `qty × unitCost` |
| vatPct | number | Tasa IVA |
| vatAmount | number | IVA de la línea |
| **type** | string | `"product"` → débita Inventario / `"service"` → no mueve inventario |
| trackStock | boolean | Alternativa a `type`. `false` = no mueve inventario |

**Asiento generado:**
```
DÉBITO  1.1.03.001  Inventario de Mercaderías           $1,300.00
DÉBITO  1.1.05.001  IVA en Compras (Crédito Tributario) $  195.00
  CRÉDITO  2.1.01.001  Cuentas por Pagar Proveedores    $1,495.00
```

---

### Evento D — `POST /api/v1/events/purchase-payment-made`

Pago a un proveedor.

**Cuándo disparar:** cuando se registra el pago en el sistema externo.

> **Importante:** Si se emitió una retención (Evento G), enviar primero el Evento G y luego el Evento D. El `amount` del Evento D debe ser el **monto neto** (total factura − retenciones).

**Payload:**
```json
{
  "externalId": "PMT-2026-000023",
  "companyId": "comp_abc123",
  "date": "2026-08-25",
  "fiscalYear": "2026",
  "purchaseExternalId": "PUR-2026-000023",
  "purchaseFullNumber": "001-001-000000156",
  "supplierName": "IMPORTADORA TECH S.A.",
  "bankAccountId": "ba_pichincha001",
  "amount": 1410.50
}
```

**Asiento generado:**
```
DÉBITO  2.1.01.001  Cuentas por Pagar Proveedores   $1,410.50
  CRÉDITO  1.1.01.001  Banco Pichincha Cta Corriente $1,410.50
```

---

### Evento E — `POST /api/v1/events/credit-note-issued`

Nota de crédito emitida al cliente final.

**Payload:**
```json
{
  "externalId": "CN-2026-000012",
  "companyId": "comp_abc123",
  "date": "2026-08-20",
  "fiscalYear": "2026",
  "fullNumber": "001-001-000000012",
  "customerName": "SUPERMERCADO DEL VALLE CIA. LTDA.",
  "rectifiedInvoiceNumber": "001-001-000000087",
  "creditNoteMotivo": "DEVOLUCIÓN PARCIAL PRODUCTOS DEFECTUOSOS",
  "subtotal": 434.78,
  "vatAmount": 65.22,
  "total": 500.00,
  "vatSummary": [
    { "vatPct": 15, "taxableBase": 434.78, "vatAmount": 65.22 }
  ],
  "lines": [
    {
      "description": "Laptop HP EliteBook 840",
      "quantity": 1,
      "unitPrice": 450.00,
      "subtotal": 450.00,
      "vatPct": 15,
      "vatAmount": 67.50,
      "total": 517.50,
      "averageCost": 320.00
    }
  ]
}
```

**Asiento generado (inverso al de la factura):**
```
DÉBITO  4.1.01.001  Ventas 15% IVA       $434.78
DÉBITO  2.1.04.001  IVA en Ventas        $ 65.22
  CRÉDITO  1.1.02.001  CxC Clientes      $500.00

[Si averageCost > 0: re-ingreso de inventario]
DÉBITO  1.1.03.001  Inventario           $320.00
  CRÉDITO  5.1.01.001  Costo de Ventas   $320.00
```

---

### Evento F — `POST /api/v1/events/debit-note-issued`

Nota de débito emitida al cliente final.

**Payload:**
```json
{
  "externalId": "DN-2026-000005",
  "companyId": "comp_abc123",
  "date": "2026-08-22",
  "fiscalYear": "2026",
  "fullNumber": "001-001-000000005",
  "customerName": "SUPERMERCADO DEL VALLE CIA. LTDA.",
  "originalInvoiceNumber": "001-001-000000087",
  "totalSinImpuestos": 86.96,
  "vatPct": 15,
  "vatAmount": 13.04,
  "total": 100.00
}
```

**Asiento generado:**
```
DÉBITO  1.1.02.001  CxC Clientes         $100.00
  CRÉDITO  4.1.01.001  Ventas 15% IVA    $ 86.96
  CRÉDITO  2.1.04.001  IVA en Ventas     $ 13.04
```

---

### Evento G — `POST /api/v1/events/retention-issued`

El cliente actúa como **agente de retención** y retiene a su proveedor.

**Cuándo disparar:** al emitir el comprobante de retención. Siempre ANTES del pago (Evento D).

**Payload:**
```json
{
  "externalId": "RET-2026-000031",
  "companyId": "comp_abc123",
  "date": "2026-08-25",
  "fiscalYear": "2026",
  "fullNumber": "001-001-000000031",
  "supplierName": "IMPORTADORA TECH S.A.",
  "supplierTaxId": "1790456789001",
  "supportDocNumber": "001-001-000000156",
  "supportDocDate": "2026-08-10",
  "supportDocTotal": 1495.00,
  "supportDocCodSust": "01",
  "totalRetained": 84.50,
  "taxes": [
    {
      "id": "line_001",
      "taxCode": "1",
      "taxCodeName": "IR",
      "pctCode": "310",
      "pctName": "Transferencia de bienes muebles corporales",
      "rate": 2,
      "taxableBase": 1300.00,
      "retainedAmount": 26.00
    },
    {
      "id": "line_002",
      "taxCode": "2",
      "taxCodeName": "IVA",
      "pctCode": "3",
      "pctName": "Retención IVA 30% — bienes",
      "rate": 30,
      "taxableBase": 195.00,
      "retainedAmount": 58.50
    }
  ]
}
```

**Códigos de sustento (`supportDocCodSust`):**

| Código | Concepto |
|---|---|
| 01 | Compras |
| 02 | Servicios |
| 03 | Honorarios Profesionales |
| 04 | Liquidación de Compras |
| 07 | Arrendamiento bienes inmuebles |

**Tasas IR más comunes (`pctCode`):**

| Código | Concepto | Tasa |
|---|---|---|
| 303 | Honorarios profesionales | 10% |
| 307 | Servicios (mano de obra) | 3% |
| 310 | Transferencia bienes muebles | 2% |
| 319 | Arrendamiento bienes inmuebles | 10% |

**Tasas IVA más comunes:**

| Código | Concepto | Tasa |
|---|---|---|
| 3 | Retención IVA 30% — bienes | 30% |
| 4 | Retención IVA 70% — servicios | 70% |
| 5 | Retención IVA 100% — sector público | 100% |

**Asiento generado:**
```
DÉBITO  2.1.01.001  CxP Proveedores             $84.50
  CRÉDITO  2.1.04.003  Retenciones IR por Pagar  $26.00
  CRÉDITO  2.1.04.002  Retenciones IVA por Pagar $58.50
```

---

### Evento H — `POST /api/v1/events/retention-received`

El cliente de nuestro cliente le retiene. Genera **crédito tributario a favor** de la empresa.

**Payload:**
```json
{
  "externalId": "RETR-2026-000008",
  "companyId": "comp_abc123",
  "date": "2026-08-17",
  "fiscalYear": "2026",
  "retentionFullNumber": "001-001-000000999",
  "customerName": "CORPORACIÓN FAVORITA C.A.",
  "supportInvoiceNumber": "001-001-000000087",
  "totalRetained": 56.52,
  "taxes": [
    {
      "id": "line_001",
      "taxCode": "1",
      "taxCodeName": "IR",
      "pctCode": "310",
      "pctName": "Transferencia de bienes muebles corporales",
      "rate": 2,
      "taxableBase": 869.57,
      "retainedAmount": 17.39
    },
    {
      "id": "line_002",
      "taxCode": "2",
      "taxCodeName": "IVA",
      "pctCode": "3",
      "pctName": "Retención IVA 30% — bienes",
      "rate": 30,
      "taxableBase": 130.43,
      "retainedAmount": 39.13
    }
  ]
}
```

**Asiento generado:**
```
DÉBITO  1.1.05.002  Crédito Tributario IR   $17.39
DÉBITO  1.1.05.003  Crédito Tributario IVA  $39.13
  CRÉDITO  1.1.02.001  CxC Clientes         $56.52
```

---

### Respuesta estándar de la API

**Éxito (`HTTP 201` o `HTTP 200` si idempotente):**
```json
{
  "success": true,
  "journalEntryId": "je_8fKp2mNqRt",
  "entryNumber": 42,
  "totalDebit": 1000.00,
  "totalCredit": 1000.00,
  "isBalanced": true,
  "idempotent": false,
  "lines": [...]
}
```

**Error (`HTTP 4xx`):**
```json
{
  "success": false,
  "error": "amounts_mismatch",
  "message": "netAmount + vatAmount debe ser igual a total",
  "errors": [
    {
      "field": "total",
      "message": "Esperado: 1000.00, recibido: 1020.00"
    }
  ],
  "requestId": "req_7xYz8wVu"
}
```

### Tabla de errores

| HTTP | Código | Causa | Acción |
|---|---|---|---|
| 400 | `invalid_payload` | Campo requerido faltante o tipo incorrecto | Ver `errors[]` |
| 400 | `amounts_mismatch` | `netAmount + vatAmount ≠ total` | Recalcular montos |
| 400 | `vat_on_gross` | IVA calculado sobre bruto, no sobre base neta | `IVA = baseNeta × tasa` |
| 400 | `invalid_ruc` | RUC no pasa validación | Verificar dígito verificador |
| 401 | `invalid_api_key` | API Key inválida o expirada | Solicitar nueva key |
| 401 | `invalid_signature` | HMAC no coincide | Verificar cálculo de firma |
| 403 | `ip_not_whitelisted` | IP no permitida | Agregar IP en configuración |
| 422 | `no_open_period` | No hay periodo abierto para la fecha | Abrir periodo contable |
| 429 | `rate_limit_exceeded` | Límite de rate superado | Esperar `Retry-After` |
| 500 | `internal_error` | Error interno | Reintentar con backoff |

---

## 6. Flujo de Replicación al Cliente

### Opción recomendada: Webhooks

```
NUESTRA API                         CLIENTE
     │  [asiento generado OK]            │
     │                                    │
     │  POST /webhook/accounting          │
     │  X-Webhook-Signature: sha256=xxx   │
     │  { "eventType": "journal_entry.created", │
     │    "data": { journalEntry {...} } }│
     │──────────────────────────────────>│
     │                                    │ INSERT INTO accounting_journal_entries
     │         HTTP 200 OK                │ INSERT INTO accounting_journal_entry_lines
     │<──────────────────────────────────│
```

**Payload del webhook:**
```json
{
  "webhookEventId": "whe_4jKs5qQuXy",
  "eventType": "journal_entry.created",
  "companyId": "comp_abc123",
  "timestamp": "2026-08-15T14:32:07.123Z",
  "data": {
    "journalEntry": {
      "id": "je_8fKp2mNqRt",
      "externalId": "INV-2026-000087",
      "entryNumber": 42,
      "date": "2026-08-15",
      "description": "Factura de Venta 001-001-000000087 — SUPERMERCADO DEL VALLE CIA. LTDA.",
      "periodYear": 2026,
      "type": "automatic",
      "status": "posted",
      "reference": "001-001-000000087",
      "referenceType": "invoice",
      "totalDebit": 1000.00,
      "totalCredit": 1000.00,
      "isBalanced": true,
      "createdAt": "2026-08-15T14:32:07.123Z",
      "lines": [
        {
          "id": "jel_001",
          "accountCode": "1.1.02.001",
          "accountName": "Cuentas por Cobrar Clientes",
          "debit": 1000.00,
          "credit": 0
        },
        {
          "id": "jel_002",
          "accountCode": "4.1.01.001",
          "accountName": "Ventas 15% IVA",
          "debit": 0,
          "credit": 869.57
        },
        {
          "id": "jel_003",
          "accountCode": "2.1.04.001",
          "accountName": "IVA en Ventas",
          "debit": 0,
          "credit": 130.43
        }
      ]
    }
  }
}
```

### Opción de respaldo: Polling

Cuando el webhook falla, el cliente puede sincronizar manualmente:

```
GET /api/v1/companies/{id}/journal-entries?since=2026-08-15T00:00:00Z&limit=100
GET /api/v1/companies/{id}/journal-entries?cursor=<nextCursor>&limit=100
```

### Tablas PostgreSQL en la BD del cliente

```sql
CREATE TABLE accounting_journal_entries (
    id               VARCHAR(50)   PRIMARY KEY,   -- nuestro ID (je_xxx)
    external_id      VARCHAR(255)  NOT NULL,       -- ID del sistema del cliente
    company_id       VARCHAR(50)   NOT NULL,
    entry_number     INTEGER       NOT NULL,
    entry_date       DATE          NOT NULL,
    description      TEXT          NOT NULL,
    period_year      SMALLINT      NOT NULL,
    entry_type       VARCHAR(20)   NOT NULL,       -- 'automatic','manual', etc.
    status           VARCHAR(20)   NOT NULL,       -- 'posted','cancelled'
    reference        VARCHAR(100),                 -- número de serie del documento
    reference_type   VARCHAR(50),                  -- 'invoice','purchase','retention'
    total_debit      NUMERIC(15,2) NOT NULL,
    total_credit     NUMERIC(15,2) NOT NULL,
    is_balanced      BOOLEAN       NOT NULL,
    received_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, external_id)
);

CREATE TABLE accounting_journal_entry_lines (
    id               VARCHAR(50)   PRIMARY KEY,
    journal_entry_id VARCHAR(50)   NOT NULL
                     REFERENCES accounting_journal_entries(id) ON DELETE CASCADE,
    account_code     VARCHAR(30)   NOT NULL,
    account_name     VARCHAR(200)  NOT NULL,
    debit            NUMERIC(15,2) NOT NULL DEFAULT 0,
    credit           NUMERIC(15,2) NOT NULL DEFAULT 0,
    cost_center_id   VARCHAR(50),
    cost_center_name VARCHAR(100),
    description      TEXT
);

CREATE TABLE accounting_webhook_events (
    id               VARCHAR(100)  PRIMARY KEY,
    company_id       VARCHAR(50)   NOT NULL,
    event_type       VARCHAR(100)  NOT NULL,
    payload          JSONB         NOT NULL,
    journal_entry_id VARCHAR(50),
    status           VARCHAR(20)   NOT NULL DEFAULT 'pending',
    received_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    processed_at     TIMESTAMPTZ,
    error_message    TEXT,
    retry_count      SMALLINT      DEFAULT 0
);
```

---

## 7. Seguridad

### Autenticación de sistemas externos

```
1. API Key en header: X-Api-Key: sk_live_xxxxxxxx
   → Identifica la empresa (tenant). NO incluir en la URL.

2. Firma HMAC-SHA256: X-Signature: sha256=<hex>
   → Garantiza integridad del payload.
```

**Cálculo de la firma (Node.js):**
```javascript
const crypto = require('crypto');

const signature = 'sha256=' + crypto
  .createHmac('sha256', hmacSecret)
  .update(rawBodyString)  // body exactamente como se va a enviar
  .digest('hex');
```

**Verificación del webhook saliente (en el servidor del cliente):**
```javascript
const expectedSig = 'sha256=' + crypto
  .createHmac('sha256', webhookSecret)
  .update(rawBodyString)
  .digest('hex');

if (expectedSig !== req.headers['x-webhook-signature']) {
  return res.status(401).send('Invalid signature');
}
```

### Rate Limiting

| Nivel | Límite | Ventana |
|---|---|---|
| Por empresa | 100 requests | por minuto |
| Por empresa | 5,000 requests | por hora |

Headers de respuesta: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

---

## 8. Fases de Implementación

### Fase 0 — Scaffolding del Proyecto
**Duración estimada:** 3-5 días

**Objetivo:** Proyecto NestJS funcional, conectado a PostgreSQL, con autenticación y estructura base.

**Tareas:**
- [ ] Crear repositorio `accounting-api`
- [ ] Configurar NestJS con TypeScript strict
- [ ] Instalar y configurar Prisma + conexión a PostgreSQL
- [ ] Implementar `FirebaseAuthGuard` (para clientes Angular) con Firebase Admin SDK
- [ ] Implementar `ApiKeyGuard` + `HmacGuard` (para sistemas externos)
- [ ] Middleware `CompanyContextInterceptor` que inyecta `companyId` en AsyncLocalStorage
- [ ] Decoradores `@CurrentUser()` y `@Roles()`
- [ ] Filtro global de excepciones (`HttpExceptionFilter`)
- [ ] Health check endpoint `GET /health`
- [ ] Configurar CI/CD (GitHub Actions → Cloud Run)
- [ ] Variables de entorno y configuración de ambientes (sandbox / production)

**Criterio de aceptación:** `POST /health` retorna `200 OK` desde Cloud Run.

---

### Fase 1 — Schema y Seed de Base de Datos
**Duración estimada:** 2-3 días

**Objetivo:** Todas las tablas creadas con migraciones Prisma. Plan de cuentas Ecuador sembrado.

**Tareas:**
- [ ] Crear migración Prisma con todas las tablas del MVP:
  - `companies`, `api_keys`, `webhook_endpoints`, `webhook_events`
  - `chart_of_accounts`, `accounting_periods`, `journal_entry_counters`
  - `journal_entries`, `journal_entry_lines`
  - `accounting_settings`, `bank_accounts`
  - `audit_log` (con particiones 2026, 2027)
- [ ] Activar Row Level Security en tablas con `company_id`
- [ ] Implementar seed del plan de cuentas Ecuador estándar (Superintendencia de Compañías)
- [ ] Implementar seed de `accounting_settings` con mapeo de cuentas por defecto
- [ ] Script de verificación de integridad del seed

**Criterio de aceptación:** `prisma migrate deploy` corre sin errores. Seed instala 200+ cuentas con jerarquía correcta.

---

### Fase 2 — Gestión de Empresas y Configuración
**Duración estimada:** 3-4 días

**Objetivo:** Endpoints para registrar empresas, gestionar API Keys, configurar mapeo de cuentas y registrar webhook.

**Endpoints a implementar:**

| Método | Path | Descripción |
|---|---|---|
| POST | `/api/v1/companies` | Registrar empresa (+ seed CoA opcional) |
| GET | `/api/v1/companies/{id}` | Obtener datos de la empresa |
| POST | `/api/v1/companies/{id}/api-keys` | Generar API Key |
| DELETE | `/api/v1/companies/{id}/api-keys/{keyId}` | Revocar API Key |
| POST | `/api/v1/companies/{id}/accounting-periods` | Abrir periodo contable |
| GET | `/api/v1/companies/{id}/accounting-periods` | Listar periodos |
| PUT | `/api/v1/companies/{id}/account-mapping` | Configurar mapeo de cuentas |
| GET | `/api/v1/companies/{id}/account-mapping` | Ver mapeo actual |
| POST | `/api/v1/companies/{id}/bank-accounts` | Registrar cuenta bancaria |
| GET | `/api/v1/companies/{id}/bank-accounts` | Listar cuentas bancarias |
| POST | `/api/v1/companies/{id}/webhook` | Registrar endpoint de webhook |
| PUT | `/api/v1/companies/{id}/webhook` | Actualizar webhook |

**Criterio de aceptación:** Un sistema externo puede completar el setup completo (empresa + periodo + mapeo + banco + webhook) antes de enviar el primer evento.

---

### Fase 3 — Motor de Eventos (Core del Sistema)
**Duración estimada:** 7-10 días

**Objetivo:** Los 8 eventos procesan y generan asientos contables correctos.

**Tareas por evento:**

| Evento | Endpoint | Asiento generado |
|---|---|---|
| A — Factura venta | `POST /events/invoice-issued` | CxC / Ventas + IVA cobrado [+ COGS opcional] |
| B — Cobro factura | `POST /events/invoice-payment-received` | Banco / CxC |
| C — Compra recibida | `POST /events/purchase-received` | Inventario + IVA pagado / CxP |
| D — Pago compra | `POST /events/purchase-payment-made` | CxP / Banco |
| E — Nota de crédito | `POST /events/credit-note-issued` | Reverso de ventas [+ re-ingreso inventario] |
| F — Nota de débito | `POST /events/debit-note-issued` | CxC / Ventas + IVA cobrado |
| G — Retención emitida | `POST /events/retention-issued` | CxP / Ret.IR por Pagar + Ret.IVA por Pagar |
| H — Retención recibida | `POST /events/retention-received` | Crédito Tributario IR + IVA / CxC |

**Servicios internos a implementar:**
- `JournalEntryService.create()` — valida balance, numera y persiste el asiento
- `AccountMappingService.resolve()` — resuelve códigos de cuentas desde el mapeo de empresa
- `IdempotencyService.checkAndStore()` — evita duplicados por `externalId`
- `PeriodValidationService.assertOpen()` — verifica que la fecha cae en un periodo abierto

**Función crítica — validación de balance:**
```typescript
function validateBalance(lines: JournalLine[]): void {
  const totalDebit  = round2(lines.reduce((s, l) => s + (l.debit  ?? 0), 0));
  const totalCredit = round2(lines.reduce((s, l) => s + (l.credit ?? 0), 0));
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new BadRequestException(
      `Asiento descuadrado: Debe=${totalDebit}, Haber=${totalCredit}`
    );
  }
}
```

**Criterio de aceptación:** Cada evento genera el asiento correcto. `totalDebit === totalCredit` en todos los casos. Reenviar el mismo `externalId` retorna `idempotent: true` sin duplicar.

---

### Fase 4 — Webhooks y Replicación
**Duración estimada:** 4-5 días

**Objetivo:** Cada asiento generado se envía automáticamente al endpoint del cliente.

**Tareas:**
- [ ] `WebhookDispatcher` — envía POST al endpoint del cliente con payload firmado
- [ ] Reintento automático: 3 intentos con backoff exponencial (1s, 4s, 16s)
- [ ] Persistencia del estado del webhook (`pending → delivered / failed`)
- [ ] Worker de reintentos (Cloud Scheduler cada 5 minutos para webhooks `failed`)
- [ ] `GET /api/v1/companies/{id}/webhook-events` — historial de webhooks
- [ ] `POST /api/v1/companies/{id}/webhook-events/{id}/retry` — reintento manual
- [ ] Endpoint de polling `GET /api/v1/companies/{id}/journal-entries?since=...` como mecanismo de respaldo

**Criterio de aceptación:** Si el endpoint del cliente está caído, los webhooks quedan en estado `failed` y se reintentan automáticamente. El cliente puede sincronizar vía polling en cualquier momento.

---

### Fase 5 — Endpoints de Consulta Contable
**Duración estimada:** 5-7 días

**Objetivo:** El cliente puede consultar todos los reportes contables desde la API (sin necesidad de instalar el frontend Angular).

**Endpoints a implementar:**

| Método | Path | Descripción |
|---|---|---|
| GET | `/api/v1/accounting/{companyId}/accounts` | Plan de cuentas |
| POST | `/api/v1/accounting/{companyId}/accounts` | Crear cuenta manual |
| GET | `/api/v1/accounting/{companyId}/entries` | Libro diario paginado |
| GET | `/api/v1/accounting/{companyId}/entries/{id}` | Detalle de asiento |
| POST | `/api/v1/accounting/{companyId}/entries` | Asiento manual |
| POST | `/api/v1/accounting/{companyId}/entries/{id}/cancel` | Anular asiento |
| GET | `/api/v1/accounting/{companyId}/reports/trial-balance` | Balance de comprobación |
| GET | `/api/v1/accounting/{companyId}/reports/general-ledger` | Libro mayor por cuenta |
| GET | `/api/v1/accounting/{companyId}/reports/income-statement` | Estado de resultados |
| GET | `/api/v1/accounting/{companyId}/reports/balance-sheet` | Balance general |
| GET | `/api/v1/accounting/{companyId}/reports/cash-flow` | Flujo de efectivo |
| POST | `/api/v1/accounting/{companyId}/reports/export` | Exportar a PDF/Excel |

**Query SQL crítica — Balance de Comprobación:**
```sql
SELECT
  jel.account_code,
  jel.account_name,
  coa.type         AS account_type,
  coa.nature,
  SUM(jel.debit)   AS sum_debit,
  SUM(jel.credit)  AS sum_credit,
  CASE coa.nature
    WHEN 'deudora'   THEN SUM(jel.debit) - SUM(jel.credit)
    WHEN 'acreedora' THEN SUM(jel.credit) - SUM(jel.debit)
  END AS balance
FROM journal_entry_lines jel
JOIN journal_entries je ON je.id = jel.journal_entry_id
LEFT JOIN chart_of_accounts coa
       ON coa.company_id = jel.company_id AND coa.code = jel.account_code
WHERE jel.company_id = $1
  AND je.period_id   = $2
  AND je.status      = 'posted'
GROUP BY jel.account_code, jel.account_name, coa.type, coa.nature
ORDER BY jel.account_code;
```

---

### Fase 6 — Periodos Contables y Cierre
**Duración estimada:** 4-5 días

**Objetivo:** Gestión completa del ciclo contable anual.

**Endpoints:**

| Método | Path | Descripción |
|---|---|---|
| POST | `/api/v1/accounting/{id}/periods/{periodId}/close` | Cierre del ejercicio |
| POST | `/api/v1/accounting/{id}/periods/{periodId}/lock` | Bloquear periodo |
| POST | `/api/v1/accounting/{id}/periods/{periodId}/generate-opening-entry` | Asiento de apertura |

**Lógica de cierre de ejercicio:**
1. Verificar que no hay asientos en `draft`
2. Calcular resultado del ejercicio (Ingresos − Costos − Gastos)
3. Generar asiento de cierre: cierra todas las cuentas nominales a `Resultado del Ejercicio`
4. Cambiar estado del periodo a `closed`
5. El asiento de apertura del siguiente periodo mueve el resultado a `Utilidades Retenidas`

---

### Fase 7 — Módulos Adicionales (post-MVP)
**Duración estimada:** 10-15 días

**Objetivo:** Completar el módulo contable con funcionalidades avanzadas.

**7a — Centros de Costo:**
- CRUD de centros de costo
- Filtrar reportes por centro de costo

**7b — Presupuesto:**
- CRUD de presupuesto por periodo
- Reporte Presupuesto vs Real

**7c — Conciliación Bancaria:**
- Importar extractos bancarios (CSV/JSON)
- Matching automático de transacciones con asientos GL
- Marcar extracto como conciliado

**7d — Anticipos:**
- Registrar anticipos de clientes/proveedores
- Aplicar anticipos contra documentos futuros

**7e — Caja Chica:**
- Fondos de caja chica
- Registro de gastos
- Reposición con generación de asiento

**7f — Activos Fijos:**
- Registro de activos fijos
- Depreciación automática (línea recta / saldo decreciente)
- Programar Cloud Scheduler para depreciación mensual automática

---

### Fase 8 — Formularios SRI desde PostgreSQL
**Duración estimada:** 5-7 días

**Objetivo:** Calcular los formularios de declaración tributaria directamente desde los asientos.

| Formulario | Endpoint | Fuente de datos |
|---|---|---|
| Formulario 104 (IVA mensual) | `GET /sri/form-104?year=2026&month=08` | `journal_entry_lines` donde `account_code` es IVA cobrado/pagado |
| Formulario 101 (IR anual) | `GET /sri/form-101?year=2026` | Agrega `journal_entry_lines` por tipo de cuenta |
| Formulario 103 (retenciones) | `GET /sri/form-103?year=2026&month=08` | Asientos tipo `retention_issued` |
| ATS (Anexo Transaccional) | `POST /sri/ats` | Requiere datos de documentos comerciales (ver nota) |

> **Nota ATS:** El ATS requiere datos de facturas, compras y retenciones que el sistema externo tiene en su propio sistema. Dos opciones: (1) El cliente envía los documentos completos en el body del request `POST /sri/ats`. (2) Se implementa un endpoint de ingesta de documentos comerciales que los almacena en la BD para luego generar el ATS. La segunda opción es la correcta a largo plazo.

---

### Fase 9 — Auditoría y Seguridad Avanzada
**Duración estimada:** 3-4 días

**Objetivo:** Trazabilidad completa de cambios y seguridad de producción.

- [ ] Completar escritura en `audit_log` en cada operación de escritura
- [ ] `GET /api/v1/accounting/{id}/audit-log` con filtros
- [ ] Rotación de API Keys sin downtime (ventana de 24h con dos keys activas)
- [ ] Whitelist de IPs por empresa
- [ ] Alertas automáticas por uso anómalo (Cloud Monitoring)
- [ ] Análisis de seguridad (OWASP Top 10)

---

## 9. Estructura de Carpetas

```
accounting-api/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed/
│       ├── ecuador-chart-of-accounts.ts    # Plan de cuentas Ecuador estándar
│       └── default-account-mapping.ts
│
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   │
│   ├── common/
│   │   ├── guards/
│   │   │   ├── firebase-auth.guard.ts      # JWT Firebase → { uid, companyId, role }
│   │   │   ├── api-key.guard.ts            # API Key → companyId
│   │   │   └── hmac.guard.ts               # Valida X-Signature
│   │   ├── decorators/
│   │   │   ├── current-user.decorator.ts
│   │   │   └── roles.decorator.ts
│   │   ├── interceptors/
│   │   │   └── company-context.interceptor.ts  # AsyncLocalStorage
│   │   ├── filters/
│   │   │   └── http-exception.filter.ts
│   │   ├── pipes/
│   │   │   └── validation.pipe.ts
│   │   └── utils/
│   │       ├── round2.ts                   # Redondeo a 2 decimales para contabilidad
│   │       └── ruc-validator.ts            # Validación RUC Ecuador (módulo 11/10)
│   │
│   ├── database/
│   │   ├── database.module.ts
│   │   └── prisma.service.ts
│   │
│   ├── modules/
│   │   │
│   │   ├── companies/                      # Gestión de tenants
│   │   │   ├── companies.module.ts
│   │   │   ├── companies.controller.ts
│   │   │   ├── companies.service.ts
│   │   │   └── dto/
│   │   │
│   │   ├── api-keys/                       # Autenticación externa
│   │   │   ├── api-keys.module.ts
│   │   │   ├── api-keys.service.ts
│   │   │   └── dto/
│   │   │
│   │   ├── webhooks/                       # Dispatcher y gestión de webhooks
│   │   │   ├── webhooks.module.ts
│   │   │   ├── webhook-dispatcher.service.ts
│   │   │   └── dto/
│   │   │
│   │   ├── events/                         # Motor de eventos — el core del sistema
│   │   │   ├── events.module.ts
│   │   │   ├── events.controller.ts        # 8 endpoints POST /events/*
│   │   │   ├── handlers/
│   │   │   │   ├── invoice-issued.handler.ts
│   │   │   │   ├── invoice-payment-received.handler.ts
│   │   │   │   ├── purchase-received.handler.ts
│   │   │   │   ├── purchase-payment-made.handler.ts
│   │   │   │   ├── credit-note-issued.handler.ts
│   │   │   │   ├── debit-note-issued.handler.ts
│   │   │   │   ├── retention-issued.handler.ts
│   │   │   │   └── retention-received.handler.ts
│   │   │   └── dto/
│   │   │       ├── invoice-issued.dto.ts
│   │   │       ├── purchase-received.dto.ts
│   │   │       └── ... (un dto por evento)
│   │   │
│   │   ├── journal-entries/                # Asientos contables
│   │   │   ├── journal-entries.module.ts
│   │   │   ├── journal-entries.controller.ts
│   │   │   ├── journal-entries.service.ts  # create, cancel, post, reverse
│   │   │   ├── journal-entries.repository.ts  # SQL crudo para reportes
│   │   │   └── dto/
│   │   │
│   │   ├── account-mapping/               # Resolución de cuentas automáticas
│   │   │   ├── account-mapping.module.ts
│   │   │   └── account-mapping.service.ts  # resolve('accountsReceivable', companyId)
│   │   │
│   │   ├── accounting-periods/
│   │   │   ├── accounting-periods.module.ts
│   │   │   ├── accounting-periods.controller.ts
│   │   │   └── accounting-periods.service.ts  # create, close, lock, generateOpening
│   │   │
│   │   ├── chart-of-accounts/
│   │   │   ├── chart-of-accounts.module.ts
│   │   │   ├── chart-of-accounts.controller.ts
│   │   │   └── chart-of-accounts.service.ts
│   │   │
│   │   ├── bank-accounts/
│   │   │
│   │   ├── reports/                        # Reportes contables (SQL puro, no ORM)
│   │   │   ├── reports.module.ts
│   │   │   ├── reports.controller.ts
│   │   │   └── services/
│   │   │       ├── trial-balance.service.ts
│   │   │       ├── general-ledger.service.ts
│   │   │       ├── income-statement.service.ts
│   │   │       ├── balance-sheet.service.ts
│   │   │       └── cash-flow.service.ts
│   │   │
│   │   └── sri-forms/                      # Formularios SRI (Fase 8)
│   │       ├── sri-forms.module.ts
│   │       ├── sri-forms.controller.ts
│   │       └── services/
│   │           ├── form-104.service.ts
│   │           ├── form-103.service.ts
│   │           └── form-101.service.ts
│   │
│   └── health/
│       └── health.controller.ts
│
├── test/
│   ├── e2e/
│   │   ├── events.e2e-spec.ts              # Test de los 8 eventos con BD real
│   │   └── reports.e2e-spec.ts
│   └── unit/
│       ├── account-mapping.service.spec.ts
│       └── journal-entry.service.spec.ts
│
├── .env.example
├── Dockerfile
└── docker-compose.yml                      # Para desarrollo local con PostgreSQL
```

---

## 10. Variables de Entorno

```bash
# Aplicación
NODE_ENV=production
PORT=8080

# Base de datos
DATABASE_URL="postgresql://user:password@/dbname?host=/cloudsql/project:region:instance"
# Desarrollo local:
# DATABASE_URL="postgresql://postgres:postgres@localhost:5432/accounting_db"

# Firebase Admin SDK
GOOGLE_APPLICATION_CREDENTIALS="/app/service-account.json"
# En Cloud Run con Workload Identity no se necesita el JSON

# Seguridad
INTERNAL_API_TOKEN="token-secreto-para-llamadas-internas-desde-cloud-functions"

# CORS
ALLOWED_ORIGINS="https://facturasec.web.app,https://app.facturasec.com"

# Webhooks
WEBHOOK_TIMEOUT_MS=10000           # timeout para enviar webhook al cliente
WEBHOOK_MAX_RETRIES=3
WEBHOOK_RETRY_SCHEDULE="0 */5 * * * *"  # Cloud Scheduler: cada 5 minutos

# Rate Limiting
RATE_LIMIT_PER_MINUTE=100
RATE_LIMIT_PER_HOUR=5000
```

---

## 11. Infraestructura y Deploy

### Arquitectura en Google Cloud

```
┌─────────────────────────────────────────┐
│  Google Cloud Project (mismo que Firebase)
│                                          │
│  ┌─────────────────┐                    │
│  │  Cloud Run       │                   │
│  │  accounting-api  │◄──── Internet     │
│  │  (NestJS)        │                   │
│  └────────┬─────────┘                   │
│           │ Unix Socket (privado)        │
│  ┌────────▼─────────┐                   │
│  │  Cloud SQL        │                  │
│  │  PostgreSQL 16    │                  │
│  │  (privada, sin    │                  │
│  │   IP pública)     │                  │
│  └──────────────────┘                   │
│                                          │
│  ┌──────────────────┐                   │
│  │  Cloud Scheduler  │                  │
│  │  → /webhooks/     │                  │
│  │    retry          │                  │
│  └──────────────────┘                   │
│                                          │
│  ┌──────────────────┐                   │
│  │  Firebase         │                  │
│  │  (Auth + Firestore│                  │
│  │  + Cloud Functions│                  │
│  │  existentes)      │                  │
│  └──────────────────┘                   │
└─────────────────────────────────────────┘
```

### Dockerfile

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
EXPOSE 8080
CMD ["node", "dist/main.js"]
```

### Comandos de deploy

```bash
# Build y push de imagen
gcloud builds submit --tag gcr.io/PROJECT_ID/accounting-api

# Deploy a Cloud Run
gcloud run deploy accounting-api \
  --image gcr.io/PROJECT_ID/accounting-api \
  --platform managed \
  --region us-central1 \
  --add-cloudsql-instances PROJECT_ID:us-central1:accounting-db \
  --set-env-vars NODE_ENV=production \
  --set-secrets "DATABASE_URL=accounting-db-url:latest" \
  --service-account accounting-api@PROJECT_ID.iam.gserviceaccount.com \
  --min-instances 0 \
  --max-instances 10

# Ejecutar migraciones (desde Cloud Run job o desde Cloud Shell)
npx prisma migrate deploy
```

---

## Resumen de Fases y Prioridades

| Fase | Contenido | Prioridad | Resultado |
|---|---|---|---|
| **0** | Scaffolding NestJS + auth + CI/CD | Crítica | Proyecto deployable en Cloud Run |
| **1** | Schema PostgreSQL + seed Ecuador | Crítica | BD lista con plan de cuentas |
| **2** | Gestión de empresas + API Keys + config | Crítica | Cliente puede hacer setup completo |
| **3** | Motor de eventos (8 eventos) | Crítica | **MVP funcional — asientos automáticos** |
| **4** | Webhooks + replicación al cliente | Alta | Cliente recibe asientos en su BD |
| **5** | Endpoints de consulta + reportes | Alta | Cliente puede consultar sin frontend |
| **6** | Cierre de periodos contables | Alta | Ciclo contable anual completo |
| **7** | Módulos adicionales (bancos, activos, etc.) | Media | Módulo contable completo |
| **8** | Formularios SRI desde PostgreSQL | Media | Declaraciones tributarias asistidas |
| **9** | Auditoría y seguridad avanzada | Baja | Listo para producción enterprise |

**Las fases 0-4 son el MVP mínimo.** Con ellas, un cliente externo puede:
1. Registrarse y configurar su empresa
2. Enviar los 8 tipos de eventos comerciales
3. Recibir los asientos generados en tiempo real en su PostgreSQL

---

*Documento generado: 2026-08-28*  
*Proyecto: SaasFacturacion — FacturasEC*  
*Basado en análisis del CEO Agent, Business Agent y Architecture Agent*
