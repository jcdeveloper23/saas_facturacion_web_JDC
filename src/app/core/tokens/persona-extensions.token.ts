import { InjectionToken } from '@angular/core';
import { PersonaRoleExtension } from '../interfaces/persona-extension.interface';

/**
 * Token multi-provider para registrar extensiones de roles en el módulo Personas.
 *
 * Cada paquete que quiera añadir roles proporciona su array en app.config.ts:
 *
 *   { provide: PERSONA_ROLE_EXTENSIONS_TOKEN, useValue: SCHOOL_BAR_PERSONA_EXTENSIONS, multi: true }
 *
 * PersonaExtensionsService recoge todos los arrays, los aplana y filtra
 * según los paquetes activos del tenant — equivalente al Init.php de FacturaScripts.
 */
export const PERSONA_ROLE_EXTENSIONS_TOKEN =
  new InjectionToken<PersonaRoleExtension[]>('PERSONA_ROLE_EXTENSIONS');
