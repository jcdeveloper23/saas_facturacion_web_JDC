import { Injectable, inject } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';
import {
  Firestore, Timestamp, collection, doc, getCountFromServer, getDoc, query, setDoc, updateDoc, where
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
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
  private authSvc   = inject(AuthService);

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

  /**
   * Nombra administrador. Si el correo no tenía usuario, el backend lo crea sin
   * contraseña y acá se le envía el correo de Firebase para que la defina.
   *
   * @returns created — si el usuario se creó; resetEmailSent — si el correo salió.
   */
  async grantAdmin(channelId: string, email: string): Promise<{ created: boolean; resetEmailSent: boolean }> {
    const { created } = await this.manageAdmin(channelId, email, 'grant');
    if (!created) return { created, resetEmailSent: false };
    try {
      await this.authSvc.resetPassword(email);
      return { created, resetEmailSent: true };
    } catch (err) {
      console.error('No se pudo enviar el correo para definir contraseña:', err);
      return { created, resetEmailSent: false };
    }
  }

  async revokeAdmin(channelId: string, email: string): Promise<void> {
    await this.manageAdmin(channelId, email, 'revoke');
  }

  /** Reenvía el correo de Firebase para (re)definir la contraseña. */
  async sendPasswordSetupEmail(email: string): Promise<void> {
    await this.authSvc.resetPassword(email);
  }

  private async manageAdmin(
    channelId: string, email: string, action: 'grant' | 'revoke'
  ): Promise<{ created: boolean }> {
    const fn = httpsCallable<
      { channelId: string; email: string; action: string },
      { created?: boolean }
    >(this.functions, 'manageChannelAdmin');
    const res = await fn({ channelId, email, action });
    return { created: res.data?.created === true };
  }
}
