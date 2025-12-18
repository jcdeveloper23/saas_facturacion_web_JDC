const functions = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");

const logger = require("firebase-functions/logger");
const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const functionss = require("firebase-functions");
const {onSchedule} = require("firebase-functions/v2/scheduler");

admin.initializeApp();
const db = admin.firestore();

// Express server init
const app = express();
app.use(cors({ origin: true }));

app.post("/v1/getMessage", (req, res) => {
    return res.status(200).json({
        message: 'Éxito en la solicitud',
    });
});

/**
 * Send push notification to a token
 * POST /v1/sendNotification
 * Body: {
 *   token: string,
 *   title: string,
 *   body: string,
 *   data: object (optional)
 * }
 */
app.post("/v1/sendNotification", async (req, res) => {
    const { token, title, body, data } = req.body;

    if (!title || !body) {
        return res.status(400).json({ message: "Missing token, title, or body" });
    }

    try {
        // Leer usuarios con rol "conductor" y estado activo
        const snapshot = await db.collection("users")
            .where("userRol", "==", 9)
            .where("userStateShareLocation", "==", true)
            .get();

        if (snapshot.empty) {
            return res.status(404).json({ message: "No active drivers found" });
        }

        const tokens = [];

        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.userMessagingToken) {
                tokens.push(data.userMessagingToken);
            }
        });

        if (tokens.length === 0) {
            return res.status(404).json({ message: "No FCM tokens available" });
        }

        // Puedes enviar máximo 500 tokens por solicitud
        const message = {
            notification: {
                title,
                body,
            },
            data: data || {},
            tokens: tokens,
            android: {
                priority: "high",
                notification: {
                    channelId: "high_priority_channel",
                    sound: "default",
                },
            },
        };

        // Nueva API recomendada
        const response = await admin.messaging().sendEachForMulticast(message);

        // Devuelve el resultado
        return res.status(200).json({
            response,
            success: true,
            sent: response.responses.filter(r => r.success).length,
            failed: response.responses.filter(r => !r.success).length,
            errors: response.responses.filter(r => !r.success).map(r => r.error?.message),
        });
    } catch (error) {
        return res.status(500).json({ message: "Error sending notifications", error: error.message });
    }

    // const message = {
    //     notification: {
    //         title,
    //         body,
    //     },
    //     android: {
    //         priority: "high", // IMPORTANTE para heads-up
    //         notification: {
    //             channelId: "high_priority_channel", // Debe coincidir con el canal configurado en la app
    //             sound: "default",
    //         },
    //     },
    //     token: token,
    //     data: data || {}, // optional additional payload
    // };

    // try {
    //     const response = await admin.messaging().send(message);
    //     logger.info("Successfully sent message:", response);
    //     return res.status(200).json({ success: true, response });
    // } catch (error) {
    //     logger.error("Error sending message:", error);
    //     return res.status(500).json({ success: false, error: error.message });
    // }
});


app.post("/v1/sendNotificationUser", async (req, res) => {
    const { title, body, data = {}, userUid } = req.body;

    if (!title || !body || !userUid) {
        return res.status(400).json({ message: "Missing: title, body, or userUid" });
    }

    try {
        // Buscar al usuario con el userUid especificado
        const userSnapshot = await db.collection("users")
            .where("userUid", "==", userUid)
            .limit(1)
            .get();

        if (userSnapshot.empty) {
            return res.status(404).json({ message: "User not found" });
        }

        const userData = userSnapshot.docs[0].data();
        const userToken = userData.userMessagingToken;

        if (!userToken) {
            return res.status(404).json({ message: "User has no FCM token" });
        }

        // Construir mensaje
        const message = {
            token: userToken,
            notification: {
                title,
                body,
            },
            data: {
                ...data,
            },
            android: {
                priority: "high",
                notification: {
                    channelId: "high_priority_channel",
                    sound: "default",
                    icon: "ic_launcher", // Asegúrate de tener este ícono en tu app
                },
            },
            apns: {
                payload: {
                    aps: {
                        sound: "default",
                    },
                },
            },
        };

        // Enviar notificación con FCM
        const response = await admin.messaging().send(message);

        return res.status(200).json({
            success: true,
            messageId: response,
        });
    } catch (error) {
        console.error("Notification error:", error);
        return res.status(500).json({
            message: "Error sending notification",
            error: error.message,
        });
    }
});

app.post("/v1/sendNotificationToAdmin", async (req, res) => {
    const { token, title, body, data } = req.body;

    if (!title || !body) {
        return res.status(400).json({ message: "Missing token, title, or body" });
    }

    try {
        // Leer usuarios con rol "conductor" y estado activo
        const snapshot = await db.collection("users")
            .where("userIsAdminImove", "==", true)
            .get();

        if (snapshot.empty) {
            return res.status(404).json({ message: "No active drivers found" });
        }

        const tokens = [];

        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.userMessagingToken) {
                tokens.push(data.userMessagingToken);
            }
        });

        if (tokens.length === 0) {
            return res.status(404).json({ message: "No FCM tokens available" });
        }

        // Puedes enviar máximo 500 tokens por solicitud
        const message = {
            notification: {
                title,
                body,
            },
            data: data || {},
            tokens: tokens,
            android: {
                priority: "high",
                notification: {
                    channelId: "high_priority_channel",
                    sound: "default",
                },
            },
        };

        // Nueva API recomendada
        const response = await admin.messaging().sendEachForMulticast(message);

        // Devuelve el resultado
        return res.status(200).json({
            response,
            success: true,
            sent: response.responses.filter(r => r.success).length,
            failed: response.responses.filter(r => !r.success).length,
            errors: response.responses.filter(r => !r.success).map(r => r.error?.message),
        });
    } catch (error) {
        return res.status(500).json({ message: "Error sending notifications", error: error.message });
    }

    // const message = {
    //     notification: {
    //         title,
    //         body,
    //     },
    //     android: {
    //         priority: "high", // IMPORTANTE para heads-up
    //         notification: {
    //             channelId: "high_priority_channel", // Debe coincidir con el canal configurado en la app
    //             sound: "default",
    //         },
    //     },
    //     token: token,
    //     data: data || {}, // optional additional payload
    // };

    // try {
    //     const response = await admin.messaging().send(message);
    //     logger.info("Successfully sent message:", response);
    //     return res.status(200).json({ success: true, response });
    // } catch (error) {
    //     logger.error("Error sending message:", error);
    //     return res.status(500).json({ success: false, error: error.message });
    // }
});

/**
 * Elimina un usuario de forma segura:
 * 1. Guarda un respaldo en la colección deleted_users
 * 2. Elimina las credenciales de Firebase Authentication
 * 3. Elimina el documento del usuario de Firestore
 *
 * POST /v1/deleteUser
 * Body: {
 *   userUid: string
 * }
 */
app.post("/v1/deleteUser", async (req, res) => {
    const { userUid } = req.body;

    if (!userUid) {
        return res.status(400).json({
            success: false,
            message: "Missing userUid parameter"
        });
    }

    try {
        logger.info(`🗑️ Iniciando eliminación de usuario: ${userUid}`);

        // 1. Obtener datos del usuario de Firestore
        const userDoc = await db.collection("users").doc(userUid).get();

        if (!userDoc.exists) {
            return res.status(404).json({
                success: false,
                message: "User not found in Firestore"
            });
        }

        const userData = userDoc.data();
        logger.info(`📋 Datos del usuario obtenidos: ${userData.userName || 'Sin nombre'}`);

        // 2. Crear respaldo en deleted_users con timestamp de eliminación
        const deletedUserData = {
            ...userData,
            deletedAt: admin.firestore.FieldValue.serverTimestamp(),
            deletedDate: new Date().toISOString(),
            originalUserUid: userUid
        };

        await db.collection("deleted_users").doc(userUid).set(deletedUserData);
        logger.info(`✅ Respaldo creado en deleted_users`);

        // 3. Eliminar credenciales de Firebase Authentication
        try {
            await admin.auth().deleteUser(userUid);
            logger.info(`✅ Credenciales de autenticación eliminadas`);
        } catch (authError) {
            // Si el usuario no existe en Auth, continuar con la eliminación de Firestore
            if (authError.code === 'auth/user-not-found') {
                logger.warn(`⚠️ Usuario no encontrado en Firebase Auth (posiblemente ya eliminado)`);
            } else {
                throw authError;
            }
        }

        // 4. Eliminar documento de Firestore
        await db.collection("users").doc(userUid).delete();
        logger.info(`✅ Documento de usuario eliminado de Firestore`);

        return res.status(200).json({
            success: true,
            message: "Usuario eliminado correctamente",
            data: {
                userUid: userUid,
                userName: userData.userName || 'Sin nombre',
                userEmail: userData.userEmail || 'Sin email',
                deletedAt: new Date().toISOString()
            }
        });

    } catch (error) {
        logger.error("❌ Error eliminando usuario:", error);
        return res.status(500).json({
            success: false,
            message: "Error al eliminar usuario",
            error: error.message
        });
    }
});


/// *** Generar estadísticas ***
exports.onNewRequestCreated = onDocumentCreated(
    "users/{userUid}/requestVehicle/{requestId}",
    async (event) => {
        const snap = event.data;
        const request = snap.data();

        if (!request) return;

        console.log("*** Request ***", request);

        // --- Normalizar valores numéricos ---
        const requestTripCost = parseFloat(request.requestTripCost || 0);
        const driverEarnings = parseFloat(request.requestDriverEarnings || 0);
        const commission = parseFloat(request.requestCommission || 0);
        const totalDistance = parseFloat(request.requestTotalDistanceOriginDestiny || 0);
        const totalTime = parseFloat(request.requestTotalTimeOriginDestiny || 0);

        // --- Validación mínima ---
        if (!request.requestDriverUid || !request.requestClientUid || !request.requestFullDate) {
            console.warn("🚨 Request missing required fields");
            return;
        }

        // --- Fechas para agrupación ---
        const date = request.requestFullDate.toDate ? request.requestFullDate.toDate() : new Date(request.requestFullDate);

        // Ajustar a UTC-5 (Ecuador)
        const offsetMs = 5 * 60 * 60 * 1000;
        const localDate = new Date(date.getTime() - offsetMs);


        const dailyKey = localDate.toISOString().split("T")[0]; // YYYY-MM-DD
        const monthlyKey = `${localDate.getFullYear()}-${String(localDate.getMonth() + 1).padStart(2, "0")}`;
        const yearKey = `${localDate.getFullYear()}`;

        const driverUid = request.requestDriverUid;

        // --- Referencias a stats ---
        const dailyRef = db.doc(`stats/driver_${driverUid}/daily/${dailyKey}`);
        const monthlyRef = db.doc(`stats/driver_${driverUid}/monthly/${monthlyKey}`);
        const yearlyRef = db.doc(`stats/driver_${driverUid}/yearly/${yearKey}`);

        // --- Preparar actualizaciones (ESTILO OBJETOS) ---
        const updates = {
            // Totales
            totalTrip: admin.firestore.FieldValue.increment(1),
            totalAmount: admin.firestore.FieldValue.increment(requestTripCost),
            totalEarnings: admin.firestore.FieldValue.increment(driverEarnings),
            totalCommission: admin.firestore.FieldValue.increment(commission),

            // Estados de viajes
            tripStatus: {
                [(request.requestStatusTrip || "unknown").toLowerCase()]: admin.firestore.FieldValue.increment(1)
            },

            // Tiempo y distancia
            totalTimeMinutes: admin.firestore.FieldValue.increment(totalTime),
            totalDistanceKm: admin.firestore.FieldValue.increment(totalDistance),

            // Clientes
            clients: {
                [request.requestClientUid]: admin.firestore.FieldValue.increment(1)
            },

            // Última fecha
            lastTripDate: date, 
        };

        // Métodos de pago
        if (request.requestPaymentType) {
            const methodKey = request.requestPaymentType.toLowerCase();
            updates.perPaymentMethod = {
                [methodKey]: admin.firestore.FieldValue.increment(1),
            };
            updates.totalAmountPerPaymentMethod = {
                [methodKey]: admin.firestore.FieldValue.increment(requestTripCost),
            };
        }

        // Estado de pago
        if (request.requestStatePaymentMethodString) {
            const statusKey = request.requestStatePaymentMethodString.toLowerCase().replace(/\s+/g, "_");
            updates.paymentStatus = {
                [statusKey]: admin.firestore.FieldValue.increment(1),
            };
        }

        // Tipo de servicio
        if (request.requestTypeService) {
            const typeKey = request.requestTypeService.toLowerCase();
            updates.serviceType = {
                [typeKey]: admin.firestore.FieldValue.increment(1),
            };
        }

        // Cancelaciones
        if (request.requestReasonForCancellationTripName) {
            const reasonKey = request.requestReasonForCancellationTripName.toLowerCase().replace(/\s+/g, "_");
            updates.cancellations = {
                [reasonKey]: admin.firestore.FieldValue.increment(1),
            };
        }

        // Calificaciones
        if (request.requestClientRating) {
            updates.ratings = {
                totalRatings: admin.firestore.FieldValue.increment(1),
                sumRatings: admin.firestore.FieldValue.increment(parseFloat(request.requestClientRating)),
            };
        }

        console.log("📊 Updates generados:", JSON.stringify(updates, null, 2));

        // --- Guardar en Firestore ---
        const updateStats = (ref) => ref.set(updates, { merge: true });

        await Promise.all([updateStats(dailyRef), updateStats(monthlyRef), updateStats(yearlyRef)]);

        console.log(`✅ Stats actualizadas para driver ${driverUid} (${dailyKey}, ${monthlyKey})`);
        return true;
    }
);

/**
 * ═══════════════════════════════════════════════════════════════════════
 * 🚗 iMove Driver - Cloud Functions
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Funciones serverless para gestionar la desconexión automática de
 * conductores que dejan de compartir su ubicación en tiempo real.
 *
 * @author iMove Team
 * @version 1.0.0
 */

/**
 * ═══════════════════════════════════════════════════════════════════════
 * 🕐 checkInactiveDrivers
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Cloud Function programada que se ejecuta cada 5 minutos para detectar
 * y desconectar automáticamente a conductores inactivos.
 *
 * ¿Qué hace?
 * ----------
 * 1. Busca conductores con userStateShareLocation = true
 * 2. Verifica si userLastLocationDate tiene más de 10 minutos de antigüedad
 * 3. Si está inactivo, lo desconecta automáticamente (userStateShareLocation = false)
 *
 * Configuración:
 * --------------
 * - Frecuencia: Cada 5 minutos
 * - Timeout de inactividad: 10 minutos sin actualización de ubicación
 * - Zona horaria: America/Caracas (UTC-4)
 *
 * Casos de uso:
 * -------------
 * ✅ Conductor cierra la app sin desconectarse → Se desconecta automáticamente
 * ✅ App crashea y no puede desconectar → Se desconecta automáticamente
 * ✅ Problemas de red prolongados → Se desconecta automáticamente
 * ✅ Problemas de GPS prolongados → Se desconecta automáticamente
 *
 */
exports.checkInactiveDrivers = onSchedule({
  schedule: "every 30 minutes", // Ejecutar cada 5 minutos
  timeZone: "America/Caracas", // Zona horaria de Venezuela
  retryCount: 3, // Reintentar 3 veces en caso de fallo
  timeoutSeconds: 540, // Timeout de 9 minutos (debe ser menor que el intervalo)
}, async () => {
  try {
    logger.info("🔍 Iniciando verificación de conductores inactivos...");

    const now = admin.firestore.Timestamp.now(); 
    const inactivityThresholdMinutes = 10; // 10 minutos de inactividad
    const thresholdTime = new Date(now.toDate().getTime() - (inactivityThresholdMinutes * 60 * 1000));

    logger.info(`⏰ Tiempo límite de inactividad: ${thresholdTime.toISOString()}`);

    // Buscar conductores que están marcados como "conectados"
    const usersRef = admin.firestore().collection("users");
    const connectedDriversQuery = usersRef.where("userStateShareLocation", "==", true);

    const snapshot = await connectedDriversQuery.get();

    if (snapshot.empty) {
      logger.info("✅ No hay conductores conectados actualmente");
      return null;
    }

    logger.info(`📊 Total de conductores conectados: ${snapshot.size}`);

    let inactiveCount = 0;
    let disconnectedCount = 0;
    const batch = admin.firestore().batch();

    // Revisar cada conductor conectado
    for (const doc of snapshot.docs) {
      const driverData = doc.data();
      const driverId = doc.id;
      const driverName = driverData.userName || "Sin nombre";

      // Verificar si tiene timestamp de última ubicación
      if (!driverData.userLastLocationDate) {
        logger.warn(`⚠️ Conductor ${driverName} (${driverId}) sin userLastLocationDate - omitiendo`);
        continue;
      }

      // Convertir a Date para comparación
      let lastLocationDate;
      if (driverData.userLastLocationDate instanceof admin.firestore.Timestamp) {
        lastLocationDate = driverData.userLastLocationDate.toDate();
      } else if (typeof driverData.userLastLocationDate === "string") {
        lastLocationDate = new Date(driverData.userLastLocationDate);
      } else {
        logger.warn(`⚠️ Formato de fecha inválido para conductor ${driverId}`);
        continue;
      }

      // Verificar si está inactivo (más de 10 minutos sin actualizar ubicación)
      if (lastLocationDate < thresholdTime) {
        inactiveCount++;
        const inactiveMinutes = Math.floor((now.toDate() - lastLocationDate) / 60000);

        logger.warn(
            `🔴 Conductor INACTIVO detectado: ${driverName} (${driverId})`,
            {
              lastUpdate: lastLocationDate.toISOString(),
              inactiveMinutes: inactiveMinutes,
              threshold: inactivityThresholdMinutes,
            },
        );

        // Marcar para desconexión en el batch
        batch.update(doc.ref, {
          userStateShareLocation: false,
          lastAutoDisconnect: admin.firestore.FieldValue.serverTimestamp(),
          autoDisconnectReason: `Inactivo por ${inactiveMinutes} minutos sin compartir ubicación`,
        });

        disconnectedCount++;
      }
    }

    // Ejecutar desconexiones en batch (atómico)
    if (disconnectedCount > 0) {
      await batch.commit();
      logger.info(
          `✅ Desconexión completada: ${disconnectedCount} de ${inactiveCount} conductores inactivos`,
      );
    } else {
      logger.info("✅ Todos los conductores conectados están activos");
    }

    // Log de resumen
    logger.info("📋 Resumen de verificación:", {
      totalConnected: snapshot.size,
      inactiveDetected: inactiveCount,
      disconnected: disconnectedCount,
      timestamp: now.toDate().toISOString(),
    });

    return {
      success: true,
      totalConnected: snapshot.size,
      inactiveDetected: inactiveCount,
      disconnected: disconnectedCount,
    };
  } catch (error) {
    logger.error("❌ Error en checkInactiveDrivers:", error);
    throw error; // Esto activará los reintentos automáticos
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════════
 * 📝 NOTAS DE IMPLEMENTACIÓN
 * ═══════════════════════════════════════════════════════════════════════
 *
 * 1. PERFORMANCE:
 *    - Se usa batch writes para actualizar múltiples documentos atómicamente
 *    - Máximo 500 operaciones por batch (si hay más conductores, se debe dividir)
 *
 * 2. SEGURIDAD:
 *    - Solo se desconectan conductores con más de 10 minutos de inactividad
 *    - Se registra el motivo de desconexión en autoDisconnectReason
 *    - Se guarda timestamp de desconexión en lastAutoDisconnect
 *
 * 3. MONITOREO:
 *    - Logs detallados en cada ejecución
 *    - Se puede ver en Firebase Console > Functions > Logs
 *    - Comando: firebase functions:log
 *
 * 4. ESCALABILIDAD:
 *    - Si hay más de 500 conductores conectados, se debe implementar paginación
 *    - Considerar aumentar el intervalo de ejecución si hay muchos conductores
 *
 * 5. COSTOS:
 *    - Ejecución cada 5 minutos = 288 ejecuciones/día
 *    - Plan Spark (gratis): 125K invocaciones/mes (suficiente)
 *    - Plan Blaze: $0.40 por millón de invocaciones
 */

/**
 * ═══════════════════════════════════════════════════════════════════════
 * 💰 COMMISSION CALCULATION SYSTEM
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Sistema profesional para calcular comisiones de conductores
 *
 * POST /v1/calculateCommission
 * Body: {
 *   tripId: string,
 *   driverId: string,
 *   tripAmount: number,
 *   currency?: string
 * }
 *
 * Response: {
 *   success: boolean,
 *   tripAmount: number,
 *   commissionRate: number,
 *   commissionAmount: number,
 *   driverEarnings: number,
 *   platformEarnings: number,
 *   currency: string,
 *   appliedAt: string
 * }
 */
app.post("/v1/calculateCommission", async (req, res) => {
    const { tripId, driverId, tripAmount, currency = 'USD' } = req.body;

    // Validaciones
    if (!tripId || !driverId || !tripAmount) {
        return res.status(400).json({
            success: false,
            message: "Missing required parameters: tripId, driverId, tripAmount"
        });
    }

    if (tripAmount <= 0) {
        return res.status(400).json({
            success: false,
            message: "Trip amount must be greater than 0"
        });
    }

    try {
        logger.info(`💰 Calculating commission for trip ${tripId}, driver ${driverId}`);

        // 1. Obtener información del conductor
        const driverDoc = await db.collection("users").doc(driverId).get();

        if (!driverDoc.exists) {
            return res.status(404).json({
                success: false,
                message: "Driver not found"
            });
        }

        const driverData = driverDoc.data();

        // 2. Obtener la comisión del conductor (por defecto 20%)
        const DEFAULT_COMMISSION_RATE = 20;
        let commissionRate = DEFAULT_COMMISSION_RATE;

        if (driverData.userCommissionCustomEnabled && driverData.userCommissionRate !== undefined) {
            commissionRate = driverData.userCommissionRate;
        } else if (driverData.userCommissionRate !== undefined) {
            commissionRate = driverData.userCommissionRate;
        }

        // 3. Calcular montos
        const commissionAmount = (tripAmount * commissionRate) / 100;
        const driverEarnings = tripAmount - commissionAmount;
        const platformEarnings = commissionAmount;

        logger.info(`💵 Trip: $${tripAmount} | Commission: ${commissionRate}% ($${commissionAmount.toFixed(2)}) | Driver: $${driverEarnings.toFixed(2)}`);

        // 4. Guardar el cálculo en el viaje (opcional - para auditoría)
        const commissionData = {
            tripId: tripId,
            driverId: driverId,
            driverName: driverData.userName || 'Unknown',
            tripAmount: tripAmount,
            commissionRate: commissionRate,
            commissionAmount: parseFloat(commissionAmount.toFixed(2)),
            driverEarnings: parseFloat(driverEarnings.toFixed(2)),
            platformEarnings: parseFloat(platformEarnings.toFixed(2)),
            currency: currency,
            calculatedAt: admin.firestore.FieldValue.serverTimestamp(),
            calculatedDate: new Date().toISOString(),
            isCustomRate: driverData.userCommissionCustomEnabled || false
        };

        // Guardar en subcolección de comisiones del viaje
        await db.collection("trips").doc(tripId).collection("commission").doc("calculation").set(commissionData);

        // También guardar referencia en el conductor para reportes
        await db.collection("users").doc(driverId).collection("commissions").doc(tripId).set(commissionData);

        logger.info(`✅ Commission calculation saved for trip ${tripId}`);

        // 5. Responder
        return res.status(200).json({
            success: true,
            ...commissionData,
            appliedAt: new Date().toISOString()
        });

    } catch (error) {
        logger.error("❌ Error calculating commission:", error);
        return res.status(500).json({
            success: false,
            message: "Error calculating commission",
            error: error.message
        });
    }
});

/**
 * ═══════════════════════════════════════════════════════════════════════
 * 📊 GET DRIVER COMMISSION REPORT
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Obtiene el reporte de comisiones de un conductor
 *
 * GET /v1/driverCommissionReport/:driverId
 * Query params:
 *   - startDate: YYYY-MM-DD (opcional)
 *   - endDate: YYYY-MM-DD (opcional)
 *   - limit: number (default 50, max 500)
 */
app.get("/v1/driverCommissionReport/:driverId", async (req, res) => {
    const { driverId } = req.params;
    const { startDate, endDate, limit = 50 } = req.query;

    if (!driverId) {
        return res.status(400).json({
            success: false,
            message: "Missing driverId parameter"
        });
    }

    try {
        logger.info(`📊 Generating commission report for driver ${driverId}`);

        // Query comisiones del conductor
        let query = db.collection("users").doc(driverId).collection("commissions")
            .orderBy("calculatedDate", "desc");

        if (startDate) {
            query = query.where("calculatedDate", ">=", startDate);
        }

        if (endDate) {
            query = query.where("calculatedDate", "<=", endDate);
        }

        query = query.limit(parseInt(limit));

        const snapshot = await query.get();

        if (snapshot.empty) {
            return res.status(200).json({
                success: true,
                driverId: driverId,
                totalCommissions: 0,
                totalTrips: 0,
                totalEarnings: 0,
                totalPlatformEarnings: 0,
                averageCommissionRate: 0,
                commissions: []
            });
        }

        const commissions = [];
        let totalCommissionAmount = 0;
        let totalDriverEarnings = 0;
        let totalPlatformEarnings = 0;
        let totalCommissionRate = 0;

        snapshot.forEach(doc => {
            const data = doc.data();
            commissions.push({
                tripId: data.tripId,
                date: data.calculatedDate,
                amount: data.tripAmount,
                commissionRate: data.commissionRate,
                commissionAmount: data.commissionAmount,
                driverEarnings: data.driverEarnings,
                platformEarnings: data.platformEarnings,
                currency: data.currency
            });

            totalCommissionAmount += data.commissionAmount || 0;
            totalDriverEarnings += data.driverEarnings || 0;
            totalPlatformEarnings += data.platformEarnings || 0;
            totalCommissionRate += data.commissionRate || 0;
        });

        const averageCommissionRate = totalCommissionRate / commissions.length;

        logger.info(`✅ Report generated: ${commissions.length} trips found`);

        return res.status(200).json({
            success: true,
            driverId: driverId,
            totalCommissions: parseFloat(totalCommissionAmount.toFixed(2)),
            totalTrips: commissions.length,
            totalEarnings: parseFloat(totalDriverEarnings.toFixed(2)),
            totalPlatformEarnings: parseFloat(totalPlatformEarnings.toFixed(2)),
            averageCommissionRate: parseFloat(averageCommissionRate.toFixed(2)),
            currency: commissions[0]?.currency || 'USD',
            period: {
                from: startDate || 'All time',
                to: endDate || 'Now'
            },
            commissions: commissions
        });

    } catch (error) {
        logger.error("❌ Error generating commission report:", error);
        return res.status(500).json({
            success: false,
            message: "Error generating commission report",
            error: error.message
        });
    }
});



exports.api = functions.onRequest(app);
