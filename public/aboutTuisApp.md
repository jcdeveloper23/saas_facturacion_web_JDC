📱 ¿Qué es iMove Driver?

  iMove Driver es la aplicación para conductores de la plataforma de movilidad iMove Venezuela. Es el equivalente a Uber Driver, Didi Conductor o Cabify Driver,
  diseñada para que los conductores puedan recibir y gestionar solicitudes de viajes de pasajeros en tiempo real.

  ---
  🎯 Funcionalidades Principales

  🚗 1. Gestión de Viajes (Core)

  - Recepción de solicitudes: Los conductores reciben notificaciones push cuando hay un pasajero solicitando un viaje
  - Flujo completo del viaje:
    - requested → Solicitud recibida
    - acceptedByDriver → Conductor acepta
    - driverIsInSitu → Conductor llega al punto de origen
    - inTravel → Viaje en curso
    - finished → Viaje completado
  - Seguimiento en tiempo real: Ubicación GPS del conductor se actualiza constantemente
  - Rutas con Google Maps: Cálculo de distancias, tiempos estimados y trazado de polylines
  - Múltiples paradas: Soporte para viajes con paradas intermedias
  - Ofertas de pasajeros: Sistema de subastas donde pasajeros pueden ofertar tarifas

  💬 2. Chat en Tiempo Real

  - Mensajería directa conductor-pasajero durante el viaje
  - Persistido en Firestore para historial

  👤 3. Perfil del Conductor

  - Gestión de datos personales
  - Foto de perfil
  - Calificación promedio
  - Documentos de verificación

  🚙 4. Gestión de Vehículos

  - Registro y administración de vehículos
  - Onboarding de vehículos con documentación:
    - Marca, modelo, placa
    - Número de chasis
    - Documentos escaneados/fotografiados
    - Categoría de servicio (económico, premium, etc.)

  💰 5. Ganancias y Billetera Digital

  - Wallet: Billetera virtual para recibir pagos
  - Profits: Historial de ganancias detallado
  - Transferencias entre usuarios
  - Escaneo de códigos QR para pagos
  - Comisiones automáticas calculadas por viaje
  - Desglose: Tarifa total - Comisión = Ganancia del conductor

  📊 6. Historial y Estadísticas

  - Historial completo de viajes realizados
  - Detalles de cada viaje (ruta, tarifa, calificación)
  - Gráficas de desempeño (fl_chart)
  - Historial de pasajeros atendidos

  ⭐ 7. Sistema de Calificaciones

  - Calificación de conductor a pasajero
  - Calificación de pasajero a conductor
  - Rating promedio visible en perfil

  🔔 8. Notificaciones Push

  - Firebase Cloud Messaging (FCM)
  - Alertas de nuevas solicitudes
  - Notificaciones en tiempo real de eventos del viaje
  - Sonidos personalizados para alertas

  🌍 9. Localización en Tiempo Real

  - Background location tracking: Actualización de ubicación incluso con app en segundo plano
  - Precisión GPS optimizada
  - Actualización de posición en Firebase para que pasajeros vean al conductor

  📍 10. Selección de Ubicaciones

  - Integración con Google Places
  - Place picker para seleccionar direcciones
  - Geocoding (coordenadas ↔ direcciones)

  🎨 11. Temas y Personalización

  - Modo claro/oscuro
  - Estilos de mapa personalizados según tema
  - Design System propio estilo Uber
  - Animaciones fluidas (Rive, Flutter Animate)

  🔐 12. Autenticación

  - Firebase Auth
  - Login con email/contraseña
  - Sign in with Apple
  - Google Sign In
  - Registro completo de nuevos conductores

  📄 13. Documentación y Legales

  - Términos y condiciones
  - Políticas de privacidad
  - Ayuda y soporte
  - Centro de ayuda con categorías

  📸 14. Gestión de Imágenes

  - Captura de fotos (perfil, vehículo, documentos)
  - Recorte de imágenes
  - Compresión optimizada
  - Almacenamiento en Firebase Storage

  🔍 15. Otros Módulos

  - NFC Reader: Lectura de tarjetas NFC (posible integración futura)
  - Eliminación de cuenta: Self-service para GDPR compliance
  - Pricing: Módulo de tarifas dinámicas
  - About: Información de la app, versión, contacto

  ---
  🛠️ Stack Tecnológico

  | Categoría    | Tecnología                               |
  |--------------|------------------------------------------|
  | Framework    | Flutter 3.29.2                           |
  | Arquitectura | GetX MVC (State, Routing, DI)            |
  | Backend      | Firebase (Auth, Firestore, Storage, FCM) |
  | Mapas        | Google Maps Flutter + Polylines          |
  | UI/UX        | Design System propio + Rive animations   |
  | Idioma       | Español (Venezuela)                      |
  | Plataforma   | iOS 15.5+ (también tiene Android)        |

  ---
  🔥 Características Técnicas Destacadas

  - Arquitectura escalable: Modularización por features
  - Reactividad total: GetX observables (.obs, Obx)
  - Transacciones atómicas: Para evitar condiciones de carrera en Firestore
  - Background services: Ubicación en segundo plano para tracking
  - Optimización de rendimiento: Lazy loading, const widgets, compresión de imágenes
  - Soporte offline: Manejo de conectividad con connectivity_plus
  - Notificaciones locales: Alertas incluso sin internet

  ---
  🎯 Objetivo de la App

  Permitir a los conductores en Venezuela:
  1. Recibir y aceptar solicitudes de viajes
  2. Navegar hasta el pasajero y destino
  3. Cobrar de forma digital
  4. Ganar dinero de manera transparente
  5. Gestionar su operación como conductor profesional

  Es una plataforma completa de movilidad enfocada en la experiencia del conductor, con todas las herramientas necesarias para operar de forma profesional y
  eficiente.

  📋 Funcionalidad Dual de la App

  ¡Importante! La iMove Driver App tiene doble funcionalidad:

  1️⃣ ROL PRINCIPAL: Conductor

  El conductor recibe y gestiona viajes de pasajeros.

  2️⃣ ROL SECUNDARIO: Cliente/Pasajero

  El cliente también puede solicitar viajes como pasajero dentro de la misma app. Es decir, un cliente puede:
  - Desconectarse del modo conductor
  - Solicitar un viaje como cliente
  - Otro conductor lo recoge

  ---
  🔍 Información del Cliente que el Conductor VE (Cuando recibe un viaje)

  Cuando un conductor recibe una solicitud, puede ver del pasajero:

  📸 Datos Personales

  - Nombre completo (requestClientName)
  - Foto de perfil (requestClientPhotoUrl)
  - Email (requestClientEmail)
  - Teléfono (requestClientPhone)
  - ⭐ Calificación promedio (requestClientRating)

  📍 Ubicación

  - Dirección de recogida (origen)
  - Dirección de destino
  - Coordenadas GPS precisas
  - Ciudad (requestClientCity)

  🚦 Durante el Viaje

  - Estado del pasajero (esperando, abordó, etc.)
  - Paradas intermedias si las hay
  - Chat en tiempo real con el pasajero

  ---
  🧳 Funcionalidades del Modo CLIENTE

  📱 Módulo request_trip (Nueva UI estilo Uber)

  Interfaz moderna para que el cliente solicite viajes:

  🏠 Pantalla Principal

  - Búsqueda de destino
  - Lugares recientes
  - Destinos sugeridos
  - Acciones rápidas

  🔍 Búsqueda de Destino

  - Integración con Google Places
  - Autocompletado de direcciones
  - Selección en mapa
  - Guardar lugares favoritos

  💰 Confirmación de Viaje

  - Selección de tipo de servicio (económico, premium, etc.)
  - Sistema de ofertas: El pasajero puede ofertar una tarifa
  - Ver conductores disponibles cercanos
  - Estimación de tiempo de llegada
  - Método de pago

  📜 Módulo client_history

  Historial de viajes como cliente:
  - Lista de todos los viajes solicitados como pasajero
  - Filtro por rango de fechas
  - Agrupación por fecha
  - Detalles completos de cada viaje:
    - Mapa de la ruta recorrida
    - Información del conductor que lo llevó:
        - Foto, nombre, calificación
      - Vehículo (marca, modelo, placa)
    - Recorrido (origen/destino)
    - Stats: Distancia, tiempo, tipo de servicio
    - Información financiera:
        - Valor del viaje
      - Método de pago
    - Calificaciones:
        - Calificación que dio al conductor
      - Calificación que recibió del conductor
    - Metadata: Fecha, hora, ID del viaje, estado

  ⭐ Sistema de Calificaciones

  Como cliente puede:
  - Calificar al conductor (1-5 estrellas)
  - Dejar comentarios/descripción
  - Ver su propia calificación como pasajero

  ---
  🔄 Cambio de Roles

  La app permite al usuario alternar entre modos:

  MODO CONDUCTOR                    MODO CLIENTE
       ↓                                ↓
  Recibe viajes       ←→        Solicita viajes
  Gana dinero         ←→        Viaje seguro
  Califica pasajeros  ←→        Califica conductores

  ---
  📊 Perfil Unificado

  El usuario tiene UN SOLO PERFIL con:
  - Datos personales compartidos (nombre, foto, teléfono)
  - Dos calificaciones separadas:
    - ⭐ Rating como conductor
    - ⭐ Rating como pasajero
  - Dos historiales:
    - 🚗 Viajes realizados (como conductor)
    - 🧳 Viajes solicitados (como cliente)
  - Billetera compartida:
    - Recibe dinero por viajes realizados
    - Paga por viajes solicitados

  ---
  🎯 Ventajas de este Modelo Dual

  1. Flexibilidad: El cliente puede movilizarse y el conductor puede ganar dinero con su vehículo
  2. Comunidad cerrada: Todos son conductores verificados
  3. Confianza: El cliente puede confiar en el conductor y el conductor puede confiar en el cliente
  4. Economía: viajes seguros y confiables a precios justos

  ---
  🔐 Privacidad y Seguridad

  - Verificación obligatoria: Solo conductores verificados pueden usar la app
  - Historial completo: Trazabilidad de todos los viajes
  - Sistema de calificaciones bidireccional: Incentiva buen comportamiento
  - Chat guardado: Registro de comunicaciones

  ---
  Esta arquitectura dual hace de iMove una plataforma integral de movilidad, creando un ecosistema más confiable y colaborativo.