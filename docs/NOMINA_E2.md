# Nómina (Ecuador) — Etapa E2: datos, reglas, módulo y cálculo puro

> Estado al **2026-11-10**: todo lo de esta página está **en el árbol de trabajo, SIN commit y SIN
> desplegar**, en la rama `feat/nomina_conectate`. Nada de esto se ha ejecutado contra producción.
>
> El plan oficial vive en el repo del panel (`weworkscloud`, rama `feat/contabilidad-usuarios`):
> `docs/PLAN_NOMINA.md`. Este documento lo cita como «plan §N» y «D-N N». **No reabre decisiones
> cerradas**; explica qué se hizo, por qué y cómo seguir.

## 1. Qué es E2 y por qué va antes de E3 y E4

La nómina se construye en etapas (plan §8). E2 es la **base de datos, de seguridad y de cálculo**:

| Etapa | Qué entrega | Estado |
|---|---|---|
| E1 | Sueldos fuera de `personas` | En producción (`3a02814`) |
| **E2** | Colecciones y reglas, módulo `payroll` y paquete `pkg_hr`, permisos, cupo de empleados, cálculo puro, asiento, décimos y préstamos | **Hecha en código, sin commit** |
| E3 | Callables (`createPayrollRun`, `approvePayrollRun`, …), PDF y correo | Pendiente |
| E4 | Pantallas en Conecta | Adelantada en parte (ver §9) |

**Por qué E2 va primero.** Las callables de E3 no tienen sobre qué escribir si las colecciones no
existen, y la regla por defecto de Firestore deja **leer a todo miembro y escribir a `admin`,
`seller` y `cashier`** cualquier colección que no esté declarada (plan §6.1). Si se hubiera escrito
una pantalla o una callable antes, los sueldos habrían quedado expuestos. Además, el cálculo es una
**función pura** (sin Firestore): se prueba entera con casos a mano antes de que ninguna callable
dependa de ella. Orden de seguridad del plan: la regla antes que la pantalla (plan §11).

Lo que **no** hace E2: no hay ninguna callable (`functions/src/index.ts` no se tocó), no se publicó
ningún documento `payrollParameters`, no se cambió `scripts/deploy-node22.sh`.

## 2. Paso a paso: qué se tocó y por qué

### Paso 1 — Colecciones y reglas

| Archivo | Qué cambió | Por qué |
|---|---|---|
| `firestore.rules` → `hasOwnRules()` | Suma `payrollEmployees`, `payrollGroups`, `payrollNovelties`, `payrollPeriods`, `payrollRuns`, `payslips`, `payrollBonusRuns`, `payrollLoans` | Plan §6.2 y §6.1: excluirlas de la regla por defecto `match /{collection}/{id}`, que las dejaría escribibles. El plan lista 5; se agregaron 3 por §3.3 (D-N10 grupos, D-N11 décimos, D-N12 préstamos) |
| `firestore.rules` → `canReadPayroll()` | `hasRole('admin') \|\| isAccountant()` | D-N2: solo `admin` y `accountant` |
| `firestore.rules` → `match` por colección (bajo `companies/{companyId}`) | `allow read` con `isAuthenticated() && belongsToCompany(companyId) && canReadPayroll()`; `allow write: if false` | Plan §5.1: **solo escribe el servidor**. Los tokens de `super_admin` y `channel_admin` no llevan `companyId`, así que `belongsToCompany` los deja fuera (consecuencia aceptada de D-N2) |
| `firestore.rules` → raíz `payrollParameters/{id}` | `read` con sesión; `write: if false` | Plan §4.3: parámetros legales nacionales y versionados, no son datos de nadie; los publica un script de plataforma |
| `storage.rules` | `companies/{companyId}/payroll/{allPaths=**}` con `read, write: if false` | Plan §5.5 y §6.2: los PDF de roles no se leen ni se suben desde el navegador. Sin la regla ya estaría negado; se escribe para que quede explícito |

Cómo son las colecciones (campos) está en el plan §5.1; E2 **no las crea** (están vacías hasta E3).
Solo las deja protegidas.

### Paso 2 — Pruebas de reglas

| Archivo | Qué prueba |
|---|---|
| `test/rules/test.js` (bloque «nómina», al final) | Para cada una de las 8 colecciones: `get` y `list` por separado. Leen: `admin` y `accountant`. **No** leen: `seller`, `cashier`, `read_only`, `super_admin`, `channel_admin` y un admin de otra empresa. Nadie (ni el admin) crea, edita ni borra. `payrollParameters`: lo lee cualquier sesión, no se lee sin sesión, ni admin ni super admin lo escriben. Un `seller` sigue editando una persona sin datos de nómina |
| `test/rules/storage-test.js` | `companies/c1/payroll/...`: admin, contador, cajero, super admin y otra empresa reciben 403 al leer y al subir |

Por qué: plan §6.3 pide «operación real» y `get`/`list` separados; el README de `test/rules` explica
que las reglas se suman por OR y que la regla por defecto anularía cualquier restricción si una
colección con `match` propio no está en `hasOwnRules()`. Estas pruebas fijan justamente eso.
Las pruebas de `salary` en `personas` ya eran de E1 (`test.js` ~l. 785-794).

### Paso 3 — Módulo `payroll`, paquete `pkg_hr`, permisos y scripts

| Archivo | Qué cambió | Por qué |
|---|---|---|
| `src/app/core/seed/modules-seed.ts`, `scripts/seed-modules.ts` | Módulo `payroll` (`order: 55`, depende de `accounting`, `showInMenu: false`) | Plan §6.4: instalaciones nuevas. `showInMenu: false` hasta E5: la web aún no tiene `features/payroll` y el ítem apuntaría a una ruta inexistente. Conecta arma su menú aparte |
| `src/app/core/seed/plugin-packages-seed.ts`, `scripts/seed-plans.ts` | Paquete `pkg_hr`, `modules: ['payroll']`, `dependencies: ['pkg_accounting']`, `price: 0` | D-N9: paquete aparte, encendido con `portalSetAddon` |
| `src/app/core/services/permissions.service.ts` (`ROLE_MATRIX`) | `payroll` CRUD completo en `admin`; `read/create/update` en `accountant`; **no** en `super_admin` (comentario explícito) | D-N2 y plan §6.4 |
| `src/app/core/services/roles.service.ts` | `payroll.view/create/edit/delete` en `DEFAULT_SYSTEM_ROLES` (admin) y en el admin de `COMPANY_DEFAULT_ROLES`; `view/create/edit` en el contador | Espejo de la matriz, para roles que se siembran |
| `functions/src/tenants/setup-company.ts` | `payroll.view/create/edit` al `accountant` en `COMPANY_DEFAULT_ROLES` | Empresas **nuevas** nacen con el permiso (plan §6.4). Ojo: el plan §12 avisó de un cambio ajeno sin commit en este archivo (RUC único); el diff de E2 son solo estas 2 líneas, pero **confirmar con su autor** antes de commitear |
| `scripts/seed-payroll-module.ts` | Crea `/modules/payroll` y `/plugin-packages/pkg_hr` **solo si faltan**, en seco por defecto, `--apply` para escribir | Plan §6.4: ⛔ no correr `seed-modules.ts`/`seed-plans.ts` (pisan ajustes del super admin). No enciende el paquete en ninguna empresa |
| `scripts/grant-payroll-permissions.js` | Suma permisos con `arrayUnion` a `/roles/admin`, `companies/{cid}/roles/admin` (4 permisos) y `companies/{cid}/roles/accountant` (3). No quita nada ni toca otros roles. En seco por defecto | Empresas **existentes** guardan su copia del rol, que manda sobre la matriz (plan §6.1). Patrón de `grant-accountant-suppliers.js` |

### Paso 4 — Cupo de empleados (`employeesTotal`)

| Archivo | Qué cambió | Por qué |
|---|---|---|
| `functions/src/tenants/check-plan-limit.ts` | Tipo `employees`: `companyField: 'totalPayrollEmployeesActive'`, `limitPath: ['masterData','employeesTotal']` | Plan §1 fila 9 y §6.4: hoy `checkPlanLimit` no conocía ese límite |
| `functions/src/payroll/payroll-limits.ts` | `employeeLimitDecision(planLimits, currentActive)` puro: `-1` ilimitado, `0` deshabilitado, `>0` tope; **sin `planLimits` → NO permite** | Plan §6.4: `checkPlanLimit` deja pasar a una empresa heredada sin `planLimits` (`allowed: true`); la nómina es nueva y exige cupo explícito |

⚠️ Dos cosas que **no están conectadas todavía** (son de E3): (1) nadie llama a
`employeeLimitDecision`; lo usará `upsertPayrollEmployee`. (2) El contador
`totalPayrollEmployeesActive` en el documento de la empresa **nadie lo mantiene aún**.

### Paso 5 — Cálculo puro y asiento (`functions/src/payroll/`)

| Archivo | Responsabilidad |
|---|---|
| `payroll-types.ts` | Tipos: `PayrollParameters` (plan §4.3), empleado, novedades, préstamos, `PayslipResult`, rótulos `CONCEPT_LABELS` (los de MDT-2015-0087, Disp. Gen. Segunda) |
| `payroll-dates.ts` | Mes de 30 días (L4), `dayOnScale30` (ingresar el último día de un mes corto cuenta como día 30, convención 30/360; también para el día en que nace el derecho a fondos), `monthSpan`, `reserveFundDays` (L8, art. 196-197), periodos del 13.º y 14.º, `pickParameters` (versión publicada y vigente el **último día** del mes, mayor versión; sin ninguna → `null`) |
| `payroll-calc.ts` | `calculatePayslip`: el rol de un empleado en un mes (plan §4.4). Todo en centavos; `roundCents` = mitad hacia arriba. `missingParameters` / `PayrollParametersError` si algún valor es `null` (ahora también exige `overtime.maxPerDay` y `vacation.baseDays`). Valida `hireDate`/`endDate` con `parseYmd`: si fallan lanza `PayrollEmployeeDataError`. El tope del art. 90 suma los anticipos y las cuotas de `longTermAdvance` |
| `payroll-entry.ts` | `buildPayrollEntryLines`: asiento agregado por cuenta, sin nombres de empleado (plan §5.2). `DEFAULT_PAYROLL_ACCOUNTS` son **solo sugerencias** (D-N10); `PayrollEntryError` si falta una cuenta. Una clave de cuenta por tipo de préstamo (`companyLoan`, `longTermAdvance`, `iessQuirografario`, `iessHipotecario`, elegida con `loanType`): los del IESS no caen en la cuenta de préstamos de la empresa; `longTermAdvance` cae a `advances` si está vacía. Claves `commissions`, `bonuses` y `nonTaxableIncome` caen a `otherTaxable`; `otherDeductions` es respaldo cuando la novedad no trae cuenta. No toca `DEFAULT_CODES` (plan §5.2 lo prohíbe) |
| `payroll-bonus.ts` | **Décimos** (D-N11): `bonusLine` ya **no** suma las provisiones: el 13.º = lo percibido en los meses acumulados / 12; el 14.º = SBU vigente al pagar (`sbuCentsAtPayment`) × días trabajados acumulados / 360. Devuelve `provisionedCents` y `adjustmentCents` (la diferencia va al gasto). Saldo negativo o falta de SBU → error |
| `payroll-limits.ts` | Cupo de empleados (paso 4) |
| `functions/src/__tests__/payroll-calc.test.ts` | 41 pruebas: los 15 casos de E2 del plan (el 15 compara cuenta por cuenta), más fechas inválidas, último día de febrero, reingreso con derecho a mitad de mes, enero de 2027 con SBU 500, anticipo a largo plazo, décimos con 12 meses exactos, préstamos (D-N12) y cupo |

**Préstamos (D-N12)** viven dentro de `calculatePayslip`: cada préstamo activo (`balanceCents > 0`)
del empleado descuenta `min(cuota, saldo)` como línea `loan` y devuelve `loanBalances` con el saldo
resultante. La callable de E3 deberá guardar ese saldo al aprobar y restaurarlo al reversar, en la
misma transacción.

**Reglas del cálculo que el código aplica** (y su regla del plan §4.4): jornada `partial` → error
(regla 5, L7); sueldo menor al SBU → error; anticipos sobre el `advanceCapPct` % → error con mensaje
(regla 3); horas suplementarias sobre el tope → **aviso**, no error (regla 4); neto negativo →
error; 13.º/14.º/fondos `accumulated` → provisión, no suman al neto (regla 1). Un `PayslipResult`
con `errors` no debe aprobarse; con `warnings` sí.

## 3. Cómo fluye un rol de pago (de punta a punta)

Hoy los pasos 1 y 6-7 ocurren **solo dentro de las pruebas**; las callables que los orquestan son E3.

1. **Novedad.** El contador registra novedades del mes (`payrollNovelties`): horas, comisiones,
   anticipos, permisos sin sueldo… (E3: `savePayrollNovelties`). Cada una es un `PayrollNoveltyInput`.
2. **Parámetros.** El servidor elige con `pickParameters(todos, año, mes)` la versión publicada y
   vigente el último día del mes. Sin versión (p. ej. enero de 2027, L9) la nómina se rechaza.
3. **Cálculo por empleado.** `calculatePayslip({ params, year, month, employee, novelties, loans })`:
   días trabajados → sueldo → horas extra → ingresos gravados → costo del empleador y provisiones →
   descuentos → neto. Devuelve `null` si no trabajó ningún día del mes.
4. **Totales y avisos** de la nómina (suma de los `PayslipResult`; los `errors` bloquean).
5. **Asiento.** `buildPayrollEntryLines(payslips, accountsFor)` agrega por cuenta y lado. Cuadra por
   construcción porque todo está en centavos ya redondeados por empleado.
6. **Aprobación (E3).** Una transacción reclama `payrollPeriods/{YYYY-MM}`, congela los roles con
   `parametersSnapshot`, crea el asiento (`type: 'automatic'`, `source: 'payroll'`) y valida cada
   cuenta con `accountProblem`. Ciclo `draft → approved → reversed` (plan §5.3).

### Ejemplo de plan §4.5 (noviembre 2026, Sierra, sueldo 1.000,00, 5 h suplementarias, anticipo 100,00)

La prueba «caso 1» lo comprueba al centavo (con `iecePct` = `secapPct` = 0,5, divisor 240):

| Concepto | Cálculo | USD |
|---|---|---:|
| Sueldo | 1.000,00 × 30/30 | 1.000,00 |
| Horas suplementarias | 5 × (1.000/240) × 1,5 | 31,25 |
| **Ingresos gravados** | | **1.031,25** |
| 13.º mensual | 1.031,25 / 12 | 85,94 |
| Fondos mensuales | 1.031,25 × 8,33 % | 85,90 |
| Aporte personal | 1.031,25 × 9,45 % | (97,45) |
| Anticipo (tope 10 % = 103,12) | | (100,00) |
| **Neto** | 1.031,25 + 85,94 + 85,90 − 97,45 − 100,00 | **1.005,64** |
| Patronal 11,15 % / IECE / SECAP | 114,98 / 5,16 / 5,16 | 125,30 |
| Provisión 14.º (acumulado) | 482 / 12 | 40,17 |
| Provisión vacaciones | 1.031,25 / 24 | 42,97 |

Asiento (**1.411,53 a cada lado**): Debe — 5.2.01.001 Sueldos 1.000,00; 5.2.01.002 Horas extras 31,25;
5.2.01.003 13.º 85,94; 5.2.01.004 14.º 40,17; 5.2.01.005 Fondos 85,90; 5.2.01.006 Vacaciones 42,97;
5.2.01.007 Patronal+IECE+SECAP 125,30. Haber — 2.1.01.003 Neto 1.005,64; 1.1.02.002 Anticipos 100,00;
2.1.04.006 Aporte personal 97,45; 2.1.04.007 Patronal+IECE+SECAP 125,30; 2.1.03.002 Provisión 14.º
40,17; 2.1.03.003 Provisión vacaciones 42,97. Sin L1 (IECE/SECAP) serían 1.401,21.

## 4. Cómo correr las pruebas

**Cálculo (Jest).** Desde `functions/`:

```bash
cd functions
npm install          # en esta máquina functions/node_modules NO trae jest ni ts-jest
npx jest src/__tests__/payroll-calc.test.ts
```

Verificado el 2026-11-10 en una **copia aparte** (jest 29 + ts-jest 29, misma configuración de
`functions/package.json`): **41 pruebas, 41 en verde** (re-verificado tras las correcciones de la revisión independiente). No se corrió dentro de `functions/` por falta
de las dependencias de desarrollo. El archivo se llama `.test.ts` (no `.spec.ts` como dice el plan)
porque la configuración de Jest solo recoge `**/__tests__/**/*.test.ts`.

**Reglas de Firestore y Storage** (desde la raíz del repo; el emulador exige **Java 21 o superior**):

```bash
# Firestore (puerto 8181)
firebase emulators:exec -c firebase.rules-test.json --only firestore \
  --project demo-facturaec "node test/rules/test.js"

# Storage (puerto 9299)
firebase emulators:exec -c firebase.storage-rules-test.json --only storage \
  --project demo-facturaec "node test/rules/storage-test.js"
```

> ⚠️ **Aviso: solo si tu Java por defecto es menor que 21** (`java -version`). El emulador no
> arranca. Sin cambiar el Java de la máquina, instala el 21 aparte (`brew install openjdk@21`, que
> no entra al PATH) y antepón esto a cada comando de arriba:
>
> ```bash
> JAVA_HOME=/opt/homebrew/opt/openjdk@21 PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH \
>   firebase emulators:exec ...
> ```
>
> No agregues a `~/.zshrc` el `export PATH=…openjdk@21…` que sugiere Homebrew: cambiaría el Java
> por defecto. Con Java 21 o superior ya instalado como predeterminado, no hace falta nada de esto.

✅ **Corridas el 2026-11-10:** Firestore **740/740** (252 de nómina) y Storage **24/24** (10 de
roles de pago). Las pruebas que ya existían siguen en verde.

## 5. Orden de despliegue (cuando el usuario lo ordene; NO se ha ejecutado nada)

Plan §11: **la regla antes que la pantalla**; los scripts van después de las reglas.

1. **Commit y push por archivo** (`git add` archivo por archivo: `functions/lib` y
   `functions/node_modules` traen ruido conocido). Correr antes las pruebas de §4.
2. **Reglas:** `firebase deploy --project accounting-system-a5c9f --only firestore:rules,storage`
  .
3. **Scripts, en seco primero y luego `--apply`** (cuenta de gcloud, sin claves descargadas;
   `gcloud auth application-default login`):
   ```bash
   # módulo y paquete (ver cabecera del script para la compilación con tsc)
   NODE_PATH=functions/node_modules node /tmp/seed/scripts/seed-payroll-module.js           # en seco
   NODE_PATH=functions/node_modules node /tmp/seed/scripts/seed-payroll-module.js --apply
   # permisos de admin y contador en las empresas existentes
   NODE_PATH=functions/node_modules node scripts/grant-payroll-permissions.js               # en seco
   NODE_PATH=functions/node_modules node scripts/grant-payroll-permissions.js --apply
   ```
   ⛔ **No correr `seed-modules.ts` ni `seed-plans.ts`.** Es idempotente; revisar la salida en seco
   antes de cada `--apply`.
4. **Functions** (las dos que cambiaron; ambas ya están en la tanda 1 de `scripts/deploy-node22.sh`):
   `firebase deploy --project accounting-system-a5c9f --only functions:checkPlanLimit,functions:setupCompany`.
   Las callables de nómina (E3) se despliegan después, en una tanda nueva que hay que sumar a
   `deploy-node22.sh` (plan §11).
5. Conecta (hosting `conectate-1app`) **no** forma parte de E2 (plan §11: E4).

## 6. Decisiones y supuestos a confirmar

(a) **Precio de `pkg_hr` en 0.** Tanto en `plugin-packages-seed.ts` como en `seed-plans.ts`
(`price: 0`, con comentario «decisión comercial pendiente»; plan §6.4 lo deja como decisión
comercial). Hay que fijarlo antes de ofrecerlo.

(b) **`pkg_hr` depende de `pkg_accounting`.** El plan §6.4 no lo dice explícitamente; se puso porque
aprobar una nómina crea un asiento en el ejercicio abierto. Además el módulo `payroll` depende de
`accounting`. Confirmar que es lo que se quiere vender.

(c) **Horas nocturnas pagan solo el recargo del 25 %.** En `payroll-calc.ts` el factor de
`nightShift` es `nightShiftPct/100` (no `1 + nightShiftPct/100`): 8 h × 5,00 × 0,25 = 10,00 (prueba
caso 11). Se hizo así porque, según el art. 49 del Código del Trabajo, esas horas ya están pagadas
en el sueldo y la ley solo agrega el recargo. **El plan §4.4 pone la fórmula genérica
`horas × hora × (1 + recargo)` para todas las horas extra**, así que esto **difiere del plan**.
Confirmar con **Jessica Zari**; si ella dice lo contrario, es cambiar una línea y rehacer el caso 11.

(d) **Tope semanal de horas aproximado.** El código calcula `maxPerWeek × díasTrabajados / 7` y avisa
(no rechaza) si las horas suplementarias (`overtime50` + `overtime100`) lo superan. Es una
aproximación: la nómina no sabe en qué semana cayó cada hora. Además: las horas de fin de semana y
nocturnas no cuentan para ese tope, y `overtime.maxPerDay` (4 al día) se **exige** como parámetro pero **no se valida por día**: las
novedades son mensuales (plan §4.4 regla 4 solo pide aviso).

(e) **Los planes traen `employeesTotal: 0`.** En `scripts/seed-plans.ts`: Emprendedor, PYME y
Profesional = **0** (RRHH no disponible); Empresarial e Ilimitado = **-1** (3 de 5 planes en 0).
Esas son las cifras del script de siembra; los valores en producción pueden diferir: confirmarlos en el panel. Con 0, `employeeLimitDecision` responde «El plan de la empresa
no incluye empleados en nómina»: una empresa que active `pkg_hr` **no podrá dar de alta empleados**
hasta subir ese límite con `portalUpsertPlan`. Y una empresa sin `planLimits` tampoco pasa.

(f) **Módulo `payroll` con `showInMenu: false` hasta E5**, para no mostrar un ítem a una ruta que no
existe en la web de FacturaEc. Hay que cambiarlo a `true` (y en la base real, editarlo desde el
panel o con script, porque `seed-payroll-module.ts` no pisa lo existente).

(g) **El `admin` tiene payroll CRUD completo** (incluido `delete`) en `ROLE_MATRIX`, `roles.service.ts`
y `grant-payroll-permissions.js`. El plan solo detalla permisos del contador (`view/create/edit`);
D-N2 dice «admin y accountant» sin desglosar. Las reglas de Firestore igual impiden escribir a todos
desde el cliente, así que `delete` solo importa para el menú y las callables.

(h) ~~Java 21 no está instalado~~ → **resuelto el 2026-11-10**: Java 21 instalado aparte (el 17
sigue por defecto) y las pruebas de reglas en verde, Firestore 740/740 y Storage 24/24. Condición de
aceptación de E2 cumplida (plan §8: «tabla §6.3 completa; suite de reglas y Jest en verde»).
Comando en §4.

## 7. Discrepancias entre el código y el plan (encontradas al verificar)

1. **Parámetros no publicados / sin script.** El plan §8 (E2) incluye «documento de parámetros» y §10.2
   menciona `seed-payroll-parameters.ts`. **No existe** ni el script ni ningún documento
   `payrollParameters`. Sin una versión `published`, `pickParameters` devuelve `null` y la nómina no
   puede calcularse. Además `iecePct`, `secapPct` y `hoursDivisor` deben quedar en `null` en el
   borrador hasta cerrar L1 y L3 con Jessica (plan §4.3); las pruebas los fijan en 0,5 y 240.
2. **Nombre de la prueba:** `payroll-calc.test.ts` en `functions/src/__tests__/`, no `payroll-calc.spec.ts`.
3. **Horas nocturnas:** ver §6 (c).
4. **`missingParameters`** ahora exige `overtime.maxPerDay` y `vacation.baseDays` (corregido en la revisión); el cálculo aún no los usa.
5. **Tope del art. 90.** D-N12 dice que sigue aplicando; el código lo aplica a los **anticipos** y a las
   cuotas de `longTermAdvance`. Los demás préstamos (empresa, IESS) se descuentan sin tope: abierto, §9 del plan.
6. **`pkg_hr` `order`:** 11 en `plugin-packages-seed.ts` y 12 en `seed-plans.ts` (cada lista lleva su
   propia numeración; cosmético).
7. **Contador sin dueño:** `totalPayrollEmployeesActive` está en `check-plan-limit.ts` pero ningún
   código lo escribe hasta E3.
8. **Bono no aportable** (`bonusNonTaxable`): suma al neto pero no a los gravados. En el asiento usa la clave
   `nonTaxableIncome`, que cae a `otherTaxable` (`5.2.01.002`) si la empresa no la separa.
9. **Ruido ajeno:** `setup-company.ts` tenía un cambio sin commit de otra persona (plan §12); verificar
   con `git diff` que lo del RUC no se mezcle con el commit de nómina.

## 8. Mapa de archivos de E2

Nuevos: `functions/src/payroll/{payroll-types,payroll-dates,payroll-calc,payroll-entry,payroll-bonus,payroll-limits}.ts`,
`functions/src/__tests__/payroll-calc.test.ts`, `scripts/grant-payroll-permissions.js`,
`scripts/seed-payroll-module.ts`.
Modificados: `firestore.rules`, `storage.rules`, `test/rules/test.js`, `test/rules/storage-test.js`,
`src/app/core/seed/{plugin-packages-seed,modules-seed}.ts`, `scripts/{seed-plans,seed-modules}.ts`,
`src/app/core/services/{permissions,roles}.service.ts`,
`functions/src/tenants/{setup-company,check-plan-limit}.ts`.

## 9. Lo que sigue (E3) y el lado de Conecta

- **E3 (FacturaEc):** callables en `functions/src/payroll/`, todas con `requirePayrollRole` (sin la
  excepción de `super_admin`): `upsertPayrollEmployee` (usa `employeeLimitDecision` y mantiene
  `totalPayrollEmployeesActive`), `savePayrollNovelties`, `createPayrollRun`, `recalculatePayrollRun`,
  `approvePayrollRun`, `reversePayrollRun`, `getPayslipPdf`, `sendPayslipEmails`; exportarlas en
  `index.ts` y sumar la tanda a `deploy-node22.sh` (plan §5.4, §11). Más: publicar el documento de
  parámetros 2026 (cuando L1 y L3 estén cerrados con Jessica).
- **Conecta** (`weworkcloudweb`, rama `feat/nomina_contabilidad`, sin commit): el menú «Nómina» con ids
  `payrollEmployees`, `payrollRuns`, `payrollParameters` y `roleMatrix` con `payroll` están en
  `lib/features/accounting/services/facturaec_access.dart`; hay pantallas adelantadas de E4 en
  `lib/features/accounting/payroll/`. Su estado está en `.claude/agents/payroll.md` de ese repo. Esas
  pantallas llaman a callables que **todavía no existen** (E3).

## 10. Correcciones tras la revisión independiente (2026-11-10) y pendientes nuevos

Cambios verificados en el código: claves de cuenta por tipo de préstamo y nuevas `commissions`,
`bonuses`, `nonTaxableIncome` (`payroll-entry.ts`); validación de fechas del empleado, tope del art. 90
con `longTermAdvance` y parámetros exigidos (`payroll-calc.ts`); `dayOnScale30` (`payroll-dates.ts`);
cálculo del décimo desde lo percibido y el SBU al pagar (`payroll-bonus.ts`). 41/41 pruebas en verde.

**A confirmar con Jessica Zari (por criterio, no por norma):**
- (i) Ingresar el último día de un mes corto cuenta como día 30 (30/360).
- (j) El 13.º se paga como lo percibido en los meses acumulados / 12 y el 14.º como SBU al pagar × días
  acumulados / 360; la diferencia con lo provisionado va al gasto (`adjustmentCents`).
- (k) **Fondos de reserva con permiso sin sueldo:** los permisos no traen fechas, así que hoy
  `fundDays = min(workedDays, días con derecho)`. Abierto.
- (l) **Tope del art. 90 para los demás préstamos** (empresa, IESS): hoy solo anticipos y
  `longTermAdvance` (§9 del plan). Y `maxPerDay` no se valida por día (novedades mensuales).

## 11. Decisiones provisionales hasta que responda Jessica Zari (2026-11-10)

Mientras no llegan las respuestas, se sigue con estos criterios. Regla usada: **en la duda, no
pagarle de menos al trabajador** (pagar de menos expone a reclamos; unos centavos de más son solo
costo). **Ninguna es definitiva:** si Jessica responde otra cosa, se cambia en el lugar indicado y se
rehace su prueba. Los puntos (i) a (l) están en el §10; las 19 preguntas generales, en el §9 del plan.

| Punto | Decisión provisional | Si Jessica dice otra cosa, se cambia en |
|---|---|---|
| (i) Ingreso el último día de un mes corto | Cuenta **1 día** (30/360), igual que la salida ese día cuenta el mes entero | `payroll-dates.ts`, `dayOnScale30` (para 3 días: `Math.min(30, p.d)`) y su prueba «ingresar el último día de un mes corto» |
| (j) Pago del décimo acumulado | 13.º = lo percibido en los meses acumulados / 12; 14.º = **SBU vigente al pagar** × días / 360. La diferencia con lo provisionado va al gasto | `payroll-bonus.ts`, `bonusLine` (para pagar lo provisionado: `amount = provisioned`) y las pruebas de décimos |
| (k) Fondos con permiso sin sueldo | Se mantiene `fundDays = min(días trabajados, días con derecho)`: puede pagar de más, nunca de menos. **Aviso** en la nómina cuando coinciden el aniversario y un permiso | `payroll-calc.ts` (bloque «Provisional … punto k»). Si se necesitan las fechas del permiso, agregar `from`/`to` a la novedad `unpaidLeave` |
| (l) Tope del 10 % (art. 90) | **Rechaza** solo anticipos del mes + cuotas de anticipo a largo plazo. Con las cuotas de préstamos de empresa e IESS **avisa**, no rechaza (los del IESS los ordena el IESS) | `payroll-calc.ts` (bloque «Provisional … punto l»): para rechazar, pasar el aviso a `errors` |
| (l) Tope diario de horas extra | No se valida por día: las novedades son el total del mes; aviso con el tope semanal aproximado | Requeriría registrar horas por día (otro módulo: asistencia) |

Los avisos no cambian ningún monto: aparecen en `warnings` del rol y la pantalla de la nómina los
muestra antes de aprobar. Pruebas: 43/43 en verde (las dos nuevas: «(k)» y «(l)»).
