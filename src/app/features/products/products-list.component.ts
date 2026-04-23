import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subject, takeUntil, catchError, of } from 'rxjs';
import {
  CardModule, ButtonModule, GridModule, BadgeModule, SpinnerModule,
  TableModule, FormModule, NavModule,
  InputGroupComponent, InputGroupTextDirective
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';

import { HasPermissionDirective } from '../../shared/directives/has-permission.directive';
import { ProductsService }      from './services/products.service';
import { FamiliesService }      from './services/families.service';
import { ManufacturersService } from './services/manufacturers.service';
import { SettingsService }      from '../settings/services/settings.service';
import { NotificationService }  from '../../core/services/notification.service';
import {
  Product, Family, Manufacturer, isLowStock, isOutOfStock
} from './models/product.interface';
import { TaxRate, Warehouse } from '../settings/models/settings.interfaces';

// ─── Filter types ─────────────────────────────────────────────────────────────

type TypeFilter = 'all' | 'product' | 'service' | 'inactive';

/** Filters shown inline (always visible) */
interface PrimaryFilters {
  familyId:       string;
  manufacturerId: string;
  stockStatus:    '' | 'in_stock' | 'out_of_stock' | 'low_stock' | 'no_control';
}

/** Filters shown in the collapsible "Más filtros" panel */
interface SecondaryFilters {
  isPublic:    '' | 'true' | 'false';
  isBlocked:   '' | 'true' | 'false';
  isSold:      '' | 'true' | 'false';
  isPurchased: '' | 'true' | 'false';
  hasVariants: '' | 'true' | 'false';
  hasImage:    '' | 'true' | 'false';
  taxRateCode: string;
  priceMin:    string;   // string for input binding; parsed to number on filter
  priceMax:    string;
}

const PRIMARY_DEFAULTS: PrimaryFilters = {
  familyId: '', manufacturerId: '', stockStatus: ''
};

const SECONDARY_DEFAULTS: SecondaryFilters = {
  isPublic: '', isBlocked: '', isSold: '', isPurchased: '',
  hasVariants: '', hasImage: '', taxRateCode: '', priceMin: '', priceMax: ''
};

// ─── Component ────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-products-list',
  standalone: true,
  templateUrl: './products-list.component.html',
  styles: [`
    /* ── Page header ──────────────────────────────────────────────── */
    .page-title   { font-weight: 600; line-height: 1; }
    .page-subtitle{ font-size: .76rem; color: var(--cui-secondary-color); }

    .page-icon {
      width: 36px; height: 36px;
      background: linear-gradient(135deg, #321fdb 0%, #4638c2 100%);
      border-radius: 10px;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 2px 8px rgba(50,31,219,.4);
      flex-shrink: 0;
    }

    /* Stat strip — usa solo variables de CoreUI, sin colores hardcodeados */
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
    }
    .stat-item--warn, .stat-item--danger {
      cursor: pointer; border-radius: 6px;
      transition: background .15s;
    }
    .stat-item--warn:hover   { background: var(--cui-warning-bg-subtle); }
    .stat-item--danger:hover { background: var(--cui-danger-bg-subtle); }
    .stat-value { font-weight: 700; font-size: .88rem; }
    .stat-label { color: var(--cui-secondary-color); font-size: .72rem; }
    .stat-sep   { width: 1px; height: 16px; background: var(--cui-border-color); flex-shrink: 0; }

    /* ── Filter card ──────────────────────────────────────────────── */
    .filter-card { border-radius: 12px !important; }
    .filter-top  { background: var(--cui-card-bg); }
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
      color: var(--cui-primary);
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
    .seg-count.warn {
      background: var(--cui-warning-bg-subtle);
      color: var(--cui-warning-text-emphasis);
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
    .filter-clear-btn:hover { background: var(--cui-danger-bg-subtle); filter: brightness(.95); }

    /* Search */
    .search-wrap { position: relative; display: flex; align-items: center; }
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
      border-color: var(--cui-primary);
      box-shadow: 0 0 0 3px rgba(var(--cui-primary-rgb), .15);
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
      border-color: var(--cui-primary);
      box-shadow: 0 0 0 3px rgba(var(--cui-primary-rgb), .15);
    }
    .filter-select-wrap.active {
      border-color: var(--cui-primary);
      background: var(--cui-primary-bg-subtle);
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
      border-color: var(--cui-primary);
      color: var(--cui-primary);
      background: var(--cui-primary-bg-subtle);
    }
    .more-count {
      background: var(--cui-primary);
      color: #fff; font-size: .65rem; font-weight: 700;
      border-radius: 999px; padding: 0 6px;
      min-width: 18px; text-align: center; line-height: 1.6;
    }

    /* Filter group label */
    .filter-group-label {
      font-size: .68rem; font-weight: 700;
      text-transform: uppercase; letter-spacing: .06em;
      color: var(--cui-secondary-color);
      white-space: nowrap; padding-right: 4px;
    }

    /* Stock pills */
    .pill-filter {
      font-size: .74rem; font-weight: 400;
      padding: 3px 10px; border-radius: 999px;
      border: 1px solid var(--cui-border-color);
      background: transparent; cursor: pointer;
      transition: all .15s; white-space: nowrap;
      color: var(--cui-secondary-color);
    }
    .pill-filter:hover  { border-color: var(--cui-primary); color: var(--cui-primary); }
    .pill-filter.active { background: var(--cui-primary); border-color: var(--cui-primary); color: #fff; }
    .pill-filter.pill-stock-in.active   { background: #2eb85c; border-color: #2eb85c; color: #fff; }
    .pill-filter.pill-stock-out.active  { background: #e55353; border-color: #e55353; color: #fff; }
    .pill-filter.pill-stock-low.active  { background: #f9b115; border-color: #f9b115; color: #000; }
    .pill-filter.pill-stock-none.active { background: #6c757d; border-color: #6c757d; color: #fff; }

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

    /* ── Filter panel extras ──────────────────────────────────────── */
    .search-wrap { min-width: 220px; }

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
    .filter-input { font-size: .82rem; }

    /* cSelect override for secondary panel */
    .filter-select-sm { font-size: .82rem; }

    /* Active filter chips */
    .active-chip {
      display: inline-flex; align-items: center; gap: 4px;
      font-size: .72rem; font-weight: 400;
      background: var(--cui-primary-bg-subtle);
      color: var(--cui-primary);
      border: 1px solid var(--cui-primary-border-subtle);
      border-radius: 999px; padding: 2px 10px;
    }
    .chip-remove {
      cursor: pointer; opacity: .7; font-size: .85rem; line-height: 1;
    }
    .chip-remove:hover { opacity: 1; }

    /* ── Table ────────────────────────────────────────────────────── */
    .products-table { font-size: .8175rem; }

    .table-head {
      font-size: .69rem; font-weight: 500;
      letter-spacing: .05em; text-transform: uppercase;
      color: var(--cui-secondary-color);
    }

    .col-img    { width: 36px; }
    .col-family { min-width: 100px; }
    .col-price  { min-width: 90px; }
    .col-stock  { min-width: 72px; }

    .sku-badge {
      font-family: var(--cui-font-monospace, monospace);
      font-size: .7rem; font-weight: 400;
      background: var(--cui-secondary-bg);
      color: var(--cui-secondary-color);
      border-radius: 4px; padding: 2px 6px;
      flex-shrink: 0; white-space: nowrap;
    }
    .product-name { font-size: .82rem; font-weight: 400; line-height: 1.3; }

    .td-meta  { font-size: .78rem; color: var(--cui-secondary-color); }
    .td-price { font-size: .8175rem; font-weight: 400; }

    .badge-stock { font-size: .68rem; }

    /* Table row */
    .row-clickable { cursor: pointer; }

    /* Image preview */
    .product-img-preview {
      position: fixed; z-index: 9999;
      background: var(--cui-card-bg);
      border: 1px solid var(--cui-border-color);
      border-radius: 10px; padding: 8px;
      box-shadow: 0 4px 24px rgba(0,0,0,.25);
      pointer-events: none;
    }
    .img-icon-wrap { display: inline-flex; align-items: center; cursor: default; }

    .preview-img  {
      max-width: 160px; max-height: 160px;
      object-fit: contain; border-radius: 6px; display: block;
    }
    .preview-name {
      font-size: .7rem; max-width: 160px;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
  `],
  imports: [
    CommonModule,
    CardModule, ButtonModule, GridModule, BadgeModule, SpinnerModule,
    TableModule, FormModule, IconModule, NavModule,
    InputGroupComponent, InputGroupTextDirective,
    HasPermissionDirective
  ]
})
export class ProductsListComponent implements OnInit, OnDestroy {
  private svc              = inject(ProductsService);
  private familiesSvc      = inject(FamiliesService);
  private manufacturersSvc = inject(ManufacturersService);
  private settingsSvc      = inject(SettingsService);
  private notifications    = inject(NotificationService);
  private router           = inject(Router);
  private destroy$         = new Subject<void>();

  // ─── Data ─────────────────────────────────────────────────────────────────
  products      = signal<Product[]>([]);
  families      = signal<Family[]>([]);
  manufacturers = signal<Manufacturer[]>([]);
  taxRates      = signal<TaxRate[]>([]);
  loading       = signal(true);

  // ─── Filter state ─────────────────────────────────────────────────────────
  searchTerm   = signal('');
  typeFilter   = signal<TypeFilter>('all');
  primary      = signal<PrimaryFilters>({ ...PRIMARY_DEFAULTS });
  secondary    = signal<SecondaryFilters>({ ...SECONDARY_DEFAULTS });
  showMoreFilters = signal(false);

  readonly typeOptions: { value: TypeFilter; label: string }[] = [
    { value: 'all',      label: 'Todos' },
    { value: 'product',  label: 'Productos' },
    { value: 'service',  label: 'Servicios' },
    { value: 'inactive', label: 'Inactivos' }
  ];

  readonly stockPills: { value: PrimaryFilters['stockStatus']; label: string; cls: string }[] = [
    { value: '',           label: 'Cualquier stock',  cls: '' },
    { value: 'in_stock',   label: 'Con stock',        cls: 'pill-stock-in' },
    { value: 'out_of_stock', label: 'Sin stock',      cls: 'pill-stock-out' },
    { value: 'low_stock',  label: 'Bajo mínimo',      cls: 'pill-stock-low' },
    { value: 'no_control', label: 'Sin control',      cls: 'pill-stock-none' }
  ];

  // ─── Active filter counts ─────────────────────────────────────────────────

  activePrimaryCount = computed(() => {
    const p = this.primary();
    return [p.familyId, p.manufacturerId, p.stockStatus].filter(Boolean).length;
  });

  activeSecondaryCount = computed(() => {
    const s = this.secondary();
    return [
      s.isPublic, s.isBlocked, s.isSold, s.isPurchased,
      s.hasVariants, s.hasImage, s.taxRateCode, s.priceMin, s.priceMax
    ].filter(v => v !== '').length;
  });

  totalActiveFilters = computed(() =>
    (this.searchTerm() ? 1 : 0) +
    (this.typeFilter() !== 'all' ? 1 : 0) +
    this.activePrimaryCount() +
    this.activeSecondaryCount()
  );

  // ─── Filtered list ────────────────────────────────────────────────────────

  filtered = computed(() => {
    const term  = this.searchTerm().toLowerCase().trim();
    const type  = this.typeFilter();
    const p     = this.primary();
    const s     = this.secondary();
    const prMin = s.priceMin !== '' ? parseFloat(s.priceMin) : null;
    const prMax = s.priceMax !== '' ? parseFloat(s.priceMax) : null;

    let list = this.products();

    // ── Type / status ────────────────────────────────────────────────────────
    if (type === 'product')  list = list.filter(x => x.type === 'product' && x.isActive);
    else if (type === 'service')  list = list.filter(x => x.type === 'service' && x.isActive);
    else if (type === 'inactive') list = list.filter(x => !x.isActive);
    else                          list = list.filter(x => x.isActive);

    // ── Primary filters ──────────────────────────────────────────────────────
    if (p.familyId)       list = list.filter(x => x.familyId === p.familyId);
    if (p.manufacturerId) list = list.filter(x => x.manufacturerId === p.manufacturerId);
    if (p.stockStatus) {
      if (p.stockStatus === 'in_stock')    list = list.filter(x => x.trackStock && !x.noStock && x.stockQty > 0);
      if (p.stockStatus === 'out_of_stock') list = list.filter(x => x.trackStock && !x.noStock && x.stockQty <= 0);
      if (p.stockStatus === 'low_stock')   list = list.filter(x => isLowStock(x));
      if (p.stockStatus === 'no_control')  list = list.filter(x => !x.trackStock && !x.noStock && x.type === 'product');
    }

    // ── Secondary filters ────────────────────────────────────────────────────
    if (s.isPublic    !== '') list = list.filter(x => x.isPublic    === (s.isPublic    === 'true'));
    if (s.isBlocked   !== '') list = list.filter(x => x.isBlocked   === (s.isBlocked   === 'true'));
    if (s.isSold      !== '') list = list.filter(x => x.isSold      === (s.isSold      === 'true'));
    if (s.isPurchased !== '') list = list.filter(x => x.isPurchased === (s.isPurchased === 'true'));
    if (s.hasVariants !== '') list = list.filter(x => x.hasVariants === (s.hasVariants === 'true'));
    if (s.hasImage    !== '') {
      if (s.hasImage === 'true')  list = list.filter(x => !!x.imageUrl);
      if (s.hasImage === 'false') list = list.filter(x => !x.imageUrl);
    }
    if (s.taxRateCode) list = list.filter(x => x.taxRateCode === s.taxRateCode);
    if (prMin !== null) list = list.filter(x => x.salePrice >= prMin);
    if (prMax !== null) list = list.filter(x => x.salePrice <= prMax);

    // ── Text search ──────────────────────────────────────────────────────────
    if (term) {
      list = list.filter(x =>
        x.sku.toLowerCase().includes(term)                  ||
        x.name.toLowerCase().includes(term)                 ||
        (x.barcode ?? '').includes(term)                    ||
        (x.partNumber ?? '').toLowerCase().includes(term)   ||
        (x.familyName ?? '').toLowerCase().includes(term)   ||
        (x.manufacturerName ?? '').toLowerCase().includes(term)
      );
    }

    return [...list].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  });

  // ─── Stats ────────────────────────────────────────────────────────────────

  stats = computed(() => {
    const all = this.products();
    return {
      total:      all.filter(x => x.isActive).length,
      products:   all.filter(x => x.isActive && x.type === 'product').length,
      services:   all.filter(x => x.isActive && x.type === 'service').length,
      lowStock:   all.filter(x => x.isActive && isLowStock(x)).length,
      outOfStock: all.filter(x => x.isActive && isOutOfStock(x)).length
    };
  });

  // ─── Image hover preview ─────────────────────────────────────────────────
  hoveredProduct = signal<Product | null>(null);
  hoverPos       = signal<{ x: number; y: number }>({ x: 0, y: 0 });

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.svc.getProducts().pipe(
      catchError(err => {
        this.notifications.error('Error cargando artículos: ' + (err?.message ?? err));
        this.loading.set(false);
        return of([]);
      }),
      takeUntil(this.destroy$)
    ).subscribe(list => { this.products.set(list); this.loading.set(false); });

    this.familiesSvc.getAll().pipe(catchError(() => of([])), takeUntil(this.destroy$))
      .subscribe(list => this.families.set(list.sort((a, b) => a.name.localeCompare(b.name, 'es'))));

    this.manufacturersSvc.getAll().pipe(catchError(() => of([])), takeUntil(this.destroy$))
      .subscribe(list => this.manufacturers.set(list.sort((a, b) => a.name.localeCompare(b.name, 'es'))));

    this.settingsSvc.getTaxRates().pipe(catchError(() => of([])), takeUntil(this.destroy$))
      .subscribe(list => this.taxRates.set(list));
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  // ─── Navigation ──────────────────────────────────────────────────────────
  openNew(): void            { this.router.navigate(['/products', 'new']); }
  openEdit(p: Product): void { this.router.navigate(['/products', p.id, 'edit']); }

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

  // ─── Stock / price helpers ────────────────────────────────────────────────
  priceWithTax(p: Product): number {
    return Math.round(p.salePrice * (1 + (p.taxRate ?? 0) / 100) * 100) / 100;
  }

  stockBadgeColor(p: Product): string {
    if (!p.trackStock || p.noStock) return 'secondary';
    if (isOutOfStock(p)) return 'danger';
    if (isLowStock(p))   return 'warning';
    return 'success';
  }

  // ─── Image preview ────────────────────────────────────────────────────────
  onImageHover(p: Product, event: MouseEvent): void {
    if (!p.imageUrl) return;
    this.hoveredProduct.set(p);
    this.hoverPos.set({ x: (event as any).clientX + 18, y: (event as any).clientY - 90 });
  }
  onImageLeave(): void { this.hoveredProduct.set(null); }

  // ─── Mutations (used from edit form — kept for service completeness) ──────
  async toggleActive(p: Product): Promise<void> {
    try {
      await this.svc.toggleActive(p.id, !p.isActive);
      this.notifications.success(p.isActive ? 'Artículo desactivado' : 'Artículo activado');
    } catch { this.notifications.error('Error al cambiar estado'); }
  }

  async delete(p: Product): Promise<void> {
    if (!confirm(`¿Eliminar "${p.name}" (${p.sku})?`)) return;
    try {
      await this.svc.deleteProduct(p.id);
      this.notifications.success('Artículo eliminado');
    } catch { this.notifications.error('Error al eliminar'); }
  }

  trackById(_: number, item: { id: string }): string { return item.id; }
}
