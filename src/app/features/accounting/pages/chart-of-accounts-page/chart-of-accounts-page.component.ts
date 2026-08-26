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
  TooltipModule, InputGroupComponent, InputGroupTextDirective,
  AlertModule
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
    InputGroupComponent, InputGroupTextDirective, AlertModule
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

  /** Cuenta padre seleccionada para creación contextual */
  parentContext = signal<Account | null>(null);

  // ── Selección múltiple / edición en lote ────────────────────────────────
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

  // ── Computed: indica si la cuenta que se está editando tiene hijos ─────────
  editingHasChildren = computed(() => {
    const id = this.editingId();
    if (!id) return false;
    const acc = this.accounts().find(a => a.id === id);
    if (!acc) return false;
    return this.accounts().some(a => a.parentCode === acc.code);
  });

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

  // ── Generación automática del siguiente código ────────────────────────────
  /**
   * Sugiere el próximo código disponible para una subcuenta del padre indicado.
   * Analiza los hijos existentes para determinar el siguiente número y el formato
   * de cero-padding según el nivel (nivel 2 → 1 dígito, nivel 3 → 2 dígitos, nivel 4+ → 3 dígitos).
   */
  private suggestNextCode(parentCode: string): string {
    const parentLevel = parentCode.split('.').length;
    const widthMap: Record<number, number> = { 1: 1, 2: 2, 3: 3 };
    const width = widthMap[parentLevel] ?? 3;

    const siblings = this.accounts().filter(a => a.parentCode === parentCode);
    let maxNum = 0;
    for (const sib of siblings) {
      const parts = sib.code.split('.');
      const lastPart = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastPart) && lastPart > maxNum) maxNum = lastPart;
    }

    const next = maxNum + 1;
    return `${parentCode}.${String(next).padStart(width, '0')}`;
  }

  // ── Modal ─────────────────────────────────────────────────────────────────
  openNew(): void {
    this.editingId.set(null);
    this.parentContext.set(null);
    this.form.enable();
    this.form.reset({ code: '', name: '', type: 'activo', nature: 'deudora', allowsMovement: false, isActive: true, description: '' });
    this.showModal.set(true);
  }

  /** Abre el modal para crear una subcuenta/auxiliar bajo la cuenta padre indicada.
   *
   *  Si el padre tiene allowsMovement=true:
   *    - Con movimientos registrados → error, flujo bloqueado.
   *    - Sin movimientos             → confirmar conversión a cuenta agrupadora antes de continuar.
   *
   *  Las subcuentas nuevas tienen allowsMovement=true por defecto (son cuentas hoja).
   *  El tipo se hereda del padre y queda bloqueado.
   */
  async openAddChild(parent: Account, event: Event): Promise<void> {
    event.stopPropagation();

    // Caso: la cuenta padre está marcada como cuenta de movimiento
    if (parent.allowsMovement) {
      const hasMovements = await this.svc.accountHasMovements(parent.code);

      if (hasMovements) {
        this.notifications.error(
          `La cuenta "${parent.code} — ${parent.name}" ya tiene movimientos contables registrados. ` +
          `No es posible agregarle subcuentas. ` +
          `Solo se pueden crear subcuentas en cuentas sin movimientos.`
        );
        return;
      }

      const ok = await this.notifications.confirm({
        title: 'Convertir en cuenta agrupadora',
        text:
          `"${parent.code} — ${parent.name}" está marcada como cuenta de movimiento. ` +
          `Para agregarle subcuentas debe convertirse en cuenta agrupadora ` +
          `y dejará de recibir asientos directos. ¿Continuar?`,
        confirmText: 'Sí, convertir y agregar subcuenta',
        cancelText: 'Cancelar',
        icon: 'question'
      });
      if (!ok) return;

      try {
        await this.svc.demoteToGrouper(parent.id);
      } catch (err: any) {
        this.notifications.error('Error al convertir la cuenta: ' + (err?.message ?? err));
        return;
      }
    }

    this.editingId.set(null);
    this.parentContext.set(parent);

    const suggestedCode = this.suggestNextCode(parent.code);
    this.form.enable();
    this.form.reset({
      code:           suggestedCode,
      name:           '',
      type:           parent.type,
      nature:         defaultNatureForType(parent.type),
      allowsMovement: true,   // las subcuentas/auxiliares reciben movimientos por defecto
      isActive:       true,
      description:    ''
    });
    // Tipo heredado del padre: bloqueado para garantizar consistencia de jerarquía
    this.form.get('type')!.disable();
    this.showModal.set(true);
  }

  openEdit(acc: Account, event: Event): void {
    event.stopPropagation();
    this.editingId.set(acc.id);
    this.parentContext.set(null);

    const hasChildren = this.accounts().some(a => a.parentCode === acc.code);

    // Habilitar todos primero para evitar estado sucio de una apertura anterior
    this.form.enable();

    this.form.patchValue({
      code:           acc.code,
      name:           acc.name,
      type:           acc.type,
      nature:         acc.nature,
      allowsMovement: hasChildren ? false : acc.allowsMovement,
      isActive:       acc.isActive,
      description:    acc.description ?? ''
    });

    if (hasChildren) {
      // Cuenta agrupadora: código y allowsMovement bloqueados
      this.form.get('code')!.disable();
      this.form.get('allowsMovement')!.disable();
    }

    this.showModal.set(true);
  }

  closeModal(): void {
    this.showModal.set(false);
    this.editingId.set(null);
    this.parentContext.set(null);
    // Rehabilitar todos los controles para la próxima apertura
    this.form.enable();
  }

  onTypeChange(): void {
    const type = this.form.value.type as AccountType;
    this.form.patchValue({ nature: defaultNatureForType(type) });
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  async save(): Promise<void> {
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true);

    // getRawValue() captura todos los campos incluyendo los deshabilitados
    const raw = this.form.getRawValue();
    const rawCode      = (raw.code ?? '').trim();
    const allowsMovement = raw.allowsMovement ?? false;
    const type         = raw.type! as AccountType;
    const nature       = raw.nature! as AccountNature;

    // Validación local: consistencia de tipo con la cuenta padre (solo en creación)
    const parentCode = parentCodeFromCode(rawCode);
    if (parentCode && !this.editingId()) {
      const parent = this.accounts().find(a => a.code === parentCode);
      if (parent && parent.type !== type) {
        this.notifications.error(
          `El tipo "${this.TYPE_LABELS[type]}" no coincide con el tipo de la cuenta padre ` +
          `"${parentCode}" (${this.TYPE_LABELS[parent.type]}). La subcuenta hereda el tipo de su padre.`
        );
        this.saving.set(false);
        return;
      }
    }

    // Validación local: allowsMovement no puede ser true si la cuenta ya tiene subcuentas
    const hasChildrenLocal = this.accounts().some(a => a.parentCode === rawCode);
    if (allowsMovement && hasChildrenLocal) {
      this.notifications.error(
        `La cuenta "${rawCode}" tiene subcuentas y no puede marcarse como cuenta de movimiento. ` +
        `Los movimientos deben registrarse en las subcuentas correspondientes.`
      );
      this.saving.set(false);
      return;
    }

    try {
      const input = {
        code:           rawCode,
        name:           (raw.name ?? '').trim(),
        type,
        nature,
        allowsMovement,
        isAuxiliary:    allowsMovement,
        isActive:       raw.isActive ?? true,
        description:    raw.description ?? '',
        level:          levelFromCode(rawCode),
        parentCode:     parentCodeFromCode(rawCode)
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

  // ── Selección múltiple / edición en lote ─────────────────────────────────
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
    const ok = await this.notifications.confirm({
      title: `¿${active ? 'Activar' : 'Inactivar'} ${ids.length} cuenta(s) seleccionada(s)?`,
      confirmText: active ? 'Sí, activar' : 'Sí, inactivar',
      cancelText: 'Cancelar',
      icon: 'question'
    });
    if (!ok) return;

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
    const hasChildren = this.accounts().some(a => a.parentCode === acc.code);
    if (hasChildren) {
      this.notifications.error(
        `No se puede eliminar la cuenta "${acc.code} — ${acc.name}": tiene subcuentas dependientes. ` +
        `Elimine primero todas las subcuentas.`
      );
      return;
    }

    const ok = await this.notifications.confirm({
      title: `¿Eliminar la cuenta ${acc.code} - ${acc.name}?`,
      confirmText: 'Sí, eliminar',
      cancelText: 'Cancelar',
      icon: 'warning',
      danger: true
    });
    if (!ok) return;
    try {
      await this.svc.deleteAccount(acc.id);
      this.notifications.success('Cuenta eliminada');
    } catch (err: any) {
      this.notifications.error('Error al eliminar: ' + (err?.message ?? err));
    }
  }

  // ── Seed ─────────────────────────────────────────────────────────────────
  async seedAccounts(): Promise<void> {
    const ok = await this.notifications.confirm({
      title: '¿Cargar el plan de cuentas estándar Ecuador?',
      text: 'Se agregarán las cuentas base al catálogo. Las cuentas con códigos ya existentes serán omitidas.',
      confirmText: 'Sí, cargar',
      cancelText: 'Cancelar',
      icon: 'question'
    });
    if (!ok) return;
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

  // ── Export ────────────────────────────────────────────────────────────────
  exportAccounts(): void {
    const rows = this.accounts()
      .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
      .map(a => ({
        codigo:             a.code,
        nombre:             a.name,
        tipo:               a.type,
        naturaleza:         a.nature,
        nivel:              a.level,
        cuenta_padre:       a.parentCode ?? '',
        permite_movimiento: a.allowsMovement ? 'SI' : 'NO',
        activa:             a.isActive ? 'SI' : 'NO',
        descripcion:        a.description ?? ''
      }));
    this.excelExport.export('plan_de_cuentas', [{ name: 'Plan de Cuentas', rows }]);
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
    const seenCodes = new Set<string>();

    return raw.map((r, i) => {
      const errors: string[] = [];

      const code = String(r['codigo'] ?? r['code'] ?? r['Codigo'] ?? r['Code'] ?? '').trim();
      const name = String(r['nombre'] ?? r['name'] ?? r['Nombre'] ?? r['Name'] ?? '').trim();
      const rawType = String(r['tipo'] ?? r['type'] ?? r['Tipo'] ?? r['Type'] ?? '').trim().toLowerCase();
      const rawNature = String(r['naturaleza'] ?? r['nature'] ?? r['Naturaleza'] ?? r['Nature'] ?? '').trim().toLowerCase();
      const rawMov = String(r['permite_movimiento'] ?? r['allowsMovement'] ?? r['Permite_Movimiento'] ?? '').trim().toLowerCase();

      if (!code) {
        errors.push('Código requerido');
      } else if (!/^[\d.]+$/.test(code)) {
        errors.push('Código inválido (solo números y puntos)');
      } else if (seenCodes.has(code)) {
        errors.push(`Código duplicado en el archivo: "${code}"`);
      } else {
        seenCodes.add(code);
      }

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
      this.notifications.success(`Importación completada: ${created} cuentas creadas, ${skipped} omitidas (código ya existente)`);
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

  /** Indica si una cuenta tiene subcuentas (para mostrar/ocultar botón eliminar) */
  nodeHasChildren(code: string): boolean {
    return this.accounts().some(a => a.parentCode === code);
  }

  /** Clases para badge subtle (Norma 1). 'dark' no tiene subtle usable en dark mode → badge-neutral-subtle. */
  badgeClasses(color: string): string {
    if (color === 'dark') return 'badge badge-neutral-subtle';
    return `badge bg-${color}-subtle text-${color} border border-${color}-subtle`;
  }

  trackById(_: number, item: { id: string }): string { return item.id; }
  trackByCode(_: number, item: { code: string }): string { return item.code; }
}
