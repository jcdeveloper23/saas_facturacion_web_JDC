# Pruebas de las reglas de Firestore

Comprueban `firestore.rules` contra el emulador, con tokens sin firmar para
simular cada rol (admin, accountant, seller, cashier, read_only, channel_admin,
super_admin).

```bash
# Requiere Java 21 o superior (lo exige el emulador de firebase-tools).
firebase emulators:exec -c firebase.rules-test.json --only firestore \
  --project demo-facturaec "node test/rules/test.js"
```

Usan su propia configuración (`firebase.rules-test.json`, en la raíz, puerto **8181**) para no
tocar el `firebase.json` del repo, del que dependen los scripts de siembra con
emulador (puerto 8080).

**Las reglas se suman (OR).** Toda colección con `match` propio tiene que estar
excluida de la regla por defecto `match /{collection}/{id}`; si no, esa regla
—que deja escribir a admin, seller y cashier— anula sus restricciones. Las
pruebas de «protecciones» fijan justamente eso.
