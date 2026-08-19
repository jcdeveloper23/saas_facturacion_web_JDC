import { Injectable, inject } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';

export type AccountingReportType =
  | 'libro-diario'
  | 'libro-mayor'
  | 'balance-comprobacion'
  | 'estado-resultados'
  | 'balance-general';

interface GeneratePdfInput {
  reportType:  AccountingReportType;
  companyId:   string;
  periodName:  string;
  data:        Record<string, any>[];
  extraData?:  Record<string, any>;
}

interface GeneratePdfResult {
  pdf:      string;   // base64
  filename: string;
}

@Injectable({ providedIn: 'root' })
export class AccountingPdfService {
  private functions = inject(Functions);

  async downloadPdf(input: GeneratePdfInput): Promise<void> {
    const fn     = httpsCallable<GeneratePdfInput, GeneratePdfResult>(this.functions, 'generateAccountingPdf');
    const result = await fn(input);

    const { pdf, filename } = result.data;
    const bytes   = Uint8Array.from(atob(pdf), c => c.charCodeAt(0));
    const blob    = new Blob([bytes], { type: 'application/pdf' });
    const url     = URL.createObjectURL(blob);
    const anchor  = document.createElement('a');
    anchor.href     = url;
    anchor.download  = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }
}
