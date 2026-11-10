# Nómina (Ecuador) — Etapa E3: callables, PDF y correo

> Estado al **2026-11-10**: todo lo de esta página está **en el árbol de trabajo, SIN commit y SIN
> desplegar**, en la rama `feat/nomina_conectate`. Nada se ha ejecutado contra producción y **nada se
> probó en pantalla**.
>
> Plan oficial (repo del panel `weworkscloud`, rama `feat/contabilidad-usuarios`): `docs/PLAN_NOMINA.md`
> (§5.3 ciclo, §5.4 callables, §5.5 PDF y correo, §8 E3, §11 despliegue). Aquí se cita como «plan §N».
> Antes de leer esto, lee `docs/NOMINA_E2.md` (colecciones, reglas, cálculo puro): E3 solo **orquesta** lo
> que E2 dejó.

## 1. Qué es E3

E2 dejó las colecciones protegidas (el cliente **no escribe** nada de nómina) y el cálculo como función
pura. E3 son las **8 callables** que escriben: son la única vía para crear empleados, novedades, nóminas,
roles y asientos. Más el PDF del rol y su envío por correo.

Archivos nuevos en `functions/src/payroll/`:

| Archivo | Responsabilidad |
|---|---|
| `payroll-auth.ts` | `requirePayrollRole` (solo `admin` y `accountant` **de esa empresa**, sin la excepción de `super_admin`), `requirePayrollModule` (`enabledModules` con `payroll` o `enabledPackages` con `pkg_hr`), lectores de ids |
| `payroll-run-logic.ts` | Lo **puro**: `parsePeriod`, ids (`runId`, `payslipId`), `validateEmployee`, `validateNovelty`, `createRunProblem`/`approveProblem`/`reverseProblem`, `runTotals`, `toJournalLines` |
| `payroll-compute.ts` | `computeRun`: lee parámetros, empleados, novedades y préstamos y llama a `calculatePayslip`; `loadAccountsFor`, `readChart`, `payslipDoc`, `stripUndefined` |
| `payroll-employee-callables.ts` | `upsertPayrollEmployee`, `savePayrollNovelties` |
| `payroll-run-callables.ts` | `createPayrollRun`, `recalculatePayrollRun`, `approvePayrollRun`, `reversePayrollRun` |
| `payroll-pdf.ts` | `getPayslipPdf` y `buildPayslipPdf` (pdfkit) |
| `payroll-email.ts` | `sendPayslipEmails` |

Además: `functions/src/index.ts` exporta las 8 y `scripts/deploy-node22.sh` suma la tanda `14-nomina`.
Pruebas: `functions/src/__tests__/payroll-run-logic.test.ts` y `test/payroll/` (integración).

Todas las callables hacen primero `readCompanyId` → `requirePayrollRole` → `requirePayrollModule`. Sin sesión:
`unauthenticated`; rol o empresa incorrectos (incluidos `super_admin` y `channel_admin`, cuyo token no trae
`companyId`): `permission-denied`; empresa sin el módulo: `failed-precondition`.

## 2. Las 8 callables

Todas reciben `companyId` además de lo que se indica. Los errores de negocio salen como
`failed-precondition`; los de forma, `invalid-argument`.

| Callable | Entrada | Salida | Qué valida | Qué escribe |
|---|---|---|---|---|
| `upsertPayrollEmployee` | `personaId`, `employee{salaryCents, hireDate, endDate?, contractType, workdayType, region, expenseGroup, groupId?, thirteenthMode, fourteenthMode, reserveFundMode, priorServiceDays, email, iessNumber, bankAccount, isActive…}` | `{employeeId, created}` | `validateEmployee`: sueldo entero en centavos > 0, fechas `AAAA-MM-DD`, salida ≥ ingreso, **jornada `partial` rechazada** (L7), correo válido. La persona existe y tiene el rol `employee`. Si trae `groupId`, el grupo existe. **Cupo**: solo al sumar un activo (alta o reactivación) aplica `employeeLimitDecision(company.planLimits, activosActuales)` | `payrollEmployees/{personaId}` (merge; el id es el de la persona). Nombre y cédula salen de la persona, no de lo que llegue. Agrega a `salaryHistory` si cambió el sueldo (`validFrom` = `hireDate` en el alta, hoy en ediciones). Actualiza `companies/{cid}.totalPayrollEmployeesActive` |
| `savePayrollNovelties` | `period` (`AAAA-MM`), `add?[{employeeId, type, qty \| amountCents, accountCode?, note?}]`, `delete?[noveltyId]` | `{added, deleted}` | Al menos un cambio, máximo 200. Tipo conocido; por valor: `commission`, `bonusTaxable`, `bonusNonTaxable`, `advance`, `otherDeduction`; por cantidad (≤ 2 decimales, ≤ 300 h o ≤ 30 días en `unpaidLeave`): el resto. Los empleados existen en `payrollEmployees`. Lo que se borra es **del mismo mes**. **Rechaza si `payrollPeriods/{mes}.status == 'approved'`** | `payrollNovelties` (add/delete) en una transacción. Si el mes está en `draft`, marca `payrollPeriods.noveltiesChangedAt` (Conecta lo usa para ofrecer «Recalcular») |
| `createPayrollRun` | `period` | `{runId, version}` | `computeRun` (hay parámetros publicados y vigentes, si no `failed-precondition`). El candado del mes: **`draft` o `approved` rechazan** (`createRunProblem`) | Transacción: `payrollPeriods/{mes}` → `draft`, `activeRunId`, `lastRunId`, `lastVersion`; `payrollRuns/{mes}_v{N}` (`draft`, totales, avisos, `blockingErrors`, `supersedesRunId` si N > 1). **Después** y fuera de la transacción: `payslips` del borrador (`rewritePayslips`) |
| `recalculatePayrollRun` | `runId` | `{runId, totals, blockingErrors}` | La nómina existe y está en `draft` | Reescribe `payslips` del borrador (borra los de empleados que salieron) y actualiza totales, avisos, `blockingErrors`, `calculatedAt` de la nómina |
| `approvePayrollRun` | `runId` | `{runId, accountingEntryId, number}` | Recalcula **ahora** (no aprueba un borrador viejo). `approveProblem`: está en `draft`, sin `blockingErrors`, con al menos 1 rol. Cuentas: `buildPayrollEntryLines` (falta alguna cuenta → `PayrollEntryError`), y cada cuenta del asiento existe en `chart_of_accounts`, está activa y admite movimientos. El asiento cuadra (< 0,005). Dentro de la transacción: sigue en `draft`, es la `activeRunId` del mes y hay un `accounting_periods` abierto del año | Ver §4 |
| `reversePayrollRun` | `runId`, `reason` (obligatorio, máx. 300) | `{runId, reversalEntryId}` | `reverseProblem`: existe, está `approved`, hay motivo. Tiene `accountingEntryId`; el asiento **no está conciliado** (`bank_reconciled_entries/{id}`); el ejercicio **no está cerrado** (`closedPeriodReversalError`) | Ver §5 |
| `getPayslipPdf` | `payslipId` | `{base64, fileName}` | El rol existe y **no está en `draft`** (reversado sí se puede consultar). Lee solo de `payslips` | Nada. Sin `makePublic()` ni URL: devuelve los bytes. Nombre `rol-AAAA-MM-{cédula}.pdf` (sin nombre ni montos) |
| `sendPayslipEmails` | `runId`, `payslipIds?` (sin ellos, todos) | `{sent, failed, skipped}` | La nómina está `approved`. Hay roles que enviar. Timeout 300 s | Por rol: `emailSent`, `emailTo`, `emailSentAt`, `emailError`. Sin correo en `payrollEmployees.email` → cuenta como `skipped` con `emailError`. Un fallo no detiene a los demás. Correo sin cifras: el PDF va adjunto como `Buffer` |

**Quién puede:** las 8, solo `admin` y `accountant` de la empresa, con el módulo `payroll`/`pkg_hr`
encendido (ver §1).

## 3. El ciclo y el candado `payrollPeriods`

```text
(sin nómina) ─createPayrollRun─► draft ─approvePayrollRun─► approved ─reversePayrollRun─► reversed
                                   ▲ recalculatePayrollRun                     │
                                   └─────────────── createPayrollRun: vN+1 ────┘
```

`payrollPeriods/{AAAA-MM}` es el candado del mes (un doc por mes). Campos que escriben las callables:
`status` (`draft`/`approved`/`reversed`), `activeRunId` (la nómina viva, `null` tras reversar), `lastRunId`,
`lastVersion` y `noveltiesChangedAt`.

- Los ids: nómina `2026-11_v1`; rol `2026-11_v1_{employeeId}`; la versión sale de `lastVersion + 1`.
- Con el candado en `draft` o `approved`, `createPayrollRun` falla. Con `reversed` (o sin doc) abre `vN+1`
  con `supersedesRunId` = nómina anterior.
- `savePayrollNovelties` solo se bloquea con `approved`; con `draft` marca `noveltiesChangedAt`; sin nómina o
  `reversed` escribe sin más.
- Aprobar exige que la nómina siga en `draft` **y** sea la `activeRunId`; con dos aprobaciones, la segunda
  falla dentro de la transacción (ver §7, aceptación).

## 4. Qué pasa en la transacción de aprobar

Antes de la transacción (lecturas): `computeRun` del mes, validaciones de cuentas y arma las líneas
(`toJournalLines`, en **dólares**, sin nombres de empleados, descripción `Nómina AAAA-MM`). Dentro de **una**
transacción:

1. **Asiento** en `journal_entries`: número = `counters/journal_entries.journal_{año}` + 1;
   `type: 'automatic'`, `source: 'payroll'`, `status: 'posted'`, `reference`/`referenceId` = `runId`;
   fecha = **último día del mes** al mediodía de Ecuador; `periodId` del ejercicio abierto del año;
   `createdBy: 'system'`.
2. **Roles congelados**: cada `payslips/{runId_employeeId}` se reescribe con `status: 'approved'` y
   `parametersSnapshot` (copia íntegra de los parámetros con que se calculó, más `parametersId`). Los roles del
   borrador de empleados que ya no corresponden se borran.
3. **Préstamos** (`payrollLoans`): a cada préstamo con cuota en el mes se le baja `balanceCents` por la cuota
   y queda `status: 'paid'` si llegó a 0, si no `active`. Si el saldo cambió y saldría negativo, falla y pide
   recalcular.
4. **Nómina**: `status: 'approved'`, `accountingEntryId`, `parametersSnapshot`, `approvedAt`, `approvedBy` y
   los totales recalculados.
5. **Candado**: `payrollPeriods/{mes}.status = 'approved'`.

Cualquier fallo revierte todo (no queda asiento sin nómina ni al revés).

## 5. Qué pasa en la transacción de reversar

Lecturas previas: los roles de la nómina. Dentro de **una** transacción:

1. Asiento de reversa nuevo: líneas invertidas (`invertLines`, de `advance-logic.ts`), `reversalOf` = asiento
   original, descripción `[REVERSA] …— motivo`, fecha **hoy** si el año coincide con el del asiento, o 31-dic de
   ese año si no.
2. Asiento original → `status: 'cancelled'`, con `reversalEntryId`, `cancelledAt/By` y `cancelReason`.
3. **Préstamos**: lo descontado por cada rol (`deductions` con `concept: 'loan'`) vuelve a `balanceCents`;
   `status: 'active'`.
4. Roles → `status: 'reversed'`. Nómina → `reversed` con `reversalEntryId`, `reversalReason`, `reversedAt/By`.
5. Candado: `status: 'reversed'`, `activeRunId: null`, `lastRunId`. El mes queda libre para `vN+1`.

⚠️ **No** avisa ni revierte el pago manual si la nómina ya se pagó (plan §5.3 pide avisar; ver §9).

## 6. Contrato con Conecta

Conecta (`weworkcloudweb`, `lib/features/accounting/payroll/payroll_service.dart` y
`models/payroll_run.dart`) **lee con el SDK** `payrollRuns` y `payslips` (las reglas lo permiten a admin y
contador) y **escribe solo por callables**.

`companies/{cid}/payrollRuns/{mes_vN}`: `period`, `version`, `status`, `parametersId`,
`accountingEntryId`, `reversalEntryId`, `supersedesRunId`, `reversalReason`, `approvedAt`, `reversedAt`,
`createdAt`, `totals{employees, grossCents, deductionsCents, netCents, employerCostsCents, provisionsCents}`,
`warnings[{message}]`, `blockingErrors[string]`. (`calculatedAt` y `parametersSnapshot` los escribe el servidor;
Conecta no los usa.)

`companies/{cid}/payslips/{mes_vN_employeeId}`: `runId`, `period`, `employeeId`, `status`,
`employee{name, taxId, email, iessNumber, position, region, expenseGroup, salaryCents, hireDate}`,
`workedDays`, `taxableCents`, `earnings`/`deductions`/`employerCosts`/`provisions` (líneas `{concept, label,
amountCents, qty?, accountCode?, loanId?}`), `netCents`, `warnings`, `errors`, `loanBalances`, `emailSent`,
`emailTo`, `emailSentAt`, `emailError`.

Respuestas que Conecta consume: `runId`, `base64`, `sent`/`failed`/`skipped`. Hoy `payroll_service.dart`
muestra `blockingErrors` (de `recalculatePayrollRun`) y `skipped`. Los nombres coinciden con lo que escribe
`payslipDoc` y `runFields`; **lo verificado es solo por lectura de código**: no se probó contra el
servidor ni en pantalla.

## 7. Cómo correr las pruebas

**Unitarias** (desde `functions/`; en esta máquina `node_modules` no trae jest, instalar primero):

```bash
cd functions
npm install
npx jest src/__tests__/payroll-run-logic.test.ts src/__tests__/payroll-calc.test.ts
```

Verificado el 2026-11-10: **57/57** (43 de cálculo + 14 de lógica de E3).

**Integración** contra el emulador de Firestore (llama a las callables de verdad con `handler.run`, proyecto
`demo-facturaec`; no toca producción). Desde la raíz del repo:

```bash
firebase emulators:exec -c firebase.rules-test.json --only firestore \
  --project demo-facturaec "functions/node_modules/.bin/jest -c test/payroll/jest.config.js"
```

> ⚠️ **Aviso: solo si tu Java por defecto es menor que 21** (`java -version`). El emulador no arranca.
> Instala el 21 aparte (`brew install openjdk@21`, no entra al PATH) y antepón esto al comando:
> ```bash
> JAVA_HOME=/opt/homebrew/opt/openjdk@21 PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH \
> firebase emulators:exec ...
> ```
> No agregues el `export PATH=…openjdk@21…` a `~/.zshrc`: cambiaría el Java por defecto. Ver
> `docs/NOMINA_E2.md` §4.

Verificado el 2026-11-10: **4/4**, en `test/payroll/payroll-cycle.it.test.ts`:

1. Roles denegados (`seller`, `super_admin`, admin de otra empresa).
2. Alta de empleado (solo si la persona es empleado; contador `totalPayrollEmployeesActive` = 1; `salaryHistory`).
3. Novedades → crear → no se puede crear dos veces el mismo mes → aprobar (asiento **1.411,53 por lado**,
   `automatic`/`payroll`, sin nombres en las líneas, `parametersSnapshot.sbu` = 482) → segunda aprobación
   rechazada → novedades rechazadas con el mes aprobado → PDF (empieza con `%PDF`) → reversar (exige motivo;
   original `cancelled`) → crear v2 con `supersedesRunId` y recalcular.
4. Con el ejercicio cerrado, no se reversa y el asiento sigue `posted`.

**Lo que NO se probó:** `sendPayslipEmails` (necesita SMTP real y `@google-cloud/secret-manager`, que no está
en `functions/node_modules`), nada en pantalla, nada desplegado. Tampoco hay prueba de aprobaciones
**simultáneas** (solo la secuencial), ni de rol de borrador con préstamos, ni del PDF más allá de la firma.

## 8. Orden de despliegue (cuando el usuario lo ordene; NO se ejecutó nada)

Plan §11: la regla antes que la pantalla, los scripts después de las reglas, las callables al final.

1. Commit y push archivo por archivo (`functions/lib` y `functions/node_modules` traen ruido conocido).
   Corre antes las pruebas de §7.
2. **Reglas** (E2): `firebase deploy --project accounting-system-a5c9f --only firestore:rules,storage`.
3. **Scripts de E2**, en seco y luego `--apply` (`gcloud auth application-default login`):
   `seed-payroll-module` y `scripts/grant-payroll-permissions.js` (pasos exactos en `NOMINA_E2.md` §5).
   ⛔ No `seed-modules.ts` ni `seed-plans.ts`.
4. **Functions de E2** que cambiaron: `functions:checkPlanLimit,functions:setupCompany`.
5. **Publicar `payrollParameters` 2026.** Aún **no hay script** (ver §9). Sin una versión `published` y
   vigente, `createPayrollRun` y `approvePayrollRun` fallan con «No hay parámetros de nómina publicados».
6. **Tanda 14-nomina** (la agregó `deploy-node22.sh`):
   ```bash
   firebase deploy --project accounting-system-a5c9f --only functions:upsertPayrollEmployee,functions:savePayrollNovelties,functions:createPayrollRun,functions:recalculatePayrollRun,functions:approvePayrollRun,functions:reversePayrollRun,functions:getPayslipPdf,functions:sendPayslipEmails 2>&1 | tee deploy-node22-14-nomina.log
   ```
7. **Encender `pkg_hr` en LEANDRO LEÓN** (primera prueba, plan §11) con `portalSetAddon`.
8. **Subir `employeesTotal` del plan** de esa empresa (con `portalUpsertPlan`): los planes
   Emprendedor, PYME y Profesional traen `0` en `seed-plans.ts`; con 0 el alta de empleados se rechaza, y una
   empresa sin `planLimits` tampoco pasa.
9. Conecta (hosting `conectate-1app`) después, E4: revisar el último release y anotar rollback.

## 9. Pendientes y riesgos

- ~~Falta `seed-payroll-parameters.ts`~~ → **hecho (2026-11-10), sin correr en producción.**
  `scripts/seed-payroll-parameters.ts` crea `payrollParameters/2026_v1` con los valores del plan §4.1 y su
  fuente. Sin el documento publicado, ninguna nómina se calcula. Modos:
  - sin opciones: en seco, no escribe;
  - `--apply`: borrador, con `iecePct`, `secapPct` y `hoursDivisor` en `null` (plan §4.3);
  - `--with-criteria`: llena esos tres con el criterio del plan (0,5 / 0,5 / 240), **pendiente de Jessica (L1, L3)**;
  - `--publish`: publica; se niega si queda algún `null`, y nunca edita una versión ya publicada (para cambiar un
    valor: `--version 2 --valid-from AAAA-MM-DD`).

  Probado contra el emulador: en seco, borrador, rechazo al publicar con `null`, publicación con criterio y
  rechazo al editar la publicada. `tsc` avisa que no encuentra los tipos de Node desde la raíz; el JS sale igual
  (lo mismo que `seed-establishments.ts`). Comando completo en la cabecera del script.
- **`sendPayslipEmails` sin probar** (SMTP real y `@google-cloud/secret-manager`). El correo sale en claro.
- **`payrollGroups` y `payrollLoans` no tienen callable de alta**: solo se **leen** (cuentas por grupo, cuotas y
  saldos). Hay que crearlos a mano o con script hasta que se hagan (D-N10 y D-N12 quedan para después).
- **`payrollBonusRuns`** (pago de décimos, D-N11): sin callable. `payroll-bonus.ts` calcula, pero nadie lo invoca.
- **Recalcular y aprobar recalculan con lo vigente** (parámetros, empleados, novedades, préstamos activos de
  ese momento). Lo que ve la persona en el borrador puede diferir de lo que se aprueba. El cálculo de aprobar
  corre **antes** de la transacción: una novedad guardada entre medias no se detecta.
- **`rewritePayslips` no es transaccional** (`bulkWriter`, fuera de la transacción). Es un borrador, pero
  si falla tras crear la nómina queda un borrador sin roles: se arregla con «Recalcular».
- **`totalPayrollEmployeesActive`**: lo mantiene `upsertPayrollEmployee` recontando los activos dentro de la
  transacción (`count()`), por lo que se **autocorrige**, pero solo al llamarla; las empresas con empleados
  cargados por otra vía no lo tienen. El cupo se calcula con ese conteo, no con el campo. `computeRun` lee un
  máximo de 1000 empleados (`limit(1000)`).
- Aviso de pago manual (D-N6): ~~no está~~ → **está en Conecta**: el diálogo de reversa (`payroll_run_actions.dart`, `reversarNomina`) advierte que un pago ya hecho no se revierte solo. El servidor no lo sabe (D-N6: la v1 no registra el pago).
- No hay candado propio de **pago** ni «Marcar pagada»: fuera de E3.
- El asiento se crea con `createdBy: 'system'` (el usuario queda en `approvedBy` de la nómina).
- Pendientes de criterio con Jessica Zari: `NOMINA_E2.md` §6, §10 y §11.

## 10. Discrepancias con el plan

1. **Reversa con `invertLines`, no `invertEntryLines`.** El plan §5.3 nombra `invertEntryLines`
   (`generate-reversal-entry.ts`). El código usa `invertLines` y `sumSide` de
   `accounting/advances/advance-logic.ts`, porque trabajan sobre las líneas en dólares del asiento. Mismo
   resultado verificado en el integrado (la reversa suma 1.411,53 y cuadra).
2. **Novedades en `draft`.** El plan §5.4 dice «en un mes en `draft`»; el código solo rechaza el mes
   `approved` (permite guardar novedades sin nómina abierta o con la anterior reversada, que es lo natural
   para cargarlas antes de crear la nómina).
3. **Aceptación §8 E3, no cubierta tal cual:** (a) «dos aprobaciones concurrentes» solo se probó en secuencia;
   (b) «PDF sin URL pública» se cumple por diseño (no hay `makePublic()` ni URL) pero no se comprobó contra
   Storage; (c) `accounting-auditor` **no** ha confirmado el asiento; (d) «correo fallido deja `emailError`»
   está en el código y no se probó.
4. **Aviso de pago** (§5.3, último punto): no implementado.
5. **Conciliación**: se mira `bank_reconciled_entries/{id}`, como pide el plan; no hay prueba de ese caso.
6. **El código de la nómina por rol sin `payrollBonusRuns`**: el plan §3.3 (D-N11) lo contempla en la primera
   versión; E3 no lo expone.


## 11. Correcciones tras la revisión independiente de E3 (2026-11-10)

Una revisión de solo lectura de las callables encontró estos problemas; todos corregidos y probados.

| # | Problema | Corrección |
|---|---|---|
| 1 | Un «Recalcular» lento podía reescribir en borrador los roles de una nómina que otra persona acababa de aprobar | Crear y recalcular escriben los roles **dentro de la transacción** que vuelve a leer la nómina y exige `draft` (se quitó el `bulkWriter`) |
| 2 | Aprobar no veía una novedad o un empleado guardados durante el cálculo | Contador `companies/{cid}.payrollInputsSeq`: lo suben `savePayrollNovelties` y `upsertPayrollEmployee`; crear, recalcular y aprobar lo leen antes de calcular y lo comparan en su transacción («vuelve a intentarlo») |
| 3 | Dos altas simultáneas podían pasar el cupo de empleados | `upsertPayrollEmployee` lee la empresa dentro de la transacción: dos altas chocan y la segunda se reintenta con el conteo nuevo |
| 4 | Editar un empleado desde Conecta borraba `priorServiceDays` y `groupId` (Conecta no los manda) | Solo se escriben si vienen en la entrada |
| 5 | Reversar y reemitir un mes pasado usaba el sueldo de hoy | `salaryAt`: el sueldo vigente el último día del mes según `salaryHistory` |
| 6 | Con más de 1000 fichas se perdían empleados activos sin aviso | Dos consultas de un campo (`isActive == true` y `endDate >= inicio del mes`); al llegar al tope, error claro |
| 7 | Se podía abrir o aprobar un mes futuro | `futurePeriodProblem` (hora de Ecuador) |
| 8 | Reversa: sin comprobar `posted`; fecha en UTC y posible fecha anterior al asiento | Exige `posted`; `reversalDate` en hora de Ecuador y nunca antes del asiento |
| 9 | El PDF de un rol reversado parecía válido | Marca «REVERSADO — SIN VALIDEZ» |
| 10 | Reintentar el envío duplicaba correos; el log podía guardar la dirección | Se saltan los ya enviados (salvo `resend: true`, devuelve `alreadySent`); el log guarda solo el código |
| 11 | Reversar reactivaba un préstamo cancelado a mano | Solo vuelve a `active` el que estaba `paid` |

Sin corregir, anotado: `PayrollLoanInput` no tiene mes de inicio (reemitir un mes pasado descontaría un
préstamo concedido después); se resuelve con las callables de préstamos. El tamaño de la transacción de
aprobación (copia de parámetros por rol) está bien para el cupo actual; medirlo si se sube mucho.

Pruebas tras las correcciones: Jest **61/61** (4 nuevas) e integración contra el emulador **5/5** (nueva:
editar no borra días previos ni grupo, y diciembre todavía no se abre).
