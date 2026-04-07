export interface FieldConfig {
  /** Whether this field appears in the form */
  visible: boolean;
  /** Whether this field is required before saving */
  required: boolean;
  /** Optional label override (null = use catalog default) */
  label?: string;
}

/**
 * Per-entity form configuration stored in Firestore at:
 *   /companies/{companyId}/form-config/{entity}
 *
 * Fields not present in the map fall back to catalog defaults.
 * Locked fields (alwaysVisible / alwaysRequired) are stored for
 * completeness but the UI ignores their toggles.
 */
export interface EntityFormConfig {
  /** Map of fieldKey → FieldConfig */
  fields: Record<string, FieldConfig>;
  /** Last modification timestamp */
  updatedAt?: any;
}
