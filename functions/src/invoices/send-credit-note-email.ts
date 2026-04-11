import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { createSmtpTransporter, getSmtpFrom } from '../utils/smtp-helper';

// ─── Internal send function ──────────────────────────────────────────────────

export async function sendCreditNoteEmailInternal(
  creditNoteId: string,
  companyId: string
): Promise<{ sent: boolean; to: string }> {
  const db = admin.firestore();

  console.log('[sendCreditNoteEmail] Inicio:', { creditNoteId, companyId });

  // ── Read credit note ────────────────────────────────────────────────────────
  const cnSnap = await db.doc(`companies/${companyId}/invoices/${creditNoteId}`).get();
  if (!cnSnap.exists) {
    throw new Error(`Nota de crédito no encontrada: ${creditNoteId}`);
  }
  const invoice = cnSnap.data() as Record<string, any>;

  // ── Validate state ──────────────────────────────────────────────────────────
  if (invoice['sriStatus'] !== 'authorized') {
    throw new Error('Solo se pueden enviar emails de notas de crédito autorizadas por el SRI.');
  }

  // ── Resolve customer email (personas first, then invoice snapshot) ──────────
  let customerEmail: string | undefined = invoice['customerEmail'];

  const customerId: string | undefined = invoice['customerId'];
  if (customerId) {
    try {
      const personaSnap = await db.doc(`personas/${customerId}`).get();
      if (personaSnap.exists) {
        const personaData = personaSnap.data() as Record<string, any>;
        const personaEmail: string | undefined = personaData['email'];
        if (personaEmail) {
          customerEmail = personaEmail;
          console.log('[sendCreditNoteEmail] Email resuelto desde personas:', personaEmail);
        }
      }
    } catch (err) {
      console.warn('[sendCreditNoteEmail] No se pudo leer personas/', customerId, ':', err);
    }
  }

  if (!customerEmail) {
    console.warn('[sendCreditNoteEmail] Nota de crédito sin email de cliente — omitiendo envío:', creditNoteId);
    return { sent: false, to: '' };
  }

  // ── Read company info ───────────────────────────────────────────────────────
  const companySnap = await db.doc(`companies/${companyId}`).get();
  const company     = companySnap.data() as Record<string, any> | undefined;
  const companyName: string = company?.['sri']?.['razonSocial'] ?? company?.['name'] ?? 'Su proveedor';

  // ── Build email data ────────────────────────────────────────────────────────
  const fullNumber: string        = invoice['fullNumber']               ?? creditNoteId;
  const total: number             = invoice['total']                    ?? 0;
  const authNumber: string        = invoice['authorizationNumber']      ?? '';
  const invoiceDate: string       = formatTimestamp(invoice['date']);
  const rectifiedNumber: string   = invoice['rectifiedInvoiceNumber']   ?? '—';
  const rectifiedDate: string     = formatTimestampOrString(invoice['rectifiedInvoiceDate']);
  const motivo: string            = invoice['creditNoteMotivo']         ?? '—';
  const xmlUrl: string | undefined = invoice['xmlUrl'];
  const pdfUrl: string | undefined = invoice['pdfUrl'];

  const attachmentLinks: string[] = [];
  if (pdfUrl) attachmentLinks.push(`<a href="${pdfUrl}" style="color:#1a4c94">Descargar PDF (RIDE)</a>`);
  if (xmlUrl) attachmentLinks.push(`<a href="${xmlUrl}" style="color:#1a4c94">Descargar XML</a>`);

  const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333">

  <div style="background:#eef2fa;border-left:4px solid #1a4c94;padding:16px;border-radius:4px;margin-bottom:20px">
    <h2 style="margin:0;color:#1a4c94;font-size:18px">Nota de Crédito Electrónica Autorizada</h2>
    <p style="margin:4px 0 0;color:#6c757d;font-size:13px">${companyName}</p>
  </div>

  <p>Estimado/a <strong>${invoice['customerName'] ?? 'cliente'}</strong>,</p>
  <p>Le informamos que su nota de crédito electrónica ha sido <strong>autorizada por el SRI</strong>.</p>

  <table style="width:100%;border-collapse:collapse;margin:16px 0">
    <tr style="background:#f8f9fa">
      <td style="padding:8px;border:1px solid #dee2e6;font-weight:bold;width:40%">N° Nota de Crédito</td>
      <td style="padding:8px;border:1px solid #dee2e6;font-family:monospace">${fullNumber}</td>
    </tr>
    <tr>
      <td style="padding:8px;border:1px solid #dee2e6;font-weight:bold">Fecha de emisión</td>
      <td style="padding:8px;border:1px solid #dee2e6">${invoiceDate}</td>
    </tr>
    <tr style="background:#f8f9fa">
      <td style="padding:8px;border:1px solid #dee2e6;font-weight:bold">Autorización SRI</td>
      <td style="padding:8px;border:1px solid #dee2e6;font-family:monospace;font-size:11px">${authNumber}</td>
    </tr>
    <tr>
      <td style="padding:8px;border:1px solid #dee2e6;font-weight:bold">Factura referenciada</td>
      <td style="padding:8px;border:1px solid #dee2e6;font-family:monospace">${rectifiedNumber}</td>
    </tr>
    <tr style="background:#f8f9fa">
      <td style="padding:8px;border:1px solid #dee2e6;font-weight:bold">Fecha factura original</td>
      <td style="padding:8px;border:1px solid #dee2e6">${rectifiedDate}</td>
    </tr>
    <tr>
      <td style="padding:8px;border:1px solid #dee2e6;font-weight:bold">Motivo</td>
      <td style="padding:8px;border:1px solid #dee2e6">${motivo}</td>
    </tr>
    <tr style="background:#eef2fa">
      <td style="padding:8px;border:1px solid #dee2e6;font-weight:bold">Valor Modificación</td>
      <td style="padding:8px;border:1px solid #dee2e6;font-weight:bold;color:#1a4c94">
        $${total.toFixed(2)} USD
      </td>
    </tr>
  </table>

  ${attachmentLinks.length > 0 ? `
  <div style="margin:20px 0;padding:12px;background:#eef2fa;border-radius:4px">
    <p style="margin:0 0 8px;font-weight:bold">Documentos disponibles:</p>
    ${attachmentLinks.map(l => `<p style="margin:4px 0">${l}</p>`).join('')}
  </div>` : ''}

  <p style="font-size:12px;color:#6c757d;margin-top:24px;border-top:1px solid #dee2e6;padding-top:12px">
    Este correo fue generado automáticamente por el sistema de facturación electrónica de ${companyName}.
    Si tiene alguna pregunta, por favor contáctenos directamente.
  </p>

</body>
</html>`;

  // ── Send email ──────────────────────────────────────────────────────────────
  const transporter = await createSmtpTransporter();
  const from        = await getSmtpFrom();

  await transporter.sendMail({
    from,
    to:      customerEmail,
    subject: `Nota de Crédito ${fullNumber} — ${companyName}`,
    html,
  });

  console.log('[sendCreditNoteEmail] Email enviado:', { creditNoteId, to: customerEmail });
  return { sent: true, to: customerEmail };
}

// ─── Formatting helpers ──────────────────────────────────────────────────────

function formatTimestamp(value: any): string {
  if (!value) return '—';
  if (typeof value.toDate === 'function') {
    return (value as admin.firestore.Timestamp).toDate().toLocaleDateString('es-EC', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  }
  return String(value);
}

function formatTimestampOrString(value: any): string {
  if (!value) return '—';
  if (typeof value === 'string') return value;
  return formatTimestamp(value);
}

// ─── Callable function ───────────────────────────────────────────────────────

/**
 * sendCreditNoteEmail
 *
 * Callable function to send the authorized credit note by email to the customer.
 * Requires: credit note must have sriStatus === 'authorized'.
 * Email is resolved from personas/{customerId} first, then from invoice.customerEmail.
 *
 * Also callable internally from the credit-note emit orchestrator.
 */
export const sendCreditNoteEmail = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Debe estar autenticado.');
  }

  const { creditNoteId, companyId } = request.data as { creditNoteId: string; companyId: string };

  if (!creditNoteId || typeof creditNoteId !== 'string') {
    throw new HttpsError('invalid-argument', 'creditNoteId es requerido.');
  }
  if (!companyId || typeof companyId !== 'string') {
    throw new HttpsError('invalid-argument', 'companyId es requerido.');
  }

  const callerRole      = request.auth.token['role']      as string | undefined;
  const callerCompanyId = request.auth.token['companyId'] as string | undefined;

  if (callerRole !== 'super_admin' && callerCompanyId !== companyId) {
    throw new HttpsError('permission-denied', 'No tiene permisos para esta empresa.');
  }

  try {
    return await sendCreditNoteEmailInternal(creditNoteId, companyId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error enviando email de nota de crédito';
    console.error('[sendCreditNoteEmail] Error:', err);
    throw new HttpsError('internal', msg);
  }
});
