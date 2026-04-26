import {
  Component, OnInit, OnDestroy, inject, signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import {
  CardModule, ButtonModule, GridModule, SpinnerModule,
  BadgeModule, TableModule, FormModule, AlertModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';

import { PosCashService }     from '../services/pos-cash.service';
import { SettingsService }    from '../../settings/services/settings.service';
import { NotificationService } from '../../../core/services/notification.service';
import { PosTerminal }        from '../models/pos.interface';
import { DocumentSeries, Warehouse } from '../../settings/models/settings.interfaces';

interface TerminalForm {
  name:               string;
  warehouseCode:      string;
  seriesCode:         string;
  defaultCustomerTaxId: string;
  // Hardware
  paperWidth:         58 | 80;
  sinComandos:        boolean;
  cutCommand:         string;
  openDrawerCommand:  string;
  cashDrawerEnabled:  boolean;
  barcodeEnabled:     boolean;
  printerType:        'usb' | 'network' | 'browser';
  printerIp:          string;
  printerPort:        number;
}

@Component({
  selector: 'app-pos-terminals',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    CardModule, ButtonModule, GridModule, SpinnerModule,
    BadgeModule, TableModule, FormModule, AlertModule,
    IconModule
  ],
  templateUrl: './pos-terminals.component.html',
  styleUrl: './pos-terminals.component.scss'
})
export class PosTerminalsComponent implements OnInit, OnDestroy {
  private destroy$      = new Subject<void>();
  private cashService   = inject(PosCashService);
  private settings      = inject(SettingsService);
  private notify        = inject(NotificationService);
  private router        = inject(Router);

  readonly terminals    = signal<PosTerminal[]>([]);
  readonly series       = signal<DocumentSeries[]>([]);
  readonly warehouses   = signal<Warehouse[]>([]);
  readonly loading      = signal(true);
  readonly saving       = signal(false);
  readonly editing      = signal<PosTerminal | null>(null);

  readonly inUseCount = computed(() => this.terminals().filter(t => !!t.currentSessionId).length);
  readonly freeCount  = computed(() => this.terminals().filter(t => !t.currentSessionId).length);

  showForm = false;
  form: TerminalForm = this.emptyForm();

  ngOnInit(): void {
    this.cashService.getTerminals()
      .pipe(takeUntil(this.destroy$))
      .subscribe(t => { this.terminals.set(t); this.loading.set(false); });

    this.settings.getDocumentSeries()
      .pipe(takeUntil(this.destroy$))
      .subscribe(s => this.series.set(s.filter(x => x.documentType === 'invoice')));

    this.settings.getWarehouses()
      .pipe(takeUntil(this.destroy$))
      .subscribe(w => this.warehouses.set(w.filter(x => x.isActive)));
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  openNew(): void { this.form = this.emptyForm(); this.editing.set(null); this.showForm = true; }

  openEdit(t: PosTerminal): void {
    this.editing.set(t);
    this.form = {
      name:                t.name,
      warehouseCode:       t.warehouseCode,
      seriesCode:          t.seriesCode ?? '',
      defaultCustomerTaxId: t.defaultCustomerTaxId ?? '9999999999999',
      paperWidth:          t.paperWidth ?? 80,
      sinComandos:         t.sinComandos ?? false,
      cutCommand:          t.cutCommand ?? '',
      openDrawerCommand:   t.openDrawerCommand ?? '',
      cashDrawerEnabled:   t.cashDrawerEnabled ?? false,
      barcodeEnabled:      t.barcodeEnabled ?? true,
      printerType:         t.printerType ?? 'browser',
      printerIp:           t.printerIp ?? '',
      printerPort:         t.printerPort ?? 9100,
    };
    this.showForm = true;
  }

  async save(): Promise<void> {
    if (this.saving()) return;
    if (!this.form.name.trim()) { this.notify.warning('Campo requerido', 'Ingresa un nombre para el terminal'); return; }
    if (!this.form.warehouseCode.trim()) { this.notify.warning('Campo requerido', 'Ingresa el código de bodega'); return; }
    if (!this.form.seriesCode.trim()) { this.notify.warning('Campo requerido', 'Selecciona una serie de documentos'); return; }

    this.saving.set(true);
    try {
      const data: Omit<PosTerminal, 'id' | 'createdAt' | 'updatedAt' | 'numTickets'> = {
        name:                this.form.name.trim(),
        warehouseCode:       this.form.warehouseCode.trim().toUpperCase(),
        seriesCode:          this.form.seriesCode.trim(),
        defaultCustomerTaxId: this.form.defaultCustomerTaxId || null,
        paperWidth:          this.form.paperWidth,
        sinComandos:         this.form.sinComandos,
        cutCommand:          (!this.form.sinComandos && this.form.cutCommand) ? this.form.cutCommand : null,
        openDrawerCommand:   (!this.form.sinComandos && this.form.openDrawerCommand) ? this.form.openDrawerCommand : null,
        cashDrawerEnabled:   this.form.cashDrawerEnabled,
        barcodeEnabled:      this.form.barcodeEnabled,
        printerType:         this.form.sinComandos ? 'browser' : this.form.printerType,
        printerIp:           this.form.printerType === 'network' ? (this.form.printerIp || null) : null,
        printerPort:         this.form.printerType === 'network' ? (this.form.printerPort || null) : null,
        isActive:            true,
      };

      const editing = this.editing();
      if (editing) {
        await this.cashService.updateTerminal(editing.id, data);
        this.notify.success('Terminal actualizado', data.name);
      } else {
        await this.cashService.createTerminal(data);
        this.notify.success('Terminal creado', data.name);
      }
      this.showForm = false;
    } catch (err: any) {
      this.notify.error('Error guardando terminal', err.message);
    } finally {
      this.saving.set(false);
    }
  }

  async deactivate(t: PosTerminal): Promise<void> {
    if (!confirm(`¿Desactivar terminal "${t.name}"?`)) return;
    await this.cashService.updateTerminal(t.id, { isActive: false });
    this.notify.success('Terminal desactivado', t.name);
  }

  cancel(): void { this.showForm = false; this.editing.set(null); }

  printerLabel(t: PosTerminal): string {
    if (t.sinComandos)              return 'Navegador';
    if (t.printerType === 'usb')    return 'USB';
    if (t.printerType === 'network') return `Red ${t.printerIp ? '· ' + t.printerIp : ''}`;
    return 'Navegador';
  }

  private emptyForm(): TerminalForm {
    return {
      name: '', warehouseCode: '', seriesCode: '',
      defaultCustomerTaxId: '9999999999999',
      paperWidth: 80, sinComandos: true,
      cutCommand: '', openDrawerCommand: '',
      cashDrawerEnabled: false, barcodeEnabled: true,
      printerType: 'browser', printerIp: '', printerPort: 9100,
    };
  }
}
