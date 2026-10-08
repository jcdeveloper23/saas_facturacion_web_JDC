// Utilidades para probar las reglas contra el emulador con tokens sin firmar.
// `firebase emulators:exec` deja FIRESTORE_EMULATOR_HOST y GCLOUD_PROJECT.
const HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8181';
const PROJECT = process.env.GCLOUD_PROJECT || 'demo-facturaec';
const P = `projects/${PROJECT}/databases/(default)/documents`;
const BASE = `http://${HOST}/v1/${P}`;

const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = () => Math.floor(Date.now() / 1000);

/** Token sin firmar: el emulador lo acepta y así se simula cada rol. */
const token = claims => `${b64({ alg: 'none', typ: 'JWT' })}.${b64({
  iss: `https://securetoken.google.com/${PROJECT}`, aud: PROJECT,
  auth_time: now(), iat: now(), exp: now() + 3600,
  sub: claims.uid, user_id: claims.uid, ...claims })}.`;

/** 'owner' se salta las reglas: solo para sembrar. */
const req = (path, auth, init = {}) =>
  fetch(`${BASE}/${path}`, { ...init, headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' } });

const str = v => ({ stringValue: v });
const list = arr => ({ arrayValue: { values: arr.map(str) } });
const body = fields => JSON.stringify({ fields });

const seed = (path, id, fields) => req(`${path}?documentId=${id}`, 'owner', { method: 'POST', body: body(fields) });
const create = (path, id, auth, fields) => req(`${path}?documentId=${id}`, auth, { method: 'POST', body: body(fields) });
const patch = (path, auth, fields) =>
  req(`${path}?${Object.keys(fields).map(k => `updateMask.fieldPaths=${k}`).join('&')}`, auth,
    { method: 'PATCH', body: body(fields) });
const del = (path, auth) => req(path, auth, { method: 'DELETE' });

/**
 * Varias escrituras en un solo commit (como una transacción o un batch del
 * cliente): las reglas ven con getAfter() el estado final de todas.
 * Cada escritura: { path, fields, create?: true (exige que no exista),
 * mask?: true (solo esos campos, como un update) }.
 */
const commitDocs = (auth, writes) => fetch(`http://${HOST}/v1/${P}:commit`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ writes: writes.map(w => ({
    update: { name: `${P}/${w.path}`, fields: w.fields },
    ...(w.mask ? { updateMask: { fieldPaths: Object.keys(w.fields) } } : {}),
    ...(w.create ? { currentDocument: { exists: false } } : {}),
  })) }),
});

const results = [];
async function expectStatus(name, res, status) {
  const ok = res.status === status;
  const detail = ok ? '' : ` → ${(await res.text()).slice(0, 160).replace(/\s+/g, ' ')}`;
  results.push(ok);
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name} [${res.status}, esperado ${status}]${detail}`);
}
function report() {
  const ok = results.filter(Boolean).length;
  console.log(`\n${ok}/${results.length} casos OK`);
  if (ok !== results.length) process.exitCode = 1;
}

module.exports = { req, token, str, list, seed, create, patch, del, commitDocs, expectStatus, report, S: { OK: 200, DENIED: 403 } };
