/**
 * Envío de los roles por correo (PLAN_NOMINA.md §5.5, D-N4, E3).
 *
 * Lo dispara una persona, nunca la aprobación. El correo va a
 * `payrollEmployees.email` (no al de la persona) y su cuerpo NO lleva cifras:
 * todo va en el PDF adjunto, como buffer. Deja constancia en cada rol
 * (emailSent, emailTo, emailSentAt, emailError). Un fallo no detiene a los demás.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { createSmtpTransporter, resolveSender } from '../utils/smtp-helper';
import { loadCompanyLogo } from '../utils/company-logo';
import { escapeHtml } from '../purchases/settlement/send-settlement-email';
import { fail, readCompanyId, readId, requirePayrollModule, requirePayrollRole } from './payroll-auth';
import { buildPayslipPdf, companyHeader, payslipFileName, periodName } from './payroll-pdf';

/**
 * Entrada: {companyId, runId, payslipIds?, resend?}. Sin payslipIds, todos; los ya enviados se saltan salvo
 * resend: true. Devuelve {sent, failed, skipped (sin correo), alreadySent}.
 */
export const sendPayslipEmails = onCall({ timeoutSeconds: 300 }, async (request) => {
  const data = request.data ?? {};
  const companyId = readCompanyId(data);
  requirePayrollRole(request, companyId);
  const db = admin.firestore();
  const company = await requirePayrollModule(db, companyId);
  const run = readId(data, 'runId', 'la nómina');
  const base = `companies/${companyId}`;
  const runSnap = await db.doc(`${base}/payrollRuns/${run}`).get();
  if (!runSnap.exists) throw new HttpsError('not-found', 'La nómina no existe.');
  if (runSnap.get('status') !== 'approved') fail('Solo se envían los roles de una nómina aprobada.');

  const pedidos: string[] = Array.isArray(data.payslipIds) ? data.payslipIds.filter((x: unknown) => typeof x === 'string') : [];
  const all = await db.collection(`${base}/payslips`).where('runId', '==', run).get();
  // Un reintento (o un tope de tiempo) no duplica: los ya enviados se saltan,
  // salvo que se pida reenviar.
  const resend = data.resend === true;
  const elegidos = pedidos.length ? all.docs.filter((d) => pedidos.includes(d.id)) : all.docs;
  const slips = resend ? elegidos : elegidos.filter((d) => d.get('emailSent') !== true);
  if (!elegidos.length) fail('No hay roles que enviar.');
  if (!slips.length) return { sent: 0, failed: 0, skipped: 0, alreadySent: elegidos.length };

  // El correo de cada empleado, de su ficha de nómina.
  const empRefs = slips.map((s) => db.doc(`${base}/payrollEmployees/${s.get('employeeId')}`));
  const emps = await db.getAll(...empRefs);
  const emailOf = new Map(emps.map((e) => [e.id, String(e.get('email') ?? '').trim()]));

  const [header, logo] = await Promise.all([companyHeader(db, companyId, company), loadCompanyLogo(companyId, company, 'payslip-email')]);
  const transporter = await createSmtpTransporter(companyId);
  const sender = await resolveSender(companyId, { razonSocial: header.razonSocial, replyTo: company?.email });

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  for (const s of slips) {
    const slip = s.data();
    const to = emailOf.get(String(slip.employeeId)) ?? '';
    const now = admin.firestore.Timestamp.now();
    if (!to) {
      skipped += 1;
      await s.ref.update({ emailSent: false, emailTo: '', emailError: 'El empleado no tiene correo en su ficha de nómina.', updatedAt: now });
      continue;
    }
    try {
      const pdf = await buildPayslipPdf(slip, header, logo);
      const mes = periodName(String(slip.period));
      await transporter.sendMail({
        ...sender,
        to,
        // Asunto y cuerpo sin montos (§5.5).
        subject: `Rol de pago de ${mes} — ${header.razonSocial}`,
        html: `<p>Hola ${escapeHtml(slip.employee?.name ?? '')}:</p>
<p>Adjuntamos tu rol de pago de ${escapeHtml(mes)}.</p>
<p style="color:#6c757d;font-size:12px">Correo enviado por ${escapeHtml(header.razonSocial)}. Si tienes preguntas sobre tu rol, contesta a este correo.</p>`,
        attachments: [{ filename: payslipFileName(String(slip.period), String(slip.employee?.taxId ?? '')), content: pdf, contentType: 'application/pdf' }],
      });
      sent += 1;
      await s.ref.update({ emailSent: true, emailTo: to, emailSentAt: now, emailError: admin.firestore.FieldValue.delete(), updatedAt: now });
    } catch (err) {
      failed += 1;
      // Solo el código: el mensaje del servidor SMTP suele traer la dirección del destinatario.
      console.error('[sendPayslipEmails] Falló un envío:', { companyId, payslip: s.id, code: (err as any)?.code ?? 'unknown' });
      await s.ref.update({ emailSent: false, emailTo: to, emailError: String((err as Error)?.message ?? err).slice(0, 300), updatedAt: now });
    }
  }
  return { sent, failed, skipped, alreadySent: elegidos.length - slips.length };
});
