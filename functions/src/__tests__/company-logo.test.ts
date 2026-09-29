/**
 * company-logo.test.ts
 *
 * El logo de la empresa en el RIDE. Lo que importa: que solo se lea de las
 * carpetas de logo de ESA empresa, que solo pase PNG o JPG, y que sin logo (o
 * con uno roto) el PDF no cambie ni falle.
 *
 * Solo lógica pura y PDFKit en memoria, sin Firestore ni Storage.
 */

import PDFDocument from 'pdfkit';
import {
  detectLogoFormat,
  drawLogo,
  logoStoragePath,
  resolveLogoSettings,
} from '../utils/company-logo';

const BUCKET = 'accounting-system-a5c9f.firebasestorage.app';
const CID = 'OG4ydEyOAhtsNmkOjc1P';

// PNG de 1×1 px, transparente.
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

const firebaseUrl = (path: string, bucket = BUCKET) =>
  `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media&token=abc`;

describe('logoStoragePath', () => {
  it('saca la ruta de una URL de descarga de Firebase (la que guarda la web)', () => {
    const path = `companies/${CID}/branding/logo.png`;
    expect(logoStoragePath(firebaseUrl(path), BUCKET, CID)).toBe(path);
  });

  it('acepta también la carpeta logos/ y las formas storage.googleapis.com y gs://', () => {
    const path = `companies/${CID}/logos/marca.jpg`;
    expect(logoStoragePath(`https://storage.googleapis.com/${BUCKET}/${path}`, BUCKET, CID)).toBe(path);
    expect(logoStoragePath(`gs://${BUCKET}/${path}`, BUCKET, CID)).toBe(path);
  });

  it('rechaza el logo de OTRA empresa', () => {
    expect(logoStoragePath(firebaseUrl('companies/otra/branding/logo.png'), BUCKET, CID)).toBeNull();
  });

  it('rechaza cualquier otra carpeta de la empresa (el certificado, los PDF)', () => {
    expect(logoStoragePath(firebaseUrl(`companies/${CID}/certificates/firma.p12`), BUCKET, CID)).toBeNull();
    expect(logoStoragePath(firebaseUrl(`companies/${CID}/pdf/x.pdf`), BUCKET, CID)).toBeNull();
    expect(logoStoragePath(firebaseUrl(`companies/${CID}/branding/sub/logo.png`), BUCKET, CID)).toBeNull();
  });

  it('rechaza otro bucket, otros hosts y rutas con ..', () => {
    const path = `companies/${CID}/branding/logo.png`;
    expect(logoStoragePath(firebaseUrl(path, 'otro-bucket'), BUCKET, CID)).toBeNull();
    expect(logoStoragePath(`https://ejemplo.com/${path}`, BUCKET, CID)).toBeNull();
    expect(logoStoragePath(`http://storage.googleapis.com/${BUCKET}/${path}`, BUCKET, CID)).toBeNull();
    expect(logoStoragePath(firebaseUrl(`companies/${CID}/../${CID}/branding/logo.png`), BUCKET, CID)).toBeNull();
    expect(logoStoragePath('no es una url', BUCKET, CID)).toBeNull();
    expect(logoStoragePath('', BUCKET, CID)).toBeNull();
  });
});

describe('detectLogoFormat', () => {
  it('reconoce PNG y JPG por su firma', () => {
    expect(detectLogoFormat(PNG_1PX)).toBe('png');
    expect(detectLogoFormat(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]))).toBe('jpeg');
  });

  it('rechaza SVG, WebP y lo vacío', () => {
    expect(detectLogoFormat(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(detectLogoFormat(Buffer.from('RIFF\u0000\u0000\u0000\u0000WEBPVP8 ', 'binary'))).toBeNull();
    expect(detectLogoFormat(Buffer.alloc(0))).toBeNull();
    expect(detectLogoFormat(null)).toBeNull();
  });
});

describe('resolveLogoSettings', () => {
  it('configuration/general manda sobre el documento de la empresa', () => {
    expect(resolveLogoSettings({ logoUrl: 'a' }, { logoUrl: 'b' }).logoUrl).toBe('a');
    expect(resolveLogoSettings(null, { logoUrl: 'b' }).logoUrl).toBe('b');
  });

  it('un logo quitado (cadena vacía en general) no resucita el del documento raíz', () => {
    expect(resolveLogoSettings({ logoUrl: '' }, { logoUrl: 'b' }).logoUrl).toBe('');
  });

  it('showLogoOnPdf sin definir es true; solo false lo apaga', () => {
    expect(resolveLogoSettings({ logoUrl: 'a' }, {}).show).toBe(true);
    expect(resolveLogoSettings({ logoUrl: 'a', showLogoOnPdf: false }, {}).show).toBe(false);
    expect(resolveLogoSettings({ logoUrl: 'a' }, { showLogoOnPdf: false }).show).toBe(false);
    expect(resolveLogoSettings({ logoUrl: 'a', showLogoOnPdf: true }, { showLogoOnPdf: false }).show).toBe(true);
  });
});

describe('drawLogo', () => {
  const newDoc = () => new PDFDocument({ size: 'A4', margin: 40 });

  it('sin logo no dibuja nada y devuelve 0', () => {
    const doc = newDoc();
    const spy = jest.spyOn(doc, 'image');
    expect(drawLogo(doc, null, 40, 40, 200, 60)).toBe(0);
    expect(spy).not.toHaveBeenCalled();
    doc.end();
  });

  it('con un archivo que no es imagen no dibuja nada y no lanza', () => {
    const doc = newDoc();
    const spy = jest.spyOn(doc, 'image');
    expect(drawLogo(doc, Buffer.from('<svg/>'), 40, 40, 200, 60)).toBe(0);
    // Firma de PNG pero contenido roto: PDFKit lanza y se absorbe.
    const broken = Buffer.concat([PNG_1PX.subarray(0, 8), Buffer.from('basura')]);
    expect(drawLogo(doc, broken, 40, 40, 200, 60)).toBe(0);
    expect(spy).not.toHaveBeenCalled();
    doc.end();
  });

  it('respeta la caja y la proporción, y devuelve el alto real', () => {
    const doc = newDoc();
    const spy = jest.spyOn(doc, 'image');
    // Imagen cuadrada en una caja de 200 × 60 → 60 × 60, centrada.
    expect(drawLogo(doc, PNG_1PX, 40, 40, 200, 60, 'center')).toBeCloseTo(60);
    const [, x, y, opts] = spy.mock.calls[0] as unknown as [unknown, number, number, { width: number; height: number }];
    expect(x).toBeCloseTo(40 + (200 - 60) / 2);
    expect(y).toBe(40);
    expect(opts.width).toBeCloseTo(60);
    expect(opts.height).toBeCloseTo(60);
    // A la izquierda, sin desplazamiento.
    drawLogo(doc, PNG_1PX, 40, 40, 30, 75, 'left');
    const [, x2, , opts2] = spy.mock.calls[1] as unknown as [unknown, number, number, { width: number; height: number }];
    expect(x2).toBe(40);
    expect(opts2.width).toBeCloseTo(30);
    doc.end();
  });
});
