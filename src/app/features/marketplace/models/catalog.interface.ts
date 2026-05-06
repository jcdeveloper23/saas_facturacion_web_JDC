// Mapa subfamiliaId → { parentId, parentName } para resolver jerarquía en el catálogo
export type FamilyTree = Record<string, { parentId: string; parentName: string }>;

export interface PublicCatalog {
  slug: string;
  companyId: string;
  companyName: string;
  logoUrl?: string;
  primaryColor?: string;
  welcomeMessage?: string;
  whatsapp?: string;        // número con código de país para contacto directo
  phone?: string;
  email?: string;
  instagram?: string;
  facebook?: string;
  tiktok?: string;
  locationText?: string;
  locationUrl?: string;
  showPrices: boolean;
  showOutOfStock: boolean;
  showNotes: boolean;       // muestra descripción/observaciones del producto
  allowedFamilyIds: string[];
  familyTree?: FamilyTree;  // subfamiliaId → { parentId, parentName }
  updatedAt?: any;
}

export interface PublicProduct {
  id: string;
  name: string;
  notes?: string;
  imageUrl?: string;        // imagen principal (backward compat)
  imageUrls?: string[];     // hasta 4 imágenes (índice 0 = principal)
  familyId?: string;
  familyName?: string;
  parentFamilyId?: string;  // ID de la familia padre (si es subfamilia)
  parentFamilyName?: string;// nombre de la familia padre (denormalizado)
  salePrice: number;
  taxRate?: number;
  stockAvailable: number;
  noStock: boolean;         // true = producto de servicio sin gestión de inventario
  isPublic: boolean;
  isActive: boolean;
}
