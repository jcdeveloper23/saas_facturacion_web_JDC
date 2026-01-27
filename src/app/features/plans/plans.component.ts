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
  AlertModule,
  SpinnerModule,
  DropdownModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';

import { PlansService } from '../../core/services/plans.service';
import { Plan } from '../../core/interfaces';
import { HasPermissionDirective } from '../../shared/directives/has-permission.directive';
import { PlanFormComponent } from './components/plan-form/plan-form.component';

@Component({
  selector: 'app-plans',
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
    AlertModule,
    SpinnerModule,
    DropdownModule,
    IconModule,
    HasPermissionDirective,
    PlanFormComponent
  ],
  templateUrl: './plans.component.html',
  styleUrl: './plans.component.scss'
})
export class PlansComponent implements OnInit {
  private plansService = inject(PlansService);

  // State
  plans = signal<Plan[]>([]);
  isLoading = signal(false);
  error = signal<string | null>(null);

  // Filters
  showInactive = signal(false);

  // Modal states
  showFormModal = signal(false);
  selectedPlan = signal<Plan | null>(null);
  isEditMode = signal(false);

  // Computed
  filteredPlans = computed(() => {
    let items = this.plans();
    if (!this.showInactive()) {
      items = items.filter(p => p.is_active);
    }
    return items.sort((a, b) => a.sort_order - b.sort_order);
  });

  summary = computed(() => {
    const all = this.plans();
    return {
      total: all.length,
      active: all.filter(p => p.is_active).length,
      public: all.filter(p => p.is_public).length,
      withTrial: all.filter(p => p.trial_days > 0).length
    };
  });

  ngOnInit(): void {
    this.loadPlans();
  }

  loadPlans(): void {
    this.isLoading.set(true);
    this.error.set(null);

    this.plansService.getAllPlans({ $limit: 100 }).subscribe({
      next: (response) => {
        this.plans.set(response.data || []);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.error.set('Error al cargar los planes');
        this.isLoading.set(false);
        console.error('Error loading plans:', err);
      }
    });
  }

  // ==========================================================================
  // CRUD OPERATIONS
  // ==========================================================================

  openCreateModal(): void {
    this.selectedPlan.set(null);
    this.isEditMode.set(false);
    this.showFormModal.set(true);
  }

  openEditModal(plan: Plan): void {
    this.selectedPlan.set(plan);
    this.isEditMode.set(true);
    this.showFormModal.set(true);
  }

  closeFormModal(): void {
    this.showFormModal.set(false);
    this.selectedPlan.set(null);
  }

  onFormSaved(): void {
    this.closeFormModal();
    this.loadPlans();
  }

  // ==========================================================================
  // ACTIONS
  // ==========================================================================

  toggleActive(plan: Plan): void {
    this.plansService.toggleActive(plan.id!, !plan.is_active).subscribe({
      next: () => this.loadPlans(),
      error: (err) => {
        console.error('Error toggling active:', err);
        this.error.set('Error al cambiar el estado del plan');
      }
    });
  }

  togglePublic(plan: Plan): void {
    this.plansService.togglePublic(plan.id!, !plan.is_public).subscribe({
      next: () => this.loadPlans(),
      error: (err) => {
        console.error('Error toggling public:', err);
        this.error.set('Error al cambiar la visibilidad del plan');
      }
    });
  }

  togglePopular(plan: Plan): void {
    this.plansService.setPopular(plan.id!, !plan.is_popular).subscribe({
      next: () => this.loadPlans(),
      error: (err) => {
        console.error('Error toggling popular:', err);
        this.error.set('Error al cambiar el badge popular');
      }
    });
  }

  deletePlan(plan: Plan): void {
    if (confirm(`¿Está seguro de eliminar el plan "${plan.name}"? Esta acción no se puede deshacer.`)) {
      this.plansService.remove(plan.id!).subscribe({
        next: () => this.loadPlans(),
        error: (err) => {
          console.error('Error deleting plan:', err);
          this.error.set('Error al eliminar el plan. Puede que tenga organizaciones asociadas.');
        }
      });
    }
  }

  moveUp(plan: Plan): void {
    const currentIndex = this.filteredPlans().findIndex(p => p.id === plan.id);
    if (currentIndex > 0) {
      const newOrder = plan.sort_order - 1;
      this.plansService.updateSortOrder(plan.id!, newOrder).subscribe({
        next: () => this.loadPlans(),
        error: (err) => console.error('Error updating order:', err)
      });
    }
  }

  moveDown(plan: Plan): void {
    const plans = this.filteredPlans();
    const currentIndex = plans.findIndex(p => p.id === plan.id);
    if (currentIndex < plans.length - 1) {
      const newOrder = plan.sort_order + 1;
      this.plansService.updateSortOrder(plan.id!, newOrder).subscribe({
        next: () => this.loadPlans(),
        error: (err) => console.error('Error updating order:', err)
      });
    }
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  formatPrice(price: number, currency: string): string {
    if (price === 0) return 'Gratis';
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: currency
    }).format(price);
  }

  formatFeatures(features: Plan['features']): string {
    if (!features) return '-';
    const enabled = Object.entries(features)
      .filter(([_, value]) => value === true)
      .map(([key]) => this.getFeatureLabel(key));
    return enabled.length > 0 ? enabled.join(', ') : 'Ninguna';
  }

  getFeatureLabel(key: string): string {
    const labels: Record<string, string> = {
      real_time_tracking: 'Tiempo Real',
      geofences: 'Geocercas',
      alerts: 'Alertas',
      reports: 'Reportes',
      api_access: 'API',
      white_label: 'White Label',
      custom_integrations: 'Integraciones',
      priority_support: 'Soporte Prioritario',
      dedicated_account_manager: 'Account Manager'
    };
    return labels[key] || key;
  }

  getEnabledFeaturesCount(features: Plan['features']): number {
    if (!features) return 0;
    return Object.values(features).filter(v => v === true).length;
  }

  trackByPlanId(index: number, plan: Plan): number {
    return plan.id!;
  }
}
