import { Timestamp } from '@angular/fire/firestore';

// /plans/{planId}  ← root-level (super-admin only)
export interface Plan {
  id: string;
  name: string;             // 'Basic', 'Professional', 'Enterprise'
  price: number;            // monthly USD
  limits: {
    users: number;
    invoicesPerMonth: number;
    warehouses: number;
    storageGb: number;
  };
  features: string[];       // ['pos', 'electronic_invoicing', 'multi_warehouse']
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type PlanFormData = Omit<Plan, 'id' | 'createdAt' | 'updatedAt'>;
