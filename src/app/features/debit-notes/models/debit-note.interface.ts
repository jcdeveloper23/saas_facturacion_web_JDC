import { Timestamp } from '@angular/fire/firestore';
import { SriDocumentStatus } from '../../invoices/models/invoice.interface';

// ─── Status ───────────────────────────────────────────────────────────────────

export type DebitNoteStatus = 'draft' | 'issued' | 'void';

export const DEBIT_NOTE_STATUS_LABELS: Record<DebitNoteStatus, string> = {
  draft:  'Borrador',
  issued: 'Emitida',
  void:   'Anulada',
};

export const DEBIT_NOTE_STATUS_COLORS: Record<DebitNoteStatus, string> = {
  draft:  'secondary',
  issued: 'primary',
  void:   'danger',
};

// ─── Motivo (reason/line) ────────────────────────────────────────────────────

export interface DebitNoteMotivo {
  id:    string;
  razon: string;  // reason text
  valor: number;  // amount (before VAT)
}

// ─── Main DebitNote document ──────────────────────────────────────────────────
// Stored at: /companies/{companyId}/debitNotes/{debitNoteId}

export interface DebitNote {
  id: string;

  // ── Numbering ───────────────────────────────────────────────────────────────
  seriesCode:          string;
  seriesEstablishment: string;
  seriesEmissionPoint: string;
  number:              number;
  fullNumber:          string;   // "001-001-000000001"
  fiscalYear:          string;

  // ── Date ────────────────────────────────────────────────────────────────────
  date: Timestamp;

  // ── Customer snapshot ────────────────────────────────────────────────────────
  customerId?:       string;
  customerName:      string;
  customerTaxId:     string;
  customerTaxIdType: string;   // '04'=RUC, '05'=CI, '06'=PASAPORTE
  customerEmail?:    string;

  // ── Reference to original invoice ───────────────────────────────────────────
  originalInvoiceNumber: string;    // '001-001-000000001'
  originalInvoiceDate:   Timestamp;
  originalInvoiceAuth?:  string;    // authorization number of original

  // ── Motivos (reasons/items) ──────────────────────────────────────────────────
  motivos: DebitNoteMotivo[];

  // ── Totals ───────────────────────────────────────────────────────────────────
  totalSinImpuestos: number;
  vatPct:            number;   // e.g. 15
  vatAmount:         number;
  total:             number;

  // ── Status ──────────────────────────────────────────────────────────────────
  status:    DebitNoteStatus;
  isVoid:    boolean;
  voidedAt?: Timestamp;

  // ── Notes & audit ───────────────────────────────────────────────────────────
  notes?:     string;
  createdBy:  string;
  createdAt:  Timestamp;
  updatedAt:  Timestamp;
  updatedBy?: string;

  // ── SRI Electronic Document ─────────────────────────────────────────────────
  sriStatus?:           SriDocumentStatus;
  accessKey?:           string;
  codigoNumerico?:      string;
  authorizationNumber?: string;
  authorizedAt?:        Timestamp;
  sriError?:            string;
  xmlUrl?:              string;
  pdfUrl?:              string;

  // ── Contabilidad (generado por Cloud Function) ──────────────────────────────
  accountingEntryId?: string;  // id del asiento en journal_entries, si ya se generó
  reversalEntryId?:   string;  // id del asiento de reversa, si el documento fue anulado
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function buildDebitNoteFullNumber(
  establishment: string,
  emissionPoint: string,
  number: number
): string {
  return `${establishment.padStart(3, '0')}-${emissionPoint.padStart(3, '0')}-${String(number).padStart(9, '0')}`;
}

export function calcDebitNoteTotals(
  motivos: DebitNoteMotivo[],
  vatPct: number
): { totalSinImpuestos: number; vatAmount: number; total: number } {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const totalSinImpuestos = r2(motivos.reduce((s, m) => s + (m.valor ?? 0), 0));
  const vatAmount          = r2(totalSinImpuestos * vatPct / 100);
  return { totalSinImpuestos, vatAmount, total: r2(totalSinImpuestos + vatAmount) };
}
