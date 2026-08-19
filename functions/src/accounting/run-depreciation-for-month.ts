import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { processDepreciationForCompany } from './run-monthly-depreciation';

// ─── Depreciación Manual (HTTPS Callable) ─────────────────────────────────────
//
// Permite ejecutar la depreciación de un mes específico desde el frontend.
// Usa la misma lógica que runMonthlyDepreciation (processDepreciationForCompany).
//
// Input:  { companyId: string; year: number; month: number }
// Output: { success: boolean; assetsProcessed: number; entryId?: string; skipped?: boolean; message: string }

export const runDepreciationForMonth = onCall(async (request) => {
  // Verificar autenticación
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'No autenticado');
  }

  const { companyId, year, month } = request.data as {
    companyId?: string;
    year?: number;
    month?: number;
  };

  // Validar inputs
  if (!companyId || typeof companyId !== 'string' || companyId.trim() === '') {
    throw new HttpsError('invalid-argument', 'companyId es requerido y debe ser un string válido');
  }

  if (year === undefined || year === null || typeof year !== 'number' || !Number.isInteger(year)) {
    throw new HttpsError('invalid-argument', 'year es requerido y debe ser un número entero');
  }

  if (month === undefined || month === null || typeof month !== 'number' || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new HttpsError('invalid-argument', 'month es requerido y debe ser un entero entre 1 y 12');
  }

  // Verificar que el caller tiene acceso a la empresa
  const callerCompanyId = request.auth?.token?.companyId as string | undefined;
  if (!callerCompanyId || callerCompanyId !== companyId) {
    throw new HttpsError('permission-denied', 'Sin permiso para esta empresa');
  }

  const monthKey = year + '-' + String(month).padStart(2, '0');

  logger.info('[runDepreciationForMonth] Iniciando depreciación manual:', { companyId, year, month, monthKey });

  try {
    const result = await processDepreciationForCompany(companyId, year, month, monthKey);

    logger.info('[runDepreciationForMonth] Completado:', { companyId, monthKey, ...result });

    return {
      success:         true,
      assetsProcessed: result.assetsProcessed,
      entryId:         result.entryId,
      skipped:         result.skipped ?? false,
      message:         result.message
    };
  } catch (err) {
    logger.error('[runDepreciationForMonth] Error:', { companyId, monthKey, err });
    throw new HttpsError('internal', 'Error al procesar la depreciación');
  }
});
