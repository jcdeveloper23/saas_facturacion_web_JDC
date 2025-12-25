import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from 'environments/environment';
import { Observable } from 'rxjs';
import { AngularFirestore } from '@angular/fire/firestore';
import { StorageService } from '../storage/storage.service';

@Injectable({
    providedIn: 'root'
})
export class NotificationService {

    private baseUrl = `${environment.cloudFunctionsUrl}/api/v1`;

    constructor(
        private http: HttpClient,
        private db: AngularFirestore,
        private storageService: StorageService
    ) { }

    /**
     * Enviar notificación a un usuario específico
     */
    public sendNotificationToUser(userUid: string, title: string, body: string, image?: string, data: any = {}): Observable<any> {
        const url = `${this.baseUrl}/sendNotificationUser`;
        const payload = { userUid, title, body, image, data };
        return this.http.post(url, payload);
    }

    /**
     * Enviar notificación a todos los usuarios de un rol específico
     * @param role 1 para Clientes, 9 para Conductores
     */
    public sendNotificationToRole(role: number, title: string, body: string, image?: string, data: any = {}): Observable<any> {
        const url = `${this.baseUrl}/sendNotificationToRole`;
        const payload = { role, title, body, image, data };
        return this.http.post(url, payload);
    }

    /**
     * Enviar notificación a todos los conductores activos (Cloud Function existente)
     */
    public sendNotificationToActiveDrivers(title: string, body: string, data: any = {}): Observable<any> {
        const url = `${this.baseUrl}/sendNotification`;
        const payload = {
            title,
            body,
            data
        };
        return this.http.post(url, payload);
    }

    /**
     * Subir imagen para notificación
     */
    public uploadNotificationImage(file: File): Promise<string> {
        const filePath = `notifications/${Date.now()}_${file.name}`;
        return this.storageService.uploadFile(filePath, file);
    }

    /**
     * CRUD para Plantillas de Notificaciones
     */
    public saveTemplate(template: any) {
        if (!template.id) {
            template.id = this.db.createId();
        }
        return this.db.collection('notification_templates').doc(template.id).set(template);
    }

    public getTemplates() {
        return this.db.collection('notification_templates', ref => ref.orderBy('createdAt', 'desc')).valueChanges();
    }

    public deleteTemplate(id: string) {
        return this.db.collection('notification_templates').doc(id).delete();
    }
}
