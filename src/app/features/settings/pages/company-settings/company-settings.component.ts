import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, FormArray, ReactiveFormsModule, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import {
  CardComponent, CardBodyComponent, CardHeaderComponent,
  RowComponent, ColComponent,
  FormLabelDirective, FormControlDirective, FormSelectDirective,
  InputGroupComponent, InputGroupTextDirective,
  ButtonDirective, SpinnerComponent, AlertComponent, CalloutComponent,
  BadgeComponent, TableDirective
} from '@coreui/angular';
import { IconDirective, IconSetService } from '@coreui/icons-angular';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { take, takeUntil } from 'rxjs';
import { Subject } from 'rxjs';
import { Timestamp } from '@angular/fire/firestore';
import { iconSubset } from '../../../../icons/icon-subset';
import { SettingsService } from '../../services/settings.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { TenantService } from '../../../../core/services/tenant.service';
import { Warehouse } from '../../models/settings.interfaces';
import { ecuadorTaxIdValidator } from '../../../../shared/validators/ruc.validator';
import { SriCompanyConfig } from '../../models/settings.interfaces';

@Component({
  selector: 'app-company-settings',
  templateUrl: './company-settings.component.html',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    CardComponent, CardBodyComponent, CardHeaderComponent,
    RowComponent, ColComponent,
    FormLabelDirective, FormControlDirective, FormSelectDirective,
    InputGroupComponent, InputGroupTextDirective,
    ButtonDirective, SpinnerComponent, AlertComponent, IconDirective,
    CalloutComponent, BadgeComponent, TableDirective
  ]
})
export class CompanySettingsComponent implements OnInit, OnDestroy {
  private svc = inject(SettingsService);
  private notifications = inject(NotificationService);
  private tenantSvc = inject(TenantService);
  private functions = inject(Functions);
  private fb = inject(FormBuilder);
  private iconSet = inject(IconSetService);

  loading = signal(true);
  saving = signal(false);
  savingStock = signal(false);
  warehouses = signal<Warehouse[]>([]);
  errorMessage = signal('');
  savingSri = signal(false);
  sriErrorMessage = signal('');
  savingSriXml = signal(false);
  sriXmlErrorMessage = signal('');
  certificateFileName = signal<string | null>(null);
  certificateFile = signal<File | null>(null);
  certPassword = signal('');
  uploadingCert = signal(false);
  certUploadError = signal('');

  // Certificate info from Firestore (updated after upload)
  certThumbprint = signal<string | null>(null);
  certExpiry = signal<Date | null>(null);
  readonly today = new Date();
  private destroy$ = new Subject<void>();

  constructor() {
    this.iconSet.icons = { ...iconSubset };
  }

  // ── Formulario principal empresa ────────────────────────────────────────────
  form = this.fb.group({
    companyName:     ['', Validators.required],
    taxIdType:       ['ruc' as 'ruc' | 'cedula', Validators.required],
    taxId:           ['', [Validators.required, ecuadorTaxIdValidator()]],
    fiscalAddress:   ['', Validators.required],
    city:            ['', Validators.required],
    province:        [''],
    country:         ['Ecuador', Validators.required],
    phone:           ['', Validators.required],
    email:           ['', [Validators.required, Validators.email]],
    website:         [''],
    defaultCurrency: ['USD', Validators.required],
    vatRate:         [15, [Validators.required, Validators.min(0), Validators.max(100)]],
    fiscalYear:      [new Date().getFullYear(), Validators.required]
  });

  // ── Formulario configuración SRI (ambiente/certificado) ────────────────────
  sriForm = this.fb.group({
    environment:              ['testing', Validators.required],
    establishment:            ['001', [Validators.required, Validators.pattern(/^\d{3}$/)]],
    emissionPoint:            ['001', [Validators.required, Validators.pattern(/^\d{3}$/)]],
    contributorType:          ['natural', Validators.required],
    accountingRequired:       [false],
    contribuyenteEspecial:    [''],
    microempresa:             [false],
    regimen:                  ['general', Validators.required],
    representanteLegalName:   [''],
    representanteLegalTaxId:  [''],
  });

  // ── Formulario datos XML (infoTributaria) ───────────────────────────────────
  sriXmlForm = this.fb.group({
    razonSocial:              ['', Validators.required],
    nombreComercial:          [''],
    direccionMatriz:          ['', Validators.required],
    direccionEstablecimiento: ['', Validators.required],
    telefono:                 [''],
    correo:                   ['', Validators.email],
    obligadoContabilidad:     ['SI', Validators.required],
    contribuyenteEspecial:    [''],
    tipoContribuyente:        ['02'],
    agenteRetencion:          [''],
    regimenMicroempresa:      [false],
    emailReplyTo:             ['', Validators.email],
  });

  additionalFields = this.fb.array<FormGroup>([]);

  // ── Formulario configuración de inventario ──────────────────────────────────
  stockForm = this.fb.group({
    defaultWarehouseCode:     [''],
    blockSaleOnInsufficient:  [false]
  });

  ngOnInit(): void {
    // Re-run taxId validation whenever taxIdType switches (ruc ↔ cedula)
    this.form.get('taxIdType')!.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.form.get('taxId')!.updateValueAndValidity();
      });

    // Auto-switch type as the user types: 10 digits → cedula, 13 → ruc
    this.form.get('taxId')!.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(val => {
        const len = (val as string)?.replace(/\D/g, '').length ?? 0;
        const current = this.form.get('taxIdType')!.value;
        if (len === 10 && current !== 'cedula') {
          this.form.get('taxIdType')!.setValue('cedula', { emitEvent: false });
        } else if (len === 13 && current !== 'ruc') {
          this.form.get('taxIdType')!.setValue('ruc', { emitEvent: false });
        }
      });

    this.svc.getWarehouses().pipe(take(1)).subscribe({
      next: whs => this.warehouses.set(whs.filter(w => w.isActive))
    });

    this.svc.getCompanySettings().subscribe({
      next: (settings) => {
        if (settings) {
          // Auto-detect type for existing records that don't have taxIdType saved yet:
          // if taxId is exactly 10 digits it must be a cédula.
          const detectedType: 'ruc' | 'cedula' =
            settings.taxIdType ?? (settings.taxId?.trim().length === 10 ? 'cedula' : 'ruc');

          this.form.patchValue({
            ...settings as any,
            taxIdType: detectedType,
          });
          if (settings.stock) {
            this.stockForm.patchValue({
              defaultWarehouseCode:    settings.stock.defaultWarehouseCode ?? '',
              blockSaleOnInsufficient: settings.stock.blockSaleOnInsufficient ?? false
            });
          }
        }
        this.loading.set(false);
      },
      error: () => {
        this.notifications.error('No se pudo cargar la configuración');
        this.loading.set(false);
      }
    });

    this.svc.getSriConfig().pipe(take(1)).subscribe({
      next: (sri) => {
        if (sri) {
          this.sriForm.patchValue({
            environment:             sri.environment ?? 'testing',
            establishment:           sri.establishment ?? '001',
            emissionPoint:           sri.emissionPoint ?? '001',
            contributorType:         sri.contributorType ?? 'natural',
            accountingRequired:      sri.accountingRequired ?? false,
            contribuyenteEspecial:   sri.contribuyenteEspecial ?? '',
            microempresa:            sri.microempresa ?? false,
            regimen:                 sri.regimen ?? 'general',
            representanteLegalName:  sri.representanteLegal?.name ?? '',
            representanteLegalTaxId: sri.representanteLegal?.taxId ?? '',
          });
          if ((sri as any).certificateThumbprint) {
            this.certThumbprint.set((sri as any).certificateThumbprint);
          }
          const expiry = (sri as any).certificateExpiry as Timestamp | undefined;
          if (expiry) {
            this.certExpiry.set(expiry.toDate());
          }
        }
      }
    });

    this.svc.getSriCompanyConfig().pipe(take(1)).subscribe({
      next: (cfg) => {
        if (cfg) {
          this.sriXmlForm.patchValue({
            razonSocial:              cfg.razonSocial ?? '',
            nombreComercial:          cfg.nombreComercial ?? '',
            direccionMatriz:          cfg.direccionMatriz ?? '',
            direccionEstablecimiento: cfg.direccionEstablecimiento ?? '',
            telefono:                 cfg.telefono ?? '',
            correo:                   cfg.correo ?? '',
            obligadoContabilidad:     cfg.obligadoContabilidad ?? 'SI',
            contribuyenteEspecial:    cfg.contribuyenteEspecial ?? '',
            tipoContribuyente:        cfg.tipoContribuyente ?? '02',
            agenteRetencion:          cfg.agenteRetencion ?? '',
            regimenMicroempresa:      cfg.regimenMicroempresa ?? false,
            emailReplyTo:             cfg.emailReplyTo ?? '',
          });

          // Rebuild additionalFields
          while (this.additionalFields.length) { this.additionalFields.removeAt(0); }
          (cfg.additionalInfoFields ?? []).forEach(f =>
            this.additionalFields.push(this.fb.group({ nombre: [f.nombre], valor: [f.valor] }))
          );
        }
      }
    });
  }

  // ── Submit inventario ───────────────────────────────────────────────────────
  async onSubmitStock(): Promise<void> {
    this.savingStock.set(true);
    try {
      const fv = this.stockForm.getRawValue();
      await this.svc.saveCompanySettings({
        stock: {
          defaultWarehouseCode:    fv.defaultWarehouseCode ?? '',
          blockSaleOnInsufficient: fv.blockSaleOnInsufficient ?? false
        }
      });
      this.notifications.success('Configuración de inventario guardada');
    } catch (err: unknown) {
      this.notifications.error('Error al guardar: ' + (err instanceof Error ? err.message : err));
    } finally {
      this.savingStock.set(false);
    }
  }

  // ── Submit empresa ──────────────────────────────────────────────────────────
  async onSubmit(): Promise<void> {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    this.errorMessage.set('');
    try {
      await this.svc.saveCompanySettings(this.form.getRawValue() as any);
      this.notifications.success('Configuración guardada correctamente');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al guardar';
      this.errorMessage.set(msg);
    } finally {
      this.saving.set(false);
    }
  }

  // ── Submit SRI ambiente ─────────────────────────────────────────────────────
  async onSubmitSri(): Promise<void> {
    if (this.sriForm.invalid) { this.sriForm.markAllAsTouched(); return; }
    this.savingSri.set(true);
    this.sriErrorMessage.set('');
    try {
      const fv = this.sriForm.getRawValue();
      const sri: any = {
        environment:           fv.environment,
        establishment:         fv.establishment,
        emissionPoint:         fv.emissionPoint,
        contributorType:       fv.contributorType,
        accountingRequired:    fv.accountingRequired ?? false,
        contribuyenteEspecial: fv.contribuyenteEspecial ?? '',
        microempresa:          fv.microempresa ?? false,
        regimen:               fv.regimen,
      };
      if (fv.contributorType === 'juridica' && fv.representanteLegalName) {
        sri.representanteLegal = {
          name:  fv.representanteLegalName,
          taxId: fv.representanteLegalTaxId,
        };
      } else {
        sri.representanteLegal = null;
      }
      await this.svc.saveSriConfig(sri);
      this.notifications.success('Configuración SRI guardada correctamente');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al guardar';
      this.sriErrorMessage.set(msg);
    } finally {
      this.savingSri.set(false);
    }
  }

  // ── Submit XML (infoTributaria) ─────────────────────────────────────────────
  async onSubmitSriXml(): Promise<void> {
    if (this.sriXmlForm.invalid) { this.sriXmlForm.markAllAsTouched(); return; }
    this.savingSriXml.set(true);
    this.sriXmlErrorMessage.set('');
    try {
      const fv = this.sriXmlForm.getRawValue();
      const payload: Partial<SriCompanyConfig> = {
        razonSocial:              fv.razonSocial!,
        nombreComercial:          fv.nombreComercial ?? '',
        direccionMatriz:          fv.direccionMatriz!,
        direccionEstablecimiento: fv.direccionEstablecimiento!,
        telefono:                 fv.telefono ?? '',
        correo:                   fv.correo ?? '',
        obligadoContabilidad:     (fv.obligadoContabilidad as 'SI' | 'NO') ?? 'NO',
        contribuyenteEspecial:    fv.contribuyenteEspecial ?? '',
        tipoContribuyente:        (fv.tipoContribuyente as '01' | '02') ?? '02',
        agenteRetencion:          fv.agenteRetencion ?? '',
        regimenMicroempresa:      fv.regimenMicroempresa ?? false,
        emailReplyTo:             fv.emailReplyTo ?? '',
        additionalInfoFields:     this.additionalFields.getRawValue().map(f => ({
          nombre: f['nombre'] as string,
          valor:  f['valor']  as string,
        })),
      };
      await this.svc.saveSriCompanyConfig(payload);
      this.notifications.success('Datos XML guardados correctamente');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al guardar';
      this.sriXmlErrorMessage.set(msg);
    } finally {
      this.savingSriXml.set(false);
    }
  }

  // ── Additional fields helpers ───────────────────────────────────────────────
  addAdditionalField(): void {
    if (this.additionalFields.length >= 15) { return; }
    this.additionalFields.push(this.fb.group({ nombre: [''], valor: [''] }));
  }

  removeAdditionalField(i: number): void { this.additionalFields.removeAt(i); }

  // ── Certificate ─────────────────────────────────────────────────────────────
  onCertificateFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.certificateFile.set(file);
    this.certificateFileName.set(file?.name ?? null);
    this.certUploadError.set('');
  }

  async uploadCertificate(): Promise<void> {
    const file = this.certificateFile();
    const password = this.certPassword();
    if (!file) {
      this.certUploadError.set('Selecciona un archivo .p12 primero.');
      return;
    }
    if (!password) {
      this.certUploadError.set('Ingresa la contraseña del certificado.');
      return;
    }
    this.uploadingCert.set(true);
    this.certUploadError.set('');
    try {
      const base64 = await this.fileToBase64(file);
      const fn = httpsCallable<
        { companyId: string; certificateBase64: string; password: string },
        { success: boolean; thumbprint: string; subject: string; expiresAt: string; expiresIn: number }
      >(this.functions, 'uploadCertificate');
      const result = await fn({
        companyId: this.tenantSvc.companyId,
        certificateBase64: base64,
        password,
      });
      const data = result.data;
      this.certThumbprint.set(data.thumbprint);
      this.certExpiry.set(new Date(data.expiresAt));
      this.certificateFile.set(null);
      this.certificateFileName.set(null);
      this.certPassword.set('');
      this.notifications.success(`Certificado subido. Vence en ${data.expiresIn} días.`);
    } catch (err: unknown) {
      const msg = (err as any)?.message ?? 'Error al subir el certificado';
      this.certUploadError.set(msg);
    } finally {
      this.uploadingCert.set(false);
    }
  }

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // result is "data:application/...;base64,<DATA>" — strip the prefix
        resolve(result.split(',')[1]);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  // ── Certificate expiry helpers ──────────────────────────────────────────────

  get certDaysLeft(): number {
    const expiry = this.certExpiry();
    if (!expiry) return 999;
    return Math.ceil((expiry.getTime() - Date.now()) / 86_400_000);
  }

  get certExpiryAlert(): 'danger' | 'warning' | null {
    const expiry = this.certExpiry();
    if (!expiry) return null;
    const days = this.certDaysLeft;
    if (days <= 0)  return 'danger';
    if (days <= 30) return 'warning';
    return null;
  }

  // ── Error helpers ───────────────────────────────────────────────────────────
  hasError(field: string): boolean {
    const ctrl = this.form.get(field);
    return !!(ctrl?.invalid && ctrl?.touched);
  }

  hasSriError(field: string): boolean {
    const ctrl = this.sriForm.get(field);
    return !!(ctrl?.invalid && ctrl?.touched);
  }

  hasSriXmlError(field: string): boolean {
    const ctrl = this.sriXmlForm.get(field);
    return !!(ctrl?.invalid && ctrl?.touched);
  }

  getError(field: string): string {
    const ctrl = this.form.get(field);
    if (!ctrl?.errors) return '';
    if (ctrl.errors['required']) return 'Campo requerido';
    if (ctrl.errors['email']) return 'Email inválido';
    if (ctrl.errors['rucInvalid']) return ctrl.errors['rucInvalid'];
    if (ctrl.errors['min']) return `Valor mínimo: ${ctrl.errors['min'].min}`;
    if (ctrl.errors['max']) return `Valor máximo: ${ctrl.errors['max'].max}`;
    return 'Campo inválido';
  }

  trackByIndex(i: number): number { return i; }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
