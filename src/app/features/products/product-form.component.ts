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

  // New warehouse stock row
  newWhStock = signal<{ warehouseCode: string; newQty: number; location: string; reason: string } | null>(null);

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

  /** Warehouses where this product has no stock record yet */
  availableWarehouses = computed(() => {
    const existing = new Set(this.stocks().map(s => s.warehouseCode));
    return this.warehouses().filter(w => !existing.has(w.code));
  });

  /** Tax rate % of the currently selected tax code */
  selectedTaxRatePct = computed(() => {
    const code = this.form?.get('taxRateCode')?.value;
    return this.taxRates().find(t => t.code === code)?.rate ?? 0;
  });

  totalStock = computed(() =>
    this.stocks().reduce((sum, s) => sum + (s.qty ?? 0), 0)
  );

  // ─── Image state ────────────────────────────────────────────────────────
  imageUrl        = signal<string>('');
  imageUploading  = signal(false);
  imageProgress   = signal(0);
  imageError      = signal('');
  imageDragOver   = signal(false);

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
      const pvpIva  = Math.round(spNum * (1 + taxPct / 100) * 10000) / 10000;
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
      const pvpIva = Math.round(sp * (1 + taxPct / 100) * 10000) / 10000;
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
      const pvpIva = Math.round(sp * (1 + taxPct / 100) * 10000) / 10000;
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
    this.svc.getProduct(id).then(p => {
      if (!p) { this.router.navigate(['/products']); return; }
      this.patchForm(p);
      this.loading.set(false);
    }).catch(err => {
      console.error('[ProductForm] load error:', err);
      this.notifications.error('Error cargando artículo');
      this.loading.set(false);
    });
  }

  private loadSubcollections(productId: string): void {
    this.svc.getStocks(productId).pipe(
      catchError(() => of([])), takeUntil(this.destroy$)
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
    if (p.imageUrl) this.imageUrl.set(p.imageUrl);
    if (p.priceUpdatedAt) {
      this.priceUpdatedAt.set((p.priceUpdatedAt as any).toDate?.() ?? null);
    }
    const taxPct     = this.taxRates().find(t => t.code === p.taxRateCode)?.rate ?? 0;
    const pvpIva     = Math.round(p.salePrice * (1 + taxPct / 100) * 10000) / 10000;
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
      const family       = this.families().find(f => f.id === v.familyId);
      const manufacturer = this.manufacturers().find(m => m.id === v.manufacturerId);
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
        familyCode:       family?.code        ?? null,
        familyName:       family?.name        ?? null,
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
      [warehouseCode]: { ...map[warehouseCode], [field]: value }
    }));
  }

  async saveStockAdjust(stock: ProductStock): Promise<void> {
    const adj     = this.getAdjust(stock.warehouseCode);
    const product = this.productId() ? await this.svc.getProduct(this.productId()!) : null;
    if (!product) return;

    this.stockAdjust.update(m => ({ ...m, [stock.warehouseCode]: { ...adj, saving: true } }));
    try {
      await this.svc.adjustStock(
        this.productId()!,
        product.sku,
        product.name,
        stock,
        adj.newQty,
        adj.location,
        adj.reason,
        this.authSvc.user()?.uid ?? 'unknown'
      );
      this.stockAdjust.update(m => ({ ...m, [stock.warehouseCode]: { ...adj, reason: '', saving: false } }));
      this.notifications.success(`Stock de ${this.getWarehouseName(stock.warehouseCode)} actualizado`);
    } catch {
      this.stockAdjust.update(m => ({ ...m, [stock.warehouseCode]: { ...adj, saving: false } }));
      this.notifications.error('Error al guardar el ajuste de stock');
    }
  }

  openNewWarehouseStock(): void {
    const first = this.availableWarehouses()[0];
    if (!first) return;
    this.newWhStock.set({ warehouseCode: first.code, newQty: 0, location: '', reason: '' });
  }

  setNewWh(field: 'warehouseCode' | 'newQty' | 'location' | 'reason', value: string | number): void {
    const cur = this.newWhStock();
    if (cur) this.newWhStock.set({ ...cur, [field]: value });
  }

  async saveNewWarehouseStock(): Promise<void> {
    const form    = this.newWhStock();
    const product = this.productId() ? await this.svc.getProduct(this.productId()!) : null;
    if (!form || !product) return;

    const wh = this.availableWarehouses().find(w => w.code === form.warehouseCode);
    const newStock: ProductStock = {
      warehouseCode:  form.warehouseCode,
      warehouseName:  wh?.name ?? form.warehouseCode,
      qty:            form.newQty,
      available:      form.newQty,
      reserved:       0,
      pendingReceive: 0,
      stockMin:       0,
      stockMax:       0,
      location:       form.location
    };

    try {
      await this.svc.adjustStock(
        this.productId()!,
        product.sku,
        product.name,
        { ...newStock, qty: 0 },
        form.newQty,
        form.location,
        form.reason || 'Stock inicial',
        this.authSvc.user()?.uid ?? 'unknown'
      );
      this.newWhStock.set(null);
      this.notifications.success(`Stock registrado para ${wh?.name ?? form.warehouseCode}`);
    } catch {
      this.notifications.error('Error al registrar el stock');
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

  // ─── Image handling ──────────────────────────────────────────────────────

  onImageDragOver(e: DragEvent): void {
    e.preventDefault();
    this.imageDragOver.set(true);
  }

  onImageDragLeave(): void {
    this.imageDragOver.set(false);
  }

  onImageDrop(e: DragEvent): void {
    e.preventDefault();
    this.imageDragOver.set(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) this.uploadImage(file);
  }

  onImageFileSelected(e: Event): void {
    const file = (e.target as HTMLInputElement).files?.[0];
    console.log('[ProductForm] file selected:', file?.name, file?.type, file?.size);
    if (file) this.uploadImage(file);
    (e.target as HTMLInputElement).value = '';
  }

  private async uploadImage(file: File): Promise<void> {
    console.log('[ProductForm] uploadImage called', { name: file.name, type: file.type, size: file.size });

    const validationError = this.imageSvc.validate(file);
    if (validationError) {
      console.warn('[ProductForm] validation error:', validationError);
      this.imageError.set(validationError);
      return;
    }

    const productId = this.productId();
    console.log('[ProductForm] productId:', productId);
    if (!productId) {
      this.notifications.warning('Guarde el artículo primero para poder subir la imagen.');
      return;
    }

    // ── Show local preview immediately (don't wait for Firebase) ────────────
    const localUrl = URL.createObjectURL(file);
    console.log('[ProductForm] local preview URL:', localUrl);
    this.imageUrl.set(localUrl);
    this.imageError.set('');
    this.imageUploading.set(true);
    this.imageProgress.set(0);

    try {
      console.log('[ProductForm] calling imageSvc.upload...');
      const firebaseUrl = await this.imageSvc.upload(productId, file, pct => {
        console.log('[ProductForm] progress callback:', pct);
        this.imageProgress.set(pct);
      });
      console.log('[ProductForm] upload success, firebaseUrl:', firebaseUrl);
      URL.revokeObjectURL(localUrl);
      this.imageUrl.set(firebaseUrl);
      await this.svc.updateProduct(productId, { imageUrl: firebaseUrl });
      this.notifications.success('Imagen guardada');
    } catch (err: any) {
      console.error('[ProductForm] upload failed:', err?.code, err?.message, err);
      URL.revokeObjectURL(localUrl);
      this.imageUrl.set('');
      const code = err?.code ? `[${err.code}] ` : '';
      this.imageError.set(code + (err?.message ?? 'Error al subir imagen'));
    } finally {
      this.imageUploading.set(false);
    }
  }

  async removeImage(): Promise<void> {
    if (!confirm('¿Eliminar la imagen del artículo?')) return;
    const productId = this.productId();
    const url       = this.imageUrl();
    if (!productId || !url) { this.imageUrl.set(''); return; }
    try {
      await this.imageSvc.delete(url);
      await this.svc.updateProduct(productId, { imageUrl: '' } as any);
      this.imageUrl.set('');
      this.notifications.success('Imagen eliminada');
    } catch (err: any) {
      this.notifications.error(err?.message ?? 'Error al eliminar imagen');
    }
  }

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
