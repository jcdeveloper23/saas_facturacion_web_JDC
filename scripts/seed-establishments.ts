/**
 * seed-establishments.ts — Registra la matriz de las empresas que no tienen
 * establecimientos.
 *
 * Las empresas creadas antes del módulo de Establecimientos no tienen ninguno.
 * Los generadores de XML no se rompen por eso —usan la dirección de
 * configuration/sri como respaldo—, pero la pantalla de Establecimientos las
 * mostraría vacías y no habría dónde agregar la segunda sucursal.
 *
 * Crea `establishments/{código}` con los datos SRI de la empresa, SOLO donde no
 * hay ninguno. Nunca toca una empresa que ya tiene establecimientos.
 *
 * Además registra el ítem del menú (`modules/settings_establishments`) si
 * falta. Solo ese: seed-modules.ts reescribe todo el catálogo con merge y
 * pisaría los ajustes hechos desde la pantalla Módulos del super admin.
 *
 * EJECUCIÓN, sin claves descargadas (con tu sesión de gcloud):
 *   gcloud auth application-default login
 *   npx ts-node scripts/seed-establishments.ts            # en seco
 *   npx ts-node scripts/seed-establishments.ts --apply    # escribe
 *
 * Es idempotente.
 */

import * as admin from 'firebase-admin';
import { buildMainEstablishment } from '../functions/src/utils/establishments';
import { MODULES_SEED } from '../src/app/core/seed/modules-seed';

const APPLY = process.argv.includes('--apply');
const PROJECT = process.env.GCLOUD_PROJECT || 'accounting-system-a5c9f';

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: PROJECT });
}
const db = admin.firestore();

async function main(): Promise<void> {
  console.log(APPLY ? `✍️  APLICAR sobre ${PROJECT}` : `🔍 EN SECO sobre ${PROJECT} (agrega --apply para escribir)`);
  // Ítem del menú: el sidebar de la empresa se arma desde /modules en Firestore.
  const mod = MODULES_SEED.find(m => m.code === 'settings_establishments');
  if (!mod) throw new Error('settings_establishments no está en MODULES_SEED');
  const modRef = db.collection('modules').doc(mod.code);
  if ((await modRef.get()).exists) {
    console.log('menú: modules/settings_establishments ya existe, no se toca');
  } else {
    console.log(`menú: ${APPLY ? 'se crea' : 'se crearía'} modules/settings_establishments`);
    if (APPLY) {
      const now = admin.firestore.Timestamp.now();
      await modRef.set({ ...mod, createdAt: now, updatedAt: now });
    }
  }

  const companies = await db.collection('companies').get();
  let already = 0;
  const pending: { id: string; name: string; code: string }[] = [];

  for (const c of companies.docs) {
    const existing = await c.ref.collection('establishments').limit(1).get();
    if (!existing.empty) { already++; continue; }

    const data = c.data();
    const sriCfg = (await c.ref.collection('configuration').doc('sri').get()).data() ?? {};
    const main = buildMainEstablishment({
      establishment: data.sri?.establishment,
      emissionPoint: data.sri?.emissionPoint,
      address:       sriCfg.direccionEstablecimiento || data.fiscalAddress,
      city:          data.city,
      phone:         data.phone,
      now:           admin.firestore.Timestamp.now(),
      createdBy:     'seed-establishments',
    });
    pending.push({ id: c.id, name: data.name ?? '', code: main.id });
    if (APPLY) await c.ref.collection('establishments').doc(main.id).set(main.data);
  }

  console.log(`\nempresas: ${companies.size} · ya tenían establecimientos: ${already} · ${APPLY ? 'matriz creada' : 'se les crearía la matriz'}: ${pending.length}`);
  for (const p of pending) console.log(`   · ${p.id}  ${p.name}  → ${p.code}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error('❌', e.message); process.exit(1); });
