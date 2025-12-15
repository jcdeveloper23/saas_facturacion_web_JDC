import firebase from 'firebase/app';

type Timestamp = firebase.firestore.Timestamp;

/**
 * Interfaz completa del modelo de Cupón de Descuento
 * Basada en la especificación del documento SISTEMA_CUPONES_DESCUENTO.md
 */
export interface Coupon {
  // ==================== IDENTIFICACIÓN ====================

  /** ID único del cupón (generado automáticamente por Firestore) */
  couponId?: string;

  /** Código del cupón que ingresa el usuario (ej: "PRIMEVIAJE", "DESCUENTO50") */
  couponCode?: string;

  /** Nombre descriptivo del cupón (interno) */
  couponName?: string;

  /** Descripción para mostrar al usuario */
  couponDescription?: string;

  // ==================== TIPO DE DESCUENTO ====================

  /** Tipo de descuento: "percentage" | "fixed_amount" */
  couponDiscountType?: 'percentage' | 'fixed_amount';

  /** Valor del descuento (0-100 si es porcentaje, monto fijo si es fixed_amount) */
  couponDiscountValue?: number;

  /** Descuento máximo permitido (solo para porcentaje) */
  couponMaxDiscount?: number;

  /** Monto mínimo del viaje para aplicar el cupón */
  couponMinTripAmount?: number;

  // ==================== VALIDEZ TEMPORAL ====================

  /** Fecha de inicio de validez */
  couponStartDate?: Timestamp | Date | any;

  /** Fecha de expiración */
  couponEndDate?: Timestamp | Date | any;

  /** Estado activo/inactivo */
  couponIsActive?: boolean;

  // ==================== LÍMITES DE USO ====================

  /** Número máximo de usos totales del cupón (null = sin límite) */
  couponMaxTotalUses?: number;

  /** Número de veces usado hasta ahora */
  couponCurrentUses?: number;

  /** Número máximo de usos por usuario */
  couponMaxUsesPerUser?: number;

  // ==================== RESTRICCIONES ====================

  /** Solo para nuevos usuarios (primer viaje) */
  couponFirstTripOnly?: boolean;

  /** IDs de ciudades donde aplica el cupón */
  couponValidCities?: string[];

  /** IDs de tipos de servicio donde aplica */
  couponValidServiceTypes?: string[];

  /** Días de la semana válidos (0=Domingo, 6=Sábado) */
  couponValidDaysOfWeek?: number[];

  /** Horario de inicio válido (hora del día, 0-23) */
  couponValidStartHour?: number;

  /** Horario de fin válido (hora del día, 0-23) */
  couponValidEndHour?: number;

  /** Lista de UIDs de usuarios específicos (cupones personalizados) */
  couponValidUserIds?: string[];

  // ==================== CAMPAÑA Y CATEGORIZACIÓN ====================

  /** ID de campaña a la que pertenece */
  couponCampaignId?: string;

  /** Tags para organización */
  couponTags?: string[];

  /** Tipo de cupón: "public" | "private" | "automatic" */
  couponType?: 'public' | 'private' | 'automatic';

  // ==================== METADATOS ====================

  /** UID del admin que creó el cupón */
  couponCreatedBy?: string;

  /** Fecha de creación */
  couponCreatedAt?: Timestamp | Date | any;

  /** Fecha de última modificación */
  couponUpdatedAt?: Timestamp | Date | any;

  /** Notas internas (solo para administradores) */
  couponInternalNotes?: string;

  /** Imagen/ícono del cupón (URL) */
  couponImageUrl?: string;

  // ==================== MARKETING Y PUBLICIDAD ====================

  /** Título promocional corto para la app (ej: "¡50% OFF!") */
  couponMarketingTitle?: string;

  /** Subtítulo o descripción corta para banners (ej: "En tu primer viaje") */
  couponMarketingSubtitle?: string;

  /** Color primario para el banner en formato hex (ej: "#FF5733") */
  couponMarketingColor?: string;

  /** Color del texto para el banner en formato hex (ej: "#FFFFFF") */
  couponMarketingTextColor?: string;

  /** Color secundario para gradiente en formato hex */
  couponMarketingGradientColor?: string;

  /** Borde redondeado del banner (0-50, en píxeles) */
  couponMarketingBorderRadius?: number;

  /** Mostrar sombra en el banner */
  couponMarketingShowShadow?: boolean;

  /** Mostrar en banner principal de la app */
  couponShowInBanner?: boolean;

  /** Prioridad de visualización (1-10, mayor = más prioritario) */
  couponMarketingPriority?: number;

  /** Emoji o ícono para mostrar (ej: "🎉", "🔥", "⭐") */
  couponMarketingEmoji?: string;

  /** Texto del botón de acción (ej: "Usar ahora", "Aplicar cupón") */
  couponMarketingButtonText?: string;
}

/**
 * Interfaz para el resultado de validación de un cupón
 */
export interface CouponValidationResult {
  /** Si el cupón es válido */
  isValid: boolean;

  /** Código de error si no es válido */
  errorCode?: string;

  /** Mensaje de error */
  errorMessage?: string;

  /** Monto del descuento calculado */
  discountAmount?: number;

  /** Cupón validado */
  coupon?: Coupon;
}

/**
 * Interfaz para el registro de uso de cupones
 */
export interface CouponUsage {
  /** ID del registro de uso */
  usageId?: string;

  /** ID del cupón usado */
  couponId?: string;

  /** Código del cupón */
  couponCode?: string;

  /** UID del usuario que usó el cupón */
  userId?: string;

  /** ID del viaje donde se usó */
  tripId?: string;

  /** Monto original del viaje */
  originalAmount?: number;

  /** Monto del descuento aplicado */
  discountAmount?: number;

  /** Monto final después del descuento */
  finalAmount?: number;

  /** Fecha y hora de uso */
  usedAt?: Timestamp | Date | any;

  /** Ciudad donde se usó */
  cityId?: string;

  /** Tipo de servicio */
  serviceTypeId?: string;
}
