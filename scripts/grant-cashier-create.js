/**
 * grant-cashier-create.js — El cajero crea clientes, proveedores y artículos
 * (2026-10-08).
 *
 * Hasta hoy el cajero solo VEÍA clientes y artículos. Desde este cambio las
 * reglas le dejan CREAR personas (clientes y proveedores) y artículos sin
 * existencias de entrada (`stockQty == 0`), pero no editar ni borrar los que
 * ya existen. `setupCompany` siembra el rol con esos permisos; las empresas que
 * ya existen guardan su copia en `companies/{cid}/roles/cashier`, que MANDA
 * sobre la matriz de la web: este script le suma los permisos de crear. No
 * quita nada.
 *
 * EJECUCIÓN, sin claves descargadas (con tu sesión de gcloud):
 *   gcloud auth application-default login
 *   NODE_PATH=functions/node_modules node scripts/grant-cashier-create.js           # en seco
 *   NODE_PATH=functions/node_modules node scripts/grant-cashier-create.js --apply   # escribe
 *
 * Es idempotente. Va DESPUÉS de desplegar las reglas: sin ellas, la web le
 * mostraría el botón al cajero y Firestore le diría que no.
 */

const admin = require('firebase-admin');

const APPLY = process.argv.includes('--apply');
const PROJECT = process.env.GCLOUD_PROJECT || 'accounting-system-a5c9f';
const NUEVOS = [
  'customers.view', 'customers.create',
  'suppliers.view', 'suppliers.create',
  'personas.view', 'personas.create',
  'products.view', 'products.create',
];

admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: PROJECT });
const db = admin.firestore();

(async () => {
  const empresas = await db.collection('companies').get();
  console.log(`${empresas.size} empresas. ${APPLY ? 'ESCRIBIENDO' : 'En seco, no escribe.'}`);
  let cambian = 0;
  for (const c of empresas.docs) {
    const ref = c.ref.collection('roles').doc('cashier');
    const rol = await ref.get();
    const nombre = c.get('name') || c.get('razonSocial') || '';
    if (!rol.exists) {
      console.log(`  ${c.id} ${nombre}: sin roles/cashier (usa la matriz), nada que hacer`);
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
