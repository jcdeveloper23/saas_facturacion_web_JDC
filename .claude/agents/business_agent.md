---
name: Business Agent — SaasFacturacion Reglas de Negocio
description: Experto en las reglas de negocio de SaasFacturacion para Ecuador. Conoce el sistema SRI, cálculo de IVA, estructura de facturas, series de documentos, manejo de stock, límites de crédito de clientes, y la referencia funcional del sistema PHP legado (FacturaScripts Óptica Ecuador).
---

# Business Agent — SaasFacturacion Reglas de Negocio Ecuador

## Contexto
```
País: Ecuador
Regulador fiscal: SRI (Servicio de Rentas Internas)
IVA vigente: 15% (desde mayo 2024), antes 12%
Documentos autorizados: Facturas, NC, ND, Liquidaciones, Retenciones
Referencia legado: sistemadeventascompletoOptica/ (PHP FacturaScripts)
```

## Tipos de Documento SRI

| Código | Tipo | Serie |
|--------|------|-------|
| 01 | Factura | 001-001-XXXXXXXXX |
| 04 | Nota de Crédito | 001-001-XXXXXXXXX |
| 05 | Nota de Débito | 001-001-XXXXXXXXX |
| 06 | Guía de Remisión | 001-001-XXXXXXXXX |
| 08 | Liquidación de Compra | 001-001-XXXXXXXXX |

## Cálculo de Totales en Factura

```
Por cada línea:
  subtotalLinea = cantidad × precioUnitario
  descuentoLinea = subtotalLinea × (descuento% / 100)
  baseImponibleLinea = subtotalLinea - descuentoLinea

Totales:
  subtotal = Σ baseImponibleLinea
  descuentoGlobal = subtotal × (descuentoGlobal% / 100)   [si aplica]
  baseImponibleTotal = subtotal - descuentoGlobal
  iva = baseImponibleTotal × (tasaIva / 100)               [sobre neto, NO bruto]
  total = baseImponibleTotal + iva
```

> ⚠️ **Regla SRI crítica**: el IVA siempre se calcula sobre la base imponible NETA (después de descuentos), nunca sobre el bruto.

## Tarifas de IVA Ecuador

| Código SRI | Descripción | Tasa |
|-----------|-------------|------|
| 0 | No objeto de IVA | 0% |
| 2 | IVA 0% | 0% |
| 3 | IVA 15% (vigente) | 15% |
| 6 | IVA 5% (canasta básica) | 5% |

## Validación de Identificaciones

```typescript
// RUC (13 dígitos)
// - Personas naturales: 10 dígitos cédula + "001"
// - Empresas privadas: 10 dígitos (3er dígito = 9) + "001"
// - Sector público: 10 dígitos (3er dígito = 6) + "001"
// Algoritmo: módulo 11 (RUC privado/público) o módulo 10 (persona natural)

// Cédula (10 dígitos)
// Algoritmo: módulo 10
// 3er dígito: 0-5 = persona natural válida
```

## Series de Documentos

```
Formato: {establecimiento}-{puntoEmision}-{secuencial}
Ejemplo: 001-001-000000001

- establecimiento: 3 dígitos (del RUC o config empresa)
- puntoEmision: 3 dígitos (configurable)
- secuencial: 9 dígitos, autoincremental por tipo de documento
```

## Reglas de Stock

```
- Al confirmar factura → descontar stock de cada producto
- Al anular factura → revertir stock
- Stock mínimo → alerta cuando existencias < mínimo configurado
- Múltiples bodegas → especificar bodega en cada movimiento
- MovimientoStock: { tipo: 'sale'|'purchase'|'adjustment', cantidad, comprobante, fecha }
```

## Límite de Crédito — Clientes

```
- Cada cliente tiene: limiteCredito, saldoDeuda (calculado)
- Al crear factura a crédito: verificar saldoDeuda + factura <= limiteCredito
- Días de crédito: según paymentTerm seleccionado
- Factura vencida: fecha + diasCredito < hoy
```

## Estados de Factura

```
borrador → confirmada → [enviada SRI] → autorizada
                     ↓
                   rechazada → (corregir) → enviada SRI
                     ↓
                   anulada
```

## Referencia Legado (PHP)

Los módulos del sistema PHP en `sistemadeventascompletoOptica/` son la referencia funcional exacta. Antes de implementar cualquier módulo, revisar:
- `ESPECIFICACIONES_MODULOS.md` — qué hace cada módulo
- `GUIA_RAPIDA_DESARROLLO.md` — patrones de código de referencia

## Establecimientos y usuarios (2026-09-22)

- Una empresa tiene matriz y sucursales (`establishments/{código}`), cada una con puntos
  de emisión y numeración propia. No se borran, se desactivan; la matriz no se desactiva.
- Cada usuario de empresa tiene asignados **puntos de emisión**
  (`company-users/{uid}.emissionPoints`, «001-002») y uno por defecto: **vacío = todos**,
  el **admin siempre todos**. El establecimiento sale del punto. Reemplazó a la asignación
  por establecimiento (decisión del 2026-09-22).

Detalle completo en `establishments_agent.md`.

## Estado al 2026-09-30 — lo que no hay que repetir

- **Runtime: Node 22**, `firebase-functions` 7 (`^7.2.5`), `firebase-admin` 13 (`^13.10.0`)
  (`32ead22`, `functions/package.json`). Las **85 functions** de `accounting-system-a5c9f`
  están en `nodejs22` (`functions:list`, 2026-09-30).
- ⛔ **Nunca `firebase deploy --only functions` a secas**: publicaría `getAuthToken`
  (`functions/src/utils/get-auth-token.ts`), que devuelve un ID token con correo y
  contraseña **sin autenticación previa**. Siempre `--only functions:a,functions:b`. Para
  redesplegar todo, **`scripts/deploy-node22.sh`** (`4a6112c`): 4 tandas con nombre
  (contabilidad · otros · empresas-usuarios-portal · pipeline del SRI), **una a la vez**,
  con su log; la del SRI al final y después una factura de prueba en `OG4ydEyOAhtsNmkOjc1P`.
  ⚠️ El script se generó con **81** functions: las 4 posteriores (`importInvoices`,
  `getPlatformSmtp`, `savePlatformSmtp`, `portalListCompanyUsers`) **no están** en sus
  tandas.
- ⛔ **Las functions que comparten un módulo se despliegan JUNTAS**, calculadas por el
  **grafo de imports** (cada una lleva dentro su copia del código que importa; la lección
  de `onInvoiceEmit`). Tocar `smtp-helper.ts` = redesplegar las 21 que envían correo.
- ⛔ **No se despliega nada sin que el usuario lo pida** (desde el 2026-09-30).
- **El `npm install` del predeploy** (`firebase.json` → `npm --prefix functions install`)
  **reescribe `functions/package-lock.json`** en cada deploy: descartarlo con
  `git checkout functions/package-lock.json`. Tampoco entran en commits
  `firebase-debug.log`, `functions/node_modules` ni `functions/lib` (están versionados).
- **Las 3 programadas** (`runMonthlyDepreciation`, `detectOverdueTasksScheduled`,
  `generateWeeklyReport`) dan **403 de Cloud Scheduler** (`cloudscheduler.jobs.update`) al
  redesplegar: **sin efecto** (quedan en `nodejs22` y su tarea las sigue disparando). Para
  que no marque error, el dueño del proyecto debe dar `roles/cloudscheduler.admin` a
  `admin@weconnect.com.ec`.
- **`importInvoices`** (`824cf64` + `bfb256c`, `functions/src/invoices/import-invoices.ts`):
  importar facturas y NC desde XML **por el servidor**; exige admin de la empresa, consulta
  al SRI por la clave y guarda el comprobante que devuelve el SRI (`verifiedWithSri: true`,
  `functions/src/utils/sri-xml-import.ts`). `imported-xml` es solo del servidor.
- **Reglas:** el cliente **no crea ni marca** facturas `authorized` (`e1afe5e`) y **no edita**
  una autorizada: `invoiceAuthorizedGuard()` (`5948d63`, `firestore.rules` ~L237) deja pasar
  solo URLs, `sriError`, notas, cobro y anulación.
- **Información adicional por factura** (`f0f07e3`): `functions/src/utils/additional-info.ts`
  (`buildAdditionalInfo` / `validateAdditionalInfoInput`) — la de cada factura + la de la
  empresa + el correo del comprador, sin vacíos y con tope de 15, en XML y RIDE.
- **SMTP de plataforma en Secret Manager** (`958c898`): secreto `facturaec-smtp-platform`,
  callables `getPlatformSmtp` / `savePlatformSmtp` (solo `super_admin`), y
  `platform/defaults/smtpConfig` **cerrado al navegador** en las reglas.
- **`ECONNRESET` con el SRI:** desde Node 20 el agente HTTP reutiliza sockets y el SRI
  cierra los inactivos. Llamar al SRI con `new https.Agent({ keepAlive: false })` y
  reintentar **solo** fallos de red (`bfb256c`, como `sendToSri`).

## Anti-patrones
- Calcular IVA sobre subtotal bruto (antes de descuentos)
- Aceptar RUC/CI sin validar algoritmo SRI
- Incrementar secuencial de documentos sin atomicidad (usar transaction)
- Descontar stock sin registrar movimiento
- Permitir anular factura autorizada en SRI (requiere NC)
