/**
 * PersonaRoleExtension — declaración que un paquete registra para añadir
 * un rol nuevo al módulo de Personas sin modificar el código base.
 *
 * Patrón inspirado en FacturaScripts XMLView extensions:
 *   - El "guest" (ej. pkg_school_bar) declara qué rol añade y bajo qué condición.
 *   - El "host" (Personas) consume las extensiones activas vía PersonaExtensionsService.
 *   - El host no importa ni conoce al guest.
 *
 * Registro: app.config.ts con multi-provider PERSONA_ROLE_EXTENSIONS_TOKEN.
 */
export interface PersonaRoleExtension {
  /** Código del rol que se añade, guardado en Person.roles[] */
  role: string;

  /** Etiqueta singular para UI: "Estudiante" */
  label: string;

  /** Etiqueta plural para filtros y stats: "Estudiantes" */
  labelPlural: string;

  /** Nombre de ícono CoreUI (cil*) */
  icon: string;

  /** Color CoreUI (info, success, primary, warning, secondary, dark) */
  color: string;

  /** Paquete que debe estar activo para que este rol aparezca */
  packageCode: string;

  /** Módulo específico (opcional). Si se indica, también debe estar activo. */
  moduleCode?: string;
}

/**
 * PersonaRoleMeta — vista unificada que consume el formulario y la lista.
 * Cubre tanto los roles base como los extensivos.
 */
export interface PersonaRoleMeta {
  role: string;
  label: string;
  labelPlural: string;
  color: string;
  /** true = viene de un paquete externo; false = rol base del sistema */
  isExtension: boolean;
  packageCode?: string;
}
