/**
 * payroll-limits.ts — El cupo de empleados del plan (PLAN_NOMINA.md D-N9, §6.4).
 * Puro.
 *
 * Mismas convenciones que checkPlanLimit (-1 ilimitado, 0 deshabilitado, >0
 * tope), con UNA diferencia a propósito: una empresa sin `planLimits` (heredada)
 * NO pasa. checkPlanLimit la deja pasar para no bloquear flujos viejos; la
 * nómina es nueva y exige el módulo y un cupo explícito.
 */

export interface EmployeeLimitDecision {
  allowed: boolean;
  limit: number;
  current: number;
  reason?: string;
}

export function employeeLimitDecision(
  planLimits: Record<string, any> | null | undefined,
  currentActive: number,
): EmployeeLimitDecision {
  if (!planLimits) {
    return { allowed: false, limit: 0, current: currentActive,
      reason: 'La empresa no tiene límites de plan: la nómina necesita un plan con cupo de empleados.' };
  }
  const raw = planLimits?.masterData?.employeesTotal;
  const limit = typeof raw === 'number' ? raw : 0;
  if (limit === -1) return { allowed: true, limit, current: currentActive };
  if (limit === 0) {
    return { allowed: false, limit, current: currentActive, reason: 'El plan de la empresa no incluye empleados en nómina.' };
  }
  const allowed = currentActive < limit;
  return { allowed, limit, current: currentActive,
    reason: allowed ? undefined : `El plan permite ${limit} empleado(s) activo(s) en nómina.` };
}
