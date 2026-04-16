import {
  Component, OnInit, OnDestroy, inject, signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import {
  CardModule, ButtonModule, BadgeModule, SpinnerModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';

import { SupplierMappingsService } from './services/supplier-mappings.service';
import { NotificationService }     from '../../core/services/notification.service';
import { SupplierProductMapping }  from './models/supplier-mapping.interface';

@Component({
  selector: 'app-purchases-mappings',
  standalone: true,
  template: `
<!-- ── Header ──────────────────────────────────────────────────────────────── -->
<div class="d-flex justify-content-between align-items-center mb-3">
  <div class="d-flex align-items-center gap-2">
    <div class="bg-info bg-opacity-10 p-2 rounded">
      <svg cIcon name="cilTransfer" size="xl" class="text-info"></svg>
    </div>
    <div>
      <h3 class="mb-0 fw-semibold">Homologación de Productos</h3>
      <p class="text-muted small mb-0">Mapeos guardados: código del proveedor → producto del catálogo</p>
    </div>
  </div>
  <button cButton color="secondary" variant="outline" size="sm"
          (click)="router.navigate(['/purchases'])">
    <svg cIcon name="cilArrowLeft" class="me-1"></svg> Volver a Compras
  </button>
</div>

<!-- ── Filter ──────────────────────────────────────────────────────────────── -->
<c-card class="mb-0">
  <div class="px-3 pt-2 pb-1 border-bottom d-flex gap-2 align-items-center">
    <div class="position-relative" style="flex:1; min-width:200px; max-width:340px">
      <svg cIcon name="cilSearch" size="sm"
           style="position:absolute; left:.6rem; top:50%; transform:translateY(-50%); color:var(--cui-secondary-color)">
      </svg>
      <input class="form-control form-control-sm" style="padding-left:2rem"
             placeholder="Buscar por proveedor, código o producto..."
             [(ngModel)]="searchTerm">
    </div>
    <span class="ms-auto text-secondary" style="font-size:.75rem">
      {{ filtered().length }} mapeo(s)
    </span>
  </div>

  <c-card-body class="p-0">
    @if (loading()) {
      <div class="text-center py-4"><c-spinner color="primary" size="sm"></c-spinner></div>
    } @else if (filtered().length === 0) {
      <div class="text-center py-5 text-secondary">
        <svg cIcon name="cilTransfer" size="xl" class="mb-2 text-muted"></svg>
        <p class="mb-1">No hay mapeos guardados aún</p>
        <p class="small text-muted">Los mapeos se crean durante la importación de facturas XML del SRI.</p>
      </div>
    } @else {
      <div class="table-responsive">
        <table class="table table-hover table-sm mb-0" style="font-size:.82rem">
          <thead class="table-light">
            <tr>
              <th>Proveedor</th>
              <th>RUC</th>
              <th>Cód. Proveedor</th>
              <th>Descripción en factura</th>
              <th>→ Producto catálogo</th>
              <th>SKU catálogo</th>
              <th class="text-center">Eliminar</th>
            </tr>
          </thead>
          <tbody>
            @for (m of filtered(); track m.id) {
              <tr>
                <td style="max-width:160px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap"
                    [title]="m.supplierName">
                  {{ m.supplierName }}
                </td>
                <td class="font-monospace" style="font-size:.76rem">{{ m.supplierRuc }}</td>
                <td class="font-monospace text-nowrap">{{ m.supplierSku }}</td>
                <td style="max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap"
                    [title]="m.supplierDescription">
                  {{ m.supplierDescription }}
                </td>
                <td class="fw-medium text-success"
                    style="max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap">
                  <svg cIcon name="cilCheckCircle" size="sm" class="me-1"></svg>{{ m.productName }}
                </td>
                <td class="font-monospace" style="font-size:.76rem">{{ m.productSku }}</td>
                <td class="text-center">
                  <button cButton color="danger" variant="outline" size="sm"
                          title="Eliminar mapeo"
                          (click)="deleteMapping(m)">
                    <svg cIcon name="cilTrash"></svg>
                  </button>
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
  imports: [
    CommonModule, FormsModule,
    CardModule, ButtonModule, BadgeModule, SpinnerModule,
    IconModule,
  ],
})
export class PurchasesMappingsComponent implements OnInit, OnDestroy {
  readonly router       = inject(Router);
  private svc           = inject(SupplierMappingsService);
  private notifications = inject(NotificationService);
  private destroy$      = new Subject<void>();

  loading    = signal(true);
  all        = signal<SupplierProductMapping[]>([]);
  searchTerm = '';

  filtered = computed(() => {
    const term = this.searchTerm.toLowerCase().trim();
    if (!term) return this.all();
    return this.all().filter(m =>
      m.supplierName.toLowerCase().includes(term) ||
      m.supplierRuc.includes(term) ||
      m.supplierSku.toLowerCase().includes(term) ||
      m.supplierDescription.toLowerCase().includes(term) ||
      m.productName.toLowerCase().includes(term) ||
      m.productSku.toLowerCase().includes(term)
    );
  });

  ngOnInit(): void {
    this.svc.getAll()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: list => {
          this.all.set(list.sort((a, b) => a.supplierName.localeCompare(b.supplierName, 'es')));
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  async deleteMapping(m: SupplierProductMapping): Promise<void> {
    if (!confirm(`¿Eliminar el mapeo "${m.supplierSku}" → "${m.productName}"?`)) return;
    try {
      await this.svc.delete(m.id);
      this.notifications.success('Mapeo eliminado');
    } catch {
      this.notifications.error('Error al eliminar el mapeo');
    }
  }
}
