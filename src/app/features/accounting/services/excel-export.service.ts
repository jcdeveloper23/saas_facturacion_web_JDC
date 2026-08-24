import { Injectable } from '@angular/core';
import * as XLSX from 'xlsx';

export interface ExcelSheet {
  name: string;
  rows: Record<string, string | number>[];
}

@Injectable({ providedIn: 'root' })
export class ExcelExportService {
  export(filename: string, sheets: ExcelSheet[]): void {
    const wb = XLSX.utils.book_new();
    for (const sheet of sheets) {
      const ws = XLSX.utils.json_to_sheet(sheet.rows);
      XLSX.utils.book_append_sheet(wb, ws, this.safeSheetName(sheet.name));
    }
    XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
  }

  // Excel: máx 31 caracteres, sin : \ / ? * [ ]
  private safeSheetName(name: string): string {
    return name.replace(/[:\\/?*[\]]/g, '').slice(0, 31);
  }
}
