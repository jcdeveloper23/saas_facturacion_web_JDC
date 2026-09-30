---
name: Angular Agent — SaasFacturacion Frontend
description: Experto en Angular 21 standalone components con CoreUI 5.x para SaasFacturacion. Implementa páginas CRUD, modales, tablas, formularios reactivos con signals, lazy-loading y el layout con sidebar de CoreUI. Conoce todos los feature modules del proyecto y los patrones establecidos.
---

# Angular Agent — SaasFacturacion Frontend

## Stack y Versiones
```
Angular: 21
UI Library: @coreui/angular 5.x + @coreui/icons-angular
Reactivity: Angular signals (signal(), computed(), effect())
Forms: ReactiveFormsModule con FormBuilder
Routing: loadComponent() lazy-loading
Subscriptions: Subscription class + ngOnDestroy
Firestore: onSnapshot directo (NO collectionData/docData)
```

## Estructura del Proyecto

```
src/app/
├── core/
│   ├── guards/         ← authGuard, roleGuard
│   ├── interceptors/
│   └── services/       ← auth.service, notification.service, firestore.service
├── features/
│   ├── super-admin/    ← F2: tenants, planes, defaults
│   │   ├── layout/     ← SuperAdminLayoutComponent + _nav.ts
│   │   ├── pages/      ← companies, plans, defaults/*
│   │   ├── services/   ← platform-defaults.service.ts
│   │   └── models/     ← platform-defaults.interface.ts
│   ├── settings/       ← F3: config empresa (currencies, countries, warehouses...)
│   │   ├── pages/      ← company-settings, currencies, countries, etc.
│   │   └── services/   ← settings.service.ts
│   └── users/          ← F1: gestión usuarios
├── layout/
│   └── default-layout/ ← DefaultHeaderComponent, DefaultFooterComponent
└── shared/
    └── components/     ← ToastContainerComponent, etc.
```

## Patrón de Componente CRUD (seguir siempre)

```typescript
@Component({
  selector: 'app-[feature]',
  templateUrl: './[feature].component.html',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    CardComponent, CardBodyComponent, TableDirective, BadgeComponent,
    ButtonDirective, SpinnerComponent, RowComponent, ColComponent,
    ModalComponent, ModalHeaderComponent, ModalBodyComponent, ModalFooterComponent,
    ModalTitleDirective, ButtonCloseDirective,
    FormLabelDirective, FormControlDirective, AlertComponent, IconDirective
  ]
})
export class [Feature]Component implements OnInit, OnDestroy {
  private svc = inject([Feature]Service);
  private notifications = inject(NotificationService);
  private fb = inject(FormBuilder);
  private subs = new Subscription();

  items = signal<[Entity][]>([]);
  loading = signal(true);
  showModal = signal(false);
  saving = signal(false);
  editingId = signal<string | null>(null);
  errorMessage = signal('');

  form = this.fb.group({ ... });

  ngOnInit(): void { this.subs.add(this.svc.getAll().subscribe({ ... })); }
  ngOnDestroy(): void { this.subs.unsubscribe(); }

  trackById(_: number, item: { id: string }): string { return item.id; }
  hasError(f: string): boolean {
    const c = this.form.get(f); return !!(c?.invalid && c?.touched);
  }
}
```

## Nav Items (CoreUI)

```typescript
// _nav.ts — usar iconComponent, NO children para items flat
export const navItems: INavData[] = [
  { title: true, name: 'Sección' },
  { name: 'Label', url: '/ruta', iconComponent: { name: 'cil-icon' } },
];

// En el layout component — SIEMPRE signal():
readonly navItems = signal(navItems);
// En HTML: [navItems]="navItems()"
```

## Reglas de Estilo para Templates

- Usar `@if` / `@for` (sintaxis de control flujo Angular 17+, NO `*ngIf/*ngFor`)
- `@for (item of items(); track trackById($index, item))`
- Iconos: `<svg cIcon name="cilNombre"></svg>` (camelCase con prefijo `cil`)
- Badges de estado: `<c-badge [color]="item.isActive ? 'success' : 'secondary'">`
- Modales: `[visible]="showModal()" (visibleChange)="showModal.set($event)"`

## Módulos Feature por Fase

```
F3: customers, suppliers, products, product-families
F4: invoices, stock
F5: electronic-invoicing
F6: quotes, orders, pos
F7: dashboard
```

## Establecimientos (2026-09-22)

- Pantalla `features/settings/pages/establishments/` (ruta opcional `:id` para el super
  admin, `/super-admin/companies/:id/establishments`). `SettingsService` con `onSnapshot`
  y `companyId` opcional.
- El menú de la empresa sale de `/modules` en Firestore (entrada `settings_establishments`),
  no de `_nav.ts`. No re-correr `seed-modules.ts`.
- Puntos de emisión por usuario (`7f41090`): tarjeta en el formulario de usuarios; en
  factura, retención y nota de débito el punto se ve arriba y se filtra con
  `EmissionPointAccessService`. Al editar, respetar la serie del comprobante
  (`seriesOptions()`), aunque ya no esté entre los puntos del usuario.

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
- `collectionData()` / `docData()` de AngularFire (usar onSnapshot directo)
- `*ngIf` / `*ngFor` en lugar de `@if` / `@for`
- Componentes sin `standalone: true`
- Lógica de negocio en componentes (va en servicios)
- `navItems` como array plano sin `signal()` en el layout
