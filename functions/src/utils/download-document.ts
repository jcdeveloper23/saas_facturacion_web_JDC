import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getStorage } from 'firebase-admin/storage';

// ─── Types ────────────────────────────────────────────────────────────────────

type DocumentType = 'invoice' | 'creditNote' | 'retention' | 'debitNote';
type FileType = 'xml' | 'pdf';

interface DownloadDocumentRequest {
  documentType: DocumentType;
  documentId: string;
  companyId: string;
  fileType: FileType;
}

// ─── Storage path map ─────────────────────────────────────────────────────────

function resolveStoragePath(
  documentType: DocumentType,
  documentId: string,
  companyId: string,
  fileType: FileType
): string {
  const id  = documentId;
  const cid = companyId;

  const paths: Record<DocumentType, Record<FileType, string>> = {
    invoice:    { xml: `companies/${cid}/xml/${id}-signed.xml`,        pdf: `companies/${cid}/pdf/${id}.pdf` },
    creditNote: { xml: `companies/${cid}/xml/${id}-signed.xml`,        pdf: `companies/${cid}/pdf/cn-${id}.pdf` },
    retention:  { xml: `companies/${cid}/xml/ret-${id}-signed.xml`,    pdf: `companies/${cid}/pdf/ret-${id}.pdf` },
    debitNote:  { xml: `companies/${cid}/xml/dn-${id}-signed.xml`,     pdf: `companies/${cid}/pdf/dn-${id}.pdf` },
  };

  return paths[documentType][fileType];
}

// ─── Callable function ────────────────────────────────────────────────────────

export const downloadDocument = onCall(async (request) => {
  // 1. Auth check
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Debe estar autenticado.');
  }

  const { documentType, documentId, companyId, fileType } =
    request.data as DownloadDocumentRequest;

  // 2. Input validation
  if (!documentType || !['invoice', 'creditNote', 'retention', 'debitNote'].includes(documentType)) {
    throw new HttpsError('invalid-argument', 'documentType inválido. Debe ser: invoice | creditNote | retention | debitNote.');
  }
  if (!documentId || typeof documentId !== 'string') {
    throw new HttpsError('invalid-argument', 'documentId es requerido.');
  }
  if (!companyId || typeof companyId !== 'string') {
    throw new HttpsError('invalid-argument', 'companyId es requerido.');
  }
  if (!fileType || !['xml', 'pdf'].includes(fileType)) {
    throw new HttpsError('invalid-argument', 'fileType inválido. Debe ser: xml | pdf.');
  }

  // 3. Authorization: caller must belong to the company (or be super_admin)
  const callerRole      = request.auth.token['role']      as string | undefined;
  const callerCompanyId = request.auth.token['companyId'] as string | undefined;

  if (callerRole !== 'super_admin' && callerCompanyId !== companyId) {
    throw new HttpsError('permission-denied', 'No tiene permisos para acceder a documentos de esta empresa.');
  }

  console.log('[download-document] Request:', { documentType, documentId, companyId, fileType });

  // 4. Resolve Storage path
  const storagePath = resolveStoragePath(documentType, documentId, companyId, fileType);
  console.log('[download-document] Storage path:', storagePath);

  // 5. Verify file exists and generate fresh Signed URL (1 hour expiry)
  try {
    const bucket = getStorage().bucket();
    const file   = bucket.file(storagePath);

    const [exists] = await file.exists();
    if (!exists) {
      throw new HttpsError(
        'not-found',
        `El archivo ${fileType.toUpperCase()} no existe en Storage. Asegúrese de haber generado el documento antes de descargarlo.`
      );
    }

    const [url] = await file.getSignedUrl({
      action:  'read',
      expires: Date.now() + 60 * 60 * 1000, // 1 hora — suficiente para la descarga inmediata
    });

    console.log('[download-document] URL generada correctamente para:', storagePath);
    return { url };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error('[download-document] Error generando Signed URL:', err);
    throw new HttpsError('internal', 'Error al generar la URL de descarga. Intente nuevamente.');
  }
});
