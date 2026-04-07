import { Injectable, inject } from '@angular/core';
import { where } from '@angular/fire/firestore';
import { Observable } from 'rxjs';

import { FirestoreService } from '../../../core/services/firestore.service';
import { Family } from '../models/product.interface';

export type FamilyCreateInput = Omit<Family, 'id' | 'createdAt' | 'updatedAt'>;

@Injectable({ providedIn: 'root' })
export class FamiliesService {
  private fs = inject(FirestoreService);

  getAll(): Observable<Family[]> {
    return this.fs.getCollectionQuery<Family>('families', where('isActive', '==', true));
  }

  async getOnce(): Promise<Family[]> {
    return this.fs.queryOnce<Family>('families', where('isActive', '==', true));
  }

  async create(data: FamilyCreateInput): Promise<string> {
    return this.fs.addDocument<FamilyCreateInput>('families', data);
  }

  async update(id: string, data: Partial<FamilyCreateInput>): Promise<void> {
    return this.fs.updateDocument<Family>('families', id, data);
  }

  async delete(id: string): Promise<void> {
    return this.fs.softDelete('families', id);
  }

  /** Returns families ordered as a flat tree: parents first, then children indented. */
  toTree(families: Family[]): (Family & { depth: number })[] {
    const map = new Map(families.map(f => [f.id, f]));
    const result: (Family & { depth: number })[] = [];
    const visited = new Set<string>();

    const addWithChildren = (family: Family, depth: number) => {
      if (visited.has(family.id)) return;
      visited.add(family.id);
      result.push({ ...family, depth });
      families
        .filter(f => f.parentId === family.id)
        .sort((a, b) => a.name.localeCompare(b.name, 'es'))
        .forEach(child => addWithChildren(child, depth + 1));
    };

    // Start with root families (no parent)
    families
      .filter(f => !f.parentId)
      .sort((a, b) => a.name.localeCompare(b.name, 'es'))
      .forEach(f => addWithChildren(f, 0));

    return result;
  }
}
