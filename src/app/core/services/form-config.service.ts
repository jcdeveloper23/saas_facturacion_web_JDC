import { Injectable, inject } from '@angular/core';
import { Firestore, doc, getDoc, setDoc, Timestamp } from '@angular/fire/firestore';

import { EntityFormConfig, FieldConfig } from '../interfaces/form-config.interface';
import { PERSON_FIELD_CATALOG } from '../../features/personas/models/person-field-catalog';

@Injectable({ providedIn: 'root' })
export class FormConfigService {
  private firestore = inject(Firestore);

  // ─── Read ────────────────────────────────────────────────────────────────

  async getConfig(companyId: string, entity: string): Promise<EntityFormConfig> {
    const ref  = doc(this.firestore, `companies/${companyId}/form-config/${entity}`);
    const snap = await getDoc(ref);
    if (snap.exists()) return snap.data() as EntityFormConfig;
    return this.buildDefault(entity);
  }

  // ─── Write ───────────────────────────────────────────────────────────────

  async saveConfig(companyId: string, entity: string, config: EntityFormConfig): Promise<void> {
    const ref = doc(this.firestore, `companies/${companyId}/form-config/${entity}`);
    await setDoc(ref, { ...config, updatedAt: Timestamp.now() });
  }

  // ─── Defaults ────────────────────────────────────────────────────────────

  /**
   * Build a default config from the field catalog defaults.
   * Used when no Firestore config exists for this company/entity.
   */
  buildDefault(entity: string): EntityFormConfig {
    const catalog = this.getCatalog(entity);
    const fields: Record<string, FieldConfig> = {};
    for (const f of catalog) {
      fields[f.key] = { visible: f.defaultVisible, required: f.defaultRequired };
    }
    return { fields };
  }

  /** Helpers ─────────────────────────────────────────────────────────────── */

  isVisible(config: EntityFormConfig, key: string, entity: string): boolean {
    if (config.fields[key] !== undefined) return config.fields[key].visible;
    const def = this.getCatalog(entity).find(f => f.key === key);
    return def?.alwaysVisible ?? def?.defaultVisible ?? true;
  }

  isRequired(config: EntityFormConfig, key: string, entity: string): boolean {
    const def = this.getCatalog(entity).find(f => f.key === key);
    if (def?.alwaysRequired) return true;
    if (config.fields[key] !== undefined) return config.fields[key].required;
    return def?.defaultRequired ?? false;
  }

  getLabel(config: EntityFormConfig, key: string, entity: string): string {
    if (config.fields[key]?.label) return config.fields[key].label!;
    return this.getCatalog(entity).find(f => f.key === key)?.defaultLabel ?? key;
  }

  private getCatalog(entity: string) {
    if (entity === 'personas' || entity === 'customers') return PERSON_FIELD_CATALOG;
    return [];
  }
}
