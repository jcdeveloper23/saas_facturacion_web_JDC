// Identidad federada: validación de la identidad externa que se vincula a un
// usuario de empresa, y el id del vínculo que después busca exchangeToken.
import { identityLinkId, validateExternalIdentity } from '../users/create-company-user';
import { ALLOWED_ORIGINS } from '../auth/exchange-token';

describe('validateExternalIdentity', () => {
  it('acepta un origen autorizado con un uid de Firebase', () => {
    expect(validateExternalIdentity({ origin: 'work-cloud', uid: 'IZ4fIw5q8uXnqilAHqZJLsQazld2' })).toBeNull();
    expect(validateExternalIdentity({ origin: 'mi-buseta', uid: 'abc123' })).toBeNull();
  });

  it('rechaza un origen que no está en la lista', () => {
    expect(validateExternalIdentity({ origin: 'otro-sistema', uid: 'abc' })).toMatch(/no autorizado/);
  });

  it('rechaza uid vacío, demasiado largo o con barra', () => {
    expect(validateExternalIdentity({ origin: 'work-cloud', uid: '' })).toMatch(/uid/);
    expect(validateExternalIdentity({ origin: 'work-cloud', uid: 'x'.repeat(129) })).toMatch(/uid/);
    // Una barra rompería la ruta del documento: identity-links/work-cloud:a/b
    expect(validateExternalIdentity({ origin: 'work-cloud', uid: 'a/b' })).toMatch(/uid/);
  });

  it('rechaza lo que no es un objeto', () => {
    expect(validateExternalIdentity(null)).not.toBeNull();
    expect(validateExternalIdentity('work-cloud:abc')).not.toBeNull();
  });
});

describe('identityLinkId', () => {
  it('usa el formato origen:uid que busca exchangeToken', () => {
    expect(identityLinkId('work-cloud', 'u1')).toBe('work-cloud:u1');
  });
});

describe('ALLOWED_ORIGINS', () => {
  it('solo lleva el projectId: ninguna credencial', () => {
    for (const config of Object.values(ALLOWED_ORIGINS)) {
      expect(Object.keys(config)).toEqual(['projectId']);
    }
  });

  it('Conecta apunta a su proyecto real', () => {
    expect(ALLOWED_ORIGINS['work-cloud'].projectId).toBe('work-cloud-df68a');
  });
});

import { resolveSessionScope } from '../auth/exchange-token';

describe('resolveSessionScope — una persona, varias empresas', () => {
  const link = { role: 'admin', companyId: 'c_primera' };

  it('sin empresa pedida usa la del primer vínculo', () => {
    expect(resolveSessionScope(link, null, null)).toEqual({ companyId: 'c_primera', role: 'admin' });
  });

  it('con empresa pedida, el rol sale de SU membresía en esa empresa', () => {
    const r = resolveSessionScope(link, 'c_segunda', { exists: true, platformRole: 'accountant' });
    expect(r).toEqual({ companyId: 'c_segunda', role: 'accountant' });
  });

  it('niega una empresa de la que no es miembro', () => {
    expect(resolveSessionScope(link, 'c_ajena', { exists: false })).toBeNull();
  });

  it('niega una membresía desactivada', () => {
    expect(resolveSessionScope(link, 'c_segunda', { exists: true, isActive: false, platformRole: 'admin' })).toBeNull();
  });

  it('sin rol en ningún lado no hay sesión', () => {
    expect(resolveSessionScope({}, null, null)).toBeNull();
  });
});
