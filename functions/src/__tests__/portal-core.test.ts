/**
 * portal-core.test.ts
 *
 * Lógica pura del portal de canal: paquetes, módulos, validación de planes y
 * lo que se expone de una empresa.
 */

import {
  DEFAULT_PLAN_LIMITS,
  PackageDef,
  addonCodesOf,
  companySummary,
  effectivePackages,
  isCompanyStatus,
  resolveModules,
  sanitizePlanInput,
  toPlain,
  withDependencies,
  withoutDependents,
} from '../channel-portal/portal-core';

const catalog: PackageDef[] = [
  { code: 'pkg_base', modules: ['dashboard', 'settings'], isSystem: true },
  { code: 'pkg_sales', modules: ['products', 'invoices'], dependencies: ['pkg_base'] },
  { code: 'pkg_sri', modules: ['sri', 'retentions'], dependencies: ['pkg_sales'] },
  { code: 'pkg_accounting', modules: ['accounting'], dependencies: ['pkg_sri'] },
  { code: 'pkg_stock', modules: ['stock'], dependencies: ['pkg_sales'] },
];
const codes = catalog.map(p => p.code);

describe('resolveModules', () => {
  it('une los módulos de los paquetes activos sin repetir', () => {
    expect(resolveModules(['pkg_base', 'pkg_sales'], catalog).sort())
      .toEqual(['dashboard', 'invoices', 'products', 'settings']);
  });

  it('ignora códigos que no están en el catálogo', () => {
    expect(resolveModules(['pkg_fantasma'], catalog)).toEqual([]);
  });
});

describe('withDependencies / withoutDependents', () => {
  it('activar arrastra las dependencias en cadena', () => {
    expect(withDependencies('pkg_accounting', ['pkg_base'], catalog).sort())
      .toEqual(['pkg_accounting', 'pkg_base', 'pkg_sales', 'pkg_sri']);
  });

  it('desactivar arrastra a los que dependen, en cadena', () => {
    const active = ['pkg_base', 'pkg_sales', 'pkg_sri', 'pkg_accounting', 'pkg_stock'];
    expect(withoutDependents('pkg_sri', active, catalog).sort())
      .toEqual(['pkg_base', 'pkg_sales', 'pkg_stock']);
  });

  it('desactivar algo que no está activo no toca nada', () => {
    expect(withoutDependents('pkg_sri', ['pkg_base'], catalog)).toEqual(['pkg_base']);
  });
});

describe('effectivePackages', () => {
  it('suma plan y add-on, y los módulos salen del catálogo (no de códigos de paquete)', () => {
    const r = effectivePackages(['pkg_base', 'pkg_sales'], ['pkg_stock'], catalog);
    expect(r.enabledPackages.sort()).toEqual(['pkg_base', 'pkg_sales', 'pkg_stock']);
    expect(r.enabledModules).toContain('stock');
    expect(r.enabledModules).not.toContain('pkg_stock');
  });
});

describe('addonCodesOf', () => {
  it('lee el formato de objeto y el viejo de string', () => {
    expect(addonCodesOf({ addonPackages: [{ packageCode: 'pkg_sri' }, 'pkg_stock', null] }))
      .toEqual(['pkg_sri', 'pkg_stock']);
    expect(addonCodesOf({})).toEqual([]);
  });
});

describe('isCompanyStatus', () => {
  it('acepta solo los estados conocidos', () => {
    expect(isCompanyStatus('suspended')).toBe(true);
    expect(isCompanyStatus('borrado')).toBe(false);
    expect(isCompanyStatus(undefined)).toBe(false);
  });
});

describe('sanitizePlanInput', () => {
  it('completa lo que falta con valores por defecto y siempre incluye pkg_base', () => {
    const p = sanitizePlanInput({ name: ' Básico ', includedPackages: ['pkg_sales'] }, codes);
    expect(p.name).toBe('Básico');
    expect(p.includedPackages).toEqual(['pkg_base', 'pkg_sales']);
    expect(p.limits['sri']['invoicesPerMonth']).toBe(DEFAULT_PLAN_LIMITS.sri.invoicesPerMonth);
    expect(p.isActive).toBe(true);
    expect(p.billingPeriod).toBe('monthly');
  });

  it('descarta campos que no son del plan', () => {
    const p = sanitizePlanInput({ name: 'X', channelId: 'mi-buseta', planLimits: {} }, codes) as any;
    expect(p.channelId).toBeUndefined();
    expect(p.planLimits).toBeUndefined();
  });

  it('pisa solo los límites que llegan y conserva el resto del plan actual', () => {
    const base = sanitizePlanInput({ name: 'X', limits: { sri: { invoicesPerMonth: 50 } } }, codes);
    const edited = sanitizePlanInput({ limits: { users: { activeUsersPerCompany: 9 } } }, codes, base);
    expect(edited.limits['sri']['invoicesPerMonth']).toBe(50);
    expect(edited.limits['users']['activeUsersPerCompany']).toBe(9);
    expect(edited.name).toBe('X');
  });

  it('acepta -1 como ilimitado y rechaza otros negativos', () => {
    expect(sanitizePlanInput({ name: 'X', limits: { sri: { invoicesPerMonth: -1 } } }, codes)
      .limits['sri']['invoicesPerMonth']).toBe(-1);
    expect(() => sanitizePlanInput({ name: 'X', limits: { sri: { invoicesPerMonth: -5 } } }, codes)).toThrow();
    expect(() => sanitizePlanInput({ name: 'X', priceMonthly: -1 }, codes)).toThrow();
  });

  it('rechaza nombre vacío, periodo inválido y paquetes inexistentes', () => {
    expect(() => sanitizePlanInput({ name: '  ' }, codes)).toThrow(/nombre/);
    expect(() => sanitizePlanInput({ name: 'X', billingPeriod: 'weekly' }, codes)).toThrow(/Periodo/);
    expect(() => sanitizePlanInput({ name: 'X', includedPackages: ['pkg_fantasma'] }, codes)).toThrow(/inexistentes/);
    expect(() => sanitizePlanInput(null, codes)).toThrow();
  });

  it('convierte precios que llegan como texto', () => {
    expect(sanitizePlanInput({ name: 'X', priceMonthly: '19.5' }, codes).priceMonthly).toBe(19.5);
    expect(() => sanitizePlanInput({ name: 'X', priceMonthly: 'gratis' }, codes)).toThrow();
  });
});

describe('companySummary', () => {
  it('nunca expone el certificado ni su clave', () => {
    const s = companySummary('c1', {
      name: 'Empresa',
      sri: { certificatePath: 'gs://x/cert.p12', certPassword: 'secreta', ruc: '0999999999001' },
    }) as any;
    expect(JSON.stringify(s)).not.toContain('secreta');
    expect(JSON.stringify(s)).not.toContain('cert.p12');
    expect(s.sri.hasCertificate).toBe(true);
    expect(s.sri.ruc).toBe('0999999999001');
  });
});

describe('toPlain', () => {
  it('convierte Timestamps y fechas a ISO, en profundidad', () => {
    const ts = { toDate: () => new Date('2026-09-17T00:00:00Z') };
    expect(toPlain({ a: ts, b: [ts], c: { d: new Date('2026-01-01T00:00:00Z') } })).toEqual({
      a: '2026-09-17T00:00:00.000Z',
      b: ['2026-09-17T00:00:00.000Z'],
      c: { d: '2026-01-01T00:00:00.000Z' },
    });
  });
});
