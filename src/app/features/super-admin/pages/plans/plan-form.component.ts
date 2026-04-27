import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subscription } from 'rxjs';
import {
  CardComponent, CardBodyComponent, CardHeaderComponent, CardFooterComponent,
  ButtonDirective, SpinnerComponent, RowComponent, ColComponent,
  FormLabelDirective, FormControlDirective, FormSelectDirective,
  AlertComponent, BadgeComponent,
  AccordionComponent, AccordionItemComponent, AccordionButtonDirective,
  TemplateIdDirective,
  FormCheckComponent, FormCheckInputDirective, FormCheckLabelDirective
} from '@coreui/angular';
import { IconDirective } from '@coreui/icons-angular';
import { SuperAdminService } from '../../services/super-admin.service';
import { Plan, PlanFormData } from '../../models/plan.interface';
import { NotificationService } from '../../../../core/services/notification.service';
import { PluginPackagesService } from '../../../../core/services/plugin-packages.service';
import { PluginPackage } from '../../../../core/interfaces/permission.interface';

@Component({
  selector: 'app-plan-form',
  templateUrl: './plan-form.component.html',
  styleUrl: './plan-form.component.scss',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    CardComponent, CardBodyComponent, CardHeaderComponent, CardFooterComponent,
    ButtonDirective, SpinnerComponent, RowComponent, ColComponent,
    FormLabelDirective, FormControlDirective, FormSelectDirective,
    AlertComponent, BadgeComponent,
    AccordionComponent, AccordionItemComponent, AccordionButtonDirective,
    TemplateIdDirective,
    FormCheckComponent, FormCheckInputDirective, FormCheckLabelDirective,
    IconDirective
  ]
})
export class PlanFormComponent implements OnInit, OnDestroy {
  private svc           = inject(SuperAdminService);
  private pkgSvc        = inject(PluginPackagesService);
  private notifications = inject(NotificationService);
  private fb            = inject(FormBuilder);
  private router        = inject(Router);
  private route         = inject(ActivatedRoute);
  private subs          = new Subscription();

  editingId        = signal<string | null>(null);
  saving           = signal(false);
  errorMessage     = signal('');
  availablePackages = signal<PluginPackage[]>([]);

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
      // Módulos de negocio
      electronicInvoicing:  [true],
      purchasesModule:      [true],
      accountingModule:     [false],
      stockModule:          [false],
      teamManagementModule: [false],
      publicCatalogModule:  [true],
      publicApiModule:      [false],
      // Nivel de servicio
      prioritySupport:      [false],
      betaAccess:           [false],
      multiCompanyMode:     [false]
    }),
    includedPackages: [[] as string[]]
  });

  ngOnInit(): void {
    // Cargar catálogo de paquetes
    this.subs.add(
      this.pkgSvc.getPackages(true).subscribe({
        next: (pkgs) => {
          this.availablePackages.set([...pkgs].sort((a, b) => (a.order ?? 99) - (b.order ?? 99)));
        },
        error: () => console.error('Error cargando paquetes')
      })
    );

    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;

    this.editingId.set(id);
    this.subs.add(
      this.svc.getPlans().subscribe({
        next: (list) => {
          const plan = list.find(p => p.id === id);
          if (plan) this.patchForm(plan);
          else this.router.navigate(['/super-admin/plans']);
        },
        error: () => this.router.navigate(['/super-admin/plans'])
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  private patchForm(plan: Plan): void {
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
        sri:          plan.limits?.sri          ?? {},
        masterData:   plan.limits?.masterData   ?? {},
        users:        plan.limits?.users        ?? {},
        multiCompany: plan.limits?.multiCompany ?? {},
        operations:   plan.limits?.operations   ?? {},
        infra:        plan.limits?.infra        ?? {}
      },
      features:          plan.features           ?? {},
      includedPackages:  (plan.includedPackages ?? []) as string[]
    });
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
        includedPackages: (v.includedPackages ?? []) as string[]
      };

      const id = this.editingId();
      if (id) {
        await this.svc.updatePlan(id, data);
        this.notifications.success('Plan actualizado');
      } else {
        await this.svc.createPlan(data);
        this.notifications.success('Plan creado');
      }
      this.router.navigate(['/super-admin/plans']);
    } catch (err: unknown) {
      console.error('Error al guardar el plan:', err);
      this.errorMessage.set(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      this.saving.set(false);
    }
  }

  togglePackage(code: string): void {
    const current = (this.form.get('includedPackages')?.value as string[]) ?? [];
    const idx = current.indexOf(code);
    if (idx >= 0) {
      this.form.get('includedPackages')?.setValue(current.filter(c => c !== code));
    } else {
      this.form.get('includedPackages')?.setValue([...current, code]);
    }
  }

  isPackageSelected(code: string): boolean {
    const current = (this.form.get('includedPackages')?.value as string[]) ?? [];
    return current.includes(code);
  }

  canSelectPackage(pkg: PluginPackage): boolean {
    if (!pkg.dependencies?.length) return true;
    const selected = (this.form.get('includedPackages')?.value as string[]) ?? [];
    return pkg.dependencies.every(dep => selected.includes(dep));
  }

  cancel(): void {
    this.router.navigate(['/super-admin/plans']);
  }

  hasError(field: string): boolean {
    const ctrl = this.form.get(field);
    return !!(ctrl?.invalid && ctrl?.touched);
  }
}
