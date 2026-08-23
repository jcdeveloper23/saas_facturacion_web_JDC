/**
 * sri-buyer-id.test.ts
 *
 * Caso 2 del pedido: Consumidor Final → tipoIdentificacionComprador = 07.
 * Caso 3 del pedido: Consumidor Final con código 04 es incorrecto y debe
 * corregirse/rechazarse — resolveTipoIdentificacionComprador AUTO-CORRIGE
 * (nunca deja pasar 04 con la identificación fija de consumidor final);
 * validateBuyerIdentification (sri-invoice-validator.test.ts) es la versión
 * que EXPLÍCITAMENTE rechaza la combinación incorrecta si algo la produce
 * sin pasar por el resolver.
 */

import { resolveTipoIdentificacionComprador, CONSUMIDOR_FINAL_TAX_ID, TIPO_IDENTIFICACION_COMPRADOR } from '../utils/sri-buyer-id';

describe('resolveTipoIdentificacionComprador', () => {
  test('Caso 2: identificación 9999999999999 → siempre 07, sin importar taxIdType', () => {
    expect(resolveTipoIdentificacionComprador(CONSUMIDOR_FINAL_TAX_ID, undefined, 'RUC'))
      .toBe(TIPO_IDENTIFICACION_COMPRADOR.CONSUMIDOR_FINAL);
  });

  test('Caso 3: aunque llegue un código explícito 04 con identificación de consumidor final, se ignora y se fuerza 07', () => {
    expect(resolveTipoIdentificacionComprador(CONSUMIDOR_FINAL_TAX_ID, TIPO_IDENTIFICACION_COMPRADOR.RUC, 'RUC'))
      .toBe(TIPO_IDENTIFICACION_COMPRADOR.CONSUMIDOR_FINAL);
  });

  test('RUC real (13 dígitos, no consumidor final) con taxIdType="RUC" → 04', () => {
    expect(resolveTipoIdentificacionComprador('1792146739001', undefined, 'RUC'))
      .toBe(TIPO_IDENTIFICACION_COMPRADOR.RUC);
  });

  test('cédula (10 dígitos) con taxIdType="CI" → 05', () => {
    expect(resolveTipoIdentificacionComprador('1710034065', undefined, 'CI'))
      .toBe(TIPO_IDENTIFICACION_COMPRADOR.CEDULA);
  });

  test('pasaporte con taxIdType="PASAPORTE" → 06', () => {
    expect(resolveTipoIdentificacionComprador('AB123456', undefined, 'PASAPORTE'))
      .toBe(TIPO_IDENTIFICACION_COMPRADOR.PASAPORTE);
  });

  test('código explícito ya resuelto se respeta cuando NO es consumidor final', () => {
    expect(resolveTipoIdentificacionComprador('1792146739001', '05', 'RUC'))
      .toBe('05'); // explicitCode gana sobre taxIdType si no es consumidor final
  });

  test('taxIdType desconocido/vacío → default RUC (04)', () => {
    expect(resolveTipoIdentificacionComprador('1792146739001', undefined, undefined))
      .toBe(TIPO_IDENTIFICACION_COMPRADOR.RUC);
  });
});
