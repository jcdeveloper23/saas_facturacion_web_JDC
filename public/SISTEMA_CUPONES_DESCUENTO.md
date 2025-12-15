# 🎟️ Sistema de Cupones de Descuento - iMove Driver

**Documento de Arquitectura y Diseño Técnico**

---

## 📋 Tabla de Contenido

1. [Visión General](#1-visión-general)
2. [Análisis del Sistema Actual](#2-análisis-del-sistema-actual)
3. [Arquitectura del Sistema de Cupones](#3-arquitectura-del-sistema-de-cupones)
4. [Modelo de Datos](#4-modelo-de-datos)
5. [Tipos de Cupones](#5-tipos-de-cupones)
6. [Generación de Cupones](#6-generación-de-cupones)
7. [Validación y Aplicación](#7-validación-y-aplicación)
8. [Integración con Pricing](#8-integración-con-pricing)
9. [Casos Especiales](#9-casos-especiales)
10. [Repositorio y Lógica](#10-repositorio-y-lógica)
11. [UI/UX de Usuario](#11-uiux-de-usuario)
12. [Panel de Administración](#12-panel-de-administración)
13. [Seguridad y Prevención de Fraude](#13-seguridad-y-prevención-de-fraude)
14. [Implementación Paso a Paso](#14-implementación-paso-a-paso)

---

## 1. Visión General

### Objetivo

Implementar un sistema completo de cupones de descuento que permita:

- ✅ Aplicar descuentos en viajes solicitados por usuarios
- ✅ Generar cupones personalizados o masivos
- ✅ Validar automáticamente cupones antes de aplicarlos
- ✅ Configurar casos especiales (primer viaje gratis, referidos, etc.)
- ✅ Administrar cupones desde un panel
- ✅ Prevenir fraude y uso indebido

### Alcance

**Incluye:**
- Sistema completo de cupones
- Integración con cálculo de tarifas existente
- Validación en tiempo real
- Panel de administración
- Casos de uso especiales

**No incluye (futuro):**
- Sistema de referidos automático
- Gamificación con cupones
- Cupones geográficos (por zona)

---

## 2. Análisis del Sistema Actual

### 2.1 Sistema de Pricing Existente

El proyecto ya cuenta con un sistema robusto de pricing:

**Ubicación:** `lib/src/modules/pricing/models/city_model.dart`

**Componentes:**
- `CityServicePricing`: Configuración de precios por servicio
- `PriceRange`: Rangos de precios progresivos
- `CityModel`: Modelo principal de ciudad con pricing

**Cálculo actual:**
```dart
double calculateTripPrice({
  required double distanceInKm,
  int? durationInMinutes,
  DateTime? tripDateTime,
}) {
  // Precio base
  double totalPrice = basePrice ?? 0.0;

  // + Kilómetros adicionales
  // + Tiempo de espera
  // + Recargo nocturno

  return totalPrice;
}
```

**Desglose disponible:**
```dart
Map<String, dynamic> getPriceBreakdown({...}) {
  return {
    'basePrice': baseAmount,
    'distancePrice': kmAmount,
    'timePrice': timeAmount,
    'nightSurcharge': nightSurcharge,
    'subtotal': subtotal,
    'total': total,
    // ...
  };
}
```

### 2.2 Flujo de Solicitud de Viaje

**Controladores relevantes:**
- `UserRequestCarController`: Gestiona solicitudes como cliente
- `RequestTripController`: Nueva UI estilo Uber
- `DriverRequestCarLogic`: Gestión de viajes como conductor

**Flujo actual:**
1. Usuario selecciona origen y destino
2. Se calcula distancia y precio estimado
3. Usuario selecciona tipo de servicio
4. Usuario ofrece tarifa (puede modificar precio sugerido)
5. Se crea `RequestVehicle` en Firestore
6. Se busca conductor disponible

### 2.3 Modelo RequestVehicle

**Campos relacionados con precio:**
```dart
String? requestCustomerOffer;       // Tarifa ofrecida por el cliente
String? requestTripCost;           // Costo total del viaje
String? requestCommission;         // Comisión de iMove
String? requestDriverEarnings;     // Ganancia del conductor
String? requestPaymentType;        // Método de pago
```

**Nota:** Actualmente NO hay campos para cupones.

---

## 3. Arquitectura del Sistema de Cupones

### 3.1 Componentes Principales

```
┌─────────────────────────────────────────────────────────────┐
│                    SISTEMA DE CUPONES                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │   Modelo de  │  │  Generador   │  │  Validador   │       │
│  │    Cupón     │  │  de Cupones  │  │  de Cupones  │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │  Aplicador   │  │  Repositorio │  │  Controller  │       │
│  │  de Cupones  │  │   Firestore  │  │   (GetX)     │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │  UI Cliente  │  │ UI Admin     │  │  Analytics   │       │
│  │  (Usuario)   │  │ (Dashboard)  │  │              │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Flujo de Aplicación de Cupón

```
Usuario                  App                   Firestore
   │                     │                        │
   │  1. Ingresa código  │                        │
   ├────────────────────>│                        │
   │                     │                        │
   │                     │  2. Buscar cupón       │
   │                     ├───────────────────────>│
   │                     │                        │
   │                     │  3. Datos del cupón    │
   │                     │<───────────────────────┤
   │                     │                        │
   │                     │  4. Validar cupón      │
   │                     │  (reglas, expiración)  │
   │                     │                        │
   │  5. Cupón válido    │                        │
   │<────────────────────┤                        │
   │                     │                        │
   │  6. Ver descuento   │                        │
   │<────────────────────┤                        │
   │                     │                        │
   │  7. Confirmar viaje │                        │
   │────────────────────>│                        │
   │                     │                        │
   │                     │  8. Marcar cupón usado │
   │                     ├───────────────────────>│
   │                     │                        │
   │                     │  9. Crear viaje        │
   │                     ├───────────────────────>│
   │                     │                        │
```

### 3.3 Estructura de Archivos

```
lib/src/modules/coupons/
├── models/
│   ├── coupon_model.dart              # Modelo principal
│   ├── coupon_usage_model.dart        # Registro de uso
│   └── coupon_validation_result.dart  # Resultado de validación
├── data/
│   └── coupon_repository.dart         # Interacción con Firestore
├── controller/
│   ├── coupon_controller.dart         # Lógica de negocio (GetX)
│   └── coupon_state.dart              # Estado del controlador
├── views/
│   ├── coupon_input_widget.dart       # Campo de entrada de cupón
│   ├── coupon_applied_widget.dart     # Cupón aplicado (display)
│   └── my_coupons_page.dart           # Lista de cupones del usuario
├── widgets/
│   ├── coupon_card.dart               # Tarjeta de cupón
│   └── coupon_badge.dart              # Badge de descuento
└── services/
    ├── coupon_generator.dart          # Generador de códigos
    └── coupon_validator.dart          # Validador de reglas
```

---

## 4. Modelo de Datos

### 4.1 Modelo Principal: CouponModel

```dart
/// Modelo principal de Cupón de Descuento
class CouponModel {
  // ==================== IDENTIFICACIÓN ====================

  /// ID único del cupón
  /// Generado automáticamente por Firestore
  String? couponId;

  /// Código del cupón que ingresa el usuario
  /// Ejemplo: "PRIMEVIAJE", "DESCUENTO50", "NAVIDAD2024"
  /// Único en toda la plataforma
  String? couponCode;

  /// Nombre descriptivo del cupón (interno)
  /// Ejemplo: "Cupón Primer Viaje"
  String? couponName;

  /// Descripción para mostrar al usuario
  /// Ejemplo: "50% de descuento en tu primer viaje"
  String? couponDescription;

  // ==================== TIPO DE DESCUENTO ====================

  /// Tipo de descuento
  /// Valores: "percentage" | "fixed_amount"
  String? couponDiscountType;

  /// Valor del descuento
  /// - Si es "percentage": valor entre 0-100 (ej: 50 = 50%)
  /// - Si es "fixed_amount": monto fijo (ej: 5000 = $5,000 COP)
  double? couponDiscountValue;

  /// Descuento máximo permitido (solo para porcentaje)
  /// Evita descuentos exagerados en viajes largos
  /// Ejemplo: maxDiscount=10000 → máximo $10,000 de descuento
  double? couponMaxDiscount;

  /// Monto mínimo del viaje para aplicar el cupón
  /// Ejemplo: minTripAmount=5000 → solo viajes de $5,000+
  double? couponMinTripAmount;

  // ==================== VALIDEZ TEMPORAL ====================

  /// Fecha de inicio de validez
  Timestamp? couponStartDate;

  /// Fecha de expiración
  Timestamp? couponEndDate;

  /// Estado activo/inactivo
  bool? couponIsActive;

  // ==================== LÍMITES DE USO ====================

  /// Número máximo de usos TOTALES del cupón
  /// null = sin límite
  /// Ejemplo: 1000 = solo los primeros 1000 usuarios
  int? couponMaxTotalUses;

  /// Número de veces usado hasta ahora
  int? couponCurrentUses;

  /// Número máximo de usos POR USUARIO
  /// Ejemplo: 1 = solo una vez por usuario
  int? couponMaxUsesPerUser;

  // ==================== RESTRICCIONES ====================

  /// Solo para nuevos usuarios (primer viaje)
  bool? couponFirstTripOnly;

  /// IDs de ciudades donde aplica el cupón
  /// null o vacío = aplica en todas las ciudades
  List<String>? couponValidCities;

  /// IDs de tipos de servicio donde aplica
  /// null o vacío = aplica en todos los servicios
  /// Ejemplo: ["auto_001", "premium_002"]
  List<String>? couponValidServiceTypes;

  /// Días de la semana válidos (0=Domingo, 6=Sábado)
  /// null o vacío = todos los días
  /// Ejemplo: [1,2,3,4,5] = solo lunes a viernes
  List<int>? couponValidDaysOfWeek;

  /// Horario de inicio válido (hora del día, 0-23)
  /// Ejemplo: 6 = válido desde las 6:00 AM
  int? couponValidStartHour;

  /// Horario de fin válido (hora del día, 0-23)
  /// Ejemplo: 22 = válido hasta las 10:00 PM
  int? couponValidEndHour;

  /// Lista de UIDs de usuarios específicos (cupones personalizados)
  /// null o vacío = para todos los usuarios
  List<String>? couponValidUserIds;

  // ==================== CAMPAÑA Y CATEGORIZACIÓN ====================

  /// ID de campaña a la que pertenece
  /// Ejemplo: "campaign_black_friday_2024"
  String? couponCampaignId;

  /// Tags para organización
  /// Ejemplo: ["marketing", "referido", "primer_viaje"]
  List<String>? couponTags;

  /// Tipo de cupón
  /// Valores: "public" | "private" | "automatic"
  /// - public: cualquiera con el código puede usarlo
  /// - private: solo usuarios específicos
  /// - automatic: se aplica automáticamente (ej: primer viaje)
  String? couponType;

  // ==================== METADATOS ====================

  /// UID del admin que creó el cupón
  String? couponCreatedBy;

  /// Fecha de creación
  Timestamp? couponCreatedAt;

  /// Fecha de última modificación
  Timestamp? couponUpdatedAt;

  /// Notas internas (solo para administradores)
  String? couponInternalNotes;

  /// Imagen/ícono del cupón (URL)
  String? couponImageUrl;

  // ==================== CONSTRUCTOR ====================

  CouponModel({
    this.couponId,
    this.couponCode,
    this.couponName,
    this.couponDescription,
    this.couponDiscountType,
    this.couponDiscountValue,
    this.couponMaxDiscount,
    this.couponMinTripAmount,
    this.couponStartDate,
    this.couponEndDate,
    this.couponIsActive = true,
    this.couponMaxTotalUses,
    this.couponCurrentUses = 0,
    this.couponMaxUsesPerUser = 1,
    this.couponFirstTripOnly = false,
    this.couponValidCities,
    this.couponValidServiceTypes,
    this.couponValidDaysOfWeek,
    this.couponValidStartHour,
    this.couponValidEndHour,
    this.couponValidUserIds,
    this.couponCampaignId,
    this.couponTags,
    this.couponType = 'public',
    this.couponCreatedBy,
    this.couponCreatedAt,
    this.couponUpdatedAt,
    this.couponInternalNotes,
    this.couponImageUrl,
  });

  // ==================== SERIALIZACIÓN ====================

  factory CouponModel.fromJson(Map<String, dynamic> json) => CouponModel(
    couponId: json["couponId"],
    couponCode: json["couponCode"],
    couponName: json["couponName"],
    couponDescription: json["couponDescription"],
    couponDiscountType: json["couponDiscountType"],
    couponDiscountValue: json["couponDiscountValue"]?.toDouble(),
    couponMaxDiscount: json["couponMaxDiscount"]?.toDouble(),
    couponMinTripAmount: json["couponMinTripAmount"]?.toDouble(),
    couponStartDate: json["couponStartDate"],
    couponEndDate: json["couponEndDate"],
    couponIsActive: json["couponIsActive"] ?? true,
    couponMaxTotalUses: json["couponMaxTotalUses"],
    couponCurrentUses: json["couponCurrentUses"] ?? 0,
    couponMaxUsesPerUser: json["couponMaxUsesPerUser"] ?? 1,
    couponFirstTripOnly: json["couponFirstTripOnly"] ?? false,
    couponValidCities: json["couponValidCities"] != null
        ? List<String>.from(json["couponValidCities"])
        : null,
    couponValidServiceTypes: json["couponValidServiceTypes"] != null
        ? List<String>.from(json["couponValidServiceTypes"])
        : null,
    couponValidDaysOfWeek: json["couponValidDaysOfWeek"] != null
        ? List<int>.from(json["couponValidDaysOfWeek"])
        : null,
    couponValidStartHour: json["couponValidStartHour"],
    couponValidEndHour: json["couponValidEndHour"],
    couponValidUserIds: json["couponValidUserIds"] != null
        ? List<String>.from(json["couponValidUserIds"])
        : null,
    couponCampaignId: json["couponCampaignId"],
    couponTags: json["couponTags"] != null
        ? List<String>.from(json["couponTags"])
        : null,
    couponType: json["couponType"] ?? 'public',
    couponCreatedBy: json["couponCreatedBy"],
    couponCreatedAt: json["couponCreatedAt"],
    couponUpdatedAt: json["couponUpdatedAt"],
    couponInternalNotes: json["couponInternalNotes"],
    couponImageUrl: json["couponImageUrl"],
  );

  Map<String, dynamic> toJson() => {
    "couponId": couponId,
    "couponCode": couponCode,
    "couponName": couponName,
    "couponDescription": couponDescription,
    "couponDiscountType": couponDiscountType,
    "couponDiscountValue": couponDiscountValue,
    "couponMaxDiscount": couponMaxDiscount,
    "couponMinTripAmount": couponMinTripAmount,
    "couponStartDate": couponStartDate,
    "couponEndDate": couponEndDate,
    "couponIsActive": couponIsActive,
    "couponMaxTotalUses": couponMaxTotalUses,
    "couponCurrentUses": couponCurrentUses,
    "couponMaxUsesPerUser": couponMaxUsesPerUser,
    "couponFirstTripOnly": couponFirstTripOnly,
    "couponValidCities": couponValidCities,
    "couponValidServiceTypes": couponValidServiceTypes,
    "couponValidDaysOfWeek": couponValidDaysOfWeek,
    "couponValidStartHour": couponValidStartHour,
    "couponValidEndHour": couponValidEndHour,
    "couponValidUserIds": couponValidUserIds,
    "couponCampaignId": couponCampaignId,
    "couponTags": couponTags,
    "couponType": couponType,
    "couponCreatedBy": couponCreatedBy,
    "couponCreatedAt": couponCreatedAt ?? FieldValue.serverTimestamp(),
    "couponUpdatedAt": couponUpdatedAt ?? FieldValue.serverTimestamp(),
    "couponInternalNotes": couponInternalNotes,
    "couponImageUrl": couponImageUrl,
  };

  // ==================== MÉTODOS DE UTILIDAD ====================

  /// Verifica si el cupón está expirado
  bool isExpired() {
    if (couponEndDate == null) return false;
    return DateTime.now().isAfter(couponEndDate!.toDate());
  }

  /// Verifica si el cupón ya inició su validez
  bool hasStarted() {
    if (couponStartDate == null) return true;
    return DateTime.now().isAfter(couponStartDate!.toDate());
  }

  /// Verifica si el cupón está dentro del rango de fechas válidas
  bool isWithinValidDates() {
    return hasStarted() && !isExpired();
  }

  /// Verifica si alcanzó el límite de usos totales
  bool hasReachedTotalUsesLimit() {
    if (couponMaxTotalUses == null) return false;
    return (couponCurrentUses ?? 0) >= couponMaxTotalUses!;
  }

  /// Calcula el descuento para un monto dado
  double calculateDiscount(double tripAmount) {
    if (couponDiscountType == 'percentage') {
      double discount = tripAmount * ((couponDiscountValue ?? 0) / 100);

      // Aplicar descuento máximo si existe
      if (couponMaxDiscount != null && discount > couponMaxDiscount!) {
        return couponMaxDiscount!;
      }

      return discount;
    } else if (couponDiscountType == 'fixed_amount') {
      // No puede ser mayor que el monto del viaje
      double discount = couponDiscountValue ?? 0;
      return discount > tripAmount ? tripAmount : discount;
    }

    return 0.0;
  }

  /// Obtiene el texto descriptivo del descuento
  String getDiscountText() {
    if (couponDiscountType == 'percentage') {
      return '${couponDiscountValue?.toInt()}% de descuento';
    } else if (couponDiscountType == 'fixed_amount') {
      return '\$${couponDiscountValue?.toStringAsFixed(0)} de descuento';
    }
    return 'Descuento aplicado';
  }
}
```

### 4.2 Modelo de Uso: CouponUsageModel

```dart
/// Registro de uso de cupones por usuario
/// Almacenado en subcollection: coupons/{couponId}/usage/{usageId}
class CouponUsageModel {
  /// ID único del registro de uso
  String? usageId;

  /// ID del cupón usado
  String? couponId;

  /// Código del cupón
  String? couponCode;

  /// UID del usuario que usó el cupón
  String? userId;

  /// ID del viaje donde se usó
  String? tripId;

  /// Monto original del viaje
  double? originalAmount;

  /// Monto del descuento aplicado
  double? discountAmount;

  /// Monto final pagado
  double? finalAmount;

  /// Fecha y hora de uso
  Timestamp? usedAt;

  /// Ciudad donde se usó
  String? cityId;

  /// Tipo de servicio
  String? serviceTypeId;

  CouponUsageModel({
    this.usageId,
    this.couponId,
    this.couponCode,
    this.userId,
    this.tripId,
    this.originalAmount,
    this.discountAmount,
    this.finalAmount,
    this.usedAt,
    this.cityId,
    this.serviceTypeId,
  });

  factory CouponUsageModel.fromJson(Map<String, dynamic> json) =>
      CouponUsageModel(
        usageId: json["usageId"],
        couponId: json["couponId"],
        couponCode: json["couponCode"],
        userId: json["userId"],
        tripId: json["tripId"],
        originalAmount: json["originalAmount"]?.toDouble(),
        discountAmount: json["discountAmount"]?.toDouble(),
        finalAmount: json["finalAmount"]?.toDouble(),
        usedAt: json["usedAt"],
        cityId: json["cityId"],
        serviceTypeId: json["serviceTypeId"],
      );

  Map<String, dynamic> toJson() => {
        "usageId": usageId,
        "couponId": couponId,
        "couponCode": couponCode,
        "userId": userId,
        "tripId": tripId,
        "originalAmount": originalAmount,
        "discountAmount": discountAmount,
        "finalAmount": finalAmount,
        "usedAt": usedAt ?? FieldValue.serverTimestamp(),
        "cityId": cityId,
        "serviceTypeId": serviceTypeId,
      };
}
```

### 4.3 Modelo de Validación: CouponValidationResult

```dart
/// Resultado de la validación de un cupón
class CouponValidationResult {
  /// Indica si el cupón es válido
  final bool isValid;

  /// Cupón validado (si es válido)
  final CouponModel? coupon;

  /// Monto del descuento a aplicar
  final double discountAmount;

  /// Código de error (si no es válido)
  final String? errorCode;

  /// Mensaje de error legible para el usuario
  final String? errorMessage;

  CouponValidationResult({
    required this.isValid,
    this.coupon,
    this.discountAmount = 0.0,
    this.errorCode,
    this.errorMessage,
  });

  /// Crea un resultado exitoso
  factory CouponValidationResult.success({
    required CouponModel coupon,
    required double discountAmount,
  }) {
    return CouponValidationResult(
      isValid: true,
      coupon: coupon,
      discountAmount: discountAmount,
    );
  }

  /// Crea un resultado de error
  factory CouponValidationResult.error({
    required String errorCode,
    required String errorMessage,
  }) {
    return CouponValidationResult(
      isValid: false,
      errorCode: errorCode,
      errorMessage: errorMessage,
    );
  }
}
```

### 4.4 Actualización de RequestVehicle

Agregar nuevos campos al modelo existente:

```dart
class RequestVehicle {
  // ... campos existentes ...

  // ==================== CUPÓN APLICADO ====================

  /// ID del cupón aplicado (si hay alguno)
  String? requestCouponId;

  /// Código del cupón aplicado
  String? requestCouponCode;

  /// Monto original antes del descuento
  String? requestOriginalAmount;

  /// Monto del descuento aplicado
  String? requestDiscountAmount;

  /// Tipo de descuento ("percentage" o "fixed_amount")
  String? requestDiscountType;

  /// Valor del descuento (% o monto)
  double? requestDiscountValue;

  // ... resto del modelo ...
}
```

---

## 5. Tipos de Cupones

### 5.1 Por Descuento

#### 5.1.1 Cupón de Porcentaje

**Ejemplo:**
```dart
CouponModel(
  couponCode: 'DESCUENTO50',
  couponName: '50% de descuento',
  couponDescription: '50% de descuento en tu viaje',
  couponDiscountType: 'percentage',
  couponDiscountValue: 50.0,        // 50%
  couponMaxDiscount: 10000.0,       // Máximo $10,000 de descuento
  couponMinTripAmount: 5000.0,      // Solo en viajes de $5,000+
)
```

**Cálculo:**
```
Viaje de $20,000
Descuento: $20,000 × 50% = $10,000
Total: $20,000 - $10,000 = $10,000
```

#### 5.1.2 Cupón de Monto Fijo

**Ejemplo:**
```dart
CouponModel(
  couponCode: 'AHORRA5MIL',
  couponName: '$5,000 de descuento',
  couponDescription: 'Ahorra $5,000 en tu próximo viaje',
  couponDiscountType: 'fixed_amount',
  couponDiscountValue: 5000.0,      // $5,000 fijos
  couponMinTripAmount: 10000.0,     // Solo en viajes de $10,000+
)
```

**Cálculo:**
```
Viaje de $15,000
Descuento: $5,000 (fijo)
Total: $15,000 - $5,000 = $10,000
```

### 5.2 Por Público Objetivo

#### 5.2.1 Cupón Público (Para Todos)

```dart
CouponModel(
  couponCode: 'BLACKFRIDAY',
  couponType: 'public',
  couponValidUserIds: null,         // Todos los usuarios
)
```

#### 5.2.2 Cupón Privado (Usuarios Específicos)

```dart
CouponModel(
  couponCode: 'VIP2024',
  couponType: 'private',
  couponValidUserIds: [
    'user_uid_001',
    'user_uid_002',
    'user_uid_003',
  ],
)
```

#### 5.2.3 Cupón Automático (Se aplica solo)

```dart
CouponModel(
  couponCode: 'AUTO_FIRST_TRIP',
  couponType: 'automatic',
  couponFirstTripOnly: true,        // Solo primer viaje
)
```

### 5.3 Por Restricción Temporal

#### 5.3.1 Cupón de Fin de Semana

```dart
CouponModel(
  couponCode: 'WEEKEND',
  couponValidDaysOfWeek: [0, 6],    // Solo sábado y domingo
)
```

#### 5.3.2 Cupón de Horas Pico

```dart
CouponModel(
  couponCode: 'MORNING',
  couponValidStartHour: 6,          // 6:00 AM
  couponValidEndHour: 9,            // 9:00 AM
)
```

#### 5.3.3 Cupón con Fecha de Expiración

```dart
CouponModel(
  couponCode: 'NAVIDAD2024',
  couponStartDate: Timestamp.fromDate(DateTime(2024, 12, 20)),
  couponEndDate: Timestamp.fromDate(DateTime(2024, 12, 26)),
)
```

### 5.4 Por Restricción Geográfica/Servicio

#### 5.4.1 Cupón Solo en Ciertas Ciudades

```dart
CouponModel(
  couponCode: 'CARACAS50',
  couponValidCities: ['city_caracas_001'],
)
```

#### 5.4.2 Cupón Solo para Premium

```dart
CouponModel(
  couponCode: 'PREMIUM20',
  couponValidServiceTypes: ['premium_001', 'suv_002'],
)
```

### 5.5 Por Límite de Uso

#### 5.5.1 Cupón de Uso Único por Usuario

```dart
CouponModel(
  couponCode: 'ONEUSE',
  couponMaxUsesPerUser: 1,
)
```

#### 5.5.2 Cupón Limitado (Primeros 100)

```dart
CouponModel(
  couponCode: 'FLASH100',
  couponMaxTotalUses: 100,
  couponCurrentUses: 0,
)
```

---

## 6. Generación de Cupones

### 6.1 Generador de Códigos

**Archivo:** `lib/src/modules/coupons/services/coupon_generator.dart`

```dart
class CouponGenerator {
  /// Genera un código de cupón aleatorio
  ///
  /// [length]: Longitud del código (default: 8)
  /// [prefix]: Prefijo opcional (ej: "IMOVE")
  /// [onlyUppercase]: Solo mayúsculas (default: true)
  /// [excludeAmbiguous]: Excluir caracteres ambiguos (0, O, 1, I) (default: true)
  static String generateCode({
    int length = 8,
    String? prefix,
    bool onlyUppercase = true,
    bool excludeAmbiguous = true,
  }) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Sin ambiguos
    const allChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

    final charSet = excludeAmbiguous ? chars : allChars;
    final random = Random.secure();

    String code = '';
    for (int i = 0; i < length; i++) {
      code += charSet[random.nextInt(charSet.length)];
    }

    if (prefix != null && prefix.isNotEmpty) {
      code = '${prefix}_$code';
    }

    return code;
  }

  /// Genera múltiples códigos únicos
  static List<String> generateBatch({
    required int count,
    int length = 8,
    String? prefix,
  }) {
    Set<String> codes = {};

    while (codes.length < count) {
      codes.add(generateCode(length: length, prefix: prefix));
    }

    return codes.toList();
  }

  /// Genera un código legible (palabras + números)
  /// Ejemplo: "VIAJE-2024-ABC123"
  static String generateReadableCode({
    required String keyword,
    bool includeYear = true,
  }) {
    final random = Random.secure();
    final year = includeYear ? DateTime.now().year.toString() : '';
    final randomPart = generateCode(length: 6, excludeAmbiguous: true);

    return '${keyword.toUpperCase()}-$year-$randomPart'.trim();
  }
}
```

**Ejemplos de uso:**

```dart
// Código simple
String code1 = CouponGenerator.generateCode();
// Output: "A3H7KP2M"

// Con prefijo
String code2 = CouponGenerator.generateCode(prefix: 'IMOVE');
// Output: "IMOVE_A3H7KP2M"

// Código legible
String code3 = CouponGenerator.generateReadableCode(keyword: 'NAVIDAD');
// Output: "NAVIDAD-2024-A3H7KP"

// Batch de 100 códigos
List<String> codes = CouponGenerator.generateBatch(count: 100);
```

### 6.2 Función de Creación Masiva

```dart
/// Crea múltiples cupones con la misma configuración
Future<List<CouponModel>> createBulkCoupons({
  required int count,
  required CouponModel template,
}) async {
  List<CouponModel> coupons = [];

  // Generar códigos únicos
  List<String> codes = CouponGenerator.generateBatch(count: count);

  for (String code in codes) {
    CouponModel coupon = CouponModel(
      couponCode: code,
      couponName: template.couponName,
      couponDescription: template.couponDescription,
      couponDiscountType: template.couponDiscountType,
      couponDiscountValue: template.couponDiscountValue,
      // ... copiar todas las propiedades del template
    );

    // Guardar en Firestore
    await FirebaseFirestore.instance
        .collection('coupons')
        .add(coupon.toJson());

    coupons.add(coupon);
  }

  return coupons;
}
```

---

## 7. Validación y Aplicación

### 7.1 Validador de Cupones

**Archivo:** `lib/src/modules/coupons/services/coupon_validator.dart`

```dart
class CouponValidator {
  /// Valida un cupón para un viaje específico
  static Future<CouponValidationResult> validate({
    required CouponModel coupon,
    required String userId,
    required double tripAmount,
    required String cityId,
    required String serviceTypeId,
    DateTime? tripDateTime,
  }) async {
    tripDateTime ??= DateTime.now();

    // 1. Verificar si el cupón está activo
    if (coupon.couponIsActive != true) {
      return CouponValidationResult.error(
        errorCode: 'INACTIVE',
        errorMessage: 'Este cupón no está activo',
      );
    }

    // 2. Verificar fechas de validez
    if (!coupon.isWithinValidDates()) {
      if (!coupon.hasStarted()) {
        return CouponValidationResult.error(
          errorCode: 'NOT_STARTED',
          errorMessage: 'Este cupón aún no es válido',
        );
      }
      if (coupon.isExpired()) {
        return CouponValidationResult.error(
          errorCode: 'EXPIRED',
          errorMessage: 'Este cupón ha expirado',
        );
      }
    }

    // 3. Verificar límite de usos totales
    if (coupon.hasReachedTotalUsesLimit()) {
      return CouponValidationResult.error(
        errorCode: 'LIMIT_REACHED',
        errorMessage: 'Este cupón ya alcanzó su límite de usos',
      );
    }

    // 4. Verificar monto mínimo del viaje
    if (coupon.couponMinTripAmount != null &&
        tripAmount < coupon.couponMinTripAmount!) {
      return CouponValidationResult.error(
        errorCode: 'MIN_AMOUNT',
        errorMessage:
            'El viaje debe ser de al menos \$${coupon.couponMinTripAmount?.toStringAsFixed(0)}',
      );
    }

    // 5. Verificar si es primer viaje (si aplica)
    if (coupon.couponFirstTripOnly == true) {
      bool isFirstTrip = await _checkIfFirstTrip(userId);
      if (!isFirstTrip) {
        return CouponValidationResult.error(
          errorCode: 'NOT_FIRST_TRIP',
          errorMessage: 'Este cupón solo aplica en el primer viaje',
        );
      }
    }

    // 6. Verificar ciudad
    if (coupon.couponValidCities != null &&
        coupon.couponValidCities!.isNotEmpty) {
      if (!coupon.couponValidCities!.contains(cityId)) {
        return CouponValidationResult.error(
          errorCode: 'INVALID_CITY',
          errorMessage: 'Este cupón no es válido en esta ciudad',
        );
      }
    }

    // 7. Verificar tipo de servicio
    if (coupon.couponValidServiceTypes != null &&
        coupon.couponValidServiceTypes!.isNotEmpty) {
      if (!coupon.couponValidServiceTypes!.contains(serviceTypeId)) {
        return CouponValidationResult.error(
          errorCode: 'INVALID_SERVICE',
          errorMessage: 'Este cupón no es válido para este tipo de servicio',
        );
      }
    }

    // 8. Verificar día de la semana
    if (coupon.couponValidDaysOfWeek != null &&
        coupon.couponValidDaysOfWeek!.isNotEmpty) {
      int dayOfWeek = tripDateTime.weekday % 7; // 0=Domingo, 6=Sábado
      if (!coupon.couponValidDaysOfWeek!.contains(dayOfWeek)) {
        return CouponValidationResult.error(
          errorCode: 'INVALID_DAY',
          errorMessage: 'Este cupón no es válido hoy',
        );
      }
    }

    // 9. Verificar horario
    if (coupon.couponValidStartHour != null ||
        coupon.couponValidEndHour != null) {
      int hour = tripDateTime.hour;
      int startHour = coupon.couponValidStartHour ?? 0;
      int endHour = coupon.couponValidEndHour ?? 23;

      bool isValidHour;
      if (startHour < endHour) {
        isValidHour = hour >= startHour && hour < endHour;
      } else {
        // Cruza medianoche
        isValidHour = hour >= startHour || hour < endHour;
      }

      if (!isValidHour) {
        return CouponValidationResult.error(
          errorCode: 'INVALID_HOUR',
          errorMessage: 'Este cupón no es válido en este horario',
        );
      }
    }

    // 10. Verificar usuario específico (cupones privados)
    if (coupon.couponValidUserIds != null &&
        coupon.couponValidUserIds!.isNotEmpty) {
      if (!coupon.couponValidUserIds!.contains(userId)) {
        return CouponValidationResult.error(
          errorCode: 'INVALID_USER',
          errorMessage: 'Este cupón no es válido para tu cuenta',
        );
      }
    }

    // 11. Verificar límite de usos por usuario
    if (coupon.couponMaxUsesPerUser != null) {
      int userUsageCount = await _getUserUsageCount(
        couponId: coupon.couponId!,
        userId: userId,
      );

      if (userUsageCount >= coupon.couponMaxUsesPerUser!) {
        return CouponValidationResult.error(
          errorCode: 'USER_LIMIT',
          errorMessage: 'Ya usaste este cupón el máximo de veces permitidas',
        );
      }
    }

    // 12. Calcular descuento
    double discountAmount = coupon.calculateDiscount(tripAmount);

    // 13. Validación exitosa
    return CouponValidationResult.success(
      coupon: coupon,
      discountAmount: discountAmount,
    );
  }

  /// Verifica si es el primer viaje del usuario
  static Future<bool> _checkIfFirstTrip(String userId) async {
    QuerySnapshot trips = await FirebaseFirestore.instance
        .collection('requestVehicle')
        .where('requestClientUid', isEqualTo: userId)
        .where('requestStatus', isEqualTo: 'finished')
        .limit(1)
        .get();

    return trips.docs.isEmpty;
  }

  /// Obtiene el número de veces que el usuario usó el cupón
  static Future<int> _getUserUsageCount({
    required String couponId,
    required String userId,
  }) async {
    QuerySnapshot usages = await FirebaseFirestore.instance
        .collection('coupons')
        .doc(couponId)
        .collection('usage')
        .where('userId', isEqualTo: userId)
        .get();

    return usages.docs.length;
  }
}
```

---

## 8. Integración con Pricing

### 8.1 Modificación del Cálculo de Precio

**Actualizar:** `CityServicePricing.getPriceBreakdown()`

```dart
Map<String, dynamic> getPriceBreakdown({
  required double distanceInKm,
  int? durationInMinutes,
  DateTime? tripDateTime,
  String currency = 'COP',
  CouponModel? appliedCoupon,  // NUEVO PARÁMETRO
}) {
  // ... cálculo existente ...

  double baseAmount = basePrice ?? 0.0;
  double kmAmount = 0.0;
  double timeAmount = 0.0;
  double nightSurcharge = 0.0;

  // Calcular subtotal (IGUAL QUE ANTES)
  double subtotal = baseAmount + kmAmount + timeAmount + nightSurcharge;

  // ==================== APLICAR CUPÓN ====================
  double discountAmount = 0.0;
  double total = subtotal;

  if (appliedCoupon != null) {
    discountAmount = appliedCoupon.calculateDiscount(subtotal);
    total = subtotal - discountAmount;

    // El total nunca puede ser negativo
    if (total < 0) {
      total = 0;
      discountAmount = subtotal;
    }
  }
  // =====================================================

  return {
    'basePrice': baseAmount,
    'distancePrice': kmAmount,
    'timePrice': timeAmount,
    'nightSurcharge': nightSurcharge,
    'subtotal': subtotal,

    // NUEVOS CAMPOS
    'couponApplied': appliedCoupon != null,
    'couponCode': appliedCoupon?.couponCode,
    'discountAmount': discountAmount,

    'total': total,
    'currency': currency,
    // ... resto del breakdown ...
  };
}
```

### 8.2 Flujo Completo de Cálculo con Cupón

```dart
// 1. Calcular precio base del viaje
double distanceKm = 15.5;
String serviceTypeId = 'auto_001';

Map<String, dynamic>? priceBreakdown = cityModel.getPriceBreakdown(
  serviceTypeId: serviceTypeId,
  distanceInKm: distanceKm,
);

double originalAmount = priceBreakdown['total'];  // Ej: $20,000

// 2. Usuario ingresa código de cupón
String couponCode = 'DESCUENTO50';

// 3. Buscar cupón
CouponModel? coupon = await CouponRepository.findByCode(couponCode);

if (coupon == null) {
  // Cupón no existe
  showError('Cupón inválido');
  return;
}

// 4. Validar cupón
CouponValidationResult validation = await CouponValidator.validate(
  coupon: coupon,
  userId: currentUserId,
  tripAmount: originalAmount,
  cityId: currentCityId,
  serviceTypeId: serviceTypeId,
);

if (!validation.isValid) {
  // Cupón no válido
  showError(validation.errorMessage);
  return;
}

// 5. Recalcular precio con cupón
priceBreakdown = cityModel.getPriceBreakdown(
  serviceTypeId: serviceTypeId,
  distanceInKm: distanceKm,
  appliedCoupon: validation.coupon,
);

double finalAmount = priceBreakdown['total'];      // Ej: $10,000
double discount = priceBreakdown['discountAmount']; // Ej: $10,000

// 6. Mostrar al usuario
print('Precio original: \$${originalAmount.toStringAsFixed(0)}');
print('Descuento: -\$${discount.toStringAsFixed(0)}');
print('Total a pagar: \$${finalAmount.toStringAsFixed(0)}');

// 7. Crear viaje con cupón aplicado
RequestVehicle requestVehicle = RequestVehicle(
  // ... campos normales ...
  requestOriginalAmount: originalAmount.toString(),
  requestDiscountAmount: discount.toString(),
  requestCustomerOffer: finalAmount.toString(),  // Precio final
  requestCouponId: coupon.couponId,
  requestCouponCode: coupon.couponCode,
  requestDiscountType: coupon.couponDiscountType,
  requestDiscountValue: coupon.couponDiscountValue,
);

// 8. Marcar cupón como usado
await CouponRepository.markAsUsed(
  couponId: coupon.couponId!,
  userId: currentUserId,
  tripId: requestVehicle.requestId!,
  originalAmount: originalAmount,
  discountAmount: discount,
  finalAmount: finalAmount,
);
```

---

## 9. Casos Especiales

### 9.1 Primer Viaje Gratis

#### Opción A: Cupón Automático

```dart
// Crear cupón automático en Firestore (una sola vez)
CouponModel firstTripCoupon = CouponModel(
  couponCode: 'AUTO_FIRST_TRIP',
  couponName: 'Primer viaje gratis',
  couponDescription: 'Tu primer viaje es gratis',
  couponDiscountType: 'percentage',
  couponDiscountValue: 100.0,         // 100% = gratis
  couponMaxDiscount: 15000.0,         // Máximo $15,000 gratis
  couponType: 'automatic',
  couponFirstTripOnly: true,
  couponMaxUsesPerUser: 1,
  couponIsActive: true,
);

// En el controlador de solicitud de viaje:
@override
void onInit() {
  super.onInit();

  // Verificar si es primer viaje
  _checkForAutomaticCoupons();
}

Future<void> _checkForAutomaticCoupons() async {
  // Verificar si el usuario nunca ha viajado
  bool isFirstTrip = await _isFirstTrip();

  if (isFirstTrip) {
    // Buscar cupón automático de primer viaje
    CouponModel? firstTripCoupon = await CouponRepository.findByCode(
      'AUTO_FIRST_TRIP',
    );

    if (firstTripCoupon != null) {
      // Aplicar automáticamente
      await applyCoupon(firstTripCoupon);

      // Mostrar mensaje al usuario
      Get.snackbar(
        '¡Primer viaje gratis!',
        'Tu primer viaje es completamente gratis',
        icon: Icon(Icons.celebration),
        backgroundColor: DSColors.success,
      );
    }
  }
}
```

#### Opción B: Cupón Manual con Código

```dart
// Crear cupón con código específico
CouponModel firstTripCoupon = CouponModel(
  couponCode: 'PRIMEVIAJE',
  couponName: 'Primer viaje gratis',
  couponDescription: 'Usa el código PRIMEVIAJE en tu primer viaje',
  couponDiscountType: 'percentage',
  couponDiscountValue: 100.0,
  couponMaxDiscount: 15000.0,
  couponType: 'public',
  couponFirstTripOnly: true,
  couponMaxUsesPerUser: 1,
);

// Usuario debe ingresar manualmente "PRIMEVIAJE"
```

### 9.2 Primer Viaje con Descuento (50% en lugar de 100%)

```dart
CouponModel firstTrip50 = CouponModel(
  couponCode: 'BIENVENIDA50',
  couponName: '50% en tu primer viaje',
  couponDescription: '50% de descuento en tu primer viaje',
  couponDiscountType: 'percentage',
  couponDiscountValue: 50.0,
  couponMaxDiscount: null,            // Sin límite
  couponType: 'automatic',
  couponFirstTripOnly: true,
  couponMaxUsesPerUser: 1,
);
```

### 9.3 Cupones de Referidos

```dart
// Cupón para el referidor
CouponModel referrerCoupon = CouponModel(
  couponCode: 'REFERRER_BONUS_${userId}',
  couponName: 'Bono por referir amigo',
  couponDescription: '$5,000 por referir a un amigo',
  couponDiscountType: 'fixed_amount',
  couponDiscountValue: 5000.0,
  couponValidUserIds: [referrerId],   // Solo para quien refirió
  couponMaxUsesPerUser: 1,
);

// Cupón para el referido
CouponModel refereeCoupon = CouponModel(
  couponCode: 'REFERRED_BONUS_${newUserId}',
  couponName: 'Bono de bienvenida',
  couponDescription: '$5,000 en tu primer viaje',
  couponDiscountType: 'fixed_amount',
  couponDiscountValue: 5000.0,
  couponValidUserIds: [newUserId],
  couponFirstTripOnly: true,
  couponMaxUsesPerUser: 1,
);
```

### 9.4 Cupones de Campaña (Black Friday)

```dart
CouponModel blackFriday = CouponModel(
  couponCode: 'BLACKFRIDAY2024',
  couponName: 'Black Friday 2024',
  couponDescription: '60% de descuento en todos los viajes',
  couponDiscountType: 'percentage',
  couponDiscountValue: 60.0,
  couponMaxDiscount: 20000.0,
  couponStartDate: Timestamp.fromDate(
    DateTime(2024, 11, 29, 0, 0, 0),   // 29 Nov 00:00
  ),
  couponEndDate: Timestamp.fromDate(
    DateTime(2024, 12, 2, 23, 59, 59),  // 1 Dic 23:59
  ),
  couponMaxTotalUses: 10000,           // Solo 10,000 usos
  couponMaxUsesPerUser: 3,             // Máximo 3 por usuario
  couponCampaignId: 'campaign_black_friday_2024',
  couponTags: ['marketing', 'black_friday', 'promocion'],
);
```

### 9.5 Cupones de Recuperación (Win-back)

Para usuarios inactivos:

```dart
// Generar cupones personalizados para usuarios que no usan la app
Future<void> generateWinbackCoupons() async {
  // Buscar usuarios inactivos (>30 días sin viaje)
  QuerySnapshot inactiveUsers = await FirebaseFirestore.instance
      .collection('users')
      .where('usersLastTripDate', isLessThan:
        Timestamp.fromDate(DateTime.now().subtract(Duration(days: 30))))
      .get();

  for (var userDoc in inactiveUsers.docs) {
    String userId = userDoc.id;

    // Crear cupón personalizado
    CouponModel winbackCoupon = CouponModel(
      couponCode: 'VUELVE_${CouponGenerator.generateCode(length: 6)}',
      couponName: 'Te extrañamos',
      couponDescription: '70% de descuento, te extrañamos',
      couponDiscountType: 'percentage',
      couponDiscountValue: 70.0,
      couponValidUserIds: [userId],
      couponMaxUsesPerUser: 1,
      couponEndDate: Timestamp.fromDate(
        DateTime.now().add(Duration(days: 7)),  // Válido 7 días
      ),
      couponTags: ['winback', 'recuperacion'],
    );

    // Guardar cupón
    await CouponRepository.create(winbackCoupon);

    // Enviar email/notificación al usuario
    await NotificationService.send(
      userId: userId,
      title: '¡Te extrañamos! 70% de descuento',
      body: 'Usa el código ${winbackCoupon.couponCode} en tu próximo viaje',
    );
  }
}
```

---

## 10. Repositorio y Lógica

### 10.1 Repositorio de Cupones

**Archivo:** `lib/src/modules/coupons/data/coupon_repository.dart`

```dart
class CouponRepository {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  final String _collection = 'coupons';

  // ==================== CRUD BÁSICO ====================

  /// Crear un cupón
  Future<String> create(CouponModel coupon) async {
    try {
      DocumentReference docRef = await _firestore
          .collection(_collection)
          .add(coupon.toJson());

      // Actualizar el ID en el documento
      await docRef.update({'couponId': docRef.id});

      return docRef.id;
    } catch (e) {
      throw Exception('Error al crear cupón: $e');
    }
  }

  /// Obtener cupón por ID
  Future<CouponModel?> getById(String couponId) async {
    try {
      DocumentSnapshot doc = await _firestore
          .collection(_collection)
          .doc(couponId)
          .get();

      if (!doc.exists) return null;

      return CouponModel.fromJson(doc.data() as Map<String, dynamic>);
    } catch (e) {
      print('Error al obtener cupón: $e');
      return null;
    }
  }

  /// Buscar cupón por código
  Future<CouponModel?> findByCode(String code) async {
    try {
      QuerySnapshot query = await _firestore
          .collection(_collection)
          .where('couponCode', isEqualTo: code.toUpperCase())
          .limit(1)
          .get();

      if (query.docs.isEmpty) return null;

      return CouponModel.fromJson(
        query.docs.first.data() as Map<String, dynamic>,
      );
    } catch (e) {
      print('Error al buscar cupón por código: $e');
      return null;
    }
  }

  /// Actualizar cupón
  Future<void> update(String couponId, Map<String, dynamic> data) async {
    try {
      data['couponUpdatedAt'] = FieldValue.serverTimestamp();

      await _firestore
          .collection(_collection)
          .doc(couponId)
          .update(data);
    } catch (e) {
      throw Exception('Error al actualizar cupón: $e');
    }
  }

  /// Eliminar cupón (soft delete)
  Future<void> delete(String couponId) async {
    try {
      await _firestore
          .collection(_collection)
          .doc(couponId)
          .update({
        'couponIsActive': false,
        'couponUpdatedAt': FieldValue.serverTimestamp(),
      });
    } catch (e) {
      throw Exception('Error al eliminar cupón: $e');
    }
  }

  // ==================== QUERIES ESPECIALIZADAS ====================

  /// Obtener cupones activos
  Future<List<CouponModel>> getActive() async {
    try {
      QuerySnapshot query = await _firestore
          .collection(_collection)
          .where('couponIsActive', isEqualTo: true)
          .get();

      return query.docs
          .map((doc) => CouponModel.fromJson(doc.data() as Map<String, dynamic>))
          .toList();
    } catch (e) {
      print('Error al obtener cupones activos: $e');
      return [];
    }
  }

  /// Obtener cupones públicos disponibles
  Future<List<CouponModel>> getPublicCoupons() async {
    try {
      DateTime now = DateTime.now();

      QuerySnapshot query = await _firestore
          .collection(_collection)
          .where('couponIsActive', isEqualTo: true)
          .where('couponType', isEqualTo: 'public')
          .where('couponEndDate', isGreaterThan: Timestamp.fromDate(now))
          .get();

      return query.docs
          .map((doc) => CouponModel.fromJson(doc.data() as Map<String, dynamic>))
          .toList();
    } catch (e) {
      print('Error al obtener cupones públicos: $e');
      return [];
    }
  }

  /// Obtener cupones disponibles para un usuario
  Future<List<CouponModel>> getAvailableForUser(String userId) async {
    try {
      DateTime now = DateTime.now();

      // Cupones públicos activos
      QuerySnapshot publicQuery = await _firestore
          .collection(_collection)
          .where('couponIsActive', isEqualTo: true)
          .where('couponType', isEqualTo: 'public')
          .where('couponEndDate', isGreaterThan: Timestamp.fromDate(now))
          .get();

      // Cupones privados para este usuario
      QuerySnapshot privateQuery = await _firestore
          .collection(_collection)
          .where('couponIsActive', isEqualTo: true)
          .where('couponValidUserIds', arrayContains: userId)
          .where('couponEndDate', isGreaterThan: Timestamp.fromDate(now))
          .get();

      List<CouponModel> coupons = [];

      for (var doc in publicQuery.docs) {
        coupons.add(CouponModel.fromJson(doc.data() as Map<String, dynamic>));
      }

      for (var doc in privateQuery.docs) {
        coupons.add(CouponModel.fromJson(doc.data() as Map<String, dynamic>));
      }

      return coupons;
    } catch (e) {
      print('Error al obtener cupones del usuario: $e');
      return [];
    }
  }

  // ==================== REGISTRO DE USO ====================

  /// Marcar cupón como usado
  Future<void> markAsUsed({
    required String couponId,
    required String userId,
    required String tripId,
    required double originalAmount,
    required double discountAmount,
    required double finalAmount,
    String? cityId,
    String? serviceTypeId,
  }) async {
    try {
      // Usar transacción para evitar condiciones de carrera
      await _firestore.runTransaction((transaction) async {
        // 1. Incrementar contador de usos del cupón
        DocumentReference couponRef = _firestore
            .collection(_collection)
            .doc(couponId);

        transaction.update(couponRef, {
          'couponCurrentUses': FieldValue.increment(1),
        });

        // 2. Crear registro de uso
        DocumentReference usageRef = couponRef
            .collection('usage')
            .doc();

        CouponUsageModel usage = CouponUsageModel(
          usageId: usageRef.id,
          couponId: couponId,
          userId: userId,
          tripId: tripId,
          originalAmount: originalAmount,
          discountAmount: discountAmount,
          finalAmount: finalAmount,
          cityId: cityId,
          serviceTypeId: serviceTypeId,
        );

        transaction.set(usageRef, usage.toJson());
      });
    } catch (e) {
      throw Exception('Error al marcar cupón como usado: $e');
    }
  }

  /// Obtener historial de uso de un cupón
  Future<List<CouponUsageModel>> getUsageHistory(String couponId) async {
    try {
      QuerySnapshot query = await _firestore
          .collection(_collection)
          .doc(couponId)
          .collection('usage')
          .orderBy('usedAt', descending: true)
          .get();

      return query.docs
          .map((doc) => CouponUsageModel.fromJson(doc.data() as Map<String, dynamic>))
          .toList();
    } catch (e) {
      print('Error al obtener historial de uso: $e');
      return [];
    }
  }

  /// Obtener número de usos de un cupón por un usuario
  Future<int> getUserUsageCount({
    required String couponId,
    required String userId,
  }) async {
    try {
      QuerySnapshot query = await _firestore
          .collection(_collection)
          .doc(couponId)
          .collection('usage')
          .where('userId', isEqualTo: userId)
          .get();

      return query.docs.length;
    } catch (e) {
      print('Error al obtener contador de uso: $e');
      return 0;
    }
  }

  /// Obtener cupones usados por un usuario
  Future<List<CouponUsageModel>> getUserCouponHistory(String userId) async {
    try {
      // Nota: Esta query es compleja porque requiere buscar en subcollections
      // Alternativa: Crear una collection global de "couponUsage" para queries más eficientes

      List<CouponUsageModel> allUsages = [];

      QuerySnapshot couponsQuery = await _firestore
          .collection(_collection)
          .get();

      for (var couponDoc in couponsQuery.docs) {
        QuerySnapshot usageQuery = await couponDoc.reference
            .collection('usage')
            .where('userId', isEqualTo: userId)
            .get();

        for (var usageDoc in usageQuery.docs) {
          allUsages.add(
            CouponUsageModel.fromJson(usageDoc.data() as Map<String, dynamic>),
          );
        }
      }

      // Ordenar por fecha
      allUsages.sort((a, b) {
        if (a.usedAt == null || b.usedAt == null) return 0;
        return b.usedAt!.compareTo(a.usedAt!);
      });

      return allUsages;
    } catch (e) {
      print('Error al obtener historial del usuario: $e');
      return [];
    }
  }

  // ==================== ESTADÍSTICAS ====================

  /// Obtener estadísticas de un cupón
  Future<Map<String, dynamic>> getCouponStats(String couponId) async {
    try {
      // Obtener el cupón
      CouponModel? coupon = await getById(couponId);
      if (coupon == null) return {};

      // Obtener todos los usos
      List<CouponUsageModel> usages = await getUsageHistory(couponId);

      // Calcular estadísticas
      double totalDiscount = 0;
      double totalOriginal = 0;
      Map<String, int> cityCounts = {};
      Map<String, int> serviceCounts = {};

      for (var usage in usages) {
        totalDiscount += usage.discountAmount ?? 0;
        totalOriginal += usage.originalAmount ?? 0;

        if (usage.cityId != null) {
          cityCounts[usage.cityId!] = (cityCounts[usage.cityId!] ?? 0) + 1;
        }

        if (usage.serviceTypeId != null) {
          serviceCounts[usage.serviceTypeId!] =
              (serviceCounts[usage.serviceTypeId!] ?? 0) + 1;
        }
      }

      return {
        'totalUses': usages.length,
        'totalDiscountGiven': totalDiscount,
        'totalOriginalAmount': totalOriginal,
        'averageDiscount': usages.isNotEmpty ? totalDiscount / usages.length : 0,
        'usageByCity': cityCounts,
        'usageByService': serviceCounts,
        'remainingUses': coupon.couponMaxTotalUses != null
            ? (coupon.couponMaxTotalUses! - (coupon.couponCurrentUses ?? 0))
            : null,
      };
    } catch (e) {
      print('Error al obtener estadísticas: $e');
      return {};
    }
  }
}
```

### 10.2 Controlador de Cupones (GetX)

**Archivo:** `lib/src/modules/coupons/controller/coupon_controller.dart`

```dart
class CouponController extends GetxController {
  final CouponRepository _repository = CouponRepository();

  // ==================== ESTADO ====================

  /// Cupón actualmente aplicado
  Rx<CouponModel?> appliedCoupon = Rx<CouponModel?>(null);

  /// Monto del descuento actual
  RxDouble currentDiscount = 0.0.obs;

  /// Lista de cupones disponibles para el usuario
  RxList<CouponModel> availableCoupons = <CouponModel>[].obs;

  /// Estado de carga
  RxBool isLoading = false.obs;

  /// Mensaje de error
  RxString errorMessage = ''.obs;

  // ==================== MÉTODOS ====================

  @override
  void onInit() {
    super.onInit();
    loadAvailableCoupons();
  }

  /// Cargar cupones disponibles para el usuario actual
  Future<void> loadAvailableCoupons() async {
    try {
      isLoading.value = true;

      String? userId = Get.find<AppController>().dataUser.value?.userUid;
      if (userId == null) return;

      availableCoupons.value = await _repository.getAvailableForUser(userId);
    } catch (e) {
      print('Error al cargar cupones: $e');
    } finally {
      isLoading.value = false;
    }
  }

  /// Aplicar cupón por código
  Future<bool> applyByCode({
    required String code,
    required double tripAmount,
    required String cityId,
    required String serviceTypeId,
  }) async {
    try {
      isLoading.value = true;
      errorMessage.value = '';

      // Buscar cupón
      CouponModel? coupon = await _repository.findByCode(code);

      if (coupon == null) {
        errorMessage.value = 'Cupón no encontrado';
        _showError('Cupón inválido', 'El código ingresado no existe');
        return false;
      }

      // Validar cupón
      String userId = Get.find<AppController>().dataUser.value!.userUid!;

      CouponValidationResult validation = await CouponValidator.validate(
        coupon: coupon,
        userId: userId,
        tripAmount: tripAmount,
        cityId: cityId,
        serviceTypeId: serviceTypeId,
      );

      if (!validation.isValid) {
        errorMessage.value = validation.errorMessage ?? 'Cupón inválido';
        _showError('Cupón no válido', validation.errorMessage ?? '');
        return false;
      }

      // Aplicar cupón
      appliedCoupon.value = validation.coupon;
      currentDiscount.value = validation.discountAmount;

      _showSuccess(
        'Cupón aplicado',
        'Se aplicó ${coupon.getDiscountText()}',
      );

      return true;
    } catch (e) {
      errorMessage.value = 'Error al aplicar cupón';
      _showError('Error', 'No se pudo aplicar el cupón');
      return false;
    } finally {
      isLoading.value = false;
    }
  }

  /// Aplicar cupón directamente (desde lista)
  Future<bool> applyCoupon({
    required CouponModel coupon,
    required double tripAmount,
    required String cityId,
    required String serviceTypeId,
  }) async {
    try {
      isLoading.value = true;
      errorMessage.value = '';

      String userId = Get.find<AppController>().dataUser.value!.userUid!;

      // Validar cupón
      CouponValidationResult validation = await CouponValidator.validate(
        coupon: coupon,
        userId: userId,
        tripAmount: tripAmount,
        cityId: cityId,
        serviceTypeId: serviceTypeId,
      );

      if (!validation.isValid) {
        errorMessage.value = validation.errorMessage ?? 'Cupón inválido';
        _showError('Cupón no válido', validation.errorMessage ?? '');
        return false;
      }

      // Aplicar cupón
      appliedCoupon.value = validation.coupon;
      currentDiscount.value = validation.discountAmount;

      _showSuccess(
        'Cupón aplicado',
        'Se aplicó ${coupon.getDiscountText()}',
      );

      return true;
    } catch (e) {
      errorMessage.value = 'Error al aplicar cupón';
      _showError('Error', 'No se pudo aplicar el cupón');
      return false;
    } finally {
      isLoading.value = false;
    }
  }

  /// Remover cupón aplicado
  void removeCoupon() {
    appliedCoupon.value = null;
    currentDiscount.value = 0.0;
    errorMessage.value = '';
  }

  /// Marcar cupón como usado después de crear el viaje
  Future<void> markAsUsed({
    required String tripId,
    required double originalAmount,
    required double finalAmount,
    String? cityId,
    String? serviceTypeId,
  }) async {
    if (appliedCoupon.value == null) return;

    try {
      String userId = Get.find<AppController>().dataUser.value!.userUid!;

      await _repository.markAsUsed(
        couponId: appliedCoupon.value!.couponId!,
        userId: userId,
        tripId: tripId,
        originalAmount: originalAmount,
        discountAmount: currentDiscount.value,
        finalAmount: finalAmount,
        cityId: cityId,
        serviceTypeId: serviceTypeId,
      );
    } catch (e) {
      print('Error al marcar cupón como usado: $e');
      // No mostrar error al usuario, ya que el viaje fue creado
    }
  }

  // ==================== UI HELPERS ====================

  void _showSuccess(String title, String message) {
    Get.snackbar(
      title,
      message,
      backgroundColor: DSColors.success,
      colorText: DSColors.white,
      icon: Icon(Icons.check_circle, color: DSColors.white),
      snackPosition: SnackPosition.TOP,
      duration: Duration(seconds: 3),
    );
  }

  void _showError(String title, String message) {
    Get.snackbar(
      title,
      message,
      backgroundColor: DSColors.error,
      colorText: DSColors.white,
      icon: Icon(Icons.error, color: DSColors.white),
      snackPosition: SnackPosition.TOP,
      duration: Duration(seconds: 4),
    );
  }
}
```

---

## 11. UI/UX de Usuario

### 11.1 Widget de Entrada de Cupón

**Archivo:** `lib/src/modules/coupons/views/coupon_input_widget.dart`

```dart
class CouponInputWidget extends StatelessWidget {
  final Function(String) onApply;
  final VoidCallback? onRemove;
  final bool hasAppliedCoupon;
  final String? appliedCouponCode;
  final double? discountAmount;

  const CouponInputWidget({
    Key? key,
    required this.onApply,
    this.onRemove,
    this.hasAppliedCoupon = false,
    this.appliedCouponCode,
    this.discountAmount,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final TextEditingController controller = TextEditingController();

    return DSCard(
      variant: DSCardVariant.elevated,
      padding: DSSpacing.cardPadding,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Row(
            children: [
              Icon(
                Icons.local_offer_outlined,
                color: DSColors.accent,
                size: 20,
              ),
              DSSpacing.gapHorizontalSmall,
              Text(
                'Cupón de descuento',
                style: DSTypography.h4,
              ),
            ],
          ),

          DSSpacing.gapVertical,

          // Si ya hay cupón aplicado
          if (hasAppliedCoupon) ...[
            _buildAppliedCouponDisplay(),
          ] else ...[
            // Campo de entrada
            Row(
              children: [
                Expanded(
                  child: DSTextField(
                    controller: controller,
                    hintText: 'Ingresa tu código',
                    textCapitalization: TextCapitalization.characters,
                    prefixIcon: Icons.confirmation_number,
                  ),
                ),
                DSSpacing.gapHorizontalSmall,
                DSButton(
                  label: 'Aplicar',
                  size: DSButtonSize.small,
                  width: DSButtonWidth.wrap,
                  onPressed: () {
                    if (controller.text.isNotEmpty) {
                      onApply(controller.text.trim().toUpperCase());
                    }
                  },
                ),
              ],
            ),

            DSSpacing.gapVerticalSmall,

            // Link a lista de cupones disponibles
            GestureDetector(
              onTap: () {
                Get.to(() => MyCouponsPage());
              },
              child: Text(
                'Ver cupones disponibles',
                style: DSTypography.caption.copyWith(
                  color: DSColors.primary,
                  decoration: TextDecoration.underline,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildAppliedCouponDisplay() {
    return Container(
      padding: EdgeInsets.all(DSSpacing.x3),
      decoration: BoxDecoration(
        color: DSColors.success.withOpacity(0.1),
        borderRadius: DSBorders.medium,
        border: Border.all(
          color: DSColors.success.withOpacity(0.3),
          width: 1,
        ),
      ),
      child: Row(
        children: [
          Icon(
            Icons.check_circle,
            color: DSColors.success,
            size: 24,
          ),
          DSSpacing.gapHorizontalMedium,
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Cupón aplicado',
                  style: DSTypography.caption.copyWith(
                    color: DSColors.success,
                    fontWeight: DSTypography.bold,
                  ),
                ),
                DSSpacing.gapVerticalTiny,
                Text(
                  appliedCouponCode ?? '',
                  style: DSTypography.h4.copyWith(
                    color: DSColors.textPrimary,
                  ),
                ),
                if (discountAmount != null) ...[
                  DSSpacing.gapVerticalTiny,
                  Text(
                    'Ahorro: -\$${discountAmount!.toStringAsFixed(0)}',
                    style: DSTypography.bodySmall.copyWith(
                      color: DSColors.success,
                      fontWeight: DSTypography.semiBold,
                    ),
                  ),
                ],
              ],
            ),
          ),
          IconButton(
            icon: Icon(Icons.close, size: 20),
            color: DSColors.textSecondary,
            onPressed: onRemove,
          ),
        ],
      ),
    );
  }
}
```

### 11.2 Página de Cupones Disponibles

**Archivo:** `lib/src/modules/coupons/views/my_coupons_page.dart`

```dart
class MyCouponsPage extends GetView<CouponController> {
  const MyCouponsPage({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: DSColors.backgroundPrimary,
      appBar: AppBar(
        title: Text('Cupones disponibles', style: DSTypography.h3),
        backgroundColor: DSColors.backgroundElevated,
      ),
      body: Obx(() {
        if (controller.isLoading.value) {
          return Center(child: CircularProgressIndicator());
        }

        if (controller.availableCoupons.isEmpty) {
          return _buildEmptyState();
        }

        return ListView.separated(
          padding: DSSpacing.screenPadding,
          itemCount: controller.availableCoupons.length,
          separatorBuilder: (_, __) => DSSpacing.gap,
          itemBuilder: (context, index) {
            CouponModel coupon = controller.availableCoupons[index];
            return CouponCard(
              coupon: coupon,
              onTap: () {
                // Aplicar cupón y volver a pantalla anterior
                Get.back(result: coupon);
              },
            );
          },
        );
      }),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.local_offer_outlined,
            size: 80,
            color: DSColors.textTertiary,
          ),
          DSSpacing.gapVerticalLarge,
          Text(
            'No tienes cupones disponibles',
            style: DSTypography.h4.copyWith(
              color: DSColors.textSecondary,
            ),
          ),
          DSSpacing.gapVertical,
          Text(
            'Los cupones aparecerán aquí cuando estén disponibles',
            style: DSTypography.bodySmall.copyWith(
              color: DSColors.textTertiary,
            ),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}
```

### 11.3 Tarjeta de Cupón

**Archivo:** `lib/src/modules/coupons/widgets/coupon_card.dart`

```dart
class CouponCard extends StatelessWidget {
  final CouponModel coupon;
  final VoidCallback? onTap;

  const CouponCard({
    Key? key,
    required this.coupon,
    this.onTap,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    bool isExpired = coupon.isExpired();
    bool isValid = coupon.isWithinValidDates();

    return GestureDetector(
      onTap: isValid ? onTap : null,
      child: Opacity(
        opacity: isValid ? 1.0 : 0.5,
        child: DSCard(
          variant: DSCardVariant.elevated,
          padding: EdgeInsets.zero,
          child: Container(
            decoration: BoxDecoration(
              borderRadius: DSBorders.large,
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: isValid
                    ? [DSColors.primary, DSColors.accent]
                    : [DSColors.gray300, DSColors.gray400],
              ),
            ),
            child: Stack(
              children: [
                // Patrón de fondo
                Positioned.fill(
                  child: Opacity(
                    opacity: 0.1,
                    child: CustomPaint(
                      painter: CouponPatternPainter(),
                    ),
                  ),
                ),

                // Contenido
                Padding(
                  padding: DSSpacing.cardPadding,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Descuento grande
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Expanded(
                            child: Text(
                              _getDiscountDisplayText(),
                              style: DSTypography.display.copyWith(
                                color: DSColors.white,
                                fontWeight: DSTypography.bold,
                              ),
                            ),
                          ),
                          if (isExpired)
                            Container(
                              padding: EdgeInsets.symmetric(
                                horizontal: DSSpacing.x2,
                                vertical: DSSpacing.x1,
                              ),
                              decoration: BoxDecoration(
                                color: DSColors.error,
                                borderRadius: DSBorders.small,
                              ),
                              child: Text(
                                'EXPIRADO',
                                style: DSTypography.caption.copyWith(
                                  color: DSColors.white,
                                  fontWeight: DSTypography.bold,
                                ),
                              ),
                            ),
                        ],
                      ),

                      DSSpacing.gapVerticalSmall,

                      // Descripción
                      Text(
                        coupon.couponDescription ?? '',
                        style: DSTypography.body.copyWith(
                          color: DSColors.white,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),

                      DSSpacing.gapVertical,

                      // Línea divisoria punteada
                      CustomPaint(
                        size: Size(double.infinity, 1),
                        painter: DashedLinePainter(
                          color: DSColors.white.withOpacity(0.3),
                        ),
                      ),

                      DSSpacing.gapVertical,

                      // Código del cupón
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'CÓDIGO',
                                style: DSTypography.caption.copyWith(
                                  color: DSColors.white.withOpacity(0.7),
                                ),
                              ),
                              DSSpacing.gapVerticalTiny,
                              Text(
                                coupon.couponCode ?? '',
                                style: DSTypography.h3.copyWith(
                                  color: DSColors.white,
                                  fontWeight: DSTypography.bold,
                                  letterSpacing: 2,
                                ),
                              ),
                            ],
                          ),

                          if (isValid)
                            Icon(
                              Icons.arrow_forward_ios,
                              color: DSColors.white,
                              size: 16,
                            ),
                        ],
                      ),

                      // Fecha de expiración
                      if (coupon.couponEndDate != null) ...[
                        DSSpacing.gapVerticalSmall,
                        Row(
                          children: [
                            Icon(
                              Icons.schedule,
                              size: 14,
                              color: DSColors.white.withOpacity(0.7),
                            ),
                            DSSpacing.gapHorizontalTiny,
                            Text(
                              'Válido hasta ${_formatDate(coupon.couponEndDate!.toDate())}',
                              style: DSTypography.caption.copyWith(
                                color: DSColors.white.withOpacity(0.7),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  String _getDiscountDisplayText() {
    if (coupon.couponDiscountType == 'percentage') {
      return '${coupon.couponDiscountValue?.toInt()}% OFF';
    } else {
      return '\$${coupon.couponDiscountValue?.toStringAsFixed(0)} OFF';
    }
  }

  String _formatDate(DateTime date) {
    return DateFormat('dd/MM/yyyy').format(date);
  }
}

// Painter para el patrón de fondo
class CouponPatternPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = Colors.white
      ..style = PaintingStyle.fill;

    // Dibujar círculos aleatorios
    final random = Random(42); // Seed fijo para consistencia
    for (int i = 0; i < 20; i++) {
      final x = random.nextDouble() * size.width;
      final y = random.nextDouble() * size.height;
      final radius = random.nextDouble() * 30 + 10;

      canvas.drawCircle(Offset(x, y), radius, paint);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

// Painter para línea punteada
class DashedLinePainter extends CustomPainter {
  final Color color;

  DashedLinePainter({required this.color});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = 1;

    const dashWidth = 5;
    const dashSpace = 3;
    double startX = 0;

    while (startX < size.width) {
      canvas.drawLine(
        Offset(startX, 0),
        Offset(startX + dashWidth, 0),
        paint,
      );
      startX += dashWidth + dashSpace;
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
```

---

## 12. Panel de Administración

### 12.1 Dashboard de Cupones (Admin)

Para administrar cupones desde una web admin o app admin, crear:

**Features necesarias:**
- Crear cupones individuales
- Crear cupones en masa
- Ver lista de cupones activos
- Ver estadísticas de uso
- Activar/desactivar cupones
- Editar parámetros
- Ver historial de uso

**Ejemplo de estructura:**

```dart
class AdminCouponsPage extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Administración de Cupones'),
        actions: [
          IconButton(
            icon: Icon(Icons.add),
            onPressed: () => _showCreateCouponDialog(),
          ),
        ],
      ),
      body: Column(
        children: [
          // Métricas generales
          _buildMetricsCards(),

          // Tabla de cupones
          Expanded(
            child: _buildCouponsTable(),
          ),
        ],
      ),
    );
  }
}
```

### 12.2 Formulario de Creación

```dart
class CreateCouponForm extends StatefulWidget {
  @override
  _CreateCouponFormState createState() => _CreateCouponFormState();
}

class _CreateCouponFormState extends State<CreateCouponForm> {
  final _formKey = GlobalKey<FormState>();

  // Campos del formulario
  String? couponCode;
  String? discountType = 'percentage';
  double? discountValue;
  // ... más campos

  @override
  Widget build(BuildContext context) {
    return Form(
      key: _formKey,
      child: SingleChildScrollView(
        child: Column(
          children: [
            // Sección: Información Básica
            _buildSection(
              title: 'Información Básica',
              children: [
                DSTextField(
                  label: 'Código del cupón',
                  hint: 'DESCUENTO50',
                  onChanged: (value) => couponCode = value,
                  suffix: IconButton(
                    icon: Icon(Icons.auto_awesome),
                    onPressed: _generateRandomCode,
                  ),
                ),
                DSTextField(
                  label: 'Nombre',
                  hint: '50% de descuento',
                ),
                DSTextField(
                  label: 'Descripción',
                  hint: 'Descripción para el usuario',
                  maxLines: 3,
                ),
              ],
            ),

            // Sección: Tipo de Descuento
            _buildSection(
              title: 'Tipo de Descuento',
              children: [
                DropdownButton<String>(
                  value: discountType,
                  items: [
                    DropdownMenuItem(
                      value: 'percentage',
                      child: Text('Porcentaje'),
                    ),
                    DropdownMenuItem(
                      value: 'fixed_amount',
                      child: Text('Monto Fijo'),
                    ),
                  ],
                  onChanged: (value) {
                    setState(() => discountType = value);
                  },
                ),
                DSTextField(
                  label: discountType == 'percentage'
                      ? 'Porcentaje (0-100)'
                      : 'Monto Fijo',
                  keyboardType: TextInputType.number,
                  onChanged: (value) => discountValue = double.tryParse(value),
                ),
                if (discountType == 'percentage')
                  DSTextField(
                    label: 'Descuento Máximo (opcional)',
                    keyboardType: TextInputType.number,
                    hint: 'Ej: 10000',
                  ),
              ],
            ),

            // Sección: Validez
            _buildSection(
              title: 'Validez',
              children: [
                DatePickerField(
                  label: 'Fecha de inicio',
                ),
                DatePickerField(
                  label: 'Fecha de expiración',
                ),
              ],
            ),

            // Sección: Límites
            _buildSection(
              title: 'Límites de Uso',
              children: [
                DSTextField(
                  label: 'Usos totales máximos (opcional)',
                  hint: '1000',
                  keyboardType: TextInputType.number,
                ),
                DSTextField(
                  label: 'Usos por usuario',
                  hint: '1',
                  keyboardType: TextInputType.number,
                ),
                SwitchListTile(
                  title: Text('Solo primer viaje'),
                  value: false,
                  onChanged: (value) {},
                ),
              ],
            ),

            // Sección: Restricciones
            _buildSection(
              title: 'Restricciones (opcional)',
              children: [
                MultiSelectChip(
                  label: 'Ciudades válidas',
                  options: ['Caracas', 'Valencia', 'Maracaibo'],
                ),
                MultiSelectChip(
                  label: 'Tipos de servicio',
                  options: ['Auto', 'Premium', 'SUV'],
                ),
                MultiSelectChip(
                  label: 'Días válidos',
                  options: ['L', 'M', 'M', 'J', 'V', 'S', 'D'],
                ),
              ],
            ),

            // Botones de acción
            Padding(
              padding: EdgeInsets.all(16),
              child: Row(
                children: [
                  Expanded(
                    child: DSButton(
                      label: 'Cancelar',
                      variant: DSButtonVariant.secondary,
                      onPressed: () => Navigator.pop(context),
                    ),
                  ),
                  SizedBox(width: 16),
                  Expanded(
                    child: DSButton(
                      label: 'Crear Cupón',
                      onPressed: _createCoupon,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSection({
    required String title,
    required List<Widget> children,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: EdgeInsets.all(16),
          child: Text(
            title,
            style: DSTypography.h4,
          ),
        ),
        ...children,
        Divider(),
      ],
    );
  }

  void _generateRandomCode() {
    setState(() {
      couponCode = CouponGenerator.generateCode(length: 8);
    });
  }

  Future<void> _createCoupon() async {
    if (!_formKey.currentState!.validate()) return;

    // Crear cupón
    CouponModel coupon = CouponModel(
      couponCode: couponCode,
      couponDiscountType: discountType,
      couponDiscountValue: discountValue,
      // ... mapear todos los campos
    );

    try {
      await CouponRepository().create(coupon);

      Get.snackbar('Éxito', 'Cupón creado correctamente');
      Navigator.pop(context);
    } catch (e) {
      Get.snackbar('Error', 'No se pudo crear el cupón');
    }
  }
}
```

---

## 13. Seguridad y Prevención de Fraude

### 13.1 Medidas de Seguridad

#### 1. Validación del Lado del Servidor

**NUNCA confiar en validación del cliente solamente.**

```dart
// Cloud Functions (Firebase Functions)
exports.validateCoupon = functions.https.onCall(async (data, context) => {
  // Verificar autenticación
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'Usuario no autenticado'
    );
  }

  const userId = context.auth.uid;
  const couponCode = data.couponCode;
  const tripAmount = data.tripAmount;

  // Buscar cupón
  const couponSnapshot = await admin.firestore()
    .collection('coupons')
    .where('couponCode', '==', couponCode)
    .limit(1)
    .get();

  if (couponSnapshot.empty) {
    throw new functions.https.HttpsError(
      'not-found',
      'Cupón no encontrado'
    );
  }

  const coupon = couponSnapshot.docs[0].data();

  // Validar TODAS las reglas del lado del servidor
  // ...

  return {
    isValid: true,
    discountAmount: calculatedDiscount,
  };
});
```

#### 2. Transacciones Atómicas

```dart
// Al marcar cupón como usado, usar transacción
Future<void> markAsUsed() async {
  await FirebaseFirestore.instance.runTransaction((transaction) async {
    DocumentReference couponRef = /* ... */;

    // Leer estado actual
    DocumentSnapshot couponSnapshot = await transaction.get(couponRef);
    CouponModel coupon = CouponModel.fromJson(couponSnapshot.data());

    // Verificar límite DENTRO de la transacción
    if (coupon.hasReachedTotalUsesLimit()) {
      throw Exception('Límite alcanzado');
    }

    // Incrementar contador
    transaction.update(couponRef, {
      'couponCurrentUses': FieldValue.increment(1),
    });

    // Crear registro de uso
    transaction.set(/* usage document */, /* data */);
  });
}
```

#### 3. Rate Limiting

```dart
// Limitar intentos de validación por usuario
class CouponRateLimiter {
  static final Map<String, List<DateTime>> _attempts = {};

  static bool canAttempt(String userId) {
    final now = DateTime.now();
    final userAttempts = _attempts[userId] ?? [];

    // Eliminar intentos antiguos (más de 1 minuto)
    userAttempts.removeWhere(
      (attempt) => now.difference(attempt).inMinutes > 1,
    );

    // Máximo 10 intentos por minuto
    if (userAttempts.length >= 10) {
      return false;
    }

    userAttempts.add(now);
    _attempts[userId] = userAttempts;

    return true;
  }
}
```

### 13.2 Prevención de Abuso

#### 1. Detección de Múltiples Cuentas

```dart
// Firestore Rules
match /coupons/{couponId}/usage/{usageId} {
  allow create: if request.auth != null
    && !exists(/databases/$(database)/documents/coupons/$(couponId)/usage/$(request.auth.uid))
    && /* verificar que el usuario no tenga múltiples cuentas con mismo dispositivo */;
}
```

#### 2. Validación de Device ID

```dart
// Almacenar device ID al usar cupón
import 'package:device_info_plus/device_info_plus.dart';

Future<String> getDeviceId() async {
  DeviceInfoPlugin deviceInfo = DeviceInfoPlugin();

  if (Platform.isIOS) {
    IosDeviceInfo iosInfo = await deviceInfo.iosInfo;
    return iosInfo.identifierForVendor ?? '';
  } else {
    AndroidDeviceInfo androidInfo = await deviceInfo.androidInfo;
    return androidInfo.id;
  }
}

// Verificar si el device ID ya usó el cupón
Future<bool> hasDeviceUsedCoupon(String couponId, String deviceId) async {
  QuerySnapshot usages = await FirebaseFirestore.instance
      .collection('coupons')
      .doc(couponId)
      .collection('usage')
      .where('deviceId', isEqualTo: deviceId)
      .limit(1)
      .get();

  return usages.docs.isNotEmpty;
}
```

#### 3. Bloqueo de Usuarios Sospechosos

```dart
// Marcar usuario como sospechoso si:
// - Usa muchos cupones en poco tiempo
// - Cancela viajes frecuentemente después de aplicar cupón
// - Tiene múltiples cuentas con mismos datos

Future<void> checkSuspiciousActivity(String userId) async {
  // Verificar patrones sospechosos
  QuerySnapshot recentUsages = await FirebaseFirestore.instance
      .collectionGroup('usage')
      .where('userId', isEqualTo: userId)
      .where('usedAt', isGreaterThan:
        Timestamp.fromDate(DateTime.now().subtract(Duration(hours: 24))))
      .get();

  if (recentUsages.docs.length > 5) {
    // Múltiples cupones en 24h - sospechoso
    await flagUserAsSuspicious(userId);
  }
}
```

### 13.3 Auditoría

#### Log de Actividades

```dart
// Registrar todas las acciones relacionadas con cupones
class CouponAuditLog {
  static Future<void> log({
    required String action,
    required String userId,
    String? couponId,
    String? couponCode,
    Map<String, dynamic>? metadata,
  }) async {
    await FirebaseFirestore.instance
        .collection('couponAuditLog')
        .add({
      'action': action,  // 'validated', 'applied', 'used', 'rejected'
      'userId': userId,
      'couponId': couponId,
      'couponCode': couponCode,
      'timestamp': FieldValue.serverTimestamp(),
      'metadata': metadata,
    });
  }
}

// Uso:
await CouponAuditLog.log(
  action: 'validated',
  userId: currentUserId,
  couponCode: 'DESCUENTO50',
  metadata: {
    'isValid': true,
    'discountAmount': 10000,
    'tripAmount': 20000,
  },
);
```

---

## 14. Implementación Paso a Paso

### Paso 1: Crear Modelos

1. Crear `lib/src/modules/coupons/models/coupon_model.dart`
2. Crear `lib/src/modules/coupons/models/coupon_usage_model.dart`
3. Crear `lib/src/modules/coupons/models/coupon_validation_result.dart`

### Paso 2: Crear Servicios

1. Crear `lib/src/modules/coupons/services/coupon_generator.dart`
2. Crear `lib/src/modules/coupons/services/coupon_validator.dart`

### Paso 3: Crear Repositorio

1. Crear `lib/src/modules/coupons/data/coupon_repository.dart`
2. Implementar métodos CRUD
3. Implementar métodos de validación

### Paso 4: Crear Controlador

1. Crear `lib/src/modules/coupons/controller/coupon_controller.dart`
2. Implementar lógica de negocio
3. Integrar con AppController

### Paso 5: Actualizar Modelo RequestVehicle

1. Agregar campos de cupón a `request_vehicle.dart`
2. Actualizar serialización JSON

### Paso 6: Integrar con Pricing

1. Modificar `CityServicePricing.getPriceBreakdown()` para aceptar cupón
2. Actualizar controladores de solicitud de viaje

### Paso 7: Crear UI

1. Crear `coupon_input_widget.dart`
2. Crear `coupon_card.dart`
3. Crear `my_coupons_page.dart`

### Paso 8: Integrar en Flujo de Viaje

1. Agregar widget de cupón en pantalla de confirmación
2. Validar cupón antes de crear viaje
3. Marcar como usado después de crear viaje
4. Mostrar descuento en resumen

### Paso 9: Crear Cupones Iniciales en Firestore

```dart
// Script para crear cupones iniciales
Future<void> createInitialCoupons() async {
  final repository = CouponRepository();

  // 1. Cupón de primer viaje gratis
  await repository.create(CouponModel(
    couponCode: 'PRIMEVIAJE',
    couponName: 'Primer viaje gratis',
    couponDescription: '100% de descuento en tu primer viaje',
    couponDiscountType: 'percentage',
    couponDiscountValue: 100.0,
    couponMaxDiscount: 15000.0,
    couponFirstTripOnly: true,
    couponType: 'public',
    couponMaxUsesPerUser: 1,
  ));

  // 2. Cupón de bienvenida 50%
  await repository.create(CouponModel(
    couponCode: 'BIENVENIDA50',
    couponName: '50% de descuento',
    couponDescription: '50% en tu primer viaje',
    couponDiscountType: 'percentage',
    couponDiscountValue: 50.0,
    couponFirstTripOnly: true,
    couponType: 'automatic',
    couponMaxUsesPerUser: 1,
  ));

  print('Cupones iniciales creados');
}
```

### Paso 10: Testing

1. Probar validación de cupones
2. Probar aplicación de descuentos
3. Probar límites de uso
4. Probar casos edge (viaje gratis, descuento mayor que precio, etc.)

---

## 🎉 Conclusión

Este documento proporciona una arquitectura completa para implementar un sistema robusto de cupones de descuento en iMove Driver. El sistema incluye:

✅ **Modelos de datos completos** con todos los campos necesarios
✅ **Validación robusta** con múltiples reglas configurables
✅ **Integración perfecta** con el sistema de pricing existente
✅ **UI/UX atractiva** con componentes reutilizables
✅ **Casos especiales** (primer viaje, referidos, campañas)
✅ **Seguridad y prevención de fraude**
✅ **Panel de administración** para gestionar cupones

### Próximos Pasos Recomendados

1. Implementar los modelos y servicios básicos
2. Crear cupones de prueba en Firestore
3. Integrar UI en pantalla de confirmación de viaje
4. Realizar pruebas exhaustivas
5. Implementar medidas de seguridad adicionales
6. Crear panel de administración
7. Lanzar campaña piloto con cupones limitados

### Métricas a Monitorear

- Tasa de uso de cupones (% de viajes con cupón)
- Cupones más populares
- Descuento promedio por viaje
- ROI de campañas de cupones
- Usuarios que regresan después de usar cupón
- Fraude detectado y prevenido

---

**Versión del Documento:** 1.0
**Fecha:** Diciembre 2024
**Autor:** Claude AI
**Proyecto:** iMove Driver - Sistema de Cupones
