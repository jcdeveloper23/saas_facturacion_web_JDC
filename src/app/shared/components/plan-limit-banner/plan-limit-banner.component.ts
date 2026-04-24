import { Component, Input, computed, inject } from '@angular/core';
import { NgIf } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AlertComponent } from '@coreui/angular';
import { PlanLimitsService, LimitedResource } from '../../../core/services/plan-limits.service';

const RESOURCE_LABELS: Record<LimitedResource, string> = {
  invoices: 'facturas',
  retentions: 'retenciones',
  debitNotes: 'notas de débito',
  purchases: 'compras',
  personas: 'personas',
  products: 'productos',
  users: 'usuarios'
};

@Component({
  selector: 'app-plan-limit-banner',
  standalone: true,
  imports: [NgIf, RouterLink, AlertComponent],
  template: `
    @if (show()) {
      <c-alert [color]="over() ? 'danger' : 'warning'" [dismissible]="false">
        @if (over()) {
          Has alcanzado el límite de {{ limit() }} {{ label }} de tu plan.
        } @else {
          Estás usando el {{ pct() }}% de tus {{ limit() }} {{ label }} permitidos este mes.
        }
        <a routerLink="/settings/subscription"> Ver mi suscripción</a>
      </c-alert>
    }
  `
})
export class PlanLimitBannerComponent {
  @Input() resource!: LimitedResource;

  private planLimits = inject(PlanLimitsService);

  readonly pct = computed(() => this.planLimits.usagePercent(this.resource));
  readonly near = computed(() => this.planLimits.isNearLimit(this.resource));
  readonly over = computed(() => this.planLimits.isOverLimit(this.resource));
  readonly show = computed(() => this.near() || this.over());
  readonly limit = computed(() => this.planLimits.getLimit(this.resource));

  get label(): string {
    return RESOURCE_LABELS[this.resource] ?? this.resource;
  }
}
