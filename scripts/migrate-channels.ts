/**
 * migrate-channels.ts — Estampa `channelId` en empresas y planes existentes (C5)
 *
 * Las empresas y los planes creados antes del modelo de canales no tienen
 * `channelId`. Las reglas y los callables niegan por defecto lo que no tiene
 * canal, así que hasta correr esto:
 *   - el super admin de plataforma los sigue viendo y operando,
 *   - ningún channel_admin los ve.
 *
 * Este script les pone el canal `directo` (o el que se indique) SOLO a los que
 * no tienen canal. Nunca cambia un canal ya estampado: mover una empresa de
 * canal es una decisión, no una migración.
 *
 * Ver docs/PLAN_CANALES_MULTIMARCA.md, C5.
 *
 * EJECUCIÓN:
 *   # Primero, siempre, en seco (no escribe nada):
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json \
 *     npx ts-node --esm scripts/migrate-channels.ts
 *
 *   # Aplicar:
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json \
 *     npx ts-node --esm scripts/migrate-channels.ts --apply
 *
 *   # Otro canal por defecto:
 *   ... scripts/migrate-channels.ts --apply --channel=conectate
 *
 *   # Emulador:
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 npx ts-node scripts/migrate-channels.ts --apply
 *
 * Es idempotente: una segunda corrida no encuentra nada que estampar.
 */

import * as admin from 'firebase-admin';

// ─── Inicialización ──────────────────────────────────────────────────────────

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// ─── Argumentos ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const channelArg = args.find(a => a.startsWith('--channel='));
const channelId = channelArg ? channelArg.split('=')[1] : 'directo';

if (!/^[a-z][a-z0-9-]{1,39}$/.test(channelId)) {
  console.error(`channelId inválido: '${channelId}'. Minúsculas, dígitos y guiones, 2-40 caracteres.`);
  process.exit(1);
}

const COLLECTIONS = ['companies', 'plans'] as const;
const BATCH_SIZE = 400; // límite de Firestore: 500 operaciones por batch

// ─── Ejecución ───────────────────────────────────────────────────────────────

function hasChannel(data: admin.firestore.DocumentData): boolean {
  return typeof data['channelId'] === 'string' && data['channelId'] !== '';
}

async function stampCollection(name: string): Promise<{ total: number; pending: number; byChannel: Record<string, number> }> {
  const snap = await db.collection(name).get();
  const byChannel: Record<string, number> = {};
  const pending: admin.firestore.DocumentReference[] = [];

  for (const doc of snap.docs) {
    const data = doc.data();
    if (hasChannel(data)) {
      byChannel[data['channelId']] = (byChannel[data['channelId']] ?? 0) + 1;
    } else {
      pending.push(doc.ref);
    }
  }

  if (apply) {
    const now = admin.firestore.Timestamp.now();
    for (let i = 0; i < pending.length; i += BATCH_SIZE) {
      const batch = db.batch();
      for (const ref of pending.slice(i, i + BATCH_SIZE)) {
        batch.update(ref, { channelId, updatedAt: now });
      }
      await batch.commit();
    }
  }

  return { total: snap.size, pending: pending.length, byChannel };
}

async function main(): Promise<void> {
  console.log(apply
    ? `✍️  Modo APLICAR — se estampará channelId '${channelId}'.`
    : `🔍 Modo EN SECO — no se escribe nada. Agrega --apply para aplicar.`);

  // Aviso, no bloqueo: se puede migrar antes de dar de alta el canal.
  const channelSnap = await db.doc(`channels/${channelId}`).get();
  if (!channelSnap.exists) {
    console.warn(`⚠️  El canal '${channelId}' todavía no existe en channels/. Créalo en /super-admin/channels o con seed-channel.ts.`);
  }

  for (const name of COLLECTIONS) {
    const r = await stampCollection(name);
    const already = Object.entries(r.byChannel).map(([k, v]) => `${k}: ${v}`).join(', ') || 'ninguno';
    console.log(`\n📁 ${name} — ${r.total} documentos`);
    console.log(`   con canal:  ${already}`);
    console.log(`   sin canal:  ${r.pending}${apply ? ` → estampados con '${channelId}'` : ' (se estamparían)'}`);
  }

  console.log(apply ? '\n✅ Listo. Una segunda corrida no debería encontrar nada sin canal.' : '\nℹ️  Nada escrito.');
}

main().catch((err) => {
  console.error('❌ Error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
