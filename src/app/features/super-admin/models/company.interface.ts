import { Timestamp } from '@angular/fire/firestore';

export type CompanyStatus = 'active' | 'suspended' | 'cancelled' | 'trial';

// /companies/{companyId}  ← root-level tenant document
export interface Company {
  id: string;
  name: string;
  tradeName?: string;
  taxId: string;            // RUC 13 digits
  fiscalAddress: string;
  city: string;
  phone: string;
  email: string;
  logoUrl?: string;

  planId: string;
  planName: string;
  status: CompanyStatus;
  subscriptionStart: Timestamp;
  subscriptionEnd: Timestamp;

  sri: {
    environment: 'testing' | 'production';
    ruc: string;
    businessName: string;
    establishment: string;  // '001'
    emissionPoint: string;  // '001'
    contributorType: 'natural' | 'juridica';
    accountingRequired: boolean;
    certificateExpiry?: Timestamp;
  };

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type CompanyFormData = Omit<Company, 'id' | 'createdAt' | 'updatedAt' | 'logoUrl'> & {
  adminPassword?: string;
};
