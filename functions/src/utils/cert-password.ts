import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import * as admin from 'firebase-admin';

/**
 * La contraseña del certificado .p12 de cada empresa, en Secret Manager.
 *
 * Hasta el 2026-09-23 vivía en claro en `companies/{companyId}.sri.certificatePassword`,
 * y ese documento lo lee **cualquier usuario de la empresa** —cajero, vendedor,
 * contador— porque las reglas no restringen por campo. El archivo .p12 sí estaba
 * cerrado (`storage.rules`: nadie), pero la llave no.
 *
 * Ahora la contraseña es un secreto por empresa, `facturaec-cert-{companyId}`, que solo
 * tocan las Cloud Functions. En Firestore quedan únicamente los metadatos del
 * certificado (ruta, huella, titular y vencimiento), que no son sensibles.
 *
 * La lectura tiene un puente con lo viejo: si todavía no hay secreto pero sí el campo en
 * Firestore, se usa ese valor, se guarda como secreto y se borra el campo. Así las
 * empresas que ya tenían certificado migran solas la primera vez que firman.
 */

const client = new SecretManagerServiceClient();

/** El proyecto donde viven los secretos: el mismo de las functions. */
function projectId(): string {
  const id =
    process.env.GCLOUD_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.FIREBASE_CONFIG_PROJECT_ID;
  if (!id) throw new Error('No se pudo determinar el proyecto para Secret Manager.');
  return id;
}

/** `facturaec-cert-{companyId}`. Los ids de empresa de Firestore ya son válidos como nombre. */
export function secretIdFor(companyId: string): string {
  return `facturaec-cert-${companyId}`;
}

function secretName(companyId: string): string {
  return `projects/${projectId()}/secrets/${secretIdFor(companyId)}`;
}

/**
 * Guarda la contraseña como una versión nueva del secreto de esa empresa, creando el
 * secreto si es la primera vez. Las versiones anteriores quedan, que es lo que permite
 * volver atrás si alguien sube un certificado equivocado.
 */
export async function saveCertificatePassword(
  companyId: string,
  password: string,
): Promise<void> {
  const name = secretName(companyId);
  try {
    await client.getSecret({ name });
  } catch {
    await client.createSecret({
      parent: `projects/${projectId()}`,
      secretId: secretIdFor(companyId),
      secret: { replication: { automatic: {} } },
    });
  }

  await client.addSecretVersion({
    parent: name,
    payload: { data: Buffer.from(password, 'utf8') },
  });
}

/**
 * La contraseña de esa empresa, o cadena vacía si no hay ninguna.
 *
 * [legacyPassword] es el campo viejo de Firestore. Si llega y no hay secreto, se migra:
 * se guarda el secreto y se borra el campo, para que nadie más pueda leerlo.
 */
export async function readCertificatePassword(
  companyId: string,
  legacyPassword?: string,
): Promise<string> {
  try {
    const [version] = await client.accessSecretVersion({
      name: `${secretName(companyId)}/versions/latest`,
    });
    const value = version.payload?.data?.toString();
    if (value) return value;
  } catch (err) {
    const error = err as { code?: number; message?: string };
    // 5 = NOT_FOUND: esta empresa todavía no tiene secreto, así que se intenta
    // migrar el valor viejo. Cualquier otro motivo —permisos, API apagada— hay
    // que decirlo: si no, acaba saliendo «no se encontró la contraseña», que
    // manda a recargar un certificado que está perfectamente bien.
    if (error.code !== 5) {
      throw new Error(
        `No se pudo leer la contraseña del certificado en Secret Manager: ${error.message}`,
      );
    }
    console.log('[cert-password] Sin secreto para', companyId);
  }

  if (!legacyPassword) return '';

  console.warn('[cert-password] Migrando la contraseña de', companyId, 'a Secret Manager');
  await saveCertificatePassword(companyId, legacyPassword);
  await clearLegacyPassword(companyId);
  return legacyPassword;
}

/** Borra el campo viejo de Firestore. Se llama al migrar y al subir un certificado. */
export async function clearLegacyPassword(companyId: string): Promise<void> {
  try {
    await admin.firestore().doc(`companies/${companyId}`).update({
      'sri.certificatePassword': admin.firestore.FieldValue.delete(),
    });
  } catch (err) {
    console.error('[cert-password] No se pudo borrar la contraseña vieja', err);
  }
}
