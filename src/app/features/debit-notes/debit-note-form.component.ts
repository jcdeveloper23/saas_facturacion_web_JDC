import {
  Component, OnInit, OnDestroy, inject, signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { FormBuilder, FormGroup, FormArray, Validators, ReactiveFormsModule } from '@angular/forms';
import { Subject, takeUntil, take, firstValueFrom } from 'rxjs';
import { Timestamp } from '@angular/fire/firestore';
import {
  CardModule, ButtonModule, GridModule, BadgeModule,
  SpinnerModule, FormModule,
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';

import { DebitNotesService }  from './services/debit-notes.service';
import { PersonasService }    from '../personas/services/personas.service';
import { SettingsService }    from '../settings/services/settings.service';
import { NotificationService } from '../../core/services/notification.service';
import {
  DebitNote, DebitNoteStatus, DebitNoteMotivo,
  DEBIT_NOTE_STATUS_LABELS, DEBIT_NOTE_STATUS_COLORS,
  buildDebitNoteFullNumber, calcDebitNoteTotals,
} from './models/debit-note.interface';
import { SRI_STATUS_LABELS, SRI_STATUS_COLORS } from '../invoices/models/invoice.interface';
import { Person, TaxIdType } from '../personas/models/person.interface';
import { DocumentSeries } from '../settings/models/settings.interfaces';
import {
  EmissionPointAccess, EmissionPointAccessService,
  pickDefaultSeries, seriesForDocument, seriesGuardMessage, seriesLabel,
} from '../../core/services/emission-point-access.service';

@Component({
  selector: 'app-debit-note-form',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    CardModule, ButtonModule, GridModule, BadgeModule,
    SpinnerModule, FormModule,
    IconModule,
  ],
  styles: [`
    .inv-label { font-size:.72rem; font-weight:500; color:var(--cui-secondary-color); }
    .inv-ctrl  { font-size:.82rem !important; padding:.28rem .45rem !important; }
    .section-title {
      font-size:.68rem; font-weight:600; text-transform:uppercase; letter-spacing:.07em;
      color:var(--cui-tertiary-color); margin:0 0 .6rem;
    }
    .cust-chip {
      display:flex;align-items:center;gap:.4rem;padding:.25rem .5rem;
      border:1px solid var(--cui-border-color);border-radius:5px;
      background:var(--cui-tertiary-bg);font-size:.82rem;flex:1;
    }
  `],
  templateUrl: './debit-note-form.component.html',
})
export class DebitNoteFormComponent implements OnInit, OnDestroy {
  private svc          = inject(DebitNotesService);
  private personasSvc  = inject(PersonasService);
  private settingsSvc  = inject(SettingsService);
  private emissionPointAccess = inject(EmissionPointAccessService);
  /** Puntos de emisión del usuario: filtran las series que se ofrecen. */
  private access: EmissionPointAccess = { allowed: [], defaultPoint: null, unrestricted: true };
  readonly seriesLabel = seriesLabel;
  /** Todas las series, para no perder la de un comprobante abierto que ya no está en la lista. */
  private allSeries: DocumentSeries[] = [];

  /** Opciones del selector: las del usuario, más la del comprobante abierto si ya no está. */
  seriesOptions(): DocumentSeries[] {
    const code = this.form.get('seriesCode')?.value;
    const list = this.seriesList();
    if (!code || list.some(s => s.code === code)) return list;
    const own = this.allSeries.find(s => s.code === code && s.documentType === 'debitNote')
             ?? this.allSeries.find(s => s.code === code);
    return own ? [...list, own] : list;
  }
  private notifications = inject(NotificationService);
  protected router     = inject(Router);
  private route        = inject(ActivatedRoute);
  private fb           = inject(FormBuilder);
  private destroy$     = new Subject<void>();

  // ── State ───────────────────────────────────────────────────────────────────
  debitNoteId   = signal<string | null>(null);
  loading       = signal(true);
  saving        = signal(false);
  isNew         = signal(true);
  debitNote     = signal<DebitNote | null>(null);

  // ── Reference data ───────────────────────────────────────────────────────────
  seriesList    = signal<DocumentSeries[]>([]);
  customers     = signal<Person[]>([]);

  // ── Customer search ──────────────────────────────────────────────────────────
  customerSearch    = signal('');
  showCustomerDrop  = signal(false);
  selectedCustomer  = signal<Person | null>(null);

  customerResults = computed(() => {
    const term = this.customerSearch().toLowerCase().trim();
    if (!term || term.length < 2) return [];
    return this.customers().filter(c =>
      c.name.toLowerCase().includes(term) || c.taxId.includes(term)
    ).slice(0, 8);
  });

  // ── Computed ────────────────────────────────────────────────────────────────
  readonly vatOptions    = [0, 5, 8, 15];
  readonly STATUS_LABELS = DEBIT_NOTE_STATUS_LABELS;
  readonly STATUS_COLORS = DEBIT_NOTE_STATUS_COLORS;
  readonly SRI_LABELS    = SRI_STATUS_LABELS;
  readonly SRI_COLORS    = SRI_STATUS_COLORS;

  form!: FormGroup;
  get motivosArray(): FormArray { return this.form.get('motivos') as FormArray; }

  currentStatus = computed(() => (this.debitNote()?.status ?? 'draft') as DebitNoteStatus);
  pageTitle     = computed(() =>
    this.isNew() ? 'Nueva Nota de Débito' : `Nota de Débito ${this.debitNote()?.fullNumber ?? ''}`
  );
  isEditable    = computed(() => this.currentStatus() === 'draft');

  totals = computed(() => {
    const motivos = (this.motivosArray?.controls ?? []).map(c => ({
      id:    c.get('id')?.value    ?? '',
      razon: c.get('razon')?.value ?? '',
      valor: parseFloat(c.get('valor')?.value) || 0,
    }));
    const vatPct = parseFloat(this.form?.get('vatPct')?.value) || 15;
    return calcDebitNoteTotals(motivos, vatPct);
  });

  // ─── Lifecycle ───────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.buildForm();
    this.loadReferenceData();

    const id = this.route.snapshot.paramMap.get('id');
    if (id && id !== 'new') {
      this.debitNoteId.set(id);
      this.isNew.set(false);
      this.loadDebitNote(id);
    } else {
      this.loading.set(false);
      this.addMotivo();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ─── Form builder ─────────────────────────────────────────────────────────

  private buildMotivoGroup = (m?: Partial<DebitNoteMotivo>): FormGroup => {
    return this.fb.group({
      id:    [m?.id    ?? crypto.randomUUID()],
      razon: [m?.razon ?? '', Validators.required],
      valor: [m?.valor ?? 0,  [Validators.required, Validators.min(0)]],
    });
  };

  private buildForm(): void {
    const today = this.toDateInput(new Date());
    this.form = this.fb.group({
      seriesCode:            ['A',   Validators.required],
      fiscalYear:            [String(new Date().getFullYear()), Validators.required],
      date:                  [today, Validators.required],
      customerTaxIdType:     ['04'],
      originalInvoiceNumber: ['',   Validators.required],
      originalInvoiceDate:   [today, Validators.required],
      originalInvoiceAuth:   [''],
      vatPct:                [15,   Validators.required],
      notes:                 [''],
      motivos:               this.fb.array([]),
    });
  }

  private loadReferenceData(): void {
    // Sin series de nota de débito, la primera activa de otro tipo (como antes).
    // Solo las series de los puntos de emisión del usuario; un comprobante nuevo
    // abre con la de su punto por defecto.
    Promise.all([
      firstValueFrom(this.settingsSvc.getDocumentSeries()),
      this.emissionPointAccess.load(),
    ]).then(([list, access]) => {
      this.access = access;
      this.allSeries = list;
      const series = seriesForDocument(list, 'debitNote', access, true);
      this.seriesList.set(series);
      const current = this.form.get('seriesCode')?.value;
      if (this.isNew() && !series.some(s => s.code === current)) {
        const pick = pickDefaultSeries(series, access);
        if (pick) this.form.patchValue({ seriesCode: pick.code });
      }
    }).catch(err => console.error('Error al cargar las series:', err));
    this.personasSvc.getPersonas('customer').pipe(take(1)).subscribe({
      next: list => this.customers.set(list.filter(p => p.isActive))
    });
  }

  private loadDebitNote(id: string): void {
    this.svc.getDebitNote(id).pipe(take(1)).subscribe({
      next: dn => {
        if (!dn) { this.router.navigate(['/debit-notes']); return; }
        this.debitNote.set(dn);
        this.patchForm(dn);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  private patchForm(dn: DebitNote): void {
    this.form.patchValue({
      seriesCode:            dn.seriesCode,
      fiscalYear:            dn.fiscalYear,
      date:                  this.tsToDateInput(dn.date),
      customerTaxIdType:     dn.customerTaxIdType,
      originalInvoiceNumber: dn.originalInvoiceNumber,
      originalInvoiceDate:   this.tsToDateInput(dn.originalInvoiceDate),
      originalInvoiceAuth:   dn.originalInvoiceAuth ?? '',
      vatPct:                dn.vatPct,
      notes:                 dn.notes ?? '',
    });

    this.customerSearch.set(dn.customerName);
    const found = this.customers().find(c => c.id === dn.customerId);
    if (found) {
      this.selectedCustomer.set(found);
    } else {
      this.selectedCustomer.set({
        id: dn.customerId ?? '', roles: ['customer'],
        taxId: dn.customerTaxId, taxIdType: dn.customerTaxIdType as TaxIdType,
        isCompany: dn.customerTaxIdType === 'RUC', name: dn.customerName,
        legalName: dn.customerName, addresses: [], bankAccounts: [],
        isActive: true,
      } as unknown as Person);
    }

    const ma = this.motivosArray;
    while (ma.length) ma.removeAt(0);
    for (const m of dn.motivos) ma.push(this.buildMotivoGroup(m));

    if (dn.status !== 'draft') this.form.disable();
  }

  // ─── Customer selection ──────────────────────────────────────────────────

  selectCustomer(c: Person): void {
    this.selectedCustomer.set(c);
    this.customerSearch.set(c.name);
    this.showCustomerDrop.set(false);
    this.form.patchValue({
      customerTaxIdType: c.taxIdType === 'RUC' ? '04' : '05'
    });
  }

  blurCustomer(): void {
    setTimeout(() => this.showCustomerDrop.set(false), 180);
  }

  clearCustomer(): void {
    this.selectedCustomer.set(null);
    this.customerSearch.set('');
  }

  // ─── Motivos ─────────────────────────────────────────────────────────────

  addMotivo(): void {
    this.motivosArray.push(this.buildMotivoGroup());
  }

  removeMotivo(idx: number): void {
    if (this.motivosArray.length > 1) this.motivosArray.removeAt(idx);
  }

  // ─── Save ─────────────────────────────────────────────────────────────────

  async save(emitAfter = false): Promise<void> {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    if (!this.selectedCustomer()) {
      this.notifications.error('Seleccione un cliente'); return;
    }
    // En uno nuevo solo valen las series del usuario (seriesList, no seriesOptions).
    const seriesProblem = seriesGuardMessage(
      this.seriesList(), this.form.get('seriesCode')?.value, this.access, this.isNew());
    if (seriesProblem) { this.notifications.error(seriesProblem); return; }

    this.saving.set(true);
    try {
      const fv       = this.form.getRawValue();
      const customer = this.selectedCustomer()!;
      const series   = this.seriesOptions().find(s => s.code === fv.seriesCode);

      const motivos: DebitNoteMotivo[] = this.motivosArray.controls.map(c => ({
        id:    c.get('id')?.value    ?? crypto.randomUUID(),
        razon: c.get('razon')?.value ?? '',
        valor: parseFloat(c.get('valor')?.value) || 0,
      }));

      const vatPct = parseFloat(fv.vatPct) || 15;
      const t      = calcDebitNoteTotals(motivos, vatPct);

      const payload: any = {
        seriesCode:            fv.seriesCode,
        seriesEstablishment:   series?.establishment ?? '001',
        seriesEmissionPoint:   series?.emissionPoint ?? '001',
        fiscalYear:            fv.fiscalYear,
        date:                  Timestamp.fromDate(new Date(fv.date + 'T00:00:00')),
        customerId:            customer.id,
        customerName:          customer.name,
        customerTaxId:         customer.taxId,
        customerTaxIdType:     fv.customerTaxIdType,
        customerEmail:         (customer as any).email ?? '',
        originalInvoiceNumber: fv.originalInvoiceNumber,
        originalInvoiceDate:   Timestamp.fromDate(new Date(fv.originalInvoiceDate + 'T00:00:00')),
        originalInvoiceAuth:   fv.originalInvoiceAuth || '',
        motivos,
        vatPct,
        ...t,
        status:  emitAfter ? 'issued' as DebitNoteStatus : 'draft' as DebitNoteStatus,
        isVoid:  false,
        notes:   fv.notes ?? '',
      };

      if (this.isNew()) {
        const id = await this.svc.createDebitNote(payload);
        this.notifications.success(emitAfter ? 'Nota de débito emitida' : 'Borrador guardado');
        this.router.navigate(['/debit-notes', id, 'edit']);
      } else {
        await this.svc.updateDebitNote(this.debitNoteId()!, {
          ...payload,
          ...(emitAfter ? { status: 'issued' as DebitNoteStatus } : {}),
        });
        this.notifications.success(emitAfter ? 'Nota de débito emitida' : 'Borrador guardado');
      }
    } catch (err: any) {
      this.notifications.error('Error al guardar: ' + (err?.message ?? err));
    } finally {
      this.saving.set(false);
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private toDateInput(d: Date): string {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  private tsToDateInput(ts: Timestamp): string {
    return this.toDateInput(ts.toDate());
  }
}
