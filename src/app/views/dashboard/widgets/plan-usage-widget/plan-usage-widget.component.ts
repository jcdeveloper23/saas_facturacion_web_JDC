import { Component, inject, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatePipe, NgIf } from '@angular/common';
import {
  BadgeComponent,
  ButtonDirective,
  CardBodyComponent,
  CardComponent,
  CardFooterComponent,
  CardHeaderComponent,
  ProgressComponent
} from '@coreui/angular';
import { IconDirective } from '@coreui/icons-angular';
import { PlanLimitsService, LimitedResource } from '../../../../core/services/plan-limits.service';

interface UsageRow {
  resource: LimitedResource;
  label: string;
}

const SRI_ROWS: UsageRow[] = [
  { resource: 'invoices',   label: 'Facturas' },
  { resource: 'retentions', label: 'Retenciones' },
  { resource: 'debitNotes', label: 'Notas de débito' },
  { resource: 'purchases',  label: 'Compras' },
];

const MASTER_ROWS: UsageRow[] = [
  { resource: 'personas', label: 'Personas' },
  { resource: 'products', label: 'Productos' },
  { resource: 'users',    label: 'Usuarios' },
];

@Component({
  selector: 'app-plan-usage-widget',
  templateUrl: './plan-usage-widget.component.html',
  styleUrl: './plan-usage-widget.component.scss',
  standalone: true,
  imports: [
    NgIf,
    DatePipe,
    RouterLink,
    CardComponent,
    CardHeaderComponent,
    CardBodyComponent,
    CardFooterComponent,
    BadgeComponent,
    ButtonDirective,
    ProgressComponent,
    IconDirective
  ]
})
export class PlanUsageWidgetComponent {
  private svc = inject(PlanLimitsService);

  readonly company  = computed(() => this.svc.companyDoc());
  readonly sriRows  = SRI_ROWS;
  readonly masterRows = MASTER_ROWS;

  /** Convierte un Firestore Timestamp (o Date) a Date nativo */
  private toDate(ts: any): Date | null {
    if (!ts) return null;
    return ts.toDate ? ts.toDate() : new Date(ts);
  }

  /** Días restantes hasta el vencimiento de la suscripción */
  readonly daysLeft = computed(() => {
    const end = this.toDate(this.company()?.subscriptionEnd);
    if (!end) return null;
    return Math.ceil((end.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  });

  readonly isExpiringSoon = computed(() => {
    const d = this.daysLeft();
    return d !== null && d <= 7;
  });

  readonly subscriptionEndDate = computed(() =>
    this.toDate(this.company()?.subscriptionEnd)
  );

  usagePercent(r: LimitedResource): number { return this.svc.usagePercent(r); }
  getLimit(r: LimitedResource): number     { return this.svc.getLimit(r); }
  getUsed(r: LimitedResource): number      { return this.svc.getUsed(r); }

  progressColor(pct: number): string {
    if (pct >= 90) return 'danger';
    if (pct >= 70) return 'warning';
    return 'success';
  }

  isNearOrOver(r: LimitedResource): boolean {
    return this.svc.isNearLimit(r) || this.svc.isOverLimit(r);
  }
}
