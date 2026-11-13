import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CardModule, AlertModule, BadgeModule, SpinnerModule } from '@coreui/angular';
import { ActivatedRoute } from '@angular/router';
import { Firestore, collection, onSnapshot, orderBy, query, limit } from '@angular/fire/firestore';

import { TenantService } from '../../../../core/services/tenant.service';

// ─── Anticipos: solo lectura (2026-10-14) ─────────────────────────────────────
//
// El prototipo de esta página registraba y aplicaba anticipos desde el
// navegador, sin transacción y con asientos manuales que se podían anular
// sueltos (y escribía paymentEntryId en la factura). Desde el 2026-10-14 los
// anticipos van por las callables del servidor (registerAdvance, applyAdvance,
// unapplyAdvance, voidAdvance) y se gestionan desde Contabilidad en Conecta.
// Las reglas ya no dejan escribir `advances` desde el cliente. Aquí solo se
// listan.
//
// Anticipos a proveedores (2026-11-13): viven en la misma colección con
// `partyType: 'supplier'` (callables registerSupplierAdvance y
// applySupplierAdvance). La ruta dice cuáles mostrar (`data.partyType`): la
// misma página sirve para /accounting/advances (clientes) y
// /accounting/supplier-advances (proveedores).

export type AdvancePartyType = 'customer' | 'supplier';

/** Si el anticipo es del tipo pedido. Sin `partyType` es de cliente. */
export function isAdvanceOfType(x: Record<string, any>, type: AdvancePartyType): boolean {
  return (x['partyType'] === 'supplier') === (type === 'supplier');
}

interface AdvanceRow {
  id: string;
  number: string;
  partyName: string;
  partyTaxId: string;
  date: Date | null;
  amountCents: number;
  appliedCents: number;
  refundedCents: number;
  availableCents: number;
  status: string;
}

const STATUS: Record<string, { label: string; color: string }> = {
  open:    { label: 'Disponible', color: 'success' },
  applied: { label: 'Aplicado',   color: 'secondary' },
  void:    { label: 'Anulado',    color: 'danger' },
  cancelled: { label: 'Anulado',  color: 'danger' },
};

@Component({
  selector: 'app-advances-page',
  standalone: true,
  templateUrl: './advances-page.component.html',
  imports: [CommonModule, CardModule, AlertModule, BadgeModule, SpinnerModule],
})
export class AdvancesPageComponent implements OnInit, OnDestroy {
  private firestore = inject(Firestore);
  private tenant = inject(TenantService);
  readonly partyType: AdvancePartyType =
    inject(ActivatedRoute).snapshot.data['partyType'] === 'supplier' ? 'supplier' : 'customer';
  readonly isSupplier = this.partyType === 'supplier';
  private unsub: (() => void) | null = null;

  readonly rows = signal<AdvanceRow[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');

  ngOnInit(): void {
    const ref = collection(this.firestore, `companies/${this.tenant.companyId}/advances`);
    // Un solo campo ordenado (sin índice compuesto): el tipo se filtra aquí.
    this.unsub = onSnapshot(query(ref, orderBy('date', 'desc'), limit(500)), {
      next: (snap) => {
        this.rows.set(snap.docs.filter((d) => isAdvanceOfType(d.data(), this.partyType)).map((d) => {
          const x = d.data() as Record<string, any>;
          return {
            id: d.id,
            number: String(x['number'] ?? ''),
            partyName: String(x['partyName'] ?? ''),
            partyTaxId: String(x['partyTaxId'] ?? ''),
            date: x['date']?.toDate?.() ?? null,
            // Los del prototipo viejo guardaban `amount` / `remainingAmount` en dólares.
            amountCents: Number.isInteger(x['amountCents']) ? x['amountCents'] : Math.round(Number(x['amount'] ?? 0) * 100),
            appliedCents: Number.isInteger(x['appliedCents']) ? x['appliedCents'] : 0,
            // Devoluciones por el banco (refundAdvance, 2026-11-13).
            refundedCents: Number.isInteger(x['refundedCents']) ? x['refundedCents'] : 0,
            availableCents: Number.isInteger(x['availableCents']) ? x['availableCents'] : Math.round(Number(x['remainingAmount'] ?? 0) * 100),
            status: String(x['status'] ?? ''),
          };
        }));
        this.loading.set(false);
      },
      error: (err) => {
        console.error('[AdvancesPage]', err);
        this.error.set('No se pudieron leer los anticipos.');
        this.loading.set(false);
      },
    });
  }

  ngOnDestroy(): void { this.unsub?.(); }

  status(s: string) { return STATUS[s] ?? { label: s || '—', color: 'light' }; }
  money(cents: number): string { return (cents / 100).toLocaleString('es-EC', { style: 'currency', currency: 'USD' }); }
}
