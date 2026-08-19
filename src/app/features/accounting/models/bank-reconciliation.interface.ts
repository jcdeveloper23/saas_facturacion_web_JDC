import { Timestamp } from '@angular/fire/firestore';

export type BankStatementStatus   = 'draft' | 'in_progress' | 'reconciled';
export type BankTransactionStatus = 'unmatched' | 'matched' | 'ignored';

export const BANK_STATEMENT_STATUS_LABELS: Record<BankStatementStatus, string> = {
  draft:       'Borrador',
  in_progress: 'En Proceso',
  reconciled:  'Conciliado'
};

export const BANK_STATEMENT_STATUS_COLORS: Record<BankStatementStatus, string> = {
  draft:       'secondary',
  in_progress: 'warning',
  reconciled:  'success'
};

// Stored at: companies/{companyId}/bank_statements/{statementId}
export interface BankStatement {
  id:               string;
  bankAccountId:    string;
  bankAccountName:  string;
  linkedGlCode:     string;
  periodFrom:       Timestamp;
  periodTo:         Timestamp;
  openingBalance:   number;
  closingBalance:   number;
  totalCredits:     number;
  totalDebits:      number;
  transactionCount: number;
  reconciledCount:  number;
  difference:       number; // closingBalance - (openingBalance + totalCredits - totalDebits)
  status:           BankStatementStatus;
  createdBy:        string;
  createdAt:        Timestamp;
  updatedAt:        Timestamp;
}

// Stored at: companies/{companyId}/bank_statements/{statementId}/transactions/{txId}
export interface BankTransaction {
  id:                  string;
  statementId:         string;
  date:                Timestamp;
  description:         string;
  reference?:          string;
  debit:               number;  // money OUT of account (withdrawal)
  credit:              number;  // money IN to account (deposit)
  balance?:            number;  // running balance if available
  status:              BankTransactionStatus;
  matchedEntryId?:     string;  // journal_entry document ID
  matchedEntryLineId?: string;  // line ID within the journal entry
  matchedDescription?: string;  // description from matched GL line
  createdAt:           Timestamp;
}

// CSV parsed row before saving
export interface ParsedBankRow {
  date:        Date;
  description: string;
  reference:   string;
  debit:       number;
  credit:      number;
  balance:     number;
}
