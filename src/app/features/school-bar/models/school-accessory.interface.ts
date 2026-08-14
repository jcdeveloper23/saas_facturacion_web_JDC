import { Timestamp } from '@angular/fire/firestore';
import { StudentIdentifierType } from './school-student.interface';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AccessoryType   = Extract<StudentIdentifierType, 'nfc_card' | 'nfc_bracelet' | 'nfc_keyring'>;
export type AccessoryStatus = 'requested' | 'paid' | 'configured' | 'delivered' | 'revoked' | 'lost';
export type AccessoryPaymentMethod = 'card' | 'transfer';
export type AccessoryPaymentStatus = 'pending' | 'confirmed' | 'failed' | 'refunded';

export const ACCESSORY_TYPE_LABELS: Record<AccessoryType, string> = {
  nfc_card:     'Tarjeta NFC',
  nfc_bracelet: 'Manilla NFC',
  nfc_keyring:  'Llavero NFC'
};

export const ACCESSORY_TYPE_ICONS: Record<AccessoryType, string> = {
  nfc_card:     'cilCreditCard',
  nfc_bracelet: 'cilLoopCircular',
  nfc_keyring:  'cilTag'
};

/** Precios de referencia por tipo de accesorio (USD) */
export const ACCESSORY_PRICES: Record<AccessoryType, number> = {
  nfc_card:     3.50,
  nfc_bracelet: 6.00,
  nfc_keyring:  5.00
};

export const ACCESSORY_STATUS_LABELS: Record<AccessoryStatus, string> = {
  requested:  'Solicitado',
  paid:       'Pago confirmado',
  configured: 'Configurado',
  delivered:  'Entregado y activo',
  revoked:    'Revocado',
  lost:       'Reportado como perdido'
};

export const ACCESSORY_STATUS_COLORS: Record<AccessoryStatus, string> = {
  requested:  'warning',
  paid:       'info',
  configured: 'primary',
  delivered:  'success',
  revoked:    'dark',
  lost:       'danger'
};

// ─── Status History ───────────────────────────────────────────────────────────

export interface AccessoryStatusEntry {
  status: AccessoryStatus;
  changedAt: Timestamp;
  changedBy?: string;   // userId del admin o representante
  note?: string;
}

// ─── Accessory ────────────────────────────────────────────────────────────────
// Stored at: /companies/{companyId}/school_accessories/{accessoryId}
//
// Flujo:
//   requested → (pago confirmado) → paid → (admin configura NFC) → configured
//   → (admin entrega al alumno) → delivered [activado en school_students.identifiers]
//   → (si se pierde) → lost / revoked [revocado en school_students.identifiers]

export interface SchoolAccessory {
  id: string;
  companyId: string;            // antes institutionId

  // ── Tipo y precio ────────────────────────────────────────────────────────
  type: AccessoryType;
  typeName: string;              // "Tarjeta NFC", "Manilla NFC", "Llavero NFC"
  unitPrice: number;
  currency: 'USD';

  // ── Solicitud (representante) ────────────────────────────────────────────
  requestedBy: string;           // parentId
  requestedByName: string;
  studentId: string;
  studentName: string;

  // ── Estado del proceso ───────────────────────────────────────────────────
  status: AccessoryStatus;
  statusHistory: AccessoryStatusEntry[];

  // ── Pago ─────────────────────────────────────────────────────────────────
  paymentMethod: AccessoryPaymentMethod;
  paymentStatus: AccessoryPaymentStatus;
  paymentRef?: string;           // referencia del gateway o número de transferencia
  proofUrl?: string;             // comprobante de transferencia
  paymentConfirmedAt?: Timestamp;

  // ── Configuración NFC (admin) ────────────────────────────────────────────
  nfcUid?: string;               // UID físico del chip en hex (ej. "04:AB:CD:12:34:56")
  configuredBy?: string;         // userId del admin que escribió el UID
  configuredAt?: Timestamp;

  // ── Entrega (admin) ──────────────────────────────────────────────────────
  deliveredAt?: Timestamp;
  deliveredBy?: string;          // userId del admin que hizo entrega

  // ── Revocación ───────────────────────────────────────────────────────────
  revokedAt?: Timestamp;
  revokedReason?: string;        // "Pérdida reportada por representante"
  replacedByAccessoryId?: string;// si fue reemplazado por uno nuevo

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ─── Accessory Catalog Item (para la vista del representante) ─────────────────

export interface AccessoryCatalogItem {
  type: AccessoryType;
  label: string;
  description: string;
  price: number;
  icon: string;
  imageUrl?: string;
}

export const ACCESSORY_CATALOG: AccessoryCatalogItem[] = [
  {
    type:        'nfc_card',
    label:       'Tarjeta NFC',
    description: 'Tarjeta plástica con chip NFC y código QR impreso. Ideal para el monedero escolar de la mochila.',
    price:       ACCESSORY_PRICES.nfc_card,
    icon:        ACCESSORY_TYPE_ICONS.nfc_card
  },
  {
    type:        'nfc_bracelet',
    label:       'Manilla NFC',
    description: 'Manilla de silicona con chip NFC integrado. La opción más cómoda para niños de primaria.',
    price:       ACCESSORY_PRICES.nfc_bracelet,
    icon:        ACCESSORY_TYPE_ICONS.nfc_bracelet
  },
  {
    type:        'nfc_keyring',
    label:       'Llavero NFC',
    description: 'Llavero compacto con chip NFC. Perfecto para la mochila o el estuche.',
    price:       ACCESSORY_PRICES.nfc_keyring,
    icon:        ACCESSORY_TYPE_ICONS.nfc_keyring
  }
];
