# 🎟️ Ejemplo de Uso - Sistema de Cupones

Este documento muestra ejemplos prácticos de cómo usar el sistema de cupones en tu código.

---

## 📦 Importaciones Necesarias

```dart
import 'package:app_driver/src/modules/coupons/models/coupon_model.dart';
import 'package:app_driver/src/modules/coupons/services/coupon_generator.dart';
```

---

## 1️⃣ Crear Cupones en Firestore

### Ejemplo 1: Primer Viaje Gratis (100% descuento)

```dart
import 'package:cloud_firestore/cloud_firestore.dart';

Future<void> crearCuponPrimerViaje() async {
  CouponModel cupon = CouponModel(
    couponCode: 'PRIMEVIAJE',
    couponName: 'Primer viaje gratis',
    couponDescription: 'Tu primer viaje es completamente gratis hasta \$15,000',
    couponDiscountType: 'percentage',
    couponDiscountValue: 100.0,           // 100% = gratis
    couponMaxDiscount: 15000.0,           // Máximo $15,000 gratis
    couponMinTripAmount: null,            // Sin mínimo
    couponFirstTripOnly: true,            // Solo primer viaje
    couponMaxUsesPerUser: 1,              // Una sola vez por usuario
    couponType: 'public',                 // Cualquiera puede usarlo
    couponIsActive: true,
  );

  // Guardar en Firestore
  DocumentReference docRef = await FirebaseFirestore.instance
      .collection('coupons')
      .add(cupon.toJson());

  // Actualizar el ID
  await docRef.update({'couponId': docRef.id});

  print('Cupón creado con ID: ${docRef.id}');
}
```

### Ejemplo 2: Primer Viaje con 50% Descuento

```dart
Future<void> crearCuponBienvenida50() async {
  CouponModel cupon = CouponModel(
    couponCode: 'BIENVENIDA50',
    couponName: '50% en tu primer viaje',
    couponDescription: '50% de descuento en tu primer viaje con iMove',
    couponDiscountType: 'percentage',
    couponDiscountValue: 50.0,
    couponMaxDiscount: null,              // Sin límite de descuento máximo
    couponMinTripAmount: 5000.0,          // Solo en viajes de $5,000+
    couponFirstTripOnly: true,
    couponMaxUsesPerUser: 1,
    couponType: 'automatic',              // Se aplica automáticamente
    couponIsActive: true,
    couponStartDate: Timestamp.now(),
    couponEndDate: Timestamp.fromDate(
      DateTime.now().add(Duration(days: 90)), // Válido por 90 días
    ),
  );

  DocumentReference docRef = await FirebaseFirestore.instance
      .collection('coupons')
      .add(cupon.toJson());

  await docRef.update({'couponId': docRef.id});
}
```

### Ejemplo 3: Descuento de Monto Fijo

```dart
Future<void> crearCuponMontoFijo() async {
  CouponModel cupon = CouponModel(
    couponCode: 'AHORRA5MIL',
    couponName: '\$5,000 de descuento',
    couponDescription: 'Ahorra \$5,000 en tu próximo viaje',
    couponDiscountType: 'fixed_amount',   // Monto fijo
    couponDiscountValue: 5000.0,          // $5,000 fijos
    couponMinTripAmount: 10000.0,         // Solo en viajes de $10,000+
    couponMaxUsesPerUser: 3,              // Hasta 3 veces por usuario
    couponType: 'public',
    couponIsActive: true,
  );

  DocumentReference docRef = await FirebaseFirestore.instance
      .collection('coupons')
      .add(cupon.toJson());

  await docRef.update({'couponId': docRef.id});
}
```

### Ejemplo 4: Cupón de Campaña (Black Friday)

```dart
Future<void> crearCuponBlackFriday() async {
  CouponModel cupon = CouponModel(
    couponCode: 'BLACKFRIDAY2024',
    couponName: 'Black Friday 2024',
    couponDescription: '60% de descuento en todos los viajes',
    couponDiscountType: 'percentage',
    couponDiscountValue: 60.0,
    couponMaxDiscount: 20000.0,
    couponStartDate: Timestamp.fromDate(DateTime(2024, 11, 29, 0, 0)), // 29 Nov
    couponEndDate: Timestamp.fromDate(DateTime(2024, 12, 2, 23, 59)),   // 1 Dic
    couponMaxTotalUses: 10000,            // Solo 10,000 usos totales
    couponMaxUsesPerUser: 3,              // Máximo 3 por usuario
    couponCampaignId: 'campaign_black_friday_2024',
    couponTags: ['marketing', 'black_friday', 'promocion'],
    couponType: 'public',
    couponIsActive: true,
  );

  DocumentReference docRef = await FirebaseFirestore.instance
      .collection('coupons')
      .add(cupon.toJson());

  await docRef.update({'couponId': docRef.id});
}
```

### Ejemplo 5: Cupón Solo para Premium en Caracas

```dart
Future<void> crearCuponPremiumCaracas() async {
  CouponModel cupon = CouponModel(
    couponCode: 'PREMIUMCCS',
    couponName: 'Premium Caracas',
    couponDescription: '30% en viajes Premium en Caracas',
    couponDiscountType: 'percentage',
    couponDiscountValue: 30.0,
    couponValidCities: ['city_caracas_001'],           // Solo Caracas
    couponValidServiceTypes: ['premium_001'],          // Solo Premium
    couponMaxUsesPerUser: 5,
    couponType: 'public',
    couponIsActive: true,
  );

  DocumentReference docRef = await FirebaseFirestore.instance
      .collection('coupons')
      .add(cupon.toJson());

  await docRef.update({'couponId': docRef.id});
}
```

### Ejemplo 6: Cupón de Fin de Semana

```dart
Future<void> crearCuponFinDeSemana() async {
  CouponModel cupon = CouponModel(
    couponCode: 'WEEKEND',
    couponName: 'Fin de Semana',
    couponDescription: '40% de descuento los fines de semana',
    couponDiscountType: 'percentage',
    couponDiscountValue: 40.0,
    couponValidDaysOfWeek: [0, 6],        // 0 = Domingo, 6 = Sábado
    couponMaxUsesPerUser: null,           // Sin límite
    couponType: 'public',
    couponIsActive: true,
  );

  DocumentReference docRef = await FirebaseFirestore.instance
      .collection('coupons')
      .add(cupon.toJson());

  await docRef.update({'couponId': docRef.id});
}
```

### Ejemplo 7: Cupón de Horas Pico

```dart
Future<void> crearCuponHorasPico() async {
  CouponModel cupon = CouponModel(
    couponCode: 'MORNING',
    couponName: 'Descuento Mañana',
    couponDescription: '25% de descuento de 6am a 9am',
    couponDiscountType: 'percentage',
    couponDiscountValue: 25.0,
    couponValidStartHour: 6,              // 6:00 AM
    couponValidEndHour: 9,                // 9:00 AM
    couponMaxUsesPerUser: null,
    couponType: 'public',
    couponIsActive: true,
  );

  DocumentReference docRef = await FirebaseFirestore.instance
      .collection('coupons')
      .add(cupon.toJson());

  await docRef.update({'couponId': docRef.id});
}
```

### Ejemplo 8: Cupón Privado (Solo para Usuarios Específicos)

```dart
Future<void> crearCuponVIP(List<String> userIds) async {
  CouponModel cupon = CouponModel(
    couponCode: 'VIP2024',
    couponName: 'VIP Exclusivo',
    couponDescription: 'Cupón exclusivo para usuarios VIP',
    couponDiscountType: 'percentage',
    couponDiscountValue: 70.0,
    couponMaxDiscount: 30000.0,
    couponValidUserIds: userIds,          // Solo estos usuarios
    couponType: 'private',
    couponIsActive: true,
    couponEndDate: Timestamp.fromDate(
      DateTime.now().add(Duration(days: 30)),
    ),
  );

  DocumentReference docRef = await FirebaseFirestore.instance
      .collection('coupons')
      .add(cupon.toJson());

  await docRef.update({'couponId': docRef.id});
}
```

---

## 2️⃣ Generar Códigos de Cupones

### Ejemplo 1: Código Aleatorio Simple

```dart
void ejemploGenerarCodigo() {
  String codigo = CouponGenerator.generateCode();
  print(codigo);  // Output: "A3H7KP2M"
}
```

### Ejemplo 2: Código con Prefijo

```dart
void ejemploGenerarCodigoConPrefijo() {
  String codigo = CouponGenerator.generateCode(
    length: 8,
    prefix: 'IMOVE',
  );
  print(codigo);  // Output: "IMOVE_A3H7KP2M"
}
```

### Ejemplo 3: Código Legible

```dart
void ejemploGenerarCodigoLegible() {
  String codigo = CouponGenerator.generateReadableCode(
    keyword: 'NAVIDAD',
    includeYear: true,
  );
  print(codigo);  // Output: "NAVIDAD-2024-A3H7KP"
}
```

### Ejemplo 4: Generar Lote de Códigos

```dart
void ejemploGenerarLote() {
  List<String> codigos = CouponGenerator.generateBatch(
    count: 100,
    length: 8,
    prefix: 'CAMP',
  );

  print('Generados ${codigos.length} códigos');
  codigos.take(5).forEach(print);
  // Output:
  // CAMP_A3H7KP2M
  // CAMP_B9J4NQ7R
  // CAMP_C2K8PT5W
  // CAMP_D6L3MU9X
  // CAMP_E7N5RV2Y
}
```

---

## 3️⃣ Calcular Descuento

### Ejemplo 1: Descuento de Porcentaje

```dart
void ejemploCalcularDescuentoPorcentaje() {
  CouponModel cupon = CouponModel(
    couponDiscountType: 'percentage',
    couponDiscountValue: 50.0,            // 50%
    couponMaxDiscount: 10000.0,           // Máximo $10,000
  );

  double montoViaje = 20000.0;
  double descuento = cupon.calculateDiscount(montoViaje);

  print('Monto del viaje: \$${montoViaje.toStringAsFixed(0)}');
  print('Descuento: -\$${descuento.toStringAsFixed(0)}');
  print('Total a pagar: \$${(montoViaje - descuento).toStringAsFixed(0)}');

  // Output:
  // Monto del viaje: $20,000
  // Descuento: -$10,000  (50% pero limitado al máximo)
  // Total a pagar: $10,000
}
```

### Ejemplo 2: Descuento de Monto Fijo

```dart
void ejemploCalcularDescuentoMontoFijo() {
  CouponModel cupon = CouponModel(
    couponDiscountType: 'fixed_amount',
    couponDiscountValue: 5000.0,          // $5,000 fijos
  );

  double montoViaje = 15000.0;
  double descuento = cupon.calculateDiscount(montoViaje);

  print('Monto del viaje: \$${montoViaje.toStringAsFixed(0)}');
  print('Descuento: -\$${descuento.toStringAsFixed(0)}');
  print('Total a pagar: \$${(montoViaje - descuento).toStringAsFixed(0)}');

  // Output:
  // Monto del viaje: $15,000
  // Descuento: -$5,000
  // Total a pagar: $10,000
}
```

---

## 4️⃣ Validar Fechas del Cupón

```dart
void ejemploValidarFechas() {
  CouponModel cupon = CouponModel(
    couponCode: 'NAVIDAD',
    couponStartDate: Timestamp.fromDate(DateTime(2024, 12, 20)),
    couponEndDate: Timestamp.fromDate(DateTime(2024, 12, 26)),
  );

  bool haIniciado = cupon.hasStarted();
  bool estaExpirado = cupon.isExpired();
  bool esValido = cupon.isWithinValidDates();

  print('Cupón: ${cupon.couponCode}');
  print('Ha iniciado: $haIniciado');
  print('Está expirado: $estaExpirado');
  print('Es válido ahora: $esValido');
}
```

---

## 5️⃣ Crear Cupones Masivos

```dart
Future<void> crearCuponesMasivos() async {
  // Generar 100 códigos únicos
  List<String> codigos = CouponGenerator.generateBatch(
    count: 100,
    length: 8,
    prefix: 'FLASH',
  );

  // Crear cupones en Firestore
  for (String codigo in codigos) {
    CouponModel cupon = CouponModel(
      couponCode: codigo,
      couponName: 'Flash Sale',
      couponDescription: '30% de descuento - Flash Sale',
      couponDiscountType: 'percentage',
      couponDiscountValue: 30.0,
      couponMaxUsesPerUser: 1,
      couponType: 'public',
      couponIsActive: true,
      couponEndDate: Timestamp.fromDate(
        DateTime.now().add(Duration(days: 7)),
      ),
    );

    await FirebaseFirestore.instance
        .collection('coupons')
        .add(cupon.toJson());
  }

  print('Creados ${codigos.length} cupones');
}
```

---

## 6️⃣ Script de Inicialización

Crea este archivo para ejecutar una sola vez y crear los cupones iniciales:

```dart
// lib/src/scripts/init_coupons.dart

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:app_driver/src/modules/coupons/models/coupon_model.dart';

class InitCoupons {
  static Future<void> run() async {
    print('🎟️ Iniciando creación de cupones...');

    await _crearPrimerViaje();
    await _crearBienvenida50();
    await _crearFinDeSemana();

    print('✅ Cupones creados exitosamente');
  }

  static Future<void> _crearPrimerViaje() async {
    CouponModel cupon = CouponModel(
      couponCode: 'PRIMEVIAJE',
      couponName: 'Primer viaje gratis',
      couponDescription: 'Tu primer viaje es gratis hasta \$15,000',
      couponDiscountType: 'percentage',
      couponDiscountValue: 100.0,
      couponMaxDiscount: 15000.0,
      couponFirstTripOnly: true,
      couponMaxUsesPerUser: 1,
      couponType: 'public',
      couponIsActive: true,
    );

    DocumentReference docRef = await FirebaseFirestore.instance
        .collection('coupons')
        .add(cupon.toJson());

    await docRef.update({'couponId': docRef.id});
    print('✓ Cupón PRIMEVIAJE creado');
  }

  static Future<void> _crearBienvenida50() async {
    CouponModel cupon = CouponModel(
      couponCode: 'BIENVENIDA50',
      couponName: '50% primer viaje',
      couponDescription: '50% de descuento en tu primer viaje',
      couponDiscountType: 'percentage',
      couponDiscountValue: 50.0,
      couponFirstTripOnly: true,
      couponMaxUsesPerUser: 1,
      couponType: 'automatic',
      couponIsActive: true,
    );

    DocumentReference docRef = await FirebaseFirestore.instance
        .collection('coupons')
        .add(cupon.toJson());

    await docRef.update({'couponId': docRef.id});
    print('✓ Cupón BIENVENIDA50 creado');
  }

  static Future<void> _crearFinDeSemana() async {
    CouponModel cupon = CouponModel(
      couponCode: 'WEEKEND',
      couponName: 'Fin de Semana',
      couponDescription: '40% los fines de semana',
      couponDiscountType: 'percentage',
      couponDiscountValue: 40.0,
      couponValidDaysOfWeek: [0, 6],
      couponType: 'public',
      couponIsActive: true,
    );

    DocumentReference docRef = await FirebaseFirestore.instance
        .collection('coupons')
        .add(cupon.toJson());

    await docRef.update({'couponId': docRef.id});
    print('✓ Cupón WEEKEND creado');
  }
}
```

Para ejecutarlo, desde tu app:

```dart
// Ejecutar una sola vez, por ejemplo en el onboarding o desde un botón admin
await InitCoupons.run();
```

---

## 🔥 Próximos Pasos

1. ✅ Crea los modelos (ya están listos)
2. ✅ Genera códigos de cupones
3. 📝 Implementa el repositorio (`coupon_repository.dart`)
4. 🎯 Implementa el validador (`coupon_validator.dart`)
5. 🎨 Crea la UI para aplicar cupones
6. 🔗 Integra con el flujo de solicitud de viajes

Consulta `SISTEMA_CUPONES_DESCUENTO.md` para la documentación completa.
