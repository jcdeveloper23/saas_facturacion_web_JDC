# Nómina (Ecuador) — Pago de roles, anticipos a empleados y cuentas de nómina

> 2026-11-18 · rama `feat/nomina_conectate` · **sin desplegar**.
> Antes: `NOMINA_E2.md`, `NOMINA_E3.md`, `NOMINA_E5.md`. Plan: `PLAN_NOMINA.md` (panel).
> Es el punto 1 de lo que faltaba frente al sistema de nómina que usa hoy la empresa (Colaboradores, Grupos,
> Rol Pago, Pago de roles, Anticipos, Cuentas Defecto Nómina, Décimos, Vacaciones, Reportes).

## 1. Qué cambia

| Pieza | Antes | Ahora |
|---|---|---|
| **Pago de roles** | D-N6: el neto quedaba en «Por pagar empleados» y se pagaba con comprobante de egreso o asiento manual (pagar desde la nómina iba a E6) | Se paga desde la nómina aprobada: se eligen los roles, la cuenta de banco/caja (o una cuenta contable) y la fecha. Un asiento por pago. El comprobante de egreso sigue sirviendo para quien ya lo use |
| **Anticipos a empleados** | Solo una novedad `advance` que se descontaba en el rol; la salida del dinero se registraba aparte | Se registra la entrega (asiento Debe Anticipos / Haber banco o cuenta) y la novedad del mes del descuento se crea sola, ligada |
| **Cuentas de nómina** | El asiento usaba las cuentas sugeridas de §5.2; no había pantalla | Cada empresa elige sus cuentas (`settings/accounting.payrollAccounts`); vacío = la sugerida |

Los anticipos **a largo plazo** (con cuotas) y los préstamos siguen en `payrollLoans` (D-N12) y van en el punto 2.

## 2. Asientos

```
Anticipo a empleado:   DÉBITO Anticipos (advances, 1.1.02.002)         / CRÉDITO banco o cuenta elegida
Rol aprobado:          (sin cambios) … CRÉDITO Por pagar empleados (netPayable, 2.1.01.003)
                                       CRÉDITO Anticipos (lo descontado)
Pago de roles:         DÉBITO Por pagar empleados (por cuenta)          / CRÉDITO banco o cuenta elegida
```

Sin nombres de empleados en las líneas ni en la descripción (§5.2): el asiento lleva el número `ANE-AAAA-NNNNNN`
(anticipo) o `PNO-AAAA-NNNNNN` (pago). Todos con `type: 'automatic'`, `source: 'payroll'`. Anular uno crea su
reversa (fecha de hoy, o el 31/12 si el año ya pasó) y marca el original `cancelled`; se rechaza con el ejercicio
cerrado o el asiento conciliado con el banco.

## 3. Contrato de las callables (`functions/src/payroll/`)

Todas: solo `admin` y `accountant` de la empresa (`requirePayrollRole`) y con el módulo (`pkg_hr`). Errores de negocio
con `failed-precondition` y mensaje en español listo para mostrar; datos mal formados con `invalid-argument`.

**De dónde sale el dinero** (igual que los comprobantes de egreso), en pago y anticipo:
- `paymentMode: 'bank'` (por defecto) + `bankAccountId` (de `bank_accounts`, activa, con `linkedGlCode`) +
  `paymentMethodCode` (Tabla 24 del SRI: `01, 15, 16, 17, 18, 19, 20, 21`) + `chequeNumber?`
- `paymentMode: 'account'` + `creditAccountCode` (cuenta de movimiento activa del plan: p. ej. Caja)

| Callable | Entrada | Devuelve | Reglas |
|---|---|---|---|
| `payPayrollRun` | `{companyId, runId, payslipIds[], date 'AAAA-MM-DD', …origen, reference?, notes?}` | `{paymentId, number, entryId, totalCents}` | Nómina `approved`; cada rol de esa nómina, `approved` y con saldo; se paga **lo que le falta, completo**; fecha ≥ mes de la nómina y no futura; ejercicio abierto del año de la fecha; hasta 200 roles |
| `voidPayrollPayment` | `{companyId, paymentId, reason}` | `{paymentId, reversalEntryId}` | Motivo obligatorio; los roles vuelven a quedar por pagar |
| `registerPayrollAdvance` | `{companyId, employeeId, amountCents, date, period? 'AAAA-MM', …origen, reference?, notes?}` | `{advanceId, number, entryId}` | Empleado activo; fecha no futura; `period` = mes del descuento, el de la fecha (por defecto) o el siguiente; ese mes sin nómina aprobada; tope del art. 90 (10 % del sueldo, contando los anticipos del mes); parámetros publicados para ese mes |
| `voidPayrollAdvance` | `{companyId, advanceId, reason}` | `{advanceId, reversalEntryId}` | Solo si la nómina del mes del descuento **no** está aprobada; borra la novedad ligada |
| `getPayrollAccounts` | `{companyId}` | `{defaults: {clave: código}, saved: {clave: código}}` | — |
| `savePayrollAccounts` | `{companyId, accounts: {clave: código}}` | igual que `get` | Solo claves conocidas; cada código, cuenta de movimiento activa; `''` borra la clave (vuelve a la sugerida); las claves que no vienen no cambian |

Cambios en las que ya estaban:
- `approvePayrollRun`: cada rol guarda `netPayableAccountCode`, `groupId`, `paidCents: 0`, `paymentStatus: 'unpaid'`;
  la nómina, `paidCents: 0`, `paymentStatus: 'unpaid'`.
- `reversePayrollRun`: **rechaza** si la nómina tiene `paidCents > 0` («anula los pagos primero»).
- `savePayrollNovelties`: no deja borrar una novedad con `advanceId` («anúlalo desde Anticipos»).

**Claves de cuentas** (`PayrollAccountKey`, sugeridas en `payroll-entry.ts` → `DEFAULT_PAYROLL_ACCOUNTS`):
`salaryAdmin, salarySales, otherTaxable, commissions*, bonuses*, nonTaxableIncome*, thirteenthExpense,
fourteenthExpense, reserveFundExpense, vacationExpense, employerCostExpense, netPayable, advances,
iessPersonalPayable, employerCostPayable, thirteenthProvision, fourteenthProvision, vacationProvision,
reserveFundIessPayable, companyLoan, longTermAdvance*, iessQuirografario, iessHipotecario, otherDeductions`.
(*) sin sugerida: caen a `otherTaxable` (commissions, bonuses, nonTaxableIncome) o a `advances` (longTermAdvance).
Las de cada grupo de colaboradores (`payrollGroups/{id}.accounts`) van encima: pantalla en el punto 2.

## 4. Datos nuevos (solo los escribe el servidor; los leen admin y contador)

`payrollPayments/{id}`: `number, runId, period, date 'AAAA-MM-DD', year, status 'posted'|'voided', paymentMode,
bankAccountId, sourceLabel, sourceAccountCode, paymentMethodCode, chequeNumber, reference, notes,
lines [{payslipId, employeeId, name, amountCents, netPayableAccount}], totalCents, entryId, createdAt, createdBy,
voidReason?, voidedAt?, reversalEntryId?`.

`payrollAdvances/{id}`: `number, employeeId, employeeName, date, year, period, amountCents, status 'posted'|'voided',
paymentMode, bankAccountId, sourceLabel, sourceAccountCode, paymentMethodCode, chequeNumber, advancesAccountCode,
reference, notes, noveltyId, entryId, createdAt, createdBy, voidReason?, voidedAt?, reversalEntryId?`.

En `payslips`: `paidCents, paymentStatus 'unpaid'|'partial'|'paid', paymentIds[], paidAt, netPayableAccountCode`.
En `payrollRuns`: `paidCents, paymentStatus`. En `payrollNovelties`: `advanceId` (la del anticipo).
Contadores en `counters/payroll`: `advance_AAAA`, `payment_AAAA`.

Lecturas sugeridas (sin índices compuestos): pagos de una nómina `where('runId','==',id)`; anticipos de un mes
`where('period','==','AAAA-MM')`; anticipos recientes `orderBy('createdAt','desc').limit(N)`.

## 5. Cómo se probó

- Jest (`functions/`): **90/90** de nómina (29 nuevas en `payroll-payment-logic.test.ts`).
- Integración contra el emulador (`test/payroll/`): **8/8**, con `payroll-payments.it.test.ts` nuevo: cuentas
  (validación y borrado), anticipo (asiento, novedad bloqueada, tope, anular, desde caja), pago (parcial, doble
  pago rechazado, reversa rechazada con pagos, anular, completo desde cuenta contable).
- Reglas: **808/808** (las dos colecciones nuevas, en el mismo bloque que las demás de nómina).
- Comandos: los de `NOMINA_E3.md` §7 (con el aviso de Java 21).

## 6. Despliegue (cuando lo ordene el usuario)

1. Reglas: `firebase deploy --project accounting-system-a5c9f --only firestore:rules`.
2. Tanda `15-nomina-pagos` de `scripts/deploy-node22.sh` (6 nuevas + `approvePayrollRun`, `reversePayrollRun`,
   `savePayrollNovelties`).
3. Hosting de FacturaEc y de Conectate con sus pantallas.

Una nómina aprobada **antes** de este despliegue no tiene `netPayableAccountCode`: el pago usa la cuenta de hoy
(`netPayable` de la empresa o del grupo). Si se cambió entretanto, el pago descargaría otra cuenta: revisar.

## 7. Pantallas (2026-11-18, sin desplegar)

- **Web FacturaEc** (`src/app/features/payroll/`): «Pagar roles» y lista de pagos en la ficha de la nómina;
  pestañas **Anticipos** (`/payroll/advances`) y **Cuentas** (`/payroll/accounts`); novedad de anticipo bloqueada.
  `ng build` en verde. El menú lateral sale de `/modules` y solo trae «Nómina»: las dos pantallas nuevas se abren
  por las pestañas (o agregándolas al módulo desde el super admin).
- **Conectate** (`lib/features/accounting/payroll/`): lo mismo, con «Anticipos» y «Cuentas de nómina» en la sección
  Nómina del menú de Contabilidad. `flutter analyze` limpio; 51 pruebas en verde.
- Cheque: la Tabla 24 no tiene código de cheque; el n.º de cheque se pide con la forma **20**.
- Ninguna pantalla se probó en el navegador (la web apunta a producción y esto no está desplegado).
- El error de cuentas faltantes al aprobar ahora usa los nombres en español (`PAYROLL_ACCOUNT_LABELS`).
