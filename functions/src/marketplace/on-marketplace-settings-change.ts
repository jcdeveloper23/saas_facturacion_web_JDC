import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions/v2';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * onMarketplaceSettingsChange 
 *
 * Firestore trigger that fires whenever a company document is written.
 * Keeps /public-catalogs/{slug} in sync with the company's marketplace settings.
 *
 * Logic:
 *  1. Exit early if the `marketplace` field did not change.
 *  2. If marketplace was disabled or removed: delete /public-catalogs/{slug}
 *     and all its products subcollection.
 *  3. If marketplace is enabled:
 *     a. If the slug changed, delete the old catalog first.
 *     b. Write/update /public-catalogs/{slug} with public metadata.
 *     c. On new catalog creation or slug change, backfill all public products.
 */
export const onMarketplaceSettingsChange = onDocumentWritten(
  'companies/{companyId}',
  async (event) => {
    const { companyId } = event.params;

    const beforeData = event.data?.before.data() as Record<string, any> | undefined;
    const afterData  = event.data?.after.data()  as Record<string, any> | undefined;

    const beforeMarketplace = beforeData?.['marketplace'] as Record<string, any> | undefined;
    const afterMarketplace  = afterData?.['marketplace']  as Record<string, any> | undefined;

    // Exit early if the marketplace block did not change at all
    const beforeJson = JSON.stringify(beforeMarketplace ?? null);
    const afterJson  = JSON.stringify(afterMarketplace  ?? null);
    if (beforeJson === afterJson) {
      logger.info('[onMarketplaceSettingsChange] marketplace sin cambios — saliendo.', { companyId });
      return;
    }

    logger.info('[onMarketplaceSettingsChange] Cambio detectado en marketplace.', {
      companyId,
      before: beforeMarketplace ?? null,
      after:  afterMarketplace  ?? null,
    });

    const db = admin.firestore();

    // ── Helper: delete a catalog (root doc + products subcollection) ──────────
    async function deleteCatalog(slug: string): Promise<void> {
      logger.info('[onMarketplaceSettingsChange] Borrando catálogo:', { slug });

      // Delete products subcollection in batches of 100
      const productsRef = db.collection(`public-catalogs/${slug}/products`);
      let deleted = 0;

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const snap = await productsRef.limit(100).get();
        if (snap.empty) break;

        const batch = db.batch();
        snap.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        deleted += snap.docs.length;
        logger.info('[onMarketplaceSettingsChange] Productos eliminados (parcial):', { slug, deleted });
      }

      // Delete root catalog document
      await db.doc(`public-catalogs/${slug}`).delete();
      logger.info('[onMarketplaceSettingsChange] Catálogo eliminado completamente:', { slug, totalProductsDeleted: deleted });
    }

    // ── Helper: build minimal product projection ──────────────────────────────
    function buildProductProjection(product: Record<string, any>): Record<string, any> {
      const rawImageUrls: string[] = Array.isArray(product['imageUrls'])
        ? product['imageUrls'].filter((u: any) => typeof u === 'string' && u)
        : product['imageUrl'] ? [product['imageUrl']] : [];

      return {
        id:             product['id'],
        name:           product['name'],
        notes:          product['description'] ?? product['notes'] ?? '',
        imageUrl:       rawImageUrls[0] ?? null,
        imageUrls:      rawImageUrls,
        familyId:       product['familyId']   ?? null,
        familyName:     product['familyName'] ?? null,
        salePrice:      product['salePrice']  ?? product['price'] ?? 0,
        taxRate:        product['taxRate']     ?? product['vatRate'] ?? null,
        stockAvailable: product['stockAvailable'] ?? product['stockQty'] ?? 0,
        noStock:        product['noStock'] !== undefined ? product['noStock'] : product['trackInventory'] === false,
        isPublic:       true,
        isActive:       true,
      };
    }

    // ── Helper: backfill all public products into a catalog ───────────────────
    async function syncAllProducts(slug: string, allowedFamilyIds: string[]): Promise<void> {
      logger.info('[onMarketplaceSettingsChange] Iniciando sync de productos:', { companyId, slug });

      // Field is `isActive` (not `state`) — per Product interface
      const productsSnap = await db.collection(`companies/${companyId}/products`)
        .where('isPublic', '==', true)
        .where('isActive', '==', true)
        .get();

      // DEBUG: dump raw fields of first product to verify field names
      if (!productsSnap.empty) {
        const sample = productsSnap.docs[0].data();
        logger.info('[onMarketplaceSettingsChange] DEBUG sample product fields:', {
          id: productsSnap.docs[0].id,
          isPublic: sample['isPublic'],
          isActive: sample['isActive'],
          stockAvailable: sample['stockAvailable'],
          stockQty: sample['stockQty'],
          noStock: sample['noStock'],
          familyId: sample['familyId'],
          name: sample['name'],
        });
      }

      logger.info('[onMarketplaceSettingsChange] Productos públicos encontrados:', { count: productsSnap.size });

      if (productsSnap.empty) return;

      const CHUNK = 400;
      let synced = 0;
      const docs = productsSnap.docs;

      for (let i = 0; i < docs.length; i += CHUNK) {
        const chunk = docs.slice(i, i + CHUNK);
        const batch = db.batch();

        for (const doc of chunk) {
          const product = { id: doc.id, ...doc.data() } as Record<string, any>;

          // Respect allowedFamilyIds filter
          if (
            allowedFamilyIds.length > 0 &&
            !allowedFamilyIds.includes(product['familyId'])
          ) {
            continue;
          }

          const ref = db.doc(`public-catalogs/${slug}/products/${doc.id}`);
          batch.set(ref, buildProductProjection(product));
          synced++;
        }

        await batch.commit();
        logger.info('[onMarketplaceSettingsChange] Batch de productos comprometido:', { slug, synced });
      }

      logger.info('[onMarketplaceSettingsChange] Sync de productos completado:', { slug, synced });
    }

    // ── Main logic ────────────────────────────────────────────────────────────
    try {
      const slugBefore = beforeMarketplace?.['slug'] as string | undefined;

      // Case 1: marketplace disabled or deleted
      if (!afterMarketplace || afterMarketplace['enabled'] === false) {
        if (slugBefore) {
          await deleteCatalog(slugBefore);
        }
        logger.info('[onMarketplaceSettingsChange] Marketplace deshabilitado — catálogo eliminado.', { companyId });
        return;
      }

      // Case 2: marketplace enabled
      const slug     = afterMarketplace['slug'] as string;
      const slugChanged = slugBefore && slugBefore !== slug;
      const isNewCatalog = !beforeMarketplace || !beforeMarketplace['enabled'];

      // If slug changed, delete the old catalog
      if (slugChanged && slugBefore) {
        await deleteCatalog(slugBefore);
      }

      // Write/update /public-catalogs/{slug}
      const catalogRef = db.doc(`public-catalogs/${slug}`);
      await catalogRef.set({
        companyId, 
        companyName:      afterData?.['name']    ?? '',
        logoUrl:          afterData?.['logoUrl'] ?? null,
        primaryColor:     afterMarketplace['primaryColor']     ?? null,
        welcomeMessage:   afterMarketplace['welcomeMessage']   ?? '',
        whatsapp:         afterMarketplace['whatsapp']         ?? null,
        showPrices:       afterMarketplace['showPrices']       ?? true,
        showNotes:        afterMarketplace['showNotes']        ?? true,
        showOutOfStock:   afterMarketplace['showOutOfStock']   ?? false,
        allowedFamilyIds: afterMarketplace['allowedFamilyIds'] ?? [],
        updatedAt:        FieldValue.serverTimestamp(),
      }, { merge: true });

      logger.info('[onMarketplaceSettingsChange] /public-catalogs/{slug} actualizado.', { slug });

      // Backfill products on every settings save so that changes to imageUrls,
      // showOutOfStock, allowedFamilyIds, etc. are immediately reflected.
      const allowedFamilyIds: string[] = afterMarketplace['allowedFamilyIds'] ?? [];
      logger.info('[onMarketplaceSettingsChange] Disparando backfill.', { isNewCatalog, slugChanged });
      await syncAllProducts(slug, allowedFamilyIds);

      logger.info('[onMarketplaceSettingsChange] Completado.', { companyId, slug });

    } catch (err) {
      // Do NOT re-throw — would cause infinite Firestore retries
      logger.error('[onMarketplaceSettingsChange] Error inesperado:', { companyId, err });
    }
  }
);
