import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
  effect,
  untracked
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { Firestore, doc, updateDoc, collection, onSnapshot, Timestamp } from '@angular/fire/firestore';
import { Observable, Subscription } from 'rxjs';

import {
  CardComponent, CardBodyComponent, CardHeaderComponent,
  RowComponent, ColComponent,
  ButtonDirective, SpinnerComponent,
  FormLabelDirective, FormControlDirective, FormCheckComponent, FormCheckInputDirective, FormCheckLabelDirective,
  AlertComponent
} from '@coreui/angular';

import { TenantService } from '../../../../core/services/tenant.service';
import { NotificationService } from '../../../../core/services/notification.service';

/** URL slugs reserved by the application — cannot be used as catalog slugs */
const RESERVED_SLUGS = [
  'login', 'logout', 'settings', 'invoices', 'products', 'personas',
  'debit-notes', 'retentions', 'stock', 'quotes', 'orders', 'proformas',
  'pos', 'purchase-invoices', 'purchase-orders', 'super-admin', 'dashboard',
  'permissions', 'api', 'admin', 'app'
];

function reservedSlugValidator(control: AbstractControl): ValidationErrors | null {
  const val = (control.value ?? '').toLowerCase();
  return RESERVED_SLUGS.includes(val) ? { reservedSlug: true } : null;
}

interface Family {
  id: string;
  name: string;
}

@Component({
  selector: 'app-marketplace-settings',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    CardComponent, CardBodyComponent, CardHeaderComponent,
    RowComponent, ColComponent,
    ButtonDirective, SpinnerComponent,
    FormLabelDirective, FormControlDirective,
    FormCheckComponent, FormCheckInputDirective, FormCheckLabelDirective,
    AlertComponent
  ],
  templateUrl: './marketplace-settings.component.html'
})
export class MarketplaceSettingsComponent implements OnInit, OnDestroy {
  private tenant = inject(TenantService);
  private firestore = inject(Firestore);
  private fb = inject(FormBuilder);
  private notifications = inject(NotificationService);
  private subs = new Subscription();

  families = signal<Family[]>([]);
  saving = signal(false);
  savedOk = signal(false);
  errorMessage = signal('');

  // Signal mirrors for reactive form fields (computed cannot track form values)
  slugValue         = signal('');
  welcomeValue      = signal('');

  /** Teléfono configurado en el documento de la empresa */
  companyPhone = computed(() => this.tenant.company?.phone ?? '');

  /** Indica si el campo whatsapp fue igualado al teléfono de la empresa */
  useCompanyPhone = signal(false);

  form = this.fb.group({
    enabled:          [false],
    slug:             ['', [
      Validators.required,
      Validators.minLength(3),
      Validators.pattern(/^[a-z0-9-]+$/),
      reservedSlugValidator
    ]],
    welcomeMessage:   ['', [Validators.maxLength(200)]],
    primaryColor:     ['#0d6efd'],
    whatsapp:         [''],
    phone:            [''],
    email:            ['', [Validators.email]],
    instagram:        [''],
    facebook:         [''],
    tiktok:           [''],
    locationText:     [''],
    locationUrl:      [''],
    showPrices:       [true],
    showNotes:        [true],
    showOutOfStock:   [false],
    allowedFamilyIds: [[] as string[]]
  });

  /** Guard: parchea el form solo la primera vez que llegan datos de la empresa */
  private _patched = false;

  constructor() {
    // El company signal se puebla asíncronamente via onSnapshot.
    // effect() reacciona cuando llega el dato y parchea el form una sola vez.
    effect(() => {
      const company = this.tenant.company; // tracked
      if (company && !this._patched) {
        this._patched = true;
        untracked(() => this.patchFromTenant());
      }
    });
  }

  /** Live URL preview — driven by slugValue signal */
  catalogUrl = computed(() => {
    const slug = this.slugValue();
    return slug ? `https://facturasec.com/${slug}` : 'https://facturasec.com/tu-slug';
  });

  /** Whether the marketplace package is active */
  hasMarketplacePkg = computed(() => this.tenant.hasPackage('pkg_marketplace'));

  /** Character counter for welcome message */
  welcomeLength = computed(() => this.welcomeValue().length);

  ngOnInit(): void {
    this.loadFamilies();
    // Mirror form values into signals so computed() can track them
    this.subs.add(
      this.form.get('slug')!.valueChanges.subscribe(v => this.slugValue.set(v ?? ''))
    );
    this.subs.add(
      this.form.get('welcomeMessage')!.valueChanges.subscribe(v => this.welcomeValue.set(v ?? ''))
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  private patchFromTenant(): void {
    const mkt   = this.tenant.company?.marketplace;
    const phone = this.tenant.company?.phone ?? '';
    if (mkt) {
      this.form.patchValue({
        enabled:          mkt.enabled,
        slug:             mkt.slug,
        welcomeMessage:   mkt.welcomeMessage ?? '',
        primaryColor:     mkt.primaryColor ?? '#0d6efd',
        whatsapp:         mkt.whatsapp ?? '',
        phone:            mkt.phone ?? '',
        email:            mkt.email ?? '',
        instagram:        mkt.instagram ?? '',
        facebook:         mkt.facebook ?? '',
        tiktok:           mkt.tiktok ?? '',
        locationText:     mkt.locationText ?? '',
        locationUrl:      mkt.locationUrl ?? '',
        showPrices:       mkt.showPrices,
        showNotes:        mkt.showNotes ?? true,
        showOutOfStock:   mkt.showOutOfStock,
        allowedFamilyIds: mkt.allowedFamilyIds ?? []
      });
      // Seed signal mirrors with initial values
      this.slugValue.set(mkt.slug ?? '');
      this.welcomeValue.set(mkt.welcomeMessage ?? '');
      // Detect if whatsapp ya estaba igualado al teléfono de la empresa
      if (phone && mkt.whatsapp === phone) {
        this.useCompanyPhone.set(true);
      }
    }
  }

  toggleUseCompanyPhone(): void {
    const next = !this.useCompanyPhone();
    this.useCompanyPhone.set(next);
    if (next) {
      this.form.get('whatsapp')!.setValue(this.companyPhone());
    }
  }

  private loadFamilies(): void {
    const companyId = this.tenant.companyId;
    if (!companyId) return;
    const ref = collection(this.firestore, `companies/${companyId}/families`);
    const families$ = new Observable<Family[]>(observer => {
      return onSnapshot(ref, {
        next: snap => observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Family)),
        error: err => observer.error(err)
      });
    });
    this.subs.add(
      families$.subscribe({
        next: docs => this.families.set(docs),
        error: err => console.error('[MarketplaceSettings] families error:', err)
      })
    );
  }

  isFamilySelected(familyId: string): boolean {
    const ids = this.form.get('allowedFamilyIds')?.value as string[] ?? [];
    return ids.includes(familyId);
  }

  toggleFamily(familyId: string): void {
    const ctrl = this.form.get('allowedFamilyIds')!;
    const current = [...(ctrl.value as string[] ?? [])];
    const idx = current.indexOf(familyId);
    if (idx === -1) {
      current.push(familyId);
    } else {
      current.splice(idx, 1);
    }
    ctrl.setValue(current);
  }

  hasError(field: string): boolean {
    const c = this.form.get(field);
    return !!(c?.invalid && c?.touched);
  }

  openCatalog(): void {
    const slug = this.form.get('slug')?.value;
    if (slug) {
      window.open(`/${slug}`, '_blank');
    }
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const companyId = this.tenant.companyId;
    if (!companyId) return;

    this.saving.set(true);
    this.errorMessage.set('');
    this.savedOk.set(false);

    const val = this.form.getRawValue();
    const marketplaceData = {
      enabled:          val.enabled,
      slug:             val.slug,
      welcomeMessage:   val.welcomeMessage ?? '',
      primaryColor:     val.primaryColor ?? '#0d6efd',
      whatsapp:         val.whatsapp ?? '',
      phone:            val.phone ?? '',
      email:            val.email ?? '',
      instagram:        val.instagram ?? '',
      facebook:         val.facebook ?? '',
      tiktok:           val.tiktok ?? '',
      locationText:     val.locationText ?? '',
      locationUrl:      val.locationUrl ?? '',
      showPrices:       val.showPrices,
      showNotes:        val.showNotes ?? true,
      showOutOfStock:   val.showOutOfStock,
      allowedFamilyIds: val.allowedFamilyIds ?? [],
      updatedAt:        Timestamp.now()
    };

    try {
      const ref = doc(this.firestore, `companies/${companyId}`);
      await updateDoc(ref, { marketplace: marketplaceData } as any);
      this.savedOk.set(true);
      this.notifications.success('Configuración del catálogo guardada.');
      setTimeout(() => this.savedOk.set(false), 4000);
    } catch (err: any) {
      console.error('[MarketplaceSettings] save error:', err);
      this.errorMessage.set(err?.message ?? 'Error al guardar la configuración.');
    } finally {
      this.saving.set(false);
    }
  }
}
