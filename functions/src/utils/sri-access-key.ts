/**
 * sri-access-key.ts
 *
 * Generación y validación de la clave de acceso SRI (49 dígitos).
 * Estructura (Ficha Técnica de Comprobantes Electrónicos):
 *
 *   fechaEmision(8, ddmmyyyy) + tipoComprobante(2) + ruc(13) + ambiente(1) +
 *   establecimiento(3) + puntoEmision(3) + secuencial(9) + codigoNumerico(8) +
 *   tipoEmision(1) = 48 dígitos + dígito verificador módulo 11 (1) = 49
 */

export interface AccessKeyParts {
  fechaEmision:    string; // ddmmyyyy (8)
  tipoComprobante: string; // 2 — '01' factura, '04' nota crédito, '05' nota débito, '07' retención
  ruc:             string; // 13
  ambiente:        string; // 1 — '1' pruebas, '2' producción
  establecimiento: string; // 3
  puntoEmision:    string; // 3
  secuencial:      string; // 9
  codigoNumerico:  string; // 8
  tipoEmision:     string; // 1 — '1' normal, '2' contingencia
}

export interface AccessKeyValidationError {
  code:    string;
  field:   string;
  message: string;
}

export interface AccessKeyValidationResult {
  valid:  boolean;
  errors: AccessKeyValidationError[];
}

const VALID_DOC_TYPES = ['01', '04', '05', '06', '07']; // factura, NC, ND, guía remisión, retención

/** Algoritmo módulo 11 SRI: pesos [2,3,4,5,6,7] cíclicos de derecha a izquierda. */
export function calculateModulo11(clave: string): number {
  const factores = [2, 3, 4, 5, 6, 7];
  let suma = 0;
  for (let i = clave.length - 1, f = 0; i >= 0; i--, f++) {
    suma += parseInt(clave[i], 10) * factores[f % 6];
  }
  const residuo = suma % 11;
  if (residuo === 0) return 0;
  if (residuo === 1) return 1;
  return 11 - residuo;
}

/** Construye la clave de acceso de 49 dígitos a partir de sus componentes. */
export function generateAccessKey(parts: AccessKeyParts): string {
  const clave48 =
    parts.fechaEmision + parts.tipoComprobante + parts.ruc + parts.ambiente +
    parts.establecimiento + parts.puntoEmision + parts.secuencial +
    parts.codigoNumerico + parts.tipoEmision;

  if (clave48.length !== 48) {
    throw new Error(`Clave de acceso mal construida: longitud ${clave48.length} (esperada 48). Partes: ${JSON.stringify(parts)}`);
  }
  return clave48 + String(calculateModulo11(clave48));
}

/**
 * Valida estructuralmente una clave de acceso de 49 dígitos: longitud, fecha,
 * tipo de documento, RUC, ambiente, establecimiento, punto de emisión,
 * secuencial, código numérico, tipo de emisión y dígito verificador.
 * NO valida contra el SRI (eso solo lo confirma el webservice) — valida que
 * la clave esté bien CONSTRUIDA antes de intentar firmarla/enviarla.
 */
export function validateAccessKey(accessKey: string): AccessKeyValidationResult {
  const errors: AccessKeyValidationError[] = [];

  if (typeof accessKey !== 'string' || !/^\d+$/.test(accessKey)) {
    return { valid: false, errors: [{ code: 'NON_NUMERIC', field: 'accessKey', message: 'La clave de acceso debe contener solo dígitos.' }] };
  }
  if (accessKey.length !== 49) {
    return { valid: false, errors: [{ code: 'INVALID_LENGTH', field: 'accessKey', message: `Longitud inválida: ${accessKey.length} (esperada 49).` }] };
  }

  const fecha           = accessKey.slice(0, 8);
  const tipoComprobante  = accessKey.slice(8, 10);
  const ruc              = accessKey.slice(10, 23);
  const ambiente          = accessKey.slice(23, 24);
  const establecimiento   = accessKey.slice(24, 27);
  const puntoEmision      = accessKey.slice(27, 30);
  const secuencial        = accessKey.slice(30, 39);
  const codigoNumerico    = accessKey.slice(39, 47);
  const tipoEmision       = accessKey.slice(47, 48);
  const dv                = accessKey.slice(48, 49);

  const dd   = parseInt(fecha.slice(0, 2), 10);
  const mm   = parseInt(fecha.slice(2, 4), 10);
  const yyyy = parseInt(fecha.slice(4, 8), 10);
  if (mm < 1 || mm > 12) {
    errors.push({ code: 'INVALID_DATE', field: 'fechaEmision', message: `Mes inválido en la fecha de la clave: ${fecha}` });
  } else {
    const daysInMonth = new Date(yyyy, mm, 0).getDate();
    if (dd < 1 || dd > daysInMonth) {
      errors.push({ code: 'INVALID_DATE', field: 'fechaEmision', message: `Día inválido en la fecha de la clave: ${fecha}` });
    }
  }
  if (yyyy < 2000 || yyyy > 2100) {
    errors.push({ code: 'INVALID_DATE', field: 'fechaEmision', message: `Año fuera de rango razonable: ${fecha}` });
  }

  if (!VALID_DOC_TYPES.includes(tipoComprobante)) {
    errors.push({ code: 'INVALID_DOC_TYPE', field: 'tipoComprobante', message: `Código de tipo de comprobante inválido: ${tipoComprobante}` });
  }

  if (!/^\d{13}$/.test(ruc) || ruc.startsWith('0000000000')) {
    errors.push({ code: 'INVALID_RUC', field: 'ruc', message: `RUC inválido en la clave: ${ruc}` });
  }

  if (!['1', '2'].includes(ambiente)) {
    errors.push({ code: 'INVALID_ENVIRONMENT', field: 'ambiente', message: `Ambiente inválido: ${ambiente} (esperado 1=Pruebas, 2=Producción)` });
  }

  if (!/^\d{3}$/.test(establecimiento) || establecimiento === '000') {
    errors.push({ code: 'INVALID_ESTABLISHMENT', field: 'establecimiento', message: `Establecimiento inválido: ${establecimiento}` });
  }
  if (!/^\d{3}$/.test(puntoEmision) || puntoEmision === '000') {
    errors.push({ code: 'INVALID_EMISSION_POINT', field: 'puntoEmision', message: `Punto de emisión inválido: ${puntoEmision}` });
  }
  if (!/^\d{9}$/.test(secuencial) || secuencial === '000000000') {
    errors.push({ code: 'INVALID_SEQUENCE', field: 'secuencial', message: `Secuencial inválido: ${secuencial}` });
  }
  if (!/^\d{8}$/.test(codigoNumerico)) {
    errors.push({ code: 'INVALID_NUMERIC_CODE', field: 'codigoNumerico', message: `Código numérico inválido: ${codigoNumerico}` });
  }
  if (!['1', '2'].includes(tipoEmision)) {
    errors.push({ code: 'INVALID_EMISSION_TYPE', field: 'tipoEmision', message: `Tipo de emisión inválido: ${tipoEmision} (esperado 1=Normal, 2=Contingencia)` });
  }

  const clave48    = accessKey.slice(0, 48);
  const expectedDv = calculateModulo11(clave48);
  if (String(expectedDv) !== dv) {
    errors.push({ code: 'INVALID_CHECK_DIGIT', field: 'digitoVerificador', message: `Dígito verificador inválido: esperado ${expectedDv}, recibido ${dv}` });
  }

  return { valid: errors.length === 0, errors };
}

/** Lanza si la clave no es válida — úsese como guardia antes de firmar/enviar. */
export function assertValidAccessKey(accessKey: string): void {
  const result = validateAccessKey(accessKey);
  if (!result.valid) {
    const detail = result.errors.map(e => `[${e.code}] ${e.message}`).join('; ');
    throw new Error(`Clave de acceso inválida, no se puede continuar: ${detail}`);
  }
}
