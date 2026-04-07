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
  // Plugin management — equivalent to FacturaScripts enabled_plugins.list
  enabledModules: string[];   // module.code[] active for this company
  disabledModules: string[];  // module codes manually disabled
  sri: {
    environment: 'testing' | 'production';
    ruc: string;
    businessName: string;
    establishment: string;
    emissionPoint: string;
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

  // ─── Plugin / Module API ──────────────────────────────────────────────────

  /**
   * Reactive list of active module codes for the current company.
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
