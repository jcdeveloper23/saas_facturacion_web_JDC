import * as admin from 'firebase-admin';

admin.initializeApp();

// Auth
export { setUserCustomClaims } from './auth/set-custom-claims';
export { setupFirstAdmin } from './auth/setup-first-admin'; // TODO: remove after first admin created

// Tenants
export { setupCompany } from './tenants/setup-company';
