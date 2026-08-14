import { Injectable, computed, inject } from '@angular/core';
import { TenantService } from './tenant.service';
import { PERSONA_ROLE_EXTENSIONS_TOKEN } from '../tokens/persona-extensions.token';
import {
  PersonaRoleExtension,
  PersonaRoleMeta
} from '../interfaces/persona-extension.interface';

/**
 * Metadatos de los roles base del sistema (siempre disponibles).
 * Equivalente al XML base que FacturaScripts carga antes de aplicar extensiones.
 */
const BASE_ROLES: PersonaRoleMeta[] = [
  { role: 'customer', label: 'Cliente',    labelPlural: 'Clientes',    color: 'info',      isExtension: false },
  { role: 'supplier', label: 'Proveedor',  labelPlural: 'Proveedores', color: 'warning',   isExtension: false },
  { role: 'employee', label: 'Empleado',   labelPlural: 'Empleados',   color: 'success',   isExtension: false },
  { role: 'contact',  label: 'Contacto',   labelPlural: 'Contactos',   color: 'secondary', isExtension: false },
  { role: 'other',    label: 'Otro',       labelPlural: 'Otros',       color: 'dark',      isExtension: false },
];

/**
 * PersonaExtensionsService — orquesta la fusión de roles base + extensiones activas.
 *
 * Patrón FacturaScripts:
 *   - BASE_ROLES = XMLView base del módulo EditCliente
 *   - registeredExtensions = Extension/XMLView/EditCliente.xml de cada plugin
 *   - activeRoleExtensions() filtra por paquetes activos del tenant (Init.php en runtime)
 *   - allAvailableRoles() = resultado fusionado que consumen los componentes
 */
@Injectable({ providedIn: 'root' })
export class PersonaExtensionsService {
  private tenant = inject(TenantService);

  /**
   * Todos los arrays aportados vía multi-provider, aplanados en una sola lista.
   * Si ningún paquete registra extensiones, el token no existe → array vacío.
   */
  private readonly registeredExtensions: PersonaRoleExtension[] =
    (inject(PERSONA_ROLE_EXTENSIONS_TOKEN, { optional: true }) as PersonaRoleExtension[][] | null)
      ?.flat() ?? [];

  /**
   * Extensiones cuyo paquete (y módulo opcional) está activo en el tenant actual.
   * Se recalcula reactivamente cuando cambia la empresa o sus paquetes activos.
   */
  readonly activeRoleExtensions = computed<PersonaRoleExtension[]>(() =>
    this.registeredExtensions.filter(ext =>
      this.tenant.hasPackage(ext.packageCode) &&
      (!ext.moduleCode || this.tenant.hasModule(ext.moduleCode))
    )
  );

  /**
   * Lista completa de roles disponibles para el tenant: base + extensiones activas.
   * Esta es la señal que consumen PersonFormComponent y PersonasListComponent.
   */
  readonly allAvailableRoles = computed<PersonaRoleMeta[]>(() => [
    ...BASE_ROLES,
    ...this.activeRoleExtensions().map(ext => ({
      role:        ext.role,
      label:       ext.label,
      labelPlural: ext.labelPlural,
      color:       ext.color,
      isExtension: true,
      packageCode: ext.packageCode
    }))
  ]);

  /** Devuelve true si el rol dado está disponible para este tenant. */
  isRoleAvailable(role: string): boolean {
    return this.allAvailableRoles().some(m => m.role === role);
  }

  /** Busca los metadatos de un rol por su código. */
  getRoleMeta(role: string): PersonaRoleMeta | undefined {
    return this.allAvailableRoles().find(m => m.role === role);
  }
}
