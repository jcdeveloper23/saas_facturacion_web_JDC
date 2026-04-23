import { Component, inject, signal, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  CardComponent, CardBodyComponent, CardHeaderComponent,
  TableDirective, BadgeComponent,
  ButtonDirective, SpinnerComponent, RowComponent, ColComponent,
  ModalComponent, ModalHeaderComponent, ModalBodyComponent, ModalFooterComponent,
  ModalTitleDirective, ButtonCloseDirective,
  FormSelectDirective, FormLabelDirective,
  AlertComponent
} from '@coreui/angular';
import { IconDirective } from '@coreui/icons-angular';
import { SuperAdminService } from '../../services/super-admin.service';
import { Company, CompanyStatus } from '../../models/company.interface';
import { Plan } from '../../models/plan.interface';
import { NotificationService } from '../../../../core/services/notification.service';

@Component({
  selector: 'app-companies-list',
  templateUrl: './companies-list.component.html',
  styleUrl: './companies-list.component.scss',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    CardComponent, CardBodyComponent, CardHeaderComponent,
    TableDirective, BadgeComponent,
    ButtonDirective, SpinnerComponent, RowComponent, ColComponent,
    ModalComponent, ModalHeaderComponent, ModalBodyComponent, ModalFooterComponent,
    ModalTitleDirective, ButtonCloseDirective,
    FormSelectDirective, FormLabelDirective,
    AlertComponent,
    IconDirective
  ]
})
export class CompaniesListComponent implements OnInit {
  private svc = inject(SuperAdminService);
  private notifications = inject(NotificationService);

  companies = signal<Company[]>([]);
  loading = signal(true);
  actionInProgress = signal<string | null>(null);

  // ── Assign Plan Modal ───────────────────────────────────────────────────────
  showAssignPlanModal = signal(false);
  selectedCompanyForPlan = signal<Company | null>(null);
  availablePlans = signal<Plan[]>([]);
  selectedPlanId = signal<string>('');
  selectedPlanPreview = signal<Plan | null>(null);
  assigningPlan = signal(false);

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

  ngOnInit(): void {
    this.svc.getCompanies().subscribe({
      next: (list) => {
        this.companies.set(list);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Error al cargar lista de empresas:', JSON.stringify(err, null, 2), err);
        this.notifications.error('No se pudo cargar la lista de empresas');
        this.loading.set(false);
      }
    });

    this.svc.getPlans().subscribe(plans => {
      this.availablePlans.set(plans.filter(p => p.isActive));
    });
  }

  // ── Assign Plan Modal Methods ───────────────────────────────────────────────

  openAssignPlanModal(company: Company): void {
    this.selectedCompanyForPlan.set(company);
    this.selectedPlanId.set(company.planId ?? '');
    this.showAssignPlanModal.set(true);
    this.onPlanPreviewChange(company.planId ?? '');
  }

  onPlanPreviewChange(planId: string): void {
    this.selectedPlanId.set(planId);
    const plan = this.availablePlans().find(p => p.id === planId) ?? null;
    this.selectedPlanPreview.set(plan);
  }

  async confirmAssignPlan(): Promise<void> {
    const company = this.selectedCompanyForPlan();
    const planId = this.selectedPlanId();
    if (!company || !planId) return;
    this.assigningPlan.set(true);
    try {
      await this.svc.assignPlanToCompany(company.id, planId);
      this.notifications.success(`Plan asignado correctamente a ${company.name}`);
      this.showAssignPlanModal.set(false);
    } catch (e) {
      console.error('Error asignando plan:', e);
      this.notifications.error('Error al asignar el plan');
    } finally {
      this.assigningPlan.set(false);
    }
  }

  closeAssignPlanModal(): void {
    this.showAssignPlanModal.set(false);
    this.selectedCompanyForPlan.set(null);
    this.selectedPlanPreview.set(null);
  }

  async toggleStatus(company: Company): Promise<void> {
    const newStatus: CompanyStatus = company.status === 'active' ? 'suspended' : 'active';
    this.actionInProgress.set(company.id);
    try {
      await this.svc.setCompanyStatus(company.id, newStatus);
      const label = newStatus === 'active' ? 'activada' : 'suspendida';
      this.notifications.success(`Empresa ${label} correctamente`);
    } catch (err) {
      console.error('Error al cambiar estado de la empresa:', JSON.stringify(err, null, 2), err);
      this.notifications.error('Error al cambiar estado de la empresa');
    } finally {
      this.actionInProgress.set(null);
    }
  }

  trackById(_: number, item: Company): string {
    return item.id;
  }
}
