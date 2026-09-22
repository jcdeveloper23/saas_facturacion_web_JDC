// Pruebas de firestore.rules de FacturaEc contra el emulador.
// Ver test/rules/README.md para correrlas.
const { req, token, str, list, seed, create, patch, del, expectStatus, report, S } = require('./lib');

const bool = v => ({ booleanValue: v });
const num = v => ({ doubleValue: v });

(async () => {
  // ── datos ────────────────────────────────────────────────────────────────
  await seed('companies', 'c1', { name: str('Empresa uno'), channelId: str('conecta-app') });
  await seed('channels', 'conecta-app', { status: str('active') });
  await seed('channels', 'mi-buseta', { status: str('active') });
  await seed('companies/c1/establishments', '001', { code: str('001'), name: str('Matriz') });
  await seed('companies/c1/company-users', 'caja2', { platformRole: str('cashier'), establishments: list(['002']) });
  await seed('companies/c1/company-users', 'vende2', { platformRole: str('seller'), establishments: list(['002']) });
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
  const fiscal = estab => ({ seriesEstablishment: str(estab), status: str('draft'), companyId: str('c1') });

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

  // ── establecimiento de cada usuario ──────────────────────────────────────
  await expectStatus('cajero de la 002 factura desde la 002',
    await create('companies/c1/invoices', 'a1', caja2, inv('002')), S.OK);
  await expectStatus('cajero de la 002 NO factura desde la matriz 001',
    await create('companies/c1/invoices', 'a2', caja2, inv('001')), S.DENIED);
  await expectStatus('seller SIN establecimientos asignados factura desde cualquiera',
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

  report();
})();
