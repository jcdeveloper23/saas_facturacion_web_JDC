import { Injectable, signal } from '@angular/core';

export type CatalogSortKey  = 'top_sellers' | 'recent' | 'price_asc' | 'price_desc';
export type CatalogViewMode = 'grid' | 'list';

/**
 * Servicio singleton que persiste el estado de filtros del catálogo público.
 * Al ser providedIn: 'root', sobrevive la navegación lista ↔ detalle ↔ carrito,
 * de modo que al volver a la lista los filtros activos se restauran automáticamente.
 */
@Injectable({ providedIn: 'root' })
export class CatalogSearchService {
  /** Query de búsqueda global del catálogo */
  readonly query           = signal<string>('');
  /** Categoría (familyId) seleccionada en el sidebar */
  readonly familyId        = signal<string | null>(null);
  /** Criterio de ordenación */
  readonly sortKey         = signal<CatalogSortKey>('top_sellers');
  /** Modo de vista: cuadrícula o lista */
  readonly viewMode        = signal<CatalogViewMode>('grid');
  /** Filtro "Solo disponibles" */
  readonly onlyInStock     = signal<boolean>(false);
  /** Nodos expandidos en el árbol de categorías del sidebar */
  readonly expandedNodeIds = signal<Set<string>>(new Set());

  /** Reinicia todos los filtros (llamar al cambiar de catálogo/slug) */
  reset(): void {
    this.query.set('');
    this.familyId.set(null);
    this.sortKey.set('top_sellers');
    this.viewMode.set('grid');
    this.onlyInStock.set(false);
    this.expandedNodeIds.set(new Set());
  }
}
