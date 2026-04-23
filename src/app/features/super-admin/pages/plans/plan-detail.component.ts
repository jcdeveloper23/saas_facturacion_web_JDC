import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import {
  CardComponent, CardBodyComponent, CardHeaderComponent,
  TableDirective, BadgeComponent,
  ButtonDirective, SpinnerComponent, RowComponent, ColComponent
} from '@coreui/angular';
import { IconDirective } from '@coreui/icons-angular';
import { SuperAdminService } from '../../services/super-admin.service';
import { Plan } from '../../models/plan.interface';
import { Company, CompanyStatus } from '../../models/company.interface';

@Component({
  selector: 'app-plan-detail',
  templateUrl: './plan-detail.component.html',
  styleUrl: './plan-detail.component.scss',
  standalone: true,
  imports: [
    CommonModule,
    CardComponent, CardBodyComponent, CardHeaderComponent,
    TableDirective, BadgeComponent,
    ButtonDirective, SpinnerComponent, RowComponent, ColComponent,
    IconDirective
  ]
})
export class PlanDetailComponent implements OnInit, OnDestroy {
  private svc = inject(SuperAdminService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private subs = new Subscription();

  plan = signal<Plan | null>(null);
  companies = signal<Company[]>([]);
  loading = signal(true);

  readonly statusColors: Record<CompanyStatus, string> = {
    active:    'success',
    trial:     'info',
    suspended: 'warning',
    cancelled: 'danger'
  };

  readonly statusLabels: Record<CompanyStatus, string> = {
    active:    'Activa',
    trial:     'Trial',
    suspended: 'Suspendida',
    cancelled: 'Cancelada'
  };

  readonly featureLabels: Record<string, string> = {
    electronicInvoicing:  'Facturación Electrónica',
    purchasesModule:      'Módulo Compras',
    accountingModule:     'Módulo Contabilidad',
    stockModule:          'Módulo Stock',
    teamManagementModule: 'Gestión de Equipos',
    publicCatalogModule:  'Catálogo Público',
    publicApiModule:      'API Pública',
    prioritySupport:      'Soporte Prioritario',
    betaAccess:           'Acceso Beta',
    multiCompanyMode:     'Modo Multi-empresa'
  };

  ngOnInit(): void {
    const planId = this.route.snapshot.paramMap.get('id');
    if (!planId) { this.router.navigate(['/super-admin/plans']); return; }

    this.subs.add(
      this.svc.getPlans().subscribe({
        next: (list) => {
          const found = list.find(p => p.id === planId) ?? null;
          this.plan.set(found);
          if (!found) { this.loading.set(false); }
        },
        error: () => { this.loading.set(false); }
      })
    );

    this.subs.add(
      this.svc.getCompanies().subscribe({
        next: (list) => {
          this.companies.set(list.filter(c => c.planId === planId));
          this.loading.set(false);
        },
        error: () => { this.loading.set(false); }
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  goBack(): void {
    this.router.navigate(['/super-admin/plans']);
  }

  formatLimit(value: number | undefined): string {
    if (value === undefined || value === null) return '—';
    return value === -1 ? '∞' : String(value);
  }

  enabledFeatures(plan: Plan): string[] {
    return Object.entries(plan.features ?? {})
      .filter(([, v]) => v === true)
      .map(([k]) => this.featureLabels[k] ?? k);
  }

  trackById(_: number, item: { id: string }): string { return item.id; }
}
