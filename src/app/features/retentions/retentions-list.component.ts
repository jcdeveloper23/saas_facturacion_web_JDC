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
import { Timestamp } from '@angular/fire/firestore';

import { RetentionsService } from './services/retentions.service';
import { TenantService }     from '../../core/services/tenant.service';
import { NotificationService } from '../../core/services/notification.service';
import {
  Retention, RetentionStatus,
  RETENTION_STATUS_LABELS, RETENTION_STATUS_COLORS
} from './models/retention.interface';
import { SRI_STATUS_LABELS, SRI_STATUS_COLORS } from '../invoices/models/invoice.interface';

@Component({
  selector: 'app-retentions-list',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    CardModule, ButtonModule, GridModule, BadgeModule, SpinnerModule,
    IconModule,
  ],
  template: `
<c-card>
  <c-card-header class="d-flex align-items-center justify-content-between py-2">
    <span class="fw-semibold">Comprobantes de Retención</span>
    <button cButton color="primary" size="sm" (click)="router.navigate(['/retentions/new'])">
      <svg cIcon name="cilPlus" class="me-1"></svg> Nueva Retención
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
           placeholder="Buscar proveedor o número..."
           [(ngModel)]="searchTerm" (ngModelChange)="applySearch()">
    <span class="ms-auto text-secondary" style="font-size:.75rem">
      {{ filtered().length }} retención(es)
    </span>
  </div>

  <c-card-body class="p-0">
    @if (loading()) {
      <div class="text-center py-4">
        <c-spinner color="primary" size="sm"></c-spinner>
      </div>
    } @else if (filtered().length === 0) {
      <div class="text-center py-5 text-secondary">
        <p class="mb-1">No hay retenciones</p>
        <button cButton color="primary" variant="outline" size="sm"
                (click)="router.navigate(['/retentions/new'])">
          Crear primera retención
        </button>
      </div>
    } @else {
      <div class="table-responsive">
        <table class="table table-hover table-sm mb-0" style="font-size:.82rem">
          <thead class="table-light">
            <tr>
              <th>Número</th>
              <th>Fecha</th>
              <th>Proveedor</th>
              <th>RUC/CI</th>
              <th>Doc Sustento</th>
              <th class="text-end">Total Ret.</th>
              <th class="text-center">Estado</th>
              <th class="text-center">SRI</th>
              <th class="text-center">Acciones</th>
            </tr>
          </thead>
          <tbody>
            @for (r of filtered(); track r.id) {
              <tr>
                <td class="fw-semibold">{{ r.fullNumber }}</td>
                <td class="text-nowrap">{{ r.date.toDate() | date:'dd/MM/yyyy' }}</td>
                <td>{{ r.supplierName }}</td>
                <td>{{ r.supplierTaxId }}</td>
                <td>{{ r.supportDocNumber }}</td>
                <td class="text-end">$ {{ r.totalRetained | number:'1.2-2' }}</td>
                <td class="text-center">
                  <c-badge [color]="STATUS_COLORS[r.status]">
                    {{ STATUS_LABELS[r.status] }}
                  </c-badge>
                </td>
                <td class="text-center">
                  @if (r.sriStatus) {
                    <c-badge [color]="SRI_COLORS[r.sriStatus]" style="font-size:.65rem">
                      {{ SRI_LABELS[r.sriStatus] }}
                    </c-badge>
                  } @else {
                    <span class="text-secondary">—</span>
                  }
                </td>
                <td class="text-center text-nowrap">
                  <!-- Edit draft -->
                  @if (r.status === 'draft') {
                    <button cButton color="secondary" variant="outline" size="sm"
                            title="Editar"
                            (click)="router.navigate(['/retentions', r.id, 'edit'])">
                      <svg cIcon name="cilPencil"></svg>
                    </button>
                    <button cButton color="danger" variant="outline" size="sm"
                            class="ms-1" title="Eliminar"
                            (click)="deleteRetention(r)">
                      <svg cIcon name="cilTrash"></svg>
                    </button>
                  } @else {
                    <button cButton color="secondary" variant="outline" size="sm"
                            title="Ver"
                            (click)="router.navigate(['/retentions', r.id, 'edit'])">
                      <svg cIcon name="cilSearch"></svg>
                    </button>
                  }
                  <!-- Reenviar (rejected) -->
                  @if (r.sriStatus === 'rejected') {
                    <button cButton color="warning" variant="outline" size="sm"
                            class="ms-1" title="Reenviar a SRI"
                            [disabled]="reenviarLoading()"
                            (click)="reenviarSri(r)">
                      <svg cIcon name="cilReload"></svg>
                    </button>
                  }
                  <!-- Download XML -->
                  @if (r.xmlUrl) {
                    <button cButton color="info" variant="outline" size="sm"
                            class="ms-1" title="Descargar XML"
                            [disabled]="downloadingDoc() === r.id + '-xml'"
                            (click)="downloadDoc(r.id, 'xml', 'retention')">
                      @if (downloadingDoc() === r.id + '-xml') {
                        <c-spinner size="sm"></c-spinner>
                      } @else {
                        <svg cIcon name="cilCloudDownload"></svg>
                      }
                    </button>
                  }
                  <!-- PDF/RIDE -->
                  @if (r.sriStatus === 'authorized' && !r.pdfUrl) {
                    <button cButton color="success" variant="outline" size="sm"
                            class="ms-1" title="Generar PDF/RIDE"
                            [disabled]="pdfLoading() === r.id"
                            (click)="generarPdf(r)">
                      @if (pdfLoading() === r.id) { <c-spinner size="sm"></c-spinner> }
                      @else { <svg cIcon name="cilFile"></svg> }
                    </button>
                  }
                  @if (r.pdfUrl) {
                    <button cButton color="success" variant="outline" size="sm"
                            class="ms-1" title="Descargar PDF/RIDE"
                            [disabled]="downloadingDoc() === r.id + '-pdf'"
                            (click)="downloadDoc(r.id, 'pdf', 'retention')">
                      @if (downloadingDoc() === r.id + '-pdf') {
                        <c-spinner size="sm"></c-spinner>
                      } @else {
                        <svg cIcon name="cilFile"></svg>
                      }
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
export class RetentionsListComponent implements OnInit, OnDestroy {
  readonly router        = inject(Router);
  private svc            = inject(RetentionsService);
  private tenant         = inject(TenantService);
  private notifications  = inject(NotificationService);
  private functions      = inject(Functions);
  private destroy$       = new Subject<void>();

  readonly window = window;

  readonly STATUS_LABELS = RETENTION_STATUS_LABELS;
  readonly STATUS_COLORS = RETENTION_STATUS_COLORS;
  readonly SRI_LABELS    = SRI_STATUS_LABELS;
  readonly SRI_COLORS    = SRI_STATUS_COLORS;

  loading         = signal(true);
  reenviarLoading = signal(false);
  pdfLoading      = signal<string | null>(null);
  downloadingDoc  = signal<string | null>(null);
  all           = signal<Retention[]>([]);
  yearFilter    = String(new Date().getFullYear());
  statusFilter  = '';
  searchTerm    = '';

  years = Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - i));

  filtered = computed(() => {
    const term = this.searchTerm.toLowerCase().trim();
    if (!term) return this.all();
    return this.all().filter(r =>
      r.supplierName.toLowerCase().includes(term) ||
      r.supplierTaxId.includes(term) ||
      r.fullNumber.includes(term) ||
      r.supportDocNumber.includes(term)
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
    this.svc.getRetentions({
      year:   this.yearFilter || undefined,
      status: (this.statusFilter as RetentionStatus) || undefined,
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next:  list => { this.all.set(list); this.loading.set(false); },
      error: ()   => this.loading.set(false),
    });
  }

  applySearch(): void { /* reactive via computed() */ }

  async deleteRetention(r: Retention): Promise<void> {
    if (!confirm(`¿Eliminar retención ${r.fullNumber}?`)) return;
    try {
      await this.svc.deleteRetention(r.id);
      this.notifications.success('Retención eliminada');
    } catch (err: any) {
      this.notifications.error('Error al eliminar: ' + (err?.message ?? err));
    }
  }

  async generarPdf(r: Retention): Promise<void> {
    this.pdfLoading.set(r.id);
    try {
      const fn = httpsCallable(this.functions, 'generateRetentionPdf');
      const res: any = await fn({ retentionId: r.id, companyId: this.tenant.companyId });
      if (res.data?.pdfUrl) window.open(res.data.pdfUrl, '_blank');
      this.notifications.success('PDF generado');
    } catch (err: any) {
      this.notifications.error('Error al generar PDF: ' + (err?.message ?? err));
    } finally {
      this.pdfLoading.set(null);
    }
  }

  async reenviarSri(r: Retention): Promise<void> {
    this.reenviarLoading.set(true);
    try {
      const fn = httpsCallable(this.functions, 'sendToSri');
      await fn({ documentId: r.id, documentType: 'retention', companyId: this.tenant.companyId });
      this.notifications.success('Retención reenviada al SRI');
    } catch (err: any) {
      this.notifications.error('Error al reenviar: ' + (err?.message ?? err));
    } finally {
      this.reenviarLoading.set(false);
    }
  }

  async downloadDoc(docId: string, fileType: 'xml' | 'pdf', documentType: string): Promise<void> {
    const key = `${docId}-${fileType}`;
    if (this.downloadingDoc() === key) return;
    this.downloadingDoc.set(key);
    try {
      const fn = httpsCallable<object, { url: string }>(this.functions, 'downloadDocument');
      const result = await fn({ documentId: docId, companyId: this.tenant.companyId, fileType, documentType });
      window.open(result.data.url, '_blank');
    } catch {
      this.notifications.error('No se pudo obtener el archivo. Verifique que el documento fue procesado.');
    } finally {
      this.downloadingDoc.set(null);
    }
  }
}
