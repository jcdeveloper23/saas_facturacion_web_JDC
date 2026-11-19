# Nómina (Ecuador) — Ficha del colaborador y aporte IESS asumido

> 2026-11-18 · rama `feat/nomina_conectate` · **sin desplegar**. Punto 4 de lo que faltaba frente al sistema actual
> (formulario «Colaborador»). Antes: `NOMINA_DECIMOS.md`.

## 1. Aporte personal asumido por la empresa (`assumesIessPersonal`)

Con el check **«Asumir aporte IESS»**, el 9,45 % del aporte personal **no se descuenta al empleado**: lo paga la empresa.

- El rol no lleva la línea `iessPersonal` en descuentos; lleva `iessPersonalAssumed` («Aporte personal IESS asumido por
  la empresa») en **costo del empleador**. El neto sube en ese valor.
- Asiento: **Debe** `assumedIessExpense` («Gasto aporte personal asumido»; si la empresa no la configura, cae a
  `employerCostExpense`) / **Haber** `iessPersonalPayable` (lo que se le debe al IESS es lo mismo).
- ⚠️ **Criterio provisional, a confirmar con Jessica Zari**: (a) si el aporte asumido se suma a la base del impuesto a la
  renta del empleado (para E6); (b) si lo quiere en una cuenta de gasto propia (ya se puede configurar en Cuentas).

Nueva clave de cuentas: `assumedIessExpense` (25 en total; sin sugerida, cae a `employerCostExpense`).

## 2. Ficha del colaborador (`payrollEmployees`, campos planos)

| Campo | Tipo | Notas |
|---|---|---|
| `assumesIessPersonal` | booleano | §1. Cambia el cálculo |
| `disabilityPct` | entero 0–100 | Para el impuesto a la renta (E6) y el cupo de inclusión |
| `familyDependents` | entero 0–30 | Cargas familiares: para el IR (E6) |
| `birthDate` | `AAAA-MM-DD` o `''` | |
| `sex` | `'M'` \| `'F'` \| `''` | |
| `maritalStatus` | `single, married, divorced, widowed, freeUnion` \| `''` | Soltero, casado, divorciado, viudo, unión libre |
| `bloodType` | texto (5) | |
| `address`, `phone`, `mobile` | texto (200, 30, 30) | |
| `education` | `none, primary, secondary, technical, university, postgraduate` \| `''` | Ninguna, primaria, secundaria, técnica, superior, posgrado |
| `title` | texto (120) | Título |
| `bankName`, `bankAccountType` (`savings`\|`checking`) | texto (80) / lista | Junto al `bankAccount` que ya existía |
| `notes` | texto (500) | Observación |
| `collaboratorType` | `shareholder, regular, intern, partTime, construction` \| `''` | Los del sistema actual: Accionistas, Comunes, Pasantes, Tiempo parcial, Construcción. **Solo clasifica**: no cambia el cálculo (la jornada parcial sigue sin calcularse, L7) |
| `description` | texto (500) | Descripción |

Van en el mismo `employee` de `upsertPayrollEmployee`. **Solo se escriben los que vienen**: una pantalla que no los
manda no los borra (como `groupId` y `priorServiceDays`). Un texto vacío borra el valor.

**No se agregó:**
- **«Es freelance»**: un freelance no está en relación de dependencia (factura sus servicios): no va en la nómina.
- **Cargo**: sigue en la persona (`personas.employeeData.position`, D-N8).
- **Tipo e identificación, nombres, apellidos, correo**: siguen viviendo en la persona, pero ahora se escriben desde la nómina (§5).
- **Código IESS**: ya existía (`iessNumber`).

## 3. Pruebas

- Jest: **130/130** de nómina (`payroll-employee-profile.test.ts`, nuevo: neto +9,45 %, costo del empleador, asiento
  que cuadra y su caída de cuenta, validación de la ficha).
- Integración: **14/14** (la ficha se guarda plana y editar sin los campos no los borra).

## 4. Despliegue

Tanda `18-nomina-colaborador` de `scripts/deploy-node22.sh` (sin reglas nuevas): `upsertPayrollEmployee` y las que
calculan (`createPayrollRun`, `recalculatePayrollRun`, `approvePayrollRun`) y `savePayrollAccounts` (clave nueva).

## 5. Alta del colaborador con sus datos (2026-11-19)

Como en el sistema actual, el colaborador nuevo **no se elige de una lista de personas**: se escriben tipo y número de
identificación, nombres y apellidos. `upsertPayrollEmployee` acepta `person`:

```
{companyId, person: {taxIdType: 'CI'|'PASAPORTE'|'EXTERIOR', taxId, firstNames, lastNames, email?, phone?, mobile?,
 position?}, employee: {…}}   → {employeeId, created, personaCreated}
```

- La **cédula** se valida con su dígito verificador (`isValidCedula`, el mismo de facturación). Sin RUC: un colaborador
  es persona natural.
- Se busca la persona por identificación (la cédula también encuentra su RUC de persona natural, `cédula + 001`), en la
  misma transacción del alta: **no se duplica**. Si no existe se crea en `personas` con el rol `employee`, código de
  empleado siguiente (`000001…`, la misma secuencia de la web de Personas), `name = APELLIDOS NOMBRES` y
  `createdFrom: 'payroll'`. Si existe (p. ej. ya era cliente), gana el rol y conserva su código y su correo.
- Si esa persona **ya está en la nómina**, se rechaza («búscalo en Colaboradores y edítalo»).
- **Edición** (`personaId` + `person`): actualiza nombres, contacto y cargo de la persona; la identificación no se cambia
  desde la nómina.
- Sigue valiendo el alta con `personaId` de una persona ya marcada como empleado.

Pruebas: Jest **139/139**; integración **15/15** (crear, repetir, reusar un cliente con RUC, editar, cédula inválida).
Despliegue: solo `upsertPayrollEmployee` (va en la tanda 18).
