import { AccountType } from './account.interface';

export interface BudgetLine {
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  amount: number;          // monto presupuestado
}

export interface Budget {
  id?: string;
  periodId: string;
  periodName: string;
  year: number;
  lines: BudgetLine[];
  totalIncome: number;
  totalExpense: number;
  notes?: string;
  createdAt?: any;
  updatedAt?: any;
}
