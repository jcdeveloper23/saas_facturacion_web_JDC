/**
 * portal-import-documents.test.ts — F-2 `portalImportDocuments` (Mi Buseta,
 * sincronización 1b) contra un Firestore en memoria y un SRI simulado:
 * quién puede llamarla, cada `status` que entiende el `ack` de bill-service,
 * el ambiente 2 en una empresa en pruebas, el ejercicio (cerrado/inexistente),
 * conflictos por número y por externalId, la reverificación (`duplicate` con
 * asiento o con el motivo de que falte) y que una anulada nunca se contabiliza
 * (se pasa el documento escrito por los triggers reales de asiento).
 *
 * Los comprobantes son sintéticos.
 */

// ─── Firestore en memoria ─────────────────────────────────────────────────────
const store = new Map<string, Record<string, any>>();
const SERVER_TS = Symbol('serverTimestamp');
let autoId = 0;

class MockTimestamp {
  constructor(private d: Date) {}
  toDate() { return this.d; }
  static fromDate(d: Date) { return new MockTimestamp(d); }
  static now() { return new MockTimestamp(new Date('2026-11-17T20:00:00Z')); }
}

function snap(path: string) {
  const data = store.get(path);
  return {
    id: path.split('/').pop()!,
    ref: docRef(path),
    exists: data !== undefined,
    data: () => (data ? { ...data } : undefined),
    get: (f: string) => data?.[f],
  };
}

function docRef(path: string): any {
  return {
    path,
    id: path.split('/').pop()!,
    get: async () => snap(path),
    set: async (data: any, opts?: { merge?: boolean }) => applyWrite(path, data, !!opts?.merge),
    update: async (data: any) => {
      if (!store.has(path)) throw new Error(`update de un documento que no existe: ${path}`);
      applyWrite(path, data, true);
    },
    collection: (sub: string) => collectionRef(`${path}/${sub}`),
  };
}

function query(col: string, filters: Array<[string, string, any]>, lim?: number): any {
  const run = () => {
    const docs = [...store.keys()]
      .filter((p) => p.startsWith(`${col}/`) && p.split('/').length === col.split('/').length + 1)
      .map((p) => snap(p))
      .filter((s) => filters.every(([f, op, v]) => (op === 'in' ? v.includes(s.get(f)) : s.get(f) === v)));
    const out = lim ? docs.slice(0, lim) : docs;
    return { empty: out.length === 0, size: out.length, docs: out };
  };
  return {
    isQuery: true,
    where: (f: string, op: string, v: any) => query(col, [...filters, [f, op, v]], lim),
    limit: (n: number) => query(col, filters, n),
    get: async () => run(),
    run,
  };
}

function collectionRef(col: string): any {
  return { ...query(col, []), doc: (id?: string) => docRef(`${col}/${id ?? `auto${++autoId}`}`) };
}

function applyWrite(path: string, data: Record<string, any>, merge: boolean) {
  const before = store.get(path);
  const base = merge ? { ...(before ?? {}) } : {};
  for (const [k, v] of Object.entries(data)) base[k] = v === SERVER_TS ? MockTimestamp.now() : v;
  store.set(path, base);
  if (autoTriggers && /^companies\/[^/]+\/invoices\/[^/]+$/.test(path)) fireInvoiceTriggers(path, before, { ...base });
}

/**
 * Con `autoTriggers`, cada escritura en una factura dispara —asíncronos, como
 * en producción— los triggers reales de asiento y de reversa.
 */
let autoTriggers = false;
const inFlight: Array<Promise<void>> = [];
function fireInvoiceTriggers(path: string, before: Record<string, any> | undefined, after: Record<string, any>) {
  const [, companyId, , invoiceId] = path.split('/');
  const event = {
    data: { before: { exists: before !== undefined, data: () => before }, after: { exists: true, data: () => after } },
    params: { companyId, invoiceId },
  };
  inFlight.push(new Promise<void>((ok) => setTimeout(ok, 0)).then(async () => {
    await (generateJournalEntryFromInvoice as any).run(event);
    await (generateJournalEntryFromCreditNote as any).run(event);
    if (before !== undefined) await (generateReversalFromInvoice as any).run(event);
  }));
}
async function settleTriggers() {
  while (inFlight.length) await inFlight.shift();
}

let failNextTransaction = false;
const mockDb = {
  doc: (p: string) => docRef(p),
  collection: (p: string) => collectionRef(p),
  runTransaction: async (fn: (tx: any) => Promise<any>) => {
    if (failNextTransaction) { failNextTransaction = false; throw new Error('ABORTED'); }
    const writes: Array<() => void> = [];
    const tx = {
      get: async (r: any) => {
        if (writes.length) throw new Error('Firestore: lecturas después de escrituras en la transacción');
        return r.isQuery ? r.run() : snap(r.path);
      },
      set: (r: any, data: any, opts?: { merge?: boolean }) => { writes.push(() => applyWrite(r.path, data, !!opts?.merge)); },
      update: (r: any, data: any) => { writes.push(() => applyWrite(r.path, data, true)); },
    };
    const result = await fn(tx);
    writes.forEach((w) => w());
    return result;
  },
};

jest.mock('firebase-admin', () => ({
  firestore: Object.assign(() => mockDb, {
    FieldValue: { serverTimestamp: () => SERVER_TS },
    Timestamp: MockTimestamp,
  }),
  storage: () => { throw new Error('no debería subir a Storage en estas pruebas'); },
}));

const mockQuerySri = jest.fn();
jest.mock('../utils/sri-authorization', () => ({
  ...jest.requireActual('../utils/sri-authorization'),
  querySriAuthorization: (...args: any[]) => mockQuerySri(...args),
}));

import { calculateModulo11 } from '../utils/sri-access-key';
import {
  REVERSAL_WAIT, ecuadorYear, portalImportDocuments, precheckAccessKey, periodStateOf, readImportRequest, voidBlocker,
} from '../channel-portal/portal-import-documents';
import { generateReversalFromInvoice } from '../accounting/generate-reversal-entry';
import { generateJournalEntryFromInvoice } from '../accounting/generate-journal-entry-from-invoice';
import { generateJournalEntryFromCreditNote } from '../accounting/generate-journal-entry-from-credit-note';

// ─── Comprobantes ─────────────────────────────────────────────────────────────
const RUC = '0992220104001';
const C = 'companies/c1';

function clave(o: { fecha: string; cod: string; amb: string; sec: number; ruc?: string }) {
  const k48 = `${o.fecha}${o.cod}${o.ruc ?? RUC}${o.amb}001002${String(o.sec).padStart(9, '0')}12345678` + '1';
  return k48 + calculateModulo11(k48);
}

type Opts = { sec?: number; amb?: string; fecha?: string; cod?: '01' | '04'; ruc?: string };

function comprobante(o: Opts = {}) {
  const sec = o.sec ?? 101;
  const amb = o.amb ?? '2';
  const fecha = o.fecha ?? '03/11/2026';
  const cod = o.cod ?? '01';
  const ruc = o.ruc ?? RUC;
  const k = clave({ fecha: fecha.replace(/\//g, ''), cod, amb, sec, ruc });
  const info = `<infoTributaria><ambiente>${amb}</ambiente><tipoEmision>1</tipoEmision><razonSocial>TRANSPORTE ESCOLAR</razonSocial>
<ruc>${ruc}</ruc><claveAcceso>${k}</claveAcceso><codDoc>${cod}</codDoc><estab>001</estab><ptoEmi>002</ptoEmi>
<secuencial>${String(sec).padStart(9, '0')}</secuencial></infoTributaria>`;
  const comprador = `<tipoIdentificacionComprador>05</tipoIdentificacionComprador><razonSocialComprador>REPRESENTANTE</razonSocialComprador>
<identificacionComprador>0912345678</identificacionComprador>`;
  const impuestos = `<totalConImpuestos><totalImpuesto><codigo>2</codigo><codigoPorcentaje>0</codigoPorcentaje><tarifa>0</tarifa><baseImponible>45.50</baseImponible><valor>0.00</valor></totalImpuesto></totalConImpuestos>`;
  const detalle = (codigo: string) => `<detalles><detalle><${codigo}>TRANSP</${codigo}><descripcion>Transporte escolar noviembre</descripcion><cantidad>1</cantidad>
<precioUnitario>45.50</precioUnitario><descuento>0</descuento><precioTotalSinImpuesto>45.50</precioTotalSinImpuesto>
<impuestos><impuesto><codigo>2</codigo><codigoPorcentaje>0</codigoPorcentaje><tarifa>0</tarifa><baseImponible>45.50</baseImponible><valor>0.00</valor></impuesto></impuestos></detalle></detalles>`;
  const xml = cod === '01'
    ? `<?xml version="1.0" encoding="UTF-8"?><factura id="comprobante" version="1.1.0">${info}
<infoFactura><fechaEmision>${fecha}</fechaEmision>${comprador}<totalSinImpuestos>45.50</totalSinImpuestos><totalDescuento>0.00</totalDescuento>
${impuestos}<importeTotal>45.50</importeTotal><pagos><pago><formaPago>20</formaPago><total>45.50</total></pago></pagos></infoFactura>${detalle('codigoPrincipal')}</factura>`
    : `<?xml version="1.0" encoding="UTF-8"?><notaCredito id="comprobante" version="1.1.0">${info}
<infoNotaCredito><fechaEmision>${fecha}</fechaEmision>${comprador}<codDocModificado>01</codDocModificado><numDocModificado>001-002-000000101</numDocModificado>
<fechaEmisionDocSustento>03/11/2026</fechaEmisionDocSustento><totalSinImpuestos>45.50</totalSinImpuestos><valorModificacion>45.50</valorModificacion>
${impuestos}<motivo>Devolución</motivo></infoNotaCredito>${detalle('codigoInterno')}</notaCredito>`;
  return { k, xml };
}

const autorizacion = (xml: string, k: string, estado = 'AUTORIZADO') => ({
  found: true, estado, numeroAutorizacion: k, fechaAutorizacion: '2026-11-03T10:00:00-05:00', mensaje: '',
  authorizedXml: `<?xml version="1.0"?><autorizacion><estado>${estado}</estado><numeroAutorizacion>${k}</numeroAutorizacion>` +
    `<fechaAutorizacion>2026-11-03T10:00:00-05:00</fechaAutorizacion><comprobante><![CDATA[${xml}]]></comprobante></autorizacion>`,
});

/** El SRI simulado conoce estos comprobantes. */
const sri = new Map<string, any>();
function enElSri(o: Opts = {}, estado = 'AUTORIZADO') {
  const c = comprobante(o);
  sri.set(c.k, autorizacion(c.xml, c.k, estado));
  return c.k;
}

// ─── Llamadas ─────────────────────────────────────────────────────────────────
const asGateway = { auth: { uid: 'gw-mibuseta', token: { role: 'channel_admin', channelId: 'mi-buseta' } } };
const call = (data: any, req: any = asGateway) => (portalImportDocuments as any).run({ ...req, data });
const doc = (accessKey: string, externalId = 'mibuseta:bill:70412', extra: Record<string, any> = {}) =>
  ({ accessKey, externalId, ...extra });

async function expectError(p: Promise<any>, code: string) {
  await expect(p).rejects.toMatchObject({ code });
}

/** Pasa el documento recién escrito por los triggers reales de asiento (creación). */
async function runEntryTriggers(accessKey: string) {
  const path = `${C}/invoices/${accessKey}`;
  const event = {
    data: { before: { exists: false, data: () => undefined }, after: { exists: true, data: () => store.get(path) } },
    params: { companyId: 'c1', invoiceId: accessKey },
  };
  await (generateJournalEntryFromInvoice as any).run(event);
  await (generateJournalEntryFromCreditNote as any).run(event);
}
const journalEntries = () => [...store.keys()].filter((p) => p.startsWith(`${C}/journal_entries/`));

function seed() {
  store.clear();
  sri.clear();
  autoId = 0;
  failNextTransaction = false;
  autoTriggers = false;
  inFlight.length = 0;
  REVERSAL_WAIT.ms = 2000;
  REVERSAL_WAIT.pollMs = 5;
  mockQuerySri.mockReset();
  mockQuerySri.mockImplementation(async (k: string) => sri.get(k) ?? { found: false, estado: '', numeroAutorizacion: '', fechaAutorizacion: '', mensaje: '', authorizedXml: '' });
  store.set('channels/mi-buseta', { status: 'active' });
  store.set('channels/conecta-app', { status: 'active' });
  // La empresa del piloto se dio de alta en «testing», pero factura en producción.
  store.set(C, { channelId: 'mi-buseta', status: 'active', sri: { ruc: RUC, environment: 'testing' } });
  store.set('companies/c2', { channelId: 'conecta-app', status: 'active', sri: { ruc: RUC, environment: 'production' } });
  store.set(`${C}/accounting_periods/y2026`, { year: 2026, status: 'open' });
  store.set(`${C}/accounting_periods/y2025`, { year: 2025, status: 'closed' });
}

beforeEach(seed);

// ─── Entrada y permisos ───────────────────────────────────────────────────────
describe('readImportRequest', () => {
  const k = comprobante().k;
  it('acepta el lote bien formado', () => {
    const r = readImportRequest({ companyId: 'c1', documents: [doc(k, 'mibuseta:bill:1', { voided: true, voidSeenAt: '2026-11-04T15:00:00Z' })] });
    expect(r.documents[0]).toMatchObject({ accessKey: k, voided: true });
    expect(r.documents[0].voidSeenAt!.toISOString()).toBe('2026-11-04T15:00:00.000Z');
  });
  it.each([
    ['campos desconocidos arriba', { companyId: 'c1', documents: [doc(k)], xml: 'x' }],
    ['campos desconocidos en un documento', { companyId: 'c1', documents: [doc(k, undefined, { total: 1 })] }],
    ['lote vacío', { companyId: 'c1', documents: [] }],
    ['más de 10', { companyId: 'c1', documents: Array.from({ length: 11 }, (_, i) => doc(k, `mibuseta:bill:${i}`)) }],
    ['clave corta', { companyId: 'c1', documents: [doc('123')] }],
    ['externalId ajeno', { companyId: 'c1', documents: [doc(k, 'conecta:bill:1')] }],
    ['clave repetida', { companyId: 'c1', documents: [doc(k, 'mibuseta:bill:1'), doc(k, 'mibuseta:bill:2')] }],
    ['externalId repetido', { companyId: 'c1', documents: [doc(k), doc(clave({ fecha: '03112026', cod: '01', amb: '2', sec: 9 }))] }],
    ['voided no booleano', { companyId: 'c1', documents: [doc(k, undefined, { voided: 'si' })] }],
    ['sin empresa', { documents: [doc(k)] }],
  ])('rechaza %s', (_, data) => {
    expect(() => readImportRequest(data)).toThrow(expect.objectContaining({ code: 'invalid-argument' }));
  });
});

describe('permisos', () => {
  const data = () => ({ companyId: 'c1', documents: [doc(enElSri())] });
  it('sin sesión', () => expectError(call(data(), {}), 'unauthenticated'));
  it('admin de la empresa no', () => expectError(call(data(), { auth: { uid: 'u', token: { role: 'admin', companyId: 'c1' } } }), 'permission-denied'));
  it('channel_admin de otro canal no', () =>
    expectError(call(data(), { auth: { uid: 'g', token: { role: 'channel_admin', channelId: 'conecta-app' } } }), 'permission-denied'));
  it('empresa de otro canal no, aunque el RUC cuadre', () =>
    expectError(call({ companyId: 'c2', documents: [doc(enElSri())] }), 'permission-denied'));
  it('super_admin solo sobre empresas de mi-buseta', async () => {
    const su = { auth: { uid: 's', token: { role: 'super_admin' } } };
    await expectError(call({ companyId: 'c2', documents: [doc(enElSri())] }, su), 'permission-denied');
    const r = await call(data(), su);
    expect(r.results[0].status).toBe('imported');
  });
  it('canal suspendido', async () => {
    store.set('channels/mi-buseta', { status: 'suspended' });
    await expectError(call(data()), 'permission-denied');
  });
  it('empresa inexistente', () => expectError(call({ companyId: 'nope', documents: [doc(enElSri())] }), 'not-found'));
  it('empresa suspendida o sin RUC', async () => {
    store.set(C, { ...store.get(C), status: 'suspended' });
    await expectError(call(data()), 'failed-precondition');
    store.set(C, { channelId: 'mi-buseta', status: 'trial', sri: { environment: 'testing' } });
    await expectError(call(data()), 'failed-precondition');
  });
});

// ─── Importación ──────────────────────────────────────────────────────────────
describe('portalImportDocuments', () => {
  it('importa una factura de ambiente 2 en una empresa en «testing», y el trigger hace un solo asiento', async () => {
    const k = enElSri();
    const r = await call({ companyId: 'c1', documents: [doc(k)] });
    expect(r.results).toEqual([{
      accessKey: k, externalId: 'mibuseta:bill:70412', status: 'imported',
      fullNumber: '001-002-000000101', documentType: 'invoice', fiscalYear: 2026, total: 45.5,
    }]);
    expect(r.summary).toEqual({ total: 1, byStatus: { imported: 1 } });

    const f = store.get(`${C}/invoices/${k}`)!;
    expect(f).toMatchObject({
      status: 'issued', sriStatus: 'authorized', isVoid: false, imported: true, source: 'xml_import',
      externalId: 'mibuseta:bill:70412', origin: 'mi-buseta', importedVia: 'portalImportDocuments',
      sriEnvironment: 'production', stockProcessed: true, importedXmlId: k,
    });
    expect(f.accountingEntryId).toBeUndefined();
    expect(store.get(`${C}/imported-xml/${k}`)).toMatchObject({ accessKey: k, source: 'sri', origin: 'mi-buseta' });
    expect(store.get(`${C}/counters/invoices`)).toMatchObject({ '001_002_2026': 101 });
    // Solo consulta: una llamada, a la URL de producción.
    expect(mockQuerySri).toHaveBeenCalledTimes(1);
    expect(mockQuerySri.mock.calls[0][1]).toContain('cel.sri.gob.ec');

    await runEntryTriggers(k);
    expect(journalEntries()).toHaveLength(1);
    const entryId = store.get(`${C}/invoices/${k}`)!.accountingEntryId;
    expect(entryId).toBeTruthy();

    // Reverificación: duplicate con el asiento; no vuelve al SRI ni escribe.
    const again = await call({ companyId: 'c1', documents: [doc(k)] });
    expect(again.results[0]).toMatchObject({ status: 'duplicate', accountingEntryId: entryId, total: 45.5, fiscalYear: 2026 });
    expect(again.results[0].missingEntryReason).toBeUndefined();
    expect(mockQuerySri).toHaveBeenCalledTimes(1);
    expect(journalEntries()).toHaveLength(1);
  });

  it('importa una nota de crédito (04)', async () => {
    const k = enElSri({ cod: '04', sec: 7 });
    const r = await call({ companyId: 'c1', documents: [doc(k, 'mibuseta:nc:55')] });
    expect(r.results[0]).toMatchObject({ status: 'imported', documentType: 'creditNote', total: 45.5 });
    expect(store.get(`${C}/invoices/${k}`)).toMatchObject({ isCreditNote: true, documentType: 'creditNote' });
    expect(store.get(`${C}/counters/invoices`)).toMatchObject({ 'NC_001_002_2026': 7 });
  });

  it('anulada en Mi Buseta: se importa anulada y ningún trigger la contabiliza', async () => {
    const k = enElSri();
    const kn = enElSri({ cod: '04', sec: 8 });
    const r = await call({ companyId: 'c1', documents: [
      doc(k, 'mibuseta:bill:1', { voided: true, voidSeenAt: '2026-11-05T14:00:00Z' }),
      doc(kn, 'mibuseta:nc:2', { voided: true }),
    ] });
    expect(r.results.map((x: any) => [x.status, x.voided])).toEqual([['imported', true], ['imported', true]]);
    const f = store.get(`${C}/invoices/${k}`)!;
    expect(f).toMatchObject({ status: 'void', isVoid: true, voidedInOrigin: true, sriStatus: 'authorized', stockRestored: true });
    expect(f.voidedAt.toDate().toISOString()).toBe('2026-11-05T14:00:00.000Z');

    await runEntryTriggers(k);
    await runEntryTriggers(kn);
    expect(journalEntries()).toHaveLength(0);
    expect(store.get(`${C}/invoices/${k}`)!.accountingEntryId).toBeUndefined();

    // Repetida: duplicate anulada, sin motivo de asiento faltante (bill-service la deja en «voided»).
    const again = await call({ companyId: 'c1', documents: [doc(k, 'mibuseta:bill:1', { voided: true })] });
    expect(again.results[0]).toMatchObject({ status: 'duplicate', voided: true });
    expect(again.results[0].missingEntryReason).toBeUndefined();
    expect(again.results[0].accountingEntryId).toBeUndefined();
  });

  it('sin ejercicio abierto: no_open_period y no escribe nada', async () => {
    store.delete(`${C}/accounting_periods/y2026`);
    const k = enElSri();
    const r = await call({ companyId: 'c1', documents: [doc(k)] });
    expect(r.results[0]).toMatchObject({ status: 'no_open_period', fiscalYear: 2026, fullNumber: '001-002-000000101' });
    expect(store.has(`${C}/invoices/${k}`)).toBe(false);
    expect(store.has(`${C}/counters/invoices`)).toBe(false);
  });

  it('ejercicio bloqueado cuenta como no abierto; ejercicio cerrado: closed_period', async () => {
    store.set(`${C}/accounting_periods/y2026`, { year: 2026, status: 'locked' });
    const k = enElSri();
    expect((await call({ companyId: 'c1', documents: [doc(k)] })).results[0].status).toBe('no_open_period');

    const k25 = enElSri({ fecha: '15/12/2025', sec: 5000 });
    const r = await call({ companyId: 'c1', documents: [doc(k25, 'mibuseta:bill:9')] });
    expect(r.results[0]).toMatchObject({ status: 'closed_period', fiscalYear: 2025 });
    expect(store.has(`${C}/invoices/${k25}`)).toBe(false);
  });

  it('repetida sin asiento: duplicate con missingEntryReason según el ejercicio', async () => {
    const k = enElSri();
    await call({ companyId: 'c1', documents: [doc(k)] }); // sin pasar por el trigger
    expect((await call({ companyId: 'c1', documents: [doc(k)] })).results[0])
      .toMatchObject({ status: 'duplicate', missingEntryReason: 'unknown' });
    store.set(`${C}/accounting_periods/y2026`, { year: 2026, status: 'closed' });
    expect((await call({ companyId: 'c1', documents: [doc(k)] })).results[0])
      .toMatchObject({ status: 'duplicate', missingEntryReason: 'closed_period' });
    store.delete(`${C}/accounting_periods/y2026`);
    expect((await call({ companyId: 'c1', documents: [doc(k)] })).results[0])
      .toMatchObject({ status: 'duplicate', missingEntryReason: 'no_open_period' });
  });

  it('importada antes por importInvoices (sin externalId): duplicate, no conflict', async () => {
    const k = enElSri();
    store.set(`${C}/invoices/${k}`, { fullNumber: '001-002-000000101', fiscalYear: '2026', total: 45.5, status: 'issued', accountingEntryId: 'je9' });
    expect((await call({ companyId: 'c1', documents: [doc(k)] })).results[0])
      .toMatchObject({ status: 'duplicate', accountingEntryId: 'je9' });
  });

  it('conflictos: misma clave con otro externalId, mismo externalId con otra clave, mismo número con otra clave', async () => {
    const k = enElSri();
    await call({ companyId: 'c1', documents: [doc(k, 'mibuseta:bill:1')] });

    expect((await call({ companyId: 'c1', documents: [doc(k, 'mibuseta:bill:2')] })).results[0].status).toBe('conflict');

    const k2 = enElSri({ sec: 102 });
    expect((await call({ companyId: 'c1', documents: [doc(k2, 'mibuseta:bill:1')] })).results[0].status).toBe('conflict');

    // Mismo 001-002-000000101 con otra clave (otra fecha): el SRI lo tendría, FacturaEc no lo acepta.
    const k3 = enElSri({ fecha: '04/11/2026' });
    const r = await call({ companyId: 'c1', documents: [doc(k3, 'mibuseta:bill:3')] });
    expect(r.results[0]).toMatchObject({ status: 'conflict', fullNumber: '001-002-000000101' });
    expect(store.has(`${C}/invoices/${k3}`)).toBe(false);
  });

  it('otra empresa, otro ambiente, tipo no soportado o dígito malo: sin ir al SRI', async () => {
    store.set(C, { ...store.get(C), sri: { ruc: RUC, environment: 'production' } });
    const ajena = comprobante({ ruc: '1790012345001' }).k;
    const pruebas = comprobante({ amb: '1', sec: 3 }).k;
    const retencion = clave({ fecha: '03112026', cod: '07', amb: '2', sec: 4 });
    const mala = comprobante({ sec: 5 }).k.slice(0, 48) + ((+comprobante({ sec: 5 }).k[48] + 1) % 10);
    const tipoCruzado = comprobante({ sec: 6 }).k;
    const r = await call({ companyId: 'c1', documents: [
      doc(ajena, 'mibuseta:bill:1'), doc(pruebas, 'mibuseta:bill:2'), doc(retencion, 'mibuseta:bill:3'),
      doc(mala, 'mibuseta:bill:4'), doc(tipoCruzado, 'mibuseta:nc:5'),
    ] });
    expect(r.results.map((x: any) => x.status)).toEqual(['other_company', 'other_environment', 'invalid', 'invalid', 'invalid']);
    expect(mockQuerySri).not.toHaveBeenCalled();
    expect(r.summary.byStatus).toEqual({ other_company: 1, other_environment: 1, invalid: 3 });
  });

  it('ambiente 1 sí se acepta si la empresa está en pruebas', async () => {
    const k = enElSri({ amb: '1' });
    const r = await call({ companyId: 'c1', documents: [doc(k)] });
    expect(r.results[0].status).toBe('imported');
    expect(mockQuerySri.mock.calls[0][1]).toContain('celcer.sri.gob.ec');
  });

  it('SRI: no responde, no la tiene, la tiene sin autorizar, o devuelve basura', async () => {
    const caida = comprobante({ sec: 1 }).k;
    const noExiste = comprobante({ sec: 2 }).k;
    const devuelta = enElSri({ sec: 3 }, 'NO AUTORIZADO');
    const basura = comprobante({ sec: 4 }).k;
    sri.set(basura, { ...autorizacion('<x/>', basura), authorizedXml: '<autorizacion><estado>AUTORIZADO</estado><comprobante>nada</comprobante></autorizacion>' });
    const otra = comprobante({ sec: 5 }).k;
    const real = comprobante({ sec: 99 });
    sri.set(otra, autorizacion(real.xml, otra)); // el SRI devolvió otro comprobante
    mockQuerySri.mockImplementation(async (k: string) => {
      if (k === caida) throw Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
      return sri.get(k) ?? { found: false, estado: '', numeroAutorizacion: '', fechaAutorizacion: '', mensaje: '', authorizedXml: '' };
    });
    const r = await call({ companyId: 'c1', documents: [
      doc(caida, 'mibuseta:bill:1'), doc(noExiste, 'mibuseta:bill:2'), doc(devuelta, 'mibuseta:bill:3'),
      doc(basura, 'mibuseta:bill:4'), doc(otra, 'mibuseta:bill:5'),
    ] });
    expect(r.results.map((x: any) => x.status)).toEqual(['sri_unavailable', 'not_authorized', 'not_authorized', 'invalid', 'invalid']);
    expect([...store.keys()].some((p) => p.startsWith(`${C}/invoices/`))).toBe(false);
  });

  it('dos del mismo número en el lote: la segunda es conflict', async () => {
    const a = enElSri({ sec: 200 });
    const b = enElSri({ sec: 200, fecha: '05/11/2026' });
    const r = await call({ companyId: 'c1', documents: [doc(a, 'mibuseta:bill:1'), doc(b, 'mibuseta:bill:2')] });
    expect(r.results.map((x: any) => x.status)).toEqual(['imported', 'conflict']);
  });

  it('falla al escribir: internal (reintento en bill-service), sin escritura parcial', async () => {
    const k = enElSri();
    failNextTransaction = true;
    const r = await call({ companyId: 'c1', documents: [doc(k)] });
    expect(r.results[0].status).toBe('internal');
    expect(store.has(`${C}/invoices/${k}`)).toBe(false);
    expect((await call({ companyId: 'c1', documents: [doc(k)] })).results[0].status).toBe('imported');
  });

  it('los status y motivos son los que acepta el ack de bill-service', async () => {
    const ACK = new Set(['imported', 'duplicate', 'no_open_period', 'not_authorized', 'sri_unavailable', 'unavailable',
      'deadline-exceeded', 'internal', 'permission-denied', 'failed-precondition', 'not-found',
      'closed_period', 'conflict', 'other_company', 'other_environment', 'invalid']);
    const MISSING = new Set(['no_open_period', 'closed_period', 'unknown']);
    const k = enElSri();
    const rs = [
      ...(await call({ companyId: 'c1', documents: [doc(k), doc(comprobante({ sec: 2 }).k, 'mibuseta:bill:2')] })).results,
      ...(await call({ companyId: 'c1', documents: [doc(k)] })).results,
    ];
    for (const x of rs) {
      expect(ACK.has(x.status)).toBe(true);
      if (x.missingEntryReason !== undefined) expect(MISSING.has(x.missingEntryReason)).toBe(true);
      if (x.total !== undefined) expect(Math.round(x.total * 100) / 100).toBe(x.total);
    }
  });
});

// ─── Anulada en Mi Buseta después de importarse (2026-11-17) ──────────────────
describe('anulación posterior a la importación', () => {
  /** Importa viva con los triggers reales, y la deja «importada hace rato». */
  async function importLive(k: string, externalId: string) {
    autoTriggers = true;
    const r = await call({ companyId: 'c1', documents: [doc(k, externalId)] });
    expect(r.results[0].status).toBe('imported');
    await settleTriggers();
    const path = `${C}/invoices/${k}`;
    store.set(path, { ...store.get(path)!, importedAt: MockTimestamp.fromDate(new Date('2026-11-03T16:00:00Z')) });
    return store.get(path)!.accountingEntryId as string;
  }

  it.each([
    ['factura', {}, 'mibuseta:bill:70412', 'invoice'],
    ['nota de crédito', { cod: '04' as const, sec: 7 }, 'mibuseta:nc:55', 'creditNote'],
  ])('%s: 1 asiento al importar, la reversa una sola vez al reenviarla anulada, y nada al repetir', async (_, o, ext, type) => {
    const k = enElSri(o);
    const entryId = await importLive(k, ext);
    expect(entryId).toBeTruthy();
    expect(journalEntries()).toHaveLength(1);

    const voided = { voided: true, voidSeenAt: '2026-11-16T21:30:00Z' };
    const r = await call({ companyId: 'c1', documents: [doc(k, ext, voided)] });
    await settleTriggers();
    expect(r.results[0]).toMatchObject({ status: 'duplicate', voided: true, documentType: type, accountingEntryId: entryId });
    const reversalId = r.results[0].reversalEntryId;
    expect(reversalId).toBeTruthy();
    expect(journalEntries()).toHaveLength(2);

    const f = store.get(`${C}/invoices/${k}`)!;
    expect(f).toMatchObject({ status: 'void', isVoid: true, voidedInOrigin: true, voidedBy: 'gw-mibuseta',
      sriStatus: 'authorized', reversalEntryId: reversalId });
    expect(f.voidedAt.toDate().toISOString()).toBe('2026-11-16T21:30:00.000Z');
    expect(f.reversalError).toBeUndefined();
    const original = store.get(`${C}/journal_entries/${entryId}`)!;
    const reversal = store.get(`${C}/journal_entries/${reversalId}`)!;
    expect(original).toMatchObject({ status: 'cancelled', reversalEntryId: reversalId });
    expect(reversal).toMatchObject({ reversalOf: entryId, periodId: original.periodId, status: 'posted', referenceId: k });
    expect(reversal.lines.map((l: any) => [l.accountCode, l.debit, l.credit]))
      .toEqual(original.lines.map((l: any) => [l.accountCode, l.credit, l.debit]));
    expect(mockQuerySri).toHaveBeenCalledTimes(1); // anular no consulta el SRI

    // Repetida: idempotente, sin escribir ni crear otra reversa.
    const snapshot = JSON.stringify(store.get(`${C}/invoices/${k}`));
    const again = await call({ companyId: 'c1', documents: [doc(k, ext, voided)] });
    await settleTriggers();
    expect(again.results[0]).toMatchObject({ status: 'duplicate', voided: true, reversalEntryId: reversalId, accountingEntryId: entryId });
    expect(journalEntries()).toHaveLength(2);
    expect(JSON.stringify(store.get(`${C}/invoices/${k}`))).toBe(snapshot);
  });

  it('no se des-anula: voided:false sobre una anulada es conflict y no escribe', async () => {
    const k = enElSri();
    const entryId = await importLive(k, 'mibuseta:bill:1');
    await call({ companyId: 'c1', documents: [doc(k, 'mibuseta:bill:1', { voided: true, voidSeenAt: '2026-11-16T21:30:00Z' })] });
    await settleTriggers();
    const snapshot = JSON.stringify(store.get(`${C}/invoices/${k}`));
    const r = await call({ companyId: 'c1', documents: [doc(k, 'mibuseta:bill:1')] });
    await settleTriggers();
    expect(r.results[0]).toMatchObject({ status: 'conflict', voided: true, accountingEntryId: entryId });
    expect(JSON.stringify(store.get(`${C}/invoices/${k}`))).toBe(snapshot);
    expect(journalEntries()).toHaveLength(2);
  });

  it('ejercicio de la anulación sin abrir: no_open_period; cerrado: closed_period; sin escribir', async () => {
    const k = enElSri();
    await importLive(k, 'mibuseta:bill:1');
    const snapshot = JSON.stringify(store.get(`${C}/invoices/${k}`));
    const send = async (voidSeenAt: string) =>
      (await call({ companyId: 'c1', documents: [doc(k, 'mibuseta:bill:1', { voided: true, voidSeenAt })] })).results[0];

    // 2027-01-01 02:00 UTC todavía es 2026 en Ecuador.
    expect(ecuadorYear(new Date('2027-01-01T02:00:00Z'))).toBe(2026);
    expect(await send('2027-01-02T15:00:00Z')).toMatchObject({ status: 'no_open_period', fiscalYear: 2026 });
    store.set(`${C}/accounting_periods/y2027`, { year: 2027, status: 'closed' });
    expect(await send('2027-01-02T15:00:00Z')).toMatchObject({ status: 'closed_period' });
    // El del comprobante (donde caería la reversa) cerrado.
    store.set(`${C}/accounting_periods/y2026`, { year: 2026, status: 'closed' });
    expect(await send('2026-11-16T21:30:00Z')).toMatchObject({ status: 'closed_period' });
    await settleTriggers();
    expect(JSON.stringify(store.get(`${C}/invoices/${k}`))).toBe(snapshot);
    expect(journalEntries()).toHaveLength(1);
  });

  it('viva sin asiento: se anula sin reversa; recién importada sin asiento: internal (el trigger puede estar en curso)', async () => {
    const k = enElSri();
    await call({ companyId: 'c1', documents: [doc(k, 'mibuseta:bill:1')] }); // sin triggers: queda sin asiento
    const path = `${C}/invoices/${k}`;
    store.set(path, { ...store.get(path)!, importedAt: MockTimestamp.fromDate(new Date()) });
    const fresh = await call({ companyId: 'c1', documents: [doc(k, 'mibuseta:bill:1', { voided: true })] });
    expect(fresh.results[0].status).toBe('internal');
    expect(store.get(path)!.isVoid).toBe(false);

    store.set(path, { ...store.get(path)!, importedAt: MockTimestamp.fromDate(new Date('2026-11-03T16:00:00Z')) });
    autoTriggers = true;
    const r = await call({ companyId: 'c1', documents: [doc(k, 'mibuseta:bill:1', { voided: true, voidSeenAt: '2026-11-16T21:30:00Z' })] });
    await settleTriggers();
    expect(r.results[0]).toMatchObject({ status: 'duplicate', voided: true });
    expect(r.results[0].reversalEntryId).toBeUndefined();
    expect(store.get(path)).toMatchObject({ status: 'void', isVoid: true });
    expect(journalEntries()).toHaveLength(0);
  });

  it('con anticipos, recibos o retenciones recibidas: conflict sin anular', async () => {
    const k = enElSri();
    await importLive(k, 'mibuseta:bill:1');
    const path = `${C}/invoices/${k}`;
    autoTriggers = false;
    store.set(path, { ...store.get(path)!, advancesApplied: { cents: 1000, count: 1 } });
    const r = await call({ companyId: 'c1', documents: [doc(k, 'mibuseta:bill:1', { voided: true })] });
    expect(r.results[0]).toMatchObject({ status: 'conflict' });
    expect(store.get(path)!.isVoid).toBe(false);
    expect(voidBlocker({ receivedRetentions: { ivaCents: 0, rentaCents: 120 } })).toMatch(/retenciones/);
    expect(voidBlocker({ cashVouchersApplied: { cents: 5 } })).toMatch(/recibos/);
    expect(voidBlocker({ paymentEntryId: 'je-1', isPaid: true })).toMatch(/cobrada/);
    expect(voidBlocker({ isPaid: true })).toMatch(/cobrada/);
    expect(voidBlocker({ status: 'issued' })).toBeNull();
  });
});

describe('reglas puras', () => {
  it('periodStateOf', () => {
    expect(periodStateOf([])).toBe('none');
    expect(periodStateOf([{ status: 'locked' }])).toBe('none');
    expect(periodStateOf([{ status: 'closed' }])).toBe('closed');
    expect(periodStateOf([{ status: 'closed' }, { status: 'open' }])).toBe('open');
  });
  it('precheckAccessKey: ambiente 2 pasa aunque la empresa esté en pruebas', () => {
    const k = comprobante().k;
    expect(precheckAccessKey({ accessKey: k, externalId: 'mibuseta:bill:1' }, RUC, true)).toBeNull();
    expect(precheckAccessKey({ accessKey: k, externalId: 'mibuseta:bill:1' }, RUC, false)).toBeNull();
  });
});
