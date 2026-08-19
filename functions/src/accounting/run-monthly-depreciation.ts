import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions/v2';

// ─── Depreciación Mensual Automática ─────────────────────────────────────────
//
// Trigger: Cloud Scheduler — día 1 de cada mes a las 06:00 hora Ecuador.
// Procesa el mes anterior para evitar trabajar sobre el mes en curso.
//
// Por cada empresa activa:
//   1. Verifica idempotencia (no repetir si ya existe asiento de depreciación del mes)
//   2. Obtiene activos fijos activos con valor por depreciar
//   3. Calcula depreciación lineal mensual por activo
//   4. Consolida líneas por cuenta contable
//   5. Crea el journal_entry con status 'posted'
//   6. Actualiza cada activo con FieldValue.increment (atómico)

interface FixedAsset {
  id?: string;
  name: string;
  acquisitionDate: admin.firestore.Timestamp;
  acquisitionCost: number;
  residualValue: number;
  usefulLifeMonths: number;
  depreciationMethod: 'straight-line';
  assetAccountCode: string;
  assetAccountName: string;
  accDepreciationAccountCode: string;
  accDepreciationAccountName: string;
  expenseAccountCode: string;
  expenseAccountName: string;
  costCenterId?: string | null;
  costCenterName?: string | null;
  isActive: boolean;
  accumulatedDepreciation: number;
  remainingValue: number;
  lastDepreciationMonthKey?: string; // formato 'YYYY-MM'
}

interface JournalEntryLine {
  id: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  costCenterId: string | null;
  costCenterName: string | null;
  description: string;
}

function round2(n: number): number { return Math.round(n * 100) / 100; }

// ─── Lógica compartida (también usada por runDepreciationForMonth) ─────────────

export interface DepreciationResult {
  assetsProcessed: number;
  entryId?: string;
  skipped?: boolean;
  message: string;
}

export async function processDepreciationForCompany(
  companyId: string,
  year: number,
  month: number,
  monthKey: string
): Promise<DepreciationResult> {
  const db  = admin.firestore();
  const now = admin.firestore.Timestamp.now();

  const prefix = `[depreciation][${companyId}][${monthKey}]`;

  // a) Idempotencia: buscar si ya existe un journal_entry de depreciación para este mes
  const existingSnap = await db
    .collection(`companies/${companyId}/journal_entries`)
    .where('type',     '==', 'depreciation')
    .where('monthKey', '==', monthKey)
    .limit(1)
    .get();

  if (!existingSnap.empty) {
    logger.info(`${prefix} Ya existe asiento de depreciación — omitiendo.`);
    return { assetsProcessed: 0, entryId: existingSnap.docs[0].id, skipped: true, message: `Ya procesado para ${monthKey}` };
  }

  // b) Obtener activos fijos activos
  const assetsSnap = await db
    .collection(`companies/${companyId}/fixed_assets`)
    .where('isActive', '==', true)
    .get();

  logger.info(`${prefix} Activos activos encontrados:`, assetsSnap.docs.length);

  // c) Filtrar activos que corresponde depreciar este mes
  const processingMonthStart = new admin.firestore.Timestamp(
    Math.floor(new Date(year, month - 1, 1).getTime() / 1000),
    0
  );

  const assetsToDepreciate: Array<{ doc: admin.firestore.QueryDocumentSnapshot; asset: FixedAsset; actualDep: number }> = [];

  for (const doc of assetsSnap.docs) {
    const asset = { id: doc.id, ...doc.data() } as FixedAsset;

    // Verificar que queda valor por depreciar
    const depreciableRemaining = round2((asset.remainingValue ?? 0) - (asset.residualValue ?? 0));
    if (depreciableRemaining <= 0) continue;

    // Verificar que no fue procesado este mes ya
    if (asset.lastDepreciationMonthKey === monthKey) continue;

    // Verificar que la fecha de adquisición <= inicio del mes procesado
    if (asset.acquisitionDate && asset.acquisitionDate.seconds > processingMonthStart.seconds) continue;

    // d) Calcular depreciación del mes
    const usefulLifeMonths = asset.usefulLifeMonths && asset.usefulLifeMonths > 0 ? asset.usefulLifeMonths : 1;
    const monthlyDep = round2((asset.acquisitionCost - asset.residualValue) / usefulLifeMonths);
    const actualDep  = round2(Math.min(monthlyDep, depreciableRemaining));

    if (actualDep <= 0) continue;

    assetsToDepreciate.push({ doc, asset, actualDep });
  }

  logger.info(`${prefix} Activos a depreciar:`, assetsToDepreciate.length);

  // e) Si no hay activos que depreciar: return early
  if (assetsToDepreciate.length === 0) {
    logger.info(`${prefix} Sin activos que depreciar este mes.`);
    return { assetsProcessed: 0, skipped: true, message: 'Sin activos que depreciar' };
  }

  // f) Buscar período contable abierto para el año de procesamiento
  const periodsSnap = await db
    .collection(`companies/${companyId}/accounting_periods`)
    .where('year',   '==', year)
    .where('status', '==', 'open')
    .limit(1)
    .get();

  if (periodsSnap.empty) {
    logger.warn(`${prefix} No hay período contable abierto para el año`, year, '— omitiendo empresa.');
    return { assetsProcessed: 0, skipped: true, message: `Sin período contable abierto para ${year}` };
  }

  const periodDoc = periodsSnap.docs[0];

  // g) Consolidar líneas agrupando por cuenta
  const debitMap  = new Map<string, { accountCode: string; accountName: string; costCenterId: string | null; costCenterName: string | null; amount: number }>();
  const creditMap = new Map<string, { accountCode: string; accountName: string; costCenterId: string | null; costCenterName: string | null; amount: number }>();

  for (const { asset, actualDep } of assetsToDepreciate) {
    // Débito: gasto de depreciación
    const debitKey = asset.expenseAccountCode;
    const existing = debitMap.get(debitKey);
    if (existing) {
      existing.amount = round2(existing.amount + actualDep);
    } else {
      debitMap.set(debitKey, {
        accountCode:   asset.expenseAccountCode,
        accountName:   asset.expenseAccountName,
        costCenterId:  asset.costCenterId  ?? null,
        costCenterName:asset.costCenterName ?? null,
        amount:        actualDep
      });
    }

    // Crédito: depreciación acumulada
    const creditKey = asset.accDepreciationAccountCode;
    const existingCredit = creditMap.get(creditKey);
    if (existingCredit) {
      existingCredit.amount = round2(existingCredit.amount + actualDep);
    } else {
      creditMap.set(creditKey, {
        accountCode:   asset.accDepreciationAccountCode,
        accountName:   asset.accDepreciationAccountName,
        costCenterId:  asset.costCenterId  ?? null,
        costCenterName:asset.costCenterName ?? null,
        amount:        actualDep
      });
    }
  }

  const description = `Depreciación mensual ${monthKey}`;

  const entryLines: JournalEntryLine[] = [];

  for (const entry of debitMap.values()) {
    entryLines.push({
      id:            crypto.randomUUID(),
      accountCode:   entry.accountCode,
      accountName:   entry.accountName,
      debit:         entry.amount,
      credit:        0,
      costCenterId:  entry.costCenterId,
      costCenterName:entry.costCenterName,
      description
    });
  }

  for (const entry of creditMap.values()) {
    entryLines.push({
      id:            crypto.randomUUID(),
      accountCode:   entry.accountCode,
      accountName:   entry.accountName,
      debit:         0,
      credit:        entry.amount,
      costCenterId:  entry.costCenterId,
      costCenterName:entry.costCenterName,
      description
    });
  }

  const totalDebit  = round2(entryLines.reduce((s, l) => s + l.debit,  0));
  const totalCredit = round2(entryLines.reduce((s, l) => s + l.credit, 0));
  const isBalanced  = Math.abs(totalDebit - totalCredit) < 0.01;

  if (!isBalanced) {
    logger.error(`${prefix} Asiento descuadrado:`, { totalDebit, totalCredit });
  }

  // h) Obtener siguiente número de asiento (atomic con runTransaction)
  const counterKey = `journal_${year}`;
  const counterRef = db.doc(`companies/${companyId}/counters/journal_entries`);
  let entryNumber  = 1;

  await db.runTransaction(async tx => {
    const snap    = await tx.get(counterRef);
    const current = (snap.data()?.[counterKey] as number) ?? 0;
    entryNumber   = current + 1;
    tx.set(counterRef, { [counterKey]: entryNumber }, { merge: true });
  });

  // i) Crear el journal_entry
  const entryDate = new admin.firestore.Timestamp(
    Math.floor(new Date(year, month - 1, 1).getTime() / 1000),
    0
  );

  const entryRef = db.collection(`companies/${companyId}/journal_entries`).doc();
  await entryRef.set({
    number:      entryNumber,
    date:        entryDate,
    description,
    periodId:    periodDoc.id,
    periodYear:  year,
    type:        'depreciation',
    status:      'posted',
    monthKey,
    lines:       entryLines,
    totalDebit,
    totalCredit,
    isBalanced,
    createdBy:   'system',
    createdAt:   now,
    updatedAt:   now
  });

  logger.info(`${prefix} Asiento de depreciación creado:`, entryRef.id, '| balanceado:', isBalanced, '| número:', entryNumber);

  // j) Actualizar cada activo con writeBatch (chunks de 400 para no superar límite de 500)
  const BATCH_SIZE = 400;
  for (let i = 0; i < assetsToDepreciate.length; i += BATCH_SIZE) {
    const chunk = assetsToDepreciate.slice(i, i + BATCH_SIZE);
    const batch = db.batch();

    for (const { doc, actualDep } of chunk) {
      batch.update(doc.ref, {
        accumulatedDepreciation: admin.firestore.FieldValue.increment(actualDep),
        remainingValue:          admin.firestore.FieldValue.increment(-actualDep),
        lastDepreciationMonthKey: monthKey,
        updatedAt:               now
      });
    }

    await batch.commit();
    logger.info(`${prefix} Batch de activos actualizado (chunk ${Math.floor(i / BATCH_SIZE) + 1}):`, chunk.length, 'activos');
  }

  return {
    assetsProcessed: assetsToDepreciate.length,
    entryId:         entryRef.id,
    message:         `Depreciación procesada: ${assetsToDepreciate.length} activos, asiento ${entryNumber}`
  };
}

// ─── Cloud Function programada ─────────────────────────────────────────────────

export const runMonthlyDepreciation = onSchedule(
  { schedule: '0 6 1 * *', timeZone: 'America/Guayaquil' },
  async () => {
    // Mes a procesar = mes anterior (evitar procesar mes en curso)
    const now            = new Date();
    const processingDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const processingYear  = processingDate.getFullYear();
    const processingMonth = processingDate.getMonth() + 1; // 1-12
    const monthKey        = processingYear + '-' + String(processingMonth).padStart(2, '0');

    logger.info('[runMonthlyDepreciation] Iniciando depreciación para mes:', monthKey);

    const db = admin.firestore();

    const companiesSnap = await db.collection('companies').get();
    logger.info('[runMonthlyDepreciation] Empresas a procesar:', companiesSnap.docs.length);

    let totalAssetsProcessed = 0;
    let companiesProcessed   = 0;
    let companiesSkipped     = 0;
    let companiesErrored     = 0;

    // Procesar en secuencia con for...of para no saturar Firestore
    for (const companyDoc of companiesSnap.docs) {
      const companyId = companyDoc.id;

      try {
        const result = await processDepreciationForCompany(companyId, processingYear, processingMonth, monthKey);

        if (result.skipped) {
          companiesSkipped++;
        } else {
          totalAssetsProcessed += result.assetsProcessed;
          companiesProcessed++;
        }

        logger.info(`[runMonthlyDepreciation][${companyId}]`, result.message);
      } catch (err) {
        // Si falla una empresa, continuar con las demás
        companiesErrored++;
        logger.error(`[runMonthlyDepreciation][${companyId}] Error al procesar empresa:`, err);
      }
    }

    logger.info('[runMonthlyDepreciation] Completado.', {
      monthKey,
      companiesProcessed,
      companiesSkipped,
      companiesErrored,
      totalAssetsProcessed
    });
  }
);
