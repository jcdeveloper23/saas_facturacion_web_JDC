"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupCompany = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const firestore_1 = require("firebase-admin/firestore");
/**
 * setupCompany
 *
 * Called by super-admin when creating a new tenant.
 * Reads default data from /platform/defaults (managed by super-admin UI).
 * Falls back to hardcoded values if platform defaults are not configured.
 *
 * Creates:
 *   - The /companies/{companyId} document
 *   - Default warehouses (from platform/defaults/warehouses)
 *   - Default tax rates (from platform/defaults/taxRates)
 *   - Default payment terms (from platform/defaults/paymentTerms)
 *   - Default document series (from platform/defaults/documentSeries)
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
    const now = firestore_1.Timestamp.now();
    // ── Load platform defaults ─────────────────────────────────────────────────
    console.log('[setupCompany] Loading platform defaults from Firestore...');
    const [configSnap, taxRatesSnap, paymentTermsSnap, seriesSnap, warehousesSnap, currenciesSnap, countriesSnap] = await Promise.all([
        db.doc('platform/defaults').get(),
        db.collection('platform/defaults/taxRates').get(),
        db.collection('platform/defaults/paymentTerms').get(),
        db.collection('platform/defaults/documentSeries').get(),
        db.collection('platform/defaults/warehouses').get(),
        db.collection('platform/defaults/currencies').get(),
        db.collection('platform/defaults/countries').get(),
    ]);
    console.log('[setupCompany] platform/defaults doc exists:', configSnap.exists, '| data:', JSON.stringify(configSnap.data() ?? null));
    console.log('[setupCompany] taxRates:', taxRatesSnap.size, '| paymentTerms:', paymentTermsSnap.size, '| documentSeries:', seriesSnap.size, '| warehouses:', warehousesSnap.size, '| currencies:', currenciesSnap.size, '| countries:', countriesSnap.size);
    const platformConfig = configSnap.exists ? configSnap.data() : {};
    const country = platformConfig['country'] ?? 'Ecuador';
    const defaultCurrency = platformConfig['defaultCurrency'] ?? 'USD';
    const defaultVatRate = platformConfig['defaultVatRate'] ?? 15;
    console.log(`[setupCompany] config resolved — country: ${country}, currency: ${defaultCurrency}, vatRate: ${defaultVatRate}`);
    const taxRates = !taxRatesSnap.empty
        ? (console.log('[setupCompany] taxRates: Firestore'), taxRatesSnap.docs.map(d => d.data()).filter(d => d['isActive'] !== false))
        : (console.log('[setupCompany] taxRates: HARDCODED fallback'), [
            { code: 'VAT15', name: 'IVA 15%', rate: 15, sriCode: '3', isDefault: true },
            { code: 'VAT5', name: 'IVA 5%', rate: 5, sriCode: '5', isDefault: false },
            { code: 'VAT0', name: 'IVA 0%', rate: 0, sriCode: '2', isDefault: false },
            { code: 'EXEMPT', name: 'Exento', rate: 0, sriCode: '6', isDefault: false },
        ]);
    const paymentTerms = !paymentTermsSnap.empty
        ? (console.log('[setupCompany] paymentTerms: Firestore'), paymentTermsSnap.docs.map(d => d.data()).filter(d => d['isActive'] !== false))
        : (console.log('[setupCompany] paymentTerms: HARDCODED fallback'), [
            { code: 'CASH', name: 'Contado', days: 0 },
            { code: 'D30', name: '30 días', days: 30 },
            { code: 'D60', name: '60 días', days: 60 },
            { code: 'D90', name: '90 días', days: 90 },
        ]);
    const documentSeries = !seriesSnap.empty
        ? (console.log('[setupCompany] documentSeries: Firestore'), seriesSnap.docs.map(d => d.data()).filter(d => d['isActive'] !== false))
        : (console.log('[setupCompany] documentSeries: HARDCODED fallback'), [
            { code: '001', name: 'Serie Facturas', documentType: 'invoice' },
            { code: '001', name: 'Serie Presupuestos', documentType: 'quote' },
            { code: '001', name: 'Serie Pedidos', documentType: 'order' },
        ]);
    const warehouses = !warehousesSnap.empty
        ? (console.log('[setupCompany] ✅ warehouses: Firestore'), warehousesSnap.docs.map(d => d.data()).filter(d => d['isActive'] !== false))
        : (console.warn('[setupCompany] ⚠️ warehouses: HARDCODED fallback! Check platform/defaults/warehouses'), [
            { code: 'BOD-01', name: 'Bodega Principal', isMain: true },
        ]);
    const currencies = !currenciesSnap.empty
        ? (console.log('[setupCompany] currencies: Firestore'), currenciesSnap.docs.map(d => d.data()).filter(d => d['isActive'] !== false))
        : (console.log('[setupCompany] currencies: HARDCODED fallback'), [
            { code: 'USD', name: 'DÓLARES EE.UU.', symbol: '$', isoCode: '840', buyRate: 1, sellRate: 1, isDefault: true },
        ]);
    const countries = !countriesSnap.empty
        ? (console.log('[setupCompany] countries: Firestore'), countriesSnap.docs.map(d => d.data()).filter(d => d['isActive'] !== false))
        : (console.log('[setupCompany] countries: HARDCODED fallback'), [
            { code2: 'EC', code3: 'ECU', name: 'Ecuador' },
        ]);
    // ── Create admin user if requested ────────────────────────────────────────
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
    // ── Create company document ────────────────────────────────────────────────
    const companyRef = db.collection('companies').doc();
    const companyId = companyRef.id;
    const batch = db.batch();
    const { adminPassword, ...companyDataToSave } = data;
    batch.set(companyRef, {
        ...companyDataToSave,
        subscriptionStart: now,
        subscriptionEnd: data.subscriptionEnd
            ? firestore_1.Timestamp.fromDate(new Date(data.subscriptionEnd))
            : firestore_1.Timestamp.fromMillis(Date.now() + 30 * 24 * 60 * 60 * 1000),
        createdAt: now,
        updatedAt: now
    });
    // ── configuration/general ──────────────────────────────────────────────────
    const configRef = db.doc(`companies/${companyId}/configuration/general`);
    batch.set(configRef, {
        companyName: data.name,
        taxId: data.taxId,
        fiscalAddress: data.fiscalAddress,
        city: data.city,
        country,
        phone: data.phone,
        email: data.email,
        defaultCurrency,
        vatRate: defaultVatRate,
        fiscalYear: new Date().getFullYear(),
        updatedAt: now,
        updatedBy: request.auth.uid
    });
    // ── Warehouses ─────────────────────────────────────────────────────────────
    for (const w of warehouses) {
        const ref = db.collection(`companies/${companyId}/warehouses`).doc();
        batch.set(ref, {
            code: w['code'],
            name: w['name'],
            isMain: w['isMain'] ?? false,
            address: data.fiscalAddress,
            city: data.city,
            isActive: true,
            createdAt: now, updatedAt: now,
            createdBy: request.auth.uid, updatedBy: request.auth.uid
        });
    }
    // ── Tax rates ──────────────────────────────────────────────────────────────
    for (const tax of taxRates) {
        const ref = db.collection(`companies/${companyId}/taxRates`).doc();
        batch.set(ref, {
            code: tax['code'],
            name: tax['name'],
            rate: tax['rate'],
            sriCode: tax['sriCode'],
            isDefault: tax['isDefault'] ?? false,
            isActive: true,
            createdAt: now, updatedAt: now,
            createdBy: request.auth.uid, updatedBy: request.auth.uid
        });
    }
    // ── Payment terms ──────────────────────────────────────────────────────────
    for (const term of paymentTerms) {
        const ref = db.collection(`companies/${companyId}/paymentTerms`).doc();
        batch.set(ref, {
            code: term['code'],
            name: term['name'],
            days: term['days'],
            isActive: true,
            createdAt: now, updatedAt: now,
            createdBy: request.auth.uid, updatedBy: request.auth.uid
        });
    }
    // ── Document series ────────────────────────────────────────────────────────
    for (const s of documentSeries) {
        const ref = db.collection(`companies/${companyId}/documentSeries`).doc();
        batch.set(ref, {
            code: s['code'],
            name: s['name'],
            documentType: s['documentType'],
            establishment: data.sri?.establishment || '001',
            emissionPoint: data.sri?.emissionPoint || '001',
            isActive: true,
            createdAt: now, updatedAt: now,
            createdBy: request.auth.uid, updatedBy: request.auth.uid
        });
    }
    // ── Currencies ─────────────────────────────────────────────────────────────
    for (const c of currencies) {
        // Use currency code as doc ID (same convention as platform defaults)
        const ref = db.doc(`companies/${companyId}/currencies/${c['code']}`);
        batch.set(ref, {
            code: c['code'],
            name: c['name'],
            symbol: c['symbol'],
            isoCode: c['isoCode'] ?? '',
            buyRate: c['buyRate'] ?? 1,
            sellRate: c['sellRate'] ?? 1,
            isDefault: c['isDefault'] ?? false,
            isActive: true,
            createdAt: now, updatedAt: now,
            createdBy: request.auth.uid, updatedBy: request.auth.uid
        });
    }
    // ── User records ───────────────────────────────────────────────────────────
    if (adminUid) {
        batch.set(db.doc(`users/${adminUid}`), {
            uid: adminUid, email: data.email, displayName: data.name,
            role: 'admin', companyId, isActive: true,
            lastLogin: now, createdAt: now, updatedAt: now
        });
        batch.set(db.doc(`companies/${companyId}/users/${adminUid}`), {
            uid: adminUid, email: data.email, displayName: data.name,
            role: 'admin', companyId, isActive: true,
            lastLogin: now, createdAt: now, updatedAt: now
        });
    }
    await batch.commit();
    console.log('[setupCompany] batch 1 committed (company + settings)');
    // ── Countries (separate batch — can be 200+ docs) ──────────────────────────
    // Firestore batch limit is 500 ops; split into chunks of 400 to be safe
    const CHUNK = 400;
    for (let i = 0; i < countries.length; i += CHUNK) {
        const chunk = countries.slice(i, i + CHUNK);
        const countryBatch = db.batch();
        for (const c of chunk) {
            // Use code2 (2-letter ISO) as doc ID for easy lookup
            const docId = (c['code2'] || c['code3'] || '').toUpperCase();
            if (!docId)
                continue;
            countryBatch.set(db.doc(`companies/${companyId}/countries/${docId}`), {
                code2: (c['code2'] || '').toUpperCase(),
                code3: (c['code3'] || '').toUpperCase(),
                name: c['name'],
                isActive: true,
                createdAt: now, updatedAt: now,
                createdBy: request.auth.uid, updatedBy: request.auth.uid
            });
        }
        await countryBatch.commit();
        console.log(`[setupCompany] countries batch committed — chunk ${i / CHUNK + 1}, ${chunk.length} docs`);
    }
    if (adminUid) {
        await auth.setCustomUserClaims(adminUid, { companyId, role: 'admin' });
    }
    return { companyId };
});
//# sourceMappingURL=setup-company.js.map