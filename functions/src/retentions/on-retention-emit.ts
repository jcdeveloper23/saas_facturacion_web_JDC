import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import * as forge from 'node-forge';
import { getStorage } from 'firebase-admin/storage';
import axios from 'axios';

import { generateRetentionXmlInternal } from './generate-retention-xml';
import { generateRetentionPdfInternal } from './generate-retention-pdf';
import { sendRetentionEmailInternal }   from './send-retention-email';

// ─── Shared SRI helpers (duplicated from invoices to keep modules independent) ─

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

async function signRetentionXml(retentionId: string, companyId: string): Promise<void> {
  const db     = admin.firestore();
  const bucket = getStorage().bucket();
  const now    = admin.firestore.Timestamp.now();

  const xmlPath = `companies/${companyId}/xml/ret-${retentionId}.xml`;
  let xmlBuffer: Buffer;
  try {
    [xmlBuffer] = await bucket.file(xmlPath).download();
  } catch {
    throw new Error('XML de retención no encontrado en Storage.');
  }
  const xmlContent = xmlBuffer.toString('utf8');

  const certPath = `companies/${companyId}/certificates/signing.p12`;
  let certBuffer: Buffer;
  try {
    [certBuffer] = await bucket.file(certPath).download();
  } catch {
    throw new Error('Certificado .p12 no encontrado en Storage.');
  }

  // Parse P12 — try with empty password first (MVP: no Secret Manager yet)
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
    throw new Error('No se pudo leer el certificado .p12. Verifique la contraseña.');
  }

  // Minimal XAdES-BES: enveloped signature approach
  const xmlStripped = xmlContent.replace(/<\?xml[^?]*\?>\s*/i, '').trim();
  const certDer     = forge.util.encode64(forge.asn1.toDer(forge.pki.certificateToAsn1(certificate)).bytes());
  const signingTime = new Date().toISOString();

  function sha1b64(data: string): string {
    const md = forge.md.sha1.create();
    md.update(forge.util.encodeUtf8(data));
    return forge.util.encode64(md.digest().bytes());
  }

  const signedPropsId   = 'ret-signed-props';
  const keyInfoId       = 'ret-key-info';
  const signedPropsXml  = `<xades:SignedProperties xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" Id="${signedPropsId}"><xades:SignedSignatureProperties><xades:SigningTime>${signingTime}</xades:SigningTime><xades:SigningCertificate><xades:Cert><xades:CertDigest><ds:DigestMethod xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/><ds:DigestValue xmlns:ds="http://www.w3.org/2000/09/xmldsig#">${sha1b64(certDer)}</ds:DigestValue></xades:CertDigest></xades:Cert></xades:SigningCertificate></xades:SignedSignatureProperties></xades:SignedProperties>`;

  const keyInfoXml = `<ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Id="${keyInfoId}"><ds:X509Data><ds:X509Certificate>${certDer}</ds:X509Certificate></ds:X509Data></ds:KeyInfo>`;

  const signedInfoXml = `<ds:SignedInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/><ds:SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/><ds:Reference URI="#comprobante"><ds:Transforms><ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/></ds:Transforms><ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/><ds:DigestValue>${sha1b64(xmlStripped)}</ds:DigestValue></ds:Reference><ds:Reference URI="#${keyInfoId}"><ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/><ds:DigestValue>${sha1b64(keyInfoXml)}</ds:DigestValue></ds:Reference><ds:Reference Type="http://uri.etsi.org/01903#SignedProperties" URI="#${signedPropsId}"><ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/><ds:DigestValue>${sha1b64(signedPropsXml)}</ds:DigestValue></ds:Reference></ds:SignedInfo>`;

  const md = forge.md.sha1.create();
  md.update(forge.util.encodeUtf8(signedInfoXml));
  const sigValue = forge.util.encode64((privateKey as any).sign(md));

  const signatureBlock = `<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Id="ret-signature">${signedInfoXml}<ds:SignatureValue>${sigValue}</ds:SignatureValue>${keyInfoXml}<ds:Object><xades:QualifyingProperties xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" Target="ret-signature">${signedPropsXml}</xades:QualifyingProperties></ds:Object></ds:Signature>`;

  // Inject signature before closing root tag
  const closingTagMatch = xmlStripped.match(/<\/(\w+)>\s*$/);
  const closingTag = closingTagMatch ? closingTagMatch[0] : '';
  const signedXml = `<?xml version="1.0" encoding="UTF-8"?>\n` +
    xmlStripped.slice(0, xmlStripped.length - closingTag.length) +
    signatureBlock +
    closingTag;

  const signedPath = `companies/${companyId}/xml/ret-${retentionId}-signed.xml`;
  await bucket.file(signedPath).save(Buffer.from(signedXml, 'utf8'), {
    metadata: { contentType: 'application/xml' },
  });

  const [signedUrl] = await bucket.file(signedPath).getSignedUrl({
    action:  'read',
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
  });

  await db.doc(`companies/${companyId}/retentions/${retentionId}`).update({
    xmlUrl:    signedUrl,
    sriStatus: 'signed',
    updatedAt: now,
  });
  console.log('[on-retention-emit] XML firmado OK.');
}

async function sendRetentionToSri(retentionId: string, companyId: string): Promise<{ sriStatus: string }> {
  const db     = admin.firestore();
  const bucket = getStorage().bucket();
  const now    = admin.firestore.Timestamp.now();

  const retSnap = await db.doc(`companies/${companyId}/retentions/${retentionId}`).get();
  if (!retSnap.exists) throw new Error(`Retención no encontrada: ${retentionId}`);
  const accessKey: string = (retSnap.data() as any)['accessKey'];
  if (!accessKey) throw new Error('Retención sin clave de acceso.');

  const companySnap = await db.doc(`companies/${companyId}`).get();
  const environment: 'testing' | 'production' = (companySnap.data() as any)?.['sri']?.['environment'] ?? 'testing';

  const platformSnap  = await db.doc('platform/defaults/sriConfig/data').get();
  const platformData  = platformSnap.exists ? (platformSnap.data() as any) : null;
  const endpoints     = platformData?.endpoints?.[environment] ?? SRI_DEFAULTS[environment];

  // Download signed XML
  const signedPath = `companies/${companyId}/xml/ret-${retentionId}-signed.xml`;
  let signedBuffer: Buffer;
  try {
    [signedBuffer] = await bucket.file(signedPath).download();
  } catch {
    throw new Error('XML firmado de retención no encontrado en Storage.');
  }
  const xmlBase64 = signedBuffer.toString('base64');

  // SOAP reception
  const receptionUrl = endpoints.receptionUrl.replace('?wsdl', '');
  const receptionSoap = `<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><ns2:validarComprobante xmlns:ns2="http://ec.gob.sri.ws.recepcion"><xml>${xmlBase64}</xml></ns2:validarComprobante></soap:Body></soap:Envelope>`;

  const receptionRes = await axios.post(receptionUrl, receptionSoap, {
    headers: { 'Content-Type': 'text/xml;charset=UTF-8', 'SOAPAction': '' }, timeout: 30000,
  });
  const receptionStr = String(receptionRes.data);

  if (receptionStr.includes('DEVUELTA')) {
    const mensajes = receptionStr.match(/<mensaje>(.*?)<\/mensaje>/g)?.map(m => m.replace(/<\/?mensaje>/g, '')).join('; ') ?? 'Comprobante devuelto por SRI';
    await db.doc(`companies/${companyId}/retentions/${retentionId}`).update({
      sriStatus: 'rejected', sriError: mensajes, updatedAt: now,
    });
    return { sriStatus: 'rejected' };
  }

  // SOAP authorization
  const authUrl  = endpoints.authorizationUrl.replace('?wsdl', '');
  const authSoap = `<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><ns2:autorizacionComprobante xmlns:ns2="http://ec.gob.sri.ws.autorizacion"><claveAccesoComprobante>${accessKey}</claveAccesoComprobante></ns2:autorizacionComprobante></soap:Body></soap:Envelope>`;

  const authRes = await axios.post(authUrl, authSoap, {
    headers: { 'Content-Type': 'text/xml;charset=UTF-8', 'SOAPAction': '' }, timeout: 30000,
  });
  const authStr = String(authRes.data);
  const authNumMatch = authStr.match(/<numeroAutorizacion>(.*?)<\/numeroAutorizacion>/);
  const estadoMatch  = authStr.match(/<estado>(.*?)<\/estado>/);
  const estado       = estadoMatch?.[1]?.toUpperCase() ?? '';

  if (estado === 'AUTORIZADO') {
    const authNumber = authNumMatch?.[1] ?? '';
    const authDateMatch = authStr.match(/<fechaAutorizacion>(.*?)<\/fechaAutorizacion>/);
    const authorizedAt  = authDateMatch?.[1] ? new Date(authDateMatch[1]) : new Date();
    await db.doc(`companies/${companyId}/retentions/${retentionId}`).update({
      sriStatus: 'authorized', authorizationNumber: authNumber,
      authorizedAt: admin.firestore.Timestamp.fromDate(authorizedAt), sriError: null, updatedAt: now,
    });
    return { sriStatus: 'authorized' };
  }

  const sriMsg = authStr.match(/<mensaje>(.*?)<\/mensaje>/)?.[1] ?? `Estado SRI: ${estado}`;
  await db.doc(`companies/${companyId}/retentions/${retentionId}`).update({
    sriStatus: 'rejected', sriError: sriMsg, updatedAt: now,
  });
  return { sriStatus: 'rejected' };
}

// ─── Trigger ──────────────────────────────────────────────────────────────────

export const onRetentionEmit = onDocumentUpdated(
  'companies/{companyId}/retentions/{retentionId}',
  async (event) => {
    const before = event.data?.before.data() as Record<string, any> | undefined;
    const after  = event.data?.after.data()  as Record<string, any> | undefined;
    if (!before || !after) return;

    const statusChangedToIssued = before['status'] !== 'issued' && after['status'] === 'issued';
    const sriNotYetStarted      = !after['sriStatus'];
    if (!statusChangedToIssued || !sriNotYetStarted) return;

    const { companyId, retentionId } = event.params;
    const db = admin.firestore();
    console.log('[onRetentionEmit] Nueva emisión:', { companyId, retentionId });

    try {
      await db.doc(`companies/${companyId}/retentions/${retentionId}`).update({
        sriStatus: 'pending', updatedAt: admin.firestore.Timestamp.now(),
      });
    } catch (err) {
      console.error('[onRetentionEmit] Error marcando pending:', err);
      return;
    }

    try {
      console.log('[onRetentionEmit] Paso 1/3 — Generando XML...');
      await generateRetentionXmlInternal(retentionId, companyId);

      console.log('[onRetentionEmit] Paso 2/3 — Firmando XML...');
      await signRetentionXml(retentionId, companyId);

      console.log('[onRetentionEmit] Paso 3/3 — Enviando al SRI...');
      const result = await sendRetentionToSri(retentionId, companyId);
      console.log('[onRetentionEmit] Pipeline completado. sriStatus:', result.sriStatus);

      if (result.sriStatus === 'authorized') {
        // Generate PDF and send email in parallel (non-blocking for main pipeline)
        Promise.all([
          generateRetentionPdfInternal(retentionId, companyId)
            .then(() => sendRetentionEmailInternal(retentionId, companyId))
            .catch(err => console.warn('[onRetentionEmit] Post-auth tasks error:', err)),
        ]);
      }

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error inesperado';
      console.error('[onRetentionEmit] Error en pipeline:', err);
      try {
        await db.doc(`companies/${companyId}/retentions/${retentionId}`).update({
          sriStatus: 'rejected', sriError: msg, updatedAt: admin.firestore.Timestamp.now(),
        });
      } catch {}
    }
  }
);
