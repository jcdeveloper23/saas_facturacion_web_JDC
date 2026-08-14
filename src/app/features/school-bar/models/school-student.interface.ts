import { Timestamp } from '@angular/fire/firestore';

// ─── Identifier ───────────────────────────────────────────────────────────────

export type StudentIdentifierType = 'qr' | 'nfc_card' | 'nfc_bracelet' | 'nfc_keyring';
export type StudentIdentifierStatus = 'active' | 'revoked' | 'pending_activation';

export const IDENTIFIER_TYPE_LABELS: Record<StudentIdentifierType, string> = {
  qr:           'Código QR',
  nfc_card:     'Tarjeta NFC',
  nfc_bracelet: 'Manilla NFC',
  nfc_keyring:  'Llavero NFC'
};

export const IDENTIFIER_TYPE_ICONS: Record<StudentIdentifierType, string> = {
  qr:           'cilQrCode',
  nfc_card:     'cilCreditCard',
  nfc_bracelet: 'cilLoopCircular',
  nfc_keyring:  'cilTag'
};

/**
 * Identificador físico asociado a un estudiante.
 * El QR se genera automáticamente al crear el alumno.
 * Los NFC se activan tras el flujo de solicitud de accesorio.
 */
export interface StudentIdentifier {
  type: StudentIdentifierType;
  accessoryId?: string;       // referencia a school_accessories/{id} (solo para NFC)
  nfcUid?: string;            // UID físico del chip NFC en hex (ej. "04:AB:CD:12:34:56")
  status: StudentIdentifierStatus;
  activatedAt?: Timestamp;
  revokedAt?: Timestamp;
  revokedReason?: string;
}

// ─── Spend Limits (control parental) ─────────────────────────────────────────

export interface StudentSpendLimits {
  dailyLimit?: number;         // límite de gasto diario (USD) — 0 = sin límite
  weeklyLimit?: number;        // límite de gasto semanal (USD)
  overriddenByParent: boolean; // true = el padre sobreescribió el límite por defecto
}

// ─── Student ──────────────────────────────────────────────────────────────────
// Stored at: /companies/{companyId}/school_students/{studentId}
//
// División de responsabilidades:
//   Admin escolar: crea nombre, code, gradeId — solo esos campos al inicio
//   Representante: gestiona photoUrl, allergyNotes, allowedCategories, spendLimits

export interface SchoolStudent {
  id: string;
  companyId: string;            // tenant — antes institutionId (empresa = institución)

  // ── Datos académicos (admin) ─────────────────────────────────────────────
  gradeId: string;
  gradeName: string;           // denormalizado
  section: string;             // denormalizado

  // ── Datos personales (admin al crear, representante puede editar el resto) ─
  firstName: string;
  lastName: string;
  fullName: string;            // firstName + lastName
  code: string;                // código interno de la institución
  photoUrl?: string;           // gestionado por el representante

  // ── Representantes vinculados (max 2) ────────────────────────────────────
  parentIds: string[];
  primaryParentId: string;

  // ── Billetera (solo escrito por Cloud Functions vía Admin SDK) ───────────
  walletBalance: number;

  // ── Identificadores ──────────────────────────────────────────────────────
  qrCode: string;              // token firmado HMAC-SHA256 generado por CF
  qrCodeUrl: string;           // URL de la imagen QR en Firebase Storage

  /** Lista de identificadores activos (QR auto-incluido, NFC tras activación) */
  identifiers: StudentIdentifier[];

  // ── Control parental (gestionado por representante) ──────────────────────
  allowedCategories?: string[];  // null/vacío = todas las categorías del menú
  allergyNotes?: string;
  spendLimits?: StudentSpendLimits;

  // ── Stats denormalizados (actualizados por CF) ───────────────────────────
  totalSpentMonth: number;
  totalSpentWeek: number;
  totalTransactions: number;

  state: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** Payload del QR — firmado HMAC-SHA256, sin datos personales */
export interface StudentQrPayload {
  studentId: string;
  companyId: string;
  version: number; // incrementar para invalidar QRs viejos
}
