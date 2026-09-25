import * as admin from 'firebase-admin';
import * as nodemailer from 'nodemailer';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

/**
 * SmtpConfig loaded from Firestore or env vars.
 * Firestore path: platform/defaults/smtpConfig/data
 * Falls back to SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_FROM env vars.
 */
interface SmtpConfig {
  host:     string;
  port:     number;
  secure:   boolean;
  user:     string;
  pass:     string;
  from:     string;
  isActive: boolean;
}

let cachedConfig: SmtpConfig | null = null;
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ─── Correo propio de cada empresa ───────────────────────────────────────────
//
// El correo de la plataforma es uno solo para todos: las facturas de todos los
// clientes salen del mismo buzón y el comprador ve nuestro dominio, no el de
// quien le vendió. Por eso cada empresa puede poner **el suyo**, y el de la
// plataforma queda como respaldo para quien no lo haya configurado.
//
// La contraseña no se guarda en Firestore: va a Secret Manager, como la del
// certificado. En `companies/{id}/configuration/smtp` quedan solo el servidor,
// el puerto y las direcciones, que no abren nada por sí solos.

const secrets = new SecretManagerServiceClient();

const companyCache = new Map<string, { cfg: SmtpConfig | null; expires: number }>();
const channelCache = new Map<string, { cfg: SmtpConfig | null; expires: number }>();

/** `facturaec-smtp-channel-{channelId}` */
export function channelSmtpSecretIdFor(channelId: string): string {
  return `facturaec-smtp-channel-${channelId}`;
}

/** `facturaec-smtp-{companyId}` */
export function smtpSecretIdFor(companyId: string): string {
  return `facturaec-smtp-${companyId}`;
}

function projectIdOrThrow(): string {
  const id =
    process.env['GCLOUD_PROJECT'] ||
    process.env['GOOGLE_CLOUD_PROJECT'] ||
    process.env['FIREBASE_CONFIG_PROJECT_ID'];
  if (!id) throw new Error('No se pudo determinar el proyecto para Secret Manager.');
  return id;
}

function smtpSecretName(companyId: string): string {
  return `projects/${projectIdOrThrow()}/secrets/${smtpSecretIdFor(companyId)}`;
}

/** Guarda la contraseña del correo de esa empresa como una versión nueva. */
export async function saveCompanySmtpPassword(
  companyId: string,
  password: string,
): Promise<void> {
  const name = smtpSecretName(companyId);
  try {
    await secrets.getSecret({ name });
  } catch {
    await secrets.createSecret({
      parent: `projects/${projectIdOrThrow()}`,
      secretId: smtpSecretIdFor(companyId),
      secret: { replication: { automatic: {} } },
    });
  }
  await secrets.addSecretVersion({
    parent: name,
    payload: { data: Buffer.from(password, 'utf8') },
  });
  companyCache.delete(companyId);
}

/** Guarda la contraseña del correo de un canal. */
export async function saveChannelSmtpPassword(
  channelId: string,
  password: string,
): Promise<void> {
  await saveSecretValue(channelSmtpSecretIdFor(channelId), password);
  channelCache.delete(channelId);
}

/** Crea o actualiza un secreto con ese valor. */
async function saveSecretValue(secretId: string, valor: string): Promise<void> {
  const name = `projects/${projectIdOrThrow()}/secrets/${secretId}`;
  try {
    await secrets.getSecret({ name });
  } catch {
    await secrets.createSecret({
      parent: `projects/${projectIdOrThrow()}`,
      secretId,
      secret: { replication: { automatic: {} } },
    });
  }
  await secrets.addSecretVersion({
    parent: name,
    payload: { data: Buffer.from(valor, 'utf8') },
  });
}

/** El valor de un secreto, o cadena vacía si no existe. */
async function readSecretValue(secretId: string): Promise<string> {
  try {
    const [version] = await secrets.accessSecretVersion({
      name: `projects/${projectIdOrThrow()}/secrets/${secretId}/versions/latest`,
    });
    return version.payload?.data?.toString() ?? '';
  } catch (err) {
    const error = err as { code?: number; message?: string };
    // 5 = NOT_FOUND: no tiene correo propio, y eso es lo normal.
    if (error.code !== 5) {
      console.error('[smtp-helper] No se pudo leer un secreto de correo:', error.message);
    }
    return '';
  }
}

/**
 * El correo del canal: el del proveedor que trajo a esa empresa.
 *
 * Es el escalón intermedio. Una empresa sin correo propio envía con el de su
 * canal —el dominio de quien le vendió el servicio— antes de caer en el de la
 * plataforma.
 */
async function loadChannelSmtpConfig(channelId: string): Promise<SmtpConfig | null> {
  const ahora = Date.now();
  const enCache = channelCache.get(channelId);
  if (enCache && ahora < enCache.expires) return enCache.cfg;

  let cfg: SmtpConfig | null = null;
  try {
    const snap = await admin.firestore().doc(`channels/${channelId}`).get();
    const d = (snap.data()?.['smtp'] ?? null) as Record<string, any> | null;
    if (d && d['isActive'] !== false && d['host'] && d['user']) {
      const pass = await readSecretValue(channelSmtpSecretIdFor(channelId));
      if (pass) {
        cfg = {
          host: d['host'],
          port: d['port'] ?? 587,
          secure: d['secure'] ?? false,
          user: d['user'],
          pass,
          from: d['from'] || d['user'],
          isActive: true,
        };
      }
    }
  } catch (err) {
    console.warn('[smtp-helper] No se pudo leer el correo del canal:', channelId, err);
  }

  channelCache.set(channelId, { cfg, expires: ahora + CACHE_TTL_MS });
  return cfg;
}

/** El transporte del canal, para el correo de prueba. */
export async function createChannelSmtpTransporter(
  channelId: string,
): Promise<nodemailer.Transporter | null> {
  const cfg = await loadChannelSmtpConfig(channelId);
  return cfg ? transporterFrom(cfg) : null;
}

/** El canal al que pertenece esa empresa, si lo tiene. */
async function channelOf(companyId: string): Promise<string | null> {
  try {
    const snap = await admin.firestore().doc(`companies/${companyId}`).get();
    const id = snap.data()?.['channelId'];
    return id ? `${id}` : null;
  } catch {
    return null;
  }
}

/** La configuración que le toca a esa empresa: la suya, o la de su canal. */
async function loadSmtpForCompany(companyId: string): Promise<SmtpConfig | null> {
  const propio = await loadCompanySmtpConfig(companyId);
  if (propio) return propio;
  const canal = await channelOf(companyId);
  return canal ? loadChannelSmtpConfig(canal) : null;
}

/** La contraseña guardada, o cadena vacía si esa empresa no tiene ninguna. */
async function readCompanySmtpPassword(companyId: string): Promise<string> {
  try {
    const [version] = await secrets.accessSecretVersion({
      name: `${smtpSecretName(companyId)}/versions/latest`,
    });
    return version.payload?.data?.toString() ?? '';
  } catch (err) {
    const error = err as { code?: number; message?: string };
    // 5 = NOT_FOUND: esta empresa no tiene correo propio, y eso es normal.
    if (error.code !== 5) {
      console.error('[smtp-helper] No se pudo leer la contraseña del correo:', error.message);
    }
    return '';
  }
}

/**
 * El correo propio de la empresa, o null si no lo tiene o está apagado.
 */
async function loadCompanySmtpConfig(companyId: string): Promise<SmtpConfig | null> {
  const ahora = Date.now();
  const enCache = companyCache.get(companyId);
  if (enCache && ahora < enCache.expires) return enCache.cfg;

  let cfg: SmtpConfig | null = null;
  try {
    const snap = await admin
      .firestore()
      .doc(`companies/${companyId}/configuration/smtp`)
      .get();
    const d = snap.data() as Record<string, any> | undefined;
    if (d && d['isActive'] && d['host'] && d['user']) {
      const pass = await readCompanySmtpPassword(companyId);
      if (pass) {
        cfg = {
          host: d['host'],
          port: d['port'] ?? 587,
          secure: d['secure'] ?? false,
          user: d['user'],
          pass,
          from: d['from'] || d['user'],
          isActive: true,
        };
      } else {
        console.warn('[smtp-helper] La empresa tiene correo configurado pero sin contraseña:', companyId);
      }
    }
  } catch (err) {
    console.warn('[smtp-helper] No se pudo leer el correo de la empresa:', companyId, err);
  }

  companyCache.set(companyId, { cfg, expires: ahora + CACHE_TTL_MS });
  return cfg;
}

/** Crea el transporte con una configuración ya resuelta. */
function transporterFrom(cfg: SmtpConfig): nodemailer.Transporter {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
  });
}

/** Comprueba que esos datos sirven para enviar, sin guardar nada. */
export async function verifySmtpConfig(cfg: SmtpConfig): Promise<void> {
  await transporterFrom(cfg).verify();
}

async function loadSmtpConfig(): Promise<SmtpConfig | null> {
  const now = Date.now();
  if (cachedConfig && now < cacheExpiresAt) return cachedConfig;

  try {
    const db   = admin.firestore();
    const snap = await db.doc('platform/defaults/smtpConfig/data').get();
    if (snap.exists) {
      const d = snap.data() as Record<string, any>;
      if (d['isActive'] && d['host'] && d['user'] && d['pass']) {
        cachedConfig = {
          host:     d['host'],
          port:     d['port'] ?? 587,
          secure:   d['secure'] ?? false,
          user:     d['user'],
          pass:     d['pass'],
          from:     d['from'] ?? d['user'],
          isActive: true,
        };
        cacheExpiresAt = now + CACHE_TTL_MS;
        return cachedConfig;
      }
    }
  } catch (err) {
    console.warn('[smtp-helper] Error al leer smtpConfig de Firestore, usando env vars:', err);
  }

  return null;
}

/**
 * Creates a nodemailer transporter.
 * Priority: Firestore smtpConfig (isActive=true) → environment variables.
 * Throws if neither source provides valid credentials.
 */
export async function createSmtpTransporter(
  companyId?: string,
): Promise<nodemailer.Transporter> {
  if (companyId) {
    const propio = await loadSmtpForCompany(companyId);
    if (propio) {
      console.log('[smtp-helper] Usando el correo de la empresa o su canal. Host:', propio.host);
      return transporterFrom(propio);
    }
  }

  const cfg = await loadSmtpConfig();

  if (cfg) {
    console.log('[smtp-helper] Usando config SMTP de Firestore. Host:', cfg.host);
    return nodemailer.createTransport({
      host:   cfg.host,
      port:   cfg.port,
      secure: cfg.secure,
      auth:   { user: cfg.user, pass: cfg.pass },
    });
  }

  // Fallback to env vars
  const host = process.env['SMTP_HOST'] ?? '';
  const port = parseInt(process.env['SMTP_PORT'] ?? '587', 10);
  const user = process.env['SMTP_USER'] ?? '';
  const pass = process.env['SMTP_PASS'] ?? '';

  if (!host || !user || !pass) {
    throw new Error(
      'SMTP no configurado. Configure la sección "Config SMTP" en el panel super-admin, ' +
      'o establezca las variables SMTP_HOST, SMTP_USER, SMTP_PASS.'
    );
  }

  console.log('[smtp-helper] Usando config SMTP de variables de entorno. Host:', host);
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

/**
 * Returns the "from" address.
 * Priority: Firestore smtpConfig.from → SMTP_FROM env → SMTP_USER env → noreply@example.com
 */
export async function getSmtpFrom(companyId?: string): Promise<string> {
  if (companyId) {
    const propio = await loadSmtpForCompany(companyId);
    if (propio?.from) return propio.from;
  }
  const cfg = await loadSmtpConfig();
  if (cfg?.from) return cfg.from;
  return process.env['SMTP_FROM'] ?? process.env['SMTP_USER'] ?? 'noreply@example.com';
}

/** Invalidate cache (useful after saving new config) */
/**
 * Quién firma el correo que ve el comprador.
 *
 * Cuando envía la plataforma —el caso normal— la dirección es la nuestra, y
 * eso al comprador no le dice nada: recibe una factura de un remitente que no
 * reconoce y acaba en spam. Así que el **nombre** que se muestra es el de la
 * empresa que emitió, y el `Reply-To` es su correo: si el comprador contesta,
 * le contesta a su proveedor, no a nosotros.
 *
 * Si la empresa puso su propio correo y eligió cómo aparecer, se respeta tal
 * cual: ya es su dominio y su nombre.
 */
export async function resolveSender(
  companyId: string,
  opts: { razonSocial?: string; replyTo?: string } = {},
): Promise<{ from: string; replyTo?: string }> {
  // Solo cuando envía **la propia empresa** se respeta cómo eligió aparecer.
  // Si envía su canal o la plataforma, la dirección es nuestra y el nombre que
  // ve el comprador tiene que ser el de quien le facturó.
  const propio = companyId ? await loadCompanySmtpConfig(companyId) : null;
  const base = propio?.from || (await getSmtpFrom(companyId));

  const replyTo = (opts.replyTo ?? '').trim();
  const nombre = (opts.razonSocial ?? '').trim();

  // La empresa ya eligió cómo presentarse.
  if (propio && base.includes('<')) {
    return { from: base, replyTo: replyTo || undefined };
  }

  const direccion = addressOf(base);
  const from = nombre ? `${quoteName(nombre)} <${direccion}>` : base;
  return {
    // No tiene sentido pedir respuesta a la misma dirección desde la que se
    // envía cuando es la nuestra y nadie la lee.
    from,
    replyTo: replyTo && replyTo !== direccion ? replyTo : undefined,
  };
}

/** `Nombre <a@b.com>` → `a@b.com`. */
function addressOf(remitente: string): string {
  const abre = remitente.lastIndexOf('<');
  const cierra = remitente.lastIndexOf('>');
  if (abre >= 0 && cierra > abre) return remitente.slice(abre + 1, cierra).trim();
  return remitente.trim();
}

/** Entrecomilla el nombre si lleva algo que rompería la cabecera del correo. */
function quoteName(nombre: string): string {
  const limpio = nombre.replace(/["\\\r\n]/g, ' ').trim();
  return /[,;:<>@]/.test(limpio) ? `"${limpio}"` : limpio;
}

export function invalidateSmtpCache(companyId?: string): void {
  cachedConfig    = null;
  cacheExpiresAt  = 0;
  if (companyId) companyCache.delete(companyId);
  else companyCache.clear();
  channelCache.clear();
}

export type { SmtpConfig };
