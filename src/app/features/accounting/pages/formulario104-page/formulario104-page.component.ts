import {
  Component, OnInit, OnDestroy, inject, signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { take } from 'rxjs/operators';
import {
  CardModule, ButtonModule, SpinnerModule, FormModule, AlertModule, TooltipModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';

import { InvoicesService }   from '../../../invoices/services/invoices.service';
import { PurchasesService }  from '../../../purchases/services/purchases.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { Invoice }  from '../../../invoices/models/invoice.interface';
import { Purchase } from '../../../purchases/models/purchase.interface';
import { Form104Data } from '../../models/sri-forms.interface';
import { Timestamp } from '@angular/fire/firestore';

// ─── Tipos auxiliares ─────────────────────────────────────────────────────────
type PeriodoTipo     = 'mensual' | 'semestral';
type DeclaracionTipo = 'original' | 'sustitutiva';

@Component({
  selector: 'app-formulario104-page',
  standalone: true,
  templateUrl: './formulario104-page.component.html',
  styleUrl:    './formulario104-page.component.scss',
  imports: [
    CommonModule, FormsModule,
    CardModule, ButtonModule, SpinnerModule, FormModule, AlertModule, TooltipModule, IconModule
  ]
})
export class Formulario104PageComponent implements OnInit, OnDestroy {
  private invoicesSvc   = inject(InvoicesService);
  private purchasesSvc  = inject(PurchasesService);
  private notifications = inject(NotificationService);
  private destroy$      = new Subject<void>();

  // ── Selectores estáticos ──────────────────────────────────────────────────
  readonly currentYear = new Date().getFullYear();
  readonly years       = Array.from({ length: 4 }, (_, i) => this.currentYear - i);
  readonly months      = [
    { value: 1,  label: 'Enero' },      { value: 2,  label: 'Febrero' },
    { value: 3,  label: 'Marzo' },      { value: 4,  label: 'Abril' },
    { value: 5,  label: 'Mayo' },       { value: 6,  label: 'Junio' },
    { value: 7,  label: 'Julio' },      { value: 8,  label: 'Agosto' },
    { value: 9,  label: 'Septiembre' }, { value: 10, label: 'Octubre' },
    { value: 11, label: 'Noviembre' },  { value: 12, label: 'Diciembre' }
  ];
  readonly semestres = [
    { value: 1, label: '1er semestre (Enero - Junio)' },
    { value: 2, label: '2do semestre (Julio - Diciembre)' }
  ];

  // ── Estado del formulario de selección ───────────────────────────────────
  selectedYear        = signal(this.currentYear);
  selectedMonth       = signal(new Date().getMonth() + 1);
  selectedSemestre    = signal<1 | 2>(1);
  periodoTipo         = signal<PeriodoTipo>('mensual');
  declaracionTipo     = signal<DeclaracionTipo>('original');

  // ── Estado de generación ─────────────────────────────────────────────────
  generating = signal(false);
  generated  = signal(false);
  form104    = signal<Form104Data | null>(null);

  // ── Campos editables manualmente (post-generación) ───────────────────────
  // Se mantienen separados para poder detectar si el usuario los modificó
  editable565 = signal(0);
  editable624 = signal(0);
  editable625 = signal(0);

  // ── Computed de display ───────────────────────────────────────────────────
  selectedMonthLabel = computed(() =>
    this.months.find(m => m.value === this.selectedMonth())?.label ?? ''
  );

  periodoLabel = computed(() => {
    if (this.periodoTipo() === 'semestral') {
      return this.semestres.find(s => s.value === this.selectedSemestre())?.label ?? '';
    }
    return this.selectedMonthLabel();
  });

  // Recalcula campos de liquidacion cuando el usuario edita campos manuales
  liquidacionActualizada = computed(() => {
    const f = this.form104();
    if (!f) return null;
    const c565 = Math.max(0, this.editable565());
    const c624 = Math.max(0, this.editable624());
    const c625 = Math.max(0, this.editable625());
    const c609 = r2(Math.max(0, f.c601 - f.c602 + c565));
    const c699 = r2(Math.max(0, f.c602 - f.c601 - c565));
    return { c565, c624, c625, c609, c699 };
  });

  ngOnInit(): void {}

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  setSemestre(value: unknown): void {
    const n = Number(value);
    if (n === 1 || n === 2) this.selectedSemestre.set(n);
  }

  // ── Generate ──────────────────────────────────────────────────────────────
  async generate(): Promise<void> {
    this.generating.set(true);
    this.generated.set(false);
    this.form104.set(null);
    this.editable565.set(0);
    this.editable624.set(0);
    this.editable625.set(0);

    try {
      const year   = this.selectedYear();
      const tipo   = this.periodoTipo();

      // Determinar rango de meses a cubrir
      let mesInicio: number;
      let mesFin: number;
      if (tipo === 'mensual') {
        mesInicio = mesFin = this.selectedMonth();
      } else {
        const sem = this.selectedSemestre();
        mesInicio = sem === 1 ? 1 : 7;
        mesFin    = sem === 1 ? 6 : 12;
      }

      const dateFrom = Timestamp.fromDate(new Date(year, mesInicio - 1, 1, 0, 0, 0));
      const dateTo   = Timestamp.fromDate(new Date(year, mesFin, 0, 23, 59, 59));

      // Cargar facturas y compras en paralelo (one-shot)
      const [invoices, purchases] = await Promise.all([
        this._loadInvoices(dateFrom, dateTo),
        this._loadPurchases(dateFrom, dateTo),
      ]);

      const data = this._calcForm104(invoices, purchases, tipo, mesInicio, mesFin);
      this.form104.set(data);
      // Pre-llenar c565 con el valor sugerido calculado; el usuario puede editarlo
      this.editable565.set(data.c565Sugerido);
      this.generated.set(true);

    } catch (err: any) {
      this.notifications.error('Error generando Formulario 104: ' + (err?.message ?? err));
    } finally {
      this.generating.set(false);
    }
  }

  // ── Carga de documentos ───────────────────────────────────────────────────

  private _loadInvoices(dateFrom: Timestamp, dateTo: Timestamp): Promise<Invoice[]> {
    return new Promise((resolve, reject) => {
      const sub = this.invoicesSvc
        .getInvoices({ dateFrom, dateTo })
        .pipe(take(1))
        .subscribe({
          next:  items => { sub.unsubscribe(); resolve(items); },
          error: err   => { sub.unsubscribe(); reject(err); }
        });
    });
  }

  private _loadPurchases(dateFrom: Timestamp, dateTo: Timestamp): Promise<Purchase[]> {
    return new Promise((resolve, reject) => {
      const sub = this.purchasesSvc
        .getAll()
        .pipe(take(1))
        .subscribe({
          next: items => {
            sub.unsubscribe();
            // filtro client-side por fecha (PurchasesService.getAll no acepta rango)
            const filtered = items.filter(p => {
              if (p.status === 'cancelled') return false;
              const d = toDate(p.date);
              return d >= dateFrom.toDate() && d <= dateTo.toDate();
            });
            resolve(filtered);
          },
          error: err => { sub.unsubscribe(); reject(err); }
        });
    });
  }

  // ── Calculo del formulario ────────────────────────────────────────────────

  private _calcForm104(
    invoices: Invoice[],
    purchases: Purchase[],
    tipo: PeriodoTipo,
    mesInicio: number,
    mesFin: number
  ): Form104Data {

    // ── Acumuladores ventas ──────────────────────────────────────────────────
    let c401 = 0; // subtotal ventas 15%
    let c425 = 0; // subtotal ventas 5% — bruto
    let c403 = 0; // subtotal ventas 0% sin CT
    let c404 = 0; // subtotal ventas 0% con CT
    let c411 = 0; // IVA 15% en ventas (neto, tras descontar NC)
    let c445 = 0; // IVA 5%  en ventas (neto, tras descontar NC)
    let c431 = 0; // NC ventas 15% (base bruta de NC emitidas con 15%)
    let nc5  = 0; // NC ventas 5%  (base bruta de NC emitidas con 5%; se usa para calcular c435)
    let c433 = 0; // NC ventas 0%  (solo informativo)

    // ── Acumuladores adquisiciones ───────────────────────────────────────────
    let c500 = 0; // adquisiciones 15% con CT
    let c540 = 0; // adquisiciones 5%  con CT — bruto
    let c560 = 0; // IVA 5%  en adquisiciones
    let c510 = 0; // NC adquisiciones 15% (Purchase no tiene flag NC — siempre 0)
    // nc_compras_5 = 0 siempre (Purchase no distingue NC de proveedor)

    // Separar facturas normales de notas de credito
    const normalInvoices = invoices.filter(inv =>
      !inv.isVoid && !inv.isCreditNote &&
      (inv.status === 'issued' || inv.status === 'paid')
    );
    const creditNotes = invoices.filter(inv =>
      !inv.isVoid && inv.isCreditNote &&
      (inv.status === 'issued' || inv.status === 'paid' || inv.status === 'credit_note')
    );

    // ── Ventas normales ──────────────────────────────────────────────────────
    for (const inv of normalInvoices) {
      for (const vs of inv.vatSummary ?? []) {
        const base = vs.taxableBase ?? 0;
        const iva  = vs.vatAmount   ?? 0;
        switch (vs.vatPct) {
          case 15: c401 += base; c411 += iva; break;
          case 5:  c425 += base; c445 += iva; break;
          case 8:  c401 += base; c411 += iva; break; // IVA 8% transitorio — agrupa con 15% en el form
          case 0:
            // La diferencia entre 403 y 404 depende del tipo de producto.
            // Sin un marcador explícito en la línea, agrupamos todo como 404 (con CT)
            // ya que la mayoría de ventas 0% de una empresa típica permiten CT.
            // El usuario debe ajustar si tiene ventas 0% sin CT.
            c404 += base;
            break;
        }
      }
    }

    // ── Notas de credito en ventas ───────────────────────────────────────────
    for (const cn of creditNotes) {
      for (const vs of cn.vatSummary ?? []) {
        const base = vs.taxableBase ?? 0;
        const iva  = vs.vatAmount   ?? 0;
        switch (vs.vatPct) {
          case 15: c431 += base; c411 = r2(c411 - iva); break;
          case 8:  c431 += base; c411 = r2(c411 - iva); break;
          case 5:  nc5  += base; c445 = r2(c445 - iva); break; // nc5 acumula para derivar c435
          case 0:  c433 += base; break;
        }
      }
    }

    // ── Adquisiciones con CT ─────────────────────────────────────────────────
    for (const p of purchases) {
      for (const line of p.lines ?? []) {
        // taxRate: 0 | 5 | 15 en el modelo de Purchase
        const base = line.subtotal  ?? 0;
        const iva  = line.taxAmount ?? 0;
        switch (line.taxRate) {
          case 15: c500 += base; break;
          case 5:  c540 += base; c560 += iva; break;
          // taxRate 0 no genera CT — no se acumula
        }
      }
    }

    // ── Redondeo y derivados de NC ────────────────────────────────────────────
    c401 = r2(c401); c425 = r2(c425); c403 = r2(c403); c404 = r2(c404);
    c411 = r2(Math.max(0, c411));  // no puede ser negativo en el form
    c445 = r2(Math.max(0, c445));
    c431 = r2(c431); c433 = r2(c433);
    c500 = r2(c500); c540 = r2(c540); c560 = r2(c560);
    c510 = r2(c510);

    // c435 = ventas 5% netas = 425 − NC emitidas con 5% (columna "Valor Neto" del formulario SRI)
    const c435 = r2(Math.max(0, c425 - nc5));
    // c550 = adquisiciones 5% netas = 540 − NC recibidas con 5% (NC en compras = 0 siempre por ahora)
    const c550 = r2(c540); // cuando existan NC en compras se restan aquí

    // ── Totales derivados ────────────────────────────────────────────────────
    const c408 = r2(c401 + c425 + c403 + c404);
    const c429 = r2(c411 + c445);

    // CT disponible: (IVA pagado en compras 15% + IVA pagado en compras 5%) - NC
    // Para 15%: el IVA pagado se calcula desde subtotal*0.15 (Purchase guarda taxAmount en linea)
    const ivaCompras15 = r2(purchases.reduce((s, p) =>
      s + (p.lines ?? []).filter(l => l.taxRate === 15)
                          .reduce((ls, l) => ls + (l.taxAmount ?? 0), 0), 0));

    const c529 = r2(ivaCompras15 + c560 - c510 - c550);

    // IVA cobrado en ventas = total IVA generado (menos lo de NC ya descontado arriba)
    const c601 = c429;

    // CT aplicable: min(c529, c601) — no puede exceder el IVA a pagar
    const c602 = r2(Math.min(Math.max(0, c529), c601));

    // c565 sugerido = max(0, c602 − c529).
    // Equivale a la fórmula oficial "564 − 529" donde c564 = c602 (CT a aplicar).
    // Es 0 cuando hay CT suficiente; positivo sólo si proporcionalidad reduce el CT por debajo del disponible.
    // El contador debe ingresar/confirmar este valor según su factor de proporcionalidad (Art. 66 LRTI).
    const c565Sugerido = r2(Math.max(0, c602 - c529));

    const c609 = r2(Math.max(0, c601 - c602));
    const c699 = r2(Math.max(0, c602 - c601));

    return {
      // Ventas (bruto)
      c401, c425, c403, c404, c408,
      // c435 = ventas 5% netas; c431 = NC 15% (base); c433 = NC 0%
      c431, c435, c433,
      // IVA ventas (neto, ya con NC descontadas)
      c411, c445, c429,
      // Adquisiciones (c540 = bruto, c550 = neto)
      c500, c510, c540, c550, c560,
      // CT
      c529,
      // Liquidacion base (sin override de 565)
      c601, c602,
      c565Sugerido,
      c565: c565Sugerido, // valor inicial = sugerido; puede ser sobreescrito por el usuario
      c609, c699,
      // Ajustes manuales
      c624: 0, c625: 0,
      // Meta
      periodoTipo: tipo,
      declaracionTipo: this.declaracionTipo(),
      mes: tipo === 'mensual' ? this.selectedMonth() : undefined,
      semestreNumero: tipo === 'semestral' ? this.selectedSemestre() : undefined,
    };
  }

  // ── XML Export ────────────────────────────────────────────────────────────

  generateXml(): void {
    const f = this.form104();
    if (!f) return;
    const liq = this.liquidacionActualizada();
    if (!liq) return;

    // El SRI no publica un XSD oficial de descarga para el Formulario 104 como
    // lo hace con comprobantes electronicos. El XML que genera el portal del SRI
    // es un formato interno que puede cambiar. Por esa razon generamos un XML
    // estructurado que sirve como respaldo de los valores calculados y puede
    // usarse como referencia al ingresar los datos en el portal del SRI.
    const year = this.selectedYear();
    const periodo = f.periodoTipo === 'mensual'
      ? `${String(f.mes).padStart(2, '0')}/${year}`
      : `S${f.semestreNumero}/${year}`;

    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      `<!-- Formulario 104 - Declaracion IVA - Referencia de valores calculados -->`,
      `<!-- NOTA: Este XML es un respaldo de referencia. Ingrese los valores en el portal del SRI (www.sri.gob.ec) -->`,
      `<formulario104>`,
      `  <encabezado>`,
      `    <tipo>${f.declaracionTipo}</tipo>`,
      `    <periodo>${periodo}</periodo>`,
      `  </encabezado>`,
      `  <ventasYOtrasOperaciones>`,
      `    <c401>${f.c401.toFixed(2)}</c401>`,
      `    <c425>${f.c425.toFixed(2)}</c425>`,
      `    <c403>${f.c403.toFixed(2)}</c403>`,
      `    <c404>${f.c404.toFixed(2)}</c404>`,
      `    <c408>${f.c408.toFixed(2)}</c408>`,
      `  </ventasYOtrasOperaciones>`,
      `  <notasCreditoVentas>`,
      `    <c431>${f.c431.toFixed(2)}</c431>`,
      `    <c435>${f.c435.toFixed(2)}</c435>`,
      `    <c433>${f.c433.toFixed(2)}</c433>`,
      `  </notasCreditoVentas>`,
      `  <ivaGeneradoEnVentas>`,
      `    <c411>${f.c411.toFixed(2)}</c411>`,
      `    <c445>${f.c445.toFixed(2)}</c445>`,
      `    <c429>${f.c429.toFixed(2)}</c429>`,
      `  </ivaGeneradoEnVentas>`,
      `  <adquisicionesYCreditoTributario>`,
      `    <c500>${f.c500.toFixed(2)}</c500>`,
      `    <c510>${f.c510.toFixed(2)}</c510>`,
      `    <c540>${f.c540.toFixed(2)}</c540>`,
      `    <c550>${f.c550.toFixed(2)}</c550>`,
      `    <c560>${f.c560.toFixed(2)}</c560>`,
      `    <c529>${f.c529.toFixed(2)}</c529>`,
      `  </adquisicionesYCreditoTributario>`,
      `  <liquidacion>`,
      `    <c601>${f.c601.toFixed(2)}</c601>`,
      `    <c602>${f.c602.toFixed(2)}</c602>`,
      `    <!-- c565 excluido: SRI no ha publicado XSD/instructivo XML para este casillero (liberado feb-2025) -->`,
      `    <!-- c565_sugerido_referencia: ${f.c565Sugerido.toFixed(2)} / c565_ingresado: ${liq.c565.toFixed(2)} -->`,
      `    <c609>${liq.c609.toFixed(2)}</c609>`,
      `    <c699>${liq.c699.toFixed(2)}</c699>`,
      `  </liquidacion>`,
      `  <!-- c624 y c625 excluidos: SRI no ha publicado XSD/instructivo XML para estos casilleros (liberados feb-2025) -->`,
      `  <!-- c624_referencia: ${liq.c624.toFixed(2)} / c625_referencia: ${liq.c625.toFixed(2)} -->`,
      `</formulario104>`,
    ].join('\n');

    const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `formulario104_${periodo.replace('/', '-')}_${f.declaracionTipo}.xml`;
    a.click();
    URL.revokeObjectURL(url);
    this.notifications.success('XML generado correctamente');
  }

  // ── Helpers de UI ─────────────────────────────────────────────────────────

  onEditable565Change(val: string): void {
    const n = parseFloat(val) || 0;
    this.editable565.set(Math.max(0, n));
  }

  onEditable624Change(val: string): void {
    const n = parseFloat(val) || 0;
    this.editable624.set(Math.max(0, n));
  }

  onEditable625Change(val: string): void {
    const n = parseFloat(val) || 0;
    this.editable625.set(Math.max(0, n));
  }

  printReport(): void { window.print(); }

  fmt(n: number | null | undefined): string {
    return (n ?? 0).toFixed(2);
  }
}

// ─── Utilidades ───────────────────────────────────────────────────────────────

function r2(n: number): number { return Math.round(n * 100) / 100; }

function toDate(ts: any): Date {
  if (!ts) return new Date(0);
  if (ts?.toDate) return ts.toDate();
  return new Date(ts);
}
