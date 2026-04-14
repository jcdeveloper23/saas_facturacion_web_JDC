export interface PublicCatalog {
  slug: string;
  companyId: string;
  companyName: string;
  logoUrl?: string;
  primaryColor?: string;
  welcomeMessage?: string;
  whatsapp?: string;        // número con código de país para contacto directo
  showPrices: boolean;
  showOutOfStock: boolean;
  showNotes: boolean;       // muestra descripción/observaciones del producto
  allowedFamilyIds: string[];
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
  salePrice: number;
  taxRate?: number;
  stockAvailable: number;
  noStock: boolean;         // true = producto de servicio sin gestión de inventario
  isPublic: boolean;
  isActive: boolean;
}
