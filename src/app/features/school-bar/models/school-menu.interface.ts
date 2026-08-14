import { Timestamp } from '@angular/fire/firestore';

// ─── Nutrition ────────────────────────────────────────────────────────────────

export type TrafficLightColor = 'green' | 'yellow' | 'red';

export const TRAFFIC_LIGHT_LABELS: Record<TrafficLightColor, string> = {
  green:  'Bajo',
  yellow: 'Medio',
  red:    'Alto'
};

export const TRAFFIC_LIGHT_COLORS: Record<TrafficLightColor, string> = {
  green:  'success',
  yellow: 'warning',
  red:    'danger'
};

/** Semáforo nutricional por nutriente según Acuerdo Ministerial MINEDUC 0005-14 */
export interface NutritionTrafficLight {
  fat:    TrafficLightColor;   // grasas totales
  sugar:  TrafficLightColor;   // azúcares
  sodium: TrafficLightColor;   // sodio
}

/** Información nutricional por porción */
export interface NutritionInfo {
  calories:    number;  // kcal por porción
  protein:     number;  // gramos
  carbs:       number;  // gramos (carbohidratos totales)
  fat:         number;  // gramos (grasas totales)
  sodium:      number;  // miligramos
  sugar:       number;  // gramos (azúcares)
  servingSize: string;  // descripción de la porción (ej. "1 porción (250g)")
  trafficLight: NutritionTrafficLight;
}

// ─── Menu Item ────────────────────────────────────────────────────────────────

export type MenuItemCategory = 'almuerzo' | 'snack' | 'bebida' | 'postre' | 'otro';
export type MineducCategory  = 'allowed' | 'restricted' | 'prohibited';

export const MENU_ITEM_CATEGORY_LABELS: Record<MenuItemCategory, string> = {
  almuerzo: 'Almuerzo',
  snack:    'Snack',
  bebida:   'Bebida',
  postre:   'Postre',
  otro:     'Otro'
};

export const MINEDUC_CATEGORY_LABELS: Record<MineducCategory, string> = {
  allowed:    'Permitido',
  restricted: 'Restringido',
  prohibited: 'Prohibido'
};

export const MINEDUC_CATEGORY_COLORS: Record<MineducCategory, string> = {
  allowed:    'success',
  restricted: 'warning',
  prohibited: 'danger'
};

export interface MenuItem {
  id: string;                      // uuid local dentro del menú
  productId: string;               // REQUERIDO — referencia a products/{id}
  productSku: string;              // SKU del producto (denormalizado para stock movements)
  name: string;                    // denormalizado del producto
  description?: string;
  imageUrl?: string;               // denormalizado del producto
  category: MenuItemCategory;
  price: number;                   // siempre leído del producto — no editar aquí directamente

  // ── Control de producción ────────────────────────────────────────────────
  dailyCapacity: number;           // cuántas unidades pueden prepararse hoy
  reservedCount: number;           // pedidos anticipados ya tomados (actualizado por CF)
  soldCount: number;               // vendidos en el momento (actualizado por CF)
  available: boolean;              // false = marcado como agotado por el cajero

  // ── Nutrición y regulación MINEDUC ────────────────────────────────────────
  nutrition?: NutritionInfo;
  sriCode?: string;                // código ARCSA / registro sanitario
  mineducCategory: MineducCategory;
}

// ─── Menu ─────────────────────────────────────────────────────────────────────
// Stored at: /companies/{companyId}/school_menus/{menuId}
//
// El menú es una herramienta de planificación opcional para el día.
// No es la fuente única de productos del POS — el catálogo activo siempre está disponible.

export interface SchoolMenu {
  id: string;
  companyId: string;               // antes institutionId — empresa = institución
  date: string;                    // "2026-05-28" — clave principal de búsqueda (YYYY-MM-DD)
  publishedAt?: Timestamp;
  published: boolean;
  orderCutoff: Timestamp;          // momento exacto de corte para pedidos anticipados
  items: MenuItem[];
  totalItemCount: number;          // denormalizado
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** True si el item tiene semáforo rojo en al menos un nutriente crítico */
export function hasRedTrafficLight(item: MenuItem): boolean {
  if (!item.nutrition) return false;
  const tl = item.nutrition.trafficLight;
  return tl.fat === 'red' || tl.sugar === 'red' || tl.sodium === 'red';
}

/** Unidades disponibles para pedido anticipado */
export function availableForOrder(item: MenuItem): number {
  return Math.max(0, item.dailyCapacity - item.reservedCount);
}
