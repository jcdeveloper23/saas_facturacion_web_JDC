/**
 * Fechas de la nómina (PLAN_NOMINA.md §4.2 L4 y L8, §4.3, §4.4). Puras.
 *
 * Las fechas viajan como 'AAAA-MM-DD' y se comparan como texto o como números
 * de día: nada de zonas horarias. El mes de la nómina es SIEMPRE de 30 días (L4).
 */

import { PayrollParameters, Region } from './payroll-types';

export interface Ymd { y: number; m: number; d: number }

export function parseYmd(s: string | null | undefined): Ymd | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? '');
  if (!m) return null;
  const r = { y: +m[1], m: +m[2], d: +m[3] };
  if (r.m < 1 || r.m > 12 || r.d < 1 || r.d > daysInMonth(r.y, r.m)) return null;
  return r;
}

export const ymd = (y: number, m: number, d: number) =>
  `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Días corridos desde 1970 (para sumar y restar días sin zona horaria). */
export function dayNumber(s: string): number {
  const p = parseYmd(s);
  if (!p) throw new Error(`Fecha inválida: ${s}`);
  return Math.round(Date.UTC(p.y, p.m - 1, p.d) / 86_400_000);
}

export function fromDayNumber(n: number): string {
  const t = new Date(n * 86_400_000);
  return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** El mismo día del año siguiente; el 29 de febrero pasa al 1 de marzo. */
export function addOneYear(s: string): string {
  const p = parseYmd(s)!;
  if (p.m === 2 && p.d === 29 && daysInMonth(p.y + 1, 2) === 28) return ymd(p.y + 1, 3, 1);
  return ymd(p.y + 1, p.m, p.d);
}

/**
 * El día de una fecha como INICIO de un tramo en la escala de 30 días: el
 * último día del mes es el 30 (convención 30/360), así ingresar el 28 de
 * febrero o el 31 de marzo cuenta 1 día, igual que salir el último día cuenta
 * el mes entero. ⚠️ Por criterio, a confirmar con Jessica Zari (§9).
 */
export function dayOnScale30(s: string): number {
  const p = parseYmd(s)!;
  return p.d === daysInMonth(p.y, p.m) ? 30 : Math.min(30, p.d);
}

/**
 * El tramo trabajado en el mes, en la escala de 30 días (§4.4):
 *   díaInicio = 1 si ya trabajaba al empezar el mes; si no, mín(30, día de ingreso)
 *   díaFin    = 30 si sigue trabajando el último día del mes; si no, mín(30, día de salida)
 * null si no trabajó ningún día del mes.
 */
export function monthSpan(year: number, month: number, hireDate: string, endDate?: string | null):
  { startDay: number; endDay: number } | null {
  const first = ymd(year, month, 1);
  const last = ymd(year, month, daysInMonth(year, month));
  if (hireDate > last) return null;
  if (endDate && endDate < first) return null;
  const startDay = hireDate <= first ? 1 : dayOnScale30(hireDate);
  const endDay = !endDate || endDate >= last ? 30 : Math.min(30, parseYmd(endDate)!.d);
  if (endDay < startDay) return null;
  return { startDay, endDay };
}

/**
 * Días del mes con derecho a fondos de reserva (art. 196, L8): desde el día
 * siguiente a cumplir el primer año, o sea el aniversario del ingreso. Un
 * reingreso suma el tiempo anterior (art. 197): adelanta esa fecha.
 * Se cuentan dentro del tramo trabajado, en la escala de 30 días.
 */
export function reserveFundDays(
  year: number, month: number, span: { startDay: number; endDay: number },
  hireDate: string, priorServiceDays = 0,
): number {
  const eligible = fromDayNumber(dayNumber(addOneYear(hireDate)) - Math.max(0, priorServiceDays));
  const first = ymd(year, month, 1);
  const last = ymd(year, month, daysInMonth(year, month));
  if (eligible > last) return 0;
  const fromDay = eligible <= first ? span.startDay : Math.max(span.startDay, dayOnScale30(eligible));
  return Math.max(0, span.endDay - fromDay + 1);
}

/** Periodo del 13.º: 1-dic del año anterior al 30-nov (MDT-2015-0087, art. 5). */
export function thirteenthPeriod(year: number): { from: string; to: string } {
  return { from: ymd(year - 1, 12, 1), to: ymd(year, 11, 30) };
}

/**
 * Periodo del 14.º (MDT-2015-0087, art. 5): Sierra y Amazonía, 1-ago del año
 * anterior al 31-jul; Costa e Insular, 1-mar del año anterior al último de febrero.
 */
export function fourteenthPeriod(region: Region, year: number): { from: string; to: string } {
  return region === 'sierra'
    ? { from: ymd(year - 1, 8, 1), to: ymd(year, 7, 31) }
    : { from: ymd(year - 1, 3, 1), to: ymd(year, 2, daysInMonth(year, 2)) };
}

/**
 * La versión de parámetros que rige la nómina del mes: publicada y vigente el
 * ÚLTIMO día del mes, la de mayor versión (§4.3). null si no hay ninguna: la
 * nómina se rechaza (así se bloquea enero de 2027 hasta que exista el acuerdo, L9).
 */
export function pickParameters(all: PayrollParameters[], year: number, month: number): PayrollParameters | null {
  const day = ymd(year, month, daysInMonth(year, month));
  const vigentes = all
    .filter(p => p.status === 'published' && p.validFrom <= day && day <= p.validTo)
    .sort((a, b) => b.version - a.version);
  return vigentes[0] ?? null;
}
