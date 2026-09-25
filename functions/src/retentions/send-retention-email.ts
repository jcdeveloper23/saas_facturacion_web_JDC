import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { createSmtpTransporter, getSmtpFrom } from '../utils/smtp-helper';

// ─── Internal logic ───────────────────────────────────────────────────────────

export async function sendRetentionEmailInternal(
  retentionId: string,
  companyId: string
): Promise<{ sent: boolean; to: string }> {
  const db = admin.firestore();

  // 1. Read retention
  const retSnap = await db.doc(`companies/${companyId}/retentions/${retentionId}`).get();
  if (!retSnap.exists) throw new Error(`Retención no encontrada: ${retentionId}`);
  const retention = retSnap.data() as Record<string, any>;

  if (retention['sriStatus'] !== 'authorized') {
    throw new Error('Solo se pueden enviar emails de retenciones autorizadas por el SRI.');
  }

  // 2. Find supplier email — look up from personas collection using supplierId
  const supplierId: string | undefined = retention['supplierId'];
  let supplierEmail: string | undefined;

  if (supplierId) {
    const personaSnap = await db.doc(`companies/${companyId}/personas/${supplierId}`).get();
    if (personaSnap.exists) {
      const persona = personaSnap.data() as Record<string, any>;
      supplierEmail = persona['email'] ?? persona['primaryEmail'];
    }
  }

  // Fallback: check if retention itself stores the email
  if (!supplierEmail) supplierEmail = retention['supplierEmail'];

  if (!supplierEmail) {
    console.warn('[sendRetentionEmail] Proveedor sin email registrado — omitiendo envío:', retentionId);
    return { sent: false, to: '' };
  }

  // 3. Read company info for sender name
  const companySnap = await db.doc(`companies/${companyId}`).get();
  const companyData = companySnap.data() as Record<string, any> | undefined;
  const companyName: string = companyData?.['settings']?.['companyName'] ?? 'La empresa retenedora';

  const sriCfgSnap = await db.doc(`companies/${companyId}/configuration/sri`).get();
  const sriCfg = sriCfgSnap.data() as Record<string, any> | undefined;
  const razonSocial: string = sriCfg?.['razonSocial'] ?? companyName;
  const companyRuc: string  = companyData?.['sri']?.['ruc'] ?? '';

  // 4. Build email content
  const fullNumber: string     = retention['fullNumber']          ?? retentionId;
  const authNumber: string     = retention['authorizationNumber'] ?? '';
  const totalRetained: number  = retention['totalRetained']       ?? 0;
  const supplierName: string   = retention['supplierName']        ?? 'Proveedor';
  const periodoFiscal: string  = retention['periodoFiscal']       ?? '';
  const xmlUrl: string | undefined = retention['xmlUrl'];
  const pdfUrl: string | undefined = retention['pdfUrl'];

  const links: string[] = [];
  if (pdfUrl) links.push(`<a href="${pdfUrl}" style="color:#0d6efd">Descargar PDF (RIDE)</a>`);
  if (xmlUrl) links.push(`<a href="${xmlUrl}" style="color:#0d6efd">Descargar XML</a>`);

  const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333">

  <div style="background:#f8f9fa;border-left:4px solid #0d6efd;padding:16px;border-radius:4px;margin-bottom:20px">
    <h2 style="margin:0;color:#0d6efd;font-size:18px">Comprobante de Retención Autorizado</h2>
    <p style="margin:4px 0 0;color:#6c757d;font-size:13px">${razonSocial} — RUC: ${companyRuc}</p>
  </div>

  <p>Estimado/a <strong>${supplierName}</strong>,</p>
  <p>Le comunicamos que se ha emitido un <strong>Comprobante de Retención Electrónico</strong>
     que ha sido <strong>autorizado por el SRI</strong>.</p>

  <table style="width:100%;border-collapse:collapse;margin:16px 0">
    <tr style="background:#f8f9fa">
      <td style="padding:8px;border:1px solid #dee2e6;font-weight:bold;width:45%">Número</td>
      <td style="padding:8px;border:1px solid #dee2e6;font-family:monospace">${fullNumber}</td>
    </tr>
    <tr>
      <td style="padding:8px;border:1px solid #dee2e6;font-weight:bold">Período Fiscal</td>
      <td style="padding:8px;border:1px solid #dee2e6">${periodoFiscal}</td>
    </tr>
    <tr style="background:#f8f9fa">
      <td style="padding:8px;border:1px solid #dee2e6;font-weight:bold">Autorización SRI</td>
      <td style="padding:8px;border:1px solid #dee2e6;font-family:monospace;font-size:11px">${authNumber}</td>
    </tr>
    <tr>
      <td style="padding:8px;border:1px solid #dee2e6;font-weight:bold">Total Retenido</td>
      <td style="padding:8px;border:1px solid #dee2e6;font-weight:bold;color:#dc3545">
        $${totalRetained.toFixed(2)} USD
      </td>
    </tr>
  </table>

  ${links.length > 0 ? `
  <div style="margin:20px 0;padding:12px;background:#e7f3ff;border-radius:4px">
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
  const from = await getSmtpFrom(companyId);
  await transporter.sendMail({
    from,
    to:      supplierEmail,
    subject: `Comprobante de Retención ${fullNumber} autorizado — ${razonSocial}`,
    html,
  });

  console.log('[sendRetentionEmail] Email enviado:', { retentionId, to: supplierEmail });
  return { sent: true, to: supplierEmail };
}

// ─── Callable ─────────────────────────────────────────────────────────────────

export const sendRetentionEmail = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Debe estar autenticado.');

  const { retentionId, companyId } = request.data as { retentionId: string; companyId: string };
  if (!retentionId || !companyId) {
    throw new HttpsError('invalid-argument', 'retentionId y companyId son requeridos.');
  }

  const callerRole      = request.auth.token['role']      as string | undefined;
  const callerCompanyId = request.auth.token['companyId'] as string | undefined;
  if (callerRole !== 'super_admin' && callerCompanyId !== companyId) {
    throw new HttpsError('permission-denied', 'Sin permisos para esta empresa.');
  }

  try {
    return await sendRetentionEmailInternal(retentionId, companyId);
  } catch (err) {
    console.error('[sendRetentionEmail] Error:', err);
    throw new HttpsError('internal', err instanceof Error ? err.message : 'Error enviando email');
  }
});
