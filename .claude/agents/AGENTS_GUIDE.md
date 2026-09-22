# SaasFacturacion — Sistema Multi-Agente Claude

> Guía de uso del sistema de agentes especializados para el desarrollo de SaasFacturacion
> SaaS ERP Ecuador · Angular 21 + CoreUI 5.x · Firebase · Facturación Electrónica SRI

---

## Arquitectura del Proyecto

```
SaasFacturacion/
├── coreui-facturasEC-front-web/        ← Angular 21 + CoreUI 5.x (Frontend)
│   ├── src/app/features/
│   │   ├── super-admin/                ← Gestión de tenants y plataforma
│   │   ├── settings/                   ← Configuración por empresa
│   │   ├── invoices/                   ← (F4) Facturas de venta
│   │   ├── customers/                  ← (F3) Clientes
│   │   ├── products/                   ← (F3) Productos
│   │   └── electronic-invoicing/       ← (F5) Facturación SRI
│   └── functions/src/                  ← Cloud Functions Node.js 20
│       ├── auth/                       ← Custom claims, setup usuario
│       └── tenants/                    ← setup-company al crear empresa
└── sistemadeventascompletoOptica/       ← PHP legado (referencia funcional)
    ├── ESPECIFICACIONES_MODULOS.md
    └── GUIA_RAPIDA_DESARROLLO.md
```

**Firebase Project:** `facturasproec`
**Firestore paths:**
- Tenants: `/companies/{companyId}/...`
- Plataforma: `/platform/defaults/{collection}/{id}`
- Auth: Custom claims `{ companyId, role }`

---

## Agentes Disponibles (14)

| Agente | Archivo | Especialidad |
|--------|---------|-------------|
| **CEO** | `ceo_agent.md` | Orquestador — descompone tareas y coordina todos los módulos |
| **Angular** | `angular_agent.md` | Componentes standalone, CoreUI 5.x, signals, RxJS, routing |
| **Firebase** | `firebase_agent.md` | Firestore multi-tenant, Auth, onSnapshot, Cloud Functions SDK |
| **Business** | `business_agent.md` | Reglas ERP Ecuador: IVA, SRI, series, multi-empresa |
| **SRI** | `sri_agent.md` | Facturación electrónica SRI Ecuador — clave de acceso, XML, firma |
| **Architecture** | `architecture_agent.md` | Estructura modular, lazy-loading, servicios, interfaces |
| **Security** | `security_agent.md` | Firestore rules, auth guards, custom claims, inputs validation |
| **Cloud Functions** | `cloud_functions_agent.md` | Node.js 20, setup-company, triggers, admin SDK |
| **DevOps** | `devops_agent.md` | Firebase deploy, environments, build Angular, emulators |
| **Establishments** | `establishments_agent.md` | Establecimientos y puntos de emisión, serie de cada comprobante, establecimientos por usuario, reglas y pruebas en emulador (2026-09-22) |
| **TM Architect** | `team_management_agent.md` | Arquitecto del módulo `pkg_team_mgmt` — implementación técnica completa + roadmap |
| **TM Product** | `tm_product_agent.md` | Diseña features del módulo: epics, subtareas, sprints, timer, bug reports |
| **TM Workflow** | `tm_workflow_agent.md` | Define flujos de estado, automatizaciones, notificaciones y roles del módulo |
| **TM Metrics** | `tm_metrics_agent.md` | KPIs, lead time, velocity, workload, reportes ejecutivos y alertas del módulo |

### Sub-sistema Team Management (pkg_team_mgmt)

```
TM Architect ← punto de entrada para cualquier tarea del módulo
   ├── TM Product   → diseño de nuevas funcionalidades
   ├── TM Workflow  → flujos de trabajo y automatizaciones
   └── TM Metrics   → métricas, reportes y alertas
```

---

## Cómo Usar los Agentes

### Opción 1: CEO Agent (recomendado para tareas complejas)

```
"Actúa como CEO Agent de SaasFacturacion. Quiero implementar [FEATURE].
Analiza la tarea, identifica qué módulos del proyecto afecta,
divídela en subtareas y dime qué agentes activar y en qué orden."
```

### Opción 2: Agente Directo (para tareas específicas)

```
"Actúa como Angular Agent de SaasFacturacion.
Crea el componente para [feature] en features/[módulo]/ usando
standalone, signals y CoreUI 5.x."

"Actúa como Firebase Agent de SaasFacturacion.
Diseña el schema de Firestore para [entidad] considerando
multi-tenant bajo /companies/{companyId}/."

"Actúa como SRI Agent de SaasFacturacion.
Implementa [funcionalidad de facturación electrónica]."

"Actúa como Business Agent de SaasFacturacion.
Las reglas de negocio para [proceso] considerando Ecuador son..."

"Actúa como Cloud Functions Agent de SaasFacturacion.
Crea la función que [funcionalidad] con Firebase Admin SDK."
```

### Opción 3: Múltiples Agentes en Paralelo

```
# Ejemplo: Nuevo módulo de Clientes
# 1. Business Agent      → define reglas de negocio (límite crédito, RUC/CI)
# 2. (paralelo) Firebase Agent     → schema Firestore /companies/{id}/customers/
# 2. (paralelo) Architecture Agent → estructura del feature module
# 3. Angular Agent       → implementa list + form + service
# 4. Security Agent      → Firestore rules y auth guards
# 5. Cloud Functions     → si hay triggers o validaciones backend necesarias
```

---

## Mapeo de Tareas a Agentes

### Nuevas Páginas / Componentes UI
```
Nueva lista (tabla CRUD)          → Angular Agent
Nuevo formulario                  → Angular + Business Agents
Modal + validaciones              → Angular Agent
Layout / nav cambios              → Angular Agent (CoreUI)
```

### Datos / Firestore
```
Nuevo schema Firestore            → Firebase Agent
Query multi-tenant                → Firebase Agent
Migración de datos                → Firebase + Architecture Agents
Platform defaults                 → Firebase + Cloud Functions Agents
```

### Módulos de Negocio
```
Clientes / Proveedores            → Business → Angular → Firebase
Productos / Stock                 → Business → Angular → Firebase
Facturas de venta                 → CEO → Business → Angular → Firebase → SRI
Facturación electrónica SRI       → CEO → SRI → Cloud Functions → Firebase
Configuración empresa             → Angular + Firebase Agents
```

### Super Admin / Multi-tenant
```
Nueva funcionalidad super-admin   → Architecture → Angular → Firebase
Nuevos defaults de plataforma     → Firebase + Cloud Functions Agents
Setup de nueva empresa            → Cloud Functions + Firebase Agents
Gestión de planes                 → Business + Angular + Firebase Agents
```

### Team Management (pkg_team_mgmt)
```
Bug técnico (loggedHours, completionPct, CF) → TM Architect
Nueva feature (epics, sprints, timer…)       → TM Product Agent
Flujo de estados, automatizaciones           → TM Workflow Agent
KPIs, lead time, velocity, reportes          → TM Metrics Agent
Implementar feature ya especificada          → TM Architect → Angular/Firebase/CF Agents
Auditoría de reglas Firestore tm-*           → TM Architect + Security Agent
```

### Infraestructura / DevOps
```
Deploy a producción               → DevOps Agent
Configurar emuladores             → DevOps Agent
Nueva Cloud Function              → Cloud Functions + DevOps Agents
Reglas Firestore                  → Security + Firebase Agents
```

### Bugs
```
Bug UI/layout                     → Angular Agent
Bug de datos / query Firestore    → Firebase Agent
Bug en Cloud Function             → Cloud Functions Agent
Bug de autenticación / permisos   → Security Agent
Bug en cálculos (IVA, totales)    → Business Agent
Bug en facturación SRI            → SRI Agent
```

### Decisiones Arquitectónicas
```
Nuevo feature module              → Architecture Agent
Refactor de servicio              → Architecture + Angular Agents
Cambio de schema                  → Architecture + Firebase Agents
Estrategia de cache               → Architecture + Firebase Agents
```

---

## Ejemplos de Prompts por Escenario

### Escenario 1: Nuevo módulo completo (Clientes)
```
"Actúa como CEO Agent de SaasFacturacion.

Quiero implementar el módulo de Clientes (Fase 3).
Referencia funcional: sistemadeventascompletoOptica/ESPECIFICACIONES_MODULOS.md

Necesito:
- Lista de clientes con búsqueda y filtros
- Formulario alta/edición (RUC, cédula, razón social, dirección, email)
- Validación de RUC/CI según SRI Ecuador
- Límite de crédito configurable

Dame el plan completo con agentes y orden de ejecución."
```

### Escenario 2: Factura de venta
```
"Actúa como CEO Agent de SaasFacturacion.

Implementar módulo de Facturas de Venta (Fase 4):
- Lista con filtros por fecha, cliente, estado
- Formulario: cabecera + líneas de detalle inline
- Cálculo automático IVA, descuentos, totales
- Integración con stock (descontar al confirmar)
- Estado: borrador → confirmada → enviada SRI → autorizada

Identifica qué agentes necesito y el orden correcto."
```

### Escenario 3: Facturación electrónica SRI
```
"Actúa como SRI Agent de SaasFacturacion.

Necesito implementar la generación del XML de factura electrónica:
- Clave de acceso 49 dígitos con módulo 11
- Estructura XML según esquema SRI Ecuador
- Campos requeridos para factura: infoTributaria, infoFactura, detalles
- Ambiente: pruebas (1) y producción (2)

El certificado .p12 está en Firebase Storage."
```

### Escenario 4: Bug en cálculo de totales
```
"Actúa como Business Agent de SaasFacturacion.

Al aplicar descuento por línea + descuento global en una factura,
el IVA se calcula sobre el subtotal bruto en lugar del neto.

Regla SRI: el IVA se aplica sobre (subtotal - descuentos).
Archivo afectado: [pegar path del servicio de cálculo]

Analiza el bug y dame la corrección con los casos de prueba."
```

### Escenario 5: Setup de nueva empresa
```
"Actúa como Cloud Functions Agent de SaasFacturacion.

La Cloud Function setup-company (functions/src/tenants/setup-company.ts)
debe leer los defaults de /platform/defaults/ y copiarlos al nuevo tenant.

Actualmente falla cuando [descripción del error].
Logs: [pegar logs de Firebase Functions]

Diagnostica y corrije."
```

### Escenario 6: Auditoría de seguridad
```
"Actúa como Security Agent de SaasFacturacion.

Audita las Firestore Rules del proyecto. Los roles son:
- super-admin: acceso total
- admin: solo su companyId
- user: lectura limitada dentro de su company

Revisa que ningún tenant pueda leer datos de otro."
```

### Escenario 7: Deploy a producción
```
"Actúa como DevOps Agent de SaasFacturacion.

Quiero hacer deploy del estado actual:
- Angular frontend a Firebase Hosting
- Cloud Functions actualizadas
- Reglas Firestore/Storage

Dime el orden correcto y los comandos exactos."
```

---

## Contexto Base para Todos los Agentes

```
Proyecto: SaasFacturacion — SaaS ERP Multi-empresa Ecuador
Firebase Project: facturasproec
Stack: Angular 21 · CoreUI 5.x · Firebase · Node.js 20 (Cloud Functions)

FRONTEND (coreui-facturasEC-front-web/src/app/):
  Arquitectura: Standalone components con signals
  UI: CoreUI 5.x (@coreui/angular, @coreui/icons-angular)
  Auth: Firebase Auth + custom claims { companyId, role }
  Reactive: Angular signals (signal(), computed()), RxJS para streams
  Firestore: onSnapshot directo (NO collectionData/docData de AngularFire)
  Lazy-loading: loadComponent() en routes

FIRESTORE PATHS:
  Multi-tenant:    /companies/{companyId}/{collection}/{docId}
  Platform:        /platform/defaults/{collection}/{docId}
  Platform config: /platform/config/general

CLOUD FUNCTIONS (functions/src/):
  Runtime: Node.js 20 · Firebase Functions v2
  Auth trigger: onCreate usuario → setup usuario con claims
  HTTPS trigger: setup-company → copia defaults de plataforma al tenant

REFERENCIA LEGADO:
  sistemadeventascompletoOptica/ → PHP FacturaScripts
  ESPECIFICACIONES_MODULOS.md   → Especificación funcional de los 14 módulos
  GUIA_RAPIDA_DESARROLLO.md     → Patrones de código de referencia

Idioma: Español (UI y comunicación), Inglés (código: clases, métodos, variables)
País: Ecuador — IVA 15% (o según configuración), SRI como ente regulador
```

---

## Sistema de Aprendizaje

Los agentes acumulan conocimiento en `.claude/agents/learnings/`:

```
learnings/
├── LEARNING_PROTOCOL.md          # Reglas del sistema
├── angular_learnings.md          # Patrones Angular/CoreUI aprendidos
├── firebase_learnings.md         # Queries, schema, anti-patterns Firestore
├── business_learnings.md         # Reglas SRI, IVA, casos borde Ecuador
├── sri_learnings.md              # Estructura XML, claves, rechazos SRI
├── architecture_learnings.md     # Decisiones arquitectónicas tomadas
├── security_learnings.md         # Reglas Firestore, vulnerabilidades
├── cloud_functions_learnings.md  # Patrones Cloud Functions resueltos
└── devops_learnings.md           # Issues de build/deploy resueltos
```

### Triggers para guardar aprendizajes

| Situación | Acción |
|-----------|--------|
| SRI rechaza un XML o clave de acceso | Guardar causa + corrección |
| Bug no trivial resuelto | Guardar issue + solución + archivo |
| Decisión arquitectónica tomada | Guardar contexto + razón |
| Error de Firestore resuelto | Guardar query + fix |
| Regla de negocio Ecuador confirmada | Guardar en business_learnings |

---

## Anti-patrones — Lo que los Agentes NUNCA harán

### Angular
- Usar `collectionData()`/`docData()` de AngularFire (causa errores de tipo con subcollections)
- Suscripciones sin `ngOnDestroy()` + `unsubscribe()`
- Usar `any` cuando hay interfaz disponible en `models/`
- Componentes sin `standalone: true`
- Lógica de negocio dentro de componentes (va en servicios)

### Firestore / Firebase
- Queries sin prefijo `/companies/{companyId}/` en datos de tenant
- `writeBatch` con más de 500 operaciones (límite Firestore)
- Reads sin `try/catch` o manejo de error
- Exponer datos sensibles (certs, claves) en logs

### Cloud Functions
- Relanzar excepciones en triggers Firestore (causa reintentos infinitos)
- Leer hardcoded defaults en lugar de leerlos de `/platform/defaults/`
- Funciones sin logging adecuado (dificulta debug en producción)
- Usar el SDK de cliente (firebase) en lugar de firebase-admin

### SRI / Facturación Electrónica
- Construir XML con concatenación de strings (usar builder XML)
- Hardcodear RUC del emisor (viene de `/companies/{id}/config`)
- Ignorar el módulo 11 para la clave de acceso
- Enviar al ambiente producción sin validar primero en pruebas

### Arquitectura / General
- Crear componentes no-standalone
- Omitir `WriteBatch/Transaction` en operaciones multi-documento
- Duplicar interfaces (usar siempre las de `models/`)
- Feature modules sin lazy-loading en routes
