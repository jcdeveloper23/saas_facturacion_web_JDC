import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subject, takeUntil, catchError, of } from 'rxjs';
import {
  CardModule, ButtonModule, GridModule, BadgeModule, SpinnerModule,
  TableModule, FormModule, TooltipModule, NavModule,
  InputGroupComponent, InputGroupTextDirective, CalloutComponent
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';

import { ProductsService }      from './services/products.service';
import { FamiliesService }      from './services/families.service';
import { NotificationService }  from '../../core/services/notification.service';
import { Product, Family, isLowStock, isOutOfStock } from './models/product.interface';

type ListFilter = 'all' | 'product' | 'service' | 'low_stock' | 'inactive';

@Component({
  selector: 'app-products-list',
  standalone: true,
  templateUrl: './products-list.component.html',
  imports: [
    CommonModule,
    CardModule, ButtonModule, GridModule, BadgeModule, SpinnerModule,
    TableModule, FormModule, TooltipModule, IconModule, NavModule,
    InputGroupComponent, InputGroupTextDirective, CalloutComponent
  ]
})
export class ProductsListComponent implements OnInit, OnDestroy {
  private svc           = inject(ProductsService);
  private familiesSvc   = inject(FamiliesService);
  private notifications = inject(NotificationService);
  private router        = inject(Router);
  private destroy$      = new Subject<void>();

  products    = signal<Product[]>([]);
  families    = signal<Family[]>([]);
  loading     = signal(true);
  searchTerm  = signal('');
  typeFilter  = signal<ListFilter>('all');
  familyId    = signal<string>('');

  readonly filterOptions: { value: ListFilter; label: string }[] = [
    { value: 'all',       label: 'Todos' },
    { value: 'product',   label: 'Productos' },
    { value: 'service',   label: 'Servicios' },
    { value: 'low_stock', label: 'Stock bajo' },
    { value: 'inactive',  label: 'Inactivos' }
  ];

  filtered = computed(() => {
    const term    = this.searchTerm().toLowerCase().trim();
    const type    = this.typeFilter();
    const famId   = this.familyId();
    let list      = this.products();

    // type / status filter
    if (type === 'product')   list = list.filter(p => p.type === 'product' && p.isActive);
    else if (type === 'service')   list = list.filter(p => p.type === 'service' && p.isActive);
    else if (type === 'low_stock') list = list.filter(p => p.isActive && isLowStock(p));
    else if (type === 'inactive')  list = list.filter(p => !p.isActive);
    else                           list = list.filter(p => p.isActive);

    // family filter
    if (famId) list = list.filter(p => p.familyId === famId);

    // text search
    if (term) {
      list = list.filter(p =>
        p.sku.toLowerCase().includes(term)           ||
        p.name.toLowerCase().includes(term)          ||
        (p.barcode ?? '').includes(term)             ||
        (p.partNumber ?? '').toLowerCase().includes(term) ||
        (p.familyName ?? '').toLowerCase().includes(term) ||
        (p.manufacturerName ?? '').toLowerCase().includes(term)
      );
    }

    return [...list].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  });

  // Stats
  stats = computed(() => {
    const all = this.products();
    return {
      total:    all.filter(p => p.isActive).length,
      products: all.filter(p => p.isActive && p.type === 'product').length,
      services: all.filter(p => p.isActive && p.type === 'service').length,
      lowStock: all.filter(p => p.isActive && isLowStock(p)).length,
      outOfStock: all.filter(p => p.isActive && isOutOfStock(p)).length
    };
  });

  ngOnInit(): void {
    this.svc.getProducts().pipe(
      catchError(err => {
        console.error('[ProductsList] Firestore error:', err);
        this.notifications.error('Error cargando artículos: ' + (err?.message ?? err));
        this.loading.set(false);
        return of([]);
      }),
      takeUntil(this.destroy$)
    ).subscribe(list => {
      this.products.set(list);
      this.loading.set(false);
    });

    this.familiesSvc.getAll().pipe(
      catchError(() => of([])),
      takeUntil(this.destroy$)
    ).subscribe(list => this.families.set(list));
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  openNew(): void  { this.router.navigate(['/products', 'new']); }
  openEdit(p: Product): void { this.router.navigate(['/products', p.id, 'edit']); }

  async toggleActive(p: Product): Promise<void> {
    try {
      await this.svc.toggleActive(p.id, !p.isActive);
      this.notifications.success(p.isActive ? 'Artículo desactivado' : 'Artículo activado');
    } catch { this.notifications.error('Error al cambiar estado'); }
  }

  async delete(p: Product): Promise<void> {
    if (!confirm(`¿Eliminar "${p.name}" (${p.sku})?`)) return;
    try {
      await this.svc.deleteProduct(p.id);
      this.notifications.success('Artículo eliminado');
    } catch { this.notifications.error('Error al eliminar'); }
  }

  isLowStock  = (p: Product) => isLowStock(p);
  isOutOfStock = (p: Product) => isOutOfStock(p);

  stockBadgeColor(p: Product): string {
    if (!p.trackStock || p.noStock) return 'secondary';
    if (isOutOfStock(p))  return 'danger';
    if (isLowStock(p))    return 'warning';
    return 'success';
  }

  trackById(_: number, item: { id: string }): string { return item.id; }
}
