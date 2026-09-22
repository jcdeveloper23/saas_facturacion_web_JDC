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
 * Puntos de emisión de un usuario de empresa.
 *
 * Se guardan en `company-users/{uid}.emissionPoints` como `'EEE-PPP'`
 * (establecimiento-punto: `'001-002'`), con uno por defecto en
 * `defaultEmissionPoint`. El establecimiento sale del punto: no se asigna aparte.
 *
 * Vacío significa «todos»: decisión del 2026-09-22 para no dejar sin facturar a
 * los usuarios que ya existían. El admin puede emitir desde cualquiera, con o sin
 * lista. Reemplaza a la asignación por establecimiento del mismo día, que nunca
 * se desplegó.
 */
export function formatEmissionPoint(establishment: unknown, emissionPoint: unknown): string | null {
  const e = normalizeSriCode(establishment);
  const p = normalizeSriCode(emissionPoint);
  return e && p ? `${e}-${p}` : null;
}

/** `'1-2'`, `'001-002'` → `'001-002'`. Null si no sirve. */
export function normalizeEmissionPointKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const parts = value.trim().split('-');
  return parts.length === 2 ? formatEmissionPoint(parts[0], parts[1]) : null;
}

/** Lista validada, sin repetidos y ordenada. Lanza con el motivo si algo no sirve. */
export function normalizeEmissionPointList(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) throw new Error('emissionPoints debe ser una lista de puntos «001-002».');
  const keys = new Set<string>();
  for (const raw of value) {
    const key = normalizeEmissionPointKey(raw);
    if (!key) throw new Error(`Punto de emisión inválido: "${String(raw)}". Formato: 001-002.`);
    keys.add(key);
  }
  return [...keys].sort();
}

/**
 * Punto por defecto: el pedido si sirve y está en la lista; si no, el primero de
 * la lista. Con la lista vacía (todos) vale cualquiera válido, o ninguno.
 */
export function resolveDefaultEmissionPoint(requested: unknown, allowed: readonly string[]): string | null {
  const key = requested === null || requested === undefined ? null : normalizeEmissionPointKey(requested);
  if (requested !== null && requested !== undefined && !key) {
    throw new Error(`Punto de emisión por defecto inválido: "${String(requested)}". Formato: 001-002.`);
  }
  if (allowed.length === 0) return key;
  return key && allowed.includes(key) ? key : allowed[0];
}

/** Los puntos de la lista que no existen (o están inactivos) en los establecimientos. */
export function missingEmissionPoints(
  keys: readonly string[],
  establishments: ReadonlyArray<{ code?: unknown; isActive?: unknown; emissionPoints?: unknown }>,
): string[] {
  const existing = new Set<string>();
  for (const e of establishments) {
    if (e.isActive === false) continue;
    for (const p of (Array.isArray(e.emissionPoints) ? e.emissionPoints : []) as Array<Record<string, unknown>>) {
      if (p?.['isActive'] === false) continue;
      const key = formatEmissionPoint(e.code, p?.['code']);
      if (key) existing.add(key);
    }
  }
  return keys.filter(k => !existing.has(k));
}

/**
 * Valida contra `companies/{companyId}/establishments` que cada punto exista y
 * esté activo. Una empresa sin establecimientos registrados no se valida (las
 * anteriores a este módulo): se acepta la lista tal cual.
 */
export async function assertEmissionPointsExist(
  db: admin.firestore.Firestore,
  companyId: string,
  keys: readonly string[],
): Promise<void> {
  if (keys.length === 0) return;
  const snap = await db.collection(`companies/${companyId}/establishments`).get();
  if (snap.empty) return;
  const missing = missingEmissionPoints(keys, snap.docs.map(d => d.data()));
  if (missing.length) {
    throw new Error(`Puntos de emisión que no existen o están inactivos: ${missing.join(', ')}.`);
  }
}

/** Si el usuario puede emitir desde ese establecimiento y punto. */
export function canUseEmissionPoint(
  allowed: readonly string[] | undefined,
  role: string | undefined,
  establishment: unknown,
  emissionPoint: unknown,
): boolean {
  if (role === 'admin' || role === 'super_admin') return true;
  if (!allowed || allowed.length === 0) return true;
  const key = formatEmissionPoint(establishment, emissionPoint);
  return key !== null && allowed.includes(key);
}
