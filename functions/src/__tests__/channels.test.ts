/**
 * channels.test.ts
 *
 * Aislamiento por canal. Las pruebas que importan son las NEGATIVAS: que el
 * super admin de un producto no pueda tocar las empresas del otro.
 *
 * Solo lógica pura, sin Firestore ni red.
 */

import {
  CHANNEL_ADMIN_ROLE,
  DEFAULT_CHANNEL_ID,
  SUPER_ADMIN_ROLE,
  assertChannelAccess,
  assertPlanMatchesCompany,
  canOperateOnChannel,
  isChannelAdmin,
  isValidChannelId,
  isSuperAdmin,
  resolveChannelForNewCompany,
  type Caller,
} from '../utils/channels';

const conectate: Caller = { uid: 'u1', role: CHANNEL_ADMIN_ROLE, channelId: 'conectate' };
const buseta: Caller = { uid: 'u2', role: CHANNEL_ADMIN_ROLE, channelId: 'mi-buseta' };
const platform: Caller = { uid: 'u3', role: SUPER_ADMIN_ROLE };
const companyAdmin: Caller = { uid: 'u4', role: 'admin', companyId: 'c1' };

describe('canOperateOnChannel', () => {
  it('deja al channel_admin operar sobre su propio canal', () => {
    expect(canOperateOnChannel(conectate, 'conectate')).toBe(true);
  });

  it('NIEGA al channel_admin de Conectate sobre una empresa de Mi Buseta', () => {
    expect(canOperateOnChannel(conectate, 'mi-buseta')).toBe(false);
    expect(canOperateOnChannel(buseta, 'conectate')).toBe(false);
  });

  it('deja pasar al super admin de plataforma en cualquier canal', () => {
    expect(canOperateOnChannel(platform, 'conectate')).toBe(true);
    expect(canOperateOnChannel(platform, 'mi-buseta')).toBe(true);
    expect(canOperateOnChannel(platform, undefined)).toBe(true);
  });

  it('niega a un channel_admin sin channelId en el token', () => {
    const sinCanal: Caller = { uid: 'u5', role: CHANNEL_ADMIN_ROLE };
    expect(canOperateOnChannel(sinCanal, 'conectate')).toBe(false);
  });

  it('niega cuando la empresa todavía no tiene canal estampado', () => {
    expect(canOperateOnChannel(conectate, undefined)).toBe(false);
    expect(canOperateOnChannel(conectate, null)).toBe(false);
    expect(canOperateOnChannel(conectate, '')).toBe(false);
  });

  it('niega a cualquier otro rol, incluido el admin de una empresa', () => {
    expect(canOperateOnChannel(companyAdmin, 'conectate')).toBe(false);
    expect(canOperateOnChannel({ uid: 'u6' }, 'conectate')).toBe(false);
  });
});

describe('assertChannelAccess', () => {
  it('no lanza cuando el canal coincide', () => {
    expect(() => assertChannelAccess(conectate, 'conectate')).not.toThrow();
  });

  it('lanza permission-denied cruzando canales', () => {
    expect(() => assertChannelAccess(conectate, 'mi-buseta')).toThrow(/permiso/i);
  });
});

describe('resolveChannelForNewCompany', () => {
  it('estampa el canal del channel_admin e ignora lo que venga en el payload', () => {
    expect(resolveChannelForNewCompany(conectate, 'mi-buseta')).toBe('conectate');
  });

  it('el super admin puede indicar canal, y sin indicarlo cae en directo', () => {
    expect(resolveChannelForNewCompany(platform, 'conectate')).toBe('conectate');
    expect(resolveChannelForNewCompany(platform)).toBe(DEFAULT_CHANNEL_ID);
  });

  it('lanza para un channel_admin sin channelId', () => {
    expect(() => resolveChannelForNewCompany({ uid: 'u7', role: CHANNEL_ADMIN_ROLE })).toThrow();
  });

  it('lanza para cualquier otro rol', () => {
    expect(() => resolveChannelForNewCompany(companyAdmin)).toThrow();
  });
});

describe('assertPlanMatchesCompany', () => {
  it('acepta plan y empresa del mismo canal', () => {
    expect(() => assertPlanMatchesCompany('conectate', 'conectate')).not.toThrow();
  });

  it('rechaza un plan de otro canal', () => {
    expect(() => assertPlanMatchesCompany('conectate', 'mi-buseta')).toThrow(/canal/i);
  });

  it('trata lo que no tiene canal como del canal directo', () => {
    expect(() => assertPlanMatchesCompany(undefined, undefined)).not.toThrow();
    expect(() => assertPlanMatchesCompany(null, DEFAULT_CHANNEL_ID)).not.toThrow();
    expect(() => assertPlanMatchesCompany(undefined, 'conectate')).toThrow();
  });
});

describe('isValidChannelId', () => {
  it('acepta ids en minúsculas con guiones', () => {
    expect(isValidChannelId('conectate')).toBe(true);
    expect(isValidChannelId('mi-buseta')).toBe(true);
  });

  it('rechaza lo que rompería un path o un claim', () => {
    expect(isValidChannelId('')).toBe(false);
    expect(isValidChannelId('Conectate')).toBe(false);
    expect(isValidChannelId('a/b')).toBe(false);
    expect(isValidChannelId('1canal')).toBe(false);
    expect(isValidChannelId('x')).toBe(false);
    expect(isValidChannelId(42)).toBe(false);
    expect(isValidChannelId(undefined)).toBe(false);
  });
});

describe('identidad', () => {
  it('distingue los dos roles', () => {
    expect(isSuperAdmin(platform)).toBe(true);
    expect(isChannelAdmin(platform)).toBe(false);
    expect(isChannelAdmin(conectate)).toBe(true);
    expect(isSuperAdmin(conectate)).toBe(false);
  });
});
