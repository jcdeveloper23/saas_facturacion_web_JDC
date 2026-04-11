import * as admin from 'firebase-admin';

// Initialize firebase admin
// It relies on GOOGLE_APPLICATION_CREDENTIALS being set, or connects automatically 
// if run via FIREBASE_FIRESTORE_EMULATOR_HOST or inside a deployed function.
// For local testing without GOOGLE_APPLICATION_CREDENTIALS, you may need to export it.
admin.initializeApp({
  projectId: 'facturasproec'
});
const db = admin.firestore();

const currencies = [
  { code: 'EUR', name: 'EUROS', buyRate: 1, sellRate: 1, isoCode: '978', symbol: '€' },
  { code: 'ARS', name: 'PESOS (ARG)', buyRate: 16.684, sellRate: 16.684, isoCode: '32', symbol: 'AR$' },
  { code: 'CLP', name: 'PESOS (CLP)', buyRate: 704.0227, sellRate: 704.0227, isoCode: '152', symbol: 'CLP$' },
  { code: 'COP', name: 'PESOS (COP)', buyRate: 3140.6803, sellRate: 3140.6803, isoCode: '170', symbol: 'CO$' },
  { code: 'DOP', name: 'PESOS DOMINICANOS', buyRate: 49.7618, sellRate: 49.7618, isoCode: '214', symbol: 'RD$' },
  { code: 'GBP', name: 'LIBRAS ESTERLINAS', buyRate: 0.865, sellRate: 0.865, isoCode: '826', symbol: '£' },
  { code: 'HTG', name: 'GOURDES', buyRate: 72.0869, sellRate: 72.0869, isoCode: '322', symbol: 'G' },
  { code: 'MXN', name: 'PESOS (MXN)', buyRate: 23.3678, sellRate: 23.3678, isoCode: '484', symbol: 'MX$' },
  { code: 'PAB', name: 'BALBOAS', buyRate: 1.128, sellRate: 1.128, isoCode: '590', symbol: 'B' },
  { code: 'PEN', name: 'NUEVOS SOLES', buyRate: 3.736, sellRate: 3.736, isoCode: '604', symbol: 'S/.' },
  { code: 'USD', name: 'DÓLARES EE.UU.', buyRate: 1.129, sellRate: 1.129, isoCode: '840', symbol: '$' },
  { code: 'VEF', name: 'BOLÍVARES', buyRate: 10.6492, sellRate: 10.6492, isoCode: '937', symbol: 'Bs' }
];

const countriesRaw = [
  ['ESP', 'ES', 'España'], ['AFG', 'AF', 'Afganistán'], ['ALB', 'AL', 'Albania'], ['DEU', 'DE', 'Alemania'],
  ['AND', 'AD', 'Andorra'], ['AGO', 'AO', 'Angola'], ['AIA', 'AI', 'Anguila'], ['ATA', 'AQ', 'Antártida'],
  ['ATG', 'AG', 'Antigua y Barbuda'], ['ANT', 'AN', 'Antillas Holandesas'], ['SAU', 'SA', 'Arabia Saudí'],
  ['DZA', 'DZ', 'Argelia'], ['ARG', 'AR', 'Argentina'], ['ARM', 'AM', 'Armenia'], ['ABW', 'AW', 'Aruba'],
  ['AUS', 'AU', 'Australia'], ['AUT', 'AT', 'Austria'], ['AZE', 'AZ', 'Azerbaiyán'], ['BHS', 'BS', 'Bahamas'],
  ['BHR', 'BH', 'Bahréin'], ['BGD', 'BD', 'Bangladesh'], ['BRB', 'BB', 'Barbados'], ['BEL', 'BE', 'Bélgica'],
  ['BLZ', 'BZ', 'Belice'], ['BEN', 'BJ', 'Benín'], ['BMU', 'BM', 'Bermudas'], ['BTN', 'BT', 'Bhután'],
  ['BLR', 'BY', 'Bielorrusia'], ['BOL', 'BO', 'Bolivia'], ['BIH', 'BA', 'Bosnia y Herzegovina'],
  ['BWA', 'BW', 'Botsuana'], ['BRA', 'BR', 'Brasil'], ['BRN', 'BN', 'Brunéi'], ['BGR', 'BG', 'Bulgaria'],
  ['BFA', 'BF', 'Burkina Faso'], ['BDI', 'BI', 'Burundi'], ['CPV', 'CV', 'Cabo Verde'], ['KHM', 'KH', 'Camboya'],
  ['CMR', 'CM', 'Camerún'], ['CAN', 'CA', 'Canadá'], ['TCD', 'TD', 'Chad'], ['CHL', 'CL', 'Chile'],
  ['CHN', 'CN', 'China'], ['CYP', 'CY', 'Chipre'], ['VAT', 'VA', 'Ciudad del Vaticano'], ['COL', 'CO', 'Colombia'],
  ['COM', 'KM', 'Comoras'], ['COG', 'CG', 'Congo'], ['PRK', 'KP', 'Corea del Norte'], ['KOR', 'KR', 'Corea del Sur'],
  ['CIV', 'CI', 'Costa de Marfil'], ['CRI', 'CR', 'Costa Rica'], ['HRV', 'HR', 'Croacia'], ['CUB', 'CU', 'Cuba'],
  ['DNK', 'DK', 'Dinamarca'], ['DMA', 'DM', 'Dominica'], ['ECU', 'EC', 'Ecuador'], ['EGY', 'EG', 'Egipto'],
  ['SLV', 'SV', 'El Salvador'], ['ARE', 'AE', 'Emiratos Árabes Unidos'], ['ERI', 'ER', 'Eritrea'],
  ['SVK', 'SK', 'Eslovaquia'], ['SVN', 'SI', 'Eslovenia'], ['USA', 'US', 'Estados Unidos'], ['EST', 'EE', 'Estonia'],
  ['ETH', 'ET', 'Etiopía'], ['PHL', 'PH', 'Filipinas'], ['FIN', 'FI', 'Finlandia'], ['FJI', 'FJ', 'Fiyi'],
  ['FRA', 'FR', 'Francia'], ['GAB', 'GA', 'Gabón'], ['GMB', 'GM', 'Gambia'], ['GEO', 'GE', 'Georgia'],
  ['GHA', 'GH', 'Ghana'], ['GIB', 'GI', 'Gibraltar'], ['GRD', 'GD', 'Granada'], ['GRC', 'GR', 'Grecia'],
  ['GRL', 'GL', 'Groenlandia'], ['GLP', 'GP', 'Guadalupe'], ['GUM', 'GU', 'Guam'], ['GTM', 'GT', 'Guatemala'],
  ['GUF', 'GF', 'Guayana Francesa'], ['GIN', 'GN', 'Guinea'], ['GNQ', 'GQ', 'Guinea Ecuatorial'],
  ['GNB', 'GW', 'Guinea-Bissau'], ['GUY', 'GY', 'Guyana'], ['HTI', 'HT', 'Haití'], ['HND', 'HN', 'Honduras'],
  ['HKG', 'HK', 'Hong Kong'], ['HUN', 'HU', 'Hungría'], ['IND', 'IN', 'India'], ['IDN', 'ID', 'Indonesia'],
  ['IRN', 'IR', 'Irán'], ['IRQ', 'IQ', 'Iraq'], ['IRL', 'IE', 'Irlanda'], ['BVT', 'BV', 'Isla Bouvet'],
  ['CXR', 'CX', 'Isla de Navidad'], ['NFK', 'NF', 'Isla Norfolk'], ['ISL', 'IS', 'Islandia'],
  ['CYM', 'KY', 'Islas Caimán'], ['CCK', 'CC', 'Islas Cocos'], ['COK', 'CK', 'Islas Cook'],
  ['FRO', 'FO', 'Islas Feroe'], ['SGS', 'GS', 'Islas Georgias del Sur y Sandwich del Sur'],
  ['ALA', 'AX', 'Islas Gland'], ['HMD', 'HM', 'Islas Heard y McDonald'], ['FLK', 'FK', 'Islas Malvinas'],
  ['MNP', 'MP', 'Islas Marianas del Norte'], ['MHL', 'MH', 'Islas Marshall'], ['PCN', 'PN', 'Islas Pitcairn'],
  ['SLB', 'SB', 'Islas Salomón'], ['TCA', 'TC', 'Islas Turcas y Caicos'], ['UMI', 'UM', 'Islas Ultramarinas de Estados Unidos'],
  ['VGB', 'VG', 'Islas Vírgenes Británicas'], ['VIR', 'VI', 'Islas Vírgenes de los Estados Unidos'],
  ['ISR', 'IL', 'Israel'], ['ITA', 'IT', 'Italia'], ['JAM', 'JM', 'Jamaica'], ['JPN', 'JP', 'Japón'],
  ['JOR', 'JO', 'Jordania'], ['KAZ', 'KZ', 'Kazajstán'], ['KEN', 'KE', 'Kenia'], ['KGZ', 'KG', 'Kirguistán'],
  ['KIR', 'KI', 'Kiribati'], ['KWT', 'KW', 'Kuwait'], ['LAO', 'LA', 'Laos'], ['LSO', 'LS', 'Lesotho'],
  ['LVA', 'LV', 'Letonia'], ['LBN', 'LB', 'Líbano'], ['LBR', 'LR', 'Liberia'], ['LBY', 'LY', 'Libia'],
  ['LIE', 'LI', 'Liechtenstein'], ['LTU', 'LT', 'Lituania'], ['LUX', 'LU', 'Luxemburgo'], ['MAC', 'MO', 'Macao'],
  ['MKD', 'MK', 'Macedonia'], ['MDG', 'MG', 'Madagascar'], ['MYS', 'MY', 'Malasia'], ['MWI', 'MW', 'Malaui'],
  ['MDV', 'MV', 'Maldivas'], ['MLI', 'ML', 'Malí'], ['MLT', 'MT', 'Malta'], ['MAR', 'MA', 'Marruecos'],
  ['MTQ', 'MQ', 'Martinica'], ['MUS', 'MU', 'Mauricio'], ['MRT', 'MR', 'Mauritania'], ['MYT', 'YT', 'Mayotte'],
  ['MEX', 'MX', 'México'], ['FSM', 'FM', 'Micronesia'], ['MDA', 'MD', 'Moldavia'], ['MCO', 'MC', 'Mónaco'],
  ['MNG', 'MN', 'Mongolia'], ['MNE', 'ME', 'Montenegro'], ['MSR', 'MS', 'Montserrat'], ['MOZ', 'MZ', 'Mozambique'],
  ['MMR', 'MM', 'Myanmar'], ['NAM', 'NA', 'Namibia'], ['NRU', 'NR', 'Nauru'], ['NPL', 'NP', 'Nepal'],
  ['NIC', 'NI', 'Nicaragua'], ['NER', 'NE', 'Níger'], ['NGA', 'NG', 'Nigeria'], ['NIU', 'NU', 'Niue'],
  ['NOR', 'NO', 'Noruega'], ['NCL', 'NC', 'Nueva Caledonia'], ['NZL', 'NZ', 'Nueva Zelanda'],
  ['OMN', 'OM', 'Omán'], ['NLD', 'NL', 'Países Bajos'], ['PAK', 'PK', 'Pakistán'], ['PLW', 'PW', 'Palaos'],
  ['PSE', 'PS', 'Palestina'], ['PAN', 'PA', 'Panamá'], ['PNG', 'PG', 'Papúa Nueva Guinea'],
  ['PRY', 'PY', 'Paraguay'], ['PER', 'PE', 'Perú'], ['PYF', 'PF', 'Polinesia Francesa'], ['POL', 'PL', 'Polonia'],
  ['PRT', 'PT', 'Portugal'], ['PRI', 'PR', 'Puerto Rico'], ['QAT', 'QA', 'Qatar'], ['GBR', 'GB', 'Reino Unido'],
  ['CAF', 'CF', 'República Centroafricana'], ['CZE', 'CZ', 'República Checa'], ['COD', 'CD', 'República Democrática del Congo'],
  ['DOM', 'DO', 'República Dominicana'], ['REU', 'RE', 'Reunión'], ['RWA', 'RW', 'Ruanda'], ['ROU', 'RO', 'Rumania'],
  ['RUS', 'RU', 'Rusia'], ['ESH', 'EH', 'Sahara Occidental'], ['WSM', 'WS', 'Samoa'], ['ASM', 'AS', 'Samoa Americana'],
  ['KNA', 'KN', 'San Cristóbal y Nieves'], ['SMR', 'SM', 'San Marino'], ['SPM', 'PM', 'San Pedro y Miquelón'],
  ['VCT', 'VC', 'San Vicente y las Granadinas'], ['SHN', 'SH', 'Santa Helena'], ['LCA', 'LC', 'Santa Lucía'],
  ['STP', 'ST', 'Santo Tomé y Príncipe'], ['SEN', 'SN', 'Senegal'], ['SRB', 'RS', 'Serbia'], ['SYC', 'SC', 'Seychelles'],
  ['SLE', 'SL', 'Sierra Leona'], ['SGP', 'SG', 'Singapur'], ['SYR', 'SY', 'Siria'], ['SOM', 'SO', 'Somalia'],
  ['LKA', 'LK', 'Sri Lanka'], ['SWZ', 'SZ', 'Suazilandia'], ['ZAF', 'ZA', 'Sudáfrica'], ['SDN', 'SD', 'Sudán'],
  ['SWE', 'SE', 'Suecia'], ['CHE', 'CH', 'Suiza'], ['SUR', 'SR', 'Surinam'], ['SJM', 'SJ', 'Svalbard y Jan Mayen'],
  ['THA', 'TH', 'Tailandia'], ['TWN', 'TW', 'Taiwán'], ['TZA', 'TZ', 'Tanzania'], ['TJK', 'TJ', 'Tayikistán'],
  ['IOT', 'IO', 'Territorio Británico del Océano Índico'], ['ATF', 'TF', 'Territorios Australes Franceses'],
  ['TLS', 'TL', 'Timor Oriental'], ['TGO', 'TG', 'Togo'], ['TKL', 'TK', 'Tokelau'], ['TON', 'TO', 'Tonga'],
  ['TTO', 'TT', 'Trinidad y Tobago'], ['TUN', 'TN', 'Túnez'], ['TKM', 'TM', 'Turkmenistán'], ['TUR', 'TR', 'Turquía'],
  ['TUV', 'TV', 'Tuvalu'], ['UKR', 'UA', 'Ucrania'], ['UGA', 'UG', 'Uganda'], ['URY', 'UY', 'Uruguay'],
  ['UZB', 'UZ', 'Uzbekistán'], ['VUT', 'VU', 'Vanuatu'], ['VEN', 'VE', 'Venezuela'], ['VNM', 'VN', 'Vietnam'],
  ['WLF', 'WF', 'Wallis y Futuna'], ['YEM', 'YE', 'Yemen'], ['DJI', 'DJ', 'Yibuti'], ['ZMB', 'ZM', 'Zambia'],
  ['ZWE', 'ZW', 'Zimbabue']
];

// SRI Platform Config — Ficha Técnica v2.32, octubre 2025
const sriConfig = {
  // Versiones de schema
  facturaVersion: '1.0.0',
  notaCreditoVersion: '1.0.0',
  notaDebitoVersion: '1.0.0',
  comprobanteRetencionVersion: '1.0.0',

  // Endpoints WSDL (secciones 7.2 y 8.2)
  endpoints: {
    testing: {
      receptionUrl: 'https://celcer.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline?wsdl',
      authorizationUrl: 'https://celcer.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline?wsdl',
      consultaComprobanteUrl: 'https://celcer.sri.gob.ec/comprobantes-electronicos-ws/ConsultaComprobante?wsdl',
      consultaFacturaUrl: 'https://celcer.sri.gob.ec/comprobantes-electronicos-ws/ConsultaFactura?wsdl',
    },
    production: {
      receptionUrl: 'https://cel.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline?wsdl',
      authorizationUrl: 'https://cel.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline?wsdl',
      consultaComprobanteUrl: 'https://cel.sri.gob.ec/comprobantes-electronicos-ws/ConsultaComprobante?wsdl',
      consultaFacturaUrl: 'https://cel.sri.gob.ec/comprobantes-electronicos-ws/ConsultaFactura?wsdl',
    },
  },

  // Configuración general (TABLAS 2 y 4)
  emissionType: '1',
  environmentCodes: { testing: '1', production: '2' },
  consumidorFinalId: '9999999999999',
  consumidorFinalMaxAmountUsd: 50,

  // Tipos de comprobante (TABLA 3)
  documentTypeCodes: {
    invoice: '01',
    liquidacion: '03',
    creditNote: '04',
    debitNote: '05',
    remission: '06',
    retention: '07',
  },

  // Códigos tipo de impuesto para <codigo> en XML (TABLA 16)
  taxTypeCodes: { iva: '2', ice: '3', irbpnr: '5' },

  // Tarifas IVA para <codigoPorcentaje> en XML (TABLA 17)
  taxCodes: [
    { vatPct: 15, sriCode: '4', name: 'IVA 15%' },
    { vatPct: 5, sriCode: '5', name: 'IVA 5%' },
    { vatPct: 8, sriCode: '8', name: 'IVA diferenciado 8% (turismo)' },
    { vatPct: 0, sriCode: '0', name: 'IVA 0%' },
    { vatPct: 0, sriCode: '6', name: 'No objeto de IVA', isExempt: true },
    { vatPct: 0, sriCode: '7', name: 'Exento de IVA', isExempt: true },
  ],

  // Retención por tipo de impuesto (TABLA 19)
  retentionTaxCodes: [
    { taxName: 'RENTA', taxLabel: 'Impuesto a la Renta', code: '1' },
    { taxName: 'IVA', taxLabel: 'IVA', code: '2' },
    { taxName: 'ISD', taxLabel: 'Impuesto a la Salida Divisas', code: '6' },
  ],

  // Retención IVA — % → código (TABLA 20)
  ivaRetentionCodes: [
    { pct: 10, code: '9', description: 'Retención IVA 10%' },
    { pct: 20, code: '10', description: 'Retención IVA 20%' },
    { pct: 30, code: '1', description: 'Retención IVA 30%' },
    { pct: 50, code: '11', description: 'Retención IVA 50%' },
    { pct: 70, code: '2', description: 'Retención IVA 70%' },
    { pct: 100, code: '3', description: 'Retención IVA 100%' },
    { pct: 0, code: '7', description: 'Retención en cero (0%)' },
    { pct: 0, code: '8', description: 'No procede retención (0%)' },
  ],

  // Códigos ICE (TABLA 18) — tarifas vigentes feb-dic 2023 y posteriores
  iceCodes: [
    { code: '3011', description: 'Cigarrillos Rubios', especificaUsd: 0.16 },
    { code: '3021', description: 'Cigarrillos Negros', especificaUsd: 0.16 },
    { code: '3023', description: 'Tabaco y Sucedáneos (excl. cigarrillos)', adValoremPct: 150 },
    { code: '3031', description: 'Bebidas Alcohólicas', adValoremPct: 75, especificaUsd: 10.00 },
    { code: '3033', description: 'Alcohol', adValoremPct: 75, especificaUsd: 10.00 },
    { code: '3041', description: 'Cerveza Industrial Gran Escala', adValoremPct: 75 },
    { code: '3043', description: 'Cerveza Artesanal', especificaUsd: 1.50 },
    { code: '3053', description: 'Bebidas Gaseosas Alto Contenido Azúcar', especificaUsd: 0.18 },
    { code: '3054', description: 'Bebidas Gaseosas Bajo Contenido Azúcar', adValoremPct: 10 },
    { code: '3073', description: 'Vehículos Motorizados PVP ≤ USD 20.000', adValoremPct: 5 },
    { code: '3075', description: 'Vehículos Motorizados PVP USD 30.000–40.000', adValoremPct: 15 },
    { code: '3077', description: 'Vehículos Motorizados PVP USD 40.000–50.000', adValoremPct: 20 },
    { code: '3078', description: 'Vehículos Motorizados PVP USD 50.000–60.000', adValoremPct: 25 },
    { code: '3079', description: 'Vehículos Motorizados PVP USD 60.000–70.000', adValoremPct: 30 },
    { code: '3080', description: 'Vehículos Motorizados PVP > USD 70.000', adValoremPct: 35 },
    { code: '3081', description: 'Aviones, Tricares, Yates, Barcos de Recreo', adValoremPct: 10 },
    { code: '3084', description: 'Camionetas/Vehículos Rescate ≤ USD 30.000', adValoremPct: 5 },
    { code: '3086', description: 'Vehículos excl. camionetas USD 20.000–30.000', adValoremPct: 10 },
    { code: '3088', description: 'Vehículos Híbridos PVP ≤ USD 35.000', adValoremPct: 0 },
    { code: '3091', description: 'Vehículos Híbridos PVP USD 35.000–40.000', adValoremPct: 8 },
    { code: '3092', description: 'Servicios TV Prepagada', adValoremPct: 0 },
    { code: '3093', description: 'Servicios Telefonía Sociedades', adValoremPct: 15 },
    { code: '3101', description: 'Bebidas Energizantes', adValoremPct: 10 },
    { code: '3111', description: 'Bebidas No Alcohólicas', especificaUsd: 0.18 },
    { code: '3610', description: 'Perfumes y Aguas de Tocador', adValoremPct: 20 },
    { code: '3620', description: 'Videojuegos', adValoremPct: 0 },
    { code: '3630', description: 'Armas de Fuego, Deportivas y Municiones', adValoremPct: 300 },
    { code: '3640', description: 'Focos Incandescentes', adValoremPct: 100 },
    { code: '3660', description: 'Cuotas, Membresías, Afiliaciones, Acciones', adValoremPct: 35 },
    { code: '3671', description: 'Calefones y Sist. Calentamiento Agua a Gas', adValoremPct: 100 },
    { code: '3680', description: 'Fundas Plásticas', especificaUsd: 0.08 },
    { code: '3681', description: 'Servicios Telefonía Móvil Personas Naturales', adValoremPct: 0 },
    { code: '3682', description: 'Consumibles Tabaco Calentado y Líquidos Nicotina', adValoremPct: 150 },
  ],

  // Formas de pago (TABLA 24)
  paymentMethodCodes: [
    { code: '01', name: 'Sin utilización del sistema financiero' },
    { code: '15', name: 'Compensación de deudas' },
    { code: '16', name: 'Tarjeta de débito' },
    { code: '17', name: 'Dinero electrónico Ecuador' },
    { code: '18', name: 'Tarjeta prepago' },
    { code: '19', name: 'Tarjeta de crédito' },
    { code: '20', name: 'Otros con utilización del sistema financiero' },
    { code: '21', name: 'Endoso de títulos' },
  ],

  // Tipos de identificación (TABLA 6)
  identificationTypes: [
    { code: '04', name: 'RUC', isRuc: true },
    { code: '05', name: 'Cédula de Identidad', isCedula: true },
    { code: '06', name: 'Pasaporte' },
    { code: '07', name: 'Consumidor Final', isFinal: true },
    { code: '08', name: 'Identificación del Exterior' },
  ],

  updatedAt: new Date().toISOString(),
  updatedBy: 'seed',
};

async function seed() {
  const batch1 = db.batch();
  for (const c of currencies) {
    const ref = db.collection('platform/defaults/currencies').doc(c.code);
    batch1.set(ref, c);
  }
  await batch1.commit();
  console.log('✅ Currencies seeded successfully!');

  const batch2 = db.batch();
  for (const c of countriesRaw) {
    // c[0] = codpais (alpha3), c[1] = codiso (alpha2), c[2] = nombre
    const code3 = c[0];
    const code2 = c[1];
    const name = c[2];

    const countryData = {
      code3,
      code2,
      name,
      isActive: true
    };
    const ref = db.collection('platform/defaults/countries').doc(code2 || code3);
    batch2.set(ref, countryData);
  }
  await batch2.commit();
  console.log('✅ Countries seeded successfully!');

  await db.doc('platform/defaults/sriConfig/data').set(sriConfig);
  console.log('✅ SRI platform config seeded successfully!');
}

seed().catch(err => {
  console.error('❌ Error in seeding:', err);
  process.exit(1);
});
