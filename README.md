# FacturaSec — Frontend

**Node:** 20.19.5 (`nvm use 20.19.5`) · **Angular:** 21.1.x · **Firebase** + **Cloud Functions**

Solución SaaS todo-en-uno para empresas ecuatorianas: facturación electrónica homologada con el SRI, contabilidad, inventario, punto de venta, gestión de flotas GPS y equipos de trabajo — todo en una sola plataforma. Multi-tenant, con firma digital de documentos y emisión autorizada en tiempo real. Desarrollada con Angular 21 standalone components y CoreUI 5.

## Stack Tecnológico

| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| Angular | 21.1.x | Framework principal (standalone components + signals) |
| TypeScript | 5.9.x | Tipado estático |
| CoreUI Angular | 5.6.x | UI Components / Layout con sidebar |
| Firebase / AngularFire | 12.x / 20.x | Auth, Firestore, Hosting, Storage |
| RxJS | 7.8.x | Programación reactiva |
| Chart.js | 4.5.x | Gráficas y reportes |
| Leaflet | 1.9.x | Mapas (GPS / geofences) |
| CryptoJS | 4.2.x | Encriptación en localStorage |

## Requisitos Previos

- Node.js `^20.19.0 || ^22.12.0 || ^24.0.0`
- npm `>= 10`
- Angular CLI `>= 21.x`
- Firebase CLI (`npm install -g firebase-tools`)

## Instalación

```bash
git clone <repository-url>
cd saas_facturacion_web
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

# Deploy de índices
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
│   │   ├── purchases/          # Compras / liquidaciones
│   │   ├── customers/          # Clientes
│   │   ├── products/           # Productos y servicios
│   │   ├── stock/              # Inventario y stock
│   │   ├── pos/                # Punto de venta
│   │   ├── accounting/         # Contabilidad (estados financieros, conciliación, presupuesto)
│   │   ├── personas/           # Personas naturales
│   │   ├── organizations/      # Organizaciones / empresas vinculadas
│   │   ├── users/              # Usuarios y roles
│   │   ├── permissions/        # Gestión de permisos
│   │   ├── profiles/           # Perfiles de usuario
│   │   ├── profile/            # Perfil propio del usuario autenticado
│   │   ├── team-management/    # Gestión de proyectos, tareas y equipos
│   │   ├── devices/            # Dispositivos registrados
│   │   ├── gps-monitor/        # Monitoreo GPS en tiempo real
│   │   ├── geofences/          # Geocercas
│   │   ├── routes/             # Rutas de distribución
│   │   ├── marketplace/        # Marketplace de integraciones
│   │   ├── plans/              # Planes de suscripción
│   │   ├── benefits/           # Beneficios por plan
│   │   ├── alerts/             # Alertas del sistema
│   │   ├── school-bar/         # Módulo bar escolar
│   │   ├── settings/           # Configuración de empresa y SRI
│   │   ├── super-admin/        # Gestión de tenants y plataforma
│   │   └── api-docs/           # Documentación API (Swagger UI)
│   ├── layout/                 # Layout principal con sidebar CoreUI
│   └── shared/                 # Componentes y pipes reutilizables
├── assets/                     # Recursos estáticos
└── environments/               # Configuración por ambiente
functions/                      # Cloud Functions (Node.js 20)
├── src/
│   ├── accounting/             # Contabilidad y reportes financieros
│   ├── auth/                   # Auth triggers (onCreate/onDelete)
│   ├── invoices/               # Generación XML, firma y envío SRI
│   ├── debit-notes/            # Notas de débito electrónicas
│   ├── retentions/             # Comprobantes de retención
│   ├── pos/                    # Punto de venta
│   ├── stock/                  # Inventario
│   ├── marketplace/            # Integraciones marketplace
│   ├── team-management/        # Gestión de equipos y tareas
│   ├── school-bar/             # Bar escolar
│   ├── tenants/                # Setup de nuevos tenants (copia defaults)
│   ├── users/                  # Gestión de usuarios y custom claims
│   └── utils/                  # Utilidades compartidas
firestore.rules                 # Reglas de seguridad Firestore
storage.rules                   # Reglas de seguridad Storage
firebase.json                   # Configuración Firebase
firestore.indexes.json          # Índices compuestos Firestore
```

## Módulos Principales

### Facturación Electrónica (SRI)

| Módulo | Descripción |
|--------|-------------|
| `invoices` | Generación, firma digital y envío de facturas al SRI |
| `debit-notes` | Notas de débito electrónicas |
| `retentions` | Comprobantes de retención |
| `purchases` | Liquidaciones de compra |

### Comercial

| Módulo | Descripción |
|--------|-------------|
| `customers` | CRUD de clientes con validación RUC/CI |
| `products` | Catálogo de productos y servicios |
| `stock` | Inventario, entradas y salidas |
| `pos` | Punto de venta |

### Contabilidad

| Módulo | Descripción |
|--------|-------------|
| `accounting` | Estados financieros, conciliación bancaria, presupuesto y asientos automáticos |

### Gestión de Equipos

| Módulo | Descripción |
|--------|-------------|
| `team-management` | Proyectos, tareas, sprints y productividad (competitivo con Jira/ClickUp) |

### GPS y Logística

| Módulo | Descripción |
|--------|-------------|
| `gps-monitor` | Monitoreo de flota en tiempo real (Leaflet) |
| `geofences` | Definición y alertas de geocercas |
| `routes` | Rutas de distribución |
| `devices` | Dispositivos GPS registrados |

### Administración

| Módulo | Descripción |
|--------|-------------|
| `settings` | Configuración SMTP, certificado .p12, datos SRI |
| `users` | Usuarios y asignación de roles |
| `permissions` | Gestión granular de permisos |
| `super-admin` | Administración de empresas y defaults de plataforma |
| `api-docs` | Documentación interactiva de la API (Swagger UI) |

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

Las Cloud Functions validan el `companyId` del custom claim en cada request. Al crear un nuevo tenant, la función `setup-company` copia los defaults de plataforma al tenant automáticamente.

## Firebase Project

- **Proyecto:** `facturasProEc` (`facturasproec`)
- **Hosting output:** `dist/facturasEC/browser`
- **Functions runtime:** Node.js 20

## Configuración GCP — Permisos requeridos

### Signed URLs para Cloud Storage

Las Cloud Functions generan Signed URLs temporales para que el frontend descargue XMLs y PDFs desde Storage privado. Requiere el permiso `iam.serviceAccounts.signBlob` en el service account.

**Pasos (GCP Console):**

1. Ve a [console.cloud.google.com](https://console.cloud.google.com)
2. Selecciona el proyecto `facturasproec`
3. Menú izquierdo → **IAM & Admin → IAM**
4. Busca: `facturasproec@appspot.gserviceaccount.com`
5. Editar → **+ Add another role** → **Service Account Token Creator** → Save

**O desde terminal:**

```bash
gcloud projects add-iam-policy-binding facturasproec \
  --member="serviceAccount:facturasproec@appspot.gserviceaccount.com" \
  --role="roles/iam.serviceAccountTokenCreator"
```

> Este permiso es necesario una sola vez por proyecto. No requiere redesplegar las funciones.

---

*Última actualización: Agosto 2026*
