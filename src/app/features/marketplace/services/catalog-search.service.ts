import { Injectable, signal } from '@angular/core';

/**
 * Servicio compartido para sincronizar la búsqueda del header (shell)
 * con el filtro de productos (catalog-list).
 * Ambos componentes inyectan este servicio y reaccionan al mismo signal.
 */
@Injectable({ providedIn: 'root' })
export class CatalogSearchService {
  /** Query de búsqueda global del catálogo */
  readonly query = signal<string>('');

  /** Resetea la búsqueda (ej. al cambiar de empresa/slug) */
  reset(): void {
    this.query.set('');
  }
}
