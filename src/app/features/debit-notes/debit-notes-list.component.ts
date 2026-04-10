import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import {
  CardModule, ButtonModule, GridModule, BadgeModule, SpinnerModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';
import { Functions, httpsCallable } from '@angular/fire/functions';

import { DebitNotesService } from './services/debit-notes.service';
import { TenantService }     from '../../core/services/tenant.service';
import { NotificationService } from '../../core/services/notification.service';
import {
  DebitNote, DebitNoteStatus,
  DEBIT_NOTE_STATUS_LABELS, DEBIT_NOTE_STATUS_COLORS
} from './models/debit-note.interface';
import { SRI_STATUS_LABELS, SRI_STATUS_COLORS } from '../invoices/models/invoice.interface';

@Component({
  selector: 'app-debit-notes-list',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    CardModule, ButtonModule, GridModule, BadgeModule, SpinnerModule,
    IconModule,
  ],
  template: `
<c-card>
  <c-card-header class="d-flex align-items-center justify-content-between py-2">
    <span class="fw-semibold">Notas de Débito</span>
    <button cButton color="primary" size="sm" (click)="router.navigate(['/debit-notes/new'])">
      <svg cIcon name="cilPlus" class="me-1"></svg> Nueva Nota de Débito
    </button>
  </c-card-header>

  <!-- Filters -->
  <div class="px-3 pt-2 pb-1 d-flex gap-2 flex-wrap align-items-center border-bottom">
    <select class="form-select form-select-sm" style="width:110px"
            [(ngModel)]="yearFilter" (ngModelChange)="applyFilters()">
      @for (y of years; track y) { <option [value]="y">{{ y }}</option> }
    </select>
    <select class="form-select form-select-sm" style="width:140px"
            [(ngModel)]="statusFilter" (ngModelChange)="applyFilters()">
      <option value="">Todos los estados</option>
      <option value="draft">Borrador</option>
      <option value="issued">Emitida</option>
      <option value="void">Anulada</option>
    </select>
    <input class="form-control form-control-sm" style="width:200px"
           placeholder="Buscar cliente o número..."
           [(ngModel)]="searchTerm">
    <span class="ms-auto text-secondary" style="font-size:.75rem">
      {{ filtered().length }} nota(s)
    </span>
  </div>

  <c-card-body class="p-0">
    @if (loading()) {
      <div class="text-center py-4">
        <c-spinner color="primary" size="sm"></c-spinner>
      </div>
    } @else if (filtered().length === 0) {
      <div class="text-center py-5 text-secondary">
        <p class="mb-1">No hay notas de débito</p>
        <button cButton color="primary" variant="outline" size="sm"
                (click)="router.navigate(['/debit-notes/new'])">
          Crear primera nota
        </button>
      </div>
    } @else {
      <div class="table-responsive">
        <table class="table table-hover table-sm mb-0" style="font-size:.82rem">
          <thead class="table-light">
            <tr>
              <th>Número</th>
              <th>Fecha</th>
              <th>Cliente</th>
              <th>Fact. Original</th>
              <th class="text-end">Sin IVA</th>
              <th class="text-end">Total</th>
              <th class="text-center">Estado</th>
              <th class="text-center">SRI</th>
              <th class="text-center">Acciones</th>
            </tr>
          </thead>
          <tbody>
            @for (dn of filtered(); track dn.id) {
              <tr>
                <td class="fw-semibold">{{ dn.fullNumber }}</td>
                <td class="text-nowrap">{{ dn.date.toDate() | date:'dd/MM/yyyy' }}</td>
                <td>{{ dn.customerName }}</td>
                <td>{{ dn.originalInvoiceNumber }}</td>
                <td class="text-end">$ {{ dn.totalSinImpuestos | number:'1.2-2' }}</td>
                <td class="text-end fw-semibold">$ {{ dn.total | number:'1.2-2' }}</td>
                <td class="text-center">
                  <c-badge [color]="STATUS_COLORS[dn.status]">
                    {{ STATUS_LABELS[dn.status] }}
                  </c-badge>
                </td>
                <td class="text-center">
                  @if (dn.sriStatus) {
                    <c-badge [color]="SRI_COLORS[dn.sriStatus]" style="font-size:.65rem">
                      {{ SRI_LABELS[dn.sriStatus] }}
                    </c-badge>
                  } @else {
                    <span class="text-secondary">—</span>
                  }
                </td>
                <td class="text-center text-nowrap">
                  @if (dn.status === 'draft') {
                    <button cButton color="secondary" variant="outline" size="sm"
                            title="Editar"
                            (click)="router.navigate(['/debit-notes', dn.id, 'edit'])">
                      <svg cIcon name="cilPencil"></svg>
                    </button>
                    <button cButton color="danger" variant="outline" size="sm"
                            class="ms-1" title="Eliminar"
                            (click)="deleteDebitNote(dn)">
                      <svg cIcon name="cilTrash"></svg>
                    </button>
                  } @else {
                    <button cButton color="secondary" variant="outline" size="sm"
                            title="Ver"
                            (click)="router.navigate(['/debit-notes', dn.id, 'edit'])">
                      <svg cIcon name="cilSearch"></svg>
                    </button>
                  }
                  @if (dn.sriStatus === 'rejected') {
                    <button cButton color="warning" variant="outline" size="sm"
                            class="ms-1" title="Reenviar a SRI"
                            [disabled]="reenviarLoading()"
                            (click)="reenviarSri(dn)">
                      <svg cIcon name="cilReload"></svg>
                    </button>
                  }
                  @if (dn.xmlUrl) {
                    <button cButton color="info" variant="outline" size="sm"
                            class="ms-1" title="Descargar XML"
                            (click)="window.open(dn.xmlUrl, '_blank')">
                      <svg cIcon name="cilCloudDownload"></svg>
                    </button>
                  }
                  @if (dn.sriStatus === 'authorized' && !dn.pdfUrl) {
                    <button cButton color="success" variant="outline" size="sm"
                            class="ms-1" title="Generar PDF/RIDE"
                            [disabled]="pdfLoading() === dn.id"
                            (click)="generarPdf(dn)">
                      @if (pdfLoading() === dn.id) { <c-spinner size="sm"></c-spinner> }
                      @else { <svg cIcon name="cilFile"></svg> }
                    </button>
                  }
                  @if (dn.pdfUrl) {
                    <button cButton color="success" variant="outline" size="sm"
                            class="ms-1" title="Descargar PDF/RIDE"
                            (click)="window.open(dn.pdfUrl, '_blank')">
                      <svg cIcon name="cilFile"></svg>
                    </button>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  </c-card-body>
</c-card>
  `,
})
export class DebitNotesListComponent implements OnInit, OnDestroy {
  readonly router       = inject(Router);
  private svc           = inject(DebitNotesService);
  private tenant        = inject(TenantService);
  private notifications = inject(NotificationService);
  private functions     = inject(Functions);
  private destroy$      = new Subject<void>();

  readonly window = window;

  readonly STATUS_LABELS = DEBIT_NOTE_STATUS_LABELS;
  readonly STATUS_COLORS = DEBIT_NOTE_STATUS_COLORS;
  readonly SRI_LABELS    = SRI_STATUS_LABELS;
  readonly SRI_COLORS    = SRI_STATUS_COLORS;

  loading         = signal(true);
  reenviarLoading = signal(false);
  pdfLoading      = signal<string | null>(null);
  all             = signal<DebitNote[]>([]);
  yearFilter      = String(new Date().getFullYear());
  statusFilter    = '';
  searchTerm      = '';

  years = Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - i));

  filtered = computed(() => {
    const term = this.searchTerm.toLowerCase().trim();
    if (!term) return this.all();
    return this.all().filter(dn =>
      dn.customerName.toLowerCase().includes(term) ||
      dn.customerTaxId.includes(term) ||
      dn.fullNumber.includes(term) ||
      dn.originalInvoiceNumber.includes(term)
    );
  });

  ngOnInit(): void {
    this.applyFilters();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  applyFilters(): void {
    this.loading.set(true);
    this.destroy$.next();
    this.svc.getDebitNotes({
      year:   this.yearFilter  || undefined,
      status: (this.statusFilter as DebitNoteStatus) || undefined,
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next:  list => { this.all.set(list); this.loading.set(false); },
      error: ()   => this.loading.set(false),
    });
  }

  async deleteDebitNote(dn: DebitNote): Promise<void> {
    if (!confirm(`¿Eliminar nota de débito ${dn.fullNumber}?`)) return;
    try {
      await this.svc.deleteDebitNote(dn.id);
      this.notifications.success('Nota de débito eliminada');
    } catch (err: any) {
      this.notifications.error('Error al eliminar: ' + (err?.message ?? err));
    }
  }

  async generarPdf(dn: DebitNote): Promise<void> {
    this.pdfLoading.set(dn.id);
    try {
      const fn = httpsCallable(this.functions, 'generateDebitNotePdf');
      const res: any = await fn({ debitNoteId: dn.id, companyId: this.tenant.companyId });
      if (res.data?.pdfUrl) window.open(res.data.pdfUrl, '_blank');
      this.notifications.success('PDF generado');
    } catch (err: any) {
      this.notifications.error('Error al generar PDF: ' + (err?.message ?? err));
    } finally {
      this.pdfLoading.set(null);
    }
  }

  async reenviarSri(dn: DebitNote): Promise<void> {
    this.reenviarLoading.set(true);
    try {
      const fn = httpsCallable(this.functions, 'sendToSri');
      await fn({ documentId: dn.id, documentType: 'debitNote', companyId: this.tenant.companyId });
      this.notifications.success('Nota de débito reenviada al SRI');
    } catch (err: any) {
      this.notifications.error('Error al reenviar: ' + (err?.message ?? err));
    } finally {
      this.reenviarLoading.set(false);
    }
  }
}
