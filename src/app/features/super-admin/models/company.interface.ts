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

  // Plugin management — which modules are active for this company
  // Equivalent to FacturaScripts enabled_plugins.list per installation
  enabledModules: string[];     // module.code[] activated for this company (union of plan + manual)
  disabledModules: string[];    // module codes manually disabled (override from plan)

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type CompanyFormData = Omit<Company, 'id' | 'createdAt' | 'updatedAt' | 'logoUrl'> & {
  adminPassword?: string;
};
