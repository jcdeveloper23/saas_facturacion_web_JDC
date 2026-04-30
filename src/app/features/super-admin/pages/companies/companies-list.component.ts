import { Component, inject, signal, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  CardComponent, CardBodyComponent, CardHeaderComponent,
  TableDirective, BadgeComponent,
  ButtonDirective, SpinnerComponent, RowComponent, ColComponent,
  ModalComponent, ModalHeaderComponent, ModalBodyComponent, ModalFooterComponent,
  ModalTitleDirective, ButtonCloseDirective,
  FormSelectDirective, FormLabelDirective, FormControlDirective,
  AlertComponent
} from '@coreui/angular';
import { IconDirective } from '@coreui/icons-angular';
import { SuperAdminService } from '../../services/super-admin.service';
import { Company, CompanyStatus } from '../../models/company.interface';
import { Plan } from '../../models/plan.interface';
import { NotificationService } from '../../../../core/services/notification.service';

/** Formatea una Date como 'YYYY-MM-DD' usando la hora LOCAL (evita desfase UTC). */
function toInputDate(d: Date | null): string {
  const dt = d ?? (() => { const f = new Date(); f.setDate(f.getDate() + 30); return f; })();
  const y  = dt.getFullYear();
  const m  = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parsea 'YYYY-MM-DD' como medianoche LOCAL (sin conversión UTC que resta un día). */
function localDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

@Component({
  selector: 'app-companies-list',
  templateUrl: './companies-list.component.html',
  styleUrl: './companies-list.component.scss',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    CardComponent, CardBodyComponent, CardHeaderComponent,
    TableDirective, BadgeComponent,
    ButtonDirective, SpinnerComponent, RowComponent, ColComponent,
    ModalComponent, ModalHeaderComponent, ModalBodyComponent, ModalFooterComponent,
    ModalTitleDirective, ButtonCloseDirective,
    FormSelectDirective, FormLabelDirective, FormControlDirective,
    AlertComponent,
    IconDirective
  ]
})
export class CompaniesListComponent implements OnInit {
  private svc = inject(SuperAdminService);
  private notifications = inject(NotificationService);
  private fb = inject(FormBuilder);

  companies = signal<Company[]>([]);
  loading = signal(true);
  actionInProgress = signal<string | null>(null);

  // ── Assign Plan Modal ───────────────────────────────────────────────────────
  showAssignPlanModal    = signal(false);
  selectedCompanyForPlan = signal<Company | null>(null);
  availablePlans         = signal<Plan[]>([]);
  selectedPlanPreview    = signal<Plan | null>(null);
  assigningPlan          = signal(false);

  modalForm = this.fb.group({
    planId:          ['', Validators.required],
    subscriptionEnd: ['', Validators.required]
  });

  readonly packageLabels: Record<string, string> = {
    pkg_base:        'Base',
    pkg_sales:       'Ventas',
    pkg_sri:         'Facturación Electrónica',
    pkg_marketplace: 'Catálogo Público',
    pkg_purchases:   'Compras',
    pkg_accounting:  'Contabilidad',
    pkg_stock:       'Inventario',
    pkg_team_mgmt:   'Gestión de Equipos',
    pkg_pos:         'Punto de Venta',
    pkg_personas:    'Personas / Contactos',
    pkg_hr:          'RRHH'
  };

  packageLabel(code: string): string {
    return this.packageLabels[code] ?? code;
  }

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
    this.modalForm.setValue({
      planId:          company.planId ?? '',
      subscriptionEnd: toInputDate(this.safeDate(company.subscriptionEnd))
    });
    this.onPlanPreviewChange(company.planId ?? '');
    this.showAssignPlanModal.set(true);
  }

  onPlanPreviewChange(planId: string): void {
    const plan = this.availablePlans().find(p => p.id === planId) ?? null;
    this.selectedPlanPreview.set(plan);
  }

  async confirmAssignPlan(): Promise<void> {
    if (this.modalForm.invalid) return;
    const company = this.selectedCompanyForPlan();
    const { planId, subscriptionEnd } = this.modalForm.getRawValue();
    if (!company || !planId || !subscriptionEnd) return;
    this.assigningPlan.set(true);
    try {
      await this.svc.assignPlanToCompany(company.id, planId, localDate(subscriptionEnd));
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
    this.modalForm.reset();
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

  /** Convierte cualquier valor de Firestore (Timestamp, Date, string, null) a Date o null. */
  safeDate(ts: any): Date | null {
    if (!ts) return null;
    if (typeof ts.toDate === 'function') return ts.toDate();
    if (ts instanceof Date) return ts;
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d;
  }

  isExpired(company: Company): boolean {
    const d = this.safeDate(company.subscriptionEnd);
    return !!d && d < new Date();
  }
}
