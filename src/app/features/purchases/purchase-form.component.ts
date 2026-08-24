import {
  Component, OnInit, OnDestroy, inject, signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { FormBuilder, FormGroup, FormArray, Validators, ReactiveFormsModule } from '@angular/forms';
import { Subject, takeUntil, take } from 'rxjs';
import { Timestamp } from '@angular/fire/firestore';
import {
  CardModule, ButtonModule, GridModule, BadgeModule,
  SpinnerModule, FormModule, AlertModule,
  InputGroupComponent, InputGroupTextDirective,
  ModalModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';

import { PurchasesService }    from './services/purchases.service';
import { PersonasService }     from '../personas/services/personas.service';
import { ProductsService }     from '../products/services/products.service';
import { SettingsService }     from '../settings/services/settings.service';
import { NotificationService } from '../../core/services/notification.service';
import {
  Purchase, PurchaseLine, PurchaseStatus,
  PURCHASE_STATUS_LABELS, PURCHASE_STATUS_COLORS,
  buildPurchaseFullNumber, calcPurchaseLine, calcPurchaseTotals
} from './models/purchase.interface';
import { SUPPORT_DOC_TYPES, SRI_SUSTENTO_CODES } from '../retentions/models/retention.interface';
import { SRI_PAYMENT_METHODS } from '../invoices/models/invoice.interface';
import { Person } from '../personas/models/person.interface';
import { Product } from '../products/models/product.interface';
import { Warehouse } from '../settings/models/settings.interfaces';
import { CostCentersService } from '../accounting/services/cost-centers.service';
import { CostCenter } from '../accounting/models/cost-center.interface';

@Component({
  selector: 'app-purchase-form',
  standalone: true,
  templateUrl: './purchase-form.component.html',
  styles: [`
    .page-header {
      display:flex; align-items:flex-start; gap:.75rem; margin-bottom:1rem;
    }
    .page-icon {
      width:36px; height:36px; border-radius:8px; display:flex;
      align-items:center; justify-content:center; flex-shrink:0;
      background:var(--cui-primary-bg-subtle); color:var(--cui-primary);
    }
    .section-title {
      font-size:.68rem; font-weight:600; text-transform:uppercase; letter-spacing:.07em;
      color:var(--cui-tertiary-color); margin:0 0 .6rem;
    }

    /* ── Compact form controls ──────────────────────────────────────────────── */
    .inv-field { display:flex; flex-direction:column; gap:.2rem; }
    .inv-label {
      font-size:.72rem; font-weight:500; color:var(--cui-secondary-color);
      line-height:1; white-space:nowrap;
    }
    .inv-label .req { color:var(--cui-danger); margin-left:.15rem; }
    .inv-ctrl {
      font-size:.82rem !important;
      padding:.28rem .45rem !important;
      height:auto !important;
      min-height:0 !important;
      line-height:1.4 !important;
    }
    select.inv-ctrl, select.form-select.inv-ctrl { padding-right:1.6rem !important; }

    /* ── Supplier search chip ────────────────────────────────────────────────── */
    .supp-search-wrap { position:relative; flex:1; min-width:180px; }
    .supp-chip {
      display:flex; align-items:center; gap:.4rem;
      padding:.25rem .5rem; border:1px solid var(--cui-border-color);
      border-radius:5px; background:var(--cui-tertiary-bg);
      font-size:.82rem; min-height:0; flex:1;
    }
    .supp-chip__name { font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:1; min-width:0; }
    .supp-chip__meta { font-size:.71rem; color:var(--cui-secondary-color); white-space:nowrap; }
    .supp-chip__btn {
      background:none; border:none; padding:.1rem .25rem; cursor:pointer;
      color:var(--cui-secondary-color); border-radius:3px; flex-shrink:0;
    }
    .supp-chip__btn:hover { background:var(--cui-danger-bg-subtle); color:var(--cui-danger); }
    .supp-result {
      position:absolute; z-index:400; background:var(--cui-body-bg);
      border:1px solid var(--cui-border-color); border-radius:6px;
      max-height:200px; overflow-y:auto; width:100%; top:100%; left:0;
      box-shadow:0 4px 12px rgba(0,0,0,.1);
    }
    .supp-item {
      padding:.38rem .65rem; cursor:pointer; font-size:.8rem;
      border-bottom:1px solid var(--cui-border-color);
    }
    .supp-item:last-child { border-bottom:none; }
    .supp-item:hover { background:var(--cui-tertiary-bg); }
    .supp-item--sub { font-size:.71rem; color:var(--cui-secondary-color); }
    .supp-wrap { position:relative; }

    /* ── Lines table ────────────────────────────────────────────────────────── */
    .lines-table { width:100%; border-collapse:collapse; }
    .lines-table th {
      font-size:.67rem; font-weight:600; text-transform:uppercase; letter-spacing:.05em;
      color:var(--cui-tertiary-color); padding:.3rem .4rem;
      border-bottom:1px solid var(--cui-border-color); background:var(--cui-tertiary-bg);
      white-space:nowrap;
    }
    .lines-table td {
      padding:.2rem .3rem; border-bottom:1px solid var(--cui-border-color);
      vertical-align:middle;
    }
    .lines-table tr:last-child td { border-bottom:none; }
    .lines-table .cell-num input { text-align:right; }
    .lines-table input, .lines-table select {
      font-size:.8rem !important; padding:.18rem .35rem !important; height:auto !important;
    }
    .lines-table select { padding-right:1.6rem !important; }
    .lines-table tbody tr:nth-child(even) { background:var(--cui-tertiary-bg); }

    /* ── Product search ─────────────────────────────────────────────────────── */
    .line-desc-wrap { display:flex; align-items:center; gap:.25rem; }
    .line-desc-field { flex:1; min-width:0; }
    .line-search-btn {
      background:none; border:1px solid var(--cui-border-color); border-radius:4px;
      padding:.1rem .25rem; color:var(--cui-secondary-color); cursor:pointer;
      flex-shrink:0; line-height:1; height:26px; width:26px;
      display:flex; align-items:center; justify-content:center;
    }
    .line-search-btn:hover {
      background:var(--cui-tertiary-bg); color:var(--cui-body-color);
      border-color:var(--cui-secondary-color);
    }
    .product-drop-fixed {
      position:fixed; z-index:1060;
      background:var(--cui-body-bg);
      border:1px solid var(--cui-border-color);
      border-radius:6px; width:300px; padding:.4rem;
      box-shadow:0 6px 20px rgba(0,0,0,.14);
    }

    /* ── Totals panel ───────────────────────────────────────────────────────── */
    .totals-panel { font-size:.82rem; }
    .totals-row { display:flex; justify-content:space-between; padding:.18rem 0; }
    .totals-row--total {
      font-size:.96rem; font-weight:600; color:var(--cui-primary);
      border-top:1px solid var(--cui-border-color); margin-top:.3rem; padding-top:.3rem;
    }
    .totals-label { color:var(--cui-secondary-color); }
    .totals-value { font-family:monospace; }
  `],
  imports: [
    CommonModule, ReactiveFormsModule, RouterLink,
    CardModule, ButtonModule, GridModule, BadgeModule, SpinnerModule,
    FormModule, AlertModule, IconModule,
    InputGroupComponent, InputGroupTextDirective,
    ModalModule
  ]
})
export class PurchaseFormComponent implements OnInit, OnDestroy {
  private svc           = inject(PurchasesService);
  private personasSvc   = inject(PersonasService);
  private productsSvc   = inject(ProductsService);
  private settingsSvc   = inject(SettingsService);
  private notifications = inject(NotificationService);
  private router        = inject(Router);
  private route         = inject(ActivatedRoute);
  private fb            = inject(FormBuilder);
  private costCentersSvc = inject(CostCentersService);
  private destroy$      = new Subject<void>();

  // ── State ──────────────────────────────────────────────────────────────────
  purchaseId  = signal<string | null>(null);
  loading     = signal(true);
  saving      = signal(false);
  isNew       = signal(true);
  purchase    = signal<Purchase | null>(null);

  // ── Reference data ─────────────────────────────────────────────────────────
  suppliers   = signal<Person[]>([]);
  products    = signal<Product[]>([]);
  warehouses  = signal<Warehouse[]>([]);
  nextNumber  = signal<number>(1);
  readonly SERIE = 'C';

  // ── Supplier search ─────────────────────────────────────────────────────────
  supplierSearch       = signal('');
  showSupplierDrop     = signal(false);
  selectedSupplier     = signal<Person | null>(null);

  // ── Centro de costo (Fase 6.1) ──────────────────────────────────────────────
  costCenters             = signal<CostCenter[]>([]);
  selectedCostCenterId    = signal('');
  selectedCostCenterName  = signal('');

  supplierResults = computed(() => {
    const term = this.supplierSearch().toLowerCase().trim();
    if (!term || term.length < 2) return [];
    return this.suppliers().filter(s =>
      s.name.toLowerCase().includes(term) ||
      (s.legalName ?? '').toLowerCase().includes(term) ||
      s.taxId.includes(term) ||
      (s.supplierData?.code ?? '').toLowerCase().includes(term)
    ).slice(0, 8);
  });

  // ── Product search (per line) ───────────────────────────────────────────────
  productSearch    = signal('');
  productSearchIdx = signal<number | null>(null);
  showProductDrop  = signal(false);
  productDropPos   = signal<{ top: number; left: number }>({ top: 0, left: 0 });

  productResults = computed(() => {
    const term = this.productSearch().toLowerCase().trim();
    if (!term || term.length < 2) return [];
    return this.products().filter(p =>
      p.name.toLowerCase().includes(term) ||
      (p.sku ?? '').toLowerCase().includes(term)
    ).slice(0, 8);
  });

  // ── Confirm receive modal ───────────────────────────────────────────────────
  showReceiveModal = signal(false);

  // ── Status ─────────────────────────────────────────────────────────────────
  currentStatus = computed(() => {
    if (this.isNew()) return 'draft' as PurchaseStatus;
    return (this.purchase()?.status ?? 'draft') as PurchaseStatus;
  });

  isReadOnly = computed(() =>
    this.currentStatus() === 'received' || this.currentStatus() === 'cancelled'
  );

  pageTitle = computed(() => {
    if (this.isNew()) {
      const num = this.nextNumber();
      const year = new Date().getFullYear();
      return `Nueva Compra — ${buildPurchaseFullNumber(this.SERIE, year, num)}`;
    }
    return `Compra ${this.purchase()?.fullNumber ?? ''}`;
  });

  readonly STATUS_LABELS = PURCHASE_STATUS_LABELS;
  readonly STATUS_COLORS = PURCHASE_STATUS_COLORS;
  readonly vatOptions = [0, 15];

  // ── Catálogos SRI (para el ATS — Anexo Transaccional Simplificado) ─────────
  readonly sriDocumentTypes = SUPPORT_DOC_TYPES;
  readonly sriSustentoCodes = SRI_SUSTENTO_CODES;
  readonly sriPaymentMethods = SRI_PAYMENT_METHODS;

  // ── Form ───────────────────────────────────────────────────────────────────
  form!: FormGroup;

  get linesArray(): FormArray { return this.form.get('lines') as FormArray; }

  // ── Totals ─────────────────────────────────────────────────────────────────
  totals = signal(calcPurchaseTotals([], 0, 0));

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.buildForm();
    this.loadReferenceData();

    const id = this.route.snapshot.paramMap.get('id');
    if (id && id !== 'new') {
      this.purchaseId.set(id);
      this.isNew.set(false);
      this.loadPurchase(id);
    } else {
      this.loading.set(false);
      this.addLine();
      // A2: pre-cargar proveedor desde queryParams (deep-link desde ficha proveedor)
      this.preloadSupplierFromQuery();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ─── Form builder ──────────────────────────────────────────────────────────

  private buildForm(): void {
    const today = this.toDateInput(new Date());
    this.form = this.fb.group({
      supplierInvoiceNumber: ['', Validators.required],
      supplierInvoiceDate:   [today, Validators.required],
      supplierAccessKey:     ['', [Validators.maxLength(49)]],
      warehouseCode:         ['', Validators.required],
      date:                  [today, Validators.required],
      expectedDate:          [''],
      notes:                 [''],
      // Datos para el ATS — valores por defecto cubren el caso más común
      sriDocumentType:  ['01', Validators.required], // Factura de venta
      sriSustentoCode:  ['01', Validators.required], // Compras
      paymentMethodCode: [''],
      lines:                 this.fb.array([])
    });

    this.form.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.refreshTotals());
  }

  private refreshTotals(): void {
    const lines = this.linesArray.controls.map(c => c.value as PurchaseLine);
    const ir  = this.selectedSupplier()?.supplierData?.irRetentionPct  ?? 0;
    const iva = this.selectedSupplier()?.supplierData?.vatRetentionPct ?? 0;
    this.totals.set(calcPurchaseTotals(lines, ir, iva));
  }

  // ─── Reference data ────────────────────────────────────────────────────────

  private loadReferenceData(): void {
    this.personasSvc.getPersonas('supplier').pipe(take(1)).subscribe({
      next: list => this.suppliers.set(list.filter(s => s.isActive).sort((a, b) => a.name.localeCompare(b.name, 'es')))
    });
    this.productsSvc.getActiveProducts().pipe(take(1)).subscribe({
      next: list => this.products.set(list.sort((a, b) => a.name.localeCompare(b.name, 'es')))
    });
    this.settingsSvc.getWarehouses().pipe(take(1)).subscribe({
      next: whs => {
        this.warehouses.set(whs.filter(w => w.isActive));
        const main = whs.find(w => w.isMain) ?? whs[0];
        if (main && !this.form.get('warehouseCode')?.value) {
          this.form.patchValue({ warehouseCode: main.code });
        }
      }
    });
    // Peek next purchase number for display
    const year = new Date().getFullYear();
    this.svc.peekNextNumber(this.SERIE, year).then(n => this.nextNumber.set(n)).catch(() => {});
    this.costCentersSvc.getCostCenters().pipe(take(1)).subscribe({
      next: list => this.costCenters.set(list.filter(c => c.isActive))
    });
  }

  // ─── Load existing purchase ────────────────────────────────────────────────

  private loadPurchase(id: string): void {
    this.svc.getById(id).pipe(take(1)).subscribe({
      next: p => {
        if (!p) { this.router.navigate(['/purchases']); return; }
        this.purchase.set(p);
        this.patchForm(p);
        this.loading.set(false);
      },
      error: () => { this.loading.set(false); }
    });
  }

  private patchForm(p: Purchase): void {
    this.form.patchValue({
      supplierInvoiceNumber: p.supplierInvoiceNumber,
      supplierInvoiceDate:   this.tsToDateInput(p.supplierInvoiceDate),
      supplierAccessKey:     p.supplierAccessKey ?? '',
      warehouseCode:         p.warehouseCode,
      date:                  this.tsToDateInput(p.date),
      expectedDate:          p.expectedDate ? this.tsToDateInput(p.expectedDate) : '',
      notes:                 p.notes ?? '',
      sriDocumentType:       p.sriDocumentType ?? '01',
      sriSustentoCode:       p.sriSustentoCode ?? '01',
      paymentMethodCode:     p.paymentMethodCode ?? '',
    });
    this.selectedCostCenterId.set(p.costCenterId ?? '');
    this.selectedCostCenterName.set(p.costCenterName ?? '');

    // Restore supplier chip
    const existingSupplier = this.suppliers().find(s => s.id === p.supplierId);
    if (existingSupplier) {
      this.selectedSupplier.set(existingSupplier);
      this.supplierSearch.set(existingSupplier.name);
    } else {
      // Build minimal supplier from snapshot
      this.selectedSupplier.set({
        id:           p.supplierId,
        roles:        ['supplier'],
        taxId:        p.supplierRuc,
        taxIdType:    p.supplierTaxIdType as any,
        isCompany:    true,
        name:         p.supplierName,
        legalName:    p.supplierName,
        addresses:    [],
        bankAccounts: [],
        supplierData: {
          code:            '',
          currency:        'USD',
          paymentTermCode: '',
          vatRegime:       'General',
          irRetentionPct:  p.irRetentionPct,
          vatRetentionPct: p.vatRetentionPct,
        },
        isActive: true,
        createdAt: null as any,
        updatedAt: null as any,
      } as Person);
      this.supplierSearch.set(p.supplierName);
    }

    // Restore lines
    const fa = this.linesArray;
    while (fa.length) fa.removeAt(0);
    for (const line of p.lines) {
      fa.push(this.buildLineGroup(line));
    }

    if (this.isReadOnly()) {
      this.form.disable();
    }

    this.refreshTotals();
  }

  // ─── Supplier pre-load from query params (A2) ─────────────────────────────

  private preloadSupplierFromQuery(): void {
    const qSupplierId = this.route.snapshot.queryParamMap.get('supplierId');
    if (!qSupplierId) return;
    // Wait for suppliers to be loaded, then find and select
    const trySelect = () => {
      const found = this.suppliers().find(s => s.id === qSupplierId);
      if (found) {
        this.selectSupplier(found);
      }
    };
    // Suppliers may not be loaded yet — retry once they arrive
    if (this.suppliers().length > 0) {
      trySelect();
    } else {
      const interval = setInterval(() => {
        if (this.suppliers().length > 0) {
          clearInterval(interval);
          trySelect();
        }
      }, 100);
      setTimeout(() => clearInterval(interval), 5000);
    }
  }

  // ─── Supplier selection ────────────────────────────────────────────────────

  selectSupplier(s: Person): void {
    this.selectedSupplier.set(s);
    this.supplierSearch.set(s.name);
    this.showSupplierDrop.set(false);
    // Precarga el centro de costo por defecto del proveedor, editable por el usuario.
    this.selectedCostCenterId.set(s.supplierData?.defaultCostCenterId ?? '');
    this.selectedCostCenterName.set(s.supplierData?.defaultCostCenterName ?? '');
    this.refreshTotals();
  }

  onCostCenterSelect(event: Event): void {
    const id = (event.target as HTMLSelectElement).value;
    const cc = this.costCenters().find(c => c.id === id);
    this.selectedCostCenterId.set(cc?.id ?? '');
    this.selectedCostCenterName.set(cc?.name ?? '');
  }

  blurSupplier(): void {
    setTimeout(() => this.showSupplierDrop.set(false), 180);
  }

  clearSupplier(): void {
    this.selectedSupplier.set(null);
    this.supplierSearch.set('');
    this.showSupplierDrop.set(false);
    this.refreshTotals();
  }

  onSupplierInput(value: string): void {
    this.supplierSearch.set(value);
    this.showSupplierDrop.set(value.length >= 2);
  }

  // ─── Lines ─────────────────────────────────────────────────────────────────

  private buildLineGroup(line?: Partial<PurchaseLine>): FormGroup {
    const g = this.fb.group({
      id:          [line?.id ?? crypto.randomUUID()],
      productId:   [line?.productId ?? ''],
      productSku:  [line?.productSku ?? ''],
      productName: [line?.productName ?? '', Validators.required],
      description: [line?.description ?? ''],
      qty:         [line?.qty ?? 1, [Validators.required, Validators.min(0.001)]],
      unitCost:    [line?.unitCost ?? 0, [Validators.required, Validators.min(0)]],
      discount:    [line?.discount ?? 0, [Validators.min(0), Validators.max(100)]],
      subtotal:    [line?.subtotal ?? 0],
      taxRate:     [line?.taxRate ?? 15],
      taxAmount:   [line?.taxAmount ?? 0],
      total:       [line?.total ?? 0],
    });

    ['qty', 'unitCost', 'discount', 'taxRate'].forEach(field => {
      g.get(field)?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => this.recalcLine(g));
    });

    return g;
  }

  private recalcLine(g: FormGroup): void {
    const qty      = parseFloat(g.get('qty')?.value)      || 0;
    const unitCost = parseFloat(g.get('unitCost')?.value) || 0;
    const discount = parseFloat(g.get('discount')?.value) || 0;
    const taxRate  = parseFloat(g.get('taxRate')?.value)  || 0;
    const { subtotal, taxAmount, total } = calcPurchaseLine(qty, unitCost, discount, taxRate);
    g.patchValue({ subtotal, taxAmount, total }, { emitEvent: false });
  }

  addLine(): void {
    this.linesArray.push(this.buildLineGroup());
  }

  removeLine(idx: number): void {
    if (this.linesArray.length > 1) this.linesArray.removeAt(idx);
  }

  // ─── Product search per line ────────────────────────────────────────────────

  openProductSearch(idx: number, event: MouseEvent): void {
    const btn  = event.currentTarget as HTMLElement;
    const rect = btn.getBoundingClientRect();
    this.productDropPos.set({ top: rect.bottom + 4, left: rect.left });
    this.productSearchIdx.set(idx);
    this.productSearch.set('');
    this.showProductDrop.set(true);
    setTimeout(() => {
      document.querySelector<HTMLInputElement>('.product-drop-fixed input')?.focus();
    }, 30);
  }

  onProductInput(value: string): void {
    this.productSearch.set(value);
  }

  selectProduct(p: Product, idx: number): void {
    const g = this.linesArray.at(idx) as FormGroup;
    g.patchValue({
      productId:   p.id,
      productSku:  p.sku ?? '',
      productName: p.name,
      description: p.name,
      unitCost:    p.costPrice ?? 0,
      taxRate:     p.taxRate ?? 15,
    });
    this.recalcLine(g);
    this.showProductDrop.set(false);
    this.productSearchIdx.set(null);
    this.productSearch.set('');
  }

  closeProductDrop(): void {
    this.showProductDrop.set(false);
    this.productSearchIdx.set(null);
  }

  // ─── Save ──────────────────────────────────────────────────────────────────

  private buildPayload(extraStatus?: PurchaseStatus): Omit<import('./services/purchases.service').PurchaseCreateInput, never> {
    const v          = this.form.value;
    const supplier   = this.selectedSupplier();
    const warehouse  = this.warehouses().find(w => w.code === v.warehouseCode);
    const year       = new Date().getFullYear();
    const status     = extraStatus ?? 'draft';

    const lines: PurchaseLine[] = (this.linesArray.controls as FormGroup[]).map(g => g.value as PurchaseLine);
    const irPct  = supplier?.supplierData?.irRetentionPct  ?? 0;
    const vatPct = supplier?.supplierData?.vatRetentionPct ?? 0;
    const t      = calcPurchaseTotals(lines, irPct, vatPct);

    return {
      serie:                 this.SERIE,
      year,
      supplierInvoiceNumber: v.supplierInvoiceNumber,
      supplierInvoiceDate:   this.dateToTs(v.supplierInvoiceDate),
      supplierAccessKey:     v.supplierAccessKey || undefined,
      supplierId:            supplier?.id ?? '',
      supplierName:          supplier?.name ?? '',
      supplierRuc:           supplier?.taxId ?? '',
      supplierTaxIdType:     supplier?.taxIdType ?? '',
      irRetentionPct:        irPct,
      vatRetentionPct:       vatPct,
      costCenterId:          this.selectedCostCenterId()   || undefined,
      costCenterName:        this.selectedCostCenterName() || undefined,
      warehouseCode:         v.warehouseCode,
      warehouseName:         warehouse?.name ?? v.warehouseCode,
      date:                  this.dateToTs(v.date),
      expectedDate:          v.expectedDate ? this.dateToTs(v.expectedDate) : undefined,
      notes:                 v.notes || undefined,
      sriDocumentType:       v.sriDocumentType || '01',
      sriSustentoCode:       v.sriSustentoCode || '01',
      paymentMethodCode:     v.paymentMethodCode || undefined,
      lines,
      subtotal:              t.subtotal,
      totalDiscount:         t.totalDiscount,
      totalTax:              t.totalTax,
      totalIrRetention:      t.totalIrRetention,
      totalVatRetention:     t.totalVatRetention,
      total:                 t.total,
      status,
      retentionId:           undefined,
    };
  }

  async saveDraft(): Promise<void> {
    if (!this.validateBeforeSave()) return;
    await this.doSave('draft');
  }

  async saveAndSend(): Promise<void> {
    if (!this.validateBeforeSave()) return;
    await this.doSave('sent');
  }

  private async doSave(status: PurchaseStatus): Promise<void> {
    this.saving.set(true);
    try {
      const payload = this.buildPayload(status);
      if (this.isNew()) {
        const id = await this.svc.create(payload as any);
        this.notifications.success('Compra guardada correctamente');
        this.router.navigate(['/purchases', id]);
      } else {
        await this.svc.update(this.purchaseId()!, payload as any);
        this.notifications.success('Compra actualizada');
      }
    } catch (err: any) {
      this.notifications.error('Error al guardar: ' + (err?.message ?? err));
    } finally {
      this.saving.set(false);
    }
  }

  confirmReceive(): void {
    this.showReceiveModal.set(true);
  }

  async markReceived(): Promise<void> {
    if (!this.purchaseId()) return;
    this.saving.set(true);
    try {
      // If form is dirty, save first with 'received' status
      if (this.form.dirty && !this.isNew()) {
        await this.svc.update(this.purchaseId()!, this.buildPayload('received') as any);
      } else {
        await this.svc.markReceived(this.purchaseId()!);
      }
      this.showReceiveModal.set(false);
      this.notifications.success('Compra marcada como recibida. El stock será procesado.');
      this.router.navigate(['/purchases']);
    } catch (err: any) {
      this.notifications.error('Error al recibir: ' + (err?.message ?? err));
    } finally {
      this.saving.set(false);
    }
  }

  private validateBeforeSave(): boolean {
    this.form.markAllAsTouched();
    if (!this.selectedSupplier()) {
      this.notifications.error('Debe seleccionar un proveedor');
      return false;
    }
    if (this.form.invalid) {
      this.notifications.error('Por favor complete los campos requeridos');
      return false;
    }
    if (this.linesArray.length === 0) {
      this.notifications.error('Agregue al menos una línea de producto');
      return false;
    }
    return true;
  }

  // ─── Utilities ─────────────────────────────────────────────────────────────

  private toDateInput(date: Date): string {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  private tsToDateInput(ts: Timestamp): string {
    return ts?.toDate ? this.toDateInput(ts.toDate()) : '';
  }

  private dateToTs(dateStr: string): Timestamp {
    return Timestamp.fromDate(new Date(dateStr + 'T00:00:00'));
  }

  goBack(): void {
    this.router.navigate(['/purchases']);
  }

  /** Navigate to retention form pre-filled with this purchase data. */
  generateRetention(): void {
    const p = this.purchase();
    if (!p) return;
    this.router.navigate(['/retentions/new'], { queryParams: {
      fromPurchase:      p.id,
      supplierId:        p.supplierId,
      supplierName:      p.supplierName,
      supplierTaxId:     p.supplierRuc,
      supplierTaxIdType: p.supplierTaxIdType,
      supportDocNumber:  p.supplierInvoiceNumber,
      supportDocTotal:   p.total,
      irRetentionPct:    p.irRetentionPct,
      vatRetentionPct:   p.vatRetentionPct,
    }});
  }
}
