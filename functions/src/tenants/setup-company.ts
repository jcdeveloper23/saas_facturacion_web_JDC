import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import {
  assertCallerChannelActive,
  assertPlanMatchesCompany,
  readCaller,
  resolveChannelForNewCompany,
} from '../utils/channels';

/**
 * Roles de empresa sembrados en companies/{companyId}/roles al crear una empresa.
 * Espejo de COMPANY_DEFAULT_ROLES en roles.service.ts (frontend).
 * super_admin y admin NO se incluyen — son roles de plataforma global (/roles).
 */
const COMPANY_DEFAULT_ROLES = [
  {
    code: 'seller', name: 'Vendedor', level: 2, type: 'system',
    description: 'Gestiona clientes, facturas, cotizaciones y pedidos.',
    color: '#0dcaf0', icon: 'cilCart', isDefault: true, state: true,
    permissions: [
      'customers.view', 'customers.create', 'customers.edit',
      'suppliers.view', 'suppliers.create', 'suppliers.edit',
      'products.view', 'products.create', 'products.edit',
      'invoices.view', 'invoices.create', 'invoices.edit',
      'quotes.view', 'quotes.create', 'quotes.edit',
      'orders.view', 'orders.create', 'orders.edit',
      'purchases.view', 'purchases.create', 'purchases.edit',
      'stock.view', 'stock.create', 'stock.edit',
      'personas.view', 'personas.create', 'personas.edit',
      'sri.view', 'settings.view',
      'team_management.view', 'team_management.create', 'team_management.edit',
    ],
  },
  {
    code: 'accountant', name: 'Contador', level: 2, type: 'system',
    description: 'Gestiona documentos fiscales (retenciones, notas de débito, compras) y contabilidad.',
    color: '#6f42c1', icon: 'cilSpreadsheet', isDefault: true, state: true,
    permissions: [
      'purchases.view', 'purchases.create', 'purchases.edit', 'purchases.delete',
      'retentions.view', 'retentions.create', 'retentions.edit', 'retentions.delete',
      'debit_notes.view', 'debit_notes.create', 'debit_notes.edit', 'debit_notes.delete',
      'accounting.view', 'accounting.create', 'accounting.edit',
      'invoices.view', 'customers.view', 'suppliers.view', 'products.view',
      'sri.view', 'settings.view',
    ],
  },
  {
    code: 'cashier', name: 'Cajero', level: 3, type: 'system',
    description: 'Opera el punto de venta, emite facturas y consulta inventario.',
    color: '#198754', icon: 'cilCash', isDefault: true, state: true,
    permissions: [
      'customers.view', 'products.view',
      'invoices.view', 'invoices.create',
      'pos.view', 'pos.create',
      'stock.view', 'settings.view', 'team_management.view',
    ],
  },
  {
    code: 'read_only', name: 'Solo Lectura', level: 4, type: 'system',
    description: 'Acceso de consulta a todos los módulos. No puede crear ni modificar datos.',
    color: '#6c757d', icon: 'cilLockLocked', isDefault: true, state: true,
    permissions: [
      'customers.view', 'suppliers.view', 'products.view',
      'invoices.view', 'quotes.view', 'orders.view',
      'purchases.view', 'stock.view', 'pos.view',
      'sri.view', 'settings.view', 'team_management.view',
    ],
  },
];

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
export const setupCompany = onCall(async (request) => {
  // Canal: un channel_admin da de alta siempre en el suyo; el super admin de
  // plataforma puede indicar uno. Lanza si el rol no alcanza. Ver utils/channels.ts.
  const caller = readCaller(request);

  const data = request.data as {
    name: string;
    taxId: string;
    fiscalAddress: string;
    city: string;
    phone: string;
    email: string;
    adminPassword?: string;
    planId: string;
    planName: string;
    status: string;
    subscriptionEnd: string;
    /** Solo lo respeta el super admin de plataforma; un channel_admin usa el suyo. */
    channelId?: string;
    sri: {
      environment: string;
      ruc: string;
      businessName: string;
      establishment: string;
      emissionPoint: string;
      contributorType: string;
      accountingRequired: boolean;
      contribuyenteEspecial?: string;    // NUEVO
      microempresa?: boolean;            // NUEVO
      regimen?: string;                  // NUEVO
    };
  };

  if (!data.name || !data.taxId || !data.planId) {
    throw new HttpsError('invalid-argument', 'name, taxId and planId are required.');
  }

  const channelId = resolveChannelForNewCompany(caller, data.channelId);
  console.log('[setupCompany] Canal de la empresa:', channelId, '| llamador:', caller.uid);

  const db = admin.firestore();
  const now = Timestamp.now();
  await assertCallerChannelActive(db, caller);

  // ── Load plan data (if planId provided) ────────────────────────────────────
  let planLimits: Record<string, any> | null = null;
  let planFeatures: Record<string, any> | null = null;
  let includedPackages: string[] = [];
  let includedModules: string[] = [];

  if (data.planId) {
    const planSnap = await db.doc(`plans/${data.planId}`).get();
    if (planSnap.exists) {
      const plan = planSnap.data()!;
      // Un plan solo se vende en su propio canal: cruzarlos rompe el cobro.
      assertPlanMatchesCompany(plan['channelId'], channelId);
      planLimits       = plan['limits']           ?? null;
      planFeatures     = plan['features']          ?? null;
      includedPackages = plan['includedPackages']  ?? [];

      // Resolver módulos desde los paquetes del plan (igual que assignPlanToCompany en el frontend)
      if (includedPackages.length > 0) {
        const pkgsSnap = await db.collection('plugin-packages').get();
        const allPkgs = pkgsSnap.docs.map(d => ({ ...d.data() }));
        includedModules = [
          ...new Set(
            allPkgs
              .filter((p: any) => includedPackages.includes(p['code']))
              .flatMap((p: any) => (p['modules'] as string[]) ?? [])
          )
        ];
      }

      console.log('[setupCompany] Plan cargado:', data.planId, '| packages:', includedPackages.length, '| modules:', includedModules.length);
    } else {
      console.warn('[setupCompany] planId no encontrado en /plans:', data.planId);
    }
  }

  // ── Load platform defaults ─────────────────────────────────────────────────
  console.log('[setupCompany] Loading platform defaults from Firestore...');

  const [
    configSnap,
    taxRatesSnap, paymentTermsSnap, seriesSnap, warehousesSnap,
    currenciesSnap, countriesSnap,
    sriConfigSnap
  ] = await Promise.all([
    db.doc('platform/defaults').get(),
    db.collection('platform/defaults/taxRates').get(),
    db.collection('platform/defaults/paymentTerms').get(),
    db.collection('platform/defaults/documentSeries').get(),
    db.collection('platform/defaults/warehouses').get(),
    db.collection('platform/defaults/currencies').get(),
    db.collection('platform/defaults/countries').get(),
    db.doc('platform/defaults/sriConfig/data').get(),
  ]);

  console.log('[setupCompany] platform/defaults doc exists:', configSnap.exists, '| data:', JSON.stringify(configSnap.data() ?? null));
  console.log('[setupCompany] taxRates:', taxRatesSnap.size, '| paymentTerms:', paymentTermsSnap.size,
    '| documentSeries:', seriesSnap.size, '| warehouses:', warehousesSnap.size,
    '| currencies:', currenciesSnap.size, '| countries:', countriesSnap.size,
    '| sriConfig:', sriConfigSnap.exists ? 'found' : 'not found');

  const platformConfig = configSnap.exists ? (configSnap.data() as Record<string, any>) : {};
  const country: string         = platformConfig['country']         ?? 'Ecuador';
  const defaultCurrency: string = platformConfig['defaultCurrency'] ?? 'USD';
  const defaultVatRate: number  = platformConfig['defaultVatRate']  ?? 15;

  console.log(`[setupCompany] config resolved — country: ${country}, currency: ${defaultCurrency}, vatRate: ${defaultVatRate}`);

  const taxRates = !taxRatesSnap.empty
    ? (console.log('[setupCompany] taxRates: Firestore'), taxRatesSnap.docs.map(d => d.data() as Record<string, any>).filter(d => d['isActive'] !== false))
    : (console.log('[setupCompany] taxRates: HARDCODED fallback'), [
        { code: 'VAT15', name: 'IVA 15%',  rate: 15, sriCode: '3', isDefault: true  },
        { code: 'VAT5',  name: 'IVA 5%',   rate: 5,  sriCode: '5', isDefault: false },
        { code: 'VAT0',  name: 'IVA 0%',   rate: 0,  sriCode: '2', isDefault: false },
        { code: 'EXEMPT',name: 'Exento',   rate: 0,  sriCode: '6', isDefault: false },
      ]);

  const paymentTerms = !paymentTermsSnap.empty
    ? (console.log('[setupCompany] paymentTerms: Firestore'), paymentTermsSnap.docs.map(d => d.data() as Record<string, any>).filter(d => d['isActive'] !== false))
    : (console.log('[setupCompany] paymentTerms: HARDCODED fallback'), [
        { code: 'CASH', name: 'Contado',  days: 0  },
        { code: 'D30',  name: '30 días',  days: 30 },
        { code: 'D60',  name: '60 días',  days: 60 },
        { code: 'D90',  name: '90 días',  days: 90 },
      ]);

  const documentSeries = !seriesSnap.empty
    ? (console.log('[setupCompany] documentSeries: Firestore'), seriesSnap.docs.map(d => d.data() as Record<string, any>).filter(d => d['isActive'] !== false))
    : (console.log('[setupCompany] documentSeries: HARDCODED fallback'), [
        { code: '001', name: 'Serie Facturas',        documentType: 'invoice'   },
        { code: '001', name: 'Serie Notas de Débito', documentType: 'debitNote' },
        { code: '001', name: 'Serie Retenciones',     documentType: 'retention' },
        { code: '001', name: 'Serie Presupuestos',    documentType: 'quote'     },
        { code: '001', name: 'Serie Pedidos',         documentType: 'order'     },
      ]);

  const warehouses = !warehousesSnap.empty
    ? (console.log('[setupCompany] ✅ warehouses: Firestore'), warehousesSnap.docs.map(d => d.data() as Record<string, any>).filter(d => d['isActive'] !== false))
    : (console.warn('[setupCompany] ⚠️ warehouses: HARDCODED fallback! Check platform/defaults/warehouses'), [
        { code: 'BOD-01', name: 'Bodega Principal', isMain: true },
      ]);

  const currencies = !currenciesSnap.empty
    ? (console.log('[setupCompany] currencies: Firestore'), currenciesSnap.docs.map(d => d.data() as Record<string, any>).filter(d => d['isActive'] !== false))
    : (console.log('[setupCompany] currencies: HARDCODED fallback'), [
        { code: 'USD', name: 'DÓLARES EE.UU.', symbol: '$', isoCode: '840', buyRate: 1, sellRate: 1, isDefault: true },
      ]);

  const countries = !countriesSnap.empty
    ? (console.log('[setupCompany] countries: Firestore'), countriesSnap.docs.map(d => d.data() as Record<string, any>).filter(d => d['isActive'] !== false))
    : (console.log('[setupCompany] countries: HARDCODED fallback'), [
        { code2: 'EC', code3: 'ECU', name: 'Ecuador' },
      ]);

  // ── Create admin user if requested ────────────────────────────────────────
  const auth = admin.auth();
  let adminUid: string | null = null;
  if (data.adminPassword) {
    if (!data.email) {
      throw new HttpsError('invalid-argument', 'Email is required to create an admin user.');
    }
    try {
      const userRecord = await auth.createUser({
        email: data.email,
        password: data.adminPassword,
        displayName: data.name
      });
      adminUid = userRecord.uid;
    } catch (err: any) {
      if (err.code === 'auth/email-already-exists') {
        throw new HttpsError('already-exists', 'El email corporativo ya está registrado como usuario.');
      }
      throw new HttpsError('internal', `Error al crear administrador: ${err.message}`);
    }
  }

  // ── Create company document ────────────────────────────────────────────────
  const companyRef = db.collection('companies').doc();
  const companyId = companyRef.id;
  const batch = db.batch();

  const { adminPassword, ...companyDataToSave } = data;

  batch.set(companyRef, {
    ...companyDataToSave,
    // Va después del spread a propósito: el canal sale del token, no del payload.
    channelId,
    subscriptionStart: now,
    subscriptionEnd: data.subscriptionEnd
      ? Timestamp.fromDate(new Date(data.subscriptionEnd))
      : Timestamp.fromMillis(Date.now() + 30 * 24 * 60 * 60 * 1000),
    planLimits,
    planFeatures,
    enabledPackages:         includedPackages,
    enabledModules:          includedModules,
    totalPersonasActive:     0,
    totalCustomersActive:    0,
    totalProductsActive:     0,
    totalWarehousesActive:   0,
    totalUsersActive:        0,
    totalCustomRoles:        0,
    totalCostCenters:        0,
    totalActiveProjects:     0,
    usageTotalsUpdatedAt:    admin.firestore.Timestamp.now(),
    createdAt: now,
    updatedAt: now
  });

  // ── configuration/sri ─────────────────────────────────────────────────────
  const sriConfigRef = db.doc(`companies/${companyId}/configuration/sri`);
  batch.set(sriConfigRef, {
    razonSocial:              data.sri?.businessName || data.name,
    nombreComercial:          '',
    direccionMatriz:          data.fiscalAddress || '',
    direccionEstablecimiento: data.fiscalAddress || '',
    telefono:                 data.phone || '',
    correo:                   data.email || '',
    obligadoContabilidad:     data.sri?.accountingRequired ? 'SI' : 'NO',
    contribuyenteEspecial:    data.sri?.contribuyenteEspecial || '',
    additionalInfoFields:     [],
    updatedAt:                now,
    updatedBy:                caller.uid
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
    updatedBy: caller.uid
  });

  // ── Warehouses ─────────────────────────────────────────────────────────────
  for (const w of warehouses) {
    const ref = db.collection(`companies/${companyId}/warehouses`).doc();
    batch.set(ref, {
      code:    w['code'],
      name:    w['name'],
      isMain:  w['isMain'] ?? false,
      address: data.fiscalAddress,
      city:    data.city,
      isActive: true,
      createdAt: now, updatedAt: now,
      createdBy: caller.uid, updatedBy: caller.uid
    });
  }

  // ── Tax rates ──────────────────────────────────────────────────────────────
  for (const tax of taxRates) {
    const ref = db.collection(`companies/${companyId}/taxRates`).doc();
    batch.set(ref, {
      code:      tax['code'],
      name:      tax['name'],
      rate:      tax['rate'],
      sriCode:   tax['sriCode'],
      isDefault: tax['isDefault'] ?? false,
      isActive: true,
      createdAt: now, updatedAt: now,
      createdBy: caller.uid, updatedBy: caller.uid
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
      createdBy: caller.uid, updatedBy: caller.uid
    });
  }

  // ── Document series ────────────────────────────────────────────────────────
  for (const s of documentSeries) {
    const ref = db.collection(`companies/${companyId}/documentSeries`).doc();
    batch.set(ref, {
      code:         s['code'],
      name:         s['name'],
      documentType: s['documentType'],
      establishment:  data.sri?.establishment  || '001',
      emissionPoint:  data.sri?.emissionPoint  || '001',
      isActive: true,
      createdAt: now, updatedAt: now,
      createdBy: caller.uid, updatedBy: caller.uid
    });
  }

  // ── Currencies ─────────────────────────────────────────────────────────────
  for (const c of currencies) {
    // Use currency code as doc ID (same convention as platform defaults)
    const ref = db.doc(`companies/${companyId}/currencies/${c['code']}`);
    batch.set(ref, {
      code:      c['code'],
      name:      c['name'],
      symbol:    c['symbol'],
      isoCode:   c['isoCode']   ?? '',
      buyRate:   c['buyRate']   ?? 1,
      sellRate:  c['sellRate']  ?? 1,
      isDefault: c['isDefault'] ?? false,
      isActive: true,
      createdAt: now, updatedAt: now,
      createdBy: caller.uid, updatedBy: caller.uid
    });
  }

  // ── Admin user record ──────────────────────────────────────────────────────
  // Path: companies/{companyId}/company-users/{uid} (mismo patrón que createCompanyUser)
  // platformRole 'admin' se setea aquí — es el único usuario de empresa con este rol
  // creado directamente; los siguientes usuarios se crean vía createCompanyUser CF.
  if (adminUid) {
    batch.set(db.doc(`companies/${companyId}/company-users/${adminUid}`), {
      uid:          adminUid,
      email:        data.email,
      displayName:  data.name,
      platformRole: 'admin',
      companyId,
      isActive:  true,
      createdAt: now,
      updatedAt: now,
      createdBy: caller.uid,
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
      if (!docId) continue;
      countryBatch.set(db.doc(`companies/${companyId}/countries/${docId}`), {
        code2:    (c['code2']  || '').toUpperCase(),
        code3:    (c['code3']  || '').toUpperCase(),
        name:     c['name'],
        isActive: true,
        createdAt: now, updatedAt: now,
        createdBy: caller.uid, updatedBy: caller.uid
      });
    }
    await countryBatch.commit();
    console.log(`[setupCompany] countries batch committed — chunk ${i / CHUNK + 1}, ${chunk.length} docs`);
  }

  if (adminUid) {
    await auth.setCustomUserClaims(adminUid, { companyId, role: 'admin' });
  }

  // ── Seed company roles ────────────────────────────────────────────────────
  // Siembra seller, accountant, cashier, read_only en companies/{companyId}/roles.
  // super_admin y admin son roles globales de plataforma (/roles) — no se repiten aquí.
  const rolesBatch = db.batch();
  for (const roleData of COMPANY_DEFAULT_ROLES) {
    rolesBatch.set(
      db.doc(`companies/${companyId}/roles/${roleData.code}`),
      { ...roleData, createdAt: now, updatedAt: now, createdBy: caller.uid }
    );
  }
  await rolesBatch.commit();
  console.log(`[setupCompany] Company roles seeded: ${COMPANY_DEFAULT_ROLES.map(r => r.code).join(', ')}`);

  return { companyId };
});
