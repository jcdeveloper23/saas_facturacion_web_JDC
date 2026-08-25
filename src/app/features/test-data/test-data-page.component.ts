import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  GridModule,
  CardComponent, CardBodyComponent, CardHeaderComponent,
  ButtonDirective, SpinnerComponent, BadgeComponent,
  CalloutComponent, ProgressComponent,
  ListGroupDirective, ListGroupItemDirective,
} from '@coreui/angular';
import { IconDirective, IconSetService } from '@coreui/icons-angular';
import { iconSubset } from '../../icons/icon-subset';

import { TestDataService, GenerationResult } from './services/test-data.service';

interface EntityCard {
  key:     'families' | 'products' | 'customers' | 'suppliers' | 'invoices' | 'purchases';
  label:   string;
  icon:    string;
  color:   string;
  count:   number;
  loading: boolean;
  limit?:  number;
}

interface LogEntry {
  time:    string;
  type:    'success' | 'error' | 'info';
  message: string;
}

@Component({
  selector: 'app-test-data-page',
  templateUrl: './test-data-page.component.html',
  standalone: true,
  imports: [
    CommonModule,
    GridModule,
    CardComponent, CardBodyComponent, CardHeaderComponent,
    ButtonDirective, SpinnerComponent, BadgeComponent,
    CalloutComponent, ProgressComponent,
    ListGroupDirective, ListGroupItemDirective,
    IconDirective,
  ],
})
export class TestDataPageComponent implements OnInit {
  private svc     = inject(TestDataService);
  private iconSet = inject(IconSetService);

  statsLoading = signal(true);
  log          = signal<LogEntry[]>([]);

  cards = signal<EntityCard[]>([
    { key: 'families',  label: 'Familias',           icon: 'cilList',       color: 'primary',   count: 0, loading: false, limit: 25  },
    { key: 'products',  label: 'Artículos',           icon: 'cilTag',        color: 'info',      count: 0, loading: false, limit: 49  },
    { key: 'customers', label: 'Clientes',            icon: 'cilPeople',     color: 'success',   count: 0, loading: false },
    { key: 'suppliers', label: 'Proveedores',         icon: 'cilTruck',      color: 'warning',   count: 0, loading: false },
    { key: 'invoices',  label: 'Facturas de Venta',   icon: 'cilDescription',color: 'danger',    count: 0, loading: false },
    { key: 'purchases', label: 'Facturas de Compra',  icon: 'cilCart',       color: 'dark',      count: 0, loading: false },
  ]);

  constructor() {
    this.iconSet.icons = { ...iconSubset };
  }

  async ngOnInit(): Promise<void> {
    await this.loadStats();
  }

  async loadStats(): Promise<void> {
    this.statsLoading.set(true);
    try {
      const stats = await this.svc.getStats();
      this.cards.update(cards => cards.map(c => ({ ...c, count: stats[c.key] })));
    } catch (e: any) {
      this.addLog('error', `Error cargando estadísticas: ${e?.message ?? e}`);
    } finally {
      this.statsLoading.set(false);
    }
  }

  async generate(key: EntityCard['key']): Promise<void> {
    this.setLoading(key, true);
    let result: GenerationResult;
    try {
      switch (key) {
        case 'families':  result = await this.svc.generateFamilies(10);  break;
        case 'products':  result = await this.svc.generateProducts(10);  break;
        case 'customers': result = await this.svc.generateCustomers(10); break;
        case 'suppliers': result = await this.svc.generateSuppliers(10); break;
        case 'invoices':  result = await this.svc.generateInvoices(10);  break;
        case 'purchases': result = await this.svc.generatePurchases(10); break;
      }

      for (const msg of result.messages) {
        this.addLog(result.errors > 0 && result.created === 0 ? 'error' : 'success', msg);
      }

      await this.loadStats();
    } catch (e: any) {
      this.addLog('error', `Error inesperado en "${key}": ${e?.message ?? e}`);
    } finally {
      this.setLoading(key, false);
    }
  }

  clearLog(): void {
    this.log.set([]);
  }

  isAtLimit(card: EntityCard): boolean {
    return card.limit !== undefined && card.count >= card.limit;
  }

  private setLoading(key: EntityCard['key'], loading: boolean): void {
    this.cards.update(cards => cards.map(c => c.key === key ? { ...c, loading } : c));
  }

  private addLog(type: 'success' | 'error' | 'info', message: string): void {
    const time = new Date().toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    this.log.update(entries => [{ time, type, message }, ...entries].slice(0, 100));
  }
}
