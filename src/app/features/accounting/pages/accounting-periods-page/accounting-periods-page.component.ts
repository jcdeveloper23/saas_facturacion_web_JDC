import {
  Component, OnInit, OnDestroy, inject, signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Subject, takeUntil, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import {
  CardModule, ButtonModule, GridModule, BadgeModule,
  SpinnerModule, TableModule, FormModule, ModalModule, TooltipModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';
import { Timestamp } from '@angular/fire/firestore';

import { AccountingPeriodsService } from '../../services/accounting-periods.service';
import { NotificationService }      from '../../../../core/services/notification.service';
import {
  AccountingPeriod, AccountingPeriodStatus,
  PERIOD_STATUS_LABELS, PERIOD_STATUS_COLORS
} from '../../models/accounting-period.interface';

@Component({
  selector: 'app-accounting-periods-page',
  standalone: true,
  templateUrl: './accounting-periods-page.component.html',
  styleUrl:    './accounting-periods-page.component.scss',
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule,
    CardModule, ButtonModule, GridModule, BadgeModule, SpinnerModule,
    TableModule, FormModule, ModalModule, TooltipModule, IconModule
  ]
})
export class AccountingPeriodsPageComponent implements OnInit, OnDestroy {
  private svc           = inject(AccountingPeriodsService);
  private notifications = inject(NotificationService);
  private fb            = inject(FormBuilder);
  private destroy$      = new Subject<void>();

  // ── State ─────────────────────────────────────────────────────────────────
  periods          = signal<AccountingPeriod[]>([]);
  loading          = signal(true);
  showModal        = signal(false);
  editingId        = signal<string | null>(null);
  saving           = signal(false);
  generatingOpening = signal<string | null>(null);  // periodId en proceso

  // Cierre mensual
  togglingMonthlyClose = signal<string | null>(null); // periodId en proceso
  closeMonthModalOpen   = signal(false);
  closeMonthTarget      = signal<AccountingPeriod | null>(null);
  closeMonthValue       = signal('');   // input type=month → 'yyyy-MM'
  closingMonth          = signal(false);

  // ── Form ──────────────────────────────────────────────────────────────────
  form = this.fb.group({
    year:      [new Date().getFullYear(), [Validators.required, Validators.min(2000), Validators.max(2099)]],
    name:      ['', Validators.required],
    startDate: ['', Validators.required],
    endDate:   ['', Validators.required],
    status:    ['open' as AccountingPeriodStatus],
    notes:     ['']
  });

  readonly STATUS_LABELS = PERIOD_STATUS_LABELS;
  readonly STATUS_COLORS = PERIOD_STATUS_COLORS;
  readonly statuses: AccountingPeriodStatus[] = ['open','closed','locked'];

  statusFilter = signal<AccountingPeriodStatus | 'all'>('all');

  readonly tabOptions: { value: AccountingPeriodStatus | 'all'; label: string }[] = [
    { value: 'all',    label: 'Todos'     },
    { value: 'open',   label: 'Abiertos'  },
    { value: 'closed', label: 'Cerrados'  },
    { value: 'locked', label: 'Bloqueados'},
  ];

  // ── Computed ──────────────────────────────────────────────────────────────
  counts = computed(() => {
    const all = this.periods();
    return {
      total:  all.length,
      open:   all.filter(p => p.status === 'open').length,
      closed: all.filter(p => p.status === 'closed').length,
      locked: all.filter(p => p.status === 'locked').length,
    };
  });

  filteredPeriods = computed(() => {
    const f = this.statusFilter();
    return f === 'all' ? this.periods() : this.periods().filter(p => p.status === f);
  });

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.svc.getPeriods().pipe(
      catchError(err => {
        this.notifications.error('Error cargando ejercicios: ' + (err?.message ?? err));
        this.loading.set(false);
        return of([]);
      }),
      takeUntil(this.destroy$)
    ).subscribe(list => {
      this.periods.set(list);
      this.loading.set(false);
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Auto-fill name when year changes ─────────────────────────────────────
  onYearChange(): void {
    const year = this.form.value.year;
    if (year) {
      this.form.patchValue({
        name:      `Ejercicio ${year}`,
        startDate: `${year}-01-01`,
        endDate:   `${year}-12-31`
      });
    }
  }

  // ── Modal ─────────────────────────────────────────────────────────────────
  openNew(): void {
    this.editingId.set(null);
    const year = new Date().getFullYear();
    this.form.reset({
      year,
      name:      `Ejercicio ${year}`,
      startDate: `${year}-01-01`,
      endDate:   `${year}-12-31`,
      status:    'open',
      notes:     ''
    });
    this.showModal.set(true);
  }

  openEdit(p: AccountingPeriod, event: Event): void {
    event.stopPropagation();
    this.editingId.set(p.id);
    const start = p.startDate?.toDate ? this.toDateInput(p.startDate.toDate()) : '';
    const end   = p.endDate?.toDate   ? this.toDateInput(p.endDate.toDate())   : '';
    this.form.patchValue({
      year:      p.year,
      name:      p.name,
      startDate: start,
      endDate:   end,
      status:    p.status,
      notes:     p.notes ?? ''
    });
    this.showModal.set(true);
  }

  closeModal(): void {
    this.showModal.set(false);
    this.editingId.set(null);
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  async save(): Promise<void> {
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true);

    const v = this.form.value;
    const input = {
      year:      v.year!,
      name:      v.name!.trim(),
      startDate: Timestamp.fromDate(new Date(v.startDate! + 'T00:00:00')),
      endDate:   Timestamp.fromDate(new Date(v.endDate!   + 'T23:59:59')),
      status:    v.status! as AccountingPeriodStatus,
      notes:     v.notes ?? ''
    };

    try {
      const id = this.editingId();
      if (id) {
        await this.svc.updatePeriod(id, input);
        this.notifications.success('Ejercicio actualizado');
      } else {
        await this.svc.createPeriod(input as any);
        this.notifications.success('Ejercicio creado');
      }
      this.closeModal();
    } catch (err: any) {
      this.notifications.error('Error al guardar: ' + (err?.message ?? err));
    } finally {
      this.saving.set(false);
    }
  }

  // ── Status transitions ────────────────────────────────────────────────────
  async closePeriod(p: AccountingPeriod, event: Event): Promise<void> {
    event.stopPropagation();
    const ok = await this.notifications.confirm({
      title: `¿Cerrar "${p.name}"?`,
      text: 'Una vez cerrado no se podrán agregar más asientos contables a este ejercicio.',
      confirmText: 'Sí, cerrar',
      cancelText: 'Cancelar',
      icon: 'warning'
    });
    if (!ok) return;
    try {
      await this.svc.closePeriod(p.id);
      this.notifications.success('Ejercicio cerrado');
    } catch (err: any) {
      this.notifications.error('Error: ' + (err?.message ?? err));
    }
  }

  async lockPeriod(p: AccountingPeriod, event: Event): Promise<void> {
    event.stopPropagation();
    const ok = await this.notifications.confirm({
      title: `¿Bloquear "${p.name}"?`,
      text: 'El ejercicio quedará bloqueado permanentemente. Esta acción no se puede revertir.',
      confirmText: 'Sí, bloquear',
      cancelText: 'Cancelar',
      icon: 'warning',
      danger: true
    });
    if (!ok) return;
    try {
      await this.svc.lockPeriod(p.id);
      this.notifications.success('Ejercicio bloqueado');
    } catch (err: any) {
      this.notifications.error('Error: ' + (err?.message ?? err));
    }
  }

  async reopenPeriod(p: AccountingPeriod, event: Event): Promise<void> {
    event.stopPropagation();
    const ok = await this.notifications.confirm({
      title: `¿Reabrir "${p.name}"?`,
      text: 'El ejercicio volverá a estar disponible para edición de asientos.',
      confirmText: 'Sí, reabrir',
      cancelText: 'Cancelar',
      icon: 'question'
    });
    if (!ok) return;
    try {
      await this.svc.reopenPeriod(p.id);
      this.notifications.success('Ejercicio reabierto');
    } catch (err: any) {
      this.notifications.error('Error: ' + (err?.message ?? err));
    }
  }

  async generateOpening(p: AccountingPeriod, event: Event): Promise<void> {
    event.stopPropagation();
    const ok = await this.notifications.confirm({
      title: `¿Generar apertura para "${p.name}"?`,
      text: 'Se tomarán los saldos finales del ejercicio anterior como punto de partida.',
      confirmText: 'Generar',
      cancelText: 'Cancelar',
      icon: 'question'
    });
    if (!ok) return;
    this.generatingOpening.set(p.id);
    try {
      const result = await this.svc.generateOpeningEntry(p.id);
      this.notifications.success(result.message);
    } catch (err: any) {
      this.notifications.error('Error al generar apertura: ' + (err?.message ?? err));
    } finally {
      this.generatingOpening.set(null);
    }
  }

  // ── Cierre mensual ────────────────────────────────────────────────────────
  async toggleMonthlyClose(p: AccountingPeriod, event: Event): Promise<void> {
    event.stopPropagation();
    const enabling = !p.monthlyCloseEnabled;
    if (enabling) {
      const ok = await this.notifications.confirm({
        title: `¿Activar cierre mensual para "${p.name}"?`,
        text: 'Podrá cerrar meses individuales para bloquear la edición de asientos con fecha anterior.',
        confirmText: 'Activar',
        cancelText: 'Cancelar',
        icon: 'question'
      });
      if (!ok) return;
    }

    this.togglingMonthlyClose.set(p.id);
    try {
      await this.svc.setMonthlyCloseEnabled(p.id, enabling);
      this.notifications.success(enabling ? 'Cierre mensual activado' : 'Cierre mensual desactivado');
    } catch (err: any) {
      this.notifications.error('Error: ' + (err?.message ?? err));
    } finally {
      this.togglingMonthlyClose.set(null);
    }
  }

  openCloseMonthModal(p: AccountingPeriod, event: Event): void {
    event.stopPropagation();
    this.closeMonthTarget.set(p);
    const cutoff = p.monthlyCloseCutoff?.toDate ? p.monthlyCloseCutoff.toDate() : null;
    const next   = cutoff ? new Date(cutoff.getFullYear(), cutoff.getMonth() + 1, 1) : new Date(p.year, 0, 1);
    this.closeMonthValue.set(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`);
    this.closeMonthModalOpen.set(true);
  }

  closeMonthModalDismiss(): void {
    this.closeMonthModalOpen.set(false);
    this.closeMonthTarget.set(null);
  }

  async confirmCloseMonth(): Promise<void> {
    const p = this.closeMonthTarget();
    const monthStr = this.closeMonthValue();
    if (!p || !monthStr) return;

    const [yearStr, monthNumStr] = monthStr.split('-');
    const year  = parseInt(yearStr, 10);
    const month = parseInt(monthNumStr, 10); // 1-12
    // Último instante del mes elegido (día 0 del mes siguiente = último día de este mes)
    const cutoffDate = new Date(year, month, 0, 23, 59, 59, 999);
    const cutoffTs   = Timestamp.fromDate(cutoffDate);

    this.closingMonth.set(true);
    try {
      await this.svc.closeMonthsUpTo(p.id, cutoffTs);
      this.notifications.success(
        `Meses cerrados hasta ${cutoffDate.toLocaleDateString('es-EC', { month: 'long', year: 'numeric' })}`
      );
      this.closeMonthModalDismiss();
    } catch (err: any) {
      this.notifications.error('Error: ' + (err?.message ?? err));
    } finally {
      this.closingMonth.set(false);
    }
  }

  monthlyCloseStatusLabel(p: AccountingPeriod): string {
    if (!p.monthlyCloseEnabled) return 'Inactivo';
    if (!p.monthlyCloseCutoff) return 'Sin meses cerrados';
    const d = p.monthlyCloseCutoff.toDate();
    return 'Cerrado hasta ' + d.toLocaleDateString('es-EC', { month: 'short', year: 'numeric' });
  }

  get activeFilterLabel(): string {
    const f = this.statusFilter();
    return f === 'all' ? '' : (PERIOD_STATUS_LABELS[f] ?? f);
  }

  // ── Formatters ────────────────────────────────────────────────────────────
  private toDateInput(d: Date): string {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  formatDate(ts: any): string {
    if (!ts) return '—';
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  trackById(_: number, item: { id: string }): string { return item.id; }
}
