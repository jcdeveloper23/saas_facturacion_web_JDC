/**
 * Reportes de nómina (solo lectura): columnas, sumas por concepto y CSV.
 *
 * CSV: UTF-8 con BOM, separador «;» y decimales con coma, como lo abre Excel
 * en español sin asistente. La única otra exportación CSV de la app
 * (routes-history) usa «,» sin BOM; aquí los montos llevan coma decimal, así
 * que «,» como separador no sirve.
 */

import { PayslipLine } from './payroll.models';

export type ReportCell = string | number;
export type ReportRow = Record<string, ReportCell>;

export interface ReportColumn {
  key: string;
  label: string;
  /** money: centavos → «$ 1.234,56» en pantalla y «1234,56» en el CSV. */
  kind?: 'text' | 'money' | 'number';
}

/** Suma de las líneas con esos conceptos. */
export function sumConcepts(lines: PayslipLine[], concepts: readonly string[]): number {
  return lines.filter((l) => concepts.includes(l.concept)).reduce((s, l) => s + Number(l.amountCents || 0), 0);
}

export const OVERTIME_CONCEPTS = ['overtime50', 'overtime100', 'weekend', 'nightShift'] as const;
export const COMMISSION_BONUS_CONCEPTS = ['commission', 'bonusTaxable', 'bonusNonTaxable'] as const;
export const MONTHLY_BONUS_CONCEPTS = ['thirteenthMonthly', 'fourteenthMonthly'] as const;

/** La fila de totales: suma las columnas money/number; la primera lleva el rótulo. */
export function totalsRow(columns: ReportColumn[], rows: ReportRow[], label = 'Total'): ReportRow {
  const out: ReportRow = {};
  columns.forEach((c, i) => {
    if (c.kind === 'money' || c.kind === 'number') out[c.key] = rows.reduce((s, r) => s + Number(r[c.key] || 0), 0);
    else out[c.key] = i === 0 ? label : '';
  });
  return out;
}

const csvCell = (v: ReportCell, kind: ReportColumn['kind']): string => {
  const s = kind === 'money' ? (Number(v || 0) / 100).toFixed(2).replace('.', ',') : String(v ?? '');
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function buildCsv(columns: ReportColumn[], rows: ReportRow[]): string {
  const lines = [columns.map((c) => csvCell(c.label, 'text')).join(';'),
    ...rows.map((r) => columns.map((c) => csvCell(r[c.key], c.kind)).join(';'))];
  return '﻿' + lines.join('\r\n');
}

export function downloadCsv(fileName: string, columns: ReportColumn[], rows: ReportRow[]): void {
  const url = URL.createObjectURL(new Blob([buildCsv(columns, rows)], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName.endsWith('.csv') ? fileName : `${fileName}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
