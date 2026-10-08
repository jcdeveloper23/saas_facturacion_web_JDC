import { closedPeriodReversalError } from '../accounting/utils/closed-period';

describe('closedPeriodReversalError', () => {
  it('ejercicio cerrado: mensaje con el año', () => {
    expect(closedPeriodReversalError({ status: 'closed', year: 2025 }))
      .toBe('El ejercicio 2025 está cerrado: no se generó la reversa del asiento. '
        + 'Corrige con una nota de crédito o un asiento en el ejercicio abierto.');
  });

  it('sin año en el ejercicio usa el del asiento', () => {
    expect(closedPeriodReversalError({ status: 'closed' }, 2024)).toContain('El ejercicio 2024 está cerrado');
  });

  it('sin ningún año, sin número', () => {
    expect(closedPeriodReversalError({ status: 'closed' })).toMatch(/^El ejercicio está cerrado/);
  });

  it('abierto, bloqueado o inexistente: no bloquea', () => {
    expect(closedPeriodReversalError({ status: 'open', year: 2026 })).toBeNull();
    expect(closedPeriodReversalError({ status: 'locked', year: 2026 })).toBeNull();
    expect(closedPeriodReversalError(undefined)).toBeNull();
    expect(closedPeriodReversalError(null)).toBeNull();
  });
});
