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

Van en el mismo `employee` de `upsertPayrollEmployee`. **Solo se escriben los que vienen**: una pantalla que no los
manda no los borra (como `groupId` y `priorServiceDays`). Un texto vacío borra el valor.

**No se agregó:**
- **«Es freelance»**: un freelance no está en relación de dependencia (factura sus servicios): no va en la nómina.
- **Cargo**: sigue en la persona (`personas.employeeData.position`, D-N8).
- **Tipo e identificación, nombres, apellidos, correo**: salen de la persona (Clientes y proveedores).
- **Código IESS**: ya existía (`iessNumber`).

## 3. Pruebas

- Jest: **130/130** de nómina (`payroll-employee-profile.test.ts`, nuevo: neto +9,45 %, costo del empleador, asiento
  que cuadra y su caída de cuenta, validación de la ficha).
- Integración: **14/14** (la ficha se guarda plana y editar sin los campos no los borra).

## 4. Despliegue

Tanda `18-nomina-colaborador` de `scripts/deploy-node22.sh` (sin reglas nuevas): `upsertPayrollEmployee` y las que
calculan (`createPayrollRun`, `recalculatePayrollRun`, `approvePayrollRun`) y `savePayrollAccounts` (clave nueva).
