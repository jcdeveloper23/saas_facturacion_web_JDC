import * as admin from 'firebase-admin';
import * as nodemailer from 'nodemailer';

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
export async function createSmtpTransporter(): Promise<nodemailer.Transporter> {
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
export async function getSmtpFrom(): Promise<string> {
  const cfg = await loadSmtpConfig();
  if (cfg?.from) return cfg.from;
  return process.env['SMTP_FROM'] ?? process.env['SMTP_USER'] ?? 'noreply@example.com';
}

/** Invalidate cache (useful after saving new config) */
export function invalidateSmtpCache(): void {
  cachedConfig    = null;
  cacheExpiresAt  = 0;
}
