/**
 * software-provider.ts
 *
 * El RUC del proveedor del sistema de facturación electrónica, que el SRI exige
 * en la «Información adicional» de TODO comprobante electrónico (factura, nota
 * de crédito, nota de débito, retención…) como `campoAdicional nombre="RUC Proveedor"`.
 *
 * Norma: Resolución NAC-DGERCGC26-00000027 (Registro Oficial del 2026-07-28),
 * obligatoria desde el 2026-09-26; Ficha Técnica de Comprobantes Electrónicos
 * v2.34, anexo 26.
 *
 * De dónde sale, en este orden:
 *   1. el canal de la empresa (`channels/{channelId}.softwareProviderRuc`), si a
 *      ese canal lo comercializa otra empresa;
 *   2. la plataforma (`platform/defaults/sriConfig/data.softwareProviderRuc`);
 *   3. el de WECONNECT CORP. CIA. LTDA., quien comercializa FacturaEc.
 * Un valor que no sea un RUC válido de forma (13 dígitos terminados en 001) se
 * ignora con un aviso en el log y se pasa al siguiente.
 */

import * as admin from 'firebase-admin';

/** WECONNECT CORP. CIA. LTDA. */
export const DEFAULT_SOFTWARE_PROVIDER_RUC = '0190434990001';

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { ruc: string | null; expires: number }>();

export function isProviderRuc(value: unknown): value is string {
  return typeof value === 'string' && /^\d{10}001$/.test(value.trim());
}

async function readRuc(path: string): Promise<string | null> {
  const ahora = Date.now();
  const enCache = cache.get(path);
  if (enCache && enCache.expires > ahora) return enCache.ruc;

  let ruc: string | null = null;
  try {
    const raw = (await admin.firestore().doc(path).get()).data()?.['softwareProviderRuc'];
    if (raw != null && raw !== '') {
      if (isProviderRuc(raw)) ruc = raw.trim();
      else console.warn('[software-provider] RUC de proveedor no válido, se ignora:', path, raw);
    }
  } catch (err) {
    console.warn('[software-provider] No se pudo leer', path, err);
  }
  cache.set(path, { ruc, expires: ahora + CACHE_TTL_MS });
  return ruc;
}

/** El RUC del proveedor que le toca a una empresa (nunca vacío). */
export async function resolveSoftwareProviderRuc(company: { channelId?: unknown }): Promise<string> {
  const channelId = company?.channelId ? `${company.channelId}` : '';
  if (channelId) {
    const delCanal = await readRuc(`channels/${channelId}`);
    if (delCanal) return delCanal;
  }
  return (await readRuc('platform/defaults/sriConfig/data')) ?? DEFAULT_SOFTWARE_PROVIDER_RUC;
}

/** Solo para pruebas. */
export function clearSoftwareProviderCache(): void {
  cache.clear();
}
