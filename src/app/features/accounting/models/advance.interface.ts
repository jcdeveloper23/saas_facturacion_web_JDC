import { Timestamp } from '@angular/fire/firestore';

// ─── Anticipos de clientes/proveedores ─────────────────────────────────────────
// Un anticipo recibido de un cliente (antes de facturar) o entregado a un
// proveedor (antes de recibir la compra), aplicable después contra una
// factura/compra real. Alcance de esta primera versión: el anticipo debe
// cubrir el documento COMPLETO al aplicarse — el sistema no tiene pagos
// parciales de facturas/compras hoy, así que no se inventa uno nuevo acá
// solo para anticipos. Un mismo anticipo sí puede aplicarse a varios
// documentos a lo largo del tiempo mientras le quede remainingAmount.

export type AdvancePartyType = 'customer' | 'supplier';
export type AdvanceStatus    = 'open' | 'applied' | 'cancelled';

export const ADVANCE_STATUS_LABELS: Record<AdvanceStatus, string> = {
  open:      'Disponible',
  applied:   'Aplicado',
  cancelled: 'Anulado',
};

export const ADVANCE_STATUS_COLORS: Record<AdvanceStatus, string> = {
  open:      'success',
  applied:   'secondary',
  cancelled: 'danger',
};

export interface AdvanceApplication {
  targetId:     string;
  targetType:   'invoice' | 'purchase';
  targetLabel:  string;   // fullNumber del documento, para mostrar sin otro fetch
  appliedAmount: number;
  appliedAt:    Timestamp;
  entryId:      string;   // asiento contable de la aplicación
}

// Stored at: companies/{companyId}/advances/{advanceId}
export interface Advance {
  id: string;

  partyType:  AdvancePartyType;
  partyId:    string;
  partyName:  string;
  partyTaxId: string;

  amount:          number;  // monto original del anticipo
  remainingAmount: number;  // disponible para aplicar

  bankAccountId:   string;  // cuenta bancaria por la que entró/salió el dinero
  bankAccountName: string;

  date:   Timestamp;
  status: AdvanceStatus;

  journalEntryId: string;   // asiento del anticipo recibido/entregado
  applications:   AdvanceApplication[];

  notes?: string;

  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  updatedBy?: string;
}
