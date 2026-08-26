import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  CardModule, ButtonModule, GridModule, BadgeModule,
  SpinnerModule, TableModule, FormModule, TooltipModule, CalloutComponent,
  InputGroupComponent, InputGroupTextDirective
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';

import { CustomersService }  from './services/customers.service';
import { SettingsService }   from '../settings/services/settings.service';
import { NotificationService } from '../../core/services/notification.service';
import { Customer }          from './models/customer.interface';
import { PaymentTerm }       from '../settings/models/settings.interfaces';
import { take } from 'rxjs/operators';

@Component({
  selector: 'app-customers-list',
  standalone: true,
  templateUrl: './customers-list.component.html',
  imports: [
    CommonModule,
    CardModule, ButtonModule, GridModule, BadgeModule, SpinnerModule,
    TableModule, FormModule, TooltipModule, IconModule, CalloutComponent,
    InputGroupComponent, InputGroupTextDirective
  ]
})
export class CustomersListComponent implements OnInit {
  private svc           = inject(CustomersService);
  private settingsSvc   = inject(SettingsService);
  private notifications = inject(NotificationService);
  private router        = inject(Router);

  customers    = signal<Customer[]>([]);
  paymentTerms = signal<PaymentTerm[]>([]);
  loading      = signal(true);
  searchTerm   = signal('');
  showInactive = signal(false);

  filtered = computed(() => {
    const term = this.searchTerm().toLowerCase().trim();
    let list = this.customers();
    if (!this.showInactive()) list = list.filter(c => c.isActive);
    if (!term) return list;
    return list.filter(c =>
      c.name.toLowerCase().includes(term)      ||
      c.legalName.toLowerCase().includes(term) ||
      c.taxId.includes(term)                   ||
      c.code.includes(term)                    ||
      (c.phone1 ?? '').includes(term)
    );
  });

  ngOnInit(): void {
    this.svc.getCustomers().subscribe({
      next: list => { this.customers.set(list); this.loading.set(false); },
      error: ()  => { this.notifications.error('Error cargando clientes'); this.loading.set(false); }
    });
    this.settingsSvc.getPaymentTerms().pipe(take(1)).subscribe({
      next: terms => this.paymentTerms.set(terms)
    });
  }

  openNew(): void {
    this.router.navigate(['/customers', 'new']);
  }

  openEdit(c: Customer): void {
    this.router.navigate(['/customers', c.id, 'edit']);
  }

  async toggleActive(c: Customer): Promise<void> {
    try {
      await this.svc.toggleActive(c.id, !c.isActive);
      this.notifications.success(c.isActive ? 'Cliente desactivado' : 'Cliente activado');
    } catch {
      this.notifications.error('Error al cambiar estado');
    }
  }

  async delete(c: Customer): Promise<void> {
    const ok = await this.notifications.confirm({
      title: `¿Eliminar el cliente "${c.name}"?`,
      confirmText: 'Sí, eliminar',
      cancelText: 'Cancelar',
      icon: 'warning',
      danger: true
    });
    if (!ok) return;
    try {
      await this.svc.deleteCustomer(c.id);
      this.notifications.success('Cliente eliminado');
    } catch {
      this.notifications.error('Error al eliminar cliente');
    }
  }

  getPaymentTermLabel(code: string): string {
    return this.paymentTerms().find(t => t.code === code)?.name ?? code;
  }

  trackById(_: number, item: { id: string }): string { return item.id; }
}
