import { Injectable, inject } from '@angular/core';
import { Observable, from, map } from 'rxjs';
import { where } from '@angular/fire/firestore';
import { FirestoreService } from './firestore.service';
import { Action, ActionInput } from '../interfaces/permission.interface';

/**
 * ActionsService — manages action verb catalog stored in Firestore /actions.
 *
 * ROOT-level collection (not tenant-scoped), managed by super_admin.
 * Actions are verbs applied to modules: view, create, edit, delete, export, approve, etc.
 * Combined with Module entries they form Permission entries: "customers.view".
 */
@Injectable({ providedIn: 'root' })
export class ActionsService {
  private fs = inject(FirestoreService);

  // ─── Read ─────────────────────────────────────────────────────────────────

  getActions(activeOnly = true): Observable<Action[]> {
    if (activeOnly) {
      return from(
        this.fs.getRootCollectionQuery<Action>('actions', where('state', '==', true))
      ).pipe(map(actions => actions.sort((a, b) => a.code.localeCompare(b.code))));
    }
    return this.fs.getRootCollection<Action>('actions').pipe(
      map(actions => actions.sort((a, b) => a.code.localeCompare(b.code)))
    );
  }

  // ─── Write (super_admin only) ─────────────────────────────────────────────

  async createAction(data: ActionInput): Promise<string> {
    const payload = {
      code:        data.code,
      name:        data.name,
      description: data.description ?? '',
      state:       data.state       ?? true
    };
    return this.fs.addRootDocument('actions', payload);
  }

  async updateAction(id: string, data: Partial<ActionInput>): Promise<void> {
    return this.fs.updateRootDocument<Action>('actions', id, data as Partial<Action>);
  }

  async deleteAction(id: string): Promise<void> {
    const { deleteDoc, doc, getFirestore } = await import('@angular/fire/firestore');
    await deleteDoc(doc(getFirestore(), `actions/${id}`));
  }
}
