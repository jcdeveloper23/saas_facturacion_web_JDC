export interface PublicCatalog {
  slug: string;
  companyId: string;
  companyName: string;
  logoUrl?: string;
  primaryColor?: string;
  welcomeMessage?: string;
  showPrices: boolean;
  showOutOfStock: boolean;
  allowedFamilyIds: string[];
  updatedAt?: any;
}

export interface PublicProduct {
  id: string;
  name: string;
  notes?: string;
  imageUrl?: string;
  familyId?: string;
  familyName?: string;
  salePrice: number;
  taxRate?: number;
  stockAvailable: number;
  noStock: boolean;        // true = producto de servicio sin gestión de inventario
  isPublic: boolean;
  isActive: boolean;
}
