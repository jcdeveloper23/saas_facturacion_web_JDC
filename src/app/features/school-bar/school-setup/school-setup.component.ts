import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import {
  CardModule, ButtonModule, GridModule, FormModule, AlertModule, TableModule, BadgeModule
} from '@coreui/angular';
import { FormCheckComponent, FormCheckInputDirective, FormCheckLabelDirective } from '@coreui/angular';

import { SchoolInstitutionService } from '../services/school-institution.service';
import { SchoolAllergenService }    from '../services/school-allergen.service';
import { NotificationService }      from '../../../core/services/notification.service';
import {
  SchoolBarSettings, SchoolGrade, SchoolScheduleType,
  EduSubLevel, EDU_SUB_LEVEL_LABELS, EDU_SUB_LEVEL_COLORS,
  ECUADOR_EDU_LEVELS, EduLevelTemplate, SCHEDULE_TYPE_LABELS,
  SchoolAllergen
} from '../models';

type ActiveTab = 'institution' | 'grades' | 'bar-config' | 'allergens';

@Component({
  selector: 'app-school-setup',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    CardModule, ButtonModule, GridModule, FormModule, AlertModule, TableModule, BadgeModule,
    FormCheckComponent, FormCheckInputDirective, FormCheckLabelDirective
  ],
  templateUrl: './school-setup.component.html'
})
export class SchoolSetupComponent implements OnInit {
  private svc           = inject(SchoolInstitutionService);
  private allergenSvc   = inject(SchoolAllergenService);
  private fb            = inject(FormBuilder);
  private notifications = inject(NotificationService);

  // ── State ──────────────────────────────────────────────────────────────────
  grades         = signal<SchoolGrade[]>([]);
  allergens      = signal<SchoolAllergen[]>([]);
  saving         = signal(false);
  seeding        = signal(false);
  errorMsg       = signal<string | null>(null);
  successMsg     = signal<string | null>(null);
  activeTab      = signal<ActiveTab>('institution');
  showGradeModal = signal(false);
  editGradeId    = signal<string | null>(null);
  showBulkPanel  = signal(false);
  bulkSections   = signal<string[]>(['A']);
  newAllergenName = signal('');

  // ── Static lookup data ─────────────────────────────────────────────────────
  readonly allSections    = ['Única', 'A', 'B', 'C', 'D', 'E'];
  readonly scheduleLabels = SCHEDULE_TYPE_LABELS;

  /** Ecuador educational levels grouped by subnivel, with index for select value */
  readonly eduLevelGroups = (() => {
    const order: EduSubLevel[] = ['inicial', 'preparatoria', 'elemental', 'media', 'superior_egb', 'bachillerato'];
    const map = new Map<EduSubLevel, Array<EduLevelTemplate & { idx: number }>>();
    ECUADOR_EDU_LEVELS.forEach((lvl, idx) => {
      if (!map.has(lvl.subnivel)) map.set(lvl.subnivel, []);
      map.get(lvl.subnivel)!.push({ ...lvl, idx });
    });
    return order
      .filter(k => map.has(k))
      .map(k => ({ subnivel: k, label: EDU_SUB_LEVEL_LABELS[k], color: EDU_SUB_LEVEL_COLORS[k], levels: map.get(k)! }));
  })();

  // ── Forms ──────────────────────────────────────────────────────────────────
  settingsForm = this.fb.group({
    amieCode:      [''],
    currentPeriod: ['', Validators.required],
    barName:       ['', Validators.required],
    state:         [true]
  });

  barConfigForm = this.fb.group({
    maxWalletBalance:      [50,   [Validators.required, Validators.min(0.01)]],
    dailySpendLimit:       [10],
    weeklySpendLimit:      [40],
    emergencyCreditLimit:  [0],
    orderCutoffHour:       [7,    [Validators.required, Validators.min(0), Validators.max(23)]],
    orderCutoffMinute:     [30,   [Validators.required, Validators.min(0), Validators.max(59)]],
    allowClassroomDelivery:[false],
    deliveryFee:           [0.50]
  });

  gradeForm = this.fb.group({
    name:       ['', Validators.required],
    shortName:  ['', Validators.required],
    level:      [1,  [Validators.required, Validators.min(1)]],
    subnivel:   ['' as EduSubLevel | ''],
    section:    ['Única', Validators.required],
    schedule:   ['morning' as SchoolScheduleType, Validators.required],
    teacherName:[''],
    state:      [true]
  });

  bulkForm = this.fb.group({
    levelIndex: [null as number | null, Validators.required],
    schedule:   ['morning' as SchoolScheduleType]
  });

  // ── Computed ───────────────────────────────────────────────────────────────
  gradesBySubnivel = computed(() => {
    const ORDER: EduSubLevel[] = ['inicial', 'preparatoria', 'elemental', 'media', 'superior_egb', 'bachillerato'];
    const groups = new Map<string, SchoolGrade[]>();
    for (const g of this.grades()) {
      const key = g.subnivel ?? '__other__';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(g);
    }
    const result: Array<{ key: string; label: string; color: string; items: SchoolGrade[] }> = [];
    for (const k of ORDER) {
      if (groups.has(k)) {
        result.push({
          key:   k,
          label: EDU_SUB_LEVEL_LABELS[k],
          color: EDU_SUB_LEVEL_COLORS[k],
          items: groups.get(k)!.sort((a, b) => a.level - b.level || a.section.localeCompare(b.section))
        });
      }
    }
    if (groups.has('__other__')) {
      result.push({ key: '__other__', label: 'Sin clasificar', color: 'secondary', items: groups.get('__other__')! });
    }
    return result;
  });

  totalGrades          = computed(() => this.grades().length);
  activeGrades         = computed(() => this.grades().filter(g => g.state).length);
  defaultAllergenCount = computed(() => this.allergens().filter(a => a.isDefault).length);

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.svc.getSettings().subscribe(settings => {
      if (!settings) return;
      this.settingsForm.patchValue({
        amieCode:      settings.amieCode      ?? '',
        currentPeriod: settings.currentPeriod ?? '',
        barName:       settings.barName       ?? '',
        state:         settings.state
      });
      if (settings.barConfig) {
        this.barConfigForm.patchValue({
          maxWalletBalance:      settings.barConfig.maxWalletBalance      ?? 50,
          dailySpendLimit:       settings.barConfig.dailySpendLimit       ?? 10,
          weeklySpendLimit:      settings.barConfig.weeklySpendLimit      ?? 40,
          emergencyCreditLimit:  settings.barConfig.emergencyCreditLimit  ?? 0,
          orderCutoffHour:       settings.barConfig.orderCutoffHour       ?? 7,
          orderCutoffMinute:     settings.barConfig.orderCutoffMinute     ?? 30,
          allowClassroomDelivery:settings.barConfig.allowClassroomDelivery ?? false,
          deliveryFee:           settings.barConfig.deliveryFee           ?? 0.50
        });
      }
    });
    this.svc.getGrades().subscribe(g => this.grades.set(g));
    this.allergenSvc.getAllergens().subscribe(a => this.allergens.set(a));
  }

  // ── Tab ────────────────────────────────────────────────────────────────────
  setTab(tab: ActiveTab): void { this.activeTab.set(tab); }

  // ── Settings ───────────────────────────────────────────────────────────────
  async saveSettings(): Promise<void> {
    if (this.settingsForm.invalid) return;
    this.saving.set(true); this.errorMsg.set(null);
    try {
      await this.svc.saveSettings(this.settingsForm.getRawValue() as Partial<SchoolBarSettings>);
      this._flash('Configuración guardada.');
    } catch (e: any) {
      this.errorMsg.set(e.message ?? 'Error al guardar.');
    } finally { this.saving.set(false); }
  }

  async saveBarConfig(): Promise<void> {
    if (this.barConfigForm.invalid) return;
    this.saving.set(true); this.errorMsg.set(null);
    try {
      const v = this.barConfigForm.getRawValue();
      await this.svc.saveSettings({ barConfig: { ...v, acceptedPayments: ['wallet'] } as any });
      this._flash('Configuración del bar guardada.');
    } catch (e: any) {
      this.errorMsg.set(e.message ?? 'Error al guardar.');
    } finally { this.saving.set(false); }
  }

  // ── Grade modal ────────────────────────────────────────────────────────────
  openNewGrade(): void {
    this.editGradeId.set(null);
    this.gradeForm.reset({ name: '', shortName: '', level: 1, subnivel: '', section: 'Única', schedule: 'morning', teacherName: '', state: true });
    this.showGradeModal.set(true);
  }

  openEditGrade(grade: SchoolGrade): void {
    this.editGradeId.set(grade.id);
    this.gradeForm.patchValue({
      name:        grade.name,
      shortName:   grade.shortName,
      level:       grade.level,
      subnivel:    grade.subnivel ?? '',
      section:     grade.section,
      schedule:    grade.schedule,
      teacherName: grade.teacherName ?? '',
      state:       grade.state
    });
    this.showGradeModal.set(true);
  }

  onLevelTemplateChange(event: Event): void {
    const idxStr = (event.target as HTMLSelectElement).value;
    if (!idxStr) return;
    const tpl = ECUADOR_EDU_LEVELS[parseInt(idxStr, 10)];
    if (!tpl) return;
    this.gradeForm.patchValue({ name: tpl.name, shortName: tpl.shortName, level: tpl.level, subnivel: tpl.subnivel });
  }

  async saveGrade(): Promise<void> {
    if (this.gradeForm.invalid) return;
    this.saving.set(true);
    const v = this.gradeForm.getRawValue();
    const payload = {
      name:        v.name!,
      shortName:   v.shortName!,
      level:       v.level!,
      subnivel:    (v.subnivel || undefined) as EduSubLevel | undefined,
      section:     v.section!,
      schedule:    v.schedule as SchoolScheduleType,
      teacherName: v.teacherName || undefined,
      state:       v.state ?? true,
      studentCount: 0
    };
    try {
      const id = this.editGradeId();
      if (id) {
        await this.svc.updateGrade(id, payload);
      } else {
        await this.svc.createGrade({ ...payload, companyId: '' } as any);
      }
      this.showGradeModal.set(false);
    } catch (e: any) {
      this.errorMsg.set(e.message ?? 'Error al guardar.');
    } finally { this.saving.set(false); }
  }

  async toggleGradeState(grade: SchoolGrade, event: Event): Promise<void> {
    event.preventDefault();
    await this.svc.updateGrade(grade.id, { state: !grade.state });
  }

  async deleteGrade(id: string): Promise<void> {
    const ok = await this.notifications.confirm({
      title: '¿Eliminar este curso?',
      text: 'Esta acción no se puede deshacer.',
      confirmText: 'Sí, eliminar',
      cancelText: 'Cancelar',
      icon: 'warning',
      danger: true
    });
    if (!ok) return;
    await this.svc.deleteGrade(id);
  }

  // ── Bulk create ─────────────────────────────────────────────────────────────
  toggleSection(section: string): void {
    const curr = this.bulkSections();
    this.bulkSections.set(
      curr.includes(section) ? curr.filter(s => s !== section) : [...curr, section]
    );
  }

  isSectionSelected(section: string): boolean {
    return this.bulkSections().includes(section);
  }

  async executeBulkCreate(): Promise<void> {
    const idxRaw = this.bulkForm.get('levelIndex')?.value;
    const schedule = this.bulkForm.get('schedule')?.value as SchoolScheduleType;
    const sections = this.bulkSections();
    if (idxRaw === null || idxRaw === undefined || !sections.length) return;
    const tpl = ECUADOR_EDU_LEVELS[idxRaw as number];
    if (!tpl) return;
    this.saving.set(true);
    try {
      const existing = this.grades();
      for (const section of sections) {
        if (existing.some(g => g.level === tpl.level && g.section === section)) continue;
        const shortName = section === 'Única' ? tpl.shortName : `${tpl.shortName}-${section}`;
        await this.svc.createGrade({
          name: tpl.name, shortName, level: tpl.level,
          subnivel: tpl.subnivel, section, schedule,
          studentCount: 0, state: true, companyId: ''
        } as any);
      }
      this.showBulkPanel.set(false);
      this.bulkForm.reset({ levelIndex: null, schedule: 'morning' });
      this.bulkSections.set(['A']);
      this._flash('Cursos generados correctamente.');
    } catch (e: any) {
      this.errorMsg.set(e.message ?? 'Error al generar cursos.');
    } finally { this.saving.set(false); }
  }

  // ── Allergens ──────────────────────────────────────────────────────────────

  async addAllergen(): Promise<void> {
    const name = this.newAllergenName().trim();
    if (!name) return;
    this.saving.set(true);
    try {
      await this.allergenSvc.createAllergen(name);
      this.newAllergenName.set('');
    } catch (e: any) {
      this.errorMsg.set(e.message ?? 'Error al agregar alérgeno.');
    } finally { this.saving.set(false); }
  }

  async toggleAllergenState(a: SchoolAllergen): Promise<void> {
    await this.allergenSvc.updateAllergen(a.id, { state: !a.state });
  }

  async toggleAllergenDefault(a: SchoolAllergen): Promise<void> {
    await this.allergenSvc.updateAllergen(a.id, { isDefault: !a.isDefault });
  }

  async deleteAllergen(id: string): Promise<void> {
    const ok = await this.notifications.confirm({
      title: '¿Eliminar este alérgeno del catálogo?',
      confirmText: 'Sí, eliminar',
      cancelText: 'Cancelar',
      icon: 'warning',
      danger: true
    });
    if (!ok) return;
    await this.allergenSvc.deleteAllergen(id);
  }

  async seedAllergens(): Promise<void> {
    this.seeding.set(true);
    try {
      const created = await this.allergenSvc.seedDefaultAllergens(this.allergens());
      this._flash(created > 0
        ? `${created} alérgeno(s) agregados desde la lista predeterminada.`
        : 'La lista predeterminada ya está cargada.'
      );
    } catch (e: any) {
      this.errorMsg.set(e.message ?? 'Error al cargar lista predeterminada.');
    } finally { this.seeding.set(false); }
  }

  scheduleColor(schedule: SchoolScheduleType): string {
    return schedule === 'morning' ? 'info' : schedule === 'afternoon' ? 'warning' : 'primary';
  }

  private _flash(msg: string): void {
    this.successMsg.set(msg);
    setTimeout(() => this.successMsg.set(null), 3500);
  }
}
