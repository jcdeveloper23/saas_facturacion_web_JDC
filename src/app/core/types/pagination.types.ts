import { QueryDocumentSnapshot } from '@angular/fire/firestore';

/**
 * Resultado de una página de datos paginada con cursor-based pagination.
 * Usado por todos los servicios que implementan paginación Firestore.
 * Ver: docs/FIREBASE_PAGINATION_GUIDELINES.md
 */
export interface PageResult<T> {
  items: T[];
  /** Cursor del último doc de esta página — pasar como `cursor` en la siguiente llamada. */
  nextCursor: QueryDocumentSnapshot | null;
  /** true si existe al menos una página más después de esta. */
  hasMore: boolean;
}
