/**
 * reassign-channel-admin.js — Cambia el administrador del canal Conecta y deja
 * al dueño de Weconnect Corp. como usuario normal de su empresa (2026-10-14).
 *
 * El caso: `juandiegocontrerass@gmail.com` tenía en este proyecto una cuenta de
 * administrador del canal `conecta-app` (creada el 2026-09-16, nunca usada). Es
 * también el dueño del grupo «Weconnect Corp.» en Conecta, y al abrir
 * Contabilidad `connectAccounting` → `createCompanyUser` falla con
 * «Ya existe un usuario con ese correo»: a propósito, no se adopta por correo
 * una cuenta que no pertenece a la empresa, y una cuenta lleva un solo rol.
 *
 * Decisión del usuario (2026-10-14): un correo de conectate.us administra el
 * canal y Juan Diego queda como un usuario más.
 *
 * Qué hace con --apply (lo mismo que `manageChannelAdmin` grant/revoke, más el
 * alta como miembro de la empresa):
 *   1. Correo nuevo (por defecto canal@conectate.us): lo crea en Auth SIN
 *      contraseña si no existe (la define él con «¿Olvidaste tu contraseña?»),
 *      le pone { role: 'channel_admin', channelId } y lo anota en
 *      channels/{canal}.admins.
 *   2. Juan Diego: le quita role/channelId de los claims y lo saca de admins.
 *   3. Lo deja como miembro `admin` de su empresa
 *      (companies/{cid}/company-users/{uid}, federated: true).
 *   4. NO crea el vínculo ni toca Conecta: la próxima vez que abra
 *      Contabilidad, `connectAccounting` (reintenta porque identity.status es
 *      'error') llama a `createCompanyUser`, que ahora SÍ reutiliza su cuenta
 *      (ya pertenece a la empresa), le pone { companyId, role: 'admin' } y
 *      escribe identity-links/work-cloud:{uid de Conecta}. Así el vínculo lo hace
 *      el mismo código que el de cualquier otro dueño.
 *
 * EJECUCIÓN, sin claves descargadas (gcloud auth application-default login):
 *   NODE_PATH=functions/node_modules node scripts/reassign-channel-admin.js
 *       [--email canal@conectate.us]                         # en seco (por defecto)
 *   ... --apply  --state /ruta/fuera/del/repo/estado.json     # escribe y guarda el antes
 *   ... --revert --state /ruta/fuera/del/repo/estado.json     # deja todo como estaba
 *
 * Lee también el proyecto de Conecta (work-cloud-df68a); solo escribe en él al
 * revertir (devuelve config/accounting.identity a su valor previo).
 */

const fs = require('fs');
const admin = require('firebase-admin');

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};

const APPLY = flag('--apply');
const REVERT = flag('--revert');
const STATE = value('--state', null);
const NEW_EMAIL = value('--email', 'canal@conectate.us').trim().toLowerCase();

const FACTURAEC = 'accounting-system-a5c9f';
const CONECTA = 'work-cloud-df68a';
const CHANNEL_ID = 'conecta-app';
const OLD_UID = 'Nc2zObvKSmcsnS08biZkYRKPPie2';
const OLD_EMAIL = 'juandiegocontrerass@gmail.com';
const COMPANY_ID = 'e8k51sjqfLRjIRKYZSye';
const GROUP_ID = 'gDo397nEN60KBKRkVP1F';
const IDENTITY_ORIGIN = 'work-cloud';
const ACTOR = 'script:reassign-channel-admin';

if (APPLY && REVERT) fail('--apply y --revert no van juntos.');
if ((APPLY || REVERT) && !STATE) fail('--apply y --revert piden --state <archivo fuera del repo>.');
if (STATE && require('path').resolve(STATE).startsWith(process.cwd())) {
  fail('El archivo de estado va FUERA del repositorio.');
}

const cred = admin.credential.applicationDefault();
const fe = admin.initializeApp({ credential: cred, projectId: FACTURAEC }, 'facturaec');
const cn = admin.initializeApp({ credential: cred, projectId: CONECTA }, 'conecta');
const feDb = fe.firestore();
const feAuth = fe.auth();
const cnDb = cn.firestore();
const { FieldValue, Timestamp } = admin.firestore;

function fail(msg) {
  console.error(`✖ ${msg}`);
  process.exit(1);
}

function show(label, before, after) {
  const b = JSON.stringify(before ?? null);
  const a = JSON.stringify(after ?? null);
  console.log(`  ${label}\n    antes:   ${b}\n    después: ${b === a ? '(sin cambio)' : a}`);
}

async function userByEmail(email) {
  try {
    return await feAuth.getUserByEmail(email);
  } catch (err) {
    if (err.code === 'auth/user-not-found') return null;
    throw err;
  }
}

function plain(v) {
  // Timestamps → ISO, para poder guardarlos y compararlos.
  return JSON.parse(JSON.stringify(v ?? null, (k, x) =>
    x && typeof x === 'object' && typeof x._seconds === 'number'
      ? { __ts: new Date(x._seconds * 1000 + Math.round((x._nanoseconds || 0) / 1e6)).toISOString() }
      : x));
}

function unplain(v) {
  return JSON.parse(JSON.stringify(v ?? null), (k, x) =>
    x && typeof x === 'object' && typeof x.__ts === 'string' ? Timestamp.fromDate(new Date(x.__ts)) : x);
}

async function readState() {
  const channelRef = feDb.doc(`channels/${CHANNEL_ID}`);
  const [channel, oldUser, newUser, company, member, group, accounting] = await Promise.all([
    channelRef.get(),
    feAuth.getUser(OLD_UID),
    userByEmail(NEW_EMAIL),
    feDb.doc(`companies/${COMPANY_ID}`).get(),
    feDb.doc(`companies/${COMPANY_ID}/company-users/${OLD_UID}`).get(),
    cnDb.doc(`groups/${GROUP_ID}`).get(),
    cnDb.doc(`groups/${GROUP_ID}/config/accounting`).get(),
  ]);
  const ownerUid = `${group.get('ownerId') || ''}`;
  const [owner, ownerAccUser, link] = await Promise.all([
    ownerUid ? cnDb.doc(`users/${ownerUid}`).get() : null,
    ownerUid ? cnDb.doc(`groups/${GROUP_ID}/accountingUsers/${ownerUid}`).get() : null,
    ownerUid ? feDb.doc(`identity-links/${IDENTITY_ORIGIN}:${ownerUid}`).get() : null,
  ]);
  const admins = channel.get('admins') || {};
  return {
    channelExists: channel.exists,
    oldUser: { uid: oldUser.uid, email: oldUser.email, claims: oldUser.customClaims || {},
      lastLogin: oldUser.metadata.lastSignInTime || null, providers: oldUser.providerData.map((p) => p.providerId) },
    oldAdminEntry: admins[OLD_UID] ? plain(admins[OLD_UID]) : null,
    newUser: newUser ? { uid: newUser.uid, email: newUser.email, claims: newUser.customClaims || {} } : null,
    newAdminEntry: newUser && admins[newUser.uid] ? plain(admins[newUser.uid]) : null,
    otherAdmins: Object.keys(admins).filter((u) => u !== OLD_UID && (!newUser || u !== newUser.uid))
      .map((u) => `${u} ${admins[u].email || ''}`),
    company: company.exists ? { channelId: company.get('channelId') || null,
      name: company.get('name') || company.get('razonSocial') || '' } : null,
    member: member.exists ? plain(member.data()) : null,
    conecta: {
      ownerUid,
      ownerEmail: owner && owner.exists ? `${owner.get('email') || ''}`.trim().toLowerCase() : null,
      ownerName: owner && owner.exists ? `${owner.get('first_name') || ''}`.trim() : null,
      accountingCompanyId: accounting.get('companyId') || null,
      accountingEstado: accounting.get('estado') || null,
      identity: plain(accounting.get('identity') || null),
      ownerAccountingUser: ownerAccUser && ownerAccUser.exists ? plain(ownerAccUser.data()) : null,
    },
    link: link && link.exists ? plain(link.data()) : null,
  };
}

function checks(s) {
  const problems = [];
  const warnings = [];
  if (!s.channelExists) problems.push(`No existe channels/${CHANNEL_ID}.`);
  if (s.oldUser.email !== OLD_EMAIL) problems.push(`El uid ${OLD_UID} no es ${OLD_EMAIL}.`);
  if (s.oldUser.claims.role === 'super_admin') problems.push('La cuenta vieja es super_admin: no se toca.');
  if (!s.company) problems.push(`No existe companies/${COMPANY_ID}.`);
  else if (s.company.channelId !== CHANNEL_ID) problems.push(`La empresa no es del canal ${CHANNEL_ID}.`);
  if (s.conecta.accountingCompanyId !== COMPANY_ID) problems.push('El grupo de Conecta no apunta a esa empresa.');
  if (!s.conecta.ownerUid) problems.push('El grupo no tiene ownerId.');
  if (s.conecta.ownerEmail !== OLD_EMAIL) {
    problems.push(`El dueño en Conecta tiene correo ${s.conecta.ownerEmail}, no ${OLD_EMAIL}: ` +
      'createCompanyUser no reutilizaría la cuenta vieja. Revisar antes de seguir.');
  }
  if (s.newUser && s.newUser.claims.role === 'super_admin') problems.push(`${NEW_EMAIL} es super_admin.`);
  if (s.newUser && s.newUser.claims.role === 'channel_admin' && s.newUser.claims.channelId !== CHANNEL_ID) {
    problems.push(`${NEW_EMAIL} ya administra otro canal (${s.newUser.claims.channelId}).`);
  }
  if (s.newUser && s.newUser.claims.companyId) {
    warnings.push(`${NEW_EMAIL} es usuario de la empresa ${s.newUser.claims.companyId}: dejará de serlo en el token.`);
  }
  if (s.link && s.link.saasUid !== OLD_UID) {
    problems.push(`identity-links ya apunta a otro usuario (${s.link.saasUid}).`);
  }
  if (s.member && s.member.platformRole !== 'admin') {
    warnings.push(`Ya es miembro de la empresa con rol ${s.member.platformRole}: no se cambia.`);
  }
  if (s.oldUser.lastLogin) warnings.push(`La cuenta vieja SÍ inició sesión (${s.oldUser.lastLogin}).`);
  return { problems, warnings };
}

async function planAndApply(s) {
  console.log(`\n${APPLY ? 'ESCRIBIENDO' : 'EN SECO — no escribe nada'}. Correo nuevo del canal: ${NEW_EMAIL}\n`);

  // 1. Admin nuevo del canal.
  const newClaimsBefore = s.newUser ? s.newUser.claims : null;
  const newClaimsAfter = { ...(newClaimsBefore || {}) };
  delete newClaimsAfter.companyId;
  newClaimsAfter.role = 'channel_admin';
  newClaimsAfter.channelId = CHANNEL_ID;
  console.log(`1. ${NEW_EMAIL} → administrador del canal ${CHANNEL_ID}`);
  console.log(`  usuario de Auth: ${s.newUser ? `existe (${s.newUser.uid})` : 'NO existe: se crea sin contraseña'}`);
  show('claims', newClaimsBefore, newClaimsAfter);
  show(`channels/${CHANNEL_ID}.admins.<uid nuevo>`, s.newAdminEntry,
    { email: NEW_EMAIL, grantedAt: '(ahora)', grantedBy: ACTOR });

  // 2. Juan Diego deja el canal.
  const oldClaimsAfter = { ...s.oldUser.claims };
  if (oldClaimsAfter.role === 'channel_admin' && oldClaimsAfter.channelId === CHANNEL_ID) {
    delete oldClaimsAfter.role;
    delete oldClaimsAfter.channelId;
  }
  console.log(`\n2. ${OLD_EMAIL} deja de administrar el canal`);
  show('claims', s.oldUser.claims, oldClaimsAfter);
  show(`channels/${CHANNEL_ID}.admins.${OLD_UID}`, s.oldAdminEntry, null);

  // 3. Miembro admin de la empresa.
  const displayName = s.conecta.ownerName || OLD_EMAIL;
  const memberAfter = s.member || {
    uid: OLD_UID, email: OLD_EMAIL, displayName, platformRole: 'admin', isActive: true,
    federated: true, createdAt: '(ahora)', updatedAt: '(ahora)', createdBy: ACTOR,
  };
  console.log(`\n3. Miembro de ${s.company ? s.company.name : COMPANY_ID}`);
  show(`companies/${COMPANY_ID}/company-users/${OLD_UID}`, s.member, memberAfter);

  console.log('\n4. Lo completa connectAccounting al abrir Contabilidad (no se escribe ahora):');
  console.log(`  identity-links/${IDENTITY_ORIGIN}:${s.conecta.ownerUid}: ${s.link ? JSON.stringify(s.link) : 'no existe → lo crea createCompanyUser'}`);
  console.log(`  claims finales de ${OLD_EMAIL}: {"companyId":"${COMPANY_ID}","role":"admin"} (los pone createCompanyUser)`);
  console.log(`  Conecta config/accounting.identity hoy: ${JSON.stringify(s.conecta.identity)} → pasará a status "linked"`);
  console.log(`  Conecta accountingUsers/${s.conecta.ownerUid}: ${JSON.stringify(s.conecta.ownerAccountingUser)} (no hace falta: el dueño entra por ser dueño)`);
  console.log(`  Otros admins del canal que se quedan: ${s.otherAdmins.join(', ') || 'ninguno'}`);

  if (!APPLY) return;

  fs.writeFileSync(STATE, JSON.stringify({ savedAt: new Date().toISOString(), newEmail: NEW_EMAIL, state: s }, null, 2));
  console.log(`\nEstado previo guardado en ${STATE}`);

  const channelRef = feDb.doc(`channels/${CHANNEL_ID}`);
  let newUid = s.newUser && s.newUser.uid;
  let created = false;
  if (!newUid) {
    const u = await feAuth.createUser({ email: NEW_EMAIL, emailVerified: false });
    newUid = u.uid;
    created = true;
    console.log(`✔ creado ${NEW_EMAIL} (${newUid})`);
  }
  // Se anota en el estado si el usuario lo creó este script: el revert lo borra.
  const saved = JSON.parse(fs.readFileSync(STATE, 'utf8'));
  saved.createdNewUid = created ? newUid : null;
  saved.newUid = newUid;
  fs.writeFileSync(STATE, JSON.stringify(saved, null, 2));

  await feAuth.setCustomUserClaims(newUid, newClaimsAfter);
  await feAuth.setCustomUserClaims(OLD_UID, oldClaimsAfter);
  await channelRef.update({
    [`admins.${newUid}`]: { email: NEW_EMAIL, grantedAt: Timestamp.now(), grantedBy: ACTOR },
    [`admins.${OLD_UID}`]: FieldValue.delete(),
    updatedAt: Timestamp.now(),
  });
  console.log('✔ claims y admins del canal');
  if (!s.member) {
    const now = Timestamp.now();
    await feDb.doc(`companies/${COMPANY_ID}/company-users/${OLD_UID}`).set({
      uid: OLD_UID, email: OLD_EMAIL, displayName, platformRole: 'admin', isActive: true,
      federated: true, createdAt: now, updatedAt: now, createdBy: ACTOR,
    });
    console.log('✔ miembro admin de la empresa');
  }
  console.log(`\nListo. Siguientes pasos:
  - ${NEW_EMAIL} define su contraseña en la web de FacturaEc con «¿Olvidaste tu contraseña?» (el buzón tiene que existir).
  - Juan Diego abre Contabilidad desde Conecta en el grupo Weconnect Corp.: ahí se completa el vínculo.`);
}

async function revert() {
  const saved = JSON.parse(fs.readFileSync(STATE, 'utf8'));
  const s = saved.state;
  console.log(`REVIRTIENDO con el estado del ${saved.savedAt}`);
  const channelRef = feDb.doc(`channels/${CHANNEL_ID}`);
  const updates = { updatedAt: Timestamp.now() };

  // Juan Diego: claims y entrada de admins como estaban.
  await feAuth.setCustomUserClaims(OLD_UID, s.oldUser.claims);
  updates[`admins.${OLD_UID}`] = s.oldAdminEntry ? unplain(s.oldAdminEntry) : FieldValue.delete();
  console.log(`✔ claims de ${OLD_EMAIL}: ${JSON.stringify(s.oldUser.claims)}`);

  // Correo nuevo: si lo creó el script, se borra; si no, claims como estaban.
  if (saved.newUid) {
    updates[`admins.${saved.newUid}`] = s.newAdminEntry ? unplain(s.newAdminEntry) : FieldValue.delete();
    if (saved.createdNewUid) {
      await feAuth.deleteUser(saved.createdNewUid);
      console.log(`✔ borrado ${saved.newEmail} (${saved.createdNewUid}), lo había creado el script`);
    } else {
      await feAuth.setCustomUserClaims(saved.newUid, s.newUser.claims);
      console.log(`✔ claims de ${saved.newEmail}: ${JSON.stringify(s.newUser.claims)}`);
    }
  }
  await channelRef.update(updates);
  console.log('✔ admins del canal');

  // Miembro de la empresa: solo si lo creó el script.
  if (!s.member) {
    await feDb.doc(`companies/${COMPANY_ID}/company-users/${OLD_UID}`).delete();
    console.log('✔ quitado de company-users');
  }

  // Lo que haya hecho connectAccounting después.
  const linkRef = feDb.doc(`identity-links/${IDENTITY_ORIGIN}:${s.conecta.ownerUid}`);
  if (!s.link && (await linkRef.get()).exists) {
    await linkRef.delete();
    console.log(`✔ borrado ${linkRef.path}`);
  }
  await cnDb.doc(`groups/${GROUP_ID}/config/accounting`).set(
    { identity: s.conecta.identity ? unplain(s.conecta.identity) : FieldValue.delete() }, { merge: true });
  console.log('✔ Conecta config/accounting.identity como estaba');
  console.log('Hecho. Para que un token ya emitido pierda los claims nuevos hay que cerrar sesión.');
}

(async () => {
  if (REVERT) return revert();
  const s = await readState();
  const { problems, warnings } = checks(s);
  console.log('Estado actual');
  console.log(`  cuenta vieja: ${JSON.stringify(s.oldUser)}`);
  console.log(`  dueño en Conecta: ${s.conecta.ownerUid} ${s.conecta.ownerEmail} «${s.conecta.ownerName}»; Contabilidad ${s.conecta.accountingEstado}`);
  warnings.forEach((w) => console.log(`  ⚠ ${w}`));
  if (problems.length) {
    problems.forEach((p) => console.log(`  ✖ ${p}`));
    fail('No se sigue.');
  }
  await planAndApply(s);
})().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
