import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule }  from '@angular/common';
import { RouterModule }  from '@angular/router';
import { Subject, takeUntil, forkJoin } from 'rxjs';
import {
  CardComponent, CardBodyComponent, TableDirective, BadgeComponent,
  ButtonDirective, SpinnerComponent, RowComponent, ColComponent,
  FormLabelDirective, FormControlDirective, FormSelectDirective,
  InputGroupComponent, InputGroupTextDirective
} from '@coreui/angular';
import { IconDirective, IconSetService } from '@coreui/icons-angular';
import { iconSubset } from '../../icons/icon-subset';

import { StockService }       from './stock.service';
import { SettingsService }    from '../settings/services/settings.service';
import { StockMovement, StockMovementType } from '../products/models/product.interface';
import { Warehouse }          from '../settings/models/settings.interfaces';
import { NotificationService } from '../../core/services/notification.service';

type MovementTypeFilter = '' | StockMovementType;

const TYPE_LABELS: Record<StockMovementType, string> = {
  adjustment:       'Ajuste',
  sale:             'Venta',
  purchase:         'Compra',
  transfer_in:      'Transferencia entrada',
  transfer_out:     'Transferencia salida',
  return_sale:      'Devolución venta',
  return_purchase:  'Devolución compra'
};

const TYPE_COLORS: Record<StockMovementType, string> = {
  adjustment:      'warning',
  sale:            'danger',
  purchase:        'success',
  transfer_in:     'info',
  transfer_out:    'secondary',
  return_sale:     'primary',
  return_purchase: 'primary'
};

@Component({
  selector: 'app-stock-movements',
  templateUrl: './stock-movements.component.html',
  standalone: true,
  styles: [`
    /* Search */
    .search-wrap { position: relative; display: flex; align-items: center; flex: 1 1 200px; min-width: 180px; }
    .search-icon { position: absolute; left: 10px; color: var(--cui-secondary-color); pointer-events: none; }
    .search-input {
      width: 100%; padding: 6px 32px;
      border: 1px solid var(--cui-border-color);
      border-radius: 8px; font-size: .83rem;
      background: var(--cui-input-bg); color: var(--cui-body-color);
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
      color: var(--cui-secondary-color); cursor: pointer; display: flex; align-items: center;
    }
    .search-clear:hover { color: var(--cui-danger); }

    /* Filter selects */
    .filter-select-wrap {
      display: flex; align-items: center; gap: 4px;
      border: 1px solid var(--cui-border-color); border-radius: 8px;
      background: var(--cui-input-bg); padding: 0 8px;
      transition: border-color .15s, box-shadow .15s; cursor: pointer;
    }
    .filter-select-wrap:focus-within {
      border-color: var(--cui-secondary-color);
      box-shadow: 0 0 0 3px rgba(var(--cui-secondary-rgb), .12);
    }
    .filter-select-wrap.active {
      border-color: var(--cui-border-color-translucent);
      background: var(--cui-tertiary-bg);
    }
    .filter-select-wrap.active .filter-select-icon,
    .filter-select-wrap.active .filter-select-caret {
      color: var(--cui-body-color);
    }
    .filter-select-icon  { color: var(--cui-secondary-color); flex-shrink: 0; }
    .filter-select-caret { color: var(--cui-secondary-color); flex-shrink: 0; pointer-events: none; }
    .filter-select, .filter-date {
      border: none; background: transparent; outline: none;
      font-size: .82rem; padding: 6px 2px;
      color: var(--cui-body-color); cursor: pointer;
      -webkit-appearance: none; -moz-appearance: none; appearance: none;
    }
    .filter-select { min-width: 100px; max-width: 160px; }
    .filter-date   { min-width: 110px; }
    .filter-date::-webkit-calendar-picker-indicator { opacity: .5; cursor: pointer; }
  `],
  imports: [
    CommonModule, RouterModule,
    CardComponent, CardBodyComponent, TableDirective, BadgeComponent,
    ButtonDirective, SpinnerComponent,
    IconDirective
  ]
})
export class StockMovementsComponent implements OnInit, OnDestroy {
  private stockSvc      = inject(StockService);
  private settingsSvc   = inject(SettingsService);
  private notifications = inject(NotificationService);
  private iconSet       = inject(IconSetService);
  private destroy$      = new Subject<void>();

  movements  = signal<StockMovement[]>([]);
  warehouses = signal<Warehouse[]>([]);
  loading    = signal(true);

  // ── Filtros ──────────────────────────────────────────────────────────────
  search          = signal('');
  filterType      = signal<MovementTypeFilter>('');
  filterWarehouse = signal('');
  filterDateFrom  = signal('');
  filterDateTo    = signal('');

  readonly typeOptions = Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label }));

  constructor() { this.iconSet.icons = { ...iconSubset }; }

  // ── Computed ─────────────────────────────────────────────────────────────

  filtered = computed(() => {
    const q    = this.search().toLowerCase().trim();
    const type = this.filterType();
    const wh   = this.filterWarehouse();
    const from = this.filterDateFrom() ? new Date(this.filterDateFrom() + 'T00:00:00') : null;
    const to   = this.filterDateTo()   ? new Date(this.filterDateTo()   + 'T23:59:59') : null;

    return this.movements().filter(m => {
      if (type && m.type !== type)          return false;
      if (wh   && m.warehouseCode !== wh)   return false;
      if (from || to) {
        const d = m.createdAt?.toDate();
        if (!d)                             return false;
        if (from && d < from)               return false;
        if (to   && d > to)                 return false;
      }
      if (q) {
        return (
          m.productName.toLowerCase().includes(q) ||
          m.productSku.toLowerCase().includes(q)  ||
          (m.reason ?? '').toLowerCase().includes(q) ||
          (m.sourceDocId ?? '').toLowerCase().includes(q) ||
          (m.warehouseName ?? '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  });

  stats = computed(() => {
    const list = this.filtered();
    return {
      entries:     list.filter(m => m.qtyDelta > 0).reduce((s, m) => s + m.qtyDelta, 0),
      exits:       list.filter(m => m.qtyDelta < 0).reduce((s, m) => s + m.qtyDelta, 0),
      adjustments: list.filter(m => m.type === 'adjustment').length,
      total:       list.length
    };
  });

  activeFiltersCount = computed(() =>
    [this.filterType(), this.filterWarehouse(), this.filterDateFrom(), this.filterDateTo()]
      .filter(v => v !== '').length
  );

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  ngOnInit(): void {
    forkJoin([
      this.settingsSvc.getWarehouses()
    ]).pipe(takeUntil(this.destroy$))
      .subscribe({ next: ([whs]) => this.warehouses.set(whs.filter(w => w.isActive)) });

    this.stockSvc.getAllMovements(500)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next:  list => { this.movements.set(list); this.loading.set(false); },
        error: ()   => { this.notifications.error('Error al cargar movimientos'); this.loading.set(false); }
      });
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  // ── Helpers ───────────────────────────────────────────────────────────────

  typeLabel(type: StockMovementType): string { return TYPE_LABELS[type] ?? type; }
  typeColor(type: StockMovementType): string  { return TYPE_COLORS[type] ?? 'secondary'; }

  deltaClass(delta: number): string {
    return delta > 0 ? 'text-success fw-bold' : delta < 0 ? 'text-danger fw-bold' : 'text-muted';
  }

  sourceDocLabel(m: StockMovement): string {
    if (!m.sourceDocId) return '';
    const prefix = m.sourceDocType === 'invoice' ? 'Fact.' : m.sourceDocType === 'purchase' ? 'OC' : 'Doc.';
    return `${prefix} ${m.sourceDocId.slice(-8).toUpperCase()}`;
  }

  clearFilters(): void {
    this.search.set('');
    this.filterType.set('');
    this.filterWarehouse.set('');
    this.filterDateFrom.set('');
    this.filterDateTo.set('');
  }

  trackById(_: number, m: StockMovement): string { return m.id; }
}
