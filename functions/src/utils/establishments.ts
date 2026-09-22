import * as admin from 'firebase-admin';

/**
 * Establecimientos de la empresa y el establecimiento de cada comprobante.
 *
 * En el SRI una empresa puede tener varios establecimientos (001 matriz, 002
 * sucursal…), cada uno con sus puntos de emisión y su propia numeración. Cada
 * comprobante se numera con una serie (`document-series`) que fija su
 * establecimiento y punto de emisión, y los guarda en `seriesEstablishment` y
 * `seriesEmissionPoint`.
 *
 * Hasta el 2026-09-22 los generadores de XML ignoraban esos campos y usaban
 * siempre `company.sri.establishment`: una factura de la sucursal llegaba al SRI
 * como si fuera de la matriz, con un secuencial que la matriz ya había usado.
 *
 * Datos: companies/{companyId}/establishments/{code}, con el código de 3
 * dígitos como id del documento (así es único por empresa y se busca directo).
 */

export interface EmissionSeries {
  establishment: string;
  emissionPoint: string;
}

/** Código de 3 dígitos del SRI (001-999). Null si no sirve. */
export function normalizeSriCode(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!/^\d{1,3}$/.test(raw)) return null;
  const code = raw.padStart(3, '0');
  return code === '000' ? null : code;
}

/**
 * Establecimiento y punto de emisión con los que se emite un comprobante.
 *
 * Los del documento, si están los dos; si no, los de la empresa (comprobantes
 * anteriores a las series, o creados por fuera del front). Se toman siempre en
 * pareja: mezclar el establecimiento de uno con el punto del otro daría un
 * número que no existe en ningún lado.
 */
export function resolveEmissionSeries(
  doc: { seriesEstablishment?: unknown; seriesEmissionPoint?: unknown },
  companySri: { establishment?: unknown; emissionPoint?: unknown } | undefined,
): EmissionSeries {
  const docEstab = normalizeSriCode(doc?.seriesEstablishment);
  const docPoint = normalizeSriCode(doc?.seriesEmissionPoint);
  if (docEstab && docPoint) return { establishment: docEstab, emissionPoint: docPoint };

  return {
    establishment: normalizeSriCode(companySri?.establishment) ?? '001',
    emissionPoint: normalizeSriCode(companySri?.emissionPoint) ?? '001',
  };
}

/**
 * Dirección del establecimiento para `<dirEstablecimiento>`.
 *
 * La del documento `establishments/{code}` si existe y tiene dirección; si no,
 * la única que había antes (`configuration/sri.direccionEstablecimiento`), para
 * no romper a las empresas que todavía no registraron sus establecimientos.
 */
export async function resolveEstablishmentAddress(
  db: admin.firestore.Firestore,
  companyId: string,
  establishment: string,
  fallback: string | undefined,
): Promise<string> {
  try {
    const snap = await db.doc(`companies/${companyId}/establishments/${establishment}`).get();
    const address = snap.exists ? String(snap.get('address') ?? '').trim() : '';
    if (address) return address;
  } catch (err) {
    console.warn('[establishments] No se pudo leer el establecimiento', { companyId, establishment, err });
  }
  return (fallback ?? '').trim();
}

/** Documento del establecimiento matriz que nace con cada empresa. */
export function buildMainEstablishment(params: {
  establishment?: unknown;
  emissionPoint?: unknown;
  address?: string;
  city?: string;
  phone?: string;
  now: admin.firestore.Timestamp;
  createdBy: string;
}): { id: string; data: Record<string, unknown> } {
  const code = normalizeSriCode(params.establishment) ?? '001';
  const point = normalizeSriCode(params.emissionPoint) ?? '001';
  return {
    id: code,
    data: {
      code,
      name: 'Matriz',
      address: (params.address ?? '').trim(),
      city: (params.city ?? '').trim(),
      phone: (params.phone ?? '').trim(),
      isMain: true,
      isActive: true,
      emissionPoints: [{ code: point, name: 'Principal', isActive: true }],
      createdAt: params.now,
      updatedAt: params.now,
      createdBy: params.createdBy,
    },
  };
}

/**
 * Establecimientos a los que tiene acceso un usuario de empresa
 * (`company-users/{uid}.establishments`), validados y normalizados.
 *
 * Vacío significa «todos»: decisión del 2026-09-22 para no dejar sin facturar a
 * los usuarios que ya existían antes de esta asignación. El admin tiene todos
 * siempre, con o sin lista. Lanza con el motivo si algún código no sirve.
 */
export function normalizeEstablishmentList(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) throw new Error('establishments debe ser una lista de códigos.');
  const codes = new Set<string>();
  for (const raw of value) {
    const code = normalizeSriCode(raw);
    if (!code) throw new Error(`Código de establecimiento inválido: "${String(raw)}".`);
    codes.add(code);
  }
  return [...codes].sort();
}

/** Si el usuario puede emitir desde ese establecimiento. */
export function canUseEstablishment(
  allowed: readonly string[] | undefined,
  role: string | undefined,
  establishment: string,
): boolean {
  if (role === 'admin' || role === 'super_admin') return true;
  if (!allowed || allowed.length === 0) return true;
  return allowed.includes(establishment);
}
