import { Injectable, inject, signal, computed, effect } from '@angular/core';
import { Firestore, doc, collection, onSnapshot } from '@angular/fire/firestore';
import { PlanLimitsService } from './plan-limits.service';

export interface ManagedCompany {
  companyId: string;
  companyName: string;
  companyTaxId?: string;
  role: string;
  isActive: boolean;
}

export interface CompanyConfig {
  id: string;
  name: string;
  tradeName?: string;
  taxId: string;
  fiscalAddress?: string;
  phone?: string;
  email?: string;
  logoUrl?: string;
  brandColor?: string;
  brandAccentColor?: string;
  sidebarTheme?: 'dark' | 'brand' | 'light';
  buttonStyle?: 'square' | 'sharp' | 'rounded' | 'pill';
  cardRadius?: 'none' | 'sm' | 'md' | 'lg';
  appTitleSuffix?: string;
  showLogoOnPdf?: boolean;
  pdfFooterMessage?: string;
  defaultCurrency: 'USD' | 'EUR';
  vatRate: number;
  fiscalYear: number;
  plan: 'basic' | 'professional' | 'enterprise';
  status: 'active' | 'trial' | 'suspended' | 'cancelled';
  subscriptionEnd?: any;
  // Plugin Package management — commercial bundles assigned to this company
  enabledPackages: string[];   // package.code[] active for this company (e.g. ['pkg_base','pkg_sri'])
  // Module management — derived from enabledPackages + manual overrides
  enabledModules: string[];    // module.code[] active; computed when packages change
  disabledModules: string[];   // module codes manually overridden off
  sri: {
    environment: 'testing' | 'production';
    ruc: string;
    businessName: string;
    establishment: string;
    emissionPoint: string;
  };
  marketplace?: {
    enabled: boolean;
    slug: string;                    // URL-safe único: 'optica-vision'
    welcomeMessage?: string;
    primaryColor?: string;           // hex: '#1a73e8'
    whatsapp?: string;               // número con código de país: '+593987654321'
    phone?: string;
    email?: string;
    instagram?: string;
    facebook?: string;
    tiktok?: string;
    locationText?: string;
    locationUrl?: string;
    showPrices: boolean;
    showNotes: boolean;
    showOutOfStock: boolean;
    allowedFamilyIds?: string[];     // vacío = todas las familias
    updatedAt?: any;                 // Firestore Timestamp
  };
}

/**
 * TenantService — holds the active company context.
 * companyId comes from Firebase Auth custom claims (set by AuthService).
 *
 * Plugin architecture (FacturaScripts pattern):
 *   - activeModules signal = module codes active for this company
 *   - hasModule(code) = equivalent to in_array($name, $GLOBALS['plugins'])
 *   - Used by moduleGuard and _nav.ts filterNavByModuleAndRole()
 */
@Injectable({ providedIn: 'root' })
export class TenantService {
  private firestore = inject(Firestore);
  private planLimits = inject(PlanLimitsService);

  private _companyId        = signal<string>('');
  private _uid              = signal<string>('');
  private _company          = signal<CompanyConfig | null>(null);
  private _managedCompanies = signal<ManagedCompany[]>([]);
  private _switchingCompany = signal(false);
  private _managedLoaded    = false;

  constructor() {
    effect(() => {
      const company = this._company();
      const color   = company?.brandColor ?? null;
      const accent  = company?.brandAccentColor ?? null;
      const theme   = company?.sidebarTheme ?? 'dark';
      const btnStyle = company?.buttonStyle ?? 'rounded';
      const cardRad  = company?.cardRadius ?? 'md';
      const suffix   = company?.appTitleSuffix ?? '';
      const name     = company?.name ?? '';
      this.applyBrandTheme(color, accent, theme, btnStyle, cardRad, suffix, name);
    });
  }

  private applyBrandTheme(
    color: string | null,
    accent: string | null,
    sidebarTheme: string,
    buttonStyle: string,
    cardRadius: string,
    titleSuffix: string,
    companyName: string
  ): void {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;

    if (companyName) {
      document.title = `${companyName} ${titleSuffix ? '| ' + titleSuffix : '| FacturaSec'}`;
    }

    if (!color) {
      root.style.removeProperty('--cui-primary');
      root.style.removeProperty('--cui-primary-rgb');
      root.style.removeProperty('--cui-primary-contrast');
      root.style.removeProperty('--cui-primary-light-text');
      root.style.removeProperty('--cui-primary-dark-text');
      root.style.removeProperty('--cui-sidebar-brand-bg');
      root.style.removeProperty('--cui-sidebar-nav-link-active-bg');
      root.style.removeProperty('--cui-sidebar-nav-link-active-color');
    } else {
      root.style.setProperty('--cui-primary', color);
      root.style.setProperty('--cui-sidebar-brand-bg', color + '22');

      const rgb = this.hexToRgb(color);
      if (rgb) {
        root.style.setProperty('--cui-primary-rgb', `${rgb.r}, ${rgb.g}, ${rgb.b}`);
        root.style.setProperty('--cui-sidebar-nav-link-active-bg', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.18)`);
        root.style.setProperty('--cui-sidebar-nav-link-active-color', '#ffffff');

        // Cálculo de luminancia para contraste WCAG
        const lum = this.getLuminance(rgb.r, rgb.g, rgb.b);
        const contrastText = lum > 0.55 ? '#111827' : '#ffffff';
        root.style.setProperty('--cui-primary-contrast', contrastText);

        // Variante para texto en Modo Claro (si el color es muy claro, se oscurece un 25%)
        const lightModeText = lum > 0.45 ? this.adjustBrightness(color, -25) : color;
        root.style.setProperty('--cui-primary-light-text', lightModeText);

        // Variante para texto en Modo Oscuro (si el color es muy oscuro, se aclara un 30%)
        const darkModeText = lum < 0.2 ? this.adjustBrightness(color, 35) : color;
        root.style.setProperty('--cui-primary-dark-text', darkModeText);

        // Hover de botón
        const hoverColor = lum > 0.5 ? this.adjustBrightness(color, -12) : this.adjustBrightness(color, 12);
        root.style.setProperty('--cui-primary-hover', hoverColor);
      }
    }

    if (accent) {
      root.style.setProperty('--cui-secondary', accent);
      root.style.setProperty('--brand-accent', accent);
      const accentRgb = this.hexToRgb(accent);
      if (accentRgb) {
        root.style.setProperty('--brand-accent-rgb', `${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}`);
      }
    } else {
      root.style.removeProperty('--cui-secondary');
      root.style.removeProperty('--brand-accent');
    }

    // Estilo de botones
    const btnRadius = buttonStyle === 'square' ? '0px' : buttonStyle === 'pill' ? '50px' : buttonStyle === 'sharp' ? '4px' : '8px';
    root.style.setProperty('--brand-btn-radius', btnRadius);

    // Redondeo de tarjetas
    const cardRadPx = cardRadius === 'none' ? '0px' : cardRadius === 'sm' ? '6px' : cardRadius === 'lg' ? '16px' : '12px';
    root.style.setProperty('--brand-card-radius', cardRadPx);
  }

  private hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  }

  private getLuminance(r: number, g: number, b: number): number {
    const a = [r, g, b].map(v => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
  }

  private adjustBrightness(hex: string, percent: number): string {
    const num = parseInt(hex.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.min(255, Math.max(0, (num >> 16) + amt));
    const G = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + amt));
    const B = Math.min(255, Math.max(0, (num & 0x0000FF) + amt));
    return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
  }

  // ─── Company status API ──────────────────────────────────────────────────

  /** URL del logo de la empresa (null si no tiene). */
  readonly logoUrl          = computed(() => this._company()?.logoUrl   ?? null);
  /** Color primario de marca (#hex). Null si no configurado. */
  readonly brandColor       = computed(() => this._company()?.brandColor ?? null);
  /** Color secundario / de acento de marca (#hex). Null si no configurado. */
  readonly brandAccentColor = computed(() => this._company()?.brandAccentColor ?? null);
  /** Tema del menú lateral: 'dark' | 'brand' | 'light'. */
  readonly sidebarTheme     = computed(() => this._company()?.sidebarTheme ?? 'dark');
  /** Estilo de botones: 'rounded' | 'pill' | 'sharp'. */
  readonly buttonStyle     = computed(() => this._company()?.buttonStyle ?? 'rounded');
  /** Redondeo de tarjetas: 'sm' | 'md' | 'lg'. */
  readonly cardRadius       = computed(() => this._company()?.cardRadius ?? 'md');
  /** Leyenda en la pestaña del navegador. */
  readonly appTitleSuffix   = computed(() => this._company()?.appTitleSuffix ?? '');

  // ── Plan feature flags (via PlanLimitsService) ───────────────────────────

  /** true si el plan incluye personalización de marca (colores, estilos, PDF). */
  readonly isWhiteLabelEnabled = computed(() => this.planLimits.isFeatureEnabled('whiteLabelModule'));
  /** true si el módulo de stock/inventario está habilitado en el plan. */
  readonly isStockModuleEnabled = computed(() => this.planLimits.isFeatureEnabled('stockModule'));
  /** true si la facturación electrónica está habilitada en el plan (puede enviar al SRI). */
  readonly isElectronicInvoicingEnabled = computed(() => this.planLimits.isFeatureEnabled('electronicInvoicing'));

  /** Estado actual de la empresa (null mientras no se carga el doc). */
  readonly companyStatus = computed(() => this._company()?.status ?? null);

  readonly isSubscriptionExpired = computed(() => {
    const se = this._company()?.subscriptionEnd;
    if (!se) return false;
    const d = typeof se.toDate === 'function' ? se.toDate() : new Date((se.seconds ?? 0) * 1000);
    return !isNaN(d.getTime()) && d < new Date();
  });

  /**
   * True cuando la empresa está suspendida o cancelada.
   * Activa el overlay bloqueante en el layout principal.
   */
  readonly isCompanyBlocked = computed(() => {
    const s = this.companyStatus();
    return s === 'suspended' || s === 'cancelled' || this.isSubscriptionExpired();
  });

  // ─── Multi-company API ───────────────────────────────────────────────────

  /** Lista de empresas que el usuario puede gestionar (requiere multiCompanyMode). */
  readonly managedCompanies = computed(() => this._managedCompanies());

  /** Verdadero si el plan de la empresa activa tiene multiCompanyMode habilitado. */
  readonly multiCompanyEnabled = computed(() =>
    this.planLimits.isFeatureEnabled('multiCompanyMode')
  );

  /** Verdadero mientras se está ejecutando el switch de empresa. */
  readonly switchingCompany = computed(() => this._switchingCompany());

  /**
   * Carga en tiempo real las empresas vinculadas al usuario.
   * Solo se ejecuta cuando multiCompanyMode está habilitado en el plan.
   * Llamado internamente tras cargar el doc de empresa, o desde AuthService
   * después de un switchCompany.
   */
  loadManagedCompanies(uid: string): void {
    if (this._managedLoaded) return;
    this._managedLoaded = true;
    const colRef = collection(this.firestore, `account-companies/${uid}/companies`);
    onSnapshot(colRef, {
      next:  snap => this._managedCompanies.set(
        snap.docs.map(d => ({ companyId: d.id, ...d.data() } as ManagedCompany))
      ),
      error: _err => {
        // Colección no existe aún o sin permisos — no es error crítico
        this._managedCompanies.set([]);
      }
    });
  }

  /** Marca el estado de switching para bloquear la UI durante el cambio. */
  setSwitching(value: boolean): void {
    this._switchingCompany.set(value);
  }

  // ─── Plugin Package API ───────────────────────────────────────────────────

  /**
   * Reactive list of active package codes for the current company.
   * Example: ['pkg_base', 'pkg_sales', 'pkg_sri']
   */
  readonly activePackages = computed<string[]>(() =>
    this._company()?.enabledPackages ?? []
  );

  /**
   * Check if a plugin package is active for the current company.
   * Usage in UI: tenantService.hasPackage('pkg_sri')
   */
  hasPackage(packageCode: string): boolean {
    return this.activePackages().includes(packageCode);
  }

  // ─── Module API (unchanged — guards and nav continue using this) ──────────

  /**
   * Reactive list of active module codes for the current company.
   * Derived from enabledModules stored on the company document,
   * which is computed when packages are assigned.
   * Equivalent to $GLOBALS['plugins'] in FacturaScripts runtime.
   */
  readonly activeModules = computed<string[]>(() =>
    this._company()?.enabledModules ?? []
  );

  /**
   * True when the company has the 'sri' module enabled (electronic invoicing).
   * When false, invoices are emitted as basic/non-electronic and sriStatus
   * must be set to 'not_required' so onInvoiceEmit does not trigger the SRI pipeline.
   */
  readonly isSriEnabled = computed(() => this.hasModule('sri'));

  /**
   * Check if a module (plugin) is active for the current company.
   * Equivalent to: in_array($moduleCode, $GLOBALS['plugins'])
   *
   * Usage in guards:  tenantService.hasModule('pos')
   * Usage in nav:     item.module ? tenantService.hasModule(item.module) : true
   */
  hasModule(moduleCode: string): boolean {
    const active = this.activeModules();
    if (active.includes(moduleCode)) return true;
    // Alias bridge: 'personas' is the successor of 'customers'.
    // Companies that still have 'customers' in enabledModules get access to /personas.
    const ALIASES: Record<string, string> = { personas: 'customers' };
    const fallback = ALIASES[moduleCode];
    return fallback ? active.includes(fallback) : false;
  }

  // ─── Company context ──────────────────────────────────────────────────────

  get companyId(): string {
    return this._companyId();
  }

  get company(): CompanyConfig | null {
    return this._company();
  }

  setCompanyId(id: string): void {
    if (!id || id === this._companyId()) return;
    this._companyId.set(id);
    this._managedLoaded = false;   // reset al cambiar de empresa
    this.loadCompany(id);
    this.planLimits.init(id);
  }

  /** Almacena el uid del usuario para carga lazy de managed companies. */
  setUid(uid: string): void {
    this._uid.set(uid);
  }

  private loadCompany(companyId: string): void {
    const rootRef = doc(this.firestore, `companies/${companyId}`);
    const generalRef = doc(this.firestore, `companies/${companyId}/configuration/general`);

    let companyData: Partial<CompanyConfig> = {};
    let generalData: Record<string, any> = {};

    const updateCombined = () => {
      if (!companyData.id) return;
      const merged = {
        ...companyData,
        logoUrl: generalData['logoUrl'] ?? companyData.logoUrl,
        brandColor: generalData['brandColor'] ?? companyData.brandColor,
        brandAccentColor: generalData['brandAccentColor'] ?? companyData.brandAccentColor,
        sidebarTheme: generalData['sidebarTheme'] ?? companyData.sidebarTheme ?? 'dark',
        buttonStyle: generalData['buttonStyle'] ?? companyData.buttonStyle ?? 'rounded',
        cardRadius: generalData['cardRadius'] ?? companyData.cardRadius ?? 'md',
        appTitleSuffix: generalData['appTitleSuffix'] ?? companyData.appTitleSuffix ?? '',
        showLogoOnPdf: generalData['showLogoOnPdf'] ?? companyData.showLogoOnPdf,
        pdfFooterMessage: generalData['pdfFooterMessage'] ?? companyData.pdfFooterMessage,
      } as CompanyConfig;
      this._company.set(merged);
    };

    onSnapshot(rootRef, {
      next: snap => {
        companyData = snap.exists() ? ({ id: snap.id, ...snap.data() } as CompanyConfig) : {};
        updateCombined();

        const uid = this._uid();
        if (uid && this.multiCompanyEnabled() && !this._managedLoaded) {
          this.loadManagedCompanies(uid);
        }
      },
      error: err => console.error('[TenantService] Failed to load company:', err)
    });

    onSnapshot(generalRef, {
      next: snap => {
        generalData = snap.exists() ? snap.data() : {};
        updateCombined();
      },
      error: _err => { /* subdoc general may not exist yet */ }
    });
  }
}
