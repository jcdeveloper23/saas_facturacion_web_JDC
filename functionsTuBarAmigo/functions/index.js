const functions = require("firebase-functions");
// var mailjet = require('node-mailjet').connect('f1304695ae3537ed12575ef62c68120f', '67f58127485f64010ec4031cfb4d89bb')

const admin = require('firebase-admin');
// const sha256 = require('sha256');
// const utf8 = require('utf8');
// const btoa = require('btoa');
var request = require('request');

admin.initializeApp();
const db = admin.firestore();


exports.onNewOrderCreated = functions.firestore
    .document('providers/{providerId}/orders/{orderId}')
    .onCreate(async (snap, context) => {
        /**
         * * *** Función que se ejecuta cuando se crea una nueva orden en Firestore ***.
         * Esta función se activa mediante un trigger de Firestore y se encarga de actualizar las estadísticas
         * de la orden en la base de datos.
         */
        const order = snap.data();

        console.log("*** Order ***", order);

        if (!order) return;

        /**
         * *** Obtiene los datos de la orden ***
         */
        const {
            // order_date,
            order_date_full,
            order_payment_method,
            order_provider_id,
            // order_representative_id,
            order_state,
            // order_state_payment_method,
            order_state_payment_method_string = "desconocido",
            // order_state_payment_to_super_admin,
            order_student_id,
            // order_subtotal_price,
            // order_time,
            order_total_to_pay = 0,
            // order_transaccion_id,
        } = order;

        /**
         * * *** Validar campos requeridos ***
         * Asegurarse de que los campos necesarios estén presentes antes de continuar.
         * Si faltan campos, se puede registrar un error o tomar una acción alternativa.
         * Esto es importante para evitar errores en la base de datos y asegurar que los datos sean consistentes.
         */
        if (!order_provider_id || !order_student_id || !order_date_full) {
            console.warn("Order missing required fields");
            return;
        }

        /**
         * Obtenemos la fecha de la orden y la convertimos a un formato adecuado para las estadísticas.
         * Utilizamos la fecha completa para obtener las estadísticas diarias y mensuales.
         */
        const date = order_date_full.toDate ? order_date_full.toDate() : new Date(order_date_full);
        /**
         * * Generamos las claves para las estadísticas diarias y mensuales.
         * Estas claves se utilizan para almacenar y actualizar las estadísticas en Firestore.
         * - dailyKey: Formato "YYYY-MM-DD" para las estadísticas diarias.
         * - monthlyKey: Formato "YYYY-MM" para las estadísticas mensuales.
         * Estas claves se utilizan para agrupar las estadísticas por día y mes respectivamente.
         * yearKey: Formato "YYYY" para las estadísticas anuales.
         * Esta clave se utiliza para agrupar las estadísticas por año.
         */
        const dailyKey = date.toISOString().split("T")[0]; // "2025-05-24"
        const monthlyKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`; // "2025-05"
        const yearKey = `${date.getFullYear()}`; // "2025"

        /**
         * * * Referencias a los documentos de estadísticas diarias y mensuales.
         * Estas referencias se utilizan para actualizar las estadísticas de la orden en Firestore.
         * - dailyRef: Referencia al documento de estadísticas diarias.
        * - monthlyRef: Referencia al documento de estadísticas mensuales.
         * Estas referencias se construyen utilizando el ID del proveedor de la orden y las claves generadas anteriormente.
         */
        const dailyRef = db.doc(`stats/bar_${order_provider_id}/daily/${dailyKey}`);
        const monthlyRef = db.doc(`stats/bar_${order_provider_id}/monthly/${monthlyKey}`);
        const yearRef = db.doc(`stats/bar_${order_provider_id}/yearly/${yearKey}`);

        /**
         * * *** Actualizamos las estadísticas de la orden en Firestore. ***
         * Utilizamos un objeto `updates` para definir los campos que se actualizarán en el documento de estadísticas.
         * - totalOrders: Incrementa el número total de órdenes.
         * - totalAmount: Incrementa el monto total de las órdenes.
         * - perPaymentMethod: Incrementa el conteo por método de pago.
         * Estos campos se actualizan utilizando `admin.firestore.FieldValue.increment()`, lo que permite incrementar los valores sin necesidad de leer primero el documento.
         */
        const updates = {
            totalOrders: admin.firestore.FieldValue.increment(1),
            totalAmount: admin.firestore.FieldValue.increment(order_total_to_pay),
        };

        /**
         * * * *** Actualizamos las estadísticas por método de pago y estado de pago. ***
         * - perPaymentMethod: Incrementa el conteo por método de pago.
         * - paymentStatus: Incrementa el conteo por estado de pago.
         * - students: Incrementa el conteo por estudiante.
         * Estos campos se actualizan utilizando `admin.firestore.FieldValue.increment()`, lo que permite incrementar los valores sin necesidad de leer primero el documento.
         */
        if (order_payment_method) {
            const methodKey = order_payment_method.toLowerCase();

            // Conteo por método de pago
            updates.perPaymentMethod = {
                [`${methodKey}`]: admin.firestore.FieldValue.increment(1)
            };

            // Monto total por método de pago
            updates.totalAmountPerPaymentMethod = {
                [`${methodKey}`]: admin.firestore.FieldValue.increment(order_total_to_pay)
            };
        }

        // Por estado de pago
        if (order_state_payment_method_string) {
            const statusKey = order_state_payment_method_string.toLowerCase().replace(/\s+/g, "_");
            updates.paymentStatus = {
                [`${statusKey}`]: admin.firestore.FieldValue.increment(1)
            };
        }

        /**
         * * * *** Actualizamos las estadísticas por estado de la orden y por estudiante. ***
         * - orderStatus: Incrementa el conteo por estado de la orden.
         * - students: Incrementa el conteo por estudiante.
         * Estos campos se actualizan utilizando `admin.firestore.FieldValue.increment()`, lo que permite incrementar los valores sin necesidad de leer primero el documento.
         * - orderState: Se convierte a minúsculas para asegurar consistencia en el almacenamiento.
         * - order_student_id: Se utiliza para identificar al estudiante asociado a la orden.
         */
        const orderState = order_state.toString().toLowerCase();
        updates.orderStatus = {
            [`${orderState}`]: admin.firestore.FieldValue.increment(1)
        };

        // Por estudiante
        updates.students = {
            [`${order_student_id}`]: admin.firestore.FieldValue.increment(1)
        };

        /**
         * * *** Actualizamos las estadísticas de la orden en Firestore. ***
         * @param {*} ref 
         * @returns 
         */
        console.log(JSON.stringify(updates, null, 3));
        
        const updateStats = (ref) =>
            ref.set(updates, { merge: true });

        /**
         * * *** Actualizamos las estadísticas diarias y mensuales en Firestore. ***
         * Utilizamos `Promise.all()` para ejecutar las actualizaciones de manera concurrente.
         * Esto mejora el rendimiento al evitar esperar a que cada actualización se complete antes de iniciar la siguiente.
         */
        await Promise.all([
            updateStats(dailyRef),
            updateStats(monthlyRef),
            updateStats(yearRef),
        ]);

        console.log(`Stats actualizadas para bar ${order_provider_id} en ${dailyKey} y ${monthlyKey}`);
        return true;
    }); 

