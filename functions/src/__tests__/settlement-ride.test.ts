/**
 * settlement-ride.test.ts — RIDE y correo de la liquidación de compra (2026-11-05).
 * Datos inventados.
 */
import { writeFileSync } from 'fs';
import { buildSettlementPdf, SettlementPdfData } from '../purchases/settlement/generate-settlement-pdf';
import { escapeHtml } from '../purchases/settlement/send-settlement-email';

const data: SettlementPdfData = {
  fullNumber: '001-001-000000001',
  date: new Date('2026-11-05T17:00:00Z'),
  accessKey: '0511202603179000000000110010010000000011234567811',
  authorizationNumber: '0511202603179000000000110010010000000011234567811',
  authorizedAt: new Date('2026-11-05T17:01:00Z'),
  ambiente: 'PRUEBAS',
  supplierName: 'PROVEEDOR INVENTADO',
  supplierTaxId: '1710034065',
  supplierTaxIdType: '05',
  supplierAddress: 'Quito',
  lines: [
    { code: 'S1', description: 'Servicio de jardinería', qty: 1, unitCost: 100, discountAmount: 10, subtotal: 90, taxRate: 15 },
    { description: 'Maíz en grano', qty: 3, unitCost: 10.333, discountAmount: 0, subtotal: 31, taxRate: 0 },
  ],
  subtotal: 121,
  totalDiscount: 10,
  taxGroups: [{ vatRate: 15, base: 90, tax: 13.5 }, { vatRate: 0, base: 31, tax: 0 }],
  total: 134.5,
  paymentLabel: 'Sin utilización del sistema financiero',
  additionalInfo: [{ nombre: 'RUC Proveedor', valor: '0190434990001' }],
};
const issuer = { razonSocial: 'EMPRESA INVENTADA S.A.', ruc: '1790000000001', direccionMatriz: 'Calle Falsa 123', obligadoContabilidad: 'SI' };

describe('RIDE de la liquidación de compra', () => {
  it('genera un PDF', async () => {
    const pdf = await buildSettlementPdf({ data, issuer });
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    if (process.env.RIDE_SAMPLE) writeFileSync(process.env.RIDE_SAMPLE, pdf);
  });
  it('muchas líneas largas no rompen el PDF (salta de página)', async () => {
    const lines = Array.from({ length: 80 }, (_, i) => ({ ...data.lines[0], description: `Línea ${i} `.repeat(20) }));
    const pdf = await buildSettlementPdf({ data: { ...data, lines }, issuer });
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  });
  it('sin autorización, también sale', async () => {
    const pdf = await buildSettlementPdf({ data: { ...data, authorizationNumber: undefined, authorizedAt: undefined }, issuer });
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  });
});

describe('escapeHtml', () => {
  it('escapa lo que escribió una persona', () => {
    expect(escapeHtml('<b>Ana & "Luis"</b>')).toBe('&lt;b&gt;Ana &amp; &quot;Luis&quot;&lt;/b&gt;');
    expect(escapeHtml(undefined)).toBe('');
  });
});
