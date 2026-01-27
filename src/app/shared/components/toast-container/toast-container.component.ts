import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastModule } from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';
import { NotificationService, Notification } from '../../../core/services/notification.service';

@Component({
    selector: 'app-toast-container',
    standalone: true,
    imports: [CommonModule, ToastModule, IconModule],
    template: `
        <div class="toast-container position-fixed top-0 end-0 p-3" style="z-index: 1090;">
            @for (toast of notifications(); track toast.id) {
                <c-toast [visible]="true" [color]="getColor(toast.type)" (visibleChange)="onVisibleChange($event, toast.id)">
                    <c-toast-header [closeButton]="toast.dismissible ?? true">
                        <svg [cIcon]="getIcon(toast.type)" class="me-2"></svg>
                        <strong class="me-auto">{{ toast.title }}</strong>
                    </c-toast-header>
                    <c-toast-body>
                        {{ toast.message }}
                    </c-toast-body>
                </c-toast>
            }
        </div>
    `
})
export class ToastContainerComponent {
    private notificationService = inject(NotificationService);

    notifications = this.notificationService.notifications;

    getColor(type: Notification['type']): string {
        const colors: Record<Notification['type'], string> = {
            success: 'success',
            error: 'danger',
            warning: 'warning',
            info: 'info'
        };
        return colors[type];
    }

    getIcon(type: Notification['type']): string {
        const icons: Record<Notification['type'], string> = {
            success: 'cilCheckCircle',
            error: 'cilXCircle',
            warning: 'cilWarning',
            info: 'cilInfo'
        };
        return icons[type];
    }

    onVisibleChange(visible: boolean, id: string): void {
        if (!visible) {
            this.notificationService.dismiss(id);
        }
    }
}
