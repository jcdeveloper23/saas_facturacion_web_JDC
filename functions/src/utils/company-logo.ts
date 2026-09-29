/**
 * company-logo.ts
 *
 * El logo de la empresa en el RIDE (factura, nota de crédito, retención y nota
 * de débito).
 *
 * Dónde vive:
 *   - El archivo, en Storage: `companies/{companyId}/branding/logo.{ext}` (la
 *     ruta con la que lo sube la web de FacturaEc y, desde el 2026-09-29,
 *     Conecta). Se acepta también `companies/{companyId}/logos/…`, la carpeta
 *     que ya tenía regla propia.
 *   - La URL, en `companies/{cid}/configuration/general.logoUrl` (y copiada en
 *     `companies/{cid}.logoUrl`), con `showLogoOnPdf` al lado.
 *
 * Se lee con el Admin SDK, NO con un `fetch` a la URL: la ruta se deriva de
 * `logoUrl` y solo se acepta si cae en el bucket por defecto y dentro de las
 * carpetas de logo de ESA empresa. Así un `logoUrl` manipulado no puede hacer
 * que el servidor pida una URL cualquiera ni que meta en el PDF un archivo de
 * otra empresa (o su certificado).
 *
 * Nada de esto rompe el RIDE: si el logo no está, no se puede leer o no es PNG
 * ni JPG (PDFKit no dibuja SVG ni WebP), el comprobante sale sin logo.
 */

import * as admin from 'firebase-admin';
import { getStorage } from 'firebase-admin/storage';

/** Tope de lo que se descarga. La web deja subir hasta 2 MB; esto es holgura. */
export const LOGO_MAX_DOWNLOAD_BYTES = 5 * 1024 * 1024;

/** Carpetas de Storage donde puede estar el logo de una empresa. */
const LOGO_FOLDERS = ['branding', 'logos'];

export type LogoFormat = 'png' | 'jpeg';

/**
 * Ruta del objeto en Storage a partir de la URL guardada en `logoUrl`.
 * Reconoce las tres formas habituales:
 *   - `https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{ruta codificada}?alt=media&token=…`
 *   - `https://storage.googleapis.com/{bucket}/{ruta}`
 *   - `gs://{bucket}/{ruta}`
 * Devuelve `null` si el bucket no es el esperado o la ruta no es una carpeta de
 * logo de `companyId`.
 */
export function logoStoragePath(
  logoUrl: string,
  bucketName: string,
  companyId: string,
): string | null {
  if (!logoUrl || !bucketName || !companyId) return null;

  let bucket: string;
  let path: string;
  try {
    if (logoUrl.startsWith('gs://')) {
      const rest = logoUrl.slice('gs://'.length);
      const slash = rest.indexOf('/');
      if (slash < 0) return null;
      bucket = rest.slice(0, slash);
      path = rest.slice(slash + 1);
    } else {
      const url = new URL(logoUrl);
      if (url.protocol !== 'https:') return null;
      if (url.hostname === 'firebasestorage.googleapis.com') {
        const m = url.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
        if (!m) return null;
        bucket = decodeURIComponent(m[1]);
        path = decodeURIComponent(m[2]);
      } else if (url.hostname === 'storage.googleapis.com') {
        const m = url.pathname.match(/^\/([^/]+)\/(.+)$/);
        if (!m) return null;
        bucket = decodeURIComponent(m[1]);
        path = decodeURIComponent(m[2]);
      } else {
        return null;
      }
    }
  } catch {
    return null;
  }

  if (bucket !== bucketName) return null;
  // Nada de `..` ni segmentos vacíos: la ruta tiene que ser literal.
  const parts = path.split('/');
  if (parts.some(p => p === '' || p === '.' || p === '..')) return null;
  if (parts.length !== 4) return null;
  const [root, cid, folder] = parts;
  if (root !== 'companies' || cid !== companyId) return null;
  if (!LOGO_FOLDERS.includes(folder)) return null;
  return path;
}

/** PNG o JPG por su firma. Cualquier otra cosa, `null`. */
export function detectLogoFormat(buf: Buffer | null | undefined): LogoFormat | null {
  if (!buf || buf.length < 8) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47
      && buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a) {
    return 'png';
  }
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  return null;
}

/**
 * Qué logo y si se muestra. Mismo orden que `TenantService` en la web:
 * `configuration/general` manda y el documento de la empresa es respaldo.
 * `showLogoOnPdf` sin definir cuenta como `true`: si alguien subió un logo, lo
 * natural es verlo en sus comprobantes (la web también nace en `true`).
 */
export function resolveLogoSettings(
  general: Record<string, unknown> | undefined | null,
  company: Record<string, unknown> | undefined | null,
): { logoUrl: string; show: boolean } {
  const g = general ?? {};
  const c = company ?? {};
  const rawUrl = g['logoUrl'] ?? c['logoUrl'];
  const rawShow = g['showLogoOnPdf'] ?? c['showLogoOnPdf'];
  return {
    logoUrl: typeof rawUrl === 'string' ? rawUrl.trim() : '',
    show: rawShow !== false,
  };
}

/**
 * Descarga el logo de la empresa para el RIDE. Nunca lanza: ante cualquier
 * problema devuelve `null` y el comprobante sale sin logo.
 *
 * `companyData` es opcional para no releer `companies/{cid}` cuando el
 * generador ya lo tiene.
 */
export async function loadCompanyLogo(
  companyId: string,
  companyData?: Record<string, unknown> | null,
  tag = 'company-logo',
): Promise<Buffer | null> {
  try {
    const db = admin.firestore();
    const [generalSnap, companySnap] = await Promise.all([
      db.doc(`companies/${companyId}/configuration/general`).get(),
      companyData ? Promise.resolve(null) : db.doc(`companies/${companyId}`).get(),
    ]);
    const { logoUrl, show } = resolveLogoSettings(
      generalSnap.exists ? generalSnap.data() : null,
      companyData ?? companySnap?.data() ?? null,
    );
    if (!logoUrl || !show) return null;

    const bucket = getStorage().bucket();
    const path = logoStoragePath(logoUrl, bucket.name, companyId);
    if (!path) {
      console.warn(`[${tag}] logoUrl fuera de las carpetas de logo de la empresa; se omite.`);
      return null;
    }

    const file = bucket.file(path);
    const [meta] = await file.getMetadata();
    const size = Number(meta.size ?? 0);
    if (size > LOGO_MAX_DOWNLOAD_BYTES) {
      console.warn(`[${tag}] Logo demasiado grande (${size} bytes); se omite.`);
      return null;
    }

    const [buf] = await file.download();
    if (!detectLogoFormat(buf)) {
      console.warn(`[${tag}] El logo no es PNG ni JPG; se omite.`);
      return null;
    }
    console.log(`[${tag}] Logo cargado, bytes:`, buf.length);
    return buf;
  } catch (err) {
    console.warn(`[${tag}] Logo no disponible:`, err);
    return null;
  }
}

/** Lo mínimo de PDFKit que hace falta para dibujar el logo. */
interface LogoDoc {
  image(src: unknown, x?: number, y?: number, options?: Record<string, unknown>): unknown;
}

/**
 * Dibuja el logo dentro de una caja de `maxW` × `maxH`, conservando la
 * proporción, y devuelve el ALTO REAL que ocupó (0 si no se dibujó). Quien
 * llama avanza su propia `y` con ese valor: `doc.image` no mueve `doc.y` de
 * forma fiable cuando se le da una posición explícita.
 */
export function drawLogo(
  doc: LogoDoc,
  logo: Buffer | null | undefined,
  x: number,
  y: number,
  maxW: number,
  maxH: number,
  align: 'left' | 'center' = 'left',
): number {
  if (!logo || !detectLogoFormat(logo)) return 0;
  try {
    const img = (doc as unknown as { openImage(b: Buffer): { width: number; height: number } })
      .openImage(logo);
    if (!img?.width || !img?.height) return 0;
    const scale = Math.min(maxW / img.width, maxH / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    const dx = align === 'center' ? x + (maxW - w) / 2 : x;
    doc.image(img, dx, y, { width: w, height: h });
    return h;
  } catch (err) {
    console.warn('[company-logo] No se pudo dibujar el logo:', err);
    return 0;
  }
}
