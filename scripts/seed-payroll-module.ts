/**
 * seed-payroll-module.ts — Registra el módulo `payroll` y el paquete `pkg_hr`
 * (PLAN_NOMINA.md §6.4, E2), SOLO si faltan.
 *
 * ⛔ No se usa seed-modules.ts ni seed-plans.ts: reescriben todo el catálogo
 * con merge y pisarían los ajustes hechos desde las pantallas del super admin.
 * Este script crea únicamente:
 *   /modules/payroll           (de MODULES_SEED)
 *   /plugin-packages/pkg_hr    (de PLUGIN_PACKAGES_SEED)
 * Si ya existen, no los toca.
 *
 * No enciende el paquete en ninguna empresa: eso es portalSetAddon, empresa
 * por empresa, cuando el super admin o el canal lo decidan.
 *
 * EJECUCIÓN, sin claves descargadas (como seed-establishments.ts):
 *   gcloud auth application-default login
 *   functions/node_modules/.bin/tsc scripts/seed-payroll-module.ts --outDir /tmp/seed \
 *     --rootDir . --module commonjs --target es2020 --esModuleInterop --skipLibCheck
 *   NODE_PATH=functions/node_modules node /tmp/seed/scripts/seed-payroll-module.js           # en seco
 *   NODE_PATH=functions/node_modules node /tmp/seed/scripts/seed-payroll-module.js --apply   # escribe
 *
 * Va DESPUÉS de desplegar las reglas de nómina. Es idempotente.
 */

import * as admin from 'firebase-admin';
import { MODULES_SEED } from '../src/app/core/seed/modules-seed';
import { PLUGIN_PACKAGES_SEED } from '../src/app/core/seed/plugin-packages-seed';

const APPLY = process.argv.includes('--apply');
const PROJECT = process.env.GCLOUD_PROJECT || 'accounting-system-a5c9f';

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: PROJECT });
}
const db = admin.firestore();

async function crearSiFalta(coleccion: string, id: string, datos: object): Promise<void> {
  const ref = db.collection(coleccion).doc(id);
  if ((await ref.get()).exists) {
    console.log(`${coleccion}/${id}: ya existe, no se toca`);
    return;
  }
  console.log(`${coleccion}/${id}: ${APPLY ? 'se crea' : 'se crearía'}`);
  if (APPLY) {
    const now = admin.firestore.Timestamp.now();
    await ref.set({ ...datos, createdAt: now, updatedAt: now });
  }
}

async function main(): Promise<void> {
  console.log(APPLY ? `✍️  APLICAR sobre ${PROJECT}` : `🔍 EN SECO sobre ${PROJECT} (agrega --apply para escribir)`);

  const modulo = MODULES_SEED.find(m => m.code === 'payroll');
  if (!modulo) throw new Error('payroll no está en MODULES_SEED');
  const paquete = PLUGIN_PACKAGES_SEED.find(p => p.code === 'pkg_hr');
  if (!paquete) throw new Error('pkg_hr no está en PLUGIN_PACKAGES_SEED');

  await crearSiFalta('modules', modulo.code, modulo);
  await crearSiFalta('plugin-packages', paquete.code, paquete);
}

main().then(() => process.exit(0)).catch((e) => { console.error('❌', e.message); process.exit(1); });
