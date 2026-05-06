import {
  Component, OnInit, OnDestroy, inject, signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import {
  SpinnerModule, AlertModule, CardModule, BadgeModule,
  ButtonModule, GridModule, FormModule, TableModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';

import { PosCashService }    from '../services/pos-cash.service';
import { PosSalesService }   from '../services/pos-sales.service';
import { PosSessionService } from '../services/pos-session.service';
import { NotificationService } from '../../../core/services/notification.service';
import { PosCashMovement, PosSale, PosSession } from '../models/pos.interface';

@Component({
  selector: 'app-pos-close',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    SpinnerModule, AlertModule, CardModule, BadgeModule, IconModule,
    ButtonModule, GridModule, FormModule, TableModule
  ],
  templateUrl: './pos-close.component.html',
  styleUrl: './pos-close.component.scss'
})
export class PosCloseComponent implements OnInit, OnDestroy {
  private destroy$     = new Subject<void>();
  private cashService  = inject(PosCashService);
  private salesService = inject(PosSalesService);
  readonly posSession  = inject(PosSessionService);
  private router       = inject(Router);
  private notify       = inject(NotificationService);

  readonly session    = this.posSession.activeSession;
  readonly terminal   = this.posSession.activeTerminal;
  readonly sales      = signal<PosSale[]>([]);
  readonly movements  = signal<PosCashMovement[]>([]);
  readonly loading    = signal(true);
  readonly closing    = signal(false);
  readonly closed     = signal(false);
  readonly closeResult= signal<{ expectedBalance: number; difference: number } | null>(null);

  closingBalance = 0;
  closingNotes   = '';

  // ── Computed report ────────────────────────────────────────────────────────

  readonly totalSales     = computed(() => this.sales().reduce((s, v) => s + v.total, 0));
  readonly totalCash      = computed(() => this.sales().reduce((s, v) => s + v.payments.filter(p => p.method === 'cash').reduce((a, p) => a + p.amount, 0), 0));
  readonly totalCard      = computed(() => this.sales().reduce((s, v) => s + v.payments.filter(p => p.method === 'card').reduce((a, p) => a + p.amount, 0), 0));
  readonly totalTransfer  = computed(() => this.sales().reduce((s, v) => s + v.payments.filter(p => p.method === 'transfer').reduce((a, p) => a + p.amount, 0), 0));
  readonly totalCashIn    = computed(() => this.movements().filter(m => m.type === 'cash_in').reduce((s, m) => s + m.amount, 0));
  readonly totalCashOut   = computed(() => this.movements().filter(m => m.type === 'cash_out').reduce((s, m) => s + m.amount, 0));

  readonly expectedBalance = computed(() => {
    const s = this.session();
    if (!s) return 0;
    return round2(s.openingBalance + this.totalCash() + this.totalCashIn() - this.totalCashOut());
  });

  ngOnInit(): void {
    if (!this.posSession.hasActiveSession()) {
      this.router.navigate(['/pos']);
      return;
    }

    const sessionId = this.session()!.id;

    this.salesService.getSales(sessionId, 500)
      .pipe(takeUntil(this.destroy$))
      .subscribe(s => { this.sales.set(s); this.loading.set(false); });

    this.cashService.getMovements(sessionId)
      .pipe(takeUntil(this.destroy$))
      .subscribe(m => this.movements.set(m));
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  async closeSession(): Promise<void> {
    const session  = this.session();
    const terminal = this.terminal();
    if (!session || !terminal) return;
    if (this.closing()) return;

    this.closing.set(true);
    try {
      const result = await this.cashService.closeSession(
        session.id,
        terminal.id,
        this.closingBalance,
        this.closingNotes || undefined
      );
      this.closeResult.set(result);
      this.closed.set(true);
      this.posSession.clearSession();
      this.notify.success('Caja cerrada', `Diferencia: $${result.difference.toFixed(2)}`);
    } catch (err: any) {
      this.notify.error('Error cerrando caja', err.message ?? 'Error desconocido');
    } finally {
      this.closing.set(false);
    }
  }

  goBack():    void { this.router.navigate(['/pos/main']); }
  goToLogin(): void { this.router.navigate(['/pos']); }

  printReport(): void {
    // Impresión del navegador con estilos de reporte
    window.print();
  }
}

function round2(n: number): number { return Math.round(n * 100) / 100; }
