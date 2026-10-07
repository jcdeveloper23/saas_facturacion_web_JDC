// ─── Qué asientos cuentan para los saldos ─────────────────────────────────────
//
// Al anular un documento (factura, ND, retención, compra), generateReversalEntry
// crea una reversa 'posted' (type 'adjustment', reversalOf = asiento original) y
// marca el original 'cancelled' con reversalEntryId. Si solo se sumaran los
// 'posted', la reversa entraría sin su original y el efecto de la anulación se
// contaría dos veces, con signo contrario.
//
// Regla (la misma que usa Conecta en sus reportes):
//   - 'posted'                          → cuenta.
//   - 'cancelled' CON reversalEntryId   → cuenta (su reversa lo neutraliza).
//   - 'cancelled' sin reversalEntryId   → no cuenta (anulación manual, sin reversa).
//   - 'draft' o cualquier otro estado   → nunca cuenta.
//
// Cada asiento cuenta en el ejercicio al que pertenece (periodId / periodYear).
// La reversa hereda periodId y periodYear de su original aunque su fecha sea la
// del día de la anulación, así que original y reversa se compensan dentro del
// mismo ejercicio aunque la anulación ocurra al año siguiente.

export interface BalanceEntryLine {
  accountCode?: string;
  accountName?: string;
  debit?:       number;
  credit?:      number;
}

export interface BalanceEntry {
  status?:          string;
  reversalEntryId?: string | null;
  lines?:           BalanceEntryLine[];
}

export interface AccountBalance {
  code:   string;
  name:   string;
  debit:  number;
  credit: number;
}

function round2(n: number): number { return Math.round(n * 100) / 100; }

/** true si el asiento entra en saldos, cierres y aperturas. */
export function countsForBalances(entry: BalanceEntry | null | undefined): boolean {
  if (!entry) return false;
  if (entry.status === 'posted') return true;
  return entry.status === 'cancelled' && !!entry.reversalEntryId;
}

/**
 * Suma débitos y créditos por cuenta de los asientos que cuentan
 * (countsForBalances). `includeAccount` filtra por código de cuenta.
 */
export function sumAccountBalances(
  entries: BalanceEntry[],
  includeAccount: (code: string) => boolean = () => true,
): Map<string, AccountBalance> {
  const balances = new Map<string, AccountBalance>();
  for (const entry of entries) {
    if (!countsForBalances(entry)) continue;
    for (const line of (entry.lines ?? [])) {
      const code = line.accountCode ?? '';
      if (!includeAccount(code)) continue;
      const existing = balances.get(code) ?? { code, name: line.accountName ?? '', debit: 0, credit: 0 };
      existing.debit  = round2(existing.debit  + (line.debit  ?? 0));
      existing.credit = round2(existing.credit + (line.credit ?? 0));
      balances.set(code, existing);
    }
  }
  return balances;
}
