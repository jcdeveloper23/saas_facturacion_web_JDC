import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { createSmtpTransporter, getSmtpFrom } from '../utils/smtp-helper';
import { fetchStorageAttachment, recordEmailResult } from '../utils/email-attachments';

// ─── Internal send function ─────────────────────────────────────────────────

/**
 * Manda la factura autorizada al comprador.
 *
 * [overrideTo] permite reenviarla a otra dirección sin tocar la factura: el
 * caso corriente es que el correo estuviera mal escrito, y el comprobante ya
 * emitido no se edita.
 */
export async function sendInvoiceEmailInternal(
  invoiceId: string,
  companyId: string,
  overrideTo?: string
): Promise<{ sent: boolean; to: string }> {
  const db = admin.firestore();

  // ── Read invoice ────────────────────────────────────────────────────────────
  const invoiceSnap = await db.doc(`companies/${companyId}/invoices/${invoiceId}`).get();
  if (!invoiceSnap.exists) {
    throw new Error(`Factura no encontrada: ${invoiceId}`);
  }
  const invoice = invoiceSnap.data() as Record<string, any>;

  // ── Validate state ──────────────────────────────────────────────────────────
  if (invoice['sriStatus'] !== 'authorized') {
    throw new Error('Solo se pueden enviar emails de facturas autorizadas por el SRI.');
  }

  const customerEmail: string | undefined =
    (overrideTo ?? '').trim() || invoice['customerEmail'];
  if (!customerEmail) {
    console.warn('[sendInvoiceEmail] Factura sin email de cliente — omitiendo envío:', invoiceId);
    await recordEmailResult(companyId, invoiceId, {
      sent: false,
      error: 'La factura no tiene correo del cliente.',
    });
    return { sent: false, to: '' };
  }

  // ── Read company info ───────────────────────────────────────────────────────
  const companySnap = await db.doc(`companies/${companyId}`).get();
  const company = companySnap.data() as Record<string, any> | undefined;
  const companyName: string = company?.['settings']?.['companyName'] ?? 'Su proveedor';

  const sriCfgSnap = await db.doc(`companies/${companyId}/configuration/sri`).get();
  const sriCfg = sriCfgSnap.data() as Record<string, any> | undefined;
  const razonSocial: string = sriCfg?.['razonSocial'] ?? companyName;

  // ── Build email ─────────────────────────────────────────────────────────────
  const fullNumber: string  = invoice['fullNumber']          ?? invoiceId;
  const total: number       = invoice['total']               ?? 0;
  const authNumber: string  = invoice['authorizationNumber'] ?? '';
  const xmlUrl: string | undefined = invoice['xmlUrl'];
  const pdfUrl: string | undefined = invoice['pdfUrl'];

  const attachmentLinks: string[] = [];
  if (pdfUrl) attachmentLinks.push(`<a href="${pdfUrl}" style="color:#0d6efd">Descargar PDF (RIDE)</a>`);
  if (xmlUrl) attachmentLinks.push(`<a href="${xmlUrl}" style="color:#0d6efd">Descargar XML</a>`);

  const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333">

  <div style="background:#f8f9fa;border-left:4px solid #0d6efd;padding:16px;border-radius:4px;margin-bottom:20px">
    <h2 style="margin:0;color:#0d6efd;font-size:18px">Comprobante Electrónico Autorizado</h2>
    <p style="margin:4px 0 0;color:#6c757d;font-size:13px">${razonSocial}</p>
  </div>

  <p>Estimado/a <strong>${invoice['customerName'] ?? 'cliente'}</strong>,</p>
  <p>Le informamos que su factura electrónica ha sido <strong>autorizada por el SRI</strong>.</p>

  <table style="width:100%;border-collapse:collapse;margin:16px 0">
    <tr style="background:#f8f9fa">
      <td style="padding:8px;border:1px solid #dee2e6;font-weight:bold;width:40%">Número</td>
      <td style="padding:8px;border:1px solid #dee2e6;font-family:monospace">${fullNumber}</td>
    </tr>
    <tr>
      <td style="padding:8px;border:1px solid #dee2e6;font-weight:bold">Autorización SRI</td>
      <td style="padding:8px;border:1px solid #dee2e6;font-family:monospace;font-size:11px">${authNumber}</td>
    </tr>
    <tr style="background:#f8f9fa">
      <td style="padding:8px;border:1px solid #dee2e6;font-weight:bold">Total</td>
      <td style="padding:8px;border:1px solid #dee2e6;font-weight:bold;color:#0d6efd">
        $${total.toFixed(2)} USD
      </td>
    </tr>
  </table>

  ${attachmentLinks.length > 0 ? `
  <div style="margin:20px 0;padding:12px;background:#e7f3ff;border-radius:4px">
    <p style="margin:0 0 8px;font-weight:bold">Documentos adjuntos:</p>
    ${attachmentLinks.map(l => `<p style="margin:4px 0">${l}</p>`).join('')}
  </div>` : ''}

  <p style="font-size:12px;color:#6c757d;margin-top:24px;border-top:1px solid #dee2e6;padding-top:12px">
    Este correo fue generado automáticamente por el sistema de facturación electrónica de ${razonSocial}.
    Si tiene alguna pregunta, por favor contáctenos directamente.
  </p>

</body>
</html>`;

  // ── Adjuntos: el comprobante de verdad, no solo su enlace ───────────────────
  const numeroLimpio = fullNumber.replace(/[^0-9A-Za-z-]/g, '_');
  const adjuntos = [
    await fetchStorageAttachment(pdfUrl, `Factura_${numeroLimpio}.pdf`, 'application/pdf'),
    await fetchStorageAttachment(xmlUrl, `Factura_${numeroLimpio}.xml`, 'application/xml'),
  ].filter((a): a is NonNullable<typeof a> => a !== null);

  if (adjuntos.length < 2) {
    console.warn('[sendInvoiceEmail] Falta algún adjunto; se envía con los enlaces:', {
      invoiceId, adjuntos: adjuntos.length,
    });
  }

  // ── Send email ──────────────────────────────────────────────────────────────
  try {
    const transporter = await createSmtpTransporter(companyId);
    const from = await getSmtpFrom(companyId);
    await transporter.sendMail({
      from,
      to:      customerEmail,
      subject: `Factura ${fullNumber} autorizada — ${razonSocial}`,
      html,
      attachments: adjuntos,
    });
  } catch (err) {
    const motivo = err instanceof Error ? err.message : 'Error enviando el correo';
    await recordEmailResult(companyId, invoiceId, {
      sent: false, to: customerEmail, error: motivo,
    });
    throw err;
  }

  await recordEmailResult(companyId, invoiceId, { sent: true, to: customerEmail });
  console.log('[sendInvoiceEmail] Email enviado:', { invoiceId, to: customerEmail });
  return { sent: true, to: customerEmail };
}

// ─── Callable function ─────────────────────────────────────────────────────────

/**
 * sendInvoiceEmail
 *
 * Callable function to send the authorized invoice by email to the customer.
 * Requires: invoice must have sriStatus === 'authorized' and customerEmail set.
 *
 * Also called internally from onInvoiceEmit after successful authorization.
 */
export const sendInvoiceEmail = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Debe estar autenticado.');
  }

  const { invoiceId, companyId, to } = request.data as {
    invoiceId: string; companyId: string; to?: string;
  };

  if (!invoiceId || !companyId) {
    throw new HttpsError('invalid-argument', 'invoiceId y companyId son requeridos.');
  }

  const callerRole      = request.auth.token['role']      as string | undefined;
  const callerCompanyId = request.auth.token['companyId'] as string | undefined;

  if (callerRole !== 'super_admin' && callerCompanyId !== companyId) {
    throw new HttpsError('permission-denied', 'No tiene permisos para esta empresa.');
  }

  try {
    return await sendInvoiceEmailInternal(invoiceId, companyId, to);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error enviando email';
    console.error('[sendInvoiceEmail] Error:', err);
    throw new HttpsError('internal', msg);
  }
});
