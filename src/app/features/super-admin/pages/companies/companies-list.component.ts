import { Component, inject, signal, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  CardComponent, CardBodyComponent, CardHeaderComponent,
  TableDirective, BadgeComponent,
  ButtonDirective, SpinnerComponent, RowComponent, ColComponent
} from '@coreui/angular';
import { IconDirective } from '@coreui/icons-angular';
import { SuperAdminService } from '../../services/super-admin.service';
import { Company, CompanyStatus } from '../../models/company.interface';
import { NotificationService } from '../../../../core/services/notification.service';

@Component({
  selector: 'app-companies-list',
  templateUrl: './companies-list.component.html',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    CardComponent, CardBodyComponent, CardHeaderComponent,
    TableDirective, BadgeComponent,
    ButtonDirective, SpinnerComponent, RowComponent, ColComponent,
    IconDirective
  ]
})
export class CompaniesListComponent implements OnInit {
  private svc = inject(SuperAdminService);
  private notifications = inject(NotificationService);

  companies = signal<Company[]>([]);
  loading = signal(true);
  actionInProgress = signal<string | null>(null);

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
