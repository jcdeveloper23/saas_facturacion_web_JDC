/**
 * get-auth-token.ts
 *
 * Endpoint HTTP (onRequest) para obtener un Firebase ID Token a partir de
 * email + password. Diseñado para facilitar pruebas rápidas desde Postman,
 * Swagger UI, curl, o cualquier cliente HTTP sin SDK de Firebase instalado.
 *
 * NO es parte del flujo de producción de usuarios finales (ellos usan el SDK
 * de Firebase en el frontend). Esta función es una herramienta de desarrollo e
 * integración para sistemas externos (Spring Boot, scripts, CI/CD).
 *
 * Flujo:
 *   1. Recibe { email, password } en el body.
 *   2. Llama a la Firebase Auth REST API (signInWithPassword).
 *   3. Decodifica el ID Token resultante con Firebase Admin SDK para extraer claims.
 *   4. Retorna { idToken, expiresIn, uid, companyId, role } en texto plano.
 *
 * Uso:
 *   POST https://us-central1-facturasproec.cloudfunctions.net/getAuthToken
 *   Content-Type: application/json
 *   { "email": "usuario@empresa.com", "password": "contraseña" }
 *
 * Respuesta:
 *   { "idToken": "eyJ...", "expiresIn": "3600", "uid": "...", "companyId": "...", "role": "..." }
 *
 * El idToken resultante se usa como Bearer token en todas las llamadas
 * a las Cloud Functions callable:
 *   Authorization: Bearer eyJ...
 */

import { onRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import axios from 'axios';

// Firebase Web API Key — clave pública (la misma que está en el frontend Angular).
// Expuesta como variable de entorno para no hardcodearla; si no existe, usa el fallback.
const FIREBASE_WEB_API_KEY =
  process.env['FIREBASE_WEB_API_KEY'] ?? 'AIzaSyAN8TSjffljKHfErfJ3O_GCG3EWxfyYR14';

const SIGN_IN_URL =
  `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_WEB_API_KEY}`;

export const getAuthToken = onRequest(
  { memory: '256MiB' },
  async (req, res) => {
    // ── CORS ─────────────────────────────────────────────────────────────────
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
      return;
    }

    // ── Validar body ─────────────────────────────────────────────────────────
    const { email, password } = req.body as { email?: string; password?: string };

    if (!email || typeof email !== 'string') {
      res.status(400).json({ error: 'INVALID_ARGUMENT', message: 'email es requerido.' });
      return;
    }
    if (!password || typeof password !== 'string') {
      res.status(400).json({ error: 'INVALID_ARGUMENT', message: 'password es requerido.' });
      return;
    }

    // ── Llamar Firebase Auth REST API ────────────────────────────────────────
    let idToken: string;
    let expiresIn: string;

    try {
      const authResponse = await axios.post(
        SIGN_IN_URL,
        { email, password, returnSecureToken: true },
        { headers: { 'Content-Type': 'application/json' }, timeout: 10_000 },
      );
      idToken   = authResponse.data.idToken;
      expiresIn = authResponse.data.expiresIn;
    } catch (err: any) {
      const firebaseError = err?.response?.data?.error;
      if (firebaseError) {
        const code = firebaseError.message as string;
        if (code === 'INVALID_LOGIN_CREDENTIALS' || code === 'EMAIL_NOT_FOUND' || code === 'INVALID_PASSWORD') {
          res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Email o contraseña incorrectos.' });
          return;
        }
        if (code === 'USER_DISABLED') {
          res.status(403).json({ error: 'USER_DISABLED', message: 'El usuario está deshabilitado.' });
          return;
        }
        if (code === 'TOO_MANY_ATTEMPTS_TRY_LATER') {
          res.status(429).json({ error: 'TOO_MANY_ATTEMPTS', message: 'Demasiados intentos fallidos. Espere unos minutos.' });
          return;
        }
      }
      console.error('[getAuthToken] Error en Firebase Auth REST API:', err?.message);
      res.status(500).json({ error: 'INTERNAL', message: 'Error al autenticar.' });
      return;
    }

    // ── Decodificar token para extraer custom claims ──────────────────────────
    let uid        = '';
    let companyId  = '';
    let role       = '';

    try {
      const decoded = await admin.auth().verifyIdToken(idToken);
      uid       = decoded.uid;
      companyId = (decoded['companyId'] as string) ?? '';
      role      = (decoded['role']      as string) ?? '';
    } catch (err) {
      console.error('[getAuthToken] Error decodificando token:', err);
      // No fallamos — el token es válido aunque no podamos decodificar los claims extra
    }

    // ── Retornar ─────────────────────────────────────────────────────────────
    res.status(200).json({
      idToken,
      expiresIn,
      tokenType: 'Bearer',
      uid,
      companyId: companyId || null,
      role:      role      || null,
      usage: 'Agrega el idToken en el header: Authorization: Bearer <idToken>',
    });
  },
);
