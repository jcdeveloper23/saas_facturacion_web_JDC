import {
  Component, OnInit, OnDestroy, inject, signal, computed
} from '@angular/core';
import * as XLSX from 'xlsx';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, takeUntil, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import {
  CardModule, ButtonModule, GridModule,
  SpinnerModule, TableModule, FormModule, ModalModule,
  TooltipModule, InputGroupComponent, InputGroupTextDirective
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';

import { ChartOfAccountsService } from '../../services/chart-of-accounts.service';
import { ExcelExportService } from '../../services/excel-export.service';
import { NotificationService } from '../../../../core/services/notification.service';
import {
  Account, AccountType, AccountNature, AccountTreeNode,
  ACCOUNT_TYPE_LABELS, ACCOUNT_TYPE_COLORS, ACCOUNT_NATURE_LABELS,
  buildAccountTree, flattenTree, defaultNatureForType, levelFromCode, parentCodeFromCode,
  ECUADOR_CHART_OF_ACCOUNTS_SEED
} from '../../models/account.interface';

interface ImportRow {
  row: number;
  code: string;
  name: string;
  type: AccountType;
  nature: AccountNature;
  allowsMovement: boolean;
  errors: string[];
  valid: boolean;
}

@Component({
  selector: 'app-chart-of-accounts-page',
  standalone: true,
  templateUrl: './chart-of-accounts-page.component.html',
  styleUrl: './chart-of-accounts-page.component.scss',
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule,
    CardModule, ButtonModule, GridModule, SpinnerModule,
    TableModule, FormModule, ModalModule, TooltipModule, IconModule,
    InputGroupComponent, InputGroupTextDirective
  ]
})
export class ChartOfAccountsPageComponent implements OnInit, OnDestroy {
  private svc = inject(ChartOfAccountsService);
  private notifications = inject(NotificationService);
  private excelExport = inject(ExcelExportService);
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private destroy$ = new Subject<void>();

  // ── State ─────────────────────────────────────────────────────────────────
  accounts = signal<Account[]>([]);
  loading = signal(true);
  searchTerm = signal('');
  treeMode = signal(true);
  showModal = signal(false);
  editingId = signal<string | null>(null);
  saving = signal(false);
  seeding = signal(false);
  typeFilter = signal<AccountType | null>(null);

  // ── Selección múltiple / edición en lote (Fase 6.2) ────────────────────────
  selectionMode = signal(false);
  selectedIds = signal<Set<string>>(new Set());
  bulkApplying = signal(false);

  // ── Import ────────────────────────────────────────────────────────────────
  showImportModal = signal(false);
  importParsing = signal(false);
  importing = signal(false);
  importPreview = signal<ImportRow[]>([]);
  importFileName = signal('');

  importValid = computed(() => this.importPreview().filter(r => r.valid));
  importInvalid = computed(() => this.importPreview().filter(r => !r.valid));

  // ── Tree state ─────────────────────────────────────────────────────────────
  private treeNodes = signal<AccountTreeNode[]>([]);

  // ── Form ──────────────────────────────────────────────────────────────────
  form = this.fb.group({
    code: ['', [Validators.required, Validators.pattern(/^[\d.]+$/)]],
    name: ['', [Validators.required, Validators.minLength(2)]],
    type: ['activo' as AccountType, Validators.required],
    nature: ['deudora' as AccountNature, Validators.required],
    allowsMovement: [false as boolean],
    isActive: [true as boolean],
    description: ['']
  });

  // ── Lookups ───────────────────────────────────────────────────────────────
  readonly TYPE_LABELS = ACCOUNT_TYPE_LABELS;
  readonly TYPE_COLORS = ACCOUNT_TYPE_COLORS;
  readonly NATURE_LABELS = ACCOUNT_NATURE_LABELS;
  readonly accountTypes: AccountType[] = ['activo', 'pasivo', 'patrimonio', 'ingreso', 'costo', 'gasto', 'resultado'];

  // ── Computed: flat tree (visible nodes only) ──────────────────────────────
  visibleNodes = computed(() => {
    const tree = this.treeNodes();
    return flattenTree(tree);
  });

  // ── Computed: filtered flat list (search mode) ────────────────────────────
  filteredFlat = computed(() => {
    const term = this.searchTerm().toLowerCase().trim();
    const type = this.typeFilter();
    let list = this.accounts();
    if (type) list = list.filter(a => a.type === type);
    if (term) {
      list = list.filter(a =>
        a.code.includes(term) ||
        a.name.toLowerCase().includes(term)
      );
    }
    return list;
  });

  // ── Computed: counts ──────────────────────────────────────────────────────
  counts = computed(() => {
    const all = this.accounts();
    return {
      total: all.length,
      active: all.filter(a => a.isActive).length,
      movement: all.filter(a => a.allowsMovement).length
    };
  });

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.svc.getAccounts().pipe(
      catchError(err => {
        this.notifications.error('Error cargando plan de cuentas: ' + (err?.message ?? err));
        this.loading.set(false);
        return of([]);
      }),
      takeUntil(this.destroy$)
    ).subscribe(list => {
      this.accounts.set(list);
      this.treeNodes.set(buildAccountTree(list));
      this.loading.set(false);
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Tree expand/collapse ──────────────────────────────────────────────────
  toggleNode(node: AccountTreeNode, event: Event): void {
    event.stopPropagation();
    node.expanded = !node.expanded;
    // Force re-render by rebuilding the flat list via signal mutation
    this.treeNodes.set([...this.treeNodes()]);
  }

  expandAll(): void {
    this.setExpandAll(this.treeNodes(), true);
    this.treeNodes.set([...this.treeNodes()]);
  }

  collapseAll(): void {
    this.setExpandAll(this.treeNodes(), false);
    this.treeNodes.set([...this.treeNodes()]);
  }

  private setExpandAll(nodes: AccountTreeNode[], value: boolean): void {
    for (const n of nodes) {
      n.expanded = value;
      if (n.children.length) this.setExpandAll(n.children, value);
    }
  }

  // ── Modal ─────────────────────────────────────────────────────────────────
  openNew(): void {
    this.editingId.set(null);
    this.form.reset({ code: '', name: '', type: 'activo', nature: 'deudora', allowsMovement: false, isActive: true, description: '' });
    this.showModal.set(true);
  }

  openEdit(acc: Account, event: Event): void {
    event.stopPropagation();
    this.editingId.set(acc.id);
    this.form.patchValue({
      code: acc.code,
      name: acc.name,
      type: acc.type,
      nature: acc.nature,
      allowsMovement: acc.allowsMovement,
      isActive: acc.isActive,
      description: acc.description ?? ''
    });
    this.showModal.set(true);
  }

  closeModal(): void {
    this.showModal.set(false);
    this.editingId.set(null);
  }

  onTypeChange(): void {
    const type = this.form.value.type as AccountType;
    this.form.patchValue({ nature: defaultNatureForType(type) });
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  async save(): Promise<void> {
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true);

    const v = this.form.value;
    try {
      const input = {
        code: v.code!.trim(),
        name: v.name!.trim(),
        type: v.type! as AccountType,
        nature: v.nature! as AccountNature,
        allowsMovement: v.allowsMovement ?? false,
        isAuxiliary: v.allowsMovement ?? false,
        isActive: v.isActive ?? true,
        description: v.description ?? '',
        level: levelFromCode(v.code!.trim()),
        parentCode: parentCodeFromCode(v.code!.trim())
      };

      const id = this.editingId();
      if (id) {
        await this.svc.updateAccount(id, input);
        this.notifications.success('Cuenta actualizada');
      } else {
        await this.svc.createAccount(input);
        this.notifications.success('Cuenta creada');
      }
      this.closeModal();
    } catch (err: any) {
      this.notifications.error('Error al guardar: ' + (err?.message ?? err));
    } finally {
      this.saving.set(false);
    }
  }

  // ── Toggle active ────────────────────────────────────────────────────────
  async toggleActive(acc: Account, event: Event): Promise<void> {
    event.stopPropagation();
    try {
      await this.svc.toggleActive(acc.id, !acc.isActive);
      this.notifications.success(acc.isActive ? 'Cuenta inactivada' : 'Cuenta activada');
    } catch (err: any) {
      this.notifications.error('Error: ' + (err?.message ?? err));
    }
  }

  // ── Selección múltiple / edición en lote ───────────────────────────────────
  // Alcance mínimo (Fase 6.2 del plan): activar/inactivar en lote. Renombrar o
  // mover de padre en lote se deja fuera — afecta reportes históricos y merece
  // su propia validación.
  toggleSelectionMode(): void {
    this.selectionMode.update(v => !v);
    this.selectedIds.set(new Set());
  }

  isSelected(id: string): boolean { return this.selectedIds().has(id); }

  toggleSelect(id: string, event: Event): void {
    event.stopPropagation();
    const next = new Set(this.selectedIds());
    if (next.has(id)) next.delete(id); else next.add(id);
    this.selectedIds.set(next);
  }

  private currentVisibleAccounts(): Account[] {
    return (this.treeMode() && !this.isSearching) ? this.visibleNodes() : this.filteredFlat();
  }

  allVisibleSelected(): boolean {
    const visible = this.currentVisibleAccounts();
    return visible.length > 0 && visible.every(a => this.selectedIds().has(a.id));
  }

  toggleSelectAllVisible(event: Event): void {
    event.stopPropagation();
    const visible = this.currentVisibleAccounts();
    if (this.allVisibleSelected()) {
      this.selectedIds.set(new Set());
    } else {
      this.selectedIds.set(new Set(visible.map(a => a.id)));
    }
  }

  async bulkSetActive(active: boolean): Promise<void> {
    const ids = [...this.selectedIds()];
    if (!ids.length) return;
    const verb = active ? 'activar' : 'inactivar';
    if (!confirm(`¿${active ? 'Activar' : 'Inactivar'} ${ids.length} cuenta(s) seleccionada(s)?`)) return;

    this.bulkApplying.set(true);
    try {
      await Promise.all(ids.map(id => this.svc.toggleActive(id, active)));
      this.notifications.success(`${ids.length} cuenta(s) actualizadas`);
      this.selectedIds.set(new Set());
    } catch (err: any) {
      this.notifications.error(`Error al ${verb} en lote: ` + (err?.message ?? err));
    } finally {
      this.bulkApplying.set(false);
    }
  }

  // ── Drill-down a Libro Mayor ────────────────────────────────────────────────
  viewMovements(acc: Account, event: Event): void {
    event.stopPropagation();
    this.router.navigate(['/accounting/libro-mayor'], { queryParams: { accountCode: acc.code } });
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  async delete(acc: Account, event: Event): Promise<void> {
    event.stopPropagation();
    if (!confirm(`¿Eliminar la cuenta ${acc.code} - ${acc.name}?`)) return;
    try {
      await this.svc.deleteAccount(acc.id);
      this.notifications.success('Cuenta eliminada');
    } catch (err: any) {
      this.notifications.error('Error al eliminar: ' + (err?.message ?? err));
    }
  }

  // ── Seed ─────────────────────────────────────────────────────────────────
  async seedAccounts(): Promise<void> {
    if (!confirm('¿Cargar el plan de cuentas estándar Ecuador? Se agregarán las cuentas base.')) return;
    this.seeding.set(true);
    try {
      await this.svc.seedChartOfAccounts();
      this.notifications.success('Plan de cuentas cargado exitosamente');
    } catch (err: any) {
      this.notifications.error('Error al cargar plan de cuentas: ' + (err?.message ?? err));
    } finally {
      this.seeding.set(false);
    }
  }

  // ── Import / Export ───────────────────────────────────────────────────────
  downloadTemplate(): void {
    const rows = ECUADOR_CHART_OF_ACCOUNTS_SEED.map(e => ({
      codigo: e.code,
      nombre: e.name,
      tipo: e.type,
      naturaleza: e.nature,
      permite_movimiento: e.allowsMovement ? 'SI' : 'NO'
    }));
    this.excelExport.export('plantilla_plan_cuentas', [{ name: 'Plan de Cuentas', rows }]);
  }

  openImportModal(): void {
    this.importPreview.set([]);
    this.importFileName.set('');
    this.showImportModal.set(true);
  }

  closeImportModal(): void {
    this.showImportModal.set(false);
    this.importPreview.set([]);
    this.importFileName.set('');
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.importFileName.set(file.name);
    this.importParsing.set(true);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
        const rows = this.parseImportRows(raw);
        this.importPreview.set(rows);
      } catch {
        this.notifications.error('No se pudo leer el archivo. Verifica que sea un CSV o Excel válido.');
        this.importPreview.set([]);
        this.importFileName.set('');
      } finally {
        this.importParsing.set(false);
        input.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  }

  private parseImportRows(raw: any[]): ImportRow[] {
    const validTypes: AccountType[] = ['activo', 'pasivo', 'patrimonio', 'ingreso', 'costo', 'gasto', 'resultado'];
    const validNatures: AccountNature[] = ['deudora', 'acreedora'];

    return raw.map((r, i) => {
      const errors: string[] = [];

      const code = String(r['codigo'] ?? r['code'] ?? r['Codigo'] ?? r['Code'] ?? '').trim();
      const name = String(r['nombre'] ?? r['name'] ?? r['Nombre'] ?? r['Name'] ?? '').trim();
      const rawType = String(r['tipo'] ?? r['type'] ?? r['Tipo'] ?? r['Type'] ?? '').trim().toLowerCase();
      const rawNature = String(r['naturaleza'] ?? r['nature'] ?? r['Naturaleza'] ?? r['Nature'] ?? '').trim().toLowerCase();
      const rawMov = String(r['permite_movimiento'] ?? r['allowsMovement'] ?? r['Permite_Movimiento'] ?? '').trim().toLowerCase();

      if (!code) errors.push('Código requerido');
      else if (!/^[\d.]+$/.test(code)) errors.push('Código inválido (solo números y puntos)');

      if (!name) errors.push('Nombre requerido');
      else if (name.length < 2) errors.push('Nombre muy corto');

      const type = validTypes.includes(rawType as AccountType) ? rawType as AccountType : null;
      if (!type) errors.push(`Tipo inválido: "${rawType}" (use: ${validTypes.join(', ')})`);

      const nature = validNatures.includes(rawNature as AccountNature)
        ? rawNature as AccountNature
        : (type ? defaultNatureForType(type as AccountType) : 'deudora' as AccountNature);

      const allowsMovement = ['si', 'yes', 'true', '1', 'sí'].includes(rawMov);

      return {
        row: i + 2,
        code,
        name,
        type: (type ?? 'activo') as AccountType,
        nature,
        allowsMovement,
        errors,
        valid: errors.length === 0
      };
    });
  }

  async confirmImport(): Promise<void> {
    const valid = this.importValid();
    if (!valid.length || this.importing()) return;
    this.importing.set(true);
    try {
      const { created, skipped } = await this.svc.importAccounts(
        valid.map(r => ({ code: r.code, name: r.name, type: r.type, nature: r.nature, allowsMovement: r.allowsMovement }))
      );
      this.notifications.success(`Importación completada: ${created} cuentas creadas, ${skipped} omitidas`);
      this.closeImportModal();
    } catch (err: any) {
      this.notifications.error('Error al importar: ' + (err?.message ?? err));
    } finally {
      this.importing.set(false);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  get isSearching(): boolean { return !!this.searchTerm().trim() || !!this.typeFilter(); }

  setTypeFilter(type: AccountType | null): void { this.typeFilter.set(type); }

  indentPx(level: number): string { return `${(level - 1) * 20}px`; }

  /** Clases para badge subtle (Norma 1). 'dark' no tiene subtle usable en dark mode → badge-neutral-subtle. */
  badgeClasses(color: string): string {
    if (color === 'dark') return 'badge badge-neutral-subtle';
    return `badge bg-${color}-subtle text-${color} border border-${color}-subtle`;
  }

  trackById(_: number, item: { id: string }): string { return item.id; }
  trackByCode(_: number, item: { code: string }): string { return item.code; }
}
