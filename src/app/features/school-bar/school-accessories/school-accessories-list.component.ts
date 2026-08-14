import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  CardModule, ButtonModule, GridModule, BadgeModule, TableModule,
  FormModule, AlertModule, SpinnerModule
} from '@coreui/angular';

import { SchoolAccessoryService } from '../services/school-accessory.service';
import {
  SchoolAccessory, AccessoryStatus,
  ACCESSORY_CATALOG, ACCESSORY_PRICES
} from '../models';

@Component({
  selector: 'app-school-accessories-list',
  standalone: true,
  imports: [
    CommonModule,
    CardModule, ButtonModule, GridModule, BadgeModule, TableModule,
    FormModule, AlertModule, SpinnerModule
  ],
  templateUrl: './school-accessories-list.component.html'
})
export class SchoolAccessoriesListComponent implements OnInit {
  private accessoryService = inject(SchoolAccessoryService);

  accessories  = signal<SchoolAccessory[]>([]);
  processingId = signal<string | null>(null);
  errorMsg     = signal<string | null>(null);

  readonly catalog = ACCESSORY_CATALOG;
  readonly prices  = ACCESSORY_PRICES;

  readonly statusColor: Record<AccessoryStatus, string> = {
    requested:  'warning',
    paid:       'info',
    configured: 'primary',
    delivered:  'success',
    lost:       'danger',
    revoked:    'secondary'
  };

  readonly statusLabel: Record<AccessoryStatus, string> = {
    requested:  'Solicitado',
    paid:       'Pagado',
    configured: 'Configurado',
    delivered:  'Entregado',
    lost:       'Perdido',
    revoked:    'Revocado'
  };

  ngOnInit(): void {
    this.accessoryService.getPendingAccessories().subscribe(a => this.accessories.set(a));
  }

  async confirmPayment(acc: SchoolAccessory): Promise<void> {
    this.processingId.set(acc.id!);
    try {
      await this.accessoryService.confirmPayment(acc.id!);
    } finally {
      this.processingId.set(null);
    }
  }

  async configureNfc(acc: SchoolAccessory): Promise<void> {
    const nfcUid = prompt('Ingrese el UID NFC del accesorio:');
    if (!nfcUid?.trim()) return;
    this.processingId.set(acc.id!);
    try {
      await this.accessoryService.configureNfc(acc.id!, nfcUid.trim());
    } finally {
      this.processingId.set(null);
    }
  }

  async deliver(acc: SchoolAccessory): Promise<void> {
    if (!confirm(`¿Marcar como entregado el accesorio de ${acc.studentName}?`)) return;
    this.processingId.set(acc.id!);
    try {
      await this.accessoryService.markDelivered(acc.id!);
    } finally {
      this.processingId.set(null);
    }
  }
}
