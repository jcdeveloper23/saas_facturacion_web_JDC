---
name: payroll
description: Módulo de Nómina y Roles de Pago (Ecuador) — empleados, novedades, cálculo mensual, décimos, préstamos, IESS, rol en PDF y asiento. Del lado de FacturaEc: colecciones, reglas, callables en functions/src/payroll/, PDF, correo y la web en src/app/features/payroll/. Úsalo para cualquier trabajo de nómina en este repo.
---

# Payroll Agent (FacturaEc)

Copia corta. **La versión principal y el plan viven en el panel:**

- Agente: `../App_AdminWeb_Conectate/weworkscloud/.claude/agents/payroll_agent.md`
- Plan: `../App_AdminWeb_Conectate/weworkscloud/docs/PLAN_NOMINA.md`
- Bitácora: `../App_AdminWeb_Conectate/weworkscloud/docs/BITACORA_INTEGRACION.md`

**Leer los dos primeros antes de empezar.** Si no están, hacer `git pull` en el panel (rama
`feat/contabilidad-usuarios`). No re-derivar ni reabrir las decisiones D-N1..D-N12.

## Estado (2026-11-10)

- E1 en producción: `personas` ya no guarda sueldo, IESS, fechas ni contrato
  (`hasNoPayrollData()` en `firestore.rules`, commit `3a02814`).
- **E2 hecha en código, SIN commit y SIN desplegar** (rama `feat/nomina_conectate`): 8 colecciones
  con regla (solo lectura de `admin` y `accountant`, sin escritura del cliente) y su regla de
  Storage; pruebas de reglas; módulo `payroll` y paquete `pkg_hr`; permisos y scripts
  `seed-payroll-module.ts` y `grant-payroll-permissions.js`; `employees` en `checkPlanLimit`;
  cálculo puro, asiento, décimos y préstamos en `functions/src/payroll/` con 41 pruebas Jest
  (en verde en una copia aparte; incluye correcciones de la revisión independiente, `NOMINA_E2.md` §10). **Detalle, orden de despliegue y supuestos a confirmar:
  `docs/NOMINA_E2.md`.**
- **Reglas probadas (2026-11-10):** Firestore 740/740 y Storage 24/24. Comando en
  `docs/NOMINA_E2.md` §4 (con el aviso para quien tenga Java menor que 21).
- **Pendiente de E2:** correr Jest dentro de `functions/` (`npm install` primero); publicar el documento
  `payrollParameters` 2026 (sin script todavía, y con IECE, SECAP y divisor pendientes de Jessica Zari);
  commit por archivo; desplegar solo con orden del usuario (reglas → scripts → functions).
- **E3 hecha en código, SIN commit y SIN desplegar** (2026-11-10): las 8 callables, el PDF y el correo en
  `functions/src/payroll/`, exportadas en `index.ts` y con la tanda `14-nomina` en `scripts/deploy-node22.sh`.
  Jest 57/57 (43 de cálculo + 14 de E3); integración contra el emulador de Firestore 4/4 (`test/payroll/`).
  **`sendPayslipEmails` NO se probó** (SMTP real y `@google-cloud/secret-manager`); nada probado en pantalla.
  **Detalle, contrato con Conecta, orden de despliegue y discrepancias: `docs/NOMINA_E3.md`.**
- **Pendiente de E3:** correr `scripts/seed-payroll-parameters.ts` (hecho y probado en emulador; publicar exige
  `--with-criteria` hasta que Jessica confirme IECE, SECAP y divisor); sin callables de alta
  de `payrollGroups` y `payrollLoans` (D-N10, D-N12) ni de `payrollBonusRuns` (D-N11).
- **E5 (pantallas en la web) hecha en código, sin desplegar** (2026-11-11): `src/app/features/payroll/` (Nóminas,
  ficha de la nómina, rol, Empleados, Parámetros), ruta `/payroll`, menú con `showInMenu: true` y `payroll` en
  `PERM_MODULES`. `ng build` en verde; **no probada en pantalla** (la web no usa emulador). Detalle: `docs/NOMINA_E5.md`.
- **Siguiente:** desplegar cuando lo ordene el usuario (reglas → scripts → tanda 14-nomina; encender `pkg_hr` en
  LEANDRO LEÓN y subir `employeesTotal`) y probar en pantalla con Conecta; o completar préstamos, grupos y décimos.

## Lo que más importa en este repo

- ⛔ No desplegar sin orden del usuario. Functions siempre con nombre, y las nuevas se suman a
  `scripts/deploy-node22.sh`.
- ⛔ `git add` por archivo: `functions/lib` y `functions/node_modules` traen ruido conocido.
- ⛔ Sin escritura del cliente en las colecciones de nómina. La exclusión va en
  `hasOwnRules()`; probar con `test/rules/test.js` (emulador, puerto 8181).
- ⛔ Callables con `requirePayrollRole` (solo `admin` y `accountant`; sin la excepción de
  `super_admin` que tiene `requireCompanyRole`).
- ⛔ No correr `scripts/seed-modules.ts`: pisa los ajustes del super admin. Los permisos van
  por script a `companies/{cid}/roles/*`.
- ⛔ Ningún valor legal en el código; parámetros en `payrollParameters/{año}_v{n}`.
- ⛔ PDF sin `makePublic()`.
