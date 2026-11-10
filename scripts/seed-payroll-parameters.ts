/**
 * seed-payroll-parameters.ts — Los parámetros legales de la nómina de 2026
 * (PLAN_NOMINA.md §4.1, §4.2, §4.3): `payrollParameters/2026_v1`.
 *
 * Sin este documento publicado, createPayrollRun responde «No hay parámetros
 * de nómina publicados y vigentes». Ningún porcentaje vive en el código: todo
 * sale de aquí, y cada rol aprobado guarda su copia (parametersSnapshot).
 *
 * Tres valores NO están confirmados (cerrados por criterio, pendientes de
 * Jessica Zari): IECE 0,5 %, SECAP 0,5 % (L1) y el divisor de la hora 240 (L3).
 * Por defecto van en null, como dice el plan §4.3, y con null el documento no
 * se puede publicar. Opciones:
 *
 *   (sin opciones)     EN SECO: muestra lo que escribiría, no escribe.
 *   --apply            escribe en BORRADOR (status 'draft'); no se usa para calcular.
 *   --with-criteria    llena los tres pendientes con el criterio del plan (0,5 / 0,5 / 240).
 *   --publish          publica (status 'published'). Exige que no quede ningún null.
 *
 * ⛔ Una versión publicada no se edita: si cambia un valor, se publica la v2
 * (--version 2, con --valid-from). El script se niega a tocar una publicada.
 *
 * EJECUCIÓN, sin claves descargadas (como seed-payroll-module.ts):
 *   gcloud auth application-default login
 *   functions/node_modules/.bin/tsc scripts/seed-payroll-parameters.ts --outDir /tmp/seed \
 *     --rootDir . --module commonjs --target es2020 --esModuleInterop --skipLibCheck
 *   NODE_PATH=functions/node_modules node /tmp/seed/scripts/seed-payroll-parameters.js                    # en seco
 *   NODE_PATH=functions/node_modules node /tmp/seed/scripts/seed-payroll-parameters.js --apply            # borrador
 *   NODE_PATH=functions/node_modules node /tmp/seed/scripts/seed-payroll-parameters.js --apply --with-criteria --publish
 *
 * Va DESPUÉS de desplegar las reglas de nómina (payrollParameters sin escritura del cliente).
 */

import * as admin from 'firebase-admin';
import { missingParameters } from '../functions/src/payroll/payroll-calc';
import { PayrollParameters } from '../functions/src/payroll/payroll-types';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const WITH_CRITERIA = args.includes('--with-criteria');
const PUBLISH = args.includes('--publish');
const arg = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const VERSION = Number(arg('--version') ?? 1);
const VALID_FROM = arg('--valid-from') ?? '2026-01-01';
const PROJECT = process.env.GCLOUD_PROJECT || 'accounting-system-a5c9f';

const MDT_2015_0087 = 'https://www.goberguayas.gob.ec/pdf/LOTAIP/Leyes/7-Acuerdo-MDT.pdf';
const CODIGO_TRABAJO = 'https://www.trabajo.gob.ec/wp-content/uploads/2024/01/CODIGO_DEL_TRABAJO-CT.pdf';
const CD_515 = 'https://www.iess.gob.ec/documents/10162/33703/C.D.+515';
const COMF = 'https://www.cosede.gob.ec/wp-content/uploads/2024/03/Codigo-Organico-Monetario-y-Financiero-2024.pdf';

/** §4.1 del plan, con su fuente. */
export function parameters2026(withCriteria: boolean): PayrollParameters & { sources: object[] } {
  return {
    year: 2026,
    version: VERSION,
    status: 'draft',
    validFrom: VALID_FROM,
    validTo: '2026-12-31',
    sbu: 482,
    iess: {
      personalPct: 9.45,
      employerPct: 11.15,
      // L1: por criterio, pendiente de Jessica Zari (planilla real).
      iecePct: withCriteria ? 0.5 : null,
      secapPct: withCriteria ? 0.5 : null,
    },
    reserveFund: { pct: 8.33 },
    thirteenth: { divisor: 12 },
    fourteenth: { divisor: 12 },
    overtime: {
      // L3: por criterio, pendiente de Jessica Zari.
      hoursDivisor: withCriteria ? 240 : null,
      supplementaryPct: 50,
      nightSupplementaryPct: 100,
      weekendPct: 100,
      nightShiftPct: 25,
      maxPerDay: 4,
      maxPerWeek: 12,
    },
    vacation: { baseDays: 15, divisor: 24 },
    advanceCapPct: 10,
    sources: [
      { param: 'sbu', reference: 'Acuerdo MDT-2025-195, R.O. Supl. 187, 18-dic-2025',
        url: 'https://procuraduria.utpl.edu.ec/NormativaExterna/ACUERDO%20MINISTERIAL%20MDT%202025%20195.pdf' },
      { param: 'iess.personalPct', reference: 'IESS, Res. C.D. 515, Anexo 5', url: CD_515 },
      { param: 'iess.employerPct', reference: 'IESS, Res. C.D. 515, Anexo 5', url: CD_515 },
      { param: 'iess.iecePct', reference: withCriteria ? 'COMF, Disp. Gen. Décima Primera — CRITERIO, pendiente de confirmar (L1)' : 'Pendiente (L1)', url: COMF },
      { param: 'iess.secapPct', reference: withCriteria ? 'COMF, Disp. Gen. Décima Primera — CRITERIO, pendiente de confirmar (L1)' : 'Pendiente (L1)', url: COMF },
      { param: 'reserveFund.pct', reference: 'R.O. 644-S, 29-jul-2009, Disp. Trans. Primera; Código del Trabajo, art. 196',
        url: 'https://derechoecuador.com/registro-oficial-no-644-miercoles-29-de-julio-de-2009-suplemento/' },
      { param: 'thirteenth.divisor', reference: 'Código del Trabajo, art. 111; MDT-2015-0087, art. 5', url: MDT_2015_0087 },
      { param: 'fourteenth.divisor', reference: 'Código del Trabajo, art. 113; MDT-2015-0087, art. 5', url: MDT_2015_0087 },
      { param: 'overtime.hoursDivisor', reference: withCriteria ? '30 días × 8 h — CRITERIO, pendiente de confirmar (L3)' : 'Pendiente (L3)', url: '' },
      { param: 'overtime.supplementaryPct', reference: 'Código del Trabajo, art. 55', url: CODIGO_TRABAJO },
      { param: 'overtime.nightSupplementaryPct', reference: 'Código del Trabajo, art. 55', url: CODIGO_TRABAJO },
      { param: 'overtime.weekendPct', reference: 'Código del Trabajo, art. 55.4', url: CODIGO_TRABAJO },
      { param: 'overtime.nightShiftPct', reference: 'Código del Trabajo, art. 49', url: CODIGO_TRABAJO },
      { param: 'overtime.maxPerDay', reference: 'Código del Trabajo, art. 55', url: CODIGO_TRABAJO },
      { param: 'overtime.maxPerWeek', reference: 'Código del Trabajo, art. 55', url: CODIGO_TRABAJO },
      { param: 'vacation.baseDays', reference: 'Código del Trabajo, art. 69', url: CODIGO_TRABAJO },
      { param: 'vacation.divisor', reference: 'Código del Trabajo, art. 71 (provisión 1/24, D-N7)', url: CODIGO_TRABAJO },
      { param: 'advanceCapPct', reference: 'Código del Trabajo, art. 90', url: CODIGO_TRABAJO },
    ],
  };
}

async function main(): Promise<void> {
  const doc = parameters2026(WITH_CRITERIA);
  const faltan = missingParameters(doc);
  if (PUBLISH && faltan.length) {
    throw new Error(`No se publica con valores vacíos: ${faltan.join(', ')}. Usa --with-criteria o espera a Jessica.`);
  }
  if (PUBLISH) doc.status = 'published';
  const id = `2026_v${VERSION}`;

  console.log(APPLY ? `✍️  APLICAR sobre ${PROJECT}` : `🔍 EN SECO sobre ${PROJECT} (agrega --apply para escribir)`);
  console.log(`payrollParameters/${id} · estado ${doc.status} · vigente ${doc.validFrom} a ${doc.validTo}`);
  console.log(faltan.length ? `   valores pendientes (null): ${faltan.join(', ')}` : '   sin valores pendientes');
  if (WITH_CRITERIA) console.log('   ⚠️ IECE, SECAP y divisor 240 van POR CRITERIO: confírmalos con Jessica Zari.');

  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: PROJECT });
  const ref = admin.firestore().doc(`payrollParameters/${id}`);
  const actual = await ref.get();
  if (actual.exists && actual.get('status') === 'published') {
    throw new Error(`payrollParameters/${id} ya está publicado: no se edita. Publica la versión siguiente (--version ${VERSION + 1}).`);
  }
  if (!APPLY) return;
  const now = admin.firestore.Timestamp.now();
  await ref.set({ ...doc, ...(actual.exists ? {} : { createdAt: now }), updatedAt: now,
    ...(PUBLISH ? { publishedAt: now } : {}) });
  console.log(`listo: ${actual.exists ? 'actualizado' : 'creado'} en ${doc.status}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error('❌', e.message); process.exit(1); });
