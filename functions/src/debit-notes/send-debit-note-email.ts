import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { createSmtpTransporter, resolveSender } from '../utils/smtp-helper';

// ─── Internal logic ───────────────────────────────────────────────────────────

export async function sendDebitNoteEmailInternal(
  debitNoteId: string,
  companyId: string
): Promise<{ sent: boolean; to: string }> {
  const db = admin.firestore();

  // 1. Read debit note
  const dnSnap = await db.doc(`companies/${companyId}/debitNotes/${debitNoteId}`).get();
  if (!dnSnap.exists) throw new Error(`Nota de débito no encontrada: ${debitNoteId}`);
  const dn = dnSnap.data() as Record<string, any>;

  if (dn['sriStatus'] !== 'authorized') {
    throw new Error('Solo se pueden enviar emails de notas de débito autorizadas por el SRI.');
  }

  // 2. Resolve customer email — look up from personas using customerId
  const customerId: string | undefined = dn['customerId'];
  let customerEmail: string | undefined;

  if (customerId) {
    const personaSnap = await db.doc(`companies/${companyId}/personas/${customerId}`).get();
    if (personaSnap.exists) {
      const persona = personaSnap.data() as Record<string, any>;
      customerEmail = persona['email'] ?? persona['primaryEmail'];
    }
  }

  // Fallback: email stored directly on the debit note
  if (!customerEmail) customerEmail = dn['customerEmail'];

  if (!customerEmail) {
    console.warn('[sendDebitNoteEmail] Cliente sin email registrado — omitiendo envío:', debitNoteId);
    return { sent: false, to: '' };
  }

  // 3. Company info
  const companySnap = await db.doc(`companies/${companyId}`).get();
  const companyData = companySnap.data() as Record<string, any> | undefined;
  const companyName: string = companyData?.['settings']?.['companyName'] ?? 'La empresa emisora';

  const sriCfgSnap = await db.doc(`companies/${companyId}/configuration/sri`).get();
  const sriCfg = sriCfgSnap.data() as Record<string, any> | undefined;
  const razonSocial: string = sriCfg?.['razonSocial'] ?? companyName;
  const companyRuc: string  = companyData?.['sri']?.['ruc'] ?? '';

  // 4. Build email
  const fullNumber: string          = dn['fullNumber']              ?? debitNoteId;
  const authNumber: string          = dn['authorizationNumber']     ?? '';
  const customerName: string        = dn['customerName']            ?? 'Cliente';
  const originalInvoiceNumber: string = dn['originalInvoiceNumber'] ?? '';
  const totalSinImpuestos: number   = dn['totalSinImpuestos']       ?? 0;
  const total: number               = dn['total']                   ?? 0;
  const xmlUrl: string | undefined  = dn['xmlUrl'];
  const pdfUrl: string | undefined  = dn['pdfUrl'];

  // Build motivos rows if present
  const motivos: Array<Record<string, any>> = dn['motivos'] ?? [];
  const motivosRows = motivos.map((m, i) => `
    <tr ${i % 2 === 0 ? 'style="background:#f8f9fa"' : ''}>
      <td style="padding:8px;border:1px solid #dee2e6">${m['razon'] ?? ''}</td>
      <td style="padding:8px;border:1px solid #dee2e6;text-align:right">$${(m['valor'] ?? 0).toFixed(2)}</td>
    </tr>`).join('');

  const links: string[] = [];
  if (pdfUrl) links.push(`<a href="${pdfUrl}" style="color:#c47a1a">Descargar PDF (RIDE)</a>`);
  if (xmlUrl) links.push(`<a href="${xmlUrl}" style="color:#c47a1a">Descargar XML</a>`);

  const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333">

  <div style="background:#fff8f0;border-left:4px solid #c47a1a;padding:16px;border-radius:4px;margin-bottom:20px">
    <h2 style="margin:0;color:#c47a1a;font-size:18px">Nota de Débito Electrónica Autorizada</h2>
    <p style="margin:4px 0 0;color:#6c757d;font-size:13px">${razonSocial} — RUC: ${companyRuc}</p>
  </div>

  <p>Estimado/a <strong>${customerName}</strong>,</p>
  <p>Le comunicamos que se ha emitido una <strong>Nota de Débito Electrónica</strong>
     que ha sido <strong>autorizada por el SRI</strong>.</p>

  <table style="width:100%;border-collapse:collapse;margin:16px 0">
    <tr style="background:#f8f9fa">
      <td style="padding:8px;border:1px solid #dee2e6;font-weight:bold;width:45%">Número Nota de Débito</td>
      <td style="padding:8px;border:1px solid #dee2e6;font-family:monospace">${fullNumber}</td>
    </tr>
    <tr>
      <td style="padding:8px;border:1px solid #dee2e6;font-weight:bold">Factura de Referencia</td>
      <td style="padding:8px;border:1px solid #dee2e6">${originalInvoiceNumber}</td>
    </tr>
    <tr style="background:#f8f9fa">
      <td style="padding:8px;border:1px solid #dee2e6;font-weight:bold">Autorización SRI</td>
      <td style="padding:8px;border:1px solid #dee2e6;font-family:monospace;font-size:11px">${authNumber}</td>
    </tr>
    <tr>
      <td style="padding:8px;border:1px solid #dee2e6;font-weight:bold">Subtotal sin IVA</td>
      <td style="padding:8px;border:1px solid #dee2e6">$${totalSinImpuestos.toFixed(2)} USD</td>
    </tr>
    <tr style="background:#f8f9fa">
      <td style="padding:8px;border:1px solid #dee2e6;font-weight:bold">Total</td>
      <td style="padding:8px;border:1px solid #dee2e6;font-weight:bold;color:#c47a1a">
        $${total.toFixed(2)} USD
      </td>
    </tr>
  </table>

  ${motivos.length > 0 ? `
  <h3 style="font-size:14px;margin-bottom:8px">Motivos</h3>
  <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
    <thead>
      <tr style="background:#c47a1a;color:#fff">
        <th style="padding:8px;border:1px solid #b06a10;text-align:left">Razón</th>
        <th style="padding:8px;border:1px solid #b06a10;text-align:right">Valor</th>
      </tr>
    </thead>
    <tbody>${motivosRows}</tbody>
  </table>` : ''}

  ${links.length > 0 ? `
  <div style="margin:20px 0;padding:12px;background:#fff8f0;border-radius:4px;border:1px solid #f0d9b5">
    <p style="margin:0 0 8px;font-weight:bold">Documentos del comprobante:</p>
    ${links.map(l => `<p style="margin:4px 0">${l}</p>`).join('')}
  </div>` : ''}

  <p style="font-size:12px;color:#6c757d;margin-top:24px;border-top:1px solid #dee2e6;padding-top:12px">
    Este correo fue generado automáticamente por el sistema de facturación electrónica de ${razonSocial}.
    Si tiene alguna pregunta, contáctenos directamente.
  </p>

</body>
</html>`;

  // 5. Send
  const transporter = await createSmtpTransporter(companyId);
  const remitente = await resolveSender(companyId, {
    razonSocial,
    replyTo: companyData?.['email'],
  });
  await transporter.sendMail({
    ...remitente,
    to:      customerEmail,
    subject: `Nota de Débito ${fullNumber} autorizada — ${razonSocial}`,
    html,
  });

  console.log('[sendDebitNoteEmail] Email enviado:', { debitNoteId, to: customerEmail });
  return { sent: true, to: customerEmail };
}

// ─── Callable ─────────────────────────────────────────────────────────────────

export const sendDebitNoteEmail = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Debe estar autenticado.');

  const { debitNoteId, companyId } = request.data as { debitNoteId: string; companyId: string };
  if (!debitNoteId || !companyId) {
    throw new HttpsError('invalid-argument', 'debitNoteId y companyId son requeridos.');
  }

  const callerRole      = request.auth.token['role']      as string | undefined;
  const callerCompanyId = request.auth.token['companyId'] as string | undefined;
  if (callerRole !== 'super_admin' && callerCompanyId !== companyId) {
    throw new HttpsError('permission-denied', 'Sin permisos para esta empresa.');
  }

  try {
    return await sendDebitNoteEmailInternal(debitNoteId, companyId);
  } catch (err) {
    console.error('[sendDebitNoteEmail] Error:', err);
    throw new HttpsError('internal', err instanceof Error ? err.message : 'Error enviando email');
  }
});
