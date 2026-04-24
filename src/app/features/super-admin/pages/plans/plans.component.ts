import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import {
  CardComponent, CardBodyComponent, CardHeaderComponent,
  TableDirective, BadgeComponent,
  ButtonDirective, SpinnerComponent, RowComponent, ColComponent
} from '@coreui/angular';
import { IconDirective } from '@coreui/icons-angular';
import { SuperAdminService } from '../../services/super-admin.service';
import { Plan } from '../../models/plan.interface';
import { NotificationService } from '../../../../core/services/notification.service';

@Component({
  selector: 'app-plans',
  templateUrl: './plans.component.html',
  styleUrl: './plans.component.scss',
  standalone: true,
  imports: [
    CommonModule,
    CardComponent, CardBodyComponent, CardHeaderComponent,
    TableDirective, BadgeComponent,
    ButtonDirective, SpinnerComponent, RowComponent, ColComponent,
    IconDirective
  ]
})
export class PlansComponent implements OnInit, OnDestroy {
  private svc           = inject(SuperAdminService);
  private notifications = inject(NotificationService);
  private router        = inject(Router);
  private subs          = new Subscription();

  plans             = signal<Plan[]>([]);
  loading           = signal(true);
  companiesPerPlan  = signal<Map<string, number>>(new Map());

  ngOnInit(): void {
    this.subs.add(
      this.svc.getPlans().subscribe({
        next: (list) => {
          this.plans.set(list);
          this.loading.set(false);
        },
        error: (err) => {
          console.error('Error al cargar planes:', err);
          this.notifications.error('Error al cargar planes');
          this.loading.set(false);
        }
      })
    );

    this.subs.add(
      this.svc.getCompanies().subscribe({
        next: (companies) => {
          const map = new Map<string, number>();
          for (const c of companies) {
            if (c.planId) map.set(c.planId, (map.get(c.planId) ?? 0) + 1);
          }
          this.companiesPerPlan.set(map);
        },
        error: () => { /* non-critical */ }
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  openNew(): void {
    this.router.navigate(['/super-admin/plans/new']);
  }

  openEdit(plan: Plan): void {
    this.router.navigate(['/super-admin/plans', plan.id, 'edit']);
  }

  goToDetail(plan: Plan): void {
    this.router.navigate(['/super-admin/plans', plan.id]);
  }

  async deactivate(plan: Plan): Promise<void> {
    if (!confirm(`¿Desactivar el plan "${plan.name}"?`)) return;
    try {
      await this.svc.deactivatePlan(plan.id);
      this.notifications.success('Plan desactivado');
    } catch (err) {
      console.error('Error al desactivar el plan:', err);
      this.notifications.error('Error al desactivar el plan');
    }
  }

  formatLimit(value: number | undefined): string {
    if (value === undefined || value === null) return '—';
    return value === -1 ? '∞' : String(value);
  }

  companiesCount(planId: string): number {
    return this.companiesPerPlan().get(planId) ?? 0;
  }

  trackById(_: number, item: Plan): string { return item.id; }
}
