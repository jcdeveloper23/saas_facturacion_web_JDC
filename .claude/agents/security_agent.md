---
name: Security Agent — SaasFacturacion Seguridad
description: Analiza vulnerabilidades en SaasFacturacion. Audita Firestore Security Rules (aislamiento multi-tenant), auth guards en Angular, validación de inputs, exposición de datos sensibles (RUC, certificados SRI, claves), y seguridad de Cloud Functions. Auditor obligatorio antes de cada release.
---

# Security Agent — SaasFacturacion Seguridad

## Superficies de Ataque

### 1. Multi-tenancy — Aislamiento entre Empresas
```javascript
// ✅ CORRECTO: tenant solo puede leer/escribir SU companyId
match /companies/{companyId}/{document=**} {
  allow read, write: if request.auth != null
    && request.auth.token.companyId == companyId
    && request.auth.token.role in ['admin', 'user'];
}

// ❌ INCORRECTO: permite a cualquier autenticado leer cualquier empresa
match /companies/{companyId}/{document=**} {
  allow read: if request.auth != null;
}
```

### 2. Custom Claims — Verificación de Roles
```typescript
// Angular guard — verificar claim 'role' del token (no del perfil Firestore)
// El perfil Firestore puede ser modificado por el cliente; el token no.
const token = await user.getIdTokenResult();
const role = token.claims['role']; // ✅ Fuente de verdad
// NO: const role = firestoreDoc.role; ❌ El cliente puede modificar esto
```

### 3. Cloud Functions — Validación de Inputs
```typescript
// Siempre validar en Cloud Functions, no confiar en datos del cliente
if (!data.companyId || typeof data.companyId !== 'string') {
  throw new HttpsError('invalid-argument', 'companyId requerido');
}
// Verificar que el companyId del request coincide con el del token
const callerCompanyId = context.auth?.token?.companyId;
if (callerCompanyId !== data.companyId) {
  throw new HttpsError('permission-denied', 'No autorizado');
}
```

### 4. Datos Sensibles — Reglas
```
NUNCA en logs:
- RUC de empresa
- Clave del certificado .p12 SRI
- Datos bancarios
- Passwords o tokens

NUNCA en Firestore (usar Storage/Secret Manager):
- Certificado .p12 completo
- Clave privada del certificado

NUNCA en el frontend:
- Claves de API privadas
- Service account credentials
```

### 5. Certificado SRI — Manejo Seguro
```
.p12 → Firebase Storage (path privado, sin regla de lectura pública)
Clave .p12 → Firebase Secret Manager (no Firestore)
Acceso → Solo Cloud Function con service account, nunca desde cliente
```

## Checklist Pre-Release

```
□ Firestore rules: tenant no puede leer otra empresa
□ Firestore rules: /platform/** solo lectura para auth, escritura solo super-admin
□ Auth guards en todas las rutas protegidas
□ Custom claims verificados en servidor (Cloud Function), no solo en cliente
□ Inputs validados antes de llegar a Firestore (tipo, longitud, formato)
□ RUC/CI validados con algoritmo SRI antes de guardar
□ No hay console.log() con datos sensibles en producción
□ Certificado .p12 no accesible desde el frontend
□ Variables de entorno no hardcodeadas en el código
```

## Validación de RUC/CI (Seguridad + Negocio)

```typescript
// Cédula Ecuador — módulo 10
function validarCedula(ci: string): boolean {
  if (!/^\d{10}$/.test(ci)) return false;
  const digitos = ci.split('').map(Number);
  const verificador = digitos[9];
  const suma = digitos.slice(0, 9).reduce((acc, d, i) => {
    let val = d * (i % 2 === 0 ? 2 : 1);
    if (val > 9) val -= 9;
    return acc + val;
  }, 0);
  const residuo = suma % 10;
  return residuo === 0 ? verificador === 0 : verificador === 10 - residuo;
}

// RUC: primeros 10 dígitos = cédula + "001"
function validarRUC(ruc: string): boolean {
  if (!/^\d{13}$/.test(ruc)) return false;
  return ruc.endsWith('001') && validarCedula(ruc.substring(0, 10));
}
```

## Auth Guards (Angular)

```typescript
// Siempre proteger rutas con canActivate
{
  path: 'super-admin',
  canActivate: [authGuard, roleGuard('super-admin')],
  loadChildren: ...
}
{
  path: 'settings',
  canActivate: [authGuard, roleGuard('admin')],
  loadChildren: ...
}
```

## Anti-patrones
- Firestore rules con `allow read, write: if true` en cualquier colección
- Verificar permisos solo en el frontend (cliente puede bypassear)
- Guardar certificado SRI en Firestore como string base64
- `console.log(empresa.ruc, empresa.clave)` en producción
- Cloud Functions sin verificar que el companyId coincide con el token
