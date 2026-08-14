import { Timestamp } from '@angular/fire/firestore';

// ─── Saved Payment Method ─────────────────────────────────────────────────────

export type SavedPaymentMethodType = 'card' | 'transfer';

/** Referencia a método de pago guardado en el gateway — nunca datos raw de tarjeta */
export interface SavedPaymentMethod {
  id: string;                        // token del gateway
  type: SavedPaymentMethodType;
  label: string;                     // "Visa ****4242"
  isDefault: boolean;
  addedAt: Timestamp;
}

// ─── Parent ───────────────────────────────────────────────────────────────────
// Stored at: /companies/{companyId}/school_parents/{parentId}
//
// El representante se registra con Google Sign-In (Firebase Auth).
// Al primer login, se crea este documento con los datos del token Google.
// La vinculación con el alumno se hace escaneando el QR del estudiante.

export interface SchoolParent {
  id: string;
  userId: string;              // Firebase Auth UID (Google)
  companyId: string;           // tenant — institutionId eliminado (empresa = institución)

  // ── Datos personales (desde token Google al primer login) ────────────────
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  photoUrl?: string;           // desde Google profile
  phone?: string;              // completado opcionalmente después

  // ── Hijos vinculados ─────────────────────────────────────────────────────
  studentIds: string[];
  primaryStudentId?: string;   // hijo seleccionado por defecto al abrir el panel

  // ── Notificaciones ───────────────────────────────────────────────────────
  notifyOnPurchase: boolean;
  notifyOnLowBalance: boolean;
  lowBalanceThreshold: number;  // ej. 2.00 — alerta cuando el saldo baje de este valor (USD)
  notifyOnOrderReady: boolean;
  notifyOnDelivery: boolean;

  // ── Métodos de pago guardados ────────────────────────────────────────────
  savedPaymentMethods?: SavedPaymentMethod[];

  state: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** Payload para la Cloud Function schoolLinkParentToStudent */
export interface LinkParentPayload {
  qrToken: string;    // token escaneado del QR del alumno
  companyId: string;
}

/** Resultado de la vinculación representante-alumno */
export interface LinkParentResult {
  studentId: string;
  studentName: string;
  gradeName: string;
  section: string;
  isSecondParent: boolean; // true si ya había un representante primario
}
