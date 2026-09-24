import * as admin from 'firebase-admin';
import { getStorage } from 'firebase-admin/storage';

/**
 * Los archivos del comprobante, adjuntos al correo.
 *
 * El correo llevaba solo **enlaces** al RIDE y al XML. Para el SRI, lo que hay
 * que entregarle al comprador es el comprobante, y un enlace no es el
 * comprobante: caduca en la memoria de la gente, no se archiva con el correo y
 * no sirve cuando el contador del cliente pide el XML meses después. Van los
 * dos adjuntos, y los enlaces se quedan como comodidad.
 */

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

/**
 * Baja de Storage el archivo de esa URL pública.
 *
 * Devuelve null si no se puede: un adjunto que falta no debe impedir que el
 * comprobante llegue. El enlace del cuerpo del correo sigue sirviendo.
 */
export async function fetchStorageAttachment(
  url: string | undefined,
  filename: string,
  contentType: string,
): Promise<EmailAttachment | null> {
  if (!url) return null;

  const prefijo = 'https://storage.googleapis.com/';
  if (!url.startsWith(prefijo)) {
    console.warn('[email-attachments] URL que no es de Storage:', url);
    return null;
  }

  try {
    const resto = url.slice(prefijo.length);
    const corte = resto.indexOf('/');
    if (corte < 0) return null;
    const bucket = resto.slice(0, corte);
    const ruta = decodeURIComponent(resto.slice(corte + 1).split('?')[0]);

    const [content] = await getStorage().bucket(bucket).file(ruta).download();
    return { filename, content, contentType };
  } catch (err) {
    console.error('[email-attachments] No se pudo bajar el adjunto:', filename, err);
    return null;
  }
}

/**
 * Deja constancia en el comprobante de cómo fue el envío.
 *
 * Sin esto, un correo que no sale no deja rastro en ninguna parte: el
 * documento queda autorizado, nadie se entera de que el cliente no lo recibió
 * y el fallo solo vive en los registros del servidor.
 */
export async function recordEmailResult(
  companyId: string,
  documentId: string,
  resultado: { sent: boolean; to?: string; error?: string },
): Promise<void> {
  try {
    await admin
      .firestore()
      .doc(`companies/${companyId}/invoices/${documentId}`)
      .update({
        emailSent: resultado.sent,
        emailTo: resultado.to ?? '',
        emailSentAt: resultado.sent
          ? admin.firestore.Timestamp.now()
          : admin.firestore.FieldValue.delete(),
        emailError: resultado.error ?? admin.firestore.FieldValue.delete(),
      });
  } catch (err) {
    console.error('[email-attachments] No se pudo anotar el envío:', err);
  }
}
