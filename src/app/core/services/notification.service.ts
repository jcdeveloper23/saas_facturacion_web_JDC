import { Injectable, signal, computed } from '@angular/core';
import Swal, { SweetAlertIcon } from 'sweetalert2';

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

    success(message: string, title: string = 'Listo'): string {
        return this.show({ type: 'success', title, message });
    }

    error(message: string, title: string = 'Algo salió mal'): string {
        return this.show({ type: 'error', title, message, duration: 8000 });
    }

    warning(message: string, title: string = 'Atención'): string {
        return this.show({ type: 'warning', title, message });
    }

    info(message: string, title: string = 'Información'): string {
        return this.show({ type: 'info', title, message });
    }

    dismiss(id: string): void {
        this._notifications.update(list => list.filter(n => n.id !== id));
    }

    dismissAll(): void {
        this._notifications.set([]);
    }

    /** Diálogo de confirmación centrado (SweetAlert2) */
    confirm(options: {
        title: string;
        text?: string;
        confirmText?: string;
        cancelText?: string;
        icon?: SweetAlertIcon;
        danger?: boolean;
    }): Promise<boolean> {
        return Swal.fire({
            title: options.title,
            text: options.text,
            icon: options.icon ?? 'question',
            showCancelButton: true,
            confirmButtonText: options.confirmText ?? 'Confirmar',
            cancelButtonText: options.cancelText ?? 'Cancelar',
            buttonsStyling: false,
            reverseButtons: true,
            focusCancel: true,
            customClass: {
                popup:         'swal-app',
                title:         'swal-app__title',
                htmlContainer: 'swal-app__text',
                confirmButton: options.danger ? 'swal-app__btn swal-app__btn--danger' : 'swal-app__btn swal-app__btn--confirm',
                cancelButton:  'swal-app__btn swal-app__btn--cancel',
                icon:          'swal-app__icon'
            }
        }).then(result => result.isConfirmed);
    }

    /** Alerta informativa centrada (SweetAlert2) */
    alert(options: {
        title: string;
        text?: string;
        icon?: SweetAlertIcon;
        confirmText?: string;
    }): Promise<void> {
        return Swal.fire({
            title: options.title,
            text: options.text,
            icon: options.icon ?? 'info',
            confirmButtonText: options.confirmText ?? 'Entendido',
            buttonsStyling: false,
            customClass: {
                popup:         'swal-app',
                title:         'swal-app__title',
                htmlContainer: 'swal-app__text',
                confirmButton: 'swal-app__btn swal-app__btn--confirm',
                icon:          'swal-app__icon'
            }
        }).then(() => undefined);
    }
}
