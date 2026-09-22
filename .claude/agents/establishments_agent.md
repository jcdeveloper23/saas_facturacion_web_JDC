---
name: Establishments Agent — Establecimientos y puntos de emisión
description: Experto en los establecimientos de la empresa ante el SRI (matriz, sucursales y puntos de emisión) en SaasFacturacion. Conoce el modelo companies/{cid}/establishments/{código}, cómo cada comprobante sale con el establecimiento de su serie, la dirección de <dirEstablecimiento>, los establecimientos asignados a cada usuario, las reglas de Firestore que los protegen (y el hueco de la regla por defecto), sus pruebas en emulador y la pantalla en Conecta. Úsalo antes de tocar series, emisión de comprobantes, usuarios de empresa o reglas de comprobantes.
---

# Establishments Agent — Establecimientos y puntos de emisión

Implementado el **2026-09-22**. En el SRI una empresa puede tener varios establecimientos
(001 matriz, 002 sucursal…), cada uno con sus puntos de emisión y **su propia numeración**.
Antes de esto FacturaEc emitía todo con `company.sri.establishment`: una factura de la
sucursal llegaba al SRI como si fuera de la matriz, con un secuencial que la matriz ya
había usado.

## Modelo

`companies/{companyId}/establishments/{code}`: **el id del documento es el código SRI**
de 3 dígitos (001–999, nunca 000), así es único por empresa y se lee directo.

```ts
{ code: '002', name: 'Sucursal Norte', address: 'Av. …', city, phone,
  isMain: boolean, isActive: boolean,
  emissionPoints: [{ code: '001', name: 'Caja 1', isActive: true }],
  createdAt, updatedAt, createdBy }
```

- **No se borran** (hay comprobantes emitidos con ese código): se desactivan. La
  **matriz no se puede desactivar**. El código **no se cambia** después de crearlo.
- `setupCompany` siembra la matriz con `buildMainEstablishment()` (usa
  `sri.establishment` / `sri.emissionPoint` de la empresa, o 001-001).
- Empresas anteriores: `scripts/seed-establishments.ts` (sin clave; compilar con `tsc` +
  `NODE_PATH`). **Ya corrido con `--apply` en producción el 2026-09-22.**

## Cada comprobante sale con su establecimiento

- La serie (`document-series`) fija establecimiento y punto de emisión; el comprobante los
  guarda en **`seriesEstablishment`** y **`seriesEmissionPoint`**.
- `functions/src/utils/establishments.ts`:
  - `resolveEmissionSeries(doc, companySri)` — los del documento **si están los dos**; si
    no, los de la empresa. **Siempre en pareja**: nunca mezclar el establecimiento de uno
    con el punto del otro.
  - `resolveEstablishmentAddress()` — `<dirEstablecimiento>` sale de
    `establishments/{code}.address`; fallback `configuration/sri.direccionEstablecimiento`.
  - `normalizeSriCode`, `normalizeEstablishmentList`, `canUseEstablishment`.
- Los 4 generadores de XML ya lo usan: factura, nota de crédito, retención, nota de débito.
- Contador atómico por clave `{estab}_{pto}_{año}` en `counters/invoices`.
- Pruebas: `functions/src/__tests__/establishments.test.ts` (jest, 131 en total).

## Establecimientos de cada usuario

- `company-users/{uid}.establishments: string[]` — códigos desde los que puede emitir.
- **Vacío = todos** (decisión del 2026-09-22, para no dejar sin facturar a los usuarios que
  ya existían). **El admin, siempre todos.** La asignación es **por establecimiento**, no
  por punto de emisión (decisión del usuario).
- `createCompanyUser` / `updateCompanyUser` aceptan `establishments` (`971d835`).
- Reglas: `canUseEstablishment(companyId, docEstablishment())` en create y update de
  `invoices` (el update **solo de pago** queda exento: cobrar no es emitir), `retentions` y
  `debitNotes`. Un usuario sin perfil `company-users` (legado) cuenta como «todos».

## ⚠️ La regla por defecto anulaba las reglas propias

Las reglas de Firestore **se suman (OR)**. El `match /{collection}/{id}` genérico daba
escritura a `canWrite()` (admin, seller, cashier) en **todas** las colecciones de la
empresa, incluidas las que tienen su propio `match`. Visto en emulador contra las reglas de
producción: un cajero editaba facturas anuladas y las anulaba, un vendedor cambiaba
retenciones autorizadas por el SRI y el kardex, un cajero reescribía `configuration/sri`, un
vendedor creaba almacenes, y el control por establecimiento no servía.

Arreglo (2026-09-22, **⏳ en curso: sin commit ni deploy** al escribir esto):
- `hasOwnRules(collection)`: lista de toda colección con `match` propio; la regla por
  defecto no les aplica **ni para leer ni para escribir**. **Toda colección nueva con
  `match` propio va en esa lista**, si no, la regla por defecto la re-abre.
- `isPaymentStatusChange()`: un update «solo de pago» puede tocar `status` solo para
  `paid` o `issued`. Antes, `status: 'void'` a secas pasaba como pago.
- Efecto buscado: el **cajero y solo lectura ya no leen** retenciones ni notas de débito
  (se aplica `canReadFiscalDoc`). `document-series` no tiene regla propia: sigue con la
  por defecto.
- Las subcolecciones (`products/{id}/stocks`) nunca las tocó la regla por defecto (solo
  empareja un nivel). El kardex no rompe pantallas: todo lo que lo escribe también escribe
  `stocks`, que ya era solo del admin.

Ajustes tras la auditoría del uso real en el front (2026-09-22), para no romper pantallas:
- `retentions` / `debitNotes`: se crean en `draft` **o `issued`** («Emitir» crea emitida) y
  `companyId` es opcional (si viene, debe ser el del path). Sin esto nadie, ni el admin,
  podía crearlas al cerrar la regla por defecto.
- `isPaymentOnlyUpdate` acepta `updatedBy` (el servicio siempre lo agrega): sin él, marcar
  pagada una compra recibida fallaba.
- `tm-projects` / `tm-members`: crean y editan admin **y seller** (rutas y `ROLE_MATRIX`).
- Una factura `void` solo la toca el admin (la regla miraba `'cancelled'`, que la app no
  usa: un vendedor «des-anulaba»).

Decisiones abiertas de esa auditoría: borrar facturas en borrador (la regla dice nunca; la
lista tiene botones de fila y masivo); el bar escolar descuenta stock desde el cliente del
cajero (`stock-movements` es solo admin: mover a una Cloud Function); ocultar en el front
lo que la regla ya niega (anular para no admin y el `.catch` silencioso de `voidSale` en el
POS, guardar en `/settings`, familias, almacenes, aprobar partes de horas); el contador no
está en `canWrite` (no crea compras ni usa `counters`).

## Pruebas de reglas (emulador)

`test/rules/{lib.js,test.js,README.md}` + `firebase.rules-test.json` (puerto **8181**; el
8080 está ocupado). Java 21:

```bash
export JAVA_HOME=/Users/leandroleon/Library/Java/JavaVirtualMachines/ms-21.0.12.1/Contents/Home
firebase emulators:exec -c firebase.rules-test.json --only firestore --project demo-facturaec "node test/rules/test.js"
git checkout -- firebase-debug.log   # el CLI lo borra; está versionado
```

54 casos: establecimientos, establecimiento por usuario, protecciones que la regla por
defecto anulaba y lecturas. Un channel admin necesita `channels/{id}.status == 'active'`
sembrado.

## Front (Angular)

- `features/settings/pages/establishments/` — alta, edición, puntos de emisión,
  activar/desactivar. Ruta opcional `:id` para el super admin
  (`/super-admin/companies/:id/establishments`, botón en la ficha de la empresa).
- `SettingsService.getEstablishments/create/update(…, companyId?)` con **`onSnapshot`**.
  **No usar `collectionData`** (rxfire choca con la instancia de Firestore: «Expected type
  '_Query'»; fue la causa de que el super admin no listara, `54b63ec`).
- `document-series` elige de los establecimientos registrados.
- El menú de la empresa sale de **`/modules` en Firestore**, no de `_nav.ts` (entrada
  `settings_establishments`, orden 911.5). **No re-correr `seed-modules.ts`**: sobrescribe
  el catálogo.

## Conecta (app cliente)

`App_Web_Conectate/lib/features/accounting/establishments/` (`establishment.dart`,
`establishments_screen.dart`, `5e55fbde`): el dueño lista y crea los establecimientos de su
empresa con la sesión federada de FacturaEc (mismas reglas, rol `admin`).

## Pendiente

- **Front del usuario:** selector de establecimiento visible arriba en factura, retención y
  nota de débito (hoy la serie va escondida en «Serie · Año»), que filtre las series y
  preseleccione si el usuario tiene uno solo; multiselect de establecimientos en el
  formulario de usuarios; `establishments?: string[]` en `CompanyUser`
  (`core/interfaces/company-user.interface.ts`).
- **Servidor:** `canUseEstablishment` todavía no lo usa ninguna function.
  `createAndEmitInvoice` emite siempre con el establecimiento de la empresa y
  `onPosSaleComplete` no valida el establecimiento del usuario (el Admin SDK salta las
  reglas).
- **Deploy (lo hace el usuario, siempre con nombres; nunca `--only functions` a secas —
  publicaría `getAuthToken`):** `generateInvoiceXml, generateCreditNoteXml,
  generateDebitNoteXml, generateRetentionXml, onInvoiceEmit, onRetentionEmit,
  onDebitNoteEmit, setupCompany, createCompanyUser, updateCompanyUser`; las reglas nuevas;
  y el hosting.

## Anti-patrones

- Emitir con `company.sri.establishment` ignorando la serie del documento.
- Mezclar establecimiento del documento con punto de emisión de la empresa.
- Borrar un establecimiento o cambiarle el código.
- Agregar un `match` propio sin sumarlo a `hasOwnRules`.
- Probar reglas con un PATCH que imite la operación en vez de la operación real.
- Crear contraseñas automáticas a los usuarios federados desde Conecta (decisión del
  usuario: el acceso es desde Conecta; para la web, «¿Olvidaste tu contraseña?»).
