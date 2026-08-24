import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil, take, forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import {
  CardModule, ButtonModule, SpinnerModule, FormModule, AlertModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';

import { InvoicesService }    from '../../../invoices/services/invoices.service';
import { DebitNotesService }  from '../../../debit-notes/services/debit-notes.service';
import { PurchasesService }   from '../../../purchases/services/purchases.service';
import { AtsService }         from '../../services/ats.service';
import { TenantService }      from '../../../../core/services/tenant.service';
import { NotificationService } from '../../../../core/services/notification.service';

interface AtsPreview {
  invoicesCount:    number;
  creditNotesCount: number;
  debitNotesCount:  number;
  purchasesCount:   number;
  exportCount:      number;
  voidedCount:      number;
  totalVentas:      number;
  totalCompras:     number;
}

@Component({
  selector: 'app-ats-page',
  standalone: true,
  templateUrl: './ats-page.component.html',
  styleUrl:    './ats-page.component.scss',
  imports: [
    CommonModule, FormsModule,
    CardModule, ButtonModule, SpinnerModule, FormModule, AlertModule, IconModule
  ]
})
export class AtsPageComponent implements OnInit, OnDestroy {
  private invoicesSvc    = inject(InvoicesService);
  private debitNotesSvc  = inject(DebitNotesService);
  private purchasesSvc   = inject(PurchasesService);
  private atsSvc         = inject(AtsService);
  private tenant         = inject(TenantService);
  private notifications  = inject(NotificationService);
  private destroy$       = new Subject<void>();

  readonly currentYear = new Date().getFullYear();
  readonly years       = Array.from({ length: 4 }, (_, i) => this.currentYear - i);
  readonly months      = [
    { value: 1,  label: 'Enero' },      { value: 2,  label: 'Febrero' },
    { value: 3,  label: 'Marzo' },      { value: 4,  label: 'Abril' },
    { value: 5,  label: 'Mayo' },       { value: 6,  label: 'Junio' },
    { value: 7,  label: 'Julio' },      { value: 8,  label: 'Agosto' },
    { value: 9,  label: 'Septiembre' }, { value: 10, label: 'Octubre' },
    { value: 11, label: 'Noviembre' },  { value: 12, label: 'Diciembre' }
  ];

  selectedYear  = signal(this.currentYear);
  selectedMonth = signal(new Date().getMonth() + 1);

  loadingPreview = signal(false);
  preview        = signal<AtsPreview | null>(null);
  downloading    = signal(false);

  selectedMonthLabel = computed(() =>
    this.months.find(m => m.value === this.selectedMonth())?.label ?? ''
  );

  ngOnInit(): void {
    this.calculatePreview();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /** Resumen client-side (conteos/totales) para revisar antes de generar el .zip real. */
  calculatePreview(): void {
    this.loadingPreview.set(true);
    this.preview.set(null);

    const year  = this.selectedYear();
    const month = this.selectedMonth();
    const inMonth = (d: Date) => d.getFullYear() === year && d.getMonth() + 1 === month;

    forkJoin({
      invoices:    this.invoicesSvc.getInvoices({ year: String(year) }).pipe(take(1), catchError(() => of([]))),
      debitNotes:  this.debitNotesSvc.getDebitNotes({ year: String(year) }).pipe(take(1), catchError(() => of([]))),
      purchases:   this.purchasesSvc.getAll().pipe(take(1), catchError(() => of([]))),
    }).pipe(takeUntil(this.destroy$)).subscribe(({ invoices, debitNotes, purchases }) => {
      const invInMonth = invoices.filter(i => inMonth(i.date.toDate()));
      const dnInMonth  = debitNotes.filter(d => inMonth(d.date.toDate()));
      const puInMonth  = purchases.filter(p => inMonth(p.date.toDate()));

      const activeInvoices = invInMonth.filter(i => !i.isVoid);
      const activePurchases = puInMonth.filter(p => p.status !== 'cancelled');

      const voidedInMonth =
        invoices.filter(i => i.isVoid && i.voidedAt && inMonth(i.voidedAt.toDate())).length +
        debitNotes.filter(d => d.isVoid && d.voidedAt && inMonth(d.voidedAt.toDate())).length +
        purchases.filter(p => p.status === 'cancelled' && p.voidedAt && inMonth(p.voidedAt.toDate())).length;

      this.preview.set({
        invoicesCount:    activeInvoices.filter(i => !i.isCreditNote).length,
        creditNotesCount: activeInvoices.filter(i => i.isCreditNote).length,
        debitNotesCount:  dnInMonth.filter(d => !d.isVoid).length,
        purchasesCount:   activePurchases.length,
        exportCount:      activeInvoices.filter(i => !!i.exportData).length,
        voidedCount:      voidedInMonth,
        totalVentas:      activeInvoices.reduce((s, i) => s + i.total, 0),
        totalCompras:     activePurchases.reduce((s, p) => s + p.total, 0),
      });
      this.loadingPreview.set(false);
    });
  }

  async downloadAts(): Promise<void> {
    this.downloading.set(true);
    try {
      await this.atsSvc.downloadAts({
        companyId: this.tenant.companyId,
        year:      this.selectedYear(),
        month:     this.selectedMonth(),
      });
      this.notifications.success('ATS generado correctamente');
    } catch (err: any) {
      this.notifications.error('Error al generar el ATS: ' + (err?.message ?? err));
    } finally {
      this.downloading.set(false);
    }
  }
}
