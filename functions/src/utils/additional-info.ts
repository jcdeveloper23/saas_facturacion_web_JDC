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
 *   3. el correo del comprador, si lo tiene y nadie lo puso ya.
 *
 * Reglas del SRI: como mucho 15 `campoAdicional`, y ninguno vacío —un campo
 * vacío hace que rechace el comprobante por estructura—. Antes el XML escribía
 * las plantillas aunque quedaran vacías, y el RIDE las imprimía sin rellenar.
 */

export interface AdditionalInfoField { nombre: string; valor: string; }

export const MAX_ADDITIONAL_INFO_FIELDS = 15;
export const MAX_ADDITIONAL_INFO_LENGTH = 300;

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

  const out: AdditionalInfoField[] = [];
  const add = (nombre: unknown, valor: unknown) => {
    const n = limpio(nombre);
    const v = limpio(valor);
    if (n && v && out.length < MAX_ADDITIONAL_INFO_FIELDS) out.push({ nombre: n, valor: v });
  };

  for (const f of opts.companyFields ?? []) add(f?.nombre, resolveTemplate(f?.valor ?? '', ctx));
  for (const f of opts.docFields ?? []) add(f?.nombre, f?.valor);

  const email = limpio(d.customerEmail);
  if (email.includes('@') && !out.some((f) => esCorreo(f.nombre))) add('Email', email);
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
  if (out.length + companyFieldCount > MAX_ADDITIONAL_INFO_FIELDS) {
    throw new Error(`El SRI admite como mucho ${MAX_ADDITIONAL_INFO_FIELDS} campos de información adicional` +
      (companyFieldCount ? ` (la empresa ya usa ${companyFieldCount}).` : '.'));
  }
  return out;
}
