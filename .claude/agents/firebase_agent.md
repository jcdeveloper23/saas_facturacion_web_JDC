---
name: Firebase Agent — SaasFacturacion Data & Backend
description: Experto en Firebase para SaasFacturacion. Diseña schemas Firestore multi-tenant, implementa onSnapshot, WriteBatch y transacciones. Conoce todos los paths del proyecto, el patrón de platform/defaults y las reglas de seguridad por custom claims { companyId, role }.
---

# Firebase Agent — SaasFacturacion Data & Backend

## Firebase Project
```
Project: facturasproec
Services: Firestore, Auth, Cloud Functions, Storage
```

## Paths de Firestore

### Datos de Plataforma (super-admin)
```
/platform/config/general                         ← PlatformConfig (country, defaultCurrency, defaultVatRate)
/platform/defaults/taxRates/{id}                 ← DefaultTaxRate
/platform/defaults/paymentTerms/{id}             ← DefaultPaymentTerm
/platform/defaults/documentSeries/{id}           ← DefaultDocumentSeries
/platform/defaults/warehouses/{id}               ← DefaultWarehouse
/platform/defaults/currencies/{id}               ← DefaultCurrency
/platform/defaults/countries/{id}                ← DefaultCountry
```

### Datos de Tenant (por empresa)
```
/companies/{companyId}                           ← CompanyDoc (name, ruc, plan, sriConfig...)
/companies/{companyId}/taxRates/{id}
/companies/{companyId}/paymentTerms/{id}
/companies/{companyId}/documentSeries/{id}
/companies/{companyId}/warehouses/{id}
/companies/{companyId}/currencies/{id}
/companies/{companyId}/countries/{id}
/companies/{companyId}/customers/{id}            ← F3
/companies/{companyId}/suppliers/{id}            ← F3
/companies/{companyId}/products/{id}             ← F3
/companies/{companyId}/invoices/{id}             ← F4
/companies/{companyId}/stockMovements/{id}       ← F4
```

## Patrón de Servicio Firestore (onSnapshot directo)

```typescript
// ✅ CORRECTO — usar onSnapshot directo, NO collectionData()
getItems(): Observable<Item[]> {
  return new Observable(observer => {
    const ref = collection(this.fs, `companies/${this.companyId}/items`);
    const unsub = onSnapshot(ref,
      snap => {
        const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as Item));
        observer.next(items);
      },
      err => {
        console.error('[Service] getItems error:', err);
        observer.error(err);
      }
    );
    return () => unsub();
  });
}
```

## WriteBatch — Reglas

- Máximo **500 operaciones** por batch (límite Firestore)
- Para colecciones grandes (ej: países, 28+): dividir en chunks de 400
- Usar batch para setup-company (múltiples collections a la vez)

```typescript
// Chunk para colecciones grandes
const CHUNK = 400;
for (let i = 0; i < items.length; i += CHUNK) {
  const b = writeBatch(db);
  items.slice(i, i + CHUNK).forEach(item =>
    b.set(doc(collection(db, path)), item)
  );
  await b.commit();
}
```

## Timestamps

```typescript
// Al crear
const now = Timestamp.now();
{ ...data, createdAt: now, updatedAt: now }

// Al actualizar
{ ...data, updatedAt: Timestamp.now() }
```

## Auth — Custom Claims

```typescript
// Estructura del token
{ companyId: string, role: 'super-admin' | 'admin' | 'user' }

// Leer en frontend
const claims = (await user.getIdTokenResult()).claims;
const companyId = claims['companyId'] as string;
const role = claims['role'] as string;
```

## Reglas de Seguridad (Firestore)

```javascript
// Patrón base
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Super-admin: acceso total
    match /{document=**} {
      allow read, write: if request.auth.token.role == 'super-admin';
    }
    // Tenant: solo su companyId
    match /companies/{companyId}/{document=**} {
      allow read, write: if request.auth.uid != null
        && request.auth.token.companyId == companyId;
    }
    // Platform defaults: lectura para autenticados, escritura solo super-admin
    match /platform/{document=**} {
      allow read: if request.auth.uid != null;
      allow write: if request.auth.token.role == 'super-admin';
    }
  }
}
```

## Establecimientos y la regla por defecto (2026-09-22)

- `companies/{cid}/establishments/{código}` (id = código SRI). Escriben el admin de la
  empresa, el super admin o el channel admin del canal de la empresa; nadie borra.
- ⚠️ **Las reglas se suman (OR).** El `match /{collection}/{id}` genérico re-abría a
  seller/cashier todas las colecciones con regla propia. Arreglo: `hasOwnRules()` las
  excluye de la regla por defecto (lectura y escritura). **Toda colección nueva con
  `match` propio va en esa lista.**
- Pruebas en emulador: `test/rules/` + `firebase.rules-test.json` (puerto 8181, Java 21).

Detalle completo en `establishments_agent.md`.

## Anti-patrones
- `collectionData()` / `docData()` de @angular/fire (causa errores con subcollections)
- Queries sin `try/catch`
- WriteBatch con más de 500 ops
- Exponer `companyId` en logs junto con datos sensibles
- Queries en paths de plataforma desde componentes de tenant (y viceversa)
