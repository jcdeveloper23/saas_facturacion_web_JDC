import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subject, takeUntil, catchError, of } from 'rxjs';
import { take, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import {
  CardModule, ButtonModule, GridModule, BadgeModule, SpinnerModule,
  TableModule, FormModule, TooltipModule, AlertModule,
  NavModule, TabsModule, InputGroupComponent, InputGroupTextDirective, CalloutComponent
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';

import { ProductsService }      from './services/products.service';
import { FamiliesService }      from './services/families.service';
import { ManufacturersService } from './services/manufacturers.service';
import { ProductImageService }  from './services/product-image.service';
import { SettingsService }      from '../settings/services/settings.service';
import { NotificationService }  from '../../core/services/notification.service';
import { AuthService }          from '../../core/services/auth.service';
import {
  Product, ProductSupplier, ProductVariant, ProductStock, StockMovement,
  Family, Manufacturer, BarcodeType, calcMarginPct
} from './models/product.interface';
import { TaxRate, Warehouse } from '../settings/models/settings.interfaces';
import { Timestamp } from '@angular/fire/firestore';

type FormTab = 'general' | 'pricing' | 'stock' | 'suppliers' | 'variants';

const BARCODE_TYPES: { value: BarcodeType; label: string }[] = [
  { value: 'Code39', label: 'Code 39' },
  { value: 'EAN13',  label: 'EAN-13' },
  { value: 'EAN8',   label: 'EAN-8' },
  { value: 'UPC',    label: 'UPC-A' },
  { value: 'QR',     label: 'QR Code' },
  { value: 'other',  label: 'Otro' }
];

@Component({
  selector: 'app-product-form',
  standalone: true,
  templateUrl: './product-form.component.html',
  styles: [`
    /* ── Properties panel ────────────────────────────────────────── */
    .props-panel {
      display: flex; flex-direction: column; gap: 0;
      background: var(--cui-card-bg);
      border: 1px solid var(--cui-border-color);
      border-radius: 10px;
      overflow: hidden;
    }

    .props-section {
      padding: .75rem 1rem;
      border-bottom: 1px solid var(--cui-border-color);
    }
    .props-section:last-child { border-bottom: none; }

    .props-label {
      font-size: .68rem; font-weight: 500;
      text-transform: uppercase; letter-spacing: .06em;
      color: var(--cui-secondary-color);
      margin: 0 0 .5rem 0;
      display: flex; align-items: center;
    }

    /* Switches list */
    .props-switches { display: flex; flex-direction: column; gap: 0; }

    .props-switch-row {
      display: flex; align-items: center;
      justify-content: space-between; gap: .5rem;
      padding: .4rem 0;
      border-bottom: 1px solid var(--cui-border-color);
    }
    .props-switch-row:last-child { border-bottom: none; }

    .props-switch-name { font-size: .8rem; font-weight: 400; line-height: 1.2; }
    .props-switch-desc { font-size: .67rem; color: var(--cui-tertiary-color); line-height: 1.2; }

    /* ── Image zone ──────────────────────────────────────────────── */
    .img-zone {
      width: 100%; aspect-ratio: 1;
      border: 1.5px dashed var(--cui-border-color);
      border-radius: 8px; overflow: hidden;
      cursor: pointer; background: var(--cui-tertiary-bg);
      transition: border-color .15s, background .15s;
    }
    .img-zone:hover        { border-color: var(--cui-primary); }
    .img-zone.drag-over    { border-color: var(--cui-primary); background: var(--cui-primary-bg-subtle); }

    .img-empty {
      width: 100%; height: 100%;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      gap: 3px; text-align: center; padding: .5rem;
      font-size: .75rem; color: var(--cui-secondary-color);
    }
    .img-empty-icon { font-size: 2rem; opacity: .25; margin-bottom: .25rem; }
    .img-hint       { font-size: .67rem; color: var(--cui-tertiary-color); margin: 0; }

    .img-preview {
      width: 100%; height: 100%;
      object-fit: contain; display: block;
    }
    .img-overlay {
      position: absolute; inset: 0;
      background: rgba(0,0,0,.35);
      display: flex; align-items: center; justify-content: center; gap: .5rem;
      opacity: 0; transition: opacity .2s;
    }
    .img-zone:hover .img-overlay { opacity: 1; }

    .img-progress { height: 4px; width: 80%; border-radius: 99px; }

    /* ── Stock summary ────────────────────────────────────────────── */
    .stock-summary { display: flex; flex-direction: column; gap: 0; }

    .stock-row {
      display: flex; justify-content: space-between; align-items: center;
      padding: .3rem 0;
      border-bottom: 1px solid var(--cui-border-color);
    }
    .stock-row:last-child { border-bottom: none; }

    .stock-row-label { font-size: .78rem; color: var(--cui-secondary-color); }
    .stock-row-value { font-size: .82rem; font-weight: 500; }

    /* ── Image upload zone (existing) ────────────────────────────── */
    .image-upload-zone { transition: background .2s; }
    .image-upload-zone.drag-over { background: var(--cui-primary-bg-subtle) !important; }
    .image-overlay { opacity: 0; transition: opacity .2s; background: rgba(0,0,0,.4); }
    .image-upload-zone:hover .image-overlay { opacity: 1; }

    /* ── Stock por Almacén ───────────────────────────────────────── */
    /*  Grid: Almacén | Ubicación | Actual | Nuevo | Motivo | Acción  */

    .wh-table {
      border: 1px solid var(--cui-border-color);
      border-radius: 8px;
      overflow: hidden;
    }

    .wh-header {
      display: grid;
      grid-template-columns: 1.8fr 1.2fr 90px 90px 1.6fr 44px;
      gap: .75rem;
      padding: .35rem .9rem;
      background: var(--cui-tertiary-bg);
      border-bottom: 1px solid var(--cui-border-color);
      font-size: .68rem; font-weight: 500;
      text-transform: uppercase; letter-spacing: .05em;
      color: var(--cui-tertiary-color);
    }

    .wh-row {
      display: grid;
      grid-template-columns: 1.8fr 1.2fr 90px 90px 1.6fr 44px;
      gap: .75rem;
      align-items: center;
      padding: .45rem .9rem;
      border-bottom: 1px solid var(--cui-border-color);
      transition: background .12s;
    }
    .wh-row:last-of-type { border-bottom: none; }
    .wh-row:hover        { background: transparent; }
    .wh-row--saving      { opacity: .5; pointer-events: none; }

    .wh-footer {
      display: grid;
      grid-template-columns: 1.8fr 1.2fr 90px 90px 1.6fr 44px;
      gap: .75rem;
      align-items: center;
      padding: .45rem .9rem;
      border-top: 1px solid var(--cui-border-color);
      background: var(--cui-secondary-bg);
    }

    /* Column children */
    .wh-col-name {
      display: flex; align-items: center; gap: .4rem;
      min-width: 0;
    }
    .wh-col-loc,
    .wh-col-qty,
    .wh-col-new,
    .wh-col-reason  { min-width: 0; }
    .wh-col-actions { display: flex; align-items: center; justify-content: flex-end; }

    /* Status dot */
    .wh-dot {
      flex-shrink: 0;
      width: 7px; height: 7px; border-radius: 50%;
      background: var(--cui-secondary-color);
    }
    .wh-dot--ok   { background: var(--cui-success); }
    .wh-dot--low  { background: var(--cui-warning); }
    .wh-dot--zero { background: var(--cui-danger);  }

    .wh-name {
      font-size: .82rem; font-weight: 400;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .wh-new-hint {
      font-size: .65rem; color: var(--cui-tertiary-color);
      white-space: nowrap;
    }

    /* Current qty — plain colored number, read-only feel */
    .wh-qty-display {
      font-size: .84rem; font-weight: 600;
      color: var(--cui-secondary-color);
    }
    .wh-qty--ok    { color: var(--cui-success); }
    .wh-qty--low   { color: var(--cui-warning); }
    .wh-qty--zero  { color: var(--cui-danger);  }
    .wh-qty--total { color: var(--cui-body-color); font-weight: 700; }

    .wh-footer-label {
      font-size: .75rem; color: var(--cui-secondary-color);
      display: flex; align-items: center; gap: .3rem;
    }

    /* ── Historial de movimientos ─────────────────────────────────── */
    .mov-toggle {
      display: flex; align-items: center; justify-content: space-between;
      cursor: pointer; user-select: none;
    }
    .mov-toggle-label {
      display: flex; align-items: center; gap: .25rem;
      font-size: .78rem; font-weight: 400;
      color: var(--cui-secondary-color);
      text-transform: uppercase; letter-spacing: .05em;
    }
    .mov-toggle-icon { font-size: .75rem; color: var(--cui-tertiary-color); }

    /* Tab bar */
    .mov-tabs {
      display: flex; gap: 0; overflow-x: auto;
      border-bottom: 1px solid var(--cui-border-color);
      padding: 0 .75rem;
    }
    .mov-tab {
      flex-shrink: 0;
      padding: .4rem .75rem;
      font-size: .78rem; font-weight: 400;
      color: var(--cui-secondary-color);
      background: transparent; border: none;
      border-bottom: 2px solid transparent;
      cursor: pointer; white-space: nowrap;
      transition: color .12s, border-color .12s;
      display: flex; align-items: center; gap: .35rem;
    }
    .mov-tab:hover { color: var(--cui-body-color); }
    .mov-tab--active {
      color: var(--cui-primary);
      border-bottom-color: var(--cui-primary);
      font-weight: 500;
    }
    .mov-tab-count {
      display: inline-flex; align-items: center; justify-content: center;
      min-width: 16px; height: 16px; padding: 0 4px;
      font-size: .62rem; font-weight: 500;
      background: var(--cui-secondary-bg);
      color: var(--cui-secondary-color);
      border-radius: 99px;
      border: 1px solid var(--cui-border-color);
    }
    .mov-tab--active .mov-tab-count {
      background: var(--cui-primary-bg-subtle);
      color: var(--cui-primary);
      border-color: var(--cui-primary-border-subtle);
    }

    /* Empty state */
    .mov-empty {
      padding: 1.25rem .9rem;
      font-size: .8rem; color: var(--cui-tertiary-color);
      margin: 0; text-align: center;
    }

    /* Table */
    .mov-table { font-size: .8rem; }
    .mov-table thead th {
      font-size: .68rem; font-weight: 500;
      text-transform: uppercase; letter-spacing: .04em;
      color: var(--cui-tertiary-color);
      border-bottom: 1px solid var(--cui-border-color);
      padding: .35rem .6rem;
    }
    .mov-table tbody td { padding: .35rem .6rem; border-bottom: 1px solid var(--cui-border-color); }
    .mov-table tbody tr:last-child td { border-bottom: none; }

    .mov-col-num  { width: 80px; }
    .mov-col-date { width: 130px; }

    .mov-in     { color: var(--cui-success); font-weight: 500; }
    .mov-out    { color: var(--cui-danger);  font-weight: 500; }
    .mov-final  { font-weight: 600; color: var(--cui-body-color); }
    .mov-reason { color: var(--cui-secondary-color); max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .mov-date   { color: var(--cui-tertiary-color); font-size: .75rem; }

    /* Compact inputs inside rows */
    .wh-row input.form-control,
    .wh-row select.form-select,
    .wh-row--new input.form-control,
    .wh-row--new select.form-select {
      padding-top: .22rem; padding-bottom: .22rem;
      font-size: .8rem;
      height: auto;
    }
  `],
  imports: [
    CommonModule, ReactiveFormsModule, RouterLink,
    CardModule, ButtonModule, GridModule, BadgeModule, SpinnerModule,
    TableModule, FormModule, TooltipModule, AlertModule,
    NavModule, TabsModule, IconModule,
    InputGroupComponent, InputGroupTextDirective, CalloutComponent
  ]
})
export class ProductFormComponent implements OnInit, OnDestroy {
  private svc               = inject(ProductsService);
  private familiesSvc       = inject(FamiliesService);
  private manufacturersSvc  = inject(ManufacturersService);
  private settingsSvc       = inject(SettingsService);
  private imageSvc          = inject(ProductImageService);
  private notifications     = inject(NotificationService);
  private authSvc           = inject(AuthService);
  private fb                = inject(FormBuilder);
  private router            = inject(Router);
  private route             = inject(ActivatedRoute);
  private destroy$          = new Subject<void>();

  // ─── State ──────────────────────────────────────────────────────────────
  productId  = signal<string | null>(null);
  loading    = signal(true);
  saving     = signal(false);
  activeTab  = signal<FormTab>('general');
  errorMsg   = signal('');

  // Reference data
  families      = signal<(Family & { depth: number })[]>([]);
  manufacturers = signal<Manufacturer[]>([]);
  taxRates      = signal<TaxRate[]>([]);
  warehouses    = signal<Warehouse[]>([]);

  // Stock from product document (shown in General tab — always in sync)
  productStockQty = signal<number>(0);

  // Subcollection data
  stocks    = signal<ProductStock[]>([]);
  suppliers = signal<ProductSupplier[]>([]);
  variants  = signal<ProductVariant[]>([]);

  // Stock adjustment state — keyed by warehouseCode
  stockAdjust   = signal<Record<string, { newQty: number; location: string; reason: string; saving: boolean }>>({});
  movements     = signal<StockMovement[]>([]);
  activeMovTab  = signal<string>('');      // warehouse tab selected in movements section
  showMovements = signal(false);           // collapse movements section

  // Inline form states
  showSupplierForm  = signal(false);
  editingSupplierId = signal<string | null>(null);
  showVariantForm   = signal(false);
  editingVariantId  = signal<string | null>(null);

  // ─── Price update date ───────────────────────────────────────────────────
  priceUpdatedAt = signal<Date | null>(null);

  // ─── Bidirectional price calculation guard ───────────────────────────────
  private _priceUpdating = false;

  // Computed
  isEditing     = computed(() => !!this.productId());
  hasVariantsOn = computed(() => !!this.form?.get('hasVariants')?.value);

  /** All warehouses merged with existing stock docs — one row per warehouse */
  allWarehouseRows = computed(() => {
    const stockMap = new Map(this.stocks().map(s => [s.warehouseCode, s]));
    return this.warehouses().map(w => ({
      warehouseCode: w.code,
      warehouseName: w.name,
      stock: stockMap.get(w.code) ?? null
    }));
  });

  /** Tax rate % of the currently selected tax code */
  selectedTaxRatePct = computed(() => {
    const code = this.form?.get('taxRateCode')?.value;
    return this.taxRates().find(t => t.code === code)?.rate ?? 0;
  });

  // stockQty is always read from the product document aggregate stored in Firestore.
  // It is never recomputed on the UI from subcollection sums — the source of truth is the DB field.
  totalStock = computed(() => this.productStockQty());

  // ─── Image state (multi-slot: 0=principal, 1-3=adicionales) ────────────
  imageUrls       = signal<(string | null)[]>([null, null, null, null]);
  uploadingSlot   = signal<number | null>(null);   // qué slot está subiendo
  uploadProgress  = signal(0);
  imageError      = signal('');
  imageDragOver   = signal<number | null>(null);   // slot sobre el que se arrastra

  // backward-compat: imageUrl siempre = slot 0
  imageUrl = this.imageUrls;  // alias para referencias legacy en el template

  // Inline forms
  supplierForm!: FormGroup;
  variantForm!:  FormGroup;
  variantAttrForms = signal<{ name: string; value: string }[]>([]);

  // Constants
  readonly BARCODE_TYPES = BARCODE_TYPES;

  // Main form
  form!: FormGroup;

  ngOnInit(): void {
    this.initForms();
    this.loadReferenceData();

    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.productId.set(id);
      this.loadProduct(id);
      this.loadSubcollections(id);
    } else {
      this.loading.set(false);
    }

    // ── Bidirectional price calculation ─────────────────────────────────────
    // salePrice → update salePriceWithTax + marginInput
    this.form.get('salePrice')?.valueChanges.pipe(
      debounceTime(150), distinctUntilChanged(), takeUntil(this.destroy$)
    ).subscribe(sp => {
      if (this._priceUpdating) return;
      this._priceUpdating = true;
      const taxPct  = this.selectedTaxRatePct();
      const cost    = +(this.form.get('costPrice')?.value ?? 0);
      const spNum   = +sp || 0;
      const pvpIva  = Math.round(spNum * (1 + taxPct / 100) * 100) / 100;
      const margin  = calcMarginPct(spNum, cost);
      this.form.patchValue({ salePriceWithTax: pvpIva, marginInput: margin }, { emitEvent: false });
      this._priceUpdating = false;
    });

    // salePriceWithTax → back-calculate salePrice + marginInput
    this.form.get('salePriceWithTax')?.valueChanges.pipe(
      debounceTime(150), distinctUntilChanged(), takeUntil(this.destroy$)
    ).subscribe(pvpIva => {
      if (this._priceUpdating) return;
      this._priceUpdating = true;
      const taxPct  = this.selectedTaxRatePct();
      const cost    = +(this.form.get('costPrice')?.value ?? 0);
      const pvpNum  = +pvpIva || 0;
      const sp      = taxPct > 0 ? Math.round(pvpNum / (1 + taxPct / 100) * 10000) / 10000 : pvpNum;
      const margin  = calcMarginPct(sp, cost);
      this.form.patchValue({ salePrice: sp, marginInput: margin }, { emitEvent: false });
      this._priceUpdating = false;
    });

    // costPrice → update marginInput only (cost doesn't change PVP)
    this.form.get('costPrice')?.valueChanges.pipe(
      debounceTime(150), distinctUntilChanged(), takeUntil(this.destroy$)
    ).subscribe(cp => {
      if (this._priceUpdating) return;
      this._priceUpdating = true;
      const sp     = +(this.form.get('salePrice')?.value ?? 0);
      const margin = calcMarginPct(sp, +cp || 0);
      this.form.patchValue({ marginInput: margin }, { emitEvent: false });
      this._priceUpdating = false;
    });

    // marginInput → recalculate salePrice + salePriceWithTax from cost
    this.form.get('marginInput')?.valueChanges.pipe(
      debounceTime(150), distinctUntilChanged(), takeUntil(this.destroy$)
    ).subscribe(m => {
      if (this._priceUpdating) return;
      const marginNum = +m || 0;
      if (marginNum >= 100 || marginNum < 0) return; // invalid margin
      this._priceUpdating = true;
      const cost   = +(this.form.get('costPrice')?.value ?? 0);
      const taxPct = this.selectedTaxRatePct();
      // sp = cost / (1 - margin/100)
      const sp     = marginNum < 100 && cost > 0
        ? Math.round(cost / (1 - marginNum / 100) * 10000) / 10000
        : +(this.form.get('salePrice')?.value ?? 0);
      const pvpIva = Math.round(sp * (1 + taxPct / 100) * 100) / 100;
      this.form.patchValue({ salePrice: sp, salePriceWithTax: pvpIva }, { emitEvent: false });
      this._priceUpdating = false;
    });

    // taxRateCode → recalculate salePriceWithTax when tax changes
    // NOTE: use emitted `code` directly — selectedTaxRatePct() would return stale cached value here
    this.form.get('taxRateCode')?.valueChanges.pipe(
      takeUntil(this.destroy$)
    ).subscribe(code => {
      if (this._priceUpdating) return;
      this._priceUpdating = true;
      const sp     = +(this.form.get('salePrice')?.value ?? 0);
      const taxPct = this.taxRates().find(t => t.code === code)?.rate ?? 0;
      const pvpIva = Math.round(sp * (1 + taxPct / 100) * 100) / 100;
      this.form.patchValue({ salePriceWithTax: pvpIva }, { emitEvent: false });
      this._priceUpdating = false;
    });

    // When type changes to 'service' → auto-set noStock=true, trackStock=false
    this.form.get('type')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(t => {
      if (t === 'service') {
        this.form.patchValue({ noStock: true, trackStock: false, hasVariants: false }, { emitEvent: false });
      }
    });

    // When noStock toggled on → disable trackStock
    this.form.get('noStock')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(v => {
      if (v) this.form.patchValue({ trackStock: false }, { emitEvent: false });
    });
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  private initForms(): void {
    this.form = this.fb.group({
      // ── General ─────────────────────────────────────────────────────────
      sku:           ['', [Validators.required, Validators.maxLength(18), Validators.pattern(/^[A-Za-z0-9\-_.]+$/)]],
      name:          ['', Validators.required],
      shortName:     [''],
      barcode:       [''],
      barcodeType:   ['Code39'],
      partNumber:    [''],
      equivalentSku: [''],
      type:          ['product', Validators.required],
      isSold:        [true],
      isPurchased:   [true],
      isPublic:      [false],
      isBlocked:     [false],
      isActive:      [true],
      familyId:      [''],
      manufacturerId:[''],
      notes:         [''],
      // ── Fiscal / Tax ─────────────────────────────────────────────────────
      taxRateCode:   ['', Validators.required],
      // ── Pricing ──────────────────────────────────────────────────────────
      salePrice:        [0, [Validators.required, Validators.min(0)]],
      salePriceWithTax: [0, [Validators.min(0)]],  // UI only — not persisted
      costPrice:        [0, [Validators.min(0)]],
      marginInput:      [0],                        // UI only — not persisted
      // ── Stock ────────────────────────────────────────────────────────────
      trackStock:    [false],
      noStock:       [false],
      stockMin:      [0, Validators.min(0)],
      stockMax:      [0, Validators.min(0)],
      // ── Features ─────────────────────────────────────────────────────────
      hasVariants:   [false],
      traceable:     [false],
      // ── Accounting ───────────────────────────────────────────────────────
      purchaseAccountCode: ['']
    });

    this.supplierForm = this.fb.group({
      supplierCode: ['', Validators.required],
      supplierName: [''],
      supplierRef:  ['', Validators.required],
      description:  [''],
      price:        [0, [Validators.required, Validators.min(0)]],
      discountPct:  [0, [Validators.min(0), Validators.max(100)]],
      currency:     ['USD'],
      barcode:      [''],
      partNumber:   [''],
      isPreferred:  [false]
    });

    this.variantForm = this.fb.group({
      sku:             ['', [Validators.required, Validators.maxLength(18)]],
      barcode:         [''],
      priceAdjustment: [0],
      stockQty:        [0, Validators.min(0)],
      isActive:        [true]
    });
  }

  private loadReferenceData(): void {
    this.familiesSvc.getAll().pipe(take(1), catchError(() => of([]))).subscribe(list => {
      this.families.set(this.familiesSvc.toTree(list));
    });
    this.manufacturersSvc.getAll().pipe(take(1), catchError(() => of([]))).subscribe(list => {
      this.manufacturers.set(list.sort((a, b) => a.name.localeCompare(b.name, 'es')));
    });
    this.settingsSvc.getTaxRates().pipe(
      take(1),
      catchError(err => { console.error('[ProductForm] getTaxRates error:', err); return of([]); })
    ).subscribe(list => {
      this.taxRates.set(list);
      // Auto-select default tax rate for new products
      if (!this.isEditing()) {
        const def = list.find(t => t.isDefault);
        if (def) this.form.patchValue({ taxRateCode: def.code }, { emitEvent: false });
      }
    });
    this.settingsSvc.getWarehouses().pipe(take(1), catchError(() => of([]))).subscribe(list => {
      this.warehouses.set(list);
    });
  }

  private loadProduct(id: string): void {
    // Subscribe to the product document so stockQty (stockFis) stays in sync
    // after every adjustment without recalculating in the UI.
    let firstEmit = true;
    this.svc.getProduct$(id).pipe(
      takeUntil(this.destroy$),
      catchError(err => {
        console.error('[ProductForm] load error:', err);
        this.notifications.error('Error cargando artículo');
        this.loading.set(false);
        return of(undefined);
      })
    ).subscribe(p => {
      if (!p) { this.router.navigate(['/products']); return; }
      if (firstEmit) {
        firstEmit = false;
        this.patchForm(p);
        this.loading.set(false);
      } else {
        // On subsequent Firestore updates only refresh the stock signal —
        // never overwrite the form while the user is editing.
        this.productStockQty.set(p.stockQty ?? 0);
      }
    });
  }

  private loadSubcollections(productId: string): void {
    this.svc.getStocks(productId).pipe(
      catchError(err => { console.error('[ProductForm] getStocks error:', err); return of([]); }),
      takeUntil(this.destroy$)
    ).subscribe(list => {
      this.stocks.set(list);
      // Sync adjustment form state — preserve existing values for warehouses already in map
      const current = this.stockAdjust();
      const next: Record<string, { newQty: number; location: string; reason: string; saving: boolean }> = {};
      list.forEach(s => {
        next[s.warehouseCode] = current[s.warehouseCode]
          ? { ...current[s.warehouseCode], newQty: s.qty, location: s.location ?? '' }
          : { newQty: s.qty, location: s.location ?? '', reason: '', saving: false };
      });
      this.stockAdjust.set(next);
      // Default movement tab to first warehouse
      if (list.length > 0 && !this.activeMovTab()) {
        this.activeMovTab.set(list[0].warehouseCode);
      }
    });

    this.svc.getMovements(productId).pipe(
      catchError(() => of([])), takeUntil(this.destroy$)
    ).subscribe(list => this.movements.set(list));

    this.svc.getSuppliers(productId).pipe(
      catchError(() => of([])), takeUntil(this.destroy$)
    ).subscribe(list => this.suppliers.set(list));

    this.svc.getVariants(productId).pipe(
      catchError(() => of([])), takeUntil(this.destroy$)
    ).subscribe(list => this.variants.set(list));
  }

  private patchForm(p: Product): void {
    this.productStockQty.set(p.stockQty ?? 0);
    // Populate imageUrls: prefer imageUrls array; fallback to single imageUrl in slot 0
    const urls: (string | null)[] = [null, null, null, null];
    if (p.imageUrls?.length) {
      p.imageUrls.slice(0, 4).forEach((u, i) => { if (u) urls[i] = u; });
    } else if (p.imageUrl) {
      urls[0] = p.imageUrl;
    }
    this.imageUrls.set(urls);
    if (p.priceUpdatedAt) {
      this.priceUpdatedAt.set((p.priceUpdatedAt as any).toDate?.() ?? null);
    }
    const taxPct     = this.taxRates().find(t => t.code === p.taxRateCode)?.rate ?? 0;
    const pvpIva     = Math.round(p.salePrice * (1 + taxPct / 100) * 100) / 100;
    const marginVal  = calcMarginPct(p.salePrice, p.costPrice);
    this.form.patchValue({
      sku:            p.sku,
      name:           p.name,
      shortName:      p.shortName      ?? '',
      barcode:        p.barcode        ?? '',
      barcodeType:    p.barcodeType    ?? 'Code39',
      partNumber:     p.partNumber     ?? '',
      equivalentSku:  p.equivalentSku  ?? '',
      type:           p.type,
      isSold:         p.isSold,
      isPurchased:    p.isPurchased,
      isPublic:       p.isPublic,
      isBlocked:      p.isBlocked,
      isActive:       p.isActive,
      familyId:       p.familyId       ?? '',
      manufacturerId: p.manufacturerId ?? '',
      notes:          p.notes          ?? '',
      taxRateCode:    p.taxRateCode,
      salePrice:      p.salePrice,
      costPrice:      p.costPrice,
      trackStock:     p.trackStock,
      noStock:        p.noStock,
      stockMin:       p.stockMin,
      stockMax:       p.stockMax,
      hasVariants:    p.hasVariants,
      traceable:      p.traceable,
      purchaseAccountCode: p.purchaseAccountCode ?? '',
      // UI-only computed fields
      salePriceWithTax: pvpIva,
      marginInput:      marginVal
    });
  }

  // ─── Save ────────────────────────────────────────────────────────────────

  async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.activeTab.set('general');
      this.errorMsg.set('Corrija los errores antes de continuar.');
      return;
    }
    this.saving.set(true);
    this.errorMsg.set('');

    try {
      const v = this.form.getRawValue();

      // SKU uniqueness check
      const skuTaken = await this.svc.skuExists(v.sku, this.productId() ?? undefined);
      if (skuTaken) {
        this.errorMsg.set(`El SKU "${v.sku.toUpperCase()}" ya existe. Use otro.`);
        this.activeTab.set('general');
        this.saving.set(false);
        return;
      }

      // Resolve denormalized family/manufacturer names
      const family        = this.families().find(f => f.id === v.familyId);
      const parentFamily  = family?.parentId ? this.families().find(f => f.id === family.parentId) : null;
      const manufacturer  = this.manufacturers().find(m => m.id === v.manufacturerId);
      const taxRate      = this.taxRates().find(t => t.code === v.taxRateCode);

      // Build payload — exclude UI-only computed fields
      const { salePriceWithTax: _swt, marginInput: _mi, ...vClean } = v;

      // Track price change timestamp
      const currentProduct = this.productId() ? await this.svc.getProduct(this.productId()!) : null;
      const priceChanged = !currentProduct || currentProduct.salePrice !== v.salePrice || currentProduct.costPrice !== v.costPrice;

      const payload: any = {
        ...vClean,
        sku:              v.sku.trim().toUpperCase(),
        name:             v.name.trim(),
        familyCode:        family?.code         ?? null,
        familyName:        family?.name         ?? null,
        parentFamilyId:    parentFamily?.id     ?? null,
        parentFamilyName:  parentFamily?.name   ?? null,
        manufacturerCode: manufacturer?.code  ?? null,
        manufacturerName: manufacturer?.name  ?? null,
        taxRateName:      taxRate?.name       ?? null,
        taxRate:          taxRate?.rate       ?? null,
        ...(priceChanged ? { priceUpdatedAt: Timestamp.now() } : {})
      };

      // Strip empty strings
      Object.keys(payload).forEach(k => {
        if (payload[k] === '') delete payload[k];
      });

      const id = this.productId();
      if (id) {
        await this.svc.updateProduct(id, payload);
        this.notifications.success('Artículo actualizado');
      } else {
        const newId = await this.svc.createProduct(payload);
        this.notifications.success('Artículo registrado');
        // Navigate to edit so subcollections become available
        this.router.navigate(['/products', newId, 'edit'], { replaceUrl: true });
        return;
      }

      this.router.navigate(['/products']);
    } catch (err: any) {
      this.errorMsg.set(err?.message ?? 'Error al guardar');
    } finally {
      this.saving.set(false);
    }
  }

  cancel(): void { this.router.navigate(['/products']); }

  // ─── Stock adjustment (inline per-warehouse) ────────────────────────────

  getAdjust(warehouseCode: string) {
    return this.stockAdjust()[warehouseCode] ?? { newQty: 0, location: '', reason: '', saving: false };
  }

  setAdjust(warehouseCode: string, field: 'newQty' | 'location' | 'reason', value: string | number): void {
    this.stockAdjust.update(map => ({
      ...map,
      [warehouseCode]: { ...this.getAdjust(warehouseCode), [field]: value }
    }));
  }

  async saveStockAdjust(warehouseCode: string, stock: ProductStock | null): Promise<void> {
    const adj     = this.getAdjust(warehouseCode);
    const product = this.productId() ? await this.svc.getProduct(this.productId()!) : null;
    if (!product) return;

    // Guard: skip if new warehouse with no qty entered
    if (!stock && adj.newQty === 0) {
      this.notifications.info('Ingrese una cantidad mayor a 0');
      return;
    }

    // Build stock baseline for virgin warehouses
    const wh = this.warehouses().find(w => w.code === warehouseCode);
    const stockBase: ProductStock = stock ?? {
      warehouseCode,
      warehouseName: wh?.name ?? warehouseCode,
      qty:            0,
      available:      0,
      reserved:       0,
      pendingReceive: 0,
      stockMin:       0,
      stockMax:       0,
      location:       adj.location
    };

    this.stockAdjust.update(m => ({ ...m, [warehouseCode]: { ...adj, saving: true } }));
    try {
      await this.svc.adjustStock(
        this.productId()!,
        product.sku,
        product.name,
        stockBase,
        adj.newQty,
        adj.location,
        adj.reason || (stock ? 'Ajuste manual' : 'Stock inicial'),
        this.authSvc.user()?.uid ?? 'unknown'
      );
      this.stockAdjust.update(m => ({ ...m, [warehouseCode]: { ...adj, reason: '', saving: false } }));
      this.notifications.success(`Stock de ${stockBase.warehouseName} actualizado`);
    } catch {
      this.stockAdjust.update(m => ({ ...m, [warehouseCode]: { ...adj, saving: false } }));
      this.notifications.error('Error al guardar el ajuste de stock');
    }
  }

  // ─── Movement helpers ────────────────────────────────────────────────────

  movementsForWarehouse(warehouseCode: string): StockMovement[] {
    return this.movements().filter(m => m.warehouseCode === warehouseCode);
  }

  adjustments(): StockMovement[] {
    return this.movements().filter(m => m.type === 'adjustment');
  }

  movDate(m: StockMovement): string {
    return (m.createdAt as any).toDate?.()?.toLocaleDateString('es-EC') ?? '';
  }

  movTime(m: StockMovement): string {
    return (m.createdAt as any).toDate?.()?.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' }) ?? '';
  }

  // ─── Image handling (multi-slot) ─────────────────────────────────────────

  // activeUploadSlot tracks which file input should receive the file
  private _pendingSlot = 0;

  onImageDragOver(e: DragEvent, slot: number): void {
    e.preventDefault();
    this.imageDragOver.set(slot);
  }

  onImageDragLeave(): void {
    this.imageDragOver.set(null);
  }

  onImageDrop(e: DragEvent, slot: number): void {
    e.preventDefault();
    this.imageDragOver.set(null);
    const file = e.dataTransfer?.files?.[0];
    if (file) this.uploadImageAt(slot, file);
  }

  onImageFileSelected(e: Event, slot: number): void {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) this.uploadImageAt(slot, file);
    (e.target as HTMLInputElement).value = '';
  }

  triggerFileInput(slot: number, inputEl: HTMLInputElement): void {
    this._pendingSlot = slot;
    inputEl.click();
  }

  private async uploadImageAt(slot: number, file: File): Promise<void> {
    const validationError = this.imageSvc.validate(file);
    if (validationError) { this.imageError.set(validationError); return; }

    const productId = this.productId();
    if (!productId) {
      this.notifications.warning('Guarde el artículo primero para poder subir la imagen.');
      return;
    }

    // Show local preview immediately
    const localUrl = URL.createObjectURL(file);
    this.updateSlot(slot, localUrl);
    this.imageError.set('');
    this.uploadingSlot.set(slot);
    this.uploadProgress.set(0);

    try {
      const firebaseUrl = await this.imageSvc.uploadAt(productId, slot, file, pct => {
        this.uploadProgress.set(pct);
      });
      URL.revokeObjectURL(localUrl);
      this.updateSlot(slot, firebaseUrl);
      await this.persistImages(productId);
      this.notifications.success(`Imagen ${slot + 1} guardada`);
    } catch (err: any) {
      URL.revokeObjectURL(localUrl);
      this.updateSlot(slot, null);
      const code = err?.code ? `[${err.code}] ` : '';
      this.imageError.set(code + (err?.message ?? 'Error al subir imagen'));
    } finally {
      this.uploadingSlot.set(null);
    }
  }

  async removeImageAt(slot: number): Promise<void> {
    if (!confirm(`¿Eliminar la imagen ${slot + 1}?`)) return;
    const productId = this.productId();
    const url       = this.imageUrls()[slot];
    if (!productId || !url) { this.updateSlot(slot, null); return; }
    try {
      await this.imageSvc.delete(url);
      this.updateSlot(slot, null);
      await this.persistImages(productId);
      this.notifications.success('Imagen eliminada');
    } catch (err: any) {
      this.notifications.error(err?.message ?? 'Error al eliminar imagen');
    }
  }

  private updateSlot(slot: number, url: string | null): void {
    const current = [...this.imageUrls()];
    current[slot] = url;
    this.imageUrls.set(current);
  }

  private async persistImages(productId: string): Promise<void> {
    const urls = this.imageUrls().filter((u): u is string => !!u);
    const imageUrl = urls[0] ?? '';
    await this.svc.updateProduct(productId, { imageUrl, imageUrls: urls } as any);
  }

  // Legacy: kept so existing template bindings still compile during migration
  onImageDragOver_legacy = (e: DragEvent) => this.onImageDragOver(e, 0);
  removeImage = () => this.removeImageAt(0);

  // ─── Suppliers inline CRUD ───────────────────────────────────────────────

  openAddSupplier(): void {
    this.editingSupplierId.set(null);
    this.supplierForm.reset({ currency: 'USD', price: 0, discountPct: 0, isPreferred: false });
    this.showSupplierForm.set(true);
  }

  openEditSupplier(s: ProductSupplier): void {
    this.editingSupplierId.set(s.id);
    this.supplierForm.patchValue(s);
    this.showSupplierForm.set(true);
  }

  async saveSupplier(): Promise<void> {
    this.supplierForm.markAllAsTouched();
    if (this.supplierForm.invalid || !this.productId()) return;
    try {
      const data = this.supplierForm.getRawValue();
      await this.svc.saveSupplier(this.productId()!, data, this.editingSupplierId() ?? undefined);
      this.notifications.success('Proveedor guardado');
      this.showSupplierForm.set(false);
    } catch { this.notifications.error('Error al guardar proveedor'); }
  }

  async deleteSupplier(s: ProductSupplier): Promise<void> {
    if (!confirm(`¿Eliminar proveedor "${s.supplierName ?? s.supplierCode}"?`)) return;
    try {
      await this.svc.deleteSupplier(this.productId()!, s.id);
      this.notifications.success('Proveedor eliminado');
    } catch { this.notifications.error('Error al eliminar proveedor'); }
  }

  // ─── Variants inline CRUD ────────────────────────────────────────────────

  openAddVariant(): void {
    this.editingVariantId.set(null);
    this.variantForm.reset({ priceAdjustment: 0, stockQty: 0, isActive: true });
    this.variantAttrForms.set([{ name: '', value: '' }]);
    this.showVariantForm.set(true);
  }

  openEditVariant(v: ProductVariant): void {
    this.editingVariantId.set(v.id);
    this.variantForm.patchValue(v);
    this.variantAttrForms.set(v.attributes.length ? [...v.attributes] : [{ name: '', value: '' }]);
    this.showVariantForm.set(true);
  }

  addAttrRow(): void {
    this.variantAttrForms.update(list => [...list, { name: '', value: '' }]);
  }

  removeAttrRow(i: number): void {
    this.variantAttrForms.update(list => list.filter((_, idx) => idx !== i));
  }

  updateAttr(i: number, field: 'name' | 'value', val: string): void {
    this.variantAttrForms.update(list =>
      list.map((a, idx) => idx === i ? { ...a, [field]: val } : a)
    );
  }

  async saveVariant(): Promise<void> {
    this.variantForm.markAllAsTouched();
    if (this.variantForm.invalid || !this.productId()) return;
    try {
      const v    = this.variantForm.getRawValue();
      const data = {
        ...v,
        sku:        v.sku.trim().toUpperCase(),
        attributes: this.variantAttrForms().filter(a => a.name.trim() && a.value.trim())
      };
      await this.svc.saveVariant(this.productId()!, data, this.editingVariantId() ?? undefined);
      this.notifications.success('Variante guardada');
      this.showVariantForm.set(false);
    } catch { this.notifications.error('Error al guardar variante'); }
  }

  async deleteVariant(v: ProductVariant): Promise<void> {
    if (!confirm(`¿Eliminar variante "${v.sku}"?`)) return;
    try {
      await this.svc.deleteVariant(this.productId()!, v.id);
      this.notifications.success('Variante eliminada');
    } catch { this.notifications.error('Error al eliminar variante'); }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  hasError(fg: FormGroup, field: string): boolean {
    const c = fg.get(field);
    return !!(c?.invalid && c?.touched);
  }

  getWarehouseName(code: string): string {
    return this.warehouses().find(w => w.code === code)?.name ?? code;
  }

  stockAlertColor(s: ProductStock): string {
    if (s.qty <= 0) return 'danger';
    if (s.stockMin > 0 && s.qty <= s.stockMin) return 'warning';
    return 'success';
  }

  trackById(_: number, item: { id: string }): string { return item.id; }
}
