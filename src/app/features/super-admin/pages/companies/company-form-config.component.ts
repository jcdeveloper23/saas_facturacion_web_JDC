import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  CardModule, ButtonModule, GridModule, BadgeModule,
  SpinnerModule, AlertModule, TooltipModule, FormModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';

import { FormConfigService }  from '../../../../core/services/form-config.service';
import { SuperAdminService }  from '../../services/super-admin.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { EntityFormConfig }   from '../../../../core/interfaces/form-config.interface';
import {
  PERSON_FIELD_CATALOG, FieldDefinition, FieldSection
} from '../../../personas/models/person-field-catalog';
import { Company } from '../../models/company.interface';

interface FieldRow extends FieldDefinition {
  visible:       boolean;
  required:      boolean;
  labelOverride: string;
}

interface Section {
  key:           FieldSection;
  label:         string;
  icon:          string;
  activeRows:    FieldRow[];
  availableRows: FieldRow[];
}

const SECTION_META: Record<FieldSection, { label: string; icon: string }> = {
  fiscal:              { label: 'Identificación Fiscal',   icon: 'cilDescription' },
  contact:             { label: 'Datos de Contacto',       icon: 'cilContact'     },
  customer_commercial: { label: 'Condiciones Cliente',     icon: 'cilDollar'      },
  supplier_commercial: { label: 'Condiciones Proveedor',   icon: 'cilTruck'       },
  employee_hr:         { label: 'Datos de Empleado',       icon: 'cilBriefcase'   }
};

@Component({
  selector: 'app-company-form-config',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterLink,
    CardModule, ButtonModule, GridModule, BadgeModule,
    SpinnerModule, AlertModule, TooltipModule, FormModule, IconModule
  ],
  templateUrl: './company-form-config.component.html'
})
export class CompanyFormConfigComponent implements OnInit {
  private route         = inject(ActivatedRoute);
  private router        = inject(Router);
  private configSvc     = inject(FormConfigService);
  private superAdminSvc = inject(SuperAdminService);
  private notifications = inject(NotificationService);

  companyId = signal<string>('');
  company   = signal<Company | null>(null);
  entity    = signal<string>('personas');
  loading   = signal(true);
  saving    = signal(false);
  error     = signal<string | null>(null);

  editingKey   = signal<string | null>(null);
  editingValue = '';

  private rawConfig = signal<EntityFormConfig>({ fields: {} });

  sections = computed<Section[]>(() => this.buildSections(this.rawConfig()));

  readonly entityOptions = [
    { value: 'personas', label: 'Personas' }
  ];

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    this.companyId.set(id);
    this.superAdminSvc.getCompany(id).subscribe({ next: c => this.company.set(c ?? null) });
    this.loadConfig();
  }

  private loadConfig(): void {
    this.loading.set(true);
    this.configSvc.getConfig(this.companyId(), this.entity()).then(cfg => {
      this.rawConfig.set(cfg);
      this.loading.set(false);
    }).catch(() => {
      this.error.set('Error cargando configuración');
      this.loading.set(false);
    });
  }

  switchEntity(entity: string): void {
    this.entity.set(entity);
    this.loadConfig();
  }

  addField(field: FieldRow): void {
    const updated = this.cloneConfig();
    updated.fields[field.key] = {
      visible:  true,
      required: field.defaultRequired,
      ...(updated.fields[field.key]?.label ? { label: updated.fields[field.key].label } : {})
    };
    this.rawConfig.set(updated);
    this.autoSave();
  }

  removeField(field: FieldRow): void {
    if (field.alwaysVisible) return;
    const updated = this.cloneConfig();
    updated.fields[field.key] = { ...updated.fields[field.key], visible: false, required: false };
    this.rawConfig.set(updated);
    this.autoSave();
  }

  toggleRequired(field: FieldRow): void {
    if (field.alwaysRequired) return;
    const updated = this.cloneConfig();
    const f = updated.fields[field.key] ?? { visible: true, required: false };
    f.required = !f.required;
    updated.fields[field.key] = f;
    this.rawConfig.set(updated);
    this.autoSave();
  }

  startEdit(field: FieldRow): void {
    this.editingKey.set(field.key);
    this.editingValue = field.labelOverride;
  }

  confirmEdit(field: FieldRow): void {
    const updated = this.cloneConfig();
    const f = updated.fields[field.key] ?? { visible: field.visible, required: field.required };
    const val = this.editingValue.trim();
    if (val) { f.label = val; } else { delete f.label; }
    updated.fields[field.key] = f;
    this.rawConfig.set(updated);
    this.editingKey.set(null);
    this.autoSave();
  }

  cancelEdit(): void { this.editingKey.set(null); }

  private autoSave(): void { this.save(true); }

  async save(silent = false): Promise<void> {
    this.saving.set(true);
    try {
      await this.configSvc.saveConfig(this.companyId(), this.entity(), this.rawConfig());
      if (!silent) this.notifications.success('Configuración guardada');
    } catch {
      this.notifications.error('Error al guardar configuración');
    } finally {
      this.saving.set(false);
    }
  }

  resetDefaults(): void {
    if (!confirm('¿Restablecer los valores por defecto? Se perderán las etiquetas personalizadas.')) return;
    this.rawConfig.set(this.configSvc.buildDefault(this.entity()));
    this.save(false);
  }

  back(): void { this.router.navigate(['/super-admin/companies']); }

  displayLabel(field: FieldRow): string {
    return field.labelOverride || field.defaultLabel;
  }

  hasCustomLabel(field: FieldRow): boolean {
    return !!field.labelOverride && field.labelOverride !== field.defaultLabel;
  }

  private buildSections(cfg: EntityFormConfig): Section[] {
    const sectionKeys: FieldSection[] = ['fiscal', 'contact', 'customer_commercial', 'supplier_commercial', 'employee_hr'];
    return sectionKeys.map(sk => {
      const allRows = PERSON_FIELD_CATALOG
        .filter(f => f.section === sk)
        .map(f => {
          const stored = cfg.fields[f.key];
          return {
            ...f,
            visible:       stored?.visible  ?? f.defaultVisible,
            required:      stored?.required ?? f.defaultRequired,
            labelOverride: stored?.label    ?? ''
          } as FieldRow;
        });

      return {
        key:           sk,
        label:         SECTION_META[sk].label,
        icon:          SECTION_META[sk].icon,
        activeRows:    allRows.filter(r => r.visible || r.alwaysVisible),
        availableRows: allRows.filter(r => !r.visible && !r.alwaysVisible)
      };
    });
  }

  private cloneConfig(): EntityFormConfig {
    return { ...this.rawConfig(), fields: { ...this.rawConfig().fields } };
  }
}
