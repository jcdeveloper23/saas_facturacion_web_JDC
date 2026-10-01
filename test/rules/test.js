// Pruebas de firestore.rules de FacturaEc contra el emulador.
// Ver test/rules/README.md para correrlas.
const { req, token, str, list, seed, create, patch, del, expectStatus, report, S } = require('./lib');

const bool = v => ({ booleanValue: v });
const num = v => ({ doubleValue: v });

(async () => {
  // ── datos ────────────────────────────────────────────────────────────────
  await seed('companies', 'c1', {
    name: str('Empresa uno'),
    channelId: str('conecta-app'),
    sri: { mapValue: { fields: {
      environment: str('testing'),
      certificatePath: str('companies/c1/certificates/signing.p12'),
      certificateThumbprint: str('AA:BB'),
    } } },
  });
  await seed('channels', 'conecta-app', { status: str('active') });
  await seed('channels', 'mi-buseta', { status: str('active') });
  await seed('companies/c1/establishments', '001', { code: str('001'), name: str('Matriz') });
  await seed('companies/c1/company-users', 'caja2', { platformRole: str('cashier'), emissionPoints: list(['002-001']) });
  await seed('companies/c1/company-users', 'vende2', { platformRole: str('seller'), emissionPoints: list(['002-001']) });
  await seed('companies/c1/company-users', 'libre', { platformRole: str('seller') });
  await seed('companies/c1/invoices', 'f001', {
    seriesEstablishment: str('001'), status: str('issued'), isPaid: bool(false), total: num(10) });
  await seed('companies/c1/invoices', 'anulada', { seriesEstablishment: str('001'), status: str('cancelled'), total: num(10) });
  await seed('companies/c1/retentions', 'autorizada', {
    seriesEstablishment: str('001'), status: str('issued'), sriStatus: str('authorized'), total: num(5) });
  await seed('companies/c1/stock-movements', 'm1', { qty: num(3) });
  await seed('companies/c1/configuration', 'sri', { razonSocial: str('EMPRESA UNO') });

  const admin     = token({ uid: 'adm', role: 'admin', companyId: 'c1' });
  const seller    = token({ uid: 'libre', role: 'seller', companyId: 'c1' });
  const cashier   = token({ uid: 'k1', role: 'cashier', companyId: 'c1' });
  const caja2     = token({ uid: 'caja2', role: 'cashier', companyId: 'c1' });
  const vende2    = token({ uid: 'vende2', role: 'seller', companyId: 'c1' });
  const sinPerfil = token({ uid: 'fantasma', role: 'seller', companyId: 'c1' });
  const conta     = token({ uid: 't1', role: 'accountant', companyId: 'c1' });
  const ajeno     = token({ uid: 'x1', role: 'admin', companyId: 'c2' });
  const superAdm  = token({ uid: 'sa', role: 'super_admin' });
  const canal     = token({ uid: 'ca', role: 'channel_admin', channelId: 'conecta-app' });
  const otroCanal = token({ uid: 'cb', role: 'channel_admin', channelId: 'mi-buseta' });

  const est = code => ({ code: str(code), name: str('Sucursal'), address: str('Av. Solano'), isActive: bool(true) });
  const inv = estab => ({ seriesEstablishment: str(estab), seriesEmissionPoint: str('001'), status: str('draft'), total: num(10) });
  const fiscal = estab => ({ seriesEstablishment: str(estab), seriesEmissionPoint: str('001'), status: str('draft'), companyId: str('c1') });

  // ── establecimientos ─────────────────────────────────────────────────────
  await expectStatus('admin crea la sucursal 002',
    await create('companies/c1/establishments', '002', admin, est('002')), S.OK);
  await expectStatus('seller NO crea establecimientos',
    await create('companies/c1/establishments', '003', seller, est('003')), S.DENIED);
  await expectStatus('cashier NO crea establecimientos',
    await create('companies/c1/establishments', '004', cashier, est('004')), S.DENIED);
  await expectStatus('el admin de otra empresa no crea en esta',
    await create('companies/c1/establishments', '005', ajeno, est('005')), S.DENIED);
  await expectStatus('el id tiene que ser el código',
    await create('companies/c1/establishments', '006', admin, est('007')), S.DENIED);
  await expectStatus('el código 000 no existe en el SRI',
    await create('companies/c1/establishments', '000', admin, est('000')), S.DENIED);
  await expectStatus('nadie borra un establecimiento, ni el admin',
    await del('companies/c1/establishments/001', admin), S.DENIED);
  await expectStatus('el contador los lee',
    await req('companies/c1/establishments/001', conta), S.OK);
  await expectStatus('otra empresa no los lee',
    await req('companies/c1/establishments/001', ajeno), S.DENIED);
  await expectStatus('el super admin crea la sucursal de cualquier empresa',
    await create('companies/c1/establishments', '010', superAdm, est('010')), S.OK);
  await expectStatus('el admin del canal de la empresa la crea',
    await create('companies/c1/establishments', '011', canal, est('011')), S.OK);
  await expectStatus('el admin de OTRO canal no la crea',
    await create('companies/c1/establishments', '012', otroCanal, est('012')), S.DENIED);
  await expectStatus('el admin de otro canal no los lee',
    await req('companies/c1/establishments/001', otroCanal), S.DENIED);
  await expectStatus('el super admin, la lista entera',
    await req('companies/c1/establishments', superAdm), S.OK);

  // ── punto de emisión de cada usuario (company-users.emissionPoints) ──────
  await expectStatus('cajero de la 002 factura desde la 002',
    await create('companies/c1/invoices', 'a1', caja2, inv('002')), S.OK);
  await expectStatus('cajero de la 002 NO factura desde la matriz 001',
    await create('companies/c1/invoices', 'a2', caja2, inv('001')), S.DENIED);
  await expectStatus('cajero del punto 002-001 NO factura desde el 002-002 (mismo establecimiento)',
    await create('companies/c1/invoices', 'a2b', caja2, { ...inv('002'), seriesEmissionPoint: str('002') }), S.DENIED);
  await expectStatus('cajero con punto asignado NO factura sin serie',
    await create('companies/c1/invoices', 'a2c', caja2, { status: str('draft'), total: num(10) }), S.DENIED);
  await expectStatus('seller SIN puntos asignados factura desde cualquiera',
    await create('companies/c1/invoices', 'a3', seller, inv('001')), S.OK);
  await expectStatus('usuario sin perfil de empresa (legado) factura desde cualquiera',
    await create('companies/c1/invoices', 'a4', sinPerfil, inv('001')), S.OK);
  await expectStatus('el admin factura desde cualquiera',
    await create('companies/c1/invoices', 'a5', admin, inv('003')), S.OK);
  await expectStatus('cajero de la 002 SÍ cobra una factura de la 001 (solo pago)',
    await patch('companies/c1/invoices/f001', caja2, { isPaid: bool(true), status: str('paid') }), S.OK);
  await expectStatus('cajero de la 002 NO edita una factura de la 001',
    await patch('companies/c1/invoices/f001', caja2, { total: num(99) }), S.DENIED);
  await expectStatus('seller de la 002 NO crea una retención de la 001',
    await create('companies/c1/retentions', 'r1', vende2, fiscal('001')), S.DENIED);
  await expectStatus('seller de la 002 sí crea una retención de la 002',
    await create('companies/c1/retentions', 'r2', vende2, fiscal('002')), S.OK);
  await expectStatus('seller de la 002 NO crea una nota de débito de la 001',
    await create('companies/c1/debitNotes', 'd1', vende2, fiscal('001')), S.DENIED);

  // ── protecciones que la regla por defecto anulaba ────────────────────────
  // Hasta el 2026-09-22 la regla por defecto las re-abría a seller y cashier.
  await expectStatus('cajero NO edita una factura anulada',
    await patch('companies/c1/invoices/anulada', cashier, { total: num(999) }), S.DENIED);
  await expectStatus('cajero NO anula (void) una factura: solo el admin',
    await patch('companies/c1/invoices/f001', cashier, { status: str('void') }), S.DENIED);
  await expectStatus('seller NO cambia el total de una retención autorizada por el SRI',
    await patch('companies/c1/retentions/autorizada', seller, { total: num(1) }), S.DENIED);
  await expectStatus('seller NO edita el kardex (inmutable)',
    await patch('companies/c1/stock-movements/m1', seller, { qty: num(300) }), S.DENIED);
  await expectStatus('cajero NO reescribe la configuración SRI',
    await patch('companies/c1/configuration/sri', cashier, { razonSocial: str('OTRA') }), S.DENIED);
  await expectStatus('seller NO crea almacenes',
    await create('companies/c1/warehouses', 'w1', seller, { name: str('Bodega') }), S.DENIED);
  await expectStatus('el admin sí reescribe la configuración SRI',
    await patch('companies/c1/configuration/sri', admin, { razonSocial: str('EMPRESA UNO S.A.') }), S.OK);

  // ── lo que la regla por defecto ya no da, pero las propias sí ────────────
  const lector = token({ uid: 'ro', role: 'read_only', companyId: 'c1' });
  await expectStatus('el contador cobra una factura (solo pago)',
    await patch('companies/c1/invoices/f001', conta, { isPaid: bool(true), status: str('paid') }), S.OK);
  await expectStatus('el contador NO edita el total de una factura',
    await patch('companies/c1/invoices/f001', conta, { total: num(1) }), S.DENIED);
  await expectStatus('el admin sí anula una factura',
    await patch('companies/c1/invoices/f001', admin, { status: str('void'), isVoid: bool(true) }), S.OK);
  await expectStatus('solo lectura lee facturas',
    await req('companies/c1/invoices/f001', lector), S.OK);
  await expectStatus('solo lectura NO crea facturas',
    await create('companies/c1/invoices', 'ro1', lector, inv('001')), S.DENIED);
  await expectStatus('seller lee almacenes',
    await req('companies/c1/warehouses', seller), S.OK);
  await expectStatus('seller lee el kardex',
    await req('companies/c1/stock-movements/m1', seller), S.OK);
  await expectStatus('otra empresa no lee el kardex',
    await req('companies/c1/stock-movements/m1', ajeno), S.DENIED);
  await expectStatus('una colección sin regla propia sigue abierta a quien escribe',
    await create('companies/c1/notas-libres', 'n1', seller, { texto: str('hola') }), S.OK);

  // Retenciones y notas de débito: se leen con su propia regla
  // (canReadFiscalDoc), que deja fuera al cajero y a solo lectura. Antes la
  // regla por defecto les daba lectura a todos los de la empresa.
  await expectStatus('el contador lee retenciones',
    await req('companies/c1/retentions/autorizada', conta), S.OK);
  await expectStatus('el cajero ya NO lee retenciones',
    await req('companies/c1/retentions/autorizada', cashier), S.DENIED);
  await expectStatus('solo lectura ya NO lee retenciones',
    await req('companies/c1/retentions/autorizada', lector), S.DENIED);

  // ── ajustes de la auditoría del uso real en el front (2026-09-22) ─────────
  await seed('companies/c1/invoices', 'anulada2', { seriesEstablishment: str('001'), status: str('void'), total: num(10) });
  await seed('companies/c1/purchases', 'p1', { status: str('received'), isPaid: bool(false), updatedBy: str('adm') });
  const emitida = { seriesEstablishment: str('001'), status: str('issued') };
  await expectStatus('el admin emite una retención directo, sin companyId (como el formulario)',
    await create('companies/c1/retentions', 'r3', admin, emitida), S.OK);
  await expectStatus('el admin crea una nota de débito en borrador sin companyId',
    await create('companies/c1/debitNotes', 'd2', admin, { seriesEstablishment: str('001'), status: str('draft') }), S.OK);
  await expectStatus('una retención con el companyId de otra empresa, no',
    await create('companies/c1/retentions', 'r4', admin, { ...emitida, companyId: str('c2') }), S.DENIED);
  await expectStatus('una retención nace en borrador o emitida, no autorizada',
    await create('companies/c1/retentions', 'r5', admin, { seriesEstablishment: str('001'), status: str('authorized') }), S.DENIED);
  await expectStatus('seller marca pagada una compra recibida (con updatedBy)',
    await patch('companies/c1/purchases/p1', seller, { isPaid: bool(true), status: str('paid'), updatedBy: str('libre') }), S.OK);
  await expectStatus('cajero de la 002 cobra una factura de la 001 con updatedBy',
    await patch('companies/c1/invoices/a3', caja2, { isPaid: bool(true), status: str('paid'), updatedBy: str('caja2') }), S.OK);
  await expectStatus('seller crea un proyecto',
    await create('companies/c1/tm-projects', 'pr1', seller, { name: str('Obra'), status: str('planning') }), S.OK);
  await expectStatus('cajero NO crea proyectos',
    await create('companies/c1/tm-projects', 'pr2', cashier, { name: str('Obra'), status: str('planning') }), S.DENIED);
  await expectStatus('seller crea un miembro del equipo',
    await create('companies/c1/tm-members', 'mb1', seller, { name: str('Ana') }), S.OK);
  await expectStatus('seller NO des-anula una factura',
    await patch('companies/c1/invoices/anulada2', seller, { status: str('issued') }), S.DENIED);
  await expectStatus('cajero NO cobra una factura anulada',
    await patch('companies/c1/invoices/anulada2', cashier, { isPaid: bool(true), status: str('paid') }), S.DENIED);

  // ── los puntos asignados solo los cambia el admin ────────────────────────
  await expectStatus('el cajero NO vacía sus propios puntos de emisión',
    await patch('companies/c1/company-users/caja2', caja2, { emissionPoints: list([]) }), S.DENIED);
  await expectStatus('el cajero NO se cambia el punto por defecto',
    await patch('companies/c1/company-users/caja2', caja2, { defaultEmissionPoint: str('001-001') }), S.DENIED);
  await expectStatus('el cajero sí edita otros datos de su perfil',
    await patch('companies/c1/company-users/caja2', caja2, { displayName: str('Caja dos') }), S.OK);
  await expectStatus('el admin asigna puntos de emisión',
    await patch('companies/c1/company-users/vende2', admin, { emissionPoints: list(['001-001', '002-001']) }), S.OK);

  // ── certificado de firma ─────────────────────────────────────────────────
  // La contraseña ya no vive en Firestore (Secret Manager, 2026-09-23) y los
  // datos del certificado los escribe solo uploadCertificate.
  const sriCon = extra => ({ mapValue: { fields: {
    environment: str('testing'),
    certificatePath: str('companies/c1/certificates/signing.p12'),
    certificateThumbprint: str('AA:BB'),
    ...extra,
  } } });

  await expectStatus('el admin cambia su configuración SRI',
    await patch('companies/c1', admin, { sri: sriCon({ environment: str('production') }) }), S.OK);
  await expectStatus('el admin NO guarda la contraseña del certificado',
    await patch('companies/c1', admin,
      { sri: sriCon({ certificatePassword: str('1234') }) }), S.DENIED);
  await expectStatus('el admin NO cambia la huella del certificado',
    await patch('companies/c1', admin,
      { sri: sriCon({ certificateThumbprint: str('CC:DD') }) }), S.DENIED);
  await expectStatus('el admin NO cambia la ruta del .p12',
    await patch('companies/c1', admin, { sri: sriCon({ certificatePath: str('otra/ruta.p12') }) }), S.DENIED);
  await expectStatus('un cajero no toca la configuración de la empresa',
    await patch('companies/c1', cashier, { sri: sriCon({}) }), S.DENIED);

  // ── el correo propio de la empresa ───────────────────────────────────────
  await seed('companies/c1/configuration', 'smtp', {
    host: str('smtp.gmail.com'), user: str('empresa@correo.com'), isActive: bool(true),
  });
  await seed('companies/c1/configuration', 'sri', { razonSocial: str('ACME') });

  await expectStatus('el admin ve el correo de su empresa',
    await req('companies/c1/configuration/smtp', admin), S.OK);
  await expectStatus('el cajero NO ve el correo de la empresa',
    await req('companies/c1/configuration/smtp', cashier), S.DENIED);
  await expectStatus('ni el admin lo escribe: lo hace el servidor',
    await patch('companies/c1/configuration/smtp', admin, { host: str('otro') }), S.DENIED);
  await expectStatus('el resto de configuration se sigue leyendo',
    await req('companies/c1/configuration/sri', cashier), S.OK);

  // ── la contraseña del correo saliente ────────────────────────────────────
  // Vive en claro en platform/defaults/smtpConfig/data. La regla general de
  // `defaults` dejaba leerla a cualquiera con sesión iniciada: un cajero, o un
  // miembro de un grupo de Conecta. Las reglas se suman, así que la exclusión
  // tiene que estar en la general, no solo en una regla estricta aparte.
  await seed('platform/defaults/smtpConfig', 'data', {
    host: str('smtp.gmail.com'), user: str('correo@empresa.com'), pass: str('secreto'),
  });
  await seed('platform/defaults/taxRates', 'iva15', { code: str('VAT15'), rate: num(15) });

  await expectStatus('el super admin lee la config SMTP',
    await req('platform/defaults/smtpConfig/data', superAdm), S.OK);
  await expectStatus('un cajero NO lee la contraseña del correo',
    await req('platform/defaults/smtpConfig/data', cashier), S.DENIED);
  await expectStatus('un admin de empresa NO lee la contraseña del correo',
    await req('platform/defaults/smtpConfig/data', admin), S.DENIED);
  await expectStatus('el administrador del canal NO lee la contraseña del correo',
    await req('platform/defaults/smtpConfig/data', canal), S.DENIED);
  await expectStatus('un cajero NO la reescribe',
    await patch('platform/defaults/smtpConfig/data', cashier, { pass: str('otro') }), S.DENIED);
  await expectStatus('ni el super admin escribe el correo de plataforma desde el navegador (va por savePlatformSmtp)',
    await patch('platform/defaults/smtpConfig/data', superAdm, { pass: str('en-claro') }), S.DENIED);
  await expectStatus('lo demás de defaults se sigue leyendo',
    await req('platform/defaults/taxRates/iva15', cashier), S.OK);

  // ── estado del SRI: solo lo pone el servidor (2026-09-30) ────────────────
  // La importación desde XML pasa a la callable importInvoices; desde el
  // cliente ya no se crea ni se marca una factura «autorizada por el SRI».
  await seed('companies/c1/invoices', 'pend', {
    seriesEstablishment: str('001'), seriesEmissionPoint: str('001'),
    status: str('issued'), sriStatus: str('rejected'), sriError: str('ERROR'), total: num(10) });
  await seed('companies/c1/invoices', 'pend2', {
    seriesEstablishment: str('001'), seriesEmissionPoint: str('001'),
    status: str('issued'), sriStatus: str('pending'), total: num(10) });
  await seed('companies/c1/invoices', 'aut', {
    seriesEstablishment: str('001'), seriesEmissionPoint: str('001'), status: str('issued'),
    isPaid: bool(false), sriStatus: str('authorized'), authorizationNumber: str('2409202601'), total: num(10) });
  await seed('companies/c1/imported-xml', 'clave1', { xml: str('<factura/>') });
  // Borra un campo: updateMask con el campo y sin valor (FieldValue.delete()).
  const borrar = (path, auth, campos) =>
    req(`${path}?${campos.map(k => `updateMask.fieldPaths=${k}`).join('&')}`, auth,
      { method: 'PATCH', body: JSON.stringify({ fields: {} }) });
  const nulo = { nullValue: null };

  await expectStatus('seller crea una factura sin sriStatus',
    await create('companies/c1/invoices', 's1', seller, { ...inv('001'), status: str('issued') }), S.OK);
  await expectStatus('seller crea una factura con sriStatus null (cleanDoc de la web)',
    await create('companies/c1/invoices', 's1b', seller, { ...inv('001'), sriStatus: nulo }), S.OK);
  await expectStatus('seller crea una factura con sriStatus not_required (empresa sin SRI)',
    await create('companies/c1/invoices', 's2', seller, { ...inv('001'), status: str('issued'), sriStatus: str('not_required') }), S.OK);
  await expectStatus('la NC de Conecta (emitida, sin sriStatus) se sigue creando',
    await create('companies/c1/invoices', 's2b', admin, { ...inv('001'), status: str('issued'),
      documentType: str('creditNote'), isCreditNote: bool(true), rectifiedInvoiceAuthNumber: str('2409202601'),
      source: str('conecta') }), S.OK);
  await expectStatus('cajero NO crea una factura ya autorizada',
    await create('companies/c1/invoices', 's3', cashier, { ...inv('001'), status: str('issued'), sriStatus: str('authorized') }), S.DENIED);
  await expectStatus('admin NO crea una factura ya autorizada',
    await create('companies/c1/invoices', 's4', admin, { ...inv('001'), status: str('issued'), sriStatus: str('authorized') }), S.DENIED);
  await expectStatus('admin NO crea una factura con sriStatus pending',
    await create('companies/c1/invoices', 's4b', admin, { ...inv('001'), sriStatus: str('pending') }), S.DENIED);
  await expectStatus('admin NO crea una factura imported: true',
    await create('companies/c1/invoices', 's5', admin, { ...inv('001'), imported: bool(true) }), S.DENIED);
  await expectStatus('admin NO crea una factura con authorizationNumber',
    await create('companies/c1/invoices', 's6', admin, { ...inv('001'), authorizationNumber: str('123') }), S.DENIED);
  await expectStatus('admin NO crea una factura con importedXmlId aunque sea null',
    await create('companies/c1/invoices', 's7', admin, { ...inv('001'), importedXmlId: nulo }), S.DENIED);

  await expectStatus('seller reintenta una rechazada borrando sriStatus (Conecta)',
    await borrar('companies/c1/invoices/pend', seller, ['sriStatus', 'sriError', 'updatedAt']), S.OK);
  await expectStatus('seller reintenta una pending poniendo sriStatus null (web)',
    await patch('companies/c1/invoices/pend2', seller, { sriStatus: nulo, updatedBy: str('libre') }), S.OK);
  await expectStatus('admin NO le quita el sriStatus a una autorizada',
    await borrar('companies/c1/invoices/aut', admin, ['sriStatus']), S.DENIED);
  await expectStatus('admin NO pasa una autorizada a not_required',
    await patch('companies/c1/invoices/aut', admin, { sriStatus: str('not_required') }), S.DENIED);
  await expectStatus('admin NO marca autorizada una factura',
    await patch('companies/c1/invoices/pend2', admin, { sriStatus: str('authorized') }), S.DENIED);
  await expectStatus('seller NO marca autorizada una not_required',
    await patch('companies/c1/invoices/s2', seller, { sriStatus: str('authorized') }), S.DENIED);
  await expectStatus('admin NO cambia el authorizationNumber',
    await patch('companies/c1/invoices/aut', admin, { authorizationNumber: str('999') }), S.DENIED);
  await expectStatus('admin NO le pone authorizationNumber a una que no lo tenía',
    await patch('companies/c1/invoices/s1', admin, { authorizationNumber: str('999') }), S.DENIED);
  await expectStatus('admin NO marca imported una factura existente',
    await patch('companies/c1/invoices/s1', admin, { imported: bool(true) }), S.DENIED);
  await expectStatus('cajero cobra una factura autorizada (solo pago)',
    await patch('companies/c1/invoices/aut', cashier, { isPaid: bool(true), status: str('paid'), updatedBy: str('k1') }), S.OK);
  await expectStatus('el admin anula una factura autorizada',
    await patch('companies/c1/invoices/aut', admin, { status: str('void'), isVoid: bool(true), updatedBy: str('adm') }), S.OK);

  // ── una factura autorizada no se edita (1.5, 2026-09-30) ──────────────────
  const autorizada = {
    seriesEstablishment: str('001'), seriesEmissionPoint: str('001'), status: str('issued'),
    isPaid: bool(false), sriStatus: str('authorized'), authorizationNumber: str('2409202601'),
    total: num(10), customerName: str('CLIENTE'), notes: str(''),
  };
  for (const id of ['g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7', 'g8']) await seed('companies/c1/invoices', id, autorizada);
  await seed('companies/c1/invoices', 'libreEd', { ...autorizada, sriStatus: str('rejected') });

  await expectStatus('seller NO cambia el total de una autorizada',
    await patch('companies/c1/invoices/g1', seller, { total: num(1) }), S.DENIED);
  await expectStatus('cajero NO cambia el total de una autorizada',
    await patch('companies/c1/invoices/g1', cashier, { total: num(1) }), S.DENIED);
  await expectStatus('admin NO cambia las líneas de una autorizada',
    await patch('companies/c1/invoices/g1', admin, { lines: list(['x']) }), S.DENIED);
  await expectStatus('admin NO cambia el cliente de una autorizada',
    await patch('companies/c1/invoices/g1', admin, { customerName: str('OTRO') }), S.DENIED);
  await expectStatus('admin NO devuelve a borrador una autorizada',
    await patch('companies/c1/invoices/g1', admin, { status: str('draft') }), S.DENIED);
  await expectStatus('seller edita las notas de una autorizada',
    await patch('companies/c1/invoices/g2', seller, { notes: str('entregada'), updatedBy: str('libre') }), S.OK);
  await expectStatus('admin guarda pdfUrl de una autorizada',
    await patch('companies/c1/invoices/g3', admin, { pdfUrl: str('https://x/y.pdf') }), S.OK);
  await expectStatus('contador cobra una autorizada con banco (markPaid)',
    await patch('companies/c1/invoices/g4', conta, { status: str('paid'), isPaid: bool(true),
      paidAt: str('2026-09-30'), paymentBankAccountId: str('b1') }), S.OK);
  await expectStatus('admin aplica un anticipo a una autorizada',
    await patch('companies/c1/invoices/g5', admin, { status: str('paid'), isPaid: bool(true),
      paidAt: str('2026-09-30'), paymentEntryId: str('e1'), updatedAt: str('ahora') }), S.OK);
  await expectStatus('admin anula una autorizada como Conectate (voidedAt, updatedBy)',
    await patch('companies/c1/invoices/g6', admin, { status: str('void'), isVoid: bool(true),
      voidedAt: str('ahora'), updatedBy: str('adm'), updatedAt: str('ahora') }), S.OK);
  await expectStatus('admin devuelve a emitida una autorizada anulada (markIssued)',
    await patch('companies/c1/invoices/g6', admin, { status: str('issued'), isVoid: bool(false), isPaid: bool(false) }), S.OK);
  await expectStatus('seller NO anula una autorizada',
    await patch('companies/c1/invoices/g7', seller, { status: str('void'), isVoid: bool(true) }), S.DENIED);
  await expectStatus('cajero NO cobra y cambia el total a la vez',
    await patch('companies/c1/invoices/g8', cashier, { status: str('paid'), isPaid: bool(true), total: num(1) }), S.DENIED);
  await expectStatus('una rechazada (no autorizada) sí se edita',
    await patch('companies/c1/invoices/libreEd', seller, { total: num(12) }), S.OK);

  await expectStatus('un cajero de la empresa lee el XML importado',
    await req('companies/c1/imported-xml/clave1', cashier), S.OK);
  await expectStatus('otra empresa NO lee el XML importado',
    await req('companies/c1/imported-xml/clave1', ajeno), S.DENIED);
  await expectStatus('ni el admin crea un XML importado',
    await create('companies/c1/imported-xml', 'clave2', admin, { xml: str('<factura/>') }), S.DENIED);
  await expectStatus('ni el admin reescribe un XML importado',
    await patch('companies/c1/imported-xml/clave1', admin, { xml: str('<otra/>') }), S.DENIED);
  await expectStatus('ni el admin borra un XML importado',
    await del('companies/c1/imported-xml/clave1', admin), S.DENIED);

  // ── base contable (3.1, 2026-09-30) ────────────────────────────────────
  await expectStatus('el contador crea una cuenta del plan',
    await create('companies/c1/chart_of_accounts', '9_9', conta, { code: str('9.9'), name: str('X') }), S.OK);
  await expectStatus('un vendedor NO crea cuentas',
    await create('companies/c1/chart_of_accounts', '9_8', seller, { code: str('9.8'), name: str('X') }), S.DENIED);
  await expectStatus('el contador abre un ejercicio',
    await create('companies/c1/accounting_periods', 'y2026', conta, { year: num(2026), status: str('open') }), S.OK);
  await expectStatus('un cajero NO abre ejercicios',
    await create('companies/c1/accounting_periods', 'y2027', cashier, { year: num(2027), status: str('open') }), S.DENIED);
  await expectStatus('el contador guarda las cuentas de los asientos',
    await create('companies/c1/settings', 'accounting', conta, { updatedBy: str('t1') }), S.OK);
  await expectStatus('un vendedor NO reescribe las cuentas de los asientos',
    await patch('companies/c1/settings/accounting', seller, { updatedBy: str('libre') }), S.DENIED);
  await expectStatus('un cajero NO reescribe las cuentas de los asientos',
    await patch('companies/c1/settings/accounting', cashier, { updatedBy: str('k1') }), S.DENIED);
  await expectStatus('el admin guarda las cuentas de los asientos',
    await patch('companies/c1/settings/accounting', admin, { updatedBy: str('adm') }), S.OK);
  await expectStatus('cualquiera de la empresa lee la configuración',
    await req('companies/c1/settings/accounting', cashier), S.OK);
  await expectStatus('otra empresa NO la lee',
    await req('companies/c1/settings/accounting', ajeno), S.DENIED);
  await expectStatus('el contador NO escribe otra configuración que no sea la contable',
    await create('companies/c1/settings', 'otra', conta, { x: str('1') }), S.DENIED);

  // ── artículos: el cajero solo los ve (2026-10-01) ─────────────────────────
  await seed('companies/c1/products', 'p1', { sku: str('A-1'), name: str('Gorra'), price: num(10) });
  await expectStatus('el cajero ve los artículos',
    await req('companies/c1/products/p1', cashier), S.OK);
  await expectStatus('el cajero NO crea artículos',
    await create('companies/c1/products', 'p2', cashier, { sku: str('A-2'), name: str('X') }), S.DENIED);
  await expectStatus('el cajero NO cambia el precio de un artículo',
    await patch('companies/c1/products/p1', cashier, { price: num(1) }), S.DENIED);
  await expectStatus('el vendedor crea artículos',
    await create('companies/c1/products', 'p3', seller, { sku: str('A-3'), name: str('Y') }), S.OK);
  await expectStatus('el vendedor edita artículos',
    await patch('companies/c1/products/p1', seller, { price: num(11) }), S.OK);
  await expectStatus('el admin crea artículos',
    await create('companies/c1/products', 'p4', admin, { sku: str('A-4'), name: str('Z') }), S.OK);
  await expectStatus('el contador NO crea artículos (no tiene products.create)',
    await create('companies/c1/products', 'p5', conta, { sku: str('A-5'), name: str('W') }), S.DENIED);

  report();
})();
