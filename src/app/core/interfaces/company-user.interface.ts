import { UserRole } from '../services/auth.service';

/**
 * CompanyUser — usuario de la plataforma dentro de un tenant.
 * Stored in: companies/{companyId}/company-users/{uid}
 * Doc ID = Firebase Auth UID → O(1) lookup desde cualquier módulo Firestore.
 *
 * Puente entre Firebase Auth (claims) y Firestore multi-tenant.
 * Equivale a fs_users del sistema legacy PHP.
 */
export interface CompanyUser {
  uid: string;           // Firebase Auth UID (= Firestore doc ID)
  email: string;
  displayName: string;
  photoURL?: string;
  platformRole: UserRole; // 'admin' | 'seller' | 'cashier' | 'read_only' | 'super_admin'
  isActive: boolean;
  personaId?: string;    // ref a companies/{cId}/personas/{id}
  restUserId?: number;   // id en el REST API legacy (si aplica)
  createdAt?: any;       // Firestore Timestamp
  updatedAt?: any;       // Firestore Timestamp
  lastLoginAt?: any;     // Firestore Timestamp
  createdBy?: string;    // uid del admin que creó
  updatedBy?: string;    // uid del admin que actualizó por última vez
}

export interface CompanyUserFilters {
  platformRole?: UserRole;
  isActive?: boolean;
  search?: string;
}
