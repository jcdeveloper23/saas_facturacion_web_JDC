import { Component, OnInit, inject, signal, computed } from '@angular/core';
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

import { PersonasService, PersonCreateInput, PersonUpdateInput } from './services/personas.service';
import { SettingsService }    from '../settings/services/settings.service';
import { NotificationService } from '../../core/services/notification.service';
import { TenantService }       from '../../core/services/tenant.service';
import { FormConfigService }   from '../../core/services/form-config.service';
import { PersonaExtensionsService } from '../../core/services/persona-extensions.service';
import { SchoolInstitutionService } from '../school-bar/services/school-institution.service';
import { SchoolAllergenService }    from '../school-bar/services/school-allergen.service';
import { SchoolGrade, SchoolAllergen } from '../school-bar/models';
import {
  Person, PersonAddress, PersonBankAccount,
  PersonRole, TaxIdType, VatRegime, ContractType,
  ROLE_LABELS, ROLE_COLORS, ALL_ROLES
} from './models/person.interface';
import { PaymentTerm, Currency, DocumentSeries } from '../settings/models/settings.interfaces';
import { EntityFormConfig } from '../../core/interfaces/form-config.interface';
import { ecuadorTaxIdValidator } from '../../core/validators/ecuador.validators';
import { SupplierPurchasesTabComponent } from './supplier-purchases-tab.component';
import { CostCentersService } from '../accounting/services/cost-centers.service';
import { CostCenter } from '../accounting/models/cost-center.interface';

type FormTab = 'general' | 'addresses' | 'banks' | 'purchases';

const CONTRACT_TYPES: { value: ContractType; label: string }[] = [
  { value: 'indefinido',  label: 'Indefinido' },
  { value: 'plazo_fijo',  label: 'Plazo Fijo' },
  { value: 'honorarios',  label: 'Honorarios Profesionales' },
  { value: 'obra_cierta', label: 'Obra Cierta' }
];

@Component({
  selector: 'app-person-form',
  standalone: true,
  templateUrl: './person-form.component.html',
  styles: [`
    /* ── Page header ────────────────────────────────────────────── */
    .page-header {
      display:flex; align-items:center; justify-content:space-between;
      margin-bottom:1rem; gap:1rem;
    }
    .page-header-left { display:flex; align-items:center; gap:.75rem; }
    .page-icon {
      width:34px; height:34px; border-radius:8px;
      background:var(--cui-info-bg-subtle);
      display:flex; align-items:center; justify-content:center;
      color:var(--cui-info); flex-shrink:0;
    }
    .page-title  { font-size:.95rem; font-weight:500; margin:0; }
    .page-sub    { font-size:.75rem; color:var(--cui-secondary-color); margin:0; }

    /* ── Section headings ───────────────────────────────────────── */
    .section-title {
      font-size:.68rem; font-weight:500; text-transform:uppercase;
      letter-spacing:.06em; color:var(--cui-secondary-color);
      margin:0 0 .75rem; padding-bottom:.35rem;
      border-bottom:1px solid var(--cui-border-color);
    }

    /* ── Role toggle buttons ────────────────────────────────────── */
    .role-toggle {
      display:inline-flex; align-items:center; gap:.35rem;
      padding:.3rem .75rem; border-radius:99px; cursor:pointer;
      font-size:.8rem; font-weight:400;
      border:1px solid var(--cui-border-color);
      background:transparent; color:var(--cui-secondary-color);
      transition:all .12s;
    }
    .role-toggle--active-customer { background:var(--cui-info-bg-subtle);      color:var(--cui-info);        border-color:var(--cui-info-border-subtle); }
    .role-toggle--active-supplier { background:var(--cui-warning-bg-subtle);   color:var(--cui-warning);     border-color:var(--cui-warning-border-subtle); }
    .role-toggle--active-employee { background:var(--cui-success-bg-subtle);   color:var(--cui-success);     border-color:var(--cui-success-border-subtle); }
    .role-toggle--active-contact  { background:var(--cui-info-bg-subtle);      color:var(--cui-info);        border-color:var(--cui-info-border-subtle); }
    .role-toggle--active-other    { background:var(--cui-secondary-bg);        color:var(--cui-body-color);  border-color:var(--cui-border-color); }
    /* Roles de extensión (pkg_school_bar) */
    .role-toggle--active-student  { background:var(--cui-primary-bg-subtle);   color:var(--cui-primary);     border-color:var(--cui-primary-border-subtle); }
    .role-toggle--active-teacher  { background:var(--cui-success-bg-subtle);   color:var(--cui-success);     border-color:var(--cui-success-border-subtle); }

    /* ── Allergen chips ─────────────────────────────────────────── */
    .allergen-chip {
      padding:.3rem .75rem; border-radius:99px; font-size:.8rem;
      border:1px solid var(--cui-border-color);
      background:transparent; color:var(--cui-body-color);
      cursor:pointer; transition:all .12s;
    }
    .allergen-chip:hover { border-color:var(--cui-warning); color:var(--cui-warning); }
    .allergen-chip--active {
      background:var(--cui-warning-bg-subtle);
      color:var(--cui-warning-emphasis);
      border-color:var(--cui-warning-border-subtle);
      font-weight:500;
    }
  `],
  imports: [
    CommonModule, ReactiveFormsModule, RouterLink,
    CardModule, ButtonModule, GridModule, BadgeModule, SpinnerModule,
    TableModule, FormModule, TooltipModule, AlertModule,
    NavModule, TabsModule, IconModule,
    InputGroupComponent, InputGroupTextDirective, CalloutComponent,
    SupplierPurchasesTabComponent,
  ]
})
export class PersonFormComponent implements OnInit {
  private svc             = inject(PersonasService);
  private settingsSvc     = inject(SettingsService);
  private notifications   = inject(NotificationService);
  private tenantSvc       = inject(TenantService);
  private formConfigSvc   = inject(FormConfigService);
  readonly personaExtensions = inject(PersonaExtensionsService);
  private schoolInstitution  = inject(SchoolInstitutionService);
  private schoolAllergenSvc  = inject(SchoolAllergenService);
  private fb              = inject(FormBuilder);
  private router          = inject(Router);
  private route           = inject(ActivatedRoute);
  private costCentersSvc  = inject(CostCentersService);

  // ─── State ──────────────────────────────────────────────────────────────

  personId   = signal<string | null>(null);
  loading    = signal(true);
  saving     = signal(false);
  activeTab  = signal<FormTab>('general');
  errorMsg   = signal('');
  formConfig = signal<EntityFormConfig>({ fields: {} });

  paymentTerms   = signal<PaymentTerm[]>([]);
  currencies     = signal<Currency[]>([]);
  documentSeries = signal<DocumentSeries[]>([]);
  selectedRoles  = signal<PersonRole[]>(['customer']);
  existingCodes  = signal<{ customer?: string; supplier?: string; employee?: string; student?: string; teacher?: string }>({});
  costCenters    = signal<CostCenter[]>([]);

  // Computed role flags used in template
  hasCustomerRole = computed(() => this.selectedRoles().includes('customer'));
  hasSupplierRole = computed(() => this.selectedRoles().includes('supplier'));
  hasEmployeeRole = computed(() => this.selectedRoles().includes('employee'));
  // Extension role flags (pkg_school_bar)
  hasStudentRole  = computed(() => this.selectedRoles().includes('student'));
  hasTeacherRole  = computed(() => this.selectedRoles().includes('teacher'));

  // School bar: grados y alérgenos para roles student / teacher
  schoolGrades    = signal<SchoolGrade[]>([]);
  schoolAllergens = signal<SchoolAllergen[]>([]);
  // IDs de alérgenos activos para el estudiante en edición (fuera del FormGroup)
  studentAllergenIds = signal<string[]>([]);

  // ─── Inline address management ───────────────────────────────────────────
  addresses       = signal<PersonAddress[]>([]);
  showAddressForm = signal(false);
  editingAddrIdx  = signal<number | null>(null);
  addressForm!: FormGroup;

  // ─── Inline bank account management ──────────────────────────────────────
  bankAccounts   = signal<PersonBankAccount[]>([]);
  showBankForm   = signal(false);
  editingBankIdx = signal<number | null>(null);
  bankForm!: FormGroup;

  // ─── Main form ───────────────────────────────────────────────────────────
  form!: FormGroup;

  readonly ALL_ROLES     = ALL_ROLES;
  readonly ROLE_LABELS   = ROLE_LABELS;
  readonly ROLE_COLORS   = ROLE_COLORS;
  readonly CONTRACT_TYPES = CONTRACT_TYPES;

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

  get isEditing(): boolean { return !!this.personId(); }

  /** True when the person is a legal entity (company). Drives name/legalName UX. */
  get isCompanyVal(): boolean { return !!this.form?.get('isCompany')?.value; }

  // ─── Init ────────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.initForms();

    // Pre-select role from query param: /personas/new?role=supplier
    const queryRole = this.route.snapshot.queryParamMap.get('role') as PersonRole | null;
    if (queryRole && this.personaExtensions.isRoleAvailable(queryRole)) {
      this.selectedRoles.set([queryRole]);
      this.syncRoleValidators();
    }

    this.settingsSvc.getPaymentTerms().pipe(take(1)).subscribe({
      next: terms => this.paymentTerms.set(terms.filter(t => t.isActive))
    });
    this.settingsSvc.getCurrencies().pipe(take(1)).subscribe({
      next: list => this.currencies.set(list.filter(c => c.isActive))
    });
    this.costCentersSvc.getCostCenters().pipe(take(1)).subscribe({
      next: list => this.costCenters.set(list.filter(c => c.isActive))
    });
    this.settingsSvc.getDocumentSeries().pipe(take(1)).subscribe({
      next: list => this.documentSeries.set(list.filter(s => s.isActive && s.documentType === 'invoice'))
    });

    this.formConfigSvc.getConfig(this.tenantSvc.companyId, 'personas').then(cfg => {
      this.formConfig.set(cfg);
      this.applyDynamicValidators(cfg);
    });

    // Cargar grados y alérgenos del bar escolar
    if (this.personaExtensions.isRoleAvailable('student') || this.personaExtensions.isRoleAvailable('teacher')) {
      this.schoolInstitution.getGrades().subscribe(g => this.schoolGrades.set(g.filter(gr => gr.state)));
      this.schoolAllergenSvc.getActiveAllergens().subscribe(a => {
        this.schoolAllergens.set(a);
        // Si es nuevo estudiante, preseleccionar los alérgenos marcados isDefault
        if (!this.personId()) {
          this.studentAllergenIds.set(a.filter(x => x.isDefault).map(x => x.id));
        }
      });
    }

    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.personId.set(id);
      this.svc.getPerson(id).then(person => {
        if (!person) { this.router.navigate(['/personas']); return; }
        this.patchForm(person);
        this.loading.set(false);
      });
    } else {
      this.loading.set(false);
    }
  }

  // ─── Role management ─────────────────────────────────────────────────────

  hasRole(role: string): boolean {
    return this.selectedRoles().includes(role as PersonRole);
  }

  toggleRole(role: string): void {
    const r = role as PersonRole;
    const current = this.selectedRoles();
    if (current.includes(r)) {
      if (current.length === 1) return; // at least one role required
      this.selectedRoles.update(list => list.filter(x => x !== r));
    } else {
      this.selectedRoles.update(list => [...list, r]);
    }
    this.syncRoleValidators();
  }

  private syncRoleValidators(): void {
    const roles = this.selectedRoles();
    const toggle = (key: string, active: boolean) => {
      const ctrl = this.form?.get(key);
      if (active) ctrl?.enable({ emitEvent: false });
      else        ctrl?.disable({ emitEvent: false });
    };
    toggle('customerData', roles.includes('customer'));
    toggle('supplierData', roles.includes('supplier'));
    toggle('employeeData', roles.includes('employee'));
    toggle('studentData',  roles.includes('student'));
    toggle('teacherData',  roles.includes('teacher'));
  }

  // ─── Form config helpers ──────────────────────────────────────────────────

  private applyDynamicValidators(cfg: EntityFormConfig): void {
    const optionalFields = [
      'contactPerson', 'email', 'phone1', 'phone2', 'web', 'notes', 'isCompany'
    ];
    for (const key of optionalFields) {
      const ctrl = this.form.get(key);
      if (!ctrl) continue;
      if (this.formConfigSvc.isRequired(cfg, key, 'personas')) {
        ctrl.addValidators(Validators.required);
      } else {
        ctrl.removeValidators(Validators.required);
      }
      ctrl.updateValueAndValidity({ emitEvent: false });
    }
  }

  isVisible(key: string): boolean {
    return this.formConfigSvc.isVisible(this.formConfig(), key, 'personas');
  }

  isRequired(key: string): boolean {
    return this.formConfigSvc.isRequired(this.formConfig(), key, 'personas');
  }

  fieldLabel(key: string): string {
    return this.formConfigSvc.getLabel(this.formConfig(), key, 'personas');
  }

  // ─── Form init ────────────────────────────────────────────────────────────

  private initForms(): void {
    this.form = this.fb.group({
      // ── Common required ──────────────────────────────────────────────────
      taxIdType: ['RUC',     Validators.required],
      taxId:     ['',        [Validators.required, ecuadorTaxIdValidator('taxIdType')]],
      name:      ['',        Validators.required],
      legalName: ['',        Validators.required],
      isActive:  [true],
      isCompany: [false],
      // ── Common optional ──────────────────────────────────────────────────
      contactPerson: [''],
      email:         [''],
      phone1:        [''],
      phone2:        [''],
      web:           [''],
      notes:         [''],
      // ── Customer role data ───────────────────────────────────────────────
      customerData: this.fb.group({
        currency:            ['USD',  Validators.required],
        paymentTermCode:     ['CONT', Validators.required],
        vatRegime:           ['General'],
        creditLimit:         [null],
        discountPct:         [null, [Validators.min(0), Validators.max(100)]],
        paymentDays:         [null],
        priceListCode:       [''],
        agentCode:           [''],
        customerGroupCode:   [''],
        documentSeriesCode:  [''],
        accountingCode:      [''],
        vatIncluded:         [false],
        defaultCostCenterId:   [''],
        defaultCostCenterName: ['']
      }),
      // ── Supplier role data ───────────────────────────────────────────────
      supplierData: this.fb.group({
        currency:          ['USD', Validators.required],
        paymentTermCode:   ['CONT', Validators.required],
        vatRegime:         ['General'],
        vatRetentionPct:   [null, [Validators.min(0), Validators.max(100)]],
        irRetentionPct:    [null, [Validators.min(0), Validators.max(100)]],
        paymentDays:       [null],
        purchaseAccount:   [''],
        accountingCode:    [''],
        defaultCostCenterId:   [''],
        defaultCostCenterName: ['']
      }),
      // ── Employee role data ───────────────────────────────────────────────
      employeeData: this.fb.group({
        iessNumber:   [''],
        position:     [''],
        department:   [''],
        salary:       [null],
        hireDate:     [''],
        endDate:      [''],
        contractType: ['indefinido']
      }),
      // ── Extension: Estudiante (pkg_school_bar) ───────────────────────────
      studentData: this.fb.group({
        gradeId:   [''],
        gradeName: [''],
        section:   ['']
      }),
      // ── Extension: Profesor (pkg_school_bar) ────────────────────────────
      teacherData: this.fb.group({
        gradeId:        [''],
        gradeName:      [''],
        specialization: ['']
      })
    });

    // Disable role data groups not in initial selectedRoles
    this.syncRoleValidators();

    // When taxIdType changes: re-validate taxId + auto-clear isCompany for personal IDs
    this.form.get('taxIdType')?.valueChanges.subscribe((type: TaxIdType) => {
      this.form.get('taxId')?.updateValueAndValidity();
      if (type === 'CI' || type === 'PASAPORTE' || type === 'EXTERIOR') {
        this.form.patchValue({ isCompany: false }, { emitEvent: false });
      }
    });

    // When name changes and person is NOT a company, sync legalName automatically
    this.form.get('name')?.valueChanges.subscribe((name: string) => {
      if (!this.form.get('isCompany')?.value) {
        this.form.patchValue({ legalName: name }, { emitEvent: false });
      }
    });

    // When isCompany is toggled off, re-sync legalName from name
    this.form.get('isCompany')?.valueChanges.subscribe((isCompany: boolean) => {
      if (!isCompany) {
        const name = this.form.get('name')?.value ?? '';
        this.form.patchValue({ legalName: name }, { emitEvent: false });
      }
    });

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

  private patchForm(p: Person): void {
    // Restore roles and store existing codes
    this.selectedRoles.set([...p.roles]);
    this.existingCodes.set({
      customer: p.customerData?.code,
      supplier: p.supplierData?.code,
      employee: p.employeeData?.code,
      student:  p.studentData?.code,
      teacher:  p.teacherData?.code,
    } as any);

    // Common fields
    this.form.patchValue({
      taxIdType:     p.taxIdType,
      taxId:         p.taxId,
      isCompany:     p.isCompany,
      name:          p.name,
      legalName:     p.legalName,
      contactPerson: p.contactPerson  ?? '',
      email:         p.email          ?? '',
      phone1:        p.phone1         ?? '',
      phone2:        p.phone2         ?? '',
      web:           p.web            ?? '',
      isActive:      p.isActive,
      notes:         p.notes          ?? ''
    });

    // Role-specific data (patchValue handles extra/missing keys gracefully)
    if (p.customerData) this.form.get('customerData')?.patchValue(p.customerData);
    if (p.supplierData) this.form.get('supplierData')?.patchValue(p.supplierData);
    if (p.employeeData) this.form.get('employeeData')?.patchValue(p.employeeData);
    if (p.studentData) {
      this.form.get('studentData')?.patchValue(p.studentData);
      this.studentAllergenIds.set(p.studentData.allergenIds ?? []);
    }
    if (p.teacherData)  this.form.get('teacherData')?.patchValue(p.teacherData);
    // Don't auto-sync legalName while patching — person already has their own legalName stored

    this.addresses.set([...(p.addresses    ?? [])]);
    this.bankAccounts.set([...(p.bankAccounts ?? [])]);

    this.syncRoleValidators();
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
      const v     = this.form.getRawValue();
      const roles = this.selectedRoles();
      const codes = this.existingCodes();

      // ── Common fields ────────────────────────────────────────────────────
      // For natural persons (isCompany=false), legalName = name (auto-sync)
      const resolvedLegalName = v.isCompany
        ? (v.legalName?.trim() || v.name.trim())
        : v.name.trim();

      const commonData = {
        roles,
        taxIdType:  v.taxIdType,
        taxId:      v.taxId.trim(),
        isCompany:  v.isCompany,
        name:       v.name.trim(),
        legalName:  resolvedLegalName,
        isActive:   v.isActive,
        addresses:  this.addresses(),
        bankAccounts: this.bankAccounts(),
        ...(v.contactPerson?.trim() && { contactPerson: v.contactPerson.trim() }),
        ...(v.email?.trim()         && { email:         v.email.trim() }),
        ...(v.phone1?.trim()        && { phone1:        v.phone1.trim() }),
        ...(v.phone2?.trim()        && { phone2:        v.phone2.trim() }),
        ...(v.web?.trim()           && { web:           v.web.trim() }),
        ...(v.notes?.trim()         && { notes:         v.notes.trim() })
      };

      const id = this.personId();
      if (id) {
        // ── Update: include existing codes in role data ─────────────────────
        const updateData: PersonUpdateInput = {
          ...commonData,
          ...(roles.includes('customer') && v.customerData ? {
            customerData: { code: codes.customer ?? '', ...this.cleanRoleValues(v.customerData) }
          } : {}),
          ...(roles.includes('supplier') && v.supplierData ? {
            supplierData: { code: codes.supplier ?? '', ...this.cleanRoleValues(v.supplierData) }
          } : {}),
          ...(roles.includes('employee') && v.employeeData ? {
            employeeData: { code: codes.employee ?? '', ...this.cleanRoleValues(v.employeeData) }
          } : {}),
          ...(roles.includes('student') && v.studentData ? {
            studentData: { code: codes.student ?? '', ...this.cleanRoleValues(v.studentData), allergenIds: this.studentAllergenIds() }
          } : {}),
          ...(roles.includes('teacher') && v.teacherData ? {
            teacherData: { code: codes.teacher ?? '', ...this.cleanRoleValues(v.teacherData) }
          } : {})
        } as PersonUpdateInput;

        await this.svc.updatePerson(id, updateData);
        this.notifications.success('Persona actualizada');
      } else {
        // ── Create: service generates codes per role ────────────────────────
        const createData: PersonCreateInput = {
          ...commonData,
          ...(roles.includes('customer') && v.customerData ? {
            customerData: this.cleanRoleValues(v.customerData)
          } : {}),
          ...(roles.includes('supplier') && v.supplierData ? {
            supplierData: this.cleanRoleValues(v.supplierData)
          } : {}),
          ...(roles.includes('employee') && v.employeeData ? {
            employeeData: this.cleanRoleValues(v.employeeData)
          } : {}),
          ...(roles.includes('student') && v.studentData ? {
            studentData: { ...this.cleanRoleValues(v.studentData), allergenIds: this.studentAllergenIds() }
          } : {}),
          ...(roles.includes('teacher') && v.teacherData ? {
            teacherData: this.cleanRoleValues(v.teacherData)
          } : {})
        } as PersonCreateInput;

        await this.svc.createPerson(createData);
        this.notifications.success('Persona registrada');
      }

      this.router.navigate(['/personas'], {
        queryParams: roles.length === 1 ? { role: roles[0] } : {}
      });
    } catch (err: any) {
      this.errorMsg.set(err?.message ?? 'Error al guardar');
    } finally {
      this.saving.set(false);
    }
  }

  /** Strips null/undefined/empty-string from a flat role data object */
  private cleanRoleValues(obj: Record<string, any>): Record<string, any> {
    const result: any = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v === null || v === undefined) continue;
      if (typeof v === 'string' && v.trim() === '') continue;
      result[k] = typeof v === 'string' ? v.trim() : v;
    }
    return result;
  }

  // ─── School grade selection helpers ─────────────────────────────────────

  toggleStudentAllergen(id: string): void {
    const current = this.studentAllergenIds();
    this.studentAllergenIds.set(
      current.includes(id) ? current.filter(x => x !== id) : [...current, id]
    );
  }

  isAllergenActive(id: string): boolean {
    return this.studentAllergenIds().includes(id);
  }

  onCustomerCostCenterSelect(event: Event): void {
    const id = (event.target as HTMLSelectElement).value;
    const cc = this.costCenters().find(c => c.id === id);
    this.form.get('customerData')?.patchValue({
      defaultCostCenterId:   cc?.id   ?? '',
      defaultCostCenterName: cc?.name ?? ''
    });
  }

  onSupplierCostCenterSelect(event: Event): void {
    const id = (event.target as HTMLSelectElement).value;
    const cc = this.costCenters().find(c => c.id === id);
    this.form.get('supplierData')?.patchValue({
      defaultCostCenterId:   cc?.id   ?? '',
      defaultCostCenterName: cc?.name ?? ''
    });
  }

  onStudentGradeSelect(event: Event): void {
    const gradeId = (event.target as HTMLSelectElement).value;
    const grade   = this.schoolGrades().find(g => g.id === gradeId);
    if (!grade) return;
    this.form.get('studentData')?.patchValue({
      gradeId:   grade.id,
      gradeName: grade.name,
      section:   grade.section
    });
  }

  onTeacherGradeSelect(event: Event): void {
    const gradeId = (event.target as HTMLSelectElement).value;
    const grade   = this.schoolGrades().find(g => g.id === gradeId);
    if (!grade) return;
    this.form.get('teacherData')?.patchValue({
      gradeId:   grade.id,
      gradeName: grade.name
    });
  }

  cancel(): void {
    const roles = this.selectedRoles();
    this.router.navigate(['/personas'], {
      queryParams: roles.length === 1 ? { role: roles[0] } : {}
    });
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
    const addr: PersonAddress = {
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
    const acc: PersonBankAccount = {
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
