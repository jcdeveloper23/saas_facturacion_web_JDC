import { Timestamp } from '@angular/fire/firestore';

// ─── Transaction ──────────────────────────────────────────────────────────────
// Stored at: /companies/{companyId}/school_transactions/{transactionId}
// APPEND-ONLY — ningún cliente puede editar ni borrar, solo Cloud Functions (Admin SDK)

export type SchoolTransactionType = 'recharge' | 'purchase' | 'refund' | 'adjustment';
export type SchoolTransactionRef  = 'order' | 'recharge' | 'adjustment';

export const TRANSACTION_TYPE_LABELS: Record<SchoolTransactionType, string> = {
  recharge:   'Recarga',
  purchase:   'Compra',
  refund:     'Reembolso',
  adjustment: 'Ajuste'
};

export const TRANSACTION_TYPE_COLORS: Record<SchoolTransactionType, string> = {
  recharge:   'success',
  purchase:   'primary',
  refund:     'info',
  adjustment: 'warning'
};

export interface SchoolTransaction {
  id: string;
  companyId: string;            // antes institutionId
  studentId: string;
  studentName: string;          // denormalizado para facilitar reportes
  type: SchoolTransactionType;
  amount: number;               // positivo = ingreso (recarga/reembolso), negativo = egreso (compra)
  balanceBefore: number;        // saldo antes de la operación
  balanceAfter: number;         // saldo después de la operación
  description: string;          // ej. "Almuerzo + Snack", "Recarga por transferencia"
  referenceId?: string;         // orderId o rechargeId
  referenceType?: SchoolTransactionRef;
  createdBy?: string;           // userId que generó la transacción (null = Cloud Function)
  createdAt: Timestamp;
}

// ─── Recharge ─────────────────────────────────────────────────────────────────
// Stored at: /companies/{companyId}/school_recharges/{rechargeId}

export type RechargeMethod = 'card' | 'transfer' | 'cash_admin';
export type RechargeStatus = 'pending' | 'confirmed' | 'failed' | 'refunded';

export const RECHARGE_METHOD_LABELS: Record<RechargeMethod, string> = {
  card:       'Tarjeta de crédito/débito',
  transfer:   'Transferencia bancaria',
  cash_admin: 'Efectivo en administración'
};

export const RECHARGE_STATUS_LABELS: Record<RechargeStatus, string> = {
  pending:   'Pendiente de confirmación',
  confirmed: 'Confirmada',
  failed:    'Fallida',
  refunded:  'Reembolsada'
};

export const RECHARGE_STATUS_COLORS: Record<RechargeStatus, string> = {
  pending:   'warning',
  confirmed: 'success',
  failed:    'danger',
  refunded:  'info'
};

export interface SchoolRecharge {
  id: string;
  companyId: string;            // antes institutionId
  studentId: string;
  studentName: string;
  gradeId: string;
  gradeName: string;
  parentId: string;
  parentName: string;

  // ── Monto ────────────────────────────────────────────────────────────────
  amount: number;              // monto recargado en USD
  balanceBefore: number;       // saldo antes de la recarga
  balanceAfter: number;        // saldo después de la recarga

  // ── Método y estado del pago ─────────────────────────────────────────────
  method: RechargeMethod;
  methodLabel: string;
  paymentStatus: RechargeStatus;
  paymentRef?: string;         // referencia del gateway o número de transferencia
  paymentGatewayResponse?: unknown;
  proofUrl?: string;           // URL de imagen del comprobante (para transferencias)

  // ── Confirmación manual (efectivo o transferencia) ────────────────────────
  confirmedBy?: string;        // userId del admin que confirmó
  confirmedAt?: Timestamp;
  confirmationNote?: string;

  // ── Referencia a la transacción de wallet generada ────────────────────────
  walletTransactionId?: string;

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ─── Quick Recharge Options ───────────────────────────────────────────────────

export const RECHARGE_QUICK_AMOUNTS: number[] = [1, 2, 5, 10, 20];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Verifica si un saldo es considerado "bajo" según el umbral del representante */
export function isLowBalance(balance: number, threshold: number): boolean {
  return balance <= threshold;
}

/** Verifica si una recarga supera el límite máximo de wallet de la institución */
export function exceedsMaxWallet(currentBalance: number, amount: number, maxBalance: number): boolean {
  return (currentBalance + amount) > maxBalance;
}
