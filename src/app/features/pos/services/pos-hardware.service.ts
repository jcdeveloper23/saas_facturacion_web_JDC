import { Injectable, inject, NgZone, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { PosTerminal } from '../models/pos.interface';

/**
 * PosHardwareService — gestiona escáner de código de barras, cajón portamonedas
 * e impresora térmica vía ESC/POS.
 *
 * ESCÁNER: Los lectores de código de barras emulan teclado. Escriben muy rápido
 * (< 50 ms entre chars) y terminan con Enter. Este servicio detecta esa velocidad
 * para distinguir escáner de escritura manual.
 *
 * IMPRESORA: Soporta impresión vía Web Serial API (Chrome/Edge) o fallback a
 * window.print() con hoja de estilo especial para ticket.
 *
 * CAJÓN: Se abre enviando comando ESC/POS a la impresora (generalmente ESC p).
 */
@Injectable({ providedIn: 'root' })
export class PosHardwareService {
  private zone = inject(NgZone);

  // ── Barcode scanner ────────────────────────────────────────────────────────
  readonly barcodeScanned$ = new Subject<string>();
  private barcodeBuffer    = '';
  private barcodeTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly SCAN_THRESHOLD_MS = 50; // ms entre caracteres para considerarse escáner
  private scannerActive = false;

  // ── Serial port (impresora / cajón) ───────────────────────────────────────
  private serialPort: any = null; // Web Serial API (SerialPort)
  readonly printerConnected = signal(false);

  // ─── Barcode Scanner ───────────────────────────────────────────────────────

  enableBarcodeScanner(): void {
    if (this.scannerActive) return;
    this.scannerActive = true;
    this.zone.runOutsideAngular(() => {
      document.addEventListener('keydown', this.onKeyDown.bind(this), true);
    });
  }

  disableBarcodeScanner(): void {
    if (!this.scannerActive) return;
    this.scannerActive = false;
    document.removeEventListener('keydown', this.onKeyDown.bind(this), true);
    if (this.barcodeTimer) clearTimeout(this.barcodeTimer);
    this.barcodeBuffer = '';
  }

  private lastKeyTime = 0;

  private onKeyDown(event: KeyboardEvent): void {
    // Ignorar si el foco está en un input/textarea que no sea el POS
    const tag = (event.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      // Si el input tiene data-barcode-target, procesamos igual
      const el = event.target as HTMLElement;
      if (!el.dataset['barcodeTarget']) return;
    }

    const now    = Date.now();
    const deltaT = now - this.lastKeyTime;
    this.lastKeyTime = now;

    if (event.key === 'Enter') {
      const code = this.barcodeBuffer.trim();
      if (code.length >= 3) {
        this.zone.run(() => this.barcodeScanned$.next(code));
      }
      this.barcodeBuffer = '';
      if (this.barcodeTimer) clearTimeout(this.barcodeTimer);
      return;
    }

    // Si es impresión rápida (escáner) o es el primer caracter
    if (deltaT < this.SCAN_THRESHOLD_MS || this.barcodeBuffer.length === 0) {
      if (event.key.length === 1) this.barcodeBuffer += event.key;
    } else {
      // Demasiado lento => no es escáner, resetear
      this.barcodeBuffer = event.key.length === 1 ? event.key : '';
    }

    // Timeout de seguridad: limpiar buffer si no termina en 500ms
    if (this.barcodeTimer) clearTimeout(this.barcodeTimer);
    this.barcodeTimer = setTimeout(() => { this.barcodeBuffer = ''; }, 500);
  }

  // ─── Serial / Printer ──────────────────────────────────────────────────────

  /** Conecta a una impresora térmica vía Web Serial API */
  async connectPrinter(): Promise<boolean> {
    if (!('serial' in navigator)) {
      console.warn('[PosHardware] Web Serial API no disponible. Usando fallback de navegador.');
      return false;
    }
    try {
      this.serialPort = await (navigator as any).serial.requestPort();
      await this.serialPort!.open({ baudRate: 9600 });
      this.printerConnected.set(true);
      return true;
    } catch (err) {
      console.error('[PosHardware] Error conectando impresora:', err);
      return false;
    }
  }

  async disconnectPrinter(): Promise<void> {
    if (this.serialPort) {
      await this.serialPort.close().catch(() => {});
      this.serialPort = null;
    }
    this.printerConnected.set(false);
  }

  /** Abre el cajón portamonedas usando el comandoapertura configurado en el terminal */
  async openCashDrawer(terminal: PosTerminal): Promise<void> {
    if (!terminal.openDrawerCommand) return;
    const cmd = this.parseEscPosCommand(terminal.openDrawerCommand);
    await this.sendRaw(cmd);
  }

  /** Imprime un ticket: ESC/POS si hay puerto serial y sin_comandos=false, si no navegador */
  async printTicket(html: string, terminal?: PosTerminal): Promise<void> {
    if (!terminal?.sinComandos && this.printerConnected() && this.serialPort) {
      const escpos = this.htmlToEscPos(html, terminal?.paperWidth ?? 80, terminal?.cutCommand);
      await this.sendRaw(escpos);
    } else {
      this.printBrowser(html, terminal?.paperWidth ?? 80);
    }
  }

  private async sendRaw(data: Uint8Array): Promise<void> {
    if (!this.serialPort) return;
    try {
      const writer = this.serialPort.writable!.getWriter();
      await writer.write(data);
      writer.releaseLock();
    } catch (err) {
      console.error('[PosHardware] Error enviando datos a impresora:', err);
    }
  }

  /** Fallback: imprime usando window.print() con hoja de estilo para ticket */
  printBrowser(content: string, paperWidth: 58 | 80 = 80): void {
    const w = `${paperWidth}mm`;
    const win = window.open('', '_blank', 'width=400,height=600');
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Ticket</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Courier New', monospace; font-size: 11px; width: ${w}; }
          .ticket { width: ${w}; padding: 4mm; }
          .center { text-align: center; }
          .right  { text-align: right; }
          .bold   { font-weight: bold; }
          .sep    { border-top: 1px dashed #000; margin: 4px 0; }
          .row    { display: flex; justify-content: space-between; }
          .total  { font-size: 14px; font-weight: bold; }
          @media print {
            @page { margin: 0; size: ${w} auto; }
            body { width: ${w}; }
          }
        </style>
      </head>
      <body>
        <div class="ticket">${content}</div>
        <script>window.onload = () => { window.print(); window.close(); }<\/script>
      </body>
      </html>
    `);
    win.document.close();
  }

  /**
   * Parsea un comando ESC/POS en dos formatos:
   *  - Decimal con puntos (FacturaScripts): "27.105"  → [0x1B, 0x69]
   *  - Hex con escapes:                    "\x1b\x69" → [0x1B, 0x69]
   */
  private parseEscPosCommand(cmd: string): Uint8Array {
    const trimmed = cmd.trim();

    // Formato decimal: solo dígitos y puntos (ej. "27.105" o "27.112.48.55.121")
    if (/^[\d.]+$/.test(trimmed)) {
      return new Uint8Array(trimmed.split('.').map(n => parseInt(n, 10)));
    }

    // Formato hex con \xNN
    const bytes: number[] = [];
    let i = 0;
    while (i < trimmed.length) {
      if (trimmed[i] === '\\' && trimmed[i + 1] === 'x') {
        bytes.push(parseInt(trimmed.substring(i + 2, i + 4), 16));
        i += 4;
      } else {
        bytes.push(trimmed.charCodeAt(i));
        i++;
      }
    }
    return new Uint8Array(bytes);
  }

  /** Convierte HTML simple a buffer ESC/POS usando el comandocorte del terminal */
  private htmlToEscPos(html: string, _width: number, cutCommand?: string | null): Uint8Array {
    const encoder = new TextEncoder();
    const init = new Uint8Array([0x1B, 0x40]); // ESC @ — inicializar
    // Usar comandocorte configurado o fallback al corte parcial estándar
    const cut = cutCommand
      ? this.parseEscPosCommand(cutCommand)
      : new Uint8Array([0x1D, 0x56, 0x41, 0x10]); // GS V A — corte parcial

    // Extraer texto plano del HTML para ESC/POS básico
    const text = html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/?(p|div|tr|th)[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ');

    const textBytes = encoder.encode(text + '\n\n\n');
    const result = new Uint8Array(init.length + textBytes.length + cut.length);
    result.set(init);
    result.set(textBytes, init.length);
    result.set(cut, init.length + textBytes.length);
    return result;
  }

  // ─── Ticket HTML builder ───────────────────────────────────────────────────

  buildTicketHtml(data: {
    companyName: string;
    companyTaxId: string;
    terminalName: string;
    ticketNumber: number;
    date: Date;
    cashier: string;
    customer: string;
    lines: { name: string; qty: number; price: number; total: number }[];
    subtotal: number;
    vatAmount: number;
    total: number;
    payments: { label: string; amount: number }[];
    change: number;
  }): string {
    const dateStr = data.date.toLocaleString('es-EC');

    const lineRows = data.lines.map(l => {
      const name  = l.name.substring(0, 24).padEnd(24);
      const qty   = `${l.qty}x`.padStart(4);
      const price = `$${l.price.toFixed(2)}`.padStart(7);
      const tot   = `$${l.total.toFixed(2)}`.padStart(7);
      return `<div class="row"><span>${name}</span><span>${qty}${price}${tot}</span></div>`;
    }).join('');

    const payRows = data.payments.map(p =>
      `<div class="row"><span>${p.label}</span><span>$${p.amount.toFixed(2)}</span></div>`
    ).join('');

    return `
      <div class="center bold">${data.companyName}</div>
      <div class="center">RUC: ${data.companyTaxId}</div>
      <div class="sep"></div>
      <div class="row"><span>Terminal:</span><span>${data.terminalName}</span></div>
      <div class="row"><span>Ticket:</span><span>#${data.ticketNumber}</span></div>
      <div class="row"><span>Fecha:</span><span>${dateStr}</span></div>
      <div class="row"><span>Cajero:</span><span>${data.cashier}</span></div>
      <div class="row"><span>Cliente:</span><span>${data.customer}</span></div>
      <div class="sep"></div>
      ${lineRows}
      <div class="sep"></div>
      <div class="row"><span>Subtotal</span><span>$${data.subtotal.toFixed(2)}</span></div>
      <div class="row"><span>IVA</span><span>$${data.vatAmount.toFixed(2)}</span></div>
      <div class="row total"><span>TOTAL</span><span>$${data.total.toFixed(2)}</span></div>
      <div class="sep"></div>
      ${payRows}
      <div class="row"><span>Cambio</span><span>$${data.change.toFixed(2)}</span></div>
      <div class="sep"></div>
      <div class="center">¡Gracias por su compra!</div>
    `;
  }
}
