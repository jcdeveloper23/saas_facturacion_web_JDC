/**
 * Formatea fechas para el SRI usando la hora local de Ecuador (America/Guayaquil, UTC-5),
 * en vez de la hora del runtime del servidor (Cloud Functions corre en UTC por defecto).
 * Usar date.getDate()/getMonth()/getFullYear() directamente adelanta la fecha un día
 * para cualquier factura emitida después de las 19:00 hora Ecuador, provocando el
 * error del SRI "FECHA EMISIÓN EXTEMPORANEA... es mayor a la fecha del servidor".
 */
const SRI_TIME_ZONE = 'America/Guayaquil';

function getEcuadorDateParts(date: Date): { dd: string; mm: string; yyyy: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SRI_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const yyyy = parts.find(p => p.type === 'year')!.value;
  const mm = parts.find(p => p.type === 'month')!.value;
  const dd = parts.find(p => p.type === 'day')!.value;
  return { dd, mm, yyyy };
}

/** Fecha de emisión SRI en formato dd/mm/yyyy, hora local Ecuador */
export function formatFechaEmisionEC(date: Date): string {
  const { dd, mm, yyyy } = getEcuadorDateParts(date);
  return `${dd}/${mm}/${yyyy}`;
}

/** Fecha para clave de acceso SRI en formato ddmmyyyy, hora local Ecuador */
export function formatFechaClaveAccesoEC(date: Date): string {
  const { dd, mm, yyyy } = getEcuadorDateParts(date);
  return `${dd}${mm}${yyyy}`;
}
