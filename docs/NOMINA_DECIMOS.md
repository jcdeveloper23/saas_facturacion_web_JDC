# Nómina (Ecuador) — Pago de décimos acumulados y vacaciones

> 2026-11-18 · rama `feat/nomina_conectate` · **sin desplegar**. Punto 3 de lo que faltaba frente al sistema
> actual («Décimos Colaborador», «Pagos de Décimos», «Vacaciones y Permisos»). Antes: `NOMINA_PAGOS.md`,
> `NOMINA_GRUPOS_PRESTAMOS.md`. Decisiones: D-N11 (décimos) y D-N7 (provisión de vacaciones).

## 1. Décimos acumulados

Quien cobra el 13.º o el 14.º **mensualizado** ya lo recibe en cada rol: no entra aquí. Quien lo **acumula** deja una
provisión en cada rol aprobado; el lote de décimos la paga al final del periodo legal y la descarga.

| Décimo | Periodo | Se paga hasta | Valor (payroll-bonus.ts, ya existía) |
|---|---|---|---|
| 13.º | 1-dic del año anterior – 30-nov | 24-dic | lo percibido en los meses acumulados ÷ 12 (art. 111) |
| 14.º Sierra/Amazonía | 1-ago del año anterior – 31-jul | 15-ago | SBU **del día del pago** × días trabajados ÷ 360 (art. 113) |
| 14.º Costa/Insular | 1-mar del año anterior – fin de feb | 15-mar | ídem |

El valor legal no es la suma de las provisiones (cada una redondeada y con el SBU de su mes): la diferencia es el
**ajuste**, que el asiento lleva al gasto. ⚠️ Criterio a confirmar con Jessica Zari (plan §9, puntos 14-16).

```
Pago del décimo:  DÉBITO Provisión 13.º/14.º (lo provisionado)   CRÉDITO banco o cuenta (lo pagado)
                  DÉBITO o CRÉDITO Gasto 13.º/14.º (el ajuste)
```
Cuentas: `thirteenthProvision`/`fourteenthProvision` y `thirteenthExpense`/`fourteenthExpense` del grupo del empleado
o de la empresa. Sin nombres en el asiento.

**Ciclo**: `draft` (se recalcula) → `paid` (asiento) → `voided` (reversa). Un solo lote vivo por décimo, año (y región en
el 14.º); anular libera para la versión siguiente (`thirteenth_2026_v2`). Se abre desde el **último mes** del periodo.
Un lote pagado marca `payrollPeriods/{mes}.bonusRunIds` en cada mes que cubre: **no se puede reversar la nómina de
esos meses** hasta anular el pago del décimo.

### Contrato (`payroll-bonus-run-callables.ts`)

| Callable | Entrada | Devuelve |
|---|---|---|
| `createPayrollBonusRun` | `{companyId, kind: 'thirteenth'\|'fourteenth', year, region? 'sierra'\|'costa' (solo 14.º)}` | `{bonusRunId, version, totals}` |
| `recalculatePayrollBonusRun` | `{companyId, bonusRunId}` | `{bonusRunId, totals}` |
| `payPayrollBonusRun` | `{companyId, bonusRunId, date, …origen del dinero (NOMINA_PAGOS.md §3), reference?, notes?}` | `{bonusRunId, entryId, totalCents}` |
| `voidPayrollBonusRun` | `{companyId, bonusRunId, reason}` (borrador: lo descarta; pagado: reversa el asiento) | `{bonusRunId, reversalEntryId \| null}` |

Pagar **recalcula con la fecha del pago** (el SBU del 14.º es el de ese día), exige que ningún empleado tenga errores
(p. ej. saldo negativo) y paga a todos los que tienen saldo. Fecha no futura, ejercicio abierto.

`payrollBonusRuns/{id}`: `key, kind, year, region, version, from, to, label, status, lines[], totals, calculatedFor,
paidCents?, paymentDate?, entryId?, paymentMode, bankAccountId, sourceLabel, …, voidReason?, reversalEntryId?`.
Cada línea: `employeeId, employeeName, groupId, expenseGroup, from, to, totalIncomeCents, monthsWorked,
monthsAccumulated, amountCents, provisionedCents, adjustmentCents, alreadyPaidCents, balanceCents, errors[]`.
`totals`: `employees, amountCents, provisionedCents, adjustmentCents, balanceCents`.
Candado: `counters/payroll.bonusLocks.{clave}` = `{status, activeRunId, lastVersion}`.

## 2. Vacaciones (registro de días, sin asiento)

Primera versión **sin efecto contable**: el sueldo de los días de vacaciones se paga en el rol del mes como siempre y la
provisión de 1/24 ya existe (D-N7). Pagar vacaciones **no gozadas** va con la liquidación (otra etapa).

- Por cada año completo de servicio: 15 días (`vacation.baseDays`) + 1 por año después del quinto, hasta 15 más (art. 69).
- Del año en curso, la parte proporcional, informativa.
- Días **corridos** (incluye fines de semana y feriados). El servicio cuenta desde el ingreso menos `priorServiceDays`.
- Sin saldo, solo como **adelanto** acordado (`allowAdvance`). No se cruzan dos periodos del mismo empleado.

| Callable | Entrada | Devuelve |
|---|---|---|
| `getPayrollVacationBalance` | `{companyId, employeeId, asOf?}` | `{serviceStart, completedYears, earnedDays, accruingDays, takenDays, availableDays, nextAnniversary}` |
| `registerPayrollVacation` | `{companyId, employeeId, from, to, allowAdvance?, notes?}` (hasta 60 días) | `{vacationId, days, balance}` |
| `voidPayrollVacation` | `{companyId, vacationId, reason}` | `{vacationId}` |

`payrollVacations/{id}`: `employeeId, employeeName, from, to, days, isAdvance, status 'posted'|'voided', notes,
createdAt, createdBy, voidReason?`. Regla nueva: la leen admin y contador; solo escribe el servidor. Lectura sugerida:
`where('employeeId','==',id)` (un campo).

Los **permisos sin sueldo** siguen siendo la novedad `unpaidLeave` de Novedades del mes.

## 3. Otros cambios

- `createPayrollLoan`: un **anticipo a largo plazo** con cuota sobre el 10 % del sueldo se rechaza al crearlo (antes
  solo al aprobar la nómina).

## 4. Pruebas

- Jest: **122/122** de nómina (`payroll-bonus-run-logic.test.ts` y `payroll-vacation-logic.test.ts`, nuevas).
- Integración (`test/payroll/payroll-bonus.it.test.ts`): 13.º 2026 con dos meses acumulados (200,00), pagar
  (Debe 2.1.03.001 / Haber banco), no pagar dos veces, mes bloqueado para reversar, anular, reversar el mes, v2 con un mes;
  anticipo a largo plazo sobre el tope; vacaciones (saldo, cruce, adelanto, anular). Total **13/13**. ⚠️ Usa el reloj
  real: el 13.º 2026 se abre desde noviembre de 2026.
- Reglas: **839/839** (corridas solas: si van después de la integración en el mismo emulador, dos casos ajenos a la
  nómina fallan por los datos que deja).

## 5. Despliegue

Reglas (`payrollVacations`) y luego la tanda `17-nomina-decimos` de `scripts/deploy-node22.sh`. Después, hosting.
