import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { catchError, of, Subject, takeUntil } from 'rxjs';
import {
  CardModule, ButtonModule, GridModule, BadgeModule,
  SpinnerModule, TableModule, FormModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';
import { take } from 'rxjs/operators';

import { HasPermissionDirective } from '../../shared/directives/has-permission.directive';
import { PersonasService }    from './services/personas.service';
import { SettingsService }    from '../settings/services/settings.service';
import { NotificationService } from '../../core/services/notification.service';
import {
  Person, PersonRole, TaxIdType,
  ROLE_LABELS, ROLE_PLURAL_LABELS, ROLE_COLORS,
  getPersonCode
} from './models/person.interface';
import { PaymentTerm } from '../settings/models/settings.interfaces';

// ─── Filter types ─────────────────────────────────────────────────────────────

type TypeFilter = 'all' | PersonRole | 'inactive';

interface PrimaryFilters {
  taxIdType: '' | TaxIdType;
}

interface SecondaryFilters {
  isCompany: '' | 'true' | 'false';
  hasEmail:  '' | 'true' | 'false';
  hasPhone:  '' | 'true' | 'false';
}

const PRIMARY_DEFAULTS:   PrimaryFilters   = { taxIdType: '' };
const SECONDARY_DEFAULTS: SecondaryFilters = { isCompany: '', hasEmail: '', hasPhone: '' };

// ─── Component ────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-personas-list',
  standalone: true,
  templateUrl: './personas-list.component.html',
  styles: [`
    /* ── Page header ──────────────────────────────────────────────── */
    .page-title    { font-weight: 600; line-height: 1; }
    .page-subtitle { font-size: .76rem; color: var(--cui-secondary-color); }

    .page-icon {
      width: 36px; height: 36px;
      background: linear-gradient(135deg, #20a8d8 0%, #1b8eb7 100%);
      border-radius: 10px;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 2px 8px rgba(32,168,216,.4);
      flex-shrink: 0;
    }

    /* Stat strip */
    .stat-strip {
      display: flex; align-items: center; flex-wrap: wrap;
      gap: 4px 0;
      background: var(--cui-card-bg);
      border: 1px solid var(--cui-border-color);
      border-radius: 10px;
      padding: 5px 12px;
      width: fit-content;
    }
    .stat-item {
      display: flex; align-items: center; gap: 4px;
      padding: 2px 12px; font-size: .78rem;
      cursor: pointer; border-radius: 6px;
      transition: background .15s;
    }
    .stat-item:hover { background: var(--cui-tertiary-bg); }
    .stat-value { font-weight: 700; font-size: .88rem; }
    .stat-label { color: var(--cui-secondary-color); font-size: .72rem; }
    .stat-sep   { width: 1px; height: 16px; background: var(--cui-border-color); flex-shrink: 0; }

    /* ── Filter card ──────────────────────────────────────────────── */
    .filter-card  { border-radius: 12px !important; }
    .filter-top   { background: var(--cui-card-bg); }
    .filter-divider { height: 1px; background: var(--cui-border-color); margin: 0 -16px; }

    /* Segment tabs */
    .seg-tabs {
      display: flex; gap: 2px;
      background: var(--cui-tertiary-bg);
      border: 1px solid var(--cui-border-color);
      border-radius: 9px; padding: 3px;
    }
    .seg-tab {
      font-size: .78rem; font-weight: 400;
      padding: 4px 12px; border-radius: 6px;
      border: none; background: transparent;
      color: var(--cui-secondary-color);
      cursor: pointer; transition: all .15s;
      display: flex; align-items: center; gap: 5px;
      white-space: nowrap;
    }
    .seg-tab:hover { color: var(--cui-body-color); }
    .seg-tab.active {
      background: var(--cui-card-bg);
      border: 1px solid var(--cui-border-color);
      color: var(--cui-info);
      font-weight: 500;
    }
    .seg-count {
      font-size: .65rem; font-weight: 700;
      background: var(--cui-secondary-bg);
      color: var(--cui-secondary-color);
      border-radius: 999px;
      padding: 0 5px; min-width: 18px;
      text-align: center; line-height: 1.6;
    }

    /* Clear all */
    .filter-clear-btn {
      font-size: .75rem;
      color: var(--cui-danger);
      background: var(--cui-danger-bg-subtle);
      border: 1px solid var(--cui-danger-border-subtle);
      border-radius: 6px; padding: 4px 10px;
      cursor: pointer; display: flex; align-items: center; gap: 4px;
      transition: background .15s; white-space: nowrap;
    }
    .filter-clear-btn:hover { filter: brightness(.95); }

    /* Search */
    .search-wrap {
      position: relative; display: flex; align-items: center;
      min-width: 220px;
    }
    .search-icon {
      position: absolute; left: 10px;
      color: var(--cui-secondary-color); pointer-events: none;
    }
    .search-input {
      width: 100%; padding: 6px 32px;
      border: 1px solid var(--cui-border-color);
      border-radius: 8px; font-size: .83rem;
      background: var(--cui-input-bg);
      color: var(--cui-body-color);
      outline: none; transition: border-color .15s, box-shadow .15s;
    }
    .search-input::placeholder { color: var(--cui-secondary-color); }
    .search-input:focus {
      border-color: var(--cui-info);
      box-shadow: 0 0 0 3px rgba(var(--cui-info-rgb), .15);
    }
    .search-clear {
      position: absolute; right: 8px;
      background: none; border: none; padding: 2px;
      color: var(--cui-secondary-color); cursor: pointer;
      display: flex; align-items: center;
    }
    .search-clear:hover { color: var(--cui-danger); }

    /* Filter selects */
    .filter-select-wrap {
      display: flex; align-items: center; gap: 4px;
      border: 1px solid var(--cui-border-color);
      border-radius: 8px;
      background: var(--cui-input-bg);
      padding: 0 8px;
      transition: border-color .15s, box-shadow .15s;
      cursor: pointer;
    }
    .filter-select-wrap:focus-within {
      border-color: var(--cui-info);
      box-shadow: 0 0 0 3px rgba(var(--cui-info-rgb), .15);
    }
    .filter-select-wrap.active {
      border-color: var(--cui-info);
      background: var(--cui-info-bg-subtle);
    }
    .filter-select-icon  { color: var(--cui-secondary-color); flex-shrink: 0; }
    .filter-select-caret { color: var(--cui-secondary-color); flex-shrink: 0; pointer-events: none; }
    .filter-select {
      border: none; background: transparent; outline: none;
      font-size: .82rem; padding: 6px 2px;
      color: var(--cui-body-color); cursor: pointer;
      -webkit-appearance: none; -moz-appearance: none; appearance: none;
      min-width: 90px; max-width: 160px;
    }

    /* More filters button */
    .more-filters-btn {
      display: flex; align-items: center; gap: 5px;
      font-size: .82rem; font-weight: 400;
      padding: 6px 12px; border-radius: 8px;
      border: 1px solid var(--cui-border-color);
      background: var(--cui-input-bg);
      color: var(--cui-body-color);
      cursor: pointer; transition: all .15s; white-space: nowrap;
    }
    .more-filters-btn:hover,
    .more-filters-btn.open {
      border-color: var(--cui-info);
      color: var(--cui-info);
      background: var(--cui-info-bg-subtle);
    }
    .more-count {
      background: var(--cui-info);
      color: #fff; font-size: .65rem; font-weight: 700;
      border-radius: 999px; padding: 0 6px;
      min-width: 18px; text-align: center; line-height: 1.6;
    }

    /* Secondary filter panel */
    .filter-panel {
      border-top: 1px solid var(--cui-border-color);
      background: var(--cui-tertiary-bg);
      animation: slideDown .18s ease;
    }
    @keyframes slideDown {
      from { opacity: 0; transform: translateY(-4px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .filter-panel-title { font-size: .83rem; font-weight: 500; }
    .btn-clear-secondary {
      font-size: .74rem; color: var(--cui-secondary-color);
      background: var(--cui-secondary-bg); border: 1px solid var(--cui-border-color);
      border-radius: 6px; padding: 3px 10px; cursor: pointer;
      transition: background .15s;
    }
    .btn-clear-secondary:hover { background: var(--cui-tertiary-bg); }
    .filter-label {
      display: block; font-size: .69rem; font-weight: 500;
      text-transform: uppercase; letter-spacing: .05em;
      color: var(--cui-secondary-color); margin-bottom: .25rem;
    }
    .filter-select-sm { font-size: .82rem; }

    /* Active chips */
    .active-chip {
      display: inline-flex; align-items: center; gap: 4px;
      font-size: .72rem; font-weight: 400;
      background: var(--cui-info-bg-subtle);
      color: var(--cui-info);
      border: 1px solid var(--cui-info-border-subtle);
      border-radius: 999px; padding: 2px 10px;
    }
    .chip-remove { cursor: pointer; opacity: .7; font-size: .85rem; line-height: 1; }
    .chip-remove:hover { opacity: 1; }

    /* ── Table ────────────────────────────────────────────────────── */
    .persona-table { font-size: .8175rem; }
    .table-head {
      font-size: .69rem; font-weight: 500;
      letter-spacing: .05em; text-transform: uppercase;
      color: var(--cui-secondary-color);
    }
    .row-clickable { cursor: pointer; }
    .p-name  { font-weight: 500; font-size: .83rem; }
    .p-sub   { font-size: .72rem; color: var(--cui-secondary-color); }
    .p-code  {
      font-family: var(--cui-font-monospace, monospace);
      font-size: .7rem; font-weight: 400;
      background: var(--cui-secondary-bg);
      color: var(--cui-secondary-color);
      border-radius: 4px; padding: 2px 6px;
      flex-shrink: 0; white-space: nowrap;
    }
    .p-tax     { font-family: var(--cui-font-monospace, monospace); font-size: .78rem; }
    .p-taxtype { font-size: .65rem; color: var(--cui-tertiary-color); }
    .p-dot     { width: 7px; height: 7px; border-radius: 50%; display: inline-block; }
    .p-dot--active   { background: var(--cui-success); }
    .p-dot--inactive { background: var(--cui-secondary-color); opacity: .4; }
    .td-meta { font-size: .78rem; color: var(--cui-secondary-color); }
  `],
  imports: [
    CommonModule,
    CardModule, ButtonModule, GridModule, BadgeModule, SpinnerModule,
    TableModule, FormModule, IconModule,
    HasPermissionDirective
  ]
})
export class PersonasListComponent implements OnInit, OnDestroy {
  private svc           = inject(PersonasService);
  private settingsSvc   = inject(SettingsService);
  private notifications = inject(NotificationService);
  private router        = inject(Router);
  private destroy$      = new Subject<void>();

  // ─── Data ─────────────────────────────────────────────────────────────────
  personas     = signal<Person[]>([]);
  paymentTerms = signal<PaymentTerm[]>([]);
  loading      = signal(true);

  // ─── Filter state ─────────────────────────────────────────────────────────
  searchTerm      = signal('');
  typeFilter      = signal<TypeFilter>('all');
  primary         = signal<PrimaryFilters>({ ...PRIMARY_DEFAULTS });
  secondary       = signal<SecondaryFilters>({ ...SECONDARY_DEFAULTS });
  showMoreFilters = signal(false);

  readonly ROLE_LABELS = ROLE_LABELS;
  readonly ROLE_COLORS = ROLE_COLORS;

  readonly typeOptions: { value: TypeFilter; label: string }[] = [
    { value: 'all',      label: 'Todos' },
    { value: 'customer', label: 'Clientes' },
    { value: 'supplier', label: 'Proveedores' },
    { value: 'employee', label: 'Empleados' },
    { value: 'contact',  label: 'Contactos' },
    { value: 'other',    label: 'Otros' },
    { value: 'inactive', label: 'Inactivos' }
  ];

  readonly taxIdOptions: { value: '' | TaxIdType; label: string }[] = [
    { value: '',          label: 'Identificación' },
    { value: 'RUC',       label: 'RUC' },
    { value: 'CI',        label: 'Cédula' },
    { value: 'PASAPORTE', label: 'Pasaporte' },
    { value: 'EXTERIOR',  label: 'Exterior' }
  ];

  // ─── Active filter counts ─────────────────────────────────────────────────

  activePrimaryCount = computed(() =>
    [this.primary().taxIdType].filter(Boolean).length
  );

  activeSecondaryCount = computed(() => {
    const s = this.secondary();
    return [s.isCompany, s.hasEmail, s.hasPhone].filter(v => v !== '').length;
  });

  totalActiveFilters = computed(() =>
    (this.searchTerm() ? 1 : 0) +
    (this.typeFilter() !== 'all' ? 1 : 0) +
    this.activePrimaryCount() +
    this.activeSecondaryCount()
  );

  // ─── Stats ────────────────────────────────────────────────────────────────

  stats = computed(() => {
    const all = this.personas();
    return {
      total:    all.filter(p => p.isActive).length,
      customer: all.filter(p => p.isActive && p.roles.includes('customer')).length,
      supplier: all.filter(p => p.isActive && p.roles.includes('supplier')).length,
      employee: all.filter(p => p.isActive && p.roles.includes('employee')).length,
      inactive: all.filter(p => !p.isActive).length
    };
  });

  // ─── Filtered list ────────────────────────────────────────────────────────

  filtered = computed(() => {
    const term = this.searchTerm().toLowerCase().trim();
    const type = this.typeFilter();
    const p    = this.primary();
    const s    = this.secondary();

    let list = this.personas();

    // Type / status
    if (type === 'inactive') list = list.filter(x => !x.isActive);
    else if (type !== 'all') list = list.filter(x => x.isActive && x.roles.includes(type as PersonRole));
    else                     list = list.filter(x => x.isActive);

    // Primary
    if (p.taxIdType) list = list.filter(x => x.taxIdType === p.taxIdType);

    // Secondary
    if (s.isCompany !== '') list = list.filter(x => x.isCompany === (s.isCompany === 'true'));
    if (s.hasEmail  !== '') {
      if (s.hasEmail === 'true')  list = list.filter(x => !!x.email);
      if (s.hasEmail === 'false') list = list.filter(x => !x.email);
    }
    if (s.hasPhone !== '') {
      if (s.hasPhone === 'true')  list = list.filter(x => !!x.phone1);
      if (s.hasPhone === 'false') list = list.filter(x => !x.phone1);
    }

    // Text search
    if (term) {
      list = list.filter(x =>
        x.name.toLowerCase().includes(term)          ||
        x.legalName.toLowerCase().includes(term)     ||
        x.taxId.includes(term)                       ||
        (x.phone1 ?? '').includes(term)              ||
        (x.email ?? '').toLowerCase().includes(term) ||
        (x.customerData?.code ?? '').includes(term)  ||
        (x.supplierData?.code ?? '').includes(term)  ||
        (x.employeeData?.code ?? '').includes(term)
      );
    }

    return [...list].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  });

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.settingsSvc.getPaymentTerms().pipe(take(1)).subscribe({
      next: terms => this.paymentTerms.set(terms)
    });

    this.svc.getPersonas(null).pipe(
      catchError(err => {
        this.notifications.error('Error cargando personas: ' + (err?.message ?? err));
        this.loading.set(false);
        return of([]);
      }),
      takeUntil(this.destroy$)
    ).subscribe(list => { this.personas.set(list); this.loading.set(false); });
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  // ─── Navigation ───────────────────────────────────────────────────────────

  openNew(): void {
    const type = this.typeFilter();
    const role = (type !== 'all' && type !== 'inactive') ? type : null;
    this.router.navigate(['/personas', 'new'], { queryParams: role ? { role } : {} });
  }

  openEdit(p: Person): void { this.router.navigate(['/personas', p.id, 'edit']); }

  // ─── Filter helpers ───────────────────────────────────────────────────────

  setPrimary<K extends keyof PrimaryFilters>(key: K, value: PrimaryFilters[K]): void {
    this.primary.update(f => ({ ...f, [key]: value }));
  }

  setSecondary<K extends keyof SecondaryFilters>(key: K, value: SecondaryFilters[K]): void {
    this.secondary.update(f => ({ ...f, [key]: value }));
  }

  clearAll(): void {
    this.searchTerm.set('');
    this.typeFilter.set('all');
    this.primary.set({ ...PRIMARY_DEFAULTS });
    this.secondary.set({ ...SECONDARY_DEFAULTS });
  }

  clearSecondary(): void { this.secondary.set({ ...SECONDARY_DEFAULTS }); }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  getCode(p: Person): string {
    const type = this.typeFilter();
    const role = (type !== 'all' && type !== 'inactive') ? (type as PersonRole) : null;
    return getPersonCode(p, role);
  }

  trackById(_: number, item: { id: string }): string { return item.id; }
}
