# GPS Tracking Platform - Frontend

Sistema de rastreo GPS empresarial multi-tenant desarrollado con Angular 21 y CoreUI.

## Requisitos Previos

- Node.js >= 18.x
- npm >= 9.x
- Angular CLI >= 21.x

## Instalacion

```bash
# Clonar el repositorio
git clone <repository-url>
cd coreui-gps-front-web

# Instalar dependencias
npm install
```

## Configuracion

### Variables de Entorno

Los archivos de configuracion se encuentran en `src/environments/`:

- `environment.ts` - Configuracion de desarrollo
- `environment.prod.ts` - Configuracion de produccion

```typescript
export const environment = {
  production: false,
  apiGpsUrl: 'http://localhost:3020',  // URL del backend
  // ... otras configuraciones
};
```

## Comandos Disponibles

### Desarrollo

```bash
# Iniciar servidor de desarrollo
npm start
# o
ng serve

# El servidor estara disponible en http://localhost:4200
```

### Produccion

```bash
# Compilar para produccion
npm run build
# o
ng build

# Los archivos se generan en: dist/coreui-free-angular-admin-template/
```

### Otros Comandos

```bash
# Ejecutar tests unitarios
npm test

# Ejecutar linter
npm run lint

# Generar componente
ng generate component nombre-componente

# Generar servicio
ng generate service nombre-servicio
```

## Estructura del Proyecto

```
src/
├── app/
│   ├── core/                 # Servicios, guards, interceptors, interfaces
│   │   ├── guards/           # Auth y permission guards
│   │   ├── interceptors/     # HTTP interceptors
│   │   ├── interfaces/       # TypeScript interfaces
│   │   └── services/         # Servicios globales
│   ├── features/             # Modulos de funcionalidad (lazy-loaded)
│   │   ├── devices/          # Gestion de dispositivos
│   │   ├── users/            # Gestion de usuarios
│   │   ├── organizations/    # Gestion de organizaciones
│   │   ├── monitor/          # Monitoreo en tiempo real
│   │   ├── routes/           # Historial de rutas
│   │   ├── geofences/        # Geocercas
│   │   └── alerts/           # Alertas
│   ├── layout/               # Layout principal con sidebar
│   ├── shared/               # Componentes compartidos
│   └── views/                # Vistas demo de CoreUI
├── assets/                   # Recursos estaticos
└── environments/             # Configuracion por ambiente
```

## Despliegue en Produccion

### 1. Compilar el proyecto

```bash
npm run build
```

### 2. Archivos generados

Los archivos de produccion se encuentran en:
```
dist/coreui-free-angular-admin-template/
├── browser/
│   ├── index.html
│   ├── main-*.js
│   ├── polyfills-*.js
│   ├── styles-*.css
│   └── assets/
```

### 3. Desplegar en servidor web

Copiar el contenido de `dist/coreui-free-angular-admin-template/browser/` a tu servidor web (Nginx, Apache, S3, etc.)

#### Configuracion Nginx (ejemplo)

```nginx
server {
    listen 80;
    server_name tu-dominio.com;
    root /var/www/gps-frontend/browser;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache para archivos estaticos
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

#### Configuracion Apache (.htaccess)

```apache
<IfModule mod_rewrite.c>
    RewriteEngine On
    RewriteBase /
    RewriteRule ^index\.html$ - [L]
    RewriteCond %{REQUEST_FILENAME} !-f
    RewriteCond %{REQUEST_FILENAME} !-d
    RewriteRule . /index.html [L]
</IfModule>
```

## Tecnologias Utilizadas

| Tecnologia | Version | Proposito |
|------------|---------|-----------|
| Angular | 21.1.0 | Framework principal |
| TypeScript | 5.9.3 | Tipado estatico |
| CoreUI Angular | 5.6.7 | UI Components |
| RxJS | 7.8.2 | Programacion reactiva |
| Leaflet | 1.9.4 | Mapas interactivos |
| CryptoJS | 4.2.0 | Encriptacion localStorage |

## Autenticacion y Permisos

El sistema implementa RBAC (Role-Based Access Control) con los siguientes roles:

| Rol | Nivel | Descripcion |
|-----|-------|-------------|
| super_admin | 0 | Acceso total al sistema |
| org_admin | 1 | Admin de organizacion |
| org_manager | 2 | Gestor de organizacion |
| operator | 3 | Operador |
| viewer | 4 | Solo lectura |
| driver | 5 | Conductor |

## Soporte

Para reportar problemas o solicitar funcionalidades, crear un issue en el repositorio.

---

*Ultima actualizacion: Febrero 2026*
