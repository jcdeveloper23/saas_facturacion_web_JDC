import { Injectable, inject, signal, computed } from '@angular/core';
import { Firestore, doc, onSnapshot } from '@angular/fire/firestore';

export interface CompanyConfig {
  id: string;
  name: string;
  tradeName?: string;
  taxId: string;
  fiscalAddress?: string;
  phone?: string;
  email?: string;
  logoUrl?: string;
  defaultCurrency: 'USD' | 'EUR';
  vatRate: number;
  fiscalYear: number;
  plan: 'basic' | 'professional' | 'enterprise';
  status: 'active' | 'suspended' | 'cancelled';
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

  private _companyId = signal<string>('');
  private _company   = signal<CompanyConfig | null>(null);

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
    this.loadCompany(id);
  }

  private loadCompany(companyId: string): void {
    const ref = doc(this.firestore, `companies/${companyId}`);
    onSnapshot(ref, {
      next:  snap => this._company.set(snap.exists() ? ({ id: snap.id, ...snap.data() } as CompanyConfig) : null),
      error: err  => console.error('[TenantService] Failed to load company:', err)
    });
  }
}
