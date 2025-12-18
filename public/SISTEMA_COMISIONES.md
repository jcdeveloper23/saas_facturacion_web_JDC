# Sistema de Comisiones iMove Driver

## Descripción General

El sistema de comisiones permite gestionar de forma profesional el porcentaje que cada conductor debe pagar a la plataforma por cada viaje realizado. El sistema incluye:

- ✅ Comisión por defecto de 20% para todos los conductores
- ✅ Personalización de comisión por conductor
- ✅ Historial completo de cambios
- ✅ API REST para integración con app móvil
- ✅ Interfaz visual en el panel administrativo
- ✅ Reportes de comisiones por conductor

---

## 1. Configuración por Defecto

### Comisión Estándar
- **Porcentaje:** 20%
- **Aplicación:** Todos los conductores nuevos o sin comisión personalizada
- **Cálculo:** `comision = monto_viaje × 0.20`

### Ejemplo de Cálculo
```
Monto del viaje: $100.00
Comisión (20%):  $20.00
Ganancia conductor: $80.00
```

---

## 2. Gestión desde el Panel Administrativo

### Acceso a la Configuración
1. Ir al módulo **Usuarios**
2. Buscar y seleccionar un conductor
3. Hacer clic en el ícono de edición (✏️)
4. En el modal, localizar la sección **"Comisión de Viajes"**

### Vista de Comisión

La tarjeta de comisión muestra:
- **Tasa actual** en un círculo visual
- **Estado de personalización** (Por defecto / Personalizada)
- **Última actualización** con fecha y hora
- **Botón Editar** para modificar la comisión

### Editar Comisión

1. Hacer clic en **"Editar Comisión"**
2. Ingresar nueva tasa (0-100%)
3. Agregar motivo del cambio (opcional pero recomendado)
4. Hacer clic en **"Guardar"**
5. Confirmar la acción en el diálogo

### Validaciones
- ✅ Solo acepta números del 0 al 100
- ✅ Requiere confirmación del administrador
- ✅ Registra automáticamente en el historial
- ✅ Muestra alertas de éxito/error

### Historial de Cambios

El historial muestra las últimas 3 modificaciones con:
- Fecha y hora del cambio
- Tasa anterior → Tasa nueva
- Usuario que realizó el cambio
- Motivo del cambio

**Límite:** Se guardan máximo 50 cambios por conductor

---

## 3. Estructura de Datos

### Interface CommissionHistory
```typescript
export interface CommissionHistory {
    date: string;              // Formato: YYYY-MM-DD
    time: string;              // Formato: HH:MM:SS
    previousRate: number;      // Tasa anterior
    newRate: number;           // Nueva tasa
    updatedBy: string;         // Quien actualizó
    reason?: string;           // Motivo del cambio
}
```

### Campos en Users Interface
```typescript
export interface Users {
    // ... otros campos

    userCommissionRate?: number;              // Tasa de comisión (ej: 20)
    userCommissionType?: 'percentage' | 'fixed';  // Tipo de comisión
    userCommissionCustomEnabled?: boolean;    // Si tiene comisión personalizada
    userCommissionHistory?: CommissionHistory[];  // Historial
    userCommissionLastUpdate?: string;        // Última actualización
    userCommissionUpdatedBy?: string;         // Quien actualizó
}
```

### Ejemplo de Documento Firestore
```json
{
    "userId": "ABC123",
    "userName": "Juan Pérez",
    "userCommissionRate": 15,
    "userCommissionCustomEnabled": true,
    "userCommissionType": "percentage",
    "userCommissionLastUpdate": "2025-12-15T10:30:00Z",
    "userCommissionUpdatedBy": "Admin",
    "userCommissionHistory": [
        {
            "date": "2025-12-15",
            "time": "10:30:00",
            "previousRate": 20,
            "newRate": 15,
            "updatedBy": "Admin",
            "reason": "Conductor destacado - reducción de comisión"
        }
    ]
}
```

---

## 4. API para Aplicación Móvil

### Endpoint 1: Calcular Comisión de Viaje

**URL:** `POST /v1/calculateCommission`

**Descripción:** Calcula la comisión de un viaje y la registra en Firestore

**Request Body:**
```json
{
    "tripId": "TRIP123",
    "driverId": "DRIVER456",
    "tripAmount": 100.50,
    "currency": "USD"
}
```

**Response (200 OK):**
```json
{
    "success": true,
    "message": "Commission calculated successfully",
    "data": {
        "tripId": "TRIP123",
        "driverId": "DRIVER456",
        "tripAmount": 100.50,
        "commissionRate": 20,
        "commissionAmount": 20.10,
        "driverEarnings": 80.40,
        "platformEarnings": 20.10,
        "currency": "USD",
        "calculatedAt": "2025-12-15T10:30:00Z"
    }
}
```

**Errores:**
- `400`: Faltan campos requeridos
- `404`: Conductor no encontrado
- `500`: Error del servidor

**Lógica de Cálculo:**
1. Obtiene la tasa de comisión del conductor
2. Si tiene comisión personalizada, usa esa tasa
3. Si no, usa la tasa por defecto (20%)
4. Calcula: `comision = monto × tasa / 100`
5. Calcula: `ganancia_conductor = monto - comision`
6. Guarda en subcollections para auditoría

**Subcollections Creadas:**
- `trips/{tripId}/commission/calculation`
- `users/{driverId}/commissions/{tripId}`

---

### Endpoint 2: Reporte de Comisiones

**URL:** `GET /v1/driverCommissionReport/:driverId`

**Descripción:** Genera un reporte completo de comisiones para un conductor

**Query Parameters:**
- `startDate` (opcional): Fecha inicio (YYYY-MM-DD)
- `endDate` (opcional): Fecha fin (YYYY-MM-DD)

**Ejemplo:**
```
GET /v1/driverCommissionReport/DRIVER456?startDate=2025-12-01&endDate=2025-12-15
```

**Response (200 OK):**
```json
{
    "success": true,
    "driverId": "DRIVER456",
    "driverName": "Juan Pérez",
    "currentCommissionRate": 20,
    "reportPeriod": {
        "startDate": "2025-12-01",
        "endDate": "2025-12-15"
    },
    "summary": {
        "totalTrips": 45,
        "totalTripAmount": 4520.00,
        "totalCommissionPaid": 904.00,
        "totalDriverEarnings": 3616.00,
        "averageCommissionPerTrip": 20.09,
        "currency": "USD"
    },
    "details": [
        {
            "tripId": "TRIP123",
            "tripAmount": 100.50,
            "commissionRate": 20,
            "commissionAmount": 20.10,
            "driverEarnings": 80.40,
            "date": "2025-12-15T10:30:00Z"
        }
        // ... más viajes
    ]
}
```

**Errores:**
- `404`: Conductor no encontrado
- `500`: Error del servidor

---

## 5. Integración con App Móvil

### Flujo de Trabajo

#### Al Finalizar un Viaje:

1. **App Móvil** completa el viaje
2. **App Móvil** llama a `POST /v1/calculateCommission`
3. **Cloud Function** calcula la comisión
4. **Cloud Function** guarda el registro
5. **App Móvil** muestra al conductor:
   - Monto total del viaje
   - Comisión aplicada
   - Ganancia neta

#### Para Ver Reportes:

1. **App Móvil** llama a `GET /v1/driverCommissionReport/:driverId`
2. **Cloud Function** consulta subcollection `users/{id}/commissions`
3. **Cloud Function** genera estadísticas
4. **App Móvil** muestra reporte al conductor

### Ejemplo de Código (Flutter/Dart)

```dart
// Calcular comisión al finalizar viaje
Future<void> calculateTripCommission(String tripId, double amount) async {
  final response = await http.post(
    Uri.parse('https://us-central1-driverappve.cloudfunctions.net/v1/calculateCommission'),
    headers: {'Content-Type': 'application/json'},
    body: jsonEncode({
      'tripId': tripId,
      'driverId': currentDriver.userId,
      'tripAmount': amount,
      'currency': 'USD',
    }),
  );

  if (response.statusCode == 200) {
    final data = jsonDecode(response.body)['data'];
    print('Comisión: \$${data['commissionAmount']}');
    print('Ganancia: \$${data['driverEarnings']}');
  }
}

// Obtener reporte de comisiones
Future<Map<String, dynamic>> getCommissionReport() async {
  final driverId = currentDriver.userId;
  final response = await http.get(
    Uri.parse('https://us-central1-driverappve.cloudfunctions.net/v1/driverCommissionReport/$driverId'),
  );

  if (response.statusCode == 200) {
    return jsonDecode(response.body);
  }
  throw Exception('Error al obtener reporte');
}
```

---

## 6. Métodos TypeScript (Componente)

### Obtener Tasa de Comisión
```typescript
public getUserCommissionRate(user: Users): number {
    if (!user) return this.DEFAULT_COMMISSION_RATE;

    if (user.userCommissionCustomEnabled && user.userCommissionRate !== undefined) {
        return user.userCommissionRate;
    }

    if (user.userCommissionRate !== undefined) {
        return user.userCommissionRate;
    }

    return this.DEFAULT_COMMISSION_RATE;
}
```

### Guardar Cambio de Comisión
```typescript
public async saveCommissionChange() {
    // Validaciones
    if (this.newCommissionRate < 0 || this.newCommissionRate > 100) {
        await Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'La comisión debe estar entre 0% y 100%'
        });
        return;
    }

    // Confirmación
    const result = await Swal.fire({
        title: '¿Confirmar cambio de comisión?',
        html: `
            <p>Conductor: <strong>${this.user.userName}</strong></p>
            <p>Comisión actual: <strong>${previousRate}%</strong></p>
            <p>Nueva comisión: <strong>${this.newCommissionRate}%</strong></p>
        `,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sí, cambiar',
        cancelButtonText: 'Cancelar'
    });

    if (!result.isConfirmed) return;

    // Crear entrada de historial
    const historyEntry = {
        date: currentDate.toISOString().split('T')[0],
        time: currentDate.toTimeString().split(' ')[0],
        previousRate: previousRate,
        newRate: this.newCommissionRate,
        updatedBy: 'Admin',
        reason: this.commissionChangeReason || 'Sin motivo especificado'
    };

    // Actualizar en Firestore
    await this.db.collection('users').doc(this.user.userId).update({
        userCommissionRate: this.newCommissionRate,
        userCommissionCustomEnabled: true,
        userCommissionLastUpdate: new Date().toISOString(),
        userCommissionUpdatedBy: 'Admin',
        userCommissionHistory: history
    });
}
```

---

## 7. Casos de Uso

### Caso 1: Conductor Nuevo
- Se registra un nuevo conductor
- Por defecto tiene comisión del 20%
- No requiere configuración adicional

### Caso 2: Reducción de Comisión
- Conductor destacado con alto rendimiento
- Administrador reduce comisión de 20% a 15%
- Motivo: "Alto rendimiento - incentivo"
- Se guarda en historial

### Caso 3: Aumento Temporal
- Conductor con quejas de servicio
- Administrador aumenta comisión de 20% a 25%
- Motivo: "Penalización temporal por quejas"
- Se guarda en historial

### Caso 4: Consulta desde App Móvil
- Conductor completa viaje de $100
- App calcula automáticamente:
  - Comisión: $20 (20%)
  - Ganancia: $80
- Conductor ve desglose en pantalla

### Caso 5: Reporte Mensual
- Conductor solicita reporte del mes
- App muestra:
  - Total de viajes: 150
  - Total ganado: $12,000
  - Total comisiones: $3,000
  - Ganancia neta: $9,000

---

## 8. Consideraciones Técnicas

### Seguridad
- ✅ Solo administradores pueden modificar comisiones
- ✅ Todos los cambios quedan registrados
- ✅ No se puede eliminar historial
- ✅ Validaciones en frontend y backend

### Escalabilidad
- ✅ Uso de subcollections para comisiones por viaje
- ✅ Límite de 50 entradas en historial
- ✅ Índices automáticos en Firestore
- ✅ Consultas optimizadas con filtros de fecha

### Mantenimiento
- ✅ Constante `DEFAULT_COMMISSION_RATE` centralizada
- ✅ Código documentado y estructurado
- ✅ Separación de lógica frontend/backend
- ✅ Interfaces TypeScript para type safety

### Performance
- ✅ Cálculos en servidor (Cloud Functions)
- ✅ Cache de tasa de comisión por conductor
- ✅ Consultas por rango de fechas
- ✅ Respuestas JSON optimizadas

---

## 9. Troubleshooting

### Problema: Comisión no se actualiza en la app móvil
**Solución:**
1. Verificar que la app esté consultando el endpoint correcto
2. Limpiar caché de la app
3. Verificar que el userId coincida

### Problema: Historial no se guarda
**Solución:**
1. Verificar permisos de Firestore
2. Revisar que el array no exceda 50 elementos
3. Verificar formato de datos en CommissionHistory

### Problema: Cálculo incorrecto
**Solución:**
1. Verificar que `tripAmount` sea un número válido
2. Revisar que `commissionRate` esté entre 0-100
3. Verificar redondeo de decimales

### Problema: Error 500 en Cloud Functions
**Solución:**
1. Revisar logs en Firebase Console
2. Verificar que el documento del conductor exista
3. Verificar formato de request body

---

## 10. Roadmap Futuro

### Mejoras Planeadas
- [ ] Comisiones dinámicas por horario (día/noche)
- [ ] Comisiones por zona geográfica
- [ ] Sistema de bonificaciones
- [ ] Reportes gráficos en dashboard
- [ ] Exportación de reportes a PDF/Excel
- [ ] Notificaciones push al cambiar comisión
- [ ] Historial completo con paginación
- [ ] Comisiones por tipo de servicio

### Integraciones Futuras
- [ ] Sistema de pagos automáticos
- [ ] Facturación electrónica
- [ ] Analytics y métricas avanzadas
- [ ] API pública para partners

---

## Soporte

Para dudas o problemas con el sistema de comisiones:
- Revisar logs en Firebase Console
- Verificar documentación de Cloud Functions
- Consultar historial de cambios en Firestore
- Revisar validaciones en componente TypeScript

---

**Versión:** 1.0.0
**Fecha:** Diciembre 2025
**Autor:** Equipo de Desarrollo iMove
