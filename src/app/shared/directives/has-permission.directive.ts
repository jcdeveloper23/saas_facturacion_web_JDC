import {
  Directive,
  Input,
  TemplateRef,
  ViewContainerRef,
  ElementRef,
  Renderer2,
  inject,
  effect,
  OnDestroy
} from '@angular/core';
import { PermissionsService } from '../../core/services/permissions.service';
import { PermissionString } from '../../core/interfaces/permission.interface';

/**
 * Structural directive to show/hide elements based on permissions
 *
 * Usage:
 *
 * Single permission:
 * <button *hasPermission="'devices.create'">Crear</button>
 *
 * Multiple permissions (AND - default):
 * <button *hasPermission="['devices.view', 'devices.update']">Editar</button>
 *
 * Multiple permissions (OR):
 * <button *hasPermission="['devices.update', 'devices.manage']; mode: 'any'">Editar</button>
 *
 * With else template:
 * <button *hasPermission="'devices.delete'; else noAccess">Eliminar</button>
 * <ng-template #noAccess>Sin acceso</ng-template>
 */
@Directive({
  selector: '[hasPermission]',
  standalone: true
})
export class HasPermissionDirective implements OnDestroy {
  private templateRef = inject(TemplateRef<unknown>);
  private viewContainer = inject(ViewContainerRef);
  private permissionsService = inject(PermissionsService);

  private permissions: PermissionString[] = [];
  private mode: 'all' | 'any' = 'all';
  private elseTemplate: TemplateRef<unknown> | null = null;
  private hasView = false;
  private effectRef: ReturnType<typeof effect> | null = null;

  @Input()
  set hasPermission(value: PermissionString | PermissionString[]) {
    this.permissions = Array.isArray(value) ? value : [value];
    this.updateView();
  }

  @Input()
  set hasPermissionMode(mode: 'all' | 'any') {
    this.mode = mode;
    this.updateView();
  }

  @Input()
  set hasPermissionElse(template: TemplateRef<unknown>) {
    this.elseTemplate = template;
    this.updateView();
  }

  constructor() {
    // React to permission changes (e.g., after login/logout)
    this.effectRef = effect(() => {
      // Access the signal to track it
      this.permissionsService.permissions();
      this.updateView();
    });
  }

  ngOnDestroy(): void {
    // Effect cleanup is automatic in Angular 21
  }

  private updateView(): void {
    const hasPermission = this.checkPermissions();

    if (hasPermission && !this.hasView) {
      this.viewContainer.clear();
      this.viewContainer.createEmbeddedView(this.templateRef);
      this.hasView = true;
    } else if (!hasPermission) {
      this.viewContainer.clear();
      if (this.elseTemplate) {
        this.viewContainer.createEmbeddedView(this.elseTemplate);
      }
      this.hasView = false;
    }
  }

  private checkPermissions(): boolean {
    if (this.permissions.length === 0) return true;

    return this.mode === 'all'
      ? this.permissionsService.hasAllPermissions(this.permissions)
      : this.permissionsService.hasAnyPermission(this.permissions);
  }
}

/**
 * Directive to disable elements based on permissions.
 * Unlike hasPermission, this shows the element but disables it
 * (and adds aria-disabled for accessibility).
 *
 * Usage:
 * <button [disableIfNoPermission]="'invoices.delete'">Eliminar</button>
 * <button [disableIfNoPermission]="['invoices.edit', 'invoices.create']">Guardar</button>
 */
@Directive({
  selector: '[disableIfNoPermission]',
  standalone: true
})
export class DisableIfNoPermissionDirective {
  private permissionsService = inject(PermissionsService);
  private elementRef         = inject(ElementRef);
  private renderer           = inject(Renderer2);

  @Input()
  set disableIfNoPermission(permission: PermissionString | PermissionString[]) {
    const permissions  = Array.isArray(permission) ? permission : [permission];
    const hasPermission = this.permissionsService.hasAnyPermission(permissions);
    const el: HTMLElement = this.elementRef.nativeElement;

    if (hasPermission) {
      this.renderer.removeAttribute(el, 'disabled');
      this.renderer.removeAttribute(el, 'aria-disabled');
      this.renderer.removeClass(el, 'disabled');
    } else {
      this.renderer.setAttribute(el, 'disabled', 'true');
      this.renderer.setAttribute(el, 'aria-disabled', 'true');
      this.renderer.addClass(el, 'disabled');
    }
  }
}
