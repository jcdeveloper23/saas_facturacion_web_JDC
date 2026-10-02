/**
 * company-sri-sync.test.ts
 *
 * Lo que portalUpdateCompany escribe también en configuration/sri, que es lo que
 * leen el XML y el RIDE. El caso que lo trajo: «Obligado a llevar contabilidad»
 * encendido después del alta seguía saliendo «NO» (2026-10-02).
 */
import { sriConfigChangesFor } from '../channel-portal/company-sri-sync';

describe('sriConfigChangesFor', () => {
  it('obligado a llevar contabilidad → SI / NO', () => {
    expect(sriConfigChangesFor({}, { accountingRequired: true })).toEqual({ obligadoContabilidad: 'SI' });
    expect(sriConfigChangesFor({}, { accountingRequired: false })).toEqual({ obligadoContabilidad: 'NO' });
  });

  it('datos del emisor', () => {
    expect(sriConfigChangesFor(
      { name: 'CLUB', fiscalAddress: ' Av. Solano ', phone: '099', email: 'a@b.ec' },
      { businessName: 'CLUB DEPORTIVO', tradeName: 'POTROS', contribuyenteEspecial: '123' },
    )).toEqual({
      razonSocial: 'CLUB DEPORTIVO', nombreComercial: 'POTROS', direccionMatriz: 'Av. Solano',
      telefono: '099', correo: 'a@b.ec', contribuyenteEspecial: '123',
    });
  });

  it('sin businessName, la razón social sale del nombre', () => {
    expect(sriConfigChangesFor({ name: 'EMPRESA' }, {})).toEqual({ razonSocial: 'EMPRESA' });
  });

  it('no borra la razón social ni la dirección con un valor vacío', () => {
    expect(sriConfigChangesFor({ name: ' ', fiscalAddress: '' }, { businessName: '' })).toEqual({});
  });

  it('lo que no llegó no se toca (ambiente, establecimiento)', () => {
    expect(sriConfigChangesFor({ city: 'Cuenca' }, { environment: 'testing', establishment: '001' })).toEqual({});
  });
});
