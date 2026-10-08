import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import JSZip from 'jszip';
import { requireCompanyRole } from '../../utils/callable-auth';
import { atsPeriod, buildAts, AtsExcelData, AtsSummary, RawDoc } from './ats-builder';

export type { AtsCompraRow, AtsVentaRow, AtsVentaEstabRow, AtsAnuladoRow, AtsExcelData, AtsSummary } from './ats-builder';

// ─── Callable generateAts ─────────────────────────────────────────────────────
//
// Lee de Firestore lo del periodo y le pasa todo al constructor puro
// (ats-builder.ts), que arma el XML según la ficha técnica 2025 y el XSD
// oficial (ats.xsd). Aquí solo hay lecturas, permisos y el .zip.
//
// La firma y la salida son las de siempre (la web las usa en
// src/app/features/accounting/services/ats.service.ts): { zip, filename,
// excelData? }. Se suman `summary` y `warnings`, que la web ignora y Conecta
// muestra.

interface GenerateAtsInput {
  companyId: string;
  year:      number;
  month:     number; // 1-12 (mensual) — para semestral: 6=S1, 12=S2
  semestre?: 1 | 2; // undefined = mensual; 1 = Enero-Junio, 2 = Julio-Diciembre
  excluirInformativa332?: boolean; // sin la línea informativa 332 en las compras sin retención de renta
  includeExcelData?: boolean;      // cuando true, incluye AtsExcelData en el resultado
}

interface GenerateAtsResult {
  zip:        string; // base64
  filename:   string;
  excelData?: AtsExcelData; // presente cuando includeExcelData=true
  summary:    AtsSummary;
  warnings:   string[];
}

export const generateAts = onCall<GenerateAtsInput>(
  { timeoutSeconds: 120, memory: '512MiB' },
  async (request) => {
    const { companyId, year, month, semestre, excluirInformativa332, includeExcelData } = request.data;

    if (!companyId || !year || !month || month < 1 || month > 12) {
      throw new HttpsError('invalid-argument', 'companyId, year y month (1-12) son requeridos');
    }
    if (semestre !== undefined && semestre !== 1 && semestre !== 2) {
      throw new HttpsError('invalid-argument', 'semestre debe ser 1 (Enero-Junio) o 2 (Julio-Diciembre)');
    }

    // Mismo criterio de acceso que generateAccountingPdf — el ATS expone RUC,
    // razón social y el detalle completo de compras/ventas del periodo.
    requireCompanyRole(request, companyId, ['admin', 'accountant']);

    const db = admin.firestore();
    const companySnap = await db.doc(`companies/${companyId}`).get();
    const company     = companySnap.data() as Record<string, any> | undefined;
    const companyName = String(company?.['name'] ?? company?.['businessName'] ?? '');
    const companyRuc  = String(company?.['taxId'] ?? company?.['ruc'] ?? '').trim();

    if (!/^\d{10}001$/.test(companyRuc)) {
      // IdInformante exige el RUC matriz (termina en 001, ficha p. 5).
      throw new HttpsError(
        'failed-precondition',
        'El RUC de la empresa no tiene el formato de RUC matriz (10 dígitos + 001). Verifique el RUC en la configuración de la empresa antes de generar el ATS.'
      );
    }

    // Periodo en días de Ecuador (UTC−5): 00:00 en Quito = 05:00 UTC.
    const period  = atsPeriod(year, month, semestre);
    const tsStart = admin.firestore.Timestamp.fromDate(period.start);
    const tsEnd   = admin.firestore.Timestamp.fromDate(period.end);

    const col = (name: string) => db.collection(`companies/${companyId}/${name}`);
    const byDate = (name: string) => col(name).where('date', '>=', tsStart).where('date', '<', tsEnd).get();
    const byVoid = (name: string) => col(name).where('voidedAt', '>=', tsStart).where('voidedAt', '<', tsEnd).get();

    const [
      invoicesSnap, debitNotesSnap, purchasesSnap,
      voidedInvoicesSnap, voidedDebitNotesSnap, voidedRetentionsSnap,
      establishmentsSnap,
    ] = await Promise.all([
      byDate('invoices'), byDate('debitNotes'), byDate('purchases'),
      byVoid('invoices'), byVoid('debitNotes'), byVoid('retentions'),
      col('establishments').get(),
    ]);

    const data = (s: admin.firestore.QuerySnapshot) => s.docs.map((d) => d.data() as RawDoc);
    const purchases: RawDoc[] = purchasesSnap.docs.map((d) => ({ id: d.id, ...(d.data() as RawDoc) }));

    // Retenciones ligadas a las compras del periodo.
    const retentionIds = [...new Set(purchases.map((p) => p['retentionId']).filter(Boolean).map(String))];
    const retentionsById: Record<string, RawDoc> = {};
    await Promise.all(retentionIds.map(async (id) => {
      const snap = await col('retentions').doc(id).get();
      if (snap.exists) retentionsById[id] = snap.data() as RawDoc;
    }));

    // Establecimientos activos del RUC (ficha p. 6: numEstabRuc; p. 37: un
    // ventaEst por establecimiento). El id del documento es el código.
    const establishmentCodes = establishmentsSnap.docs
      .filter((d) => d.data()['isActive'] !== false)
      .map((d) => String(d.data()['code'] ?? d.id).trim().padStart(3, '0'))
      .filter((c) => /^\d{3}$/.test(c) && c !== '000');
    const defaultEstablishment = String(company?.['sri']?.['establishment'] ?? '').trim().padStart(3, '0');

    const built = buildAts({
      companyRuc, companyName, year, month, semestre,
      establishmentCodes, defaultEstablishment,
      invoices: data(invoicesSnap),
      debitNotes: data(debitNotesSnap),
      purchases,
      retentionsById,
      voidedInvoices: data(voidedInvoicesSnap),
      voidedDebitNotes: data(voidedDebitNotesSnap),
      voidedRetentions: data(voidedRetentionsSnap),
      excluirInformativa332,
    });

    // Sin datos personales en los logs: solo cuentas.
    console.log('[generateAts]', {
      companyId, year, month, semestre: semestre ?? null,
      ventas: built.summary.ventas.facturas + built.summary.ventas.notasCredito + built.summary.ventas.notasDebito,
      compras: built.summary.compras.documentos,
      retenciones: built.summary.retenciones.documentos,
      anulados: built.summary.anulados.documentos,
      avisos: built.warnings.length,
      xmlChars: built.xml.length,
    });

    const zip = new JSZip();
    // El SRI exige el nombre ATmmaaaa (ficha p. 3); el XML va en ISO-8859-1.
    zip.file(`${built.filenameBase}.xml`, Buffer.from(built.xml, 'latin1'));
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

    const result: GenerateAtsResult = {
      zip: zipBuffer.toString('base64'),
      filename: `${built.filenameBase}.zip`,
      summary: built.summary,
      warnings: built.warnings,
    };
    if (includeExcelData) result.excelData = built.excelData;
    return result;
  }
);
