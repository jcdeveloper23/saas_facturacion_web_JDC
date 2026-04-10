import {
  Component, OnInit, OnDestroy, inject, signal, computed
} from '@angular/core';
import { CommonModule, SlicePipe } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { FormBuilder, FormGroup, FormArray, Validators, ReactiveFormsModule } from '@angular/forms';
import { Subject, takeUntil, take } from 'rxjs';
import { Timestamp } from '@angular/fire/firestore';
import {
  CardModule, ButtonModule, GridModule, BadgeModule,
  SpinnerModule, FormModule,
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';

import { RetentionsService } from './services/retentions.service';
import { PersonasService }   from '../personas/services/personas.service';
import { SettingsService }   from '../settings/services/settings.service';
import { NotificationService } from '../../core/services/notification.service';
import {
  Retention, RetentionStatus, RetentionTax,
  RETENTION_STATUS_LABELS, RETENTION_STATUS_COLORS,
  ALL_RETENTION_CODES, SUPPORT_DOC_TYPES,
  buildRetentionFullNumber, calcRetentionTax,
} from './models/retention.interface';
import { SRI_STATUS_LABELS as SriLbls, SRI_STATUS_COLORS as SriClrs } from '../invoices/models/invoice.interface';
import { Person } from '../personas/models/person.interface';
import { DocumentSeries } from '../settings/models/settings.interfaces';

@Component({
  selector: 'app-retention-form',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    CardModule, ButtonModule, GridModule, BadgeModule,
    SpinnerModule, FormModule,
    IconModule, SlicePipe,
  ],
  styles: [`
    .inv-label { font-size:.72rem; font-weight:500; color:var(--cui-secondary-color); }
    .inv-ctrl  { font-size:.82rem !important; padding:.28rem .45rem !important; }
    .section-title {
      font-size:.68rem; font-weight:600; text-transform:uppercase; letter-spacing:.07em;
      color:var(--cui-tertiary-color); margin:0 0 .6rem;
    }
    .sup-chip {
      display:flex; align-items:center; gap:.4rem; padding:.25rem .5rem;
      border:1px solid var(--cui-border-color); border-radius:5px;
      background:var(--cui-tertiary-bg); font-size:.82rem;
    }
  `],
  templateUrl: './retention-form.component.html',
})
export class RetentionFormComponent implements OnInit, OnDestroy {
  private svc          = inject(RetentionsService);
  private personasSvc  = inject(PersonasService);
  private settingsSvc  = inject(SettingsService);
  private notifications = inject(NotificationService);
  protected router     = inject(Router);
  private route        = inject(ActivatedRoute);
  private fb           = inject(FormBuilder);
  private destroy$     = new Subject<void>();

  // ── State ───────────────────────────────────────────────────────────────────
  retentionId   = signal<string | null>(null);
  loading       = signal(true);
  saving        = signal(false);
  isNew         = signal(true);
  retention     = signal<Retention | null>(null);

  // ── Reference data ───────────────────────────────────────────────────────────
  seriesList    = signal<DocumentSeries[]>([]);
  suppliers     = signal<Person[]>([]);

  // ── Supplier search ──────────────────────────────────────────────────────────
  supplierSearch     = signal('');
  showSupplierDrop   = signal(false);
  selectedSupplier   = signal<Person | null>(null);

  supplierResults = computed(() => {
    const term = this.supplierSearch().toLowerCase().trim();
    if (!term || term.length < 2) return [];
    return this.suppliers().filter(s =>
      s.name.toLowerCase().includes(term) || s.taxId.includes(term)
    ).slice(0, 8);
  });

  // ── Lookup tables ────────────────────────────────────────────────────────────
  readonly allCodes      = ALL_RETENTION_CODES;
  readonly supportDocTypes = SUPPORT_DOC_TYPES;
  readonly STATUS_LABELS = RETENTION_STATUS_LABELS;
  readonly STATUS_COLORS = RETENTION_STATUS_COLORS;
  readonly SRI_LABELS    = SriLbls;
  readonly SRI_COLORS    = SriClrs;

  // ── Form ─────────────────────────────────────────────────────────────────────
  form!: FormGroup;

  get taxesArray(): FormArray { return this.form.get('taxes') as FormArray; }

  currentStatus = computed(() =>
    (this.retention()?.status ?? 'draft') as RetentionStatus
  );
  pageTitle = computed(() =>
    this.isNew() ? 'Nueva Retención' : `Retención ${this.retention()?.fullNumber ?? ''}`
  );
  isEditable = computed(() => this.currentStatus() === 'draft');
  totalRetained = computed(() =>
    (this.taxesArray?.controls ?? []).reduce((s, c) => s + (parseFloat(c.get('retainedAmount')?.value) || 0), 0)
  );

  // ─── Lifecycle ───────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.buildForm();
    this.loadReferenceData();

    const id = this.route.snapshot.paramMap.get('id');
    if (id && id !== 'new') {
      this.retentionId.set(id);
      this.isNew.set(false);
      this.loadRetention(id);
    } else {
      this.loading.set(false);
      this.addTax();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ─── Form builder ─────────────────────────────────────────────────────────

  private buildTaxGroup = (tax?: Partial<RetentionTax>): FormGroup => {
    return this.fb.group({
      id:             [tax?.id ?? crypto.randomUUID()],
      taxCode:        [tax?.taxCode ?? '1',   Validators.required],
      taxCodeName:    [tax?.taxCodeName ?? 'IR'],
      pctCode:        [tax?.pctCode ?? '303', Validators.required],
      pctName:        [tax?.pctName ?? ''],
      rate:           [tax?.rate ?? 10,       Validators.required],
      taxableBase:    [tax?.taxableBase ?? 0,  [Validators.required, Validators.min(0)]],
      retainedAmount: [{ value: tax?.retainedAmount ?? 0, disabled: true }],
    });
  };

  private buildForm(): void {
    const today = this.toDateInput(new Date());
    const mm    = String(new Date().getMonth() + 1).padStart(2, '0');
    const yyyy  = new Date().getFullYear();

    this.form = this.fb.group({
      seriesCode:       ['A',   Validators.required],
      fiscalYear:       [String(yyyy), Validators.required],
      date:             [today, Validators.required],
      periodoFiscal:    [`${mm}/${yyyy}`, Validators.required],
      // supplier fields (filled from selectedSupplier)
      supplierTaxIdType: ['04'],
      // support doc
      supportDocType:   ['01', Validators.required],
      supportDocNumber: ['',   Validators.required],
      supportDocDate:   [today, Validators.required],
      supportDocAuth:   [''],
      supportDocTotal:  [0, [Validators.required, Validators.min(0)]],
      notes:            [''],
      taxes: this.fb.array([]),
    });
  }

  private loadReferenceData(): void {
    this.settingsSvc.getDocumentSeries().pipe(take(1)).subscribe({
      next: list => {
        const retSeries = list.filter(s => s.documentType === 'retention' && s.isActive);
        // Fallback to invoice series if no retention series configured
        const series = retSeries.length ? retSeries : list.filter(s => s.isActive).slice(0, 1);
        this.seriesList.set(series);
        if (series.length && !this.form.get('seriesCode')?.value) {
          this.form.patchValue({ seriesCode: series[0].code });
        }
      }
    });
    // Load suppliers (persona role 'supplier' or 'proveedor')
    this.personasSvc.getPersonas('supplier').pipe(take(1)).subscribe({
      next: list => this.suppliers.set(list.filter(p => p.isActive))
    });
  }

  private loadRetention(id: string): void {
    this.svc.getRetention(id).pipe(take(1)).subscribe({
      next: r => {
        if (!r) { this.router.navigate(['/retentions']); return; }
        this.retention.set(r);
        this.patchForm(r);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  private patchForm(r: Retention): void {
    this.form.patchValue({
      seriesCode:       r.seriesCode,
      fiscalYear:       r.fiscalYear,
      date:             this.tsToDateInput(r.date),
      periodoFiscal:    r.periodoFiscal,
      supplierTaxIdType: r.supplierTaxIdType,
      supportDocType:   r.supportDocType,
      supportDocNumber: r.supportDocNumber,
      supportDocDate:   this.tsToDateInput(r.supportDocDate),
      supportDocAuth:   r.supportDocAuth ?? '',
      supportDocTotal:  r.supportDocTotal,
      notes:            r.notes ?? '',
    });

    this.supplierSearch.set(r.supplierName);
    const found = this.suppliers().find(s => s.id === r.supplierId);
    if (found) {
      this.selectedSupplier.set(found);
    } else {
      this.selectedSupplier.set({
        id: r.supplierId ?? '', roles: ['supplier'],
        taxId: r.supplierTaxId, taxIdType: r.supplierTaxIdType as any,
        isCompany: r.supplierTaxIdType === 'RUC', name: r.supplierName,
        legalName: r.supplierName, addresses: [], bankAccounts: [],
        isActive: true,
      } as unknown as Person);
    }

    const ta = this.taxesArray;
    while (ta.length) ta.removeAt(0);
    for (const t of r.taxes) {
      const g = this.buildTaxGroup(t);
      g.get('retainedAmount')?.setValue(t.retainedAmount);
      ta.push(g);
    }

    if (r.status !== 'draft') this.form.disable();
  }

  // ─── Supplier selection ──────────────────────────────────────────────────

  selectSupplier(s: Person): void {
    this.selectedSupplier.set(s);
    this.supplierSearch.set(s.name);
    this.showSupplierDrop.set(false);
    // Default taxIdType based on supplier
    this.form.patchValue({ supplierTaxIdType: s.taxIdType === 'RUC' ? '04' : '05' });
  }

  blurSupplier(): void {
    setTimeout(() => this.showSupplierDrop.set(false), 180);
  }

  clearSupplier(): void {
    this.selectedSupplier.set(null);
    this.supplierSearch.set('');
  }

  // ─── Tax lines ────────────────────────────────────────────────────────────

  addTax(): void {
    this.taxesArray.push(this.buildTaxGroup());
  }

  removeTax(idx: number): void {
    if (this.taxesArray.length > 1) this.taxesArray.removeAt(idx);
  }

  onPctCodeChange(idx: number): void {
    const g       = this.taxesArray.at(idx) as FormGroup;
    const pctCode = g.get('pctCode')?.value;
    const code    = this.allCodes.find(c => c.pctCode === pctCode);
    if (code) {
      g.patchValue({
        taxCode:     code.taxCode,
        taxCodeName: code.taxCodeName,
        pctName:     code.pctName,
        rate:        code.rate,
      }, { emitEvent: false });
      this.recalcTax(idx);
    }
  }

  recalcTax(idx: number): void {
    const g    = this.taxesArray.at(idx) as FormGroup;
    const base = parseFloat(g.get('taxableBase')?.value) || 0;
    const rate = parseFloat(g.get('rate')?.value)        || 0;
    const ret  = Math.round(base * rate) / 100;
    g.get('retainedAmount')?.setValue(ret.toFixed(2));
  }

  // ─── Save ─────────────────────────────────────────────────────────────────

  async save(emitAfter = false): Promise<void> {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    if (!this.selectedSupplier()) {
      this.notifications.error('Seleccione un proveedor'); return;
    }

    this.saving.set(true);
    try {
      const fv       = this.form.getRawValue();
      const supplier = this.selectedSupplier()!;
      const series   = this.seriesList().find(s => s.code === fv.seriesCode);

      const taxes: RetentionTax[] = this.taxesArray.controls.map(c => ({
        id:             c.get('id')?.value            ?? crypto.randomUUID(),
        taxCode:        c.get('taxCode')?.value        ?? '1',
        taxCodeName:    c.get('taxCodeName')?.value    ?? 'IR',
        pctCode:        c.get('pctCode')?.value        ?? '303',
        pctName:        c.get('pctName')?.value        ?? '',
        rate:           parseFloat(c.get('rate')?.value) || 0,
        taxableBase:    parseFloat(c.get('taxableBase')?.value) || 0,
        retainedAmount: parseFloat(c.get('retainedAmount')?.value) || 0,
      }));

      const totalRetained = Math.round(taxes.reduce((s, t) => s + t.retainedAmount, 0) * 100) / 100;

      const payload: any = {
        seriesCode:          fv.seriesCode,
        seriesEstablishment: series?.establishment ?? '001',
        seriesEmissionPoint: series?.emissionPoint ?? '001',
        fiscalYear:          fv.fiscalYear,
        date:                Timestamp.fromDate(new Date(fv.date + 'T00:00:00')),
        periodoFiscal:       fv.periodoFiscal,
        supplierId:          supplier.id,
        supplierName:        supplier.name,
        supplierTaxId:       supplier.taxId,
        supplierTaxIdType:   fv.supplierTaxIdType,
        supportDocType:      fv.supportDocType,
        supportDocNumber:    fv.supportDocNumber,
        supportDocDate:      Timestamp.fromDate(new Date(fv.supportDocDate + 'T00:00:00')),
        supportDocAuth:      fv.supportDocAuth || '',
        supportDocTotal:     parseFloat(fv.supportDocTotal) || 0,
        taxes,
        totalRetained,
        status:              emitAfter ? 'issued' as RetentionStatus : 'draft' as RetentionStatus,
        isVoid:              false,
        notes:               fv.notes ?? '',
      };

      if (this.isNew()) {
        const id = await this.svc.createRetention(payload);
        this.notifications.success(emitAfter ? 'Retención emitida' : 'Borrador guardado');
        this.router.navigate(['/retentions', id, 'edit']);
      } else {
        await this.svc.updateRetention(this.retentionId()!, {
          ...payload,
          ...(emitAfter ? { status: 'issued' as RetentionStatus } : {}),
        });
        this.notifications.success(emitAfter ? 'Retención emitida' : 'Borrador guardado');
      }
    } catch (err: any) {
      this.notifications.error('Error al guardar: ' + (err?.message ?? err));
    } finally {
      this.saving.set(false);
    }
  }

  // ─── Date helpers ─────────────────────────────────────────────────────────

  private toDateInput(d: Date): string {
    return d.toISOString().slice(0, 10);
  }

  private tsToDateInput(ts: Timestamp): string {
    return this.toDateInput(ts.toDate());
  }
}
