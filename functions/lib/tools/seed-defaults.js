"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const admin = require("firebase-admin");
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
}
seed().catch(err => {
    console.error('❌ Error in seeding:', err);
    process.exit(1);
});
//# sourceMappingURL=seed-defaults.js.map