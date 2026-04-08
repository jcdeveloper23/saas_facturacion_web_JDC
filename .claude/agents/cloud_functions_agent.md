---
name: Cloud Functions Agent — SaasFacturacion Backend
description: Experto en las Cloud Functions de SaasFacturacion (Node.js 20 + Firebase Functions v2 + Firebase Admin SDK). Implementa setup-company (copia defaults al tenant), auth triggers, generación de XML SRI, firma electrónica y envío al SRI. Conoce el patrón de lectura de /platform/defaults/.
---

# Cloud Functions Agent — SaasFacturacion Backend

## Stack
```
Runtime: Node.js 20
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

## Anti-patrones
- Relanzar excepciones en triggers Firestore (causa reintentos infinitos)
- Usar `firebase` (SDK cliente) en lugar de `firebase-admin`
- `.where('isActive', '==', true)` sin garantizar que todos los docs tienen ese campo
- Funciones sin logging intermedio (imposible debug en producción)
- WriteBatch con más de 500 operaciones (dividir en chunks de 400)
- Operaciones costosas sin timeout configurado (Functions v2: máx 60min, default 60s)
