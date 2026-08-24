import { Timestamp } from '@angular/fire/firestore';

export type BankAccountType = 'corriente' | 'ahorros';

export const BANK_ACCOUNT_TYPE_LABELS: Record<BankAccountType, string> = {
  corriente: 'Cuenta Corriente',
  ahorros:   'Cuenta de Ahorros'
};

export interface BankAccount {
  id:            string;
  bankName:      string;   // 'Banco Pichincha', 'Produbanco', etc.
  accountNumber: string;   // masked: '****1234'
  accountType:   BankAccountType;
  currency:      string;   // 'USD'
  linkedGlCode:  string;   // GL account code e.g. '1.1.01.001'
  linkedGlName:  string;   // GL account name for display
  isActive:      boolean;
  // Saldo inicial — solo se aplica al crear la cuenta, genera un asiento de
  // apertura (Debe cuenta banco / Haber Utilidades Acumuladas Ejercicios
  // Anteriores, 3.3.01.001 — misma cuenta puente que usa el resto del sistema
  // para saldos cargados fuera del ciclo formal de apertura de período).
  openingBalance?:      number;
  openingBalanceDate?:  Timestamp;
  openingBalanceEntryId?: string;
  createdBy:     string;
  createdAt:     Timestamp;
  updatedAt:     Timestamp;
  updatedBy?:    string;
}
