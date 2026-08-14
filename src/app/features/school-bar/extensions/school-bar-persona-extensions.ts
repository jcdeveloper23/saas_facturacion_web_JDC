import { PersonaRoleExtension } from '../../../core/interfaces/persona-extension.interface';

/**
 * Extensiones de roles que pkg_school_bar aporta al módulo Personas.
 *
 * Patrón FacturaScripts — Extension/XMLView/EditCliente.xml:
 *   Este archivo es el equivalente al XML extension del plugin.
 *   Solo se activa cuando pkg_school_bar está habilitado en el tenant.
 *   El módulo Personas (host) no importa este archivo; lo recibe
 *   indirectamente a través de PERSONA_ROLE_EXTENSIONS_TOKEN vía app.config.ts.
 *
 * Registro: app.config.ts
 *   { provide: PERSONA_ROLE_EXTENSIONS_TOKEN, useValue: SCHOOL_BAR_PERSONA_EXTENSIONS, multi: true }
 */
export const SCHOOL_BAR_PERSONA_EXTENSIONS: PersonaRoleExtension[] = [
  {
    role:        'student',
    label:       'Estudiante',
    labelPlural: 'Estudiantes',
    icon:        'cilBook',
    color:       'primary',
    packageCode: 'pkg_school_bar',
    moduleCode:  'school_students',
  },
  {
    role:        'teacher',
    label:       'Profesor',
    labelPlural: 'Profesores',
    icon:        'cilEducation',
    color:       'success',
    packageCode: 'pkg_school_bar',
    moduleCode:  'school_students',
  },
];
