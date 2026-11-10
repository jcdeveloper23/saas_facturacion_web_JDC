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
- **Siguiente: E2** (colecciones, reglas y pruebas, módulo `payroll` y `pkg_hr`,
  `employeesTotal`, `functions/src/payroll/payroll-calc.ts` con su spec). Orden y detalle en
  el agente principal.

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
