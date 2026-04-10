import {
  Component, OnInit, OnDestroy, inject, signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { FormBuilder, FormGroup, FormArray, Validators, ReactiveFormsModule, AbstractControl } from '@angular/forms';
import { Subject, takeUntil, take } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { Timestamp } from '@angular/fire/firestore';
import {
  CardModule, ButtonModule, GridModule, BadgeModule,
  SpinnerModule, FormModule, TooltipModule,
  InputGroupComponent, InputGroupTextDirective,
  ModalModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';

import { InvoicesService }  from './services/invoices.service';
import { PersonasService }  from '../personas/services/personas.service';
import type { PersonCreateInput } from '../personas/services/personas.service';
import { ecuadorTaxIdValidator } from '../../core/validators/ecuador.validators';
import { ProductsService }  from '../products/services/products.service';
import { SettingsService }  from '../settings/services/settings.service';
import { NotificationService } from '../../core/services/notification.service';
import {
  Invoice, InvoiceLine, InvoiceStatus,
  INVOICE_STATUS_LABELS, INVOICE_STATUS_COLORS,
  SriPaymentMethod, SRI_PAYMENT_METHODS,
  calcLine, calcInvoiceTotals, buildFullNumber
} from './models/invoice.interface';
import { Person, TaxIdType } from '../personas/models/person.interface';
import { Product } from '../products/models/product.interface';
import { PaymentTerm, Warehouse, DocumentSeries } from '../settings/models/settings.interfaces';

@Component({
  selector: 'app-invoice-form',
  standalone: true,
  templateUrl: './invoice-form.component.html',
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
    /* Native select: cSelect adds form-select class; override padding */
    select.inv-ctrl, select.form-select.inv-ctrl { padding-right:1.6rem !important; }

    /* ── Customer row (inline with first field row) ─────────────────────────── */
    .cust-search-wrap { position:relative; flex:1; min-width:180px; }
    .cust-chip {
      display:flex; align-items:center; gap:.4rem;
      padding:.25rem .5rem; border:1px solid var(--cui-border-color);
      border-radius:5px; background:var(--cui-tertiary-bg);
      font-size:.82rem; min-height:0; flex:1;
    }
    .cust-chip__name { font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:1; min-width:0; }
    .cust-chip__meta { font-size:.71rem; color:var(--cui-secondary-color); white-space:nowrap; }
    .cust-chip__btn {
      background:none; border:none; padding:.1rem .25rem; cursor:pointer;
      color:var(--cui-secondary-color); border-radius:3px; flex-shrink:0;
    }
    .cust-chip__btn:hover { background:var(--cui-danger-bg-subtle); color:var(--cui-danger); }

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
    .lines-table tbody tr:hover td { background:var(--cui-tertiary-bg); }

    /* ── Product search button ──────────────────────────────────────────────── */
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

    /* ── Product drop — position:fixed, escapes overflow containers ─────────── */
    .product-drop-fixed {
      position:fixed;
      z-index:1060;
      background:var(--cui-body-bg);
      border:1px solid var(--cui-border-color);
      border-radius:6px;
      width:300px;
      padding:.4rem;
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
    .discount-input {
      width:48px; padding:.04rem .2rem; border:1px solid var(--cui-border-color);
      border-radius:3px; font-size:.76rem; text-align:right;
      background:var(--cui-body-bg); color:var(--cui-body-color); margin:0 .15rem;
    }

    /* ── VAT badge (neutral, no background) ────────────────────────────────── */
    .vat-badge {
      display:inline-block; padding:.1rem .35rem;
      color:var(--cui-body-color); border-radius:4px;
      font-size:.73rem; font-family:monospace; white-space:nowrap;
      border:1px solid transparent;
    }
    .vat-badge--clickable { cursor:pointer; border-color:var(--cui-border-color); }
    .vat-badge--clickable:hover { border-color:var(--cui-secondary-color); background:var(--cui-tertiary-bg); }
    .cell-vat { min-width:58px; }

    /* ── SKU / product inline dropdown (position:fixed escapes overflow) ────── */
    .sku-drop-fixed {
      position:fixed; z-index:1060;
      background:var(--cui-body-bg);
      border:1px solid var(--cui-border-color); border-radius:6px;
      min-width:280px; max-height:220px; overflow-y:auto;
      box-shadow:0 6px 20px rgba(0,0,0,.14);
    }

    /* ── Keyboard-active item in any dropdown ───────────────────────────────── */
    .drop-item--active { background:var(--cui-tertiary-bg) !important; }

    /* ── Customer search dropdown ───────────────────────────────────────────── */
    .customer-result {
      position:absolute; z-index:400; background:var(--cui-body-bg);
      border:1px solid var(--cui-border-color); border-radius:6px;
      max-height:200px; overflow-y:auto; width:100%; top:100%; left:0;
      box-shadow:0 4px 12px rgba(0,0,0,.1);
    }
    .customer-item {
      padding:.38rem .65rem; cursor:pointer; font-size:.8rem;
      border-bottom:1px solid var(--cui-border-color);
    }
    .customer-item:last-child { border-bottom:none; }
    .customer-item:hover { background:var(--cui-tertiary-bg); }
    .customer-item--sub { font-size:.71rem; color:var(--cui-secondary-color); }
    .customer-wrap { position:relative; }

    /* ── Autosave indicator ─────────────────────────────────────────────────── */
    .autosave-indicator {
      font-size:.67rem; font-weight:400; padding:.1rem .38rem;
      border-radius:10px; display:inline-flex; align-items:center;
    }
    .autosave-indicator--saving { background:var(--cui-info-bg-subtle); color:var(--cui-info-emphasis); }
    .autosave-indicator--saved  { background:var(--cui-success-bg-subtle); color:var(--cui-success-emphasis); }
    .autosave-indicator--error  { background:var(--cui-danger-bg-subtle); color:var(--cui-danger); }
  `],
  imports: [
    CommonModule, ReactiveFormsModule,
    CardModule, ButtonModule, GridModule, BadgeModule, SpinnerModule,
    FormModule, TooltipModule, IconModule,
    InputGroupComponent, InputGroupTextDirective,
    ModalModule
  ]
})
export class InvoiceFormComponent implements OnInit, OnDestroy {
  private svc           = inject(InvoicesService);
  private personasSvc   = inject(PersonasService);
  private productsSvc   = inject(ProductsService);
  private settingsSvc   = inject(SettingsService);
  private notifications = inject(NotificationService);
  private router        = inject(Router);
  private route         = inject(ActivatedRoute);
  private fb            = inject(FormBuilder);
  private destroy$      = new Subject<void>();

  // ── State ─────────────────────────────────────────────────────────────────
  invoiceId   = signal<string | null>(null);
  loading     = signal(true);
  saving      = signal(false);
  isNew       = signal(true);
  invoice     = signal<Invoice | null>(null);

  // ── Reference data ────────────────────────────────────────────────────────
  customers     = signal<Person[]>([]);
  agents        = signal<Person[]>([]);
  products      = signal<Product[]>([]);
  paymentTerms  = signal<PaymentTerm[]>([]);
  warehouses    = signal<Warehouse[]>([]);
  seriesList    = signal<DocumentSeries[]>([]);

  // ── Customer search ───────────────────────────────────────────────────────
  customerSearch       = signal('');
  showCustomerDrop     = signal(false);
  selectedCustomer     = signal<Person | null>(null);
  customerHighlightIdx = signal(0);

  customerResults = computed(() => {
    const term = this.customerSearch().toLowerCase().trim();
    if (!term || term.length < 2) return [];
    return this.customers().filter(c =>
      c.name.toLowerCase().includes(term) ||
      c.taxId.includes(term) ||
      (c.customerData?.code ?? '').includes(term)
    ).slice(0, 8);
  });

  // ── SKU inline search (per line, position:fixed dropdown) ────────────────
  skuDropOpenIdx = signal<number | null>(null);
  skuDropPos     = signal<{ top: number; left: number }>({ top: 0, left: 0 });
  skuSearch      = signal('');
  skuHighlight   = signal(0);

  skuResults = computed(() => {
    const term = this.skuSearch().toLowerCase().trim();
    if (!term) return [];
    return this.products().filter(p =>
      (p.sku ?? '').toLowerCase().includes(term) ||
      p.name.toLowerCase().includes(term)
    ).slice(0, 10);
  });

  // ── Product search per row (lupa button, position:fixed) ──────────────────
  productSearch     = signal('');
  productSearchIdx  = signal<number | null>(null);
  showProductDrop   = signal(false);
  productDropPos    = signal<{ top: number; left: number }>({ top: 0, left: 0 });

  // ── VAT expand per row (F2.2) ─────────────────────────────────────────────
  vatExpandedIdx    = signal<number | null>(null);

  productResults = computed(() => {
    const term = this.productSearch().toLowerCase().trim();
    if (!term || term.length < 2) return [];
    return this.products().filter(p =>
      p.name.toLowerCase().includes(term) ||
      (p.sku ?? '').toLowerCase().includes(term)
    ).slice(0, 8);
  });

  // ── F3.1 — Autosave ───────────────────────────────────────────────────────
  autoSaveStatus = signal<'idle' | 'saving' | 'saved' | 'error'>('idle');
  autoSavedAt    = signal<Date | null>(null);

  // ── F3.3 — Quick customer modal ───────────────────────────────────────────
  showNewCustomerModal = signal(false);
  savingNewCustomer    = signal(false);
  newCustomerForm!: FormGroup;

  // ── F3.2 — SRI Payment Methods ────────────────────────────────────────────
  readonly sriPaymentMethods = SRI_PAYMENT_METHODS;

  readonly STATUS_LABELS = INVOICE_STATUS_LABELS;
  readonly STATUS_COLORS = INVOICE_STATUS_COLORS;
  readonly vatOptions = [0, 5, 8, 15];

  // ── Form ──────────────────────────────────────────────────────────────────
  form!: FormGroup;

  get linesArray(): FormArray         { return this.form.get('lines')          as FormArray; }
  get paymentMethodsArray(): FormArray { return this.form.get('paymentMethods') as FormArray; }

  // ── Totals (signal, updated via form.valueChanges) ───────────────────────
  totals = signal(calcInvoiceTotals([], 0));

  // ── Dirty state ───────────────────────────────────────────────────────────
  isDirty = computed(() => this.form?.dirty ?? false);

  // ── Status ────────────────────────────────────────────────────────────────
  currentStatus = computed(() => {
    if (this.isNew()) return 'draft' as InvoiceStatus;
    return (this.invoice()?.status ?? 'draft') as InvoiceStatus;
  });

  pageTitle = computed(() =>
    this.isNew() ? 'Nueva Factura' : `Factura ${this.invoice()?.fullNumber ?? ''}`
  );

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.buildForm();
    this.buildNewCustomerForm();
    this.loadReferenceData();

    const id = this.route.snapshot.paramMap.get('id');
    if (id && id !== 'new') {
      this.invoiceId.set(id);
      this.isNew.set(false);
      this.loadInvoice(id);
    } else {
      this.loading.set(false);
      this.addLine(); // start with one empty line
      // Auto-focus customer search on new invoice
      setTimeout(() => {
        document.querySelector<HTMLInputElement>('.customer-wrap input')?.focus();
      }, 80);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ─── Form builder ──────────────────────────────────────────────────────────

  private buildPaymentMethodGroup = (pm?: Partial<SriPaymentMethod>): FormGroup => {
    return this.fb.group({
      code:     [pm?.code ?? '01', Validators.required],
      amount:   [pm?.amount ?? 0, [Validators.required, Validators.min(0)]],
      deadline: [pm?.deadline ?? 0],
      timeUnit: [pm?.timeUnit ?? 'dias'],
    });
  };

  private buildForm(): void {
    const today = this.toDateInput(new Date());
    this.form = this.fb.group({
      seriesCode:         ['A', Validators.required],
      fiscalYear:         [new Date().getFullYear().toString(), Validators.required],
      date:               [today, Validators.required],
      dueDate:            [today, Validators.required],
      warehouseCode:      ['', Validators.required],
      paymentTermCode:    ['', Validators.required],
      currency:           ['USD'],
      exchangeRate:       [1],
      agentCode:          [''],
      globalDiscountPct:  [0, [Validators.min(0), Validators.max(100)]],
      customerReference:  [''],
      notes:              [''],
      paymentMethods:     this.fb.array([this.buildPaymentMethodGroup()]),
      lines:              this.fb.array([])
    });

    // Recalculate totals on any form change
    this.form.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.refreshTotals());
  }

  private refreshTotals(): void {
    const lines: InvoiceLine[] = this.linesArray.controls.map(c => c.value as InvoiceLine);
    const disc = this.form.get('globalDiscountPct')?.value ?? 0;
    this.totals.set(calcInvoiceTotals(lines, disc));
  }

  private loadReferenceData(): void {
    this.personasSvc.getPersonas('customer').pipe(take(1)).subscribe({
      next: list => this.customers.set(list.filter(p => p.isActive).sort((a, b) => a.name.localeCompare(b.name, 'es')))
    });
    this.personasSvc.getPersonas('employee').pipe(take(1)).subscribe({
      next: list => this.agents.set(list.filter(p => p.isActive).sort((a, b) => a.name.localeCompare(b.name, 'es')))
    });
    this.productsSvc.getActiveProducts().pipe(take(1)).subscribe({
      next: list => this.products.set(list.sort((a, b) => a.name.localeCompare(b.name, 'es')))
    });
    this.settingsSvc.getPaymentTerms().pipe(take(1)).subscribe({
      next: terms => {
        this.paymentTerms.set(terms.filter(t => t.isActive));
        if (terms.length && !this.form.get('paymentTermCode')?.value) {
          this.form.patchValue({ paymentTermCode: terms[0].code });
        }
      }
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
    this.settingsSvc.getDocumentSeries().pipe(take(1)).subscribe({
      next: list => {
        const invoiceSeries = list.filter(s => s.documentType === 'invoice' && s.isActive);
        this.seriesList.set(invoiceSeries);
        if (invoiceSeries.length && !this.form.get('seriesCode')?.value) {
          this.form.patchValue({ seriesCode: invoiceSeries[0].code });
        }
      }
    });
  }

  private loadInvoice(id: string): void {
    this.svc.getInvoice(id).pipe(take(1)).subscribe({
      next: inv => {
        if (!inv) { this.router.navigate(['/invoices']); return; }
        this.invoice.set(inv);
        this.patchForm(inv);
        this.loading.set(false);
        // Setup autosave después de cargar (solo borradores)
        if (inv.status === 'draft') {
          setTimeout(() => this.setupAutoSave(), 500);
        }
      },
      error: () => { this.loading.set(false); }
    });
  }

  private patchForm(inv: Invoice): void {
    // Patch header
    this.form.patchValue({
      seriesCode:        inv.seriesCode,
      fiscalYear:        inv.fiscalYear,
      date:              this.tsToDateInput(inv.date),
      dueDate:           this.tsToDateInput(inv.dueDate),
      warehouseCode:     inv.warehouseCode,
      paymentTermCode:   inv.paymentTermCode,
      currency:          inv.currency,
      exchangeRate:      inv.exchangeRate,
      agentCode:         inv.agentCode ?? '',
      globalDiscountPct:  inv.globalDiscountPct,
      customerReference:  inv.customerReference ?? '',
      notes:              inv.notes ?? '',
    });

    // Restore payment methods FormArray
    const pma = this.paymentMethodsArray;
    while (pma.length) pma.removeAt(0);
    const methods = inv.paymentMethods?.length ? inv.paymentMethods : [{ code: '01', name: 'Efectivo', amount: inv.total }];
    for (const pm of methods) {
      pma.push(this.buildPaymentMethodGroup(pm));
    }

    // Set customer display and restore selectedCustomer from invoice snapshot
    // so the chip shows correctly and validation passes when re-emitting a draft
    this.customerSearch.set(inv.customerName);
    const existingCustomer = this.customers().find(c => c.id === inv.customerId);
    if (existingCustomer) {
      this.selectedCustomer.set(existingCustomer);
    } else {
      // Customers not yet loaded — build a minimal Person from the invoice snapshot
      this.selectedCustomer.set({
        id:           inv.customerId,
        roles:        ['customer'],
        taxId:        inv.customerTaxId,
        taxIdType:    inv.customerTaxIdType as TaxIdType,
        isCompany:    inv.customerTaxIdType === 'RUC',
        name:         inv.customerName,
        legalName:    inv.customerName,
        addresses:    inv.customerAddress ? [{
          id: '', label: '', country: 'Ecuador', isShipping: false, isBilling: true,
          province: inv.customerProvince ?? '', city: inv.customerCity ?? '', address: inv.customerAddress
        }] : [],
        bankAccounts: [],
        customerData: {
          code: inv.customerCode, currency: inv.currency,
          paymentTermCode: inv.paymentTermCode, vatRegime: 'General'
        },
        isActive: true,
      } as unknown as Person);
    }

    // Patch lines
    const fa = this.linesArray;
    while (fa.length) fa.removeAt(0);
    for (const line of inv.lines) {
      fa.push(this.buildLineGroup(line));
    }

    // Lock editing for non-draft
    if (inv.status !== 'draft') {
      this.form.disable();
    }

    this.refreshTotals();
  }

  // ─── Customer selection ────────────────────────────────────────────────────

  selectCustomer(c: Person, focusNext = true): void {
    this.selectedCustomer.set(c);
    this.customerSearch.set(c.name);
    this.showCustomerDrop.set(false);
    this.customerHighlightIdx.set(0);
    // Set due date based on payment term days
    const termCode = c.customerData?.paymentTermCode ?? this.form.get('paymentTermCode')?.value;
    if (termCode) {
      const term = this.paymentTerms().find(t => t.code === termCode);
      if (term) {
        this.form.patchValue({ paymentTermCode: termCode });
        const due = new Date();
        due.setDate(due.getDate() + (term.days ?? 0));
        this.form.patchValue({ dueDate: this.toDateInput(due) });
      }
    }
    if (focusNext) {
      setTimeout(() => this.focusLineField(0, 'productSku'), 50);
    }
  }

  blurCustomer(): void {
    setTimeout(() => this.showCustomerDrop.set(false), 180);
  }

  clearCustomer(): void {
    this.selectedCustomer.set(null);
    this.customerSearch.set('');
    this.showCustomerDrop.set(false);
  }

  // ─── Lines ─────────────────────────────────────────────────────────────────

  addPaymentMethod(): void {
    this.paymentMethodsArray.push(this.buildPaymentMethodGroup());
  }

  removePaymentMethod(i: number): void {
    if (this.paymentMethodsArray.length > 1) this.paymentMethodsArray.removeAt(i);
  }

  /** Returns the label for a payment method code */
  paymentMethodName(code: string): string {
    return this.sriPaymentMethods.find(m => m.code === code)?.name ?? code;
  }

  private buildLineGroup(line?: Partial<InvoiceLine>): FormGroup {
    const g = this.fb.group({
      id:           [line?.id ?? crypto.randomUUID()],
      productId:    [line?.productId ?? ''],
      productSku:   [line?.productSku ?? ''],
      description:  [line?.description ?? '', Validators.required],
      quantity:     [line?.quantity ?? 1, [Validators.required, Validators.min(0.001)]],
      unitPrice:    [line?.unitPrice ?? 0, [Validators.required, Validators.min(0)]],
      discountPct:  [line?.discountPct ?? 0, [Validators.min(0), Validators.max(100)]],
      subtotal:     [line?.subtotal ?? 0],
      vatPct:       [line?.vatPct ?? 15, [Validators.min(0), Validators.max(100)]],
      vatAmount:    [line?.vatAmount ?? 0],
      total:        [line?.total ?? 0],
      warehouseCode:[line?.warehouseCode ?? ''],
      notes:        [line?.notes ?? '']
    });

    // Forward calc: qty / price / discount / vat → total
    ['quantity', 'unitPrice', 'discountPct', 'vatPct'].forEach(field => {
      g.get(field)?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => this.recalcLine(g));
    });

    // Reverse calc: total → unitPrice (emitEvent:false avoids loop)
    g.get('total')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => this.recalcLineFromTotal(g));

    return g;
  }

  private recalcLine(g: FormGroup): void {
    const { subtotal, vatAmount, total } = calcLine(g.value);
    g.patchValue({ subtotal, vatAmount, total }, { emitEvent: false });
  }

  /** Reverse-calc: user edits Total → back-calculate unitPrice, keep qty/discount/vat. */
  private recalcLineFromTotal(g: FormGroup): void {
    const total = parseFloat(g.get('total')?.value)      || 0;
    const qty   = parseFloat(g.get('quantity')?.value)   || 0;
    const disc  = parseFloat(g.get('discountPct')?.value) || 0;
    const vat   = parseFloat(g.get('vatPct')?.value)     || 0;

    if (qty === 0 || disc >= 100) return; // guard division by zero

    // total = subtotal * (1 + vat/100)
    // subtotal = qty * unitPrice * (1 - disc/100)
    // → unitPrice = total / (1 + vat/100) / qty / (1 - disc/100)
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const unitPrice = r2(total / (1 + vat / 100) / qty / (1 - disc / 100));
    const subtotal  = r2(qty * unitPrice * (1 - disc / 100));
    const vatAmount = r2(subtotal * vat / 100);

    g.patchValue({ unitPrice, subtotal, vatAmount }, { emitEvent: false });
  }

  addLine(): void {
    const g = this.buildLineGroup();
    this.linesArray.push(g);
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
    // Focus the search input after Angular renders it
    setTimeout(() => {
      const el = document.querySelector<HTMLInputElement>('.product-drop-fixed input');
      el?.focus();
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
      description: p.name,
      unitPrice:   p.salePrice ?? 0,
      vatPct:      p.taxRate ?? 15
    });
    this.recalcLine(g);
    this.showProductDrop.set(false);
    this.productSearchIdx.set(null);
    this.productSearch.set('');
    setTimeout(() => this.focusLineField(idx, 'quantity'), 30);
  }

  blurProduct(): void {
    setTimeout(() => { this.showProductDrop.set(false); this.productSearchIdx.set(null); }, 180);
  }

  // ─── Save ──────────────────────────────────────────────────────────────────

  async save(emitAfter = false): Promise<void> {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    if (!this.selectedCustomer()) {
      this.notifications.error('Seleccione un cliente'); return;
    }

    this.saving.set(true);
    try {
      const fv = this.form.value;
      const customer = this.selectedCustomer() ?? this.invoice();
      const series   = this.seriesList().find(s => s.code === fv.seriesCode);

      const lines: InvoiceLine[] = this.linesArray.controls.map(c => c.value as InvoiceLine);
      const totals = calcInvoiceTotals(lines, fv.globalDiscountPct ?? 0);

      // Build payment methods from FormArray — ensure amounts sum to total
      const paymentMethods: SriPaymentMethod[] = this.paymentMethodsArray.controls.map(c => ({
        code:     c.get('code')?.value ?? '01',
        name:     this.paymentMethodName(c.get('code')?.value ?? '01'),
        amount:   parseFloat(c.get('amount')?.value) || 0,
        deadline: c.get('deadline')?.value || undefined,
        timeUnit: c.get('timeUnit')?.value || undefined,
      }));

      if (this.isNew()) {
        const c = customer as Person;
        const input = {
          seriesCode:            fv.seriesCode,
          seriesEstablishment:   series?.establishment ?? '001',
          seriesEmissionPoint:   series?.emissionPoint ?? '001',
          fiscalYear:            fv.fiscalYear,
          date:                  Timestamp.fromDate(new Date(fv.date + 'T00:00:00')),
          dueDate:               Timestamp.fromDate(new Date(fv.dueDate + 'T00:00:00')),
          customerId:            c.id,
          customerCode:          c.customerData?.code ?? '',
          customerName:          c.name,
          customerTaxId:         c.taxId,
          customerTaxIdType:     c.taxIdType,
          customerAddress:       c.addresses?.[0]?.address ?? '',
          customerCity:          c.addresses?.[0]?.city ?? '',
          customerProvince:      c.addresses?.[0]?.province ?? '',
          customerEmail:         c.email ?? '',
          warehouseCode:         fv.warehouseCode,
          paymentTermCode:       fv.paymentTermCode,
          currency:              fv.currency ?? 'USD',
          exchangeRate:          fv.exchangeRate ?? 1,
          agentCode:             fv.agentCode || '',
          globalDiscountPct:     fv.globalDiscountPct ?? 0,
          customerReference:     fv.customerReference || '',
          lines,
          status:                emitAfter ? 'issued' as InvoiceStatus : 'draft' as InvoiceStatus,
          isPaid:                false,
          isVoid:                false,
          isCreditNote:          false,
          notes:                 fv.notes ?? '',
          paymentMethods,
          ...totals
        };
        const id = await this.svc.createInvoice(input);
        if (emitAfter) {
          this.notifications.success('Factura emitida correctamente');
        } else {
          this.notifications.success('Borrador guardado');
        }
        this.router.navigate(['/invoices', id, 'edit']);
      } else {
        const id = this.invoiceId()!;
        await this.svc.updateInvoice(id, {
          date:             Timestamp.fromDate(new Date(fv.date + 'T00:00:00')),
          dueDate:          Timestamp.fromDate(new Date(fv.dueDate + 'T00:00:00')),
          warehouseCode:    fv.warehouseCode,
          paymentTermCode:  fv.paymentTermCode,
          agentCode:        fv.agentCode || '',
          globalDiscountPct:fv.globalDiscountPct ?? 0,
          customerReference:fv.customerReference || '',
          lines,
          notes:            fv.notes ?? '',
          paymentMethods,
          ...(emitAfter ? { status: 'issued' as InvoiceStatus } : {}),
          ...totals
        });
        if (emitAfter) {
          const num = this.invoice()?.fullNumber ?? '';
          this.notifications.success(`Factura${num ? ' ' + num : ''} emitida correctamente`);
        } else {
          this.notifications.success('Borrador guardado');
        }
      }
    } catch (err: any) {
      console.error('[InvoiceForm] save error:', err);
      this.notifications.error('Error al guardar: ' + (err?.message ?? err));
    } finally {
      this.saving.set(false);
    }
  }

  // ─── VAT expand toggle (F2.2) ──────────────────────────────────────────────

  toggleVatExpand(idx: number): void {
    this.vatExpandedIdx.set(this.vatExpandedIdx() === idx ? null : idx);
  }

  // ─── Focus helper ──────────────────────────────────────────────────────────

  private focusLineField(idx: number, field: string): void {
    const rows = document.querySelectorAll<HTMLElement>('.lines-table tbody tr');
    const input = rows[idx]?.querySelector<HTMLElement>(`[formcontrolname="${field}"]`);
    input?.focus();
  }

  // ─── SKU inline search ─────────────────────────────────────────────────────

  onSkuInput(idx: number, value: string, inputEl: HTMLInputElement): void {
    if (!this.isEditable()) return;
    this.skuSearch.set(value);
    this.skuHighlight.set(0);

    if (!value) { this.skuDropOpenIdx.set(null); return; }

    // Exact match → select immediately, no dropdown
    const exact = this.products().find(
      p => (p.sku ?? '').toLowerCase() === value.toLowerCase()
    );
    if (exact) {
      this.selectProductBySku(exact, idx);
      return;
    }

    // Calculate position for fixed dropdown
    const rect = inputEl.getBoundingClientRect();
    this.skuDropPos.set({ top: rect.bottom + 2, left: rect.left });
    this.skuDropOpenIdx.set(idx);
  }

  onSkuKeydown(idx: number, event: KeyboardEvent): void {
    if (this.skuDropOpenIdx() !== idx) return;
    const results = this.skuResults();
    const hi = this.skuHighlight();
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.skuHighlight.set(Math.min(hi + 1, results.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.skuHighlight.set(Math.max(hi - 1, 0));
    } else if (event.key === 'Enter' && results.length > 0) {
      event.preventDefault();
      this.selectProductBySku(results[hi], idx);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.skuDropOpenIdx.set(null);
    }
  }

  selectProductBySku(p: Product, idx: number): void {
    const g = this.linesArray.at(idx) as FormGroup;
    g.patchValue({
      productId:   p.id,
      productSku:  p.sku ?? '',
      description: p.name,
      unitPrice:   p.salePrice ?? 0,
      vatPct:      p.taxRate ?? 15
    });
    this.recalcLine(g);
    this.skuDropOpenIdx.set(null);
    this.skuSearch.set('');
    setTimeout(() => this.focusLineField(idx, 'quantity'), 30);
  }

  blurSkuDrop(idx: number): void {
    setTimeout(() => {
      if (this.skuDropOpenIdx() === idx) this.skuDropOpenIdx.set(null);
    }, 180);
  }

  // ─── Customer keyboard navigation ─────────────────────────────────────────

  onCustomerKeydown(event: KeyboardEvent): void {
    if (!this.showCustomerDrop()) return;
    const results = this.customerResults();
    const hi = this.customerHighlightIdx();
    // total items = results + "Crear cliente" row
    const maxIdx = results.length; // 0..results.length-1 = results, results.length = create row
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.customerHighlightIdx.set(Math.min(hi + 1, maxIdx));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.customerHighlightIdx.set(Math.max(hi - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (hi < results.length) {
        this.selectCustomer(results[hi]);
      } else {
        this.openNewCustomerModal();
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.showCustomerDrop.set(false);
    }
  }

  onCustomerInput(value: string): void {
    this.customerSearch.set(value);
    this.customerHighlightIdx.set(0);
    this.showCustomerDrop.set(true);
    if (!value) this.selectedCustomer.set(null);
  }

  // ─── Tab on last discountPct → addLine, focus SKU ─────────────────────────

  onDiscountTabKey(idx: number, event: KeyboardEvent): void {
    if (!this.isEditable()) return;
    if (idx !== this.linesArray.length - 1) return;
    event.preventDefault();
    this.addLine();
    setTimeout(() => this.focusLineField(this.linesArray.length - 1, 'productSku'), 30);
  }

  // ─── Enter on quantity → addLine, focus SKU ────────────────────────────────

  onQuantityEnterKey(idx: number, event: KeyboardEvent): void {
    if (!this.isEditable()) return;
    event.preventDefault();
    if (idx === this.linesArray.length - 1) {
      this.addLine();
    }
    setTimeout(() => this.focusLineField(this.linesArray.length - 1, 'productSku'), 30);
  }

  back(): void {
    this.router.navigate(['/invoices']);
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private toDateInput(d: Date): string {
    return d.toISOString().substring(0, 10);
  }

  private tsToDateInput(ts: any): string {
    if (!ts) return this.toDateInput(new Date());
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return this.toDateInput(d);
  }

  isEditable(): boolean {
    return this.isNew() || this.invoice()?.status === 'draft';
  }

  lineCtrl(idx: number, field: string): AbstractControl {
    return this.linesArray.at(idx).get(field)!;
  }

  // ─── F3.1 — Autosave ───────────────────────────────────────────────────────

  private setupAutoSave(): void {
    if (this.isNew() || this.invoice()?.status !== 'draft') return;

    this.form.valueChanges.pipe(
      debounceTime(30_000),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(async () => {
      if (!this.form.dirty || this.saving() || this.autoSaveStatus() === 'saving') return;
      if (this.form.invalid) return;
      this.autoSaveStatus.set('saving');
      try {
        const fv = this.form.value;
        const lines: InvoiceLine[] = this.linesArray.controls.map(c => c.value as InvoiceLine);
        const totals = calcInvoiceTotals(lines, fv.globalDiscountPct ?? 0);
        await this.svc.updateInvoice(this.invoiceId()!, {
          date:              Timestamp.fromDate(new Date(fv.date + 'T00:00:00')),
          dueDate:           Timestamp.fromDate(new Date(fv.dueDate + 'T00:00:00')),
          warehouseCode:     fv.warehouseCode,
          paymentTermCode:   fv.paymentTermCode,
          agentCode:         fv.agentCode || '',
          globalDiscountPct: fv.globalDiscountPct ?? 0,
          customerReference: fv.customerReference || '',
          lines,
          notes:             fv.notes ?? '',
          ...totals
        });
        this.autoSaveStatus.set('saved');
        this.autoSavedAt.set(new Date());
        this.form.markAsPristine();
        setTimeout(() => this.autoSaveStatus.set('idle'), 4000);
      } catch {
        this.autoSaveStatus.set('error');
        setTimeout(() => this.autoSaveStatus.set('idle'), 4000);
      }
    });
  }

  // ─── F3.3 — Quick customer modal ──────────────────────────────────────────

  private buildNewCustomerForm(): void {
    this.newCustomerForm = this.fb.group({
      name:      ['', Validators.required],
      legalName: ['', Validators.required],
      taxIdType: ['RUC', Validators.required],
      taxId:     ['', [Validators.required, ecuadorTaxIdValidator('taxIdType')]],
      email:     [''],
      phone1:    [''],
    });

    // When taxIdType changes: re-validate taxId
    this.newCustomerForm.get('taxIdType')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.newCustomerForm.get('taxId')?.updateValueAndValidity();
      });

    // When name changes and type is NOT RUC, auto-sync legalName
    this.newCustomerForm.get('name')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe((name: string) => {
        if (this.newCustomerForm.get('taxIdType')?.value !== 'RUC') {
          this.newCustomerForm.patchValue({ legalName: name }, { emitEvent: false });
        }
      });

    // When taxIdType switches away from RUC, copy name → legalName
    this.newCustomerForm.get('taxIdType')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe((type: string) => {
        if (type !== 'RUC') {
          const name = this.newCustomerForm.get('name')?.value ?? '';
          this.newCustomerForm.patchValue({ legalName: name }, { emitEvent: false });
        }
      });
  }

  openNewCustomerModal(): void {
    this.newCustomerForm.reset({ taxIdType: 'RUC' });
    this.showNewCustomerModal.set(true);
  }

  closeNewCustomerModal(): void {
    this.showNewCustomerModal.set(false);
  }

  async saveNewCustomer(): Promise<void> {
    if (this.newCustomerForm.invalid) {
      this.newCustomerForm.markAllAsTouched();
      return;
    }
    this.savingNewCustomer.set(true);
    try {
      const fv = this.newCustomerForm.value;
      const isCompany = fv.taxIdType === 'RUC';
      const resolvedLegalName = isCompany
        ? (fv.legalName?.trim() || fv.name.trim())
        : fv.name.trim();
      const input: PersonCreateInput = {
        roles:        ['customer'],
        taxIdType:    fv.taxIdType,
        taxId:        fv.taxId.trim(),
        isCompany,
        name:         fv.name.trim(),
        legalName:    resolvedLegalName,
        email:        fv.email?.trim() || undefined,
        phone1:       fv.phone1?.trim() || undefined,
        isActive:     true,
        addresses:    [],
        bankAccounts: [],
        customerData: {
          code:            '',
          currency:        'USD',
          paymentTermCode: this.paymentTerms()[0]?.code ?? '',
          vatRegime:       'General',
        }
      };
      const id = await this.personasSvc.createPerson(input);
      this.personasSvc.getPersonas('customer').pipe(take(1)).subscribe({
        next: list => {
          const updated = list.filter(p => p.isActive).sort((a, b) => a.name.localeCompare(b.name, 'es'));
          this.customers.set(updated);
          const newPerson = updated.find(p => p.id === id);
          if (newPerson) this.selectCustomer(newPerson);
        }
      });
      this.notifications.success('Cliente creado y seleccionado');
      this.closeNewCustomerModal();
    } catch (err: any) {
      this.notifications.error('Error al crear cliente: ' + (err?.message ?? err));
    } finally {
      this.savingNewCustomer.set(false);
    }
  }

  // ─── F3.5 — Duplicate invoice ─────────────────────────────────────────────

  async duplicateInvoice(): Promise<void> {
    const inv = this.invoice();
    if (!inv) return;

    this.saving.set(true);
    try {
      const today = this.toDateInput(new Date());
      const lines = inv.lines.map(l => ({ ...l, id: crypto.randomUUID() }));
      const totals = calcInvoiceTotals(lines, inv.globalDiscountPct);

      const input = {
        seriesCode:          inv.seriesCode,
        seriesEstablishment: inv.seriesEstablishment,
        seriesEmissionPoint: inv.seriesEmissionPoint,
        fiscalYear:          new Date().getFullYear().toString(),
        date:                Timestamp.fromDate(new Date(today + 'T00:00:00')),
        dueDate:             Timestamp.fromDate(new Date(today + 'T00:00:00')),
        customerId:          inv.customerId,
        customerCode:        inv.customerCode,
        customerName:        inv.customerName,
        customerTaxId:       inv.customerTaxId,
        customerTaxIdType:   inv.customerTaxIdType,
        customerAddress:     inv.customerAddress ?? '',
        customerCity:        inv.customerCity ?? '',
        customerProvince:    inv.customerProvince ?? '',
        customerReference:   '',
        warehouseCode:       inv.warehouseCode,
        paymentTermCode:     inv.paymentTermCode,
        currency:            inv.currency,
        exchangeRate:        inv.exchangeRate,
        agentCode:           inv.agentCode ?? '',
        globalDiscountPct:   inv.globalDiscountPct,
        lines,
        status:              'draft' as InvoiceStatus,
        isPaid:              false,
        isVoid:              false,
        isCreditNote:        false,
        notes:               '',
        paymentMethods:      inv.paymentMethods,
        ...totals
      };
      const id = await this.svc.createInvoice(input);
      this.notifications.success('Factura duplicada como borrador');
      this.router.navigate(['/invoices', id, 'edit']);
    } catch (err: any) {
      this.notifications.error('Error al duplicar: ' + (err?.message ?? err));
    } finally {
      this.saving.set(false);
    }
  }
}
