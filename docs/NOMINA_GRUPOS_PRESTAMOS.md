# Nómina (Ecuador) — Grupos de colaboradores y préstamos

> 2026-11-18 · rama `feat/nomina_conectate` · **sin desplegar**. Punto 2 de lo que faltaba frente al sistema
> actual. Antes: `NOMINA_PAGOS.md` (punto 1). Decisiones: D-N10 (grupos y cuentas) y D-N12 (préstamos) del plan.

## 1. Qué hay

| Pieza | Qué hace |
|---|---|
| **Grupos de colaboradores** (`payrollGroups`) | Nombre, descripción, activo y **cuentas propias**. Al aprobar, cada rol usa las cuentas de su grupo encima de las de la empresa (eso ya lo hacía el cálculo; faltaba poder crearlos). Se asigna en la ficha del empleado (`groupId`, que `upsertPayrollEmployee` ya acepta y valida) |
| **Préstamos** (`payrollLoans`) | Empleado, tipo, monto, saldo, cuota, **mes del primer descuento** (`startPeriod`, nuevo), cuenta propia opcional. Se descuentan solos en cada rol hasta quedar en cero (`approvePayrollRun` baja el saldo, `reversePayrollRun` lo devuelve: ya existía) |

**No** se hizo «generar el rol por grupo» del sistema actual: la nómina es una por mes para toda la empresa
(candado `payrollPeriods/{AAAA-MM}`). Los grupos sirven para las cuentas y para filtrar en pantalla.

## 2. Tipos de préstamo (criterio provisional, plan §9 punto 18, pendiente de Jessica Zari)

| Tipo | Quién presta | Asiento al crearlo | Cuenta (si el préstamo no trae la suya) |
|---|---|---|---|
| `companyLoan` | La empresa | Opcional: **entrega** Debe cuenta del préstamo / Haber banco o cuenta | `companyLoan` de Cuentas de nómina (sin sugerida) |
| `longTermAdvance` | La empresa | Opcional, igual | `longTermAdvance` → si vacía, `advances`. **Cuenta en el tope del 10 %** |
| `iessQuirografario` | El IESS | **Nunca**: la empresa solo retiene la cuota y se la paga al IESS | `iessQuirografario` (una deuda con el IESS, 2.1.04.x; sin sugerida) |
| `iessHipotecario` | El IESS | Nunca | `iessHipotecario` |

Sin entrega = el dinero salió antes o fuera del sistema (p. ej. un préstamo que viene del sistema anterior con
`balanceCents` menor que el monto). El rol acredita la cuenta del préstamo con cada cuota.

## 3. Contrato (`functions/src/payroll/payroll-group-loan-callables.ts`)

Solo `admin` y `accountant`, con el módulo. Toda alta o cambio sube `payrollInputsSeq` (un borrador se recalcula).

| Callable | Entrada | Devuelve | Reglas |
|---|---|---|---|
| `upsertPayrollGroup` | `{companyId, groupId?, name, description?, accounts?: {clave: código}, isActive?}` | `{groupId, created}` | Nombre obligatorio y sin repetir (sin mayúsculas/espacios); `accounts` **reemplaza** las del grupo (solo claves de `PayrollAccountKey`, cuentas de movimiento activas; vacías no se guardan) |
| `deletePayrollGroup` | `{companyId, groupId}` | `{groupId}` | Solo sin empleados (si tiene, desactivarlo) |
| `createPayrollLoan` | `{companyId, employeeId, type, amountCents, balanceCents?, installmentCents, startPeriod 'AAAA-MM', accountCode?, notes?, disbursement?: {date, …origen del dinero, reference?}}` | `{loanId, number, entryId \| null}` | Empleado activo; cuota ≤ saldo ≤ monto; hace falta una cuenta (la propia o la de Cuentas de nómina); entrega solo en `companyLoan`/`longTermAdvance`, sin saldo previo, fecha no futura y no después de `startPeriod`; origen del dinero como en `NOMINA_PAGOS.md` §3 |
| `updatePayrollLoan` | `{companyId, loanId, installmentCents?, balanceCents?, notes?}` | `{loanId}` | Solo activos; **saldo solo en los del IESS** (lo informa el IESS); cuota ≤ saldo |
| `cancelPayrollLoan` | `{companyId, loanId, reason}` | `{loanId, reversalEntryId \| null}` | Solo activos; deja de descontarse; si tuvo entrega **y no se descontó nada**, reversa su asiento; si ya se descontó algo, el asiento queda y el resto se ajusta a mano |

Cambia `computeRun`: un préstamo entra al mes solo si `status == 'active'` y `startPeriod <= mes` (los viejos sin
`startPeriod`, siempre).

## 4. Datos

`payrollGroups/{id}`: `name, description, accounts {clave: código}, isActive, createdAt, createdBy, updatedAt, updatedBy`.

`payrollLoans/{id}`: `number PRE-AAAA-NNNNNN, employeeId, employeeName, type, amountCents, balanceCents,
installmentCents, startPeriod, accountCode, status 'active'|'paid'|'cancelled', notes, disbursement {date, entryId,
paymentMode, bankAccountId, sourceLabel, sourceAccountCode, paymentMethodCode, chequeNumber, reference,
reversalEntryId?} | null, createdAt, createdBy, updatedAt, cancelReason?, cancelledAt?`.
Contador `counters/payroll.loan_AAAA`. En cada rol, la línea `deductions[]` con `concept: 'loan'`, `loanId`,
`loanType` y `amountCents` (ya existía).

Lecturas sugeridas: grupos `payrollGroups` (pocos, `.get()`); préstamos `where('status','==','active')` o
`where('employeeId','==',id)` (un solo campo, sin índice compuesto).

## 5. Pruebas

- Jest: **104/104** de nómina (14 nuevas en `payroll-loan-logic.test.ts`).
- Integración (`test/payroll/payroll-groups-loans.it.test.ts`): grupo con cuenta de neto propia que usa el rol
  aprobado, nombre repetido, cuenta inexistente, no se borra con empleados, edición conserva la creación; préstamo
  sin cuenta rechazado, entrega con asiento sin nombres, préstamo IESS que empieza un mes después y no se descuenta
  antes, saldo que baja al aprobar y vuelve al reversar, saldo no editable en préstamo de la empresa, cancelación
  que reversa la entrega. Total **10/10** con los anteriores.

## 6. Despliegue

Tanda `16-nomina-grupos` de `scripts/deploy-node22.sh` (sin reglas nuevas). Después, hosting de las dos webs.
