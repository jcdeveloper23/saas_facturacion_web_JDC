/**
 * notify-channel.ts
 *
 * Avisa al canal de la empresa (hoy, Conecta) cuando cambia un dato fiscal de
 * una persona o de un artículo. Decisión del usuario del 2026-10-07, «etapa 2»
 * de unificar clientes y productos: FacturaEc manda y el canal guarda una
 * copia que se actualiza sola, en sentido único FacturaEc → canal.
 *
 * Flujo de cada trigger:
 *   1. Si no cambió nada de la proyección (`projectionChanged`), nada que avisar
 *      —un movimiento de stock o de costo no le interesa al canal—.
 *   2. Si el evento tiene más de 1 hora, se descarta: corta los reintentos
 *      infinitos de `retry: true` cuando el receptor lleva caído mucho tiempo.
 *   3. `companies/{companyId}.channelId`; sin canal, nada.
 *   4. `channels/{channelId}.masterDataSync = {enabled, url}` (en caché 5 min);
 *      apagado o sin url, nada. Lo escribe solo un super admin.
 *   5. POST del contrato (`buildPayload`) a la url con un ID token OIDC cuyo
 *      audience es la url exacta, firmado por la cuenta de ejecución por
 *      defecto. 4xx no se reintenta; red o 5xx, sí (`deliver-notice.ts`).
 */

import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { GoogleAuth } from 'google-auth-library';

import {
  MasterDataKind,
  buildPayload,
  projectionChanged,
} from '../utils/master-data-projection';
import { deliverNotice } from './deliver-notice';

/** Más viejo que esto, el aviso se descarta en vez de reintentar. */
const MAX_EVENT_AGE_MS = 60 * 60 * 1000;

const CONFIG_TTL_MS = 5 * 60 * 1000;

interface SyncConfig {
  enabled: boolean;
  url: string;
}

const configCache = new Map<string, { config: SyncConfig | null; expires: number }>();

async function readSyncConfig(channelId: string): Promise<SyncConfig | null> {
  const ahora = Date.now();
  const enCache = configCache.get(channelId);
  if (enCache && enCache.expires > ahora) return enCache.config;

  const raw = (await admin.firestore().doc(`channels/${channelId}`).get())
    .data()?.['masterDataSync'];
  const config: SyncConfig | null =
    raw && typeof raw === 'object'
      ? { enabled: raw['enabled'] === true, url: String(raw['url'] ?? '').trim() }
      : null;
  configCache.set(channelId, { config, expires: ahora + CONFIG_TTL_MS });
  return config;
}

// Un cliente OIDC por url: el audience del token es la url exacta del receptor.
const auth = new GoogleAuth();
const idTokenClients = new Map<string, ReturnType<GoogleAuth['getIdTokenClient']>>();

async function getIdToken(url: string): Promise<string> {
  let client = idTokenClients.get(url);
  if (!client) {
    client = auth.getIdTokenClient(url);
    // Si falla al crearse, que el próximo intento lo vuelva a crear.
    client.catch(() => idTokenClients.delete(url));
    idTokenClients.set(url, client);
  }
  return (await client).idTokenProvider.fetchIdToken(url);
}

async function notifyChannel(
  kind: MasterDataKind,
  event: {
    time: string;
    params: Record<string, string>;
    data?: { before: FirebaseFirestore.DocumentSnapshot; after: FirebaseFirestore.DocumentSnapshot };
  },
  idParam: string,
): Promise<void> {
  const tag = kind === 'persona' ? '[onPersonaWrittenNotifyChannel]' : '[onProductWrittenNotifyChannel]';
  const companyId = event.params['companyId'];
  const id = event.params[idParam];

  const before = event.data?.before.exists ? (event.data.before.data() as Record<string, unknown>) : null;
  const after = event.data?.after.exists ? (event.data.after.data() as Record<string, unknown>) : null;

  if (!projectionChanged(kind, before, after)) return;

  const age = Date.now() - Date.parse(event.time);
  if (age > MAX_EVENT_AGE_MS) {
    logger.warn(`${tag} Evento de hace más de 1 hora: se descarta sin avisar.`, {
      companyId, id, eventTime: event.time,
    });
    return;
  }

  const company = (await admin.firestore().doc(`companies/${companyId}`).get()).data();
  const channelId = String(company?.['channelId'] ?? '').trim();
  if (!channelId) return;

  const config = await readSyncConfig(channelId);
  if (!config?.enabled || !config.url) return;

  const payload = buildPayload({ kind, companyId, id, eventTime: event.time, before, after });

  const result = await deliverNotice(config.url, payload, { getIdToken, fetch });
  if (result.outcome === 'rejected') {
    logger.warn(`${tag} El canal rechazó el aviso; no se reintenta.`, {
      companyId, id, channelId, status: result.status, body: result.body,
    });
    return;
  }
  logger.info(`${tag} Aviso entregado al canal.`, {
    companyId, id, channelId, deleted: payload.deleted, status: result.status,
  });
}

export const onPersonaWrittenNotifyChannel = onDocumentWritten(
  { document: 'companies/{companyId}/personas/{personaId}', retry: true },
  (event) => notifyChannel('persona', event, 'personaId'),
);

export const onProductWrittenNotifyChannel = onDocumentWritten(
  { document: 'companies/{companyId}/products/{productId}', retry: true },
  (event) => notifyChannel('product', event, 'productId'),
);
