import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, FormArray, ReactiveFormsModule, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import {
  CardComponent, CardBodyComponent, CardHeaderComponent,
  RowComponent, ColComponent,
  FormLabelDirective, FormControlDirective, FormSelectDirective,
  InputGroupComponent, InputGroupTextDirective,
  ButtonDirective, SpinnerComponent, AlertComponent, CalloutComponent,
  BadgeComponent, TableDirective, NavComponent, NavItemComponent,
  NavLinkDirective, ProgressComponent
} from '@coreui/angular';
import { IconDirective, IconSetService } from '@coreui/icons-angular';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { Storage, ref, uploadBytesResumable, getDownloadURL } from '@angular/fire/storage';
import { take, takeUntil } from 'rxjs';
import { Subject } from 'rxjs';
import { Timestamp } from '@angular/fire/firestore';
import { iconSubset } from '../../../../icons/icon-subset';
import { SettingsService } from '../../services/settings.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { TenantService } from '../../../../core/services/tenant.service';
import { Warehouse } from '../../models/settings.interfaces';
import { ecuadorTaxIdValidator, ecuadorRucValidator } from '../../../../shared/validators/ruc.validator';
import { SriCompanyConfig } from '../../models/settings.interfaces';

export type SettingsTab = 'empresa' | 'apariencia' | 'sri' | 'xml' | 'inventario';

const LOGO_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
const LOGO_MAX_MB = 2;

@Component({
  selector: 'app-company-settings',
  templateUrl: './company-settings.component.html',
  styleUrl: './company-settings.component.scss',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    CardComponent, CardBodyComponent, CardHeaderComponent,
    RowComponent, ColComponent,
    FormLabelDirective, FormControlDirective, FormSelectDirective,
    InputGroupComponent, InputGroupTextDirective,
    ButtonDirective, SpinnerComponent, AlertComponent, IconDirective,
    CalloutComponent, BadgeComponent, TableDirective,
    NavComponent, NavItemComponent, NavLinkDirective, ProgressComponent
  ]
})
export class CompanySettingsComponent implements OnInit, OnDestroy {
  private svc        = inject(SettingsService);
  private notifications = inject(NotificationService);
  private tenantSvc  = inject(TenantService);
  private functions  = inject(Functions);
  private storage    = inject(Storage);
  private fb         = inject(FormBuilder);
  private iconSet    = inject(IconSetService);

  // ── Tabs ──────────────────────────────────────────────────────────────────
  activeTab = signal<SettingsTab>('empresa');

  // ── Plan feature flags (read-only, reactive) ─────────────────────────────
  readonly isSriEnabled          = computed(() => this.tenantSvc.isSriEnabled());
  readonly isWhiteLabelEnabled   = computed(() => this.tenantSvc.isWhiteLabelEnabled());
  readonly isStockModuleEnabled  = computed(() => this.tenantSvc.isStockModuleEnabled());
  readonly companyPlan           = computed(() => this.tenantSvc.company?.plan ?? 'basic');

  // ── Global state ──────────────────────────────────────────────────────────
  loading      = signal(true);
  saving       = signal(false);
  savingStock  = signal(false);
  savingSri    = signal(false);
  savingSriXml = signal(false);
  errorMessage    = signal('');
  sriErrorMessage = signal('');
  sriXmlErrorMessage = signal('');
  warehouses   = signal<Warehouse[]>([]);
  readonly today = new Date();
  private destroy$ = new Subject<void>();

  // ── Apariencia — Logo ──────────────────────────────────────────────────────
  currentLogoUrl  = signal<string | null>(null);
  logoFile        = signal<File | null>(null);
  logoFileName    = signal<string | null>(null);
  logoPreviewUrl  = signal<string | null>(null);
  uploadingLogo   = signal(false);
  logoUploadProgress = signal(0);
  logoUploadError = signal('');
  removingLogo    = signal(false);

  // ── Apariencia — Brand color & Theme ─────────────────────────────────────────
  brandColor       = signal('#0d6efd');
  brandAccentColor = signal('#0dcaf0');
  sidebarTheme     = signal<'dark' | 'brand' | 'light'>('dark');
  buttonStyle      = signal<'square' | 'sharp' | 'rounded' | 'pill'>('rounded');
  cardRadius       = signal<'none' | 'sm' | 'md' | 'lg'>('md');
  appTitleSuffix   = signal<string>('');
  savingBrand      = signal(false);

  // ── Apariencia — Comprobantes PDF ──────────────────────────────────────────
  showLogoOnPdf     = signal<boolean>(true);
  pdfFooterMessage  = signal<string>('');
  savingPdfBranding = signal(false);

  // ── Porcentaje de configuración completada ──────────────────────────────────
  readonly completionPercentage = computed(() => {
    let score = 0;
    const fv = this.form.getRawValue();
    if (fv.companyName) score += 20;
    if (fv.taxId) score += 20;
    if (fv.fiscalAddress) score += 10;
    if (fv.email) score += 10;
    if (fv.phone) score += 10;
    if (this.currentLogoUrl()) score += 15;
    if (this.isSriEnabled()) {
      if (this.certThumbprint()) score += 15;
    } else {
      score += 15;
    }
    return Math.min(100, score);
  });

  // ── Certificate ─────────────────────────────────────────────────────────────
  certificateFileName = signal<string | null>(null);
  certificateFile     = signal<File | null>(null);
  certPassword        = signal('');
  uploadingCert       = signal(false);
  certUploadError     = signal('');
  certThumbprint      = signal<string | null>(null);
  certExpiry          = signal<Date | null>(null);
  certOwnerTaxId      = signal<string | null>(null);
  certOwnerName       = signal<string | null>(null);

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
    zipCode:         [''],
    country:         ['Ecuador', Validators.required],
    phone:           ['', Validators.required],
    email:           ['', [Validators.required, Validators.email]],
    website:         [''],
    defaultCurrency: ['USD', Validators.required],
    vatRate:         [15, [Validators.required, Validators.min(0), Validators.max(100)]],
    fiscalYear:      [new Date().getFullYear(), Validators.required]
  });

  // ── Formulario SRI ──────────────────────────────────────────────────────────
  sriForm = this.fb.group({
    ruc:                      ['', [Validators.required, ecuadorRucValidator()]],
    businessName:             ['', Validators.required],
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

  // ── Formulario XML (infoTributaria) ─────────────────────────────────────────
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

  // ── Formulario inventario ───────────────────────────────────────────────────
  stockForm = this.fb.group({
    defaultWarehouseCode:    [''],
    blockSaleOnInsufficient: [false]
  });

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.form.get('taxIdType')!.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.form.get('taxId')!.updateValueAndValidity();
    });

    this.form.get('taxId')!.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(val => {
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

    this.svc.getCompanySettings().pipe(take(1)).subscribe({
      next: (settings) => {
        if (settings) {
          const detectedType: 'ruc' | 'cedula' =
            settings.taxIdType ?? (settings.taxId?.trim().length === 10 ? 'cedula' : 'ruc');
          this.form.patchValue({ ...settings as any, taxIdType: detectedType });
          if (settings.stock) {
            this.stockForm.patchValue({
              defaultWarehouseCode:    settings.stock.defaultWarehouseCode ?? '',
              blockSaleOnInsufficient: settings.stock.blockSaleOnInsufficient ?? false
            });
          }
          // Apariencia
          if (settings.logoUrl) { this.currentLogoUrl.set(settings.logoUrl); }
          if (settings.brandColor) { this.brandColor.set(settings.brandColor); }
          if (settings.brandAccentColor) { this.brandAccentColor.set(settings.brandAccentColor); }
          if (settings.sidebarTheme) { this.sidebarTheme.set(settings.sidebarTheme); }
          if (settings.buttonStyle) { this.buttonStyle.set(settings.buttonStyle); }
          if (settings.cardRadius) { this.cardRadius.set(settings.cardRadius); }
          if (settings.appTitleSuffix !== undefined) { this.appTitleSuffix.set(settings.appTitleSuffix); }
          if (settings.showLogoOnPdf !== undefined) { this.showLogoOnPdf.set(settings.showLogoOnPdf); }
          if (settings.pdfFooterMessage !== undefined) { this.pdfFooterMessage.set(settings.pdfFooterMessage); }
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
            ruc:                     sri.ruc ?? '',
            businessName:            sri.businessName ?? '',
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
          if ((sri as any).certificateThumbprint) { this.certThumbprint.set((sri as any).certificateThumbprint); }
          const expiry = (sri as any).certificateExpiry as Timestamp | undefined;
          if (expiry) { this.certExpiry.set(expiry.toDate()); }
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
          while (this.additionalFields.length) { this.additionalFields.removeAt(0); }
          (cfg.additionalInfoFields ?? []).forEach(f =>
            this.additionalFields.push(this.fb.group({ nombre: [f.nombre], valor: [f.valor] }))
          );
        }
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.logoPreviewUrl()) { URL.revokeObjectURL(this.logoPreviewUrl()!); }
  }

  // ── Tab navigation ─────────────────────────────────────────────────────────
  setTab(tab: SettingsTab): void { this.activeTab.set(tab); }

  // ── Submit empresa ──────────────────────────────────────────────────────────
  async onSubmit(): Promise<void> {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    this.errorMessage.set('');
    try {
      await this.svc.saveCompanySettings(this.form.getRawValue() as any);
      this.notifications.success('Datos de empresa guardados');
    } catch (err: unknown) {
      this.errorMessage.set(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      this.saving.set(false);
    }
  }

  // ── Apariencia — Logo upload ───────────────────────────────────────────────
  onLogoFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file  = input.files?.[0] ?? null;
    if (!file) return;
    const error = this.validateLogoFile(file);
    if (error) { this.logoUploadError.set(error); return; }
    this.logoUploadError.set('');
    this.logoFile.set(file);
    this.logoFileName.set(file.name);
    if (this.logoPreviewUrl()) { URL.revokeObjectURL(this.logoPreviewUrl()!); }
    this.logoPreviewUrl.set(URL.createObjectURL(file));
  }

  private validateLogoFile(file: File): string | null {
    if (!LOGO_ALLOWED_TYPES.includes(file.type)) return 'Formato no soportado. Use JPG, PNG, WEBP o SVG.';
    if (file.size > LOGO_MAX_MB * 1024 * 1024) return `El archivo supera ${LOGO_MAX_MB} MB.`;
    return null;
  }

  async uploadLogo(): Promise<void> {
    const file = this.logoFile();
    if (!file) return;
    this.uploadingLogo.set(true);
    this.logoUploadProgress.set(0);
    this.logoUploadError.set('');
    try {
      const ext    = file.name.split('.').pop()?.toLowerCase() ?? 'png';
      const path   = `companies/${this.tenantSvc.companyId}/branding/logo.${ext}`;
      const sRef   = ref(this.storage, path);
      const task   = uploadBytesResumable(sRef, file, { contentType: file.type });

      const url = await new Promise<string>((resolve, reject) => {
        task.on(
          'state_changed',
          snap => {
            const pct = snap.totalBytes > 0
              ? Math.round((snap.bytesTransferred / snap.totalBytes) * 100) : 0;
            this.logoUploadProgress.set(pct);
          },
          err => reject(err),
          async () => resolve(await getDownloadURL(task.snapshot.ref))
        );
      });

      await this.svc.saveCompanySettings({ logoUrl: url });
      this.currentLogoUrl.set(url);
      this.logoFile.set(null);
      this.logoFileName.set(null);
      if (this.logoPreviewUrl()) { URL.revokeObjectURL(this.logoPreviewUrl()!); this.logoPreviewUrl.set(null); }
      this.notifications.success('Logo actualizado. Se verá en la barra lateral al recargar.');
    } catch (err: unknown) {
      this.logoUploadError.set((err as any)?.message ?? 'Error al subir el logo');
    } finally {
      this.uploadingLogo.set(false);
      this.logoUploadProgress.set(0);
    }
  }

  async removeLogo(): Promise<void> {
    this.removingLogo.set(true);
    try {
      await this.svc.saveCompanySettings({ logoUrl: '' });
      this.currentLogoUrl.set(null);
      this.notifications.success('Logo eliminado');
    } catch (err: unknown) {
      this.notifications.error('Error al eliminar el logo');
    } finally {
      this.removingLogo.set(false);
    }
  }

  // ── Apariencia — Brand color & Theme ─────────────────────────────────────────
  applyPresetPalette(primary: string, accent: string): void {
    this.brandColor.set(primary);
    this.brandAccentColor.set(accent);
  }

  async saveBrandColor(): Promise<void> {
    this.savingBrand.set(true);
    try {
      await this.svc.saveCompanySettings({
        brandColor:       this.brandColor(),
        brandAccentColor: this.brandAccentColor(),
        sidebarTheme:     this.sidebarTheme(),
        buttonStyle:      this.buttonStyle(),
        cardRadius:       this.cardRadius(),
        appTitleSuffix:   this.appTitleSuffix(),
      });
      this.notifications.success('Estilo visual y paleta de colores guardados');
    } catch (err: unknown) {
      console.error('[saveBrandColor] Error saving brand settings:', err);
      this.notifications.error('Error al guardar la personalización de marca');
    } finally {
      this.savingBrand.set(false);
    }
  }

  // ── Apariencia — Comprobantes PDF ──────────────────────────────────────────
  async savePdfBranding(): Promise<void> {
    this.savingPdfBranding.set(true);
    try {
      await this.svc.saveCompanySettings({
        showLogoOnPdf: this.showLogoOnPdf(),
        pdfFooterMessage: this.pdfFooterMessage(),
      });
      this.notifications.success('Configuración de comprobantes PDF guardada');
    } catch (err: unknown) {
      this.notifications.error('Error al guardar opciones de comprobantes PDF');
    } finally {
      this.savingPdfBranding.set(false);
    }
  }

  // ── Submit SRI ──────────────────────────────────────────────────────────────
  async onSubmitSri(): Promise<void> {
    if (!this.isSriEnabled()) return;
    if (this.sriForm.invalid) { this.sriForm.markAllAsTouched(); return; }
    this.savingSri.set(true);
    this.sriErrorMessage.set('');
    try {
      const fv = this.sriForm.getRawValue();
      const sri: any = {
        ruc:                   fv.ruc,
        businessName:          fv.businessName,
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
        sri.representanteLegal = { name: fv.representanteLegalName, taxId: fv.representanteLegalTaxId };
      } else {
        sri.representanteLegal = null;
      }
      await this.svc.saveSriConfig(sri);
      this.notifications.success('Configuración SRI guardada');
    } catch (err: unknown) {
      this.sriErrorMessage.set(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      this.savingSri.set(false);
    }
  }

  // ── Submit XML ──────────────────────────────────────────────────────────────
  async onSubmitSriXml(): Promise<void> {
    if (!this.isSriEnabled()) return;
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
      this.notifications.success('Datos XML guardados');
    } catch (err: unknown) {
      this.sriXmlErrorMessage.set(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      this.savingSriXml.set(false);
    }
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

  // ── Sync SRI ────────────────────────────────────────────────────────────────
  syncFromCompany(): void {
    const fv = this.form.getRawValue();
    this.sriForm.patchValue({
      ruc:          fv.taxIdType === 'ruc' ? (fv.taxId ?? '') : this.sriForm.get('ruc')?.value,
      businessName: fv.companyName ?? '',
    });
    this.sriXmlForm.patchValue({
      razonSocial:              fv.companyName ?? '',
      direccionMatriz:          fv.fiscalAddress ?? '',
      direccionEstablecimiento: fv.fiscalAddress ?? '',
      telefono:                 fv.phone ?? '',
      correo:                   fv.email ?? '',
    });
    this.notifications.success('Datos sincronizados. Guarda cuando estés listo.');
  }

  // ── Additional XML fields ───────────────────────────────────────────────────
  addAdditionalField(): void {
    if (this.additionalFields.length >= 15) return;
    this.additionalFields.push(this.fb.group({ nombre: [''], valor: [''] }));
  }

  removeAdditionalField(i: number): void { this.additionalFields.removeAt(i); }

  // ── Certificate ─────────────────────────────────────────────────────────────
  onCertificateFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file  = input.files?.[0] ?? null;
    this.certificateFile.set(file);
    this.certificateFileName.set(file?.name ?? null);
    this.certUploadError.set('');
  }

  async uploadCertificate(): Promise<void> {
    const file     = this.certificateFile();
    const password = this.certPassword();
    if (!file)     { this.certUploadError.set('Selecciona un archivo .p12 primero.'); return; }
    if (!password) { this.certUploadError.set('Ingresa la contraseña del certificado.'); return; }
    this.uploadingCert.set(true);
    this.certUploadError.set('');
    try {
      const base64 = await this.fileToBase64(file);
      const fn = httpsCallable<
        { companyId: string; certificateBase64: string; password: string },
        { success: boolean; thumbprint: string; subject: string; expiresAt: string; expiresIn: number; certOwnerTaxId: string; certOwnerName: string }
      >(this.functions, 'uploadCertificate');
      const result = await fn({ companyId: this.tenantSvc.companyId, certificateBase64: base64, password });
      const data   = result.data;
      this.certThumbprint.set(data.thumbprint);
      this.certExpiry.set(new Date(data.expiresAt));
      this.certOwnerTaxId.set(data.certOwnerTaxId || null);
      this.certOwnerName.set(data.certOwnerName || null);
      this.certificateFile.set(null);
      this.certificateFileName.set(null);
      this.certPassword.set('');
      this.notifications.success(`Certificado subido. Vence en ${data.expiresIn} días.`);
    } catch (err: unknown) {
      this.certUploadError.set((err as any)?.message ?? 'Error al subir el certificado');
    } finally {
      this.uploadingCert.set(false);
    }
  }

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

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

  // ── Error helpers ────────────────────────────────────────────────────────────
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
    if (ctrl.errors['required'])   return 'Campo requerido';
    if (ctrl.errors['email'])      return 'Email inválido';
    if (ctrl.errors['rucInvalid']) return ctrl.errors['rucInvalid'];
    if (ctrl.errors['min'])        return `Valor mínimo: ${ctrl.errors['min'].min}`;
    if (ctrl.errors['max'])        return `Valor máximo: ${ctrl.errors['max'].max}`;
    return 'Campo inválido';
  }

  trackByIndex(i: number): number { return i; }
}
