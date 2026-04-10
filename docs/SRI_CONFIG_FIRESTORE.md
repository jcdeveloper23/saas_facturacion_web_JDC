# Configuración SRI Ecuador — Firestore

**Path:** `platform/defaults/sriConfig/data`  
**Última verificación:** Abril 2026  
**Fuente:** Ficha Técnica Comprobantes Electrónicos SRI v2.32, octubre 2025

---

## Cómo cargar en Firestore

Ve a **Super Admin → Config SRI Ecuador** y presiona **Guardar Todo** con los valores de abajo.  
O usa el botón **"Inicializar datos de fábrica"** en Config General (incluye sriConfig).

---

## 1. Versiones de Schema XML

| Campo | Valor |
|-------|-------|
| facturaVersion | `1.0.0` |
| notaCreditoVersion | `1.0.0` |
| notaDebitoVersion | `1.0.0` |

---

## 2. Endpoints WSDL (Secciones 7.2 y 8.2)

### Ambiente Pruebas (`celcer.sri.gob.ec`)
| Campo | URL |
|-------|-----|
| receptionUrl | `https://celcer.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline?wsdl` |
| authorizationUrl | `https://celcer.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline?wsdl` |
| consultaComprobanteUrl | `https://celcer.sri.gob.ec/comprobantes-electronicos-ws/ConsultaComprobante?wsdl` |
| consultaFacturaUrl | `https://celcer.sri.gob.ec/comprobantes-electronicos-ws/ConsultaFactura?wsdl` |

### Ambiente Producción (`cel.sri.gob.ec`)
| Campo | URL |
|-------|-----|
| receptionUrl | `https://cel.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline?wsdl` |
| authorizationUrl | `https://cel.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline?wsdl` |
| consultaComprobanteUrl | `https://cel.sri.gob.ec/comprobantes-electronicos-ws/ConsultaComprobante?wsdl` |
| consultaFacturaUrl | `https://cel.sri.gob.ec/comprobantes-electronicos-ws/ConsultaFactura?wsdl` |

### Namespaces SOAP
| Servicio | Namespace |
|----------|-----------|
| Recepción | `http://ec.gob.sri.ws.recepcion` |
| Autorización | `http://ec.gob.sri.ws.autorizacion` |
| Consulta | `http://ec.gob.sri.ws.consultas` |

---

## 3. Configuración General de Emisión (TABLAS 2 y 4)

| Campo | Valor | Descripción |
|-------|-------|-------------|
| emissionType | `1` | TABLA 2: Normal (único para método offline) |
| environmentCodes.testing | `1` | TABLA 4: Código ambiente pruebas en clave de acceso |
| environmentCodes.production | `2` | TABLA 4: Código ambiente producción en clave de acceso |
| consumidorFinalId | `9999999999999` | Sección 9.10: 13 nueves, identificación estándar |
| consumidorFinalMaxAmountUsd | `50` | Sección 9.10: sobre este monto DEBE identificarse al comprador |

> **Nota Sección 9.10:** En liquidaciones de compra NO se puede usar Consumidor Final.

---

## 4. Tipos de Comprobante (TABLA 3)

| Documento | Código `codDoc` |
|-----------|----------------|
| Factura | `01` |
| Liquidación de Compra de Bienes y Prestación de Servicios | `03` |
| Nota de Crédito | `04` |
| Nota de Débito | `05` |
| Guía de Remisión | `06` |
| Comprobante de Retención | `07` |

---

## 5. Tipo de Impuesto para `<codigo>` en XML (TABLA 16)

| Impuesto | Código |
|----------|--------|
| IVA | `2` |
| ICE | `3` |
| IRBPNR | `5` |

> **Importante:** Este código va en el campo `<codigo>` del elemento `<impuesto>`, DISTINTO del `<codigoPorcentaje>`.

---

## 6. Tarifas IVA — `<codigoPorcentaje>` (TABLA 17)

Fuente: **TABLA 17** — Ficha Técnica v2.32, oct 2025.  
Vigente desde **marzo 2024** (Ley Orgánica de Eficiencia Económica y Generación de Empleo).

| vatPct | sriCode | name | isExempt |
|--------|---------|------|----------|
| `15` | `4` | IVA 15% | — |
| `5` | `5` | IVA 5% | — |
| `8` | `8` | IVA diferenciado 8% (turismo) | — |
| `0` | `0` | IVA 0% | — |
| `0` | `6` | No objeto de IVA | `true` |
| `0` | `7` | Exento de IVA | `true` |

> **Códigos históricos (NO usar en facturas nuevas):** `2`=12%, `3`=14%  
> **IVA diferenciado 8%** (código `8`): aplica al sector turístico hasta 12 días/año por decreto ejecutivo.  
> **Código `6`** = No objeto de IVA (servicios de salud, educación, financieros)  
> **Código `7`** = Exento de IVA (exportaciones)

---

## 7. Impuestos Sujetos a Retención (TABLA 19)

| taxName | taxLabel | Código |
|---------|----------|--------|
| RENTA | Impuesto a la Renta | `1` |
| IVA | IVA | `2` |
| ISD | Impuesto a la Salida de Divisas | `6` |

---

## 8. Porcentajes Retención IVA (TABLA 20)

| % Retención | Código SRI | Descripción |
|-------------|-----------|-------------|
| 10% | `9` | Retención IVA 10% |
| 20% | `10` | Retención IVA 20% |
| 30% | `1` | Retención IVA 30% |
| 50% | `11` | Retención IVA 50% |
| 70% | `2` | Retención IVA 70% |
| 100% | `3` | Retención IVA 100% |
| 0% | `7` | Retención en cero |
| 0% | `8` | No procede retención |

---

## 9. Formas de Pago (TABLA 24)

| Código | Descripción |
|--------|-------------|
| `01` | Sin utilización del sistema financiero |
| `15` | Compensación de deudas |
| `16` | Tarjeta de débito |
| `17` | Dinero electrónico Ecuador |
| `18` | Tarjeta prepago |
| `19` | Tarjeta de crédito |
| `20` | Otros con utilización del sistema financiero |
| `21` | Endoso de títulos |

---

## 10. Tipos de Identificación del Comprador (TABLA 6)

| Código | Descripción | isRuc | isCedula | isFinal |
|--------|-------------|-------|----------|---------|
| `04` | RUC | `true` | — | — |
| `05` | Cédula de Identidad | — | `true` | — |
| `06` | Pasaporte | — | — | — |
| `07` | Consumidor Final | — | — | `true` |
| `08` | Identificación del Exterior | — | — | — |

**Flags de validación:**
- `isRuc`: 13 dígitos + algoritmo módulo 11 RUC
- `isCedula`: 10 dígitos + algoritmo cédula ecuatoriana
- `isFinal`: acepta `9999999999999` sin validación; NO aplica a liquidaciones de compra

---

## 11. Códigos ICE — `<codigoPorcentaje>` (TABLA 18)

> El campo `<codigo>` del impuesto ICE en XML es siempre **3** (TABLA 16).  
> Los códigos a continuación van en `<codigoPorcentaje>`.

| Código | Descripción | Ad Valorem % | Específica USD |
|--------|-------------|:------------:|:--------------:|
| 3011 | Cigarrillos Rubios | — | 0.16 |
| 3021 | Cigarrillos Negros | — | 0.16 |
| 3023 | Tabaco y Sucedáneos (excl. cigarrillos) | 150% | — |
| 3031 | Bebidas Alcohólicas | 75% | 10.00 |
| 3033 | Alcohol | 75% | 10.00 |
| 3041 | Cerveza Industrial Gran Escala | 75% | — |
| 3043 | Cerveza Artesanal | — | 1.50 |
| 3053 | Bebidas Gaseosas Alto Contenido Azúcar | — | 0.18/100g |
| 3054 | Bebidas Gaseosas Bajo Contenido Azúcar | 10% | — |
| 3073 | Vehículos Motorizados PVP ≤ USD 20.000 | 5% | — |
| 3075 | Vehículos Motorizados PVP USD 30.000–40.000 | 15% | — |
| 3077 | Vehículos Motorizados PVP USD 40.000–50.000 | 20% | — |
| 3078 | Vehículos Motorizados PVP USD 50.000–60.000 | 25% | — |
| 3079 | Vehículos Motorizados PVP USD 60.000–70.000 | 30% | — |
| 3080 | Vehículos Motorizados PVP > USD 70.000 | 35% | — |
| 3081 | Aviones, Tricares, Yates, Barcos de Recreo | 10% | — |
| 3084 | Camionetas/Vehículos Rescate ≤ USD 30.000 | 5% | — |
| 3086 | Vehículos excl. camionetas PVP USD 20.000–30.000 | 10% | — |
| 3088 | Vehículos Híbridos PVP ≤ USD 35.000 | 0% | — |
| 3091 | Vehículos Híbridos PVP USD 35.000–40.000 | 8% | — |
| 3092 | Servicios TV Prepagada | 0% | — |
| 3093 | Servicios Telefonía Sociedades | 15% | — |
| 3101 | Bebidas Energizantes | 10% | — |
| 3111 | Bebidas No Alcohólicas | — | 0.18/100g |
| 3610 | Perfumes y Aguas de Tocador | 20% | — |
| 3620 | Videojuegos | 0% | — |
| 3630 | Armas de Fuego, Deportivas y Municiones | 300% | — |
| 3640 | Focos Incandescentes | 100% | — |
| 3660 | Cuotas, Membresías, Afiliaciones, Acciones | 35% | — |
| 3671 | Calefones y Sist. Calentamiento Agua a Gas | 100% | — |
| 3680 | Fundas Plásticas | — | 0.08 |
| 3681 | Servicios Telefonía Móvil Personas Naturales | 0% | — |
| 3682 | Consumibles Tabaco Calentado y Líquidos Nicotina | 150% | — |

> También existen códigos SENAE (ej. 3533, 3541…) para importadores. Agregar según necesidad.

---

## JSON completo para importar manualmente en Firestore

```json
{
  "facturaVersion": "1.0.0",
  "notaCreditoVersion": "1.0.0",
  "notaDebitoVersion": "1.0.0",
  "endpoints": {
    "testing": {
      "receptionUrl": "https://celcer.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline?wsdl",
      "authorizationUrl": "https://celcer.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline?wsdl",
      "consultaComprobanteUrl": "https://celcer.sri.gob.ec/comprobantes-electronicos-ws/ConsultaComprobante?wsdl",
      "consultaFacturaUrl": "https://celcer.sri.gob.ec/comprobantes-electronicos-ws/ConsultaFactura?wsdl"
    },
    "production": {
      "receptionUrl": "https://cel.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline?wsdl",
      "authorizationUrl": "https://cel.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline?wsdl",
      "consultaComprobanteUrl": "https://cel.sri.gob.ec/comprobantes-electronicos-ws/ConsultaComprobante?wsdl",
      "consultaFacturaUrl": "https://cel.sri.gob.ec/comprobantes-electronicos-ws/ConsultaFactura?wsdl"
    }
  },
  "emissionType": "1",
  "environmentCodes": { "testing": "1", "production": "2" },
  "consumidorFinalId": "9999999999999",
  "consumidorFinalMaxAmountUsd": 50,
  "documentTypeCodes": {
    "invoice": "01", "liquidacion": "03", "creditNote": "04",
    "debitNote": "05", "remission": "06", "retention": "07"
  },
  "taxTypeCodes": { "iva": "2", "ice": "3", "irbpnr": "5" },
  "taxCodes": [
    { "vatPct": 15, "sriCode": "4", "name": "IVA 15%" },
    { "vatPct": 5,  "sriCode": "5", "name": "IVA 5%" },
    { "vatPct": 8,  "sriCode": "8", "name": "IVA diferenciado 8% (turismo)" },
    { "vatPct": 0,  "sriCode": "0", "name": "IVA 0%" },
    { "vatPct": 0,  "sriCode": "6", "name": "No objeto de IVA", "isExempt": true },
    { "vatPct": 0,  "sriCode": "7", "name": "Exento de IVA",   "isExempt": true }
  ],
  "retentionTaxCodes": [
    { "taxName": "RENTA", "taxLabel": "Impuesto a la Renta",         "code": "1" },
    { "taxName": "IVA",   "taxLabel": "IVA",                         "code": "2" },
    { "taxName": "ISD",   "taxLabel": "Impuesto a la Salida Divisas", "code": "6" }
  ],
  "ivaRetentionCodes": [
    { "pct": 10,  "code": "9",  "description": "Retención IVA 10%" },
    { "pct": 20,  "code": "10", "description": "Retención IVA 20%" },
    { "pct": 30,  "code": "1",  "description": "Retención IVA 30%" },
    { "pct": 50,  "code": "11", "description": "Retención IVA 50%" },
    { "pct": 70,  "code": "2",  "description": "Retención IVA 70%" },
    { "pct": 100, "code": "3",  "description": "Retención IVA 100%" },
    { "pct": 0,   "code": "7",  "description": "Retención en cero (0%)" },
    { "pct": 0,   "code": "8",  "description": "No procede retención (0%)" }
  ],
  "paymentMethodCodes": [
    { "code": "01", "name": "Sin utilización del sistema financiero" },
    { "code": "15", "name": "Compensación de deudas" },
    { "code": "16", "name": "Tarjeta de débito" },
    { "code": "17", "name": "Dinero electrónico Ecuador" },
    { "code": "18", "name": "Tarjeta prepago" },
    { "code": "19", "name": "Tarjeta de crédito" },
    { "code": "20", "name": "Otros con utilización del sistema financiero" },
    { "code": "21", "name": "Endoso de títulos" }
  ],
  "identificationTypes": [
    { "code": "04", "name": "RUC",                        "isRuc": true },
    { "code": "05", "name": "Cédula de Identidad",        "isCedula": true },
    { "code": "06", "name": "Pasaporte" },
    { "code": "07", "name": "Consumidor Final",            "isFinal": true },
    { "code": "08", "name": "Identificación del Exterior" }
  ],
  "iceCodes": [
    { "code": "3011", "description": "Cigarrillos Rubios",                              "especificaUsd": 0.16 },
    { "code": "3021", "description": "Cigarrillos Negros",                               "especificaUsd": 0.16 },
    { "code": "3023", "description": "Tabaco y Sucedáneos (excl. cigarrillos)",           "adValoremPct": 150 },
    { "code": "3031", "description": "Bebidas Alcohólicas",                              "adValoremPct": 75, "especificaUsd": 10.00 },
    { "code": "3041", "description": "Cerveza Industrial Gran Escala",                   "adValoremPct": 75 },
    { "code": "3073", "description": "Vehículos Motorizados PVP ≤ USD 20.000",           "adValoremPct": 5 },
    { "code": "3610", "description": "Perfumes y Aguas de Tocador",                      "adValoremPct": 20 },
    { "code": "3630", "description": "Armas de Fuego, Deportivas y Municiones",          "adValoremPct": 300 },
    { "code": "3680", "description": "Fundas Plásticas",                                 "especificaUsd": 0.08 }
  ],
  "updatedBy": "super-admin",
  "updatedAt": "2026-04-09",
  "_source": "Ficha Técnica Comprobantes Electrónicos SRI v2.32, oct 2025"
}
```

---

## Verificación

1. Descargar **Ficha Técnica Comprobantes Electrónicos** desde `sri.gob.ec → Servicios → Comprobantes Electrónicos`
2. Verificar endpoints WSDL abriendo cada URL en el navegador (debe mostrar XML WSDL)
3. Hacer prueba de emisión en **ambiente testing** antes de producción
4. Verificar en cada factura: `<codigo>` del impuesto = TABLA 16, `<codigoPorcentaje>` = TABLA 17
