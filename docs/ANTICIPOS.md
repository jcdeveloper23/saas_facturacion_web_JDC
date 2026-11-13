# Anticipos: clientes, proveedores, saldo a favor y devoluciones

Referencia de cómo funcionan los anticipos en FacturaEc (servidor y web) y en
Conecta (`../weworkcloudweb`, la app donde se gestionan). Última revisión:
2026-11-13.

## Qué es cada cosa

| Caso | Quién paga antes | Cuenta | Qué es para la empresa |
|---|---|---|---|
| **Anticipo de cliente** | El cliente nos paga antes de la factura | 2.1.04.008 Anticipo Clientes (pasivo) | Le debemos la factura o el producto |
| **Saldo a favor** | El cliente paga **de más** al cobrar una factura | Igual: el excedente se vuelve un anticipo de cliente | Igual |
| **Anticipo a proveedor** | Nosotros le pagamos antes de su factura | 1.1.04.003 Anticipos a Proveedores (activo) | Nos debe la factura o el producto |
| **Devolución** | Se devuelve por el banco el saldo que no se usó | La del anticipo contra el banco | Cierra el saldo |

En el sistema anterior eran: Ventas › *Anticipos Clientes*, Cuentas x Cobrar ›
*Pago Factura Anticipo*, Compras › *Anticipos Proveedores*, Cuentas x Pagar ›
*Pago Compra Anticipo*, y el botón *Devoluciones*.

## Asientos

| Operación | Debe | Haber |
|---|---|---|
| Registrar anticipo de cliente | Banco | 2.1.04.008 |
| Aplicarlo a una factura | 2.1.04.008 | CxC (la del asiento de la venta) |
| Registrar anticipo a proveedor | 1.1.04.003 | Banco |
| Cruzarlo con una compra | CxP (la del asiento de la compra) | 1.1.04.003 |
| Devolver a un cliente | 2.1.04.008 | Banco |
| Devolución de un proveedor | Banco | 1.1.04.003 |
| Deshacer / anular | Reversa del asiento, en la misma transacción | |

Las dos cuentas se configuran en la Puesta en marcha (`advancesFromCustomers`,
`advancesToSuppliers` en `settings/accounting.accountMapping`). El anticipo
guarda la cuenta que usó (`advancesAccount`) y sus cruces la respetan aunque el
mapeo cambie después.

## Datos (todo en centavos enteros; solo lo escribe el servidor)

- `companies/{cid}/advances/{id}`: el anticipo. `version: 2`, `partyType`
  (`'customer'` o `'supplier'`; sin campo = cliente), `amountCents`,
  `appliedCents`, `refundedCents`, `availableCents`, `status` (`open` ·
  `applied` · `void`), `accountingEntryId`. Número `ANT-AAAA-000001` (cliente)
  o `APR-AAAA-000001` (proveedor), contador en `counters/advances`.
  Los de `version` ≠ 2 son del prototipo viejo (dólares, sin asiento): se
  muestran, no se operan.
- `companies/{cid}/advanceApplications/{id}`: cada movimiento del anticipo.
  - `kind: 'application'`, `targetType: 'invoice'` → aplicado a una factura
    (las viejas no guardan `targetType`).
  - `kind: 'application'`, `targetType: 'purchase'` → cruzado con una compra.
  - `kind: 'refund'`, `targetType: 'bank'` → devolución (`targetNumber` = la
    cuenta bancaria).
- En la factura o la compra: `advancesApplied = {cents, count, lastId}`. Si
  queda sin saldo solo con anticipos: `isPaid: true`, `paidBy: 'advances'`, sin
  banco (así `payment-entry.ts` no genera un asiento de pago).

## Callables (`functions/src/accounting/advances/`)

| Callable | Archivo | Qué hace |
|---|---|---|
| `registerAdvance` | `advance-callables.ts` | Registra anticipo de cliente |
| `applyAdvance` | `advance-callables.ts` | Lo aplica a facturas |
| `registerSupplierAdvance` | `supplier-advance-callables.ts` | Registra anticipo a proveedor |
| `applySupplierAdvance` | `supplier-advance-callables.ts` | Lo cruza con compras recibidas |
| `refundAdvance` | `advance-refund-callables.ts` | Devuelve saldo (de los dos tipos) |
| `unapplyAdvance` | `advance-callables.ts` | Deshace **cualquier** movimiento: aplicación, cruce o devolución |
| `voidAdvance` | `advance-callables.ts` | Anula un anticipo sin aplicaciones ni devoluciones |
| `collectInvoicePayment` | `cash-vouchers/cash-voucher-callables.ts` | Cobro de factura; el **excedente** queda como anticipo (saldo a favor) |

La lógica pura y probada con Jest está en `advance-logic.ts`,
`supplier-advance-logic.ts` y `advance-refund-logic.ts` (pruebas en
`functions/src/__tests__/`). Solo admin y contador (`ROLES`).

Saldo de una compra (`purchasePendingCents`, `cash-voucher-logic.ts`): bruto −
retención (la emitida viva o la estimada) − anticipos − comprobantes de egreso.
El de una factura: total − retenido − anticipos − recibos de caja.

## Reglas (`firestore.rules`)

- `advances` y `advanceApplications`: leen admin y contador; nadie escribe desde
  el cliente.
- `advancesApplied`, `paidBy`, `paymentEntryId` son campos del servidor en
  facturas y compras.
- Una factura o compra pagada con anticipos no se des-paga ni se le pone banco
  a mano. Con anticipo **parcial**, el resto sí se paga por banco.
- Pruebas: `test/rules/test.js`, bloques «anticipos:» y «anticipos a proveedores:».

## Dónde se usa

- **Conecta** (gestión completa): `lib/features/accounting/advances/` y
  `lib/features/accounting/supplier_advances/`. Menú: Ventas › Anticipos de
  clientes y Pago factura anticipo; Compras › Anticipos a proveedores y Pago
  compra anticipo. También: tarjeta «Anticipos aplicados» en la factura,
  «Pagar con anticipo» en compras y Cuentas por pagar, y Cobros/Pagos
  realizados (anticipos y devoluciones).
- **Web FacturaEc** (solo consulta, a propósito desde el 2026-10-14):
  `src/app/features/accounting/pages/advances-page/`, rutas
  `/accounting/advances` y `/accounting/supplier-advances` (la misma página,
  `data.partyType`).

## Trampas conocidas

- **Los acumulados son mapas**, no números: `Number(doc.advancesApplied)` da
  `NaN`. Leer con `appliedAccCents(doc, 'advancesApplied')`. Así estaba roto
  `voidPurchaseBlocker` hasta el 2026-11-13 (dejaba anular compras con
  anticipos o comprobantes).
- **`total` de una compra ya va neto de la retención estimada**; el bruto es
  `subtotal + totalTax`. No mezclar.
- **El consumidor final no puede quedar con saldo a favor** (`canHoldCustomerCredit`).
- **IVA en anticipos de servicios**: no se calcula; pendiente de confirmar con el
  contador.
- **Compras con el RUC escrito distinto** (guiones, espacios) no salen al cruzar
  si el anticipo se registró sin elegir la persona: se buscan por `supplierId` y,
  si no hay, por `supplierRuc` exacto.
- **Retención emitida después del cruce** mayor que la estimada deja la compra
  con saldo negativo (igual que con comprobantes de egreso).

## Despliegue

Las functions que comparten módulo van juntas (`cloud_functions_agent.md`). Si
se toca algo de `advances/`:

```bash
firebase deploy --only functions:registerAdvance,functions:applyAdvance,functions:unapplyAdvance,functions:voidAdvance,functions:registerSupplierAdvance,functions:applySupplierAdvance,functions:refundAdvance,functions:collectInvoicePayment,functions:voidReceivedPurchase
```

Más `generateJournalEntryFromPurchasePayment`, `regenerateJournalEntries` y
`accountingSetupStatus` si cambia `payment-entry.ts` o el mapeo de cuentas, y
`firestore:rules` si cambian las reglas. Si las reglas ya están al día,
`firebase deploy` puede dar **409** («release already exists»): desplegar
entonces solo las functions.

## Historial

- 2026-10-14 — Anticipos de clientes por callables (E1).
- 2026-10-29 — Saldo a favor: el excedente de un cobro queda como anticipo.
- 2026-11-13 — Anticipos a proveedores, cruce con compras, devoluciones, listas
  de cruces en Conecta, corrección de `voidPurchaseBlocker`.
