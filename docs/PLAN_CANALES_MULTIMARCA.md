# FacturaEc — Canales: aislar Conectate y Mi Buseta dentro de una sola instancia

**Fecha:** 2026-09-16
**Proyecto:** `accounting-system-a5c9f`
**Planes hermanos:** `docs/PLAN_INTEGRACION_BUSETA_CONTABILIDAD.md` ·
`../App_AdminWeb_Conectate/weworkscloud/docs/PLAN_FACTURACION_CONECTATE.md`

---

## 1. La decisión

FacturaEc queda **centralizado**: una sola instancia, un solo código, una sola
implementación de la contabilidad y de la emisión al SRI. Se evaluó desplegar una
instancia por producto y se descartó: mantener dos despliegues idénticos es más trabajo
que aislar por canal acá adentro.

Lo que cambia respecto de los planes escritos hasta hoy es **quién administra a quién**:

```
FacturaEc (central)
├── channels/conecta-app    ← su super admin activa módulos a SUS empresas
├── channels/mi-buseta      ← su super admin activa módulos a SUS empresas
└── companies/{companyId}
      channelId: 'conecta-app' | 'mi-buseta' | 'directo'
```

Conectate y Mi Buseta **no son tenants**. Son canales: marcas bajo las que se vende el
sistema, cada una con su propio super admin y su propia cartera de empresas cliente.
Los tenants siguen siendo las empresas, en `/companies/{companyId}`.

## 2. Por qué es lo primero que hay que hacer

Hoy no existe ningún concepto de canal, y el aislamiento **no es que sea débil: no
existe**.

| Dónde | Qué pasa hoy |
|---|---|
| `functions/facturaec.js` (Conectate) | firma su token de integración con `role: 'super_admin'` |
| Plan de Buseta, tarea 0.8 | prevé exactamente lo mismo desde el backend Java |
| `firestore.rules:104-105` | `super_admin` lee y escribe **cualquier** `companies/{id}` |
| `setup-company.ts:88`, `assign-plan-to-company.ts:22` | el único guard es `role === 'super_admin'` |
| `super-admin.service.ts:241,306` | el Angular lista `companies` **sin filtro** |

Consecuencia: en cuanto los dos gateways estén desplegados, el super admin de Conectate
puede listar, cambiar de plan, suspender o desactivarle módulos a los clientes de Mi
Buseta. Y al revés. No hace falta mala intención: alcanza con un `companyId` mal tipeado.

Por eso esta tarea **absorbe y reemplaza** la tarea 0.1 del plan de Conectate y la 0.8 del
de Buseta, que hablaban de un rol `integration` sin canal. Va **antes** de la Fase 1.a
(`provisionCompany`) y antes de desplegar cualquiera de los dos gateways.

## Estado al 2026-09-21

**Ramas (sin push):** `feat/canales-multimarca` y, encima, `feat/portal-canal`
(commits `351d03b` portal y `92ee185` `portalWhoAmI`). Panel: `feat/gateway-canal-conectate` y, encima,
`feat/contabilidad-flutter` (commits `04d7a98` Contabilidad, `c8cbf8e` semáforo de conexión,
`94dd873` encabezado sin desborde y `1243ca8` canal real `conecta-app` + semáforo sin parpadeo)
en `App_AdminWeb_Conectate`.
Bitácora con los comandos exactos: `App_AdminWeb_Conectate/weworkscloud/docs/BITACORA_INTEGRACION.md`.

| Pieza | Estado |
|---|---|
| C1 modelo y claims · C2 callables · C3 reglas · C4 Angular · C5 migración | ✅ código |
| Pantalla de canales (crea el admin y le envía el correo para definir contraseña) | ✅ código |
| Reglas e índices en `accounting-system-a5c9f` | ✅ **desplegados** |
| `manageChannelAdmin`, `setupCompany`, `assignPlanToCompany`, `checkPlanLimit`, `createCompanyUser`, `setUserCustomClaims` | ✅ **desplegadas** |
| Canal `conecta-app` («Conecta», `status: active`, 2 admins) y su admin | ✅ creados desde la pantalla (localhost contra producción). El id del documento es `conecta-app`; «Conecta» es el nombre |
| Portal de canal: `portalListCompanies`, `portalGetCompany`, `portalSetCompanyStatus`, `portalSetAddon`, `portalListPlans`, `portalUpsertPlan`, `portalListPackages` (`functions/src/channel-portal/`) | ✅ **desplegadas el 2026-09-17** (rama `feat/portal-canal`, 7 creadas) |
| Fix de módulos en `assignPlanToCompany` y `onPlanUpdated` (leían `includedModules`) | ✅ **desplegadas el 2026-09-17** (2 actualizadas) |
| `portalWhoAmI` (solo lectura: uid, correo, rol, canal y estado del canal del llamador, sin exigir canal activo) | ✅ **desplegada el 2026-09-17** (rama `feat/portal-canal`, commit `92ee185`, 1 creada); en la lista blanca del gateway |
| IAM: `facturaec-gateway@work-cloud-df68a.iam.gserviceaccount.com` con «Consumidor de Service Usage» en este proyecto | ✅ otorgado el 2026-09-17, **en este proyecto** (el primer intento quedó en `work-cloud-df68a`). Va en IAM, no en la página de Cuentas de servicio, y el correo hay que pegarlo: no aparece en el autocompletado por ser de otro proyecto |
| C6 pruebas de reglas | 🟡 12 casos pasan en emulador (script fuera del repo); falta versionarlos |
| Hosting con la pantalla de canales | ⏳ sin desplegar (`npm run build` + `firebase deploy --only hosting`) |
| Migración `migrate:channels` en producción | ⏳ sin correr; las empresas actuales no tienen canal |
| Gateway de Conectate (`callFacturaEc`, `grantPlatformRole`) en `work-cloud-df68a` | ~~⏳ sin desplegar~~ → ✅ **desplegado el 2026-09-17**, firma como `channel_admin` de `conecta-app` (~~`conectate`~~ → `conecta-app` el mismo día, redesplegado `callFacturaEc`), IAM sin claves |
| `platformRole: super_admin` en Conecta para `juandiegocontrerass@gmail.com` | ✅ asignado el 2026-09-17 |
| Sección «Contabilidad» del panel Flutter (consume el portal por el gateway) | ⏳ código listo, hosting de Conecta sin desplegar |
| Prueba de punta a punta Flutter → gateway → portal | ✅ **pasa el 2026-09-17**: «Contabilidad» lista el catálogo real de paquetes y cargan Empresas y Planes. Semáforo en 🟡 por un solo motivo correcto: el canal aún no tiene planes. Hasta correr `migrate:channels`, las empresas actuales no tienen canal y el portal no las muestra |
| Planes del canal `conecta-app` | 🚧 **bloqueante (2026-09-21)** — catálogo vacío; falta crear el primero (propuesto botón «Copiar planes base»). Ya no deja solo el semáforo en 🟡: desde el 2026-09-21 el dueño de un grupo de Conecta puede pedir la activación, y **sin plan `setupCompany` no tiene qué asignar, así que cualquier activación falla** |
| Activación desde el grupo de Conecta (`requestAccountingActivation`, `approveAccountingRequest`, `rejectAccountingRequest` en `work-cloud-df68a`) | ✅ **desplegadas el 2026-09-21**, del lado de Conecta. Entran a FacturaEc como el canal `conecta-app` y **siempre** en ambiente de pruebas del SRI (`sri.environment = '1'`). Sin probar con un grupo real: espera el primer plan del canal |

> **Nada nuevo que desplegar de este lado (2026-09-21).** Lo del 2026-09-21 fue todo en
> Conecta (`work-cloud-df68a`): tres callables y una regla de Firestore. Lo que falta aquí
> sigue siendo lo mismo: el **primer plan del canal**, `migrate:channels` y el hosting.
> Detalle en `App_AdminWeb_Conectate/weworkscloud/docs/BITACORA_INTEGRACION.md`
> (entrada del 2026-09-21) y en `weworkscloud/docs/PLAN_CONTABILIDAD_DESDE_GRUPO.md`.

Operación: `admin@weconnect.com.ec` tiene en este proyecto Administrador de Firebase,
Usuario de cuenta de servicio y Consumidor de Service Usage. La API de Secret Manager se
habilitó porque el CLI la exige para desplegar functions (la usa `exchangeToken`).

Deuda detectada, fuera de este trabajo:
- `functions/node_modules` y `functions/lib` están versionados en git.
- Node.js 20 deja de poder desplegarse el **2026-10-30**; `firebase-functions` desactualizado.
- `npm install` del Angular solo funciona con `--legacy-peer-deps` (`@angular/fire@20` vs Angular 21).
- El CLI de Firebase borra `firebase-debug.log`, que está versionado.

## 3. El modelo

### 3.1 `channels/{channelId}`

```ts
{
  name: string;              // 'Conectate', 'Mi Buseta'
  status: 'active' | 'suspended';
  contactEmail: string;
  createdAt: Timestamp;
  createdBy: string;         // uid del super admin de plataforma
}
```

**Solo el super admin de plataforma crea canales.** Son pocos, casi no cambian, y un canal
que se pueda crear a sí mismo es una forma de escaparse de los límites. No hay sub-canales
ni jerarquía: si algún día se venden por revendedores, se diseña entonces.

### 3.2 La empresa lleva su canal

`companies/{companyId}.channelId`, escrito por `setupCompany` / `provisionCompany`
**a partir del token de quien llama**, nunca del payload. Una vez escrito es inmutable
desde el cliente: mover una empresa de canal es una operación de plataforma.

### 3.3 Los planes también

Decisión tomada: **catálogo propio por canal**. `plans/{planId}.channelId`. Conectate
puede vender el mismo límite a otro precio, con otro nombre y con otros paquetes, sin
tocar lo que ve Mi Buseta. Los planes actuales (Emprendedor, PYME, Profesional,
Empresarial) quedan en el canal `directo`.

Regla que se agrega: `assignPlanToCompany` rechaza asignar un plan de un canal a una
empresa de otro.

### 3.4 El rol

Nuevo rol **`channel_admin`**, con claims `{ role: 'channel_admin', channelId }`.

- Es el rol con el que **firman los dos gateways** su token de integración, en lugar de
  `super_admin`. En Conectate es poner `FACTURAEC_INTEGRATION_ROLE=channel_admin` y la
  nueva variable `FACTURAEC_CHANNEL_ID=conecta-app` (~~`conectate`~~ → `conecta-app`, 2026-09-17).
- `super_admin` queda para el dueño de la plataforma, que ve todos los canales. Deja de
  ser el rol de uso diario.
- `channel_admin` **no puede** otorgar `super_admin` ni `channel_admin`: ambos entran en
  `SUPER_ADMIN_ONLY_ROLES` de `set-custom-claims.ts`, y además solo puede tocar usuarios
  de empresas de su canal.

## 4. Los cambios, uno por uno

### C1 · Modelo y claims · 0.5 días — ✅ implementado el 2026-09-16
Colección `channels`, campo `channelId` en `companies` y en `plans`, rol `channel_admin`
en el catálogo de roles de plataforma, y script para crear un canal y su primer admin.

| Archivo | Qué es |
|---|---|
| `functions/src/utils/channels.ts` | El modelo en código: roles, `canOperateOnChannel`, `assertChannelAccess`, `resolveChannelForNewCompany`, `assertPlanMatchesCompany`, `loadCompanyForCaller` |
| `scripts/seed-channel.ts` | Crea el canal y le pone los claims a su super admin (`npm run seed:channel -- conecta-app "Conecta" correo@dominio.com`) |
| `src/app/core/services/roles.service.ts` | `channel_admin` en `DEFAULT_SYSTEM_ROLES` |

### C2 · Guard de canal en los callables · 1 día — ✅ implementado el 2026-09-16

| Callable | Qué cambió |
|---|---|
| `setupCompany` | estampa `channelId` desde el token (ignora el del payload, salvo super admin) y valida que el plan sea del mismo canal |
| `assignPlanToCompany` | ya no exige `super_admin`: usa `loadCompanyForCaller` y `assertPlanMatchesCompany` |
| `checkPlanLimit` | un `channel_admin` solo consulta empresas de su canal; los usuarios de la empresa siguen igual |
| `createCompanyUser` | acepta `channel_admin` dentro de su canal; `channel_admin` pasa a ser rol protegido |
| `setUserCustomClaims` | `channel_admin` protegido, y solo administra usuarios de empresas de su canal |

Verificado: `npx tsc --noEmit` limpio y `npx jest` en verde (88 pruebas, 16 de ellas de
canales, en `functions/src/__tests__/channels.test.ts`). **No probado contra Firestore
real ni en emulador**, y el cambio del Angular no se compiló: falta `npm install`.

**Cómo funciona.** Helper `assertChannelAccess(caller, channelId)`: `super_admin` pasa siempre; un
`channel_admin` pasa solo si `company.channelId === token.channelId`; cualquier otro
recibe `permission-denied`. Se aplica en `setupCompany`, `assignPlanToCompany`,
`checkPlanLimit`, `createCompanyUser` y en las cuatro de la Fase 1.a cuando existan
(`provisionCompany`, `getCompanyProvisioningStatus`, `seedChartOfAccounts`,
`upsertAccountingPeriod`). `setupCompany` además **estampa** el `channelId` del llamador.

### C3 · Reglas de Firestore · 1 día — ✅ implementado el 2026-09-16

En `firestore.rules`, cuatro helpers nuevos: `isChannelAdmin()`, `callerChannel()`,
`inCallerChannel()` y `channelUnchanged()`. Todos niegan por defecto: sin canal en el
token, o sin canal estampado en el documento, no hay acceso.

| Bloque | Qué quedó |
|---|---|
| `companies/{companyId}` | `write` genérico reemplazado por `create` / `update, delete`. El `channel_admin` opera dentro de su canal y **no puede cambiar `channelId`**. Al crear, el canal del documento debe coincidir con su claim |
| `plans/{planId}` | lectura acotada **solo** al `channel_admin`; los usuarios de empresa y la landing siguen leyendo como antes. Escritura, por canal |
| `channels/{channelId}` | nuevo: lo escribe solo el super admin de plataforma; un `channel_admin` lee el suyo |

> La duda del plan público quedó resuelta por el lado conservador: el acotado aplica
> solo al `channel_admin`, así que la landing y los usuarios de empresa no cambian de
> comportamiento.

### C4 · Filtrado en el super admin de Angular · 1 día — ✅ implementado el 2026-09-16

| Archivo | Qué cambió |
|---|---|
| `core/services/auth.service.ts` | `AuthUser.channelId` leído del claim, más `isChannelAdmin()` y el getter `channelId` |
| `core/services/firestore.service.ts` | `getRootCollectionWhere()`: como `getRootCollection` pero filtrando en el servidor |
| `super-admin/services/super-admin.service.ts` | helper `channelConstraints()`, aplicado en `getCompanies`, `getPlans`, `syncPlanToCompanies` y `syncAllCompaniesWithPlans`. `createPlan` estampa el `channelId` del `channel_admin` |
| `app.routes.ts` + `auth.service.ts` | `/super-admin` admite `channel_admin`, y es su ruta por defecto al iniciar sesión |
| `super-admin/super-admin.routes.ts` | catálogo de módulos, paquetes, datos por defecto y perfiles quedan bajo un grupo con `canActivateChild: [roleGuard]` solo para `super_admin`: son de la plataforma, no del canal |
| `super-admin/layout/super-admin-layout.component.ts` | el menú del `channel_admin` muestra solo Empresas, Planes y Guía Comercial |

Verificado: `tsc` y `ng build --configuration development` sin errores (las
advertencias que salen son previas y de otros archivos). Para instalar las dependencias
hizo falta `npm install --legacy-peer-deps`: `@angular/fire@20` pide
`@angular/common@^20` y el proyecto está en Angular 21. Ese conflicto es previo a este
trabajo.

El filtro va en el servidor y no en un `pipe`: las reglas niegan los documentos de otros
canales, y un listener sin filtro **falla entero** en lugar de devolver menos.

⚠️ **Índices compuestos.** `syncPlanToCompanies` combina dos filtros de igualdad
(`channelId` + `planId`, `+ plan`, `+ planName`), y eso exige índice compuesto. Quedaron
declarados en `firestore.indexes.json`; hay que desplegarlos con
`firebase deploy --only firestore:indexes` **antes** de que un `channel_admin` use esa
pantalla, o la consulta falla con `failed-precondition`.

### C5 · Migración de lo existente · 0.5 días — ✅ implementado el 2026-09-16
`scripts/migrate-channels.ts` estampa `channelId: 'directo'` en las empresas y los
planes que no tienen canal. **Por defecto corre en seco** y solo informa; escribe con
`--apply`. Otro canal con `--channel=<id>`. Nunca cambia un canal ya estampado, así que
es idempotente.

```bash
npm run migrate:channels                 # en seco: cuántos hay con y sin canal
npm run migrate:channels -- --apply      # estampa
```

Hasta correrlo, las empresas existentes solo las ve el super admin de plataforma.

Verificado el 2026-09-16 en el **emulador de Firestore** (proyecto `demo-canales`): con
dos empresas y un plan sin canal, más una empresa y un plan ya de `conectate`, la corrida
en seco no escribe; `--apply` estampa `directo` solo en los tres sin canal (incluido uno
con `channelId: ''`) y no toca los de `conectate`; una segunda corrida no encuentra nada.
**Todavía no se corrió contra la base real.**

> El emulador de firebase-tools 15 exige **Java 21+**.

Además, el gateway de Conectate (`weworkscloud/functions/facturaec.js`) ahora firma por
defecto con `role: 'channel_admin'` y `channelId: 'conecta-app'` (~~`conectate`~~ → `conecta-app`, 2026-09-17; variables
`FACTURAEC_INTEGRATION_ROLE` y `FACTURAEC_CHANNEL_ID`). Antes firmaba como `super_admin`
y sin canal. Sus pruebas pasan (10 al 2026-09-17).

### Pantalla de canales — ✅ implementada el 2026-09-16

`/super-admin/channels`, solo para el super admin de plataforma (grupo con `roleGuard` y
oculta en el menú del `channel_admin`).

| Acción | Cómo |
|---|---|
| Crear, editar nombre y contacto | escritura directa en `channels/{id}`; las reglas solo se lo permiten al super admin. El identificador **no se cambia** después de crearlo |
| Suspender / reactivar | campo `status`. **Tiene efecto real:** `assertCallerChannelActive` en los callables y `callerChannelActive()` en las reglas cortan al `channel_admin` de un canal suspendido o inexistente |
| Nombrar / retirar administrador | callable nuevo `manageChannelAdmin` (solo super admin): pone o quita los claims y registra en `channels/{id}.admins.{uid}`. No convierte a un super admin, no mezcla canales y le quita `companyId` al usuario |
| Ver cuántas empresas tiene | `getCountFromServer`, sin bajar documentos |

No se eliminan canales: tienen empresas y claims apuntando a su id. Se suspenden.
`scripts/seed-channel.ts` sigue sirviendo para el arranque, antes de que exista la pantalla
desplegada.

| Archivo | Qué es |
|---|---|
| `functions/src/tenants/manage-channel-admin.ts` | el callable |
| `src/app/features/super-admin/pages/channels/` | la página |
| `src/app/features/super-admin/services/channels.service.ts` | acceso a datos |
| `src/app/features/super-admin/models/channel.interface.ts` | modelo |

Verificado: `tsc` y `jest` de functions (90 pruebas) y `ng build` sin errores. **No se
probó en el navegador**: requiere sesión de super admin contra un proyecto desplegado.

### C6 · Pruebas · 1 día
En emulador, y la prueba que importa es la negativa:

1. El `channel_admin` de `conectate` **no** puede leer una empresa de `mi-buseta`.
2. Tampoco cambiarle el plan, ni por callable ni escribiendo directo.
3. No puede asignar un plan de otro canal a una empresa propia.
4. No puede otorgar `super_admin` ni `channel_admin`.
5. Un update que intente cambiar `channelId` se rechaza.
6. El `super_admin` de plataforma sí ve y opera los dos canales.

**Total: ≈5 días-persona.**

## 5. Criterio de aceptación

Con los dos gateways desplegados y apuntando al mismo FacturaEc, el super admin de
Conectate administra su cartera completa —alta, plan, módulos, cupo— y **no tiene forma
de ver ni tocar una sola empresa de Mi Buseta**, ni por la interfaz, ni por callable, ni
escribiendo directo contra Firestore. El super admin de plataforma sí ve todo.

## 6. Riesgos

| Riesgo | Mitigación |
|---|---|
| Desplegar un gateway antes de esta tarea | no desplegar `callFacturaEc` con `super_admin`: el orden es este plan, después los gateways. **Cumplido para Conectate (2026-09-17):** canales primero, gateway después, firmando como `channel_admin` |
| Empresa sin `channelId` tras la migración | el guard niega por defecto cuando falta el campo, y el script reporta las que quedaron sin estampar |
| Reglas al día pero Angular sin filtrar | C3 y C4 se despliegan juntos |
| El canal se manda en el payload | el `channelId` sale **siempre** del token, igual que el rol |
| Cambiar de canal una empresa por error | `channelId` inmutable desde el cliente; moverla es operación de plataforma |

## 7. Lo que este plan no toca

- **La emisión y la contabilidad.** No cambian: siguen escritas una sola vez, acá.
- **Sub-canales o revendedores.** Descartado por ahora.
- **`exchangeToken`.** Es el camino de la sesión en la web de FacturaEc, no el de los
  gateways. Si se despliega, su claim de rol tendrá que llevar también el `channelId`.
