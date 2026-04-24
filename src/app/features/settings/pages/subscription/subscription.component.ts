import { Component, computed, inject } from '@angular/core';
import { DatePipe, NgIf } from '@angular/common';
import {
  BadgeComponent,
  ButtonDirective,
  CardBodyComponent,
  CardComponent,
  CardFooterComponent,
  CardHeaderComponent,
  ColComponent,
  ProgressComponent,
  RowComponent
} from '@coreui/angular';
import { IconDirective } from '@coreui/icons-angular';
import { PlanLimitsService, LimitedResource } from '../../../../core/services/plan-limits.service';
import { TenantService } from '../../../../core/services/tenant.service';
import { CompanyStatus } from '../../../super-admin/models/company.interface';

interface ResourceRow {
  resource: LimitedResource;
  label: string;
}

const STATUS_COLOR: Record<CompanyStatus, string> = {
  active: 'success',
  trial: 'info',
  suspended: 'warning',
  cancelled: 'danger'
};

const STATUS_LABEL: Record<CompanyStatus, string> = {
  active: 'Activo',
  trial: 'Prueba',
  suspended: 'Suspendido',
  cancelled: 'Cancelado'
};

const FEATURE_LABELS: Record<string, string> = {
  electronicInvoicing: 'Facturación electrónica',
  purchasesModule: 'Módulo de compras',
  accountingModule: 'Módulo contable',
  stockModule: 'Control de inventario',
  teamManagementModule: 'Gestión de equipos',
  publicCatalogModule: 'Catálogo público',
  publicApiModule: 'API pública',
  prioritySupport: 'Soporte prioritario',
  betaAccess: 'Acceso beta',
  multiCompanyMode: 'Multi-empresa'
};

@Component({
  selector: 'app-subscription',
  standalone: true,
  templateUrl: './subscription.component.html',
  imports: [
    NgIf,
    DatePipe,
    CardComponent,
    CardHeaderComponent,
    CardBodyComponent,
    CardFooterComponent,
    BadgeComponent,
    ButtonDirective,
    RowComponent,
    ColComponent,
    ProgressComponent,
    IconDirective
  ]
})
export class SubscriptionComponent {
  private planLimits = inject(PlanLimitsService);
  private tenant = inject(TenantService);

  readonly company = computed(() => this.planLimits.companyDoc());
  readonly usage = computed(() => this.planLimits.currentUsage());

  readonly sriResources: ResourceRow[] = [
    { resource: 'invoices',    label: 'Facturas' },
    { resource: 'retentions',  label: 'Retenciones' },
    { resource: 'debitNotes',  label: 'Notas de débito' },
    { resource: 'purchases',   label: 'Compras' }
  ];

  readonly masterResources: ResourceRow[] = [
    { resource: 'personas',  label: 'Personas' },
    { resource: 'products',  label: 'Productos' },
    { resource: 'users',     label: 'Usuarios' }
  ];

  statusColor(status: CompanyStatus | undefined): string {
    return status ? STATUS_COLOR[status] : 'secondary';
  }

  statusLabel(status: CompanyStatus | undefined): string {
    return status ? STATUS_LABEL[status] : '';
  }

  usagePercent(r: LimitedResource): number {
    return this.planLimits.usagePercent(r);
  }

  getLimit(r: LimitedResource): number {
    return this.planLimits.getLimit(r);
  }

  getUsed(r: LimitedResource): number {
    return this.planLimits.getUsed(r);
  }

  progressColor(pct: number): string {
    if (pct >= 90) return 'danger';
    if (pct >= 70) return 'warning';
    return 'success';
  }

  featureEntries(): Array<{ key: string; label: string; value: boolean }> {
    const features = this.company()?.planFeatures;
    if (!features) return [];
    return Object.entries(features).map(([key, value]) => ({
      key,
      label: FEATURE_LABELS[key] ?? key,
      value: value as boolean
    }));
  }

  toDate(ts: any): Date | null {
    if (!ts) return null;
    return ts.toDate ? ts.toDate() : null;
  }
}
