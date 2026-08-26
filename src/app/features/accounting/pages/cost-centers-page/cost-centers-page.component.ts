import {
  Component, OnInit, OnDestroy, inject, signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Subject, Subscription, takeUntil, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import {
  CardModule, ButtonModule, GridModule, BadgeModule,
  SpinnerModule, TableModule, FormModule, ModalModule, TooltipModule,
  InputGroupComponent, InputGroupTextDirective
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';

import { CostCentersService }  from '../../services/cost-centers.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { TenantService }       from '../../../../core/services/tenant.service';
import { AuthService }         from '../../../../core/services/auth.service';
import { ExcelExportService }  from '../../services/excel-export.service';
import { AccountingPdfService } from '../../services/accounting-pdf.service';
import {
  CostCenter, CostCenterTreeNode, CostCenterType,
  COST_CENTER_TYPE_LABELS, COST_CENTER_TYPE_COLORS,
  buildCostCenterTree, flattenCostCenterTree
} from '../../models/cost-center.interface';

@Component({
  selector: 'app-cost-centers-page',
  standalone: true,
  templateUrl: './cost-centers-page.component.html',
  styleUrl:    './cost-centers-page.component.scss',
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule,
    CardModule, ButtonModule, GridModule, BadgeModule, SpinnerModule,
    TableModule, FormModule, ModalModule, TooltipModule, IconModule,
    InputGroupComponent, InputGroupTextDirective
  ]
})
export class CostCentersPageComponent implements OnInit, OnDestroy {
  private svc           = inject(CostCentersService);
  private notifications = inject(NotificationService);
  private fb            = inject(FormBuilder);
  private tenantSvc     = inject(TenantService);
  private authSvc       = inject(AuthService);
  private excelExport   = inject(ExcelExportService);
  private pdfSvc        = inject(AccountingPdfService);
  private destroy$      = new Subject<void>();
  private typeChangeSub?: Subscription;

  // ── State ─────────────────────────────────────────────────────────────────
  centers       = signal<CostCenter[]>([]);
  loading       = signal(true);
  searchTerm    = signal('');
  showModal     = signal(false);
  editingId     = signal<string | null>(null);
  saving        = signal(false);
  expandedIds   = signal<Set<string>>(new Set());
  parentContext = signal<CostCenter | null>(null);
  statusFilter  = signal<'all' | 'active' | 'inactive'>('all');
  exportingPdf  = signal(false);

  // ── Form ──────────────────────────────────────────────────────────────────
  form = this.fb.group({
    code:        ['', Validators.required],
    name:        ['', [Validators.required, Validators.minLength(2)]],
    type:        ['centro' as CostCenterType, Validators.required],
    description: [''],
    parentId:    [null as string | null],
    isActive:    [true as boolean]
  });

  readonly TYPE_LABELS = COST_CENTER_TYPE_LABELS;
  readonly TYPE_COLORS = COST_CENTER_TYPE_COLORS;
  readonly centerTypes: CostCenterType[] = ['centro','proyecto','departamento'];

  // ── Filter ────────────────────────────────────────────────────────────────

  filteredCenters = computed<CostCenter[]>(() => {
    const f = this.statusFilter();
    const all = this.centers();
    if (f === 'all') return all;
    return all.filter(c => c.isActive === (f === 'active'));
  });

  // ── Tree ──────────────────────────────────────────────────────────────────

  treeNodes = computed<CostCenterTreeNode[]>(() => {
    const tree = buildCostCenterTree(this.filteredCenters());
    const ids  = this.expandedIds();
    const applyExpanded = (nodes: CostCenterTreeNode[]): void => {
      for (const node of nodes) {
        node.expanded = ids.has(node.id);
        applyExpanded(node.children);
      }
    };
    applyExpanded(tree);
    return tree;
  });

  // ── Visible rows (tree or flat search results) ────────────────────────────

  visibleNodes = computed<CostCenterTreeNode[]>(() => {
    const term = this.searchTerm().toLowerCase().trim();
    if (term) {
      return this.filteredCenters()
        .filter(c =>
          c.code.toLowerCase().includes(term) ||
          c.name.toLowerCase().includes(term) ||
          (c.description ?? '').toLowerCase().includes(term)
        )
        .map(c => ({ ...c, children: [], expanded: false, depth: 0 }) as CostCenterTreeNode);
    }
    return flattenCostCenterTree(this.treeNodes());
  });

  // ── Parent options (excludes self and all descendants) ────────────────────

  parentOptions = computed<CostCenter[]>(() => {
    const editId = this.editingId();
    const all    = this.centers().filter(c => c.isActive);
    if (!editId) return all;
    const excluded = this.getDescendantIds(editId);
    return all.filter(c => !excluded.has(c.id));
  });

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.svc.getCostCenters().pipe(
      catchError(err => {
        this.notifications.error('Error cargando centros de costo: ' + (err?.message ?? err));
        this.loading.set(false);
        return of([]);
      }),
      takeUntil(this.destroy$)
    ).subscribe(list => {
      this.centers.set(list);
      this.loading.set(false);
    });
  }

  ngOnDestroy(): void {
    this.typeChangeSub?.unsubscribe();
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  nodeHasChildren(id: string): boolean {
    return this.centers().some(c => c.parentId === id);
  }

  getParentName(parentId: string | null): string {
    if (!parentId) return '—';
    return this.centers().find(c => c.id === parentId)?.name ?? '—';
  }

  private getDescendantIds(id: string): Set<string> {
    const result = new Set<string>([id]);
    const queue  = [id];
    while (queue.length) {
      const current = queue.shift()!;
      this.centers()
        .filter(c => c.parentId === current)
        .forEach(c => { result.add(c.id); queue.push(c.id); });
    }
    return result;
  }

  trackById(_: number, item: { id: string }): string { return item.id; }

  // ── Code suggestion ───────────────────────────────────────────────────────

  /**
   * Para centros raíz: prefijo por tipo + número secuencial 3 dígitos.
   * CC001, CC002 / PRY001 / DEP001 ...
   */
  private suggestRootCode(type: CostCenterType): string {
    const prefixMap: Record<CostCenterType, string> = {
      centro:       'CC',
      proyecto:     'PRY',
      departamento: 'DEP'
    };
    const prefix = prefixMap[type];
    const roots  = this.centers().filter(c => !c.parentId);
    let maxNum = 0;
    for (const cc of roots) {
      if (cc.code.toUpperCase().startsWith(prefix)) {
        const num = parseInt(cc.code.slice(prefix.length), 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    }
    return `${prefix}${String(maxNum + 1).padStart(3, '0')}`;
  }

  /**
   * Para subcentros: {parentCode}.{número 2 dígitos}.
   * CC001 → CC001.01, CC001.02 ...
   * CC001.01 → CC001.01.01 ...
   */
  private suggestChildCode(parentCode: string, parentId: string): string {
    const siblings = this.centers().filter(c => c.parentId === parentId);
    let maxNum = 0;
    for (const sib of siblings) {
      const parts   = sib.code.split('.');
      const lastPart = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastPart) && lastPart > maxNum) maxNum = lastPart;
    }
    return `${parentCode}.${String(maxNum + 1).padStart(2, '0')}`;
  }

  // ── Tree expand / collapse ────────────────────────────────────────────────

  toggleExpand(node: CostCenterTreeNode, event: Event): void {
    event.stopPropagation();
    const ids = new Set(this.expandedIds());
    if (ids.has(node.id)) { ids.delete(node.id); } else { ids.add(node.id); }
    this.expandedIds.set(ids);
  }

  // ── Modal ─────────────────────────────────────────────────────────────────

  openNew(): void {
    this.editingId.set(null);
    this.parentContext.set(null);
    this.form.enable();
    this.form.reset({
      code:        this.suggestRootCode('centro'),
      name:        '',
      type:        'centro',
      description: '',
      parentId:    null,
      isActive:    true
    });
    // Actualizar sugerencia de código cuando el usuario cambia el tipo (solo en creación raíz)
    this.typeChangeSub?.unsubscribe();
    this.typeChangeSub = this.form.get('type')!.valueChanges.subscribe(type => {
      if (!type) return;
      const current = (this.form.get('code')?.value ?? '').toUpperCase();
      const isAutoPattern = /^(CC|PRY|DEP)\d{3}$/.test(current) || current === '';
      if (isAutoPattern) {
        this.form.get('code')!.setValue(
          this.suggestRootCode(type as CostCenterType),
          { emitEvent: false }
        );
      }
    });
    this.showModal.set(true);
  }

  openAddChild(cc: CostCenter, event: Event): void {
    event.stopPropagation();
    this.typeChangeSub?.unsubscribe();
    this.editingId.set(null);
    this.parentContext.set(cc);
    this.form.enable();
    this.form.reset({
      code:        this.suggestChildCode(cc.code, cc.id),
      name:        '',
      type:        cc.type,
      description: '',
      parentId:    cc.id,
      isActive:    true
    });
    this.showModal.set(true);
  }

  openEdit(cc: CostCenter, event: Event): void {
    event.stopPropagation();
    this.editingId.set(cc.id);
    this.parentContext.set(null);
    this.form.enable();
    this.form.patchValue({
      code:        cc.code,
      name:        cc.name,
      type:        cc.type,
      description: cc.description ?? '',
      parentId:    cc.parentId,
      isActive:    cc.isActive
    });
    this.showModal.set(true);
  }

  closeModal(): void {
    this.typeChangeSub?.unsubscribe();
    this.typeChangeSub = undefined;
    this.showModal.set(false);
    this.editingId.set(null);
    this.parentContext.set(null);
    this.form.enable();
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  async save(): Promise<void> {
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true);

    const raw = this.form.getRawValue();
    const input = {
      code:        (raw.code ?? '').trim(),
      name:        (raw.name ?? '').trim(),
      type:        raw.type! as CostCenterType,
      description: (raw.description ?? '').trim(),
      parentId:    raw.parentId || null,
      isActive:    raw.isActive ?? true
    };

    try {
      const id = this.editingId();
      if (id) {
        await this.svc.updateCostCenter(id, input);
        this.notifications.success('Centro de costo actualizado');
      } else {
        await this.svc.createCostCenter(input);
        this.notifications.success('Centro de costo creado');
        // Auto-expand parent so new child is visible
        const parentId = input.parentId;
        if (parentId) {
          const ids = new Set(this.expandedIds());
          ids.add(parentId);
          this.expandedIds.set(ids);
        }
      }
      this.closeModal();
    } catch (err: any) {
      this.notifications.error(err?.message ?? 'Error al guardar');
    } finally {
      this.saving.set(false);
    }
  }

  // ── Toggle / Delete ───────────────────────────────────────────────────────

  async toggleActive(cc: CostCenter, event: Event): Promise<void> {
    event.stopPropagation();
    try {
      await this.svc.toggleActive(cc.id, !cc.isActive);
      this.notifications.success(cc.isActive ? 'Centro inactivado' : 'Centro activado');
    } catch (err: any) {
      this.notifications.error('Error: ' + (err?.message ?? err));
    }
  }

  async delete(cc: CostCenter, event: Event): Promise<void> {
    event.stopPropagation();
    if (this.nodeHasChildren(cc.id)) {
      this.notifications.error(
        `No se puede eliminar "${cc.name}": tiene subcentros. Elimínelos primero.`
      );
      return;
    }
    const ok = await this.notifications.confirm({
      title:       `¿Eliminar "${cc.name}"?`,
      confirmText: 'Sí, eliminar',
      cancelText:  'Cancelar',
      icon:        'warning',
      danger:      true
    });
    if (!ok) return;
    try {
      await this.svc.deleteCostCenter(cc.id);
      this.notifications.success('Centro de costo eliminado');
    } catch (err: any) {
      this.notifications.error(err?.message ?? 'Error al eliminar');
    }
  }

  // ── Export ────────────────────────────────────────────────────────────────

  private get filterLabel(): string {
    const map: Record<string, string> = { all: 'Todos', active: 'Activos', inactive: 'Inactivos' };
    return map[this.statusFilter()] ?? 'Todos';
  }

  exportExcel(): void {
    const rows = this.visibleNodes().map(node => ({
      nivel:           node.depth,
      tipo_registro:   node.depth === 0 ? 'Centro Principal' : 'Subcentro',
      codigo:          node.code,
      nombre:          node.name,
      tipo:            this.TYPE_LABELS[node.type],
      centro_superior: this.getParentName(node.parentId),
      estado:          node.isActive ? 'Activo' : 'Inactivo',
      descripcion:     node.description ?? ''
    }));
    this.excelExport.export(
      `centros_de_costo_${this.filterLabel.toLowerCase()}`,
      [{ name: 'Centros de Costo', rows }]
    );
  }

  async exportPdf(): Promise<void> {
    if (this.exportingPdf()) return;
    this.exportingPdf.set(true);
    try {
      const data = this.visibleNodes().map(node => ({
        depth:       node.depth,
        code:        node.code,
        name:        node.name,
        type:        this.TYPE_LABELS[node.type],
        parentName:  this.getParentName(node.parentId),
        isActive:    node.isActive ? 'Activo' : 'Inactivo',
        description: node.description ?? ''
      }));
      await this.pdfSvc.downloadPdf({
        reportType: 'cost-centers',
        companyId:  this.tenantSvc.companyId,
        periodName: `Estado: ${this.filterLabel}`,
        data,
        extraData: {
          userName:  this.authSvc.user()?.displayName || this.authSvc.user()?.email || '',
          logoUrl:   this.tenantSvc.logoUrl ?? '',
          showLogo:  this.tenantSvc.company?.showLogoOnPdf ?? false,
          pdfFooter: this.tenantSvc.company?.pdfFooterMessage ?? ''
        }
      });
    } catch (err: any) {
      this.notifications.error('Error generando PDF: ' + (err?.message ?? err));
    } finally {
      this.exportingPdf.set(false);
    }
  }
}
