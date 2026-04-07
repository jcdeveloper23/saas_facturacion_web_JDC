import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { map, switchMap, tap, catchError } from 'rxjs/operators';
import { Subject, takeUntil, of } from 'rxjs';
import {
  CardModule, ButtonModule, GridModule, BadgeModule,
  SpinnerModule, TableModule, FormModule, TooltipModule,
  InputGroupComponent, InputGroupTextDirective, NavModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';
import { take } from 'rxjs/operators';

import { PersonasService }   from './services/personas.service';
import { SettingsService }   from '../settings/services/settings.service';
import { NotificationService } from '../../core/services/notification.service';
import {
  Person, PersonRole,
  ROLE_LABELS, ROLE_PLURAL_LABELS, ROLE_COLORS,
  getPersonCode
} from './models/person.interface';
import { PaymentTerm } from '../settings/models/settings.interfaces';

@Component({
  selector: 'app-personas-list',
  standalone: true,
  templateUrl: './personas-list.component.html',
  imports: [
    CommonModule, RouterLink,
    CardModule, ButtonModule, GridModule, BadgeModule, SpinnerModule,
    TableModule, FormModule, TooltipModule, IconModule,
    InputGroupComponent, InputGroupTextDirective, NavModule
  ]
})
export class PersonasListComponent implements OnInit, OnDestroy {
  private svc           = inject(PersonasService);
  private settingsSvc   = inject(SettingsService);
  private notifications = inject(NotificationService);
  private router        = inject(Router);
  private route         = inject(ActivatedRoute);
  private destroy$      = new Subject<void>();

  personas     = signal<Person[]>([]);
  paymentTerms = signal<PaymentTerm[]>([]);
  loading      = signal(true);
  searchTerm   = signal('');
  showInactive = signal(false);
  roleFilter   = signal<PersonRole | null>(null);

  readonly ROLE_LABELS       = ROLE_LABELS;
  readonly ROLE_PLURAL_LABELS = ROLE_PLURAL_LABELS;
  readonly ROLE_COLORS       = ROLE_COLORS;
  readonly roleOptions: { role: PersonRole | null; label: string }[] = [
    { role: null,       label: 'Todos' },
    { role: 'customer', label: 'Clientes' },
    { role: 'supplier', label: 'Proveedores' },
    { role: 'employee', label: 'Empleados' },
    { role: 'contact',  label: 'Contactos' },
    { role: 'other',    label: 'Otros' }
  ];

  pageTitle = computed((): string => {
    const role = this.roleFilter();
    return role ? ROLE_PLURAL_LABELS[role] : 'Personas';
  });

  pageSubtitle = computed((): string => {
    const role = this.roleFilter();
    if (role === 'customer') return 'Gestión de clientes, fichas fiscales y condiciones comerciales';
    if (role === 'supplier') return 'Gestión de proveedores y condiciones de compra';
    if (role === 'employee') return 'Gestión de empleados y datos de RRHH';
    return 'Gestión centralizada de personas: clientes, proveedores y empleados';
  });

  showCodeColumn = computed(() => this.roleFilter() !== null && this.roleFilter() !== 'contact' && this.roleFilter() !== 'other');
  showPaymentColumn = computed(() => this.roleFilter() === 'customer' || this.roleFilter() === 'supplier');
  showPositionColumn = computed(() => this.roleFilter() === 'employee');

  filtered = computed(() => {
    const term = this.searchTerm().toLowerCase().trim();
    let list = this.personas();
    if (!this.showInactive()) list = list.filter(p => p.isActive);
    if (term) {
      list = list.filter(p =>
        p.name.toLowerCase().includes(term)         ||
        p.legalName.toLowerCase().includes(term)    ||
        p.taxId.includes(term)                      ||
        (p.phone1 ?? '').includes(term)             ||
        (p.customerData?.code ?? '').includes(term) ||
        (p.supplierData?.code ?? '').includes(term) ||
        (p.employeeData?.code ?? '').includes(term) ||
        (p.employeeData?.position ?? '').toLowerCase().includes(term)
      );
    }
    // Sort client-side by name (avoids Firestore composite index requirement)
    return [...list].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  });

  ngOnInit(): void {
    this.settingsSvc.getPaymentTerms().pipe(take(1)).subscribe({
      next: terms => this.paymentTerms.set(terms)
    });

    this.route.queryParams.pipe(
      map(p => (p['role'] as PersonRole) || null),
      tap(role => {
        this.roleFilter.set(role);
        this.personas.set([]);   // clear stale data before new query
        this.loading.set(true);
      }),
      switchMap(role =>
        this.svc.getPersonas(role).pipe(
          catchError(err => {
            console.error('[PersonasList] Firestore error:', err);
            this.notifications.error('Error cargando personas: ' + (err?.message ?? err));
            this.loading.set(false);
            return of([]); // keeps the stream alive for next tab switch
          })
        )
      ),
      takeUntil(this.destroy$)
    ).subscribe({
      next: list => { this.personas.set(list); this.loading.set(false); }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  openNew(): void {
    const role = this.roleFilter();
    this.router.navigate(['/personas', 'new'], { queryParams: role ? { role } : {} });
  }

  openEdit(p: Person): void {
    this.router.navigate(['/personas', p.id, 'edit']);
  }

  switchRole(role: PersonRole | null): void {
    this.router.navigate(['/personas'], { queryParams: role ? { role } : {} });
  }

  async toggleActive(p: Person): Promise<void> {
    try {
      await this.svc.toggleActive(p.id, !p.isActive);
      this.notifications.success(p.isActive ? 'Persona desactivada' : 'Persona activada');
    } catch {
      this.notifications.error('Error al cambiar estado');
    }
  }

  async delete(p: Person): Promise<void> {
    if (!confirm(`¿Eliminar "${p.name}"?`)) return;
    try {
      await this.svc.deletePerson(p.id);
      this.notifications.success('Persona eliminada');
    } catch {
      this.notifications.error('Error al eliminar');
    }
  }

  getCode(p: Person): string {
    return getPersonCode(p, this.roleFilter());
  }

  getPaymentTerm(p: Person): string {
    const role = this.roleFilter();
    const code = role === 'supplier'
      ? p.supplierData?.paymentTermCode
      : p.customerData?.paymentTermCode;
    if (!code) return '—';
    return this.paymentTerms().find(t => t.code === code)?.name ?? code;
  }

  isConsumidorFinal(p: Person): boolean {
    return p.taxId === '9999999999999';
  }

  trackById(_: number, item: { id: string }): string { return item.id; }
}
