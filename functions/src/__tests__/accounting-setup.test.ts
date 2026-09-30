/**
 * accounting-setup.test.ts
 *
 * La puesta en marcha de la contabilidad (etapa 3.1): que el plan estándar sea
 * coherente y que las cuentas que usan los asientos automáticos existan en él.
 * Solo lógica pura.
 */

import {
  FIXED_CODES, accountProblem, effectiveMapping, needsEntry,
} from '../accounting/accounting-setup';
import { DEFAULT_CODES } from '../accounting/utils/get-account-mapping';
import {
  ECUADOR_CHART_OF_ACCOUNTS_SEED as SEED, accountDocId, levelFromCode, parentCodeFromCode,
} from '../accounting/utils/chart-seed';

const byCode = new Map(SEED.map((e) => [e.code, { code: e.code, name: e.name, isActive: true, allowsMovement: e.allowsMovement }]));

describe('plan de cuentas estándar', () => {
  it('no repite códigos y cada cuenta tiene su padre', () => {
    expect(new Set(SEED.map((e) => e.code)).size).toBe(SEED.length);
    for (const e of SEED) {
      const p = parentCodeFromCode(e.code);
      if (p) expect(byCode.has(p)).toBe(true);
    }
  });

  it('las de movimiento son las hojas: ninguna agrupadora queda sin hijos', () => {
    for (const e of SEED) {
      const tieneHijos = SEED.some((x) => parentCodeFromCode(x.code) === e.code);
      expect(tieneHijos).toBe(!e.allowsMovement);
    }
  });

  it('las cuentas de los asientos automáticos existen y admiten movimientos', () => {
    for (const code of [...Object.values(DEFAULT_CODES), ...Object.keys(FIXED_CODES)]) {
      expect([code, accountProblem(code, byCode)]).toEqual([code, null]);
    }
  });

  it('nivel, padre e id como los de la web', () => {
    expect(levelFromCode('1.1.01.001')).toBe(4);
    expect(parentCodeFromCode('1.1.01.001')).toBe('1.1.01');
    expect(parentCodeFromCode('1')).toBeNull();
    expect(accountDocId('1.1.01.001')).toBe('1_1_01_001');
  });
});

describe('cuentas del mapeo', () => {
  it('lo guardado manda y lo que falta sale del estándar', () => {
    const m = effectiveMapping({ sales15: '4.1.01.009', cogs: '  ' });
    expect(m.sales15).toBe('4.1.01.009');
    expect(m.cogs).toBe(DEFAULT_CODES.cogs);
    expect(m.ivaCollected).toBe(DEFAULT_CODES.ivaCollected);
  });

  it('explica por qué una cuenta no sirve', () => {
    const m = new Map([
      ['1', { code: '1', name: 'ACTIVO', isActive: true, allowsMovement: false }],
      ['9', { code: '9', name: 'X', isActive: false, allowsMovement: true }],
    ]);
    expect(accountProblem('1', m)).toContain('agrupadora');
    expect(accountProblem('9', m)).toContain('inactiva');
    expect(accountProblem('7', m)).toContain('no existe');
  });
});

describe('qué comprobante necesita asiento', () => {
  const base = { status: 'issued', sriStatus: 'authorized' };
  it('emitida o cobrada, autorizada o sin SRI, y sin asiento', () => {
    expect(needsEntry(base)).toBe(true);
    expect(needsEntry({ ...base, status: 'paid' })).toBe(true);
    expect(needsEntry({ ...base, sriStatus: 'not_required' })).toBe(true);
  });
  it('no: con asiento, anulada, borrador o sin autorizar', () => {
    expect(needsEntry({ ...base, accountingEntryId: 'x' })).toBe(false);
    expect(needsEntry({ ...base, isVoid: true, status: 'void' })).toBe(false);
    expect(needsEntry({ ...base, status: 'draft' })).toBe(false);
    expect(needsEntry({ ...base, sriStatus: 'rejected' })).toBe(false);
  });
});
