import { Injectable, inject } from '@angular/core';
import { where } from '@angular/fire/firestore';
import { Observable } from 'rxjs';

import { FirestoreService } from '../../../core/services/firestore.service';
import { Manufacturer } from '../models/product.interface';

export type ManufacturerCreateInput = Omit<Manufacturer, 'id' | 'createdAt' | 'updatedAt'>;

@Injectable({ providedIn: 'root' })
export class ManufacturersService {
  private fs = inject(FirestoreService);

  getAll(): Observable<Manufacturer[]> {
    return this.fs.getCollectionQuery<Manufacturer>('manufacturers', where('isActive', '==', true));
  }

  async getOnce(): Promise<Manufacturer[]> {
    return this.fs.queryOnce<Manufacturer>('manufacturers', where('isActive', '==', true));
  }

  async create(data: ManufacturerCreateInput): Promise<string> {
    return this.fs.addDocument<ManufacturerCreateInput>('manufacturers', data);
  }

  async update(id: string, data: Partial<ManufacturerCreateInput>): Promise<void> {
    return this.fs.updateDocument<Manufacturer>('manufacturers', id, data);
  }

  async delete(id: string): Promise<void> {
    return this.fs.softDelete('manufacturers', id);
  }
}
