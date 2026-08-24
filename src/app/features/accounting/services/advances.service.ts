import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, doc, onSnapshot, updateDoc,
  addDoc, query, orderBy, Timestamp
} from '@angular/fire/firestore';
import { Observable, firstValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';

import { TenantService }   from '../../../core/services/tenant.service';
import { AuthService }     from '../../../core/services/auth.service';
import { JournalEntriesService }    from './journal-entries.service';
import { AccountingSettingsService } from './accounting-settings.service';
import { AccountingPeriodsService }  from './accounting-periods.service';
import { ChartOfAccountsService }    from './chart-of-accounts.service';
import { DEFAULT_ACCOUNT_MAPPING } from '../models/accounting-settings.interface';
import { Advance, AdvanceApplication, AdvancePartyType } from '../models/advance.interface';

export interface CreateAdvanceInput {
  partyType:       AdvancePartyType;
  partyId:         string;
  partyName:       string;
  partyTaxId:      string;
  amount:          number;
  bankAccountId:      string;
  bankAccountName:    string; // display: "Banco Pichincha — ****1234"
  bankAccountGlCode:  string; // cuenta contable vinculada (linkedGlCode)
  bankAccountGlName:  string;
  date:            string; // yyyy-mm-dd
  notes?:          string;
}

/** Documento mínimo de factura/compra necesario para aplicar un anticipo. */
export interface ApplicationTarget {
  id:         string;
  fullNumber: string;
  total:      number;
}

function round2(n: number): number { return Math.round(n * 100) / 100; }

@Injectable({ providedIn: 'root' })
export class AdvancesService {
  private firestore     = inject(Firestore);
  private tenantService = inject(TenantService);
  private authService   = inject(AuthService);
  private journalSvc    = inject(JournalEntriesService);
  private settingsSvc   = inject(AccountingSettingsService);
  private periodsSvc    = inject(AccountingPeriodsService);
  private chartSvc      = inject(ChartOfAccountsService);

  private get companyId(): string { return this.tenantService.companyId; }
  private get colPath(): string   { return `companies/${this.companyId}/advances`; }

  // ─── List ─────────────────────────────────────────────────────────────────

  getAdvances(): Observable<Advance[]> {
    return new Observable<Advance[]>(observer => {
      const ref = collection(this.firestore, this.colPath);
      return onSnapshot(query(ref, orderBy('date', 'desc')), {
        next:  snap => observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() } as Advance))),
        error: err  => { console.error('[AdvancesService] getAdvances error:', err); observer.error(err); }
      });
    });
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private async resolveOpenPeriod(dateStr: string): Promise<{ id: string; year: number }> {
    const year = new Date(dateStr + 'T00:00:00').getFullYear();
    const periods = await firstValueFrom(this.periodsSvc.getPeriods().pipe(take(1)));
    const period = periods.find(p => p.year === year && p.status === 'open');
    if (!period) throw new Error(`No hay un período contable abierto para ${year}.`);
    return { id: period.id, year: period.year };
  }

  private async resolveAccountName(code: string, fallback: string): Promise<string> {
    const accounts = await firstValueFrom(this.chartSvc.getActiveMovementAccounts().pipe(take(1)));
    return accounts.find(a => a.code === code)?.name ?? fallback;
  }

  private async resolveMapping() {
    const settings = await firstValueFrom(this.settingsSvc.getSettings().pipe(take(1)));
    const mapping = settings.accountMapping ?? DEFAULT_ACCOUNT_MAPPING;
    return {
      advancesFromCustomers: mapping.advancesFromCustomers || DEFAULT_ACCOUNT_MAPPING.advancesFromCustomers,
      advancesToSuppliers:   mapping.advancesToSuppliers   || DEFAULT_ACCOUNT_MAPPING.advancesToSuppliers,
      accountsReceivable:    mapping.accountsReceivable    || DEFAULT_ACCOUNT_MAPPING.accountsReceivable,
    };
  }

  // ─── Create (recibir/entregar anticipo) ────────────────────────────────────

  async createAdvance(input: CreateAdvanceInput): Promise<string> {
    const mapping = await this.resolveMapping();
    const period  = await this.resolveOpenPeriod(input.date);
    const amount  = round2(input.amount);
    const date    = Timestamp.fromDate(new Date(input.date + 'T00:00:00'));
    const isCustomer = input.partyType === 'customer';

    const advanceAccountCode = isCustomer ? mapping.advancesFromCustomers : mapping.advancesToSuppliers;
    const advanceAccountName = await this.resolveAccountName(
      advanceAccountCode, isCustomer ? 'Anticipo de Clientes' : 'Anticipos a Proveedores'
    );

    const desc = `Anticipo ${isCustomer ? 'recibido de' : 'entregado a'} ${input.partyName}`;

    // Cliente: Debe Banco / Haber Anticipo Clientes (pasivo — le debemos el anticipo).
    // Proveedor: Debe Anticipo a Proveedores (activo) / Haber Banco.
    const bankLine = {
      id: crypto.randomUUID(), accountCode: input.bankAccountGlCode, accountName: input.bankAccountGlName,
      debit: 0, credit: 0, costCenterId: null, costCenterName: null, description: desc
    };
    const lines = isCustomer
      ? [
          { ...bankLine, debit: amount, credit: 0 },
          { id: crypto.randomUUID(), accountCode: advanceAccountCode, accountName: advanceAccountName, debit: 0, credit: amount, costCenterId: null, costCenterName: null, description: desc },
        ]
      : [
          { id: crypto.randomUUID(), accountCode: advanceAccountCode, accountName: advanceAccountName, debit: amount, credit: 0, costCenterId: null, costCenterName: null, description: desc },
          { ...bankLine, debit: 0, credit: amount },
        ];

    const entryId = await this.journalSvc.createEntry({
      date,
      description: desc,
      periodId:   period.id,
      periodYear: period.year,
      type:       'manual',
      status:     'draft',
      reference:  input.partyName,
      lines,
    });
    await this.journalSvc.postEntry(entryId);

    const userId = this.authService.user()?.uid ?? 'unknown';
    const now = Timestamp.now();
    const advance: Omit<Advance, 'id'> = {
      partyType:  input.partyType,
      partyId:    input.partyId,
      partyName:  input.partyName,
      partyTaxId: input.partyTaxId,
      amount,
      remainingAmount: amount,
      bankAccountId:   input.bankAccountId,
      bankAccountName: input.bankAccountName,
      date,
      status: 'open',
      journalEntryId: entryId,
      applications: [],
      notes: input.notes || undefined,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    };

    const ref = await addDoc(collection(this.firestore, this.colPath), this.cleanDoc(advance));
    return ref.id;
  }

  // ─── Apply (aplicar contra factura/compra) ─────────────────────────────────

  async applyToInvoice(advance: Advance, invoice: ApplicationTarget): Promise<void> {
    await this.apply(advance, invoice, 'invoice', `companies/${this.companyId}/invoices/${invoice.id}`);
  }

  async applyToPurchase(advance: Advance, purchase: ApplicationTarget): Promise<void> {
    await this.apply(advance, purchase, 'purchase', `companies/${this.companyId}/purchases/${purchase.id}`);
  }

  private async apply(
    advance: Advance, target: ApplicationTarget, targetType: 'invoice' | 'purchase', targetDocPath: string
  ): Promise<void> {
    const total = round2(target.total);
    if (total > advance.remainingAmount) {
      throw new Error(`El anticipo disponible (${advance.remainingAmount.toFixed(2)}) no alcanza para cubrir el documento (${total.toFixed(2)}).`);
    }

    const mapping = await this.resolveMapping();
    const isCustomer = advance.partyType === 'customer';
    const dateStr = new Date().toISOString().slice(0, 10);
    const period  = await this.resolveOpenPeriod(dateStr);

    const advanceAccountCode = isCustomer ? mapping.advancesFromCustomers : mapping.advancesToSuppliers;
    const advanceAccountName = await this.resolveAccountName(
      advanceAccountCode, isCustomer ? 'Anticipo de Clientes' : 'Anticipos a Proveedores'
    );
    // Proveedores no tienen "Cuentas por Pagar" configurable en AccountMapping
    // (es fija en todo el sistema, ver PURCHASE_FIXED_ACCOUNTS en el backend) —
    // se replica el mismo código fijo acá para consistencia.
    const counterAccountCode = isCustomer ? mapping.accountsReceivable : '2.1.01.001';
    const counterAccountName = isCustomer
      ? await this.resolveAccountName(counterAccountCode, 'Cuentas por Cobrar Clientes')
      : 'Cuentas por Pagar Proveedores';

    const desc = `Aplicación anticipo ${advance.partyName} — ${target.fullNumber}`;

    // Cliente: Debe Anticipo Clientes (se reduce el pasivo) / Haber CxC (se reduce lo que debe).
    // Proveedor: Debe CxP (se reduce lo que debemos) / Haber Anticipo a Proveedores (se reduce el activo).
    const lines = isCustomer
      ? [
          { id: crypto.randomUUID(), accountCode: advanceAccountCode, accountName: advanceAccountName, debit: total, credit: 0, costCenterId: null, costCenterName: null, description: desc },
          { id: crypto.randomUUID(), accountCode: counterAccountCode, accountName: counterAccountName, debit: 0, credit: total, costCenterId: null, costCenterName: null, description: desc },
        ]
      : [
          { id: crypto.randomUUID(), accountCode: counterAccountCode, accountName: counterAccountName, debit: total, credit: 0, costCenterId: null, costCenterName: null, description: desc },
          { id: crypto.randomUUID(), accountCode: advanceAccountCode, accountName: advanceAccountName, debit: 0, credit: total, costCenterId: null, costCenterName: null, description: desc },
        ];

    const entryId = await this.journalSvc.createEntry({
      date: Timestamp.now(),
      description: desc,
      periodId:   period.id,
      periodYear: period.year,
      type:       'manual',
      status:     'draft',
      reference:  target.fullNumber,
      referenceId: target.id,
      lines,
    });
    await this.journalSvc.postEntry(entryId);

    // Marca el documento como pagado SIN paymentBankAccountId — el trigger de
    // pago (generate-journal-entry-from-{invoice,purchase}-payment.ts) ya
    // tiene el guard "if (!after.paymentBankAccountId) return;", así que no
    // genera un segundo asiento de banco duplicado (acá no entró/salió dinero
    // del banco en este momento, ya había entrado/salido cuando se recibió el
    // anticipo).
    await updateDoc(doc(this.firestore, targetDocPath), {
      status:         'paid',
      isPaid:         true,
      paidAt:         Timestamp.now(),
      paymentEntryId: entryId,
      updatedAt:      Timestamp.now(),
    });

    const application: AdvanceApplication = {
      targetId:      target.id,
      targetType,
      targetLabel:   target.fullNumber,
      appliedAmount: total,
      appliedAt:     Timestamp.now(),
      entryId,
    };
    const remainingAmount = round2(advance.remainingAmount - total);
    await updateDoc(doc(this.firestore, `${this.colPath}/${advance.id}`), this.cleanDoc({
      remainingAmount,
      status: remainingAmount <= 0.01 ? 'applied' : 'open',
      applications: [...advance.applications, application],
      updatedAt: Timestamp.now(),
    }));
  }

  // ─── Firestore safe serialization ─────────────────────────────────────────

  private cleanDoc<T>(obj: T): T {
    if (obj === undefined) return null as T;
    if (obj === null)      return null as T;
    if (typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(i => this.cleanDoc(i)) as unknown as T;
    if ((obj as any).constructor !== Object) return obj;
    const result: any = {};
    for (const key of Object.keys(obj as object)) {
      result[key] = this.cleanDoc((obj as any)[key]);
    }
    return result as T;
  }
}
