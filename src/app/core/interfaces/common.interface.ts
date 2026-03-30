import { Timestamp } from '@angular/fire/firestore';

/**
 * Base interface for all Firestore documents in the billing system.
 * Every collection document extends this.
 */
export interface BaseDocument {
  id: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
  updatedBy: string;
  isActive: boolean;
}
