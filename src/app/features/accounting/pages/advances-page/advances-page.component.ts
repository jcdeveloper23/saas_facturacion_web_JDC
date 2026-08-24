import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil, take, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import {
  CardModule, ButtonModule, GridModule, BadgeModule,
  SpinnerModule, FormModule, ModalModule, TooltipModule,
  InputGroupComponent, InputGroupTextDirective, AlertModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';
import { Timestamp } from '@angular/fire/firestore';

import { AdvancesService, ApplicationTarget } from '../../services/advances.service';
import { BankAccountsService } from '../../services/bank-accounts.service';
import { CustomersService }    from '../../../customers/services/customers.service';
import { PersonasService }     from '../../../personas/services/personas.service';
import { InvoicesService }     from '../../../invoices/services/invoices.service';
import { PurchasesService }    from '../../../purchases/services/purchases.service';
import { NotificationService } from '../../../../core/services/notification.service';

import {
  Advance, AdvancePartyType, ADVANCE_STATUS_LABELS, ADVANCE_STATUS_COLORS
} from '../../models/advance.interface';
import { BankAccount } from '../../models/bank-account.interface';
import { Customer } from '../../../customers/models/customer.interface';
import { Person } from '../../../personas/models/person.interface';

interface PartyOption { id: string; name: string; taxId: string; }

@Component({
  selector: 'app-advances-page',
  standalone: true,
  templateUrl: './advances-page.component.html',
  styleUrl:    './advances-page.component.scss',
  imports: [
    CommonModule, FormsModule,
    CardModule, ButtonModule, GridModule, BadgeModule, SpinnerModule,
    FormModule, ModalModule, TooltipModule, IconModule, AlertModule,
    InputGroupComponent, InputGroupTextDirective
  ]
})
export class AdvancesPageComponent implements OnInit, OnDestroy {
  private advancesSvc    = inject(AdvancesService);
  private bankAccountsSvc = inject(BankAccountsService);
  private customersSvc   = inject(CustomersService);
  private personasSvc    = inject(PersonasService);
  private invoicesSvc    = inject(InvoicesService);
  private purchasesSvc   = inject(PurchasesService);
  private notifications  = inject(NotificationService);
  private destroy$       = new Subject<void>();

  readonly STATUS_LABELS = ADVANCE_STATUS_LABELS;
  readonly STATUS_COLORS = ADVANCE_STATUS_COLORS;

  // ── State ──────────────────────────────────────────────────────────────────
  loading      = signal(true);
  advances     = signal<Advance[]>([]);
  bankAccounts = signal<BankAccount[]>([]);
  customers    = signal<Customer[]>([]);
  suppliers    = signal<Person[]>([]);
  statusFilter = signal<'' | 'open' | 'applied' | 'cancelled'>('');
  searchTerm   = signal('');

  filtered = computed(() => {
    const term   = this.searchTerm().toLowerCase().trim();
    const status = this.statusFilter();
    return this.advances().filter(a => {
      if (status && a.status !== status) return false;
      if (!term) return true;
      return a.partyName.toLowerCase().includes(term) || a.partyTaxId.includes(term);
    });
  });

  // ── Create modal ──────────────────────────────────────────────────────────
  showCreateModal = signal(false);
  creating        = signal(false);
  newPartyType    = signal<AdvancePartyType>('customer');
  newPartyId      = signal('');
  newAmount       = signal(0);
  newBankAccountId = signal('');
  newDate         = signal(this.todayInput());
  newNotes        = signal('');

  partyOptions = computed<PartyOption[]>(() => {
    return this.newPartyType() === 'customer'
      ? this.customers().map(c => ({ id: c.id, name: c.name, taxId: c.taxId }))
      : this.suppliers().map(s => ({ id: s.id, name: s.name, taxId: s.taxId }));
  });

  // ── Apply modal ───────────────────────────────────────────────────────────
  showApplyModal  = signal(false);
  applying        = signal(false);
  applyingAdvance = signal<Advance | null>(null);
  loadingTargets  = signal(false);
  applyTargets    = signal<ApplicationTarget[]>([]);
  selectedTargetId = signal('');

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.advancesSvc.getAdvances().pipe(
      catchError(err => { this.notifications.error('Error cargando anticipos: ' + (err?.message ?? err)); this.loading.set(false); return of([]); }),
      takeUntil(this.destroy$)
    ).subscribe(list => { this.advances.set(list); this.loading.set(false); });

    this.bankAccountsSvc.getBankAccounts().pipe(take(1)).subscribe(list => this.bankAccounts.set(list.filter(a => a.isActive)));
    this.customersSvc.getCustomers().pipe(take(1)).subscribe(list => this.customers.set(list));
    this.personasSvc.getPersonas('supplier').pipe(take(1)).subscribe(list => this.suppliers.set(list.filter(s => s.isActive)));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Create ────────────────────────────────────────────────────────────────
  openCreate(): void {
    this.newPartyType.set('customer');
    this.newPartyId.set('');
    this.newAmount.set(0);
    this.newBankAccountId.set('');
    this.newDate.set(this.todayInput());
    this.newNotes.set('');
    this.showCreateModal.set(true);
  }

  async confirmCreate(): Promise<void> {
    const party = this.partyOptions().find(p => p.id === this.newPartyId());
    const bank  = this.bankAccounts().find(b => b.id === this.newBankAccountId());
    if (!party || !bank || this.newAmount() <= 0) return;

    this.creating.set(true);
    try {
      await this.advancesSvc.createAdvance({
        partyType:  this.newPartyType(),
        partyId:    party.id,
        partyName:  party.name,
        partyTaxId: party.taxId,
        amount:     this.newAmount(),
        bankAccountId:     bank.id,
        bankAccountName:   `${bank.bankName} — ${bank.accountNumber}`,
        bankAccountGlCode: bank.linkedGlCode,
        bankAccountGlName: bank.linkedGlName,
        date:  this.newDate(),
        notes: this.newNotes() || undefined,
      });
      this.notifications.success('Anticipo registrado');
      this.showCreateModal.set(false);
    } catch (err: any) {
      this.notifications.error('Error al registrar: ' + (err?.message ?? err));
    } finally {
      this.creating.set(false);
    }
  }

  // ── Apply ─────────────────────────────────────────────────────────────────
  openApply(advance: Advance): void {
    this.applyingAdvance.set(advance);
    this.selectedTargetId.set('');
    this.applyTargets.set([]);
    this.showApplyModal.set(true);
    this.loadingTargets.set(true);

    const load$ = advance.partyType === 'customer'
      ? this.invoicesSvc.getInvoices({ status: 'issued' })
      : of([]); // compras se resuelven abajo con getAll() + filtro de status, ver comentario

    if (advance.partyType === 'customer') {
      load$.pipe(take(1)).subscribe(list => {
        const targets = list
          .filter(i => i.customerId === advance.partyId && !i.isPaid && !i.isVoid && i.total <= advance.remainingAmount + 0.01)
          .map(i => ({ id: i.id, fullNumber: i.fullNumber, total: i.total }));
        this.applyTargets.set(targets);
        this.loadingTargets.set(false);
      });
    } else {
      this.purchasesSvc.getAll().pipe(take(1)).subscribe(list => {
        const targets = list
          .filter(p => p.supplierId === advance.partyId && !p.isPaid && p.status === 'received' && p.total <= advance.remainingAmount + 0.01)
          .map(p => ({ id: p.id, fullNumber: p.fullNumber, total: p.total }));
        this.applyTargets.set(targets);
        this.loadingTargets.set(false);
      });
    }
  }

  async confirmApply(): Promise<void> {
    const advance = this.applyingAdvance();
    const target  = this.applyTargets().find(t => t.id === this.selectedTargetId());
    if (!advance || !target) return;

    this.applying.set(true);
    try {
      if (advance.partyType === 'customer') {
        await this.advancesSvc.applyToInvoice(advance, target);
      } else {
        await this.advancesSvc.applyToPurchase(advance, target);
      }
      this.notifications.success(`Anticipo aplicado a ${target.fullNumber}`);
      this.showApplyModal.set(false);
    } catch (err: any) {
      this.notifications.error('Error al aplicar: ' + (err?.message ?? err));
    } finally {
      this.applying.set(false);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  formatDate(ts: Timestamp | undefined): string {
    if (!ts) return '—';
    return ts.toDate().toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  private todayInput(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  trackById(_: number, item: { id: string }): string { return item.id; }
}
