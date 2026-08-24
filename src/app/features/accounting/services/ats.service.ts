import { Injectable, inject } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';

interface GenerateAtsInput {
  companyId: string;
  year:      number;
  month:     number;
}

interface GenerateAtsResult {
  zip:      string; // base64
  filename: string;
}

@Injectable({ providedIn: 'root' })
export class AtsService {
  private functions = inject(Functions);

  /** Genera el ATS del mes y dispara la descarga del .zip (mismo patrón que AccountingPdfService). */
  async downloadAts(input: GenerateAtsInput): Promise<void> {
    const fn     = httpsCallable<GenerateAtsInput, GenerateAtsResult>(this.functions, 'generateAts');
    const result = await fn(input);

    const { zip, filename } = result.data;
    const bytes  = Uint8Array.from(atob(zip), c => c.charCodeAt(0));
    const blob   = new Blob([bytes], { type: 'application/zip' });
    const url    = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href     = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }
}
