"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupCompany = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
/**
 * setupCompany
 *
 * Called by super-admin when creating a new tenant.
 * Creates:
 *   - The /companies/{companyId} document
 *   - Default warehouse (Principal)
 *   - Default tax rates (VAT15, VAT0, EXEMPT)
 *   - Default payment terms (Contado, 30 días, 60 días)
 *   - Default document series (001)
 *   - Default configuration/general document
 *
 * Returns: { companyId }
 */
exports.setupCompany = (0, https_1.onCall)(async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Must be authenticated.');
    }
    if (request.auth.token['role'] !== 'super_admin') {
        throw new https_1.HttpsError('permission-denied', 'Only super_admin can create companies.');
    }
    const data = request.data;
    if (!data.name || !data.taxId || !data.planId) {
        throw new https_1.HttpsError('invalid-argument', 'name, taxId and planId are required.');
    }
    const db = admin.firestore();
    const now = admin.firestore.Timestamp.now();
    const batch = db.batch();
    // ── Create admin user if requested ────────────────────────────────
    const auth = admin.auth();
    let adminUid = null;
    if (data.adminPassword) {
        if (!data.email) {
            throw new https_1.HttpsError('invalid-argument', 'Email is required to create an admin user.');
        }
        try {
            const userRecord = await auth.createUser({
                email: data.email,
                password: data.adminPassword,
                displayName: data.name
            });
            adminUid = userRecord.uid;
        }
        catch (err) {
            if (err.code === 'auth/email-already-exists') {
                throw new https_1.HttpsError('already-exists', 'El email corporativo ya está registrado como usuario.');
            }
            throw new https_1.HttpsError('internal', `Error al crear administrador: ${err.message}`);
        }
    }
    // ── Create company document ──────────────────────────────────────
    const companyRef = db.collection('companies').doc();
    const companyId = companyRef.id;
    const { adminPassword, ...companyDataToSave } = data;
    batch.set(companyRef, {
        ...companyDataToSave,
        subscriptionStart: now,
        subscriptionEnd: data.subscriptionEnd
            ? admin.firestore.Timestamp.fromDate(new Date(data.subscriptionEnd))
            : admin.firestore.Timestamp.fromMillis(Date.now() + 30 * 24 * 60 * 60 * 1000),
        createdAt: now,
        updatedAt: now
    });
    // ── Default: configuration/general ──────────────────────────────
    const configRef = db.doc(`companies/${companyId}/configuration/general`);
    batch.set(configRef, {
        companyName: data.name,
        taxId: data.taxId,
        fiscalAddress: data.fiscalAddress,
        city: data.city,
        country: 'Ecuador',
        phone: data.phone,
        email: data.email,
        defaultCurrency: 'USD',
        vatRate: 15,
        fiscalYear: new Date().getFullYear(),
        updatedAt: now,
        updatedBy: request.auth.uid
    });
    // ── Default warehouse ────────────────────────────────────────────
    const whRef = db.collection(`companies/${companyId}/warehouses`).doc();
    batch.set(whRef, {
        code: 'BOD-01',
        name: 'Bodega Principal',
        address: data.fiscalAddress,
        city: data.city,
        isMain: true,
        isActive: true,
        createdAt: now,
        updatedAt: now,
        createdBy: request.auth.uid,
        updatedBy: request.auth.uid
    });
    // ── Default tax rates ────────────────────────────────────────────
    const taxRates = [
        { code: 'VAT15', name: 'IVA 15%', rate: 15, sriCode: '3', isDefault: true },
        { code: 'VAT5', name: 'IVA 5%', rate: 5, sriCode: '5', isDefault: false },
        { code: 'VAT0', name: 'IVA 0%', rate: 0, sriCode: '2', isDefault: false },
        { code: 'EXEMPT', name: 'Exento', rate: 0, sriCode: '6', isDefault: false }
    ];
    for (const tax of taxRates) {
        const ref = db.collection(`companies/${companyId}/tax-rates`).doc();
        batch.set(ref, { ...tax, isActive: true, createdAt: now, updatedAt: now,
            createdBy: request.auth.uid, updatedBy: request.auth.uid });
    }
    // ── Default payment terms ────────────────────────────────────────
    const paymentTerms = [
        { code: 'CASH', name: 'Contado', days: 0 },
        { code: 'D30', name: '30 días', days: 30 },
        { code: 'D60', name: '60 días', days: 60 },
        { code: 'D90', name: '90 días', days: 90 }
    ];
    for (const term of paymentTerms) {
        const ref = db.collection(`companies/${companyId}/payment-terms`).doc();
        batch.set(ref, { ...term, isActive: true, createdAt: now, updatedAt: now,
            createdBy: request.auth.uid, updatedBy: request.auth.uid });
    }
    // ── Default document series ──────────────────────────────────────
    const series = [
        { code: '001', name: 'Serie Facturas', documentType: 'invoice', establishment: data.sri?.establishment || '001', emissionPoint: data.sri?.emissionPoint || '001' },
        { code: '001', name: 'Serie Presupuestos', documentType: 'quote', establishment: data.sri?.establishment || '001', emissionPoint: data.sri?.emissionPoint || '001' },
        { code: '001', name: 'Serie Pedidos', documentType: 'order', establishment: data.sri?.establishment || '001', emissionPoint: data.sri?.emissionPoint || '001' }
    ];
    for (const s of series) {
        const ref = db.collection(`companies/${companyId}/document-series`).doc();
        batch.set(ref, { ...s, isActive: true, createdAt: now, updatedAt: now,
            createdBy: request.auth.uid, updatedBy: request.auth.uid });
    }
    if (adminUid) {
        // ── Global users registry ──────────────────────────────────────
        const globalUserRef = db.doc(`users/${adminUid}`);
        batch.set(globalUserRef, {
            uid: adminUid,
            email: data.email,
            displayName: data.name,
            role: 'admin',
            companyId,
            isActive: true,
            lastLogin: now,
            createdAt: now,
            updatedAt: now
        });
        // ── Tenant users registry ──────────────────────────────────────
        const tenantUserRef = db.doc(`companies/${companyId}/users/${adminUid}`);
        batch.set(tenantUserRef, {
            uid: adminUid,
            email: data.email,
            displayName: data.name,
            role: 'admin',
            companyId,
            isActive: true,
            lastLogin: now,
            createdAt: now,
            updatedAt: now
        });
    }
    await batch.commit();
    if (adminUid) {
        // Set Custom Claims for login
        await auth.setCustomUserClaims(adminUid, {
            companyId,
            role: 'admin'
        });
    }
    return { companyId };
});
//# sourceMappingURL=setup-company.js.map