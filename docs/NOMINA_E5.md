# Nómina (Ecuador) — Etapa E5: pantallas en la web de FacturaEc

> 2026-11-11 · rama `feat/nomina_conectate` · **sin desplegar** (hosting).
> Antes: `NOMINA_E2.md` (datos, reglas, cálculo) y `NOMINA_E3.md` (callables). Plan: `PLAN_NOMINA.md` §7.2.

## 1. Qué es E5

Las mismas cinco pantallas que tiene Conecta (E4), ahora en la web de FacturaEc, para las empresas que
entran directo aquí. **No hay cálculo nuevo:** todo pasa por las 8 callables de E3. La web solo lee (con
`onSnapshot`, nunca `collectionData`) y llama.

## 2. Pantallas (`src/app/features/payroll/`)

| Ruta | Pantalla | Qué hace |
|---|---|---|
| `/payroll/runs` | Nóminas | Las del año, contadores por estado, selector de año, «Nueva nómina» (elige el mes → `createPayrollRun`) |
| `/payroll/runs/:runId` | Ficha de la nómina | Un rol por empleado, avisos y errores que impiden aprobar, resumen de totales. Borrador: Novedades del mes, Recalcular, Aprobar. Aprobada: Ver en Asientos, Enviar por correo, Reversar (con motivo y el aviso de pago manual, D-N6) |
| `/payroll/payslips/:payslipId` | Rol de pago | Ingresos, descuentos, neto; costo del empleador y provisiones como informativos. Descargar PDF (base64, sin URL) y enviar solo ese rol |
| `/payroll/employees` | Empleados | Lista con contadores y búsqueda; ficha en modal (`upsertPayrollEmployee`). La persona se elige entre las marcadas como empleado en Personas |
| `/payroll/parameters` | Parámetros | Solo lectura, con la fuente de cada valor y los que faltan |

Archivos: `models/payroll.models.ts` (tipos, rótulos, formato), `services/payroll.service.ts` (lecturas y
callables), `components/payroll-tabs.component.ts` (pestañas + aviso fijo del IR, §4.4 regla 9),
`components/novelties-modal.component.ts`, `pages/*`.

## 3. Acceso y menú

- **Ruta:** `app.routes.ts` → `payroll` con `permissionGuard` (`payroll.view`) y `moduleGuard`
  (`module: 'payroll'`); cada hija con `roleGuard` (`admin`, `accountant`). `payroll` está en
  `APP_SEGMENTS` para que el catálogo público (`:slug`) no la intercepte.
- **Menú:** sale de `/modules` en Firestore. El módulo `payroll` pasa a **`showInMenu: true`**
  (`modules-seed.ts` y `seed-modules.ts`); `seed-payroll-module.ts` lo crea así si falta. Respaldo
  estático en `_nav.ts` (Nómina › Nóminas, Empleados, Parámetros).
- ⚠️ Si `modules/payroll` **ya existe** en producción con `showInMenu: false` (por haber corrido
  `seed-payroll-module.ts --apply` antes de E5), el script no lo toca: hay que cambiarlo desde la pantalla
  Módulos del super admin.
- Las reglas ya impiden leer a vendedor, cajero y solo lectura; los guards solo evitan mostrarles la página.

## 4. Cómo se probó

- `npx ng build --configuration development`: **compila sin errores** y sin avisos en `features/payroll/`.
  (Hubo que instalar dependencias con `npm ci --ignore-scripts --legacy-peer-deps`: `npm ci` a secas falla
  con un error de npm/arborist.)
- **No se abrió en el navegador:** la web no tiene configuración para el emulador y se conectaría a
  producción, donde la nómina no está desplegada.
- Pendiente: probar en pantalla después de desplegar, con la empresa de prueba.

## 5. Despliegue (cuando lo ordene el usuario)

Después de reglas, scripts y functions (`NOMINA_E3.md` §8):

```bash
npm run build          # o ng build (producción)
firebase deploy --project accounting-system-a5c9f --only hosting
```

⚠️ El hosting de FacturaEc lo publican varias ramas: revisar antes el último release y que esta rama
tenga lo de las demás.

## 6. Pendiente

- Reportes simples de nómina (el plan los deja para E5): no hechos.
- Préstamos, grupos de colaboradores y pago de décimos: sin pantallas (tampoco tienen callables de alta).
- Probar en pantalla.

## 7. Correcciones tras la revisión independiente (2026-11-11)

| # | Problema | Corrección |
|---|---|---|
| 1 | El envío de correos se cortaba en el navegador a los 70 s (el servidor tiene 300 s) | `sendPayslipEmails` con `timeout: 300000` |
| 2 | Un envío fallido se mostraba como éxito | Error si `failed`, aviso si hay sin correo |
| 3 | Se podía aprobar sin ver lo que se aprueba (aprobar recalcula con lo de ese momento) | Al cerrar Novedades con cambios, la nómina se recalcula sola; el diálogo de aprobar lo explica |
| 4 | El ítem «Nómina» del menú desde `/modules` pedía `accounting.view` | `payroll` en `PERM_MODULES` (`default-layout.component.ts`): pide `payroll.view` |
| 6 | Un error al leer roles o novedades se veía como lista vacía | Se muestra el error |
| 7 | Novedades de un empleado inactivo salían con el id | El nombre sale de la lista completa |
| 8 | Meses futuros elegibles, Aprobar sin roles, `a@b` como correo, mensaje confuso del sueldo | Meses futuros deshabilitados; Aprobar deshabilitado sin roles; mismo patrón de correo que el servidor; mensaje con el formato |

**Para que admin y contador entren** a `/payroll` en empresas que ya existen hay que haber corrido
`scripts/grant-payroll-permissions.js --apply` (su rol guardado manda sobre `ROLE_MATRIX`; sin eso,
`permissionGuard` los manda a `/unauthorized`). Y `modules/payroll` tiene que existir con
`showInMenu: true` (lo crea así `seed-payroll-module.ts`).

`ng build` sigue en verde, sin avisos en `features/payroll/`.
