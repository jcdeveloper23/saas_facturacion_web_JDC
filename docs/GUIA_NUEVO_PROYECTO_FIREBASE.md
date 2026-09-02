# Guía Práctica: Integrar un Nuevo Proyecto Firebase

> Guía paso a paso para conectar este proyecto Angular a un nuevo proyecto Firebase  
> (ya sea para un cliente nuevo, un ambiente staging/prod separado, o migración de datos).

---

## PASO 1 — Crear el proyecto en Firebase Console

### 1.1 Ir a Firebase Console

Abre: https://console.firebase.google.com

Haz clic en **"Agregar proyecto"** (o "Create a project").

### 1.2 Configurar el proyecto

| Campo | Recomendación |
|-------|---------------|
| Nombre del proyecto | `facturasec-[cliente]-prod` o `facturasec-staging` |
| Project ID | Se genera automático, puedes editarlo (ej: `facturasec-clienteabc`) |
| Google Analytics | Activar si necesitas eventos / conversiones (recomendado para prod) |

Haz clic en **"Crear proyecto"** y espera que termine.

---

## PASO 2 — Pasar el proyecto a plan de pago (Blaze)

> **IMPORTANTE:** Cloud Functions, Cloud Storage con reglas avanzadas, y Cloud Run requieren plan Blaze (pago por uso). Firestore y Auth tienen tier gratuito pero es necesario para desplegar Functions.

### 2.1 Actualizar el plan

1. En el sidebar de Firebase Console, abajo a la izquierda verás el plan actual: **"Spark (free)"**
2. Haz clic en **"Upgrade"**
3. Selecciona **"Blaze — Pay as you go"**
4. Ingresa tarjeta de crédito / facturación de Google Cloud
5. Confirma la actualización

### 2.2 Configurar alertas de presupuesto (RECOMENDADO)

Para evitar sorpresas en la factura:

1. Ve a [Google Cloud Console → Billing → Budgets & alerts](https://console.cloud.google.com/billing)
2. Crea una alerta con umbral en **$10, $25, $50** (según el caso)
3. Envía notificaciones al email del responsable

> El proyecto actual (`facturasproec`) usa Blaze. El costo real con tráfico moderado (< 50 empresas) suele ser < $5/mes.

---

## PASO 3 — Crear Firestore Database

### 3.1 Crear la base de datos

1. En Firebase Console → sidebar → **"Firestore Database"**
2. Clic en **"Create database"**
3. Seleccionar modo de inicio:

| Modo | Cuándo usar |
|------|-------------|
| **Production mode** | Para prod — reglas denegadas por defecto (seguro) |
| **Test mode** | Para dev — acceso abierto 30 días (solo local/staging) |

4. Seleccionar la **ubicación** del servidor:

| Región | Latencia Ecuador | Recomendación |
|--------|-----------------|---------------|
| `us-central1` | ~80ms | ✅ Opción actual del proyecto |
| `us-east1` | ~90ms | Alternativa |
| `southamerica-east1` | ~30ms | Mejor latencia, mayor costo |

> **Usa `us-central1`** para consistencia con el proyecto base y Cloud Functions existentes.

5. Clic en **"Enable"**

### 3.2 Verificar que quedó creada

Debe aparecer la vista de colecciones vacía. Firestore está lista.

---

## PASO 4 — Registrar la app web en Firebase

### 4.1 Agregar app web

1. Firebase Console → Configuración del proyecto (ícono ⚙️) → **"Project settings"**
2. Tab **"Your apps"** → Clic en el ícono `</>`  (Web)
3. App nickname: `facturasec-web`
4. Marcar **"Also set up Firebase Hosting"** si vas a deployar desde aquí
5. Clic en **"Register app"**

### 4.2 Copiar las credenciales

Firebase te mostrará un bloque como este — **cópialo completo**:

```typescript
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "tu-proyecto.firebaseapp.com",
  projectId: "tu-proyecto",
  storageBucket: "tu-proyecto.firebasestorage.app",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123",
  measurementId: "G-XXXXXXX"   // solo si activaste Analytics
};
```

---

## PASO 5 — Conectar el proyecto Angular

### 5.1 Actualizar `environment.ts`

Edita `src/environments/environment.ts`:

```typescript
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3030',
  cloudFunctionsUrl: 'https://us-central1-TU-PROYECTO-ID.cloudfunctions.net',
  firebase: {
    apiKey: "AIzaSy...",
    authDomain: "tu-proyecto.firebaseapp.com",
    projectId: "tu-proyecto",
    storageBucket: "tu-proyecto.firebasestorage.app",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:abc123",
    measurementId: "G-XXXXXXX"
  }
};
```

### 5.2 Actualizar `environment.prod.ts` (para producción)

Edita `src/environments/environment.prod.ts` con los mismos valores (o los del proyecto prod si son distintos).

### 5.3 Actualizar `.firebaserc`

```json
{
  "projects": {
    "default": "tu-proyecto-id"
  }
}
```

---

## PASO 6 — Configurar Firebase CLI localmente

### 6.1 Verificar que Firebase CLI está instalado

```bash
firebase --version
# Si no está: npm install -g firebase-tools
```

### 6.2 Login (si no estás autenticado)

```bash
firebase login
```

### 6.3 Cambiar el proyecto activo

```bash
firebase use tu-proyecto-id
```

### 6.4 Verificar la conexión

```bash
firebase projects:list
# Debe aparecer tu nuevo proyecto con (*) como activo
```

---

## PASO 7 — Activar Authentication

### 7.1 Habilitar Email/Password

1. Firebase Console → **Authentication** → **Sign-in method**
2. Habilitar **Email/Password**
3. (Opcional) Habilitar **Google** si el SaaS lo requiere

### 7.2 Agregar dominio autorizado (para prod)

1. Authentication → Settings → **Authorized domains**
2. Agregar el dominio del cliente (ej: `facturasec.tudominio.com`)

---

## PASO 8 — Desplegar reglas de Firestore y Storage

### 8.1 Desplegar solo reglas (sin Functions)

```bash
firebase deploy --only firestore:rules,storage
```

### 8.2 Verificar en Console

Firestore → Rules — debe mostrar las reglas actualizadas con timestamp reciente.

---

## PASO 9 — Desplegar Cloud Functions

```bash
cd functions
npm install
npm run build
cd ..
firebase deploy --only functions
```

> Las Functions del proyecto (`setup-company`, `send-to-sri`, etc.) se despliegan al nuevo proyecto.

---

## PASO 10 — Verificación final

### Checklist antes de usar en producción

- [ ] Proyecto creado en Firebase Console
- [ ] Plan Blaze activado
- [ ] Firestore creada en `us-central1`
- [ ] App web registrada y credenciales copiadas
- [ ] `environment.ts` y `environment.prod.ts` actualizados
- [ ] `.firebaserc` apuntando al nuevo proyecto
- [ ] `firebase use [proyecto-id]` ejecutado
- [ ] Authentication habilitada (Email/Password)
- [ ] Reglas Firestore y Storage desplegadas
- [ ] Cloud Functions desplegadas
- [ ] Alertas de presupuesto configuradas

---

## Referencia rápida de comandos

```bash
# Ver proyecto activo
firebase use

# Cambiar proyecto
firebase use <proyecto-id>

# Deploy completo
firebase deploy

# Deploy solo hosting
firebase deploy --only hosting

# Deploy solo functions
firebase deploy --only functions

# Deploy solo reglas
firebase deploy --only firestore:rules,storage

# Abrir Firebase Console del proyecto activo
firebase open
```

---

## Notas del proyecto actual

- **Proyecto actual:** `accounting-system-a5c9f`
- **Región Functions:** `us-central1`
- **Build Angular:** `dist/facturasEC/browser`
- **Hosting config:** `firebase.json` → `public: "dist/facturasEC/browser"`

---

## PARTE 2 — Setup de datos del sistema

> Una vez desplegada la infraestructura (reglas, Functions, hosting), hay que inicializar los datos base del SaaS. El orden importa.

---

## PASO 11 — Crear el Super Admin (primera vez)

El sistema tiene un flujo de "primera vez" integrado en la pantalla de login.

### 11.1 Prerrequisitos

Antes de crear el Super Admin deben estar desplegados:
- Cloud Functions (`setupFirstAdmin` disponible)
- Authentication habilitada (Email/Password)
- Firestore creada

### 11.2 Acceder al sistema

Navega a la URL del proyecto (hosting o `localhost:4200` en dev).

En la pantalla de login verás el enlace:

> **"¿Primera vez? Crea el usuario Super Admin para empezar a gestionar el sistema."**

Haz clic en ese enlace.

### 11.3 Completar el formulario

| Campo | Descripción |
|-------|-------------|
| Email | Email del super admin (ej: `admin@weconnect.com.ec`) |
| Contraseña | Mínimo 6 caracteres | weconnect2026
| Confirmar contraseña | Debe coincidir | weconnect2026

### 11.4 Qué hace el sistema internamente

Al confirmar, se llama la Cloud Function `setupFirstAdmin` que:

1. Verifica que **no exista ningún** `super_admin` previo (si ya existe, lanza error)
2. Crea el usuario en **Firebase Authentication**
3. Asigna **custom claims**: `{ role: 'super_admin', companyId: '' }`
4. Registra el usuario en **Firestore** en `/users/{uid}`

### 11.5 Iniciar sesión

Al completarse el registro exitosamente, el formulario de login se auto-rellena con el email y contraseña. Haz clic en **"Iniciar sesión"**.

El sistema redirige automáticamente a `/super-admin` (por rol `super_admin`).

> **Seguridad:** Esta función solo puede ejecutarse una vez. Cualquier intento posterior devuelve error `already-exists`.

---

## PASO 12 — Sembrar los Planes de suscripción

El Super Admin panel tiene una función para sembrar los planes base del SaaS.

### 12.1 Desde el panel Super Admin

1. Ir a **Super Admin → Planes**
2. Buscar el botón **"Sincronizar planes por defecto"** (`syncDefaultPlans`)
3. Esto siembra en Firestore:
   - 5 planes de suscripción (`/plans/{planId}`)
   - 11 paquetes de plugins (`/plugin-packages/{packageId}`)

### 12.2 Verificar en Firestore Console

En Firebase Console → Firestore → debe verse:
```
/plans/
  starter/
  basic/
  professional/
  enterprise/
  ...

/plugin-packages/
  pkg_invoicing/
  pkg_inventory/
  pkg_accounting/
  ...
```

---

## PASO 13 — Sembrar Platform Defaults

Los defaults son los datos base que se copian a cada empresa nueva al crearla (rates de IVA, series de documentos, bodegas, monedas, países, config SRI).

### 13.1 Ejecutar "Inicializar datos de fábrica"

> **Nota:** El botón está en la página **Config General**, no en las sub-páginas individuales. Si entras directo a "Divisas" o "Países" y no ves datos, el mensaje te indica que ejecutes la inicialización — pero el botón está un nivel arriba.

1. Ir a **Super Admin → Plataforma → Datos Plataforma → Config General**
2. En la parte superior derecha aparece el botón:  
   **"Inicializar datos de fábrica"** (ícono de recarga)
3. Confirmar la acción

### 13.2 Qué siembra el botón (en un solo batch)

| Sección | Path Firestore | Datos iniciales |
|---------|---------------|-----------------|
| Config General | `/platform/defaults` | País: Ecuador, Moneda: USD, IVA: 15% |
| Tax Rates | `/platform/defaults/taxRates/` | IVA 15%, 5%, 0%, No objeto, Exento |
| Payment Terms | `/platform/defaults/paymentTerms/` | Contado, 30, 60, 90 días |
| Document Series | `/platform/defaults/documentSeries/` | Serie 001 para cada tipo de doc |
| Warehouses | `/platform/defaults/warehouses/` | Bodega Principal |
| Currencies | `/platform/defaults/currencies/` | USD + 25 monedas latinoamericanas |
| Countries | `/platform/defaults/countries/` | 28 países (Ecuador, región, globales) |
| SRI Config | `/platform/defaults/sriConfig/data` | Endpoints WSDL, taxCodes, versiones |

### 13.3 Verificar resultado

Tras ejecutar, navega a cada sub-sección del menú para confirmar que tienen datos:
- **Divisas** → debe listar USD y otras monedas
- **Impuestos** → debe listar IVA 15%, 5%, 0%
- **Series de Documentos** → debe listar serie 001 por tipo

Si alguna sub-sección sigue vacía, el botón puede ejecutarse nuevamente — es idempotente (no duplica datos).

---

## PASO 14 — Crear la primera empresa (tenant)

La creación de una empresa tiene **dos fases**: el registro inicial desde el Super Admin y la configuración completa desde el panel de la empresa.

---

### FASE A — Registro inicial (Super Admin)

#### 14.1 Ir a Super Admin → Empresas → Nueva empresa

Completar las 4 secciones del formulario:

**Sección 1 — Datos Generales**

| Campo | Descripción | Ejemplo |
|-------|-------------|---------|
| Razón Social | Nombre legal de la empresa | `WeConnect S.A.` |
| Nombre Comercial | Opcional, nombre de marca | `WeConnect` |
| RUC | 13 dígitos válidos Ecuador | `1792012345001` |
| Teléfono | 7 a 15 dígitos | `0999999999` |
| Email | Email corporativo | `admin@weconnect.com.ec` |
| Dirección Fiscal | Dirección completa | `Av. República E7-45` |
| Ciudad | Ciudad del establecimiento | `Quito` |

**Sección 2 — Suscripción**

| Campo | Descripción |
|-------|-------------|
| Plan contratado | Seleccionar de los planes sembrados (Paso 12) |
| Estado cuenta | `Trial` para nuevos, `Activa` si ya pagó |
| Vencimiento | Fecha de fin de suscripción |

> Al seleccionar un plan aparece un preview con sus límites: facturas/mes, usuarios, productos, multi-empresa.

**Sección 3 — Configuración SRI (Ecuador)**

> Esta es la configuración mínima para habilitar facturación electrónica. Se puede ajustar después.

| Campo | Descripción | Valor por defecto |
|-------|-------------|-------------------|
| Razón Social SRI | Nombre exacto registrado en el SRI | igual a Razón Social |
| RUC SRI | RUC de la empresa | igual al RUC general |
| Establecimiento | Código de 3 dígitos del establecimiento | `001` |
| Punto de Emisión | Código de 3 dígitos del punto de emisión | `001` |
| Ambiente | `Pruebas` para empezar, `Producción` cuando esté listo | `Pruebas` |
| Tipo Contribuyente | Persona Jurídica o Natural | `Jurídica` |
| Obligado a llevar contabilidad | Checkbox según designación SRI | depende |

**Sección 4 — Credenciales del Administrador**

| Campo | Descripción |
|-------|-------------|
| Contraseña temporal | Mínimo 6 caracteres. Usar el botón **Generar** para una contraseña segura |

> Guarda la contraseña antes de crear — es la única vez que se muestra.  
> El email del admin es el mismo que ingresaste en "Datos Generales".

#### 14.2 Qué hace el sistema al crear la empresa

La Cloud Function `setupCompany` ejecuta automáticamente:

1. Lee el plan desde `/plans/{planId}`
2. Copia todos los defaults desde `/platform/defaults/` a la empresa nueva
3. Crea `/companies/{companyId}` con toda la configuración
4. Crea subcollecciones: `warehouses`, `taxRates`, `paymentTerms`, `documentSeries`, `currencies`, `countries`
5. Crea `/companies/{companyId}/configuration/sri` y `configuration/general`
6. Crea el usuario admin en Firebase Auth con **custom claims**: `{ role: 'admin', companyId }`

#### 14.3 Verificar en Firestore

```
/companies/{companyId}/
  configuration/
    general
    sri
  taxRates/
  paymentTerms/
  documentSeries/
  warehouses/
  currencies/
  countries/
  company-users/{adminUid}
```

---

### FASE B — Configuración de Facturación Electrónica y Contabilidad

> Esta fase la realiza el **Admin de la empresa** (no el Super Admin) desde el panel de la empresa.

#### 14.4 Iniciar sesión como Admin de la empresa

Usa el email y contraseña temporal creados en la Fase A.  
El sistema redirige a `/dashboard`.

#### 14.5 Ir a Configuración de Empresa

Menú → **Configuración** → **Mi Empresa**

La página tiene varias pestañas. Completar en este orden:

---

**Pestaña: Mi Empresa**

Datos generales visibles en documentos (facturas, retenciones, etc.).

| Campo | Descripción |
|-------|-------------|
| Razón Social, RUC, Dirección | Verificar que coincidan con el SRI |
| Teléfono, Email | Datos de contacto |
| Sitio web | Opcional |

> Al completar los campos aparece un indicador de **"% Perfil de Empresa"** arriba a la derecha.

---

**Pestaña: Apariencia**

Subir el logo de la empresa — aparecerá en las facturas y documentos PDF.

- Formato: PNG o JPG
- Recomendado: fondo transparente o blanco
- El sistema lo guarda en Firebase Storage

---

**Pestaña: Facturación SRI** ⭐ _Crítica_

Esta es la configuración más importante para activar la facturación electrónica.

**Bloque 1 — Datos SRI**

| Campo | Descripción |
|-------|-------------|
| RUC | 13 dígitos registrados en el SRI |
| Razón Social | Nombre exacto del RUC |
| Ambiente SRI | `Pruebas` hasta validar; luego `Producción` |
| Establecimiento | `001` (primer establecimiento) |
| Punto de Emisión | `001` (primera caja/punto) |
| Tipo Contribuyente | Jurídica / Natural |
| Contribuyente Especial | Solo si el SRI lo designó (número de resolución) |
| Obligado a llevar Contabilidad | Checkbox — afecta los XML generados |

**Bloque 2 — Certificado de Firma Electrónica (.p12)**

El certificado `.p12` es obligatorio para firmar los XML enviados al SRI.

| Paso | Acción |
|------|--------|
| 1 | Seleccionar el archivo `.p12` con el botón de carga |
| 2 | Ingresar la contraseña del certificado |
| 3 | Clic en **"Subir Certificado"** |

> El sistema lo sube a Firebase Storage de forma segura. La pestaña muestra **"Firma OK"** cuando está cargado.

**¿Dónde obtener el certificado .p12?**  
Lo emiten las **Entidades de Certificación acreditadas por el BCE / ARCOTEL**:
- BCE (Banco Central del Ecuador)
- Security Data
- FirmaSegura
- Lazzate
- ANF AC / UANATACA

> El certificado tiene vigencia de 2 años. Renovarlo antes de que expire para no interrumpir la facturación.

---

**Pestaña: XML**

Configuración técnica que se incluye en el cuerpo de cada comprobante XML enviado al SRI.

| Campo | Descripción |
|-------|-------------|
| Dirección del Establecimiento | Dirección exacta del punto de emisión |
| Obligado a llevar Contabilidad | `SI` / `NO` — campo obligatorio en el XML |
| Contribuyente Especial | Número de resolución si aplica |

> Estos datos van directamente dentro del XML según la Ficha Técnica del SRI v2.34.

---

#### 14.6 Configuración de Contabilidad

Si la empresa está **obligada a llevar contabilidad**, configurar el módulo contable:

1. Menú → **Contabilidad** → **Plan de Cuentas**
2. Verificar que el plan de cuentas base esté inicializado (se copia de los defaults al crear la empresa)
3. Configurar los parámetros contables según el tipo de empresa:

| Parámetro | Descripción |
|-----------|-------------|
| Período fiscal | Enero–Diciembre (Ecuador) |
| Moneda contable | USD |
| Método de inventario | Promedio ponderado (más común en Ecuador) |

---

#### 14.7 Checklist de configuración completa por empresa

- [ ] Empresa creada desde Super Admin con plan asignado
- [ ] Admin puede iniciar sesión y llega a `/dashboard`
- [ ] Pestaña "Mi Empresa" — datos generales completos
- [ ] Pestaña "Apariencia" — logo subido
- [ ] Pestaña "Facturación SRI" — datos SRI guardados
- [ ] Pestaña "Facturación SRI" — certificado `.p12` subido (muestra "Firma OK")
- [ ] Pestaña "XML" — campos técnicos completados
- [ ] Ambiente SRI en `Pruebas` → validar una factura de prueba antes de pasar a `Producción`
- [ ] Contabilidad inicializada (si obligado)

---

## PASO 15 — Verificación completa del sistema

### Checklist de datos

- [ ] Super Admin creado y puede hacer login
- [ ] Redirige a `/super-admin` correctamente
- [ ] Planes sembrados en `/plans/`
- [ ] Plugin packages sembrados en `/plugin-packages/`
- [ ] Platform defaults configurados en `/platform/defaults/`
- [ ] Primera empresa creada en `/companies/{id}/`
- [ ] Admin de empresa puede hacer login
- [ ] Admin redirige a `/dashboard` correctamente

### Flujo de roles confirmado

| Usuario | Custom Claims | Redirige a |
|---------|--------------|------------|
| Super Admin | `{ role: 'super_admin', companyId: '' }` | `/super-admin` |
| Admin empresa | `{ role: 'admin', companyId: 'XXX' }` | `/dashboard` |
| Vendedor | `{ role: 'seller', companyId: 'XXX' }` | `/dashboard` |

---

## Glosario básico

**Firebase Project**
Es el contenedor principal en Google Firebase. Todo vive dentro de él: la base de datos, los usuarios, el hosting, las funciones. Equivale a un "espacio de trabajo" separado por cliente o ambiente.

**Firestore**
La base de datos del proyecto. No tiene tablas como SQL — organiza los datos en *colecciones* (como carpetas) y *documentos* (como archivos JSON). Ejemplo: la colección `/companies/` contiene un documento por cada empresa registrada.

**Cloud Functions**
Código backend que corre en los servidores de Google, sin necesidad de un servidor propio. Se ejecutan bajo demanda (cuando el frontend las llama) o por eventos (cuando se crea un usuario, etc.). En este proyecto hacen el trabajo pesado: crear empresas, firmar XMLs, enviar al SRI.

**Custom Claims**
Son etiquetas extra que Firebase añade al token de autenticación de cada usuario. Sirven para saber qué rol tiene y a qué empresa pertenece, sin consultar la base de datos en cada petición. Ejemplo: `{ role: 'admin', companyId: 'empresa-abc' }`. El sistema los lee al iniciar sesión y decide a qué pantalla redirigir.

**Token de autenticación**
Es una cadena de texto cifrada que Firebase genera al hacer login. Contiene la identidad del usuario y sus custom claims. Se renueva automáticamente cada hora. El frontend lo incluye en cada petición para que el backend sepa quién está operando.

**Tenant**
Una empresa registrada dentro del SaaS. El sistema es *multi-tenant*: múltiples empresas comparten la misma base de código e infraestructura, pero cada una tiene sus datos completamente aislados bajo `/companies/{companyId}/`.

**Super Admin**
El usuario que gestiona la plataforma SaaS completa — crea empresas, asigna planes, configura defaults globales. No pertenece a ninguna empresa en particular (`companyId` vacío). Es el primer usuario que se crea al inicializar el sistema.

**Platform Defaults**
Datos base guardados en `/platform/defaults/` que se copian automáticamente a cada empresa nueva al crearla. Evitan tener que configurar manualmente el IVA, las series de documentos, etc. en cada tenant.

**Plan Blaze**
El plan de pago de Firebase (pago por uso). Necesario para poder usar Cloud Functions, Storage avanzado y otros servicios. Sin él, el proyecto queda limitado al plan gratuito (Spark) que no permite desplegar funciones backend.

**deploy**
Publicar el código al servidor para que quede disponible en producción. En este proyecto se usan tres tipos: `hosting` (el frontend Angular), `functions` (el backend), y `firestore:rules` (los permisos de la base de datos).

**Firebase CLI**
Herramienta de línea de comandos (`firebase`) que permite gestionar proyectos Firebase desde la terminal: hacer deploys, cambiar de proyecto activo, ver logs, etc.

**`.firebaserc`**
Archivo de configuración local que indica a la CLI de Firebase a qué proyecto apuntar. Es el equivalente a "estoy trabajando en este proyecto ahora mismo".

---

*Guía en construcción — se irán agregando pasos a medida que se avanza.*
