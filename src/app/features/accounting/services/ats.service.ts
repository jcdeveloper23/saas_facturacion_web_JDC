import { Injectable, inject } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { ExcelExportService } from './excel-export.service';

interface GenerateAtsInput {
  companyId: string;
  year:      number;
  month:     number; // 1-12 mensual; 6=S1, 12=S2 semestral
  semestre?: 1 | 2;
  excluirInformativa332?: boolean;
  includeExcelData?: boolean;
}

interface GenerateAtsResult {
  zip:        string; // base64
  filename:   string;
  excelData?: AtsExcelData;
}

export interface AtsCompraRow {
  codigoOper: string; codSustento: string; tpIdProv: string; idProv: string;
  parteRel: string; tipoComprobante: string; fechaRegistro: string;
  establecimiento: string; puntoEmision: string; secuencial: string;
  fechaEmision: string; autorizacion: string;
  baseNoGraIva: number; baseImponible: number; baseImpGrav: number;
  baseImpExe: number; montoIce: number; montoIva: number;
  valRetBien10: number; valRetServ20: number; valorRetBienes: number;
  valRetServ50: number; valorRetServicios: number; valRetServ100: number;
  pagoLocExt: string; formaPago: string;
  codRetAir: string; baseImpAir: number; porcentajeAir: number; valRetAir: number;
  estabRetencion: string; ptoEmiRetencion: string; secRetencion: string;
  autRetencion: string; fechaEmiRetencion: string;
}

export interface AtsVentaRow {
  tpIdCliente: string; idCliente: string; parteRel: string;
  tipoComprobante: string; tipoEmision: string; numeroComprobantes: number;
  baseNoGraIva: number; baseImponible: number; baseImpGrav: number;
  montoIva: number; montoIce: number; valorRetIva: number; valorRetRenta: number;
}

export interface AtsVentaEstabRow {
  codEstab: string; ventasEstab: number; ivaComp: number;
}

export interface AtsAnuladoRow {
  tipoComprobante: string; establecimiento: string; puntoEmision: string;
  secuencialInicio: number; secuencialFin: number; autorizacion: string;
}

export interface AtsExcelData {
  companyRuc: string; companyName: string; year: number; mesXml: string;
  numEstabRuc: number; totalVentas: number;
  compras: AtsCompraRow[];
  ventas: AtsVentaRow[];
  ventasEstab: AtsVentaEstabRow[];
  anulados: AtsAnuladoRow[];
}

@Injectable({ providedIn: 'root' })
export class AtsService {
  private functions  = inject(Functions);
  private excelSvc   = inject(ExcelExportService);

  /** Genera el ATS del mes y dispara la descarga del .zip (mismo patrón que AccountingPdfService). */
  async downloadAts(input: GenerateAtsInput): Promise<void> {
    const fn     = httpsCallable<GenerateAtsInput, GenerateAtsResult>(this.functions, 'generateAts');
    const result = await fn(input);

    const { zip, filename } = result.data;
    const bytes  = Uint8Array.from(atob(zip), c => c.charCodeAt(0));
    const blob   = new Blob([bytes], { type: 'application/zip' });
    const url    = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href     = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  /** Llama a la misma CF con includeExcelData=true y genera el .xlsx con 4 hojas. */
  async downloadExcel(input: Omit<GenerateAtsInput, 'includeExcelData'>): Promise<void> {
    const fn     = httpsCallable<GenerateAtsInput, GenerateAtsResult>(this.functions, 'generateAts');
    const result = await fn({ ...input, includeExcelData: true });
    const data   = result.data.excelData;
    if (!data) throw new Error('La función no devolvió excelData');

    const period = `${data.mesXml}${data.year}`;

    this.excelSvc.export(`ATS_${period}`, [
      {
        name: 'Compras',
        rows: data.compras.map(r => ({
          'Cod. Oper.':      r.codigoOper,
          'Cod. Sustento':   r.codSustento,
          'Tip. Id. Prov.':  r.tpIdProv,
          'Id. Proveedor':   r.idProv,
          'Parte Rel.':      r.parteRel,
          'Tipo Comp.':      r.tipoComprobante,
          'Fec. Registro':   r.fechaRegistro,
          'Establecimiento': r.establecimiento,
          'Pto. Emisión':    r.puntoEmision,
          'Secuencial':      r.secuencial,
          'Fec. Emisión':    r.fechaEmision,
          'Autorización':    r.autorizacion,
          'Base No Gra. IVA': r.baseNoGraIva,
          'Base Imponible':  r.baseImponible,
          'Base Imp. Grav.': r.baseImpGrav,
          'Base Imp. Exe.':  r.baseImpExe,
          'Monto ICE':       r.montoIce,
          'Monto IVA':       r.montoIva,
          'Ret. Bien 10%':   r.valRetBien10,
          'Ret. Serv. 20%':  r.valRetServ20,
          'Ret. Bienes 30%': r.valorRetBienes,
          'Ret. Serv. 50%':  r.valRetServ50,
          'Ret. Serv. 70%':  r.valorRetServicios,
          'Ret. Serv. 100%': r.valRetServ100,
          'Pago Loc/Ext':    r.pagoLocExt,
          'Forma de Pago':   r.formaPago,
          'Cód. Ret. AIR':   r.codRetAir,
          'Base Imp. AIR':   r.baseImpAir,
          '% AIR':           r.porcentajeAir,
          'Val. Ret. AIR':   r.valRetAir,
          'Estab. Ret.':     r.estabRetencion,
          'Pto. Emi. Ret.':  r.ptoEmiRetencion,
          'Sec. Ret.':       r.secRetencion,
          'Aut. Ret.':       r.autRetencion,
          'Fec. Emi. Ret.':  r.fechaEmiRetencion,
        })),
      },
      {
        name: 'Ventas',
        rows: data.ventas.map(r => ({
          'Tip. Id. Cliente': r.tpIdCliente,
          'Id. Cliente':      r.idCliente,
          'Parte Rel.':       r.parteRel,
          'Tipo Comp.':       r.tipoComprobante,
          'Tipo Emisión':     r.tipoEmision,
          'Nro. Comprobantes': r.numeroComprobantes,
          'Base No Gra. IVA': r.baseNoGraIva,
          'Base Imponible':   r.baseImponible,
          'Base Imp. Grav.':  r.baseImpGrav,
          'Monto IVA':        r.montoIva,
          'Monto ICE':        r.montoIce,
          'Ret. IVA':         r.valorRetIva,
          'Ret. Renta':       r.valorRetRenta,
        })),
      },
      {
        name: 'Ventas x Establecimiento',
        rows: data.ventasEstab.map(r => ({
          'Cód. Establecimiento': r.codEstab,
          'Ventas Establecimiento': r.ventasEstab,
          'IVA Comp.':             r.ivaComp,
        })),
      },
      {
        name: 'Anulados',
        rows: data.anulados.map(r => ({
          'Tipo Comp.':      r.tipoComprobante,
          'Establecimiento': r.establecimiento,
          'Pto. Emisión':    r.puntoEmision,
          'Sec. Inicio':     r.secuencialInicio,
          'Sec. Fin':        r.secuencialFin,
          'Autorización':    r.autorizacion,
        })),
      },
    ]);
  }
}
