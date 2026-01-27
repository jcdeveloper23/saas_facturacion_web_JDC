import { Injectable, signal, computed } from '@angular/core';

export interface Notification {
    id: string;
    type: 'success' | 'error' | 'warning' | 'info';
    title: string;
    message: string;
    duration?: number;
    dismissible?: boolean;
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
    private _notifications = signal<Notification[]>([]);

    readonly notifications = this._notifications.asReadonly();
    readonly hasNotifications = computed(() => this._notifications().length > 0);

    private generateId(): string {
        return `notif-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    }

    show(notification: Omit<Notification, 'id'>): string {
        const id = this.generateId();
        const newNotification: Notification = {
            id,
            duration: 5000,
            dismissible: true,
            ...notification
        };

        this._notifications.update(list => [...list, newNotification]);

        if (newNotification.duration && newNotification.duration > 0) {
            setTimeout(() => this.dismiss(id), newNotification.duration);
        }

        return id;
    }

    success(message: string, title: string = 'Operacion exitosa'): string {
        return this.show({ type: 'success', title, message });
    }

    error(message: string, title: string = 'Error'): string {
        return this.show({ type: 'error', title, message, duration: 8000 });
    }

    warning(message: string, title: string = 'Advertencia'): string {
        return this.show({ type: 'warning', title, message });
    }

    info(message: string, title: string = 'Informacion'): string {
        return this.show({ type: 'info', title, message });
    }

    dismiss(id: string): void {
        this._notifications.update(list => list.filter(n => n.id !== id));
    }

    dismissAll(): void {
        this._notifications.set([]);
    }
}
