/**
 * grant-payroll-permissions.js — Nómina para admin y contador (PLAN_NOMINA.md
 * §6.4, E2).
 *
 * El módulo `payroll` lo ven solo el administrador y el contador (D-N2). Las
 * empresas nuevas lo reciben de `setupCompany` (COMPANY_DEFAULT_ROLES); las que
 * ya existen guardan su copia del rol, que manda sobre la matriz de la web, y
 * este script le suma los permisos. No quita nada:
 *
 *   /roles/admin                         (rol de plataforma del admin de empresa)
 *     + payroll.view, payroll.create, payroll.edit, payroll.delete
 *   companies/{cid}/roles/admin          (si la empresa tiene su propia copia)
 *     + lo mismo
 *   companies/{cid}/roles/accountant
 *     + payroll.view, payroll.create, payroll.edit
 *
 * A propósito NO toca super_admin, channel_admin, seller, cashier ni read_only.
 *
 * EJECUCIÓN, sin claves descargadas (con tu sesión de gcloud):
 *   gcloud auth application-default login
 *   NODE_PATH=functions/node_modules node scripts/grant-payroll-permissions.js           # en seco
 *   NODE_PATH=functions/node_modules node scripts/grant-payroll-permissions.js --apply   # escribe
 *
 * Es idempotente. Va DESPUÉS de desplegar las reglas de nómina: sin ellas, la
 * pantalla se mostraría y Firestore respondería con la regla por defecto.
 */

const admin = require('firebase-admin');

const APPLY = process.argv.includes('--apply');
const PROJECT = process.env.GCLOUD_PROJECT || 'accounting-system-a5c9f';
const ADMIN = ['payroll.view', 'payroll.create', 'payroll.edit', 'payroll.delete'];
const CONTADOR = ['payroll.view', 'payroll.create', 'payroll.edit'];

admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: PROJECT });
const db = admin.firestore();

/** Suma [nuevos] a `permissions` del documento si existe. Devuelve true si cambia. */
async function sumar(ref, nuevos, etiqueta) {
  const rol = await ref.get();
  if (!rol.exists) {
    console.log(`  ${etiqueta}: no existe (usa la matriz), nada que hacer`);
    return false;
  }
  const permisos = rol.get('permissions') || [];
  const faltan = nuevos.filter((p) => !permisos.includes(p));
  if (faltan.length === 0) {
    console.log(`  ${etiqueta}: ya los tiene`);
    return false;
  }
  console.log(`  ${etiqueta}: + ${faltan.join(', ')}`);
  if (APPLY) {
    await ref.update({
      permissions: admin.firestore.FieldValue.arrayUnion(...faltan),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
  return true;
}

(async () => {
  console.log(`${APPLY ? 'ESCRIBIENDO' : 'En seco, no escribe.'} Proyecto ${PROJECT}.`);
  let cambian = 0;
  if (await sumar(db.collection('roles').doc('admin'), ADMIN, '/roles/admin')) cambian += 1;

  const empresas = await db.collection('companies').get();
  console.log(`\n${empresas.size} empresas.`);
  for (const c of empresas.docs) {
    const nombre = c.get('name') || c.get('razonSocial') || '';
    if (await sumar(c.ref.collection('roles').doc('admin'), ADMIN, `${c.id} ${nombre} · admin`)) cambian += 1;
    if (await sumar(c.ref.collection('roles').doc('accountant'), CONTADOR, `${c.id} ${nombre} · accountant`)) {
      cambian += 1;
    }
  }
  console.log(`\n${cambian} rol(es) por actualizar.${APPLY ? ' Escrito.' : ' En seco: para escribir, --apply.'}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
