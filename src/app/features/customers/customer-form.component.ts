import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import {
  FormBuilder, FormGroup, ReactiveFormsModule, Validators
} from '@angular/forms';
import {
  CardModule, ButtonModule, GridModule, BadgeModule, SpinnerModule,
  TableModule, FormModule, TooltipModule, AlertModule,
  NavModule, TabsModule, InputGroupComponent, InputGroupTextDirective, CalloutComponent
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';
import { take } from 'rxjs/operators';

import { CustomersService } from './services/customers.service';
import { SettingsService }  from '../settings/services/settings.service';
import { NotificationService } from '../../core/services/notification.service';
import { TenantService } from '../../core/services/tenant.service';
import { FormConfigService } from '../../core/services/form-config.service';
import {
  Customer, CustomerInput, CustomerAddress, CustomerBankAccount,
  TaxIdType, VatRegime
} from './models/customer.interface';
import { PaymentTerm } from '../settings/models/settings.interfaces';
import { EntityFormConfig } from '../../core/interfaces/form-config.interface';
import { FieldSection } from './models/customer-field-catalog';
import { ecuadorTaxIdValidator } from '../../core/validators/ecuador.validators';

const SECTION_LABELS: Record<FieldSection, string> = {
  fiscal:     'Identificación Fiscal',
  contact:    'Datos de Contacto',
  commercial: 'Condiciones Comerciales'
};

type FormTab = 'general' | 'addresses' | 'banks';

@Component({
  selector: 'app-customer-form',
  standalone: true,
  templateUrl: './customer-form.component.html',
  imports: [
    CommonModule, ReactiveFormsModule, RouterLink,
    CardModule, ButtonModule, GridModule, BadgeModule, SpinnerModule,
    TableModule, FormModule, TooltipModule, AlertModule,
    NavModule, TabsModule, IconModule,
    InputGroupComponent, InputGroupTextDirective, CalloutComponent
  ]
})
export class CustomerFormComponent implements OnInit {
  private svc           = inject(CustomersService);
  private settingsSvc   = inject(SettingsService);
  private notifications = inject(NotificationService);
  private tenantSvc     = inject(TenantService);
  private formConfigSvc = inject(FormConfigService);
  private fb            = inject(FormBuilder);
  private router        = inject(Router);
  private route         = inject(ActivatedRoute);

  // ─── State ──────────────────────────────────────────────────────────────

  customerId  = signal<string | null>(null);
  loading     = signal(true);
  saving      = signal(false);
  activeTab   = signal<FormTab>('general');
  errorMsg    = signal('');
  formConfig  = signal<EntityFormConfig>({ fields: {} });

  paymentTerms = signal<PaymentTerm[]>([]);

  // ─── Inline address management ───────────────────────────────────────────
  addresses       = signal<CustomerAddress[]>([]);
  showAddressForm = signal(false);
  editingAddrIdx  = signal<number | null>(null);
  addressForm!: FormGroup;

  // ─── Inline bank account management ──────────────────────────────────────
  bankAccounts   = signal<CustomerBankAccount[]>([]);
  showBankForm   = signal(false);
  editingBankIdx = signal<number | null>(null);
  bankForm!: FormGroup;

  // ─── Main form ───────────────────────────────────────────────────────────
  form!: FormGroup;

  readonly taxIdTypes: { value: TaxIdType; label: string }[] = [
    { value: 'RUC',       label: 'RUC' },
    { value: 'CI',        label: 'Cédula' },
    { value: 'PASAPORTE', label: 'Pasaporte' },
    { value: 'EXTERIOR',  label: 'Exterior' }
  ];

  readonly vatRegimes: { value: VatRegime; label: string }[] = [
    { value: 'General',    label: 'General' },
    { value: 'Especial',   label: 'Especial' },
    { value: 'Exportador', label: 'Exportador' },
    { value: 'No sujeto',  label: 'No sujeto' }
  ];

  get isEditing(): boolean { return !!this.customerId(); }

  // ─── Init ────────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.initForms();

    // Load payment terms (needed in the form selects)
    this.settingsSvc.getPaymentTerms().pipe(take(1)).subscribe({
      next: terms => this.paymentTerms.set(terms)
    });

    // Load form config for this company
    this.formConfigSvc.getConfig(this.tenantSvc.companyId, 'customers').then(cfg => {
      this.formConfig.set(cfg);
      this.applyDynamicValidators(cfg);
    });

    // Resolve edit vs new
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.customerId.set(id);
      this.svc.getCustomer(id).then(customer => {
        if (!customer) { this.router.navigate(['/customers']); return; }
        this.patchForm(customer);
        this.loading.set(false);
      });
    } else {
      this.loading.set(false);
    }
  }

  /** Apply required validators from form config to optional fields */
  private applyDynamicValidators(cfg: EntityFormConfig): void {
    const optionalFields = [
      'contactPerson', 'email', 'phone1', 'phone2', 'web',
      'paymentDays', 'creditLimit', 'notes', 'vatRegime'
    ];
    for (const key of optionalFields) {
      const ctrl = this.form.get(key);
      if (!ctrl) continue;
      if (this.formConfigSvc.isRequired(cfg, key, 'customers')) {
        ctrl.addValidators(Validators.required);
      } else {
        ctrl.removeValidators(Validators.required);
      }
      ctrl.updateValueAndValidity({ emitEvent: false });
    }
  }

  // ─── Template helpers for dynamic visibility ──────────────────────────────

  isVisible(key: string): boolean {
    return this.formConfigSvc.isVisible(this.formConfig(), key, 'customers');
  }

  isRequired(key: string): boolean {
    return this.formConfigSvc.isRequired(this.formConfig(), key, 'customers');
  }

  fieldLabel(key: string): string {
    return this.formConfigSvc.getLabel(this.formConfig(), key, 'customers');
  }

  sectionLabel(section: FieldSection): string {
    return SECTION_LABELS[section];
  }

  private initForms(): void {
    this.form = this.fb.group({
      // Required
      taxIdType:      ['RUC',     Validators.required],
      taxId:          ['',        [Validators.required, ecuadorTaxIdValidator('taxIdType')]],
      name:           ['',        Validators.required],
      legalName:      ['',        Validators.required],
      currency:       ['USD',     Validators.required],
      paymentTermCode:['CONT',    Validators.required],
      vatRegime:      ['General', Validators.required],
      isActive:       [true],
      isCompany:      [false],
      // Optional — no validators
      contactPerson:  [''],
      email:          [''],
      phone1:         [''],
      phone2:         [''],
      web:            [''],
      paymentDays:    [null],
      creditLimit:    [null],
      notes:          ['']
    });

    // Re-validate taxId when taxIdType changes
    this.form.get('taxIdType')?.valueChanges.subscribe(() =>
      this.form.get('taxId')?.updateValueAndValidity()
    );

    this.addressForm = this.fb.group({
      label:      ['Principal', Validators.required],
      country:    ['ECU'],
      province:   ['', Validators.required],
      city:       ['', Validators.required],
      address:    [''],
      postalCode: [''],
      isShipping: [true],
      isBilling:  [true]
    });

    this.bankForm = this.fb.group({
      label:      ['', Validators.required],
      bank:       [''],
      branch:     [''],
      iban:       [''],
      swift:      [''],
      isPrimary:  [false],
      mandateDate:['']
    });
  }

  private patchForm(c: Customer): void {
    this.form.patchValue({
      taxIdType:      c.taxIdType,
      taxId:          c.taxId,
      isCompany:      c.isCompany,
      name:           c.name,
      legalName:      c.legalName,
      contactPerson:  c.contactPerson  ?? '',
      email:          c.email          ?? '',
      phone1:         c.phone1         ?? '',
      phone2:         c.phone2         ?? '',
      web:            c.web            ?? '',
      currency:       c.currency,
      paymentTermCode:c.paymentTermCode,
      paymentDays:    c.paymentDays    ?? null,
      vatRegime:      c.vatRegime,
      creditLimit:    c.creditLimit    ?? null,
      notes:          c.notes          ?? '',
      isActive:       c.isActive
    });
    this.addresses.set([...(c.addresses    ?? [])]);
    this.bankAccounts.set([...(c.bankAccounts ?? [])]);
  }

  // ─── Save ────────────────────────────────────────────────────────────────

  async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.activeTab.set('general');
      this.errorMsg.set('Corrija los errores antes de continuar.');
      return;
    }
    this.saving.set(true);
    this.errorMsg.set('');
    try {
      const v = this.form.getRawValue();
      // Build data — only include optional fields when they have a value
      const data: CustomerInput = {
        taxIdType:      v.taxIdType,
        taxId:          v.taxId.trim(),
        isCompany:      v.isCompany,
        name:           v.name.trim(),
        legalName:      v.legalName.trim(),
        currency:       v.currency,
        paymentTermCode:v.paymentTermCode,
        vatRegime:      v.vatRegime,
        isActive:       v.isActive,
        addresses:      this.addresses(),
        bankAccounts:   this.bankAccounts(),
        // Optional — only set when non-empty (service will clean anyway)
        ...(v.contactPerson?.trim() && { contactPerson: v.contactPerson.trim() }),
        ...(v.email?.trim()         && { email:         v.email.trim() }),
        ...(v.phone1?.trim()        && { phone1:        v.phone1.trim() }),
        ...(v.phone2?.trim()        && { phone2:        v.phone2.trim() }),
        ...(v.web?.trim()           && { web:           v.web.trim() }),
        ...(v.paymentDays != null   && { paymentDays:   v.paymentDays }),
        ...(v.creditLimit != null   && { creditLimit:   v.creditLimit }),
        ...(v.notes?.trim()         && { notes:         v.notes.trim() })
      };

      const id = this.customerId();
      if (id) {
        await this.svc.updateCustomer(id, data);
        this.notifications.success('Cliente actualizado');
      } else {
        await this.svc.createCustomer(data);
        this.notifications.success('Cliente creado');
      }
      this.router.navigate(['/customers']);
    } catch (err: any) {
      this.errorMsg.set(err?.message ?? 'Error al guardar');
    } finally {
      this.saving.set(false);
    }
  }

  cancel(): void {
    this.router.navigate(['/customers']);
  }

  // ─── Address inline CRUD ─────────────────────────────────────────────────

  openAddAddress(): void {
    this.editingAddrIdx.set(null);
    this.addressForm.reset({ label: 'Principal', country: 'ECU', isShipping: true, isBilling: true });
    this.showAddressForm.set(true);
  }

  openEditAddress(idx: number): void {
    this.editingAddrIdx.set(idx);
    this.addressForm.patchValue(this.addresses()[idx]);
    this.showAddressForm.set(true);
  }

  saveAddress(): void {
    this.addressForm.markAllAsTouched();
    if (this.addressForm.invalid) return;
    const v = this.addressForm.getRawValue();
    const addr: CustomerAddress = {
      id:         this.addresses()[this.editingAddrIdx() ?? -1]?.id ?? crypto.randomUUID(),
      label:      v.label,
      country:    v.country || 'ECU',
      province:   v.province,
      city:       v.city,
      isShipping: v.isShipping,
      isBilling:  v.isBilling,
      ...(v.address    && { address:    v.address }),
      ...(v.postalCode && { postalCode: v.postalCode })
    };
    const idx = this.editingAddrIdx();
    this.addresses.update(list =>
      idx !== null ? list.map((a, i) => i === idx ? addr : a) : [...list, addr]
    );
    this.showAddressForm.set(false);
    this.editingAddrIdx.set(null);
  }

  deleteAddress(idx: number): void {
    this.addresses.update(list => list.filter((_, i) => i !== idx));
    if (this.editingAddrIdx() === idx) this.showAddressForm.set(false);
  }

  // ─── Bank account inline CRUD ────────────────────────────────────────────

  openAddBank(): void {
    this.editingBankIdx.set(null);
    this.bankForm.reset({ isPrimary: false });
    this.showBankForm.set(true);
  }

  openEditBank(idx: number): void {
    this.editingBankIdx.set(idx);
    this.bankForm.patchValue(this.bankAccounts()[idx]);
    this.showBankForm.set(true);
  }

  saveBank(): void {
    this.bankForm.markAllAsTouched();
    if (this.bankForm.invalid) return;
    const v = this.bankForm.getRawValue();
    const acc: CustomerBankAccount = {
      id:        this.bankAccounts()[this.editingBankIdx() ?? -1]?.id ?? crypto.randomUUID(),
      label:     v.label,
      isPrimary: v.isPrimary,
      ...(v.bank        && { bank:        v.bank }),
      ...(v.branch      && { branch:      v.branch }),
      ...(v.iban        && { iban:        v.iban }),
      ...(v.swift       && { swift:       v.swift }),
      ...(v.mandateDate && { mandateDate: v.mandateDate })
    };
    const idx = this.editingBankIdx();
    this.bankAccounts.update(list =>
      idx !== null ? list.map((a, i) => i === idx ? acc : a) : [...list, acc]
    );
    this.showBankForm.set(false);
    this.editingBankIdx.set(null);
  }

  deleteBank(idx: number): void {
    this.bankAccounts.update(list => list.filter((_, i) => i !== idx));
    if (this.editingBankIdx() === idx) this.showBankForm.set(false);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  hasError(fg: FormGroup, field: string): boolean {
    const c = fg.get(field);
    return !!(c?.invalid && c?.touched);
  }
}
