# FacturaSec — Frontend

node 20.19.5
nvm use 20.19.5
ng s
angular 21.1.4
firebase
cloud functions


SaaS de facturación electrónica para Ecuador. Multi-tenant, integración con SRI, firma digital y emisión de documentos electrónicos. Desarrollado con Angular 21 y CoreUI 5.

## Stack Tecnológico

| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| Angular | 21.1.x | Framework principal (standalone components) |
| TypeScript | 5.9.x | Tipado estático |
| CoreUI Angular | 5.6.x | UI Components / Layout |
| Firebase / AngularFire | 12.x / 20.x | Auth, Firestore, Hosting |
| RxJS | 7.8.x | Programación reactiva |
| Chart.js | 4.5.x | Gráficas y reportes |
| Leaflet | 1.9.x | Mapas |
| CryptoJS | 4.2.x | Encriptación en localStorage |

## Requisitos Previos

- Node.js `^20.19.0 || ^22.12.0 || ^24.0.0`
- npm `>= 10`
- Angular CLI `>= 21.x`
- Firebase CLI (`npm install -g firebase-tools`)

## Instalación

```bash
git clone <repository-url>
cd coreui-facturasec-front-web
npm install
```

## Configuración

Los entornos se encuentran en `src/environments/`:

- `environment.ts` — desarrollo local
- `environment.prod.ts` — producción

Incluyen la configuración de Firebase (apiKey, projectId, etc.) y URLs de Cloud Functions.

## Comandos

### Desarrollo

```bash
npm start
# Disponible en http://localhost:4200
```

### Compilar para Producción

```bash
ng build --configuration production
```

Output generado en: `dist/facturasEC/browser/`

### Desplegar en Firebase Hosting

```bash
# Build + deploy en un solo paso
ng build --configuration production && firebase deploy --only hosting

# Solo deploy (si ya compilaste)
firebase deploy --only hosting
```

### Cloud Functions

```bash
# Deploy de funciones
firebase deploy --only functions

# Deploy de indexs
firebase deploy --only firestore:indexes

# Deploy completo (hosting + functions + rules)
firebase deploy
```

### Tests

```bash
npm test
```

## Estructura del Proyecto

```
src/
├── app/
│   ├── core/                   # Guards, interceptors, interfaces, servicios globales
│   │   ├── guards/             # AuthGuard, RoleGuard
│   │   ├── interceptors/       # HTTP interceptors
│   │   ├── interfaces/         # TypeScript interfaces globales
│   │   └── services/           # Servicios compartidos (auth, config)
│   ├── features/               # Módulos de funcionalidad (lazy-loaded)
│   │   ├── invoices/           # Facturas electrónicas
│   │   ├── debit-notes/        # Notas de débito
│   │   ├── retentions/         # Retenciones
│   │   ├── customers/          # Clientes
│   │   ├── products/           # Productos / servicios
│   │   ├── personas/           # Personas naturales
│   │   ├── settings/           # Configuración de empresa y SRI
│   │   ├── super-admin/        # Gestión de tenants y plataforma
│   │   ├── users/              # Usuarios y roles
│   │   ├── plans/              # Planes de suscripción
│   │   ├── alerts/             # Alertas del sistema
│   │   └── ...                 # Otros módulos
│   ├── layout/                 # Layout principal con sidebar CoreUI
│   └── shared/                 # Componentes y pipes reutilizables
├── assets/                     # Recursos estáticos
└── environments/               # Configuración por ambiente
functions/                      # Cloud Functions (Node.js 20)
firestore.rules                 # Reglas de seguridad Firestore
storage.rules                   # Reglas de seguridad Storage
firebase.json                   # Configuración Firebase
```

## Módulos Principales

| Módulo | Descripción |
|--------|-------------|
| `invoices` | Generación, firma y envío de facturas al SRI |
| `debit-notes` | Notas de débito electrónicas |
| `retentions` | Comprobantes de retención |
| `customers` | CRUD de clientes con validación RUC/CI |
| `products` | Catálogo de productos y servicios |
| `settings` | Configuración SMTP, certificado .p12, datos SRI |
| `super-admin` | Administración de empresas y defaults de plataforma |

## Autenticación y Roles

El sistema usa Firebase Auth con custom claims para RBAC multi-tenant:

| Rol | Descripción |
|-----|-------------|
| `super_admin` | Acceso total a la plataforma |
| `admin` | Administrador de empresa (tenant) |
| `contador` | Emisión y consulta de documentos |
| `viewer` | Solo lectura |

## Multi-Tenant

Cada empresa (tenant) opera bajo su propio `companyId`. Los datos en Firestore siguen la estructura:

```
/companies/{companyId}/...      # Datos del tenant
/platform/defaults/...          # Configuración base de la plataforma
```

Las Cloud Functions validan el `companyId` del custom claim en cada request.

## Firebase Project

- **Proyecto:** `facturasProEc` (`facturasproec`)
- **Hosting output:** `dist/facturasEC/browser`
- **Functions runtime:** Node.js 20

## Configuración GCP — Permisos requeridos

### Signed URLs para Cloud Storage

Las Cloud Functions generan Signed URLs temporales para que el frontend pueda descargar XMLs y PDFs de facturas desde Storage privado. Esto requiere el permiso `iam.serviceAccounts.signBlob` en el service account.

**Pasos (GCP Console):**

1. Ve a [console.cloud.google.com](https://console.cloud.google.com)
2. Selecciona el proyecto `facturasproec`
3. Menú izquierdo → **IAM & Admin → IAM**
4. Busca el service account: `facturasproec@appspot.gserviceaccount.com`
5. Haz clic en el icono de lápiz (editar)
6. Clic en **+ Add another role**
7. Busca y selecciona: **Service Account Token Creator**
8. Clic en **Save**

**O desde terminal:**

```bash
gcloud projects add-iam-policy-binding facturasproec \
  --member="serviceAccount:facturasproec@appspot.gserviceaccount.com" \
  --role="roles/iam.serviceAccountTokenCreator"
```

> Este permiso es necesario una sola vez por proyecto. No requiere redesplegar las funciones.

---

*Última actualización: Abril 2026*


