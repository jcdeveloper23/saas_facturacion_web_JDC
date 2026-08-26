import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastModule } from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';
import { NotificationService, Notification } from '../../../core/services/notification.service';

@Component({
    selector: 'app-toast-container',
    standalone: true,
    templateUrl: './toast-container.component.html',
    styleUrl: './toast-container.component.scss',
    imports: [CommonModule, ToastModule, IconModule]
})
export class ToastContainerComponent {
    private notificationService = inject(NotificationService);

    notifications = this.notificationService.notifications;

    // IDs en proceso de salida (para animación fade-out antes de remover del DOM)
    private _exiting = signal<Set<string>>(new Set());

    isVisible(id: string): boolean {
        return !this._exiting().has(id);
    }

    dismiss(id: string): void {
        this._exiting.update(s => new Set([...s, id]));
        setTimeout(() => {
            this.notificationService.dismiss(id);
            this._exiting.update(s => { s.delete(id); return new Set(s); });
        }, 300);
    }

    getHeaderClass(type: Notification['type']): string {
        const map: Record<Notification['type'], string> = {
            success: 'header-success',
            error:   'header-danger',
            warning: 'header-warning',
            info:    'header-info'
        };
        return map[type];
    }

    getIcon(type: Notification['type']): string {
        const map: Record<Notification['type'], string> = {
            success: 'cilCheckCircle',
            error:   'cilXCircle',
            warning: 'cilWarning',
            info:    'cilInfo'
        };
        return map[type];
    }

    getIconClass(type: Notification['type']): string {
        const map: Record<Notification['type'], string> = {
            success: 'icon-success',
            error:   'icon-danger',
            warning: 'icon-warning',
            info:    'icon-info'
        };
        return map[type];
    }

    getProgressClass(type: Notification['type']): string {
        const map: Record<Notification['type'], string> = {
            success: 'progress-success',
            error:   'progress-danger',
            warning: 'progress-warning',
            info:    'progress-info'
        };
        return map[type];
    }
}
