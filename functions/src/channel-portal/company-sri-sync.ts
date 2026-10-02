/**
 * company-sri-sync.ts
 *
 * Los datos del emisor viven en DOS sitios: `companies/{id}` (con su `sri.*`) y
 * `companies/{id}/configuration/sri`, que es lo que leen los generadores del
 * XML y del RIDE (`obligadoContabilidad`, `razonSocial`…). `portalUpdateCompany`
 * solo actualizaba el primero, así que un cambio hecho desde el panel o desde
 * Conecta no llegaba al comprobante (2026-10-02: el CLUB DEPORTIVO … POTROS
 * encendió «Obligado a llevar contabilidad» y sus facturas seguían en «NO»).
 *
 * Esta función dice qué hay que escribir en `configuration/sri` a partir de los
 * cambios que llegaron, para hacerlo en el mismo batch.
 */

/** Los cambios de `configuration/sri` que corresponden a un payload de portalUpdateCompany. */
export function sriConfigChangesFor(
  cambios: Record<string, any>,
  sriNuevo: Record<string, any>,
): Record<string, any> {
  const out: Record<string, any> = {};
  const texto = (v: unknown) => (v == null ? '' : String(v).trim());

  if (sriNuevo['accountingRequired'] !== undefined) {
    out['obligadoContabilidad'] = sriNuevo['accountingRequired'] === true ? 'SI' : 'NO';
  }
  if (sriNuevo['businessName'] !== undefined && texto(sriNuevo['businessName'])) {
    out['razonSocial'] = texto(sriNuevo['businessName']);
  } else if (cambios['name'] !== undefined && texto(cambios['name'])) {
    out['razonSocial'] = texto(cambios['name']);
  }
  if (sriNuevo['tradeName'] !== undefined) out['nombreComercial'] = texto(sriNuevo['tradeName']);
  if (cambios['fiscalAddress'] !== undefined && texto(cambios['fiscalAddress'])) {
    out['direccionMatriz'] = texto(cambios['fiscalAddress']);
  }
  if (cambios['phone'] !== undefined) out['telefono'] = texto(cambios['phone']);
  if (cambios['email'] !== undefined) out['correo'] = texto(cambios['email']);
  if (sriNuevo['contribuyenteEspecial'] !== undefined) {
    out['contribuyenteEspecial'] = texto(sriNuevo['contribuyenteEspecial']);
  }
  return out;
}
