const functions = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");

const logger = require("firebase-functions/logger");
const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const functionss = require("firebase-functions");

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

// /// *** Generar estadisticas ***
// exports.onNewRequestCreated = onDocumentCreated("users/{userUid}/requestVehicle/{requestId}", async (event) => {

//     // exports.onNewRequestCreated = functions.firestore
//     //     .document('users/{userUid}/requestVehicle/{requestId}')
//     //     .onCreate(async (snap, context) => {
//     const snap = event.data;


//     const request = snap.data();

//     console.log("*** Request ***", request);

//     if (!request) return;

//     /**
//      * *** Obtiene los datos del trip ***
//      */
//     const {
//         requestFullDate,
//         requestPaymentType,
//         requestDriverUid,
//         requestStatusTrip,
//         requestStatePaymentMethodString = "pagado",
//         requestClientUid,
//         requestTripCost = 0,
//     } = request;

//     /**
//      * * *** Validar campos requeridos ***
//      * Asegurarse de que los campos necesarios estén presentes antes de continuar.
//      * Si faltan campos, se puede registrar un error o tomar una acción alternativa.
//      * Esto es importante para evitar errores en la base de datos y asegurar que los datos sean consistentes.
//      */
//     if (!requestDriverUid || !requestClientUid || !requestFullDate) {
//         console.warn("Order missing required fields");
//         return;
//     }

//     /**
//      * Obtenemos la fecha de la orden y la convertimos a un formato adecuado para las estadísticas.
//      * Utilizamos la fecha completa para obtener las estadísticas diarias y mensuales.
//      */
//     const date = requestFullDate.toDate ? requestFullDate.toDate() : new Date(requestFullDate);
//     /**
//      * * Generamos las claves para las estadísticas diarias y mensuales.
//      * Estas claves se utilizan para almacenar y actualizar las estadísticas en Firestore.
//      * - dailyKey: Formato "YYYY-MM-DD" para las estadísticas diarias.
//      * - monthlyKey: Formato "YYYY-MM" para las estadísticas mensuales.
//      * Estas claves se utilizan para agrupar las estadísticas por día y mes respectivamente.
//      * yearKey: Formato "YYYY" para las estadísticas anuales.
//      * Esta clave se utiliza para agrupar las estadísticas por año.
//      */
//     const dailyKey = date.toISOString().split("T")[0]; // "2025-05-24"
//     const monthlyKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`; // "2025-05"
//     const yearKey = `${date.getFullYear()}`; // "2025"

//     /**
//      * * * Referencias a los documentos de estadísticas diarias y mensuales.
//      * Estas referencias se utilizan para actualizar las estadísticas de la orden en Firestore.
//      * - dailyRef: Referencia al documento de estadísticas diarias.
//     * - monthlyRef: Referencia al documento de estadísticas mensuales.
//      * Estas referencias se construyen utilizando el ID del driver de la orden y las claves generadas anteriormente.
//      */
//     const dailyRef = db.doc(`stats/driver_${requestDriverUid}/daily/${dailyKey}`);
//     const monthlyRef = db.doc(`stats/driver_${requestDriverUid}/monthly/${monthlyKey}`);
//     const yearRef = db.doc(`stats/driver_${requestDriverUid}/yearly/${yearKey}`);

//     /**
//      * * *** Actualizamos las estadísticas del trip en Firestore. ***
//      * Utilizamos un objeto `updates` para definir los campos que se actualizarán en el documento de estadísticas.
//      * - totalOrders: Incrementa el número total de órdenes.
//      * - totalAmount: Incrementa el monto total de las órdenes.
//      * - perPaymentMethod: Incrementa el conteo por método de pago.
//      * Estos campos se actualizan utilizando `admin.firestore.FieldValue.increment()`, lo que permite incrementar los valores sin necesidad de leer primero el documento.
//      */
//     const updates = {
//         totalTrip: admin.firestore.FieldValue.increment(1),
//         totalAmount: admin.firestore.FieldValue.increment(requestTripCost),
//     };

//     /**
//      * * * *** Actualizamos las estadísticas por método de pago y estado de pago. ***
//      * - perPaymentMethod: Incrementa el conteo por método de pago.
//      * - paymentStatus: Incrementa el conteo por estado de pago.
//      * - client: Incrementa el conteo por client.
//      * Estos campos se actualizan utilizando `admin.firestore.FieldValue.increment()`, lo que permite incrementar los valores sin necesidad de leer primero el documento.
//      */
//     if (requestPaymentType) {
//         const methodKey = requestPaymentType.toLowerCase();

//         // Conteo por método de pago
//         updates.perPaymentMethod = {
//             [`${methodKey}`]: admin.firestore.FieldValue.increment(1)
//         };

//         // Monto total por método de pago
//         updates.totalAmountPerPaymentMethod = {
//             [`${methodKey}`]: admin.firestore.FieldValue.increment(requestTripCost)
//         };
//     }

//     // Por estado de pago
//     if (requestStatePaymentMethodString) {
//         const statusKey = requestStatePaymentMethodString.toLowerCase().replace(/\s+/g, "_");
//         updates.paymentStatus = {
//             [`${statusKey}`]: admin.firestore.FieldValue.increment(1)
//         };
//     }

//     /**
//      * * * *** Actualizamos las estadísticas por estado del trip y por cliente. ***
//      * - requestStatus: Incrementa el conteo por estado del trip.
//      * - client: Incrementa el conteo por cliente.
//      * Estos campos se actualizan utilizando `admin.firestore.FieldValue.increment()`, lo que permite incrementar los valores sin necesidad de leer primero el documento.
//      * - requestStatus: Se convierte a minúsculas para asegurar consistencia en el almacenamiento.
//      * - requestClientUid: Se utiliza para identificar al cliente asociado al trip.
//      */
//     const tripState = requestStatusTrip.toString().toLowerCase();
//     updates.orderStatus = {
//         [`${tripState}`]: admin.firestore.FieldValue.increment(1)
//     };

//     // Por client
//     updates.client = {
//         [`${requestClientUid}`]: admin.firestore.FieldValue.increment(1)
//     };

//     /**
//      * * *** Actualizamos las estadísticas de la orden en Firestore. ***
//      * @param {*} ref 
//      * @returns 
//      */
//     console.log(JSON.stringify(updates, null, 3));

//     const updateStats = (ref) =>
//         ref.set(updates, { merge: true });

//     /**
//      * * *** Actualizamos las estadísticas diarias y mensuales en Firestore. ***
//      * Utilizamos `Promise.all()` para ejecutar las actualizaciones de manera concurrente.
//      * Esto mejora el rendimiento al evitar esperar a que cada actualización se complete antes de iniciar la siguiente.
//      */
//     await Promise.all([
//         updateStats(dailyRef),
//         updateStats(monthlyRef),
//         updateStats(yearRef),
//     ]);

//     console.log(`Stats actualizadas para el driver ${requestDriverUid} en ${dailyKey} y ${monthlyKey}`);
//     return true;
// });



exports.api = functions.onRequest(app);
