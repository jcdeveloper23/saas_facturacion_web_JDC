/**
 * seed-channel.ts — Crea un canal y, opcionalmente, su super admin
 *
 * Un canal es un producto que vende FacturaEc bajo su marca (Conectate, Mi
 * Buseta). No es un tenant: los tenants son las empresas. Ver
 * docs/PLAN_CANALES_MULTIMARCA.md.
 *
 * Solo el super admin de plataforma crea canales, y por eso esto es un script
 * con credencial de servidor, no un callable.
 *
 * EJECUCIÓN:
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json \
 *     npx ts-node --esm scripts/seed-channel.ts conectate "Conectate" [correo@dominio.com]
 *
 *   # Emulador:
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 \
 *     npx ts-node scripts/seed-channel.ts conectate "Conectate"
 *
 * Si se pasa un correo, al usuario de ese correo se le ponen los claims
 * { role: 'channel_admin', channelId }. Tiene que cerrar sesión y volver a
 * entrar para que el token los tome.
 *
 * Es idempotente: re-ejecutarlo actualiza, no duplica.
 */

import * as admin from 'firebase-admin';

// ─── Inicialización ──────────────────────────────────────────────────────────

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// ─── Argumentos ──────────────────────────────────────────────────────────────

const [channelId, name, email] = process.argv.slice(2);

if (!channelId || !name) {
  console.error('Uso: seed-channel.ts <channelId> <nombre> [correo del super admin del canal]');
  console.error('Ej.:  seed-channel.ts conectate "Conectate" admin@conectate.ec');
  process.exit(1);
}

if (!/^[a-z][a-z0-9-]{1,39}$/.test(channelId)) {
  console.error(`channelId inválido: '${channelId}'. Minúsculas, dígitos y guiones, 2-40 caracteres.`);
  process.exit(1);
}

// ─── Ejecución ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const now = admin.firestore.Timestamp.now();

  await db.doc(`channels/${channelId}`).set(
    {
      name,
      status: 'active',
      contactEmail: email ?? '',
      updatedAt: now,
      createdAt: now,
    },
    { merge: true }
  );
  console.log(`✅ Canal '${channelId}' (${name}) creado o actualizado.`);

  if (!email) {
    console.log('ℹ️  Sin correo: no se asignó ningún super admin de canal.');
    return;
  }

  const user = await admin.auth().getUserByEmail(email);
  const claims = { ...(user.customClaims ?? {}), role: 'channel_admin', channelId };
  await admin.auth().setCustomUserClaims(user.uid, claims);

  console.log(`✅ ${email} (${user.uid}) es channel_admin de '${channelId}'.`);
  console.log('⚠️  Tiene que cerrar sesión y volver a entrar: el claim aparece al renovar el token.');
}

main().catch((err) => {
  console.error('❌ Error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
