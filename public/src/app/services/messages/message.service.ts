import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/firestore';
import { Message } from 'app/interfaces/message';

@Injectable({
    providedIn: 'root'
})
export class MessageService {

    constructor(private db: AngularFirestore) { }

    /**
     * Guarda un nuevo mensaje en Firestore
     * @param message Objeto mensaje a guardar
     * @returns Promise
     */
    public saveMessage(message: Message) {
        return this.db.collection('messages').doc(`${message.message_id}`).set(message);
    }

    /**
     * Obtiene todos los mensajes ordenados por fecha
     * @returns Observable de mensajes
     */
    public getAllMessages() {
        return this.db.collection('messages', ref =>
            ref.orderBy('message_timestamp', 'desc')
        ).valueChanges();
    }

    /**
     * Obtiene mensajes no leídos
     * @returns Observable de mensajes no leídos
     */
    public getUnreadMessages() {
        return this.db.collection('messages', ref =>
            ref.where('message_read', '==', false)
                .orderBy('message_timestamp', 'desc')
        ).valueChanges();
    }

    /**
     * Marca un mensaje como leído
     * @param messageId ID del mensaje
     * @returns Promise
     */
    public markAsRead(messageId: string) {
        return this.db.collection('messages').doc(messageId).update({
            message_read: true
        });
    }

    /**
     * Marca un mensaje como respondido
     * @param messageId ID del mensaje
     * @returns Promise
     */
    public markAsReplied(messageId: string) {
        return this.db.collection('messages').doc(messageId).update({
            message_replied: true
        });
    }

    /**
     * Elimina un mensaje
     * @param messageId ID del mensaje
     * @returns Promise
     */
    public deleteMessage(messageId: string) {
        return this.db.collection('messages').doc(messageId).delete();
    }
}
