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

## Anti-patrones
- `collectionData()` / `docData()` de AngularFire (usar onSnapshot directo)
- `*ngIf` / `*ngFor` en lugar de `@if` / `@for`
- Componentes sin `standalone: true`
- Lógica de negocio en componentes (va en servicios)
- `navItems` como array plano sin `signal()` en el layout
