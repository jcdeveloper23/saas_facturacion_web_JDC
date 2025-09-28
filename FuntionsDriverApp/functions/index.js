const functions = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");

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



exports.api = functions.onRequest(app);
