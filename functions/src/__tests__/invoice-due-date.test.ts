/**
 * invoice-due-date.test.ts — plazo de pago de la factura (2026-10-29).
 */

import {
  invoiceDueDate, normalizeTimeUnit, paymentDeadlineDays, paymentDeadlineProblem,
} from '../utils/invoice-due-date';

describe('plazo de pago de la factura', () => {
  const fecha = new Date('2026-10-29T12:00:00-05:00');

  it('sin plazo vence el mismo día (de contado)', () => {
    expect(invoiceDueDate(fecha, [{ deadline: 0, timeUnit: 'dias' }]).toISOString()).toBe(fecha.toISOString());
    expect(invoiceDueDate(fecha, [{}]).toISOString()).toBe(fecha.toISOString());
  });

  it('30 días después de la factura', () => {
    expect(invoiceDueDate(fecha, [{ deadline: 30, timeUnit: 'dias' }]).toISOString())
      .toBe(new Date('2026-11-28T12:00:00-05:00').toISOString());
  });

  it('con varias formas de pago manda el plazo más largo', () => {
    expect(paymentDeadlineDays([{ deadline: 15 }, { deadline: 45, timeUnit: 'dias' }, { deadline: 0 }])).toBe(45);
  });

  it('convierte semanas, meses y años', () => {
    expect(paymentDeadlineDays([{ deadline: 2, timeUnit: 'semanas' }])).toBe(14);
    expect(paymentDeadlineDays([{ deadline: 1, timeUnit: 'Meses' }])).toBe(30);
    expect(paymentDeadlineDays([{ deadline: 1, timeUnit: 'años' }])).toBe(365);
  });

  it('normaliza la unidad', () => {
    expect(normalizeTimeUnit('Días')).toBe('dias');
    expect(normalizeTimeUnit(undefined)).toBe('dias');
  });

  it('valida el plazo', () => {
    expect(paymentDeadlineProblem(undefined, undefined)).toBeNull();
    expect(paymentDeadlineProblem(30, 'dias')).toBeNull();
    expect(paymentDeadlineProblem(-1, 'dias')).not.toBeNull();
    expect(paymentDeadlineProblem(1.5, 'dias')).not.toBeNull();
    expect(paymentDeadlineProblem('abc', 'dias')).not.toBeNull();
    expect(paymentDeadlineProblem(3651, 'dias')).not.toBeNull();
    expect(paymentDeadlineProblem(11, 'anios')).not.toBeNull();
    expect(paymentDeadlineProblem(5, 'quincenas')).not.toBeNull();
  });
});
