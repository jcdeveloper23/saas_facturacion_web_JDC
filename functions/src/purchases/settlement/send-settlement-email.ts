// ─── Correo de la liquidación de compra al proveedor ─────────────────────────
//
// 2026-11-05. Solo autorizada y solo si el proveedor tiene correo (en la
// liquidación o en su ficha de personas). Adjunta el RIDE y el XML firmado
// (utils/email-attachments.ts) y deja constancia en la compra (emailSent…).

import * as admin from 'firebase-admin';
import { createSmtpTransporter, resolveSender } from '../../utils/smtp-helper';
import { EmailAttachment, fetchStorageAttachment } from '../../utils/email-attachments';

/** Para el HTML: el nombre del proveedor lo escribió una persona. */
export function escapeHtml(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!
  ));
}

async function recordResult(ref: admin.firestore.DocumentReference, r: { sent: boolean; to?: string; error?: string }) {
  try {
    await ref.update({
      emailSent: r.sent,
      emailTo: r.to ?? '',
      emailSentAt: r.sent ? admin.firestore.Timestamp.now() : admin.firestore.FieldValue.delete(),
      emailError: r.error ?? admin.firestore.FieldValue.delete(),
    });
  } catch (err) {
    console.error('[sendSettlementEmail] No se pudo anotar el envío:', err);
  }
}

export async function sendSettlementEmailInternal(purchaseId: string, companyId: string): Promise<{ sent: boolean; to: string }> {
  const db = admin.firestore();
  const ref = db.doc(`companies/${companyId}/purchases/${purchaseId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new Error(`Liquidación no encontrada: ${purchaseId}`);
  const p = snap.data() as Record<string, any>;
  if (p['issuedByCompany'] !== true) throw new Error('La compra no es una liquidación emitida por la empresa.');
  if (p['sriStatus'] !== 'authorized') throw new Error('Solo se envía una liquidación autorizada por el SRI.');

  let to: string = String(p['supplierEmail'] ?? '').trim();
  if (!to && p['supplierId']) {
    const persona = (await db.doc(`companies/${companyId}/personas/${p['supplierId']}`).get()).data();
    to = String(persona?.['email'] ?? persona?.['primaryEmail'] ?? '').trim();
  }
  if (!to) {
    console.log('[sendSettlementEmail] Proveedor sin correo — no se envía:', purchaseId);
    await recordResult(ref, { sent: false, error: 'El proveedor no tiene correo.' });
    return { sent: false, to: '' };
  }

  const company = (await db.doc(`companies/${companyId}`).get()).data() as Record<string, any> | undefined;
  const sriCfg = (await db.doc(`companies/${companyId}/configuration/sri`).get()).data() as Record<string, any> | undefined;
  const razonSocial: string = sriCfg?.['razonSocial'] ?? company?.['settings']?.['companyName'] ?? 'La empresa';
  const ruc: string = company?.['sri']?.['ruc'] ?? '';
  const fullNumber: string = p['settlement']?.['fullNumber'] ?? p['supplierInvoiceNumber'] ?? purchaseId;
  const total = Number(p['subtotal'] ?? 0) + Number(p['totalTax'] ?? 0);

  const row = (label: string, value: string, shade: boolean) => `
    <tr${shade ? ' style="background:#f8f9fa"' : ''}>
      <td style="padding:8px;border:1px solid #dee2e6;font-weight:bold;width:45%">${label}</td>
      <td style="padding:8px;border:1px solid #dee2e6">${value}</td>
    </tr>`;

  const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333">
  <div style="background:#eef6f1;border-left:4px solid #2f6f4f;padding:16px;border-radius:4px;margin-bottom:20px">
    <h2 style="margin:0;color:#2f6f4f;font-size:18px">Liquidación de compra electrónica autorizada</h2>
    <p style="margin:4px 0 0;color:#6c757d;font-size:13px">${escapeHtml(razonSocial)} — RUC: ${escapeHtml(ruc)}</p>
  </div>
  <p>Estimado/a <strong>${escapeHtml(p['supplierName'])}</strong>,</p>
  <p>Le enviamos la <strong>liquidación de compra de bienes y prestación de servicios</strong>
     que emitimos por su venta o servicio, <strong>autorizada por el SRI</strong>. Va adjunta en PDF y XML.</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0">
    ${row('Número', `<span style="font-family:monospace">${escapeHtml(fullNumber)}</span>`, true)}
    ${row('Autorización SRI', `<span style="font-family:monospace;font-size:11px">${escapeHtml(p['authorizationNumber'])}</span>`, false)}
    ${row('Total', `<strong>$${total.toFixed(2)} USD</strong>`, true)}
  </table>
  <p style="font-size:12px;color:#6c757d;margin-top:24px;border-top:1px solid #dee2e6;padding-top:12px">
    Correo generado automáticamente por el sistema de facturación electrónica de ${escapeHtml(razonSocial)}.
  </p>
</body></html>`;

  const attachments = (await Promise.all([
    fetchStorageAttachment(p['pdfUrl'], `liquidacion-${fullNumber}.pdf`, 'application/pdf'),
    fetchStorageAttachment(p['xmlUrl'], `liquidacion-${fullNumber}.xml`, 'application/xml'),
  ])).filter((a): a is EmailAttachment => a !== null);

  try {
    const transporter = await createSmtpTransporter(companyId);
    const sender = await resolveSender(companyId, { razonSocial, replyTo: company?.['email'] });
    await transporter.sendMail({
      ...sender,
      to,
      subject: `Liquidación de compra ${fullNumber} autorizada — ${razonSocial}`,
      html,
      attachments,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await recordResult(ref, { sent: false, to, error: msg });
    throw err;
  }
  await recordResult(ref, { sent: true, to });
  console.log('[sendSettlementEmail] Enviado:', { purchaseId, to });
  return { sent: true, to };
}
