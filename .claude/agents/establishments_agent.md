---
name: Establishments Agent — Establecimientos y puntos de emisión
description: Experto en los establecimientos de la empresa ante el SRI (matriz, sucursales y puntos de emisión) en SaasFacturacion. Conoce el modelo companies/{cid}/establishments/{código}, cómo cada comprobante sale con el establecimiento de su serie, la dirección de <dirEstablecimiento>, los puntos de emisión asignados a cada usuario, las reglas de Firestore que los protegen (y el hueco de la regla por defecto), sus pruebas en emulador y la pantalla en Conecta. Úsalo antes de tocar series, emisión de comprobantes, usuarios de empresa o reglas de comprobantes.
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
  - `normalizeSriCode` y los de puntos de emisión: `normalizeEmissionPointList`,
    `resolveDefaultEmissionPoint`, `assertEmissionPointsExist`, `canUseEmissionPoint`.
- Los 4 generadores de XML ya lo usan: factura, nota de crédito, retención, nota de débito.
- Contador atómico por clave `{estab}_{pto}_{año}` en `counters/invoices`.
- Pruebas: `functions/src/__tests__/establishments.test.ts` (jest, 131 en total).

## Puntos de emisión de cada usuario

- `company-users/{uid}.emissionPoints: string[]` como **`'EEE-PPP'`** (`'001-002'`) y
  `defaultEmissionPoint`. El establecimiento **sale del punto**: no se asigna aparte.
- **Vacío = todos**; **el admin, siempre todos**. Un usuario tiene 1+ puntos y un punto lo
  usan varios usuarios (turnos). Decisión del usuario del 2026-09-22: **reemplaza** a la
  asignación por establecimiento (`establishments`, `971d835`), que nunca se desplegó.
- `createCompanyUser` / `updateCompanyUser` aceptan `emissionPoints` y
  `defaultEmissionPoint`, y validan contra `establishments` que cada punto exista y esté
  activo (`assertEmissionPointsExist`; una empresa sin establecimientos no se valida). El
  de por defecto, si no está en la lista, pasa a ser el primero (`a476d19`).
- Reglas: `canUseEmissionPoint(companyId)` compara `seriesEstablishment-seriesEmissionPoint`
  del comprobante en create y update de `invoices` (el **solo pago** queda exento),
  `retentions` y `debitNotes`. Un usuario sin perfil `company-users` (legado) = todos.
- Reglas: **`emissionPoints` y `defaultEmissionPoint` solo los cambia el admin** o el super
  admin. Cada usuario puede editar su propio `company-users`, y sin esto un cajero vaciaba
  su lista y quedaba con todos.
- Front (`7f41090`): tarjeta «Puntos de emisión» en el formulario de usuarios; en factura,
  retención y nota de débito el punto se ve arriba, filtrado con
  `EmissionPointAccessService` (`core/services/emission-point-access.service.ts`); uno
  nuevo abre con el punto por defecto; al editar se respeta la serie del comprobante.
- Una **caja del POS** (`PosTerminal`) tiene una serie, así que en la práctica es un punto
  de emisión, pero el POS **no aplica** estos puntos: su factura desde el navegador toma la
  primera serie activa (`pos-sales.service.ts`) y no la de la caja, y cualquier cajero abre
  cualquier caja. El usuario no necesita el POS por ahora.

## ⚠️ La regla por defecto anulaba las reglas propias

Las reglas de Firestore **se suman (OR)**. El `match /{collection}/{id}` genérico daba
escritura a `canWrite()` (admin, seller, cashier) en **todas** las colecciones de la
empresa, incluidas las que tienen su propio `match`. Visto en emulador contra las reglas de
producción: un cajero editaba facturas anuladas y las anulaba, un vendedor cambiaba
retenciones autorizadas por el SRI y el kardex, un cajero reescribía `configuration/sri`, un
vendedor creaba almacenes, y el control por establecimiento no servía.

Arreglo (2026-09-22, rama `feat/establishments`, `b25e8fa` + `016f1ad`; ~~⏳ sin desplegar~~ → ✅ **producción desde el 2026-09-24**):
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

60 casos: establecimientos, punto de emisión por usuario, protecciones que la regla por
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

## Estado (2026-09-24)

- ✅ **Probado en pantalla** y **en producción**: desde Conecta se emitió contra el
  ambiente de pruebas del SRI y quedó **autorizada** (empresa `OG4ydEyOAhtsNmkOjc1P`,
  facturas `001-001-000000001` y `002`), con su RIDE. Los puntos de emisión por usuario se
  probaron asignando rol y puntos a un miembro.
- ✅ **`createAndEmitInvoice` ya respeta el punto de emisión de quien factura** (`2f2b9d0`,
  rama `feat/facturar-desde-conecta`): acepta `establishment` / `emissionPoint`, y resuelve
  en orden lo pedido → el punto por defecto del usuario → el primero asignado → el de la
  empresa, validando siempre con `canUseEmissionPoint`.
- ✅ **Desplegadas** el 2026-09-24: `onInvoiceEmit`, `onRetentionEmit`, `onDebitNoteEmit`
  —los generadores de XML viajan dentro de estos triggers, así que con ellas el comprobante
  ya sale con el establecimiento de su serie—, además de `createAndEmitInvoice`, `sendToSri`,
  `uploadCertificate`, `signXml`, `portalUpdateCompany` y **las reglas de Firestore**.

> ⛔ **Regla que se aprendió a la mala el 2026-09-25:** dentro de `onInvoiceEmit` no viajan
> solo los generadores de XML — también la firma, el envío al SRI, el RIDE y **el envío del
> correo** (`sendInvoiceEmailInternal`, `on-invoice-emit.ts:10,257`). **Al tocar cualquiera
> de esas piezas hay que redesplegar TAMBIÉN `onInvoiceEmit`**, aunque su archivo no haya
> cambiado: se despliega el bundle, no el archivo. Ese día el deploy de las 21:24 UTC la
> dejó fuera y el correo automático siguió con código viejo. Se ve comparando
> `gcloud functions describe <fn> --project accounting-system-a5c9f --region us-central1
> --format="value(updateTime)"` entre dos functions; `functions:list` **no** dice cuándo se
> actualizó cada una.

## Pendiente

- **Quedan 7 callables con el código anterior**, que no están en el camino de Conecta pero
  sí en el de la web: `generateInvoiceXml`, `generateCreditNoteXml`, `generateDebitNoteXml`,
  `generateRetentionXml`, `setupCompany`, `createCompanyUser`, `updateCompanyUser`.
  Siempre con nombres; nunca `--only functions` a secas, que publicaría `getAuthToken`.
- **El POS sigue sin validar el punto de emisión del usuario** (`onPosSaleComplete` usa el
  Admin SDK y se salta las reglas), y arrastra dos fallos propios: la factura que crea el
  navegador toma la primera serie activa en vez de la de la caja
  (`pos-sales.service.ts:150`), y la function busca las series en `document-series` mientras
  la web las guarda en `documentSeries` — esa colección no existe. POS en pausa.
- Hosting de la web y de Conecta.

## Anti-patrones

- Emitir con `company.sri.establishment` ignorando la serie del documento o el punto de
  emisión de quien factura.
- Tratar «CLAVE ACCESO REGISTRADA» como rechazo al reenviar: el SRI ya tiene ese
  comprobante y casi siempre autorizado; hay que consultar su autorización (`a7d71eb`).
- Regenerar el código numérico al reintentar: cambiaría la clave de acceso y el SRI
  acabaría con dos comprobantes distintos para la misma factura.
- Mezclar establecimiento del documento con punto de emisión de la empresa.
- Borrar un establecimiento o cambiarle el código.
- Agregar un `match` propio sin sumarlo a `hasOwnRules`.
- Probar reglas con un PATCH que imite la operación en vez de la operación real.
- Crear contraseñas automáticas a los usuarios federados desde Conecta (decisión del
  usuario: el acceso es desde Conecta; para la web, «¿Olvidaste tu contraseña?»).
