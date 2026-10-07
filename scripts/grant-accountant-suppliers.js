/**
 * grant-accountant-suppliers.js — El contador da de alta proveedores
 * (2026-10-07).
 *
 * El contador registra compras pero solo podía VER proveedores. Desde este
 * cambio las reglas le dejan crear fichas de solo proveedor y sumarle a un
 * cliente el papel de proveedor (`accountantCreatesSupplier` /
 * `accountantUpdatesSupplier`), y `setupCompany` siembra el rol con
 * `suppliers.create` y `suppliers.edit`. Las empresas que ya existen guardan su
 * copia del rol en `companies/{cid}/roles/accountant`, que manda sobre la
 * matriz de la web: este script le suma esos dos permisos. No quita nada.
 *
 * EJECUCIÓN, sin claves descargadas (con tu sesión de gcloud):
 *   gcloud auth application-default login
 *   NODE_PATH=functions/node_modules node scripts/grant-accountant-suppliers.js           # en seco
 *   NODE_PATH=functions/node_modules node scripts/grant-accountant-suppliers.js --apply   # escribe
 *
 * Es idempotente. Va DESPUÉS de desplegar las reglas: sin ellas, la web le
 * mostraría el botón al contador y Firestore le diría que no.
 */

const admin = require('firebase-admin');

const APPLY = process.argv.includes('--apply');
const PROJECT = process.env.GCLOUD_PROJECT || 'accounting-system-a5c9f';
const NUEVOS = ['suppliers.create', 'suppliers.edit'];

admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: PROJECT });
const db = admin.firestore();

(async () => {
  const empresas = await db.collection('companies').get();
  console.log(`${empresas.size} empresas. ${APPLY ? 'ESCRIBIENDO' : 'En seco, no escribe.'}`);
  let cambian = 0;
  for (const c of empresas.docs) {
    const ref = c.ref.collection('roles').doc('accountant');
    const rol = await ref.get();
    const nombre = c.get('name') || c.get('razonSocial') || '';
    if (!rol.exists) {
      console.log(`  ${c.id} ${nombre}: sin roles/accountant (usa la matriz), nada que hacer`);
      continue;
    }
    const permisos = rol.get('permissions') || [];
    const faltan = NUEVOS.filter((p) => !permisos.includes(p));
    if (faltan.length === 0) {
      console.log(`  ${c.id} ${nombre}: ya los tiene`);
      continue;
    }
    cambian += 1;
    console.log(`  ${c.id} ${nombre}: + ${faltan.join(', ')}`);
    if (APPLY) {
      await ref.update({
        permissions: admin.firestore.FieldValue.arrayUnion(...faltan),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  }
  console.log(`\n${cambian} por actualizar.${APPLY ? ' Escrito.' : ' En seco: para escribir, --apply.'}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
