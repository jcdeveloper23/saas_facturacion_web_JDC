import {
  Component, OnInit, OnDestroy, inject, signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subject, combineLatest, takeUntil } from 'rxjs';
import {
  CardComponent, CardBodyComponent, TableDirective, BadgeComponent,
  ButtonDirective, SpinnerComponent, RowComponent, ColComponent,
  ModalComponent, ModalHeaderComponent, ModalBodyComponent, ModalFooterComponent,
  ModalTitleDirective, ButtonCloseDirective,
  FormLabelDirective, FormControlDirective, FormSelectDirective,
  AlertComponent, CalloutComponent,
  InputGroupComponent, InputGroupTextDirective,
  NavComponent, NavItemComponent, NavLinkDirective
} from '@coreui/angular';
import { IconDirective, IconSetService } from '@coreui/icons-angular';
import { iconSubset } from '../../icons/icon-subset';

import { ProductsService }   from '../products/services/products.service';
import { SettingsService }   from '../settings/services/settings.service';
import { AuthService }       from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { Product, ProductStock, isLowStock, isOutOfStock } from '../products/models/product.interface';
import { Warehouse } from '../settings/models/settings.interfaces';

@Component({
  selector: 'app-stock-overview',
  templateUrl: './stock-overview.component.html',
  standalone: true,
  imports: [
    CommonModule, RouterModule, ReactiveFormsModule,
    CardComponent, CardBodyComponent, TableDirective, BadgeComponent,
    ButtonDirective, SpinnerComponent, RowComponent, ColComponent,
    ModalComponent, ModalHeaderComponent, ModalBodyComponent, ModalFooterComponent,
    ModalTitleDirective, ButtonCloseDirective,
    FormLabelDirective, FormControlDirective, FormSelectDirective,
    AlertComponent, IconDirective, CalloutComponent,
    InputGroupComponent, InputGroupTextDirective,
    NavComponent, NavItemComponent, NavLinkDirective
  ]
})
export class StockOverviewComponent implements OnInit, OnDestroy {
  private productsSvc     = inject(ProductsService);
  private settingsSvc     = inject(SettingsService);
  private authSvc         = inject(AuthService);
  private notifications   = inject(NotificationService);
  private fb              = inject(FormBuilder);
  private iconSet         = inject(IconSetService);
  private destroy$        = new Subject<void>();

  products   = signal<Product[]>([]);
  warehouses = signal<Warehouse[]>([]);
  loading    = signal(true);
  search     = signal('');
  filterStatus = signal<'' | 'ok' | 'low' | 'out'>('');

  // Adjustment modal state
  showAdjustModal  = signal(false);
  adjusting        = signal(false);
  adjustProduct    = signal<Product | null>(null);
  adjustStocks     = signal<ProductStock[]>([]);
  loadingStocks    = signal(false);
  adjustError      = signal('');

  // Expose helper functions to template
  readonly isLowStock  = isLowStock;
  readonly isOutOfStock = isOutOfStock;

  constructor() { this.iconSet.icons = { ...iconSubset }; }

  adjustForm = this.fb.group({
    warehouseCode: ['', Validators.required],
    newQty:        [0, [Validators.required, Validators.min(0)]],
    newLocation:   [''],
    reason:        ['', Validators.required]
  });

  // ── Computed filtered list ─────────────────────────────────────────────────

  filtered = computed(() => {
    const q      = this.search().toLowerCase().trim();
    const status = this.filterStatus();
    return this.products()
      .filter(p => p.trackStock)
      .filter(p => !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
      .filter(p => {
        if (!status)    return true;
        if (status === 'out') return isOutOfStock(p);
        if (status === 'low') return isLowStock(p) && !isOutOfStock(p);
        if (status === 'ok')  return !isLowStock(p) && !isOutOfStock(p);
        return true;
      });
  });

  stats = computed(() => {
    const all = this.products().filter(p => p.trackStock);
    return {
      total:    all.length,
      ok:       all.filter(p => !isLowStock(p) && !isOutOfStock(p)).length,
      low:      all.filter(p => isLowStock(p) && !isOutOfStock(p)).length,
      out:      all.filter(p => isOutOfStock(p)).length
    };
  });

  // Selected warehouse stock record (for adjustment form)
  selectedStock = computed<ProductStock | undefined>(() => {
    const code = this.adjustForm.value.warehouseCode;
    return this.adjustStocks().find(s => s.warehouseCode === code);
  });

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  ngOnInit(): void {
    combineLatest([
      this.productsSvc.getActiveProducts(),
      this.settingsSvc.getWarehouses()
    ])
    .pipe(takeUntil(this.destroy$))
    .subscribe({
      next: ([products, warehouses]) => {
        this.products.set(products);
        this.warehouses.set(warehouses.filter(w => w.isActive));
        this.loading.set(false);
      },
      error: () => {
        this.notifications.error('Error al cargar inventario');
        this.loading.set(false);
      }
    });
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  // ── Adjustment modal ───────────────────────────────────────────────────────

  openAdjust(product: Product): void {
    this.adjustProduct.set(product);
    this.adjustStocks.set([]);
    this.adjustError.set('');
    this.adjustForm.reset({ warehouseCode: '', newQty: 0, newLocation: '', reason: '' });
    this.showAdjustModal.set(true);
    this.loadingStocks.set(true);

    this.productsSvc.getStocks(product.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: stocks => {
          this.adjustStocks.set(stocks);
          this.loadingStocks.set(false);
          // Pre-select warehouse if only one
          if (stocks.length === 1) {
            this.adjustForm.patchValue({
              warehouseCode: stocks[0].warehouseCode,
              newQty:        stocks[0].qty,
              newLocation:   stocks[0].location ?? ''
            });
          }
        },
        error: () => { this.loadingStocks.set(false); }
      });
  }

  onWarehouseChange(): void {
    const stock = this.selectedStock();
    if (stock) {
      this.adjustForm.patchValue({ newQty: stock.qty, newLocation: stock.location ?? '' });
    } else {
      this.adjustForm.patchValue({ newQty: 0, newLocation: '' });
    }
  }

  async saveAdjustment(): Promise<void> {
    if (this.adjustForm.invalid) { this.adjustForm.markAllAsTouched(); return; }
    const product = this.adjustProduct();
    if (!product) return;

    const warehouseCode = this.adjustForm.value.warehouseCode!;
    const newQty        = Number(this.adjustForm.value.newQty);
    const newLocation   = this.adjustForm.value.newLocation ?? '';
    const reason        = this.adjustForm.value.reason!;
    const userId        = this.authSvc.user()?.uid ?? 'unknown';

    // Get or build the stock record for this warehouse
    let stock = this.adjustStocks().find(s => s.warehouseCode === warehouseCode);
    if (!stock) {
      // First-time stock for this warehouse
      const wh = this.warehouses().find(w => w.code === warehouseCode);
      stock = {
        warehouseCode,
        warehouseName:  wh?.name,
        qty:            0,
        available:      0,
        reserved:       0,
        pendingReceive: 0,
        stockMin:       0,
        stockMax:       0
      };
    }

    this.adjusting.set(true);
    this.adjustError.set('');
    try {
      await this.productsSvc.adjustStock(
        product.id,
        product.sku,
        product.name,
        stock,
        newQty,
        newLocation,
        reason,
        userId,
        product.stockQty,
        product.stockReserved
      );
      this.notifications.success('Stock ajustado correctamente');
      this.showAdjustModal.set(false);
    } catch (err: unknown) {
      this.adjustError.set(err instanceof Error ? err.message : 'Error al ajustar stock');
    } finally {
      this.adjusting.set(false);
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  stockBadge(p: Product): { color: string; label: string } {
    if (!p.trackStock)        return { color: 'secondary', label: 'Sin control' };
    if (isOutOfStock(p))      return { color: 'danger',    label: 'Agotado' };
    if (isLowStock(p))        return { color: 'warning',   label: 'Stock bajo' };
    return                         { color: 'success',    label: 'En stock' };
  }

  warehouseName(code: string): string {
    return this.warehouses().find(w => w.code === code)?.name ?? code;
  }

  trackById(_: number, item: Product): string { return item.id; }
}
