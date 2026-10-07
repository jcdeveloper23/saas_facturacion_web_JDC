/**
 * master-data-projection.ts
 *
 * Qué datos de una persona o de un artículo le interesan a un canal (hoy,
 * Conecta) y cómo se le avisa que cambiaron. Decisión del usuario del
 * 2026-10-07, «etapa 2» de unificar clientes y productos: FacturaEc manda en
 * los datos fiscales y el canal guarda una copia que se actualiza sola, en
 * sentido único FacturaEc → canal.
 *
 * Puro: sin firebase, para probarlo sin emulador. Lo usan los triggers de
 * `channel-sync/notify-channel.ts`.
 *
 * ⛔ El cuerpo del aviso (`buildPayload`) es un CONTRATO con el receptor del
 * canal (`facturaEcMasterDataSync` en work-cloud-df68a). No cambiarlo sin
 * subir `version` y sin cambiar también el receptor.
 */

export type MasterDataKind = 'persona' | 'product';

/** Lo que el canal guarda de una persona (`companies/{cid}/personas/{id}`). */
export interface PersonaProjection {
  taxIdType: string;
  taxId: string;
  name: string;
  legalName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  isActive: boolean;
}

/** Lo que el canal guarda de un artículo (`companies/{cid}/products/{id}`). */
export interface ProductProjection {
  sku: string;
  name: string;
  /** Precio de venta SIN IVA (`salePrice` de FacturaEc). */
  salePrice: number;
  /** Porcentaje de IVA, p. ej. 15. */
  taxRate: number;
  taxRateCode: string;
  isActive: boolean;
  hasVariants: boolean;
}

export type MasterDataProjection = PersonaProjection | ProductProjection;

export interface MasterDataPayload {
  version: 1;
  kind: MasterDataKind;
  companyId: string;
  id: string;
  eventTime: string;
  deleted: boolean;
  data: MasterDataProjection | null;
}

type Doc = Record<string, unknown>;

function str(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function num(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value.trim().replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/**
 * La dirección de facturación: la primera con `isBilling`; si ninguna lo
 * tiene, la primera. Igual que `Customer.fromMap` de Conecta
 * (`lib/features/accounting/customers/customer.dart`).
 */
function billingAddress(doc: Doc): Doc | null {
  const list = Array.isArray(doc['addresses']) ? (doc['addresses'] as unknown[]) : [];
  let first: Doc | null = null;
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const address = item as Doc;
    first ??= address;
    if (address['isBilling'] === true) return address;
  }
  return first;
}

export function personaProjection(doc: Doc): PersonaProjection {
  const billing = billingAddress(doc);
  return {
    taxIdType: str(doc['taxIdType']),
    taxId: str(doc['taxId']),
    name: str(doc['name']),
    legalName: str(doc['legalName']),
    email: str(doc['email']),
    // En FacturaEc el teléfono principal es `phone1` (customer.interface.ts).
    phone: str(doc['phone1']),
    address: str(billing?.['address']),
    city: str(billing?.['city']),
    isActive: doc['isActive'] !== false,
  };
}

export function productProjection(doc: Doc): ProductProjection {
  return {
    sku: str(doc['sku']),
    name: str(doc['name']),
    salePrice: num(doc['salePrice']),
    taxRate: num(doc['taxRate']),
    taxRateCode: str(doc['taxRateCode']),
    isActive: doc['isActive'] !== false,
    hasVariants: doc['hasVariants'] === true,
  };
}

export function projectionOf(kind: MasterDataKind, doc: Doc): MasterDataProjection {
  return kind === 'persona' ? personaProjection(doc) : productProjection(doc);
}

/**
 * true si el canal tiene algo que enterarse: se creó, se borró o cambió algún
 * campo de la proyección. Un cambio solo de existencias, costo promedio,
 * `updatedAt`… no le interesa y no genera aviso.
 */
export function projectionChanged(
  kind: MasterDataKind,
  before: Doc | null,
  after: Doc | null,
): boolean {
  if (!before && !after) return false;
  if (!before || !after) return true;
  const a = projectionOf(kind, before) as unknown as Record<string, unknown>;
  const b = projectionOf(kind, after) as unknown as Record<string, unknown>;
  return Object.keys(a).some((key) => a[key] !== b[key]);
}

export function buildPayload(input: {
  kind: MasterDataKind;
  companyId: string;
  id: string;
  eventTime: string;
  before: Doc | null;
  after: Doc | null;
}): MasterDataPayload {
  const deleted = !input.after;
  return {
    version: 1,
    kind: input.kind,
    companyId: input.companyId,
    id: input.id,
    eventTime: input.eventTime,
    deleted,
    data: deleted ? null : projectionOf(input.kind, input.after as Doc),
  };
}
