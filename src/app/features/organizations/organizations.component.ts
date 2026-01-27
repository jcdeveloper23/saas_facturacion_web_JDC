import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  CardModule,
  GridModule,
  ButtonModule,
  TableModule,
  BadgeModule,
  FormModule,
  ModalModule,
  TooltipModule,
  ProgressModule,
  AlertModule,
  SpinnerModule,
  DropdownModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';

import { OrganizationsService } from '../../core/services/organizations.service';
import { PlansService } from '../../core/services/plans.service';
import {
  Organization,
  OrganizationFilters,
  Plan,
  PLAN_COLORS
} from '../../core/interfaces';
import { HasPermissionDirective } from '../../shared/directives/has-permission.directive';
import { OrganizationFormComponent } from './components/organization-form/organization-form.component';
import { OrganizationDetailsComponent } from './components/organization-details/organization-details.component';

@Component({
  selector: 'app-organizations',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    CardModule,
    GridModule,
    ButtonModule,
    TableModule,
    BadgeModule,
    FormModule,
    ModalModule,
    TooltipModule,
    ProgressModule,
    AlertModule,
    SpinnerModule,
    DropdownModule,
    IconModule,
    HasPermissionDirective,
    OrganizationFormComponent,
    OrganizationDetailsComponent
  ],
  templateUrl: './organizations.component.html',
  styleUrl: './organizations.component.scss'
})
export class OrganizationsComponent implements OnInit {
  private organizationsService = inject(OrganizationsService);
  private plansService = inject(PlansService);

  // Expose Math for template
  Math = Math;

  // State
  organizations = signal<Organization[]>([]);
  isLoading = signal(false);
  error = signal<string | null>(null);

  // Filters
  filters = signal<OrganizationFilters>({});
  searchTerm = signal('');
  selectedPlan = signal<string>('');
  selectedStatus = signal<string>('');

  // Pagination
  currentPage = signal(1);
  pageSize = signal(10);
  totalItems = signal(0);

  // Modal states
  showFormModal = signal(false);
  showDetailsModal = signal(false);
  selectedOrganization = signal<Organization | null>(null);
  isEditMode = signal(false);

  // Summary stats
  summary = signal({
    total: 0,
    active: 0,
    trial: 0,
    suspended: 0
  });

  // Computed
  totalPages = computed(() => Math.ceil(this.totalItems() / this.pageSize()));

  filteredOrganizations = computed(() => {
    let orgs = this.organizations();
    const search = this.searchTerm().toLowerCase();

    if (search) {
      orgs = orgs.filter(org =>
        org.name.toLowerCase().includes(search) ||
        org.email.toLowerCase().includes(search) ||
        (org.tax_document?.toLowerCase().includes(search))
      );
    }

    return orgs;
  });

  paginationPages = computed(() => {
    const total = this.totalPages();
    const current = this.currentPage();
    const pages: number[] = [];

    for (let i = 1; i <= total; i++) {
      if (i === 1 || i === total || (i >= current - 2 && i <= current + 2)) {
        pages.push(i);
      }
    }

    return pages;
  });

  // Plans loaded from database
  plans = signal<Plan[]>([]);

  // Plan options computed from loaded plans
  planOptions = computed(() => {
    const options: { value: string; label: string }[] = [
      { value: '', label: 'Todos los planes' }
    ];
    this.plans().forEach(plan => {
      options.push({ value: plan.code, label: plan.name });
    });
    return options;
  });

  statusOptions = [
    { value: '', label: 'Todos los estados' },
    { value: 'true', label: 'Activas' },
    { value: 'false', label: 'Inactivas' }
  ];

  ngOnInit(): void {
    this.loadPlans();
    this.loadOrganizations();
    this.loadSummary();
  }

  loadPlans(): void {
    this.plansService.getActivePlans().subscribe({
      next: (plans) => this.plans.set(plans),
      error: (err) => console.error('Error loading plans:', err)
    });
  }

  // ==========================================================================
  // DATA LOADING
  // ==========================================================================

  loadOrganizations(): void {
    this.isLoading.set(true);
    this.error.set(null);

    const pagination = {
      $limit: this.pageSize(),
      $skip: (this.currentPage() - 1) * this.pageSize(),
      // $sort: { created_at: -1 as const }
    };

    this.organizationsService.getOrganizations(this.filters(), pagination).subscribe({
      next: (response) => {
        this.organizations.set(response.data || []);
        this.totalItems.set(response.total || 0);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.error.set('Error al cargar las organizaciones');
        this.isLoading.set(false);
        console.error('Error loading organizations:', err);
      }
    });
  }

  loadSummary(): void {
    this.organizationsService.getOrganizations({}).subscribe({
      next: (response) => {
        const orgs = response.data || [];
        this.summary.set({
          total: response.total || 0,
          active: orgs.filter(o => o.is_active).length,
          trial: orgs.filter(o => o.plan === 'free').length,
          suspended: orgs.filter(o => !o.is_active).length
        });
      }
    });
  }

  // ==========================================================================
  // FILTERS
  // ==========================================================================

  onSearchChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.searchTerm.set(target.value);
  }

  applyFilters(): void {
    const newFilters: OrganizationFilters = {};

    if (this.selectedPlan()) {
      newFilters.plan = this.selectedPlan();
    }

    if (this.selectedStatus() !== '') { 
      newFilters.is_active = this.selectedStatus() === 'true';
    }

    if (this.searchTerm()) {
      newFilters.search = this.searchTerm();
    }

    this.filters.set(newFilters);
    this.currentPage.set(1);
    this.loadOrganizations();
  }

  clearFilters(): void {
    this.filters.set({});
    this.searchTerm.set('');
    this.selectedPlan.set('');
    this.selectedStatus.set('');
    this.currentPage.set(1);
    this.loadOrganizations();
  }

  // ==========================================================================
  // PAGINATION
  // ==========================================================================

  onPageChange(page: number): void {
    if (page >= 1 && page <= this.totalPages()) {
      this.currentPage.set(page);
      this.loadOrganizations();
    }
  }

  // ==========================================================================
  // CRUD OPERATIONS
  // ==========================================================================

  openCreateModal(): void {
    this.selectedOrganization.set(null);
    this.isEditMode.set(false);
    this.showFormModal.set(true);
  }

  openEditModal(org: Organization): void {
    this.selectedOrganization.set(org);
    this.isEditMode.set(true);
    this.showFormModal.set(true);
  }

  openDetailsModal(org: Organization): void {
    this.selectedOrganization.set(org);
    this.showDetailsModal.set(true);
  }

  closeFormModal(): void {
    this.showFormModal.set(false);
    this.selectedOrganization.set(null);
  }

  closeDetailsModal(): void {
    this.showDetailsModal.set(false);
    this.selectedOrganization.set(null);
  }

  onFormSaved(): void {
    this.closeFormModal();
    this.loadOrganizations();
    this.loadSummary();
  }

  // ==========================================================================
  // ACTIONS
  // ==========================================================================

  toggleStatus(org: Organization): void {
    const action = org.is_active
      ? this.organizationsService.deactivateOrganization(org.id!, 'Desactivada manualmente')
      : this.organizationsService.reactivateOrganization(org.id!);

    action.subscribe({
      next: () => {
        this.loadOrganizations();
        this.loadSummary();
      },
      error: (err) => {
        console.error('Error toggling status:', err);
        this.error.set('Error al cambiar el estado de la organización');
      }
    });
  }

  verifyOrganization(org: Organization): void {
    this.organizationsService.verifyOrganization(org.id!).subscribe({
      next: () => this.loadOrganizations(),
      error: (err) => {
        console.error('Error verifying organization:', err);
        this.error.set('Error al verificar la organización');
      }
    });
  }

  deleteOrganization(org: Organization): void {
    if (confirm(`¿Está seguro de eliminar la organización "${org.name}"?`)) {
      this.organizationsService.remove(org.id!).subscribe({
        next: () => {
          this.loadOrganizations();
          this.loadSummary();
        },
        error: (err) => {
          console.error('Error deleting organization:', err);
          this.error.set('Error al eliminar la organización');
        }
      });
    }
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  getPlanBadgeColor(planCode: string): string {
    // Use PLAN_COLORS if available, otherwise default based on plan
    if (PLAN_COLORS[planCode as keyof typeof PLAN_COLORS]) {
      return PLAN_COLORS[planCode as keyof typeof PLAN_COLORS];
    }
    // Dynamic color based on plan position
    const plan = this.plans().find(p => p.code === planCode);
    if (plan) {
      const index = this.plans().indexOf(plan);
      const colors = ['secondary', 'info', 'primary', 'warning', 'success'];
      return colors[index % colors.length];
    }
    return 'secondary';
  }

  getPlanLabel(planCode: string): string {
    const plan = this.plans().find(p => p.code === planCode);
    return plan?.name || planCode;
  }

  getUsagePercent(org: Organization, type: 'devices' | 'users'): number {
    if (type === 'devices') {
      return org.max_devices > 0
        ? Math.round((org.devices_count / org.max_devices) * 100)
        : 0;
    }
    return org.max_users > 0
      ? Math.round((org.users_count / org.max_users) * 100)
      : 0;
  }

  getUsageColor(percent: number): string {
    if (percent >= 90) return 'danger';
    if (percent >= 70) return 'warning';
    return 'success';
  }

  formatDate(date: string | undefined): string {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  trackByOrgId(index: number, org: Organization): number {
    return org.id!;
  }
}
