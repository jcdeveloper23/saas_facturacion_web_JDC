import * as admin from 'firebase-admin';
import { writeFileSync } from 'fs';
import { buildPdfBuffer } from '../invoices/generate-pdf';

// El RIDE de la factura imprime las observaciones (`notes`); antes no salían.
const ts = admin.firestore.Timestamp.fromDate(new Date('2026-10-16T15:00:00Z'));
const base = {
  number: 12, fullNumber: '001-001-000000012', date: ts, status: 'issued',
  customerName: 'CLIENTE DE PRUEBA', customerTaxId: '0102030405', total: 11.5, netAmount: 10,
  lines: [{ description: 'Servicio', quantity: 1, unitPrice: 10, vatPct: 15, subtotal: 10, vatAmount: 1.5 }],
  vatSummary: [{ vatPct: 15, taxableBase: 10, vatAmount: 1.5 }],
};
const sriConfig = {
  razonSocial: 'EMPRESA DE PRUEBA', direccionMatriz: 'Cuenca', direccionEstablecimiento: 'Cuenca',
  obligadoContabilidad: 'NO', additionalInfoFields: [{ nombre: 'Email', valor: 'a@b.com' }],
};
const build = (invoice: any) => buildPdfBuffer({
  invoice, companyId: 'c1', companyRuc: '0102030405001', sriEnvironment: 'testing',
  sriConfig, barcodeBuffer: null, logoBuffer: null,
} as any);

describe('RIDE de factura: observaciones', () => {
  it('genera el PDF con y sin observaciones', async () => {
    const sin = await build(base);
    const con = await build({ ...base, notes: 'Entregar en bodega 3.\nPago contra entrega, cheque a nombre de la empresa.' });
    expect(sin.subarray(0, 4).toString()).toBe('%PDF');
    expect(con.length).toBeGreaterThan(sin.length);
    if (process.env.RIDE_SAMPLE) writeFileSync(process.env.RIDE_SAMPLE, con);
  });

  it('observaciones muy largas no rompen el PDF', async () => {
    const pdf = await build({ ...base, notes: 'x '.repeat(5000) });
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  });
});
