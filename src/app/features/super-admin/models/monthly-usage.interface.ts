import { Timestamp } from '@angular/fire/firestore';

// /companies/{companyId}/usage/{YYYY-MM}
// Convención ID: '2026-04' (año-mes con padding 2 dígitos).
// Escrito exclusivamente por Cloud Functions via Admin SDK.

export interface MonthlyUsage {
  // Periodo
  period: string;                  // '2026-04'
  year: number;                    // 2026
  month: number;                   // 4

  // Documentos SRI emitidos (status = 'issued', no 'draft' ni 'void')
  invoicesEmitted: number;         // facturas puras (isCreditNote = false)
  creditNotesEmitted: number;      // isCreditNote = true
  debitNotesEmitted: number;
  retentionsEmitted: number;
  purchasesCreated: number;        // compras registradas (status = 'received')
  remissionsEmitted: number;       // guías de remisión (cuando se implemente)
  totalSriDocsEmitted: number;     // suma: invoices + creditNotes + debitNotes + retentions + remissions

  // Maestros creados en el mes
  personasCreated: number;
  customersCreated: number;
  productsCreated: number;

  // Operaciones
  exportsGenerated: number;        // PDFs/Excels generados manualmente
  tasksCreated: number;            // tareas creadas en /tm-tasks
  apiCallsCount: number;           // llamadas a la API pública

  // Infraestructura (snapshot periódico, no por evento)
  storageUsedMb: number;

  // Metadata
  updatedAt: Timestamp;
  createdAt: Timestamp;
}
