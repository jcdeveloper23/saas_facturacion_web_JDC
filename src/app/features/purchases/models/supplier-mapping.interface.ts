import { Timestamp } from '@angular/fire/firestore';

/**
 * SupplierProductMapping
 *
 * Stored at: /companies/{companyId}/supplier-product-mappings/{id}
 *
 * Maps a supplier's product code/description to a product in our catalog.
 * Created when the user assigns a product during the import preview ("remember this mapping").
 * Applied automatically on future imports from the same supplier with the same SKU.
 */
export interface SupplierProductMapping {
  id: string;
  supplierId:          string;   // persona.id of the supplier
  supplierRuc:         string;   // for display / lookup without joining
  supplierName:        string;   // snapshot
  supplierSku:         string;   // normalized UPPERCASE — codigoPrincipal in XML
  supplierDescription: string;   // descripcion in XML — for display only
  productId:           string;   // our catalog product
  productName:         string;   // snapshot
  productSku:          string;   // snapshot
  createdAt:           Timestamp;
  updatedAt:           Timestamp;
}
