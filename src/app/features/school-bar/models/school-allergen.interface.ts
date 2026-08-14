import { Timestamp } from '@angular/fire/firestore';

// ─── School Allergen ──────────────────────────────────────────────────────────
// Stored at: /companies/{companyId}/school_allergens/{allergenId}
// Catálogo de alérgenos administrables por el tenant.
// isDefault = aparece preseleccionado al registrar un nuevo estudiante.

export interface SchoolAllergen {
  id: string;
  companyId: string;
  name: string;
  isDefault: boolean;   // preseleccionado en nuevos estudiantes
  state: boolean;       // visible y seleccionable en el selector de la app
  order: number;        // para ordenar alfabéticamente
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ─── Seed list (MINEDUC / Ecuador common allergens) ───────────────────────────
export const ALLERGEN_SEED_NAMES: string[] = [
  'Apanadura',
  'Avena',
  'Camarón',
  'Carne de cerdo y derivados',
  'Carne de pavo',
  'Carne de pollo',
  'Carnes Rojas',
  'Cebolla',
  'Cereza',
  'Colorante Azul',
  'Colorante Rojo',
  'Colorantes',
  'Crema de leche',
  'Embutidos',
  'Frutos secos',
  'Garbanzo',
  'Gluten',
  'Granadilla',
  'Guayaba',
  'Habas',
  'Habichuelas',
  'Huevos',
  'Jamaica',
  'Lactosa',
  'Lechuga',
  'Maní',
  'Manzanilla',
  'Mariscos',
  'Mayonesa',
  'Miel de abeja',
  'Mostaza',
  'Mote',
  'Pescados',
  'Piña',
  'Remolacha',
  'Salsa de Tomate',
  'Sandía',
  'Soja',
  'Soya',
  'Tomate árbol',
  'Trigo',
];
