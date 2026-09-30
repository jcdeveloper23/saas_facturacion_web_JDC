---
name: Cloud Functions Agent — SaasFacturacion Backend
description: Experto en las Cloud Functions de SaasFacturacion (Node.js 22 + Firebase Functions v2 + Firebase Admin SDK). Implementa setup-company (copia defaults al tenant), auth triggers, generación de XML SRI, firma electrónica y envío al SRI. Conoce el patrón de lectura de /platform/defaults/.
---

# Cloud Functions Agent — SaasFacturacion Backend

## Stack
```
Runtime: Node.js 22 (desde 2026-09-30; antes 20) · firebase-functions 7 · firebase-admin 13
Framework: Firebase Functions v2 (2nd gen)
SDK: firebase-admin (Firestore, Auth, Storage)
Ubicación: coreui-facturasEC-front-web/functions/src/
```

## Estructura de Functions

```
functions/src/
├── auth/
│   └── on-user-created.ts        ← Trigger: nuevo usuario → asignar claims
├── tenants/
│   └── setup-company.ts          ← HTTPS: crear empresa → copiar defaults
├── tools/                        ← Utilidades compartidas
└── index.ts                      ← Exporta todas las functions
```

## Función setup-company (patrón establecido)

```typescript
// Lee defaults de /platform/defaults/{collection}
// Los copia a /companies/{companyId}/{collection}
// Usa WriteBatch (chunked para colecciones grandes)

export const setupCompany = onCall(async (request) => {
  const { companyId } = request.data;

  // 1. Leer platform defaults
  const [taxRates, paymentTerms, ...] = await Promise.all([
    db.collection('platform/defaults/taxRates').get(),
    db.collection('platform/defaults/paymentTerms').get(),
    // ...
  ]);

  // 2. Copiar al tenant con WriteBatch
  const batch = db.batch();
  taxRates.docs.forEach(doc => {
    const ref = db.collection(`companies/${companyId}/taxRates`).doc();
    batch.set(ref, { ...doc.data(), createdAt: now, updatedAt: now });
  });
  await batch.commit();
});
```

## Patrón: Leer Platform Defaults

```typescript
// ✅ CORRECTO: leer SIN filtro .where() si los datos pueden no tener el campo
const snap = await db.collection(`platform/defaults/${collection}`).get();

// ❌ INCORRECTO: puede devolver vacío si los documentos no tienen 'isActive'
const snap = await db.collection(`platform/defaults/${collection}`)
  .where('isActive', '==', true).get();
```

## Auth Trigger — Custom Claims

```typescript
export const onUserCreated = auth.user().onCreate(async (user) => {
  // Asignar claims básicos al crear usuario
  // El companyId se asigna en el flujo de onboarding
  await admin.auth().setCustomUserClaims(user.uid, {
    role: 'user',
    companyId: null
  });
});
```

## Reglas para Cloud Functions

```typescript
// 1. Siempre verificar auth
if (!request.auth) throw new HttpsError('unauthenticated', 'No autenticado');

// 2. Siempre validar inputs
if (!companyId || typeof companyId !== 'string') {
  throw new HttpsError('invalid-argument', 'companyId inválido');
}

// 3. Log estructurado para debugging
console.log('[setup-company] Inicio:', { companyId });
console.log('[setup-company] taxRates leídos:', taxRates.docs.length);

// 4. Manejo de errores explícito
try {
  // operación
} catch (error) {
  console.error('[setup-company] Error en batch:', error);
  throw new HttpsError('internal', 'Error al configurar empresa');
}
```

## Colecciones que se Copian al Crear Empresa

```
/platform/defaults/taxRates        → /companies/{id}/taxRates
/platform/defaults/paymentTerms    → /companies/{id}/paymentTerms
/platform/defaults/documentSeries  → /companies/{id}/documentSeries
/platform/defaults/warehouses      → /companies/{id}/warehouses
/platform/defaults/currencies      → /companies/{id}/currencies
/platform/defaults/countries       → /companies/{id}/countries
```

## Comandos de Deploy y Testing

```bash
# Emular localmente
cd functions && npm run serve

# Deploy solo functions
firebase deploy --only functions

# Deploy función específica
firebase deploy --only functions:setupCompany

# Ver logs en tiempo real
firebase functions:log --only setupCompany
```

## Establecimientos (2026-09-22)

- `functions/src/utils/establishments.ts`: `normalizeSriCode`, `resolveEmissionSeries`,
  `resolveEstablishmentAddress`, `buildMainEstablishment`, y los de puntos de emisión
  (`normalizeEmissionPointList`, `resolveDefaultEmissionPoint`, `assertEmissionPointsExist`,
  `canUseEmissionPoint`).
- `setupCompany` siembra la matriz; los 4 generadores de XML usan la serie del documento;
  `createCompanyUser` / `updateCompanyUser` aceptan `emissionPoints` y
  `defaultEmissionPoint` (validados contra los establecimientos).
- ~~⏳ `canUseEmissionPoint` aún no se usa en `createAndEmitInvoice`~~ → sí, desde `2f2b9d0`
  (producción 2026-09-24). ⏳ Sigue sin usarse en `onPosSaleComplete` (el Admin SDK salta
  las reglas).
- Deploy siempre con nombres: nunca `--only functions` a secas (publicaría `getAuthToken`).

Detalle completo en `establishments_agent.md`.

## Estado al 2026-09-30 — lo que no hay que repetir

- **Runtime: Node 22**, `firebase-functions` 7 (`^7.2.5`), `firebase-admin` 13 (`^13.10.0`)
  (`32ead22`, `functions/package.json`). Las **85 functions** de `accounting-system-a5c9f`
  están en `nodejs22` (`functions:list`, 2026-09-30).
- ⛔ **Nunca `firebase deploy --only functions` a secas**: publicaría `getAuthToken`
  (`functions/src/utils/get-auth-token.ts`), que devuelve un ID token con correo y
  contraseña **sin autenticación previa**. Siempre `--only functions:a,functions:b`. Para
  redesplegar todo, **`scripts/deploy-node22.sh`** (`4a6112c`): 4 tandas con nombre
  (contabilidad · otros · empresas-usuarios-portal · pipeline del SRI), **una a la vez**,
  con su log; la del SRI al final y después una factura de prueba en `OG4ydEyOAhtsNmkOjc1P`.
  ⚠️ El script se generó con **81** functions: las 4 posteriores (`importInvoices`,
  `getPlatformSmtp`, `savePlatformSmtp`, `portalListCompanyUsers`) **no están** en sus
  tandas.
- ⛔ **Las functions que comparten un módulo se despliegan JUNTAS**, calculadas por el
  **grafo de imports** (cada una lleva dentro su copia del código que importa; la lección
  de `onInvoiceEmit`). Tocar `smtp-helper.ts` = redesplegar las 21 que envían correo.
- ⛔ **No se despliega nada sin que el usuario lo pida** (desde el 2026-09-30).
- **El `npm install` del predeploy** (`firebase.json` → `npm --prefix functions install`)
  **reescribe `functions/package-lock.json`** en cada deploy: descartarlo con
  `git checkout functions/package-lock.json`. Tampoco entran en commits
  `firebase-debug.log`, `functions/node_modules` ni `functions/lib` (están versionados).
- **Las 3 programadas** (`runMonthlyDepreciation`, `detectOverdueTasksScheduled`,
  `generateWeeklyReport`) dan **403 de Cloud Scheduler** (`cloudscheduler.jobs.update`) al
  redesplegar: **sin efecto** (quedan en `nodejs22` y su tarea las sigue disparando). Para
  que no marque error, el dueño del proyecto debe dar `roles/cloudscheduler.admin` a
  `admin@weconnect.com.ec`.
- **`importInvoices`** (`824cf64` + `bfb256c`, `functions/src/invoices/import-invoices.ts`):
  importar facturas y NC desde XML **por el servidor**; exige admin de la empresa, consulta
  al SRI por la clave y guarda el comprobante que devuelve el SRI (`verifiedWithSri: true`,
  `functions/src/utils/sri-xml-import.ts`). `imported-xml` es solo del servidor.
- **Reglas:** el cliente **no crea ni marca** facturas `authorized` (`e1afe5e`) y **no edita**
  una autorizada: `invoiceAuthorizedGuard()` (`5948d63`, `firestore.rules` ~L237) deja pasar
  solo URLs, `sriError`, notas, cobro y anulación.
- **Información adicional por factura** (`f0f07e3`): `functions/src/utils/additional-info.ts`
  (`buildAdditionalInfo` / `validateAdditionalInfoInput`) — la de cada factura + la de la
  empresa + el correo del comprador, sin vacíos y con tope de 15, en XML y RIDE.
- **SMTP de plataforma en Secret Manager** (`958c898`): secreto `facturaec-smtp-platform`,
  callables `getPlatformSmtp` / `savePlatformSmtp` (solo `super_admin`), y
  `platform/defaults/smtpConfig` **cerrado al navegador** en las reglas.
- **`ECONNRESET` con el SRI:** desde Node 20 el agente HTTP reutiliza sockets y el SRI
  cierra los inactivos. Llamar al SRI con `new https.Agent({ keepAlive: false })` y
  reintentar **solo** fallos de red (`bfb256c`, como `sendToSri`).

## Anti-patrones
- Relanzar excepciones en triggers Firestore (causa reintentos infinitos)
- Usar `firebase` (SDK cliente) en lugar de `firebase-admin`
- `.where('isActive', '==', true)` sin garantizar que todos los docs tienen ese campo
- Funciones sin logging intermedio (imposible debug en producción)
- WriteBatch con más de 500 operaciones (dividir en chunks de 400)
- Operaciones costosas sin timeout configurado (Functions v2: máx 60min, default 60s)
