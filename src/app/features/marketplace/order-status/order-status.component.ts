import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule, NgClass } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CatalogOrderService } from '../services/catalog-order.service';
import { CatalogOrder, ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, PAYMENT_METHOD_LABELS } from '../models/catalog-order.interface';

@Component({
  selector: 'app-order-status',
  standalone: true,
  imports: [CommonModule, NgClass, RouterLink],
  templateUrl: './order-status.component.html',
  styleUrl: './order-status.component.scss',
})
export class OrderStatusComponent implements OnInit {
  private route    = inject(ActivatedRoute);
  private orderSvc = inject(CatalogOrderService);

  readonly order   = signal<CatalogOrder | null>(null);
  readonly loading = signal(true);
  readonly notFound = signal(false);

  readonly statusLabels  = ORDER_STATUS_LABELS;
  readonly paymentLabels = PAYMENT_STATUS_LABELS;
  readonly methodLabels  = PAYMENT_METHOD_LABELS;

  slug    = '';
  orderId = '';

  ngOnInit(): void {
    this.slug    = this.route.snapshot.paramMap.get('slug')    ?? '';
    this.orderId = this.route.snapshot.paramMap.get('orderId') ?? '';

    this.orderSvc.getOrderById(this.slug, this.orderId).subscribe({
      next: data => {
        this.loading.set(false);
        if (data) {
          this.order.set(data);
        } else {
          this.notFound.set(true);
        }
      },
      error: () => {
        this.loading.set(false);
        this.notFound.set(true);
      }
    });
  }
}
