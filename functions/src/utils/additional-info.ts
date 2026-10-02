/**
 * additional-info.ts
 *
 * La «Información adicional» de un comprobante (`<infoAdicional>` del XML y el
 * recuadro del RIDE), armada en un solo sitio para que el XML y el PDF de la
 * factura y de la nota de crédito digan siempre lo mismo.
 *
 * Sale de tres fuentes, en este orden:
 *   1. los campos fijos de la empresa (`configuration/sri.additionalInfoFields`),
 *      plantillas como `${customer.email}` que se rellenan con el comprobante;
 *   2. los del propio comprobante (`additionalInfo`), p. ej. la placa del
 *      vehículo en una factura a un conductor (2026-09-30);
 *   3. el correo del comprador, si lo tiene y nadie lo puso ya;
 *   4. el «RUC Proveedor» del sistema de facturación (utils/software-provider.ts),
 *      obligatorio en todo comprobante desde el 2026-09-26. Tiene un cupo
 *      reservado —nunca lo desplaza el tope de 15— y, si alguien lo escribió a
 *      mano en la empresa o en el comprobante, se reemplaza por el bueno.
 *
 * Reglas del SRI: como mucho 15 `campoAdicional`, y ninguno vacío —un campo
 * vacío hace que rechace el comprobante por estructura—. Antes el XML escribía
 * las plantillas aunque quedaran vacías, y el RIDE las imprimía sin rellenar.
 */

export interface AdditionalInfoField { nombre: string; valor: string; }

export const MAX_ADDITIONAL_INFO_FIELDS = 15;
export const MAX_ADDITIONAL_INFO_LENGTH = 300;
/** Cupos que no puede usar nadie más: el del «RUC Proveedor». */
export const RESERVED_ADDITIONAL_INFO_FIELDS = 1;

export const SOFTWARE_PROVIDER_FIELD_NAME = 'RUC Proveedor';
const esRucProveedor = (nombre: string) => /^ruc\s*(del\s*)?proveedor$/i.test(nombre.trim());

type Ctx = { invoice: Record<string, any>; customer: Record<string, any>; company: Record<string, any> };

/** `${invoice.x}`, `${customer.x}`, `${company.x}` → su valor, o vacío. */
export function resolveTemplate(template: string, ctx: Ctx): string {
  return String(template ?? '').replace(
    /\$\{(invoice|customer|company)\.(\w+)\}/g,
    (_, obj, key) => String(ctx[obj as keyof Ctx]?.[key] ?? ''),
  );
}

const limpio = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_ADDITIONAL_INFO_LENGTH);
const esCorreo = (nombre: string) => /mail|correo/i.test(nombre);

/** La lista final, lista para el XML y el RIDE. */
export function buildAdditionalInfo(opts: {
  companyFields?: AdditionalInfoField[] | null;
  docFields?: AdditionalInfoField[] | null;
  doc: Record<string, any>;
  company: { name?: string; ruc?: string };
  /** RUC del proveedor del sistema; sin él no se agrega (solo en pruebas). */
  providerRuc?: string | null;
}): AdditionalInfoField[] {
  const d = opts.doc;
  const ctx: Ctx = {
    invoice: d,
    customer: {
      name: d.customerName ?? '',
      taxId: d.customerTaxId ?? '',
      email: d.customerEmail ?? '',
      address: d.customerAddress ?? '',
      reference: d.customerReference ?? '',
    },
    company: { name: opts.company.name ?? '', ruc: opts.company.ruc ?? '' },
  };

  const providerRuc = limpio(opts.providerRuc);
  const tope = MAX_ADDITIONAL_INFO_FIELDS - (providerRuc ? RESERVED_ADDITIONAL_INFO_FIELDS : 0);
  const out: AdditionalInfoField[] = [];
  const add = (nombre: unknown, valor: unknown) => {
    const n = limpio(nombre);
    const v = limpio(valor);
    if (providerRuc && esRucProveedor(n)) return; // va al final, con el valor bueno
    if (n && v && out.length < tope) out.push({ nombre: n, valor: v });
  };

  for (const f of opts.companyFields ?? []) add(f?.nombre, resolveTemplate(f?.valor ?? '', ctx));
  for (const f of opts.docFields ?? []) add(f?.nombre, f?.valor);

  const email = limpio(d.customerEmail);
  if (email.includes('@') && !out.some((f) => esCorreo(f.nombre))) add('Email', email);
  if (providerRuc) out.push({ nombre: SOFTWARE_PROVIDER_FIELD_NAME, valor: providerRuc });
  return out;
}

/**
 * Valida lo que manda el cliente al emitir. Lanza con un mensaje para el
 * usuario; devuelve la lista limpia (sin filas vacías).
 */
export function validateAdditionalInfoInput(raw: unknown, companyFieldCount = 0): AdditionalInfoField[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) throw new Error('La información adicional debe ser una lista.');
  const out: AdditionalInfoField[] = [];
  for (const [i, f] of raw.entries()) {
    const nombre = String((f as any)?.nombre ?? '').trim();
    const valor = String((f as any)?.valor ?? '').trim();
    if (!nombre && !valor) continue; // fila vacía del formulario
    if (!nombre) throw new Error(`Información adicional, fila ${i + 1}: falta el nombre.`);
    if (!valor) throw new Error(`Información adicional, «${nombre}»: falta el valor.`);
    if (nombre.length > MAX_ADDITIONAL_INFO_LENGTH || valor.length > MAX_ADDITIONAL_INFO_LENGTH) {
      throw new Error(`Información adicional, «${nombre.slice(0, 40)}»: máximo ${MAX_ADDITIONAL_INFO_LENGTH} caracteres.`);
    }
    out.push({ nombre, valor });
  }
  const libres = MAX_ADDITIONAL_INFO_FIELDS - RESERVED_ADDITIONAL_INFO_FIELDS;
  if (out.length + companyFieldCount > libres) {
    throw new Error(`El SRI admite como mucho ${MAX_ADDITIONAL_INFO_FIELDS} campos de información adicional, ` +
      `y uno es el RUC del proveedor del sistema: quedan ${libres}` +
      (companyFieldCount ? ` (la empresa ya usa ${companyFieldCount}).` : '.'));
  }
  return out;
}
