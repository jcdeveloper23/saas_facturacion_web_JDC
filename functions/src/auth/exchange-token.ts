import { onRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

/**
 * exchangeToken — Federación de identidad entre proyectos Firebase
 *
 * El SaaS de facturación es el sistema central. Los sistemas satélite
 * (WeWorksCloud/Conectate y Mi Buseta) tienen su propio proyecto Firebase y su
 * propio Auth, así que sus tokens NO sirven acá: un ID token solo es válido en
 * el proyecto que lo emitió.
 *
 * Esta función recibe el ID token del proyecto de origen, lo verifica contra ese
 * proyecto, busca la identidad en el registro `identity-links` y devuelve un
 * custom token DE ESTE proyecto. El cliente hace signInWithCustomToken con una
 * FirebaseApp secundaria y desde ahí ya puede llamar a las callables normales.
 *
 * Es onRequest y no onCall a propósito: en este punto el cliente todavía no
 * tiene sesión en este proyecto, así que no hay request.auth que validar.
 *
 * Body:    { idToken: string, origin: 'work-cloud' | 'mi-buseta', companyId?: string }
 * Returns: { customToken: string, uid: string, role: string, companyId: string | null }
 *
 * Una persona es UN usuario de este proyecto, miembro de una o varias empresas
 * (companies/{cid}/company-users/{uid}). `companyId` elige con cuál trabaja en
 * esta sesión, y el rol sale de su membresía en esa empresa. Sin `companyId`
 * se usa la empresa con la que se vinculó por primera vez.
 */

// ── Proyectos de origen autorizados ─────────────────────────────────────────
// Sin credenciales: verificar un ID token de otro proyecto solo necesita su
// projectId (audiencia y emisor del token) y los certificados públicos de
// Google, que el SDK descarga solo. Antes se cargaba el JSON de una cuenta de
// servicio de cada origen; se quitó (2026-09-21) porque es una clave de larga
// duración que no hacía falta, y la plataforma decidió no usar claves
// descargadas. Ver App_AdminWeb_Conectate/weworkscloud/docs/PLAN_MODULO_CONTABILIDAD_CLIENTE.md.
export const ALLOWED_ORIGINS: Record<string, { projectId: string }> = {
  'work-cloud': { projectId: 'work-cloud-df68a' },
  'mi-buseta': { projectId: 'mi-buseta-357902' },
};

/**
 * Empresa y rol de la sesión. El rol sale de la membresía en la empresa pedida,
 * nunca de lo que diga el cliente. Devuelve null si no tiene acceso.
 */
export function resolveSessionScope(
  link: { role?: string; companyId?: string | null },
  requestedCompanyId: string | null,
  membership: { exists: boolean; isActive?: boolean; platformRole?: string } | null,
): { companyId: string | null; role: string } | null {
  if (!requestedCompanyId) {
    return link.role ? { companyId: link.companyId ?? null, role: link.role } : null;
  }
  if (!membership || !membership.exists || membership.isActive === false) return null;
  const role = membership.platformRole || link.role;
  return role ? { companyId: requestedCompanyId, role } : null;
}

// Apps de Admin SDK secundarias, una por origen. Se cachean entre invocaciones
// porque inicializar una app en cada request agota la instancia.
const originApps = new Map<string, admin.app.App>();

function getOriginApp(origin: string): admin.app.App {
  const cached = originApps.get(origin);
  if (cached) return cached;

  const config = ALLOWED_ORIGINS[origin];
  const app = admin.initializeApp({ projectId: config.projectId }, `origin-${origin}`);
  originApps.set(origin, app);
  return app;
}

export const exchangeToken = onRequest(
  { cors: true },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'method-not-allowed', message: 'Usar POST.' });
      return;
    }

    const { idToken, origin, companyId: requestedCompanyId } =
      (req.body ?? {}) as { idToken?: string; origin?: string; companyId?: string };

    if (!idToken || typeof idToken !== 'string') {
      res.status(400).json({ error: 'invalid-argument', message: 'idToken es requerido.' });
      return;
    }
    if (!origin || !ALLOWED_ORIGINS[origin]) {
      res.status(400).json({ error: 'invalid-argument', message: `Origen '${origin}' no autorizado.` });
      return;
    }

    try {
      // ── 1. Verificar el token contra el proyecto que lo emitió ─────────────
      // Firma, audiencia, emisor y vencimiento (1 h). Sin checkRevoked: eso
      // obliga a consultar el Auth del proyecto de origen, o sea credenciales
      // cruzadas. No hace falta, porque lo que da acceso es el vínculo de
      // identity-links, que se revisa en cada canje (enabled). Para cortar el
      // acceso de alguien: enabled = false en su vínculo.
      const originAuth = getOriginApp(origin).auth();
      let decoded: admin.auth.DecodedIdToken;
      try {
        decoded = await originAuth.verifyIdToken(idToken);
      } catch (verifyErr: any) {
        // Solo esto es «tu sesión no sirve». Cualquier otro error de Auth más
        // abajo es de este servidor (permisos, configuración), no del usuario:
        // mandarlo a iniciar sesión otra vez no lo arregla.
        console.warn('[exchangeToken] Token rechazado:', verifyErr?.code);
        res.status(401).json({
          error: 'unauthenticated',
          message: 'La sesión de origen no es válida. Vuelva a iniciar sesión.',
        });
        return;
      }

      const originUid = decoded.uid;
      console.log('[exchangeToken] Token verificado:', { origin, originUid });

      // ── 2. Buscar la identidad en el registro ──────────────────────────────
      // El cliente NO decide su rol. Lo decide este registro, y nada más.
      const db = admin.firestore();
      const linkId = `${origin}:${originUid}`;
      const linkSnap = await db.doc(`identity-links/${linkId}`).get();

      if (!linkSnap.exists) {
        console.warn('[exchangeToken] Identidad sin vincular:', linkId);
        res.status(403).json({
          error: 'permission-denied',
          message: 'Esta cuenta no tiene acceso al sistema de facturación.',
        });
        return;
      }

      const link = linkSnap.data() as {
        saasUid: string;
        role: string;
        companyId?: string | null;
        enabled?: boolean;
      };

      if (link.enabled === false) {
        res.status(403).json({
          error: 'permission-denied',
          message: 'El acceso de esta cuenta está deshabilitado.',
        });
        return;
      }

      // ── 3. Verificar que el usuario destino exista en este proyecto ────────
      const auth = admin.auth();
      try {
        await auth.getUser(link.saasUid);
      } catch {
        console.error('[exchangeToken] saasUid inexistente:', link.saasUid);
        res.status(500).json({
          error: 'internal',
          message: 'La cuenta vinculada ya no existe. Contacte al administrador.',
        });
        return;
      }

      // ── 4. Empresa y rol de esta sesión ────────────────────────────────────
      const wanted =
        typeof requestedCompanyId === 'string' && requestedCompanyId.trim() !== ''
          ? requestedCompanyId.trim()
          : null;
      let membership: { exists: boolean; isActive?: boolean; platformRole?: string } | null = null;
      if (wanted) {
        const snap = await db.doc(`companies/${wanted}/company-users/${link.saasUid}`).get();
        membership = {
          exists: snap.exists,
          isActive: snap.get('isActive'),
          platformRole: snap.get('platformRole'),
        };
      }
      const scope = resolveSessionScope(link, wanted, membership);
      if (!scope) {
        res.status(403).json({
          error: 'permission-denied',
          message: 'Esta cuenta no tiene acceso a esa empresa.',
        });
        return;
      }

      // ── 5. Emitir el custom token ──────────────────────────────────────────
      const claims: Record<string, unknown> = { role: scope.role, origin, originUid };
      if (scope.companyId) claims['companyId'] = scope.companyId;

      const customToken = await auth.createCustomToken(link.saasUid, claims);

      // Dejar rastro del último canje. Sirve para auditar accesos cruzados.
      await linkSnap.ref.set({ lastExchangeAt: Timestamp.now() }, { merge: true });

      res.status(200).json({
        customToken,
        uid: link.saasUid,
        role: scope.role,
        companyId: scope.companyId,
      });
    } catch (err: any) {
      // auth/insufficient-permission al firmar el custom token: a la cuenta de
      // ejecución le falta «Creador de tokens de cuenta de servicio» sobre sí
      // misma (visto el 2026-09-21, primera vez que esta función corrió).
      console.error('[exchangeToken] Error:', { code: err?.code, detail: err?.message });
      res.status(500).json({
        error: 'internal',
        message: 'El sistema de facturación no pudo abrir la sesión. Avise al administrador.',
      });
    }
  },
);
