import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions/v2';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * onProductPublicSync
 *
 * Firestore trigger that fires whenever a product document is written inside a company.
 * Keeps /public-catalogs/{slug}/products/{productId} in sync with the source product.
 *
 * Logic:
 *  1. Read the parent company doc and check if marketplace is enabled.
 *  2. If not enabled, exit early.
 *  3. If the product was deleted, is not public, or is not active: remove it from
 *     the public catalog (if it exists there).
 *  4. If the product is active and public: apply the allowedFamilyIds filter,
 *     then write the minimal projection to /public-catalogs/{slug}/products/{productId}.
 */
export const onProductPublicSync = onDocumentWritten(
  'companies/{companyId}/products/{productId}',
  async (event) => {
    const { companyId, productId } = event.params;

    logger.info('[onProductPublicSync] Trigger disparado.', { companyId, productId });

    const db = admin.firestore();

    try {
      // ── Step 1: Read company document ───────────────────────────────────────
      const companySnap = await db.doc(`companies/${companyId}`).get();

      if (!companySnap.exists) {
        logger.warn('[onProductPublicSync] Empresa no encontrada — saliendo.', { companyId });
        return;
      }

      const company = companySnap.data() as Record<string, any>;
      const marketplace = company['marketplace'] as Record<string, any> | undefined;

      // ── Step 2: Exit if marketplace is not enabled ──────────────────────────
      if (!marketplace || marketplace['enabled'] !== true) {
        logger.info('[onProductPublicSync] Marketplace no habilitado — saliendo.', { companyId });
        return;
      }

      const slug: string = marketplace['slug'];
      const allowedFamilyIds: string[] = marketplace['allowedFamilyIds'] ?? [];
      const catalogProductRef = db.doc(`public-catalogs/${slug}/products/${productId}`);

      // ── Step 3: Handle deletion or deactivation ─────────────────────────────
      const afterSnap = event.data?.after;
      const afterData = afterSnap?.data() as Record<string, any> | undefined;

      const wasDeleted   = !afterSnap?.exists;
      const isNotPublic  = !afterData || afterData['isPublic'] !== true;
      // Field is `isActive` (not `state`) — per Product interface
      const isNotActive  = !afterData || afterData['isActive'] !== true;

      // DEBUG: log raw fields to verify
      logger.info('[onProductPublicSync] DEBUG product fields:', {
        productId,
        isPublic:  afterData?.['isPublic'],
        isActive:  afterData?.['isActive'],
        state:     afterData?.['state'],      // keep to detect legacy data
        noStock:   afterData?.['noStock'],
        stockAvailable: afterData?.['stockAvailable'],
        stockQty:  afterData?.['stockQty'],
        familyId:  afterData?.['familyId'],
        wasDeleted, isNotPublic, isNotActive,
      });

      if (wasDeleted || isNotPublic || isNotActive) {
        logger.info('[onProductPublicSync] Producto eliminado/inactivo/no-público — borrando del catálogo.', {
          companyId, productId, slug, wasDeleted, isNotPublic, isNotActive,
        });

        try {
          await catalogProductRef.delete();
        } catch (deleteErr) {
          // If the doc didn't exist it's fine — not a critical error
          logger.warn('[onProductPublicSync] Error al borrar del catálogo (puede que no existiera):', { slug, productId, deleteErr });
        }

        return;
      }

      // ── Step 4: Product is active and public — apply family filter ──────────
      const product = { id: productId, ...afterData } as Record<string, any>;

      if (
        allowedFamilyIds.length > 0 &&
        !allowedFamilyIds.includes(product['familyId'])
      ) {
        logger.info('[onProductPublicSync] Producto excluido por allowedFamilyIds — borrando del catálogo.', {
          slug, productId, familyId: product['familyId'],
        });

        try {
          await catalogProductRef.delete();
        } catch (deleteErr) {
          logger.warn('[onProductPublicSync] Error al borrar producto filtrado (puede que no existiera):', { slug, productId, deleteErr });
        }

        return;
      }

      // ── Step 5: Resolve parent family (if product has a familyId) ──────────
      let parentFamilyId: string | null = null;
      let parentFamilyName: string | null = null;
      const productFamilyId: string | null = product['familyId'] ?? null;

      if (productFamilyId) {
        try {
          const familySnap = await db.doc(`companies/${companyId}/families/${productFamilyId}`).get();
          if (familySnap.exists) {
            const familyData = familySnap.data() as Record<string, any>;
            if (familyData['parentId']) {
              parentFamilyId = familyData['parentId'];
              // Resolve parent family name
              const parentSnap = await db.doc(`companies/${companyId}/families/${familyData['parentId']}`).get();
              if (parentSnap.exists) {
                parentFamilyName = (parentSnap.data() as Record<string, any>)['name'] ?? null;
              }
            }
          }
        } catch (familyErr) {
          logger.warn('[onProductPublicSync] Error al leer familia — continuando sin parentFamily:', { familyErr });
        }
      }

      // ── Step 6: Write minimal projection ────────────────────────────────────
      const rawImageUrls: string[] = Array.isArray(product['imageUrls'])
        ? product['imageUrls'].filter((u: any) => typeof u === 'string' && u)
        : product['imageUrl'] ? [product['imageUrl']] : [];

      const projection: Record<string, any> = {
        id:               product['id'],
        name:             product['name'],
        notes:            product['description'] ?? product['notes'] ?? '',
        imageUrl:         rawImageUrls[0] ?? null,
        imageUrls:        rawImageUrls,
        familyId:         productFamilyId,
        familyName:       product['familyName'] ?? null,
        parentFamilyId:   parentFamilyId,
        parentFamilyName: parentFamilyName,
        salePrice:        product['salePrice']  ?? product['price'] ?? 0,
        taxRate:          product['taxRate']     ?? product['vatRate'] ?? null,
        stockAvailable:   product['stockAvailable'] ?? product['stockQty'] ?? 0,
        noStock:          product['noStock'] !== undefined ? product['noStock'] : false,
        trackStock:       product['trackStock'] !== undefined ? product['trackStock'] : true,
        isPublic:         true,
        isActive:         true,
        updatedAt:        FieldValue.serverTimestamp(),
      };

      await catalogProductRef.set(projection, { merge: true });

      logger.info('[onProductPublicSync] Producto sincronizado en catálogo público.', { slug, productId });

    } catch (err) {
      // Do NOT re-throw — would cause infinite Firestore retries
      logger.error('[onProductPublicSync] Error inesperado:', { companyId, productId, err });
    }
  }
);
