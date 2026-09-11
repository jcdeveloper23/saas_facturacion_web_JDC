# Plan de Integración Mi Buseta ↔ FacturaEc — Contabilidad por institución

**Fecha:** 2026-09-09
**Repos:** `saas_facturacion_web_JDC` (FacturaEc) · `mibusetafrontend` (Angular 6) · stack Java de Buseta
**Decisión que resuelve este documento:** ¿migrar toda la facturación a FacturaEc, o mantener un
documento espejo que dispare el asiento contable?

**Respuesta:** híbrido. Espejo contable para las instituciones que ya facturan; FacturaEc nativo
para las instituciones nuevas. Migración masiva, no.

> ✅ **Decidido el 2026-09-10: se adopta el espejo contable.** El §6 pasa a ser el plan de
> ejecución, con tareas y estimaciones. Las opciones §2 y §3 quedan como registro de por qué.
> La migración completa (§2) no se descarta: se reevalúa cuando haya una institución nueva
> nacida en FacturaEc (Fase 7) y el espejo lleve dos cierres estables.

---

## 1. Lo que cambia porque la contabilidad es de cada institución cliente

Cada institución = **un tenant** (`companies/{companyId}`) en FacturaEc, con su RUC, su plan de
cuentas, sus períodos contables, su plan de suscripción y su contador.

Tres consecuencias que no estaban en el análisis inicial:

### 1.1 Aprovisionamiento por institución — hay un checklist, y es obligatorio

| # | Paso | Cómo | ¿Bloquea el asiento? |
|---|---|---|---|
| 1 | Crear la empresa (RUC, `sri.establishment`, `sri.emissionPoint`) | `setupCompany` | sí |
| 2 | Asignar plan | `assignPlanToCompany` | sí (cupo) |
| 3 | Sembrar el plan de cuentas | botón *Sembrar* en la UI (`seedChartOfAccounts()`) | no, pero los reportes salen vacíos |
| 4 | **Crear un período contable abierto** | módulo Contabilidad → Períodos | **SÍ — es el que más se olvida** |
| 5 | Crear el usuario contador de la institución | `createCompanyUser` | no |
| 6 | Saldos iniciales / asiento de apertura si entran a mitad de ejercicio | `generateOpeningEntry` | no |
| 7 | *(solo si emite en FacturaEc)* subir el `.p12` | `uploadCertificate` | sí para emitir |

> ⚠️ Sin período abierto, `generateJournalEntryFromInvoice` sale con
> `reason: 'no_open_period'` y **el documento queda sin asiento, en silencio**
> (`functions/src/accounting/generate-journal-entry-from-invoice.ts:207`).
> Con N instituciones esto hay que scriptearlo, no hacerlo a mano.

**Buena noticia:** el plan de cuentas no bloquea. `getAccountMapping` cae a un plan de cuentas
estándar de Ecuador si la empresa no configuró el suyo
(`functions/src/accounting/utils/get-account-mapping.ts`), así que el asiento se genera igual.

### 1.2 La autenticación desde el navegador queda descartada

Con un solo tenant se podía discutir un usuario de servicio en `environment.ts`. Con N
instituciones, el cliente necesita operar sobre **muchos** `companyId`, y eso solo lo permite un
token con `role: 'super_admin'` (`create-and-emit-invoice.ts`, chequeo de `isAuthorized`).

Poner una credencial `super_admin` en un bundle JS público entrega **toda la plataforma
FacturaEc** — todos los tenants, no solo Buseta.

⇒ **La opción C es obligatoria**: las credenciales viven en el backend Java de Buseta, que verifica
el token con Firebase Admin SDK y llama a las Functions. El Angular 6 de Mi Buseta habla con su
propio backend, nunca directo con `facturasproec`.
Esto reduce todavía más el trabajo en Angular 6 — que era ya la parte barata.

### 1.3 Hace falta un mapa `institución → companyId`
Mi Buseta debe guardar, por institución, el `companyId` de FacturaEc y su estado de
aprovisionamiento. Sin ese mapa no se sabe a qué tenant mandar cada documento.

---

## 2. Opción A — Migrar toda la facturación a FacturaEc

**Idea:** Mi Buseta deja de emitir; FacturaEc emite todo. Una sola fuente de verdad.

### A favor
- Sin documentos duplicados ni desincronización.
- Se retira el stack Java de facturación (`MiBusetaElectronicBill`, `MiBusetaSriAuthorization`,
  `MiBusetaGcpManager`): tres repos menos que mantener.
- ATS, notas de crédito, notas de débito, retenciones y contabilidad quedan coherentes por
  construcción.

### En contra — el costo real
1. **Secuenciales.** FacturaEc numera con su propio contador
   (`companies/{cid}/counters/invoices`, clave `{estab}_{pto}_{año}`,
   `create-and-emit-invoice.ts:309`), que arranca en 0. Hay que **sembrarlo con el último número
   emitido de cada institución, por establecimiento y punto de emisión**. Si queda mal, se emiten
   secuenciales repetidos o con saltos: eso es un problema tributario, no un bug de software.
2. **Certificados.** Un `.p12` por institución, con su clave, cargado en FacturaEc, y su
   renovación anual pasa a ser problema de la plataforma.
3. **Reescribir el módulo de facturación en Angular 6.** Son `invoice-generator`,
   `externalinvoice`, `massive-billing`, `notecredit*` (3 pantallas), `retentions`, y **las 4
   pantallas de listado duplicadas** que `CLAUDE.md` §5 obliga a tocar juntas. Es la parte más
   crítica y más duplicada del repo más viejo.
4. **Campos propios de Buseta.** El RIDE de Buseta muestra placa, conductor, ruta, alumno.
   En FacturaEc `infoAdicional` sale de `sriConfig` a nivel **empresa**, no por factura
   (`generate-invoice-xml.ts:402`). Ponerlo por documento es trabajo de backend nuevo.
5. **Facturación masiva.** Buseta factura cientos de alumnos por institución cada mes.
   `createAndEmitInvoice` es una factura por llamada, y los planes topan en
   50 / 300 / 1000 / 5000 facturas al mes (`scripts/seed-plans.ts`). Hay que diseñar lotes,
   control de cupo y reintentos.
6. **Riesgo operativo:** se detiene la facturación de un negocio en marcha para migrar.

### Veredicto
Viable, pero es un **proyecto de reescritura**, no una integración. Y el punto 1 es del tipo que
se paga con multas si sale mal. **No como primer paso, y nunca en big-bang para todas las
instituciones a la vez.**

---

## 3. Opción B — Documento espejo (lo que preguntaste)

**Idea:** Mi Buseta sigue emitiendo igual. Después de que el SRI autoriza, replica el documento en
FacturaEc para que el trigger genere el asiento.

### Precisión importante sobre "doble doc"
**No se duplica el Storage.** El espejo no necesita su propio XML ni su propio RIDE: se guarda la
**URL** del PDF que Buseta ya subió a GCS. Lo que se duplica es el *registro contable*, que pesa
unos pocos KB.

Efecto lateral a decidir: `downloadDocument` resuelve rutas dentro del bucket de FacturaEc, así que
descargar el RIDE **desde la UI de FacturaEc** no funcionaría hasta que se soporte `pdfUrl`
externo. Es un ajuste chico, pero hay que quererlo.

### A favor
- **Riesgo operativo cero**: la facturación no se toca.
- Alcance acotado y reversible; se puede activar **institución por institución**.
- Entrega valor contable en semanas, no en trimestres.

### En contra
- Dos fuentes de verdad ⇒ hay que **conciliar**. Un documento que no se sincronizó es un asiento
  que nunca va a existir, y nadie se entera solo. Exige log de sincronización, cola de reintentos
  y un reporte de diferencias por institución y mes.
- Depende de la **Fase 0** (endpoint de ingesta) del lado de FacturaEc.
- El ATS sigue incompleto mientras no entren compras y retenciones.

### Veredicto
Es el camino correcto para lo que necesitas hoy.

---

## 4. Comparativa

| | A — Migrar todo | B — Espejo contable |
|---|---|---|
| Riesgo para la operación | alto | ninguno |
| Trabajo en Angular 6 | reescritura del módulo de facturación | un servicio de push (o nada, si va por el backend Java) |
| Trabajo en FacturaEc | campos por documento, lotes, migración de secuenciales | endpoint de ingesta + guard |
| Migración de secuenciales | obligatoria y delicada | no aplica |
| Certificados `.p12` | uno por institución en FacturaEc | se quedan donde están |
| Fuentes de verdad | una | dos + conciliación |
| ATS correcto | sí | sí (con compras) |
| Time-to-value | trimestres | semanas |
| Reversible | no | sí |

---

## 5. Recomendación: híbrido

1. **Instituciones que ya facturan → espejo contable (B).** No se toca lo que funciona.
2. **Instituciones nuevas → nacen en FacturaEc (A).** Sin migración de secuenciales, sin
   certificado que mover: el caso fácil de A, y sirve de piloto real.
3. **Migrar una institución existente**: solo después de que (2) lleve un par de meses estable, de
   a una, y con la siembra de secuenciales verificada contra el SRI.

---

## 6. Plan por fases

### Fase 0 — FacturaEc: la puerta de ingesta y el retorno · *bloqueante* · 3-4 días + pruebas
**Responsable:** Cloud Functions Agent (este repo).

#### 0.a — Ingesta

- `ingestExternalInvoice` (onCall): acepta un documento **ya autorizado** —
  payload de `createAndEmitInvoice` **más** `fullNumber` real, `accessKey`,
  `authorizationNumber`, `authorizedAt`, `vatSummary`, `pdfUrl` externo.
- Escribe `status: 'issued'`, `sriStatus: 'authorized'`, `source: 'buseta'`, `externalId`;
  **respeta el número que llega** y no toca `counters/invoices`.
- Guard en `on-invoice-emit.ts`: documento pre-autorizado ⇒ `return` antes del SRI y antes del PDF.
- Idempotencia por `externalId` (ya existe el patrón en `create-and-emit-invoice.ts`).
- Rol de integración: evaluar un `role: 'integration'` acotado a ingesta multi-tenant, en vez de
  usar `super_admin` para esto.

#### 0.b — Retorno del asiento

**No hay webhooks en FacturaEc** (verificado: cero ocurrencias en `functions/src/`), y no hacen
falta. La correlación ya existe en los dos sentidos y el retorno es **por consulta**:

```
externalId (Buseta) → companies/{cid}/invoices/{invoiceId}
                              ↓ accountingEntryId
                      journal_entries/{entryId}   (referenceId → invoiceId, reference → fullNumber)
```

Tres adiciones que salen casi gratis ahora y caras cuando ya haya asientos viejos sin ellas:

1. **Copiar `externalId` (y `source`) al asiento.** Hoy el asiento solo guarda `referenceId`
   (`generate-journal-entry-from-invoice.ts`, objeto `entry`), así que ir del asiento al documento
   de Buseta cuesta dos saltos. Con el campo copiado, la conciliación se resuelve en uno.
2. **Persistir por qué NO se generó el asiento.** El trigger evalúa
   `GenerateJournalEntryResult` y lo descarta con un `console.warn`: los cuatro motivos —
   `no_open_period`, `unbalanced`, `already_exists`, `not_ready` — **solo viven en los logs**.
   Un documento puede entrar bien, no contabilizarse nunca y verse idéntico a uno que sí.
   Escribir `accountingStatus` y `accountingReason` en el documento es la diferencia entre un
   reporte que dice "faltan 12" y uno que dice "faltan 12, todas por período cerrado en el
   Colegio B". `regenerateJournalEntry` ya existe para reintentar una vez corregida la causa.
3. **`getAccountingStatus` (onCall), por lote.** Dado `companyId` + una lista de `externalId`,
   devuelve por cada uno `{ accountingEntryId, number, periodId, accountingStatus,
   accountingReason }`. **Por lote desde el principio**: de a uno son miles de llamadas al mes por
   institución.

> Lo que **no** se trae de vuelta: el asiento completo con sus líneas. Buseta necesita saber que
> existe, no replicarlo — copiarlo sería reconstruir la contabilidad del lado equivocado, que es
> exactamente lo que este diseño evita.
>
> Y la respuesta de la ingesta **no puede** traer el `accountingEntryId`: el asiento lo crea el
> trigger después de que la ingesta respondió. Lo que sí devuelve es el `invoiceId`, que Buseta
> debe guardar junto a su factura.

### Fase 0 — desglose de tareas

| # | Tarea | Entregable | Días | Depende de |
|---|---|---|---|---|
| 0.1 | Congelar el contrato del payload de ingesta | contrato escrito y acordado con Buseta | 0.5 | — |
| 0.2 | `ingestExternalInvoice` (onCall) | función + validaciones | 1.5 | 0.1 |
| 0.3 | Guard de documento pre-autorizado en `on-invoice-emit.ts` | no toca SRI ni genera PDF | 0.5 | 0.2 |
| 0.4 | Idempotencia por `externalId` + tests | reenvío no duplica | 0.5 | 0.2 |
| 0.5 | Copiar `externalId` y `source` al asiento | campo en `journal_entries` | 0.25 | — |
| 0.6 | Persistir `accountingStatus` / `accountingReason` | motivo visible en el documento | 0.75 | — |
| 0.7 | `getAccountingStatus` por lote | consulta multi-`externalId` | 1 | 0.5, 0.6 |
| 0.8 | Rol `integration` acotado (o decisión de usar `super_admin`) | claim + reglas | 0.5 | — |
| 0.9 | Pruebas end-to-end en el emulador | suite verde | 1 | todas |
| | | **Total** | **6.5 días-persona** | |

**Criterios de aceptación de la Fase 0** — los cuatro se prueban en el emulador:

1. Documento ingestado con período abierto ⇒ asiento cuadrado, con `referenceId` y `externalId`.
2. Documento ingestado con período **cerrado** ⇒ sin asiento, pero con
   `accountingReason: 'no_open_period'` **en el documento**, no solo en los logs.
3. Reenvío del mismo `externalId` ⇒ mismo `invoiceId`, un solo asiento.
4. El SRI **no** recibe nada: cero llamadas al webservice en todo el flujo.

> El punto 4 es el que hay que probar explícitamente. Es el único fallo de esta integración que
> no se puede deshacer.

---

### Fase 1 — Aprovisionamiento desde el superadmin de Mi Buseta · 13 días-persona
**Decidido el 2026-09-10.** El alta de cada institución **no** se hace con un script del equipo de
FacturaEc: se hace desde el superadmin de Mi Buseta, con un switch por institución. Mi Buseta ya
tiene la información tributaria (`ConsortiumInfo`, `Stablishment`, `SailingPoint`), así que el alta
es una **replicación**, no una carga manual.

Lo mismo aplica a los **períodos contables**: se abren y se cierran desde el superadmin de Buseta.
Es lo que tapa el agujero del `no_open_period` — deja de depender de que alguien se acuerde.

#### 1.a — FacturaEc: exponer el aprovisionamiento como API · 5 días

> ⚠️ **Hallazgo que obliga a esta sub-fase.** Hoy solo `setupCompany` es callable. **Sembrar el
> plan de cuentas y crear períodos contables se hacen directo contra Firestore desde el frontend
> Angular 21** (`chart-of-accounts.service.ts` usa `writeBatch`; `accounting-periods.service.ts`
> usa `addDoc`/`updateDoc`). Desde Mi Buseta eso es inalcanzable: el aprovisionamiento hay que
> exponerlo como API antes de poder dispararlo desde afuera.

| # | Tarea | Entregable | Días |
|---|---|---|---|
| 1.1 | `seedChartOfAccounts` como callable | siembra desde API, idempotente por código de cuenta | 1 |
| 1.2 | `upsertAccountingPeriod` callable — crear, abrir y cerrar | períodos gestionables desde afuera | 1 |
| 1.3 | `provisionCompany`: orquesta `setupCompany` → plan → cuentas → período → usuario contador | una llamada, idempotente y re-ejecutable | 1.5 |
| 1.4 | `getCompanyProvisioningStatus` | el switch sabe en qué estado está cada institución | 0.5 |
| 1.5 | Pruebas en emulador | suite verde | 1 |

#### 1.b — Buseta (Java): replicación de la información tributaria · 4 días

| # | Tarea | Entregable | Días |
|---|---|---|---|
| 1.6 | Mapper `ConsortiumInfo` + `Stablishment`/`SailingPoint` → payload de `provisionCompany` | mapper + tests | 1.5 |
| 1.7 | `POST /instituciones/{id}/facturaec/activar` + consulta de estado | endpoint del switch | 1.5 |
| 1.8 | Proxy de períodos contables: listar, abrir, cerrar | endpoints para la pantalla | 1 |

**El mapeo es casi 1:1** — por eso conviene replicar y no volver a capturar:

| Mi Buseta (`ConsortiumInfo`) | FacturaEc (`provisionCompany`) |
|---|---|
| `socialReason` | `name`, `sri.businessName` |
| `ruc` | `taxId`, `sri.ruc` |
| `address` | `fiscalAddress` |
| `phone`, `email` | `phone`, `email` |
| `accounting` | `sri.accountingRequired` |
| `environment` | `sri.environment` — **ver la trampa de abajo** |
| `Stablishment.stablishmentCode` | `sri.establishment` |
| `SailingPoint` (punto de emisión) | `sri.emissionPoint` |

Lo que **no** está en Buseta y hay que resolver en la UI: `city`, `planId`/`planName` y
`subscriptionEnd` (los elige el superadmin al activar el switch), y `contributorType`.

> 🛑 **Trampa de mapeo — `environment`.** Mi Buseta usa un número con la convención
> **invertida respecto del SRI**: en `consortiumInfo.ts` dice `1: Producción // 2: Pruebas`,
> mientras que el SRI usa 1 = pruebas y 2 = producción. FacturaEc espera un **string**, y decide
> con `company.sri.environment === 'production' ? '2' : '1'`
> (`generate-invoice-xml.ts:214`). El mapeo correcto es explícito:
> `environment === 1 ? 'production' : 'testing'`. Mapearlo "natural" por número da de alta a la
> institución en el ambiente equivocado.

#### 1.c — Buseta (Angular 6): pantallas en el superadmin · 4 días

| # | Tarea | Entregable | Días |
|---|---|---|---|
| 1.9 | Switch «Contabilidad en FacturaEc» en el listado de instituciones, con confirmación que muestra los datos a replicar antes de enviar | columna + modal | 2 |
| 1.10 | Pantalla de períodos contables por institución: abrir, cerrar, ver el vigente | pantalla nueva | 1.5 |
| 1.11 | Declararlas en `superadmin.module.ts` + `npx tsc -p src/tsconfig.app.json --noEmit` | build limpio | 0.5 |

Esto **reabre trabajo en Angular 6**, que hasta ahora el plan no tenía. Aplican las restricciones
del repo (Angular 6.0.0, TS 2.7.2, sin `?.`, componentes declarados a mano en el módulo) y los
agentes de `mibusetafrontend/.claude/agents/facturaec/`.

**Criterio de aceptación de la Fase 1:** un superadmin de Mi Buseta activa el switch de una
institución que nunca estuvo en FacturaEc y, sin que nadie toque FacturaEc, queda creada con plan,
plan de cuentas, período abierto y usuario contador. Volver a activarlo no duplica nada.

**Por qué vale los 11 días extra:** el alta deja de ser una tarea del equipo de FacturaEc y pasa a
ser autoservicio de Buseta. Eso abarata la Fase 4 de forma no lineal — dar de alta 20 instituciones
deja de ser 20 corridas de un script coordinadas entre dos equipos y pasa a ser 20 switches.

---

### Fase 2 — Buseta (Java): el sincronizador · 11 días-persona ≈ 2-2.5 semanas
**Responsable:** backend Java de Buseta. **Arranca en cuanto 0.1 esté firmado**, no espera al resto
de la Fase 0.

| # | Tarea | Entregable | Días | Depende de |
|---|---|---|---|---|
| 2.1 | Tabla `institución → companyId` + estado de alta | migración de esquema + ABM mínimo | 1 | — |
| 2.2 | Cliente HTTP a las Functions, con caché y renovación de token | cliente reutilizable | 2 | 0.1 |
| 2.3 | Mapeo `Bill`/`BillDetail` → payload de ingesta, **incluido `vatSummary`** | mapper + tests | 2 | 0.1 |
| 2.4 | Cola con reintento exponencial e idempotencia | encolado tras autorización del SRI | 2 | 2.2, 2.3 |
| 2.5 | Log de sincronización persistente | qué se mandó, cuándo, con qué respuesta | 1 | 2.4 |
| 2.6 | Job mensual de conciliación + reporte de diferencias | reporte por institución y mes | 2 | 0.7, 2.5 |
| 2.7 | Pruebas contra el emulador / ambiente de pruebas | suite verde | 1 | todas |

**La tarea que más se subestima es la 2.3.** El `vatSummary` no existe hoy en el modelo de Buseta:
hay que derivarlo agrupando las líneas por tarifa (0, 5, 15). Si sale mal, el asiento se genera
**descuadrado y por diseño no se guarda** — el documento entra y no se contabiliza.

**Criterio de aceptación:** una factura real de Buseta, autorizada por el SRI, aparece
contabilizada en su institución sin intervención manual; y el reporte de conciliación de ese mes
sale en cero diferencias.

---

### Fase 2.b — Consulta de contabilidad desde Mi Buseta · 7 días-persona (≈2.5 asistido)
**Decidido el 2026-09-10.** Los contadores no van a entrar solo a la web de FacturaEc: parte de la
consulta tiene que verse **dentro de Mi Buseta**. Esto responde la pregunta abierta que quedaba y
**reabre trabajo de interfaz** más allá del switch de la Fase 1.c.

#### El alcance hay que graduarlo — son tres niveles con costos muy distintos

| Nivel | Qué se ve en Mi Buseta | Costo | Veredicto |
|---|---|---|---|
| **1 · Por documento** | «ver el asiento de esta factura»: las líneas del asiento en un modal, desde la factura | bajo | ✅ hacer |
| **2 · Libro diario** | listado de asientos por institución y período, con filtros y paginación | medio | ✅ hacer |
| **3 · Mayor, balances, estado de resultados** | los reportes contables completos | **alto y con trampa** | ❌ no reimplementar |

> 🛑 **Por qué el nivel 3 no.** `generateAccountingPdf` **no calcula el reporte**: recibe en `data`
> el resultado ya computado por el frontend Angular 21 de FacturaEc
> (`generate-accounting-pdf.ts:499`). Libro mayor, balance de comprobación y estado de resultados
> se calculan **en el cliente**. Reimplementarlos en Angular 6 significa dos implementaciones del
> mismo reporte que tienen que coincidir al centavo — y con el tiempo no coinciden. El día que
> difieran, nadie sabrá cuál está bien.
>
> Para el nivel 3: **enlace profundo a la web de FacturaEc**. Si más adelante se quiere de verdad
> dentro de Buseta, el camino correcto es que FacturaEc exponga el reporte ya calculado como API,
> no que Buseta lo recalcule.

#### Tareas

| # | Tarea | Frente | Días |
|---|---|---|---|
| 2.b.1 | `listJournalEntries`: asientos por empresa y período, paginado, con filtros por fecha y por documento | Functions | 1.5 |
| 2.b.2 | Extender `getAccountingStatus` para devolver también las líneas del asiento | Functions | 0.5 |
| 2.b.3 | Proxy en el backend Java + caché corta | Java | 1 |
| 2.b.4 | «Ver asiento contable» desde la factura, en modal | Angular 6 | 1.5 |
| 2.b.5 | Pantalla de libro diario por institución, con paginación y filtros | Angular 6 | 2.5 |

**Momento ideal: durante la espera del cierre en paralelo (semanas 4-8).** No compite con nada del
camino crítico y aprovecha una ventana que de otro modo es tiempo muerto.

**Criterio de aceptación:** desde una factura de Mi Buseta se abre su asiento con las líneas
cuadradas, y el libro diario de la institución coincide con el de la web de FacturaEc para el
mismo período.

> ⚠️ **Decisión que esto deja abierta:** para el nivel 3 los contadores necesitan cuenta en
> FacturaEc. Si el requisito es que **no** tengan que entrar nunca a FacturaEc, el nivel 3 deja de
> ser opcional y hay que presupuestarlo aparte — con la API de reportes del lado de FacturaEc,
> nunca recalculando en Angular 6.

---

### Fase 3 — Piloto con UNA institución · 5 días-persona, 3-5 semanas de calendario
**Responsable:** Buseta + el contador de la institución. **El esfuerzo es bajo; el calendario manda.**

| # | Tarea | Entregable | Días | Nota |
|---|---|---|---|---|
| 3.1 | Elegir la institución piloto | criterio escrito | 0.5 | volumen medio, **un solo establecimiento**, contador dispuesto a cuadrar |
| 3.2 | Alta del tenant con el script de la Fase 1 | tenant listo | 0.5 | |
| 3.3 | Backfill de **un mes ya cerrado**, por lotes | mes completo espejado | 1 | con el período contable abierto |
| 3.4 | **Cuadre contra la contabilidad actual** | acta de cuadre firmada por el contador | 2 | criterio de salida: al centavo |
| 3.5 | Un cierre en paralelo | comparación del cierre | 1 | **espera de calendario: hasta 4 semanas** |

**Criterio de salida — es una compuerta, no un hito:** hasta que el balance de esa institución
cuadre al centavo y su cierre en paralelo coincida, **no entra la siguiente**. Es lo que evita
descubrir el mismo defecto multiplicado por veinte contabilidades.

**Elegir bien la institución piloto vale más que apurar la fase.** Una con varios
establecimientos, o con un contador que no vaya a sentarse a cuadrar, convierte dos días de
trabajo en tres semanas de ida y vuelta.

---

### Fase 4 — Rollout por olas · depende de cuántas instituciones sean
**Responsable:** Buseta.

- Olas de **3 a 5 instituciones**, con **una semana entre olas** para que aparezcan los problemas
  de la anterior.
- Con la Fase 1 hecha, el alta es **un switch en el superadmin**: minutos, no medio día. El costo
  por institución pasa a ser la verificación (~0.15 días) más 1 día por ola de seguimiento.
- Cada ola arranca solo si el reporte de conciliación de la ola anterior salió limpio.
- **No se puede estimar el total hasta saber N** (decisión pendiente §8.2).
  Referencia: 20 instituciones ≈ 5 olas ≈ 5-6 semanas de calendario, ~8 días-persona
  (eran ~15 con alta manual).

---

### Fase 5 — Notas de crédito, cobros y anulaciones · 6.5 días-persona
**Puede ir en paralelo con el piloto** (Fase 3), porque no comparte código con el flujo de ventas.

| # | Tarea | Días |
|---|---|---|
| 5.1 | Ingesta de notas de crédito en FacturaEc (`isCreditNote`) | 1.5 |
| 5.2 | Push de NC desde Buseta | 2 |
| 5.3 | Cobros: marcar `isPaid` para disparar el asiento de cobro | 1.5 |
| 5.4 | Anulaciones: mapear `voidedAt` | 1.5 |

Las anulaciones parecen lo menos urgente y no lo son: sin `voidedAt` el ATS queda mal armado.

---

### Fase 6 — Compras · *decisión de negocio, sin estimar*
No se estima hasta responder §8: ¿las carga el contador de cada institución en la web de
FacturaEc, o Buseta las tiene en algún lado? **Sin compras no hay ATS presentable ni balance
real, solo ventas.** Conviene decidirlo antes de la Fase 4, porque define qué se le promete a
cada institución al darla de alta.

---

### Fase 7 — *(opcional)* Primera institución nueva 100% en FacturaEc
Valida la migración completa (§2) sin migrar nada: sin secuencial que sembrar ni certificado que
mover. Es el insumo para reabrir la decisión más adelante.

---

### Calendario estimado

Supone **un desarrollador en Functions y uno en el backend Java**, con dedicación alta. Los "días"
de arriba son días-persona de trabajo efectivo; esto los acomoda en el calendario.

Tres frentes que corren en paralelo: **Functions** (FacturaEc), **Java** (backend de Buseta) y
**Angular 6** (superadmin).

```
            FUNCTIONS            JAVA                 ANGULAR 6
Semana 1    Fase 0 ──────────►   Fase 1.b
            (0.1 firmado el
             día 1 ⇒ desbloquea
             a Java)
Semana 2    Fase 1.a             Fase 2 ──────────►
Semana 3    Fase 1.a termina     Fase 2
Semana 4                         Fase 2 termina       Fase 1.c
Semana 5    ── Fase 3: alta de la institución piloto DESDE EL SWITCH, backfill y cuadre ──
            ── Fase 5 (NC, cobros, anulaciones) en paralelo ──
Semana 6-8  ── Fase 3: cierre en paralelo  ← espera del calendario contable ──
            ── Fase 2.b: consulta de contabilidad desde Mi Buseta (aprovecha la ventana) ──
Semana 9+   ── Fase 4: rollout por olas ──
```

**≈ 10 semanas hasta la primera institución conciliada en producción**, una más que con alta por
script. El rollout va después y depende de N — pero es mucho más barato.

**Total: ≈ 49 días-persona** (Fase 0: 6.5 · Fase 1: 13 · Fase 2: 11 · Fase 2.b: 7 · Fase 3: 5 ·
Fase 5: 6.5), más el rollout. Con desarrollo asistido, ≈15.5 días de desarrollo.

El piloto de la Fase 3 se da de alta **con el switch**, no a mano: así la primera institución real
también prueba la Fase 1.

Dos avisos sobre este calendario:

- **Las semanas 6-8 son espera, no trabajo.** Dependen de cuándo cierre contablemente la
  institución piloto. Si el cierre cae fuera de esa ventana, el calendario se estira sin que nadie
  esté bloqueado: es el momento para adelantar la Fase 5 o la 6.
- **Con dedicación parcial, duplica.** Si los mismos desarrolladores siguen atendiendo el día a
  día de Buseta, esto son 4-5 meses, no 9 semanas.

---

### Estimación con desarrollo asistido

Los días de arriba suponen desarrollo manual. Con asistencia de IA sobre estos repos:

| Fase | Plan base | Asistido |
|---|---|---|
| 0 · Ingesta y retorno | 6.5 | ≈2 |
| 1 · Aprovisionamiento | 13 | ≈4.5 |
| 2 · Sincronizador | 11 | ≈4 |
| 2.b · Consulta desde Mi Buseta | 7 | ≈2.5 |
| 5 · NC, cobros, anulaciones | 6.5 | ≈2.5 |
| **Desarrollo** | **44** | **≈15.5** |
| 3 · Piloto | 5 + 3-5 semanas | **sin cambio** |
| 4 · Rollout | ≈8 | **sin cambio** |

Calendario: **≈10 semanas → ≈6**, y de esas **3-4 son espera** del cierre contable.

**Se comprime** escribir el código: no por teclear más rápido, sino porque el contexto ya está
levantado — repos leídos, contrato completo y trampas identificadas (ambiente SRI invertido,
`vatSummary` inexistente, aprovisionamiento que hoy vive en el frontend). Esa investigación es la
mitad de una estimación de desarrollo y ya está hecha.

**No se comprime** el cierre en paralelo (3-5 semanas), el cuadre con el contador (2 días),
despliegues y certificados, las decisiones de §8, ni **la revisión**: en un sistema tributario,
código escrito más rápido no es código en el que se confíe más rápido — y la parte donde la
asistencia es más veloz es justo donde un error es más caro.

> ⚠️ **La Fase 2 es la estimación más floja.** Los repos Java están en
> `~/Dev/IdeaProjects/MiBusetaMicroServices/` (`MiBusetaElectronicBill`, `MiBusetaEstablishment`,
> `MiBusetaSriAuthorization`, `MiBusetaGcpManager`), pero **no fueron leídos todavía**. Hasta
> explorarlos no se sabe si derivar el `vatSummary` cuesta medio día o tres.

> 🎯 **La restricción real ya no es el código.** Con 13 días de desarrollo contra 3-5 semanas de
> espera contable, hay que **elegir la institución piloto ahora y planificar hacia atrás desde su
> fecha de cierre**. Terminar el desarrollo el día 20 cuando esa institución cerró el 15 cuesta un
> mes entero de espera — más que todo el desarrollo.

---

### Lo que NO está en este plan, a propósito

- **El sincronizador en Angular 6.** Vive en el backend Java (§1.2). Lo único que se hace en
  Angular 6 son las dos pantallas de superadmin de la Fase 1.c, y hablan con el backend de Buseta,
  nunca directo con FacturaEc. Agentes: `mibusetafrontend/.claude/agents/facturaec/`.
- **Los reportes contables completos en Mi Buseta** (mayor, balances, estado de resultados). Se
  consultan en la web de FacturaEc, con enlace profundo desde Buseta. Lo que sí se ve dentro de
  Buseta es el asiento por documento y el libro diario — Fase 2.b, nivel 1 y 2.
- **Migrar el histórico.** El espejo arranca en una fecha de corte. La historia se queda en
  Buseta, donde el SRI obliga a conservarla 7 años.
- **Retirar el stack Java de facturación.** Sigue siendo el sistema que emite.

---

## 7. Riesgos

| Riesgo | Mitigación |
|---|---|
| Documentos que no se sincronizan y nadie nota | log de sincronización + reporte de conciliación mensual (Fase 4) |
| Período contable cerrado o inexistente ⇒ asiento silenciosamente no generado | validar el período en el aprovisionamiento y antes de cada backfill |
| Credencial `super_admin` filtrada | credenciales solo en el backend Java; evaluar rol `integration` |
| Cupo del plan agotado a mitad de mes | dimensionar el plan por volumen real de cada institución antes del alta |
| ATS incompleto por falta de compras | decisión de Fase 6 antes de prometer ATS a las instituciones |
| Migración de secuenciales (solo opción A) | de a una institución, con verificación contra el SRI antes de emitir |

---

## 8. Decisiones pendientes — y qué fase bloquea cada una

| # | Decisión | Bloquea | Cuándo hace falta |
|---|---|---|---|
| 1 | ~~¿Sincronizador en Java o en Angular 6?~~ **Decidido: backend Java** (§1.2) | — | resuelto 2026-09-10 |
| 2 | ¿Cuántas instituciones son, y cuántas facturas al mes la más grande? | **Fase 4** (no se puede estimar el rollout) y el plan a asignar en Fase 1 | antes de la Fase 1 |
| 3 | Fecha de corte por institución: ¿ejercicio en curso o de aquí en adelante? | **Fase 3** (define qué mes se hace backfill) | antes de la Fase 3 |
| 4 | ¿Quién carga las compras? | **Fase 6**, y qué se le promete a cada institución al darla de alta | antes de la Fase 4 |
| 5 | ¿Quién paga el plan de cada tenant: Buseta o la institución? | Fase 1 (qué plan se asigna) | antes de la Fase 1 |

Ninguna bloquea el arranque: **la Fase 0 y la Fase 2 se pueden empezar hoy**. Las decisiones 2 y 5
hacen falta para la primera alta real; la 3 para el piloto; la 4 antes de salir a vender ATS.
