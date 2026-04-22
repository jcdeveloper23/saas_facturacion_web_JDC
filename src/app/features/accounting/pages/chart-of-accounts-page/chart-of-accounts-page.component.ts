import {
  Component, OnInit, OnDestroy, inject, signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Subject, takeUntil, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import {
  CardModule, ButtonModule, GridModule, BadgeModule,
  SpinnerModule, TableModule, FormModule, ModalModule,
  TooltipModule, InputGroupComponent, InputGroupTextDirective
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';

import { ChartOfAccountsService } from '../../services/chart-of-accounts.service';
import { NotificationService }    from '../../../../core/services/notification.service';
import {
  Account, AccountType, AccountNature, AccountTreeNode,
  ACCOUNT_TYPE_LABELS, ACCOUNT_TYPE_COLORS, ACCOUNT_NATURE_LABELS,
  buildAccountTree, flattenTree, defaultNatureForType, levelFromCode, parentCodeFromCode
} from '../../models/account.interface';

@Component({
  selector: 'app-chart-of-accounts-page',
  standalone: true,
  templateUrl: './chart-of-accounts-page.component.html',
  styleUrl:    './chart-of-accounts-page.component.scss',
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule,
    CardModule, ButtonModule, GridModule, BadgeModule, SpinnerModule,
    TableModule, FormModule, ModalModule, TooltipModule, IconModule,
    InputGroupComponent, InputGroupTextDirective
  ]
})
export class ChartOfAccountsPageComponent implements OnInit, OnDestroy {
  private svc           = inject(ChartOfAccountsService);
  private notifications = inject(NotificationService);
  private fb            = inject(FormBuilder);
  private destroy$      = new Subject<void>();

  // ── State ─────────────────────────────────────────────────────────────────
  accounts    = signal<Account[]>([]);
  loading     = signal(true);
  searchTerm  = signal('');
  treeMode    = signal(true);
  showModal   = signal(false);
  editingId   = signal<string | null>(null);
  saving      = signal(false);
  seeding     = signal(false);
  typeFilter  = signal<AccountType | null>(null);

  // ── Tree state ─────────────────────────────────────────────────────────────
  private treeNodes = signal<AccountTreeNode[]>([]);

  // ── Form ──────────────────────────────────────────────────────────────────
  form = this.fb.group({
    code:           ['', [Validators.required, Validators.pattern(/^[\d.]+$/)]],
    name:           ['', [Validators.required, Validators.minLength(2)]],
    type:           ['activo' as AccountType, Validators.required],
    nature:         ['deudora' as AccountNature, Validators.required],
    allowsMovement: [false as boolean],
    isActive:       [true as boolean],
    description:    ['']
  });

  // ── Lookups ───────────────────────────────────────────────────────────────
  readonly TYPE_LABELS   = ACCOUNT_TYPE_LABELS;
  readonly TYPE_COLORS   = ACCOUNT_TYPE_COLORS;
  readonly NATURE_LABELS = ACCOUNT_NATURE_LABELS;
  readonly accountTypes: AccountType[] = ['activo','pasivo','patrimonio','ingreso','costo','gasto','resultado'];

  // ── Computed: flat tree (visible nodes only) ──────────────────────────────
  visibleNodes = computed(() => {
    const tree = this.treeNodes();
    return flattenTree(tree);
  });

  // ── Computed: filtered flat list (search mode) ────────────────────────────
  filteredFlat = computed(() => {
    const term = this.searchTerm().toLowerCase().trim();
    const type = this.typeFilter();
    let list   = this.accounts();
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
      total:  all.length,
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
      code:           acc.code,
      name:           acc.name,
      type:           acc.type,
      nature:         acc.nature,
      allowsMovement: acc.allowsMovement,
      isActive:       acc.isActive,
      description:    acc.description ?? ''
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
        code:           v.code!.trim(),
        name:           v.name!.trim(),
        type:           v.type! as AccountType,
        nature:         v.nature! as AccountNature,
        allowsMovement: v.allowsMovement ?? false,
        isAuxiliary:    v.allowsMovement ?? false,
        isActive:       v.isActive ?? true,
        description:    v.description ?? '',
        level:          levelFromCode(v.code!.trim()),
        parentCode:     parentCodeFromCode(v.code!.trim())
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

  // ── Helpers ───────────────────────────────────────────────────────────────
  get isSearching(): boolean { return !!this.searchTerm().trim() || !!this.typeFilter(); }

  setTypeFilter(type: AccountType | null): void { this.typeFilter.set(type); }

  indentPx(level: number): string { return `${(level - 1) * 20}px`; }

  trackById(_: number, item: { id: string }): string { return item.id; }
  trackByCode(_: number, item: { code: string }): string { return item.code; }
}
