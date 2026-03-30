import * as admin from 'firebase-admin';

admin.initializeApp();

// Auth
export { setUserCustomClaims } from './auth/set-custom-claims';
