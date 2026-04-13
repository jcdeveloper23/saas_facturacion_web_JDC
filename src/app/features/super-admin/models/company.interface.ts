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
    // ── Identificación ──────────────────────────────────────────────────────
    environment: 'testing' | 'production';
    ruc: string;
    businessName: string;
    establishment: string;          // '001'
    emissionPoint: string;          // '001'
    contributorType: 'natural' | 'juridica';

    // ── Obligaciones fiscales ────────────────────────────────────────────────
    accountingRequired: boolean;    // obligado a llevar contabilidad
    contribuyenteEspecial?: string; // número de resolución, '' si no aplica
    microempresa: boolean;          // régimen microempresas
    regimen: 'general' | 'rimpe_negocio_popular' | 'rimpe_emprendedor';

    // ── Representante legal (requerido si contributorType === 'juridica') ───
    representanteLegal?: {
      name: string;
      taxId: string;                // CI del representante
    };

    // ── Certificado de firma digital ─────────────────────────────────────────
    certificatePath?: string;       // gs://bucket/companies/{id}/certificates/signing.p12
    certificateThumbprint?: string; // SHA1 huella para display
    certificateSubject?: string;    // Subject del cert para display (nombre empresa en cert)
    certificateExpiry?: Timestamp;  // Fecha de expiración
    certPassword?: string;          // Password del .p12 para firma (producción: usar Secret Manager)
  };

  // Plugin Package management — commercial bundles assigned to this company
  enabledPackages: string[];    // package.code[] active for this company (e.g. ['pkg_base','pkg_sri'])
  // Module management — derived from enabledPackages + manual overrides
  enabledModules: string[];     // module.code[] computed when packages change
  disabledModules: string[];    // module codes manually overridden off

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type CompanyFormData = Omit<Company, 'id' | 'createdAt' | 'updatedAt' | 'logoUrl'> & {
  adminPassword?: string;
};
