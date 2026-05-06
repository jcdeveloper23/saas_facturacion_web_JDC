import {
  Component, OnInit, OnDestroy, inject, signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import {
  SpinnerModule, BadgeModule, CardModule, ButtonModule, TableModule,
  FormModule, GridModule, AlertModule, ModalModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';

import { PosSalesService } from '../services/pos-sales.service';
import { PosCashService }  from '../services/pos-cash.service';
import { PosSessionService } from '../services/pos-session.service';
import { PosHardwareService } from '../services/pos-hardware.service';
import { NotificationService } from '../../../core/services/notification.service';
import { TenantService } from '../../../core/services/tenant.service';
import { PosSale, PosSession } from '../models/pos.interface';

type FilterStatus = 'all' | 'completed' | 'void';

@Component({
  selector: 'app-pos-history',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    SpinnerModule, BadgeModule, CardModule, ButtonModule, TableModule,
    FormModule, GridModule, AlertModule, ModalModule, IconModule
  ],
  templateUrl: './pos-history.component.html',
  styleUrl: './pos-history.component.scss'
})
export class PosHistoryComponent implements OnInit, OnDestroy {
  private destroy$     = new Subject<void>();
  private salesService = inject(PosSalesService);
  private cashService  = inject(PosCashService);
  readonly posSession  = inject(PosSessionService);
  private hardware     = inject(PosHardwareService);
  private tenantService= inject(TenantService);
  private router       = inject(Router);
  private notify       = inject(NotificationService);

  static readonly PAGE_SIZE = 50;

  // ── Data ───────────────────────────────────────────────────────────────────
  readonly sessions = signal<PosSession[]>([]);
  readonly sales    = signal<PosSale[]>([]);
  readonly selected = signal<PosSale | null>(null);
  readonly loading  = signal(true);
  readonly voiding  = signal(false);
  readonly printing = signal(false);

  selectedSessionId = '';

  // ── Filters ────────────────────────────────────────────────────────────────
  readonly filterStatus = signal<FilterStatus>('all');
  readonly filterQuery  = signal('');
  readonly currentPage  = signal(1);

  // ── Void modal ─────────────────────────────────────────────────────────────
  readonly showVoidModal = signal(false);
  readonly saleToVoid    = signal<PosSale | null>(null);

  // ── Computed ───────────────────────────────────────────────────────────────

  readonly completedCount = computed(() => this.sales().filter(s => s.status === 'completed').length);

  readonly filteredSales = computed(() => {
    let list = this.sales();
    const status = this.filterStatus();
    if (status !== 'all') list = list.filter(s => s.status === status);
    const q = this.filterQuery().toLowerCase().trim();
    if (q) list = list.filter(s =>
      String(s.ticketNumber).includes(q) ||
      s.customerName.toLowerCase().includes(q)
    );
    return list;
  });

  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.filteredSales().length / PosHistoryComponent.PAGE_SIZE))
  );

  readonly paginatedSales = computed(() => {
    const page  = this.currentPage();
    const start = (page - 1) * PosHistoryComponent.PAGE_SIZE;
    return this.filteredSales().slice(start, start + PosHistoryComponent.PAGE_SIZE);
  });

  readonly filteredCompletedCount = computed(() =>
    this.filteredSales().filter(s => s.status === 'completed').length
  );

  readonly filteredTotal = computed(() =>
    this.filteredSales().filter(s => s.status === 'completed').reduce((a, s) => a + s.total, 0)
  );

  readonly isFiltered = computed(() =>
    this.filterStatus() !== 'all' || this.filterQuery().trim() !== ''
  );

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.cashService.getSessions(undefined, 20)
      .pipe(takeUntil(this.destroy$))
      .subscribe(s => {
        this.sessions.set(s);
        const active = this.posSession.activeSession();
        if (active) {
          this.selectedSessionId = active.id;
          this.loadSalesForSession(active.id);
        } else if (s.length > 0) {
          this.selectedSessionId = s[0].id;
          this.loadSalesForSession(s[0].id);
        }
        this.loading.set(false);
      });
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  // ── Session ────────────────────────────────────────────────────────────────

  onSessionChange(sessionId: string): void {
    this.selectedSessionId = sessionId;
    this.resetFilters();
    this.loadSalesForSession(sessionId);
  }

  private loadSalesForSession(sessionId: string): void {
    this.loading.set(true);
    this.selected.set(null);
    this.salesService.getSales(sessionId, 200)
      .pipe(takeUntil(this.destroy$))
      .subscribe(s => { this.sales.set(s); this.loading.set(false); });
  }

  // ── Filters ────────────────────────────────────────────────────────────────

  setFilter(status: FilterStatus): void {
    this.filterStatus.set(status);
    this.currentPage.set(1);
    this.selected.set(null);
  }

  onQueryChange(q: string): void {
    this.filterQuery.set(q);
    this.currentPage.set(1);
    this.selected.set(null);
  }

  resetFilters(): void {
    this.filterStatus.set('all');
    this.filterQuery.set('');
    this.currentPage.set(1);
    this.selected.set(null);
  }

  // ── Pagination ─────────────────────────────────────────────────────────────

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.currentPage.set(page);
    this.selected.set(null);
  }

  get pages(): number[] {
    return Array.from({ length: this.totalPages() }, (_, i) => i + 1);
  }

  // ── Selection ──────────────────────────────────────────────────────────────

  selectSale(sale: PosSale): void {
    this.selected.set(this.selected()?.id === sale.id ? null : sale);
  }

  // ── Void ───────────────────────────────────────────────────────────────────

  openVoidModal(sale: PosSale, event: Event): void {
    event.stopPropagation();
    this.saleToVoid.set(sale);
    this.showVoidModal.set(true);
  }

  async confirmVoid(): Promise<void> {
    const sale = this.saleToVoid();
    if (!sale) return;
    this.voiding.set(true);
    try {
      await this.salesService.voidSale(sale.id);
      this.notify.success('Ticket anulado', `#${sale.ticketNumber}`);
      this.showVoidModal.set(false);
      this.saleToVoid.set(null);
      this.selected.set(null);
    } catch (err: any) {
      this.notify.error('Error anulando ticket', err.message);
    } finally {
      this.voiding.set(false);
    }
  }

  cancelVoid(): void {
    this.showVoidModal.set(false);
    this.saleToVoid.set(null);
  }

  // ── Reprint ────────────────────────────────────────────────────────────────

  async reprintTicket(sale: PosSale, event: Event): Promise<void> {
    event.stopPropagation();
    if (this.printing()) return;
    this.printing.set(true);
    try {
      const company = this.tenantService.company;
      const terminal = this.posSession.activeTerminal();
      const html = this.hardware.buildTicketHtml({
        companyName:  company?.name  ?? '',
        companyTaxId: company?.taxId ?? '',
        terminalName: sale.terminalName ?? terminal?.name ?? '',
        ticketNumber: sale.ticketNumber,
        date:         sale.createdAt.toDate(),
        cashier:      sale.userName,
        customer:     sale.customerName,
        lines:        sale.lines.map(l => ({
          name:  l.productShortName ?? l.productName,
          qty:   l.quantity,
          price: l.salePrice,
          total: l.lineTotal
        })),
        subtotal:  sale.subtotal,
        vatAmount: sale.vatAmount,
        total:     sale.total,
        payments:  sale.payments.map(p => ({ label: p.methodLabel, amount: p.amount })),
        change:    sale.change,
      });
      await this.hardware.printTicket(html, terminal ?? undefined);
      this.notify.success('', `Ticket #${sale.ticketNumber} enviado a impresora`);
    } catch (err: any) {
      this.notify.error('Error al reimprimir', err.message);
    } finally {
      this.printing.set(false);
    }
  }

  // ── Navigation ─────────────────────────────────────────────────────────────

  goBack(): void {
    if (this.posSession.hasActiveSession()) {
      this.router.navigate(['/pos/main']);
    } else {
      this.router.navigate(['/pos']);
    }
  }

  totalSales(sales: PosSale[]): number {
    return sales.filter(s => s.status === 'completed').reduce((a, s) => a + s.total, 0);
  }
}
