import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subscription } from 'rxjs';
import {
  CardComponent, CardBodyComponent, CardHeaderComponent,
  TableDirective, BadgeComponent,
  ButtonDirective, SpinnerComponent, RowComponent, ColComponent,
  ModalComponent, ModalHeaderComponent, ModalBodyComponent, ModalFooterComponent,
  ModalTitleDirective, ButtonCloseDirective,
  FormLabelDirective, FormControlDirective, FormSelectDirective,
  AlertComponent,
  AccordionComponent, AccordionItemComponent, AccordionButtonDirective,
  TemplateIdDirective,
  FormCheckComponent, FormCheckInputDirective, FormCheckLabelDirective
} from '@coreui/angular';
import { IconDirective } from '@coreui/icons-angular';
import { SuperAdminService } from '../../services/super-admin.service';
import { Plan, PlanFormData } from '../../models/plan.interface';
import { NotificationService } from '../../../../core/services/notification.service';

@Component({
  selector: 'app-plans',
  templateUrl: './plans.component.html',
  styleUrl: './plans.component.scss',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    CardComponent, CardBodyComponent, CardHeaderComponent,
    TableDirective, BadgeComponent,
    ButtonDirective, SpinnerComponent, RowComponent, ColComponent,
    ModalComponent, ModalHeaderComponent, ModalBodyComponent, ModalFooterComponent,
    ModalTitleDirective, ButtonCloseDirective,
    FormLabelDirective, FormControlDirective, FormSelectDirective,
    AlertComponent,
    AccordionComponent, AccordionItemComponent, AccordionButtonDirective,
    TemplateIdDirective,
    FormCheckComponent, FormCheckInputDirective, FormCheckLabelDirective,
    IconDirective
  ]
})
export class PlansComponent implements OnInit, OnDestroy {
  private svc = inject(SuperAdminService);
  private notifications = inject(NotificationService);
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private subs = new Subscription();

  plans = signal<Plan[]>([]);
  loading = signal(true);
  showModal = signal(false);
  saving = signal(false);
  editingId = signal<string | null>(null);
  errorMessage = signal('');
  companiesPerPlan = signal<Map<string, number>>(new Map());

  form = this.fb.group({
    name:          ['', [Validators.required, Validators.minLength(2)]],
    description:   ['', Validators.required],
    priceMonthly:  [0,  [Validators.required, Validators.min(0)]],
    priceYearly:   [0,  [Validators.required, Validators.min(0)]],
    billingPeriod: ['monthly', Validators.required],
    trialDays:     [0,  [Validators.required, Validators.min(0)]],
    sortOrder:     [99, [Validators.required, Validators.min(1)]],
    isActive:      [true],
    isPublic:      [true],
    badge:         [''],
    limits: this.fb.group({
      sri: this.fb.group({
        invoicesPerMonth:     [100],
        invoicesPerYear:      [-1],
        creditNotesPerMonth:  [-1],
        debitNotesPerMonth:   [0],
        retentionsPerMonth:   [0],
        purchasesPerMonth:    [-1],
        remissionsPerMonth:   [0],
        totalSriDocsPerMonth: [-1]
      }),
      masterData: this.fb.group({
        personasTotal:        [-1],
        customersTotal:       [-1],
        suppliersTotal:       [-1],
        employeesTotal:       [0],
        productsTotal:        [-1],
        familiesTotal:        [-1],
        manufacturersTotal:   [-1],
        warehousesTotal:      [1, [Validators.required, Validators.min(1)]],
        costCentersTotal:     [0],
        priceListsTotal:      [0]
      }),
      users: this.fb.group({
        activeUsersPerCompany:     [5, [Validators.required, Validators.min(1)]],
        customRolesPerCompany:     [0],
        concurrentSessionsPerUser: [-1]
      }),
      multiCompany: this.fb.group({
        companiesPerAccount: [1, [Validators.required, Validators.min(1)]]
      }),
      operations: this.fb.group({
        activeProjectsTotal:     [0],
        tasksPerMonth:           [0],
        exportsPerMonth:         [-1],
        scheduledReportsTotal:   [0],
        activeIntegrationsTotal: [0],
        apiCallsPerMonth:        [0]
      }),
      infra: this.fb.group({
        storageGb:             [1, [Validators.required, Validators.min(0)]],
        documentHistoryMonths: [12],
        usageHistoryMonths:    [6]
      })
    }),
    features: this.fb.group({
      electronicInvoicing:    [true],
      purchasesModule:        [true],
      accountingModule:       [false],
      stockModule:            [false],
      teamManagementModule:   [false],
      publicCatalogModule:    [true],
      publicApiModule:        [false],
      prioritySupport:        [false],
      betaAccess:             [false],
      multiCompanyMode:       [false]
    }),
    includedModules: [[]]
  });

  ngOnInit(): void {
    this.subs.add(
      this.svc.getPlans().subscribe({
        next: (list) => {
          this.plans.set(list);
          this.loading.set(false);
        },
        error: (err) => {
          console.error('Error al cargar planes:', JSON.stringify(err, null, 2), err);
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
            if (c.planId) {
              map.set(c.planId, (map.get(c.planId) ?? 0) + 1);
            }
          }
          this.companiesPerPlan.set(map);
        },
        error: () => { /* silencioso — no crítico */ }
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  openNew(): void {
    this.editingId.set(null);
    this.form.reset({
      name: '', description: '',
      priceMonthly: 0, priceYearly: 0,
      billingPeriod: 'monthly',
      trialDays: 0, sortOrder: 99,
      isActive: true, isPublic: true, badge: '',
      limits: {
        sri: {
          invoicesPerMonth: 100, invoicesPerYear: -1,
          creditNotesPerMonth: -1, debitNotesPerMonth: 0,
          retentionsPerMonth: 0, purchasesPerMonth: -1,
          remissionsPerMonth: 0, totalSriDocsPerMonth: -1
        },
        masterData: {
          personasTotal: -1, customersTotal: -1, suppliersTotal: -1,
          employeesTotal: 0, productsTotal: -1, familiesTotal: -1,
          manufacturersTotal: -1, warehousesTotal: 1,
          costCentersTotal: 0, priceListsTotal: 0
        },
        users: {
          activeUsersPerCompany: 5, customRolesPerCompany: 0,
          concurrentSessionsPerUser: -1
        },
        multiCompany: { companiesPerAccount: 1 },
        operations: {
          activeProjectsTotal: 0, tasksPerMonth: 0,
          exportsPerMonth: -1, scheduledReportsTotal: 0,
          activeIntegrationsTotal: 0, apiCallsPerMonth: 0
        },
        infra: { storageGb: 1, documentHistoryMonths: 12, usageHistoryMonths: 6 }
      },
      features: {
        electronicInvoicing: true, purchasesModule: true,
        accountingModule: false, stockModule: false,
        teamManagementModule: false, publicCatalogModule: true,
        publicApiModule: false, prioritySupport: false,
        betaAccess: false, multiCompanyMode: false
      },
      includedModules: []
    });
    this.errorMessage.set('');
    this.showModal.set(true);
  }

  openEdit(plan: Plan): void {
    this.editingId.set(plan.id);
    this.form.patchValue({
      name: plan.name,
      description: plan.description,
      priceMonthly: plan.priceMonthly,
      priceYearly: plan.priceYearly,
      billingPeriod: plan.billingPeriod,
      trialDays: plan.trialDays,
      sortOrder: plan.sortOrder,
      isActive: plan.isActive,
      isPublic: plan.isPublic,
      badge: plan.badge ?? '',
      limits: {
        sri: plan.limits?.sri ?? {},
        masterData: plan.limits?.masterData ?? {},
        users: plan.limits?.users ?? {},
        multiCompany: plan.limits?.multiCompany ?? {},
        operations: plan.limits?.operations ?? {},
        infra: plan.limits?.infra ?? {}
      },
      features: plan.features ?? {},
      includedModules: plan.includedModules ?? []
    });
    this.errorMessage.set('');
    this.showModal.set(true);
  }

  closeModal(): void {
    this.showModal.set(false);
  }

  goToDetail(plan: Plan): void {
    this.router.navigate(['/super-admin/plans', plan.id]);
  }

  async save(): Promise<void> {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    this.errorMessage.set('');
    try {
      const v = this.form.getRawValue();
      const data: PlanFormData = {
        name:          v.name!,
        description:   v.description!,
        priceMonthly:  Number(v.priceMonthly),
        priceYearly:   Number(v.priceYearly),
        billingPeriod: v.billingPeriod as any,
        trialDays:     Number(v.trialDays),
        sortOrder:     Number(v.sortOrder),
        isActive:      v.isActive!,
        isPublic:      v.isPublic!,
        badge:         v.badge ?? '',
        limits: {
          sri: {
            invoicesPerMonth:     Number(v.limits!.sri!.invoicesPerMonth),
            invoicesPerYear:      Number(v.limits!.sri!.invoicesPerYear),
            creditNotesPerMonth:  Number(v.limits!.sri!.creditNotesPerMonth),
            debitNotesPerMonth:   Number(v.limits!.sri!.debitNotesPerMonth),
            retentionsPerMonth:   Number(v.limits!.sri!.retentionsPerMonth),
            purchasesPerMonth:    Number(v.limits!.sri!.purchasesPerMonth),
            remissionsPerMonth:   Number(v.limits!.sri!.remissionsPerMonth),
            totalSriDocsPerMonth: Number(v.limits!.sri!.totalSriDocsPerMonth)
          },
          masterData: {
            personasTotal:        Number(v.limits!.masterData!.personasTotal),
            customersTotal:       Number(v.limits!.masterData!.customersTotal),
            suppliersTotal:       Number(v.limits!.masterData!.suppliersTotal),
            employeesTotal:       Number(v.limits!.masterData!.employeesTotal),
            productsTotal:        Number(v.limits!.masterData!.productsTotal),
            familiesTotal:        Number(v.limits!.masterData!.familiesTotal),
            manufacturersTotal:   Number(v.limits!.masterData!.manufacturersTotal),
            warehousesTotal:      Number(v.limits!.masterData!.warehousesTotal),
            costCentersTotal:     Number(v.limits!.masterData!.costCentersTotal),
            priceListsTotal:      Number(v.limits!.masterData!.priceListsTotal)
          },
          users: {
            activeUsersPerCompany:     Number(v.limits!.users!.activeUsersPerCompany),
            customRolesPerCompany:     Number(v.limits!.users!.customRolesPerCompany),
            concurrentSessionsPerUser: Number(v.limits!.users!.concurrentSessionsPerUser)
          },
          multiCompany: {
            companiesPerAccount: Number(v.limits!.multiCompany!.companiesPerAccount)
          },
          operations: {
            activeProjectsTotal:     Number(v.limits!.operations!.activeProjectsTotal),
            tasksPerMonth:           Number(v.limits!.operations!.tasksPerMonth),
            exportsPerMonth:         Number(v.limits!.operations!.exportsPerMonth),
            scheduledReportsTotal:   Number(v.limits!.operations!.scheduledReportsTotal),
            activeIntegrationsTotal: Number(v.limits!.operations!.activeIntegrationsTotal),
            apiCallsPerMonth:        Number(v.limits!.operations!.apiCallsPerMonth)
          },
          infra: {
            storageGb:             Number(v.limits!.infra!.storageGb),
            documentHistoryMonths: Number(v.limits!.infra!.documentHistoryMonths),
            usageHistoryMonths:    Number(v.limits!.infra!.usageHistoryMonths)
          }
        },
        features: {
          electronicInvoicing:  v.features!.electronicInvoicing!,
          purchasesModule:      v.features!.purchasesModule!,
          accountingModule:     v.features!.accountingModule!,
          stockModule:          v.features!.stockModule!,
          teamManagementModule: v.features!.teamManagementModule!,
          publicCatalogModule:  v.features!.publicCatalogModule!,
          publicApiModule:      v.features!.publicApiModule!,
          prioritySupport:      v.features!.prioritySupport!,
          betaAccess:           v.features!.betaAccess!,
          multiCompanyMode:     v.features!.multiCompanyMode!
        },
        includedModules: (v.includedModules as string[]) ?? []
      };

      const id = this.editingId();
      if (id) {
        await this.svc.updatePlan(id, data);
        this.notifications.success('Plan actualizado');
      } else {
        await this.svc.createPlan(data);
        this.notifications.success('Plan creado');
      }
      this.showModal.set(false);
    } catch (err: unknown) {
      console.error('Error al guardar el plan:', JSON.stringify(err, null, 2), err);
      this.errorMessage.set(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      this.saving.set(false);
    }
  }

  async deactivate(plan: Plan): Promise<void> {
    if (!confirm(`¿Desactivar el plan "${plan.name}"?`)) return;
    try {
      await this.svc.deactivatePlan(plan.id);
      this.notifications.success('Plan desactivado');
    } catch (err) {
      console.error('Error al desactivar el plan:', JSON.stringify(err, null, 2), err);
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

  hasError(field: string): boolean {
    const ctrl = this.form.get(field);
    return !!(ctrl?.invalid && ctrl?.touched);
  }

  trackById(_: number, item: Plan): string { return item.id; }
}
