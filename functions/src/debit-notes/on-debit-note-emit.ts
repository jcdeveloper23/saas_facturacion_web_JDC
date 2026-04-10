import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import * as forge from 'node-forge';
import { getStorage } from 'firebase-admin/storage';
import axios from 'axios';

import { generateDebitNoteXmlInternal }  from './generate-debit-note-xml';
import { generateDebitNotePdfInternal }  from './generate-debit-note-pdf';
import { sendDebitNoteEmailInternal }    from './send-debit-note-email';

// ─── SRI defaults ─────────────────────────────────────────────────────────────

const SRI_DEFAULTS = {
  testing: {
    receptionUrl:    'https://celcer.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline?wsdl',
    authorizationUrl:'https://celcer.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline?wsdl',
  },
  production: {
    receptionUrl:    'https://cel.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline?wsdl',
    authorizationUrl:'https://cel.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline?wsdl',
  },
};

// ─── Sign debit note XML ──────────────────────────────────────────────────────

async function signDebitNoteXml(debitNoteId: string, companyId: string): Promise<void> {
  const db     = admin.firestore();
  const bucket = getStorage().bucket();
  const now    = admin.firestore.Timestamp.now();

  const xmlPath = `companies/${companyId}/xml/dn-${debitNoteId}.xml`;
  let xmlBuffer: Buffer;
  try {
    [xmlBuffer] = await bucket.file(xmlPath).download();
  } catch {
    throw new Error('XML de nota de débito no encontrado en Storage.');
  }
  const xmlContent = xmlBuffer.toString('utf8');

  const certPath = `companies/${companyId}/certificates/signing.p12`;
  let certBuffer: Buffer;
  try {
    [certBuffer] = await bucket.file(certPath).download();
  } catch {
    throw new Error('Certificado .p12 no encontrado en Storage.');
  }

  let certificate: forge.pki.Certificate;
  let privateKey:  forge.pki.rsa.PrivateKey;
  try {
    const p12Asn1  = forge.asn1.fromDer(certBuffer.toString('binary'));
    const p12      = forge.pkcs12.pkcs12FromAsn1(p12Asn1, '');
    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
    const keyBags  = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
    certificate = (certBags[forge.pki.oids.certBag]?.[0]?.cert) as forge.pki.Certificate;
    privateKey  = (keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0]?.key) as forge.pki.rsa.PrivateKey;
  } catch {
    throw new Error('No se pudo leer el certificado .p12.');
  }

  const xmlStripped = xmlContent.replace(/<\?xml[^?]*\?>\s*/i, '').trim();
  const certDer     = forge.util.encode64(forge.asn1.toDer(forge.pki.certificateToAsn1(certificate)).bytes());
  const signingTime = new Date().toISOString();

  function sha1b64(data: string): string {
    const md = forge.md.sha1.create();
    md.update(forge.util.encodeUtf8(data));
    return forge.util.encode64(md.digest().bytes());
  }

  const spId  = 'dn-signed-props';
  const kiId  = 'dn-key-info';
  const spXml = `<xades:SignedProperties xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" Id="${spId}"><xades:SignedSignatureProperties><xades:SigningTime>${signingTime}</xades:SigningTime><xades:SigningCertificate><xades:Cert><xades:CertDigest><ds:DigestMethod xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/><ds:DigestValue xmlns:ds="http://www.w3.org/2000/09/xmldsig#">${sha1b64(certDer)}</ds:DigestValue></xades:CertDigest></xades:Cert></xades:SigningCertificate></xades:SignedSignatureProperties></xades:SignedProperties>`;
  const kiXml = `<ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Id="${kiId}"><ds:X509Data><ds:X509Certificate>${certDer}</ds:X509Certificate></ds:X509Data></ds:KeyInfo>`;
  const siXml = `<ds:SignedInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/><ds:SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/><ds:Reference URI="#comprobante"><ds:Transforms><ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/></ds:Transforms><ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/><ds:DigestValue>${sha1b64(xmlStripped)}</ds:DigestValue></ds:Reference><ds:Reference URI="#${kiId}"><ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/><ds:DigestValue>${sha1b64(kiXml)}</ds:DigestValue></ds:Reference><ds:Reference Type="http://uri.etsi.org/01903#SignedProperties" URI="#${spId}"><ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/><ds:DigestValue>${sha1b64(spXml)}</ds:DigestValue></ds:Reference></ds:SignedInfo>`;

  const md = forge.md.sha1.create();
  md.update(forge.util.encodeUtf8(siXml));
  const sigVal = forge.util.encode64((privateKey as any).sign(md));

  const sigBlock = `<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Id="dn-signature">${siXml}<ds:SignatureValue>${sigVal}</ds:SignatureValue>${kiXml}<ds:Object><xades:QualifyingProperties xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" Target="dn-signature">${spXml}</xades:QualifyingProperties></ds:Object></ds:Signature>`;

  const closingMatch = xmlStripped.match(/<\/(\w+)>\s*$/);
  const closingTag   = closingMatch ? closingMatch[0] : '';
  const signedXml    = `<?xml version="1.0" encoding="UTF-8"?>\n` +
    xmlStripped.slice(0, xmlStripped.length - closingTag.length) + sigBlock + closingTag;

  const signedPath = `companies/${companyId}/xml/dn-${debitNoteId}-signed.xml`;
  await bucket.file(signedPath).save(Buffer.from(signedXml, 'utf8'), {
    metadata: { contentType: 'application/xml' },
  });
  const [url] = await bucket.file(signedPath).getSignedUrl({
    action: 'read', expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
  });
  await db.doc(`companies/${companyId}/debitNotes/${debitNoteId}`).update({
    xmlUrl: url, sriStatus: 'signed', updatedAt: now,
  });
}

// ─── Send to SRI ──────────────────────────────────────────────────────────────

async function sendDebitNoteToSri(debitNoteId: string, companyId: string): Promise<{ sriStatus: string }> {
  const db     = admin.firestore();
  const bucket = getStorage().bucket();
  const now    = admin.firestore.Timestamp.now();

  const dnSnap = await db.doc(`companies/${companyId}/debitNotes/${debitNoteId}`).get();
  if (!dnSnap.exists) throw new Error(`Nota de débito no encontrada: ${debitNoteId}`);
  const accessKey: string = (dnSnap.data() as any)['accessKey'];
  if (!accessKey) throw new Error('Nota sin clave de acceso.');

  const companySnap = await db.doc(`companies/${companyId}`).get();
  const environment: 'testing' | 'production' = (companySnap.data() as any)?.['sri']?.['environment'] ?? 'testing';
  const platformSnap = await db.doc('platform/defaults/sriConfig/data').get();
  const platformData = platformSnap.exists ? (platformSnap.data() as any) : null;
  const endpoints    = platformData?.endpoints?.[environment] ?? SRI_DEFAULTS[environment];

  const signedPath = `companies/${companyId}/xml/dn-${debitNoteId}-signed.xml`;
  let buf: Buffer;
  try { [buf] = await bucket.file(signedPath).download(); }
  catch { throw new Error('XML firmado de nota de débito no encontrado.'); }
  const xmlBase64 = buf.toString('base64');

  // Reception
  const recUrl  = endpoints.receptionUrl.replace('?wsdl', '');
  const recSoap = `<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><ns2:validarComprobante xmlns:ns2="http://ec.gob.sri.ws.recepcion"><xml>${xmlBase64}</xml></ns2:validarComprobante></soap:Body></soap:Envelope>`;
  const recRes  = await axios.post(recUrl, recSoap, {
    headers: { 'Content-Type': 'text/xml;charset=UTF-8', 'SOAPAction': '' }, timeout: 30000,
  });
  const recStr = String(recRes.data);
  if (recStr.includes('DEVUELTA')) {
    const msg = recStr.match(/<mensaje>(.*?)<\/mensaje>/g)?.map(m => m.replace(/<\/?mensaje>/g, '')).join('; ') ?? 'Devuelta por SRI';
    await db.doc(`companies/${companyId}/debitNotes/${debitNoteId}`).update({
      sriStatus: 'rejected', sriError: msg, updatedAt: now,
    });
    return { sriStatus: 'rejected' };
  }

  // Authorization
  const authUrl  = endpoints.authorizationUrl.replace('?wsdl', '');
  const authSoap = `<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><ns2:autorizacionComprobante xmlns:ns2="http://ec.gob.sri.ws.autorizacion"><claveAccesoComprobante>${accessKey}</claveAccesoComprobante></ns2:autorizacionComprobante></soap:Body></soap:Envelope>`;
  const authRes  = await axios.post(authUrl, authSoap, {
    headers: { 'Content-Type': 'text/xml;charset=UTF-8', 'SOAPAction': '' }, timeout: 30000,
  });
  const authStr  = String(authRes.data);
  const estado   = (authStr.match(/<estado>(.*?)<\/estado>/)?.[1] ?? '').toUpperCase();

  if (estado === 'AUTORIZADO') {
    const authNum  = authStr.match(/<numeroAutorizacion>(.*?)<\/numeroAutorizacion>/)?.[1] ?? '';
    const authDate = authStr.match(/<fechaAutorizacion>(.*?)<\/fechaAutorizacion>/)?.[1];
    await db.doc(`companies/${companyId}/debitNotes/${debitNoteId}`).update({
      sriStatus: 'authorized', authorizationNumber: authNum,
      authorizedAt: admin.firestore.Timestamp.fromDate(authDate ? new Date(authDate) : new Date()),
      sriError: null, updatedAt: now,
    });
    return { sriStatus: 'authorized' };
  }

  const sriMsg = authStr.match(/<mensaje>(.*?)<\/mensaje>/)?.[1] ?? `Estado: ${estado}`;
  await db.doc(`companies/${companyId}/debitNotes/${debitNoteId}`).update({
    sriStatus: 'rejected', sriError: sriMsg, updatedAt: now,
  });
  return { sriStatus: 'rejected' };
}

// ─── Trigger ──────────────────────────────────────────────────────────────────

export const onDebitNoteEmit = onDocumentUpdated(
  'companies/{companyId}/debitNotes/{debitNoteId}',
  async (event) => {
    const before = event.data?.before.data() as Record<string, any> | undefined;
    const after  = event.data?.after.data()  as Record<string, any> | undefined;
    if (!before || !after) return;

    const statusChangedToIssued = before['status'] !== 'issued' && after['status'] === 'issued';
    const sriNotYetStarted      = !after['sriStatus'];
    if (!statusChangedToIssued || !sriNotYetStarted) return;

    const { companyId, debitNoteId } = event.params;
    const db = admin.firestore();
    console.log('[onDebitNoteEmit] Nueva emisión:', { companyId, debitNoteId });

    try {
      await db.doc(`companies/${companyId}/debitNotes/${debitNoteId}`).update({
        sriStatus: 'pending', updatedAt: admin.firestore.Timestamp.now(),
      });
    } catch (err) {
      console.error('[onDebitNoteEmit] Error marcando pending:', err); return;
    }

    try {
      console.log('[onDebitNoteEmit] Paso 1/3 — XML...');
      await generateDebitNoteXmlInternal(debitNoteId, companyId);

      console.log('[onDebitNoteEmit] Paso 2/3 — Firma...');
      await signDebitNoteXml(debitNoteId, companyId);

      console.log('[onDebitNoteEmit] Paso 3/3 — SRI...');
      const result = await sendDebitNoteToSri(debitNoteId, companyId);
      console.log('[onDebitNoteEmit] Completado. sriStatus:', result.sriStatus);

      if (result.sriStatus === 'authorized') {
        // PDF + email en paralelo, no bloqueante para el trigger principal
        Promise.all([
          generateDebitNotePdfInternal(debitNoteId, companyId)
            .then(() => sendDebitNoteEmailInternal(debitNoteId, companyId))
            .catch(err => console.warn('[onDebitNoteEmit] Post-auth tasks error:', err)),
        ]);
      }

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error inesperado';
      console.error('[onDebitNoteEmit] Error en pipeline:', err);
      try {
        await db.doc(`companies/${companyId}/debitNotes/${debitNoteId}`).update({
          sriStatus: 'rejected', sriError: msg, updatedAt: admin.firestore.Timestamp.now(),
        });
      } catch {}
    }
  }
);
