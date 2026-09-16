import { Injectable, inject } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';
import {
  Firestore, Timestamp, collection, doc, getCountFromServer, getDoc, query, setDoc, updateDoc, where
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { FirestoreService } from '../../../core/services/firestore.service';
import { Channel, ChannelFormData, ChannelStatus } from '../models/channel.interface';

/** Mismo formato que valida el backend (functions/src/utils/channels.ts). */
export const CHANNEL_ID_PATTERN = /^[a-z][a-z0-9-]{1,39}$/;

/**
 * Canales de la plataforma. Solo el super admin de plataforma usa esto: las
 * reglas le niegan la escritura a cualquier otro rol.
 *
 * Los datos del canal se escriben directo en Firestore. Nombrar o retirar a su
 * administrador pasa por el callable manageChannelAdmin, porque toca claims.
 */
@Injectable({ providedIn: 'root' })
export class ChannelsService {
  private fs        = inject(FirestoreService);
  private firestore = inject(Firestore);
  private functions = inject(Functions);

  getChannels(): Observable<Channel[]> {
    return this.fs.getRootCollection<Channel>('channels');
  }

  /** Cuántas empresas tiene el canal. Cuenta en el servidor, sin bajar documentos. */
  async countCompanies(channelId: string): Promise<number> {
    const q = query(collection(this.firestore, 'companies'), where('channelId', '==', channelId));
    const snap = await getCountFromServer(q);
    return snap.data().count;
  }

  /**
   * Crea el canal. El id es permanente: viaja en el claim de su admin y en cada
   * empresa, así que no se puede renombrar después.
   */
  async createChannel(channelId: string, data: ChannelFormData): Promise<void> {
    if (!CHANNEL_ID_PATTERN.test(channelId)) {
      throw new Error('Identificador inválido: minúsculas, dígitos y guiones, 2 a 40 caracteres.');
    }
    const ref = doc(this.firestore, `channels/${channelId}`);
    if ((await getDoc(ref)).exists()) {
      throw new Error(`Ya existe un canal con el identificador '${channelId}'.`);
    }
    const now = Timestamp.now();
    await setDoc(ref, {
      name: data.name,
      contactEmail: data.contactEmail,
      status: 'active' as ChannelStatus,
      admins: {},
      createdAt: now,
      updatedAt: now,
    });
  }

  async updateChannel(channelId: string, data: Partial<ChannelFormData>): Promise<void> {
    await updateDoc(doc(this.firestore, `channels/${channelId}`), { ...data, updatedAt: Timestamp.now() });
  }

  /** Suspender corta de inmediato a su admin en callables y reglas. */
  async setStatus(channelId: string, status: ChannelStatus): Promise<void> {
    await updateDoc(doc(this.firestore, `channels/${channelId}`), { status, updatedAt: Timestamp.now() });
  }

  async grantAdmin(channelId: string, email: string): Promise<void> {
    await this.manageAdmin(channelId, email, 'grant');
  }

  async revokeAdmin(channelId: string, email: string): Promise<void> {
    await this.manageAdmin(channelId, email, 'revoke');
  }

  private async manageAdmin(channelId: string, email: string, action: 'grant' | 'revoke'): Promise<void> {
    const fn = httpsCallable<{ channelId: string; email: string; action: string }, unknown>(
      this.functions,
      'manageChannelAdmin'
    );
    await fn({ channelId, email, action });
  }
}
