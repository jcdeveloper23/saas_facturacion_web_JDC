/**
 * El rol de pago en PDF (PLAN_NOMINA.md §5.5, E3).
 *
 * ⛔ Sin makePublic() y sin URL: getPayslipPdf devuelve los bytes en base64 y
 * sendPayslipEmails los adjunta como buffer. Nadie obtiene un enlace
 * reutilizable. Se lee SOLO de `payslips` (la copia congelada al aprobar).
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import PDFDocument from 'pdfkit';
import { drawLogo, loadCompanyLogo } from '../utils/company-logo';
import { fail, readCompanyId, readId, requirePayrollModule, requirePayrollRole } from './payroll-auth';

export interface CompanyHeader { razonSocial: string; ruc: string }

const money = (cents: number) =>
  `$ ${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre',
  'octubre', 'noviembre', 'diciembre'];
export const periodName = (period: string) => {
  const [y, m] = period.split('-');
  return `${MONTHS[Number(m) - 1] ?? m} de ${y}`;
};

/** Nombre del archivo: rol-2026-11-0102030405.pdf (sin nombres ni montos). */
export const payslipFileName = (period: string, taxId: string) =>
  `rol-${period}-${String(taxId || 'empleado').replace(/[^0-9A-Za-z]/g, '')}.pdf`;

/** Arma el PDF del rol. Rótulos de MDT-2015-0087 (vienen en las líneas). */
export function buildPayslipPdf(slip: Record<string, any>, company: CompanyHeader, logo: Buffer | null): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Title: `Rol de pago ${slip.period}` } });
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = 40;
    const width = doc.page.width - 80;
    const logoH = drawLogo(doc as any, logo, left, 40, 110, 50);
    doc.font('Helvetica-Bold').fontSize(13).text(company.razonSocial, left + (logoH ? 125 : 0), 42, { width: width - 125 });
    doc.font('Helvetica').fontSize(9).text(company.ruc ? `RUC ${company.ruc}` : '', { width: width - 125 });
    doc.y = Math.max(doc.y, 40 + logoH) + 14;

    doc.font('Helvetica-Bold').fontSize(12).text(`ROL DE PAGO — ${periodName(String(slip.period)).toUpperCase()}`, left, doc.y, { width, align: 'center' });
    if (slip.status === 'reversed') {
      // Se puede consultar, pero no vale como rol: la nómina se reversó.
      doc.moveDown(0.3).fillColor('#c0392b').fontSize(11)
        .text('REVERSADO — SIN VALIDEZ. Esta nómina fue reversada; vale la versión emitida después.', left, doc.y, { width, align: 'center' })
        .fillColor('#000');
    }
    doc.moveDown(0.8);
    const e = slip.employee ?? {};
    doc.font('Helvetica').fontSize(9);
    const row = (k: string, v: string) => doc.text(`${k}: `, { continued: true }).font('Helvetica-Bold').text(v).font('Helvetica');
    row('Empleado', String(e.name ?? ''));
    row('Cédula', String(e.taxId ?? ''));
    if (e.position) row('Cargo', String(e.position));
    if (e.iessNumber) row('Afiliación IESS', String(e.iessNumber));
    row('Días trabajados', String(slip.workedDays ?? ''));
    doc.moveDown(0.8);

    const section = (title: string, lines: any[], sign = 1) => {
      doc.font('Helvetica-Bold').fontSize(10).text(title, left, doc.y, { width });
      doc.moveTo(left, doc.y + 2).lineTo(left + width, doc.y + 2).strokeColor('#999').stroke();
      doc.moveDown(0.4).font('Helvetica').fontSize(9);
      let total = 0;
      for (const l of lines) {
        const y = doc.y;
        const qty = typeof l.qty === 'number' ? ` (${String(l.qty).replace('.', ',')})` : '';
        doc.text(`${l.label ?? l.concept}${qty}`, left, y, { width: width - 110 });
        doc.text(money(sign * Number(l.amountCents ?? 0)), left + width - 110, y, { width: 110, align: 'right' });
        total += Number(l.amountCents ?? 0);
      }
      doc.moveDown(0.3);
      return total;
    };
    const ing = section('INGRESOS', slip.earnings ?? []);
    const y1 = doc.y;
    doc.font('Helvetica-Bold').text('Total ingresos', left, y1).text(money(ing), left + width - 110, y1, { width: 110, align: 'right' });
    doc.moveDown(0.8);
    const des = section('DESCUENTOS', slip.deductions ?? [], -1);
    const y2 = doc.y;
    doc.font('Helvetica-Bold').text('Total descuentos', left, y2).text(money(-des), left + width - 110, y2, { width: 110, align: 'right' });
    doc.moveDown(1);
    const y3 = doc.y;
    doc.fontSize(12).text('NETO A RECIBIR', left, y3).text(money(Number(slip.netCents ?? 0)), left + width - 150, y3, { width: 150, align: 'right' });
    doc.moveDown(1.2);

    // Lo que paga el empleador y lo provisionado: informativo, no suma al neto.
    doc.font('Helvetica').fontSize(8).fillColor('#555');
    const info = [...(slip.employerCosts ?? []), ...(slip.provisions ?? [])]
      .map((l: any) => `${l.label ?? l.concept}: ${money(Number(l.amountCents ?? 0))}`).join(' · ');
    if (info) doc.text(`Informativo (no suma al neto): ${info}`, left, doc.y, { width });
    doc.fillColor('#000');

    doc.y = Math.max(doc.y + 60, doc.page.height - 160);
    const firmaY = doc.y;
    doc.moveTo(left + 20, firmaY).lineTo(left + 220, firmaY).stroke();
    doc.moveTo(left + width - 220, firmaY).lineTo(left + width - 20, firmaY).stroke();
    doc.fontSize(9).text('Empleador', left + 20, firmaY + 4, { width: 200, align: 'center' });
    doc.text('Recibí conforme', left + width - 220, firmaY + 4, { width: 200, align: 'center' });
    doc.end();
  });
}

export async function companyHeader(db: admin.firestore.Firestore, companyId: string, company: Record<string, any>): Promise<CompanyHeader> {
  const sri = (await db.doc(`companies/${companyId}/configuration/sri`).get()).data() ?? {};
  return {
    razonSocial: String(sri['razonSocial'] ?? company?.settings?.companyName ?? company?.name ?? ''),
    ruc: String(company?.sri?.ruc ?? sri['ruc'] ?? ''),
  };
}

/** El PDF de un rol aprobado (o reversado, para consulta). Entrada: {companyId, payslipId}. */
export const getPayslipPdf = onCall(async (request) => {
  const data = request.data ?? {};
  const companyId = readCompanyId(data);
  requirePayrollRole(request, companyId);
  const db = admin.firestore();
  const company = await requirePayrollModule(db, companyId);
  const id = readId(data, 'payslipId', 'el rol');
  const snap = await db.doc(`companies/${companyId}/payslips/${id}`).get();
  if (!snap.exists) throw new HttpsError('not-found', 'El rol no existe.');
  const slip = snap.data() as Record<string, any>;
  if (slip.status === 'draft') fail('La nómina está en borrador: el rol todavía no tiene PDF válido.');
  const [header, logo] = await Promise.all([companyHeader(db, companyId, company), loadCompanyLogo(companyId, company, 'payslip-pdf')]);
  const pdf = await buildPayslipPdf(slip, header, logo);
  return { base64: pdf.toString('base64'), fileName: payslipFileName(String(slip.period), String(slip.employee?.taxId ?? '')) };
});
