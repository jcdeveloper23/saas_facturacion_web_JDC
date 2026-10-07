---
name: SRI Agent — Facturación Electrónica Ecuador
description: Experto en facturación electrónica SRI Ecuador para SaasFacturacion. Implementa generación de clave de acceso 49 dígitos (módulo 11), estructura XML según esquema SRI, firma electrónica con certificado .p12, envío al webservice SRI (pruebas y producción) y procesamiento de respuestas RIDE/autorización.
---

# SRI Agent — Facturación Electrónica Ecuador

## Documentos Electrónicos Soportados (SRI)

| Tipo | Código | Schema XSD |
|------|--------|-----------|
| Factura | 01 | factura_V2.1.0.xsd |
| Nota de Crédito | 04 | notaCredito_V1.1.0.xsd |
| Nota de Débito | 05 | notaDebito_V1.1.0.xsd |
| Guía de Remisión | 06 | guiaRemision_V1.1.0.xsd |
| Liquidación de Compra | 08 | liquidacionCompra_V1.1.0.xsd |
| Comprobante de Retención | 07 | comprobanteRetencion_V2.0.0.xsd |

## Ambientes SRI

```
Pruebas:    1 | https://celcer.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline?wsdl
Producción: 2 | https://cel.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline?wsdl

Autorización pruebas:    https://celcer.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline?wsdl
Autorización producción: https://cel.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline?wsdl
```

## Clave de Acceso — 49 Dígitos

```
Posición  Longitud  Descripción
1-8          8      Fecha de emisión: ddmmaaaa
9-11         3      Tipo de comprobante: 01, 04, 05, 06, 07, 08
12-24       13      RUC del emisor
25           1      Ambiente: 1=Pruebas, 2=Producción
26-29        4      Serie: 001001 (establ+puntoEmision)
30-38        9      Secuencial: 000000001
39-47        9      Código numérico: aleatorio (para unicidad)
48           1      Tipo de emisión: 1=Normal
49           1      Dígito verificador (módulo 11)
```

## Algoritmo Módulo 11 (Dígito Verificador)

```typescript
function calcularDigitoVerificador(clave48: string): number {
  const factores = [2, 3, 4, 5, 6, 7];
  let suma = 0;
  let factorIdx = 0;

  for (let i = clave48.length - 1; i >= 0; i--) {
    suma += parseInt(clave48[i]) * factores[factorIdx % 6];
    factorIdx++;
  }

  const residuo = suma % 11;
  if (residuo === 0) return 0;
  if (residuo === 1) return 1;
  return 11 - residuo;
}

function generarClaveAcceso(params: {
  fecha: Date,
  tipoComprobante: string,
  ruc: string,
  ambiente: 1 | 2,
  serie: string,           // '001001'
  secuencial: string,      // '000000001'
  codigoNumerico: string,  // '00000001' (8 dígitos aleatorio)
}): string {
  const fecha = format(params.fecha, 'ddMMuuuu');
  const clave48 = [
    fecha,
    params.tipoComprobante,
    params.ruc,
    params.ambiente,
    params.serie,
    params.secuencial,
    params.codigoNumerico,
    '1' // tipo emisión normal
  ].join('');
  const verificador = calcularDigitoVerificador(clave48);
  return clave48 + verificador;
}
```

## Estructura XML Factura (campos mínimos)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<factura id="comprobante" version="2.1.0">
  <infoTributaria>
    <ambiente>1</ambiente>              <!-- 1=Pruebas, 2=Producción -->
    <tipoEmision>1</tipoEmision>
    <razonSocial>EMPRESA S.A.</razonSocial>
    <nombreComercial>EMPRESA</nombreComercial>
    <ruc>0901234567001</ruc>
    <claveAcceso><!-- 49 dígitos --></claveAcceso>
    <codDoc>01</codDoc>
    <estab>001</estab>
    <ptoEmi>001</ptoEmi>
    <secuencial>000000001</secuencial>
    <dirMatriz>DIRECCIÓN</dirMatriz>
  </infoTributaria>
  <infoFactura>
    <fechaEmision>01/01/2025</fechaEmision>
    <dirEstablecimiento>DIRECCIÓN</dirEstablecimiento>
    <tipoIdentificacionComprador>04</tipoIdentificacionComprador>
    <!-- 04=RUC, 05=Cédula, 06=Pasaporte, 07=Consumidor final -->
    <razonSocialComprador>CLIENTE</razonSocialComprador>
    <identificacionComprador>0901234567001</identificacionComprador>
    <totalSinImpuestos>100.00</totalSinImpuestos>
    <totalDescuento>0.00</totalDescuento>
    <totalConImpuestos>
      <totalImpuesto>
        <codigo>2</codigo>        <!-- 2=IVA -->
        <codigoPorcentaje>3</codigoPorcentaje>  <!-- 3=15% -->
        <descuentoAdicional>0.00</descuentoAdicional>
        <baseImponible>100.00</baseImponible>
        <valor>15.00</valor>
      </totalImpuesto>
    </totalConImpuestos>
    <propina>0.00</propina>
    <importeTotal>115.00</importeTotal>
    <moneda>DOLAR</moneda>
    <pagos>
      <pago>
        <formaPago>01</formaPago>  <!-- 01=Sin utilización del sistema financiero -->
        <total>115.00</total>
      </pago>
    </pagos>
  </infoFactura>
  <detalles>
    <detalle>
      <codigoPrincipal>PROD001</codigoPrincipal>
      <descripcion>PRODUCTO</descripcion>
      <cantidad>1.000000</cantidad>
      <precioUnitario>100.000000</precioUnitario>
      <descuento>0.00</descuento>
      <precioTotalSinImpuesto>100.00</precioTotalSinImpuesto>
      <impuestos>
        <impuesto>
          <codigo>2</codigo>
          <codigoPorcentaje>3</codigoPorcentaje>
          <tarifa>15.00</tarifa>
          <baseImponible>100.00</baseImponible>
          <valor>15.00</valor>
        </impuesto>
      </impuestos>
    </detalle>
  </detalles>
</factura>
```

## Tipos de Identificación Comprador

```
01 = RUC
02 = Cédula
03 = Pasaporte
04 = Venta a consumidor final (9999999999999)
05 = Identificación del exterior
06 = Placa
```

## Formas de Pago SRI

```
01 = Sin utilización del sistema financiero
16 = Tarjeta de débito
17 = Dinero electrónico
19 = Tarjeta prepago
20 = Tarjeta de crédito
21 = Otros con utilización del sistema financiero
15 = Compensación de deudas
```

## Flujo de Firma y Envío (Cloud Function)

```typescript
// 1. Generar XML
const xml = generarXMLFactura(factura);

// 2. Firmar con certificado .p12 (xmldsig)
const xmlFirmado = await firmarXML(xml, certBuffer, certPassword);

// 3. Enviar al SRI (recepción)
const respRecepcion = await enviarAlSRI(xmlFirmado, ambiente);
// Estado: RECIBIDA | DEVUELTA (errores de validación)

// 4. Si RECIBIDA → consultar autorización
if (respRecepcion.estado === 'RECIBIDA') {
  const respAuth = await consultarAutorizacion(claveAcceso, ambiente);
  // Estado: AUTORIZADO | NO AUTORIZADO
}

// 5. Guardar claveAcceso + estado + numeroAutorizacion en Firestore
await db.doc(`companies/${companyId}/invoices/${invoiceId}`)
  .update({ claveAcceso, estadoSRI: 'AUTORIZADO', numeroAutorizacion, fechaAutorizacion });
```

## Campos de la Empresa Necesarios para SRI

```typescript
// /companies/{companyId}/sriConfig
interface SriConfig {
  ruc: string;
  razonSocial: string;
  nombreComercial: string;
  dirMatriz: string;
  estab: string;           // '001'
  ptoEmision: string;      // '001'
  ambiente: 1 | 2;         // 1=Pruebas, 2=Producción
  certPath: string;        // path en Firebase Storage
  certPassword: string;    // encriptada o en Secret Manager
}
```

## Establecimientos (2026-09-22)

- Cada comprobante sale con el establecimiento y punto de emisión **de su serie**
  (`seriesEstablishment` / `seriesEmissionPoint`), resueltos con
  `resolveEmissionSeries()` de `functions/src/utils/establishments.ts`: los del documento
  si están los dos, si no los de la empresa. Nunca mezclar uno con otro.
- `<dirEstablecimiento>` sale de `companies/{cid}/establishments/{código}.address`
  (`resolveEstablishmentAddress`), con fallback a `configuration/sri`.
- Numeración independiente por `{estab}_{pto}_{año}`.
- ⏳ `createAndEmitInvoice` todavía emite con el establecimiento de la empresa.

Detalle completo en `establishments_agent.md`.

## Información adicional y «RUC Proveedor» (2026-10-02)

- **Obligatorio desde el 2026-09-26** (Resolución **NAC-DGERCGC26-00000027**, RO del
  2026-07-28; Ficha Técnica v2.34, anexo 26): **todo** comprobante electrónico (factura,
  NC, ND, retención, guía de remisión, liquidación de compra) lleva en `<infoAdicional>`
  `<campoAdicional nombre="RUC Proveedor">` con el RUC de quien comercializa el sistema.
- FacturaEc lo comercializa **WECONNECT CORP. CIA. LTDA., RUC `0190434990001`**
  (decisión del usuario, 2026-10-02).
- `functions/src/utils/software-provider.ts` → `resolveSoftwareProviderRuc(company)`:
  `channels/{channelId}.softwareProviderRuc` **>** `platform/defaults/sriConfig/data.softwareProviderRuc`
  **>** `DEFAULT_SOFTWARE_PROVIDER_RUC`. Un valor que no sea `^\d{10}001$` se ignora.
  Cambiarlo en Firestore no exige redesplegar (caché de 5 min por instancia).
- `buildAdditionalInfo({ …, providerRuc })` (`utils/additional-info.ts`) lo pone **al
  final**, con **cupo reservado** (el tope de 15 nunca lo desplaza) y **reemplaza** uno
  escrito a mano («RUC Proveedor», «RUC del proveedor»). Lo usan los XML y RIDE de factura
  y NC y los XML de retención y ND. `validateAdditionalInfoInput` deja **14** libres, y
  Conecta (`additionalInfoMaxFields`) también.
- ⛔ **Todo generador nuevo de XML** (guía de remisión, liquidación de compra…) debe pasar
  por `buildAdditionalInfo` con `providerRuc`; sin él, el comprobante incumple la norma.
- ⛔ Ningún `campoAdicional` vacío: el SRI devuelve el comprobante por estructura.
- Al cambiar `additional-info.ts` o `software-provider.ts` se redespliegan **juntas**
  (cada una lleva su copia compilada): `generateInvoiceXml`, `generateCreditNoteXml`,
  `generatePdf`, `generateCreditNotePdf`, `generateRetentionXml`, `generateDebitNoteXml`,
  `onInvoiceEmit`, `onRetentionEmit`, `onDebitNoteEmit`, `createAndEmitInvoice` y
  `backfillNotRequiredInvoices`.

## Nota de crédito (04) y nota de débito (05) — 2026-10-06

Hasta `c0a13fe` las dos salían **fuera de esquema** (nunca se habían emitido en producción). Constructores puros en `functions/src/utils/sri-note-xml.ts`, probados en `__tests__/sri-note-xml.test.ts` (la NC con **xmllint contra el XSD oficial** de `docs/XML y XSD Nota de Crédito/`).
- **NC:** versión **1.1.0** (la 1.0.0 solo admite 2 decimales en cantidad/precio). **No existe `numAutDocSustento`**: se relaciona por `codDocModificado`, `numDocModificado` y `fechaEmisionDocSustento`. Detalle con `<codigoInterno>`, **sin** `<unidadMedida>` ni `<codigoPrincipal>`. NC por valor = línea 1 × valor.
- **ND** (ficha técnica v2.34): `<valorTotal>` (no `importeTotal`), **sin** `<moneda>`, `<pagos>` obligatorio (Tabla 24; vacío → '20'), **sin** `numAutorizacionDocSustento`, y **siempre un `<impuesto>`**, también con IVA 0 %. Envío por `sendToSriInternal(…, 'debitNote')`.
- Error del SRI «35 ARCHIVO NO CUMPLE ESTRUCTURA XML» = XML fuera de esquema: validar contra el XSD antes de buscar otra causa.
- Tabla 17 del IVA solo en `utils/sri-vat-codes.ts` (`sriVatCode`). Cada function empaqueta su copia: tocar un generador obliga a redesplegar sus dependientes (`onInvoiceEmit`, `onDebitNoteEmit`…).

## Anti-patrones
- Construir XML con concatenación de strings (usar builder o template literal controlado)
- Hardcodear RUC del emisor (leer siempre de /companies/{id}/sriConfig)
- Calcular módulo 11 incorrecto (verificar con ejemplos del SRI)
- Enviar a ambiente producción sin validar en pruebas primero
- Guardar el certificado .p12 en Firestore (usar Storage + Secret Manager)
- No guardar la clave de acceso en Firestore inmediatamente al generarla
- Ignorar los errores de validación del SRI (estado DEVUELTA) — siempre parsear mensajes
