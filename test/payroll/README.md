# Prueba de integración de la nómina (E3)

Llama a las callables de `functions/src/payroll/` de verdad (handler `.run`) contra el
**emulador de Firestore**, con datos de prueba: roles denegados, alta de empleado, novedades,
crear → aprobar (asiento 1.411,53 del ejemplo §4.5) → PDF → reversar → versión 2, y que con el
ejercicio cerrado no se reversa. No toca producción (proyecto `demo-facturaec`).

```bash
cd functions && npm install && cd ..        # jest, ts-jest, pdfkit…
firebase emulators:exec -c firebase.rules-test.json --only firestore \
  --project demo-facturaec "functions/node_modules/.bin/jest -c test/payroll/jest.config.js"
```

> ⚠️ Aviso, solo si tu Java por defecto es menor que 21: antepón
> `JAVA_HOME=/opt/homebrew/opt/openjdk@21 PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH`
> (ver `docs/NOMINA_E2.md` §4).

`sendPayslipEmails` no está aquí: necesita SMTP real y `@google-cloud/secret-manager`.
