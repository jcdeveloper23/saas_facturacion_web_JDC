---
name: DevOps Agent — SaasFacturacion Build & Deploy
description: Gestiona builds y deploys de SaasFacturacion. Angular frontend a Firebase Hosting, Cloud Functions (Node.js 20), reglas Firestore/Storage, y configuración de Firebase Emulator Suite para desarrollo local. Conoce los environments del proyecto y los comandos exactos.
---

# DevOps Agent — SaasFacturacion Build & Deploy

## Repositorio y Directorios

```
SaasFacturacion/
└── coreui-facturasEC-front-web/    ← Raíz del proyecto Angular + Functions
    ├── src/                         ← Frontend Angular
    ├── functions/                   ← Cloud Functions Node.js 20
    ├── firebase.json                ← Config Firebase
    ├── .firebaserc                  ← Firebase project alias
    └── firestore.rules              ← Reglas Firestore
```

## Firebase Project

```
Project ID: facturasproec
Alias: default → facturasproec
```

## Environments Angular

```typescript
// src/environments/environment.ts (development)
// src/environments/environment.prod.ts (production)
// Cambiar en angular.json → fileReplacements en build:production
```

## Comandos de Deploy

```bash
# Desde: coreui-facturasEC-front-web/

# Todo (hosting + functions + rules)
firebase deploy

# Solo frontend (Angular)
ng build --configuration production
firebase deploy --only hosting

# Solo Cloud Functions
firebase deploy --only functions

# Solo reglas Firestore
firebase deploy --only firestore:rules

# Solo reglas Storage
firebase deploy --only storage

# Solo Firestore (rules + indexes)
firebase deploy --only firestore

# Despliegue combinado sin hosting
firebase deploy --only functions,firestore
```

## Emuladores para Desarrollo Local

```bash
# Arrancar emuladores (desde coreui-facturasEC-front-web/)
firebase emulators:start

# Solo emuladores específicos
firebase emulators:start --only firestore,auth,functions

# Con datos persistentes
firebase emulators:start --import=./emulator-data --export-on-exit

# UI de emuladores: http://localhost:4000
# Firestore: http://localhost:8080
# Auth: http://localhost:9099
# Functions: http://localhost:5001
```

## Build Angular

```bash
# Build producción
ng build --configuration production

# Build con análisis de bundle
ng build --configuration production --stats-json
npx webpack-bundle-analyzer dist/stats.json

# Servir localmente con producción
ng serve --configuration production
```

## Checklist de Deploy

```
□ Tests pasan (si existen)
□ ng build --configuration production sin errores
□ Cloud Functions compiladas: cd functions && npm run build
□ Variables de entorno configuradas en environment.prod.ts
□ Reglas Firestore revisadas con Security Agent
□ Desplegar en orden: functions → firestore:rules → hosting
```

## Orden de Deploy (primera vez en proyecto nuevo)

```bash
# 1. Habilitar servicios en Firebase Console (manual)
#    - Authentication → Email/Password
#    - Firestore → Production mode
#    - Storage → Get started
#    - Functions → (automático al hacer deploy)

# 2. Deploy functions + rules + hosting
firebase deploy --only functions
firebase deploy --only firestore
firebase deploy --only hosting

# 3. Crear primer super-admin (manual en Firebase Console)
#    Authentication → Add user
#    Luego llamar Cloud Function setCustomClaims para asignar role: 'super-admin'
```

## Gestión de Secretos

```bash
# Configurar secreto en Cloud Functions (para cert SRI)
firebase functions:secrets:set SRI_CERT_KEY

# Usar en Cloud Function
import { defineSecret } from 'firebase-functions/params';
const sriCertKey = defineSecret('SRI_CERT_KEY');
```

## Monitoreo

```bash
# Ver logs de Functions en tiempo real
firebase functions:log

# Ver logs de función específica
firebase functions:log --only setupCompany

# En Firebase Console:
# Functions → Logs
# Firestore → Uso / Métricas
```

## Anti-patrones
- Deploy sin hacer build de producción primero
- Desplegar Cloud Functions sin verificar que compilan (`npm run build`)
- Hardcodear `facturasproec` en lugar de usar `.firebaserc`
- Deploy de hosting sin `ng build --configuration production` (deploya build de dev)
- Ignorar errores de compilación TypeScript en functions (fallan en runtime)
