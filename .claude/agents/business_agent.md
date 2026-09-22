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
- Cada usuario de empresa puede tener asignados establecimientos
  (`company-users/{uid}.establishments`): **vacío = todos**, el **admin siempre todos**,
  asignación **por establecimiento** (no por punto de emisión).

Detalle completo en `establishments_agent.md`.

## Anti-patrones
- Calcular IVA sobre subtotal bruto (antes de descuentos)
- Aceptar RUC/CI sin validar algoritmo SRI
- Incrementar secuencial de documentos sin atomicidad (usar transaction)
- Descontar stock sin registrar movimiento
- Permitir anular factura autorizada en SRI (requiere NC)
