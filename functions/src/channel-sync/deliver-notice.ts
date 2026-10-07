/**
 * deliver-notice.ts
 *
 * Manda el aviso de datos maestros al receptor del canal y decide qué hacer
 * con la respuesta. Sin firebase: el token y el `fetch` se inyectan, para
 * probar el criterio sin red.
 *
 * Criterio (el trigger corre con `retry: true`):
 *   - 2xx              → entregado.
 *   - 4xx              → el receptor lo rechaza a propósito (token, contrato,
 *                        canal apagado…): reintentar no lo arregla. Se deja
 *                        constancia y se da por terminado.
 *   - 5xx, red, tiempo → se lanza el error para que Firestore reintente.
 */

import type { MasterDataPayload } from '../utils/master-data-projection';

export const DELIVERY_TIMEOUT_MS = 10_000;

export type DeliveryResult =
  | { outcome: 'delivered'; status: number }
  | { outcome: 'rejected'; status: number; body: string };

export interface DeliveryDeps {
  /** ID token OIDC con audience = url. */
  getIdToken: (url: string) => Promise<string>;
  fetch: typeof fetch;
  timeoutMs?: number;
}

export class RetryableDeliveryError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'RetryableDeliveryError';
  }
}

export async function deliverNotice(
  url: string,
  payload: MasterDataPayload,
  deps: DeliveryDeps,
): Promise<DeliveryResult> {
  const token = await deps.getIdToken(url);

  let response: Response;
  try {
    response = await deps.fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(deps.timeoutMs ?? DELIVERY_TIMEOUT_MS),
    });
  } catch (err) {
    // Red caída o tiempo agotado: que Firestore reintente.
    throw new RetryableDeliveryError(
      `No se pudo entregar el aviso: ${(err as Error)?.message ?? err}`,
    );
  }

  if (response.status >= 200 && response.status < 300) {
    return { outcome: 'delivered', status: response.status };
  }

  const body = (await response.text().catch(() => '')).slice(0, 500);
  if (response.status >= 400 && response.status < 500) {
    return { outcome: 'rejected', status: response.status, body };
  }
  throw new RetryableDeliveryError(
    `El receptor respondió ${response.status}: ${body}`,
    response.status,
  );
}
