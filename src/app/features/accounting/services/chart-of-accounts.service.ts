import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, doc, onSnapshot,
  addDoc, updateDoc, deleteDoc, getDocs,
  query, orderBy, where, writeBatch, Timestamp, limit
} from '@angular/fire/firestore';
import { Observable, firstValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';

import { TenantService } from '../../../core/services/tenant.service';
import { AuthService }   from '../../../core/services/auth.service';
import { JournalEntriesService } from './journal-entries.service';
import {
  Account, AccountType, AccountNature,
  levelFromCode, parentCodeFromCode, defaultNatureForType,
  ECUADOR_CHART_OF_ACCOUNTS_SEED
} from '../models/account.interface';

export type AccountCreateInput = Omit<Account,
  'id' | 'createdAt' | 'updatedAt' | 'createdBy'
>;

@Injectable({ providedIn: 'root' })
export class ChartOfAccountsService {
  private firestore     = inject(Firestore);
  private tenantService = inject(TenantService);
  private authService   = inject(AuthService);
  private journalSvc    = inject(JournalEntriesService);

  private get companyId(): string { return this.tenantService.companyId; }
  private get colPath(): string   { return `companies/${this.companyId}/chart_of_accounts`; }

  // ─── List ─────────────────────────────────────────────────────────────────

  getAccounts(): Observable<Account[]> {
    return new Observable<Account[]>(observer => {
      const ref = collection(this.firestore, this.colPath);
      return onSnapshot(query(ref, orderBy('code', 'asc')), {
        next:  snap => observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() } as Account))),
        error: err  => { console.error('[ChartOfAccountsService] getAccounts error:', err); observer.error(err); }
      });
    });
  }

  getActiveMovementAccounts(): Observable<Account[]> {
    return new Observable<Account[]>(observer => {
      const ref = collection(this.firestore, this.colPath);
      return onSnapshot(
        query(ref, where('allowsMovement', '==', true), where('isActive', '==', true), orderBy('code', 'asc')),
        {
          next:  snap => observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() } as Account))),
          error: err  => observer.error(err)
        }
      );
    });
  }

  getAccount(id: string): Observable<Account | null> {
    return new Observable<Account | null>(observer => {
      const ref = doc(this.firestore, `${this.colPath}/${id}`);
      return onSnapshot(ref, {
        next:  snap => observer.next(snap.exists() ? { id: snap.id, ...snap.data() } as Account : null),
        error: err  => observer.error(err)
      });
    });
  }

  // ─── Firestore safe serialization ─────────────────────────────────────────

  private cleanDoc<T>(obj: T): T {
    if (obj === undefined) return null as T;
    if (obj === null)      return null as T;
    if (typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(i => this.cleanDoc(i)) as unknown as T;
    if ((obj as any).constructor !== Object) return obj;
    const result: any = {};
    for (const key of Object.keys(obj as object)) {
      result[key] = this.cleanDoc((obj as any)[key]);
    }
    return result as T;
  }

  // ─── Check if code exists ─────────────────────────────────────────────────

  async codeExists(code: string, excludeId?: string): Promise<boolean> {
    const snap = await getDocs(
      query(collection(this.firestore, this.colPath), where('code', '==', code))
    );
    return snap.docs.some(d => d.id !== excludeId);
  }

  // ─── Check if account has children ────────────────────────────────────────

  async hasChildren(code: string): Promise<boolean> {
    const snap = await getDocs(
      query(collection(this.firestore, this.colPath), where('parentCode', '==', code), limit(1))
    );
    return !snap.empty;
  }

  // ─── Check if account has journal movements ───────────────────────────────

  async accountHasMovements(code: string): Promise<boolean> {
    return this.journalSvc.hasMovementsForAccount(code);
  }

  // ─── Demote a leaf account to grouper (quita allowsMovement) ─────────────
  // Se usa cuando el usuario quiere agregar subcuentas a una cuenta que tenía
  // allowsMovement=true pero aún no tiene movimientos contables registrados.

  async demoteToGrouper(id: string): Promise<void> {
    const userId = this.authService.user()?.uid ?? 'unknown';
    const ref    = doc(this.firestore, `${this.colPath}/${id}`);
    await updateDoc(ref, this.cleanDoc({
      allowsMovement: false,
      isAuxiliary:    false,
      updatedAt:      Timestamp.now(),
      updatedBy:      userId
    }));
  }

  // ─── Create ───────────────────────────────────────────────────────────────

  async createAccount(input: AccountCreateInput): Promise<string> {
    const userId    = this.authService.user()?.uid ?? 'unknown';
    const now       = Timestamp.now();
    const level     = levelFromCode(input.code);
    const parentCode = parentCodeFromCode(input.code);

    // Validate: código único
    if (await this.codeExists(input.code)) {
      throw new Error(`Ya existe una cuenta con el código "${input.code}". Use un código diferente.`);
    }

    // Validate: cuenta padre debe existir
    if (parentCode) {
      const parentSnap = await getDocs(
        query(collection(this.firestore, this.colPath), where('code', '==', parentCode), limit(1))
      );
      if (parentSnap.empty) {
        throw new Error(`No existe una cuenta padre con código "${parentCode}". Cree primero la cuenta padre.`);
      }

      // Validate: tipo debe coincidir con el padre
      const parentData = parentSnap.docs[0].data() as Account;
      if (parentData.type !== input.type) {
        throw new Error(
          `El tipo "${input.type}" no coincide con el tipo de la cuenta padre "${parentCode}" (${parentData.type}). ` +
          `Una subcuenta debe heredar el tipo de su cuenta padre.`
        );
      }

      // Validate: la cuenta padre no puede tener allowsMovement=true al recibir una subcuenta.
      // El componente debe llamar a demoteToGrouper() antes de llegar aquí.
      if (parentData.allowsMovement) {
        throw new Error(
          `La cuenta padre "${parentCode} — ${parentData.name}" está marcada como cuenta de movimiento. ` +
          `Conviértala en cuenta agrupadora antes de agregarle subcuentas.`
        );
      }
    }

    // Validate: si va a tener allowsMovement=true, no puede tener hijos previos
    if (input.allowsMovement && await this.hasChildren(input.code)) {
      throw new Error(
        `La cuenta "${input.code}" ya tiene subcuentas. No se puede marcar como "Permite Movimiento".`
      );
    }

    const account: Omit<Account, 'id'> = {
      ...input,
      level,
      parentCode,
      createdBy: userId,
      createdAt: now,
      updatedAt: now
    };

    const ref = await addDoc(collection(this.firestore, this.colPath), this.cleanDoc(account));
    return ref.id;
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  async updateAccount(id: string, changes: Partial<Omit<Account, 'id' | 'createdAt' | 'createdBy'>>): Promise<void> {
    const userId = this.authService.user()?.uid ?? 'unknown';
    const ref    = doc(this.firestore, `${this.colPath}/${id}`);

    // Si el código cambia, validar que no tenga hijos (cambiar el código rompería la jerarquía)
    if (changes.code) {
      const currentSnap = await firstValueFrom(this.getAccount(id).pipe(take(1)));
      if (currentSnap && currentSnap.code !== changes.code) {
        if (await this.hasChildren(currentSnap.code)) {
          throw new Error(
            `No se puede cambiar el código de la cuenta "${currentSnap.code}" porque tiene subcuentas. ` +
            `Cambie o elimine primero las subcuentas dependientes.`
          );
        }
        // Validar unicidad del nuevo código
        if (await this.codeExists(changes.code, id)) {
          throw new Error(`Ya existe una cuenta con el código "${changes.code}". Use un código diferente.`);
        }
      }
    }

    // Si se intenta marcar allowsMovement=true, validar que no tenga hijos
    if (changes.allowsMovement === true) {
      const currentSnap = await firstValueFrom(this.getAccount(id).pipe(take(1)));
      if (currentSnap && await this.hasChildren(currentSnap.code)) {
        throw new Error(
          `No se puede marcar como "Permite Movimiento" la cuenta "${currentSnap.code}" porque tiene subcuentas. ` +
          `Una cuenta de movimiento no puede tener subcuentas.`
        );
      }
    }

    const payload: any = { ...changes, updatedAt: Timestamp.now(), updatedBy: userId };

    // Recalculate level and parentCode if code changed
    if (changes.code) {
      payload.level      = levelFromCode(changes.code);
      payload.parentCode = parentCodeFromCode(changes.code);
    }

    await updateDoc(ref, this.cleanDoc(payload));
  }

  // ─── Toggle active ────────────────────────────────────────────────────────

  async toggleActive(id: string, isActive: boolean): Promise<void> {
    const userId = this.authService.user()?.uid ?? 'unknown';
    const ref    = doc(this.firestore, `${this.colPath}/${id}`);
    await updateDoc(ref, this.cleanDoc({ isActive, updatedAt: Timestamp.now(), updatedBy: userId }));
  }

  // ─── Delete ───────────────────────────────────────────────────────────────

  async deleteAccount(id: string): Promise<void> {
    const account = await firstValueFrom(this.getAccount(id).pipe(take(1)));
    if (account) {
      // Validar: no eliminar si tiene subcuentas
      if (await this.hasChildren(account.code)) {
        throw new Error(
          `No se puede eliminar la cuenta "${account.code} — ${account.name}": tiene subcuentas dependientes. ` +
          `Elimine primero todas las subcuentas.`
        );
      }
      // Validar: no eliminar si tiene movimientos contables
      const hasMovements = await this.journalSvc.hasMovementsForAccount(account.code);
      if (hasMovements) {
        throw new Error(
          `No se puede eliminar la cuenta "${account.code} — ${account.name}": tiene movimientos contables asociados. ` +
          `Inactívela en vez de eliminarla.`
        );
      }
    }
    await deleteDoc(doc(this.firestore, `${this.colPath}/${id}`));
  }

  // ─── Seed Ecuador chart of accounts (idempotente) ────────────────────────
  // Usa setDoc con ID determinístico derivado del código para evitar duplicados
  // si se ejecuta más de una vez.

  async seedChartOfAccounts(): Promise<void> {
    const userId = this.authService.user()?.uid ?? 'unknown';
    const now    = Timestamp.now();

    // Cargar códigos existentes para omitir duplicados
    const existingSnap = await getDocs(collection(this.firestore, this.colPath));
    const existingCodes = new Set(existingSnap.docs.map(d => (d.data() as any).code as string));

    const toInsert = ECUADOR_CHART_OF_ACCOUNTS_SEED.filter(e => !existingCodes.has(e.code));
    if (!toInsert.length) return; // nada nuevo que insertar

    // Procesar en lotes de 450
    const batchSize = 450;
    for (let i = 0; i < toInsert.length; i += batchSize) {
      const chunk  = toInsert.slice(i, i + batchSize);
      const batch  = writeBatch(this.firestore);
      const colRef = collection(this.firestore, this.colPath);

      for (const entry of chunk) {
        // ID determinístico: reemplazar puntos por guiones bajos para evitar duplicados
        const safeId = entry.code.replace(/\./g, '_');
        const docRef = doc(colRef, safeId);
        const account: Omit<Account, 'id'> = {
          code:           entry.code,
          name:           entry.name,
          type:           entry.type,
          nature:         entry.nature,
          level:          levelFromCode(entry.code),
          parentCode:     parentCodeFromCode(entry.code),
          isActive:       true,
          isAuxiliary:    entry.allowsMovement,
          allowsMovement: entry.allowsMovement,
          createdBy:      userId,
          createdAt:      now,
          updatedAt:      now
        };
        batch.set(docRef, this.cleanDoc(account));
      }

      await batch.commit();
    }
  }

  // ─── Import from array (CSV/Excel parsed externally) ──────────────────────

  async importAccounts(entries: { code: string; name: string; type: AccountType; nature: AccountNature; allowsMovement: boolean }[]): Promise<{ created: number; skipped: number }> {
    const userId = this.authService.user()?.uid ?? 'unknown';
    const now    = Timestamp.now();
    let created  = 0;
    let skipped  = 0;

    // Cargar todos los códigos existentes para evitar duplicados
    const existingSnap = await getDocs(collection(this.firestore, this.colPath));
    const existingCodes = new Set(existingSnap.docs.map(d => (d.data() as any).code as string));

    // Process in batches of 450 (Firestore limit is 500 per batch)
    const batchSize = 450;
    for (let i = 0; i < entries.length; i += batchSize) {
      const chunk  = entries.slice(i, i + batchSize);
      const batch  = writeBatch(this.firestore);
      const colRef = collection(this.firestore, this.colPath);

      for (const entry of chunk) {
        if (!entry.code || !entry.name) { skipped++; continue; }
        // Omitir si ya existe ese código
        if (existingCodes.has(entry.code))  { skipped++; continue; }

        const docRef  = doc(colRef);
        const account: Omit<Account, 'id'> = {
          code:           entry.code,
          name:           entry.name,
          type:           entry.type,
          nature:         entry.nature || defaultNatureForType(entry.type),
          level:          levelFromCode(entry.code),
          parentCode:     parentCodeFromCode(entry.code),
          isActive:       true,
          isAuxiliary:    entry.allowsMovement,
          allowsMovement: entry.allowsMovement,
          createdBy:      userId,
          createdAt:      now,
          updatedAt:      now
        };
        batch.set(docRef, this.cleanDoc(account));
        existingCodes.add(entry.code); // evitar duplicados dentro del mismo import
        created++;
      }

      await batch.commit();
    }

    return { created, skipped };
  }
}
